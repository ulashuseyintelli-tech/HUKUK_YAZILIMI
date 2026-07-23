import type {
  AppliedAmountMinor,
  BucketBalanceMinor,
  BucketContextKey,
  BucketIdentityVersion,
  BucketInstanceId,
  CaseId,
  CollectionId,
  CommandHash,
  ComponentCode,
  CurrencyCode,
  EffectiveDate,
  EngineVersion,
  HeldRemainderMinor,
  HistoryBoundaryRef,
  IdempotencyKey,
  InterpretationVersion,
  MinorUnit,
  PlanFingerprint,
  PolicyVersion,
  RateVersion,
  ReceiptAmountMinor,
  RuleVersion,
  SerializationVersion,
  SnapshotContractVersion,
  SnapshotDate,
  SnapshotHash,
  SnapshotRef,
  SourceLineageSetRef,
  SourceReference,
  SourceVersion,
  SourceVersionSetHash,
  TenantId,
} from './primitives';
import type { CanonicalSnapshotValidationReason } from './validation-constants';

export const LEGAL_APPLICATION_COMPONENT_TYPES = [
  'COST',
  'ANCILLARY',
  'ACCRUED_INTEREST',
  'PRINCIPAL',
] as const;

export type LegalApplicationComponentType = (typeof LEGAL_APPLICATION_COMPONENT_TYPES)[number];

export const LEGAL_APPLICATION_COMPONENT_RANKS = {
  COST: 10,
  ANCILLARY: 20,
  ACCRUED_INTEREST: 30,
  PRINCIPAL: 40,
} as const satisfies Readonly<Record<LegalApplicationComponentType, number>>;

export const LEGAL_APPLICATION_DIRECTIONS = ['APPLY'] as const;
export type LegalApplicationDirection = (typeof LEGAL_APPLICATION_DIRECTIONS)[number];

export const LEGAL_APPLICATION_HELD_REASONS = [
  'NO_ELIGIBLE_OUTSTANDING',
  'EXCESS_OVER_ELIGIBLE_OUTSTANDING',
] as const;

export type LegalApplicationHeldReason = (typeof LEGAL_APPLICATION_HELD_REASONS)[number];

export const LEGAL_APPLICATION_PLAN_ERROR_CODES = [
  'SNAPSHOT_UNAVAILABLE',
  'SNAPSHOT_CONTRACT_UNSUPPORTED',
  'SNAPSHOT_SERIALIZATION_INVALID',
  'SNAPSHOT_HASH_MISMATCH',
  'SNAPSHOT_REF_MISMATCH',
  'SOURCE_VERSION_INCOMPLETE',
  'FORMATION_CONTEXT_INCOMPLETE',
  'POLICY_VERSION_MISSING',
  'FEE_AUTHORITY_UNRESOLVED',
  'BUCKET_CONTEXT_UNMAPPED',
  'BUCKET_IDENTITY_INVALID',
  'DUPLICATE_BUCKET_CONTEXT',
  'CURRENCY_OR_MINOR_UNIT_INVALID',
  'EFFECTIVE_DATE_MISMATCH',
  'HISTORY_BOUNDARY_UNAUTHORIZED',
  'SNAPSHOT_STALE',
  'SOURCE_CONCURRENCY_UNSAFE',
  'RECEIPT_AMOUNT_INVALID',
  'AMOUNT_OUT_OF_RANGE',
  'CONSERVATION_FAILURE',
  'DIRECTION_NOT_AUTHORIZED',
  'TENANT_CONTEXT_MISMATCH',
  'CASE_CONTEXT_MISMATCH',
] as const;

export type LegalApplicationPlanErrorCode =
  (typeof LEGAL_APPLICATION_PLAN_ERROR_CODES)[number];

export interface CanonicalSourceVersionV1 {
  readonly sourceReference: SourceReference;
  readonly sourceVersion: SourceVersion;
}

/**
 * Canonical Receivable bucket input. It is a legal component bucket, never a ClaimItem target.
 * Identity derivation and eligibility validation are intentionally deferred to I02.
 */
export interface CanonicalLegalBucketV1 {
  readonly componentType: LegalApplicationComponentType;
  readonly componentCode: ComponentCode;
  readonly bucketContextKey: BucketContextKey;
  readonly bucketInstanceId: BucketInstanceId;
  readonly sourceLineageSetRef: SourceLineageSetRef;
  readonly currency: CurrencyCode;
  readonly minorUnit: MinorUnit;
  readonly priorityRank: number;
  readonly bucketBalanceMinor: BucketBalanceMinor;
}

/** The decoded semantic payload; no hash or serialization work is performed in I01. */
export interface CanonicalReceivableApplicationSnapshotV1 {
  readonly snapshotContractVersion: SnapshotContractVersion;
  readonly snapshotSerializationVersion: SerializationVersion;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly targetCollectionId: CollectionId;
  readonly currency: CurrencyCode;
  readonly minorUnit: MinorUnit;
  readonly receiptAmountMinor: ReceiptAmountMinor;
  readonly snapshotAsOfDate: SnapshotDate;
  readonly applicationEffectiveDate: EffectiveDate;
  readonly historyBoundaryRef: HistoryBoundaryRef;
  readonly engineVersion: EngineVersion;
  readonly calculationRuleVersion: RuleVersion;
  readonly policyVersion: PolicyVersion;
  readonly rateTableVersion: RateVersion;
  readonly interpretationProfileId: InterpretationVersion;
  readonly bucketIdentityVersion: BucketIdentityVersion;
  readonly sourceVersionSet: readonly CanonicalSourceVersionV1[];
  readonly sourceVersionSetHash: SourceVersionSetHash;
  readonly canonicalBuckets: readonly CanonicalLegalBucketV1[];
}

/**
 * Receipt-bound snapshot evidence. `canonicalPayload` stays opaque in I01; RCV-CAS/v1 parsing,
 * canonicalization and hash/ref validation belong to I02.
 */
export interface CanonicalSnapshotEnvelopeV1 {
  readonly snapshotRef: SnapshotRef;
  readonly snapshotHash: SnapshotHash;
  readonly canonicalPayload: string;
  readonly snapshot: CanonicalReceivableApplicationSnapshotV1;
}

export interface BuildLegalApplicationPlanCommand {
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly collectionId: CollectionId;
  readonly receiptAmountMinor: ReceiptAmountMinor;
  readonly currency: CurrencyCode;
  readonly minorUnit: MinorUnit;
  readonly applicationEffectiveDate: EffectiveDate;
  readonly expectedSnapshotRef: SnapshotRef;
  readonly expectedSnapshotHash: SnapshotHash;
  readonly expectedSourceVersionSetHash: SourceVersionSetHash;
  readonly expectedHistoryBoundaryRef: HistoryBoundaryRef;
  readonly idempotencyKey: IdempotencyKey;
  readonly commandHash: CommandHash;
}

export interface LegalApplicationPlanContext {
  readonly command: BuildLegalApplicationPlanCommand;
  readonly snapshotEnvelope: CanonicalSnapshotEnvelopeV1;
}

export interface PlannedLegalApplication {
  readonly componentType: LegalApplicationComponentType;
  readonly componentCode: ComponentCode;
  readonly sourceLineageSetRef: SourceLineageSetRef;
  readonly bucketContextKey: BucketContextKey;
  readonly bucketInstanceId: BucketInstanceId;
  readonly priorityRank: number;
  readonly sequence: number;
  readonly appliedAmountMinor: AppliedAmountMinor;
  readonly bucketBeforeMinor: BucketBalanceMinor;
  readonly bucketAfterMinor: BucketBalanceMinor;
}

/** Optional lineage only; it cannot determine order, balance or application success. */
export interface PlannedApplicationAttribution {
  readonly bucketInstanceId: BucketInstanceId;
  readonly sourceLineageSetRef: SourceLineageSetRef;
  readonly attributedAmountMinor?: AppliedAmountMinor;
}

export interface HeldRemainder {
  readonly amountMinor: HeldRemainderMinor;
  readonly reason: LegalApplicationHeldReason;
}

export interface LegalApplicationPlan {
  readonly direction: LegalApplicationDirection;
  readonly planFingerprint: PlanFingerprint;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly collectionId: CollectionId;
  readonly currency: CurrencyCode;
  readonly minorUnit: MinorUnit;
  readonly snapshotRef: SnapshotRef;
  readonly snapshotHash: SnapshotHash;
  readonly sourceVersionSetHash: SourceVersionSetHash;
  readonly historyBoundaryRef: HistoryBoundaryRef;
  readonly applicationEffectiveDate: EffectiveDate;
  readonly receiptAmountMinor: ReceiptAmountMinor;
  readonly appliedAmountMinor: AppliedAmountMinor;
  readonly heldRemainderMinor: HeldRemainderMinor;
  readonly heldReason?: LegalApplicationHeldReason;
  readonly applications: readonly PlannedLegalApplication[];
  readonly attributions: readonly PlannedApplicationAttribution[];
}

/** Allowlist-only metadata; raw payload, free text, PII and runtime details have no type slot. */
export interface LegalApplicationPlanErrorMetadata {
  readonly reason?: CanonicalSnapshotValidationReason;
  /** Static schema path only; untrusted field names and values are never copied here. */
  readonly path?: string;
  readonly configuredMaximum?: number;
  readonly actual?: number;
  readonly snapshotRef?: SnapshotRef;
  readonly expectedSnapshotRef?: SnapshotRef;
  readonly snapshotHash?: SnapshotHash;
  readonly expectedSnapshotHash?: SnapshotHash;
  readonly sourceVersionSetHash?: SourceVersionSetHash;
  readonly expectedSourceVersionSetHash?: SourceVersionSetHash;
  readonly historyBoundaryRef?: HistoryBoundaryRef;
  readonly expectedHistoryBoundaryRef?: HistoryBoundaryRef;
  readonly bucketContextKey?: BucketContextKey;
  readonly bucketInstanceId?: BucketInstanceId;
  readonly componentType?: LegalApplicationComponentType;
  readonly currency?: CurrencyCode;
  readonly minorUnit?: MinorUnit;
  readonly snapshotDate?: SnapshotDate;
  readonly effectiveDate?: EffectiveDate;
}

type LegalApplicationPlanErrorFor<Code extends LegalApplicationPlanErrorCode> = {
  readonly code: Code;
  readonly metadata?: LegalApplicationPlanErrorMetadata;
};

export type LegalApplicationPlanError = {
  readonly [Code in LegalApplicationPlanErrorCode]: LegalApplicationPlanErrorFor<Code>;
}[LegalApplicationPlanErrorCode];

export interface LegalApplicationPlanSuccess {
  readonly ok: true;
  readonly plan: LegalApplicationPlan;
}

export interface LegalApplicationPlanFailure {
  readonly ok: false;
  readonly error: LegalApplicationPlanError;
}

export type LegalApplicationPlanResult = LegalApplicationPlanSuccess | LegalApplicationPlanFailure;
