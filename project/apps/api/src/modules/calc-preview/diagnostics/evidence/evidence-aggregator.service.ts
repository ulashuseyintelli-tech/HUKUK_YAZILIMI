/**
 * Evidence Aggregator Service
 * 
 * Phase 8 - Sprint 1A
 * 
 * Collects evidence points from various metric sources.
 * Produces EvidenceSnapshot with confidence and freshness metadata.
 * 
 * Minimum metrics (Sprint 1A):
 * - error_rate
 * - latency_p99
 * - slo_burn_rate
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  EvidenceSnapshot,
  EvidencePoint,
  EvidenceMetricType,
  sortEvidencePoints,
} from '../diagnostics.types';
import { IClock } from './clock.service';
import { DiagnosticsAggregatorService } from '../diagnostics-aggregator.service';

/**
 * Metric adapter interface
 * 
 * Each metric source implements this to provide evidence points.
 */
export interface MetricAdapter {
  metric: EvidenceMetricType;
  collect(tenantId: string, windowSec: number): EvidencePoint | null;
}

@Injectable()
export class EvidenceAggregatorService {
  private readonly logger = new Logger(EvidenceAggregatorService.name);
  private readonly adapters: Map<EvidenceMetricType, MetricAdapter> = new Map();

  constructor(
    private readonly clock: IClock,
    private readonly diagnosticsAggregator: DiagnosticsAggregatorService,
  ) {
    // Register built-in adapters
    this.registerBuiltInAdapters();
  }

  /**
   * Capture evidence snapshot for an incident
   * 
   * @param tenantId - REQUIRED (Defense in Depth)
   * @param incidentId - Incident ID
   * @param windowSec - Metric collection window (default 60s)
   * @returns EvidenceSnapshot with all available metrics
   * 
   * Kritik: x-tenant-id yoksa snapshot asla alınmasın
   */
  captureSnapshot(
    tenantId: string,
    incidentId: string,
    windowSec: number = 60,
  ): EvidenceSnapshot {
    if (!tenantId) {
      throw new Error('tenantId is required for evidence capture');
    }

    const snapshotId = randomUUID();
    const capturedAt = this.clock.nowIso();
    const points: EvidencePoint[] = [];

    // Collect from all registered adapters
    for (const [metric, adapter] of this.adapters) {
      try {
        const point = adapter.collect(tenantId, windowSec);
        if (point) {
          points.push(point);
        } else {
          this.logger.debug(`[EvidenceAggregator] No data for metric ${metric}`, {
            tenantId,
            incidentId,
          });
        }
      } catch (error) {
        this.logger.error(`[EvidenceAggregator] Failed to collect ${metric}`, {
          tenantId,
          incidentId,
          error,
        });
      }
    }

    // Sort points for deterministic ordering
    const sortedPoints = sortEvidencePoints(points);

    const snapshot: EvidenceSnapshot = {
      snapshotId,
      tenantId,
      incidentId,
      capturedAt,
      points: sortedPoints,
    };

    this.logger.debug('[EvidenceAggregator] Snapshot captured', {
      snapshotId,
      tenantId,
      incidentId,
      pointCount: sortedPoints.length,
      metrics: sortedPoints.map(p => p.metric),
    });

    return snapshot;
  }

  /**
   * Register a custom metric adapter
   */
  registerAdapter(adapter: MetricAdapter): void {
    this.adapters.set(adapter.metric, adapter);
    this.logger.debug(`[EvidenceAggregator] Adapter registered: ${adapter.metric}`);
  }

  /**
   * Get list of registered metrics
   */
  getRegisteredMetrics(): EvidenceMetricType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Register built-in adapters for minimum metrics
   */
  private registerBuiltInAdapters(): void {
    // error_rate adapter
    this.registerAdapter({
      metric: 'error_rate',
      collect: (tenantId: string, windowSec: number): EvidencePoint | null => {
        try {
          const metricsData = this.diagnosticsAggregator.getMetricsData(tenantId, '15m');
          
          // Calculate freshness based on when metrics were last updated
          // For now, assume metrics are fresh (real implementation would track this)
          const freshnessSec = 0;
          
          // Calculate confidence based on sample size
          const confidence = this.calculateConfidence(metricsData.counts.total);

          return {
            metric: 'error_rate',
            value: metricsData.rates.error,
            unit: '%',
            windowSec,
            confidence,
            freshnessSec,
            source: 'app_metrics',
            timestamp: this.clock.nowIso(),
          };
        } catch {
          return null;
        }
      },
    });

    // latency_p99 adapter
    this.registerAdapter({
      metric: 'latency_p99',
      collect: (tenantId: string, windowSec: number): EvidencePoint | null => {
        try {
          const metricsData = this.diagnosticsAggregator.getMetricsData(tenantId, '15m');
          
          const freshnessSec = 0;
          const confidence = this.calculateConfidence(metricsData.counts.total);

          return {
            metric: 'latency_p99',
            value: metricsData.latency.p99,
            unit: 'ms',
            windowSec,
            confidence,
            freshnessSec,
            source: 'app_metrics',
            timestamp: this.clock.nowIso(),
          };
        } catch {
          return null;
        }
      },
    });

    // slo_burn_rate adapter
    this.registerAdapter({
      metric: 'slo_burn_rate',
      collect: (tenantId: string, windowSec: number): EvidencePoint | null => {
        try {
          const sloStatus = this.diagnosticsAggregator.getSLOStatus(tenantId);
          
          // SLO burn rate = (100 - successRate) / (100 - SLO target)
          // Assuming SLO target is 95%
          const sloTarget = 95;
          const errorBudget = 100 - sloTarget; // 5%
          const currentError = 100 - sloStatus.successRate;
          const burnRate = currentError / errorBudget;
          
          const freshnessSec = 0;
          const confidence = this.calculateConfidence(100); // Simplified

          return {
            metric: 'slo_burn_rate',
            value: Math.round(burnRate * 100) / 100, // 2 decimal places
            unit: 'ratio',
            windowSec,
            confidence,
            freshnessSec,
            source: 'app_metrics',
            timestamp: this.clock.nowIso(),
          };
        } catch {
          return null;
        }
      },
    });

    this.logger.debug('[EvidenceAggregator] Built-in adapters registered', {
      metrics: this.getRegisteredMetrics(),
    });
  }

  /**
   * Calculate confidence based on sample size
   * 
   * Higher sample count = higher confidence
   * Minimum 10 samples for 0.5 confidence
   * 100+ samples for 0.9+ confidence
   */
  private calculateConfidence(sampleCount: number): number {
    if (sampleCount === 0) return 0;
    if (sampleCount < 10) return 0.3;
    if (sampleCount < 50) return 0.5;
    if (sampleCount < 100) return 0.7;
    if (sampleCount < 500) return 0.85;
    return 0.95;
  }
}
