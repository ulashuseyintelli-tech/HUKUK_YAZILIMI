/**
 * Stage-1 Provider Error Profile Computation (Task 3.2)
 *
 * Validates error rate statistics, error distribution by operation,
 * zero-error duration, and anomaly detection.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/requirements.md — R8.1–R8.3
 * @see .kiro/specs/stage-1-runtime-baseline/design.md — Baseline 2.2
 */

// ============================================================================
// Types
// ============================================================================

interface ProviderErrorSample {
  timestamp: number;
  errorsPerSecond: number;
  operation: string;
}

interface ProviderErrorProfile {
  observationWindowHours: number;
  totalSamples: number;
  mean: number;
  p95: number;
  p99: number;
  zeroErrorDurationHours: number;
  operationDistribution: Record<string, { count: number; totalErrors: number; percentage: number }>;
  anomalies: ProviderErrorAnomaly[];
}

interface ProviderErrorAnomaly {
  timestamp: number;
  errorsPerSecond: number;
  threshold: number;
  operation: string;
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

function computeZeroErrorDuration(samples: ProviderErrorSample[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  let maxZeroStreak = 0;
  let currentStreak = 0;

  for (const s of sorted) {
    if (s.errorsPerSecond === 0) {
      currentStreak++;
    } else {
      maxZeroStreak = Math.max(maxZeroStreak, currentStreak);
      currentStreak = 0;
    }
  }
  maxZeroStreak = Math.max(maxZeroStreak, currentStreak);

  // Assuming 1 sample per minute, convert to hours
  return (maxZeroStreak * 1) / 60;
}

function computeProviderErrorProfile(
  samples: ProviderErrorSample[],
  observationWindowHours: number,
  anomalyThreshold: number,
): ProviderErrorProfile {
  if (samples.length === 0) {
    return {
      observationWindowHours,
      totalSamples: 0,
      mean: 0, p95: 0, p99: 0,
      zeroErrorDurationHours: 0,
      operationDistribution: {},
      anomalies: [],
    };
  }

  const rates = samples.map(s => s.errorsPerSecond);
  const sorted = [...rates].sort((a, b) => a - b);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;

  // Operation distribution
  const opMap: Record<string, { count: number; totalErrors: number }> = {};
  for (const s of samples) {
    if (!opMap[s.operation]) opMap[s.operation] = { count: 0, totalErrors: 0 };
    opMap[s.operation].count++;
    opMap[s.operation].totalErrors += s.errorsPerSecond;
  }
  const totalErrors = Object.values(opMap).reduce((a, b) => a + b.totalErrors, 0);
  const operationDistribution: Record<string, { count: number; totalErrors: number; percentage: number }> = {};
  for (const [op, data] of Object.entries(opMap)) {
    operationDistribution[op] = {
      ...data,
      percentage: totalErrors > 0 ? (data.totalErrors / totalErrors) * 100 : 0,
    };
  }

  // Anomalies
  const anomalies: ProviderErrorAnomaly[] = samples
    .filter(s => s.errorsPerSecond > anomalyThreshold)
    .map(s => ({
      timestamp: s.timestamp,
      errorsPerSecond: s.errorsPerSecond,
      threshold: anomalyThreshold,
      operation: s.operation,
    }));

  return {
    observationWindowHours,
    totalSamples: samples.length,
    mean,
    p95: computePercentile(sorted, 95),
    p99: computePercentile(sorted, 99),
    zeroErrorDurationHours: computeZeroErrorDuration(samples),
    operationDistribution,
    anomalies,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-1 Provider Error Profile (Task 3.2)', () => {
  describe('Error Rate Statistics', () => {
    it('should compute mean error rate', () => {
      const samples: ProviderErrorSample[] = [
        { timestamp: 1, errorsPerSecond: 0.01, operation: 'fetchConfig' },
        { timestamp: 2, errorsPerSecond: 0.02, operation: 'fetchConfig' },
        { timestamp: 3, errorsPerSecond: 0.03, operation: 'fetchConfig' },
      ];
      const profile = computeProviderErrorProfile(samples, 48, 0.1);
      expect(profile.mean).toBeCloseTo(0.02, 6);
    });

    it('should compute p95 error rate', () => {
      const samples: ProviderErrorSample[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i,
        errorsPerSecond: (i + 1) * 0.001,
        operation: 'fetchConfig',
      }));
      const profile = computeProviderErrorProfile(samples, 48, 1);
      expect(profile.p95).toBeCloseTo(0.0955, 3);
    });

    it('should compute p99 error rate', () => {
      const samples: ProviderErrorSample[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i,
        errorsPerSecond: (i + 1) * 0.001,
        operation: 'fetchConfig',
      }));
      const profile = computeProviderErrorProfile(samples, 48, 1);
      expect(profile.p99).toBeCloseTo(0.0991, 2);
    });

    it('should handle empty samples', () => {
      const profile = computeProviderErrorProfile([], 48, 0.1);
      expect(profile.totalSamples).toBe(0);
      expect(profile.mean).toBe(0);
    });

    it('should handle all-zero error rates', () => {
      const samples: ProviderErrorSample[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i,
        errorsPerSecond: 0,
        operation: 'fetchConfig',
      }));
      const profile = computeProviderErrorProfile(samples, 48, 0.1);
      expect(profile.mean).toBe(0);
      expect(profile.p95).toBe(0);
    });
  });

  describe('Error Distribution by Operation', () => {
    it('should compute distribution by operation label', () => {
      const samples: ProviderErrorSample[] = [
        { timestamp: 1, errorsPerSecond: 0.01, operation: 'fetchConfig' },
        { timestamp: 2, errorsPerSecond: 0.02, operation: 'fetchConfig' },
        { timestamp: 3, errorsPerSecond: 0.01, operation: 'fetchHeader' },
        { timestamp: 4, errorsPerSecond: 0.01, operation: 'fetchConfigMap' },
      ];
      const profile = computeProviderErrorProfile(samples, 48, 0.1);
      expect(profile.operationDistribution.fetchConfig).toBeDefined();
      expect(profile.operationDistribution.fetchConfig.count).toBe(2);
      expect(profile.operationDistribution.fetchHeader.count).toBe(1);
      expect(profile.operationDistribution.fetchConfigMap.count).toBe(1);
    });

    it('should compute percentage of errors per operation', () => {
      const samples: ProviderErrorSample[] = [
        { timestamp: 1, errorsPerSecond: 0.03, operation: 'fetchConfig' },
        { timestamp: 2, errorsPerSecond: 0.01, operation: 'fetchHeader' },
      ];
      const profile = computeProviderErrorProfile(samples, 48, 0.1);
      expect(profile.operationDistribution.fetchConfig.percentage).toBe(75);
      expect(profile.operationDistribution.fetchHeader.percentage).toBe(25);
    });
  });

  describe('Zero-Error Duration', () => {
    it('should compute longest zero-error streak', () => {
      const samples: ProviderErrorSample[] = [
        { timestamp: 1, errorsPerSecond: 0.01, operation: 'fetchConfig' },
        { timestamp: 2, errorsPerSecond: 0, operation: 'fetchConfig' },
        { timestamp: 3, errorsPerSecond: 0, operation: 'fetchConfig' },
        { timestamp: 4, errorsPerSecond: 0, operation: 'fetchConfig' },
        { timestamp: 5, errorsPerSecond: 0.01, operation: 'fetchConfig' },
        { timestamp: 6, errorsPerSecond: 0, operation: 'fetchConfig' },
      ];
      const profile = computeProviderErrorProfile(samples, 48, 0.1);
      // 3 consecutive zero samples = 3 minutes = 0.05 hours
      expect(profile.zeroErrorDurationHours).toBeCloseTo(3 / 60, 4);
    });

    it('should return 0 for all-error samples', () => {
      const samples: ProviderErrorSample[] = Array.from({ length: 5 }, (_, i) => ({
        timestamp: i,
        errorsPerSecond: 0.01,
        operation: 'fetchConfig',
      }));
      const profile = computeProviderErrorProfile(samples, 48, 0.1);
      expect(profile.zeroErrorDurationHours).toBe(0);
    });

    it('should compute full window for all-zero samples', () => {
      const samples: ProviderErrorSample[] = Array.from({ length: 60 }, (_, i) => ({
        timestamp: i,
        errorsPerSecond: 0,
        operation: 'fetchConfig',
      }));
      const profile = computeProviderErrorProfile(samples, 48, 0.1);
      expect(profile.zeroErrorDurationHours).toBe(1); // 60 minutes = 1 hour
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect error spike above threshold', () => {
      const samples: ProviderErrorSample[] = [
        { timestamp: 1, errorsPerSecond: 0.001, operation: 'fetchConfig' },
        { timestamp: 2, errorsPerSecond: 0.5, operation: 'fetchConfig' },
        { timestamp: 3, errorsPerSecond: 0.001, operation: 'fetchConfig' },
      ];
      const profile = computeProviderErrorProfile(samples, 48, 0.01);
      expect(profile.anomalies).toHaveLength(1);
      expect(profile.anomalies[0].errorsPerSecond).toBe(0.5);
    });

    it('should not flag samples below threshold', () => {
      const samples: ProviderErrorSample[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i,
        errorsPerSecond: 0.001,
        operation: 'fetchConfig',
      }));
      const profile = computeProviderErrorProfile(samples, 48, 0.01);
      expect(profile.anomalies).toHaveLength(0);
    });

    it('anomaly should include operation label', () => {
      const samples: ProviderErrorSample[] = [
        { timestamp: 1, errorsPerSecond: 0.5, operation: 'fetchHeader' },
      ];
      const profile = computeProviderErrorProfile(samples, 48, 0.01);
      expect(profile.anomalies[0].operation).toBe('fetchHeader');
    });
  });
});
