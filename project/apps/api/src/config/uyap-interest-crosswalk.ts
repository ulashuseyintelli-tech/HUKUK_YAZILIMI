import { InterestTypeCode } from '@prisma/client';

export type UyapInterestProjection = 'NUMERIC' | 'FAIZT';

export type UyapProjectionVerification =
  | 'OWNER_LEGAL_ACCEPTED'
  | 'VERIFIED_OFFICIAL'
  | 'UNVERIFIED';

export type UyapProjectionRequiredContext =
  | 'POSITIVE_USER_SUPPLIED_RATE'
  | 'EXACT_MAPPING_ACCEPTANCE'
  | 'EXPLICIT_LEGAL_BASIS'
  | 'EXPLICIT_DEPOSIT_TERM';

export type UyapNumericInterestCode = '1' | '2' | '4' | '6';
export type UyapFaiztInterestCode = 'FAIZT00002' | 'FAIZT00007' | 'FAIZT00017';

export type UyapProjectionEvidence =
  | Readonly<{
      kind: 'OWNER_DECISION';
      reference: 'PR-A4-3_D1_D9';
    }>
  | Readonly<{
      kind: 'OFFICIAL_UYAP_DOCUMENT' | 'CONTROLLED_PRODUCTION_VALIDATION';
      reference: string;
    }>;

export type UyapProjectionCell<Code extends string> =
  | Readonly<{
      verification: 'OWNER_LEGAL_ACCEPTED';
      code: Code;
      evidence: Extract<UyapProjectionEvidence, { kind: 'OWNER_DECISION' }>;
      requiredContext: readonly UyapProjectionRequiredContext[];
    }>
  | Readonly<{
      verification: 'VERIFIED_OFFICIAL';
      code: Code;
      evidence: Extract<
        UyapProjectionEvidence,
        { kind: 'OFFICIAL_UYAP_DOCUMENT' | 'CONTROLLED_PRODUCTION_VALIDATION' }
      >;
      requiredContext: readonly UyapProjectionRequiredContext[];
    }>
  | Readonly<{
      verification: 'UNVERIFIED';
      code: null;
      evidence: null;
      requiredContext: readonly UyapProjectionRequiredContext[];
    }>;

export interface UyapInterestCrosswalkEntry {
  readonly numeric: UyapProjectionCell<UyapNumericInterestCode>;
  readonly faizt: UyapProjectionCell<UyapFaiztInterestCode>;
}

const NO_CONTEXT = Object.freeze([]) as readonly UyapProjectionRequiredContext[];
const OWNER_DECISION_EVIDENCE = Object.freeze({
  kind: 'OWNER_DECISION' as const,
  reference: 'PR-A4-3_D1_D9' as const,
});

function accepted<Code extends string>(
  code: Code,
  requiredContext: readonly UyapProjectionRequiredContext[] = NO_CONTEXT,
): UyapProjectionCell<Code> {
  return Object.freeze({
    verification: 'OWNER_LEGAL_ACCEPTED' as const,
    code,
    evidence: OWNER_DECISION_EVIDENCE,
    requiredContext: Object.freeze([...requiredContext]),
  });
}

function unverified<Code extends string>(
  requiredContext: readonly UyapProjectionRequiredContext[],
): UyapProjectionCell<Code> {
  return Object.freeze({
    verification: 'UNVERIFIED' as const,
    code: null,
    evidence: null,
    requiredContext: Object.freeze([...requiredContext]),
  });
}

function entry(
  numeric: UyapProjectionCell<UyapNumericInterestCode>,
  faizt: UyapProjectionCell<UyapFaiztInterestCode>,
): UyapInterestCrosswalkEntry {
  return Object.freeze({ numeric, faizt });
}

const EXACT_MAPPING_REQUIRED = ['EXACT_MAPPING_ACCEPTANCE'] as const;
const FIXED_MAPPING_REQUIRED = [
  'POSITIVE_USER_SUPPLIED_RATE',
  'EXACT_MAPPING_ACCEPTANCE',
] as const;
const DEPOSIT_FAIZT_CONTEXT_REQUIRED = [
  'EXACT_MAPPING_ACCEPTANCE',
  'EXPLICIT_LEGAL_BASIS',
  'EXPLICIT_DEPOSIT_TERM',
] as const;

/**
 * PR-A4-R1 canonical UYAP interest projection contract.
 *
 * This registry is deliberately dormant: exporters do not import it in R1. It
 * records the owner-accepted projection cells independently and keeps every
 * unresolved cell code-less and fail-closed.
 */
export const UYAP_INTEREST_CROSSWALK = Object.freeze({
  [InterestTypeCode.LEGAL_3095]: entry(
    accepted('1'),
    accepted('FAIZT00002'),
  ),
  [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: entry(
    accepted('4'),
    accepted('FAIZT00007'),
  ),
  [InterestTypeCode.TTK_1530]: entry(
    accepted('2'),
    accepted('FAIZT00017'),
  ),
  [InterestTypeCode.CONTRACTUAL]: entry(
    accepted('6', ['POSITIVE_USER_SUPPLIED_RATE']),
    unverified<UyapFaiztInterestCode>(FIXED_MAPPING_REQUIRED),
  ),
  [InterestTypeCode.COMMERCIAL_FIXED]: entry(
    unverified<UyapNumericInterestCode>(FIXED_MAPPING_REQUIRED),
    unverified<UyapFaiztInterestCode>(FIXED_MAPPING_REQUIRED),
  ),
  [InterestTypeCode.MEVDUAT_TL_BANKALARCA]: entry(
    unverified<UyapNumericInterestCode>(EXACT_MAPPING_REQUIRED),
    unverified<UyapFaiztInterestCode>(DEPOSIT_FAIZT_CONTEXT_REQUIRED),
  ),
  [InterestTypeCode.MEVDUAT_USD_BANKALARCA]: entry(
    unverified<UyapNumericInterestCode>(EXACT_MAPPING_REQUIRED),
    unverified<UyapFaiztInterestCode>(DEPOSIT_FAIZT_CONTEXT_REQUIRED),
  ),
  [InterestTypeCode.MEVDUAT_EUR_BANKALARCA]: entry(
    unverified<UyapNumericInterestCode>(EXACT_MAPPING_REQUIRED),
    unverified<UyapFaiztInterestCode>(DEPOSIT_FAIZT_CONTEXT_REQUIRED),
  ),
  [InterestTypeCode.MEVDUAT_TL_KAMU]: entry(
    unverified<UyapNumericInterestCode>(EXACT_MAPPING_REQUIRED),
    unverified<UyapFaiztInterestCode>(DEPOSIT_FAIZT_CONTEXT_REQUIRED),
  ),
  [InterestTypeCode.MEVDUAT_USD_KAMU]: entry(
    unverified<UyapNumericInterestCode>(EXACT_MAPPING_REQUIRED),
    unverified<UyapFaiztInterestCode>(DEPOSIT_FAIZT_CONTEXT_REQUIRED),
  ),
  [InterestTypeCode.MEVDUAT_EUR_KAMU]: entry(
    unverified<UyapNumericInterestCode>(EXACT_MAPPING_REQUIRED),
    unverified<UyapFaiztInterestCode>(DEPOSIT_FAIZT_CONTEXT_REQUIRED),
  ),
} satisfies Record<InterestTypeCode, UyapInterestCrosswalkEntry>);

export interface ResolveUyapInterestProjectionInput {
  readonly interestTypeCode: InterestTypeCode | string;
  readonly projection: UyapInterestProjection;
  readonly interestRate?: number | null;
}

export interface ResolvedUyapInterestProjection {
  readonly ok: true;
  readonly status: 'PROJECTED';
  readonly canonicalCode: InterestTypeCode;
  readonly projection: UyapInterestProjection;
  readonly verification: Exclude<UyapProjectionVerification, 'UNVERIFIED'>;
  readonly evidence: UyapProjectionEvidence;
  readonly code: UyapNumericInterestCode | UyapFaiztInterestCode;
  readonly interestRate: number | null;
}

export interface RejectedUyapInterestProjection {
  readonly ok: false;
  readonly status:
    | 'UNKNOWN_CANONICAL_CODE'
    | 'UNVERIFIED_PROJECTION'
    | 'REQUIRED_CONTEXT_MISSING';
  readonly canonicalCode: string;
  readonly projection: UyapInterestProjection;
  readonly requiredContext: readonly UyapProjectionRequiredContext[];
}

export type UyapInterestProjectionResult =
  | ResolvedUyapInterestProjection
  | RejectedUyapInterestProjection;

function isInterestTypeCode(value: string): value is InterestTypeCode {
  return (Object.values(InterestTypeCode) as string[]).includes(value);
}

function projectionCell(
  canonicalCode: InterestTypeCode,
  projection: UyapInterestProjection,
): UyapProjectionCell<UyapNumericInterestCode | UyapFaiztInterestCode> {
  const crosswalk = UYAP_INTEREST_CROSSWALK[canonicalCode];
  return projection === 'NUMERIC' ? crosswalk.numeric : crosswalk.faizt;
}

/**
 * Resolves only canonical rich identity into a selected external code space.
 * Unknown, unverified, or context-incomplete inputs return an explicit rejected
 * result; this function never guesses, aliases, or supplies a fallback code.
 */
export function resolveUyapInterestProjection(
  input: ResolveUyapInterestProjectionInput,
): UyapInterestProjectionResult {
  if (!isInterestTypeCode(input.interestTypeCode)) {
    return {
      ok: false,
      status: 'UNKNOWN_CANONICAL_CODE',
      canonicalCode: input.interestTypeCode,
      projection: input.projection,
      requiredContext: NO_CONTEXT,
    };
  }

  const cell = projectionCell(input.interestTypeCode, input.projection);
  if (cell.verification === 'UNVERIFIED' || cell.code === null) {
    return {
      ok: false,
      status: 'UNVERIFIED_PROJECTION',
      canonicalCode: input.interestTypeCode,
      projection: input.projection,
      requiredContext: cell.requiredContext,
    };
  }

  if (
    cell.requiredContext.includes('POSITIVE_USER_SUPPLIED_RATE') &&
    (typeof input.interestRate !== 'number' ||
      !Number.isFinite(input.interestRate) ||
      input.interestRate <= 0)
  ) {
    return {
      ok: false,
      status: 'REQUIRED_CONTEXT_MISSING',
      canonicalCode: input.interestTypeCode,
      projection: input.projection,
      requiredContext: cell.requiredContext,
    };
  }

  return {
    ok: true,
    status: 'PROJECTED',
    canonicalCode: input.interestTypeCode,
    projection: input.projection,
    verification: cell.verification,
    evidence: cell.evidence,
    code: cell.code,
    interestRate: cell.requiredContext.includes('POSITIVE_USER_SUPPLIED_RATE')
      ? input.interestRate!
      : null,
  };
}
