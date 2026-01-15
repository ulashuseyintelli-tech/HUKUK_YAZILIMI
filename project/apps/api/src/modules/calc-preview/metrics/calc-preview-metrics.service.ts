/**
 * Phase 4.1 - Calc Preview Metrics Service
 * 
 * Operasyonel olgunluk için metrikler:
 * - Latency (p50, p95, p99)
 * - Success rate / Error taxonomy
 * - Fallback rate
 * - Dependency latency
 * - Coverage/warning etiketleri
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 4
 */

import { Injectable, Logger } from '@nestjs/common';

// ============================================================================
// METRIC TYPES
// ============================================================================

export interface MetricLabels {
  tenant?: string;
  endpoint?: string;
  status?: 'success' | 'partial' | 'unavailable' | 'error';
  errorDomain?: 'interest' | 'fee' | 'policy' | 'validation' | 'network' | 'unknown';
  errorCode?: string;
  fallback?: 'true' | 'false';
  cached?: 'true' | 'false';
  // Phase 3.1.2 etiketleri (gelecek için hazır)
  coverageStatus?: 'full' | 'partial' | 'none';
  hasGaps?: 'true' | 'false';
  hasOverlaps?: 'true' | 'false';
  segmentsTruncated?: 'true' | 'false';
  highFeeRatio?: 'true' | 'false';
}

export interface LatencyBucket {
  le: number; // less than or equal (ms)
  count: number;
}

export interface MetricSnapshot {
  timestamp: string;
  value: number;
  labels: MetricLabels;
}

// ============================================================================
// SLO THRESHOLDS
// ============================================================================

export const SLO_THRESHOLDS = {
  // Latency SLOs
  LATENCY_P95_MS: 200,      // p95 < 200ms (cache hit)
  LATENCY_P99_MS: 500,      // p99 < 500ms
  
  // Success rate SLOs
  SUCCESS_RATE_MIN: 0.99,   // > 99%
  
  // Fallback SLOs
  FALLBACK_RATE_MAX: 0.02,  // < 2%
  FALLBACK_RATE_ALERT: 0.005, // > 0.5% → alert
  
  // Dependency SLOs
  DEPENDENCY_TIMEOUT_MS: 1000, // 1s timeout
  
  // Alert windows
  ALERT_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
};

// ============================================================================
// METRICS SERVICE
// ============================================================================

@Injectable()
export class CalcPreviewMetricsService {
  private readonly logger = new Logger(CalcPreviewMetricsService.name);
  
  // In-memory metrics storage (production'da Prometheus/Datadog'a gönderilir)
  private latencies: MetricSnapshot[] = [];
  private requests: MetricSnapshot[] = [];
  private errors: MetricSnapshot[] = [];
  private fallbacks: MetricSnapshot[] = [];
  private dependencyLatencies: Map<string, MetricSnapshot[]> = new Map();
  
  // Sliding window for alerts
  private readonly MAX_SNAPSHOTS = 10000;

  // ============================================================================
  // RECORD METHODS
  // ============================================================================

  /**
   * Record a preview request
   */
  recordRequest(params: {
    tenantId: string;
    durationMs: number;
    status: 'success' | 'partial' | 'unavailable' | 'error';
    cached: boolean;
    labels?: Partial<MetricLabels>;
  }): void {
    const timestamp = new Date().toISOString();
    const labels: MetricLabels = {
      tenant: params.tenantId,
      endpoint: 'calc_preview_light',
      status: params.status,
      cached: params.cached ? 'true' : 'false',
      ...params.labels,
    };

    // Latency
    this.latencies.push({ timestamp, value: params.durationMs, labels });
    
    // Request count
    this.requests.push({ timestamp, value: 1, labels });
    
    // Cleanup old data
    this.cleanup();
    
    // Check SLO violations
    this.checkLatencySLO(params.durationMs, labels);
  }

  /**
   * Record an error
   */
  recordError(params: {
    tenantId: string;
    domain: 'interest' | 'fee' | 'policy' | 'validation' | 'network' | 'unknown';
    code: string;
    message?: string;
  }): void {
    const timestamp = new Date().toISOString();
    const labels: MetricLabels = {
      tenant: params.tenantId,
      errorDomain: params.domain,
      errorCode: params.code,
    };

    this.errors.push({ timestamp, value: 1, labels });
    
    // Log for alerting
    this.logger.warn(`[CalcPreview] Error: ${params.domain}/${params.code}`, {
      tenant: params.tenantId,
      message: params.message,
    });
  }

  /**
   * Record a fallback event
   */
  recordFallback(params: {
    tenantId: string;
    reason: string;
  }): void {
    const timestamp = new Date().toISOString();
    const labels: MetricLabels = {
      tenant: params.tenantId,
      fallback: 'true',
      errorCode: params.reason,
    };

    this.fallbacks.push({ timestamp, value: 1, labels });
    
    // Check fallback rate
    this.checkFallbackRate(params.tenantId);
  }

  /**
   * Record dependency latency
   */
  recordDependencyLatency(params: {
    dependency: 'interest_engine' | 'fee_engine' | 'policy_engine' | 'cache';
    durationMs: number;
    success: boolean;
    tenantId?: string;
  }): void {
    const timestamp = new Date().toISOString();
    const snapshots = this.dependencyLatencies.get(params.dependency) || [];
    
    snapshots.push({
      timestamp,
      value: params.durationMs,
      labels: {
        tenant: params.tenantId,
        status: params.success ? 'success' : 'error',
      },
    });
    
    // Keep only recent
    if (snapshots.length > this.MAX_SNAPSHOTS) {
      snapshots.shift();
    }
    
    this.dependencyLatencies.set(params.dependency, snapshots);
    
    // Check timeout
    if (params.durationMs > SLO_THRESHOLDS.DEPENDENCY_TIMEOUT_MS) {
      this.logger.warn(`[CalcPreview] Dependency slow: ${params.dependency} took ${params.durationMs}ms`);
    }
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get latency percentiles
   */
  getLatencyPercentiles(tenantId?: string, windowMs: number = SLO_THRESHOLDS.ALERT_WINDOW_MS): {
    p50: number;
    p95: number;
    p99: number;
    count: number;
  } {
    const cutoff = Date.now() - windowMs;
    const filtered = this.latencies.filter(s => {
      const ts = new Date(s.timestamp).getTime();
      return ts > cutoff && (!tenantId || s.labels.tenant === tenantId);
    });

    if (filtered.length === 0) {
      return { p50: 0, p95: 0, p99: 0, count: 0 };
    }

    const sorted = filtered.map(s => s.value).sort((a, b) => a - b);
    
    return {
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      count: sorted.length,
    };
  }

  /**
   * Get success rate
   */
  getSuccessRate(tenantId?: string, windowMs: number = SLO_THRESHOLDS.ALERT_WINDOW_MS): {
    rate: number;
    total: number;
    success: number;
    partial: number;
    unavailable: number;
    error: number;
  } {
    const cutoff = Date.now() - windowMs;
    const filtered = this.requests.filter(s => {
      const ts = new Date(s.timestamp).getTime();
      return ts > cutoff && (!tenantId || s.labels.tenant === tenantId);
    });

    const total = filtered.length;
    const success = filtered.filter(s => s.labels.status === 'success').length;
    const partial = filtered.filter(s => s.labels.status === 'partial').length;
    const unavailable = filtered.filter(s => s.labels.status === 'unavailable').length;
    const error = filtered.filter(s => s.labels.status === 'error').length;

    return {
      rate: total > 0 ? (success + partial) / total : 1,
      total,
      success,
      partial,
      unavailable,
      error,
    };
  }

  /**
   * Get fallback rate
   */
  getFallbackRate(tenantId?: string, windowMs: number = SLO_THRESHOLDS.ALERT_WINDOW_MS): {
    rate: number;
    fallbackCount: number;
    totalRequests: number;
  } {
    const cutoff = Date.now() - windowMs;
    
    const totalRequests = this.requests.filter(s => {
      const ts = new Date(s.timestamp).getTime();
      return ts > cutoff && (!tenantId || s.labels.tenant === tenantId);
    }).length;

    const fallbackCount = this.fallbacks.filter(s => {
      const ts = new Date(s.timestamp).getTime();
      return ts > cutoff && (!tenantId || s.labels.tenant === tenantId);
    }).length;

    return {
      rate: totalRequests > 0 ? fallbackCount / totalRequests : 0,
      fallbackCount,
      totalRequests,
    };
  }

  /**
   * Get error breakdown
   */
  getErrorBreakdown(tenantId?: string, windowMs: number = SLO_THRESHOLDS.ALERT_WINDOW_MS): {
    byDomain: Record<string, number>;
    byCode: Record<string, number>;
    total: number;
  } {
    const cutoff = Date.now() - windowMs;
    const filtered = this.errors.filter(s => {
      const ts = new Date(s.timestamp).getTime();
      return ts > cutoff && (!tenantId || s.labels.tenant === tenantId);
    });

    const byDomain: Record<string, number> = {};
    const byCode: Record<string, number> = {};

    for (const s of filtered) {
      const domain = s.labels.errorDomain || 'unknown';
      const code = s.labels.errorCode || 'unknown';
      
      byDomain[domain] = (byDomain[domain] || 0) + 1;
      byCode[code] = (byCode[code] || 0) + 1;
    }

    return { byDomain, byCode, total: filtered.length };
  }

  /**
   * Get dashboard summary
   */
  getDashboardSummary(tenantId?: string): {
    latency: { p50: number; p95: number; p99: number };
    successRate: number;
    fallbackRate: number;
    errorCount: number;
    requestCount: number;
    sloViolations: string[];
  } {
    const latency = this.getLatencyPercentiles(tenantId);
    const success = this.getSuccessRate(tenantId);
    const fallback = this.getFallbackRate(tenantId);
    const errors = this.getErrorBreakdown(tenantId);

    const sloViolations: string[] = [];
    
    if (latency.p95 > SLO_THRESHOLDS.LATENCY_P95_MS) {
      sloViolations.push(`p95_latency: ${latency.p95}ms > ${SLO_THRESHOLDS.LATENCY_P95_MS}ms`);
    }
    if (success.rate < SLO_THRESHOLDS.SUCCESS_RATE_MIN) {
      sloViolations.push(`success_rate: ${(success.rate * 100).toFixed(1)}% < ${SLO_THRESHOLDS.SUCCESS_RATE_MIN * 100}%`);
    }
    if (fallback.rate > SLO_THRESHOLDS.FALLBACK_RATE_MAX) {
      sloViolations.push(`fallback_rate: ${(fallback.rate * 100).toFixed(1)}% > ${SLO_THRESHOLDS.FALLBACK_RATE_MAX * 100}%`);
    }

    return {
      latency: { p50: latency.p50, p95: latency.p95, p99: latency.p99 },
      successRate: success.rate,
      fallbackRate: fallback.rate,
      errorCount: errors.total,
      requestCount: success.total,
      sloViolations,
    };
  }

  // ============================================================================
  // ALERT METHODS
  // ============================================================================

  /**
   * Check latency SLO and alert if violated
   */
  private checkLatencySLO(durationMs: number, labels: MetricLabels): void {
    if (durationMs > SLO_THRESHOLDS.LATENCY_P99_MS) {
      this.logger.warn(`[CalcPreview] High latency: ${durationMs}ms`, {
        tenant: labels.tenant,
        cached: labels.cached,
      });
    }
  }

  /**
   * Check fallback rate and alert if threshold exceeded
   */
  private checkFallbackRate(tenantId: string): void {
    const { rate } = this.getFallbackRate(tenantId);
    
    if (rate > SLO_THRESHOLDS.FALLBACK_RATE_ALERT) {
      this.logger.error(`[CalcPreview] ALERT: Fallback rate high: ${(rate * 100).toFixed(2)}%`, {
        tenant: tenantId,
        threshold: `${SLO_THRESHOLDS.FALLBACK_RATE_ALERT * 100}%`,
      });
      
      // TODO: Send to alerting system (Slack, PagerDuty, etc.)
      this.emitAlert({
        type: 'FALLBACK_RATE_HIGH',
        severity: 'warning',
        message: `Fallback rate ${(rate * 100).toFixed(2)}% exceeds threshold`,
        tenant: tenantId,
        value: rate,
        threshold: SLO_THRESHOLDS.FALLBACK_RATE_ALERT,
      });
    }
  }

  /**
   * Emit alert (placeholder for external integration)
   */
  private emitAlert(alert: {
    type: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    tenant?: string;
    value?: number;
    threshold?: number;
  }): void {
    // TODO: Integrate with Sentry, Datadog, Slack, PagerDuty
    this.logger.error(`[ALERT] ${alert.type}: ${alert.message}`, alert);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private cleanup(): void {
    const maxAge = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    this.latencies = this.latencies.filter(s => 
      new Date(s.timestamp).getTime() > maxAge
    ).slice(-this.MAX_SNAPSHOTS);
    
    this.requests = this.requests.filter(s => 
      new Date(s.timestamp).getTime() > maxAge
    ).slice(-this.MAX_SNAPSHOTS);
    
    this.errors = this.errors.filter(s => 
      new Date(s.timestamp).getTime() > maxAge
    ).slice(-this.MAX_SNAPSHOTS);
    
    this.fallbacks = this.fallbacks.filter(s => 
      new Date(s.timestamp).getTime() > maxAge
    ).slice(-this.MAX_SNAPSHOTS);
  }

  /**
   * Reset metrics (for testing)
   */
  reset(): void {
    this.latencies = [];
    this.requests = [];
    this.errors = [];
    this.fallbacks = [];
    this.dependencyLatencies.clear();
  }
}
