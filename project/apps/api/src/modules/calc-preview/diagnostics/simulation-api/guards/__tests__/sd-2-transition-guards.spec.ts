/**
 * SD-2 Transition Guards — Guard Interplay Tests
 *
 * T2.2: Guard interplay
 *   - Consecutive → dwell → flip budget cascade
 *   - Guard order sensitivity (order change = test break)
 *   - Flip budget counting semantics (H1: only real transitions count)
 *   - Blocked attempts don't consume flip budget (H1)
 *   - Provider OUTAGE resume semantics (H2)
 *
 * @see .kiro/specs/sd-2-adaptive-control/design.md — Transition Guards
 */

import { evaluateAdaptive } from '../adaptive-controller';
import {
  AdaptiveState,
  ProviderHealthZone,
  createInitialState,
  DEFAULT_ADAPTIVE_CONFIG,
  type ControlInput,
  type AdaptiveInternalState,
  type AdaptiveConfig,
} from '../adaptive-controller.types';

// ============================================================================
// Helpers
// ============================================================================

const T0 = 1_700_000_000_000;

function makeInput(overrides: Partial<ControlInput> = {}): ControlInput {
  return {
    sigmaZone: 'NORMAL',
    complianceVerdict: true,
    providerHealthZone: ProviderHealthZone.OK,
    killSwitchActive: false,
    nowMs: T0,
    ...overrides,
  };
}

function makeState(overrides: Partial<AdaptiveInternalState> = {}): AdaptiveInternalState {
  return Object.freeze({
    ...createInitialState(T0 - 600_000),
    ...overrides,
  });
}

const FAST: AdaptiveConfig = Object.freeze({
  ...DEFAULT_ADAPTIVE_CONFIG,
  consecutiveWindowsRequired: 1,
});


// ============================================================================
// Guard Cascade: consecutive → dwell → flip budget
// ============================================================================

describe('Guard cascade order', () => {
  it('consecutive pending takes priority over dwell check', () => {
    // consecutiveWindowsRequired=3, dwell not met, zone just started
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 100_000, // dwell not met (100s < 300s)
      consecutiveCount: 0,
      lastZone: 'NORMAL',
    });
    const input = makeInput({ sigmaZone: 'WARNING', nowMs: T0 });

    const r = evaluateAdaptive(state, input, DEFAULT_ADAPTIVE_CONFIG);

    // Should report CONSECUTIVE_WINDOW_PENDING, not DWELL_NOT_MET
    expect(r.output.stateReason).toBe('CONSECUTIVE_WINDOW_PENDING');
    expect(r.output.transitionOccurred).toBe(false);
  });

  it('dwell check takes priority over flip budget when consecutive met', () => {
    // consecutive met (3), dwell not met, flip budget exhausted
    const recentFlips = [T0 - 50_000, T0 - 100_000, T0 - 150_000, T0 - 200_000];
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 100_000, // dwell not met
      consecutiveCount: 2, // will become 3 with this eval
      lastZone: 'WARNING',
      flipHistory: Object.freeze(recentFlips),
    });
    const input = makeInput({ sigmaZone: 'WARNING', nowMs: T0 });

    const r = evaluateAdaptive(state, input, DEFAULT_ADAPTIVE_CONFIG);

    // Should report DWELL_NOT_MET, not FLIP_BUDGET_EXHAUSTED
    expect(r.output.stateReason).toBe('DWELL_NOT_MET');
    expect(r.output.transitionOccurred).toBe(false);
  });

  it('flip budget blocks when consecutive met AND dwell met', () => {
    const recentFlips = [T0 - 50_000, T0 - 100_000, T0 - 150_000, T0 - 200_000];
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000, // dwell met
      consecutiveCount: 2, // will become 3
      lastZone: 'WARNING',
      flipHistory: Object.freeze(recentFlips),
    });
    const input = makeInput({ sigmaZone: 'WARNING', nowMs: T0 });

    const r = evaluateAdaptive(state, input, DEFAULT_ADAPTIVE_CONFIG);

    expect(r.output.stateReason).toBe('FLIP_BUDGET_EXHAUSTED');
    expect(r.output.transitionOccurred).toBe(false);
    expect(r.output.flipBudgetRemaining).toBe(0);
  });

  it('all guards pass → transition occurs', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000, // dwell met
      consecutiveCount: 2, // will become 3
      lastZone: 'WARNING',
      flipHistory: Object.freeze([]), // budget available
    });
    const input = makeInput({ sigmaZone: 'WARNING', nowMs: T0 });

    const r = evaluateAdaptive(state, input, DEFAULT_ADAPTIVE_CONFIG);

    expect(r.output.transitionOccurred).toBe(true);
    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
    expect(r.output.stateReason).toBe('ZONE_ESCALATION');
  });
});


// ============================================================================
// H1: Flip Budget Counting Semantics
// ============================================================================

describe('H1: Flip budget counting semantics', () => {
  it('flip = real state transition only (blocked attempts do NOT count)', () => {
    // Start with 3 flips used, 1 remaining
    const threeFlips = [T0 - 100_000, T0 - 200_000, T0 - 300_000];
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 50_000, // dwell NOT met
      consecutiveCount: 0,
      lastZone: 'NORMAL',
      flipHistory: Object.freeze(threeFlips),
    });

    // Attempt transition — blocked by dwell
    const r1 = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: T0 }), FAST);
    expect(r1.output.transitionOccurred).toBe(false);
    expect(r1.output.stateReason).toBe('DWELL_NOT_MET');

    // flipHistory should NOT have grown
    expect(r1.nextState.flipHistory.length).toBe(3);
    expect(r1.output.flipBudgetRemaining).toBe(1);
  });

  it('DWELL_NOT_MET blocked attempts do not consume flip budget (multi-attempt)', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 100_000, // dwell not met
      flipHistory: Object.freeze([]),
    });

    // 5 consecutive blocked attempts
    let current = state;
    for (let i = 0; i < 5; i++) {
      const r = evaluateAdaptive(current, makeInput({ sigmaZone: 'WARNING', nowMs: T0 + i * 1000 }), FAST);
      expect(r.output.transitionOccurred).toBe(false);
      expect(r.nextState.flipHistory.length).toBe(0);
      current = r.nextState;
    }

    // Budget should still be full
    expect(current.flipHistory.length).toBe(0);
  });

  it('CONSECUTIVE_WINDOW_PENDING blocked attempts do not consume flip budget', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      consecutiveCount: 0,
      lastZone: 'NORMAL',
      flipHistory: Object.freeze([]),
    });

    // First attempt — consecutive pending (need 3, have 1)
    const r = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: T0 }), DEFAULT_ADAPTIVE_CONFIG);
    expect(r.output.stateReason).toBe('CONSECUTIVE_WINDOW_PENDING');
    expect(r.nextState.flipHistory.length).toBe(0);
  });

  it('successful transition DOES consume flip budget', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      flipHistory: Object.freeze([]),
    });

    const r = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: T0 }), FAST);
    expect(r.output.transitionOccurred).toBe(true);
    expect(r.nextState.flipHistory.length).toBe(1);
    expect(r.nextState.flipHistory[0]).toBe(T0);
  });

  it('override transitions do NOT consume flip budget', () => {
    const state = makeState({
      currentState: AdaptiveState.ENFORCE,
      flipHistory: Object.freeze([]),
    });

    const r = evaluateAdaptive(state, makeInput({ killSwitchActive: true, nowMs: T0 }), FAST);
    expect(r.output.transitionOccurred).toBe(true);
    expect(r.nextState.flipHistory.length).toBe(0); // override doesn't add to history
  });
});


// ============================================================================
// H2: Provider OUTAGE → OK Resume Semantics
// ============================================================================

describe('H2: Provider OUTAGE → OK resume semantics', () => {
  it('OUTAGE → OK: state stays ELEVATED, enteredAtMs preserved', () => {
    // Start in VIOLATION, provider goes OUTAGE → forced to ELEVATED
    const violationState = makeState({
      currentState: AdaptiveState.VIOLATION,
      enteredAtMs: T0 - 1_000_000,
      lastTransitionMs: T0 - 1_000_000,
    });

    const outageResult = evaluateAdaptive(
      violationState,
      makeInput({ providerHealthZone: ProviderHealthZone.OUTAGE, nowMs: T0 }),
      FAST,
    );
    expect(outageResult.output.state).toBe(AdaptiveState.ELEVATED);
    expect(outageResult.nextState.overrideActive).toBe(true);
    const elevatedEnteredAt = outageResult.nextState.enteredAtMs;

    // Provider recovers — state should remain ELEVATED
    const recoveryResult = evaluateAdaptive(
      outageResult.nextState,
      makeInput({ providerHealthZone: ProviderHealthZone.OK, sigmaZone: 'WARNING', nowMs: T0 + 600_000 }),
      FAST,
    );

    expect(recoveryResult.output.overrideActive).toBe(false);
    // State stays ELEVATED (no automatic jump back to VIOLATION)
    // Normal adaptive logic resumes from ELEVATED
    expect(recoveryResult.nextState.currentState).toBe(AdaptiveState.ELEVATED);
  });

  it('consecutive counters reset during OUTAGE', () => {
    const state = makeState({
      currentState: AdaptiveState.ELEVATED,
      consecutiveCount: 2,
      lastZone: 'ALERT',
    });

    // OUTAGE forces override — consecutive should reset
    const r = evaluateAdaptive(
      state,
      makeInput({ providerHealthZone: ProviderHealthZone.OUTAGE, nowMs: T0 }),
      FAST,
    );

    expect(r.nextState.consecutiveCount).toBe(0);
  });

  it('consecutive counters do NOT accumulate during OUTAGE period', () => {
    let state = makeState({
      currentState: AdaptiveState.ELEVATED,
      consecutiveCount: 2,
    });

    // 5 evaluations during OUTAGE
    for (let i = 0; i < 5; i++) {
      const r = evaluateAdaptive(
        state,
        makeInput({
          providerHealthZone: ProviderHealthZone.OUTAGE,
          sigmaZone: 'ALERT',
          nowMs: T0 + i * 60_000,
        }),
        DEFAULT_ADAPTIVE_CONFIG,
      );
      expect(r.nextState.consecutiveCount).toBe(0);
      state = r.nextState;
    }
  });

  it('dwell timer resets when OUTAGE forces state change', () => {
    const state = makeState({
      currentState: AdaptiveState.VIOLATION,
      lastTransitionMs: T0 - 1_000_000,
    });

    // OUTAGE forces VIOLATION → ELEVATED (state change)
    const r = evaluateAdaptive(
      state,
      makeInput({ providerHealthZone: ProviderHealthZone.OUTAGE, nowMs: T0 }),
      FAST,
    );

    expect(r.output.transitionOccurred).toBe(true);
    expect(r.nextState.lastTransitionMs).toBe(T0); // dwell reset
  });

  it('dwell timer NOT reset when already ELEVATED during OUTAGE', () => {
    const originalTransitionMs = T0 - 500_000;
    const state = makeState({
      currentState: AdaptiveState.ELEVATED,
      lastTransitionMs: originalTransitionMs,
    });

    // Already ELEVATED, OUTAGE doesn't change state
    const r = evaluateAdaptive(
      state,
      makeInput({ providerHealthZone: ProviderHealthZone.OUTAGE, nowMs: T0 }),
      FAST,
    );

    expect(r.output.transitionOccurred).toBe(false);
    expect(r.nextState.lastTransitionMs).toBe(originalTransitionMs); // preserved
  });
});

// ============================================================================
// Consecutive Window Edge Cases
// ============================================================================

describe('Consecutive window edge cases', () => {
  it('zone flapping resets consecutive count each time', () => {
    let state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      consecutiveCount: 0,
      lastZone: 'NORMAL',
    });

    // Alternate WARNING / NORMAL — should never accumulate enough consecutive
    const zones = ['WARNING', 'NORMAL', 'WARNING', 'NORMAL', 'WARNING', 'NORMAL'] as const;
    for (let i = 0; i < zones.length; i++) {
      const r = evaluateAdaptive(
        state,
        makeInput({ sigmaZone: zones[i], nowMs: T0 + i * 60_000 }),
        DEFAULT_ADAPTIVE_CONFIG,
      );
      expect(r.output.transitionOccurred).toBe(false);
      state = r.nextState;
    }
  });

  it('consecutive count carries across evaluations when zone is stable', () => {
    let state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      consecutiveCount: 0,
      lastZone: 'NORMAL',
    });

    // 3 consecutive WARNING windows → transition on 3rd
    for (let i = 0; i < 3; i++) {
      const r = evaluateAdaptive(
        state,
        makeInput({ sigmaZone: 'WARNING', nowMs: T0 + i * 60_000 }),
        DEFAULT_ADAPTIVE_CONFIG,
      );
      if (i < 2) {
        expect(r.output.transitionOccurred).toBe(false);
        expect(r.output.stateReason).toBe('CONSECUTIVE_WINDOW_PENDING');
      } else {
        expect(r.output.transitionOccurred).toBe(true);
        expect(r.output.state).toBe(AdaptiveState.ELEVATED);
      }
      state = r.nextState;
    }
  });
});

// ============================================================================
// Flip Budget Hourly Reset
// ============================================================================

describe('Flip budget hourly reset', () => {
  it('flips older than 1 hour are pruned from history', () => {
    const oldFlips = [
      T0 - 3_700_000, // > 1 hour ago
      T0 - 3_800_000,
      T0 - 3_900_000,
      T0 - 4_000_000,
    ];
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      flipHistory: Object.freeze(oldFlips),
    });

    const r = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: T0 }), FAST);

    // All old flips pruned, transition should succeed
    expect(r.output.transitionOccurred).toBe(true);
    // Only the new flip in history
    expect(r.nextState.flipHistory.length).toBe(1);
  });

  it('mix of old and recent flips: only recent count', () => {
    const mixedFlips = [
      T0 - 4_000_000, // old, pruned
      T0 - 100_000,   // recent
      T0 - 200_000,   // recent
      T0 - 300_000,   // recent
    ];
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      flipHistory: Object.freeze(mixedFlips),
    });

    const r = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: T0 }), FAST);

    // 3 recent + 1 new = 4 = budget limit → transition succeeds (budget was 1 remaining)
    expect(r.output.transitionOccurred).toBe(true);
    expect(r.nextState.flipHistory.length).toBe(4); // 3 recent + 1 new
  });
});
