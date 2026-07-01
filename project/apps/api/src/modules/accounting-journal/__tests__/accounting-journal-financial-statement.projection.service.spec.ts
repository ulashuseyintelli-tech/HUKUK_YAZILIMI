import { Prisma } from '@prisma/client';
import { AccountingJournalFinancialStatementProjectionService } from '../accounting-journal-financial-statement.projection.service';
import type { FinancialStatementReadRequest } from '../accounting-journal-financial-statement.types';

const request: FinancialStatementReadRequest = {
  tenantId: 'tenant-1',
  statementType: 'CLIENT_CASE_STATEMENT',
  period: {
    from: '2026-06-01T00:00:00.000Z',
    to: '2026-06-30T23:59:59.999Z',
    dateBasis: 'postedAt',
  },
  currency: 'TRY',
  scope: {
    caseId: 'case-1',
    clientId: 'client-1',
    caseClientId: 'case-client-1',
  },
};

function prismaMock() {
  return {
    accountingJournalLine: {
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    accountingJournalEntry: {
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    ledgerEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    ledgerAllocation: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    tbk100Allocation: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
}

function statementLine(overrides: Record<string, unknown> = {}) {
  return {
    lineNo: 1,
    accountCode: 'CLIENT_PAYABLE',
    direction: 'CREDIT',
    amount: new Prisma.Decimal('150.00'),
    currency: 'TRY',
    caseId: 'case-1',
    clientId: 'client-1',
    caseClientId: 'case-client-1',
    journalEntry: {
      sourceType: 'COLLECTION_DISPOSITION_LINE',
      sourceAction: 'posted',
      postedAt: new Date('2026-06-15T10:30:00.000Z'),
    },
    ...overrides,
  };
}

describe('ACCT-5B Financial Statement projection service', () => {
  it('reads only persisted journal lines within tenant, period, currency, and client-case scope', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([]);
    const service = new AccountingJournalFinancialStatementProjectionService(prisma as any);

    await service.getClientCaseStatement(request);

    expect(prisma.accountingJournalLine.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        accountCode: 'CLIENT_PAYABLE',
        currency: 'TRY',
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: 'case-client-1',
        journalEntry: {
          tenantId: 'tenant-1',
          postedAt: {
            gte: new Date('2026-06-01T00:00:00.000Z'),
            lte: new Date('2026-06-30T23:59:59.999Z'),
          },
        },
      },
      select: {
        lineNo: true,
        accountCode: true,
        direction: true,
        amount: true,
        currency: true,
        caseId: true,
        clientId: true,
        caseClientId: true,
        journalEntry: {
          select: {
            sourceType: true,
            sourceAction: true,
            postedAt: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { postedAt: 'asc' } },
        { journalEntryId: 'asc' },
        { lineNo: 'asc' },
      ],
    });
  });

  it('projects CLIENT_CASE_STATEMENT as a reporting statement surface, not Trial Balance diagnostics', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([
      statementLine(),
      statementLine({
        lineNo: 2,
        direction: 'DEBIT',
        amount: new Prisma.Decimal('50.00'),
        journalEntry: {
          sourceType: 'CLIENT_PAYOUT',
          sourceAction: 'recorded',
          postedAt: new Date('2026-06-20T08:00:00.000Z'),
        },
      }),
    ]);
    const service = new AccountingJournalFinancialStatementProjectionService(prisma as any);

    const report = await service.getClientCaseStatement(request);

    expect(report).toEqual({
      tenantId: 'tenant-1',
      statementType: 'CLIENT_CASE_STATEMENT',
      surface: 'FINANCIAL_STATEMENT',
      sourceBasis: 'JOURNAL_DERIVED_PROJECTION',
      period: request.period,
      currency: 'TRY',
      scope: request.scope,
      opening: { amount: '0.00', currency: 'TRY' },
      movements: [
        expect.objectContaining({
          lineNo: 1,
          statementDate: '2026-06-15T10:30:00.000Z',
          accountCode: 'CLIENT_PAYABLE',
          direction: 'CREDIT',
          amount: '150.00',
          currency: 'TRY',
          caseId: 'case-1',
          clientId: 'client-1',
          caseClientId: 'case-client-1',
          source: {
            sourceType: 'COLLECTION_DISPOSITION_LINE',
            sourceAction: 'posted',
            displayRef: 'COLLECTION_DISPOSITION_LINE:posted',
          },
          note: 'Journal-derived client payable movement',
        }),
        expect.objectContaining({
          lineNo: 2,
          statementDate: '2026-06-20T08:00:00.000Z',
          direction: 'DEBIT',
          amount: '50.00',
          source: {
            sourceType: 'CLIENT_PAYOUT',
            sourceAction: 'recorded',
            displayRef: 'CLIENT_PAYOUT:recorded',
          },
        }),
      ],
      closing: { amount: '100.00', currency: 'TRY' },
      reconciliation: {
        status: 'READY',
        trialBalanceEvidenceStatus: 'BALANCED',
        legalLedgerComparisonStatus: 'PENDING',
        warnings: [
          expect.objectContaining({ code: 'DIMENSION_SCOPED_EVIDENCE' }),
          expect.objectContaining({ code: 'NO_FX_CONVERSION' }),
          expect.objectContaining({ code: 'LEGAL_LEDGER_COMPARISON_NOT_AUTHORITATIVE' }),
        ],
      },
    });
    expect((report as Record<string, unknown>).rows).toBeUndefined();
    expect((report as Record<string, unknown>).totals).toBeUndefined();
    expect((report as Record<string, unknown>).diagnostics).toBeUndefined();
    expect((report as Record<string, unknown>).sourceBreakdown).toBeUndefined();
  });

  it('keeps currency explicit and does not perform silent FX conversion', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([statementLine()]);
    const service = new AccountingJournalFinancialStatementProjectionService(prisma as any);

    const report = await service.getClientCaseStatement(request);

    expect(report.currency).toBe('TRY');
    expect(report.opening.currency).toBe('TRY');
    expect(report.closing.currency).toBe('TRY');
    expect(report.movements.every((movement) => movement.currency === 'TRY')).toBe(true);
    expect(report.reconciliation.warnings).toEqual([
      expect.objectContaining({ code: 'DIMENSION_SCOPED_EVIDENCE' }),
      expect.objectContaining({ code: 'NO_FX_CONVERSION' }),
      expect.objectContaining({ code: 'LEGAL_LEDGER_COMPARISON_NOT_AUTHORITATIVE' }),
    ]);
    expect((report as Record<string, unknown>).reportingCurrency).toBeUndefined();
    expect((report as Record<string, unknown>).fxRate).toBeUndefined();
  });

  it('does not call posting, writer, legal ledger, or TBK100 paths', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([statementLine()]);
    const service = new AccountingJournalFinancialStatementProjectionService(prisma as any);

    await service.getClientCaseStatement(request);

    expect(prisma.accountingJournalLine.create).not.toHaveBeenCalled();
    expect(prisma.accountingJournalLine.createMany).not.toHaveBeenCalled();
    expect(prisma.accountingJournalLine.update).not.toHaveBeenCalled();
    expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
    expect(prisma.accountingJournalEntry.createMany).not.toHaveBeenCalled();
    expect(prisma.accountingJournalEntry.update).not.toHaveBeenCalled();
    expect(prisma.accountingJournalEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(prisma.ledgerAllocation.findMany).not.toHaveBeenCalled();
    expect(prisma.ledgerAllocation.create).not.toHaveBeenCalled();
    expect(prisma.tbk100Allocation.findMany).not.toHaveBeenCalled();
    expect(prisma.tbk100Allocation.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported statement type and non-postedAt date basis before DB read', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([]);
    const service = new AccountingJournalFinancialStatementProjectionService(prisma as any);

    await expect(
      service.getClientCaseStatement({ ...request, statementType: 'TRIAL_BALANCE' as any }),
    ).rejects.toThrow('Financial statement type is not supported.');
    await expect(
      service.getClientCaseStatement({
        ...request,
        period: { ...request.period, dateBasis: 'sourceOccurredAt' as any },
      }),
    ).rejects.toThrow('Financial statement period must use postedAt date basis.');
    expect(prisma.accountingJournalLine.findMany).not.toHaveBeenCalled();
  });
});
