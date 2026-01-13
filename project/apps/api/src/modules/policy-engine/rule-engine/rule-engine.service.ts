/**
 * RuleEngine Service
 * 
 * Dosya durumuna göre önerilen aksiyonları değerlendirir.
 * Pre-compiled rules kullanır.
 * 
 * @see design.md - Section 6: RuleEngine
 */

import { Injectable, Logger } from '@nestjs/common';
import { ActionCode } from '../types/action-code.enum';
import { Scope } from '../types/scope.enum';
import { ActionContext, StateInfo } from '../types/policy-decision.interface';
import { FactMap } from '../fact-store';
import { GateCheckerService } from '../gate-checker';
import {
  ComputedMetrics,
  RecommendedAction,
  CompiledRule,
} from './rule-engine.types';
import {
  COMPILED_RULES,
  getActiveRules,
  getRulesForStage,
} from './compiled/rules.compiled';

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    private readonly gateChecker: GateCheckerService,
  ) {}

  /**
   * Dosya için önerilen aksiyonları değerlendirir.
   * 
   * @param caseId Dosya ID
   * @param facts Fact map
   * @param state Mevcut state
   * @param metrics Hesaplanmış metrikler
   * @param scope Opsiyonel scope filtresi
   * @param context Opsiyonel context
   * @param includeGatePreCheck Gate pre-check dahil edilsin mi
   * @returns Öncelik sırasına göre sıralanmış öneriler
   */
  async evaluate(
    caseId: string,
    facts: FactMap,
    state: StateInfo,
    metrics: ComputedMetrics,
    scope?: Scope,
    context?: ActionContext,
    includeGatePreCheck: boolean = false,
  ): Promise<RecommendedAction[]> {
    const recommendations: RecommendedAction[] = [];

    // Mevcut aşama için geçerli kuralları al
    const applicableRules = getRulesForStage(state.currentState);

    this.logger.debug(
      `Evaluating ${applicableRules.length} rules for case ${caseId} in stage ${state.currentState}`,
    );

    for (const rule of applicableRules) {
      try {
        // Scope filtresi
        if (scope && rule.then.scope !== scope) {
          continue;
        }

        // Kural koşulunu değerlendir
        const matches = rule.when(facts, state, metrics, context);

        if (matches) {
          const recommendation: RecommendedAction = {
            actionCode: rule.then.actionCode,
            priority: rule.then.priority,
            reason: rule.then.reason,
            scope: rule.then.scope,
            context,
            ruleId: rule.ruleId,
          };

          // Gate pre-check (opsiyonel)
          if (includeGatePreCheck) {
            const gateResult = await this.gateChecker.checkHardGates(
              caseId,
              rule.then.actionCode,
              facts,
              context,
            );
            recommendation.gatePreCheck = {
              blocked: gateResult.blocked,
              gateCode: gateResult.gateCode,
              reason: gateResult.reason,
            };
          }

          recommendations.push(recommendation);

          this.logger.debug(
            `Rule ${rule.ruleId} matched for case ${caseId}: ${rule.then.actionCode}`,
          );
        }
      } catch (error) {
        this.logger.error(`Error evaluating rule ${rule.ruleId}:`, error);
        // Kural hatası kritik değil, devam et
      }
    }

    // Önceliğe göre sırala (düşük = yüksek öncelik)
    recommendations.sort((a, b) => a.priority - b.priority);

    this.logger.debug(
      `Found ${recommendations.length} recommendations for case ${caseId}`,
    );

    return recommendations;
  }

  /**
   * Belirli bir aksiyon için kural önerisi var mı kontrol eder.
   */
  async hasRecommendation(
    caseId: string,
    actionCode: ActionCode,
    facts: FactMap,
    state: StateInfo,
    metrics: ComputedMetrics,
    context?: ActionContext,
  ): Promise<boolean> {
    const recommendations = await this.evaluate(
      caseId,
      facts,
      state,
      metrics,
      undefined,
      context,
      false,
    );

    return recommendations.some(r => r.actionCode === actionCode);
  }

  /**
   * En yüksek öncelikli öneriyi döndürür.
   */
  async getTopRecommendation(
    caseId: string,
    facts: FactMap,
    state: StateInfo,
    metrics: ComputedMetrics,
    scope?: Scope,
    context?: ActionContext,
  ): Promise<RecommendedAction | null> {
    const recommendations = await this.evaluate(
      caseId,
      facts,
      state,
      metrics,
      scope,
      context,
      true,
    );

    // Gate'den geçen ilk öneriyi döndür
    const unblocked = recommendations.find(r => !r.gatePreCheck?.blocked);
    return unblocked || recommendations[0] || null;
  }

  /**
   * Tüm kural tanımlarını döndürür.
   */
  getAllRules(): CompiledRule[] {
    return [...COMPILED_RULES];
  }

  /**
   * Aktif kuralları döndürür.
   */
  getActiveRules(): CompiledRule[] {
    return getActiveRules();
  }

  /**
   * Belirli bir kural detayını döndürür.
   */
  getRule(ruleId: string): CompiledRule | undefined {
    return COMPILED_RULES.find(r => r.ruleId === ruleId);
  }
}
