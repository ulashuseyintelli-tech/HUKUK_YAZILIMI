/**
 * MetricsSpy — SimulationMetricsService spy wrapper
 *
 * Synthetic Load Validation — Task 1.2
 *
 * In-memory registry: jest.spyOn() ile method çağrılarını intercept eder.
 * prom-client henüz wired olmadığından /metrics scrape kullanılmaz.
 *
 * @see .kiro/specs/synthetic-load-validation/design.md
 */

import { SimulationMetricsService } from '../../../simulation-metrics.service';
import type { MetricsSnapshot } from '../load-test-report.types';

export class MetricsSpy {
  private counts = {
    promote_success_total: 0,
    promote_failure_total: {} as Record<string, number>,
    drift_detected_total: 0,
    escalation_churn_total: 0,
    escalation_state_conflict_total: 0,
  };

  private spies: jest.SpyInstance[] = [];

  constructor(private readonly metricsService: SimulationMetricsService) {}

  /** Attach spies to all metric methods */
  attach(): void {
    this.spies.push(
      jest.spyOn(this.metricsService, 'incPromoteSuccess').mockImplementation(() => {
        this.counts.promote_success_total++;
      }),
    );

    this.spies.push(
      jest.spyOn(this.metricsService, 'incPromoteFailure').mockImplementation((reason: string) => {
        this.counts.promote_failure_total[reason] =
          (this.counts.promote_failure_total[reason] ?? 0) + 1;
      }),
    );

    this.spies.push(
      jest.spyOn(this.metricsService, 'incDriftDetected').mockImplementation(() => {
        this.counts.drift_detected_total++;
      }),
    );

    this.spies.push(
      jest.spyOn(this.metricsService, 'incEscalationChurn').mockImplementation(() => {
        this.counts.escalation_churn_total++;
      }),
    );

    this.spies.push(
      jest.spyOn(this.metricsService, 'incEscalationStateConflict').mockImplementation(() => {
        this.counts.escalation_state_conflict_total++;
      }),
    );
  }

  /** Reset all counters to zero */
  reset(): void {
    this.counts = {
      promote_success_total: 0,
      promote_failure_total: {},
      drift_detected_total: 0,
      escalation_churn_total: 0,
      escalation_state_conflict_total: 0,
    };
  }

  /** Get count for a specific metric */
  getCount(metricName: keyof MetricsSnapshot): number {
    const val = this.counts[metricName];
    if (typeof val === 'number') return val;
    // For promote_failure_total, return total across all reasons
    return Object.values(val).reduce((sum, v) => sum + v, 0);
  }

  /** Get count for a specific failure reason */
  getFailureCount(reason: string): number {
    return this.counts.promote_failure_total[reason] ?? 0;
  }

  /** Take a snapshot of all current counters */
  snapshot(): MetricsSnapshot {
    return {
      promote_success_total: this.counts.promote_success_total,
      promote_failure_total: { ...this.counts.promote_failure_total },
      drift_detected_total: this.counts.drift_detected_total,
      escalation_churn_total: this.counts.escalation_churn_total,
      escalation_state_conflict_total: this.counts.escalation_state_conflict_total,
    };
  }

  /** Restore all spies */
  detach(): void {
    this.spies.forEach((spy) => spy.mockRestore());
    this.spies = [];
  }
}
