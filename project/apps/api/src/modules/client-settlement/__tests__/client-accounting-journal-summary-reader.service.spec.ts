import { Prisma } from '@prisma/client';
import { ClientAccountingJournalSummaryReaderService } from '../client-accounting-journal-summary-reader.service';

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

type PayableLine = { sourceType: string; sourceAction: string; amount: string };
type RequestJournal = { sourceId: string; amount: string };
type PaymentJournal = { sourceId: string; amount: string };
type ReversalJournal = { expensePaymentId: string; amount: string; status?: string };
type AdjustmentLine = { sourceType: string; sourceAction: string; direction: string; amount: string };

function buildPrismaMock(input: {
  caseClients?: Array<{ id: string; caseId: string }>;
  payableLines?: PayableLine[];
  activeRequestIds?: string[];
  requestJournals?: RequestJournal[];
  paymentIds?: string[];
  paymentJournals?: PaymentJournal[];
  paymentReversals?: ReversalJournal[];
  adjustmentLines?: AdjustmentLine[];
}) {
  return {
    caseClient: {
      findMany: jest.fn().mockResolvedValue(input.caseClients ?? [{ id: 'case-client-1', caseId: 'case-1' }]),
    },
    accountingJournalLine: {
      findMany: jest.fn().mockImplementation((args) => {
        if (args.where?.accountCode === 'CLIENT_PAYABLE') {
          return Promise.resolve((input.payableLines ?? []).map((line) => ({
            amount: decimal(line.amount),
            journalEntry: { sourceType: line.sourceType, sourceAction: line.sourceAction },
          })));
        }

        if (args.where?.accountCode === 'CLIENT_EXPENSE_RECEIVABLE') {
          return Promise.resolve((input.adjustmentLines ?? []).map((line) => ({
            amount: decimal(line.amount),
            direction: line.direction,
            journalEntry: { sourceType: line.sourceType, sourceAction: line.sourceAction },
          })));
        }

        return Promise.resolve([]);
      }),
    },
    expenseRequest: {
      findMany: jest.fn().mockResolvedValue((input.activeRequestIds ?? []).map((id) => ({ id }))),
    },
    accountingJournalEntry: {
      findMany: jest.fn().mockImplementation((args) => {
        if (args.where?.sourceType === 'EXPENSE_REQUEST') {
          return Promise.resolve((input.requestJournals ?? []).map((entry) => ({
            sourceId: entry.sourceId,
            lines: [{
              accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
              direction: 'DEBIT',
              amount: decimal(entry.amount),
              currency: 'TRY',
              clientId: 'client-1',
              expenseRequestId: entry.sourceId,
            }],
          })));
        }

        if (args.where?.sourceType === 'EXPENSE_PAYMENT') {
          return Promise.resolve((input.paymentJournals ?? []).map((entry) => ({
            sourceId: entry.sourceId,
            sourceAction: 'recorded',
            lines: [{
              accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
              direction: 'CREDIT',
              amount: decimal(entry.amount),
              currency: 'TRY',
              expensePaymentId: entry.sourceId,
            }],
          })));
        }

        return Promise.resolve([]);
      }),
    },
    expensePayment: {
      findMany: jest.fn().mockResolvedValue((input.paymentIds ?? []).map((id) => ({
        id,
        expenseRequest: { status: 'PENDING' },
      }))),
    },
    expensePaymentReversal: {
      findMany: jest.fn().mockResolvedValue((input.paymentReversals ?? []).map((entry) => ({
        expensePaymentId: entry.expensePaymentId,
        status: entry.status ?? 'COMPLETED',
        reversalJournalEntry: {
          id: `reversal-${entry.expensePaymentId}`,
          entryType: 'ACCOUNTING_JOURNAL_REVERSAL',
          sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
          sourceAction: 'reversal',
          reversalOfEntryId: `journal-${entry.expensePaymentId}`,
          lines: [{
            accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
            direction: 'DEBIT',
            amount: decimal(entry.amount),
            currency: 'TRY',
            expensePaymentId: entry.expensePaymentId,
          }],
        },
      }))),
    },
  };
}

function service(input: Parameters<typeof buildPrismaMock>[0]) {
  const prisma = buildPrismaMock(input);
  return { prisma, reader: new ClientAccountingJournalSummaryReaderService(prisma as never) };
}

describe('ClientAccountingJournalSummaryReaderService', () => {
  it('derives all client-scoped summary values from journal lines', async () => {
    const { reader } = service({
      payableLines: [
        { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted', amount: '200' },
        { sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', amount: '50' },
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', amount: '20' },
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal', amount: '5' },
      ],
      activeRequestIds: ['er-1', 'er-2'],
      requestJournals: [{ sourceId: 'er-1', amount: '100' }, { sourceId: 'er-2', amount: '40' }],
      paymentIds: ['ep-1', 'ep-2'],
      paymentJournals: [{ sourceId: 'ep-1', amount: '30' }, { sourceId: 'ep-2', amount: '10' }],
      paymentReversals: [{ expensePaymentId: 'ep-2', amount: '10' }],
      adjustmentLines: [
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', direction: 'CREDIT', amount: '15' },
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal', direction: 'DEBIT', amount: '5' },
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'apply', direction: 'CREDIT', amount: '12' },
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'reversal', direction: 'DEBIT', amount: '2' },
      ],
    });

    await expect(reader.getClientScopedSummary('tenant-1', 'client-1', 'TRY')).resolves.toEqual({
      payableNet: '135',
      paidToClient: '50',
      offsetApplied: '15',
      expenseRequested: '140',
      expensePaid: '30',
      expenseUnpaid: '90',
    });
  });

  it('nets completed ExpensePayment reversal journals out of expensePaid', async () => {
    const { reader } = service({
      activeRequestIds: ['er-1'],
      requestJournals: [{ sourceId: 'er-1', amount: '100' }],
      paymentIds: ['ep-1'],
      paymentJournals: [{ sourceId: 'ep-1', amount: '80' }],
      paymentReversals: [{ expensePaymentId: 'ep-1', amount: '35' }],
    });

    await expect(reader.getClientScopedSummary('tenant-1', 'client-1', 'TRY')).resolves.toEqual(
      expect.objectContaining({ expensePaid: '45', expenseUnpaid: '55' }),
    );
  });

  it('nets ClientOffset apply and reversal on payable and expense receivable legs', async () => {
    const { reader } = service({
      payableLines: [
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', amount: '25' },
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal', amount: '5' },
      ],
      activeRequestIds: ['er-1'],
      requestJournals: [{ sourceId: 'er-1', amount: '100' }],
      adjustmentLines: [
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', direction: 'CREDIT', amount: '25' },
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal', direction: 'DEBIT', amount: '5' },
      ],
    });

    await expect(reader.getClientScopedSummary('tenant-1', 'client-1', 'TRY')).resolves.toEqual(
      expect.objectContaining({ payableNet: '-20', offsetApplied: '20', expenseUnpaid: '80' }),
    );
  });

  it('nets reimbursement application apply and reversal on expenseUnpaid', async () => {
    const { reader } = service({
      activeRequestIds: ['er-1'],
      requestJournals: [{ sourceId: 'er-1', amount: '100' }],
      adjustmentLines: [
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'apply', direction: 'CREDIT', amount: '30' },
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'reversal', direction: 'DEBIT', amount: '10' },
      ],
    });

    await expect(reader.getClientScopedSummary('tenant-1', 'client-1', 'TRY')).resolves.toEqual(
      expect.objectContaining({ expenseUnpaid: '80' }),
    );
  });
});