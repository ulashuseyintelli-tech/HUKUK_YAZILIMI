/**
 * Snapshot Ordering Utilities
 * 
 * Phase 9B.6 - Migration Lock
 * 
 * Centralized comparator functions for deterministic snapshot ordering.
 * All snapshot sorting MUST use these functions - no inline comparators.
 * 
 * LOCKED RULES:
 * - compareForBaseline: LEGAL_HOLD > PROMOTED > STANDARD, then createdAt DESC, then snapshotId ASC
 * - compareForDisplay: createdAt DESC, then snapshotId ASC (no policy preference)
 * - NaN from Date.parse falls through to snapshotId tie-breaker
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import { RetentionPolicy, POLICY_RANK } from '../evidence/retention-policy';

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal snapshot shape for ordering
 */
export interface OrderableSnapshot {
  snapshotId: string;
  createdAt: string;
  retentionPolicy: RetentionPolicy;
}

// ============================================================================
// Comparators
// ============================================================================

/**
 * Compare snapshots for baseline selection
 * 
 * Priority order:
 * 1. Retention policy: LEGAL_HOLD > PROMOTED > STANDARD
 * 2. Creation time: newer first (DESC)
 * 3. Snapshot ID: alphabetical (ASC) - deterministic tie-breaker
 * 
 * Use this for: BaselineResolverService.selectBaseline()
 * 
 * @param a First snapshot
 * @param b Second snapshot
 * @returns Negative if a should come first, positive if b should come first
 */
export function compareForBaseline(a: OrderableSnapshot, b: OrderableSnapshot): number {
  // 1. Policy priority (higher priority = comes first)
  const aPriority = POLICY_RANK[a.retentionPolicy] ?? 0;
  const bPriority = POLICY_RANK[b.retentionPolicy] ?? 0;
  
  if (aPriority !== bPriority) {
    return bPriority - aPriority; // Higher priority first
  }
  
  // 2. Creation time (newer first)
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  
  // Handle NaN gracefully - fall through to tie-breaker
  if (!isNaN(aTime) && !isNaN(bTime) && aTime !== bTime) {
    return bTime - aTime; // Newer first
  }
  
  // 3. Snapshot ID (alphabetical, deterministic tie-breaker)
  return a.snapshotId.localeCompare(b.snapshotId);
}

/**
 * Compare snapshots for display/list ordering
 * 
 * Priority order:
 * 1. Creation time: newer first (DESC)
 * 2. Snapshot ID: alphabetical (ASC) - deterministic tie-breaker
 * 
 * Use this for: LegalHoldInventoryService.listLegalHolds(), list endpoints
 * 
 * @param a First snapshot
 * @param b Second snapshot
 * @returns Negative if a should come first, positive if b should come first
 */
export function compareForDisplay(a: OrderableSnapshot, b: OrderableSnapshot): number {
  // 1. Creation time (newer first)
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  
  // Handle NaN gracefully - fall through to tie-breaker
  if (!isNaN(aTime) && !isNaN(bTime) && aTime !== bTime) {
    return bTime - aTime; // Newer first
  }
  
  // 2. Snapshot ID (alphabetical, deterministic tie-breaker)
  return a.snapshotId.localeCompare(b.snapshotId);
}

/**
 * Sort snapshots for baseline selection (returns new array)
 * 
 * @param snapshots Array of snapshots to sort
 * @returns New sorted array (original unchanged)
 */
export function sortForBaseline<T extends OrderableSnapshot>(snapshots: T[]): T[] {
  return [...snapshots].sort(compareForBaseline);
}

/**
 * Sort snapshots for display (returns new array)
 * 
 * @param snapshots Array of snapshots to sort
 * @returns New sorted array (original unchanged)
 */
export function sortForDisplay<T extends OrderableSnapshot>(snapshots: T[]): T[] {
  return [...snapshots].sort(compareForDisplay);
}

/**
 * Get the best baseline candidate from a list
 * 
 * Returns the first snapshot after sorting with compareForBaseline.
 * Returns null if list is empty.
 * 
 * @param snapshots Array of snapshots
 * @returns Best baseline candidate or null
 */
export function selectBestBaseline<T extends OrderableSnapshot>(snapshots: T[]): T | null {
  if (snapshots.length === 0) {
    return null;
  }
  return sortForBaseline(snapshots)[0];
}
