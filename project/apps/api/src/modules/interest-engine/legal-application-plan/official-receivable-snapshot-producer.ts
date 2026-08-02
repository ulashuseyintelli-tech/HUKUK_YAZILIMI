import {
  LEGAL_APPLICATION_COMPONENT_RANKS,
  LEGAL_APPLICATION_COMPONENT_TYPES,
  type CanonicalSnapshotEnvelopeV1,
  type LegalApplicationComponentType,
} from './contracts';
import {
  computeBucketContextKey,
  computeSourceVersionSetHash,
  sortSourceVersionSet,
} from './canonical-snapshot-identity';
import {
  BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
  produceBucketInstanceId,
} from './bucket-instance-identity';
import {
  canonicalSnapshotRefForHash,
  computeCanonicalSnapshotHash,
  serializeCanonicalJson,
} from './canonical-snapshot-serializer';
import { validateCanonicalSnapshot } from './canonical-snapshot-validator';
import {
  POSTGRES_BIGINT_MAX,
  POSTGRES_INTEGER_MAX,
  SNAPSHOT_CONTRACT_VERSION,
  SNAPSHOT_SERIALIZATION_VERSION,
  CANONICAL_CURRENCY_CODES,
} from './primitives';
import type { StrictJsonObject, StrictJsonValue } from './strict-json-parser';

export const OFFICIAL_SNAPSHOT_READ_CONTRACT_VERSION = 'RCV-CAS-READ/v1' as const;

const CONTROL_OR_UNPAIRED_SURROGATE = /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u;
const UNSIGNED_DECIMAL_INTEGER = /^(0|[1-9][0-9]*)$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const OFFICIAL_SNAPSHOT_PRODUCER_ERROR_CODES = [
  'SNAPSHOT_UNAVAILABLE',
  'SNAPSHOT_READ_CONTRACT_UNSUPPORTED',
  'SOURCE_CONCURRENCY_UNSAFE',
  'TENANT_CONTEXT_MISMATCH',
  'CASE_CONTEXT_MISMATCH',
  'TARGET_COLLECTION_INVALID',
  'SOURCE_VERSION_INCOMPLETE',
  'FORMATION_CONTEXT_INCOMPLETE',
  'HISTORY_BOUNDARY_UNAUTHORIZED',
  'CURRENCY_OR_MINOR_UNIT_INVALID',
  'RECEIPT_AMOUNT_INVALID',
  'AMOUNT_OUT_OF_RANGE',
  'BUCKET_CONTEXT_UNMAPPED',
  'BUCKET_IDENTITY_INVALID',
  'DUPLICATE_BUCKET_CONTEXT',
  'LEGACY_AUTHORITY_UNSAFE',
  'SNAPSHOT_SERIALIZATION_INVALID',
] as const;

export type OfficialSnapshotProducerErrorCode =
  (typeof OFFICIAL_SNAPSHOT_PRODUCER_ERROR_CODES)[number];

export interface ProduceOfficialSnapshotCommandV1 {
  readonly tenantId: string;
  readonly caseId: string;
  readonly targetCollectionId: string;
  readonly receiptAmountMinor: string;
  readonly currency: string;
  readonly minorUnit: number;
  readonly snapshotAsOfDate: string;
  readonly applicationEffectiveDate: string;
}

export interface OfficialSnapshotSourceVersionV1 {
  readonly sourceReference: string;
  readonly sourceVersion: string;
}

export interface OfficialSnapshotTargetCollectionV1
  extends OfficialSnapshotSourceVersionV1 {
  readonly collectionId: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  readonly canonicalAdmission: 'PASSED' | 'NOT_PROVEN';
  readonly finality: 'FINAL' | 'NOT_FINAL';
  readonly receiptAmountMinor: string;
  readonly currency: string;
  readonly minorUnit: number;
}

export interface OfficialSnapshotCollectionHistoryV1
  extends OfficialSnapshotSourceVersionV1 {
  readonly collectionId: string;
  readonly status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

export interface OfficialSnapshotApplicationHistoryV1
  extends OfficialSnapshotSourceVersionV1 {
  readonly batchId: string;
  readonly batchType: 'APPLY' | 'REVERSAL';
  readonly receiptAmountMinor: string;
  readonly appliedAmountMinor: string;
  readonly heldRemainderMinor: string;
  readonly reversesBatchId?: string;
}

export interface OfficialSnapshotBucketInputV1 {
  readonly componentType: LegalApplicationComponentType;
  readonly componentCode: string;
  readonly sourceLineageSetRef: string;
  readonly legalBasisRef: string;
  readonly effectiveContextRef: string;
  readonly interestRuleRef?: string;
  readonly priorityPolicyRef: string;
  readonly priorityPolicyVersion: string;
  readonly priorityRank: number;
  readonly liabilityContextRef: string;
  readonly currency: string;
  readonly minorUnit: number;
  readonly bucketBalanceMinor: string;
}

export interface OfficialSnapshotLegacyAuthorityV1 {
  readonly evidenceCompleteness: 'PROVEN' | 'UNKNOWN' | 'NOT_PROVEN';
  readonly claimItemCollectedAmount: 'NON_AUTHORITATIVE';
  readonly ledgerAllocation: 'NON_AUTHORITATIVE';
  readonly collectionAllocation: 'NON_AUTHORITATIVE';
}

export interface OfficialReceivableSnapshotReadModelV1 {
  readonly readContractVersion: typeof OFFICIAL_SNAPSHOT_READ_CONTRACT_VERSION;
  readonly readConsistency: 'SINGLE_TRANSACTION' | 'UNSAFE';
  readonly sourceConcurrencySafe: boolean;
  readonly identityInputProvenance:
    | 'FINAL_SNAPSHOT_INDEPENDENT'
    | 'UNKNOWN_OR_SNAPSHOT_DERIVED';
  readonly tenantId: string;
  readonly caseId: string;
  readonly snapshotAsOfDate: string;
  readonly applicationEffectiveDate: string;
  readonly historyBoundaryRef: string;
  readonly engineVersion: string;
  readonly calculationRuleVersion: string;
  readonly policyVersion: string;
  readonly rateTableVersion: string;
  readonly interpretationProfileId: string;
  readonly formationContextAvailable: boolean;
  readonly targetCollection: OfficialSnapshotTargetCollectionV1;
  readonly receivableSources: readonly OfficialSnapshotSourceVersionV1[];
  readonly collectionHistory: readonly OfficialSnapshotCollectionHistoryV1[];
  readonly applicationHistory: readonly OfficialSnapshotApplicationHistoryV1[];
  readonly buckets: readonly OfficialSnapshotBucketInputV1[];
  readonly legacyAuthority: OfficialSnapshotLegacyAuthorityV1;
}

export interface OfficialReceivableSnapshotReadPort<TTransaction> {
  /** Called exactly once with the caller-owned transaction. It must not open a nested transaction. */
  readSnapshot(
    transaction: TTransaction,
    command: ProduceOfficialSnapshotCommandV1,
  ): Promise<OfficialReceivableSnapshotReadModelV1>;
}

export type OfficialSnapshotProducerResult =
  | { readonly ok: true; readonly snapshotEnvelope: CanonicalSnapshotEnvelopeV1 }
  | { readonly ok: false; readonly error: { readonly code: OfficialSnapshotProducerErrorCode } };

function failure(code: OfficialSnapshotProducerErrorCode): OfficialSnapshotProducerResult {
  return Object.freeze({ ok: false as const, error: Object.freeze({ code }) });
}

function isCanonicalText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    value.normalize('NFC') === value &&
    !CONTROL_OR_UNPAIRED_SURROGATE.test(value)
  );
}

function isCanonicalDate(value: unknown): value is string {
  if (!isCanonicalText(value)) {
    return false;
  }
  const match = ISO_DATE.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year === 0 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days =
    month === 2 ? (leapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= days;
}

function parseMinorAmount(value: unknown, allowZero: boolean): bigint | undefined {
  if (typeof value !== 'string' || !UNSIGNED_DECIMAL_INTEGER.test(value)) {
    return undefined;
  }
  const parsed = BigInt(value);
  if (parsed > POSTGRES_BIGINT_MAX || (!allowZero && parsed === 0n)) {
    return undefined;
  }
  return parsed;
}

function isMinorUnit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= POSTGRES_INTEGER_MAX
  );
}

function isPriorityRank(value: unknown): value is number {
  return isMinorUnit(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Readonly<Record<string, unknown>>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8'));
}

function validateCommand(command: ProduceOfficialSnapshotCommandV1): OfficialSnapshotProducerErrorCode | undefined {
  if (!isCanonicalText(command.tenantId)) {
    return 'TENANT_CONTEXT_MISMATCH';
  }
  if (!isCanonicalText(command.caseId) || !isCanonicalText(command.targetCollectionId)) {
    return 'CASE_CONTEXT_MISMATCH';
  }
  if (parseMinorAmount(command.receiptAmountMinor, false) === undefined) {
    return 'RECEIPT_AMOUNT_INVALID';
  }
  if (
    !(CANONICAL_CURRENCY_CODES as readonly string[]).includes(command.currency) ||
    !isMinorUnit(command.minorUnit)
  ) {
    return 'CURRENCY_OR_MINOR_UNIT_INVALID';
  }
  if (!isCanonicalDate(command.snapshotAsOfDate) || !isCanonicalDate(command.applicationEffectiveDate)) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }
  return undefined;
}

function validateApplicationHistory(
  entries: readonly OfficialSnapshotApplicationHistoryV1[],
): OfficialSnapshotProducerErrorCode | undefined {
  for (const entry of entries) {
    if (
      !isCanonicalText(entry.batchId) ||
      !isCanonicalText(entry.sourceReference) ||
      !isCanonicalText(entry.sourceVersion) ||
      !(['APPLY', 'REVERSAL'] as readonly unknown[]).includes(entry.batchType)
    ) {
      return 'SOURCE_VERSION_INCOMPLETE';
    }
    const receipt = parseMinorAmount(entry.receiptAmountMinor, false);
    const applied = parseMinorAmount(entry.appliedAmountMinor, true);
    const held = parseMinorAmount(entry.heldRemainderMinor, true);
    if (receipt === undefined || applied === undefined || held === undefined) {
      return 'AMOUNT_OUT_OF_RANGE';
    }
    if (receipt !== applied + held) {
      return 'FORMATION_CONTEXT_INCOMPLETE';
    }
    if (
      (entry.batchType === 'APPLY' && entry.reversesBatchId !== undefined) ||
      (entry.batchType === 'REVERSAL' && !isCanonicalText(entry.reversesBatchId))
    ) {
      return 'FORMATION_CONTEXT_INCOMPLETE';
    }
  }
  return undefined;
}

function validateReadModel(
  command: ProduceOfficialSnapshotCommandV1,
  read: OfficialReceivableSnapshotReadModelV1,
): OfficialSnapshotProducerErrorCode | undefined {
  if (read.readContractVersion !== OFFICIAL_SNAPSHOT_READ_CONTRACT_VERSION) {
    return 'SNAPSHOT_READ_CONTRACT_UNSUPPORTED';
  }
  if (read.readConsistency !== 'SINGLE_TRANSACTION' || !read.sourceConcurrencySafe) {
    return 'SOURCE_CONCURRENCY_UNSAFE';
  }
  if (read.identityInputProvenance !== 'FINAL_SNAPSHOT_INDEPENDENT') {
    return 'BUCKET_IDENTITY_INVALID';
  }
  if (read.tenantId !== command.tenantId || read.targetCollection.tenantId !== command.tenantId) {
    return 'TENANT_CONTEXT_MISMATCH';
  }
  if (read.caseId !== command.caseId || read.targetCollection.caseId !== command.caseId) {
    return 'CASE_CONTEXT_MISMATCH';
  }
  if (
    read.targetCollection.collectionId !== command.targetCollectionId ||
    read.targetCollection.status !== 'CONFIRMED' ||
    read.targetCollection.canonicalAdmission !== 'PASSED' ||
    read.targetCollection.finality !== 'FINAL'
  ) {
    return 'TARGET_COLLECTION_INVALID';
  }
  if (read.targetCollection.receiptAmountMinor !== command.receiptAmountMinor) {
    return 'RECEIPT_AMOUNT_INVALID';
  }
  if (
    read.targetCollection.currency !== command.currency ||
    read.targetCollection.minorUnit !== command.minorUnit
  ) {
    return 'CURRENCY_OR_MINOR_UNIT_INVALID';
  }
  if (
    read.snapshotAsOfDate !== command.snapshotAsOfDate ||
    read.applicationEffectiveDate !== command.applicationEffectiveDate ||
    !isCanonicalDate(read.snapshotAsOfDate) ||
    !isCanonicalDate(read.applicationEffectiveDate) ||
    read.applicationEffectiveDate > read.snapshotAsOfDate
  ) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }
  if (
    !read.formationContextAvailable ||
    !isCanonicalText(read.historyBoundaryRef) ||
    !isCanonicalText(read.engineVersion) ||
    !isCanonicalText(read.calculationRuleVersion) ||
    !isCanonicalText(read.policyVersion) ||
    !isCanonicalText(read.rateTableVersion) ||
    !isCanonicalText(read.interpretationProfileId)
  ) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }
  if (
    read.legacyAuthority.evidenceCompleteness !== 'PROVEN' ||
    read.legacyAuthority.claimItemCollectedAmount !== 'NON_AUTHORITATIVE' ||
    read.legacyAuthority.ledgerAllocation !== 'NON_AUTHORITATIVE' ||
    read.legacyAuthority.collectionAllocation !== 'NON_AUTHORITATIVE'
  ) {
    return 'LEGACY_AUTHORITY_UNSAFE';
  }
  if (
    read.collectionHistory.some(
      (entry) =>
        !isCanonicalText(entry.collectionId) ||
        !(['PENDING', 'CONFIRMED', 'CANCELLED'] as readonly unknown[]).includes(
          entry.status,
        ),
    )
  ) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }
  if (
    read.collectionHistory.some(
      (entry) => entry.collectionId === command.targetCollectionId,
    )
  ) {
    return 'HISTORY_BOUNDARY_UNAUTHORIZED';
  }
  return validateApplicationHistory(read.applicationHistory);
}

function buildSourceVersionSet(
  read: OfficialReceivableSnapshotReadModelV1,
):
  | { readonly ok: true; readonly sources: readonly OfficialSnapshotSourceVersionV1[]; readonly hash: string }
  | { readonly ok: false } {
  const includedHistory = read.collectionHistory.filter(
    (entry) => entry.status === 'CONFIRMED',
  );
  const sources = [
    read.targetCollection,
    ...read.receivableSources,
    ...includedHistory,
    ...read.applicationHistory,
  ].map(({ sourceReference, sourceVersion }) => ({ sourceReference, sourceVersion }));

  if (
    read.receivableSources.length === 0 ||
    sources.some(
      (source) =>
        !isCanonicalText(source.sourceReference) || !isCanonicalText(source.sourceVersion),
    )
  ) {
    return { ok: false };
  }
  try {
    const sorted = sortSourceVersionSet(sources);
    return { ok: true, sources: sorted, hash: computeSourceVersionSetHash(sorted) };
  } catch {
    return { ok: false };
  }
}

function buildBuckets(
  command: ProduceOfficialSnapshotCommandV1,
  read: OfficialReceivableSnapshotReadModelV1,
  sourceVersionSetHash: string,
):
  | { readonly ok: true; readonly buckets: readonly StrictJsonValue[] }
  | { readonly ok: false; readonly code: OfficialSnapshotProducerErrorCode } {
  const built: Array<StrictJsonObject & { readonly componentType: LegalApplicationComponentType; readonly priorityRank: number; readonly bucketContextKey: string }> = [];
  const contextKeys = new Set<string>();
  const instanceIds = new Set<string>();
  for (const bucket of read.buckets) {
    if (!(LEGAL_APPLICATION_COMPONENT_TYPES as readonly string[]).includes(bucket.componentType)) {
      return { ok: false, code: 'BUCKET_CONTEXT_UNMAPPED' };
    }
    if (
      !isCanonicalText(bucket.componentCode) ||
      !isCanonicalText(bucket.sourceLineageSetRef) ||
      !isCanonicalText(bucket.legalBasisRef) ||
      !isCanonicalText(bucket.effectiveContextRef) ||
      (bucket.interestRuleRef !== undefined && !isCanonicalText(bucket.interestRuleRef)) ||
      !isCanonicalText(bucket.priorityPolicyRef) ||
      !isCanonicalText(bucket.priorityPolicyVersion) ||
      !isCanonicalText(bucket.liabilityContextRef) ||
      !isPriorityRank(bucket.priorityRank)
    ) {
      return { ok: false, code: 'BUCKET_IDENTITY_INVALID' };
    }
    if (bucket.currency !== command.currency || bucket.minorUnit !== command.minorUnit) {
      return { ok: false, code: 'CURRENCY_OR_MINOR_UNIT_INVALID' };
    }
    if (parseMinorAmount(bucket.bucketBalanceMinor, true) === undefined) {
      return { ok: false, code: 'AMOUNT_OUT_OF_RANGE' };
    }

    let bucketContextKey: string;
    let bucketInstanceId: string;
    try {
      bucketContextKey = computeBucketContextKey(bucket);
      const producedBucketInstanceId = produceBucketInstanceId({
        identityContractVersion: BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
        tenantId: command.tenantId,
        caseId: command.caseId,
        sourceVersionSetHash,
        historyBoundaryRef: read.historyBoundaryRef,
        snapshotAsOfDate: command.snapshotAsOfDate,
        applicationEffectiveDate: command.applicationEffectiveDate,
        calculationRuleVersion: read.calculationRuleVersion,
        bucketContextKey,
      });
      if (!producedBucketInstanceId.ok) {
        return { ok: false, code: 'BUCKET_IDENTITY_INVALID' };
      }
      bucketInstanceId = producedBucketInstanceId.value;
    } catch {
      return { ok: false, code: 'BUCKET_IDENTITY_INVALID' };
    }
    if (contextKeys.has(bucketContextKey)) {
      return { ok: false, code: 'DUPLICATE_BUCKET_CONTEXT' };
    }
    if (instanceIds.has(bucketInstanceId)) {
      return { ok: false, code: 'BUCKET_IDENTITY_INVALID' };
    }
    contextKeys.add(bucketContextKey);
    instanceIds.add(bucketInstanceId);
    built.push({
      componentType: bucket.componentType,
      componentCode: bucket.componentCode,
      bucketContextKey,
      bucketInstanceId,
      sourceLineageSetRef: bucket.sourceLineageSetRef,
      legalBasisRef: bucket.legalBasisRef,
      effectivePeriodRef: bucket.effectiveContextRef,
      ...(bucket.interestRuleRef === undefined
        ? {}
        : { interestRuleRef: bucket.interestRuleRef }),
      currency: bucket.currency,
      minorUnit: bucket.minorUnit,
      priorityRank: bucket.priorityRank,
      bucketBalanceMinor: bucket.bucketBalanceMinor,
    });
  }

  built.sort(
    (left, right) =>
      LEGAL_APPLICATION_COMPONENT_RANKS[left.componentType] -
        LEGAL_APPLICATION_COMPONENT_RANKS[right.componentType] ||
      left.priorityRank - right.priorityRank ||
      compareUtf8(left.bucketContextKey, right.bucketContextKey),
  );
  return { ok: true, buckets: built };
}

export function produceOfficialReceivableSnapshotFromReadModel(
  command: ProduceOfficialSnapshotCommandV1,
  read: OfficialReceivableSnapshotReadModelV1,
): OfficialSnapshotProducerResult {
  const commandFailure = validateCommand(command);
  if (commandFailure !== undefined) {
    return failure(commandFailure);
  }
  const readFailure = validateReadModel(command, read);
  if (readFailure !== undefined) {
    return failure(readFailure);
  }
  const sourceSet = buildSourceVersionSet(read);
  if (!sourceSet.ok) {
    return failure('SOURCE_VERSION_INCOMPLETE');
  }
  const buckets = buildBuckets(command, read, sourceSet.hash);
  if (!buckets.ok) {
    return failure(buckets.code);
  }

  const snapshot: StrictJsonObject = {
    snapshotContractVersion: SNAPSHOT_CONTRACT_VERSION,
    snapshotSerializationVersion: SNAPSHOT_SERIALIZATION_VERSION,
    tenantId: command.tenantId,
    caseId: command.caseId,
    targetCollectionId: command.targetCollectionId,
    currency: command.currency,
    minorUnit: command.minorUnit,
    receiptAmountMinor: command.receiptAmountMinor,
    snapshotAsOfDate: command.snapshotAsOfDate,
    applicationEffectiveDate: command.applicationEffectiveDate,
    historyBoundaryRef: read.historyBoundaryRef,
    engineVersion: read.engineVersion,
    calculationRuleVersion: read.calculationRuleVersion,
    policyVersion: read.policyVersion,
    rateTableVersion: read.rateTableVersion,
    interpretationProfileId: read.interpretationProfileId,
    bucketIdentityVersion: BUCKET_INSTANCE_IDENTITY_CONTRACT_VERSION,
    sourceVersionSet: sourceSet.sources.map((source) => ({ ...source })),
    sourceVersionSetHash: sourceSet.hash,
    canonicalBuckets: buckets.buckets,
  };
  const canonicalPayload = serializeCanonicalJson(snapshot);
  const snapshotHash = computeCanonicalSnapshotHash(Buffer.from(canonicalPayload, 'utf8'));
  const snapshotRef = canonicalSnapshotRefForHash(snapshotHash);
  const validation = validateCanonicalSnapshot({
    direction: 'APPLY',
    command: {
      tenantId: command.tenantId,
      caseId: command.caseId,
      collectionId: command.targetCollectionId,
      receiptAmountMinor: command.receiptAmountMinor,
      currency: command.currency,
      minorUnit: command.minorUnit,
      applicationEffectiveDate: command.applicationEffectiveDate,
      expectedSnapshotRef: snapshotRef,
      expectedSnapshotHash: snapshotHash,
      expectedSourceVersionSetHash: sourceSet.hash,
      expectedHistoryBoundaryRef: read.historyBoundaryRef,
      idempotencyKey: 'official-snapshot-producer:v1',
      commandHash: 'official-snapshot-producer:v1',
    },
    snapshotEnvelope: { snapshotRef, snapshotHash, canonicalPayload },
  });
  if (!validation.ok) {
    return failure('SNAPSHOT_SERIALIZATION_INVALID');
  }

  return deepFreeze({
    ok: true as const,
    snapshotEnvelope: {
      snapshotRef: validation.value.snapshotRef,
      snapshotHash: validation.value.snapshotHash,
      canonicalPayload: validation.value.canonicalPayload,
      snapshot: validation.value.snapshot,
    },
  });
}

export class OfficialReceivableApplicationSnapshotProducer<TTransaction> {
  constructor(
    private readonly readPort: OfficialReceivableSnapshotReadPort<TTransaction>,
  ) {}

  async produce(
    transaction: TTransaction,
    command: ProduceOfficialSnapshotCommandV1,
  ): Promise<OfficialSnapshotProducerResult> {
    try {
      const read = await this.readPort.readSnapshot(transaction, command);
      return produceOfficialReceivableSnapshotFromReadModel(command, read);
    } catch {
      return failure('SNAPSHOT_UNAVAILABLE');
    }
  }
}
