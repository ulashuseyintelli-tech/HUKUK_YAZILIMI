/**
 * Yeni Takip wizard — lookup UX yardımcıları (SAF, test edilebilir). page.tsx import eder.
 * PR-D (frontend hardening): boş/yüklenememiş lookup durumunu sessiz "Seçiniz" yerine
 * açık sistem-konfigürasyon mesajına çevirir. Backend/davranış değişmez (additive).
 */

/**
 * Sınıflandırma'da lookup uyarı banner'ı gösterilsin mi?
 * Yalnız iki durumda: (a) /lookups fetch başarısız, (b) takipTuru dizisi boş.
 * NOT: tek bir kod (find) miss'i banner TETİKLEMEZ — o farklı bir arızadır (D3: console.warn).
 */
export function shouldShowLookupBanner(lookupsLoadFailed: boolean, takipTuruCount: number): boolean {
  return lookupsLoadFailed || takipTuruCount === 0;
}

/** Banner mesajı: yükleme hatası (sunucu/bağlantı) vs boş veri (yapılandırılmamış) ayrımı. */
export function lookupBannerMessage(lookupsLoadFailed: boolean): string {
  return lookupsLoadFailed
    ? "Tanım listeleri yüklenemedi (sunucu/bağlantı sorunu). Lütfen sayfayı yenileyin; sorun sürerse sistem yöneticisine bildirin."
    : "Takip türü tanımları bu firma için yapılandırılmamış. Dosya oluşturabilmek için sistem yöneticisinin tanım (lookup) kurulumunu yapması gerekir.";
}
