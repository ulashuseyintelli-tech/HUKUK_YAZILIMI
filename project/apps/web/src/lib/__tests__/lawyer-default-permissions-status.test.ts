import { describe, it, expect } from "vitest";
import {
  defaultPermissionsFormValue,
  describeLawyerDefaultPermissionsStatus,
  formatManagementRecordedAt,
  grantedDefaultPermissionLabels,
  parseLawyerDefaultPermissionsStatuses,
  type LawyerDefaultPermissions,
  type LawyerDefaultPermissionsStatus,
} from "@/lib/lawyer-default-permissions-status";

/**
 * K3-L KP-9 (owner kararı 2026-10-01) — kanıtsız varsayılan yetkinin durumu açıkça gösterilir. Karar sunucudadır; web
 * yalnız okur. Bilinmeyen / bozuk yanıt "uygulanıyor" SAYILMAZ.
 */
const status = (over: Partial<LawyerDefaultPermissionsStatus> = {}): LawyerDefaultPermissionsStatus => ({
  lawyerId: "l1",
  appliesAtCaseOpen: false,
  reason: "SOURCE_NOT_MANAGEMENT_VERIFIED",
  storedPermissions: { canEditCase: true, canViewFinance: true, canEditFinance: false },
  managementRecordedAt: null,
  ...over,
});
const FALLBACK: LawyerDefaultPermissions = {
  canEditCase: true,
  canGenerateDocs: true,
  canSyncUYAP: false,
  canViewFinance: true,
  canEditFinance: false,
  canChangeStatus: false,
  canEditParties: false,
};

describe("sunucu yanıtının okunması", () => {
  it("dizi değilse durum bilinmiyor (null) — rozet gösterilmez", () => {
    expect(parseLawyerDefaultPermissionsStatuses(undefined)).toBeNull();
    expect(parseLawyerDefaultPermissionsStatuses({})).toBeNull();
    expect(parseLawyerDefaultPermissionsStatuses("x")).toBeNull();
  });

  it("avukat kimliğine göre eşler; kayıtlı değerden yalnız bilinen anahtar + boolean alınır", () => {
    const map = parseLawyerDefaultPermissionsStatuses([
      {
        lawyerId: "l1",
        appliesAtCaseOpen: true,
        reason: null,
        storedPermissions: { canEditCase: true, canEditFinance: false, canSyncUYAP: "evet", bilinmeyen: true },
        managementRecordedAt: "2026-09-30T09:15:00.000Z",
      },
      { lawyerId: "l2", appliesAtCaseOpen: false, reason: "NO_DEFAULTS", storedPermissions: null, managementRecordedAt: null },
    ])!;
    expect(map.get("l1")).toEqual({
      lawyerId: "l1",
      appliesAtCaseOpen: true,
      reason: null,
      storedPermissions: { canEditCase: true, canEditFinance: false },
      managementRecordedAt: "2026-09-30T09:15:00.000Z",
    });
    expect(map.get("l2")).toMatchObject({ appliesAtCaseOpen: false, reason: "NO_DEFAULTS", storedPermissions: null });
  });

  it("FAIL-CLOSED: `true` olmayan ya da nedenle birlikte gelen 'uygulanıyor' kabul edilmez; nedeni tanınmayan satır atılır", () => {
    const map = parseLawyerDefaultPermissionsStatuses([
      { lawyerId: "a", appliesAtCaseOpen: "true", reason: null },
      { lawyerId: "b", appliesAtCaseOpen: true, reason: "SOURCE_VALUE_MISMATCH" },
      { lawyerId: "c", appliesAtCaseOpen: false, reason: "YENI_BIR_NEDEN" },
      { lawyerId: "", appliesAtCaseOpen: true, reason: null },
      null,
      "metin",
    ])!;
    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toMatchObject({ appliesAtCaseOpen: false, reason: "SOURCE_VALUE_MISMATCH" });
    expect(map.has("c")).toBe(false);
    expect(map.size).toBe(1);
  });
});

describe("durum metni", () => {
  it("uygulanıyor: yönetim kaydının zamanı Türkiye saatiyle", () => {
    const text = describeLawyerDefaultPermissionsStatus(
      status({ appliesAtCaseOpen: true, reason: null, managementRecordedAt: "2026-09-30T21:30:00.000Z" }),
    );
    expect(text.tone).toBe("applied");
    expect(text.badge).toBe("Varsayılan yetki uygulanıyor");
    // UTC 30.09 21:30 = TSİ 01.10 00:30 (gün sınırı)
    expect(text.detail).toContain("Yönetim kaydı: 01.10.2026 00:30 (TSİ)");
  });

  it("yönetim kaydı yok: uygulanmıyor + nasıl uygulanacağı; aynı değeri kaydetmenin kayıt oluşturmadığı söylenir", () => {
    const text = describeLawyerDefaultPermissionsStatus(status());
    expect(text.tone).toBe("not-applied");
    expect(text.badge).toBe("Varsayılan yetki uygulanmıyor");
    expect(text.detail).toContain("yönetim tarafından kaydedilmemiş");
    expect(text.detail).toContain("aynı değeri yeniden kaydetmek kayıt oluşturmaz");
  });

  it("değer doğrulanamıyor: son yönetim kaydının zamanı gösterilir", () => {
    const text = describeLawyerDefaultPermissionsStatus(
      status({ reason: "SOURCE_VALUE_MISMATCH", managementRecordedAt: "2026-09-30T09:15:00.000Z" }),
    );
    expect(text.detail).toContain("doğrulanamıyor");
    expect(text.detail).toContain("son yönetim kaydı: 30.09.2026 12:15 TSİ");
  });

  it("kayıt yok / pasif avukat", () => {
    expect(describeLawyerDefaultPermissionsStatus(status({ reason: "NO_DEFAULTS", storedPermissions: null })).detail).toContain(
      "Kayıtlı varsayılan yetki yok",
    );
    expect(describeLawyerDefaultPermissionsStatus(status({ reason: "LAWYER_INACTIVE" })).detail).toContain("Avukat pasif");
  });

  it("hiçbir durumda 'onayla' eylemi ya da onaylandı iddiası üretmez", () => {
    for (const reason of ["NO_DEFAULTS", "SOURCE_NOT_MANAGEMENT_VERIFIED", "SOURCE_VALUE_MISMATCH", "LAWYER_INACTIVE"] as const) {
      const text = describeLawyerDefaultPermissionsStatus(status({ reason }));
      expect(text.tone).toBe("not-applied");
      expect(`${text.badge} ${text.detail}`).not.toMatch(/onayla|onaylandı/i);
    }
  });
});

describe("zaman biçimi", () => {
  it("Türkiye saati; boş ya da geçersiz girdi boş döner", () => {
    expect(formatManagementRecordedAt("2026-09-30T09:15:00.000Z")).toBe("30.09.2026 12:15");
    expect(formatManagementRecordedAt("2026-12-31T22:00:00.000Z")).toBe("01.01.2027 01:00");
    expect(formatManagementRecordedAt(null)).toBe("");
    expect(formatManagementRecordedAt("tarih-degil")).toBe("");
  });
});

describe("kayıtlı değer ve form başlangıcı", () => {
  it("açık yetkiler form sırasıyla ve formdaki etiketlerle listelenir", () => {
    expect(grantedDefaultPermissionLabels({ canEditFinance: true, canEditCase: true, canViewFinance: false })).toEqual([
      "Dosya düzenleme",
      "Masraf düzenleme",
    ]);
    expect(grantedDefaultPermissionLabels(null)).toEqual([]);
  });

  it("kayıtlı değer biliniyorsa form ONU gösterir; eksik anahtar izin yok sayılır", () => {
    expect(defaultPermissionsFormValue(status({ storedPermissions: { canEditFinance: true } }), FALLBACK)).toEqual({
      canEditCase: false,
      canGenerateDocs: false,
      canSyncUYAP: false,
      canViewFinance: false,
      canEditFinance: true,
      canChangeStatus: false,
      canEditParties: false,
    });
  });

  it("durum bilinmiyorsa ya da kayıtlı değer yoksa bugünkü yedek kullanılır (kopya döner)", () => {
    const unknown = defaultPermissionsFormValue(null, FALLBACK);
    expect(unknown).toEqual(FALLBACK);
    expect(unknown).not.toBe(FALLBACK);
    expect(defaultPermissionsFormValue(status({ reason: "NO_DEFAULTS", storedPermissions: null }), FALLBACK)).toEqual(FALLBACK);
  });
});
