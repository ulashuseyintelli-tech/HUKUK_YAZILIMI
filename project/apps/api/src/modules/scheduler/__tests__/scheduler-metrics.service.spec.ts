/**
 * SchedulerMetricsService Unit Tests
 *
 * Faz 0b Stabilizasyon — INV-8: Scheduler Observability
 */

import { Registry } from 'prom-client';
import { SchedulerMetricsService } from '../scheduler-metrics.service';

describe('SchedulerMetricsService', () => {
  let registry: Registry;
  let service: SchedulerMetricsService;

  beforeEach(() => {
    registry = new Registry();
    service = new SchedulerMetricsService(registry);
  });

  it('should register scheduler_processed_total counter', async () => {
    service.record('testJob', { processed: 10, batches: 2, truncated: false });

    const metrics = await registry.metrics();
    expect(metrics).toContain('scheduler_processed_total');
    expect(metrics).toContain('job="testJob"');
  });

  it('should register scheduler_batches_total counter', async () => {
    service.record('testJob', { processed: 10, batches: 2, truncated: false });

    const metrics = await registry.metrics();
    expect(metrics).toContain('scheduler_batches_total');
  });

  it('should increment scheduler_truncated_total only when truncated', async () => {
    service.record('job1', { processed: 500, batches: 10, truncated: true });
    service.record('job2', { processed: 50, batches: 1, truncated: false });

    const metrics = await registry.metrics();
    expect(metrics).toContain('scheduler_truncated_total');
    // job1 should have truncated counter, job2 should not
    expect(metrics).toMatch(/scheduler_truncated_total\{job="job1"\} 1/);
  });

  it('should accumulate processed counts across multiple records', async () => {
    service.record('testJob', { processed: 100, batches: 2, truncated: false });
    service.record('testJob', { processed: 50, batches: 1, truncated: false });

    const metrics = await registry.metrics();
    expect(metrics).toMatch(/scheduler_processed_total\{job="testJob"\} 150/);
  });
});
