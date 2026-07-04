import { Prisma } from '@prisma/client';
import {
  ClientAccountingSummaryShadowComponent,
  ClientAccountingSummaryShadowReport,
  ClientAccountingSummaryShadowReportService,
} from '../client-accounting-summary-shadow-report.service';

function buildReport(): ClientAccountingSummaryShadowReport {
  return new ClientAccountingSummaryShadowReportService().getSummaryShadowReport({
    tenantId: 'tenant-1',
    clientId: 'client-1',
  });
}

type ExpenseRequestMockRow = {
  id: string;
  caseId?: string;
  clientId?: string;
  totalAmount: string;
  paidTotal?: string;
  currency?: string;
  status?: string;
};

type ExpenseRequestJournalMockRow = {
  id?: string;
  sourceId: string;
  amount: string;
  caseId?: string | null;
  clientId?: string | null;
  currency?: string;
  expenseRequestId?: string | null;
};

type ExpensePaymentMockRow = {
  id: string;
  expenseRequestId: string;
  amount: string;
  caseId?: string;
  clientId?: string;
  currency?: string;
  status?: string;
};

type ExpensePaymentJournalMockRow = {
  id?: string;
  sourceId: string;
  sourceAction?: string;
  amount: string;
  caseId?: string | null;
  clientId?: string | null;
  currency?: string;
  expenseRequestId?: string | null;
  expensePaymentId?: string | null;
};

type ExpensePaymentReversalMockRow = {
  id?: string;
  expensePaymentId: string;
  status?: string;
  originalJournalEntryId?: string;
  reversalJournalEntryId?: string | null;
  reversalAmount?: string;
  reversalEntryType?: string;
  reversalSourceType?: string;
  reversalSourceAction?: string;
  reversalOfEntryId?: string | null;
  caseId?: string | null;
  clientId?: string | null;
  currency?: string;
  expenseRequestId?: string | null;
};
type ExpenseReimbursementApplicationMockRow = {
  id: string;
  expenseRequestId: string;
  kind?: 'APPLY' | 'REVERSAL';
  amount: string;
  caseId?: string;
  currency?: string;
  collectionDispositionId?: string;
  collectionDispositionLineId?: string;
  reimbursementScope?: 'CLIENT_FRONTED' | 'FIRM_FRONTED';
  reversesApplicationId?: string | null;
};

type ExpenseReimbursementApplicationJournalMockRow = {
  id?: string;
  sourceId: string;
  sourceAction?: 'apply' | 'reversal';
  kind?: 'APPLY' | 'REVERSAL';
  amount: string;
  caseId?: string | null;
  clientId?: string | null;
  currency?: string;
  expenseRequestId?: string | null;
  expenseApplicationId?: string | null;
  dispositionLineId?: string | null;
};

type ExpenseOffsetApplicationMockRow = {
  expenseRequestId: string;
  kind?: 'APPLY' | 'REVERSAL';
  amount: string;
};

type ExpenseReceivableAdjustmentLineMockRow = {
  sourceType: string;
  sourceAction: string;
  direction: string;
  amount: string;
};
type ReplayJournalMockLine = {
  accountCode: string;
  direction: string;
  amount: string;
  currency?: string;
  caseId?: string | null;
  collectionId?: string | null;
};

type ReplayJournalMockRow = {
  id?: string;
  sourceType: 'COLLECTION_DISPOSITION_LINE' | 'BALANCE_LEDGER' | 'COLLECTION';
  sourceAction?: 'posted' | 'recorded' | 'cancel';
  sourceId: string;
  entryType?: string;
  metadata?: Record<string, unknown> | null;
  lines?: ReplayJournalMockLine[];
};

type CollectionDispositionLineMockRow = {
  id: string;
  type?: string;
  amount: string;
  caseClientId?: string | null;
  dispositionId?: string;
  collectionId?: string;
  caseId?: string;
  currency?: string;
  postedAt?: Date | null;
  manualReversalRequiredAt?: Date | null;
};

type CollectionMockRow = {
  id: string;
  caseId?: string;
  currency?: string;
  status?: string;
  date?: Date | null;
  amount?: string;
  cancelledAt?: Date | null;
  createdAt?: Date | null;
};

type CollectionDispositionMockRow = {
  id: string;
  caseId?: string;
  currency?: string;
  status?: string;
  updatedAt?: Date | null;
  totalAmount?: string;
};

type BalanceLedgerMockRow = {
  id: string;
  type?: string;
  amount: string;
  currency?: string;
  source?: string | null;
  sourceId?: string | null;
  createdAt?: Date;
  caseId?: string;
};

type CaseBalanceMockRow = {
  caseId?: string;
  balance: string;
};

type CaseScopedJournalLineMockRow = {
  sourceType: string;
  sourceAction?: string;
  accountCode: string;
  direction: string;
  amount: string;
};

const DEFAULT_REPLAY_DATE = new Date('2026-01-01T00:00:00.000Z');

function expenseRequest(row: ExpenseRequestMockRow) {
  return {
    caseId: 'case-1',
    clientId: 'client-1',
    currency: 'TRY',
    status: 'PENDING',
    ...row,
    totalAmount: new Prisma.Decimal(row.totalAmount),
    paidTotal: new Prisma.Decimal(row.paidTotal ?? '0'),
  };
}

function expenseRequestJournal(row: ExpenseRequestJournalMockRow) {
  return {
    id: row.id ?? `journal-${row.sourceId}`,
    sourceId: row.sourceId,
    sourceHash: `hash-${row.sourceId}`,
    idempotencyKey: `EXPENSE_REQUEST:${row.sourceId}:recorded`,
    lines: [
      {
        accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
        direction: 'DEBIT',
        amount: new Prisma.Decimal(row.amount),
        currency: row.currency ?? 'TRY',
        caseId: row.caseId ?? 'case-1',
        clientId: row.clientId ?? 'client-1',
        expenseRequestId: row.expenseRequestId ?? row.sourceId,
      },
    ],
  };
}

function expensePayment(row: ExpensePaymentMockRow) {
  return {
    id: row.id,
    expenseRequestId: row.expenseRequestId,
    amount: new Prisma.Decimal(row.amount),
    createdAt: DEFAULT_REPLAY_DATE,
    paymentDate: DEFAULT_REPLAY_DATE,
    expenseRequest: {
      id: row.expenseRequestId,
      caseId: row.caseId ?? 'case-1',
      clientId: row.clientId ?? 'client-1',
      currency: row.currency ?? 'TRY',
      status: row.status ?? 'PENDING',
    },
  };
}

function expensePaymentJournal(row: ExpensePaymentJournalMockRow) {
  return {
    id: row.id ?? `journal-${row.sourceId}`,
    sourceId: row.sourceId,
    sourceAction: row.sourceAction ?? 'recorded',
    sourceHash: `hash-${row.sourceId}`,
    idempotencyKey: `EXPENSE_PAYMENT:${row.sourceId}:${row.sourceAction ?? 'recorded'}`,
    lines: [
      {
        accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
        direction: 'CREDIT',
        amount: new Prisma.Decimal(row.amount),
        currency: row.currency ?? 'TRY',
        caseId: row.caseId ?? 'case-1',
        clientId: row.clientId ?? 'client-1',
        expenseRequestId: row.expenseRequestId ?? `er-${row.sourceId}`,
        expensePaymentId: row.expensePaymentId ?? row.sourceId,
      },
    ],
  };
}

function expensePaymentReversal(row: ExpensePaymentReversalMockRow) {
  const originalJournalEntryId = row.originalJournalEntryId ?? `journal-${row.expensePaymentId}`;
  const reversalJournalEntryId = row.reversalJournalEntryId === undefined
    ? `reversal-journal-${row.expensePaymentId}`
    : row.reversalJournalEntryId;

  return {
    id: row.id ?? `reversal-${row.expensePaymentId}`,
    expensePaymentId: row.expensePaymentId,
    status: row.status ?? 'COMPLETED',
    originalJournalEntryId,
    reversalJournalEntryId,
    reversalJournalEntry: reversalJournalEntryId
      ? {
          id: reversalJournalEntryId,
          entryType: row.reversalEntryType ?? 'ACCOUNTING_JOURNAL_REVERSAL',
          sourceType: row.reversalSourceType ?? 'ACCOUNTING_JOURNAL_ENTRY',
          sourceAction: row.reversalSourceAction ?? 'reversal',
          reversalOfEntryId: row.reversalOfEntryId === undefined ? originalJournalEntryId : row.reversalOfEntryId,
          lines: [
            {
              accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
              direction: 'DEBIT',
              amount: new Prisma.Decimal(row.reversalAmount ?? '0'),
              currency: row.currency ?? 'TRY',
              caseId: row.caseId ?? 'case-1',
              clientId: row.clientId ?? 'client-1',
              expenseRequestId: row.expenseRequestId ?? `er-${row.expensePaymentId}`,
              expensePaymentId: row.expensePaymentId,
            },
          ],
        }
      : null,
  };
}
function expenseReimbursementApplication(row: ExpenseReimbursementApplicationMockRow) {
  return {
    id: row.id,
    expenseRequestId: row.expenseRequestId,
    caseId: row.caseId ?? 'case-1',
    kind: row.kind ?? 'APPLY',
    amount: new Prisma.Decimal(row.amount),
    currency: row.currency ?? 'TRY',
    collectionDispositionId: row.collectionDispositionId ?? `disp-${row.id}`,
    collectionDispositionLineId: row.collectionDispositionLineId ?? `line-${row.id}`,
    reimbursementScope: row.reimbursementScope ?? 'CLIENT_FRONTED',
    reversesApplicationId: row.reversesApplicationId ?? null,
  };
}

function expenseReimbursementApplicationJournal(row: ExpenseReimbursementApplicationJournalMockRow) {
  const kind = row.kind ?? (row.sourceAction === 'reversal' ? 'REVERSAL' : 'APPLY');
  return {
    id: row.id ?? `journal-${row.sourceId}`,
    sourceId: row.sourceId,
    sourceAction: row.sourceAction ?? (kind === 'REVERSAL' ? 'reversal' : 'apply'),
    sourceHash: `hash-${row.sourceId}`,
    idempotencyKey: `COLLECTION_DISPOSITION_EXPENSE_APPLICATION:${row.sourceId}:${kind}`,
    lines: [
      {
        accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
        direction: kind === 'REVERSAL' ? 'DEBIT' : 'CREDIT',
        amount: new Prisma.Decimal(row.amount),
        currency: row.currency ?? 'TRY',
        caseId: row.caseId ?? 'case-1',
        clientId: row.clientId ?? 'client-1',
        expenseRequestId: row.expenseRequestId ?? `er-${row.sourceId}`,
        expenseApplicationId: row.expenseApplicationId ?? row.sourceId,
        dispositionLineId: row.dispositionLineId ?? `line-${row.sourceId}`,
      },
    ],
  };
}
function expenseOffsetApplication(row: ExpenseOffsetApplicationMockRow) {
  return {
    expenseRequestId: row.expenseRequestId,
    kind: row.kind ?? 'APPLY',
    amount: new Prisma.Decimal(row.amount),
  };
}

function expenseReceivableAdjustmentLine(row: ExpenseReceivableAdjustmentLineMockRow) {
  return {
    amount: new Prisma.Decimal(row.amount),
    direction: row.direction,
    journalEntry: { sourceType: row.sourceType, sourceAction: row.sourceAction },
  };
}

function replayJournal(row: ReplayJournalMockRow) {
  const sourceAction = row.sourceAction ?? 'posted';
  return {
    id: row.id ?? `journal-${row.sourceId}-${sourceAction}`,
    sourceType: row.sourceType,
    sourceAction,
    sourceId: row.sourceId,
    entryType: row.entryType,
    metadata: row.metadata ?? null,
    lines: (row.lines ?? []).map((line) => ({
      accountCode: line.accountCode,
      direction: line.direction,
      amount: new Prisma.Decimal(line.amount),
      currency: line.currency ?? 'TRY',
      caseId: line.caseId === undefined ? 'case-1' : line.caseId,
      collectionId: line.collectionId === undefined ? row.sourceId : line.collectionId,
    })),
  };
}

function collectionCashJournal(row: {
  sourceId: string;
  action: 'recorded' | 'cancel';
  amount: string;
  caseId?: string;
  currency?: string;
  cashAmount?: string;
  clearingAmount?: string;
  cashCaseId?: string | null;
  clearingCaseId?: string | null;
}) {
  const isCancel = row.action === 'cancel';
  const currency = row.currency ?? 'TRY';
  const caseId = row.caseId ?? 'case-1';
  return {
    sourceType: 'COLLECTION' as const,
    sourceAction: row.action,
    sourceId: row.sourceId,
    entryType: isCancel ? 'COLLECTION_CASH_RECEIPT_REVERSED' : 'COLLECTION_CASH_RECEIPT_RECORDED',
    metadata: { sourceVersion: `2026-01-01T00:00:00.000Z:${row.sourceId}:${isCancel ? 'CANCEL' : 'RECORDED'}` },
    lines: [
      {
        accountCode: 'CASH_CLEARING',
        direction: isCancel ? 'CREDIT' : 'DEBIT',
        amount: row.cashAmount ?? row.amount,
        currency,
        caseId: row.cashCaseId === undefined ? caseId : row.cashCaseId,
        collectionId: row.sourceId,
      },
      {
        accountCode: 'CASE_COLLECTION_CLEARING',
        direction: isCancel ? 'DEBIT' : 'CREDIT',
        amount: row.clearingAmount ?? row.amount,
        currency,
        caseId: row.clearingCaseId === undefined ? caseId : row.clearingCaseId,
        collectionId: row.sourceId,
      },
    ],
  } satisfies ReplayJournalMockRow;
}
function collectionDispositionLine(row: CollectionDispositionLineMockRow) {
  return {
    id: row.id,
    type: row.type ?? 'CLIENT_PAYABLE',
    amount: new Prisma.Decimal(row.amount),
    caseClientId: row.caseClientId ?? 'case-client-1',
    disposition: {
      id: row.dispositionId ?? `disp-${row.id}`,
      collectionId: row.collectionId ?? `collection-${row.id}`,
      caseId: row.caseId ?? 'case-1',
      currency: row.currency ?? 'TRY',
      postedAt: row.postedAt === undefined ? DEFAULT_REPLAY_DATE : row.postedAt,
      manualReversalRequiredAt: row.manualReversalRequiredAt ?? null,
    },
  };
}

function collection(row: CollectionMockRow) {
  return {
    caseId: 'case-1',
    currency: 'TRY',
    status: 'CONFIRMED',
    date: DEFAULT_REPLAY_DATE,
    ...row,
    amount: new Prisma.Decimal(row.amount ?? '0'),
  };
}

function collectionDisposition(row: CollectionDispositionMockRow) {
  return {
    caseId: 'case-1',
    currency: 'TRY',
    status: 'HELD_PENDING_DISTRIBUTION',
    updatedAt: DEFAULT_REPLAY_DATE,
    ...row,
    totalAmount: new Prisma.Decimal(row.totalAmount ?? '0'),
  };
}

function balanceLedger(row: BalanceLedgerMockRow) {
  return {
    id: row.id,
    type: row.type ?? 'CREDIT',
    amount: new Prisma.Decimal(row.amount),
    currency: row.currency ?? 'TRY',
    source: row.source ?? null,
    sourceId: row.sourceId ?? null,
    createdAt: row.createdAt ?? DEFAULT_REPLAY_DATE,
    caseBalance: { caseId: row.caseId ?? 'case-1' },
  };
}

function caseBalance(row: CaseBalanceMockRow) {
  return {
    caseId: row.caseId ?? 'case-1',
    balance: new Prisma.Decimal(row.balance),
  };
}

function caseScopedJournalLine(row: CaseScopedJournalLineMockRow) {
  return {
    accountCode: row.accountCode,
    direction: row.direction,
    amount: new Prisma.Decimal(row.amount),
    journalEntry: { sourceType: row.sourceType, sourceAction: row.sourceAction ?? 'posted' },
  };
}

function buildPrismaMock(
  lines: Array<{ sourceType: string; sourceAction: string; amount: string }>,
  expense?: {
    active?: ExpenseRequestMockRow[];
    cancelled?: ExpenseRequestMockRow[];
    journals?: ExpenseRequestJournalMockRow[];
    paymentRows?: ExpensePaymentMockRow[];
    paymentJournals?: ExpensePaymentJournalMockRow[];
    offsetApplications?: ExpenseOffsetApplicationMockRow[];
    adjustmentLines?: ExpenseReceivableAdjustmentLineMockRow[];
    payments?: Array<{ expenseRequestId: string }>;
    offsets?: Array<{ expenseRequestId: string }>;
    applications?: Array<{ expenseRequestId: string }>;
    paymentReversals?: ExpensePaymentReversalMockRow[];
    reimbursementApplications?: ExpenseReimbursementApplicationMockRow[];
    reimbursementApplicationJournals?: ExpenseReimbursementApplicationJournalMockRow[];
  },
  replay?: {
    caseClients?: Array<{ id: string; caseId: string }>;
    dispositionLines?: CollectionDispositionLineMockRow[];
    collections?: CollectionMockRow[];
    dispositions?: CollectionDispositionMockRow[];
    balanceLedgers?: BalanceLedgerMockRow[];
    caseBalances?: CaseBalanceMockRow[];
    caseScopedJournalLines?: CaseScopedJournalLineMockRow[];
    journalEntries?: ReplayJournalMockRow[];
  },
) {
  return {
    caseClient: {
      findMany: jest.fn().mockResolvedValue(replay?.caseClients ?? [{ id: 'case-client-1', caseId: 'case-1' }]),
    },
    accountingJournalLine: {
      findMany: jest.fn().mockImplementation((args) => {
        if (args.where?.accountCode === 'CLIENT_EXPENSE_RECEIVABLE') {
          return Promise.resolve((expense?.adjustmentLines ?? []).map(expenseReceivableAdjustmentLine));
        }
        if (args.where?.accountCode === 'CLIENT_ADVANCE_BALANCE') {
          return Promise.resolve((replay?.caseScopedJournalLines ?? [])
            .filter((line) => line.accountCode === 'CLIENT_ADVANCE_BALANCE')
            .map(caseScopedJournalLine));
        }
        if (args.where?.journalEntry?.sourceType === 'COLLECTION_DISPOSITION_LINE') {
          return Promise.resolve((replay?.caseScopedJournalLines ?? [])
            .filter((line) => line.sourceType === 'COLLECTION_DISPOSITION_LINE')
            .map(caseScopedJournalLine));
        }
        return Promise.resolve(
          lines.map((line) => ({
            amount: new Prisma.Decimal(line.amount),
            journalEntry: { sourceType: line.sourceType, sourceAction: line.sourceAction },
          })),
        );
      }),
    },    expenseRequest: {
      findMany: jest.fn().mockImplementation((args) => {
        if (args.where.status === 'CANCELLED') {
          return Promise.resolve((expense?.cancelled ?? []).map(expenseRequest));
        }
        return Promise.resolve((expense?.active ?? []).map(expenseRequest));
      }),
    },
    accountingJournalEntry: {
      findMany: jest.fn().mockImplementation((args) => {
        if (args.where?.sourceType === 'EXPENSE_REQUEST') {
          return Promise.resolve((expense?.journals ?? []).map(expenseRequestJournal));
        }
        if (args.where?.sourceType === 'EXPENSE_PAYMENT') {
          return Promise.resolve((expense?.paymentJournals ?? []).map(expensePaymentJournal));
        }
        if (args.where?.sourceType === 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION') {
          return Promise.resolve((expense?.reimbursementApplicationJournals ?? []).map(expenseReimbursementApplicationJournal));
        }
        return Promise.resolve((replay?.journalEntries ?? []).map(replayJournal));
      }),
    },    collectionDispositionLine: {
      findMany: jest.fn().mockResolvedValue((replay?.dispositionLines ?? []).map(collectionDispositionLine)),
    },
    collection: {
      findMany: jest.fn().mockResolvedValue((replay?.collections ?? []).map(collection)),
    },
    collectionDisposition: {
      findMany: jest.fn().mockResolvedValue((replay?.dispositions ?? []).map(collectionDisposition)),
    },
    balanceLedger: {
      findMany: jest.fn().mockResolvedValue((replay?.balanceLedgers ?? []).map(balanceLedger)),
    },
    caseBalance: {
      findMany: jest.fn().mockResolvedValue((replay?.caseBalances ?? []).map(caseBalance)),
    },
    expensePaymentReversal: {
      findMany: jest.fn().mockResolvedValue((expense?.paymentReversals ?? []).map(expensePaymentReversal)),
    },
    expensePayment: {
      findMany: jest.fn().mockImplementation((args) => {
        if (args.where?.expenseRequest) {
          return Promise.resolve((expense?.paymentRows ?? []).map(expensePayment));
        }
        return Promise.resolve(expense?.payments ?? []);
      }),
    },    clientOffset: {
      findMany: jest.fn().mockImplementation((args) => {
        if (args.where?.currency && args.where?.expenseRequestId?.in) {
          return Promise.resolve((expense?.offsetApplications ?? []).map(expenseOffsetApplication));
        }
        return Promise.resolve(expense?.offsets ?? []);
      }),
    },
    collectionDispositionExpenseApplication: {
      findMany: jest.fn().mockImplementation((args) => {
        if (args.where?.expenseRequestId?.in || args.where?.currency) {
          return Promise.resolve((expense?.reimbursementApplications ?? []).map(expenseReimbursementApplication));
        }
        return Promise.resolve(expense?.applications ?? []);
      }),
    },
  };
}

function component(
  report: ClientAccountingSummaryShadowReport,
  key: string,
): ClientAccountingSummaryShadowComponent {
  const found = report.components.find((item) => item.key === key);

  if (!found) {
    throw new Error(`Missing summary shadow component ${key}`);
  }

  return found;
}

function expensePolicyItem(
  report: ClientAccountingSummaryShadowReport,
  componentKey: string,
) {
  const found = report.expenseCoveragePolicy.items.find((item) => item.component === componentKey);

  if (!found) {
    throw new Error(`Missing expense coverage policy item ${componentKey}`);
  }

  return found;
}
describe('ClientAccountingSummaryShadowReportService', () => {
  it('reports journal-supported summary components', () => {
    const report = buildReport();

    expect(report.mode).toBe('READ_ONLY_COMPONENT_COVERAGE');
    expect(component(report, 'payableNet')).toEqual(
      expect.objectContaining({
        coverage: 'JOURNAL_SUPPORTED',
        journalSources: ['COLLECTION_DISPOSITION_LINE', 'CLIENT_PAYOUT', 'CLIENT_OFFSET'],
        blockerCodes: [],
        gapCodes: [],
      }),
    );
    expect(component(report, 'paidToClient')).toEqual(
      expect.objectContaining({
        coverage: 'JOURNAL_SUPPORTED',
        journalSources: ['CLIENT_PAYOUT'],
      }),
    );
    expect(component(report, 'offsetApplied')).toEqual(
      expect.objectContaining({
        coverage: 'JOURNAL_SUPPORTED',
        journalSources: ['CLIENT_OFFSET'],
      }),
    );
    expect(report.supportedValueSummary).toEqual(
      expect.objectContaining({ status: 'NOT_COMPUTED', notComputedCount: 6 }),
    );
  });

  it('reports explicit gap and blocker summary components', () => {
    const report = buildReport();

    expect(component(report, 'expensePaid')).toEqual(
      expect.objectContaining({
        coverage: 'BLOCKER',
        legacySources: ['ExpenseRequest', 'ExpensePayment'],
        journalSources: ['EXPENSE_PAYMENT'],
        blockerCodes: expect.arrayContaining(['EXPENSE_PAYMENT_BACKFILL_MISSING']),
        gapCodes: expect.not.arrayContaining(['EXPENSE_PAYMENT_JOURNAL_SOURCE_MISSING']),
      }),
    );
    expect(component(report, 'expenseUnpaid')).toEqual(
      expect.objectContaining({
        coverage: 'BLOCKER',
        blockerCodes: expect.arrayContaining([
          'EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS',
        ]),
      }),
    );
    expect(component(report, 'debtorCollection')).toEqual(
      expect.objectContaining({
        coverage: 'GAP',
        gapCodes: ['COLLECTION_JOURNAL_SOURCE_MISSING'],
      }),
    );
    expect(component(report, 'pendingDistribution')).toEqual(
      expect.objectContaining({
        coverage: 'BLOCKER',
        blockerCodes: ['CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING'],
      }),
    );
    expect(component(report, 'advanceBalance')).toEqual(
      expect.objectContaining({
        coverage: 'BLOCKER',
        journalSources: ['BALANCE_LEDGER'],
        blockerCodes: ['CASE_BALANCE_SNAPSHOT_REPLAY_UNVERIFIED'],
      }),
    );
  });

  it('keeps client accounting summary primary readiness blocked', () => {
    const report = buildReport();

    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
    expect(report.primarySwitchUnchanged).toBe(true);
    expect(report.blockerCodes).toEqual(
      expect.arrayContaining([
        'EXPENSE_REQUEST_BACKFILL_MISSING',
        'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
        'CASE_BALANCE_SNAPSHOT_REPLAY_UNVERIFIED',
      ]),
    );
    expect(report.gapCodes).toEqual(
      expect.arrayContaining([
        'COLLECTION_JOURNAL_SOURCE_MISSING',
        'CASE_BALANCE_SNAPSHOT_NOT_JOURNAL_DERIVED',
      ]),
    );
    expect(report.nextImplementationTasks[0]).toContain('ACCT-CUTOVER-3E2B');
  });


  it('recognizes ExpenseRequest live posting and retains backfill value and cancel blockers', () => {
    const report = buildReport();
    const item = expensePolicyItem(report, 'expenseRequested');

    expect(item).toEqual(
      expect.objectContaining({
        responsePath: 'clientScoped.expenseRequested',
        coverage: 'CONTRACT_EXISTS',
        requiredSources: ['EXPENSE_REQUEST'],
        requiredActions: ['recorded', 'cancel'],
        requiredDimensions: expect.arrayContaining(['tenantId', 'clientId', 'caseId', 'expenseRequestId', 'currency']),
        supportedSources: ['EXPENSE_REQUEST'],
        blockerCodes: expect.arrayContaining([
          'EXPENSE_REQUEST_BACKFILL_MISSING',
          'EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED',
        ]),
        gapCodes: [],
      }),
    );
  });

  it('recognizes ExpensePayment contract and retains reversal/refund blockers', () => {
    const report = buildReport();
    const item = expensePolicyItem(report, 'expensePaid');

    expect(item).toEqual(
      expect.objectContaining({
        responsePath: 'clientScoped.expensePaid',
        coverage: 'CONTRACT_EXISTS',
        requiredSources: ['EXPENSE_PAYMENT'],
        requiredActions: ['recorded'],
        requiredDimensions: expect.arrayContaining(['expenseRequestId', 'expensePaymentId']),
        supportedSources: ['EXPENSE_PAYMENT'],
        blockerCodes: expect.arrayContaining([
          'EXPENSE_PAYMENT_BACKFILL_MISSING',
          'EXPENSE_PAYMENT_BACKFILL_MISSING',
          'EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH',
          'EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING',
        ]),
        gapCodes: ['EXPENSE_REQUEST_PAID_TOTAL_PROJECTION_ONLY'],
      }),
    );
  });

  it('recognizes ExpenseApplication apply/reversal contract and retains wiring/backfill blockers', () => {
    const report = buildReport();
    const item = expensePolicyItem(report, 'reimbursementApplication');

    expect(item).toEqual(
      expect.objectContaining({
        responsePath: 'clientScoped.expenseUnpaid.reimbursementApplication',
        coverage: 'CONTRACT_EXISTS',
        requiredSources: ['COLLECTION_DISPOSITION_EXPENSE_APPLICATION'],
        requiredActions: ['apply', 'reversal'],
        requiredDimensions: expect.arrayContaining([
          'expenseRequestId',
          'collectionDispositionId',
          'collectionDispositionLineId',
          'reimbursementScope',
        ]),
        supportedSources: ['COLLECTION_DISPOSITION_EXPENSE_APPLICATION'],
        blockerCodes: expect.arrayContaining([
          'EXPENSE_REIMBURSEMENT_APPLICATION_BACKFILL_MISSING',
          'EXPENSE_REIMBURSEMENT_APPLICATION_BACKFILL_MISSING',
          'EXPENSE_REIMBURSEMENT_APPLICATION_VALUE_SHADOW_MISMATCH',
          'EXPENSE_REIMBURSEMENT_APPLICATION_DIMENSION_MISMATCH',
        ]),
        gapCodes: [],
      }),
    );
  });

  it('keeps overall expense policy and summary primary readiness blocked', () => {
    const report = buildReport();

    expect(report.expenseCoveragePolicy.status).toBe('BLOCKED');
    expect(report.expenseCoveragePolicy.items.map((item) => item.component)).toEqual([
      'expenseRequested',
      'expensePaid',
      'expenseUnpaid',
      'reimbursementApplication',
    ]);
    expect(report.expenseCoveragePolicy.blockerCodes).toEqual(
      expect.arrayContaining([
        'EXPENSE_REQUEST_BACKFILL_MISSING',
        'EXPENSE_PAYMENT_BACKFILL_MISSING',
        'EXPENSE_REIMBURSEMENT_APPLICATION_BACKFILL_MISSING',
      ]),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });

  it('reports matched journal-derived values for supported summary components', async () => {
    const prisma = buildPrismaMock([
      { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted', amount: '150' },
      { sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', amount: '20' },
      { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', amount: '10' },
      { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal', amount: '5' },
    ]);

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '125', paidToClient: '20', offsetApplied: '5' },
    });

    expect(report.supportedValueSummary).toEqual(
      expect.objectContaining({ status: 'MATCH', matchedCount: 6, mismatchedCount: 0, notComputedCount: 0 }),
    );
    expect(component(report, 'payableNet').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '125', journalValue: '125', delta: '0', status: 'MATCH' }),
    );
    expect(component(report, 'paidToClient').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '20', journalValue: '20', delta: '0', status: 'MATCH' }),
    );
    expect(component(report, 'offsetApplied').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '5', journalValue: '5', delta: '0', status: 'MATCH' }),
    );
    expect(prisma.accountingJournalLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountCode: 'CLIENT_PAYABLE', currency: 'TRY' }),
      }),
    );
  });

  it('keeps primary readiness blocked and reports blocker when supported value mismatches', async () => {
    const prisma = buildPrismaMock([
      { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted', amount: '150' },
      { sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', amount: '20' },
      { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', amount: '10' },
    ]);

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '125', paidToClient: '20', offsetApplied: '10' },
    });

    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
    expect(report.supportedValueSummary).toEqual(
      expect.objectContaining({ status: 'MISMATCH', matchedCount: 5, mismatchedCount: 1, notComputedCount: 0 }),
    );
    expect(report.blockerCodes).toEqual(
      expect.arrayContaining(['SUMMARY_SUPPORTED_COMPONENT_VALUE_MISMATCH']),
    );
    expect(component(report, 'payableNet').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '125', journalValue: '120', delta: '-5', status: 'MISMATCH' }),
    );
  });


  it('reports ExpenseRequest backfill evidence as all matched and compares expenseRequested value', async () => {
    const prisma = buildPrismaMock([], {
      active: [
        { id: 'er-1', totalAmount: '100' },
        { id: 'er-2', totalAmount: '40' },
      ],
      journals: [
        { sourceId: 'er-1', amount: '100' },
        { sourceId: 'er-2', amount: '40' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseRequestBackfillEvidence).toEqual(
      expect.objectContaining({
        sourceType: 'EXPENSE_REQUEST',
        sourceAction: 'recorded',
        sourceVersionEvidence: 'idempotencyKey/sourceHash/sourceTuple',
        statusCounts: expect.objectContaining({ MATCHED: 2, BACKFILL_REQUIRED: 0 }),
        blockerCodes: [],
      }),
    );
    expect(component(report, 'expenseRequested').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '140', journalValue: '140', delta: '0', status: 'MATCH', blockerCodes: [] }),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });

  it('reports missing historical ExpenseRequest journal as backfill required', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-missing', totalAmount: '75' }],
      journals: [],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseRequestBackfillEvidence?.statusCounts).toEqual(
      expect.objectContaining({ BACKFILL_REQUIRED: 1 }),
    );
    expect(report.expenseRequestBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        expenseRequestId: 'er-missing',
        status: 'BACKFILL_REQUIRED',
        blockerCodes: ['EXPENSE_REQUEST_BACKFILL_MISSING'],
      }),
    );
    expect(component(report, 'expenseRequested').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '75', journalValue: '0', delta: '-75', status: 'MISMATCH' }),
    );
    expect(report.blockerCodes).toEqual(
      expect.arrayContaining(['EXPENSE_REQUEST_BACKFILL_MISSING', 'EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH']),
    );
  });

  it('reports ExpenseRequest value mismatch evidence and summary blocker', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-mismatch', totalAmount: '90' }],
      journals: [{ sourceId: 'er-mismatch', amount: '80' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseRequestBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'VALUE_MISMATCH',
        legacyValue: '90',
        journalValue: '80',
        delta: '-10',
        blockerCodes: ['EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH'],
      }),
    );
    expect(component(report, 'expenseRequested').valueComparison).toEqual(
      expect.objectContaining({ status: 'MISMATCH', blockerReason: 'EXPENSE_REQUEST_VALUE_SHADOW_MISMATCH' }),
    );
  });

  it('reports cancelled ExpenseRequest source as cancel blocker', async () => {
    const prisma = buildPrismaMock([], {
      cancelled: [{ id: 'er-cancelled', totalAmount: '25', status: 'CANCELLED' }],
      journals: [{ sourceId: 'er-cancelled', amount: '25' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseRequestBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        expenseRequestId: 'er-cancelled',
        status: 'CANCELLED_SOURCE_BLOCKED',
        blockerCodes: ['EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED'],
      }),
    );
    expect(component(report, 'expenseRequested').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '0', journalValue: '0', delta: '0', status: 'MATCH' }),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['EXPENSE_REQUEST_CANCEL_POLICY_BLOCKED']));
  });

  it('reports settled cancelled ExpenseRequest as settled cancel blocker', async () => {
    const prisma = buildPrismaMock([], {
      cancelled: [{ id: 'er-settled-cancel', totalAmount: '60', status: 'CANCELLED' }],
      journals: [{ sourceId: 'er-settled-cancel', amount: '60' }],
      payments: [{ expenseRequestId: 'er-settled-cancel' }],
      offsets: [{ expenseRequestId: 'er-settled-cancel' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseRequestBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        expenseRequestId: 'er-settled-cancel',
        status: 'SETTLED_CANCEL_BLOCKED',
        blockerCodes: ['EXPENSE_REQUEST_SETTLED_CANCEL_BLOCKED'],
        details: expect.objectContaining({ settledActivityCount: 2 }),
      }),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['EXPENSE_REQUEST_SETTLED_CANCEL_BLOCKED']));
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });
  it('reports ExpensePayment backfill evidence as all matched and compares expensePaid/unpaid values', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-paid', totalAmount: '100', paidTotal: '30' }],
      journals: [{ sourceId: 'er-paid', amount: '100' }],
      paymentRows: [{ id: 'ep-1', expenseRequestId: 'er-paid', amount: '30' }],
      paymentJournals: [{ sourceId: 'ep-1', amount: '30', expenseRequestId: 'er-paid' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence).toEqual(
      expect.objectContaining({
        sourceType: 'EXPENSE_PAYMENT',
        sourceAction: 'recorded',
        sourceVersionEvidence: 'idempotencyKey/sourceHash/sourceTuple',
        statusCounts: expect.objectContaining({ MATCHED: 1, BACKFILL_REQUIRED: 0 }),
        blockerCodes: [],
      }),
    );
    expect(component(report, 'expensePaid').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '30', journalValue: '30', delta: '0', status: 'MATCH', blockerCodes: [] }),
    );
    expect(component(report, 'expenseUnpaid').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '70', journalValue: '70', delta: '0', status: 'MATCH' }),
    );
    expect(report.expenseUnpaidBreakdown).toEqual(
      expect.objectContaining({ requestedJournalValue: '100', paidJournalValue: '30', journalValue: '70' }),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });

  it('nets completed ExpensePayment reversal into expensePaid and expenseUnpaid shadow values', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-reversed', totalAmount: '100', paidTotal: '0' }],
      journals: [{ sourceId: 'er-reversed', amount: '100' }],
      paymentRows: [{ id: 'ep-reversed', expenseRequestId: 'er-reversed', amount: '30' }],
      paymentJournals: [{ sourceId: 'ep-reversed', amount: '30', expenseRequestId: 'er-reversed' }],
      paymentReversals: [{ expensePaymentId: 'ep-reversed', reversalAmount: '30', expenseRequestId: 'er-reversed' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'MATCHED',
        legacyValue: '0',
        journalValue: '0',
        delta: '0',
        blockerCodes: [],
        details: expect.objectContaining({
          reversalStatus: 'COMPLETED',
          reversalJournalEntryId: 'reversal-journal-ep-reversed',
          reversalJournalValue: '30',
        }),
      }),
    );
    expect(component(report, 'expensePaid').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '0', journalValue: '0', delta: '0', status: 'MATCH', blockerCodes: [] }),
    );
    expect(report.expenseUnpaidBreakdown).toEqual(
      expect.objectContaining({ legacyValue: '100', requestedJournalValue: '100', paidJournalValue: '0', journalValue: '100', delta: '0' }),
    );
  });

  it('blocks incomplete ExpensePayment reversal evidence', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-reversal-pending', totalAmount: '100', paidTotal: '30' }],
      journals: [{ sourceId: 'er-reversal-pending', amount: '100' }],
      paymentRows: [{ id: 'ep-reversal-pending', expenseRequestId: 'er-reversal-pending', amount: '30' }],
      paymentJournals: [{ sourceId: 'ep-reversal-pending', amount: '30', expenseRequestId: 'er-reversal-pending' }],
      paymentReversals: [{ expensePaymentId: 'ep-reversal-pending', status: 'PENDING', reversalAmount: '30', expenseRequestId: 'er-reversal-pending' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'REVERSAL_INCOMPLETE_BLOCKED',
        blockerCodes: ['EXPENSE_PAYMENT_REVERSAL_INCOMPLETE'],
        details: expect.objectContaining({
          reversalStatus: 'PENDING',
          policyReason: 'EXPENSE_PAYMENT_REVERSAL_RUNTIME_EVIDENCE_INCOMPLETE',
        }),
      }),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['EXPENSE_PAYMENT_REVERSAL_INCOMPLETE']));
  });

  it('blocks completed ExpensePayment reversal when reversal journal is missing', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-reversal-missing-journal', totalAmount: '100', paidTotal: '0' }],
      journals: [{ sourceId: 'er-reversal-missing-journal', amount: '100' }],
      paymentRows: [{ id: 'ep-reversal-missing-journal', expenseRequestId: 'er-reversal-missing-journal', amount: '30' }],
      paymentJournals: [{ sourceId: 'ep-reversal-missing-journal', amount: '30', expenseRequestId: 'er-reversal-missing-journal' }],
      paymentReversals: [{ expensePaymentId: 'ep-reversal-missing-journal', reversalJournalEntryId: null, expenseRequestId: 'er-reversal-missing-journal' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'REVERSAL_INCOMPLETE_BLOCKED',
        blockerCodes: ['EXPENSE_PAYMENT_REVERSAL_INCOMPLETE'],
        details: expect.objectContaining({ reversalJournalEntryId: null }),
      }),
    );
  });

  it('blocks ExpensePayment reversal value mismatch evidence', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-reversal-mismatch', totalAmount: '100', paidTotal: '0' }],
      journals: [{ sourceId: 'er-reversal-mismatch', amount: '100' }],
      paymentRows: [{ id: 'ep-reversal-mismatch', expenseRequestId: 'er-reversal-mismatch', amount: '30' }],
      paymentJournals: [{ sourceId: 'ep-reversal-mismatch', amount: '30', expenseRequestId: 'er-reversal-mismatch' }],
      paymentReversals: [{ expensePaymentId: 'ep-reversal-mismatch', reversalAmount: '25', expenseRequestId: 'er-reversal-mismatch' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'REVERSAL_VALUE_MISMATCH',
        journalValue: '5',
        delta: '5',
        blockerCodes: ['EXPENSE_PAYMENT_REVERSAL_VALUE_MISMATCH'],
        details: expect.objectContaining({ reversalJournalValue: '25' }),
      }),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['EXPENSE_PAYMENT_REVERSAL_VALUE_MISMATCH']));
  });
  it('reports missing historical ExpensePayment journal as backfill required', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-paid-missing', totalAmount: '80', paidTotal: '20' }],
      journals: [{ sourceId: 'er-paid-missing', amount: '80' }],
      paymentRows: [{ id: 'ep-missing', expenseRequestId: 'er-paid-missing', amount: '20' }],
      paymentJournals: [],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        expensePaymentId: 'ep-missing',
        status: 'BACKFILL_REQUIRED',
        blockerCodes: ['EXPENSE_PAYMENT_BACKFILL_MISSING'],
      }),
    );
    expect(component(report, 'expensePaid').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '20', journalValue: '0', delta: '-20', status: 'MISMATCH' }),
    );
    expect(report.blockerCodes).toEqual(
      expect.arrayContaining(['EXPENSE_PAYMENT_BACKFILL_MISSING', 'EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH']),
    );
  });

  it('reports ExpensePayment value mismatch evidence and summary blocker', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-paid-mismatch', totalAmount: '90', paidTotal: '25' }],
      journals: [{ sourceId: 'er-paid-mismatch', amount: '90' }],
      paymentRows: [{ id: 'ep-mismatch', expenseRequestId: 'er-paid-mismatch', amount: '25' }],
      paymentJournals: [{ sourceId: 'ep-mismatch', amount: '15', expenseRequestId: 'er-paid-mismatch' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'VALUE_MISMATCH',
        legacyValue: '25',
        journalValue: '15',
        delta: '-10',
        blockerCodes: ['EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH'],
      }),
    );
    expect(component(report, 'expensePaid').valueComparison).toEqual(
      expect.objectContaining({ status: 'MISMATCH', blockerReason: 'EXPENSE_PAYMENT_VALUE_SHADOW_MISMATCH' }),
    );
  });

  it('reports ExpensePayment dimension mismatch evidence', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-paid-dimension', totalAmount: '70', paidTotal: '30' }],
      journals: [{ sourceId: 'er-paid-dimension', amount: '70' }],
      paymentRows: [{ id: 'ep-dimension', expenseRequestId: 'er-paid-dimension', amount: '30' }],
      paymentJournals: [{ sourceId: 'ep-dimension', amount: '30', expenseRequestId: 'er-paid-dimension', clientId: 'client-other' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'DIMENSION_MISMATCH',
        blockerCodes: ['EXPENSE_PAYMENT_DIMENSION_MISMATCH'],
        details: expect.objectContaining({ clientId: 'client-1', journalClientId: 'client-other' }),
      }),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['EXPENSE_PAYMENT_DIMENSION_MISMATCH']));
  });

  it('blocks ExpensePayment reversal/refund policy evidence', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-paid-refund', totalAmount: '60', paidTotal: '20' }],
      journals: [{ sourceId: 'er-paid-refund', amount: '60' }],
      paymentRows: [{ id: 'ep-refund', expenseRequestId: 'er-paid-refund', amount: '20' }],
      paymentJournals: [{ sourceId: 'ep-refund', sourceAction: 'refund', amount: '20', expenseRequestId: 'er-paid-refund' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'REVERSAL_REFUND_POLICY_BLOCKED',
        blockerCodes: ['EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING'],
        details: expect.objectContaining({
          sourceAction: 'refund',
          policyReason: 'EXPENSE_PAYMENT_REVERSAL_REFUND_DOMAIN_POLICY_MISSING',
        }),
      }),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['EXPENSE_PAYMENT_REVERSAL_REFUND_POLICY_MISSING']));
  });

  it('blocks ExpensePayment with cancelled parent request', async () => {
    const prisma = buildPrismaMock([], {
      cancelled: [{ id: 'er-cancelled-payment', totalAmount: '50', paidTotal: '20', status: 'CANCELLED' }],
      journals: [{ sourceId: 'er-cancelled-payment', amount: '50' }],
      paymentRows: [{ id: 'ep-cancelled-parent', expenseRequestId: 'er-cancelled-payment', amount: '20', status: 'CANCELLED' }],
      paymentJournals: [{ sourceId: 'ep-cancelled-parent', amount: '20', expenseRequestId: 'er-cancelled-payment' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expensePaymentBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'PARENT_CANCELLED_BLOCKED',
        blockerCodes: ['EXPENSE_PAYMENT_PARENT_CANCELLED_BLOCKED'],
        details: expect.objectContaining({ parentStatus: 'CANCELLED' }),
      }),
    );
    expect(component(report, 'expensePaid').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '0', journalValue: '0', delta: '0', status: 'MATCH' }),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['EXPENSE_PAYMENT_PARENT_CANCELLED_BLOCKED']));
  });

  it('reports expenseUnpaid journal-derived offset and reimbursement breakdown', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-unpaid', totalAmount: '100', paidTotal: '20' }],
      journals: [{ sourceId: 'er-unpaid', amount: '100' }],
      paymentRows: [{ id: 'ep-unpaid', expenseRequestId: 'er-unpaid', amount: '20' }],
      paymentJournals: [{ sourceId: 'ep-unpaid', amount: '20', expenseRequestId: 'er-unpaid' }],
      offsetApplications: [
        { expenseRequestId: 'er-unpaid', kind: 'APPLY', amount: '10' },
        { expenseRequestId: 'er-unpaid', kind: 'REVERSAL', amount: '2' },
      ],
      reimbursementApplications: [
        { id: 'app-unpaid', expenseRequestId: 'er-unpaid', kind: 'APPLY', amount: '5' },
        { id: 'app-unpaid-reversal', expenseRequestId: 'er-unpaid', kind: 'REVERSAL', amount: '1' },
      ],
      reimbursementApplicationJournals: [
        { sourceId: 'app-unpaid', kind: 'APPLY', amount: '5', expenseRequestId: 'er-unpaid' },
        { sourceId: 'app-unpaid-reversal', kind: 'REVERSAL', amount: '1', expenseRequestId: 'er-unpaid' },
      ],
      adjustmentLines: [
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', direction: 'CREDIT', amount: '10' },
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal', direction: 'DEBIT', amount: '2' },
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'apply', direction: 'CREDIT', amount: '5' },
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'reversal', direction: 'DEBIT', amount: '1' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseUnpaidBreakdown).toEqual(
      expect.objectContaining({
        legacyValue: '68',
        requestedJournalValue: '100',
        paidJournalValue: '20',
        offsetAppliedJournalValue: '10',
        offsetReversalJournalValue: '2',
        reimbursementAppliedJournalValue: '5',
        reimbursementReversalJournalValue: '1',
        journalValue: '68',
        delta: '0',
        blockerCodes: [],
      }),
    );
    expect(component(report, 'expenseUnpaid').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '68', journalValue: '68', delta: '0', status: 'MATCH', blockerCodes: [] }),
    );
    expect(component(report, 'expenseUnpaid').blockerCodes).not.toContain('EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS');
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });
  it('reports matched reimbursement application backfill evidence and value shadow', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-reimbursed', totalAmount: '100', paidTotal: '20' }],
      journals: [{ sourceId: 'er-reimbursed', amount: '100' }],
      paymentRows: [{ id: 'ep-reimbursed', expenseRequestId: 'er-reimbursed', amount: '20' }],
      paymentJournals: [{ sourceId: 'ep-reimbursed', amount: '20', expenseRequestId: 'er-reimbursed' }],
      reimbursementApplications: [{ id: 'app-reimbursed', expenseRequestId: 'er-reimbursed', amount: '5', collectionDispositionLineId: 'line-app-reimbursed' }],
      reimbursementApplicationJournals: [{ sourceId: 'app-reimbursed', amount: '5', expenseRequestId: 'er-reimbursed', dispositionLineId: 'line-app-reimbursed' }],
      adjustmentLines: [
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'apply', direction: 'CREDIT', amount: '5' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseReimbursementApplicationBackfillEvidence).toEqual(
      expect.objectContaining({
        sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
        sourceActions: ['apply', 'reversal'],
        statusCounts: expect.objectContaining({ MATCHED: 1, BACKFILL_REQUIRED: 0, VALUE_MISMATCH: 0, DIMENSION_MISMATCH: 0 }),
        blockerCodes: [],
      }),
    );
    expect(report.expenseReimbursementApplicationBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'MATCHED',
        legacyValue: '5',
        journalValue: '5',
        delta: '0',
        blockerCodes: [],
        details: expect.objectContaining({ sourceAction: 'apply', journalDispositionLineId: 'line-app-reimbursed' }),
      }),
    );
    expect(report.expenseReimbursementApplicationComparison).toEqual(
      expect.objectContaining({ legacyValue: '5', journalValue: '5', delta: '0', status: 'MATCH', blockerCodes: [] }),
    );
    expect(report.expenseUnpaidBreakdown?.blockerCodes).not.toEqual(expect.arrayContaining(['EXPENSE_REIMBURSEMENT_APPLICATION_BACKFILL_MISSING']));
    expect(report.expenseUnpaidBreakdown?.blockerCodes).not.toEqual(expect.arrayContaining(['EXPENSE_REIMBURSEMENT_APPLICATION_VALUE_SHADOW_MISMATCH']));
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });

  it('blocks reimbursement application backfill evidence when journal is missing', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-reimbursement-missing', totalAmount: '100', paidTotal: '0' }],
      journals: [{ sourceId: 'er-reimbursement-missing', amount: '100' }],
      reimbursementApplications: [{ id: 'app-missing', expenseRequestId: 'er-reimbursement-missing', amount: '12', collectionDispositionLineId: 'line-app-missing' }],
      adjustmentLines: [
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'apply', direction: 'CREDIT', amount: '12' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseReimbursementApplicationBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'BACKFILL_REQUIRED',
        blockerCodes: ['EXPENSE_REIMBURSEMENT_APPLICATION_BACKFILL_MISSING'],
        journalEntryId: null,
      }),
    );
    expect(report.expenseUnpaidBreakdown?.blockerCodes).toEqual(
      expect.arrayContaining(['EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS', 'EXPENSE_REIMBURSEMENT_APPLICATION_BACKFILL_MISSING']),
    );
  });

  it('blocks reimbursement application value shadow mismatch', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-reimbursement-mismatch', totalAmount: '100', paidTotal: '0' }],
      journals: [{ sourceId: 'er-reimbursement-mismatch', amount: '100' }],
      reimbursementApplications: [{ id: 'app-mismatch', expenseRequestId: 'er-reimbursement-mismatch', amount: '12', collectionDispositionLineId: 'line-app-mismatch' }],
      reimbursementApplicationJournals: [{ sourceId: 'app-mismatch', amount: '10', expenseRequestId: 'er-reimbursement-mismatch', dispositionLineId: 'line-app-mismatch' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseReimbursementApplicationBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'VALUE_MISMATCH',
        legacyValue: '12',
        journalValue: '10',
        delta: '-2',
        blockerCodes: ['EXPENSE_REIMBURSEMENT_APPLICATION_VALUE_SHADOW_MISMATCH'],
      }),
    );
    expect(report.expenseReimbursementApplicationComparison).toEqual(
      expect.objectContaining({ legacyValue: '12', journalValue: '10', delta: '-2', status: 'MISMATCH' }),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['EXPENSE_REIMBURSEMENT_APPLICATION_VALUE_SHADOW_MISMATCH']));
  });
  it('blocks reimbursement application dimension mismatch and derives expenseUnpaid blocker', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-reimbursement-dimension', totalAmount: '100', paidTotal: '0' }],
      journals: [{ sourceId: 'er-reimbursement-dimension', amount: '100' }],
      reimbursementApplications: [{ id: 'app-dimension', expenseRequestId: 'er-reimbursement-dimension', amount: '12', collectionDispositionLineId: 'line-app-dimension' }],
      reimbursementApplicationJournals: [{ sourceId: 'app-dimension', amount: '12', expenseRequestId: 'er-reimbursement-dimension', dispositionLineId: 'wrong-line' }],
      adjustmentLines: [
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'apply', direction: 'CREDIT', amount: '12' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.expenseReimbursementApplicationBackfillEvidence?.items[0]).toEqual(
      expect.objectContaining({
        status: 'DIMENSION_MISMATCH',
        legacyValue: '12',
        journalValue: '12',
        delta: '0',
        blockerCodes: ['EXPENSE_REIMBURSEMENT_APPLICATION_DIMENSION_MISMATCH'],
        details: expect.objectContaining({ journalDispositionLineId: 'wrong-line' }),
      }),
    );
    expect(report.expenseUnpaidBreakdown).toEqual(
      expect.objectContaining({
        legacyValue: '88',
        journalValue: '88',
        delta: '0',
        blockerCodes: expect.arrayContaining([
          'EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS',
          'EXPENSE_REIMBURSEMENT_APPLICATION_DIMENSION_MISMATCH',
        ]),
      }),
    );
  });

  it('keeps expense shadow queries currency-scoped for primary reader parity risk', async () => {
    const prisma = buildPrismaMock([], {
      active: [{ id: 'er-currency', totalAmount: '100', paidTotal: '0', currency: 'USD' }],
      journals: [{ sourceId: 'er-currency', amount: '100', currency: 'USD' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      currency: 'USD',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(prisma.expenseRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1', clientId: 'client-1', currency: 'USD' }),
      }),
    );
    expect(prisma.clientOffset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1', currency: 'USD' }),
      }),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
    expect(report.primarySwitchUnchanged).toBe(true);
  });
  it('reports CollectionDispositionLine replay eligibility and informational lifecycle evidence', async () => {
    const prisma = buildPrismaMock([], undefined, {
      dispositionLines: [{ id: 'line-1', type: 'CLIENT_PAYABLE', amount: '125' }],
      collections: [{ id: 'collection-1', status: 'CONFIRMED' }],
      dispositions: [{ id: 'disp-held', status: 'HELD_PENDING_DISTRIBUTION' }],
      journalEntries: [{ sourceType: 'COLLECTION_DISPOSITION_LINE', sourceId: 'line-1', id: 'journal-line-1' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.replayEvidence?.pendingDistribution).toEqual(
      expect.objectContaining({
        sourceType: 'COLLECTION_DISPOSITION_LINE',
        sourceAction: 'posted',
        sourceVersionEvidence: 'postedAt/sourceId/idempotencyKey',
        statusCounts: expect.objectContaining({ REPLAY_ELIGIBLE: 1 }),
        blockerCodes: [],
      }),
    );
    expect(report.replayEvidence?.pendingDistribution.lineItems[0]).toEqual(
      expect.objectContaining({
        dispositionLineId: 'line-1',
        status: 'REPLAY_ELIGIBLE',
        blockerCodes: [],
        journalEntryId: 'journal-line-1',
      }),
    );
    expect(report.replayEvidence?.pendingDistribution.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'COLLECTION',
          status: 'BRIDGE_EVENT_ONLY',
          blockerCodes: [],
          details: expect.objectContaining({ effect: 'NO_DIRECT_CLIENT_EFFECT', sourceStatus: 'CONFIRMED' }),
        }),
        expect.objectContaining({
          sourceType: 'COLLECTION_DISPOSITION',
          status: 'NON_FINANCIAL_LIFECYCLE',
          blockerCodes: [],
          details: expect.objectContaining({ effect: 'NON_FINANCIAL_LIFECYCLE', sourceStatus: 'HELD_PENDING_DISTRIBUTION' }),
        }),
      ]),
    );
    expect(report.collectionCashReceiptBackfillEvidence?.blockerCodes).toEqual(['COLLECTION_CASH_RECEIPT_BACKFILL_MISSING']);
    expect(report.summaryPrimarySwitchReadiness.collectionCashReceiptEvidenceStatus).toBe('BLOCKED');
    expect(report.summaryPrimarySwitchReadiness.rawCollectionJournalSource).toEqual(
      expect.objectContaining({
        status: 'EVIDENCE_BLOCKED',
        blockerCodes: expect.arrayContaining([
          'COLLECTION_CASH_RECEIPT_BACKFILL_MISSING',
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
        ]),
      }),
    );
    expect(report.summaryPrimarySwitchReadiness.blockerCodes).toContain('COLLECTION_CASH_RECEIPT_BACKFILL_MISSING');
    expect(report.summaryPrimarySwitchReadiness.blockerCodes).not.toContain('COLLECTION_JOURNAL_SOURCE_MISSING');
    expect(component(report, 'pendingDistribution').blockerCodes).toContain('CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING');
    expect(component(report, 'pendingDistribution').blockerCodes).toContain('COLLECTION_CASH_RECEIPT_BACKFILL_MISSING');
    expect(component(report, 'pendingDistribution').blockerCodes).not.toEqual(
      expect.arrayContaining([
        'COLLECTION_RAW_SOURCE_BLOCKED',
        'COLLECTION_DISPOSITION_LIFECYCLE_BLOCKED',
        'COLLECTION_REFUND_POLICY_UNMAPPED',
      ]),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });

  it('reports Collection cash receipt historical missing original and reversal evidence blockers', async () => {
    const prisma = buildPrismaMock([], undefined, {
      collections: [
        { id: 'collection-missing', amount: '100' },
        { id: 'collection-cancelled', status: 'CANCELLED', amount: '75', cancelledAt: DEFAULT_REPLAY_DATE },
      ],
      journalEntries: [
        collectionCashJournal({ sourceId: 'collection-cancelled', action: 'recorded', amount: '75' }),
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.collectionCashReceiptBackfillEvidence).toEqual(
      expect.objectContaining({
        sourceType: 'COLLECTION',
        statusCounts: expect.objectContaining({ BACKFILL_REQUIRED: 1, REVERSAL_BACKFILL_REQUIRED: 1 }),
        blockerCodes: expect.arrayContaining([
          'COLLECTION_CASH_RECEIPT_BACKFILL_MISSING',
          'COLLECTION_CASH_RECEIPT_REVERSAL_BACKFILL_MISSING',
        ]),
      }),
    );
    expect(report.collectionCashReceiptBackfillEvidence?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionId: 'collection-missing',
          status: 'BACKFILL_REQUIRED',
          blockerCodes: ['COLLECTION_CASH_RECEIPT_BACKFILL_MISSING'],
        }),
        expect.objectContaining({
          collectionId: 'collection-cancelled',
          status: 'REVERSAL_BACKFILL_REQUIRED',
          recordedJournalEntryId: 'journal-collection-cancelled-recorded',
          reversalJournalEntryId: null,
          blockerCodes: ['COLLECTION_CASH_RECEIPT_REVERSAL_BACKFILL_MISSING'],
        }),
      ]),
    );
    expect(report.replayEvidence?.blockerCodes).toEqual(
      expect.arrayContaining([
        'COLLECTION_CASH_RECEIPT_BACKFILL_MISSING',
        'COLLECTION_CASH_RECEIPT_REVERSAL_BACKFILL_MISSING',
      ]),
    );
    expect(report.blockerCodes).toEqual(
      expect.arrayContaining([
        'COLLECTION_CASH_RECEIPT_BACKFILL_MISSING',
        'COLLECTION_CASH_RECEIPT_REVERSAL_BACKFILL_MISSING',
      ]),
    );
    expect(report.summaryPrimarySwitchReadiness.collectionCashReceiptEvidenceStatus).toBe('BLOCKED');
    expect(report.summaryPrimarySwitchReadiness.rawCollectionJournalSource).toEqual(
      expect.objectContaining({
        status: 'EVIDENCE_BLOCKED',
        blockerCodes: expect.arrayContaining([
          'COLLECTION_CASH_RECEIPT_BACKFILL_MISSING',
          'COLLECTION_CASH_RECEIPT_REVERSAL_BACKFILL_MISSING',
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
        ]),
      }),
    );
    expect(report.summaryPrimarySwitchReadiness.blockerCodes).not.toContain('COLLECTION_JOURNAL_SOURCE_MISSING');
  });

  it('reports Collection cash receipt value and dimension mismatch evidence blockers', async () => {
    const prisma = buildPrismaMock([], undefined, {
      collections: [
        { id: 'collection-value-mismatch', amount: '100' },
        { id: 'collection-dimension-mismatch', amount: '40' },
      ],
      journalEntries: [
        collectionCashJournal({ sourceId: 'collection-value-mismatch', action: 'recorded', amount: '100', cashAmount: '99' }),
        collectionCashJournal({ sourceId: 'collection-dimension-mismatch', action: 'recorded', amount: '40', clearingCaseId: 'other-case' }),
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.collectionCashReceiptBackfillEvidence?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionId: 'collection-value-mismatch',
          status: 'VALUE_MISMATCH',
          blockerCodes: ['COLLECTION_CASH_RECEIPT_VALUE_MISMATCH'],
        }),
        expect.objectContaining({
          collectionId: 'collection-dimension-mismatch',
          status: 'DIMENSION_MISMATCH',
          blockerCodes: ['COLLECTION_CASH_RECEIPT_DIMENSION_MISMATCH'],
        }),
      ]),
    );
    expect(report.collectionCashReceiptBackfillEvidence?.blockerCodes).toEqual(
      expect.arrayContaining([
        'COLLECTION_CASH_RECEIPT_VALUE_MISMATCH',
        'COLLECTION_CASH_RECEIPT_DIMENSION_MISMATCH',
      ]),
    );
    expect(report.summaryPrimarySwitchReadiness.collectionCashReceiptEvidenceStatus).toBe('BLOCKED');
    expect(report.summaryPrimarySwitchReadiness.rawCollectionJournalSource).toEqual(
      expect.objectContaining({
        status: 'EVIDENCE_BLOCKED',
        blockerCodes: expect.arrayContaining([
          'COLLECTION_CASH_RECEIPT_VALUE_MISMATCH',
          'COLLECTION_CASH_RECEIPT_DIMENSION_MISMATCH',
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
        ]),
      }),
    );
    expect(report.summaryPrimarySwitchReadiness.blockerCodes).not.toContain('COLLECTION_JOURNAL_SOURCE_MISSING');
  });
  it('blocks refunded Collection lifecycle as unmapped refund policy evidence', async () => {
    const prisma = buildPrismaMock([], undefined, {
      collections: [{ id: 'collection-refund', status: 'REFUNDED' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.collectionCashReceiptBackfillEvidence).toEqual(
      expect.objectContaining({
        statusCounts: expect.objectContaining({ REFUND_POLICY_BLOCKED: 1 }),
        blockerCodes: ['COLLECTION_REFUND_POLICY_UNMAPPED'],
      }),
    );
    expect(report.replayEvidence?.pendingDistribution.blockerCodes).toEqual(['COLLECTION_REFUND_POLICY_UNMAPPED']);
    expect(report.replayEvidence?.pendingDistribution.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'COLLECTION',
          sourceId: 'collection-refund',
          status: 'REFUND_POLICY_BLOCKED',
          blockerCodes: ['COLLECTION_REFUND_POLICY_UNMAPPED'],
          details: expect.objectContaining({ effect: 'REFUND_POLICY_UNMAPPED', sourceStatus: 'REFUNDED' }),
        }),
      ]),
    );
    expect(component(report, 'pendingDistribution').blockerCodes).toEqual(
      expect.arrayContaining([
        'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
        'COLLECTION_REFUND_POLICY_UNMAPPED',
      ]),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['COLLECTION_REFUND_POLICY_UNMAPPED']));
    expect(report.summaryPrimarySwitchReadiness.collectionCashReceiptEvidenceStatus).toBe('BLOCKED');
    expect(report.summaryPrimarySwitchReadiness.rawCollectionJournalSource).toEqual(
      expect.objectContaining({
        status: 'EVIDENCE_BLOCKED',
        blockerCodes: expect.arrayContaining([
          'COLLECTION_REFUND_POLICY_UNMAPPED',
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
        ]),
      }),
    );
    expect(report.summaryPrimarySwitchReadiness.blockerCodes).not.toContain('COLLECTION_JOURNAL_SOURCE_MISSING');
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });
  it('blocks manual reversal and unmapped CollectionDispositionLine replay evidence', async () => {
    const prisma = buildPrismaMock([], undefined, {
      dispositionLines: [
        {
          id: 'line-manual',
          type: 'CLIENT_PAYABLE',
          amount: '50',
          manualReversalRequiredAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        { id: 'line-other', type: 'OTHER', amount: '25' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.replayEvidence?.pendingDistribution.statusCounts).toEqual(
      expect.objectContaining({ MANUAL_REVERSAL_BLOCKED: 1, UNMAPPED_LINE_BLOCKED: 1 }),
    );
    expect(report.replayEvidence?.pendingDistribution.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dispositionLineId: 'line-manual',
          status: 'MANUAL_REVERSAL_BLOCKED',
          blockerCodes: ['COLLECTION_DISPOSITION_LINE_MANUAL_REVERSAL_BLOCKED'],
        }),
        expect.objectContaining({
          dispositionLineId: 'line-other',
          status: 'UNMAPPED_LINE_BLOCKED',
          blockerCodes: ['COLLECTION_DISPOSITION_LINE_UNMAPPED_BLOCKED'],
        }),
      ]),
    );
    expect(report.blockerCodes).toEqual(
      expect.arrayContaining([
        'COLLECTION_DISPOSITION_LINE_MANUAL_REVERSAL_BLOCKED',
        'COLLECTION_DISPOSITION_LINE_UNMAPPED_BLOCKED',
      ]),
    );
  });

  it('reports BalanceLedger replay eligibility, correlated suppression, and unmapped blockers', async () => {
    const prisma = buildPrismaMock([], undefined, {
      balanceLedgers: [
        { id: 'ledger-credit', type: 'CREDIT', amount: '100', source: 'manual', sourceId: 'manual-1' },
        { id: 'ledger-debit', type: 'DEBIT', amount: '40', source: 'manual', sourceId: 'manual-2' },
        { id: 'ledger-correlated', type: 'CREDIT', amount: '30', source: 'disposition_line:line-1', sourceId: 'line-1' },
        { id: 'ledger-adjust', type: 'ADJUST', amount: '10', source: 'manual', sourceId: 'manual-3' },
        { id: 'ledger-refund', type: 'REFUND', amount: '15', source: 'manual', sourceId: 'manual-4' },
      ],
      journalEntries: [
        { sourceType: 'BALANCE_LEDGER', sourceId: 'ledger-credit', id: 'journal-ledger-credit' },
        { sourceType: 'BALANCE_LEDGER', sourceId: 'ledger-debit', id: 'journal-ledger-debit' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.replayEvidence?.advanceBalance).toEqual(
      expect.objectContaining({
        sourceType: 'BALANCE_LEDGER',
        sourceAction: 'posted',
        sourceVersionEvidence: 'createdAt/sourceId/idempotencyKey',
        statusCounts: expect.objectContaining({
          REPLAY_ELIGIBLE: 2,
          CORRELATED_DISPOSITION_LINE_SUPPRESSED: 1,
          UNMAPPED_LEDGER_BLOCKED: 2,
        }),
        blockerCodes: expect.arrayContaining([
          'BALANCE_LEDGER_CORRELATED_DISPOSITION_LINE_SUPPRESSED',
          'BALANCE_LEDGER_ADJUST_REFUND_UNMAPPED',
        ]),
      }),
    );
    expect(report.replayEvidence?.advanceBalance.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ balanceLedgerId: 'ledger-credit', status: 'REPLAY_ELIGIBLE', journalEntryId: 'journal-ledger-credit' }),
        expect.objectContaining({ balanceLedgerId: 'ledger-debit', status: 'REPLAY_ELIGIBLE', journalEntryId: 'journal-ledger-debit' }),
        expect.objectContaining({
          balanceLedgerId: 'ledger-correlated',
          status: 'CORRELATED_DISPOSITION_LINE_SUPPRESSED',
          blockerCodes: ['BALANCE_LEDGER_CORRELATED_DISPOSITION_LINE_SUPPRESSED'],
        }),
        expect.objectContaining({
          balanceLedgerId: 'ledger-adjust',
          status: 'UNMAPPED_LEDGER_BLOCKED',
          blockerCodes: ['BALANCE_LEDGER_ADJUST_REFUND_UNMAPPED'],
        }),
        expect.objectContaining({
          balanceLedgerId: 'ledger-refund',
          status: 'UNMAPPED_LEDGER_BLOCKED',
          blockerCodes: ['BALANCE_LEDGER_ADJUST_REFUND_UNMAPPED'],
        }),
      ]),
    );
    expect(component(report, 'advanceBalance').blockerCodes).toEqual(
      expect.arrayContaining([
        'CASE_BALANCE_SNAPSHOT_REPLAY_UNVERIFIED',
        'BALANCE_LEDGER_CORRELATED_DISPOSITION_LINE_SUPPRESSED',
        'BALANCE_LEDGER_ADJUST_REFUND_UNMAPPED',
      ]),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });
  it('leaves gap and blocker components value-uncomputed while comparing supported components', async () => {
    const prisma = buildPrismaMock([
      { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted', amount: '100' },
    ]);

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '100', paidToClient: '0', offsetApplied: '0' },
    });

    expect(component(report, 'payableNet').valueComparison).toEqual(
      expect.objectContaining({ journalValue: '100', status: 'MATCH' }),
    );
    expect(component(report, 'expenseRequested').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '0', journalValue: '0', delta: '0', status: 'MATCH' }),
    );
    expect(component(report, 'expensePaid').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '0', journalValue: '0', delta: '0', status: 'MATCH' }),
    );
    expect(component(report, 'expenseUnpaid').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '0', journalValue: '0', delta: '0', status: 'MATCH' }),
    );
    expect(component(report, 'debtorCollection').valueComparison).toBeUndefined();
    expect(component(report, 'advanceBalance').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '0', journalValue: '0', delta: '0', status: 'MATCH' }),
    );
  });
  it('reports client-scoped primary reader parity evidence while keeping case-scoped blockers', async () => {
    const prisma = buildPrismaMock([
      { sourceType: 'COLLECTION_DISPOSITION_LINE', sourceAction: 'posted', amount: '150' },
      { sourceType: 'CLIENT_PAYOUT', sourceAction: 'recorded', amount: '20' },
      { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', amount: '10' },
      { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal', amount: '5' },
    ], {
      active: [{ id: 'er-reader', totalAmount: '100', paidTotal: '20' }],
      journals: [{ sourceId: 'er-reader', amount: '100' }],
      paymentRows: [{ id: 'ep-reader', expenseRequestId: 'er-reader', amount: '20' }],
      paymentJournals: [{ sourceId: 'ep-reader', amount: '20', expenseRequestId: 'er-reader' }],
      offsetApplications: [
        { expenseRequestId: 'er-reader', kind: 'APPLY', amount: '10' },
        { expenseRequestId: 'er-reader', kind: 'REVERSAL', amount: '2' },
      ],
      reimbursementApplications: [
        { id: 'app-apply-reader', expenseRequestId: 'er-reader', kind: 'APPLY', amount: '5', collectionDispositionLineId: 'line-apply-reader' },
        { id: 'app-reversal-reader', expenseRequestId: 'er-reader', kind: 'REVERSAL', amount: '1', collectionDispositionLineId: 'line-reversal-reader', reversesApplicationId: 'app-apply-reader' },
      ],
      reimbursementApplicationJournals: [
        { sourceId: 'app-apply-reader', kind: 'APPLY', amount: '5', expenseRequestId: 'er-reader', dispositionLineId: 'line-apply-reader' },
        { sourceId: 'app-reversal-reader', kind: 'REVERSAL', sourceAction: 'reversal', amount: '1', expenseRequestId: 'er-reader', dispositionLineId: 'line-reversal-reader' },
      ],
      adjustmentLines: [
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'apply', direction: 'CREDIT', amount: '10' },
        { sourceType: 'CLIENT_OFFSET', sourceAction: 'reversal', direction: 'DEBIT', amount: '2' },
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'apply', direction: 'CREDIT', amount: '5' },
        { sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION', sourceAction: 'reversal', direction: 'DEBIT', amount: '1' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '125', paidToClient: '20', offsetApplied: '5' },
    });

    expect(report.clientScopedPrimaryReaderEvidence).toEqual(
      expect.objectContaining({
        sourceVersion: 'acct-cutover-3e4b2f1-client-scoped-journal-summary-reader-v1',
        readerSource: 'ACCOUNTING_JOURNAL_CLIENT_SCOPED',
        status: 'BLOCKED',
        values: {
          payableNet: '125',
          paidToClient: '20',
          offsetApplied: '5',
          expenseRequested: '100',
          expensePaid: '20',
          expenseUnpaid: '68',
        },
        comparedComponents: expect.arrayContaining(['payableNet', 'paidToClient', 'offsetApplied', 'expenseRequested', 'expensePaid', 'expenseUnpaid']),
        unsupportedResponsePaths: expect.arrayContaining([
          'caseScopedContext.debtorCollection',
          'caseScopedContext.pendingDistribution',
          'caseScopedContext.advanceBalance',
          'caseBreakdown',
          'needsReview',
        ]),
        blockerCodes: expect.arrayContaining([
          'CLIENT_ACCOUNTING_SUMMARY_CASE_SCOPED_PRIMARY_READER_MISSING',
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
          'CASE_BALANCE_SNAPSHOT_REPLAY_UNVERIFIED',
        ]),
      }),
    );
    expect(report.clientScopedPrimaryReaderEvidence?.comparisons.expenseUnpaid).toEqual(
      expect.objectContaining({ legacyValue: '68', journalValue: '68', delta: '0', status: 'MATCH', blockerCodes: [] }),
    );
    expect(report.summaryPrimarySwitchReadiness).toEqual(
      expect.objectContaining({
        sourceVersion: 'acct-cutover-3e4b2f3a-summary-primary-switch-readiness-v1',
        status: 'BLOCKED',
        primarySwitchUnchanged: true,
        safeForPrimaryCutover: false,
        primarySwitchBlockerReason: 'RAW_COLLECTION_AND_CASE_SCOPED_SUMMARY_NOT_JOURNAL_DERIVED',
        clientScopedParity: { status: 'MATCH', blockerCodes: [] },
        hybridPrimaryBoundary: expect.objectContaining({
          sourceVersion: 'acct-cutover-3e4b2g1-summary-hybrid-primary-boundary-v1',
          mode: 'CLIENT_SCOPED_JOURNAL_WITH_CASE_SCOPED_LEGACY_CONTEXT',
          clientScopedSource: 'ACCOUNTING_JOURNAL_SHADOW',
          caseScopedContextSource: 'LEGACY_CONTEXT',
          journalOnlyPrimarySwitch: 'BLOCKED',
          fallbackResponsePaths: expect.arrayContaining([
            'caseScopedContext.debtorCollection',
            'caseScopedContext.pendingDistribution',
            'caseScopedContext.advanceBalance',
          ]),
        }),
        collectionCashReceiptEvidenceStatus: 'CLEAN',
        rawCollectionJournalSource: {
          requiredFor: 'caseScopedContext.debtorCollection',
          status: 'EVIDENCE_CLEAN',
          blockerCodes: ['CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING'],
        },
        blockerCodes: expect.arrayContaining([
          'JOURNAL_DERIVED_CLIENT_ACCOUNTING_SUMMARY_READER_MISSING',
          'CLIENT_ACCOUNTING_SUMMARY_CASE_SCOPED_PRIMARY_READER_MISSING',
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
          'CASE_BALANCE_SNAPSHOT_REPLAY_UNVERIFIED',
          'SUMMARY_DERIVED_FROM_BLOCKED_PENDING_DISTRIBUTION',
          'SUMMARY_JOURNAL_ONLY_PRIMARY_SWITCH_BLOCKED_BY_LEGACY_CONTEXT',
        ]),
        gapCodes: [],
      }),
    );
    expect(report.summaryHybridPrimaryBoundary).toEqual(
      expect.objectContaining({
        mode: 'CLIENT_SCOPED_JOURNAL_WITH_CASE_SCOPED_LEGACY_CONTEXT',
        caseScopedContextSource: 'LEGACY_CONTEXT',
        journalOnlyPrimarySwitch: 'BLOCKED',
        primarySwitchUnchanged: true,
        safeForPrimaryCutover: false,
        blockerCodes: expect.arrayContaining([
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
          'SUMMARY_JOURNAL_ONLY_PRIMARY_SWITCH_BLOCKED_BY_LEGACY_CONTEXT',
        ]),
      }),
    );
    expect(report.summaryHybridPrimaryBoundary.blockerCodes).not.toContain('COLLECTION_JOURNAL_SOURCE_MISSING');
    expect(report.summaryPrimarySwitchReadiness.collectionCashReceiptEvidenceStatus).toBe('CLEAN');
    expect(report.summaryPrimarySwitchReadiness.rawCollectionJournalSource).toEqual(
      expect.objectContaining({
        status: 'EVIDENCE_CLEAN',
        blockerCodes: ['CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING'],
      }),
    );
    expect(report.summaryPrimarySwitchReadiness.blockerCodes).not.toContain('COLLECTION_JOURNAL_SOURCE_MISSING');
    expect(report.summaryPrimarySwitchReadiness.caseScopedReadiness).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        contextSource: 'LEGACY_CONTEXT',
        unsupportedResponsePaths: expect.arrayContaining([
          'caseScopedContext.debtorCollection',
          'caseScopedContext.pendingDistribution',
          'caseScopedContext.advanceBalance',
          'caseBreakdown',
          'needsReview',
        ]),
      }),
    );
    expect(component(report, 'debtorCollection').valueComparison).toBeUndefined();
    expect(component(report, 'advanceBalance').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '0', journalValue: '0', delta: '0', status: 'MATCH' }),
    );
    expect(report.blockerCodes).toEqual(expect.arrayContaining(['CLIENT_ACCOUNTING_SUMMARY_CASE_SCOPED_PRIMARY_READER_MISSING']));
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
    expect(report.primarySwitchUnchanged).toBe(true);
  });
  it('reports case-scoped primary reader evidence while narrowing clean Collection cash source blockers', async () => {
    const prisma = buildPrismaMock([], undefined, {
      collections: [{ id: 'collection-case', amount: '1000' }],
      dispositions: [{ id: 'disp-posted', status: 'POSTED', totalAmount: '400' }],
      journalEntries: [collectionCashJournal({ sourceId: 'collection-case', action: 'recorded', amount: '1000' })],
      caseBalances: [{ balance: '75' }],
      caseScopedJournalLines: [
        { sourceType: 'COLLECTION_DISPOSITION_LINE', accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '300' },
        { sourceType: 'COLLECTION_DISPOSITION_LINE', accountCode: 'ATTORNEY_FEE_REVENUE', direction: 'CREDIT', amount: '100' },
        { sourceType: 'BALANCE_LEDGER', accountCode: 'CLIENT_ADVANCE_BALANCE', direction: 'CREDIT', amount: '100' },
        { sourceType: 'BALANCE_LEDGER', accountCode: 'CLIENT_ADVANCE_BALANCE', direction: 'DEBIT', amount: '25' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.caseScopedPrimaryReaderEvidence).toEqual(
      expect.objectContaining({
        sourceVersion: 'acct-cutover-3e4b2f2a-case-scoped-summary-reader-evidence-v1',
        readerSource: 'ACCOUNTING_JOURNAL_CASE_SCOPED_SHADOW',
        caseScopedContextSource: 'LEGACY_CONTEXT',
        journalOnlySourceStatus: 'NOT_JOURNAL_DERIVED',
        status: 'BLOCKED',
        values: expect.objectContaining({
          debtorCollectionLegacyValue: '1000',
          postedDispositionLegacyValue: '400',
          postedDispositionJournalValue: '400',
          pendingDistributionLegacyValue: '600',
          pendingDistributionJournalValue: '600',
          advanceBalanceLegacyValue: '75',
          advanceBalanceJournalValue: '75',
        }),
        unsupportedResponsePaths: [
          'caseScopedContext.debtorCollection',
          'caseScopedContext.pendingDistribution',
          'caseScopedContext.advanceBalance',
          'caseBreakdown',
          'needsReview',
        ],
        blockerCodes: expect.arrayContaining([
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
          'CLIENT_ACCOUNTING_SUMMARY_CASE_SCOPED_PRIMARY_READER_MISSING',
        ]),
      }),
    );
    expect(report.caseScopedPrimaryReaderEvidence?.comparisons.pendingDistribution).toEqual(
      expect.objectContaining({ legacyValue: '600', journalValue: '600', delta: '0', status: 'MATCH', blockerCodes: [] }),
    );
    expect(report.caseScopedPrimaryReaderEvidence?.comparisons.advanceBalance).toEqual(
      expect.objectContaining({ legacyValue: '75', journalValue: '75', delta: '0', status: 'MATCH', blockerCodes: [] }),
    );
    expect(report.summaryHybridPrimaryBoundary).toEqual(
      expect.objectContaining({
        mode: 'CLIENT_SCOPED_JOURNAL_WITH_CASE_SCOPED_LEGACY_CONTEXT',
        caseScopedContextSource: 'LEGACY_CONTEXT',
        journalOnlyPrimarySwitch: 'BLOCKED',
        primarySwitchUnchanged: true,
        safeForPrimaryCutover: false,
        blockerCodes: expect.arrayContaining([
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
          'SUMMARY_JOURNAL_ONLY_PRIMARY_SWITCH_BLOCKED_BY_LEGACY_CONTEXT',
        ]),
      }),
    );
    expect(report.summaryHybridPrimaryBoundary.blockerCodes).not.toContain('COLLECTION_JOURNAL_SOURCE_MISSING');
    expect(report.summaryPrimarySwitchReadiness.collectionCashReceiptEvidenceStatus).toBe('CLEAN');
    expect(report.summaryPrimarySwitchReadiness.rawCollectionJournalSource).toEqual(
      expect.objectContaining({
        status: 'EVIDENCE_CLEAN',
        blockerCodes: ['CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING'],
      }),
    );
    expect(report.summaryPrimarySwitchReadiness.blockerCodes).not.toContain('COLLECTION_JOURNAL_SOURCE_MISSING');
    expect(report.summaryPrimarySwitchReadiness.caseScopedReadiness).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        contextSource: 'LEGACY_CONTEXT',
        unsupportedResponsePaths: [
          'caseScopedContext.debtorCollection',
          'caseScopedContext.pendingDistribution',
          'caseScopedContext.advanceBalance',
          'caseBreakdown',
          'needsReview',
        ],
        blockerCodes: expect.arrayContaining([
          'CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING',
          'CLIENT_ACCOUNTING_SUMMARY_CASE_SCOPED_PRIMARY_READER_MISSING',
        ]),
      }),
    );
    expect(component(report, 'pendingDistribution').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '600', journalValue: '600', delta: '0', status: 'MATCH' }),
    );
    expect(component(report, 'advanceBalance').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '75', journalValue: '75', delta: '0', status: 'MATCH' }),
    );
    expect(component(report, 'debtorCollection').blockerCodes).toContain('CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING');
    expect(component(report, 'needsReview').blockerCodes).toEqual(
      expect.arrayContaining(component(report, 'pendingDistribution').blockerCodes),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
    expect(report.primarySwitchUnchanged).toBe(true);
  });

  it('reports case-scoped pendingDistribution and advanceBalance journal mismatches', async () => {
    const prisma = buildPrismaMock([], undefined, {
      collections: [{ id: 'collection-case', amount: '1000' }],
      dispositions: [{ id: 'disp-posted', status: 'POSTED', totalAmount: '400' }],
      journalEntries: [collectionCashJournal({ sourceId: 'collection-case', action: 'recorded', amount: '1000' })],
      caseBalances: [{ balance: '75' }],
      caseScopedJournalLines: [
        { sourceType: 'COLLECTION_DISPOSITION_LINE', accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '350' },
        { sourceType: 'BALANCE_LEDGER', accountCode: 'CLIENT_ADVANCE_BALANCE', direction: 'CREDIT', amount: '60' },
      ],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

    expect(report.caseScopedPrimaryReaderEvidence).toEqual(
      expect.objectContaining({
        status: 'MISMATCH',
        blockerCodes: expect.arrayContaining([
          'CASE_CONTEXT_PENDING_DISTRIBUTION_JOURNAL_MISMATCH',
          'CASE_BALANCE_SNAPSHOT_VALUE_MISMATCH',
        ]),
      }),
    );
    expect(report.caseScopedPrimaryReaderEvidence?.comparisons.pendingDistribution).toEqual(
      expect.objectContaining({ legacyValue: '600', journalValue: '650', delta: '50', status: 'MISMATCH', blockerCodes: ['CASE_CONTEXT_PENDING_DISTRIBUTION_JOURNAL_MISMATCH'] }),
    );
    expect(report.caseScopedPrimaryReaderEvidence?.comparisons.advanceBalance).toEqual(
      expect.objectContaining({ legacyValue: '75', journalValue: '60', delta: '-15', status: 'MISMATCH', blockerCodes: ['CASE_BALANCE_SNAPSHOT_VALUE_MISMATCH'] }),
    );
    expect(component(report, 'pendingDistribution').blockerCodes).toEqual(
      expect.arrayContaining(['CASE_CONTEXT_PENDING_DISTRIBUTION_JOURNAL_MISMATCH']),
    );
    expect(component(report, 'advanceBalance').blockerCodes).toEqual(
      expect.arrayContaining(['CASE_BALANCE_SNAPSHOT_VALUE_MISMATCH']),
    );
    expect(report.blockerCodes).toEqual(
      expect.arrayContaining([
        'CASE_CONTEXT_PENDING_DISTRIBUTION_JOURNAL_MISMATCH',
        'CASE_BALANCE_SNAPSHOT_VALUE_MISMATCH',
      ]),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
  });
});