import { describe, expect, it } from "vitest";
import {
  collectionFinanceTotalCurrencies,
  isAllocationHeldCollection,
  splitCollectionFinanceTotals,
} from "../collection-allocation-hold";

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

/**
 * Tahsilat toplamının para birimi — toplam yalnız o gruptaki tahsilatların TÜMÜ aynı para birimindeyse yazılabilir
 * (RECEIVABLE-GOVERNANCE REC-ALLOC-008, REC-FX-001/002: farklı para birimleri tek sayıda toplanmaz, tutar çevrilmez).
 */
describe("tahsilat toplamlarının para birimi", () => {
  it("tek para birimindeki tahsilatlarda iki toplam da o para birimindedir", () => {
    expect(
      collectionFinanceTotalCurrencies(
        [
          { type: "TAHSILAT", amount: 1000, currency: "USD" },
          { type: "TAHSILAT", amount: 1500, currency: "USD", allocationHeld: true },
        ],
        "USD",
      ),
    ).toEqual({ allocated: "USD", held: "USD" });
  });

  it("toplamın para birimi dosyadan değil KAYITLARDAN gelir (dosya USD, tahsilatlar EUR)", () => {
    expect(
      collectionFinanceTotalCurrencies(
        [
          { type: "TAHSILAT", amount: 1000, currency: "EUR" },
          { type: "TAHSILAT", amount: 250, currency: "EUR" },
        ],
        "USD",
      ).allocated,
    ).toBe("EUR");
  });

  it("mahsup edilmiş tahsilatlar birden fazla para birimindeyse o toplamın para birimi YOKTUR (null) — toplam yazılmaz", () => {
    expect(
      collectionFinanceTotalCurrencies(
        [
          { type: "TAHSILAT", amount: 1000, currency: "USD" },
          { type: "TAHSILAT", amount: 500, currency: "TRY" },
          { type: "TAHSILAT", amount: 300, currency: "EUR" },
        ],
        "USD",
      ),
    ).toEqual({ allocated: null, held: "USD" });
  });

  it("iki grup AYRI değerlendirilir: biri karma olsa da diğeri kendi para birimini taşır", () => {
    const items = [
      { type: "TAHSILAT", amount: 1000, currency: "USD" },
      { type: "TAHSILAT", amount: 500, currency: "USD", allocationHeld: true },
      { type: "TAHSILAT", amount: 300, currency: "EUR", allocationHeld: true },
    ];
    expect(collectionFinanceTotalCurrencies(items, "USD")).toEqual({ allocated: "USD", held: null });

    // gruplar kendi içinde tek para biriminde ama birbirinden farklı: ikisi de yazılabilir
    expect(
      collectionFinanceTotalCurrencies(
        [
          { type: "TAHSILAT", amount: 1000, currency: "USD" },
          { type: "TAHSILAT", amount: 500, currency: "TRY", allocationHeld: true },
        ],
        "USD",
      ),
    ).toEqual({ allocated: "USD", held: "TRY" });
  });

  it("para birimi alanı boş kayıt şema varsayılanı TRY sayılır; kod boşluk / küçük harfle gelse de aynı para birimidir", () => {
    expect(
      collectionFinanceTotalCurrencies([{ type: "TAHSILAT", amount: 1 }, { type: "TAHSILAT", amount: 2, currency: null }]).allocated,
    ).toBe("TRY");
    expect(
      collectionFinanceTotalCurrencies([
        { type: "TAHSILAT", amount: 1, currency: "USD" },
        { type: "TAHSILAT", amount: 2, currency: " usd " },
      ]).allocated,
    ).toBe("USD");
    // alansız (TRY) + USD = karma
    expect(
      collectionFinanceTotalCurrencies([{ type: "TAHSILAT", amount: 1 }, { type: "TAHSILAT", amount: 2, currency: "USD" }]).allocated,
    ).toBeNull();
  });

  it("grupta tahsilat yoksa toplam 0'dır ve dosyanın para birimiyle etiketlenir; dosya para birimi de yoksa TRY", () => {
    expect(collectionFinanceTotalCurrencies([], "EUR")).toEqual({ allocated: "EUR", held: "EUR" });
    expect(collectionFinanceTotalCurrencies([], " eur ")).toEqual({ allocated: "EUR", held: "EUR" });
    expect(collectionFinanceTotalCurrencies([])).toEqual({ allocated: "TRY", held: "TRY" });
    expect(collectionFinanceTotalCurrencies(undefined, null)).toEqual({ allocated: "TRY", held: "TRY" });
    // yalnız bekleyen tahsilat var: mahsup edilmiş grup boş → dosya para birimi
    expect(
      collectionFinanceTotalCurrencies([{ type: "TAHSILAT", amount: 1500, currency: "USD", allocationHeld: true }], "USD"),
    ).toEqual({ allocated: "USD", held: "USD" });
    expect(
      collectionFinanceTotalCurrencies([{ type: "TAHSILAT", amount: 1500, currency: "EUR", allocationHeld: true }], "USD"),
    ).toEqual({ allocated: "USD", held: "EUR" });
  });

  it("yalnız TAHSILAT satırları sayılır: masraf satırının para birimi toplamı karma YAPMAZ", () => {
    expect(
      collectionFinanceTotalCurrencies(
        [
          { type: "TAHSILAT", amount: 1000, currency: "USD" },
          { type: "MASRAF_YAPILAN", amount: 300, currency: "TRY" },
          { type: "MASRAF_TALEP", amount: 500 },
        ],
        "USD",
      ),
    ).toEqual({ allocated: "USD", held: "USD" });
  });

  it("mevcut toplama davranışı DEĞİŞMEDİ: para birimi alanı toplamı etkilemez", () => {
    expect(
      splitCollectionFinanceTotals([
        { type: "TAHSILAT", amount: 500, currency: "USD" },
        { type: "TAHSILAT", amount: 1500, currency: "EUR", allocationHeld: true },
      ]),
    ).toEqual({ allocated: 500, held: 1500, heldCount: 1 });
  });
});
