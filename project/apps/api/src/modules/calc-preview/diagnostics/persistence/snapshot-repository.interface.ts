/**
 * Snapshot Repository Interface
 * 
 * Phase 9B - PostgreSQL Migration
 * 
 * Repository interface for SimulationSnapshot persistence.
 * Both PostgreSQL and in-memory adapters implement this interface.
 * 
 * Key Semantics:
 * - INSERT-ONLY: Snapshots are immutable after creation
 * - Upgrade-only mutations: isBaseline, legalHold, retentionPolicy
 * - Single baseline per incident (partial unique index)
 * 
 * Invariant Enforcement:
 * - insert(): Insert-only, baseline uniqueness check
 * - markAsBaseline(): Upgrade only (false → true), uniqueness check
 * - applyLegalHold(): Upgrade only (false → true)
 * - setRetentionPolicy(): Upgrade only (STANDARD → PROMOTED → LEGAL_HOLD)
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/design.md - Truth Layer Contract
 */

import { RetentionPolicy } from '../evidence/retention-policy';

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
 * Simulation snapshot entity
 * 
 * All fields immutable except:
 * - isBaseline: false → true (upgrade only)
 * - legalHold: false → true (upgrade only)
 * - legalHoldReason: can be set when legalHold = true
 * - retentionPolicy: STANDARD → PROMOTED → LEGAL_HOLD (upgrade only)
 * - expiresAt: recalculated on policy change
 * - archivedAt/archivedBy/archivedReason: set once (archive is one-way)
 */
export interface Snapshot {
  // Primary key
  snapshotId: string;
  
  // Tenant isolation
  tenantId: string;
  
  // Incident reference (no FK - Incident not in Prisma yet)
  incidentId: string;
  
  // Run reference (optional FK)
  runId?: string | undefined;
  
  // Snapshot metadata
  snapshotKind: SnapshotKind;
  isBaseline: boolean;
  
  // Calculation result
  verdict: EvidenceVerdict;
  driftScore: number; // 0-1, stored as DECIMAL(10,6)
  
  // Calculation data (JSONB)
  calcResult: unknown; // Raw result (debug/audit)
  calcResultNorm: unknown; // Normalized for hash (all numbers as strings)
  calcHash: string; // SHA256(canonicalStringify(calcResultNorm))
  
  // Legal hold
  legalHold: boolean;
  legalHoldReason?: string | undefined;
  
  // Retention
  retentionPolicy: RetentionPolicy;
  expiresAt?: string | undefined; // ISO 8601, null for LEGAL_HOLD
  
  // Archive state (Phase 10)
  // Archive = soft-hide, does NOT change retentionPolicy
  archivedAt?: string | undefined; // ISO 8601, null if not archived
  archivedBy?: string | undefined; // opsUserId or actor
  archivedReason?: string | undefined; // Optional reason
  
  // Timestamp
  createdAt: string; // ISO 8601
}

/**
 * Input for creating a snapshot
 * 
 * Note: isBaseline, legalHold, retentionPolicy have defaults
 */
export interface SnapshotInput {
  snapshotId: string;
  tenantId: string;
  incidentId: string;
  runId?: string | undefined;
  snapshotKind: SnapshotKind;
  verdict: EvidenceVerdict;
  driftScore: number;
  calcResult: unknown;
  calcResultNorm: unknown;
  calcHash: string;
  
  // Optional - defaults applied if not provided
  isBaseline?: boolean | undefined; // default: false
  legalHold?: boolean | undefined; // default: false
  legalHoldReason?: string | undefined;
  retentionPolicy?: RetentionPolicy | undefined; // default: 'STANDARD'
}

/**
 * Result of applyLegalHold operation
 */
export interface ApplyLegalHoldResult {
  success: boolean;
  changed: boolean;
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
// Repository Interface
// ============================================================================

/**
 * Snapshot Repository Interface
 * 
 * Contract:
 * - insert(): Insert-only, no update. Baseline uniqueness enforced.
 * - markAsBaseline(): Upgrade only (false → true), uniqueness check
 * - applyLegalHold(): Upgrade only (false → true)
 * - setRetentionPolicy(): Upgrade only (STANDARD → PROMOTED → LEGAL_HOLD)
 * - findById(): Get snapshot by ID
 * - findByIncidentId(): List snapshots for incident
 * - findBaseline(): Get baseline snapshot for incident
 * - findByRunId(): List snapshots for run
 * - findWithLegalHold(): List snapshots with legal hold
 * - getLegalHoldStats(): Get legal hold statistics
 * 
 * Error Handling:
 * - BaselineAlreadyExistsError: Attempt to set second baseline for incident
 * - RetentionDowngradeError: Attempt to downgrade retention policy
 * - EntityNotFoundError: Referenced entity not found
 * - DatabaseUnavailableError: DB connection failed (NO FALLBACK)
 */
export interface ISnapshotRepository {
  // ==========================================================================
  // Create (INSERT-ONLY)
  // ==========================================================================
  
  /**
   * Insert new snapshot
   * 
   * Behavior:
   * - INSERT only - no update on conflict
   * - If isBaseline=true and incident already has baseline → error
   * - Defaults: isBaseline=false, legalHold=false, retentionPolicy='STANDARD'
   * - expiresAt calculated based on retentionPolicy
   * 
   * @param snapshot Snapshot data
   * @returns Created snapshot with all fields populated
   * @throws BaselineAlreadyExistsError if isBaseline=true and baseline exists
   * @throws DatabaseUnavailableError if DB connection failed
   */
  insert(snapshot: SnapshotInput): Promise<Snapshot>;
  
  // ==========================================================================
  // Upgrade-Only Mutations
  // ==========================================================================
  
  /**
   * Mark snapshot as baseline
   * 
   * Behavior:
   * - Snapshot not found → EntityNotFoundError
   * - Already baseline → idempotent, no error
   * - Another baseline exists for incident → BaselineAlreadyExistsError
   * - Success → isBaseline=true
   * 
   * Note: incidentId is read from DB, not passed as parameter.
   * This prevents caller errors where wrong incidentId is passed.
   * 
   * IMPORTANT: Baseline selection is determined exclusively by isBaseline=true.
   * snapshotKind is NOT used for baseline selection.
   * 
   * @param snapshotId Snapshot ID
   * @throws EntityNotFoundError if snapshot not found
   * @throws BaselineAlreadyExistsError if another baseline exists for incident
   * @throws DatabaseUnavailableError if DB connection failed
   */
  markAsBaseline(snapshotId: string): Promise<void>;
  
  /**
   * Apply legal hold to snapshot
   * 
   * Behavior:
   * - Snapshot not found → error: SNAPSHOT_NOT_FOUND
   * - Already has legal hold → success, changed=false (idempotent)
   * - Success → legalHold=true, expiresAt=null (never expires)
   * 
   * @param snapshotId Snapshot ID
   * @param reason Optional reason for legal hold
   * @returns Result with success/changed/error
   * @throws DatabaseUnavailableError if DB connection failed
   */
  applyLegalHold(snapshotId: string, reason?: string | undefined): Promise<ApplyLegalHoldResult>;
  
  /**
   * Set retention policy for snapshot
   * 
   * Behavior:
   * - Snapshot not found → error: SNAPSHOT_NOT_FOUND
   * - Same policy → success, changed=false (idempotent)
   * - Upgrade (STANDARD→PROMOTED→LEGAL_HOLD) → success
   * - Downgrade → error: RETENTION_DOWNGRADE_FORBIDDEN
   * - expiresAt recalculated based on new policy
   * 
   * Note: This is minimal in Phase 9B. Full policy motor in Phase 9C.
   * 
   * @param snapshotId Snapshot ID
   * @param policy New retention policy
   * @returns Result with success/changed/error
   * @throws DatabaseUnavailableError if DB connection failed
   */
  setRetentionPolicy(
    snapshotId: string,
    policy: RetentionPolicy,
  ): Promise<SetRetentionPolicyResult>;
  
  /**
   * Mark snapshot as archived (Phase 10)
   * 
   * Archive = soft-hide, does NOT change retentionPolicy.
   * Legal hold status is preserved.
   * 
   * Behavior:
   * - Snapshot not found → error: SNAPSHOT_NOT_FOUND
   * - Not LEGAL_HOLD → error: NOT_LEGAL_HOLD (only legal holds can be archived)
   * - Is baseline → error: IS_BASELINE (baseline cannot be archived)
   * - Already archived → success, changed=false (idempotent)
   * - Success → archivedAt set, archivedBy set
   * 
   * INVARIANT: Archive is one-way. Once archived, cannot be unarchived.
   * 
   * @param snapshotId Snapshot ID
   * @param input Archive metadata (archivedBy, reason)
   * @returns Result with success/changed/error
   * @throws DatabaseUnavailableError if DB connection failed
   */
  markArchived(
    snapshotId: string,
    input: MarkArchivedInput,
  ): Promise<MarkArchivedResult>;
  
  // ==========================================================================
  // Query
  // ==========================================================================
  
  /**
   * Find snapshot by ID
   * 
   * @param snapshotId Snapshot ID
   * @returns Snapshot or null if not found
   * @throws DatabaseUnavailableError if DB connection failed
   */
  findById(snapshotId: string): Promise<Snapshot | null>;
  
  /**
   * Find snapshots by incident ID
   * 
   * Results ordered by createdAt DESC (newest first).
   * 
   * @param incidentId Incident ID
   * @returns Array of snapshots
   * @throws DatabaseUnavailableError if DB connection failed
   */
  findByIncidentId(incidentId: string): Promise<Snapshot[]>;
  
  /**
   * Find baseline snapshot for incident
   * 
   * @param incidentId Incident ID
   * @returns Baseline snapshot or null if no baseline
   * @throws DatabaseUnavailableError if DB connection failed
   */
  findBaseline(incidentId: string): Promise<Snapshot | null>;
  
  /**
   * Find snapshots by run ID
   * 
   * @param runId Run ID
   * @returns Array of snapshots
   * @throws DatabaseUnavailableError if DB connection failed
   */
  findByRunId(runId: string): Promise<Snapshot[]>;
  
  /**
   * Find snapshots with legal hold
   * 
   * By default, excludes archived snapshots (includeArchived=false).
   * 
   * @param tenantId Optional tenant filter
   * @param options Query options
   * @param options.includeArchived Include archived snapshots (default: false)
   * @returns Array of snapshots with legalHold=true
   * @throws DatabaseUnavailableError if DB connection failed
   */
  findWithLegalHold(
    tenantId?: string | undefined,
    options?: { includeArchived?: boolean | undefined } | undefined,
  ): Promise<Snapshot[]>;
  
  // ==========================================================================
  // Statistics
  // ==========================================================================
  
  /**
   * Get legal hold statistics
   * 
   * @param tenantId Optional tenant filter
   * @returns Legal hold stats
   * @throws DatabaseUnavailableError if DB connection failed
   */
  getLegalHoldStats(tenantId?: string | undefined): Promise<LegalHoldStats>;
  
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
   * @throws DatabaseUnavailableError if DB connection failed
   */
  deleteExpired(tenantId: string): Promise<DeleteExpiredResult>;
}
