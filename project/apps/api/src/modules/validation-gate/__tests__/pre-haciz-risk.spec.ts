/**
 * PR-D4e-4 — haciz öncesi risk SAF skor modülü.
 * Ağırlık (D-3): ADDRESS_UNVERIFIED=YÜKSEK, ETEBLIGAT_NO_PHYSICAL=YÜKSEK, 90D_MISSING=ORTA.
 * Seviye = en yüksek önem; skor = puan toplamı (sıralama için, UI'da gösterilmez). KALICI YAZIM YOK.
 */

import { scoreDebtorSignals, rollupOverallLevel, buildPreHacizRisk } from "../pre-haciz-risk";

const sig = (id: string) => ({ id, message: `Ad:\n${id}` });

describe("scoreDebtorSignals — seviye = en yüksek önem", () => {
  it("ADDRESS_UNVERIFIED (HIGH) tek başına → YUKSEK, score 40", () => {
    const r = scoreDebtorSignals("d1", "Ali", [sig("INTEL_ADDRESS_UNVERIFIED")]);
    expect(r.level).toBe("YUKSEK");
    expect(r.score).toBe(40);
    expect(r.reasons).toHaveLength(1);
  });

  it("90D_MISSING (MEDIUM) tek başına → ORTA, score 20", () => {
    const r = scoreDebtorSignals("d1", "Ali", [sig("INTEL_90D_MISSING")]);
    expect(r.level).toBe("ORTA");
    expect(r.score).toBe(20);
  });

  it("ETEBLIGAT (HIGH) + 90D (MEDIUM) → YUKSEK (max önem), score 60", () => {
    const r = scoreDebtorSignals("d1", "Ali", [sig("INTEL_90D_MISSING"), sig("INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY")]);
    expect(r.level).toBe("YUKSEK");
    expect(r.score).toBe(60);
  });

  it("üç sinyal → score 100'de kapanır (40+40+20=100)", () => {
    const r = scoreDebtorSignals("d1", "Ali", [
      sig("INTEL_ADDRESS_UNVERIFIED"),
      sig("INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY"),
      sig("INTEL_90D_MISSING"),
    ]);
    expect(r.score).toBe(100);
    expect(r.level).toBe("YUKSEK");
  });

  it("nedenler önem azalan sıralı (HIGH önce)", () => {
    const r = scoreDebtorSignals("d1", "Ali", [sig("INTEL_90D_MISSING"), sig("INTEL_ADDRESS_UNVERIFIED")]);
    expect(r.reasons[0].severity).toBe("HIGH");
    expect(r.reasons[1].severity).toBe("MEDIUM");
  });

  it("sinyal yok → YOK, score 0", () => {
    const r = scoreDebtorSignals("d1", "Ali", []);
    expect(r.level).toBe("YOK");
    expect(r.score).toBe(0);
  });

  it("bilinmeyen sinyal → LOW (graceful), score 10", () => {
    const r = scoreDebtorSignals("d1", "Ali", [sig("UNKNOWN_SIGNAL")]);
    expect(r.level).toBe("DUSUK");
    expect(r.score).toBe(10);
  });

  it("D4e-5 yeni sinyaller YÜKSEK: NO_ADDRESS=40, VERIFIED_ABSENT_RECENT=40", () => {
    expect(scoreDebtorSignals("d1", "Ali", [sig("INTEL_NO_ADDRESS")])).toMatchObject({ level: "YUKSEK", score: 40 });
    expect(scoreDebtorSignals("d1", "Ali", [sig("INTEL_VERIFIED_ABSENT_RECENT")])).toMatchObject({ level: "YUKSEK", score: 40 });
  });

  it("VERIFIED_ABSENT_RECENT + 90D_MISSING birlikte → YÜKSEK, score 60 (absent S1'i susturmaz)", () => {
    const r = scoreDebtorSignals("d1", "Ali", [sig("INTEL_90D_MISSING"), sig("INTEL_VERIFIED_ABSENT_RECENT")]);
    expect(r.level).toBe("YUKSEK");
    expect(r.score).toBe(60);
  });
});

describe("buildPreHacizRisk — sinyalsiz borçlu elenir + risk azalan sıralı + overall rollup", () => {
  it("sinyalsiz borçlu debtors[]'a girmez (UI susar)", () => {
    const { debtors, overallLevel } = buildPreHacizRisk([
      { debtorId: "d1", name: "Ali", signals: [] },
      { debtorId: "d2", name: "Veli", signals: [sig("INTEL_90D_MISSING")] },
    ]);
    expect(debtors.map((d) => d.debtorId)).toEqual(["d2"]);
    expect(overallLevel).toBe("ORTA");
  });

  it("risk azalan sıralı: YÜKSEK borçlu üstte", () => {
    const { debtors, overallLevel } = buildPreHacizRisk([
      { debtorId: "d1", name: "Orta", signals: [sig("INTEL_90D_MISSING")] },
      { debtorId: "d2", name: "Yüksek", signals: [sig("INTEL_ADDRESS_UNVERIFIED")] },
    ]);
    expect(debtors[0].debtorId).toBe("d2"); // YUKSEK önce
    expect(debtors[1].debtorId).toBe("d1");
    expect(overallLevel).toBe("YUKSEK");
  });

  it("eşit seviyede skor azalan sıralı", () => {
    const { debtors } = buildPreHacizRisk([
      { debtorId: "d1", name: "TekHigh", signals: [sig("INTEL_ADDRESS_UNVERIFIED")] }, // 40
      { debtorId: "d2", name: "CiftHigh", signals: [sig("INTEL_ADDRESS_UNVERIFIED"), sig("INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY")] }, // 80
    ]);
    expect(debtors[0].debtorId).toBe("d2"); // aynı YUKSEK ama skor 80 > 40
  });

  it("hiç sinyal yok → debtors boş, overall YOK", () => {
    const { debtors, overallLevel } = buildPreHacizRisk([{ debtorId: "d1", name: "Ali", signals: [] }]);
    expect(debtors).toHaveLength(0);
    expect(overallLevel).toBe("YOK");
  });
});

describe("rollupOverallLevel", () => {
  it("borçlular arası en yüksek seviye", () => {
    expect(
      rollupOverallLevel([
        { debtorId: "d1", name: "a", level: "ORTA", score: 20, reasons: [] },
        { debtorId: "d2", name: "b", level: "YUKSEK", score: 40, reasons: [] },
      ])
    ).toBe("YUKSEK");
  });
  it("boş → YOK", () => {
    expect(rollupOverallLevel([])).toBe("YOK");
  });
});
