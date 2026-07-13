import {
  ADR014_DRY_VALIDATION_FACT_FAMILIES,
  type Adr014DryValidationScenario,
  createAdr014LocalSessionDryValidationOrchestrator,
  isAdr014DryValidationTransitionAllowed,
} from '../adr014-local-session-orchestrator-dry-validation';

const SHA = 'b'.repeat(40);
const BINDING = `adr014-binding:v1:${'1'.repeat(32)}`;

function reference(kind: string, slug: string) {
  return Object.freeze({
    kind,
    opaqueReference: `adr014-ref:v1:${slug}:${'2'.repeat(32)}`,
    bindingReference: BINDING,
  });
}

function clock(values: readonly number[]) {
  let index = 0;
  return Object.freeze({
    readSeconds: jest.fn(() => values[index++] as number),
  });
}

function request(scenario: Adr014DryValidationScenario, values: readonly number[] = [10, 12, 20, 23, 30, 34]) {
  return Object.freeze({
    preparationRequest: Object.freeze({
      contractVersion: '1',
      enabled: true,
      canonicalSha: SHA,
      environmentReference: reference('ENVIRONMENT', 'environment'),
      sessionReference: reference('SESSION', 'session'),
      manifestReference: reference('MANIFEST', 'manifest'),
      accessAuthorizationReference: reference('ACCESS_AUTHORIZATION', 'access-authorization'),
      executionAuthorizationReference: reference(
        'EXECUTION_AUTHORIZATION',
        'execution-authorization',
      ),
    }),
    preparationConstraints: Object.freeze({ currentCanonicalSha: SHA }),
    scenario,
    eventContext: Object.freeze({
      timestamp: '2026-07-13T15:00:00.000Z',
      canonicalShaReference: SHA,
      environmentReference: 'TEST',
    }),
    monotonicClock: clock(values),
  });
}

describe('ADR014 PE-06D local session orchestrator dry-validation', () => {
  it('is default-disabled and does not inspect the request or clock', () => {
    const orchestrator = createAdr014LocalSessionDryValidationOrchestrator();
    const throwingRequest = Object.defineProperty({}, 'scenario', {
      get: () => {
        throw new Error('must not inspect');
      },
    });

    expect(orchestrator.mode).toBe('DISABLED');
    expect(orchestrator.validate(throwingRequest)).toEqual({
      contractVersion: '1', status: 'DISABLED', projections: [],
    });
  });

  it('dry-validates the complete deterministic session and all seven fact families', () => {
    const orchestrator = createAdr014LocalSessionDryValidationOrchestrator({ mode: 'TEST_ONLY' });
    const first = orchestrator.validate(request('SESSION_SUCCESS'));
    const second = orchestrator.validate(request('SESSION_SUCCESS'));

    expect(first).toEqual(second);
    expect(first.status).toBe('DRY_VALIDATED');
    if (first.status !== 'DRY_VALIDATED') throw new Error('expected dry validation');
    expect(first.factFamilies).toEqual(ADR014_DRY_VALIDATION_FACT_FAMILIES);
    expect(first.projections.every((projection) => projection.event.status === 'MAPPED')).toBe(true);
    expect(first.projections.every((projection) => projection.event.status !== 'MAPPED' ||
      (projection.event.event.event_version === '2' &&
       projection.event.event.event_profile === 'SESSION_CONTROL'))).toBe(true);
    expect(first.projections.filter((projection) =>
      projection.metric.status === 'MAPPED' &&
      projection.metric.metricName === 'adr014_evidence_phase_duration_seconds',
    ).map((projection) => projection.metric.status === 'MAPPED' ? projection.metric.value : -1))
      .toEqual([2, 3, 4]);
    expect(first.projections.some((projection) => projection.additionalMetrics.some((metric) =>
      metric.status === 'MAPPED' && metric.metricName === 'adr014_evidence_sessions_total' &&
      metric.labels.result === 'COMPLETED',
    ))).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.projections)).toBe(true);
  });

  it.each([
    ['PHASE_FAILURE', 'ADR014_PHASE_FAILED', 'FAILED'],
    ['PHASE_TIMEOUT', 'ADR014_PHASE_TIMEOUT', 'TIMEOUT'],
    ['PHASE_CANCELLED', 'ADR014_PHASE_CANCELLED', 'CANCELLED'],
  ] as const)('maps %s to the bounded terminal event and metric', (scenario, eventType, metricResult) => {
    const result = createAdr014LocalSessionDryValidationOrchestrator({ mode: 'TEST_ONLY' })
      .validate(request(scenario, [5, 8]));

    expect(result.status).toBe('DRY_VALIDATED');
    if (result.status !== 'DRY_VALIDATED') throw new Error('expected dry validation');
    const terminalPhase = result.projections.find((projection) =>
      projection.fact.kind === 'PHASE' && projection.fact.result !== 'STARTED',
    );
    expect(terminalPhase?.event.status === 'MAPPED' && terminalPhase.event.event.event_type)
      .toBe(eventType);
    expect(terminalPhase?.metric.status === 'MAPPED' && terminalPhase.metric.labels.result)
      .toBe(metricResult);
    expect(result.projections.at(-1)?.fact).toMatchObject({ kind: 'SESSION', state: 'ABORTED' });
  });

  it('validates an explicit session-aborted terminal path', () => {
    const result = createAdr014LocalSessionDryValidationOrchestrator({ mode: 'TEST_ONLY' })
      .validate(request('SESSION_ABORTED', []));
    expect(result.status).toBe('DRY_VALIDATED');
    if (result.status !== 'DRY_VALIDATED') throw new Error('expected dry validation');
    const terminal = result.projections.at(-1);
    expect(terminal?.fact).toMatchObject({ kind: 'SESSION', state: 'ABORTED' });
    expect(terminal?.event.status === 'MAPPED' && terminal.event.event.event_type)
      .toBe('ADR014_SESSION_ABORTED');
  });

  it('fails closed on an invalid state transition before returning partial projections', () => {
    const result = createAdr014LocalSessionDryValidationOrchestrator({ mode: 'TEST_ONLY' })
      .validate(request('INVALID_STATE_TRANSITION', []));
    expect(result).toEqual({
      contractVersion: '1', status: 'BLOCKED',
      blockerCodes: ['INVALID_STATE_TRANSITION'], projections: [],
    });
    expect(isAdr014DryValidationTransitionAllowed('DRAFT', 'ACTIVE')).toBe(false);
  });

  it('fails closed when access or execution authorization context is absent', () => {
    const candidate = request('SESSION_SUCCESS') as Record<string, unknown>;
    const preparation = { ...(candidate.preparationRequest as Record<string, unknown>) };
    delete preparation.executionAuthorizationReference;
    const result = createAdr014LocalSessionDryValidationOrchestrator({ mode: 'TEST_ONLY' })
      .validate({ ...candidate, preparationRequest: preparation });

    expect(result).toEqual({
      contractVersion: '1', status: 'BLOCKED',
      blockerCodes: ['MISSING_EXECUTION_AUTHORIZATION'], projections: [],
    });
  });

  it('rejects a decreasing or invalid caller-supplied monotonic clock', () => {
    const orchestrator = createAdr014LocalSessionDryValidationOrchestrator({ mode: 'TEST_ONLY' });
    expect(orchestrator.validate(request('PHASE_FAILURE', [9, 8]))).toMatchObject({
      status: 'BLOCKED', blockerCodes: ['NON_MONOTONIC_PHASE_DURATION'], projections: [],
    });
    expect(orchestrator.validate(request('PHASE_FAILURE', [Number.NaN]))).toMatchObject({
      status: 'BLOCKED', blockerCodes: ['INVALID_MONOTONIC_CLOCK'], projections: [],
    });
  });

  it('fails closed on invalid v2 event context without emitting a partial result', () => {
    const candidate = request('SESSION_SUCCESS') as Record<string, unknown>;
    const result = createAdr014LocalSessionDryValidationOrchestrator({ mode: 'TEST_ONLY' })
      .validate({ ...candidate, eventContext: { ...candidate.eventContext as object, environmentReference: 'UNKNOWN' } });
    expect(result).toMatchObject({
      status: 'BLOCKED', blockerCodes: ['OBSERVATION_EVENT_MAPPING_BLOCKED'], projections: [],
    });
  });
});
