/**
 * Evidence Bundle Service
 * 
 * Phase 8 - Sprint 2E
 * 
 * Exports evidence bundles for audit trail and traceability.
 * 
 * RULE: contentHash is computed from payload only (not metadata)
 * This ensures same content = same hash regardless of export time/actor.
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { canonicalStringify, canonicalHash } from './determinism';
import { ISnapshotStore, StoredSnapshot } from '../evidence/snapshot-store.types';
import { IIncidentStore, Incident } from './incident.types';
import { IClock } from '../evidence/clock.service';
import {
  EvidenceBundle,
  EvidenceBundlePayload,
  EvidenceBundleMeta,
  DriftExplainability,
  RetentionState,
  ExportBundleOptions,
  ExportBundleResult,
  BUNDLE_FORMAT_VERSION,
} from './evidence-bundle.types';

@Injectable()
export class EvidenceBundleService {
  private readonly logger = new Logger(EvidenceBundleService.name);

  constructor(
    private readonly clock: IClock,
    private readonly incidentStore: IIncidentStore,
    private readonly snapshotStore: ISnapshotStore,
  ) {}

  /**
   * Export evidence bundle for an incident run
   * 
   * @param incidentId Incident ID
   * @param runId Run ID (optional, uses lastRun if not specified)
   * @param options Export options
   * @returns ExportBundleResult
   */
  async exportBundle(
    incidentId: string,
    runId?: string,
    options: ExportBundleOptions = {},
  ): Promise<ExportBundleResult> {
    const actor = options.actor || 'system';

    // Get incident
    const incident = await this.incidentStore.get(incidentId);
    if (!incident) {
      return {
        success: false,
        error: 'INCIDENT_NOT_FOUND',
        errorMessage: `Incident ${incidentId} not found`,
      };
    }

    // Get run data
    const lastRun = incident.lastRun;
    if (!lastRun) {
      return {
        success: false,
        error: 'NO_RUN_DATA',
        errorMessage: `No run data available for incident ${incidentId}`,
      };
    }

    // If runId specified, verify it matches
    if (runId && lastRun.runId !== runId) {
      return {
        success: false,
        error: 'NO_RUN_DATA',
        errorMessage: `Run ${runId} not found for incident ${incidentId}`,
      };
    }

    // Get snapshots
    const baselineSnapshot = await this.snapshotStore.get(lastRun.baselineSnapshotId);
    const currentSnapshot = await this.snapshotStore.get(lastRun.currentSnapshotId);

    if (!baselineSnapshot || !currentSnapshot) {
      return {
        success: false,
        error: 'SNAPSHOT_NOT_FOUND',
        errorMessage: 'Baseline or current snapshot not found',
      };
    }

    // Build payload
    const payload = this.buildPayload(incident, lastRun, baselineSnapshot, currentSnapshot);

    // Compute content hash (from payload only)
    const contentHash = canonicalHash(payload);

    // Build metadata
    const meta: EvidenceBundleMeta = {
      bundleId: `bundle_${randomUUID().substring(0, 8)}`,
      exportedAt: this.clock.nowIso(),
      exportedBy: actor,
      formatVersion: BUNDLE_FORMAT_VERSION,
    };

    const bundle: EvidenceBundle = {
      meta,
      payload,
      contentHash,
    };

    this.logger.debug('[EvidenceBundle] Bundle exported', {
      bundleId: meta.bundleId,
      incidentId,
      runId: lastRun.runId,
      contentHash,
    });

    return {
      success: true,
      bundle,
    };
  }

  /**
   * Verify bundle integrity
   * 
   * @param bundle Bundle to verify
   * @returns true if contentHash matches payload
   */
  verifyIntegrity(bundle: EvidenceBundle): boolean {
    const computedHash = canonicalHash(bundle.payload);
    return computedHash === bundle.contentHash;
  }

  /**
   * Get canonical JSON representation of bundle payload
   * 
   * Useful for external storage/transmission.
   */
  getCanonicalPayload(bundle: EvidenceBundle): string {
    return canonicalStringify(bundle.payload);
  }

  private buildPayload(
    incident: Incident,
    lastRun: NonNullable<Incident['lastRun']>,
    baselineSnapshot: StoredSnapshot,
    currentSnapshot: StoredSnapshot,
  ): EvidenceBundlePayload {
    // Build drift explainability
    const driftExplainability: DriftExplainability = {
      topContributors: [], // Would come from simulation output
      missingInBaseline: [],
      missingInCurrent: [],
      commonMetrics: this.extractCommonMetrics(baselineSnapshot, currentSnapshot),
      driftScore: lastRun.driftScore,
      driftBlocked: lastRun.driftBlocked,
    };

    // Build retention state
    const retentionState: RetentionState = {
      baselinePolicy: baselineSnapshot.retentionPolicy,
      currentPolicy: currentSnapshot.retentionPolicy,
      baselineProtected: baselineSnapshot.retentionPolicy === 'LEGAL_HOLD',
      currentProtected: currentSnapshot.retentionPolicy === 'LEGAL_HOLD',
    };

    // Build evidence chain (simplified - would come from simulation output)
    const evidenceChain = {
      baselineSnapshotId: baselineSnapshot.snapshotId,
      currentSnapshotId: currentSnapshot.snapshotId,
      driftResult: {
        driftScore: lastRun.driftScore,
        blocked: lastRun.driftBlocked,
        metricDrifts: [],
        missingInBaseline: [],
        missingInCurrent: [],
        commonMetrics: driftExplainability.commonMetrics,
        topContributors: [],
      },
      gateResult: {
        snapshotId: currentSnapshot.snapshotId,
        flags: lastRun.evidenceStatus === 'FAILED' ? ['STALE_EVIDENCE' as const] : [],
        allowAutoEscalation: lastRun.evidenceStatus === 'PASSED',
        allowPromote: lastRun.evidenceStatus === 'PASSED',
      },
      verdict: lastRun.verdict,
      verdictReason: lastRun.evidenceGateReason,
    };

    return {
      incidentId: incident.incidentId,
      runId: lastRun.runId,
      evidenceChain,
      baselineSnapshot,
      currentSnapshot,
      driftExplainability,
      retentionState,
    };
  }

  private extractCommonMetrics(
    baseline: StoredSnapshot,
    current: StoredSnapshot,
  ): string[] {
    const baselineMetrics = new Set(baseline.points.map(p => p.metric));
    const currentMetrics = new Set(current.points.map(p => p.metric));
    
    const common: string[] = [];
    for (const metric of baselineMetrics) {
      if (currentMetrics.has(metric)) {
        common.push(metric);
      }
    }
    
    return common.sort();
  }
}
