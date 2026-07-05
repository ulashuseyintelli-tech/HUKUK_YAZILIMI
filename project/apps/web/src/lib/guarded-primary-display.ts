import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import type {
  BalanceDisplayShadowDiffReport,
  ShadowBucketDiff,
} from '@/lib/api/balance-shadow-diff';
import type { CaseCalculationResult } from '@/hooks/useCaseCalculation';

type SearchParamsLike = Pick<URLSearchParams, 'get'>;

export type GuardedPrimaryDisplaySource =
  | 'CANONICAL_PRIMARY_CANDIDATE'
  | 'PARTIAL_CANONICAL_LEGACY_TOTALS'
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

// ALC-AUTH-1A: B1 guarded primary gate ilk asamada principal + interest + payment ile
// sinirlandi. costs/attorneyFee kasitli olarak bu tipten cikarildi -- artik B1'i bloklamazlar,
// legacy (icraMasraflari/vekaletUcreti) degerleri korunur (bkz. BACKEND_CONTRACT_REQUIRED_ROW_IDS).
interface CanonicalPrimaryAmounts {
  principalAmount: number;
  totalDebtAmount: number;
  outstandingAmount: number;
  totalPaidAmount: number;
  interestAmount: number;
}

type CanonicalDisplayedAmountField =
  | 'totalPaidAmount'
  | 'interestAmount';

const CANONICAL_DISPLAYED_AMOUNT_FIELDS: readonly CanonicalDisplayedAmountField[] = [
  'totalPaidAmount',
  'interestAmount',
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

export interface GuardedPrimaryCalculationResultWithBoundaryPlan {
  guardedPrimaryHesap: CaseCalculationResult | null;
  boundaryPlan: GuardedSummaryRuntimeBoundaryPlan;
}

const GUARDED_SUMMARY_CANONICAL_PRIMARY_OVERRIDE_ROW_IDS: readonly GuardedSummaryRuntimeBoundaryRowId[] = [
  'asilAlacak',
  'takipTutari',
  'takipSonrasiFaiz',
  'toplamBorc',
  'sonBorc',
  'toplamTahsilat',
  'kalanBorc',
  'kalanAnapara',
];

// ALC-AUTH-1A: icraMasraflari/vekaletUcreti B1 kapsaminda daraltildi -- canonical cost/attorneyFee
// ClaimItem-materialization hatti henuz yok; tazminat/komisyon/takipOncesiFaiz ile ayni desen.
const GUARDED_SUMMARY_BACKEND_CONTRACT_REQUIRED_ROW_IDS: readonly GuardedSummaryRuntimeBoundaryRowId[] = [
  'tazminat',
  'komisyon',
  'takipOncesiFaiz',
  'icraMasraflari',
  'vekaletUcreti',
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
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

  if (!isFiniteNumber(principal.canonicalAmount)) return null;
  if (!isFiniteNumber(totalDebtAmount)) return null;
  if (!isFiniteNumber(outstandingAmount)) return null;
  if (!isFiniteNumber(totalPaidAmount)) return null;
  if (!isFiniteNumber(interestAmount)) return null;

  return {
    principalAmount: principal.canonicalAmount,
    totalDebtAmount,
    outstandingAmount,
    totalPaidAmount,
    interestAmount,
  };
}

const COST_FEE_UNDERSTATEMENT_RISK_CODES = new Set(['COSTS_DELTA', 'ATTORNEY_FEE_DELTA']);

// ALC-AUTH-3E: toplamBorc/sonBorc/kalanBorc canonical totalDebtAmount/outstandingAmount'tan
// gelir, ikisi de costs/ancillaries icerir -- cost/attorney-fee ClaimItem'i olmayan case'lerde
// bu sessizce 0 sayilip aggregate'i olduğundan dusuk gosterebilir (COSTS_DELTA/ATTORNEY_FEE_DELTA
// B1_SCOPE_EXEMPT_DIFF_CODES oldugu icin guard'i bloklamaz). Zaten mevcut report.totals.diffs'teki
// RED/MAJOR_DELTA sinyali (legacy nonzero, canonical veri-bosluğu yuzunden 0) case-bazli tespit icin
// kullanilir -- yeni backend contract gerekmez.
function hasCostOrAttorneyFeeUnderstatementRisk(report: BalanceDisplayShadowDiffReport): boolean {
  return report.totals.diffs.some(
    (diff) => COST_FEE_UNDERSTATEMENT_RISK_CODES.has(diff.code) && diff.severity === 'RED',
  );
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

  // ALC-AUTH-3D (strict cleanup, 2026-07-05): domain-safety otoritesi artık TEK YERDE
  // (backend cutoverReadiness) hesaplanır. Frontend ikinci bir authority üretmez — yalnız
  // backend'in kararını render eder. Önceki ayrı kontroller (HARD_NO_GO_CODES, NOT_COMPARABLE,
  // SHADOW_OR_CANONICAL_SOURCE_FAILURE, FINAL_DEBT_STATES_REQUIRED, DISPLAY_CURRENCY_UNSAFE,
  // report-provenance tabanlı CLAIM_ITEM_AUTHORITY_CONTAMINATION) backend'in
  // `cutoverReadiness.blockers`'ını besleyen AYNI `comparability.blockers`/`diagnostics`
  // kaynağından türüyordu — tamamen kapsanıyor, kaldırıldı. Backend yeni bir blocker
  // eklediğinde frontend otomatik hizalı kalır.
  if (!report.cutoverReadiness.safeForPrimaryDisplay) {
    reasonCodes.push(...report.cutoverReadiness.blockers);
  }

  // Render-veri-mevcudiyeti kontrolü — "güvenli mi" değil "gösterecek veri var mı" sorusu,
  // domain-safety'den ayrı, frontend'de kalması gereken bir kaygı.
  const displayedAmountFailures = invalidDisplayedCanonicalAmountFields(report);
  if (!canonicalPrimaryAmounts(report)) {
    reasonCodes.push('CANONICAL_PRINCIPAL_UNAVAILABLE');
    if (displayedAmountFailures.length > 0) {
      reasonCodes.push('CANONICAL_DISPLAYED_AMOUNT_UNAVAILABLE');
    }
  }

  // ALC-AUTH-4A (misleading-eligibility fix, 2026-07-05, PR #942): ALC-AUTH-3E'nin suppress'i
  // (toplamBorc/sonBorc/kalanBorc legacy'de kalir) daha once yalniz buildGuardedPrimaryCalculationResult
  // icinde uygulaniyordu -- decision/banner katmani bunu hic gormuyordu, yani suppress calisirken
  // banner "CANONICAL_PRIMARY_CANDIDATE"/"ELIGIBLE" demeye devam edebiliyordu (reasonCodes bos).
  const hasCostFeeSuppression = hasCostOrAttorneyFeeUnderstatementRisk(report);
  if (hasCostFeeSuppression) {
    reasonCodes.push('COST_ATTORNEY_FEE_SUPPRESSED');
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)].sort();

  // ALC-AUTH-4A-IMPL (2026-07-05): PR #942 bu noktada her zaman tam LEGACY_CALCULATION_SUMMARY'e
  // duserdu (kismi/hibrit sonuc hic uretilmezdi). Owner karari: bu "safe default" TUM DIGER
  // reasonCode'lar icin AYNEN korunur -- yalniz COST_ATTORNEY_FEE_SUPPRESSED TEK BASINA (baska
  // hicbir engelleyici sebep yokken) varsa, tam legacy yerine PARTIAL_CANONICAL_LEGACY_TOTALS
  // donulur: 5 canonical-override alan (asilAlacak/takipTutari/takipSonrasiFaiz/toplamTahsilat/
  // kalanAnapara) korunur, yalniz toplamBorc/sonBorc/kalanBorc legacy'de kalir (bkz.
  // buildGuardedPrimaryCalculationResult). Baska herhangi bir reasonCode (flag kapali, backend
  // blocker, veri yok, vb.) hala kosulsuz tam LEGACY'e duser -- bu davranis DEGISMEDI.
  const onlyCostFeeSuppressed = hasCostFeeSuppression
    && uniqueReasonCodes.length === 1
    && uniqueReasonCodes[0] === 'COST_ATTORNEY_FEE_SUPPRESSED';

  let primarySource: GuardedPrimaryDisplaySource;
  if (uniqueReasonCodes.length === 0) {
    primarySource = 'CANONICAL_PRIMARY_CANDIDATE';
  } else if (onlyCostFeeSuppressed) {
    primarySource = 'PARTIAL_CANONICAL_LEGACY_TOTALS';
  } else {
    primarySource = 'LEGACY_CALCULATION_SUMMARY';
  }

  return {
    primarySource,
    reasonCodes: uniqueReasonCodes,
  };
}

export type GuardedPrimaryAuthorityCopyCategory =
  | 'CANONICAL'
  | 'PARTIAL_CANONICAL'
  | 'FEATURE_FLAG_OFF'
  | 'UNSUPPORTED_SCENARIO'
  | 'DATA_UNAVAILABLE'
  | 'BACKEND_BLOCKED';

export interface GuardedPrimaryAuthorityCopy {
  category: GuardedPrimaryAuthorityCopyCategory;
  headline: string;
}

// ALC-AUTH-4A-IMPL: avukat-facing Turkce authority copy. Ham reasonCodes (`guarded-primary-
// display-reasons` testid) DOKUNULMADI -- bu, ayri bir ek katmandir (additive, Fork 2).
// Kategorize edilmemis/bilinmeyen gelecekteki backend reasonCode'lari BACKEND_BLOCKED
// varsayilanina duser -- avukat hicbir zaman ham kod GORMEZ, en kotu ihtimalle jenerik ama
// dogru bir "guvenli gosterim kriterlerini karsilamiyor" cumlesi gorur.
const GUARDED_PRIMARY_AUTHORITY_HEADLINES: Record<GuardedPrimaryAuthorityCopyCategory, string> = {
  CANONICAL: 'Bu dosyada yeni hesaplama sonucu ana gösterim olarak kullanılmaktadır.',
  PARTIAL_CANONICAL: 'Bu dosyada bazı ana kalemler yeni hesaplama motorundan gösterilir. Masraf/vekalet verisi tamamlanmadığı için Toplam Borç, Son Borç ve Kalan Borç mevcut hesaplama ile gösterilmektedir.',
  FEATURE_FLAG_OFF: 'Bu dosyada güncel hesaplama pilot kapsamında değildir, mevcut hesaplama gösterilmektedir.',
  UNSUPPORTED_SCENARIO: 'Bu dosyada yeni hesaplama şu an desteklenmiyor; mevcut hesaplama gösterilmektedir.',
  DATA_UNAVAILABLE: 'Bu dosya için yeni hesaplama sonucu henüz üretilemedi; mevcut hesaplama gösterilmektedir.',
  BACKEND_BLOCKED: 'Bu dosyada yeni hesaplama sonucu, güvenli gösterim kriterlerini şu an karşılamadığı için ana gösterim olarak kullanılmamaktadır.',
};

const UNSUPPORTED_SCENARIO_REASON_CODES = new Set([
  'UNSUPPORTED_SCENARIO',
  'PAYMENT_DESIGNATION_REQUIRED',
  'UNSUPPORTED_PERIODIC_OBLIGATION',
  'CLAIM_ITEM_AUTHORITY_CONTAMINATION',
]);

const DATA_UNAVAILABLE_REASON_CODES = new Set([
  'CANONICAL_PRINCIPAL_UNAVAILABLE',
  'CANONICAL_DISPLAYED_AMOUNT_UNAVAILABLE',
  'FINAL_DEBT_STATES_MISSING',
  // HesapOzetiPanel bu ikisini normalde loading/error kisa-devresiyle ayrica ele alir; burada
  // yalniz getGuardedPrimaryAuthorityCopy()'yi o kisa-devreyi atlayarak dogrudan cagiran olasi
  // gelecekteki cagiranlar icin savunma amacli.
  'SHADOW_OR_CANONICAL_SOURCE_PENDING',
  'SHADOW_OR_CANONICAL_SOURCE_FAILURE',
]);

export function getGuardedPrimaryAuthorityCopy(
  decision: GuardedPrimaryDisplayDecision,
): GuardedPrimaryAuthorityCopy {
  if (decision.primarySource === 'CANONICAL_PRIMARY_CANDIDATE') {
    return { category: 'CANONICAL', headline: GUARDED_PRIMARY_AUTHORITY_HEADLINES.CANONICAL };
  }
  if (decision.primarySource === 'PARTIAL_CANONICAL_LEGACY_TOTALS') {
    return { category: 'PARTIAL_CANONICAL', headline: GUARDED_PRIMARY_AUTHORITY_HEADLINES.PARTIAL_CANONICAL };
  }
  if (decision.reasonCodes.includes('FEATURE_FLAG_OFF')) {
    return { category: 'FEATURE_FLAG_OFF', headline: GUARDED_PRIMARY_AUTHORITY_HEADLINES.FEATURE_FLAG_OFF };
  }
  if (decision.reasonCodes.some((code) => UNSUPPORTED_SCENARIO_REASON_CODES.has(code))) {
    return { category: 'UNSUPPORTED_SCENARIO', headline: GUARDED_PRIMARY_AUTHORITY_HEADLINES.UNSUPPORTED_SCENARIO };
  }
  if (decision.reasonCodes.some((code) => DATA_UNAVAILABLE_REASON_CODES.has(code))) {
    return { category: 'DATA_UNAVAILABLE', headline: GUARDED_PRIMARY_AUTHORITY_HEADLINES.DATA_UNAVAILABLE };
  }
  return { category: 'BACKEND_BLOCKED', headline: GUARDED_PRIMARY_AUTHORITY_HEADLINES.BACKEND_BLOCKED };
}

export function buildGuardedPrimaryCalculationResult(
  legacy: CaseCalculationResult,
  report: BalanceDisplayShadowDiffReport,
  decision: GuardedPrimaryDisplayDecision,
): CaseCalculationResult | null {
  // ALC-AUTH-4A-IMPL: PARTIAL_CANONICAL_LEGACY_TOTALS de (CANONICAL_PRIMARY_CANDIDATE gibi)
  // bir sonuc uretir -- yalniz LEGACY_CALCULATION_SUMMARY icin null donulur.
  if (decision.primarySource === 'LEGACY_CALCULATION_SUMMARY') return null;

  const amounts = canonicalPrimaryAmounts(report);
  if (!amounts) return null;

  // ALC-AUTH-3E: risk varsa yalniz bu 3 aggregate alan legacy'de kalir; digger 5 canonical
  // override alan (asilAlacak/takipTutari/takipSonrasiFaiz/toplamTahsilat/kalanAnapara) etkilenmez.
  // Normal akista bu artik decision.primarySource === 'PARTIAL_CANONICAL_LEGACY_TOTALS' ile
  // ortusur; fonksiyon evaluate()'i atlayip decision'i elle kurgulayan cagiranlar icin de (defense-
  // in-depth, ALC-AUTH-3E'den kalan test) dogru davranmaya devam eder.
  const suppressAggregateOverride = hasCostOrAttorneyFeeUnderstatementRisk(report);

  return {
    ...legacy,
    asilAlacak: amounts.principalAmount,
    takipTutari: amounts.principalAmount,
    takipSonrasiFaiz: amounts.interestAmount,
    // ALC-AUTH-1A: icraMasraflari/vekaletUcreti KASITLI OLARAK override edilmiyor -- legacy
    // (formul-bazli) degerleri korunur (bkz. GUARDED_SUMMARY_BACKEND_CONTRACT_REQUIRED_ROW_IDS).
    ...(suppressAggregateOverride
      ? {}
      : {
          toplamBorc: amounts.totalDebtAmount,
          sonBorc: amounts.outstandingAmount,
          kalanBorc: amounts.outstandingAmount,
        }),
    toplamTahsilat: amounts.totalPaidAmount,
    kalanAnapara: amounts.principalAmount,
  };
}

export function buildGuardedPrimaryCalculationResultWithBoundaryPlan(
  legacy: CaseCalculationResult,
  report: BalanceDisplayShadowDiffReport,
  decision: GuardedPrimaryDisplayDecision,
): GuardedPrimaryCalculationResultWithBoundaryPlan {
  const guardedPrimaryHesap = buildGuardedPrimaryCalculationResult(legacy, report, decision);

  return {
    guardedPrimaryHesap,
    boundaryPlan: buildGuardedSummaryRuntimeBoundaryPlan({
      guardedPrimarySelected: guardedPrimaryHesap !== null,
    }),
  };
}
