import { Prisma } from '@prisma/client';
import { AccountingJournalTrialBalanceService } from '../accounting-journal-trial-balance.service';

function prismaMock() {
  return {
    accountingJournalLine: {
      findMany: jest.fn(),
    },
  } as any;
}

function line(overrides: Partial<{
  accountCode: string;
  direction: string;
  amount: string;
  currency: string;
  tenantId: string;
  caseId: string | null;
  sourceType: string;
  sourceAction: string;
  entryType: string;
}> = {}) {
  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    accountCode: overrides.accountCode ?? 'CLIENT_PAYABLE',
    direction: overrides.direction ?? 'DEBIT',
    amount: new Prisma.Decimal(overrides.amount ?? '100.00'),
    currency: overrides.currency ?? 'TRY',
    caseId: overrides.caseId ?? 'case-1',
    journalEntry: {
      tenantId: overrides.tenantId ?? 'tenant-1',
      sourceType: overrides.sourceType ?? 'CLIENT_OFFSET',
      sourceAction: overrides.sourceAction ?? 'apply',
      entryType: overrides.entryType ?? 'CLIENT_OFFSET_APPLIED',
    },
  };
}

describe('AccountingJournalTrialBalanceService', () => {
  it('tenant rule: persisted journal line query is scoped by line tenantId and joined entry tenantId', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([]);
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

    expect(prisma.accountingJournalLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
    );
  });

  it('trial balance rule: aggregates persisted journal lines by accountCode and currency', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([
      line({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '40.00' }),
      line({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '60.00' }),
      line({ accountCode: 'CASH_CLEARING', direction: 'CREDIT', amount: '100.00' }),
    ]);
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
        missingEffectiveDateColumn: true,
        missingSourceVersionColumn: true,
      }),
    );
  });

  it('source breakdown rule: groups debit and credit totals by sourceType/sourceAction/currency', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([
      line({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', direction: 'DEBIT', amount: '30.00' }),
      line({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', direction: 'CREDIT', amount: '30.00' }),
      line({ sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', direction: 'DEBIT', amount: '15.00' }),
      line({ sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', direction: 'CREDIT', amount: '15.00' }),
    ]);
    const service = new AccountingJournalTrialBalanceService(prisma);

    const report = await service.getTrialBalance({ tenantId: 'tenant-1' });

    expect(report.sourceBreakdown).toEqual([
      expect.objectContaining({ sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', currency: 'TRY', debit: '30.00', credit: '30.00', balanced: true }),
      expect.objectContaining({ sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', currency: 'TRY', debit: '15.00', credit: '15.00', balanced: true }),
    ]);
  });

  it('dimension rule: case-filtered cross-case lines can be imbalanced and are diagnosed as dimension-scoped', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([
      line({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '30.00', caseId: 'case-payable' }),
    ]);
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
        warningCodes: ['DIMENSION_SCOPED_IMBALANCE'],
      }),
    );
  });

  it('empty result rule: reports no journal lines without pretending to be balanced evidence', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([]);
    const service = new AccountingJournalTrialBalanceService(prisma);

    const report = await service.getTrialBalance({ tenantId: 'tenant-1', currency: 'TRY' });

    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual([]);
    expect(report.diagnostics).toEqual(
      expect.objectContaining({
        balanced: true,
        warningCodes: ['NO_JOURNAL_LINES'],
      }),
    );
  });
});
