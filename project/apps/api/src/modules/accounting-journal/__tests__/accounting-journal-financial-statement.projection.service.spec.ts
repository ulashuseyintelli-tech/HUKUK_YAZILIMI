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
    // Varsayılan: müvekkilin dosya bağı çözülemedi → süzgeç yalnız `clientId` dalıyla kurulur.
    caseClient: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
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
    prisma.caseClient.findMany.mockResolvedValue([{ id: 'case-client-1' }]);
    prisma.accountingJournalLine.findMany.mockResolvedValue([]);
    const service = new AccountingJournalFinancialStatementProjectionService(prisma as any);

    await service.getClientCaseStatement(request);

    // Müvekkilin bu dosyadaki CaseClient kaydı kiracı + dosya + müvekkil ile çözülür.
    expect(prisma.caseClient.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.caseClient.findMany).toHaveBeenCalledWith({
      where: {
        caseId: 'case-1',
        clientId: 'client-1',
        id: 'case-client-1',
        client: { tenantId: 'tenant-1' },
      },
      select: { id: true },
    });
    expect(prisma.accountingJournalLine.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        accountCode: 'CLIENT_PAYABLE',
        currency: 'TRY',
        caseId: 'case-1',
        OR: [
          { clientId: 'client-1', caseClientId: 'case-client-1' },
          { clientId: null, caseClientId: { in: ['case-client-1'] } },
        ],
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

  describe('müvekkil kapsamı — `clientId` taşımayan günlük satırları (owner kararı 2026-10-01, S1)', () => {
    it('müvekkilin CaseClient kaydı çözülemezse `clientId`siz satır dalı KURULMAZ; süzgeç yalnız `clientId` dalıdır', async () => {
      const prisma = prismaMock();
      // Yabancı / başka müvekkile ait caseClientId: arama boş döner.
      prisma.caseClient.findMany.mockResolvedValue([]);
      prisma.accountingJournalLine.findMany.mockResolvedValue([]);
      const service = new AccountingJournalFinancialStatementProjectionService(prisma as any);

      await service.getClientCaseStatement(request);

      const where = prisma.accountingJournalLine.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
      expect(where).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-1',
          caseId: 'case-1',
          clientId: 'client-1',
          caseClientId: 'case-client-1',
        }),
      );
    });

    it('istekte caseClientId yoksa CaseClient kaydını dosya + müvekkilden çözer ve `clientId`siz satırları ona bağlar', async () => {
      const prisma = prismaMock();
      prisma.caseClient.findMany.mockResolvedValue([{ id: 'case-client-1' }]);
      prisma.accountingJournalLine.findMany.mockResolvedValue([]);
      const service = new AccountingJournalFinancialStatementProjectionService(prisma as any);

      await service.getClientCaseStatement({ ...request, scope: { ...request.scope, caseClientId: null } });

      expect(prisma.caseClient.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1', clientId: 'client-1', client: { tenantId: 'tenant-1' } },
        select: { id: true },
      });
      const where = prisma.accountingJournalLine.findMany.mock.calls[0][0].where;
      expect(where.clientId).toBeUndefined();
      expect(where.OR).toEqual([
        { clientId: 'client-1' },
        { clientId: null, caseClientId: { in: ['case-client-1'] } },
      ]);
    });

    it('`clientId`siz ödeme satırını kapanışa katar; `clientId` dolu satırın yanıttaki müvekkili değişmez', async () => {
      const prisma = prismaMock();
      prisma.caseClient.findMany.mockResolvedValue([{ id: 'case-client-1' }]);
      prisma.accountingJournalLine.findMany.mockResolvedValue([
        statementLine({ amount: new Prisma.Decimal('1500.00') }),
        statementLine({
          lineNo: 1,
          direction: 'DEBIT',
          amount: new Prisma.Decimal('300.00'),
          clientId: null,
          journalEntry: {
            sourceType: 'CLIENT_PAYOUT',
            sourceAction: 'recorded',
            postedAt: new Date('2026-06-20T08:00:00.000Z'),
          },
        }),
      ]);
      const service = new AccountingJournalFinancialStatementProjectionService(prisma as any);

      const report = await service.getClientCaseStatement(request);

      expect(report.movements.map((movement) => [movement.direction, movement.amount, movement.clientId, movement.source.displayRef])).toEqual([
        ['CREDIT', '1500.00', 'client-1', 'COLLECTION_DISPOSITION_LINE:posted'],
        ['DEBIT', '300.00', 'client-1', 'CLIENT_PAYOUT:recorded'],
      ]);
      expect(report.closing).toEqual({ amount: '1200.00', currency: 'TRY' });
    });
  });

  it('projects CLIENT_CASE_STATEMENT as a reporting statement surface, not Trial Balance diagnostics', async () => {
    const prisma = prismaMock();
    prisma.accountingJournalLine.findMany.mockResolvedValue([
      statementLine(),
      // Gerçek ödeme yazıcısının ürettiği biçim: `clientId` YOK, `caseClientId` VAR (client-payout.service.ts).
      statementLine({
        lineNo: 2,
        direction: 'DEBIT',
        amount: new Prisma.Decimal('50.00'),
        clientId: null,
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
          // `clientId`'siz satır müvekkilin CaseClient kaydı üzerinden kapsama girer → yanıtta istekteki müvekkil yazılır.
          clientId: 'client-1',
          caseClientId: 'case-client-1',
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

    // CaseClient yalnız OKUNUR (müvekkil kapsamının çözülmesi); yazılmaz.
    expect(prisma.caseClient.create).not.toHaveBeenCalled();
    expect(prisma.caseClient.update).not.toHaveBeenCalled();
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
    expect(prisma.caseClient.findMany).not.toHaveBeenCalled();
  });
});
