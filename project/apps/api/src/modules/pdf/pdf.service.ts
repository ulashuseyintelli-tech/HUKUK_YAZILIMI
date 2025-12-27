import { Injectable, Logger } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

export interface PdfGenerateOptions {
  title: string;
  content: string;
  format?: 'A4' | 'LEGAL';
  orientation?: 'portrait' | 'landscape';
  margins?: { top: number; bottom: number; left: number; right: number };
  watermark?: string;
  footer?: string;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  // Metin icerikten PDF olustur
  async generateFromText(options: PdfGenerateOptions): Promise<Buffer> {
    const { title, content, format = 'A4', margins = { top: 50, bottom: 50, left: 50, right: 50 }, watermark, footer } = options;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: format,
          margins,
          info: { Title: title, Author: 'Hukuk Takip Sistemi', Subject: title },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Filigran ekle
        if (watermark) {
          doc.save();
          doc.fontSize(60).fillColor('#cccccc').opacity(0.3);
          doc.text(watermark, 100, 300, { align: 'center' });
          doc.restore();
        }

        // Baslik
        doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
        doc.moveDown(2);

        // Icerik
        doc.fontSize(10).font('Helvetica');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // Baslik satiri (buyuk harflerle)
          if (trimmed === trimmed.toUpperCase() && trimmed.length > 5 && trimmed.length < 60) {
            doc.font('Helvetica-Bold').text(trimmed, { align: 'center' });
            doc.font('Helvetica');
          }
          // Alt baslik (: ile biten)
          else if (trimmed.endsWith(':') && trimmed.length < 30) {
            doc.font('Helvetica-Bold').text(trimmed);
            doc.font('Helvetica');
          }
          // Normal satir
          else if (trimmed) {
            doc.text(line);
          }
          // Bos satir
          else {
            doc.moveDown(0.5);
          }
        }

        // Footer ekle
        if (footer) {
          const pageCount = doc.bufferedPageRange().count;
          for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).text(
              `${footer} - Sayfa ${i + 1}/${pageCount}`,
              margins.left,
              doc.page.height - margins.bottom + 20,
              { align: 'center', width: doc.page.width - margins.left - margins.right }
            );
          }
        }

        doc.end();
      } catch (error) {
        this.logger.error('PDF olusturma hatasi:', error);
        reject(error);
      }
    });
  }

  // Takip Talebi PDF olustur
  async generateTakipTalebiPdf(data: {
    title: string;
    content: string;
    fileNumber: string;
    date: string;
  }): Promise<Buffer> {
    return this.generateFromText({
      title: `Takip Talebi - ${data.fileNumber}`,
      content: data.content,
      format: 'A4',
      footer: `Dosya No: ${data.fileNumber} | Tarih: ${data.date}`,
    });
  }

  // Odeme Emri PDF olustur
  async generateOdemeEmriPdf(data: {
    title: string;
    content: string;
    fileNumber: string;
    executionNumber: string;
  }): Promise<Buffer> {
    return this.generateFromText({
      title: `Odeme Emri - ${data.executionNumber}`,
      content: data.content,
      format: 'A4',
      watermark: 'ORNEK',
      footer: `Icra Dosya No: ${data.executionNumber}`,
    });
  }

  // Tablo iceren PDF olustur (alacak kalemleri icin)
  async generateTablePdf(options: {
    title: string;
    headers: string[];
    rows: string[][];
    footer?: string;
  }): Promise<Buffer> {
    const { title, headers, rows, footer } = options;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Baslik
        doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
        doc.moveDown(2);

        // Tablo
        const colWidth = (doc.page.width - 100) / headers.length;
        let y = doc.y;

        // Header
        doc.fontSize(10).font('Helvetica-Bold');
        headers.forEach((header, i) => {
          doc.text(header, 50 + i * colWidth, y, { width: colWidth, align: 'left' });
        });
        y += 20;
        doc.moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
        y += 10;

        // Rows
        doc.font('Helvetica').fontSize(9);
        for (const row of rows) {
          row.forEach((cell, i) => {
            doc.text(cell, 50 + i * colWidth, y, { width: colWidth, align: 'left' });
          });
          y += 15;
        }

        // Footer
        if (footer) {
          doc.fontSize(8).text(footer, 50, doc.page.height - 40, { align: 'center' });
        }

        doc.end();
      } catch (error) {
        this.logger.error('Tablo PDF olusturma hatasi:', error);
        reject(error);
      }
    });
  }
}
