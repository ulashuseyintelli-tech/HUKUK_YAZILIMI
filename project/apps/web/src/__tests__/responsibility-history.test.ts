// WP-1d-4c-2: Sorumluluk Değişim Geçmişi saf yardımcıları (changeTypeLabel / formatParty / path).
import { describe, it, expect } from "vitest";
import {
  changeTypeLabel,
  formatParty,
  buildResponsibilityHistoryPath,
  type PartyRef,
} from "@/lib/responsibility-history";

describe("changeTypeLabel", () => {
  it("kanonik tür etiketlerini döndürür", () => {
    expect(changeTypeLabel("operationOwner")).toBe("Dosya Operasyon Sorumlusu");
    expect(changeTypeLabel("legalResponsibleLawyer")).toBe("Hukuki Sorumlu Avukat");
  });
  it("bilinmeyen tür için ham değeri döndürür (çökmez)", () => {
    expect(changeTypeLabel("xyz")).toBe("xyz");
  });
});

describe("formatParty (dürüstlük)", () => {
  it("NONE → 'Atanmamış' (yalnız gerçekten kimse yok)", () => {
    expect(formatParty({ type: "NONE", id: null })).toBe("Atanmamış");
  });
  it("UNKNOWN → 'Bilinmiyor' (NONE ile karışmaz)", () => {
    const ref: PartyRef = { type: "UNKNOWN", id: null };
    expect(formatParty(ref)).toBe("Bilinmiyor");
    expect(formatParty(ref)).not.toBe("Atanmamış");
  });
  it("LAWYER/STAFF → çözülen isim varsa onu, yoksa tip etiketini (ham id YOK)", () => {
    const names = { law1: "Av. Ayşe Yılmaz", st1: "Mehmet Demir" };
    expect(formatParty({ type: "LAWYER", id: "law1" }, names)).toBe("Av. Ayşe Yılmaz");
    expect(formatParty({ type: "STAFF", id: "st1" }, names)).toBe("Mehmet Demir");
    // çözülemeyen id → ham id sızdırılmaz
    expect(formatParty({ type: "LAWYER", id: "law9" }, names)).toBe("Avukat");
    expect(formatParty({ type: "STAFF", id: "st9" }, names)).toBe("Personel");
    expect(formatParty({ type: "LAWYER", id: "law9" }, names)).not.toContain("law9");
  });
  it("null/undefined ref → 'Bilinmiyor'", () => {
    expect(formatParty(undefined)).toBe("Bilinmiyor");
    expect(formatParty(null)).toBe("Bilinmiyor");
  });
});

describe("buildResponsibilityHistoryPath", () => {
  it("param yoksa düz path", () => {
    expect(buildResponsibilityHistoryPath("c1")).toBe("/cases/c1/responsibility-history");
  });
  it("verilen paramları query string'e ekler", () => {
    const p = buildResponsibilityHistoryPath("c1", {
      from: "2026-01-01",
      to: "2026-06-01",
      includeInferred: false,
      type: "all",
    });
    expect(p).toContain("/cases/c1/responsibility-history?");
    expect(p).toContain("from=2026-01-01");
    expect(p).toContain("to=2026-06-01");
    expect(p).toContain("includeInferred=false");
    expect(p).toContain("type=all");
  });
  it("includeInferred=true açıkça serialize edilir", () => {
    expect(buildResponsibilityHistoryPath("c1", { includeInferred: true })).toContain("includeInferred=true");
  });
});
