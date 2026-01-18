/**
 * Simulation Run Store Service
 * 
 * Sprint 2F - In-memory store for simulation runs
 * 
 * Stores run summaries for listing/retrieval.
 * Production adapter (DB) can be added later with same interface.
 */

import { Injectable, Logger } from '@nestjs/common';
import { IClock } from '../evidence/clock.service';
import { RunSummaryDto, RunStatus } from './simulation.dto';

// ============================================================================
// Types
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
// Implementation
// ============================================================================

@Injectable()
export class SimulationRunStoreService implements ISimulationRunStore {
  private readonly logger = new Logger(SimulationRunStoreService.name);
  private readonly store: Map<string, StoredRun> = new Map();
  private readonly byIncident: Map<string, string[]> = new Map(); // incidentId -> runIds (newest first)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_clock?: IClock) {
    // Clock reserved for future use (e.g., TTL-based cleanup)
  }

  async save(run: StoredRun): Promise<void> {
    this.store.set(run.runId, run);

    // Update incident index
    const incidentRuns = this.byIncident.get(run.incidentId) || [];
    // Insert at beginning (newest first)
    incidentRuns.unshift(run.runId);
    this.byIncident.set(run.incidentId, incidentRuns);

    this.logger.debug('[SimulationRunStore] Run saved', {
      runId: run.runId,
      incidentId: run.incidentId,
      verdict: run.verdict,
    });
  }

  async get(runId: string): Promise<StoredRun | null> {
    return this.store.get(runId) || null;
  }

  async listByIncident(
    incidentId: string,
    options: { limit?: number; cursor?: string | undefined } = {},
  ): Promise<{ runs: StoredRun[]; nextCursor?: string | undefined; hasMore: boolean }> {
    const limit = options.limit || 20;
    const runIds = this.byIncident.get(incidentId) || [];

    // Find start index from cursor
    let startIndex = 0;
    if (options.cursor) {
      const cursorIndex = runIds.indexOf(options.cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    // Get runs for this page
    const pageRunIds = runIds.slice(startIndex, startIndex + limit);
    const runs: StoredRun[] = [];

    for (const runId of pageRunIds) {
      const run = this.store.get(runId);
      if (run) {
        runs.push(run);
      }
    }

    // Determine if more exist
    const hasMore = startIndex + limit < runIds.length;
    const nextCursor = hasMore ? pageRunIds[pageRunIds.length - 1] : undefined;

    return { runs, nextCursor, hasMore };
  }

  async getLatestByIncident(incidentId: string): Promise<StoredRun | null> {
    const runIds = this.byIncident.get(incidentId) || [];
    if (runIds.length === 0) {
      return null;
    }

    return this.store.get(runIds[0]) || null;
  }

  /**
   * Update run status (for tracking running/completed/failed)
   */
  async updateStatus(runId: string, status: RunStatus): Promise<void> {
    const run = this.store.get(runId);
    if (run) {
      run.status = status;
      this.logger.debug('[SimulationRunStore] Run status updated', {
        runId,
        status,
      });
    }
  }

  /**
   * Clear all runs (for testing)
   */
  clear(): void {
    this.store.clear();
    this.byIncident.clear();
  }

  /**
   * Get store size (for testing)
   */
  size(): number {
    return this.store.size;
  }
}
