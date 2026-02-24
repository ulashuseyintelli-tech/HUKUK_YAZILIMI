/**
 * AdaptiveShadowMetrics — Telemetry Adapter Interface
 *
 * SD-2.5 Task 3: Bounded cardinality metrics emission
 *
 * All label values come from closed-set enums (R5, R6).
 * No tenantId in metric labels (R5-AC2).
 * No free-text reason strings (R5-AC3).
 *
 * Metric table:
 *   guard_adaptive_eval_total{state, guardMode, outputReason, overrideSource}
 *   guard_adaptive_transition_total{from, to, stateReason}
 *   guard_adaptive_eval_errors_total{code}
 *
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/requirements.md — R5, R6
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/design.md — D4
 */

import type { ControlOutput } from './adaptive-controller.types';
import type { AdaptiveShadowErrorCode, OverrideSourceLabel } from './adaptive-shadow.types';

// ============================================================================
// Interface
// ============================================================================

export interface AdaptiveShadowMetrics {
  emitEvaluation(output: ControlOutput, overrideSource: OverrideSourceLabel): void;
  emitTransition(output: ControlOutput): void;
  emitError(code: AdaptiveShadowErrorCode): void;
}

// ============================================================================
// Noop Implementation (production default until Prometheus wired)
// ============================================================================

export class NoopAdaptiveShadowMetrics implements AdaptiveShadowMetrics {
  emitEvaluation(_output: ControlOutput, _overrideSource: OverrideSourceLabel): void {
    // intentionally empty
  }
  emitTransition(_output: ControlOutput): void {
    // intentionally empty
  }
  emitError(_code: AdaptiveShadowErrorCode): void {
    // intentionally empty
  }
}

// ============================================================================
// In-Memory Implementation (testing)
// ============================================================================

export interface CapturedEvalMetric {
  readonly state: string;
  readonly guardMode: string;
  readonly outputReason: string;
  readonly overrideSource: string;
}

export interface CapturedTransitionMetric {
  readonly from: string;
  readonly to: string;
  readonly stateReason: string;
}

export interface CapturedErrorMetric {
  readonly code: AdaptiveShadowErrorCode;
}

export class InMemoryAdaptiveShadowMetrics implements AdaptiveShadowMetrics {
  readonly evaluations: CapturedEvalMetric[] = [];
  readonly transitions: CapturedTransitionMetric[] = [];
  readonly errors: CapturedErrorMetric[] = [];

  emitEvaluation(output: ControlOutput, overrideSource: OverrideSourceLabel): void {
    this.evaluations.push({
      state: output.state,
      guardMode: output.guardMode,
      outputReason: output.outputReason,
      overrideSource,
    });
  }

  emitTransition(output: ControlOutput): void {
    this.transitions.push({
      from: output.previousState,
      to: output.state,
      stateReason: output.stateReason,
    });
  }

  emitError(code: AdaptiveShadowErrorCode): void {
    this.errors.push({ code });
  }

  clear(): void {
    this.evaluations.length = 0;
    this.transitions.length = 0;
    this.errors.length = 0;
  }
}

// ============================================================================
// Throwing Implementation (testing — verifies swallow behavior)
// ============================================================================

export class ThrowingAdaptiveShadowMetrics implements AdaptiveShadowMetrics {
  emitEvaluation(_output: ControlOutput, _overrideSource: OverrideSourceLabel): void {
    throw new Error('Metrics failure — simulated');
  }
  emitTransition(_output: ControlOutput): void {
    throw new Error('Metrics failure — simulated');
  }
  emitError(_code: AdaptiveShadowErrorCode): void {
    throw new Error('Metrics failure — simulated');
  }
}
