import { describe, it, expect } from "vitest";
import { shouldShowLookupBanner, lookupBannerMessage } from "./lookup-ui";

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
