// Onay Kutusu — dosya kalemi (Due) talebi okunur özeti: ekleme / değişiklik / silme. Sentetik değerler; gerçek dosya / kişi bilgisi YOK.
import { describe, it, expect } from "vitest";
import { getApprovalSummary } from "@/components/office-approval/summary/registry";
import {
  CASE_DUE_CHANGE_UNSUPPORTED_REASON,
  projectCaseDueChange,
} from "@/components/office-approval/summary/case-due-change.projector";

const ACTION = "CLAIM_ITEM_HIGH_IMPACT_CHANGE";
const BEFORE = {
  type: "PRINCIPAL",
  amount: "1000.00",
  currency: "TRY",
  dueDate: "2025-01-15T00:00:00.000Z",
  interestType: "YASAL",
  interestTypeCode: "LEGAL_3095",
  interestRate: null,
  interestStartDate: null,
  interestEndDate: null,
};
const base = { version: "CASE_DUE_CHANGE_V1", caseId: "case-s1", reason: "sentetik" };
const create = (due: Record<string, unknown>) => ({ ...base, operation: "DUE_CREATE", due });
const update = (patch: Record<string, unknown>, effectiveFields: string[], before: Record<string, unknown> = BEFORE) => ({
  ...base, operation: "DUE_UPDATE", dueId: "due-s1", patch, effectiveFields, stateDigest: "sentetik-ozet", before,
});
const remove = (before: Record<string, unknown>) => ({ ...base, operation: "DUE_DELETE", dueId: "due-s1", stateDigest: "sentetik-ozet", before });
const pairs = (result: ReturnType<typeof projectCaseDueChange>) => result.fields.map((field) => [field.label, field.value]);

describe("Onay Kutusu özeti — dosya kalemi talebi", () => {
  it("ekleme: tür, tutar (para birimiyle), vade ve verilen alanlar okunur; verilmeyen alan uydurulmaz", () => {
    const result = getApprovalSummary(ACTION, create({ type: "PRINCIPAL", amount: 1000, dueDate: "2025-01-15", currency: "TRY", interestType: "YASAL", description: "Sentetik asıl alacak", isPrimary: true }));
    expect(result.kind).toBe("summary");
    expect(pairs(result)).toEqual([
      ["İşlem", "Yeni dosya kalemi ekleme"],
      ["Tür", "Ana Para (Asıl Alacak)"],
      ["Tutar", "1.000 TRY"],
      ["Vade tarihi", "15.01.2025"],
      ["Açıklama", "Sentetik asıl alacak"],
      ["Faiz türü (eski kod)", expect.any(String)],
      ["Ana kalem", "Evet"],
    ]);
    expect(result.impactNotes?.join(" ")).toContain("Onaylanana kadar kalem dosyada yoktur");
  });

  it("değişiklik: değişen alan önce → sonra yazılır; onaya tabi alan uyarı tonundadır; açıklayıcı alan yalnız yeni değerle", () => {
    const result = getApprovalSummary(ACTION, update({ type: "KIRA", description: "Sentetik kira alacağı" }, ["type"]));
    expect(result.kind).toBe("summary");
    expect(pairs(result)).toEqual([
      ["İşlem", "Dosya kalemi değişikliği"],
      ["Kalem (talep anında)", "Ana Para (Asıl Alacak) — 1.000,00 TRY"],
      ["Tür", "Ana Para (Asıl Alacak) → Kira Alacağı"],
      ["Açıklama", "Sentetik kira alacağı"],
    ]);
    expect(result.fields.find((field) => field.label === "Tür")?.tone).toBe("warning");
    expect(result.fields.find((field) => field.label === "Açıklama")?.tone).toBeUndefined();
    expect(result.impactNotes?.join(" ")).toContain("Onaylanana kadar dosya kalemi değişmez");
  });

  it("değişiklik (bağlı kalemi olmayan kalem): tutar ve vade önce → sonra", () => {
    const before = { ...BEFORE, type: "NAFAKA", amount: "300.00", dueDate: "2025-05-05T00:00:00.000Z", interestType: null, interestTypeCode: null };
    const result = projectCaseDueChange(update({ amount: 350, dueDate: "2025-06-05" }, ["amount", "dueDate"], before), {});
    expect(pairs(result)).toEqual([
      ["İşlem", "Dosya kalemi değişikliği"],
      ["Kalem (talep anında)", "Nafaka — 300,00 TRY"],
      ["Tutar", "300,00 → 350"],
      ["Vade tarihi", "05.05.2025 → 05.06.2025"],
    ]);
  });

  it("silme: silinecek kalemin türü, tutarı, vadesi ve açıklaması okunur", () => {
    const result = getApprovalSummary(ACTION, remove({ ...BEFORE, type: "NAFAKA", amount: "300.00", dueDate: "2025-05-05T00:00:00.000Z", description: "Sentetik nafaka taksiti" }));
    expect(pairs(result)).toEqual([
      ["İşlem", "Dosya kalemi silme"],
      ["Tür", "Nafaka"],
      ["Tutar", "300,00 TRY"],
      ["Vade tarihi", "05.05.2025"],
      ["Açıklama", "Sentetik nafaka taksiti"],
    ]);
    expect(result.fields[0].tone).toBe("danger");
    expect(result.impactNotes?.join(" ")).toContain("Onaylanana kadar dosya kalemi yerinde kalır");
  });

  it.each([
    ["tanınmayan işlem", { ...base, operation: "DUE_PURGE" }],
    ["ekleme: içerik yok", { ...base, operation: "DUE_CREATE" }],
    ["ekleme: tanınmayan alan", create({ type: "PRINCIPAL", amount: 1000, dueDate: "2025-01-15", currency: "TRY", status: "ACTIVE" })],
    ["ekleme: tanınmayan tür", create({ type: "BILINMEYEN", amount: 1000, dueDate: "2025-01-15", currency: "TRY" })],
    ["ekleme: tutar yok", create({ type: "PRINCIPAL", dueDate: "2025-01-15", currency: "TRY" })],
    ["ekleme: biçimsiz tarih", create({ type: "PRINCIPAL", amount: 1000, dueDate: "15/01/2025", currency: "TRY" })],
    ["ekleme: tanınmayan faiz türü kodu", create({ type: "PRINCIPAL", amount: 1000, dueDate: "2025-01-15", currency: "TRY", interestTypeCode: "BILINMEYEN_KOD" })],
    ["değişiklik: önceki durum yok", { ...update({ type: "KIRA" }, ["type"]), before: null }],
    ["değişiklik: onaya tabi alan listesi yok", update({ type: "KIRA" }, [])],
    ["değişiklik: boş yama", update({}, ["type"])],
    ["değişiklik: tanınmayan alan", update({ status: "CANCELLED" }, ["type"])],
    ["silme: önceki durum yok", { ...base, operation: "DUE_DELETE", dueId: "due-s1" }],
  ] as Array<[string, unknown]>)("güvenli özet üretilemeyen kayıt yarım özet vermez: %s", (_label, intent) => {
    const result = getApprovalSummary(ACTION, intent);
    expect([result.kind, result.fields, result.reason]).toEqual(["unsafe", [], CASE_DUE_CHANGE_UNSUPPORTED_REASON]);
  });

  it("başka sürüm bu projektöre düşmez (öteki kalem işlemleri etkilenmez)", () => {
    expect(projectCaseDueChange({ version: "OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1", operation: "UPDATE" }, {}).kind).toBe("unsafe");
    const other = getApprovalSummary(ACTION, { version: "OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1", operation: "DELETE" });
    expect(other.reason).not.toBe(CASE_DUE_CHANGE_UNSUPPORTED_REASON);
  });
});
