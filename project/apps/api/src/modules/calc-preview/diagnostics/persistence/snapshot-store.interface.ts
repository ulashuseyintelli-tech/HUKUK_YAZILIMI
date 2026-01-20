/**
 * ISnapshotStore Interface
 * 
 * Phase 9B.5 - Snapshot Store Interface Cutover
 * 
 * Consumer-facing interface for snapshot operations.
 * This is the ONLY interface that controllers/services should use.
 * 
 * Design Goals:
 * - Consumers see store, not repository
 * - Store validates but doesn't calculate hash
 * - Store enforces Truth Layer behaviors (baseline, legal hold, retention)
 * - All queries require tenantId for tenant isolation
 * 
 * LOCKED RULES:
 * - calcHash MUST be provided by caller (calculated in determinism.ts ONLY)
 * - calcResultNorm MUST be provided by caller
 * - No hash calculation in store
 * - tenantId required on all queries (security barrier)
 * 
 * SINGLE SOURCE OF TRUTH - POINTS:
 * - calcResult is authoritative for calculation data
 * - points[] is NEVER stored as a separate field on SimulationSnapshot
 * - Use extractPoints(calcResult) from calc-result-projection.ts to get points
 * - This prevents drift between calcResult and points
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 * @see simulation/calc-result-projection.ts
 */

import { RetentionPolicy } from '../evidence/retention-policy';

// ============================================================================
// Injection Token
// ============================================================================

export const SNAPSHOT_STORE = Symbol('SNAPSHOT_STORE');

// ============================================================================
// Types
// ============================================================================

/**
 * Snapshot kind
 */
export type SnapshotKind = 'BASELINE' | 'CURRENT' | 'OTHER';

/**
 * Evidence verdict
 */
export type EvidenceVerdict = 'PROCEED' | 'BLOCK_DRIFT' | 'BLOCK_EVIDENCE' | 'BLOCK_POLICY';

/**
 * Simulation snapshot entity (consumer view)
 * 
 * This is what consumers see. Internal DB fields are hidden.
 * 
 * IMPORTANT - POINTS:
 * - There is NO points[] field on this interface
 * - calcResult is the SINGLE SOURCE OF TRUTH for calculation data
 * - Use extractPoints(calcResult) from calc-result-projection.ts to get points
 * - This design prevents drift between calcResult and points
 * 
 * @see simulation/calc-result-projection.ts
 */
export interface SimulationSnapshot {
  // Identity
  snapshotId: string;
  tenantId: string;
  incidentId: string;
  runId?: string | undefined;
  
  // Snapshot metadata
  snapshotKind: SnapshotKind;
  isBaseline: boolean;
  
  // Calculation result
  verdict: EvidenceVerdict;
  driftScore: number;
  
  // Calculation data
  calcResult: unknown;
  calcResultNorm: unknown;
  calcHash: string;
  
  // Legal hold
  legalHold: boolean;
  legalHoldReason?: string | undefined;
  
  // Retention
  retentionPolicy: RetentionPolicy;
  expiresAt?: string | undefined;
  
  // Archive state (Phase 10)
  // Archive = soft-hide, does NOT change retentionPolicy
  archivedAt?: string | undefined;
  archivedBy?: string | undefined;
  archivedReason?: string | undefined;
  
  // Timestamp
  createdAt: string;
}

/**
 * Input for creating a snapshot
 * 
 * LOCKED: calcHash and calcResultNorm are REQUIRED.
 * They must be calculated in determinism.ts before calling this service.
 */
export interface CreateSnapshotInput {
  snapshotId: string;
  tenantId: string;
  incidentId: string;
  runId?: string | undefined;
  snapshotKind: SnapshotKind;
  verdict: EvidenceVerdict;
  driftScore: number;
  
  /** Raw calculation result (for debug/audit) */
  calcResult: unknown;
  
  /** 
   * Normalized calculation result (all numbers as strings)
   * REQUIRED - must be provided by caller
   */
  calcResultNorm: unknown;
  
  /**
   * SHA256 hash of canonicalStringify(calcResultNorm)
   * REQUIRED - must be calculated in determinism.ts
   */
  calcHash: string;
  
  /** Mark as baseline on creation (default: false) */
  isBaseline?: boolean | undefined;
  
  /** Initial retention policy (default: STANDARD) */
  retentionPolicy?: RetentionPolicy | undefined;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of applyLegalHold operation
 */
export interface ApplyLegalHoldResult {
  success: boolean;
  changed: boolean;
  previousPolicy?: RetentionPolicy | undefined;
  newPolicy?: RetentionPolicy | undefined;
  error?: 'SNAPSHOT_NOT_FOUND' | undefined;
}

/**
 * Result of setRetentionPolicy operation
 */
export interface SetRetentionPolicyResult {
  success: boolean;
  changed: boolean;
  previousPolicy?: RetentionPolicy | undefined;
  newPolicy?: RetentionPolicy | undefined;
  newExpiresAt?: string | null | undefined;
  error?: 'SNAPSHOT_NOT_FOUND' | 'RETENTION_DOWNGRADE_FORBIDDEN' | undefined;
}

/**
 * Input for marking snapshot as archived
 */
export interface MarkArchivedInput {
  archivedBy: string; // opsUserId or actor
  reason?: string | undefined; // Optional reason
}

/**
 * Result of markArchived operation
 */
export interface MarkArchivedResult {
  success: boolean;
  changed: boolean;
  archivedAt?: string | undefined; // ISO 8601
  error?: 'SNAPSHOT_NOT_FOUND' | 'NOT_LEGAL_HOLD' | 'IS_BASELINE' | undefined;
}

/**
 * Legal hold statistics
 */
export interface LegalHoldStats {
  totalCount: number;
  byIncidentCount: Record<string, number>;
  oldestHoldAt: string | null;
  averageAgeDays: number;
}

/**
 * Result of deleteExpired operation (Phase 10)
 */
export interface DeleteExpiredResult {
  /** Number of snapshots deleted */
  deletedCount: number;
  /** Number of snapshots protected (not deleted due to policy/baseline) */
  protectedCount: number;
  /** Breakdown of protected snapshots by reason */
  protectedBy: {
    legalHold: number;
    promoted: number;
    baseline: number;
  };
}

// ============================================================================
// Interface
// ============================================================================

/**
 * ISnapshotStore - Consumer-facing snapshot store interface
 * 
 * This is the ONLY interface that controllers/services should inject.
 * 
 * Contract:
 * - createSnapshot(): Create new snapshot (calcHash validation)
 * - promoteToBaseline(): Mark as baseline (upgrade only)
 * - findBaseline(): Get baseline for tenant+incident
 * - applyLegalHold(): Apply legal hold (upgrade only)
 * - setRetentionPolicy(): Set retention (upgrade only)
 * - findById(): Get snapshot by ID
 * - findByIncidentId(): List snapshots for tenant+incident
 * - findByRunId(): List snapshots for tenant+run
 * - findWithLegalHold(): List legal hold snapshots
 * - getLegalHoldStats(): Get legal hold statistics
 * 
 * Tenant Isolation:
 * - All query methods require tenantId
 * - Store enforces tenant filter on all queries
 * - Cross-tenant access is impossible by design
 * 
 * Error Handling:
 * - SnapshotValidationError: Invalid input (missing calcHash, etc.)
 * - BaselineAlreadyExistsError: Second baseline for incident
 * - RetentionDowngradeError: Attempt to downgrade retention
 * - EntityNotFoundError: Snapshot not found
 * - DatabaseUnavailableError: DB connection failed (NO FALLBACK)
 */
export interface ISnapshotStore {
  // ==========================================================================
  // Create
  // ==========================================================================
  
  /**
   * Create a new snapshot
   * 
   * LOCKED: calcHash and calcResultNorm are REQUIRED.
   * This store does NOT calculate hashes - that's determinism.ts's job.
   * 
   * @param input Snapshot data with calcHash
   * @returns Created snapshot
   * @throws SnapshotValidationError if calcHash or calcResultNorm missing
   * @throws BaselineAlreadyExistsError if isBaseline=true and baseline exists
   */
  createSnapshot(input: CreateSnapshotInput): Promise<SimulationSnapshot>;
  
  // ==========================================================================
  // Baseline
  // ==========================================================================
  
  /**
   * Promote snapshot to baseline
   * 
   * Idempotent - no error if already baseline.
   * 
   * TENANT ISOLATION: Returns void (not found) if tenant mismatch.
   * This prevents information leakage about other tenants' snapshots.
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param snapshotId Snapshot ID
   * @throws EntityNotFoundError if snapshot not found OR tenant mismatch
   * @throws BaselineAlreadyExistsError if another baseline exists
   */
  promoteToBaseline(tenantId: string, snapshotId: string): Promise<void>;
  
  /**
   * Find baseline snapshot for tenant+incident
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param incidentId Incident ID
   * @returns Baseline snapshot or null
   */
  findBaseline(tenantId: string, incidentId: string): Promise<SimulationSnapshot | null>;
  
  // ==========================================================================
  // Legal Hold & Retention (Upgrade-Only, Tenant-Aware)
  // ==========================================================================
  
  /**
   * Apply legal hold to snapshot
   * 
   * Idempotent - no error if already has legal hold.
   * 
   * TENANT ISOLATION: Returns SNAPSHOT_NOT_FOUND if tenant mismatch.
   * This prevents information leakage about other tenants' snapshots.
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param snapshotId Snapshot ID
   * @param reason Optional reason for legal hold
   * @returns Result with success/changed/error
   */
  applyLegalHold(
    tenantId: string,
    snapshotId: string,
    reason?: string | undefined,
  ): Promise<ApplyLegalHoldResult>;
  
  /**
   * Set retention policy for snapshot
   * 
   * Upgrade-only: STANDARD → PROMOTED → LEGAL_HOLD
   * 
   * TENANT ISOLATION: Returns SNAPSHOT_NOT_FOUND if tenant mismatch.
   * This prevents information leakage about other tenants' snapshots.
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param snapshotId Snapshot ID
   * @param policy New retention policy
   * @returns Result with success/changed/error
   */
  setRetentionPolicy(
    tenantId: string,
    snapshotId: string,
    policy: RetentionPolicy,
  ): Promise<SetRetentionPolicyResult>;
  
  /**
   * Mark snapshot as archived (Phase 10)
   * 
   * Archive = soft-hide, does NOT change retentionPolicy.
   * Legal hold status is preserved.
   * 
   * RULES:
   * - Only LEGAL_HOLD snapshots can be archived
   * - Baseline snapshots cannot be archived
   * - Archive is one-way (cannot unarchive)
   * - Idempotent - no error if already archived
   * 
   * TENANT ISOLATION: Returns SNAPSHOT_NOT_FOUND if tenant mismatch.
   * This prevents information leakage about other tenants' snapshots.
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param snapshotId Snapshot ID
   * @param input Archive metadata (archivedBy, reason)
   * @returns Result with success/changed/error
   */
  markArchived(
    tenantId: string,
    snapshotId: string,
    input: MarkArchivedInput,
  ): Promise<MarkArchivedResult>;
  
  // ==========================================================================
  // Queries (Tenant-Aware)
  // ==========================================================================
  
  /**
   * Find snapshot by ID
   * 
   * Note: No tenantId required here because snapshotId is globally unique.
   * However, the returned snapshot includes tenantId for verification.
   * 
   * @param snapshotId Snapshot ID
   * @returns Snapshot or null
   */
  findById(snapshotId: string): Promise<SimulationSnapshot | null>;
  
  /**
   * Find snapshots by tenant+incident
   * 
   * Results ordered by createdAt DESC (newest first).
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param incidentId Incident ID
   * @returns Array of snapshots
   */
  findByIncidentId(tenantId: string, incidentId: string): Promise<SimulationSnapshot[]>;
  
  /**
   * Find snapshots by tenant+run
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param runId Run ID
   * @returns Array of snapshots
   */
  findByRunId(tenantId: string, runId: string): Promise<SimulationSnapshot[]>;
  
  /**
   * Find snapshots with legal hold
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @returns Array of snapshots with legalHold=true
   */
  findWithLegalHold(tenantId: string): Promise<SimulationSnapshot[]>;
  
  // ==========================================================================
  // Statistics
  // ==========================================================================
  
  /**
   * Get legal hold statistics
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @returns Legal hold stats
   */
  getLegalHoldStats(tenantId: string): Promise<LegalHoldStats>;
  
  // ==========================================================================
  // Cleanup (Phase 10 - Hardened)
  // ==========================================================================
  
  /**
   * Delete expired snapshots for a tenant (Phase 10 - Hardened)
   * 
   * DOKUNULMAZLAR (Untouchables) - NEVER deleted:
   * - retentionPolicy = 'LEGAL_HOLD' → never delete
   * - retentionPolicy = 'PROMOTED' → never delete
   * - isBaseline = true → never delete
   * 
   * DELETE CRITERIA (all must be true):
   * - expiresAt < now
   * - retentionPolicy = 'STANDARD'
   * - isBaseline = false
   * 
   * TENANT ISOLATION: Only deletes snapshots for specified tenant.
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @returns Result with deleted count and protected count
   */
  deleteExpired(tenantId: string): Promise<DeleteExpiredResult>;
}
