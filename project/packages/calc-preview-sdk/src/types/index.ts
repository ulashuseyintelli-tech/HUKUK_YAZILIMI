/**
 * SDK Types - Public Exports
 */

// Config
export type {
  SdkConfig,
  RetryConfig,
  LoggingConfig,
  LogLevel,
  SdkLogger,
  SafeLogMeta,
} from './config';

export { DEFAULT_CONFIG } from './config';

// Region (Phase 6C)
export type {
  RegionId,
  RegionRoutingMode,
  RegionConfig,
} from './region';

export {
  DEFAULT_REGION,
  KNOWN_REGIONS,
  isValidRegionId,
} from './region';

// Enums
export type {
  PolicyOutcome,
  ExplanationSeverity,
  TraceResultStatus,
  PreviewStatus,
  InterestTypeCode,
  CurrencyCode,
  RecommendedAction,
} from './enums';

export {
  POLICY_OUTCOMES,
  EXPLANATION_SEVERITIES,
  TRACE_RESULT_STATUSES,
  PREVIEW_STATUSES,
  INTEREST_TYPE_CODES,
  CURRENCY_CODES,
  RECOMMENDED_ACTIONS,
} from './enums';

// Preview
export type {
  PreviewRequest,
  PreviewResponse,
  ResponseMeta,
  InterestPreviewData,
  InterestSegment,
  SegmentsMeta,
  CoverageInfo,
  FeePreviewData,
  FeeBreakdown,
  PolicyPreviewData,
  PolicySoftWarning,
  PolicyExplanation,
  VersionInfo,
  ResponseError,
  ResponseWarning,
  UxGuidance,
} from './preview';

// Trace
export type {
  TraceFilters,
  PaginatedTraceList,
  TraceSummary,
  TraceBundle,
  TraceMeta,
  TraceVersionInfo,
  TraceInput,
  TraceInputSummary,
  TraceCacheInfo,
  TraceCacheNamespaceInfo,
  TraceCircuitBreakerInfo,
  TraceCircuitState,
  TraceCircuitEvent,
  TraceRateLimitInfo,
  TraceRateLimitBucket,
  DependencyOutcome,
  TraceDependencyCall,
  TraceFallbackEvidence,
  TracePolicyInfo,
  TracePolicySoftCheck,
  TracePolicyReason,
  TraceWarning,
  TraceResult,
  TraceResultTotals,
  TraceShadowCompare,
} from './trace';
