/**
 * Legal Hold Inventory Service
 * 
 * Phase 8 - Sprint 2E
 * Phase 9B.5 - Migrated to ISnapshotStore interface
 * 
 * Manages LEGAL_HOLD snapshot inventory.
 * Provides visibility and alerts for LEGAL_HOLD accumulation.
 * 
 * RULES:
 * - Baseline snapshots cannot be archived (400 error)
 * - Archive sets archived=true flag, does NOT change policy
 * - LEGAL_HOLD policy is never downgraded
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
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

@Injectable()
export class LegalHoldInventoryService {
  private readonly logger = new Logger(LegalHoldInventoryService.name);
  
  // Track archived snapshots (in-memory for now)
  private readonly archivedSnapshots: Set<string> = new Set();

  constructor(
    private readonly clock: IClock,
    @Inject(SNAPSHOT_STORE)
    private readonly snapshotStore: ISnapshotStore,
    private readonly incidentStore: IIncidentStore,
  ) {}

  /**
   * Validate tenantId is provided
   * 
   * @throws Error if tenantId is missing
   */
  private validateTenantId(tenantId: string): void {
    if (!tenantId) {
      throw new Error('tenantId is required for legal hold operations');
    }
  }

  /**
   * List all LEGAL_HOLD snapshots
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param options Inventory options
   * @returns Array of LegalHoldEntry
   */
  async listLegalHolds(tenantId: string, _options: LegalHoldInventoryOptions = {}): Promise<LegalHoldEntry[]> {
    this.validateTenantId(tenantId);
    
    const now = this.clock.now();
    this.logger.debug('[LegalHoldInventory] Listing legal holds at', { timestamp: this.clock.nowIso() });
    
    const legalHoldSnapshots = await this.snapshotStore.findWithLegalHold(tenantId);
    
    // Get all incidents to check baseline status
    const entries: LegalHoldEntry[] = [];
    
    for (const s of legalHoldSnapshots) {
      const incident = await this.incidentStore.get(s.incidentId);
      const isBaseline = incident?.baselineSnapshotId === s.snapshotId;
      const createdAt = new Date(s.createdAt);
      const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      
      entries.push({
        snapshotId: s.snapshotId,
        incidentId: s.incidentId,
        tenantId: s.tenantId,
        appliedAt: s.createdAt, // Use createdAt as appliedAt (LEGAL_HOLD applied at creation or shortly after)
        ageDays: Math.floor(ageDays),
        isBaseline,
        archived: this.archivedSnapshots.has(s.snapshotId),
      });
    }
    
    return entries;
  }

  /**
   * Get legal hold statistics
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

  /**
   * Archive a LEGAL_HOLD snapshot
   * 
   * RULES:
   * - Baseline snapshots cannot be archived
   * - Archive sets archived=true flag, does NOT change policy
   * - Idempotent: archiving already archived snapshot is no-op
   * 
   * @param snapshotId Snapshot ID to archive
   * @returns ArchiveLegalHoldResult
   */
  async archiveLegalHold(snapshotId: string): Promise<ArchiveLegalHoldResult> {
    // Get snapshot
    const snapshot = await this.snapshotStore.findById(snapshotId);
    
    if (!snapshot) {
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
        errorMessage: `Snapshot ${snapshotId} not found`,
      };
    }

    // Check if LEGAL_HOLD
    if (snapshot.retentionPolicy !== 'LEGAL_HOLD') {
      return {
        success: false,
        changed: false,
        error: 'NOT_LEGAL_HOLD',
        errorMessage: `Snapshot ${snapshotId} is not LEGAL_HOLD (current: ${snapshot.retentionPolicy})`,
      };
    }

    // Check if baseline
    const incident = await this.incidentStore.get(snapshot.incidentId);
    if (incident?.baselineSnapshotId === snapshotId) {
      this.logger.warn('[LegalHoldInventory] Cannot archive baseline snapshot', {
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

    // Check if already archived
    if (this.archivedSnapshots.has(snapshotId)) {
      return {
        success: true,
        changed: false,
      };
    }

    // Archive
    this.archivedSnapshots.add(snapshotId);

    this.logger.debug('[LegalHoldInventory] Snapshot archived', {
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
   */
  isArchived(snapshotId: string): boolean {
    return this.archivedSnapshots.has(snapshotId);
  }

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

  /**
   * Clear archived set (for testing)
   */
  clearArchived(): void {
    this.archivedSnapshots.clear();
  }
}
