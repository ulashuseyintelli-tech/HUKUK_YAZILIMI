/**
 * Baseline Resolver Service
 * 
 * Phase 8 - Sprint 2D
 * 
 * Resolves baseline snapshot for drift comparison.
 * Applies LEGAL_HOLD protection to prevent "baseline deleted" scenario.
 * 
 * Selection priority:
 * 1. Last PROMOTED snapshot (most reliable)
 * 2. Latest STANDARD snapshot (fallback)
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { ISnapshotStore, StoredSnapshot } from '../evidence/snapshot-store.types';
import { 
  BaselineSelectionResult, 
  BaselineProtectionResult,
} from './incident.types';

@Injectable()
export class BaselineResolverService {
  private readonly logger = new Logger(BaselineResolverService.name);

  constructor(private readonly snapshotStore: ISnapshotStore) {}

  /**
   * Select baseline snapshot for incident
   * 
   * Priority:
   * 1. Last PROMOTED snapshot (most reliable, explicitly approved)
   * 2. Latest STANDARD snapshot (fallback)
   * 
   * @param incidentId Incident ID
   * @returns BaselineSelectionResult
   */
  async selectBaseline(incidentId: string): Promise<BaselineSelectionResult> {
    const snapshots = await this.snapshotStore.listByIncident(incidentId);

    if (snapshots.length === 0) {
      this.logger.debug('[BaselineResolver] No snapshots found for incident', {
        incidentId,
      });
      return {
        snapshotId: null,
        source: 'NONE',
        reason: 'No snapshots available for incident',
      };
    }

    // Priority 1: Last PROMOTED snapshot
    const promotedSnapshots = snapshots.filter(
      (s) => s.retentionPolicy === 'PROMOTED' || s.retentionPolicy === 'LEGAL_HOLD'
    );
    
    if (promotedSnapshots.length > 0) {
      // Already sorted by capturedAt DESC, so first is latest
      const baseline = promotedSnapshots[0];
      this.logger.debug('[BaselineResolver] Selected PROMOTED baseline', {
        incidentId,
        snapshotId: baseline.snapshotId,
        policy: baseline.retentionPolicy,
      });
      return {
        snapshotId: baseline.snapshotId,
        source: 'PROMOTED',
        policy: baseline.retentionPolicy,
        reason: 'Selected last promoted/legal-hold snapshot as baseline',
      };
    }

    // Priority 2: Latest STANDARD snapshot (fallback)
    const standardSnapshots = snapshots.filter(
      (s) => s.retentionPolicy === 'STANDARD'
    );

    if (standardSnapshots.length > 0) {
      const baseline = standardSnapshots[0];
      this.logger.debug('[BaselineResolver] Selected STANDARD baseline (fallback)', {
        incidentId,
        snapshotId: baseline.snapshotId,
      });
      return {
        snapshotId: baseline.snapshotId,
        source: 'STANDARD',
        policy: baseline.retentionPolicy,
        reason: 'Selected latest standard snapshot as baseline (no promoted available)',
      };
    }

    // Should not reach here if snapshots.length > 0
    return {
      snapshotId: null,
      source: 'NONE',
      reason: 'No eligible snapshots found',
    };
  }

  /**
   * Protect baseline snapshot with LEGAL_HOLD
   * 
   * Called at simulation start to prevent baseline deletion.
   * Idempotent: no-op if already LEGAL_HOLD.
   * 
   * @param snapshotId Baseline snapshot ID
   * @returns BaselineProtectionResult
   */
  async protectBaseline(snapshotId: string): Promise<BaselineProtectionResult> {
    const result = await this.snapshotStore.applyLegalHold(snapshotId);

    if (!result.success) {
      this.logger.warn('[BaselineResolver] Failed to protect baseline', {
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
        snapshotId,
        previousPolicy: result.previousPolicy,
      });
    } else {
      this.logger.debug('[BaselineResolver] Baseline already protected', {
        snapshotId,
      });
    }

    return {
      success: true,
      changed: result.changed,
      previousPolicy: result.previousPolicy,
    };
  }

  /**
   * Select and protect baseline in one operation
   * 
   * Convenience method for simulation start:
   * 1. Select baseline (PROMOTED > STANDARD)
   * 2. Apply LEGAL_HOLD protection
   * 
   * @param incidentId Incident ID
   * @returns Combined result
   */
  async selectAndProtectBaseline(incidentId: string): Promise<{
    selection: BaselineSelectionResult;
    protection: BaselineProtectionResult | null;
  }> {
    const selection = await this.selectBaseline(incidentId);

    if (!selection.snapshotId) {
      return {
        selection,
        protection: null,
      };
    }

    const protection = await this.protectBaseline(selection.snapshotId);

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
   * @param incidentId Incident ID
   * @returns StoredSnapshot or null
   */
  async getBaseline(incidentId: string): Promise<StoredSnapshot | null> {
    const selection = await this.selectBaseline(incidentId);
    
    if (!selection.snapshotId) {
      return null;
    }

    return this.snapshotStore.get(selection.snapshotId);
  }

  /**
   * Check if baseline exists and is protected
   * 
   * @param snapshotId Baseline snapshot ID
   * @returns Protection status
   */
  async isBaselineProtected(snapshotId: string): Promise<{
    exists: boolean;
    protected: boolean;
    policy?: string;
  }> {
    const snapshot = await this.snapshotStore.get(snapshotId);

    if (!snapshot) {
      return { exists: false, protected: false };
    }

    return {
      exists: true,
      protected: snapshot.retentionPolicy === 'LEGAL_HOLD',
      policy: snapshot.retentionPolicy,
    };
  }
}
