import { Controller, Get, Post, Body, Param, UseGuards, Res, Query } from '@nestjs/common';
import { Response } from 'express';
import { IsString, IsOptional, IsArray, IsObject, ValidateNested, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TemplateEngineService, TemplateData, GeneratedDocument, UdfDocument } from './template-engine.service';

// Nested DTO'lar
class ExecutionOfficeDto {
  @IsString()
  name: string;

  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  uyapCode?: string;
}

class CreditorDto {
  @IsString()
  type: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  identityNo?: string;

  @IsOptional()
  @IsString()
  taxNo?: string;

  @IsOptional()
  @IsString()
  taxOffice?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;
}

class LawyerDto {
  @IsString()
  name: string;

  @IsString()
  barNumber: string;

  @IsString()
  barCity: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  fax?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  iban?: string;
}

class DebtorDto {
  @IsString()
  type: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  identityNo?: string;

  @IsOptional()
  @IsString()
  taxNo?: string;

  @IsOptional()
  @IsString()
  taxOffice?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

class ClaimItemDto {
  @IsString()
  type: string;

  @IsString()
  description: string;

  @IsNumber()
  amount: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  dueDate?: string;
}

class TotalsDto {
  @IsNumber()
  principal: number;

  @IsNumber()
  interest: number;

  @IsNumber()
  fees: number;

  @IsNumber()
  total: number;

  @IsString()
  currency: string;
}

class InterestInfoDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsString()
  description: string;

  @IsBoolean()
  variableRate: boolean;
}

class SourceDocumentDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  bank?: string;

  @IsOptional()
  @IsString()
  branch?: string;
}

// Ana DTO
export class GenerateTakipTalebiDto {
  @IsString()
  fileNumber: string;

  @IsString()
  filingDate: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ExecutionOfficeDto)
  executionOffice: ExecutionOfficeDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditorDto)
  creditors: CreditorDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LawyerDto)
  lawyers: LawyerDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DebtorDto)
  debtors: DebtorDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClaimItemDto)
  claimItems: ClaimItemDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => TotalsDto)
  totals: TotalsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => InterestInfoDto)
  interestInfo: InterestInfoDto;

  @IsString()
  caseType: string;

  @IsString()
  subCategory: string;

  @IsString()
  executionPath: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SourceDocumentDto)
  sourceDocument?: SourceDocumentDto;
}

@Controller('template-engine')
@UseGuards(JwtAuthGuard)
export class TemplateEngineController {
  constructor(private readonly templateEngineService: TemplateEngineService) {}

  /**
   * Takip Talebi (Örnek 1) belgesi oluştur - JSON data ile
   */
  @Post('takip-talebi')
  generateTakipTalebi(@Body() dto: GenerateTakipTalebiDto): GeneratedDocument {
    return this.templateEngineService.generateTakipTalebi(dto as TemplateData);
  }

  /**
   * Takip Talebi (Örnek 1) belgesi oluştur - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.generateTakipTalebiFromCase() → GET /template-engine/takip-talebi/case/:caseId (case bazlı takip talebi üretimi)
  /// </remarks>
  @Get('takip-talebi/case/:caseId')
  async generateTakipTalebiFromCase(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<GeneratedDocument> {
    return this.templateEngineService.generateTakipTalebiFromCase(caseId, tenantId);
  }

  /**
   * Takip Talebi önizleme - HTML formatında
   */
  @Post('takip-talebi/preview')
  previewTakipTalebi(@Body() dto: GenerateTakipTalebiDto): { html: string } {
    const doc = this.templateEngineService.generateTakipTalebi(dto as TemplateData);
    // Text'i HTML'e çevir (basit dönüşüm)
    const html = `
      <div style="font-family: 'Courier New', monospace; white-space: pre-wrap; padding: 20px; background: white; border: 1px solid #ccc;">
        ${doc.content.replace(/\n/g, '<br>')}
      </div>
    `;
    return { html };
  }

  /**
   * Takip Talebi indir - Text dosyası olarak
   */
  @Post('takip-talebi/download')
  downloadTakipTalebi(@Body() dto: GenerateTakipTalebiDto, @Res() res: Response): void {
    const doc = this.templateEngineService.generateTakipTalebi(dto as TemplateData);
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="takip-talebi-${dto.fileNumber || 'belge'}.txt"`);
    res.send(doc.content);
  }

  /**
   * Mevcut şablon listesi
   */
  @Get('templates')
  getTemplates(): Array<{ code: string; name: string; category: string }> {
    return this.templateEngineService.getAvailableTemplates();
  }

  /**
   * Ödeme Emri (Örnek 7) belgesi oluştur - JSON data ile
   */
  @Post('odeme-emri')
  generateOdemeEmri(@Body() dto: GenerateTakipTalebiDto): GeneratedDocument {
    return this.templateEngineService.generateOdemeEmri(dto as TemplateData);
  }

  /**
   * Ödeme Emri (Örnek 7) belgesi oluştur - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.generateOdemeEmriFromCase() → GET /template-engine/odeme-emri/case/:caseId (case bazlı ödeme emri üretimi)
  /// </remarks>
  @Get('odeme-emri/case/:caseId')
  async generateOdemeEmriFromCase(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<GeneratedDocument> {
    return this.templateEngineService.generateOdemeEmriFromCase(caseId, tenantId);
  }

  /**
   * İcra Emri (Örnek 4-5) belgesi oluştur - JSON data ile
   */
  @Post('icra-emri')
  generateIcraEmri(@Body() dto: GenerateTakipTalebiDto): GeneratedDocument {
    return this.templateEngineService.generateIcraEmri(dto as TemplateData);
  }

  /**
   * İcra Emri (Örnek 4-5) belgesi oluştur - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.generateIcraEmriFromCase() → GET /template-engine/icra-emri/case/:caseId (case bazlı icra emri üretimi)
  /// </remarks>
  @Get('icra-emri/case/:caseId')
  async generateIcraEmriFromCase(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<GeneratedDocument> {
    return this.templateEngineService.generateIcraEmriFromCase(caseId, tenantId);
  }

  /**
   * Haciz Tutanağı belgesi oluştur - JSON data ile
   */
  @Post('haciz-tutanagi')
  generateHacizTutanagi(@Body() dto: GenerateTakipTalebiDto): GeneratedDocument {
    return this.templateEngineService.generateHacizTutanagi(dto as TemplateData);
  }

  // ============================================
  // PDF EXPORT ENDPOINT'LERİ
  // ============================================

  /**
   * Takip Talebi PDF indir - JSON data ile
   */
  @Post('takip-talebi/pdf')
  async downloadTakipTalebiPdf(@Body() dto: GenerateTakipTalebiDto, @Res() res: Response): Promise<void> {
    try {
      console.log('[TemplateEngine] PDF oluşturuluyor:', dto.fileNumber);
      const pdfBuffer = await this.templateEngineService.generateTakipTalebiPdf(dto as TemplateData);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="takip-talebi-${dto.fileNumber || 'belge'}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('[TemplateEngine] PDF oluşturma hatası:', error);
      res.status(500).json({ message: error.message || 'PDF oluşturulamadı' });
    }
  }

  /**
   * Takip Talebi PDF indir - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.downloadPdfFromCase() → GET /template-engine/case/:caseId/pdf (case bazlı PDF indirme)
  /// </remarks>
  @Get('case/:caseId/pdf')
  async downloadPdfFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    const pdfBuffer = await this.templateEngineService.generatePdfFromCase(caseId, documentType, tenantId);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${documentType}-${caseId}.pdf"`);
    res.send(pdfBuffer);
  }

  // ============================================
  // WORD (DOCX) EXPORT ENDPOINT'LERİ
  // ============================================

  /**
   * Takip Talebi Word indir - JSON data ile
   */
  @Post('takip-talebi/word')
  async downloadTakipTalebiWord(@Body() dto: GenerateTakipTalebiDto, @Res() res: Response): Promise<void> {
    try {
      console.log('[TemplateEngine] Word oluşturuluyor:', dto.fileNumber);
      console.log('[TemplateEngine] Gelen veri:', JSON.stringify(dto, null, 2));
      const wordBuffer = await this.templateEngineService.generateTakipTalebiWord(dto as TemplateData);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="takip-talebi-${dto.fileNumber || 'belge'}.docx"`);
      res.send(wordBuffer);
    } catch (error: any) {
      console.error('[TemplateEngine] Word oluşturma hatası:', error);
      res.status(500).json({ message: error.message || 'Word oluşturulamadı' });
    }
  }

  /**
   * Takip Talebi Word indir - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.downloadWordFromCase() → GET /template-engine/case/:caseId/word (case bazlı Word indirme)
  /// </remarks>
  @Get('case/:caseId/word')
  async downloadWordFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateWordFromCase(caseId, documentType, tenantId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${documentType}-${caseId}.docx"`);
    res.send(wordBuffer);
  }

  // ============================================
  // UDF (UYAP DOCUMENT FORMAT) ENDPOINT'LERİ
  // ============================================

  /**
   * Takip Talebi UDF oluştur - JSON data ile (UYAP'a gönderim için)
   */
  @Post('takip-talebi/udf')
  generateTakipTalebiUdf(@Body() dto: GenerateTakipTalebiDto): UdfDocument {
    return this.templateEngineService.generateTakipTalebiUdf(dto as TemplateData);
  }

  /**
   * UDF oluştur - Case ID ile (UYAP'a gönderim için)
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.generateUdfFromCase() → GET /template-engine/case/:caseId/udf (case bazlı UDF üretimi)
  /// </remarks>
  @Get('case/:caseId/udf')
  async generateUdfFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<UdfDocument> {
    return this.templateEngineService.generateUdfFromCase(caseId, documentType, tenantId);
  }

  /**
   * UDF dosyası indir - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.downloadUdfFromCase() → GET /template-engine/case/:caseId/udf/download (case bazlı UDF indirme)
  /// </remarks>
  @Get('case/:caseId/udf/download')
  async downloadUdfFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    const udfDocument = await this.templateEngineService.generateUdfFromCase(caseId, documentType, tenantId);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${documentType}-${caseId}.udf"`);
    res.send(JSON.stringify(udfDocument, null, 2));
  }

  // ============================================
  // XML EXPORT ENDPOINT'LERİ
  // ============================================

  /**
   * Takip Talebi XML indir - JSON data ile
   */
  @Post('takip-talebi/xml')
  async downloadTakipTalebiXml(@Body() dto: GenerateTakipTalebiDto, @Res() res: Response): Promise<void> {
    try {
      console.log('[TemplateEngine] XML oluşturuluyor:', dto.fileNumber);
      const xmlContent = this.templateEngineService.generateTakipTalebiXml(dto as any);
      
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="takip-talebi-${dto.fileNumber || 'belge'}.xml"`);
      res.send(xmlContent);
    } catch (error: any) {
      console.error('[TemplateEngine] XML oluşturma hatası:', error);
      res.status(500).json({ message: error.message || 'XML oluşturulamadı' });
    }
  }

  /**
   * Takip Talebi XML indir - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.downloadXmlFromCase() → GET /template-engine/case/:caseId/xml (case bazlı XML indirme)
  /// </remarks>
  @Get('case/:caseId/xml')
  async downloadXmlFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    const xmlContent = await this.templateEngineService.generateXmlFromCase(caseId, documentType, tenantId);
    
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${documentType}-${caseId}.xml"`);
    res.send(xmlContent);
  }

  // ============================================
  // KARŞILIKSIZ ÇEK ŞİKAYET DİLEKÇESİ ENDPOINT'LERİ
  // ============================================

  /**
   * Karşılıksız Çek Şikayet Dilekçesi oluştur - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.generateKarsiliksizCekSikayetFromCase() → GET /template-engine/karsiliksiz-cek/case/:caseId (karşılıksız çek şikayet üretimi)
  /// </remarks>
  @Get('karsiliksiz-cek/case/:caseId')
  async generateKarsiliksizCekSikayetFromCase(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<GeneratedDocument> {
    return this.templateEngineService.generateKarsiliksizCekSikayetFromCase(caseId, tenantId);
  }

  /**
   * Karşılıksız Çek Şikayet Dilekçesi önizleme - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.previewKarsiliksizCekSikayet() → GET /template-engine/karsiliksiz-cek/case/:caseId/preview (karşılıksız çek şikayet önizleme)
  /// </remarks>
  @Get('karsiliksiz-cek/case/:caseId/preview')
  async previewKarsiliksizCekSikayet(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<{ html: string }> {
    const doc = await this.templateEngineService.generateKarsiliksizCekSikayetFromCase(caseId, tenantId);
    const html = `
      <div style="font-family: 'Courier New', monospace; white-space: pre-wrap; padding: 20px; background: white; border: 1px solid #ccc;">
        ${doc.content.replace(/\n/g, '<br>')}
      </div>
    `;
    return { html };
  }

  /**
   * Karşılıksız Çek Şikayet Dilekçesi Word indir - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.downloadKarsiliksizCekSikayetWord() → GET /template-engine/karsiliksiz-cek/case/:caseId/word (karşılıksız çek şikayet Word indirme)
  /// </remarks>
  @Get('karsiliksiz-cek/case/:caseId/word')
  async downloadKarsiliksizCekSikayetWord(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateKarsiliksizCekSikayetWord(caseId, tenantId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="karsiliksiz-cek-sikayet-${caseId}.docx"`);
    res.send(wordBuffer);
  }

  /**
   * Karşılıksız Çek Şikayet Dilekçesi Text indir - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.downloadKarsiliksizCekSikayet() → GET /template-engine/karsiliksiz-cek/case/:caseId/download (karşılıksız çek şikayet metin indirme)
  /// </remarks>
  @Get('karsiliksiz-cek/case/:caseId/download')
  async downloadKarsiliksizCekSikayet(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    const doc = await this.templateEngineService.generateKarsiliksizCekSikayetFromCase(caseId, tenantId);
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="karsiliksiz-cek-sikayet-${caseId}.txt"`);
    res.send(doc.content);
  }

  // ============================================
  // İTİRAZIN İPTALİ DİLEKÇESİ ENDPOINT'LERİ
  // ============================================

  /**
   * İtirazın İptali Dilekçesi oluştur - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.generateItirazinIptaliFromCase() → GET /template-engine/itirazin-iptali/case/:caseId (itirazın iptali dilekçe üretimi)
  /// </remarks>
  @Get('itirazin-iptali/case/:caseId')
  async generateItirazinIptaliFromCase(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<{ title: string; content: string }> {
    return this.templateEngineService.generateItirazinIptaliFromCase(caseId, tenantId);
  }

  /**
   * İtirazın İptali Dilekçesi önizleme
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.previewItirazinIptali() → GET /template-engine/itirazin-iptali/case/:caseId/preview (itirazın iptali önizleme)
  /// </remarks>
  @Get('itirazin-iptali/case/:caseId/preview')
  async previewItirazinIptali(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<{ html: string }> {
    const doc = await this.templateEngineService.generateItirazinIptaliFromCase(caseId, tenantId);
    const html = `
      <div style="font-family: 'Courier New', monospace; white-space: pre-wrap; padding: 20px; background: white; border: 1px solid #ccc;">
        ${doc.content.replace(/\n/g, '<br>')}
      </div>
    `;
    return { html };
  }

  /**
   * İtirazın İptali Dilekçesi Word indir
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.downloadItirazinIptaliWord() → GET /template-engine/itirazin-iptali/case/:caseId/word (itirazın iptali Word indirme)
  /// </remarks>
  @Get('itirazin-iptali/case/:caseId/word')
  async downloadItirazinIptaliWord(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateItirazinIptaliWord(caseId, tenantId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="itirazin-iptali-${caseId}.docx"`);
    res.send(wordBuffer);
  }

  // ============================================
  // TASARRUFUN İPTALİ DİLEKÇESİ ENDPOINT'LERİ
  // ============================================

  /**
   * Tasarrufun İptali Dilekçesi oluştur - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.generateTasarrufunIptaliFromCase() → GET /template-engine/tasarrufun-iptali/case/:caseId (tasarrufun iptali dilekçe üretimi)
  /// </remarks>
  @Get('tasarrufun-iptali/case/:caseId')
  async generateTasarrufunIptaliFromCase(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<{ title: string; content: string }> {
    return this.templateEngineService.generateTasarrufunIptaliFromCase(caseId, tenantId);
  }

  /**
   * Tasarrufun İptali Dilekçesi önizleme
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.previewTasarrufunIptali() → GET /template-engine/tasarrufun-iptali/case/:caseId/preview (tasarrufun iptali önizleme)
  /// </remarks>
  @Get('tasarrufun-iptali/case/:caseId/preview')
  async previewTasarrufunIptali(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<{ html: string }> {
    const doc = await this.templateEngineService.generateTasarrufunIptaliFromCase(caseId, tenantId);
    const html = `
      <div style="font-family: 'Courier New', monospace; white-space: pre-wrap; padding: 20px; background: white; border: 1px solid #ccc;">
        ${doc.content.replace(/\n/g, '<br>')}
      </div>
    `;
    return { html };
  }

  /**
   * Tasarrufun İptali Dilekçesi Word indir
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.downloadTasarrufunIptaliWord() → GET /template-engine/tasarrufun-iptali/case/:caseId/word (tasarrufun iptali Word indirme)
  /// </remarks>
  @Get('tasarrufun-iptali/case/:caseId/word')
  async downloadTasarrufunIptaliWord(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateTasarrufunIptaliWord(caseId, tenantId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="tasarrufun-iptali-${caseId}.docx"`);
    res.send(wordBuffer);
  }

  // ============================================
  // DOLANDIRICILIK SUÇ DUYURUSU ENDPOINT'LERİ
  // ============================================

  /**
   * Dolandırıcılık Suç Duyurusu oluştur - Case ID ile
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.generateDolandiricilikFromCase() → GET /template-engine/dolandiricilik/case/:caseId (dolandırıcılık suç duyurusu üretimi)
  /// </remarks>
  @Get('dolandiricilik/case/:caseId')
  async generateDolandiricilikFromCase(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<{ title: string; content: string }> {
    return this.templateEngineService.generateDolandiricilikSucDuyurusuFromCase(caseId, tenantId);
  }

  /**
   * Dolandırıcılık Suç Duyurusu önizleme
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.previewDolandiricilik() → GET /template-engine/dolandiricilik/case/:caseId/preview (dolandırıcılık suç duyurusu önizleme)
  /// </remarks>
  @Get('dolandiricilik/case/:caseId/preview')
  async previewDolandiricilik(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<{ html: string }> {
    const doc = await this.templateEngineService.generateDolandiricilikSucDuyurusuFromCase(caseId, tenantId);
    const html = `
      <div style="font-family: 'Courier New', monospace; white-space: pre-wrap; padding: 20px; background: white; border: 1px solid #ccc;">
        ${doc.content.replace(/\n/g, '<br>')}
      </div>
    `;
    return { html };
  }

  /**
   * Dolandırıcılık Suç Duyurusu Word indir
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.downloadDolandiricilikWord() → GET /template-engine/dolandiricilik/case/:caseId/word (dolandırıcılık suç duyurusu Word indirme)
  /// </remarks>
  @Get('dolandiricilik/case/:caseId/word')
  async downloadDolandiricilikWord(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateDolandiricilikSucDuyurusuWord(caseId, tenantId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="dolandiricilik-suc-duyurusu-${caseId}.docx"`);
    res.send(wordBuffer);
  }

  // ============================================
  // MERKEZİ DOKÜMAN ÜRETİM ENDPOINT'LERİ
  // ============================================

  /**
   * Case ID bazlı doküman üret - Eski Takipler ve Yeni Takip ekranlarından çağrılabilir
   * POST /template-engine/cases/:caseId/documents/:format
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - TemplateEngineController.generateDocumentFromCase() → POST /template-engine/cases/:caseId/documents/:format (case bazlı belge artifact üretimi)
  /// </remarks>
  @Post('cases/:caseId/documents/:format')
  async generateDocumentFromCase(
    @Param('caseId') caseId: string,
    @Param('format') format: 'docx' | 'pdf' | 'xml',
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      const formatUpper = format.toUpperCase() as 'DOCX' | 'PDF' | 'XML';
      const result = await this.templateEngineService.generateDocumentFromCase(
        caseId,
        formatUpper,
        documentType,
        'v1',
        tenantId,
      );
      
      const mimeTypes: Record<string, string> = {
        DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        PDF: 'application/pdf',
        XML: 'application/xml',
      };
      
      const extensions: Record<string, string> = {
        DOCX: 'docx',
        PDF: 'pdf',
        XML: 'xml',
      };
      
      res.setHeader('Content-Type', mimeTypes[formatUpper]);
      res.setHeader('Content-Disposition', `attachment; filename="${documentType}-${caseId}.${extensions[formatUpper]}"`);
      res.setHeader('X-From-Cache', result.fromCache ? 'true' : 'false');
      res.send(result.buffer);
    } catch (error: any) {
      console.error('[TemplateEngine] Document generation error:', error);
      res.status(500).json({ message: error.message || 'Doküman oluşturulamadı' });
    }
  }

  /**
   * Case'e ait mevcut doküman artifact'larını listele
   * GET /template-engine/cases/:caseId/documents
   */
  @Get('cases/:caseId/documents')
  async listDocumentArtifacts(@Param('caseId') caseId: string): Promise<any[]> {
    return this.templateEngineService.listDocumentArtifacts(caseId);
  }

  /**
   * Artifact indir
   * GET /template-engine/documents/:artifactId/download
   */
  @Get('documents/:artifactId/download')
  async downloadArtifact(
    @Param('artifactId') artifactId: string,
    @Res() res: Response
  ): Promise<void> {
    const result = await this.templateEngineService.downloadArtifact(artifactId);
    
    if (!result) {
      res.status(404).json({ message: 'Doküman bulunamadı' });
      return;
    }
    
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.buffer);
  }
}
