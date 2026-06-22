// M2-G5b-2: sahiplik bölümleme helper testleri.
import { describe, it, expect } from "vitest";
import {
  isRealPersonOwner,
  isLegacyOwner,
  splitPersonelByOwnership,
} from "@/lib/personel-report-grouping";

describe("personel-report-grouping (M2-G5b-2)", () => {
  it("LAWYER → gerçek kişi (real=true, legacy=false)", () => {
    const r = { ownerType: "LAWYER" as const };
    expect(isRealPersonOwner(r)).toBe(true);
    expect(isLegacyOwner(r)).toBe(false);
  });

  it("STAFF → gerçek kişi", () => {
    expect(isRealPersonOwner({ ownerType: "STAFF" as const })).toBe(true);
  });

  it("LEGACY_USER → legacy (real=false, legacy=true)", () => {
    const r = { ownerType: "LEGACY_USER" as const };
    expect(isRealPersonOwner(r)).toBe(false);
    expect(isLegacyOwner(r)).toBe(true);
  });

  it("ownerType YOK (undefined) → legacy kabul (real=false) — eski response/cache patlamaz", () => {
    const r = {}; // eski G5b-1 öncesi shape
    expect(isRealPersonOwner(r)).toBe(false);
    expect(isLegacyOwner(r)).toBe(true);
  });

  it("ownerType null → legacy kabul", () => {
    const r = { ownerType: null };
    expect(isRealPersonOwner(r)).toBe(false);
    expect(isLegacyOwner(r)).toBe(true);
  });

  it("split → real (LAWYER/STAFF) ve legacy (LEGACY_USER + ownerType'sız) ayrışır, örtüşme yok, tümü kapsanır", () => {
    const rows = [
      { id: "L1", ownerType: "LAWYER" as const },
      { id: "S1", ownerType: "STAFF" as const },
      { id: "u9", ownerType: "LEGACY_USER" as const },
      { id: "old", ownerType: undefined }, // eski satır → legacy
    ];
    const { realPersons, legacy } = splitPersonelByOwnership(rows);
    expect(realPersons.map((r) => r.id)).toEqual(["L1", "S1"]);
    expect(legacy.map((r) => r.id)).toEqual(["u9", "old"]);
    expect(realPersons.length + legacy.length).toBe(rows.length); // tümü kapsanır, örtüşme yok
  });
});
