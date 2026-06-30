import { AccountingJournalCutoverReadinessService } from '../accounting-journal-cutover-readiness.service';
import type { AccountingJournalCutoverCandidateScope } from '../accounting-journal-cutover-readiness.types';

function trialBalanceReport(overrides: any = {}) {
  return {
    tenantId: 'tenant-1',
    filters: { tenantId: 'tenant-1' },
    rows: [],
    totals: [],
    sourceBreakdown: [],
    diagnostics: {
      balanced: true,
      dimensionScoped: false,
      partialEntryScope: false,
      dateBasis: 'postedAt',
      generatedAt: '2026-06-30T00:00:00.000Z',
      lineCount: 2,
      entryCount: 1,
      currencyCount: 1,
      evidenceStatus: 'BALANCED',
      unbalancedCurrencies: [],
      missingEffectiveDateColumn: true,
      missingSourceVersionColumn: true,
      warningCodes: [],
      ...(overrides.diagnostics ?? {}),
    },
    reconciliation: {
      evidenceSource: 'PERSISTED_ACCOUNTING_JOURNAL',
      aggregateBasis: 'DB_AGGREGATE',
      tenantScoped: true,
      dateBasis: 'postedAt',
      amountBasis: 'AccountingJournalLine.amount',
      directionBasis: 'AccountingJournalLine.direction',
      entryJoinBasis: 'AccountingJournalLine.journalEntryId -> AccountingJournalEntry.id',
      balanced: true,
      evidenceStatus: 'BALANCED',
      lineCount: 2,
      entryCount: 1,
      currencyCount: 1,
      sourceCount: 1,
      sourceCoverage: [],
      warnings: [],
      ...(overrides.reconciliation ?? {}),
    },
    ...overrides,
  };
}

function acceptedExclusionSignoff(overrides: any = {}) {
  return {
    status: 'NOT_REQUIRED',
    required: false,
    rows: 0,
    reasonCodes: [],
    rowKeys: [],
    evidenceFingerprint: null,
    items: [],
    policyCodes: [],
    sourceTypes: [],
    sourceActions: [],
    retainedCutoverBlockerCodes: [],
    ...overrides,
  };
}

function zeroing(overrides: any = {}) {
  return {
    zeroedRows: 2,
    acceptedExclusionRows: 0,
    unsupportedBlockerRows: 0,
    realMismatchRows: 0,
    diagnosticOnlyRows: 0,
    blockingDivergentRows: 0,
    blockingSummaryOnlyRows: 0,
    blockingEngineOnlyRows: 0,
    ...overrides,
  };
}

function coverage(overrides: any = {}) {
  return {
    journalLineCount: 2,
    projectionSourceCount: 1,
    legalLedgerEntryCount: 1,
    suppressedSourceCount: 0,
    comparedRows: 2,
    matchRows: 2,
    divergentRows: 0,
    summaryOnlyRows: 0,
    engineOnlyRows: 0,
    legalMappedRows: 2,
    legalAcceptedExclusionRows: 0,
    legalBlockedRows: 0,
    zeroedRows: 2,
    acceptedExclusionRows: 0,
    unsupportedBlockerRows: 0,
    realMismatchRows: 0,
    diagnosticOnlyRows: 0,
    blockingDivergentRows: 0,
    blockingSummaryOnlyRows: 0,
    blockingEngineOnlyRows: 0,
    ...overrides,
  };
}

function legalShadowReport(overrides: any = {}) {
  const blockerCodes = overrides.blockerCodes ?? [];
  const zeroingReport = overrides.zeroing ?? zeroing();
  const signoff = overrides.acceptedExclusionSignoff ?? acceptedExclusionSignoff();
  return {
    tenantId: 'tenant-1',
    filters: { tenantId: 'tenant-1' },
    rows: [],
    blockers: blockerCodes.map((code: string) => ({ code, severity: 'RED', message: code })),
    diagnostics: [],
    cutoverReadiness: {
      safeForPrimaryCutover: overrides.safeForPrimaryCutover ?? true,
      safeForOptInShadow: true,
      blockers: blockerCodes,
      zeroing: zeroingReport,
      nextRequiredEvidence: [],
    },
    technicalAcceptanceStatus: overrides.technicalAcceptanceStatus ?? 'READY_FOR_PRIMARY_CUTOVER',
    technicalAcceptance: {
      status: overrides.technicalAcceptanceStatus ?? 'READY_FOR_PRIMARY_CUTOVER',
      thresholds: {},
      failingThresholds: [],
      acceptedExclusionSignoff: signoff,
      redBlockerFamilies: [],
      evidenceChecklist: { rowLevelFields: [], sourceIdentityFields: [] },
    },
    coverage: overrides.coverage ?? coverage(),
  };
}

function scope(report: any, id: AccountingJournalCutoverCandidateScope) {
  return report.candidateScopes.find((candidate: any) => candidate.scope === id);
}

describe('AccountingJournalCutoverReadinessService', () => {
  it('all-zero evidence classifies scoped journal primary candidates as ready without switching primary reads', async () => {
    const trialBalance = { getTrialBalance: jest.fn().mockResolvedValue(trialBalanceReport()) };
    const legalShadow = { compare: jest.fn().mockResolvedValue(legalShadowReport()) };
    const service = new AccountingJournalCutoverReadinessService(trialBalance as any, legalShadow as any);

    const report = await service.getCutoverReadiness({ tenantId: 'tenant-1', currency: 'TRY' });

    expect(trialBalance.getTrialBalance).toHaveBeenCalledWith({ tenantId: 'tenant-1', currency: 'TRY' });
    expect(legalShadow.compare).toHaveBeenCalledWith({ tenantId: 'tenant-1', currency: 'TRY' });
    expect(report.mode).toBe('READ_ONLY_GATE');
    expect(report.primarySwitchUnchanged).toBe(true);
    expect(report.technicalGateStatus).toBe('READY_FOR_PRIMARY_CUTOVER');
    expect(scope(report, 'TRIAL_BALANCE_REPORT')).toEqual(expect.objectContaining({
      candidateStatus: 'READY',
      fallbackRequired: false,
      blockerCodes: [],
    }));
    expect(scope(report, 'LEGAL_SHADOW_COMPARE')).toEqual(expect.objectContaining({
      candidateStatus: 'READY',
      fallbackRequired: false,
      blockerCodes: [],
    }));
    expect(scope(report, 'CLIENT_ACCOUNTING_MOVEMENTS_CLIENT_SPECIFIC')).toEqual(expect.objectContaining({
      candidateStatus: 'READY',
      fallbackRequired: false,
      requiredFeatureFlag: 'ACCOUNTING_JOURNAL_PRIMARY_READ_MODE',
    }));
    expect(scope(report, 'CLIENT_ACCOUNTING_SUMMARY')).toEqual(expect.objectContaining({
      candidateStatus: 'SHADOW_ONLY',
      fallbackRequired: true,
    }));
  });

  it('accepted-exclusion-only evidence stays visible for legal signoff and keeps user-facing reads shadow-only', async () => {
    const signoff = acceptedExclusionSignoff({
      status: 'READY_FOR_SIGNOFF',
      required: true,
      rows: 1,
      reasonCodes: ['LEGAL_LEDGER_ACCEPTED_EXCLUSION'],
      rowKeys: ['legal-row-1'],
      evidenceFingerprint: 'a'.repeat(64),
      retainedCutoverBlockerCodes: ['LEGAL_LEDGER_ACCEPTED_EXCLUSION', 'SUMMARY_ONLY_SHADOW_ROW'],
    });
    const service = new AccountingJournalCutoverReadinessService(
      { getTrialBalance: jest.fn().mockResolvedValue(trialBalanceReport()) } as any,
      {
        compare: jest.fn().mockResolvedValue(legalShadowReport({
          technicalAcceptanceStatus: 'READY_FOR_LEGAL_SIGNOFF',
          safeForPrimaryCutover: false,
          blockerCodes: ['LEGAL_LEDGER_ACCEPTED_EXCLUSION'],
          acceptedExclusionSignoff: signoff,
          zeroing: zeroing({ acceptedExclusionRows: 1, zeroedRows: 1 }),
          coverage: coverage({ acceptedExclusionRows: 1, legalAcceptedExclusionRows: 1 }),
        })),
      } as any,
    );

    const report = await service.getCutoverReadiness({ tenantId: 'tenant-1' });

    expect(report.technicalGateStatus).toBe('READY_FOR_LEGAL_SIGNOFF');
    expect(report.legalShadow.acceptedExclusionSignoff).toEqual(expect.objectContaining({
      status: 'READY_FOR_SIGNOFF',
      evidenceFingerprint: 'a'.repeat(64),
      retainedCutoverBlockerCodes: ['LEGAL_LEDGER_ACCEPTED_EXCLUSION', 'SUMMARY_ONLY_SHADOW_ROW'],
    }));
    expect(scope(report, 'LEGAL_SHADOW_COMPARE')).toEqual(expect.objectContaining({
      candidateStatus: 'SHADOW_ONLY',
      fallbackRequired: true,
      blockerCodes: ['LEGAL_LEDGER_ACCEPTED_EXCLUSION', 'SUMMARY_ONLY_SHADOW_ROW'],
    }));
    expect(scope(report, 'CLIENT_ACCOUNTING_MOVEMENTS_CLIENT_SPECIFIC')).toEqual(expect.objectContaining({
      candidateStatus: 'SHADOW_ONLY',
      fallbackRequired: true,
    }));
  });

  it('unsupported blocker evidence blocks cutover candidates and preserves blocker codes', async () => {
    const service = new AccountingJournalCutoverReadinessService(
      { getTrialBalance: jest.fn().mockResolvedValue(trialBalanceReport()) } as any,
      {
        compare: jest.fn().mockResolvedValue(legalShadowReport({
          technicalAcceptanceStatus: 'BLOCKED',
          safeForPrimaryCutover: false,
          blockerCodes: ['LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL'],
          zeroing: zeroing({ unsupportedBlockerRows: 1, zeroedRows: 1 }),
          coverage: coverage({ unsupportedBlockerRows: 1, legalBlockedRows: 1 }),
        })),
      } as any,
    );

    const report = await service.getCutoverReadiness({ tenantId: 'tenant-1' });

    expect(report.technicalGateStatus).toBe('BLOCKED');
    expect(report.legalShadow.blockerCodes).toEqual(['LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL']);
    expect(scope(report, 'LEGAL_SHADOW_COMPARE')).toEqual(expect.objectContaining({
      candidateStatus: 'BLOCKED',
      fallbackRequired: true,
      blockerCodes: ['LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL'],
    }));
    expect(scope(report, 'CLIENT_ACCOUNTING_MOVEMENTS_CLIENT_SPECIFIC')).toEqual(expect.objectContaining({
      candidateStatus: 'BLOCKED',
      blockerCodes: ['LEGAL_LEDGER_UNSUPPORTED_CANCEL_REVERSAL_BACKFILL'],
    }));
  });
});
