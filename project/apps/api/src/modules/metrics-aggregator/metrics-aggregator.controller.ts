/**
 * Metrics Aggregator Controller
 *
 * GET /metrics — Prometheus scrape endpoint.
 *
 * Aggregates all in-memory metric sources into a single
 * Prometheus exposition format response.
 *
 * Phase 1 sources (active, module-level state):
 *   - carrier-lifecycle-metrics (carrier_* prefix)
 *   - audit-metrics (audit_* prefix)
 *   - idempotency-metrics (idempotency_* prefix)
 *
 * Excluded (not wired as singleton):
 *   - ManifestRetryMetricsService (manifest_retry_* prefix)
 *     → Wire edilirse Phase 2'de eklenir.
 *
 * Auth: none (Prometheus scraper — internal network varsayımı).
 * Content-Type: text/plain; version=0.0.4; charset=utf-8
 */

import { Controller, Get, Header } from '@nestjs/common';

// Module-level metric sources (stateless imports — real state lives in module globals)
import { toPrometheusText as carrierMetrics } from '../calc-preview/diagnostics/object-store/manifest-retry/idempotency/carrier-lifecycle/carrier-lifecycle-metrics';
import { toPrometheusText as auditMetrics } from '../calc-preview/diagnostics/object-store/manifest-retry/audit/audit-metrics';
import { toPrometheusText as idempotencyMetrics } from '../calc-preview/diagnostics/object-store/manifest-retry/idempotency/idempotency-metrics';

@Controller('metrics')
export class MetricsAggregatorController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    const sections: string[] = [];

    // 1. Carrier lifecycle metrics (carrier_* prefix)
    sections.push(carrierMetrics());

    // 2. Audit metrics (audit_* prefix)
    sections.push(auditMetrics());

    // 3. Idempotency metrics (idempotency_* prefix)
    sections.push(idempotencyMetrics());

    return sections.filter(s => s.length > 0).join('\n\n');
  }
}
