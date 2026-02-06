/**
 * Manifest Retry Module
 * 
 * Phase 10 - Retry Pipeline + Digital Signature
 * 
 * @see .kiro/specs/phase-10-retry-signature/design.md
 */

// Error Classifier
export {
  classifyError,
  ClassifierDecision,
  ManifestErrorCode,
  ManifestErrorClassifier,
  type ClassifiedError,
} from './manifest-error-classifier';

// Types
export {
  // Retry Queue Types
  type RetryQueueStatus,
  type DoneReason,
  type RetrySource,
  type RetryQueueJob,
  type CreateRetryJobInput,
  type EnqueueResult,
  type ClaimResult,
  type ScheduleRetryInput,
  type MarkDoneInput,
  // DLQ Types
  type DlqStatus,
  type DlqEntry,
  type CreateDlqEntryInput,
  type ResolveDlqInput,
  type RedriveResult,
  type DlqQueryOptions,
  type DlqQueryResult,
  // Backoff
  BACKOFF_CONFIG,
  calculateBackoff,
  calculateNextAttemptAt,
} from './manifest-retry.types';

// Repositories
export {
  type IManifestRetryQueueRepository,
  type RetryQueueStats,
  PrismaManifestRetryQueueRepository,
} from './manifest-retry-queue.repository';

export {
  type IManifestDlqRepository,
  type DlqStats,
  PrismaManifestDlqRepository,
  DlqRedriveError,
  type DlqRedriveErrorCode,
} from './manifest-dlq.repository';

// Worker Configuration
export {
  type ManifestRetryWorkerConfig,
  DEFAULT_WORKER_CONFIG,
  generateWorkerId,
} from './manifest-retry-worker.config';

// Worker Service
export {
  ManifestRetryWorkerService,
  CircuitBreaker,
  NoOpWorkerMetrics,
  type ManifestWriteResult,
  type IManifestWriter,
  type WorkerIterationResult,
  type IWorkerMetrics,
  type CircuitBreakerState,
} from './manifest-retry-worker.service';

// Admin Controller & DTOs
export { ManifestAdminController } from './manifest-admin.controller';
export {
  AdminRetryResponseDto,
  RetryQueueStatsResponseDto,
  DlqQueryDto,
  DlqQueryResponseDto,
  DlqEntryDto,
  DlqResolveDto,
  DlqResolveResponseDto,
  DlqRedriveResponseDto,
} from './manifest-admin.dto';

// Cursor Pagination (Phase 10.2)
export {
  encodeCursor,
  decodeCursor,
  createCursorFromRecord,
  buildCursorWhereClause,
  buildCursorOrderByClause,
  buildPaginationQueryParts,
  processPaginatedResults,
  validateLimit,
  isValidCursorFormat,
  CursorValidationError,
  type CursorData,
  type CursorPaginationOptions,
  type CursorPaginatedResult,
  type DecodedCursor,
} from './cursor-pagination';

// Worker Safety (Phase 10.2)
export {
  ManifestRetryWorkerSafety,
  PauseReason,
  DEFAULT_WORKER_SAFETY_CONFIG,
  type WorkerSafetyConfig,
  type WorkerSafetyDbState,
  type WorkerSafetyState,
} from './manifest-retry-worker-safety.service';
