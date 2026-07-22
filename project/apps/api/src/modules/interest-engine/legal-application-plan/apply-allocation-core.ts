import {
  POSTGRES_BIGINT_MAX,
  POSTGRES_INTEGER_MAX,
  type AppliedAmountMinor,
  type BucketBalanceMinor,
  type BucketContextKey,
  type BucketInstanceId,
  type ComponentCode,
  type MinorAmount,
  type SourceLineageSetRef,
} from './primitives';
import type {
  LegalApplicationComponentType,
  LegalApplicationPlanError,
} from './contracts';
import type {
  ValidatedCanonicalLegalBucketV1,
  ValidatedCanonicalSnapshotV1,
} from './canonical-snapshot-validator';
import {
  compareBucketContextKeysUtf8,
  legalApplicationComponentRank,
  type LegalApplicationComponentRank,
} from './allocation-order';

export interface PureApplyAllocationInput {
  readonly validatedSnapshot: ValidatedCanonicalSnapshotV1;
  readonly direction: unknown;
  readonly receiptAmountMinor: bigint;
}

export interface PureAppliedBucketAllocation {
  readonly componentType: LegalApplicationComponentType;
  readonly componentCode: ComponentCode;
  readonly priorityRank: number;
  readonly bucketContextKey: BucketContextKey;
  readonly bucketInstanceId: BucketInstanceId;
  readonly sourceLineageSetRef: SourceLineageSetRef;
  readonly bucketBeforeMinor: BucketBalanceMinor;
  readonly appliedAmountMinor: AppliedAmountMinor;
  readonly bucketAfterMinor: BucketBalanceMinor;
}

export interface PureApplyAllocationSuccess {
  readonly ok: true;
  readonly allocations: readonly PureAppliedBucketAllocation[];
  readonly totalAppliedMinor: AppliedAmountMinor;
  readonly remainingAmountMinor: MinorAmount;
}

export interface PureApplyAllocationFailure {
  readonly ok: false;
  readonly error: LegalApplicationPlanError;
}

export type PureApplyAllocationResult =
  | PureApplyAllocationSuccess
  | PureApplyAllocationFailure;

interface RankedBucket {
  readonly componentRank: LegalApplicationComponentRank;
  readonly bucket: ValidatedCanonicalLegalBucketV1;
}

function failure(code: LegalApplicationPlanError['code']): PureApplyAllocationFailure {
  return Object.freeze({ ok: false, error: Object.freeze({ code }) });
}

function isPersistenceSafeMinorAmount(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= POSTGRES_BIGINT_MAX;
}

function compareRankedBuckets(left: RankedBucket, right: RankedBucket): number {
  if (left.componentRank !== right.componentRank) {
    return left.componentRank < right.componentRank ? -1 : 1;
  }
  if (left.bucket.priorityRank !== right.bucket.priorityRank) {
    return left.bucket.priorityRank < right.bucket.priorityRank ? -1 : 1;
  }
  return compareBucketContextKeysUtf8(
    left.bucket.bucketContextKey,
    right.bucket.bucketContextKey,
  );
}

function rankAndValidateBuckets(
  validatedSnapshot: ValidatedCanonicalSnapshotV1,
): readonly RankedBucket[] | PureApplyAllocationFailure {
  const rankedBuckets: RankedBucket[] = [];
  const contextKeys = new Set<string>();

  for (const bucket of validatedSnapshot.snapshot.canonicalBuckets) {
    const componentRank = legalApplicationComponentRank(bucket.componentType);
    if (componentRank === undefined) {
      return failure('BUCKET_CONTEXT_UNMAPPED');
    }
    if (
      !Number.isInteger(bucket.priorityRank) ||
      bucket.priorityRank < 0 ||
      bucket.priorityRank > POSTGRES_INTEGER_MAX
    ) {
      return failure('BUCKET_CONTEXT_UNMAPPED');
    }
    if (
      typeof bucket.bucketContextKey !== 'string' ||
      bucket.bucketContextKey.length === 0 ||
      typeof bucket.bucketInstanceId !== 'string' ||
      bucket.bucketInstanceId.length === 0
    ) {
      return failure('BUCKET_IDENTITY_INVALID');
    }
    if (contextKeys.has(bucket.bucketContextKey)) {
      return failure('DUPLICATE_BUCKET_CONTEXT');
    }
    contextKeys.add(bucket.bucketContextKey);

    if (!isPersistenceSafeMinorAmount(bucket.bucketBalanceMinor)) {
      return failure('AMOUNT_OUT_OF_RANGE');
    }
    if (
      bucket.currency !== validatedSnapshot.snapshot.currency ||
      bucket.minorUnit !== validatedSnapshot.snapshot.minorUnit
    ) {
      return failure('CURRENCY_OR_MINOR_UNIT_INVALID');
    }

    rankedBuckets.push(Object.freeze({ componentRank, bucket }));
  }

  return Object.freeze([...rankedBuckets].sort(compareRankedBuckets));
}

function asBucketBalanceMinor(value: bigint): BucketBalanceMinor {
  return value as BucketBalanceMinor;
}

function asAppliedAmountMinor(value: bigint): AppliedAmountMinor {
  return value as AppliedAmountMinor;
}

function asMinorAmount(value: bigint): MinorAmount {
  return value as MinorAmount;
}

/**
 * Pure APPLY allocation core. The validated snapshot is the only legal-bucket input authority.
 * This function deliberately does not derive HELD semantics or a final LegalApplicationPlan.
 */
export function allocateValidatedSnapshotForApply(
  input: PureApplyAllocationInput,
): PureApplyAllocationResult {
  if (input.direction !== 'APPLY') {
    return failure('DIRECTION_NOT_AUTHORIZED');
  }
  if (
    !isPersistenceSafeMinorAmount(input.receiptAmountMinor) ||
    input.receiptAmountMinor === 0n ||
    input.receiptAmountMinor !== input.validatedSnapshot.snapshot.receiptAmountMinor
  ) {
    return failure('RECEIPT_AMOUNT_INVALID');
  }

  const rankedBuckets = rankAndValidateBuckets(input.validatedSnapshot);
  if ('ok' in rankedBuckets) {
    return rankedBuckets;
  }

  let remainingMinor = input.receiptAmountMinor;
  const allocations: PureAppliedBucketAllocation[] = [];

  for (const { bucket } of rankedBuckets) {
    if (remainingMinor === 0n) {
      break;
    }
    if (bucket.bucketBalanceMinor === 0n) {
      continue;
    }

    const remainingBeforeMinor = remainingMinor;
    const appliedMinor =
      bucket.bucketBalanceMinor < remainingBeforeMinor
        ? bucket.bucketBalanceMinor
        : remainingBeforeMinor;
    const bucketAfterMinor = bucket.bucketBalanceMinor - appliedMinor;
    const remainingAfterMinor = remainingBeforeMinor - appliedMinor;

    if (
      appliedMinor <= 0n ||
      bucketAfterMinor < 0n ||
      remainingAfterMinor < 0n ||
      appliedMinor > bucket.bucketBalanceMinor ||
      appliedMinor > remainingBeforeMinor ||
      !isPersistenceSafeMinorAmount(bucketAfterMinor) ||
      !isPersistenceSafeMinorAmount(remainingAfterMinor)
    ) {
      return failure('CONSERVATION_FAILURE');
    }

    allocations.push(
      Object.freeze({
        componentType: bucket.componentType,
        componentCode: bucket.componentCode,
        priorityRank: bucket.priorityRank,
        bucketContextKey: bucket.bucketContextKey,
        bucketInstanceId: bucket.bucketInstanceId,
        sourceLineageSetRef: bucket.sourceLineageSetRef,
        bucketBeforeMinor: bucket.bucketBalanceMinor,
        appliedAmountMinor: asAppliedAmountMinor(appliedMinor),
        bucketAfterMinor: asBucketBalanceMinor(bucketAfterMinor),
      }),
    );
    remainingMinor = remainingAfterMinor;
  }

  const totalAppliedMinor = input.receiptAmountMinor - remainingMinor;
  let allocationSumMinor = 0n;
  for (const allocation of allocations) {
    allocationSumMinor += allocation.appliedAmountMinor;
    if (
      allocation.bucketBeforeMinor !==
      allocation.appliedAmountMinor + allocation.bucketAfterMinor
    ) {
      return failure('CONSERVATION_FAILURE');
    }
  }

  if (
    !isPersistenceSafeMinorAmount(totalAppliedMinor) ||
    allocationSumMinor !== totalAppliedMinor ||
    input.receiptAmountMinor !== totalAppliedMinor + remainingMinor
  ) {
    return failure('CONSERVATION_FAILURE');
  }

  return Object.freeze({
    ok: true,
    allocations: Object.freeze(allocations),
    totalAppliedMinor: asAppliedAmountMinor(totalAppliedMinor),
    remainingAmountMinor: asMinorAmount(remainingMinor),
  });
}
