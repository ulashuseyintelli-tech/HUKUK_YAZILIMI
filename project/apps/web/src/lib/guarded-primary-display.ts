import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import type {
  BalanceDisplayShadowDiffReport,
  ShadowBucketDiff,
} from '@/lib/api/balance-shadow-diff';
import type { CaseCalculationResult } from '@/hooks/useCaseCalculation';

type SearchParamsLike = Pick<URLSearchParams, 'get'>;

export type GuardedPrimaryDisplaySource =
  | 'CANONICAL_PRIMARY_CANDIDATE'
  | 'LEGACY_CALCULATION_SUMMARY';

export interface GuardedPrimaryDisplayPolicy {
  featureFlagEnabled?: boolean;
  scenarioSupported?: boolean;
  paymentDesignationRequired?: boolean;
  unsupportedPeriodicObligation?: boolean;
  claimItemAuthorityContaminated?: boolean;
}

export interface GuardedPrimaryDisplayDecision {
  primarySource: GuardedPrimaryDisplaySource;
  reasonCodes: string[];
}

interface CanonicalPrimaryAmounts {
  principalAmount: number;
  totalDebtAmount: number;
  outstandingAmount: number;
  totalPaidAmount: number;
  interestAmount: number;
  costsAmount: number;
  attorneyFeeAmount: number;
}

type CanonicalDisplayedAmountField =
  | 'totalPaidAmount'
  | 'interestAmount'
  | 'costsAmount'
  | 'attorneyFeeAmount';

const CANONICAL_DISPLAYED_AMOUNT_FIELDS: readonly CanonicalDisplayedAmountField[] = [
  'totalPaidAmount',
  'interestAmount',
  'costsAmount',
  'attorneyFeeAmount',
];

export type GuardedSummaryRuntimeBoundarySource =
  | 'CANONICAL_PRIMARY_OVERRIDE'
  | 'LEGACY_BACKEND_CONTRACT_RETAINED'
  | 'LEGACY_DIAGNOSTIC_RETAINED'
  | 'MIXED_CANONICAL_LEGACY_CONTEXT'
  | 'LEGACY_FALLBACK';

export type GuardedSummaryRuntimeBoundaryPlacement =
  | 'PRIMARY_CANONICAL_OVERRIDE'
  | 'BACKEND_CONTRACT_REQUIRED_RETAINED'
  | 'LEGACY_DIAGNOSTIC_RETAINED'
  | 'MIXED_AUTHORITY_BLOCKED'
  | 'FALLBACK_LEGACY_SURFACE';

export type GuardedSummaryRuntimeBoundaryRowId =
  | 'asilAlacak'
  | 'takipTutari'
  | 'takipSonrasiFaiz'
  | 'icraMasraflari'
  | 'vekaletUcreti'
  | 'toplamBorc'
  | 'sonBorc'
  | 'toplamTahsilat'
  | 'kalanBorc'
  | 'kalanAnapara'
  | 'tazminat'
  | 'komisyon'
  | 'takipOncesiFaiz'
  | 'basvurmaHarci'
  | 'vekaletHarci'
  | 'pesinHarc'
  | 'dosyaGideri'
  | 'tebligatGideri'
  | 'vekaletPulu'
  | 'pesinHarcDahilTahsilHarci'
  | 'pesinHarcHaricTahsilHarci'
  | 'tahsilOranlari'
  | 'mahsupDetaylari'
  | 'faizSegmentleri'
  | 'takipTarihi'
  | 'kalemTuru'
  | 'mahsupDetayPanelContext';

export interface GuardedSummaryRuntimeBoundaryDecision {
  rowId: GuardedSummaryRuntimeBoundaryRowId;
  runtimeSource: GuardedSummaryRuntimeBoundarySource;
  placement: GuardedSummaryRuntimeBoundaryPlacement;
  reason: string;
}

export interface GuardedSummaryRuntimeBoundaryPlan {
  guardedPrimarySelected: boolean;
  decisions: GuardedSummaryRuntimeBoundaryDecision[];
  summary: {
    canonicalPrimaryOverrideRowIds: GuardedSummaryRuntimeBoundaryRowId[];
    legacyDiagnosticRetainedRowIds: GuardedSummaryRuntimeBoundaryRowId[];
    backendContractRequiredRowIds: GuardedSummaryRuntimeBoundaryRowId[];
    mixedAuthorityBlockedRowIds: GuardedSummaryRuntimeBoundaryRowId[];
    fallbackLegacyRowIds: GuardedSummaryRuntimeBoundaryRowId[];
  };
}

const GUARDED_SUMMARY_CANONICAL_PRIMARY_OVERRIDE_ROW_IDS: readonly GuardedSummaryRuntimeBoundaryRowId[] = [
  'asilAlacak',
  'takipTutari',
  'takipSonrasiFaiz',
  'icraMasraflari',
  'vekaletUcreti',
  'toplamBorc',
  'sonBorc',
  'toplamTahsilat',
  'kalanBorc',
  'kalanAnapara',
];

const GUARDED_SUMMARY_BACKEND_CONTRACT_REQUIRED_ROW_IDS: readonly GuardedSummaryRuntimeBoundaryRowId[] = [
  'tazminat',
  'komisyon',
  'takipOncesiFaiz',
];

const GUARDED_SUMMARY_LEGACY_DIAGNOSTIC_RETAINED_ROW_IDS: readonly GuardedSummaryRuntimeBoundaryRowId[] = [
  'basvurmaHarci',
  'vekaletHarci',
  'pesinHarc',
  'dosyaGideri',
  'tebligatGideri',
  'vekaletPulu',
  'pesinHarcDahilTahsilHarci',
  'pesinHarcHaricTahsilHarci',
  'tahsilOranlari',
  'mahsupDetaylari',
  'faizSegmentleri',
  'takipTarihi',
  'kalemTuru',
];

const GUARDED_SUMMARY_MIXED_AUTHORITY_BLOCKED_ROW_IDS: readonly GuardedSummaryRuntimeBoundaryRowId[] = [
  'mahsupDetayPanelContext',
];

const GUARDED_SUMMARY_RUNTIME_ROW_IDS: readonly GuardedSummaryRuntimeBoundaryRowId[] = [
  ...GUARDED_SUMMARY_CANONICAL_PRIMARY_OVERRIDE_ROW_IDS,
  ...GUARDED_SUMMARY_BACKEND_CONTRACT_REQUIRED_ROW_IDS,
  ...GUARDED_SUMMARY_LEGACY_DIAGNOSTIC_RETAINED_ROW_IDS,
  ...GUARDED_SUMMARY_MIXED_AUTHORITY_BLOCKED_ROW_IDS,
];

function runtimeBoundaryDecision(
  rowId: GuardedSummaryRuntimeBoundaryRowId,
  runtimeSource: GuardedSummaryRuntimeBoundarySource,
  placement: GuardedSummaryRuntimeBoundaryPlacement,
  reason: string,
): GuardedSummaryRuntimeBoundaryDecision {
  return { rowId, runtimeSource, placement, reason };
}

export function buildGuardedSummaryRuntimeBoundaryPlan({
  guardedPrimarySelected,
}: {
  guardedPrimarySelected: boolean;
}): GuardedSummaryRuntimeBoundaryPlan {
  if (!guardedPrimarySelected) {
    return {
      guardedPrimarySelected: false,
      decisions: GUARDED_SUMMARY_RUNTIME_ROW_IDS.map((rowId) => runtimeBoundaryDecision(
        rowId,
        'LEGACY_FALLBACK',
        'FALLBACK_LEGACY_SURFACE',
        'Guarded primary is not selected; the runtime surface remains legacy calculation-summary.',
      )),
      summary: {
        canonicalPrimaryOverrideRowIds: [],
        legacyDiagnosticRetainedRowIds: [],
        backendContractRequiredRowIds: [],
        mixedAuthorityBlockedRowIds: [],
        fallbackLegacyRowIds: [...GUARDED_SUMMARY_RUNTIME_ROW_IDS],
      },
    };
  }

  return {
    guardedPrimarySelected: true,
    decisions: [
      ...GUARDED_SUMMARY_CANONICAL_PRIMARY_OVERRIDE_ROW_IDS.map((rowId) => runtimeBoundaryDecision(
        rowId,
        'CANONICAL_PRIMARY_OVERRIDE',
        'PRIMARY_CANONICAL_OVERRIDE',
        'Overridden by buildGuardedPrimaryCalculationResult when guarded primary is selected.',
      )),
      ...GUARDED_SUMMARY_BACKEND_CONTRACT_REQUIRED_ROW_IDS.map((rowId) => runtimeBoundaryDecision(
        rowId,
        'LEGACY_BACKEND_CONTRACT_RETAINED',
        'BACKEND_CONTRACT_REQUIRED_RETAINED',
        'Retained from legacy calculation-summary until a canonical backend contract exists.',
      )),
      ...GUARDED_SUMMARY_LEGACY_DIAGNOSTIC_RETAINED_ROW_IDS.map((rowId) => runtimeBoundaryDecision(
        rowId,
        'LEGACY_DIAGNOSTIC_RETAINED',
        'LEGACY_DIAGNOSTIC_RETAINED',
        'Retained as legacy diagnostic/detail/projection data; not canonical primary authority.',
      )),
      ...GUARDED_SUMMARY_MIXED_AUTHORITY_BLOCKED_ROW_IDS.map((rowId) => runtimeBoundaryDecision(
        rowId,
        'MIXED_CANONICAL_LEGACY_CONTEXT',
        'MIXED_AUTHORITY_BLOCKED',
        'Represents a mixed canonical primary and legacy diagnostic context; blocked for controlled cutover.',
      )),
    ],
    summary: {
      canonicalPrimaryOverrideRowIds: [...GUARDED_SUMMARY_CANONICAL_PRIMARY_OVERRIDE_ROW_IDS],
      legacyDiagnosticRetainedRowIds: [...GUARDED_SUMMARY_LEGACY_DIAGNOSTIC_RETAINED_ROW_IDS],
      backendContractRequiredRowIds: [...GUARDED_SUMMARY_BACKEND_CONTRACT_REQUIRED_ROW_IDS],
      mixedAuthorityBlockedRowIds: [...GUARDED_SUMMARY_MIXED_AUTHORITY_BLOCKED_ROW_IDS],
      fallbackLegacyRowIds: [],
    },
  };
}
const HARD_NO_GO_CODES = [
  'FINAL_DEBT_STATES_MISSING',
  'FINAL_DEBT_STATES_CURRENCY_MISMATCH',
  'CURRENCY_MISMATCH',
  'CONTEXT_MISMATCH',
  'CANONICAL_CURRENCY_UNSAFE',
  'MULTI_CURRENCY_DISPLAY_UNSAFE',
  'OVERPAYMENT_BLOCKED',
  'RESTRICTED_PAYMENT_DISPLAY_UNSAFE',
  'NAFAKA_PRINCIPAL_DISPLAY_RISK',
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function issueCodes(report: BalanceDisplayShadowDiffReport): Set<string> {
  return new Set([
    ...report.diagnostics.map((diagnostic) => diagnostic.code),
    ...report.comparability.blockers.map((blocker) => blocker.code),
    ...report.comparability.warnings.map((warning) => warning.code),
    ...report.sources.canonicalBalanceDisplay.unsafeSources,
    ...report.cutoverReadiness.blockers,
  ]);
}

function principalBucket(report: BalanceDisplayShadowDiffReport): ShadowBucketDiff | undefined {
  return report.bucketDiffs.find((diff) => diff.bucket === 'PRINCIPAL');
}

function invalidDisplayedCanonicalAmountFields(
  report: BalanceDisplayShadowDiffReport,
): CanonicalDisplayedAmountField[] {
  const canonical = report.totals.canonical;
  if (!canonical) return [];

  return CANONICAL_DISPLAYED_AMOUNT_FIELDS.filter((field) => !isFiniteNumber(canonical[field]));
}

export function shouldEnableGuardedPrimaryDisplayPilot(
  searchParams: SearchParamsLike,
  flagEnabled = FEATURE_FLAGS.GUARDED_PRIMARY_DISPLAY_PILOT,
): boolean {
  return flagEnabled && searchParams.get('guardedPrimary') === '1';
}

export function getGuardedPrimaryDisplayDate(searchParams: SearchParamsLike): string | undefined {
  return searchParams.get('guardedPrimaryDate') ?? undefined;
}

export function canonicalPrimaryAmounts(
  report: BalanceDisplayShadowDiffReport,
): CanonicalPrimaryAmounts | null {
  const canonical = report.totals.canonical;
  const principal = principalBucket(report);

  if (!canonical || !principal?.canonicalDisplayable) return null;

  const totalDebtAmount = canonical.totalDebtAmount;
  const outstandingAmount = canonical.outstandingAmount;
  const totalPaidAmount = canonical.totalPaidAmount;
  const interestAmount = canonical.interestAmount;
  const costsAmount = canonical.costsAmount;
  const attorneyFeeAmount = canonical.attorneyFeeAmount;

  if (!isFiniteNumber(principal.canonicalAmount)) return null;
  if (!isFiniteNumber(totalDebtAmount)) return null;
  if (!isFiniteNumber(outstandingAmount)) return null;
  if (!isFiniteNumber(totalPaidAmount)) return null;
  if (!isFiniteNumber(interestAmount)) return null;
  if (!isFiniteNumber(costsAmount)) return null;
  if (!isFiniteNumber(attorneyFeeAmount)) return null;

  return {
    principalAmount: principal.canonicalAmount,
    totalDebtAmount,
    outstandingAmount,
    totalPaidAmount,
    interestAmount,
    costsAmount,
    attorneyFeeAmount,
  };
}

export function evaluateGuardedPrimaryDisplayPilot(
  report: BalanceDisplayShadowDiffReport | null,
  policy: GuardedPrimaryDisplayPolicy = {},
): GuardedPrimaryDisplayDecision {
  const reasonCodes: string[] = [];
  const featureFlagEnabled = policy.featureFlagEnabled ?? FEATURE_FLAGS.GUARDED_PRIMARY_DISPLAY_PILOT;
  const scenarioSupported = policy.scenarioSupported ?? true;

  if (!featureFlagEnabled) reasonCodes.push('FEATURE_FLAG_OFF');
  if (!scenarioSupported) reasonCodes.push('UNSUPPORTED_SCENARIO');
  if (policy.paymentDesignationRequired) reasonCodes.push('PAYMENT_DESIGNATION_REQUIRED');
  if (policy.unsupportedPeriodicObligation) reasonCodes.push('UNSUPPORTED_PERIODIC_OBLIGATION');
  if (policy.claimItemAuthorityContaminated) reasonCodes.push('CLAIM_ITEM_AUTHORITY_CONTAMINATION');

  if (!report) {
    reasonCodes.push('SHADOW_OR_CANONICAL_SOURCE_PENDING');
    return {
      primarySource: 'LEGACY_CALCULATION_SUMMARY',
      reasonCodes: [...new Set(reasonCodes)].sort(),
    };
  }

  const codes = issueCodes(report);

  if (!report.sources.legacyCalculationSummary.available || !report.sources.canonicalBalanceDisplay.available) {
    reasonCodes.push('SHADOW_OR_CANONICAL_SOURCE_FAILURE');
  }
  if (!report.provenance.finalDebtStatesAvailable) reasonCodes.push('FINAL_DEBT_STATES_REQUIRED');
  if (!report.comparability.comparable) reasonCodes.push('NOT_COMPARABLE');
  if (report.currency === 'MULTI' || report.currency === 'UNKNOWN' || report.currency == null) {
    reasonCodes.push('DISPLAY_CURRENCY_UNSAFE');
  }
  if (report.provenance.claimItemCollectedAmountUsedAsAuthority) {
    reasonCodes.push('CLAIM_ITEM_AUTHORITY_CONTAMINATION');
  }
  const displayedAmountFailures = invalidDisplayedCanonicalAmountFields(report);
  if (!canonicalPrimaryAmounts(report)) {
    reasonCodes.push('CANONICAL_PRINCIPAL_UNAVAILABLE');
    if (displayedAmountFailures.length > 0) {
      reasonCodes.push('CANONICAL_DISPLAYED_AMOUNT_UNAVAILABLE');
    }
  }

  for (const code of HARD_NO_GO_CODES) {
    if (codes.has(code)) reasonCodes.push(code);
  }

  return {
    primarySource: reasonCodes.length === 0
      ? 'CANONICAL_PRIMARY_CANDIDATE'
      : 'LEGACY_CALCULATION_SUMMARY',
    reasonCodes: [...new Set(reasonCodes)].sort(),
  };
}

export function buildGuardedPrimaryCalculationResult(
  legacy: CaseCalculationResult,
  report: BalanceDisplayShadowDiffReport,
  decision: GuardedPrimaryDisplayDecision,
): CaseCalculationResult | null {
  if (decision.primarySource !== 'CANONICAL_PRIMARY_CANDIDATE') return null;

  const amounts = canonicalPrimaryAmounts(report);
  if (!amounts) return null;

  return {
    ...legacy,
    asilAlacak: amounts.principalAmount,
    takipTutari: amounts.principalAmount,
    takipSonrasiFaiz: amounts.interestAmount,
    icraMasraflari: amounts.costsAmount,
    vekaletUcreti: amounts.attorneyFeeAmount,
    toplamBorc: amounts.totalDebtAmount,
    sonBorc: amounts.outstandingAmount,
    toplamTahsilat: amounts.totalPaidAmount,
    kalanBorc: amounts.outstandingAmount,
    kalanAnapara: amounts.principalAmount,
  };
}
