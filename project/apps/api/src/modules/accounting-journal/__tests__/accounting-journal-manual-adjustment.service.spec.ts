import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountingJournalManualAdjustmentService } from '../accounting-journal-manual-adjustment.service';

const PARTNER = { id: 'user-1', lawyer: { lawyerRank: 'PARTNER' }, staffMember: null };
const MANAGER = { id: 'user-1', lawyer: null, staffMember: { staffType: 'MANAGER' } };
const PLAIN_LAWYER = { id: 'user-1', lawyer: { lawyerRank: 'LAWYER' }, staffMember: null };

/**
 * Default: every requested id is "found" (tenant-owned), so tests that don't care about the
 * tenant-ownership gate keep passing unchanged. Pass e.g. `ownedCaseIds: []` to simulate a
 * foreign/nonexistent reference for a specific test.
 */
function echoFound(ownedIds?: string[]) {
  return jest.fn().mockImplementation(async ({ where }: any) => {
    const requested: string[] = where.id.in;
    const owned = ownedIds ?? requested;
    return requested.filter((id) => owned.includes(id)).map((id) => ({ id }));
  });
}

function buildDb(opts: any = {}) {
  const tx: any = { __tx: true };
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue('user' in opts ? opts.user : PARTNER) },
    case: { findMany: echoFound(opts.ownedCaseIds) },
    client: { findMany: echoFound(opts.ownedClientIds) },
    caseClient: { findMany: echoFound(opts.ownedCaseClientIds) },
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
          journalEntryId: opts.journalEntryId ?? 'journal-manual-1',
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
  return new AccountingJournalManualAdjustmentService(db.prisma, db.audit, db.writer);
}

function input(overrides: any = {}) {
  return {
    idempotencyKey: 'manual-adjustment-1',
    sourceName: 'ops-correction',
    reason: 'Correct opening client balance error',
    evidenceRef: 'EV-1',
    amount: '10.00',
    currency: 'TRY',
    lines: [
      { accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '10.00', caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-1' },
      { accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '10.00', caseId: 'case-1', clientId: 'client-1', caseClientId: 'cc-1' },
    ],
    ...overrides,
  };
}

describe('AccountingJournalManualAdjustmentService', () => {
  it('creates a balanced manual adjustment draft and audits in the same transaction', async () => {
    const db = buildDb();

    const result = await svc(db).createManualAdjustment('tenant-1', 'user-1', input());

    expect(db.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', tenantId: 'tenant-1', isActive: true },
      select: {
        id: true,
        lawyer: { select: { lawyerRank: true } },
        staffMember: { select: { staffType: true } },
      },
    });

    expect(db.writer.write).toHaveBeenCalledTimes(1);
    // writer receives the transaction client as the 2nd arg (same-transaction guarantee)
    expect(db.writer.write.mock.calls[0][1]).toBe(db.tx);

    const draft = db.writer.write.mock.calls[0][0].draft;
    expect(draft).toMatchObject({
      tenantId: 'tenant-1',
      caseId: 'case-1',
      currency: 'TRY',
      entryType: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT',
      sourceType: 'ACCOUNTING_JOURNAL_ENTRY',
      sourceId: 'manual-adjustment-1',
      sourceAction: 'manual-adjustment',
      sourceVersion: 'manual-adjustment:v1',
      postedById: 'user-1',
      reversalOf: null,
      metadata: expect.objectContaining({
        authorizationMode: 'DIRECT_OFFICE_ADMIN_CAPABILITY',
        sourceName: 'ops-correction',
        adjustmentAmount: '10.00',
        reason: input().reason,
        evidenceRef: 'EV-1',
      }),
    });
    expect(draft.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(draft.lines).toEqual([
      expect.objectContaining({ lineNo: 1, accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '10.00', collectionId: null, payoutId: null, offsetId: null }),
      expect.objectContaining({ lineNo: 2, accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '10.00', collectionId: null, payoutId: null, offsetId: null }),
    ]);

    expect(db.audit.logInTransaction).toHaveBeenCalledWith(
      db.tx,
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT_RECORDED',
        entityType: 'AccountingJournalEntry',
        entityId: 'journal-manual-1',
        metadata: expect.objectContaining({
          journalEntryId: 'journal-manual-1',
          authorizationMode: 'DIRECT_OFFICE_ADMIN_CAPABILITY',
          sourceName: 'ops-correction',
        }),
      }),
    );
    // writer runs before audit inside the transaction
    expect(db.writer.write.mock.invocationCallOrder[0]).toBeLessThan(db.audit.logInTransaction.mock.invocationCallOrder[0]);

    expect(result).toEqual({
      status: 'CREATED',
      journalEntryId: 'journal-manual-1',
      idempotencyKey: draft.idempotencyKey,
      sourceVersion: 'manual-adjustment:v1',
      lineCount: 2,
    });
  });

  it('allows MANAGER office-admin capacity', async () => {
    const db = buildDb({ user: MANAGER });

    await expect(svc(db).createManualAdjustment('tenant-1', 'user-1', input())).resolves.toMatchObject({
      status: 'CREATED',
    });
  });

  it('rejects non-office-admin actors before building or writing the journal', async () => {
    const db = buildDb({ user: PLAIN_LAWYER });

    await expect(svc(db).createManualAdjustment('tenant-1', 'user-1', input())).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.writer.write).not.toHaveBeenCalled();
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a foreign-tenant caseId before building or writing the journal (404)', async () => {
    const db = buildDb({ ownedCaseIds: [] });

    await expect(svc(db).createManualAdjustment('tenant-1', 'user-1', input())).rejects.toBeInstanceOf(NotFoundException);
    expect(db.prisma.case.findMany).toHaveBeenCalledWith({ where: { id: { in: ['case-1'] }, tenantId: 'tenant-1' }, select: { id: true } });
    expect(db.writer.write).not.toHaveBeenCalled();
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('accepts a valid same-tenant caseId/clientId/caseClientId', async () => {
    const db = buildDb({ ownedCaseIds: ['case-1'], ownedClientIds: ['client-1'], ownedCaseClientIds: ['cc-1'] });

    await expect(svc(db).createManualAdjustment('tenant-1', 'user-1', input())).resolves.toMatchObject({
      status: 'CREATED',
    });
  });

  it('rejects a foreign-tenant clientId before building or writing the journal (404)', async () => {
    const db = buildDb({ ownedClientIds: [] });

    await expect(svc(db).createManualAdjustment('tenant-1', 'user-1', input())).rejects.toBeInstanceOf(NotFoundException);
    expect(db.writer.write).not.toHaveBeenCalled();
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a foreign-tenant/invalid caseClientId before building or writing the journal (400)', async () => {
    const db = buildDb({ ownedCaseClientIds: [] });

    await expect(svc(db).createManualAdjustment('tenant-1', 'user-1', input())).rejects.toBeInstanceOf(BadRequestException);
    expect(db.prisma.caseClient.findMany).toHaveBeenCalledWith({ where: { id: { in: ['cc-1'] }, client: { tenantId: 'tenant-1' } }, select: { id: true } });
    expect(db.writer.write).not.toHaveBeenCalled();
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('skips tenant-ownership lookups entirely when lines carry no caseId/clientId/caseClientId', async () => {
    const db = buildDb();

    await expect(
      svc(db).createManualAdjustment('tenant-1', 'user-1', input({
        lines: [
          { accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '10.00', caseId: null, clientId: null, caseClientId: null },
          { accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '10.00', caseId: null, clientId: null, caseClientId: null },
        ],
      })),
    ).resolves.toMatchObject({ status: 'CREATED' });
    expect(db.prisma.case.findMany).not.toHaveBeenCalled();
    expect(db.prisma.client.findMany).not.toHaveBeenCalled();
    expect(db.prisma.caseClient.findMany).not.toHaveBeenCalled();
  });

  it('requires a meaningful reason before authorization (400)', async () => {
    const db = buildDb();

    await expect(
      svc(db).createManualAdjustment('tenant-1', 'user-1', input({ reason: 'short' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('requires the idempotency key before authorization (400)', async () => {
    const db = buildDb();

    await expect(
      svc(db).createManualAdjustment('tenant-1', 'user-1', input({ idempotencyKey: '   ' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an unbalanced draft as a domain conflict before calling the writer (409)', async () => {
    const db = buildDb();

    await expect(
      svc(db).createManualAdjustment('tenant-1', 'user-1', input({
        amount: '10.00',
        lines: [
          { accountCode: 'CASH_CLEARING', direction: 'DEBIT', amount: '10.00', caseId: 'case-1', clientId: null, caseClientId: null },
          { accountCode: 'CLIENT_PAYABLE', direction: 'CREDIT', amount: '9.00', caseId: 'case-1', clientId: null, caseClientId: null },
        ],
      })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.writer.write).not.toHaveBeenCalled();
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('skips duplicate audit on idempotent replay', async () => {
    const db = buildDb({ writerStatus: 'REPLAYED' });

    const result = await svc(db).createManualAdjustment('tenant-1', 'user-1', input());

    expect(db.writer.write).toHaveBeenCalledTimes(1);
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'REPLAYED', journalEntryId: 'journal-manual-1' });
  });

  it('fails closed when the writer rejects a same-key/different-payload hash mismatch (409)', async () => {
    const db = buildDb({
      writerResult: {
        ok: false,
        errors: [
          {
            code: 'SOURCE_HASH_MISMATCH',
            message: 'Accounting journal source hash mismatch on replay.',
            details: { sourceType: 'ACCOUNTING_JOURNAL_ENTRY' },
          },
        ],
      },
    });

    await expect(svc(db).createManualAdjustment('tenant-1', 'user-1', input())).rejects.toBeInstanceOf(ConflictException);
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('uses deterministic sourceVersion, idempotency key and sourceHash for the same input across calls', async () => {
    const db = buildDb();
    const service = svc(db);

    await service.createManualAdjustment('tenant-1', 'user-1', input());
    await service.createManualAdjustment('tenant-1', 'user-1', input());

    const firstDraft = db.writer.write.mock.calls[0][0].draft;
    const secondDraft = db.writer.write.mock.calls[1][0].draft;
    expect(secondDraft.sourceVersion).toBe(firstDraft.sourceVersion);
    expect(secondDraft.idempotencyKey).toBe(firstDraft.idempotencyKey);
    expect(secondDraft.sourceHash).toBe(firstDraft.sourceHash);
  });

  it('rolls the transaction back when the audit write fails and never returns success', async () => {
    const auditError = new Error('audit write failed');
    const db = buildDb({ auditReject: auditError });

    await expect(svc(db).createManualAdjustment('tenant-1', 'user-1', input())).rejects.toBe(auditError);
    // writer ran, but the rejected audit propagates out of $transaction → real tx would roll back the write
    expect(db.writer.write).toHaveBeenCalledTimes(1);
  });
});
