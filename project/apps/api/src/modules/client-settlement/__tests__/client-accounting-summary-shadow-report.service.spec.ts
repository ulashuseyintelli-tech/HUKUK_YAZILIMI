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
    expect(report.nextImplementationTasks[0]).toContain('ACCT-CUTOVER-3C');
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