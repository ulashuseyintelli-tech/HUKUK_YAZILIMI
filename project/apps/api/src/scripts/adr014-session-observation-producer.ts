import {
  type Adr014OperationalEventSeverity,
  type Adr014SessionControlEvent,
  type Adr014SessionControlEventComponent,
  type Adr014SessionControlEventContext,
  type Adr014SessionControlEventFailureCode,
  type Adr014SessionControlEventOperation,
  type Adr014SessionControlEventResult,
  type Adr014SessionControlEventType,
  buildAdr014SessionControlEvent,
  isAdr014SessionControlEventContext,
} from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.events';
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
  type Adr014ObservationFactKind,
  type Adr014PhaseObservationInput,
  type Adr014PhaseObservationFact,
  type Adr014SessionState,
  createAdr014BoundaryObservationFact,
  createAdr014ControlObservationFact,
  createAdr014CoverageObservationFact,
  createAdr014HealthObservationFact,
  createAdr014ManifestObservationFact,
  createAdr014PhaseObservationFact,
  createAdr014SessionObservationFact,
} from './adr014-session-observation-facts';

export const ADR014_OBSERVATION_PRODUCER_CONTRACT_VERSION = '2' as const;

export const ADR014_OBSERVATION_FACT_EVENT_DISPOSITIONS = Object.freeze({
  SESSION: 'MAPPED',
  PHASE: 'MAPPED',
  MANIFEST: 'MAPPED',
  COVERAGE: 'MAPPED',
  BOUNDARY: 'MAPPED',
  CONTROL: 'MAPPED',
  HEALTH: 'MAPPED',
} as const satisfies Record<Adr014ObservationFactKind, 'MAPPED'>);

export interface Adr014ObservationProjectionContext {
  readonly event: Adr014SessionControlEventContext;
  readonly phaseDurationSeconds?: number;
}

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
      readonly status: 'MAPPED';
      readonly metricName: 'adr014_evidence_sessions_total';
      readonly metricType: 'COUNTER';
      readonly labels: Readonly<{
        result: 'STARTED' | 'COMPLETED' | 'ABORTED' | 'INVALIDATED' | 'FAILED';
      }>;
      readonly value: 1;
    }
  | {
      readonly status: 'MAPPED';
      readonly metricName: 'adr014_evidence_phase_duration_seconds';
      readonly metricType: 'HISTOGRAM';
      readonly labels: Readonly<{
        phase: Adr014PhaseObservationFact['phase'];
        result: 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';
      }>;
      readonly value: number;
    }
  | {
      readonly status: 'VOCABULARY_ONLY';
      readonly reasonCode: 'PHASE_DURATION_TERMINAL_FACT_REQUIRED';
    }
  | {
      readonly status: 'BLOCKED_WITH_REASON';
      readonly blockerCode: 'PHASE_DURATION_CONTEXT_ABSENT' | 'INVALID_PHASE_DURATION_CONTEXT';
    };

export type Adr014ObservationEventProjection =
  | { readonly status: 'MAPPED'; readonly event: Adr014SessionControlEvent }
  | {
      readonly status: 'BLOCKED_WITH_REASON';
      readonly blockerCode:
        | 'SESSION_CONTROL_EVENT_CONTEXT_ABSENT'
        | 'INVALID_SESSION_CONTROL_EVENT_CONTEXT';
    };

export type Adr014SourceAbsentMetricContract = Readonly<{
  status: 'BLOCKED_WITH_REASON';
  metricName: 'adr014_execution_requests_total' | 'adr014_control_events_total';
  blockerCode: 'EXECUTION_REQUEST_SOURCE_ABSENT' | 'CONTROL_EVENT_SOURCE_ABSENT';
}>;

export const ADR014_SOURCE_ABSENT_METRIC_CONTRACTS = Object.freeze([
  Object.freeze({
    status: 'BLOCKED_WITH_REASON',
    metricName: 'adr014_execution_requests_total',
    blockerCode: 'EXECUTION_REQUEST_SOURCE_ABSENT',
  }),
  Object.freeze({
    status: 'BLOCKED_WITH_REASON',
    metricName: 'adr014_control_events_total',
    blockerCode: 'CONTROL_EVENT_SOURCE_ABSENT',
  }),
] as const satisfies readonly Adr014SourceAbsentMetricContract[]);

export interface Adr014ObservationTelemetryProjection {
  readonly contractVersion: typeof ADR014_OBSERVATION_PRODUCER_CONTRACT_VERSION;
  readonly fact: Adr014ObservationFact;
  readonly metric: Adr014ObservationMetricProjection;
  readonly additionalMetrics: readonly Adr014ObservationMetricProjection[];
  readonly event: Adr014ObservationEventProjection;
  readonly audit: 'OUT_OF_SCOPE';
  readonly evidence: 'OUT_OF_SCOPE';
}

export interface Adr014ObservationTelemetrySink {
  accept(projection: Adr014ObservationTelemetryProjection): void;
}

export interface Adr014ObservationProducer {
  readonly mode: 'DISABLED' | 'TEST_ONLY';
  produce(input: unknown, context?: unknown): Adr014ObservationProducerResult;
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
const EVENT_CONTEXT_ABSENT = Object.freeze({
  status: 'BLOCKED_WITH_REASON',
  blockerCode: 'SESSION_CONTROL_EVENT_CONTEXT_ABSENT',
} as const satisfies Adr014ObservationEventProjection);
const INVALID_EVENT_CONTEXT = Object.freeze({
  status: 'BLOCKED_WITH_REASON',
  blockerCode: 'INVALID_SESSION_CONTROL_EVENT_CONTEXT',
} as const satisfies Adr014ObservationEventProjection);
const NO_ADDITIONAL_METRICS = Object.freeze([]) as readonly Adr014ObservationMetricProjection[];

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

function phaseDurationMetric(
  fact: Adr014PhaseObservationFact,
  context: Adr014ObservationProjectionContext | undefined,
): Adr014ObservationMetricProjection {
  if (fact.result === 'STARTED') {
    return Object.freeze({
      status: 'VOCABULARY_ONLY',
      reasonCode: 'PHASE_DURATION_TERMINAL_FACT_REQUIRED',
    });
  }

  const duration = context?.phaseDurationSeconds;
  if (duration === undefined) {
    return Object.freeze({
      status: 'BLOCKED_WITH_REASON',
      blockerCode: 'PHASE_DURATION_CONTEXT_ABSENT',
    });
  }
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
    return Object.freeze({
      status: 'BLOCKED_WITH_REASON',
      blockerCode: 'INVALID_PHASE_DURATION_CONTEXT',
    });
  }

  const result =
    fact.result === 'COMPLETED'
      ? 'COMPLETED'
      : fact.phase === 'EXECUTION' && fact.executionOutcome === 'TIMEOUT'
        ? 'TIMEOUT'
        : fact.phase === 'EXECUTION' && fact.executionOutcome === 'CANCELLED'
          ? 'CANCELLED'
          : 'FAILED';

  return Object.freeze({
    status: 'MAPPED',
    metricName: 'adr014_evidence_phase_duration_seconds',
    metricType: 'HISTOGRAM',
    labels: Object.freeze({ phase: fact.phase, result }),
    value: duration,
  });
}

function mappedMetric(
  fact: Adr014ObservationFact,
  context: Adr014ObservationProjectionContext | undefined,
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
      return phaseDurationMetric(fact, context);
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

function additionalMetrics(fact: Adr014ObservationFact): readonly Adr014ObservationMetricProjection[] {
  if (fact.kind !== 'SESSION') return NO_ADDITIONAL_METRICS;

  const result =
    fact.state === 'ACTIVE'
      ? 'STARTED'
      : fact.state === 'CLOSED'
        ? 'COMPLETED'
        : fact.state === 'ABORTED'
          ? 'ABORTED'
          : fact.state === 'INVALIDATED'
            ? 'INVALIDATED'
            : fact.state === 'REJECTED'
              ? 'FAILED'
              : undefined;

  if (result === undefined) return NO_ADDITIONAL_METRICS;
  return Object.freeze([
    Object.freeze({
      status: 'MAPPED',
      metricName: 'adr014_evidence_sessions_total',
      metricType: 'COUNTER',
      labels: Object.freeze({ result }),
      value: 1,
    }),
  ]);
}

interface Adr014EventMapping {
  readonly eventType: Adr014SessionControlEventType;
  readonly severity: Adr014OperationalEventSeverity;
  readonly component: Adr014SessionControlEventComponent;
  readonly operation: Adr014SessionControlEventOperation;
  readonly result: Adr014SessionControlEventResult;
  readonly failureCode: Adr014SessionControlEventFailureCode;
}

function sessionEventMapping(state: Adr014SessionState): Adr014EventMapping {
  const byState = {
    DRAFT: ['ADR014_SESSION_REQUESTED', 'INFO', 'OBSERVED', 'NONE'],
    ENVIRONMENT_VERIFIED: ['ADR014_SESSION_ENVIRONMENT_VERIFIED', 'INFO', 'SUCCESS', 'NONE'],
    ACCESS_APPROVED: ['ADR014_SESSION_ACCESS_STATE_OBSERVED', 'INFO', 'OBSERVED', 'NONE'],
    EXECUTION_AUTHORIZED: [
      'ADR014_SESSION_EXECUTION_AUTH_STATE_OBSERVED',
      'INFO',
      'OBSERVED',
      'NONE',
    ],
    ACTIVE: ['ADR014_SESSION_STARTED', 'INFO', 'STARTED', 'NONE'],
    CAPTURE_COMPLETE: ['ADR014_SESSION_CAPTURE_COMPLETED', 'INFO', 'COMPLETED', 'NONE'],
    VALIDATION_PENDING: ['ADR014_SESSION_VALIDATION_STARTED', 'INFO', 'STARTED', 'NONE'],
    VALIDATED: ['ADR014_SESSION_VALIDATED', 'INFO', 'SUCCESS', 'NONE'],
    CLOSED: ['ADR014_SESSION_CLOSED', 'INFO', 'COMPLETED', 'NONE'],
    REJECTED: ['ADR014_SESSION_REJECTED', 'CRITICAL', 'REJECTED', 'REQUEST_REJECTED'],
    ABORTED: ['ADR014_SESSION_ABORTED', 'CRITICAL', 'ABORTED', 'SESSION_ABORTED'],
    INVALIDATED: ['ADR014_SESSION_INVALIDATED', 'HARD_STOP', 'INVALIDATED', 'SESSION_INVALIDATED'],
  } as const satisfies Record<
    Adr014SessionState,
    readonly [
      Adr014SessionControlEventType,
      Adr014OperationalEventSeverity,
      Adr014SessionControlEventResult,
      Adr014SessionControlEventFailureCode,
    ]
  >;
  const [eventType, severity, result, failureCode] = byState[state];
  return { eventType, severity, component: 'SESSION', operation: 'OBSERVE_SESSION', result, failureCode };
}

function phaseEventMapping(fact: Adr014PhaseObservationFact): Adr014EventMapping {
  if (fact.result === 'STARTED') {
    return {
      eventType: 'ADR014_PHASE_STARTED', severity: 'INFO', component: 'PHASE',
      operation: 'OBSERVE_PHASE', result: 'STARTED', failureCode: 'NONE',
    };
  }
  if (fact.result === 'COMPLETED') {
    return {
      eventType: 'ADR014_PHASE_COMPLETED', severity: 'INFO', component: 'PHASE',
      operation: 'OBSERVE_PHASE', result: fact.phase === 'EXECUTION' ? 'SUCCESS' : 'COMPLETED',
      failureCode: 'NONE',
    };
  }
  if (fact.phase === 'EXECUTION' && fact.executionOutcome === 'TIMEOUT') {
    return {
      eventType: 'ADR014_PHASE_TIMEOUT', severity: 'CRITICAL', component: 'PHASE',
      operation: 'OBSERVE_PHASE', result: 'TIMEOUT', failureCode: 'PHASE_TIMEOUT',
    };
  }
  if (fact.phase === 'EXECUTION' && fact.executionOutcome === 'CANCELLED') {
    return {
      eventType: 'ADR014_PHASE_CANCELLED', severity: 'CRITICAL', component: 'PHASE',
      operation: 'OBSERVE_PHASE', result: 'CANCELLED', failureCode: 'PHASE_CANCELLED',
    };
  }
  return {
    eventType: 'ADR014_PHASE_FAILED', severity: 'CRITICAL', component: 'PHASE',
    operation: 'OBSERVE_PHASE', result: fact.phase === 'EXECUTION' ? 'ERROR' : 'FAILED',
    failureCode: 'PHASE_PROCESSING_ERROR',
  };
}

function manifestEventMapping(fact: Extract<Adr014ObservationFact, { kind: 'MANIFEST' }>): Adr014EventMapping {
  let severity: Adr014OperationalEventSeverity = 'INFO';
  let result: Adr014SessionControlEventResult = 'OBSERVED';
  let failureCode: Adr014SessionControlEventFailureCode = 'NONE';

  if (fact.evidenceValidity === 'REJECTED') {
    severity = 'HARD_STOP'; result = 'REJECTED'; failureCode = 'MANIFEST_REJECTED';
  } else if (fact.evidenceValidity === 'INVALIDATED') {
    severity = 'HARD_STOP'; result = 'INVALIDATED'; failureCode = 'SESSION_INVALIDATED';
  } else if (fact.evidenceValidity === 'INCOMPLETE') {
    severity = 'CRITICAL'; result = 'BLOCKED'; failureCode = 'SOURCE_UNAVAILABLE';
  } else if (fact.sourceState === 'ABSENT') {
    severity = 'HARD_STOP'; result = 'BLOCKED'; failureCode = 'MANIFEST_ABSENT';
  } else if (fact.sourceState === 'INVALID') {
    severity = 'HARD_STOP'; result = 'FAILED'; failureCode = 'MANIFEST_INVALID';
  } else if (fact.evidenceValidity === 'VALID_WITH_WARNING') {
    severity = 'WARNING';
  }

  return {
    eventType: 'ADR014_MANIFEST_STATE_OBSERVED', severity, component: 'MANIFEST',
    operation: 'OBSERVE_MANIFEST', result, failureCode,
  };
}

function coverageEventMapping(fact: Extract<Adr014ObservationFact, { kind: 'COVERAGE' }>): Adr014EventMapping {
  const byResult = {
    COMPLETE: ['INFO', 'SUCCESS', 'NONE'],
    PARTIAL: ['WARNING', 'OBSERVED', 'NONE'],
    MISSING: ['HARD_STOP', 'BLOCKED', 'COVERAGE_MISSING'],
    INVALID: ['HARD_STOP', 'FAILED', 'COVERAGE_INVALID'],
    NOT_EVALUATED: ['HARD_STOP', 'UNAVAILABLE', 'SOURCE_UNAVAILABLE'],
  } as const;
  const [severity, result, failureCode] = byResult[fact.result];
  return {
    eventType: 'ADR014_COVERAGE_STATE_OBSERVED', severity, component: 'COVERAGE',
    operation: 'OBSERVE_COVERAGE', result, failureCode,
  };
}

function boundaryEventMapping(fact: Extract<Adr014ObservationFact, { kind: 'BOUNDARY' }>): Adr014EventMapping {
  const byResult = {
    PASS: ['INFO', 'SUCCESS', 'NONE'],
    FAIL: ['HARD_STOP', 'FAILED', 'BOUNDARY_FAILED'],
    NOT_EVALUATED: ['HARD_STOP', 'UNAVAILABLE', 'BOUNDARY_NOT_EVALUATED'],
  } as const;
  const [severity, result, failureCode] = byResult[fact.result];
  return {
    eventType: 'ADR014_BOUNDARY_RESULT_OBSERVED', severity, component: 'BOUNDARY',
    operation: 'VERIFY_BOUNDARY', result, failureCode,
  };
}

function controlEventMapping(fact: Extract<Adr014ObservationFact, { kind: 'CONTROL' }>): Adr014EventMapping {
  const byResult = {
    CONFIGURED: ['INFO', 'OBSERVED', 'NONE'],
    NOT_CONFIGURED: ['HARD_STOP', 'BLOCKED', 'CONTROL_NOT_CONFIGURED'],
    BLOCKED: ['HARD_STOP', 'BLOCKED', 'CONTROL_BLOCKED'],
    UNAVAILABLE: ['HARD_STOP', 'UNAVAILABLE', 'CONTROL_UNAVAILABLE'],
  } as const;
  const [severity, result, failureCode] = byResult[fact.result];
  return {
    eventType: 'ADR014_CONTROL_STATE_OBSERVED', severity, component: 'CONTROL',
    operation: 'OBSERVE_CONTROL', result, failureCode,
  };
}

function healthEventMapping(fact: Extract<Adr014ObservationFact, { kind: 'HEALTH' }>): Adr014EventMapping {
  const byResult = {
    HEALTHY: ['INFO', 'SUCCESS', 'NONE'],
    DEGRADED: ['WARNING', 'OBSERVED', 'INSTRUMENTATION_DEGRADED'],
    FAILED: ['HARD_STOP', 'FAILED', 'INSTRUMENTATION_FAILED'],
    UNKNOWN: ['HARD_STOP', 'UNAVAILABLE', 'INSTRUMENTATION_UNKNOWN'],
    NOT_CONFIGURED: ['HARD_STOP', 'UNAVAILABLE', 'INSTRUMENTATION_NOT_CONFIGURED'],
  } as const;
  const [severity, result, failureCode] = byResult[fact.result];
  return {
    eventType: 'ADR014_INSTRUMENTATION_HEALTH_OBSERVED', severity,
    component: 'INSTRUMENTATION_HEALTH', operation: 'OBSERVE_HEALTH', result, failureCode,
  };
}

function eventMapping(fact: Adr014ObservationFact): Adr014EventMapping {
  switch (fact.kind) {
    case 'SESSION': return sessionEventMapping(fact.state);
    case 'PHASE': return phaseEventMapping(fact);
    case 'MANIFEST': return manifestEventMapping(fact);
    case 'COVERAGE': return coverageEventMapping(fact);
    case 'BOUNDARY': return boundaryEventMapping(fact);
    case 'CONTROL': return controlEventMapping(fact);
    case 'HEALTH': return healthEventMapping(fact);
    default: {
      const exhaustive: never = fact;
      return exhaustive;
    }
  }
}

function mappedEvent(
  fact: Adr014ObservationFact,
  context: Adr014ObservationProjectionContext | undefined,
): Adr014ObservationEventProjection {
  if (context === undefined) return EVENT_CONTEXT_ABSENT;
  if (!isAdr014SessionControlEventContext(context.event)) return INVALID_EVENT_CONTEXT;

  return Object.freeze({
    status: 'MAPPED',
    event: buildAdr014SessionControlEvent(eventMapping(fact), context.event),
  });
}

function mapFact(
  fact: Adr014ObservationFact,
  context: Adr014ObservationProjectionContext | undefined,
): Adr014ObservationTelemetryProjection {
  return Object.freeze({
    contractVersion: ADR014_OBSERVATION_PRODUCER_CONTRACT_VERSION,
    fact,
    metric: mappedMetric(fact, context),
    additionalMetrics: additionalMetrics(fact),
    event: mappedEvent(fact, context),
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
    produce(input: unknown, context?: unknown): Adr014ObservationProducerResult {
      if (mode === 'DISABLED') return DISABLED_RESULT;

      let projection: Adr014ObservationTelemetryProjection;
      try {
        projection = mapFact(
          createFact(input),
          context === undefined ? undefined : (context as Adr014ObservationProjectionContext),
        );
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
