import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfMake = require('pdfmake/build/pdfmake');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfFonts = require('pdfmake/build/vfs_fonts');

// PDF fonts
pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs;

export interface DocumentGenerationRequest {
  prompt: string;
  documentType: 'DILEKCE' | 'SOZLESME' | 'IHTARNAME' | 'VEKALETNAME' | 'TUTANAK' | 'DIGER';
  outputFormat: 'PDF' | 'DOCX' | 'TEXT';
  metadata?: {
    title?: string;
    date?: string;
    parties?: { name: string; role: string }[];
    caseNumber?: string;
    courtName?: string;
    [key: string]: any;
  };
}

export interface GeneratedDocument {
  content: string;
  title: string;
  format: string;
  buffer?: Buffer;
  mimeType: string;
  filename: string;
}

@Injectable()
export class AiDocumentService {
  private readonly logger = new Logger(AiDocumentService.name);
  private openai: OpenAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey && apiKey !== 'sk-your-openai-api-key-here') {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async generateDocument(request: DocumentGenerationRequest): Promise<GeneratedDocument> {
    const { prompt, documentType, outputFormat, metadata } = request;

    // AI ile içerik oluştur
    const content = await this.generateContentWithAI(prompt, documentType, metadata);
    
    // Başlık oluştur
    const title = metadata?.title || this.generateTitle(documentType);
    const filename = this.generateFilename(title, outputFormat);

    // Format'a göre çıktı oluştur
    if (outputFormat === 'PDF') {
      const buffer = await this.generatePDF(content, title, metadata);
      return {
        content,
        title,
        format: 'PDF',
        buffer,
        mimeType: 'application/pdf',
        filename,
      };
    }

    // TEXT format
    return {
      content,
      title,
      format: 'TEXT',
      mimeType: 'text/plain',
      filename: filename.replace('.pdf', '.txt'),
    };
  }


  private async generateContentWithAI(
    prompt: string,
    documentType: string,
    metadata?: any
  ): Promise<string> {
    const systemPrompt = this.getSystemPrompt(documentType);
    const userPrompt = this.buildUserPrompt(prompt, metadata);

    if (this.openai) {
      try {
        const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-3.5-turbo';
        const response = await this.openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          ...(model.startsWith("o1") ? { max_completion_tokens: 2000 } : { max_tokens: 2000 }),
        });

        return response.choices[0]?.message?.content || this.getFallbackContent(documentType, prompt);
      } catch (error) {
        this.logger.error('OpenAI error:', error);
        return this.getFallbackContent(documentType, prompt);
      }
    }

    return this.getFallbackContent(documentType, prompt);
  }

  private getSystemPrompt(documentType: string): string {
    const prompts: Record<string, string> = {
      DILEKCE: `Sen bir Türk hukuk uzmanısın. Dilekçe yazımında uzmansın.
        Dilekçeler resmi dilde, açık ve net olmalı.
        Türk hukuk terminolojisini doğru kullan.
        Dilekçe formatı: Başlık, Muhatap, Konu, Açıklamalar, Sonuç ve Talep, İmza bölümlerini içermeli.`,
      
      SOZLESME: `Sen bir Türk hukuk uzmanısın. Sözleşme hazırlamada uzmansın.
        Sözleşmeler Türk Borçlar Kanunu'na uygun olmalı.
        Taraflar, konu, bedel, süre, fesih şartları gibi temel unsurları içermeli.`,
      
      IHTARNAME: `Sen bir Türk hukuk uzmanısın. İhtarname yazımında uzmansın.
        İhtarnameler noter aracılığıyla gönderilecek şekilde hazırlanmalı.
        Yasal sürelere ve sonuçlara dikkat çekilmeli.`,
      
      VEKALETNAME: `Sen bir Türk hukuk uzmanısın. Vekaletname hazırlamada uzmansın.
        Vekaletnameler noter onaylı olacak şekilde hazırlanmalı.
        Yetki kapsamı açıkça belirtilmeli.`,
      
      TUTANAK: `Sen bir Türk hukuk uzmanısın. Tutanak hazırlamada uzmansın.
        Tutanaklar tarih, saat, yer ve katılımcı bilgilerini içermeli.
        Olaylar kronolojik sırayla ve objektif şekilde yazılmalı.`,
      
      DIGER: `Sen bir Türk hukuk uzmanısın. Hukuki belge hazırlamada uzmansın.
        Belgeler resmi dilde ve hukuki terminolojiye uygun olmalı.`,
    };

    return prompts[documentType] || prompts.DIGER;
  }

  private buildUserPrompt(prompt: string, metadata?: any): string {
    let fullPrompt = prompt;

    if (metadata) {
      if (metadata.parties?.length) {
        fullPrompt += `\n\nTaraflar:\n${metadata.parties.map((p: any) => `- ${p.role}: ${p.name}`).join('\n')}`;
      }
      if (metadata.caseNumber) {
        fullPrompt += `\n\nDosya No: ${metadata.caseNumber}`;
      }
      if (metadata.courtName) {
        fullPrompt += `\n\nMahkeme: ${metadata.courtName}`;
      }
      if (metadata.date) {
        fullPrompt += `\n\nTarih: ${metadata.date}`;
      }
    }

    return fullPrompt;
  }

  private getFallbackContent(documentType: string, prompt: string): string {
    const date = new Date().toLocaleDateString('tr-TR');
    
    return `
${this.generateTitle(documentType).toUpperCase()}

Tarih: ${date}

KONU: ${prompt.substring(0, 100)}...

${prompt}

---
Bu belge otomatik olarak oluşturulmuştur.
Lütfen içeriği kontrol ediniz ve gerekli düzenlemeleri yapınız.
    `.trim();
  }

  private generateTitle(documentType: string): string {
    const titles: Record<string, string> = {
      DILEKCE: 'Dilekçe',
      SOZLESME: 'Sözleşme',
      IHTARNAME: 'İhtarname',
      VEKALETNAME: 'Vekaletname',
      TUTANAK: 'Tutanak',
      DIGER: 'Belge',
    };
    return titles[documentType] || 'Belge';
  }

  private generateFilename(title: string, format: string): string {
    const date = new Date().toISOString().split('T')[0];
    const safeName = title.toLowerCase()
      .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ı/g, 'i')
      .replace(/[^a-z0-9]/g, '_');
    return `${safeName}_${date}.${format.toLowerCase()}`;
  }

  private async generatePDF(content: string, title: string, metadata?: any): Promise<Buffer> {
    const docDefinition: any = {
      content: [
        { text: title.toUpperCase(), style: 'header', alignment: 'center' },
        { text: `Tarih: ${metadata?.date || new Date().toLocaleDateString('tr-TR')}`, style: 'date', alignment: 'right' },
        { text: '', margin: [0, 20, 0, 0] },
        ...this.parseContentToPdfElements(content),
      ],
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] },
        date: { fontSize: 10, color: '#666', margin: [0, 0, 0, 20] },
        paragraph: { fontSize: 11, lineHeight: 1.5, margin: [0, 5, 0, 5] },
        bold: { bold: true },
      },
      defaultStyle: { font: 'Roboto' },
    };

    return new Promise((resolve, reject) => {
      const pdfDoc = pdfMake.createPdf(docDefinition);
      pdfDoc.getBuffer((buffer: Buffer) => {
        resolve(buffer);
      });
    });
  }

  private parseContentToPdfElements(content: string): any[] {
    const lines = content.split('\n');
    return lines.map(line => {
      if (line.trim() === '') {
        return { text: '', margin: [0, 5, 0, 5] };
      }
      if (line.startsWith('#')) {
        return { text: line.replace(/^#+\s*/, ''), style: 'bold', margin: [0, 10, 0, 5] };
      }
      return { text: line, style: 'paragraph' };
    });
  }

  // Şablon bazlı doküman oluşturma
  async generateFromTemplate(
    templateCode: string,
    variables: Record<string, string>
  ): Promise<GeneratedDocument> {
    const template = this.getTemplate(templateCode);
    let content = template.content;

    // Değişkenleri yerleştir
    Object.entries(variables).forEach(([key, value]) => {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    const buffer = await this.generatePDF(content, template.title, { date: variables.date });

    return {
      content,
      title: template.title,
      format: 'PDF',
      buffer,
      mimeType: 'application/pdf',
      filename: this.generateFilename(template.title, 'PDF'),
    };
  }

  private getTemplate(code: string): { title: string; content: string } {
    const templates: Record<string, { title: string; content: string }> = {
      ODEME_EMRI: {
        title: 'Ödeme Emri',
        content: `
ÖDEME EMRİ

Dosya No: {{dosyaNo}}
Alacaklı: {{alacakli}}
Borçlu: {{borclu}}

Yukarıda bilgileri yazılı alacaklının, aşağıda yazılı alacağı için aleyhinize icra takibi başlatılmıştır.

Ana Para: {{anaPara}} TL
Faiz: {{faiz}} TL
Toplam: {{toplam}} TL

İşbu ödeme emrinin tebliğinden itibaren 10 gün içinde borcunuzu ödemeniz veya itiraz etmeniz gerekmektedir.

Tarih: {{date}}
        `.trim(),
      },
      HACIZ_MUZEKKERE: {
        title: 'Haciz Müzekkeresi',
        content: `
HACİZ MÜZEKKERESİ

Dosya No: {{dosyaNo}}
Tarih: {{date}}

{{muhatap}} MÜDÜRLÜĞÜNE

Yukarıda numarası yazılı dosyamızda borçlu {{borclu}} aleyhine yapılan icra takibinde, borçlunun nezdinizdeki hak ve alacaklarına haciz konulmasını rica ederim.

Borç Miktarı: {{borcMiktari}} TL

İcra Müdürü
        `.trim(),
      },
    };

    return templates[code] || { title: 'Belge', content: '{{content}}' };
  }
}
