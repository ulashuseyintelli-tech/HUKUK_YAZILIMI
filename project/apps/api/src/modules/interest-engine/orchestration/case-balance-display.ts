/**
 * BALANCE-DISPLAY PR-1: computeCaseBalance (CaseBalanceResult) → panel-facing CaseBalanceDisplay DTO.
 *
 * Amaç: stabil UI sözleşmesi; ham engine shape'i panelden SIZMASIN. SAF (side-effect yok), ADDITIVE.
 *
 * KIRMIZI ÇİZGİ — UYDURMA YOK: yalnız engine çıktısında DOĞRULANMIŞ alanlar map'lenir.
 *  - `interest`        = CalculationResult.totalInterest  → BRÜT işlemiş faiz (segment'lerden; ödeme tahsisinden BAĞIMSIZ).
 *  - `claimRemaining`  = CalculationResult.totalDue        → ödeme TAHSİSİ sonrası NET kalan alacak (anapara+faiz, claim-only).
 *  - `costs`/`ancillaries` = Σ CaseBalanceResult.projections.costs / .ancillaries (CASE-level; currency-split DEĞİL).
 *  - `collected`       = best-effort: ödeme-bazında dedup Σ allocations.paymentAmount (ödeme yoksa 0).
 *  Standalone "kalan anapara" satırı EXPOSE EDİLMEZ: engine CalculationResult finalDebtStates taşımaz
 *  (totalDue = anapara+faiz). `totalDue − totalInterest` GÜVENSİZ (farklı baz: net totalDue vs brüt faiz) → yapılmaz.
 */

import { AncillaryType } from '../types/domain.types';
import type { FinalDebtState } from '../types/calculation.types';
import type { CaseBalanceResult } from './case-balance.service';

export interface CaseBalanceDisplayCurrency {
  currency: string;
  /** BRÜT işlemiş faiz (totalInterest; ödeme tahsisinden bağımsız). */
  interest: number;
  /** NET kalan alacak (anapara+faiz, ödeme tahsisi sonrası, claim-only) = totalDue. */
  claimRemaining: number;
  /** Best-effort tahsilat: ödeme-bazında dedup Σ allocations.paymentAmount (ödeme yoksa 0). */
  collected: number;
  /** Bu currency grubu hesaplanmadıysa (0-bucket / engine error). */
  skipped: boolean;
  skippedReason: string | null;
}

export type BalanceDisplayAuthority =
  | 'CANONICAL_CANDIDATE'
  | 'LEGACY_DISPLAY'
  | 'SHADOW_ONLY'
  | 'UNSAFE_FOR_PRIMARY_DISPLAY';

export type BalanceDisplayBucketCode =
  | 'EXPENSE'
  | 'ACCRUED_INTEREST'
  | 'ATTORNEY_FEE'
  | 'OTHER_ANCILLARY'
  | 'PRINCIPAL'
  | 'HELD_OVERPAYMENT';

export type BalanceDisplayBucketSource =
  | 'COMPUTE_BALANCE_GROSS'
  | 'COMPUTE_BALANCE_FINAL_DEBT_STATE'
  | 'CASE_LEVEL_PROJECTION'
  | 'OVERPAYMENT_PROJECTION'
  | 'UNAVAILABLE';

export type BalanceDisplayDiagnosticCode =
  | 'LEGACY_CALCULATION_SUMMARY_LIVE'
  | 'FINAL_DEBT_STATES_MISSING'
  | 'FINAL_DEBT_STATES_CURRENCY_MISMATCH'
  | 'CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY'
  | 'INTEREST_STUB_OR_EMPTY'
  | 'OVERPAYMENT_HELD_NOT_DISPLAYED'
  | 'OVERPAYMENT_BLOCKED'
  | 'RESTRICTED_PAYMENT_DISPLAY_UNSAFE'
  | 'NAFAKA_PRINCIPAL_DISPLAY_RISK'
  | 'MULTI_CURRENCY_DISPLAY_UNSAFE';

export interface BalanceDisplayBucket {
  code: BalanceDisplayBucketCode;
  currency: string;
  /**
   * null = bu contract bu kovayi guvenilir authority olarak uretemiyor.
   * Ornek: finalDebtStates tasinmadigi icin PRINCIPAL ayrica uretilmez.
   */
  amount: number | null;
  displayable: boolean;
  source: BalanceDisplayBucketSource;
  diagnosticCodes?: BalanceDisplayDiagnosticCode[];
}

export interface BalanceDisplayTotals {
  /**
   * Pre-payment/gross toplam borc bu contract'ta henuz authority degil.
   * totalDue net kalan claim oldugu icin burada uydurma toplam uretilmez.
   */
  totalDebtAmount: number | null;
  totalPaidAmount: number | null;
  outstandingAmount: number | null;
  heldOverpaymentAmount: number | null;
  blockedOverpaymentAmount?: number | null;
}

export interface BalanceDisplayDiagnostic {
  code: BalanceDisplayDiagnosticCode;
  severity: 'INFO' | 'WARNING' | 'BLOCKER';
  message: string;
  details?: Record<string, unknown>;
}

export interface BalanceDisplayUnsafeSource {
  code: BalanceDisplayDiagnosticCode;
  source: string;
  reason: string;
}

export interface BalanceDisplayProvenance {
  computeBalanceUsed: boolean;
  legacyCalculationSummaryUsed: boolean;
  claimItemCollectedAmountUsedAsAuthority: boolean;
  finalDebtStatesAvailable: boolean;
  overpaymentProjectionUsed: boolean;
  blockedOverpaymentDiagnosticsUsed: boolean;
}

export interface CaseBalanceDisplay {
  tenantId: string;
  caseId: string;
  currency: string;
  authority: BalanceDisplayAuthority;
  generatedAt: string;
  sourceVersion: string;
  asOfDate: string;
  source: CaseBalanceResult['source'];
  status: 'OK' | 'UNAVAILABLE';
  /** Masraf projeksiyonu (CASE-level; currency-split DEĞİL) = Σ projections.costs. */
  costs: number;
  /** Fer'i / yan-alacak projeksiyonu (CASE-level) = Σ projections.ancillaries. */
  ancillaries: number;
  currencies: CaseBalanceDisplayCurrency[];
  buckets: BalanceDisplayBucket[];
  totals: BalanceDisplayTotals;
  diagnostics: BalanceDisplayDiagnostic[];
  unsafeSources?: BalanceDisplayUnsafeSource[];
  provenance: BalanceDisplayProvenance;
  /** Dürüstlük/limit notları (panel sözleşmesi netliği). */
  notes: string[];
  unavailableReason?: string;
}

export interface ToCaseBalanceDisplayInput {
  tenantId: string;
  caseId: string;
  balance: CaseBalanceResult;
  generatedAt?: string;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const sumRecord = (rec: Partial<Record<string, number>> | undefined): number => {
  if (!rec) return 0;
  let total = 0;
  for (const v of Object.values(rec)) total += v ?? 0;
  return total;
};

const valueOfRecord = (rec: Partial<Record<string, number>> | undefined, key: string): number => {
  if (!rec) return 0;
  return rec[key] ?? 0;
};

const DISPLAY_NOTES: string[] = [
  'interest = BRÜT işlemiş faiz (totalInterest); claimRemaining = ödeme tahsisi sonrası NET kalan alacak (totalDue) — farklı baz.',
  'Standalone kalan-anapara satırı yalnız CalculationResult.finalDebtStates varsa gösterilir; yoksa uydurma principal yoktur.',
  "costs/ancillaries CASE-level projeksiyon; currency-split DEĞİL.",
  'collected = best-effort (ödeme-bazında dedup Σ allocations.paymentAmount).',
];

/** Ödeme-bazında (paymentId) dedup edilmiş toplam tahsilat. allocations yoksa 0. */
function sumCollected(allocations: { paymentId: string; paymentAmount: number }[] | undefined): number {
  if (!allocations || allocations.length === 0) return 0;
  const seen = new Set<string>();
  let total = 0;
  for (const step of allocations) {
    if (!seen.has(step.paymentId)) {
      seen.add(step.paymentId);
      total += step.paymentAmount;
    }
  }
  return total;
}

function inferDisplayCurrency(balance: CaseBalanceResult): string {
  const currencies = new Set<string>();
  for (const cr of balance.currencyResults ?? []) {
    if (cr.currency) currencies.add(cr.currency);
  }
  for (const row of balance.overpayments?.held ?? []) {
    if (row.currency) currencies.add(row.currency);
  }
  for (const row of balance.overpayments?.blocked ?? []) {
    if (row.currency) currencies.add(row.currency);
  }
  if (currencies.size === 0) return 'UNKNOWN';
  if (currencies.size === 1) return [...currencies][0];
  return 'MULTI';
}

function sourceVersion(balance: CaseBalanceResult): string {
  const versions = new Set<string>();
  for (const cr of balance.currencyResults ?? []) {
    const version = cr.result?.engineVersion;
    if (version) versions.add(version);
  }
  if (versions.size === 0) return 'computeBalance:no-result';
  if (versions.size === 1) return `computeBalance:${[...versions][0]}`;
  return 'computeBalance:mixed';
}

function hasInterestEvidence(balance: CaseBalanceResult): boolean {
  return (balance.currencyResults ?? []).some((cr) => {
    const totalInterest = cr.result?.totalInterest ?? 0;
    const segmentCount = cr.result?.segments?.length ?? 0;
    return totalInterest > 0 || segmentCount > 0;
  });
}

function finalDebtStates(balance: CaseBalanceResult): FinalDebtState[] {
  return (balance.currencyResults ?? []).flatMap((cr) => cr.result?.finalDebtStates ?? []);
}

function finalDebtPrincipal(balance: CaseBalanceResult, currency: string): number | null {
  const states = finalDebtStates(balance).filter((state) => state.currency === currency);
  if (states.length === 0) return null;
  return round2(states.reduce((sum, state) => sum + state.principal, 0));
}

function hasFinalDebtStateCurrencyMismatch(balance: CaseBalanceResult, currency: string): boolean {
  const states = finalDebtStates(balance);
  return states.length > 0 && currency !== 'MULTI' && currency !== 'UNKNOWN'
    ? states.some((state) => state.currency !== currency)
    : false;
}

function blockedReasons(balance: CaseBalanceResult): string[] {
  const reasons = new Set<string>();
  for (const row of balance.overpayments?.blocked ?? []) {
    for (const reason of row.blockedReasons ?? []) {
      if (reason.reason) reasons.add(reason.reason);
    }
  }
  return [...reasons].sort();
}

function buildDiagnostics(
  balance: CaseBalanceResult,
  currency: string,
  blockedTotal: number,
  finalDebtStatesStatus: {
    present: boolean;
    currencyMismatch: boolean;
  },
): BalanceDisplayDiagnostic[] {
  const diagnostics: BalanceDisplayDiagnostic[] = [
    {
      code: 'LEGACY_CALCULATION_SUMMARY_LIVE',
      severity: 'INFO',
      message: 'Live HesapOzetiPanel halen legacy calculation-summary hattini kullanir; bu response shadow/cutover adayidir.',
    },
    {
      code: 'CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY',
      severity: 'INFO',
      message: 'ClaimItem.collectedAmount display authority olarak kullanilmiyor; tahsilat payment/ledger hattindan okunur.',
    },
  ];

  if (!finalDebtStatesStatus.present) {
    diagnostics.push({
      code: 'FINAL_DEBT_STATES_MISSING',
      severity: 'WARNING',
      message: 'CalculationResult finalDebtStates tasimadigi icin standalone principal/outstanding kategori authority uretilmez.',
    });
  }
  if (finalDebtStatesStatus.currencyMismatch) {
    diagnostics.push({
      code: 'FINAL_DEBT_STATES_CURRENCY_MISMATCH',
      severity: 'BLOCKER',
      message: 'finalDebtStates currency bilgisi display currency ile eslesmiyor; principal bucket primary authority olamaz.',
      details: {
        displayCurrency: currency,
        finalDebtStateCurrencies: [...new Set(finalDebtStates(balance).map((state) => state.currency))].sort(),
      },
    });
  }

  if (currency === 'MULTI') {
    diagnostics.push({
      code: 'MULTI_CURRENCY_DISPLAY_UNSAFE',
      severity: 'WARNING',
      message: 'Birden cok para birimi var; top-level toplamlar null birakildi, currency bazli satirlar dikkate alinmali.',
    });
  }

  if (!hasInterestEvidence(balance)) {
    diagnostics.push({
      code: 'INTEREST_STUB_OR_EMPTY',
      severity: 'INFO',
      message: 'Display response pozitif faiz/segment kaniti tasimiyor; bu durum sifir faiz veya bos engine sonucu olabilir.',
    });
  }

  if (blockedTotal > 0) {
    const reasons = blockedReasons(balance);
    diagnostics.push({
      code: 'OVERPAYMENT_BLOCKED',
      severity: 'WARNING',
      message: 'Borca mahsup edilemeyen overpayment denemesi diagnostic event olarak gorundu; borcu negatif yapmaz.',
      details: { blockedOverpaymentAmount: blockedTotal, reasons },
    });
    if (reasons.includes('RESTRICTED_PAYMENT_UNSUPPORTED')) {
      diagnostics.push({
        code: 'RESTRICTED_PAYMENT_DISPLAY_UNSAFE',
        severity: 'WARNING',
        message: 'Restricted/earmarked payment sinyali PaymentDesignation olmadan primary display authority olamaz.',
      });
    }
  }

  return diagnostics;
}

function buildUnsafeSources(diagnostics: BalanceDisplayDiagnostic[]): BalanceDisplayUnsafeSource[] | undefined {
  const sources: BalanceDisplayUnsafeSource[] = [];
  if (diagnostics.some((d) => d.code === 'LEGACY_CALCULATION_SUMMARY_LIVE')) {
    sources.push({
      code: 'LEGACY_CALCULATION_SUMMARY_LIVE',
      source: 'GET /cases/:id/calculation-summary',
      reason: 'Canli panel halen legacy authority kullanir; backend display contract shadow olarak degerlendirilmeli.',
    });
  }
  if (diagnostics.some((d) => d.code === 'FINAL_DEBT_STATES_MISSING')) {
    sources.push({
      code: 'FINAL_DEBT_STATES_MISSING',
      source: 'CalculationResult',
      reason: 'PRINCIPAL kovasi finalDebtStates olmadan turetilmez.',
    });
  }
  if (diagnostics.some((d) => d.code === 'FINAL_DEBT_STATES_CURRENCY_MISMATCH')) {
    sources.push({
      code: 'FINAL_DEBT_STATES_CURRENCY_MISMATCH',
      source: 'CalculationResult.finalDebtStates',
      reason: 'PRINCIPAL kovasi yalniz display currency ile eslesen finalDebtStates snapshotindan turetilir.',
    });
  }
  if (diagnostics.some((d) => d.code === 'RESTRICTED_PAYMENT_DISPLAY_UNSAFE')) {
    sources.push({
      code: 'RESTRICTED_PAYMENT_DISPLAY_UNSAFE',
      source: 'OVERPAYMENT_BLOCKED',
      reason: 'PaymentDesignation uygulanmadan restricted payment overpayment olarak display edilemez.',
    });
  }
  return sources.length > 0 ? sources : undefined;
}

function buildBuckets(
  currency: string,
  totals: {
    costs: number;
    interest: number;
    attorneyFee: number;
    otherAncillary: number;
    principal: number | null;
    principalAuthorityAvailable: boolean;
    principalDiagnosticCodes?: BalanceDisplayDiagnosticCode[];
    heldOverpayment: number | null;
  },
): BalanceDisplayBucket[] {
  const currencyIsSafe = currency !== 'MULTI' && currency !== 'UNKNOWN';
  const maybeAmount = (amount: number): number | null => (currencyIsSafe ? round2(amount) : null);
  const currencyDiagnostic: BalanceDisplayDiagnosticCode[] | undefined = currencyIsSafe
    ? undefined
    : ['MULTI_CURRENCY_DISPLAY_UNSAFE'];

  return [
    {
      code: 'EXPENSE',
      currency,
      amount: maybeAmount(totals.costs),
      displayable: currencyIsSafe,
      source: 'CASE_LEVEL_PROJECTION',
      ...(currencyDiagnostic ? { diagnosticCodes: currencyDiagnostic } : {}),
    },
    {
      code: 'ACCRUED_INTEREST',
      currency,
      amount: maybeAmount(totals.interest),
      displayable: currencyIsSafe,
      source: 'COMPUTE_BALANCE_GROSS',
      ...(currencyDiagnostic ? { diagnosticCodes: currencyDiagnostic } : {}),
    },
    {
      code: 'ATTORNEY_FEE',
      currency,
      amount: maybeAmount(totals.attorneyFee),
      displayable: currencyIsSafe,
      source: 'CASE_LEVEL_PROJECTION',
      ...(currencyDiagnostic ? { diagnosticCodes: currencyDiagnostic } : {}),
    },
    {
      code: 'OTHER_ANCILLARY',
      currency,
      amount: maybeAmount(totals.otherAncillary),
      displayable: currencyIsSafe,
      source: 'CASE_LEVEL_PROJECTION',
      ...(currencyDiagnostic ? { diagnosticCodes: currencyDiagnostic } : {}),
    },
    {
      code: 'PRINCIPAL',
      currency,
      amount: totals.principalAuthorityAvailable && currencyIsSafe ? totals.principal : null,
      displayable: totals.principalAuthorityAvailable && currencyIsSafe && totals.principal != null,
      source: totals.principalAuthorityAvailable ? 'COMPUTE_BALANCE_FINAL_DEBT_STATE' : 'UNAVAILABLE',
      ...(totals.principalAuthorityAvailable
        ? (currencyDiagnostic ? { diagnosticCodes: currencyDiagnostic } : {})
        : { diagnosticCodes: totals.principalDiagnosticCodes ?? ['FINAL_DEBT_STATES_MISSING'] }),
    },
    {
      code: 'HELD_OVERPAYMENT',
      currency,
      amount: totals.heldOverpayment,
      displayable: totals.heldOverpayment != null,
      source: 'OVERPAYMENT_PROJECTION',
      ...(currencyDiagnostic ? { diagnosticCodes: currencyDiagnostic } : {}),
    },
  ];
}

/** CaseBalanceResult → CaseBalanceDisplay. SAF. caseId/tenantId controller param'ından gelir. */
export function toCaseBalanceDisplay(input: ToCaseBalanceDisplayInput): CaseBalanceDisplay {
  const { tenantId, caseId, balance } = input;
  const fatal = balance.diagnostics?.fatal ?? [];
  const status: 'OK' | 'UNAVAILABLE' = fatal.length > 0 ? 'UNAVAILABLE' : 'OK';

  const currencies: CaseBalanceDisplayCurrency[] = (balance.currencyResults ?? []).map((cr) => ({
    currency: cr.currency,
    interest: round2(cr.result?.totalInterest ?? 0),
    claimRemaining: round2(cr.result?.totalDue ?? 0),
    collected: round2(sumCollected(cr.result?.allocations)),
    skipped: cr.result == null,
    skippedReason: cr.skippedReason ?? null,
  }));

  const displayCurrency = inferDisplayCurrency(balance);
  const singleCurrency = displayCurrency !== 'MULTI' && displayCurrency !== 'UNKNOWN';
  const costs = round2(sumRecord(balance.projections?.costs));
  const ancillaries = round2(sumRecord(balance.projections?.ancillaries));
  const attorneyFee = round2(valueOfRecord(balance.projections?.ancillaries, AncillaryType.VEKALET_UCRETI));
  const otherAncillary = round2(ancillaries - attorneyFee);
  const interest = round2(currencies.reduce((sum, c) => sum + c.interest, 0));
  const claimRemaining = round2(currencies.reduce((sum, c) => sum + c.claimRemaining, 0));
  const collected = round2(currencies.reduce((sum, c) => sum + c.collected, 0));
  const finalDebtStatesPresent = finalDebtStates(balance).length > 0;
  const finalDebtStatesCurrencyMismatch = hasFinalDebtStateCurrencyMismatch(balance, displayCurrency);
  const principalAuthorityAvailable = finalDebtStatesPresent && !finalDebtStatesCurrencyMismatch;
  const principal = singleCurrency ? finalDebtPrincipal(balance, displayCurrency) : null;
  const heldOverpayment = round2(
    (balance.overpayments?.held ?? []).reduce((sum, row) => sum + (row.remainingAmount ?? 0), 0),
  );
  const blockedOverpayment = round2(
    (balance.overpayments?.blocked ?? []).reduce((sum, row) => sum + (row.attemptedOverpaymentAmount ?? 0), 0),
  );
  const diagnostics = buildDiagnostics(balance, displayCurrency, blockedOverpayment, {
    present: finalDebtStatesPresent,
    currencyMismatch: finalDebtStatesCurrencyMismatch,
  });
  const unsafeSources = buildUnsafeSources(diagnostics);

  const outstandingAmount = singleCurrency ? round2(claimRemaining + costs + ancillaries) : null;
  const totals: BalanceDisplayTotals = {
    totalDebtAmount: null,
    totalPaidAmount: singleCurrency ? collected : null,
    outstandingAmount,
    heldOverpaymentAmount: singleCurrency ? heldOverpayment : null,
    ...(blockedOverpayment > 0 ? { blockedOverpaymentAmount: singleCurrency ? blockedOverpayment : null } : {}),
  };

  const display: CaseBalanceDisplay = {
    tenantId,
    caseId,
    currency: displayCurrency,
    authority: status === 'UNAVAILABLE' ? 'UNSAFE_FOR_PRIMARY_DISPLAY' : 'SHADOW_ONLY',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceVersion: sourceVersion(balance),
    asOfDate: balance.asOfDate,
    source: balance.source,
    status,
    costs,
    ancillaries,
    currencies,
    buckets: buildBuckets(displayCurrency, {
      costs,
      interest,
      attorneyFee,
      otherAncillary,
      principal,
      principalAuthorityAvailable,
      principalDiagnosticCodes: finalDebtStatesCurrencyMismatch
        ? ['FINAL_DEBT_STATES_CURRENCY_MISMATCH']
        : undefined,
      heldOverpayment: singleCurrency ? heldOverpayment : null,
    }),
    totals,
    diagnostics,
    ...(unsafeSources ? { unsafeSources } : {}),
    provenance: {
      computeBalanceUsed: true,
      legacyCalculationSummaryUsed: false,
      claimItemCollectedAmountUsedAsAuthority: false,
      finalDebtStatesAvailable: principalAuthorityAvailable,
      overpaymentProjectionUsed: (balance.overpayments?.held?.length ?? 0) > 0,
      blockedOverpaymentDiagnosticsUsed: (balance.overpayments?.blocked?.length ?? 0) > 0,
    },
    notes: DISPLAY_NOTES,
  };
  if (status === 'UNAVAILABLE') {
    display.unavailableReason = fatal[0]?.code ?? 'UNKNOWN';
  }
  return display;
}
