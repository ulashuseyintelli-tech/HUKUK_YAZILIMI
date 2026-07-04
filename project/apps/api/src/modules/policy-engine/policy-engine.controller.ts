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
 *
 * B1 hardening: class-level JwtAuthGuard + controller-seviyesinde tenant-ownership
 * kontrolü (case {id,tenantId} ile bulunamazsa 404). CasePolicyEngine/DecisionLoggerService
 * imzaları DEĞİŞMEDİ — iç çağıranlar (expense-gate, uyap, address-discovery, automation,
 * stage-trigger) servisi doğrudan DI ile çağırıyor, bu controller'dan etkilenmez.
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
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { CasePolicyEngine } from './case-policy-engine.service';
import { DecisionLoggerService } from './decision-logger';
import { ActionCode } from './types/action-code.enum';
import { Scope } from './types/scope.enum';
import { ActionContext, ActionResult } from './types/policy-decision.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

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
@UseGuards(JwtAuthGuard)
export class PolicyEngineController {
  private readonly logger = new Logger(PolicyEngineController.name);

  constructor(
    private readonly cpe: CasePolicyEngine,
    private readonly decisionLogger: DecisionLoggerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * B1 hardening: case'in çağıran tenant'a mı ait olduğunu kontrol eder.
   * case-status.service.ts changeStatus'daki (P2b-2c-1) tenant-scoped lookup deseniyle aynı.
   */
  private async caseBelongsToTenant(tenantId: string, caseId: string): Promise<boolean> {
    const exists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    return !!exists;
  }

  private async assertCaseInTenant(tenantId: string, caseId: string): Promise<void> {
    if (!(await this.caseBelongsToTenant(tenantId, caseId))) {
      throw new NotFoundException('Dosya bulunamadı');
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - PolicyEngineController.canPerformAction() → POST /policy-engine/cases/:caseId/can-perform-action
  /// B1 hardening: class-level JwtAuthGuard + tenant-ownership kontrolü eklendi (önceden guard'sızdı).
  /// </remarks>
  /**
   * POST /api/policy-engine/cases/:caseId/can-perform-action
   *
   * Bir aksiyonun yapılıp yapılamayacağını kontrol eder.
   */
  @Post('cases/:caseId/can-perform-action')
  @HttpCode(HttpStatus.OK)
  async canPerformAction(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: CanPerformActionDto,
  ) {
    await this.assertCaseInTenant(tenantId, caseId);
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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - PolicyEngineController.getNextActions() → GET /policy-engine/cases/:caseId/next-actions
  /// B1 hardening: class-level JwtAuthGuard + tenant-ownership kontrolü eklendi (önceden guard'sızdı).
  /// </remarks>
  /**
   * GET /api/policy-engine/cases/:caseId/next-actions
   *
   * Dosya için önerilen aksiyonları döndürür.
   */
  @Get('cases/:caseId/next-actions')
  async getNextActions(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Query() query: NextActionsQueryDto,
  ) {
    await this.assertCaseInTenant(tenantId, caseId);
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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - PolicyEngineController.onActionExecuted() → POST /policy-engine/cases/:caseId/action-executed
  /// B1 hardening: class-level JwtAuthGuard + tenant-ownership kontrolü eklendi (önceden guard'sızdı,
  /// kimliksiz istekle Case.workflowStage değiştirilebiliyordu).
  /// </remarks>
  /**
   * POST /api/policy-engine/cases/:caseId/action-executed
   *
   * Aksiyon tamamlandıktan sonra state günceller.
   */
  @Post('cases/:caseId/action-executed')
  @HttpCode(HttpStatus.OK)
  async onActionExecuted(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Body() dto: ActionExecutedDto,
  ) {
    await this.assertCaseInTenant(tenantId, caseId);
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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - PolicyEngineController.getDecisionHistory() → GET /policy-engine/cases/:caseId/decision-history
  /// B1 hardening: class-level JwtAuthGuard + tenant-ownership kontrolü eklendi (önceden guard'sızdı).
  /// </remarks>
  /**
   * GET /api/policy-engine/cases/:caseId/decision-history
   *
   * Dosya için karar geçmişini döndürür.
   */
  @Get('cases/:caseId/decision-history')
  async getDecisionHistory(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Query('actionCode') actionCode?: ActionCode,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    await this.assertCaseInTenant(tenantId, caseId);
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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - PolicyEngineController.getDecision() → GET /policy-engine/decisions/:decisionId
  /// B1 hardening: class-level JwtAuthGuard + karar kaydının caseId'si üzerinden tenant-ownership
  /// kontrolü (decision-logger imzası DEĞİŞMEDİ). Bulunamadı/cross-tenant AYNI yanıtı döner (sızdırma yok).
  /// </remarks>
  /**
   * GET /api/policy-engine/decisions/:decisionId
   *
   * Belirli bir karar detayını döndürür.
   */
  @Get('decisions/:decisionId')
  async getDecision(
    @CurrentUser('tenantId') tenantId: string,
    @Param('decisionId') decisionId: string,
  ) {
    this.logger.log(`getDecision: ${decisionId}`);

    const decision = await this.decisionLogger.getDecision(decisionId);

    if (!decision || !(await this.caseBelongsToTenant(tenantId, decision.caseId))) {
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
