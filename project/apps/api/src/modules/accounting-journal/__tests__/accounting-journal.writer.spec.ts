import { Prisma } from '@prisma/client';
import { buildAccountingJournal } from '../accounting-journal.builder';
import type {
  BalanceLedgerJournalSource,
  ClientPayoutJournalSource,
  CollectionDispositionLineJournalSource,
  CollectionDispositionLinePostedPayload,
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
