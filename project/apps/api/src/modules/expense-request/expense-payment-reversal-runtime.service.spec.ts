import { Prisma } from '@prisma/client';
import { ExpenseRequestService } from './expense-request.service';
import { ExpensePaymentReversalContractService } from './expense-payment-reversal-contract.service';

const D = (value: string | number) => new Prisma.Decimal(value);
const REASON = 'Reverse duplicated expense payment after finance review';
const PAYMENT_DATE = new Date('2026-06-30T10:15:00.000Z');
const POSTED_AT = new Date('2026-06-30T10:16:00.000Z');

function parentRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'expense-request-1',
    tenantId: 'tenant-1',
    caseId: 'case-1',
    clientId: 'client-1',
    totalAmount: D('300.00'),
    paidTotal: D('300.00'),
    currency: 'TRY',
    status: 'PAID',
    sentAt: null,
    reminderCount: 0,
    lastReminderAt: null,
    paidAt: new Date('2026-06-30T10:17:00.000Z'),
    paidAmount: D('300.00'),
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  const expenseRequest = parentRequest(overrides.expenseRequest as Record<string, unknown> | undefined);
  return {
    id: 'expense-payment-1',
    expenseRequestId: expenseRequest.id,
    expenseRequest,
    amount: D('125.50'),
    paymentDate: PAYMENT_DATE,
    method: 'BANK_TRANSFER',
    reference: 'PAY-1',
    notes: null,
    matchedBy: 'MANUAL',
    matchedById: 'user-1',
    createdAt: PAYMENT_DATE,
    ...overrides,
  };
}

function originalPaymentJournal() {
  return {
    id: 'journal-payment-1',
    tenantId: 'tenant-1',
    caseId: 'case-1',
    currency: 'TRY',
    entryType: 'EXPENSE_PAYMENT_RECORDED',
    sourceType: 'EXPENSE_PAYMENT',
    sourceId: 'expense-payment-1',
    sourceAction: 'recorded',
    sourceOccurredAt: PAYMENT_DATE,
    postedAt: POSTED_AT,
    postedById: 'user-1',
    reversalOfEntryId: null,
    reversedByEntry: null,
    metadata: { sourceVersion: '2026-06-30T10:15:00.000Z:expense-payment-1:RECORDED' },
    lines: [
      {
        lineNo: 1,
        accountCode: 'CASH_CLEARING',
        direction: 'DEBIT',
        amount: D('125.50'),
        currency: 'TRY',
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: null,
        collectionId: null,
        dispositionLineId: null,
        payoutId: null,
        offsetId: null,
        expenseRequestId: 'expense-request-1',
        expensePaymentId: 'expense-payment-1',
        expenseApplicationId: null,
        balanceLedgerId: null,
      },
      {
        lineNo: 2,
        accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
        direction: 'CREDIT',
        amount: D('125.50'),
        currency: 'TRY',
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: null,
        collectionId: null,
        dispositionLineId: null,
        payoutId: null,
        offsetId: null,
        expenseRequestId: 'expense-request-1',
        expensePaymentId: 'expense-payment-1',
        expenseApplicationId: null,
        balanceLedgerId: null,
      },
    ],
  };
}

function originalBalanceLedger() {
  return {
    id: 'balance-ledger-original-1',
    caseBalanceId: 'case-balance-1',
    amount: D('125.50'),
    currency: 'TRY',
  };
}

function completedReversal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'expense-payment-reversal-1',
    tenantId: 'tenant-1',
    expensePaymentId: 'expense-payment-1',
    expenseRequestId: 'expense-request-1',
    kind: 'REVERSAL',
    status: 'COMPLETED',
    amount: D('125.50'),
    currency: 'TRY',
    originalJournalEntryId: 'journal-payment-1',
    reversalJournalEntryId: 'journal-reversal-1',
    originalBalanceLedgerId: 'balance-ledger-original-1',
    reversalBalanceLedgerId: 'balance-ledger-reversal-1',
    idempotencyKey: 'expense-payment-reversal:v1:tenant-1:expense-payment-1:REVERSAL',
    reason: REASON,
    requestedById: 'user-1',
    requestedAt: POSTED_AT,
    completedAt: POSTED_AT,
    metadata: {
      parentPaidTotalAfter: '174.50',
      expenseRequestStatusAfter: 'PARTIAL',
    },
    ...overrides,
  };
}

function buildHarness(options: { payment?: any; originalJournal?: any; originalLedger?: any; existingReversal?: any } = {}) {
  let createdReversal: any = null;
  const tx: any = {
    expensePaymentReversal: {
      findFirst: jest.fn().mockResolvedValue(options.existingReversal ?? null),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        createdReversal = {
          id: 'expense-payment-reversal-1',
          ...data,
          reversalJournalEntryId: null,
          reversalBalanceLedgerId: null,
        };
        return createdReversal;
      }),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...createdReversal, ...data })),
    },
    expensePayment: {
      findFirst: jest.fn().mockResolvedValue(options.payment ?? payment()),
    },
    accountingJournalEntry: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(options.originalJournal === null ? null : { id: 'journal-payment-1' })
        .mockResolvedValueOnce(options.originalJournal ?? originalPaymentJournal()),
    },
    balanceLedger: {
      findFirst: jest.fn().mockResolvedValue(options.originalLedger === undefined ? originalBalanceLedger() : options.originalLedger),
    },
    expenseRequest: {
      update: jest.fn().mockResolvedValue({ id: 'expense-request-1' }),
    },
    expenseAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  const prisma: any = {
    $transaction: jest.fn().mockImplementation(async (callback: (txArg: any) => Promise<unknown>) => callback(tx)),
  };
  const caseBalanceService: any = {
    credit: jest.fn(),
    reverseExpensePaymentCreditInTransaction: jest.fn().mockResolvedValue({ ledgerId: 'balance-ledger-reversal-1', newBalance: 874.5 }),
  };
  const journalWriter: any = {
    write: jest.fn().mockImplementation(async ({ draft }: any) => ({
      ok: true,
      output: {
        status: 'CREATED',
        journalEntryId: 'journal-reversal-1',
        idempotencyKey: draft.idempotencyKey,
        sourceVersion: draft.sourceVersion,
        lineCount: draft.lines.length,
      },
    })),
  };
  const service = new ExpenseRequestService(
    prisma,
    caseBalanceService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    journalWriter,
    new ExpensePaymentReversalContractService(),
  );

  return { service, prisma, tx, caseBalanceService, journalWriter };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await promise.then(
    () => {
      throw new Error('Expected rejection');
    },
    (error: any) => {
      const response = typeof error.getResponse === 'function' ? error.getResponse() : error.response;
      expect(response).toEqual(expect.objectContaining({ code }));
    },
  );
}

describe('ExpenseRequestService.reversePayment', () => {
  it('creates payment reversal journal, optional BalanceLedger debit, parent recompute and audit in one transaction', async () => {
    const { service, tx, caseBalanceService, journalWriter } = buildHarness();

    const result = await service.reversePayment('tenant-1', 'expense-payment-1', { reason: REASON, evidenceRef: 'EV-1' }, 'user-1');

    expect(result).toEqual(expect.objectContaining({
      status: 'CREATED',
      expensePaymentReversalId: 'expense-payment-reversal-1',
      reversalJournalEntryId: 'journal-reversal-1',
      originalBalanceLedgerId: 'balance-ledger-original-1',
      reversalBalanceLedgerId: 'balance-ledger-reversal-1',
      paidTotal: '174.50',
      expenseRequestStatus: 'PARTIAL',
    }));
    expect(tx.expensePayment.findFirst).toHaveBeenCalledWith({
      where: { id: 'expense-payment-1', expenseRequest: { is: { tenantId: 'tenant-1' } } },
      include: { expenseRequest: true },
    });
    expect(tx.accountingJournalEntry.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        sourceType: 'EXPENSE_PAYMENT',
        sourceId: 'expense-payment-1',
        sourceAction: 'recorded',
        entryType: 'EXPENSE_PAYMENT_RECORDED',
      }),
    }));
    expect(tx.expensePaymentReversal.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', originalJournalEntryId: 'journal-payment-1' }),
    }));
    expect(journalWriter.write).toHaveBeenCalledTimes(1);
    expect(caseBalanceService.reverseExpensePaymentCreditInTransaction).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      'case-1',
      expect.objectContaining({
        expensePaymentId: 'expense-payment-1',
        originalBalanceLedgerId: 'balance-ledger-original-1',
        caseBalanceId: 'case-balance-1',
        amount: '125.50',
      }),
      'user-1',
    );
    const parentUpdate = tx.expenseRequest.update.mock.calls[0][0];
    expect(parentUpdate.where).toEqual({ id: 'expense-request-1' });
    expect(parentUpdate.data.status).toBe('PARTIAL');
    expect(parentUpdate.data.paidTotal.toString()).toBe('174.5');
    expect(parentUpdate.data.paidAt).toBeNull();
    expect(parentUpdate.data.paidAmount).toBeNull();
    expect(tx.expensePaymentReversal.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'COMPLETED',
        reversalJournalEntryId: 'journal-reversal-1',
        reversalBalanceLedgerId: 'balance-ledger-reversal-1',
      }),
    }));
    expect(tx.expenseAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'PAYMENT_REVERSED', userId: 'user-1' }),
    }));
  });

  it('returns existing ExpensePaymentReversal as idempotent replay without another financial effect', async () => {
    const existingReversal = completedReversal();
    const { service, prisma, tx, caseBalanceService, journalWriter } = buildHarness({ existingReversal });

    const result = await service.reversePayment('tenant-1', 'expense-payment-1', { reason: REASON }, 'user-1');

    expect(result).toEqual(expect.objectContaining({ status: 'REPLAYED', reversalJournalEntryId: 'journal-reversal-1' }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.expensePayment.findFirst).not.toHaveBeenCalled();
    expect(tx.expensePaymentReversal.create).not.toHaveBeenCalled();
    expect(tx.expenseRequest.update).not.toHaveBeenCalled();
    expect(caseBalanceService.reverseExpensePaymentCreditInTransaction).not.toHaveBeenCalled();
    expect(journalWriter.write).not.toHaveBeenCalled();
  });

  it('blocks reversal when the original ExpensePayment recorded journal is missing', async () => {
    const { service, tx, journalWriter } = buildHarness({ originalJournal: null });

    await expectCode(service.reversePayment('tenant-1', 'expense-payment-1', { reason: REASON }, 'user-1'), 'EXPENSE_PAYMENT_REVERSAL_ORIGINAL_JOURNAL_MISSING');

    expect(tx.expensePaymentReversal.create).not.toHaveBeenCalled();
    expect(journalWriter.write).not.toHaveBeenCalled();
  });

  it('blocks parent paidTotal underflow before reversal row or journal write', async () => {
    const underpaidParent = parentRequest({ paidTotal: D('100.00') });
    const { service, tx, journalWriter } = buildHarness({ payment: payment({ expenseRequest: underpaidParent }) });

    await expectCode(service.reversePayment('tenant-1', 'expense-payment-1', { reason: REASON }, 'user-1'), 'EXPENSE_PAYMENT_REVERSAL_PARENT_PAID_TOTAL_UNDERFLOW');

    expect(tx.expensePaymentReversal.create).not.toHaveBeenCalled();
    expect(journalWriter.write).not.toHaveBeenCalled();
  });

  it('allows reversal when the original BalanceLedger bridge row is absent', async () => {
    const { service, tx, caseBalanceService } = buildHarness({ originalLedger: null });

    const result = await service.reversePayment('tenant-1', 'expense-payment-1', { reason: REASON }, 'user-1');

    expect(result).toEqual(expect.objectContaining({ status: 'CREATED', reversalBalanceLedgerId: null }));
    expect(caseBalanceService.reverseExpensePaymentCreditInTransaction).not.toHaveBeenCalled();
    expect(tx.expensePaymentReversal.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reversalBalanceLedgerId: null }),
    }));
  });

  it('keeps REFUND as a policy blocker outside the runtime reversal path', async () => {
    const { service, prisma } = buildHarness();

    await expectCode(service.reversePayment('tenant-1', 'expense-payment-1', { reason: REASON, kind: 'REFUND' }, 'user-1'), 'EXPENSE_PAYMENT_REFUND_POLICY_MISSING');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks reversal when parent ExpenseRequest is CANCELLED', async () => {
    const cancelledParent = parentRequest({ status: 'CANCELLED' });
    const { service, tx, journalWriter } = buildHarness({ payment: payment({ expenseRequest: cancelledParent }) });

    await expectCode(service.reversePayment('tenant-1', 'expense-payment-1', { reason: REASON }, 'user-1'), 'EXPENSE_PAYMENT_PARENT_CANCELLED_BLOCKED');

    expect(tx.accountingJournalEntry.findFirst).not.toHaveBeenCalled();
    expect(tx.expensePaymentReversal.create).not.toHaveBeenCalled();
    expect(journalWriter.write).not.toHaveBeenCalled();
  });
});