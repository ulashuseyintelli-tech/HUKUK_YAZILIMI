import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  UseGuards,
  Header,
  Query,
} from "@nestjs/common";
import { Response } from "express";
import { DocumentService } from "./document.service";
import { DocumentTemplateService } from "./document-template.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("documents")
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(
    private documentService: DocumentService,
    private documentTemplateService: DocumentTemplateService,
  ) {}

  // Belge türleri listesi
  @Get("types")
  async getDocumentTypes() {
    return this.documentService.getDocumentTypes();
  }

  // Ödeme emri PDF
  @Get("case/:caseId/payment-order")
  @Header("Content-Type", "application/pdf")
  async getPaymentOrder(@Param("caseId") caseId: string, @Res() res: Response) {
    const pdf = await this.documentService.generatePaymentOrder(caseId);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="odeme-emri-${caseId}.pdf"`
    );
    res.send(pdf);
  }

  // Haciz müzekkeresi PDF
  @Post("case/:caseId/seizure-notice")
  @Header("Content-Type", "application/pdf")
  async getSeizureNotice(
    @Param("caseId") caseId: string,
    @Body() body: { targetType: string; targetDetails: any },
    @Res() res: Response
  ) {
    const pdf = await this.documentService.generateSeizureNotice(
      caseId,
      body.targetType,
      body.targetDetails
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="haciz-muzekkeresi-${caseId}.pdf"`
    );
    res.send(pdf);
  }

  // Satış talebi PDF
  @Post("case/:caseId/sale-request")
  @Header("Content-Type", "application/pdf")
  async getSaleRequest(
    @Param("caseId") caseId: string,
    @Body() body: { assetDetails: any },
    @Res() res: Response
  ) {
    const pdf = await this.documentService.generateSaleRequest(
      caseId,
      body.assetDetails
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="satis-talebi-${caseId}.pdf"`
    );
    res.send(pdf);
  }

  // UYAP XML
  @Get("case/:caseId/uyap-xml")
  @Header("Content-Type", "application/xml")
  async getUyapXml(@Param("caseId") caseId: string, @Res() res: Response) {
    const xml = await this.documentService.generateUyapXml(caseId);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="uyap-${caseId}.xml"`
    );
    res.send(xml);
  }

  // Dosya verilerini önizle
  @Get("case/:caseId/preview-data")
  async getPreviewData(@Param("caseId") caseId: string) {
    return this.documentService.prepareDocumentData(caseId);
  }

  // ==================== BELGE ŞABLONLARI ====================

  // Tüm şablonları listele
  @Get("templates")
  async getTemplates(
    @Query("category") category?: string,
    @Query("subCategory") subCategory?: string,
  ) {
    return this.documentTemplateService.findAll(category, subCategory);
  }

  // Tek şablon getir
  @Get("templates/:code")
  async getTemplateByCode(@Param("code") code: string) {
    return this.documentTemplateService.findByCode(code);
  }

  // Dosya için uygun şablonları getir
  @Get("case/:caseId/available-templates")
  async getAvailableTemplates(@Param("caseId") caseId: string) {
    const caseData = await this.documentService.prepareDocumentData(caseId);
    const subCategory = (caseData as any).subCategory || "GENEL";
    const currency = (caseData as any).currency || "TRY";

    // Tüm şablonları getir, frontend filtreleyebilir
    const templates = await this.documentTemplateService.findAll();

    // Önerilen şablonları işaretle
    return templates.map((t: any) => ({
      ...t,
      isRecommended:
        t.subCategory === subCategory ||
        t.subCategory === null ||
        (t.currency === currency || t.currency === null),
    }));
  }

  // Şablondan belge üret (HTML)
  @Get("case/:caseId/generate/:templateCode")
  async generateFromTemplate(
    @Param("caseId") caseId: string,
    @Param("templateCode") templateCode: string,
  ) {
    const content = await this.documentTemplateService.generateDocument(
      caseId,
      templateCode,
    );
    const template =
      await this.documentTemplateService.findByCode(templateCode);

    return {
      templateCode,
      templateName: template.name,
      title: template.title,
      content,
      generatedAt: new Date().toISOString(),
    };
  }

  // Şablon önizleme (değişkenlerle)
  @Post("templates/:code/preview")
  async previewTemplate(
    @Param("code") code: string,
    @Body() variables: Record<string, any>,
  ) {
    const template = await this.documentTemplateService.findByCode(code);
    const content = this.documentTemplateService.renderTemplate(
      template.templateContent,
      variables,
    );

    return {
      templateCode: code,
      templateName: template.name,
      content,
    };
  }

  // ==================== 89 İHBARNAME BELGELERİ ====================

  // 89/1 Haciz İhbarnamesi PDF
  @Post("case/:caseId/ihbarname-89-1")
  @Header("Content-Type", "application/pdf")
  async getIhbarname89_1(
    @Param("caseId") caseId: string,
    @Body() body: {
      name: string;
      type: "BANKA" | "ISVEREN" | "KIRACI" | "DIGER";
      identityNo?: string;
      address?: string;
    },
    @Res() res: Response
  ) {
    const pdf = await this.documentService.generateIhbarname89_1(caseId, body);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="89-1-ihbarname-${caseId}.pdf"`
    );
    res.send(pdf);
  }

  // 89/2 Haciz İhbarnamesi PDF
  @Post("case/:caseId/ihbarname-89-2")
  @Header("Content-Type", "application/pdf")
  async getIhbarname89_2(
    @Param("caseId") caseId: string,
    @Body() body: {
      name: string;
      type: "BANKA" | "ISVEREN" | "KIRACI" | "DIGER";
      identityNo?: string;
      address?: string;
      firstIhbarnameDate: string;
    },
    @Res() res: Response
  ) {
    const pdf = await this.documentService.generateIhbarname89_2(caseId, body);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="89-2-ihbarname-${caseId}.pdf"`
    );
    res.send(pdf);
  }

  // 89/3 Haciz İhbarnamesi PDF
  @Post("case/:caseId/ihbarname-89-3")
  @Header("Content-Type", "application/pdf")
  async getIhbarname89_3(
    @Param("caseId") caseId: string,
    @Body() body: {
      name: string;
      type: "BANKA" | "ISVEREN" | "KIRACI" | "DIGER";
      identityNo?: string;
      address?: string;
      firstIhbarnameDate: string;
      secondIhbarnameDate: string;
    },
    @Res() res: Response
  ) {
    const pdf = await this.documentService.generateIhbarname89_3(caseId, body);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="89-3-ihbarname-${caseId}.pdf"`
    );
    res.send(pdf);
  }

  // Alacak Haczi Talebi (Dosya Haczi) PDF
  @Post("case/:caseId/alacak-haczi-talebi")
  @Header("Content-Type", "application/pdf")
  async getAlacakHacziTalebi(
    @Param("caseId") caseId: string,
    @Body() body: {
      externalOffice: string;
      externalCaseNo: string;
      counterpartyName: string;
      claimAmount: number;
    },
    @Res() res: Response
  ) {
    const pdf = await this.documentService.generateAlacakHacziTalebi(caseId, body);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="alacak-haczi-talebi-${caseId}.pdf"`
    );
    res.send(pdf);
  }
}
