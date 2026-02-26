/**
 * SD-3 D3 Task 1 — ProviderHealthClassifier Tests
 *
 * Dual testing: unit tests (boundary edge cases) + property-based tests (P3).
 *
 * Deliverables:
 *   1. Boundary test matrix (threshold edges)
 *   2. Fail-open behavior (negative/zero input → OK)
 *   3. No label/cardinality impact (this task adds no metrics)
 *
 * @see .kiro/specs/sd-3-adaptive-transition/design.md — B1, P3
 * @see .kiro/specs/sd-3-adaptive-transition/requirements.md — R3
 */

import * as fc from 'fast-check';
import { classifyProviderHealth, ProviderHealthClassifierConfig } from '../adaptive-provider-health-classifier';
import { ProviderHealthZone } from '../adaptive-controller.types';

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_CONFIG: ProviderHealthClassifierConfig = {
  providerDegradedThreshold: 0.05,
  providerOutageThreshold: 0.20,
};

// ============================================================================
// Unit Tests — Boundary Edge Cases
// ============================================================================

describe('ProviderHealthClassifier — Unit Tests', () => {
  describe('boundary values', () => {
    it('errorRate = 0 → OK', () => {
      expect(classifyProviderHealth(0, DEFAULT_CONFIG)).toBe(ProviderHealthZone.OK);
    });

    it('errorRate = -1 (negative) → OK (defensive)', () => {
      expect(classifyProviderHealth(-1, DEFAULT_CONFIG)).toBe(ProviderHealthZone.OK);
    });

    it('errorRate = -Infinity → OK (defensive)', () => {
      expect(classifyProviderHealth(-Infinity, DEFAULT_CONFIG)).toBe(ProviderHealthZone.OK);
    });

    it('errorRate = degradedThreshold (exactly) → OK', () => {
      expect(classifyProviderHealth(0.05, DEFAULT_CONFIG)).toBe(ProviderHealthZone.OK);
    });

    it('errorRate = degradedThreshold + ε → DEGRADED', () => {
      expect(classifyProviderHealth(0.05 + 1e-10, DEFAULT_CONFIG)).toBe(ProviderHealthZone.DEGRADED);
    });

    it('errorRate between thresholds → DEGRADED', () => {
      expect(classifyProviderHealth(0.10, DEFAULT_CONFIG)).toBe(ProviderHealthZone.DEGRADED);
    });

    it('errorRate = outageThreshold (exactly) → DEGRADED', () => {
      expect(classifyProviderHealth(0.20, DEFAULT_CONFIG)).toBe(ProviderHealthZone.DEGRADED);
    });

    it('errorRate = outageThreshold + ε → OUTAGE', () => {
      expect(classifyProviderHealth(0.20 + 1e-10, DEFAULT_CONFIG)).toBe(ProviderHealthZone.OUTAGE);
    });

    it('errorRate = 1.0 (100%) → OUTAGE', () => {
      expect(classifyProviderHealth(1.0, DEFAULT_CONFIG)).toBe(ProviderHealthZone.OUTAGE);
    });

    it('errorRate = Infinity → OUTAGE', () => {
      expect(classifyProviderHealth(Infinity, DEFAULT_CONFIG)).toBe(ProviderHealthZone.OUTAGE);
    });
  });

  describe('equal thresholds (degraded = outage)', () => {
    const equalConfig: ProviderHealthClassifierConfig = {
      providerDegradedThreshold: 0.10,
      providerOutageThreshold: 0.10,
    };

    it('errorRate ≤ threshold → OK', () => {
      expect(classifyProviderHealth(0.10, equalConfig)).toBe(ProviderHealthZone.OK);
    });

    it('errorRate > threshold → OUTAGE (DEGRADED zone is empty)', () => {
      expect(classifyProviderHealth(0.10 + 1e-10, equalConfig)).toBe(ProviderHealthZone.OUTAGE);
    });
  });

  describe('zero thresholds', () => {
    const zeroConfig: ProviderHealthClassifierConfig = {
      providerDegradedThreshold: 0,
      providerOutageThreshold: 0,
    };

    it('errorRate = 0 → OK', () => {
      expect(classifyProviderHealth(0, zeroConfig)).toBe(ProviderHealthZone.OK);
    });

    it('any positive errorRate → OUTAGE', () => {
      expect(classifyProviderHealth(0.001, zeroConfig)).toBe(ProviderHealthZone.OUTAGE);
    });
  });
});


// ============================================================================
// Property-Based Tests — P3: Classifier Determinism & Closed-Set Output
// ============================================================================

describe('Feature: sd-3-adaptive-transition, Property 3: Classifier Determinism', () => {
  /**
   * P3: FOR ALL (errorRate, config) pairs where config invariant holds
   * (degradedThreshold ≤ outageThreshold), classifyProviderHealth returns
   * a ProviderHealthZone enum member. Same input → same output.
   */

  // Arbitrary: valid config where degraded ≤ outage
  const validConfig = fc.record({
    providerDegradedThreshold: fc.double({ min: 0, max: 1, noNaN: true }),
    providerOutageThreshold: fc.double({ min: 0, max: 1, noNaN: true }),
  }).filter(c => c.providerDegradedThreshold <= c.providerOutageThreshold);

  // Arbitrary: error rate including edge cases
  const errorRate = fc.oneof(
    fc.double({ min: -10, max: 10, noNaN: true }),
    fc.constant(0),
    fc.constant(-1),
    fc.constant(Infinity),
    fc.constant(-Infinity),
  );

  it('output is always a ProviderHealthZone enum member (closed-set)', () => {
    const validZones = new Set([
      ProviderHealthZone.OK,
      ProviderHealthZone.DEGRADED,
      ProviderHealthZone.OUTAGE,
    ]);

    fc.assert(
      fc.property(errorRate, validConfig, (rate, config) => {
        const result = classifyProviderHealth(rate, config);
        expect(validZones.has(result)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('deterministic: same input → same output', () => {
    fc.assert(
      fc.property(errorRate, validConfig, (rate, config) => {
        const r1 = classifyProviderHealth(rate, config);
        const r2 = classifyProviderHealth(rate, config);
        expect(r1).toBe(r2);
      }),
      { numRuns: 200 },
    );
  });

  it('negative or zero errorRate → always OK', () => {
    const nonPositiveRate = fc.double({ min: -1e6, max: 0, noNaN: true });

    fc.assert(
      fc.property(nonPositiveRate, validConfig, (rate, config) => {
        expect(classifyProviderHealth(rate, config)).toBe(ProviderHealthZone.OK);
      }),
      { numRuns: 200 },
    );
  });

  it('errorRate ≤ degradedThreshold → OK', () => {
    fc.assert(
      fc.property(validConfig, (config) => {
        // Pick a rate at or below degraded threshold
        const rate = config.providerDegradedThreshold * Math.random();
        expect(classifyProviderHealth(rate, config)).toBe(ProviderHealthZone.OK);
      }),
      { numRuns: 200 },
    );
  });

  it('errorRate > outageThreshold → OUTAGE', () => {
    fc.assert(
      fc.property(validConfig, (config) => {
        const rate = config.providerOutageThreshold + 0.001 + Math.random();
        expect(classifyProviderHealth(rate, config)).toBe(ProviderHealthZone.OUTAGE);
      }),
      { numRuns: 200 },
    );
  });

  it('degradedThreshold < errorRate ≤ outageThreshold → DEGRADED (when thresholds differ)', () => {
    const spreadConfig = validConfig.filter(
      c => c.providerOutageThreshold - c.providerDegradedThreshold > 0.01,
    );

    fc.assert(
      fc.property(spreadConfig, (config) => {
        const gap = config.providerOutageThreshold - config.providerDegradedThreshold;
        const rate = config.providerDegradedThreshold + gap * 0.5;
        expect(classifyProviderHealth(rate, config)).toBe(ProviderHealthZone.DEGRADED);
      }),
      { numRuns: 200 },
    );
  });

  it('monotonicity: higher errorRate never produces a "healthier" zone', () => {
    const zoneOrder = {
      [ProviderHealthZone.OK]: 0,
      [ProviderHealthZone.DEGRADED]: 1,
      [ProviderHealthZone.OUTAGE]: 2,
    };

    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        validConfig,
        (rate1, rate2, config) => {
          const [lo, hi] = rate1 <= rate2 ? [rate1, rate2] : [rate2, rate1];
          const zoneLo = classifyProviderHealth(lo, config);
          const zoneHi = classifyProviderHealth(hi, config);
          expect(zoneOrder[zoneHi]).toBeGreaterThanOrEqual(zoneOrder[zoneLo]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
