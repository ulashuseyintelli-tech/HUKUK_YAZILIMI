/**
 * Takip türü kodu → masraf profili (takip türü) eşlemesi — TEK KAYNAK.
 *
 * Ölçülen kusur (main 63dc6618 / fdc1f23b, gerçek tarayıcı + derlenmiş denetleyici): sihirbazın alacak kalemi formu
 * `POST /fee-engine/preview`e takip türü yerine KALEM TÜRÜNÜ (`ASIL_ALACAK`, `FATURA`, `CEK`, …) `caseType` diye
 * yolluyordu; masraf profilleri (`config/fee-profiles.yaml` → `applies_to_case_types`) ise `ILAMSIZ`, `KIRA`, `TAHLIYE`,
 * `KAMBIYO`, `ILAMLI`, `REHIN`, `IFLAS` ile eşleşir. Eşleşmeyen her kod sessizce "harç yok" (0) üretiyordu. Lookup
 * kataloğundaki 11 takip türü kodunun HİÇBİRİ profil kodu değildi: kodu doğru taşımak tek başına yetmez, eşleme gerekir.
 *
 * DİKKAT — bu eşleme bir SEÇİMDİR: tabanda takip türü kodundan masraf profiline giden hiçbir eşleme YOKTU (önizleme gelen `caseType`'ı
 * olduğu gibi motora veriyordu). Aşağıdaki 10 eşleme ad / mahiyet eşleştirmesidir; profilin kendisi (kalemler, tutarlar, oranlar,
 * "ilamlıda / rehinde / iflasta peşin harç yok" dahil) `fee-profiles.yaml` + tarife dosyasındadır ve DEĞİŞMEDİ. Eşlemenin sonucu
 * görünür: tahliye / ilamlı / rehin / iflasta peşin harç 0 yazılır (masraf yapılandırmasına göre), dosya hesap özeti ise bu
 * türlerde de binde 5 yazar — hangisinin hukuken doğru olduğu KARAR MADDESİ'ndedir (satır 14, ikinci hukuki soru).
 *
 * Dayanak (kod → profil): [A] = katalogdaki takip türü adı profil adıyla aynı; [M] = katalogda AYNI ADLI mahiyet kodu da var
 * (`lookup-catalog.ts` `TAKIP_TURU_DEFAULTS`: KIRA, TAHLIYE, CEK, SENET, REHIN); [Ö] = yalnız ad öneki (başka dayanak bulunamadı).
 *   ILAMSIZ_GENEL → ILAMSIZ [A; mahiyet PARA]  ILAMSIZ_KIRA → KIRA [A, M: KIRA]       ILAMSIZ_TAHLIYE → TAHLIYE [A, M: TAHLIYE]
 *   ILAMLI → ILAMLI [A; mahiyet TAZMINAT]      KAMBIYO_CEK / KAMBIYO_SENET → KAMBIYO [A, M: CEK / SENET]
 *   REHIN_TASINIR → REHIN [A, M: REHIN]       REHIN_TASINMAZ → REHIN [Ö; mahiyet IPOTEK]
 *   IFLAS_ADI → IFLAS [Ö]                     IFLAS_KAMBIYO → IFLAS [Ö; kambiyo profili DEĞİL, iflas profili]
 * Tabanda form tahliyeyi kalem türü KIRA ile yolluyordu (KIRA profiline düşüyordu: peşin harç dahil); bu eşleme tahliyeyi
 * TAHLIYE profiline bağlar (peşin harçsız): 10.000 TL'de toplam 1.381,10 → 1.311,10 düşer.
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
