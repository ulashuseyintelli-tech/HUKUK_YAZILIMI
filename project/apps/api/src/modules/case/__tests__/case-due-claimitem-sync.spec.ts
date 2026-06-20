/**
 * PR-ALACAK-1 — post-create Due ↔ ClaimItem marker'lı sync testleri.
 *
 * Kapsam: createDue/updateDue/deleteDue yalnız `metadata.dueSync.sourceDueId`
 * marker'ı ile güvenli eşleşen ClaimItem'ı senkronlar; eski unmarked kayıtlar
 * için heuristic çalışmaz.
 */

import { NotFoundException } from '@nestjs/common';
import { ClaimItemType } from '@prisma/client';
import { CaseService } from '../case.service';
import { DueType } from '../dto/case.dto';

const stub = {} as any;

function makeService(tx: any) {
  const prisma = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  } as any;
  return { service: new CaseService(prisma, stub, stub, stub, stub, stub, stub, stub, stub, stub), prisma };
}

function makeDue(overrides: Record<string, any> = {}) {
  const base = {
    id: 'due-1',
    caseId: 'case-1',
    type: DueType.PRINCIPAL,
    description: 'Ana alacak',
    amount: 1000,
    dueDate: new Date('2026-01-01T00:00:00.000Z'),
    currency: 'TRY',
    sortOrder: 1,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) (base as any)[key] = value;
  }
  return base;
}

function makeTx(overrides: Record<string, any> = {}) {
  const tx = {
    case: {
      findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })),
    },
    due: {
      aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })),
      create: jest.fn(async ({ data }: any) => makeDue({ ...data, id: 'due-1' })),
      findFirst: jest.fn(async () => makeDue()),
      update: jest.fn(async ({ data }: any) => makeDue({ ...data })),
      delete: jest.fn(async () => makeDue()),
    },
    claimItem: {
      create: jest.fn(async ({ data }: any) => ({ id: 'claim-1', ...data })),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: any) => ({ id: 'claim-1', ...data })),
    },
    ...overrides,
  };
  return tx;
}

describe('CaseService Due ↔ ClaimItem post-create sync (PR-ALACAK-1)', () => {
  it('createDue PRINCIPAL → markerlı ClaimItem.PRINCIPAL oluşturur', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.createDue('tenant-1', 'case-1', {
      type: DueType.PRINCIPAL,
      description: 'Ana alacak',
      amount: 1000,
      dueDate: '2026-01-01',
      currency: 'TRY',
    });

    expect(tx.claimItem.create).toHaveBeenCalledTimes(1);
    expect(tx.claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        caseId: 'case-1',
        itemType: ClaimItemType.PRINCIPAL,
        originalAmount: 1000,
        demandedAmount: 1000,
        amount: 1000,
        currency: 'TRY',
        metadata: {
          dueSync: {
            sourceDueId: 'due-1',
            mappedFrom: 'Due',
          },
        },
      }),
    });
  });

  it('createDue NAFAKA → ClaimItem oluşturmaz', async () => {
    const tx = makeTx({
      due: {
        aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })),
        create: jest.fn(async ({ data }: any) => makeDue({ ...data, id: 'due-nafaka', type: DueType.NAFAKA })),
      },
    });
    const { service } = makeService(tx);

    await service.createDue('tenant-1', 'case-1', {
      type: DueType.NAFAKA,
      description: 'Nafaka taksiti',
      amount: 500,
      dueDate: '2026-01-01',
      currency: 'TRY',
    });

    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });

  it('updateDue markerlı ClaimItem amount/description/dueDate alanlarını günceller', async () => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue()),
        update: jest.fn(async ({ data }: any) =>
          makeDue({
            ...data,
            amount: 1250,
            description: 'Güncel ana alacak',
            dueDate: new Date('2026-02-01T00:00:00.000Z'),
          }),
        ),
      },
      claimItem: {
        findMany: jest.fn(async () => [{ id: 'claim-1' }]),
        update: jest.fn(async ({ data }: any) => ({ id: 'claim-1', ...data })),
      },
    });
    const { service } = makeService(tx);

    await service.updateDue('tenant-1', 'case-1', 'due-1', {
      amount: 1250,
      description: 'Güncel ana alacak',
      dueDate: '2026-02-01',
    });

    expect(tx.claimItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        metadata: { path: ['dueSync', 'sourceDueId'], equals: 'due-1' },
      },
      take: 2,
    });
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'claim-1' },
      data: expect.objectContaining({
        itemType: ClaimItemType.PRINCIPAL,
        originalAmount: 1250,
        demandedAmount: 1250,
        amount: 1250,
        description: 'Güncel ana alacak',
        dueDate: new Date('2026-02-01T00:00:00.000Z'),
      }),
    });
  });

  it('case-create markerıyla oluşan ClaimItemı updateDue senkronlar', async () => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue()),
        update: jest.fn(async ({ data }: any) =>
          makeDue({
            ...data,
            amount: 1500,
            description: 'Açılış alacağı güncel',
            dueDate: new Date('2026-03-01T00:00:00.000Z'),
          }),
        ),
      },
      claimItem: {
        findMany: jest.fn(async () => [{ id: 'claim-opening' }]),
        update: jest.fn(async ({ data }: any) => ({ id: 'claim-opening', ...data })),
      },
    });
    const { service } = makeService(tx);
    const createTx = {
      claimItem: {
        create: jest.fn(async ({ data }: any) => ({ id: 'claim-opening', ...data })),
      },
    } as any;

    await (service as any).createClaimItemsFromDues(createTx, 'tenant-1', 'case-1', [makeDue()]);
    expect(createTx.claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          dueSync: {
            sourceDueId: 'due-1',
            mappedFrom: 'Due',
          },
        },
      }),
    });

    await service.updateDue('tenant-1', 'case-1', 'due-1', {
      amount: 1500,
      description: 'Açılış alacağı güncel',
      dueDate: '2026-03-01',
    });

    expect(tx.claimItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        metadata: { path: ['dueSync', 'sourceDueId'], equals: 'due-1' },
      },
      take: 2,
    });
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'claim-opening' },
      data: expect.objectContaining({
        originalAmount: 1500,
        demandedAmount: 1500,
        amount: 1500,
        description: 'Açılış alacağı güncel',
        dueDate: new Date('2026-03-01T00:00:00.000Z'),
      }),
    });
  });

  it('updateDue unmarked eski kayıtta heuristic yapmaz', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await service.updateDue('tenant-1', 'case-1', 'due-1', {
      amount: 1250,
      description: 'Güncel ana alacak',
      dueDate: '2026-02-01',
    });

    expect(tx.claimItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        metadata: { path: ['dueSync', 'sourceDueId'], equals: 'due-1' },
      },
      take: 2,
    });
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  it('deleteDue markerlı ClaimItemı hard delete yerine CANCELLED yapar', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => [{ id: 'claim-1' }]),
        update: jest.fn(async ({ data }: any) => ({ id: 'claim-1', ...data })),
      },
    });
    const { service } = makeService(tx);

    await service.deleteDue('tenant-1', 'case-1', 'due-1');

    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'claim-1' },
      data: { status: 'CANCELLED' },
    });
    expect(tx.due.delete).toHaveBeenCalledWith({ where: { id: 'due-1' } });
  });

  it('case-create markerıyla oluşan ClaimItemı deleteDue CANCELLED yapar', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => [{ id: 'claim-opening' }]),
        update: jest.fn(async ({ data }: any) => ({ id: 'claim-opening', ...data })),
      },
    });
    const { service } = makeService(tx);
    const createTx = {
      claimItem: {
        create: jest.fn(async ({ data }: any) => ({ id: 'claim-opening', ...data })),
      },
    } as any;

    await (service as any).createClaimItemsFromDues(createTx, 'tenant-1', 'case-1', [makeDue()]);
    expect(createTx.claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          dueSync: {
            sourceDueId: 'due-1',
            mappedFrom: 'Due',
          },
        },
      }),
    });

    await service.deleteDue('tenant-1', 'case-1', 'due-1');

    expect(tx.claimItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        metadata: { path: ['dueSync', 'sourceDueId'], equals: 'due-1' },
      },
      take: 2,
    });
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'claim-opening' },
      data: { status: 'CANCELLED' },
    });
  });

  it('cross-tenant caseId ile Due/ClaimItem sync yapılamaz', async () => {
    const tx = makeTx({
      case: {
        findFirst: jest.fn(async () => null),
      },
    });
    const { service } = makeService(tx);

    await expect(
      service.createDue('tenant-other', 'case-1', {
        type: DueType.PRINCIPAL,
        description: 'Ana alacak',
        amount: 1000,
        dueDate: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.due.create).not.toHaveBeenCalled();
    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });
});
