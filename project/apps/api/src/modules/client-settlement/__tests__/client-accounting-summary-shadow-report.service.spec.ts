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

type ReplayJournalMockRow = {
  id?: string;
  sourceType: 'COLLECTION_DISPOSITION_LINE' | 'BALANCE_LEDGER';
  sourceAction?: 'posted';
  sourceId: string;
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
};

type CollectionDispositionMockRow = {
  id: string;
  caseId?: string;
  currency?: string;
  status?: string;
  updatedAt?: Date | null;
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

function expenseReceivableAdjustmentLine(row: ExpenseReceivableAdjustmentLineMockRow) {
  return {
    amount: new Prisma.Decimal(row.amount),
    direction: row.direction,
    journalEntry: { sourceType: row.sourceType, sourceAction: row.sourceAction },
  };
}

function replayJournal(row: ReplayJournalMockRow) {
  return {
    id: row.id ?? `journal-${row.sourceId}`,
    sourceType: row.sourceType,
    sourceAction: row.sourceAction ?? 'posted',
    sourceId: row.sourceId,
  };
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
  };
}

function collectionDisposition(row: CollectionDispositionMockRow) {
  return {
    caseId: 'case-1',
    currency: 'TRY',
    status: 'HELD_PENDING_DISTRIBUTION',
    updatedAt: DEFAULT_REPLAY_DATE,
    ...row,
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

function buildPrismaMock(
  lines: Array<{ sourceType: string; sourceAction: string; amount: string }>,
  expense?: {
    active?: ExpenseRequestMockRow[];
    cancelled?: ExpenseRequestMockRow[];
    journals?: ExpenseRequestJournalMockRow[];
    payments?: Array<{ expenseRequestId: string }>;
    offsets?: Array<{ expenseRequestId: string }>;
    applications?: Array<{ expenseRequestId: string }>;
  },
  replay?: {
    caseClients?: Array<{ id: string; caseId: string }>;
    dispositionLines?: CollectionDispositionLineMockRow[];
    collections?: CollectionMockRow[];
    dispositions?: CollectionDispositionMockRow[];
    balanceLedgers?: BalanceLedgerMockRow[];
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
    expensePayment: {
      findMany: jest.fn().mockImplementation((args) => {
        if (args.where?.expenseRequest) {
          return Promise.resolve((expense?.paymentRows ?? []).map(expensePayment));
        }
        return Promise.resolve(expense?.payments ?? []);
      }),
    },    clientOffset: {
      findMany: jest.fn().mockResolvedValue(expense?.offsets ?? []),
    },
    collectionDispositionExpenseApplication: {
      findMany: jest.fn().mockResolvedValue(expense?.applications ?? []),
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
          'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
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
          'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
          'EXPENSE_REIMBURSEMENT_APPLICATION_BACKFILL_MISSING',
          'EXPENSE_REIMBURSEMENT_APPLICATION_VALUE_SHADOW_MISSING',
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
        'EXPENSE_REIMBURSEMENT_APPLICATION_JOURNAL_WIRING_MISSING',
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
        legacyValue: '80',
        requestedJournalValue: '100',
        paidJournalValue: '20',
        offsetAppliedJournalValue: '10',
        offsetReversalJournalValue: '2',
        reimbursementAppliedJournalValue: '5',
        reimbursementReversalJournalValue: '1',
        journalValue: '68',
        delta: '-12',
        blockerCodes: expect.arrayContaining(['EXPENSE_UNPAID_DERIVED_FROM_BLOCKED_EXPENSE_COMPONENTS']),
      }),
    );
    expect(component(report, 'expenseUnpaid').valueComparison).toEqual(
      expect.objectContaining({ legacyValue: '80', journalValue: '68', delta: '-12', status: 'MISMATCH' }),
    );
    expect(report.candidateStatus).toBe('BLOCKED');
    expect(report.safeForPrimaryCutover).toBe(false);
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
    expect(component(report, 'pendingDistribution').blockerCodes).toContain('CASE_CONTEXT_COLLECTION_JOURNAL_COVERAGE_MISSING');
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

  it('blocks refunded Collection lifecycle as unmapped refund policy evidence', async () => {
    const prisma = buildPrismaMock([], undefined, {
      collections: [{ id: 'collection-refund', status: 'REFUNDED' }],
    });

    const report = await new ClientAccountingSummaryShadowReportService(prisma as never).getSummaryShadowReportWithSupportedValues({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      legacyClientScoped: { payableNet: '0', paidToClient: '0', offsetApplied: '0' },
    });

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
    expect(component(report, 'advanceBalance').valueComparison).toBeUndefined();
  });
});
