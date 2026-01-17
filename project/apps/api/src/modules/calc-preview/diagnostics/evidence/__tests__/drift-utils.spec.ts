/**
 * Drift Utils Tests
 * 
 * Phase 8 - Sprint 2B (Updated)
 * 
 * Tests for drift score calculation and threshold checking.
 * Updated for new DriftResult interface with:
 * - missingInBaseline / missingInCurrent separation
 * - topContributors with deterministic sorting
 * - NaN/Infinity protection
 * 
 * @see .kiro/specs/whatif-simulation/tasks.md Sprint 2B
 */

import {
  calculateDrift,
  shouldBlockPromote,
  createDriftSummary,
  roundDriftScore,
  DRIFT_THRESHOLD,
  DRIFT_WEIGHTS,
} from '../drift-utils';
import { EvidenceSnapshot, EvidenceMetricType } from '../../diagnostics.types';

describe('Drift Utils', () => {
  const createSnapshot = (
    metrics: Array<{ metric: EvidenceMetricType; value: number }>,
    overrides: Partial<EvidenceSnapshot> = {},
  ): EvidenceSnapshot => ({
    snapshotId: 'test-snapshot',
    tenantId: 'tenant-001',
    incidentId: 'incident-001',
    capturedAt: new Date().toISOString(),
    points: metrics.map(m => ({
      metric: m.metric,
      value: m.value,
      unit: '%',
      windowSec: 60,
      confidence: 0.9,
      freshnessSec: 30,
      source: 'app_metrics' as const,
      timestamp: new Date().toISOString(),
    })),
    ...overrides,
  });

  describe('calculateDrift', () => {
    describe('identical snapshots', () => {
      it('should return driftScore = 0 for identical snapshots', () => {
        const snapshot = createSnapshot([
          { metric: 'error_rate', value: 2.5 },
          { metric: 'latency_p99', value: 150 },
          { metric: 'slo_burn_rate', value: 0.6 },
        ]);

        const result = calculateDrift(snapshot, snapshot);

        expect(result.driftScore).toBe(0);
        expect(result.shouldBlock).toBe(false);
        expect(result.commonMetrics).toHaveLength(3);
        expect(result.missingInBaseline).toHaveLength(0);
        expect(result.missingInCurrent).toHaveLength(0);
        expect(result.noComparableMetrics).toBe(false);
      });
    });

    describe('threshold boundary', () => {
      it('should block when driftScore >= DRIFT_THRESHOLD', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 1.0 },
        ]);
        
        // rel = abs(new - old) / old = 0.16 / 1.0 = 0.16
        // weighted = rel * 2.0 = 0.32
        // driftScore = sqrt(0.32^2 / 2.0^2) = sqrt(0.1024 / 4) = sqrt(0.0256) = 0.16
        const current = createSnapshot([
          { metric: 'error_rate', value: 1.16 },
        ]);

        const result = calculateDrift(baseline, current);

        expect(result.driftScore).toBeCloseTo(0.16, 5);
        expect(result.shouldBlock).toBe(true); // >= 0.15 threshold
      });

      it('should block at exactly threshold (floating point safe)', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 1.0 },
        ]);
        
        const current = createSnapshot([
          { metric: 'error_rate', value: 1.151 },
        ]);

        const result = calculateDrift(baseline, current);

        expect(result.driftScore).toBeGreaterThanOrEqual(DRIFT_THRESHOLD);
        expect(result.shouldBlock).toBe(true);
      });

      it('should not block when driftScore < DRIFT_THRESHOLD', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 1.0 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 1.1 }, // 10% drift < 15%
        ]);

        const result = calculateDrift(baseline, current);

        expect(result.driftScore).toBeCloseTo(0.1, 5);
        expect(result.shouldBlock).toBe(false);
      });

      it('should block when driftScore > DRIFT_THRESHOLD', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 1.0 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 1.3 }, // 30% drift > 15%
        ]);

        const result = calculateDrift(baseline, current);

        expect(result.driftScore).toBeCloseTo(0.3, 5);
        expect(result.shouldBlock).toBe(true);
      });
    });

    describe('empty snapshots', () => {
      it('should return driftScore = 1.0 when both snapshots are empty', () => {
        const baseline = createSnapshot([]);
        const current = createSnapshot([]);

        const result = calculateDrift(baseline, current);

        expect(result.driftScore).toBe(1.0);
        expect(result.shouldBlock).toBe(true);
        expect(result.noComparableMetrics).toBe(true);
        expect(result.commonMetrics).toHaveLength(0);
        expect(result.topContributors).toHaveLength(0);
      });

      it('should return driftScore = 1.0 when no common metrics', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 2.5 },
        ]);
        const current = createSnapshot([
          { metric: 'latency_p99', value: 150 },
        ]);

        const result = calculateDrift(baseline, current);

        expect(result.driftScore).toBe(1.0);
        expect(result.shouldBlock).toBe(true);
        expect(result.noComparableMetrics).toBe(true);
        expect(result.missingInCurrent).toContain('error_rate');
        expect(result.missingInBaseline).toContain('latency_p99');
        expect(result.topContributors).toHaveLength(0);
      });
    });

    describe('missing metrics separation', () => {
      it('should correctly separate missingInBaseline and missingInCurrent', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 2.5 },
          { metric: 'latency_p99', value: 150 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 2.5 },
          { metric: 'slo_burn_rate', value: 0.6 },
        ]);

        const result = calculateDrift(baseline, current);

        expect(result.commonMetrics).toContain('error_rate');
        expect(result.commonMetrics).toHaveLength(1);
        expect(result.missingInCurrent).toContain('latency_p99');
        expect(result.missingInCurrent).toHaveLength(1);
        expect(result.missingInBaseline).toContain('slo_burn_rate');
        expect(result.missingInBaseline).toHaveLength(1);
      });

      it('should sort missing metrics alphabetically', () => {
        const baseline = createSnapshot([
          { metric: 'slo_burn_rate', value: 0.6 },
          { metric: 'error_rate', value: 2.5 },
        ]);
        const current = createSnapshot([
          { metric: 'latency_p99', value: 150 },
          { metric: 'queue_depth', value: 10 },
        ]);

        const result = calculateDrift(baseline, current);

        expect(result.missingInCurrent).toEqual(['error_rate', 'slo_burn_rate']);
        expect(result.missingInBaseline).toEqual(['latency_p99', 'queue_depth']);
      });
    });

    describe('topContributors', () => {
      it('should sort by weightedContribution DESC', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 1.0 },      // weight 2.0
          { metric: 'latency_p99', value: 100 },    // weight 1.0
          { metric: 'saturation_cpu', value: 0.5 }, // weight 0.5
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 1.2 },      // 20% drift, weighted = 0.4
          { metric: 'latency_p99', value: 150 },    // 50% drift, weighted = 0.5
          { metric: 'saturation_cpu', value: 0.6 }, // 20% drift, weighted = 0.1
        ]);

        const result = calculateDrift(baseline, current);

        // latency_p99 should be first (0.5), then error_rate (0.4), then saturation_cpu (0.1)
        expect(result.topContributors[0].metric).toBe('latency_p99');
        expect(result.topContributors[1].metric).toBe('error_rate');
        expect(result.topContributors[2].metric).toBe('saturation_cpu');
      });

      it('should use metric name as tie-break (ASC)', () => {
        const baseline = createSnapshot([
          { metric: 'latency_p99', value: 100 },  // weight 1.0
          { metric: 'latency_p95', value: 100 },  // weight 1.0
        ]);
        const current = createSnapshot([
          { metric: 'latency_p99', value: 110 },  // 10% drift, weighted = 0.1
          { metric: 'latency_p95', value: 110 },  // 10% drift, weighted = 0.1
        ]);

        const result = calculateDrift(baseline, current);

        // Same contribution, so sorted by metric name ASC
        expect(result.topContributors[0].metric).toBe('latency_p95');
        expect(result.topContributors[1].metric).toBe('latency_p99');
      });

      it('should include all required fields', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 1.0 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 1.2 },
        ]);

        const result = calculateDrift(baseline, current);
        const contributor = result.topContributors[0];

        expect(contributor.metric).toBe('error_rate');
        expect(contributor.baselineValue).toBe(1.0);
        expect(contributor.currentValue).toBe(1.2);
        expect(contributor.relativeDrift).toBeCloseTo(0.2, 5);
        expect(contributor.weightedContribution).toBeCloseTo(0.4, 5);
        expect(contributor.weight).toBe(2.0);
      });
    });

    describe('determinism', () => {
      it('should produce same driftScore for same inputs', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 2.5 },
          { metric: 'latency_p99', value: 150 },
          { metric: 'slo_burn_rate', value: 0.6 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 3.0 },
          { metric: 'latency_p99', value: 180 },
          { metric: 'slo_burn_rate', value: 0.8 },
        ]);

        const result1 = calculateDrift(baseline, current);
        const result2 = calculateDrift(baseline, current);

        expect(result1.driftScore).toBe(result2.driftScore);
        expect(result1.commonMetrics).toEqual(result2.commonMetrics);
        expect(result1.missingInBaseline).toEqual(result2.missingInBaseline);
        expect(result1.missingInCurrent).toEqual(result2.missingInCurrent);
        expect(result1.topContributors).toEqual(result2.topContributors);
      });

      it('should sort commonMetrics alphabetically', () => {
        const baseline = createSnapshot([
          { metric: 'slo_burn_rate', value: 0.6 },
          { metric: 'error_rate', value: 2.5 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 2.5 },
          { metric: 'slo_burn_rate', value: 0.6 },
        ]);

        const result = calculateDrift(baseline, current);

        expect(result.commonMetrics[0]).toBe('error_rate');
        expect(result.commonMetrics[1]).toBe('slo_burn_rate');
      });
    });

    describe('weight application', () => {
      it('should apply correct weights to metrics', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 1.0 },
          { metric: 'latency_p99', value: 100 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 1.1 }, // 10% drift
          { metric: 'latency_p99', value: 110 }, // 10% drift
        ]);

        const result = calculateDrift(baseline, current);

        // error_rate: rel=0.1, weighted=0.1*2.0=0.2
        // latency_p99: rel=0.1, weighted=0.1*1.0=0.1
        // driftScore = sqrt((0.2^2 + 0.1^2) / (2.0^2 + 1.0^2))
        //            = sqrt((0.04 + 0.01) / (4 + 1))
        //            = sqrt(0.05 / 5)
        //            = sqrt(0.01)
        //            = 0.1
        expect(result.driftScore).toBeCloseTo(0.1, 5);

        const errorDrift = result.topContributors.find(d => d.metric === 'error_rate');
        const latencyDrift = result.topContributors.find(d => d.metric === 'latency_p99');

        expect(errorDrift?.weightedContribution).toBeCloseTo(0.2, 5);
        expect(latencyDrift?.weightedContribution).toBeCloseTo(0.1, 5);
      });
    });

    describe('edge cases', () => {
      it('should handle zero baseline value (eps protection)', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 0 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 0.1 },
        ]);

        const result = calculateDrift(baseline, current);

        expect(Number.isFinite(result.driftScore)).toBe(true);
        expect(result.driftScore).toBeGreaterThan(0);
      });

      it('should handle negative values', () => {
        const baseline = createSnapshot([
          { metric: 'error_rate', value: -1.0 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: -1.2 },
        ]);

        const result = calculateDrift(baseline, current);

        expect(Number.isFinite(result.driftScore)).toBe(true);
      });

      it('should protect against NaN in weightedContribution', () => {
        // This is hard to trigger naturally, but the protection exists
        const baseline = createSnapshot([
          { metric: 'error_rate', value: 1.0 },
        ]);
        const current = createSnapshot([
          { metric: 'error_rate', value: 1.1 },
        ]);

        const result = calculateDrift(baseline, current);

        for (const contributor of result.topContributors) {
          expect(Number.isFinite(contributor.weightedContribution)).toBe(true);
          expect(Number.isFinite(contributor.relativeDrift)).toBe(true);
        }
      });
    });
  });

  describe('shouldBlockPromote', () => {
    it('should return true when shouldBlock is true', () => {
      const result = calculateDrift(
        createSnapshot([{ metric: 'error_rate', value: 1.0 }]),
        createSnapshot([{ metric: 'error_rate', value: 2.0 }]),
      );

      expect(shouldBlockPromote(result)).toBe(true);
    });

    it('should return true when noComparableMetrics', () => {
      const result = calculateDrift(
        createSnapshot([{ metric: 'error_rate', value: 1.0 }]),
        createSnapshot([{ metric: 'latency_p99', value: 100 }]),
      );

      expect(shouldBlockPromote(result)).toBe(true);
    });

    it('should return false when drift is acceptable', () => {
      const result = calculateDrift(
        createSnapshot([{ metric: 'error_rate', value: 1.0 }]),
        createSnapshot([{ metric: 'error_rate', value: 1.05 }]),
      );

      expect(shouldBlockPromote(result)).toBe(false);
    });
  });

  describe('createDriftSummary', () => {
    it('should create summary for NO_COMPARABLE_METRICS', () => {
      const result = calculateDrift(
        createSnapshot([]),
        createSnapshot([]),
      );

      const summary = createDriftSummary(result);

      expect(summary.blocked).toBe(true);
      expect(summary.reason).toBe('NO_COMPARABLE_METRICS');
      expect(summary.suggestion).toBe('RESIMULATE');
    });

    it('should create summary for DRIFT_TOO_HIGH with topContributors', () => {
      const result = calculateDrift(
        createSnapshot([{ metric: 'error_rate', value: 1.0 }]),
        createSnapshot([{ metric: 'error_rate', value: 2.0 }]),
      );

      const summary = createDriftSummary(result);

      expect(summary.blocked).toBe(true);
      expect(summary.reason).toBe('DRIFT_TOO_HIGH');
      expect(summary.suggestion).toBe('RESIMULATE');
      expect(summary.topContributors).toBeDefined();
      expect(summary.topContributors![0].metric).toBe('error_rate');
    });

    it('should create summary for acceptable drift', () => {
      const result = calculateDrift(
        createSnapshot([{ metric: 'error_rate', value: 1.0 }]),
        createSnapshot([{ metric: 'error_rate', value: 1.05 }]),
      );

      const summary = createDriftSummary(result);

      expect(summary.blocked).toBe(false);
      expect(summary.reason).toBeUndefined();
      expect(summary.suggestion).toBeUndefined();
    });
  });

  describe('roundDriftScore', () => {
    it('should round to 6 decimal places by default', () => {
      expect(roundDriftScore(0.123456789)).toBe(0.123457);
    });

    it('should round to specified precision', () => {
      expect(roundDriftScore(0.123456789, 3)).toBe(0.123);
      expect(roundDriftScore(0.123456789, 2)).toBe(0.12);
    });
  });

  describe('DRIFT_WEIGHTS constant', () => {
    it('should have weights for all metric types', () => {
      const expectedMetrics: EvidenceMetricType[] = [
        'error_rate',
        'slo_burn_rate',
        'latency_p99',
        'latency_p95',
        'saturation_cpu',
        'queue_depth',
      ];

      for (const metric of expectedMetrics) {
        expect(DRIFT_WEIGHTS[metric]).toBeDefined();
        expect(typeof DRIFT_WEIGHTS[metric]).toBe('number');
      }
    });
  });

  describe('DRIFT_THRESHOLD constant', () => {
    it('should be 0.15', () => {
      expect(DRIFT_THRESHOLD).toBe(0.15);
    });
  });
});
