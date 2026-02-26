/**
 * PromAdaptiveShadowMetrics — prom-client Adapter
 *
 * SD-2.6 D1 Task 1.1: Prometheus client wiring
 *
 * Replaces NoopAdaptiveShadowMetrics with real prom-client Counter exports.
 * All label values come from closed-set enums (SD-2.5 R5 guarantee preserved).
 *
 * Metrics:
 *   guard_adaptive_eval_total{state, guardMode, outputReason, overrideSource}
 *   guard_adaptive_transition_total{from, to, stateReason}
 *   guard_adaptive_eval_errors_total{code}
 *   guard_adaptive_tenant_eviction_total{reason} — F2: LRU eviction telemetry
 *
 * DI: PROM_REGISTRY injection token (SimulationMetricsService pattern).
 * Error handling: Counter.inc() failure → swallow (best-effort).
 *
 * Flag-off guarantee: This class is never called when adaptive_shadow_enabled=false.
 * The evaluator (AdaptiveShadowEvaluator) gates all calls behind the flag check.
 * Therefore P2 (flag off = no increments) is preserved by the caller, not by this class.
 *
 * @see .kiro/specs/sd-26-adaptive-real-signals/requirements.md — R1, R2
 * @see .kiro/specs/sd-26-adaptive-real-signals/design.md — D1
 */

import { Counter, Registry } from 'prom-client';
import type { ControlOutput } from './adaptive-controller.types';
import type { AdaptiveShadowMetrics } from './adaptive-shadow-metrics';
import type { AdaptiveShadowErrorCode, OverrideSourceLabel } from './adaptive-shadow.types';
import type { FallbackField } from './adaptive-real-input-mapper';

/** Closed-set eviction reasons */
export type EvictionReason = 'LRU';

export class PromAdaptiveShadowMetrics implements AdaptiveShadowMetrics {
  private readonly evalTotal: Counter;
  private readonly transitionTotal: Counter;
  private readonly errorsTotal: Counter;
  private readonly evictionTotal: Counter;
  private readonly inputFallbackTotal: Counter;

  constructor(registry: Registry) {
    this.evalTotal = new Counter({
      name: 'guard_adaptive_eval_total',
      help: 'Total adaptive shadow evaluations',
      labelNames: ['state', 'guardMode', 'outputReason', 'overrideSource'] as const,
      registers: [registry],
    });

    this.transitionTotal = new Counter({
      name: 'guard_adaptive_transition_total',
      help: 'Total adaptive state transitions',
      labelNames: ['from', 'to', 'stateReason'] as const,
      registers: [registry],
    });

    this.errorsTotal = new Counter({
      name: 'guard_adaptive_eval_errors_total',
      help: 'Total adaptive evaluation errors',
      labelNames: ['code'] as const,
      registers: [registry],
    });

    this.evictionTotal = new Counter({
      name: 'guard_adaptive_tenant_eviction_total',
      help: 'Total tenant state evictions from adaptive state store',
      labelNames: ['reason'] as const,
      registers: [registry],
    });

    this.inputFallbackTotal = new Counter({
      name: 'guard_adaptive_input_fallback_total',
      help: 'Total input field fallbacks in real mapper (D3)',
      labelNames: ['field'] as const,
      registers: [registry],
    });
  }

  emitEvaluation(output: ControlOutput, overrideSource: OverrideSourceLabel): void {
    try {
      this.evalTotal.inc({
        state: output.state,
        guardMode: output.guardMode,
        outputReason: output.outputReason,
        overrideSource,
      });
    } catch {
      // best-effort: swallow prom-client errors (R1-AC5)
    }
  }

  emitTransition(output: ControlOutput): void {
    try {
      this.transitionTotal.inc({
        from: output.previousState,
        to: output.state,
        stateReason: output.stateReason,
      });
    } catch {
      // best-effort
    }
  }

  emitError(code: AdaptiveShadowErrorCode): void {
    try {
      this.errorsTotal.inc({ code });
    } catch {
      // best-effort
    }
  }

  /** F2: Emit eviction counter — called by state store onEviction callback */
  emitEviction(reason: EvictionReason): void {
    try {
      this.evictionTotal.inc({ reason });
    } catch {
      // best-effort
    }
  }

  /**
   * Factory: creates an EvictionCallback suitable for AdaptiveShadowStateStore constructor.
   * Wiring: `new AdaptiveShadowStateStore(config, promMetrics.createEvictionCallback())`
   */
  createEvictionCallback(): (evictedTenantId: string) => void {
    return (_evictedTenantId: string) => {
      this.emitEviction('LRU');
    };
  }

  /** D3: Emit input field fallback counter — only for real mapper path */
  emitInputFallback(field: FallbackField): void {
    try {
      this.inputFallbackTotal.inc({ field });
    } catch {
      // best-effort
    }
  }

  /**
   * Factory: creates a FallbackIncrementor suitable for RealAdaptiveControlInputMapper constructor.
   * Wiring: `new RealAdaptiveControlInputMapper(ks, signals, config, promMetrics.createFallbackCallback())`
   */
  createFallbackCallback(): (field: FallbackField) => void {
    return (field: FallbackField) => {
      this.emitInputFallback(field);
    };
  }
}
