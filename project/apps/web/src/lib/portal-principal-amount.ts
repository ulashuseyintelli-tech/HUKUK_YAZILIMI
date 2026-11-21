/**
 * Müvekkil portalında dosyanın kayıtlı ASIL ALACAK tutarı (`Case.principalAmount`).
 *
 * Alan açılıştaki asıl alacak toplamıdır (PRINCIPAL Due + kambiyo asıl alacağı; şema: "@deprecated denormalize legacy
 * toplam"); faiz, fer'i kalemler ve masraf İÇERMEZ → dosyanın toplam borcu diye etiketlenmez (F02 kabul K-4, owner
 * 22.11.2026). Değer yoksa (NULL / boş / sayı değil) "Tutar belirlenemedi"; gerçek sıfır "0 ₺" olarak korunur.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - app/portal/page.tsx ("Son Dosyalar" satırı)
 * - app/portal/cases/page.tsx ("Asıl Alacak" sütunu)
 * </remarks>
 */
export const PORTAL_PRINCIPAL_UNKNOWN_LABEL = "Tutar belirlenemedi";
export const PORTAL_PRINCIPAL_COLUMN_LABEL = "Asıl Alacak";

export function formatPortalPrincipalAmount(value: unknown): string {
  if (value === null || value === undefined) return PORTAL_PRINCIPAL_UNKNOWN_LABEL;
  if (typeof value === "string" && value.trim() === "") return PORTAL_PRINCIPAL_UNKNOWN_LABEL;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return PORTAL_PRINCIPAL_UNKNOWN_LABEL;
  return `${amount.toLocaleString("tr-TR")} ₺`;
}
