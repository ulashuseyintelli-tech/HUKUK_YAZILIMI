import { describe, expect, it } from "vitest";
import { isAllocationHeldCollection, splitCollectionFinanceTotals } from "../collection-allocation-hold";

describe("K3-L mahsubu bekleyen tahsilat — gösterim yardımcıları", () => {
  it("yalnız HELD bekletme 'mahsubu bekliyor' sayılır; tamamlanmış / iptal edilmiş / bekletmesiz sayılmaz", () => {
    expect(isAllocationHeldCollection({ allocationHold: { status: "HELD" } })).toBe(true);
    expect(isAllocationHeldCollection({ allocationHold: { status: "RELEASED" } })).toBe(false);
    expect(isAllocationHeldCollection({ allocationHold: { status: "REVERSED" } })).toBe(false);
    expect(isAllocationHeldCollection({ allocationHold: null })).toBe(false);
    expect(isAllocationHeldCollection({})).toBe(false);
    expect(isAllocationHeldCollection(null)).toBe(false);
  });

  it("bekletilen tahsilat tahsilat toplamına GİRMEZ, ayrı toplanır; aynı para iki toplamda birden sayılmaz", () => {
    const totals = splitCollectionFinanceTotals([
      { type: "TAHSILAT", amount: 500 },
      { type: "TAHSILAT", amount: 1500, allocationHeld: true },
      { type: "TAHSILAT", amount: 0.1 },
      { type: "TAHSILAT", amount: 0.2 },
      { type: "MASRAF_YAPILAN", amount: 999, allocationHeld: true },
    ]);
    expect(totals).toEqual({ allocated: 500.3, held: 1500, heldCount: 1 });
    expect(totals.allocated + totals.held).toBe(2000.3);
  });

  it("boş / tanımsız listede sıfır", () => {
    expect(splitCollectionFinanceTotals([])).toEqual({ allocated: 0, held: 0, heldCount: 0 });
    expect(splitCollectionFinanceTotals(undefined)).toEqual({ allocated: 0, held: 0, heldCount: 0 });
  });
});
