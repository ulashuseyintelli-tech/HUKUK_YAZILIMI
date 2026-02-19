/**
 * Property 3: HTTP Status Code Metrik Doğruluğu
 *
 * Feature: i0-metrics-runway
 * Validates: Requirements 5.2, 6.2
 *
 * For any HTTP response with status S and method M,
 * http_responses_total{status=S, method=M} increments by exactly 1.
 *
 * Deterministic: seed fixed, runtime bounded.
 */

import * as fc from 'fast-check';
import { Registry } from 'prom-client';
import { HttpMetricsMiddleware } from '../http-metrics.middleware';
import { EventEmitter } from 'events';

const statusArb = fc.integer({ min: 100, max: 599 });
const methodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH');

describe('Feature: i0-metrics-runway — Property 3: HTTP Status Code Metrik Doğruluğu', () => {
  it('http_responses_total{status, method} should increment by exactly 1 for any response', async () => {
    await fc.assert(
      fc.asyncProperty(statusArb, methodArb, async (status, method) => {
        const registry = new Registry();
        const middleware = new HttpMetricsMiddleware(registry);

        const req = { method } as any;
        const res = Object.assign(new EventEmitter(), { statusCode: status }) as any;

        middleware.use(req, res, () => {});
        res.emit('finish');

        const metric = await registry.getSingleMetric('http_responses_total');
        const values = (await metric!.get()).values;

        expect(values).toHaveLength(1);
        expect(values[0].value).toBe(1);
        expect(values[0].labels).toEqual({
          status: String(status),
          method,
        });
      }),
      { numRuns: 100, seed: 42 },
    );
  });
});

/**
 * Property 5: HTTP Label Cardinality Drift Guard
 *
 * Feature: i0-metrics-runway
 * Validates: Requirements 12.1, 12.2
 *
 * http_responses_total label set MUST contain ONLY {status, method}.
 * If route, path, url, or any other label appears → cardinality drift → FAIL.
 *
 * This property prevents future regressions where someone adds a high-cardinality
 * label (e.g. route) to the HTTP counter without updating the cardinality budget.
 */
describe('Feature: i0-metrics-runway — Property 5: HTTP Label Cardinality Drift Guard', () => {
  const ALLOWED_LABELS = new Set(['status', 'method']);

  it('http_responses_total label keys must be exactly {status, method} — no route, path, or other labels', async () => {
    await fc.assert(
      fc.asyncProperty(statusArb, methodArb, async (status, method) => {
        const registry = new Registry();
        const middleware = new HttpMetricsMiddleware(registry);

        const req = { method, url: '/api/v1/cases/123', route: { path: '/api/v1/cases/:id' } } as any;
        const res = Object.assign(new EventEmitter(), { statusCode: status }) as any;

        middleware.use(req, res, () => {});
        res.emit('finish');

        const metric = await registry.getSingleMetric('http_responses_total');
        const values = (await metric!.get()).values;

        for (const v of values) {
          const labelKeys = Object.keys(v.labels);
          // Exact label set — no more, no less
          expect(labelKeys.sort()).toEqual([...ALLOWED_LABELS].sort());
          // Explicit forbidden labels
          expect(v.labels).not.toHaveProperty('route');
          expect(v.labels).not.toHaveProperty('path');
          expect(v.labels).not.toHaveProperty('url');
          expect(v.labels).not.toHaveProperty('endpoint');
        }

        // Also check raw output for forbidden substrings
        const output = await registry.metrics();
        expect(output).not.toContain('route=');
        expect(output).not.toContain('path=');
        expect(output).not.toContain('url=');
        expect(output).not.toContain('endpoint=');
      }),
      { numRuns: 100, seed: 42 },
    );
  });
});
