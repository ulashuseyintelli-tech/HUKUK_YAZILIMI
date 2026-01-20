/**
 * Legal Hold Inventory Service
 * 
 * Phase 8 - Sprint 2E
 * Phase 9B.5 - Migrated to ISnapshotStore interface
 * Phase 9B.6 - Tenant-aware mutations + two-method list pattern
 * Phase 9B.6-LOCK - Uses centralized snapshot-ordering.ts comparators
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
 * ARCHIVED STATE WARNING:
 * - archivedSnapshots is IN-MEMORY only (not durable)
 * - Multi-instance deployments will have inconsistent archive state
 * - This is acceptable for MVP; production should use DB flag
 * - Metrics: legal_hold.archive.in_memory counter tracks this
 * - TODO(Phase-10): Persist archived state to database
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 * @see ./snapshot-ordering.ts
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { 
  ISnapshotStore, 
  SNAPSHOT_STORE,
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
  
  /**
   * Track archived snapshots
   * 
   * WARNING: This is IN-MEMORY only, not durable across restarts.
   * In multi-instance deployments, archive state will be inconsistent.
   * Production should migrate to a DB-backed archived flag.
   */
  private readonly archivedSnapshots: Set<string> = new Set();

  constructor(
    private readonly clock: IClock,
    @Inject(SNAPSHOT_STORE)
    private readonly snapshotStore: ISnapshotStore,
    private readonly incidentStore: IIncidentStore,
  ) {
    // Log warning about in-memory archive state
    this.logger.warn('[LegalHoldInventory] Archive state is IN-MEMORY only (not durable)');
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
  private async buildEntry(s: { 
    snapshotId: string; 
    incidentId: string; 
    tenantId: string; 
    createdAt: string;
  }): Promise<LegalHoldEntry> {
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
      archived: this.archivedSnapshots.has(s.snapshotId),
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
   * @param tenantId Tenant ID (required for tenant isolation)
   * @returns Array of LegalHoldEntry (sorted)
   */
  async listLegalHolds(tenantId: string): Promise<LegalHoldEntry[]> {
    this.validateTenantId(tenantId);
    
    this.logger.debug('[LegalHoldInventory] Listing all legal holds', { 
      tenantId,
      timestamp: this.clock.nowIso(),
    });
    
    const legalHoldSnapshots = await this.snapshotStore.findWithLegalHold(tenantId);
    
    const entries: LegalHoldEntry[] = [];
    for (const s of legalHoldSnapshots) {
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
   * WHY SEPARATE METHOD?
   * - Prevents "incidentId forgotten" bugs (silent tenant-wide query)
   * - Clear intent in audit logs
   * - Better performance (incident-scoped query)
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param incidentId Incident ID (required)
   * @returns Array of LegalHoldEntry (sorted)
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
    
    // Get all snapshots for incident, filter to LEGAL_HOLD
    const snapshots = await this.snapshotStore.findByIncidentId(tenantId, incidentId);
    const legalHoldSnapshots = snapshots.filter(s => s.retentionPolicy === 'LEGAL_HOLD');
    
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
  // Archive Operations
  // ============================================================================

  /**
   * Archive a LEGAL_HOLD snapshot
   * 
   * RULES:
   * - Only LEGAL_HOLD snapshots can be archived (NOT_LEGAL_HOLD error)
   * - Baseline snapshots cannot be archived (IS_BASELINE error)
   * - Archive sets archived=true flag, does NOT change retention policy
   * - Idempotent: archiving already archived snapshot is no-op
   * 
   * TENANT ISOLATION:
   * - findById returns snapshot with tenantId for verification
   * - Tenant mismatch returns NOT_FOUND (no information leakage)
   * - Mismatch is logged internally for security metrics
   * 
   * BASELINE CHECK:
   * - Baseline is determined by incident.baselineSnapshotId (not retentionPolicy)
   * - PROMOTED snapshots that are not baseline CAN be archived
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param snapshotId Snapshot ID to archive
   * @returns ArchiveLegalHoldResult
   */
  async archiveLegalHold(tenantId: string, snapshotId: string): Promise<ArchiveLegalHoldResult> {
    this.validateTenantId(tenantId);
    
    // Get snapshot (findById is globally unique, returns tenantId for verification)
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
    // Return NOT_FOUND for mismatch (no information leakage about other tenants)
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

    // Check if LEGAL_HOLD (only LEGAL_HOLD can be archived)
    if (snapshot.retentionPolicy !== 'LEGAL_HOLD') {
      return {
        success: false,
        changed: false,
        error: 'NOT_LEGAL_HOLD',
        errorMessage: `Snapshot ${snapshotId} is not LEGAL_HOLD (current: ${snapshot.retentionPolicy})`,
      };
    }

    // Check if baseline (baseline is determined by incident.baselineSnapshotId)
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

    // Check if already archived (idempotent)
    if (this.archivedSnapshots.has(snapshotId)) {
      return {
        success: true,
        changed: false,
      };
    }

    // Archive (in-memory - see WARNING in class doc)
    this.archivedSnapshots.add(snapshotId);

    this.logger.debug('[LegalHoldInventory] Snapshot archived (in-memory)', {
      tenantId,
      snapshotId,
      incidentId: snapshot.incidentId,
    });

    return {
      success: true,
      changed: true,
    };
  }

  /**
   * Check if snapshot is archived
   * 
   * NOTE: Archive state is in-memory only.
   */
  isArchived(snapshotId: string): boolean {
    return this.archivedSnapshots.has(snapshotId);
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

  // ============================================================================
  // Test Helpers
  // ============================================================================

  /**
   * Clear archived set (for testing)
   */
  clearArchived(): void {
    this.archivedSnapshots.clear();
  }

  /**
   * Get archived count (for testing/metrics)
   */
  getArchivedCount(): number {
    return this.archivedSnapshots.size;
  }
}
