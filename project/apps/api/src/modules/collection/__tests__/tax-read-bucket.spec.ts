/**
 * D (vergi) K3 — okuma-tarafı: TAX_* parent kovasına (metadata) gider, OTHER'a değil.
 */

import { CollectionService } from '../collection.service';
import { AllocationType } from '../dto/collection.dto';
import { mapClaimItemTypeToAllocationType } from '../allocation-read.helper';

describe('D K3 — read-helper TAX parent bucket', () => {
  it('mapper: TAX → metadata.taxParentCategory kovası', () => {
    expect(mapClaimItemTypeToAllocationType('TAX_KDV', { taxParentCategory: 'PRINCIPAL' })).toBe(AllocationType.PRINCIPAL);
    expect(mapClaimItemTypeToAllocationType('TAX_BSMV', { taxParentCategory: 'INTEREST' })).toBe(AllocationType.INTEREST);
    expect(mapClaimItemTypeToAllocationType('TAX_KKDF', { taxParentCategory: 'COST' })).toBe(AllocationType.OTHER);
    expect(mapClaimItemTypeToAllocationType('TAX_KDV', { taxParentCategory: 'ANCILLARY' })).toBe(AllocationType.OTHER);
    expect(mapClaimItemTypeToAllocationType('TAX_KDV')).toBe(AllocationType.OTHER); // metadata yok → OTHER
  });

  it('mapper: non-TAX davranışı değişmez', () => {
    expect(mapClaimItemTypeToAllocationType('PRINCIPAL')).toBe(AllocationType.PRINCIPAL);
    expect(mapClaimItemTypeToAllocationType('ATTORNEY_FEE')).toBe(AllocationType.ATTORNEY_FEE);
    expect(() => mapClaimItemTypeToAllocationType('___X___')).toThrow();
  });

  it('getCollectedBreakdown: ledger TAX(parent=PRINCIPAL) → PRINCIPAL kovası (OTHER değil)', async () => {
    const prisma: any = {
      ledgerAllocation: {
        findMany: jest.fn(async () => [
          { amount: 180, claimItem: { itemType: 'TAX_KDV', metadata: { taxParentCategory: 'PRINCIPAL' } } },
          { amount: 1000, claimItem: { itemType: 'PRINCIPAL', metadata: null } },
        ]),
      },
      collection: { findMany: jest.fn(async () => []) },
    };
    const svc = new CollectionService(prisma, {} as any, {} as any, undefined);

    const bd = await svc.getCollectedBreakdown('t1', 'c1');

    expect(bd[AllocationType.PRINCIPAL]).toBe(1180); // 1000 + 180 KDV (parent=PRINCIPAL)
    expect(bd[AllocationType.OTHER]).toBe(0); // KDV OTHER'a düşmedi
  });
});
