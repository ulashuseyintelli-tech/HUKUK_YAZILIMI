/**
 * Trace Types
 * 
 * Types for trace retrieval.
 * Matches backend TraceBundle exactly.
 */

import type { TraceResultStatus } from './enums';

// ============================================================================
// TRACE FILTERS
// ============================================================================

export interface TraceFilters {
  readonly tenantId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly status?: TraceResultStatus;
  readonly limit?: number;
  readonly cursor?: string;
}

// ============================================================================
// PAGINATED LIST
// ============================================================================

export interface PaginatedTraceList {
  readonly items: readonly TraceSummary[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly totalCount?: number;
}

export interface TraceSummary {
  readonly traceId: string;
  readonly tenantId: string;
  readonly timestamp: string;
  readonly status: TraceResultStatus;
  readonly durationMs: number;
  readonly endpoint: string;
}

// ============================================================================
// TRACE BUNDLE (Full)
// ============================================================================

export interface TraceBundle {
  readonly meta: TraceMeta;
  readonly input: TraceInput;
  readonly cache: TraceCacheInfo;
  readonly circuitBreaker: TraceCircuitBreakerInfo;
  readonly rateLimit: TraceRateLimitInfo;
  readonly dependencies: readonly TraceDependencyCall[];
  readonly policy: TracePolicyInfo;
  readonly warnings: readonly TraceWarning[];
  readonly result: TraceResult;
  readonly shadowCompare?: TraceShadowCompare;
}

// ============================================================================
// TRACE META
// ============================================================================

export interface TraceMeta {
  readonly traceId: string;
  readonly requestId: string;
  readonly tenantId: string;
  readonly clientId?: string;
  readonly endpoint: string;
  readonly mode: 'PREVIEW';
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly version: TraceVersionInfo;
  
  // Region-aware (Phase 6C)
  readonly regionId?: string;
  readonly tenantScope?: string;
}

export interface TraceVersionInfo {
  readonly service: string;
  readonly commit?: string;
  readonly build?: string;
}

// ============================================================================
// TRACE INPUT (PII-FREE)
// ============================================================================

export interface TraceInput {
  readonly fingerprint: string;
  readonly normalizedSummary: TraceInputSummary;
}

export interface TraceInputSummary {
  readonly principalAmount: number;
  readonly currency: string;
  readonly interestType?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly caseType?: string;
  readonly debtorCount?: number;
  readonly skipInterest?: boolean;
  readonly skipFee?: boolean;
  readonly skipPolicy?: boolean;
}

// ============================================================================
// TRACE CACHE
// ============================================================================

export interface TraceCacheInfo {
  readonly hits: number;
  readonly misses: number;
  readonly staleServed: number;
  readonly byNamespace: Readonly<Record<string, TraceCacheNamespaceInfo>>;
}

export interface TraceCacheNamespaceInfo {
  readonly hit: number;
  readonly miss: number;
  readonly stale: number;
  readonly version?: string;
  readonly ttlSec?: number;
}

// ============================================================================
// TRACE CIRCUIT BREAKER
// ============================================================================

export interface TraceCircuitBreakerInfo {
  readonly byDependency: Readonly<Record<string, TraceCircuitState>>;
  readonly events: readonly TraceCircuitEvent[];
}

export interface TraceCircuitState {
  readonly state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  readonly openedAt?: string;
  readonly halfOpenTrials?: number;
  readonly halfOpenFailures?: number;
}

export interface TraceCircuitEvent {
  readonly dependency: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly at: string;
}

// ============================================================================
// TRACE RATE LIMIT
// ============================================================================

export interface TraceRateLimitInfo {
  readonly applied: boolean;
  readonly bucket?: TraceRateLimitBucket;
  readonly remainingTokens?: number;
  readonly retryAfterMs?: number;
}

export interface TraceRateLimitBucket {
  readonly burst: number;
  readonly steadyPerSec: number;
}

// ============================================================================
// TRACE DEPENDENCIES
// ============================================================================

export type DependencyOutcome = 'SUCCESS' | 'FALLBACK' | 'ERROR' | 'SKIPPED';

export interface TraceDependencyCall {
  readonly name: string;
  readonly callId: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly outcome: DependencyOutcome;
  readonly domainValid?: boolean;
  readonly evidence?: TraceFallbackEvidence;
}

export interface TraceFallbackEvidence {
  readonly source: 'CACHED_STALE' | 'DEFAULT' | 'UNAVAILABLE';
  readonly circuitState: string;
  readonly reason: string;
}

// ============================================================================
// TRACE POLICY
// ============================================================================

export interface TracePolicyInfo {
  readonly softCheck?: TracePolicySoftCheck;
}

export interface TracePolicySoftCheck {
  readonly outcome: 'PASS' | 'WARN' | 'BLOCK' | 'SKIPPED';
  readonly reasons?: readonly TracePolicyReason[];
}

export interface TracePolicyReason {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
}

// ============================================================================
// TRACE WARNINGS
// ============================================================================

export interface TraceWarning {
  readonly code: string;
  readonly severity: 'INFO' | 'WARN' | 'ERROR';
  readonly message?: string;
}

// ============================================================================
// TRACE RESULT
// ============================================================================

export interface TraceResult {
  readonly status: TraceResultStatus;
  readonly totals?: TraceResultTotals;
  readonly breakdownTruncated?: boolean;
}

export interface TraceResultTotals {
  readonly interest?: number;
  readonly fees?: number;
  readonly total?: number;
}

// ============================================================================
// TRACE SHADOW COMPARE
// ============================================================================

export interface TraceShadowCompare {
  readonly enabled: boolean;
  readonly severity?: 'NOISE' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  readonly category?: string;
  readonly diffSummary?: Readonly<Record<string, unknown>>;
}
