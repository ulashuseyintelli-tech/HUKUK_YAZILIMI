/**
 * Truth Layer Domain Errors
 * 
 * Phase 9B - PostgreSQL Migration
 * 
 * Domain-specific errors for Truth Layer operations.
 * These errors represent business rule violations, not infrastructure failures.
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/design.md - Truth Layer Contract
 */

/**
 * Base class for Truth Layer domain errors
 */
export abstract class TruthLayerError extends Error {
  abstract readonly code: string;
  readonly cause?: Error | undefined;
  
  constructor(message: string, cause?: Error | undefined) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
  }
}

// ============================================================================
// Baseline Errors
// ============================================================================

/**
 * Thrown when attempting to set a second baseline for an incident.
 * 
 * Invariant: Single baseline per incident (partial unique index enforces this)
 */
export class BaselineAlreadyExistsError extends TruthLayerError {
  readonly code = 'BASELINE_ALREADY_EXISTS';
  
  constructor(
    public readonly incidentId: string,
    public readonly existingSnapshotId: string,
    public readonly attemptedSnapshotId: string,
  ) {
    super(
      `Incident ${incidentId} already has baseline snapshot ${existingSnapshotId}. ` +
      `Cannot set ${attemptedSnapshotId} as baseline.`,
    );
  }
}

// ============================================================================
// Immutability Errors
// ============================================================================

/**
 * Thrown when attempting to modify an immutable field on upsert.
 * 
 * Invariant: Immutable fields cannot change after initial insert
 */
export class ImmutableFieldViolationError extends TruthLayerError {
  readonly code = 'IMMUTABLE_FIELD_VIOLATION';
  
  constructor(
    public readonly entityType: 'SimulationRun' | 'Snapshot',
    public readonly entityId: string,
    public readonly fieldName: string,
    public readonly existingValue: unknown,
    public readonly attemptedValue: unknown,
  ) {
    super(
      `Cannot modify immutable field '${fieldName}' on ${entityType} ${entityId}. ` +
      `Existing: ${JSON.stringify(existingValue)}, Attempted: ${JSON.stringify(attemptedValue)}`,
    );
  }
}

// ============================================================================
// Status Errors
// ============================================================================

/**
 * Status rank mapping for monotonicity enforcement
 * 
 * PENDING(0) < RUNNING(1) < COMPLETED(2) = FAILED(2)
 * Terminal states (COMPLETED, FAILED) have same rank - no transition between them
 */
export const STATUS_RANK: Record<string, number> = {
  PENDING: 0,
  RUNNING: 1,
  COMPLETED: 2,
  FAILED: 2, // Terminal - same rank as COMPLETED
};

/**
 * Thrown when attempting to transition status backwards.
 * 
 * Invariant: Status can only move forward (PENDING → RUNNING → COMPLETED/FAILED)
 */
export class StatusMonotonicityViolationError extends TruthLayerError {
  readonly code = 'STATUS_MONOTONICITY_VIOLATION';
  
  constructor(
    public readonly runId: string,
    public readonly currentStatus: string,
    public readonly attemptedStatus: string,
  ) {
    const currentRank = STATUS_RANK[currentStatus] ?? -1;
    const attemptedRank = STATUS_RANK[attemptedStatus] ?? -1;
    
    super(
      `Cannot transition run ${runId} from ${currentStatus} (rank ${currentRank}) ` +
      `to ${attemptedStatus} (rank ${attemptedRank}). Status can only move forward.`,
    );
  }
}

// ============================================================================
// Reference Errors
// ============================================================================

/**
 * Thrown when snapshot's incident doesn't match run's incident.
 * 
 * Invariant: setCurrentSnapshot/setBaselineSnapshot requires incident match
 */
export class IncidentMismatchError extends TruthLayerError {
  readonly code = 'INCIDENT_MISMATCH';
  
  constructor(
    public readonly runId: string,
    public readonly runIncidentId: string,
    public readonly snapshotId: string,
    public readonly snapshotIncidentId: string,
  ) {
    super(
      `Cannot link snapshot ${snapshotId} (incident: ${snapshotIncidentId}) ` +
      `to run ${runId} (incident: ${runIncidentId}). Incident IDs must match.`,
    );
  }
}

/**
 * Thrown when snapshot's tenant doesn't match run's tenant.
 * 
 * Invariant: Cross-tenant linking is forbidden
 */
export class TenantMismatchError extends TruthLayerError {
  readonly code = 'TENANT_MISMATCH';
  
  constructor(
    public readonly runId: string,
    public readonly runTenantId: string,
    public readonly snapshotId: string,
    public readonly snapshotTenantId: string,
  ) {
    super(
      `Cannot link snapshot ${snapshotId} (tenant: ${snapshotTenantId}) ` +
      `to run ${runId} (tenant: ${runTenantId}). Cross-tenant linking forbidden.`,
    );
  }
}

/**
 * Thrown when referenced entity is not found.
 */
export class EntityNotFoundError extends TruthLayerError {
  readonly code = 'ENTITY_NOT_FOUND';
  
  constructor(
    public readonly entityType: 'SimulationRun' | 'SimulationSnapshot' | 'Snapshot' | 'Incident',
    public readonly entityId: string,
  ) {
    super(`${entityType} with ID ${entityId} not found.`);
  }
}

// ============================================================================
// Snapshot Mutation Errors
// ============================================================================

/**
 * Thrown when attempting to downgrade retention policy.
 * 
 * Invariant: Retention can only upgrade (STANDARD → PROMOTED → LEGAL_HOLD)
 */
export class RetentionDowngradeError extends TruthLayerError {
  readonly code = 'RETENTION_DOWNGRADE_FORBIDDEN';
  
  constructor(
    public readonly snapshotId: string,
    public readonly currentPolicy: string,
    public readonly attemptedPolicy: string,
  ) {
    super(
      `Cannot downgrade retention policy for snapshot ${snapshotId} ` +
      `from ${currentPolicy} to ${attemptedPolicy}. Only upgrades allowed.`,
    );
  }
}

/**
 * Thrown when attempting to unset baseline flag.
 * 
 * Invariant: is_baseline can only upgrade (false → true)
 */
export class BaselineDowngradeError extends TruthLayerError {
  readonly code = 'BASELINE_DOWNGRADE_FORBIDDEN';
  
  constructor(public readonly snapshotId: string) {
    super(
      `Cannot unset baseline flag for snapshot ${snapshotId}. ` +
      `Baseline can only be set, not unset.`,
    );
  }
}

/**
 * Thrown when attempting to release legal hold.
 * 
 * Invariant: legal_hold can only upgrade (false → true)
 */
export class LegalHoldReleaseError extends TruthLayerError {
  readonly code = 'LEGAL_HOLD_RELEASE_FORBIDDEN';
  
  constructor(public readonly snapshotId: string) {
    super(
      `Cannot release legal hold for snapshot ${snapshotId}. ` +
      `Legal hold can only be applied, not released.`,
    );
  }
}

// ============================================================================
// Run State Errors
// ============================================================================

/**
 * Thrown when attempting to set baseline on non-completed run.
 * 
 * Invariant: baseline_snapshot_id requires run.status = COMPLETED
 */
export class RunNotCompletedError extends TruthLayerError {
  readonly code = 'RUN_NOT_COMPLETED';
  
  constructor(
    public readonly runId: string,
    public readonly currentStatus: string,
  ) {
    super(
      `Cannot set baseline snapshot for run ${runId} with status ${currentStatus}. ` +
      `Run must be COMPLETED to have a baseline.`,
    );
  }
}

// ============================================================================
// Infrastructure Errors (not domain errors, but included for completeness)
// ============================================================================

/**
 * Thrown when database is unavailable.
 * 
 * Phase 9B Rule: NO FALLBACK - DB down = system down
 */
export class DatabaseUnavailableError extends Error {
  readonly code = 'DATABASE_UNAVAILABLE';
  readonly cause?: Error | undefined;
  
  constructor(message: string, cause?: Error | undefined) {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.cause = cause;
  }
}

/**
 * Thrown when startup configuration is invalid.
 * 
 * Phase 9B.5 - Task 2: Production Safety Gate
 * 
 * This error prevents the application from starting with dangerous configuration.
 * Example: InMemory backend in production environment.
 * 
 * @see snapshot-store-backend.ts
 */
export { StartupConfigurationError } from './snapshot-store-backend';

// ============================================================================
// Type Guards
// ============================================================================

export function isTruthLayerError(error: unknown): error is TruthLayerError {
  return error instanceof TruthLayerError;
}

export function isBaselineAlreadyExistsError(error: unknown): error is BaselineAlreadyExistsError {
  return error instanceof BaselineAlreadyExistsError;
}

export function isImmutableFieldViolationError(error: unknown): error is ImmutableFieldViolationError {
  return error instanceof ImmutableFieldViolationError;
}

export function isStatusMonotonicityViolationError(error: unknown): error is StatusMonotonicityViolationError {
  return error instanceof StatusMonotonicityViolationError;
}

export function isIncidentMismatchError(error: unknown): error is IncidentMismatchError {
  return error instanceof IncidentMismatchError;
}

export function isTenantMismatchError(error: unknown): error is TenantMismatchError {
  return error instanceof TenantMismatchError;
}

export function isEntityNotFoundError(error: unknown): error is EntityNotFoundError {
  return error instanceof EntityNotFoundError;
}
