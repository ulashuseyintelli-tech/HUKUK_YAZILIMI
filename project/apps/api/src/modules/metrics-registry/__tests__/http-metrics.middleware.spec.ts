/**
 * HTTP Metrics Middleware — Unit Tests
 *
 * Validates:
 * - http_responses_total increments on response finish
 * - Correct {status, method} labels
 * - 503 status code increment (R11.3)
 *
 * @see .kiro/specs/i0-metrics-runway/requirements.md R5, R6, R11.3
 */

import { Registry } from 'prom-client';
import { HttpMetricsMiddleware } from '../http-metrics.middleware';
import { EventEmitter } from 'events';

function createMockReqRes(method: string, statusCode: number) {
  const req = { method } as any;
  const res = Object.assign(new EventEmitter(), { statusCode }) as any;
  return { req, res };
}

describe('HttpMetricsMiddleware', () => {
  let registry: Registry;
  let middleware: HttpMetricsMiddleware;

  beforeEach(() => {
    registry = new Registry();
    middleware = new HttpMetricsMiddleware(registry);
  });

  it('should increment http_responses_total on response finish', async () => {
    const { req, res } = createMockReqRes('GET', 200);
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();

    res.emit('finish');

    const output = await registry.metrics();
    expect(output).toMatch(/http_responses_total\{.*status="200".*method="GET".*\}\s+1/);
  });

  it('should increment counter for 503 status (R11.3)', async () => {
    const { req, res } = createMockReqRes('POST', 503);
    const next = jest.fn();

    middleware.use(req, res, next);
    res.emit('finish');

    const output = await registry.metrics();
    expect(output).toMatch(/http_responses_total\{.*status="503".*method="POST".*\}\s+1/);
  });

  it('should track different status codes separately', async () => {
    const pairs = [
      { method: 'GET', status: 200 },
      { method: 'GET', status: 404 },
      { method: 'POST', status: 201 },
    ];

    for (const { method, status } of pairs) {
      const { req, res } = createMockReqRes(method, status);
      middleware.use(req, res, jest.fn());
      res.emit('finish');
    }

    const metric = await registry.getSingleMetric('http_responses_total');
    const values = (await metric!.get()).values;
    expect(values).toHaveLength(3);
  });

  it('should not include route label (cardinality budget)', async () => {
    const { req, res } = createMockReqRes('GET', 200);
    middleware.use(req, res, jest.fn());
    res.emit('finish');

    const output = await registry.metrics();
    expect(output).not.toContain('route=');
    expect(output).not.toContain('path=');
  });
});
