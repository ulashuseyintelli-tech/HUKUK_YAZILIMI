import { apiClient } from './client';

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

export type ShadowDiffSeverity = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN_NEEDS_FOLLOWUP';

export type ShadowAmountDiffStatus =
  | 'MATCH'
  | 'MINOR_DELTA'
  | 'MAJOR_DELTA'
  | 'LEGACY_ONLY'
  | 'CANONICAL_ONLY'
  | 'NOT_COMPARABLE';

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

/**
 * K3-L KP-7 (owner karari 2026-10-01): tahsilat gosterimi — hesap tarihi kapsamli, tek para birimli.
 * "Toplam tahsilat" = receivedAmount · "Borca uygulanan" = appliedToDebtAmount · "Dagitim bekleyen" = notAppliedAmount
 * (borca uygulanmamis tutar; muvekkil dagitimi DEGIL). receivedAmount = appliedToDebtAmount + notAppliedAmount.
 */
export interface ShadowReceipts {
  currency: string;
  asOfDate: string;
  scope: 'ON_OR_BEFORE_AS_OF_DATE';
  receivedAmount: number;
  paymentAmount: number;
  /** K3-L D1: mahsubu bekletilen tahsilat (borctan dusulmez; ayri satir). */
  allocationHeldAmount: number;
  appliedToDebtAmount: number | null;
  unappliedPaymentAmount: number | null;
  notAppliedAmount: number | null;
  afterAsOfExcludedAmount: number;
  appliedScope: 'PRINCIPAL_AND_INTEREST_ONLY';
  appliedUnavailableReason?: string;
}

export interface ShadowTotals {
  currency: string | null;
  totalDebtAmount: number | null;
  /** Canonical: borca fiilen tahsis edilen (K3-L TK-5). Legacy: toplamTahsilat (tarih suzgecsiz kayitli tahsilat). */
  totalPaidAmount: number | null;
  outstandingAmount: number | null;
  interestAmount: number | null;
  costsAmount: number | null;
  attorneyFeeAmount: number | null;
  heldOverpaymentAmount?: number | null;
  /** Yalniz canonical: totalPaidAmount ile ayni deger (borca uygulanan). */
  allocatedPaidAmount?: number | null;
  /** Yalniz canonical: "Toplam tahsilat" (K3-L KP-7) = receipts.receivedAmount. */
  grossReceivedAmount?: number | null;
  /** Yalniz canonical: K3-L KP-7 tahsilat blogu. */
  receipts?: ShadowReceipts | null;
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

export type CanonicalSummaryRowId = 'tazminat' | 'komisyon' | 'takipOncesiFaiz';

export type CanonicalSummaryRowStatus = 'SUPPORTED' | 'NOT_APPLICABLE' | 'UNSUPPORTED' | 'ERROR';

export type CanonicalSummaryRowSourceAuthority = 'CANONICAL' | 'LEGACY' | 'DERIVED' | 'UNKNOWN';

export type CanonicalSummaryRowAllocationCategory =
  | 'EXPENSE'
  | 'ACCRUED_INTEREST'
  | 'ATTORNEY_FEE'
  | 'OTHER_ANCILLARY'
  | 'PRINCIPAL'
  | 'OVERPAYMENT'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export type CanonicalSummaryRowsContractVersion = 'canonical-summary-rows.shadow-status.v1';

export interface CanonicalSummaryShadowRow {
  readonly rowId: CanonicalSummaryRowId;
  readonly status: CanonicalSummaryRowStatus;
  readonly amount: number | null;
  readonly currency: string | null;
  readonly sourceAuthority: CanonicalSummaryRowSourceAuthority;
  readonly affectsPaymentAllocation: boolean;
  readonly allocationCategory: CanonicalSummaryRowAllocationCategory;
  readonly primaryEligible: boolean;
  readonly contractVersion: CanonicalSummaryRowsContractVersion;
}

export interface BalanceDisplayShadowDiffReport {
  tenantId: string;
  caseId: string;
  currency: string | null;
  /** K3-L KP-7: legacy ve canonical tarafin birlikte hesaplandigi hesap tarihi (eski yanitlarda yok → dogrulanamaz). */
  asOfDate?: string;
  generatedAt: string;
  sourceVersion: string;
  mode: 'SHADOW_ONLY';
  primaryDisplayUnchanged: true;
  readonly canonicalSummaryRows?: readonly CanonicalSummaryShadowRow[];
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

export const balanceShadowDiffApi = {
  /**
   * Shadow-only legacy/canonical bakiye karsilastirmasini getirir.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - useBalanceShadowDiff() → GET /interest-engine/case/:caseId/balance/display/shadow-diff (opt-in UI shadow paneli)
   * </remarks>
   */
  getShadowDiff: async (
    caseId: string,
    asOfDate?: string,
  ): Promise<BalanceDisplayShadowDiffReport> => {
    const params = new URLSearchParams();
    if (asOfDate) params.set('asOfDate', asOfDate);

    const query = params.toString();
    const response = await apiClient.get<BalanceDisplayShadowDiffReport>(
      `/interest-engine/case/${caseId}/balance/display/shadow-diff${query ? `?${query}` : ''}`,
    );
    return response.data;
  },
};
