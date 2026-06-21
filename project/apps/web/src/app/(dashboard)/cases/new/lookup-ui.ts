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

/**
 * PR-2: Manuel form seçimi → kanonik takipTürü kodu eşlemesi.
 *
 * Amaç: "Manuel Takip Aç" ile (sihirbaza girmeden) bir form seçildiğinde, ikinci adımdaki
 * Sınıflandırma'nın BOŞ gelmesini önlemek. Dönen takipTürü kodu, page.tsx'te mevcut
 * handleTakipTuruChange'e verilerek mahiyet + borçlu tipi türetilir (kod tekrarı yok).
 *
 * Kodlar lookup-catalog.ts > TAKIP_TURU_CATALOG ile birebir hizalıdır (11 kanonik kod).
 * Form kataloğu: config/form-metadata.ts.
 *
 * Notlar:
 * - FORM_10 (Kambiyo) çek/senet ayrımını forma bakarak YAPAMAZ (form ikisini de kapsar);
 *   makul varsayılan KAMBIYO_SENET, kullanıcı 2. adımda çeke çevirebilir. Çek/senet'i kesin
 *   belirleyen yer KambiyoWizard'dır (sihirbaz yolu).
 * - FORM_5_NAFAKA alt-formu, ana form ILAMLI olsa da NAFAKA takip türüne incelir.
 * - Eşleşme yoksa null döner → page.tsx seed YAPMAZ (mevcut davranış korunur, kullanıcı seçer).
 *
 * Çağrıldığı yerler:
 * - cases/new/page.tsx > handleFormSelect() → manuel/skip form seçiminde sınıflandırma seed eder.
 */
export function formToTakipTuruCode(formCode: string, subFormCode?: string | null): string | null {
  // Alt-form özel kuralları (ana form eşlemesinden önce gelir)
  if (subFormCode === "FORM_5_NAFAKA") return "NAFAKA";
  // PR-3: Kambiyo (FORM_10) alt-kırılımı → çek/senet ayrımı. KambiyoWizard semantiğiyle birebir:
  // çek → KAMBIYO_CEK (mahiyet CEK, vade yok); bono/poliçe → KAMBIYO_SENET (mahiyet SENET, vade var).
  if (subFormCode === "FORM_10_CEK") return "KAMBIYO_CEK";
  if (subFormCode === "FORM_10_BONO" || subFormCode === "FORM_10_POLICE") return "KAMBIYO_SENET";

  const FORM_TO_TAKIP_TURU: Record<string, string> = {
    FORM_7: "ILAMSIZ_GENEL",       // İlamsız İcra Takibi
    FORM_2_3_4_5: "ILAMLI",        // İlamlı İcra Takibi
    FORM_10: "KAMBIYO_SENET",      // Kambiyo (senet varsayılan; çek ayrımı sihirbaz işi)
    FORM_12: "IFLAS_KAMBIYO",      // İflas Yoluyla Kambiyo Takibi
    FORM_6: "REHIN_TASINMAZ",      // İpotekli İlamlı (ipotek = taşınmaz rehni)
    FORM_9: "REHIN_TASINMAZ",      // İpotekli İlamsız
    FORM_8: "REHIN_TASINIR",       // Taşınır Rehni
    FORM_44: "REHIN_TASINIR",      // Taşınır Rehni İlamlı
    FORM_11: "IFLAS_ADI",          // İflas Adi Takip
    FORM_13: "ILAMSIZ_KIRA",       // Kira Alacağı Takibi
    FORM_14: "ILAMSIZ_TAHLIYE",    // Tahliye Takibi
  };

  return FORM_TO_TAKIP_TURU[formCode] ?? null;
}
