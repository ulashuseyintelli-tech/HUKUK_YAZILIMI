import { describe, it, expect } from "vitest";
import { sanitizeLawyerIbanPayload, normalizeIban } from "../lawyer-iban-payload";

// PR-1 — Backend sözleşmesi (lawyer.service.ts CANDIDATE-H1):
//   iban ya HİÇ gönderilmeli ya da geçerli TAM değer olmalı.
//   boş / whitespace / maskeli → 400 INVALID_IBAN_UPDATE.
// Bu testler frontend payload'ının o sözleşmeyi ihlal ETMEDİĞİNİ kilitler.

const BASE = { name: "EGE", surname: "DURUSOY", canApproveOfficeActions: true };

describe("sanitizeLawyerIbanPayload", () => {
  it("BOŞ iban → alan payload'dan TAMAMEN çıkarılır (mevcut değer korunur)", () => {
    const out = sanitizeLawyerIbanPayload({ ...BASE, iban: "" });
    expect("iban" in out).toBe(false);
    // diğer alanlar bozulmadan geçer — onay yetkisi bayrağı dahil
    expect(out).toMatchObject(BASE);
  });

  it("YALNIZ BOŞLUK iban → alan çıkarılır", () => {
    const out = sanitizeLawyerIbanPayload({ ...BASE, iban: "   \t  " });
    expect("iban" in out).toBe(false);
  });

  it("MASKELİ iban → alan çıkarılır (maskeli değer gerçek IBAN'ı ezemez)", () => {
    const out = sanitizeLawyerIbanPayload({ ...BASE, iban: "TR12 **** **** 3456" });
    expect("iban" in out).toBe(false);
  });

  it("GEÇERLİ iban → normalize edilerek GÖNDERİLİR", () => {
    const out = sanitizeLawyerIbanPayload({
      ...BASE,
      iban: " tr33 0006 1005 1978 6457 8413 26 ",
    });
    expect(out.iban).toBe("TR330006100519786457841326");
  });

  it("string OLMAYAN iban (null/undefined/sayı) → alan çıkarılır", () => {
    expect("iban" in sanitizeLawyerIbanPayload({ ...BASE, iban: null as unknown as string })).toBe(false);
    expect("iban" in sanitizeLawyerIbanPayload({ ...BASE, iban: undefined as unknown as string })).toBe(false);
    expect("iban" in sanitizeLawyerIbanPayload({ ...BASE, iban: 123 as unknown as string })).toBe(false);
  });

  it("iban ALANI HİÇ YOKSA payload aynen korunur", () => {
    const out = sanitizeLawyerIbanPayload({ ...BASE });
    expect(out).toEqual(BASE);
    expect("iban" in out).toBe(false);
  });

  it("REGRESYON: sanitize edilen payload backend guard'ının reddettiği hiçbir değeri taşımaz", () => {
    const rejectedByBackend = (v: unknown) =>
      typeof v !== "string" || v.trim() === "" || v.includes("*");

    for (const raw of ["", "   ", "TR** **", null, undefined, 0]) {
      const out = sanitizeLawyerIbanPayload({ ...BASE, iban: raw as unknown as string });
      // ya alan yok, ya da backend'in kabul edeceği bir değer var
      expect(!("iban" in out) || !rejectedByBackend(out.iban)).toBe(true);
    }
  });
});

describe("normalizeIban", () => {
  it("boşlukları atar ve büyük harfe çevirir", () => {
    expect(normalizeIban(" tr33 0006 1005 ")).toBe("TR3300061005");
  });
});
