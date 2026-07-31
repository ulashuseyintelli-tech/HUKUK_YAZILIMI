import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { canonicalJsonStringify } from '../permission-diagnostics/guided-edge/canonical-json';
import type { EventActor } from '../icrabot/domain-event-ingest/domain-event-ingest.types';
import { CollectionSource, type CreateCollectionDto } from './dto/collection.dto';
import type {
  CollectionCommandProducer,
  CollectionRequestContext,
} from './collection-audit';

export const COLLECTION_COMMAND_FINGERPRINT_VERSION = 'RCV-COL-CMD/v1' as const;

export interface CollectionSemanticCommandEvidence {
  readonly fingerprintVersion: typeof COLLECTION_COMMAND_FINGERPRINT_VERSION;
  readonly commandFingerprint: string;
  readonly commandCanonicalPayload: string;
}

export interface PersistedCollectionCommandEvidence {
  readonly commandFingerprintVersion: string | null;
  readonly commandFingerprint: string | null;
  readonly commandCanonicalPayload: string | null;
}

export type CollectionIdempotencyFailureReason =
  | 'LEGACY_UNVERIFIABLE'
  | 'EVIDENCE_INCOMPLETE'
  | 'FINGERPRINT_VERSION_UNSUPPORTED'
  | 'SEMANTIC_CONFLICT'
  | 'STORED_EVIDENCE_INVALID';

export class CollectionIdempotencyConflictError extends ConflictException {
  readonly reason: CollectionIdempotencyFailureReason;
  readonly existingFingerprint?: string;
  readonly incomingFingerprint: string;
  readonly fingerprintVersion: string;

  constructor(input: {
    reason: CollectionIdempotencyFailureReason;
    incomingFingerprint: string;
    fingerprintVersion: string;
    existingFingerprint?: string | null;
  }) {
    const code = publicConflictCode(input.reason);
    super({
      code,
      message: publicConflictMessage(input.reason),
    });
    this.reason = input.reason;
    this.incomingFingerprint = input.incomingFingerprint;
    this.fingerprintVersion = input.fingerprintVersion;
    if (input.existingFingerprint) {
      this.existingFingerprint = input.existingFingerprint;
    }
  }
}

export function buildCollectionSemanticCommandEvidence(input: {
  readonly tenantId: string;
  readonly dto: CreateCollectionDto;
  readonly actor: EventActor;
  readonly producer: CollectionCommandProducer;
  readonly requestContext?: CollectionRequestContext;
  readonly digest?: (version: string, canonicalPayload: string) => string;
}): CollectionSemanticCommandEvidence {
  const sourceType = input.dto.sourceType ?? CollectionSource.MANUAL;
  const sourceId = normalizeOptionalText(input.dto.sourceId);
  const canonicalPayload = canonicalJsonStringify({
    actorAuthority: canonicalActorAuthority(input.actor),
    allocationIntent: {
      autoAllocate: input.dto.autoAllocate !== false,
      manualAllocations: canonicalAllocations(input.dto.allocations ?? []),
    },
    amount: canonicalMoney(input.dto.amount),
    bankTransactionId:
      sourceType === CollectionSource.BANK_INTEGRATION ? sourceId : null,
    caseDebtorId: normalizeOptionalText(input.dto.caseDebtorId),
    caseId: normalizeRequiredText(input.dto.caseId, 'caseId'),
    channel: String(input.dto.channel ?? 'BANKA'),
    confirmedAtPolicy: 'SERVER_COMMIT_TIME',
    currency: normalizeRequiredText(input.dto.currency ?? 'TRY', 'currency').toUpperCase(),
    effectiveDate: canonicalInstant(input.dto.date, 'date'),
    operation: 'CREATE_COLLECTION_RECEIPT',
    persistedMetadata: {
      accountNoDigest: digestOptionalText('accountNo', input.dto.accountNo),
      bankNameDigest: digestOptionalText('bankName', input.dto.bankName),
      descriptionDigest: digestOptionalText('description', input.dto.description),
      notesDigest: digestOptionalText('notes', input.dto.notes),
      receiptNoDigest: digestOptionalText('receiptNo', input.dto.receiptNo),
    },
    provenance: {
      producer: input.producer,
      sourceId,
      sourceType,
    },
    schemaVersion: COLLECTION_COMMAND_FINGERPRINT_VERSION,
    tenantId: normalizeRequiredText(input.tenantId, 'tenantId'),
    type: String(input.dto.type),
    valueDate: input.dto.valueDate
      ? canonicalInstant(input.dto.valueDate, 'valueDate')
      : null,
  });

  const digest = input.digest ?? domainSeparatedCommandHash;
  return Object.freeze({
    fingerprintVersion: COLLECTION_COMMAND_FINGERPRINT_VERSION,
    commandFingerprint: digest(
      COLLECTION_COMMAND_FINGERPRINT_VERSION,
      canonicalPayload,
    ),
    commandCanonicalPayload: canonicalPayload,
  });
}

export function assertCollectionSemanticReplay(
  persisted: PersistedCollectionCommandEvidence,
  incoming: CollectionSemanticCommandEvidence,
): void {
  const values = [
    persisted.commandFingerprintVersion,
    persisted.commandFingerprint,
    persisted.commandCanonicalPayload,
  ];
  if (values.every((value) => value === null)) {
    throw new CollectionIdempotencyConflictError({
      reason: 'LEGACY_UNVERIFIABLE',
      incomingFingerprint: incoming.commandFingerprint,
      fingerprintVersion: incoming.fingerprintVersion,
    });
  }
  if (values.some((value) => value === null)) {
    throw new CollectionIdempotencyConflictError({
      reason: 'EVIDENCE_INCOMPLETE',
      incomingFingerprint: incoming.commandFingerprint,
      fingerprintVersion: incoming.fingerprintVersion,
      existingFingerprint: persisted.commandFingerprint,
    });
  }
  if (
    persisted.commandFingerprintVersion !==
    COLLECTION_COMMAND_FINGERPRINT_VERSION
  ) {
    throw new CollectionIdempotencyConflictError({
      reason: 'FINGERPRINT_VERSION_UNSUPPORTED',
      incomingFingerprint: incoming.commandFingerprint,
      fingerprintVersion: String(persisted.commandFingerprintVersion),
      existingFingerprint: persisted.commandFingerprint,
    });
  }
  if (
    persisted.commandFingerprint !== incoming.commandFingerprint ||
    persisted.commandCanonicalPayload !== incoming.commandCanonicalPayload
  ) {
    throw new CollectionIdempotencyConflictError({
      reason: 'SEMANTIC_CONFLICT',
      incomingFingerprint: incoming.commandFingerprint,
      fingerprintVersion: incoming.fingerprintVersion,
      existingFingerprint: persisted.commandFingerprint,
    });
  }
  if (
    !/^[0-9a-f]{64}$/.test(persisted.commandFingerprint) ||
    persisted.commandCanonicalPayload.trim().length === 0 ||
    domainSeparatedCommandHash(
      persisted.commandFingerprintVersion,
      persisted.commandCanonicalPayload,
    ) !== persisted.commandFingerprint
  ) {
    throw new CollectionIdempotencyConflictError({
      reason: 'STORED_EVIDENCE_INVALID',
      incomingFingerprint: incoming.commandFingerprint,
      fingerprintVersion: incoming.fingerprintVersion,
      existingFingerprint: persisted.commandFingerprint,
    });
  }
}

export function digestIdempotencyKey(idempotencyKey: string): string {
  return createHash('sha256')
    .update('RCV-COL-IDEM-KEY/v1', 'utf8')
    .update('\0', 'utf8')
    .update(idempotencyKey.normalize('NFC'), 'utf8')
    .digest('hex');
}

export function digestCollectionActorAuthority(actor: EventActor): string {
  return createHash('sha256')
    .update('RCV-COL-ACTOR-AUTHORITY/v1', 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJsonStringify(canonicalActorAuthority(actor)), 'utf8')
    .digest('hex');
}

export function domainSeparatedCommandHash(
  version: string,
  canonicalPayload: string,
): string {
  return createHash('sha256')
    .update(version, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalPayload, 'utf8')
    .digest('hex');
}

function canonicalActorAuthority(actor: EventActor) {
  const authority = 'COLLECTION_RECEIPT_CREATE';
  switch (actor.type) {
    case 'HUMAN':
      return {
        actorClass: 'HUMAN',
        actorRefDigest: digestRequiredText('actorRef', actor.userId),
        authority,
      };
    case 'EXTERNAL':
      return {
        actorClass: 'EXTERNAL',
        actorRefDigest: digestRequiredText(
          'externalSystem',
          actor.externalSystem,
        ),
        authority,
      };
    case 'SYSTEM':
      return {
        actorClass: 'SYSTEM',
        actorRefDigest: digestRequiredText('systemReason', actor.reason),
        authority,
      };
  }
}

function canonicalAllocations(
  allocations: readonly {
    allocationType: string;
    amount: number;
    description?: string;
  }[],
) {
  return allocations
    .map((allocation) => ({
      allocationType: String(allocation.allocationType),
      amount: canonicalMoney(allocation.amount, true),
      descriptionDigest: digestOptionalText(
        'allocationDescription',
        allocation.description,
      ),
    }))
    .sort((left, right) =>
      canonicalJsonStringify(left).localeCompare(canonicalJsonStringify(right)),
    );
}

function canonicalMoney(
  value: Prisma.Decimal | string | number,
  allowZero = false,
): string {
  let decimal: Prisma.Decimal;
  try {
    decimal =
      value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  } catch {
    throw semanticCommandInputError('COLLECTION_COMMAND_AMOUNT_INVALID');
  }
  if (
    !decimal.isFinite() ||
    (allowZero ? decimal.isNegative() : decimal.lessThanOrEqualTo(0)) ||
    decimal.decimalPlaces() > 2 ||
    decimal.abs().greaterThanOrEqualTo('10000000000000')
  ) {
    throw semanticCommandInputError('COLLECTION_COMMAND_AMOUNT_INVALID');
  }
  const minor = decimal.times(100);
  const sign = minor.isNegative() ? '-' : '';
  const digits = minor.abs().toString().padStart(3, '0');
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function canonicalInstant(value: Date | string, field: string): string {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw semanticCommandInputError(
      `COLLECTION_COMMAND_${field.toUpperCase()}_INVALID`,
    );
  }
  return instant.toISOString();
}

function normalizeRequiredText(
  value: string | undefined,
  field: string,
): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw semanticCommandInputError(
      `COLLECTION_COMMAND_${field.toUpperCase()}_REQUIRED`,
    );
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim().normalize('NFC');
  return normalized.length > 0 ? normalized : null;
}

function digestRequiredText(
  field: string,
  value: string | undefined,
): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw semanticCommandInputError(
      `COLLECTION_COMMAND_${field.toUpperCase()}_REQUIRED`,
    );
  }
  return digestNormalizedText(field, normalized);
}

function digestOptionalText(
  field: string,
  value: string | undefined,
): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? digestNormalizedText(field, normalized) : null;
}

function digestNormalizedText(field: string, normalized: string): string {
  return createHash('sha256')
    .update(`${COLLECTION_COMMAND_FINGERPRINT_VERSION}:text:${field}`, 'utf8')
    .update('\0', 'utf8')
    .update(normalized, 'utf8')
    .digest('hex');
}

function semanticCommandInputError(code: string): BadRequestException {
  return new BadRequestException({
    code,
    message: 'Collection semantic command canonicalization başarısız.',
  });
}

function publicConflictCode(
  reason: CollectionIdempotencyFailureReason,
): string {
  switch (reason) {
    case 'LEGACY_UNVERIFIABLE':
      return 'IDEMPOTENCY_LEGACY_UNVERIFIABLE';
    case 'FINGERPRINT_VERSION_UNSUPPORTED':
      return 'IDEMPOTENCY_FINGERPRINT_VERSION_UNSUPPORTED';
    case 'EVIDENCE_INCOMPLETE':
    case 'STORED_EVIDENCE_INVALID':
      return 'IDEMPOTENCY_EVIDENCE_INVALID';
    case 'SEMANTIC_CONFLICT':
      return 'IDEMPOTENCY_SEMANTIC_CONFLICT';
  }
}

function publicConflictMessage(
  reason: CollectionIdempotencyFailureReason,
): string {
  if (reason === 'SEMANTIC_CONFLICT') {
    return 'Aynı idempotencyKey farklı bir tahsilat komutuyla kullanıldı.';
  }
  if (reason === 'LEGACY_UNVERIFIABLE') {
    return 'Mevcut tahsilatın semantik replay kanıtı bulunmuyor.';
  }
  return 'Tahsilat idempotency kanıtı doğrulanamadı.';
}
