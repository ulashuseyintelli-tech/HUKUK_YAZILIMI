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
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
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
 * Legal hold statistics
 */
export interface LegalHoldStats {
  totalCount: number;
  byIncidentCount: Record<string, number>;
  oldestHoldAt: string | null;
  averageAgeDays: number;
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
   * @param snapshotId Snapshot ID
   * @throws EntityNotFoundError if snapshot not found
   * @throws BaselineAlreadyExistsError if another baseline exists
   */
  promoteToBaseline(snapshotId: string): Promise<void>;
  
  /**
   * Find baseline snapshot for tenant+incident
   * 
   * @param tenantId Tenant ID (required for isolation)
   * @param incidentId Incident ID
   * @returns Baseline snapshot or null
   */
  findBaseline(tenantId: string, incidentId: string): Promise<SimulationSnapshot | null>;
  
  // ==========================================================================
  // Legal Hold & Retention (Upgrade-Only)
  // ==========================================================================
  
  /**
   * Apply legal hold to snapshot
   * 
   * Idempotent - no error if already has legal hold.
   * 
   * @param snapshotId Snapshot ID
   * @param reason Optional reason for legal hold
   * @returns Result with success/changed/error
   */
  applyLegalHold(
    snapshotId: string,
    reason?: string | undefined,
  ): Promise<ApplyLegalHoldResult>;
  
  /**
   * Set retention policy for snapshot
   * 
   * Upgrade-only: STANDARD → PROMOTED → LEGAL_HOLD
   * 
   * @param snapshotId Snapshot ID
   * @param policy New retention policy
   * @returns Result with success/changed/error
   */
  setRetentionPolicy(
    snapshotId: string,
    policy: RetentionPolicy,
  ): Promise<SetRetentionPolicyResult>;
  
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
}
