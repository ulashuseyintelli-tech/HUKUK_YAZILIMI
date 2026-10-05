/**
 * Takip türü kodu → masraf profili (takip türü) eşlemesi — TEK KAYNAK.
 *
 * Ölçülen kusur (main 63dc6618 / fdc1f23b, gerçek tarayıcı + derlenmiş denetleyici): sihirbazın alacak kalemi formu
 * `POST /fee-engine/preview`e takip türü yerine KALEM TÜRÜNÜ (`ASIL_ALACAK`, `FATURA`, `CEK`, …) `caseType` diye
 * yolluyordu; masraf profilleri (`config/fee-profiles.yaml` → `applies_to_case_types`) ise `ILAMSIZ`, `KIRA`, `TAHLIYE`,
 * `KAMBIYO`, `ILAMLI`, `REHIN`, `IFLAS` ile eşleşir. Eşleşmeyen her kod sessizce "harç yok" (0) üretiyordu. Lookup
 * kataloğundaki 11 takip türü kodunun HİÇBİRİ profil kodu değildi: kodu doğru taşımak tek başına yetmez, eşleme gerekir.
 *
 * Bu dosya YENİ KURAL TANIMLAMAZ: katalogdaki ad ile profildeki ad aynı takip türünü anlatır (ILAMSIZ_KIRA → KIRA gibi).
 * Profilin kendisi (kalemler, tutarlar, oranlar) `fee-profiles.yaml` + tarife dosyasındadır; burada DEĞİŞMEDİ.
 *
 * Profili OLMAYAN takip türü (`NAFAKA`) AÇIKÇA işaretlenir: sessiz 0 değil, "hesaplanamadı". Bu takip türünün masraf
 * profili ürün / hukuk kararıdır; bu dosya bir profil SEÇMEZ.
 *
 * Katalogla uyum `__tests__/fee-case-type.spec.ts` ile kilitlidir: katalogdaki her takip türü kodu tam olarak bu iki
 * listeden birinde bulunmak ZORUNDADIR (yeni takip türü eklenip masraf eşlemesi unutulursa test düşer).
 *
 * Cagrildigi yerler:
 * - FeeEngineService.resolveFeeCaseType() -> FeeEngineService.previewCalculation() -> POST /fee-engine/preview
 */

/** Takip türü kodu (`TAKIP_TURU_CATALOG`) → masraf profilinin `applies_to_case_types` değeri. */
export const FEE_PROFILE_CASE_TYPE_BY_TAKIP_TURU: Readonly<Record<string, string>> = {
  ILAMSIZ_GENEL: 'ILAMSIZ',
  ILAMSIZ_KIRA: 'KIRA',
  ILAMSIZ_TAHLIYE: 'TAHLIYE',
  ILAMLI: 'ILAMLI',
  KAMBIYO_CEK: 'KAMBIYO',
  KAMBIYO_SENET: 'KAMBIYO',
  REHIN_TASINIR: 'REHIN',
  REHIN_TASINMAZ: 'REHIN',
  IFLAS_ADI: 'IFLAS',
  IFLAS_KAMBIYO: 'IFLAS',
};

/** Katalogda var, masraf profili YOK (ürün kararı bekliyor): masraf "hesaplanamadı" döner, 0 DEĞİL. */
export const TAKIP_TURU_CODES_WITHOUT_FEE_PROFILE: readonly string[] = ['NAFAKA'];
