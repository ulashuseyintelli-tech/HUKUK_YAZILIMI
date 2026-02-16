/**
 * Guard Policy Resolver Types — Unit Tests
 *
 * Operational Guard Phase — Task 1 DoD + Task 2.3 (ms migration + SignalName)
 *
 * Tests:
 * - Schema validation (negative/zero value reject)
 * - Tenant override merge determinism
 * - Enum allowlist parse/serialize determinism
 * - policyVersion stable (same config → same version)
 * - buildSnapshot immutability
 * - isDegradeAllowed correctness
 * - checkThresholds correctness
 * - REQUIRED_SIGNAL_NAMES + SignalName type
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — R1, R2, R5, R9
 */

import {
  GuardDecision,
  GuardOperation,
  DegradeAllowedOp,
  SignalStatus,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_GUARD_THRESHOLDS,
  DEFAULT_WINDOW_CONFIG,
  REQUIRED_SIGNAL_NAMES,
  validateGuardThresholds,
  validateWindowConfig,
  resolveTenantConfig,
  computeRiskContextHash,
  buildSnapshot,
  isDegradeAllowed,
  checkThresholds,
  type GuardConfig,
  type RiskContextSnapshot,
  type SignalName,
} from '../guard-policy-resolver.types';

// ============================================================================
// Test Helpers
// ============================================================================

/** Base time: 2026-02-15T15:00:00.000Z in ms */
const BASE_MS = new Date('2026-02-15T15:00:00.000Z').getTime();

function freshRiskContext(overrides?: Partial<RiskContextSnapshot>): RiskContextSnapshot {
  return {
    timestampMs: BASE_MS,
    signals: {},
    anyStale: false,
    anyInsufficient: false,
    ...overrides,
  };
}

// ============================================================================
// Schema Validation
// ============================================================================

describe('validateGuardThresholds', () => {
  it('accepts valid thresholds', () => {
    const errors = validateGuardThresholds(DEFAULT_GUARD_THRESHOLDS);
    expect(errors).toHaveLength(0);
  });

  it('rejects negative casConflictRateThreshold', () => {
    const errors = validateGuardThresholds({
      ...DEFAULT_GUARD_THRESHOLDS,
      casConflictRateThreshold: -1,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('casConflictRateThreshold');
  });

  it('rejects zero dbTimeoutRateThreshold', () => {
    const errors = validateGuardThresholds({
      ...DEFAULT_GUARD_THRESHOLDS,
      dbTimeoutRateThreshold: 0,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('dbTimeoutRateThreshold');
  });

  it('rejects zero clockSkewThresholdMs', () => {
    const errors = validateGuardThresholds({
      ...DEFAULT_GUARD_THRESHOLDS,
      clockSkewThresholdMs: 0,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.field).toBe('clockSkewThresholdMs');
  });

  it('reports all invalid fields at once', () => {
    const errors = validateGuardThresholds({
      casConflictRateThreshold: -1,
      dbTimeoutRateThreshold: 0,
      clockSkewThresholdMs: -5,
    });
    expect(errors).toHaveLength(3);
  });
});

describe('validateWindowConfig', () => {
  it('accepts valid window config', () => {
    const errors = validateWindowConfig(DEFAULT_WINDOW_CONFIG);
    expect(errors).toHaveLength(0);
  });

  it('rejects zero windowSizeSeconds', () => {
    const errors = validateWindowConfig({ ...DEFAULT_WINDOW_CONFIG, windowSizeSeconds: 0 });
    expect(errors.some(e => e.field === 'windowSizeSeconds')).toBe(true);
  });

  it('rejects negative minSampleCount', () => {
    const errors = validateWindowConfig({ ...DEFAULT_WINDOW_CONFIG, minSampleCount: -1 });
    expect(errors.some(e => e.field === 'minSampleCount')).toBe(true);
  });

  it('rejects negative stalenessThresholdSeconds', () => {
    const errors = validateWindowConfig({ ...DEFAULT_WINDOW_CONFIG, stalenessThresholdSeconds: -10 });
    expect(errors.some(e => e.field === 'stalenessThresholdSeconds')).toBe(true);
  });
});

// ============================================================================
// Tenant Override Merge Determinism
// ============================================================================

describe('resolveTenantConfig', () => {
  it('returns global defaults when no tenant override exists', () => {
    const result = resolveTenantConfig('unknown-tenant', DEFAULT_GUARD_CONFIG);
    expect(result.killSwitchActive).toBe(false);
    expect(result.degradeModeActive).toBe(false);
    expect(result.thresholds).toEqual(DEFAULT_GUARD_THRESHOLDS);
    expect(result.allowedOpsInDegradeMode).toEqual(DEFAULT_GUARD_CONFIG.globalDegradeAllowlist);
  });

  it('merges tenant override with global defaults', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: {
        'tenant-A': {
          killSwitchActive: true,
          thresholds: { ...DEFAULT_GUARD_THRESHOLDS, casConflictRateThreshold: 0.1 },
        },
      },
    };
    const result = resolveTenantConfig('tenant-A', config);
    expect(result.killSwitchActive).toBe(true);
    expect(result.thresholds.casConflictRateThreshold).toBe(0.1);
    // Non-overridden fields keep global defaults
    expect(result.thresholds.dbTimeoutRateThreshold).toBe(DEFAULT_GUARD_THRESHOLDS.dbTimeoutRateThreshold);
  });

  it('returns immutable copy — mutation does not affect source', () => {
    const config: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
    const result1 = resolveTenantConfig('t1', config);
    const result2 = resolveTenantConfig('t1', config);
    // Different object references
    expect(result1).not.toBe(result2);
    // But equal values
    expect(result1).toEqual(result2);
  });

  it('tenant A override does not leak into tenant B (P5 isolation)', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: {
        'tenant-A': { killSwitchActive: true, degradeModeActive: true },
      },
    };
    const resultA = resolveTenantConfig('tenant-A', config);
    const resultB = resolveTenantConfig('tenant-B', config);
    expect(resultA.killSwitchActive).toBe(true);
    expect(resultB.killSwitchActive).toBe(false);
    expect(resultA.degradeModeActive).toBe(true);
    expect(resultB.degradeModeActive).toBe(false);
  });

  it('uses tenant-specific degrade allowlist when provided', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: {
        'tenant-X': {
          allowedOpsInDegradeMode: [DegradeAllowedOp.HEALTH_CHECK],
        },
      },
    };
    const result = resolveTenantConfig('tenant-X', config);
    expect(result.allowedOpsInDegradeMode).toEqual([DegradeAllowedOp.HEALTH_CHECK]);
  });
});

// ============================================================================
// Enum Determinism
// ============================================================================

describe('enum determinism', () => {
  it('GuardDecision enum values are stable strings', () => {
    expect(GuardDecision.ALLOW).toBe('ALLOW');
    expect(GuardDecision.HOLD).toBe('HOLD');
    expect(GuardDecision.BLOCK_503).toBe('BLOCK_503');
    expect(GuardDecision.DEGRADE).toBe('DEGRADE');
  });

  it('GuardOperation enum values are stable strings', () => {
    expect(GuardOperation.PROMOTE).toBe('promote');
    expect(GuardOperation.EVALUATE).toBe('evaluate');
    expect(GuardOperation.ADMIN).toBe('admin');
  });

  it('DegradeAllowedOp enum values are stable strings', () => {
    expect(DegradeAllowedOp.ADMIN_READ).toBe('ADMIN_READ');
    expect(DegradeAllowedOp.HEALTH_CHECK).toBe('HEALTH_CHECK');
    expect(DegradeAllowedOp.METRICS_SCRAPE).toBe('METRICS_SCRAPE');
  });

  it('SignalStatus enum values are stable strings', () => {
    expect(SignalStatus.FRESH).toBe('FRESH');
    expect(SignalStatus.STALE).toBe('STALE');
    expect(SignalStatus.INSUFFICIENT).toBe('INSUFFICIENT');
  });
});

// ============================================================================
// REQUIRED_SIGNAL_NAMES + SignalName
// ============================================================================

describe('REQUIRED_SIGNAL_NAMES', () => {
  it('contains exactly the three required signals', () => {
    expect(REQUIRED_SIGNAL_NAMES).toEqual(['casConflictRate', 'dbTimeoutRate', 'clockSkewMs']);
  });

  it('is a readonly tuple (frozen)', () => {
    expect(() => {
      (REQUIRED_SIGNAL_NAMES as any).push('extra');
    }).toThrow();
  });

  it('SignalName type accepts valid signal names', () => {
    // Compile-time check — if this compiles, the type works
    const name1: SignalName = 'casConflictRate';
    const name2: SignalName = 'dbTimeoutRate';
    const name3: SignalName = 'clockSkewMs';
    expect([name1, name2, name3]).toEqual([...REQUIRED_SIGNAL_NAMES]);
  });
});

// ============================================================================
// computeRiskContextHash — Determinism
// ============================================================================

describe('computeRiskContextHash', () => {
  it('same input → same hash', () => {
    const ctx = freshRiskContext();
    const hash1 = computeRiskContextHash(ctx);
    const hash2 = computeRiskContextHash(ctx);
    expect(hash1).toBe(hash2);
  });

  it('different input → different hash', () => {
    const ctx1 = freshRiskContext({ anyStale: false });
    const ctx2 = freshRiskContext({ anyStale: true });
    expect(computeRiskContextHash(ctx1)).not.toBe(computeRiskContextHash(ctx2));
  });

  it('returns 16-char hex string', () => {
    const hash = computeRiskContextHash(freshRiskContext());
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('signal key order does not affect hash (canonical sorting)', () => {
    const signals1 = {
      casConflictRate: {
        name: 'casConflictRate', value: 0.1, status: SignalStatus.FRESH,
        sampleCount: 10, windowParams: DEFAULT_WINDOW_CONFIG, computedAtMs: BASE_MS, lastSampleAtMs: BASE_MS,
      },
      dbTimeoutRate: {
        name: 'dbTimeoutRate', value: 0.2, status: SignalStatus.FRESH,
        sampleCount: 10, windowParams: DEFAULT_WINDOW_CONFIG, computedAtMs: BASE_MS, lastSampleAtMs: BASE_MS,
      },
    };
    // Reverse insertion order
    const signals2 = {
      dbTimeoutRate: signals1.dbTimeoutRate,
      casConflictRate: signals1.casConflictRate,
    };
    const ctx1 = freshRiskContext({ signals: signals1 });
    const ctx2 = freshRiskContext({ signals: signals2 });
    expect(computeRiskContextHash(ctx1)).toBe(computeRiskContextHash(ctx2));
  });

  it('different windowParams → different hash', () => {
    const baseSignal = {
      name: 'casConflictRate', value: 0.1, status: SignalStatus.FRESH,
      sampleCount: 10, computedAtMs: BASE_MS, lastSampleAtMs: BASE_MS,
    };
    const ctx1 = freshRiskContext({
      signals: {
        casConflictRate: { ...baseSignal, windowParams: DEFAULT_WINDOW_CONFIG },
      },
    });
    const altWindowConfig = { ...DEFAULT_WINDOW_CONFIG, windowSizeSeconds: 600 };
    const ctx2 = freshRiskContext({
      signals: {
        casConflictRate: { ...baseSignal, windowParams: altWindowConfig },
      },
    });
    expect(computeRiskContextHash(ctx1)).not.toBe(computeRiskContextHash(ctx2));
  });
});

// ============================================================================
// buildSnapshot — Immutability
// ============================================================================

describe('buildSnapshot', () => {
  it('returns frozen object', () => {
    const snapshot = buildSnapshot(
      GuardDecision.ALLOW,
      null,
      [],
      '1.0.0',
      BASE_MS,
      freshRiskContext(),
      'tenant-1',
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('reasonCodes array is frozen', () => {
    const snapshot = buildSnapshot(
      GuardDecision.HOLD,
      null,
      ['STALE_SIGNAL'],
      '1.0.0',
      BASE_MS,
      freshRiskContext(),
      'tenant-1',
    );
    expect(Object.isFrozen(snapshot.reasonCodes)).toBe(true);
  });

  it('contains all required fields', () => {
    const snapshot = buildSnapshot(
      GuardDecision.DEGRADE,
      'THRESHOLD_BREACH',
      ['CAS_CONFLICT_RATE_EXCEEDED'],
      '2.0.0',
      BASE_MS,
      freshRiskContext(),
      'tenant-X',
    );
    expect(snapshot.decision).toBe(GuardDecision.DEGRADE);
    expect(snapshot.mode).toBe('THRESHOLD_BREACH');
    expect(snapshot.reasonCodes).toEqual(['CAS_CONFLICT_RATE_EXCEEDED']);
    expect(snapshot.policyVersion).toBe('2.0.0');
    expect(snapshot.evaluatedAtMs).toBe(BASE_MS);
    expect(snapshot.riskContextHash).toBeDefined();
    expect(snapshot.tenantId).toBe('tenant-X');
  });

  it('policyVersion reflects config version (stable)', () => {
    const ctx = freshRiskContext();
    const s1 = buildSnapshot(GuardDecision.ALLOW, null, [], '3.1.0', BASE_MS, ctx, 't');
    const s2 = buildSnapshot(GuardDecision.ALLOW, null, [], '3.1.0', BASE_MS, ctx, 't');
    expect(s1.policyVersion).toBe(s2.policyVersion);
    expect(s1.policyVersion).toBe('3.1.0');
  });

  it('evaluatedAtMs is a number (ms), not a string', () => {
    const snapshot = buildSnapshot(
      GuardDecision.ALLOW, null, [], '1.0.0', BASE_MS, freshRiskContext(), 't',
    );
    expect(typeof snapshot.evaluatedAtMs).toBe('number');
  });
});

// ============================================================================
// isDegradeAllowed
// ============================================================================

describe('isDegradeAllowed', () => {
  it('ADMIN is allowed when ADMIN_READ is in allowlist', () => {
    expect(isDegradeAllowed(GuardOperation.ADMIN, [DegradeAllowedOp.ADMIN_READ])).toBe(true);
  });

  it('ADMIN is not allowed when ADMIN_READ is not in allowlist', () => {
    expect(isDegradeAllowed(GuardOperation.ADMIN, [DegradeAllowedOp.HEALTH_CHECK])).toBe(false);
  });

  it('PROMOTE is never allowed in degrade mode', () => {
    const fullAllowlist = [DegradeAllowedOp.ADMIN_READ, DegradeAllowedOp.HEALTH_CHECK, DegradeAllowedOp.METRICS_SCRAPE];
    expect(isDegradeAllowed(GuardOperation.PROMOTE, fullAllowlist)).toBe(false);
  });

  it('EVALUATE is never allowed in degrade mode', () => {
    const fullAllowlist = [DegradeAllowedOp.ADMIN_READ, DegradeAllowedOp.HEALTH_CHECK, DegradeAllowedOp.METRICS_SCRAPE];
    expect(isDegradeAllowed(GuardOperation.EVALUATE, fullAllowlist)).toBe(false);
  });

  it('empty allowlist blocks everything', () => {
    expect(isDegradeAllowed(GuardOperation.ADMIN, [])).toBe(false);
    expect(isDegradeAllowed(GuardOperation.PROMOTE, [])).toBe(false);
  });
});

// ============================================================================
// checkThresholds
// ============================================================================

describe('checkThresholds', () => {
  it('returns empty array when no signals present', () => {
    const breaches = checkThresholds(freshRiskContext(), DEFAULT_GUARD_THRESHOLDS);
    expect(breaches).toHaveLength(0);
  });

  it('detects CAS conflict rate exceeded', () => {
    const ctx = freshRiskContext({
      signals: {
        casConflictRate: {
          name: 'casConflictRate',
          value: 0.8,
          status: SignalStatus.FRESH,
          sampleCount: 10,
          windowParams: DEFAULT_WINDOW_CONFIG,
          computedAtMs: BASE_MS,
          lastSampleAtMs: BASE_MS,
        },
      },
    });
    const breaches = checkThresholds(ctx, DEFAULT_GUARD_THRESHOLDS);
    expect(breaches).toContain('CAS_CONFLICT_RATE_EXCEEDED');
  });

  it('does not flag stale signals as threshold breaches', () => {
    const ctx = freshRiskContext({
      signals: {
        casConflictRate: {
          name: 'casConflictRate',
          value: 999,
          status: SignalStatus.STALE,
          sampleCount: 10,
          windowParams: DEFAULT_WINDOW_CONFIG,
          computedAtMs: BASE_MS,
          lastSampleAtMs: BASE_MS,
        },
      },
    });
    const breaches = checkThresholds(ctx, DEFAULT_GUARD_THRESHOLDS);
    expect(breaches).toHaveLength(0);
  });

  it('detects multiple threshold breaches', () => {
    const ctx = freshRiskContext({
      signals: {
        casConflictRate: {
          name: 'casConflictRate', value: 1.0, status: SignalStatus.FRESH,
          sampleCount: 10, windowParams: DEFAULT_WINDOW_CONFIG, computedAtMs: BASE_MS, lastSampleAtMs: BASE_MS,
        },
        dbTimeoutRate: {
          name: 'dbTimeoutRate', value: 0.5, status: SignalStatus.FRESH,
          sampleCount: 10, windowParams: DEFAULT_WINDOW_CONFIG, computedAtMs: BASE_MS, lastSampleAtMs: BASE_MS,
        },
      },
    });
    const breaches = checkThresholds(ctx, DEFAULT_GUARD_THRESHOLDS);
    expect(breaches).toContain('CAS_CONFLICT_RATE_EXCEEDED');
    expect(breaches).toContain('DB_TIMEOUT_RATE_EXCEEDED');
  });

  it('does not flag values at or below threshold', () => {
    const ctx = freshRiskContext({
      signals: {
        casConflictRate: {
          name: 'casConflictRate', value: 0.5, status: SignalStatus.FRESH,
          sampleCount: 10, windowParams: DEFAULT_WINDOW_CONFIG, computedAtMs: BASE_MS, lastSampleAtMs: BASE_MS,
        },
      },
    });
    const breaches = checkThresholds(ctx, DEFAULT_GUARD_THRESHOLDS);
    expect(breaches).toHaveLength(0);
  });
});

// ============================================================================
// DEFAULT_GUARD_CONFIG sanity
// ============================================================================

describe('DEFAULT_GUARD_CONFIG', () => {
  it('has valid thresholds', () => {
    expect(validateGuardThresholds(DEFAULT_GUARD_CONFIG.globalDefaults)).toHaveLength(0);
  });

  it('has non-empty degrade allowlist', () => {
    expect(DEFAULT_GUARD_CONFIG.globalDegradeAllowlist.length).toBeGreaterThan(0);
  });

  it('has a version string', () => {
    expect(DEFAULT_GUARD_CONFIG.version).toBeTruthy();
  });

  it('has empty tenant overrides by default', () => {
    expect(Object.keys(DEFAULT_GUARD_CONFIG.tenantOverrides)).toHaveLength(0);
  });
});
