/**
 * Promote Service
 *
 * Sprint 3 - Task 2.2
 *
 * 10-step pipeline:
 *   feature flag → RBAC → rate limit → idempotency check →
 *   run lookup → fresh snapshot → stored evidence → drift calculate →
 *   Phase 7 request → audit log
 *
 * Promote = "produce execution request", NOT "execute".
 *
 * Idempotency: DB UNIQUE(incident_id, run_id) + INSERT-or-SELECT pattern.
 * Snapshot decision: commit-öncesi (CAS yapılan state + evidence) — deterministic replay.
 *
 * @see .kiro/specs/sprint-3-deploy-ready/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PromoteRequestStore } from './promote-request.store';
import { SimulationRunStoreService } from './simulation-run-store.service';
import { SimulationFeatureFlagService } from './simulation-feature-flag.service';
import { SimulationMetricsService } from './simulation-metrics.service';
import type { DriftResult } from '../evidence/drift-utils';
import type { MetricDrift } from '../evidence/drift-utils';
import {
  SimulationDisabledException,
  RunNotFoundException,
} from './simulation-error.types';
import { IClock } from '../evidence/clock.service';

// ============================================================================
// Result type
// ============================================================================

export type PromoteResult =
  | { status: 'ACCEPTED'; requestId: string; createdAt: string }
  | { status: 'ALREADY_PROMOTED'; requestId: string; createdAt: string }
  | { status: 'DRIFT_DETECTED'; driftScore: number; topContributors: MetricDrift[] };

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class PromoteService {
  private readonly logger = new Logger(PromoteService.name);

  constructor(
    private readonly featureFlag: SimulationFeatureFlagService,
    private readonly promoteStore: PromoteRequestStore,
    private readonly runStore: SimulationRunStoreService,
    private readonly metrics: SimulationMetricsService,
    private readonly _clock: IClock,
  ) {}

  /**
   * Promote pipeline — steps 4-12 (guards 1-3 handled by controller decorators).
   *
   * @throws SimulationDisabledException (503)
   * @throws RunNotFoundException (404 RUN_NOT_FOUND)
   */
  async promote(incidentId: string, runId: string, _actorId: string): Promise<PromoteResult> {
    // Step 1: Feature flag (belt-and-suspenders; guard also checks)
    if (!this.featureFlag.isSimulationEnabled()) {
      throw new SimulationDisabledException();
    }

    // Step 4: Idempotency — DB INSERT-or-SELECT (atomic, no TOCTOU)
    const requestId = randomUUID();
    const { record, isNew } = await this.promoteStore.claimOrGet(incidentId, runId, requestId);

    if (!isNew) {
      // Idempotent replay — return same requestId, no Phase 7 duplicate
      return {
        status: 'ALREADY_PROMOTED',
        requestId: record.requestId,
        createdAt: record.createdAt.toISOString(),
      };
    }

    // Step 5: Run lookup
    const run = await this.runStore.findById(runId);
    if (!run) {
      // Cleanup the claimed record since run doesn't exist
      await this.promoteStore.markFailed(incidentId, runId);
      throw new RunNotFoundException(runId);
    }

    // Steps 6-8: Snapshot — commit-öncesi (deterministic replay)
    // TODO: Wire SnapshotStore.getFreshSnapshot + getStoredEvidence
    // Canonical snapshot = taken just before CAS commit, not at request start
    const driftResult = this.calculateDriftPlaceholder();

    // Step 9: Drift guard
    if (driftResult.shouldBlock) {
      await this.promoteStore.markFailed(incidentId, runId);
      this.metrics.incDriftDetected(incidentId);
      this.metrics.incPromoteFailure('DRIFT_DETECTED');
      return {
        status: 'DRIFT_DETECTED',
        driftScore: driftResult.driftScore,
        topContributors: driftResult.topContributors,
      };
    }

    // Step 10: Phase 7 request (idempotent)
    // TODO: Emit to Phase 7 pipeline
    await this.promoteStore.markSucceeded(incidentId, runId);

    // Step 11: Metrics
    this.metrics.incPromoteSuccess();

    // Step 12: Audit (wired in Task 7.2 via SimulationAuditAdapter)
    this.logger.log('[PromoteService] Promote accepted', {
      incidentId,
      runId,
      requestId: record.requestId,
    });

    return {
      status: 'ACCEPTED',
      requestId: record.requestId,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /** Placeholder until snapshot wiring is complete */
  private calculateDriftPlaceholder(): DriftResult {
    return {
      driftScore: 0,
      shouldBlock: false,
      noComparableMetrics: false,
      commonMetrics: [],
      missingInBaseline: [],
      missingInCurrent: [],
      topContributors: [],
    };
  }
}
