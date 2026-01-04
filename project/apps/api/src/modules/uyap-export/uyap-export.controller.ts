import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { UyapExportService } from './uyap-export.service';
import { ExportSingleCaseDto, ExportBatchCasesDto } from './dto/uyap-export.dto';

interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
}

@Controller('uyap-export')
@UseGuards(JwtAuthGuard)
export class UyapExportController {
  constructor(private readonly uyapExportService: UyapExportService) {}

  /**
   * Tek dosya XML export
   * POST /uyap-export/single
   */
  @Post('single')
  async exportSingle(
    @Body() dto: ExportSingleCaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uyapExportService.exportSingleCase(
      dto.caseId,
      user.tenantId,
      dto.includeDocuments,
    );
  }

  /**
   * Tek dosya XML download
   * GET /uyap-export/download/:caseId
   */
  @Get('download/:caseId')
  async downloadSingle(
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const result = await this.uyapExportService.exportSingleCase(
      caseId,
      user.tenantId,
      false,
    );

    if (!result.success || !result.xml) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        errors: result.errors,
      });
    }

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.xml);
  }

  /**
   * Toplu dosya XML export
   * POST /uyap-export/batch
   */
  @Post('batch')
  async exportBatch(
    @Body() dto: ExportBatchCasesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uyapExportService.exportBatchCases(
      dto.caseIds,
      user.tenantId,
      dto.batchName,
      dto.includeDocuments,
    );
  }

  /**
   * Toplu dosya XML download
   * POST /uyap-export/batch/download
   */
  @Post('batch/download')
  async downloadBatch(
    @Body() dto: ExportBatchCasesDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const result = await this.uyapExportService.exportBatchCases(
      dto.caseIds,
      user.tenantId,
      dto.batchName,
      dto.includeDocuments,
    );

    if (!result.success || !result.xml) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        errors: result.errors,
      });
    }

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.xml);
  }

  /**
   * Dosya export validasyonu
   * GET /uyap-export/validate/:caseId
   */
  @Get('validate/:caseId')
  async validateCase(
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uyapExportService.validateCaseForExport(caseId);
  }

  /**
   * Export edilebilir dosyaları listele
   * GET /uyap-export/exportable
   */
  @Get('exportable')
  async getExportableCases(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.uyapExportService.getExportableCases(
      user.tenantId,
      limit ? parseInt(limit, 10) : 100,
    );
  }
}
