/**
 * Escalation Hysteresis Types
 *
 * Sprint 3 - Task 1.1
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

// ============================================================================
// Escalation Level
// ============================================================================

export type EscalationLevel = 'NONE' | 'L1' | 'L2' | 'L3';

// ============================================================================
// DB-backed State (PostgreSQL)
// ============================================================================

export interface EscalationState {
  incidentId: string;
  currentLevel: EscalationLevel;
  /** ISO 8601 */
  lastTransitionAt: string;
  /** Cooldown expiry — null if not active */
  holdDownUntil: string | null;
  /** Consecutive below-threshold run count */
  stableWindowCounter: number;
  /** ISO 8601 — null if window not started */
  stableWindowStartedAt: string | null;
  /** Optimistic concurrency version */
  version: number;
}

// ============================================================================
// Config
// ============================================================================

export interface HysteresisConfig {
  escalateThreshold: number;
  deescalateThreshold: number;
  /** Consecutive runs required for de-escalation */
  stableWindowRunCount: number;
  /** Minutes required for de-escalation */
  stableWindowMinutes: number;
  /** Cooldown minutes after any level transition */
  holdDownMinutes: number;
}

// ============================================================================
// Decision
// ============================================================================

export type EscalationDecisionAction =
  | 'ESCALATE'
  | 'DEESCALATE'
  | 'HOLD'
  | 'ACCUMULATE';

export interface EscalationDecision {
  action: EscalationDecisionAction;
  newLevel?: EscalationLevel;
  holdDownUntil?: string;
  reason?: string;
  stableWindowCounter?: number;
  stableWindowStartedAt?: string;
  resetStableWindow?: boolean;
}
