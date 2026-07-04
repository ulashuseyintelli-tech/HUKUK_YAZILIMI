import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ELIGIBLE_ROLES = ['ALACAKLI', 'ORTAK_ALACAKLI'];
const ZERO = new Prisma.Decimal(0);

export interface ClientAccountingJournalSummaryClientScopedValues {
  payableNet: string;
  paidToClient: string;
  offsetApplied: string;
  expenseRequested: string;
  expensePaid: string;
  expenseUnpaid: string;
}

interface CaseClientRow {
  id: string;
  caseId: string;
}

interface ClientPayableJournalLine {
  amount: { toString(): string };
  journalEntry: {
    sourceType: string;
    sourceAction: string;
  };
}

interface ExpenseRequestRow {
  id: string;
}

interface ExpenseRequestJournalEntryRow {
  sourceId: string;
  lines: Array<{
    accountCode: string;
    direction: string;
    amount: { toString(): string };
    currency: string;
    clientId: string | null;
    expenseRequestId: string | null;
  }>;
}

interface ExpensePaymentRow {
  id: string;
  expenseRequest: {
    status: string;
  };
}

interface ExpensePaymentJournalEntryRow {
  sourceId: string;
  sourceAction: string;
  lines: Array<{
    accountCode: string;
    direction: string;
    amount: { toString(): string };
    currency: string;
    expensePaymentId: string | null;
  }>;
}

interface ExpensePaymentReversalRow {
  expensePaymentId: string;
  status: string;
  reversalJournalEntry: {
    id: string;
    entryType: string;
    sourceType: string;
    sourceAction: string;
    reversalOfEntryId: string | null;
    lines: Array<{
      accountCode: string;
      direction: string;
      amount: { toString(): string };
      currency: string;
      expensePaymentId: string | null;
    }>;
  } | null;
}

interface ExpenseReceivableAdjustmentJournalLine {
  amount: { toString(): string };
  direction: string;
  journalEntry: {
    sourceType: string;
    sourceAction: string;
  };
}

@Injectable()
export class ClientAccountingJournalSummaryReaderService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ACCT-CUTOVER-3E4B2F1 tests -> client-scoped journal-derived summary reader contract kaniti.
  /// - ClientAccountingSummaryShadowReportService.getSummaryShadowReportWithSupportedValues() -> shadow-only parity evidence.
  /// </remarks>
  async getClientScopedSummary(
    tenantId: string,
    clientId: string,
    currency = 'TRY',
  ): Promise<ClientAccountingJournalSummaryClientScopedValues> {
    const caseClients = (await this.prisma.caseClient.findMany({
      where: { clientId, role: { in: ELIGIBLE_ROLES }, client: { tenantId } },
      select: { id: true, caseId: true },
    })) as CaseClientRow[];

    const caseClientIds = caseClients.map((row) => row.id);
    const payableValues = caseClientIds.length === 0
      ? { payableNet: ZERO, paidToClient: ZERO, offsetApplied: ZERO }
      : await this.computeClientPayableValues(tenantId, currency, caseClientIds);

    const expenseValues = await this.computeExpenseValues(tenantId, clientId, currency);

    return {
      payableNet: decimalToString(payableValues.payableNet),
      paidToClient: decimalToString(payableValues.paidToClient),
      offsetApplied: decimalToString(payableValues.offsetApplied),
      expenseRequested: decimalToString(expenseValues.expenseRequested),
      expensePaid: decimalToString(expenseValues.expensePaid),
      expenseUnpaid: decimalToString(expenseValues.expenseUnpaid),
    };
  }

  private async computeClientPayableValues(
    tenantId: string,
    currency: string,
    caseClientIds: string[],
  ): Promise<{ payableNet: Prisma.Decimal; paidToClient: Prisma.Decimal; offsetApplied: Prisma.Decimal }> {
    const lines = (await this.prisma.accountingJournalLine.findMany({
      where: {
        tenantId,
        accountCode: 'CLIENT_PAYABLE',
        currency,
        caseClientId: { in: caseClientIds },
        journalEntry: {
          tenantId,
          OR: [
            { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted' },
            { sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded' },
            { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply' },
            { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal' },
          ],
        },
      },
      select: {
        amount: true,
        journalEntry: { select: { sourceType: true, sourceAction: true } },
      },
    })) as ClientPayableJournalLine[];

    let payableNet = ZERO;
    let paidToClient = ZERO;
    let offsetApplied = ZERO;

    for (const line of lines) {
      const amount = decimalOf(line.amount);
      const { sourceType, sourceAction } = line.journalEntry;

      if (sourceType === 'COLLECTION_DISPOSITION_LINE' && sourceAction === 'posted') {
        payableNet = payableNet.plus(amount);
      }
      if (sourceType === 'CLIENT_PAYOUT' && sourceAction === 'recorded') {
        payableNet = payableNet.minus(amount);
        paidToClient = paidToClient.plus(amount);
      }
      if (sourceType === 'CLIENT_OFFSET' && sourceAction === 'apply') {
        payableNet = payableNet.minus(amount);
        offsetApplied = offsetApplied.plus(amount);
      }
      if (sourceType === 'CLIENT_OFFSET' && sourceAction === 'reversal') {
        payableNet = payableNet.plus(amount);
        offsetApplied = offsetApplied.minus(amount);
      }
    }

    return { payableNet, paidToClient, offsetApplied };
  }

  private async computeExpenseValues(
    tenantId: string,
    clientId: string,
    currency: string,
  ): Promise<{ expenseRequested: Prisma.Decimal; expensePaid: Prisma.Decimal; expenseUnpaid: Prisma.Decimal }> {
    const activeRequests = (await this.prisma.expenseRequest.findMany({
      where: { tenantId, clientId, currency, status: { not: 'CANCELLED' } },
      select: { id: true },
    })) as ExpenseRequestRow[];
    const activeRequestIds = activeRequests.map((row) => row.id);

    if (activeRequestIds.length === 0) {
      return { expenseRequested: ZERO, expensePaid: ZERO, expenseUnpaid: ZERO };
    }

    const [requestEntries, payments, adjustmentLines] = await Promise.all([
      this.prisma.accountingJournalEntry.findMany({
        where: {
          tenantId,
          sourceType: 'EXPENSE_REQUEST',
          sourceAction: 'recorded',
          sourceId: { in: activeRequestIds },
        },
        select: {
          sourceId: true,
          lines: {
            select: {
              accountCode: true,
              direction: true,
              amount: true,
              currency: true,
              clientId: true,
              expenseRequestId: true,
            },
          },
        },
      }) as Promise<ExpenseRequestJournalEntryRow[]>,
      this.prisma.expensePayment.findMany({
        where: { expenseRequest: { tenantId, clientId, currency, status: { not: 'CANCELLED' } } },
        select: { id: true, expenseRequest: { select: { status: true } } },
      }) as Promise<ExpensePaymentRow[]>,
      this.prisma.accountingJournalLine.findMany({
        where: {
          tenantId,
          accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
          currency,
          expenseRequestId: { in: activeRequestIds },
          journalEntry: {
            tenantId,
            OR: [
              { sourceType: 'CLIENT_OFFSET', sourceAction: { in: ['apply', 'reversal'] } },
              { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: { in: ['apply', 'reversal'] } },
            ],
          },
        },
        select: {
          amount: true,
          direction: true,
          journalEntry: { select: { sourceType: true, sourceAction: true } },
        },
      }) as Promise<ExpenseReceivableAdjustmentJournalLine[]>,
    ]);

    const paymentIds = payments.map((payment) => payment.id);
    const [paymentEntries, paymentReversals] = paymentIds.length === 0
      ? [[], []] as [ExpensePaymentJournalEntryRow[], ExpensePaymentReversalRow[]]
      : await Promise.all([
          this.prisma.accountingJournalEntry.findMany({
            where: {
              tenantId,
              sourceType: 'EXPENSE_PAYMENT',
              sourceAction: 'recorded',
              sourceId: { in: paymentIds },
            },
            select: {
              sourceId: true,
              sourceAction: true,
              lines: {
                select: {
                  accountCode: true,
                  direction: true,
                  amount: true,
                  currency: true,
                  expensePaymentId: true,
                },
              },
            },
          }) as Promise<ExpensePaymentJournalEntryRow[]>,
          (this.prisma as PrismaService & { expensePaymentReversal: { findMany(args: unknown): Promise<unknown[]> } }).expensePaymentReversal.findMany({
            where: {
              tenantId,
              expensePaymentId: { in: paymentIds },
              kind: 'REVERSAL',
              status: 'COMPLETED',
            },
            select: {
              expensePaymentId: true,
              status: true,
              reversalJournalEntry: {
                select: {
                  id: true,
                  entryType: true,
                  sourceType: true,
                  sourceAction: true,
                  reversalOfEntryId: true,
                  lines: {
                    select: {
                      accountCode: true,
                      direction: true,
                      amount: true,
                      currency: true,
                      expensePaymentId: true,
                    },
                  },
                },
              },
            },
          }) as Promise<ExpensePaymentReversalRow[]>,
        ]);

    const expenseRequested = sumExpenseRequestRecorded(requestEntries, currency);
    const expensePaid = sumExpensePaymentRecorded(paymentEntries, currency).minus(sumExpensePaymentReversals(paymentReversals, currency));
    const adjustments = expenseReceivableAdjustmentBreakdown(adjustmentLines);
    const expenseUnpaid = expenseRequested
      .minus(expensePaid)
      .minus(adjustments.offsetApplied)
      .plus(adjustments.offsetReversal)
      .minus(adjustments.reimbursementApplied)
      .plus(adjustments.reimbursementReversal);

    return { expenseRequested, expensePaid, expenseUnpaid };
  }
}

function sumExpenseRequestRecorded(entries: ExpenseRequestJournalEntryRow[], currency: string): Prisma.Decimal {
  return entries.reduce((sum, entry) => {
    const line = entry.lines.find((candidate) =>
      candidate.accountCode === 'CLIENT_EXPENSE_RECEIVABLE' &&
      candidate.direction === 'DEBIT' &&
      candidate.currency === currency &&
      candidate.expenseRequestId === entry.sourceId,
    );
    return line ? sum.plus(decimalOf(line.amount)) : sum;
  }, ZERO);
}

function sumExpensePaymentRecorded(entries: ExpensePaymentJournalEntryRow[], currency: string): Prisma.Decimal {
  return entries.reduce((sum, entry) => {
    const line = entry.lines.find((candidate) =>
      candidate.accountCode === 'CLIENT_EXPENSE_RECEIVABLE' &&
      candidate.direction === 'CREDIT' &&
      candidate.currency === currency &&
      candidate.expensePaymentId === entry.sourceId,
    );
    return line ? sum.plus(decimalOf(line.amount)) : sum;
  }, ZERO);
}

function sumExpensePaymentReversals(reversals: ExpensePaymentReversalRow[], currency: string): Prisma.Decimal {
  return reversals.reduce((sum, reversal) => {
    if (reversal.status !== 'COMPLETED') return sum;
    const entry = reversal.reversalJournalEntry;
    if (!entry || entry.entryType !== 'ACCOUNTING_JOURNAL_REVERSAL') return sum;
    if (entry.sourceType !== 'ACCOUNTING_JOURNAL_ENTRY' || entry.sourceAction !== 'reversal') return sum;
    const line = entry.lines.find((candidate) =>
      candidate.accountCode === 'CLIENT_EXPENSE_RECEIVABLE' &&
      candidate.direction === 'DEBIT' &&
      candidate.currency === currency &&
      candidate.expensePaymentId === reversal.expensePaymentId,
    );
    return line ? sum.plus(decimalOf(line.amount)) : sum;
  }, ZERO);
}

function expenseReceivableAdjustmentBreakdown(lines: ExpenseReceivableAdjustmentJournalLine[]): {
  offsetApplied: Prisma.Decimal;
  offsetReversal: Prisma.Decimal;
  reimbursementApplied: Prisma.Decimal;
  reimbursementReversal: Prisma.Decimal;
} {
  let offsetApplied = ZERO;
  let offsetReversal = ZERO;
  let reimbursementApplied = ZERO;
  let reimbursementReversal = ZERO;

  for (const line of lines) {
    const amount = decimalOf(line.amount);
    const { sourceType, sourceAction } = line.journalEntry;
    const isCredit = line.direction === 'CREDIT';
    const isDebit = line.direction === 'DEBIT';

    if (sourceType === 'CLIENT_OFFSET' && sourceAction === 'apply' && isCredit) {
      offsetApplied = offsetApplied.plus(amount);
    }
    if (sourceType === 'CLIENT_OFFSET' && sourceAction === 'reversal' && isDebit) {
      offsetReversal = offsetReversal.plus(amount);
    }
    if (sourceType === 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION' && sourceAction === 'apply' && isCredit) {
      reimbursementApplied = reimbursementApplied.plus(amount);
    }
    if (sourceType === 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION' && sourceAction === 'reversal' && isDebit) {
      reimbursementReversal = reimbursementReversal.plus(amount);
    }
  }

  return { offsetApplied, offsetReversal, reimbursementApplied, reimbursementReversal };
}

function decimalOf(value: string | number | { toString(): string }): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

function decimalToString(value: Prisma.Decimal): string {
  return value.toString();
}