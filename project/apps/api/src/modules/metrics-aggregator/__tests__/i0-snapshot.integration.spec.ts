/**
 * I0 Metrics Runway — Mini-T0 Snapshot Integration Test
 *
 * Spins up a real NestJS HTTP server with:
 *   - MetricsRegistryModule (prom-client singleton)
 *   - MetricsAggregatorModule (hybrid /metrics endpoint)
 *   - HttpMetricsMiddleware (http_responses_total)
 *   - SimulationMetricsService (simulation_drift_total, drift_provider_errors_total)
 *
 * Sends synthetic traffic, then captures /metrics snapshot.
 *
 * This is the programmatic equivalent of:
 *   compose up → 1-2 RPS traffic → curl /metrics → snapshot
 *
 * @see .kiro/specs/i0-metrics-runway/design.md
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import * as request from 'supertest';
import { Registry } from 'prom-client';
import { MetricsAggregatorModule } from '../metrics-aggregator.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { HttpMetricsMiddleware } from '../../metrics-registry/http-metrics.middleware';
import { SimulationMetricsService } from '../../calc-preview/diagnostics/simulation-api/simulation-metrics.service';
import { TestRoutesController } from '../../metrics-registry/test-routes.controller';

/**
 * Minimal app module that wires middleware like the real AppModule does.
 * Includes TestRoutesController for 503 validation (GET /__test__/force-503).
 */
@Module({
  imports: [MetricsRegistryModule, MetricsAggregatorModule],
  controllers: [TestRoutesController],
  providers: [SimulationMetricsService],
  exports: [SimulationMetricsService],
})
class SnapshotTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}

describe('I0 Mini-T0 Snapshot', () => {
  let app: INestApplication;
  let metricsService: SimulationMetricsService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SnapshotTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    metricsService = moduleFixture.get(SimulationMetricsService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should produce a complete I0 /metrics snapshot after synthetic traffic', async () => {
    // ── Phase 1: Synthetic traffic — normal requests (generates http_responses_total) ──
    const normalRequests = 10;
    for (let i = 0; i < normalRequests; i++) {
      await request(app.getHttpServer()).get('/metrics');
    }

    // ── Phase 2: Simulate guard metric events ──
    // Structural drift events — interceptor slices 'DRIFT:' prefix,
    // so service receives DriftType enum values directly (SD-1 contract)
    metricsService.incSimulationDrift('CARRIER_WRITE', 'calcPreview', 'shadow');
    metricsService.incSimulationDrift('CARRIER_WRITE', 'calcPreview', 'shadow');
    metricsService.incSimulationDrift('CONFIG', 'calcPreview', 'shadow');
    metricsService.incSimulationDrift('CARRIER_WRITE', 'interestCalc', 'shadow');

    // Provider error events (separate from drift)
    metricsService.incDriftProviderError('calcPreview', 'shadow');

    // Kill-switch state (SD-1 metric, migrated to prom-client in I0)
    metricsService.setKillSwitchState('tenant-demo', 'calcPreview', false);

    // ── Phase 3: Capture /metrics snapshot ──
    const res = await request(app.getHttpServer()).get('/metrics');
    const snapshot = res.text;

    // ── Phase 4: Validate & Report ──

    // --- 1) I0 Guard Metrics Present ---
    expect(snapshot).toContain('# HELP simulation_drift_total');
    expect(snapshot).toContain('# TYPE simulation_drift_total counter');
    expect(snapshot).toContain('# HELP drift_provider_errors_total');
    expect(snapshot).toContain('# TYPE drift_provider_errors_total counter');
    expect(snapshot).toContain('# HELP http_responses_total');
    expect(snapshot).toContain('# TYPE http_responses_total counter');
    expect(snapshot).toContain('# HELP kill_switch_state');
    expect(snapshot).toContain('# TYPE kill_switch_state gauge');

    // --- 2) Metric values correct ---
    // simulation_drift_total: 2x CARRIER_WRITE/calcPreview + 1x CONFIG/calcPreview + 1x CARRIER_WRITE/interestCalc = 4 total
    expect(snapshot).toMatch(
      /simulation_drift_total\{type="CARRIER_WRITE",operation="calcPreview",guardMode="shadow"\}\s+2/,
    );
    expect(snapshot).toMatch(
      /simulation_drift_total\{type="CONFIG",operation="calcPreview",guardMode="shadow"\}\s+1/,
    );
    expect(snapshot).toMatch(
      /simulation_drift_total\{type="CARRIER_WRITE",operation="interestCalc",guardMode="shadow"\}\s+1/,
    );

    // drift_provider_errors_total: 1 error
    expect(snapshot).toMatch(
      /drift_provider_errors_total\{operation="calcPreview",guardMode="shadow"\}\s+1/,
    );

    // kill_switch_state: 0 (inactive)
    expect(snapshot).toMatch(
      /kill_switch_state\{tenant="tenant-demo",operation="calcPreview"\}\s+0/,
    );

    // http_responses_total: 10 initial + this request = 11 GET 200s
    expect(snapshot).toMatch(
      /http_responses_total\{status="200",method="GET"\}\s+1[0-9]/,
    );

    // --- 3) Legacy string-based metrics still present (no breaking change) ---
    expect(snapshot).toContain('carrier_redrive');
    expect(snapshot).toContain('audit_buffer_size');
    expect(snapshot).toContain('idempotency_action_total');

    // --- 4) Print snapshot for review ---
    // Extract only I0-relevant lines for the report
    const lines = snapshot.split('\n');
    const i0Lines = lines.filter(
      (l) =>
        l.startsWith('simulation_drift_total') ||
        l.startsWith('drift_provider_errors_total') ||
        l.startsWith('http_responses_total') ||
        l.startsWith('kill_switch_state') ||
        l.startsWith('# HELP simulation_drift_total') ||
        l.startsWith('# TYPE simulation_drift_total') ||
        l.startsWith('# HELP drift_provider_errors_total') ||
        l.startsWith('# TYPE drift_provider_errors_total') ||
        l.startsWith('# HELP http_responses_total') ||
        l.startsWith('# TYPE http_responses_total') ||
        l.startsWith('# HELP kill_switch_state') ||
        l.startsWith('# TYPE kill_switch_state'),
    );

    console.log('\n========== I0 /metrics SNAPSHOT ==========');
    console.log(i0Lines.join('\n'));
    console.log('===========================================\n');
  });

  it('should record http_responses_total{status="503"} after test route hit', async () => {
    // ── Hit the test route to generate a 503 ──
    // Note: 503 comes from /__test__/force-503, NOT from guard BLOCK.
    // NR-3 shadow downgrade behavior is unaffected.
    const res503 = await request(app.getHttpServer()).get('/__test__/force-503');
    expect(res503.status).toBe(503);

    // Hit it a few more times for a clear signal
    await request(app.getHttpServer()).get('/__test__/force-503');
    await request(app.getHttpServer()).get('/__test__/force-503');

    // ── Capture /metrics and validate 503 counter ──
    const res = await request(app.getHttpServer()).get('/metrics');
    const snapshot = res.text;

    expect(snapshot).toMatch(
      /http_responses_total\{status="503",method="GET"\}\s+[3-9]/,
    );

    // Print 503 line for review
    const lines503 = snapshot.split('\n').filter(l => l.includes('status="503"'));
    console.log('\n--- 503 metric lines ---');
    console.log(lines503.join('\n') || '(none)');
    console.log('---\n');
  });

  it('should contain all I0 metric HELP/TYPE declarations (snapshot completeness)', async () => {
    // ── This test validates the T0 runsheet expectation: ──
    // After any synthetic traffic, /metrics MUST contain all I0 metric
    // declarations (HELP + TYPE) regardless of whether data lines exist.

    const res = await request(app.getHttpServer()).get('/metrics');
    const snapshot = res.text;

    // Required I0 metrics — must have both HELP and TYPE
    const requiredMetrics = [
      'simulation_drift_total',
      'drift_provider_errors_total',
      'http_responses_total',
      'kill_switch_state',
    ];

    for (const metric of requiredMetrics) {
      expect(snapshot).toContain(`# HELP ${metric}`);
      expect(snapshot).toContain(`# TYPE ${metric}`);
    }

    // Verify http_responses_total has both 200 and 503 data lines
    expect(snapshot).toMatch(/http_responses_total\{status="200",method="GET"\}\s+\d+/);
    expect(snapshot).toMatch(/http_responses_total\{status="503",method="GET"\}\s+\d+/);
  });
});
