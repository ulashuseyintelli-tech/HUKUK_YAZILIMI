/**
 * CLIENT-OWN-13-I02-R3 (owner D01/D02, RATIFIED) — SeedModule deployment-seviyesi runtime
 * closure kararı. Kasıtlı olarak SIFIR başka import taşır: `app.module.ts` bu dosyayı
 * import ettiğinde tüm modül grafiğini (CaseModule → ocr.service.ts → `pdf-poppler`)
 * TETİKLEMEMESİ gerekir — `pdf-poppler` Linux CI'da require-time'da `process.exit(1)`
 * çağırıp jest worker'ını öldürür (Windows'ta görünmez). Bu fonksiyonu test etmek için
 * `app.module.ts`'in tamamını import etmek CI'da TÜM manifest'i düşürür; bu yüzden saf
 * mantık ayrı bir dosyada yaşar.
 *
 *  D01 — production'da KOŞULSUZ kapalı (flag'in değeri ÖNEMSİZ).
 *  D02 — test ortamında otomatik açık; diğer ortamlarda yalnız explicit flag ile açık,
 *        varsayılan kapalı.
 */
export function isSeedModuleEnabled(): boolean {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production") return false;
  if (nodeEnv === "test") return true;
  return process.env.CLIENT_SEED_ENDPOINTS_ENABLED?.toLowerCase() === "true";
}
