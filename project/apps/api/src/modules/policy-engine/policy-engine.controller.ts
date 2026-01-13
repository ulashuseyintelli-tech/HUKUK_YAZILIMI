/**
 * Policy Engine Controller
 * 
 * CPE REST API endpoints.
 * 
 * Endpoints:
 * - POST /api/policy-engine/cases/:caseId/can-perform-action
 * - GET /api/policy-engine/cases/:caseId/next-actions
 * - POST /api/policy-engine/cases/:caseId/action-executed
 * - GET /api/policy-engine/cases/:caseId/decision-history
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CasePolicyEngine } from './case-policy-engine.service';
import { DecisionLoggerService } from './decision-logger';
import { ActionCode } from './types/action-code.enum';
import { Scope } from './types/scope.enum';
import { ActionContext, ActionResult } from './types/policy-decision.interface';

// ============================================
// DTOs
// ============================================

class CanPerformActionDto {
  actionCode: ActionCode;
  context?: ActionContext;
}

class ActionExecutedDto {
  actionCode: ActionCode;
  context?: ActionContext;
  result: ActionResult;
  executionId: string;
}

class NextActionsQueryDto {
  scope?: Scope;
  debtorId?: string;
  assetId?: string;
  expenseId?: string;
}

// ============================================
// Controller
// ============================================

@Controller('policy-engine')
export class PolicyEngineController {
  private readonly logger = new Logger(PolicyEngineController.name);

  constructor(
    private readonly cpe: CasePolicyEngine,
    private readonly decisionLogger: DecisionLoggerService,
  ) {}

  /**
   * POST /api/policy-engine/cases/:caseId/can-perform-action
   * 
   * Bir aksiyonun yapılıp yapılamayacağını kontrol eder.
   */
  @Post('cases/:caseId/can-perform-action')
  @HttpCode(HttpStatus.OK)
  async canPerformAction(
    @Param('caseId') caseId: string,
    @Body() dto: CanPerformActionDto,
  ) {
    this.logger.log(`canPerformAction: ${dto.actionCode} for case ${caseId}`);

    const decision = await this.cpe.canPerformAction(
      caseId,
      dto.actionCode,
      dto.context,
    );

    return {
      success: true,
      data: decision,
    };
  }

  /**
   * GET /api/policy-engine/cases/:caseId/next-actions
   * 
   * Dosya için önerilen aksiyonları döndürür.
   */
  @Get('cases/:caseId/next-actions')
  async getNextActions(
    @Param('caseId') caseId: string,
    @Query() query: NextActionsQueryDto,
  ) {
    this.logger.log(`getNextActions for case ${caseId}`);

    // Build context from query params
    const context: ActionContext | undefined = 
      (query.debtorId || query.assetId || query.expenseId)
        ? {
            debtorId: query.debtorId,
            assetId: query.assetId,
            expenseId: query.expenseId,
          }
        : undefined;

    const recommendations = await this.cpe.getNextActions(
      caseId,
      query.scope,
      context,
    );

    return {
      success: true,
      data: recommendations,
      meta: {
        count: recommendations.length,
        scope: query.scope || 'ALL',
      },
    };
  }

  /**
   * POST /api/policy-engine/cases/:caseId/action-executed
   * 
   * Aksiyon tamamlandıktan sonra state günceller.
   */
  @Post('cases/:caseId/action-executed')
  @HttpCode(HttpStatus.OK)
  async onActionExecuted(
    @Param('caseId') caseId: string,
    @Body() dto: ActionExecutedDto,
  ) {
    this.logger.log(`onActionExecuted: ${dto.actionCode} for case ${caseId}`);

    const response = await this.cpe.onActionExecuted(
      caseId,
      dto.actionCode,
      dto.context,
      dto.result,
      dto.executionId,
    );

    return {
      success: response.success,
      data: response,
    };
  }

  /**
   * GET /api/policy-engine/cases/:caseId/decision-history
   * 
   * Dosya için karar geçmişini döndürür.
   */
  @Get('cases/:caseId/decision-history')
  async getDecisionHistory(
    @Param('caseId') caseId: string,
    @Query('actionCode') actionCode?: ActionCode,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.log(`getDecisionHistory for case ${caseId}`);

    const history = await this.decisionLogger.getDecisionHistory(caseId, {
      actionCode,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return {
      success: true,
      data: history,
      meta: {
        count: history.length,
      },
    };
  }

  /**
   * GET /api/policy-engine/decisions/:decisionId
   * 
   * Belirli bir karar detayını döndürür.
   */
  @Get('decisions/:decisionId')
  async getDecision(@Param('decisionId') decisionId: string) {
    this.logger.log(`getDecision: ${decisionId}`);

    const decision = await this.decisionLogger.getDecision(decisionId);

    if (!decision) {
      return {
        success: false,
        error: 'Decision not found',
      };
    }

    return {
      success: true,
      data: decision,
    };
  }

  /**
   * GET /api/policy-engine/health
   * 
   * Health check endpoint.
   */
  @Get('health')
  async health() {
    return {
      success: true,
      service: 'CasePolicyEngine',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
