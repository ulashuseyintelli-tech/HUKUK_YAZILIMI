import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InterestEngineService } from './interest-engine.service';
import { RateScheduleService } from './rate-schedule.service';
import { RateSyncService } from './rate-sync.service';
import { InterestAuditLogService } from './audit-log.service';
import {
  InterestCalculationRequestDto,
  CreateRateDto,
  GetRatesQueryDto,
  CalculateForCaseQueryDto,
} from './dto/interest-engine.dto';

@Controller('interest-engine')
@UseGuards(JwtAuthGuard)
export class InterestEngineController {
  constructor(
    private readonly interestEngine: InterestEngineService,
    private readonly rateSchedule: RateScheduleService,
    private readonly rateSync: RateSyncService,
    private readonly auditLog: InterestAuditLogService,
  ) {}

  /**
   * Calculate interest for given principal items
   */
  @Post('calculate')
  async calculate(
    @Body() request: InterestCalculationRequestDto,
    @Request() req: any,
  ) {
    return this.interestEngine.calculateInterest(
      request,
      req.user.tenantId,
      req.user.id,
    );
  }

  /**
   * Calculate interest for an existing case
   */
  @Post('calculate/:caseId')
  async calculateForCase(
    @Param('caseId') caseId: string,
    @Query() query: CalculateForCaseQueryDto,
    @Request() req: any,
  ) {
    return this.interestEngine.recalculateForCase(
      caseId,
      query.asOfDate,
      req.user.tenantId,
      req.user.id,
    );
  }

  /**
   * Get calculation history for a case
   */
  @Get('history/:caseId')
  async getHistory(@Param('caseId') caseId: string, @Request() req: any) {
    return this.interestEngine.getCalculationHistory(caseId, req.user.tenantId);
  }

  /**
   * Get rates for a period
   */
  @Get('rates')
  async getRates(@Query() query: GetRatesQueryDto, @Request() req: any) {
    return this.rateSchedule.getRatesForPeriod(
      query.type,
      query.from,
      query.to,
      req.user.tenantId,
    );
  }

  /**
   * Get current rate for an interest type
   */
  @Get('rates/current/:type')
  async getCurrentRate(@Param('type') type: string, @Request() req: any) {
    return this.rateSchedule.getCurrentRate(type as any, req.user.tenantId);
  }

  /**
   * Add a new rate entry
   */
  @Post('rates')
  async addRate(@Body() entry: CreateRateDto, @Request() req: any) {
    return this.rateSchedule.addRate(entry, req.user.tenantId, req.user.id);
  }

  /**
   * Sync rates from TCMB
   */
  @Post('rates/sync-tcmb')
  async syncTcmb(@Request() req: any) {
    const added = await this.rateSync.syncRatesForTenant(req.user.tenantId);
    return { added };
  }

  /**
   * Seed historical rates
   */
  @Post('rates/seed')
  async seedRates(@Request() req: any) {
    const added = await this.rateSync.seedHistoricalRates(req.user.tenantId);
    return { added };
  }

  /**
   * Get a specific audit log
   */
  @Get('audit/:logId')
  async getAuditLog(@Param('logId') logId: string, @Request() req: any) {
    return this.auditLog.getCalculationLog(logId, req.user.tenantId);
  }

  /**
   * Get flagged logs for review
   */
  @Get('audit/flagged')
  async getFlaggedLogs(@Request() req: any) {
    return this.auditLog.getFlaggedLogs(req.user.tenantId);
  }
}
