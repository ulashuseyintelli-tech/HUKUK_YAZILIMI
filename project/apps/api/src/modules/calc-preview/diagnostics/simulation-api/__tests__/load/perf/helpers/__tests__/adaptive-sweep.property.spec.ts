/**
 * Property 6: Adaptive Sweep State Machine
 * Property 7: Sustainable RPS Tanım Tutarlılığı
 *
 * Performance Characterization — Task 7.2, 7.3 (CORE)
 *
 * P6: Normal fazda ×1.5 + breakpoint sonrası +%10 × 3 invariant'ı.
 * P7: sustainableRPS'te tüm koşullar sağlanır + bir sonraki adımda en az biri ihlal edilir.
 *
 * **Validates: Requirements 6.2, 6.3, 6.4, 6.6**
 *
 * @see .kiro/specs/perf-characterization/design.md — Property 6, 7
 */

import * as fc from 'fast-check';
import {
  AdaptiveSweep,
  SweepStep,
  SweepConfig,
  DEFAULT_SWEEP_CONFIG,
  SUSTAINABLE_THRESHOLDS,
} from '../adaptive-sweep';

jest.setTimeout(120_000);

// ============================================================================
// Helpers — SweepStep üreteci
// ============================================================================

/** Minimal geçerli SweepStep üreteci */
function makeSweepStep(overrides: Partial<SweepStep> & { rps: number }): SweepStep {
  return {
    rps: overrides.rps,
    latency: overrides.latency ?? { p50: 10, p95: 50, p99: 100, max: 200, count: 100, mean: 30 },
    eventLoop: overrides.eventLoop ?? { p50Ms: 1, p95Ms: 5, p99Ms: 10, maxMs: 20 },
    cpu: overrides.cpu ?? { userPercent: 20, systemPercent: 5, totalPercent: 25 },
    memory: overrides.memory ?? { rssKB: 100000, heapUsedMB: 50, heapTotalMB: 100, externalMB: 5 },
    dbPool: overrides.dbPool ?? {
      activeConnections: 3,
      poolLimit: 10,
      utilizationPercent: 30,
      isQueueing: false,
      dbWaitP99Ms: 5,
    },
    splitTimers: overrides.splitTimers ?? {
      request_duration_ms: { p50: 10, p95: 50, p99: 100, max: 200, count: 100, mean: 30 },
      phase7_snapshot_fetch_ms: { p50: 0, p95: 0, p99: 0, max: 0, count: 0, mean: 0 },
      phase7_drift_calc_ms: { p50: 0, p95: 0, p99: 0, max: 0, count: 0, mean: 0 },
      phase7_audit_write_ms: { p50: 0, p95: 0, p99: 0, max: 0, count: 0, mean: 0 },
      phase7_metrics_emit_ms: { p50: 0, p95: 0, p99: 0, max: 0, count: 0, mean: 0 },
    },
    errorRate: overrides.errorRate ?? 0,
    isBreakpoint: overrides.isBreakpoint ?? false,
    breakpointReason: overrides.breakpointReason,
  };
}

/**
 * Geçerli bir sweep step dizisi üret:
 * - Normal faz: baseRPS × 1.5^i
 * - breakpointAt index'inde breakpoint tetiklenir
 * - Sonra narrowPoints adet +%10 artışlı step
 */
function buildValidSweepSteps(
  config: SweepConfig,
  normalStepCount: number,
  breakpointAt: number | null,
): SweepStep[] {
  const steps: SweepStep[] = [];
  let rps = config.baseRPS;

  // Normal faz
  const normalEnd = breakpointAt !== null ? breakpointAt : normalStepCount;
  for (let i = 0; i < normalEnd; i++) {
    steps.push(makeSweepStep({ rps }));
    rps = rps * config.normalMultiplier;
  }

  if (breakpointAt !== null && breakpointAt <= normalStepCount) {
    // Breakpoint step
    const bpStep = makeSweepStep({
      rps,
      isBreakpoint: true,
      breakpointReason: 'test_trigger',
      latency: { p50: 50, p95: 200, p99: 500, max: 800, count: 100, mean: 150 },
    });
    steps.push(bpStep);

    // Narrow faz: narrowBaseRPS = son normal step'in RPS'i
    const narrowBaseRPS = steps.length >= 2 ? steps[steps.length - 2].rps : config.baseRPS;
    for (let n = 1; n <= config.narrowPoints; n++) {
      const narrowRPS = narrowBaseRPS * (1 + config.narrowIncrement * n);
      steps.push(makeSweepStep({ rps: narrowRPS }));
    }
  }

  return steps;
}

// ============================================================================
// Property 6: Sweep State Machine
// ============================================================================

describe('Feature: perf-characterization, Property 6: Adaptive Sweep State Machine', () => {
  const config = DEFAULT_SWEEP_CONFIG;

  it('normal faz: her adımın RPS\'i bir öncekinin ×1.5\'i', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        (normalSteps) => {
          const steps = buildValidSweepSteps(config, normalSteps, null);
          const result = AdaptiveSweep.validateStateMachine(steps, config);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('breakpoint sonrası +%10 × 3 bracketing noktası', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        (breakpointAt) => {
          const steps = buildValidSweepSteps(config, breakpointAt + 2, breakpointAt);
          const result = AdaptiveSweep.validateStateMachine(steps, config);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('breakpoint varsa ama yetersiz bracketing → invalid', () => {
    // Breakpoint var ama sadece 1 narrow step (3 gerekli)
    const steps = buildValidSweepSteps(config, 3, 2);
    // Son 2 narrow step'i sil → yetersiz bracketing
    steps.splice(-2);
    const result = AdaptiveSweep.validateStateMachine(steps, config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Bracketing');
  });

  it('boş step dizisi → valid', () => {
    const result = AdaptiveSweep.validateStateMachine([], config);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// Property 7: Sustainable RPS Tanım Tutarlılığı
// ============================================================================

describe('Feature: perf-characterization, Property 7: Sustainable RPS Tanım Tutarlılığı', () => {
  it('sustainableRPS\'te tüm koşullar sağlanır', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            rps: fc.integer({ min: 1, max: 200 }),
            p95: fc.double({ min: 10, max: 400, noNaN: true }),
            p99: fc.double({ min: 10, max: 600, noNaN: true }),
            errorRate: fc.double({ min: 0, max: 0.1, noNaN: true }),
            elP99: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (rawSteps) => {
          const steps: SweepStep[] = rawSteps.map((r) =>
            makeSweepStep({
              rps: r.rps,
              latency: { p50: 5, p95: r.p95, p99: r.p99, max: r.p99 * 1.5, count: 100, mean: 20 },
              eventLoop: { p50Ms: 1, p95Ms: 5, p99Ms: r.elP99, maxMs: r.elP99 * 2 },
              errorRate: r.errorRate,
            }),
          );

          const sustainableRPS = AdaptiveSweep.computeSustainableRPS(steps);

          if (sustainableRPS > 0) {
            // sustainableRPS'teki en az bir step tüm koşulları sağlamalı
            const sustainableSteps = steps.filter(
              (s) => s.rps === sustainableRPS && AdaptiveSweep.isSustainable(s),
            );
            expect(sustainableSteps.length).toBeGreaterThanOrEqual(1);
          }

          // sustainableRPS'ten yüksek RPS'li sustainable step olmamalı
          for (const step of steps) {
            if (step.rps > sustainableRPS && AdaptiveSweep.isSustainable(step)) {
              // computeSustainableRPS max'ı döner — bu olamaz
              expect(step.rps).toBeLessThanOrEqual(sustainableRPS);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('hiçbir step sustainable değilse → sustainableRPS = 0', () => {
    const steps: SweepStep[] = [
      makeSweepStep({
        rps: 10,
        latency: { p50: 100, p95: 200, p99: 400, max: 600, count: 100, mean: 150 },
        errorRate: 0.01,
      }),
    ];
    expect(AdaptiveSweep.computeSustainableRPS(steps)).toBe(0);
  });
});
