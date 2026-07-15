/**
 * PR-ALACAK-1 — post-create Due ↔ ClaimItem marker'lı sync testleri.
 *
 * Kapsam: createDue/updateDue/deleteDue yalnız `metadata.dueSync.sourceDueId`
 * marker'ı ile güvenli eşleşen ClaimItem'ı senkronlar; eski unmarked kayıtlar
 * için heuristic çalışmaz.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClaimItemType } from '@prisma/client';
import { ClaimItemSourceIntegrityException } from '../../claim-item/claim-item-source-integrity.guard';
import { CaseService } from '../case.service';
import { DueType, InterestType } from '../dto/case.dto';

const stub = {} as any;

function makeService(tx: any) {
  const prisma = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  } as any;
  const writerRouter = {
    createSystemClaimItem: jest.fn(async ({ data }: any, database: any) =>
      database.claimItem.create({ data })),
    updateSystemClaimItem: jest.fn(async ({ claimItemId, data }: any, database: any) =>
      database.claimItem.update({ where: { id: claimItemId }, data })),
    cancelSystemClaimItem: jest.fn(async ({ claimItemId }: any, database: any) =>
      database.claimItem.update({ where: { id: claimItemId }, data: { status: 'CANCELLED' } })),
  } as any;
  return {
    service: new CaseService(
      prisma, stub, stub, stub, stub, stub, stub, stub, stub, stub, undefined, writerRouter,
    ),
    prisma,
    writerRouter,
  };
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
      interestType: InterestType.YASAL,
      interestTypeCode: 'LEGAL_3095',
      interestRate: 24,
      interestStartDate: '2026-01-02',
      interestEndDate: '2026-02-02',
    }, 'requester-1');

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
        interestType: InterestType.YASAL,
        interestTypeCode: 'LEGAL_3095',
        interestRate: null,
        interestStartDate: new Date('2026-01-02T00:00:00.000Z'),
        interestEndDate: new Date('2026-02-02T00:00:00.000Z'),
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
    }, 'requester-1');

    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });

  it('createDue YOK niyetini server actor/reason/time ile ClaimItem NO_INTEREST yapar', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.createDue('tenant-1', 'case-1', {
      type: DueType.PRINCIPAL,
      amount: 1000,
      dueDate: '2026-01-01',
      interestTypeCode: null,
      interestRate: null,
      interestAccrualStatus: 'NO_INTEREST',
      noInterestReason: 'sözleşmede faiz yok',
    } as any, 'requester-1');

    expect(tx.claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        interestType: null,
        interestTypeCode: null,
        interestRate: null,
        interestAccrualStatus: 'NO_INTEREST',
        noInterestReason: 'sözleşmede faiz yok',
        noInterestConfirmedById: 'requester-1',
        noInterestConfirmedAt: expect.any(Date),
      }),
    });
  });

  it('direct Due fixed rate eksikse hicbir write yapmadan fail-closed olur', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await expect(service.createDue('tenant-1', 'case-1', {
      type: DueType.PRINCIPAL,
      amount: 1000,
      dueDate: '2026-01-01',
      interestTypeCode: 'CONTRACTUAL',
      interestRate: null,
    } as any, 'requester-1')).rejects.toThrow(/interestRate/);

    expect(tx.due.create).not.toHaveBeenCalled();
    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });

  it('direct Due NO_INTEREST authenticated actor olmadan reddedilir', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await expect(service.createDue('tenant-1', 'case-1', {
      type: DueType.PRINCIPAL,
      amount: 1000,
      dueDate: '2026-01-01',
      interestAccrualStatus: 'NO_INTEREST',
      noInterestReason: 'faiz yok',
    } as any, undefined as any)).rejects.toThrow(/authenticated server context/);

    expect(tx.due.create).not.toHaveBeenCalled();
  });

  it.each([
    [DueType.NAFAKA, DueType.PRINCIPAL],
    [DueType.NAFAKA, DueType.EXPENSE],
    [DueType.PRINCIPAL, DueType.NAFAKA],
    [DueType.OTHER, DueType.NAFAKA],
  ])('updateDue %s -> %s generic geçişini bütün mutationlardan önce reddeder', async (current, requested) => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue({ type: current })),
        update: jest.fn(),
      },
      claimItem: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await expect(
      service.updateDue('tenant-1', 'case-1', 'due-1', { type: requested }, 'requester-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.due.update).not.toHaveBeenCalled();
    expect(tx.claimItem.findMany).not.toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  it('updateDue NAFAKA -> NAFAKA same-side güncellemeye izin verir', async () => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue({ type: DueType.NAFAKA })),
        update: jest.fn(async ({ data }: any) => makeDue({ ...data, type: DueType.NAFAKA })),
      },
      claimItem: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await service.updateDue('tenant-1', 'case-1', 'due-1', {
      type: DueType.NAFAKA,
      amount: 750,
    }, 'requester-1');

    expect(tx.due.update).toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  it('updateDue non-NAFAKA -> non-NAFAKA geçişini ve Due -> ClaimItem sync yönünü korur', async () => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue({ type: DueType.PRINCIPAL })),
        update: jest.fn(async ({ data }: any) => makeDue({ ...data, type: DueType.EXPENSE })),
      },
      claimItem: {
        findMany: jest.fn(async () => [{ id: 'claim-1' }]),
        update: jest.fn(async ({ data }: any) => ({ id: 'claim-1', ...data })),
      },
    });
    const { service } = makeService(tx);

    await service.updateDue(
      'tenant-1', 'case-1', 'due-1', { type: DueType.EXPENSE }, 'requester-1',
    );

    expect(tx.due.update).toHaveBeenCalled();
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'claim-1' },
      data: expect.objectContaining({ itemType: ClaimItemType.EXPENSE }),
    });
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
            interestType: InterestType.TICARI,
            interestRate: 48,
            interestStartDate: new Date('2026-02-02T00:00:00.000Z'),
            interestEndDate: new Date('2026-04-01T00:00:00.000Z'),
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
      interestType: InterestType.TICARI,
      interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2',
      interestRate: 48,
      interestStartDate: '2026-02-02',
      interestEndDate: '2026-04-01',
    }, 'requester-1');

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
        demandedAmount: 1250,
        amount: 1250,
        description: 'Güncel ana alacak',
        dueDate: new Date('2026-02-01T00:00:00.000Z'),
        interestType: InterestType.TICARI,
        interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2',
        interestRate: null,
        interestStartDate: new Date('2026-02-02T00:00:00.000Z'),
        interestEndDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
    });
    expect(tx.claimItem.update.mock.calls[0][0].data).not.toHaveProperty('originalAmount');
    expect(tx.claimItem.update.mock.calls[0][0].data).not.toHaveProperty('metadata');
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

    await (service as any).createClaimItemsFromDues(
      createTx, 'tenant-1', 'case-1', [makeDue()], 'requester-1',
    );
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
    }, 'requester-1');

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
        demandedAmount: 1500,
        amount: 1500,
        description: 'Açılış alacağı güncel',
        dueDate: new Date('2026-03-01T00:00:00.000Z'),
      }),
    });
    expect(tx.claimItem.update.mock.calls[0][0].data).not.toHaveProperty('originalAmount');
  });

  it('updateDue live marker bulunamadığında heuristic yapmadan fail-closed kalır', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await expect(service.updateDue('tenant-1', 'case-1', 'due-1', {
      amount: 1250,
      description: 'Güncel ana alacak',
      dueDate: '2026-02-01',
    }, 'requester-1')).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUE_BRIDGE_MARKER_MISSING',
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

  it('updateDue birden fazla live marker bulunduğunda fail-closed kalır', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => [{ id: 'claim-1' }, { id: 'claim-2' }]),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await expect(service.updateDue('tenant-1', 'case-1', 'due-1', {
      amount: 1250,
    }, 'requester-1')).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUE_BRIDGE_MULTIPLE_LIVE_MARKERS',
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

    await service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1');

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

    await (service as any).createClaimItemsFromDues(
      createTx, 'tenant-1', 'case-1', [makeDue()], 'requester-1',
    );
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

    await service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1');

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

  it('deleteDue live marker bulunamadığında Due kaydını silmeden fail-closed kalır', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await expect(
      service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1'),
    ).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUE_BRIDGE_MARKER_MISSING',
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
    expect(tx.due.delete).not.toHaveBeenCalled();
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
      }, 'requester-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.due.create).not.toHaveBeenCalled();
    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });

  it('cross-tenant updateDue transition guard veya mutation yüzeyine ulaşmaz', async () => {
    const tx = makeTx({
      case: { findFirst: jest.fn(async () => null) },
      due: { findFirst: jest.fn(), update: jest.fn() },
      claimItem: { findMany: jest.fn(), update: jest.fn() },
    });
    const { service } = makeService(tx);

    await expect(
      service.updateDue(
        'tenant-other', 'case-1', 'due-1', { type: DueType.NAFAKA }, 'requester-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.due.findFirst).not.toHaveBeenCalled();
    expect(tx.due.update).not.toHaveBeenCalled();
    expect(tx.claimItem.findMany).not.toHaveBeenCalled();
  });
});
