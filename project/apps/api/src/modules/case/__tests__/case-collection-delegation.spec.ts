/**
 * G3d - CaseService tahsilat create/cancel -> CollectionService delegasyonu.
 *
 * /cases/:id/collections artik kanonik yola delege eder (event+ledger+guard).
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { CaseService } from '../case.service';

function buildService(coll: any, prisma: any = {}) {
  // CaseService deps sirasi: prisma, audit, clientInfo, interestEngine, expenseRequest,
  // domainEventIngest, collectionService, clientService, lawyerService, debtorService (RFA-016).
  return new CaseService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    coll,
    {} as any,
    {} as any,
    {} as any,
  );
}

function buildPrisma(collection: any) {
  return {
    collection: {
      findFirst: jest.fn(async () => collection),
      update: jest.fn(async ({ data }) => ({ ...collection, ...data })),
      delete: jest.fn(async () => collection),
    },
  };
}

function expectConflict(error: any, response: Record<string, unknown>) {
  expect(error).toBeInstanceOf(ConflictException);
  expect(error.getStatus()).toBe(409);
  expect(error.getResponse()).toMatchObject(response);
}

function expectCollectionRequiresReversal(error: any, fields?: string[]) {
  expectConflict(error, {
    errorCode: 'COLLECTION_REQUIRES_REVERSAL',
    ...(fields ? { fields } : {}),
  });
}

describe('CaseService collection delegation (G3d)', () => {
  it('T1: createCollection -> collectionService.create(tenantId, dto, userId)', async () => {
    const coll = { create: jest.fn(async () => ({ id: 'col1' })), cancel: jest.fn() };
    const svc = buildService(coll);

    await svc.createCollection(
      't1',
      'c1',
      {
        caseDebtorId: 'd1',
        amount: 1000,
        currency: 'TRY',
        type: 'CASH',
        channel: 'BANKA',
        date: '2026-01-01',
        description: 'x',
      } as any,
      'u1',
    );

    expect(coll.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        caseId: 'c1',
        caseDebtorId: 'd1',
        amount: 1000,
        type: 'CASH',
        channel: 'BANKA',
        date: '2026-01-01',
      }),
      'u1',
    );
  });

  it('T4: cancelCollection route caseId + tenant guard sonrası collectionService.cancel delegasyonu yapar', async () => {
    const coll = { create: jest.fn(), cancel: jest.fn(async () => ({ id: 'col1' })) };
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', caseId: 'c1', status: 'CONFIRMED' });
    const svc = buildService(coll, prisma);

    await svc.cancelCollection('t1', 'c1', 'col1', 'iptal nedeni');

    expect(prisma.collection.findFirst).toHaveBeenCalledWith({
      where: { id: 'col1', caseId: 'c1', tenantId: 't1' },
      select: { id: true },
    });
    expect(coll.cancel).toHaveBeenCalledWith('t1', 'col1', { cancelReason: 'iptal nedeni' }, 'c1');
  });

  it('TM3-S2: cancelCollection wrong route caseId fail-closed olur ve cancel delegasyonu yapmaz', async () => {
    const coll = { create: jest.fn(), cancel: jest.fn(async () => ({ id: 'col1' })) };
    const prisma = buildPrisma(null);
    const svc = buildService(coll, prisma);

    await expect(svc.cancelCollection('t1', 'wrong-case', 'col1', 'iptal nedeni')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.collection.findFirst).toHaveBeenCalledWith({
      where: { id: 'col1', caseId: 'wrong-case', tenantId: 't1' },
      select: { id: true },
    });
    expect(coll.cancel).not.toHaveBeenCalled();
  });
  it('TM3-S2: cancelCollection tenant mismatch fail-closed olur ve cancel/event yolu başlamaz', async () => {
    const coll = { create: jest.fn(), cancel: jest.fn(async () => ({ id: 'col1' })) };
    const prisma = buildPrisma(null);
    const svc = buildService(coll, prisma);

    await expect(svc.cancelCollection('tenant-a', 'case-a', 'collection-b', 'iptal nedeni')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.collection.findFirst).toHaveBeenCalledWith({
      where: { id: 'collection-b', caseId: 'case-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(coll.cancel).not.toHaveBeenCalled();
  });
  it('TM3-S1: posted/confirmed delete returns reversal-required conflict and does not hard-delete', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', caseId: 'c1', status: 'CONFIRMED' });
    const svc = buildService({}, prisma);

    try {
      await svc.deleteCollection('t1', 'c1', 'col1');
      throw new Error('deleteCollection should have failed');
    } catch (error: any) {
      expectConflict(error, {
        errorCode: 'COLLECTION_REQUIRES_REVERSAL',
        message: 'Posted/confirmed collection cannot be deleted. Use cancel/reversal flow.',
      });
    }

    expect(prisma.collection.findFirst).toHaveBeenCalledWith({
      where: { id: 'col1', caseId: 'c1', tenantId: 't1' },
    });
    expect(prisma.collection.delete).not.toHaveBeenCalled();
  });

  it('TM3-S1: draft/unposted delete is disabled instead of hard-delete', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', caseId: 'c1', status: 'PENDING' });
    const svc = buildService({}, prisma);

    try {
      await svc.deleteCollection('t1', 'c1', 'col1');
      throw new Error('deleteCollection should have failed');
    } catch (error: any) {
      expectConflict(error, {
        errorCode: 'COLLECTION_DELETE_DISABLED',
        message: 'Collection hard delete is disabled. Use explicit void/discard flow.',
      });
    }

    expect(prisma.collection.delete).not.toHaveBeenCalled();
  });

  it('TM3-S1: delete tenant mismatch fails closed without mutation', async () => {
    const prisma = buildPrisma(null);
    const svc = buildService({}, prisma);

    await expect(svc.deleteCollection('tenant-a', 'case-a', 'collection-b')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.collection.findFirst).toHaveBeenCalledWith({
      where: { id: 'collection-b', caseId: 'case-a', tenantId: 'tenant-a' },
    });
    expect(prisma.collection.delete).not.toHaveBeenCalled();
    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it('TM3-S1: posted/confirmed ledger-impacting update is rejected', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', caseId: 'c1', status: 'CONFIRMED' });
    const svc = buildService({}, prisma);

    try {
      await svc.updateCollection('t1', 'c1', 'col1', { amount: 2000 } as any);
      throw new Error('updateCollection should have failed');
    } catch (error: any) {
      expectCollectionRequiresReversal(error, ['amount']);
    }

    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it('TM3-S1: posted/confirmed bankName update is rejected as payment metadata', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', caseId: 'c1', status: 'CONFIRMED' });
    const svc = buildService({}, prisma);

    try {
      await svc.updateCollection('t1', 'c1', 'col1', { bankName: 'Banka A' } as any);
      throw new Error('updateCollection should have failed');
    } catch (error: any) {
      expectCollectionRequiresReversal(error, ['bankName']);
    }

    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it('TM3-S1: posted/confirmed metadata update stays on shared allowlist', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', caseId: 'c1', status: 'CONFIRMED' });
    const svc = buildService({}, prisma);

    await svc.updateCollection('t1', 'c1', 'col1', { description: 'dekont notu', receiptNo: 'R-1' } as any);

    expect(prisma.collection.update).toHaveBeenCalledWith({
      where: { id: 'col1' },
      data: {
        description: 'dekont notu',
        receiptNo: 'R-1',
      },
    });
  });

  it('TM3-S1: status update is rejected even for draft/unposted collection', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', caseId: 'c1', status: 'PENDING' });
    const svc = buildService({}, prisma);

    try {
      await svc.updateCollection('t1', 'c1', 'col1', { status: 'CONFIRMED' } as any);
      throw new Error('updateCollection should have failed');
    } catch (error: any) {
      expectCollectionRequiresReversal(error, ['status']);
    }

    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it('TM3-S1: update tenant mismatch fails closed without mutation', async () => {
    const prisma = buildPrisma(null);
    const svc = buildService({}, prisma);

    await expect(
      svc.updateCollection('tenant-a', 'case-a', 'collection-b', { amount: 2000 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.collection.findFirst).toHaveBeenCalledWith({
      where: { id: 'collection-b', caseId: 'case-a', tenantId: 'tenant-a' },
    });
    expect(prisma.collection.update).not.toHaveBeenCalled();
    expect(prisma.collection.delete).not.toHaveBeenCalled();
  });
});