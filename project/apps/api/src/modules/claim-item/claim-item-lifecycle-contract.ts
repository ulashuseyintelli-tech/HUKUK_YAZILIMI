import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { ClaimItemStatus, Prisma } from '@prisma/client';
import { type CanonicalWriteEnvelopeV1 } from '../../common/canonical-write-envelope';
import { DomainEventIngestService } from '../icrabot/domain-event-ingest';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';

export const CLAIM_ITEM_LIFECYCLE_STATUSES = [
  ClaimItemStatus.ACTIVE,
  ClaimItemStatus.CANCELLED,
  ClaimItemStatus.WAIVED,
  ClaimItemStatus.COLLECTED,
] as const;

export const CLAIM_ITEM_TERMINAL_STATUSES = [
  ClaimItemStatus.CANCELLED,
  ClaimItemStatus.WAIVED,
  ClaimItemStatus.COLLECTED,
] as const;

export const CLAIM_ITEM_LIFECYCLE_TRANSITIONS = Object.freeze({
  [ClaimItemStatus.ACTIVE]: Object.freeze([
    ClaimItemStatus.CANCELLED,
    ClaimItemStatus.WAIVED,
    ClaimItemStatus.COLLECTED,
  ]),
  [ClaimItemStatus.CANCELLED]: Object.freeze([]),
  [ClaimItemStatus.WAIVED]: Object.freeze([]),
  [ClaimItemStatus.COLLECTED]: Object.freeze([]),
} satisfies Record<ClaimItemStatus, readonly ClaimItemStatus[]>);

export const CLAIM_ITEM_LIFECYCLE_CONFLICT_CODES = [
  'CLAIM_ITEM_STATUS_INVALID',
  'CLAIM_ITEM_LIFECYCLE_TRANSITION_FORBIDDEN',
  'CLAIM_ITEM_TERMINAL_MUTATION_FORBIDDEN',
  'CLAIM_ITEM_HARD_DELETE_FORBIDDEN',
  'CLAIM_ITEM_ROLLBACK_PROVENANCE_MISMATCH',
  'CLAIM_ITEM_LIFECYCLE_CONTINUITY_UNAVAILABLE',
] as const;

export type ClaimItemLifecycleConflictCode =
  (typeof CLAIM_ITEM_LIFECYCLE_CONFLICT_CODES)[number];

export class ClaimItemLifecycleException extends ConflictException {
  constructor(
    readonly conflictCode: ClaimItemLifecycleConflictCode,
    message: string,
  ) {
    super({
      statusCode: 409,
      error: 'ClaimItem Lifecycle Conflict',
      code: conflictCode,
      message,
    });
    this.name = 'ClaimItemLifecycleException';
  }
}

export type ClaimItemLifecycleOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'CANCEL'
  | 'OPERATIONAL_ROLLBACK_DELETE';

export interface ClaimItemLifecycleRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly status: ClaimItemStatus | string;
  readonly metadata?: unknown;
  readonly [key: string]: unknown;
}

export interface AppendClaimItemContinuityInput {
  readonly tx: Prisma.TransactionClient;
  readonly domainEventIngest: DomainEventIngestService | undefined;
  readonly envelope: CanonicalWriteEnvelopeV1<'ClaimItem'>;
  readonly operation: ClaimItemLifecycleOperation;
  readonly before: ClaimItemLifecycleRecord | null;
  readonly after: ClaimItemLifecycleRecord | null;
  readonly auditAction: string;
  readonly auditUserId?: string;
  readonly auditSource: string;
  readonly approvalRequired: boolean;
  readonly retentionDisposition?: 'TOMBSTONE_RETAINED' | 'AUTHORIZED_OPERATIONAL_ROLLBACK';
}

export interface BackfillRollbackCandidate extends ClaimItemLifecycleRecord {
  readonly _count: { readonly ledgerAllocations: number };
}

/**
 * RCV-P2-WS02-P04 canonical lifecycle contract.
 *
 * ACTIVE is the only mutable state. CANCELLED, WAIVED and COLLECTED are retained
 * terminal tombstones. Repeating the exact same status is an idempotent no-op;
 * it does not reopen the aggregate or create a second lifecycle fact.
 */
export function assertClaimItemLifecycleMutation(
  currentStatusInput: unknown,
  patch: Readonly<Record<string, unknown>>,
): { readonly currentStatus: ClaimItemStatus; readonly nextStatus: ClaimItemStatus; readonly noOp: boolean } {
  const currentStatus = parseClaimItemStatus(currentStatusInput);
  const nextStatus = Object.prototype.hasOwnProperty.call(patch, 'status')
    ? parseClaimItemStatus(patch.status)
    : currentStatus;
  const statusOnly = Object.keys(patch).every((key) => key === 'status');

  if (currentStatus === nextStatus) {
    if (currentStatus !== ClaimItemStatus.ACTIVE && !statusOnly) {
      fail(
        'CLAIM_ITEM_TERMINAL_MUTATION_FORBIDDEN',
        `Terminal ClaimItem ${currentStatus} durumunda değiştirilemez.`,
      );
    }
    return { currentStatus, nextStatus, noOp: statusOnly };
  }

  if (!CLAIM_ITEM_LIFECYCLE_TRANSITIONS[currentStatus].includes(nextStatus as never)) {
    fail(
      'CLAIM_ITEM_LIFECYCLE_TRANSITION_FORBIDDEN',
      `ClaimItem lifecycle geçişi yasak: ${currentStatus} -> ${nextStatus}.`,
    );
  }

  return { currentStatus, nextStatus, noOp: false };
}

export function assertClaimItemCreateStatus(statusInput: unknown): typeof ClaimItemStatus.ACTIVE {
  const status = statusInput === undefined
    ? ClaimItemStatus.ACTIVE
    : parseClaimItemStatus(statusInput);
  if (status !== ClaimItemStatus.ACTIVE) {
    fail(
      'CLAIM_ITEM_LIFECYCLE_TRANSITION_FORBIDDEN',
      `Yeni ClaimItem yalnız ACTIVE başlayabilir; istenen durum: ${status}.`,
    );
  }
  return ClaimItemStatus.ACTIVE;
}

export function assertClaimItemHardDeleteForbidden(): never {
  return fail(
    'CLAIM_ITEM_HARD_DELETE_FORBIDDEN',
    'ClaimItem fiziksel silme yalnız doğrulanmış backfill operational rollback sınırında mümkündür.',
  );
}

export function assertBackfillRollbackCandidate(
  candidate: BackfillRollbackCandidate,
  runId: string,
): void {
  if (candidate._count.ledgerAllocations > 0) {
    fail(
      'CLAIM_ITEM_HARD_DELETE_FORBIDDEN',
      'Ledger allocation taşıyan ClaimItem operational rollback ile silinemez.',
    );
  }

  const metadata = asRecord(candidate.metadata);
  const backfill = asRecord(metadata?.backfill);
  const provenance = asRecord(metadata?.canonicalSourceProvenance);
  const provenanceBody = asRecord(provenance?.provenance);
  const authority = asRecord(provenance?.createdByAuthority);
  const sourceIdentity = asRecord(provenance?.sourceIdentity);
  const marker = asRecord(metadata?.canonicalWriterSource);

  const exactBackfillBinding =
    backfill?.runId === runId &&
    typeof backfill.sourceDueId === 'string' &&
    provenanceBody?.ingress === 'BACKFILL' &&
    authority?.actorType === 'SYSTEM' &&
    authority?.actorRef === 'system:DUE_BACKFILL' &&
    sourceIdentity?.tenantId === candidate.tenantId &&
    sourceIdentity?.caseId === candidate.caseId &&
    sourceIdentity?.sourceId === backfill.sourceDueId &&
    marker?.authority === 'DUE_BACKFILL' &&
    marker?.sourceId === backfill.sourceDueId;

  if (!exactBackfillBinding) {
    fail(
      'CLAIM_ITEM_ROLLBACK_PROVENANCE_MISMATCH',
      'ClaimItem doğrulanmış DUE_BACKFILL provenance zincirine bağlı değil.',
    );
  }
}

/**
 * Appends the immutable actor audit and the Case-scoped domain event/outbox in
 * the same transaction as the ClaimItem mutation. A missing event boundary is
 * fail-closed; audit-only or best-effort completion is not accepted.
 */
export async function appendClaimItemContinuity(
  input: AppendClaimItemContinuityInput,
): Promise<void> {
  if (!input.domainEventIngest) {
    throw new InternalServerErrorException({
      statusCode: 500,
      error: 'ClaimItem Lifecycle Continuity Unavailable',
      code: 'CLAIM_ITEM_LIFECYCLE_CONTINUITY_UNAVAILABLE',
      message: 'ClaimItem audit/event continuity boundary is unavailable.',
    });
  }

  const record = input.after ?? input.before;
  if (!record) {
    throw new TypeError('ClaimItem lifecycle continuity requires before or after record.');
  }
  if (
    record.tenantId !== input.envelope.tenantId ||
    record.caseId !== input.envelope.caseId
  ) {
    fail(
      'CLAIM_ITEM_LIFECYCLE_CONTINUITY_UNAVAILABLE',
      'ClaimItem continuity envelope tenant/case scope ile uyuşmuyor.',
    );
  }

  const beforeStatus = input.before ? parseClaimItemStatus(input.before.status) : null;
  const afterStatus = input.after ? parseClaimItemStatus(input.after.status) : null;
  const eventType = lifecycleEventType(input.operation, afterStatus);
  const oldValues = immutableAuditSnapshot(input.before);
  const newValues = immutableAuditSnapshot(input.after);
  const actorRef = actorReference(input.envelope);

  await input.tx.auditLog.create({
    data: {
      tenantId: input.envelope.tenantId,
      action: input.auditAction,
      entityType: 'ClaimItem',
      entityId: record.id,
      userId: input.auditUserId,
      oldValues: oldValues as Prisma.InputJsonValue,
      newValues: newValues as Prisma.InputJsonValue,
      description: 'ClaimItem lifecycle continuity audit',
      metadata: {
        caseId: input.envelope.caseId,
        claimItemId: record.id,
        operation: input.operation,
        source: input.auditSource,
        sourceType: input.envelope.source.sourceType,
        sourceId: input.envelope.source.sourceId ?? null,
        actorType: input.envelope.actor.type,
        actorRef,
        policyRef: input.envelope.authority.policyRef ?? null,
        approvalRequestId: input.envelope.authority.approvalRequestId ?? null,
        commandId: input.envelope.commandId,
        correlationId: input.envelope.correlationId,
        causationId: input.envelope.causationId ?? null,
        idempotencyKey: input.envelope.idempotencyKey,
        approvalRequired: input.approvalRequired,
        retentionDisposition:
          input.retentionDisposition ??
          (afterStatus && CLAIM_ITEM_TERMINAL_STATUSES.includes(afterStatus as never)
            ? 'TOMBSTONE_RETAINED'
            : null),
      },
    },
  });

  await input.domainEventIngest.appendInTransaction(input.tx, {
    header: {
      eventId: input.envelope.commandId,
      aggregateType: 'Case',
      aggregateId: input.envelope.caseId,
      eventType,
      occurredAt: input.envelope.occurredAt,
      occurredAtConfidence: 'SYSTEM_VERIFIED',
      actor: domainEventActor(input.envelope),
      correlationId: input.envelope.correlationId,
      commandId: input.envelope.commandId,
      causationId: input.envelope.causationId,
      tenantId: input.envelope.tenantId,
    },
    payload: {
      claimItemId: record.id,
      operation: input.operation,
      previousStatus: beforeStatus,
      status: afterStatus,
      sourceType: input.envelope.source.sourceType,
      sourceId: input.envelope.source.sourceId ?? null,
      authorityRef:
        input.envelope.authority.policyRef ??
        input.envelope.authority.legalBasisRef ??
        null,
      approvalRequestId: input.envelope.authority.approvalRequestId ?? null,
      retentionDisposition: input.retentionDisposition ?? null,
      auditAction: input.auditAction,
    },
  });
}

function lifecycleEventType(
  operation: ClaimItemLifecycleOperation,
  afterStatus: ClaimItemStatus | null,
): string {
  if (operation === 'CREATE') return 'CLAIM_ITEM_CREATED';
  if (operation === 'OPERATIONAL_ROLLBACK_DELETE') return 'CLAIM_ITEM_ROLLED_BACK';
  if (afterStatus === ClaimItemStatus.CANCELLED) return 'CLAIM_ITEM_CANCELLED';
  if (afterStatus === ClaimItemStatus.WAIVED) return 'CLAIM_ITEM_WAIVED';
  if (afterStatus === ClaimItemStatus.COLLECTED) return 'CLAIM_ITEM_COLLECTED';
  return 'CLAIM_ITEM_UPDATED';
}

function immutableAuditSnapshot(record: ClaimItemLifecycleRecord | null): Prisma.JsonObject {
  if (!record) return {};
  return {
    id: record.id,
    tenantId: record.tenantId,
    caseId: record.caseId,
    status: parseClaimItemStatus(record.status),
    recordHash: stableJsonHash(toSerializableRecord(record)),
  };
}

function toSerializableRecord(record: ClaimItemLifecycleRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}

function actorReference(envelope: CanonicalWriteEnvelopeV1<'ClaimItem'>): string {
  switch (envelope.actor.type) {
    case 'HUMAN':
      return `user:${envelope.actor.userId}`;
    case 'SYSTEM':
      return `system:${envelope.actor.system}`;
    case 'EXTERNAL':
      return `external:${envelope.actor.externalSystem}`;
  }
}

function domainEventActor(envelope: CanonicalWriteEnvelopeV1<'ClaimItem'>) {
  switch (envelope.actor.type) {
    case 'HUMAN':
      return { type: 'HUMAN' as const, userId: envelope.actor.userId };
    case 'SYSTEM':
      return { type: 'SYSTEM' as const, reason: envelope.actor.system };
    case 'EXTERNAL':
      return {
        type: 'EXTERNAL' as const,
        externalSystem: envelope.actor.externalSystem,
      };
  }
}

function parseClaimItemStatus(value: unknown): ClaimItemStatus {
  if (!CLAIM_ITEM_LIFECYCLE_STATUSES.includes(value as never)) {
    return fail(
      'CLAIM_ITEM_STATUS_INVALID',
      `Bilinmeyen ClaimItem lifecycle durumu: ${String(value)}.`,
    );
  }
  return value as ClaimItemStatus;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fail(code: ClaimItemLifecycleConflictCode, message: string): never {
  throw new ClaimItemLifecycleException(code, message);
}
