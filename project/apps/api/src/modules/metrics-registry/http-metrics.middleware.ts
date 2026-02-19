/**
 * HTTP Metrics Middleware
 *
 * I0 Metrics Runway — Task 5.1
 *
 * Counts HTTP responses by {status, method}.
 * Route label intentionally omitted (cardinality budget — I0 scope).
 *
 * Uses response 'finish' event to capture final status code
 * (after exception filters have run).
 *
 * @see .kiro/specs/i0-metrics-runway/design.md
 */

import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { Counter, Registry } from 'prom-client';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  private readonly httpResponsesTotal: Counter;

  constructor(@Inject('PROM_REGISTRY') registry: Registry) {
    this.httpResponsesTotal = new Counter({
      name: 'http_responses_total',
      help: 'Total HTTP responses by status and method',
      labelNames: ['status', 'method'],
      registers: [registry],
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    res.on('finish', () => {
      this.httpResponsesTotal.inc({
        status: String(res.statusCode),
        method: req.method,
      });
    });
    next();
  }
}
