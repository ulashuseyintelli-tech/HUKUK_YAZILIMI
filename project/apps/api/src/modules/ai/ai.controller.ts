import { Controller, Get, Param, Post, Body, UseGuards, Request, Res, Header } from '@nestjs/common';
import { Response } from 'express';
import { AiService } from './ai.service';
import { AiDocumentService, DocumentGenerationRequest } from './ai-document.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiDocumentService: AiDocumentService,
  ) {}

  // Dosya için AI önerisi al
  @Get('case/:caseId/suggest')
  async getSuggestions(@Param('caseId') caseId: string) {
    const suggestions = await this.aiService.getSuggestions(caseId);
    return {
      success: true,
      data: suggestions,
    };
  }

  // Dosya için tahsilat tahmini
  @Get('case/:caseId/predict')
  async getPrediction(@Param('caseId') caseId: string) {
    const prediction = await this.aiService.getPrediction(caseId);
    return {
      success: true,
      data: prediction,
    };
  }

  // AI istatistikleri
  @Get('stats')
  async getStats(@Request() req: any) {
    const stats = await this.aiService.getAiStats(req.user.tenantId);
    return {
      success: true,
      data: stats,
    };
  }

  // Toplu öneri al (birden fazla dosya için)
  @Post('batch-suggest')
  async batchSuggest(@Body() body: { caseIds: string[] }) {
    const results = await Promise.all(
      body.caseIds.map(async (caseId) => {
        try {
          const suggestions = await this.aiService.getSuggestions(caseId);
          return { caseId, suggestions, error: null };
        } catch (error: any) {
          return { caseId, suggestions: [], error: error.message };
        }
      })
    );
    return {
      success: true,
      data: results,
    };
  }

  // AI ile doküman oluştur
  @Post('document/generate')
  async generateDocument(@Body() body: DocumentGenerationRequest) {
    const document = await this.aiDocumentService.generateDocument(body);
    return {
      success: true,
      data: {
        content: document.content,
        title: document.title,
        format: document.format,
        filename: document.filename,
      },
    };
  }

  // AI ile doküman oluştur ve indir (PDF)
  @Post('document/download')
  async downloadDocument(
    @Body() body: DocumentGenerationRequest,
    @Res() res: Response,
  ) {
    const document = await this.aiDocumentService.generateDocument({
      ...body,
      outputFormat: 'PDF',
    });

    if (document.buffer) {
      res.set({
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename="${document.filename}"`,
        'Content-Length': document.buffer.length,
      });
      res.send(document.buffer);
    } else {
      res.set({
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${document.filename}"`,
      });
      res.send(document.content);
    }
  }

  // Şablon bazlı doküman oluştur
  @Post('document/template/:templateCode')
  async generateFromTemplate(
    @Param('templateCode') templateCode: string,
    @Body() body: { variables: Record<string, string> },
    @Res() res: Response,
  ) {
    const document = await this.aiDocumentService.generateFromTemplate(
      templateCode,
      body.variables,
    );

    if (document.buffer) {
      res.set({
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename="${document.filename}"`,
        'Content-Length': document.buffer.length,
      });
      res.send(document.buffer);
    } else {
      res.json({ success: true, data: document });
    }
  }

  // Mevcut şablonları listele
  @Get('document/templates')
  getTemplates() {
    return {
      success: true,
      data: [
        { code: 'ODEME_EMRI', name: 'Ödeme Emri', description: 'İcra takibi ödeme emri' },
        { code: 'HACIZ_MUZEKKERE', name: 'Haciz Müzekkeresi', description: 'Haciz müzekkeresi' },
      ],
    };
  }
}
