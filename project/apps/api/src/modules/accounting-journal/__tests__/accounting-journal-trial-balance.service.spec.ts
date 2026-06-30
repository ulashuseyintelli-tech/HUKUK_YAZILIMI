import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountingJournalTrialBalanceService } from '../accounting-journal-trial-balance.service';

function prismaMock() {
  return {
    accountingJournalLine: {
      groupBy: jest.fn(),
    },
    accountingJournalEntry: {
      findMany: jest.fn(),
    },
  } as any;
}

function accountGroup(overrides: Partial<{
  accountCode: string;
  direction: string;
  amount: string;
  currency: string;
  count: number;
}> = {}) {
  return {
    accountCode: overrides.accountCode ?? 'CLIENT_PAYABLE',
    direction: overrides.direction ?? 'DEBIT',
    currency: overrides.currency ?? 'TRY',
    _sum: { amount: new Prisma.Decimal(overrides.amount ?? '100.00') },
    _count: { _all: overrides.count ?? 1 },
  };
}

function sourceGroup(overrides: Partial<{
  journalEntryId: string;
  direction: string;
  amount: string;
  currency: string;
  count: number;
}> = {}) {
  return {
    journalEntryId: overrides.journalEntryId ?? 'journal-1',
    direction: overrides.direction ?? 'DEBIT',
    currency: overrides.currency ?? 'TRY',
    _sum: { amount: new Prisma.Decimal(overrides.amount ?? '100.00') },
    _count: { _all: overrides.count ?? 1 },
  };
}

function sourceEntry(overrides: Partial<{
  id: string;
  sourceType: string;
  sourceAction: string;
}> = {}) {
  return {
    id: overrides.id ?? 'journal-1',
    sourceType: overrides.sourceType ?? 'CLIENT_OFFSET',
    sourceAction: overrides.sourceAction ?? 'apply',
  };
}

describe('AccountingJournalTrialBalanceService', () => {
  it('tenant rule: aggregate queries are scoped by line tenantId and joined entry tenantId', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.groupBy.mockResolvedValue([]);
    const service = new AccountingJournalTrialBalanceService(prisma);

    await service.getTrialBalance({
      tenantId: 'tenant-1',
      currency: 'TRY',
      caseId: 'case-1',
      accountCode: 'CLIENT_PAYABLE',
      sourceType: 'CLIENT_OFFSET',
      sourceAction: 'apply',
      postedFrom: '2026-06-01T00:00:00.000Z',
      postedTo: '2026-06-30T23:59:59.999Z',
    });

    expect(prisma.accountingJournalLine.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        by: ['accountCode', 'currency', 'direction'],
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          currency: 'TRY',
          caseId: 'case-1',
          accountCode: 'CLIENT_PAYABLE',
          journalEntry: expect.objectContaining({
            tenantId: 'tenant-1',
            sourceType: 'CLIENT_OFFSET',
            sourceAction: 'apply',
            postedAt: {
              gte: new Date('2026-06-01T00:00:00.000Z'),
              lte: new Date('2026-06-30T23:59:59.999Z'),
            },
          }),
        }),
        _sum: { amount: true },
        _count: { _all: true },
      }),
    );
    expect(prisma.accountingJournalLine.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        by: ['journalEntryId', 'currency', 'direction'],
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          journalEntry: expect.objectContaining({ tenantId: 'tenant-1' }),
        }),
      }),
    );
    expect(prisma.accountingJournalEntry.findMany).not.toHaveBeenCalled();
  });

  it('trial balance rule: DB aggregates persisted journal lines by accountCode and currency', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.groupBy
      .mockResolvedValueOnce([
        accountGroup({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '100.00', count: 2 }),
        accountGroup({ accountCode: 'CASH_CLEARING', direction: 'CREDIT', amount: '100.00', count: 1 }),
      ])
      .mockResolvedValueOnce([
        sourceGroup({ journalEntryId: 'journal-1', direction: 'DEBIT', amount: '100.00', count: 2 }),
        sourceGroup({ journalEntryId: 'journal-1', direction: 'CREDIT', amount: '100.00', count: 1 }),
      ]);
    prisma.accountingJournalEntry.findMany.mockResolvedValue([sourceEntry({ id: 'journal-1' })]);
    const service = new AccountingJournalTrialBalanceService(prisma);

    const report = await service.getTrialBalance({ tenantId: 'tenant-1', currency: 'TRY' });

    expect(report.rows).toEqual([
      expect.objectContaining({ accountCode: 'CASH_CLEARING', currency: 'TRY', debit: '0.00', credit: '100.00', netCredit: '100.00', lineCount: 1 }),
      expect.objectContaining({ accountCode: 'CLIENT_PAYABLE', currency: 'TRY', debit: '100.00', credit: '0.00', netDebit: '100.00', lineCount: 2 }),
    ]);
    expect(report.totals).toEqual([
      expect.objectContaining({ currency: 'TRY', debit: '100.00', credit: '100.00', balanced: true, lineCount: 3 }),
    ]);
    expect(report.diagnostics).toEqual(
      expect.objectContaining({
        balanced: true,
        dimensionScoped: false,
        dateBasis: 'postedAt',
        generatedAt: expect.any(String),
        lineCount: 3,
        entryCount: 1,
        currencyCount: 1,
        evidenceStatus: 'BALANCED',
        unbalancedCurrencies: [],
        warningCodes: [],
        missingEffectiveDateColumn: true,
        missingSourceVersionColumn: true,
      }),
    );
    expect(report.reconciliation).toEqual(
      expect.objectContaining({
        evidenceSource: 'PERSISTED_ACCOUNTING_JOURNAL',
        aggregateBasis: 'DB_AGGREGATE',
        tenantScoped: true,
        dateBasis: 'postedAt',
        amountBasis: 'AccountingJournalLine.amount',
        directionBasis: 'AccountingJournalLine.direction',
        entryJoinBasis: 'AccountingJournalLine.journalEntryId -> AccountingJournalEntry.id',
        balanced: true,
        evidenceStatus: 'BALANCED',
        lineCount: 3,
        entryCount: 1,
        currencyCount: 1,
        sourceCount: 1,
        sourceCoverage: [
          expect.objectContaining({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', entryCount: 1, lineCount: 3, currencyCount: 1, currencies: ['TRY'], balanced: true }),
        ],
        warnings: [],
      }),
    );
  });

  it('source breakdown rule: aggregates by journalEntryId first and reads only entry source metadata', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.groupBy
      .mockResolvedValueOnce([
        accountGroup({ direction: 'DEBIT', amount: '45.00', count: 2 }),
        accountGroup({ accountCode: 'CASH_CLEARING', direction: 'CREDIT', amount: '45.00', count: 2 }),
      ])
      .mockResolvedValueOnce([
        sourceGroup({ journalEntryId: 'journal-offset', direction: 'DEBIT', amount: '30.00', count: 1 }),
        sourceGroup({ journalEntryId: 'journal-offset', direction: 'CREDIT', amount: '30.00', count: 1 }),
        sourceGroup({ journalEntryId: 'journal-payout', direction: 'DEBIT', amount: '15.00', count: 1 }),
        sourceGroup({ journalEntryId: 'journal-payout', direction: 'CREDIT', amount: '15.00', count: 1 }),
      ]);
    prisma.accountingJournalEntry.findMany.mockResolvedValue([
      sourceEntry({ id: 'journal-offset', sourceType: 'CLIENT_OFFSET', sourceAction: 'apply' }),
      sourceEntry({ id: 'journal-payout', sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded' }),
    ]);
    const service = new AccountingJournalTrialBalanceService(prisma);

    const report = await service.getTrialBalance({ tenantId: 'tenant-1' });

    expect(prisma.accountingJournalEntry.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', id: { in: ['journal-offset', 'journal-payout'] } },
      select: { id: true, sourceType: true, sourceAction: true },
    });
    expect(report.sourceBreakdown).toEqual([
      expect.objectContaining({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', currency: 'TRY', debit: '30.00', credit: '30.00', balanced: true, lineCount: 2 }),
      expect.objectContaining({ sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', currency: 'TRY', debit: '15.00', credit: '15.00', balanced: true, lineCount: 2 }),
    ]);
    expect(report.reconciliation?.sourceCoverage).toEqual([
      expect.objectContaining({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', entryCount: 1, lineCount: 2, currencies: ['TRY'], balanced: true }),
      expect.objectContaining({ sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', entryCount: 1, lineCount: 2, currencies: ['TRY'], balanced: true }),
    ]);
  });

  it('dimension rule: case-filtered cross-case lines can be imbalanced and are diagnosed as dimension-scoped', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.groupBy
      .mockResolvedValueOnce([
        accountGroup({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '30.00', count: 1 }),
      ])
      .mockResolvedValueOnce([
        sourceGroup({ journalEntryId: 'journal-1', direction: 'DEBIT', amount: '30.00', count: 1 }),
      ]);
    prisma.accountingJournalEntry.findMany.mockResolvedValue([sourceEntry({ id: 'journal-1' })]);
    const service = new AccountingJournalTrialBalanceService(prisma);

    const report = await service.getTrialBalance({ tenantId: 'tenant-1', caseId: 'case-payable', currency: 'TRY' });

    expect(report.totals).toEqual([
      expect.objectContaining({ currency: 'TRY', debit: '30.00', credit: '0.00', balanced: false }),
    ]);
    expect(report.diagnostics).toEqual(
      expect.objectContaining({
        balanced: false,
        dimensionScoped: true,
        partialEntryScope: true,
        lineCount: 1,
        entryCount: 1,
        evidenceStatus: 'DIMENSION_SCOPED',
        unbalancedCurrencies: [{ currency: 'TRY', debit: '30.00', credit: '0.00', difference: '30.00' }],
        warningCodes: ['DIMENSION_SCOPED_IMBALANCE'],
      }),
    );
    expect(report.reconciliation).toEqual(
      expect.objectContaining({
        evidenceStatus: 'DIMENSION_SCOPED',
        sourceCoverage: [expect.objectContaining({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', balanced: false })],
        warnings: expect.arrayContaining([expect.objectContaining({ code: 'DIMENSION_SCOPED_EVIDENCE' }), expect.objectContaining({ code: 'SOURCE_BREAKDOWN_IMBALANCE' })]),
      }),
    );
  });

  it('empty result rule: reports no journal lines without pretending to be balanced evidence', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.groupBy.mockResolvedValue([]);
    const service = new AccountingJournalTrialBalanceService(prisma);

    const report = await service.getTrialBalance({ tenantId: 'tenant-1', currency: 'TRY' });

    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual([]);
    expect(report.sourceBreakdown).toEqual([]);
    expect(report.diagnostics).toEqual(
      expect.objectContaining({
        balanced: true,
        lineCount: 0,
        entryCount: 0,
        currencyCount: 0,
        evidenceStatus: 'NO_LINES',
        warningCodes: ['NO_JOURNAL_LINES'],
      }),
    );
    expect(report.reconciliation).toEqual(
      expect.objectContaining({
        evidenceStatus: 'NO_LINES',
        lineCount: 0,
        entryCount: 0,
        sourceCount: 0,
        warnings: [expect.objectContaining({ code: 'NO_JOURNAL_LINES' })],
      }),
    );
    expect(prisma.accountingJournalEntry.findMany).not.toHaveBeenCalled();
  });

  it('reconciliation rule: missing source metadata is surfaced without changing trial balance totals', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.groupBy
      .mockResolvedValueOnce([
        accountGroup({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '10.00', count: 1 }),
        accountGroup({ accountCode: 'CASH_CLEARING', direction: 'CREDIT', amount: '10.00', count: 1 }),
      ])
      .mockResolvedValueOnce([
        sourceGroup({ journalEntryId: 'journal-missing', direction: 'DEBIT', amount: '10.00', count: 1 }),
        sourceGroup({ journalEntryId: 'journal-missing', direction: 'CREDIT', amount: '10.00', count: 1 }),
      ]);
    prisma.accountingJournalEntry.findMany.mockResolvedValue([]);
    const service = new AccountingJournalTrialBalanceService(prisma);

    const report = await service.getTrialBalance({ tenantId: 'tenant-1' });

    expect(report.totals).toEqual([
      expect.objectContaining({ currency: 'TRY', debit: '10.00', credit: '10.00', balanced: true, lineCount: 2 }),
    ]);
    expect(report.sourceBreakdown).toEqual([]);
    expect(report.reconciliation).toEqual(
      expect.objectContaining({
        balanced: true,
        evidenceStatus: 'BALANCED',
        lineCount: 2,
        entryCount: 1,
        sourceCount: 0,
        sourceCoverage: [],
        warnings: [expect.objectContaining({ code: 'MISSING_SOURCE_METADATA' })],
      }),
    );
  });

  it('validation rule: invalid posted date filters are rejected before DB aggregation', async () => {
    const prisma = prismaMock();
    const service = new AccountingJournalTrialBalanceService(prisma);

    await expect(
      service.getTrialBalance({ tenantId: 'tenant-1', postedFrom: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingJournalLine.groupBy).not.toHaveBeenCalled();
  });

  it('imbalance rule: unscoped multi-currency imbalance is explicit evidence', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.groupBy
      .mockResolvedValueOnce([
        accountGroup({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '100.00', currency: 'TRY', count: 1 }),
        accountGroup({ accountCode: 'CASH_CLEARING', direction: 'CREDIT', amount: '100.00', currency: 'TRY', count: 1 }),
        accountGroup({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '20.00', currency: 'USD', count: 1 }),
      ])
      .mockResolvedValueOnce([
        sourceGroup({ journalEntryId: 'journal-try', direction: 'DEBIT', amount: '100.00', currency: 'TRY', count: 1 }),
        sourceGroup({ journalEntryId: 'journal-try', direction: 'CREDIT', amount: '100.00', currency: 'TRY', count: 1 }),
        sourceGroup({ journalEntryId: 'journal-usd', direction: 'DEBIT', amount: '20.00', currency: 'USD', count: 1 }),
      ]);
    prisma.accountingJournalEntry.findMany.mockResolvedValue([
      sourceEntry({ id: 'journal-try' }),
      sourceEntry({ id: 'journal-usd' }),
    ]);
    const service = new AccountingJournalTrialBalanceService(prisma);

    const report = await service.getTrialBalance({ tenantId: 'tenant-1' });

    expect(report.totals).toEqual([
      expect.objectContaining({ currency: 'TRY', debit: '100.00', credit: '100.00', balanced: true }),
      expect.objectContaining({ currency: 'USD', debit: '20.00', credit: '0.00', balanced: false }),
    ]);
    expect(report.diagnostics).toEqual(
      expect.objectContaining({
        balanced: false,
        dimensionScoped: false,
        lineCount: 3,
        entryCount: 2,
        currencyCount: 2,
        evidenceStatus: 'IMBALANCED',
        unbalancedCurrencies: [{ currency: 'USD', debit: '20.00', credit: '0.00', difference: '20.00' }],
        warningCodes: ['TRIAL_BALANCE_IMBALANCE'],
      }),
    );
    expect(report.reconciliation).toEqual(
      expect.objectContaining({
        evidenceStatus: 'IMBALANCED',
        sourceCoverage: [expect.objectContaining({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', currencyCount: 2, currencies: ['TRY', 'USD'], balanced: false })],
        warnings: expect.arrayContaining([expect.objectContaining({ code: 'TRIAL_BALANCE_IMBALANCE' }), expect.objectContaining({ code: 'SOURCE_BREAKDOWN_IMBALANCE' })]),
      }),
    );
  });
});
