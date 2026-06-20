/**
 * G3b — CollectionService.getCollectedBreakdown + read-side mapper testleri.
 *
 * Per-case TEK KAYNAK guard: ledger-varsa-ledger / yoksa-CollectionAllocation.
 * Çift-sayım kesin yasak.
 */

import { CollectionService } from '../collection.service';
import { AllocationType } from '../dto/collection.dto';
import { mapClaimItemTypeToAllocationType } from '../allocation-read.helper';

function buildService(prisma: any) {
  return new CollectionService(prisma, {} as any, {} as any, undefined);
}

describe('CollectionService.getCollectedBreakdown (G3b per-case single source)', () => {
  it('T1: ledger VARSA → ledger-only (CollectionAllocation sorgulanmaz)', async () => {
    const prisma: any = {
      ledgerAllocation: {
        findMany: jest.fn(async () => [
          { amount: 1000, claimItem: { itemType: 'PRINCIPAL' } },
          { amount: 200, claimItem: { itemType: 'INTEREST' } },
          { amount: 50, claimItem: { itemType: 'FEE' } },
        ]),
      },
      collection: { findMany: jest.fn(async () => []) },
    };
    const svc = buildService(prisma);

    const bd = await svc.getCollectedBreakdown('t1', 'c1');

    expect(bd[AllocationType.PRINCIPAL]).toBe(1000);
    expect(bd[AllocationType.INTEREST]).toBe(200);
    expect(bd[AllocationType.FEE]).toBe(50);
    // FALLBACK'e düşmedi → CollectionAllocation/collection sorgusu YOK
    expect(prisma.collection.findMany).not.toHaveBeenCalled();
  });

  it('T2: ledger YOKSA → CollectionAllocation fallback', async () => {
    const prisma: any = {
      ledgerAllocation: { findMany: jest.fn(async () => []) },
      collection: {
        findMany: jest.fn(async () => [
          { allocations: [{ allocationType: 'PRINCIPAL', amount: 500 }, { allocationType: 'FEE', amount: 50 }] },
        ]),
      },
    };
    const svc = buildService(prisma);

    const bd = await svc.getCollectedBreakdown('t1', 'c1');

    expect(prisma.collection.findMany).toHaveBeenCalledTimes(1);
    expect(bd[AllocationType.PRINCIPAL]).toBe(500);
    expect(bd[AllocationType.FEE]).toBe(50);
    expect(bd[AllocationType.INTEREST]).toBe(0);
  });

  it('T3: ÇİFT-SAYIM YOK — ledger+CollectionAllocation ikisi de varsa ledger-only', async () => {
    const prisma: any = {
      ledgerAllocation: {
        findMany: jest.fn(async () => [{ amount: 1000, claimItem: { itemType: 'PRINCIPAL' } }]),
      },
      collection: {
        findMany: jest.fn(async () => [{ allocations: [{ allocationType: 'PRINCIPAL', amount: 999 }] }]),
      },
    };
    const svc = buildService(prisma);

    const bd = await svc.getCollectedBreakdown('t1', 'c1');

    expect(bd[AllocationType.PRINCIPAL]).toBe(1000); // yalnız ledger; 1000+999 DEĞİL
    expect(prisma.collection.findMany).not.toHaveBeenCalled();
  });

  it('T5: CollectionPanel kaynağı (findByCaseId) DEĞİŞMEDİ — hâlâ CollectionAllocation include', async () => {
    const prisma: any = { collection: { findMany: jest.fn(async () => []) } };
    const svc = buildService(prisma);

    await svc.findByCaseId('t1', 'c1');

    expect(prisma.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { allocations: true } }),
    );
  });
});

describe('mapClaimItemTypeToAllocationType (T4)', () => {
  const cases: Array<[string, AllocationType]> = [
    ['PRINCIPAL', AllocationType.PRINCIPAL],
    ['INTEREST', AllocationType.INTEREST],
    ['PRE_INTEREST', AllocationType.INTEREST],
    ['POST_INTEREST', AllocationType.INTEREST],
    ['EXPENSE', AllocationType.EXPENSE],
    ['FEE', AllocationType.FEE],
    ['ATTORNEY_FEE', AllocationType.ATTORNEY_FEE],
    ['PENALTY', AllocationType.PENALTY],
    ['CHECK_PENALTY', AllocationType.PENALTY],
    ['CONTRACTUAL_PENALTY', AllocationType.PENALTY],
    ['TAX_KDV', AllocationType.OTHER],
    ['TAX_BSMV', AllocationType.OTHER],
    ['TAX_KKDF', AllocationType.OTHER],
    ['OTHER', AllocationType.OTHER],
  ];

  it.each(cases)('%s → %s', (itemType, expected) => {
    expect(mapClaimItemTypeToAllocationType(itemType as any)).toBe(expected);
  });

  it('bilinmeyen itemType → throw (silent default yok)', () => {
    expect(() => mapClaimItemTypeToAllocationType('___X___' as any)).toThrow();
  });
});
