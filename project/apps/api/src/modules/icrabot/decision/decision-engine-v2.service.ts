/**
 * DECISION ENGINE V2 SERVICE (v24-v27)
 * 
 * DB-backed decision rules ile çalışır.
 * - v24: Rules DB bundle'dan yüklenir
 * - v25: Predicate desteği
 * - v26: Then actions (enqueue/lock/flag/emit)
 * - v27: Compute + decisions
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionRulesLoaderService, DecisionRule, DecisionThen, DecisionBranch } from './decision-rules-loader.service';
import { PredicateEvaluatorService } from './predicate-evaluator.service';
import { ActionExecutorService, ActionResult } from './action-executor.service';
import { ComputeModulesService, RiskContext, RecoveryContext } from '../compute/compute-modules.service';

export interface DecisionEngineResult {
  matched: number;
  actions: Array<{
    rule_id: string;
    result: ActionResult;
  }>;
  computed?: Record<string, any>;
}

@Injectable()
export class DecisionEngineV2Service {
  private readonly logger = new Logger(DecisionEngineV2Service.name);

  constructor(
    private prisma: PrismaService,
    private rulesLoader: DecisionRulesLoaderService,
    private predicateEvaluator: PredicateEvaluatorService,
    private actionExecutor: ActionExecutorService,
    private computeModules: ComputeModulesService,
  ) {}

  /**
   * Run decision rules for a fact
   */
  async runDecisionRules(
    caseId: string,
    tenantId: string,
    debtorId: string | null,
    factType: string,
    factKey: string,
    factValue: Record<string, any>,
  ): Promise<DecisionEngineResult> {
    const rulesPack = await this.rulesLoader.loadActiveRules(tenantId);
    
    if (!rulesPack.rules.length) {
      return { matched: 0, actions: [] };
    }

    let matched = 0;
    const actions: Array<{ rule_id: string; result: ActionResult }> = [];
    let computed: Record<string, any> = {};

    for (const rule of rulesPack.rules) {
      if (!rule.when || typeof rule.when !== 'string') continue;

      // Parse and match fact type
      const { factType: ruleFt, predicate } = this.predicateEvaluator.parseWhen(rule.when);
      if (ruleFt !== factType) continue;

      // Evaluate predicate
      if (predicate && !this.predicateEvaluator.evaluatePredicate(predicate, factValue)) {
        continue;
      }

      matched++;

      // Process 'then' block
      if (rule.then) {
        // Handle compute (v27)
        if (rule.then.compute && Array.isArray(rule.then.compute)) {
          computed = await this.runCompute(caseId, tenantId, rule.then.compute);
          
          // Save computed results as facts
          for (const [key, value] of Object.entries(computed)) {
            await this.saveComputedFact(caseId, tenantId, key, value);
          }
        }

        // Handle decisions (v27)
        if (rule.then.decisions && Array.isArray(rule.then.decisions)) {
          for (const decision of rule.then.decisions) {
            if (this.evaluateDecisionCondition(decision.if, computed)) {
              const result = await this.actionExecutor.execute(
                caseId, tenantId, debtorId, decision.then, factType, factKey
              );
              actions.push({ rule_id: `${rule.rule_id}_decision`, result });
            }
          }
        }

        // Execute direct actions
        const directThen: DecisionThen = {
          enqueue: rule.then.enqueue,
          open_lock: rule.then.open_lock,
          set_flag: rule.then.set_flag,
          emit: rule.then.emit,
        };

        if (directThen.enqueue || directThen.open_lock || directThen.set_flag || directThen.emit) {
          const result = await this.actionExecutor.execute(
            caseId, tenantId, debtorId, directThen, factType, factKey
          );
          actions.push({ rule_id: rule.rule_id, result });
        }
      }
    }

    return { matched, actions, computed: Object.keys(computed).length ? computed : undefined };
  }

  /**
   * Run compute modules
   */
  private async runCompute(
    caseId: string,
    tenantId: string,
    computeSpecs: string[],
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Get context from existing facts
    const context = await this.buildComputeContext(caseId, tenantId);

    for (const spec of computeSpecs) {
      // Parse spec: "risk = RiskScoring" or "expected_recovery = RecoverySimulator"
      const match = spec.match(/^(\w+)\s*=\s*(\w+)$/);
      if (!match) continue;

      const [, outputKey, moduleName] = match;

      if (moduleName === 'RiskScoring') {
        const riskContext: RiskContext = {
          our_rank: context.our_rank || 1,
          value_mid: context.value_mid || 0,
          confidence: context.confidence || 0.5,
          prior_claims_estimate: context.prior_claims_estimate,
          unknown_amounts_count: context.unknown_amounts_count || 0,
          unknown_activity_count: context.unknown_activity_count || 0,
          missing_rank_info: context.missing_rank_info || false,
          active_prior_liens_count: context.active_prior_liens_count || 0,
        };
        results[outputKey] = await this.computeModules.riskScoring(tenantId, riskContext);
      } else if (moduleName === 'RecoverySimulator') {
        const recoveryContext: RecoveryContext = {
          value_low: context.value_low || 0,
          value_mid: context.value_mid || 0,
          value_high: context.value_high || 0,
          liquidation_factor: context.liquidation_factor || 0.7,
          prior_claims_estimate: context.prior_claims_estimate || 0,
          estimated_costs: context.estimated_costs || 0,
        };
        results[outputKey] = await this.computeModules.recoverySimulator(tenantId, recoveryContext);
      }
    }

    return results;
  }

  /**
   * Build compute context from existing facts
   */
  private async buildComputeContext(caseId: string, tenantId: string): Promise<Record<string, any>> {
    const context: Record<string, any> = {};

    // Get ValuationEstimate fact
    const valuationFact = await this.prisma.icrabotFact.findFirst({
      where: { caseId, tenantId, factType: 'ValuationEstimate' },
      orderBy: { createdAt: 'desc' },
    });

    if (valuationFact && valuationFact.value) {
      const val = valuationFact.value as Record<string, any>;
      context.value_low = val.value_low;
      context.value_mid = val.value_mid;
      context.value_high = val.value_high;
      context.confidence = val.confidence;
    }

    // Get LienSnapshot fact
    const lienFact = await this.prisma.icrabotFact.findFirst({
      where: { caseId, tenantId, factType: 'LienSnapshot' },
      orderBy: { createdAt: 'desc' },
    });

    if (lienFact && lienFact.value) {
      const val = lienFact.value as Record<string, any>;
      context.our_rank = val.our_rank;
      context.prior_claims_estimate = val.prior_claims_estimate;
      context.unknown_amounts_count = val.unknown_amounts_count;
      context.unknown_activity_count = val.unknown_activity_count;
      context.missing_rank_info = val.missing_rank_info;
      context.active_prior_liens_count = val.active_prior_liens_count;
    }

    // Get ContextUpdated fact for costs
    const contextFact = await this.prisma.icrabotFact.findFirst({
      where: { caseId, tenantId, factType: 'ContextUpdated' },
      orderBy: { createdAt: 'desc' },
    });

    if (contextFact && contextFact.value) {
      const val = contextFact.value as Record<string, any>;
      context.liquidation_factor = val.liquidation_factor;
      context.estimated_costs = val.estimated_costs;
    }

    return context;
  }

  /**
   * Evaluate decision condition
   */
  private evaluateDecisionCondition(condition: string, computed: Record<string, any>): boolean {
    if (!condition) return true;

    // Parse conditions like "risk.score >= 85" or "expected_recovery.flags.ok_for_cost_actions == false"
    const match = condition.match(/^([\w.]+)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
    if (!match) return false;

    const [, path, op, rawValue] = match;
    const actual = this.getNestedValue(computed, path);
    
    let expected: any = rawValue.trim();
    if (expected === 'true') expected = true;
    else if (expected === 'false') expected = false;
    else if (!isNaN(Number(expected))) expected = Number(expected);

    switch (op) {
      case '>=': return Number(actual) >= Number(expected);
      case '<=': return Number(actual) <= Number(expected);
      case '>': return Number(actual) > Number(expected);
      case '<': return Number(actual) < Number(expected);
      case '==': return actual === expected;
      case '!=': return actual !== expected;
      default: return false;
    }
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: Record<string, any>, path: string): any {
    let current: any = obj;
    for (const part of path.split('.')) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  /**
   * Save computed result as fact
   */
  private async saveComputedFact(
    caseId: string,
    tenantId: string,
    key: string,
    value: any,
  ): Promise<void> {
    const factHash = this.hashString(`Computed:${key}`);

    await this.prisma.icrabotFact.upsert({
      where: {
        tenantId_caseId_factHash: { tenantId, caseId, factHash },
      },
      create: {
        caseId,
        tenantId,
        factType: 'Computed',
        factKey: key,
        factHash,
        value,
      },
      update: {
        value,
        updatedAt: new Date(),
      },
    });
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
}
