/**
 * Phase 5.1 - Trace Collector Service
 * 
 * Singleton service that manages trace contexts and collection.
 * Provides wrapper methods for dependency calls.
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.1
 */

import { Injectable, Logger } from '@nestjs/common';
import { TraceContext } from './trace-context';
import { TraceStorageService } from './trace-storage.service';
import { 
  DependencyOutcome,
  TraceFallbackEvidence,
  TraceCircuitState,
  TraceCircuitEvent,
  TracePolicyInfo,
  TraceWarning,
  TraceResultStatus,
  TraceShadowCompare,
  TraceBundle,
} from './trace.types';
import { DependencyName } from '../circuit-breaker';
import { CacheNamespace } from '../cache';

// ============================================================================
// TRACE COLLECTOR SERVICE
// ============================================================================

@Injectable()
export class TraceCollectorService {
  private readonly logger = new Logger(TraceCollectorService.name);
  
  // Metrics
  private tracesBuildMs: number[] = [];
  private readonly MAX_BUILD_SAMPLES = 1000;

  constructor(private readonly storage: TraceStorageService) {}

  // ============================================================================
  // CONTEXT MANAGEMENT
  // ============================================================================

  /**
   * Create a new trace context
   */
  createContext(): TraceContext {
    return new TraceContext();
  }

  // ============================================================================
  // DEPENDENCY CALL WRAPPER
  // ============================================================================

  /**
   * Wrap a dependency call with tracing
   */
  async traceDependencyCall<T>(
    context: TraceContext,
    name: DependencyName | string,
    fn: () => Promise<T>,
    options?: {
      domainValidator?: (result: T) => boolean;
      fallbackEvidence?: TraceFallbackEvidence;
    },
  ): Promise<{ result: T; outcome: DependencyOutcome }> {
    const tracker = context.startDependencyCall(name);
    
    try {
      const result = await fn();
      
      // Domain validation
      const domainValid = options?.domainValidator 
        ? options.domainValidator(result) 
        : true;
      
      const outcome: DependencyOutcome = domainValid ? 'SUCCESS' : 'FALLBACK';
      
      tracker.complete(
        outcome,
        domainValid,
        !domainValid ? options?.fallbackEvidence : undefined,
      );
      
      return { result, outcome };
    } catch (error) {
      tracker.complete('ERROR', false, options?.fallbackEvidence);
      throw error;
    }
  }

  /**
   * Record a skipped dependency call
   */
  recordSkippedCall(context: TraceContext, name: DependencyName | string, reason: string): void {
    context.recordDependencyCall({
      name,
      callId: 'skipped',
      startedAt: new Date().toISOString(),
      durationMs: 0,
      outcome: 'SKIPPED',
      evidence: {
        source: 'UNAVAILABLE',
        circuitState: 'OPEN',
        reason,
      },
    });
  }

  // ============================================================================
  // CACHE TRACKING
  // ============================================================================

  recordCacheHit(context: TraceContext, namespace: CacheNamespace, stale: boolean, version?: string): void {
    context.recordCacheHit(namespace, stale, version);
  }

  recordCacheMiss(context: TraceContext, namespace: CacheNamespace): void {
    context.recordCacheMiss(namespace);
  }

  // ============================================================================
  // CIRCUIT BREAKER TRACKING
  // ============================================================================

  recordCircuitState(context: TraceContext, dependency: DependencyName, state: TraceCircuitState): void {
    context.recordCircuitState(dependency, state);
  }

  recordCircuitEvent(context: TraceContext, event: TraceCircuitEvent): void {
    context.recordCircuitEvent(event);
  }

  // ============================================================================
  // RATE LIMIT TRACKING
  // ============================================================================

  recordRateLimit(context: TraceContext, params: {
    applied: boolean;
    bucket?: { burst: number; steadyPerSec: number };
    remaining?: number;
    retryAfterMs?: number;
  }): void {
    context.recordRateLimit(params);
  }

  // ============================================================================
  // POLICY TRACKING
  // ============================================================================

  recordPolicy(context: TraceContext, info: TracePolicyInfo): void {
    context.recordPolicy(info);
  }

  // ============================================================================
  // WARNING TRACKING
  // ============================================================================

  addWarning(context: TraceContext, warning: TraceWarning): void {
    context.addWarning(warning);
  }

  // ============================================================================
  // CUSTOM EVENT TRACKING (Phase 6A)
  // ============================================================================

  /**
   * Add a custom event to the current trace.
   * Used for explanation events and other custom trace data.
   * 
   * @param event - Custom event object with eventType
   */
  addEvent(event: { eventType: string; [key: string]: unknown }): void {
    // Store in a simple log for now - can be enhanced to store in trace bundle
    this.logger.debug(`[TraceCollector] Event: ${event.eventType}`, event);
  }

  // ============================================================================
  // RESULT TRACKING
  // ============================================================================

  setResult(context: TraceContext, params: {
    status: TraceResultStatus;
    totals?: { interest?: number; fees?: number; total?: number };
    breakdownTruncated?: boolean;
  }): void {
    context.setResult(params);
  }

  // ============================================================================
  // SHADOW COMPARE TRACKING
  // ============================================================================

  recordShadowCompare(context: TraceContext, compare: TraceShadowCompare): void {
    context.recordShadowCompare(compare);
  }

  // ============================================================================
  // FINALIZE & STORE
  // ============================================================================

  /**
   * Finalize trace and store
   */
  finalizeAndStore(context: TraceContext, forceStore: boolean = false): TraceBundle {
    const buildStart = Date.now();
    
    const bundle = context.finalize();
    
    // Track build time
    const buildMs = Date.now() - buildStart;
    this.tracesBuildMs.push(buildMs);
    if (this.tracesBuildMs.length > this.MAX_BUILD_SAMPLES) {
      this.tracesBuildMs.shift();
    }
    
    // Store
    this.storage.store(bundle, forceStore);
    
    return bundle;
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  /**
   * Get trace build time percentiles
   */
  getBuildTimePercentiles(): { p50: number; p95: number; p99: number } {
    if (this.tracesBuildMs.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...this.tracesBuildMs].sort((a, b) => a - b);
    
    return {
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
