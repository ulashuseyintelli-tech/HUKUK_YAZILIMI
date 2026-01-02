import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { LimitationEngineService, LimitationCheckResult, EnforcementRecommendation } from './limitation-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// ============================================
// DTO'LAR
// ============================================

export class CheckLimitationDto {
  @IsString()
  caseType: string;

  @IsOptional()
  @IsString()
  claimTypeCode?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  instrumentType?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  lastInterruptionDate?: string;
}

export class RecommendEnforcementDto {
  @IsOptional()
  hasJudgment?: boolean;

  @IsOptional()
  @IsString()
  judgmentDate?: string;

  @IsOptional()
  hasInstrument?: boolean;

  @IsOptional()
  @IsString()
  instrumentType?: string;

  @IsOptional()
  @IsString()
  instrumentStartDate?: string;

  @IsOptional()
  @IsString()
  generalStartDate?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class LogLimitationRiskDto {
  @IsOptional()
  @IsString()
  caseId?: string;

  @IsString()
  claimTypeCode: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  startDateInput?: string;

  @IsIn(['GREEN', 'YELLOW', 'RED', 'UNKNOWN'])
  level: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

  @IsOptional()
  @IsIn(['PROCEED', 'BACK'])
  ackAction?: 'PROCEED' | 'BACK';
}

// ============================================
// CONTROLLER
// ============================================

@Controller('limitation-engine')
@UseGuards(JwtAuthGuard)
export class LimitationEngineController {
  constructor(private readonly limitationEngine: LimitationEngineService) {}

  /**
   * Tüm zamanaşımı kurallarını getir
   * GET /limitation-engine/rules
   */
  @Get('rules')
  getAllRules() {
    return {
      rules: this.limitationEngine.getAllRules(),
      settings: this.limitationEngine.getSettings(),
    };
  }

  /**
   * Belirli takip türü için kuralları getir
   * GET /limitation-engine/rules?caseType=KAMBIYO
   */
  @Get('rules/by-case-type')
  getRulesForCaseType(@Query('caseType') caseType: string) {
    return {
      caseType,
      rules: this.limitationEngine.getRulesForCaseType(caseType),
    };
  }

  /**
   * Zamanaşımı kontrolü yap
   * POST /limitation-engine/check
   */
  @Post('check')
  async checkLimitation(@Body() dto: CheckLimitationDto): Promise<LimitationCheckResult> {
    return this.limitationEngine.checkBeforeEnforcement({
      caseType: dto.caseType,
      claimTypeCode: dto.claimTypeCode,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      instrumentType: dto.instrumentType,
      role: dto.role,
      lastInterruptionDate: dto.lastInterruptionDate ? new Date(dto.lastInterruptionDate) : null,
    });
  }

  /**
   * Takip türü önerisi al
   * POST /limitation-engine/recommend
   */
  @Post('recommend')
  async recommendEnforcement(@Body() dto: RecommendEnforcementDto): Promise<{ recommendations: EnforcementRecommendation[] }> {
    const recommendations = await this.limitationEngine.recommendEnforcementType({
      hasJudgment: dto.hasJudgment,
      judgmentDate: dto.judgmentDate ? new Date(dto.judgmentDate) : null,
      hasInstrument: dto.hasInstrument,
      instrumentType: dto.instrumentType,
      instrumentStartDate: dto.instrumentStartDate ? new Date(dto.instrumentStartDate) : null,
      generalStartDate: dto.generalStartDate ? new Date(dto.generalStartDate) : null,
      role: dto.role,
    });

    return { recommendations };
  }

  /**
   * Zamanaşımı risk logunu kaydet
   * POST /limitation-engine/log-risk
   */
  @Post('log-risk')
  async logRisk(@Request() req: any, @Body() dto: LogLimitationRiskDto) {
    const { tenantId, userId } = req.user;

    await this.limitationEngine.logLimitationRisk(tenantId, userId, dto.caseId || null, {
      claimTypeCode: dto.claimTypeCode,
      role: dto.role,
      startDateInput: dto.startDateInput ? new Date(dto.startDateInput) : null,
      baseStartUsed: dto.startDateInput ? new Date(dto.startDateInput) : null,
      expiryDate: null,
      daysLeft: null,
      level: dto.level,
      ackAction: dto.ackAction,
    });

    return { success: true };
  }

  /**
   * Uyarı seviyesi bilgilerini getir
   * GET /limitation-engine/warning-levels
   */
  @Get('warning-levels')
  getWarningLevels() {
    return {
      GREEN: this.limitationEngine.getWarningLevelInfo('GREEN'),
      YELLOW: this.limitationEngine.getWarningLevelInfo('YELLOW'),
      RED: this.limitationEngine.getWarningLevelInfo('RED'),
      UNKNOWN: this.limitationEngine.getWarningLevelInfo('UNKNOWN'),
    };
  }

  /**
   * Modal metinlerini getir
   * GET /limitation-engine/modal-texts
   */
  @Get('modal-texts')
  getModalTexts() {
    return {
      YELLOW: this.limitationEngine.getModalTexts('YELLOW'),
      RED: this.limitationEngine.getModalTexts('RED'),
      UNKNOWN: this.limitationEngine.getModalTexts('UNKNOWN'),
    };
  }
}
