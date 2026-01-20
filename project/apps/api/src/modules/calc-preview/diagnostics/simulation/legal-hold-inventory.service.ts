/**
 * Legal Hold Inventory Service
 * 
 * Phase 8 - Sprint 2E
 * Phase 9B.5 - Migrated to ISnapshotStore interface
 * Phase 9B.6 - Tenant-aware mutations + two-method list pattern
 * Phase 9B.6-LOCK - Uses centralized snapshot-ordering.ts comparators
 * Phase 10 - DB-backed archive state (durable, multi-instance safe)
 * 
 * Manages LEGAL_HOLD snapshot inventory.
 * Provides visibility and alerts for LEGAL_HOLD accumulation.
 * 
 * RULES:
 * - Baseline snapshots cannot be archived (IS_BASELINE error)
 * - Archive sets archived=true flag, does NOT change policy
 * - LEGAL_HOLD policy is never downgraded
 * - All public methods require tenantId (tenant isolation)
 * 
 * ARCHIVE SEMANTICS (Phase 10):
 * - Archive = soft-hide (DB flag: archivedAt)
 * - Legal hold state preserved (retentionPolicy stays LEGAL_HOLD)
 * - Archived snapshots excluded from listLegalHolds by default
 * - Archive is one-way (cannot unarchive)
 * - Durable across restarts and multi-instance deployments
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 * @see ./snapshot-ordering.ts
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { 
  ISnapshotStore, 
  SNAPSHOT_STORE,
  SimulationSnapshot,
} from '../persistence/snapshot-store.interface';
import { IIncidentStore } from './incident.types';
import { IClock } from '../evidence/clock.service';
import {
  LegalHoldEntry,
  LegalHoldStats,
  LegalHoldInventoryOptions,
  ArchiveLegalHoldResult,
  DEFAULT_LEGAL_HOLD_THRESHOLD,
} from './legal-hold-inventory.types';
import { sortForDisplay } from './snapshot-ordering';

@Injectable()
export class LegalHoldInventoryService {
  private readonly logger = new Logger(LegalHoldInventoryService.name);

  constructor(
    private readonly clock: IClock,
    @Inject(SNAPSHOT_STORE)
    private readonly snapshotStore: ISnapshotStore,
    private readonly incidentStore: IIncidentStore,
  ) {
    // Phase 10: Archive state is now DB-backed (durable)
    this.logger.log('[LegalHoldInventory] Archive state is DB-backed (Phase 10)');
  }

  /**
   * Validate tenantId is provided
   * 
   * @throws Error if tenantId is missing or empty
   */
  private validateTenantId(tenantId: string): void {
    if (!tenantId) {
      throw new Error('tenantId is required for legal hold operations');
    }
  }

  /**
   * Build LegalHoldEntry from snapshot
   */
  private async buildEntry(s: SimulationSnapshot): Promise<LegalHoldEntry> {
    const now = this.clock.now();
    const incident = await this.incidentStore.get(s.incidentId);
    const isBaseline = incident?.baselineSnapshotId === s.snapshotId;
    const createdAt = new Date(s.createdAt);
    const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    return {
      snapshotId: s.snapshotId,
      incidentId: s.incidentId,
      tenantId: s.tenantId,
      appliedAt: s.createdAt,
      ageDays: Math.floor(ageDays),
      isBaseline,
      archived: !!s.archivedAt, // Phase 10: Read from DB
      archivedAt: s.archivedAt,
      archivedBy: s.archivedBy,
      archivedReason: s.archivedReason,
    };
  }

  /**
   * Sort entries deterministically using centralized comparator
   * 
   * Order: createdAt DESC, snapshotId ASC (tie-breaker)
   * Uses sortForDisplay from snapshot-ordering.ts
   */
  private sortEntries(entries: LegalHoldEntry[]): LegalHoldEntry[] {
    // Map to OrderableSnapshot format for sorting
    const sortable = entries.map(e => ({
      snapshotId: e.snapshotId,
      createdAt: e.appliedAt,
      retentionPolicy: 'LEGAL_HOLD' as const, // All entries are LEGAL_HOLD
      _original: e,
    }));
    
    const sorted = sortForDisplay(sortable);
    return sorted.map(s => (s as any)._original as LegalHoldEntry);
  }

  // ============================================================================
  // List Methods (Two separate methods for clarity)
  // ============================================================================

  /**
   * List all LEGAL_HOLD snapshots for tenant (tenant-wide)
   * 
   * Use this for tenant-wide inventory views.
   * Results are sorted deterministically: createdAt DESC, snapshotId ASC
   * 
   * Phase 10: By default, excludes archived snapshots.
   * Archived snapshots are soft-hidden but still exist in DB.
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @returns Array of LegalHoldEntry (sorted, non-archived only)
   */
  async listLegalHolds(tenantId: string): Promise<LegalHoldEntry[]> {
    this.validateTenantId(tenantId);
    
    this.logger.debug('[LegalHoldInventory] Listing all legal holds', { 
      tenantId,
      timestamp: this.clock.nowIso(),
    });
    
    // Phase 10: findWithLegalHold excludes archived by default
    const legalHoldSnapshots = await this.snapshotStore.findWithLegalHold(tenantId);
    
    // Filter out archived snapshots (double-check in case store doesn't filter)
    const nonArchivedSnapshots = legalHoldSnapshots.filter(s => !s.archivedAt);
    
    const entries: LegalHoldEntry[] = [];
    for (const s of nonArchivedSnapshots) {
      entries.push(await this.buildEntry(s));
    }
    
    return this.sortEntries(entries);
  }

  /**
   * List LEGAL_HOLD snapshots for a specific incident
   * 
   * Use this for incident-scoped views.
   * Results are sorted deterministically: createdAt DESC, snapshotId ASC
   * 
   * Phase 10: By default, excludes archived snapshots.
   * 
   * WHY SEPARATE METHOD?
   * - Prevents "incidentId forgotten" bugs (silent tenant-wide query)
   * - Clear intent in audit logs
   * - Better performance (incident-scoped query)
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param incidentId Incident ID (required)
   * @returns Array of LegalHoldEntry (sorted, non-archived only)
   */
  async listLegalHoldsByIncident(tenantId: string, incidentId: string): Promise<LegalHoldEntry[]> {
    this.validateTenantId(tenantId);
    
    if (!incidentId) {
      throw new Error('incidentId is required for listLegalHoldsByIncident');
    }
    
    this.logger.debug('[LegalHoldInventory] Listing legal holds by incident', { 
      tenantId,
      incidentId,
      timestamp: this.clock.nowIso(),
    });
    
    // Get all snapshots for incident, filter to LEGAL_HOLD and non-archived
    const snapshots = await this.snapshotStore.findByIncidentId(tenantId, incidentId);
    const legalHoldSnapshots = snapshots.filter(
      s => s.retentionPolicy === 'LEGAL_HOLD' && !s.archivedAt
    );
    
    const entries: LegalHoldEntry[] = [];
    for (const s of legalHoldSnapshots) {
      entries.push(await this.buildEntry(s));
    }
    
    return this.sortEntries(entries);
  }

  // ============================================================================
  // Stats
  // ============================================================================

  /**
   * Get legal hold statistics
   * 
   * Uses store's getLegalHoldStats for efficient aggregation (prod path).
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param options Inventory options
   * @returns LegalHoldStats
   */
  async getStats(tenantId: string, options: LegalHoldInventoryOptions = {}): Promise<LegalHoldStats> {
    this.validateTenantId(tenantId);
    
    const threshold = options.alertThreshold ?? DEFAULT_LEGAL_HOLD_THRESHOLD;
    const storeStats = await this.snapshotStore.getLegalHoldStats(tenantId);

    // Build stats from store
    const stats: LegalHoldStats = {
      totalCount: storeStats.totalCount,
      byIncident: storeStats.byIncidentCount,
      oldestHoldAt: storeStats.oldestHoldAt,
      averageAgeDays: storeStats.averageAgeDays,
      incidentsExceedingThreshold: [],
    };

    // Check for incidents exceeding threshold
    for (const [incidentId, count] of Object.entries(stats.byIncident)) {
      if (count > threshold) {
        stats.incidentsExceedingThreshold.push(incidentId);
      }
    }

    return stats;
  }

  // ============================================================================
  // Archive Operations (Phase 10 - DB-backed)
  // ============================================================================

  /**
   * Archive a LEGAL_HOLD snapshot
   * 
   * Phase 10: Archive state is now persisted to database.
   * 
   * RULES:
   * - Only LEGAL_HOLD snapshots can be archived (NOT_LEGAL_HOLD error)
   * - Baseline snapshots cannot be archived (IS_BASELINE error)
   * - Archive sets archived=true flag, does NOT change retention policy
   * - Idempotent: archiving already archived snapshot is no-op
   * - Archive is one-way (cannot unarchive)
   * 
   * TENANT ISOLATION:
   * - Store enforces tenant isolation
   * - Tenant mismatch returns NOT_FOUND (no information leakage)
   * 
   * BASELINE CHECK:
   * - Baseline is determined by incident.baselineSnapshotId (not retentionPolicy)
   * - PROMOTED snapshots that are not baseline CAN be archived
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param snapshotId Snapshot ID to archive
   * @param actor Actor performing the archive (opsUserId or system)
   * @param reason Optional reason for archiving
   * @returns ArchiveLegalHoldResult
   */
  async archiveLegalHold(
    tenantId: string, 
    snapshotId: string,
    actor?: string,
    reason?: string,
  ): Promise<ArchiveLegalHoldResult> {
    this.validateTenantId(tenantId);
    
    // Get snapshot for baseline check (store handles tenant isolation)
    const snapshot = await this.snapshotStore.findById(snapshotId);
    
    if (!snapshot) {
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
        errorMessage: `Snapshot ${snapshotId} not found`,
      };
    }

    // TENANT ISOLATION: Verify tenant match
    if (snapshot.tenantId !== tenantId) {
      this.logger.warn('[LegalHoldInventory] Tenant mismatch on archive attempt (returning NOT_FOUND)', {
        requestedTenantId: tenantId,
        snapshotTenantId: snapshot.tenantId,
        snapshotId,
      });
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
        errorMessage: `Snapshot ${snapshotId} not found`,
      };
    }

    // Check if baseline (baseline is determined by incident.baselineSnapshotId)
    // This check is done here because store doesn't know about incident baseline
    const incident = await this.incidentStore.get(snapshot.incidentId);
    if (incident?.baselineSnapshotId === snapshotId) {
      this.logger.warn('[LegalHoldInventory] Cannot archive baseline snapshot', {
        tenantId,
        snapshotId,
        incidentId: snapshot.incidentId,
      });
      return {
        success: false,
        changed: false,
        error: 'IS_BASELINE',
        errorMessage: `Cannot archive baseline snapshot ${snapshotId}. Change baseline first.`,
      };
    }

    // Phase 10: Delegate to store for DB persistence
    const result = await this.snapshotStore.markArchived(tenantId, snapshotId, {
      archivedBy: actor ?? 'system',
      reason,
    });

    if (!result.success) {
      // Map store errors to service errors
      if (result.error === 'NOT_LEGAL_HOLD') {
        return {
          success: false,
          changed: false,
          error: 'NOT_LEGAL_HOLD',
          errorMessage: `Snapshot ${snapshotId} is not LEGAL_HOLD`,
        };
      }
      if (result.error === 'IS_BASELINE') {
        return {
          success: false,
          changed: false,
          error: 'IS_BASELINE',
          errorMessage: `Cannot archive baseline snapshot ${snapshotId}`,
        };
      }
      return {
        success: false,
        changed: false,
        error: result.error as any,
        errorMessage: `Failed to archive snapshot ${snapshotId}`,
      };
    }

    this.logger.debug('[LegalHoldInventory] Snapshot archived (DB-backed)', {
      tenantId,
      snapshotId,
      incidentId: snapshot.incidentId,
      archivedAt: result.archivedAt,
      archivedBy: actor,
    });

    return {
      success: true,
      changed: result.changed,
      archivedAt: result.archivedAt,
    };
  }

  /**
   * Check if snapshot is archived
   * 
   * Phase 10: Reads from DB via store.
   */
  async isArchived(snapshotId: string): Promise<boolean> {
    const snapshot = await this.snapshotStore.findById(snapshotId);
    return !!snapshot?.archivedAt;
  }

  // ============================================================================
  // Incident-Level Queries
  // ============================================================================

  /**
   * Get count of LEGAL_HOLD snapshots for an incident
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param incidentId Incident ID
   */
  async getIncidentLegalHoldCount(tenantId: string, incidentId: string): Promise<number> {
    this.validateTenantId(tenantId);
    
    const snapshots = await this.snapshotStore.findByIncidentId(tenantId, incidentId);
    return snapshots.filter(s => s.retentionPolicy === 'LEGAL_HOLD').length;
  }

  /**
   * Check if incident exceeds LEGAL_HOLD threshold
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param incidentId Incident ID
   * @param threshold Custom threshold (default: DEFAULT_LEGAL_HOLD_THRESHOLD)
   */
  async isIncidentExceedingThreshold(
    tenantId: string,
    incidentId: string,
    threshold: number = DEFAULT_LEGAL_HOLD_THRESHOLD,
  ): Promise<boolean> {
    this.validateTenantId(tenantId);
    
    const count = await this.getIncidentLegalHoldCount(tenantId, incidentId);
    return count > threshold;
  }

}
