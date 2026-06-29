import { Prisma } from '@prisma/client';
import {
  AccountingLedgerDryRunService,
  accountingDryRunIdempotencyKey,
  buildAccountingLedgerDryRunReport,
} from '../accounting-ledger-dry-run.service';

const D = (n: number) => new Prisma.Decimal(n);
const POSTED_AT = new Date('2026-06-29T10:00:00.000Z');

function dispositionLine(overrides: any = {}) {
  return {
    id: overrides.id ?? 'dl-1',
    type: overrides.type ?? 'CLIENT_PAYABLE',
    amount: overrides.amount ?? D(100),
    caseClientId: overrides.caseClientId ?? 'cc-A',
    disposition: {
      id: overrides.dispositionId ?? 'disp-1',
      caseId: overrides.caseId ?? 'case-1',
      collectionId: overrides.collectionId ?? 'col-1',
      currency: overrides.currency ?? 'TRY',
      postedAt: overrides.postedAt ?? POSTED_AT,
      manualReversalRequiredAt: overrides.manualReversalRequiredAt ?? null,
    },
  };
}

function payout(overrides: any = {}) {
  return {
    id: overrides.id ?? 'pay-1',
    caseId: overrides.caseId ?? 'case-1',
    caseClientId: overrides.caseClientId ?? 'cc-A',
    amount: overrides.amount ?? D(40),
    currency: overrides.currency ?? 'TRY',
    paidAt: overrides.paidAt ?? new Date('2026-06-29T11:00:00.000Z'),
  };
}

function offset(overrides: any = {}) {
  return {
    id: overrides.id ?? 'off-1',
    clientId: overrides.clientId ?? 'client-1',
    amount: overrides.amount ?? D(10),
    currency: overrides.currency ?? 'TRY',
    kind: overrides.kind ?? 'APPLY',
    payableCaseId: overrides.payableCaseId ?? 'case-1',
    payableCaseClientId: overrides.payableCaseClientId ?? 'cc-A',
    expenseCaseId: overrides.expenseCaseId ?? 'case-1',
  };
}

function balanceLedger(overrides: any = {}) {
  return {
    id: overrides.id ?? 'bl-1',
    amount: overrides.amount ?? D(25),
    currency: overrides.currency ?? 'TRY',
    type: overrides.type ?? 'CREDIT',
    source: overrides.source ?? null,
    sourceId: overrides.sourceId ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-06-29T12:00:00.000Z'),
    caseBalance: { caseId: overrides.caseId ?? 'case-1' },
  };
}

describe('AccountingLedgerDryRunService', () => {
  it('yalniz izin verilen source tablolarindan okur ve DB write yapmaz', async () => {
    const forbiddenRead = jest.fn();
    const prisma: any = {
      collectionDispositionLine: { findMany: jest.fn().mockResolvedValue([dispositionLine()]) },
      clientPayout: { findMany: jest.fn().mockResolvedValue([]) },
      clientOffset: { findMany: jest.fn().mockResolvedValue([]) },
      balanceLedger: { findMany: jest.fn().mockResolvedValue([]) },
      collection: { findMany: forbiddenRead },
      ledgerEntry: { findMany: forbiddenRead },
      ledgerAllocation: { findMany: forbiddenRead },
      clientStatementLine: { findMany: forbiddenRead },
    };

    const report = await new AccountingLedgerDryRunService(prisma).buildReport('tenant-1', {
      caseId: 'case-1',
      currency: 'TRY',
    });

    expect(prisma.collectionDispositionLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          disposition: expect.objectContaining({ tenantId: 'tenant-1', status: 'POSTED', caseId: 'case-1', currency: 'TRY' }),
        }),
      }),
    );
    expect(prisma.clientPayout.findMany).toHaveBeenCalled();
    expect(prisma.clientOffset.findMany).toHaveBeenCalled();
    expect(prisma.balanceLedger.findMany).toHaveBeenCalled();
    expect(forbiddenRead).not.toHaveBeenCalled();
    expect(report.entries).toHaveLength(1);
    expect(report.clientStatementComparison.compared).toBe(false);
  });
});

describe('buildAccountingLedgerDryRunReport', () => {
  it('deterministik idempotency key uretir ve duplicate riskini raporlar', () => {
    expect(accountingDryRunIdempotencyKey('CLIENT_PAYOUT', 'pay-1', 'recorded')).toBe('client_payout:pay-1:recorded');

    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [],
      clientPayouts: [payout({ id: 'pay-1' }), payout({ id: 'pay-1' })],
      clientOffsets: [],
      balanceLedgerRows: [],
    });

    expect(report.duplicateIdempotencyKeys).toEqual(['client_payout:pay-1:recorded']);
  });

  it('expected journal projection icin debit/credit dengesi ve outstanding farkini raporlar', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [dispositionLine({ amount: D(100) })],
      clientPayouts: [payout({ amount: D(40) })],
      clientOffsets: [offset({ amount: D(10), kind: 'APPLY' })],
      balanceLedgerRows: [balanceLedger({ amount: D(25) })],
    });

    expect(report.entries).toHaveLength(4);
    expect(report.debitCreditBalance).toEqual({ balanced: true, unbalancedIdempotencyKeys: [] });
    expect(report.totalsByTenantCaseCurrency).toEqual([
      expect.objectContaining({ tenantId: 'tenant-1', caseId: 'case-1', currency: 'TRY', debit: '175', credit: '175', balanced: true }),
    ]);
    expect(report.outstandingComparison).toEqual([
      {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        caseClientId: 'cc-A',
        currency: 'TRY',
        clientAccountingOutstanding: '50',
        expectedAccountingProjection: '50',
        difference: '0',
      },
    ]);
  });

  it('OTHER bucket satirlarini suspense/manual review listesine alir ve journal entry uretmez', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [dispositionLine({ id: 'dl-other', type: 'OTHER', amount: D(15) })],
      clientPayouts: [],
      clientOffsets: [],
      balanceLedgerRows: [],
    });

    expect(report.entries).toHaveLength(0);
    expect(report.suspenseItems).toEqual([
      expect.objectContaining({ dispositionLineId: 'dl-other', amount: '15', reason: 'OTHER_BUCKET' }),
    ]);
    expect(report.sourceCoverage).toEqual({ totalSourceRows: 1, projectedSourceRows: 0, reportedOnlySourceRows: 1, coverageRatio: '1' });
  });

  it('manualReversalRequiredAt marker tasiyan disposition satirlarini exclude eder ve raporlar', () => {
    const markerAt = new Date('2026-06-29T13:00:00.000Z');
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [dispositionLine({ id: 'dl-reversal', manualReversalRequiredAt: markerAt })],
      clientPayouts: [],
      clientOffsets: [],
      balanceLedgerRows: [],
    });

    expect(report.entries).toHaveLength(0);
    expect(report.manualReversalDispositionLines).toEqual([
      expect.objectContaining({
        dispositionLineId: 'dl-reversal',
        manualReversalRequiredAt: markerAt.toISOString(),
      }),
    ]);
  });

  it('OFFSET_CLIENT_ADVANCE ile korelasyonlu BalanceLedger icin double-count adayini raporlar', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [dispositionLine({ id: 'dl-offset', type: 'OFFSET_CLIENT_ADVANCE', amount: D(30), caseClientId: null })],
      clientPayouts: [],
      clientOffsets: [],
      balanceLedgerRows: [balanceLedger({ id: 'bl-offset', amount: D(30), source: 'disposition_line:dl-offset' })],
    });

    expect(report.entries).toHaveLength(1);
    expect(report.offsetDoubleCountCandidates).toEqual([
      {
        dispositionLineId: 'dl-offset',
        balanceLedgerId: 'bl-offset',
        caseId: 'case-1',
        currency: 'TRY',
        dispositionAmount: '30',
        balanceLedgerAmount: '30',
        reason: 'OFFSET_CLIENT_ADVANCE_BALANCE_LEDGER_MATCH',
      },
    ]);
  });
});
