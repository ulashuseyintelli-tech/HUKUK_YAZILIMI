import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';
import {
  ActionCode,
  RiskLevel,
  ACTION_RISK_LEVELS,
  Scope,
  PolicyDecision,
  DecisionCode,
  ActionContext,
  ActionResult,
  ExecutionResponse,
  getActionMatrixEntry,
  isLockRequired,
  getFailMode,
} from './types';
import { FactStoreService, FactMap, ComputedFactRegistry } from './fact-store';
import { DecisionLoggerService, ExecutionRecorderService } from './decision-logger';
import { StateMachineService, StateInfo, IcraType } from './state-machine';
import { GateCheckerService } from './gate-checker';
import { RuleEngineService, ComputedMetrics, RecommendedAction } from './rule-engine';

/**
 * Case Policy Engine - Merkezi Karar Motoru
 * 
 * Sistemdeki tüm aksiyonlar için tek otorite.
 * 
 * Public API:
 * - canPerformAction(caseId, actionCode, context): PolicyDecision
 * - getNextActions(caseId, scope?, context?): RecommendedAction[]
 * - onActionExecuted(caseId, actionCode, context, result, executionId): ExecutionResponse
 * 
 * @see docs/decision-point-inventory.md
 * @see docs/high-risk-action-matrix.md
 */
@Injectable()
export class CasePolicyEngine {
  private readonly logger = new Logger(CasePolicyEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factStore: FactStoreService,
    private readonly computedFactRegistry: ComputedFactRegistry,
    private readonly decisionLogger: DecisionLoggerService,
    private readonly executionRecorder: ExecutionRecorderService,
    private readonly stateMachine: StateMachineService,
    private readonly gateChecker: GateCheckerService,
    private readonly ruleEngine: RuleEngineService,
    // TODO: Add when implemented
    // private readonly lockService: DistributedLockService,
  ) {}

  /**
   * Bir aksiyonun yapılıp yapılamayacağını kontrol eder.
   * 
   * Flow:
   * 1. Risk seviyesine göre lock al (HIGH risk için)
   * 2. Facts topla
   * 3. Gates kontrol et
   * 4. State transition kontrol et
   * 5. Karar logla
   * 6. PolicyDecision döndür
   * 
   * @param caseId Dosya ID
   * @param actionCode Aksiyon kodu
   * @param context Opsiyonel context (debtorId, assetId, etc.)
   * @returns PolicyDecision
   */
  async canPerformAction(
    caseId: string,
    actionCode: ActionCode,
    context?: ActionContext,
  ): Promise<PolicyDecision> {
    const traceId = randomUUID();
    const riskLevel = ACTION_RISK_LEVELS[actionCode];
    
    this.logger.debug(`canPerformAction: ${actionCode} for case ${caseId}, risk: ${riskLevel}, trace: ${traceId}`);

    // HIGH risk aksiyonlar için lock al
    if (isLockRequired(actionCode)) {
      // TODO: Implement distributed lock
      // const lockKey = this.buildLockKey(caseId, actionCode, context);
      // const lock = await this.lockService.acquire(lockKey, { ttl: 30000, waitTimeout: 5000 });
      // if (!lock) {
      //   return this.buildDecision(false, 'Başka bir işlem devam ediyor', DecisionCode.LOCK_TIMEOUT);
      // }
      // try {
      //   return await this.evaluateDecision(caseId, actionCode, context, riskLevel, traceId);
      // } finally {
      //   await this.lockService.release(lock);
      // }
    }

    return this.evaluateDecision(caseId, actionCode, context, riskLevel, traceId);
  }

  /**
   * Karar değerlendirmesi yapar.
   */
  private async evaluateDecision(
    caseId: string,
    actionCode: ActionCode,
    context: ActionContext | undefined,
    riskLevel: RiskLevel,
    traceId: string,
  ): Promise<PolicyDecision> {
    let facts: FactMap = new Map();
    let state: StateInfo | undefined;
    const ruleVersion = this.stateMachine.getRuleVersion();

    try {
      // 1. Case'in var olduğunu kontrol et
      const caseExists = await this.prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, caseStatus: true, workflowStage: true, type: true, subType: true },
      });

      if (!caseExists) {
        const decision = this.buildDecision(false, 'Dosya bulunamadı', DecisionCode.CASE_NOT_FOUND);
        return decision;
      }

      // 2. Facts topla
      facts = await this.factStore.getFacts(caseId, context);
      
      // 3. Computed facts ekle
      facts = await this.computedFactRegistry.computeAll(caseId, context, facts);

      // 4. Get current state from StateMachine
      state = await this.stateMachine.getCurrentState(caseId, context);

      // 5. Gate kontrolleri (GateChecker ile)
      const gateResult = await this.gateChecker.checkGates(caseId, actionCode, facts, context);
      if (gateResult.blocked) {
        const decision = this.buildDecision(
          false,
          gateResult.reason,
          DecisionCode.GATE_BLOCKED,
          {
            blockedBy: { gateCode: gateResult.gateCode!, severity: gateResult.severity! },
            state,
            factsUsed: gateResult.factsUsed,
          },
        );
        
        // Log decision
        const decisionId = await this.decisionLogger.log(
          caseId, actionCode, context, decision, facts, state, traceId, ruleVersion,
        );
        decision.decisionId = decisionId;
        decision.traceId = traceId;
        
        return decision;
      }

      // 6. State transition kontrolü (StateMachine ile)
      const icraType = this.mapCaseTypeToIcraType(caseExists.type, caseExists.subType ?? undefined);
      const transitionResult = this.stateMachine.canTransition(state, actionCode, icraType);
      if (!transitionResult.allowed) {
        const decision = this.buildDecision(
          false,
          transitionResult.reason,
          DecisionCode.INVALID_TRANSITION,
          { state },
        );
        
        // Log decision
        const decisionId = await this.decisionLogger.log(
          caseId, actionCode, context, decision, facts, state, traceId, ruleVersion,
        );
        decision.decisionId = decisionId;
        decision.traceId = traceId;
        
        return decision;
      }

      // 7. İzin ver
      const decision = this.buildDecision(
        true,
        'OK',
        DecisionCode.OK,
        {
          state,
          factsUsed: gateResult.factsUsed,
          warnings: gateResult.softWarnings,
        },
      );

      // Log decision
      const decisionId = await this.decisionLogger.log(
        caseId, actionCode, context, decision, facts, state, traceId, ruleVersion,
      );
      decision.decisionId = decisionId;
      decision.traceId = traceId;

      return decision;

    } catch (error) {
      this.logger.error(`CPE error for ${actionCode} on case ${caseId}:`, error);
      const decision = this.handleError(caseId, actionCode, context, error as Error, riskLevel);
      
      // Log error decision
      try {
        const decisionId = await this.decisionLogger.log(
          caseId, actionCode, context, decision, facts, state, traceId, ruleVersion,
        );
        decision.decisionId = decisionId;
        decision.traceId = traceId;
      } catch (logError) {
        this.logger.error('Failed to log decision:', logError);
      }
      
      return decision;
    }
  }

  /**
   * CaseType'ı IcraType'a map eder.
   */
  private mapCaseTypeToIcraType(caseType?: string, subType?: string): IcraType {
    if (caseType === 'ILAMSIZ') {
      if (subType === 'KAMBIYO') return IcraType.ILAMSIZ_KAMBIYO;
      return IcraType.ILAMSIZ_GENEL;
    }
    if (caseType === 'ILAMLI') return IcraType.ILAMLI;
    if (caseType === 'NAFAKA') return IcraType.NAFAKA;
    if (caseType === 'KIRA') return IcraType.KIRA;
    if (caseType === 'REHIN') return IcraType.REHIN;
    if (caseType === 'IFLAS') return IcraType.IFLAS;
    
    return IcraType.ILAMSIZ_GENEL;
  }

  /**
   * Hata durumunda fail-closed/fail-open mantığı uygular.
   */
  private handleError(
    caseId: string,
    actionCode: ActionCode,
    context: ActionContext | undefined,
    error: Error,
    riskLevel: RiskLevel,
  ): PolicyDecision {
    const failMode = getFailMode(actionCode);

    if (failMode === 'CLOSED' || riskLevel === RiskLevel.HIGH) {
      // Fail-closed: blokla
      return this.buildDecision(
        false,
        'Sistem hatası - güvenlik nedeniyle işlem engellendi',
        DecisionCode.SYSTEM_ERROR_BLOCKED,
      );
    }

    // Fail-open: izin ver ama uyar
    return this.buildDecision(
      true,
      'OK (sistem uyarısı)',
      DecisionCode.OK_WITH_WARNING,
      { warnings: [{ code: 'SYSTEM_ERROR', message: 'Bazı kontroller yapılamadı', severity: 'WARNING' }] },
    );
  }

  /**
   * Bir dosya için önerilen aksiyonları döndürür.
   * 
   * @param caseId Dosya ID
   * @param scope Opsiyonel scope filtresi
   * @param context Opsiyonel context
   * @returns RecommendedAction[]
   */
  async getNextActions(
    caseId: string,
    scope?: Scope,
    context?: ActionContext,
  ): Promise<RecommendedAction[]> {
    this.logger.debug(`getNextActions for case ${caseId}, scope: ${scope}`);

    try {
      // 1. Facts topla
      let facts = await this.factStore.getFacts(caseId, context);
      
      // 2. Computed facts ekle
      facts = await this.computedFactRegistry.computeAll(caseId, context, facts);
      
      // 3. State al
      const state = await this.stateMachine.getCurrentState(caseId, context);
      
      // 4. Computed metrics hesapla
      const metrics = await this.computeMetrics(caseId, facts);
      
      // 5. Rule engine ile değerlendir
      return this.ruleEngine.evaluate(
        caseId,
        facts,
        state,
        metrics,
        scope,
        context,
        true, // Gate pre-check dahil
      );
    } catch (error) {
      this.logger.error(`Error in getNextActions for case ${caseId}:`, error);
      return [];
    }
  }

  /**
   * Computed metrics hesaplar.
   */
  private async computeMetrics(caseId: string, facts: FactMap): Promise<ComputedMetrics> {
    // Basit metrik hesaplaması - gerçek implementasyonda DB'den çekilir
    const totalDebt = facts.get('case.total_debt_amount');
    const collected = facts.get('case.collected_amount');
    const caseCreatedAt = facts.get('case.created_at');
    const lastActionAt = facts.get('case.last_action_at');
    const debtorCount = facts.get('case.debtor_count');

    const metrics: ComputedMetrics = {};

    if (typeof totalDebt === 'number') {
      metrics.totalDebtAmount = totalDebt;
    }

    if (typeof collected === 'number') {
      metrics.collectedAmount = collected;
      if (typeof totalDebt === 'number' && totalDebt > 0) {
        metrics.remainingDebt = totalDebt - collected;
        metrics.collectionRate = (collected / totalDebt) * 100;
      }
    }

    if (caseCreatedAt instanceof Date) {
      metrics.caseAgeDays = Math.floor(
        (Date.now() - caseCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    if (lastActionAt instanceof Date) {
      metrics.daysSinceLastAction = Math.floor(
        (Date.now() - lastActionAt.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    if (typeof debtorCount === 'number') {
      metrics.debtorCount = debtorCount;
    }

    return metrics;
  }

  /**
   * Aksiyon tamamlandıktan sonra state günceller.
   * Idempotency: Aynı executionId ile tekrar çağrılırsa önceki sonucu döndürür.
   * 
   * @param caseId Dosya ID
   * @param actionCode Aksiyon kodu
   * @param context Opsiyonel context
   * @param result Aksiyon sonucu
   * @param executionId Benzersiz execution ID (UUID)
   * @returns ExecutionResponse
   */
  async onActionExecuted(
    caseId: string,
    actionCode: ActionCode,
    context: ActionContext | undefined,
    result: ActionResult,
    executionId: string,
  ): Promise<ExecutionResponse> {
    const ruleVersion = this.stateMachine.getRuleVersion();
    this.logger.debug(`onActionExecuted: ${actionCode} for case ${caseId}, executionId: ${executionId}`);

    // Check for duplicate (idempotency)
    const { isNew, record } = await this.executionRecorder.startExecution(
      executionId,
      caseId,
      actionCode,
      context,
      ruleVersion,
    );

    if (!isNew) {
      // Return previous result
      this.logger.debug(`Duplicate executionId: ${executionId}, returning previous result`);
      return {
        success: record.status === 'SUCCESS',
        code: record.status === 'NOOP' ? 'DUPLICATE' : record.errorCode,
      };
    }

    if (!result.success) {
      await this.executionRecorder.completeExecution(executionId, result);
      return { success: false, code: result.errorCode };
    }

    try {
      // State transition with optimistic locking (StateMachine ile)
      const transitionResult = await this.stateMachine.applyTransition(
        caseId,
        actionCode,
        context,
        result.expectedStateVersion,
      );
      
      if (!transitionResult.success) {
        if (transitionResult.code === 'VERSION_MISMATCH') {
          await this.executionRecorder.completeExecution(executionId, {
            success: false,
            errorCode: 'CONCURRENT_MODIFICATION',
          });
          return { success: false, code: 'CONCURRENT_MODIFICATION', shouldRetry: true };
        }
        
        await this.executionRecorder.completeExecution(executionId, {
          success: false,
          errorCode: transitionResult.code,
          errorMessage: transitionResult.errorMessage,
        });
        return { success: false, code: transitionResult.code };
      }

      // Write new facts if provided
      if (result.newFacts) {
        await this.factStore.writeFacts(caseId, result.newFacts as Record<string, import('./fact-store').FactValue>, {
          executionId,
          actionCode,
          source: 'CPE',
        });
      }

      // Complete execution
      await this.executionRecorder.completeExecution(executionId, result);

      return { 
        success: true,
        stateVersion: transitionResult.newVersion,
      };

    } catch (error) {
      this.logger.error(`Error in onActionExecuted: ${executionId}`, error);
      await this.executionRecorder.completeExecution(executionId, {
        success: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: (error as Error).message,
      });
      return { success: false, code: 'INTERNAL_ERROR' };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * PolicyDecision builder
   */
  private buildDecision(
    allowed: boolean,
    reason: string,
    code: DecisionCode,
    extras?: Partial<PolicyDecision>,
  ): PolicyDecision {
    return {
      allowed,
      reason,
      code,
      ...extras,
    };
  }

  /**
   * Context'ten scope belirler.
   */
  private getScopeFromContext(context?: ActionContext): Scope {
    if (context?.assetId) return Scope.ASSET;
    if (context?.debtorId) return Scope.DEBTOR;
    if (context?.expenseId) return Scope.EXPENSE;
    return Scope.CASE;
  }

  /**
   * Lock key builder
   */
  private buildLockKey(caseId: string, actionCode: ActionCode, context?: ActionContext): string {
    const parts = ['cpe', 'decision', caseId];
    if (context?.debtorId) parts.push(context.debtorId);
    if (context?.assetId) parts.push(context.assetId);
    return parts.join(':');
  }
}
