/**
 * ALC-AUTH-6: Hesap Özeti Component Coverage Analyzer.
 *
 * SAF fonksiyon kütüphanesi — DB/HTTP/DI YOK. `buildComponentCoverageReport()`,
 * legacy hesap özeti objesini (case.service.ts#getCalculationSummary çıktısı)
 * ve canonical balance display objesini (case-balance-display.ts#toCaseBalanceDisplay
 * çıktısı) girdi olarak alır, 15+ bileşenin kapsama durumunu üretir.
 *
 * KIRMIZI ÇİZGİ: legacyValue === canonicalValue eşleşmesi TEK BAŞINA "doğrulandı"
 * anlamına gelmez. Her bileşenin coverageStatus'u legacy/canonical'ın NASIL
 * üretildiğine (source) bakılarak atanır; yalnız sayısal eşleşmeye bakılmaz.
 * Bu ilke özellikle STUB (legacy=0) + canonical de yanlış/eksikse görünüşte
 * "eşleşen" ama ikisi de hatalı olan senaryoları CANONICAL_COVERED gibi
 * yanlışlıkla "güvenli" göstermemek için testte (FALSE-NEGATIVE GUARD) ayrıca
 * kanıtlanır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - __tests__/component-coverage.analyzer.spec.ts → golden-file doğrulama
 * (Bu modül henüz hiçbir controller/servisten çağrılmıyor; DI'ye bağlı değil.)
 * </remarks>
 */

import {
  CalculationSummaryLegacyShape,
  CanonicalBalanceDisplayShape,
  ComponentCoverageReport,
  ComponentCoverageRisk,
  ComponentCoverageRow,
  ComponentCoverageStatus,
  GroundTruthFixture,
  HesapOzetiComponentId,
  SCENARIO_ARRAY,
} from './component-coverage.types';

const ALL_STATUSES: ComponentCoverageStatus[] = [
  'CANONICAL_COVERED',
  'STATUTORY_FORMULA_COVERED',
  'MANUAL_ENTRY_COVERED',
  'LEGACY_ONLY',
  'STUB',
  'HARDCODED_CONSTANT',
  'AGGREGATE_ONLY',
  'MISSING',
  'UNVERIFIED',
];

/** Tek bir currency grubunu (varsa) toplu şekilde temsil eden yardımcı toplayıcı. */
function sumCanonicalCurrencyField(
  canonical: CanonicalBalanceDisplayShape,
  field: 'interest' | 'claimRemaining' | 'collected',
): number {
  return canonical.currencies.reduce((sum, c) => sum + (c[field] ?? 0), 0);
}

/**
 * ALC-AUTH-6 adversarial-verify bulgusu: canonicalValue===0 tek başına "motor hiç
 * çalışmadı/yanlış" ile "motor gerçekten sıfır faiz üretti" ayrımını yapamaz. Bu
 * belirsiz durumda CANONICAL_COVERED yerine UNVERIFIED döner — owner ilkesi
 * "0 = gerçek sıfır, STUB = bilerek 0, UNVERIFIED = doğrulanmadı" bunların
 * birbirine karıştırılmamasını gerektirir. canonicalValue!==0 ise motorun
 * gerçekten çalıştığına dair bağımsız kanıt vardır (legacy STUB=0 iken canonical
 * farklı/dolu bir değer üretmiştir) → CANONICAL_COVERED kalır.
 */
function interestCoverageStatus(canonicalValue: number): ComponentCoverageStatus {
  return canonicalValue === 0 ? 'UNVERIFIED' : 'CANONICAL_COVERED';
}

/**
 * Bir satırı oluşturan iç yardımcı — ground-truth varsa değerini/kaynağını,
 * yoksa NOT_PROVIDED'ı satıra işler.
 */
function withGroundTruth(
  component: HesapOzetiComponentId,
  groundTruth: GroundTruthFixture | undefined,
): Pick<ComponentCoverageRow, 'groundTruthValue' | 'groundTruthSource'> {
  const entry = groundTruth?.[component];
  if (!entry) {
    return { groundTruthValue: null, groundTruthSource: 'NOT_PROVIDED' };
  }
  return { groundTruthValue: entry.value, groundTruthSource: entry.source };
}

/**
 * ALC-AUTH-6 çekirdek mantığı: legacy + canonical objelerinden 15+ bileşenlik
 * kapsama raporu üretir. Saf fonksiyon; yan etkisi yoktur.
 */
export function buildComponentCoverageReport(
  caseId: string,
  legacySummary: CalculationSummaryLegacyShape,
  canonicalBalance: CanonicalBalanceDisplayShape,
  groundTruth?: GroundTruthFixture,
): ComponentCoverageReport {
  const canonicalInterest = sumCanonicalCurrencyField(canonicalBalance, 'interest');
  const canonicalClaimRemaining = sumCanonicalCurrencyField(canonicalBalance, 'claimRemaining');
  const canonicalCollected = sumCanonicalCurrencyField(canonicalBalance, 'collected');

  const rows: ComponentCoverageRow[] = [];

  const push = (row: ComponentCoverageRow) => rows.push(row);

  // 1. ASIL_ALACAK — legacy: dues toplamı/principalAmount (case.service.ts:3850-3852, gerçek formül).
  //    canonical: ayrı bir "asıl alacak" alanı yok ama claimRemaining/interest gerçek motor
  //    çıktısı olduğundan bileşen dolaylı olarak canonical motora bağlı kabul edilir.
  push({
    component: 'ASIL_ALACAK',
    label: 'Asıl Alacak',
    legacyValue: legacySummary.asilAlacak,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('ASIL_ALACAK', groundTruth),
    coverageStatus: 'LEGACY_ONLY',
    risk: 'MEDIUM',
    notes:
      'case.service.ts:3850-3852 dues/principalAmount toplamı ile gerçek formülle hesaplanıyor; ' +
      'canonical CaseBalanceDisplay içinde ayrı bir "asıl alacak" alanı YOK (yalnız claimRemaining/interest var, farklı taban).',
  });

  // 2. TAKIP_ONCESI_FAIZ — legacy: STUB_ZERO (case.service.ts:3860, TODO yorumu).
  //    canonical: currencies[].interest = CalculationResult.totalInterest, gerçek motor çıktısı.
  //    TERS ASİMETRİ: legacy STUB (0) iken canonical gerçek değer üretiyor.
  push({
    component: 'TAKIP_ONCESI_FAIZ',
    label: 'Takip Öncesi Faiz',
    legacyValue: legacySummary.takipOncesiFaiz,
    legacySource: 'STUB_ZERO',
    canonicalValue: canonicalInterest,
    canonicalSource: 'TBK100_ENGINE',
    ...withGroundTruth('TAKIP_ONCESI_FAIZ', groundTruth),
    coverageStatus: interestCoverageStatus(canonicalInterest),
    risk: 'HIGH',
    notes:
      'case.service.ts:3858-3861 "TODO: interest-engine entegrasyonu" ile takipOncesiFaiz=0 SABİT döner (STUB). ' +
      'Canonical tarafta case-balance-display.ts:474 interest=totalInterest gerçek TBK100 motor çıktısıdır. ' +
      'TERS ASİMETRİ: legacy=STUB, canonical=gerçek — canonicalValue!==0 ise CANONICAL_COVERED. ' +
      'canonicalValue===0 ise motorun gerçekten sıfır faiz mi ürettiği yoksa motorun de çalışmadığı mı ' +
      'bilinemez → UNVERIFIED döner, körü körüne CANONICAL_COVERED denmez.',
  });

  // 3. TAKIP_TUTARI — legacy: asilAlacak+tazminat+komisyon+takipOncesiFaiz (case.service.ts:3870).
  //    canonical: eşdeğer bir ara-toplam alanı yok (farklı taban: totalDebtAmount gross principal+interest+costs+ancillaries).
  push({
    component: 'TAKIP_TUTARI',
    label: 'Takip Tutarı',
    legacyValue: legacySummary.takipTutari,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('TAKIP_TUTARI', groundTruth),
    coverageStatus: 'LEGACY_ONLY',
    risk: 'MEDIUM',
    notes:
      'case.service.ts:3870 ara-toplam (asıl alacak+tazminat+komisyon+takip öncesi faiz). ' +
      'Canonical totals.totalDebtAmount farklı taban kullanır (gross principal+interest+costs+ancillaries); doğrudan eşdeğer değil.',
  });

  // 4. BASVURMA_HARCI — legacy: HARDCODED_CONSTANT 738.50 (case.service.ts:3874). canonical: yok.
  push({
    component: 'BASVURMA_HARCI',
    label: 'Başvurma Harcı',
    legacyValue: legacySummary.basvurmaHarci,
    legacySource: 'HARDCODED_CONSTANT',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('BASVURMA_HARCI', groundTruth),
    coverageStatus: 'MISSING',
    risk: 'HIGH',
    notes:
      'case.service.ts:3874 sabit 738.50 (docstring "fee-engine" der ama koda bağlı değil). ' +
      'Canonical CaseBalanceDisplay içinde kalem bazlı harç satırı YOK (yalnız case-level costs toplamı var).',
  });

  // 5. VEKALET_HARCI — legacy: HARDCODED_CONSTANT 105.00 (case.service.ts:3875). canonical: yok.
  push({
    component: 'VEKALET_HARCI',
    label: 'Vekalet Harcı',
    legacyValue: legacySummary.vekaletHarci,
    legacySource: 'HARDCODED_CONSTANT',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('VEKALET_HARCI', groundTruth),
    coverageStatus: 'MISSING',
    risk: 'HIGH',
    notes: 'case.service.ts:3875 sabit 105.00. Canonical tarafta karşılık gelen kalem yok.',
  });

  // 6. PESIN_HARC — legacy: statüter formül max(round(takipTutari*0.005,2),120) (case.service.ts:3876).
  //    canonical: yok. Rapor perspektifi canonical eksikliğine odaklanır (MISSING), legacy'nin
  //    kendisi statüter formül olduğu notes'ta belirtilir.
  push({
    component: 'PESIN_HARC',
    label: 'Peşin Harç',
    legacyValue: legacySummary.pesinHarc,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('PESIN_HARC', groundTruth),
    coverageStatus: 'MISSING',
    risk: 'HIGH',
    notes:
      'case.service.ts:3876 max(round(takipTutari*0.005,2),120) — gerçek statüter formül (STATUTORY_FORMULA, sabit DEĞİL) ' +
      'legacy tarafta var, ama canonical CaseBalanceDisplay içinde karşılığı YOK → rapor perspektifinde MISSING.',
  });

  // 7. DOSYA_GIDERI — legacy: HARDCODED_CONSTANT 50.00 (case.service.ts:3877). canonical: yok.
  push({
    component: 'DOSYA_GIDERI',
    label: 'Dosya Gideri',
    legacyValue: legacySummary.dosyaGideri,
    legacySource: 'HARDCODED_CONSTANT',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('DOSYA_GIDERI', groundTruth),
    coverageStatus: 'MISSING',
    risk: 'MEDIUM',
    notes: 'case.service.ts:3877 sabit 50.00. Canonical tarafta karşılık gelen kalem yok.',
  });

  // 8. TEBLIGAT_GIDERI — legacy: HARDCODED_CONSTANT 252*debtorCount (case.service.ts:3878).
  //    canonical: costs/ancillaries toplu (case-level), kalem bazlı yok → AGGREGATE_ONLY.
  push({
    component: 'TEBLIGAT_GIDERI',
    label: 'Tebligat Gideri',
    legacyValue: legacySummary.tebligatGideri,
    legacySource: 'HARDCODED_CONSTANT',
    canonicalValue: canonicalBalance.costs,
    canonicalSource: 'AGGREGATE_DERIVED',
    ...withGroundTruth('TEBLIGAT_GIDERI', groundTruth),
    coverageStatus: 'AGGREGATE_ONLY',
    risk: 'MEDIUM',
    notes:
      'case.service.ts:3878 sabit 252.00*debtorCount. Canonical case-balance-display.ts:483 costs ' +
      '(Σ projections.costs) yalnız CASE-level toplu değer; AncillaryType.TEBLIGAT_MASRAFI enum olarak var ' +
      'ama kalem bazlı satır üretilmiyor.',
  });

  // 9. VEKALET_PULU — legacy: HARDCODED_CONSTANT 165.60 (case.service.ts:3879). canonical: yok.
  push({
    component: 'VEKALET_PULU',
    label: 'Vekalet Pulu',
    legacyValue: legacySummary.vekaletPulu,
    legacySource: 'HARDCODED_CONSTANT',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('VEKALET_PULU', groundTruth),
    coverageStatus: 'MISSING',
    risk: 'LOW',
    notes: 'case.service.ts:3879 sabit 165.60. Canonical tarafta karşılık gelen kalem yok.',
  });

  // 10. ICRA_MASRAFLARI_AGGREGATE — legacy: yukarıdaki sabitlerin toplamı (case.service.ts:3880).
  //     canonical: costs (case-level toplu) → AGGREGATE_ONLY.
  push({
    component: 'ICRA_MASRAFLARI_AGGREGATE',
    label: 'İcra Masrafları (Toplam)',
    legacyValue: legacySummary.icraMasraflari,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: canonicalBalance.costs,
    canonicalSource: 'AGGREGATE_DERIVED',
    ...withGroundTruth('ICRA_MASRAFLARI_AGGREGATE', groundTruth),
    coverageStatus: 'AGGREGATE_ONLY',
    risk: 'MEDIUM',
    notes:
      'case.service.ts:3880 sabitlerin toplamı. Canonical case-balance-display.ts:483 costs case-level ' +
      'toplu bir değer üretir; kalem kırılımı olmadan doğrudan bire bir karşılaştırma güvenilir değildir.',
  });

  // 11. TAHSIL_HARCI_PESIN_DAHIL — legacy: statüter formül %4.55 (case.service.ts:3883). canonical: yok.
  push({
    component: 'TAHSIL_HARCI_PESIN_DAHIL',
    label: 'Tahsil Harcı (Peşin Dahil)',
    legacyValue: legacySummary.pesinHarcDahilTahsilHarci,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('TAHSIL_HARCI_PESIN_DAHIL', groundTruth),
    coverageStatus: 'MISSING',
    risk: 'HIGH',
    notes:
      'case.service.ts:3883 (takipTutari+icraMasraflari)*0.0455 — statüter tahsil harcı oranı formülü. ' +
      'Canonical CaseBalanceDisplay içinde tahsil harcı kavramı hiç YOK.',
  });

  // 12. TAHSIL_HARCI_PESIN_HARIC — legacy: statüter formül (case.service.ts:3884). canonical: yok.
  push({
    component: 'TAHSIL_HARCI_PESIN_HARIC',
    label: 'Tahsil Harcı (Peşin Hariç)',
    legacyValue: legacySummary.pesinHarcHaricTahsilHarci,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('TAHSIL_HARCI_PESIN_HARIC', groundTruth),
    coverageStatus: 'MISSING',
    risk: 'HIGH',
    notes:
      'case.service.ts:3884 (takipTutari+icraMasraflari-pesinHarc)*0.0455. Canonical tarafta karşılığı YOK.',
  });

  // 13. TAHSIL_ORANI_SENARYOLARI — legacy: statüter oran tablosu, dizi (case.service.ts:3910-3919). canonical: yok.
  push({
    component: 'TAHSIL_ORANI_SENARYOLARI',
    label: 'Tahsil Oranı Senaryoları',
    legacyValue: SCENARIO_ARRAY,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('TAHSIL_ORANI_SENARYOLARI', groundTruth),
    coverageStatus: 'MISSING',
    risk: 'HIGH',
    notes:
      `case.service.ts:3910-3919, 5 satırlık statüter oran tablosu (0/%2,27/%4,55/%9,10/%11,38); ` +
      `legacy dizi uzunluğu=${legacySummary.tahsilOranlari?.length ?? 0}. Canonical tarafta bu senaryo tablosu hiç YOK.`,
  });

  // 14. VEKALET_UCRETI — legacy: @deprecated calculateAttorneyFee (case.service.ts:3889).
  //     canonical: ancillaries içinde attorneyFee alt-kalemi var ama case-level toplu ancillaries döner (kalem ayrımı display katmanında var, ama bu analiz canonical top-level ancillaries'i baz alır).
  push({
    component: 'VEKALET_UCRETI',
    label: 'Vekalet Ücreti',
    legacyValue: legacySummary.vekaletUcreti,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: canonicalBalance.ancillaries,
    canonicalSource: 'AGGREGATE_DERIVED',
    ...withGroundTruth('VEKALET_UCRETI', groundTruth),
    coverageStatus: 'AGGREGATE_ONLY',
    risk: 'MEDIUM',
    notes:
      'case.service.ts:3889 @deprecated calculateAttorneyFee() (fallback 9000). Canonical case-balance-display.ts:485 ' +
      'attorneyFee=ancillaries[VEKALET_UCRETI] bucket düzeyinde ayrıştırılabiliyor ama bu rapor top-level ' +
      'CaseBalanceDisplay.ancillaries (case-level toplu, VEKALET_UCRETI+diğer fer\'iler karışık) alanını baz alır.',
  });

  // 15. TAKIP_SONRASI_FAIZ — legacy: STUB_ZERO (case.service.ts:3861).
  //     canonical: totalInterest pre/post ayrımı yapmıyor (aynı interest alanı) → kısmi/ters asimetri.
  push({
    component: 'TAKIP_SONRASI_FAIZ',
    label: 'Takip Sonrası Faiz',
    legacyValue: legacySummary.takipSonrasiFaiz,
    legacySource: 'STUB_ZERO',
    canonicalValue: canonicalInterest,
    canonicalSource: 'TBK100_ENGINE',
    ...withGroundTruth('TAKIP_SONRASI_FAIZ', groundTruth),
    coverageStatus: interestCoverageStatus(canonicalInterest),
    risk: 'HIGH',
    notes:
      'case.service.ts:3861 takipSonrasiFaiz=0 SABİT (STUB). Canonical totalInterest tek bir brüt faiz alanıdır, ' +
      'takip öncesi/sonrası AYRIMI yapmaz (case-balance-display.ts:474 yorumu). Bu satırda canonicalValue ' +
      'TAKIP_ONCESI_FAIZ ile AYNI toplam faiz alanına işaret eder — pre/post kırılımı canonical tarafta henüz YOK, ' +
      'bu kısmi bir kapsama olduğu için notes\'ta ayrıca belirtilir (TERS ASİMETRİ + KISMİ KAPSAMA). ' +
      'canonicalValue===0 durumunda motorun gerçekten çalışıp çalışmadığı bilinemeyeceğinden UNVERIFIED döner.',
  });

  // 16. TOPLAM_TAHSILAT — legacy: collections toplamı (case.service.ts:3895-3901, DUE_DERIVED).
  //     canonical: collected (allocations dedup toplamı) → gerçek motor çıktısı.
  push({
    component: 'TOPLAM_TAHSILAT',
    label: 'Toplam Tahsilat',
    legacyValue: legacySummary.toplamTahsilat,
    legacySource: 'DUE_DERIVED',
    canonicalValue: canonicalCollected,
    canonicalSource: 'AGGREGATE_DERIVED',
    ...withGroundTruth('TOPLAM_TAHSILAT', groundTruth),
    coverageStatus: 'CANONICAL_COVERED',
    risk: 'LOW',
    notes:
      'case.service.ts:3895-3901 aktif (CANCELLED olmayan) collections toplamı. Canonical collected ' +
      '(case-balance-display.ts:476/489) ödeme-bazında dedup edilmiş allocations toplamıdır; iki taraf da gerçek veri kaynağından türetiliyor.',
  });

  // 17. TOPLAM_BORC — legacy: takipTutari+icraMasraflari+vekaletUcreti+takipSonrasiFaiz (case.service.ts:3904).
  //     canonical: totals.totalDebtAmount (gross principal+interest+costs+ancillaries).
  push({
    component: 'TOPLAM_BORC',
    label: 'Toplam Borç',
    legacyValue: legacySummary.toplamBorc,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: canonicalBalance.totals.totalDebtAmount,
    canonicalSource: 'AGGREGATE_DERIVED',
    ...withGroundTruth('TOPLAM_BORC', groundTruth),
    coverageStatus: canonicalBalance.totals.totalDebtAmount == null ? 'MISSING' : 'CANONICAL_COVERED',
    risk: 'MEDIUM',
    notes:
      'case.service.ts:3904 legacy formülü. Canonical totals.totalDebtAmount (case-balance-display.ts:512) ' +
      'ayrı bir taban kullanır (gross principal+interest+costs+ancillaries) ve yalnız singleCurrency ise dolu; ' +
      'null ise (MULTI/UNKNOWN currency) MISSING sayılır.',
  });

  // 18. SON_BORC — legacy: toplamBorc+pesinHarcHaricTahsilHarci (case.service.ts:3905). canonical: eşdeğer alan yok.
  push({
    component: 'SON_BORC',
    label: 'Son Borç',
    legacyValue: legacySummary.sonBorc,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: null,
    canonicalSource: 'ABSENT',
    ...withGroundTruth('SON_BORC', groundTruth),
    coverageStatus: 'LEGACY_ONLY',
    risk: 'MEDIUM',
    notes:
      'case.service.ts:3905 toplamBorc+pesinHarcHaricTahsilHarci. Canonical tarafta tahsil harcı kavramı ' +
      'olmadığından eşdeğer bir "son borç" alanı yok (outstandingAmount farklı taban kullanır).',
  });

  // 19. KALAN_BORC — legacy: sonBorc-toplamTahsilat (case.service.ts:3906).
  //     canonical: totals.outstandingAmount (claimRemaining+costs+ancillaries) — taban farklı ama kavramsal karşılık var.
  push({
    component: 'KALAN_BORC',
    label: 'Kalan Borç',
    legacyValue: legacySummary.kalanBorc,
    legacySource: 'COMPUTED_FORMULA',
    canonicalValue: canonicalBalance.totals.outstandingAmount,
    canonicalSource: 'AGGREGATE_DERIVED',
    ...withGroundTruth('KALAN_BORC', groundTruth),
    coverageStatus: canonicalBalance.totals.outstandingAmount == null ? 'MISSING' : 'CANONICAL_COVERED',
    risk: 'MEDIUM',
    notes:
      'case.service.ts:3906 sonBorc-toplamTahsilat. Canonical totals.outstandingAmount ' +
      '(case-balance-display.ts:510, claimRemaining+costs+ancillaries) farklı taban kullanır (tahsil harcı hariç); ' +
      'sayısal eşleşme beklenmez, yalnız kavramsal "kalan borç" karşılığı olarak CANONICAL_COVERED işaretlenir.',
  });

  // Silinmemesi gereken invariant: 19 bileşen (tasarımdaki 15+ hedefini kod-seviyesinde aşıyor, kasıtlı).
  const countByStatus = ALL_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<ComponentCoverageStatus, number>);
  for (const row of rows) {
    countByStatus[row.coverageStatus] += 1;
  }

  const b1ReadinessBlocked = rows.some(
    (row) =>
      row.coverageStatus === 'MISSING' ||
      row.coverageStatus === 'UNVERIFIED' ||
      (row.coverageStatus === 'HARDCODED_CONSTANT' && row.risk === 'HIGH'),
  );

  return {
    caseId,
    rows,
    summary: {
      countByStatus,
      b1ReadinessBlocked,
    },
  };
}
