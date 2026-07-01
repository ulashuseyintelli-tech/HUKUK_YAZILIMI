import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountingJournalReversalService } from '../accounting-journal-reversal.service';

const D = (value: string | number) => new Prisma.Decimal(value);
const PARTNER = { id: 'user-1', lawyer: { lawyerRank: 'PARTNER' }, staffMember: null };
const MANAGER = { id: 'user-1', lawyer: null, staffMember: { staffType: 'MANAGER' } };
const PLAIN_LAWYER = { id: 'user-1', lawyer: { lawyerRank: 'LAWYER' }, staffMember: null };

function originalJournalEntry(overrides: any = {}) {
  return {
    id: 'journal-original-1',
    tenantId: 'tenant-1',
    caseId: 'case-1',
    currency: 'TRY',
    entryType: 'CLIENT_PAYOUT_RECORDED',
    sourceType: 'CLIENT_PAYOUT',
    sourceId: 'payout-1',
    sourceAction: 'recorded',
    sourceOccurredAt: new Date('2026-06-29T08:00:00.000Z'),
    postedAt: new Date('2026-06-30T08:00:00.000Z'),
    postedById: 'poster-1',
    reversalOfEntryId: null,
    reversedByEntry: null,
    metadata: { sourceVersion: '2026-06-29T08:00:00.000Z:payout-1' },
    lines: [
      {
        lineNo: 1,
        accountCode: 'CASH_CLEARING',
        direction: 'DEBIT',
        amount: D('125.50'),
        currency: 'TRY',
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: 'cc-1',
        collectionId: null,
        dispositionLineId: null,
        payoutId: 'payout-1',
        offsetId: null,
        expenseRequestId: null,
        expensePaymentId: null,
        expenseApplicationId: null,
        balanceLedgerId: null,
      },
      {
        lineNo: 2,
        accountCode: 'CLIENT_PAYABLE',
        direction: 'CREDIT',
        amount: D('125.50'),
        currency: 'TRY',
        caseId: 'case-1',
        clientId: 'client-1',
        caseClientId: 'cc-1',
        collectionId: null,
        dispositionLineId: null,
        payoutId: 'payout-1',
        offsetId: null,
        expenseRequestId: null,
        expensePaymentId: null,
        expenseApplicationId: null,
        balanceLedgerId: null,
      },
    ],
    ...overrides,
  };
}

function buildDb(opts: any = {}) {
  const tx: any = {
    accountingJournalEntry: {
      findFirst: jest.fn().mockResolvedValue('original' in opts ? opts.original : originalJournalEntry()),
    },
  };
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue('user' in opts ? opts.user : PARTNER) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const audit: any = {
    logInTransaction: opts.auditReject
      ? jest.fn().mockRejectedValue(opts.auditReject)
      : jest.fn().mockResolvedValue(undefined),
  };
  const writer: any = {
    write: jest.fn().mockImplementation(async (input: any) => {
      if (opts.writerResult) return opts.writerResult;

      return {
        ok: true,
        output: {
          status: opts.writerStatus ?? 'CREATED',
          journalEntryId: opts.reversalJournalEntryId ?? 'journal-reversal-1',
          idempotencyKey: input.draft.idempotencyKey,
          sourceVersion: input.draft.sourceVersion,
          lineCount: input.draft.lines.length,
        },
      };
    }),
  };

  return { prisma, tx, audit, writer };
}

function svc(db: any) {
  return new AccountingJournalReversalService(db.prisma, db.audit, db.writer);
}

const INPUT = {
  reason: 'Yanlis muhasebe kaydini ters cevirme',
  evidenceRef: 'EV-1',
};

describe('AccountingJournalReversalService', () => {
  it('creates a tenant-scoped generic reversal draft and audits in the same transaction', async () => {
    const db = buildDb();

    const result = await svc(db).reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT);

    expect(db.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', tenantId: 'tenant-1', isActive: true },
      select: {
        id: true,
        lawyer: { select: { lawyerRank: true } },
        staffMember: { select: { staffType: true } },
      },
    });
    expect(db.tx.accountingJournalEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'journal-original-1', tenantId: 'tenant-1' },
        select: expect.objectContaining({
          lines: expect.objectContaining({ orderBy: { lineNo: 'asc' } }),
        }),
      }),
    );
    expect(db.writer.write).toHaveBeenCalledTimes(1);
    expect(db.writer.write.mock.calls[0][1]).toBe(db.tx);

    const draft = db.writer.write.mock.calls[0][0].draft;
    expect(draft).toMatchObject({
      tenantId: 'tenant-1',
      caseId: 'case-1',
      currency: 'TRY',
      entryType: 'ACCOUNTING_JOURNAL_REVERSAL',
      sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
      sourceId: 'journal-original-1',
      sourceAction: 'reversal',
      sourceVersion: '2026-06-30T08:00:00.000Z:journal-original-1:reversal',
      postedById: 'user-1',
      reversalOf: { journalEntryId: 'journal-original-1' },
      metadata: expect.objectContaining({
        authorizationMode: 'DIRECT_OFFICE_ADMIN_CAPABILITY',
        sourceName: 'accounting-journal-generic-reversal',
        reason: INPUT.reason,
        evidenceRef: 'EV-1',
      }),
    });
    expect(draft.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(draft.lines).toEqual([
      expect.objectContaining({ lineNo: 1, accountCode: 'CASH_CLEARING', direction: 'CREDIT', amount: '125.50' }),
      expect.objectContaining({ lineNo: 2, accountCode: 'CLIENT_PAYABLE', direction: 'DEBIT', amount: '125.50' }),
    ]);
    expect(db.audit.logInTransaction).toHaveBeenCalledWith(
      db.tx,
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'ACCOUNTING_JOURNAL_ENTRY_REVERSED',
        entityType: 'AccountingJournalEntry',
        entityId: 'journal-reversal-1',
        metadata: expect.objectContaining({
          originalJournalEntryId: 'journal-original-1',
          reversalJournalEntryId: 'journal-reversal-1',
          authorizationMode: 'DIRECT_OFFICE_ADMIN_CAPABILITY',
        }),
      }),
    );
    expect(db.writer.write.mock.invocationCallOrder[0]).toBeLessThan(db.audit.logInTransaction.mock.invocationCallOrder[0]);
    expect(result).toEqual({
      status: 'CREATED',
      originalJournalEntryId: 'journal-original-1',
      reversalJournalEntryId: 'journal-reversal-1',
      idempotencyKey: draft.idempotencyKey,
      sourceVersion: draft.sourceVersion,
      lineCount: 2,
    });
  });

  it('allows MANAGER office-admin capacity', async () => {
    const db = buildDb({ user: MANAGER });

    await expect(svc(db).reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT)).resolves.toMatchObject({
      status: 'CREATED',
    });
  });

  it('rejects non-office-admin actors before reading the journal entry', async () => {
    const db = buildDb({ user: PLAIN_LAWYER });

    await expect(svc(db).reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.tx.accountingJournalEntry.findFirst).not.toHaveBeenCalled();
    expect(db.writer.write).not.toHaveBeenCalled();
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('treats missing tenant-scoped original entry as not found', async () => {
    const db = buildDb({ original: null });

    await expect(svc(db).reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.writer.write).not.toHaveBeenCalled();
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('rejects reversal-of-reversal before calling the writer', async () => {
    const db = buildDb({
      original: originalJournalEntry({ entryType: 'ACCOUNTING_JOURNAL_REVERSAL', reversalOfEntryId: 'journal-parent-1' }),
    });

    await expect(svc(db).reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT)).rejects.toBeInstanceOf(ConflictException);
    expect(db.writer.write).not.toHaveBeenCalled();
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('rejects empty original journal line snapshots', async () => {
    const db = buildDb({ original: originalJournalEntry({ lines: [] }) });

    await expect(svc(db).reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT)).rejects.toBeInstanceOf(ConflictException);
    expect(db.writer.write).not.toHaveBeenCalled();
  });

  it('requires a meaningful reversal reason before authorization', async () => {
    const db = buildDb();

    await expect(
      svc(db).reverseEntry('tenant-1', 'user-1', 'journal-original-1', { reason: 'short' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('uses deterministic sourceVersion, idempotency key and sourceHash for the same original snapshot', async () => {
    const db = buildDb();
    const service = svc(db);

    await service.reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT);
    await service.reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT);

    const firstDraft = db.writer.write.mock.calls[0][0].draft;
    const secondDraft = db.writer.write.mock.calls[1][0].draft;
    expect(secondDraft.sourceVersion).toBe(firstDraft.sourceVersion);
    expect(secondDraft.idempotencyKey).toBe(firstDraft.idempotencyKey);
    expect(secondDraft.sourceHash).toBe(firstDraft.sourceHash);
  });

  it('delegates already-reversed replay semantics to the writer and skips duplicate audit on replay', async () => {
    const db = buildDb({
      original: originalJournalEntry({ reversedByEntry: { id: 'journal-reversal-1' } }),
      writerStatus: 'REPLAYED',
    });

    const result = await svc(db).reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT);

    expect(db.writer.write).toHaveBeenCalledTimes(1);
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'REPLAYED', reversalJournalEntryId: 'journal-reversal-1' });
  });

  it('fails closed when writer rejects the reversal draft', async () => {
    const db = buildDb({
      writerResult: {
        ok: false,
        errors: [
          {
            code: 'SOURCE_HASH_MISMATCH',
            message: 'Accounting journal source hash mismatch.',
            details: { sourceType: 'ACCOUNTING_JOURNAL_ENTRY' },
          },
        ],
      },
    });

    await expect(svc(db).reverseEntry('tenant-1', 'user-1', 'journal-original-1', INPUT)).rejects.toBeInstanceOf(ConflictException);
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });
});