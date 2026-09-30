import {
  filterConfirmedCollections,
  isConfirmedCollection,
  sumConfirmedCollections,
} from "../collection-confirmed.util";
import { isAllocationHeldCollection, sumAllocatedConfirmedCollections, sumAllocationHeldCollections } from '../collection-confirmed.util';

/**
 * COLLECTION-STATUS-FILTER-HOTFIX — helper birim testleri.
 * Kural: yalnız CONFIRMED tahsilat "tahsil edildi" sayılır;
 * PENDING/CANCELLED/REFUNDED toplam/oran/sayım metriklerine girmez.
 */
describe("collection-confirmed.util", () => {
  describe("isConfirmedCollection", () => {
    it("CONFIRMED → true", () => {
      expect(isConfirmedCollection({ status: "CONFIRMED" })).toBe(true);
    });

    it.each(["PENDING", "CANCELLED", "REFUNDED"])("%s → false", (status) => {
      expect(isConfirmedCollection({ status })).toBe(false);
    });

    it("status yok / null / undefined obje → false", () => {
      expect(isConfirmedCollection({})).toBe(false);
      expect(isConfirmedCollection({ status: null })).toBe(false);
      expect(isConfirmedCollection(null)).toBe(false);
      expect(isConfirmedCollection(undefined)).toBe(false);
    });
  });

  describe("filterConfirmedCollections", () => {
    it("karışık statülerden yalnız CONFIRMED kalır", () => {
      const mixed = [
        { id: 1, status: "CONFIRMED" },
        { id: 2, status: "PENDING" },
        { id: 3, status: "CANCELLED" },
        { id: 4, status: "REFUNDED" },
        { id: 5, status: "CONFIRMED" },
      ];
      expect(filterConfirmedCollections(mixed).map((c) => c.id)).toEqual([1, 5]);
    });

    it("null/undefined liste → boş dizi", () => {
      expect(filterConfirmedCollections(null)).toEqual([]);
      expect(filterConfirmedCollections(undefined)).toEqual([]);
    });
  });

  describe("sumConfirmedCollections", () => {
    it("REGRESYON: karışık statülerde toplam yalnız CONFIRMED üzerinden hesaplanır", () => {
      const mixed = [
        { amount: 100, status: "CONFIRMED" },
        { amount: 900, status: "CANCELLED" },
        { amount: 500, status: "REFUNDED" },
        { amount: 250, status: "PENDING" },
        { amount: "50.5", status: "CONFIRMED" }, // Decimal string — Number() semantiği korunur
      ];
      expect(sumConfirmedCollections(mixed)).toBe(150.5);
    });

    it("hiç CONFIRMED yoksa (yalnız PENDING/CANCELLED/REFUNDED) → 0", () => {
      const noneConfirmed = [
        { amount: 900, status: "CANCELLED" },
        { amount: 500, status: "REFUNDED" },
        { amount: 250, status: "PENDING" },
      ];
      expect(sumConfirmedCollections(noneConfirmed)).toBe(0);
    });

    it("boş / null liste → 0", () => {
      expect(sumConfirmedCollections([])).toBe(0);
      expect(sumConfirmedCollections(null)).toBe(0);
    });
  });
});

describe('K3-L — mahsubu bekletilen tahsilat (allocationHold HELD)', () => {
  const rows = [
    { amount: 100, status: 'CONFIRMED' },
    { amount: 40, status: 'CONFIRMED', allocationHold: { status: 'HELD' } },
    { amount: 25, status: 'CONFIRMED', allocationHold: { status: 'RELEASED' } },
    { amount: 10, status: 'CONFIRMED', allocationHold: null },
    { amount: 999, status: 'CANCELLED', allocationHold: { status: 'HELD' } },
  ];

  it('isAllocationHeldCollection yalnız HELD için true; ilişki yüklenmediyse false', () => {
    expect(rows.map((r) => isAllocationHeldCollection(r))).toEqual([false, true, false, false, true]);
    expect(isAllocationHeldCollection(null)).toBe(false);
  });

  it('mahsup edilmiş toplam bekletileni DIŞLAR; bekletilen toplam yalnız ONAYLI + HELD', () => {
    expect(sumAllocatedConfirmedCollections(rows)).toBe(135);
    expect(sumAllocationHeldCollections(rows)).toBe(40);
    expect(sumAllocatedConfirmedCollections(null)).toBe(0);
  });

  it('aynı para iki toplamda birden SAYILMAZ (mahsup edilen + bekleyen = onaylı toplam)', () => {
    const confirmedTotal = rows.filter((r) => r.status === 'CONFIRMED').reduce((s, r) => s + r.amount, 0);
    expect(sumAllocatedConfirmedCollections(rows) + sumAllocationHeldCollections(rows)).toBe(confirmedTotal);
  });
});
