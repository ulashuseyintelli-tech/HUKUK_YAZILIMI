/**
 * F03-D2 (J-25 / OFP-19b; owner kararı K6-b, 25.11.2026) — dosya pasiflik göstergesinin süresi (ekran).
 *
 * Hesap YASAL süreyle yapılır (1 yıl; gün olarak 365) ve büro ayarıyla DEĞİŞMEZ. Büronun İİK-78 ayarı
 * (`inactivityThresholdDays` / `inactivityWarningDays`) yalnız SAKLANIR; ekranda hiçbir hesapta tüketilmez ve bugün bir ayar
 * ekranı da yoktur. Ayarı hesaba bağlamak yeni owner kararı ister.
 */
export const IIK78_STATUTORY_INACTIVITY_DAYS = 365;
