/**
 * PR-2b-1 — PdfPageRenderer'ın GERÇEK poppler implementasyonu + graceful fallback.
 *
 * SINIRLAR (bilinçli):
 *  - AI yok · PageCandidate yok · grouping yok · üretim wiring yok.
 *  - Varsayılan renderer DEĞİŞMEZ: segmentDocumentIntoPages hâlâ StubPdfPageRenderer
 *    kullanır. PopplerPdfPageRenderer yalnız OPSİYONEL adapter (2b-3 wiring'de devreye girer).
 *  - GRACEFUL FALLBACK ZORUNLU: poppler binary yok / convert hata / fs hata → throw YOK,
 *    null döner. Native poppler CI'da yoksa sistem/CI KIRILMAZ.
 *      → null imageRef → segmentDocumentIntoPages sayfayı IMAGE + needsImageExtraction bırakır.
 */

import { Logger } from "@nestjs/common";
import { PdfPageRenderer } from "./pdf-segmentation";

const logger = new Logger("PopplerPdfPageRenderer");

/**
 * Tek sayfa render impl'i (gerçek poppler + fs). Test'te mock'lanabilsin diye ayrık tip.
 * pageIndex 1-BASED (pdf-poppler / pdftoppm sayfa numarası da 1-based).
 */
export type SinglePageRenderImpl = (buffer: Buffer, pageIndex: number) => Promise<string>;

/**
 * Gerçek poppler render: buffer → temp .pdf → pdf-poppler convert(page) → png yolu.
 * Lazy-require (modül yüklemesi hafif). Native poppler/pdftoppm YOKSA burası THROW eder;
 * PopplerPdfPageRenderer.renderPage onu yakalar (graceful → null).
 */
export const defaultPopplerRender: SinglePageRenderImpl = async (buffer, pageIndex) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfPoppler = require("pdf-poppler");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require("os");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");

  const tmpDir: string = fs.mkdtempSync(path.join(os.tmpdir(), "hukuk-poppler-"));
  const pdfPath: string = path.join(tmpDir, "in.pdf");
  const outPrefix = "page";
  fs.writeFileSync(pdfPath, buffer);
  try {
    await pdfPoppler.convert(pdfPath, {
      format: "png",
      out_dir: tmpDir,
      out_prefix: outPrefix,
      page: pageIndex, // 1-based tek sayfa
    });
    const images: string[] = fs
      .readdirSync(tmpDir)
      .filter((f: string) => f.startsWith(outPrefix) && f.toLowerCase().endsWith(".png"));
    if (images.length === 0) {
      throw new Error("poppler çıktı görüntüsü bulunamadı");
    }
    return path.join(tmpDir, images[0]); // imageRef (downstream PR-2b-2/3 kullanır)
  } finally {
    // temp pdf'i temizle (üretilen görüntü imageRef olarak kalır)
    try {
      fs.unlinkSync(pdfPath);
    } catch {
      /* yoksay */
    }
  }
};

/**
 * Gerçek poppler render adapter'ı. renderImpl enjekte edilebilir (test).
 *
 * @remarks Çağrıldığı yerler:
 * - (henüz YOK — PR-2b-1 yalnız opsiyonel adapter; üretim bağlama PR-2b-3)
 */
export class PopplerPdfPageRenderer implements PdfPageRenderer {
  constructor(private readonly renderImpl: SinglePageRenderImpl = defaultPopplerRender) {}

  async renderPage(buffer: Buffer, pageIndex: number): Promise<string | null> {
    try {
      return await this.renderImpl(buffer, pageIndex);
    } catch (e: any) {
      // GRACEFUL: poppler binary yok / convert / fs hatası → ÇÖKME YOK, null dön.
      logger.warn(`Sayfa ${pageIndex} render edilemedi (poppler/fs): ${e?.message ?? e}`);
      return null;
    }
  }
}
