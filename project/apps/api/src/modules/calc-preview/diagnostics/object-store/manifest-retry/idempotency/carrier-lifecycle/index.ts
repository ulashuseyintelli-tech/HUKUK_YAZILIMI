/**
 * Carrier Lifecycle Module - Phase 10.5
 * 
 * Cross-queue consistency for carrier propagation.
 * Defines behavior for Retry, DLQ, and Redrive paths.
 * 
 * @see ADR-008 v1.3: Queue/Job Boundary Context Propagation
 */

// Types
export {
  // V2 Carrier
  IdempotencyContextCarrierV2,
  
  // Failure tracking
  FailureEntry,
  JobFailureInput,
  
  // DLQ
  DlqReason,
  
  // Redrive
  RedriveContext,
  
  // Size limit
  CarrierSizeLimitResult,
  CarrierSizeLimitAction,
  CarrierSizeExceededError,
  
  // Constants
  CARRIER_VERSION_V2,
  MAX_CARRIER_SIZE_BYTES,
  MAX_FAILURE_HISTORY_SIZE,
  MAX_ERROR_MESSAGE_LENGTH,
  MIN_FAILURE_HISTORY_SIZE,
  
  // Type guards
  isCarrierV1,
  isCarrierV2,
  isValidCarrier,
} from './carrier-lifecycle.types';

// Version upgrade
export {
  upgradeCarrierToV2,
  ensureCarrierV2,
  needsUpgrade,
  UpgradeResult,
  UpgradeFailureReason,
} from './carrier-version-upgrade';

// Retry carrier mutator
export {
  mutateCarrierForRetry,
  hasFailureHistory,
  getFailureCount,
  RetryMutationResult,
} from './retry-carrier-mutator';

// Metrics
export {
  retryMutationMetric,
  dlqEnrichmentMetric,
  redriveCloneMetric,
  sizeEnforcementMetric,
  resetAllMetrics,
} from './carrier-lifecycle-metrics';

// DLQ carrier enricher
export {
  enrichCarrierForDlq,
  isInDlq,
  getDlqReason,
  getTimeInDlq,
  DlqEnrichmentResult,
} from './dlq-carrier-enricher';

// Redrive carrier cloner
export {
  cloneCarrierForRedrive,
  wasRedriven,
  getRedriveDepth,
  getRedriveSource,
  getRedrivenBy,
  RedriveCloneResult,
} from './redrive-carrier-cloner';

// Carrier size limiter
export {
  enforceCarrierSizeLimit,
  calculateCarrierSize,
  isWithinSizeLimit,
  getCarrierSizeInfo,
  SizeLimitOptions,
  CarrierSizeInfo,
} from './carrier-size-limiter';

// Worker carrier handler
export {
  validateInboundCarrier,
  handleRetryCarrier,
  handleDlqCarrier,
  SimpleWorkerCarrierMetrics,
  WorkerCarrierSizeExceededError,
  CARRIER_SIZE_EXCEEDED_ERROR_CODE,
  IWorkerCarrierMetrics,
  RetryCarrierResult,
  DlqCarrierResult,
} from './worker-carrier-handler';

// Phase 11.1 - Degraded context types
export {
  CarrierDropReasonV2,
  DegradedContext,
  MinimalCarrierContext,
  InboundValidationResult,
  InboundValidationFull,
  InboundValidationMinimal,
  MAX_CARRIER_SNAPSHOT_CHARS,
  sanitizeCarrierSnapshot,
  extractMinimalFields,
  buildMinimalResult,
} from './degraded-context.types';

// Phase 11.1 - Inbound metric
export {
  carrierInboundMetric,
} from './carrier-lifecycle-metrics';

// Phase 11.2 - DLQ carrier storage
export {
  prepareCarrierForDlqStorage,
  resolveCarrierForRedrive,
  createMinimalCarrierFromDlq,
  DlqCarrierStorageFields,
} from './dlq-carrier-storage';

// Phase 11.2 - DLQ storage metrics
export {
  dlqStorageMetric,
  dlqStorageTruncatedMetric,
} from './carrier-lifecycle-metrics';

// Phase 11.3 - Redrive depth calculator
export {
  calculateRedriveDepth,
  DepthCalculationResult,
} from './redrive-depth-calculator';

// Phase 11.3 - Redrive depth enforcer
export {
  enforceRedriveDepthLimit,
  RedriveDepthExceededError,
  DepthEnforcementResult,
  MAX_REDRIVE_DEPTH,
} from './redrive-depth-enforcer';

// Phase 11.3 - Redrive depth metrics
export {
  redriveDepthHistogram,
} from './carrier-lifecycle-metrics';
