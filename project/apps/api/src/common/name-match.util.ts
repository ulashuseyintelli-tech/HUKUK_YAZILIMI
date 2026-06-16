/**
 * Kişi adı EŞLEŞTİRME normalizasyonu (duplicate guard için). Saklanan değer DEĞİŞMEZ.
 * Diakritik folding + noktalama temizliği + tek boşluk + uppercase →
 * "Ulaş Hüseyin Telli" = "ULAS HUSEYIN TELLI" = "ulaş hüseyin telli" → aynı anahtar.
 */
export function normalizePersonName(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
