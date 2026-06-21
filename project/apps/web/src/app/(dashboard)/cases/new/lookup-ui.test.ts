import { describe, it, expect } from "vitest";
import { shouldShowLookupBanner, lookupBannerMessage, formToTakipTuruCode } from "./lookup-ui";
import { formMetadata } from "@/config/form-metadata";

describe("PR-D lookup-ui — banner kararı", () => {
  it("lookups yüklü ve takipTuru DOLU → banner gösterilmez", () => {
    expect(shouldShowLookupBanner(false, 11)).toBe(false);
  });

  it("takipTuru BOŞ (length 0) → banner gösterilir", () => {
    expect(shouldShowLookupBanner(false, 0)).toBe(true);
  });

  it("fetch FAILED → takipTuru dolu görünse bile banner gösterilir", () => {
    expect(shouldShowLookupBanner(true, 11)).toBe(true);
  });

  it("tek kod miss'i banner tetiklemez (takipTuru dolu + fail değil)", () => {
    // D3: spesifik kod bulunamaması ayrı arızadır → banner DEĞİL, console.warn
    expect(shouldShowLookupBanner(false, 5)).toBe(false);
  });
});

describe("PR-D lookup-ui — banner mesajı (failed vs empty ayrımı)", () => {
  it("fetch FAILED → sunucu/bağlantı mesajı", () => {
    const msg = lookupBannerMessage(true);
    expect(msg).toMatch(/yüklenemedi/i);
    expect(msg).toMatch(/yenileyin/i);
  });

  it("empty (failed değil) → yapılandırılmamış/seed mesajı", () => {
    const msg = lookupBannerMessage(false);
    expect(msg).toMatch(/yapılandırılmamış/i);
    expect(msg).not.toMatch(/yüklenemedi/i);
  });
});

describe("PR-2 formToTakipTuruCode — manuel form → kanonik takipTürü seed", () => {
  // lookup-catalog.ts > TAKIP_TURU_CATALOG ile birebir (11 kanonik kod). Drift kontrolü.
  const CANONICAL_TAKIP_TURU = new Set([
    "ILAMSIZ_GENEL", "ILAMSIZ_KIRA", "ILAMSIZ_TAHLIYE", "ILAMLI", "NAFAKA",
    "KAMBIYO_CEK", "KAMBIYO_SENET", "REHIN_TASINIR", "REHIN_TASINMAZ",
    "IFLAS_ADI", "IFLAS_KAMBIYO",
  ]);

  it("kataloğdaki HER form geçerli bir kanonik takipTürü koduna eşleşir (eksik form yakalar)", () => {
    for (const form of formMetadata) {
      const code = formToTakipTuruCode(form.code);
      expect(code, `form ${form.code} eşleşmedi`).not.toBeNull();
      expect(CANONICAL_TAKIP_TURU.has(code!), `${form.code} → ${code} kanonik değil`).toBe(true);
    }
  });

  it("temel form eşlemeleri sabit", () => {
    expect(formToTakipTuruCode("FORM_7")).toBe("ILAMSIZ_GENEL");
    expect(formToTakipTuruCode("FORM_2_3_4_5")).toBe("ILAMLI");
    expect(formToTakipTuruCode("FORM_10")).toBe("KAMBIYO_SENET"); // çek/senet ayrımı sihirbaz işi
    expect(formToTakipTuruCode("FORM_12")).toBe("IFLAS_KAMBIYO");
    expect(formToTakipTuruCode("FORM_6")).toBe("REHIN_TASINMAZ");
    expect(formToTakipTuruCode("FORM_9")).toBe("REHIN_TASINMAZ");
    expect(formToTakipTuruCode("FORM_8")).toBe("REHIN_TASINIR");
    expect(formToTakipTuruCode("FORM_44")).toBe("REHIN_TASINIR");
    expect(formToTakipTuruCode("FORM_11")).toBe("IFLAS_ADI");
    expect(formToTakipTuruCode("FORM_13")).toBe("ILAMSIZ_KIRA");
    expect(formToTakipTuruCode("FORM_14")).toBe("ILAMSIZ_TAHLIYE");
  });

  it("FORM_5_NAFAKA alt-formu → NAFAKA (ana form ILAMLI olsa da incelir)", () => {
    expect(formToTakipTuruCode("FORM_2_3_4_5", "FORM_5_NAFAKA")).toBe("NAFAKA");
  });

  it("nafaka dışı ilamlı alt-form → ana form eşlemesi (ILAMLI) korunur", () => {
    expect(formToTakipTuruCode("FORM_2_3_4_5", "FORM_5_ALACAK")).toBe("ILAMLI");
    expect(formToTakipTuruCode("FORM_2_3_4_5", "FORM_2_5_TAHLIYE")).toBe("ILAMLI");
  });

  it("bilinmeyen form kodu → null (seed yapılmaz, mevcut davranış)", () => {
    expect(formToTakipTuruCode("FORM_BILINMEYEN")).toBeNull();
    expect(formToTakipTuruCode("")).toBeNull();
  });
});
