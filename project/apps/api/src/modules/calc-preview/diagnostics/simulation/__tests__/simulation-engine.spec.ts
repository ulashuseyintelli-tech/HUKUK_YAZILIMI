/**
 * Simulation Engine Tests
 * 
 * Phase 8 - Sprint 2A
 * 
 * Tests for deterministic simulation engine.
 * Key test: 10 runs with same seed → same hash
 */

import { SimulationEngineService } from '../simulation-engine.service';
import { FakeSimulationClock } from '../simulation-clock.service';
import { EvidenceGateService } from '../../evidence/evidence-gate.service';
import { MockClockService } from '../../evidence/clock.service';
import { canonicalHash } from '../determinism';
import { SimulationInput, SIMULATION_VERSION } from '../simulation.types';
import { EvidenceSnapshot, EvidencePoint } from '../../diagnostics.types';

describe('SimulationEngineService', () => {
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

  function createSnapshot(
    id: string,
    points: Partial<EvidencePoint>[],
    capturedAt?: Date,
  ): EvidenceSnapshot {
    return {
      snapshotId: id,
      tenantId: 'tenant-001',
      incidentId: 'incident-001',
      capturedAt: (capturedAt || baseTime).toISOString(),
      points: points.map((p) => ({
        metric: p.metric || 'error_rate',
        value: p.value ?? 0.05,
        unit: p.unit || '%',
        windowSec: p.windowSec ?? 300,
        confidence: p.confidence ?? 0.9,
        freshnessSec: p.freshnessSec ?? 30,
        source: p.source || 'prometheus',
        timestamp: (capturedAt || baseTime).toISOString(),
      })) as EvidencePoint[],
    };
  }

  function createInput(seed: number, baseline?: EvidenceSnapshot): SimulationInput {
    return {
      incidentId: 'incident-001',
      tenantId: 'tenant-001',
      scenarioId: 'scenario-001',
      seed,
      baselineSnapshot: baseline || createSnapshot('baseline-001', [
        { metric: 'error_rate', value: 0.05 },
        { metric: 'latency_p99', value: 150 },
        { metric: 'slo_burn_rate', value: 0.8 },
      ]),
    };
  }

  describe('Determinism', () => {
    it('should produce same runId for same inputs', async () => {
      const input = createInput(42);

      const result1 = await engine.simulate(input);
      const result2 = await engine.simulate(input);

      expect(result1.runId).toBe(result2.runId);
    });

    it('should produce different runId for different seeds', async () => {
      const input1 = createInput(42);
      const input2 = createInput(43);

      const result1 = await engine.simulate(input1);
      const result2 = await engine.simulate(input2);

      expect(result1.runId).not.toBe(result2.runId);
    });

    it('should produce same hash for 10 runs with same seed (KING TEST)', async () => {
      const input = createInput(12345);
      const hashes: string[] = [];

      for (let i = 0; i < 10; i++) {
        // Reset clock to same time for each run
        simulationClock.reset(baseTime);
        evidenceGateClock.setTime(baseTime);

        const result = await engine.simulate(input);

        // Hash the deterministic parts (exclude compute timestamps)
        const hashableResult = {
          runId: result.runId,
          incidentId: result.incidentId,
          tenantId: result.tenantId,
          scenarioId: result.scenarioId,
          seed: result.seed,
          evidenceChain: {
            baselineSnapshotId: result.evidenceChain.baselineSnapshotId,
            currentSnapshotId: result.evidenceChain.currentSnapshotId,
            driftResult: {
              driftScore: result.evidenceChain.driftResult.driftScore,
              shouldBlock: result.evidenceChain.driftResult.shouldBlock,
              noComparableMetrics: result.evidenceChain.driftResult.noComparableMetrics,
              topContributors: result.evidenceChain.driftResult.topContributors,
              commonMetrics: result.evidenceChain.driftResult.commonMetrics,
              missingInBaseline: result.evidenceChain.driftResult.missingInBaseline,
              missingInCurrent: result.evidenceChain.driftResult.missingInCurrent,
            },
            verdict: result.evidenceChain.verdict,
            verdictReason: result.evidenceChain.verdictReason,
          },
          version: result.version,
        };

        hashes.push(canonicalHash(hashableResult));
      }

      // All hashes should be identical
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });

    it('should produce different hash for different seeds', async () => {
      const input1 = createInput(42);
      const input2 = createInput(43);

      const result1 = await engine.simulate(input1);
      const result2 = await engine.simulate(input2);

      const hash1 = canonicalHash({ runId: result1.runId, seed: result1.seed });
      const hash2 = canonicalHash({ runId: result2.runId, seed: result2.seed });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Evidence Chain', () => {
    it('should build evidence chain with baseline and current snapshot', async () => {
      const baseline = createSnapshot('baseline-001', [
        { metric: 'error_rate', value: 0.05 },
      ]);
      const input = createInput(42, baseline);

      const result = await engine.simulate(input);

      expect(result.evidenceChain.baselineSnapshotId).toBe('baseline-001');
      expect(result.evidenceChain.currentSnapshotId).toBe('baseline-001'); // Same when no current provided
    });

    it('should calculate drift between baseline and current', async () => {
      const baseline = createSnapshot('baseline-001', [
        { metric: 'error_rate', value: 0.05 },
        { metric: 'latency_p99', value: 100 },
      ]);
      const current = createSnapshot('current-001', [
        { metric: 'error_rate', value: 0.06 }, // 20% drift
        { metric: 'latency_p99', value: 110 }, // 10% drift
      ]);

      const input: SimulationInput = {
        ...createInput(42, baseline),
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);

      expect(result.evidenceChain.driftResult.driftScore).toBeGreaterThan(0);
      expect(result.evidenceChain.driftResult.commonMetrics).toContain('error_rate');
      expect(result.evidenceChain.driftResult.commonMetrics).toContain('latency_p99');
    });

    it('should include top contributors sorted by weighted contribution', async () => {
      const baseline = createSnapshot('baseline-001', [
        { metric: 'error_rate', value: 0.05 },
        { metric: 'latency_p99', value: 100 },
        { metric: 'saturation_cpu', value: 0.5 },
      ]);
      const current = createSnapshot('current-001', [
        { metric: 'error_rate', value: 0.10 }, // 100% drift, weight 2.0
        { metric: 'latency_p99', value: 150 }, // 50% drift, weight 1.0
        { metric: 'saturation_cpu', value: 0.6 }, // 20% drift, weight 0.5
      ]);

      const input: SimulationInput = {
        ...createInput(42, baseline),
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);
      const contributors = result.evidenceChain.driftResult.topContributors;

      // Should be sorted by weighted contribution DESC
      expect(contributors[0].metric).toBe('error_rate'); // Highest weighted contribution
      for (let i = 1; i < contributors.length; i++) {
        expect(contributors[i - 1].weightedContribution)
          .toBeGreaterThanOrEqual(contributors[i].weightedContribution);
      }
    });

    it('should identify missing metrics', async () => {
      const baseline = createSnapshot('baseline-001', [
        { metric: 'error_rate', value: 0.05 },
        { metric: 'latency_p99', value: 100 },
      ]);
      const current = createSnapshot('current-001', [
        { metric: 'error_rate', value: 0.05 },
        { metric: 'slo_burn_rate', value: 0.8 }, // New metric
      ]);

      const input: SimulationInput = {
        ...createInput(42, baseline),
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);

      expect(result.evidenceChain.driftResult.missingInCurrent).toContain('latency_p99');
      expect(result.evidenceChain.driftResult.missingInBaseline).toContain('slo_burn_rate');
    });
  });

  describe('Verdict', () => {
    it('should return PROCEED when evidence gate passes and drift is low', async () => {
      const baseline = createSnapshot('baseline-001', [
        { metric: 'error_rate', value: 0.05, confidence: 0.9, freshnessSec: 30 },
      ]);

      const input = createInput(42, baseline);
      const result = await engine.simulate(input);

      expect(result.evidenceChain.verdict).toBe('PROCEED');
    });

    it('should return BLOCK_EVIDENCE when evidence gate fails', async () => {
      // Create stale snapshot (capturedAt > 60 seconds ago)
      const staleTime = new Date(baseTime.getTime() - 120 * 1000);
      const baseline = createSnapshot('baseline-001', [
        { metric: 'error_rate', value: 0.05 },
      ], staleTime);

      const input = createInput(42, baseline);
      const result = await engine.simulate(input);

      expect(result.evidenceChain.verdict).toBe('BLOCK_EVIDENCE');
      expect(result.evidenceChain.verdictReason).toContain('Evidence gate failed');
    });

    it('should return BLOCK_DRIFT when drift exceeds threshold', async () => {
      const baseline = createSnapshot('baseline-001', [
        { metric: 'error_rate', value: 0.01, confidence: 0.9, freshnessSec: 30 },
      ]);
      const current = createSnapshot('current-001', [
        { metric: 'error_rate', value: 0.10, confidence: 0.9, freshnessSec: 30 }, // 900% drift
      ]);

      const input: SimulationInput = {
        ...createInput(42, baseline),
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);

      expect(result.evidenceChain.verdict).toBe('BLOCK_DRIFT');
      expect(result.evidenceChain.verdictReason).toContain('exceeds threshold');
    });

    it('should return BLOCK_DRIFT when no comparable metrics', async () => {
      const baseline = createSnapshot('baseline-001', [
        { metric: 'error_rate', value: 0.05, confidence: 0.9, freshnessSec: 30 },
      ]);
      const current = createSnapshot('current-001', [
        { metric: 'latency_p99', value: 100, confidence: 0.9, freshnessSec: 30 },
      ]);

      const input: SimulationInput = {
        ...createInput(42, baseline),
        currentSnapshot: current,
      };

      const result = await engine.simulate(input);

      expect(result.evidenceChain.verdict).toBe('BLOCK_DRIFT');
      expect(result.evidenceChain.driftResult.noComparableMetrics).toBe(true);
    });
  });

  describe('Compute Info', () => {
    it('should include compute timestamps', async () => {
      const input = createInput(42);
      const result = await engine.simulate(input);

      expect(result.compute.startedAt).toBeDefined();
      expect(result.compute.finishedAt).toBeDefined();
      expect(result.compute.computeTimeSec).toBeGreaterThanOrEqual(0);
      expect(result.compute.timedOut).toBe(false);
    });

    it('should include version', async () => {
      const input = createInput(42);
      const result = await engine.simulate(input);

      expect(result.version).toBe(SIMULATION_VERSION);
    });
  });
});
