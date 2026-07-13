import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Adr014ObservationProducerInput,
  type Adr014ObservationTelemetryProjection,
  type Adr014ObservationTelemetrySink,
  createAdr014ObservationProducer,
} from '../adr014-session-observation-producer';

class SecurityInspectionSink implements Adr014ObservationTelemetrySink {
  readonly projections: Adr014ObservationTelemetryProjection[] = [];

  accept(projection: Adr014ObservationTelemetryProjection): void {
    this.projections.push(projection);
  }
}

const boundedInputs = [
  { kind: 'SESSION', state: 'ABORTED' },
  {
    kind: 'PHASE',
    phase: 'EXECUTION',
    result: 'FAILED',
    phaseFailure: 'FAILED',
    executionOutcome: 'TIMEOUT',
  },
  { kind: 'MANIFEST', sourceState: 'INVALID', evidenceValidity: 'INVALIDATED' },
  { kind: 'COVERAGE', category: 'LIFECYCLE', result: 'MISSING' },
  { kind: 'BOUNDARY', boundaryType: 'CLIENT', result: 'NOT_EVALUATED' },
  { kind: 'CONTROL', result: 'BLOCKED' },
  { kind: 'HEALTH', component: 'ALERT', result: 'NOT_CONFIGURED' },
] as const satisfies readonly Adr014ObservationProducerInput[];

describe('ADR014-PE-06B2 producer security boundary', () => {
  it('emits no identity, financial, free-text or arbitrary metadata fields', () => {
    const sink = new SecurityInspectionSink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    boundedInputs.forEach((input) => producer.produce(input));

    const serialized = JSON.stringify(sink.projections);
    for (const prohibited of [
      'tenantId',
      'caseId',
      'clientId',
      'debtorId',
      'creditorId',
      'personId',
      'sessionId',
      'manifestId',
      'traceId',
      'evidenceId',
      'amount',
      'principal',
      'interest',
      'fee',
      'rawError',
      'stack',
      'reason',
      'metadata',
      'secret',
      'token',
      'cookie',
      'header',
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it('uses only the canonical low-cardinality label keys', () => {
    const sink = new SecurityInspectionSink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    boundedInputs.forEach((input) => producer.produce(input));

    const allowedLabelKeys = new Set([
      'session_state',
      'source_state',
      'evidence_validity',
      'coverage_category',
      'boundary_type',
      'component',
      'result',
    ]);

    for (const projection of sink.projections) {
      if (projection.metric.status !== 'MAPPED') continue;
      for (const key of Object.keys(projection.metric.labels)) {
        expect(allowedLabelKeys.has(key)).toBe(true);
      }
      expect(Object.values(projection.metric.labels).every((value) => typeof value === 'string')).toBe(
        true,
      );
    }
  });

  it.each([
    { kind: 'SESSION', state: 'DRAFT', tenantId: 'raw-tenant' },
    { kind: 'CONTROL', result: 'ENABLED' },
    { kind: 'HEALTH', component: 'DATABASE', result: 'HEALTHY' },
    { kind: 'COVERAGE', category: 'REQUIRED', result: 'COMPLETE', amount: 100 },
    { kind: 'MANIFEST', sourceState: 'APPROVED', evidenceValidity: 'VALID', reason: 'free text' },
  ])('rejects an unbounded or extended producer input: %j', (input) => {
    const sink = new SecurityInspectionSink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);

    expect(producer.produce(input)).toEqual({
      status: 'FAILED',
      failureCode: 'INVALID_OBSERVATION_INPUT',
    });
    expect(sink.projections).toHaveLength(0);
  });

  it('has no runtime, I/O, persistence, clock, randomness or implicit enablement surface', () => {
    const source = readFileSync(
      join(__dirname, '..', 'adr014-session-observation-producer.ts'),
      'utf8',
    );

    for (const prohibitedPattern of [
      /@nestjs\//,
      /@prisma\//,
      /node:(?:fs|http|https|net|tls|crypto)/,
      /process\.(?:env|argv)/,
      /NestFactory/,
      /Date\./,
      /new Date/,
      /Math\.random/,
      /randomUUID/,
      /fetch\s*\(/,
      /axios/,
      /console\./,
      /AuditLog/,
      /prom-client/,
      /function\s+main/,
      /require\.main/,
    ]) {
      expect(source).not.toMatch(prohibitedPattern);
    }
  });

  it('does not expose execution, evidence, readiness, PR-11 or cutover authority', () => {
    const sink = new SecurityInspectionSink();
    const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' }, sink);
    producer.produce(boundedInputs[0]);

    const projection = sink.projections[0];
    expect(projection).not.toHaveProperty('authorized');
    expect(projection).not.toHaveProperty('enabled');
    expect(projection).not.toHaveProperty('ready');
    expect(projection).not.toHaveProperty('evidenceAccepted');
    expect(projection).not.toHaveProperty('pr11Eligible');
    expect(projection).not.toHaveProperty('runtimeCutover');
    expect(projection).not.toHaveProperty('safeForPrimaryDisplay');
  });
});
