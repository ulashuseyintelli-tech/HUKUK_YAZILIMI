/**
 * SignalWindowEngine — Unit Tests
 *
 * Operational Guard Phase — Task 2.2
 *
 * Test categories:
 * 1. Window basic — boundary, sampleCount, inclusive-inclusive
 * 2. Aggregation — sum and rate with deterministic rounding
 * 3. minSamples + missingSamplePolicy — INSUFFICIENT handling
 * 4. Staleness — fresh vs stale detection
 * 5. Edge cases — empty samples, all samples outside window
 * 6. computeRiskContext — anyStale/anyInsufficient flags, timestampMs
 * 7. Determinism — same input → same output
 *
 * All timestamps are ms (number), no ISO strings.
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — R2
 */

import {
  SignalStatus,
  DEFAULT_WINDOW_CONFIG,
  type WindowConfig,
} from '../guard-policy-resolver.types';
import { SignalWindowEngine, type SignalInput } from '../signal-window-engine';

// ============================================================================
// Test Helpers
// ============================================================================

const engine = new SignalWindowEngine();

/** Base time: 2026-02-15T15:05:00.000Z in ms */
const NOW_MS = new Date('2026-02-15T15:05:00.000Z').getTime();

/** Default config: 300s window, 10s sampling, rate aggregation, 5 minSamples, 60s staleness */
const CFG: WindowConfig = { ...DEFAULT_WINDOW_CONFIG };

/** Config with sum aggregation */
const SUM_CFG: WindowConfig = { ...DEFAULT_WINDOW_CONFIG, aggregation: 'sum' };

/**
 * Generate evenly-spaced samples within the window.
 * @param count - Number of samples
 * @param value - Value for each sample
 * @param startOffsetSec - Offset from NOW_MS in seconds (negative = before now)
 * @param intervalSec - Interval between samples in seconds
 */
function makeSamples(
  count: number,
  value: number,
  startOffsetSec: number = -290,
  intervalSec: number = 10,
): Array<{ timestamp: number; value: number }> {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: NOW_MS + (startOffsetSec + i * intervalSec) * 1000,
    value,
  }));
}

// ============================================================================
// 1. Window Basic
// ============================================================================

describe('Window basic', () => {
  it('counts samples within [windowStart, now] inclusive-inclusive', () => {
    const windowStartMs = NOW_MS - 300_000;
    const samples = [
      { timestamp: windowStartMs, value: 1 },
      { timestamp: windowStartMs + 150_000, value: 1 },
      { timestamp: NOW_MS, value: 1 },
    ];
    const signal = engine.computeSignal('test', samples, CFG, NOW_MS);
    expect(signal.sampleCount).toBe(3);
  });

  it('excludes samples before windowStart', () => {
    const windowStartMs = NOW_MS - 300_000;
    const samples = [
      { timestamp: windowStartMs - 1, value: 1 },
      { timestamp: windowStartMs, value: 1 },
      { timestamp: NOW_MS, value: 1 },
    ];
    const signal = engine.computeSignal('test', samples, { ...CFG, minSampleCount: 1 }, NOW_MS);
    expect(signal.sampleCount).toBe(2);
  });

  it('excludes samples after now', () => {
    const samples = [
      { timestamp: NOW_MS, value: 1 },
      { timestamp: NOW_MS + 1, value: 1 },
    ];
    const signal = engine.computeSignal('test', samples, { ...CFG, minSampleCount: 1 }, NOW_MS);
    expect(signal.sampleCount).toBe(1);
  });

  it('returns correct windowParams echo', () => {
    const signal = engine.computeSignal('sig', makeSamples(10, 1), CFG, NOW_MS);
    expect(signal.windowParams).toEqual(CFG);
  });

  it('returns computedAtMs as number (ms)', () => {
    const signal = engine.computeSignal('sig', makeSamples(10, 1), CFG, NOW_MS);
    expect(signal.computedAtMs).toBe(NOW_MS);
    expect(typeof signal.computedAtMs).toBe('number');
  });

  it('returns correct name echo', () => {
    const signal = engine.computeSignal('casConflictRate', makeSamples(10, 1), CFG, NOW_MS);
    expect(signal.name).toBe('casConflictRate');
  });
});

// ============================================================================
// 2. Aggregation
// ============================================================================

describe('Aggregation', () => {
  it('rate: total / windowSizeSeconds with 6-decimal rounding', () => {
    const signal = engine.computeSignal('r', makeSamples(10, 1), CFG, NOW_MS);
    expect(signal.value).toBe(Math.round((10 / 300) * 1e6) / 1e6);
    expect(signal.value).toBe(0.033333);
  });

  it('sum: total with 6-decimal rounding', () => {
    const signal = engine.computeSignal('s', makeSamples(10, 1.5), SUM_CFG, NOW_MS);
    expect(signal.value).toBe(15);
  });

  it('rate with fractional values', () => {
    const signal = engine.computeSignal('r', makeSamples(7, 0.3), CFG, NOW_MS);
    expect(signal.value).toBe(Math.round((7 * 0.3 / 300) * 1e6) / 1e6);
  });

  it('sum with fractional values avoids float drift', () => {
    const signal = engine.computeSignal('s', makeSamples(5, 0.1), SUM_CFG, NOW_MS);
    expect(signal.value).toBe(0.5);
  });

  it('single sample rate', () => {
    const samples = [{ timestamp: NOW_MS - 10_000, value: 5 }];
    const signal = engine.computeSignal('r', samples, { ...CFG, minSampleCount: 1 }, NOW_MS);
    expect(signal.value).toBe(Math.round((5 / 300) * 1e6) / 1e6);
  });
});

// ============================================================================
// 3. minSamples + missingSamplePolicy
// ============================================================================

describe('minSamples + missingSamplePolicy', () => {
  it('below minSamples → INSUFFICIENT status', () => {
    const signal = engine.computeSignal('sig', makeSamples(3, 1), CFG, NOW_MS);
    expect(signal.status).toBe(SignalStatus.INSUFFICIENT);
    expect(signal.sampleCount).toBe(3);
  });

  it('INSUFFICIENT with policy=stale → value=0', () => {
    const cfg: WindowConfig = { ...CFG, missingSampleStrategy: 'stale' };
    const signal = engine.computeSignal('sig', makeSamples(2, 5), cfg, NOW_MS);
    expect(signal.status).toBe(SignalStatus.INSUFFICIENT);
    expect(signal.value).toBe(0);
  });

  it('INSUFFICIENT with policy=zero → value=0', () => {
    const cfg: WindowConfig = { ...CFG, missingSampleStrategy: 'zero' };
    const signal = engine.computeSignal('sig', makeSamples(2, 5), cfg, NOW_MS);
    expect(signal.status).toBe(SignalStatus.INSUFFICIENT);
    expect(signal.value).toBe(0);
  });

  it('exactly at minSamples → not INSUFFICIENT', () => {
    const signal = engine.computeSignal('sig', makeSamples(5, 1), CFG, NOW_MS);
    expect(signal.status).not.toBe(SignalStatus.INSUFFICIENT);
  });

  it('INSUFFICIENT preserves lastSampleAtMs when samples exist', () => {
    const samples = makeSamples(2, 1, -10, 5);
    const signal = engine.computeSignal('sig', samples, CFG, NOW_MS);
    expect(signal.status).toBe(SignalStatus.INSUFFICIENT);
    expect(signal.lastSampleAtMs).not.toBeNull();
  });
});

// ============================================================================
// 4. Staleness
// ============================================================================

describe('Staleness', () => {
  it('recent samples → FRESH', () => {
    const samples = makeSamples(10, 1, -100, 10);
    const signal = engine.computeSignal('sig', samples, CFG, NOW_MS);
    expect(signal.status).toBe(SignalStatus.FRESH);
  });

  it('last sample older than stalenessThreshold → STALE', () => {
    const samples = makeSamples(10, 1, -290, 10);
    const signal = engine.computeSignal('sig', samples, CFG, NOW_MS);
    expect(signal.status).toBe(SignalStatus.STALE);
  });

  it('last sample exactly at staleness boundary → FRESH (not stale)', () => {
    const samples = [
      ...makeSamples(4, 1, -290, 10),
      { timestamp: NOW_MS - 60_000, value: 1 },
    ];
    const signal = engine.computeSignal('sig', samples, CFG, NOW_MS);
    expect(signal.status).toBe(SignalStatus.FRESH);
  });

  it('STALE signal still computes value (not zero)', () => {
    const samples = makeSamples(10, 2, -290, 10);
    const signal = engine.computeSignal('sig', samples, CFG, NOW_MS);
    expect(signal.status).toBe(SignalStatus.STALE);
    expect(signal.value).toBeGreaterThan(0);
  });

  it('lastSampleAtMs reflects the most recent sample timestamp', () => {
    const latestTs = NOW_MS - 5_000;
    const samples = [
      { timestamp: NOW_MS - 100_000, value: 1 },
      { timestamp: NOW_MS - 50_000, value: 1 },
      { timestamp: latestTs, value: 1 },
      { timestamp: NOW_MS - 200_000, value: 1 },
      { timestamp: NOW_MS - 150_000, value: 1 },
    ];
    const signal = engine.computeSignal('sig', samples, CFG, NOW_MS);
    expect(signal.lastSampleAtMs).toBe(latestTs);
  });

  it('custom stalenessThreshold respected', () => {
    const cfg: WindowConfig = { ...CFG, stalenessThresholdSeconds: 10 };
    const samples = makeSamples(10, 1, -100, 10);
    const signal = engine.computeSignal('sig', samples, cfg, NOW_MS);
    expect(signal.status).toBe(SignalStatus.FRESH);

    const samples2 = makeSamples(10, 1, -150, 15);
    const signal2 = engine.computeSignal('sig', samples2, cfg, NOW_MS);
    expect(signal2.status).toBe(SignalStatus.STALE);
  });
});

// ============================================================================
// 5. Edge Cases
// ============================================================================

describe('Edge cases', () => {
  it('empty sample array → INSUFFICIENT', () => {
    const signal = engine.computeSignal('sig', [], CFG, NOW_MS);
    expect(signal.status).toBe(SignalStatus.INSUFFICIENT);
    expect(signal.sampleCount).toBe(0);
    expect(signal.value).toBe(0);
    expect(signal.lastSampleAtMs).toBeNull();
  });

  it('all samples outside window (before) → INSUFFICIENT', () => {
    const samples = makeSamples(10, 1, -500, 10);
    const signal = engine.computeSignal('sig', samples, CFG, NOW_MS);
    expect(signal.status).toBe(SignalStatus.INSUFFICIENT);
    expect(signal.sampleCount).toBe(0);
    expect(signal.lastSampleAtMs).toBeNull();
  });

  it('all samples outside window (after now) → INSUFFICIENT', () => {
    const samples = makeSamples(10, 1, 10, 10);
    const signal = engine.computeSignal('sig', samples, CFG, NOW_MS);
    expect(signal.status).toBe(SignalStatus.INSUFFICIENT);
    expect(signal.sampleCount).toBe(0);
  });

  it('minSampleCount=1 with single sample works', () => {
    const cfg: WindowConfig = { ...CFG, minSampleCount: 1 };
    const samples = [{ timestamp: NOW_MS - 10_000, value: 42 }];
    const signal = engine.computeSignal('sig', samples, cfg, NOW_MS);
    expect(signal.status).toBe(SignalStatus.FRESH);
    expect(signal.sampleCount).toBe(1);
  });

  it('zero-value samples are valid', () => {
    const signal = engine.computeSignal('sig', makeSamples(10, 0), CFG, NOW_MS);
    expect(signal.status).not.toBe(SignalStatus.INSUFFICIENT);
    expect(signal.value).toBe(0);
  });
});

// ============================================================================
// 6. computeRiskContext
// ============================================================================

describe('computeRiskContext', () => {
  it('produces signals map keyed by name', () => {
    const inputs: SignalInput[] = [
      { name: 'casConflictRate', samples: makeSamples(10, 1), config: CFG },
      { name: 'dbTimeoutRate', samples: makeSamples(10, 2), config: CFG },
    ];
    const ctx = engine.computeRiskContext(inputs, NOW_MS);
    expect(Object.keys(ctx.signals)).toEqual(['casConflictRate', 'dbTimeoutRate']);
    expect(ctx.signals['casConflictRate']!.name).toBe('casConflictRate');
    expect(ctx.signals['dbTimeoutRate']!.name).toBe('dbTimeoutRate');
  });

  it('anyStale=true when at least one signal is stale', () => {
    const inputs: SignalInput[] = [
      { name: 'fresh', samples: makeSamples(10, 1, -50, 5), config: CFG },
      { name: 'stale', samples: makeSamples(10, 1, -290, 10), config: CFG },
    ];
    const ctx = engine.computeRiskContext(inputs, NOW_MS);
    expect(ctx.anyStale).toBe(true);
    expect(ctx.signals['fresh']!.status).toBe(SignalStatus.FRESH);
    expect(ctx.signals['stale']!.status).toBe(SignalStatus.STALE);
  });

  it('anyInsufficient=true when at least one signal is insufficient', () => {
    const inputs: SignalInput[] = [
      { name: 'ok', samples: makeSamples(10, 1), config: CFG },
      { name: 'low', samples: makeSamples(2, 1), config: CFG },
    ];
    const ctx = engine.computeRiskContext(inputs, NOW_MS);
    expect(ctx.anyInsufficient).toBe(true);
  });

  it('anyStale=false and anyInsufficient=false when all fresh', () => {
    const inputs: SignalInput[] = [
      { name: 'a', samples: makeSamples(10, 1, -50, 5), config: CFG },
      { name: 'b', samples: makeSamples(10, 2, -50, 5), config: CFG },
    ];
    const ctx = engine.computeRiskContext(inputs, NOW_MS);
    expect(ctx.anyStale).toBe(false);
    expect(ctx.anyInsufficient).toBe(false);
  });

  it('empty signalInputs → empty signals, no stale, no insufficient', () => {
    const ctx = engine.computeRiskContext([], NOW_MS);
    expect(Object.keys(ctx.signals)).toHaveLength(0);
    expect(ctx.anyStale).toBe(false);
    expect(ctx.anyInsufficient).toBe(false);
  });

  it('timestampMs reflects nowMs as number', () => {
    const ctx = engine.computeRiskContext([], NOW_MS);
    expect(ctx.timestampMs).toBe(NOW_MS);
    expect(typeof ctx.timestampMs).toBe('number');
  });

  it('both stale and insufficient can be true simultaneously', () => {
    const inputs: SignalInput[] = [
      { name: 'stale', samples: makeSamples(10, 1, -290, 10), config: CFG },
      { name: 'insufficient', samples: makeSamples(2, 1), config: CFG },
    ];
    const ctx = engine.computeRiskContext(inputs, NOW_MS);
    expect(ctx.anyStale).toBe(true);
    expect(ctx.anyInsufficient).toBe(true);
  });
});

// ============================================================================
// 7. Determinism
// ============================================================================

describe('Determinism', () => {
  it('same samples + config + nowMs → identical output (deepEqual)', () => {
    const samples = makeSamples(15, 1.5, -200, 10);
    const result1 = engine.computeSignal('det', samples, CFG, NOW_MS);
    const result2 = engine.computeSignal('det', samples, CFG, NOW_MS);
    expect(result1).toEqual(result2);
  });

  it('computeRiskContext determinism', () => {
    const inputs: SignalInput[] = [
      { name: 'a', samples: makeSamples(10, 1, -50, 5), config: CFG },
      { name: 'b', samples: makeSamples(8, 0.5, -100, 10), config: SUM_CFG },
    ];
    const ctx1 = engine.computeRiskContext(inputs, NOW_MS);
    const ctx2 = engine.computeRiskContext(inputs, NOW_MS);
    expect(ctx1).toEqual(ctx2);
  });

  it('different nowMs → different computedAtMs', () => {
    const samples = makeSamples(10, 1, -50, 5);
    const r1 = engine.computeSignal('sig', samples, CFG, NOW_MS);
    const r2 = engine.computeSignal('sig', samples, CFG, NOW_MS + 1000);
    expect(r1.computedAtMs).not.toBe(r2.computedAtMs);
  });

  it('sample order does not affect result', () => {
    const samples = [
      { timestamp: NOW_MS - 50_000, value: 3 },
      { timestamp: NOW_MS - 10_000, value: 1 },
      { timestamp: NOW_MS - 30_000, value: 2 },
      { timestamp: NOW_MS - 40_000, value: 4 },
      { timestamp: NOW_MS - 20_000, value: 5 },
    ];
    const reversed = [...samples].reverse();
    const r1 = engine.computeSignal('sig', samples, CFG, NOW_MS);
    const r2 = engine.computeSignal('sig', reversed, CFG, NOW_MS);
    expect(r1).toEqual(r2);
  });
});
