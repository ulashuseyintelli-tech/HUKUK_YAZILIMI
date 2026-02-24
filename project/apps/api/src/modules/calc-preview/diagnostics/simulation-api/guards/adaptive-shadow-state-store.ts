/**
 * AdaptiveShadowStateStore — In-Memory Singleton State Store
 *
 * SD-2.5 Task 2: Module-scoped singleton for adaptive state persistence
 *
 * Contract:
 *   - get(): returns current AdaptiveInternalState
 *   - set(): persists next state + updates lastEvaluatedAtMs
 *   - reset(): returns to initial state, clears lastEvaluatedAtMs
 *   - lastEvaluatedAtMs: updated ONLY on successful evaluation (R4-AC3)
 *
 * R4-AC3: lastEvaluatedAtMs starts as null. Updated only when
 *   adaptive_shadow_enabled=true AND evaluateAdaptive() completes successfully.
 *   Not updated on validation failure, exception, or disabled state.
 *
 * R4-AC4: No per-tenant keying (global state). Per-tenant keying is SD-2.6 scope.
 *
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/requirements.md — R4
 * @see .kiro/specs/sd-25-adaptive-shadow-wiring/design.md — D3
 */

import {
  type AdaptiveInternalState,
  createInitialState,
} from './adaptive-controller.types';

export class AdaptiveShadowStateStore {
  private state: AdaptiveInternalState;
  private _lastEvaluatedAtMs: number | null = null;

  constructor() {
    this.state = createInitialState(Date.now());
  }

  get(): AdaptiveInternalState {
    return this.state;
  }

  set(nextState: AdaptiveInternalState): void {
    this.state = nextState;
    this._lastEvaluatedAtMs = Date.now();
  }

  get lastEvaluatedAtMs(): number | null {
    return this._lastEvaluatedAtMs;
  }

  reset(): void {
    this.state = createInitialState(Date.now());
    this._lastEvaluatedAtMs = null;
  }
}
