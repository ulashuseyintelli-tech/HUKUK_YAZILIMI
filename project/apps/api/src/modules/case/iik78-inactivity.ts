/**
 * F03-D2 (J-25 / OFP-19b; owner kararı K6-b, 25.11.2026) — dosya pasiflik göstergesinin süresi.
 *
 * Hesap YASAL süreyle yapılır (1 yıl; kodda gün olarak 365) ve büro ayarıyla DEĞİŞMEZ. `Office.inactivityThresholdDays` /
 * `Office.inactivityWarningDays` alanları yalnız SAKLANIR (GET / PUT /office/iik78-settings); hiçbir hesapta tüketilmez.
 * Ayarı hesaba bağlamak yeni bir hukuki süre kuralı türetmek olur ve ayrı owner kararı ister
 * (bkz. office/__tests__/iik78-setting-stored-only.f03d2.spec.ts).
 */
export const IIK78_STATUTORY_INACTIVITY_DAYS = 365;
