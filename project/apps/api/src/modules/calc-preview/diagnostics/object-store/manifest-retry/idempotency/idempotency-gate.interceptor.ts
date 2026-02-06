/**
 * Idempotency Gate Interceptor
 * 
 * Phase 10.3 - PR-2, PR-4, PR-7.1
 * 
 * NestJS interceptor for admin mutation idempotency.
 * 
 * FLOW:
 * 1. Parse Idempotency-Key header (required)
 * 2. Read metadata from @IdempotencyAction decorator
 * 3. Call gate.checkAndAcquire()
 * 4. Handle CACHED → return stored response (deterministic, NO audit, NO ALS)
 * 5. Handle IN_PROGRESS → 409 + Retry-After (NO audit, NO ALS)
 * 6. Handle PROCEED → ALS.run(ctx, handler), complete/fail + audit
 * 
 * CRITICAL RULES:
 * - CACHED path: NO audit (determinism rule), NO ALS.run()
 * - IN_PROGRESS path: NO audit (retry semantics), NO ALS.run()
 * - PROCEED path: ALS.run() wraps handler, audit health check (fail-safe)
 * - Takeover: emit IDEMPOTENCY_TAKEOVER audit inside ALS.run()
 * 
 * PR-7.1 CHANGES:
 * - Replaced req.idempotencyContext with AsyncLocalStorage
 * - IdempotencyALS.run() wraps handler execution
 * - Services use getIdempotencyContext() instead of req access
 * - GUARDRAIL: No fire-and-forget async inside run() scope
 * 
 * @see .kiro/specs/phase-10-3-idempotency-hardening/ARCHITECTURE.md
 * @see .kiro/specs/phase-10-3-idempotency-hardening/PR-7-ALS-ARCHITECTURE.md
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, EMPTY, from, throwError } from 'rxjs';
import { catchError, mergeMap, tap } from 'rxjs/operators';
import { IdempotencyGateService } from './idempotency-gate.service';
import { IDEMPOTENCY_META_KEY, IdempotencyMeta } from './idempotency.decorators';
import { ManifestAdminAuditService } from '../audit/manifest-admin-audit.service';
import { AuditResourceType } from '../audit/manifest-admin-audit.types';
import { DEFAULT_IDEMPOTENCY_CONFIG } from './idempotency-gate.types';
import { IdempotencyTakeoverLimiterService } from './idempotency-takeover-limiter.service';
import { IdempotencyALS, IdempotencyContext } from './idempotency-context';
import * as metrics from './idempotency-metrics';

// ============================================================================
// Re-export IdempotencyContext for backward compatibility
// New code should import from './idempotency-context'
// ============================================================================

export { IdempotencyContext } from './idempotency-context';

// ============================================================================
// Error Mapping
// ============================================================================

interface MappedError {
  httpStatus: number;
  code: string;
  message: string;
  body: Record<string, unknown>;
}

function mapError(err: unknown): MappedError {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    
    // NestJS HttpException
    if (typeof e.getStatus === 'function' && typeof e.getResponse === 'function') {
      const status = (e.getStatus as () => number)();
      const response = (e.getResponse as () => unknown)();
      const code = typeof response === 'object' && response !== null 
        ? (response as Record<string, unknown>).code || 'ERROR'
        : 'ERROR';
      const message = typeof response === 'object' && response !== null
        ? (response as Record<string, unknown>).message || String(code)
        : String(code);
      return { httpStatus: status, code: String(code), message: String(message), body: { code, ...(typeof response === 'object' ? response : {}) } };
    }
    
    // Custom error with code
    if (e.code && typeof e.code === 'string') {
      const status = typeof e.status === 'number' ? e.status : 500;
      const message = typeof e.message === 'string' ? e.message : String(e.code);
      return { httpStatus: status, code: e.code, message, body: { code: e.code, message } };
    }
    
    // Error with message
    if (e.message && typeof e.message === 'string') {
      return { httpStatus: 500, code: 'INTERNAL_ERROR', message: e.message, body: { code: 'INTERNAL_ERROR', message: e.message } };
    }
  }
  
  return { httpStatus: 500, code: 'INTERNAL_ERROR', message: 'Internal error', body: { code: 'INTERNAL_ERROR' } };
}

// ============================================================================
// Interceptor
// ============================================================================

@Injectable()
export class IdempotencyGateInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyGateInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly gate: IdempotencyGateService,
    private readonly audit: ManifestAdminAuditService,
    private readonly takeoverLimiter: IdempotencyTakeoverLimiterService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // 1. Check for @IdempotencyAction metadata
    const meta = this.reflector.get<IdempotencyMeta>(IDEMPOTENCY_META_KEY, context.getHandler());
    if (!meta) {
      // No idempotency metadata → pass through
      return next.handle();
    }

    // 2. Get request/response
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    // 3. Handle async flow
    return from(this.handleRequest(req, res, next, meta));
  }

  private async handleRequest(
    req: any,
    res: any,
    next: CallHandler,
    meta: IdempotencyMeta,
  ): Promise<Observable<unknown>> {
    // 1. Parse Idempotency-Key header
    const requestId = this.extractRequestId(req);
    if (!requestId) {
      throw new BadRequestException({
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required',
      });
    }

    // 2. Extract actor info
    const actorId = req.user?.id;
    const actorEmail = req.user?.email ?? null;
    const ipHash = req.ipHash ?? null;

    if (!actorId) {
      throw new BadRequestException({
        code: 'MISSING_ACTOR',
        message: 'Authenticated user required',
      });
    }

    // 3. Resolve resourceId from params
    const resourceId = meta.resourceIdParam 
      ? (req.params?.[meta.resourceIdParam] ?? null)
      : null;

    // 4. Call gate
    const gateResult = await this.gate.checkAndAcquire({
      requestId,
      actionType: meta.actionType,
      endpoint: `${req.method} ${req.route?.path ?? req.url}`,
      resourceType: meta.resourceType,
      resourceId,
      actorId,
      actorEmail,
      ipHash,
      leaseSeconds: meta.leaseSeconds ?? DEFAULT_IDEMPOTENCY_CONFIG.defaultLeaseSeconds,
      retentionDays: meta.retentionDays ?? DEFAULT_IDEMPOTENCY_CONFIG.defaultRetentionDays,
    });

    // 5. Handle CACHED → deterministic replay (NO audit - determinism rule)
    if (gateResult.type === 'CACHED') {
      this.logger.debug(`[Idempotency] Cached response: requestId=${requestId}`);
      metrics.recordGateResult('CACHED');
      res.status(gateResult.httpStatus).json(gateResult.payload);
      return EMPTY;
    }

    // 6. Handle IN_PROGRESS → 409 + Retry-After (NO audit - retry semantics)
    if (gateResult.type === 'IN_PROGRESS') {
      this.logger.debug(`[Idempotency] In progress: requestId=${requestId}`);
      metrics.recordGateResult('IN_PROGRESS');
      res.set('Retry-After', String(gateResult.retryAfterSeconds));
      res.status(409).json({
        code: 'ACTION_IN_PROGRESS',
        requestId,
        actionId: gateResult.actionId,
        retryAfter: gateResult.retryAfterSeconds,
      });
      return EMPTY;
    }

    // 7. PROCEED path
    
    // 7a. Build idempotency context for ALS (PR-7.1)
    const idempotencyContext: IdempotencyContext = {
      actionId: gateResult.actionId,
      requestId,
      actionType: meta.actionType,
      resourceType: meta.resourceType,
      resourceId,
      takeover: gateResult.takeover ?? false,
      previousActorId: gateResult.previousActorId ?? null,
    };
    
    // 7b. Takeover handling (PR-5: rate limit + metrics + separate audit event)
    if (gateResult.takeover) {
      // PR-5: Check takeover rate limit
      const limitResult = this.takeoverLimiter.checkAndRecord(actorId);
      if (!limitResult.allowed) {
        this.logger.warn(
          `[Idempotency] Takeover rate limit exceeded: actor=${actorId}, count=${limitResult.currentCount}`,
        );
        await this.gate.fail({
          actionId: gateResult.actionId,
          ownerToken: gateResult.ownerToken,
          httpStatus: 429,
          resultCode: 'TAKEOVER_RATE_LIMIT_EXCEEDED',
          errorJson: { 
            code: 'TAKEOVER_RATE_LIMIT_EXCEEDED', 
            retryAfter: Math.ceil((limitResult.retryAfterMs ?? 60000) / 1000),
          },
        });
        res.set('Retry-After', String(Math.ceil((limitResult.retryAfterMs ?? 60000) / 1000)));
        res.status(429).json({ 
          code: 'TAKEOVER_RATE_LIMIT_EXCEEDED', 
          retryAfter: Math.ceil((limitResult.retryAfterMs ?? 60000) / 1000),
        });
        return EMPTY;
      }

      // PR-5: Record metrics
      metrics.recordTakeover(meta.actionType);
      metrics.recordLeaseExpired();
      metrics.recordAction(meta.actionType, 'TAKEOVER');
    }

    // PR-5: Record gate result metric
    metrics.recordGateResult('PROCEED');

    // 7c. Audit health check (fail-safe)
    const auditState = this.audit.getState();
    if (auditState.mode === 'DEGRADED') {
      this.logger.error(`[Idempotency] Audit DEGRADED, blocking mutation: requestId=${requestId}`);
      await this.gate.fail({
        actionId: gateResult.actionId,
        ownerToken: gateResult.ownerToken,
        httpStatus: 503,
        resultCode: 'AUDIT_SYSTEM_DEGRADED',
        errorJson: { code: 'AUDIT_SYSTEM_DEGRADED', retryAfter: 60 },
      });
      res.status(503).json({ code: 'AUDIT_SYSTEM_DEGRADED', retryAfter: 60 });
      return EMPTY;
    }

    // 8. Execute handler inside ALS.run() scope (PR-7.1)
    // GUARDRAIL: All async operations MUST complete before run() returns
    // DO NOT use fire-and-forget async (setImmediate, unhandled promises) inside this scope
    return this.executeWithALS(
      idempotencyContext,
      next,
      req,
      res,
      meta,
      actorId,
      resourceId,
      gateResult,
    );
  }

  /**
   * Execute handler inside ALS context.
   * 
   * PR-7.1: Wraps handler execution with IdempotencyALS.run()
   * 
   * CRITICAL: All async operations must complete synchronously within the
   * Observable pipeline. No fire-and-forget async allowed.
   */
  private executeWithALS(
    ctx: IdempotencyContext,
    next: CallHandler,
    req: any,
    res: any,
    meta: IdempotencyMeta,
    actorId: string,
    resourceId: string | null,
    gateResult: { actionId: string; ownerToken: string; takeover?: boolean; previousActorId?: string | null },
  ): Observable<unknown> {
    let terminalWritten = false;

    // Wrap the entire Observable pipeline in ALS.run()
    return new Observable((subscriber) => {
      IdempotencyALS.run(ctx, () => {
        // PR-5: Emit IDEMPOTENCY_TAKEOVER audit inside ALS scope (if takeover)
        if (ctx.takeover) {
          this.audit.append({
            eventType: 'IDEMPOTENCY_TAKEOVER',
            actor: actorId,
            requestId: ctx.requestId,
            ipAddress: req.ip ?? null,
            userAgent: req.get?.('user-agent') ?? null,
            resourceType: meta.resourceType as AuditResourceType,
            resourceId: resourceId ?? gateResult.actionId,
            targetBundleId: resourceId,
            beforeState: { previousActorId: gateResult.previousActorId },
            afterState: { newActorId: actorId, takeover: true },
            reason: 'LEASE_EXPIRED_TAKEOVER',
            actionId: gateResult.actionId,
            outcome: 'TAKEOVER',
            takeoverFrom: gateResult.previousActorId ?? null,
          });
          this.logger.warn(`[Idempotency] Takeover: requestId=${ctx.requestId}, previousActor=${gateResult.previousActorId}`);
        }

        // Execute handler and pipe through completion/failure logic
        const subscription = next.handle().pipe(
          tap(async (body) => {
            if (terminalWritten) return;
            terminalWritten = true;

            await this.gate.complete({
              actionId: gateResult.actionId,
              ownerToken: gateResult.ownerToken,
              httpStatus: res.statusCode || 200,
              resultCode: 'OK',
              resultJson: body,
            });
            
            // PR-4: Emit SUCCESS audit (inside ALS scope)
            this.audit.append({
              eventType: 'ADMIN_ACTION',
              actor: actorId,
              requestId: ctx.requestId,
              ipAddress: req.ip ?? null,
              userAgent: req.get?.('user-agent') ?? null,
              resourceType: meta.resourceType as AuditResourceType,
              resourceId: resourceId ?? gateResult.actionId,
              targetBundleId: resourceId,
              beforeState: null,
              afterState: body as Record<string, unknown> | null,
              reason: null,
              actionId: gateResult.actionId,
              outcome: 'SUCCESS',
            });
            
            metrics.recordAction(meta.actionType, 'SUCCESS');
            this.logger.debug(`[Idempotency] Completed: requestId=${ctx.requestId}, actionId=${gateResult.actionId}`);
          }),
          catchError((err) =>
            from(
              (async () => {
                if (terminalWritten) return;
                terminalWritten = true;

                const mapped = mapError(err);
                await this.gate.fail({
                  actionId: gateResult.actionId,
                  ownerToken: gateResult.ownerToken,
                  httpStatus: mapped.httpStatus,
                  resultCode: mapped.code,
                  errorJson: mapped.body,
                });
                
                // PR-4: Emit FAILED audit (inside ALS scope)
                this.audit.append({
                  eventType: 'ADMIN_ACTION',
                  actor: actorId,
                  requestId: ctx.requestId,
                  ipAddress: req.ip ?? null,
                  userAgent: req.get?.('user-agent') ?? null,
                  resourceType: meta.resourceType as AuditResourceType,
                  resourceId: resourceId ?? gateResult.actionId,
                  targetBundleId: resourceId,
                  beforeState: null,
                  afterState: null,
                  reason: mapped.code,
                  actionId: gateResult.actionId,
                  outcome: 'FAILED',
                  errorCode: mapped.code,
                  errorMessage: mapped.message,
                });
                
                metrics.recordAction(meta.actionType, 'FAILED');
                this.logger.debug(`[Idempotency] Failed: requestId=${ctx.requestId}, code=${mapped.code}`);
              })(),
            ).pipe(mergeMap(() => throwError(() => err))),
          ),
        ).subscribe(subscriber);

        return () => subscription.unsubscribe();
      });
    });
  }

  /**
   * Extract request ID from headers.
   * Supports: Idempotency-Key, X-Request-Id
   */
  private extractRequestId(req: any): string | null {
    const idempotencyKey = req.get?.('Idempotency-Key') || req.headers?.['idempotency-key'];
    if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
      return idempotencyKey.trim();
    }

    const xRequestId = req.get?.('X-Request-Id') || req.headers?.['x-request-id'];
    if (xRequestId && typeof xRequestId === 'string' && xRequestId.trim()) {
      return xRequestId.trim();
    }

    return null;
  }
}
