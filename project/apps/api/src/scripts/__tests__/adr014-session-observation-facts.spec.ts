import {
  ADR014_BOUNDARY_RESULTS,
  ADR014_BOUNDARY_TYPES,
  ADR014_CONTROL_RESULTS,
  ADR014_COVERAGE_CATEGORIES,
  ADR014_COVERAGE_RESULTS,
  ADR014_EXECUTION_OUTCOMES,
  ADR014_HEALTH_COMPONENTS,
  ADR014_HEALTH_RESULTS,
  ADR014_MANIFEST_EVIDENCE_VALIDITIES,
  ADR014_MANIFEST_SOURCE_STATES,
  ADR014_OBSERVATION_FACT_KINDS,
  ADR014_OBSERVATION_FACT_PRODUCER_BY_KIND,
  ADR014_OBSERVATION_FACT_PRODUCERS,
  ADR014_PHASE_RESULTS,
  ADR014_PHASES,
  ADR014_SESSION_OBSERVATION_CONTRACT_VERSION,
  ADR014_SESSION_STATES,
  type Adr014ObservationFact,
  type Adr014ObservationFactKind,
  createAdr014BoundaryObservationFact,
  createAdr014ControlObservationFact,
  createAdr014CoverageObservationFact,
  createAdr014HealthObservationFact,
  createAdr014ManifestObservationFact,
  createAdr014PhaseObservationFact,
  createAdr014SessionObservationFact,
} from '../adr014-session-observation-facts';

function exhaustivelyReadFact(fact: Adr014ObservationFact): Adr014ObservationFactKind {
  switch (fact.kind) {
    case 'SESSION':
      return fact.kind;
    case 'PHASE':
      return fact.kind;
    case 'MANIFEST':
      return fact.kind;
    case 'COVERAGE':
      return fact.kind;
    case 'BOUNDARY':
      return fact.kind;
    case 'CONTROL':
      return fact.kind;
    case 'HEALTH':
      return fact.kind;
    default: {
      const exhaustive: never = fact;
      return exhaustive;
    }
  }
}

describe('ADR014-PE-06B1 observation fact contract', () => {
  it('locks the approved bounded vocabularies', () => {
    expect(ADR014_SESSION_OBSERVATION_CONTRACT_VERSION).toBe('1');
    expect(ADR014_OBSERVATION_FACT_KINDS).toEqual([
      'SESSION',
      'PHASE',
      'MANIFEST',
      'COVERAGE',
      'BOUNDARY',
      'CONTROL',
      'HEALTH',
    ]);
    expect(ADR014_PHASES).toEqual(['EXECUTION', 'CAPTURE', 'VALIDATION']);
    expect(ADR014_PHASE_RESULTS).toEqual(['STARTED', 'COMPLETED', 'FAILED']);
    expect(ADR014_EXECUTION_OUTCOMES).toEqual(['SUCCESS', 'ERROR', 'TIMEOUT', 'CANCELLED']);
    expect(ADR014_MANIFEST_SOURCE_STATES).toEqual([
      'ABSENT',
      'DRAFT',
      'APPROVED',
      'SUPERSEDED',
      'INVALID',
    ]);
    expect(ADR014_MANIFEST_EVIDENCE_VALIDITIES).toEqual([
      'VALID',
      'VALID_WITH_WARNING',
      'INCOMPLETE',
      'REJECTED',
      'INVALIDATED',
    ]);
    expect(ADR014_COVERAGE_CATEGORIES).toEqual(['REQUIRED', 'EDGE', 'CURRENCY', 'LIFECYCLE']);
    expect(ADR014_COVERAGE_RESULTS).toEqual([
      'COMPLETE',
      'PARTIAL',
      'MISSING',
      'INVALID',
      'NOT_EVALUATED',
    ]);
    expect(ADR014_BOUNDARY_TYPES).toEqual(['TENANT', 'CLIENT', 'DATASET', 'ENVIRONMENT']);
    expect(ADR014_BOUNDARY_RESULTS).toEqual(['PASS', 'FAIL', 'NOT_EVALUATED']);
    expect(ADR014_CONTROL_RESULTS).toEqual([
      'CONFIGURED',
      'NOT_CONFIGURED',
      'BLOCKED',
      'UNAVAILABLE',
    ]);
    expect(ADR014_HEALTH_COMPONENTS).toEqual(['METRIC', 'LOG', 'AUDIT', 'ALERT']);
    expect(ADR014_HEALTH_RESULTS).toEqual([
      'HEALTHY',
      'DEGRADED',
      'FAILED',
      'UNKNOWN',
      'NOT_CONFIGURED',
    ]);
  });

  it('covers the complete PE-03 session state vocabulary including ABORTED', () => {
    expect(ADR014_SESSION_STATES).toEqual([
      'DRAFT',
      'ENVIRONMENT_VERIFIED',
      'ACCESS_APPROVED',
      'EXECUTION_AUTHORIZED',
      'ACTIVE',
      'CAPTURE_COMPLETE',
      'VALIDATION_PENDING',
      'VALIDATED',
      'CLOSED',
      'REJECTED',
      'ABORTED',
      'INVALIDATED',
    ]);

    for (const state of ADR014_SESSION_STATES) {
      const fact = createAdr014SessionObservationFact(state);
      expect(fact).toEqual({
        contractVersion: '1',
        kind: 'SESSION',
        producer: 'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
        state,
      });
      expect(Object.isFrozen(fact)).toBe(true);
    }
  });

  it('encodes split producer ownership exhaustively by fact kind', () => {
    expect(ADR014_OBSERVATION_FACT_PRODUCER_BY_KIND).toEqual({
      SESSION: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
      PHASE: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
      MANIFEST: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
      COVERAGE: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
      BOUNDARY: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
      CONTROL: ADR014_OBSERVATION_FACT_PRODUCERS.CONTROL_OBSERVER,
      HEALTH: ADR014_OBSERVATION_FACT_PRODUCERS.HEALTH_OBSERVER,
    });
    expect(Object.keys(ADR014_OBSERVATION_FACT_PRODUCER_BY_KIND).sort()).toEqual(
      [...ADR014_OBSERVATION_FACT_KINDS].sort(),
    );
  });

  it.each([
    [{ phase: 'EXECUTION', result: 'STARTED' }],
    [{ phase: 'CAPTURE', result: 'STARTED' }],
    [{ phase: 'VALIDATION', result: 'STARTED' }],
    [{ phase: 'EXECUTION', result: 'COMPLETED', executionOutcome: 'SUCCESS' }],
    [{ phase: 'EXECUTION', result: 'FAILED', phaseFailure: 'FAILED', executionOutcome: 'ERROR' }],
    [{ phase: 'EXECUTION', result: 'FAILED', phaseFailure: 'FAILED', executionOutcome: 'TIMEOUT' }],
    [{ phase: 'EXECUTION', result: 'FAILED', phaseFailure: 'FAILED', executionOutcome: 'CANCELLED' }],
    [{ phase: 'CAPTURE', result: 'COMPLETED' }],
    [{ phase: 'CAPTURE', result: 'FAILED', phaseFailure: 'FAILED' }],
    [{ phase: 'VALIDATION', result: 'COMPLETED' }],
    [{ phase: 'VALIDATION', result: 'FAILED', phaseFailure: 'FAILED' }],
  ] as const)('creates a valid immutable phase fact for %j', (input) => {
    const fact = createAdr014PhaseObservationFact(input);

    expect(fact).toEqual({
      contractVersion: '1',
      kind: 'PHASE',
      producer: 'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
      ...input,
    });
    expect(Object.isFrozen(fact)).toBe(true);
  });

  it.each([
    [{ phase: 'EXECUTION', result: 'COMPLETED' }],
    [{ phase: 'EXECUTION', result: 'COMPLETED', executionOutcome: 'TIMEOUT' }],
    [{ phase: 'EXECUTION', result: 'FAILED', phaseFailure: 'FAILED', executionOutcome: 'SUCCESS' }],
    [{ phase: 'CAPTURE', result: 'FAILED' }],
    [{ phase: 'CAPTURE', result: 'COMPLETED', executionOutcome: 'SUCCESS' }],
  ])('rejects an invalid phase/outcome combination without inference: %j', (input) => {
    expect(() => createAdr014PhaseObservationFact(input as never)).toThrow(
      'INVALID_ADR014_OBSERVATION_FACT',
    );
  });

  it('creates bounded manifest, coverage, boundary, control and health facts', () => {
    const facts: readonly Adr014ObservationFact[] = [
      createAdr014ManifestObservationFact('APPROVED', 'VALID'),
      createAdr014CoverageObservationFact('CURRENCY', 'PARTIAL'),
      createAdr014BoundaryObservationFact('TENANT', 'PASS'),
      createAdr014ControlObservationFact('NOT_CONFIGURED'),
      createAdr014HealthObservationFact('AUDIT', 'UNKNOWN'),
    ];

    expect(facts).toEqual([
      {
        contractVersion: '1',
        kind: 'MANIFEST',
        producer: 'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
        sourceState: 'APPROVED',
        evidenceValidity: 'VALID',
      },
      {
        contractVersion: '1',
        kind: 'COVERAGE',
        producer: 'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
        category: 'CURRENCY',
        result: 'PARTIAL',
      },
      {
        contractVersion: '1',
        kind: 'BOUNDARY',
        producer: 'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
        boundaryType: 'TENANT',
        result: 'PASS',
      },
      {
        contractVersion: '1',
        kind: 'CONTROL',
        producer: 'ADR014_CONTROL_OBSERVER',
        result: 'NOT_CONFIGURED',
      },
      {
        contractVersion: '1',
        kind: 'HEALTH',
        producer: 'ADR014_INSTRUMENTATION_HEALTH_OBSERVER',
        component: 'AUDIT',
        result: 'UNKNOWN',
      },
    ]);
    expect(facts.every(Object.isFrozen)).toBe(true);
    expect(facts.map(exhaustivelyReadFact)).toEqual([
      'MANIFEST',
      'COVERAGE',
      'BOUNDARY',
      'CONTROL',
      'HEALTH',
    ]);
  });

  it('is deterministic and independent of clock, randomness and environment state', () => {
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now must not be used');
    });
    const randomSpy = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });
    const previous = process.env.ADR014_OBSERVATION_ENABLED;
    process.env.ADR014_OBSERVATION_ENABLED = 'true';

    try {
      const first = createAdr014CoverageObservationFact('REQUIRED', 'NOT_EVALUATED');
      const second = createAdr014CoverageObservationFact('REQUIRED', 'NOT_EVALUATED');
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      expect(dateSpy).not.toHaveBeenCalled();
      expect(randomSpy).not.toHaveBeenCalled();
    } finally {
      dateSpy.mockRestore();
      randomSpy.mockRestore();
      if (previous === undefined) delete process.env.ADR014_OBSERVATION_ENABLED;
      else process.env.ADR014_OBSERVATION_ENABLED = previous;
    }
  });
});
