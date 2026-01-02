import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeeEngineService } from '../fee-engine/fee-engine.service';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';

// pdfmake için dinamik import kullanacağız
let PdfPrinter: any = null;
async function getPdfPrinter() {
  if (!PdfPrinter) {
    const pdfmake = await import('pdfmake');
    PdfPrinter = pdfmake.default || pdfmake;
  }
  return PdfPrinter;
}

export interface TemplateData {
  fileNumber: string;
  filingDate: string;
  executionNumber?: string;
  executionOffice: { name: string; city: string; uyapCode?: string };
  creditors: Array<{ 
    type: 'INDIVIDUAL' | 'COMPANY'; 
    name: string; 
    identityNo?: string; 
    taxNo?: string; 
    address?: string;
    city?: string;
    district?: string;
  }>;
  lawyers: Array<{ 
    name: string; 
    barNumber: string; 
    barCity: string; 
    address?: string; 
    phone?: string; 
    fax?: string; 
    bankName?: string;
    branchName?: string;
    iban?: string;
  }>;
  debtors: Array<{ 
    type: 'INDIVIDUAL' | 'COMPANY'; 
    name: string; 
    identityNo?: string; 
    taxNo?: string; 
    address?: string; 
    role?: string;
    city?: string;
    district?: string;
  }>;
  claimItems: Array<{ 
    type: string; 
    description: string; 
    amount: number; 
    currency: string; 
    dueDate?: string; 
    interestType?: string; 
    interestAmount?: number;
    interestStartDate?: string;
  }>;
  totals: { principal: number; interest: number; fees: number; total: number; currency: string };
  interestInfo: { type: 'YASAL' | 'TICARI' | 'CUSTOM'; rate?: number; description: string; variableRate: boolean };
  caseType: string;
  subCategory: string;
  executionPath: string;
  // Kambiyo (Çek/Senet) bilgileri
  instrumentInfo?: { 
    type: 'CEK' | 'SENET';
    serialNo?: string;            // Çek seri numarası
    instrumentNo?: string;        // Çek/Senet numarası
    issueDate?: string;           // Keşide/Düzenleme tarihi
    dueDate?: string;             // Vade tarihi
    presentationDate?: string;    // İbraz tarihi (çek için)
    bankName?: string;            // Banka adı
    branchName?: string;          // Şube adı
    drawerName?: string;          // Keşideci
    endorsers?: string[];         // Cirantalar
    amount?: string;              // Tutar (formatlanmış)
    currency?: string;            // Para birimi
    amountText?: string;          // Tutar yazıyla (Birmilyon Türk Lirası)
    issuePlace?: string;          // Tanzim yeri
    bounceAmount?: string;        // Karşılıksız tutar
    isBounced?: boolean;          // Karşılıksız mı
    bounceDate?: string;          // Karşılıksız tarihi
  };
  // İlam bilgileri
  courtInfo?: { 
    name: string;                 // Mahkeme adı
    caseNumber: string;           // Esas numarası
    decisionNumber: string;       // Karar numarası
    decisionDate: string;         // Karar tarihi
    summary?: string;             // İlam özeti
  };
  // Kira bilgileri
  leaseInfo?: { 
    leaseType: string;            // "6 Aydan Çok Adi Kira", "6 Aydan Az Adi Kira", "Hasılat Kirası"
    yearlyRent: string;           // Yıllık kira bedeli
    contractType: string;         // "Yazılı", "Sözlü"
    propertyAddress: string;      // Kiralanan taşınmaz adresi
    startDate?: string;           // Kira başlangıç tarihi
    endDate?: string;             // Kira bitiş tarihi
  };
  // Rehin/İpotek bilgileri
  collateralInfo?: {
    type: 'REHIN' | 'IPOTEK';
    description: string;          // Rehnedilen mal/taşınmaz
    ownerName?: string;           // Malik adı (3. kişi ise)
    subsequentCreditor?: string;  // Sonra gelen rehin hakkı sahibi
    subsequentAddress?: string;
  };
  // Tereke bilgileri
  estateInfo?: {
    deceasedName: string;
    heirs: Array<{ name: string; address: string }>;
  };
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

  constructor(
    private prisma: PrismaService,
    private feeEngine: FeeEngineService,
  ) {
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
    // Karşılıksız Çek Şikayeti
    this.templates.set('KARSILIKSIZ_CEK_SIKAYET', this.getKarsiliksizCekSikayetTemplate());
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
      // Ceza Davaları
      { code: 'KARSILIKSIZ_CEK_SIKAYET', name: 'Karşılıksız Çek Şikayet Dilekçesi', category: 'Ceza Davaları' },
      { code: 'DOLANDIRICILIK_SUC_DUYURUSU', name: 'Dolandırıcılık Suç Duyurusu', category: 'Ceza Davaları' },
      { code: 'GUVENI_KOTUYE_KULLANMA', name: 'Güveni Kötüye Kullanma Şikayeti', category: 'Ceza Davaları' },
      // Hukuk Davaları
      { code: 'ITIRAZIN_IPTALI', name: 'İtirazın İptali Dava Dilekçesi', category: 'Hukuk Davaları' },
      { code: 'ITIRAZIN_KALDIRILMASI', name: 'İtirazın Kaldırılması Dilekçesi', category: 'Hukuk Davaları' },
      { code: 'TASARRUFUN_IPTALI', name: 'Tasarrufun İptali Dava Dilekçesi', category: 'Hukuk Davaları' },
      { code: 'MENFI_TESPIT', name: 'Menfi Tespit Dava Dilekçesi', category: 'Hukuk Davaları' },
    ];
  }

  private async getCaseData(caseId: string): Promise<TemplateData> {
    const caseRecord = await (this.prisma as any).case.findUnique({
      where: { id: caseId },
      include: { 
        executionOffice: true, 
        caseClients: { include: { client: true } }, 
        lawyers: { include: { lawyer: true } }, 
        debtors: { 
          include: { 
            debtor: {
              include: {
                debtorAddresses: true,
                estateHeirs: true,
              }
            },
            selectedAddress: true,
          } 
        }, 
        dues: true,
        claimItems: true,
      },
    });
    if (!caseRecord) throw new Error('Dosya bulunamadi');
    
    // Alacak kalemleri - önce claimItems, yoksa dues, yoksa boş array
    const rawClaimItems = caseRecord.claimItems?.length > 0 ? caseRecord.claimItems : (caseRecord.dues?.length > 0 ? caseRecord.dues : []);
    const claimItems = rawClaimItems.map((item: any) => ({ 
      type: item.type || 'PRINCIPAL', 
      description: item.description || 'Asıl Alacak', 
      amount: Number(item.amount) || 0, 
      currency: item.currency || 'TRY', 
      dueDate: item.dueDate?.toISOString().split('T')[0],
      interestType: item.interestType || 'YASAL',
      interestAmount: item.interestAmount ? Number(item.interestAmount) : undefined,
      interestStartDate: item.interestStartDate?.toISOString().split('T')[0],
    }));
    
    // Eğer alacak kalemi yoksa, principalAmount'tan oluştur
    if (claimItems.length === 0 && caseRecord.principalAmount) {
      claimItems.push({
        type: 'PRINCIPAL',
        description: 'Asıl Alacak',
        amount: Number(caseRecord.principalAmount),
        currency: caseRecord.currency || 'TRY',
        dueDate: caseRecord.startDate?.toISOString().split('T')[0],
        interestType: caseRecord.interestType || 'YASAL',
      });
    }
    
    const principal = claimItems.filter((i: any) => ['PRINCIPAL', 'ASIL_ALACAK', 'KIRA_ALACAGI'].includes(i.type)).reduce((sum: number, i: any) => sum + i.amount, 0) || Number(caseRecord.principalAmount) || 0;
    const interest = claimItems.filter((i: any) => ['INTEREST', 'ISLEMIS_FAIZ'].includes(i.type)).reduce((sum: number, i: any) => sum + i.amount, 0);
    const fees = claimItems.filter((i: any) => ['FEE', 'POSTAGE', 'STAMP', 'EXPENSE', 'MASRAF'].includes(i.type)).reduce((sum: number, i: any) => sum + i.amount, 0);
    
    // Kira bilgilerini çek
    let leaseInfo: TemplateData['leaseInfo'] = undefined;
    if (caseRecord.subCategory === 'KIRA' || caseRecord.type === 'KIRA') {
      const lease = await (this.prisma as any).caseLease.findFirst({ where: { caseId } });
      if (lease) {
        leaseInfo = {
          leaseType: lease.leaseType || '6 Aydan Çok Adi Kira',
          yearlyRent: this.formatMoney(Number(lease.yearlyRent || 0)),
          contractType: lease.contractType || 'Yazılı',
          propertyAddress: lease.propertyAddress || '',
          startDate: lease.startDate?.toISOString().split('T')[0],
          endDate: lease.endDate?.toISOString().split('T')[0],
        };
      }
    }
    
    // İlam bilgilerini çek
    let courtInfo: TemplateData['courtInfo'] = undefined;
    if (['ILAMLI', 'NAFAKA'].includes(caseRecord.type) || ['ILAMLI', 'NAFAKA'].includes(caseRecord.subCategory)) {
      const judgment = await (this.prisma as any).caseJudgment.findFirst({ where: { caseId } });
      if (judgment) {
        courtInfo = {
          name: judgment.courtName || '',
          caseNumber: judgment.caseNumber || '',
          decisionNumber: judgment.decisionNumber || '',
          decisionDate: judgment.decisionDate?.toISOString().split('T')[0] || '',
          summary: judgment.summary,
        };
      }
    }
    
    // Çek/Senet bilgilerini çek
    let instrumentInfo: TemplateData['instrumentInfo'] = undefined;
    if (['CEK', 'SENET', 'KAMBIYO_CEK', 'KAMBIYO_SENET'].includes(caseRecord.subCategory) || ['CHECK', 'BOND'].includes(caseRecord.type)) {
      const instrument = await (this.prisma as any).caseInstrument.findFirst({ where: { caseId } });
      if (instrument) {
        // Tutarı yazıyla ifade et
        const amountText = this.numberToWords(Number(instrument.amount || 0));
        
        instrumentInfo = {
          type: instrument.instrumentType || 'CEK',
          serialNo: instrument.serialNo || instrument.instrumentNo,
          instrumentNo: instrument.instrumentNo,
          issueDate: instrument.issueDate?.toISOString().split('T')[0],
          dueDate: instrument.maturityDate?.toISOString().split('T')[0] || instrument.dueDate?.toISOString().split('T')[0],
          presentationDate: instrument.presentmentDate?.toISOString().split('T')[0] || instrument.presentationDate?.toISOString().split('T')[0],
          bankName: instrument.bankName,
          branchName: instrument.bankBranch || instrument.branchName,
          drawerName: instrument.drawerName,
          endorsers: instrument.endorsers,
          amount: this.formatMoney(Number(instrument.amount || 0)),
          currency: instrument.currency || 'TRY',
          amountText: amountText,
          issuePlace: instrument.issuePlace || instrument.bankName || '',
          bounceAmount: this.formatMoney(Number(instrument.amount || 0)),
          isBounced: instrument.isBounced,
          bounceDate: instrument.bounceDate?.toISOString().split('T')[0],
        };
      }
    }
    
    // Rehin/İpotek bilgilerini çek
    let collateralInfo: TemplateData['collateralInfo'] = undefined;
    if (caseRecord.executionPath === 'REHIN' || caseRecord.hasCollateral) {
      const collateral = await (this.prisma as any).caseCollateral.findFirst({ where: { caseId } });
      if (collateral) {
        collateralInfo = {
          type: collateral.collateralType || 'REHIN',
          description: collateral.description || '',
          ownerName: collateral.ownerName,
          subsequentCreditor: collateral.subsequentCreditor,
          subsequentAddress: collateral.subsequentAddress,
        };
      }
    }
    
    return {
      fileNumber: caseRecord.fileNumber,
      filingDate: caseRecord.startDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      executionNumber: caseRecord.executionNumber,
      executionOffice: { name: caseRecord.executionOffice?.name || '', city: caseRecord.executionOffice?.city || '', uyapCode: caseRecord.executionOffice?.uyapCode },
      creditors: (caseRecord.caseClients || []).map((c: any) => ({ 
        type: c.client?.type || 'INDIVIDUAL', 
        name: c.client?.displayName || c.client?.name || '', 
        identityNo: c.client?.tckn, 
        taxNo: c.client?.vkn, 
        address: c.client?.address,
        city: c.client?.city,
        district: c.client?.district,
      })),
      lawyers: (caseRecord.lawyers || []).map((l: any) => ({ 
        name: `Av.${l.lawyer?.name || ''} ${l.lawyer?.surname || ''}`.trim(), 
        barNumber: l.lawyer?.barNumber || '', 
        barCity: l.lawyer?.barCity || '', 
        address: l.lawyer?.address,
        phone: l.lawyer?.phone,
        fax: l.lawyer?.fax,
        bankName: l.lawyer?.bankName,
        branchName: l.lawyer?.branchName,
        iban: l.lawyer?.iban,
      })),
      debtors: (caseRecord.debtors || []).map((d: any) => {
        // Borçlu adresi: önce seçili adres, yoksa ana adres, yoksa ilk adres
        let debtorAddress = '';
        let debtorCity = '';
        let debtorDistrict = '';
        
        // 1. Seçili adres varsa onu kullan
        if (d.selectedAddress) {
          debtorAddress = d.selectedAddress.street || '';
          debtorCity = d.selectedAddress.city || '';
          debtorDistrict = d.selectedAddress.district || '';
        } 
        // 2. Borçlunun adresleri varsa
        else if (d.debtor?.debtorAddresses?.length > 0) {
          // Ana adresi bul
          const primaryAddr = d.debtor.debtorAddresses.find((a: any) => a.isPrimary);
          const addr = primaryAddr || d.debtor.debtorAddresses[0];
          debtorAddress = addr.street || '';
          debtorCity = addr.city || '';
          debtorDistrict = addr.district || '';
        }
        
        return { 
          type: d.debtor?.type || 'INDIVIDUAL', 
          name: d.debtor?.displayName || d.debtor?.name || '', 
          identityNo: d.debtor?.tckn || d.debtor?.identityNo, 
          taxNo: d.debtor?.vkn, 
          address: debtorAddress, 
          role: this.getDebtorRoleLabel(d.role),
          city: debtorCity,
          district: debtorDistrict,
        };
      }),
      claimItems, 
      totals: { principal, interest, fees, total: principal + interest + fees, currency: caseRecord.currency || 'TRY' },
      interestInfo: this.determineInterestInfo(caseRecord),
      caseType: caseRecord.type || 'ILAMSIZ', 
      subCategory: caseRecord.subCategory || 'GENEL', 
      executionPath: caseRecord.executionPath || 'HACIZ',
      leaseInfo,
      courtInfo,
      instrumentInfo,
      collateralInfo,
    };
  }
  
  private getDebtorRoleLabel(role: string): string {
    const roleLabels: Record<string, string> = {
      'ASIL_BORCLU': 'Asıl Borçlu',
      'KEFIL': 'Kefil',
      'MUSTEREN_BORCLU': 'Müşterek Borçlu',
      'MIRASCI': 'Mirasçı',
      'KEŞIDECI': 'Keşideci',
      'CIRANTA': 'Ciranta',
      'AVALCI': 'Avalcı',
    };
    return roleLabels[role] || role || 'Borçlu';
  }

  /**
   * Faiz türünü belirle - takip türüne göre otomatik
   * Fatura, ticari alacak, çek, senet → TİCARİ FAİZ
   * Diğerleri → YASAL FAİZ
   */
  private determineInterestInfo(caseRecord: any): TemplateData['interestInfo'] {
    const currency = caseRecord.currency || 'TRY';
    
    // 1. Eğer kayıtta açıkça belirtilmişse onu kullan
    if (caseRecord.interestType && caseRecord.interestType !== 'YASAL') {
      const rate = this.feeEngine.getInterestRate(currency, caseRecord.interestType);
      return {
        type: caseRecord.interestType,
        rate,
        description: caseRecord.interestDescription || this.getInterestDescription(caseRecord.interestType, rate, currency),
        variableRate: true,
      };
    }
    
    // 2. Takip türüne göre otomatik belirle
    const subCategory = caseRecord.subCategory || '';
    const caseType = caseRecord.type || '';
    
    // Ticari faiz gerektiren durumlar:
    // - Çek takibi (CHECK)
    // - Senet takibi (BOND)
    // - Fatura alacağı (subCategory: FATURA veya CARI_HESAP)
    // - Kambiyo senetleri
    const ticariCaseTypes = ['CHECK', 'BOND', 'KAMBIYO'];
    const ticariSubCategories = ['FATURA', 'CEK', 'SENET', 'KAMBIYO_CEK', 'KAMBIYO_SENET', 'CARI_HESAP', 'TICARI'];
    
    const isTicari = ticariCaseTypes.includes(caseType) || ticariSubCategories.includes(subCategory);
    
    if (isTicari) {
      const rate = this.feeEngine.getInterestRate(currency, 'TICARI');
      return {
        type: 'TICARI',
        rate,
        description: caseRecord.interestDescription || this.getInterestDescription('TICARI', rate, currency),
        variableRate: true,
      };
    }
    
    // 3. Varsayılan: Yasal faiz
    const rate = this.feeEngine.getInterestRate(currency, 'YASAL');
    return {
      type: caseRecord.interestType || 'YASAL',
      rate,
      description: caseRecord.interestDescription || this.getInterestDescription('YASAL', rate, currency),
      variableRate: true,
    };
  }
  
  /**
   * Faiz türüne göre açıklama metni - oran ve para birimi ile
   */
  private getInterestDescription(interestType: string, rate: number, currency: string): string {
    const currencyLabel = currency === 'TRY' ? '' : ` (${currency})`;
    const typeLabel = interestType === 'TICARI' ? 'TİCARİ' : (interestType === 'YASAL' ? 'YASAL' : interestType);
    return `YILLIK %${rate.toFixed(2).replace('.', ',')} (${typeLabel})${currencyLabel} değişen oranlarda`;
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
      content = content.replace(/\{\{creditor\.taxNo\}\}/g, data.creditors[0].taxNo || '');
      content = content.replace(/\{\{creditor\.address\}\}/g, data.creditors[0].address || '');
    }
    if (data.lawyers.length > 0) {
      content = content.replace(/\{\{lawyer\.name\}\}/g, data.lawyers[0].name);
      content = content.replace(/\{\{lawyer\.barNumber\}\}/g, data.lawyers[0].barNumber);
      content = content.replace(/\{\{lawyer\.barCity\}\}/g, data.lawyers[0].barCity);
      content = content.replace(/\{\{lawyer\.address\}\}/g, data.lawyers[0].address || '');
      content = content.replace(/\{\{lawyer\.phone\}\}/g, data.lawyers[0].phone || '');
      content = content.replace(/\{\{lawyer\.fax\}\}/g, data.lawyers[0].fax || '');
      // Banka bilgisi formatı: BANKA ADI ŞUBE İBAN: TR...
      const bankInfo = data.lawyers[0].bankName && data.lawyers[0].iban 
        ? `${data.lawyers[0].bankName} İBAN: ${data.lawyers[0].iban}` 
        : '';
      content = content.replace(/\{\{lawyer\.bankInfo\}\}/g, bankInfo);
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
      content = content.replace(/\{\{court\.decisionDate\}\}/g, this.formatDate(data.courtInfo.decisionDate));
      content = content.replace(/\{\{court\.summary\}\}/g, data.courtInfo.summary || '');
    } else {
      // İlam bilgisi yoksa boş bırak
      content = content.replace(/\{\{court\.name\}\}/g, '');
      content = content.replace(/\{\{court\.caseNumber\}\}/g, '');
      content = content.replace(/\{\{court\.decisionNumber\}\}/g, '');
      content = content.replace(/\{\{court\.decisionDate\}\}/g, '');
      content = content.replace(/\{\{court\.summary\}\}/g, '');
    }
    // Kira bilgileri
    if (data.leaseInfo) {
      content = content.replace(/\{\{leaseInfo\.leaseType\}\}/g, data.leaseInfo.leaseType || '');
      content = content.replace(/\{\{leaseInfo\.yearlyRent\}\}/g, data.leaseInfo.yearlyRent || '');
      content = content.replace(/\{\{leaseInfo\.contractType\}\}/g, data.leaseInfo.contractType || '');
      content = content.replace(/\{\{leaseInfo\.propertyAddress\}\}/g, data.leaseInfo.propertyAddress || '');
    }
    // Takip yolu
    const executionPathLabels: Record<string, string> = {
      'HACIZ': 'HACİZ',
      'HACIZ_TAHLIYE': 'HACİZ, TAHLİYE',
      'TAHLIYE': 'TAHLİYE',
      'IFLAS': 'İFLAS',
      'REHIN': 'REHİN',
    };
    content = content.replace(/\{\{executionPath\}\}/g, executionPathLabels[data.executionPath] || data.executionPath);
    
    // Çek/Senet (instrument) bilgileri
    if (data.instrumentInfo) {
      content = content.replace(/\{\{instrument\.serialNo\}\}/g, data.instrumentInfo.serialNo || '');
      content = content.replace(/\{\{instrument\.instrumentNo\}\}/g, data.instrumentInfo.instrumentNo || '');
      content = content.replace(/\{\{instrument\.issueDate\}\}/g, this.formatDate(data.instrumentInfo.issueDate || ''));
      content = content.replace(/\{\{instrument\.dueDate\}\}/g, this.formatDate(data.instrumentInfo.dueDate || ''));
      content = content.replace(/\{\{instrument\.presentationDate\}\}/g, this.formatDate(data.instrumentInfo.presentationDate || ''));
      content = content.replace(/\{\{instrument\.bankName\}\}/g, data.instrumentInfo.bankName || '');
      content = content.replace(/\{\{instrument\.branchName\}\}/g, data.instrumentInfo.branchName || '');
      content = content.replace(/\{\{instrument\.amount\}\}/g, data.instrumentInfo.amount || '');
      content = content.replace(/\{\{instrument\.currency\}\}/g, data.instrumentInfo.currency || 'TRY');
      content = content.replace(/\{\{instrument\.amountText\}\}/g, data.instrumentInfo.amountText || '');
      content = content.replace(/\{\{instrument\.issuePlace\}\}/g, data.instrumentInfo.issuePlace || '');
      content = content.replace(/\{\{instrument\.bounceAmount\}\}/g, data.instrumentInfo.bounceAmount || data.instrumentInfo.amount || '');
      content = content.replace(/\{\{instrument\.drawerName\}\}/g, data.instrumentInfo.drawerName || '');
      // presentationBank = bankName + branchName
      const presentationBank = [data.instrumentInfo.bankName, data.instrumentInfo.branchName].filter(Boolean).join(' ');
      content = content.replace(/\{\{instrument\.presentationBank\}\}/g, presentationBank);
    } else {
      // Instrument bilgisi yoksa boş bırak
      content = content.replace(/\{\{instrument\.[a-zA-Z]+\}\}/g, '');
    }
    
    // Avukat isimleri (birden fazla avukat için)
    if (data.lawyers.length > 0) {
      const lawyerNames = data.lawyers.map(l => l.name).join('\n                                                    ');
      content = content.replace(/\{\{lawyerNames\}\}/g, lawyerNames);
    } else {
      content = content.replace(/\{\{lawyerNames\}\}/g, '');
    }
    
    // isCompany kontrolü (alacaklı şirket mi?)
    if (data.creditors.length > 0) {
      const creditorType = data.creditors[0].type as string;
      const isCompany = creditorType === 'COMPANY' || creditorType === 'TUZEL';
      if (isCompany) {
        content = content.replace(/\{\{#if creditor\.isCompany\}\}([\s\S]*?)\{\{else\}\}[\s\S]*?\{\{\/if\}\}/g, '$1');
      } else {
        content = content.replace(/\{\{#if creditor\.isCompany\}\}[\s\S]*?\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
      }
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
        itemContent = itemContent.replace(/\{\{dueDate\}\}/g, item.dueDate ? this.formatDate(item.dueDate) : '');
        itemContent = itemContent.replace(/\{\{interestType\}\}/g, item.interestType || 'YASAL');
        itemContent = itemContent.replace(/\{\{interestAmount\}\}/g, item.interestAmount ? this.formatMoney(item.interestAmount) : '');
        // Conditional blocks
        if (item.dueDate) {
          itemContent = itemContent.replace(/\{\{#if dueDate\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
        } else {
          itemContent = itemContent.replace(/\{\{#if dueDate\}\}[\s\S]*?\{\{\/if\}\}/g, '');
        }
        if (item.interestAmount) {
          itemContent = itemContent.replace(/\{\{#if interestAmount\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
        } else {
          itemContent = itemContent.replace(/\{\{#if interestAmount\}\}[\s\S]*?\{\{\/if\}\}/g, '');
        }
        return itemContent;
      }).join('\n');
    });
    
    // Lawyers loop - {{#each lawyers}}
    const lawyersRegex = /\{\{#each lawyers\}\}([\s\S]*?)\{\{\/each\}\}/g;
    content = content.replace(lawyersRegex, (_match, template) => {
      return data.lawyers.map((lawyer, index) => {
        let itemContent = template;
        itemContent = itemContent.replace(/\{\{@index\}\}/g, (index + 1).toString());
        itemContent = itemContent.replace(/\{\{name\}\}/g, lawyer.name);
        itemContent = itemContent.replace(/\{\{barNumber\}\}/g, lawyer.barNumber || '');
        itemContent = itemContent.replace(/\{\{barCity\}\}/g, lawyer.barCity || '');
        itemContent = itemContent.replace(/\{\{address\}\}/g, lawyer.address || '');
        itemContent = itemContent.replace(/\{\{phone\}\}/g, lawyer.phone || '');
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
        // Conditional blocks
        if (debtor.identityNo) {
          itemContent = itemContent.replace(/\{\{#if identityNo\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
        } else {
          itemContent = itemContent.replace(/\{\{#if identityNo\}\}[\s\S]*?\{\{\/if\}\}/g, '');
        }
        return itemContent;
      }).join('\n');
    });
    // Global conditional blocks
    if (data.creditors.length > 0 && data.creditors[0].identityNo) {
      content = content.replace(/\{\{#if creditor\.identityNo\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
    } else {
      content = content.replace(/\{\{#if creditor\.identityNo\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }
    if (data.lawyers.length > 0 && data.lawyers[0].name) {
      content = content.replace(/\{\{#if lawyer\.name\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
    } else {
      content = content.replace(/\{\{#if lawyer\.name\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }
    // bankInfo kontrolü - bankName ve iban varsa
    const hasBankInfo = data.lawyers.length > 0 && data.lawyers[0].bankName && data.lawyers[0].iban;
    if (hasBankInfo) {
      content = content.replace(/\{\{#if lawyer\.bankInfo\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
    } else {
      content = content.replace(/\{\{#if lawyer\.bankInfo\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }
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

  /**
   * Sayıyı Türkçe yazıya çevirir
   * Örnek: 1000000 -> "Birmilyon Türk Lirası"
   */
  private numberToWords(amount: number): string {
    if (amount === 0) return 'Sıfır Türk Lirası';
    
    const birler = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
    const onlar = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
    const buyukSayilar = ['', 'Bin', 'Milyon', 'Milyar', 'Trilyon'];
    
    // Negatif sayı kontrolü
    if (amount < 0) {
      return 'Eksi ' + this.numberToWords(Math.abs(amount));
    }
    
    // Tam sayı ve kuruş kısımlarını ayır
    const tamSayi = Math.floor(amount);
    const kurus = Math.round((amount - tamSayi) * 100);
    
    const ucluGruplariYaziyaCevir = (sayi: number): string => {
      if (sayi === 0) return '';
      
      const yuzler = Math.floor(sayi / 100);
      const onlarBirler = sayi % 100;
      const onlarBasamagi = Math.floor(onlarBirler / 10);
      const birlerBasamagi = onlarBirler % 10;
      
      let sonuc = '';
      
      // Yüzler basamağı
      if (yuzler > 0) {
        if (yuzler === 1) {
          sonuc += 'Yüz';
        } else {
          sonuc += birler[yuzler] + 'yüz';
        }
      }
      
      // Onlar basamağı
      if (onlarBasamagi > 0) {
        sonuc += onlar[onlarBasamagi];
      }
      
      // Birler basamağı
      if (birlerBasamagi > 0) {
        sonuc += birler[birlerBasamagi];
      }
      
      return sonuc;
    };
    
    // Sayıyı 3'lü gruplara ayır
    const gruplar: number[] = [];
    let kalan = tamSayi;
    while (kalan > 0) {
      gruplar.push(kalan % 1000);
      kalan = Math.floor(kalan / 1000);
    }
    
    // Grupları yazıya çevir
    let sonuc = '';
    for (let i = gruplar.length - 1; i >= 0; i--) {
      const grup = gruplar[i];
      if (grup === 0) continue;
      
      // "Bir bin" yerine sadece "Bin" yazılır
      if (i === 1 && grup === 1) {
        sonuc += 'Bin';
      } else {
        sonuc += ucluGruplariYaziyaCevir(grup) + buyukSayilar[i];
      }
    }
    
    // Kuruş varsa ekle
    if (kurus > 0) {
      const kurusYazi = ucluGruplariYaziyaCevir(kurus);
      return sonuc + ' Türk Lirası ' + kurusYazi + ' Kuruş';
    }
    
    return sonuc + ' Türk Lirası';
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
    return { code: 'ORNEK_1_ILAMSIZ', name: 'Ilamsiz Takip Talebi', content: `                                                                    Örnek No:1

                              TAKİP TALEBİ

1-Alacaklının ve varsa kanuni temsilcisinin vekilinin adı, soyadı, vergi kimlik numarası, T.C. kimlik numarası, alacaklı veya vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve yerleşim yerindeki adresi, alacaklı yabancı ülkede oturuyorsa Türkiye'de göstereceği yerleşim yerindeki adresi:

{{creditor.name}}{{#if creditor.identityNo}} (T.C.Kimlik No:{{creditor.identityNo}}){{/if}}{{#if creditor.taxNo}} (Vergi No:{{creditor.taxNo}}){{/if}}
{{creditor.address}}

{{#if lawyer.name}}Av.{{lawyer.name}}
{{lawyer.address}}
Telefon:{{lawyer.phone}} - Faks:{{lawyer.fax}}
{{#if lawyer.bankInfo}}Banka Hesabı:{{lawyer.bankInfo}}{{/if}}{{/if}}

2-Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim yerindeki adresi, alacaklı tarafından biliniyorsa vergi kimlik numarası:

{{#each debtors}}
{{name}}{{#if identityNo}} (TC Kimlik No:{{identityNo}}){{/if}}
{{address}}
{{/each}}

3-Takip terekeye karşı açılmışsa mirasçıların, adı, soyadı ve yerleşim yerindeki adresleri:

4-Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli alacaklarda faizin miktarı ile işlemeye başladığı gün; alacak veya teminat yabancı para ise alacağın hangi tarihteki kur üzerinden talep edildiği ve faizi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} ({{dueDate}}){{/if}}
{{#if interestAmount}}{{interestAmount}} {{currency}} İşlemiş Faiz ({{interestType}}){{/if}}
{{/each}}
+--------------
{{totals.total}} {{totals.currency}}

{{totals.total}} {{totals.currency}} tutarındaki alacağın icra gideri, vek.ücr. ve takip tarihinden itibaren asıl alacağa işleyecek ({{interestInfo.description}}) faizi ile tahsili talebidir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan talep hakkımız saklıdır) TBK. 100.mad. gereğince kısmi ödemeler öncelikle işlemiş faiz, masraf ve fer'ilere mahsup edilecektir.

5-Taşınır rehni veya ipotekle temin edilmiş olan bir alacak talebinde rehnedilenin ne olduğu rehnedilen üçüncü şahıslar tarafından verilmiş veya mülkiyeti üçüncü şahsa geçmiş ise adı ve soyadı, rehnedilen şey üzerinde, sonra gelen rehin hakkı varsa bu hakka sahip olan kişinin adı, soyadı, yerleşim yerindeki adresi:

6-Takip, ilâma veya ilâm hükmündeki belgeye müstenit ise ilâm veya belgeyi veren makamın adı, ilâm veya belgenin tarihi, numarası ve özeti:

7-Adî veya hasılat kiralarına ait takip talebi:

8-Tevdi edilen senet (Poliçe, emre muharrer senet, çek) in tarih ve numarası, özeti, senede dayalı değilse borcun sebebi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} (Tarih:{{dueDate}}){{/if}}
{{/each}}

9-Alacaklının takip yollarından hangisini seçtiği:

{{executionPath}}

Yukarıda yazdığım hakkımın alınmasını talep ederim.
(İİK m.8, 58)

{{filingDate}}

                                          {{lawyer.name}}
                                          Alacaklı veya Vekilinin İmzası
` };
  }

  private getKambiyoCekTemplate(): any {
    return { code: 'ORNEK_1_KAMBIYO_CEK', name: 'Kambiyo (Cek) Takip Talebi', content: `                                                                    Örnek No:1

                              TAKİP TALEBİ
                    (Kambiyo Senetlerine Mahsus Haciz Yolu)

1-Alacaklının ve varsa kanuni temsilcisinin vekilinin adı, soyadı, vergi kimlik numarası, T.C. kimlik numarası, alacaklı veya vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve yerleşim yerindeki adresi, alacaklı yabancı ülkede oturuyorsa Türkiye'de göstereceği yerleşim yerindeki adresi:

{{creditor.name}}{{#if creditor.identityNo}} (T.C.Kimlik No:{{creditor.identityNo}}){{/if}}{{#if creditor.taxNo}} (Vergi No:{{creditor.taxNo}}){{/if}}
{{creditor.address}}

{{#if lawyer.name}}Av.{{lawyer.name}}
{{lawyer.address}}
Telefon:{{lawyer.phone}} - Faks:{{lawyer.fax}}
{{#if lawyer.bankInfo}}Banka Hesabı:{{lawyer.bankInfo}}{{/if}}{{/if}}

2-Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim yerindeki adresi, alacaklı tarafından biliniyorsa vergi kimlik numarası:

{{#each debtors}}
{{name}} ({{role}}){{#if identityNo}} (TC Kimlik No:{{identityNo}}){{/if}}
{{address}}
{{/each}}

3-Takip terekeye karşı açılmışsa mirasçıların, adı, soyadı ve yerleşim yerindeki adresleri:

4-Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli alacaklarda faizin miktarı ile işlemeye başladığı gün; alacak veya teminat yabancı para ise alacağın hangi tarihteki kur üzerinden talep edildiği ve faizi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} ({{dueDate}}){{/if}}
{{#if interestAmount}}{{interestAmount}} {{currency}} İşlemiş Faiz ({{interestType}}){{/if}}
{{/each}}
+--------------
{{totals.total}} {{totals.currency}}

{{totals.total}} {{totals.currency}} tutarındaki çek alacağının icra gideri, vek.ücr., %10 çek tazminatı ve takip tarihinden itibaren asıl alacağa işleyecek değişen oranlarda ticari faizi ile tahsili talebidir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan talep hakkımız saklıdır) TBK. 100.mad. gereğince kısmi ödemeler öncelikle işlemiş faiz, masraf ve fer'ilere mahsup edilecektir.

5-Taşınır rehni veya ipotekle temin edilmiş olan bir alacak talebinde rehnedilenin ne olduğu rehnedilen üçüncü şahıslar tarafından verilmiş veya mülkiyeti üçüncü şahsa geçmiş ise adı ve soyadı, rehnedilen şey üzerinde, sonra gelen rehin hakkı varsa bu hakka sahip olan kişinin adı, soyadı, yerleşim yerindeki adresi:

6-Takip, ilâma veya ilâm hükmündeki belgeye müstenit ise ilâm veya belgeyi veren makamın adı, ilâm veya belgenin tarihi, numarası ve özeti:

7-Adî veya hasılat kiralarına ait takip talebi:

8-Tevdi edilen senet (Poliçe, emre muharrer senet, çek) in tarih ve numarası, özeti, senede dayalı değilse borcun sebebi:

{{#each claimItems}}
{{amount}} {{currency}} ÇEK ALACAĞI{{#if dueDate}} (İbraz Tarihi:{{dueDate}}){{/if}}
{{/each}}

EK: Çek fotokopisi

9-Alacaklının takip yollarından hangisini seçtiği:

{{executionPath}}

Yukarıda yazdığım hakkımın alınmasını talep ederim.
(İİK m.8, 58, 167 vd.)

{{filingDate}}

                                          {{lawyer.name}}
                                          Alacaklı veya Vekilinin İmzası
` };
  }

  private getKambiyoSenetTemplate(): any {
    return { code: 'ORNEK_1_KAMBIYO_SENET', name: 'Kambiyo (Senet) Takip Talebi', content: `                                                                    Örnek No:1

                              TAKİP TALEBİ
                    (Kambiyo Senetlerine Mahsus Haciz Yolu)

1-Alacaklının ve varsa kanuni temsilcisinin vekilinin adı, soyadı, vergi kimlik numarası, T.C. kimlik numarası, alacaklı veya vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve yerleşim yerindeki adresi, alacaklı yabancı ülkede oturuyorsa Türkiye'de göstereceği yerleşim yerindeki adresi:

{{creditor.name}}{{#if creditor.identityNo}} (T.C.Kimlik No:{{creditor.identityNo}}){{/if}}{{#if creditor.taxNo}} (Vergi No:{{creditor.taxNo}}){{/if}}
{{creditor.address}}

{{#if lawyer.name}}Av.{{lawyer.name}}
{{lawyer.address}}
Telefon:{{lawyer.phone}} - Faks:{{lawyer.fax}}
{{#if lawyer.bankInfo}}Banka Hesabı:{{lawyer.bankInfo}}{{/if}}{{/if}}

2-Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim yerindeki adresi, alacaklı tarafından biliniyorsa vergi kimlik numarası:

{{#each debtors}}
{{name}} ({{role}}){{#if identityNo}} (TC Kimlik No:{{identityNo}}){{/if}}
{{address}}
{{/each}}

3-Takip terekeye karşı açılmışsa mirasçıların, adı, soyadı ve yerleşim yerindeki adresleri:

4-Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli alacaklarda faizin miktarı ile işlemeye başladığı gün; alacak veya teminat yabancı para ise alacağın hangi tarihteki kur üzerinden talep edildiği ve faizi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} (Vade:{{dueDate}}){{/if}}
{{#if interestAmount}}{{interestAmount}} {{currency}} İşlemiş Faiz ({{interestType}}){{/if}}
{{/each}}
+--------------
{{totals.total}} {{totals.currency}}

{{totals.total}} {{totals.currency}} tutarındaki senet alacağının icra gideri, vek.ücr. ve vade tarihinden itibaren asıl alacağa işleyecek değişen oranlarda ticari faizi ile tahsili talebidir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan talep hakkımız saklıdır) TBK. 100.mad. gereğince kısmi ödemeler öncelikle işlemiş faiz, masraf ve fer'ilere mahsup edilecektir.

5-Taşınır rehni veya ipotekle temin edilmiş olan bir alacak talebinde rehnedilenin ne olduğu rehnedilen üçüncü şahıslar tarafından verilmiş veya mülkiyeti üçüncü şahsa geçmiş ise adı ve soyadı, rehnedilen şey üzerinde, sonra gelen rehin hakkı varsa bu hakka sahip olan kişinin adı, soyadı, yerleşim yerindeki adresi:

6-Takip, ilâma veya ilâm hükmündeki belgeye müstenit ise ilâm veya belgeyi veren makamın adı, ilâm veya belgenin tarihi, numarası ve özeti:

7-Adî veya hasılat kiralarına ait takip talebi:

8-Tevdi edilen senet (Poliçe, emre muharrer senet, çek) in tarih ve numarası, özeti, senede dayalı değilse borcun sebebi:

{{#each claimItems}}
{{amount}} {{currency}} BONO/SENET ALACAĞI{{#if dueDate}} (Vade Tarihi:{{dueDate}}){{/if}}
{{/each}}

EK: Senet aslı

9-Alacaklının takip yollarından hangisini seçtiği:

{{executionPath}}

Yukarıda yazdığım hakkımın alınmasını talep ederim.
(İİK m.8, 58, 167 vd.)

{{filingDate}}

                                          {{lawyer.name}}
                                          Alacaklı veya Vekilinin İmzası
` };
  }

  private getIlamliTemplate(): any {
    return { code: 'ORNEK_1_ILAMLI', name: 'Ilamli Takip Talebi', content: `                                                                    Örnek No:1

                              TAKİP TALEBİ
                              (İlamlı Takip)

1-Alacaklının ve varsa kanuni temsilcisinin vekilinin adı, soyadı, vergi kimlik numarası, T.C. kimlik numarası, alacaklı veya vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve yerleşim yerindeki adresi, alacaklı yabancı ülkede oturuyorsa Türkiye'de göstereceği yerleşim yerindeki adresi:

{{creditor.name}}{{#if creditor.identityNo}} (T.C.Kimlik No:{{creditor.identityNo}}){{/if}}{{#if creditor.taxNo}} (Vergi No:{{creditor.taxNo}}){{/if}}
{{creditor.address}}

{{#if lawyer.name}}Av.{{lawyer.name}}
{{lawyer.address}}
Telefon:{{lawyer.phone}} - Faks:{{lawyer.fax}}
{{#if lawyer.bankInfo}}Banka Hesabı:{{lawyer.bankInfo}}{{/if}}{{/if}}

2-Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim yerindeki adresi, alacaklı tarafından biliniyorsa vergi kimlik numarası:

{{#each debtors}}
{{name}}{{#if identityNo}} (TC Kimlik No:{{identityNo}}){{/if}}
{{address}}
{{/each}}

3-Takip terekeye karşı açılmışsa mirasçıların, adı, soyadı ve yerleşim yerindeki adresleri:

4-Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli alacaklarda faizin miktarı ile işlemeye başladığı gün; alacak veya teminat yabancı para ise alacağın hangi tarihteki kur üzerinden talep edildiği ve faizi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} ({{dueDate}}){{/if}}
{{#if interestAmount}}{{interestAmount}} {{currency}} İşlemiş Faiz ({{interestType}}){{/if}}
{{/each}}
+--------------
{{totals.total}} {{totals.currency}}

{{totals.total}} {{totals.currency}} tutarındaki ilam alacağının icra gideri, vek.ücr. ve takip tarihinden itibaren asıl alacağa işleyecek ({{interestInfo.description}}) faizi ile tahsili talebidir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan talep hakkımız saklıdır) TBK. 100.mad. gereğince kısmi ödemeler öncelikle işlemiş faiz, masraf ve fer'ilere mahsup edilecektir.

5-Taşınır rehni veya ipotekle temin edilmiş olan bir alacak talebinde rehnedilenin ne olduğu rehnedilen üçüncü şahıslar tarafından verilmiş veya mülkiyeti üçüncü şahsa geçmiş ise adı ve soyadı, rehnedilen şey üzerinde, sonra gelen rehin hakkı varsa bu hakka sahip olan kişinin adı, soyadı, yerleşim yerindeki adresi:

6-Takip, ilâma veya ilâm hükmündeki belgeye müstenit ise ilâm veya belgeyi veren makamın adı, ilâm veya belgenin tarihi, numarası ve özeti:

{{court.name}}
{{court.caseNumber}} E., {{court.decisionNumber}} K.
Karar Tarihi: {{court.decisionDate}}
{{#if court.summary}}Özet: {{court.summary}}{{/if}}

EK: İlam sureti

7-Adî veya hasılat kiralarına ait takip talebi:

8-Tevdi edilen senet (Poliçe, emre muharrer senet, çek) in tarih ve numarası, özeti, senede dayalı değilse borcun sebebi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} (Tarih:{{dueDate}}){{/if}}
{{/each}}

9-Alacaklının takip yollarından hangisini seçtiği:

{{executionPath}}

Yukarıda yazdığım hakkımın alınmasını talep ederim.
(İİK m.8, 32 vd.)

{{filingDate}}

                                          {{lawyer.name}}
                                          Alacaklı veya Vekilinin İmzası
` };
  }

  private getNafakaTemplate(): any {
    return { code: 'ORNEK_1_NAFAKA', name: 'Nafaka Takip Talebi', content: `                                                                    Örnek No:1

                              TAKİP TALEBİ
                           (Nafaka Alacağı Takibi)

1-Alacaklının ve varsa kanuni temsilcisinin vekilinin adı, soyadı, vergi kimlik numarası, T.C. kimlik numarası, alacaklı veya vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve yerleşim yerindeki adresi, alacaklı yabancı ülkede oturuyorsa Türkiye'de göstereceği yerleşim yerindeki adresi:

{{creditor.name}}{{#if creditor.identityNo}} (T.C.Kimlik No:{{creditor.identityNo}}){{/if}}
{{creditor.address}}

{{#if lawyer.name}}Av.{{lawyer.name}}
{{lawyer.address}}
Telefon:{{lawyer.phone}} - Faks:{{lawyer.fax}}
{{#if lawyer.bankInfo}}Banka Hesabı:{{lawyer.bankInfo}}{{/if}}{{/if}}

2-Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim yerindeki adresi, alacaklı tarafından biliniyorsa vergi kimlik numarası:

{{debtor.name}}{{#if debtor.identityNo}} (TC Kimlik No:{{debtor.identityNo}}){{/if}}
{{debtor.address}}

3-Takip terekeye karşı açılmışsa mirasçıların, adı, soyadı ve yerleşim yerindeki adresleri:

4-Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli alacaklarda faizin miktarı ile işlemeye başladığı gün; alacak veya teminat yabancı para ise alacağın hangi tarihteki kur üzerinden talep edildiği ve faizi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} ({{dueDate}}){{/if}}
{{#if interestAmount}}{{interestAmount}} {{currency}} İşlemiş Faiz ({{interestType}}){{/if}}
{{/each}}
+--------------
{{totals.total}} {{totals.currency}}

{{totals.total}} {{totals.currency}} tutarındaki birikmiş nafaka alacağının icra gideri, vek.ücr. ve takip tarihinden itibaren asıl alacağa işleyecek ({{interestInfo.description}}) faizi ile tahsili ve devam eden aylık nafaka bedellerinin tahsili talebidir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan talep hakkımız saklıdır)

5-Taşınır rehni veya ipotekle temin edilmiş olan bir alacak talebinde rehnedilenin ne olduğu rehnedilen üçüncü şahıslar tarafından verilmiş veya mülkiyeti üçüncü şahsa geçmiş ise adı ve soyadı, rehnedilen şey üzerinde, sonra gelen rehin hakkı varsa bu hakka sahip olan kişinin adı, soyadı, yerleşim yerindeki adresi:

6-Takip, ilâma veya ilâm hükmündeki belgeye müstenit ise ilâm veya belgeyi veren makamın adı, ilâm veya belgenin tarihi, numarası ve özeti:

{{court.name}}
{{court.caseNumber}} E., {{court.decisionNumber}} K.
Karar Tarihi: {{court.decisionDate}}
{{#if court.summary}}Özet: {{court.summary}}{{/if}}

EK: Nafaka ilamı sureti

7-Adî veya hasılat kiralarına ait takip talebi:

8-Tevdi edilen senet (Poliçe, emre muharrer senet, çek) in tarih ve numarası, özeti, senede dayalı değilse borcun sebebi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} (Tarih:{{dueDate}}){{/if}}
{{/each}}

9-Alacaklının takip yollarından hangisini seçtiği:

{{executionPath}}

Yukarıda yazdığım hakkımın alınmasını talep ederim.
(İİK m.8, 32 vd.)

{{filingDate}}

                                          {{lawyer.name}}
                                          Alacaklı veya Vekilinin İmzası
` };
  }

  private getKiraTemplate(): any {
    return { code: 'ORNEK_1_KIRA', name: 'Kira Alacagi Takip Talebi', content: `                                                                    Örnek No:1

                              TAKİP TALEBİ

1-Alacaklının ve varsa kanuni temsilcisinin vekilinin adı, soyadı, vergi kimlik numarası, T.C. kimlik numarası, alacaklı veya vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve yerleşim yerindeki adresi, alacaklı yabancı ülkede oturuyorsa Türkiye'de göstereceği yerleşim yerindeki adresi:

{{creditor.name}}{{#if creditor.identityNo}} (T.C.Kimlik No:{{creditor.identityNo}}){{/if}}
{{creditor.address}}

{{#if lawyer.name}}Av.{{lawyer.name}}
{{lawyer.address}}
Telefon:{{lawyer.phone}} - Faks:{{lawyer.fax}}
{{#if lawyer.bankInfo}}Banka Hesabı:{{lawyer.bankInfo}}{{/if}}{{/if}}

2-Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim yerindeki adresi, alacaklı tarafından biliniyorsa vergi kimlik numarası:

{{#each debtors}}
{{name}}{{#if identityNo}} (TC Kimlik No:{{identityNo}}){{/if}}
{{address}}
{{/each}}

3-Takip terekeye karşı açılmışsa mirasçıların, adı, soyadı ve yerleşim yerindeki adresleri:

4-Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli alacaklarda faizin miktarı ile işlemeye başladığı gün; alacak veya teminat yabancı para ise alacağın hangi tarihteki kur üzerinden talep edildiği ve faizi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} ({{dueDate}}){{/if}}
{{#if interestAmount}}{{interestAmount}} {{currency}} İşlemiş Faiz ({{interestType}}){{/if}}
{{/each}}
+--------------
{{totals.total}} {{totals.currency}}

{{totals.total}} {{totals.currency}} tutarındaki alacağın icra gideri, vek.ücr. ve takip tarihinden itibaren asıl alacağa işleyecek ({{interestInfo.description}}) faizi ile tahsili talebidir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan talep hakkımız saklıdır) TBK. 100.mad. gereğince kısmi ödemeler öncelikle işlemiş faiz, masraf ve fer'ilere mahsup edilecektir.

5-Taşınır rehni veya ipotekle temin edilmiş olan bir alacak talebinde rehnedilenin ne olduğu rehnedilen üçüncü şahıslar tarafından verilmiş veya mülkiyeti üçüncü şahsa geçmiş ise adı ve soyadı, rehnedilen şey üzerinde, sonra gelen rehin hakkı varsa bu hakka sahip olan kişinin adı, soyadı, yerleşim yerindeki adresi:

6-Takip, ilâma veya ilâm hükmündeki belgeye müstenit ise ilâm veya belgeyi veren makamın adı, ilâm veya belgenin tarihi, numarası ve özeti:

7-Adî veya hasılat kiralarına ait takip talebi:

Kira Türü: {{leaseInfo.leaseType}}
Yıllık Kira Bedeli: {{leaseInfo.yearlyRent}}
Sözleşme Şekli: {{leaseInfo.contractType}}
{{leaseInfo.propertyAddress}} adresindeki taşınmaz

8-Tevdi edilen senet (Poliçe, emre muharrer senet, çek) in tarih ve numarası, özeti, senede dayalı değilse borcun sebebi:

{{#each claimItems}}
{{amount}} {{currency}} {{description}}{{#if dueDate}} (Tarih:{{dueDate}}){{/if}}
{{/each}}

9-Alacaklının takip yollarından hangisini seçtiği:

{{executionPath}}

Yukarıda yazdığım hakkımın alınmasını talep ederim.
(İİK m.8, 58)

{{filingDate}}

                                          {{lawyer.name}}
                                          Alacaklı veya Vekilinin İmzası
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
    
    // Takip talebi için resmi formatlı PDF kullan
    if (documentType === 'takip-talebi') {
      return this.generateTakipTalebiPdfFormatted(caseData);
    }
    
    // Diğer belge türleri için text-based PDF
    let doc: GeneratedDocument;
    switch (documentType) {
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
    
    // Takip talebi için resmi formatlı Word kullan
    if (documentType === 'takip-talebi') {
      return this.generateTakipTalebiWordFormatted(caseData);
    }
    
    // Diğer belge türleri için text-based Word
    let doc: GeneratedDocument;
    switch (documentType) {
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
   * Resmi Örnek No:1 formatında Takip Talebi PDF'i oluştur
   */
  private async generateTakipTalebiPdfFormatted(data: TemplateData): Promise<Buffer> {
    const fonts: TFontDictionary = {
      Courier: {
        normal: 'Courier',
        bold: 'Courier-Bold',
        italics: 'Courier-Oblique',
        bolditalics: 'Courier-BoldOblique'
      }
    };

    const PdfPrinterClass = await getPdfPrinter();
    const printer = new PdfPrinterClass(fonts);
    
    // Alacaklı bilgisi - tam format
    const creditor = data.creditors[0] || { name: '', address: '', identityNo: '', taxNo: '', city: '', district: '' };
    
    // Avukat bilgisi - tam iletişim bilgileri
    const lawyer = data.lawyers[0] || { name: '', address: '', phone: '', fax: '', bankName: '', branchName: '', iban: '', barNumber: '', barCity: '' };
    
    // Alacaklı metni oluştur - BESA GIDA formatında
    let creditorText = `${creditor.name}`;
    if (creditor.taxNo) {
      creditorText += ` (Vergi Dairesi: ${creditor.district || '...'} Vergi Numarası: ${creditor.taxNo})`;
    } else if (creditor.identityNo) {
      creditorText += ` (T.C. Kimlik No: ${creditor.identityNo})`;
    }
    // Alacaklı adresi - tam format
    if (creditor.address) {
      const fullAddress = [creditor.address, creditor.district, creditor.city].filter(Boolean).join(' / ');
      creditorText += `\n${fullAddress}`;
    }
    
    // Avukat bilgisi ekle - tam format
    if (lawyer.name) {
      creditorText += `\n\n${lawyer.name}`;
      // Avukat adresi
      if (lawyer.address) {
        creditorText += `\n${lawyer.address}`;
      }
      // Telefon ve Faks - aynı satırda
      let contactLine = '';
      if (lawyer.phone) contactLine += `Telefon: ${lawyer.phone}`;
      if (lawyer.fax) contactLine += ` - Faks: ${lawyer.fax}`;
      else if (lawyer.phone) contactLine += ' - Faks:';
      if (contactLine) {
        creditorText += `\n${contactLine}`;
      }
      // Banka bilgisi - tam format
      if (lawyer.bankName && lawyer.iban) {
        creditorText += `\nBanka Hesabı: ${lawyer.bankName} İBAN: ${lawyer.iban}`;
      }
    }
    
    // Borçlu bilgileri - tam format
    const debtorLines = data.debtors.map(d => {
      let line = `${d.name}`;
      if (d.taxNo) {
        line += ` (Vergi Dairesi: ${d.district || '...'} Vergi No: ${d.taxNo})`;
      } else if (d.identityNo) {
        line += ` (T.C. Kimlik No: ${d.identityNo})`;
      }
      // Borçlu adresi
      if (d.address) {
        const fullAddress = [d.address, d.district, d.city].filter(Boolean).join(' / ');
        line += `\n${fullAddress}`;
      }
      return line;
    }).join('\n\n');
    
    // Alacak kalemleri
    const claimLines = data.claimItems.map(item => {
      let line = `${this.formatMoney(item.amount)} ${this.getCurrencySymbol(item.currency)} ${item.description}`;
      if (item.dueDate) {
        line += ` (${this.formatDate(item.dueDate)})`;
      }
      return line;
    }).join('\n');
    
    // Faiz türü ve oranı - dinamik olarak rate'den al
    const faizTuruLabel = data.interestInfo.type === 'TICARI' ? 'TİCARİ' : (data.interestInfo.type === 'YASAL' ? 'YASAL' : data.interestInfo.type);
    const faizOrani = data.interestInfo.rate ? `%${data.interestInfo.rate.toFixed(2).replace('.', ',')}` : '%24,00';
    
    // Toplam ve faiz açıklaması - düzgün format
    const totalText = `${this.formatMoney(data.totals.total)} ${this.getCurrencySymbol(data.totals.currency)}`;
    const interestDesc = `${totalText} tutarındaki alacağın icra gideri, vek.ücr. ve takip tarihinden itibaren asıl alacağa işleyecek (YILLIK ${faizOrani} (${faizTuruLabel}) değişen oranlarda) faizi ile tahsili talebidir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan talep hakkımız saklıdır) TBK. 100.mad. gereğince kısmi ödemeler öncelikle işlemiş faiz, masraf ve fer'ilere mahsup edilecektir.`;
    
    // Madde 6 - İlam bilgisi
    const courtText = data.courtInfo 
      ? `${data.courtInfo.name}\nEsas No: ${data.courtInfo.caseNumber}\nKarar No: ${data.courtInfo.decisionNumber}\nKarar Tarihi: ${this.formatDate(data.courtInfo.decisionDate)}${data.courtInfo.summary ? `\nÖzet: ${data.courtInfo.summary}` : ''}`
      : '';
    
    // Madde 7 - Kira bilgisi
    const leaseText = data.leaseInfo
      ? `${data.leaseInfo.leaseType}\nYıllık Kira: ${data.leaseInfo.yearlyRent}\nSözleşme: ${data.leaseInfo.contractType}\nAdres: ${data.leaseInfo.propertyAddress}`
      : '';
    
    // Madde 8 - Senet/Çek bilgisi veya borcun sebebi
    let instrumentText = '';
    if (data.instrumentInfo) {
      if (data.instrumentInfo.type === 'CEK') {
        instrumentText = `${this.formatMoney(data.totals.principal)} ${this.getCurrencySymbol(data.totals.currency)} ÇEK ALACAĞI\nÇek No: ${data.instrumentInfo.instrumentNo || ''}\nBanka: ${data.instrumentInfo.bankName || ''} ${data.instrumentInfo.branchName || ''}\nİbraz Tarihi: ${data.instrumentInfo.presentationDate ? this.formatDate(data.instrumentInfo.presentationDate) : ''}`;
      } else {
        instrumentText = `${this.formatMoney(data.totals.principal)} ${this.getCurrencySymbol(data.totals.currency)} SENET/BONO ALACAĞI\nVade Tarihi: ${data.instrumentInfo.dueDate ? this.formatDate(data.instrumentInfo.dueDate) : ''}\nDüzenleme Tarihi: ${data.instrumentInfo.issueDate ? this.formatDate(data.instrumentInfo.issueDate) : ''}`;
      }
    } else if (data.claimItems.length > 0) {
      // Borcun sebebi olarak alacak kalemlerini yaz
      instrumentText = data.claimItems.map(item => {
        let line = `${this.formatMoney(item.amount)} ${this.getCurrencySymbol(item.currency)} ${item.description}`;
        if (item.dueDate) {
          line += ` (Tarih: ${this.formatDate(item.dueDate)})`;
        }
        return line;
      }).join('\n');
    }
    
    // Takip yolu
    const executionPathLabels: Record<string, string> = {
      'HACIZ': 'HACİZ',
      'HACIZ_TAHLIYE': 'HACİZ, TAHLİYE',
      'TAHLIYE': 'TAHLİYE',
      'IFLAS': 'İFLAS',
      'REHIN': 'REHİN',
    };
    const executionPath = executionPathLabels[data.executionPath] || data.executionPath || 'HACİZ';

    const docDefinition: TDocumentDefinitions = {
      content: [
        // Başlık satırı
        {
          columns: [
            { text: 'TAKİP TALEBİ', style: 'header', width: '*', decoration: 'underline' as const },
            { text: 'Örnek No:1', style: 'subheader', width: 'auto', alignment: 'right' as const }
          ],
          margin: [0, 0, 0, 8] as [number, number, number, number]
        },
        // Tablo formatında 9 madde - %25 sol (başlık), %75 sağ (değer)
        {
          table: {
            widths: ['25%', '75%'],
            body: [
              // Madde 1 - Alacaklı
              [
                { text: '1-Alacaklının ve varsa kanuni temsilcisinin ve vekilinin adı, soyadı, vergi kimlik numarası, T.C. kimlik numarası, alacaklı veya vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve yerleşim yerindeki adresi:', style: 'label' },
                { text: creditorText || '', style: 'value' }
              ],
              // Madde 2 - Borçlu
              [
                { text: '2-Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim yerindeki adresi:', style: 'label' },
                { text: debtorLines || '', style: 'value' }
              ],
              // Madde 3 - Mirasçılar
              [
                { text: '3-Takip terekeye karşı açılmışsa mirasçıların, adı, soyadı ve yerleşim yerindeki adresleri:', style: 'label' },
                { text: data.estateInfo ? data.estateInfo.heirs.map(h => `${h.name}\n${h.address}`).join('\n\n') : '', style: 'value' }
              ],
              // Madde 4 - Alacak tutarı ve faiz
              [
                { text: '4-Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli alacaklarda faizin miktarı ile işlemeye başladığı gün:', style: 'label' },
                { 
                  text: `${claimLines}\n+--------------\n${totalText}\n\n${interestDesc}`,
                  style: 'value'
                }
              ],
              // Madde 5 - Rehin/İpotek
              [
                { text: '5-Taşınır rehni veya ipotekle temin edilmiş olan bir alacak talebinde rehnedilenin ne olduğu:', style: 'label' },
                { text: data.collateralInfo ? `${data.collateralInfo.description}\n${data.collateralInfo.ownerName || ''}` : '', style: 'value' }
              ],
              // Madde 6 - İlam bilgisi
              [
                { text: '6-Takip, ilâma veya ilâm hükmündeki belgeye müstenit ise ilâm veya belgeyi veren makamın adı, ilâm veya belgenin tarihi, numarası ve özeti:', style: 'label' },
                { text: courtText, style: 'value' }
              ],
              // Madde 7 - Kira
              [
                { text: '7-Adî veya hasılat kiralarına ait takip talebi:', style: 'label' },
                { text: leaseText, style: 'value' }
              ],
              // Madde 8 - Senet/Çek veya borcun sebebi
              [
                { text: '8-Tevdi edilen senet (Poliçe, emre muharrer senet, çek) in tarih ve numarası, özeti, senede dayalı değilse borcun sebebi:', style: 'label' },
                { text: instrumentText, style: 'value' }
              ],
              // Madde 9 - Takip yolu
              [
                { text: '9-Alacaklının takip yollarından hangisini seçtiği:', style: 'label' },
                { text: `: ${executionPath}`, style: 'valueBold' }
              ],
            ]
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#000000',
            vLineColor: () => '#000000',
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 3,
            paddingBottom: () => 3,
          }
        },
        // Alt kısım - talep metni
        {
          text: `Yukarıda yazdığım hakkımın alınmasını talep ederim. (İİK m.8, 58)`,
          style: 'content',
          margin: [0, 8, 0, 3] as [number, number, number, number]
        },
        // Tarih ve İmza
        {
          columns: [
            { text: this.formatDate(data.filingDate), style: 'content', width: 'auto' },
            { text: '', width: '*' },
            { 
              text: `${lawyer.name || 'Alacaklı'}\nAlacaklı veya Vekilinin İmzası`, 
              style: 'signature', 
              alignment: 'right' as const,
              width: 'auto'
            }
          ],
          margin: [0, 12, 0, 0] as [number, number, number, number]
        }
      ],
      styles: {
        header: {
          fontSize: 12,
          bold: true,
          font: 'Courier'
        },
        subheader: {
          fontSize: 10,
          font: 'Courier'
        },
        label: {
          fontSize: 8,
          font: 'Courier'
        },
        value: {
          fontSize: 8,
          font: 'Courier'
        },
        valueBold: {
          fontSize: 8,
          font: 'Courier',
          bold: true
        },
        content: {
          fontSize: 9,
          font: 'Courier'
        },
        signature: {
          fontSize: 9,
          font: 'Courier'
        }
      },
      defaultStyle: {
        font: 'Courier'
      },
      pageSize: 'A4',
      pageMargins: [25, 20, 25, 20] as [number, number, number, number]
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

    const PdfPrinterClass = await getPdfPrinter();
    const printer = new PdfPrinterClass(fonts);
    
    // İçeriği temizle ve satırlara böl
    const cleanedContent = content
      .trim() // Baş ve sondaki boşlukları kaldır
      .replace(/\n{3,}/g, '\n\n'); // 3+ ardışık boş satırı 2'ye indir
    
    const lines = cleanedContent.split('\n');
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
   * Resmi Örnek No:1 formatında Takip Talebi Word belgesi oluştur
   */
  private async generateTakipTalebiWordFormatted(data: TemplateData): Promise<Buffer> {
    // Alacaklı bilgisi - tam format
    const creditor = data.creditors[0] || { name: '', address: '', identityNo: '', taxNo: '', city: '', district: '' };
    
    // Avukat bilgisi - tam iletişim bilgileri
    const lawyer = data.lawyers[0] || { name: '', address: '', phone: '', fax: '', bankName: '', branchName: '', iban: '', barNumber: '', barCity: '' };
    
    // Alacaklı metni oluştur - BESA GIDA formatında
    let creditorText = `${creditor.name}`;
    if (creditor.taxNo) {
      creditorText += ` (Vergi Dairesi: ${creditor.district || '...'} Vergi Numarası: ${creditor.taxNo})`;
    } else if (creditor.identityNo) {
      creditorText += ` (T.C. Kimlik No: ${creditor.identityNo})`;
    }
    // Alacaklı adresi - tam format
    if (creditor.address) {
      const fullAddress = [creditor.address, creditor.district, creditor.city].filter(Boolean).join(' / ');
      creditorText += `\n${fullAddress}`;
    }
    
    // Avukat bilgisi ekle - tam format
    if (lawyer.name) {
      creditorText += `\n\n${lawyer.name}`;
      // Avukat adresi
      if (lawyer.address) {
        creditorText += `\n${lawyer.address}`;
      }
      // Telefon ve Faks - aynı satırda
      let contactLine = '';
      if (lawyer.phone) contactLine += `Telefon: ${lawyer.phone}`;
      if (lawyer.fax) contactLine += ` - Faks: ${lawyer.fax}`;
      else if (lawyer.phone) contactLine += ' - Faks:';
      if (contactLine) {
        creditorText += `\n${contactLine}`;
      }
      // Banka bilgisi - tam format (şube adı dahil)
      if (lawyer.bankName && lawyer.iban) {
        const bankInfo = lawyer.branchName 
          ? `${lawyer.bankName} ${lawyer.branchName} Şubesi İBAN: ${lawyer.iban}`
          : `${lawyer.bankName} İBAN: ${lawyer.iban}`;
        creditorText += `\nBanka Hesabı: ${bankInfo}`;
      }
    }
    
    // Borçlu bilgileri - tam format
    const debtorLines = data.debtors.map(d => {
      let line = `${d.name}`;
      if (d.taxNo) {
        line += ` (Vergi Dairesi: ${d.district || '...'} Vergi No: ${d.taxNo})`;
      } else if (d.identityNo) {
        line += ` (T.C. Kimlik No: ${d.identityNo})`;
      }
      // Borçlu adresi
      if (d.address) {
        const fullAddress = [d.address, d.district, d.city].filter(Boolean).join(' / ');
        line += `\n${fullAddress}`;
      }
      return line;
    }).join('\n\n');
    
    // Alacak kalemleri - detaylı format
    // Asıl alacak, işlemiş faiz, ek alacaklar ayrı ayrı
    const principalItems = data.claimItems.filter(i => ['PRINCIPAL', 'ASIL_ALACAK'].includes(i.type));
    const interestItems = data.claimItems.filter(i => ['INTEREST', 'ISLEMIS_FAIZ'].includes(i.type));
    const feeItems = data.claimItems.filter(i => ['FEE', 'POSTAGE', 'STAMP', 'EXPENSE', 'MASRAF'].includes(i.type));
    const otherItems = data.claimItems.filter(i => !['PRINCIPAL', 'ASIL_ALACAK', 'INTEREST', 'ISLEMIS_FAIZ', 'FEE', 'POSTAGE', 'STAMP', 'EXPENSE', 'MASRAF'].includes(i.type));
    
    // Alacak kalemlerini formatla
    let claimLines = '';
    
    // Asıl alacak(lar)
    if (principalItems.length > 0) {
      principalItems.forEach(item => {
        claimLines += `${this.formatMoney(item.amount)} ${this.getCurrencySymbol(item.currency)} ${item.description}`;
        if (item.dueDate) claimLines += ` (${this.formatDate(item.dueDate)})`;
        claimLines += '\n';
      });
    } else if (data.totals.principal > 0) {
      // Eğer ayrı kalem yoksa toplam asıl alacağı yaz
      claimLines += `${this.formatMoney(data.totals.principal)} ${this.getCurrencySymbol(data.totals.currency)} Asıl Alacak\n`;
    }
    
    // Takip öncesi işlemiş faiz
    if (interestItems.length > 0 || data.totals.interest > 0) {
      if (interestItems.length > 0) {
        interestItems.forEach(item => {
          claimLines += `${this.formatMoney(item.amount)} ${this.getCurrencySymbol(item.currency)} ${item.description || 'İşlemiş Faiz'}`;
          if (item.interestStartDate) claimLines += ` (${this.formatDate(item.interestStartDate)} tarihinden itibaren)`;
          claimLines += '\n';
        });
      } else if (data.totals.interest > 0) {
        claimLines += `${this.formatMoney(data.totals.interest)} ${this.getCurrencySymbol(data.totals.currency)} İşlemiş Faiz\n`;
      }
    }
    
    // Ek alacaklar (masraflar vb.)
    if (feeItems.length > 0 || otherItems.length > 0) {
      [...feeItems, ...otherItems].forEach(item => {
        claimLines += `${this.formatMoney(item.amount)} ${this.getCurrencySymbol(item.currency)} ${item.description}\n`;
      });
    }
    
    // Toplam çizgisi
    claimLines += '+--------------';
    
    // Faiz türü ve oranı - dinamik olarak rate'den al
    const faizTuruLabel = data.interestInfo.type === 'TICARI' ? 'TİCARİ' : (data.interestInfo.type === 'YASAL' ? 'YASAL' : data.interestInfo.type);
    const faizOrani = data.interestInfo.rate ? `%${data.interestInfo.rate.toFixed(2).replace('.', ',')}` : '%24,00';
    
    // USD/EUR takiplerinde TL karşılığı
    let totalText = `${this.formatMoney(data.totals.total)} ${this.getCurrencySymbol(data.totals.currency)}`;
    if (data.totals.currency && !['TRY', 'TL'].includes(data.totals.currency)) {
      // Döviz alacağı - TL karşılığı belirtilmeli
      totalText += `\n(Takip tarihindeki TL karşılığı: .............. TL)`;
    }
    
    const interestDesc = `${this.formatMoney(data.totals.total)} ${this.getCurrencySymbol(data.totals.currency)} tutarındaki alacağın icra gideri, vek.ücr. ve takip tarihinden itibaren asıl alacağa işleyecek (YILLIK ${faizOrani} (${faizTuruLabel}) değişen oranlarda) faizi ile tahsili talebidir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan talep hakkımız saklıdır) TBK. 100.mad. gereğince kısmi ödemeler öncelikle işlemiş faiz, masraf ve fer'ilere mahsup edilecektir.`;
    
    // Madde 6 - İlam bilgisi
    const courtText = data.courtInfo 
      ? `${data.courtInfo.name}\nEsas No: ${data.courtInfo.caseNumber}\nKarar No: ${data.courtInfo.decisionNumber}\nKarar Tarihi: ${this.formatDate(data.courtInfo.decisionDate)}`
      : '';
    
    // Madde 7 - Kira bilgisi
    const leaseText = data.leaseInfo
      ? `${data.leaseInfo.leaseType}\nYıllık Kira: ${data.leaseInfo.yearlyRent}\nSözleşme: ${data.leaseInfo.contractType}\nAdres: ${data.leaseInfo.propertyAddress}`
      : '';
    
    // Madde 8 - Senet/Çek bilgisi veya borcun sebebi
    let instrumentText = '';
    if (data.instrumentInfo) {
      if (data.instrumentInfo.type === 'CEK') {
        instrumentText = `${this.formatMoney(data.totals.principal)} ${this.getCurrencySymbol(data.totals.currency)} ÇEK ALACAĞI\nÇek No: ${data.instrumentInfo.instrumentNo || ''}\nBanka: ${data.instrumentInfo.bankName || ''}\nİbraz Tarihi: ${data.instrumentInfo.presentationDate ? this.formatDate(data.instrumentInfo.presentationDate) : ''}`;
      } else {
        instrumentText = `${this.formatMoney(data.totals.principal)} ${this.getCurrencySymbol(data.totals.currency)} SENET/BONO ALACAĞI\nVade Tarihi: ${data.instrumentInfo.dueDate ? this.formatDate(data.instrumentInfo.dueDate) : ''}`;
      }
    } else if (data.claimItems.length > 0) {
      instrumentText = data.claimItems.map(item => {
        let line = `${this.formatMoney(item.amount)} ${this.getCurrencySymbol(item.currency)} ${item.description}`;
        if (item.dueDate) {
          line += ` (Tarih: ${this.formatDate(item.dueDate)})`;
        }
        return line;
      }).join('\n');
    }
    
    // Takip yolu
    const executionPathLabels: Record<string, string> = {
      'HACIZ': 'HACİZ',
      'HACIZ_TAHLIYE': 'HACİZ, TAHLİYE',
      'TAHLIYE': 'TAHLİYE',
      'IFLAS': 'İFLAS',
      'REHIN': 'REHİN',
    };
    const executionPath = executionPathLabels[data.executionPath] || data.executionPath || 'HACİZ';

    // Metni satırlara bölerek Paragraph dizisi oluştur
    const textToParagraphs = (text: string, fontSize: number = 16): Paragraph[] => {
      if (!text) return [new Paragraph({ children: [] })];
      const lines = text.split('\n');
      return lines.map(line => new Paragraph({
        children: [new TextRun({ text: line || ' ', size: fontSize, font: 'Courier New' })],
        spacing: { after: 20 }
      }));
    };

    // Tablo satırları oluştur - %25 sol (başlık), %75 sağ (değer) - çok satırlı destek
    const createTableRow = (label: string, value: string): TableRow => {
      return new TableRow({
        children: [
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            children: textToParagraphs(label, 16),
            borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } }
          }),
          new TableCell({
            width: { size: 75, type: WidthType.PERCENTAGE },
            children: textToParagraphs(value, 16),
            borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } }
          })
        ]
      });
    };

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        createTableRow('1-Alacaklının ve varsa kanuni temsilcisinin ve vekilinin adı, soyadı, vergi kimlik numarası, T.C. kimlik numarası, alacaklı veya vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve yerleşim yerindeki adresi:', creditorText),
        createTableRow('2-Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim yerindeki adresi:', debtorLines || ''),
        createTableRow('3-Takip terekeye karşı açılmışsa mirasçıların, adı, soyadı ve yerleşim yerindeki adresleri:', data.estateInfo ? data.estateInfo.heirs.map(h => `${h.name}\n${h.address}`).join('\n\n') : ''),
        createTableRow('4-Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli alacaklarda faizin miktarı ile işlemeye başladığı gün:', `${claimLines}\n${totalText}\n\n${interestDesc}`),
        createTableRow('5-Taşınır rehni veya ipotekle temin edilmiş olan bir alacak talebinde rehnedilenin ne olduğu:', data.collateralInfo ? `${data.collateralInfo.description}\n${data.collateralInfo.ownerName || ''}` : ''),
        createTableRow('6-Takip, ilâma veya ilâm hükmündeki belgeye müstenit ise ilâm veya belgeyi veren makamın adı, ilâm veya belgenin tarihi, numarası ve özeti:', courtText),
        createTableRow('7-Adî veya hasılat kiralarına ait takip talebi:', leaseText),
        createTableRow('8-Tevdi edilen senet (Poliçe, emre muharrer senet, çek) in tarih ve numarası, özeti, senede dayalı değilse borcun sebebi:', instrumentText),
        createTableRow('9-Alacaklının takip yollarından hangisini seçtiği:', `: ${executionPath}`),
      ]
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 454, right: 567, bottom: 454, left: 567 } } // 0.8cm top/bottom, 1cm left/right
        },
        children: [
          // Başlık satırı
          new Paragraph({
            children: [
              new TextRun({ text: 'TAKİP TALEBİ', bold: true, size: 24, font: 'Courier New' }),
              new TextRun({ text: '                                              Örnek No:1', size: 18, font: 'Courier New' })
            ],
            spacing: { after: 150 }
          }),
          // Tablo
          table,
          // Alt kısım
          new Paragraph({
            children: [new TextRun({ text: `Yukarıda yazdığım hakkımın alınmasını talep ederim. (İİK m.8, 58)`, size: 18, font: 'Courier New' })],
            spacing: { before: 150 }
          }),
          // Tarih
          new Paragraph({
            children: [new TextRun({ text: this.formatDate(data.filingDate), size: 18, font: 'Courier New' })],
            spacing: { before: 100 }
          }),
          // İmza
          new Paragraph({
            children: [new TextRun({ text: `${lawyer.name || 'Alacaklı'}\nAlacaklı veya Vekilinin İmzası`, size: 18, font: 'Courier New' })],
            alignment: AlignmentType.RIGHT,
            spacing: { before: 200 }
          })
        ]
      }]
    });

    return Packer.toBuffer(doc);
  }

  /**
   * Text içeriğini Word (DOCX) dosyasına dönüştür
   */
  private async textToWord(content: string, title: string): Promise<Buffer> {
    // Önce içeriği temizle - sondaki boşlukları kaldır ve ardışık boş satırları birleştir
    const cleanedContent = content
      .trim() // Baş ve sondaki boşlukları kaldır
      .replace(/\n{3,}/g, '\n\n'); // 3+ ardışık boş satırı 2'ye indir
    
    const lines = cleanedContent.split('\n');
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
    
    // İçerik satırları - boş satırları daha küçük spacing ile ekle
    lines.forEach(line => {
      const isEmpty = !line.trim();
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line || ' ',
              size: 20, // 10pt
              font: 'Courier New'
            })
          ],
          spacing: { 
            line: 240, // Single line spacing
            after: isEmpty ? 0 : 0 // Boş satırlar için ekstra boşluk yok
          }
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
          ...(data.instrumentInfo ? [{
            type: 'INSTRUMENT_INFO',
            title: 'Kambiyo Senedi Bilgileri',
            data: {
              instrumentInfo: data.instrumentInfo
            }
          }] : []),
          ...(data.leaseInfo ? [{
            type: 'LEASE_INFO',
            title: 'Kira Bilgileri',
            data: {
              leaseInfo: data.leaseInfo
            }
          }] : []),
          ...(data.courtInfo ? [{
            type: 'COURT_INFO',
            title: 'Mahkeme Bilgileri',
            data: {
              courtInfo: data.courtInfo
            }
          }] : []),
          ...(data.collateralInfo ? [{
            type: 'COLLATERAL_INFO',
            title: 'Rehin/İpotek Bilgileri',
            data: {
              collateralInfo: data.collateralInfo
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

  /**
   * Karşılıksız Çek Şikayet Dilekçesi Şablonu
   */
  private getKarsiliksizCekSikayetTemplate(): any {
    return {
      content: `
                              {{executionOffice.city}} İCRA CEZA MAHKEMESİNE

MÜŞTEKİ        : {{creditor.name}} {{#if creditor.identityNo}}({{#if creditor.isCompany}}VKN{{else}}TCKN{{/if}}: {{creditor.identityNo}}){{/if}}
                 {{creditor.address}}

VEKİLLERİ      : {{#each lawyers}}{{name}}
                 {{address}}
                 {{/each}}

SANIK          : {{debtor.name}} (TCKN: {{debtor.identityNo}})
                 {{debtor.address}}

SUÇ            : 5941 sayılı Kanuna Muhalefet Suçu (Karşılıksız Çek Keşide Etme Suçu)

SUÇ TARİHİ     : {{instrument.presentationDate}}

TANZİM EDİLDİĞİ YER : {{instrument.issuePlace}}

İBRAZ EDİLDİĞİ YER  : {{instrument.presentationBank}}

KONU           : Sanığın karşılıksız çek keşide etme suçundan cezalandırılması ve 
                 hakkında koruma tedbiri olarak "çek düzenleme ve çek hesabı açma yasağına" 
                 karar verilmesi istemidir.

AÇIKLAMALAR    :

1. Sanık {{debtor.name}} (TCKN: {{debtor.identityNo}}), {{instrument.bankName}} {{instrument.branchName}} nezdinde ki "{{instrument.serialNo}}" seri numaralı, {{instrument.issueDate}} baskı tarihli, {{instrument.dueDate}} keşide tarihli, {{instrument.amount}} {{instrument.currency}} ({{instrument.amountText}}) bedelli çeki keşide etmiştir.

2. Keşide tarihinde çek elinde olan hamil müvekkilim, {{instrument.serialNo}} seri numaralı çeki {{instrument.presentationDate}} tarihinde {{instrument.presentationBank}}'na ibraz etmiş ve çekin karşılıksız olduğu görülmüştür. Bu durum ise ibraz edilen banka şubesince "İşbu çekin ibraz tarihi itibariyle hesap bakiyesi 0,00 TRY'dir. {{instrument.bounceAmount}} TRY lik kısmı karşılıksızdır. Ancak takas sistemi kapsamında ödeme yapılamamıştır." denilerek çek arkasına işlenmiştir.

3. Bilindiği üzere karşılıksız çek keşide etme suçu, 5941 sayılı Kanun'un 5. Maddesinde düzenlenmiştir. Anılan kanunun maddesinde: "Üzerinde yazılı bulunan düzenleme tarihine göre kanuni ibraz süresi içinde ibrazında, çekle ilgili olarak "karşılıksızdır" işlemi yapılmasına sebebiyet veren kişi hakkında, hamilin şikâyeti üzerine, her bir çekle ilgili olarak binbeşyüz güne kadar adli para cezasına hükmolunur." denilmek suretiyle karşılıksız işlemine sebebiyet verilmesi halinde çeki bulunmasına sebebiyet veren kişi hakkında adli para cezasına hükmolunacağı açık bir şekilde belirtilmiştir. Somut olayda anılan hüküm uyarınca karşılıksız çek keşide etme suçunun tüm unsurlarının oluştuğu sabittir.

   Nitekim Yargıtay 10. Ceza Dairesi'nin 2002/27847 E. 2003/17400 K. Sayılı 24/06/2003 tarihli ilamında:

   "...Karşılıksız çek keşide etmek suçunda şikayet hakkı, çeki bankaya ibraz eden hamile ile bunun rücu hakkına sahip bulunduğu çek arkasındaki ciro zincirine imzaları bulunan kişilere ait olup..." denilerek şikayet hakkının, kendisine rücu edilen ve çeki elinde bulunduran cirantaya da ait olduğu belirtilmiştir. Somut olayda müvekkil şirketin, çeki bankaya ibraz eden hamil olarak yer aldığı ise tartışmasızdır.

4. Anılan kanun maddesi ile korunan hukuki yarar, kamu nezdinde çekin güvenilir bir ödeme aracı olmasını sağlamaktır. Söz konusu suç ise çekin muhatap bankaya ibrazı ve ibrazında çekle ilgili kısmen veya tamamen karşılıksız işlemi yapılması halinde oluşacaktır. Somut olayda müvekkil şirket tarafından anılan çek bankaya ibraz edilmiş ve ibrazında ise banka tarafından karşılıksızdır işlemi yapılmıştır. Tüm bu hususlar birlikte dikkate alındığında sanığın, isnat edilen suçu işlediği sabit olup, 5941 sayılı Kanun'a muhalefet suçundan cezalandırılması ve koruma tedbiri olarak çek düzenleme ve çek hesabı açma yasağına karar verilmesi gerekmektedir.

5. Bununla birlikte 15 Temmuz 2016 tarih ve 6728 sayılı Yatırım Ortamının İyileştirilmesi Amacıyla Bazı Kanunlarda değişiklik yapılmasına Dair Kanun'a göre 5941 sayılı Çek Kanunu'nda karşılıksız çek düzenleme suçu hüküm altına alınmıştır. Böylece 5941 sayılı Çek Kanunu'nun 5. Maddesine göre çekle ilgili olarak karşılıksızdır işlemi yapılmasına sebebiyet veren kişi hakkında koruma tedbiri (çek düzenleme ve çek hesabı açma yasağı) ve ceza yaptırımı öngörülmüştür.

   Ayrıca 5941 sayılı Kanunu'nun 5. Maddesine göre: "Bu davalar çekin tahsil için bankaya ibraz edildiği veya çek hesabının açıldığı banka şubesinin bulunduğu yer ya da hesap sahibinin yahut şikayetçinin, yerleşim yeri mahkemesinde görülür." denilmektedir. Bu doğrultuda değerlendirme yapıldığında Sayın Mahkemenizin yetkili olduğu sabittir.

6. Sanığın, 5941 sayılı Kanuna muhalefet etmek suretiyle karşılıksız çek keşide etmiş olması ve anılan hükümlerdeki yasal unsurların vuku bulması ve müşteki müvekkilin çek bedelini tahsil etmesinin mümkün olmaması sebepleriyle işbu şikayet yoluna başvurma, sanığın, 5941 sayılı Kanuna muhalefet suçundan cezalandırılmasını ve sanık hakkında koruma tedbirlerine başvurulmasını talep etme zaruriyeti hasıl olmuştur.

HUKUKİ NEDENLER : 5941 sayılı Kanun, 5237 sayılı TCK, 5271 sayılı CMK ve ilgili sair mevzuat hükümleri.

HUKUKİ DELİLLER :
   • "{{instrument.serialNo}}" seri numaralı, {{instrument.issueDate}} baskı tarihli, {{instrument.dueDate}} keşide tarihli, {{instrument.amount}} {{instrument.currency}} ({{instrument.amountText}}) bedelli çek,
   • Bilirkişi, yemin ve her türlü yasal delil.

NETİCE VE İSTEM : Yukarıda izah olunan ve re'sen dikkate alınacak nedenlerle:

1. Çekte karşılıksız işlemine sebebiyet vermek suçunu işleyen sanık aleyhine gerekli kovuşturmanın yapılarak 6728 sayılı Kanun ile yapılan son değişiklik neticesinde 5941 sayılı Kanuna muhalefet suçunu işlemiş olması sebebiyle sanığın atılı suçtan CEZALANDIRILMASINA ve hakkında KORUMA TEDBİRLERİNİN UYGULANMASINA,

2. Yargılama gideri ve vekâlet ücretinin karşı tarafa yükletilmesine karar verilmesini saygılarımızla bilvekale talep ederiz.

                                                    {{filingDate}}

                                                    Müşteki Vekili
                                                    {{lawyerNames}}
`
    };
  }

  /**
   * Karşılıksız Çek Şikayet Dilekçesi Oluştur
   */
  generateKarsiliksizCekSikayet(data: TemplateData): GeneratedDocument {
    const template = this.templates.get('KARSILIKSIZ_CEK_SIKAYET');
    if (!template) {
      throw new Error('Karşılıksız çek şikayet şablonu bulunamadı');
    }
    return {
      title: 'KARŞILIKSIZ ÇEK ŞİKAYET DİLEKÇESİ',
      content: this.renderTemplate(template, data),
      format: 'text',
      templateCode: 'KARSILIKSIZ_CEK_SIKAYET'
    };
  }

  /**
   * Case ID'den Karşılıksız Çek Şikayet Dilekçesi Oluştur
   */
  async generateKarsiliksizCekSikayetFromCase(caseId: string): Promise<GeneratedDocument> {
    const caseData = await this.getCaseData(caseId);
    
    // Çek bilgisi kontrolü
    if (!caseData.instrumentInfo || caseData.instrumentInfo.type !== 'CEK') {
      throw new Error('Bu dosyada çek bilgisi bulunamadı');
    }
    
    return this.generateKarsiliksizCekSikayet(caseData);
  }

  /**
   * Karşılıksız Çek Şikayet Dilekçesi Word (DOCX) formatında oluştur
   */
  async generateKarsiliksizCekSikayetWord(caseId: string): Promise<Buffer> {
    const doc = await this.generateKarsiliksizCekSikayetFromCase(caseId);
    return this.textToWord(doc.content, doc.title);
  }

  // ==================== İTİRAZIN İPTALİ DİLEKÇESİ ====================

  /**
   * İtirazın İptali Dava Dilekçesi şablonu
   */
  getItirazinIptaliTemplate(): string {
    return `
                              {{MAHKEME_ADI}}

DAVACI          : {{DAVACI_ADI}}
                  {{DAVACI_ADRES}}
                  
VEKİLİ          : {{VEKIL_ADI}}
                  {{VEKIL_ADRES}}
                  
DAVALI          : {{DAVALI_ADI}}
                  {{DAVALI_ADRES}}

KONU            : İtirazın iptali ve icra inkâr tazminatı talebidir.

DAVA DEĞERİ     : {{DAVA_DEGERI}} TL

AÇIKLAMALAR     :

1. Müvekkilimiz, davalıdan olan {{ALACAK_TUTARI}} TL alacağının tahsili için {{ICRA_DAIRESI}} {{DOSYA_NO}} sayılı dosyası ile icra takibi başlatmıştır.

2. Davalı borçlu, ödeme emrinin tebliği üzerine {{ITIRAZ_TARIHI}} tarihinde borca itiraz etmiştir.

3. Davalının itirazı haksız ve kötü niyetlidir. Şöyle ki;
   {{ITIRAZ_NEDENLERI}}

4. Alacağımız {{ALACAK_KAYNAGI}} kaynaklı olup, belgelerle sabittir.

5. İİK m. 67 gereğince itirazın iptali ile birlikte, davalının %20'den az olmamak üzere icra inkâr tazminatına mahkum edilmesini talep etmekteyiz.

HUKUKİ NEDENLER : İİK m. 67, HMK, TBK ve ilgili mevzuat.

DELİLLER        : 
- İcra dosyası ({{ICRA_DAIRESI}} {{DOSYA_NO}})
- Ödeme emri ve tebliğ belgesi
- İtiraz dilekçesi
- {{DIGER_DELILLER}}
- Bilirkişi incelemesi
- Tanık beyanları
- Yemin
- Her türlü yasal delil

SONUÇ VE İSTEM  : Yukarıda açıklanan nedenlerle;

1. Davalının {{ICRA_DAIRESI}} {{DOSYA_NO}} sayılı icra dosyasına yaptığı İTİRAZIN İPTALİNE,

2. Takibin devamına,

3. Davalının %20'den az olmamak üzere İCRA İNKÂR TAZMİNATINA mahkum edilmesine,

4. Yargılama giderleri ve vekalet ücretinin davalıya yükletilmesine,

karar verilmesini saygılarımızla arz ve talep ederiz. {{TARIH}}

                                                    Davacı Vekili
                                                    {{VEKIL_ADI}}
                                                    {{BARO_SICIL}}
`;
  }

  /**
   * İtirazın İptali Dilekçesi oluştur
   */
  async generateItirazinIptaliFromCase(caseId: string): Promise<{ title: string; content: string }> {
    const caseData = await this.getCaseData(caseId);
    
    const template = this.getItirazinIptaliTemplate();
    const today = new Date().toLocaleDateString('tr-TR');
    
    const davaci = caseData.creditors[0];
    const davali = caseData.debtors[0];
    const vekil = caseData.lawyers[0];
    
    const content = template
      .replace('{{MAHKEME_ADI}}', `${caseData.executionOffice.city} ASLİYE HUKUK MAHKEMESİ'NE`)
      .replace(/{{DAVACI_ADI}}/g, davaci?.name || '[DAVACI ADI]')
      .replace('{{DAVACI_ADRES}}', davaci?.address || '[DAVACI ADRESİ]')
      .replace(/{{VEKIL_ADI}}/g, vekil ? `Av. ${vekil.name}` : '[VEKİL ADI]')
      .replace('{{VEKIL_ADRES}}', vekil?.address || '[VEKİL ADRESİ]')
      .replace(/{{DAVALI_ADI}}/g, davali?.name || '[DAVALI ADI]')
      .replace('{{DAVALI_ADRES}}', davali?.address || '[DAVALI ADRESİ]')
      .replace('{{DAVA_DEGERI}}', caseData.totals.total.toLocaleString('tr-TR'))
      .replace('{{ALACAK_TUTARI}}', caseData.totals.total.toLocaleString('tr-TR'))
      .replace(/{{ICRA_DAIRESI}}/g, caseData.executionOffice.name)
      .replace(/{{DOSYA_NO}}/g, caseData.executionNumber || caseData.fileNumber)
      .replace('{{ITIRAZ_TARIHI}}', '[İTİRAZ TARİHİ]')
      .replace('{{ITIRAZ_NEDENLERI}}', '[İtiraz nedenleri ve çürütülmesi]')
      .replace('{{ALACAK_KAYNAGI}}', caseData.caseType === 'KAMBIYO' ? 'kambiyo senedi' : 'sözleşme')
      .replace('{{DIGER_DELILLER}}', caseData.instrumentInfo ? `${caseData.instrumentInfo.type === 'CEK' ? 'Çek' : 'Senet'} fotokopisi` : 'Sözleşme ve faturalar')
      .replace('{{TARIH}}', today)
      .replace('{{BARO_SICIL}}', vekil?.barNumber ? `${vekil.barCity} Barosu ${vekil.barNumber}` : '');
    
    return {
      title: `İtirazın İptali Dilekçesi - ${caseData.fileNumber}`,
      content,
    };
  }

  async generateItirazinIptaliWord(caseId: string): Promise<Buffer> {
    const doc = await this.generateItirazinIptaliFromCase(caseId);
    return this.textToWord(doc.content, doc.title);
  }


  // ==================== TASARRUFUN İPTALİ DİLEKÇESİ ====================

  /**
   * Tasarrufun İptali Dava Dilekçesi şablonu
   */
  getTasarrufunIptaliTemplate(): string {
    return `
                              {{MAHKEME_ADI}}

DAVACI          : {{DAVACI_ADI}}
                  {{DAVACI_ADRES}}
                  
VEKİLİ          : {{VEKIL_ADI}}
                  {{VEKIL_ADRES}}
                  
DAVALILAR       : 1. {{DAVALI_1_ADI}} (Borçlu)
                     {{DAVALI_1_ADRES}}
                  
                  2. {{DAVALI_2_ADI}} (Tasarrufu Alan 3. Kişi)
                     {{DAVALI_2_ADRES}}

KONU            : Tasarrufun iptali talebidir. (İİK m. 277-284)

DAVA DEĞERİ     : {{DAVA_DEGERI}} TL

AÇIKLAMALAR     :

1. Müvekkilimizin, davalı borçlu {{DAVALI_1_ADI}}'dan {{ALACAK_TUTARI}} TL alacağı bulunmaktadır. Bu alacak için {{ICRA_DAIRESI}} {{DOSYA_NO}} sayılı dosyası ile icra takibi başlatılmıştır.

2. Yapılan haciz işlemlerinde borçlunun haczi kabil malvarlığı bulunamamış ve {{ACIZ_BELGESI_TARIHI}} tarihli aciz belgesi düzenlenmiştir.

3. Ancak borçlu, alacaklılardan mal kaçırmak amacıyla {{TASARRUF_TARIHI}} tarihinde {{TASARRUF_KONUSU}} üzerindeki haklarını davalı {{DAVALI_2_ADI}}'a devretmiştir.

4. Bu tasarruf İİK m. 278 kapsamında iptal edilebilir niteliktedir. Şöyle ki;
   - Tasarruf, borçlunun aciz halinde iken yapılmıştır.
   - Tasarruf, karşılıksız veya düşük bedelle yapılmıştır.
   - Tasarrufun yapıldığı kişi, borçlunun mali durumunu bilmektedir.
   {{EK_IPTAL_NEDENLERI}}

5. İİK m. 280 gereğince, tasarrufun yapıldığı tarihten itibaren 5 yıl içinde dava açılmıştır.

HUKUKİ NEDENLER : İİK m. 277-284, TBK, HMK ve ilgili mevzuat.

DELİLLER        : 
- İcra dosyası ({{ICRA_DAIRESI}} {{DOSYA_NO}})
- Aciz belgesi
- Tapu kayıtları / Ticaret sicil kayıtları
- Tasarrufa ilişkin belgeler
- Tanık beyanları
- Bilirkişi incelemesi
- Her türlü yasal delil

SONUÇ VE İSTEM  : Yukarıda açıklanan nedenlerle;

1. Davalı borçlu {{DAVALI_1_ADI}}'ın {{TASARRUF_TARIHI}} tarihinde {{TASARRUF_KONUSU}} üzerinde yaptığı TASARRUFUN İPTALİNE,

2. Müvekkilimizin {{ALACAK_TUTARI}} TL alacağı ile fer'ileri için {{TASARRUF_KONUSU}} üzerinde cebri icra yapılmasına izin verilmesine,

3. Yargılama giderleri ve vekalet ücretinin davalılara yükletilmesine,

karar verilmesini saygılarımızla arz ve talep ederiz. {{TARIH}}

                                                    Davacı Vekili
                                                    {{VEKIL_ADI}}
                                                    {{BARO_SICIL}}
`;
  }

  /**
   * Tasarrufun İptali Dilekçesi oluştur
   */
  async generateTasarrufunIptaliFromCase(caseId: string): Promise<{ title: string; content: string }> {
    const caseData = await this.getCaseData(caseId);
    
    const template = this.getTasarrufunIptaliTemplate();
    const today = new Date().toLocaleDateString('tr-TR');
    
    const davaci = caseData.creditors[0];
    const davali1 = caseData.debtors[0];
    const vekil = caseData.lawyers[0];
    
    const content = template
      .replace('{{MAHKEME_ADI}}', `${caseData.executionOffice.city} ASLİYE HUKUK MAHKEMESİ'NE`)
      .replace(/{{DAVACI_ADI}}/g, davaci?.name || '[DAVACI ADI]')
      .replace('{{DAVACI_ADRES}}', davaci?.address || '[DAVACI ADRESİ]')
      .replace(/{{VEKIL_ADI}}/g, vekil ? `Av. ${vekil.name}` : '[VEKİL ADI]')
      .replace('{{VEKIL_ADRES}}', vekil?.address || '[VEKİL ADRESİ]')
      .replace(/{{DAVALI_1_ADI}}/g, davali1?.name || '[BORÇLU ADI]')
      .replace('{{DAVALI_1_ADRES}}', davali1?.address || '[BORÇLU ADRESİ]')
      .replace(/{{DAVALI_2_ADI}}/g, '[3. KİŞİ ADI]')
      .replace('{{DAVALI_2_ADRES}}', '[3. KİŞİ ADRESİ]')
      .replace(/{{DAVA_DEGERI}}/g, caseData.totals.total.toLocaleString('tr-TR'))
      .replace(/{{ALACAK_TUTARI}}/g, caseData.totals.total.toLocaleString('tr-TR'))
      .replace(/{{ICRA_DAIRESI}}/g, caseData.executionOffice.name)
      .replace(/{{DOSYA_NO}}/g, caseData.executionNumber || caseData.fileNumber)
      .replace('{{ACIZ_BELGESI_TARIHI}}', '[ACİZ BELGESİ TARİHİ]')
      .replace(/{{TASARRUF_TARIHI}}/g, '[TASARRUF TARİHİ]')
      .replace(/{{TASARRUF_KONUSU}}/g, '[TASARRUF KONUSU - Taşınmaz/Araç/Hisse vb.]')
      .replace('{{EK_IPTAL_NEDENLERI}}', '')
      .replace('{{TARIH}}', today)
      .replace('{{BARO_SICIL}}', vekil?.barNumber ? `${vekil.barCity} Barosu ${vekil.barNumber}` : '');
    
    return {
      title: `Tasarrufun İptali Dilekçesi - ${caseData.fileNumber}`,
      content,
    };
  }

  async generateTasarrufunIptaliWord(caseId: string): Promise<Buffer> {
    const doc = await this.generateTasarrufunIptaliFromCase(caseId);
    return this.textToWord(doc.content, doc.title);
  }

  // ==================== DOLANDIRICILIK SUÇ DUYURUSU ====================

  /**
   * Dolandırıcılık Suç Duyurusu şablonu
   */
  getDolandiricilikSucDuyurusuTemplate(): string {
    return `
                    {{SAVCILIK_ADI}}

ŞİKAYETÇİ       : {{SIKAYETCI_ADI}}
                  {{SIKAYETCI_ADRES}}
                  
VEKİLİ          : {{VEKIL_ADI}}
                  {{VEKIL_ADRES}}
                  
ŞÜPHELİ         : {{SUPHELI_ADI}}
                  {{SUPHELI_ADRES}}

SUÇ             : Dolandırıcılık (TCK m. 157-158)

SUÇ TARİHİ      : {{SUC_TARIHI}}

AÇIKLAMALAR     :

1. Şüpheli {{SUPHELI_ADI}}, müvekkilimizi hileli davranışlarla aldatarak {{ZARAR_TUTARI}} TL zarara uğratmıştır.

2. Olayın gelişimi şu şekildedir:
   {{OLAY_OZETI}}

3. Şüpheli, baştan itibaren borcunu ödememe niyetinde olup, müvekkilimizi kandırmak için çeşitli hileli davranışlarda bulunmuştur:
   {{HILELI_DAVRANISLAR}}

4. Müvekkilimiz, şüphelinin bu hileli davranışlarına güvenerek {{ZARAR_TUTARI}} TL tutarında zarara uğramıştır.

5. Şüphelinin eylemi TCK m. 157'de düzenlenen dolandırıcılık suçunu oluşturmaktadır.

HUKUKİ NEDENLER : TCK m. 157-158, CMK ve ilgili mevzuat.

DELİLLER        : 
- Sözleşme ve yazışmalar
- Banka dekontları / Havale makbuzları
- Tanık beyanları
- {{DIGER_DELILLER}}
- Her türlü yasal delil

SONUÇ VE İSTEM  : Yukarıda açıklanan nedenlerle;

1. Şüpheli hakkında DOLANDIRICILIK suçundan soruşturma başlatılmasını,

2. Şüphelinin tutuklanmasını,

3. Şüphelinin malvarlığı üzerine tedbir konulmasını,

4. Kamu davası açılmasını,

saygılarımızla arz ve talep ederiz. {{TARIH}}

                                                    Şikayetçi Vekili
                                                    {{VEKIL_ADI}}
                                                    {{BARO_SICIL}}
`;
  }

  async generateDolandiricilikSucDuyurusuFromCase(caseId: string): Promise<{ title: string; content: string }> {
    const caseData = await this.getCaseData(caseId);
    
    const template = this.getDolandiricilikSucDuyurusuTemplate();
    const today = new Date().toLocaleDateString('tr-TR');
    
    const sikayetci = caseData.creditors[0];
    const supheli = caseData.debtors[0];
    const vekil = caseData.lawyers[0];
    
    const content = template
      .replace('{{SAVCILIK_ADI}}', `${caseData.executionOffice.city} CUMHURİYET BAŞSAVCILIĞI'NA`)
      .replace(/{{SIKAYETCI_ADI}}/g, sikayetci?.name || '[ŞİKAYETÇİ ADI]')
      .replace('{{SIKAYETCI_ADRES}}', sikayetci?.address || '[ŞİKAYETÇİ ADRESİ]')
      .replace(/{{VEKIL_ADI}}/g, vekil ? `Av. ${vekil.name}` : '[VEKİL ADI]')
      .replace('{{VEKIL_ADRES}}', vekil?.address || '[VEKİL ADRESİ]')
      .replace(/{{SUPHELI_ADI}}/g, supheli?.name || '[ŞÜPHELİ ADI]')
      .replace('{{SUPHELI_ADRES}}', supheli?.address || '[ŞÜPHELİ ADRESİ]')
      .replace('{{SUC_TARIHI}}', '[SUÇ TARİHİ]')
      .replace(/{{ZARAR_TUTARI}}/g, caseData.totals.total.toLocaleString('tr-TR'))
      .replace('{{OLAY_OZETI}}', '[Olayın detaylı anlatımı]')
      .replace('{{HILELI_DAVRANISLAR}}', '[Hileli davranışların listesi]')
      .replace('{{DIGER_DELILLER}}', '')
      .replace('{{TARIH}}', today)
      .replace('{{BARO_SICIL}}', vekil?.barNumber ? `${vekil.barCity} Barosu ${vekil.barNumber}` : '');
    
    return {
      title: `Dolandırıcılık Suç Duyurusu - ${caseData.fileNumber}`,
      content,
    };
  }

  async generateDolandiricilikSucDuyurusuWord(caseId: string): Promise<Buffer> {
    const doc = await this.generateDolandiricilikSucDuyurusuFromCase(caseId);
    return this.textToWord(doc.content, doc.title);
  }
}
