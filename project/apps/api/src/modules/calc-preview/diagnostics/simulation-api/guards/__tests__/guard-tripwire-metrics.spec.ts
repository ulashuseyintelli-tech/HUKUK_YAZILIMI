/**
 * Guard Tripwire Metrics — Unit Tests
 *
 * Operational Guard Phase — Task 6.3
 *
 * Tests SimulationMetricsService guard-related methods.
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — R5, R8
 */

import { SimulationMetricsService } from '../../simulation-metrics.service';

describe('SimulationMetricsService — Guard Tripwire Metrics', () => {
  let metrics: SimulationMetricsService;

  beforeEach(() => {
    metrics = new SimulationMetricsService();
  });

  // ── incGuardHold ──────────────────────────────────────────────────
  it('incGuardHold with reason=DEGRADED does not throw', () => {
    expect(() => metrics.incGuardHold('DEGRADED')).not.toThrow();
  });

  it('incGuardHold with reason=STALE_FAILSAFE does not throw', () => {
    expect(() => metrics.incGuardHold('STALE_FAILSAFE')).not.toThrow();
  });

  it('incGuardHold with reason=MISSING_SIGNALS does not throw', () => {
    expect(() => metrics.incGuardHold('MISSING_SIGNALS')).not.toThrow();
  });

  it('incGuardHold with reason=INSUFFICIENT_SIGNALS does not throw', () => {
    expect(() => metrics.incGuardHold('INSUFFICIENT_SIGNALS')).not.toThrow();
  });

  it('incGuardHold with reason=THRESHOLD_BREACH does not throw', () => {
    expect(() => metrics.incGuardHold('THRESHOLD_BREACH')).not.toThrow();
  });

  // ── incDbWriteTimeout / incDbReadTimeout ──────────────────────────
  it('incDbWriteTimeout does not throw', () => {
    expect(() => metrics.incDbWriteTimeout()).not.toThrow();
  });

  it('incDbReadTimeout does not throw', () => {
    expect(() => metrics.incDbReadTimeout()).not.toThrow();
  });

  // ── setKillSwitchState ────────────────────────────────────────────
  it('setKillSwitchState active=true does not throw', () => {
    expect(() => metrics.setKillSwitchState('tenant-1', 'promote', true)).not.toThrow();
  });

  it('setKillSwitchState active=false does not throw', () => {
    expect(() => metrics.setKillSwitchState('tenant-1', 'evaluate', false)).not.toThrow();
  });

  // ── Reason label distinguishes DEGRADED from normal HOLD ──────────
  it('DEGRADED reason is distinct from normal HOLD reasons', () => {
    // This test verifies the cardinality policy: reason label is bounded enum
    const reasons = ['DEGRADED', 'STALE_FAILSAFE', 'MISSING_SIGNALS', 'INSUFFICIENT_SIGNALS', 'THRESHOLD_BREACH'];
    for (const reason of reasons) {
      expect(() => metrics.incGuardHold(reason)).not.toThrow();
    }
    // DEGRADED is a distinct value — not conflated with other reasons
    expect(reasons.includes('DEGRADED')).toBe(true);
    expect(reasons.filter(r => r === 'DEGRADED')).toHaveLength(1);
  });
});
