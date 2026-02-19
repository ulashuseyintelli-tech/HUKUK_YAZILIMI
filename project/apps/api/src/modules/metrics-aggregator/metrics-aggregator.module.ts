/**
 * Metrics Aggregator Module
 *
 * I0 Metrics Runway — Hybrid aggregator.
 *
 * PROM_REGISTRY is provided by MetricsRegistryModule (global).
 * String-based metric sources are module-level singletons (stateless import).
 *
 * @see .kiro/specs/i0-metrics-runway/design.md
 */

import { Module } from '@nestjs/common';
import { MetricsAggregatorController } from './metrics-aggregator.controller';

@Module({
  controllers: [MetricsAggregatorController],
})
export class MetricsAggregatorModule {}
