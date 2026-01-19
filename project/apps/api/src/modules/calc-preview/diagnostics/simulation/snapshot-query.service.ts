/**
 * Snapshot Query Service
 * 
 * Phase 9B.5 - Query Facade
 * 
 * Read-only facade for snapshot queries.
 * Controllers use this instead of direct store access.
 * 
 * PURPOSE:
 * - Prevent architectural bypass (controller → store directly)
 * - Single point for tenantId enforcement
 * - Encapsulate baseline resolution + snapshot retrieval
 * - Convert SimulationSnapshot → EvidenceSnapshot for simulation engine
 * 
 * RULES:
 * - All methods require tenantId (no implicit context)
 * - Read-only operations only (no create/update/delete)
 * - Results sorted by createdAt DESC (DB order)
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { Injectable, Inject } from '@nestjs/common';
import {
  ISnapshotStore,
  SimulationSnapshot,
  SNAPSHOT_STORE,
} from '../persistence/snapshot-store.interface';
import { BaselineResolverService } from './baseline-resolver.service';
import { EvidenceSnapshotView } from '../diagnostics.types';
import { extractPoints } from './calc-result-projection';

/**
 * Result of getBaselineSnapshot operation
 */
export interface GetBaselineSnapshotResult {
  /** Baseline snapshot (null if not found) */
  snapshot: SimulationSnapshot | null;
  /** EvidenceSnapshotView for simulation engine (null if not found) */
  evidenceSnapshot: EvidenceSnapshotView | null;
  /** Selection source */
  source: 'PROMOTED' | 'STANDARD' | 'NONE';
  /** Selection reason */
  reason: string;
}

/**
 * Result of getLatestSnapshot operation
 */
export interface GetLatestSnapshotResult {
  /** Latest snapshot (null if not found) */
  snapshot: SimulationSnapshot | null;
  /** EvidenceSnapshotView for simulation engine (null if not found) */
  evidenceSnapshot: EvidenceSnapshotView | null;
}

@Injectable()
export class SnapshotQueryService {
  constructor(
    @Inject(SNAPSHOT_STORE)
    private readonly snapshotStore: ISnapshotStore,
    private readonly baselineResolver: BaselineResolverService,
  ) {}

  /**
   * Get baseline snapshot for incident
   * 
   * Uses BaselineResolver for selection logic, then fetches snapshot.
   * Returns both SimulationSnapshot and EvidenceSnapshot (for simulation engine).
   * 
   * @param tenantId Tenant ID (required)
   * @param incidentId Incident ID
   * @returns GetBaselineSnapshotResult
   */
  async getBaselineSnapshot(
    tenantId: string,
    incidentId: string,
  ): Promise<GetBaselineSnapshotResult> {
    this.validateTenantId(tenantId);

    const selection = await this.baselineResolver.selectBaseline(tenantId, incidentId);

    if (!selection.snapshotId) {
      return {
        snapshot: null,
        evidenceSnapshot: null,
        source: 'NONE',
        reason: selection.reason,
      };
    }

    const snapshot = await this.snapshotStore.findById(selection.snapshotId);

    // Verify tenant match (defense in depth)
    if (snapshot && snapshot.tenantId !== tenantId) {
      return {
        snapshot: null,
        evidenceSnapshot: null,
        source: 'NONE',
        reason: 'Tenant mismatch on baseline snapshot',
      };
    }

    return {
      snapshot,
      evidenceSnapshot: snapshot ? this.toEvidenceSnapshot(snapshot) : null,
      source: selection.source as 'PROMOTED' | 'STANDARD',
      reason: selection.reason,
    };
  }

  /**
   * Get snapshot by ID
   * 
   * @param tenantId Tenant ID (required for verification)
   * @param snapshotId Snapshot ID
   * @returns SimulationSnapshot or null
   */
  async getSnapshotById(
    tenantId: string,
    snapshotId: string,
  ): Promise<SimulationSnapshot | null> {
    this.validateTenantId(tenantId);

    const snapshot = await this.snapshotStore.findById(snapshotId);

    // Verify tenant match
    if (snapshot && snapshot.tenantId !== tenantId) {
      return null; // Don't leak existence
    }

    return snapshot;
  }

  /**
   * List snapshots for incident
   * 
   * Results sorted by createdAt DESC (newest first).
   * 
   * @param tenantId Tenant ID (required)
   * @param incidentId Incident ID
   * @returns Array of snapshots
   */
  async listByIncident(
    tenantId: string,
    incidentId: string,
  ): Promise<SimulationSnapshot[]> {
    this.validateTenantId(tenantId);

    return this.snapshotStore.findByIncidentId(tenantId, incidentId);
  }

  /**
   * Get latest snapshot for incident (current)
   * 
   * Returns both SimulationSnapshot and EvidenceSnapshot.
   * 
   * @param tenantId Tenant ID (required)
   * @param incidentId Incident ID
   * @returns GetLatestSnapshotResult
   */
  async getLatestSnapshot(
    tenantId: string,
    incidentId: string,
  ): Promise<GetLatestSnapshotResult> {
    this.validateTenantId(tenantId);

    const snapshots = await this.snapshotStore.findByIncidentId(tenantId, incidentId);
    
    // Already sorted by createdAt DESC, first is latest
    const snapshot = snapshots[0] ?? null;
    
    return {
      snapshot,
      evidenceSnapshot: snapshot ? this.toEvidenceSnapshot(snapshot) : null,
    };
  }

  /**
   * Validate tenantId is provided
   * 
   * @throws Error if tenantId is missing
   */
  private validateTenantId(tenantId: string): void {
    if (!tenantId) {
      throw new Error('tenantId is required for snapshot queries');
    }
  }

  /**
   * Convert SimulationSnapshot to EvidenceSnapshotView
   * 
   * ⚠️ VIEW ONLY - NOT PERSISTABLE
   * 
   * This is a read-only projection for SimulationEngine.
   * Do NOT persist this object - it lacks derived fields (trend, variance).
   * 
   * Mapped fields:
   * - snapshotId, tenantId, incidentId: direct copy
   * - capturedAt: from calcResult.capturedAt or fallback to createdAt
   * - points: extracted via projection (single source of truth = calcResult)
   * - promoted: derived from retentionPolicy (PROMOTED | LEGAL_HOLD = true)
   * 
   * NOT mapped (intentionally omitted):
   * - derived.trend, derived.variance: calculated by SimulationEngine at runtime
   * 
   * @param snapshot SimulationSnapshot from store
   * @returns EvidenceSnapshotView for simulation engine
   */
  private toEvidenceSnapshot(snapshot: SimulationSnapshot): EvidenceSnapshotView {
    const { points } = extractPoints(snapshot.calcResult);
    
    // Extract capturedAt from calcResult if available, otherwise use createdAt
    const calcResult = snapshot.calcResult as { capturedAt?: string } | null;
    const capturedAt = calcResult?.capturedAt ?? snapshot.createdAt;

    return {
      snapshotId: snapshot.snapshotId,
      tenantId: snapshot.tenantId,
      incidentId: snapshot.incidentId,
      capturedAt,
      points,
      promoted: snapshot.retentionPolicy === 'PROMOTED' || snapshot.retentionPolicy === 'LEGAL_HOLD',
      // NOTE: 'derived' is intentionally omitted - this is a VIEW, not persistable entity
      // SimulationEngine calculates trend/variance at runtime
    };
  }
}
