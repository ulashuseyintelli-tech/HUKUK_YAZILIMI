/**
 * Simulation v1 Alias Controller
 *
 * Sprint 3 - Task 7.3
 *
 * Thin delegation layer: v1-prefixed routes → existing handlers.
 * No business logic. No DTO drift. Same guards, same service calls.
 *
 * Why separate controller?
 *   SimulationController uses @Controller('incidents') prefix.
 *   Adding 'v1/incidents/...' routes there would produce
 *   'incidents/v1/incidents/...' — broken.
 *   This controller uses @Controller() (no prefix) to own v1 paths.
 *
 * Rate limit bucket parity:
 *   Guard canActivate checks path.includes('/simulate').
 *   v1 alias uses '/simulations' (not '/simulate'), so guard auto-passes.
 *   Controller-level acquireToken uses (tenantId, incidentId, runId) —
 *   same keys regardless of route path → same bucket.
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md §1
 * @see .kiro/specs/sprint-3-deploy-ready/requirements.md Req 1
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Logger,
  Inject,
} from '@nestjs/common';
import { SimulationFeatureFlagGuard } from './guards/simulation-feature-flag.guard';
import { SimulationRBACGuard, SimulationTenant, SimulationTenantContext } from './guards/simulation-rbac.guard';
import { SimulationRateLimitGuard } from './guards/simulation-rate-limit.guard';
import { SimulationEngineService } from '../simulation/simulation-engine.service';
import { InMemoryIncidentStore } from '../simulation/incident-store.service';
import { SimulationRunStoreService, StoredRun } from './simulation-run-store.service';
import { SnapshotQueryService } from '../simulation/snapshot-query.service';
import { IClock } from '../evidence/clock.service';
import {
  SimulateRequestDto,
  SimulateResponseDto,
  RunDetailResponseDto,
} from './simulation.dto';
import {
  IncidentNotFoundException,
  RunNotFoundException,
  SimulationAlreadyRunningException,
  TooManySimulationsException,
} from './simulation-error.types';
import { generateRunId } from '../simulation/determinism';
import { SIMULATION_VERSION } from '../simulation/simulation.types';

// ============================================================================
// v1 Alias Controller — delegates to same services as SimulationController
// ============================================================================

@Controller()
export class SimulationV1AliasController {
  private readonly logger = new Logger(SimulationV1AliasController.name);

  constructor(
    @Inject('IClock') private readonly clock: IClock,
    private readonly simulationEngine: SimulationEngineService,
    private readonly incidentStore: InMemoryIncidentStore,
    private readonly runStore: SimulationRunStoreService,
    private readonly snapshotQuery: SnapshotQueryService,
    private readonly rateLimitGuard: SimulationRateLimitGuard,
  ) {}

  // ==========================================================================
  // POST /v1/incidents/:id/simulations  →  simulate()
  // ==========================================================================

  @Post('v1/incidents/:id/simulations')
  @UseGuards(SimulationFeatureFlagGuard, SimulationRBACGuard, SimulationRateLimitGuard)
  async simulate(
    @Param('id') incidentId: string,
    @Body() body: SimulateRequestDto = {},
    @SimulationTenant() ctx: SimulationTenantContext,
  ): Promise<SimulateResponseDto> {
    this.logger.debug('[v1Alias] POST /v1/incidents/:id/simulations → simulate()', {
      incidentId,
      tenantId: ctx.tenantId,
    });

    // --- identical logic to SimulationController.simulate() ---

    const incident = await this.incidentStore.get(incidentId);
    if (!incident) throw new IncidentNotFoundException(incidentId);
    if (incident.tenantId !== ctx.tenantId && ctx.role !== 'internal-ops') {
      throw new IncidentNotFoundException(incidentId);
    }

    const scenarioId = body.scenarioId || 'default';
    const seed = body.seed ?? Math.floor(Math.random() * 1000000);
    const runId = generateRunId(incidentId, scenarioId, seed, SIMULATION_VERSION);

    const acquireResult = await this.rateLimitGuard.acquireToken(ctx.tenantId, incidentId, runId);
    if (!acquireResult.acquired) {
      if (acquireResult.reason === 'ALREADY_RUNNING') {
        throw new SimulationAlreadyRunningException(incidentId);
      }
      throw new TooManySimulationsException(
        acquireResult.reason as 'concurrent' | 'incident' | 'daily',
        acquireResult.retryAfterSec,
      );
    }

    try {
      const baselineResult = await this.snapshotQuery.getBaselineSnapshot(ctx.tenantId, incidentId);
      if (!baselineResult.evidenceSnapshot) {
        const storedRun = await this.createFailedRun(
          runId, incidentId, ctx.tenantId, scenarioId, seed,
          baselineResult.reason || 'No baseline snapshot available',
        );
        return {
          runId: storedRun.runId, verdict: storedRun.verdict,
          driftScore: storedRun.driftScore, evidenceStatus: storedRun.evidenceStatus,
          driftBlocked: storedRun.driftBlocked, evidenceGateReason: storedRun.evidenceGateReason,
        };
      }

      const baselineSnapshot = baselineResult.evidenceSnapshot;
      const currentResult = await this.snapshotQuery.getLatestSnapshot(ctx.tenantId, incidentId);
      const currentSnapshot = currentResult.evidenceSnapshot || baselineSnapshot;

      const output = await this.simulationEngine.simulate({
        incidentId, tenantId: ctx.tenantId, scenarioId, seed,
        baselineSnapshot, currentSnapshot,
      });

      const storedRun: StoredRun = {
        runId: output.runId, incidentId, tenantId: ctx.tenantId, scenarioId, seed,
        verdict: output.evidenceChain.verdict,
        driftScore: output.evidenceChain.driftResult.driftScore,
        createdAt: output.compute.startedAt, status: 'COMPLETED',
        evidenceStatus: output.evidenceChain.gateResult.allowPromote ? 'PASSED' : 'FAILED',
        evidenceGateReason: output.evidenceChain.verdictReason,
        driftBlocked: output.evidenceChain.driftResult.shouldBlock,
        baselineSnapshotId: baselineSnapshot.snapshotId,
        currentSnapshotId: currentSnapshot.snapshotId,
      };

      await this.runStore.save(storedRun);
      await this.incidentStore.recordRun(incidentId, {
        runId: output.runId, verdict: output.evidenceChain.verdict,
        driftScore: output.evidenceChain.driftResult.driftScore,
        evidenceStatus: storedRun.evidenceStatus,
        evidenceGateReason: output.evidenceChain.verdictReason,
        driftBlocked: output.evidenceChain.driftResult.shouldBlock,
        baselineSnapshotId: baselineSnapshot.snapshotId,
        currentSnapshotId: currentSnapshot.snapshotId,
        runAt: output.compute.startedAt,
      });

      return {
        runId: output.runId, verdict: output.evidenceChain.verdict,
        driftScore: output.evidenceChain.driftResult.driftScore,
        evidenceStatus: storedRun.evidenceStatus,
        driftBlocked: output.evidenceChain.driftResult.shouldBlock,
        evidenceGateReason: output.evidenceChain.verdictReason,
      };
    } finally {
      await this.rateLimitGuard.releaseToken(ctx.tenantId, incidentId, runId);
    }
  }

  // ==========================================================================
  // GET /v1/incidents/:id/simulations/:runId  →  getRun()
  // ==========================================================================

  @Get('v1/incidents/:id/simulations/:runId')
  @UseGuards(SimulationRBACGuard)
  async getRun(
    @Param('id') incidentId: string,
    @Param('runId') runId: string,
    @SimulationTenant() ctx?: SimulationTenantContext,
  ): Promise<RunDetailResponseDto> {
    this.logger.debug('[v1Alias] GET /v1/incidents/:id/simulations/:runId → getRun()', {
      incidentId, runId,
    });

    const incident = await this.incidentStore.get(incidentId);
    if (!incident) throw new IncidentNotFoundException(incidentId);
    if (ctx && incident.tenantId !== ctx.tenantId && ctx.role !== 'internal-ops') {
      throw new IncidentNotFoundException(incidentId);
    }

    const run = await this.runStore.get(runId);
    if (!run || run.incidentId !== incidentId) throw new RunNotFoundException(runId);

    return {
      runId: run.runId, incidentId: run.incidentId, tenantId: run.tenantId,
      scenarioId: run.scenarioId, seed: run.seed, verdict: run.verdict,
      driftScore: run.driftScore, createdAt: run.createdAt, status: run.status,
      evidenceStatus: run.evidenceStatus, evidenceGateReason: run.evidenceGateReason,
      driftBlocked: run.driftBlocked, baselineSnapshotId: run.baselineSnapshotId,
      currentSnapshotId: run.currentSnapshotId,
    };
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private async createFailedRun(
    runId: string, incidentId: string, tenantId: string,
    scenarioId: string, seed: number, reason: string,
  ): Promise<StoredRun> {
    const now = this.clock.nowIso();
    const storedRun: StoredRun = {
      runId, incidentId, tenantId, scenarioId, seed,
      verdict: 'BLOCK_EVIDENCE', driftScore: 0, createdAt: now,
      status: 'FAILED', evidenceStatus: 'FAILED',
      evidenceGateReason: reason, driftBlocked: false,
      baselineSnapshotId: '', currentSnapshotId: '',
    };
    await this.runStore.save(storedRun);
    return storedRun;
  }
}
