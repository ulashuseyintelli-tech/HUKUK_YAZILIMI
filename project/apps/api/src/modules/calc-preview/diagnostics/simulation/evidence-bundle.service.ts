/**
 * Evidence Bundle Service
 * 
 * Phase 8 - Sprint 2E
 * Phase 9B.5 - Migrated to ISnapshotStore interface
 * Phase 9B.5+ - Uses extractPoints projection (calcResult is single source of truth)
 * Phase 9B.6 - Step 5: Tenant-aware export with verification
 * 
 * Exports evidence bundles for audit trail and traceability.
 * 
 * RULE: contentHash is computed from payload only (not metadata)
 * This ensures same content = same hash regardless of export time/actor.
 * 
 * RULE: points[] is derived from calcResult via extractPoints()
 * Do NOT store points[] separately - calcResult is the single source of truth.
 * 
 * TENANT ISOLATION:
 * - exportBundle requires tenantId for verification
 * - Tenant mismatch returns INCIDENT_NOT_FOUND (no information leakage)
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { canonicalStringify, canonicalHash } from './determinism';
import { 
  ISnapshotStore, 
  SimulationSnapshot,
  SNAPSHOT_STORE,
} from '../persistence/snapshot-store.interface';
import { IIncidentStore, Incident } from './incident.types';
import { IClock } from '../evidence/clock.service';
import { EvidenceChain } from './simulation.types';
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
import { extractPoints } from './calc-result-projection';

@Injectable()
export class EvidenceBundleService {
  private readonly logger = new Logger(EvidenceBundleService.name);

  constructor(
    private readonly clock: IClock,
    private readonly incidentStore: IIncidentStore,
    @Inject(SNAPSHOT_STORE)
    private readonly snapshotStore: ISnapshotStore,
  ) {}

  /**
   * Validate tenantId is provided
   * 
   * @throws Error if tenantId is missing or empty
   */
  private validateTenantId(tenantId: string): void {
    if (!tenantId) {
      throw new Error('tenantId is required for evidence bundle operations');
    }
  }

  /**
   * Export evidence bundle for an incident run
   * 
   * TENANT ISOLATION:
   * - tenantId is required for verification
   * - Tenant mismatch returns INCIDENT_NOT_FOUND (no information leakage)
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param incidentId Incident ID
   * @param runId Run ID (optional, uses lastRun if not specified)
   * @param options Export options
   * @returns ExportBundleResult
   */
  async exportBundle(
    tenantId: string,
    incidentId: string,
    runId?: string,
    options: ExportBundleOptions = {},
  ): Promise<ExportBundleResult> {
    this.validateTenantId(tenantId);
    
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

    // TENANT ISOLATION: Verify tenant match
    // Return INCIDENT_NOT_FOUND for mismatch (no information leakage)
    if (incident.tenantId !== tenantId) {
      this.logger.warn('[EvidenceBundle] Tenant mismatch on export attempt (returning INCIDENT_NOT_FOUND)', {
        requestedTenantId: tenantId,
        incidentTenantId: incident.tenantId,
        incidentId,
      });
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

    // Get snapshots using new interface
    const baselineSnapshot = await this.snapshotStore.findById(lastRun.baselineSnapshotId);
    const currentSnapshot = await this.snapshotStore.findById(lastRun.currentSnapshotId);

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
    baselineSnapshot: SimulationSnapshot,
    currentSnapshot: SimulationSnapshot,
  ): EvidenceBundlePayload {
    // Extract points from calcResult (single source of truth)
    const baselinePoints = extractPoints(baselineSnapshot.calcResult);
    const currentPoints = extractPoints(currentSnapshot.calcResult);
    
    // Get metric names for explainability
    const baselineMetrics = new Set(baselinePoints.points.map(p => p.metric));
    const currentMetrics = new Set(currentPoints.points.map(p => p.metric));
    
    // Calculate common/missing metrics
    const commonMetrics = [...baselineMetrics].filter(m => currentMetrics.has(m));
    const missingInBaseline = [...currentMetrics].filter(m => !baselineMetrics.has(m));
    const missingInCurrent = [...baselineMetrics].filter(m => !currentMetrics.has(m));

    // Build drift explainability
    const driftExplainability: DriftExplainability = {
      topContributors: [], // Would come from simulation output
      missingInBaseline,
      missingInCurrent,
      commonMetrics,
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
    const evidenceChain: EvidenceChain = {
      baselineSnapshotId: baselineSnapshot.snapshotId,
      currentSnapshotId: currentSnapshot.snapshotId,
      driftResult: {
        driftScore: lastRun.driftScore,
        shouldBlock: lastRun.driftBlocked,
        noComparableMetrics: commonMetrics.length === 0,
        commonMetrics: [],
        missingInBaseline,
        missingInCurrent,
        topContributors: [],
      },
      gateResult: {
        flags: lastRun.evidenceStatus === 'FAILED' ? ['STALE_EVIDENCE' as const] : [],
        allowAutoEscalation: lastRun.evidenceStatus === 'PASSED',
        allowPromote: lastRun.evidenceStatus === 'PASSED',
        snapshotAgeSec: 0,
        pointLevelFlags: [],
      },
      verdict: lastRun.verdict,
      verdictReason: lastRun.evidenceGateReason,
    };

    // Convert SimulationSnapshot to bundle format (compatible with StoredSnapshot)
    // points[] is extracted from calcResult via projection
    const baselineForBundle = {
      snapshotId: baselineSnapshot.snapshotId,
      tenantId: baselineSnapshot.tenantId,
      incidentId: baselineSnapshot.incidentId,
      capturedAt: baselineSnapshot.createdAt,
      points: baselinePoints.points,
      createdAt: baselineSnapshot.createdAt,
      expiresAt: baselineSnapshot.expiresAt ?? null,
      retentionPolicy: baselineSnapshot.retentionPolicy,
      promoted: baselineSnapshot.retentionPolicy === 'PROMOTED' || baselineSnapshot.retentionPolicy === 'LEGAL_HOLD',
    };

    const currentForBundle = {
      snapshotId: currentSnapshot.snapshotId,
      tenantId: currentSnapshot.tenantId,
      incidentId: currentSnapshot.incidentId,
      capturedAt: currentSnapshot.createdAt,
      points: currentPoints.points,
      createdAt: currentSnapshot.createdAt,
      expiresAt: currentSnapshot.expiresAt ?? null,
      retentionPolicy: currentSnapshot.retentionPolicy,
      promoted: currentSnapshot.retentionPolicy === 'PROMOTED' || currentSnapshot.retentionPolicy === 'LEGAL_HOLD',
    };

    return {
      incidentId: incident.incidentId,
      runId: lastRun.runId,
      evidenceChain,
      baselineSnapshot: baselineForBundle,
      currentSnapshot: currentForBundle,
      driftExplainability,
      retentionState,
    };
  }
}
