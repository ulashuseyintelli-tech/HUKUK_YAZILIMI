import { describe, expect, it } from "vitest";
import { recordCurrencyCode, recordCurrencySuffix, sharedRecordCurrency } from "../record-currency-display";

describe("kayıt tutarı gösterimi — tutar kaydın kendi para birimiyle", () => {
  it("TRY'de ek eski sabit metinle birebir aynıdır (' ₺')", () => {
    expect(recordCurrencySuffix("TRY")).toBe(" ₺");
    // sayı biçimi çağıranda kalır: eski satır içi yazımla aynı metin
    expect(`${Number("10000").toLocaleString("tr-TR")}${recordCurrencySuffix("TRY")}`).toBe("10.000 ₺");
    expect(`${Number("250.5").toLocaleString("tr-TR")}${recordCurrencySuffix("TRY")}`).toBe("250,5 ₺");
  });

  it("dövizde ISO kodu yazılır", () => {
    expect(recordCurrencySuffix("USD")).toBe(" USD");
    expect(recordCurrencySuffix("EUR")).toBe(" EUR");
    expect(recordCurrencySuffix("GBP")).toBe(" GBP");
    expect(recordCurrencySuffix("CHF")).toBe(" CHF");
  });

  it("tanınmayan para birimi '₺' ile BASILMAZ; kodu aynen yazılır", () => {
    expect(recordCurrencySuffix("JPY")).toBe(" JPY");
    expect(recordCurrencySuffix("XYZ")).not.toContain("₺");
  });

  it("para birimi alanı boş / yok ise şema varsayılanı TRY sayılır; yazım farkı (küçük harf, boşluk) kodu değiştirmez", () => {
    expect(recordCurrencyCode(undefined)).toBe("TRY");
    expect(recordCurrencyCode(null)).toBe("TRY");
    expect(recordCurrencyCode("  ")).toBe("TRY");
    expect(recordCurrencyCode(" usd ")).toBe("USD");
    expect(recordCurrencySuffix(undefined)).toBe(" ₺");
    expect(recordCurrencySuffix(null)).toBe(" ₺");
    expect(recordCurrencySuffix("try")).toBe(" ₺");
    expect(recordCurrencySuffix(" usd ")).toBe(" USD");
  });
});

describe("tek toplam yazılabilir mi — ortak para birimi", () => {
  it("kayıtların tümü aynı para birimindeyse o para birimi döner", () => {
    expect(sharedRecordCurrency([{ currency: "USD" }, { currency: "USD" }])).toBe("USD");
    expect(sharedRecordCurrency([{ currency: "TRY" }])).toBe("TRY");
    // alanı olmayan kayıt TRY sayılır → TRY kayıtlarla aynı kovadadır
    expect(sharedRecordCurrency([{ currency: "TRY" }, {}, { currency: null }])).toBe("TRY");
  });

  it("birden fazla para birimi varsa null döner (tek toplam yazılmaz)", () => {
    expect(sharedRecordCurrency([{ currency: "USD" }, { currency: "EUR" }, { currency: "TRY" }])).toBeNull();
    expect(sharedRecordCurrency([{ currency: "USD" }, { currency: "TRY" }])).toBeNull();
    // alanı olmayan kayıt TRY sayıldığı için USD ile karışıktır
    expect(sharedRecordCurrency([{ currency: "USD" }, {}])).toBeNull();
  });

  it("boş / tanımsız listede ortak para birimi yoktur", () => {
    expect(sharedRecordCurrency([])).toBeNull();
    expect(sharedRecordCurrency(undefined)).toBeNull();
    expect(sharedRecordCurrency(null)).toBeNull();
  });
});
