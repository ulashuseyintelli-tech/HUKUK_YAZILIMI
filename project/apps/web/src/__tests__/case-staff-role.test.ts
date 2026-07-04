// WP-2c-1: CaseStaff.roleOnCase shared label-map + option-list testleri (frontend-only).
// WP-2c-0 §9 model kararını sözleşme olarak doğrular.

import { describe, it, expect } from "vitest";
import {
  CASE_STAFF_ROLE_GROUP_LABEL,
  CASE_STAFF_ROLE_HELP_TEXT,
  CASE_STAFF_ROLE_OPTIONS,
  normalizeCaseStaffRole,
  caseStaffRoleLabel,
} from "../lib/case-staff-role";

describe("WP-2c-1 case-staff-role — §9 model kararı sözleşmesi", () => {
  it("(grup) alan adı 'Dosya Ekibi Rolü' ve yardım metni owner ayrımını söyler", () => {
    expect(CASE_STAFF_ROLE_GROUP_LABEL).toBe("Dosya Ekibi Rolü");
    expect(CASE_STAFF_ROLE_HELP_TEXT).toContain("Dosya Operasyon Sorumlusu ile aynı kavram değildir");
  });

  it("(option-list) 9 kanonik değer, ilk = EKIP_SORUMLUSU → 'Dosya Ekibi Sorumlusu'", () => {
    expect(CASE_STAFF_ROLE_OPTIONS).toHaveLength(9);
    expect(CASE_STAFF_ROLE_OPTIONS[0]).toEqual({ value: "EKIP_SORUMLUSU", label: "Dosya Ekibi Sorumlusu" });
    expect(CASE_STAFF_ROLE_OPTIONS.map((o) => o.value)).toEqual([
      "EKIP_SORUMLUSU",
      "YARDIMCI_PERSONEL",
      "TAKIP_PERSONELI",
      "STAJYER",
      "KONTROL",
      "YAZI_ISLERI",
      "MUHASEBE",
      "TEBLIGAT",
      "ARSIV",
    ]);
  });

  it("(emeklilik) hiçbir kullanıcı etiketi 'Sorumlu Personel' DEĞİL", () => {
    expect(CASE_STAFF_ROLE_OPTIONS.map((o) => o.label)).not.toContain("Sorumlu Personel");
    expect(caseStaffRoleLabel("SORUMLU")).toBe("Dosya Ekibi Sorumlusu");
    expect(caseStaffRoleLabel("SORUMLU")).not.toBe("Sorumlu Personel");
  });

  it("(normalize) legacy token → kanonik değer", () => {
    expect(normalizeCaseStaffRole("SORUMLU")).toBe("EKIP_SORUMLUSU");
    expect(normalizeCaseStaffRole("YARDIMCI")).toBe("YARDIMCI_PERSONEL");
    expect(normalizeCaseStaffRole("TAKIPCI")).toBe("TAKIP_PERSONELI");
    expect(normalizeCaseStaffRole("TEBLIGAT_SORUMLUSU")).toBe("TEBLIGAT");
  });

  it("(normalize) kanonik passthrough · boş → '' · bilinmeyen → olduğu gibi", () => {
    expect(normalizeCaseStaffRole("EKIP_SORUMLUSU")).toBe("EKIP_SORUMLUSU");
    expect(normalizeCaseStaffRole("STAJYER")).toBe("STAJYER");
    expect(normalizeCaseStaffRole("")).toBe("");
    expect(normalizeCaseStaffRole(null)).toBe("");
    expect(normalizeCaseStaffRole(undefined)).toBe("");
    expect(normalizeCaseStaffRole("WIDGET_X")).toBe("WIDGET_X");
  });

  it("(label) legacy + kanonik token → doğru kullanıcı etiketi", () => {
    expect(caseStaffRoleLabel("EKIP_SORUMLUSU")).toBe("Dosya Ekibi Sorumlusu");
    expect(caseStaffRoleLabel("YARDIMCI")).toBe("Yardımcı Personel");
    expect(caseStaffRoleLabel("TAKIPCI")).toBe("Takip Personeli");
    expect(caseStaffRoleLabel("TEBLIGAT_SORUMLUSU")).toBe("Tebligat");
    expect(caseStaffRoleLabel("STAJYER")).toBe("Stajyer");
    expect(caseStaffRoleLabel("YAZI_ISLERI")).toBe("Yazı İşleri");
  });

  it("(label) boş/bilinmeyen → '' (ham token sızmaz; çağıran fallback uygular)", () => {
    expect(caseStaffRoleLabel("")).toBe("");
    expect(caseStaffRoleLabel(null)).toBe("");
    expect(caseStaffRoleLabel(undefined)).toBe("");
    // bilinmeyen token: ham "WIDGET_X" GÖSTERİLMEZ → "" döner
    expect(caseStaffRoleLabel("WIDGET_X")).toBe("");
    // çağıran fallback davranışı (badge deseni)
    expect(caseStaffRoleLabel("") || "OFIS_KATIBI" || "Personel").toBe("OFIS_KATIBI");
  });
});
