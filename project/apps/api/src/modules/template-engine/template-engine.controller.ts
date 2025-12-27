import { Controller, Get, Post, Body, Param, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TemplateEngineService, TemplateData, GeneratedDocument } from './template-engine.service';

// DTO'lar
export class GenerateTakipTalebiDto {
  fileNumber: string;
  filingDate: string;
  executionOffice: {
    name: string;
    city: string;
    uyapCode?: string;
  };
  creditors: Array<{
    type: 'INDIVIDUAL' | 'COMPANY';
    name: string;
    identityNo?: string;
    taxNo?: string;
    address?: string;
  }>;
  lawyers: Array<{
    name: string;
    barNumber: string;
    barCity: string;
    address?: string;
  }>;
  debtors: Array<{
    type: 'INDIVIDUAL' | 'COMPANY';
    name: string;
    identityNo?: string;
    taxNo?: string;
    address?: string;
    role?: string;
  }>;
  claimItems: Array<{
    type: string;
    description: string;
    amount: number;
    currency: string;
    dueDate?: string;
  }>;
  totals: {
    principal: number;
    interest: number;
    fees: number;
    total: number;
    currency: string;
  };
  interestInfo: {
    type: 'YASAL' | 'TICARI' | 'CUSTOM';
    rate?: number;
    description: string;
    variableRate: boolean;
  };
  caseType: string;
  subCategory: string;
  executionPath: string;
  sourceDocument?: {
    type: string;
    number?: string;
    date?: string;
    bank?: string;
    branch?: string;
  };
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
}
