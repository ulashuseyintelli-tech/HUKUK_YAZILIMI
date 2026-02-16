/**
 * GuardPolicyResolver — Unit Tests
 *
 * Operational Guard Phase — Task 3.2
 *
 * Test categories:
 * 1. Kill-switch → BLOCK_503
 * 2. Missing required signals → HOLD (fail-closed)
 * 3. Stale signals → HOLD (evaluate) / DEGRADE (promote)
 * 4. Insufficient signals → HOLD (fail-closed)
 * 5. Threshold breaches → DEGRADE
 * 6. Degrade mode allowlist → ALLOW / HOLD
 * 7. Normal → ALLOW
 * 8. Precedence matrix (combos)
 * 9. reasonCodes determinism + ordering
 * 10. Per-tenant override
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — R1, R7
 */

import { resolveGuardPolicy } from '../guard-policy-resolver';
import {
  GuardDecision,
  GuardOperation,
  DegradeAllowedOp,
  SignalStatus,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  REQUIRED_SIGNAL_NAMES,
  type GuardConfig,
  type RiskContextSnapshot,
  type WindowedSignal,
} from '../guard-policy-resolver.types';

// ============================================================================
// Helpers
// ============================================================================

const NOW_MS = new Date('2026-02-15T16:00:00.000Z').getTime();

/** Build a fresh WindowedSignal */
function sig(name: string, value: number, status: SignalStatus = SignalStatus.FRESH): WindowedSignal {
  return {
    name,
    value,
    status,
    sampleCount: 10,
    windowParams: DEFAULT_WINDOW_CONFIG,
    computedAtMs: NOW_MS,
    lastSampleAtMs: NOW_MS - 5_000,
  };
}

/** Build RiskContextSnapshot with all required signals FRESH and below thresholds */
function freshCtx(overrides?: Partial<RiskContextSnapshot>): RiskContextSnapshot {
  return {
    timestampMs: NOW_MS,
    signals: {
      casConflictRate: sig('casConflictRate', 0.1),
      dbTimeoutRate: sig('dbTimeoutRate', 0.1),
      clockSkewMs: sig('clockSkewMs', 100),
    },
    anyStale: false,
    anyInsufficient: false,
    ...overrides,
  };
}

/** Config with kill-switch active for a tenant */
function killSwitchConfig(tenantId: string): GuardConfig {
  return {
    ...DEFAULT_GUARD_CONFIG,
    tenantOverrides: {
      [tenantId]: { killSwitchActive: true },
    },
  };
}

/** Config with degrade mode active for a tenant */
function degradeConfig(tenantId: string, allowlist?: DegradeAllowedOp[]): GuardConfig {
  return {
    ...DEFAULT_GUARD_CONFIG,
    tenantOverrides: {
      [tenantId]: {
        degradeModeActive: true,
        allowedOpsInDegradeMode: allowlist ?? [DegradeAllowedOp.ADMIN_READ, DegradeAllowedOp.HEALTH_CHECK],
      },
    },
  };
}

// ============================================================================
// 1. Kill-switch → BLOCK_503
// ============================================================================

describe('Kill-switch', () => {
  it('active kill-switch → BLOCK_503', () => {
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, freshCtx(), killSwitchConfig('t1'), NOW_MS);
    expect(result.decision).toBe(GuardDecision.BLOCK_503);
    expect(result.reasonCodes).toContain('KILL_SWITCH_ACTIVE');
  });

  it('kill-switch for different tenant does not affect current tenant', () => {
    const result = resolveGuardPolicy('t2', GuardOperation.PROMOTE, freshCtx(), killSwitchConfig('t1'), NOW_MS);
    expect(result.decision).toBe(GuardDecision.ALLOW);
  });

  it('kill-switch applies to all operations', () => {
    for (const op of [GuardOperation.PROMOTE, GuardOperation.EVALUATE, GuardOperation.ADMIN]) {
      const result = resolveGuardPolicy('t1', op, freshCtx(), killSwitchConfig('t1'), NOW_MS);
      expect(result.decision).toBe(GuardDecision.BLOCK_503);
    }
  });
});

// ============================================================================
// 2. Missing required signals → HOLD
// ============================================================================

describe('Missing required signals', () => {
  it('empty signals map → HOLD with all MISSING_SIGNAL codes', () => {
    const ctx = freshCtx({ signals: {} });
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.mode).toBe('MISSING_SIGNALS');
    for (const name of REQUIRED_SIGNAL_NAMES) {
      expect(result.reasonCodes).toContain(`MISSING_SIGNAL:${name}`);
    }
  });

  it('one missing signal → HOLD with that signal code', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 0.1),
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        // clockSkewMs missing
      },
    });
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.reasonCodes).toEqual(['MISSING_SIGNAL:clockSkewMs']);
  });

  it('missing signals codes are lexicographically sorted', () => {
    const ctx = freshCtx({ signals: {} });
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    const missingCodes = result.reasonCodes.filter(c => c.startsWith('MISSING_SIGNAL:'));
    const sorted = [...missingCodes].sort();
    expect(missingCodes).toEqual(sorted);
  });

  it('unknown extra signals are ignored (no error)', () => {
    const ctx = freshCtx({
      signals: {
        ...freshCtx().signals,
        unknownSignal: sig('unknownSignal', 999),
      },
    });
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.ALLOW);
  });
});

// ============================================================================
// 3. Stale signals
// ============================================================================

describe('Stale signals', () => {
  const staleCtx = (): RiskContextSnapshot => freshCtx({
    signals: {
      casConflictRate: sig('casConflictRate', 0.1, SignalStatus.STALE),
      dbTimeoutRate: sig('dbTimeoutRate', 0.1),
      clockSkewMs: sig('clockSkewMs', 100),
    },
    anyStale: true,
  });

  it('stale + evaluate → HOLD (STALE_FAILSAFE)', () => {
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, staleCtx(), DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.mode).toBe('STALE_FAILSAFE');
    expect(result.reasonCodes).toContain('STALE_SIGNAL:casConflictRate');
  });

  it('stale + promote → DEGRADE (STALE_FAILSAFE)', () => {
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, staleCtx(), DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.DEGRADE);
    expect(result.mode).toBe('STALE_FAILSAFE');
  });

  it('stale + admin → DEGRADE (STALE_FAILSAFE)', () => {
    const result = resolveGuardPolicy('t1', GuardOperation.ADMIN, staleCtx(), DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.DEGRADE);
  });

  it('stale signal never produces ALLOW', () => {
    for (const op of [GuardOperation.PROMOTE, GuardOperation.EVALUATE, GuardOperation.ADMIN]) {
      const result = resolveGuardPolicy('t1', op, staleCtx(), DEFAULT_GUARD_CONFIG, NOW_MS);
      expect(result.decision).not.toBe(GuardDecision.ALLOW);
    }
  });

  it('multiple stale signals → all listed in reasonCodes', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 0.1, SignalStatus.STALE),
        dbTimeoutRate: sig('dbTimeoutRate', 0.1, SignalStatus.STALE),
        clockSkewMs: sig('clockSkewMs', 100),
      },
      anyStale: true,
    });
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.reasonCodes).toContain('STALE_SIGNAL:casConflictRate');
    expect(result.reasonCodes).toContain('STALE_SIGNAL:dbTimeoutRate');
  });

  it('DEFENSIVE: anyStale=false but signal is STALE → still enters stale branch', () => {
    // Caller lied about anyStale — resolver must derive from actual signal statuses
    const ctx: RiskContextSnapshot = {
      timestampMs: NOW_MS,
      signals: {
        casConflictRate: sig('casConflictRate', 0.1, SignalStatus.STALE),
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        clockSkewMs: sig('clockSkewMs', 100),
      },
      anyStale: false, // ← LIE
      anyInsufficient: false,
    };
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.mode).toBe('STALE_FAILSAFE');
    expect(result.reasonCodes).toContain('STALE_SIGNAL:casConflictRate');
  });
});

// ============================================================================
// 4. Insufficient signals → HOLD
// ============================================================================

describe('Insufficient signals', () => {
  it('insufficient signal → HOLD (fail-closed)', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 0, SignalStatus.INSUFFICIENT),
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        clockSkewMs: sig('clockSkewMs', 100),
      },
      anyInsufficient: true,
    });
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.mode).toBe('INSUFFICIENT_SIGNALS');
    expect(result.reasonCodes).toContain('INSUFFICIENT_SIGNAL:casConflictRate');
  });

  it('DEFENSIVE: anyInsufficient=false but signal is INSUFFICIENT → still enters insufficient branch', () => {
    // Caller lied about anyInsufficient — resolver must derive from actual signal statuses
    const ctx: RiskContextSnapshot = {
      timestampMs: NOW_MS,
      signals: {
        casConflictRate: sig('casConflictRate', 0, SignalStatus.INSUFFICIENT),
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        clockSkewMs: sig('clockSkewMs', 100),
      },
      anyStale: false,
      anyInsufficient: false, // ← LIE
    };
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.mode).toBe('INSUFFICIENT_SIGNALS');
    expect(result.reasonCodes).toContain('INSUFFICIENT_SIGNAL:casConflictRate');
  });

  it('insufficient never produces ALLOW', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 0, SignalStatus.INSUFFICIENT),
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        clockSkewMs: sig('clockSkewMs', 100),
      },
      anyInsufficient: true,
    });
    for (const op of [GuardOperation.PROMOTE, GuardOperation.EVALUATE, GuardOperation.ADMIN]) {
      const result = resolveGuardPolicy('t1', op, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
      expect(result.decision).not.toBe(GuardDecision.ALLOW);
    }
  });
});

// ============================================================================
// 5. Threshold breaches → DEGRADE
// ============================================================================

describe('Threshold breaches', () => {
  it('CAS conflict rate exceeded → DEGRADE (THRESHOLD_BREACH)', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 0.8), // > 0.5 threshold
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        clockSkewMs: sig('clockSkewMs', 100),
      },
    });
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.DEGRADE);
    expect(result.mode).toBe('THRESHOLD_BREACH');
    expect(result.reasonCodes).toContain('CAS_CONFLICT_RATE_EXCEEDED');
  });

  it('multiple threshold breaches → all listed', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 1.0),
        dbTimeoutRate: sig('dbTimeoutRate', 0.5),
        clockSkewMs: sig('clockSkewMs', 600),
      },
    });
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.DEGRADE);
    expect(result.reasonCodes).toContain('CAS_CONFLICT_RATE_EXCEEDED');
    expect(result.reasonCodes).toContain('DB_TIMEOUT_RATE_EXCEEDED');
    expect(result.reasonCodes).toContain('CLOCK_SKEW_EXCEEDED');
  });

  it('values at threshold → no breach (strict >)', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 0.5), // exactly at threshold
        dbTimeoutRate: sig('dbTimeoutRate', 0.3),
        clockSkewMs: sig('clockSkewMs', 500),
      },
    });
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.ALLOW);
  });
});

// ============================================================================
// 6. Degrade mode allowlist
// ============================================================================

describe('Degrade mode allowlist', () => {
  it('degrade + ADMIN (in allowlist) → ALLOW', () => {
    const result = resolveGuardPolicy('t1', GuardOperation.ADMIN, freshCtx(), degradeConfig('t1'), NOW_MS);
    expect(result.decision).toBe(GuardDecision.ALLOW);
    expect(result.mode).toBe('DEGRADE_ALLOWED');
  });

  it('degrade + PROMOTE (not in allowlist) → HOLD', () => {
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, freshCtx(), degradeConfig('t1'), NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.mode).toBe('DEGRADE_FORCED_HOLD');
  });

  it('degrade + EVALUATE (not in allowlist) → HOLD', () => {
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, freshCtx(), degradeConfig('t1'), NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.mode).toBe('DEGRADE_FORCED_HOLD');
  });

  it('degrade + empty allowlist → HOLD for all ops', () => {
    const config = degradeConfig('t1', []);
    for (const op of [GuardOperation.PROMOTE, GuardOperation.EVALUATE, GuardOperation.ADMIN]) {
      const result = resolveGuardPolicy('t1', op, freshCtx(), config, NOW_MS);
      expect(result.decision).toBe(GuardDecision.HOLD);
    }
  });
});

// ============================================================================
// 7. Normal → ALLOW
// ============================================================================

describe('Normal path', () => {
  it('all signals fresh, below thresholds, no degrade → ALLOW', () => {
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, freshCtx(), DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.ALLOW);
    expect(result.mode).toBeNull();
    expect(result.reasonCodes).toHaveLength(0);
  });

  it('ALLOW snapshot has correct metadata', () => {
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, freshCtx(), DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.tenantId).toBe('t1');
    expect(result.policyVersion).toBe(DEFAULT_GUARD_CONFIG.version);
    expect(result.evaluatedAtMs).toBe(NOW_MS);
    expect(result.riskContextHash).toBeDefined();
  });
});

// ============================================================================
// 8. Precedence matrix
// ============================================================================

describe('Precedence', () => {
  it('kill-switch overrides stale + threshold breach', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 1.0, SignalStatus.STALE),
        dbTimeoutRate: sig('dbTimeoutRate', 0.5),
        clockSkewMs: sig('clockSkewMs', 600),
      },
      anyStale: true,
    });
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { killSwitchActive: true } },
    };
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, ctx, config, NOW_MS);
    expect(result.decision).toBe(GuardDecision.BLOCK_503);
    expect(result.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE']);
  });

  it('missing signal overrides stale (missing checked before stale)', () => {
    const ctx: RiskContextSnapshot = {
      timestampMs: NOW_MS,
      signals: {
        casConflictRate: sig('casConflictRate', 0.1, SignalStatus.STALE),
        // dbTimeoutRate missing
        // clockSkewMs missing
      },
      anyStale: true,
      anyInsufficient: false,
    };
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.mode).toBe('MISSING_SIGNALS');
    expect(result.reasonCodes).toContain('MISSING_SIGNAL:clockSkewMs');
    expect(result.reasonCodes).toContain('MISSING_SIGNAL:dbTimeoutRate');
  });

  it('stale overrides threshold breach', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 1.0, SignalStatus.STALE), // stale + above threshold
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        clockSkewMs: sig('clockSkewMs', 100),
      },
      anyStale: true,
    });
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.HOLD);
    expect(result.mode).toBe('STALE_FAILSAFE');
    // Should NOT contain threshold breach codes (stale takes precedence)
    expect(result.reasonCodes).not.toContain('CAS_CONFLICT_RATE_EXCEEDED');
  });

  it('threshold breach overrides degrade mode', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 1.0), // above threshold
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        clockSkewMs: sig('clockSkewMs', 100),
      },
    });
    const config = degradeConfig('t1');
    const result = resolveGuardPolicy('t1', GuardOperation.ADMIN, ctx, config, NOW_MS);
    expect(result.decision).toBe(GuardDecision.DEGRADE);
    expect(result.mode).toBe('THRESHOLD_BREACH');
  });
});

// ============================================================================
// 9. reasonCodes determinism + ordering
// ============================================================================

describe('reasonCodes determinism', () => {
  it('same input → same reasonCodes (deepEqual)', () => {
    const ctx = freshCtx({ signals: {} });
    const r1 = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    const r2 = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(r1.reasonCodes).toEqual(r2.reasonCodes);
    expect(r1).toEqual(r2);
  });

  it('missing signal codes are lexicographically sorted', () => {
    const ctx = freshCtx({ signals: {} });
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    const codes = [...result.reasonCodes];
    expect(codes).toEqual([...codes].sort());
  });

  it('stale signal codes are lexicographically sorted', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 0.1, SignalStatus.STALE),
        dbTimeoutRate: sig('dbTimeoutRate', 0.1, SignalStatus.STALE),
        clockSkewMs: sig('clockSkewMs', 100, SignalStatus.STALE),
      },
      anyStale: true,
    });
    const result = resolveGuardPolicy('t1', GuardOperation.EVALUATE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    const staleCodes = result.reasonCodes.filter(c => c.startsWith('STALE_SIGNAL:'));
    expect(staleCodes).toEqual([...staleCodes].sort());
  });
});

// ============================================================================
// 10. Per-tenant override
// ============================================================================

describe('Per-tenant override', () => {
  it('tenant-specific thresholds are applied', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: {
        t1: { thresholds: { casConflictRateThreshold: 0.05, dbTimeoutRateThreshold: 0.3, clockSkewThresholdMs: 500 } },
      },
    };
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 0.1), // above 0.05 tenant threshold
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        clockSkewMs: sig('clockSkewMs', 100),
      },
    });
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, ctx, config, NOW_MS);
    expect(result.decision).toBe(GuardDecision.DEGRADE);
    expect(result.reasonCodes).toContain('CAS_CONFLICT_RATE_EXCEEDED');
  });

  it('global default fallback when no tenant override', () => {
    const ctx = freshCtx({
      signals: {
        casConflictRate: sig('casConflictRate', 0.1), // below 0.5 global threshold
        dbTimeoutRate: sig('dbTimeoutRate', 0.1),
        clockSkewMs: sig('clockSkewMs', 100),
      },
    });
    const result = resolveGuardPolicy('unknown', GuardOperation.PROMOTE, ctx, DEFAULT_GUARD_CONFIG, NOW_MS);
    expect(result.decision).toBe(GuardDecision.ALLOW);
  });

  it('evaluatedAtMs equals nowMs parameter', () => {
    const customNow = NOW_MS + 12345;
    const result = resolveGuardPolicy('t1', GuardOperation.PROMOTE, freshCtx(), DEFAULT_GUARD_CONFIG, customNow);
    expect(result.evaluatedAtMs).toBe(customNow);
  });
});
