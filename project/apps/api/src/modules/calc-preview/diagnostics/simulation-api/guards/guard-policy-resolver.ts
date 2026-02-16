/**
 * GuardPolicyResolver — Deterministic Pure Function
 *
 * Operational Guard Phase — Task 3
 *
 * No external state. No Date.now(). No DB reads.
 * All input via parameters → same input → same output.
 *
 * Decision precedence (highest to lowest):
 *   1. Kill-switch active        → BLOCK_503
 *   2. Missing required signal   → HOLD (fail-closed)
 *   3. Stale signal + evaluate   → HOLD
 *   4. Stale signal + promote    → DEGRADE (STALE_FAILSAFE)
 *   5. Insufficient signal       → HOLD (fail-closed)
 *   6. Threshold breach          → DEGRADE (THRESHOLD_BREACH)
 *   7. Degrade mode + !allowlist → HOLD (DEGRADE_FORCED_HOLD)
 *   8. Degrade mode + allowlist  → ALLOW (DEGRADE_ALLOWED)
 *   9. Normal                    → ALLOW
 *
 * DEFENSIVE DESIGN:
 *   Stale/insufficient detection is derived from actual signal statuses
 *   (Object.values(signals).some(s => s.status === X)), NOT from
 *   riskContext.anyStale/anyInsufficient flags. Those flags are kept
 *   for debug/logging but are NOT trusted for decision logic.
 *   This prevents silent safety bugs if caller sets flags incorrectly.
 *
 * reasonCodes ordering:
 *   - Primary: severity group order (kill > missing > stale > insufficient > threshold > degrade)
 *   - Secondary: lexicographic within same group
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D2
 * @see .kiro/specs/operational-guard-phase/requirements.md — R1, R7
 */

import {
  GuardDecision,
  GuardOperation,
  REQUIRED_SIGNAL_NAMES,
  SignalStatus,
  buildSnapshot,
  checkThresholds,
  isDegradeAllowed,
  resolveTenantConfig,
  type GuardConfig,
  type GuardDecisionSnapshot,
  type RiskContextSnapshot,
} from './guard-policy-resolver.types';

/**
 * Resolve guard policy — pure function, deterministic.
 *
 * @param tenantId - Tenant identifier
 * @param operation - Pipeline operation (promote/evaluate/admin)
 * @param riskContext - Risk context snapshot from SignalWindowEngine
 * @param config - Global guard config (includes tenant overrides)
 * @param nowMs - Current time in ms (injected, never Date.now())
 * @returns Immutable GuardDecisionSnapshot
 */
export function resolveGuardPolicy(
  tenantId: string,
  operation: GuardOperation,
  riskContext: RiskContextSnapshot,
  config: GuardConfig,
  nowMs: number,
): GuardDecisionSnapshot {
  const tenantConfig = resolveTenantConfig(tenantId, config);
  const reasonCodes: string[] = [];

  // ── P1: Kill-switch (highest priority) ────────────────────────────
  if (tenantConfig.killSwitchActive) {
    reasonCodes.push('KILL_SWITCH_ACTIVE');
    return snap(GuardDecision.BLOCK_503, null, reasonCodes, config, riskContext, tenantId, nowMs);
  }

  // ── P2: Missing required signals (fail-closed) ───────────────────
  const missingCodes = findMissingSignals(riskContext);
  if (missingCodes.length > 0) {
    reasonCodes.push(...missingCodes);
    return snap(GuardDecision.HOLD, 'MISSING_SIGNALS', reasonCodes, config, riskContext, tenantId, nowMs);
  }

  // ── P3/P4: Stale signals (fail-closed) ───────────────────────────
  // DEFENSIVE: derive from actual signal statuses, not riskContext.anyStale flag.
  // riskContext.anyStale is kept for debug/logging but NOT trusted for decisions.
  const staleCodes = findStaleSignals(riskContext);
  if (staleCodes.length > 0) {
    reasonCodes.push(...staleCodes);

    if (operation === GuardOperation.EVALUATE) {
      // P3: evaluate + stale → HOLD
      return snap(GuardDecision.HOLD, 'STALE_FAILSAFE', reasonCodes, config, riskContext, tenantId, nowMs);
    }
    // P4: promote/admin + stale → DEGRADE
    return snap(GuardDecision.DEGRADE, 'STALE_FAILSAFE', reasonCodes, config, riskContext, tenantId, nowMs);
  }

  // ── P5: Insufficient signals (fail-closed) ───────────────────────
  // DEFENSIVE: derive from actual signal statuses, not riskContext.anyInsufficient flag.
  const insufficientCodes = findInsufficientSignals(riskContext);
  if (insufficientCodes.length > 0) {
    reasonCodes.push(...insufficientCodes);
    return snap(GuardDecision.HOLD, 'INSUFFICIENT_SIGNALS', reasonCodes, config, riskContext, tenantId, nowMs);
  }

  // ── P6: Threshold breaches ────────────────────────────────────────
  const thresholdBreaches = checkThresholds(riskContext, tenantConfig.thresholds);
  if (thresholdBreaches.length > 0) {
    reasonCodes.push(...thresholdBreaches);
    return snap(GuardDecision.DEGRADE, 'THRESHOLD_BREACH', reasonCodes, config, riskContext, tenantId, nowMs);
  }

  // ── P7/P8: Degrade mode (config-driven) ──────────────────────────
  if (tenantConfig.degradeModeActive) {
    reasonCodes.push('DEGRADE_MODE_ACTIVE');
    if (isDegradeAllowed(operation, tenantConfig.allowedOpsInDegradeMode)) {
      return snap(GuardDecision.ALLOW, 'DEGRADE_ALLOWED', reasonCodes, config, riskContext, tenantId, nowMs);
    }
    return snap(GuardDecision.HOLD, 'DEGRADE_FORCED_HOLD', reasonCodes, config, riskContext, tenantId, nowMs);
  }

  // ── P9: Normal — ALLOW ────────────────────────────────────────────
  return snap(GuardDecision.ALLOW, null, reasonCodes, config, riskContext, tenantId, nowMs);
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Find missing required signals.
 * Returns sorted MISSING_SIGNAL:<name> codes (lexicographic).
 */
function findMissingSignals(riskContext: RiskContextSnapshot): string[] {
  const missing: string[] = [];
  for (const name of REQUIRED_SIGNAL_NAMES) {
    if (!(name in riskContext.signals)) {
      missing.push(`MISSING_SIGNAL:${name}`);
    }
  }
  return missing.sort();
}

/**
 * Find stale signals among required signals.
 * Returns sorted STALE_SIGNAL:<name> codes (lexicographic).
 */
function findStaleSignals(riskContext: RiskContextSnapshot): string[] {
  const stale: string[] = [];
  for (const name of REQUIRED_SIGNAL_NAMES) {
    const signal = riskContext.signals[name];
    if (signal && signal.status === SignalStatus.STALE) {
      stale.push(`STALE_SIGNAL:${name}`);
    }
  }
  return stale.sort();
}

/**
 * Find insufficient signals among required signals.
 * Returns sorted INSUFFICIENT_SIGNAL:<name> codes (lexicographic).
 */
function findInsufficientSignals(riskContext: RiskContextSnapshot): string[] {
  const insufficient: string[] = [];
  for (const name of REQUIRED_SIGNAL_NAMES) {
    const signal = riskContext.signals[name];
    if (signal && signal.status === SignalStatus.INSUFFICIENT) {
      insufficient.push(`INSUFFICIENT_SIGNAL:${name}`);
    }
  }
  return insufficient.sort();
}

/** Shorthand for buildSnapshot with sorted reasonCodes */
function snap(
  decision: GuardDecision,
  mode: string | null,
  reasonCodes: string[],
  config: GuardConfig,
  riskContext: RiskContextSnapshot,
  tenantId: string,
  nowMs: number,
): GuardDecisionSnapshot {
  return buildSnapshot(decision, mode, reasonCodes, config.version, nowMs, riskContext, tenantId);
}
