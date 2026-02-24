/**
 * T-B1: EWMA Hesap Doğruluğu — Golden Tests
 *
 * Deterministic: aynı input → aynı EWMA (seed yok, randomness yok).
 *
 * DoD:
 * - Sabit seri → EWMA sabite yaklaşmalı (toleransla)
 * - Step change → EWMA beklenen hızda takip etmeli (α=0.1)
 * - Outlier → etkisi deterministic olmalı
 *
 * @see .kiro/specs/stage-1-runtime-baseline/baseline-plan.md — §2
 */

import {
  computeEwma,
  DEFAULT_ALPHA,
  type EwmaResult,
} from '../baseline-math';

describe('T-B1: EWMA Golden Tests', () => {
  // ========================================================================
  // Sabit Seri → EWMA Sabite Yaklaşmalı
  // ========================================================================

  describe('Constant series convergence', () => {
    it('should converge to constant value for uniform series', () => {
      const values = Array.from({ length: 100 }, () => 0.5);
      const result = computeEwma(values);
      expect(result.value).toBeCloseTo(0.5, 6);
    });

    it('should have near-zero sigma for constant series', () => {
      const values = Array.from({ length: 100 }, () => 0.5);
      const result = computeEwma(values);
      // σ should be ~0 since all values are identical
      expect(result.sigma).toBeCloseTo(0, 4);
    });

    it('should converge to constant regardless of alpha', () => {
      const values = Array.from({ length: 200 }, () => 1.0);
      const r01 = computeEwma(values, 0.1);
      const r05 = computeEwma(values, 0.5);
      const r09 = computeEwma(values, 0.9);
      expect(r01.value).toBeCloseTo(1.0, 6);
      expect(r05.value).toBeCloseTo(1.0, 6);
      expect(r09.value).toBeCloseTo(1.0, 6);
    });

    it('should return exact value for single-element series', () => {
      const result = computeEwma([42]);
      expect(result.value).toBe(42);
      expect(result.sigma).toBe(0);
      expect(result.sampleCount).toBe(1);
    });

    it('should return zero for empty series', () => {
      const result = computeEwma([]);
      expect(result.value).toBe(0);
      expect(result.sigma).toBe(0);
      expect(result.sampleCount).toBe(0);
    });
  });

  // ========================================================================
  // Step Change → EWMA Beklenen Hızda Takip Etmeli
  // ========================================================================

  describe('Step change tracking', () => {
    it('should track step change from 0 to 1 with α=0.1', () => {
      // 50 samples at 0, then 50 samples at 1
      const values = [
        ...Array.from({ length: 50 }, () => 0),
        ...Array.from({ length: 50 }, () => 1),
      ];
      const result = computeEwma(values, 0.1);

      // After 50 steps at new level with α=0.1:
      // EWMA approaches 1 - (1-α)^50 ≈ 1 - 0.9^50 ≈ 1 - 0.00515 ≈ 0.9948
      expect(result.value).toBeGreaterThan(0.99);
      expect(result.value).toBeLessThan(1.0);
    });

    it('should track step change faster with higher alpha', () => {
      const values = [
        ...Array.from({ length: 20 }, () => 0),
        ...Array.from({ length: 20 }, () => 1),
      ];
      const slow = computeEwma(values, 0.1);
      const fast = computeEwma(values, 0.5);

      // Higher α → faster convergence to new level
      expect(fast.value).toBeGreaterThan(slow.value);
    });

    it('should track step change from 1 to 0 symmetrically', () => {
      const up = [
        ...Array.from({ length: 50 }, () => 0),
        ...Array.from({ length: 50 }, () => 1),
      ];
      const down = [
        ...Array.from({ length: 50 }, () => 1),
        ...Array.from({ length: 50 }, () => 0),
      ];
      const upResult = computeEwma(up, 0.1);
      const downResult = computeEwma(down, 0.1);

      // Symmetry: distance from target should be similar
      const upDistance = Math.abs(1 - upResult.value);
      const downDistance = Math.abs(0 - downResult.value);
      expect(upDistance).toBeCloseTo(downDistance, 4);
    });

    it('after N steps at new level, EWMA = target × (1 - (1-α)^N) + old × (1-α)^N', () => {
      const alpha = 0.1;
      const oldLevel = 2.0;
      const newLevel = 5.0;
      const stepsAtNew = 30;

      const values = [
        ...Array.from({ length: 50 }, () => oldLevel),
        ...Array.from({ length: stepsAtNew }, () => newLevel),
      ];
      const result = computeEwma(values, alpha);

      // After 50 steps at oldLevel, EWMA ≈ oldLevel
      // After 30 more steps at newLevel:
      // EWMA ≈ newLevel × (1 - (1-α)^30) + oldLevel × (1-α)^30
      const decay = Math.pow(1 - alpha, stepsAtNew);
      const expected = newLevel * (1 - decay) + oldLevel * decay;
      expect(result.value).toBeCloseTo(expected, 2);
    });
  });

  // ========================================================================
  // Outlier → Etkisi Deterministic
  // ========================================================================

  describe('Outlier impact', () => {
    it('single outlier should have bounded impact with α=0.1', () => {
      const values = [
        ...Array.from({ length: 50 }, () => 1.0),
        100.0, // outlier
        ...Array.from({ length: 50 }, () => 1.0),
      ];
      const result = computeEwma(values, 0.1);

      // After outlier at position 50, EWMA jumps to:
      // 0.1 * 100 + 0.9 * 1.0 = 10.9
      // Then decays back: after 50 more steps at 1.0
      // EWMA ≈ 1.0 + (10.9 - 1.0) × 0.9^50 ≈ 1.0 + 9.9 × 0.00515 ≈ 1.051
      expect(result.value).toBeGreaterThan(1.0);
      expect(result.value).toBeLessThan(1.1);
    });

    it('outlier impact should be deterministic (same input → same output)', () => {
      const values = [1, 1, 1, 100, 1, 1, 1];
      const r1 = computeEwma(values, 0.1);
      const r2 = computeEwma(values, 0.1);
      expect(r1.value).toBe(r2.value);
      expect(r1.sigma).toBe(r2.sigma);
    });

    it('outlier should increase sigma', () => {
      const clean = Array.from({ length: 50 }, () => 1.0);
      const withOutlier = [...Array.from({ length: 49 }, () => 1.0), 100.0];

      const cleanResult = computeEwma(clean, 0.1);
      const outlierResult = computeEwma(withOutlier, 0.1);

      expect(outlierResult.sigma).toBeGreaterThan(cleanResult.sigma);
    });

    it('multiple outliers should have cumulative but bounded impact', () => {
      const values = [
        ...Array.from({ length: 20 }, () => 1.0),
        50.0,
        ...Array.from({ length: 20 }, () => 1.0),
        50.0,
        ...Array.from({ length: 20 }, () => 1.0),
      ];
      const result = computeEwma(values, 0.1);

      // Should still be close to 1.0 after recovery
      expect(result.value).toBeGreaterThan(1.0);
      expect(result.value).toBeLessThan(2.0);
    });
  });

  // ========================================================================
  // σ Computation Correctness
  // ========================================================================

  describe('Sigma computation', () => {
    it('should compute non-zero sigma for varying series', () => {
      const values = [1, 2, 3, 4, 5, 4, 3, 2, 1];
      const result = computeEwma(values, 0.1);
      expect(result.sigma).toBeGreaterThan(0);
    });

    it('sigma should increase with more variance', () => {
      const lowVar = [1.0, 1.1, 0.9, 1.0, 1.1, 0.9];
      const highVar = [1.0, 5.0, 0.1, 4.0, 0.2, 3.0];

      const lowResult = computeEwma(lowVar, 0.1);
      const highResult = computeEwma(highVar, 0.1);

      expect(highResult.sigma).toBeGreaterThan(lowResult.sigma);
    });

    it('should track sample count correctly', () => {
      const values = [1, 2, 3, 4, 5];
      const result = computeEwma(values, 0.1);
      expect(result.sampleCount).toBe(5);
    });
  });

  // ========================================================================
  // Alpha Parameter Sensitivity
  // ========================================================================

  describe('Alpha parameter sensitivity', () => {
    it('α=1.0 should always equal the last value', () => {
      const values = [1, 2, 3, 4, 5];
      const result = computeEwma(values, 1.0);
      expect(result.value).toBe(5);
    });

    it('lower α should be more stable (less responsive to recent changes)', () => {
      const values = [
        ...Array.from({ length: 50 }, () => 1.0),
        10.0, // sudden jump
      ];
      const slow = computeEwma(values, 0.05);
      const fast = computeEwma(values, 0.5);

      // Fast α should be closer to 10 (more responsive)
      expect(fast.value).toBeGreaterThan(slow.value);
    });

    it('default alpha should be 0.1', () => {
      expect(DEFAULT_ALPHA).toBe(0.1);
    });
  });
});
