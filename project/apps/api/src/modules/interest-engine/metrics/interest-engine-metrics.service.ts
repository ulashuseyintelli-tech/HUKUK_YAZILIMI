/**
 * Task 17.3 - Interest Engine Metrics Service
 * 
 * Cache hit/miss, policy block reasons, avg segment count
 * Dashboard-ready metric isimleri
 */

import { Injectable } from '@nestjs/common';
import { CalculationMode } from '../types/common.types';

// ═══════════════════════════════════════════════════════════════════════════
// METRIC TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MetricValue {
  value: number;
  timestamp: string;
  labels?: Record<string, string>;
}

export interface MetricSummary {
  name: string;
  description: string;
  type: 'counter' | 'gauge' | 'histogram';
  values: MetricValue[];
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class InterestEngineMetricsService {
  private metrics: Map<string, MetricValue[]> = new Map();

  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATION METRICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a calculation
   */
  recordCalculation(
    mode: CalculationMode,
    durationMs: number,
    segmentCount: number,
    success: boolean,
    tenantId: string,
  ): void {
    const timestamp = new Date().toISOString();

    // Calculation count
    this.increment('interest_engine_calculations_total', {
      mode,
      success: String(success),
      tenant: tenantId,
    });

    // Duration histogram
    this.record('interest_engine_calculation_duration_ms', durationMs, {
      mode,
      tenant: tenantId,
    });

    // Segment count histogram
    this.record('interest_engine_segment_count', segmentCount, {
      mode,
      tenant: tenantId,
    });
  }

  /**
   * Record a policy block
   */
  recordPolicyBlock(
    reason: string,
    mode: CalculationMode,
    tenantId: string,
  ): void {
    this.increment('interest_engine_policy_blocks_total', {
      reason,
      mode,
      tenant: tenantId,
    });
  }

  /**
   * Record a policy warning
   */
  recordPolicyWarning(
    code: string,
    mode: CalculationMode,
    tenantId: string,
  ): void {
    this.increment('interest_engine_policy_warnings_total', {
      code,
      mode,
      tenant: tenantId,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE METRICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record cache hit
   */
  recordCacheHit(cacheType: string, tenantId: string): void {
    this.increment('interest_engine_cache_hits_total', {
      cache: cacheType,
      tenant: tenantId,
    });
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(cacheType: string, tenantId: string): void {
    this.increment('interest_engine_cache_misses_total', {
      cache: cacheType,
      tenant: tenantId,
    });
  }

  /**
   * Get cache hit rate
   */
  getCacheHitRate(cacheType: string, tenantId: string): number {
    const hits = this.getSum('interest_engine_cache_hits_total', { cache: cacheType, tenant: tenantId });
    const misses = this.getSum('interest_engine_cache_misses_total', { cache: cacheType, tenant: tenantId });
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE METRICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record rate fetch
   */
  recordRateFetch(source: string, count: number, durationMs: number): void {
    this.increment('interest_engine_rate_fetches_total', { source });
    this.record('interest_engine_rate_fetch_duration_ms', durationMs, { source });
    this.record('interest_engine_rates_fetched', count, { source });
  }

  /**
   * Record rate gap
   */
  recordRateGap(gapDays: number, tenantId: string): void {
    this.increment('interest_engine_rate_gaps_total', { tenant: tenantId });
    this.record('interest_engine_rate_gap_days', gapDays, { tenant: tenantId });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT METRICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record audit write
   */
  recordAuditWrite(recordType: string, tenantId: string): void {
    this.increment('interest_engine_audit_writes_total', {
      type: recordType,
      tenant: tenantId,
    });
  }

  /**
   * Record audit read
   */
  recordAuditRead(recordType: string, tenantId: string): void {
    this.increment('interest_engine_audit_reads_total', {
      type: recordType,
      tenant: tenantId,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all metrics
   */
  getAllMetrics(): MetricSummary[] {
    const summaries: MetricSummary[] = [];

    for (const [name, values] of this.metrics) {
      summaries.push({
        name,
        description: this.getMetricDescription(name),
        type: this.getMetricType(name),
        values,
      });
    }

    return summaries;
  }

  /**
   * Get metrics for dashboard
   */
  getDashboardMetrics(tenantId: string): {
    calculationsToday: number;
    avgDurationMs: number;
    avgSegmentCount: number;
    policyBlockRate: number;
    cacheHitRate: number;
  } {
    let calculations = 0;
    let blocks = 0;
    const durations: number[] = [];
    const segments: number[] = [];

    // Iterate through all metrics to find matching ones
    for (const [key, values] of this.metrics) {
      if (key.includes('interest_engine_calculations_total') && key.includes(`tenant=${tenantId}`)) {
        calculations += values.reduce((sum, v) => sum + v.value, 0);
      }
      if (key.includes('interest_engine_policy_blocks_total') && key.includes(`tenant=${tenantId}`)) {
        blocks += values.reduce((sum, v) => sum + v.value, 0);
      }
      if (key.includes('interest_engine_calculation_duration_ms') && key.includes(`tenant=${tenantId}`)) {
        durations.push(...values.map(v => v.value));
      }
      if (key.includes('interest_engine_segment_count') && key.includes(`tenant=${tenantId}`)) {
        segments.push(...values.map(v => v.value));
      }
    }

    return {
      calculationsToday: calculations,
      avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      avgSegmentCount: segments.length > 0 ? segments.reduce((a, b) => a + b, 0) / segments.length : 0,
      policyBlockRate: calculations > 0 ? blocks / calculations : 0,
      cacheHitRate: this.getCacheHitRate('rate', tenantId),
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.metrics.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private increment(name: string, labels: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const values = this.metrics.get(key) || [];
    values.push({
      value: 1,
      timestamp: new Date().toISOString(),
      labels,
    });
    this.metrics.set(key, values);
  }

  private record(name: string, value: number, labels: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const values = this.metrics.get(key) || [];
    values.push({
      value,
      timestamp: new Date().toISOString(),
      labels,
    });
    this.metrics.set(key, values);
  }

  private getSum(name: string, labels: Record<string, string>): number {
    const key = this.makeKey(name, labels);
    const values = this.metrics.get(key) || [];
    return values.reduce((sum, v) => sum + v.value, 0);
  }

  private getValues(name: string, labels: Record<string, string>): number[] {
    const key = this.makeKey(name, labels);
    const values = this.metrics.get(key) || [];
    return values.map(v => v.value);
  }

  private makeKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  private getMetricDescription(name: string): string {
    const descriptions: Record<string, string> = {
      'interest_engine_calculations_total': 'Total number of interest calculations',
      'interest_engine_calculation_duration_ms': 'Duration of interest calculations in milliseconds',
      'interest_engine_segment_count': 'Number of segments per calculation',
      'interest_engine_policy_blocks_total': 'Total number of policy blocks',
      'interest_engine_policy_warnings_total': 'Total number of policy warnings',
      'interest_engine_cache_hits_total': 'Total number of cache hits',
      'interest_engine_cache_misses_total': 'Total number of cache misses',
      'interest_engine_rate_fetches_total': 'Total number of rate fetches',
      'interest_engine_rate_fetch_duration_ms': 'Duration of rate fetches in milliseconds',
      'interest_engine_rates_fetched': 'Number of rates fetched',
      'interest_engine_rate_gaps_total': 'Total number of rate gaps detected',
      'interest_engine_rate_gap_days': 'Number of days in rate gaps',
      'interest_engine_audit_writes_total': 'Total number of audit writes',
      'interest_engine_audit_reads_total': 'Total number of audit reads',
    };
    return descriptions[name] || name;
  }

  private getMetricType(name: string): 'counter' | 'gauge' | 'histogram' {
    if (name.endsWith('_total')) return 'counter';
    if (name.includes('_duration_') || name.includes('_count')) return 'histogram';
    return 'gauge';
  }
}
