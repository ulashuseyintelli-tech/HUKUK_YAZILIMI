/**
 * Simulation Run Store Service
 * 
 * Phase 9B - PostgreSQL Migration
 * 
 * Thin orchestration layer over ISimulationRunRepository.
 * NO business logic - all invariants enforced in repository layer.
 * 
 * Responsibilities:
 * - Delegation to repository
 * - Metrics emission
 * - Logging
 * 
 * LOCKED RULES:
 * - No Map, no in-memory storage
 * - No clear() method (test isolation via DB transactions)
 * - No business logic (repo handles invariants)
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  ISimulationRunRepository,
  SimulationRun,
  SimulationRunInput,
  SimulationRunStatus,
  PaginatedRunsResult,
  ListRunsOptions,
} from '../persistence/simulation-run-repository.interface';
import { RunSummaryDto, RunStatus } from './simulation.dto';

// ============================================================================
// Injection Token
// ============================================================================

export const SIMULATION_RUN_REPOSITORY = Symbol('SIMULATION_RUN_REPOSITORY');

// ============================================================================
// Legacy Interface (for backward compatibility during migration)
// ============================================================================

export interface StoredRun extends RunSummaryDto {
  incidentId: string;
  tenantId: string;
  evidenceStatus: 'PASSED' | 'FAILED';
  evidenceGateReason?: string | undefined;
  driftBlocked: boolean;
  baselineSnapshotId: string;
  currentSnapshotId: string;
}

export interface ISimulationRunStore {
  save(run: StoredRun): Promise<void>;
  get(runId: string): Promise<StoredRun | null>;
  listByIncident(
    incidentId: string,
    options?: { limit?: number; cursor?: string | undefined },
  ): Promise<{ runs: StoredRun[]; nextCursor?: string | undefined; hasMore: boolean }>;
  getLatestByIncident(incidentId: string): Promise<StoredRun | null>;
}

// ============================================================================
// Metrics Interface (placeholder for actual metrics implementation)
// ============================================================================

interface IMetricsEmitter {
  increment(metric: string, tags?: Record<string, string>): void;
  timing(metric: string, durationMs: number, tags?: Record<string, string>): void;
}

class NoOpMetricsEmitter implements IMetricsEmitter {
  increment(_metric: string, _tags?: Record<string, string>): void {}
  timing(_metric: string, _durationMs: number, _tags?: Record<string, string>): void {}
}

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class SimulationRunStoreService implements ISimulationRunStore {
  private readonly logger = new Logger(SimulationRunStoreService.name);
  private readonly metrics: IMetricsEmitter;

  constructor(
    @Inject(SIMULATION_RUN_REPOSITORY)
    private readonly repository: ISimulationRunRepository,
    metrics?: IMetricsEmitter,
  ) {
    this.metrics = metrics ?? new NoOpMetricsEmitter();
  }

  // ==========================================================================
  // Phase 9B - New Methods (Repository Delegation)
  // ==========================================================================

  /**
   * Start a new simulation run
   * 
   * Creates run with PENDING or RUNNING status.
   * Immutable fields locked on first insert.
   */
  async startRun(input: SimulationRunInput): Promise<SimulationRun> {
    const start = Date.now();
    
    try {
      const run = await this.repository.upsert(input);
      
      this.metrics.increment('truth_layer_run_started', {
        status: input.status,
        tenantId: input.tenantId,
      });
      this.metrics.timing('truth_layer_run_start_latency_ms', Date.now() - start);
      
      this.logger.debug('[SimulationRunStore] Run started', {
        runId: run.runId,
        incidentId: run.incidentId,
        status: run.status,
      });
      
      return run;
    } catch (error) {
      this.metrics.increment('truth_layer_run_start_error', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  /**
   * Complete a simulation run
   * 
   * Updates status to COMPLETED and optionally links current snapshot.
   */
  async completeRun(
    runId: string,
    finishedAt: string,
    currentSnapshotId?: string | undefined,
  ): Promise<void> {
    const start = Date.now();
    
    try {
      await this.repository.updateStatus(runId, 'COMPLETED', finishedAt);
      
      if (currentSnapshotId) {
        await this.repository.setCurrentSnapshot(runId, currentSnapshotId);
      }
      
      this.metrics.increment('truth_layer_run_completed');
      this.metrics.timing('truth_layer_run_complete_latency_ms', Date.now() - start);
      
      this.logger.debug('[SimulationRunStore] Run completed', {
        runId,
        currentSnapshotId,
      });
    } catch (error) {
      this.metrics.increment('truth_layer_run_complete_error', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  /**
   * Fail a simulation run
   * 
   * Updates status to FAILED with error info.
   */
  async failRun(
    runId: string,
    finishedAt: string,
    errorCode?: string | undefined,
    errorMessage?: string | undefined,
  ): Promise<void> {
    const start = Date.now();
    
    try {
      // First update status
      await this.repository.updateStatus(runId, 'FAILED', finishedAt);
      
      // Then update error info via upsert (only mutable fields change)
      const existing = await this.repository.findById(runId);
      if (existing) {
        await this.repository.upsert({
          ...existing,
          status: 'FAILED',
          finishedAt,
          errorCode,
          errorMessage,
        });
      }
      
      this.metrics.increment('truth_layer_run_failed', {
        errorCode: errorCode ?? 'unknown',
      });
      this.metrics.timing('truth_layer_run_fail_latency_ms', Date.now() - start);
      
      this.logger.debug('[SimulationRunStore] Run failed', {
        runId,
        errorCode,
      });
    } catch (error) {
      this.metrics.increment('truth_layer_run_fail_error', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  /**
   * Attach baseline snapshot to run
   * 
   * Requires run status = COMPLETED.
   * Validates incident/tenant match.
   */
  async attachBaseline(runId: string, snapshotId: string): Promise<void> {
    const start = Date.now();
    
    try {
      await this.repository.setBaselineSnapshot(runId, snapshotId);
      
      this.metrics.increment('truth_layer_baseline_attached');
      this.metrics.timing('truth_layer_baseline_attach_latency_ms', Date.now() - start);
      
      this.logger.debug('[SimulationRunStore] Baseline attached', {
        runId,
        snapshotId,
      });
    } catch (error) {
      this.metrics.increment('truth_layer_baseline_attach_error', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  /**
   * Attach current snapshot to run
   * 
   * Validates incident/tenant match.
   */
  async attachCurrentSnapshot(runId: string, snapshotId: string): Promise<void> {
    const start = Date.now();
    
    try {
      await this.repository.setCurrentSnapshot(runId, snapshotId);
      
      this.metrics.increment('truth_layer_current_snapshot_attached');
      this.metrics.timing('truth_layer_current_attach_latency_ms', Date.now() - start);
      
      this.logger.debug('[SimulationRunStore] Current snapshot attached', {
        runId,
        snapshotId,
      });
    } catch (error) {
      this.metrics.increment('truth_layer_current_attach_error', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  /**
   * Find run by ID
   */
  async findById(runId: string): Promise<SimulationRun | null> {
    return this.repository.findById(runId);
  }

  /**
   * Find runs by incident with pagination
   */
  async findByIncidentId(
    incidentId: string,
    options?: ListRunsOptions | undefined,
  ): Promise<PaginatedRunsResult> {
    return this.repository.findByIncidentId(incidentId, options);
  }

  /**
   * Find latest run for incident
   */
  async findLatestByIncidentId(incidentId: string): Promise<SimulationRun | null> {
    return this.repository.findLatestByIncidentId(incidentId);
  }

  // ==========================================================================
  // Legacy Interface (ISimulationRunStore) - Backward Compatibility
  // ==========================================================================

  /**
   * @deprecated Use startRun() instead
   */
  async save(run: StoredRun): Promise<void> {
    const input: SimulationRunInput = {
      runId: run.runId,
      tenantId: run.tenantId,
      incidentId: run.incidentId,
      scenarioId: run.scenarioId,
      seed: run.seed,
      simulationVersion: '1.0.0', // Default for legacy
      status: this.mapLegacyStatus(run.status),
      startedAt: run.createdAt,
    };
    
    const created = await this.repository.upsert(input);
    
    // Link snapshots if provided
    if (run.currentSnapshotId) {
      try {
        await this.repository.setCurrentSnapshot(created.runId, run.currentSnapshotId);
      } catch {
        // Snapshot may not exist yet in legacy flow
        this.logger.warn('[SimulationRunStore] Could not link current snapshot', {
          runId: created.runId,
          snapshotId: run.currentSnapshotId,
        });
      }
    }
    
    this.logger.debug('[SimulationRunStore] Legacy save completed', {
      runId: run.runId,
    });
  }

  /**
   * @deprecated Use findById() instead
   */
  async get(runId: string): Promise<StoredRun | null> {
    const run = await this.repository.findById(runId);
    if (!run) return null;
    
    return this.mapToStoredRun(run);
  }

  /**
   * @deprecated Use findByIncidentId() instead
   */
  async listByIncident(
    incidentId: string,
    options: { limit?: number; cursor?: string | undefined } = {},
  ): Promise<{ runs: StoredRun[]; nextCursor?: string | undefined; hasMore: boolean }> {
    const result = await this.repository.findByIncidentId(incidentId, options);
    
    return {
      runs: result.runs.map((r) => this.mapToStoredRun(r)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * @deprecated Use findLatestByIncidentId() instead
   */
  async getLatestByIncident(incidentId: string): Promise<StoredRun | null> {
    const run = await this.repository.findLatestByIncidentId(incidentId);
    if (!run) return null;
    
    return this.mapToStoredRun(run);
  }

  /**
   * @deprecated Use repository.updateStatus() instead
   */
  async updateStatus(runId: string, status: RunStatus): Promise<void> {
    await this.repository.updateStatus(runId, this.mapLegacyStatus(status));
    
    this.logger.debug('[SimulationRunStore] Legacy status update', {
      runId,
      status,
    });
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private mapLegacyStatus(status: RunStatus): SimulationRunStatus {
    switch (status) {
      case 'RUNNING':
        return 'RUNNING';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'FAILED':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  private mapToStoredRun(run: SimulationRun): StoredRun {
    return {
      runId: run.runId,
      incidentId: run.incidentId,
      tenantId: run.tenantId,
      scenarioId: run.scenarioId,
      seed: run.seed,
      verdict: 'PROCEED', // Default - actual verdict from snapshot
      driftScore: 0, // Default - actual score from snapshot
      createdAt: run.startedAt,
      status: this.mapToLegacyStatus(run.status),
      evidenceStatus: 'PASSED', // Default
      driftBlocked: false, // Default
      baselineSnapshotId: run.baselineSnapshotId ?? '',
      currentSnapshotId: run.currentSnapshotId ?? '',
    };
  }

  private mapToLegacyStatus(status: SimulationRunStatus): RunStatus {
    switch (status) {
      case 'PENDING':
      case 'RUNNING':
        return 'RUNNING';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'FAILED':
        return 'FAILED';
    }
  }
}
