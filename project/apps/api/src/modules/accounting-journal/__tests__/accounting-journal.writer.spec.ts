import { buildAccountingJournal } from '../accounting-journal.builder';
import type { CollectionDispositionLineJournalSource, CollectionDispositionLinePostedPayload } from '../accounting-journal.types';
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