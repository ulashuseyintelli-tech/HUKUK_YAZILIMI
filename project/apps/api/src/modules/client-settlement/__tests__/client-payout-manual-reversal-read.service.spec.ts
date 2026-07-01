import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClientPayoutManualReversalReadService } from '../client-payout-manual-reversal-read.service';

const D = (n: number) => new Prisma.Decimal(n);

const baseRow = {
  id: 'mr-1',
  tenantId: 't1',
  caseId: 'case-1',
  caseClientId: 'cc-1',
  amount: D(500),
  currency: 'TRY',
  status: 'OPEN',
  closureMethod: null,
  confidence: 'EXACT',
  sourceActionId: 'payment-reversed:1',
  collectionId: 'col-1',
  collectionDispositionId: 'disp-1',
  collectionDispositionLineId: 'line-1',
  clientPayoutId: 'payout-1',
  clientPayoutAllocationId: 'alloc-1',
  openedAt: new Date('2026-06-01T00:00:00.000Z'),
  openedById: 'u-open',
  closedAt: null,
  closedById: null,
  cancelledAt: null,
  cancelledById: null,
  note: 'internal note',
  closureNote: null,
  evidenceRef: null,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  case: {
    id: 'case-1',
    fileNumber: '2026/1',
    executionFileNumber: 'E-2026/1',
    caseDate: new Date('2026-01-01T00:00:00.000Z'),
  },
  caseClient: {
    id: 'cc-1',
    clientId: 'client-1',
    role: 'ALACAKLI',
    client: {
      id: 'client-1',
      displayName: 'Acme A.S.',
      name: null,
      firstName: null,
      lastName: null,
      companyName: 'Acme',
    },
  },
  collection: {
    id: 'col-1',
    amount: D(600),
    currency: 'TRY',
    status: 'CONFIRMED',
    date: new Date('2026-05-01T00:00:00.000Z'),
    description: 'collection',
  },
  collectionDisposition: {
    id: 'disp-1',
    totalAmount: D(500),
    currency: 'TRY',
    status: 'POSTED',
    postedAt: new Date('2026-05-02T00:00:00.000Z'),
    manualReversalRequiredAt: new Date('2026-06-01T00:00:00.000Z'),
  },
  collectionDispositionLine: {
    id: 'line-1',
    type: 'CLIENT_PAYABLE',
    amount: D(500),
    caseClientId: 'cc-1',
    note: 'line note',
  },
  clientPayout: {
    id: 'payout-1',
    amount: D(500),
    currency: 'TRY',
    status: 'RECORDED',
    paidAt: new Date('2026-05-03T00:00:00.000Z'),
    paidById: 'u-paid',
    note: 'payout note',
  },
  clientPayoutAllocation: {
    id: 'alloc-1',
    amount: D(500),
    currency: 'TRY',
    allocatedAt: new Date('2026-05-03T00:00:00.000Z'),
    allocatedById: 'u-paid',
  },
};

function buildDb(rows = [baseRow], detailRow: any = baseRow) {
  const prisma: any = {
    clientPayoutManualReversal: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
      findFirst: jest.fn().mockResolvedValue(detailRow),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'audit-1',
          action: 'CLIENT_PAYOUT_MANUAL_REVERSAL_CLOSED',
          entityType: 'ClientPayoutManualReversal',
          entityId: 'mr-1',
          userId: 'u-close',
          description: 'closed',
          metadata: { closureMethod: 'REFUND' },
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
        },
      ]),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    clientPayout: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    clientPayoutAllocation: { create: jest.fn(), createMany: jest.fn(), update: jest.fn() },
    balanceLedger: { create: jest.fn(), update: jest.fn() },
    clientStatement: { create: jest.fn(), update: jest.fn() },
    clientOffset: { create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    collection: { create: jest.fn(), update: jest.fn() },
    collectionDisposition: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  };
  const audit: any = {
    getEntityHistory: jest.fn().mockResolvedValue([
      {
        id: 'audit-detail-1',
        action: 'CLIENT_PAYOUT_MANUAL_REVERSAL_CLOSED',
        entityType: 'ClientPayoutManualReversal',
        entityId: 'mr-1',
        userId: 'u-close',
        description: 'closed',
        metadata: { closureMethod: 'REFUND' },
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      },
    ]),
    log: jest.fn(),
    logInTransaction: jest.fn(),
  };
  return { prisma, audit, service: new ClientPayoutManualReversalReadService(prisma, audit) };
}

function expectNoWriteCalls(db: ReturnType<typeof buildDb>) {
  expect(db.prisma.clientPayoutManualReversal.create).not.toHaveBeenCalled();
  expect(db.prisma.clientPayoutManualReversal.update).not.toHaveBeenCalled();
  expect(db.prisma.clientPayoutManualReversal.updateMany).not.toHaveBeenCalled();
  expect(db.prisma.clientPayoutManualReversal.upsert).not.toHaveBeenCalled();
  expect(db.prisma.clientPayoutManualReversal.delete).not.toHaveBeenCalled();
  expect(db.prisma.auditLog.create).not.toHaveBeenCalled();
  expect(db.audit.log).not.toHaveBeenCalled();
  expect(db.audit.logInTransaction).not.toHaveBeenCalled();
  expect(db.prisma.clientPayout.create).not.toHaveBeenCalled();
  expect(db.prisma.clientPayout.update).not.toHaveBeenCalled();
  expect(db.prisma.clientPayoutAllocation.create).not.toHaveBeenCalled();
  expect(db.prisma.clientPayoutAllocation.createMany).not.toHaveBeenCalled();
  expect(db.prisma.balanceLedger.create).not.toHaveBeenCalled();
  expect(db.prisma.clientStatement.create).not.toHaveBeenCalled();
  expect(db.prisma.clientOffset.create).not.toHaveBeenCalled();
  expect(db.prisma.collection.update).not.toHaveBeenCalled();
  expect(db.prisma.collectionDisposition.update).not.toHaveBeenCalled();
}

describe('ClientPayoutManualReversalReadService', () => {
  it('defaults to OPEN queue, tenant scope, and batched audit projection', async () => {
    const db = buildDb();

    const result = await db.service.list('t1', {});

    expect(db.prisma.clientPayoutManualReversal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', status: 'OPEN' },
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 50,
      }),
    );
    expect(db.prisma.auditLog.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 't1',
          entityType: 'ClientPayoutManualReversal',
          entityId: { in: ['mr-1'] },
        },
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'mr-1',
        status: 'OPEN',
        clientId: 'client-1',
        clientName: 'Acme A.S.',
        closureNotePresent: false,
        evidenceRef: null,
        audit: expect.objectContaining({ count: 1, latestAction: 'CLIENT_PAYOUT_MANUAL_REVERSAL_CLOSED' }),
      }),
    );
    expect(result.items[0]).not.toHaveProperty('dedupeKey');
    expect(result).toEqual(expect.objectContaining({ page: 1, limit: 50, total: 1 }));
    expectNoWriteCalls(db);
  });

  it('supports CLOSED history with closureMethod filter', async () => {
    const row = {
      ...baseRow,
      status: 'CLOSED',
      closureMethod: 'REFUND',
      closedAt: new Date('2026-06-05T00:00:00.000Z'),
      closedById: 'u-close',
      closureNote: 'refund handled externally',
      evidenceRef: 'ev-1',
    };
    const db = buildDb([row], row);

    await db.service.list('t1', { status: 'CLOSED' as any, closureMethod: 'REFUND' as any });

    expect(db.prisma.clientPayoutManualReversal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', status: 'CLOSED', closureMethod: 'REFUND' },
        orderBy: [{ closedAt: 'desc' }, { openedAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expectNoWriteCalls(db);
  });

  it('applies clientId relation, case, caseClient, currency, and date filters', async () => {
    const db = buildDb();

    await db.service.list('t1', {
      clientId: 'client-1',
      caseId: 'case-1',
      caseClientId: 'cc-1',
      currency: 'TRY',
      openedFrom: '2026-06-01T00:00:00.000Z',
      openedTo: '2026-06-30T00:00:00.000Z',
      closedFrom: '2026-07-01T00:00:00.000Z',
      closedTo: '2026-07-31T00:00:00.000Z',
      page: '2',
      limit: '25',
    });

    expect(db.prisma.clientPayoutManualReversal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          status: 'OPEN',
          caseId: 'case-1',
          caseClientId: 'cc-1',
          caseClient: { clientId: 'client-1' },
          currency: 'TRY',
          openedAt: { gte: new Date('2026-06-01T00:00:00.000Z'), lte: new Date('2026-06-30T00:00:00.000Z') },
          closedAt: { gte: new Date('2026-07-01T00:00:00.000Z'), lte: new Date('2026-07-31T00:00:00.000Z') },
        }),
        skip: 25,
        take: 25,
      }),
    );
    expectNoWriteCalls(db);
  });

  it('projects source linkage fields without exposing full closure note in list', async () => {
    const row = {
      ...baseRow,
      status: 'CLOSED',
      closureMethod: 'WAIVER',
      closureNote: 'authorized waiver decision by management',
      evidenceRef: 'ev-waiver',
      closedAt: new Date('2026-06-05T00:00:00.000Z'),
    };
    const db = buildDb([row], row);

    const result = await db.service.list('t1', { status: 'CLOSED' as any });

    expect(result.items[0].sourceLinkage).toEqual({
      collectionId: 'col-1',
      collectionDispositionId: 'disp-1',
      collectionDispositionLineId: 'line-1',
      clientPayoutId: 'payout-1',
      clientPayoutAllocationId: 'alloc-1',
    });
    expect(result.items[0]).toEqual(expect.objectContaining({ closureNotePresent: true, evidenceRef: 'ev-waiver' }));
    expect(result.items[0]).not.toHaveProperty('closureNote');
    expectNoWriteCalls(db);
  });

  it('returns detail with source details and AuditService entity history', async () => {
    const row = {
      ...baseRow,
      status: 'CLOSED',
      closureMethod: 'REFUND',
      closureNote: 'refund handled externally',
      evidenceRef: 'ev-1',
      closedAt: new Date('2026-06-05T00:00:00.000Z'),
      closedById: 'u-close',
    };
    const db = buildDb([], row);

    const result = await db.service.detail('t1', 'mr-1');

    expect(db.prisma.clientPayoutManualReversal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mr-1', tenantId: 't1' } }),
    );
    expect(db.audit.getEntityHistory).toHaveBeenCalledWith('t1', 'ClientPayoutManualReversal', 'mr-1');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'mr-1',
        closureNote: 'refund handled externally',
        sourceDetails: expect.objectContaining({
          collection: expect.objectContaining({ id: 'col-1', amount: '600' }),
          collectionDispositionLine: expect.objectContaining({ id: 'line-1', amount: '500' }),
          clientPayoutAllocation: expect.objectContaining({ id: 'alloc-1', amount: '500' }),
        }),
        auditHistory: [expect.objectContaining({ id: 'audit-detail-1', action: 'CLIENT_PAYOUT_MANUAL_REVERSAL_CLOSED' })],
      }),
    );
    expectNoWriteCalls(db);
  });

  it('returns not found for cross-tenant or missing detail', async () => {
    const db = buildDb([], null);

    await expect(db.service.detail('t1', 'missing')).rejects.toThrow(NotFoundException);
    expect(db.prisma.clientPayoutManualReversal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'missing', tenantId: 't1' } }),
    );
    expect(db.audit.getEntityHistory).not.toHaveBeenCalled();
    expectNoWriteCalls(db);
  });
});
