/**
 * ScenarioRanker Types
 *
 * Sprint 3 - Task 1.1
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

// ============================================================================
// Input
// ============================================================================

export interface ScenarioResult {
  scenarioId: string;
  /** Risk metric (0-1, minimize) */
  riskScore: number;
  /** Cost metric (0-1, minimize) */
  costScore: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Output
// ============================================================================

export interface RankedScenario extends ScenarioResult {
  /** 0 = non-dominated front */
  frontIndex: number;
  /** Tie-break rank within front */
  rankInFront: number;
}

export interface TradeoffExplanation {
  scenarioA: string;
  scenarioB: string;
  /** Human-readable tradeoff text */
  text: string;
}

export interface RankedResult {
  scenarios: RankedScenario[];
  fronts: RankedScenario[][];
  tradeoffs: TradeoffExplanation[];
}
