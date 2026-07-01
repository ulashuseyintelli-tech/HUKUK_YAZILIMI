import { Prisma } from '@prisma/client';
import { buildAccountingJournal } from '../accounting-journal.builder';
import type {
  BalanceLedgerJournalSource,
  ClientOffsetJournalSource,
  ClientPayoutJournalSource,
  CollectionDispositionExpenseApplicationJournalSource,
  CollectionDispositionLineJournalSource,
  CollectionDispositionLinePostedPayload,
  ExpensePaymentJournalSource,
  ExpenseRequestJournalSource,
} from '../accounting-journal.types';
import { validateJournalDraft } from '../accounting-journal.validators';
import { AccountingJournalWriterService } from '../accounting-journal.writer';

function source(overrides: Partial<CollectionDispositionLineJournalSource> & { payload?: Partial<CollectionDispositionLinePostedPayload> } = {}): CollectionDispositionLineJournalSource {
  const sourceId = overrides.sourceId ?? 'line-1';
  const payload: CollectionDispositionLinePostedPayload = {
    lineType: 'CLIENT_PAYABLE',
    amount: '100.00',
    caseId: 'case-1',
    caseClientId: 'cc-1',
    clientId: 'client-1',
    collectionId: 'collection-1',
    dispositionLineId: sourceId,
    creditAccountCode: 'CLIENT_PAYABLE',
    manualReversalRequiredAt: null,
    ...(overrides.payload ?? {}),
  };

  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'COLLECTION_DISPOSITION_LINE',
    sourceId,
    sourceVersion: overrides.sourceVersion ?? `2026-06-30T08:00:00.000Z:${sourceId}`,
    sourceAction: 'posted',
    occurredAt: overrides.occurredAt ?? '2026-06-30T08:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-06-30',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? null,
    metadata: overrides.metadata ?? { test: true },
    payload,
  };
}

function draft() {
  const built = buildAccountingJournal(source());
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('build failed');
  const validated = validateJournalDraft(built.draft);
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error('validation failed');
  return validated.draft;
}

function dbMock() {
  return {
    accountingJournalEntry: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  } as any;
}

describe('AccountingJournalWriterService', () => {
  it('creates AccountingJournalEntry with nested lines for a validated draft', async () => {
    const db = dbMock();
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingJournalEntry.create.mockResolvedValue({ id: 'journal-1', _count: { lines: 2 } });
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: draft() }, db);

    expect(result).toEqual({
      ok: true,
      output: expect.objectContaining({ status: 'CREATED', journalEntryId: 'journal-1', lineCount: 2 }),
    });
    expect(db.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'COLLECTION_DISPOSITION_LINE',
          sourceId: 'line-1',
          sourceAction: 'posted',
          lines: { create: expect.arrayContaining([expect.objectContaining({ dispositionLineId: 'line-1' })]) },
        }),
      }),
    );
  });

  it('replays the existing journal when source/action/idempotency match', async () => {
    const db = dbMock();
    const d = draft();
    db.accountingJournalEntry.findFirst.mockResolvedValueOnce({
      id: 'journal-existing',
      idempotencyKey: d.idempotencyKey,
      sourceHash: null,
      sourceType: d.sourceType,
      sourceId: d.sourceId,
      sourceAction: d.sourceAction,
      _count: { lines: 2 },
    });
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: d }, db);

    expect(result).toEqual({
      ok: true,
      output: expect.objectContaining({ status: 'REPLAYED', journalEntryId: 'journal-existing', lineCount: 2 }),
    });
    expect(db.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects stale sourceVersion when source/action already exists with another idempotency key', async () => {
    const db = dbMock();
    db.accountingJournalEntry.findFirst.mockResolvedValueOnce({
      id: 'journal-existing',
      idempotencyKey: 'acct-journal:v1:tenant-1:COLLECTION_DISPOSITION_LINE:line-1:posted:old',
      sourceHash: null,
      sourceType: 'COLLECTION_DISPOSITION_LINE',
      sourceId: 'line-1',
      sourceAction: 'posted',
      _count: { lines: 2 },
    });
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: draft() }, db);

    expect(result).toEqual({ ok: false, errors: [expect.objectContaining({ code: 'SOURCE_VERSION_STALE' })] });
  });

  it('rejects idempotency key reuse for a different source tuple', async () => {
    const db = dbMock();
    const d = draft();
    db.accountingJournalEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'journal-conflict',
        idempotencyKey: d.idempotencyKey,
        sourceHash: null,
        sourceType: 'CLIENT_PAYOUT',
        sourceId: 'payout-1',
        sourceAction: 'recorded',
        _count: { lines: 2 },
      });
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: d }, db);

    expect(result).toEqual({ ok: false, errors: [expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' })] });
    expect(db.accountingJournalEntry.create).not.toHaveBeenCalled();
  });
});
function payoutSource(): ClientPayoutJournalSource {
  return {
    tenantId: 'tenant-1',
    sourceType: 'CLIENT_PAYOUT',
    sourceId: 'payout-1',
    sourceVersion: '2026-06-30T08:00:00.000Z:payout-1',
    sourceAction: 'recorded',
    occurredAt: '2026-06-30T08:00:00.000Z',
    effectiveDate: '2026-06-30',
    actorId: 'user-1',
    currency: 'TRY',
    sourceHash: null,
    metadata: { test: true },
    payload: {
      amount: '400.00',
      caseId: 'case-1',
      caseClientId: 'cc-1',
      clientId: null,
      payoutId: 'payout-1',
    },
  };
}

function payoutDraft() {
  const built = buildAccountingJournal(payoutSource());
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('build failed');
  const validated = validateJournalDraft(built.draft);
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error('validation failed');
  return validated.draft;
}

describe('AccountingJournalWriterService ClientPayout source shape', () => {
  it('creates payout journal lines with payoutId dimensions', async () => {
    const db = dbMock();
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingJournalEntry.create.mockResolvedValue({ id: 'journal-payout', _count: { lines: 2 } });
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: payoutDraft() }, db);

    expect(result).toEqual({
      ok: true,
      output: expect.objectContaining({ status: 'CREATED', journalEntryId: 'journal-payout', lineCount: 2 }),
    });
    expect(db.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'CLIENT_PAYOUT',
          sourceId: 'payout-1',
          sourceAction: 'recorded',
          lines: { create: expect.arrayContaining([expect.objectContaining({ payoutId: 'payout-1' })]) },
        }),
      }),
    );
  });
});

function clientOffsetSource(): ClientOffsetJournalSource {
  return {
    tenantId: 'tenant-1',
    sourceType: 'CLIENT_OFFSET',
    sourceId: 'offset-1',
    sourceVersion: '2026-06-30T08:00:00.000Z:offset-1',
    sourceAction: 'apply',
    occurredAt: '2026-06-30T08:00:00.000Z',
    effectiveDate: '2026-06-30',
    actorId: 'user-1',
    currency: 'TRY',
    sourceHash: 'hash-client-offset',
    metadata: { test: true },
    payload: {
      kind: 'APPLY',
      amount: '250.00',
      clientId: 'client-1',
      payableLeg: { caseId: 'case-payable-1', caseClientId: 'cc-payable-1' },
      expenseLeg: { caseId: 'case-expense-1', caseClientId: null, expenseRequestId: 'expense-request-1' },
      reversesOffsetId: null,
    },
  };
}

function clientOffsetDraft() {
  const built = buildAccountingJournal(clientOffsetSource());
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('build failed');
  const validated = validateJournalDraft(built.draft);
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error('validation failed');
  return validated.draft;
}

describe('AccountingJournalWriterService ClientOffset source shape', () => {
  it('persists expense request dimensions on the expense leg', async () => {
    const db = dbMock();
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingJournalEntry.create.mockResolvedValue({ id: 'journal-offset', _count: { lines: 2 } });
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: clientOffsetDraft() }, db);

    expect(result).toEqual({
      ok: true,
      output: expect.objectContaining({ status: 'CREATED', journalEntryId: 'journal-offset', lineCount: 2 }),
    });
    expect(db.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'CLIENT_OFFSET',
          sourceId: 'offset-1',
          sourceAction: 'apply',
          lines: {
            create: expect.arrayContaining([
              expect.objectContaining({
                accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
                offsetId: 'offset-1',
                expenseRequestId: 'expense-request-1',
                expensePaymentId: null,
                expenseApplicationId: null,
              }),
            ]),
          },
        }),
      }),
    );
  });
});
function balanceLedgerSource(overrides: Partial<BalanceLedgerJournalSource> = {}): BalanceLedgerJournalSource {
  const sourceId = overrides.sourceId ?? 'bl-1';
  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'BALANCE_LEDGER',
    sourceId,
    sourceVersion: overrides.sourceVersion ?? `2026-06-30T08:00:00.000Z:${sourceId}`,
    sourceAction: 'posted',
    occurredAt: overrides.occurredAt ?? '2026-06-30T08:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-06-30',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? 'hash-balance-ledger',
    metadata: overrides.metadata ?? { sourceName: 'balance-ledger-test' },
    payload: overrides.payload ?? {
      amount: '40',
      caseId: 'case-1',
      balanceLedgerId: sourceId,
      ledgerType: 'DEBIT',
      source: 'operation:haciz',
      sourceId: 'op-1',
      isIncrease: false,
    },
  };
}

function balanceLedgerDraft() {
  const built = buildAccountingJournal(balanceLedgerSource());
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('build failed');
  const validated = validateJournalDraft(built.draft);
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error('validation failed');
  return validated.draft;
}

function uniqueConflict() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['tenantId', 'idempotencyKey'] },
  });
}

function existingFromDraft(d: ReturnType<typeof balanceLedgerDraft>, overrides: Partial<{ id: string; idempotencyKey: string; sourceHash: string | null }> = {}) {
  return {
    id: overrides.id ?? 'journal-existing-balance-ledger',
    idempotencyKey: overrides.idempotencyKey ?? d.idempotencyKey,
    sourceHash: Object.prototype.hasOwnProperty.call(overrides, 'sourceHash') ? overrides.sourceHash! : d.sourceHash,
    sourceType: d.sourceType,
    sourceId: d.sourceId,
    sourceAction: d.sourceAction,
    _count: { lines: 2 },
  };
}

describe('AccountingJournalWriterService BalanceLedger duplicate safety', () => {
  it('replays duplicate create race when source/action/idempotency match', async () => {
    const db = dbMock();
    const d = balanceLedgerDraft();
    db.accountingJournalEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingFromDraft(d));
    db.accountingJournalEntry.create.mockRejectedValueOnce(uniqueConflict());
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: d }, db);

    expect(result).toEqual({
      ok: true,
      output: expect.objectContaining({ status: 'REPLAYED', journalEntryId: 'journal-existing-balance-ledger', lineCount: 2 }),
    });
    expect(db.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
  });

  it('rejects BalanceLedger replay when source hash changed under same idempotency key', async () => {
    const db = dbMock();
    const d = balanceLedgerDraft();
    db.accountingJournalEntry.findFirst.mockResolvedValueOnce(existingFromDraft(d, { sourceHash: 'old-hash' }));
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: d }, db);

    expect(result).toEqual({ ok: false, errors: [expect.objectContaining({ code: 'SOURCE_HASH_MISMATCH' })] });
    expect(db.accountingJournalEntry.create).not.toHaveBeenCalled();
  });
});
function expenseRequestSource(): ExpenseRequestJournalSource {
  return {
    tenantId: 'tenant-1',
    sourceType: 'EXPENSE_REQUEST',
    sourceId: 'expense-request-1',
    sourceVersion: '2026-07-01T10:00:00.000Z:expense-request-1:RECORDED',
    sourceAction: 'recorded',
    occurredAt: '2026-07-01T10:00:00.000Z',
    effectiveDate: '2026-07-01',
    actorId: 'user-1',
    currency: 'TRY',
    sourceHash: 'hash-expense-request',
    metadata: { test: true },
    payload: {
      kind: 'RECORDED',
      amount: '175.25',
      caseId: 'case-expense-request-1',
      clientId: 'client-1',
      expenseRequestId: 'expense-request-1',
      cancelGuard: null,
    },
  };
}

function expenseRequestDraft() {
  const built = buildAccountingJournal(expenseRequestSource());
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('build failed');
  const validated = validateJournalDraft(built.draft);
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error('validation failed');
  return validated.draft;
}

describe('AccountingJournalWriterService ExpenseRequest source shape', () => {
  it('persists expense request dimensions on both skeleton lines', async () => {
    const db = dbMock();
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingJournalEntry.create.mockResolvedValue({ id: 'journal-expense-request', _count: { lines: 2 } });
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: expenseRequestDraft() }, db);

    expect(result).toEqual({
      ok: true,
      output: expect.objectContaining({ status: 'CREATED', journalEntryId: 'journal-expense-request', lineCount: 2 }),
    });
    expect(db.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'EXPENSE_REQUEST',
          sourceId: 'expense-request-1',
          sourceAction: 'recorded',
          lines: {
            create: expect.arrayContaining([
              expect.objectContaining({
                accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
                expenseRequestId: 'expense-request-1',
                expensePaymentId: null,
                expenseApplicationId: null,
              }),
              expect.objectContaining({
                accountCode: 'FIRM_EXPENSE_REIMBURSEMENT',
                expenseRequestId: 'expense-request-1',
                expensePaymentId: null,
                expenseApplicationId: null,
              }),
            ]),
          },
        }),
      }),
    );
  });
});
function expensePaymentSource(): ExpensePaymentJournalSource {
  return {
    tenantId: 'tenant-1',
    sourceType: 'EXPENSE_PAYMENT',
    sourceId: 'expense-payment-1',
    sourceVersion: '2026-07-01T11:00:00.000Z:expense-payment-1:RECORDED',
    sourceAction: 'recorded',
    occurredAt: '2026-07-01T11:00:00.000Z',
    effectiveDate: '2026-07-01',
    actorId: 'user-1',
    currency: 'TRY',
    sourceHash: 'hash-expense-payment',
    metadata: { test: true },
    payload: {
      amount: '125.00',
      caseId: 'case-expense-payment-1',
      clientId: 'client-1',
      expenseRequestId: 'expense-request-1',
      expensePaymentId: 'expense-payment-1',
      paymentMethod: 'BANK_TRANSFER',
      reference: 'DEKONT-1',
    },
  };
}

function expensePaymentDraft() {
  const built = buildAccountingJournal(expensePaymentSource());
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('build failed');
  const validated = validateJournalDraft(built.draft);
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error('validation failed');
  return validated.draft;
}

describe('AccountingJournalWriterService ExpensePayment source shape', () => {
  it('persists expense request and payment dimensions on both skeleton lines', async () => {
    const db = dbMock();
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingJournalEntry.create.mockResolvedValue({ id: 'journal-expense-payment', _count: { lines: 2 } });
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: expensePaymentDraft() }, db);

    expect(result).toEqual({
      ok: true,
      output: expect.objectContaining({ status: 'CREATED', journalEntryId: 'journal-expense-payment', lineCount: 2 }),
    });
    expect(db.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'EXPENSE_PAYMENT',
          sourceId: 'expense-payment-1',
          sourceAction: 'recorded',
          lines: {
            create: expect.arrayContaining([
              expect.objectContaining({
                accountCode: 'CASH_CLEARING',
                expenseRequestId: 'expense-request-1',
                expensePaymentId: 'expense-payment-1',
                expenseApplicationId: null,
              }),
              expect.objectContaining({
                accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
                expenseRequestId: 'expense-request-1',
                expensePaymentId: 'expense-payment-1',
                expenseApplicationId: null,
              }),
            ]),
          },
        }),
      }),
    );
  });
});
function expenseApplicationSource(): CollectionDispositionExpenseApplicationJournalSource {
  return {
    tenantId: 'tenant-1',
    sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
    sourceId: 'expense-application-1',
    sourceVersion: '2026-07-01T12:00:00.000Z:expense-application-1:APPLY',
    sourceAction: 'apply',
    occurredAt: '2026-07-01T12:00:00.000Z',
    effectiveDate: '2026-07-01',
    actorId: 'user-1',
    currency: 'TRY',
    sourceHash: 'hash-expense-application',
    metadata: { test: true },
    payload: {
      kind: 'APPLY',
      amount: '80.00',
      caseId: 'case-expense-application-1',
      clientId: 'client-1',
      expenseRequestId: 'expense-request-1',
      expenseApplicationId: 'expense-application-1',
      collectionId: 'collection-1',
      collectionDispositionId: 'disposition-1',
      collectionDispositionLineId: 'disposition-line-1',
      reimbursementScope: 'CLIENT_FRONTED',
      reversesApplicationId: null,
    },
  };
}

function expenseApplicationDraft() {
  const built = buildAccountingJournal(expenseApplicationSource());
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('build failed');
  const validated = validateJournalDraft(built.draft);
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error('validation failed');
  return validated.draft;
}

describe('AccountingJournalWriterService expense application source shape', () => {
  it('persists expense request and application dimensions on both skeleton lines', async () => {
    const db = dbMock();
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingJournalEntry.create.mockResolvedValue({ id: 'journal-expense-application', _count: { lines: 2 } });
    const writer = new AccountingJournalWriterService({} as any);

    const result = await writer.write({ draft: expenseApplicationDraft() }, db);

    expect(result).toEqual({
      ok: true,
      output: expect.objectContaining({ status: 'CREATED', journalEntryId: 'journal-expense-application', lineCount: 2 }),
    });
    expect(db.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
          sourceId: 'expense-application-1',
          sourceAction: 'apply',
          lines: {
            create: expect.arrayContaining([
              expect.objectContaining({
                accountCode: 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE',
                dispositionLineId: 'disposition-line-1',
                expenseRequestId: 'expense-request-1',
                expensePaymentId: null,
                expenseApplicationId: 'expense-application-1',
              }),
              expect.objectContaining({
                accountCode: 'CLIENT_EXPENSE_RECEIVABLE',
                dispositionLineId: 'disposition-line-1',
                expenseRequestId: 'expense-request-1',
                expensePaymentId: null,
                expenseApplicationId: 'expense-application-1',
              }),
            ]),
          },
        }),
      }),
    );
  });
});
