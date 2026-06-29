import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClientPayoutManualReversalService } from '../client-payout-manual-reversal.service';

const D = (n: number) => new Prisma.Decimal(n);
const PARTNER = { lawyer: { lawyerRank: 'PARTNER' }, staffMember: null };
const MANAGER = { lawyer: null, staffMember: { staffType: 'MANAGER' } };
const PLAIN_LAWYER = { lawyer: { lawyerRank: 'LAWYER' }, staffMember: null };

const OPEN_ROW = {
  id: 'mr-1',
  tenantId: 't1',
  caseId: 'case-1',
  caseClientId: 'cc-1',
  amount: D(500),
  currency: 'TRY',
  status: 'OPEN',
  closureMethod: null,
  confidence: 'EXACT',
  collectionId: 'col-1',
  collectionDispositionId: 'disp-1',
  collectionDispositionLineId: 'line-1',
  clientPayoutId: 'payout-1',
  clientPayoutAllocationId: 'alloc-1',
  openedAt: new Date('2026-06-01T00:00:00.000Z'),
  closedAt: null,
  closedById: null,
  closureNote: null,
  evidenceRef: null,
};

function buildDb(opts: {
  user?: any;
  existing?: any;
  updateCount?: number;
  auditReject?: Error;
} = {}) {
  const closedRow = {
    ...(opts.existing ?? OPEN_ROW),
    status: 'CLOSED',
    closureMethod: 'REFUND',
    closedAt: new Date('2026-06-29T00:00:00.000Z'),
    closedById: 'u1',
    closureNote: 'refund handled externally',
    evidenceRef: 'ev-1',
  };
  const tx: any = {
    clientPayoutManualReversal: {
      findFirst: jest.fn().mockResolvedValue(opts.existing === undefined ? OPEN_ROW : opts.existing),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue(closedRow),
    },
    auditLog: {
      create: opts.auditReject ? jest.fn().mockRejectedValue(opts.auditReject) : jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    clientPayout: { update: jest.fn(), create: jest.fn() },
    clientPayoutAllocation: { update: jest.fn(), create: jest.fn(), createMany: jest.fn() },
    collection: { update: jest.fn() },
    collectionDisposition: { update: jest.fn() },
    balanceLedger: { create: jest.fn() },
    clientStatement: { update: jest.fn(), create: jest.fn() },
    clientOffset: { create: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
  };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(opts.user ?? PARTNER) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const audit: any = {
    logInTransaction: opts.auditReject
      ? jest.fn().mockRejectedValue(opts.auditReject)
      : jest.fn().mockImplementation(async (innerTx: any, input: any) => innerTx.auditLog.create({ data: input })),
  };
  return { prisma, tx, audit };
}

const svc = (db: any) => new ClientPayoutManualReversalService(db.prisma, db.audit);

describe('ClientPayoutManualReversalService.close', () => {
  it('closes OPEN workflow with REFUND and transactional audit', async () => {
    const db = buildDb();
    const res = await svc(db).close('t1', 'u1', 'mr-1', {
      closureMethod: 'REFUND',
      evidenceRef: 'ev-1',
    });

    expect(res.status).toBe('CLOSED');
    expect(db.tx.clientPayoutManualReversal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mr-1', tenantId: 't1', status: 'OPEN' },
        data: expect.objectContaining({
          status: 'CLOSED',
          closureMethod: 'REFUND',
          closedById: 'u1',
          evidenceRef: 'ev-1',
        }),
      }),
    );
    expect(db.audit.logInTransaction).toHaveBeenCalledWith(
      db.tx,
      expect.objectContaining({
        action: 'CLIENT_PAYOUT_MANUAL_REVERSAL_CLOSED',
        entityType: 'ClientPayoutManualReversal',
        entityId: 'mr-1',
        userId: 'u1',
        metadata: expect.objectContaining({
          manualReversalId: 'mr-1',
          tenantId: 't1',
          caseId: 'case-1',
          caseClientId: 'cc-1',
          closureMethod: 'REFUND',
          evidenceRef: 'ev-1',
          authorizationMode: 'DIRECT_OFFICE_ADMIN_CAPABILITY',
        }),
      }),
    );
    expect(db.audit.logInTransaction.mock.calls[0][1].metadata).not.toHaveProperty('closureNote');
  });

  it('closes OPEN workflow with OFFSET as metadata-only and never calls ClientOffset paths', async () => {
    const db = buildDb();
    await svc(db).close('t1', 'u1', 'mr-1', {
      closureMethod: 'OFFSET',
      closureNote: 'offset decision approved manually',
    });

    expect(db.tx.clientPayoutManualReversal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ closureMethod: 'OFFSET' }) }),
    );
    expect(db.tx.clientOffset.create).not.toHaveBeenCalled();
    expect(db.tx.clientOffset.findMany).not.toHaveBeenCalled();
    expect(db.tx.clientOffset.aggregate).not.toHaveBeenCalled();
  });

  it('closes OPEN workflow with WAIVER when strong closure note is provided', async () => {
    const db = buildDb({ user: MANAGER });
    await svc(db).close('t1', 'manager-1', 'mr-1', {
      closureMethod: 'WAIVER',
      closureNote: 'authorized waiver decision by office management',
    });

    expect(db.tx.clientPayoutManualReversal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ closureMethod: 'WAIVER', closedById: 'manager-1' }) }),
    );
  });

  it('tenant mismatch is blocked as not found and does not mutate', async () => {
    const db = buildDb({ existing: null });

    await expect(
      svc(db).close('other-tenant', 'u1', 'mr-1', { closureMethod: 'REFUND', evidenceRef: 'ev-1' }),
    ).rejects.toThrow(NotFoundException);
    expect(db.tx.clientPayoutManualReversal.updateMany).not.toHaveBeenCalled();
  });

  it('CLOSED workflow cannot be closed again', async () => {
    const db = buildDb({ existing: { ...OPEN_ROW, status: 'CLOSED', closureMethod: 'REFUND' } });

    await expect(
      svc(db).close('t1', 'u1', 'mr-1', { closureMethod: 'REFUND', evidenceRef: 'ev-1' }),
    ).rejects.toThrow(ConflictException);
    expect(db.tx.clientPayoutManualReversal.updateMany).not.toHaveBeenCalled();
  });

  it('CANCELLED workflow cannot be closed', async () => {
    const db = buildDb({ existing: { ...OPEN_ROW, status: 'CANCELLED' } });

    await expect(
      svc(db).close('t1', 'u1', 'mr-1', { closureMethod: 'REFUND', evidenceRef: 'ev-1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('race-safe update count 0 is conflict, not silent success', async () => {
    const db = buildDb({ updateCount: 0 });

    await expect(
      svc(db).close('t1', 'u1', 'mr-1', { closureMethod: 'REFUND', evidenceRef: 'ev-1' }),
    ).rejects.toThrow(ConflictException);
    expect(db.tx.clientPayoutManualReversal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mr-1', tenantId: 't1', status: 'OPEN' } }),
    );
    expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('audit failure rejects so the same transaction rolls back the closure write', async () => {
    const db = buildDb({ auditReject: new Error('audit down') });

    await expect(
      svc(db).close('t1', 'u1', 'mr-1', { closureMethod: 'REFUND', evidenceRef: 'ev-1' }),
    ).rejects.toThrow('audit down');
    expect(db.tx.clientPayoutManualReversal.updateMany).toHaveBeenCalled();
    expect(db.audit.logInTransaction).toHaveBeenCalledWith(db.tx, expect.any(Object));
  });

  it('does not mutate payout, allocation, collection, disposition marker, ledger, or statement records', async () => {
    const db = buildDb();
    await svc(db).close('t1', 'u1', 'mr-1', { closureMethod: 'REFUND', evidenceRef: 'ev-1' });

    expect(db.tx.clientPayout.update).not.toHaveBeenCalled();
    expect(db.tx.clientPayout.create).not.toHaveBeenCalled();
    expect(db.tx.clientPayoutAllocation.update).not.toHaveBeenCalled();
    expect(db.tx.clientPayoutAllocation.create).not.toHaveBeenCalled();
    expect(db.tx.clientPayoutAllocation.createMany).not.toHaveBeenCalled();
    expect(db.tx.collection.update).not.toHaveBeenCalled();
    expect(db.tx.collectionDisposition.update).not.toHaveBeenCalled();
    expect(db.tx.balanceLedger.create).not.toHaveBeenCalled();
    expect(db.tx.clientStatement.update).not.toHaveBeenCalled();
    expect(db.tx.clientStatement.create).not.toHaveBeenCalled();
  });

  it('non office-admin actor is forbidden before transaction', async () => {
    const db = buildDb({ user: PLAIN_LAWYER });

    await expect(
      svc(db).close('t1', 'lawyer-1', 'mr-1', { closureMethod: 'REFUND', evidenceRef: 'ev-1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates method-specific closure evidence', async () => {
    const db = buildDb();
    await expect(svc(db).close('t1', 'u1', 'mr-1', { closureMethod: 'REFUND' } as any)).rejects.toThrow(BadRequestException);
    await expect(svc(db).close('t1', 'u1', 'mr-1', { closureMethod: 'OFFSET' } as any)).rejects.toThrow(BadRequestException);
    await expect(
      svc(db).close('t1', 'u1', 'mr-1', { closureMethod: 'WAIVER', closureNote: 'too short' }),
    ).rejects.toThrow(BadRequestException);
  });
});
