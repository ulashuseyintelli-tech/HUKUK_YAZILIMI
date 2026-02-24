/**
 * Stage-1 Drift Rate Baseline Computation (Task 3.1)
 *
 * Validates drift rate statistics computation, drift type distribution,
 * and anomaly detection logic using synthetic data.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/requirements.md — R7.1–R7.3
 * @see .kiro/specs/stage-1-runtime-baseline/design.md — Baseline 2.1
 */

// ============================================================================
// Types
// ============================================================================

interface DriftRateSample {
  timestamp: number;
  ratePerSecond: number;
  type: 'config' | 'schema' | 'ruleset';
}

interface DriftRateBaseline {
  observationWindowHours: number;
  totalSamples: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  maxSustained5m: number;
  typeDistribution: Record<string, { count: number; percentage: number }>;
  anomalies: DriftAnomaly[];
}

interface DriftAnomaly {
  timestamp: number;
  ratePerSecond: number;
  threshold: number;
  description: string;
}

// ============================================================================
// Computation Functions
// ============================================================================

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function computeDriftRateBaseline(
  samples: DriftRateSample[],
  observationWindowHours: number,
  anomalyThresholdPerSecond: number,
): DriftRateBaseline {
  if (samples.length === 0) {
    return {
      observationWindowHours,
      totalSamples: 0,
      mean: 0, p50: 0, p95: 0, p99: 0, maxSustained5m: 0,
      typeDistribution: {},
      anomalies: [],
    };
  }

  const rates = samples.map(s => s.ratePerSecond);
  const sorted = [...rates].sort((a, b) => a - b);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;

  // Max sustained 5m window (assuming 1 sample per minute, 5 samples per window)
  const windowSize = 5;
  let maxSustained = 0;
  for (let i = 0; i <= rates.length - windowSize; i++) {
    const windowAvg = rates.slice(i, i + windowSize).reduce((a, b) => a + b, 0) / windowSize;
    maxSustained = Math.max(maxSustained, windowAvg);
  }
  if (rates.length < windowSize) {
    maxSustained = Math.max(...rates);
  }

  // Type distribution
  const typeCounts: Record<string, number> = {};
  for (const s of samples) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  }
  const typeDistribution: Record<string, { count: number; percentage: number }> = {};
  for (const [type, count] of Object.entries(typeCounts)) {
    typeDistribution[type] = { count, percentage: (count / samples.length) * 100 };
  }

  // Anomaly detection
  const anomalies: DriftAnomaly[] = [];
  for (const s of samples) {
    if (s.ratePerSecond > anomalyThresholdPerSecond) {
      anomalies.push({
        timestamp: s.timestamp,
        ratePerSecond: s.ratePerSecond,
        threshold: anomalyThresholdPerSecond,
        description: `Drift rate ${s.ratePerSecond.toFixed(6)}/s exceeds threshold ${anomalyThresholdPerSecond}/s`,
      });
    }
  }

  return {
    observationWindowHours,
    totalSamples: samples.length,
    mean,
    p50: computePercentile(sorted, 50),
    p95: computePercentile(sorted, 95),
    p99: computePercentile(sorted, 99),
    maxSustained5m: maxSustained,
    typeDistribution,
    anomalies,
  };
}

// ============================================================================
// Test Data Generators
// ============================================================================

function generateStableSamples(count: number, baseRate: number): DriftRateSample[] {
  const types: Array<'config' | 'schema' | 'ruleset'> = ['config', 'schema', 'ruleset'];
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    timestamp: now + i * 60000,
    ratePerSecond: baseRate + (Math.random() - 0.5) * baseRate * 0.1,
    type: types[i % 3],
  }));
}

function generateSamplesWithSpike(count: number, baseRate: number, spikeAt: number, spikeRate: number): DriftRateSample[] {
  const samples = generateStableSamples(count, baseRate);
  if (spikeAt < count) {
    samples[spikeAt].ratePerSecond = spikeRate;
  }
  return samples;
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-1 Drift Rate Baseline (Task 3.1)', () => {
  describe('Statistics Computation', () => {
    it('should compute mean drift rate correctly', () => {
      const samples: DriftRateSample[] = [
        { timestamp: 1, ratePerSecond: 0.001, type: 'config' },
        { timestamp: 2, ratePerSecond: 0.002, type: 'config' },
        { timestamp: 3, ratePerSecond: 0.003, type: 'config' },
      ];
      const baseline = computeDriftRateBaseline(samples, 48, 0.1);
      expect(baseline.mean).toBeCloseTo(0.002, 6);
    });

    it('should compute p50 correctly', () => {
      const samples: DriftRateSample[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i,
        ratePerSecond: (i + 1) * 0.001,
        type: 'config' as const,
      }));
      const baseline = computeDriftRateBaseline(samples, 48, 1);
      // p50 of 0.001..0.100 should be around 0.050
      expect(baseline.p50).toBeCloseTo(0.0505, 3);
    });

    it('should compute p95 correctly', () => {
      const samples: DriftRateSample[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i,
        ratePerSecond: (i + 1) * 0.001,
        type: 'config' as const,
      }));
      const baseline = computeDriftRateBaseline(samples, 48, 1);
      expect(baseline.p95).toBeCloseTo(0.0955, 3);
    });

    it('should compute p99 correctly', () => {
      const samples: DriftRateSample[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i,
        ratePerSecond: (i + 1) * 0.001,
        type: 'config' as const,
      }));
      const baseline = computeDriftRateBaseline(samples, 48, 1);
      expect(baseline.p99).toBeCloseTo(0.0991, 2);
    });

    it('should compute max sustained 5m window', () => {
      const samples: DriftRateSample[] = [
        { timestamp: 1, ratePerSecond: 0.001, type: 'config' },
        { timestamp: 2, ratePerSecond: 0.001, type: 'config' },
        { timestamp: 3, ratePerSecond: 0.010, type: 'config' },
        { timestamp: 4, ratePerSecond: 0.010, type: 'config' },
        { timestamp: 5, ratePerSecond: 0.010, type: 'config' },
        { timestamp: 6, ratePerSecond: 0.010, type: 'config' },
        { timestamp: 7, ratePerSecond: 0.010, type: 'config' },
        { timestamp: 8, ratePerSecond: 0.001, type: 'config' },
      ];
      const baseline = computeDriftRateBaseline(samples, 48, 0.1);
      expect(baseline.maxSustained5m).toBe(0.010);
    });

    it('should handle empty samples', () => {
      const baseline = computeDriftRateBaseline([], 48, 0.1);
      expect(baseline.totalSamples).toBe(0);
      expect(baseline.mean).toBe(0);
      expect(baseline.p50).toBe(0);
      expect(baseline.p95).toBe(0);
      expect(baseline.p99).toBe(0);
    });

    it('should handle single sample', () => {
      const samples: DriftRateSample[] = [
        { timestamp: 1, ratePerSecond: 0.005, type: 'config' },
      ];
      const baseline = computeDriftRateBaseline(samples, 48, 0.1);
      expect(baseline.mean).toBe(0.005);
      expect(baseline.p50).toBe(0.005);
      expect(baseline.maxSustained5m).toBe(0.005);
    });
  });

  describe('Drift Type Distribution', () => {
    it('should compute type distribution breakdown', () => {
      const samples: DriftRateSample[] = [
        { timestamp: 1, ratePerSecond: 0.001, type: 'config' },
        { timestamp: 2, ratePerSecond: 0.001, type: 'config' },
        { timestamp: 3, ratePerSecond: 0.001, type: 'schema' },
        { timestamp: 4, ratePerSecond: 0.001, type: 'ruleset' },
      ];
      const baseline = computeDriftRateBaseline(samples, 48, 0.1);
      expect(baseline.typeDistribution.config.count).toBe(2);
      expect(baseline.typeDistribution.config.percentage).toBe(50);
      expect(baseline.typeDistribution.schema.count).toBe(1);
      expect(baseline.typeDistribution.schema.percentage).toBe(25);
      expect(baseline.typeDistribution.ruleset.count).toBe(1);
      expect(baseline.typeDistribution.ruleset.percentage).toBe(25);
    });

    it('should handle all-same-type distribution', () => {
      const samples: DriftRateSample[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i,
        ratePerSecond: 0.001,
        type: 'config' as const,
      }));
      const baseline = computeDriftRateBaseline(samples, 48, 0.1);
      expect(baseline.typeDistribution.config.percentage).toBe(100);
      expect(baseline.typeDistribution.schema).toBeUndefined();
    });

    it('should compute equal distribution for balanced types', () => {
      const samples = generateStableSamples(30, 0.001);
      const baseline = computeDriftRateBaseline(samples, 48, 0.1);
      expect(baseline.typeDistribution.config.count).toBe(10);
      expect(baseline.typeDistribution.schema.count).toBe(10);
      expect(baseline.typeDistribution.ruleset.count).toBe(10);
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect spike above threshold', () => {
      const threshold = 0.01;
      const samples = generateSamplesWithSpike(20, 0.001, 10, 0.05);
      const baseline = computeDriftRateBaseline(samples, 48, threshold);
      expect(baseline.anomalies.length).toBeGreaterThanOrEqual(1);
      const spikeAnomaly = baseline.anomalies.find(a => a.ratePerSecond === 0.05);
      expect(spikeAnomaly).toBeDefined();
    });

    it('should not flag samples below threshold', () => {
      const samples = generateStableSamples(20, 0.001);
      const baseline = computeDriftRateBaseline(samples, 48, 0.1);
      expect(baseline.anomalies).toHaveLength(0);
    });

    it('anomaly should include threshold and description', () => {
      const samples: DriftRateSample[] = [
        { timestamp: 1, ratePerSecond: 0.05, type: 'config' },
      ];
      const baseline = computeDriftRateBaseline(samples, 48, 0.01);
      expect(baseline.anomalies).toHaveLength(1);
      expect(baseline.anomalies[0].threshold).toBe(0.01);
      expect(baseline.anomalies[0].description).toContain('exceeds threshold');
    });

    it('should flag all samples above threshold', () => {
      const samples: DriftRateSample[] = Array.from({ length: 5 }, (_, i) => ({
        timestamp: i,
        ratePerSecond: 0.05 + i * 0.01,
        type: 'config' as const,
      }));
      const baseline = computeDriftRateBaseline(samples, 48, 0.04);
      expect(baseline.anomalies).toHaveLength(5);
    });
  });

  describe('Observation Window', () => {
    it('should record observation window hours', () => {
      const baseline = computeDriftRateBaseline([], 48, 0.1);
      expect(baseline.observationWindowHours).toBe(48);
    });

    it('should accept 24h window', () => {
      const baseline = computeDriftRateBaseline([], 24, 0.1);
      expect(baseline.observationWindowHours).toBe(24);
    });

    it('should accept 72h window', () => {
      const baseline = computeDriftRateBaseline([], 72, 0.1);
      expect(baseline.observationWindowHours).toBe(72);
    });
  });
});
