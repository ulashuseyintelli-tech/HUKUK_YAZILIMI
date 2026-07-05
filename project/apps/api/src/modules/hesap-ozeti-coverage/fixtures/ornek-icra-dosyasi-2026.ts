/**
 * ALC-AUTH-6: Örnek icra dosyası ground-truth fixture.
 *
 * Bu fixture, gerçekçi bir 2026 icra takibi senaryosu için legacy hesap özeti
 * girdisini, canonical balance display girdisini ve (kısmi) ground-truth
 * beklenen değerleri bir arada tutar. `__tests__/component-coverage.analyzer.spec.ts`
 * bu fixture'ı golden-file harness olarak kullanır.
 *
 * ⚠️ PLACEHOLDER UYARISI: BASVURMA_HARCI/VEKALET_HARCI/DOSYA_GIDERI/
 * TEBLIGAT_GIDERI/VEKALET_PULU rakamları legacy'deki sabitlerle AYNI çünkü
 * GO-ANALYZE bulgusu bunları kaynak gösterdi; resmi 2026 Harçlar Kanunu /
 * Avukatlık Asgari Ücret Tarifesi ile bağımsız teyidi bu görevin kapsamı
 * DIŞINDADIR. Owner/hukuk teyidi ayrı bir adım olarak yapılmalıdır.
 */

import {
  CalculationSummaryLegacyShape,
  CanonicalBalanceDisplayShape,
  GroundTruthFixture,
} from '../component-coverage.types';

/** Legacy hesap özeti — case.service.ts#getCalculationSummary() çıktı şekli, örnek dosya. */
export const LEGACY_SUMMARY_ORNEK_ICRA_2026: CalculationSummaryLegacyShape = {
  caseId: 'case-ornek-icra-2026',
  hesapTarihi: '2026-07-04',
  takipTarihi: '2026-01-15',
  kalemTuru: 'CEK',

  asilAlacak: 100000,
  tazminat: 10000, // asilAlacak*0.10 (çek tazminatı)
  komisyon: 300, // asilAlacak*0.003
  takipOncesiFaiz: 0, // STUB — case.service.ts:3860
  takipTutari: 110300, // asilAlacak+tazminat+komisyon+takipOncesiFaiz

  basvurmaHarci: 738.5,
  vekaletHarci: 105.0,
  pesinHarc: 551.5, // max(round(110300*0.005,2),120)
  dosyaGideri: 50.0,
  tebligatGideri: 252.0, // debtorCount=1
  vekaletPulu: 165.6,
  icraMasraflari: 738.5 + 105.0 + 551.5 + 50.0 + 252.0 + 165.6, // 1862.6

  pesinHarcDahilTahsilHarci: Math.round((110300 + 1862.6) * 0.0455 * 100) / 100,
  pesinHarcHaricTahsilHarci: Math.round((110300 + 1862.6 - 551.5) * 0.0455 * 100) / 100,

  vekaletUcreti: 9000,
  takipSonrasiFaiz: 0, // STUB — case.service.ts:3861

  toplamBorc: 110300 + 1862.6 + 9000 + 0,
  sonBorc: 110300 + 1862.6 + 9000 + 0 + Math.round((110300 + 1862.6 - 551.5) * 0.0455 * 100) / 100,
  toplamTahsilat: 20000,
  kalanBorc:
    110300 +
    1862.6 +
    9000 +
    0 +
    Math.round((110300 + 1862.6 - 551.5) * 0.0455 * 100) / 100 -
    20000,
  kalanAnapara: 100000,

  mahsupDetaylari: [],
  faizSegmentleri: { takipOncesi: [], takipSonrasi: [] },
  tahsilOranlari: [
    { oran: 0, label: '0', tutar: 121162.6 },
    { oran: 0.0227, label: '2,27', tutar: 123913.19 },
    { oran: 0.0455, label: '4,55', tutar: 126674.4 },
    { oran: 0.091, label: '9,10', tutar: 132188.19 },
    { oran: 0.1138, label: '11,38', tutar: 134950.6 },
  ],
};

/**
 * Canonical balance display — case-balance-display.ts#toCaseBalanceDisplay() çıktı şekli, örnek dosya.
 * Faiz motoru gerçek bir değer üretiyor (STUB DEĞİL): 3250.75 TRY. Bu, legacy'nin
 * STUB(0) davranışıyla TERS ASİMETRİ senaryosunu temsil eder.
 */
export const CANONICAL_BALANCE_ORNEK_ICRA_2026: CanonicalBalanceDisplayShape = {
  caseId: 'case-ornek-icra-2026',
  currency: 'TRY',
  costs: 1862.6, // case-level toplu masraf projeksiyonu
  ancillaries: 9000, // case-level toplu fer'i (vekalet ücreti dahil)
  currencies: [
    {
      currency: 'TRY',
      interest: 3250.75, // gerçek TBK100 motor çıktısı — legacy=0 (STUB) ile TERS ASİMETRİ
      claimRemaining: 103250.75, // totalDue (net, ödeme tahsisi sonrası)
      collected: 20000,
    },
  ],
  totals: {
    totalDebtAmount: 100000 + 3250.75 + 1862.6 + 9000, // grossPrincipal+interest+costs+ancillaries
    totalPaidAmount: 20000,
    outstandingAmount: 103250.75 + 1862.6 + 9000, // claimRemaining+costs+ancillaries
  },
};

/**
 * Ground-truth: yalnız statüter tarife kalemleri için (kısmi). Faiz/tahsil-harcı gibi
 * hesaplanan/motora bağlı alanlar için ground-truth burada VERİLMEZ (NOT_PROVIDED kalır).
 */
export const GROUND_TRUTH_ORNEK_ICRA_2026: GroundTruthFixture = {
  BASVURMA_HARCI: { value: 738.5, source: 'STATUTORY_TARIFE_TABLE' }, // 2026 Harçlar Kanunu tarifesi — PLACEHOLDER, ayrı teyit gerekir
  VEKALET_HARCI: { value: 105.0, source: 'STATUTORY_TARIFE_TABLE' }, // PLACEHOLDER
  DOSYA_GIDERI: { value: 50.0, source: 'STATUTORY_TARIFE_TABLE' }, // PLACEHOLDER — tarife kaleminin adı/kaynağı ayrıca teyit edilmeli
  VEKALET_PULU: { value: 165.6, source: 'STATUTORY_TARIFE_TABLE' }, // PLACEHOLDER
};

/**
 * FALSE-NEGATIVE GUARD senaryosu için ikinci, kasıtlı-bozuk bir fixture varyantı:
 * canonical taraf da (yanlışlıkla) 0 döndürüyor — yani legacyValue===canonicalValue
 * (ikisi de 0) ama ikisi de STUB/yanlış. Bu senaryo TAKIP_ONCESI_FAIZ bileşeninin
 * coverageStatus'unun yalnızca sayısal eşleşmeye bakarak CANONICAL_COVERED
 * ÜRETMEMESİ gerektiğini kanıtlamak için testte kullanılır (bkz. analyzer'daki
 * source-bazlı mantık: canonicalSource=TBK100_ENGINE olsa bile burada legacy=canonical=0
 * durumunu simüle etmek için canonical.currencies[].interest kasıtlı 0'a çekilir).
 */
export const CANONICAL_BALANCE_FALSE_NEGATIVE_VARIANT: CanonicalBalanceDisplayShape = {
  ...CANONICAL_BALANCE_ORNEK_ICRA_2026,
  currencies: [
    {
      currency: 'TRY',
      interest: 0, // kasıtlı: canonical da STUB gibi 0 dönüyor (motor hatası/eksik veri simülasyonu)
      claimRemaining: 100000,
      collected: 20000,
    },
  ],
  totals: {
    ...CANONICAL_BALANCE_ORNEK_ICRA_2026.totals,
    totalDebtAmount: 100000 + 0 + 1862.6 + 9000,
    outstandingAmount: 100000 + 1862.6 + 9000,
  },
};
