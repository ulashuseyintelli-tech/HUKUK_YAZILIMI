import { BadRequestException, ConflictException } from '@nestjs/common';
import { ExpensePaymentReversalContractService, ExpensePaymentReversalContractInput } from './expense-payment-reversal-contract.service';

const REQUESTED_AT = new Date('2026-07-02T10:00:00.000Z');

function input(overrides: Partial<ExpensePaymentReversalContractInput> = {}): ExpensePaymentReversalContractInput {
  return {
    tenantId: 'tenant-1',
    expensePaymentId: 'expense-payment-1',
    expenseRequestId: 'expense-request-1',
    originalJournalEntryId: 'journal-entry-recorded-1',
    originalBalanceLedgerId: 'balance-ledger-credit-1',
    amount: '125.50',
    currency: 'TRY',
    parentPaidTotal: '300.00',
    reason: 'Duplicate bank import correction',
    requestedById: 'user-1',
    requestedAt: REQUESTED_AT,
    requestKind: 'REVERSAL',
    ...overrides,
  };
}

describe('ExpensePaymentReversalContractService', () => {
  const service = new ExpensePaymentReversalContractService();

  it('builds a durable REVERSAL contract with journal and BalanceLedger correlation', () => {
    const contract = service.buildContract(input());

    expect(contract).toEqual({
      kind: 'REVERSAL',
      initialStatus: 'PENDING',
      tenantId: 'tenant-1',
      expensePaymentId: 'expense-payment-1',
      expenseRequestId: 'expense-request-1',
      originalJournalEntryId: 'journal-entry-recorded-1',
      originalBalanceLedgerId: 'balance-ledger-credit-1',
      idempotencyKey: 'expense-payment-reversal:v1:tenant-1:expense-payment-1:REVERSAL',
      amount: '125.50',
      currency: 'TRY',
      reason: 'Duplicate bank import correction',
      requestedById: 'user-1',
      requestedAtIso: '2026-07-02T10:00:00.000Z',
      parentAfterReversal: {
        paidTotal: '174.50',
        statusPolicy: 'RECOMPUTE_FROM_PAID_TOTAL',
      },
      expectedJournalReversal: {
        sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
        sourceId: 'journal-entry-recorded-1',
        sourceAction: 'reversal',
      },
      expectedBalanceLedgerReversal: {
        required: true,
        type: 'DEBIT',
        source: 'expense_payment:expense-payment-1:reversal',
        sourceId: 'expense-payment-1',
        journalPolicy: 'SUPPRESSED_EXPENSE_PAYMENT_SOURCE',
      },
    });
  });

  it('keeps refund outside the reversal skeleton as a policy blocker', () => {
    expect(() => service.buildContract(input({ requestKind: 'REFUND' }))).toThrow(ConflictException);

    try {
      service.buildContract(input({ requestKind: 'REFUND' }));
      throw new Error('Expected refund policy blocker.');
    } catch (error) {
      expect((error as ConflictException).getResponse()).toEqual(expect.objectContaining({
        code: 'EXPENSE_PAYMENT_REFUND_POLICY_MISSING',
      }));
    }
  });

  it('requires the original recorded journal entry before a domain reversal contract can be created', () => {
    expect(() => service.buildContract(input({ originalJournalEntryId: null }))).toThrow(BadRequestException);
  });

  it('blocks reversals that would make parent ExpenseRequest.paidTotal negative', () => {
    expect(() => service.buildContract(input({ parentPaidTotal: '100.00', amount: '125.50' }))).toThrow(ConflictException);

    try {
      service.buildContract(input({ parentPaidTotal: '100.00', amount: '125.50' }));
      throw new Error('Expected parent paidTotal underflow blocker.');
    } catch (error) {
      expect((error as ConflictException).getResponse()).toEqual(expect.objectContaining({
        code: 'EXPENSE_PAYMENT_REVERSAL_PARENT_PAID_TOTAL_UNDERFLOW',
      }));
    }
  });

  it('marks BalanceLedger reversal as not required when the original best-effort credit is absent', () => {
    const contract = service.buildContract(input({ originalBalanceLedgerId: null }));

    expect(contract.expectedBalanceLedgerReversal).toEqual(expect.objectContaining({
      required: false,
      source: 'expense_payment:expense-payment-1:reversal',
      journalPolicy: 'SUPPRESSED_EXPENSE_PAYMENT_SOURCE',
    }));
  });
});