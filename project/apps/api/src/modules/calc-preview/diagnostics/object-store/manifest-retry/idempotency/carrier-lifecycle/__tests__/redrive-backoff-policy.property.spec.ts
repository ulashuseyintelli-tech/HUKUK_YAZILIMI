/**
 * Redrive Backoff Policy — Property-Based Tests + Unit Tests
 *
 * Phase 11.4 — Task 4.2, 4.3, 4.4
 *
 * Properties tested:
 *   P1: Backoff Boundedness (INV-11.4.5)
 *       — backoffMs <= maxBackoffMs
 *       — jitterMs <= jitterPct × backoffMs
 *       — nextAllowedAt = now + backoffMs + jitterMs
 *   P6: Policy Determinism
 *       — same inputs → same outputs (fixed rng)
 *   P7: Monotonic Next Allowed (INV-11.4.2)
 *       — increasing redriveCount → non-decreasing backoffMs (jitter=0)
 *
 * Additional PBT:
 *   P-input: Negative/NaN redriveCount → clamped to 0 (defensive)
 *
 * Unit tests:
 *   - redriveCount=0 → backoff = baseMs
 *   - redriveCount=capExponent → backoff capped at formula
 *   - redriveCount > capExponent → k stays at cap
 *   - jitter=0 (rng=0) → exact backoff, no jitter
 *   - max_backoff cap active
 *   - Negative redriveCount → treated as 0
 *   - NaN redriveCount → treated as 0
 *
 * @see phase-11-4-redrive-rate-limiting/design.md — Properties 1, 6, 7
 */

import * as fc from 'fast-check';
import {
  computeNextAllowedAt,
  DEFAULT_BACKOFF_CONFIG,
  BackoffPolicyConfig,
} from '../redrive-backoff-policy';

// ============================================================================
// GENERATORS
// ============================================================================

/** Random backoff config within reasonable bounds */
const arbConfig = fc.record({
  baseMs: fc.integer({ min: 1_000, max: 120_000 }),
  capExponent: fc.integer({ min: 1, max: 10 }),
  maxBackoffMs: fc.integer({ min: 60_000, max: 7_200_000 }),
  jitterPct: fc.double({ min: 0, max: 0.5, noNaN: true }),
});

/** Random rng value in [0, 1) */
const arbRng = fc.double({ min: 0, max: 1 - Number.EPSILON, noNaN: true });

/** Random redriveCount 0–100 */
const arbRedriveCount = fc.integer({ min: 0, max: 100 });

/** Fixed "now" for deterministic timestamp math */
const BASE_NOW = new Date('2026-02-07T12:00:00.000Z');

// ============================================================================
// PROPERTY-BASED TESTS
// ============================================================================

describe('Phase 11.4 — Backoff Policy PBT', () => {
  // --------------------------------------------------------------------------
  // Property 1: Backoff Boundedness (INV-11.4.5)
  // --------------------------------------------------------------------------
  describe('Property 1: Backoff Boundedness (INV-11.4.5)', () => {
    it('backoffMs never exceeds maxBackoffMs', () => {
      fc.assert(
        fc.property(
          arbRedriveCount,
          arbConfig,
          arbRng,
          (count, config, rngVal) => {
            const result = computeNextAllowedAt(BASE_NOW, count, config, () => rngVal);
            expect(result.backoffMs).toBeLessThanOrEqual(config.maxBackoffMs);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('jitterMs never exceeds jitterPct × backoffMs', () => {
      fc.assert(
        fc.property(
          arbRedriveCount,
          arbConfig,
          arbRng,
          (count, config, rngVal) => {
            const result = computeNextAllowedAt(BASE_NOW, count, config, () => rngVal);
            const maxJitter = config.jitterPct * result.backoffMs;
            expect(result.jitterMs).toBeLessThanOrEqual(Math.floor(maxJitter) + 1);
            expect(result.jitterMs).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('nextAllowedAt = now + backoffMs + jitterMs', () => {
      fc.assert(
        fc.property(
          arbRedriveCount,
          arbConfig,
          arbRng,
          (count, config, rngVal) => {
            const result = computeNextAllowedAt(BASE_NOW, count, config, () => rngVal);
            const expected = BASE_NOW.getTime() + result.backoffMs + result.jitterMs;
            expect(result.nextAllowedAt.getTime()).toBe(expected);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('k never exceeds capExponent', () => {
      fc.assert(
        fc.property(
          arbRedriveCount,
          arbConfig,
          (count, config) => {
            const result = computeNextAllowedAt(BASE_NOW, count, config, () => 0);
            expect(result.k).toBeLessThanOrEqual(config.capExponent);
            expect(result.k).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // Property 6: Policy Determinism
  // --------------------------------------------------------------------------
  describe('Property 6: Policy Determinism', () => {
    it('same inputs produce identical outputs', () => {
      fc.assert(
        fc.property(
          arbRedriveCount,
          arbConfig,
          arbRng,
          (count, config, rngVal) => {
            const fixedRng = () => rngVal;
            const r1 = computeNextAllowedAt(BASE_NOW, count, config, fixedRng);
            const r2 = computeNextAllowedAt(BASE_NOW, count, config, fixedRng);
            expect(r1.backoffMs).toBe(r2.backoffMs);
            expect(r1.jitterMs).toBe(r2.jitterMs);
            expect(r1.k).toBe(r2.k);
            expect(r1.nextAllowedAt.getTime()).toBe(r2.nextAllowedAt.getTime());
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // Property 7: Monotonic Next Allowed (INV-11.4.2)
  // --------------------------------------------------------------------------
  describe('Property 7: Monotonic Next Allowed (INV-11.4.2)', () => {
    it('backoffMs is non-decreasing as redriveCount increases (jitter=0)', () => {
      fc.assert(
        fc.property(
          arbConfig,
          (config) => {
            const zeroRng = () => 0;
            let prevBackoff = 0;
            for (let count = 0; count <= config.capExponent + 3; count++) {
              const result = computeNextAllowedAt(BASE_NOW, count, config, zeroRng);
              expect(result.backoffMs).toBeGreaterThanOrEqual(prevBackoff);
              prevBackoff = result.backoffMs;
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('nextAllowedAt is always >= now', () => {
      fc.assert(
        fc.property(
          arbRedriveCount,
          arbConfig,
          arbRng,
          (count, config, rngVal) => {
            const result = computeNextAllowedAt(BASE_NOW, count, config, () => rngVal);
            expect(result.nextAllowedAt.getTime()).toBeGreaterThanOrEqual(BASE_NOW.getTime());
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // --------------------------------------------------------------------------
  // P-input: Negative/NaN redriveCount guard
  // --------------------------------------------------------------------------
  describe('Input guard: negative/NaN redriveCount', () => {
    it('negative redriveCount is clamped to 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: -1 }),
          arbConfig,
          (negCount, config) => {
            const result = computeNextAllowedAt(BASE_NOW, negCount, config, () => 0);
            const baseline = computeNextAllowedAt(BASE_NOW, 0, config, () => 0);
            expect(result.backoffMs).toBe(baseline.backoffMs);
            expect(result.k).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('NaN redriveCount is clamped to 0', () => {
      const result = computeNextAllowedAt(BASE_NOW, NaN, DEFAULT_BACKOFF_CONFIG, () => 0);
      const baseline = computeNextAllowedAt(BASE_NOW, 0, DEFAULT_BACKOFF_CONFIG, () => 0);
      expect(result.backoffMs).toBe(baseline.backoffMs);
      expect(result.k).toBe(0);
    });

    it('Infinity redriveCount is clamped to 0', () => {
      const result = computeNextAllowedAt(BASE_NOW, Infinity, DEFAULT_BACKOFF_CONFIG, () => 0);
      const baseline = computeNextAllowedAt(BASE_NOW, 0, DEFAULT_BACKOFF_CONFIG, () => 0);
      expect(result.backoffMs).toBe(baseline.backoffMs);
      expect(result.k).toBe(0);
    });
  });
});


// ============================================================================
// UNIT TESTS
// ============================================================================

describe('Phase 11.4 — Backoff Policy Unit Tests', () => {
  const zeroRng = () => 0;

  it('redriveCount=0 → backoff = baseMs', () => {
    const result = computeNextAllowedAt(BASE_NOW, 0, DEFAULT_BACKOFF_CONFIG, zeroRng);
    expect(result.backoffMs).toBe(DEFAULT_BACKOFF_CONFIG.baseMs); // 30_000
    expect(result.jitterMs).toBe(0);
    expect(result.k).toBe(0);
  });

  it('redriveCount=1 → backoff = baseMs × 2', () => {
    const result = computeNextAllowedAt(BASE_NOW, 1, DEFAULT_BACKOFF_CONFIG, zeroRng);
    expect(result.backoffMs).toBe(60_000); // 30_000 × 2^1
    expect(result.k).toBe(1);
  });

  it('redriveCount=capExponent(7) → backoff capped at maxBackoffMs', () => {
    const result = computeNextAllowedAt(BASE_NOW, 7, DEFAULT_BACKOFF_CONFIG, zeroRng);
    // 30_000 × 2^7 = 3_840_000 > maxBackoffMs(3_600_000) → capped
    expect(result.backoffMs).toBe(DEFAULT_BACKOFF_CONFIG.maxBackoffMs); // 3_600_000
    expect(result.k).toBe(7);
  });

  it('redriveCount > capExponent → k stays at cap', () => {
    const r7 = computeNextAllowedAt(BASE_NOW, 7, DEFAULT_BACKOFF_CONFIG, zeroRng);
    const r10 = computeNextAllowedAt(BASE_NOW, 10, DEFAULT_BACKOFF_CONFIG, zeroRng);
    const r100 = computeNextAllowedAt(BASE_NOW, 100, DEFAULT_BACKOFF_CONFIG, zeroRng);
    expect(r7.backoffMs).toBe(r10.backoffMs);
    expect(r7.backoffMs).toBe(r100.backoffMs);
    expect(r10.k).toBe(7);
    expect(r100.k).toBe(7);
  });

  it('rng=0 → jitterMs = 0 (exact backoff)', () => {
    const result = computeNextAllowedAt(BASE_NOW, 3, DEFAULT_BACKOFF_CONFIG, zeroRng);
    expect(result.jitterMs).toBe(0);
    const expectedBackoff = Math.min(
      DEFAULT_BACKOFF_CONFIG.baseMs * Math.pow(2, 3),
      DEFAULT_BACKOFF_CONFIG.maxBackoffMs,
    );
    expect(result.backoffMs).toBe(expectedBackoff); // 240_000
    expect(result.nextAllowedAt.getTime()).toBe(BASE_NOW.getTime() + expectedBackoff);
  });

  it('rng=0.5 → jitter = floor(0.5 × jitterPct × backoff)', () => {
    const result = computeNextAllowedAt(BASE_NOW, 0, DEFAULT_BACKOFF_CONFIG, () => 0.5);
    const expectedJitter = Math.floor(0.5 * 0.20 * 30_000); // 3000
    expect(result.jitterMs).toBe(expectedJitter);
    expect(result.nextAllowedAt.getTime()).toBe(
      BASE_NOW.getTime() + 30_000 + expectedJitter,
    );
  });

  it('max_backoff cap is active when rawBackoff exceeds it', () => {
    const config: BackoffPolicyConfig = {
      baseMs: 100_000,
      capExponent: 5,
      maxBackoffMs: 200_000,
      jitterPct: 0,
    };
    // 100_000 × 2^5 = 3_200_000 > 200_000 → capped
    const result = computeNextAllowedAt(BASE_NOW, 5, config, zeroRng);
    expect(result.backoffMs).toBe(200_000);
  });

  it('backoff table matches expected values (default config, jitter=0)', () => {
    const expected = [
      { count: 0, backoff: 30_000 },
      { count: 1, backoff: 60_000 },
      { count: 2, backoff: 120_000 },
      { count: 3, backoff: 240_000 },
      { count: 4, backoff: 480_000 },
      { count: 5, backoff: 960_000 },
      { count: 6, backoff: 1_920_000 },
      { count: 7, backoff: 3_600_000 }, // capped
      { count: 8, backoff: 3_600_000 }, // still capped
    ];
    for (const { count, backoff } of expected) {
      const result = computeNextAllowedAt(BASE_NOW, count, DEFAULT_BACKOFF_CONFIG, zeroRng);
      expect(result.backoffMs).toBe(backoff);
    }
  });

  it('fractional redriveCount is floored', () => {
    const r2 = computeNextAllowedAt(BASE_NOW, 2, DEFAULT_BACKOFF_CONFIG, zeroRng);
    const r2_7 = computeNextAllowedAt(BASE_NOW, 2.7, DEFAULT_BACKOFF_CONFIG, zeroRng);
    expect(r2_7.backoffMs).toBe(r2.backoffMs);
    expect(r2_7.k).toBe(r2.k);
  });
});
