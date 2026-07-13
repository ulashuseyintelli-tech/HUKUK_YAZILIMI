import type { Adr014OperationalEvent } from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.events';
import {
  type Adr014BoundaryResult,
  type Adr014BoundaryType,
  type Adr014ControlResult,
  type Adr014CoverageCategory,
  type Adr014CoverageResult,
  type Adr014HealthComponent,
  type Adr014HealthResult,
  type Adr014ManifestEvidenceValidity,
  type Adr014ManifestSourceState,
  type Adr014ObservationFact,
  type Adr014PhaseObservationInput,
  type Adr014SessionState,
  createAdr014BoundaryObservationFact,
  createAdr014ControlObservationFact,
  createAdr014CoverageObservationFact,
  createAdr014HealthObservationFact,
  createAdr014ManifestObservationFact,
  createAdr014PhaseObservationFact,
  createAdr014SessionObservationFact,
} from './adr014-session-observation-facts';

export const ADR014_OBSERVATION_PRODUCER_CONTRACT_VERSION = '1' as const;

export type Adr014ObservationProducerInput =
  | { readonly kind: 'SESSION'; readonly state: Adr014SessionState }
  | ({ readonly kind: 'PHASE' } & Adr014PhaseObservationInput)
  | {
      readonly kind: 'MANIFEST';
      readonly sourceState: Adr014ManifestSourceState;
      readonly evidenceValidity: Adr014ManifestEvidenceValidity;
    }
  | {
      readonly kind: 'COVERAGE';
      readonly category: Adr014CoverageCategory;
      readonly result: Adr014CoverageResult;
    }
  | {
      readonly kind: 'BOUNDARY';
      readonly boundaryType: Adr014BoundaryType;
      readonly result: Adr014BoundaryResult;
    }
  | { readonly kind: 'CONTROL'; readonly result: Adr014ControlResult }
  | {
      readonly kind: 'HEALTH';
      readonly component: Adr014HealthComponent;
      readonly result: Adr014HealthResult;
    };

export type Adr014ObservationMetricProjection =
  | {
      readonly status: 'MAPPED';
      readonly metricName: 'adr014_evidence_session_state';
      readonly metricType: 'GAUGE';
      readonly labels: Readonly<{ session_state: Adr014SessionState }>;
      readonly value: 1;
    }
  | {
      readonly status: 'MAPPED';
      readonly metricName: 'adr014_dataset_manifest_state';
      readonly metricType: 'GAUGE';
      readonly labels: Readonly<{
        source_state: Adr014ManifestSourceState;
        evidence_validity: Adr014ManifestEvidenceValidity;
      }>;
      readonly value: 1;
    }
  | {
      readonly status: 'MAPPED';
      readonly metricName: 'adr014_dataset_coverage_state';
      readonly metricType: 'GAUGE';
      readonly labels: Readonly<{
        coverage_category: Adr014CoverageCategory;
        result: Adr014CoverageResult;
      }>;
      readonly value: 1;
    }
  | {
      readonly status: 'MAPPED';
      readonly metricName: 'adr014_boundary_verification_total';
      readonly metricType: 'COUNTER';
      readonly labels: Readonly<{
        boundary_type: Adr014BoundaryType;
        result: Adr014BoundaryResult;
      }>;
      readonly value: 1;
    }
  | {
      readonly status: 'MAPPED';
      readonly metricName: 'adr014_kill_switch_state';
      readonly metricType: 'GAUGE';
      readonly labels: Readonly<{ result: Adr014ControlResult }>;
      readonly value: 1;
    }
  | {
      readonly status: 'MAPPED';
      readonly metricName: 'adr014_instrumentation_health';
      readonly metricType: 'GAUGE';
      readonly labels: Readonly<{
        component: Adr014HealthComponent;
        result: Adr014HealthResult;
      }>;
      readonly value: 1;
    }
  | {
      readonly status: 'BLOCKED';
      readonly blockerCode: 'PHASE_DURATION_SOURCE_ABSENT';
    };

export type Adr014ObservationEventProjection =
  | { readonly status: 'MAPPED'; readonly event: Adr014OperationalEvent }
  | {
      readonly status: 'BLOCKED';
      readonly blockerCode: 'PE05A2_EVENT_VOCABULARY_UNAVAILABLE';
    };

export interface Adr014ObservationTelemetryProjection {
  readonly contractVersion: typeof ADR014_OBSERVATION_PRODUCER_CONTRACT_VERSION;
  readonly fact: Adr014ObservationFact;
  readonly metric: Adr014ObservationMetricProjection;
  readonly event: Adr014ObservationEventProjection;
  readonly audit: 'OUT_OF_SCOPE';
  readonly evidence: 'OUT_OF_SCOPE';
}

export interface Adr014ObservationTelemetrySink {
  accept(projection: Adr014ObservationTelemetryProjection): void;
}

export interface Adr014ObservationProducer {
  readonly mode: 'DISABLED' | 'TEST_ONLY';
  produce(input: unknown): Adr014ObservationProducerResult;
}

export type Adr014ObservationProducerResult =
  | { readonly status: 'DISABLED' }
  | {
      readonly status: 'PROJECTED';
      readonly projection: Adr014ObservationTelemetryProjection;
    }
  | {
      readonly status: 'FAILED';
      readonly failureCode: 'INVALID_OBSERVATION_INPUT' | 'TELEMETRY_SINK_FAILURE';
    };

export interface Adr014ObservationProducerConfig {
  readonly mode: 'DISABLED' | 'TEST_ONLY';
}

export const ADR014_OBSERVATION_PRODUCER_DEFAULT_CONFIG = Object.freeze({
  mode: 'DISABLED',
} as const satisfies Adr014ObservationProducerConfig);

export const ADR014_NOOP_OBSERVATION_TELEMETRY_SINK: Adr014ObservationTelemetrySink =
  Object.freeze({
    accept: (_projection: Adr014ObservationTelemetryProjection): void => undefined,
  });

const DISABLED_RESULT = Object.freeze({ status: 'DISABLED' } as const);
const INVALID_INPUT_RESULT = Object.freeze({
  status: 'FAILED',
  failureCode: 'INVALID_OBSERVATION_INPUT',
} as const);
const SINK_FAILURE_RESULT = Object.freeze({
  status: 'FAILED',
  failureCode: 'TELEMETRY_SINK_FAILURE',
} as const);
const EVENT_MAPPING_BLOCKED = Object.freeze({
  status: 'BLOCKED',
  blockerCode: 'PE05A2_EVENT_VOCABULARY_UNAVAILABLE',
} as const satisfies Adr014ObservationEventProjection);

const INVALID_INPUT = 'INVALID_ADR014_OBSERVATION_PRODUCER_INPUT';

function invalidInput(): never {
  throw new TypeError(INVALID_INPUT);
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

function createFact(input: unknown): Adr014ObservationFact {
  if (!isObject(input)) return invalidInput();

  const kind = field(input, 'kind');
  switch (kind) {
    case 'SESSION':
      if (!hasExactKeys(input, ['kind', 'state'])) return invalidInput();
      return createAdr014SessionObservationFact(field(input, 'state') as Adr014SessionState);
    case 'PHASE':
      return createPhaseFact(input);
    case 'MANIFEST':
      if (!hasExactKeys(input, ['kind', 'sourceState', 'evidenceValidity'])) {
        return invalidInput();
      }
      return createAdr014ManifestObservationFact(
        field(input, 'sourceState') as Adr014ManifestSourceState,
        field(input, 'evidenceValidity') as Adr014ManifestEvidenceValidity,
      );
    case 'COVERAGE':
      if (!hasExactKeys(input, ['kind', 'category', 'result'])) return invalidInput();
      return createAdr014CoverageObservationFact(
        field(input, 'category') as Adr014CoverageCategory,
        field(input, 'result') as Adr014CoverageResult,
      );
    case 'BOUNDARY':
      if (!hasExactKeys(input, ['kind', 'boundaryType', 'result'])) return invalidInput();
      return createAdr014BoundaryObservationFact(
        field(input, 'boundaryType') as Adr014BoundaryType,
        field(input, 'result') as Adr014BoundaryResult,
      );
    case 'CONTROL':
      if (!hasExactKeys(input, ['kind', 'result'])) return invalidInput();
      return createAdr014ControlObservationFact(field(input, 'result') as Adr014ControlResult);
    case 'HEALTH':
      if (!hasExactKeys(input, ['kind', 'component', 'result'])) return invalidInput();
      return createAdr014HealthObservationFact(
        field(input, 'component') as Adr014HealthComponent,
        field(input, 'result') as Adr014HealthResult,
      );
    default:
      return invalidInput();
  }
}

function createPhaseFact(input: object): Adr014ObservationFact {
  const phase = field(input, 'phase');
  const result = field(input, 'result');

  if (result === 'STARTED') {
    if (!hasExactKeys(input, ['kind', 'phase', 'result'])) return invalidInput();
    return createAdr014PhaseObservationFact({
      phase: phase as Adr014PhaseObservationInput['phase'],
      result,
    });
  }

  if (phase === 'EXECUTION' && result === 'COMPLETED') {
    if (!hasExactKeys(input, ['kind', 'phase', 'result', 'executionOutcome'])) {
      return invalidInput();
    }
    return createAdr014PhaseObservationFact({
      phase,
      result,
      executionOutcome: field(input, 'executionOutcome') as 'SUCCESS',
    });
  }

  if (phase === 'EXECUTION' && result === 'FAILED') {
    if (!hasExactKeys(input, ['kind', 'phase', 'result', 'phaseFailure', 'executionOutcome'])) {
      return invalidInput();
    }
    return createAdr014PhaseObservationFact({
      phase,
      result,
      phaseFailure: field(input, 'phaseFailure') as 'FAILED',
      executionOutcome: field(input, 'executionOutcome') as 'ERROR' | 'TIMEOUT' | 'CANCELLED',
    });
  }

  if ((phase === 'CAPTURE' || phase === 'VALIDATION') && result === 'COMPLETED') {
    if (!hasExactKeys(input, ['kind', 'phase', 'result'])) return invalidInput();
    return createAdr014PhaseObservationFact({ phase, result });
  }

  if ((phase === 'CAPTURE' || phase === 'VALIDATION') && result === 'FAILED') {
    if (!hasExactKeys(input, ['kind', 'phase', 'result', 'phaseFailure'])) {
      return invalidInput();
    }
    return createAdr014PhaseObservationFact({
      phase,
      result,
      phaseFailure: field(input, 'phaseFailure') as 'FAILED',
    });
  }

  return invalidInput();
}

function mappedMetric(
  fact: Adr014ObservationFact,
): Adr014ObservationMetricProjection {
  switch (fact.kind) {
    case 'SESSION':
      return Object.freeze({
        status: 'MAPPED',
        metricName: 'adr014_evidence_session_state',
        metricType: 'GAUGE',
        labels: Object.freeze({ session_state: fact.state }),
        value: 1,
      });
    case 'PHASE':
      return Object.freeze({
        status: 'BLOCKED',
        blockerCode: 'PHASE_DURATION_SOURCE_ABSENT',
      });
    case 'MANIFEST':
      return Object.freeze({
        status: 'MAPPED',
        metricName: 'adr014_dataset_manifest_state',
        metricType: 'GAUGE',
        labels: Object.freeze({
          source_state: fact.sourceState,
          evidence_validity: fact.evidenceValidity,
        }),
        value: 1,
      });
    case 'COVERAGE':
      return Object.freeze({
        status: 'MAPPED',
        metricName: 'adr014_dataset_coverage_state',
        metricType: 'GAUGE',
        labels: Object.freeze({
          coverage_category: fact.category,
          result: fact.result,
        }),
        value: 1,
      });
    case 'BOUNDARY':
      return Object.freeze({
        status: 'MAPPED',
        metricName: 'adr014_boundary_verification_total',
        metricType: 'COUNTER',
        labels: Object.freeze({
          boundary_type: fact.boundaryType,
          result: fact.result,
        }),
        value: 1,
      });
    case 'CONTROL':
      return Object.freeze({
        status: 'MAPPED',
        metricName: 'adr014_kill_switch_state',
        metricType: 'GAUGE',
        labels: Object.freeze({ result: fact.result }),
        value: 1,
      });
    case 'HEALTH':
      return Object.freeze({
        status: 'MAPPED',
        metricName: 'adr014_instrumentation_health',
        metricType: 'GAUGE',
        labels: Object.freeze({
          component: fact.component,
          result: fact.result,
        }),
        value: 1,
      });
    default: {
      const exhaustive: never = fact;
      return exhaustive;
    }
  }
}

function mapFact(fact: Adr014ObservationFact): Adr014ObservationTelemetryProjection {
  return Object.freeze({
    contractVersion: ADR014_OBSERVATION_PRODUCER_CONTRACT_VERSION,
    fact,
    metric: mappedMetric(fact),
    event: EVENT_MAPPING_BLOCKED,
    audit: 'OUT_OF_SCOPE',
    evidence: 'OUT_OF_SCOPE',
  });
}

export function createAdr014ObservationProducer(
  config: Readonly<Adr014ObservationProducerConfig> = ADR014_OBSERVATION_PRODUCER_DEFAULT_CONFIG,
  sink: Adr014ObservationTelemetrySink = ADR014_NOOP_OBSERVATION_TELEMETRY_SINK,
): Adr014ObservationProducer {
  const mode = config.mode === 'TEST_ONLY' ? 'TEST_ONLY' : 'DISABLED';

  return Object.freeze({
    mode,
    produce(input: unknown): Adr014ObservationProducerResult {
      if (mode === 'DISABLED') return DISABLED_RESULT;

      let projection: Adr014ObservationTelemetryProjection;
      try {
        projection = mapFact(createFact(input));
      } catch (_error) {
        return INVALID_INPUT_RESULT;
      }

      try {
        sink.accept(projection);
      } catch (_error) {
        return SINK_FAILURE_RESULT;
      }

      return Object.freeze({ status: 'PROJECTED', projection });
    },
  });
}
