/**
 * Snapshot Store Types
 * 
 * Phase 8 - Sprint 2C
 * 
 * SnapshotStore interface ve ilgili tipler.
 * 
 * NOTE: RetentionPolicy is imported from retention-policy.ts (SINGLE SOURCE OF TRUTH)
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { EvidenceSnapshot } from '../diagnostics.types';
import { RetentionPolicy, PolicyTransitionResult } from './retention-policy';

// Re-export for convenience
export { RetentionPolicy, PolicyTransitionResult } from './retention-policy';

/**
 * Stored snapshot with persistence metadata
 */
export interface StoredSnapshot extends EvidenceSnapshot {
  /** Persist time (when saved to store) */
  createdAt: string;
  /** Expiration time (null for LEGAL_HOLD) */
  expiresAt: string | null;
  /** First promote timestamp (null if never promoted) */
  promotedAt?: string;
  /** Current retention policy */
  retentionPolicy: RetentionPolicy;
  /** Whether snapshot is promoted (convenience flag) */
  promoted: boolean;
}

/**
 * Retention policy configuration
 */
export interface SnapshotRetentionConfig {
  /** Hours to retain non-promoted snapshots (default: 72) */
  snapshotRetentionHours: number;
  /** Hours to retain promoted snapshots (default: 168 = 7 days) */
  promotedSnapshotRetentionHours: number;
}

/**
 * Default retention configuration
 */
export const DEFAULT_RETENTION_CONFIG: SnapshotRetentionConfig = {
  snapshotRetentionHours: 72,
  promotedSnapshotRetentionHours: 168, // 7 days
};

/**
 * Result of markPromoted operation
 */
export interface MarkPromotedResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Whether policy actually changed */
  changed: boolean;
  /** Previous policy */
  previousPolicy: RetentionPolicy;
  /** New policy */
  newPolicy: RetentionPolicy;
  /** Promotion timestamp (if promoted) */
  promotedAt?: string;
  /** Error if operation failed */
  error?: 'SNAPSHOT_NOT_FOUND';
}

/**
 * Result of applyLegalHold operation
 */
export interface ApplyLegalHoldResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Whether policy actually changed */
  changed: boolean;
  /** Previous policy */
  previousPolicy: RetentionPolicy;
  /** New policy */
  newPolicy: RetentionPolicy;
  /** Error if operation failed */
  error?: 'SNAPSHOT_NOT_FOUND';
}

/**
 * Result of setRetentionPolicy operation
 */
export interface SetRetentionPolicyResult extends PolicyTransitionResult {
  /** New expiration time (if changed) */
  newExpiresAt?: string | null;
}

/**
 * SnapshotStore interface
 * 
 * Abstraction for snapshot persistence.
 * Sprint 1B: InMemory implementation
 * Sprint 2C: Enhanced with policy transition semantics
 * Future: DB/Redis adapter
 */
export interface ISnapshotStore {
  /**
   * Save snapshot to store
   * @returns snapshotId
   */
  save(snapshot: EvidenceSnapshot): Promise<string>;

  /**
   * Get snapshot by ID
   * @returns snapshot or null if not found/expired
   */
  get(snapshotId: string): Promise<StoredSnapshot | null>;

  /**
   * List snapshots by incident
   * @returns snapshots sorted by capturedAt DESC (newest first)
   */
  listByIncident(incidentId: string): Promise<StoredSnapshot[]>;

  /**
   * Mark snapshot as promoted
   * 
   * Semantics:
   * - Snapshot not found → error: SNAPSHOT_NOT_FOUND
   * - STANDARD → PROMOTED: success, changed=true, promotedAt set
   * - Already PROMOTED → success, changed=false (idempotent)
   * - LEGAL_HOLD → success, changed=false (LEGAL_HOLD > PROMOTED)
   * 
   * @returns MarkPromotedResult with success/changed/error
   */
  markPromoted(snapshotId: string): Promise<MarkPromotedResult>;

  /**
   * Apply legal hold to snapshot
   * 
   * Semantics:
   * - Snapshot not found → error: SNAPSHOT_NOT_FOUND
   * - Any policy → LEGAL_HOLD: success (upgrade always allowed)
   * - Already LEGAL_HOLD → success, changed=false (idempotent)
   * 
   * @returns ApplyLegalHoldResult with success/changed/error
   */
  applyLegalHold(snapshotId: string): Promise<ApplyLegalHoldResult>;

  /**
   * Set retention policy for snapshot
   * 
   * Semantics:
   * - Snapshot not found → error: SNAPSHOT_NOT_FOUND
   * - Upgrade (STANDARD→PROMOTED→LEGAL_HOLD) → success
   * - Same policy → success, changed=false (idempotent)
   * - Downgrade → error: RETENTION_DOWNGRADE_FORBIDDEN
   * 
   * @returns SetRetentionPolicyResult with success/changed/error
   */
  setRetentionPolicy(snapshotId: string, policy: RetentionPolicy): Promise<SetRetentionPolicyResult>;

  /**
   * Delete expired snapshots
   * 
   * Idempotent: calling twice returns 0 on second call.
   * LEGAL_HOLD snapshots are NEVER deleted by this method.
   * 
   * @param now Optional current time (for testing with FakeClock)
   * @returns number of deleted snapshots
   */
  deleteExpired(now?: Date): Promise<number>;

  /**
   * Get store statistics (for monitoring)
   */
  getStats(): Promise<{
    totalCount: number;
    promotedCount: number;
    expiredCount: number;
    legalHoldCount: number;
  }>;
}
