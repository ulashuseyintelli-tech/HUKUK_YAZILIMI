/**
 * D-3b GUVENLIK DUZELTMESI (2026-09-06) — INTAKE TOKEN SIZINTISI KAPATMA.
 *
 * Kusur: bilgi talebi e-postasinin GOVDESI, intake baglantisi (ham token tasiyan URL) ile
 * uretiliyor ve AYNI govde `ClientInfoRequest.emailBody` olarak DB'ye yaziliyordu; create
 * yaniti `...request` ile bu alani geri donduruyor, liste/detay uclari da ayni alani
 * okuyordu. Sonuc: kullanilabilir token uygulama DB'sinde ve API yanitlarinda.
 *
 * Duzeltme iki katmanlidir:
 *  1. YAZMA: kalici govde (`buildPersistedBody`) baglanti OLMADAN uretilir; baglantili govde
 *     yalniz e-posta saglayicisina gider ve hicbir yere yazilmaz.
 *  2. OKUMA (savunma): `redactIntakeTokens` create/liste/detay yanitlarinda gövdeyi tarar ve
 *     intake baglantisini maskeler. Bu, DUZELTME ONCESI yazilmis kayitlari da kapsar.
 */

/** Maskelenmis baglanti gosterimi — kullanici "baglanti gonderildi" bilgisini KAYBETMEZ. */
export const INTAKE_URL_REDACTED = '[guvenli form baglantisi — token gizlendi]';

/**
 * Intake baglanti desenleri. `PUBLIC_INTAKE_BASE_URL` ortam degiskeni degisebilecegi icin
 * yol parcasi (`/intake/<token>`) esas alinir; token en az 16 karakter base64url'dur.
 */
const INTAKE_URL_PATTERNS: readonly RegExp[] = [
  // Tam URL: https://host/intake/<token>
  /https?:\/\/[^\s<>"']*\/intake\/[A-Za-z0-9_-]{16,}/g,
  // Yolla baslayan gosterim (base bos oldugunda `/intake/<token>` uretilir)
  /(?:^|[\s<>"'(])\/intake\/[A-Za-z0-9_-]{16,}/g,
];

/** Metindeki intake baglantilarini maskeler. Metin degilse oldugu gibi doner. */
export function redactIntakeTokens<T>(value: T): T {
  if (typeof value !== 'string') return value;
  let out: string = value;
  for (const pattern of INTAKE_URL_PATTERNS) {
    out = out.replace(pattern, (match) => {
      const lead = /^[\s<>"'(]/.test(match) ? match[0] : '';
      return `${lead}${INTAKE_URL_REDACTED}`;
    });
  }
  return out as unknown as T;
}

/** Bir talep kaydinin (veya listesinin) metin alanlarini redakte ederek doner. */
export function redactInfoRequestRecord<T extends { emailBody?: unknown; emailSubject?: unknown } | null>(
  record: T,
): T {
  if (!record || typeof record !== 'object') return record;
  const next: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  if (typeof next.emailBody === 'string') next.emailBody = redactIntakeTokens(next.emailBody);
  if (typeof next.emailSubject === 'string') next.emailSubject = redactIntakeTokens(next.emailSubject);
  return next as T;
}

/** Liste yollari icin. */
export function redactInfoRequestRecords<T extends { emailBody?: unknown; emailSubject?: unknown }>(
  records: readonly T[],
): T[] {
  return records.map((r) => redactInfoRequestRecord(r));
}
