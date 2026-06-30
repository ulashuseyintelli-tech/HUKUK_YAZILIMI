import { Injectable } from '@nestjs/common';
import {
  AccountingJournalLegalShadowCompareService,
  type AccountingJournalLegalShadowCompareReport,
} from './accounting-journal-legal-shadow-compare.service';
import { AccountingJournalTrialBalanceService } from './accounting-journal-trial-balance.service';
import type { AccountingJournalTrialBalanceReport } from './accounting-journal-trial-balance.types';
import type {
  AccountingJournalCutoverCandidateReadScope,
  AccountingJournalCutoverCandidateStatus,
  AccountingJournalCutoverLegalShadowEvidence,
  AccountingJournalCutoverReadinessFilters,
  AccountingJournalCutoverReadinessReport,
  AccountingJournalCutoverTrialBalanceEvidence,
} from './accounting-journal-cutover-readiness.types';

const PRIMARY_READ_FEATURE_FLAG = 'ACCOUNTING_JOURNAL_PRIMARY_READ_MODE';

const NEXT_IMPLEMENTATION_TASK = 'ACCT-CUTOVER-2 journal-derived client accounting movements reader behind read-mode flag';

@Injectable()
export class AccountingJournalCutoverReadinessService {
  constructor(
    private readonly trialBalance: AccountingJournalTrialBalanceService,
    private readonly legalShadowCompare: AccountingJournalLegalShadowCompareService,
  ) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalCutoverReadinessController.getCutoverReadiness() -> GET /accounting-journal/cutover-readiness (read-only admin cutover gate).
  /// - ACCT-CUTOVER-1 tests -> Primary read adaylarini feature-flag ve legal shadow evidence ile siniflandirir.
  /// </remarks>
  async getCutoverReadiness(
    filters: AccountingJournalCutoverReadinessFilters,
  ): Promise<AccountingJournalCutoverReadinessReport> {
    const [trialBalance, legalShadow] = await Promise.all([
      this.trialBalance.getTrialBalance(filters),
      this.legalShadowCompare.compare(filters),
    ]);

    const trialEvidence = trialBalanceEvidence(trialBalance);
    const legalEvidence = legalShadowEvidence(legalShadow);

    return {
      tenantId: filters.tenantId,
      filters,
      generatedAt: new Date().toISOString(),
      sourceVersion: 'acct-cutover-readiness-v1',
      mode: 'READ_ONLY_GATE',
      primarySwitchUnchanged: true,
      technicalGateStatus: legalShadow.technicalAcceptanceStatus,
      trialBalance: trialEvidence,
      legalShadow: legalEvidence,
      candidateScopes: candidateScopes(trialEvidence, legalEvidence),
      nextImplementationTask: NEXT_IMPLEMENTATION_TASK,
    };
  }
}

function trialBalanceEvidence(report: AccountingJournalTrialBalanceReport): AccountingJournalCutoverTrialBalanceEvidence {
  return {
    evidenceStatus: report.reconciliation?.evidenceStatus ?? report.diagnostics.evidenceStatus,
    balanced: report.reconciliation?.balanced ?? report.diagnostics.balanced,
    dimensionScoped: report.diagnostics.dimensionScoped,
    lineCount: report.reconciliation?.lineCount ?? report.diagnostics.lineCount,
    entryCount: report.reconciliation?.entryCount ?? report.diagnostics.entryCount,
    currencyCount: report.reconciliation?.currencyCount ?? report.diagnostics.currencyCount,
    warningCodes: report.diagnostics.warningCodes,
  };
}

function legalShadowEvidence(report: AccountingJournalLegalShadowCompareReport): AccountingJournalCutoverLegalShadowEvidence {
  return {
    technicalAcceptanceStatus: report.technicalAcceptanceStatus,
    safeForPrimaryCutover: report.cutoverReadiness.safeForPrimaryCutover,
    safeForOptInShadow: report.cutoverReadiness.safeForOptInShadow,
    blockerCodes: report.cutoverReadiness.blockers,
    acceptedExclusionSignoff: report.technicalAcceptance.acceptedExclusionSignoff,
    zeroing: report.cutoverReadiness.zeroing,
    coverage: report.coverage,
  };
}

function candidateScopes(
  trialBalance: AccountingJournalCutoverTrialBalanceEvidence,
  legalShadow: AccountingJournalCutoverLegalShadowEvidence,
): AccountingJournalCutoverCandidateReadScope[] {
  return [
    trialBalanceScope(trialBalance),
    legalShadowScope(legalShadow),
    userFacingScope({
      scope: 'CLIENT_ACCOUNTING_MOVEMENTS_CLIENT_SPECIFIC',
      module: 'ClientSettlementModule',
      endpoint: 'GET /clients/:clientId/accounting/movements?scope=client&group=CLIENT_SPECIFIC',
      legalShadow,
    }),
    guardedShadowOnlyScope({
      scope: 'CLIENT_ACCOUNTING_SUMMARY',
      module: 'ClientSettlementModule',
      endpoint: 'GET /clients/:clientId/accounting/summary',
      legalShadow,
      staticBlockers: [
        'JOURNAL_DERIVED_CLIENT_ACCOUNTING_SUMMARY_READER_MISSING',
        'EXPENSE_REQUEST_JOURNAL_COVERAGE_MISSING',
        'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
      ],
    }),
    guardedShadowOnlyScope({
      scope: 'CASE_BALANCE_LEDGER',
      module: 'CaseBalanceModule',
      endpoint: 'GET /cases/:caseId/balance/ledger',
      legalShadow,
      staticBlockers: [
        'JOURNAL_DERIVED_CASE_BALANCE_LEDGER_READER_MISSING',
        'BALANCE_LEDGER_ADJUST_REFUND_POLICY_UNRESOLVED',
      ],
    }),
  ];
}

function trialBalanceScope(
  trialBalance: AccountingJournalCutoverTrialBalanceEvidence,
): AccountingJournalCutoverCandidateReadScope {
  const blockerCodes = trialBalanceBlockers(trialBalance);
  const status = blockerCodes.length === 0 ? 'READY' : 'BLOCKED';
  return {
    scope: 'TRIAL_BALANCE_REPORT',
    module: 'AccountingJournalTrialBalanceModule',
    endpoint: 'GET /accounting-journal/trial-balance',
    candidateStatus: status,
    fallbackRequired: status !== 'READY',
    requiredFeatureFlag: null,
    blockerCodes,
  };
}

function legalShadowScope(
  legalShadow: AccountingJournalCutoverLegalShadowEvidence,
): AccountingJournalCutoverCandidateReadScope {
  const status = legalGateCandidateStatus(legalShadow);
  return {
    scope: 'LEGAL_SHADOW_COMPARE',
    module: 'AccountingJournalTrialBalanceModule',
    endpoint: 'GET /accounting-journal/cutover-readiness',
    candidateStatus: status,
    fallbackRequired: status !== 'READY',
    requiredFeatureFlag: null,
    blockerCodes: status === 'READY' ? [] : legalGateBlockers(legalShadow),
  };
}

function userFacingScope(input: {
  scope: AccountingJournalCutoverCandidateReadScope['scope'];
  module: string;
  endpoint: string;
  legalShadow: AccountingJournalCutoverLegalShadowEvidence;
}): AccountingJournalCutoverCandidateReadScope {
  const status = legalGateCandidateStatus(input.legalShadow);
  return {
    scope: input.scope,
    module: input.module,
    endpoint: input.endpoint,
    candidateStatus: status,
    fallbackRequired: status !== 'READY',
    requiredFeatureFlag: PRIMARY_READ_FEATURE_FLAG,
    blockerCodes: status === 'READY' ? [] : legalGateBlockers(input.legalShadow),
  };
}

function guardedShadowOnlyScope(input: {
  scope: AccountingJournalCutoverCandidateReadScope['scope'];
  module: string;
  endpoint: string;
  legalShadow: AccountingJournalCutoverLegalShadowEvidence;
  staticBlockers: string[];
}): AccountingJournalCutoverCandidateReadScope {
  const legalStatus = legalGateCandidateStatus(input.legalShadow);
  const blockerCodes = uniqueSorted([
    ...input.staticBlockers,
    ...(legalStatus === 'READY' ? [] : legalGateBlockers(input.legalShadow)),
  ]);

  return {
    scope: input.scope,
    module: input.module,
    endpoint: input.endpoint,
    candidateStatus: legalStatus === 'BLOCKED' ? 'BLOCKED' : 'SHADOW_ONLY',
    fallbackRequired: true,
    requiredFeatureFlag: PRIMARY_READ_FEATURE_FLAG,
    blockerCodes,
  };
}

function legalGateCandidateStatus(
  legalShadow: AccountingJournalCutoverLegalShadowEvidence,
): AccountingJournalCutoverCandidateStatus {
  if (legalShadow.technicalAcceptanceStatus === 'BLOCKED') return 'BLOCKED';
  if (legalShadow.technicalAcceptanceStatus === 'READY_FOR_LEGAL_SIGNOFF') return 'SHADOW_ONLY';
  return 'READY';
}

function legalGateBlockers(legalShadow: AccountingJournalCutoverLegalShadowEvidence): string[] {
  return uniqueSorted([
    ...legalShadow.blockerCodes,
    ...legalShadow.acceptedExclusionSignoff.retainedCutoverBlockerCodes,
  ]);
}

function trialBalanceBlockers(trialBalance: AccountingJournalCutoverTrialBalanceEvidence): string[] {
  const blockers: string[] = [];
  if (trialBalance.lineCount === 0) blockers.push('TRIAL_BALANCE_NO_JOURNAL_LINES');
  if (!trialBalance.balanced) blockers.push('TRIAL_BALANCE_IMBALANCED');
  if (trialBalance.dimensionScoped) blockers.push('TRIAL_BALANCE_DIMENSION_SCOPED');
  return blockers;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
