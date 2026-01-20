/**
 * Baseline Resolver Service
 * 
 * Phase 8 - Sprint 2D
 * Phase 9B.5 - Migrated to ISnapshotStore interface
 * Phase 9B.6 - Tenant-aware mutations + deterministic selection
 * Phase 9B.6-LOCK - Uses centralized snapshot-ordering.ts comparators
 * 
 * Resolves baseline snapshot for drift comparison.
 * Applies LEGAL_HOLD protection to prevent "baseline deleted" scenario.
 * 
 * Selection priority (DETERMINISTIC):
 * 1. retentionPolicy: LEGAL_HOLD > PROMOTED > STANDARD
 * 2. createdAt DESC (newest first)
 * 3. snapshotId ASC (tie-breaker for determinism)
 * 
 * TENANT ISOLATION:
 * - All methods require tenantId
 * - Write operations verify tenant before mutation
 * - Tenant mismatch returns NOT_FOUND (no information leakage)
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 * @see ./snapshot-ordering.ts
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { 
  ISnapshotStore, 
  SimulationSnapshot,
  SNAPSHOT_STORE,
} from '../persistence/snapshot-store.interface';
import { 
  BaselineSelectionResult, 
  BaselineProtectionResult,
} from './incident.types';
import { selectBestBaseline } from './snapshot-ordering';

@Injectable()
export class BaselineResolverService {
  private readonly logger = new Logger(BaselineResolverService.name);

  constructor(
    @Inject(SNAPSHOT_STORE)
    private readonly snapshotStore: ISnapshotStore,
  ) {}

  /**
   * Select baseline snapshot for incident
   * 
   * DETERMINISTIC SELECTION (via snapshot-ordering.ts):
   * 1. retentionPolicy: LEGAL_HOLD > PROMOTED > STANDARD
   * 2. createdAt DESC (newest first)
   * 3. snapshotId ASC (tie-breaker)
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param incidentId Incident ID
   * @returns BaselineSelectionResult
   */
  async selectBaseline(tenantId: string, incidentId: string): Promise<BaselineSelectionResult> {
    this.validateTenantId(tenantId, 'selectBaseline');
    
    const snapshots = await this.snapshotStore.findByIncidentId(tenantId, incidentId);

    if (snapshots.length === 0) {
      this.logger.debug('[BaselineResolver] No snapshots found for incident', {
        tenantId,
        incidentId,
      });
      return {
        snapshotId: null,
        source: 'NONE',
        reason: 'No snapshots available for incident',
      };
    }

    // Use centralized comparator from snapshot-ordering.ts
    const baseline = selectBestBaseline(snapshots);
    
    if (!baseline) {
      return {
        snapshotId: null,
        source: 'NONE',
        reason: 'No snapshots available for incident',
      };
    }

    // Determine source based on policy
    const source = baseline.retentionPolicy === 'STANDARD' ? 'STANDARD' : 'PROMOTED';

    this.logger.debug('[BaselineResolver] Selected baseline', {
      tenantId,
      incidentId,
      snapshotId: baseline.snapshotId,
      policy: baseline.retentionPolicy,
      source,
    });

    return {
      snapshotId: baseline.snapshotId,
      source,
      policy: baseline.retentionPolicy,
      reason: source === 'PROMOTED' 
        ? 'Selected highest priority snapshot as baseline (LEGAL_HOLD/PROMOTED)'
        : 'Selected latest standard snapshot as baseline (no promoted available)',
    };
  }

  /**
   * Protect baseline snapshot with LEGAL_HOLD
   * 
   * Called at simulation start to prevent baseline deletion.
   * Idempotent: no-op if already LEGAL_HOLD.
   * 
   * TENANT ISOLATION:
   * - Verifies tenant before mutation
   * - Returns NOT_FOUND for tenant mismatch (no information leakage)
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param snapshotId Baseline snapshot ID
   * @returns BaselineProtectionResult
   */
  async protectBaseline(tenantId: string, snapshotId: string): Promise<BaselineProtectionResult> {
    this.validateTenantId(tenantId, 'protectBaseline');
    
    // Use tenant-aware applyLegalHold (returns NOT_FOUND for mismatch)
    const result = await this.snapshotStore.applyLegalHold(tenantId, snapshotId);

    if (!result.success) {
      this.logger.warn('[BaselineResolver] Failed to protect baseline', {
        tenantId,
        snapshotId,
        error: result.error,
      });
      return {
        success: false,
        changed: false,
        error: 'SNAPSHOT_NOT_FOUND',
        errorMessage: `Baseline snapshot ${snapshotId} not found`,
      };
    }

    if (result.changed) {
      this.logger.debug('[BaselineResolver] Baseline protected with LEGAL_HOLD', {
        tenantId,
        snapshotId,
        previousPolicy: result.previousPolicy,
      });
    } else {
      this.logger.debug('[BaselineResolver] Baseline already protected', {
        tenantId,
        snapshotId,
      });
    }

    const protectionResult: BaselineProtectionResult = {
      success: true,
      changed: result.changed,
    };
    
    if (result.previousPolicy !== undefined) {
      protectionResult.previousPolicy = result.previousPolicy;
    }
    
    return protectionResult;
  }

  /**
   * Select and protect baseline in one operation
   * 
   * Convenience method for simulation start:
   * 1. Select baseline (LEGAL_HOLD > PROMOTED > STANDARD)
   * 2. Apply LEGAL_HOLD protection
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param incidentId Incident ID
   * @returns Combined result
   */
  async selectAndProtectBaseline(tenantId: string, incidentId: string): Promise<{
    selection: BaselineSelectionResult;
    protection: BaselineProtectionResult | null;
  }> {
    this.validateTenantId(tenantId, 'selectAndProtectBaseline');
    
    const selection = await this.selectBaseline(tenantId, incidentId);

    if (!selection.snapshotId) {
      return {
        selection,
        protection: null,
      };
    }

    const protection = await this.protectBaseline(tenantId, selection.snapshotId);

    return {
      selection,
      protection,
    };
  }

  /**
   * Get baseline snapshot for incident
   * 
   * Returns the actual snapshot data, not just the ID.
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param incidentId Incident ID
   * @returns SimulationSnapshot or null
   */
  async getBaseline(tenantId: string, incidentId: string): Promise<SimulationSnapshot | null> {
    this.validateTenantId(tenantId, 'getBaseline');
    
    const selection = await this.selectBaseline(tenantId, incidentId);
    
    if (!selection.snapshotId) {
      return null;
    }

    const snapshot = await this.snapshotStore.findById(selection.snapshotId);
    
    // Defense in depth: verify tenant match
    if (snapshot && snapshot.tenantId !== tenantId) {
      this.logger.warn('[BaselineResolver] Tenant mismatch on baseline fetch', {
        tenantId,
        snapshotTenantId: snapshot.tenantId,
        snapshotId: selection.snapshotId,
      });
      return null;
    }
    
    return snapshot;
  }

  /**
   * Check if baseline exists and is protected
   * 
   * TENANT ISOLATION:
   * - Returns exists=false for tenant mismatch (no information leakage)
   * 
   * @param tenantId Tenant ID (required for tenant isolation)
   * @param snapshotId Baseline snapshot ID
   * @returns Protection status
   */
  async isBaselineProtected(tenantId: string, snapshotId: string): Promise<{
    exists: boolean;
    protected: boolean;
    policy?: string | undefined;
  }> {
    this.validateTenantId(tenantId, 'isBaselineProtected');
    
    const snapshot = await this.snapshotStore.findById(snapshotId);

    if (!snapshot) {
      return { exists: false, protected: false };
    }

    // Tenant isolation: treat mismatch as not found (security)
    if (snapshot.tenantId !== tenantId) {
      return { exists: false, protected: false };
    }

    return {
      exists: true,
      protected: snapshot.retentionPolicy === 'LEGAL_HOLD',
      policy: snapshot.retentionPolicy,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Validate tenantId is provided
   * 
   * @throws Error if tenantId is missing or empty
   */
  private validateTenantId(tenantId: string, methodName: string): void {
    if (!tenantId) {
      throw new Error(`tenantId is required for ${methodName}()`);
    }
  }
}
