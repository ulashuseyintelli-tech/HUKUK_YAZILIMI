import { Prisma } from '@prisma/client';

import { buildAccountingJournal } from '../accounting-journal.builder';
import { AccountingJournalWriterService } from '../accounting-journal-writer.service';
import type {
  ClientOffsetJournalSource,
  ClientOffsetJournalSourcePayload,
  JournalEntryDraft,
  JournalMetadata,
} from '../accounting-journal.types';

interface ClientOffsetSourceOverrides {
  tenantId?: string;
  sourceId?: string;
  sourceVersion?: string;
  sourceAction?: ClientOffsetJournalSource['sourceAction'];
  occurredAt?: string;
  effectiveDate?: string;
  actorId?: string | null;
  currency?: string;
  sourceHash?: string | null;
  metadata?: JournalMetadata;
  payload?: Partial<Omit<ClientOffsetJournalSourcePayload, 'payableLeg' | 'expenseLeg'>> & {
    payableLeg?: Partial<ClientOffsetJournalSourcePayload['payableLeg']>;
    expenseLeg?: Partial<ClientOffsetJournalSourcePayload['expenseLeg']>;
  };
}

type MockDatabase = {
  $transaction: jest.Mock;
  accountingJournalEntry: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
};

function clientOffsetSource(overrides: ClientOffsetSourceOverrides = {}): ClientOffsetJournalSource {
  const payloadOverrides = overrides.payload ?? {};
  const basePayload: ClientOffsetJournalSourcePayload = {
    kind: 'APPLY',
    amount: '100.00',
    clientId: 'client-1',
    payableLeg: {
      caseId: 'case-payable',
      caseClientId: 'case-client-payable',
    },
    expenseLeg: {
      caseId: 'case-expense',
      caseClientId: null,
      expenseRequestId: 'expense-request-1',
    },
    reversesOffsetId: null,
  };

  return {
    tenantId: overrides.tenantId ?? 'tenant-1',
    sourceType: 'CLIENT_OFFSET',
    sourceId: overrides.sourceId ?? 'offset-1',
    sourceVersion: overrides.sourceVersion ?? '1',
    sourceAction: overrides.sourceAction ?? 'apply',
    occurredAt: overrides.occurredAt ?? '2026-06-30T08:00:00.000Z',
    effectiveDate: overrides.effectiveDate ?? '2026-06-30',
    actorId: overrides.actorId ?? 'user-1',
    currency: overrides.currency ?? 'TRY',
    sourceHash: overrides.sourceHash ?? 'source-hash-1',
    metadata: overrides.metadata ?? { sourceName: 'client-offset-test' },
    payload: {
      ...basePayload,
      ...payloadOverrides,
      payableLeg: {
        ...basePayload.payableLeg,
        ...payloadOverrides.payableLeg,
      },
      expenseLeg: {
        ...basePayload.expenseLeg,
        ...payloadOverrides.expenseLeg,
      },
    },
  };
}

function buildDraft(source: ClientOffsetJournalSource = clientOffsetSource()): JournalEntryDraft {
  const result = buildAccountingJournal(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.draft;
}

function mockDatabase(existing: { id: string; sourceHash: string | null } | null = null): MockDatabase {
  const tx = {
    accountingJournalEntry: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue({ id: 'journal-entry-1' }),
    },
  };

  return {
    ...tx,
    $transaction: jest.fn(async (callback: (arg: typeof tx) => Promise<unknown>) => callback(tx)),
  };
}

describe('AccountingJournalWriterService', () => {
  it('creates AccountingJournalEntry and nested lines from a valid draft', async () => {
    const draft = buildDraft();
    const database = mockDatabase();
    const service = new AccountingJournalWriterService({} as never);

    const result = await service.write({ draft }, database as never);

    expect(result).toEqual({
      ok: true,
      output: {
        status: 'CREATED',
        journalEntryId: 'journal-entry-1',
        idempotencyKey: draft.idempotencyKey,
        sourceVersion: draft.sourceVersion,
        lineCount: 2,
      },
    });
    expect(database.accountingJournalEntry.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_idempotencyKey: {
          tenantId: draft.tenantId,
          idempotencyKey: draft.idempotencyKey,
        },
      },
      select: { id: true, sourceHash: true },
    });

    const createArgs = database.accountingJournalEntry.create.mock.calls[0][0];
    expect(createArgs.data).toEqual(
      expect.objectContaining({
        tenantId: draft.tenantId,
        caseId: draft.caseId,
        currency: draft.currency,
        entryType: draft.entryType,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId,
        sourceAction: draft.sourceAction,
        idempotencyKey: draft.idempotencyKey,
        sourceHash: draft.sourceHash,
        postedById: draft.postedById,
        reversalOfEntryId: null,
      }),
    );
    expect(createArgs.data.metadata).toEqual(
      expect.objectContaining({
        sourceVersion: draft.sourceVersion,
        effectiveDate: draft.effectiveDate,
        idempotencyMaterial: draft.idempotencyMaterial,
      }),
    );
    expect(createArgs.data.lines.create).toHaveLength(2);
    expect(createArgs.data.lines.create[0]).toEqual(
      expect.objectContaining({
        tenantId: draft.tenantId,
        lineNo: 1,
        accountCode: 'CLIENT_PAYABLE',
        direction: 'DEBIT',
        currency: draft.currency,
        caseId: 'case-payable',
        caseClientId: 'case-client-payable',
        offsetId: 'offset-1',
      }),
    );
    expect(createArgs.data.lines.create[0].amount).toBeInstanceOf(Prisma.Decimal);
    expect(createArgs.data.lines.create[0]).not.toHaveProperty('expenseRequestId');
  });

  it('returns REPLAYED when idempotency key exists with the same sourceHash', async () => {
    const draft = buildDraft();
    const database = mockDatabase({ id: 'existing-journal-entry', sourceHash: draft.sourceHash });
    const service = new AccountingJournalWriterService({} as never);

    const result = await service.write({ draft }, database as never);

    expect(result).toEqual({
      ok: true,
      output: {
        status: 'REPLAYED',
        journalEntryId: 'existing-journal-entry',
        idempotencyKey: draft.idempotencyKey,
        sourceVersion: draft.sourceVersion,
        lineCount: 2,
      },
    });
    expect(database.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('hard-fails when idempotency key exists with a different sourceHash', async () => {
    const draft = buildDraft();
    const database = mockDatabase({ id: 'existing-journal-entry', sourceHash: 'different-source-hash' });
    const service = new AccountingJournalWriterService({} as never);

    const result = await service.write({ draft }, database as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected conflict result.');
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'SOURCE_HASH_MISMATCH',
        idempotencyKey: draft.idempotencyKey,
      }),
    ]);
    expect(database.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('tenant-scoped idempotency lookup allows the same key pattern across different tenants', async () => {
    const draft = buildDraft(clientOffsetSource({ tenantId: 'tenant-a' }));
    const database = mockDatabase();
    const service = new AccountingJournalWriterService({} as never);

    await service.write({ draft }, database as never);

    expect(database.accountingJournalEntry.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_idempotencyKey: {
            tenantId: 'tenant-a',
            idempotencyKey: draft.idempotencyKey,
          },
        },
      }),
    );
  });

  it('runs validator before write and does not write lines when validation fails', async () => {
    const draft = buildDraft();
    draft.lines[1].tenantId = 'tenant-other';
    const database = mockDatabase();
    const service = new AccountingJournalWriterService({} as never);

    const result = await service.write({ draft }, database as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected validation failure.');
    expect(result.errors[0]).toEqual(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        idempotencyKey: draft.idempotencyKey,
      }),
    );
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(database.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('preserves source identity, sourceVersion and sourceHash in the persisted entry metadata/output', async () => {
    const draft = buildDraft(
      clientOffsetSource({
        tenantId: 'tenant-preserve',
        sourceId: 'offset-preserve',
        sourceVersion: '17',
        sourceHash: 'hash-preserve',
        metadata: { sourceName: 'preserve-test', authoritativeCode: 'ACCT' },
      }),
    );
    const database = mockDatabase();
    const service = new AccountingJournalWriterService({} as never);

    const result = await service.write({ draft }, database as never);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected created result.');
    expect(result.output).toEqual(
      expect.objectContaining({
        idempotencyKey: 'acct-journal:v1:tenant-preserve:CLIENT_OFFSET:offset-preserve:apply:17',
        sourceVersion: '17',
      }),
    );
    const createArgs = database.accountingJournalEntry.create.mock.calls[0][0];
    expect(createArgs.data).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-preserve',
        sourceType: 'CLIENT_OFFSET',
        sourceId: 'offset-preserve',
        sourceAction: 'apply',
        sourceHash: 'hash-preserve',
      }),
    );
    expect(createArgs.data.metadata).toEqual(
      expect.objectContaining({
        sourceVersion: '17',
        authoritativeCode: 'ACCT',
      }),
    );
  });
});
