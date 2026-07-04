// WP-2c-1: CaseStaff.roleOnCase için tek-kaynak (shared) etiket-haritası + option-list.
//
// WP-2c-0 §9 model kararı (kilitli): roleOnCase = "Dosya Ekibi Rolü" — dosya içi PERSONEL ekip
// rolüdür. Canonical "Dosya Operasyon Sorumlusu" (Case.responsibleLawyerId/responsibleStaffId)
// DEĞİLDİR ve legacy Case.sorumluPersonelId DEĞİLDİR. "Sorumlu Personel" etiketi emekliye ayrıldı.
//
// DB enum / migration YOK — kolon String kalır; kanonikleştirme yalnız UI/görüntü katmanındadır.
// Eski satırlar legacy token taşıyabilir (SORUMLU/YARDIMCI/TAKIPCI/TEBLIGAT_SORUMLUSU) → normalize edilir.

/** Alan grubunun kullanıcı etiketi (dropdown başlığı). */
export const CASE_STAFF_ROLE_GROUP_LABEL = "Dosya Ekibi Rolü";

/** Owner kavramıyla karışmaması için yardım metni. */
export const CASE_STAFF_ROLE_HELP_TEXT =
  "Bu alan dosya ekibindeki personel rolünü gösterir; Dosya Operasyon Sorumlusu ile aynı kavram değildir.";

/** Kanonik değer kümesi (UI/docs; DB enum değil). Sıra = dropdown sırası. */
export const CASE_STAFF_ROLE_OPTIONS = [
  { value: "EKIP_SORUMLUSU", label: "Dosya Ekibi Sorumlusu" },
  { value: "YARDIMCI_PERSONEL", label: "Yardımcı Personel" },
  { value: "TAKIP_PERSONELI", label: "Takip Personeli" },
  { value: "STAJYER", label: "Stajyer" },
  { value: "KONTROL", label: "Kontrol" },
  { value: "YAZI_ISLERI", label: "Yazı İşleri" },
  { value: "MUHASEBE", label: "Muhasebe" },
  { value: "TEBLIGAT", label: "Tebligat" },
  { value: "ARSIV", label: "Arşiv" },
] as const;

export type CaseStaffRoleValue = (typeof CASE_STAFF_ROLE_OPTIONS)[number]["value"];

/** Legacy token → kanonik değer (eski satırlar + eski ekran değerleri için geri-uyum). */
const LEGACY_TO_CANONICAL: Record<string, CaseStaffRoleValue> = {
  SORUMLU: "EKIP_SORUMLUSU",
  YARDIMCI: "YARDIMCI_PERSONEL",
  TAKIPCI: "TAKIP_PERSONELI",
  TEBLIGAT_SORUMLUSU: "TEBLIGAT",
};

const CANONICAL_LABELS: Record<string, string> = Object.fromEntries(
  CASE_STAFF_ROLE_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * Bir roleOnCase değerini (kanonik VEYA legacy token) kanonik değere normalize eder.
 * - Boş/null → "" (atanmamış)
 * - Legacy token → kanonik karşılığı
 * - Kanonik değer → olduğu gibi
 * - Bilinmeyen token → olduğu gibi (kayıp olmasın; etiketleme `caseStaffRoleLabel`'da güvenli düşer)
 *
 * Controlled `<select value=...>` için kullanılır: eski satır legacy değeri taşısa bile dropdown
 * doğru kanonik seçeneği GÖSTERİR (yalnız görüntü). Kullanıcı bir seçenek seçerse kanonik değer yazılır;
 * dokunulmayan eski (legacy) değer OLDUĞU GİBİ korunur — zorunlu veri göçü YOK (WP-2c-0 §9 "Data migration yok").
 */
export function normalizeCaseStaffRole(value?: string | null): string {
  if (!value) return "";
  return LEGACY_TO_CANONICAL[value] ?? value;
}

/**
 * roleOnCase değerini kullanıcı etiketine çevirir. Ham token ASLA gösterilmez.
 * Boş/null veya bilinmeyen token → "" döner; çağıran taraf kendi fallback'ini uygular
 * (ör. `caseStaffRoleLabel(x) || staffType || 'Personel'`).
 */
export function caseStaffRoleLabel(value?: string | null): string {
  if (!value) return "";
  const canonical = normalizeCaseStaffRole(value);
  return CANONICAL_LABELS[canonical] ?? "";
}
