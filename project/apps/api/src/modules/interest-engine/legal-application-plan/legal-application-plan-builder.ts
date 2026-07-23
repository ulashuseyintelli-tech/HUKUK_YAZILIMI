import {
  MAX_ATTRIBUTION_COUNT,
} from './validation-constants';
import {
  compareBucketContextKeysUtf8,
  legalApplicationComponentRank,
} from './allocation-order';
import type {
  BuildLegalApplicationPlanCommand,
  LegalApplicationHeldReason,
  LegalApplicationPlan,
  LegalApplicationPlanError,
  LegalApplicationPlanFailure,
  LegalApplicationPlanResult,
  PlannedApplicationAttribution,
  PlannedLegalApplication,
} from './contracts';
import type {
  PureAppliedBucketAllocation,
  PureApplyAllocationResult,
} from './apply-allocation-core';
import type {
  ValidatedCanonicalLegalBucketV1,
  ValidatedCanonicalSnapshotV1,
} from './canonical-snapshot-validator';
import {
  POSTGRES_BIGINT_MAX,
  POSTGRES_INTEGER_MAX,
  type AppliedAmountMinor,
  type HeldRemainderMinor,
} from './primitives';
import {
  LEGAL_APPLICATION_PLAN_HELD_NONE,
  fingerprintLegalApplicationPlan,
  type CanonicalPlanHeldReason,
} from './plan-fingerprint';

export interface AssembleLegalApplicationPlanInput {
  readonly direction: unknown;
  readonly command: BuildLegalApplicationPlanCommand;
  readonly validatedSnapshot: ValidatedCanonicalSnapshotV1;
  readonly allocationResult: PureApplyAllocationResult;
  readonly attributions?: readonly PlannedApplicationAttribution[];
}

function failure(code: LegalApplicationPlanError['code']): LegalApplicationPlanFailure {
  return Object.freeze({ ok: false, error: Object.freeze({ code }) });
}

function isPersistenceSafeMinorAmount(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= POSTGRES_BIGINT_MAX;
}

function isCanonicalIdentityString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.normalize('NFC') === value
  );
}

function commandContextError(
  input: AssembleLegalApplicationPlanInput,
): LegalApplicationPlanError['code'] | undefined {
  const { command, validatedSnapshot } = input;
  const snapshot = validatedSnapshot.snapshot;

  if (input.direction !== 'APPLY') {
    return 'DIRECTION_NOT_AUTHORIZED';
  }
  if (command.tenantId !== snapshot.tenantId) {
    return 'TENANT_CONTEXT_MISMATCH';
  }
  if (command.caseId !== snapshot.caseId) {
    return 'CASE_CONTEXT_MISMATCH';
  }
  if (command.collectionId !== snapshot.targetCollectionId) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }
  if (
    command.currency !== snapshot.currency ||
    command.minorUnit !== snapshot.minorUnit
  ) {
    return 'CURRENCY_OR_MINOR_UNIT_INVALID';
  }
  if (command.applicationEffectiveDate !== snapshot.applicationEffectiveDate) {
    return 'EFFECTIVE_DATE_MISMATCH';
  }
  if (command.receiptAmountMinor !== snapshot.receiptAmountMinor) {
    return 'CONSERVATION_FAILURE';
  }
  if (
    command.expectedSnapshotRef !== validatedSnapshot.snapshotRef ||
    command.expectedSnapshotHash !== validatedSnapshot.snapshotHash
  ) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }
  if (command.expectedSourceVersionSetHash !== snapshot.sourceVersionSetHash) {
    return 'SOURCE_VERSION_INCOMPLETE';
  }
  if (command.expectedHistoryBoundaryRef !== snapshot.historyBoundaryRef) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }

  const identityStrings: readonly unknown[] = [
    command.tenantId,
    command.caseId,
    command.collectionId,
    command.currency,
    command.applicationEffectiveDate,
    validatedSnapshot.snapshotRef,
    validatedSnapshot.snapshotHash,
    snapshot.sourceVersionSetHash,
    snapshot.historyBoundaryRef,
  ];
  if (!identityStrings.every(isCanonicalIdentityString)) {
    return 'FORMATION_CONTEXT_INCOMPLETE';
  }

  return undefined;
}

function compareAllocationSequence(
  left: PureAppliedBucketAllocation,
  right: PureAppliedBucketAllocation,
): number | undefined {
  const leftRank = legalApplicationComponentRank(left.componentType);
  const rightRank = legalApplicationComponentRank(right.componentType);
  if (leftRank === undefined || rightRank === undefined) {
    return undefined;
  }
  if (leftRank !== rightRank) {
    return leftRank < rightRank ? -1 : 1;
  }
  if (left.priorityRank !== right.priorityRank) {
    return left.priorityRank < right.priorityRank ? -1 : 1;
  }
  return compareBucketContextKeysUtf8(left.bucketContextKey, right.bucketContextKey);
}

function allocationMatchesBucket(
  allocation: PureAppliedBucketAllocation,
  bucket: ValidatedCanonicalLegalBucketV1,
): boolean {
  return (
    allocation.componentType === bucket.componentType &&
    allocation.componentCode === bucket.componentCode &&
    allocation.priorityRank === bucket.priorityRank &&
    allocation.bucketContextKey === bucket.bucketContextKey &&
    allocation.bucketInstanceId === bucket.bucketInstanceId &&
    allocation.sourceLineageSetRef === bucket.sourceLineageSetRef &&
    allocation.bucketBeforeMinor === bucket.bucketBalanceMinor
  );
}

function allocationError(
  input: AssembleLegalApplicationPlanInput,
): LegalApplicationPlanError['code'] | undefined {
  if (!input.allocationResult.ok) {
    return input.allocationResult.error.code;
  }

  const { allocations, totalAppliedMinor, remainingAmountMinor } =
    input.allocationResult;
  if (
    !isPersistenceSafeMinorAmount(totalAppliedMinor) ||
    !isPersistenceSafeMinorAmount(remainingAmountMinor)
  ) {
    return 'AMOUNT_OUT_OF_RANGE';
  }

  const bucketsByInstance = new Map(
    input.validatedSnapshot.snapshot.canonicalBuckets.map((bucket) => [
      bucket.bucketInstanceId,
      bucket,
    ]),
  );
  const seenInstances = new Set<string>();
  let sum = 0n;

  for (let index = 0; index < allocations.length; index += 1) {
    const allocation = allocations[index];
    if (
      !Number.isInteger(allocation.priorityRank) ||
      allocation.priorityRank < 0 ||
      allocation.priorityRank > POSTGRES_INTEGER_MAX ||
      !isPersistenceSafeMinorAmount(allocation.bucketBeforeMinor) ||
      !isPersistenceSafeMinorAmount(allocation.appliedAmountMinor) ||
      !isPersistenceSafeMinorAmount(allocation.bucketAfterMinor)
    ) {
      return 'AMOUNT_OUT_OF_RANGE';
    }
    if (allocation.appliedAmountMinor === 0n) {
      return 'CONSERVATION_FAILURE';
    }
    if (
      allocation.bucketBeforeMinor !==
      allocation.appliedAmountMinor + allocation.bucketAfterMinor
    ) {
      return 'CONSERVATION_FAILURE';
    }
    if (seenInstances.has(allocation.bucketInstanceId)) {
      return 'FORMATION_CONTEXT_INCOMPLETE';
    }
    seenInstances.add(allocation.bucketInstanceId);

    const bucket = bucketsByInstance.get(allocation.bucketInstanceId);
    if (bucket === undefined || !allocationMatchesBucket(allocation, bucket)) {
      return 'FORMATION_CONTEXT_INCOMPLETE';
    }

    if (index > 0) {
      const comparison = compareAllocationSequence(allocations[index - 1], allocation);
      if (comparison === undefined || comparison >= 0) {
        return 'FORMATION_CONTEXT_INCOMPLETE';
      }
    }
    sum += allocation.appliedAmountMinor;
    if (sum > POSTGRES_BIGINT_MAX) {
      return 'AMOUNT_OUT_OF_RANGE';
    }
  }

  if (
    sum !== totalAppliedMinor ||
    input.command.receiptAmountMinor !== totalAppliedMinor + remainingAmountMinor
  ) {
    return 'CONSERVATION_FAILURE';
  }

  return undefined;
}

function plannedApplications(
  allocations: readonly PureAppliedBucketAllocation[],
): readonly PlannedLegalApplication[] {
  return Object.freeze(
    allocations.map((allocation, index) =>
      Object.freeze({
        componentType: allocation.componentType,
        componentCode: allocation.componentCode,
        priorityRank: allocation.priorityRank,
        sourceLineageSetRef: allocation.sourceLineageSetRef,
        bucketContextKey: allocation.bucketContextKey,
        bucketInstanceId: allocation.bucketInstanceId,
        sequence: index + 1,
        appliedAmountMinor: allocation.appliedAmountMinor,
        bucketBeforeMinor: allocation.bucketBeforeMinor,
        bucketAfterMinor: allocation.bucketAfterMinor,
      }),
    ),
  );
}

function heldFacts(
  totalAppliedMinor: AppliedAmountMinor,
  remainingAmountMinor: bigint,
): {
  readonly heldRemainderMinor: HeldRemainderMinor;
  readonly runtimeReason?: LegalApplicationHeldReason;
  readonly identityReason: CanonicalPlanHeldReason;
} {
  const heldRemainderMinor = remainingAmountMinor as HeldRemainderMinor;
  if (remainingAmountMinor === 0n) {
    return Object.freeze({
      heldRemainderMinor,
      identityReason: LEGAL_APPLICATION_PLAN_HELD_NONE,
    });
  }
  const runtimeReason: LegalApplicationHeldReason =
    totalAppliedMinor === 0n
      ? 'NO_ELIGIBLE_OUTSTANDING'
      : 'EXCESS_OVER_ELIGIBLE_OUTSTANDING';
  return Object.freeze({
    heldRemainderMinor,
    runtimeReason,
    identityReason: runtimeReason,
  });
}

function projectAttributions(
  source: readonly PlannedApplicationAttribution[] | undefined,
  applications: readonly PlannedLegalApplication[],
): readonly PlannedApplicationAttribution[] {
  if (source === undefined || source.length === 0 || source.length > MAX_ATTRIBUTION_COUNT) {
    return Object.freeze([]);
  }

  const applicationsByInstance = new Map(
    applications.map((application) => [application.bucketInstanceId, application]),
  );
  const projected: PlannedApplicationAttribution[] = [];

  for (const attribution of source) {
    const application = applicationsByInstance.get(attribution.bucketInstanceId);
    if (
      application === undefined ||
      attribution.sourceLineageSetRef !== application.sourceLineageSetRef ||
      !isCanonicalIdentityString(attribution.bucketInstanceId) ||
      !isCanonicalIdentityString(attribution.sourceLineageSetRef) ||
      (attribution.attributedAmountMinor !== undefined &&
        (!isPersistenceSafeMinorAmount(attribution.attributedAmountMinor) ||
          attribution.attributedAmountMinor > application.appliedAmountMinor))
    ) {
      continue;
    }

    projected.push(
      Object.freeze({
        bucketInstanceId: attribution.bucketInstanceId,
        sourceLineageSetRef: attribution.sourceLineageSetRef,
        ...(attribution.attributedAmountMinor === undefined
          ? {}
          : { attributedAmountMinor: attribution.attributedAmountMinor }),
      }),
    );
  }

  return Object.freeze(projected);
}

/**
 * Pure dormant I04 assembly. I03 remains the mathematical allocation authority;
 * this layer only verifies, maps, derives HELD and fingerprints the final plan.
 */
export function assembleLegalApplicationPlan(
  input: AssembleLegalApplicationPlanInput,
): LegalApplicationPlanResult {
  const contextError = commandContextError(input);
  if (contextError !== undefined) {
    return failure(contextError);
  }
  const resultError = allocationError(input);
  if (resultError !== undefined) {
    return failure(resultError);
  }
  if (!input.allocationResult.ok) {
    return failure(input.allocationResult.error.code);
  }

  const applications = plannedApplications(input.allocationResult.allocations);
  const held = heldFacts(
    input.allocationResult.totalAppliedMinor,
    input.allocationResult.remainingAmountMinor,
  );
  const snapshot = input.validatedSnapshot.snapshot;

  const fingerprint = fingerprintLegalApplicationPlan({
    direction: 'APPLY',
    tenantId: input.command.tenantId,
    caseId: input.command.caseId,
    collectionId: input.command.collectionId,
    currency: input.command.currency,
    minorUnit: input.command.minorUnit,
    effectiveDate: input.command.applicationEffectiveDate,
    snapshotRef: input.validatedSnapshot.snapshotRef,
    snapshotHash: input.validatedSnapshot.snapshotHash,
    sourceVersionSetHash: snapshot.sourceVersionSetHash,
    historyBoundaryRef: snapshot.historyBoundaryRef,
    receiptAmountMinor: input.command.receiptAmountMinor,
    appliedAmountMinor: input.allocationResult.totalAppliedMinor,
    heldRemainderMinor: held.heldRemainderMinor,
    heldReason: held.identityReason,
    applications,
  });
  if (!fingerprint.ok) {
    return failure(fingerprint.error.code);
  }

  const plan: LegalApplicationPlan = Object.freeze({
    direction: 'APPLY',
    planFingerprint: fingerprint.planFingerprint,
    tenantId: input.command.tenantId,
    caseId: input.command.caseId,
    collectionId: input.command.collectionId,
    currency: input.command.currency,
    minorUnit: input.command.minorUnit,
    snapshotRef: input.validatedSnapshot.snapshotRef,
    snapshotHash: input.validatedSnapshot.snapshotHash,
    sourceVersionSetHash: snapshot.sourceVersionSetHash,
    historyBoundaryRef: snapshot.historyBoundaryRef,
    applicationEffectiveDate: input.command.applicationEffectiveDate,
    receiptAmountMinor: input.command.receiptAmountMinor,
    appliedAmountMinor: input.allocationResult.totalAppliedMinor,
    heldRemainderMinor: held.heldRemainderMinor,
    ...(held.runtimeReason === undefined ? {} : { heldReason: held.runtimeReason }),
    applications,
    attributions: projectAttributions(input.attributions, applications),
  });

  return Object.freeze({ ok: true, plan });
}
