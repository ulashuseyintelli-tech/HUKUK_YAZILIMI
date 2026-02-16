/**
 * Guard Enforcement — Unit Tests
 *
 * Operational Guard Phase — Task 6.3
 *
 * Tests enforceGuardDecision() pipeline-level defense-in-depth.
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — R5
 */

import { enforceGuardDecision } from '../guard-enforcement';
import {
  GuardDecision,
  GuardOperation,
  DegradeAllowedOp,
  buildSnapshot,
  DEFAULT_GUARD_CONFIG,
  type GuardConfig,
  type GuardDecisionSnapshot,
  type RiskContextSnapshot,
  SignalStatus,
  REQUIRED_SIGNAL_NAMES,
  DEFAULT_WINDOW_CONFIG,
} from '../guard-policy-resolver.types';

// ============================================================================
// Helpers
// ============================================================================

const NOW_MS = 1_700_000_000_000;

function freshRiskContext(): RiskContextSnapshot {
  const signals: Record<string, any> = {};
  for (const name of REQUIRED_SIGNAL_NAMES) {
    signals[name] = {
      name,
      value: 0.1,
      status: SignalStatus.FRESH,
      sampleCount: 10,
      windowParams: DEFAULT_WINDOW_CONFIG,
      computedAtMs: NOW_MS,
      lastSampleAtMs: NOW_MS - 5_000,
    };
  }
  return { timestampMs: NOW_MS, signals, anyStale: false, anyInsufficient: false };
}

function makeSnapshot(
  decision: GuardDecision,
  mode: string | null = null,
  reasonCodes: string[] = [],
  tenantId = 'tenant-1',
): GuardDecisionSnapshot {
  return buildSnapshot(decision, mode, reasonCodes, '1.0.0', NOW_MS, freshRiskContext(), tenantId);
}

// ============================================================================
// Tests
// ============================================================================

describe('enforceGuardDecision', () => {
  // ── ALLOW ─────────────────────────────────────────────────────────
  it('returns allowed=true for ALLOW decision', () => {
    const snapshot = makeSnapshot(GuardDecision.ALLOW);
    const result = enforceGuardDecision(snapshot, GuardOperation.PROMOTE);
    expect(result.allowed).toBe(true);
    expect(result.decision).toBe(GuardDecision.ALLOW);
  });

  it('returns allowed=true when no snapshot attached (guard not wired)', () => {
    const result = enforceGuardDecision(undefined, GuardOperation.PROMOTE);
    expect(result.allowed).toBe(true);
  });

  // ── HOLD ──────────────────────────────────────────────────────────
  it('returns allowed=false for HOLD decision', () => {
    const snapshot = makeSnapshot(GuardDecision.HOLD, 'MISSING_SIGNALS', ['MISSING_SIGNAL:casConflictRate']);
    const result = enforceGuardDecision(snapshot, GuardOperation.EVALUATE);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('MISSING_SIGNALS');
    expect(result.decision).toBe(GuardDecision.HOLD);
  });

  it('returns allowed=false for HOLD with DEGRADE_FORCED_HOLD mode', () => {
    const snapshot = makeSnapshot(GuardDecision.HOLD, 'DEGRADE_FORCED_HOLD', ['DEGRADE_MODE_ACTIVE']);
    const result = enforceGuardDecision(snapshot, GuardOperation.PROMOTE);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('DEGRADE_FORCED_HOLD');
  });

  // ── BLOCK_503 (belt-and-suspenders) ───────────────────────────────
  it('returns allowed=false for BLOCK_503 (should not reach pipeline)', () => {
    const snapshot = makeSnapshot(GuardDecision.BLOCK_503, null, ['KILL_SWITCH_ACTIVE']);
    const result = enforceGuardDecision(snapshot, GuardOperation.PROMOTE);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('BLOCK_503');
    expect(result.decision).toBe(GuardDecision.BLOCK_503);
  });

  // ── DEGRADE + allowlisted ─────────────────────────────────────────
  it('returns allowed=true for DEGRADE + allowlisted operation (ADMIN)', () => {
    const snapshot = makeSnapshot(GuardDecision.DEGRADE, 'STALE_FAILSAFE', ['STALE_SIGNAL:casConflictRate']);
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalDegradeAllowlist: [DegradeAllowedOp.ADMIN_READ],
    };
    const result = enforceGuardDecision(snapshot, GuardOperation.ADMIN, config);
    expect(result.allowed).toBe(true);
    expect(result.decision).toBe(GuardDecision.DEGRADE);
  });

  // ── DEGRADE + non-allowlisted ─────────────────────────────────────
  it('returns allowed=false for DEGRADE + non-allowlisted operation (PROMOTE)', () => {
    const snapshot = makeSnapshot(GuardDecision.DEGRADE, 'THRESHOLD_BREACH', ['CAS_CONFLICT_RATE_EXCEEDED']);
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      globalDegradeAllowlist: [DegradeAllowedOp.ADMIN_READ],
    };
    const result = enforceGuardDecision(snapshot, GuardOperation.PROMOTE, config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('DEGRADE_FORCED_HOLD');
  });

  it('returns allowed=false for DEGRADE + EVALUATE (never allowlisted)', () => {
    const snapshot = makeSnapshot(GuardDecision.DEGRADE, 'THRESHOLD_BREACH', ['DB_TIMEOUT_RATE_EXCEEDED']);
    const result = enforceGuardDecision(snapshot, GuardOperation.EVALUATE, DEFAULT_GUARD_CONFIG);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('DEGRADE_FORCED_HOLD');
  });

  // ── DEGRADE without config (no allowlist check) ───────────────────
  it('returns allowed=true for DEGRADE when no config provided (graceful)', () => {
    const snapshot = makeSnapshot(GuardDecision.DEGRADE, 'STALE_FAILSAFE');
    const result = enforceGuardDecision(snapshot, GuardOperation.PROMOTE);
    expect(result.allowed).toBe(true);
  });

  // ── HOLD mode=null fallback ───────────────────────────────────────
  it('returns reason=HOLD when mode is null', () => {
    const snapshot = buildSnapshot(
      GuardDecision.HOLD, null, [], '1.0.0', NOW_MS, freshRiskContext(), 'tenant-1',
    );
    const result = enforceGuardDecision(snapshot, GuardOperation.PROMOTE);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('HOLD');
  });
});
