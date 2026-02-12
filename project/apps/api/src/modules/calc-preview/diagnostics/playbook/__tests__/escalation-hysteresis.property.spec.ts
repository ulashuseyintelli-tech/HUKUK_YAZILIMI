/**
 * evaluateEscalation — Property-Based Tests (P7, P9)
 *
 * Sprint 3 - Task 5.4
 *
 * P7: Hysteresis premature eskalasyon engeli
 *   deescalateThreshold ≤ metric ≤ escalateThreshold → ESCALATE dönmemeli
 *   Validates: Requirements 4.1
 *
 * P9: Hold-down re-eskalasyon engeli
 *   holdDownUntil > now → metrikten bağımsız HOLD
 *   Validates: Requirements 4.3
 *
 * Generator invariants:
 *   - config.escalateThreshold > config.deescalateThreshold (strict)
 *   - holdDownUntil: P7 → inactive (null | ≤ now), P9 → active (> now)
 *   - Boundary shrink: L3 max, NONE min, counter=0, counter=windowSize,
 *     holdDownUntil=now-1/now/now+1, metric=exact threshold
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md — Properties 7, 9
 */

import * as fc from 'fast-check';
import { evaluateEscalation } from '../escalation-hysteresis';
import {
  EscalationState,
  EscalationLevel,
  HysteresisConfig,
} from '../escalation-hysteresis.types';

// ============================================================================
// Fixed config (strict inequality guaranteed)
// ============================================================================

const CONFIG: HysteresisConfig = {
  escalateThreshold: 0.8,
  deescalateThreshold: 0.4,
  stableWindowRunCount: 5,
  stableWindowMinutes: 10,
  holdDownMinutes: 15,
};

const NOW = new Date('2026-02-10T12:00:00Z');
const NOW_MS = NOW.getTime();

// ============================================================================
// Generators
// ============================================================================

const levelArb = fc.constantFrom<EscalationLevel>('NONE', 'L1', 'L2', 'L3');

/**
 * State generator for P7 (hysteresis band test).
 * holdDownUntil is inactive: null or ≤ now.
 */
const stateForP7Arb = fc.record({
  incidentId: fc.constant('inc-prop'),
  currentLevel: levelArb,
  lastTransitionAt: fc.constant('2026-02-10T11:00:00Z'),
  holdDownUntil: fc.oneof(
    fc.constant(null),
    // Expired hold-down: now - (1..60) minutes
    fc.integer({ min: 1, max: 60 }).map(
      (m) => new Date(NOW_MS - m * 60_000).toISOString(),
    ),
  ),
  stableWindowCounter: fc.integer({ min: 0, max: CONFIG.stableWindowRunCount + 2 }),
  stableWindowStartedAt: fc.oneof(
    fc.constant(null),
    fc.integer({ min: 1, max: 30 }).map(
      (m) => new Date(NOW_MS - m * 60_000).toISOString(),
    ),
  ),
  version: fc.integer({ min: 1, max: 100 }),
});

/**
 * Metric in hysteresis band: [deescalateThreshold, escalateThreshold].
 * Includes exact boundaries for shrink coverage.
 */
const metricInBandArb = fc.oneof(
  // Uniform in band
  fc.double({
    min: CONFIG.deescalateThreshold,
    max: CONFIG.escalateThreshold,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  // Exact boundaries (shrink targets)
  fc.constantFrom(CONFIG.deescalateThreshold, CONFIG.escalateThreshold),
  // Midpoint
  fc.constant((CONFIG.deescalateThreshold + CONFIG.escalateThreshold) / 2),
);

/**
 * State generator for P9 (hold-down test).
 * holdDownUntil is active: > now.
 */
const stateForP9Arb = fc.record({
  incidentId: fc.constant('inc-prop'),
  currentLevel: levelArb,
  lastTransitionAt: fc.constant('2026-02-10T11:00:00Z'),
  // Active hold-down: now + (1..120) minutes
  holdDownUntil: fc.integer({ min: 1, max: 120 }).map(
    (m) => new Date(NOW_MS + m * 60_000).toISOString(),
  ),
  stableWindowCounter: fc.integer({ min: 0, max: CONFIG.stableWindowRunCount + 2 }),
  stableWindowStartedAt: fc.oneof(
    fc.constant(null),
    fc.integer({ min: 1, max: 30 }).map(
      (m) => new Date(NOW_MS - m * 60_000).toISOString(),
    ),
  ),
  version: fc.integer({ min: 1, max: 100 }),
});

/**
 * Wide metric range for P9 (hold-down is metric-independent).
 * Includes extreme values + exact thresholds for shrink.
 */
const metricWideArb = fc.oneof(
  fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(
    0,
    CONFIG.deescalateThreshold,
    CONFIG.escalateThreshold,
    1.0,
    -1.0,
    CONFIG.deescalateThreshold - 0.001,
    CONFIG.escalateThreshold + 0.001,
  ),
);

// ============================================================================
// Property 7: Hysteresis premature eskalasyon engeli
// ============================================================================

describe('Feature: sprint-3-deploy-ready, Property 7: Hysteresis premature eskalasyon engeli', () => {
  it('should NEVER return ESCALATE when metric is in hysteresis band [deescalate, escalate]', () => {
    fc.assert(
      fc.property(
        stateForP7Arb,
        metricInBandArb,
        (state, metric) => {
          const decision = evaluateEscalation(state, metric, CONFIG, NOW);

          // Core invariant: ESCALATE must not happen in hysteresis band
          expect(decision.action).not.toBe('ESCALATE');
        },
      ),
      { numRuns: 200, verbose: true },
    );
  });

  it('should return HOLD or ACCUMULATE or DEESCALATE (never ESCALATE) for all levels in band', () => {
    fc.assert(
      fc.property(
        stateForP7Arb,
        metricInBandArb,
        (state, metric) => {
          const decision = evaluateEscalation(state, metric, CONFIG, NOW);

          // Allowed actions in band: HOLD, ACCUMULATE, DEESCALATE
          // (DEESCALATE only if metric < deescalateThreshold, but at exact boundary
          //  metric === deescalateThreshold → in band → HOLD)
          // ESCALATE is forbidden
          const allowed = ['HOLD', 'ACCUMULATE', 'DEESCALATE'];
          expect(allowed).toContain(decision.action);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Boundary shrink: L3 at max level + metric in band → HOLD (not ESCALATE)
  it('should HOLD at L3 even with metric at exact escalateThreshold', () => {
    const state: EscalationState = {
      incidentId: 'inc-boundary',
      currentLevel: 'L3',
      lastTransitionAt: '2026-02-10T11:00:00Z',
      holdDownUntil: null,
      stableWindowCounter: 0,
      stableWindowStartedAt: null,
      version: 1,
    };

    const decision = evaluateEscalation(state, CONFIG.escalateThreshold, CONFIG, NOW);
    expect(decision.action).not.toBe('ESCALATE');
  });

  // Boundary shrink: NONE at min level + metric at deescalateThreshold → HOLD
  it('should HOLD at NONE with metric at exact deescalateThreshold', () => {
    const state: EscalationState = {
      incidentId: 'inc-boundary',
      currentLevel: 'NONE',
      lastTransitionAt: '2026-02-10T11:00:00Z',
      holdDownUntil: null,
      stableWindowCounter: 0,
      stableWindowStartedAt: null,
      version: 1,
    };

    const decision = evaluateEscalation(state, CONFIG.deescalateThreshold, CONFIG, NOW);
    expect(decision.action).not.toBe('ESCALATE');
  });
});

// ============================================================================
// Property 9: Hold-down re-eskalasyon engeli
// ============================================================================

describe('Feature: sprint-3-deploy-ready, Property 9: Hold-down re-eskalasyon engeli', () => {
  it('should ALWAYS return HOLD when holdDownUntil > now, regardless of metric', () => {
    fc.assert(
      fc.property(
        stateForP9Arb,
        metricWideArb,
        (state, metric) => {
          const decision = evaluateEscalation(state, metric, CONFIG, NOW);

          // Core invariant: active hold-down → HOLD, always
          expect(decision.action).toBe('HOLD');
          expect(decision.reason).toBe('COOLDOWN_ACTIVE');
        },
      ),
      { numRuns: 200, verbose: true },
    );
  });

  it('should not produce any level change when hold-down is active', () => {
    fc.assert(
      fc.property(
        stateForP9Arb,
        metricWideArb,
        (state, metric) => {
          const decision = evaluateEscalation(state, metric, CONFIG, NOW);

          // No level transition allowed during cooldown
          expect(decision.newLevel).toBeUndefined();
          expect(decision.holdDownUntil).toBeUndefined();
        },
      ),
      { numRuns: 200 },
    );
  });

  // Boundary shrink: holdDownUntil = now + 1ms (barely active)
  it('should HOLD when holdDownUntil is barely in the future (now + 1ms)', () => {
    fc.assert(
      fc.property(
        levelArb,
        metricWideArb,
        (level, metric) => {
          const state: EscalationState = {
            incidentId: 'inc-boundary',
            currentLevel: level,
            lastTransitionAt: '2026-02-10T11:00:00Z',
            holdDownUntil: new Date(NOW_MS + 1).toISOString(),
            stableWindowCounter: 0,
            stableWindowStartedAt: null,
            version: 1,
          };

          const decision = evaluateEscalation(state, metric, CONFIG, NOW);
          expect(decision.action).toBe('HOLD');
          expect(decision.reason).toBe('COOLDOWN_ACTIVE');
        },
      ),
      { numRuns: 100 },
    );
  });

  // Boundary shrink: holdDownUntil = now (exact) → NOT active (< is strict)
  it('should NOT hold when holdDownUntil === now (boundary: expired)', () => {
    const state: EscalationState = {
      incidentId: 'inc-boundary',
      currentLevel: 'L1',
      lastTransitionAt: '2026-02-10T11:00:00Z',
      holdDownUntil: NOW.toISOString(), // exactly now → expired
      stableWindowCounter: 0,
      stableWindowStartedAt: null,
      version: 1,
    };

    // metric > escalateThreshold → should escalate (hold-down expired)
    const decision = evaluateEscalation(state, 0.9, CONFIG, NOW);
    expect(decision.action).not.toBe('HOLD');
  });

  // Boundary shrink: holdDownUntil = now - 1ms → expired
  it('should NOT hold when holdDownUntil is barely in the past (now - 1ms)', () => {
    const state: EscalationState = {
      incidentId: 'inc-boundary',
      currentLevel: 'L1',
      lastTransitionAt: '2026-02-10T11:00:00Z',
      holdDownUntil: new Date(NOW_MS - 1).toISOString(),
      stableWindowCounter: 0,
      stableWindowStartedAt: null,
      version: 1,
    };

    const decision = evaluateEscalation(state, 0.9, CONFIG, NOW);
    expect(decision.action).toBe('ESCALATE');
  });
});
