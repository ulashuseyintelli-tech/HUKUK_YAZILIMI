/**
 * Simulation Engine Service
 * 
 * Phase 8 - Sprint 2B
 * 
 * Deterministic simulation engine.
 * Same (incidentId, scenarioId, seed) → same output.
 * 
 * Key guarantees:
 * - No Math.random() - uses seeded PRNG
 * - No Date.now() - uses injectable clock
 * - No setInterval - uses injectable scheduler
 * - Canonical hash of output is stable
 * - Uses drift-utils as SINGLE SOURCE OF TRUTH for drift calculation
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ISimulationEngine,
  ISimulationClock,
  SimulationInput,
  SimulationOutput,
  EvidenceChain,
  SIMULATION_VERSION,
} from './simulation.types';
import { mulberry32, generateRunId } from './determinism';
import { EvidenceGateService } from '../evidence/evidence-gate.service';
import { calculateDrift, DriftResult, DRIFT_THRESHOLD } from '../evidence/drift-utils';

@Injectable()
export class SimulationEngineService implements ISimulationEngine {
  private readonly logger = new Logger(SimulationEngineService.name);

  constructor(
    private readonly clock: ISimulationClock,
    private readonly evidenceGate: EvidenceGateService,
  ) {}

  async simulate(input: SimulationInput): Promise<SimulationOutput> {
    const startedAt = this.clock.now();
    
    // Create deterministic RNG (for future use in scenario generation)
    const _rng = mulberry32(input.seed);
    void _rng; // Suppress unused variable warning

    // Generate deterministic run ID
    const runId = generateRunId(
      input.incidentId,
      input.scenarioId,
      input.seed,
      SIMULATION_VERSION,
    );

    this.logger.debug('[SimulationEngine] Starting simulation', {
      runId,
      incidentId: input.incidentId,
      scenarioId: input.scenarioId,
      seed: input.seed,
    });

    // Use provided current snapshot or baseline as current
    const currentSnapshot = input.currentSnapshot || input.baselineSnapshot;

    // Evaluate evidence gate on current snapshot
    const gateResult = this.evidenceGate.evaluate(currentSnapshot);

    // Calculate drift using SINGLE SOURCE OF TRUTH (drift-utils)
    const driftResult = calculateDrift(input.baselineSnapshot, currentSnapshot);

    // Determine verdict
    const { verdict, verdictReason } = this.determineVerdict(
      gateResult.allowPromote,
      driftResult,
    );

    // Build evidence chain
    const evidenceChain: EvidenceChain = {
      baselineSnapshotId: input.baselineSnapshot.snapshotId,
      currentSnapshotId: currentSnapshot.snapshotId,
      driftResult,
      gateResult,
      verdict,
      verdictReason,
    };

    const finishedAt = this.clock.now();
    const computeTimeSec = (finishedAt.getTime() - startedAt.getTime()) / 1000;

    const output: SimulationOutput = {
      runId,
      incidentId: input.incidentId,
      tenantId: input.tenantId,
      scenarioId: input.scenarioId,
      seed: input.seed,
      baselineSnapshot: input.baselineSnapshot,
      currentSnapshot,
      evidenceChain,
      compute: {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        computeTimeSec,
        timedOut: false,
      },
      version: SIMULATION_VERSION,
    };

    this.logger.debug('[SimulationEngine] Simulation completed', {
      runId,
      verdict,
      driftScore: driftResult.driftScore,
      computeTimeSec,
    });

    return output;
  }

  /**
   * Determine simulation verdict
   * 
   * Priority order:
   * 1. Evidence gate (BLOCK_EVIDENCE) - highest priority
   * 2. Drift check (BLOCK_DRIFT)
   * 3. PROCEED
   */
  private determineVerdict(
    evidenceGateAllows: boolean,
    driftResult: DriftResult,
  ): { verdict: SimulationOutput['evidenceChain']['verdict']; verdictReason?: string } {
    // Evidence gate has priority (BLOCK_EVIDENCE)
    if (!evidenceGateAllows) {
      return {
        verdict: 'BLOCK_EVIDENCE',
        verdictReason: 'Evidence gate failed - snapshot quality insufficient',
      };
    }

    // Check drift (BLOCK_DRIFT)
    if (driftResult.shouldBlock) {
      if (driftResult.noComparableMetrics) {
        return {
          verdict: 'BLOCK_DRIFT',
          verdictReason: 'No comparable metrics between snapshots',
        };
      }
      return {
        verdict: 'BLOCK_DRIFT',
        verdictReason: `Drift score ${driftResult.driftScore.toFixed(3)} exceeds threshold ${DRIFT_THRESHOLD}`,
      };
    }

    return { verdict: 'PROCEED' };
  }
}
