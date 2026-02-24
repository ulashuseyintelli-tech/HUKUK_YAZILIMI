/**
 * SD-2 Golden Tests — Adaptive Controller
 *
 * 3 golden scenarios that lock the core invariants:
 *   G1: Kill-switch override → KS_FORCED_SHADOW, overrideActive=true
 *   G2: Dwell-time block → DWELL_NOT_MET, no transition
 *   G3: No direct jump → NORMAL cannot jump to ENFORCE
 *
 * Plus: full escalation ladder, provider outage fail-open, flip budget exhaustion.
 *
 * @see .kiro/specs/sd-2-adaptive-control/design.md
 */

import { evaluateAdaptive } from '../adaptive-controller';
import {
  AdaptiveState,
  ProviderHealthZone,
  ValidationErrorCode,
  AdaptiveValidationError,
  createInitialState,
  DEFAULT_ADAPTIVE_CONFIG,
  type ControlInput,
  type AdaptiveInternalState,
  type AdaptiveConfig,
} from '../adaptive-controller.types';

// ============================================================================
// Helpers
// ============================================================================

const T0 = 1_700_000_000_000; // base timestamp

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
    ...createInitialState(T0 - 600_000), // 10 min ago — dwell satisfied
    ...overrides,
  });
}

/** Config with consecutiveWindowsRequired=1 for simpler golden tests */
const FAST_CONFIG: AdaptiveConfig = Object.freeze({
  ...DEFAULT_ADAPTIVE_CONFIG,
  consecutiveWindowsRequired: 1,
});


// ============================================================================
// G1: Kill-Switch Override
// ============================================================================

describe('G1: Kill-switch override', () => {
  it('forces shadow from ENFORCE state with KS_FORCED_SHADOW reason', () => {
    const state = makeState({
      currentState: AdaptiveState.ENFORCE,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({
      killSwitchActive: true,
      sigmaZone: 'ALERT',
      complianceVerdict: false,
      nowMs: T0,
    });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(result.output.state).toBe(AdaptiveState.NORMAL);
    expect(result.output.guardMode).toBe('shadow');
    expect(result.output.outputReason).toBe('KS_FORCED_SHADOW');
    expect(result.output.stateReason).toBe('KILL_SWITCH_OVERRIDE');
    expect(result.output.overrideActive).toBe(true);
    expect(result.output.transitionOccurred).toBe(true);
    expect(result.nextState.overrideActive).toBe(true);
    expect(result.nextState.overrideSource).toBe('KILL_SWITCH');
    expect(result.nextState.currentState).toBe(AdaptiveState.NORMAL);
  });

  it('forces shadow from VIOLATION state', () => {
    const state = makeState({
      currentState: AdaptiveState.VIOLATION,
    });
    const input = makeInput({ killSwitchActive: true, nowMs: T0 });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(result.output.state).toBe(AdaptiveState.NORMAL);
    expect(result.output.guardMode).toBe('shadow');
    expect(result.output.outputReason).toBe('KS_FORCED_SHADOW');
    expect(result.output.overrideActive).toBe(true);
  });

  it('already NORMAL + kill-switch → no transition, still override', () => {
    const state = makeState({ currentState: AdaptiveState.NORMAL });
    const input = makeInput({ killSwitchActive: true, nowMs: T0 });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(result.output.state).toBe(AdaptiveState.NORMAL);
    expect(result.output.transitionOccurred).toBe(false);
    expect(result.output.overrideActive).toBe(true);
    expect(result.output.outputReason).toBe('KS_FORCED_SHADOW');
    // stateReason should be STEADY_STATE since no transition
    expect(result.output.stateReason).toBe('STEADY_STATE');
  });

  it('kill-switch deactivation resumes from NORMAL (not pre-kill state)', () => {
    // Step 1: ENFORCE → kill-switch ON → NORMAL
    const enforceState = makeState({
      currentState: AdaptiveState.ENFORCE,
      lastTransitionMs: T0 - 600_000,
    });
    const ksOn = makeInput({ killSwitchActive: true, nowMs: T0 });
    const afterKs = evaluateAdaptive(enforceState, ksOn, FAST_CONFIG);

    expect(afterKs.nextState.currentState).toBe(AdaptiveState.NORMAL);

    // Step 2: kill-switch OFF → stays NORMAL, not back to ENFORCE
    const ksOff = makeInput({
      killSwitchActive: false,
      sigmaZone: 'NORMAL',
      nowMs: T0 + 600_000,
    });
    const afterResume = evaluateAdaptive(afterKs.nextState, ksOff, FAST_CONFIG);

    expect(afterResume.output.state).toBe(AdaptiveState.NORMAL);
    expect(afterResume.output.overrideActive).toBe(false);
  });
});


// ============================================================================
// G2: Dwell-Time Block
// ============================================================================

describe('G2: Dwell-time block', () => {
  it('blocks transition when dwell time not met', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 100_000, // only 100s ago, dwell=300s
    });
    const input = makeInput({
      sigmaZone: 'WARNING',
      nowMs: T0,
    });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(result.output.transitionOccurred).toBe(false);
    expect(result.output.state).toBe(AdaptiveState.NORMAL);
    expect(result.output.stateReason).toBe('DWELL_NOT_MET');
    expect(result.output.dwellTimeRemainingMs).toBe(200_000); // 300s - 100s
  });

  it('allows transition when dwell time is satisfied', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 400_000, // 400s ago, dwell=300s → satisfied
    });
    const input = makeInput({
      sigmaZone: 'WARNING',
      nowMs: T0,
    });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(result.output.transitionOccurred).toBe(true);
    expect(result.output.state).toBe(AdaptiveState.ELEVATED);
    expect(result.output.stateReason).toBe('ZONE_ESCALATION');
  });

  it('dwell time resets after transition', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 400_000,
    });
    const input = makeInput({ sigmaZone: 'WARNING', nowMs: T0 });

    const step1 = evaluateAdaptive(state, input, FAST_CONFIG);
    expect(step1.output.transitionOccurred).toBe(true);
    expect(step1.nextState.lastTransitionMs).toBe(T0);

    // Immediately try another transition — should be blocked by dwell
    const input2 = makeInput({ sigmaZone: 'ALERT', nowMs: T0 + 1000 });
    const step2 = evaluateAdaptive(step1.nextState, input2, FAST_CONFIG);

    expect(step2.output.transitionOccurred).toBe(false);
    expect(step2.output.stateReason).toBe('DWELL_NOT_MET');
  });
});


// ============================================================================
// G3: No Direct Jump
// ============================================================================

describe('G3: No direct jump', () => {
  it('NORMAL cannot jump directly to ENFORCE', () => {
    // Even with ALERT zone + compliance=false, NORMAL must go through ELEVATED → VIOLATION first
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({
      sigmaZone: 'ALERT',
      complianceVerdict: false,
      nowMs: T0,
    });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    // Should escalate to ELEVATED (adjacent), not ENFORCE
    expect(result.output.state).toBe(AdaptiveState.ELEVATED);
    expect(result.output.stateReason).toBe('ZONE_ESCALATION');
  });

  it('NORMAL cannot jump directly to VIOLATION', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({
      sigmaZone: 'ALERT',
      nowMs: T0,
    });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    // NORMAL → ELEVATED (adjacent), not VIOLATION
    expect(result.output.state).toBe(AdaptiveState.ELEVATED);
  });

  it('ENFORCE cannot jump directly to NORMAL (must go through VIOLATION)', () => {
    const state = makeState({
      currentState: AdaptiveState.ENFORCE,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({
      sigmaZone: 'NORMAL',
      complianceVerdict: true,
      nowMs: T0,
    });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    // ENFORCE → VIOLATION (adjacent), not NORMAL
    expect(result.output.state).toBe(AdaptiveState.VIOLATION);
    expect(result.output.stateReason).toBe('COMPLIANCE_RESTORED');
  });
});

// ============================================================================
// G4: Full Escalation Ladder
// ============================================================================

describe('G4: Full escalation ladder NORMAL → ELEVATED → VIOLATION → ENFORCE', () => {
  it('walks through all 4 states sequentially', () => {
    let state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
    });
    let now = T0;

    // Step 1: NORMAL → ELEVATED (zone=WARNING)
    const s1 = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: now }), FAST_CONFIG);
    expect(s1.output.state).toBe(AdaptiveState.ELEVATED);
    expect(s1.output.guardMode).toBe('shadow');
    state = s1.nextState;
    now += 600_000; // wait for dwell

    // Step 2: ELEVATED → VIOLATION (zone=ALERT)
    const s2 = evaluateAdaptive(state, makeInput({ sigmaZone: 'ALERT', nowMs: now }), FAST_CONFIG);
    expect(s2.output.state).toBe(AdaptiveState.VIOLATION);
    expect(s2.output.guardMode).toBe('shadow');
    state = s2.nextState;
    now += 600_000;

    // Step 3: VIOLATION → ENFORCE (compliance=false + zone=ALERT)
    const s3 = evaluateAdaptive(
      state,
      makeInput({ sigmaZone: 'ALERT', complianceVerdict: false, nowMs: now }),
      FAST_CONFIG,
    );
    expect(s3.output.state).toBe(AdaptiveState.ENFORCE);
    expect(s3.output.guardMode).toBe('enforce');
    expect(s3.output.outputReason).toBe('ENFORCE_ACTIVE');
    expect(s3.output.stateReason).toBe('COMPLIANCE_VIOLATION');
  });
});


// ============================================================================
// G5: Provider Outage — Fail-Open
// ============================================================================

describe('G5: Provider outage fail-open', () => {
  it('forces ELEVATED + shadow when provider is OUTAGE', () => {
    const state = makeState({
      currentState: AdaptiveState.ENFORCE,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({
      providerHealthZone: ProviderHealthZone.OUTAGE,
      sigmaZone: 'ALERT',
      complianceVerdict: false,
      nowMs: T0,
    });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(result.output.state).toBe(AdaptiveState.ELEVATED);
    expect(result.output.guardMode).toBe('shadow');
    expect(result.output.outputReason).toBe('PROVIDER_UNHEALTHY');
    expect(result.output.stateReason).toBe('PROVIDER_FAILURE_OVERRIDE');
    expect(result.output.overrideActive).toBe(true);
    expect(result.nextState.overrideSource).toBe('PROVIDER_OUTAGE');
  });

  it('DEGRADED does NOT override — normal logic continues', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({
      providerHealthZone: ProviderHealthZone.DEGRADED,
      sigmaZone: 'WARNING',
      nowMs: T0,
    });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    // DEGRADED is advisory — normal escalation should proceed
    expect(result.output.overrideActive).toBe(false);
    expect(result.output.state).toBe(AdaptiveState.ELEVATED);
  });

  it('kill-switch takes precedence over provider outage (P0 > P1)', () => {
    const state = makeState({ currentState: AdaptiveState.ENFORCE });
    const input = makeInput({
      killSwitchActive: true,
      providerHealthZone: ProviderHealthZone.OUTAGE,
      nowMs: T0,
    });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    // P0 wins: NORMAL, not ELEVATED
    expect(result.output.state).toBe(AdaptiveState.NORMAL);
    expect(result.output.outputReason).toBe('KS_FORCED_SHADOW');
    expect(result.nextState.overrideSource).toBe('KILL_SWITCH');
  });
});

// ============================================================================
// G6: Flip Budget Exhaustion
// ============================================================================

describe('G6: Flip budget exhaustion', () => {
  it('blocks transition when flip budget is exhausted', () => {
    const recentFlips = [T0 - 100_000, T0 - 200_000, T0 - 300_000, T0 - 400_000];
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      flipHistory: Object.freeze(recentFlips),
    });
    const input = makeInput({ sigmaZone: 'WARNING', nowMs: T0 });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(result.output.transitionOccurred).toBe(false);
    expect(result.output.stateReason).toBe('FLIP_BUDGET_EXHAUSTED');
    expect(result.output.flipBudgetRemaining).toBe(0);
  });

  it('allows transition when old flips expire from the hour window', () => {
    // 4 flips, but all > 1 hour ago → budget restored
    const oldFlips = [T0 - 4_000_000, T0 - 4_100_000, T0 - 4_200_000, T0 - 4_300_000];
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      flipHistory: Object.freeze(oldFlips),
    });
    const input = makeInput({ sigmaZone: 'WARNING', nowMs: T0 });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(result.output.transitionOccurred).toBe(true);
    expect(result.output.state).toBe(AdaptiveState.ELEVATED);
  });
});

// ============================================================================
// G7: Consecutive Window Guard
// ============================================================================

describe('G7: Consecutive window guard', () => {
  it('requires N consecutive windows before transition (default N=3)', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      consecutiveCount: 0,
      lastZone: 'NORMAL',
    });

    // Window 1: WARNING → pending
    const s1 = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: T0 }), DEFAULT_ADAPTIVE_CONFIG);
    expect(s1.output.transitionOccurred).toBe(false);
    expect(s1.output.stateReason).toBe('CONSECUTIVE_WINDOW_PENDING');

    // Window 2: WARNING → still pending
    const s2 = evaluateAdaptive(s1.nextState, makeInput({ sigmaZone: 'WARNING', nowMs: T0 + 60_000 }), DEFAULT_ADAPTIVE_CONFIG);
    expect(s2.output.transitionOccurred).toBe(false);
    expect(s2.output.stateReason).toBe('CONSECUTIVE_WINDOW_PENDING');

    // Window 3: WARNING → transition!
    const s3 = evaluateAdaptive(s2.nextState, makeInput({ sigmaZone: 'WARNING', nowMs: T0 + 120_000 }), DEFAULT_ADAPTIVE_CONFIG);
    expect(s3.output.transitionOccurred).toBe(true);
    expect(s3.output.state).toBe(AdaptiveState.ELEVATED);
  });

  it('resets consecutive count when zone changes mid-escalation', () => {
    // Start with 2 consecutive WARNING windows from NORMAL
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      consecutiveCount: 2,
      lastZone: 'WARNING',
    });

    // Window 3: still WARNING → should transition (3 consecutive met)
    const s1 = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: T0 }), DEFAULT_ADAPTIVE_CONFIG);
    expect(s1.output.transitionOccurred).toBe(true);
    expect(s1.output.state).toBe(AdaptiveState.ELEVATED);

    // Now from ELEVATED, start counting ALERT windows
    // Window 1: ALERT
    const s2 = evaluateAdaptive(s1.nextState, makeInput({ sigmaZone: 'ALERT', nowMs: T0 + 600_000 }), DEFAULT_ADAPTIVE_CONFIG);
    expect(s2.output.stateReason).toBe('CONSECUTIVE_WINDOW_PENDING');

    // Window 2: zone drops to WARNING → resets consecutive for ALERT
    const s3 = evaluateAdaptive(s2.nextState, makeInput({ sigmaZone: 'WARNING', nowMs: T0 + 660_000 }), DEFAULT_ADAPTIVE_CONFIG);
    // Zone changed, so consecutive resets to 1
    expect(s3.nextState.consecutiveCount).toBe(1);

    // Window 3: back to ALERT → starts from 1 again, not 2
    const s4 = evaluateAdaptive(s3.nextState, makeInput({ sigmaZone: 'ALERT', nowMs: T0 + 720_000 }), DEFAULT_ADAPTIVE_CONFIG);
    expect(s4.output.stateReason).toBe('CONSECUTIVE_WINDOW_PENDING');
    expect(s4.nextState.consecutiveCount).toBe(1);
  });
});

// ============================================================================
// G8: Telemetry Events (L4)
// ============================================================================

describe('G8: Telemetry event emission', () => {
  it('emits STATE_GAUGE events for all 4 states', () => {
    const state = makeState({ currentState: AdaptiveState.NORMAL });
    const input = makeInput({ nowMs: T0 });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    const gauges = result.events.filter((e) => e.type === 'STATE_GAUGE');
    expect(gauges).toHaveLength(4);
    expect(gauges.find((g) => g.labels.state === 'NORMAL')?.value).toBe(1);
    expect(gauges.find((g) => g.labels.state === 'ENFORCE')?.value).toBe(0);
  });

  it('emits TRANSITION_COUNT on state change', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({ sigmaZone: 'WARNING', nowMs: T0 });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    const transitions = result.events.filter((e) => e.type === 'TRANSITION_COUNT');
    expect(transitions).toHaveLength(1);
    expect(transitions[0].labels.from).toBe('NORMAL');
    expect(transitions[0].labels.to).toBe('ELEVATED');
  });

  it('emits FLIP_BUDGET_GAUGE on every evaluation', () => {
    const state = makeState({ currentState: AdaptiveState.NORMAL });
    const input = makeInput({ nowMs: T0 });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    const budgetEvents = result.events.filter((e) => e.type === 'FLIP_BUDGET_GAUGE');
    expect(budgetEvents).toHaveLength(1);
    expect(budgetEvents[0].value).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// G9: Determinism
// ============================================================================

describe('G9: Determinism', () => {
  it('same (state, input, config) → same output', () => {
    const state = makeState({
      currentState: AdaptiveState.ELEVATED,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({ sigmaZone: 'ALERT', nowMs: T0 });

    const r1 = evaluateAdaptive(state, input, FAST_CONFIG);
    const r2 = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(r1.output).toEqual(r2.output);
    expect(r1.nextState).toEqual(r2.nextState);
    expect(r1.events).toEqual(r2.events);
  });
});

// ============================================================================
// G10: Output Immutability
// ============================================================================

describe('G10: Output immutability', () => {
  it('output is frozen', () => {
    const state = makeState({ currentState: AdaptiveState.NORMAL });
    const input = makeInput({ nowMs: T0 });

    const result = evaluateAdaptive(state, input, FAST_CONFIG);

    expect(Object.isFrozen(result.output)).toBe(true);
    expect(Object.isFrozen(result.nextState)).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
  });
});

// ============================================================================
// G11: Input Validation
// ============================================================================

describe('G11: Input validation', () => {
  it('rejects missing sigmaZone with MISSING_SIGMA_ZONE code', () => {
    const state = makeState({});
    const input = { ...makeInput(), sigmaZone: undefined } as any;
    try {
      evaluateAdaptive(state, input, FAST_CONFIG);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AdaptiveValidationError);
      expect((e as AdaptiveValidationError).code).toBe(ValidationErrorCode.MISSING_SIGMA_ZONE);
    }
  });

  it('rejects invalid sigmaZone with INVALID_SIGMA_ZONE code', () => {
    const state = makeState({});
    const input = { ...makeInput(), sigmaZone: 'INVALID' } as any;
    try {
      evaluateAdaptive(state, input, FAST_CONFIG);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AdaptiveValidationError);
      expect((e as AdaptiveValidationError).code).toBe(ValidationErrorCode.INVALID_SIGMA_ZONE);
    }
  });

  it('rejects non-finite nowMs with INVALID_NOW_MS code', () => {
    const state = makeState({});
    const input = { ...makeInput(), nowMs: NaN };
    try {
      evaluateAdaptive(state, input, FAST_CONFIG);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AdaptiveValidationError);
      expect((e as AdaptiveValidationError).code).toBe(ValidationErrorCode.INVALID_NOW_MS);
    }
  });

  it('rejects invalid providerHealthZone with INVALID_PROVIDER_HEALTH_ZONE code', () => {
    const state = makeState({});
    const input = { ...makeInput(), providerHealthZone: 'UNKNOWN' } as any;
    try {
      evaluateAdaptive(state, input, FAST_CONFIG);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AdaptiveValidationError);
      expect((e as AdaptiveValidationError).code).toBe(ValidationErrorCode.INVALID_PROVIDER_HEALTH_ZONE);
    }
  });
});
