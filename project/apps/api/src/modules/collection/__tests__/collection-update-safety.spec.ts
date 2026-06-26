import { ConflictException, NotFoundException } from '@nestjs/common';
import { CollectionService } from '../collection.service';
import { CollectionStatus } from '../dto/collection.dto';

function buildService(prisma: any) {
  return new CollectionService(prisma, {} as any, {} as any);
}

function buildPrisma(collection: any) {
  return {
    collection: {
      findFirst: jest.fn(async () => collection),
      update: jest.fn(async ({ data }) => ({ ...collection, ...data })),
    },
  };
}

function expectCollectionRequiresReversal(error: any, fields?: string[]) {
  expect(error).toBeInstanceOf(ConflictException);
  expect(error.getStatus()).toBe(409);
  expect(error.getResponse()).toMatchObject({
    errorCode: 'COLLECTION_REQUIRES_REVERSAL',
    ...(fields ? { fields } : {}),
  });
}

describe('CollectionService.update TM3-S1 safety', () => {
  it('rejects posted/confirmed amount updates', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', status: CollectionStatus.CONFIRMED, allocations: [] });
    const service = buildService(prisma);

    try {
      await service.update('t1', 'col1', { amount: 2000 } as any);
      throw new Error('update should have failed');
    } catch (error: any) {
      expectCollectionRequiresReversal(error, ['amount']);
    }

    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it('rejects posted/confirmed public status cancellation through update', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', status: CollectionStatus.CONFIRMED, allocations: [] });
    const service = buildService(prisma);

    try {
      await service.update('t1', 'col1', { status: CollectionStatus.CANCELLED } as any);
      throw new Error('update should have failed');
    } catch (error: any) {
      expectCollectionRequiresReversal(error, ['status']);
    }

    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it('rejects posted/confirmed bankName updates as payment metadata', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', status: CollectionStatus.CONFIRMED, allocations: [] });
    const service = buildService(prisma);

    try {
      await service.update('t1', 'col1', { bankName: 'Banka A' } as any);
      throw new Error('update should have failed');
    } catch (error: any) {
      expectCollectionRequiresReversal(error, ['bankName']);
    }

    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it('allows posted/confirmed metadata updates without ledger-impacting fields', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', status: CollectionStatus.CONFIRMED, allocations: [] });
    const service = buildService(prisma);

    await service.update('t1', 'col1', { description: 'dekont notu', receiptNo: 'R-1' } as any);

    expect(prisma.collection.update).toHaveBeenCalledWith({
      where: { id: 'col1' },
      data: {
        description: 'dekont notu',
        receiptNo: 'R-1',
      },
      include: { allocations: true },
    });
  });

  it('allows draft/unposted amount/date updates', async () => {
    const prisma = buildPrisma({ id: 'col1', tenantId: 't1', status: CollectionStatus.PENDING, allocations: [] });
    const service = buildService(prisma);

    await service.update('t1', 'col1', { amount: 500, date: '2026-01-02' } as any);

    expect(prisma.collection.update).toHaveBeenCalledWith({
      where: { id: 'col1' },
      data: expect.objectContaining({
        amount: 500,
        date: new Date('2026-01-02'),
      }),
      include: { allocations: true },
    });
  });

  it('fails closed on tenant mismatch without mutation', async () => {
    const prisma = buildPrisma(null);
    const service = buildService(prisma);

    await expect(service.update('tenant-a', 'collection-b', { amount: 2000 } as any)).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.collection.findFirst).toHaveBeenCalledWith({
      where: { id: 'collection-b', tenantId: 'tenant-a' },
      include: {
        case: {
          select: { id: true, fileNumber: true, executionFileNumber: true },
        },
        allocations: true,
      },
    });
    expect(prisma.collection.update).not.toHaveBeenCalled();
  });
});