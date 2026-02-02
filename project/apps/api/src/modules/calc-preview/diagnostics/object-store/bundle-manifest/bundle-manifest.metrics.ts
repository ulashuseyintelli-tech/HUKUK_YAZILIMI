/**
 * Phase 9C Task 3.1 - Manifest Write Metrics
 * 
 * Prometheus-style counters for manifest write operations.
 * Used for alerting on failure rates.
 * 
 * IMPORTANT: Do NOT use bundleId as label (cardinality explosion).
 * Use error_code and result labels only.
 */

/** Metric labels for manifest write operations */
export interface ManifestWriteMetricLabels {
  /** Result: success | failure | already_exists */
  result: 'success' | 'failure' | 'already_exists';
  /** Error code (only for failures) */
  error_code?: string;
}

/** Metric event emitted after manifest write attempt */
export interface ManifestWriteMetricEvent {
  /** Metric name */
  name: 'bundle_manifest_write_total';
  /** Labels */
  labels: ManifestWriteMetricLabels;
  /** Duration in milliseconds */
  durationMs: number;
  /** Bundle ID (for logging, NOT for metric labels) */
  bundleId: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Metrics collector interface.
 * 
 * Implementations can use Prometheus, OpenTelemetry, or custom metrics.
 */
export interface IManifestMetricsCollector {
  /**
   * Record a manifest write attempt.
   * 
   * @param event - Metric event
   */
  recordManifestWrite(event: ManifestWriteMetricEvent): void;
}

/**
 * No-op metrics collector (default).
 * 
 * Use this when metrics are not configured.
 */
export class NoOpManifestMetricsCollector implements IManifestMetricsCollector {
  recordManifestWrite(_event: ManifestWriteMetricEvent): void {
    // No-op
  }
}

/**
 * Console metrics collector (for development/debugging).
 */
export class ConsoleManifestMetricsCollector implements IManifestMetricsCollector {
  recordManifestWrite(event: ManifestWriteMetricEvent): void {
    console.log('[ManifestMetrics]', {
      metric: event.name,
      labels: event.labels,
      durationMs: event.durationMs,
      bundleId: event.bundleId,
    });
  }
}

/**
 * Creates metric event from write result.
 */
export function createManifestWriteMetricEvent(
  bundleId: string,
  result: 'success' | 'failure' | 'already_exists',
  durationMs: number,
  errorCode?: string
): ManifestWriteMetricEvent {
  return {
    name: 'bundle_manifest_write_total',
    labels: {
      result,
      ...(errorCode && { error_code: errorCode }),
    },
    durationMs,
    bundleId,
    timestamp: new Date(),
  };
}

/**
 * Metric names for Prometheus/Grafana dashboards.
 * 
 * ```promql
 * # Success rate (5m window)
 * sum(rate(bundle_manifest_write_total{result="success"}[5m])) /
 * sum(rate(bundle_manifest_write_total[5m]))
 * 
 * # Failure rate alert (>1% in 5m)
 * sum(rate(bundle_manifest_write_total{result="failure"}[5m])) /
 * sum(rate(bundle_manifest_write_total[5m])) > 0.01
 * 
 * # P99 latency
 * histogram_quantile(0.99, rate(bundle_manifest_write_duration_seconds_bucket[5m]))
 * ```
 */
export const MANIFEST_METRIC_NAMES = {
  /** Counter: total manifest write attempts */
  WRITE_TOTAL: 'bundle_manifest_write_total',
  /** Histogram: manifest write duration */
  WRITE_DURATION: 'bundle_manifest_write_duration_seconds',
} as const;
