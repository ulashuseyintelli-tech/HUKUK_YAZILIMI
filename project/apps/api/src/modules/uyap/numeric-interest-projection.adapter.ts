import { InterestAccrualStatus, InterestTypeCode } from '@prisma/client';

import {
  resolveUyapInterestProjection,
  UyapNumericInterestCode,
  UyapProjectionEvidence,
  UyapProjectionRequiredContext,
  UyapProjectionVerification,
} from '../../config/uyap-interest-crosswalk';

/**
 * PR-A4-N1 dormant boundary.
 *
 * This adapter is deliberately not imported by a controller, exporter, XML
 * builder, or submit path. It resolves a persisted ClaimItem interest snapshot
 * into a typed numeric projection result without mutating domain state.
 */

export type NumericInterestRateInput = number | string | { toString(): string } | null;

export interface NumericInterestProjectionInput {
  readonly claimItemId: string;
  readonly interestAccrualStatus: InterestAccrualStatus | string;
  readonly interestTypeCode: InterestTypeCode | string | null;
  readonly legacyInterestType: string | null;
  readonly interestRate: NumericInterestRateInput;
  readonly interestStartDate: Date | string | null;
  readonly interestStartDateProvenance?: string | null;
}

export interface ProjectedNumericInterest {
  readonly ok: true;
  readonly status: 'PROJECTED';
  readonly claimItemId: string;
  readonly sourceAuthority: 'RICH' | 'STRICT_LEGACY_COMPATIBILITY';
  readonly canonicalCode: InterestTypeCode;
  readonly numericCode: UyapNumericInterestCode;
  readonly verification: Exclude<UyapProjectionVerification, 'UNVERIFIED'>;
  readonly evidence: UyapProjectionEvidence;
  readonly interestRate: number | null;
  readonly interestStartDate: string;
}

export interface NoInterestNumericProjection {
  readonly ok: true;
  readonly status: 'NO_INTEREST';
  readonly claimItemId: string;
  readonly omitInterestElement: true;
}

export type NumericInterestProjectionFailureStatus =
  | 'UNVERIFIED'
  | 'INVALID_RATE'
  | 'UNKNOWN_CANONICAL_CODE'
  | 'LEGACY_AMBIGUOUS'
  | 'MISSING_START_DATE'
  | 'RICH_LEGACY_MISMATCH'
  | 'INVALID_INTEREST_STATE';

export interface RejectedNumericInterestProjection {
  readonly ok: false;
  readonly status: NumericInterestProjectionFailureStatus;
  readonly claimItemId: string;
  readonly canonicalCode: string | null;
  readonly legacyInterestType: string | null;
  readonly requiredContext: readonly UyapProjectionRequiredContext[];
  readonly detail:
    | 'ACCRUAL_STATUS_NOT_RESOLVED'
    | 'INTEREST_AUTHORITY_MISSING'
    | 'NO_INTEREST_CONFIGURATION_CONFLICT'
    | 'RICH_LEGACY_MIRROR_CONFLICT'
    | 'LEGACY_IDENTITY_NOT_LOSSLESS'
    | 'RATE_MISSING_OR_INVALID'
    | 'VARIABLE_RATE_MUST_BE_NULL'
    | 'START_DATE_MISSING_OR_INVALID'
    | 'CANONICAL_CODE_UNKNOWN'
    | 'PROJECTION_NOT_OWNER_ACCEPTED';
}

export type NumericInterestProjectionAdapterResult =
  | ProjectedNumericInterest
  | NoInterestNumericProjection
  | RejectedNumericInterestProjection;

const NO_CONTEXT = Object.freeze([]) as readonly UyapProjectionRequiredContext[];

const FIXED_CODES: ReadonlySet<InterestTypeCode> = new Set([
  InterestTypeCode.CONTRACTUAL,
  InterestTypeCode.COMMERCIAL_FIXED,
]);

/** Identity mirror validation only; external numeric codes remain crosswalk-owned. */
const EXPECTED_LEGACY_MIRROR: Partial<Record<InterestTypeCode, string>> = Object.freeze({
  [InterestTypeCode.LEGAL_3095]: 'YASAL',
  [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: 'TICARI',
  [InterestTypeCode.COMMERCIAL_FIXED]: 'SABIT',
});

function reject(
  input: NumericInterestProjectionInput,
  status: NumericInterestProjectionFailureStatus,
  detail: RejectedNumericInterestProjection['detail'],
  canonicalCode: string | null,
  requiredContext: readonly UyapProjectionRequiredContext[] = NO_CONTEXT,
): RejectedNumericInterestProjection {
  return Object.freeze({
    ok: false,
    status,
    claimItemId: input.claimItemId,
    canonicalCode,
    legacyInterestType: input.legacyInterestType,
    requiredContext: Object.freeze([...requiredContext]),
    detail,
  });
}

function isCanonicalCode(value: string): value is InterestTypeCode {
  return (Object.values(InterestTypeCode) as string[]).includes(value);
}

function numericRate(value: NumericInterestRateInput): number | null {
  if (value === null) return null;
  try {
    const raw = typeof value === 'number' ? value : value.toString().trim();
    if (raw === '') return Number.NaN;
    return typeof raw === 'number' ? raw : Number(raw);
  } catch {
    return Number.NaN;
  }
}

function canonicalDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }

  const match = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(value);
  if (!match) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

function isNumericCode(value: string): value is UyapNumericInterestCode {
  return value === '1' || value === '2' || value === '4' || value === '6';
}

function hasInterestConfiguration(input: NumericInterestProjectionInput): boolean {
  return Boolean(
    input.interestTypeCode ||
      input.legacyInterestType ||
      input.interestRate !== null ||
      input.interestStartDate ||
      input.interestStartDateProvenance,
  );
}

/**
 * Resolves a single ClaimItem snapshot. No due/case fallback, inference, write,
 * exporter call, XML serialization, or submit side effect is permitted here.
 */
export function resolveDormantNumericInterestProjection(
  input: NumericInterestProjectionInput,
): NumericInterestProjectionAdapterResult {
  if (input.interestAccrualStatus === InterestAccrualStatus.NO_INTEREST) {
    if (hasInterestConfiguration(input)) {
      return reject(
        input,
        'INVALID_INTEREST_STATE',
        'NO_INTEREST_CONFIGURATION_CONFLICT',
        input.interestTypeCode,
      );
    }
    return Object.freeze({
      ok: true,
      status: 'NO_INTEREST',
      claimItemId: input.claimItemId,
      omitInterestElement: true,
    });
  }

  if (input.interestAccrualStatus !== InterestAccrualStatus.ACCRUES) {
    return reject(
      input,
      'INVALID_INTEREST_STATE',
      'ACCRUAL_STATUS_NOT_RESOLVED',
      input.interestTypeCode,
    );
  }

  let canonicalCode: InterestTypeCode;
  let sourceAuthority: ProjectedNumericInterest['sourceAuthority'];

  if (input.interestTypeCode !== null) {
    if (!isCanonicalCode(input.interestTypeCode)) {
      return reject(
        input,
        'UNKNOWN_CANONICAL_CODE',
        'CANONICAL_CODE_UNKNOWN',
        input.interestTypeCode,
      );
    }
    canonicalCode = input.interestTypeCode;
    sourceAuthority = 'RICH';

    if (input.legacyInterestType) {
      const expectedLegacy = EXPECTED_LEGACY_MIRROR[canonicalCode];
      if (expectedLegacy !== input.legacyInterestType) {
        return reject(
          input,
          'RICH_LEGACY_MISMATCH',
          'RICH_LEGACY_MIRROR_CONFLICT',
          canonicalCode,
        );
      }
    }
  } else if (input.legacyInterestType) {
    if (input.legacyInterestType !== 'YASAL') {
      return reject(
        input,
        'LEGACY_AMBIGUOUS',
        'LEGACY_IDENTITY_NOT_LOSSLESS',
        null,
      );
    }
    canonicalCode = InterestTypeCode.LEGAL_3095;
    sourceAuthority = 'STRICT_LEGACY_COMPATIBILITY';
  } else {
    return reject(
      input,
      'INVALID_INTEREST_STATE',
      'INTEREST_AUTHORITY_MISSING',
      null,
    );
  }

  const rate = numericRate(input.interestRate);
  if (FIXED_CODES.has(canonicalCode)) {
    if (rate === null || !Number.isFinite(rate) || rate <= 0) {
      return reject(input, 'INVALID_RATE', 'RATE_MISSING_OR_INVALID', canonicalCode);
    }
  } else if (rate !== null) {
    return reject(input, 'INVALID_RATE', 'VARIABLE_RATE_MUST_BE_NULL', canonicalCode);
  }

  const interestStartDate = canonicalDate(input.interestStartDate);
  if (interestStartDate === null) {
    return reject(
      input,
      'MISSING_START_DATE',
      'START_DATE_MISSING_OR_INVALID',
      canonicalCode,
    );
  }

  const projection = resolveUyapInterestProjection({
    interestTypeCode: canonicalCode,
    projection: 'NUMERIC',
    interestRate: rate,
  });

  if (!projection.ok) {
    if (projection.status === 'UNVERIFIED_PROJECTION') {
      return reject(
        input,
        'UNVERIFIED',
        'PROJECTION_NOT_OWNER_ACCEPTED',
        canonicalCode,
        projection.requiredContext,
      );
    }
    if (projection.status === 'REQUIRED_CONTEXT_MISSING') {
      return reject(
        input,
        'INVALID_RATE',
        'RATE_MISSING_OR_INVALID',
        canonicalCode,
        projection.requiredContext,
      );
    }
    return reject(
      input,
      'UNKNOWN_CANONICAL_CODE',
      'CANONICAL_CODE_UNKNOWN',
      canonicalCode,
      projection.requiredContext,
    );
  }

  if (!isNumericCode(projection.code)) {
    return reject(
      input,
      'INVALID_INTEREST_STATE',
      'PROJECTION_NOT_OWNER_ACCEPTED',
      canonicalCode,
    );
  }

  return Object.freeze({
    ok: true,
    status: 'PROJECTED',
    claimItemId: input.claimItemId,
    sourceAuthority,
    canonicalCode,
    numericCode: projection.code,
    verification: projection.verification,
    evidence: projection.evidence,
    interestRate: projection.interestRate,
    interestStartDate,
  });
}
