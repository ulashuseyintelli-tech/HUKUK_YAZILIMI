/**
 * T-B5: Tenant Segmentation State Machine Tests
 *
 * DoD:
 * - Global → per-tenant'e ne zaman geçiliyor?
 * - Canary-only segmentte baseline üretiliyor mu, yoksa sadece gözlem mi?
 * - Segmentation state machine testle kilitli.
 * - Outlier detection (> 3σ from global mean) deterministic.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/baseline-plan.md — §4
 */

import {
  determineSegmentationPhase,
  evaluateTenantSegmentation,
  classifyTenantVolume,
  type SegmentationPhase,
  type TenantSegmentationResult,
} from '../baseline-math';

describe('T-B5: Tenant Segmentation State Machine', () => {
  // ========================================================================
  // Phase Determination (State Machine)
  // ========================================================================

  describe('Segmentation phase determination', () => {
    it('shadow + no canary → GLOBAL', () => {
      expect(determineSegmentationPhase('shadow', false)).toBe('GLOBAL');
    });

    it('shadow + canary tenants → PER_TENANT', () => {
      expect(determineSegmentationPhase('shadow', true)).toBe('PER_TENANT');
    });

    it('enforce + canary tenants → CANARY_ONLY', () => {
      expect(determineSegmentationPhase('enforce', true)).toBe('CANARY_ONLY');
    });

    it('enforce + no canary (full rollout) → PER_TENANT', () => {
      expect(determineSegmentationPhase('enforce', false)).toBe('PER_TENANT');
    });
  });

  // ========================================================================
  // Phase Transition Rules
  // ========================================================================

  describe('Phase transition rules', () => {
    it('GLOBAL → PER_TENANT: triggered by canary tenant selection', () => {
      const before = determineSegmentationPhase('shadow', false);
      const after = determineSegmentationPhase('shadow', true);
      expect(before).toBe('GLOBAL');
      expect(after).toBe('PER_TENANT');
    });

    it('PER_TENANT → CANARY_ONLY: triggered by enforce mode activation', () => {
      const before = determineSegmentationPhase('shadow', true);
      const after = determineSegmentationPhase('enforce', true);
      expect(before).toBe('PER_TENANT');
      expect(after).toBe('CANARY_ONLY');
    });

    it('CANARY_ONLY → PER_TENANT: triggered by full enforce (canary removed)', () => {
      const before = determineSegmentationPhase('enforce', true);
      const after = determineSegmentationPhase('enforce', false);
      expect(before).toBe('CANARY_ONLY');
      expect(after).toBe('PER_TENANT');
    });
  });

  // ========================================================================
  // All Valid Phase Values
  // ========================================================================

  describe('Phase exhaustiveness', () => {
    const allPhases: SegmentationPhase[] = ['GLOBAL', 'PER_TENANT', 'CANARY_ONLY'];

    it('all 4 input combinations produce valid phases', () => {
      const combos: Array<[guardMode: 'shadow' | 'enforce', hasCanary: boolean]> = [
        ['shadow', false],
        ['shadow', true],
        ['enforce', false],
        ['enforce', true],
      ];
      for (const [mode, canary] of combos) {
        const phase = determineSegmentationPhase(mode, canary);
        expect(allPhases).toContain(phase);
      }
    });
  });

  // ========================================================================
  // Tenant Evaluation — Outlier Detection
  // ========================================================================

  describe('Tenant outlier detection', () => {
    const globalMean = 0.01; // 1% drift rate
    const globalSigma = 0.002; // σ = 0.2%

    it('tenant within 1σ → not outlier', () => {
      const result = evaluateTenantSegmentation(
        'tenant-A', 0.011, globalMean, globalSigma, 500, 'GLOBAL',
      );
      expect(result.isOutlier).toBe(false);
      expect(result.deviationSigma).toBeLessThanOrEqual(1);
    });

    it('tenant within 3σ → not outlier', () => {
      const result = evaluateTenantSegmentation(
        'tenant-B', 0.015, globalMean, globalSigma, 500, 'GLOBAL',
      );
      // deviation = |0.015 - 0.01| / 0.002 = 2.5σ
      expect(result.isOutlier).toBe(false);
      expect(result.deviationSigma).toBeCloseTo(2.5, 4);
    });

    it('tenant exactly at 3σ → not outlier (> 3σ required)', () => {
      const tenantRate = globalMean + 3 * globalSigma; // 0.016
      const result = evaluateTenantSegmentation(
        'tenant-C', tenantRate, globalMean, globalSigma, 500, 'GLOBAL',
      );
      expect(result.isOutlier).toBe(false);
      expect(result.deviationSigma).toBeCloseTo(3.0, 4);
    });

    it('tenant above 3σ → outlier', () => {
      const tenantRate = globalMean + 3.1 * globalSigma; // 0.0162
      const result = evaluateTenantSegmentation(
        'tenant-D', tenantRate, globalMean, globalSigma, 500, 'GLOBAL',
      );
      expect(result.isOutlier).toBe(true);
      expect(result.deviationSigma).toBeGreaterThan(3);
    });

    it('tenant below mean by > 3σ → also outlier', () => {
      const tenantRate = globalMean - 3.5 * globalSigma; // 0.003
      const result = evaluateTenantSegmentation(
        'tenant-E', tenantRate, globalMean, globalSigma, 500, 'GLOBAL',
      );
      expect(result.isOutlier).toBe(true);
    });

    it('zero sigma: exact match → not outlier', () => {
      const result = evaluateTenantSegmentation(
        'tenant-F', 0.01, 0.01, 0, 500, 'GLOBAL',
      );
      expect(result.isOutlier).toBe(false);
      expect(result.deviationSigma).toBe(0);
    });

    it('zero sigma: any deviation → outlier (Infinity σ)', () => {
      const result = evaluateTenantSegmentation(
        'tenant-G', 0.011, 0.01, 0, 500, 'GLOBAL',
      );
      expect(result.isOutlier).toBe(true);
      expect(result.deviationSigma).toBe(Infinity);
    });
  });

  // ========================================================================
  // Volume Classification in Segmentation
  // ========================================================================

  describe('Volume classification in segmentation result', () => {
    it('high-volume tenant classified correctly', () => {
      const result = evaluateTenantSegmentation(
        'tenant-HV', 0.01, 0.01, 0.002, 600, 'GLOBAL',
      );
      expect(result.volumeClass).toBe('HIGH');
    });

    it('low-volume tenant classified correctly', () => {
      const result = evaluateTenantSegmentation(
        'tenant-LV', 0.01, 0.01, 0.002, 30, 'GLOBAL',
      );
      expect(result.volumeClass).toBe('LOW');
    });

    it('medium-volume tenant classified correctly', () => {
      const result = evaluateTenantSegmentation(
        'tenant-MV', 0.01, 0.01, 0.002, 200, 'GLOBAL',
      );
      expect(result.volumeClass).toBe('MEDIUM');
    });
  });

  // ========================================================================
  // Phase Propagation in Result
  // ========================================================================

  describe('Phase propagation', () => {
    it('GLOBAL phase propagated to result', () => {
      const result = evaluateTenantSegmentation(
        'tenant-X', 0.01, 0.01, 0.002, 500, 'GLOBAL',
      );
      expect(result.phase).toBe('GLOBAL');
    });

    it('PER_TENANT phase propagated to result', () => {
      const result = evaluateTenantSegmentation(
        'tenant-X', 0.01, 0.01, 0.002, 500, 'PER_TENANT',
      );
      expect(result.phase).toBe('PER_TENANT');
    });

    it('CANARY_ONLY phase propagated to result', () => {
      const result = evaluateTenantSegmentation(
        'tenant-X', 0.01, 0.01, 0.002, 500, 'CANARY_ONLY',
      );
      expect(result.phase).toBe('CANARY_ONLY');
    });
  });

  // ========================================================================
  // Canary Selection Implications
  // ========================================================================

  describe('Canary selection implications', () => {
    it('outlier tenants should be excluded from canary (documented rule)', () => {
      const globalMean = 0.01;
      const globalSigma = 0.002;

      const tenants = [
        { id: 'normal-1', rate: 0.010, promotes: 600 },
        { id: 'normal-2', rate: 0.011, promotes: 30 },
        { id: 'outlier-1', rate: 0.020, promotes: 500 }, // 5σ deviation
      ];

      const results = tenants.map(t =>
        evaluateTenantSegmentation(t.id, t.rate, globalMean, globalSigma, t.promotes, 'PER_TENANT'),
      );

      const outliers = results.filter(r => r.isOutlier);
      const canaryCandidates = results.filter(r => !r.isOutlier);

      expect(outliers).toHaveLength(1);
      expect(outliers[0].tenantId).toBe('outlier-1');
      expect(canaryCandidates).toHaveLength(2);
    });

    it('canary set should include mix of high and low volume (documented rule)', () => {
      const globalMean = 0.01;
      const globalSigma = 0.002;

      const tenants = [
        { id: 'hv-1', rate: 0.010, promotes: 600 },
        { id: 'hv-2', rate: 0.011, promotes: 800 },
        { id: 'lv-1', rate: 0.009, promotes: 30 },
        { id: 'lv-2', rate: 0.010, promotes: 20 },
        { id: 'mv-1', rate: 0.010, promotes: 200 },
      ];

      const results = tenants.map(t =>
        evaluateTenantSegmentation(t.id, t.rate, globalMean, globalSigma, t.promotes, 'PER_TENANT'),
      );

      const nonOutliers = results.filter(r => !r.isOutlier);
      const volumeClasses = new Set(nonOutliers.map(r => r.volumeClass));

      // Should have at least HIGH and LOW volume tenants available
      expect(volumeClasses.has('HIGH')).toBe(true);
      expect(volumeClasses.has('LOW')).toBe(true);
    });
  });

  // ========================================================================
  // Determinism
  // ========================================================================

  describe('Determinism', () => {
    it('same input → same phase', () => {
      const p1 = determineSegmentationPhase('shadow', true);
      const p2 = determineSegmentationPhase('shadow', true);
      expect(p1).toBe(p2);
    });

    it('same input → same tenant evaluation', () => {
      const r1 = evaluateTenantSegmentation('t1', 0.015, 0.01, 0.002, 500, 'GLOBAL');
      const r2 = evaluateTenantSegmentation('t1', 0.015, 0.01, 0.002, 500, 'GLOBAL');
      expect(r1.isOutlier).toBe(r2.isOutlier);
      expect(r1.deviationSigma).toBe(r2.deviationSigma);
      expect(r1.volumeClass).toBe(r2.volumeClass);
    });
  });

  // ========================================================================
  // Result Shape
  // ========================================================================

  describe('Result shape', () => {
    it('should include all required fields', () => {
      const result = evaluateTenantSegmentation('t1', 0.01, 0.01, 0.002, 500, 'GLOBAL');
      expect(result).toHaveProperty('phase');
      expect(result).toHaveProperty('tenantId');
      expect(result).toHaveProperty('volumeClass');
      expect(result).toHaveProperty('isOutlier');
      expect(result).toHaveProperty('deviationSigma');
    });

    it('tenantId should be preserved', () => {
      const result = evaluateTenantSegmentation('my-tenant-123', 0.01, 0.01, 0.002, 500, 'GLOBAL');
      expect(result.tenantId).toBe('my-tenant-123');
    });
  });
});
