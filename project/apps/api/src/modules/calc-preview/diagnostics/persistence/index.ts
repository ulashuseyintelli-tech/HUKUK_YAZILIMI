/**
 * Persistence Layer - Phase 9B PostgreSQL Migration
 * 
 * Truth Layer repository interfaces and domain errors.
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/design.md
 */

// Domain Errors
export {
  TruthLayerError,
  BaselineAlreadyExistsError,
  ImmutableFieldViolationError,
  StatusMonotonicityViolationError,
  IncidentMismatchError,
  TenantMismatchError,
  EntityNotFoundError,
  RetentionDowngradeError,
  BaselineDowngradeError,
  LegalHoldReleaseError,
  RunNotCompletedError,
  DatabaseUnavailableError,
  STATUS_RANK,
  // Type guards
  isTruthLayerError,
  isBaselineAlreadyExistsError,
  isImmutableFieldViolationError,
  isStatusMonotonicityViolationError,
  isIncidentMismatchError,
  isTenantMismatchError,
  isEntityNotFoundError,
} from './truth-layer-errors';

// Simulation Run Repository
export {
  ISimulationRunRepository,
  SimulationRun,
  SimulationRunInput,
  SimulationRunStatus,
  PaginatedRunsResult,
  ListRunsOptions,
} from './simulation-run-repository.interface';

// Snapshot Repository
export {
  ISnapshotRepository,
  Snapshot,
  SnapshotInput,
  SnapshotKind,
  EvidenceVerdict,
  ApplyLegalHoldResult,
  SetRetentionPolicyResult,
  LegalHoldStats,
} from './snapshot-repository.interface';

// Prisma Implementations
export { PrismaSimulationRunRepository } from './prisma-simulation-run.repository';
export { PrismaSnapshotRepository } from './prisma-snapshot.repository';

// Snapshot Store Interface (Phase 9B.5)
export {
  ISnapshotStore,
  SimulationSnapshot,
  CreateSnapshotInput as ISnapshotStoreCreateInput,
  ApplyLegalHoldResult as ISnapshotStoreApplyLegalHoldResult,
  SetRetentionPolicyResult as ISnapshotStoreSetRetentionPolicyResult,
  LegalHoldStats as ISnapshotStoreLegalHoldStats,
  SNAPSHOT_STORE,
} from './snapshot-store.interface';

// Store Services
export {
  SnapshotStoreService,
  SnapshotValidationError,
  SNAPSHOT_REPOSITORY,
} from './snapshot-store.service';

// Module
export { TruthLayerModule } from './truth-layer.module';
