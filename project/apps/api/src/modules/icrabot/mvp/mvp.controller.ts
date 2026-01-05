/**
 * MVP CONTROLLER (v37)
 * 
 * MVP tamamlama endpoint'leri:
 * - Action List (müvekkil/avukat için bekleyen aksiyonlar)
 * - Risk/Net Report (varlık bazlı risk ve beklenen tahsilat)
 * - Weekly Export (haftalık özet raporu)
 */

import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ActionListService } from './action-list.service';
import { RiskNetReportService } from './risk-net-report.service';
import { WeeklyExportService } from './weekly-export.service';

@Controller('icrabot/actions')
@UseGuards(JwtAuthGuard)
export class ActionListController {
  constructor(private actionListService: ActionListService) {}

  /**
   * GET /icrabot/actions/:caseId/list
   * Dosya için bekleyen aksiyonları listele
   */
  @Get(':caseId/list')
  async getActionList(
    @CurrentUser() user: { tenantId: string },
    @Param('caseId') caseId: string,
  ) {
    const result = await this.actionListService.buildActionList(
      user.tenantId,
      caseId,
    );

    return {
      ok: true,
      ...result,
    };
  }
}

@Controller('icrabot/risk-report')
@UseGuards(JwtAuthGuard)
export class RiskReportController {
  constructor(private riskNetReportService: RiskNetReportService) {}

  /**
   * GET /icrabot/risk-report/:caseId/report
   * Dosya için risk ve net getiri raporu
   */
  @Get(':caseId/report')
  async getRiskReport(
    @CurrentUser() user: { tenantId: string },
    @Param('caseId') caseId: string,
  ) {
    const result = await this.riskNetReportService.buildRiskNetReport(
      user.tenantId,
      caseId,
    );

    return {
      ok: true,
      ...result,
    };
  }
}

@Controller('icrabot/weekly-export')
@UseGuards(JwtAuthGuard)
export class WeeklyExportController {
  constructor(private weeklyExportService: WeeklyExportService) {}

  /**
   * GET /icrabot/weekly-export/weekly
   * Haftalık özet raporu
   */
  @Get('weekly')
  async getWeeklySummary(
    @CurrentUser() user: { tenantId: string },
  ) {
    const result = await this.weeklyExportService.buildWeeklySummary(
      user.tenantId,
    );

    return {
      ok: true,
      ...result,
    };
  }
}
