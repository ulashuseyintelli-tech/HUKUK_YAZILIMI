/**
 * Idempotency Module
 * 
 * Phase 10.3 - PR-2
 * 
 * NestJS module for idempotency gate.
 */

import { Module } from '@nestjs/common';
import { IdempotencyGateService } from './idempotency-gate.service';
import { IdempotencyGateInterceptor } from './idempotency-gate.interceptor';

@Module({
  providers: [IdempotencyGateService, IdempotencyGateInterceptor],
  exports: [IdempotencyGateService, IdempotencyGateInterceptor],
})
export class IdempotencyModule {}
