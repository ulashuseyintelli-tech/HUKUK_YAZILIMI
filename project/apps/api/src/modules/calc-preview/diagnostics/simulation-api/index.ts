/**
 * Simulation API Module Exports
 * 
 * Sprint 2F
 */

// Module
export { SimulationApiModule } from './simulation-api.module';

// Controllers
export { SimulationController } from './simulation.controller';
export { EvidenceBundleController } from './evidence-bundle.controller';
export { LegalHoldController } from './legal-hold.controller';

// Guards
export { SimulationFeatureFlagGuard, isMutationPath, getMutationPatterns } from './guards/simulation-feature-flag.guard';
export { SimulationRBACGuard, SimulationTenant, SimulationTenantContext, SimulationRole, isValidSimulationRole } from './guards/simulation-rbac.guard';
export { SimulationRateLimitGuard, AcquireResult } from './guards/simulation-rate-limit.guard';

// Services
export { SimulationFeatureFlagService, ISimulationFeatureFlagService, SIMULATION_FEATURE_FLAGS } from './simulation-feature-flag.service';
export { SimulationRunStoreService, StoredRun, ISimulationRunStore } from './simulation-run-store.service';

// Constants
export { SIMULATION_RATE_LIMITS, SIMULATION_RATE_LIMIT_KEYS, getUtcDateString, RateLimitType } from './simulation-rate-limit.constants';

// Error Types
export {
  SimulationErrorCode,
  SimulationErrorResponse,
  SimulationDisabledException,
  IncidentNotFoundException,
  RunNotFoundException,
  BundleNotFoundException,
  ForbiddenTenantScopeException,
  SimulationAlreadyRunningException,
  TooManySimulationsException,
  CannotArchiveBaselineException,
} from './simulation-error.types';

// DTOs
export {
  SimulateRequestDto,
  SimulateResponseDto,
  RunSummaryDto,
  RunListResponseDto,
  LatestRunResponseDto,
  RunDetailResponseDto,
  ExportBundleResponseDto,
  BundleResponseDto,
  VerifyBundleResponseDto,
  LegalHoldEntryDto,
  LegalHoldListResponseDto,
  ArchiveResponseDto,
  LegalHoldStatsResponseDto,
  RunStatus,
  PaginationDto,
  BundleMetaDto,
} from './simulation.dto';
