/**
 * Metrics Aggregator Controller
 *
 * GET /metrics — Prometheus scrape endpoint.
 *
 * Hybrid aggregator: combines string-based metric sources with
 * prom-client registry output. No breaking changes to existing sources.
 *
 * Phase 1 sources (active, module-level state):
 *   - carrier-lifecycle-metrics (carrier_* prefix)
 *   - audit-metrics (audit_* prefix)
 *   - idempotency-metrics (idempotency_* prefix)
 *
 * I0 sources (prom-client registry):
 *   - simulation_drift_total
 *   - drift_provider_errors_total
 *   - kill_switch_state
 *   - http_responses_total
 *
 * Auth: none (Prometheus scraper — internal network varsayımı).
 * Content-Type: text/plain; version=0.0.4; charset=utf-8
 *
 * @see .kiro/specs/i0-metrics-runway/design.md
 */

import { Controller, Get, Header, Inject } from '@nestjs/common';
import { Registry } from 'prom-client';

// Module-level metric sources (stateless imports — real state lives in module globals)
import { toPrometheusText as carrierMetrics } from '../calc-preview/diagnostics/object-store/manifest-retry/idempotency/carrier-lifecycle/carrier-lifecycle-metrics';
import { toPrometheusText as auditMetrics } from '../calc-preview/diagnostics/object-store/manifest-retry/audit/audit-metrics';
import { toPrometheusText as idempotencyMetrics } from '../calc-preview/diagnostics/object-store/manifest-retry/idempotency/idempotency-metrics';

@Controller('metrics')
export class MetricsAggregatorController {
  constructor(
    @Inject('PROM_REGISTRY') private readonly registry: Registry,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    const sections: string[] = [];

    // 1. Carrier lifecycle metrics (carrier_* prefix)
    sections.push(carrierMetrics());

    // 2. Audit metrics (audit_* prefix)
    sections.push(auditMetrics());

    // 3. Idempotency metrics (idempotency_* prefix)
    sections.push(idempotencyMetrics());

    // 4. prom-client registry (I0 guard metrics + HTTP metrics)
    try {
      const registryOutput = await this.registry.metrics();
      sections.push(registryOutput);
    } catch (err) {
      // Log but don't break — existing string-based metrics still returned
      console.error('prom-client registry.metrics() failed:', err);
    }

    return sections.filter(s => s.length > 0).join('\n\n');
  }
}
