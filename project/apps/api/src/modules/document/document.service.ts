import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TemplateService, DocumentData } from "./template.service";
import { TDocumentDefinitions } from "pdfmake/interfaces";

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);
  private printer: any;

  constructor(
    private prisma: PrismaService,
    private templateService: TemplateService
  ) {
    // pdfmake için basit bir yaklaşım kullanacağız
  }

  // Dosya verilerini hazırla
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DocumentController.getPreviewData() → GET /documents/case/:caseId/preview-data (belge veri önizleme)
  /// - DocumentController.getAvailableTemplates() → GET /documents/case/:caseId/available-templates (şablon önerisi)
  /// - DocumentService.generatePaymentOrder() → ödeme emri PDF verisi
  /// - DocumentService.generateSeizureNotice() → haciz müzekkeresi PDF verisi
  /// - DocumentService.generateSaleRequest() → satış talebi PDF verisi
  /// - DocumentService.generateUyapXml() → UYAP XML verisi
  /// - DocumentService.generateIhbarname89_1() → 89/1 ihbarname verisi
  /// - DocumentService.generateIhbarname89_2() → 89/2 ihbarname verisi
  /// - DocumentService.generateIhbarname89_3() → 89/3 ihbarname verisi
  /// - DocumentService.generateAlacakHacziTalebi() → alacak haczi talebi verisi
  /// </remarks>
  async prepareDocumentData(caseId: string, tenantId?: string): Promise<DocumentData> {
    const where = tenantId ? { id: caseId, tenantId } : { id: caseId };
    const caseData = await this.prisma.case.findFirst({
      where,
      include: {
        client: true,
        debtors: {
          where: { lifecycleStatus: 'ACTIVE' },
          include: { debtor: true },
        },
        lawyers: { include: { lawyer: true } },
        formType: true,
        collections: true,
        executionOffice: true, // İcra dairesi bilgilerini dahil et
        dues: true, // Alacak kalemlerini dahil et
      },
    });

    if (!caseData) {
      throw new NotFoundException("Dosya bulunamadı");
    }

    const debtor = caseData.debtors[0]?.debtor;
    if (!debtor) {
      throw new BadRequestException("Operasyonel çıktı için aktif borçlu bulunmuyor");
    }
    const lawyer = caseData.lawyers[0]?.lawyer;
    
    // Alacak kalemlerinden toplam hesapla
    const principal = caseData.dues
      ?.filter(d => d.type === 'PRINCIPAL')
      .reduce((sum, d) => sum + Number(d.amount), 0) || Number(caseData.principalAmount || 0);
    
    const interest = caseData.dues
      ?.filter(d => d.type === 'INTEREST')
      .reduce((sum, d) => sum + Number(d.amount), 0) || 0;
    
    const expenses = caseData.dues
      ?.filter(d => d.type === 'EXPENSE' || d.type === 'OTHER')
      .reduce((sum, d) => sum + Number(d.amount), 0) || 0;

    // Eğer dues yoksa eski hesaplama yöntemi
    const interestRate = Number(caseData.interestRate || 0);
    const daysSinceStart = caseData.startDate
      ? Math.floor((Date.now() - caseData.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const calculatedInterest = interest || (principal * interestRate * daysSinceStart) / 36500;

    return {
      fileNumber: caseData.fileNumber,
      executionOffice: caseData.executionOffice?.name || (caseData.metadata as any)?.executionOffice as string,
      // İcra Dairesi Detay Bilgileri
      executionOfficeDetails: caseData.executionOffice ? {
        name: caseData.executionOffice.name,
        uyapCode: caseData.executionOffice.uyapCode || undefined,
        taxNumber: caseData.executionOffice.taxNumber || undefined,
        bankName: caseData.executionOffice.bankName || undefined,
        branchName: caseData.executionOffice.branchName || undefined,
        iban: caseData.executionOffice.iban || undefined,
      } : undefined,
      creditor: {
        name: caseData.client?.name || "Alacaklı",
        identityNo: caseData.client?.identityNo || undefined,
        address: (caseData.client?.address as any)?.text,
      },
      debtor: {
        name: debtor?.name || "Borçlu",
        identityNo: debtor?.identityNo || undefined,
        address: (debtor?.addresses as any)?.primary,
      },
      lawyer: lawyer
        ? {
            name: `${lawyer.name} ${lawyer.surname}`,
            barNumber: lawyer.barNumber || undefined,
          }
        : undefined,
      amounts: {
        principal,
        interest: Math.round(calculatedInterest * 100) / 100,
        expenses,
        total: principal + calculatedInterest + expenses,
      },
      dates: {
        created: caseData.createdAt,
        dueDate: caseData.startDate || undefined,
      },
      formType: caseData.formType?.code,
      notes: caseData.notes || undefined,
    };
  }

  // Ödeme emri PDF oluştur
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DocumentController.getPaymentOrder() → GET /documents/case/:caseId/payment-order (ödeme emri PDF)
  /// </remarks>
  async generatePaymentOrder(caseId: string, tenantId?: string): Promise<Buffer> {
    const data = await this.prepareDocumentData(caseId, tenantId);
    const docDefinition = this.templateService.getPaymentOrderTemplate(data);
    return this.generatePdf(docDefinition);
  }

  // Haciz müzekkeresi PDF oluştur
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DocumentController.getSeizureNotice() → POST /documents/case/:caseId/seizure-notice (haciz müzekkeresi PDF)
  /// </remarks>
  async generateSeizureNotice(
    caseId: string,
    targetType: string,
    targetDetails: any,
    tenantId?: string,
  ): Promise<Buffer> {
    const data = await this.prepareDocumentData(caseId, tenantId);
    const docDefinition = this.templateService.getSeizureNoticeTemplate(
      data,
      targetType,
      targetDetails
    );
    return this.generatePdf(docDefinition);
  }

  // Satış talebi PDF oluştur
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DocumentController.getSaleRequest() → POST /documents/case/:caseId/sale-request (satış talebi PDF)
  /// </remarks>
  async generateSaleRequest(caseId: string, assetDetails: any, tenantId?: string): Promise<Buffer> {
    const data = await this.prepareDocumentData(caseId, tenantId);
    const docDefinition = this.templateService.getSaleRequestTemplate(data, assetDetails);
    return this.generatePdf(docDefinition);
  }

  // PDF oluştur (basit versiyon - gerçek implementasyon için pdfmake kullanılacak)
  private async generatePdf(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    // Basit bir text-based PDF simülasyonu
    // Gerçek implementasyonda pdfmake kullanılacak
    const content = JSON.stringify(docDefinition, null, 2);
    return Buffer.from(content, "utf-8");
  }

  // UYAP XML formatı oluştur
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DocumentController.getUyapXml() → GET /documents/case/:caseId/uyap-xml (UYAP XML belge üretimi)
  /// </remarks>
  async generateUyapXml(caseId: string, tenantId?: string): Promise<string> {
    const data = await this.prepareDocumentData(caseId, tenantId);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IcraTakip>
  <DosyaNo>${data.fileNumber}</DosyaNo>
  <TakipTuru>${data.formType || "GENEL"}</TakipTuru>
  <Alacakli>
    <AdSoyad>${data.creditor.name}</AdSoyad>
    <TCKimlikNo>${data.creditor.identityNo || ""}</TCKimlikNo>
    <Adres>${data.creditor.address || ""}</Adres>
  </Alacakli>
  <Borclu>
    <AdSoyad>${data.debtor.name}</AdSoyad>
    <TCKimlikNo>${data.debtor.identityNo || ""}</TCKimlikNo>
    <Adres>${data.debtor.address || ""}</Adres>
  </Borclu>
  <AlacakBilgileri>
    <AsilAlacak>${data.amounts.principal}</AsilAlacak>
    <Faiz>${data.amounts.interest}</Faiz>
    <Masraf>${data.amounts.expenses}</Masraf>
    <Toplam>${data.amounts.total}</Toplam>
  </AlacakBilgileri>
  <Tarih>${data.dates.created.toISOString()}</Tarih>
</IcraTakip>`;

    return xml;
  }

  // 89/1 Haciz İhbarnamesi PDF oluştur
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DocumentController.getIhbarname89_1() → POST /documents/case/:caseId/ihbarname-89-1 (89/1 ihbarname PDF)
  /// </remarks>
  async generateIhbarname89_1(
    caseId: string,
    thirdPartyDetails: {
      name: string;
      type: "BANKA" | "ISVEREN" | "KIRACI" | "DIGER";
      identityNo?: string;
      address?: string;
    },
    tenantId?: string,
  ): Promise<Buffer> {
    const data = await this.prepareDocumentData(caseId, tenantId);
    const docDefinition = this.templateService.getIhbarname89_1Template(data, thirdPartyDetails);
    return this.generatePdf(docDefinition);
  }

  // 89/2 Haciz İhbarnamesi PDF oluştur
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DocumentController.getIhbarname89_2() → POST /documents/case/:caseId/ihbarname-89-2 (89/2 ihbarname PDF)
  /// </remarks>
  async generateIhbarname89_2(
    caseId: string,
    thirdPartyDetails: {
      name: string;
      type: "BANKA" | "ISVEREN" | "KIRACI" | "DIGER";
      identityNo?: string;
      address?: string;
      firstIhbarnameDate: string;
    },
    tenantId?: string,
  ): Promise<Buffer> {
    const data = await this.prepareDocumentData(caseId, tenantId);
    const docDefinition = this.templateService.getIhbarname89_2Template(data, thirdPartyDetails);
    return this.generatePdf(docDefinition);
  }

  // 89/3 Haciz İhbarnamesi PDF oluştur
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DocumentController.getIhbarname89_3() → POST /documents/case/:caseId/ihbarname-89-3 (89/3 ihbarname PDF)
  /// </remarks>
  async generateIhbarname89_3(
    caseId: string,
    thirdPartyDetails: {
      name: string;
      type: "BANKA" | "ISVEREN" | "KIRACI" | "DIGER";
      identityNo?: string;
      address?: string;
      firstIhbarnameDate: string;
      secondIhbarnameDate: string;
    },
    tenantId?: string,
  ): Promise<Buffer> {
    const data = await this.prepareDocumentData(caseId, tenantId);
    const docDefinition = this.templateService.getIhbarname89_3Template(data, thirdPartyDetails);
    return this.generatePdf(docDefinition);
  }

  // Alacak Haczi Talebi (Dosya Haczi) PDF oluştur
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DocumentController.getAlacakHacziTalebi() → POST /documents/case/:caseId/alacak-haczi-talebi (alacak haczi talebi PDF)
  /// </remarks>
  async generateAlacakHacziTalebi(
    caseId: string,
    externalCaseDetails: {
      externalOffice: string;
      externalCaseNo: string;
      counterpartyName: string;
      claimAmount: number;
    },
    tenantId?: string,
  ): Promise<Buffer> {
    const data = await this.prepareDocumentData(caseId, tenantId);
    const docDefinition = this.templateService.getAlacakHacziTalebiTemplate(data, externalCaseDetails);
    return this.generatePdf(docDefinition);
  }

  // Belge listesi
  async getDocumentTypes() {
    return [
      { code: "PAYMENT_ORDER", name: "Ödeme Emri", description: "İcra takibi ödeme emri" },
      { code: "SEIZURE_BANK", name: "Banka Haciz Müzekkeresi", description: "Banka hesaplarına haciz" },
      { code: "SEIZURE_VEHICLE", name: "Araç Haciz Müzekkeresi", description: "Araç üzerine haciz" },
      { code: "SEIZURE_PROPERTY", name: "Taşınmaz Haciz Müzekkeresi", description: "Taşınmaz üzerine haciz" },
      { code: "SEIZURE_SALARY", name: "Maaş Haczi Müzekkeresi", description: "Maaş haczi" },
      { code: "SALE_REQUEST", name: "Satış Talebi", description: "Hacizli mal satış talebi" },
      { code: "IHBARNAME_89_1", name: "89/1 Haciz İhbarnamesi", description: "Birinci haciz ihbarnamesi (İİK m. 89/1)" },
      { code: "IHBARNAME_89_2", name: "89/2 Haciz İhbarnamesi", description: "İkinci haciz ihbarnamesi (İİK m. 89/2)" },
      { code: "IHBARNAME_89_3", name: "89/3 Haciz İhbarnamesi", description: "Üçüncü haciz ihbarnamesi (İİK m. 89/3)" },
      { code: "ALACAK_HACZI_TALEBI", name: "Alacak Haczi Talebi", description: "Dosya haczi / alacak haczi talebi" },
      { code: "UYAP_XML", name: "UYAP XML", description: "UYAP entegrasyon dosyası" },
    ];
  }
}
