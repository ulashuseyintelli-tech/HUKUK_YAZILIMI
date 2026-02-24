/**
 * Stage-1 Alert Noise Ratio Computation (Task 3.3)
 *
 * Validates noise ratio computation, firing duration distribution,
 * flapping detection, threshold tuning flag, and alert storm condition.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/requirements.md — R9.1–R9.4
 * @see .kiro/specs/stage-1-runtime-baseline/design.md — Baseline 2.3
 */

// ============================================================================
// Types
// ============================================================================

interface AlertFiringEvent {
  alertname: string;
  group: 'redrive' | 'simulation' | 'guard';
  firedAt: number;
  resolvedAt: number;
  evalCyclesFiring: number;
}

interface AlertNoiseProfile {
  observationWindowHours: number;
  totalFiringEvents: number;
  totalEvalCycles: number;
  noiseRatio: number;
  firesPerHour: number;
  firingDurationDistribution: { mean: number; p50: number; p95: number };
  flappingCandidates: AlertFiringEvent[];
  thresholdTuningCandidates: string[];
  alertStorm: AlertStormResult;
}

interface AlertStormResult {
  detected: boolean;
  reason: string;
  action: string;
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

function computeAlertNoiseProfile(
  events: AlertFiringEvent[],
  totalEvalCycles: number,
  observationWindowHours: number,
): AlertNoiseProfile {
  const totalFiringEvents = events.length;
  const noiseRatio = totalEvalCycles > 0 ? totalFiringEvents / totalEvalCycles : 0;
  const firesPerHour = observationWindowHours > 0 ? totalFiringEvents / observationWindowHours : 0;

  // Firing duration distribution (in eval cycles)
  const durations = events.map(e => e.evalCyclesFiring);
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const meanDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  // Flapping: alerts that fire and resolve within < 2 eval cycles
  const flappingCandidates = events.filter(e => e.evalCyclesFiring < 2);

  // Threshold tuning: alerts with per-alert noise ratio > 5%
  const alertCounts: Record<string, number> = {};
  for (const e of events) {
    alertCounts[e.alertname] = (alertCounts[e.alertname] || 0) + 1;
  }
  const thresholdTuningCandidates = Object.entries(alertCounts)
    .filter(([, count]) => totalEvalCycles > 0 && (count / totalEvalCycles) > 0.05)
    .map(([name]) => name);

  // Alert storm condition: noise_ratio > 5% OR fires/hour > 10
  const stormDetected = noiseRatio > 0.05 || firesPerHour > 10;
  const stormReason = stormDetected
    ? `noise_ratio=${(noiseRatio * 100).toFixed(1)}% (threshold 5%), fires/hour=${firesPerHour.toFixed(1)} (threshold 10)`
    : 'No storm detected';

  return {
    observationWindowHours,
    totalFiringEvents,
    totalEvalCycles,
    noiseRatio,
    firesPerHour,
    firingDurationDistribution: {
      mean: meanDuration,
      p50: computePercentile(sortedDurations, 50),
      p95: computePercentile(sortedDurations, 95),
    },
    flappingCandidates,
    thresholdTuningCandidates,
    alertStorm: {
      detected: stormDetected,
      reason: stormReason,
      action: stormDetected ? 'HALT — threshold tuning required' : 'OK — continue baseline',
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-1 Alert Noise Ratio (Task 3.3)', () => {
  describe('Noise Ratio Computation', () => {
    it('should compute noise ratio = firing events / eval cycles', () => {
      const events: AlertFiringEvent[] = Array.from({ length: 5 }, (_, i) => ({
        alertname: 'TestAlert',
        group: 'guard' as const,
        firedAt: i * 60000,
        resolvedAt: (i + 1) * 60000,
        evalCyclesFiring: 3,
      }));
      const profile = computeAlertNoiseProfile(events, 100, 48);
      expect(profile.noiseRatio).toBe(0.05);
    });

    it('should compute fires per hour', () => {
      const events: AlertFiringEvent[] = Array.from({ length: 48 }, (_, i) => ({
        alertname: 'TestAlert',
        group: 'guard' as const,
        firedAt: i * 3600000,
        resolvedAt: (i + 0.5) * 3600000,
        evalCyclesFiring: 5,
      }));
      const profile = computeAlertNoiseProfile(events, 1000, 48);
      expect(profile.firesPerHour).toBe(1);
    });

    it('should handle zero events', () => {
      const profile = computeAlertNoiseProfile([], 100, 48);
      expect(profile.noiseRatio).toBe(0);
      expect(profile.firesPerHour).toBe(0);
      expect(profile.totalFiringEvents).toBe(0);
    });

    it('should handle zero eval cycles', () => {
      const profile = computeAlertNoiseProfile([], 0, 48);
      expect(profile.noiseRatio).toBe(0);
    });
  });

  describe('Firing Duration Distribution', () => {
    it('should compute mean firing duration', () => {
      const events: AlertFiringEvent[] = [
        { alertname: 'A', group: 'guard', firedAt: 0, resolvedAt: 1, evalCyclesFiring: 3 },
        { alertname: 'B', group: 'guard', firedAt: 0, resolvedAt: 1, evalCyclesFiring: 5 },
        { alertname: 'C', group: 'guard', firedAt: 0, resolvedAt: 1, evalCyclesFiring: 7 },
      ];
      const profile = computeAlertNoiseProfile(events, 100, 48);
      expect(profile.firingDurationDistribution.mean).toBe(5);
    });

    it('should compute p50 and p95 firing duration', () => {
      const events: AlertFiringEvent[] = Array.from({ length: 100 }, (_, i) => ({
        alertname: 'TestAlert',
        group: 'guard' as const,
        firedAt: 0,
        resolvedAt: 1,
        evalCyclesFiring: i + 1,
      }));
      const profile = computeAlertNoiseProfile(events, 1000, 48);
      expect(profile.firingDurationDistribution.p50).toBeCloseTo(50.5, 0);
      expect(profile.firingDurationDistribution.p95).toBeCloseTo(95.5, 0);
    });
  });

  describe('Flapping Detection', () => {
    it('should detect alerts firing < 2 eval cycles as flapping', () => {
      const events: AlertFiringEvent[] = [
        { alertname: 'Flapper', group: 'guard', firedAt: 0, resolvedAt: 1, evalCyclesFiring: 1 },
        { alertname: 'Stable', group: 'guard', firedAt: 0, resolvedAt: 1, evalCyclesFiring: 5 },
        { alertname: 'Flapper2', group: 'redrive', firedAt: 0, resolvedAt: 1, evalCyclesFiring: 0 },
      ];
      const profile = computeAlertNoiseProfile(events, 100, 48);
      expect(profile.flappingCandidates).toHaveLength(2);
      expect(profile.flappingCandidates.map(f => f.alertname)).toContain('Flapper');
      expect(profile.flappingCandidates.map(f => f.alertname)).toContain('Flapper2');
    });

    it('should not flag alerts with >= 2 eval cycles as flapping', () => {
      const events: AlertFiringEvent[] = [
        { alertname: 'Stable', group: 'guard', firedAt: 0, resolvedAt: 1, evalCyclesFiring: 2 },
        { alertname: 'VeryStable', group: 'guard', firedAt: 0, resolvedAt: 1, evalCyclesFiring: 10 },
      ];
      const profile = computeAlertNoiseProfile(events, 100, 48);
      expect(profile.flappingCandidates).toHaveLength(0);
    });
  });

  describe('Threshold Tuning Flag', () => {
    it('should flag alerts with noise ratio > 5% as tuning candidates', () => {
      const events: AlertFiringEvent[] = Array.from({ length: 6 }, (_, i) => ({
        alertname: 'NoisyAlert',
        group: 'guard' as const,
        firedAt: i,
        resolvedAt: i + 1,
        evalCyclesFiring: 3,
      }));
      const profile = computeAlertNoiseProfile(events, 100, 48);
      expect(profile.thresholdTuningCandidates).toContain('NoisyAlert');
    });

    it('should not flag alerts with noise ratio <= 5%', () => {
      const events: AlertFiringEvent[] = Array.from({ length: 5 }, (_, i) => ({
        alertname: 'QuietAlert',
        group: 'guard' as const,
        firedAt: i,
        resolvedAt: i + 1,
        evalCyclesFiring: 3,
      }));
      const profile = computeAlertNoiseProfile(events, 100, 48);
      expect(profile.thresholdTuningCandidates).not.toContain('QuietAlert');
    });
  });

  describe('Alert Storm Condition', () => {
    it('noise_ratio > 5% → HALT (alert storm)', () => {
      const events: AlertFiringEvent[] = Array.from({ length: 10 }, (_, i) => ({
        alertname: 'StormAlert',
        group: 'guard' as const,
        firedAt: i,
        resolvedAt: i + 1,
        evalCyclesFiring: 3,
      }));
      // 10 events / 100 cycles = 10% noise ratio
      const profile = computeAlertNoiseProfile(events, 100, 48);
      expect(profile.alertStorm.detected).toBe(true);
      expect(profile.alertStorm.action).toContain('HALT');
    });

    it('fires/hour > 10 → HALT (alert storm)', () => {
      const events: AlertFiringEvent[] = Array.from({ length: 22 }, (_, i) => ({
        alertname: 'FrequentAlert',
        group: 'guard' as const,
        firedAt: i,
        resolvedAt: i + 1,
        evalCyclesFiring: 3,
      }));
      // 22 events / 2 hours = 11 fires/hour
      const profile = computeAlertNoiseProfile(events, 10000, 2);
      expect(profile.alertStorm.detected).toBe(true);
    });

    it('noise_ratio <= 5% AND fires/hour <= 10 → no storm', () => {
      const events: AlertFiringEvent[] = Array.from({ length: 4 }, (_, i) => ({
        alertname: 'NormalAlert',
        group: 'guard' as const,
        firedAt: i,
        resolvedAt: i + 1,
        evalCyclesFiring: 3,
      }));
      // 4 events / 100 cycles = 4%, 4/48h = 0.08/h
      const profile = computeAlertNoiseProfile(events, 100, 48);
      expect(profile.alertStorm.detected).toBe(false);
      expect(profile.alertStorm.action).toContain('OK');
    });

    it('storm action should include HALT for detected storms', () => {
      const events: AlertFiringEvent[] = Array.from({ length: 100 }, (_, i) => ({
        alertname: 'MassiveStorm',
        group: 'guard' as const,
        firedAt: i,
        resolvedAt: i + 1,
        evalCyclesFiring: 1,
      }));
      const profile = computeAlertNoiseProfile(events, 100, 1);
      expect(profile.alertStorm.detected).toBe(true);
      expect(profile.alertStorm.action).toContain('HALT');
      expect(profile.alertStorm.action).toContain('threshold tuning');
    });
  });
});
