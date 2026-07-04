/**
 * ACT-05 (G4, PR-A1d-pre §3.4) — Arka-yüz ciro zinciri COMPLETENESS SCORING (saf/deterministik).
 *
 * ACT-03 (§3.2, region detection) + ACT-04 (§3.3, region classifier) çıktısını (bölge +
 * sınıflandırma çiftleri) girdi olarak alır; AI çağrısı YAPMAZ — yalnız bu iki katmanın
 * ürettiği nitel sinyalleri (visibility/confidence) sayısallaştırıp bir "eksik-düğüm-riski"
 * kararı üretir. Bu katman kendi başına ne bölge tespiti ne sınıflandırma yapar.
 *
 * 🔴 KIRMIZI ÇİZGİ (yapısal izolasyon, ACT-03/ACT-04 ile tutarlı):
 *  1) Ön-yüz alanlarına ASLA dokunmaz.
 *  2) Low-confidence order suggestion (§3.5), #387 entegrasyonu (§3.6) YAPMAZ — yalnız bir
 *     completeness skoru + (düşükse) uyarı metni üretir. Sıra/zincir kurmaz.
 *  3) CANLI OCR AKIŞINA WIRE EDİLMEZ (§3.6 entegrasyon kontratı henüz yok — ACT-03/04'teki
 *     gerekçe aynen geçerli).
 *  4) Borçlu/CaseDebtor/Party/CaseInstrument YARATMAZ veya YAZMAZ.
 *  5) Round-2 dataset'e (BLK-09) bağımlı DEĞİL — bu katman şimdi implemente edilebilir/test
 *     edilebilir; Round-2 yalnız İLERİDE bu skorun gerçek recall'unu ölçmek için kullanılır
 *     (§3.4: "Round-2'de recall ölçülür" — o ölçüm AYRI, ileride, owner-gated bir iştir; bu
 *     dosya hiçbir Round-2 verisine veya dosyasına referans vermez/bağımlı değildir).
 */

import { EndorsementRegion, RegionVisibility } from "./endorsement-region-detector";
import { RegionClassification } from "./endorsement-region-classifier";

/** ACT-03 bölgesi + ACT-04 sınıflandırması eşleşmiş tek bir kayıt. */
export interface RegionCompletenessInput {
  region: EndorsementRegion;
  classification: RegionClassification;
}

/** Tek bir arka-yüz sayfası için completeness sonucu — nitel, saf veri. */
export interface CompletenessScore {
  /** CIRO olarak sınıflanmış bölge sayısı (müracaat zincirine girebilecek adaylar). */
  ciroCount: number;
  /** Eksik-düğüm-riski taşıyan bölge sayısı (düşük-güven/kısmi/UNKNOWN). */
  atRiskCount: number;
  /** §3.4: düşük-güven/kısmi bölge varsa completeness DÜŞÜK, aksi halde YETERLİ. */
  completeness: "OK" | "LOW";
  /** Yalnız completeness=LOW iken dolu; avukata gösterilecek kısa uyarı. */
  warning?: string;
}

/**
 * 0-100 güven ölçeğinde "düşük" eşiği. Tasarım dokümanı (§3.4) sayısal bir eşik vermez, yalnız
 * "düşük-güven/kısmi bölge" der; bu eşik ACT-03/04 ile aynı 0-100 konvansiyonuna göre orta
 * noktanın altı olarak seçildi (belgesiz sihirli sayı değil — burada açıkça gerekçelendirildi).
 */
const LOW_CONFIDENCE_THRESHOLD = 50;

/** §3.2'nin "kısmi/soluk/üst-üste binmiş" görünürlük durumları — completeness riski sinyali. */
const AT_RISK_VISIBILITY = new Set<RegionVisibility>(["FAINT", "PARTIAL", "OVERLAPPING", "UNKNOWN"]);

const LOW_COMPLETENESS_WARNING =
  "Zincir eksik olabilir, doğrula (düşük-güven veya kısmi tespit edilmiş bölge var).";

/**
 * Bir eşleşmenin (region+classification) eksik-düğüm-riski taşıyıp taşımadığını değerlendirir.
 * Yalnız CIRO ve UNKNOWN sınıflar risk adayıdır: CIRO zaten zincire girer (düşük-güvenle
 * sayılmış olabilir); UNKNOWN ise "belirsiz kaldı, aslında CIRO olabilirdi" sinyalidir.
 * BANKA_SERHI/IPTAL zaten zincire girmez (§3.3), bu yüzden completeness riskine dahil edilmez.
 *
 * @remarks Çağrıldığı yerler:
 * - scoreCompleteness() (aynı dosya) → her bölge için risk değerlendirmesi
 * - __tests__/endorsement-completeness-scoring.spec.ts → birim test
 */
export function isAtRiskRegion(input: RegionCompletenessInput): boolean {
  const { region, classification } = input;
  const isRiskCandidate = classification.type === "CIRO" || classification.type === "UNKNOWN";
  if (!isRiskCandidate) return false;
  const lowVisibility = AT_RISK_VISIBILITY.has(region.visibility);
  const lowRegionConfidence = region.confidence < LOW_CONFIDENCE_THRESHOLD;
  const lowClassificationConfidence = classification.confidence < LOW_CONFIDENCE_THRESHOLD;
  return lowVisibility || lowRegionConfidence || lowClassificationConfidence;
}

/**
 * §3.4 completeness scoring: bir sayfadaki tüm (bölge+sınıflandırma) eşleşmelerinden CIRO
 * sayısını ve eksik-düğüm-riski taşıyan bölge sayısını çıkarır, tek bir OK/LOW kararına indirger.
 * Saf fonksiyon — AI çağrısı yapmaz, DB'ye dokunmaz, sıra/zincir kurmaz (§3.5 değil).
 *
 * @remarks Çağrıldığı yerler:
 * - __tests__/endorsement-completeness-scoring.spec.ts → birim test (henüz production call-site
 *   YOK — CANLI OCR AKIŞINA WIRE EDİLMEZ, bkz. dosya üstü kırmızı çizgi #3)
 */
export function scoreCompleteness(inputs: RegionCompletenessInput[]): CompletenessScore {
  let ciroCount = 0;
  let atRiskCount = 0;
  for (const input of inputs) {
    if (input.classification.type === "CIRO") ciroCount++;
    if (isAtRiskRegion(input)) atRiskCount++;
  }
  const completeness: CompletenessScore["completeness"] = atRiskCount > 0 ? "LOW" : "OK";
  return {
    ciroCount,
    atRiskCount,
    completeness,
    warning: completeness === "LOW" ? LOW_COMPLETENESS_WARNING : undefined,
  };
}

export const __testing = { LOW_CONFIDENCE_THRESHOLD, AT_RISK_VISIBILITY, LOW_COMPLETENESS_WARNING };
