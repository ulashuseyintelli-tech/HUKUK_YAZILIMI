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

export interface ShadowTotals {
  currency: string | null;
  totalDebtAmount: number | null;
  totalPaidAmount: number | null;
  outstandingAmount: number | null;
  interestAmount: number | null;
  costsAmount: number | null;
  attorneyFeeAmount: number | null;
  heldOverpaymentAmount?: number | null;
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
  generatedAt: string;
  sourceVersion: string;
  mode: 'SHADOW_ONLY';
  primaryDisplayUnchanged: true;
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
