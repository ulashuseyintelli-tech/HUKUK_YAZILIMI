/**
 * GuardInterceptor — NestJS Request-Level Guard Enforcement
 *
 * Operational Guard Phase — Task 4 (revised: Task 5 gaps + Task 6.0 telemetry)
 *
 * Responsibilities:
 *   1. Extract tenantId + operation from request
 *   2. Create frozen GuardDecisionSnapshot via factory
 *   3. Attach snapshot to request context (req.guardDecision)
 *   4. Emit telemetry (best-effort, fire-and-forget — before decision routing)
 *   5. Enforce decisions at interceptor level (Seçenek A — short-circuit):
 *      - BLOCK_503 → throw 503 (no DB touch, no pipeline entry)
 *      - HOLD      → return 200 + deterministic body (no pipeline entry, no state mutation)
 *      - ALLOW     → pass to downstream pipeline
 *      - DEGRADE   → pass to downstream pipeline (only allowlisted ops reach here;
 *                     non-allowlisted are already HOLD by resolver)
 *
 * Enforcement location: INTERCEPTOR (not downstream).
 * "No state mutation on HOLD" is guaranteed because next.handle() is never called.
 *
 * Telemetry: emitDecision() called ONCE after snapshot, BEFORE decision routing.
 * Telemetry failure ⇒ swallow (try/catch). Guard kararını rehin alamaz.
 *
 * All response payloads share a consistent core:
 *   { decision, tenantId, operation, policyVersion, evaluatedAtMs, reasonCodes, riskContextHash }
 *
 * No Date.now() — clock injected via factory.
 * Operation mapping via header/metadata, not string parsing.
 *
 * @see .kiro/specs/operational-guard-phase/design.md — D4, D4.6
 * @see .kiro/specs/operational-guard-phase/requirements.md — R3, R4, R5
 */

import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { type Observable, of } from 'rxjs';
import { GuardDecisionSnapshotFactory } from './guard-decision-snapshot.factory';
import {
  GuardDecision,
  GuardOperation,
  type GuardDecisionSnapshot,
  type GuardMode,
  resolveTenantConfig,
} from './guard-policy-resolver.types';
import {
  type GuardTelemetry,
  NoopGuardTelemetry,
} from './guard-telemetry';
import {
  type AdaptiveShadowEvaluatorPort,
  NoopAdaptiveShadowEvaluator,
} from './adaptive-shadow-evaluator';

// ============================================================================
// Drift Metric Callback (SD-1)
// ============================================================================

/**
 * Callback for drift metric emission.
 * Called by interceptor when reasonCodes contain DRIFT:* prefix (structural drift)
 * or DRIFT_PROVIDER_ERROR (provider failure — separate counter).
 * Decoupled from SimulationMetricsService for testability.
 */
export interface DriftMetricEmitter {
  incSimulationDrift(type: string, operation: string, guardMode: string): void;
  incDriftProviderError(operation: string, guardMode: string): void;
}

/** Noop drift metric emitter — safe default */
export class NoopDriftMetricEmitter implements DriftMetricEmitter {
  incSimulationDrift(_type: string, _operation: string, _guardMode: string): void {
    // intentionally empty
  }
  incDriftProviderError(_operation: string, _guardMode: string): void {
    // intentionally empty
  }
}

// ============================================================================
// Operation Resolver
// ============================================================================

/**
 * Resolves GuardOperation from request context.
 * Uses route handler metadata or explicit header.
 *
 * Default: PROMOTE (fail-safe — most restrictive non-admin path).
 */
export interface OperationResolver {
  resolve(context: ExecutionContext): GuardOperation;
}

/**
 * Default operation resolver — reads from request header or route metadata.
 * Falls back to PROMOTE (most restrictive).
 */
export class DefaultOperationResolver implements OperationResolver {
  resolve(context: ExecutionContext): GuardOperation {
    const request = context.switchToHttp().getRequest();
    const opHeader = request.headers?.['x-guard-operation'];

    if (opHeader && isValidOperation(opHeader)) {
      return opHeader as GuardOperation;
    }

    // Fallback: PROMOTE (most restrictive non-admin path)
    return GuardOperation.PROMOTE;
  }
}

function isValidOperation(value: string): boolean {
  return (
    value === GuardOperation.PROMOTE ||
    value === GuardOperation.EVALUATE ||
    value === GuardOperation.ADMIN
  );
}

// ============================================================================
// Tenant Resolver
// ============================================================================

/**
 * Resolves tenant ID from request context.
 */
export interface TenantResolver {
  resolve(context: ExecutionContext): string;
}

/**
 * Default tenant resolver — reads from request header or property.
 * Falls back to 'default' tenant.
 */
export class DefaultTenantResolver implements TenantResolver {
  resolve(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest();
    return (
      request.tenantId ??
      request.headers?.['x-tenant-id'] ??
      'default'
    );
  }
}

// ============================================================================
// Guard Response Payloads
// ============================================================================

/**
 * Core fields shared by ALL guard response payloads.
 * Consistent shape for incident debug and audit trail.
 */
export interface GuardResponseCore {
  readonly decision: string;
  readonly tenantId: string;
  readonly operation: string;
  readonly policyVersion: string;
  readonly evaluatedAtMs: number;
  readonly reasonCodes: readonly string[];
  readonly riskContextHash: string;
}

/** Deterministic 503 error payload */
export interface Block503Payload extends GuardResponseCore {
  readonly statusCode: 503;
  readonly error: 'SERVICE_UNAVAILABLE';
}

/** Deterministic HOLD response payload (200, no pipeline entry) */
export interface HoldPayload extends GuardResponseCore {
  readonly statusCode: 200;
  readonly held: true;
  readonly mode: string | null;
}

function buildGuardResponseCore(
  snapshot: GuardDecisionSnapshot,
  operation: GuardOperation,
): GuardResponseCore {
  return {
    decision: snapshot.decision,
    tenantId: snapshot.tenantId,
    operation,
    policyVersion: snapshot.policyVersion,
    evaluatedAtMs: snapshot.evaluatedAtMs,
    reasonCodes: snapshot.reasonCodes,
    riskContextHash: snapshot.riskContextHash,
  };
}

function buildBlock503Payload(
  snapshot: GuardDecisionSnapshot,
  operation: GuardOperation,
): Block503Payload {
  return {
    ...buildGuardResponseCore(snapshot, operation),
    statusCode: 503,
    error: 'SERVICE_UNAVAILABLE',
  };
}

function buildHoldPayload(
  snapshot: GuardDecisionSnapshot,
  operation: GuardOperation,
): HoldPayload {
  return {
    ...buildGuardResponseCore(snapshot, operation),
    statusCode: 200,
    held: true,
    mode: snapshot.mode,
  };
}

// ============================================================================
// Interceptor
// ============================================================================

@Injectable()
export class GuardInterceptor implements NestInterceptor {
  constructor(
    private readonly factory: GuardDecisionSnapshotFactory,
    private readonly operationResolver: OperationResolver,
    private readonly tenantResolver: TenantResolver,
    private readonly telemetry: GuardTelemetry = new NoopGuardTelemetry(),
    private readonly driftMetricEmitter: DriftMetricEmitter = new NoopDriftMetricEmitter(),
    private readonly adaptiveShadow: AdaptiveShadowEvaluatorPort = new NoopAdaptiveShadowEvaluator(),
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenantId = this.tenantResolver.resolve(context);
    const operation = this.operationResolver.resolve(context);

    // ── Resolve guard mode (NR-5: tenant override > globalGuardMode > 'disabled') ──
    const config = this.factory.getConfig();
    const tenantConfig = resolveTenantConfig(tenantId, config);
    const guardMode: GuardMode = tenantConfig.guardMode;

    // ── NR-2: DISABLED → zero compute, bypass entirely ─────────────
    if (guardMode === 'disabled') {
      return next.handle();
    }

    // ── NR-1: Single snapshot — computed ONCE, frozen ───────────────
    const t0 = performance.now();
    const snapshot = this.factory.createSnapshot(tenantId, operation);
    const snapshotDurationMs = performance.now() - t0;

    // Attach to request context — immutable reference (NR-6)
    const request = context.switchToHttp().getRequest();
    request.guardDecision = snapshot;

    // ── NR-1: wouldEnforce derived from SAME snapshot ───────────────
    const wouldEnforce =
      snapshot.decision === GuardDecision.BLOCK_503 ||
      snapshot.decision === GuardDecision.HOLD;

    // ── Telemetry: ALWAYS emit (shadow + enforce), BEFORE decision routing ──
    // Best-effort: throw ⇒ swallow. Guard kararını rehin alamaz.
    try {
      this.telemetry.emitDecision({
        tenantId: snapshot.tenantId,
        operation,
        decision: snapshot.decision,
        mode: snapshot.mode,
        reasonCodes: snapshot.reasonCodes,
        policyVersion: snapshot.policyVersion,
        evaluatedAtMs: snapshot.evaluatedAtMs,
        riskContextHash: snapshot.riskContextHash,
        guardMode,
        wouldEnforce,
        snapshotDurationMs,
      });
    } catch {
      // best-effort: swallow — guard decision is not held hostage
    }

    // ── SD-1: Drift metric emit (interceptor responsibility) ────────
    // Condition: reasonCodes contain DRIFT:* prefix (FG-4 gating).
    // DRIFT_PROVIDER_ERROR → separate counter (pipeline health, not structural drift).
    // Kill-switch BLOCK_503 → no DRIFT:* → no drift metric.
    // Best-effort: swallow errors.
    try {
      const driftReasonCodes = snapshot.reasonCodes.filter(
        (r) => r.startsWith('DRIFT:'),
      );
      if (driftReasonCodes.length > 0) {
        for (const rc of driftReasonCodes) {
          const driftType = rc.slice('DRIFT:'.length);
          this.driftMetricEmitter.incSimulationDrift(driftType, operation, guardMode);
        }
      }
      // Provider error → separate counter
      if (snapshot.reasonCodes.includes('DRIFT_PROVIDER_ERROR')) {
        this.driftMetricEmitter.incDriftProviderError(operation, guardMode);
      }
    } catch {
      // best-effort: swallow — guard decision is not held hostage
    }

    // ── SD-2.5: Adaptive shadow evaluation — best-effort, zero impact on guard decision ──
    try {
      this.adaptiveShadow.evaluateIfEnabled(tenantId, operation);
    } catch {
      // R3-AC3: swallow — guard kararı etkilenmez
    }

    // ── NR-3: SHADOW → full compute, zero enforcement ───────────────
    if (guardMode === 'shadow') {
      return next.handle();
    }

    // ── ENFORCE: existing decision routing (unchanged) ──────────────

    // BLOCK_503: throw 503, no pipeline entry
    if (snapshot.decision === GuardDecision.BLOCK_503) {
      throw new HttpException(
        buildBlock503Payload(snapshot, operation),
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // HOLD: return 200 + deterministic body, no pipeline entry
    if (snapshot.decision === GuardDecision.HOLD) {
      return of(buildHoldPayload(snapshot, operation));
    }

    // ALLOW / DEGRADE: pass to downstream pipeline
    return next.handle();
  }
}
