/**
 * SD-2 Control Contract — I/O Contract + Telemetry Bounded Tests
 *
 * T2.4: Control I/O contract
 *   - Input validation (all ValidationErrorCode values)
 *   - Output immutability (Object.freeze)
 *   - Reason code closed-set (no unknown codes)
 *   - Telemetry event label cardinality bounded (H4)
 *
 * @see .kiro/specs/sd-2-adaptive-control/design.md — Control I/O
 */

import { evaluateAdaptive } from '../adaptive-controller';
import {
  AdaptiveState,
  ProviderHealthZone,
  ADAPTIVE_STATES,
  ValidationErrorCode,
  AdaptiveValidationError,
  ALL_STATE_REASONS,
  ALL_OUTPUT_REASONS,
  createInitialState,
  DEFAULT_ADAPTIVE_CONFIG,
  type ControlInput,
  type AdaptiveInternalState,
  type AdaptiveConfig,
  type OutputReason,
  type StateReason,
  type TelemetryEventType,
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
// Input Validation — all ValidationErrorCode values
// ============================================================================

describe('Input validation — closed-set error codes', () => {
  const validationCases: Array<{
    name: string;
    input: Record<string, unknown>;
    expectedCode: ValidationErrorCode;
  }> = [
    {
      name: 'missing sigmaZone',
      input: { sigmaZone: undefined },
      expectedCode: ValidationErrorCode.MISSING_SIGMA_ZONE,
    },
    {
      name: 'missing sigmaZone (null)',
      input: { sigmaZone: null },
      expectedCode: ValidationErrorCode.MISSING_SIGMA_ZONE,
    },
    {
      name: 'invalid sigmaZone',
      input: { sigmaZone: 'INVALID_ZONE' },
      expectedCode: ValidationErrorCode.INVALID_SIGMA_ZONE,
    },
    {
      name: 'missing complianceVerdict',
      input: { complianceVerdict: 'yes' },
      expectedCode: ValidationErrorCode.MISSING_COMPLIANCE_VERDICT,
    },
    {
      name: 'missing providerHealthZone',
      input: { providerHealthZone: undefined },
      expectedCode: ValidationErrorCode.MISSING_PROVIDER_HEALTH_ZONE,
    },
    {
      name: 'invalid providerHealthZone',
      input: { providerHealthZone: 'UNKNOWN' },
      expectedCode: ValidationErrorCode.INVALID_PROVIDER_HEALTH_ZONE,
    },
    {
      name: 'missing killSwitchActive',
      input: { killSwitchActive: 1 },
      expectedCode: ValidationErrorCode.MISSING_KILL_SWITCH,
    },
    {
      name: 'nowMs = NaN',
      input: { nowMs: NaN },
      expectedCode: ValidationErrorCode.INVALID_NOW_MS,
    },
    {
      name: 'nowMs = Infinity',
      input: { nowMs: Infinity },
      expectedCode: ValidationErrorCode.INVALID_NOW_MS,
    },
    {
      name: 'nowMs = string',
      input: { nowMs: '12345' },
      expectedCode: ValidationErrorCode.INVALID_NOW_MS,
    },
  ];

  it.each(validationCases)('$name → $expectedCode', ({ input: overrides, expectedCode }) => {
    const state = makeState({});
    const input = { ...makeInput(), ...overrides } as any;

    try {
      evaluateAdaptive(state, input, FAST);
      fail('should have thrown AdaptiveValidationError');
    } catch (e) {
      expect(e).toBeInstanceOf(AdaptiveValidationError);
      expect((e as AdaptiveValidationError).code).toBe(expectedCode);
    }
  });

  it('all ValidationErrorCode values are tested', () => {
    const testedCodes = new Set(validationCases.map((c) => c.expectedCode));
    const allCodes = Object.values(ValidationErrorCode);
    for (const code of allCodes) {
      expect(testedCodes.has(code)).toBe(true);
    }
  });
});

// ============================================================================
// Output Immutability
// ============================================================================

describe('Output immutability', () => {
  it('output is frozen', () => {
    const r = evaluateAdaptive(makeState({}), makeInput(), FAST);
    expect(Object.isFrozen(r.output)).toBe(true);
  });

  it('nextState is frozen', () => {
    const r = evaluateAdaptive(makeState({}), makeInput(), FAST);
    expect(Object.isFrozen(r.nextState)).toBe(true);
  });

  it('events array is frozen', () => {
    const r = evaluateAdaptive(makeState({}), makeInput(), FAST);
    expect(Object.isFrozen(r.events)).toBe(true);
  });

  it('flipHistory in nextState is frozen', () => {
    const r = evaluateAdaptive(makeState({}), makeInput(), FAST);
    expect(Object.isFrozen(r.nextState.flipHistory)).toBe(true);
  });
});


// ============================================================================
// Reason Code Closed-Set
// ============================================================================

describe('Reason code closed-set', () => {
  const stateReasonSet = new Set<string>(ALL_STATE_REASONS);
  const outputReasonSet = new Set<string>(ALL_OUTPUT_REASONS);

  /** Run a scenario and collect output/state reasons */
  function collectReasons(
    stateOverrides: Partial<AdaptiveInternalState>,
    inputOverrides: Partial<ControlInput>,
    config: AdaptiveConfig = FAST,
  ): { outputReason: string; stateReason: string } {
    const state = makeState(stateOverrides);
    const input = makeInput({ ...inputOverrides, nowMs: T0 });
    const r = evaluateAdaptive(state, input, config);
    return { outputReason: r.output.outputReason, stateReason: r.output.stateReason };
  }

  const scenarios: Array<{ name: string; state: Partial<AdaptiveInternalState>; input: Partial<ControlInput>; config?: AdaptiveConfig }> = [
    { name: 'steady NORMAL', state: { currentState: AdaptiveState.NORMAL }, input: { sigmaZone: 'NORMAL' } },
    { name: 'escalation', state: { currentState: AdaptiveState.NORMAL }, input: { sigmaZone: 'WARNING' } },
    { name: 'de-escalation', state: { currentState: AdaptiveState.ELEVATED }, input: { sigmaZone: 'NORMAL' } },
    { name: 'compliance violation', state: { currentState: AdaptiveState.VIOLATION }, input: { sigmaZone: 'ALERT', complianceVerdict: false } },
    { name: 'compliance restored', state: { currentState: AdaptiveState.ENFORCE }, input: { complianceVerdict: true } },
    { name: 'kill-switch', state: { currentState: AdaptiveState.ENFORCE }, input: { killSwitchActive: true } },
    { name: 'provider outage', state: { currentState: AdaptiveState.ENFORCE }, input: { providerHealthZone: ProviderHealthZone.OUTAGE } },
    { name: 'dwell not met', state: { currentState: AdaptiveState.NORMAL, lastTransitionMs: T0 - 100_000 }, input: { sigmaZone: 'WARNING' } },
    { name: 'flip budget exhausted', state: { currentState: AdaptiveState.NORMAL, flipHistory: Object.freeze([T0 - 100, T0 - 200, T0 - 300, T0 - 400]) }, input: { sigmaZone: 'WARNING' } },
    { name: 'consecutive pending', state: { currentState: AdaptiveState.NORMAL, consecutiveCount: 0, lastZone: 'NORMAL' as any }, input: { sigmaZone: 'WARNING' }, config: DEFAULT_ADAPTIVE_CONFIG },
  ];

  it.each(scenarios)('$name: outputReason ∈ closed set', ({ state, input, config }) => {
    const { outputReason } = collectReasons(state, input, config);
    expect(outputReasonSet.has(outputReason)).toBe(true);
  });

  it.each(scenarios)('$name: stateReason ∈ closed set', ({ state, input, config }) => {
    const { stateReason } = collectReasons(state, input, config);
    expect(stateReasonSet.has(stateReason)).toBe(true);
  });

  it('no UNKNOWN reason code exists in any scenario', () => {
    for (const { state, input, config } of scenarios) {
      const { outputReason, stateReason } = collectReasons(state, input, config);
      expect(outputReason).not.toBe('UNKNOWN');
      expect(stateReason).not.toBe('UNKNOWN');
    }
  });
});


// ============================================================================
// H4: Telemetry Event Label Cardinality — Bounded
// ============================================================================

describe('H4: Telemetry event label cardinality bounded', () => {
  const VALID_EVENT_TYPES: ReadonlySet<TelemetryEventType> = new Set([
    'STATE_GAUGE',
    'TRANSITION_COUNT',
    'DWELL_TIME_OBSERVATION',
    'FLIP_BUDGET_GAUGE',
  ]);

  const VALID_STATES = new Set(ADAPTIVE_STATES.map((s) => s as string));
  const VALID_STATE_REASONS = new Set<string>(ALL_STATE_REASONS);

  /** Collect all events from a diverse set of scenarios */
  function collectAllEvents(): Array<{ type: string; labels: Record<string, string> }> {
    const allEvents: Array<{ type: string; labels: Record<string, string> }> = [];

    const scenarios: Array<{ state: Partial<AdaptiveInternalState>; input: Partial<ControlInput> }> = [
      // Steady state
      { state: { currentState: AdaptiveState.NORMAL }, input: { sigmaZone: 'NORMAL' } },
      // Escalation
      { state: { currentState: AdaptiveState.NORMAL }, input: { sigmaZone: 'WARNING' } },
      // De-escalation
      { state: { currentState: AdaptiveState.ELEVATED }, input: { sigmaZone: 'NORMAL' } },
      // Kill-switch
      { state: { currentState: AdaptiveState.ENFORCE }, input: { killSwitchActive: true } },
      // Provider outage
      { state: { currentState: AdaptiveState.ENFORCE }, input: { providerHealthZone: ProviderHealthZone.OUTAGE } },
      // Compliance violation
      { state: { currentState: AdaptiveState.VIOLATION }, input: { sigmaZone: 'ALERT', complianceVerdict: false } },
      // Compliance restored
      { state: { currentState: AdaptiveState.ENFORCE }, input: { complianceVerdict: true } },
    ];

    for (const { state, input } of scenarios) {
      const r = evaluateAdaptive(makeState(state), makeInput({ ...input, nowMs: T0 }), FAST);
      for (const event of r.events) {
        allEvents.push({ type: event.type, labels: event.labels as Record<string, string> });
      }
    }

    return allEvents;
  }

  it('all event types are from the closed set', () => {
    const events = collectAllEvents();
    for (const event of events) {
      expect(VALID_EVENT_TYPES.has(event.type as TelemetryEventType)).toBe(true);
    }
  });

  it('STATE_GAUGE labels.state values are from AdaptiveState enum', () => {
    const events = collectAllEvents().filter((e) => e.type === 'STATE_GAUGE');
    for (const event of events) {
      expect(VALID_STATES.has(event.labels.state)).toBe(true);
    }
  });

  it('TRANSITION_COUNT labels.from and labels.to are from AdaptiveState enum', () => {
    const events = collectAllEvents().filter((e) => e.type === 'TRANSITION_COUNT');
    for (const event of events) {
      expect(VALID_STATES.has(event.labels.from)).toBe(true);
      expect(VALID_STATES.has(event.labels.to)).toBe(true);
    }
  });

  it('TRANSITION_COUNT labels.reason is from StateReason closed set', () => {
    const events = collectAllEvents().filter((e) => e.type === 'TRANSITION_COUNT');
    for (const event of events) {
      expect(VALID_STATE_REASONS.has(event.labels.reason)).toBe(true);
    }
  });

  it('DWELL_TIME_OBSERVATION labels.state is from AdaptiveState enum', () => {
    const events = collectAllEvents().filter((e) => e.type === 'DWELL_TIME_OBSERVATION');
    for (const event of events) {
      expect(VALID_STATES.has(event.labels.state)).toBe(true);
    }
  });

  it('no event contains UNKNOWN or empty string labels', () => {
    const events = collectAllEvents();
    for (const event of events) {
      for (const [key, value] of Object.entries(event.labels)) {
        expect(value).not.toBe('UNKNOWN');
        expect(value).not.toBe('');
        expect(value).toBeDefined();
      }
    }
  });

  it('total label cardinality is bounded (< 100 unique label combinations)', () => {
    const events = collectAllEvents();
    const uniqueLabels = new Set(events.map((e) => `${e.type}:${JSON.stringify(e.labels)}`));
    // 4 states × gauge + transitions + dwell + budget = well under 100
    expect(uniqueLabels.size).toBeLessThan(100);
  });
});

// ============================================================================
// Telemetry Event Contract
// ============================================================================

describe('Telemetry event contract', () => {
  it('every evaluation emits at least STATE_GAUGE and FLIP_BUDGET_GAUGE', () => {
    const r = evaluateAdaptive(makeState({}), makeInput(), FAST);
    const types = new Set(r.events.map((e) => e.type));
    expect(types.has('STATE_GAUGE')).toBe(true);
    expect(types.has('FLIP_BUDGET_GAUGE')).toBe(true);
  });

  it('STATE_GAUGE emits exactly 4 events (one per state)', () => {
    const r = evaluateAdaptive(makeState({}), makeInput(), FAST);
    const gauges = r.events.filter((e) => e.type === 'STATE_GAUGE');
    expect(gauges).toHaveLength(4);
  });

  it('STATE_GAUGE: exactly one state has value=1, rest have value=0', () => {
    const r = evaluateAdaptive(makeState({}), makeInput(), FAST);
    const gauges = r.events.filter((e) => e.type === 'STATE_GAUGE');
    const activeCount = gauges.filter((g) => g.value === 1).length;
    const inactiveCount = gauges.filter((g) => g.value === 0).length;
    expect(activeCount).toBe(1);
    expect(inactiveCount).toBe(3);
  });

  it('TRANSITION_COUNT emitted only when transitionOccurred=true', () => {
    // No transition
    const r1 = evaluateAdaptive(makeState({}), makeInput({ sigmaZone: 'NORMAL' }), FAST);
    expect(r1.output.transitionOccurred).toBe(false);
    expect(r1.events.filter((e) => e.type === 'TRANSITION_COUNT')).toHaveLength(0);

    // With transition
    const r2 = evaluateAdaptive(makeState({}), makeInput({ sigmaZone: 'WARNING' }), FAST);
    expect(r2.output.transitionOccurred).toBe(true);
    expect(r2.events.filter((e) => e.type === 'TRANSITION_COUNT')).toHaveLength(1);
  });

  it('all events have valid timestampMs matching input.nowMs', () => {
    const r = evaluateAdaptive(makeState({}), makeInput({ nowMs: T0 }), FAST);
    for (const event of r.events) {
      expect(event.timestampMs).toBe(T0);
    }
  });

  it('FLIP_BUDGET_GAUGE value matches output.flipBudgetRemaining', () => {
    const r = evaluateAdaptive(makeState({}), makeInput(), FAST);
    const budgetEvent = r.events.find((e) => e.type === 'FLIP_BUDGET_GAUGE');
    expect(budgetEvent).toBeDefined();
    expect(budgetEvent!.value).toBe(r.output.flipBudgetRemaining);
  });
});
