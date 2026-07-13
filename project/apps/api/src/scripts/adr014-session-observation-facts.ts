export const ADR014_SESSION_OBSERVATION_CONTRACT_VERSION = '1' as const;

export const ADR014_OBSERVATION_FACT_KINDS = Object.freeze([
  'SESSION',
  'PHASE',
  'MANIFEST',
  'COVERAGE',
  'BOUNDARY',
  'CONTROL',
  'HEALTH',
] as const);

export const ADR014_OBSERVATION_FACT_PRODUCERS = Object.freeze({
  SESSION_ORCHESTRATOR: 'ADR014_LOCAL_EVIDENCE_SESSION_ORCHESTRATOR',
  CONTROL_OBSERVER: 'ADR014_CONTROL_OBSERVER',
  HEALTH_OBSERVER: 'ADR014_INSTRUMENTATION_HEALTH_OBSERVER',
} as const);

export const ADR014_SESSION_STATES = Object.freeze([
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
] as const);

export const ADR014_PHASES = Object.freeze(['EXECUTION', 'CAPTURE', 'VALIDATION'] as const);
export const ADR014_PHASE_RESULTS = Object.freeze(['STARTED', 'COMPLETED', 'FAILED'] as const);
export const ADR014_EXECUTION_OUTCOMES = Object.freeze([
  'SUCCESS',
  'ERROR',
  'TIMEOUT',
  'CANCELLED',
] as const);
export const ADR014_MANIFEST_SOURCE_STATES = Object.freeze([
  'ABSENT',
  'DRAFT',
  'APPROVED',
  'SUPERSEDED',
  'INVALID',
] as const);
export const ADR014_MANIFEST_EVIDENCE_VALIDITIES = Object.freeze([
  'VALID',
  'VALID_WITH_WARNING',
  'INCOMPLETE',
  'REJECTED',
  'INVALIDATED',
] as const);
export const ADR014_COVERAGE_CATEGORIES = Object.freeze([
  'REQUIRED',
  'EDGE',
  'CURRENCY',
  'LIFECYCLE',
] as const);
export const ADR014_COVERAGE_RESULTS = Object.freeze([
  'COMPLETE',
  'PARTIAL',
  'MISSING',
  'INVALID',
  'NOT_EVALUATED',
] as const);
export const ADR014_BOUNDARY_TYPES = Object.freeze([
  'TENANT',
  'CLIENT',
  'DATASET',
  'ENVIRONMENT',
] as const);
export const ADR014_BOUNDARY_RESULTS = Object.freeze(['PASS', 'FAIL', 'NOT_EVALUATED'] as const);
export const ADR014_CONTROL_RESULTS = Object.freeze([
  'CONFIGURED',
  'NOT_CONFIGURED',
  'BLOCKED',
  'UNAVAILABLE',
] as const);
export const ADR014_HEALTH_COMPONENTS = Object.freeze(['METRIC', 'LOG', 'AUDIT', 'ALERT'] as const);
export const ADR014_HEALTH_RESULTS = Object.freeze([
  'HEALTHY',
  'DEGRADED',
  'FAILED',
  'UNKNOWN',
  'NOT_CONFIGURED',
] as const);

export type Adr014ObservationFactKind = (typeof ADR014_OBSERVATION_FACT_KINDS)[number];
export type Adr014ObservationFactProducer =
  (typeof ADR014_OBSERVATION_FACT_PRODUCERS)[keyof typeof ADR014_OBSERVATION_FACT_PRODUCERS];
export type Adr014SessionState = (typeof ADR014_SESSION_STATES)[number];
export type Adr014Phase = (typeof ADR014_PHASES)[number];
export type Adr014PhaseResult = (typeof ADR014_PHASE_RESULTS)[number];
export type Adr014ExecutionOutcome = (typeof ADR014_EXECUTION_OUTCOMES)[number];
export type Adr014ManifestSourceState = (typeof ADR014_MANIFEST_SOURCE_STATES)[number];
export type Adr014ManifestEvidenceValidity = (typeof ADR014_MANIFEST_EVIDENCE_VALIDITIES)[number];
export type Adr014CoverageCategory = (typeof ADR014_COVERAGE_CATEGORIES)[number];
export type Adr014CoverageResult = (typeof ADR014_COVERAGE_RESULTS)[number];
export type Adr014BoundaryType = (typeof ADR014_BOUNDARY_TYPES)[number];
export type Adr014BoundaryResult = (typeof ADR014_BOUNDARY_RESULTS)[number];
export type Adr014ControlResult = (typeof ADR014_CONTROL_RESULTS)[number];
export type Adr014HealthComponent = (typeof ADR014_HEALTH_COMPONENTS)[number];
export type Adr014HealthResult = (typeof ADR014_HEALTH_RESULTS)[number];

export const ADR014_OBSERVATION_FACT_PRODUCER_BY_KIND = Object.freeze({
  SESSION: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
  PHASE: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
  MANIFEST: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
  COVERAGE: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
  BOUNDARY: ADR014_OBSERVATION_FACT_PRODUCERS.SESSION_ORCHESTRATOR,
  CONTROL: ADR014_OBSERVATION_FACT_PRODUCERS.CONTROL_OBSERVER,
  HEALTH: ADR014_OBSERVATION_FACT_PRODUCERS.HEALTH_OBSERVER,
} as const satisfies Record<Adr014ObservationFactKind, Adr014ObservationFactProducer>);

type Adr014ProducerFor<K extends Adr014ObservationFactKind> =
  (typeof ADR014_OBSERVATION_FACT_PRODUCER_BY_KIND)[K];

interface Adr014ObservationFactBase<K extends Adr014ObservationFactKind> {
  readonly contractVersion: typeof ADR014_SESSION_OBSERVATION_CONTRACT_VERSION;
  readonly kind: K;
  readonly producer: Adr014ProducerFor<K>;
}

export interface Adr014SessionObservationFact extends Adr014ObservationFactBase<'SESSION'> {
  readonly state: Adr014SessionState;
}

export type Adr014PhaseObservationInput =
  | { readonly phase: Adr014Phase; readonly result: 'STARTED' }
  | { readonly phase: 'EXECUTION'; readonly result: 'COMPLETED'; readonly executionOutcome: 'SUCCESS' }
  | {
      readonly phase: 'EXECUTION';
      readonly result: 'FAILED';
      readonly phaseFailure: 'FAILED';
      readonly executionOutcome: Exclude<Adr014ExecutionOutcome, 'SUCCESS'>;
    }
  | { readonly phase: Exclude<Adr014Phase, 'EXECUTION'>; readonly result: 'COMPLETED' }
  | {
      readonly phase: Exclude<Adr014Phase, 'EXECUTION'>;
      readonly result: 'FAILED';
      readonly phaseFailure: 'FAILED';
    };

export type Adr014PhaseObservationFact = Adr014ObservationFactBase<'PHASE'> & Adr014PhaseObservationInput;

export interface Adr014ManifestObservationFact extends Adr014ObservationFactBase<'MANIFEST'> {
  readonly sourceState: Adr014ManifestSourceState;
  readonly evidenceValidity: Adr014ManifestEvidenceValidity;
}

export interface Adr014CoverageObservationFact extends Adr014ObservationFactBase<'COVERAGE'> {
  readonly category: Adr014CoverageCategory;
  readonly result: Adr014CoverageResult;
}

export interface Adr014BoundaryObservationFact extends Adr014ObservationFactBase<'BOUNDARY'> {
  readonly boundaryType: Adr014BoundaryType;
  readonly result: Adr014BoundaryResult;
}

export interface Adr014ControlObservationFact extends Adr014ObservationFactBase<'CONTROL'> {
  readonly result: Adr014ControlResult;
}

export interface Adr014HealthObservationFact extends Adr014ObservationFactBase<'HEALTH'> {
  readonly component: Adr014HealthComponent;
  readonly result: Adr014HealthResult;
}

export type Adr014ObservationFact =
  | Adr014SessionObservationFact
  | Adr014PhaseObservationFact
  | Adr014ManifestObservationFact
  | Adr014CoverageObservationFact
  | Adr014BoundaryObservationFact
  | Adr014ControlObservationFact
  | Adr014HealthObservationFact;

const INVALID_FACT = 'INVALID_ADR014_OBSERVATION_FACT';

function invalidFact(): never {
  throw new TypeError(INVALID_FACT);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(value: object, key: string): unknown {
  return Reflect.get(value, key);
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isBoundedValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function factBase<K extends Adr014ObservationFactKind>(kind: K): Adr014ObservationFactBase<K> {
  return {
    contractVersion: ADR014_SESSION_OBSERVATION_CONTRACT_VERSION,
    kind,
    producer: ADR014_OBSERVATION_FACT_PRODUCER_BY_KIND[kind],
  };
}

export function createAdr014SessionObservationFact(state: Adr014SessionState): Adr014SessionObservationFact {
  if (!isBoundedValue(ADR014_SESSION_STATES, state)) return invalidFact();
  return Object.freeze({ ...factBase('SESSION'), state });
}

export function createAdr014PhaseObservationFact(
  input: Readonly<Adr014PhaseObservationInput>,
): Adr014PhaseObservationFact {
  if (!isObject(input)) return invalidFact();

  const phase = field(input, 'phase');
  const result = field(input, 'result');
  if (!isBoundedValue(ADR014_PHASES, phase) || !isBoundedValue(ADR014_PHASE_RESULTS, result)) {
    return invalidFact();
  }

  if (result === 'STARTED') {
    if (!hasExactKeys(input, ['phase', 'result'])) return invalidFact();
    return Object.freeze({ ...factBase('PHASE'), phase, result });
  }

  if (phase === 'EXECUTION' && result === 'COMPLETED') {
    const executionOutcome = field(input, 'executionOutcome');
    if (
      !hasExactKeys(input, ['phase', 'result', 'executionOutcome']) ||
      executionOutcome !== 'SUCCESS'
    ) {
      return invalidFact();
    }
    return Object.freeze({ ...factBase('PHASE'), phase, result, executionOutcome });
  }

  if (phase === 'EXECUTION' && result === 'FAILED') {
    const phaseFailure = field(input, 'phaseFailure');
    const executionOutcome = field(input, 'executionOutcome');
    if (
      !hasExactKeys(input, ['phase', 'result', 'phaseFailure', 'executionOutcome']) ||
      phaseFailure !== 'FAILED' ||
      !isBoundedValue(ADR014_EXECUTION_OUTCOMES, executionOutcome) ||
      executionOutcome === 'SUCCESS'
    ) {
      return invalidFact();
    }
    return Object.freeze({
      ...factBase('PHASE'),
      phase,
      result,
      phaseFailure,
      executionOutcome,
    });
  }

  if (phase !== 'EXECUTION' && result === 'COMPLETED') {
    if (!hasExactKeys(input, ['phase', 'result'])) return invalidFact();
    return Object.freeze({ ...factBase('PHASE'), phase, result });
  }

  if (phase !== 'EXECUTION' && result === 'FAILED') {
    const phaseFailure = field(input, 'phaseFailure');
    if (!hasExactKeys(input, ['phase', 'result', 'phaseFailure']) || phaseFailure !== 'FAILED') {
      return invalidFact();
    }
    return Object.freeze({ ...factBase('PHASE'), phase, result, phaseFailure });
  }

  return invalidFact();
}

export function createAdr014ManifestObservationFact(
  sourceState: Adr014ManifestSourceState,
  evidenceValidity: Adr014ManifestEvidenceValidity,
): Adr014ManifestObservationFact {
  if (
    !isBoundedValue(ADR014_MANIFEST_SOURCE_STATES, sourceState) ||
    !isBoundedValue(ADR014_MANIFEST_EVIDENCE_VALIDITIES, evidenceValidity)
  ) {
    return invalidFact();
  }
  return Object.freeze({ ...factBase('MANIFEST'), sourceState, evidenceValidity });
}

export function createAdr014CoverageObservationFact(
  category: Adr014CoverageCategory,
  result: Adr014CoverageResult,
): Adr014CoverageObservationFact {
  if (
    !isBoundedValue(ADR014_COVERAGE_CATEGORIES, category) ||
    !isBoundedValue(ADR014_COVERAGE_RESULTS, result)
  ) {
    return invalidFact();
  }
  return Object.freeze({ ...factBase('COVERAGE'), category, result });
}

export function createAdr014BoundaryObservationFact(
  boundaryType: Adr014BoundaryType,
  result: Adr014BoundaryResult,
): Adr014BoundaryObservationFact {
  if (
    !isBoundedValue(ADR014_BOUNDARY_TYPES, boundaryType) ||
    !isBoundedValue(ADR014_BOUNDARY_RESULTS, result)
  ) {
    return invalidFact();
  }
  return Object.freeze({ ...factBase('BOUNDARY'), boundaryType, result });
}

export function createAdr014ControlObservationFact(result: Adr014ControlResult): Adr014ControlObservationFact {
  if (!isBoundedValue(ADR014_CONTROL_RESULTS, result)) return invalidFact();
  return Object.freeze({ ...factBase('CONTROL'), result });
}

export function createAdr014HealthObservationFact(
  component: Adr014HealthComponent,
  result: Adr014HealthResult,
): Adr014HealthObservationFact {
  if (
    !isBoundedValue(ADR014_HEALTH_COMPONENTS, component) ||
    !isBoundedValue(ADR014_HEALTH_RESULTS, result)
  ) {
    return invalidFact();
  }
  return Object.freeze({ ...factBase('HEALTH'), component, result });
}
