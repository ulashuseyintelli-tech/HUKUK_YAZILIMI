/**
 * C15-S1-MODIFIED PR-3 — Kenar bölümlemesi (Kilit 2: bütünlük değişmezi).
 *
 * exposed ∪ withheld === PR-1'in TÜRETİLMİŞ tam kenar kümesi, kesişim boş,
 * withheld TAM ÜÇ kenar. Karşılaştırma PR-1 tablosundan TÜRETİLEREK yapılır
 * (hard-coded kopya değil): PR-1 tablosu değişirse bu kapı düşer ve bölümleme
 * yeniden gözden geçirilmeye zorlanır.
 */

import {
  PR3_EXPOSED_EDGES,
  WITHHELD_SAFETY_CRITICAL_EDGES,
  fullLifecycleEdgeSet,
  isPr3ExposedEdge,
  isWithheldSafetyCriticalEdge,
  lifecycleEdgeKey,
} from "../tenant-lifecycle-edges";

const key = ([from, to]: readonly [string, string]): string =>
  lifecycleEdgeKey(from as never, to as never);

describe("C15-S1-MODIFIED PR-3 — kenar bölümlemesi", () => {
  it("withheld küme TAM ÜÇ kenardır ve içeriği sabittir", () => {
    expect(WITHHELD_SAFETY_CRITICAL_EDGES.map(key).sort()).toEqual([
      "PROVISIONING->ACTIVE",
      "QUIESCING->RETIRED",
      "QUIESCING->SUSPENDED",
    ]);
  });

  it("exposed küme TAM BEŞ kenardır ve içeriği sabittir", () => {
    expect(PR3_EXPOSED_EDGES.map(key).sort()).toEqual([
      "ACTIVE->QUIESCING",
      "PROVISIONING->QUIESCING",
      "QUIESCING->ACTIVE",
      "SUSPENDED->ACTIVE",
      "SUSPENDED->QUIESCING",
    ]);
  });

  it("exposed ∪ withheld === PR-1 tablosundan türetilen tam kenar kümesi (8 kenar)", () => {
    const union = [...PR3_EXPOSED_EDGES.map(key), ...WITHHELD_SAFETY_CRITICAL_EDGES.map(key)].sort();
    const full = fullLifecycleEdgeSet().map(key).sort();
    expect(full).toHaveLength(8);
    expect(union).toEqual(full);
  });

  it("exposed ∩ withheld boştur", () => {
    const exposed = new Set(PR3_EXPOSED_EDGES.map(key));
    for (const e of WITHHELD_SAFETY_CRITICAL_EDGES) {
      expect(exposed.has(key(e))).toBe(false);
    }
  });

  it("PROVISIONING->RETIRED PR-1 tablosunda YOKTUR ve bu bölümlemede de yoktur", () => {
    // Owner not: bu kenar "güvenli abort" olarak önerilmişti; PR-1'de yok ve PR-3
    // tabloyu DEĞİŞTİRMEZ. Abort yolu: PROVISIONING->QUIESCING (sunuluyor).
    const full = new Set(fullLifecycleEdgeSet().map(key));
    expect(full.has("PROVISIONING->RETIRED")).toBe(false);
    expect(isPr3ExposedEdge("PROVISIONING", "RETIRED")).toBe(false);
    expect(isWithheldSafetyCriticalEdge("PROVISIONING", "RETIRED")).toBe(false);
  });

  it("yardımcılar bölümlemeyle tutarlıdır", () => {
    for (const [from, to] of WITHHELD_SAFETY_CRITICAL_EDGES) {
      expect(isWithheldSafetyCriticalEdge(from, to)).toBe(true);
      expect(isPr3ExposedEdge(from, to)).toBe(false);
    }
    for (const [from, to] of PR3_EXPOSED_EDGES) {
      expect(isPr3ExposedEdge(from, to)).toBe(true);
      expect(isWithheldSafetyCriticalEdge(from, to)).toBe(false);
    }
  });
});
