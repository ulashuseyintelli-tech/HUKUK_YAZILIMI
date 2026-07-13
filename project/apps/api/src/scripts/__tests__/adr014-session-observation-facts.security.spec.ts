import * as observation from '../adr014-session-observation-facts';
import {
  createAdr014BoundaryObservationFact,
  createAdr014ControlObservationFact,
  createAdr014CoverageObservationFact,
  createAdr014HealthObservationFact,
  createAdr014ManifestObservationFact,
  createAdr014PhaseObservationFact,
  createAdr014SessionObservationFact,
} from '../adr014-session-observation-facts';

const INVALID_FACT = 'INVALID_ADR014_OBSERVATION_FACT';

describe('ADR014-PE-06B1 observation fact security boundary', () => {
  it('exports only bounded vocabulary, producer ownership and pure factories', () => {
    expect(Object.keys(observation).sort()).toEqual([
      'ADR014_BOUNDARY_RESULTS',
      'ADR014_BOUNDARY_TYPES',
      'ADR014_CONTROL_RESULTS',
      'ADR014_COVERAGE_CATEGORIES',
      'ADR014_COVERAGE_RESULTS',
      'ADR014_EXECUTION_OUTCOMES',
      'ADR014_HEALTH_COMPONENTS',
      'ADR014_HEALTH_RESULTS',
      'ADR014_MANIFEST_EVIDENCE_VALIDITIES',
      'ADR014_MANIFEST_SOURCE_STATES',
      'ADR014_OBSERVATION_FACT_KINDS',
      'ADR014_OBSERVATION_FACT_PRODUCERS',
      'ADR014_OBSERVATION_FACT_PRODUCER_BY_KIND',
      'ADR014_PHASE_RESULTS',
      'ADR014_PHASES',
      'ADR014_SESSION_OBSERVATION_CONTRACT_VERSION',
      'ADR014_SESSION_STATES',
      'createAdr014BoundaryObservationFact',
      'createAdr014ControlObservationFact',
      'createAdr014CoverageObservationFact',
      'createAdr014HealthObservationFact',
      'createAdr014ManifestObservationFact',
      'createAdr014PhaseObservationFact',
      'createAdr014SessionObservationFact',
    ].sort());

    for (const value of Object.values(observation)) {
      if (typeof value !== 'function' && typeof value !== 'string') {
        expect(Object.isFrozen(value)).toBe(true);
      }
    }
    expect(observation).not.toHaveProperty('main');
  });

  it.each([
    () => createAdr014SessionObservationFact('tenant-raw-id' as never),
    () => createAdr014ManifestObservationFact('case-raw-id' as never, 'VALID'),
    () => createAdr014ManifestObservationFact('APPROVED', 'person-raw-id' as never),
    () => createAdr014CoverageObservationFact('client-raw-id' as never, 'COMPLETE'),
    () => createAdr014CoverageObservationFact('REQUIRED', '125000' as never),
    () => createAdr014BoundaryObservationFact('dataset-raw-id' as never, 'PASS'),
    () => createAdr014BoundaryObservationFact('TENANT', 'raw-error-text' as never),
    () => createAdr014ControlObservationFact('ENABLED' as never),
    () => createAdr014HealthObservationFact('METRIC', 'sensitive-stack' as never),
  ])('rejects an unbounded or authority-ambiguous runtime value', (factory) => {
    expect(factory).toThrow(INVALID_FACT);
  });

  it('rejects arbitrary phase metadata instead of echoing it', () => {
    const input = {
      phase: 'EXECUTION',
      result: 'STARTED',
      sessionReference: 'adr014-ref:v1:session:sensitive',
      tenantId: 'tenant-raw-id',
      amount: 125000,
      metadata: { arbitrary: true },
    };

    expect(() => createAdr014PhaseObservationFact(input as never)).toThrow(INVALID_FACT);
  });

  it('produces facts with no identifier, correlation, financial or free-text fields', () => {
    const facts = [
      createAdr014SessionObservationFact('DRAFT'),
      createAdr014PhaseObservationFact({ phase: 'EXECUTION', result: 'STARTED' }),
      createAdr014ManifestObservationFact('ABSENT', 'INCOMPLETE'),
      createAdr014CoverageObservationFact('REQUIRED', 'NOT_EVALUATED'),
      createAdr014BoundaryObservationFact('CLIENT', 'NOT_EVALUATED'),
      createAdr014ControlObservationFact('BLOCKED'),
      createAdr014HealthObservationFact('ALERT', 'NOT_CONFIGURED'),
    ];

    const prohibitedKeys = [
      'sessionReference',
      'manifestReference',
      'correlationReference',
      'canonicalSha',
      'tenantId',
      'clientId',
      'caseId',
      'debtorId',
      'creditorId',
      'personId',
      'amount',
      'principal',
      'interest',
      'fee',
      'rawError',
      'stack',
      'reason',
      'metadata',
    ];

    for (const fact of facts) {
      for (const key of prohibitedKeys) expect(fact).not.toHaveProperty(key);
    }
  });

  it('does not promote PE-06A PREPARED into execution, evidence or cutover authority', () => {
    const facts = [
      createAdr014SessionObservationFact('DRAFT'),
      createAdr014ControlObservationFact('NOT_CONFIGURED'),
      createAdr014HealthObservationFact('METRIC', 'UNKNOWN'),
    ];

    for (const fact of facts) {
      expect(fact).not.toHaveProperty('enabled');
      expect(fact).not.toHaveProperty('prepared');
      expect(fact).not.toHaveProperty('authorized');
      expect(fact).not.toHaveProperty('ready');
      expect(fact).not.toHaveProperty('evidenceAccepted');
      expect(fact).not.toHaveProperty('pr11Eligible');
      expect(fact).not.toHaveProperty('runtimeCutover');
      expect(fact).not.toHaveProperty('safeForPrimaryDisplay');
    }
  });
});
