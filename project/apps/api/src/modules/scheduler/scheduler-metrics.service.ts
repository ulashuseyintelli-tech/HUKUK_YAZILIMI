/**
 * Scheduler Metrics Service
 *
 * Faz 0b Stabilizasyon — Task 1.3
 *
 * 3 Prometheus counter:
 * - scheduler_processed_total{job}
 * - scheduler_batches_total{job}
 * - scheduler_truncated_total{job}
 */

import { Injectable, Inject } from '@nestjs/common';
import { Counter, Registry } from 'prom-client';
import { RunBatchedResult } from './scheduler-batch.helper';

@Injectable()
export class SchedulerMetricsService {
  private readonly processedTotal: Counter;
  private readonly batchesTotal: Counter;
  private readonly truncatedTotal: Counter;

  constructor(@Inject('PROM_REGISTRY') registry: Registry) {
    this.processedTotal = new Counter({
      name: 'scheduler_processed_total',
      help: 'Total records processed by scheduler cron jobs',
      labelNames: ['job'],
      registers: [registry],
    });

    this.batchesTotal = new Counter({
      name: 'scheduler_batches_total',
      help: 'Total batches executed by scheduler cron jobs',
      labelNames: ['job'],
      registers: [registry],
    });

    this.truncatedTotal = new Counter({
      name: 'scheduler_truncated_total',
      help: 'Total truncation events (cap reached) by scheduler cron jobs',
      labelNames: ['job'],
      registers: [registry],
    });
  }

  record(jobName: string, result: RunBatchedResult): void {
    this.processedTotal.inc({ job: jobName }, result.processed);
    this.batchesTotal.inc({ job: jobName }, result.batches);
    if (result.truncated) {
      this.truncatedTotal.inc({ job: jobName });
    }
  }
}
