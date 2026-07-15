import { ConflictException } from '@nestjs/common';
import { type CanonicalWriteEnvelopeV1 } from '../../common/canonical-write-envelope';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import {
  buildClaimItemSourceProvenanceV1,
  claimItemIngressForSystemRoute,
  CLAIM_ITEM_SOURCE_PROVENANCE_METADATA_KEY,
  type ClaimItemSourceProvenanceV1,
} from './claim-item-source-provenance';
import {
  CLAIM_ITEM_SYSTEM_WRITER_ROUTES,
  type ClaimItemSystemWriterRoute,
} from './claim-item-writer-routes';

export const CLAIM_ITEM_SOURCE_INTEGRITY_CONFLICT_CODES = [
  'SOURCE_SCOPE_MISMATCH',
  'SOURCE_PAYLOAD_MISMATCH',
  'SOURCE_SLOT_INVALID',
  'SOURCE_MARKER_RESERVED',
  'DUPLICATE_SOURCE_IDENTITY',
  'SOURCE_PAYLOAD_CONFLICT',
  'SOURCE_BINDING_MISMATCH',
  'DUE_BRIDGE_MARKER_MISSING',
  'DUE_BRIDGE_MULTIPLE_LIVE_MARKERS',
] as const;

export type ClaimItemSourceIntegrityConflictCode =
  (typeof CLAIM_ITEM_SOURCE_INTEGRITY_CONFLICT_CODES)[number];

export class ClaimItemSourceIntegrityException extends ConflictException {
  constructor(
    readonly conflictCode: ClaimItemSourceIntegrityConflictCode,
    message: string,
  ) {
    super({
      statusCode: 409,
      error: 'ClaimItem Source Integrity Conflict',
      code: conflictCode,
      message,
    });
    this.name = 'ClaimItemSourceIntegrityException';
  }
}

export interface ClaimItemSystemSourceCreateInput {
  readonly route: ClaimItemSystemWriterRoute;
  readonly tenantId: string;
  readonly caseId: string;
  readonly sourceId: string;
  readonly sourceSlot?: string;
  readonly data: Record<string, unknown>;
  readonly envelope: CanonicalWriteEnvelopeV1<'ClaimItem'>;
}

export interface ClaimItemSystemSourceMutationInput {
  readonly route: ClaimItemSystemWriterRoute;
  readonly tenantId: string;
  readonly caseId: string;
  readonly sourceId: string;
  readonly sourceSlot?: string;
  readonly claimItemId: string;
}

export interface ClaimItemHumanDocumentCreateInput {
  readonly tenantId: string;
  readonly caseId: string;
  readonly data: Record<string, unknown>;
  readonly envelope: CanonicalWriteEnvelopeV1<'ClaimItem'>;
}

export interface ClaimItemBackfillSourceCreateInput {
  readonly tenantId: string;
  readonly caseId: string;
  readonly sourceId: string;
  readonly sourceSlot?: string;
  readonly data: Record<string, unknown>;
  readonly envelope: CanonicalWriteEnvelopeV1<'ClaimItem'>;
}

type ClaimItemSourceAuthority =
  | ClaimItemSystemWriterRoute
  | 'HUMAN_DOCUMENT'
  | 'DUE_BACKFILL';

interface ClaimItemSourceContext {
  readonly authority: ClaimItemSourceAuthority;
  readonly sourceType: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly sourceId: string;
  readonly sourceSlot: string;
  readonly identityHash: string;
}

interface ClaimItemSourceMarker {
  readonly version: 1;
  readonly authority: ClaimItemSourceAuthority;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceSlot: string;
  readonly identityHash: string;
  readonly payloadHash: string;
}

interface ValidatedSourceRecord {
  readonly precautionaryOrderId?: string;
  readonly linkedClaimItemId?: string | null;
}

const SOURCE_MARKER_KEY = 'canonicalWriterSource';
const DEFAULT_SOURCE_SLOT = 'PRIMARY';
const OPAQUE_SOURCE_SLOT = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

/**
 * RCV-P2-WS01-P04 application-level source integrity boundary.
 *
 * The transaction-scoped PostgreSQL advisory lock serializes the same canonical
 * tenant/case/source/slot across app instances. The persisted JSON marker makes
 * retries and changed-payload conflicts deterministic without a schema change.
 * This is deliberately not represented as a structural DB unique constraint:
 * raw SQL and test materializers remain outside this guard and require their own
 * authorization. The already-authorized Due backfill enters through the dedicated
 * `prepareBackfillCreate` boundary; it is not promoted to a runtime writer route.
 */
export class ClaimItemSourceIntegrityGuard {
  async prepareSystemCreate(
    input: ClaimItemSystemSourceCreateInput,
    database: any,
  ): Promise<Record<string, unknown>> {
    this.assertPayloadScope(input.tenantId, input.caseId, input.data);
    const context = this.systemContext(input);
    const provenance = buildClaimItemSourceProvenanceV1({
      ingress: claimItemIngressForSystemRoute(input.route),
      envelope: input.envelope,
      sourceSlot: context.sourceSlot,
    });
    this.assertProvenanceScope(context, provenance);
    await this.lockCreate(context, input.data, provenance, database);
    const sourceRecord = await this.validateSourceRecord(context, database);
    this.assertSystemPayloadBinding(context, input.data, sourceRecord);
    const payloadHash = this.payloadHash(input.data);
    await this.assertCreateConflictFree(context, input.data, payloadHash, sourceRecord, database);
    return this.withMarker(
      input.data,
      this.marker(context, payloadHash),
      provenance,
    );
  }

  async prepareBackfillCreate(
    input: ClaimItemBackfillSourceCreateInput,
    database: any,
  ): Promise<Record<string, unknown>> {
    this.assertPayloadScope(input.tenantId, input.caseId, input.data);
    const context = this.context({
      authority: 'DUE_BACKFILL',
      sourceType: 'DUE_BACKFILL',
      tenantId: input.tenantId,
      caseId: input.caseId,
      sourceId: input.sourceId,
      sourceSlot: this.normalizeSourceSlot(input.sourceSlot ?? DEFAULT_SOURCE_SLOT),
    });
    const provenance = buildClaimItemSourceProvenanceV1({
      ingress: 'BACKFILL',
      envelope: input.envelope,
      sourceSlot: context.sourceSlot,
    });
    this.assertProvenanceScope(context, provenance);
    await this.lockCreate(context, input.data, provenance, database);
    const sourceRecord = await this.validateSourceRecord(context, database);
    this.assertSystemPayloadBinding(context, input.data, sourceRecord);
    const payloadHash = this.payloadHash(input.data);
    await this.assertCreateConflictFree(
      context,
      input.data,
      payloadHash,
      sourceRecord,
      database,
    );
    return this.withMarker(
      input.data,
      this.marker(context, payloadHash),
      provenance,
    );
  }

  async prepareHumanDocumentCreate(
    input: ClaimItemHumanDocumentCreateInput,
    database: any,
  ): Promise<Record<string, unknown>> {
    const sourceDocumentId = input.data.sourceDocumentId;
    if (sourceDocumentId === undefined || sourceDocumentId === null) return input.data;
    if (typeof sourceDocumentId !== 'string' || sourceDocumentId.length === 0) {
      this.fail('SOURCE_PAYLOAD_MISMATCH', 'ClaimItem document source id is invalid.');
    }

    this.assertPayloadScope(input.tenantId, input.caseId, input.data);
    const sourceSlot = this.normalizeSourceSlot(
      `${String(input.data.sourceDocumentType ?? 'UNSPECIFIED')}:${String(input.data.itemType ?? 'UNSPECIFIED')}`,
    );
    const context = this.context({
      authority: 'HUMAN_DOCUMENT',
      sourceType: 'USER_DOCUMENT',
      tenantId: input.tenantId,
      caseId: input.caseId,
      sourceId: sourceDocumentId,
      sourceSlot,
    });
    const provenance = buildClaimItemSourceProvenanceV1({
      ingress: 'CASE_DOCUMENT',
      envelope: input.envelope,
      sourceSlot,
    });
    this.assertProvenanceScope(context, provenance);
    await this.lockCreate(context, input.data, provenance, database);
    await this.validateSourceRecord(context, database);
    const payloadHash = this.payloadHash(input.data);
    await this.assertCreateConflictFree(context, input.data, payloadHash, {}, database);
    return this.withMarker(
      input.data,
      this.marker(context, payloadHash),
      provenance,
    );
  }

  async assertSystemMutation(
    input: ClaimItemSystemSourceMutationInput,
    database: any,
  ): Promise<void> {
    const context = this.systemContext(input);
    await this.lockIdentity(context.identityHash, database);
    const sourceRecord = await this.validateSourceRecord(context, database);
    const claimItem = await database.claimItem.findFirst({
      where: {
        id: input.claimItemId,
        tenantId: input.tenantId,
        caseId: input.caseId,
      },
      select: {
        id: true,
        metadata: true,
        instrumentId: true,
        sourceDocumentId: true,
        sourceProcess: true,
        sourceProcessId: true,
      },
    });
    if (!claimItem) {
      this.fail('SOURCE_BINDING_MISMATCH', 'ClaimItem is not in the canonical source scope.');
    }

    const marker = this.readMarker(claimItem.metadata);
    if (marker && marker.identityHash !== context.identityHash) {
      this.fail('SOURCE_BINDING_MISMATCH', 'ClaimItem is bound to another canonical source identity.');
    }

    switch (input.route) {
      case 'DUE_BRIDGE':
        if (this.readDueSourceId(claimItem.metadata) !== input.sourceId) {
          this.fail('SOURCE_BINDING_MISMATCH', 'ClaimItem is not bound to the requested Due source.');
        }
        return;
      case 'CASE_INSTRUMENT_GENERATOR':
        if (claimItem.instrumentId !== input.sourceId) {
          this.fail('SOURCE_BINDING_MISMATCH', 'ClaimItem is not bound to the requested instrument source.');
        }
        return;
      case 'DOCUMENT_AUTO_GENERATOR':
        if (claimItem.sourceDocumentId !== input.sourceId) {
          this.fail('SOURCE_BINDING_MISMATCH', 'ClaimItem is not bound to the requested document source.');
        }
        return;
      case 'PRECAUTIONARY_COST_WRITER':
        if (
          claimItem.sourceProcess !== 'PRECAUTIONARY' ||
          claimItem.sourceProcessId !== sourceRecord.precautionaryOrderId ||
          (sourceRecord.linkedClaimItemId != null &&
            sourceRecord.linkedClaimItemId !== input.claimItemId)
        ) {
          this.fail('SOURCE_BINDING_MISMATCH', 'ClaimItem is not bound to the requested precautionary source.');
        }
        return;
      case 'RULE_ENGINE_GENERATOR':
        if (!marker) {
          this.fail('SOURCE_BINDING_MISMATCH', 'Rule-generated ClaimItem has no canonical source marker.');
        }
        return;
    }
  }

  private systemContext(
    input: Pick<
      ClaimItemSystemSourceCreateInput,
      'route' | 'tenantId' | 'caseId' | 'sourceId' | 'sourceSlot'
    >,
  ): ClaimItemSourceContext {
    const route = CLAIM_ITEM_SYSTEM_WRITER_ROUTES[input.route];
    return this.context({
      authority: input.route,
      sourceType: route.sourceType,
      tenantId: input.tenantId,
      caseId: input.caseId,
      sourceId: input.sourceId,
      sourceSlot: this.normalizeSourceSlot(input.sourceSlot ?? DEFAULT_SOURCE_SLOT),
    });
  }

  private context(
    input: Omit<ClaimItemSourceContext, 'identityHash'>,
  ): ClaimItemSourceContext {
    const identityHash = stableJsonHash({
      version: 1,
      authority: input.authority,
      sourceType: input.sourceType,
      tenantId: input.tenantId,
      caseId: input.caseId,
      sourceId: input.sourceId,
      sourceSlot: input.sourceSlot,
    });
    return Object.freeze({ ...input, identityHash });
  }

  private normalizeSourceSlot(value: string): string {
    if (!OPAQUE_SOURCE_SLOT.test(value)) {
      this.fail('SOURCE_SLOT_INVALID', 'ClaimItem source slot must be a bounded opaque reference.');
    }
    return value;
  }

  private assertPayloadScope(
    tenantId: string,
    caseId: string,
    data: Record<string, unknown>,
  ): void {
    if (data.tenantId !== tenantId || data.caseId !== caseId) {
      this.fail('SOURCE_PAYLOAD_MISMATCH', 'ClaimItem payload tenant/case scope does not match the command.');
    }
  }

  private async lockCreate(
    context: ClaimItemSourceContext,
    data: Record<string, unknown>,
    provenance: ClaimItemSourceProvenanceV1,
    database: any,
  ): Promise<void> {
    const collisionHash = context.authority === 'DUE_BRIDGE' ||
      context.authority === 'DUE_BACKFILL'
      ? provenance.sourceIdentity.identityHash
      : context.authority === 'DOCUMENT_AUTO_GENERATOR' ||
          context.authority === 'HUMAN_DOCUMENT'
        ? stableJsonHash({
            version: 1,
            sourceType: 'CASE_DOCUMENT',
            tenantId: context.tenantId,
            caseId: context.caseId,
            sourceId: context.sourceId,
            itemType: data.itemType,
          })
        : context.identityHash;
    await this.lockIdentity(collisionHash, database);
  }

  private async lockIdentity(identityHash: string, database: any): Promise<void> {
    const lockKey = `claim-item-source:${identityHash}`;
    await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }

  private async validateSourceRecord(
    context: ClaimItemSourceContext,
    database: any,
  ): Promise<ValidatedSourceRecord> {
    switch (context.authority) {
      case 'DUE_BRIDGE':
      case 'DUE_BACKFILL': {
        const due = await database.due.findFirst({
          where: { id: context.sourceId, caseId: context.caseId },
          select: { id: true },
        });
        if (!due) this.sourceScopeMismatch();
        return {};
      }
      case 'CASE_INSTRUMENT_GENERATOR': {
        const instrument = await database.caseInstrument.findFirst({
          where: {
            id: context.sourceId,
            tenantId: context.tenantId,
            caseId: context.caseId,
          },
          select: { id: true },
        });
        if (!instrument) this.sourceScopeMismatch();
        return {};
      }
      case 'DOCUMENT_AUTO_GENERATOR':
      case 'HUMAN_DOCUMENT': {
        const document = await database.caseDocument.findFirst({
          where: { id: context.sourceId, caseId: context.caseId },
          select: { id: true },
        });
        if (!document) this.sourceScopeMismatch();
        return {};
      }
      case 'RULE_ENGINE_GENERATOR': {
        if (context.sourceId !== context.caseId) this.sourceScopeMismatch();
        const caseRecord = await database.case.findFirst({
          where: { id: context.caseId, tenantId: context.tenantId },
          select: { id: true },
        });
        if (!caseRecord) this.sourceScopeMismatch();
        return {};
      }
      case 'PRECAUTIONARY_COST_WRITER': {
        const cost = await database.precautionaryCost.findFirst({
          where: { id: context.sourceId, tenantId: context.tenantId },
          select: {
            id: true,
            claimItemId: true,
            precautionaryOrder: {
              select: { id: true, tenantId: true, caseId: true },
            },
          },
        });
        if (
          !cost ||
          cost.precautionaryOrder.tenantId !== context.tenantId ||
          cost.precautionaryOrder.caseId !== context.caseId
        ) {
          this.sourceScopeMismatch();
        }
        return {
          precautionaryOrderId: cost.precautionaryOrder.id,
          linkedClaimItemId: cost.claimItemId,
        };
      }
    }
  }

  private assertSystemPayloadBinding(
    context: ClaimItemSourceContext,
    data: Record<string, unknown>,
    sourceRecord: ValidatedSourceRecord,
  ): void {
    switch (context.authority) {
      case 'DUE_BRIDGE':
        if (this.readDueSourceId(data.metadata) !== context.sourceId) {
          this.payloadMismatch('Due');
        }
        return;
      case 'DUE_BACKFILL':
        if (this.readBackfillSourceId(data.metadata) !== context.sourceId) {
          this.payloadMismatch('backfill Due');
        }
        return;
      case 'CASE_INSTRUMENT_GENERATOR':
        if (data.instrumentId !== context.sourceId) this.payloadMismatch('instrument');
        return;
      case 'DOCUMENT_AUTO_GENERATOR':
        if (data.sourceDocumentId !== context.sourceId) this.payloadMismatch('document');
        return;
      case 'RULE_ENGINE_GENERATOR':
        if (context.sourceId !== context.caseId) this.payloadMismatch('rule');
        return;
      case 'PRECAUTIONARY_COST_WRITER':
        if (
          data.sourceProcess !== 'PRECAUTIONARY' ||
          data.sourceProcessId !== sourceRecord.precautionaryOrderId
        ) {
          this.payloadMismatch('precautionary');
        }
        return;
      case 'HUMAN_DOCUMENT':
        return;
    }
  }

  private async assertCreateConflictFree(
    context: ClaimItemSourceContext,
    data: Record<string, unknown>,
    payloadHash: string,
    sourceRecord: ValidatedSourceRecord,
    database: any,
  ): Promise<void> {
    const dueSourceMarkers = context.authority === 'DUE_BRIDGE' ||
      context.authority === 'DUE_BACKFILL'
      ? await database.claimItem.findMany({
          where: {
            tenantId: context.tenantId,
            caseId: context.caseId,
            OR: [
              {
                metadata: {
                  path: ['dueSync', 'sourceDueId'],
                  equals: context.sourceId,
                },
              },
              {
                metadata: {
                  path: ['backfill', 'sourceDueId'],
                  equals: context.sourceId,
                },
              },
            ],
          },
          select: { id: true },
          take: 2,
        })
      : null;
    if (dueSourceMarkers && dueSourceMarkers.length > 1) {
      this.fail(
        'DUE_BRIDGE_MULTIPLE_LIVE_MARKERS',
        'Due source identity is bound to multiple live ClaimItem markers.',
      );
    }

    const canonical = await database.claimItem.findFirst({
      where: {
        tenantId: context.tenantId,
        caseId: context.caseId,
        metadata: {
          path: [SOURCE_MARKER_KEY, 'identityHash'],
          equals: context.identityHash,
        },
      },
      select: { id: true, metadata: true },
    });
    if (canonical) {
      const marker = this.readMarker(canonical.metadata);
      if (!marker) {
        this.fail('SOURCE_MARKER_RESERVED', 'Existing ClaimItem source marker is malformed.');
      }
      if (marker.payloadHash !== payloadHash) {
        this.fail('SOURCE_PAYLOAD_CONFLICT', 'Canonical source identity already exists with another payload.');
      }
      this.duplicate();
    }

    if (dueSourceMarkers?.length === 1) this.duplicate();

    const legacy = await this.findLegacyConflict(context, data, sourceRecord, database);
    if (legacy) this.duplicate();
  }

  private async findLegacyConflict(
    context: ClaimItemSourceContext,
    data: Record<string, unknown>,
    sourceRecord: ValidatedSourceRecord,
    database: any,
  ): Promise<unknown> {
    switch (context.authority) {
      case 'DUE_BRIDGE':
      case 'DUE_BACKFILL':
        // Due markers are counted under the same advisory lock before the
        // canonical marker check, so multiplicity cannot be hidden by findFirst.
        return null;
      case 'CASE_INSTRUMENT_GENERATOR':
        return database.claimItem.findFirst({
          where: {
            tenantId: context.tenantId,
            caseId: context.caseId,
            instrumentId: context.sourceId,
          },
          select: { id: true },
        });
      case 'DOCUMENT_AUTO_GENERATOR':
      case 'HUMAN_DOCUMENT':
        return database.claimItem.findFirst({
          where: {
            tenantId: context.tenantId,
            caseId: context.caseId,
            sourceDocumentId: context.sourceId,
            itemType: data.itemType,
          },
          select: { id: true },
        });
      case 'PRECAUTIONARY_COST_WRITER':
        return sourceRecord.linkedClaimItemId == null
          ? null
          : { id: sourceRecord.linkedClaimItemId };
      case 'RULE_ENGINE_GENERATOR':
        // Older rule-generated rows have no reliable source marker. Heuristic
        // matching is deliberately forbidden; only P04+ markers are guarded.
        return null;
    }
  }

  private marker(
    context: ClaimItemSourceContext,
    payloadHash: string,
  ): ClaimItemSourceMarker {
    return Object.freeze({
      version: 1,
      authority: context.authority,
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      sourceSlot: context.sourceSlot,
      identityHash: context.identityHash,
      payloadHash,
    });
  }

  private assertProvenanceScope(
    context: ClaimItemSourceContext,
    provenance: ClaimItemSourceProvenanceV1,
  ): void {
    const identity = provenance.sourceIdentity;
    if (
      identity.tenantId !== context.tenantId ||
      identity.caseId !== context.caseId ||
      identity.sourceId !== context.sourceId ||
      identity.sourceSlot !== context.sourceSlot
    ) {
      this.fail(
        'SOURCE_BINDING_MISMATCH',
        'ClaimItem provenance does not match the guarded source identity.',
      );
    }
  }

  private withMarker(
    data: Record<string, unknown>,
    marker: ClaimItemSourceMarker,
    provenance: ClaimItemSourceProvenanceV1,
  ): Record<string, unknown> {
    const metadata = data.metadata;
    if (metadata != null && !this.isPlainRecord(metadata)) {
      this.fail('SOURCE_MARKER_RESERVED', 'ClaimItem metadata cannot carry canonical source provenance.');
    }
    const record = (metadata ?? {}) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, SOURCE_MARKER_KEY)) {
      this.fail('SOURCE_MARKER_RESERVED', 'ClaimItem canonical source marker is router-owned.');
    }
    if (Object.prototype.hasOwnProperty.call(record, CLAIM_ITEM_SOURCE_PROVENANCE_METADATA_KEY)) {
      this.fail('SOURCE_MARKER_RESERVED', 'ClaimItem canonical source provenance is router-owned.');
    }
    return {
      ...data,
      metadata: {
        ...record,
        [SOURCE_MARKER_KEY]: marker,
        [CLAIM_ITEM_SOURCE_PROVENANCE_METADATA_KEY]: provenance,
      },
    };
  }

  private payloadHash(data: Record<string, unknown>): string {
    const serializable = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    // Rule-engine calculatedAt is write-time audit metadata, not source identity
    // content. Retries must remain DUPLICATE rather than payload conflicts solely
    // because the application clock advanced between equivalent generations.
    delete serializable.calculatedAt;
    const metadata = serializable.metadata;
    if (this.isPlainRecord(metadata) && this.isPlainRecord(metadata.backfill)) {
      // Backfill run/time identify the execution attempt, not the canonical Due
      // payload. Equivalent retries across runs must remain DUPLICATE.
      delete metadata.backfill.runId;
      delete metadata.backfill.at;
    }
    return stableJsonHash(serializable);
  }

  private readDueSourceId(metadata: unknown): string | undefined {
    if (!this.isPlainRecord(metadata)) return undefined;
    const dueSync = metadata.dueSync;
    if (!this.isPlainRecord(dueSync)) return undefined;
    return typeof dueSync.sourceDueId === 'string' ? dueSync.sourceDueId : undefined;
  }

  private readBackfillSourceId(metadata: unknown): string | undefined {
    if (!this.isPlainRecord(metadata)) return undefined;
    const backfill = metadata.backfill;
    if (!this.isPlainRecord(backfill)) return undefined;
    return typeof backfill.sourceDueId === 'string'
      ? backfill.sourceDueId
      : undefined;
  }

  private readMarker(metadata: unknown): ClaimItemSourceMarker | null {
    if (!this.isPlainRecord(metadata)) return null;
    const value = metadata[SOURCE_MARKER_KEY];
    if (!this.isPlainRecord(value)) return null;
    if (
      value.version !== 1 ||
      typeof value.authority !== 'string' ||
      typeof value.sourceType !== 'string' ||
      typeof value.sourceId !== 'string' ||
      typeof value.sourceSlot !== 'string' ||
      typeof value.identityHash !== 'string' ||
      typeof value.payloadHash !== 'string'
    ) {
      return null;
    }
    return value as unknown as ClaimItemSourceMarker;
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  private sourceScopeMismatch(): never {
    this.fail('SOURCE_SCOPE_MISMATCH', 'ClaimItem source is not in the trusted tenant/case scope.');
  }

  private payloadMismatch(source: string): never {
    this.fail('SOURCE_PAYLOAD_MISMATCH', `ClaimItem payload does not bind the ${source} source identity.`);
  }

  private duplicate(): never {
    this.fail('DUPLICATE_SOURCE_IDENTITY', 'ClaimItem source identity already has a persisted ClaimItem.');
  }

  private fail(code: ClaimItemSourceIntegrityConflictCode, message: string): never {
    throw new ClaimItemSourceIntegrityException(code, message);
  }
}
