import { Controller, Get, Post, Body, Query, Param, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { IsString, IsOptional, IsObject } from 'class-validator';
import { RelatedLawsuitsService, LawsuitAvailability, LawsuitRecommendation } from './related-lawsuits.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// ============================================
// DTO'LAR
// ============================================

export class CheckAvailableLawsuitsDto {
  @IsString()
  caseType: string;

  @IsString()
  stage: string;

  @IsOptional()
  @IsString()
  instrumentType?: string;

  @IsOptional()
  @IsObject()
  instrumentDates?: {
    presentationDate?: string;
    maturityDate?: string;
    objectionDate?: string;
  };
}

export class PrepareKarsiliksizCekDto {
  @IsObject()
  creditor: {
    name: string;
    identityNo?: string;
    address?: string;
  };

  @IsObject()
  debtor: {
    name: string;
    identityNo?: string;
    address?: string;
  };

  @IsObject()
  instrument: {
    serialNo: string;
    amount: number;
    currency?: string;
    bank: string;
    branch?: string;
    presentationDate: string;
    dishonorDate?: string;
    issuePlace?: string;
  };

  @IsOptional()
  @IsObject()
  lawyer?: {
    name: string;
    barNumber: string;
  };
}

// ============================================
// CONTROLLER
// ============================================

@Controller('related-lawsuits')
@UseGuards(JwtAuthGuard)
export class RelatedLawsuitsController {
  constructor(private readonly relatedLawsuitsService: RelatedLawsuitsService) {}

  /**
   * Tüm dava türlerini getir
   * GET /related-lawsuits/types
   */
  @Get('types')
  getAllLawsuitTypes() {
    return {
      types: this.relatedLawsuitsService.getAllLawsuitTypes(),
    };
  }

  /**
   * Belirli bir dava türünü getir
   * GET /related-lawsuits/types/:code
   */
  @Get('types/:code')
  getLawsuitType(@Param('code') code: string) {
    const type = this.relatedLawsuitsService.getLawsuitType(code);
    if (!type) {
      return { error: 'Dava türü bulunamadı' };
    }
    return { type };
  }

  /**
   * Takip türüne göre dava türlerini getir
   * GET /related-lawsuits/types/by-case-type?caseType=KAMBIYO
   */
  @Get('types/by-case-type')
  getLawsuitTypesForCaseType(@Query('caseType') caseType: string) {
    return {
      caseType,
      types: this.relatedLawsuitsService.getLawsuitTypesForCaseType(caseType),
    };
  }

  /**
   * Aşamaya göre dava türlerini getir
   * GET /related-lawsuits/types/by-stage?stage=OBJECTION
   */
  @Get('types/by-stage')
  getLawsuitTypesForStage(@Query('stage') stage: string) {
    return {
      stage,
      types: this.relatedLawsuitsService.getLawsuitTypesForStage(stage),
    };
  }

  /**
   * Dosya için açılabilecek davaları kontrol et
   * POST /related-lawsuits/check-available
   */
  @Post('check-available')
  checkAvailableLawsuits(@Body() dto: CheckAvailableLawsuitsDto): { lawsuits: LawsuitAvailability[] } {
    const lawsuits = this.relatedLawsuitsService.checkAvailableLawsuits({
      caseType: dto.caseType,
      stage: dto.stage,
      instrumentType: dto.instrumentType,
      instrumentDates: dto.instrumentDates ? {
        presentationDate: dto.instrumentDates.presentationDate ? new Date(dto.instrumentDates.presentationDate) : undefined,
        maturityDate: dto.instrumentDates.maturityDate ? new Date(dto.instrumentDates.maturityDate) : undefined,
        objectionDate: dto.instrumentDates.objectionDate ? new Date(dto.instrumentDates.objectionDate) : undefined,
      } : undefined,
    });

    return { lawsuits };
  }

  /**
   * Dosya için dava önerileri al
   * POST /related-lawsuits/recommendations
   */
  @Post('recommendations')
  getRecommendations(@Body() dto: CheckAvailableLawsuitsDto): { recommendations: LawsuitRecommendation[] } {
    const recommendations = this.relatedLawsuitsService.getRecommendations({
      caseType: dto.caseType,
      stage: dto.stage,
      instrumentType: dto.instrumentType,
      instrumentDates: dto.instrumentDates ? {
        presentationDate: dto.instrumentDates.presentationDate,
        maturityDate: dto.instrumentDates.maturityDate,
        objectionDate: dto.instrumentDates.objectionDate,
      } : undefined,
    });

    return { recommendations };
  }

  /**
   * Karşılıksız çek şikayet dilekçesi verilerini hazırla
   * POST /related-lawsuits/prepare/karsiliksiz-cek
   */
  @Post('prepare/karsiliksiz-cek')
  prepareKarsiliksizCek(@Body() dto: PrepareKarsiliksizCekDto) {
    const data = this.relatedLawsuitsService.prepareKarsiliksizCekData({
      creditor: dto.creditor,
      debtor: dto.debtor,
      instrument: dto.instrument,
      lawyer: dto.lawyer,
    });

    const templateInfo = this.relatedLawsuitsService.getTemplateInfo('KARSILIKSIZ_CEK_SIKAYET');
    const uyapDavaTuru = this.relatedLawsuitsService.getUyapDavaTuru('KARSILIKSIZ_CEK');
    const courtType = this.relatedLawsuitsService.getCourtType('KARSILIKSIZ_CEK');

    return {
      data,
      templateInfo,
      uyapDavaTuru,
      courtType,
    };
  }

  /**
   * UYAP dava türü kodunu getir
   * GET /related-lawsuits/uyap-code/:lawsuitCode
   */
  @Get('uyap-code/:lawsuitCode')
  getUyapCode(@Param('lawsuitCode') lawsuitCode: string) {
    const uyapCode = this.relatedLawsuitsService.getUyapDavaTuru(lawsuitCode);
    const courtType = this.relatedLawsuitsService.getCourtType(lawsuitCode);

    return {
      lawsuitCode,
      uyapDavaTuru: uyapCode,
      courtType,
    };
  }

  /**
   * Dilekçe şablonu bilgilerini getir
   * GET /related-lawsuits/template/:templateCode
   */
  @Get('template/:templateCode')
  getTemplateInfo(@Param('templateCode') templateCode: string) {
    const template = this.relatedLawsuitsService.getTemplateInfo(templateCode);
    if (!template) {
      return { error: 'Şablon bulunamadı' };
    }
    return { template };
  }

  // ============================================
  // DİLEKÇE OLUŞTURMA ENDPOINT'LERİ
  // ============================================

  /**
   * Karşılıksız çek şikayet dilekçesi oluştur - Case ID ile
   * GET /related-lawsuits/generate/karsiliksiz-cek/:caseId
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - RelatedLawsuitsController.generateKarsiliksizCekSikayet() → GET /related-lawsuits/generate/karsiliksiz-cek/:caseId (karşılıksız çek şikayet üretimi)
  /// </remarks>
  @Get('generate/karsiliksiz-cek/:caseId')
  async generateKarsiliksizCekSikayet(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const document = await this.relatedLawsuitsService.generateKarsiliksizCekSikayet(caseId, tenantId);
    return { document };
  }

  /**
   * Karşılıksız çek şikayet dilekçesi önizleme - Case ID ile
   * GET /related-lawsuits/generate/karsiliksiz-cek/:caseId/preview
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - RelatedLawsuitsController.previewKarsiliksizCekSikayet() → GET /related-lawsuits/generate/karsiliksiz-cek/:caseId/preview (karşılıksız çek şikayet önizleme)
  /// </remarks>
  @Get('generate/karsiliksiz-cek/:caseId/preview')
  async previewKarsiliksizCekSikayet(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const document = await this.relatedLawsuitsService.generateKarsiliksizCekSikayet(caseId, tenantId);
    const html = `
      <div style="font-family: 'Courier New', monospace; white-space: pre-wrap; padding: 20px; background: white; border: 1px solid #ccc;">
        ${document.content.replace(/\n/g, '<br>')}
      </div>
    `;
    return { html };
  }

  /**
   * Karşılıksız çek şikayet dilekçesi Word indir - Case ID ile
   * GET /related-lawsuits/generate/karsiliksiz-cek/:caseId/word
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - RelatedLawsuitsController.downloadKarsiliksizCekSikayetWord() → GET /related-lawsuits/generate/karsiliksiz-cek/:caseId/word (karşılıksız çek şikayet Word indirme)
  /// </remarks>
  @Get('generate/karsiliksiz-cek/:caseId/word')
  async downloadKarsiliksizCekSikayetWord(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ) {
    const wordBuffer = await this.relatedLawsuitsService.generateKarsiliksizCekSikayetWord(caseId, tenantId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="karsiliksiz-cek-sikayet-${caseId}.docx"`);
    res.send(wordBuffer);
  }
}
