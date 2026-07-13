import {
  ADR014_NOOP_OBSERVATION_TELEMETRY_SINK,
  ADR014_OBSERVATION_PRODUCER_DEFAULT_CONFIG,
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

  it('maps only canonical bounded metric projections and blocks missing phase duration', () => {
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
      { status: 'BLOCKED', blockerCode: 'PHASE_DURATION_SOURCE_ABSENT' },
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

  it('explicitly blocks event mapping instead of extending the PE-05A2 shadow envelope', () => {
    const sink = new InMemoryObservationTelemetrySink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    inputs.forEach((input) => producer.produce(input));

    expect(sink.projections.map((projection) => projection.event)).toEqual(
      Array(7).fill({
        status: 'BLOCKED',
        blockerCode: 'PE05A2_EVENT_VOCABULARY_UNAVAILABLE',
      }),
    );
    expect(sink.projections.every((projection) => projection.audit === 'OUT_OF_SCOPE')).toBe(true);
    expect(sink.projections.every((projection) => projection.evidence === 'OUT_OF_SCOPE')).toBe(
      true,
    );
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
