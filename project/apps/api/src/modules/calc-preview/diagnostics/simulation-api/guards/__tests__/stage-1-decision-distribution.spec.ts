/**
 * Stage-1 Shadow Decision Distribution Computation (Task 3.4)
 *
 * Validates decision distribution percentages, would-enforce rate,
 * peak enforcement rate, and blocking concern flag.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/requirements.md — R10.1–R10.3
 * @see .kiro/specs/stage-1-runtime-baseline/design.md — Baseline 2.4
 */

// ============================================================================
// Types
// ============================================================================

type DecisionType = 'ALLOW' | 'HOLD' | 'BLOCK_503';

interface DecisionSample {
  timestamp: number;
  decision: DecisionType;
  wouldEnforce: boolean;
}

interface DecisionDistribution {
  observationWindowHours: number;
  totalDecisions: number;
  distribution: Record<DecisionType, { count: number; percentage: number }>;
  wouldEnforceRate: number;
  peakEnforceRate5m: number;
  blockingConcern: boolean;
  blockingConcernReason?: string;
}

// ============================================================================
// Computation Functions
// ============================================================================

function computeDecisionDistribution(
  samples: DecisionSample[],
  observationWindowHours: number,
): DecisionDistribution {
  const total = samples.length;

  const counts: Record<DecisionType, number> = { ALLOW: 0, HOLD: 0, BLOCK_503: 0 };
  for (const s of samples) {
    counts[s.decision]++;
  }

  const distribution: Record<DecisionType, { count: number; percentage: number }> = {
    ALLOW: { count: counts.ALLOW, percentage: total > 0 ? (counts.ALLOW / total) * 100 : 0 },
    HOLD: { count: counts.HOLD, percentage: total > 0 ? (counts.HOLD / total) * 100 : 0 },
    BLOCK_503: { count: counts.BLOCK_503, percentage: total > 0 ? (counts.BLOCK_503 / total) * 100 : 0 },
  };

  // Would-enforce rate
  const wouldEnforceCount = samples.filter(s => s.wouldEnforce).length;
  const wouldEnforceRate = total > 0 ? wouldEnforceCount / total : 0;

  // Peak enforcement rate (5m window, assuming 1 sample per second → 300 samples per window)
  const windowSize = Math.min(300, total);
  let peakRate = 0;
  if (total > 0) {
    for (let i = 0; i <= total - windowSize; i++) {
      const windowSamples = samples.slice(i, i + windowSize);
      const windowEnforce = windowSamples.filter(s => s.wouldEnforce).length;
      const windowRate = windowEnforce / windowSize;
      peakRate = Math.max(peakRate, windowRate);
    }
    if (total < windowSize) {
      peakRate = wouldEnforceRate;
    }
  }

  // Blocking concern: would-enforce > 5%
  const blockingConcern = wouldEnforceRate > 0.05;

  return {
    observationWindowHours,
    totalDecisions: total,
    distribution,
    wouldEnforceRate,
    peakEnforceRate5m: peakRate,
    blockingConcern,
    blockingConcernReason: blockingConcern
      ? `Would-enforce rate ${(wouldEnforceRate * 100).toFixed(2)}% exceeds 5% threshold`
      : undefined,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-1 Decision Distribution (Task 3.4)', () => {
  describe('Distribution Percentages', () => {
    it('should compute ALLOW/HOLD/BLOCK_503 percentages', () => {
      const samples: DecisionSample[] = [
        { timestamp: 1, decision: 'ALLOW', wouldEnforce: false },
        { timestamp: 2, decision: 'ALLOW', wouldEnforce: false },
        { timestamp: 3, decision: 'ALLOW', wouldEnforce: false },
        { timestamp: 4, decision: 'HOLD', wouldEnforce: true },
        { timestamp: 5, decision: 'BLOCK_503', wouldEnforce: true },
      ];
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.distribution.ALLOW.percentage).toBe(60);
      expect(dist.distribution.HOLD.percentage).toBe(20);
      expect(dist.distribution.BLOCK_503.percentage).toBe(20);
    });

    it('should handle all-ALLOW distribution', () => {
      const samples: DecisionSample[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i,
        decision: 'ALLOW' as const,
        wouldEnforce: false,
      }));
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.distribution.ALLOW.percentage).toBe(100);
      expect(dist.distribution.HOLD.percentage).toBe(0);
      expect(dist.distribution.BLOCK_503.percentage).toBe(0);
    });

    it('should handle empty samples', () => {
      const dist = computeDecisionDistribution([], 48);
      expect(dist.totalDecisions).toBe(0);
      expect(dist.distribution.ALLOW.percentage).toBe(0);
    });

    it('should count total decisions', () => {
      const samples: DecisionSample[] = Array.from({ length: 50 }, (_, i) => ({
        timestamp: i,
        decision: 'ALLOW' as const,
        wouldEnforce: false,
      }));
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.totalDecisions).toBe(50);
    });
  });

  describe('Would-Enforce Rate', () => {
    it('should compute would-enforce rate correctly', () => {
      const samples: DecisionSample[] = [
        { timestamp: 1, decision: 'ALLOW', wouldEnforce: false },
        { timestamp: 2, decision: 'ALLOW', wouldEnforce: false },
        { timestamp: 3, decision: 'HOLD', wouldEnforce: true },
        { timestamp: 4, decision: 'ALLOW', wouldEnforce: false },
        { timestamp: 5, decision: 'BLOCK_503', wouldEnforce: true },
      ];
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.wouldEnforceRate).toBe(0.4);
    });

    it('should return 0 for no would-enforce decisions', () => {
      const samples: DecisionSample[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i,
        decision: 'ALLOW' as const,
        wouldEnforce: false,
      }));
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.wouldEnforceRate).toBe(0);
    });

    it('should return 1 for all would-enforce decisions', () => {
      const samples: DecisionSample[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i,
        decision: 'BLOCK_503' as const,
        wouldEnforce: true,
      }));
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.wouldEnforceRate).toBe(1);
    });
  });

  describe('Peak Enforcement Rate (5m window)', () => {
    it('should compute peak enforcement rate', () => {
      // 10 samples: first 5 all enforce, last 5 none
      const samples: DecisionSample[] = [
        ...Array.from({ length: 5 }, (_, i) => ({
          timestamp: i,
          decision: 'HOLD' as const,
          wouldEnforce: true,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          timestamp: i + 5,
          decision: 'ALLOW' as const,
          wouldEnforce: false,
        })),
      ];
      const dist = computeDecisionDistribution(samples, 48);
      // Overall rate = 50%, but peak window should be higher
      expect(dist.peakEnforceRate5m).toBeGreaterThanOrEqual(dist.wouldEnforceRate);
    });

    it('should handle small sample sets', () => {
      const samples: DecisionSample[] = [
        { timestamp: 1, decision: 'HOLD', wouldEnforce: true },
        { timestamp: 2, decision: 'ALLOW', wouldEnforce: false },
      ];
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.peakEnforceRate5m).toBe(0.5);
    });
  });

  describe('Blocking Concern Flag', () => {
    it('would-enforce > 5% → blocking concern', () => {
      const samples: DecisionSample[] = [
        ...Array.from({ length: 6 }, (_, i) => ({
          timestamp: i,
          decision: 'HOLD' as const,
          wouldEnforce: true,
        })),
        ...Array.from({ length: 94 }, (_, i) => ({
          timestamp: i + 6,
          decision: 'ALLOW' as const,
          wouldEnforce: false,
        })),
      ];
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.blockingConcern).toBe(true);
      expect(dist.blockingConcernReason).toContain('5%');
    });

    it('would-enforce <= 5% → no blocking concern', () => {
      const samples: DecisionSample[] = [
        ...Array.from({ length: 5 }, (_, i) => ({
          timestamp: i,
          decision: 'HOLD' as const,
          wouldEnforce: true,
        })),
        ...Array.from({ length: 95 }, (_, i) => ({
          timestamp: i + 5,
          decision: 'ALLOW' as const,
          wouldEnforce: false,
        })),
      ];
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.blockingConcern).toBe(false);
      expect(dist.blockingConcernReason).toBeUndefined();
    });

    it('would-enforce = 0% → no blocking concern', () => {
      const samples: DecisionSample[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i,
        decision: 'ALLOW' as const,
        wouldEnforce: false,
      }));
      const dist = computeDecisionDistribution(samples, 48);
      expect(dist.blockingConcern).toBe(false);
    });
  });

  describe('Observation Window', () => {
    it('should record observation window hours', () => {
      const dist = computeDecisionDistribution([], 48);
      expect(dist.observationWindowHours).toBe(48);
    });
  });
});
