import { Controller, Get, Post, Body, Param, UseGuards, Res, Query } from '@nestjs/common';
import { Response } from 'express';
import { IsString, IsOptional, IsArray, IsObject, ValidateNested, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
  @Get('takip-talebi/case/:caseId')
  async generateTakipTalebiFromCase(@Param('caseId') caseId: string): Promise<GeneratedDocument> {
    return this.templateEngineService.generateTakipTalebiFromCase(caseId);
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
  @Get('odeme-emri/case/:caseId')
  async generateOdemeEmriFromCase(@Param('caseId') caseId: string): Promise<GeneratedDocument> {
    return this.templateEngineService.generateOdemeEmriFromCase(caseId);
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
  @Get('icra-emri/case/:caseId')
  async generateIcraEmriFromCase(@Param('caseId') caseId: string): Promise<GeneratedDocument> {
    return this.templateEngineService.generateIcraEmriFromCase(caseId);
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
  @Get('case/:caseId/pdf')
  async downloadPdfFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @Res() res: Response
  ): Promise<void> {
    const pdfBuffer = await this.templateEngineService.generatePdfFromCase(caseId, documentType);
    
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
  @Get('case/:caseId/word')
  async downloadWordFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateWordFromCase(caseId, documentType);
    
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
  @Get('case/:caseId/udf')
  async generateUdfFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi'
  ): Promise<UdfDocument> {
    return this.templateEngineService.generateUdfFromCase(caseId, documentType);
  }

  /**
   * UDF dosyası indir - Case ID ile
   */
  @Get('case/:caseId/udf/download')
  async downloadUdfFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @Res() res: Response
  ): Promise<void> {
    const udfDocument = await this.templateEngineService.generateUdfFromCase(caseId, documentType);
    
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
  @Get('case/:caseId/xml')
  async downloadXmlFromCase(
    @Param('caseId') caseId: string,
    @Query('type') documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi',
    @Res() res: Response
  ): Promise<void> {
    const xmlContent = await this.templateEngineService.generateXmlFromCase(caseId, documentType);
    
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
  @Get('karsiliksiz-cek/case/:caseId')
  async generateKarsiliksizCekSikayetFromCase(@Param('caseId') caseId: string): Promise<GeneratedDocument> {
    return this.templateEngineService.generateKarsiliksizCekSikayetFromCase(caseId);
  }

  /**
   * Karşılıksız Çek Şikayet Dilekçesi önizleme - Case ID ile
   */
  @Get('karsiliksiz-cek/case/:caseId/preview')
  async previewKarsiliksizCekSikayet(@Param('caseId') caseId: string): Promise<{ html: string }> {
    const doc = await this.templateEngineService.generateKarsiliksizCekSikayetFromCase(caseId);
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
  @Get('karsiliksiz-cek/case/:caseId/word')
  async downloadKarsiliksizCekSikayetWord(
    @Param('caseId') caseId: string,
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateKarsiliksizCekSikayetWord(caseId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="karsiliksiz-cek-sikayet-${caseId}.docx"`);
    res.send(wordBuffer);
  }

  /**
   * Karşılıksız Çek Şikayet Dilekçesi Text indir - Case ID ile
   */
  @Get('karsiliksiz-cek/case/:caseId/download')
  async downloadKarsiliksizCekSikayet(
    @Param('caseId') caseId: string,
    @Res() res: Response
  ): Promise<void> {
    const doc = await this.templateEngineService.generateKarsiliksizCekSikayetFromCase(caseId);
    
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
  @Get('itirazin-iptali/case/:caseId')
  async generateItirazinIptaliFromCase(@Param('caseId') caseId: string): Promise<{ title: string; content: string }> {
    return this.templateEngineService.generateItirazinIptaliFromCase(caseId);
  }

  /**
   * İtirazın İptali Dilekçesi önizleme
   */
  @Get('itirazin-iptali/case/:caseId/preview')
  async previewItirazinIptali(@Param('caseId') caseId: string): Promise<{ html: string }> {
    const doc = await this.templateEngineService.generateItirazinIptaliFromCase(caseId);
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
  @Get('itirazin-iptali/case/:caseId/word')
  async downloadItirazinIptaliWord(
    @Param('caseId') caseId: string,
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateItirazinIptaliWord(caseId);
    
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
  @Get('tasarrufun-iptali/case/:caseId')
  async generateTasarrufunIptaliFromCase(@Param('caseId') caseId: string): Promise<{ title: string; content: string }> {
    return this.templateEngineService.generateTasarrufunIptaliFromCase(caseId);
  }

  /**
   * Tasarrufun İptali Dilekçesi önizleme
   */
  @Get('tasarrufun-iptali/case/:caseId/preview')
  async previewTasarrufunIptali(@Param('caseId') caseId: string): Promise<{ html: string }> {
    const doc = await this.templateEngineService.generateTasarrufunIptaliFromCase(caseId);
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
  @Get('tasarrufun-iptali/case/:caseId/word')
  async downloadTasarrufunIptaliWord(
    @Param('caseId') caseId: string,
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateTasarrufunIptaliWord(caseId);
    
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
  @Get('dolandiricilik/case/:caseId')
  async generateDolandiricilikFromCase(@Param('caseId') caseId: string): Promise<{ title: string; content: string }> {
    return this.templateEngineService.generateDolandiricilikSucDuyurusuFromCase(caseId);
  }

  /**
   * Dolandırıcılık Suç Duyurusu önizleme
   */
  @Get('dolandiricilik/case/:caseId/preview')
  async previewDolandiricilik(@Param('caseId') caseId: string): Promise<{ html: string }> {
    const doc = await this.templateEngineService.generateDolandiricilikSucDuyurusuFromCase(caseId);
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
  @Get('dolandiricilik/case/:caseId/word')
  async downloadDolandiricilikWord(
    @Param('caseId') caseId: string,
    @Res() res: Response
  ): Promise<void> {
    const wordBuffer = await this.templateEngineService.generateDolandiricilikSucDuyurusuWord(caseId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="dolandiricilik-suc-duyurusu-${caseId}.docx"`);
    res.send(wordBuffer);
  }
}
