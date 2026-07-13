import {
  ADR014_NOOP_OBSERVATION_TELEMETRY_SINK,
  ADR014_OBSERVATION_FACT_EVENT_DISPOSITIONS,
  ADR014_OBSERVATION_PRODUCER_DEFAULT_CONFIG,
  ADR014_OBSERVATION_PRODUCER_CONTRACT_VERSION,
  ADR014_SOURCE_ABSENT_METRIC_CONTRACTS,
  type Adr014ObservationProducerInput,
  type Adr014ObservationTelemetryProjection,
  type Adr014ObservationTelemetrySink,
  createAdr014ObservationProducer,
} from '../adr014-session-observation-producer';

class InMemoryObservationTelemetrySink implements Adr014ObservationTelemetrySink {
  readonly projections: Adr014ObservationTelemetryProjection[] = [];

  accept(projection: Adr014ObservationTelemetryProjection): void {
    this.projections.push(projection);
  }
}

const inputs = [
  { kind: 'SESSION', state: 'DRAFT' },
  { kind: 'PHASE', phase: 'EXECUTION', result: 'STARTED' },
  { kind: 'MANIFEST', sourceState: 'APPROVED', evidenceValidity: 'VALID' },
  { kind: 'COVERAGE', category: 'CURRENCY', result: 'PARTIAL' },
  { kind: 'BOUNDARY', boundaryType: 'TENANT', result: 'PASS' },
  { kind: 'CONTROL', result: 'NOT_CONFIGURED' },
  { kind: 'HEALTH', component: 'AUDIT', result: 'UNKNOWN' },
] as const satisfies readonly Adr014ObservationProducerInput[];

const projectionContext = Object.freeze({
  event: Object.freeze({
    timestamp: '2026-07-13T14:00:00.000Z',
    canonicalShaReference: 'a'.repeat(40),
    environmentReference: 'TEST' as const,
  }),
});

function mappedEventFor(input: Adr014ObservationProducerInput) {
  const sink = new InMemoryObservationTelemetrySink();
  const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
  producer.produce(input, projectionContext);
  const projection = sink.projections[0].event;
  if (projection.status !== 'MAPPED') throw new Error('expected mapped v2 event');
  return projection.event;
}

describe('ADR014-PE-06B2 observation producer preparation', () => {
  it('is default-disabled and performs no factory, projection or sink work', () => {
    const sink = {
      accept: jest.fn(() => {
        throw new Error('disabled path must not call the sink');
      }),
    };
    const producer = createAdr014ObservationProducer(undefined, sink);

    expect(ADR014_OBSERVATION_PRODUCER_DEFAULT_CONFIG).toEqual({ mode: 'DISABLED' });
    expect(Object.isFrozen(ADR014_OBSERVATION_PRODUCER_DEFAULT_CONFIG)).toBe(true);
    expect(producer.mode).toBe('DISABLED');
    expect(producer.produce({ tenantId: 'unvalidated input is never inspected' })).toEqual({
      status: 'DISABLED',
    });
    expect(sink.accept).not.toHaveBeenCalled();
  });

  it('uses all seven canonical fact factories through one test-only producer boundary', () => {
    const sink = new InMemoryObservationTelemetrySink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);

    const results = inputs.map((input) => producer.produce(input));

    expect(results.map((result) => result.status)).toEqual(Array(7).fill('PROJECTED'));
    expect(sink.projections.map((projection) => projection.fact.kind)).toEqual([
      'SESSION',
      'PHASE',
      'MANIFEST',
      'COVERAGE',
      'BOUNDARY',
      'CONTROL',
      'HEALTH',
    ]);
    expect(sink.projections.map((projection) => projection.fact.producer)).toEqual([
      'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
      'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
      'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
      'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
      'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
      'ADR014_CONTROL_OBSERVER',
      'ADR014_INSTRUMENTATION_HEALTH_OBSERVER',
    ]);
  });

  it('preserves existing bounded metric projections and makes started phase duration inapplicable', () => {
    const sink = new InMemoryObservationTelemetrySink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    inputs.forEach((input) => producer.produce(input));

    expect(sink.projections.map((projection) => projection.metric)).toEqual([
      {
        status: 'MAPPED',
        metricName: 'adr014_evidence_session_state',
        metricType: 'GAUGE',
        labels: { session_state: 'DRAFT' },
        value: 1,
      },
      { status: 'VOCABULARY_ONLY', reasonCode: 'PHASE_DURATION_TERMINAL_FACT_REQUIRED' },
      {
        status: 'MAPPED',
        metricName: 'adr014_dataset_manifest_state',
        metricType: 'GAUGE',
        labels: { source_state: 'APPROVED', evidence_validity: 'VALID' },
        value: 1,
      },
      {
        status: 'MAPPED',
        metricName: 'adr014_dataset_coverage_state',
        metricType: 'GAUGE',
        labels: { coverage_category: 'CURRENCY', result: 'PARTIAL' },
        value: 1,
      },
      {
        status: 'MAPPED',
        metricName: 'adr014_boundary_verification_total',
        metricType: 'COUNTER',
        labels: { boundary_type: 'TENANT', result: 'PASS' },
        value: 1,
      },
      {
        status: 'MAPPED',
        metricName: 'adr014_kill_switch_state',
        metricType: 'GAUGE',
        labels: { result: 'NOT_CONFIGURED' },
        value: 1,
      },
      {
        status: 'MAPPED',
        metricName: 'adr014_instrumentation_health',
        metricType: 'GAUGE',
        labels: { component: 'AUDIT', result: 'UNKNOWN' },
        value: 1,
      },
    ]);
  });

  it('blocks v2 event projection without explicit caller-supplied context', () => {
    const sink = new InMemoryObservationTelemetrySink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    inputs.forEach((input) => producer.produce(input));

    expect(sink.projections.map((projection) => projection.event)).toEqual(
      Array(7).fill({
        status: 'BLOCKED_WITH_REASON',
        blockerCode: 'SESSION_CONTROL_EVENT_CONTEXT_ABSENT',
      }),
    );
    expect(sink.projections.every((projection) => projection.audit === 'OUT_OF_SCOPE')).toBe(true);
    expect(sink.projections.every((projection) => projection.evidence === 'OUT_OF_SCOPE')).toBe(
      true,
    );
  });

  it('maps all seven fact families exhaustively into the same-family v2 profile', () => {
    const sink = new InMemoryObservationTelemetrySink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    inputs.forEach((input) => producer.produce(input, projectionContext));

    expect(ADR014_OBSERVATION_FACT_EVENT_DISPOSITIONS).toEqual({
      SESSION: 'MAPPED', PHASE: 'MAPPED', MANIFEST: 'MAPPED', COVERAGE: 'MAPPED',
      BOUNDARY: 'MAPPED', CONTROL: 'MAPPED', HEALTH: 'MAPPED',
    });
    expect(ADR014_OBSERVATION_PRODUCER_CONTRACT_VERSION).toBe('2');
    expect(sink.projections.map((projection) => projection.event)).toEqual([
      expect.objectContaining({
        status: 'MAPPED',
        event: expect.objectContaining({
          event_type: 'ADR014_SESSION_REQUESTED', component: 'SESSION',
          operation: 'OBSERVE_SESSION', result: 'OBSERVED', failure_code: 'NONE',
        }),
      }),
      expect.objectContaining({
        status: 'MAPPED',
        event: expect.objectContaining({
          event_type: 'ADR014_PHASE_STARTED', component: 'PHASE',
          operation: 'OBSERVE_PHASE', result: 'STARTED', failure_code: 'NONE',
        }),
      }),
      expect.objectContaining({
        status: 'MAPPED',
        event: expect.objectContaining({ event_type: 'ADR014_MANIFEST_STATE_OBSERVED' }),
      }),
      expect.objectContaining({
        status: 'MAPPED',
        event: expect.objectContaining({ event_type: 'ADR014_COVERAGE_STATE_OBSERVED' }),
      }),
      expect.objectContaining({
        status: 'MAPPED',
        event: expect.objectContaining({ event_type: 'ADR014_BOUNDARY_RESULT_OBSERVED' }),
      }),
      expect.objectContaining({
        status: 'MAPPED',
        event: expect.objectContaining({ event_type: 'ADR014_CONTROL_STATE_OBSERVED' }),
      }),
      expect.objectContaining({
        status: 'MAPPED',
        event: expect.objectContaining({
          event_type: 'ADR014_INSTRUMENTATION_HEALTH_OBSERVED',
        }),
      }),
    ]);
    for (const projection of sink.projections) {
      if (projection.event.status !== 'MAPPED') throw new Error('expected mapped v2 event');
      expect(projection.event.event.event_version).toBe('2');
      expect(projection.event.event.event_profile).toBe('SESSION_CONTROL');
      expect(Object.isFrozen(projection.event.event)).toBe(true);
    }
  });

  it.each([
    ['ACTIVE', 'STARTED'],
    ['CLOSED', 'COMPLETED'],
    ['ABORTED', 'ABORTED'],
    ['INVALIDATED', 'INVALIDATED'],
    ['REJECTED', 'FAILED'],
  ] as const)('maps session state %s to bounded counter result %s', (state, result) => {
    const sink = new InMemoryObservationTelemetrySink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    producer.produce({ kind: 'SESSION', state }, projectionContext);

    expect(sink.projections[0].additionalMetrics).toEqual([{
      status: 'MAPPED', metricName: 'adr014_evidence_sessions_total', metricType: 'COUNTER',
      labels: { result }, value: 1,
    }]);
  });

  it('maps only supplied finite monotonic duration and never measures time itself', () => {
    const sink = new InMemoryObservationTelemetrySink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    const phase = {
      kind: 'PHASE', phase: 'EXECUTION', result: 'FAILED', phaseFailure: 'FAILED',
      executionOutcome: 'TIMEOUT',
    } as const;

    producer.produce(phase, { ...projectionContext, phaseDurationSeconds: 1.25 });
    producer.produce(phase, projectionContext);
    producer.produce(phase, { ...projectionContext, phaseDurationSeconds: -1 });

    expect(sink.projections.map((projection) => projection.metric)).toEqual([
      {
        status: 'MAPPED', metricName: 'adr014_evidence_phase_duration_seconds',
        metricType: 'HISTOGRAM', labels: { phase: 'EXECUTION', result: 'TIMEOUT' }, value: 1.25,
      },
      { status: 'BLOCKED_WITH_REASON', blockerCode: 'PHASE_DURATION_CONTEXT_ABSENT' },
      { status: 'BLOCKED_WITH_REASON', blockerCode: 'INVALID_PHASE_DURATION_CONTEXT' },
    ]);
  });

  it('keeps execution-request and control-event counters typed and source-blocked', () => {
    expect(ADR014_SOURCE_ABSENT_METRIC_CONTRACTS).toEqual([
      {
        status: 'BLOCKED_WITH_REASON', metricName: 'adr014_execution_requests_total',
        blockerCode: 'EXECUTION_REQUEST_SOURCE_ABSENT',
      },
      {
        status: 'BLOCKED_WITH_REASON', metricName: 'adr014_control_events_total',
        blockerCode: 'CONTROL_EVENT_SOURCE_ABSENT',
      },
    ]);
    expect(Object.isFrozen(ADR014_SOURCE_ABSENT_METRIC_CONTRACTS)).toBe(true);
  });

  it.each([
    ['DRAFT', 'ADR014_SESSION_REQUESTED', 'INFO', 'OBSERVED', 'NONE'],
    ['ENVIRONMENT_VERIFIED', 'ADR014_SESSION_ENVIRONMENT_VERIFIED', 'INFO', 'SUCCESS', 'NONE'],
    ['ACCESS_APPROVED', 'ADR014_SESSION_ACCESS_STATE_OBSERVED', 'INFO', 'OBSERVED', 'NONE'],
    ['EXECUTION_AUTHORIZED', 'ADR014_SESSION_EXECUTION_AUTH_STATE_OBSERVED', 'INFO', 'OBSERVED', 'NONE'],
    ['ACTIVE', 'ADR014_SESSION_STARTED', 'INFO', 'STARTED', 'NONE'],
    ['CAPTURE_COMPLETE', 'ADR014_SESSION_CAPTURE_COMPLETED', 'INFO', 'COMPLETED', 'NONE'],
    ['VALIDATION_PENDING', 'ADR014_SESSION_VALIDATION_STARTED', 'INFO', 'STARTED', 'NONE'],
    ['VALIDATED', 'ADR014_SESSION_VALIDATED', 'INFO', 'SUCCESS', 'NONE'],
    ['CLOSED', 'ADR014_SESSION_CLOSED', 'INFO', 'COMPLETED', 'NONE'],
    ['REJECTED', 'ADR014_SESSION_REJECTED', 'CRITICAL', 'REJECTED', 'REQUEST_REJECTED'],
    ['ABORTED', 'ADR014_SESSION_ABORTED', 'CRITICAL', 'ABORTED', 'SESSION_ABORTED'],
    ['INVALIDATED', 'ADR014_SESSION_INVALIDATED', 'HARD_STOP', 'INVALIDATED', 'SESSION_INVALIDATED'],
  ] as const)('maps session %s exactly', (state, eventType, severity, result, failureCode) => {
    expect(mappedEventFor({ kind: 'SESSION', state })).toMatchObject({
      event_type: eventType, severity, component: 'SESSION', operation: 'OBSERVE_SESSION',
      result, failure_code: failureCode,
    });
  });

  it.each([
    [{ kind: 'PHASE', phase: 'EXECUTION', result: 'STARTED' }, 'ADR014_PHASE_STARTED', 'STARTED', 'NONE'],
    [{ kind: 'PHASE', phase: 'EXECUTION', result: 'COMPLETED', executionOutcome: 'SUCCESS' }, 'ADR014_PHASE_COMPLETED', 'SUCCESS', 'NONE'],
    [{ kind: 'PHASE', phase: 'EXECUTION', result: 'FAILED', phaseFailure: 'FAILED', executionOutcome: 'ERROR' }, 'ADR014_PHASE_FAILED', 'ERROR', 'PHASE_PROCESSING_ERROR'],
    [{ kind: 'PHASE', phase: 'EXECUTION', result: 'FAILED', phaseFailure: 'FAILED', executionOutcome: 'TIMEOUT' }, 'ADR014_PHASE_TIMEOUT', 'TIMEOUT', 'PHASE_TIMEOUT'],
    [{ kind: 'PHASE', phase: 'EXECUTION', result: 'FAILED', phaseFailure: 'FAILED', executionOutcome: 'CANCELLED' }, 'ADR014_PHASE_CANCELLED', 'CANCELLED', 'PHASE_CANCELLED'],
    [{ kind: 'PHASE', phase: 'CAPTURE', result: 'COMPLETED' }, 'ADR014_PHASE_COMPLETED', 'COMPLETED', 'NONE'],
    [{ kind: 'PHASE', phase: 'VALIDATION', result: 'FAILED', phaseFailure: 'FAILED' }, 'ADR014_PHASE_FAILED', 'FAILED', 'PHASE_PROCESSING_ERROR'],
  ] as const)('maps phase outcome %# exactly', (input, eventType, result, failureCode) => {
    expect(mappedEventFor(input)).toMatchObject({
      event_type: eventType, severity: result === 'STARTED' || result === 'SUCCESS' || result === 'COMPLETED' ? 'INFO' : 'CRITICAL',
      component: 'PHASE', operation: 'OBSERVE_PHASE', result, failure_code: failureCode,
    });
  });

  it.each([
    [{ kind: 'MANIFEST', sourceState: 'ABSENT', evidenceValidity: 'VALID' }, 'HARD_STOP', 'BLOCKED', 'MANIFEST_ABSENT'],
    [{ kind: 'MANIFEST', sourceState: 'INVALID', evidenceValidity: 'VALID' }, 'HARD_STOP', 'FAILED', 'MANIFEST_INVALID'],
    [{ kind: 'MANIFEST', sourceState: 'APPROVED', evidenceValidity: 'REJECTED' }, 'HARD_STOP', 'REJECTED', 'MANIFEST_REJECTED'],
    [{ kind: 'MANIFEST', sourceState: 'APPROVED', evidenceValidity: 'INVALIDATED' }, 'HARD_STOP', 'INVALIDATED', 'SESSION_INVALIDATED'],
    [{ kind: 'MANIFEST', sourceState: 'APPROVED', evidenceValidity: 'INCOMPLETE' }, 'CRITICAL', 'BLOCKED', 'SOURCE_UNAVAILABLE'],
    [{ kind: 'MANIFEST', sourceState: 'APPROVED', evidenceValidity: 'VALID_WITH_WARNING' }, 'WARNING', 'OBSERVED', 'NONE'],
    [{ kind: 'MANIFEST', sourceState: 'APPROVED', evidenceValidity: 'VALID' }, 'INFO', 'OBSERVED', 'NONE'],
  ] as const)('maps manifest condition %# exactly', (input, severity, result, failureCode) => {
    expect(mappedEventFor(input)).toMatchObject({
      event_type: 'ADR014_MANIFEST_STATE_OBSERVED', severity, component: 'MANIFEST',
      operation: 'OBSERVE_MANIFEST', result, failure_code: failureCode,
    });
  });

  it.each([
    ['COMPLETE', 'INFO', 'SUCCESS', 'NONE'],
    ['PARTIAL', 'WARNING', 'OBSERVED', 'NONE'],
    ['MISSING', 'HARD_STOP', 'BLOCKED', 'COVERAGE_MISSING'],
    ['INVALID', 'HARD_STOP', 'FAILED', 'COVERAGE_INVALID'],
    ['NOT_EVALUATED', 'HARD_STOP', 'UNAVAILABLE', 'SOURCE_UNAVAILABLE'],
  ] as const)('maps coverage %s exactly', (coverageResult, severity, result, failureCode) => {
    expect(mappedEventFor({ kind: 'COVERAGE', category: 'REQUIRED', result: coverageResult })).toMatchObject({
      event_type: 'ADR014_COVERAGE_STATE_OBSERVED', severity, component: 'COVERAGE',
      operation: 'OBSERVE_COVERAGE', result, failure_code: failureCode,
    });
  });

  it.each([
    ['PASS', 'INFO', 'SUCCESS', 'NONE'],
    ['FAIL', 'HARD_STOP', 'FAILED', 'BOUNDARY_FAILED'],
    ['NOT_EVALUATED', 'HARD_STOP', 'UNAVAILABLE', 'BOUNDARY_NOT_EVALUATED'],
  ] as const)('maps boundary %s exactly', (boundaryResult, severity, result, failureCode) => {
    expect(mappedEventFor({ kind: 'BOUNDARY', boundaryType: 'TENANT', result: boundaryResult })).toMatchObject({
      event_type: 'ADR014_BOUNDARY_RESULT_OBSERVED', severity, component: 'BOUNDARY',
      operation: 'VERIFY_BOUNDARY', result, failure_code: failureCode,
    });
  });

  it.each([
    ['CONFIGURED', 'INFO', 'OBSERVED', 'NONE'],
    ['NOT_CONFIGURED', 'HARD_STOP', 'BLOCKED', 'CONTROL_NOT_CONFIGURED'],
    ['BLOCKED', 'HARD_STOP', 'BLOCKED', 'CONTROL_BLOCKED'],
    ['UNAVAILABLE', 'HARD_STOP', 'UNAVAILABLE', 'CONTROL_UNAVAILABLE'],
  ] as const)('maps control %s exactly', (controlResult, severity, result, failureCode) => {
    expect(mappedEventFor({ kind: 'CONTROL', result: controlResult })).toMatchObject({
      event_type: 'ADR014_CONTROL_STATE_OBSERVED', severity, component: 'CONTROL',
      operation: 'OBSERVE_CONTROL', result, failure_code: failureCode,
    });
  });

  it.each([
    ['HEALTHY', 'INFO', 'SUCCESS', 'NONE'],
    ['DEGRADED', 'WARNING', 'OBSERVED', 'INSTRUMENTATION_DEGRADED'],
    ['FAILED', 'HARD_STOP', 'FAILED', 'INSTRUMENTATION_FAILED'],
    ['UNKNOWN', 'HARD_STOP', 'UNAVAILABLE', 'INSTRUMENTATION_UNKNOWN'],
    ['NOT_CONFIGURED', 'HARD_STOP', 'UNAVAILABLE', 'INSTRUMENTATION_NOT_CONFIGURED'],
  ] as const)('maps health %s exactly', (healthResult, severity, result, failureCode) => {
    expect(mappedEventFor({ kind: 'HEALTH', component: 'METRIC', result: healthResult })).toMatchObject({
      event_type: 'ADR014_INSTRUMENTATION_HEALTH_OBSERVED', severity,
      component: 'INSTRUMENTATION_HEALTH', operation: 'OBSERVE_HEALTH', result,
      failure_code: failureCode,
    });
  });

  it('is deterministic, deeply immutable and stable for identical input', () => {
    const sink = new InMemoryObservationTelemetrySink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    const input = { kind: 'COVERAGE', category: 'REQUIRED', result: 'NOT_EVALUATED' } as const;

    const first = producer.produce(input);
    const second = producer.produce(input);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first)).toBe(true);
    if (first.status !== 'PROJECTED') throw new Error('expected test-only projection');
    expect(Object.isFrozen(first.projection)).toBe(true);
    expect(Object.isFrozen(first.projection.fact)).toBe(true);
    expect(Object.isFrozen(first.projection.metric)).toBe(true);
    expect(Object.isFrozen(first.projection.event)).toBe(true);
    if (first.projection.metric.status !== 'MAPPED') throw new Error('expected mapped metric');
    expect(Object.isFrozen(first.projection.metric.labels)).toBe(true);
  });

  it('returns bounded failures for invalid input and sink failure without exception leakage', () => {
    const sink = new InMemoryObservationTelemetrySink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);

    expect(
      producer.produce({
        kind: 'SESSION',
        state: 'DRAFT',
        metadata: { arbitrary: true },
      }),
    ).toEqual({ status: 'FAILED', failureCode: 'INVALID_OBSERVATION_INPUT' });
    expect(sink.projections).toHaveLength(0);

    const failingProducer = createAdr014ObservationProducer(
      { mode: 'TEST_ONLY' },
      {
        accept: () => {
          throw new Error('sensitive downstream detail');
        },
      },
    );
    expect(failingProducer.produce(inputs[0])).toEqual({
      status: 'FAILED',
      failureCode: 'TELEMETRY_SINK_FAILURE',
    });
  });

  it('keeps the no-op sink side-effect free in explicit test-only mode', () => {
    const producer = createAdr014ObservationProducer(
      { mode: 'TEST_ONLY' },
      ADR014_NOOP_OBSERVATION_TELEMETRY_SINK,
    );

    expect(producer.produce(inputs[0])).toMatchObject({ status: 'PROJECTED' });
    expect(Object.isFrozen(ADR014_NOOP_OBSERVATION_TELEMETRY_SINK)).toBe(true);
  });
});
