/**
 * Phase 5.1 - Trace Storage Service
 * 
 * In-memory ring buffer storage for traces.
 * Production'da Redis'e taşınacak.
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.1
 */

import { Injectable, Logger } from '@nestjs/common';
import { TraceBundle, TraceSamplingPolicy, DEFAULT_SAMPLING_POLICY } from './trace.types';

// ============================================================================
// STORAGE INTERFACE
// ============================================================================

export interface TraceStorageQuery {
  tenantId?: string;
  severity?: 'NOISE' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  status?: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
  limit?: number;
  offset?: number;
}

export interface TraceStorageStats {
  totalStored: number;
  producedTotal: number;
  persistedTotal: number;
  sampledOutTotal: number;
  avgSizeBytes: number;
  oldestTrace?: string | undefined;
  newestTrace?: string | undefined;
}

// ============================================================================
// TRACE STORAGE SERVICE
// ============================================================================

@Injectable()
export class TraceStorageService {
  private readonly logger = new Logger(TraceStorageService.name);
  
  // Ring buffer storage
  private readonly storage = new Map<string, TraceBundle>();
  private readonly insertOrder: string[] = [];
  private readonly MAX_SIZE = 1000;
  
  // Metrics
  private producedTotal = 0;
  private persistedTotal = 0;
  private sampledOutTotal = 0;
  private totalSizeBytes = 0;
  
  // Sampling policy
  private samplingPolicy: TraceSamplingPolicy = DEFAULT_SAMPLING_POLICY;

  // ============================================================================
  // STORE
  // ============================================================================

  /**
   * Store a trace bundle (with sampling)
   */
  store(bundle: TraceBundle, forceStore: boolean = false): boolean {
    this.producedTotal++;
    
    // Check sampling
    if (!forceStore && !this.shouldSample(bundle)) {
      this.sampledOutTotal++;
      return false;
    }
    
    const traceId = bundle.meta.traceId;
    const sizeBytes = JSON.stringify(bundle).length;
    
    // Evict oldest if at capacity
    while (this.storage.size >= this.MAX_SIZE && this.insertOrder.length > 0) {
      const oldestId = this.insertOrder.shift();
      if (oldestId) {
        const oldBundle = this.storage.get(oldestId);
        if (oldBundle) {
          this.totalSizeBytes -= JSON.stringify(oldBundle).length;
        }
        this.storage.delete(oldestId);
      }
    }
    
    // Store
    this.storage.set(traceId, bundle);
    this.insertOrder.push(traceId);
    this.totalSizeBytes += sizeBytes;
    this.persistedTotal++;
    
    this.logger.debug(`[TraceStorage] Stored trace: ${traceId}`, {
      status: bundle.result.status,
      durationMs: bundle.meta.durationMs,
      sizeBytes,
    });
    
    return true;
  }

  // ============================================================================
  // RETRIEVE
  // ============================================================================

  /**
   * Get a trace by ID
   */
  get(traceId: string): TraceBundle | undefined {
    return this.storage.get(traceId);
  }

  /**
   * Query traces
   */
  query(params: TraceStorageQuery): TraceBundle[] {
    let results = Array.from(this.storage.values());
    
    // Filter by tenantId
    if (params.tenantId) {
      results = results.filter(t => t.meta.tenantId === params.tenantId);
    }
    
    // Filter by severity (shadow compare)
    if (params.severity) {
      results = results.filter(t => t.shadowCompare?.severity === params.severity);
    }
    
    // Filter by status
    if (params.status) {
      results = results.filter(t => t.result.status === params.status);
    }
    
    // Sort by timestamp (newest first)
    results.sort((a, b) => 
      new Date(b.meta.startedAt).getTime() - new Date(a.meta.startedAt).getTime()
    );
    
    // Pagination
    const offset = params.offset || 0;
    const limit = params.limit || 50;
    
    return results.slice(offset, offset + limit);
  }

  /**
   * Get recent traces
   */
  getRecent(limit: number = 10): TraceBundle[] {
    return this.query({ limit });
  }

  // ============================================================================
  // STATS
  // ============================================================================

  /**
   * Get storage stats
   */
  getStats(): TraceStorageStats {
    const traces = Array.from(this.storage.values());
    const timestamps = traces.map(t => new Date(t.meta.startedAt).getTime());
    
    return {
      totalStored: this.storage.size,
      producedTotal: this.producedTotal,
      persistedTotal: this.persistedTotal,
      sampledOutTotal: this.sampledOutTotal,
      avgSizeBytes: this.storage.size > 0 ? Math.round(this.totalSizeBytes / this.storage.size) : 0,
      oldestTrace: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : undefined,
      newestTrace: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : undefined,
    };
  }

  // ============================================================================
  // SAMPLING
  // ============================================================================

  /**
   * Check if trace should be sampled
   */
  private shouldSample(bundle: TraceBundle): boolean {
    const policy = this.samplingPolicy;
    
    // Force conditions
    if (policy.forceOn.fallbackOutcome) {
      if (bundle.dependencies.some(d => d.outcome === 'FALLBACK')) {
        return true;
      }
    }
    
    if (policy.forceOn.criticalShadowDiff) {
      if (bundle.shadowCompare?.severity === 'CRITICAL') {
        return true;
      }
    }
    
    if (policy.forceOn.circuitOpen) {
      for (const state of Object.values(bundle.circuitBreaker.byDependency)) {
        if (state.state === 'OPEN') {
          return true;
        }
      }
    }
    
    if (policy.forceOn.degradedResult) {
      if (bundle.result.status === 'DEGRADED' || bundle.result.status === 'UNAVAILABLE') {
        return true;
      }
    }
    
    // Default sampling rate
    return Math.random() < policy.defaultRate;
  }

  /**
   * Update sampling policy
   */
  updateSamplingPolicy(policy: Partial<TraceSamplingPolicy>): void {
    this.samplingPolicy = { ...this.samplingPolicy, ...policy };
    this.logger.log('[TraceStorage] Sampling policy updated', this.samplingPolicy);
  }

  /**
   * Get current sampling policy
   */
  getSamplingPolicy(): TraceSamplingPolicy {
    return this.samplingPolicy;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Clear all traces (for testing)
   */
  clear(): void {
    this.storage.clear();
    this.insertOrder.length = 0;
    this.totalSizeBytes = 0;
  }

  /**
   * Reset stats (for testing)
   */
  resetStats(): void {
    this.producedTotal = 0;
    this.persistedTotal = 0;
    this.sampledOutTotal = 0;
  }
}
