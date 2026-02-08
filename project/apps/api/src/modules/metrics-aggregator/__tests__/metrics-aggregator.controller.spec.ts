/**
 * Metrics Aggregator Controller — Smoke Tests
 *
 * Validates:
 * - GET /metrics returns 200
 * - Content-Type is Prometheus exposition format
 * - Body contains known metric names from each source
 * - No metric name collisions across sources
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { MetricsAggregatorModule } from '../metrics-aggregator.module';

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
      imports: [MetricsAggregatorModule],
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
    // Set a gauge so it appears in output
    redriveKillSwitchGauge.set(1);
    redriveDisabledMetric.inc();
    redriveTxDurationHistogram.observe(0.05);

    const res = await request(app.getHttpServer()).get('/metrics');
    const body: string = res.text;

    // Kill-switch gauge
    expect(body).toContain('carrier_redrive_kill_switch_active');
    // Disabled counter
    expect(body).toContain('carrier_redrive_disabled_total');
    // Tx duration histogram buckets
    expect(body).toContain('carrier_redrive_tx_duration_seconds_bucket');
    // Backoff histogram
    expect(body).toContain('carrier_redrive_backoff_seconds');
    // Rejected counter
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
