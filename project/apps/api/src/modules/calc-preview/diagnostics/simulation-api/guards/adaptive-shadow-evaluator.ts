/**
 * AdaptiveShadowEvaluator — Shadow Evaluation Orchestration Service
 *
 * SD-2.5 Task 3: Evaluator orchestration
 *
 * Single entry point: evaluateIfEnabled()
 * Called from GuardInterceptor via try/catch (best-effort).
 *
 * Responsibilities:
 *   1. Flag gating — R1-AC2: disabled → immediate return, zero work
 *   2. Input mapping delegation — R2
 *   3. State read/write — R4
 *   4. evaluateAdaptive() call — SD-2 pure function
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
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/requirements.md — R1, R3
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/design.md — D1
 */

import { evaluateAdaptive } from './adaptive-controller';
import type { AdaptiveConfig, AdaptiveInternalState } from './adaptive-controller.types';
import { DEFAULT_ADAPTIVE_CONFIG } from './adaptive-controller.types';
import type { GuardOperation } from './guard-policy-resolver.types';
import type { AdaptiveControlInputMapper } from './adaptive-control-input-mapper';
import type { AdaptiveShadowStateStore } from './adaptive-shadow-state-store';
import type { AdaptiveShadowMetrics } from './adaptive-shadow-metrics';
import type { AdaptiveShadowLogger } from './adaptive-shadow-logger';
import { normalizeOverrideSource } from './adaptive-shadow.types';
import type { AdaptiveShadowErrorCode } from './adaptive-shadow.types';

// ============================================================================
// Interface
// ============================================================================

export interface AdaptiveShadowEvaluatorPort {
  evaluateIfEnabled(tenantId: string, operation: GuardOperation): void;
}

// ============================================================================
// Dependencies
// ============================================================================

export interface AdaptiveShadowEvaluatorDeps {
  readonly flagProvider: () => boolean;
  readonly inputMapper: AdaptiveControlInputMapper;
  readonly stateStore: AdaptiveShadowStateStore;
  readonly config: AdaptiveConfig;
  readonly metricsEmitter: AdaptiveShadowMetrics;
  readonly logger: AdaptiveShadowLogger;
}

// ============================================================================
// Implementation
// ============================================================================

export class AdaptiveShadowEvaluator implements AdaptiveShadowEvaluatorPort {
  constructor(private readonly deps: AdaptiveShadowEvaluatorDeps) {}

  evaluateIfEnabled(tenantId: string, operation: GuardOperation): void {
    // ── R1-AC2: disabled → immediate return, zero work ──────────────
    if (!this.deps.flagProvider()) {
      return;
    }

    let errorCode: AdaptiveShadowErrorCode | null = null;

    try {
      // ── R2: build stub input ──────────────────────────────────────
      const input = this.deps.inputMapper.buildInput();

      // ── R4: get current state ─────────────────────────────────────
      let currentState: AdaptiveInternalState;
      try {
        currentState = this.deps.stateStore.get();
      } catch (e) {
        errorCode = 'STATE_STORE_ERROR';
        throw e;
      }

      // ── SD-2 pure function: evaluate ──────────────────────────────
      const result = evaluateAdaptive(currentState, input, this.deps.config);

      // ── R4-AC3: persist next state (lastEvaluatedAtMs updated) ────
      try {
        this.deps.stateStore.set(result.nextState);
      } catch (e) {
        errorCode = 'STATE_STORE_ERROR';
        throw e;
      }

      // ── R6: emit metrics (bounded cardinality) ────────────────────
      const overrideSource = normalizeOverrideSource(
        result.nextState.overrideSource,
      );
      this.deps.metricsEmitter.emitEvaluation(result.output, overrideSource);

      if (result.output.transitionOccurred) {
        this.deps.metricsEmitter.emitTransition(result.output);
      }

      // ── R7: structured log ────────────────────────────────────────
      this.deps.logger.logEvaluation(
        result.output,
        tenantId,
        operation,
        input.sigmaZone,
      );
    } catch (e) {
      // ── R3-AC4: emit error metric with closed-set code ────────────
      const code: AdaptiveShadowErrorCode = errorCode ?? 'EVALUATION_EXCEPTION';
      try {
        this.deps.metricsEmitter.emitError(code);
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
