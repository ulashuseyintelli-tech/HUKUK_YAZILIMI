/**
 * Metrics Registry Module
 *
 * I0 Metrics Runway — Task 1.2
 *
 * Singleton prom-client Registry for all guard Counter/Gauge metrics.
 * Global module — available to all modules without explicit import.
 *
 * Includes TestRoutesController for local/dev metrics validation
 * (GET /__test__/force-503). Excluded in production.
 *
 * @see .kiro/specs/i0-metrics-runway/design.md
 */

import { Module, Global } from '@nestjs/common';
import { Registry } from 'prom-client';
import { TestRoutesController } from './test-routes.controller';

const registry = new Registry();

/** Test routes only in non-production environments */
const controllers =
  process.env.NODE_ENV === 'production' ? [] : [TestRoutesController];

@Global()
@Module({
  controllers,
  providers: [
    {
      provide: 'PROM_REGISTRY',
      useValue: registry,
    },
  ],
  exports: ['PROM_REGISTRY'],
})
export class MetricsRegistryModule {}
