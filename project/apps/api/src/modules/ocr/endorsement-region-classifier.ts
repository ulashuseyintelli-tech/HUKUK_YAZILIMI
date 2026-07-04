/**
 * ACT-04 (G3, PR-A1d-pre §3.3) — Arka-yüz bölge SINIFLANDIRMA (second-pass, nitel).
 *
 * `endorsement-extractor.ts` / `endorsement-region-detector.ts` deseninin AYNISI: yeni bir
 * vision-LLM second-pass, saf/test'li tip, ön-yüz/isim çıkarımına DOKUNMAZ. Bu katman, ACT-03
 * (§3.2) tarafından tespit edilmiş bir bölgeyi (konum/görünürlük/cancellationOverlap) CONTEXT
 * olarak alır ve o bölgenin İÇERİĞİNİ (metin anahtarları/banka logosu/çapraz-çizik) okuyarak
 * `CIRO | BANKA_SERHI | IPTAL` olarak sınıflar.
 *
 * ⚠️ KAPSAM DÜZELTMESİ (Ulaş, 2026-07-04): Master Triage ACT-04 dört kategori listelemişti
 * (CIRO/BANKA_ŞERHİ/İPTAL/KONKORDATO). "KONKORDATO" §3.3'ün kilitli tasarımında YOKTUR — Borçlu
 * (Debtor) domaininin ayrı bir risk-bayrağı kavramıdır (`RISK_CONCORDAT`, packages/types), OCR
 * bölge sınıflandırmasıyla mimari ilişkisi yoktur. Kapsam §3.3'e göre KESİN 3 kategoriyle
 * sınırlandı; KONKORDATO eklenmedi (Master Triage kontaminasyonu, owner onayıyla düzeltildi).
 *
 * 🔴 KIRMIZI ÇİZGİ (yapısal izolasyon):
 *  1) Ön-yüz alanlarına ASLA dokunmaz. İsim/sıra/zincir kurmaz (§3.5+ değil).
 *  2) Completeness scoring (§3.4), order suggestion (§3.5), #387 entegrasyonu (§3.6) YAPMAZ —
 *     yalnız TEK bölge için TEK sınıflandırma kararı üretir.
 *  3) CANLI OCR AKIŞINA WIRE EDİLMEZ (§3.6 entegrasyon kontratı henüz yok — ACT-03'teki gerekçe
 *     aynen geçerli: yarım pipeline'ı production'a bağlamak karışık çıktı riski taşır).
 *  4) Borçlu/CaseDebtor/Party/CaseInstrument YARATMAZ veya YAZMAZ.
 *  5) Round-2 dataset'e (BLK-09) bağımlı DEĞİL — bu katman şimdi implemente edilebilir/test
 *     edilebilir; Round-2 yalnız İLERİDE tüm §3 hattının GÜVENİLİRLİĞİNİ ölçmek için kullanılır.
 */

import { EndorsementRegion } from "./endorsement-region-detector";

/** §3.3'te kilitli 3 kategori + AI'ın emin olamadığı durum için UNKNOWN. */
export type EndorsementRegionType = "CIRO" | "BANKA_SERHI" | "IPTAL" | "UNKNOWN";

/** Tek bir bölgenin sınıflandırma sonucu — nitel, saf veri. */
export interface RegionClassification {
  type: EndorsementRegionType;
  /** 0-100 (mevcut OCR confidence konvansiyonuyla tutarlı). */
  confidence: number;
  /** Kısa, insan-okur gerekçe (ör. "T.C. Ziraat Bankası ibraz kaşesi, tarih+imza yok"). */
  rationale?: string;
}

/** Sınıflandırma second-pass için system prompt. */
export const REGION_CLASSIFICATION_PROMPT = `Sen bir Türk kambiyo hukuku belge analiz uzmanısın. Sana bir çek/senet/poliçenin ARKA YÜZÜ (ciro bölgesi) ve bu yüzde ÖNCEDEN TESPİT EDİLMİŞ TEK BİR bölgenin konum bilgisi verilecek.

GÖREV: YALNIZ belirtilen bölgeyi şu üç kategoriden birine sınıfla:
- CIRO: ciranta kaşesi/imzası (şirket adı + VKN/VD + imza, veya kişi imzası). Müracaat zincirine girer.
- BANKA_SERHI: banka işlem/protesto/ibraz kaşesi ("ibraz edilmiştir", "karşılıksızdır", "kısmi ödeme" gibi banka şubesi ibareleri + banka logosu/adı). Ciranta DEĞİL, zincire girmez.
- IPTAL: bir ciro bölgesini geçersiz kılan iptal/çizik kaşesi veya "İPTAL" ibaresi, çapraz çizgi/X morfolojisi. İlişkili ciroyu geçersiz kılar.

AYIRT EDİCİ SİNYALLER: metin anahtarları ("ibraz", "karşılıksız", "iptal"), banka logosu/şube ismi varlığı, çapraz-çizik/X şekli, bölgenin üstüne başka bir işaret binmiş olması (verilen bağlamda belirtilir).

KURALLAR (kesin):
- YALNIZ belirtilen TEK bölgeyi sınıfla. Sayfadaki diğer bölgeleri sınıflama, isim çıkarma, sıra/zincir kurma — bunlar bu pass'in işi DEĞİL.
- "KONKORDATO" veya borçlu-risk kategorisi DİYE BİR SINIF YOK — böyle bir ibare görsen bile YALNIZ yukarıdaki üç kategoriden birini seç (muhtemelen BANKA_SERHI veya CIRO, bağlama göre) veya emin değilsen düşük confidence ver.
- Emin değilsen düşük confidence ver, uydurma.

TEK JSON nesnesi döndür:
{
  "type": "CIRO" | "BANKA_SERHI" | "IPTAL",
  "confidence": 0-100,
  "rationale": "kısa gerekçe"
}`;

/** Sınıflandırma second-pass için AI girdisi. */
export interface RegionClassificationAiInput {
  imageRef?: string; // arka sayfa görüntü yolu (vision)
  text?: string; // arka sayfa metni (TEXT sayfa)
  prompt: string; // REGION_CLASSIFICATION_PROMPT
  /** ACT-03 (§3.2) çıktısından türetilen, "hangi bölgeyi sınıflıyorsun" bağlamı (yalnız odaklama amaçlı, cevabı DİKTE ETMEZ). */
  regionContext: string;
}

/** Sınıflandırma AI çağrısı — tek bölge için ham sonuç. Test'te mock'lanır. */
export type RegionClassifier = (
  input: RegionClassificationAiInput,
) => Promise<{ type?: string; confidence?: number; rationale?: string }>;

const VALID_TYPES = new Set<EndorsementRegionType>(["CIRO", "BANKA_SERHI", "IPTAL", "UNKNOWN"]);
const MAX_RATIONALE_LEN = 240; // endorsement-region-detector ile tutarlı üst sınır

/**
 * ACT-03 çıktısındaki bölge tanımını, sınıflandırıcıya "hangi bölgeden bahsediyoruz" diye
 * ODAKLAMA bağlamına çevirir. Cevabı DİKTE ETMEZ (ör. cancellationOverlap=true "bu IPTAL'dir"
 * demez — yalnız "bu bölgenin üstünde başka bir işaret var" bilgisini taşır, karar AI'ya kalır).
 *
 * @remarks Çağrıldığı yerler:
 * - classifyEndorsementRegion() (aynı dosya) → sınıflandırma çağrısına bağlam ekler
 * - __tests__/endorsement-region-classifier.spec.ts → birim test
 */
export function buildRegionContext(region: EndorsementRegion): string {
  const parts: string[] = [
    `Konum: dikey=${region.vertical}, yatay=${region.horizontal}.`,
    `Görünürlük: ${region.visibility}.`,
  ];
  if (region.cancellationOverlap) {
    parts.push("Bu bölgenin ÜSTÜNE başka bir işaret binmiş görünüyor (üst-üste binme sinyali).");
  }
  if (region.rationale) {
    parts.push(`Önceki tespit notu: ${region.rationale}`);
  }
  return parts.join(" ");
}

/**
 * AI'dan gelen ham sınıflandırmayı doğrular/normalize eder: geçersiz/eksik type → UNKNOWN
 * (silent-crash yerine güvenli varsayılan; "KONKORDATO" gibi kapsam-dışı bir değer gelirse de
 * UNKNOWN'a düşer — asla üç kategori dışına sızmaz), confidence 0-100'e clamp, rationale kırpılır.
 *
 * @remarks Çağrıldığı yerler:
 * - classifyEndorsementRegion() (aynı dosya) → AI çıktısını güvenli hale getirir
 * - __tests__/endorsement-region-classifier.spec.ts → birim test
 */
export function normalizeClassification(raw: unknown): RegionClassification {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = VALID_TYPES.has(r.type as EndorsementRegionType) ? (r.type as EndorsementRegionType) : "UNKNOWN";
  const rawConfidence = typeof r.confidence === "number" ? r.confidence : 0;
  const confidence = Math.max(0, Math.min(100, Math.round(rawConfidence)));
  const rationale =
    typeof r.rationale === "string" && r.rationale.trim().length > 0
      ? r.rationale.trim().slice(0, MAX_RATIONALE_LEN)
      : undefined;
  return { type, confidence, rationale };
}

/**
 * ACT-03'te tespit edilmiş TEK bir bölgeyi sınıflar. Saf/graceful DEĞİL — hata çağıran tarafa
 * fırlatılır (endorsement-region-detector deseninde: henüz canlı call-site yok, koruyacak bir
 * şey yok). CANLI OCR AKIŞINDAN ÇAĞRILMAZ (bkz. dosya üstü kırmızı çizgi #3).
 *
 * @remarks Çağrıldığı yerler:
 * - __tests__/endorsement-region-classifier.spec.ts → birim test (henüz production call-site YOK)
 */
export async function classifyEndorsementRegion(
  region: EndorsementRegion,
  page: { imageRef?: string; text?: string },
  classifier: RegionClassifier,
): Promise<RegionClassification> {
  if (!page.imageRef && !page.text) return { type: "UNKNOWN", confidence: 0 };
  const res = await classifier({
    prompt: REGION_CLASSIFICATION_PROMPT,
    imageRef: page.imageRef,
    text: page.text,
    regionContext: buildRegionContext(region),
  });
  return normalizeClassification(res);
}

/**
 * §3.3'ün "her tespit edilen bölge sınıflanır" ifadesi gereği, ACT-03'ten gelen bölge listesini
 * TEK TEK sınıflar (aynı sayfa görüntüsü, her biri için ayrı bağlam). Bir bölge patlarsa diğerleri
 * etkilenmez GRACEFUL DEĞİL bu katmanda — henüz canlı akışa bağlı olmadığından hata çağırana
 * fırlatılır; toplu-graceful davranış wiring fazında (ayrı, owner-gated) ele alınacak.
 *
 * @remarks Çağrıldığı yerler:
 * - __tests__/endorsement-region-classifier.spec.ts → birim test (henüz production call-site YOK)
 */
export async function classifyEndorsementRegions(
  regions: EndorsementRegion[],
  page: { imageRef?: string; text?: string },
  classifier: RegionClassifier,
): Promise<RegionClassification[]> {
  const out: RegionClassification[] = [];
  for (const region of regions) {
    out.push(await classifyEndorsementRegion(region, page, classifier));
  }
  return out;
}

export const __testing = { VALID_TYPES, MAX_RATIONALE_LEN };
