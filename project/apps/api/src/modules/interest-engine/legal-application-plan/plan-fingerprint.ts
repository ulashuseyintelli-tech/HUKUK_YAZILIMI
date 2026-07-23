import { createHash } from 'node:crypto';
import type {
  LegalApplicationDirection,
  LegalApplicationHeldReason,
  LegalApplicationPlanError,
  PlannedLegalApplication,
} from './contracts';
import { LEGAL_APPLICATION_COMPONENT_TYPES } from './contracts';
import {
  POSTGRES_BIGINT_MAX,
  POSTGRES_INTEGER_MAX,
  parsePlanFingerprint,
  type AppliedAmountMinor,
  type CaseId,
  type CollectionId,
  type CurrencyCode,
  type EffectiveDate,
  type HeldRemainderMinor,
  type HistoryBoundaryRef,
  type MinorUnit,
  type PlanFingerprint,
  type ReceiptAmountMinor,
  type SnapshotHash,
  type SnapshotRef,
  type SourceVersionSetHash,
  type TenantId,
} from './primitives';

export const LEGAL_APPLICATION_PLAN_FINGERPRINT_CONTRACT_VERSION = 'RCV-LAP/v1' as const;
export const LEGAL_APPLICATION_PLAN_HELD_NONE = 'NONE' as const;

export type CanonicalPlanHeldReason =
  | typeof LEGAL_APPLICATION_PLAN_HELD_NONE
  | LegalApplicationHeldReason;

export interface LegalApplicationPlanIdentityFacts {
  readonly direction: LegalApplicationDirection;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly collectionId: CollectionId;
  readonly currency: CurrencyCode;
  readonly minorUnit: MinorUnit;
  readonly effectiveDate: EffectiveDate;
  readonly snapshotRef: SnapshotRef;
  readonly snapshotHash: SnapshotHash;
  readonly sourceVersionSetHash: SourceVersionSetHash;
  readonly historyBoundaryRef: HistoryBoundaryRef;
  readonly receiptAmountMinor: ReceiptAmountMinor;
  readonly appliedAmountMinor: AppliedAmountMinor;
  readonly heldRemainderMinor: HeldRemainderMinor;
  readonly heldReason: CanonicalPlanHeldReason;
  readonly applications: readonly PlannedLegalApplication[];
}

export interface LegalApplicationPlanFingerprintSuccess {
  readonly ok: true;
  readonly planFingerprint: PlanFingerprint;
}

export interface LegalApplicationPlanFingerprintFailure {
  readonly ok: false;
  readonly error: LegalApplicationPlanError;
}

export type LegalApplicationPlanFingerprintResult =
  | LegalApplicationPlanFingerprintSuccess
  | LegalApplicationPlanFingerprintFailure;

const DOMAIN_SEPARATOR = Buffer.concat([
  Buffer.from(LEGAL_APPLICATION_PLAN_FINGERPRINT_CONTRACT_VERSION, 'utf8'),
  Buffer.from([0]),
]);

function failure(
  code: LegalApplicationPlanError['code'],
): LegalApplicationPlanFingerprintFailure {
  return Object.freeze({ ok: false, error: Object.freeze({ code }) });
}

function isCanonicalIdentityString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.normalize('NFC') === value
  );
}

function isPersistenceSafeMinorAmount(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= POSTGRES_BIGINT_MAX;
}

function quoteCanonicalString(value: string): string {
  return JSON.stringify(value);
}

function serializeApplication(application: PlannedLegalApplication): string {
  return (
    `{"component":${quoteCanonicalString(application.componentType)}` +
    `,"componentCode":${quoteCanonicalString(application.componentCode)}` +
    `,"priorityRank":${application.priorityRank}` +
    `,"bucketContextKey":${quoteCanonicalString(application.bucketContextKey)}` +
    `,"bucketInstanceId":${quoteCanonicalString(application.bucketInstanceId)}` +
    `,"sourceLineageSetRef":${quoteCanonicalString(application.sourceLineageSetRef)}` +
    `,"bucketBeforeMinor":${quoteCanonicalString(application.bucketBeforeMinor.toString())}` +
    `,"appliedAmountMinor":${quoteCanonicalString(application.appliedAmountMinor.toString())}` +
    `,"bucketAfterMinor":${quoteCanonicalString(application.bucketAfterMinor.toString())}}`
  );
}

function identityError(
  facts: LegalApplicationPlanIdentityFacts,
): LegalApplicationPlanError['code'] | undefined {
  if (facts.direction !== 'APPLY') {
    return 'DIRECTION_NOT_AUTHORIZED';
  }

  if (
    !Number.isInteger(facts.minorUnit) ||
    facts.minorUnit < 0 ||
    facts.minorUnit > POSTGRES_INTEGER_MAX
  ) {
    return 'AMOUNT_OUT_OF_RANGE';
  }

  if (
    !isPersistenceSafeMinorAmount(facts.receiptAmountMinor) ||
    !isPersistenceSafeMinorAmount(facts.appliedAmountMinor) ||
    !isPersistenceSafeMinorAmount(facts.heldRemainderMinor)
  ) {
    return 'AMOUNT_OUT_OF_RANGE';
  }

  const identityStrings: readonly unknown[] = [
    facts.tenantId,
    facts.caseId,
    facts.collectionId,
    facts.currency,
    facts.effectiveDate,
    facts.snapshotRef,
    facts.snapshotHash,
    facts.sourceVersionSetHash,
    facts.historyBoundaryRef,
  ];
  if (!identityStrings.every(isCanonicalIdentityString)) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }

  if (
    facts.heldReason !== LEGAL_APPLICATION_PLAN_HELD_NONE &&
    facts.heldReason !== 'NO_ELIGIBLE_OUTSTANDING' &&
    facts.heldReason !== 'EXCESS_OVER_ELIGIBLE_OUTSTANDING'
  ) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }

  const expectedHeldReason: CanonicalPlanHeldReason =
    facts.heldRemainderMinor === 0n
      ? LEGAL_APPLICATION_PLAN_HELD_NONE
      : facts.appliedAmountMinor === 0n
        ? 'NO_ELIGIBLE_OUTSTANDING'
        : 'EXCESS_OVER_ELIGIBLE_OUTSTANDING';
  if (facts.heldReason !== expectedHeldReason) {
    return 'CONSERVATION_FAILURE';
  }

  let applicationSum = 0n;
  for (const application of facts.applications) {
    if (
      !(LEGAL_APPLICATION_COMPONENT_TYPES as readonly string[]).includes(
        application.componentType,
      )
    ) {
      return 'FORMATION_CONTEXT_INCOMPLETE';
    }
    if (
      !Number.isInteger(application.priorityRank) ||
      application.priorityRank < 0 ||
      application.priorityRank > POSTGRES_INTEGER_MAX ||
      !isPersistenceSafeMinorAmount(application.bucketBeforeMinor) ||
      !isPersistenceSafeMinorAmount(application.appliedAmountMinor) ||
      !isPersistenceSafeMinorAmount(application.bucketAfterMinor)
    ) {
      return 'AMOUNT_OUT_OF_RANGE';
    }
    if (
      ![
        application.componentType,
        application.componentCode,
        application.bucketContextKey,
        application.bucketInstanceId,
        application.sourceLineageSetRef,
      ].every(isCanonicalIdentityString)
    ) {
      return 'FORMATION_CONTEXT_INCOMPLETE';
    }
    if (
      application.appliedAmountMinor === 0n ||
      application.bucketBeforeMinor !==
        application.appliedAmountMinor + application.bucketAfterMinor
    ) {
      return 'CONSERVATION_FAILURE';
    }
    applicationSum += application.appliedAmountMinor;
    if (applicationSum > POSTGRES_BIGINT_MAX) {
      return 'AMOUNT_OUT_OF_RANGE';
    }
  }

  if (
    applicationSum !== facts.appliedAmountMinor ||
    facts.receiptAmountMinor !==
      facts.appliedAmountMinor + facts.heldRemainderMinor
  ) {
    return 'CONSERVATION_FAILURE';
  }

  return undefined;
}

/**
 * Exact RCV-LAP/v1 serializer. Object construction is deliberately explicit:
 * runtime insertion order and recursive key sorting are not authority.
 */
export function serializeCanonicalLegalApplicationPlanIdentity(
  facts: LegalApplicationPlanIdentityFacts,
): Buffer | LegalApplicationPlanFingerprintFailure {
  const errorCode = identityError(facts);
  if (errorCode !== undefined) {
    return failure(errorCode);
  }

  const applications = facts.applications.map(serializeApplication).join(',');
  const canonicalIdentity =
    `{"contractVersion":${quoteCanonicalString(
      LEGAL_APPLICATION_PLAN_FINGERPRINT_CONTRACT_VERSION,
    )}` +
    `,"direction":${quoteCanonicalString(facts.direction)}` +
    `,"tenantId":${quoteCanonicalString(facts.tenantId)}` +
    `,"caseId":${quoteCanonicalString(facts.caseId)}` +
    `,"collectionId":${quoteCanonicalString(facts.collectionId)}` +
    `,"currency":${quoteCanonicalString(facts.currency)}` +
    `,"minorUnit":${facts.minorUnit}` +
    `,"effectiveDate":${quoteCanonicalString(facts.effectiveDate)}` +
    `,"snapshotRef":${quoteCanonicalString(facts.snapshotRef)}` +
    `,"snapshotHash":${quoteCanonicalString(facts.snapshotHash)}` +
    `,"sourceVersionSetHash":${quoteCanonicalString(facts.sourceVersionSetHash)}` +
    `,"historyBoundaryRef":${quoteCanonicalString(facts.historyBoundaryRef)}` +
    `,"receiptAmountMinor":${quoteCanonicalString(facts.receiptAmountMinor.toString())}` +
    `,"appliedAmountMinor":${quoteCanonicalString(facts.appliedAmountMinor.toString())}` +
    `,"heldRemainderMinor":${quoteCanonicalString(facts.heldRemainderMinor.toString())}` +
    `,"heldReason":${quoteCanonicalString(facts.heldReason)}` +
    `,"applications":[${applications}]}`;

  return Buffer.from(canonicalIdentity, 'utf8');
}

export function fingerprintLegalApplicationPlan(
  facts: LegalApplicationPlanIdentityFacts,
): LegalApplicationPlanFingerprintResult {
  const identityBytes = serializeCanonicalLegalApplicationPlanIdentity(facts);
  if (!Buffer.isBuffer(identityBytes)) {
    return identityBytes;
  }

  const digest = createHash('sha256')
    .update(DOMAIN_SEPARATOR)
    .update(identityBytes)
    .digest('hex');
  const reference = `rcv-legal-application-plan:v1:sha256:${digest}`;
  const parsed = parsePlanFingerprint(reference);
  if (!parsed.ok) {
    return failure('FORMATION_CONTEXT_INCOMPLETE');
  }

  return Object.freeze({ ok: true, planFingerprint: parsed.value });
}
