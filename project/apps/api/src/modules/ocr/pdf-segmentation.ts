/**
 * PR-2a-2 — Belge segmentasyonu: belge → Page[] (HAM sayfa katmanı, AI YOK).
 *
 * Tek iş: "kaç sayfa, her sayfada metin mi görüntü mü, kaynağı ne?"
 * Belge bilgisi (documentNo/amount/tip/face/back) ÇIKARMAZ → o PR-2b (AI/Vision).
 * Çek/senet kararı deterministik grouping motorundadır (PR-2a-1).
 *
 * SINIRLAR (bilinçli):
 *  - Üretim akışına BAĞLANMADI (scanDebtDocument/Vision/rule-based dokunulmadı) → PR-2b.
 *  - pdf-poppler GERÇEK render bu PR'da ŞART DEĞİL (native poppler Windows/CI'da kırılgan):
 *    yalnız adapter arayüzü + stub. Gerçek render ayrı küçük PR / PR-2b başında.
 *
 * pageIndex 1-BASED'dir (avukat/review "sayfa 1, sayfa 2" diye düşünür; 0-based UI hatası
 * üretir). PR-2b PageCandidate.pageIndex'i buradan taşır → grouping sourcePages 1-based olur.
 */

export type PageKind = "TEXT" | "IMAGE" | "EMPTY";

export interface Page {
  pageIndex: number; // 1-BASED
  kind: PageKind;
  text?: string; // metin sayfasıysa ham metin (TEXT)
  hasText: boolean;
  needsImageExtraction: boolean; // taranmış/boş-metin → PR-2b'de Vision/OCR gerekir
  imageRef?: string; // render edilmiş sayfa görüntüsü (bu PR'da genelde yok; stub null döner)
  source: "pdf-parse" | "pdf-poppler" | "image" | "docx" | "udf" | "text" | "unknown";
}

export interface SegmentationResult {
  pages: Page[];
  totalPages: number; // belgedeki TOPLAM sayfa (cap'ten ÖNCE)
  truncated: boolean; // MAX_PAGES aşıldı mı (sessiz kırpma YOK)
  droppedPages: number; // cap nedeniyle işlenmeyen sayfa sayısı
  needsReview: boolean; // truncated → kullanıcı kontrol etmeli
}

/**
 * PDF sayfasını görüntüye render eden adapter (poppler vb.). Gerçek implementasyon
 * bu PR'da ŞART DEĞİL; stub null döner ve needsImageExtraction sinyali korunur.
 */
export interface PdfPageRenderer {
  renderPage(buffer: Buffer, pageIndex: number): Promise<string | null>;
}

/** Render etmeyen stub — taranmış sayfa için imageRef üretmez (needsImageExtraction kalır). */
export class StubPdfPageRenderer implements PdfPageRenderer {
  async renderPage(): Promise<string | null> {
    return null;
  }
}

/** PDF'ten per-page ham metin çıkaran adapter (test'te mock'lanır). */
export type PdfPageTextExtractor = (buffer: Buffer) => Promise<string[]>;

export interface SegmentDeps {
  extractPdfPageTexts?: PdfPageTextExtractor; // varsayılan: pdf-parse pagerender
  renderer?: PdfPageRenderer; // varsayılan: StubPdfPageRenderer
  maxPages?: number; // varsayılan: DEFAULT_MAX_PAGES
}

export const DEFAULT_MAX_PAGES = 50;
const MIN_PAGE_TEXT_LEN = 10; // bundan az metin → taranmış/boş kabul (IMAGE)

function isImageInput(mimeType: string, filename?: string): boolean {
  if (mimeType.startsWith("image/")) return true;
  const n = (filename ?? "").toLowerCase();
  return [".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp"].some((e) => n.endsWith(e));
}

function isPdfInput(mimeType: string, filename?: string): boolean {
  return mimeType === "application/pdf" || (filename ?? "").toLowerCase().endsWith(".pdf");
}

/**
 * Varsayılan PDF per-page metin çıkarıcı (pdf-parse `pagerender`). Native değil,
 * Windows/CI'da güvenli. Lazy-require ile modül yüklemesi hafif tutulur.
 */
export const defaultExtractPdfPageTexts: PdfPageTextExtractor = async (buffer: Buffer) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require("pdf-parse");
  const pageTexts: string[] = [];
  await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const tc = await pageData.getTextContent();
      const text = (tc.items || []).map((i: any) => i.str).join(" ");
      pageTexts.push(text);
      return text;
    },
  });
  return pageTexts;
};

/**
 * Belgeyi HAM sayfalara böler. AI YOK; yalnız sayfa sayısı + metin/görüntü durumu + kaynak.
 *
 * @remarks Çağrıldığı yerler:
 * - (henüz YOK — PR-2a-2 yalnız export edilen altyapı + test; üretim bağlama PR-2b)
 */
export async function segmentDocumentIntoPages(
  input: { buffer: Buffer; mimeType: string; filename?: string },
  deps: SegmentDeps = {},
): Promise<SegmentationResult> {
  const maxPages = deps.maxPages ?? DEFAULT_MAX_PAGES;
  const renderer = deps.renderer ?? new StubPdfPageRenderer();

  // 1) Tek görüntü girdisi → tek IMAGE sayfa
  if (isImageInput(input.mimeType, input.filename)) {
    const imageRef = (await renderer.renderPage(input.buffer, 1)) ?? undefined;
    return {
      pages: [
        {
          pageIndex: 1,
          kind: "IMAGE",
          hasText: false,
          needsImageExtraction: true,
          imageRef,
          source: "image",
        },
      ],
      totalPages: 1,
      truncated: false,
      droppedPages: 0,
      needsReview: false,
    };
  }

  // 2) PDF → per-page metin (pdf-parse). Metni olmayan sayfa = taranmış → IMAGE.
  if (isPdfInput(input.mimeType, input.filename)) {
    const extractor = deps.extractPdfPageTexts ?? defaultExtractPdfPageTexts;
    const pageTexts = await extractor(input.buffer);
    const totalPages = pageTexts.length;
    const truncated = totalPages > maxPages;
    const used = truncated ? pageTexts.slice(0, maxPages) : pageTexts;

    const pages: Page[] = [];
    for (let i = 0; i < used.length; i++) {
      const raw = used[i] ?? "";
      const trimmed = raw.trim();
      const hasText = trimmed.length >= MIN_PAGE_TEXT_LEN;
      if (hasText) {
        pages.push({
          pageIndex: i + 1, // 1-BASED
          kind: "TEXT",
          text: raw,
          hasText: true,
          needsImageExtraction: false,
          source: "pdf-parse",
        });
      } else {
        // metin yok/çok az → taranmış sayfa; render adapter (stub) imageRef üretmeyebilir
        const imageRef = (await renderer.renderPage(input.buffer, i + 1)) ?? undefined;
        pages.push({
          pageIndex: i + 1,
          kind: "IMAGE",
          hasText: false,
          needsImageExtraction: true,
          imageRef,
          source: "pdf-parse",
        });
      }
    }

    return {
      pages,
      totalPages,
      truncated,
      droppedPages: truncated ? totalPages - maxPages : 0,
      needsReview: truncated,
    };
  }

  // 3) Diğer (DOCX/UDF/TXT/RTF): çoklu-enstrüman kapsamı dışı → tek TEXT sayfa
  // (gerçek metin çıkarımı mevcut extractText ile; burada tek mantıksal sayfa olarak işaretlenir).
  const src: Page["source"] = (() => {
    const n = (input.filename ?? "").toLowerCase();
    if (n.endsWith(".udf")) return "udf";
    if (n.endsWith(".docx") || n.endsWith(".doc")) return "docx";
    if (n.endsWith(".txt") || input.mimeType === "text/plain") return "text";
    return "unknown";
  })();
  return {
    pages: [
      {
        pageIndex: 1,
        kind: "TEXT",
        hasText: true,
        needsImageExtraction: false,
        source: src,
      },
    ],
    totalPages: 1,
    truncated: false,
    droppedPages: 0,
    needsReview: false,
  };
}
