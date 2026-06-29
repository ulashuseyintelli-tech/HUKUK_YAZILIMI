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
    tenantId: overrides.tenantId ?? 'tenant-1',
    amount: overrides.amount ?? D(25),
    currency: overrides.currency ?? 'TRY',
    type: overrides.type ?? 'CREDIT',
    source: overrides.source ?? null,
    sourceId: overrides.sourceId ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-06-29T12:00:00.000Z'),
    caseBalance: { caseId: overrides.caseId ?? 'case-1' },
  };
}

function offsetJournalEntry(report: ReturnType<typeof buildAccountingLedgerDryRunReport>, offsetId: string) {
  const entry = report.entries.find((row) => row.sourceType === 'CLIENT_OFFSET' && row.sourceId === offsetId);
  expect(entry).toBeDefined();
  return entry!;
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
    expect(prisma.balanceLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ tenantId: true, source: true, sourceId: true }),
      }),
    );
    expect(prisma.clientPayout.findMany).toHaveBeenCalled();
    expect(prisma.clientOffset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          currency: 'TRY',
          OR: [{ payableCaseId: 'case-1' }, { expenseCaseId: 'case-1' }],
        }),
      }),
    );
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
    expect(report.mismatchWarnings).toEqual([
      expect.objectContaining({
        reason: 'DUPLICATE_SOURCE',
        sourceType: 'CLIENT_PAYOUT',
        sourceId: 'client_payout:pay-1:recorded',
      }),
    ]);
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

  it('CLIENT_OFFSET APPLY same-case accounting rule: payable DEBIT keeps caseClientId, expense CREDIT has null caseClientId', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [],
      clientPayouts: [],
      clientOffsets: [offset({ id: 'off-apply-same', amount: D(20), kind: 'APPLY', payableCaseId: 'case-1', expenseCaseId: 'case-1', payableCaseClientId: 'cc-payable' })],
      balanceLedgerRows: [],
    });

    const entry = offsetJournalEntry(report, 'off-apply-same');
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '20', caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-payable', offsetId: 'off-apply-same' }),
      expect.objectContaining({ accountCode: 'CLIENT_EXPENSE_RECEIVABLE', direction: 'CREDIT', amount: '20', caseId: 'case-1', clientId: 'client-1', caseClientId: null, offsetId: 'off-apply-same' }),
    ]);
    expect(report.debitCreditBalance).toEqual({ balanced: true, unbalancedIdempotencyKeys: [] });
  });

  it('CLIENT_OFFSET APPLY cross-case accounting rule: payable DEBIT uses payable case, expense CREDIT uses expense case and null caseClientId', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [],
      clientPayouts: [],
      clientOffsets: [offset({ id: 'off-apply-cross', amount: D(30), kind: 'APPLY', payableCaseId: 'case-payable', expenseCaseId: 'case-expense', payableCaseClientId: 'cc-payable' })],
      balanceLedgerRows: [],
    });

    const entry = offsetJournalEntry(report, 'off-apply-cross');
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '30', caseId: 'case-payable', clientId: 'client-1', caseClientId: 'cc-payable', offsetId: 'off-apply-cross' }),
      expect.objectContaining({ accountCode: 'CLIENT_EXPENSE_RECEIVABLE', direction: 'CREDIT', amount: '30', caseId: 'case-expense', clientId: 'client-1', caseClientId: null, offsetId: 'off-apply-cross' }),
    ]);
    expect(report.totalsByTenantCaseCurrency).toEqual([
      expect.objectContaining({ tenantId: 'tenant-1', caseId: 'case-expense', currency: 'TRY', debit: '0', credit: '30', balanced: false }),
      expect.objectContaining({ tenantId: 'tenant-1', caseId: 'case-payable', currency: 'TRY', debit: '30', credit: '0', balanced: false }),
    ]);
  });

  it('CLIENT_OFFSET REVERSAL same-case accounting rule: payable CREDIT keeps caseClientId, expense DEBIT has null caseClientId', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [],
      clientPayouts: [],
      clientOffsets: [offset({ id: 'off-reversal-same', amount: D(20), kind: 'REVERSAL', payableCaseId: 'case-1', expenseCaseId: 'case-1', payableCaseClientId: 'cc-payable' })],
      balanceLedgerRows: [],
    });

    const entry = offsetJournalEntry(report, 'off-reversal-same');
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '20', caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-payable', offsetId: 'off-reversal-same' }),
      expect.objectContaining({ accountCode: 'CLIENT_EXPENSE_RECEIVABLE', direction: 'DEBIT', amount: '20', caseId: 'case-1', clientId: 'client-1', caseClientId: null, offsetId: 'off-reversal-same' }),
    ]);
    expect(report.debitCreditBalance).toEqual({ balanced: true, unbalancedIdempotencyKeys: [] });
  });

  it('CLIENT_OFFSET REVERSAL cross-case accounting rule: payable CREDIT uses payable case, expense DEBIT uses expense case and null caseClientId', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [],
      clientPayouts: [],
      clientOffsets: [offset({ id: 'off-reversal-cross', amount: D(30), kind: 'REVERSAL', payableCaseId: 'case-payable', expenseCaseId: 'case-expense', payableCaseClientId: 'cc-payable' })],
      balanceLedgerRows: [],
    });

    const entry = offsetJournalEntry(report, 'off-reversal-cross');
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '30', caseId: 'case-payable', clientId: 'client-1', caseClientId: 'cc-payable', offsetId: 'off-reversal-cross' }),
      expect.objectContaining({ accountCode: 'CLIENT_EXPENSE_RECEIVABLE', direction: 'DEBIT', amount: '30', caseId: 'case-expense', clientId: 'client-1', caseClientId: null, offsetId: 'off-reversal-cross' }),
    ]);
    expect(report.totalsByTenantCaseCurrency).toEqual([
      expect.objectContaining({ tenantId: 'tenant-1', caseId: 'case-expense', currency: 'TRY', debit: '30', credit: '0', balanced: false }),
      expect.objectContaining({ tenantId: 'tenant-1', caseId: 'case-payable', currency: 'TRY', debit: '0', credit: '30', balanced: false }),
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
    expect(report.mismatchWarnings).toEqual([
      expect.objectContaining({
        reason: 'OTHER_SUSPENSE_MANUAL_REVIEW',
        sourceType: 'COLLECTION_DISPOSITION_LINE',
        dispositionLineId: 'dl-other',
      }),
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
    expect(report.mismatchWarnings).toEqual([
      expect.objectContaining({
        reason: 'MANUAL_REVERSAL_MARKER',
        sourceType: 'COLLECTION_DISPOSITION_LINE',
        dispositionLineId: 'dl-reversal',
      }),
    ]);
  });

  it('OFFSET_CLIENT_ADVANCE journal kaynagini disposition line yapar ve korelasyonlu BalanceLedger kaynagini suppress eder', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [dispositionLine({ id: 'dl-offset', type: 'OFFSET_CLIENT_ADVANCE', amount: D(30), caseClientId: null })],
      clientPayouts: [],
      clientOffsets: [],
      balanceLedgerRows: [balanceLedger({ id: 'bl-offset', amount: D(30), source: 'disposition_line:dl-offset' })],
    });

    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).toEqual(
      expect.objectContaining({
        idempotencyKey: 'collection_disposition_line:dl-offset:posted',
        sourceType: 'COLLECTION_DISPOSITION_LINE',
        sourceId: 'dl-offset',
      }),
    );
    expect(report.entries.some((entry) => entry.idempotencyKey === 'balance_ledger:bl-offset:posted')).toBe(false);
    expect(report.entries[0].lines).toEqual([
      expect.objectContaining({ accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '30', dispositionLineId: 'dl-offset' }),
      expect.objectContaining({ accountCode: 'CLIENT_ADVANCE_BALANCE', direction: 'CREDIT', amount: '30', dispositionLineId: 'dl-offset' }),
    ]);
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
    expect(report.suppressedBalanceLedgerSources).toEqual([
      {
        dispositionLineId: 'dl-offset',
        balanceLedgerId: 'bl-offset',
        caseId: 'case-1',
        currency: 'TRY',
        amount: '30',
        reason: 'CORRELATED_OFFSET_CLIENT_ADVANCE',
      },
    ]);
    expect(report.sourceCoverage).toEqual({ totalSourceRows: 2, projectedSourceRows: 1, reportedOnlySourceRows: 1, coverageRatio: '1' });
  });

  it('sourceId icindeki disposition_line korelasyonunu da suppress eder', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [dispositionLine({ id: 'dl-offset', type: 'OFFSET_CLIENT_ADVANCE', amount: D(30), caseClientId: null })],
      clientPayouts: [],
      clientOffsets: [],
      balanceLedgerRows: [balanceLedger({ id: 'bl-offset', sourceId: 'disposition_line:dl-offset' })],
    });

    expect(report.suppressedBalanceLedgerSources).toEqual([expect.objectContaining({ balanceLedgerId: 'bl-offset', dispositionLineId: 'dl-offset' })]);
    expect(report.entries.some((entry) => entry.idempotencyKey === 'balance_ledger:bl-offset:posted')).toBe(false);
  });

  it('unlinked BalanceLedger source satirini reconciliation journal adayi olarak birakir', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [],
      clientPayouts: [],
      clientOffsets: [],
      balanceLedgerRows: [balanceLedger({ id: 'bl-unlinked', amount: D(25), source: 'manual_adjust' })],
    });

    expect(report.entries).toEqual([
      expect.objectContaining({
        idempotencyKey: 'balance_ledger:bl-unlinked:posted',
        sourceType: 'BALANCE_LEDGER',
        sourceId: 'bl-unlinked',
      }),
    ]);
    expect(report.suppressedBalanceLedgerSources).toEqual([]);
  });

  it('OFFSET_CLIENT_ADVANCE korelasyonunda amount mismatch warning uretir', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [dispositionLine({ id: 'dl-offset', type: 'OFFSET_CLIENT_ADVANCE', amount: D(30), caseClientId: null })],
      clientPayouts: [],
      clientOffsets: [],
      balanceLedgerRows: [balanceLedger({ id: 'bl-offset', amount: D(31), source: 'disposition_line:dl-offset' })],
    });

    expect(report.mismatchWarnings).toEqual([
      expect.objectContaining({
        reason: 'AMOUNT_MISMATCH',
        sourceType: 'BALANCE_LEDGER',
        dispositionLineId: 'dl-offset',
        balanceLedgerId: 'bl-offset',
        expected: '30',
        actual: '31',
      }),
    ]);
    expect(report.suppressedBalanceLedgerSources).toEqual([expect.objectContaining({ balanceLedgerId: 'bl-offset' })]);
  });

  it('OFFSET_CLIENT_ADVANCE korelasyonunda currency ve case mismatch warning uretir', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [dispositionLine({ id: 'dl-offset', type: 'OFFSET_CLIENT_ADVANCE', amount: D(30), currency: 'TRY', caseId: 'case-1', caseClientId: null })],
      clientPayouts: [],
      clientOffsets: [],
      balanceLedgerRows: [balanceLedger({ id: 'bl-offset', amount: D(30), currency: 'USD', caseId: 'case-2', source: 'disposition_line:dl-offset' })],
    });

    expect(report.mismatchWarnings).toEqual([
      expect.objectContaining({ reason: 'CURRENCY_MISMATCH', expected: 'TRY', actual: 'USD' }),
      expect.objectContaining({ reason: 'CASE_MISMATCH', expected: 'case-1', actual: 'case-2' }),
    ]);
  });

  it('OFFSET_CLIENT_ADVANCE icin korelasyon eksigini mismatch warning olarak raporlar', () => {
    const report = buildAccountingLedgerDryRunReport({
      tenantId: 'tenant-1',
      dispositionLines: [dispositionLine({ id: 'dl-offset', type: 'OFFSET_CLIENT_ADVANCE', amount: D(30), caseClientId: null })],
      clientPayouts: [],
      clientOffsets: [],
      balanceLedgerRows: [],
    });

    expect(report.entries).toEqual([expect.objectContaining({ idempotencyKey: 'collection_disposition_line:dl-offset:posted' })]);
    expect(report.mismatchWarnings).toEqual([
      expect.objectContaining({
        reason: 'MISSING_CORRELATION',
        sourceType: 'COLLECTION_DISPOSITION_LINE',
        dispositionLineId: 'dl-offset',
      }),
    ]);
  });
});
