/**
 * Test Routes Controller — Local/Dev Only
 *
 * I0 Metrics Runway — Task 12.B.1
 *
 * Provides controlled HTTP error endpoints for metrics validation.
 * These routes generate deterministic status codes for smoke testing
 * http_responses_total{status="503"} without touching guard logic.
 *
 * IMPORTANT: This controller is for metrics validation only.
 * It does NOT go through the guard pipeline — NR-3 shadow downgrade
 * behavior is unaffected. 503 here is a test route, not a guard BLOCK.
 *
 * Active only when NODE_ENV !== 'production'.
 *
 * @see .kiro/specs/i0-metrics-runway/tasks.md — Task 12.B.1
 */

import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';

@Controller('__test__')
export class TestRoutesController {
  /**
   * GET /__test__/force-503
   * Returns HTTP 503 Service Unavailable.
   * Used by smoke-test.sh Phase 0 and i0-snapshot integration test.
   */
  @Get('force-503')
  force503(): never {
    throw new HttpException(
      { message: 'Test 503 — metrics validation only', source: 'test-route' },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
