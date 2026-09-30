import { Prisma } from '@prisma/client';
import {
  EXCLUDE_ALLOCATION_HELD_COLLECTIONS,
  assertNoActiveCollectionAllocationHold,
  readActiveAllocationHoldSummary,
  summarizeActiveAllocationHolds,
  type CollectionAllocationHoldActiveRow,
} from '../collection-allocation-hold';

/**
 * K3-L D1 — mahsubu BEKLETİLEN tahsilat okuyucu yardımcıları (saf birim testi).
 * Kural: bekletilen tahsilat borçtan düşülmez, "tahsil edilen" sayılmaz, dağıtıma konu olmaz; ayrı gösterilir.
 */
const hold = (collectionId: string, amount: string, currency = 'TRY'): CollectionAllocationHoldActiveRow => ({
  id: `hold-${collectionId}`,
  collectionId,
  amount: new Prisma.Decimal(amount),
  currency,
  holdReason: 'ON_BEHALF_DEBTOR_REQUIRED' as never,
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
});

describe('summarizeActiveAllocationHolds', () => {
  it('tutar kuruş hassasiyetinde toplanır (kayan nokta birikmesi yok)', () => {
    const summary = summarizeActiveAllocationHolds([hold('c1', '0.10'), hold('c2', '0.20'), hold('c3', '1500.05')]);
    expect(summary.amount).toBe(1500.35);
    expect(summary.count).toBe(3);
    expect([...summary.collectionIds].sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('para birimi verilince tutar/adet yalnız o para birimi; DIŞLAMA kümesi para biriminden bağımsız', () => {
    const summary = summarizeActiveAllocationHolds([hold('c1', '100', 'TRY'), hold('c2', '50', 'USD')], 'TRY');
    expect(summary.amount).toBe(100);
    expect(summary.count).toBe(1);
    // USD bekletme TRY toplamına girmez ama hiçbir toplamda "mahsup edilmiş" de sayılmaz
    expect([...summary.collectionIds].sort()).toEqual(['c1', 'c2']);
  });

  it('para birimi BİREBİR eşleşir (tahsilat / dağıtım sorgularıyla aynı kural): kanonik olmayan yazım eşleşmez', () => {
    const summary = summarizeActiveAllocationHolds([hold('c1', '100', 'TRY')], 'try');
    expect(summary).toMatchObject({ amount: 0, count: 0 });
    expect(summary.collectionIds.has('c1')).toBe(true);
  });

  it('bekletme yoksa sıfır özet', () => {
    const summary = summarizeActiveAllocationHolds([]);
    expect(summary).toMatchObject({ amount: 0, count: 0 });
    expect(summary.collectionIds.size).toBe(0);
  });
});

describe('readActiveAllocationHoldSummary', () => {
  it('yalnız HELD kayıtları, kiracı + dosya kapsamıyla okur', async () => {
    const findMany = jest.fn(async () => [hold('c1', '1500')]);
    const summary = await readActiveAllocationHoldSummary({ collectionAllocationHold: { findMany } } as never, 't1', 'case-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', caseId: 'case-1', status: 'HELD' } }),
    );
    expect(summary).toMatchObject({ amount: 1500, count: 1 });
    expect(summary.collectionIds.has('c1')).toBe(true);
  });

  it('kısmi mock (model yok) → boş özet; hata fırlatmaz', async () => {
    const summary = await readActiveAllocationHoldSummary({} as never, 't1', 'case-1');
    expect(summary).toMatchObject({ amount: 0, count: 0 });
    expect(summary.collectionIds.size).toBe(0);
  });

  it('okuma hatası YUTULMAZ (bekletme bilinmeden toplam üretilmez)', async () => {
    const findMany = jest.fn(async () => {
      throw new Error('db down');
    });
    await expect(
      readActiveAllocationHoldSummary({ collectionAllocationHold: { findMany } } as never, 't1', 'case-1'),
    ).rejects.toThrow('db down');
  });
});

describe('assertNoActiveCollectionAllocationHold', () => {
  it('HELD bekletme varsa 409 COLLECTION_ALLOCATION_HELD', async () => {
    const findFirst = jest.fn(async () => ({ id: 'hold-1', holdReason: 'ON_BEHALF_DEBTOR_REQUIRED' }));
    await expect(
      assertNoActiveCollectionAllocationHold({ collectionAllocationHold: { findFirst } } as never, {
        tenantId: 't1',
        collectionId: 'col-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'COLLECTION_ALLOCATION_HELD' }, status: 409 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { collectionId: 'col-1', status: 'HELD', tenantId: 't1' } }),
    );
  });

  it('bekletme yoksa (ya da RELEASED/REVERSED ise sorgu boş döner) geçer', async () => {
    const findFirst = jest.fn(async () => null);
    await expect(
      assertNoActiveCollectionAllocationHold({ collectionAllocationHold: { findFirst } } as never, { collectionId: 'col-1' }),
    ).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { collectionId: 'col-1', status: 'HELD' } }));
  });
});

describe('EXCLUDE_ALLOCATION_HELD_COLLECTIONS', () => {
  it('yalnız HELD durumundaki bekletmeyi dışlar (RELEASED / REVERSED / bekletmesiz tahsilat toplamda kalır)', () => {
    expect(EXCLUDE_ALLOCATION_HELD_COLLECTIONS).toEqual({ NOT: { allocationHold: { is: { status: 'HELD' } } } });
  });
});
