/**
 * Phase 5.1 - Trace Bundle Types
 * 
 * "Truth artifact" - log değil, kanıt.
 * 
 * PII/KVKK: Ham borçlu adı, TCKN, adres, telefon, email, belge metni YOK.
 * normalizedSummary sadece tip + sayı içerir.
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.1
 */

import { CircuitState, DependencyName } from '../circuit-breaker';

// ============================================================================
// TRACE BUNDLE - ANA ŞEMA
// ============================================================================

export interface TraceBundle {
  meta: TraceMeta;
  input: TraceInput;
  cache: TraceCacheInfo;
  circuitBreaker: TraceCircuitBreakerInfo;
  rateLimit: TraceRateLimitInfo;
  dependencies: TraceDependencyCall[];
  policy: TracePolicyInfo;
  warnings: TraceWarning[];
  result: TraceResult;
  shadowCompare?: TraceShadowCompare;
}

// ============================================================================
// META
// ============================================================================

export interface TraceMeta {
  traceId: string;
  requestId: string;
  tenantId: string;
  clientId?: string;
  endpoint: string;
  mode: 'PREVIEW';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  version: {
    service: string;
    commit?: string;
    build?: string;
  };
}

// ============================================================================
// INPUT (PII-FREE)
// ============================================================================

export interface TraceInput {
  /** Normalize edilmiş input hash */
  fingerprint: string;
  /** PII-free özet (sayısal + type) */
  normalizedSummary: TraceInputSummary;
}

export interface TraceInputSummary {
  principalAmount: number;
  currency: string;
  interestType?: string;
  startDate?: string;
  endDate?: string;
  caseType?: string;
  debtorCount?: number;
  skipInterest?: boolean;
  skipFee?: boolean;
  skipPolicy?: boolean;
}

// ============================================================================
// CACHE INFO
// ============================================================================

export interface TraceCacheInfo {
  hits: number;
  misses: number;
  staleServed: number;
  byNamespace: Record<string, TraceCacheNamespaceInfo>;
}

export interface TraceCacheNamespaceInfo {
  hit: number;
  miss: number;
  stale: number;
  version?: string;
  ttlSec?: number;
}

// ============================================================================
// CIRCUIT BREAKER INFO
// ============================================================================

export interface TraceCircuitBreakerInfo {
  byDependency: Record<string, TraceCircuitState>;
  events: TraceCircuitEvent[];
}

export interface TraceCircuitState {
  state: CircuitState;
  openedAt?: string;
  halfOpenTrials?: number;
  halfOpenFailures?: number;
}

export interface TraceCircuitEvent {
  dependency: string;
  from: CircuitState;
  to: CircuitState;
  reason: string;
  at: string;
}

// ============================================================================
// RATE LIMIT INFO
// ============================================================================

export interface TraceRateLimitInfo {
  applied: boolean;
  bucket?: {
    burst: number;
    steadyPerSec: number;
  };
  remainingTokens?: number;
  retryAfterMs?: number;
}

// ============================================================================
// DEPENDENCY CALLS
// ============================================================================

export type DependencyOutcome = 'SUCCESS' | 'FALLBACK' | 'ERROR' | 'SKIPPED';

export interface TraceDependencyCall {
  name: DependencyName | string;
  callId: string;
  startedAt: string;
  durationMs: number;
  outcome: DependencyOutcome;
  domainValid?: boolean;
  evidence?: TraceFallbackEvidence;
}

export interface TraceFallbackEvidence {
  source: 'CACHED_STALE' | 'DEFAULT' | 'UNAVAILABLE';
  circuitState: CircuitState;
  reason: string;
}

// ============================================================================
// POLICY INFO
// ============================================================================

export interface TracePolicyInfo {
  softCheck?: {
    outcome: 'PASS' | 'WARN' | 'BLOCK' | 'SKIPPED';
    reasons?: TracePolicyReason[];
  };
}

export interface TracePolicyReason {
  code: string;
  severity: 'info' | 'warning' | 'error';
}

// ============================================================================
// WARNINGS
// ============================================================================

export interface TraceWarning {
  code: string;
  severity: 'INFO' | 'WARN' | 'ERROR';
  message?: string;
}

// ============================================================================
// RESULT
// ============================================================================

export type TraceResultStatus = 'OK' | 'DEGRADED' | 'UNAVAILABLE';

export interface TraceResult {
  status: TraceResultStatus;
  totals?: TraceResultTotals;
  breakdownTruncated?: boolean;
}

export interface TraceResultTotals {
  interest?: number;
  fees?: number;
  total?: number;
}

// ============================================================================
// SHADOW COMPARE
// ============================================================================

export interface TraceShadowCompare {
  enabled: boolean;
  severity?: 'NOISE' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  category?: string;
  diffSummary?: Record<string, unknown>;
}

// ============================================================================
// SAMPLING POLICY
// ============================================================================

export interface TraceSamplingPolicy {
  /** Default sampling rate (0-1) */
  defaultRate: number;
  
  /** Force sample on these conditions */
  forceOn: {
    fallbackOutcome: boolean;
    criticalShadowDiff: boolean;
    circuitOpen: boolean;
    degradedResult: boolean;
  };
  
  /** Header to force sampling */
  forceHeader: string;
}

export const DEFAULT_SAMPLING_POLICY: TraceSamplingPolicy = {
  defaultRate: 0.01, // 1%
  forceOn: {
    fallbackOutcome: true,
    criticalShadowDiff: true,
    circuitOpen: true,
    degradedResult: true,
  },
  forceHeader: 'X-Force-Trace',
};
