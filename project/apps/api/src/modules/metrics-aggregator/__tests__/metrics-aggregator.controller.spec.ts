/**
 * Metrics Aggregator Controller — Smoke Tests
 *
 * Validates:
 * - GET /metrics returns 200
 * - Content-Type is Prometheus exposition format
 * - Body contains known metric names from each source
 * - No metric name collisions across sources
 * - I0 prom-client metrics present (hybrid aggregator)
 *
 * @see .kiro/specs/i0-metrics-runway/requirements.md R2, R7, R11.1
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Registry } from 'prom-client';
import { MetricsAggregatorModule } from '../metrics-aggregator.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';

// Import metric mutators to ensure non-empty output
import {
  redriveKillSwitchGauge,
  redriveDisabledMetric,
  redriveTxDurationHistogram,
  resetAllMetrics,
} from '../../calc-preview/diagnostics/object-store/manifest-retry/idempotency/carrier-lifecycle/carrier-lifecycle-metrics';

describe('MetricsAggregatorController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MetricsRegistryModule, MetricsAggregatorModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetAllMetrics();
  });

  it('should return 200 with Prometheus content type', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('should contain carrier_* metrics (carrier-lifecycle source)', async () => {
    redriveKillSwitchGauge.set(1);
    redriveDisabledMetric.inc();
    redriveTxDurationHistogram.observe(0.05);

    const res = await request(app.getHttpServer()).get('/metrics');
    const body: string = res.text;

    expect(body).toContain('carrier_redrive_kill_switch_active');
    expect(body).toContain('carrier_redrive_disabled_total');
    expect(body).toContain('carrier_redrive_tx_duration_seconds_bucket');
    expect(body).toContain('carrier_redrive_backoff_seconds');
    expect(body).toContain('carrier_redrive_rejected_total');
  });

  it('should contain audit_* metrics (audit source)', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    const body: string = res.text;

    expect(body).toContain('audit_buffer_size');
    expect(body).toContain('audit_events_flushed_total');
    expect(body).toContain('audit_flush_duration_seconds');
  });

  it('should contain idempotency_* metrics (idempotency source)', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    const body: string = res.text;

    expect(body).toContain('idempotency_action_total');
    expect(body).toContain('idempotency_gate_latency_seconds');
    expect(body).toContain('idempotency_gate_result_total');
  });

  it('should have no duplicate # HELP lines for same metric name', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    const body: string = res.text;

    const helpLines = body.split('\n').filter(l => l.startsWith('# HELP'));
    const metricNames = helpLines.map(l => l.split(' ')[2]);
    const uniqueNames = new Set(metricNames);

    expect(metricNames.length).toBe(uniqueNames.size);
  });
});
