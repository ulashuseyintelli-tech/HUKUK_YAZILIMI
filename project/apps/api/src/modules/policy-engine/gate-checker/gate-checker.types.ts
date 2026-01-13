/**
 * GateChecker Types
 * 
 * Gate tanımları ve sonuç tipleri.
 */

import { ActionCode } from '../types/action-code.enum';
import { FactMap } from '../fact-store';
import { ActionContext } from '../types/policy-decision.interface';

/**
 * Gate Severity - HARD bloklar, SOFT uyarır
 */
export type GateSeverity = 'HARD' | 'SOFT';

/**
 * Gate Warning
 */
export interface GateWarning {
  code: string;
  message: string;
  severity: 'INFO' | 'WARNING';
}

/**
 * Gate Result
 */
export interface GateResult {
  blocked: boolean;
  gateCode?: string;
  reason: string;
  severity?: GateSeverity;
  factsUsed: string[];
  softWarnings?: GateWarning[];
}

/**
 * Gate Condition Function
 */
export type GateConditionFn = (facts: FactMap, context?: ActionContext) => boolean;

/**
 * Compiled Gate Definition
 */
export interface CompiledGate {
  gateCode: string;
  name: string;
  description?: string;
  actionCodes: ActionCode[] | '*'; // '*' = tüm aksiyonlar
  condition: GateConditionFn;
  severity: GateSeverity;
  reason: string;
  priority: number; // Düşük = önce kontrol edilir
}

/**
 * Gate Evaluation Context
 */
export interface GateEvaluationContext {
  caseId: string;
  actionCode: ActionCode;
  facts: FactMap;
  context?: ActionContext;
}
