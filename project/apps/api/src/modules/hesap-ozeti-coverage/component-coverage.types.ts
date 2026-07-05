/**
 * ALC-AUTH-6: Hesap Özeti Component Coverage — tip tanımları.
 *
 * Bu modül SAF bir TS kütüphanesidir. NestJS DI'ye bağlı DEĞİLDİR
 * (@Injectable/@Module yok), hiçbir mevcut dosyayı değiştirmez.
 *
 * Amaç: `case.service.ts#getCalculationSummary()` (legacy hesap özeti) ile
 * `case-balance-display.ts#toCaseBalanceDisplay()` (canonical interest-engine
 * çıktısı) arasındaki 15+ bileşen bazlı kapsama/tutarlılık durumunu tek bir
 * raporda toplamak — B1 readiness (canonical'a geçiş) öncesi hangi kalemlerin
 * hâlâ STUB/HARDCODED/MISSING olduğunu somutlaştırmak.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - component-coverage.analyzer.ts → buildComponentCoverageReport() dönüş tipi
 * - __tests__/component-coverage.analyzer.spec.ts → golden-file doğrulama
 * </remarks>
 */

/**
 * Bir bileşenin legacy/canonical/ground-truth üçlüsü karşısındaki kapsama durumu.
 *
 * - CANONICAL_COVERED: canonical taraf gerçek bir motor çıktısı üretiyor VE
 *   legacy STUB/eksik olsa bile canonical güvenilir kabul edilebilir.
 * - STATUTORY_FORMULA_COVERED: legacy tarafta gerçek bir statüter formülle
 *   hesaplanıyor (sabit DEĞİL), ama canonical karşılığı YOK.
 * - MANUAL_ENTRY_COVERED: değer elle girilen/onaylı bir kaynaktan geliyor.
 * - LEGACY_ONLY: yalnız legacy'de var, canonical'da eşdeğer bir alan/taban yok
 *   (ör. farklı taban nedeniyle karşılaştırılamaz).
 * - STUB: legacy tarafı sabit/placeholder (ör. 0 döner, TODO yorumu var).
 * - HARDCODED_CONSTANT: legacy tarafı sabit bir sayı (statüter olsa da motor
 *   bağlı değil, elle yazılmış sabit).
 * - AGGREGATE_ONLY: canonical yalnız toplu/case-level bir değer üretiyor,
 *   kalem bazlı kırılım yok.
 * - MISSING: canonical tarafta bu bileşene karşılık gelen HİÇBİR alan yok.
 * - UNVERIFIED: coverage durumu bu analizör ile netleştirilemedi (fallback).
 */
export type ComponentCoverageStatus =
  | 'CANONICAL_COVERED'
  | 'STATUTORY_FORMULA_COVERED'
  | 'MANUAL_ENTRY_COVERED'
  | 'LEGACY_ONLY'
  | 'STUB'
  | 'HARDCODED_CONSTANT'
  | 'AGGREGATE_ONLY'
  | 'MISSING'
  | 'UNVERIFIED';

/** Hesap özetindeki 15+ bileşenin kanonik kimlikleri. */
export type HesapOzetiComponentId =
  | 'ASIL_ALACAK'
  | 'TAKIP_ONCESI_FAIZ'
  | 'TAKIP_TUTARI'
  | 'BASVURMA_HARCI'
  | 'VEKALET_HARCI'
  | 'PESIN_HARC'
  | 'DOSYA_GIDERI'
  | 'TEBLIGAT_GIDERI'
  | 'VEKALET_PULU'
  | 'ICRA_MASRAFLARI_AGGREGATE'
  | 'TAHSIL_HARCI_PESIN_DAHIL'
  | 'TAHSIL_HARCI_PESIN_HARIC'
  | 'TAHSIL_ORANI_SENARYOLARI'
  | 'VEKALET_UCRETI'
  | 'TAKIP_SONRASI_FAIZ'
  | 'TOPLAM_TAHSILAT'
  | 'TOPLAM_BORC'
  | 'SON_BORC'
  | 'KALAN_BORC';

/** Legacy tarafın bir bileşeni nasıl ürettiği. */
export type LegacyComponentSource =
  | 'COMPUTED_FORMULA'
  | 'HARDCODED_CONSTANT'
  | 'STUB_ZERO'
  | 'DUE_DERIVED'
  | 'ABSENT';

/** Canonical tarafın bir bileşeni nasıl ürettiği. */
export type CanonicalComponentSource =
  | 'CLAIM_ITEM_ENGINE'
  | 'TBK100_ENGINE'
  | 'AGGREGATE_DERIVED'
  | 'ABSENT';

/** Ground-truth (statüter tarife / UYAP fixture) kaynağı. */
export type GroundTruthSource =
  | 'STATUTORY_TARIFE_TABLE'
  | 'UYAP_FIXTURE'
  | 'NOT_PROVIDED';

/** Risk seviyesi: bileşenin yanlış/eksik olması B1 readiness'i ne kadar tehdit ediyor. */
export type ComponentCoverageRisk = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * `tahsilOranlari` gibi tekil sayı olmayan, senaryo dizisi döndüren alanlar için
 * legacyValue placeholder'ı. Gerçek dizi `ComponentCoverageRow.notes` içinde
 * özetlenir; sayısal karşılaştırma bu bileşen için atlanır.
 */
export const SCENARIO_ARRAY = 'SCENARIO_ARRAY' as const;

export interface ComponentCoverageRow {
  component: HesapOzetiComponentId;
  /** Türkçe, insan-okunur etiket (rapor/UI için). */
  label: string;
  legacyValue: number | null | typeof SCENARIO_ARRAY;
  legacySource: LegacyComponentSource;
  canonicalValue: number | null;
  canonicalSource: CanonicalComponentSource;
  groundTruthValue: number | null;
  groundTruthSource: GroundTruthSource;
  coverageStatus: ComponentCoverageStatus;
  risk: ComponentCoverageRisk;
  /** Türkçe açıklama: neden bu statü/risk atandı, hangi kod satırına dayanıyor. */
  notes: string;
}

export interface ComponentCoverageReport {
  caseId: string;
  rows: ComponentCoverageRow[];
  summary: {
    countByStatus: Record<ComponentCoverageStatus, number>;
    b1ReadinessBlocked: boolean;
  };
}

/**
 * Ground-truth fixture girişi: bir bileşen için bağımsız doğrulanmış "doğru" değer.
 * Analyzer'a opsiyonel olarak verilir; verilmezse groundTruthSource=NOT_PROVIDED olur.
 */
export interface GroundTruthEntry {
  value: number;
  source: Extract<GroundTruthSource, 'STATUTORY_TARIFE_TABLE' | 'UYAP_FIXTURE'>;
}

export type GroundTruthFixture = Partial<Record<HesapOzetiComponentId, GroundTruthEntry>>;

/**
 * `case.service.ts#getCalculationSummary()` (satır ~3921-3956) tarafından üretilen
 * inline objenin şekli. case.service.ts BU MODÜLDEN import ETMEZ — tersine, bu tip
 * yalnız test/analyzer tarafında legacy şekli tip-güvenli temsil etmek için
 * bağımsızca tanımlandı (mevcut dosyaya dokunulmadı).
 */
export interface CalculationSummaryLegacyShape {
  caseId: string;
  hesapTarihi: string;
  takipTarihi: string;
  kalemTuru: string;

  asilAlacak: number;
  tazminat: number;
  komisyon: number;
  takipOncesiFaiz: number;
  takipTutari: number;

  basvurmaHarci: number;
  vekaletHarci: number;
  pesinHarc: number;
  dosyaGideri: number;
  tebligatGideri: number;
  vekaletPulu: number;
  icraMasraflari: number;

  pesinHarcDahilTahsilHarci: number;
  pesinHarcHaricTahsilHarci: number;

  vekaletUcreti: number;
  takipSonrasiFaiz: number;

  toplamBorc: number;
  sonBorc: number;
  toplamTahsilat: number;
  kalanBorc: number;
  kalanAnapara: number;

  mahsupDetaylari: unknown[];
  faizSegmentleri: { takipOncesi: unknown[]; takipSonrasi: unknown[] };
  tahsilOranlari: Array<{ oran: number; label: string; tutar: number }>;
}

/**
 * `case-balance-display.ts#toCaseBalanceDisplay()` çıktısının analyzer'ın
 * ihtiyaç duyduğu alt-kümesi. Tam `CaseBalanceDisplay` tipini import etmek yerine
 * burada yapısal (structural) bir alt-tip tanımlanır ki bu modül canonical
 * dosyaya sıkı derleme-zamanı bağımlılığı olmadan da (ör. shape mismatch
 * durumunda) çalışabilsin. `CaseBalanceDisplay` bu tipe yapısal olarak uyumludur.
 */
export interface CanonicalBalanceDisplayShape {
  caseId: string;
  currency: string;
  costs: number;
  ancillaries: number;
  currencies: Array<{
    currency: string;
    interest: number;
    claimRemaining: number;
    collected: number;
  }>;
  totals: {
    totalDebtAmount: number | null;
    totalPaidAmount: number | null;
    outstandingAmount: number | null;
  };
}
