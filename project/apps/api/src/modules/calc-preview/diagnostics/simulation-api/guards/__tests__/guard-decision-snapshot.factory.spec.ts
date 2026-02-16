/**
 * GuardDecisionSnapshotFactory — Unit Tests
 *
 * Operational Guard Phase — Task 4.1 / 4.2
 *
 * Test categories:
 * 1. Determinism — same inputs → same snapshot
 * 2. Snapshot immutability — Object.freeze
 * 3. BLOCK_503 path — kill-switch active
 * 4. HOLD path — stale/insufficient/degrade
 * 5. ALLOW path — normal
 * 6. Clock injection — nowMs flows through
 * 7. Provider isolation — factory uses injected providers
 * 8. Mid-flight config change — snapshot unaffected
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — R3
 */

import { GuardDecisionSnapshotFactory } from '../guard-decision-snapshot.factory';
import { FixedClock } from '../guard-clock';
import { StaticGuardConfigProvider } from '../guard-config-provider';
import { InMemoryRiskSignalProvider, type RawSample } from '../risk-signal-provider';
import {
  GuardDecision,
  GuardOperation,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WINDOW_CONFIG,
  type GuardConfig,
} from '../guard-policy-resolver.types';

// ============================================================================
// Helpers
// ============================================================================

const NOW_MS = new Date('2026-02-15T17:00:00.000Z').getTime();

/** Default signal configs for all 3 required signals */
const SIGNAL_CONFIGS = {
  casConflictRate: DEFAULT_WINDOW_CONFIG,
  dbTimeoutRate: DEFAULT_WINDOW_CONFIG,
  clockSkewMs: { ...DEFAULT_WINDOW_CONFIG, aggregation: 'sum' as const },
};

/** Generate fresh samples for a signal within the window */
function freshSamples(name: string, value: number, count: number = 10): RawSample[] {
  const samples: RawSample[] = [];
  for (let i = 0; i < count; i++) {
    samples.push({
      name,
      timestamp: NOW_MS - (count - i) * 5_000, // 5s apart, all within window
      value,
    });
  }
  return samples;
}

/** Build a factory with all signals fresh and below thresholds */
function buildFreshFactory(configOverride?: GuardConfig) {
  const clock = new FixedClock(NOW_MS);
  const config = new StaticGuardConfigProvider(configOverride ?? DEFAULT_GUARD_CONFIG);
  const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);

  signals.addSamples('t1', [
    ...freshSamples('casConflictRate', 0.01),
    ...freshSamples('dbTimeoutRate', 0.01),
    ...freshSamples('clockSkewMs', 10),
  ]);

  const factory = new GuardDecisionSnapshotFactory(config, signals, clock);
  return { factory, clock, config, signals };
}

// ============================================================================
// 1. Determinism
// ============================================================================

describe('Determinism', () => {
  it('same inputs → same snapshot (deepEqual)', () => {
    const { factory } = buildFreshFactory();
    const s1 = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    const s2 = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(s1).toEqual(s2);
  });

  it('same inputs → same riskContextHash', () => {
    const { factory } = buildFreshFactory();
    const s1 = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    const s2 = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(s1.riskContextHash).toBe(s2.riskContextHash);
  });

  it('different tenant → different snapshot (no sample cross-leak)', () => {
    const { factory } = buildFreshFactory();
    const s1 = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    const s2 = factory.createSnapshot('t2', GuardOperation.PROMOTE); // t2 has no samples
    expect(s1.decision).toBe(GuardDecision.ALLOW);
    // t2 has no samples → HOLD (missing signals or insufficient)
    expect(s2.decision).not.toBe(GuardDecision.ALLOW);
  });
});

// ============================================================================
// 2. Snapshot immutability
// ============================================================================

describe('Snapshot immutability', () => {
  it('snapshot is frozen', () => {
    const { factory } = buildFreshFactory();
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('reasonCodes array is frozen', () => {
    const { factory } = buildFreshFactory();
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(Object.isFrozen(snapshot.reasonCodes)).toBe(true);
  });

  it('mutation attempt throws in strict mode', () => {
    const { factory } = buildFreshFactory();
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(() => {
      (snapshot as any).decision = GuardDecision.BLOCK_503;
    }).toThrow();
  });
});

// ============================================================================
// 3. BLOCK_503 path
// ============================================================================

describe('BLOCK_503 path', () => {
  it('kill-switch active → BLOCK_503', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { killSwitchActive: true } },
    };
    const { factory } = buildFreshFactory(config);
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.decision).toBe(GuardDecision.BLOCK_503);
    expect(snapshot.reasonCodes).toContain('KILL_SWITCH_ACTIVE');
  });

  it('BLOCK_503 snapshot has correct metadata', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      version: '4.2.0',
      tenantOverrides: { t1: { killSwitchActive: true } },
    };
    const { factory } = buildFreshFactory(config);
    const snapshot = factory.createSnapshot('t1', GuardOperation.EVALUATE);
    expect(snapshot.policyVersion).toBe('4.2.0');
    expect(snapshot.tenantId).toBe('t1');
    expect(snapshot.evaluatedAtMs).toBe(NOW_MS);
  });
});

// ============================================================================
// 4. HOLD path
// ============================================================================

describe('HOLD path', () => {
  it('no samples → HOLD (insufficient signals)', () => {
    const clock = new FixedClock(NOW_MS);
    const config = new StaticGuardConfigProvider(DEFAULT_GUARD_CONFIG);
    const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
    // No samples added for t1
    const factory = new GuardDecisionSnapshotFactory(config, signals, clock);
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.decision).toBe(GuardDecision.HOLD);
  });

  it('stale samples → HOLD for evaluate', () => {
    const clock = new FixedClock(NOW_MS);
    const config = new StaticGuardConfigProvider(DEFAULT_GUARD_CONFIG);
    const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);

    // Add samples that are old enough to be stale (> 60s staleness threshold)
    const staleSamples = (name: string, value: number): RawSample[] => {
      const samples: RawSample[] = [];
      for (let i = 0; i < 10; i++) {
        samples.push({
          name,
          timestamp: NOW_MS - 120_000 - i * 5_000, // 120s+ ago → stale
          value,
        });
      }
      return samples;
    };

    signals.addSamples('t1', [
      ...staleSamples('casConflictRate', 0.01),
      ...freshSamples('dbTimeoutRate', 0.01),
      ...freshSamples('clockSkewMs', 10),
    ]);

    const factory = new GuardDecisionSnapshotFactory(config, signals, clock);
    const snapshot = factory.createSnapshot('t1', GuardOperation.EVALUATE);
    expect(snapshot.decision).toBe(GuardDecision.HOLD);
    expect(snapshot.mode).toBe('STALE_FAILSAFE');
  });

  it('degrade mode + PROMOTE → HOLD', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { degradeModeActive: true } },
    };
    const { factory } = buildFreshFactory(config);
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.decision).toBe(GuardDecision.HOLD);
    expect(snapshot.mode).toBe('DEGRADE_FORCED_HOLD');
  });
});

// ============================================================================
// 5. ALLOW path
// ============================================================================

describe('ALLOW path', () => {
  it('all signals fresh, below thresholds → ALLOW', () => {
    const { factory } = buildFreshFactory();
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.decision).toBe(GuardDecision.ALLOW);
    expect(snapshot.mode).toBeNull();
    expect(snapshot.reasonCodes).toHaveLength(0);
  });

  it('degrade mode + ADMIN → ALLOW (allowlisted)', () => {
    const config: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { degradeModeActive: true } },
    };
    const { factory } = buildFreshFactory(config);
    const snapshot = factory.createSnapshot('t1', GuardOperation.ADMIN);
    expect(snapshot.decision).toBe(GuardDecision.ALLOW);
    expect(snapshot.mode).toBe('DEGRADE_ALLOWED');
  });
});

// ============================================================================
// 6. Clock injection
// ============================================================================

describe('Clock injection', () => {
  it('evaluatedAtMs reflects injected clock', () => {
    const { factory } = buildFreshFactory();
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.evaluatedAtMs).toBe(NOW_MS);
  });

  it('advancing clock changes evaluatedAtMs', () => {
    const { factory, clock } = buildFreshFactory();
    const s1 = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    clock.advance(5000);
    const s2 = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(s2.evaluatedAtMs).toBe(NOW_MS + 5000);
    expect(s2.evaluatedAtMs).not.toBe(s1.evaluatedAtMs);
  });
});

// ============================================================================
// 7. Provider isolation
// ============================================================================

describe('Provider isolation', () => {
  it('factory uses injected config provider', () => {
    const customConfig: GuardConfig = {
      ...DEFAULT_GUARD_CONFIG,
      version: '99.0.0',
    };
    const { factory } = buildFreshFactory(customConfig);
    const snapshot = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot.policyVersion).toBe('99.0.0');
  });

  it('factory uses injected signal provider (tenant-scoped)', () => {
    const clock = new FixedClock(NOW_MS);
    const config = new StaticGuardConfigProvider(DEFAULT_GUARD_CONFIG);
    const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);

    // Only add samples for t1, not t2
    signals.addSamples('t1', [
      ...freshSamples('casConflictRate', 0.01),
      ...freshSamples('dbTimeoutRate', 0.01),
      ...freshSamples('clockSkewMs', 10),
    ]);

    const factory = new GuardDecisionSnapshotFactory(config, signals, clock);
    expect(factory.createSnapshot('t1', GuardOperation.PROMOTE).decision).toBe(GuardDecision.ALLOW);
    expect(factory.createSnapshot('t2', GuardOperation.PROMOTE).decision).not.toBe(GuardDecision.ALLOW);
  });
});

// ============================================================================
// 8. Mid-flight config change
// ============================================================================

describe('Mid-flight config change', () => {
  it('snapshot is unaffected by config change after creation', () => {
    // Use a mutable config provider to simulate mid-flight change
    let currentConfig = DEFAULT_GUARD_CONFIG;
    const mutableConfigProvider = {
      getConfig: () => currentConfig,
    };

    const clock = new FixedClock(NOW_MS);
    const signals = new InMemoryRiskSignalProvider(SIGNAL_CONFIGS);
    signals.addSamples('t1', [
      ...freshSamples('casConflictRate', 0.01),
      ...freshSamples('dbTimeoutRate', 0.01),
      ...freshSamples('clockSkewMs', 10),
    ]);

    const factory = new GuardDecisionSnapshotFactory(mutableConfigProvider, signals, clock);

    // Create snapshot with normal config
    const snapshot1 = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot1.decision).toBe(GuardDecision.ALLOW);

    // "Mid-flight" config change — enable kill-switch
    currentConfig = {
      ...DEFAULT_GUARD_CONFIG,
      tenantOverrides: { t1: { killSwitchActive: true } },
    };

    // Original snapshot is frozen — unaffected
    expect(snapshot1.decision).toBe(GuardDecision.ALLOW);
    expect(Object.isFrozen(snapshot1)).toBe(true);

    // NEW snapshot reflects new config
    const snapshot2 = factory.createSnapshot('t1', GuardOperation.PROMOTE);
    expect(snapshot2.decision).toBe(GuardDecision.BLOCK_503);
  });
});
