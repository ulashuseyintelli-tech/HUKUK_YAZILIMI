/**
 * Second-pass payee-only extractor — çek ön-yüz LEHTAR'ını AYRI bir AI çağrısıyla çıkarır.
 *
 * 🔴 KIRMIZI ÇİZGİ (regresyon önleme): Mevcut B1 per-page extraction'a DOKUNMAZ. Bu pass YALNIZ
 *  payeeName + payeeEvidence üretir; drawerName/issueDate/dueDate/amount/documentNo IMMUTABLE.
 *  (Tek-pass prompt'a payee eklemek canlıda drawerName'i bozmuştu → ayrı pass = yapısal izolasyon.)
 *
 * SINIRLAR: yalnız type=CEK · yalnız FACE sayfa (arka/ciro YOK) · mevcut payeeName EZİLMEZ ·
 *  null/boş → boş bırak · AI throw → graceful (o instrument atlanır, tarama bozulmaz).
 */

import { Instrument, PageCandidate } from "./debt-instrument.types";
import { Page } from "./pdf-segmentation";

/** Dar, payee-only system prompt. AI YALNIZ lehtarı bulur; başka alan çıkarmaz. */
export const PAYEE_EXTRACTION_PROMPT = `Sen bir Türk kambiyo (çek) belge uzmanısın. Sana TEK BİR ÇEK ÖN YÜZÜ verilecek.

GÖREV: YALNIZ LEHTAR (payee / çekin ödeneceği taraf) adını çıkar.

KURALLAR (kesin):
- Lehtar = çekin ÖDENECEĞİ taraf: "emrine" / "...e ödeyiniz" / "lehine" satırındaki kişi veya şirket.
- KEŞİDECİ (hesap sahibi / çeki düzenleyen), İMZACI, KAŞE'deki ad, CİRANTA → bunlar LEHTAR DEĞİLDİR, ÇIKARMA.
- "hamiline" / "hamil" yazıyorsa lehtar adı YOKTUR → payeeName null.
- Emin değilsen UYDURMA → payeeName null.
- BAŞKA HİÇBİR alanı (keşideci, tarih, tutar, çek no) çıkarma veya değiştirme.

Yalnız TEK JSON döndür:
{ "payeeName": "lehtar adı (yoksa null)", "payeeEvidence": "lehtarı bulduğun KISA metin alıntısı (~120 karakter, yoksa null)" }`;

export interface PayeeAiInput {
  kind: "text" | "vision";
  text?: string; // TEXT sayfa metni
  imageRef?: string; // VISION sayfa görüntü yolu
  prompt: string; // PAYEE_EXTRACTION_PROMPT
  context?: string; // documentNo/drawerName/issueDate grounding (AI odaklansın; yalnız payee döndürür)
}

export interface RawPayeeFields {
  payeeName?: string | null;
  payeeEvidence?: string | null;
}

/** AI/Vision payee çağrısı — TEK çek ön-yüzü. Test'te mock'lanır. */
export type PayeeExtractor = (input: PayeeAiInput) => Promise<RawPayeeFields>;

const PAYEE_EVIDENCE_MAX = 200;

/**
 * Bir instrument için lehtar pass'i çalıştırılacak FACE sayfasını seçer (saf, yan etkisiz).
 * null dönerse pass ATLANIR: CEK değil · mevcut payeeName var (EZME) · face source page yok · sayfa bulunamadı.
 */
export function selectPayeeFacePage(
  instrument: Instrument,
  candidates: PageCandidate[],
  pages: Page[],
): Page | null {
  if (instrument.type !== "CEK") return null; // yalnız çek
  if (instrument.payeeName) return null; // mevcut (manuel/önceki) payeeName EZİLMEZ
  const sources = instrument.sourcePages ?? [];
  const faceCand = candidates.find((c) => sources.includes(c.pageIndex) && c.face === true);
  if (!faceCand) return null; // FACE yok → arka yüzde lehtar aranmaz
  return pages.find((p) => p.pageIndex === faceCand.pageIndex) ?? null;
}

/**
 * Çek instrument'larına lehtar second-pass'i uygular (MUTASYON: YALNIZ payeeName + payeeEvidence).
 * GUARD: drawerName/issueDate/dueDate/amount/documentNo'ya DOKUNMAZ. CEK-dışı/face-yok/mevcut-payee → atla;
 * null payee → boş bırak; payeeExtract throw → graceful (o instrument atlanır).
 *
 * <remarks> Çağrıldığı yer: OcrService.scanDebtDocumentMultiInstrument() → grouping SONRASI, buildDebtResult ÖNCESİ. </remarks>
 */
export async function applyPayeePass(
  instruments: Instrument[],
  candidates: PageCandidate[],
  pages: Page[],
  payeeExtract: PayeeExtractor,
): Promise<void> {
  for (const inst of instruments) {
    const page = selectPayeeFacePage(inst, candidates, pages);
    if (!page) continue;
    try {
      const useVision = page.kind === "IMAGE" && !!page.imageRef;
      const raw = await payeeExtract({
        kind: useVision ? "vision" : "text",
        text: page.text,
        imageRef: page.imageRef,
        prompt: PAYEE_EXTRACTION_PROMPT,
        context: `Bu çekte KEŞİDECİ: ${inst.drawerName ?? "?"} (keşideciyi lehtar SANMA). Çek no: ${inst.documentNo ?? "?"}. YALNIZ lehtarı bul.`,
      });
      const name = raw.payeeName?.trim();
      if (name) {
        inst.payeeName = name; // YALNIZ payeeName
        const ev = raw.payeeEvidence?.trim();
        if (ev) inst.payeeEvidence = ev.slice(0, PAYEE_EVIDENCE_MAX);
      }
      // null/boş payee → boş bırak (GUARD: manuel alan #294 fallback)
    } catch {
      // graceful: payee pass hatası taramayı BOZMAZ (drawer/tarih zaten dokunulmadı)
    }
  }
}
