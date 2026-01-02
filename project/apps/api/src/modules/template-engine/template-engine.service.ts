import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';

export interface TemplateData {
  fileNumber: string;
  filingDate: string;
  executionNumber?: string;
  executionOffice: { name: string; city: string; uyapCode?: string };
  creditors: Array<{ type: 'INDIVIDUAL' | 'COMPANY'; name: string; identityNo?: string; taxNo?: string; address?: string }>;
  lawyers: Array<{ name: string; barNumber: string; barCity: string; address?: string }>;
  debtors: Array<{ type: 'INDIVIDUAL' | 'COMPANY'; name: string; identityNo?: string; taxNo?: string; address?: string; role?: string }>;
  claimItems: Array<{ type: string; description: string; amount: number; currency: string; dueDate?: string }>;
  totals: { principal: number; interest: number; fees: number; total: number; currency: string };
  interestInfo: { type: 'YASAL' | 'TICARI' | 'CUSTOM'; rate?: number; description: string; variableRate: boolean };
  caseType: string;
  subCategory: string;
  executionPath: string;
  sourceDocument?: { type: string; number?: string; date?: string; bank?: string; branch?: string };
  courtInfo?: { name: string; caseNumber: string; decisionNumber: string; decisionDate: string };
  paymentDeadline?: string;
  seizureInfo?: { date: string; location: string; items: Array<{ description: string; value: number }> };
}

export interface GeneratedDocument {
  title: string;
  content: string;
  format: 'text' | 'html';
  templateCode: string;
}

// UDF (UYAP Document Format) yapısı
export interface UdfDocument {
  version: string;
  documentType: string;
  documentCode: string;
  createdAt: string;
  metadata: {
    fileNumber: string;
    executionOfficeCode?: string;
    caseType: string;
    subCategory: string;
  };
  content: {
    sections: Array<{
      type: string;
      title?: string;
      data: Record<string, any>;
    }>;
  };
  signature?: {
    lawyerBarNumber: string;
    lawyerName: string;
    timestamp: string;
  };
}

@Injectable()
export class TemplateEngineService {
  private readonly logger = new Logger(TemplateEngineService.name);
  private templates: Map<string, any> = new Map();

  constructor(private prisma: PrismaService) {
    this.loadTemplates();
  }

  private loadTemplates(): void {
    // Takip Talebi sablonlari (Ornek 1)
    this.templates.set('ORNEK_1_ILAMSIZ', this.getIlamsizTemplate());
    this.templates.set('ORNEK_1_KAMBIYO_CEK', this.getKambiyoCekTemplate());
    this.templates.set('ORNEK_1_KAMBIYO_SENET', this.getKambiyoSenetTemplate());
    this.templates.set('ORNEK_1_ILAMLI', this.getIlamliTemplate());
    this.templates.set('ORNEK_1_NAFAKA', this.getNafakaTemplate());
    this.templates.set('ORNEK_1_KIRA', this.getKiraTemplate());
    // Odeme Emri sablonlari (Ornek 7)
    this.templates.set('ORNEK_7_ILAMSIZ', this.getOdemeEmriIlamsizTemplate());
    this.templates.set('ORNEK_7_KAMBIYO', this.getOdemeEmriKambiyoTemplate());
    // Icra Emri sablonlari (Ornek 4-5)
    this.templates.set('ORNEK_4_ILAMLI', this.getIcraEmriTemplate());
    this.templates.set('ORNEK_5_NAFAKA', this.getIcraEmriNafakaTemplate());
    // Haciz Tutanagi
    this.templates.set('HACIZ_TUTANAGI', this.getHacizTutanagiTemplate());
    this.logger.log(`${this.templates.size} belge sablonu yuklendi`);
  }

  generateTakipTalebi(data: TemplateData): GeneratedDocument {
    const templateCode = this.getTemplateCode(data.caseType, data.subCategory);
    const template = this.templates.get(templateCode);
    if (!template) {
      this.logger.warn(`Sablon bulunamadi: ${templateCode}`);
      return this.generateDefaultTakipTalebi(data);
    }
    return { title: 'TAKIP TALEBI (ORNEK 1)', content: this.renderTemplate(template, data), format: 'text', templateCode };
  }

  generateOdemeEmri(data: TemplateData): GeneratedDocument {
    const isKambiyo = ['CEK', 'SENET', 'KAMBIYO_CEK', 'KAMBIYO_SENET'].includes(data.subCategory);
    const templateCode = isKambiyo ? 'ORNEK_7_KAMBIYO' : 'ORNEK_7_ILAMSIZ';
    const template = this.templates.get(templateCode);
    return { title: 'ODEME EMRI (ORNEK 7)', content: this.renderTemplate(template, data), format: 'text', templateCode };
  }

  generateIcraEmri(data: TemplateData): GeneratedDocument {
    const isNafaka = data.subCategory === 'NAFAKA' || data.caseType === 'NAFAKA';
    const templateCode = isNafaka ? 'ORNEK_5_NAFAKA' : 'ORNEK_4_ILAMLI';
    const template = this.templates.get(templateCode);
    return { title: isNafaka ? 'ICRA EMRI (ORNEK 5)' : 'ICRA EMRI (ORNEK 4)', content: this.renderTemplate(template, data), format: 'text', templateCode };
  }

  generateHacizTutanagi(data: TemplateData): GeneratedDocument {
    const template = this.templates.get('HACIZ_TUTANAGI');
    return { title: 'HACIZ TUTANAGI', content: this.renderTemplate(template, data), format: 'text', templateCode: 'HACIZ_TUTANAGI' };
  }

  async generateTakipTalebiFromCase(caseId: string): Promise<GeneratedDocument> {
    const caseData = await this.getCaseData(caseId);
    return this.generateTakipTalebi(caseData);
  }

  async generateOdemeEmriFromCase(caseId: string): Promise<GeneratedDocument> {
    const caseData = await this.getCaseData(caseId);
    return this.generateOdemeEmri(caseData);
  }

  async generateIcraEmriFromCase(caseId: string): Promise<GeneratedDocument> {
    const caseData = await this.getCaseData(caseId);
    return this.generateIcraEmri(caseData);
  }

  getAvailableTemplates(): Array<{ code: string; name: string; category: string }> {
    return [
      { code: 'ORNEK_1_ILAMSIZ', name: 'Ilamsiz Takip Talebi', category: 'Takip Talebi' },
      { code: 'ORNEK_1_KAMBIYO_CEK', name: 'Kambiyo (Cek) Takip Talebi', category: 'Takip Talebi' },
      { code: 'ORNEK_1_KAMBIYO_SENET', name: 'Kambiyo (Senet) Takip Talebi', category: 'Takip Talebi' },
      { code: 'ORNEK_1_ILAMLI', name: 'Ilamli Takip Talebi', category: 'Takip Talebi' },
      { code: 'ORNEK_1_NAFAKA', name: 'Nafaka Takip Talebi', category: 'Takip Talebi' },
      { code: 'ORNEK_1_KIRA', name: 'Kira Alacagi Takip Talebi', category: 'Takip Talebi' },
      { code: 'ORNEK_7_ILAMSIZ', name: 'Ilamsiz Odeme Emri', category: 'Odeme Emri' },
      { code: 'ORNEK_7_KAMBIYO', name: 'Kambiyo Odeme Emri', category: 'Odeme Emri' },
      { code: 'ORNEK_4_ILAMLI', name: 'Ilamli Icra Emri', category: 'Icra Emri' },
      { code: 'ORNEK_5_NAFAKA', name: 'Nafaka Icra Emri', category: 'Icra Emri' },
      { code: 'HACIZ_TUTANAGI', name: 'Haciz Tutanagi', category: 'Haciz' },
    ];
  }

  private async getCaseData(caseId: string): Promise<TemplateData> {
    const caseRecord = await (this.prisma as any).case.findUnique({
      where: { id: caseId },
      include: { executionOffice: true, clients: { include: { client: true } }, lawyers: { include: { lawyer: true } }, debtors: { include: { debtor: true } }, dues: true },
    });
    if (!caseRecord) throw new Error('Dosya bulunamadi');
    const claimItems = (caseRecord.dues || []).map((item: any) => ({ type: item.type, description: item.description, amount: Number(item.amount), currency: item.currency || 'TRY', dueDate: item.dueDate?.toISOString().split('T')[0] }));
    const principal = claimItems.filter((i: any) => i.type === 'PRINCIPAL').reduce((sum: number, i: any) => sum + i.amount, 0);
    const interest = claimItems.filter((i: any) => i.type === 'INTEREST').reduce((sum: number, i: any) => sum + i.amount, 0);
    const fees = claimItems.filter((i: any) => ['FEE', 'POSTAGE', 'STAMP', 'EXPENSE'].includes(i.type)).reduce((sum: number, i: any) => sum + i.amount, 0);
    return {
      fileNumber: caseRecord.fileNumber,
      filingDate: caseRecord.startDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      executionNumber: caseRecord.executionNumber,
      executionOffice: { name: caseRecord.executionOffice?.name || '', city: caseRecord.executionOffice?.city || '', uyapCode: caseRecord.executionOffice?.uyapCode },
      creditors: (caseRecord.clients || []).map((c: any) => ({ type: c.client?.type || 'INDIVIDUAL', name: c.client?.displayName || c.client?.name || '', identityNo: c.client?.tckn, taxNo: c.client?.vkn, address: c.client?.address })),
      lawyers: (caseRecord.lawyers || []).map((l: any) => ({ name: `${l.lawyer?.name || ''} ${l.lawyer?.surname || ''}`.trim(), barNumber: l.lawyer?.barNumber || '', barCity: l.lawyer?.barCity || '', address: l.lawyer?.address })),
      debtors: (caseRecord.debtors || []).map((d: any) => ({ type: d.debtor?.type || 'INDIVIDUAL', name: d.debtor?.displayName || d.debtor?.name || '', identityNo: d.debtor?.tckn, taxNo: d.debtor?.vkn, address: d.debtor?.address, role: d.role })),
      claimItems, totals: { principal, interest, fees, total: principal + interest + fees, currency: caseRecord.currency || 'TRY' },
      interestInfo: { type: caseRecord.interestType || 'YASAL', description: caseRecord.interestDescription || 'yasal faizi ile birlikte', variableRate: true },
      caseType: caseRecord.caseType || 'ILAMSIZ', subCategory: caseRecord.subCategory || 'GENEL', executionPath: caseRecord.executionPath || 'HACIZ',
    };
  }

  private renderTemplate(template: any, data: TemplateData): string {
    let content = template.content;
    content = this.replaceVariables(content, data);
    content = this.processLoops(content, data);
    return content;
  }

  private replaceVariables(content: string, data: TemplateData): string {
    content = content.replace(/\{\{fileNumber\}\}/g, data.fileNumber || '');
    content = content.replace(/\{\{executionNumber\}\}/g, data.executionNumber || '....../......');
    content = content.replace(/\{\{filingDate\}\}/g, this.formatDate(data.filingDate));
    content = content.replace(/\{\{paymentDeadline\}\}/g, data.paymentDeadline || '7 gun');
    content = content.replace(/\{\{executionOffice\.name\}\}/g, data.executionOffice.name);
    content = content.replace(/\{\{executionOffice\.city\}\}/g, data.executionOffice.city);
    content = content.replace(/\{\{totals\.principal\}\}/g, this.formatMoney(data.totals.principal));
    content = content.replace(/\{\{totals\.interest\}\}/g, this.formatMoney(data.totals.interest));
    content = content.replace(/\{\{totals\.fees\}\}/g, this.formatMoney(data.totals.fees));
    content = content.replace(/\{\{totals\.total\}\}/g, this.formatMoney(data.totals.total));
    content = content.replace(/\{\{totals\.currency\}\}/g, this.getCurrencySymbol(data.totals.currency));
    content = content.replace(/\{\{interestInfo\.description\}\}/g, data.interestInfo.description);
    if (data.creditors.length > 0) {
      content = content.replace(/\{\{creditor\.name\}\}/g, data.creditors[0].name);
      content = content.replace(/\{\{creditor\.identityNo\}\}/g, data.creditors[0].identityNo || '');
      content = content.replace(/\{\{creditor\.address\}\}/g, data.creditors[0].address || '');
    }
    if (data.lawyers.length > 0) {
      content = content.replace(/\{\{lawyer\.name\}\}/g, data.lawyers[0].name);
      content = content.replace(/\{\{lawyer\.barNumber\}\}/g, data.lawyers[0].barNumber);
      content = content.replace(/\{\{lawyer\.barCity\}\}/g, data.lawyers[0].barCity);
    }
    if (data.debtors.length > 0) {
      content = content.replace(/\{\{debtor\.name\}\}/g, data.debtors[0].name);
      content = content.replace(/\{\{debtor\.identityNo\}\}/g, data.debtors[0].identityNo || '');
      content = content.replace(/\{\{debtor\.address\}\}/g, data.debtors[0].address || '');
    }
    if (data.courtInfo) {
      content = content.replace(/\{\{court\.name\}\}/g, data.courtInfo.name);
      content = content.replace(/\{\{court\.caseNumber\}\}/g, data.courtInfo.caseNumber);
      content = content.replace(/\{\{court\.decisionNumber\}\}/g, data.courtInfo.decisionNumber);
      content = content.replace(/\{\{court\.decisionDate\}\}/g, data.courtInfo.decisionDate);
    }
    return content;
  }

  private processLoops(content: string, data: TemplateData): string {
    const claimItemsRegex = /\{\{#each claimItems\}\}([\s\S]*?)\{\{\/each\}\}/g;
    content = content.replace(claimItemsRegex, (_match, template) => {
      return data.claimItems.map((item, index) => {
        let itemContent = template;
        itemContent = itemContent.replace(/\{\{@index\}\}/g, (index + 1).toString());
        itemContent = itemContent.replace(/\{\{description\}\}/g, item.description);
        itemContent = itemContent.replace(/\{\{amount\}\}/g, this.formatMoney(item.amount));
        itemContent = itemContent.replace(/\{\{currency\}\}/g, this.getCurrencySymbol(item.currency));
        return itemContent;
      }).join('\n');
    });
    const debtorsRegex = /\{\{#each debtors\}\}([\s\S]*?)\{\{\/each\}\}/g;
    content = content.replace(debtorsRegex, (_match, template) => {
      return data.debtors.map((debtor, index) => {
        let itemContent = template;
        itemContent = itemContent.replace(/\{\{@index\}\}/g, (index + 1).toString());
        itemContent = itemContent.replace(/\{\{name\}\}/g, debtor.name);
        itemContent = itemContent.replace(/\{\{identityNo\}\}/g, debtor.identityNo || '');
        itemContent = itemContent.replace(/\{\{address\}\}/g, debtor.address || '');
        itemContent = itemContent.replace(/\{\{role\}\}/g, debtor.role || 'Borclu');
        return itemContent;
      }).join('\n');
    });
    return content;
  }

  private getTemplateCode(caseType: string, subCategory: string): string {
    const mapping: Record<string, string> = {
      'ILAMSIZ_GENEL': 'ORNEK_1_ILAMSIZ', 'KAMBIYO_CEK': 'ORNEK_1_KAMBIYO_CEK', 'KAMBIYO_SENET': 'ORNEK_1_KAMBIYO_SENET',
      'CEK': 'ORNEK_1_KAMBIYO_CEK', 'SENET': 'ORNEK_1_KAMBIYO_SENET', 'ILAMLI_GENEL': 'ORNEK_1_ILAMLI',
      'ILAMLI_NAFAKA': 'ORNEK_1_NAFAKA', 'NAFAKA': 'ORNEK_1_NAFAKA', 'KIRA': 'ORNEK_1_KIRA',
    };
    return mapping[subCategory] || mapping[caseType] || 'ORNEK_1_ILAMSIZ';
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private formatMoney(amount: number): string {
    return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private getCurrencySymbol(currency: string): string {
    const symbols: Record<string, string> = { TRY: 'TL', USD: '$', EUR: 'EUR', GBP: 'GBP' };
    return symbols[currency] || currency;
  }

  private generateDefaultTakipTalebi(data: TemplateData): GeneratedDocument {
    return { title: 'TAKIP TALEBI (ORNEK 1)', content: this.renderTemplate(this.getIlamsizTemplate(), data), format: 'text', templateCode: 'ORNEK_1_DEFAULT' };
  }

  // ============================================
  // TAKIP TALEBI SABLONLARI (ORNEK 1)
  // ============================================

  private getIlamsizTemplate(): any {
    return { code: 'ORNEK_1_ILAMSIZ', name: 'Ilamsiz Takip Talebi', content: `
                              TAKIP TALEBI
                              (ORNEK NO: 1)

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU'NE

ALACAKLI        : {{creditor.name}}
                  T.C. Kimlik No: {{creditor.identityNo}}
                  Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}
                  {{lawyer.barCity}} Barosu {{lawyer.barNumber}}

BORCLU          :
{{#each debtors}}
  {{@index}}. {{name}}
     T.C./Vergi No: {{identityNo}}
     Adres: {{address}}
{{/each}}

TAKIP YOLU      : Genel Haciz Yolu ile Ilamsiz Takip

ALACAGIN TUTARI VE NEDENI:
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM ALACAK   : {{totals.total}} {{totals.currency}}

Yukarida yazili alacagin {{interestInfo.description}} tahsili icin borclu/borclular aleyhine icra takibi yapilmasini, odeme emri cikarilmasini ve tebligini talep ederim.

Takip Tarihi: {{filingDate}}

                                          Alacakli Vekili
                                          Av. {{lawyer.name}}
` };
  }

  private getKambiyoCekTemplate(): any {
    return { code: 'ORNEK_1_KAMBIYO_CEK', name: 'Kambiyo (Cek) Takip Talebi', content: `
                              TAKIP TALEBI
                              (ORNEK NO: 1)
                    KAMBIYO SENETLERINE MAHSUS HACIZ YOLU

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU'NE

ALACAKLI        : {{creditor.name}}
                  T.C. Kimlik No: {{creditor.identityNo}}
                  Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}
                  {{lawyer.barCity}} Barosu {{lawyer.barNumber}}

BORCLU          :
{{#each debtors}}
  {{@index}}. {{name}} ({{role}})
     T.C./Vergi No: {{identityNo}}
     Adres: {{address}}
{{/each}}

TAKIP YOLU      : Kambiyo Senetlerine Mahsus Haciz Yolu (IIK m.167 vd.)
DAYANAK BELGE   : Cek

ALACAGIN TUTARI VE NEDENI:
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM ALACAK   : {{totals.total}} {{totals.currency}}

Yukarida yazili cek alacaginin takip tarihinden itibaren isleyecek degisen oranlarda ticari faizi, %10 cek tazminati ve tum fer'ileri ile birlikte tahsili icin borclu/borclular aleyhine kambiyo senetlerine mahsus haciz yolu ile icra takibi yapilmasini, odeme emri cikarilmasini ve tebligini talep ederim.

Takip Tarihi: {{filingDate}}

                                          Alacakli Vekili
                                          Av. {{lawyer.name}}

EK: Cek fotokopisi
` };
  }

  private getKambiyoSenetTemplate(): any {
    return { code: 'ORNEK_1_KAMBIYO_SENET', name: 'Kambiyo (Senet) Takip Talebi', content: `
                              TAKIP TALEBI
                              (ORNEK NO: 1)
                    KAMBIYO SENETLERINE MAHSUS HACIZ YOLU

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU'NE

ALACAKLI        : {{creditor.name}}
                  T.C. Kimlik No: {{creditor.identityNo}}
                  Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}
                  {{lawyer.barCity}} Barosu {{lawyer.barNumber}}

BORCLU          :
{{#each debtors}}
  {{@index}}. {{name}} ({{role}})
     T.C./Vergi No: {{identityNo}}
     Adres: {{address}}
{{/each}}

TAKIP YOLU      : Kambiyo Senetlerine Mahsus Haciz Yolu (IIK m.167 vd.)
DAYANAK BELGE   : Bono / Emre Muharrer Senet

ALACAGIN TUTARI VE NEDENI:
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM ALACAK   : {{totals.total}} {{totals.currency}}

Yukarida yazili senet alacaginin vade tarihinden itibaren isleyecek degisen oranlarda ticari faizi ve tum fer'ileri ile birlikte tahsili icin borclu/borclular aleyhine kambiyo senetlerine mahsus haciz yolu ile icra takibi yapilmasini, odeme emri cikarilmasini ve tebligini talep ederim.

Takip Tarihi: {{filingDate}}

                                          Alacakli Vekili
                                          Av. {{lawyer.name}}

EK: Senet asli
` };
  }

  private getIlamliTemplate(): any {
    return { code: 'ORNEK_1_ILAMLI', name: 'Ilamli Takip Talebi', content: `
                              TAKIP TALEBI
                              (ORNEK NO: 1)
                           ILAMLI TAKIP

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU'NE

ALACAKLI        : {{creditor.name}}
                  T.C. Kimlik No: {{creditor.identityNo}}
                  Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}
                  {{lawyer.barCity}} Barosu {{lawyer.barNumber}}

BORCLU          :
{{#each debtors}}
  {{@index}}. {{name}}
     T.C./Vergi No: {{identityNo}}
     Adres: {{address}}
{{/each}}

TAKIP YOLU      : Ilamli Takip (IIK m.32 vd.)
DAYANAK ILAM    : ........................ Mahkemesi'nin
                  ....../....... E., ....../....... K. sayili ilami

ALACAGIN TUTARI VE NEDENI:
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM ALACAK   : {{totals.total}} {{totals.currency}}

Yukarida yazili ilam alacaginin {{interestInfo.description}} tahsili icin borclu/borclular aleyhine ilamli icra takibi yapilmasini, icra emri cikarilmasini ve tebligini talep ederim.

Takip Tarihi: {{filingDate}}

                                          Alacakli Vekili
                                          Av. {{lawyer.name}}

EK: Ilam sureti
` };
  }

  private getNafakaTemplate(): any {
    return { code: 'ORNEK_1_NAFAKA', name: 'Nafaka Takip Talebi', content: `
                              TAKIP TALEBI
                              (ORNEK NO: 1)
                         NAFAKA ALACAGI TAKIBI

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU'NE

ALACAKLI        : {{creditor.name}}
                  T.C. Kimlik No: {{creditor.identityNo}}
                  Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}
                  {{lawyer.barCity}} Barosu {{lawyer.barNumber}}

BORCLU          : {{debtor.name}}
                  T.C. Kimlik No: {{debtor.identityNo}}
                  Adres: {{debtor.address}}

TAKIP YOLU      : Ilamli Takip - Nafaka Alacagi (IIK m.32 vd.)
DAYANAK ILAM    : ........................ Aile Mahkemesi'nin
                  ....../....... E., ....../....... K. sayili nafaka ilami

ALACAGIN TUTARI VE NEDENI:
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM NAFAKA ALACAGI: {{totals.total}} {{totals.currency}}

Yukarida yazili birikmis nafaka alacaginin ve devam eden aylik nafaka bedellerinin tahsili icin borclu aleyhine ilamli icra takibi yapilmasini, icra emri cikarilmasini ve tebligini talep ederim.

Takip Tarihi: {{filingDate}}

                                          Alacakli Vekili
                                          Av. {{lawyer.name}}

EK: Nafaka ilami sureti
` };
  }

  private getKiraTemplate(): any {
    return { code: 'ORNEK_1_KIRA', name: 'Kira Alacagi Takip Talebi', content: `
                              TAKIP TALEBI
                              (ORNEK NO: 1)
                         KIRA ALACAGI TAKIBI

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU'NE

ALACAKLI (KIRAYA VEREN): {{creditor.name}}
                         T.C. Kimlik No: {{creditor.identityNo}}
                         Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}
                  {{lawyer.barCity}} Barosu {{lawyer.barNumber}}

BORCLU (KIRACI) : {{debtor.name}}
                  T.C. Kimlik No: {{debtor.identityNo}}
                  Adres: {{debtor.address}}

TAKIP YOLU      : Genel Haciz Yolu ile Ilamsiz Takip - Kira Alacagi
KIRALANAN       : ................................................

ALACAGIN TUTARI VE NEDENI:
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM KIRA ALACAGI: {{totals.total}} {{totals.currency}}

Yukarida yazili kira alacaginin {{interestInfo.description}} tahsili icin borclu aleyhine icra takibi yapilmasini, odeme emri cikarilmasini ve tebligini talep ederim.

Takip Tarihi: {{filingDate}}

                                          Alacakli Vekili
                                          Av. {{lawyer.name}}

EK: Kira sozlesmesi sureti
` };
  }

  // ============================================
  // ODEME EMRI SABLONLARI (ORNEK 7)
  // ============================================

  private getOdemeEmriIlamsizTemplate(): any {
    return { code: 'ORNEK_7_ILAMSIZ', name: 'Ilamsiz Odeme Emri', content: `
                              ODEME EMRI
                              (ORNEK NO: 7)

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU

DOSYA NO        : {{executionNumber}}

ALACAKLI        : {{creditor.name}}
                  Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}

BORCLU          : {{debtor.name}}
                  T.C. Kimlik No: {{debtor.identityNo}}
                  Adres: {{debtor.address}}

ALACAGIN TUTARI :
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM          : {{totals.total}} {{totals.currency}}

                              *****

Yukarda yazili borcun ve takip giderlerinin isbu odeme emrinin tebliginden itibaren {{paymentDeadline}} icinde odenmesi, borca itiraziniz varsa ayni sure icinde icra dairesine bildirmeniz, mal beyaninda bulunmaniz, aksi halde hapisle tazyik olunacaginiz, borcun odenmemesi ve itiraz edilmemesi halinde cebri icraya devam edilecegi ihtar olunur.

Teblig Tarihi: ....../....../..........

                                          Icra Muduru
                                          Imza - Muhur
` };
  }

  private getOdemeEmriKambiyoTemplate(): any {
    return { code: 'ORNEK_7_KAMBIYO', name: 'Kambiyo Odeme Emri', content: `
                              ODEME EMRI
                              (ORNEK NO: 10)
                    KAMBIYO SENETLERINE MAHSUS HACIZ YOLU

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU

DOSYA NO        : {{executionNumber}}

ALACAKLI        : {{creditor.name}}
                  Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}

BORCLU          :
{{#each debtors}}
  {{@index}}. {{name}} ({{role}})
     T.C./Vergi No: {{identityNo}}
     Adres: {{address}}
{{/each}}

ALACAGIN TUTARI :
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM          : {{totals.total}} {{totals.currency}}

                              *****

Yukarda yazili borcun ve takip giderlerinin isbu odeme emrinin tebliginden itibaren 10 GUN icinde odenmesi, takibin dayanagi olan kambiyo senedindeki imzanin size ait olmadigina veya borcun odenmis ya da ertelenmis olduguna dair itiraziniz varsa ayni sure icinde icra mahkemesine bildirmeniz, aksi halde cebri icraya devam edilecegi ve mal beyaninda bulunmaniz gerektigi ihtar olunur.

Teblig Tarihi: ....../....../..........

                                          Icra Muduru
                                          Imza - Muhur
` };
  }

  // ============================================
  // ICRA EMRI SABLONLARI (ORNEK 4-5)
  // ============================================

  private getIcraEmriTemplate(): any {
    return { code: 'ORNEK_4_ILAMLI', name: 'Ilamli Icra Emri', content: `
                              ICRA EMRI
                              (ORNEK NO: 4-5)

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU

DOSYA NO        : {{executionNumber}}

ALACAKLI        : {{creditor.name}}
                  Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}

BORCLU          : {{debtor.name}}
                  T.C. Kimlik No: {{debtor.identityNo}}
                  Adres: {{debtor.address}}

DAYANAK ILAM    : {{court.name}}
                  {{court.caseNumber}} E., {{court.decisionNumber}} K.
                  Karar Tarihi: {{court.decisionDate}}

ALACAGIN TUTARI :
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM          : {{totals.total}} {{totals.currency}}

                              *****

Yukarda yazili ilam alacaginin ve takip giderlerinin isbu icra emrinin tebliginden itibaren 7 GUN icinde odenmesi, bu sure icinde borcun odenmemesi halinde cebri icraya devam edilecegi ve mal beyaninda bulunmaniz gerektigi ihtar olunur.

Teblig Tarihi: ....../....../..........

                                          Icra Muduru
                                          Imza - Muhur
` };
  }

  private getIcraEmriNafakaTemplate(): any {
    return { code: 'ORNEK_5_NAFAKA', name: 'Nafaka Icra Emri', content: `
                              ICRA EMRI
                              (ORNEK NO: 5)
                         NAFAKA ALACAGI

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU

DOSYA NO        : {{executionNumber}}

ALACAKLI        : {{creditor.name}}
                  Adres: {{creditor.address}}

VEKILI          : Av. {{lawyer.name}}

BORCLU          : {{debtor.name}}
                  T.C. Kimlik No: {{debtor.identityNo}}
                  Adres: {{debtor.address}}

DAYANAK ILAM    : ........................ Aile Mahkemesi'nin
                  ....../....... E., ....../....... K. sayili nafaka ilami

NAFAKA ALACAGI  :
{{#each claimItems}}
  {{@index}}. {{description}}: {{amount}} {{currency}}
{{/each}}

TOPLAM          : {{totals.total}} {{totals.currency}}

                              *****

Yukarda yazili nafaka alacaginin ve takip giderlerinin isbu icra emrinin tebliginden itibaren 7 GUN icinde odenmesi, bu sure icinde borcun odenmemesi halinde IIK m.344 geregince 3 aya kadar tazyik hapsi ile cezalandirilacaginiz ve cebri icraya devam edilecegi ihtar olunur.

Teblig Tarihi: ....../....../..........

                                          Icra Muduru
                                          Imza - Muhur
` };
  }

  // ============================================
  // HACIZ TUTANAGI
  // ============================================

  private getHacizTutanagiTemplate(): any {
    return { code: 'HACIZ_TUTANAGI', name: 'Haciz Tutanagi', content: `
                              HACIZ TUTANAGI

{{executionOffice.city}} {{executionOffice.name}} MUDURLUGU

DOSYA NO        : {{executionNumber}}
HACIZ TARIHI    : {{filingDate}}
HACIZ SAATI     : .....:......

ALACAKLI        : {{creditor.name}}
VEKILI          : Av. {{lawyer.name}}

BORCLU          : {{debtor.name}}
                  Adres: {{debtor.address}}

HACIZ MAHALLI   : ................................................

                              *****

Yukarda kimlik ve adresi yazili borclunun borcundan dolayi haciz mahallinde asagida yazili mallari haczedilmistir:

HACZEDILEN MALLAR:

  Sira  Mal Cinsi ve Ozellikleri                    Takdir Edilen Deger
  ----  ------------------------------------------  --------------------
  1.    ............................................  ................. TL
  2.    ............................................  ................. TL
  3.    ............................................  ................. TL

TOPLAM DEGER    : ................. TL

                              *****

Haczedilen mallar yediemin olarak asagida imzasi bulunan kisiye teslim edilmistir.

YEDIEMIN        : ................................................
                  T.C. Kimlik No: ................................
                  Adres: ..........................................

Yediemin, haczedilen mallari koruyacagini, muhafaza edecegini ve istendiginde teslim edecegini kabul ve taahhut etmistir.

Isbu tutanak mahallinde tanzim edilmis ve ilgililere okunarak imza altina alinmistir.

Haciz Memuru: ......................    Alacakli Vekili: ......................

Borclu: ............................    Yediemin: ..............................

                                          Icra Muduru
                                          Imza - Muhur
` };
  }

  // ============================================
  // PDF, WORD VE UDF EXPORT FONKSİYONLARI
  // ============================================

  /**
   * Takip Talebi'ni PDF olarak oluştur
   */
  async generateTakipTalebiPdf(data: TemplateData): Promise<Buffer> {
    const doc = this.generateTakipTalebi(data);
    return this.textToPdf(doc.content, doc.title);
  }

  /**
   * Takip Talebi'ni Word (DOCX) olarak oluştur
   */
  async generateTakipTalebiWord(data: TemplateData): Promise<Buffer> {
    const doc = this.generateTakipTalebi(data);
    return this.textToWord(doc.content, doc.title);
  }

  /**
   * Takip Talebi'ni UDF (UYAP Document Format) olarak oluştur
   */
  generateTakipTalebiUdf(data: TemplateData): UdfDocument {
    return this.createUdfDocument(data, 'TAKIP_TALEBI', 'ORNEK_1');
  }

  /**
   * Case ID'den PDF oluştur
   */
  async generatePdfFromCase(caseId: string, documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri'): Promise<Buffer> {
    const caseData = await this.getCaseData(caseId);
    let doc: GeneratedDocument;
    
    switch (documentType) {
      case 'takip-talebi':
        doc = this.generateTakipTalebi(caseData);
        break;
      case 'odeme-emri':
        doc = this.generateOdemeEmri(caseData);
        break;
      case 'icra-emri':
        doc = this.generateIcraEmri(caseData);
        break;
      default:
        doc = this.generateTakipTalebi(caseData);
    }
    
    return this.textToPdf(doc.content, doc.title);
  }

  /**
   * Case ID'den Word oluştur
   */
  async generateWordFromCase(caseId: string, documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri'): Promise<Buffer> {
    const caseData = await this.getCaseData(caseId);
    let doc: GeneratedDocument;
    
    switch (documentType) {
      case 'takip-talebi':
        doc = this.generateTakipTalebi(caseData);
        break;
      case 'odeme-emri':
        doc = this.generateOdemeEmri(caseData);
        break;
      case 'icra-emri':
        doc = this.generateIcraEmri(caseData);
        break;
      default:
        doc = this.generateTakipTalebi(caseData);
    }
    
    return this.textToWord(doc.content, doc.title);
  }

  /**
   * Case ID'den UDF oluştur (UYAP için)
   */
  async generateUdfFromCase(caseId: string, documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri'): Promise<UdfDocument> {
    const caseData = await this.getCaseData(caseId);
    
    const documentCodeMap: Record<string, string> = {
      'takip-talebi': 'ORNEK_1',
      'odeme-emri': 'ORNEK_7',
      'icra-emri': 'ORNEK_4',
    };
    
    const documentTypeMap: Record<string, string> = {
      'takip-talebi': 'TAKIP_TALEBI',
      'odeme-emri': 'ODEME_EMRI',
      'icra-emri': 'ICRA_EMRI',
    };
    
    return this.createUdfDocument(
      caseData, 
      documentTypeMap[documentType] || 'TAKIP_TALEBI',
      documentCodeMap[documentType] || 'ORNEK_1'
    );
  }

  /**
   * Text içeriğini PDF'e dönüştür
   */
  private async textToPdf(content: string, title: string): Promise<Buffer> {
    const fonts: TFontDictionary = {
      Courier: {
        normal: 'Courier',
        bold: 'Courier-Bold',
        italics: 'Courier-Oblique',
        bolditalics: 'Courier-BoldOblique'
      }
    };

    const printer = new PdfPrinter(fonts);
    
    // İçeriği satırlara böl
    const lines = content.split('\n');
    const docContent: any[] = [];
    
    // Başlık
    docContent.push({
      text: title,
      style: 'header',
      alignment: 'center',
      margin: [0, 0, 0, 20]
    });
    
    // İçerik satırları
    lines.forEach(line => {
      docContent.push({
        text: line || ' ',
        style: 'content',
        preserveLeadingSpaces: true
      });
    });

    const docDefinition: TDocumentDefinitions = {
      content: docContent,
      styles: {
        header: {
          fontSize: 14,
          bold: true,
          font: 'Courier'
        },
        content: {
          fontSize: 10,
          font: 'Courier'
        }
      },
      defaultStyle: {
        font: 'Courier'
      },
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60] as [number, number, number, number]
    };

    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const chunks: Buffer[] = [];
        
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
        
        pdfDoc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Text içeriğini Word (DOCX) dosyasına dönüştür
   */
  private async textToWord(content: string, title: string): Promise<Buffer> {
    const lines = content.split('\n');
    const paragraphs: Paragraph[] = [];
    
    // Başlık
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 28, // 14pt
            font: 'Courier New'
          })
        ],
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 400 }
      })
    );
    
    // İçerik satırları
    lines.forEach(line => {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line || ' ',
              size: 20, // 10pt
              font: 'Courier New'
            })
          ],
          spacing: { line: 240 } // Single line spacing
        })
      );
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: paragraphs
      }]
    });

    return Packer.toBuffer(doc);
  }

  /**
   * UDF (UYAP Document Format) belgesi oluştur
   */
  private createUdfDocument(data: TemplateData, documentType: string, documentCode: string): UdfDocument {
    const now = new Date().toISOString();
    
    return {
      version: '1.0',
      documentType,
      documentCode,
      createdAt: now,
      metadata: {
        fileNumber: data.fileNumber,
        executionOfficeCode: data.executionOffice.uyapCode,
        caseType: data.caseType,
        subCategory: data.subCategory
      },
      content: {
        sections: [
          {
            type: 'HEADER',
            title: 'Takip Bilgileri',
            data: {
              fileNumber: data.fileNumber,
              filingDate: data.filingDate,
              executionNumber: data.executionNumber,
              executionOffice: data.executionOffice,
              executionPath: data.executionPath
            }
          },
          {
            type: 'CREDITORS',
            title: 'Alacaklılar',
            data: {
              creditors: data.creditors
            }
          },
          {
            type: 'LAWYERS',
            title: 'Vekiller',
            data: {
              lawyers: data.lawyers
            }
          },
          {
            type: 'DEBTORS',
            title: 'Borçlular',
            data: {
              debtors: data.debtors
            }
          },
          {
            type: 'CLAIMS',
            title: 'Alacak Kalemleri',
            data: {
              claimItems: data.claimItems,
              totals: data.totals
            }
          },
          {
            type: 'INTEREST',
            title: 'Faiz Bilgileri',
            data: {
              interestInfo: data.interestInfo
            }
          },
          ...(data.sourceDocument ? [{
            type: 'SOURCE_DOCUMENT',
            title: 'Dayanak Belge',
            data: {
              sourceDocument: data.sourceDocument
            }
          }] : []),
          ...(data.courtInfo ? [{
            type: 'COURT_INFO',
            title: 'Mahkeme Bilgileri',
            data: {
              courtInfo: data.courtInfo
            }
          }] : [])
        ]
      },
      signature: data.lawyers.length > 0 ? {
        lawyerBarNumber: data.lawyers[0].barNumber,
        lawyerName: data.lawyers[0].name,
        timestamp: now
      } : undefined
    };
  }
}
