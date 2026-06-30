import type {
  AccountingJournalLegalShadowAcceptedExclusionSignoff,
  AccountingJournalLegalShadowCoverage,
  AccountingJournalLegalShadowCutoverReadiness,
  AccountingJournalLegalShadowTechnicalAcceptanceStatus,
  AccountingJournalLegalShadowZeroingSummary,
} from './accounting-journal-legal-shadow-compare.service';
import type {
  AccountingJournalTrialBalanceEvidenceStatus,
  AccountingJournalTrialBalanceFilters,
  AccountingJournalTrialBalanceWarningCode,
} from './accounting-journal-trial-balance.types';

export type AccountingJournalCutoverReadinessMode = 'READ_ONLY_GATE';

export type AccountingJournalCutoverCandidateScope =
  | 'TRIAL_BALANCE_REPORT'
  | 'LEGAL_SHADOW_COMPARE'
  | 'CLIENT_ACCOUNTING_MOVEMENTS_CLIENT_SPECIFIC'
  | 'CLIENT_ACCOUNTING_SUMMARY'
  | 'CASE_BALANCE_LEDGER';

export type AccountingJournalCutoverCandidateStatus =
  | 'READY'
  | 'SHADOW_ONLY'
  | 'BLOCKED';

export interface AccountingJournalCutoverReadinessFilters
  extends Pick<AccountingJournalTrialBalanceFilters, 'tenantId' | 'currency' | 'caseId' | 'postedFrom' | 'postedTo'> {}

export interface AccountingJournalCutoverTrialBalanceEvidence {
  evidenceStatus: AccountingJournalTrialBalanceEvidenceStatus;
  balanced: boolean;
  dimensionScoped: boolean;
  lineCount: number;
  entryCount: number;
  currencyCount: number;
  warningCodes: AccountingJournalTrialBalanceWarningCode[];
}

export interface AccountingJournalCutoverLegalShadowEvidence {
  technicalAcceptanceStatus: AccountingJournalLegalShadowTechnicalAcceptanceStatus;
  safeForPrimaryCutover: boolean;
  safeForOptInShadow: boolean;
  blockerCodes: string[];
  acceptedExclusionSignoff: AccountingJournalLegalShadowAcceptedExclusionSignoff;
  zeroing: AccountingJournalLegalShadowZeroingSummary;
  coverage: AccountingJournalLegalShadowCoverage;
}

export interface AccountingJournalCutoverCandidateReadScope {
  scope: AccountingJournalCutoverCandidateScope;
  module: string;
  endpoint: string | null;
  candidateStatus: AccountingJournalCutoverCandidateStatus;
  fallbackRequired: boolean;
  requiredFeatureFlag: string | null;
  blockerCodes: string[];
}

export interface AccountingJournalCutoverReadinessReport {
  tenantId: string;
  filters: AccountingJournalCutoverReadinessFilters;
  generatedAt: string;
  sourceVersion: 'acct-cutover-readiness-v1';
  mode: AccountingJournalCutoverReadinessMode;
  primarySwitchUnchanged: true;
  technicalGateStatus: AccountingJournalLegalShadowTechnicalAcceptanceStatus;
  trialBalance: AccountingJournalCutoverTrialBalanceEvidence;
  legalShadow: AccountingJournalCutoverLegalShadowEvidence;
  candidateScopes: AccountingJournalCutoverCandidateReadScope[];
  nextImplementationTask: string;
}
