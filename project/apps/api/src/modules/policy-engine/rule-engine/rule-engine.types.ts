/**
 * RuleEngine Types
 * 
 * Kural tanımları ve değerlendirme sonuçları.
 */

import { ActionCode } from '../types/action-code.enum';
import { Scope } from '../types/scope.enum';
import { ActionContext, StateInfo } from '../types/policy-decision.interface';
import { FactMap } from '../fact-store';

/**
 * Computed Metrics - Hesaplanmış metrikler
 */
export interface ComputedMetrics {
  /** Toplam borç tutarı */
  totalDebtAmount?: number;
  /** Tahsil edilen tutar */
  collectedAmount?: number;
  /** Kalan borç */
  remainingDebt?: number;
  /** Tahsilat oranı (%) */
  collectionRate?: number;
  /** Dosya yaşı (gün) */
  caseAgeDays?: number;
  /** Son işlemden bu yana geçen gün */
  daysSinceLastAction?: number;
  /** Borçlu sayısı */
  debtorCount?: number;
  /** Aktif haciz sayısı */
  activeHacizCount?: number;
}

/**
 * Rule Condition Function
 */
export type RuleConditionFn = (
  facts: FactMap,
  state: StateInfo,
  metrics: ComputedMetrics,
  context?: ActionContext,
) => boolean;

/**
 * Compiled Rule Definition
 */
export interface CompiledRule {
  ruleId: string;
  name: string;
  description?: string;
  /** Kural koşulu */
  when: RuleConditionFn;
  /** Önerilen aksiyon */
  then: {
    actionCode: ActionCode;
    priority: number; // 1-100, düşük = yüksek öncelik
    reason: string;
    scope: Scope;
  };
  /** Hangi icra türlerinde geçerli */
  icraTypes?: string[];
  /** Hangi aşamalarda geçerli */
  validStages?: string[];
  /** Aktif mi */
  isActive: boolean;
}

/**
 * Recommended Action - Önerilen aksiyon
 */
export interface RecommendedAction {
  actionCode: ActionCode;
  priority: number;
  reason: string;
  scope: Scope;
  context?: ActionContext;
  ruleId: string;
  /** Gate pre-check sonucu (opsiyonel) */
  gatePreCheck?: {
    blocked: boolean;
    gateCode?: string;
    reason?: string;
  };
}

/**
 * Rule Evaluation Context
 */
export interface RuleEvaluationContext {
  caseId: string;
  facts: FactMap;
  state: StateInfo;
  metrics: ComputedMetrics;
  scope?: Scope;
  context?: ActionContext;
}
