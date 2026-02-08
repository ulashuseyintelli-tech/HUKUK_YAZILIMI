/**
 * Metrics Aggregator Module
 *
 * Standalone module — no DI dependencies.
 * All metric sources are module-level singletons (stateless import).
 *
 * Wire into AppModule to expose GET /metrics.
 */

import { Module } from '@nestjs/common';
import { MetricsAggregatorController } from './metrics-aggregator.controller';

@Module({
  controllers: [MetricsAggregatorController],
})
export class MetricsAggregatorModule {}
