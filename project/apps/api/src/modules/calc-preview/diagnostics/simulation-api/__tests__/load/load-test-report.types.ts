/**
 * Load Test Report Types
 *
 * Synthetic Load Validation — Task 1.1
 *
 * @see .kiro/specs/synthetic-load-validation/design.md
 */

// ============================================================================
// Report
// ============================================================================

export interface LoadTestReport {
  startedAt: string;
  completedAt: string;
  overallResult: 'PASS' | 'FAIL';
  scenarios: ScenarioResult[];
  dbPoolPeak: number;
  dbPoolLimit: number;
  seed: number;
  warnings: string[];
  abortReason?: string;
}

// ============================================================================
// Scenario Result
// ============================================================================

export interface ScenarioResult {
  scenarioId: string;
  name: string;
  result: 'PASS' | 'FAIL';
  durationMs: number;
  details: SB1Details | SB6Details | Record<string, unknown>;
  errors: string[];
}

// ============================================================================
// Metrics Snapshot
// ============================================================================

export interface MetricsSnapshot {
  promote_success_total: number;
  promote_failure_total: Record<string, number>;
  drift_detected_total: number;
  escalation_churn_total: number;
  escalation_state_conflict_total: number;
}

// ============================================================================
// SB-1 Details
// ============================================================================

export interface SB1Details {
  acceptedCount: number;
  alreadyPromotedCount: number;
  uniqueRequestIds: number;
  errorCount: number;
}

// ============================================================================
// SB-6 Details
// ============================================================================

export interface SB6Details {
  successCount: number;
  conflictCount: number;
  unexpectedErrorCount: number;
  conflictMetricDelta: number;
}

// ============================================================================
// Abort Signal
// ============================================================================

export type AbortReason =
  | 'UNEXPECTED_500'
  | 'POOL_EXHAUSTION'
  | 'DB_INTEGRITY_BREACH'
  | 'SUITE_TIMEOUT';

export class SuiteAbortError extends Error {
  constructor(
    public readonly reason: AbortReason,
    public readonly detail: string,
  ) {
    super(`Suite ABORT: ${reason} — ${detail}`);
    this.name = 'SuiteAbortError';
  }
}
