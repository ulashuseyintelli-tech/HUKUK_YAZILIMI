/**
 * Simulation Controller
 * 
 * Sprint 2F - Task 6.1-6.4
 * 
 * REST endpoints for simulation API:
 * - POST /incidents/:id/simulate
 * - GET /incidents/:id/runs
 * - GET /incidents/:id/runs/latest
 * - GET /incidents/:id/runs/:runId
 * 
 * Guards applied (in order):
 * 1. SimulationFeatureFlagGuard - 503 for mutations when disabled
 * 2. SimulationRBACGuard - 403 for wrong tenant
 * 3. SimulationRateLimitGuard - 429 for rate limit exceeded
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { SimulationFeatureFlagGuard } from './guards/simulation-feature-flag.guard';
import { SimulationRBACGuard, SimulationTenant, SimulationTenantContext } from './guards/simulation-rbac.guard';
import { SimulationRateLimitGuard } from './guards/simulation-rate-limit.guard';
import { SimulationEngineService } from '../simulation/simulation-engine.service';
import { InMemoryIncidentStore } from '../simulation/incident-store.service';
import { SimulationRunStoreService, StoredRun } from './simulation-run-store.service';
import { BaselineResolverService } from '../simulation/baseline-resolver.service';
import { InMemorySnapshotStore } from '../evidence/snapshot-store.service';
import { IClock } from '../evidence/clock.service';
import {
  SimulateRequestDto,
  SimulateResponseDto,
  RunListResponseDto,
  LatestRunResponseDto,
  RunDetailResponseDto,
  RunSummaryDto,
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
// Controller
// ============================================================================

@Controller('incidents')
export class SimulationController {
  private readonly logger = new Logger(SimulationController.name);

  constructor(
    private readonly clock: IClock,
    private readonly simulationEngine: SimulationEngineService,
    private readonly incidentStore: InMemoryIncidentStore,
    private readonly runStore: SimulationRunStoreService,
    private readonly baselineResolver: BaselineResolverService,
    private readonly snapshotStore: InMemorySnapshotStore,
    private readonly rateLimitGuard: SimulationRateLimitGuard,
  ) {}

  // ============================================================================
  // POST /incidents/:id/simulate
  // ============================================================================

  /**
   * Run a simulation for an incident
   * 
   * Guards: FeatureFlag (503), RBAC (403), RateLimit (429)
   * 
   * @param incidentId Incident ID
   * @param body Optional { scenarioId?, seed? }
   * @param ctx Tenant context from RBAC guard
   * @returns SimulateResponseDto
   */
  @Post(':id/simulate')
  @UseGuards(SimulationFeatureFlagGuard, SimulationRBACGuard, SimulationRateLimitGuard)
  async simulate(
    @Param('id') incidentId: string,
    @Body() body: SimulateRequestDto = {},
    @SimulationTenant() ctx: SimulationTenantContext,
  ): Promise<SimulateResponseDto> {
    this.logger.debug('[SimulationController] POST /simulate', {
      incidentId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      scenarioId: body.scenarioId,
    });

    // 1. Get incident
    const incident = await this.incidentStore.get(incidentId);
    if (!incident) {
      throw new IncidentNotFoundException(incidentId);
    }

    // 2. Verify tenant access
    if (incident.tenantId !== ctx.tenantId && ctx.role !== 'internal-ops') {
      throw new IncidentNotFoundException(incidentId); // Don't leak existence
    }

    // 3. Generate run ID
    const scenarioId = body.scenarioId || 'default';
    const seed = body.seed ?? Math.floor(Math.random() * 1000000);
    const runId = generateRunId(incidentId, scenarioId, seed, SIMULATION_VERSION);

    // 4. Acquire rate limit token
    const acquireResult = await this.rateLimitGuard.acquireToken(
      ctx.tenantId,
      incidentId,
      runId,
    );

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
      // 5. Resolve baseline
      const baselineResult = await this.baselineResolver.selectBaseline(incidentId);
      if (!baselineResult.snapshotId) {
        // No baseline available - create a minimal response
        const storedRun = await this.createFailedRun(
          runId,
          incidentId,
          ctx.tenantId,
          scenarioId,
          seed,
          'No baseline snapshot available',
        );

        return {
          runId: storedRun.runId,
          verdict: storedRun.verdict,
          driftScore: storedRun.driftScore,
          evidenceStatus: storedRun.evidenceStatus,
          driftBlocked: storedRun.driftBlocked,
          evidenceGateReason: storedRun.evidenceGateReason,
        };
      }

      // 6. Get baseline snapshot
      const baselineSnapshot = await this.snapshotStore.get(baselineResult.snapshotId);
      if (!baselineSnapshot) {
        throw new Error(`Baseline snapshot ${baselineResult.snapshotId} not found`);
      }

      // 7. Get current snapshot (latest for incident)
      const currentSnapshots = await this.snapshotStore.listByIncident(incidentId);
      const currentSnapshot = currentSnapshots[0] || baselineSnapshot;

      // 8. Run simulation
      const output = await this.simulationEngine.simulate({
        incidentId,
        tenantId: ctx.tenantId,
        scenarioId,
        seed,
        baselineSnapshot,
        currentSnapshot,
      });

      // 9. Store run result
      const storedRun: StoredRun = {
        runId: output.runId,
        incidentId,
        tenantId: ctx.tenantId,
        scenarioId,
        seed,
        verdict: output.evidenceChain.verdict,
        driftScore: output.evidenceChain.driftResult.driftScore,
        createdAt: output.compute.startedAt,
        status: 'COMPLETED',
        evidenceStatus: output.evidenceChain.gateResult.allowPromote ? 'PASSED' : 'FAILED',
        evidenceGateReason: output.evidenceChain.verdictReason,
        driftBlocked: output.evidenceChain.driftResult.shouldBlock,
        baselineSnapshotId: baselineSnapshot.snapshotId,
        currentSnapshotId: currentSnapshot.snapshotId,
      };

      await this.runStore.save(storedRun);

      // 10. Record run in incident
      await this.incidentStore.recordRun(incidentId, {
        runId: output.runId,
        verdict: output.evidenceChain.verdict,
        driftScore: output.evidenceChain.driftResult.driftScore,
        evidenceStatus: storedRun.evidenceStatus,
        evidenceGateReason: output.evidenceChain.verdictReason,
        driftBlocked: output.evidenceChain.driftResult.shouldBlock,
        baselineSnapshotId: baselineSnapshot.snapshotId,
        currentSnapshotId: currentSnapshot.snapshotId,
        runAt: output.compute.startedAt,
      });

      this.logger.debug('[SimulationController] Simulation completed', {
        runId: output.runId,
        verdict: output.evidenceChain.verdict,
        driftScore: output.evidenceChain.driftResult.driftScore,
      });

      return {
        runId: output.runId,
        verdict: output.evidenceChain.verdict,
        driftScore: output.evidenceChain.driftResult.driftScore,
        evidenceStatus: storedRun.evidenceStatus,
        driftBlocked: output.evidenceChain.driftResult.shouldBlock,
        evidenceGateReason: output.evidenceChain.verdictReason,
      };
    } finally {
      // Always release token
      await this.rateLimitGuard.releaseToken(ctx.tenantId, incidentId, runId);
    }
  }

  // ============================================================================
  // GET /incidents/:id/runs
  // ============================================================================

  /**
   * List simulation runs for an incident
   * 
   * Guards: RBAC (403)
   * 
   * @param incidentId Incident ID
   * @param limit Max results (default: 20)
   * @param cursor Pagination cursor
   * @param ctx Tenant context
   * @returns RunListResponseDto
   */
  @Get(':id/runs')
  @UseGuards(SimulationRBACGuard)
  async listRuns(
    @Param('id') incidentId: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
    @SimulationTenant() ctx?: SimulationTenantContext,
  ): Promise<RunListResponseDto> {
    this.logger.debug('[SimulationController] GET /runs', {
      incidentId,
      tenantId: ctx?.tenantId,
      limit: limitStr,
      cursor,
    });

    // Verify incident exists and tenant access
    const incident = await this.incidentStore.get(incidentId);
    if (!incident) {
      throw new IncidentNotFoundException(incidentId);
    }

    if (ctx && incident.tenantId !== ctx.tenantId && ctx.role !== 'internal-ops') {
      throw new IncidentNotFoundException(incidentId);
    }

    // Parse limit
    const limit = Math.min(Math.max(parseInt(limitStr || '20', 10) || 20, 1), 100);

    // Get runs
    const result = await this.runStore.listByIncident(incidentId, { limit, cursor });

    // Map to DTOs
    const runs: RunSummaryDto[] = result.runs.map(this.toRunSummaryDto);

    return {
      runs,
      pagination: {
        limit,
        cursor,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  // ============================================================================
  // GET /incidents/:id/runs/latest
  // ============================================================================

  /**
   * Get latest simulation run for an incident
   * 
   * Guards: RBAC (403)
   * 
   * RED LINE: Returns 200 + { latestRun: null } if no runs (NOT 404)
   * 
   * @param incidentId Incident ID
   * @param ctx Tenant context
   * @returns LatestRunResponseDto
   */
  @Get(':id/runs/latest')
  @UseGuards(SimulationRBACGuard)
  async getLatestRun(
    @Param('id') incidentId: string,
    @SimulationTenant() ctx?: SimulationTenantContext,
  ): Promise<LatestRunResponseDto> {
    this.logger.debug('[SimulationController] GET /runs/latest', {
      incidentId,
      tenantId: ctx?.tenantId,
    });

    // Verify incident exists and tenant access
    const incident = await this.incidentStore.get(incidentId);
    if (!incident) {
      throw new IncidentNotFoundException(incidentId);
    }

    if (ctx && incident.tenantId !== ctx.tenantId && ctx.role !== 'internal-ops') {
      throw new IncidentNotFoundException(incidentId);
    }

    // Get latest run
    const latestRun = await this.runStore.getLatestByIncident(incidentId);

    // RED LINE: 200 + null body if no runs
    return {
      latestRun: latestRun ? this.toRunSummaryDto(latestRun) : null,
    };
  }

  // ============================================================================
  // GET /incidents/:id/runs/:runId
  // ============================================================================

  /**
   * Get simulation run detail
   * 
   * Guards: RBAC (403)
   * 
   * @param incidentId Incident ID
   * @param runId Run ID
   * @param ctx Tenant context
   * @returns RunDetailResponseDto
   */
  @Get(':id/runs/:runId')
  @UseGuards(SimulationRBACGuard)
  async getRun(
    @Param('id') incidentId: string,
    @Param('runId') runId: string,
    @SimulationTenant() ctx?: SimulationTenantContext,
  ): Promise<RunDetailResponseDto> {
    this.logger.debug('[SimulationController] GET /runs/:runId', {
      incidentId,
      runId,
      tenantId: ctx?.tenantId,
    });

    // Verify incident exists and tenant access
    const incident = await this.incidentStore.get(incidentId);
    if (!incident) {
      throw new IncidentNotFoundException(incidentId);
    }

    if (ctx && incident.tenantId !== ctx.tenantId && ctx.role !== 'internal-ops') {
      throw new IncidentNotFoundException(incidentId);
    }

    // Get run
    const run = await this.runStore.get(runId);
    if (!run || run.incidentId !== incidentId) {
      throw new RunNotFoundException(runId);
    }

    return this.toRunDetailDto(run);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private toRunSummaryDto(run: StoredRun): RunSummaryDto {
    return {
      runId: run.runId,
      scenarioId: run.scenarioId,
      seed: run.seed,
      verdict: run.verdict,
      driftScore: run.driftScore,
      createdAt: run.createdAt,
      status: run.status,
    };
  }

  private toRunDetailDto(run: StoredRun): RunDetailResponseDto {
    return {
      runId: run.runId,
      incidentId: run.incidentId,
      tenantId: run.tenantId,
      scenarioId: run.scenarioId,
      seed: run.seed,
      verdict: run.verdict,
      driftScore: run.driftScore,
      createdAt: run.createdAt,
      status: run.status,
      evidenceStatus: run.evidenceStatus,
      evidenceGateReason: run.evidenceGateReason,
      driftBlocked: run.driftBlocked,
      baselineSnapshotId: run.baselineSnapshotId,
      currentSnapshotId: run.currentSnapshotId,
    };
  }

  private async createFailedRun(
    runId: string,
    incidentId: string,
    tenantId: string,
    scenarioId: string,
    seed: number,
    reason: string,
  ): Promise<StoredRun> {
    const now = this.clock.nowIso();
    const storedRun: StoredRun = {
      runId,
      incidentId,
      tenantId,
      scenarioId,
      seed,
      verdict: 'BLOCK_EVIDENCE',
      driftScore: 0,
      createdAt: now,
      status: 'FAILED',
      evidenceStatus: 'FAILED',
      evidenceGateReason: reason,
      driftBlocked: false,
      baselineSnapshotId: '',
      currentSnapshotId: '',
    };

    await this.runStore.save(storedRun);
    return storedRun;
  }
}
