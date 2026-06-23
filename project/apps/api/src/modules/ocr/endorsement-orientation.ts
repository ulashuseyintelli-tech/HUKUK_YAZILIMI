/**
 * A1d-pre · G1 — Orientation-robust ARKA-YÜZ ciro extraction (adaptif çoklu-rotasyon + GÜVENLİ seçim).
 * ----------------------------------------------------------------------------
 * NEDEN (ölçüm kanıtı, 2026-06-23 spike): gerçek çek arkalarında EXIF YOK; gpt-4o'nun kendi rotation
 * tahmini GÜVENİLMEZ (270 dedi, gerçek 180); ve YANLIŞ açıda model YÜKSEK GÜVENLE SAHTE isim UYDURUR
 * (round-1 90°→"Süleyman Akbulut"×4 conf .9; 0°→"İlk Ciro/İkinci Ciro"). Yalnız DOĞRU açıda gerçek
 * cirantalar çıktı (180°→İŞIKLI/SÜNGERSAN). → confidence TEK BAŞINA ASLA yeterli değil.
 *
 * STRATEJİ (ulas onayı): 0° oku → güçlü+non-generic+front-payee eşleşiyorsa DUR; değilse 90/180/270 dene →
 * en iyi açıyı SEÇ. Seçim: gerçek-ad paterni + front-payee çapraz-eşleşme + generic-placeholder cezası +
 * tekrar-cezası + (düşük ağırlıklı) confidence. Seçilmeyen açılar audit'te tutulur, OTORİTE üretmez.
 *
 * SAF: bu modül DB/sharp/openai import ETMEZ; rotasyon+vision çağrısı `extractAtAngle` ile ENJEKTE edilir
 * (test edilebilirlik). Çıktı = ADAY EndorsementItem[]; CaseDebtor YARATMAZ (A1 invaryantı).
 *
 * Çağrıldığı yerler:
 * - endorsement-orientation.spec.ts (unit; gerçek round-1 fixture'larıyla seçici + halüsinasyon-reddi)
 * - (G1-wire, sonraki gate) endorsement-extractor / ocr.service arka-yüz pass (flag-gated)
 */

export type EndorsementRegionType = "CIRO" | "BANKA_SERHI" | "IPTAL" | "KONKORDATO";
export type OrientationAngle = 0 | 90 | 180 | 270;

/** Tek çıkarılan bölge (aday). */
export interface EndorsementItem {
  /** Ciro silsilesinde ÜST→ALT sıra; yalnız CIRO için anlamlı, yoksa null. */
  order: number | null;
  name: string;
  type: EndorsementRegionType;
  /** İptal kaşesiyle geçersiz mi. */
  cancelled: boolean;
  /** 0..1 — modelin öz-güveni (TEK başına seçim için YETERSİZ; bkz. dosya başı). */
  confidence: number;
}

export interface OrientationCandidate {
  angle: OrientationAngle;
  items: EndorsementItem[];
}

export interface OrientationScore {
  total: number;
  realName: number;
  frontPayeeMatch: number;
  genericPenalty: number;
  repetitionPenalty: number;
  confidence: number;
}

export interface OrientationSelection {
  /** Seçilen açı; hiç aday yoksa null. */
  chosenAngle: OrientationAngle | null;
  /** Seçilen açının ADAY ciro/şerh öğeleri. */
  items: EndorsementItem[];
  score: OrientationScore | null;
  /** Tüm açıların skorları (audit/debug; otorite DEĞİL). */
  audit: Array<{ angle: OrientationAngle; score: OrientationScore }>;
  reason: string;
}

// ── Saf yardımcılar ─────────────────────────────────────────────────────────

/** TR harf-katlamalı büyütme (İ/ı/ş/ç/ğ/ö/ü) + ASCII sadeleştirme — eşleştirme için. */
export function foldTr(s: string): string {
  return (s || "")
    .replace(/İ/g, "I").replace(/ı/g, "I").replace(/i/g, "I")
    .replace(/Ş/g, "S").replace(/ş/g, "S")
    .replace(/Ç/g, "C").replace(/ç/g, "C")
    .replace(/Ğ/g, "G").replace(/ğ/g, "G")
    .replace(/Ö/g, "O").replace(/ö/g, "O")
    .replace(/Ü/g, "U").replace(/ü/g, "U")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ayırt edici olmayan iş/kurum jenerik token'ları (eşleşmede gürültü). */
const STOPWORDS = new Set([
  "VE", "LTD", "STI", "SIRKETI", "LIMITED", "ANONIM", "SAN", "SANAYI", "TIC", "TICARET",
  "AS", "A", "S", "SUBESI", "MAH", "SOKAK", "SOK", "CAD", "NO", "VD",
]);

function distinctiveTokens(name: string): Set<string> {
  return new Set(
    foldTr(name)
      .split(" ")
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

/** İki ad arasındaki ayırt-edici token örtüşme oranı (0..1). */
export function tokenOverlap(a: string, b: string): number {
  const ta = distinctiveTokens(a);
  const tb = distinctiveTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

/**
 * Jenerik placeholder mı? (model gerçek ad okuyamayınca üretir: "İlk Ciro", "1. Ciro", "Birinci ...",
 * yalnız "İmza"/"Ciro"/"Kaşe"). Bunlar DOĞRU-açı sinyali DEĞİL → ceza.
 */
export function isGenericPlaceholder(name: string): boolean {
  const f = foldTr(name);
  if (!f) return true;
  if (/^(IMZA|CIRO|KASE|BANKA SERHI|SERH)$/.test(f)) return true;
  if (/\bCIRO\b/.test(f) && /(ILK|IKINCI|UCUNCU|DORDUNCU|BESINCI|ALTINCI|BIRINCI|\d+\s*$|^\d+|\d+\s*CIRO|CIRO\s*\d+)/.test(f)) return true;
  if (/^(ILK|IKINCI|UCUNCU|DORDUNCU|BESINCI|BIRINCI)\b/.test(f)) return true;
  return false;
}

/** Gerçek kişi/şirket adı paterni mi? (kurum eki VEYA ≥2 ayırt-edici token; jenerik değil). */
export function looksLikeRealEntity(name: string): boolean {
  if (isGenericPlaceholder(name)) return false;
  const f = foldTr(name);
  if (/\b(LTD|STI|LIMITED|ANONIM|SIRKETI|SANAYI|TICARET|BANKA|BANKASI|FAKTORING)\b/.test(f)) return true;
  return distinctiveTokens(name).size >= 2; // ör. "DILEK KAYA" / "SULEYMAN AKBULUT"
}

const CIRO_TYPES: ReadonlySet<EndorsementRegionType> = new Set(["CIRO", "IPTAL"]);

// Ağırlıklar — front-payee + generic/tekrar cezası BASKIN; confidence DÜŞÜK (halüsinasyon güvenliği).
const W = { realName: 1.0, frontPayee: 2.5, generic: 2.0, repetition: 1.5, confidence: 0.5 };

/**
 * Bir açı adayını puanla. front-payee eşleşmesi (bilinen ön-yüz lehtarı arka-yüzde 1. ciranta olmalı)
 * en güçlü DOĞRU-açı sinyali; jenerik + tekrar cezalı; confidence düşük katkı.
 */
export function scoreCandidate(cand: OrientationCandidate, frontPayeeNames: string[] = []): OrientationScore {
  const ciroItems = cand.items.filter((it) => CIRO_TYPES.has(it.type));
  const n = ciroItems.length;

  const realName = n === 0 ? 0 : ciroItems.filter((it) => looksLikeRealEntity(it.name)).length / n;

  let frontPayeeMatch = 0;
  for (const it of ciroItems) {
    for (const p of frontPayeeNames) {
      frontPayeeMatch = Math.max(frontPayeeMatch, tokenOverlap(it.name, p));
    }
  }

  const genericCount = cand.items.filter((it) => CIRO_TYPES.has(it.type) && isGenericPlaceholder(it.name)).length;
  const genericPenalty = cand.items.length === 0 ? 1 : genericCount / cand.items.length;

  // tekrar cezası: aynı (foldlanmış) ciranta adı birden çok → halüsinasyon sinyali ("Süleyman Akbulut"×4)
  const keys = ciroItems.map((it) => foldTr(it.name)).filter(Boolean);
  const uniq = new Set(keys).size;
  const repetitionPenalty = keys.length <= 1 ? 0 : 1 - uniq / keys.length;

  const confidence = n === 0 ? 0 : ciroItems.reduce((s, it) => s + (Number(it.confidence) || 0), 0) / n;

  const total =
    W.realName * realName +
    W.frontPayee * frontPayeeMatch -
    W.generic * genericPenalty -
    W.repetition * repetitionPenalty +
    W.confidence * confidence;

  return { total, realName, frontPayeeMatch, genericPenalty, repetitionPenalty, confidence };
}

/**
 * 0° sonucu "güçlü ve non-generic" mi (→ DUR, diğer açıları deneme)?
 * Güçlü = jenerik yok + gerçek-ad oranı yüksek + (lehtar biliniyorsa) front-payee eşleşmesi var.
 */
export function isStrongZero(zero: OrientationCandidate, frontPayeeNames: string[] = []): boolean {
  const s = scoreCandidate(zero, frontPayeeNames);
  const hasCiro = zero.items.some((it) => CIRO_TYPES.has(it.type));
  if (!hasCiro) return false;
  if (s.genericPenalty > 0) return false;
  if (s.realName < 0.8) return false;
  if (frontPayeeNames.length > 0 && s.frontPayeeMatch < 0.5) return false; // lehtar var ama eşleşmiyor → şüpheli
  return true;
}

/** Adaylardan en yüksek toplam skorluyu seç (audit'te hepsini tut). */
export function selectOrientation(
  candidates: OrientationCandidate[],
  frontPayeeNames: string[] = [],
): OrientationSelection {
  if (candidates.length === 0) {
    return { chosenAngle: null, items: [], score: null, audit: [], reason: "Aday yok." };
  }
  const scored = candidates.map((c) => ({ cand: c, score: scoreCandidate(c, frontPayeeNames) }));
  scored.sort((a, b) => b.score.total - a.score.total);
  const best = scored[0];
  return {
    chosenAngle: best.cand.angle,
    items: best.cand.items,
    score: best.score,
    audit: scored.map((s) => ({ angle: s.cand.angle, score: s.score })),
    reason: `Seçilen açı=${best.cand.angle} (skor=${best.score.total.toFixed(2)}; front-payee=${best.score.frontPayeeMatch.toFixed(2)}, generic=${best.score.genericPenalty.toFixed(2)}, tekrar=${best.score.repetitionPenalty.toFixed(2)}).`,
  };
}

/**
 * ADAPTİF çoklu-rotasyon orchestration. `extractAtAngle(angle)` ENJEKTE edilir (gerçekte sharp.rotate +
 * gpt-4o; testte mock). Önce 0°; güçlüyse DUR (maliyet), değilse 90/180/270 dene → seç.
 */
export async function extractWithAdaptiveOrientation(
  extractAtAngle: (angle: OrientationAngle) => Promise<EndorsementItem[]>,
  frontPayeeNames: string[] = [],
): Promise<OrientationSelection> {
  const zero: OrientationCandidate = { angle: 0, items: await extractAtAngle(0) };
  if (isStrongZero(zero, frontPayeeNames)) {
    const sel = selectOrientation([zero], frontPayeeNames);
    return { ...sel, reason: "0° güçlü+non-generic → eskalasyon yok. " + sel.reason };
  }
  const others: OrientationCandidate[] = [];
  for (const angle of [90, 180, 270] as OrientationAngle[]) {
    others.push({ angle, items: await extractAtAngle(angle) });
  }
  return selectOrientation([zero, ...others], frontPayeeNames);
}
