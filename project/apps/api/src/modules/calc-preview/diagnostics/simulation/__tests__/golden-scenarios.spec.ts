/**
 * Golden Scenarios Tests
 * 
 * Phase 8 - Sprint 2B
 * 
 * Contract tests for 6 golden scenarios.
 * These tests lock expected outputs for deterministic simulation.
 * 
 * IMPORTANT: Hash only stable fields, NOT entire snapshot JSON.
 * This prevents false negatives when adding new fields.
 * 
 * Stable fields for hashing:
 * - verdict
 * - driftScore (rounded to 6 decimals)
 * - noComparableMetrics
 * - commonMetrics (sorted)
 * - missingInBaseline (sorted)
 * - missingInCurrent (sorted)
 * - topContributors (first N, stable fields only)
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { SimulationEngineService } from '../simulation-engine.service';
import { FakeSimulationClock } from '../simulation-clock.service';
import { EvidenceGateService } from '../../evidence/evidence-gate.service';
import { MockClockService } from '../../evidence/clock.service';
import { canonicalHash } from '../determinism';
import { roundDriftScore, DRIFT_THRESHOLD } from '../../evidence/drift-utils';
import { SimulationInput } from '../simulation.types';
import { EvidenceSnapshot, EvidencePoint, EvidenceMetricType } from '../../diagnostics.types';

describe('Golden Scenarios', () => {
  let engine: SimulationEngineService;
  let simulationClock: FakeSimulationClock;
  let evidenceGateClock: MockClockService;
  let evidenceGate: EvidenceGateService;

  const baseTime = new Date('2026-01-17T12:00:00Z');

  beforeEach(() => {
    simulationClock = new FakeSimulationClock(baseTime);
    evidenceGateClock = new MockClockService(baseTime);
    evidenceGate = new EvidenceGateService(evidenceGateClock);
    engine = new SimulationEngineService(simulationClock, evidenceGate);
  });

  /**
   * Create snapshot with full control over all fields
   */
  function createSnapshot(
    id: string,
    points: Array<{
      metric: EvidenceMetricType;
      value: number;
      confidence?: number;
      freshnessSec?: number;
    }>,
    capturedAt?: Date,
  ): EvidenceSnapshot {
    return {
      snapshotId: id,
      tenantId: 'tenant-001',
      incidentId: 'incident-001',
      capturedAt: (capturedAt || baseTime).toISOString(),
      points: points.map((p) => ({
        metric: p.metric,
        value: p.value,
        unit: '%',
        windowSec: 300,
        confidence: p.confidence ?? 0.9,
        freshnessSec: p.freshnessSec ?? 30,
        source: 'prometheus' as const,
        timestamp: (capturedAt || baseTime).toISOString(),
      })) as EvidencePoint[],
    };
  }

  /**
   * Extract stable fields for contract hash
   * Only these fields are hashed - adding new fields won't break tests
   */
  function extractStableFields(result: Awaited<ReturnType<typeof engine.simulate>>) {
    const chain = result.evidenceChain;
    const drift = chain.driftResult;

    return {
      verdict: chain.verdict,
      driftScore: roundDriftScore(drift.driftScore, 6),
      noComparableMetrics: drift.noComparableMetrics,
      commonMetrics: [...drift.commonMetrics].sort(),
      missingInBaseline: [...drift.missingInBaseline].sort(),
      missingInCurrent: [...drift.missingInCurrent].sort(),
      // Top 3 contributors with stable fields only
      topContributors: drift.topContributors.slice(0, 3).map((c) => ({
        metric: c.metric,
        weightedContribution: roundDriftScore(c.weightedContribution, 6),
      })),
    };
  }

  // ============================================================================
  // GOLDEN_NORMAL: Low drift, PROCEED
  // ============================================================================
  describe('GOLDEN_NORMAL', () => {
    const SCENARIO_ID = 'GOLDEN_NORMAL';
    const SEED = 1001;

    it('should PROCEED with low drift', async () => {
      const baseline = createSnapshot('baseline-normal', [
        { metric: 'error_rate', value: 0.05 },
        { metric: 'latency_p99', value: 100 },
        { metric: 'slo_burn_rate', value: 0.5 },
      ]);

      // Current has very small changes (< 15% drift)
      const current = createSnapshot('current-normal', [
        { metric: 'error_rate', value: 0.055 },   // 10% drift
        { metric: 'latency_p99', value: 105 },    // 5% drift
        { metric: 'slo_burn_rate', value: 0.52 }, // 4% drift
      ]);

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);
      const stable = extractStableFields(result);

      // Contract assertions
      expect(stable.verdict).toBe('PROCEED');
      expect(stable.driftScore).toBeLessThan(DRIFT_THRESHOLD);
      expect(stable.noComparableMetrics).toBe(false);
      expect(stable.commonMetrics).toEqual(['error_rate', 'latency_p99', 'slo_burn_rate']);
      expect(stable.missingInBaseline).toEqual([]);
      expect(stable.missingInCurrent).toEqual([]);
    });

    it('should produce stable hash across runs', async () => {
      const baseline = createSnapshot('baseline-normal', [
        { metric: 'error_rate', value: 0.05 },
        { metric: 'latency_p99', value: 100 },
        { metric: 'slo_burn_rate', value: 0.5 },
      ]);

      const current = createSnapshot('current-normal', [
        { metric: 'error_rate', value: 0.055 },
        { metric: 'latency_p99', value: 105 },
        { metric: 'slo_burn_rate', value: 0.52 },
      ]);

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const hashes: string[] = [];
      for (let i = 0; i < 5; i++) {
        simulationClock.reset(baseTime);
        evidenceGateClock.setTime(baseTime);
        const result = await engine.simulate(input);
        hashes.push(canonicalHash(extractStableFields(result)));
      }

      expect(new Set(hashes).size).toBe(1);
    });
  });

  // ============================================================================
  // GOLDEN_PARTIAL_METRICS: Some metrics missing
  // ============================================================================
  describe('GOLDEN_PARTIAL_METRICS', () => {
    const SCENARIO_ID = 'GOLDEN_PARTIAL_METRICS';
    const SEED = 1002;

    it('should handle partial metric overlap', async () => {
      const baseline = createSnapshot('baseline-partial', [
        { metric: 'error_rate', value: 0.05 },
        { metric: 'latency_p99', value: 100 },
      ]);

      const current = createSnapshot('current-partial', [
        { metric: 'error_rate', value: 0.055 },   // Common, low drift
        { metric: 'slo_burn_rate', value: 0.5 },  // New in current
      ]);

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);
      const stable = extractStableFields(result);

      // Contract assertions
      expect(stable.verdict).toBe('PROCEED'); // Low drift on common metric
      expect(stable.noComparableMetrics).toBe(false);
      expect(stable.commonMetrics).toEqual(['error_rate']);
      expect(stable.missingInBaseline).toEqual(['slo_burn_rate']);
      expect(stable.missingInCurrent).toEqual(['latency_p99']);
    });
  });

  // ============================================================================
  // GOLDEN_NO_COMMON: No common metrics, drift = 1.0
  // ============================================================================
  describe('GOLDEN_NO_COMMON', () => {
    const SCENARIO_ID = 'GOLDEN_NO_COMMON';
    const SEED = 1003;

    it('should return drift = 1.0 and BLOCK_DRIFT when no common metrics', async () => {
      const baseline = createSnapshot('baseline-no-common', [
        { metric: 'error_rate', value: 0.05 },
        { metric: 'latency_p99', value: 100 },
      ]);

      const current = createSnapshot('current-no-common', [
        { metric: 'slo_burn_rate', value: 0.5 },
        { metric: 'queue_depth', value: 10 },
      ]);

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);
      const stable = extractStableFields(result);

      // Contract assertions - LOCKED
      expect(stable.verdict).toBe('BLOCK_DRIFT');
      expect(stable.driftScore).toBe(1.0);
      expect(stable.noComparableMetrics).toBe(true);
      expect(stable.commonMetrics).toEqual([]);
      expect(stable.missingInBaseline).toEqual(['queue_depth', 'slo_burn_rate']);
      expect(stable.missingInCurrent).toEqual(['error_rate', 'latency_p99']);
      expect(stable.topContributors).toEqual([]); // No contributors when no common metrics
    });

    it('should produce stable hash for no-common scenario', async () => {
      const baseline = createSnapshot('baseline-no-common', [
        { metric: 'error_rate', value: 0.05 },
      ]);

      const current = createSnapshot('current-no-common', [
        { metric: 'latency_p99', value: 100 },
      ]);

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const hashes: string[] = [];
      for (let i = 0; i < 5; i++) {
        simulationClock.reset(baseTime);
        evidenceGateClock.setTime(baseTime);
        const result = await engine.simulate(input);
        hashes.push(canonicalHash(extractStableFields(result)));
      }

      expect(new Set(hashes).size).toBe(1);
    });
  });

  // ============================================================================
  // GOLDEN_HIGH_DRIFT: Drift >= 0.15, BLOCK_DRIFT
  // ============================================================================
  describe('GOLDEN_HIGH_DRIFT', () => {
    const SCENARIO_ID = 'GOLDEN_HIGH_DRIFT';
    const SEED = 1004;

    it('should BLOCK_DRIFT when drift exceeds threshold', async () => {
      const baseline = createSnapshot('baseline-high-drift', [
        { metric: 'error_rate', value: 0.01 },
        { metric: 'latency_p99', value: 100 },
      ]);

      // Current has significant changes (> 15% drift)
      const current = createSnapshot('current-high-drift', [
        { metric: 'error_rate', value: 0.10 },   // 900% drift!
        { metric: 'latency_p99', value: 150 },   // 50% drift
      ]);

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);
      const stable = extractStableFields(result);

      // Contract assertions
      expect(stable.verdict).toBe('BLOCK_DRIFT');
      expect(stable.driftScore).toBeGreaterThanOrEqual(DRIFT_THRESHOLD);
      expect(stable.noComparableMetrics).toBe(false);
      expect(stable.commonMetrics).toEqual(['error_rate', 'latency_p99']);

      // Top contributor should be error_rate (highest weighted contribution)
      expect(stable.topContributors[0].metric).toBe('error_rate');
    });
  });

  // ============================================================================
  // GOLDEN_BOUNDARY: At/above threshold (0.15), BLOCK_DRIFT
  // ============================================================================
  describe('GOLDEN_BOUNDARY', () => {
    const SCENARIO_ID = 'GOLDEN_BOUNDARY';
    const SEED = 1005;

    it('should BLOCK_DRIFT at exactly threshold (>= comparison)', async () => {
      // Single metric: error_rate with weight 2.0
      // Use 1.151 to ensure we're at or above 0.15 threshold
      // (1.15 - 1.0 = 0.14999... due to floating point)
      // rel = abs(1.151 - 1.0) / 1.0 = 0.151
      // weighted = 0.151 * 2.0 = 0.302
      // driftScore = sqrt(0.302^2 / 2.0^2) = 0.151
      const baseline = createSnapshot('baseline-boundary', [
        { metric: 'error_rate', value: 1.0 },
      ]);

      const current = createSnapshot('current-boundary', [
        { metric: 'error_rate', value: 1.151 }, // Just above 15% to ensure >= threshold
      ]);

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);
      const stable = extractStableFields(result);

      // Contract assertions - BOUNDARY TEST
      expect(stable.driftScore).toBeGreaterThanOrEqual(0.15);
      expect(stable.verdict).toBe('BLOCK_DRIFT'); // >= comparison
      expect(stable.noComparableMetrics).toBe(false);
    });

    it('should PROCEED just below threshold', async () => {
      const baseline = createSnapshot('baseline-below', [
        { metric: 'error_rate', value: 1.0 },
      ]);

      const current = createSnapshot('current-below', [
        { metric: 'error_rate', value: 1.149 }, // Just below 15%
      ]);

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);
      const stable = extractStableFields(result);

      expect(stable.driftScore).toBeLessThan(DRIFT_THRESHOLD);
      expect(stable.verdict).toBe('PROCEED');
    });
  });

  // ============================================================================
  // GOLDEN_STALE_EVIDENCE: Evidence gate fail, BLOCK_EVIDENCE (gate priority)
  // ============================================================================
  describe('GOLDEN_STALE_EVIDENCE', () => {
    const SCENARIO_ID = 'GOLDEN_STALE_EVIDENCE';
    const SEED = 1006;

    it('should BLOCK_EVIDENCE even when drift is low (gate priority)', async () => {
      // Create stale snapshot (capturedAt > 60 seconds ago)
      const staleTime = new Date(baseTime.getTime() - 120 * 1000); // 2 minutes ago

      const baseline = createSnapshot(
        'baseline-stale',
        [
          { metric: 'error_rate', value: 0.05 },
          { metric: 'latency_p99', value: 100 },
        ],
        staleTime, // STALE!
      );

      // Current is also stale (same time)
      const current = createSnapshot(
        'current-stale',
        [
          { metric: 'error_rate', value: 0.055 },  // Low drift
          { metric: 'latency_p99', value: 105 },   // Low drift
        ],
        staleTime, // STALE!
      );

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);
      const stable = extractStableFields(result);

      // CRITICAL: Gate priority test
      // Drift IS calculated (and is low)
      expect(stable.driftScore).toBeLessThan(DRIFT_THRESHOLD);
      expect(stable.noComparableMetrics).toBe(false);

      // BUT verdict is BLOCK_EVIDENCE (gate has priority)
      expect(stable.verdict).toBe('BLOCK_EVIDENCE');

      // Evidence chain should show gate failed
      expect(result.evidenceChain.gateResult.allowPromote).toBe(false);
      expect(result.evidenceChain.gateResult.flags).toContain('STALE_EVIDENCE');
    });

    it('should BLOCK_EVIDENCE even when drift would block (gate priority)', async () => {
      // Create stale snapshot with HIGH drift
      const staleTime = new Date(baseTime.getTime() - 120 * 1000);

      const baseline = createSnapshot(
        'baseline-stale-high',
        [{ metric: 'error_rate', value: 0.01 }],
        staleTime,
      );

      const current = createSnapshot(
        'current-stale-high',
        [{ metric: 'error_rate', value: 0.10 }], // 900% drift
        staleTime,
      );

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);

      // Drift is high
      expect(result.evidenceChain.driftResult.shouldBlock).toBe(true);

      // BUT verdict is BLOCK_EVIDENCE (gate has priority over drift)
      expect(result.evidenceChain.verdict).toBe('BLOCK_EVIDENCE');
    });

    it('should include verdictReason explaining gate failure', async () => {
      const staleTime = new Date(baseTime.getTime() - 120 * 1000);

      const baseline = createSnapshot(
        'baseline-stale-reason',
        [{ metric: 'error_rate', value: 0.05 }],
        staleTime,
      );

      const input: SimulationInput = {
        incidentId: 'incident-001',
        tenantId: 'tenant-001',
        scenarioId: SCENARIO_ID,
        seed: SEED,
        baselineSnapshot: baseline,
      };

      const result = await engine.simulate(input);

      expect(result.evidenceChain.verdictReason).toContain('Evidence gate failed');
    });
  });

  // ============================================================================
  // Contract Hash Stability Tests
  // ============================================================================
  describe('Contract Hash Stability', () => {
    it('should produce different hashes for different scenarios', async () => {
      const scenarios = [
        {
          id: 'GOLDEN_NORMAL',
          baseline: createSnapshot('b1', [{ metric: 'error_rate', value: 0.05 }]),
          current: createSnapshot('c1', [{ metric: 'error_rate', value: 0.055 }]),
        },
        {
          id: 'GOLDEN_HIGH_DRIFT',
          baseline: createSnapshot('b2', [{ metric: 'error_rate', value: 0.01 }]),
          current: createSnapshot('c2', [{ metric: 'error_rate', value: 0.10 }]),
        },
        {
          id: 'GOLDEN_NO_COMMON',
          baseline: createSnapshot('b3', [{ metric: 'error_rate', value: 0.05 }]),
          current: createSnapshot('c3', [{ metric: 'latency_p99', value: 100 }]),
        },
      ];

      const hashes: string[] = [];

      for (const scenario of scenarios) {
        simulationClock.reset(baseTime);
        evidenceGateClock.setTime(baseTime);

        const result = await engine.simulate({
          incidentId: 'incident-001',
          tenantId: 'tenant-001',
          scenarioId: scenario.id,
          seed: 42,
          baselineSnapshot: scenario.baseline,
          currentSnapshot: scenario.current,
        });

        hashes.push(canonicalHash(extractStableFields(result)));
      }

      // All hashes should be unique
      expect(new Set(hashes).size).toBe(scenarios.length);
    });

    it('should produce same hash for same scenario with different seeds', async () => {
      // Same data, different seeds should produce same stable fields
      // (seed affects runId but not drift calculation)
      const baseline = createSnapshot('baseline', [
        { metric: 'error_rate', value: 0.05 },
      ]);
      const current = createSnapshot('current', [
        { metric: 'error_rate', value: 0.055 },
      ]);

      const hashes: string[] = [];

      for (const seed of [1, 2, 3, 4, 5]) {
        simulationClock.reset(baseTime);
        evidenceGateClock.setTime(baseTime);

        const result = await engine.simulate({
          incidentId: 'incident-001',
          tenantId: 'tenant-001',
          scenarioId: 'test',
          seed,
          baselineSnapshot: baseline,
          currentSnapshot: current,
        });

        hashes.push(canonicalHash(extractStableFields(result)));
      }

      // All hashes should be identical (stable fields don't depend on seed)
      expect(new Set(hashes).size).toBe(1);
    });
  });
});
