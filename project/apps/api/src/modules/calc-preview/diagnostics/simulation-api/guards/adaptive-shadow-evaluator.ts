/**
 * AdaptiveShadowEvaluator — Shadow Evaluation Orchestration Service
 *
 * SD-2.5 Task 3 → SD-2.6 D2 Task 2.3: Tenant-aware evaluator refactor
 *
 * Single entry point: evaluateIfEnabled()
 * Called from GuardInterceptor via try/catch (best-effort).
 *
 * Responsibilities:
 *   1. Tenant gating — R3: tenantGate.isEnabled(tenantId) replaces flagProvider
 *   2. Canary mapper selection — R4: isCanary → realMapper, else → stubMapper
 *   3. Per-tenant state read/write — R5: stateStore.getForTenant/setForTenant
 *   4. evaluateAdaptive() call — SD-2 pure function (NEVER modified)
 *   5. Metrics emission — R6 (bounded cardinality)
 *   6. Structured logging — R7
 *
 * Error handling:
 *   - Internal errors → emitError() + rethrow (interceptor swallows)
 *   - R3-AC3: exception never blocks guard decision
 *   - R4-AC3: lastEvaluatedAtMs not updated on error
 *
 * Import direction: evaluator → controller (never reverse) — P6
 *
 * @see .kiro/specs/sd-26-adaptive-real-signals/requirements.md — R3, R4, R5
 * @see .kiro/specs/sd-26-adaptive-real-signals/design.md — D2
 */

import { evaluateAdaptive } from './adaptive-controller';
import type { AdaptiveConfig, AdaptiveInternalState } from './adaptive-controller.types';
import type { GuardOperation } from './guard-policy-resolver.types';
import type { AdaptiveControlInputMapper } from './adaptive-control-input-mapper';
import type { AdaptiveShadowStateStore } from './adaptive-shadow-state-store';
import type { AdaptiveShadowMetrics } from './adaptive-shadow-metrics';
import type { AdaptiveShadowLogger } from './adaptive-shadow-logger';
import type { AdaptiveTenantGate } from './adaptive-tenant-gate';
import { normalizeOverrideSource } from './adaptive-shadow.types';
import type { AdaptiveShadowErrorCode } from './adaptive-shadow.types';

// ============================================================================
// Interface
// ============================================================================

export interface AdaptiveShadowEvaluatorPort {
  evaluateIfEnabled(tenantId: string, operation: GuardOperation): void;
}

// ============================================================================
// Dependencies — SD-2.6 D2: tenant-aware (with backward-compat)
// ============================================================================

/**
 * SD-2.5 legacy deps shape — flagProvider + inputMapper.
 * SD-2.5 tests import AdaptiveShadowEvaluatorDeps and use this shape.
 * Constructor detects via 'tenantGate' key and wraps automatically.
 */
export interface AdaptiveShadowEvaluatorDeps {
  readonly flagProvider: () => boolean;
  readonly inputMapper: AdaptiveControlInputMapper;
  readonly stateStore: AdaptiveShadowStateStore;
  readonly config: AdaptiveConfig;
  readonly metricsEmitter: AdaptiveShadowMetrics;
  readonly logger: AdaptiveShadowLogger;
}

/**
 * SD-2.6 D2 tenant-aware deps shape — tenantGate + stubMapper + optional realMapper.
 */
export interface TenantAwareEvaluatorDeps {
  /** SD-2.6 D2: tenant gate replaces flagProvider */
  readonly tenantGate: AdaptiveTenantGate;
  /** SD-2.5: stub mapper (non-canary tenants) */
  readonly stubMapper: AdaptiveControlInputMapper;
  /** SD-2.6 D3: real mapper (canary tenants) — optional until D3 wired */
  readonly realMapper?: AdaptiveControlInputMapper;
  readonly stateStore: AdaptiveShadowStateStore;
  readonly config: AdaptiveConfig;
  readonly metricsEmitter: AdaptiveShadowMetrics;
  readonly logger: AdaptiveShadowLogger;
}

// ============================================================================
// Implementation
// ============================================================================

export class AdaptiveShadowEvaluator implements AdaptiveShadowEvaluatorPort {
  private readonly resolvedDeps: TenantAwareEvaluatorDeps;
  private readonly useLegacyStateStore: boolean;

  constructor(deps: TenantAwareEvaluatorDeps | AdaptiveShadowEvaluatorDeps) {
    if ('tenantGate' in deps) {
      this.resolvedDeps = deps;
      this.useLegacyStateStore = false;
    } else {
      // Backward-compat: wrap legacy deps into new shape
      const legacyDeps = deps;
      this.resolvedDeps = {
        tenantGate: {
          isEnabled: () => legacyDeps.flagProvider(),
          isCanary: () => false,
        },
        stubMapper: legacyDeps.inputMapper,
        stateStore: legacyDeps.stateStore,
        config: legacyDeps.config,
        metricsEmitter: legacyDeps.metricsEmitter,
        logger: legacyDeps.logger,
      };
      this.useLegacyStateStore = true;
    }
  }

  evaluateIfEnabled(tenantId: string, operation: GuardOperation): void {
    // ── R3: tenant gate check (replaces flagProvider) ───────────────
    if (!this.resolvedDeps.tenantGate.isEnabled(tenantId)) {
      return;
    }

    let errorCode: AdaptiveShadowErrorCode | null = null;

    try {
      // ── R4: canary → realMapper, non-canary → stubMapper ──────────
      const isCanary = this.resolvedDeps.tenantGate.isCanary(tenantId);
      const realMapperAvailable = isCanary && this.resolvedDeps.realMapper;
      const mapper = realMapperAvailable
        ? this.resolvedDeps.realMapper!
        : this.resolvedDeps.stubMapper;

      // D3: canary tenant but realMapper not wired → anomaly telemetry
      if (isCanary && !this.resolvedDeps.realMapper) {
        try {
          this.resolvedDeps.metricsEmitter.emitError('REAL_MAPPER_UNAVAILABLE');
        } catch {
          // best-effort
        }
      }

      const input = mapper.buildInput();

      // ── R5: per-tenant state read ─────────────────────────────────
      let currentState: AdaptiveInternalState;
      try {
        currentState = this.useLegacyStateStore
          ? this.resolvedDeps.stateStore.get()
          : this.resolvedDeps.stateStore.getForTenant(tenantId);
      } catch (e) {
        errorCode = 'STATE_STORE_ERROR';
        throw e;
      }

      // ── SD-2 pure function: evaluate ──────────────────────────────
      const result = evaluateAdaptive(currentState, input, this.resolvedDeps.config);

      // ── R5: per-tenant state write ────────────────────────────────
      try {
        if (this.useLegacyStateStore) {
          this.resolvedDeps.stateStore.set(result.nextState);
        } else {
          this.resolvedDeps.stateStore.setForTenant(tenantId, result.nextState);
        }
      } catch (e) {
        errorCode = 'STATE_STORE_ERROR';
        throw e;
      }

      // ── R6: emit metrics (bounded cardinality) ────────────────────
      const overrideSource = normalizeOverrideSource(
        result.nextState.overrideSource,
      );
      this.resolvedDeps.metricsEmitter.emitEvaluation(result.output, overrideSource);

      if (result.output.transitionOccurred) {
        this.resolvedDeps.metricsEmitter.emitTransition(result.output);
      }

      // ── R7: structured log ────────────────────────────────────────
      this.resolvedDeps.logger.logEvaluation(
        result.output,
        tenantId,
        operation,
        input.sigmaZone,
      );
    } catch (e) {
      // ── R3-AC4: emit error metric with closed-set code ────────────
      const code: AdaptiveShadowErrorCode = errorCode ?? 'EVALUATION_EXCEPTION';
      try {
        this.resolvedDeps.metricsEmitter.emitError(code);
      } catch {
        // best-effort: if metrics itself fails, nothing more to do
      }

      // Rethrow — interceptor will swallow (R3-AC3)
      throw e;
    }
  }
}

// ============================================================================
// Noop Implementation (default — mevcut testleri kırmaz)
// ============================================================================

export class NoopAdaptiveShadowEvaluator implements AdaptiveShadowEvaluatorPort {
  evaluateIfEnabled(_tenantId: string, _operation: GuardOperation): void {
    // intentionally empty
  }
}
