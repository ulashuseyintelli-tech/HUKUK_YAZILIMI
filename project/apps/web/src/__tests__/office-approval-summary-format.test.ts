import { describe, it, expect } from "vitest";
import { formatDecimalString, formatAmountWithCurrency } from "@/components/office-approval/summary/format";

describe("formatDecimalString (string-safe, Number() KULLANMAZ)", () => {
  it("örnek: 125000.50 -> 125.000,50", () => {
    expect(formatDecimalString("125000.50")).toBe("125.000,50");
  });

  it("ondalıksız tam sayı -> yalnız binlik ayraç, virgül eklenmez", () => {
    expect(formatDecimalString("125000")).toBe("125.000");
  });

  it("3 basamaklı sayı -> ayraç eklenmez", () => {
    expect(formatDecimalString("500")).toBe("500");
  });

  it("7 basamaklı sayı -> iki ayraç", () => {
    expect(formatDecimalString("1234567")).toBe("1.234.567");
  });

  it("negatif tutar -> işaret korunur", () => {
    expect(formatDecimalString("-125000.50")).toBe("-125.000,50");
  });

  it("sıfır -> 0", () => {
    expect(formatDecimalString("0")).toBe("0");
    expect(formatDecimalString("0.50")).toBe("0,50");
  });

  it("ondalık basamak sayısı OLDUĞU GİBİ korunur (uydurma/yuvarlama YOK)", () => {
    expect(formatDecimalString("125000.5")).toBe("125.000,5"); // tek basamak PADLENMEZ
    expect(formatDecimalString("125000.500")).toBe("125.000,500"); // üç basamak KIRPILMAZ
  });

  it("büyük tutar — Number() precision sınırının ÖTESİNDE bile string olarak doğru kalır", () => {
    // Number.MAX_SAFE_INTEGER = 9007199254740991; bunun üstü float'ta hassasiyet kaybeder.
    // String-safe formatter bundan ETKİLENMEZ.
    expect(formatDecimalString("90071992547409912345.99")).toBe("90.071.992.547.409.912.345,99");
  });

  it("beklenmeyen şekil -> null (caller unsafe'e düşer)", () => {
    expect(formatDecimalString("abc")).toBeNull();
    expect(formatDecimalString("125.000,50")).toBeNull(); // TR formatı GİRDİ olarak kabul edilmez
    expect(formatDecimalString("")).toBeNull();
    expect(formatDecimalString("1e10")).toBeNull();
  });
});

describe("formatAmountWithCurrency", () => {
  it("geçerli tutar + currency birleşir", () => {
    expect(formatAmountWithCurrency("125000.50", "TRY")).toBe("125.000,50 TRY");
  });

  it("formatlanamayan tutar -> ham string currency ile birlikte döner (atılmaz)", () => {
    expect(formatAmountWithCurrency("garbage", "TRY")).toBe("garbage TRY");
  });
});
