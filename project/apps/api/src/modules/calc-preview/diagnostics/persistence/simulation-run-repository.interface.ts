/**
 * Simulation Run Repository Interface
 * 
 * Phase 9B - PostgreSQL Migration
 * 
 * Repository interface for SimulationRun persistence.
 * Both PostgreSQL and in-memory adapters implement this interface.
 * 
 * Invariant Enforcement:
 * - upsert(): Immutable field protection
 * - updateStatus(): Status monotonicity (rank check)
 * - setCurrentSnapshot(): Incident mismatch check
 * - setBaselineSnapshot(): Incident mismatch + run status check
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/design.md - Truth Layer Contract
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Simulation run status
 * 
 * Monotonicity: PENDING → RUNNING → COMPLETED | FAILED
 * Terminal states: COMPLETED, FAILED (no further transitions)
 */
export type SimulationRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/**
 * Simulation run entity
 * 
 * Immutable fields: runId, tenantId, incidentId, scenarioId, seed, 
 *                   simulationVersion, engineVersion, startedAt
 * Mutable fields: status, finishedAt, currentSnapshotId, baselineSnapshotId,
 *                 errorCode, errorMessage
 */
export interface SimulationRun {
  // Primary key (deterministic)
  runId: string;
  
  // Tenant isolation
  tenantId: string;
  
  // Incident reference (no FK - Incident not in Prisma yet)
  incidentId: string;
  
  // Immutable execution context
  scenarioId: string;
  seed: number;
  simulationVersion: string;
  engineVersion?: string | undefined;
  
  // Mutable status
  status: SimulationRunStatus;
  
  // Timestamps
  startedAt: string; // ISO 8601
  finishedAt?: string | undefined; // ISO 8601
  
  // Snapshot links (mutable once: null → value)
  currentSnapshotId?: string | undefined;
  baselineSnapshotId?: string | undefined;
  
  // Error info (for FAILED status)
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}

/**
 * Input for creating/updating a simulation run
 * 
 * On upsert:
 * - If run doesn't exist: all fields used for insert
 * - If run exists: only mutable fields can change, immutable fields must match
 */
export interface SimulationRunInput {
  runId: string;
  tenantId: string;
  incidentId: string;
  scenarioId: string;
  seed: number;
  simulationVersion: string;
  engineVersion?: string | undefined;
  status: SimulationRunStatus;
  startedAt: string;
  finishedAt?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}

/**
 * Paginated result for run listing
 */
export interface PaginatedRunsResult {
  runs: SimulationRun[];
  nextCursor?: string | undefined;
  hasMore: boolean;
}

/**
 * Options for listing runs
 */
export interface ListRunsOptions {
  /** Maximum number of runs to return (default: 20) */
  limit?: number | undefined;
  /** Cursor for pagination (runId of last item) */
  cursor?: string | undefined;
}

// ============================================================================
// Repository Interface
// ============================================================================

/**
 * Simulation Run Repository Interface
 * 
 * Contract:
 * - upsert(): Insert or update run with immutable field protection
 * - updateStatus(): Update status with monotonicity enforcement
 * - setCurrentSnapshot(): Link current snapshot with incident mismatch check
 * - setBaselineSnapshot(): Link baseline snapshot with incident mismatch + status check
 * - findById(): Get run by ID
 * - findByIncidentId(): List runs for incident with pagination
 * - findLatestByIncidentId(): Get most recent run for incident
 * - countByIncidentId(): Count runs for incident
 * - countByTenantId(): Count runs for tenant (optionally filtered by date)
 * 
 * Error Handling:
 * - ImmutableFieldViolationError: Attempt to modify immutable field
 * - StatusMonotonicityViolationError: Attempt to transition status backwards
 * - IncidentMismatchError: Snapshot incident doesn't match run incident
 * - RunNotCompletedError: Attempt to set baseline on non-completed run
 * - EntityNotFoundError: Referenced entity not found
 * - DatabaseUnavailableError: DB connection failed (NO FALLBACK)
 */
export interface ISimulationRunRepository {
  // ==========================================================================
  // Create/Update
  // ==========================================================================
  
  /**
   * Insert or update simulation run
   * 
   * Behavior:
   * - If run doesn't exist: INSERT all fields
   * - If run exists: UPDATE only mutable fields, verify immutable fields match
   * 
   * Immutable fields (must match on update):
   * - runId, tenantId, incidentId, scenarioId, seed, simulationVersion, 
   *   engineVersion, startedAt
   * 
   * Mutable fields (can change):
   * - status, finishedAt, errorCode, errorMessage
   * 
   * @throws ImmutableFieldViolationError if immutable field mismatch
   * @throws DatabaseUnavailableError if DB connection failed
   */
  upsert(run: SimulationRunInput): Promise<SimulationRun>;
  
  /**
   * Update run status with monotonicity enforcement
   * 
   * Status rank: PENDING(0) < RUNNING(1) < COMPLETED(2) = FAILED(2)
   * 
   * Allowed transitions:
   * - PENDING → RUNNING
   * - PENDING → COMPLETED (skip RUNNING)
   * - PENDING → FAILED (skip RUNNING)
   * - RUNNING → COMPLETED
   * - RUNNING → FAILED
   * 
   * Forbidden transitions:
   * - COMPLETED → anything
   * - FAILED → anything
   * - RUNNING → PENDING
   * - COMPLETED ↔ FAILED
   * 
   * @param runId Run ID
   * @param status New status
   * @param finishedAt Optional finish timestamp (required for COMPLETED/FAILED)
   * @throws EntityNotFoundError if run not found
   * @throws StatusMonotonicityViolationError if transition not allowed
   * @throws DatabaseUnavailableError if DB connection failed
   */
  updateStatus(
    runId: string,
    status: SimulationRunStatus,
    finishedAt?: string | undefined,
  ): Promise<void>;
  
  // ==========================================================================
  // Snapshot Links
  // ==========================================================================
  
  /**
   * Set current snapshot for run
   * 
   * Validation (all done by repo, not caller):
   * - Run must exist → EntityNotFoundError('SimulationRun')
   * - Snapshot must exist → EntityNotFoundError('SimulationSnapshot')
   * - Snapshot's incidentId must match run's incidentId → IncidentMismatchError
   * - Snapshot's tenantId must match run's tenantId → TenantMismatchError
   * 
   * @param runId Run ID
   * @param snapshotId Snapshot ID
   * @throws EntityNotFoundError if run or snapshot not found
   * @throws IncidentMismatchError if incident IDs don't match
   * @throws TenantMismatchError if tenant IDs don't match
   * @throws DatabaseUnavailableError if DB connection failed
   */
  setCurrentSnapshot(runId: string, snapshotId: string): Promise<void>;
  
  /**
   * Set baseline snapshot for run
   * 
   * Validation (all done by repo, not caller):
   * - Run must exist → EntityNotFoundError('SimulationRun')
   * - Run status must be COMPLETED → RunNotCompletedError
   * - Snapshot must exist → EntityNotFoundError('SimulationSnapshot')
   * - Snapshot's incidentId must match run's incidentId → IncidentMismatchError
   * - Snapshot's tenantId must match run's tenantId → TenantMismatchError
   * 
   * @param runId Run ID
   * @param snapshotId Snapshot ID
   * @throws EntityNotFoundError if run or snapshot not found
   * @throws RunNotCompletedError if run status is not COMPLETED
   * @throws IncidentMismatchError if incident IDs don't match
   * @throws TenantMismatchError if tenant IDs don't match
   * @throws DatabaseUnavailableError if DB connection failed
   */
  setBaselineSnapshot(runId: string, snapshotId: string): Promise<void>;
  
  // ==========================================================================
  // Query
  // ==========================================================================
  
  /**
   * Find run by ID
   * 
   * @param runId Run ID
   * @returns Run or null if not found
   * @throws DatabaseUnavailableError if DB connection failed
   */
  findById(runId: string): Promise<SimulationRun | null>;
  
  /**
   * Find runs by incident ID with pagination
   * 
   * Results ordered by startedAt DESC (newest first).
   * 
   * @param incidentId Incident ID
   * @param options Pagination options
   * @returns Paginated result with runs, nextCursor, hasMore
   * @throws DatabaseUnavailableError if DB connection failed
   */
  findByIncidentId(
    incidentId: string,
    options?: ListRunsOptions | undefined,
  ): Promise<PaginatedRunsResult>;
  
  /**
   * Find latest run for incident
   * 
   * Returns the run with the most recent startedAt timestamp.
   * 
   * @param incidentId Incident ID
   * @returns Latest run or null if no runs exist
   * @throws DatabaseUnavailableError if DB connection failed
   */
  findLatestByIncidentId(incidentId: string): Promise<SimulationRun | null>;
  
  // ==========================================================================
  // Count
  // ==========================================================================
  
  /**
   * Count runs for incident
   * 
   * @param incidentId Incident ID
   * @returns Number of runs
   * @throws DatabaseUnavailableError if DB connection failed
   */
  countByIncidentId(incidentId: string): Promise<number>;
  
  /**
   * Count runs for tenant
   * 
   * @param tenantId Tenant ID
   * @param date Optional date filter (ISO 8601 date string, e.g., "2026-01-18")
   * @returns Number of runs
   * @throws DatabaseUnavailableError if DB connection failed
   */
  countByTenantId(tenantId: string, date?: string | undefined): Promise<number>;
}
