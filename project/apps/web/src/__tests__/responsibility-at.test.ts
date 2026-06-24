// WP-1d-4a: temporal sorumluluk paneli saf yardımcı testleri (frontend-only).

import { describe, it, expect } from "vitest";
import {
  buildResponsibilityAtPath,
  RESPONSIBILITY_FIELD_LABELS,
  confidenceLabel,
  confidenceTooltip,
  confidenceBadgeClass,
  localInputToIso,
} from "../lib/responsibility-at";

describe("WP-1d-4a responsibility-at helpers", () => {
  it("(path) asOf yoksa salt path, varsa encode'lu query", () => {
    expect(buildResponsibilityAtPath("c1")).toBe("/cases/c1/responsibility-at");
    expect(buildResponsibilityAtPath("c1", "2026-06-24T10:00:00.000Z")).toBe(
      "/cases/c1/responsibility-at?asOf=2026-06-24T10%3A00%3A00.000Z",
    );
  });

  it("(labels) kanonik alan etiketleri", () => {
    expect(RESPONSIBILITY_FIELD_LABELS.operationOwner).toBe("Dosya Operasyon Sorumlusu");
    expect(RESPONSIBILITY_FIELD_LABELS.legalResponsibleLawyer).toBe("Hukuki Sorumlu Avukat");
    expect(RESPONSIBILITY_FIELD_LABELS.changedByUser).toBe("Değiştiren Kullanıcı");
    expect(RESPONSIBILITY_FIELD_LABELS.effectiveAt).toBe("Geçerlilik Tarihi");
    expect(RESPONSIBILITY_FIELD_LABELS.confidence).toBe("Güven Düzeyi");
  });

  it("(confidence label) üç düzey + bilinmeyen", () => {
    expect(confidenceLabel("EVENT_CONFIRMED")).toBe("Audit kaydıyla doğrulandı");
    expect(confidenceLabel("INFERRED_FROM_SNAPSHOT")).toBe("Mevcut kayıttan çıkarıldı");
    expect(confidenceLabel("UNKNOWN_BEFORE_HORIZON")).toBe("Bu tarih için kesin kayıt yok");
    expect(confidenceLabel(null)).toBe("—");
    expect(confidenceLabel("WAT")).toBe("—");
  });

  it("(confidence tooltip) açıklama metinleri dürüst (kesinlik iddiası yok)", () => {
    expect(confidenceTooltip("EVENT_CONFIRMED")).toContain("AuditLog event stream");
    expect(confidenceTooltip("INFERRED_FROM_SNAPSHOT")).toContain("mevcut kayıt/snapshot");
    expect(confidenceTooltip("UNKNOWN_BEFORE_HORIZON")).toContain("enstrümantasyon");
    expect(confidenceTooltip(null)).toBe("");
  });

  it("(badge) güven düzeyine göre ton; bilinmeyen → nötr", () => {
    expect(confidenceBadgeClass("EVENT_CONFIRMED")).toContain("green");
    expect(confidenceBadgeClass("INFERRED_FROM_SNAPSHOT")).toContain("amber");
    expect(confidenceBadgeClass("UNKNOWN_BEFORE_HORIZON")).toContain("gray");
    expect(confidenceBadgeClass(undefined)).toContain("gray");
  });

  it("(iso) datetime-local → ISO; boş/geçersiz → null", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso(null)).toBeNull();
    expect(localInputToIso("not-a-date")).toBeNull();
    const iso = localInputToIso("2026-06-24T13:30");
    expect(iso).toMatch(/^2026-06-24T\d{2}:\d{2}:00\.000Z$/);
  });
});
