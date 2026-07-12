import { Controller, Post, Body, Res, Get, Param, HttpStatus, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PdfService } from './pdf.service';
import { TemplateEngineService } from '../template-engine/template-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// BOLA-001 (STF-PRD-BOLA-001): bu controller auth'suzdu; takip-talebi ucu caseId ile cross-tenant
// dosya PDF'i sizdiriyordu. JwtAuthGuard + tenant-scoped case load ile kapatildi (template-engine.controller
// ile ayni guvenli desen). generate/generate-table (govde-icerikli, caseId'siz) de artik authenticated.
@Controller('pdf')
@UseGuards(JwtAuthGuard)
export class PdfController {
  constructor(
    private pdfService: PdfService,
    private templateEngine: TemplateEngineService,
  ) {}

  // Takip Talebi PDF indir
  @Get('takip-talebi/:caseId')
  async downloadTakipTalebi(
    @Param('caseId') caseId: string,
    // BOLA-001: tenantId truthful @CurrentUser'dan (body/path'ten DEGIL). generateTakipTalebiFromCase
    // -> getCaseData where{id,tenantId} ile yuklenir; baska tenant'in caseId'si eslesmez, PDF donmez.
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    try {
      const document = await this.templateEngine.generateTakipTalebiFromCase(caseId, tenantId);
      const pdfBuffer = await this.pdfService.generateTakipTalebiPdf({
        title: document.title,
        content: document.content,
        fileNumber: caseId,
        date: new Date().toLocaleDateString('tr-TR'),
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="takip-talebi-${caseId}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'PDF olusturulamadi',
        error: (error as Error).message,
      });
    }
  }

  // Metin icerikten PDF olustur
  @Post('generate')
  async generatePdf(
    @Body() body: { title: string; content: string; watermark?: string; footer?: string },
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.pdfService.generateFromText({
        title: body.title,
        content: body.content,
        watermark: body.watermark,
        footer: body.footer,
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${body.title.replace(/\s+/g, '-')}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'PDF olusturulamadi',
        error: (error as Error).message,
      });
    }
  }

  // Tablo PDF olustur (alacak listesi vb.)
  @Post('generate-table')
  async generateTablePdf(
    @Body() body: { title: string; headers: string[]; rows: string[][]; footer?: string },
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.pdfService.generateTablePdf(body);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${body.title.replace(/\s+/g, '-')}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'PDF olusturulamadi',
        error: (error as Error).message,
      });
    }
  }
}
