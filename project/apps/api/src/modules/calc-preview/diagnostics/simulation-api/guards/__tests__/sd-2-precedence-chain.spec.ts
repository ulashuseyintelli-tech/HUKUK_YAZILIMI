/**
 * SD-2 Precedence Chain — Override Priority Tests
 *
 * T2.3: Override precedence
 *   - P0 kill-switch > P1 provider outage > P2 compliance > P3 normal
 *   - Kill-switch ON: any input → shadow + KS_FORCED_SHADOW
 *   - Provider OUTAGE + compliance violation → shadow + PROVIDER_UNHEALTHY
 *   - Kill-switch OFF → resume from NORMAL (H3)
 *   - Provider OK → resume from ELEVATED
 *
 * @see .kiro/specs/sd-2-adaptive-control/design.md — Precedence Chain
 */

import { evaluateAdaptive } from '../adaptive-controller';
import {
  AdaptiveState,
  ProviderHealthZone,
  ADAPTIVE_STATES,
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
// P0: Kill-switch — highest precedence
// ============================================================================

describe('P0: Kill-switch overrides everything', () => {
  it.each(ADAPTIVE_STATES.map((s) => [s]))('from %s → NORMAL + shadow', (fromState) => {
    const state = makeState({
      currentState: fromState as AdaptiveState,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({
      killSwitchActive: true,
      sigmaZone: 'SPIKE',
      complianceVerdict: false,
      providerHealthZone: ProviderHealthZone.OUTAGE,
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.guardMode).toBe('shadow');
    expect(r.output.outputReason).toBe('KS_FORCED_SHADOW');
    expect(r.output.overrideActive).toBe(true);
    expect(r.nextState.overrideSource).toBe('KILL_SWITCH');
    if (fromState !== AdaptiveState.NORMAL) {
      expect(r.output.state).toBe(AdaptiveState.NORMAL);
      expect(r.output.transitionOccurred).toBe(true);
    } else {
      expect(r.output.state).toBe(AdaptiveState.NORMAL);
      expect(r.output.transitionOccurred).toBe(false);
    }
  });

  it('P0 > P1: kill-switch wins over provider OUTAGE', () => {
    const state = makeState({ currentState: AdaptiveState.ENFORCE });
    const input = makeInput({
      killSwitchActive: true,
      providerHealthZone: ProviderHealthZone.OUTAGE,
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    // Kill-switch → NORMAL, not ELEVATED (which provider would force)
    expect(r.output.state).toBe(AdaptiveState.NORMAL);
    expect(r.output.outputReason).toBe('KS_FORCED_SHADOW');
    expect(r.nextState.overrideSource).toBe('KILL_SWITCH');
  });

  it('P0 > P2: kill-switch wins over compliance violation', () => {
    const state = makeState({ currentState: AdaptiveState.VIOLATION });
    const input = makeInput({
      killSwitchActive: true,
      sigmaZone: 'ALERT',
      complianceVerdict: false,
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.NORMAL);
    expect(r.output.outputReason).toBe('KS_FORCED_SHADOW');
  });
});

// ============================================================================
// P1: Provider OUTAGE — second highest
// ============================================================================

describe('P1: Provider OUTAGE overrides P2/P3', () => {
  it('OUTAGE + compliance violation → shadow + PROVIDER_UNHEALTHY (not COMPLIANCE_VIOLATION)', () => {
    const state = makeState({
      currentState: AdaptiveState.VIOLATION,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({
      providerHealthZone: ProviderHealthZone.OUTAGE,
      sigmaZone: 'ALERT',
      complianceVerdict: false,
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.guardMode).toBe('shadow');
    expect(r.output.outputReason).toBe('PROVIDER_UNHEALTHY');
    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
    expect(r.nextState.overrideSource).toBe('PROVIDER_OUTAGE');
  });

  it('OUTAGE from ENFORCE → forces ELEVATED (fail-open)', () => {
    const state = makeState({ currentState: AdaptiveState.ENFORCE });
    const input = makeInput({
      providerHealthZone: ProviderHealthZone.OUTAGE,
      sigmaZone: 'ALERT',
      complianceVerdict: false,
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
    expect(r.output.guardMode).toBe('shadow');
    expect(r.output.transitionOccurred).toBe(true);
  });

  it('DEGRADED does NOT trigger P1 override — normal logic runs', () => {
    const state = makeState({
      currentState: AdaptiveState.ELEVATED,
      lastTransitionMs: T0 - 600_000,
    });
    const input = makeInput({
      providerHealthZone: ProviderHealthZone.DEGRADED,
      sigmaZone: 'ALERT',
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    // Normal escalation should proceed
    expect(r.output.overrideActive).toBe(false);
    expect(r.output.state).toBe(AdaptiveState.VIOLATION);
    expect(r.output.stateReason).toBe('ZONE_ESCALATION');
  });
});


// ============================================================================
// H3: Kill-switch OFF → Resume from NORMAL
// ============================================================================

describe('H3: Kill-switch OFF resume behavior', () => {
  it('kill ON 10min → kill OFF → resumes from NORMAL, not pre-kill state', () => {
    // Start in ENFORCE
    const enforceState = makeState({
      currentState: AdaptiveState.ENFORCE,
      lastTransitionMs: T0 - 600_000,
    });

    // Kill-switch ON → NORMAL
    const ksOn = evaluateAdaptive(enforceState, makeInput({ killSwitchActive: true, nowMs: T0 }), FAST);
    expect(ksOn.output.state).toBe(AdaptiveState.NORMAL);

    // 10 minutes of kill-switch ON
    let state = ksOn.nextState;
    for (let i = 1; i <= 10; i++) {
      const r = evaluateAdaptive(
        state,
        makeInput({ killSwitchActive: true, sigmaZone: 'ALERT', complianceVerdict: false, nowMs: T0 + i * 60_000 }),
        FAST,
      );
      expect(r.output.state).toBe(AdaptiveState.NORMAL);
      expect(r.output.overrideActive).toBe(true);
      state = r.nextState;
    }

    // Kill-switch OFF — should be in NORMAL, not ENFORCE
    const ksOff = evaluateAdaptive(
      state,
      makeInput({ killSwitchActive: false, sigmaZone: 'ALERT', nowMs: T0 + 11 * 60_000 }),
      FAST,
    );

    expect(ksOff.output.overrideActive).toBe(false);
    // Pre-kill state (ENFORCE) is NOT restored
    // Normal progression from NORMAL: ALERT → ELEVATED
    expect(ksOff.output.state).toBe(AdaptiveState.ELEVATED);
    expect(ksOff.output.stateReason).toBe('ZONE_ESCALATION');
  });

  it('kill OFF: drift signal input triggers normal candidate compute', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
      overrideActive: false,
      overrideSource: null,
    });

    // Normal input with WARNING zone → should escalate
    const r = evaluateAdaptive(state, makeInput({ sigmaZone: 'WARNING', nowMs: T0 }), FAST);

    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
    expect(r.output.overrideActive).toBe(false);
  });
});

// ============================================================================
// Provider Recovery
// ============================================================================

describe('Provider recovery: OUTAGE → OK', () => {
  it('resumes from ELEVATED with normal adaptive logic', () => {
    // ENFORCE → OUTAGE → ELEVATED
    const enforceState = makeState({
      currentState: AdaptiveState.ENFORCE,
      lastTransitionMs: T0 - 600_000,
    });
    const outage = evaluateAdaptive(
      enforceState,
      makeInput({ providerHealthZone: ProviderHealthZone.OUTAGE, nowMs: T0 }),
      FAST,
    );
    expect(outage.output.state).toBe(AdaptiveState.ELEVATED);

    // Provider recovers — normal logic from ELEVATED
    const recovery = evaluateAdaptive(
      outage.nextState,
      makeInput({ providerHealthZone: ProviderHealthZone.OK, sigmaZone: 'ALERT', nowMs: T0 + 600_000 }),
      FAST,
    );

    expect(recovery.output.overrideActive).toBe(false);
    // ELEVATED + ALERT → VIOLATION (normal escalation)
    expect(recovery.output.state).toBe(AdaptiveState.VIOLATION);
    expect(recovery.output.stateReason).toBe('ZONE_ESCALATION');
  });

  it('does NOT jump back to pre-outage state', () => {
    // Start in VIOLATION
    const violationState = makeState({
      currentState: AdaptiveState.VIOLATION,
      lastTransitionMs: T0 - 600_000,
    });

    // OUTAGE → ELEVATED
    const outage = evaluateAdaptive(
      violationState,
      makeInput({ providerHealthZone: ProviderHealthZone.OUTAGE, nowMs: T0 }),
      FAST,
    );
    expect(outage.output.state).toBe(AdaptiveState.ELEVATED);

    // Recovery with NORMAL zone → should de-escalate to NORMAL, not jump to VIOLATION
    const recovery = evaluateAdaptive(
      outage.nextState,
      makeInput({ providerHealthZone: ProviderHealthZone.OK, sigmaZone: 'NORMAL', nowMs: T0 + 600_000 }),
      FAST,
    );

    expect(recovery.output.state).toBe(AdaptiveState.NORMAL);
    expect(recovery.output.stateReason).toBe('ZONE_DEESCALATION');
  });
});

// ============================================================================
// Precedence Ordering Proof
// ============================================================================

describe('Precedence ordering proof', () => {
  it('P0 > P1 > P2 > P3: all active simultaneously', () => {
    const state = makeState({ currentState: AdaptiveState.VIOLATION });

    // All conditions active: kill-switch + OUTAGE + compliance violation + ALERT zone
    const input = makeInput({
      killSwitchActive: true,
      providerHealthZone: ProviderHealthZone.OUTAGE,
      sigmaZone: 'ALERT',
      complianceVerdict: false,
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    // P0 wins
    expect(r.output.state).toBe(AdaptiveState.NORMAL);
    expect(r.output.outputReason).toBe('KS_FORCED_SHADOW');
    expect(r.nextState.overrideSource).toBe('KILL_SWITCH');
  });

  it('P1 > P2 > P3: kill-switch OFF, rest active', () => {
    const state = makeState({ currentState: AdaptiveState.VIOLATION });

    const input = makeInput({
      killSwitchActive: false,
      providerHealthZone: ProviderHealthZone.OUTAGE,
      sigmaZone: 'ALERT',
      complianceVerdict: false,
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    // P1 wins
    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
    expect(r.output.outputReason).toBe('PROVIDER_UNHEALTHY');
    expect(r.nextState.overrideSource).toBe('PROVIDER_OUTAGE');
  });

  it('P2 > P3: no overrides, compliance violation active', () => {
    const state = makeState({
      currentState: AdaptiveState.VIOLATION,
      lastTransitionMs: T0 - 600_000,
    });

    const input = makeInput({
      killSwitchActive: false,
      providerHealthZone: ProviderHealthZone.OK,
      sigmaZone: 'ALERT',
      complianceVerdict: false,
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    // P2: compliance violation → ENFORCE
    expect(r.output.state).toBe(AdaptiveState.ENFORCE);
    expect(r.output.stateReason).toBe('COMPLIANCE_VIOLATION');
    expect(r.output.overrideActive).toBe(false);
  });

  it('P3: no overrides, no compliance issue, zone-based transition', () => {
    const state = makeState({
      currentState: AdaptiveState.NORMAL,
      lastTransitionMs: T0 - 600_000,
    });

    const input = makeInput({
      killSwitchActive: false,
      providerHealthZone: ProviderHealthZone.OK,
      sigmaZone: 'WARNING',
      complianceVerdict: true,
      nowMs: T0,
    });

    const r = evaluateAdaptive(state, input, FAST);

    // P3: normal zone escalation
    expect(r.output.state).toBe(AdaptiveState.ELEVATED);
    expect(r.output.stateReason).toBe('ZONE_ESCALATION');
    expect(r.output.overrideActive).toBe(false);
  });
});
