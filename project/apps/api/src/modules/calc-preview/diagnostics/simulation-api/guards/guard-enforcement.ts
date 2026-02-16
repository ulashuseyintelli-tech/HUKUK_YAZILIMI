/**
 * Guard Enforcement — Pipeline-Level Decision Check
 *
 * Operational Guard Phase — Task 6.1
 *
 * Defense-in-depth: interceptor already short-circuits HOLD/BLOCK_503,
 * but pipeline services also check the attached snapshot as a safety net.
 *
 * DEGRADE + non-allowlisted → early return (no state mutation).
 * This should never happen in practice (resolver converts to HOLD),
 * but the check exists as a belt-and-suspenders guard.
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D5
 * @see .kiro/specs/operational-guard-phase/requirements.md — R5
 */

import {
  GuardDecision,
  GuardOperation,
  isDegradeAllowed,
  resolveTenantConfig,
  type GuardConfig,
  type GuardDecisionSnapshot,
} from './guard-policy-resolver.types';

// ============================================================================
// Enforcement Result
// ============================================================================

export interface GuardEnforcementResult {
  /** Whether the pipeline should proceed */
  readonly allowed: boolean;
  /** If not allowed, the reason for blocking */
  readonly reason: string | null;
  /** The guard decision that was enforced */
  readonly decision: GuardDecision;
}

// ============================================================================
// Enforcement Function
// ============================================================================

/**
 * Enforce guard decision at pipeline entry point.
 *
 * Returns { allowed: false } for:
 *   - HOLD (any reason)
 *   - BLOCK_503 (should never reach here — interceptor catches)
 *   - DEGRADE + non-allowlisted operation
 *
 * Returns { allowed: true } for:
 *   - ALLOW
 *   - DEGRADE + allowlisted operation
 *
 * No side-effects. Caller is responsible for metrics/audit.
 */
export function enforceGuardDecision(
  snapshot: GuardDecisionSnapshot | undefined,
  operation: GuardOperation,
  config?: GuardConfig,
): GuardEnforcementResult {
  // No snapshot attached → allow (guard interceptor not wired yet)
  if (!snapshot) {
    return { allowed: true, reason: null, decision: GuardDecision.ALLOW };
  }

  // BLOCK_503 — belt-and-suspenders (interceptor should have caught this)
  if (snapshot.decision === GuardDecision.BLOCK_503) {
    return { allowed: false, reason: 'BLOCK_503', decision: GuardDecision.BLOCK_503 };
  }

  // HOLD — no state mutation
  if (snapshot.decision === GuardDecision.HOLD) {
    return { allowed: false, reason: snapshot.mode ?? 'HOLD', decision: GuardDecision.HOLD };
  }

  // DEGRADE — check allowlist (defense-in-depth)
  if (snapshot.decision === GuardDecision.DEGRADE && config) {
    const tenantConfig = resolveTenantConfig(snapshot.tenantId, config);
    if (!isDegradeAllowed(operation, tenantConfig.allowedOpsInDegradeMode)) {
      return { allowed: false, reason: 'DEGRADE_FORCED_HOLD', decision: GuardDecision.DEGRADE };
    }
  }

  // ALLOW or DEGRADE + allowlisted
  return { allowed: true, reason: null, decision: snapshot.decision };
}
