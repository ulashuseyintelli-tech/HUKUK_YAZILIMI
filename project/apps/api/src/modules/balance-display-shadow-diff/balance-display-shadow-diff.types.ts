import type { CanonicalSummaryShadowStatusRow } from '../interest-engine/orchestration/canonical-summary-rows';
import type { BalanceDisplayReceipts } from '../interest-engine/orchestration/case-balance-display';

export type ShadowDiffClassification =
  | 'EXACT_MATCH'
  | 'EXPECTED_CANONICAL_DIVERGENCE'
  | 'LEGACY_STUB'
  | 'LEGACY_AUTHORITY_RISK'
  | 'CANONICAL_UNSAFE'
  | 'MISSING_LEGACY_FIELD'
  | 'MISSING_CANONICAL_FIELD'
  | 'CURRENCY_MISMATCH'
  | 'CONTEXT_MISMATCH'
  | 'BLOCKER';

export type ShadowDiffSeverity =
  | 'GREEN'
  | 'YELLOW'
  | 'RED'
  | 'UNKNOWN_NEEDS_FOLLOWUP';

export type ShadowAmountDiffStatus =
  | 'MATCH'
  | 'MINOR_DELTA'
  | 'MAJOR_DELTA'
  | 'LEGACY_ONLY'
  | 'CANONICAL_ONLY'
  | 'NOT_COMPARABLE';

/**
 * ADR014-PE-01A: Finansal readiness'e katılan bounded comparison alanları.
 * Bu map metric label cardinality'sini ve blocker derivation'ını tek yerde tutar.
 */
export const SHADOW_FINANCIAL_DIFF_FIELDS = {
  TOTAL_DEBT_DELTA: 'TOTAL',
  OUTSTANDING_DELTA: 'OUTSTANDING',
  PAID_DELTA: 'PAID',
  INTEREST_DELTA: 'INTEREST',
  COSTS_DELTA: 'COST',
  ATTORNEY_FEE_DELTA: 'ATTORNEY_FEE',
  PRINCIPAL_BUCKET_DELTA: 'PRINCIPAL',
  ACCRUED_INTEREST_BUCKET_DELTA: 'INTEREST',
  EXPENSE_BUCKET_DELTA: 'EXPENSE',
  ATTORNEY_FEE_BUCKET_DELTA: 'ATTORNEY_FEE',
} as const;

export type ShadowFinancialDiffCode = keyof typeof SHADOW_FINANCIAL_DIFF_FIELDS;
export type ShadowFinancialField = typeof SHADOW_FINANCIAL_DIFF_FIELDS[ShadowFinancialDiffCode];

/** Direct comparison row'u bulunmayan fakat canonical contract'ta zorunlu evidence. */
export interface ShadowRequiredComparisonEvidence {
  paymentAllocationTotals: boolean;
  interestBase: boolean;
  feeProjection: boolean;
}

export interface ShadowDiffIssue {
  code: string;
  classification: ShadowDiffClassification;
  severity: ShadowDiffSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export type ShadowDiffBlocker = ShadowDiffIssue & { severity: 'RED' };
export type ShadowDiffWarning = ShadowDiffIssue & { severity: 'YELLOW' | 'UNKNOWN_NEEDS_FOLLOWUP' };
export type ShadowDiffDiagnostic = ShadowDiffIssue;

export interface ShadowTotals {
  currency: string | null;
  totalDebtAmount: number | null;
  /**
   * ALC-AUTH-1A/1B (2026-07-04): canonical tarafında bu, yalnız BORCA FİİLEN TAHSİS
   * EDİLMİŞ tutardır — "dosyaya gelen toplam para" değildir. Bkz. `allocatedPaidAmount`
   * (aynı değer, açık isim) ve `grossReceivedAmount` (Toplam tahsilat).
   * K3-L TK-5: canonical değeri = Σ amountAllocated (önceden tahsis adımı olan ödemelerin yüz değeri).
   * Legacy tarafında `toplamTahsilat` (tarih süzgeçsiz kayıtlı tahsilat) — iki taraf aynı ölçü DEĞİL.
   */
  totalPaidAmount: number | null;
  outstandingAmount: number | null;
  interestAmount: number | null;
  costsAmount: number | null;
  attorneyFeeAmount: number | null;
  heldOverpaymentAmount?: number | null;
  /** ALC-AUTH-1B: totalPaidAmount ile aynı değer, açık isimle tekrarlanır (yalnız canonical). */
  allocatedPaidAmount?: number | null;
  /**
   * K3-L KP-7 (yalnız canonical): "Toplam tahsilat" — hesap tarihine kadar dosyaya fiilen giren, ters kayıtla netleşmiş
   * para (mahsubu bekletilen dahil) = `receipts.receivedAmount`.
   */
  grossReceivedAmount?: number | null;
  /** K3-L KP-7 (yalnız canonical): Toplam tahsilat / Borca uygulanan / Dağıtım bekleyen bloğu. */
  receipts?: BalanceDisplayReceipts | null;
  raw: Record<string, number | null>;
}

export interface ShadowAmountDiff {
  code: string;
  label: string;
  classification: ShadowDiffClassification;
  legacyField: string;
  canonicalField: string;
  legacyAmount: number | null;
  canonicalAmount: number | null;
  delta: number | null;
  deltaPercent: number | null;
  status: ShadowAmountDiffStatus;
  severity: ShadowDiffSeverity;
  explanation: string;
}

export interface ShadowBucketDiff extends ShadowAmountDiff {
  bucket: string;
  canonicalDisplayable: boolean;
}

export interface BalanceDisplayShadowDiffReport {
  tenantId: string;
  caseId: string;
  currency: string | null;
  /**
   * K3-L KP-7: legacy ve canonical tarafın BİRLİKTE hesaplandığı hesap tarihi. Tüketici bu raporu yalnız aynı
   * tarihli bir özetle birleştirebilir (farklı tarih kapsamı mutabık gösterilmez).
   */
  asOfDate: string;
  generatedAt: string;
  sourceVersion: string;
  mode: 'SHADOW_ONLY';
  primaryDisplayUnchanged: true;
  canonicalSummaryRows: CanonicalSummaryShadowStatusRow[];
  sources: {
    legacyCalculationSummary: {
      available: boolean;
      endpoint: '/cases/:id/calculation-summary';
      authority: 'LEGACY_DISPLAY';
      diagnostics: string[];
    };
    canonicalBalanceDisplay: {
      available: boolean;
      endpoint: '/interest-engine/case/:caseId/balance/display';
      authority: string;
      diagnostics: string[];
      unsafeSources: string[];
    };
  };
  comparability: {
    comparable: boolean;
    classification: ShadowDiffClassification;
    severity: ShadowDiffSeverity;
    blockers: ShadowDiffBlocker[];
    warnings: ShadowDiffWarning[];
  };
  totals: {
    legacy?: ShadowTotals;
    canonical?: ShadowTotals;
    diffs: ShadowAmountDiff[];
  };
  bucketDiffs: ShadowBucketDiff[];
  diagnostics: ShadowDiffDiagnostic[];
  cutoverReadiness: {
    safeForPrimaryDisplay: boolean;
    safeForOptInShadow: boolean;
    blockers: string[];
    nextRequiredEvidence: string[];
  };
  provenance: {
    legacyCalculationSummaryUsed: boolean;
    canonicalBalanceDisplayUsed: boolean;
    computeBalanceUsed: boolean;
    finalDebtStatesAvailable: boolean;
    claimItemCollectedAmountUsedAsAuthority: boolean;
    overpaymentHeldAvailable: boolean;
    blockedOverpaymentDiagnosticsAvailable: boolean;
  };
}
