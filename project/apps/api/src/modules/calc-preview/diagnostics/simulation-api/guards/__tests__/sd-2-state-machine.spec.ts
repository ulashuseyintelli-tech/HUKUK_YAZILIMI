/**
 * SD-2 State Machine — Transition Matrix Tests
 *
 * T2.1: Golden transition matrix
 *   - All 8 valid transitions (forward + backward)
 *   - Forbidden direct jumps
 *   - State → guardMode mapping
 *   - Determinism
 *
 * @see .kiro/specs/sd-2-adaptive-control/design.md — Transition Matrix
 */

import { evaluateAdaptive } from '../adaptive-controller';
import {
  AdaptiveState,
  ProviderHealthZone,
  ADAPTIVE_STATES,
  STATE_SEVERITY,
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

/** consecutiveWindowsRequired=1 for direct transition testing */
const FAST: AdaptiveConfig = Object.freeze({
  ...DEFAULT_ADAPTIVE_CONFIG,
  consecutiveWindowsRequired: 1,
});


// ============================================================================
// Forward Transitions (escalation path)
// ============================================================================

describe('Forward transitions (escalation)', () => {
  it('NORMAL → ELEVATED: zone ≥ WARNING', () => {
    const state = makeState({ currentState: AdaptiveState.NORMAL });
    const input = makeInput({ sigmaZone: 'WARNING', nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
    expect(r.output.previousState).toBe(AdaptiveState.NORMAL);
    expect(r.output.stateReason).toBe('ZONE_ESCALATION');
    expect(r.output.transitionOccurred).toBe(true);
    expect(r.output.guardMode).toBe('shadow');
  });

  it('NORMAL → ELEVATED: zone = ALERT also triggers (≥ WARNING)', () => {
    const state = makeState({ currentState: AdaptiveState.NORMAL });
    const input = makeInput({ sigmaZone: 'ALERT', nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
    expect(r.output.stateReason).toBe('ZONE_ESCALATION');
  });

  it('NORMAL → ELEVATED: zone = SPIKE also triggers (≥ WARNING)', () => {
    const state = makeState({ currentState: AdaptiveState.NORMAL });
    const input = makeInput({ sigmaZone: 'SPIKE', nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
  });

  it('ELEVATED → VIOLATION: zone ≥ ALERT', () => {
    const state = makeState({ currentState: AdaptiveState.ELEVATED });
    const input = makeInput({ sigmaZone: 'ALERT', nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.VIOLATION);
    expect(r.output.previousState).toBe(AdaptiveState.ELEVATED);
    expect(r.output.stateReason).toBe('ZONE_ESCALATION');
    expect(r.output.guardMode).toBe('shadow');
  });

  it('ELEVATED → VIOLATION: zone = SPIKE also triggers', () => {
    const state = makeState({ currentState: AdaptiveState.ELEVATED });
    const input = makeInput({ sigmaZone: 'SPIKE', nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.VIOLATION);
  });

  it('VIOLATION → ENFORCE: compliance=false + zone ≥ ALERT', () => {
    const state = makeState({ currentState: AdaptiveState.VIOLATION });
    const input = makeInput({ sigmaZone: 'ALERT', complianceVerdict: false, nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.ENFORCE);
    expect(r.output.previousState).toBe(AdaptiveState.VIOLATION);
    expect(r.output.stateReason).toBe('COMPLIANCE_VIOLATION');
    expect(r.output.guardMode).toBe('enforce');
    expect(r.output.outputReason).toBe('ENFORCE_ACTIVE');
  });

  it('VIOLATION does NOT escalate to ENFORCE when compliance=true', () => {
    const state = makeState({ currentState: AdaptiveState.VIOLATION });
    const input = makeInput({ sigmaZone: 'ALERT', complianceVerdict: true, nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    // compliance=true → no escalation, stays VIOLATION
    expect(r.output.state).toBe(AdaptiveState.VIOLATION);
    expect(r.output.transitionOccurred).toBe(false);
  });
});


// ============================================================================
// Backward Transitions (de-escalation path)
// ============================================================================

describe('Backward transitions (de-escalation)', () => {
  it('ENFORCE → VIOLATION: compliance restored', () => {
    const state = makeState({ currentState: AdaptiveState.ENFORCE });
    const input = makeInput({ sigmaZone: 'ALERT', complianceVerdict: true, nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.VIOLATION);
    expect(r.output.stateReason).toBe('COMPLIANCE_RESTORED');
    expect(r.output.guardMode).toBe('shadow');
  });

  it('ENFORCE → VIOLATION: zone drops below ALERT', () => {
    const state = makeState({ currentState: AdaptiveState.ENFORCE });
    const input = makeInput({ sigmaZone: 'WARNING', complianceVerdict: false, nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.VIOLATION);
    expect(r.output.stateReason).toBe('ZONE_DEESCALATION');
  });

  it('VIOLATION → ELEVATED: zone drops below ALERT', () => {
    const state = makeState({ currentState: AdaptiveState.VIOLATION });
    const input = makeInput({ sigmaZone: 'WARNING', complianceVerdict: true, nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
    expect(r.output.stateReason).toBe('ZONE_DEESCALATION');
    expect(r.output.guardMode).toBe('shadow');
  });

  it('ELEVATED → NORMAL: zone = NORMAL', () => {
    const state = makeState({ currentState: AdaptiveState.ELEVATED });
    const input = makeInput({ sigmaZone: 'NORMAL', nowMs: T0 });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.NORMAL);
    expect(r.output.stateReason).toBe('ZONE_DEESCALATION');
    expect(r.output.guardMode).toBe('shadow');
  });

  it('full de-escalation ladder: ENFORCE → VIOLATION → ELEVATED → NORMAL', () => {
    let state = makeState({ currentState: AdaptiveState.ENFORCE });
    let now = T0;

    // ENFORCE → VIOLATION
    const s1 = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', complianceVerdict: true, nowMs: now }), FAST);
    expect(s1.output.state).toBe(AdaptiveState.VIOLATION);
    state = s1.nextState;
    now += 600_000;

    // VIOLATION → ELEVATED
    const s2 = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: now }), FAST);
    expect(s2.output.state).toBe(AdaptiveState.ELEVATED);
    state = s2.nextState;
    now += 600_000;

    // ELEVATED → NORMAL
    const s3 = evaluateAdaptive(state, makeInput({ sigmaZone: 'NORMAL', nowMs: now }), FAST);
    expect(s3.output.state).toBe(AdaptiveState.NORMAL);
  });
});

// ============================================================================
// Forbidden Direct Jumps
// ============================================================================

describe('Forbidden direct jumps', () => {
  const forbiddenPairs: Array<[AdaptiveState, string, Partial<ControlInput>]> = [
    // NORMAL can only go to ELEVATED (severity 0 → 1)
    [AdaptiveState.NORMAL, 'VIOLATION', { sigmaZone: 'ALERT', complianceVerdict: false }],
    [AdaptiveState.NORMAL, 'ENFORCE', { sigmaZone: 'SPIKE', complianceVerdict: false }],
    // ELEVATED can go to VIOLATION or NORMAL, but not ENFORCE
    [AdaptiveState.ELEVATED, 'ENFORCE', { sigmaZone: 'SPIKE', complianceVerdict: false }],
    // ENFORCE can only go to VIOLATION (severity 3 → 2)
    [AdaptiveState.ENFORCE, 'NORMAL', { sigmaZone: 'NORMAL', complianceVerdict: true }],
    [AdaptiveState.ENFORCE, 'ELEVATED', { sigmaZone: 'WARNING', complianceVerdict: true }],
  ];

  it.each(forbiddenPairs)(
    '%s cannot jump directly to %s',
    (fromState, _toLabel, inputOverrides) => {
      const state = makeState({ currentState: fromState });
      const input = makeInput({ ...inputOverrides, nowMs: T0 });
      const r = evaluateAdaptive(state, input, FAST);

      // The state should either stay or move to an adjacent state, never the forbidden target
      const severityDiff = Math.abs(
        STATE_SEVERITY[r.output.state] - STATE_SEVERITY[fromState],
      );
      expect(severityDiff).toBeLessThanOrEqual(1);
    },
  );
});

// ============================================================================
// State → GuardMode Mapping
// ============================================================================

describe('State → guardMode mapping', () => {
  const stateToMode: Array<[AdaptiveState, string]> = [
    [AdaptiveState.NORMAL, 'shadow'],
    [AdaptiveState.ELEVATED, 'shadow'],
    [AdaptiveState.VIOLATION, 'shadow'],
    [AdaptiveState.ENFORCE, 'enforce'],
  ];

  it.each(stateToMode)('%s → guardMode=%s', (adState, expectedMode) => {
    // Create a state that stays steady (no transition triggers)
    const state = makeState({
      currentState: adState,
      lastTransitionMs: T0 - 600_000,
    });
    // Input that doesn't trigger any transition from this state
    const input = makeInput({
      sigmaZone: adState === AdaptiveState.ENFORCE ? 'ALERT' : 'NORMAL',
      complianceVerdict: adState === AdaptiveState.ENFORCE ? false : true,
      nowMs: T0,
    });
    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.guardMode).toBe(expectedMode);
  });
});

// ============================================================================
// Determinism (extended)
// ============================================================================

describe('Determinism — extended matrix', () => {
  const scenarios: Array<{ name: string; state: Partial<AdaptiveInternalState>; input: Partial<ControlInput> }> = [
    { name: 'NORMAL+WARNING', state: { currentState: AdaptiveState.NORMAL }, input: { sigmaZone: 'WARNING' } },
    { name: 'ELEVATED+ALERT', state: { currentState: AdaptiveState.ELEVATED }, input: { sigmaZone: 'ALERT' } },
    { name: 'VIOLATION+compliance=false', state: { currentState: AdaptiveState.VIOLATION }, input: { sigmaZone: 'ALERT', complianceVerdict: false } },
    { name: 'ENFORCE+compliance=true', state: { currentState: AdaptiveState.ENFORCE }, input: { sigmaZone: 'WARNING', complianceVerdict: true } },
    { name: 'kill-switch from ENFORCE', state: { currentState: AdaptiveState.ENFORCE }, input: { killSwitchActive: true } },
  ];

  it.each(scenarios)('$name: same input → same output (10 runs)', ({ state: stateOverrides, input: inputOverrides }) => {
    const state = makeState(stateOverrides);
    const input = makeInput({ ...inputOverrides, nowMs: T0 });

    const baseline = evaluateAdaptive(state, input, FAST);
    for (let i = 0; i < 10; i++) {
      const r = evaluateAdaptive(state, input, FAST);
      expect(r.output).toEqual(baseline.output);
      expect(r.nextState).toEqual(baseline.nextState);
    }
  });
});
