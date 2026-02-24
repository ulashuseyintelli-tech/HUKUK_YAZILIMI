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
import { SimulationAuditAdapter } from './simulation-audit.adapter';
import { calculateDrift } from '../evidence/drift-utils';
import type { DriftResult } from '../evidence/drift-utils';
import type { MetricDrift } from '../evidence/drift-utils';
import type { EvidenceSnapshot } from '../diagnostics.types';
import {
  SimulationDisabledException,
  RunNotFoundException,
  EvidenceNotFoundException,
  Phase7TimeoutError,
  Phase7PartialResponseError,
  Phase7TimeoutException,
  Phase7PartialResponseException,
} from './simulation-error.types';
import { IClock } from '../evidence/clock.service';
import { capturePhase7Config } from './phase7-config';
import { enforceGuardDecision } from './guards/guard-enforcement';
import { GuardOperation, type GuardDecisionSnapshot } from './guards/guard-policy-resolver.types';

// ============================================================================
// Result type
// ============================================================================

export type PromoteResult =
  | { status: 'ACCEPTED'; requestId: string; createdAt: string }
  | { status: 'ALREADY_PROMOTED'; requestId: string; createdAt: string }
  | { status: 'DRIFT_DETECTED'; driftScore: number; topContributors: MetricDrift[] }
  | { status: 'GUARD_BLOCKED'; guard: { decision: string; reason: string } };

// ============================================================================
// Snapshot Provider (injectable — InMemorySnapshotStore for now)
// ============================================================================

export interface ISnapshotProvider {
  getSnapshot(snapshotId: string): Promise<EvidenceSnapshot | null>;
}

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
    private readonly audit: SimulationAuditAdapter,
    private readonly clock: IClock,
    private readonly snapshotProvider: ISnapshotProvider,
  ) {}

  /**
   * Promote pipeline — steps 4-12 (guards 1-3 handled by controller decorators).
   *
   * @throws SimulationDisabledException (503)
   * @throws RunNotFoundException (404 RUN_NOT_FOUND)
   */
  async promote(
    incidentId: string,
    runId: string,
    _actorId: string,
    guardSnapshot?: GuardDecisionSnapshot,
  ): Promise<PromoteResult> {
    // Step 0: Guard enforcement (defense-in-depth — interceptor already short-circuits)
    const guardCheck = enforceGuardDecision(guardSnapshot, GuardOperation.PROMOTE);
    if (!guardCheck.allowed) {
      this.logger.debug('[PromoteService] Guard blocked', { reason: guardCheck.reason, decision: guardCheck.decision });
      try { this.metrics.incGuardHold(guardCheck.reason ?? 'UNKNOWN'); } catch { /* best-effort */ }
      return {
        status: 'GUARD_BLOCKED',
        guard: { decision: guardCheck.decision, reason: guardCheck.reason ?? 'UNKNOWN' },
      };
    }

    // Phase-7: Config snapshot — captured once, immutable for request lifetime
    const phase7Config = capturePhase7Config(this.clock.now());

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

    // Steps 6-8: Snapshot — baseline (stored) vs current (fresh)
    // Phase-7: Skip drift if disabled in config snapshot
    let driftResult: DriftResult;

    if (!phase7Config.phase7Enabled) {
      // Phase-7 disabled → no drift check, allow promote
      try { this.metrics.incPhase7Block('FEATURE_DISABLED'); } catch { /* best-effort */ }
      driftResult = {
        driftScore: 0,
        shouldBlock: false,
        noComparableMetrics: false,
        commonMetrics: [],
        missingInBaseline: [],
        missingInCurrent: [],
        topContributors: [],
      };
    } else {
      // Phase-7 enabled → real drift detection
      const baselineSnapshotId = run.baselineSnapshotId;
      if (!baselineSnapshotId) {
        await this.promoteStore.markFailed(incidentId, runId);
        throw new EvidenceNotFoundException(runId);
      }

      const baselineSnapshot = await this.snapshotProvider.getSnapshot(baselineSnapshotId);
      if (!baselineSnapshot) {
        await this.promoteStore.markFailed(incidentId, runId);
        throw new EvidenceNotFoundException(runId);
      }

      // Fetch fresh snapshot (F6/F7 fault surface)
      let currentSnapshot: EvidenceSnapshot;
      try {
        currentSnapshot = await this.fetchFreshSnapshot(run.currentSnapshotId, incidentId);
      } catch (err) {
        // F6/F7 → terminal (no retry per K1), mark row FAILED
        await this.promoteStore.markFailed(incidentId, runId);
        const isPartial = err instanceof Phase7PartialResponseError;
        try { this.metrics.incPhase7Fault(isPartial ? 'F7' : 'F6'); } catch { /* best-effort */ }
        try { this.metrics.incPromoteFailure(isPartial ? 'PHASE7_PARTIAL' : 'PHASE7_TIMEOUT'); } catch { /* best-effort */ }

        // Audit — forensic trace for Phase-7 fault
        try {
          this.audit.logSimulationEvent({
            eventId: record.requestId,
            eventType: 'PHASE7_FAULT',
            timestamp: this.clock.now().toISOString(),
            actorId: _actorId,
            incidentId,
            runId,
            requestId: record.requestId,
            detail: `Phase-7 fault: ${isPartial ? 'F7 partial response' : 'F6 fetch failed'}`,
          });
        } catch {
          // Fire-and-forget
        }

        if (isPartial) {
          throw new Phase7PartialResponseException(incidentId);
        }
        throw new Phase7TimeoutException(incidentId);
      }

      // Pure drift calculation — deterministic, no IO
      driftResult = calculateDrift(baselineSnapshot, currentSnapshot);
      try { this.metrics.incPhase7Evaluation(); } catch { /* best-effort */ }

      // Audit — Phase-7 evaluated
      try {
        this.audit.logSimulationEvent({
          eventId: record.requestId,
          eventType: 'PHASE7_EVALUATED',
          timestamp: this.clock.now().toISOString(),
          actorId: _actorId,
          incidentId,
          runId,
          requestId: record.requestId,
          detail: `Drift score: ${driftResult.driftScore}, threshold: ${phase7Config.driftThreshold}`,
        });
      } catch {
        // Fire-and-forget
      }

      // Override shouldBlock with config snapshot threshold
      driftResult = {
        ...driftResult,
        shouldBlock: driftResult.driftScore >= phase7Config.driftThreshold || driftResult.noComparableMetrics,
      };
    }

    // Step 9: Drift guard
    if (driftResult.shouldBlock) {
      await this.promoteStore.markFailed(incidentId, runId);
      try { this.metrics.incDriftDetected(incidentId); } catch { /* best-effort */ }
      try { this.metrics.incPromoteFailure('DRIFT_DETECTED'); } catch { /* best-effort */ }
      try { this.metrics.incPhase7Block('DRIFT'); } catch { /* best-effort */ }

      // Audit — forensic trace for drift block
      try {
        this.audit.logSimulationEvent({
          eventId: record.requestId,
          eventType: 'PROMOTE_DRIFT_BLOCKED',
          timestamp: this.clock.now().toISOString(),
          actorId: _actorId,
          incidentId,
          runId,
          requestId: record.requestId,
          detail: `Drift detected: score=${driftResult.driftScore}`,
        });
      } catch {
        // Fire-and-forget: audit failure must not block promote
      }

      return {
        status: 'DRIFT_DETECTED',
        driftScore: driftResult.driftScore,
        topContributors: driftResult.topContributors,
      };
    }

    // Step 10: Phase 7 request (idempotent)
    await this.promoteStore.markSucceeded(incidentId, runId);

    // Step 11: Metrics (best-effort — MI-1: failure must not change business outcome)
    try {
      this.metrics.incPromoteSuccess();
    } catch {
      // Swallow: metrics = best-effort, no retry, no error masking
    }

    // Step 12: Audit — forensic trace for accepted promote
    try {
      this.audit.logSimulationEvent({
        eventId: record.requestId,
        eventType: 'PROMOTE_ACCEPTED',
        timestamp: record.createdAt.toISOString(),
        actorId: _actorId,
        incidentId,
        runId,
        requestId: record.requestId,
        detail: `Promote accepted for run ${runId}`,
      });
    } catch {
      // Fire-and-forget: audit failure must not block promote
    }

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

  /**
   * Fetch fresh snapshot for drift comparison.
   *
   * F6/F7 fault surface — terminal, no retry (K1).
   * Currently backed by InMemorySnapshotStore (K4).
   *
   * @throws Phase7TimeoutError — snapshot not found or fetch failed (F6)
   * @throws Phase7PartialResponseError — snapshot missing required fields (F7)
   */
  private async fetchFreshSnapshot(
    currentSnapshotId: string | undefined,
    incidentId: string,
  ): Promise<EvidenceSnapshot> {
    if (!currentSnapshotId) {
      throw new Phase7TimeoutError(`No current snapshot ID for incident ${incidentId}`);
    }

    let snapshot: EvidenceSnapshot | null;
    try {
      snapshot = await this.snapshotProvider.getSnapshot(currentSnapshotId);
    } catch {
      // Store/network error → F6
      throw new Phase7TimeoutError(`Snapshot fetch failed for ${currentSnapshotId}`);
    }

    if (!snapshot) {
      // Snapshot not found → F6 (data source unavailable)
      throw new Phase7TimeoutError(`Snapshot ${currentSnapshotId} not found`);
    }

    // Validate required fields — missing points = F7
    if (!snapshot.points || snapshot.points.length === 0) {
      throw new Phase7PartialResponseError(`Snapshot ${currentSnapshotId} has no evidence points`);
    }

    return snapshot;
  }
}
