/**
 * BALANCE-DISPLAY PR-1 (+PR-1b): computeCaseBalance (CaseBalanceResult) → panel-facing CaseBalanceDisplay DTO.
 *
 * Amaç: stabil UI sözleşmesi; ham engine shape'i panelden SIZMASIN. SAF (side-effect yok), ADDITIVE.
 *
 * KIRMIZI ÇİZGİ — UYDURMA YOK: yalnız engine çıktısında DOĞRULANMIŞ alanlar map'lenir.
 *  - `grossAccruedInterest`  = CalculationResult.totalInterest → işleyen BRÜT faiz (segment'lerden; ödeme tahsisinden BAĞIMSIZ).
 *  - `remainingPrincipal` / `remainingInterest` = CalculationResult.remainingPrincipal / .remainingInterest
 *    (PR-1b: engine finalDebtStates'ten expose; allocation SONRASI kalan / ödeme yoksa brüt). GERÇEK, türetilmemiş.
 *  - `claimRemaining`  = CalculationResult.totalDue → kalan alacak (anapara+faiz, claim-only). INVARIANT: ≈ remainingPrincipal + remainingInterest.
 *  - `costs`/`ancillaries` = Σ CaseBalanceResult.projections.costs / .ancillaries (CASE-level; currency-split DEĞİL).
 *  - `collected`       = best-effort: ödeme-bazında dedup Σ allocations.paymentAmount (ödeme yoksa 0).
 */

import type { CaseBalanceResult } from './case-balance.service';

export interface CaseBalanceDisplayCurrency {
  currency: string;
  /** İşleyen BRÜT faiz (totalInterest; ödeme tahsisinden bağımsız). */
  grossAccruedInterest: number;
  /** Kalan anapara (allocation sonrası; ödeme yoksa brüt) = CalculationResult.remainingPrincipal. */
  remainingPrincipal: number;
  /** Kalan faiz (allocation sonrası; ödeme yoksa brüt; ≤ grossAccruedInterest) = CalculationResult.remainingInterest. */
  remainingInterest: number;
  /** Kalan alacak (anapara+faiz, claim-only) = totalDue. INVARIANT: ≈ remainingPrincipal + remainingInterest. */
  claimRemaining: number;
  /** Best-effort tahsilat: ödeme-bazında dedup Σ allocations.paymentAmount (ödeme yoksa 0). */
  collected: number;
  /** Bu currency grubu hesaplanmadıysa (0-bucket / engine error). */
  skipped: boolean;
  skippedReason: string | null;
}

export interface CaseBalanceDisplay {
  caseId: string;
  asOfDate: string;
  source: CaseBalanceResult['source'];
  status: 'OK' | 'UNAVAILABLE';
  /** Masraf projeksiyonu (CASE-level; currency-split DEĞİL) = Σ projections.costs. */
  costs: number;
  /** Fer'i / yan-alacak projeksiyonu (CASE-level) = Σ projections.ancillaries. */
  ancillaries: number;
  currencies: CaseBalanceDisplayCurrency[];
  /** Dürüstlük/limit notları (panel sözleşmesi netliği). */
  notes: string[];
  unavailableReason?: string;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const sumRecord = (rec: Partial<Record<string, number>> | undefined): number => {
  if (!rec) return 0;
  let total = 0;
  for (const v of Object.values(rec)) total += v ?? 0;
  return total;
};

const DISPLAY_NOTES: string[] = [
  'grossAccruedInterest = işleyen BRÜT faiz (totalInterest); remainingInterest = allocation sonrası KALAN faiz (≤ brüt). Ödeme yoksa remaining == brüt.',
  'INVARIANT: claimRemaining (totalDue) ≈ remainingPrincipal + remainingInterest (claim-only; costs/ancillaries AYRI projeksiyon).',
  'costs/ancillaries CASE-level projeksiyon; currency-split DEĞİL.',
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

/** CaseBalanceResult → CaseBalanceDisplay. SAF. caseId controller param'ından gelir (engine result taşımaz). */
export function toCaseBalanceDisplay(caseId: string, balance: CaseBalanceResult): CaseBalanceDisplay {
  const fatal = balance.diagnostics?.fatal ?? [];
  const status: 'OK' | 'UNAVAILABLE' = fatal.length > 0 ? 'UNAVAILABLE' : 'OK';

  const currencies: CaseBalanceDisplayCurrency[] = (balance.currencyResults ?? []).map((cr) => ({
    currency: cr.currency,
    grossAccruedInterest: round2(cr.result?.totalInterest ?? 0),
    remainingPrincipal: round2(cr.result?.remainingPrincipal ?? 0),
    remainingInterest: round2(cr.result?.remainingInterest ?? 0),
    claimRemaining: round2(cr.result?.totalDue ?? 0),
    collected: round2(sumCollected(cr.result?.allocations)),
    skipped: cr.result == null,
    skippedReason: cr.skippedReason ?? null,
  }));

  const display: CaseBalanceDisplay = {
    caseId,
    asOfDate: balance.asOfDate,
    source: balance.source,
    status,
    costs: round2(sumRecord(balance.projections?.costs)),
    ancillaries: round2(sumRecord(balance.projections?.ancillaries)),
    currencies,
    notes: DISPLAY_NOTES,
  };
  if (status === 'UNAVAILABLE') {
    display.unavailableReason = fatal[0]?.code ?? 'UNKNOWN';
  }
  return display;
}
