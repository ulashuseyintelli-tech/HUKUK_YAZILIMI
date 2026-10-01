/**
 * K3-L KP-9 (owner kararı 2026-10-01) — avukatın varsayılan dosya yetkisinin DURUMU (salt gösterim).
 *
 * Sunucu, dosya açılışında varsayılanı yalnız yönetimin (ADMIN ya da ortak avukat) en son kaydı güncel değerle
 * eşleşiyorsa dosyaya kopyalar. Yönetim bunu bugüne kadar göremiyordu; avukat formu da kayıtlı değer yerine sabit bir
 * yedeği gösteriyordu. Durum sunucunun `GET /lawyers/default-permissions/status` yanıtıdır — burada karar ÜRETİLMEZ,
 * yalnız okunur ve Türkçe metne çevrilir. Onay aksiyonu yoktur.
 */

export const LAWYER_DEFAULT_PERMISSION_KEYS = [
  "canEditCase",
  "canGenerateDocs",
  "canSyncUYAP",
  "canViewFinance",
  "canEditFinance",
  "canChangeStatus",
  "canEditParties",
] as const;
export type LawyerDefaultPermissionKey = (typeof LAWYER_DEFAULT_PERMISSION_KEYS)[number];
export type LawyerDefaultPermissions = Record<LawyerDefaultPermissionKey, boolean>;

/** Avukat formundaki işaret kutularıyla AYNI etiketler */
export const LAWYER_DEFAULT_PERMISSION_LABELS: Record<LawyerDefaultPermissionKey, string> = {
  canEditCase: "Dosya düzenleme",
  canGenerateDocs: "Evrak oluşturma",
  canSyncUYAP: "UYAP senkron",
  canViewFinance: "Hesap görme",
  canEditFinance: "Masraf düzenleme",
  canChangeStatus: "Statü değiştirme",
  canEditParties: "Taraf düzenleme",
};

export type LawyerDefaultPermissionsReason =
  | "LAWYER_INACTIVE"
  | "NO_DEFAULTS"
  | "SOURCE_NOT_MANAGEMENT_VERIFIED"
  | "SOURCE_VALUE_MISMATCH";

export interface LawyerDefaultPermissionsStatus {
  lawyerId: string;
  appliesAtCaseOpen: boolean;
  reason: LawyerDefaultPermissionsReason | null;
  storedPermissions: Partial<LawyerDefaultPermissions> | null;
  managementRecordedAt: string | null;
}

const REASONS: ReadonlySet<string> = new Set([
  "LAWYER_INACTIVE",
  "NO_DEFAULTS",
  "SOURCE_NOT_MANAGEMENT_VERIFIED",
  "SOURCE_VALUE_MISMATCH",
]);

function parseStored(value: unknown): Partial<LawyerDefaultPermissions> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const out: Partial<LawyerDefaultPermissions> = {};
  for (const key of LAWYER_DEFAULT_PERMISSION_KEYS) {
    if (typeof record[key] === "boolean") out[key] = record[key] as boolean;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Sunucu yanıtını avukat kimliğine göre eşler. Biçimi tanınmayan satır atılır; "uygulanıyor" yalnız sunucu açıkça `true`
 * dediğinde ve neden taşımadığında kabul edilir (bilinmeyen yanıt uygulanıyor SAYILMAZ). Yanıt dizi değilse null döner
 * (durum bilinmiyor — rozet gösterilmez).
 */
export function parseLawyerDefaultPermissionsStatuses(value: unknown): Map<string, LawyerDefaultPermissionsStatus> | null {
  if (!Array.isArray(value)) return null;
  const map = new Map<string, LawyerDefaultPermissionsStatus>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.lawyerId !== "string" || !row.lawyerId) continue;
    const reason = typeof row.reason === "string" && REASONS.has(row.reason) ? (row.reason as LawyerDefaultPermissionsReason) : null;
    const applies = row.appliesAtCaseOpen === true && row.reason == null;
    if (!applies && reason === null) continue; // ne uygulanıyor ne de bilinen bir neden: gösterilecek kesin durum yok
    map.set(row.lawyerId, {
      lawyerId: row.lawyerId,
      appliesAtCaseOpen: applies,
      reason: applies ? null : reason,
      storedPermissions: parseStored(row.storedPermissions),
      managementRecordedAt: typeof row.managementRecordedAt === "string" && row.managementRecordedAt ? row.managementRecordedAt : null,
    });
  }
  return map;
}

/** Yönetim kaydının zamanı, Türkiye saatiyle (GG.AA.YYYY SS:DD); okunamazsa boş. */
export function formatManagementRecordedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("day")}.${pick("month")}.${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

export interface LawyerDefaultPermissionsStatusText {
  tone: "applied" | "not-applied";
  /** Liste rozeti */
  badge: string;
  /** Avukat formundaki açıklama */
  detail: string;
}

const HOW_TO_APPLY =
  "Uygulanması için yönetimin (ADMIN kullanıcı ya da ortak avukat) bu kartta değeri değiştirip kaydetmesi gerekir; aynı değeri yeniden kaydetmek kayıt oluşturmaz.";

export function describeLawyerDefaultPermissionsStatus(status: LawyerDefaultPermissionsStatus): LawyerDefaultPermissionsStatusText {
  const recordedAt = formatManagementRecordedAt(status.managementRecordedAt);
  if (status.appliesAtCaseOpen) {
    return {
      tone: "applied",
      badge: "Varsayılan yetki uygulanıyor",
      detail: `Yeni açılan dosyalara aşağıdaki kayıtlı değer kopyalanır.${recordedAt ? ` Yönetim kaydı: ${recordedAt} (TSİ).` : ""}`,
    };
  }
  const badge = "Varsayılan yetki uygulanmıyor";
  switch (status.reason) {
    case "NO_DEFAULTS":
      return {
        tone: "not-applied",
        badge,
        detail: "Kayıtlı varsayılan yetki yok. Yeni açılan dosyada bu avukata varsayılan yetki yazılmaz; yetki dosya bazında verilir.",
      };
    case "SOURCE_NOT_MANAGEMENT_VERIFIED":
      return {
        tone: "not-applied",
        badge,
        detail: `Kayıtlı değer yönetim tarafından kaydedilmemiş (avukat oluşturulurken doldurulmuş). Yeni açılan dosyalara kopyalanmaz. ${HOW_TO_APPLY}`,
      };
    case "SOURCE_VALUE_MISMATCH":
      return {
        tone: "not-applied",
        badge,
        detail:
          `Kayıtlı değer yönetimin son kaydıyla doğrulanamıyor${recordedAt ? ` (son yönetim kaydı: ${recordedAt} TSİ)` : ""}: değer sonradan ` +
          `başka yoldan değişmiş ya da kayıt eski biçimde. Yeni açılan dosyalara kopyalanmaz. ${HOW_TO_APPLY}`,
      };
    case "LAWYER_INACTIVE":
    default:
      return { tone: "not-applied", badge, detail: "Avukat pasif; varsayılan yetki yeni dosyalara uygulanmaz." };
  }
}

/** Kayıtlı değerde AÇIK olan yetkilerin etiketleri (form sırasıyla). */
export function grantedDefaultPermissionLabels(stored: Partial<LawyerDefaultPermissions> | null | undefined): string[] {
  if (!stored) return [];
  return LAWYER_DEFAULT_PERMISSION_KEYS.filter((key) => stored[key] === true).map((key) => LAWYER_DEFAULT_PERMISSION_LABELS[key]);
}

/**
 * Avukat formundaki işaret kutularının başlangıç değeri. Kayıtlı değer biliniyorsa O gösterilir (eksik anahtar = izin
 * yok, sunucu kapısıyla aynı); bilinmiyorsa `fallback` (bugünkü yedek) kullanılır.
 */
export function defaultPermissionsFormValue(
  status: LawyerDefaultPermissionsStatus | null | undefined,
  fallback: LawyerDefaultPermissions,
): LawyerDefaultPermissions {
  if (!status?.storedPermissions) return { ...fallback };
  const out = {} as LawyerDefaultPermissions;
  for (const key of LAWYER_DEFAULT_PERMISSION_KEYS) out[key] = status.storedPermissions[key] === true;
  return out;
}
