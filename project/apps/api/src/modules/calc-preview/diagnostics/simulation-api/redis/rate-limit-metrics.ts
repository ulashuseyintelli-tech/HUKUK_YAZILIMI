/**
 * Rate Limit Metrics
 * 
 * Phase 9A - Task 8.1-8.4
 * 
 * Metrics implementation for rate limit operations.
 * Provides observability for Redis operations and failover events.
 */

import { Injectable, Logger } from '@nestjs/common';
import { IRateLimitMetrics } from './rate-limit-store.interface';

// ============================================================================
// Types
// ============================================================================

export interface LatencyBucket {
  le: number; // Less than or equal to (ms)
  count: number;
}

export interface MetricsSnapshot {
  latency: {
    operation: string;
    buckets: LatencyBucket[];
    sum: number;
    count: number;
  }[];
  errors: {
    operation: string;
    errorType: string;
    count: number;
  }[];
  failover: {
    activations: number;
    recoveries: number;
  };
  circuitBreaker: {
    currentState: 'OPEN' | 'CLOSED' | 'HALF_OPEN';
    stateChanges: number;
  };
}

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class RateLimitMetrics implements IRateLimitMetrics {
  private readonly logger = new Logger(RateLimitMetrics.name);

  // Latency histograms per operation
  private readonly latencyHistograms = new Map<string, {
    buckets: Map<number, number>; // bucket threshold -> count
    sum: number;
    count: number;
  }>();

  // Error counters
  private readonly errorCounters = new Map<string, number>();

  // Failover counters
  private failoverActivations = 0;
  private failoverRecoveries = 0;

  // Circuit breaker state
  private circuitBreakerState: 'OPEN' | 'CLOSED' | 'HALF_OPEN' = 'CLOSED';
  private circuitBreakerStateChanges = 0;

  // Histogram bucket thresholds (ms)
  private readonly bucketThresholds = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

  // ============================================================================
  // IRateLimitMetrics Implementation
  // ============================================================================

  recordLatency(operation: string, durationMs: number, success: boolean): void {
    const key = `${operation}:${success ? 'success' : 'error'}`;
    
    if (!this.latencyHistograms.has(key)) {
      this.latencyHistograms.set(key, {
        buckets: new Map(this.bucketThresholds.map(t => [t, 0])),
        sum: 0,
        count: 0,
      });
    }

    const histogram = this.latencyHistograms.get(key)!;
    histogram.sum += durationMs;
    histogram.count++;

    // Update buckets
    for (const threshold of this.bucketThresholds) {
      if (durationMs <= threshold) {
        histogram.buckets.set(threshold, (histogram.buckets.get(threshold) || 0) + 1);
      }
    }

    // Log slow operations
    if (durationMs > 100) {
      this.logger.warn('[Metrics] Slow operation', {
        operation,
        durationMs,
        success,
      });
    }
  }

  recordError(operation: string, errorType: string): void {
    const key = `${operation}:${errorType}`;
    this.errorCounters.set(key, (this.errorCounters.get(key) || 0) + 1);

    this.logger.error('[Metrics] Operation error', {
      operation,
      errorType,
      totalErrors: this.errorCounters.get(key),
    });
  }

  recordFailover(activated: boolean): void {
    if (activated) {
      this.failoverActivations++;
      this.logger.warn('[Metrics] Failover activated', {
        totalActivations: this.failoverActivations,
      });
    } else {
      this.failoverRecoveries++;
      this.logger.log('[Metrics] Failover recovered', {
        totalRecoveries: this.failoverRecoveries,
      });
    }
  }

  recordCircuitBreakerState(state: 'OPEN' | 'CLOSED' | 'HALF_OPEN'): void {
    if (this.circuitBreakerState !== state) {
      this.circuitBreakerStateChanges++;
      this.logger.log('[Metrics] Circuit breaker state change', {
        from: this.circuitBreakerState,
        to: state,
        totalChanges: this.circuitBreakerStateChanges,
      });
    }
    this.circuitBreakerState = state;
  }

  // ============================================================================
  // Snapshot & Export
  // ============================================================================

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    const latency: MetricsSnapshot['latency'] = [];
    
    for (const [key, histogram] of this.latencyHistograms.entries()) {
      const buckets: LatencyBucket[] = [];
      for (const [le, count] of histogram.buckets.entries()) {
        buckets.push({ le, count });
      }
      buckets.sort((a, b) => a.le - b.le);
      
      latency.push({
        operation: key,
        buckets,
        sum: histogram.sum,
        count: histogram.count,
      });
    }

    const errors: MetricsSnapshot['errors'] = [];
    for (const [key, count] of this.errorCounters.entries()) {
      const [operation, errorType] = key.split(':');
      errors.push({ operation, errorType, count });
    }

    return {
      latency,
      errors,
      failover: {
        activations: this.failoverActivations,
        recoveries: this.failoverRecoveries,
      },
      circuitBreaker: {
        currentState: this.circuitBreakerState,
        stateChanges: this.circuitBreakerStateChanges,
      },
    };
  }

  /**
   * Get average latency for an operation
   */
  getAverageLatency(operation: string, success = true): number | null {
    const key = `${operation}:${success ? 'success' : 'error'}`;
    const histogram = this.latencyHistograms.get(key);
    
    if (!histogram || histogram.count === 0) {
      return null;
    }

    return histogram.sum / histogram.count;
  }

  /**
   * Get error count for an operation
   */
  getErrorCount(operation: string, errorType?: string): number {
    if (errorType) {
      return this.errorCounters.get(`${operation}:${errorType}`) || 0;
    }

    let total = 0;
    for (const [key, count] of this.errorCounters.entries()) {
      if (key.startsWith(`${operation}:`)) {
        total += count;
      }
    }
    return total;
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.latencyHistograms.clear();
    this.errorCounters.clear();
    this.failoverActivations = 0;
    this.failoverRecoveries = 0;
    this.circuitBreakerState = 'CLOSED';
    this.circuitBreakerStateChanges = 0;
  }
}

// ============================================================================
// No-Op Metrics (for testing)
// ============================================================================

export class NoOpRateLimitMetrics implements IRateLimitMetrics {
  recordLatency(): void {}
  recordError(): void {}
  recordFailover(): void {}
  recordCircuitBreakerState(): void {}
}
