/**
 * Cleanup Orchestration Types
 * 
 * Phase 11 - Snapshot Cleanup Orchestration
 * 
 * Type definitions for cleanup orchestration system.
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Cleanup orchestrator configuration
 * 
 * All fields are REQUIRED in P0 (no optional fields).
 */
export interface CleanupConfig {
  /** Maximum tenants to process per run (required for bounded runtime) */
  maxTenantsPerRun: number;
  
  /** Expected max duration per tenant in ms (for TTL calculation) */
  perTenantBudgetMs: number;
  
  /** Safety margin for lock TTL in ms */
  safetyMarginMs: number;
  
  /** Consecutive failures before alert threshold */
  failureThreshold: number;
  
  /** Enable per-tenant metrics (high cardinality warning) */
  perTenantMetricsEnabled: boolean;
}

/**
 * Default cleanup configuration
 */
export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  maxTenantsPerRun: 500,
  perTenantBudgetMs: 750,
  safetyMarginMs: 120_000, // 2 minutes
  failureThreshold: 3,
  perTenantMetricsEnabled: false,
};

// ============================================================================
// Run Options
// ============================================================================

/**
 * Options for a cleanup run
 */
export interface CleanupRunOptions {
  /** Dry run mode - compute but don't delete */
  dryRun?: boolean;
  
  /** Tenant allowlist - only process these tenants */
  tenantAllowlist?: string[];
  
  /** Tenant blocklist - exclude these tenants */
  tenantBlocklist?: string[];
  
  /** Override max tenants per run */
  maxTenantsPerRun?: number;
  
  /** Enable per-tenant metrics for this run */
  emitPerTenantMetrics?: boolean;
}

// ============================================================================
// Run Results
// ============================================================================

/**
 * Status of a cleanup run
 */
export type CleanupRunStatus = 
  | 'SUCCESS'        // Run finished successfully (all tenants succeeded)
  | 'PARTIAL_FAILURE'// Run finished with some failures
  | 'FAILED'         // Run failed completely
  | 'SKIPPED_LOCKED' // Run skipped due to lock contention
  | 'DRY_RUN';       // Dry run completed

/**
 * Status of a single tenant cleanup
 */
export type TenantCleanupStatus = 
  | 'SUCCESS'                // Tenant cleanup succeeded
  | 'FAILED'                 // Tenant cleanup failed
  | 'SKIPPED_INVALID_TENANT';// Tenant skipped due to invalid tenantId

/**
 * Result of a single tenant cleanup
 */
export interface TenantCleanupResult {
  tenantId: string;
  status: TenantCleanupStatus;
  deletedCount: number;      // dryRun'da deletableCount
  protectedCount: number;
  durationMs: number;
  errorCode?: string;
  isSlow: boolean;
}

/**
 * Result of a cleanup run
 */
export interface CleanupRunResult {
  /** Unique run identifier (UUID v4) */
  runId: string;
  
  /** Run status */
  status: CleanupRunStatus;
  
  /** Whether this was a dry run */
  dryRun: boolean;
  
  /** Run start timestamp (ms since epoch) */
  startedAt: number;
  
  /** Run completion timestamp (ms since epoch) */
  completedAt: number;
  
  /** Lock TTL used for this run (ms) - useful for debugging */
  lockTtlMs: number;
  
  /** Total tenants discovered from DB */
  tenantsDiscovered: number;
  
  /** Tenants after allowlist/blocklist filtering */
  tenantsPlanned: number;
  
  /** Tenants actually processed */
  tenantsProcessed: number;
  
  /** Tenants that succeeded */
  tenantsSucceeded: number;
  
  /** Tenants that failed */
  tenantsFailed: number;
  
  /** Tenants skipped due to invalid tenantId */
  tenantsSkippedInvalid: number;
  
  /** Total snapshots deleted (dryRun'da deletableTotal) */
  totalDeleted: number;
  
  /** Total snapshots protected */
  totalProtected: number;
  
  /** Total slow tenants */
  slowTenantCount: number;
  
  /** Run duration in ms */
  durationMs: number;
  
  /** Per-tenant results (if emitPerTenantMetrics enabled) */
  tenantResults?: TenantCleanupResult[];
  
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Lock Types
// ============================================================================

/**
 * Result of lock acquisition attempt
 */
export interface LockAcquireResult {
  /** Whether lock was acquired */
  acquired: boolean;
  
  /** Lock ID (for release) - only set if acquired */
  lockId?: string | undefined;
  
  /** Existing lock holder (if not acquired) */
  existingLockId?: string | undefined;
}

/**
 * Distributed lock interface
 */
export interface IDistributedLock {
  /**
   * Acquire a distributed lock
   * 
   * @param lockKey Lock key
   * @param ttlMs Lock TTL in milliseconds
   * @returns Lock acquisition result
   */
  acquireLock(lockKey: string, ttlMs: number): Promise<LockAcquireResult>;
  
  /**
   * Release a distributed lock
   * 
   * Only releases if lockId matches (safe release).
   * 
   * @param lockKey Lock key
   * @param lockId Lock ID from acquisition
   * @returns true if released, false if not held or wrong lockId
   */
  releaseLock(lockKey: string, lockId: string): Promise<boolean>;
}

// ============================================================================
// Failure State Types
// ============================================================================

/**
 * Failure state for a tenant
 */
export interface TenantFailureState {
  tenantId: string;
  consecutiveFailures: number;
  lastFailedAt: Date | null;
  lastErrorCode: string | null;
}

/**
 * Failure state repository interface
 */
export interface ICleanupFailureStateRepository {
  /**
   * Increment failure counter atomically (UPSERT)
   * 
   * @param tenantId Tenant ID
   * @param errorCode Error code from failure
   * @returns Updated failure count
   */
  incrementFailure(tenantId: string, errorCode: string): Promise<number>;
  
  /**
   * Reset failure counter to 0
   * 
   * @param tenantId Tenant ID
   */
  resetFailure(tenantId: string): Promise<void>;
  
  /**
   * Get failure state for a tenant
   * 
   * @param tenantId Tenant ID
   * @returns Failure state or null if no failures recorded
   */
  getFailureState(tenantId: string): Promise<TenantFailureState | null>;
}

// ============================================================================
// Constants
// ============================================================================

/** Lock key for cleanup orchestrator */
export const CLEANUP_LOCK_KEY = 'snapshot:cleanup:orchestrator:global';

/**
 * Calculate lock TTL from config
 * 
 * Formula: maxTenantsPerRun * perTenantBudgetMs + safetyMarginMs
 */
export function calculateLockTtlMs(config: CleanupConfig): number {
  return config.maxTenantsPerRun * config.perTenantBudgetMs + config.safetyMarginMs;
}

/**
 * Validate tenant ID
 * 
 * Returns true if tenantId is valid (non-empty string after trim)
 */
export function isValidTenantId(tenantId: unknown): tenantId is string {
  return typeof tenantId === 'string' && tenantId.trim().length > 0;
}

// ============================================================================
// Cleanup Repository Interface
// ============================================================================

/**
 * Result of a cleanup operation (delete or count)
 */
export interface CleanupOperationResult {
  /** Number of snapshots deleted (or deletable in dry-run) */
  deletedCount: number;
  
  /** Number of snapshots protected (LEGAL_HOLD, PROMOTED, baseline) */
  protectedCount: number;
}

/**
 * Cleanup repository interface for snapshot operations
 */
export interface ISnapshotCleanupRepository {
  /**
   * List distinct tenant IDs from snapshots table
   * 
   * @returns Tenant IDs in ascending order
   */
  listDistinctTenantIds(): Promise<string[]>;
  
  /**
   * Count deletable snapshots for a tenant
   * 
   * Uses buildDeletableWhere for consistent criteria.
   * 
   * @param tenantId Tenant ID
   * @param now Current timestamp for expiry calculation
   * @returns Deletable and protected counts
   */
  countDeletable(tenantId: string, now: Date): Promise<CleanupOperationResult>;
  
  /**
   * Delete expired snapshots for a tenant
   * 
   * Uses buildDeletableWhere for consistent criteria.
   * 
   * @param tenantId Tenant ID
   * @param now Current timestamp for expiry calculation
   * @returns Deleted and protected counts
   */
  deleteExpired(tenantId: string, now: Date): Promise<CleanupOperationResult>;
}

// ============================================================================
// Metrics Interface
// ============================================================================

/**
 * Cleanup metrics interface
 */
export interface ICleanupMetrics {
  /** Increment slow tenant counter */
  incrementSlowTenantTotal(): void;
  
  /** Increment invalid tenant counter */
  incrementInvalidTenantTotal(): void;
  
  /** Record run duration */
  recordRunDuration(durationMs: number, status: CleanupRunStatus): void;
  
  /** Increment success reset counter (failure counter reset on success) */
  incrementSuccessResetsTotal(): void;
  
  /** Record tenant cleanup duration (optional, high cardinality) */
  recordTenantDuration?(tenantId: string, durationMs: number): void;
  
  /** Emit failure threshold reached event (optional) */
  emitFailureThresholdReached?(tenantId: string, consecutiveFailures: number): void;
}
