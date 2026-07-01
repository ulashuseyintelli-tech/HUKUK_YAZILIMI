import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';

export type ExpensePaymentReversalRequestKind = 'REVERSAL' | 'REFUND';

export interface ExpensePaymentReversalContractInput {
  tenantId: string;
  expensePaymentId: string;
  expenseRequestId: string;
  originalJournalEntryId: string | null | undefined;
  originalBalanceLedgerId?: string | null;
  amount: string | number;
  currency?: string | null;
  parentPaidTotal: string | number;
  reason: string;
  requestedById: string;
  requestedAt?: Date;
  requestKind?: ExpensePaymentReversalRequestKind;
}

export interface ExpensePaymentReversalContract {
  kind: 'REVERSAL';
  initialStatus: 'PENDING';
  tenantId: string;
  expensePaymentId: string;
  expenseRequestId: string;
  originalJournalEntryId: string;
  originalBalanceLedgerId: string | null;
  idempotencyKey: string;
  amount: string;
  currency: string;
  reason: string;
  requestedById: string;
  requestedAtIso: string;
  parentAfterReversal: {
    paidTotal: string;
    statusPolicy: 'RECOMPUTE_FROM_PAID_TOTAL';
  };
  expectedJournalReversal: {
    sourceType: 'ACCOUNTING_JOURNAL_ENTRY';
    sourceId: string;
    sourceAction: 'reversal';
  };
  expectedBalanceLedgerReversal: {
    required: boolean;
    type: 'DEBIT';
    source: string;
    sourceId: string;
    journalPolicy: 'SUPPRESSED_EXPENSE_PAYMENT_SOURCE';
  };
}

const REVERSAL_REASON_MIN_LENGTH = 10;
const DEFAULT_CURRENCY = 'TRY';

@Injectable()
export class ExpensePaymentReversalContractService {
  /// <remarks>
  /// Cagrildigi yerler:
  /// - ExpensePaymentReversalContractService.buildContract() -> ACCT-CUTOVER-3E4A read-only domain contract skeleton; runtime reversal/refund write yok.
  /// </remarks>
  buildContract(input: ExpensePaymentReversalContractInput): ExpensePaymentReversalContract {
    const requestKind = input.requestKind ?? 'REVERSAL';
    if (requestKind === 'REFUND') {
      throw new ConflictException({
        code: 'EXPENSE_PAYMENT_REFUND_POLICY_MISSING',
        message: 'ExpensePayment refund policy is not mapped by the reversal contract skeleton.',
      });
    }

    const tenantId = requireTrimmed(input.tenantId, 'tenantId');
    const expensePaymentId = requireTrimmed(input.expensePaymentId, 'expensePaymentId');
    const expenseRequestId = requireTrimmed(input.expenseRequestId, 'expenseRequestId');
    const originalJournalEntryId = requireTrimmed(input.originalJournalEntryId, 'originalJournalEntryId');
    const requestedById = requireTrimmed(input.requestedById, 'requestedById');
    const reason = requireTrimmed(input.reason, 'reason');

    if (reason.length < REVERSAL_REASON_MIN_LENGTH) {
      throw new BadRequestException({
        code: 'EXPENSE_PAYMENT_REVERSAL_REASON_REQUIRED',
        message: `ExpensePayment reversal reason must be at least ${REVERSAL_REASON_MIN_LENGTH} characters.`,
      });
    }

    const amountCents = parseMoneyToCents(input.amount, 'amount');
    const parentPaidTotalCents = parseMoneyToCents(input.parentPaidTotal, 'parentPaidTotal');
    const paidTotalAfterCents = parentPaidTotalCents - amountCents;

    if (paidTotalAfterCents < 0n) {
      throw new ConflictException({
        code: 'EXPENSE_PAYMENT_REVERSAL_PARENT_PAID_TOTAL_UNDERFLOW',
        message: 'ExpensePayment reversal would make parent ExpenseRequest.paidTotal negative.',
        expensePaymentId,
        expenseRequestId,
      });
    }

    const currency = normalizeCurrency(input.currency);
    const requestedAt = input.requestedAt ?? new Date();
    const originalBalanceLedgerId = normalizeOptionalString(input.originalBalanceLedgerId);

    return {
      kind: 'REVERSAL',
      initialStatus: 'PENDING',
      tenantId,
      expensePaymentId,
      expenseRequestId,
      originalJournalEntryId,
      originalBalanceLedgerId,
      idempotencyKey: buildIdempotencyKey(tenantId, expensePaymentId),
      amount: formatCents(amountCents),
      currency,
      reason,
      requestedById,
      requestedAtIso: requestedAt.toISOString(),
      parentAfterReversal: {
        paidTotal: formatCents(paidTotalAfterCents),
        statusPolicy: 'RECOMPUTE_FROM_PAID_TOTAL',
      },
      expectedJournalReversal: {
        sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
        sourceId: originalJournalEntryId,
        sourceAction: 'reversal',
      },
      expectedBalanceLedgerReversal: {
        required: originalBalanceLedgerId !== null,
        type: 'DEBIT',
        source: `expense_payment:${expensePaymentId}:reversal`,
        sourceId: expensePaymentId,
        journalPolicy: 'SUPPRESSED_EXPENSE_PAYMENT_SOURCE',
      },
    };
  }
}

function buildIdempotencyKey(tenantId: string, expensePaymentId: string): string {
  return `expense-payment-reversal:v1:${tenantId}:${expensePaymentId}:REVERSAL`;
}

function requireTrimmed(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException({
      code: 'EXPENSE_PAYMENT_REVERSAL_INVALID_INPUT',
      message: `${field} is required.`,
    });
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCurrency(value: string | null | undefined): string {
  const normalized = normalizeOptionalString(value);
  return normalized ?? DEFAULT_CURRENCY;
}

function parseMoneyToCents(value: string | number, field: string): bigint {
  const raw = typeof value === 'number' ? value.toFixed(2) : String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new BadRequestException({
      code: 'EXPENSE_PAYMENT_REVERSAL_INVALID_AMOUNT',
      message: `${field} must be a positive decimal amount with at most two fractional digits.`,
    });
  }

  const [whole, fraction = ''] = raw.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents <= 0n) {
    throw new BadRequestException({
      code: 'EXPENSE_PAYMENT_REVERSAL_INVALID_AMOUNT',
      message: `${field} must be greater than zero.`,
    });
  }

  return cents;
}

function formatCents(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = cents % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(2, '0')}`;
}