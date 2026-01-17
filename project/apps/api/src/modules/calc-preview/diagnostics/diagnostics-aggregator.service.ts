/**
 * Diagnostics Aggregator Service
 * 
 * Phase 7A - Sprint 1 & 2
 * 
 * Mevcut servisleri sorgulayarak diagnostics verisi toplar.
 * Yeni veri kaynağı OLUŞTURMAZ, sadece mevcut servisleri birleştirir.
 * 
 * Sprint 2: Trace query metodları eklendi.
 * Kritik: "global query" yok, tenantId parametresi olmadan method yok.
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { CalcPreviewCircuitBreakerService } from '../circuit-breaker/calc-preview-circuit-breaker.service';
import { CalcPreviewRateLimitService } from '../rate-limit/calc-preview-rate-limit.service';
import { VersionedCacheService } from '../cache/versioned-cache.service';
import { CalcPreviewMetricsService } from '../metrics/calc-preview-metrics.service';
import { TraceStorageService } from '../trace/trace-storage.service';
import { TraceBundle } from '../trace/trace.types';
import {
  CacheHealthInfo,
  CircuitBreakerHealthInfo,
  RateLimitHealthInfo,
  PolicyEngineHealthInfo,
  LatencyMetrics,
  RateMetrics,
  CountMetrics,
  MetricsWindow,
  METRICS_WINDOW_MS,
  TraceListQuery,
  DiagnosticsTraceSummary,
  TraceCursor,
  TRACE_QUERY_LIMITS,
} from './diagnostics.types';
import {
  DetectionContext,
  MetricsSnapshot,
  CircuitBreakerSnapshot,
  RateLimitSnapshot,
} from './diagnostics-incident.service';

// ============================================================================
// AGGREGATED DATA TYPES
// ============================================================================

export interface AggregatedHealthData {
  cache: CacheHealthInfo;
  circuitBreakers: Record<string, CircuitBreakerHealthInfo>;
  rateLimit: RateLimitHealthInfo;
  policyEngine: PolicyEngineHealthInfo;
  openBreakerCount: number;
}

export interface AggregatedMetricsData {
  latency: LatencyMetrics;
  rates: RateMetrics;
  counts: CountMetrics;
}

/**
 * Trace query result
 */
export interface TraceQueryResult {
  traces: DiagnosticsTraceSummary[];
  total: number;
  nextCursor?: string | undefined;
  hasMore: boolean;
}

// ============================================================================
// AGGREGATOR SERVICE
// ============================================================================

@Injectable()
export class DiagnosticsAggregatorService {
  private readonly logger = new Logger(DiagnosticsAggregatorService.name);

  constructor(
    private readonly circuitBreaker: CalcPreviewCircuitBreakerService,
    private readonly rateLimit: CalcPreviewRateLimitService,
    private readonly cache: VersionedCacheService,
    private readonly metrics: CalcPreviewMetricsService,
    private readonly traceStorage: TraceStorageService,
  ) {}

  // ============================================================================
  // HEALTH AGGREGATION
  // ============================================================================

  /**
   * Get aggregated health data for a tenant
   * 
   * @param tenantScope - REQUIRED (Defense in Depth - Last Line)
   */
  getHealthData(tenantScope: string): AggregatedHealthData {
    // 1. Circuit breaker statuses
    const circuitBreakers = this.getCircuitBreakerStatuses();
    const openBreakerCount = Object.values(circuitBreakers)
      .filter(cb => cb.state === 'OPEN').length;
    
    // 2. Cache stats
    const cache = this.getCacheHealthInfo();
    
    // 3. Rate limit status
    const rateLimit = this.getRateLimitStatus(tenantScope);
    
    // 4. Policy engine status
    const policyEngine = this.getPolicyEngineStatus();
    
    return {
      cache,
      circuitBreakers,
      rateLimit,
      policyEngine,
      openBreakerCount,
    };
  }

  /**
   * Get circuit breaker statuses for all dependencies
   */
  getCircuitBreakerStatuses(): Record<string, CircuitBreakerHealthInfo> {
    try {
      const allStatuses = this.circuitBreaker.getAllStatuses();
      const result: Record<string, CircuitBreakerHealthInfo> = {};
      
      for (const [name, status] of Object.entries(allStatuses)) {
        result[name] = {
          state: status.state,
          openedAt: status.lastFailure,
          nextRetryAt: status.nextRetryAt,
        };
      }
      
      return result;
    } catch (error) {
      this.logger.error('[Aggregator] Failed to get circuit breaker statuses', error);
      return {};
    }
  }

  /**
   * Get cache health info (aggregated across namespaces)
   */
  getCacheHealthInfo(): CacheHealthInfo {
    try {
      const allStats = this.cache.getAllStats();
      
      // Aggregate across all namespaces
      let totalHits = 0;
      let totalMisses = 0;
      let totalStale = 0;
      
      for (const stats of allStats) {
        totalHits += stats.hits;
        totalMisses += stats.misses;
        totalStale += stats.staleHits;
      }
      
      const total = totalHits + totalMisses;
      
      return {
        hitRate: total > 0 ? Math.round((totalHits / total) * 100) : 0,
        missRate: total > 0 ? Math.round((totalMisses / total) * 100) : 0,
        staleRate: totalHits > 0 ? Math.round((totalStale / totalHits) * 100) : 0,
      };
    } catch (error) {
      this.logger.error('[Aggregator] Failed to get cache stats', error);
      return { hitRate: 0, missRate: 0, staleRate: 0 };
    }
  }

  /**
   * Get rate limit status for a tenant
   * 
   * @param tenantScope - REQUIRED
   */
  getRateLimitStatus(tenantScope: string): RateLimitHealthInfo {
    try {
      const status = this.rateLimit.getStatus(tenantScope);
      
      return {
        remaining: status.tokens,
        capacity: status.capacity,
        blocked: status.blocked,
      };
    } catch (error) {
      this.logger.error('[Aggregator] Failed to get rate limit status', error);
      return { remaining: 0, capacity: 0, blocked: false };
    }
  }

  /**
   * Get policy engine status
   * 
   * Checks policy_engine circuit breaker state
   */
  getPolicyEngineStatus(): PolicyEngineHealthInfo {
    try {
      const status = this.circuitBreaker.getStatus('policy_engine');
      
      return {
        available: status.state !== 'OPEN',
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('[Aggregator] Failed to get policy engine status', error);
      return { available: false, lastCheck: new Date().toISOString() };
    }
  }

  // ============================================================================
  // METRICS AGGREGATION
  // ============================================================================

  /**
   * Get aggregated metrics for a tenant and time window
   * 
   * @param tenantScope - REQUIRED (Defense in Depth - Last Line)
   * @param window - Time window
   */
  getMetricsData(tenantScope: string, window: MetricsWindow): AggregatedMetricsData {
    const windowMs = METRICS_WINDOW_MS[window];
    
    // 1. Latency percentiles
    const latencyData = this.metrics.getLatencyPercentiles(tenantScope, windowMs);
    const latency: LatencyMetrics = {
      p50: Math.round(latencyData.p50),
      p95: Math.round(latencyData.p95),
      p99: Math.round(latencyData.p99),
    };
    
    // 2. Success/error rates
    const successData = this.metrics.getSuccessRate(tenantScope, windowMs);
    const fallbackData = this.metrics.getFallbackRate(tenantScope, windowMs);
    
    // Calculate stale rate from cache
    const cacheStats = this.cache.getAllStats();
    let totalHits = 0;
    let totalStale = 0;
    for (const stats of cacheStats) {
      totalHits += stats.hits;
      totalStale += stats.staleHits;
    }
    const staleRate = totalHits > 0 ? (totalStale / totalHits) * 100 : 0;
    
    const rates: RateMetrics = {
      success: Math.round(successData.rate * 100),
      fallback: Math.round(fallbackData.rate * 100),
      stale: Math.round(staleRate),
      error: Math.round((1 - successData.rate) * 100),
    };
    
    // 3. Counts
    const counts: CountMetrics = {
      total: successData.total,
      success: successData.success,
      fallback: fallbackData.fallbackCount,
      error: successData.error,
    };
    
    return { latency, rates, counts };
  }

  /**
   * Get SLO status for health derivation
   * 
   * @param tenantScope - REQUIRED
   */
  getSLOStatus(tenantScope: string): {
    successRate: number;
    p95Latency: number;
    openBreakerCount: number;
  } {
    const windowMs = 15 * 60 * 1000; // 15 minutes
    
    // Success rate
    const successData = this.metrics.getSuccessRate(tenantScope, windowMs);
    const successRate = successData.rate * 100;
    
    // p95 latency
    const latencyData = this.metrics.getLatencyPercentiles(tenantScope, windowMs);
    const p95Latency = latencyData.p95;
    
    // Open breaker count
    const circuitBreakers = this.getCircuitBreakerStatuses();
    const openBreakerCount = Object.values(circuitBreakers)
      .filter(cb => cb.state === 'OPEN').length;
    
    return { successRate, p95Latency, openBreakerCount };
  }

  // ============================================================================
  // TRACE AGGREGATION (Sprint 2)
  // ============================================================================

  /**
   * Query traces for a tenant
   * 
   * @param tenantId - REQUIRED (Defense in Depth - Last Line)
   * @param query - Query parameters
   * @returns Trace query result with pagination
   * 
   * Kritik: "global query" yok, tenantId parametresi olmadan method yok.
   */
  queryTraces(tenantId: string, query: TraceListQuery): TraceQueryResult {
    try {
      // Get traces from storage using existing query method
      const allTraces = this.traceStorage.query({ tenantId });
      
      // Parse time range
      const since = new Date(query.since).getTime();
      const until = query.until ? new Date(query.until).getTime() : Date.now();
      
      // Filter traces
      let filtered = allTraces.filter((trace: TraceBundle) => {
        const traceTime = new Date(trace.meta.startedAt).getTime();
        
        // Time range filter
        if (traceTime < since || traceTime > until) {
          return false;
        }
        
        // Status filter
        if (query.status && trace.result.status !== query.status) {
          return false;
        }
        
        // Severity filter (based on warnings)
        if (query.severity) {
          const hasCritical = trace.warnings.some((w) => w.severity === 'ERROR');
          const hasWarn = trace.warnings.some((w) => w.severity === 'WARN');
          
          if (query.severity === 'CRITICAL' && !hasCritical) return false;
          if (query.severity === 'WARN' && !hasWarn && !hasCritical) return false;
          // INFO shows all
        }
        
        return true;
      });
      
      // Sort by startedAt descending
      filtered.sort((a: TraceBundle, b: TraceBundle) => 
        new Date(b.meta.startedAt).getTime() - new Date(a.meta.startedAt).getTime()
      );
      
      // Apply cursor pagination
      if (query.cursor) {
        const cursor = this.decodeCursor(query.cursor);
        if (cursor) {
          const cursorTime = new Date(cursor.startedAt).getTime();
          filtered = filtered.filter((trace: TraceBundle) => {
            const traceTime = new Date(trace.meta.startedAt).getTime();
            // After cursor (older traces)
            return traceTime < cursorTime || 
              (traceTime === cursorTime && trace.meta.traceId > cursor.traceId);
          });
        }
      }
      
      // Apply limit
      const limit = Math.min(
        query.limit || TRACE_QUERY_LIMITS.DEFAULT_LIMIT,
        TRACE_QUERY_LIMITS.MAX_LIMIT
      );
      
      const hasMore = filtered.length > limit;
      const pageTraces = filtered.slice(0, limit);
      
      // Build next cursor
      let nextCursor: string | undefined;
      if (hasMore && pageTraces.length > 0) {
        const lastTrace = pageTraces[pageTraces.length - 1];
        nextCursor = this.encodeCursor({
          startedAt: lastTrace.meta.startedAt,
          traceId: lastTrace.meta.traceId,
        });
      }
      
      // Map to summaries
      const summaries = pageTraces.map((trace: TraceBundle) => this.traceToSummary(trace));
      
      return {
        traces: summaries,
        total: allTraces.length,
        nextCursor,
        hasMore,
      };
    } catch (error) {
      this.logger.error('[Aggregator] Failed to query traces', error);
      return {
        traces: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Get a single trace by ID
   * 
   * @param tenantId - REQUIRED (Defense in Depth - Last Line)
   * @param traceId - Trace ID
   * @returns TraceBundle or undefined if not found/wrong tenant
   * 
   * Kritik: Wrong tenant → undefined (service 403 kararını verir)
   */
  getTrace(tenantId: string, traceId: string): TraceBundle | undefined {
    try {
      const trace = this.traceStorage.get(traceId);
      
      // Not found
      if (!trace) {
        return undefined;
      }
      
      // Wrong tenant → undefined (service will return 403)
      if (trace.meta.tenantId !== tenantId) {
        this.logger.warn('[Aggregator] Trace tenant mismatch', {
          requestedTenant: tenantId,
          traceTenant: trace.meta.tenantId,
          traceId,
        });
        return undefined;
      }
      
      return trace;
    } catch (error) {
      this.logger.error('[Aggregator] Failed to get trace', error);
      return undefined;
    }
  }

  /**
   * Check if trace exists and belongs to tenant
   * 
   * @param tenantId - REQUIRED
   * @param traceId - Trace ID
   * @returns { exists: boolean, belongsToTenant: boolean }
   */
  checkTraceAccess(tenantId: string, traceId: string): {
    exists: boolean;
    belongsToTenant: boolean;
  } {
    try {
      const trace = this.traceStorage.get(traceId);
      
      if (!trace) {
        return { exists: false, belongsToTenant: false };
      }
      
      return {
        exists: true,
        belongsToTenant: trace.meta.tenantId === tenantId,
      };
    } catch (error) {
      this.logger.error('[Aggregator] Failed to check trace access', error);
      return { exists: false, belongsToTenant: false };
    }
  }

  // ============================================================================
  // INCIDENT DETECTION CONTEXT (Sprint 3)
  // ============================================================================

  /**
   * Build detection context for incident detection
   * 
   * @param tenantId - REQUIRED
   * @returns DetectionContext with all metrics/breakers/rate-limit data
   */
  buildDetectionContext(tenantId: string): DetectionContext {
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const timestamp = new Date().toISOString();
    
    // 1. Metrics snapshot
    const successData = this.metrics.getSuccessRate(tenantId, windowMs);
    const fallbackData = this.metrics.getFallbackRate(tenantId, windowMs);
    const latencyData = this.metrics.getLatencyPercentiles(tenantId, windowMs);
    
    const metricsSnapshot: MetricsSnapshot = {
      successRate: successData.rate * 100,
      fallbackRate: fallbackData.rate * 100,
      p95LatencyMs: latencyData.p95,
      totalRequests: successData.total,
      windowMs,
    };
    
    // 2. Circuit breaker snapshots
    const breakerStatuses = this.getCircuitBreakerStatuses();
    const circuitBreakers: CircuitBreakerSnapshot[] = Object.entries(breakerStatuses)
      .map(([name, status]) => {
        let openDurationMs: number | undefined;
        if (status.state === 'OPEN' && status.openedAt) {
          openDurationMs = Date.now() - new Date(status.openedAt).getTime();
        }
        return {
          name,
          state: status.state,
          openedAt: status.openedAt,
          openDurationMs,
        };
      });
    
    // 3. Rate limit snapshot
    const rateLimitStatus = this.getRateLimitStatus(tenantId);
    const rateLimitSnapshot: RateLimitSnapshot = {
      throttleCount: rateLimitStatus.blocked ? 1 : 0, // Simplified - would need actual 429 counter
      windowMs,
    };
    
    return {
      tenantId,
      timestamp,
      metrics: metricsSnapshot,
      circuitBreakers,
      rateLimit: rateLimitSnapshot,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Convert TraceBundle to DiagnosticsTraceSummary (PII-free)
   */
  private traceToSummary(trace: TraceBundle): DiagnosticsTraceSummary {
    return {
      traceId: trace.meta.traceId,
      timestamp: trace.meta.startedAt,
      status: trace.result.status,
      durationMs: trace.meta.durationMs,
      hasWarnings: trace.warnings.length > 0,
      hasFallback: trace.dependencies.some(d => d.outcome === 'FALLBACK'),
    };
  }

  /**
   * Encode cursor for pagination
   */
  private encodeCursor(cursor: TraceCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }

  /**
   * Decode cursor from pagination
   */
  private decodeCursor(encoded: string): TraceCursor | null {
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      return JSON.parse(decoded) as TraceCursor;
    } catch {
      return null;
    }
  }
}
