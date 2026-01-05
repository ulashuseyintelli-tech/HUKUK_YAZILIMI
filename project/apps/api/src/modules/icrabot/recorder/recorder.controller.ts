/**
 * RECORDER CONTROLLER (v33-v35)
 * 
 * UiMap Recorder ve Selector Health API endpoint'leri.
 * 
 * v34 Yenilikleri:
 * - Multi-selector alternatives response
 * - Auto-section guess (section parametresi opsiyonel)
 * - Alt index selection (approve sırasında alternatif seçimi)
 * - Click test API
 * 
 * v35 Yenilikleri:
 * - Stability score response
 * - Auto click-test before approve (autoTest=true default)
 * - Table column recorder endpoint
 * - Selector kind (button/field/table/table_column/action)
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UiMapRecorderService, SelectorKind } from './uimap-recorder.service';
import { SelectorHealthService } from './selector-health.service';

interface SuggestByTextDto {
  label: string;
  text: string;
  baseUrl?: string;
  kind?: SelectorKind; // v35: button/field/table/action
}

interface SuggestTableColumnDto {
  label: string;
  tableRowsSelector: string;
  colIndex: number;
}

interface ApproveRecordingDto {
  recordingId: string;
  section?: string;
  altIndex?: number; // v34: Alternative selector index
  autoTest?: boolean; // v35: Auto click-test before approve (default: true)
  force?: boolean; // v35: Force approve even if click-test fails
  baseUrl?: string; // v35: Base URL for click-test
}

interface ClickTestDto {
  selector: string;
  baseUrl?: string;
}

@Controller('icrabot/recorder')
@UseGuards(JwtAuthGuard)
export class RecorderController {
  constructor(
    private recorderService: UiMapRecorderService,
    private selectorHealthService: SelectorHealthService,
  ) {}

  /**
   * POST /icrabot/recorder/suggest-by-text
   * Text'e göre selector öner (v35: stability score + selector kind)
   */
  @Post('suggest-by-text')
  async suggestByText(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: SuggestByTextDto,
  ) {
    if (!dto.label || !dto.text) {
      throw new BadRequestException('label ve text gerekli');
    }

    const result = await this.recorderService.suggestSelectorByText(
      user.tenantId,
      dto.label,
      dto.text,
      dto.baseUrl,
      dto.kind || 'unknown',
    );

    return {
      ok: true,
      ...result,
    };
  }

  /**
   * POST /icrabot/recorder/suggest-table-column (v35)
   * Table column için relative selector öner
   */
  @Post('suggest-table-column')
  async suggestTableColumn(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: SuggestTableColumnDto,
  ) {
    if (!dto.label || !dto.tableRowsSelector || dto.colIndex === undefined) {
      throw new BadRequestException('label, tableRowsSelector ve colIndex gerekli');
    }

    const result = await this.recorderService.suggestTableColumnSelector(
      user.tenantId,
      dto.label,
      dto.tableRowsSelector,
      dto.colIndex,
    );

    return {
      ok: true,
      ...result,
    };
  }

  /**
   * POST /icrabot/recorder/approve
   * Recording'i onayla ve UiMapBundle'a ekle (v35: auto click-test)
   */
  @Post('approve')
  async approveRecording(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: ApproveRecordingDto,
  ) {
    if (!dto.recordingId) {
      throw new BadRequestException('recordingId gerekli');
    }

    const result = await this.recorderService.approveRecording(
      user.tenantId,
      dto.recordingId,
      dto.section,
      dto.altIndex,
      dto.autoTest !== false, // v35: default true
      dto.force || false, // v35: force approve
      dto.baseUrl,
    );

    return {
      ok: true,
      ...result,
    };
  }

  /**
   * GET /icrabot/recorder/recordings
   * Tüm recording'leri listele
   */
  @Get('recordings')
  async getRecordings(
    @CurrentUser() user: { tenantId: string },
    @Query('approvedOnly') approvedOnly?: string,
  ) {
    const recordings = await this.recorderService.getRecordings(
      user.tenantId,
      approvedOnly === 'true',
    );

    return {
      ok: true,
      recordings,
    };
  }

  /**
   * DELETE /icrabot/recorder/recordings/:id
   * Recording sil
   */
  @Delete('recordings/:id')
  async deleteRecording(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ) {
    await this.recorderService.deleteRecording(user.tenantId, id);

    return {
      ok: true,
    };
  }
}

@Controller('icrabot/health')
@UseGuards(JwtAuthGuard)
export class HealthController {
  constructor(private selectorHealthService: SelectorHealthService) {}

  /**
   * GET /icrabot/health/selector-health
   * Selector sağlık raporu
   */
  @Get('selector-health')
  async getSelectorHealth(
    @CurrentUser() user: { tenantId: string },
    @Query('limit') limit?: string,
  ) {
    const report = await this.selectorHealthService.getHealthReport(
      user.tenantId,
      limit ? parseInt(limit, 10) : 50,
    );

    return {
      ok: true,
      ...report,
    };
  }

  /**
   * GET /icrabot/health/selector/:key
   * Belirli bir selector'ın istatistikleri
   */
  @Get('selector/:key')
  async getSelectorStats(
    @CurrentUser() user: { tenantId: string },
    @Param('key') key: string,
  ) {
    const stats = await this.selectorHealthService.getSelectorStats(
      user.tenantId,
      key,
    );

    return {
      success: true,
      selectorKey: key,
      okCount: stats.ok,
      failCount: stats.fail,
      failRate: stats.failRate,
      recentErrors: stats.recentErrors,
    };
  }

  /**
   * GET /icrabot/health/high-fail-selectors
   * Yüksek fail rate'li selector'lar
   */
  @Get('high-fail-selectors')
  async getHighFailSelectors(
    @CurrentUser() user: { tenantId: string },
    @Query('threshold') threshold?: string,
    @Query('minSamples') minSamples?: string,
  ) {
    const selectors = await this.selectorHealthService.getHighFailRateSelectors(
      user.tenantId,
      threshold ? parseFloat(threshold) : 0.3,
      minSamples ? parseInt(minSamples, 10) : 10,
    );

    return {
      ok: true,
      selectors,
      count: selectors.length,
    };
  }

  /**
   * POST /icrabot/health/clear-old-logs
   * Eski logları temizle
   */
  @Post('clear-old-logs')
  async clearOldLogs(
    @CurrentUser() user: { tenantId: string },
    @Query('daysToKeep') daysToKeep?: string,
  ) {
    const count = await this.selectorHealthService.clearOldLogs(
      user.tenantId,
      daysToKeep ? parseInt(daysToKeep, 10) : 30,
    );

    return {
      ok: true,
      deletedCount: count,
    };
  }
}

@Controller('icrabot/recorder-test')
@UseGuards(JwtAuthGuard)
export class RecorderTestController {
  constructor(private healthService: SelectorHealthService) {}

  /**
   * POST /icrabot/recorder-test/click-test (v34)
   * Selector tıklanabilir mi test et
   */
  @Post('click-test')
  async clickTest(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: ClickTestDto,
  ) {
    if (!dto.selector) {
      throw new BadRequestException('selector gerekli');
    }

    const result = await this.healthService.clickTest(
      user.tenantId,
      dto.selector,
      dto.baseUrl,
    );

    return {
      success: result.ok,
      error: result.error,
      screenshotPath: result.screenshotPath,
    };
  }
}
