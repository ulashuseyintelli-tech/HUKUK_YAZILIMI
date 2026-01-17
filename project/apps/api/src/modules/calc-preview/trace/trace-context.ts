/**
 * Phase 5.1 - Trace Context
 * 
 * Request-scoped container for trace data collection.
 * Uses a simple class instance (injected per request in NestJS).
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.1
 */

import { Injectable, Scope } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import {
  TraceBundle,
  TraceMeta,
  TraceInput,
  TraceInputSummary,
  TraceCacheInfo,
  TraceCacheNamespaceInfo,
  TraceCircuitBreakerInfo,
  TraceCircuitState,
  TraceCircuitEvent,
  TraceRateLimitInfo,
  TraceDependencyCall,
  TracePolicyInfo,
  TraceWarning,
  TraceResult,
  TraceShadowCompare,
  DependencyOutcome,
  TraceFallbackEvidence,
  TraceResultStatus,
} from './trace.types';
import { DependencyName } from '../circuit-breaker';
import { CacheNamespace } from '../cache';

// ============================================================================
// SERVICE VERSION (from env or default)
// ============================================================================

const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const GIT_COMMIT = process.env.GIT_COMMIT || undefined;
const BUILD_NUMBER = process.env.BUILD_NUMBER || undefined;

// ============================================================================
// TRACE CONTEXT - REQUEST SCOPED
// ============================================================================

@Injectable({ scope: Scope.REQUEST })
export class TraceContext {
  private readonly traceId: string;
  private requestId: string;
  private tenantId: string = 'default';
  private clientId?: string;
  private endpoint: string = '/calc/preview/light';
  
  private startedAt: Date;
  private finishedAt?: Date;
  
  // Input
  private inputFingerprint?: string;
  private inputSummary?: TraceInputSummary;
  
  // Cache
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheStaleServed = 0;
  private cacheByNamespace = new Map<string, TraceCacheNamespaceInfo>();
  
  // Circuit Breaker
  private circuitStates = new Map<string, TraceCircuitState>();
  private circuitEvents: TraceCircuitEvent[] = [];
  
  // Rate Limit
  private rateLimitApplied = false;
  private rateLimitBucket?: { burst: number; steadyPerSec: number };
  private rateLimitRemaining?: number;
  private rateLimitRetryAfter?: number;
  
  // Dependencies
  private dependencyCalls: TraceDependencyCall[] = [];
  
  // Policy
  private policyInfo?: TracePolicyInfo;
  
  // Warnings
  private warnings: TraceWarning[] = [];
  
  // Result
  private resultStatus: TraceResultStatus = 'OK';
  private resultTotals?: { interest?: number; fees?: number; total?: number };
  private breakdownTruncated = false;
  
  // Shadow Compare
  private shadowCompare?: TraceShadowCompare;

  constructor() {
    this.traceId = randomUUID();
    this.requestId = this.traceId; // Default to traceId
    this.startedAt = new Date();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize trace context with request info
   */
  init(params: {
    requestId?: string;
    tenantId: string;
    clientId?: string;
    endpoint?: string;
  }): void {
    this.requestId = params.requestId || this.traceId;
    this.tenantId = params.tenantId;
    this.clientId = params.clientId;
    this.endpoint = params.endpoint || this.endpoint;
  }

  /**
   * Set input (PII-free normalized summary)
   */
  setInput(summary: TraceInputSummary): void {
    this.inputSummary = summary;
    this.inputFingerprint = this.computeFingerprint(summary);
  }

  // ============================================================================
  // CACHE TRACKING
  // ============================================================================

  recordCacheHit(namespace: CacheNamespace, stale: boolean, version?: string): void {
    this.cacheHits++;
    if (stale) this.cacheStaleServed++;
    
    const ns = this.getOrCreateNamespace(namespace);
    ns.hit++;
    if (stale) ns.stale++;
    if (version) ns.version = version;
  }

  recordCacheMiss(namespace: CacheNamespace): void {
    this.cacheMisses++;
    
    const ns = this.getOrCreateNamespace(namespace);
    ns.miss++;
  }

  private getOrCreateNamespace(namespace: string): TraceCacheNamespaceInfo {
    let ns = this.cacheByNamespace.get(namespace);
    if (!ns) {
      ns = { hit: 0, miss: 0, stale: 0 };
      this.cacheByNamespace.set(namespace, ns);
    }
    return ns;
  }

  // ============================================================================
  // CIRCUIT BREAKER TRACKING
  // ============================================================================

  recordCircuitState(dependency: DependencyName, state: TraceCircuitState): void {
    this.circuitStates.set(dependency, state);
  }

  recordCircuitEvent(event: TraceCircuitEvent): void {
    this.circuitEvents.push(event);
  }

  // ============================================================================
  // RATE LIMIT TRACKING
  // ============================================================================

  recordRateLimit(params: {
    applied: boolean;
    bucket?: { burst: number; steadyPerSec: number };
    remaining?: number;
    retryAfterMs?: number;
  }): void {
    this.rateLimitApplied = params.applied;
    this.rateLimitBucket = params.bucket;
    this.rateLimitRemaining = params.remaining;
    this.rateLimitRetryAfter = params.retryAfterMs;
  }

  // ============================================================================
  // DEPENDENCY CALL TRACKING
  // ============================================================================

  /**
   * Start tracking a dependency call
   * Returns a function to call when the call completes
   */
  startDependencyCall(name: DependencyName | string): {
    callId: string;
    complete: (outcome: DependencyOutcome, domainValid?: boolean, evidence?: TraceFallbackEvidence) => void;
  } {
    const callId = randomUUID().substring(0, 8);
    const startedAt = new Date();
    
    return {
      callId,
      complete: (outcome, domainValid, evidence) => {
        this.dependencyCalls.push({
          name,
          callId,
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          outcome,
          domainValid,
          evidence,
        });
      },
    };
  }

  /**
   * Record a completed dependency call directly
   */
  recordDependencyCall(call: TraceDependencyCall): void {
    this.dependencyCalls.push(call);
  }

  // ============================================================================
  // POLICY TRACKING
  // ============================================================================

  recordPolicy(info: TracePolicyInfo): void {
    this.policyInfo = info;
  }

  // ============================================================================
  // WARNING TRACKING
  // ============================================================================

  addWarning(warning: TraceWarning): void {
    this.warnings.push(warning);
  }

  // ============================================================================
  // RESULT TRACKING
  // ============================================================================

  setResult(params: {
    status: TraceResultStatus;
    totals?: { interest?: number; fees?: number; total?: number };
    breakdownTruncated?: boolean;
  }): void {
    this.resultStatus = params.status;
    this.resultTotals = params.totals;
    this.breakdownTruncated = params.breakdownTruncated || false;
  }

  // ============================================================================
  // SHADOW COMPARE TRACKING
  // ============================================================================

  recordShadowCompare(compare: TraceShadowCompare): void {
    this.shadowCompare = compare;
  }

  // ============================================================================
  // FINALIZE & EXPORT
  // ============================================================================

  /**
   * Finalize and export the trace bundle
   */
  finalize(): TraceBundle {
    this.finishedAt = new Date();
    
    const meta: TraceMeta = {
      traceId: this.traceId,
      requestId: this.requestId,
      tenantId: this.tenantId,
      clientId: this.clientId,
      endpoint: this.endpoint,
      mode: 'PREVIEW',
      startedAt: this.startedAt.toISOString(),
      finishedAt: this.finishedAt.toISOString(),
      durationMs: this.finishedAt.getTime() - this.startedAt.getTime(),
      version: {
        service: SERVICE_VERSION,
        commit: GIT_COMMIT,
        build: BUILD_NUMBER,
      },
    };
    
    const input: TraceInput = {
      fingerprint: this.inputFingerprint || 'unknown',
      normalizedSummary: this.inputSummary || { principalAmount: 0, currency: 'TRY' },
    };
    
    const cache: TraceCacheInfo = {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      staleServed: this.cacheStaleServed,
      byNamespace: Object.fromEntries(this.cacheByNamespace),
    };
    
    const circuitBreaker: TraceCircuitBreakerInfo = {
      byDependency: Object.fromEntries(this.circuitStates),
      events: this.circuitEvents,
    };
    
    const rateLimit: TraceRateLimitInfo = {
      applied: this.rateLimitApplied,
      bucket: this.rateLimitBucket,
      remainingTokens: this.rateLimitRemaining,
      retryAfterMs: this.rateLimitRetryAfter,
    };
    
    const result: TraceResult = {
      status: this.resultStatus,
      totals: this.resultTotals,
      breakdownTruncated: this.breakdownTruncated,
    };
    
    return {
      meta,
      input,
      cache,
      circuitBreaker,
      rateLimit,
      dependencies: this.dependencyCalls,
      policy: this.policyInfo || {},
      warnings: this.warnings,
      result,
      shadowCompare: this.shadowCompare,
    };
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getTraceId(): string {
    return this.traceId;
  }

  getResultStatus(): TraceResultStatus {
    return this.resultStatus;
  }

  hasFallbackOutcome(): boolean {
    return this.dependencyCalls.some(c => c.outcome === 'FALLBACK');
  }

  hasCircuitOpen(): boolean {
    for (const state of this.circuitStates.values()) {
      if (state.state === 'OPEN') return true;
    }
    return false;
  }

  hasCriticalShadowDiff(): boolean {
    return this.shadowCompare?.severity === 'CRITICAL';
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private computeFingerprint(summary: TraceInputSummary): string {
    const normalized = JSON.stringify({
      p: summary.principalAmount,
      c: summary.currency,
      t: summary.interestType,
      s: summary.startDate,
      e: summary.endDate,
      ct: summary.caseType,
      dc: summary.debtorCount,
    });
    return createHash('md5').update(normalized).digest('hex').substring(0, 12);
  }
}
