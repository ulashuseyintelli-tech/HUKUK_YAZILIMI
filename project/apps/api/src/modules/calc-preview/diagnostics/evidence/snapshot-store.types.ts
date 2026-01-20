/**
 * Snapshot Store Types (LEGACY)
 * 
 * Phase 8 - Sprint 2C
 * 
 * @deprecated Phase 9B.5 - MIGRATION COMPLETE
 * 
 * ⚠️  DO NOT USE ISnapshotStore FROM THIS FILE  ⚠️
 * 
 * Use ISnapshotStore from persistence/snapshot-store.interface.ts instead.
 * This file exports ILegacySnapshotStore for backward compatibility ONLY.
 * 
 * COMPILE-TIME ENFORCEMENT:
 * - ISnapshotStore is renamed to ILegacySnapshotStore
 * - Importing ISnapshotStore from this file will cause compile error
 * - This forces migration to the Truth Layer interface
 * 
 * Migration path:
 * - ISnapshotStore → persistence/snapshot-store.interface.ts
 * - StoredSnapshot → SimulationSnapshot (with extractPoints projection)
 * - points[] → extractPoints(calcResult) from calc-result-projection.ts
 * 
 * SINGLE SOURCE OF TRUTH:
 * - calcResult is authoritative for calculation data
 * - points[] is NEVER stored separately
 * - Use extractPoints(calcResult) to get points
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { EvidenceSnapshot } from '../diagnostics.types';
import { RetentionPolicy, PolicyTransitionResult } from './retention-policy';

// Re-export for convenience
export { RetentionPolicy, PolicyTransitionResult } from './retention-policy';

// ============================================================================
// COMPILE-TIME ENFORCEMENT: ISnapshotStore is REMOVED from this file
// ============================================================================
// 
// If you see a compile error like:
//   "Module has no exported member 'ISnapshotStore'"
// 
// FIX: Change your import to:
//   import { ISnapshotStore, SNAPSHOT_STORE } from '../persistence/snapshot-store.interface';
// 
// The new interface requires tenantId on all queries (security barrier).
// ============================================================================

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
 * SnapshotStore interface (LEGACY)
 * 
 * @deprecated Phase 9B.5 - RENAMED TO ILegacySnapshotStore
 * 
 * ⚠️  DO NOT USE - Use ISnapshotStore from persistence/snapshot-store.interface.ts  ⚠️
 * 
 * This interface is renamed to ILegacySnapshotStore to force compile-time errors
 * when importing from this file. This ensures all consumers migrate to the
 * Truth Layer interface.
 * 
 * Migration:
 * - Inject SNAPSHOT_STORE token instead of direct InMemorySnapshotStore
 * - Use SimulationSnapshot instead of StoredSnapshot
 * - Use extractPoints(calcResult) instead of snapshot.points[]
 * - All queries require tenantId (security barrier)
 * 
 * Abstraction for snapshot persistence.
 * Sprint 1B: InMemory implementation
 * Sprint 2C: Enhanced with policy transition semantics
 * Phase 9B.5: Replaced by Truth Layer
 */
export interface ILegacySnapshotStore {
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
