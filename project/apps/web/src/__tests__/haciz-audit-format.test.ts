/**
 * PR-D4e-7 — haciz audit görüntüleme saf etiket yardımcıları (READ-ONLY surfacing).
 * Backend metadata normalize edilmez; yalnız ham id/enum → okunur etiket.
 */

import { describe, it, expect } from "vitest";
import { riskLabel, riskBadge, reasonLabel, targetLabel } from "@/lib/haciz-audit-format";

describe("riskLabel", () => {
  it("seviye → Türkçe etiket", () => {
    expect(riskLabel("YUKSEK")).toBe("Yüksek");
    expect(riskLabel("ORTA")).toBe("Orta");
    expect(riskLabel("DUSUK")).toBe("Düşük");
    expect(riskLabel("YOK")).toBe("Yok");
  });
  it("bilinmeyen/boş → Yok (graceful)", () => {
    expect(riskLabel(undefined)).toBe("Yok");
    expect(riskLabel(null)).toBe("Yok");
  });
});

describe("reasonLabel", () => {
  it("bilinen sinyal → okunur etiket", () => {
    expect(reasonLabel("INTEL_NO_ADDRESS")).toContain("kayıtlı adresi yok");
    expect(reasonLabel("INTEL_VERIFIED_ABSENT_RECENT")).toContain("bulunmadığı");
    expect(reasonLabel("INTEL_90D_MISSING")).toContain("90");
  });
  it("bilinmeyen sinyal → ham id korunur (kaybetme)", () => {
    expect(reasonLabel("INTEL_FUTURE_SIGNAL")).toBe("INTEL_FUTURE_SIGNAL");
  });
});

describe("targetLabel", () => {
  it("hedef tipi → Türkçe", () => {
    expect(targetLabel("BANK")).toBe("Banka");
    expect(targetLabel("VEHICLE")).toBe("Araç");
  });
  it("bilinmeyen/boş → ham veya 'Haciz'", () => {
    expect(targetLabel(undefined)).toBe("Haciz");
    expect(targetLabel("XYZ")).toBe("XYZ");
  });
});

describe("riskBadge", () => {
  it("seviyeye göre renk sınıfı; bilinmeyen → YOK rengi", () => {
    expect(riskBadge("YUKSEK")).toContain("red");
    expect(riskBadge(undefined)).toBe(riskBadge("YOK"));
  });
});
