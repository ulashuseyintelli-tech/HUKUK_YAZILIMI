import {
  ClientAccountingSummaryShadowComponent,
  ClientAccountingSummaryShadowReport,
  ClientAccountingSummaryShadowReportService,
} from '../client-accounting-summary-shadow-report.service';

function buildReport(): ClientAccountingSummaryShadowReport {
  return new ClientAccountingSummaryShadowReportService().getSummaryShadowReport({
    tenantId: 'tenant-1',
    clientId: 'client-1',
  });
}

function component(
  report: ClientAccountingSummaryShadowReport,
  key: string,
): ClientAccountingSummaryShadowComponent {
  const found = report.components.find((item) => item.key === key);

  if (!found) {
    throw new Error(`Missing summary shadow component ${key}`);
  }

  return found;
}

describe('ClientAccountingSummaryShadowReportService', () => {
  it('reports journal-supported summary components', () => {
    const report = buildReport();

    expect(report.mode).toBe('READ_ONLY_COMPONENT_COVERAGE');
    expect(component(report, 'payableNet')).toEqual(
      expect.objectContaining({
        coverage: 'JOURNAL_SUPPORTED',
        journalSources: ['COLLECTION_DISPOSITION_LINE', 'CLIENT_PAYOUT', 'CLIENT_OFFSET'],
        blockerCodes: [],
        gapCodes: [],
      }),
    );
    expect(component(report, 'paidToClient')).toEqual(
      expect.objectContaining({
        coverage: 'JOURNAL_SUPPORTED',
        journalSources: ['CLIENT_PAYOUT'],
      }),
    );
    expect(component(report, 'offsetApplied')).toEqual(
      expect.objectContaining({
        coverage: 'JOURNAL_SUPPORTED',
        journalSources: ['CLIENT_OFFSET'],
      }),
    );
  });

  it('reports explicit gap and blocker summary components', () => {
    const report = buildReport();

    expect(component(report, 'expensePaid')).toEqual(
      expect.objectContaining({
        coverage: 'GAP',
        legacySources: ['ExpenseRequest', 'ExpensePayment'],
        gapCodes: expect.arrayContaining(['EXPENSE_PAYMENT_JOURNAL_SOURCE_MISSING']),
      }),
    );
    expect(component(report, 'expenseUnpaid')).toEqual(
      expect.objectContaining({
        coverage: 'BLOCKER',
        blockerCodes: expect.arrayContaining([
          'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_COVERAGE_MISSING',
        ]),
      }),
    );
    expect(component(report, 'debtorCollection')).toEqual(
      expect.objectContaining({
        coverage: 'GAP',
        gapCodes: ['COLLECTION_JOURNAL_SOURCE_MISSING'],
      }),
    );
    expect(component(report, 'pendingDistribution')).toEqual(
      expect.objectContaining({
        coverage: 'BLOCKER',
        blockerCodes: ['CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING'],
      }),
    );
    expect(component(report, 'advanceBalance')).toEqual(
      expect.objectContaining({
        coverage: 'BLOCKER',
        journalSources: ['BALANCE_LEDGER'],
        blockerCodes: ['CASE_BALANCE_SNAPSHOT_REPLAY_UNVERIFIED'],
      }),
    );
  });

  it('keeps client accounting summary primary readiness blocked', () => {
    const report = buildReport();

    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
    expect(report.primarySwitchUnchanged).toBe(true);
    expect(report.blockerCodes).toEqual(
      expect.arrayContaining([
        'EXPENSE_REQUEST_JOURNAL_COVERAGE_MISSING',
        'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
        'CASE_BALANCE_SNAPSHOT_REPLAY_UNVERIFIED',
      ]),
    );
    expect(report.gapCodes).toEqual(
      expect.arrayContaining([
        'EXPENSE_REQUEST_JOURNAL_SOURCE_MISSING',
        'COLLECTION_JOURNAL_SOURCE_MISSING',
        'CASE_BALANCE_SNAPSHOT_NOT_JOURNAL_DERIVED',
      ]),
    );
    expect(report.nextImplementationTasks[0]).toContain('ACCT-CUTOVER-3B');
  });
});