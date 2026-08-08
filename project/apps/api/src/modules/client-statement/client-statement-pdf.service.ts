import { Injectable, Logger } from '@nestjs/common';
import type { ClientStatementStatus } from '@prisma/client';
import {
  assertStatementRenderable,
  buildClientStatementPdfDocument,
} from './client-statement-pdf.document';
import type { ClientStatementRenderV1 } from './client-statement-render.contract';

/**
 * CAD C3-B02 — ekstre PDF byte üretimi (İNCE katman).
 *
 * Belge tanımı saf/deterministik olarak `client-statement-pdf.document.ts`te kurulur;
 * burada yalnız pdfmake'e verilip Buffer'a çevrilir (attachment üretimine uygun).
 *
 * ⛔ pdf-poppler KULLANILMAZ (Linux'ta jest worker'ını düşürür).
 * Kütüphane: pdfmake — repo'da zaten mevcut ve `ai-document.service.ts` ile aynı desen
 * (vfs_fonts Roboto; Türkçe diakritikler standart PDF fontlarında kırılırdı).
 */
@Injectable()
export class ClientStatementPdfService {
  private readonly logger = new Logger(ClientStatementPdfService.name);

  /**
   * Fail-closed: yalnız ACTIVE ekstre PDF'e dönüşür. SUPERSEDED/VOID çağrısı
   * ClientStatementNotRenderableError ile reddedilir (C3-B03 gönderimi de bunu tüketir).
   */
  async render(render: ClientStatementRenderV1, status: ClientStatementStatus): Promise<Buffer> {
    assertStatementRenderable(status);
    const definition = buildClientStatementPdfDocument(render);

    // pdfmake Node kurulumu: ai-document.service.ts ile aynı (vfs atanmadan font çözülemez).
    const pdfMake = require('pdfmake/build/pdfmake');
    const pdfFonts = require('pdfmake/build/vfs_fonts');
    pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs;

    const docDefinition = {
      info: definition.info,
      content: definition.content,
      defaultStyle: { font: 'Roboto', fontSize: 9 },
      styles: {
        title: { fontSize: 14, bold: true, alignment: 'center', margin: [0, 0, 0, 8] },
        meta: { fontSize: 9, margin: [0, 0, 0, 8] },
        balance: { fontSize: 10, bold: true, margin: [0, 6, 0, 6] },
        lines: { fontSize: 8, margin: [0, 4, 0, 4] },
        footnote: { fontSize: 8, italics: true, margin: [0, 8, 0, 0] },
      },
      pageSize: 'A4',
      pageMargins: [32, 32, 32, 40],
    };

    return new Promise<Buffer>((resolve, reject) => {
      try {
        pdfMake.createPdf(docDefinition).getBuffer((buffer: Buffer) => resolve(Buffer.from(buffer)));
      } catch (e: any) {
        this.logger.error(`Ekstre PDF üretilemedi: ${e?.message ?? 'bilinmeyen hata'}`);
        reject(e);
      }
    });
  }
}
