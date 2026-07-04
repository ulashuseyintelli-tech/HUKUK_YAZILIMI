/**
 * ACT-03 (G2, PR-A1d-pre §3.2) — Arka-yüz ciro/kaşe BÖLGE tespiti (second-pass, nitel).
 *
 * `endorsement-extractor.ts` deseninin AYNISI: yeni bir vision-LLM second-pass, saf/test'li
 * extractor tipi, ön-yüz/isim çıkarımına DOKUNMAZ. Bu katman İSİM çıkarmaz — yalnız arka
 * yüzdeki kaşe/imza/işaret BÖLGELERİNİ (konum + okunabilirlik + iptal-üstü-binme sinyali)
 * nitel olarak tanımlar. Pixel-hassas bounding box YOK (vision-LLM'lerde güvenilmez).
 *
 * 🔴 KIRMIZI ÇİZGİ (yapısal izolasyon, #294/endorsement-extractor deseniyle tutarlı):
 *  1) Ön-yüz alanlarına (drawerName/amount/issueDate/vb.) ASLA dokunmaz.
 *  2) İSİM çıkarmaz, sıra/zincir kurmaz, sınıflandırma (CIRO/BANKA_SERHI/IPTAL, §3.3) YAPMAZ —
 *     yalnız "burada bir bölge var, şöyle görünüyor" sinyali üretir.
 *  3) CANLI OCR AKIŞINA WIRE EDİLMEZ (§3.3 classifier + §3.6 entegrasyon henüz yok; yarım
 *     pipeline'ı production'a bağlamak karışık/yanıltıcı çıktı riski taşır — owner kararı).
 *  4) Borçlu/CaseDebtor/Party/CaseInstrument YARATMAZ veya YAZMAZ.
 *
 * Yalnız kambiyo (CEK/SENET/POLICE) + arka-yüz sayfalarında anlamlıdır (çağıran taraf seçer).
 * AI hatası → graceful (extractor hatayı fırlatabilir; çağıran taraf yakalar, bu dosya yutmaz).
 */

/** Bölgenin sayfadaki dikey konumu (nitel; pixel-koordinat YOK). */
export type VerticalRegion = "TOP" | "MIDDLE" | "BOTTOM" | "FULL_PAGE" | "UNKNOWN";

/** Bölgenin sayfadaki yatay konumu (nitel; pixel-koordinat YOK). */
export type HorizontalRegion = "LEFT" | "CENTER" | "RIGHT" | "FULL_WIDTH" | "UNKNOWN";

/** Bölgenin okunabilirlik/görünürlük durumu. */
export type RegionVisibility = "CLEAR" | "FAINT" | "PARTIAL" | "OVERLAPPING" | "UNKNOWN";

/** Tek bir tespit edilen bölge (kaşe/imza/işaret alanı) — nitel, saf veri. */
export interface EndorsementRegion {
  vertical: VerticalRegion;
  horizontal: HorizontalRegion;
  visibility: RegionVisibility;
  /** Bu bölgenin ÜSTÜNE ikinci bir işaret (çapraz çizgi/İPTAL/X) binmiş mi (§2 hipotez sinyali). */
  cancellationOverlap: boolean;
  /** 0-100 (mevcut OCR confidence konvansiyonuyla tutarlı). */
  confidence: number;
  /** Kısa, insan-okur gerekçe/kanıt (ör. "sayfa altında soluk kaşe, üstünde çapraz çizgi"). */
  rationale?: string;
}

/** Region-detection second-pass için system prompt. */
export const REGION_DETECTION_PROMPT = `Sen bir Türk kambiyo hukuku belge analiz uzmanısın. Sana bir çek/senet/poliçenin ARKA YÜZÜ (ciro bölgesi) verilecek.

GÖREV: Bu arka yüzde GÖRÜNEN her ayrı kaşe/imza/işaret BÖLGESİNİ tespit et. İSİM ÇIKARMA, SINIFLANDIRMA YAPMA (ciro mu banka şerhi mi iptal mi — bu SENİN İŞİN DEĞİL). Yalnız her bölgenin KONUMUNU ve GÖRÜNÜRLÜĞÜNÜ tanımla.

KURALLAR (kesin):
- Her ayrı kaşe/imza/damga/işaret İŞARETİ tek bir "bölge" say (aynı bölgenin üstüne binmiş ikinci bir işaret AYRI bölge DEĞİL — cancellationOverlap ile işaretle).
- vertical: sayfanın üst/orta/alt kısmında mı (TOP/MIDDLE/BOTTOM), tüm sayfayı mı kaplıyor (FULL_PAGE), belirsizse UNKNOWN.
- horizontal: sol/orta/sağ (LEFT/CENTER/RIGHT), tüm genişlik (FULL_WIDTH), belirsizse UNKNOWN.
- visibility: net okunur (CLEAR), soluk/silik (FAINT), kısmen kesilmiş/kenarda (PARTIAL), başka bir işaretle üst-üste binmiş (OVERLAPPING), belirsizse UNKNOWN.
- cancellationOverlap: bu bölgenin üstüne çapraz çizgi / X / "İPTAL" ibaresi gibi geçersiz kılıcı İKİNCİ bir işaret binmiş mi (true/false).
- confidence: 0-100, bu bölge tespitinden ne kadar eminsin.
- rationale: KISA (bir cümle) gerekçe — ne gördüğün.
- Hiçbir bölge göremiyorsan boş dizi döndür. Emin değilsen düşük confidence ver, uydurma.
- İSİM, tutar, tarih, banka adı, sınıflandırma (ciro/banka şerhi/iptal) ÇIKARMA — bu pass'in işi DEĞİL.

TEK JSON nesnesi döndür (dizi DEĞİL):
{
  "regions": [
    {
      "vertical": "TOP" | "MIDDLE" | "BOTTOM" | "FULL_PAGE" | "UNKNOWN",
      "horizontal": "LEFT" | "CENTER" | "RIGHT" | "FULL_WIDTH" | "UNKNOWN",
      "visibility": "CLEAR" | "FAINT" | "PARTIAL" | "OVERLAPPING" | "UNKNOWN",
      "cancellationOverlap": true | false,
      "confidence": 0-100,
      "rationale": "kısa gerekçe"
    }
  ]
}`;

/** Region-detection second-pass için AI girdisi. */
export interface RegionDetectionAiInput {
  imageRef?: string; // arka sayfa görüntü yolu (vision)
  text?: string; // arka sayfa metni (TEXT sayfa) — bölge tespiti için genelde anlamsız ama arayüz tutarlılığı için taşınır
  prompt: string; // REGION_DETECTION_PROMPT
}

/** Region-detection AI çağrısı — tek sayfa için ham bölge listesi. Test'te mock'lanır. */
export type RegionDetector = (
  input: RegionDetectionAiInput,
) => Promise<{ regions: EndorsementRegion[] }>;

const VALID_VERTICAL = new Set<VerticalRegion>(["TOP", "MIDDLE", "BOTTOM", "FULL_PAGE", "UNKNOWN"]);
const VALID_HORIZONTAL = new Set<HorizontalRegion>(["LEFT", "CENTER", "RIGHT", "FULL_WIDTH", "UNKNOWN"]);
const VALID_VISIBILITY = new Set<RegionVisibility>(["CLEAR", "FAINT", "PARTIAL", "OVERLAPPING", "UNKNOWN"]);
const MAX_REGIONS_PER_PAGE = 20; // enstrüman başına garbage-in koruması (endorsement-extractor MAX_ENDORSEMENT_NAMES deseniyle tutarlı)
const MAX_RATIONALE_LEN = 240; // endorsement-extractor ENDORSEMENT_EVIDENCE_MAX ile tutarlı üst sınır

/**
 * AI'dan gelen ham bölge listesini doğrular/normalize eder: geçersiz enum değeri → UNKNOWN'a
 * düşer (silent-crash yerine güvenli varsayılan), confidence 0-100'e clamp edilir, rationale
 * kırpılır, cap uygulanır. Hiçbir alan uydurulmaz — yalnız zaten var olan alan normalize edilir.
 *
 * @remarks Çağrıldığı yerler:
 * - detectEndorsementRegions() (aynı dosya) → AI çıktısını güvenli hale getirir
 * - __tests__/endorsement-region-detector.spec.ts → birim test
 */
export function normalizeRegions(raw: unknown): EndorsementRegion[] {
  if (!Array.isArray(raw)) return [];
  const out: EndorsementRegion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const vertical = VALID_VERTICAL.has(r.vertical as VerticalRegion) ? (r.vertical as VerticalRegion) : "UNKNOWN";
    const horizontal = VALID_HORIZONTAL.has(r.horizontal as HorizontalRegion)
      ? (r.horizontal as HorizontalRegion)
      : "UNKNOWN";
    const visibility = VALID_VISIBILITY.has(r.visibility as RegionVisibility)
      ? (r.visibility as RegionVisibility)
      : "UNKNOWN";
    const cancellationOverlap = r.cancellationOverlap === true;
    const rawConfidence = typeof r.confidence === "number" ? r.confidence : 0;
    const confidence = Math.max(0, Math.min(100, Math.round(rawConfidence)));
    const rationale =
      typeof r.rationale === "string" && r.rationale.trim().length > 0
        ? r.rationale.trim().slice(0, MAX_RATIONALE_LEN)
        : undefined;
    out.push({ vertical, horizontal, visibility, cancellationOverlap, confidence, rationale });
    if (out.length >= MAX_REGIONS_PER_PAGE) break;
  }
  return out;
}

/**
 * Tek bir arka-yüz sayfası için bölge tespiti çalıştırır. Saf/graceful DEĞİL — hata çağıran
 * tarafa fırlatılır (endorsement-extractor.applyEndorsementPass deseninde try/catch çağıranda).
 * CANLI OCR AKIŞINDAN ÇAĞRILMAZ (bkz. dosya üstü kırmızı çizgi #3) — bu, izole/test edilebilir
 * bir yapı taşı; wiring ayrı, owner-onaylı bir sonraki faz.
 *
 * @remarks Çağrıldığı yerler:
 * - __tests__/endorsement-region-detector.spec.ts → birim test (henüz production call-site YOK)
 */
export async function detectEndorsementRegions(
  input: { imageRef?: string; text?: string },
  detector: RegionDetector,
): Promise<EndorsementRegion[]> {
  if (!input.imageRef && !input.text) return [];
  const res = await detector({ prompt: REGION_DETECTION_PROMPT, imageRef: input.imageRef, text: input.text });
  return normalizeRegions(res?.regions);
}

export const __testing = { VALID_VERTICAL, VALID_HORIZONTAL, VALID_VISIBILITY, MAX_REGIONS_PER_PAGE, MAX_RATIONALE_LEN };
