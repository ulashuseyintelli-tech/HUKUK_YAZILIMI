import { Prisma } from '@prisma/client';
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

function buildPrismaMock(lines: Array<{ sourceType: string; sourceAction: string; amount: string }>) {
  return {
    caseClient: {
      findMany: jest.fn().mockResolvedValue([{ id: 'case-client-1' }]),
    },
    accountingJournalLine: {
      findMany: jest.fn().mockResolvedValue(
        lines.map((line) => ({
          amount: new Prisma.Decimal(line.amount),
          journalEntry: { sourceType: line.sourceType, sourceAction: line.sourceAction },
        })),
      ),
    },
  };
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

function expensePolicyItem(
  report: ClientAccountingSummaryShadowReport,
  componentKey: string,
) {
  const found = report.expenseCoveragePolicy.items.find((item) => item.component === componentKey);

  if (!found) {
    throw new Error(`Missing expense coverage policy item ${componentKey}`);
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
    expect(report.supportedValueSummary).toEqual(
      expect.objectContaining({ status: 'NOT_COMPUTED', notComputedCount: 3 }),
    );
  });

  it('reports explicit gap and blocker summary components', () => {
    const report = buildReport();

    expect(component(report, 'expensePaid')).toEqual(
      expect.objectContaining({
        coverage: 'BLOCKER',
        legacySources: ['ExpenseRequest', 'ExpensePayment'],
        journalSources: ['EXPENSE_PAYMENT'],
        blockerCodes: expect.arrayContaining(['EXPENSE_PAYMENT_LIVE_POSTING_MISSING']),
        gapCodes: expect.not.arrayContaining(['EXPENSE_PAYMENT_JOURNAL_SOURCE_MISSING']),
      }),
    );
    expect(component(report, 'expenseUnpaid')).toEqual(
      expect.objectContaining({
        coverage: 'BLOCKER',
        blockerCodes: expect.arrayContaining([
          'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
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
        'EXPENSE_REQUEST_LIVE_POSTING_MISSING',
        'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
        'CASE_BALANCE_SNAPSHOT_REPLAY_UNVERIFIED',
      ]),
    );
    expect(report.gapCodes).toEqual(
      expect.arrayContaining([
        'COLLECTION_JOURNAL_SOURCE_MISSING',
        'CASE_BALANCE_SNAPSHOT_NOT_JOURNAL_DERIVED',
      ]),
    );
    expect(report.nextImplementationTasks[0]).toContain('ACCT-CUTOVER-3C');
  });


  it('recognizes ExpenseRequest contract and retains live posting blockers', () => {
    const report = buildReport();
    const item = expensePolicyItem(report, 'expenseRequested');

    expect(item).toEqual(
      expect.objectContaining({
        responsePath: 'clientScoped.expenseRequested',
        coverage: 'CONTRACT_EXISTS',
        requiredSources: ['EXPENSE_REQUEST'],
        requiredActions: ['recorded', 'cancel'],
        requiredDimensions: expect.arrayContaining(['tenantId', 'clientId', 'caseId', 'expenseRequestId', 'currency']),
        supportedSources: ['EXPENSE_REQUEST'],
        blockerCodes: expect.arrayContaining([
          'EXPENSE_REQUEST_LIVE_POSTING_MISSING',
          'EXPENSE_REQUEST_BACKFILL_MISSING',
          'EXPENSE_REQUEST_VALUE_SHADOW_MISSING',
          'EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED',
        ]),
        gapCodes: [],
      }),
    );
  });

  it('recognizes ExpensePayment contract and retains reversal/refund blockers', () => {
    const report = buildReport();
    const item = expensePolicyItem(report, 'expensePaid');

    expect(item).toEqual(
      expect.objectContaining({
        responsePath: 'clientScoped.expensePaid',
        coverage: 'CONTRACT_EXISTS',
        requiredSources: ['EXPENSE_PAYMENT'],
        requiredActions: ['recorded'],
        requiredDimensions: expect.arrayContaining(['expenseRequestId', 'expensePaymentId']),
        supportedSources: ['EXPENSE_PAYMENT'],
        blockerCodes: expect.arrayContaining([
          'EXPENSE_PAYMENT_LIVE_POSTING_MISSING',
          'EXPENSE_PAYMENT_BACKFILL_MISSING',
          'EXPENSE_PAYMENT_VALUE_SHADOW_MISSING',
          'EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING',
        ]),
        gapCodes: ['EXPENSE_REQUEST_PAID_TOTAL_PROJECTION_ONLY'],
      }),
    );
  });

  it('recognizes ExpenseApplication apply/reversal contract and retains wiring/backfill blockers', () => {
    const report = buildReport();
    const item = expensePolicyItem(report, 'reimbursementApplication');

    expect(item).toEqual(
      expect.objectContaining({
        responsePath: 'clientScoped.expenseUnpaid.reimbursementApplication',
        coverage: 'CONTRACT_EXISTS',
        requiredSources: ['COLLECTION_DISPOSITION_EXPENSE_APPLICATION'],
        requiredActions: ['apply', 'reversal'],
        requiredDimensions: expect.arrayContaining([
          'expenseRequestId',
          'collectionDispositionId',
          'collectionDispositionLineId',
          'reimbursementScope',
        ]),
        supportedSources: ['COLLECTION_DISPOSITION_EXPENSE_APPLICATION'],
        blockerCodes: expect.arrayContaining([
          'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
          'EXPENSE_REIMBURSEMENT_APPLICATION_BACKFILL_MISSING',
          'EXPENSE_REIMBURSEMENT_APPLICATION_VALUE_SHADOW_MISSING',
        ]),
        gapCodes: [],
      }),
    );
  });

  it('keeps overall expense policy and summary primary readiness blocked', () => {
    const report = buildReport();

    expect(report.expenseCoveragePolicy.status).toBe('BLOCKED');
    expect(report.expenseCoveragePolicy.items.map((item) => item.component)).toEqual([
      'expenseRequested',
      'expensePaid',
      'expenseUnpaid',
      'reimbursementApplication',
    ]);
    expect(report.expenseCoveragePolicy.blockerCodes).toEqual(
      expect.arrayContaining([
        'EXPENSE_REQUEST_LIVE_POSTING_MISSING',
        'EXPENSE_PAYMENT_LIVE_POSTING_MISSING',
        'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
      ]),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });

  it('reports matched journal-derived values for supported summary components', async () => {
    const prisma = buildPrismaMock([
      { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted', amount: '150' },
      { sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', amount: '20' },
      { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', amount: '10' },
      { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal', amount: '5' },
    ]);

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '125', paidToClient: '20', offsetApplied: '5' },
    });

    expect(report.supportedValueSummary).toEqual(
      expect.objectContaining({ status: 'MATCH', matchedCount: 3, mismatchedCount: 0, notComputedCount: 0 }),
    );
    expect(component(report, 'payableNet').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '125', journalValue: '125', delta: '0', status: 'MATCH' }),
    );
    expect(component(report, 'paidToClient').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '20', journalValue: '20', delta: '0', status: 'MATCH' }),
    );
    expect(component(report, 'offsetApplied').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '5', journalValue: '5', delta: '0', status: 'MATCH' }),
    );
    expect(prisma.accountingJournalLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountCode: 'CLIENT_PAYABLE', currency: 'TRY' }),
      }),
    );
  });

  it('keeps primary readiness blocked and reports blocker when supported value mismatches', async () => {
    const prisma = buildPrismaMock([
      { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted', amount: '150' },
      { sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', amount: '20' },
      { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', amount: '10' },
    ]);

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '125', paidToClient: '20', offsetApplied: '10' },
    });

    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
    expect(report.supportedValueSummary).toEqual(
      expect.objectContaining({ status: 'MISMATCH', matchedCount: 2, mismatchedCount: 1 }),
    );
    expect(report.blockerCodes).toEqual(
      expect.arrayContaining(['SUMMARY_SUPPORTED_COMPONENT_VALUE_MISMATCH']),
    );
    expect(component(report, 'payableNet').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '125', journalValue: '120', delta: '-5', status: 'MISMATCH' }),
    );
  });

  it('leaves gap and blocker components value-uncomputed while comparing supported components', async () => {
    const prisma = buildPrismaMock([
      { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted', amount: '100' },
    ]);

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '100', paidToClient: '0', offsetApplied: '0' },
    });

    expect(component(report, 'payableNet').valueComparison).toEqual(
      expect.objectContaining({ journalValue: '100', status: 'MATCH' }),
    );
    expect(component(report, 'expensePaid').valueComparison).toBeUndefined();
    expect(component(report, 'expenseUnpaid').valueComparison).toBeUndefined();
    expect(component(report, 'debtorCollection').valueComparison).toBeUndefined();
    expect(component(report, 'advanceBalance').valueComparison).toBeUndefined();
  });
});