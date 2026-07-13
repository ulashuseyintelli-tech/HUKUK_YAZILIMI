import type { Adr014SessionControlEventContext } from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.events';
import {
  type Adr014LocalEvidenceHarnessBlockerCode,
  type Adr014LocalEvidenceHarnessConstraints,
  type Adr014LocalEvidencePreparationRequest,
  prepareAdr014DisabledLocalEvidenceHarness,
} from './adr014-disabled-local-evidence-harness';
import type {
  Adr014ObservationFactKind,
  Adr014SessionState,
} from './adr014-session-observation-facts';
import {
  type Adr014ObservationProducerInput,
  type Adr014ObservationTelemetryProjection,
  createAdr014ObservationProducer,
} from './adr014-session-observation-producer';

export const ADR014_DRY_VALIDATION_CONTRACT_VERSION = '1' as const;
export const ADR014_DRY_VALIDATION_DEFAULT_MODE = 'DISABLED' as const;

export const ADR014_DRY_VALIDATION_SCENARIOS = Object.freeze([
  'SESSION_SUCCESS',
  'PHASE_FAILURE',
  'PHASE_TIMEOUT',
  'PHASE_CANCELLED',
  'SESSION_ABORTED',
  'INVALID_STATE_TRANSITION',
] as const);

export const ADR014_DRY_VALIDATION_FACT_FAMILIES = Object.freeze([
  'SESSION',
  'PHASE',
  'MANIFEST',
  'COVERAGE',
  'BOUNDARY',
  'CONTROL',
  'HEALTH',
] as const satisfies readonly Adr014ObservationFactKind[]);

export const ADR014_DRY_VALIDATION_BLOCKER_CODES = Object.freeze([
  'INVALID_DRY_VALIDATION_REQUEST',
  'INVALID_STATE_TRANSITION',
  'INVALID_MONOTONIC_CLOCK',
  'NON_MONOTONIC_PHASE_DURATION',
  'OBSERVATION_PROJECTION_FAILED',
  'OBSERVATION_EVENT_MAPPING_BLOCKED',
  'OBSERVATION_METRIC_MAPPING_BLOCKED',
] as const);

export type Adr014DryValidationScenario = (typeof ADR014_DRY_VALIDATION_SCENARIOS)[number];
export type Adr014DryValidationBlockerCode =
  (typeof ADR014_DRY_VALIDATION_BLOCKER_CODES)[number];

export interface Adr014MonotonicClock {
  readSeconds(): number;
}

export interface Adr014DryValidationRequest {
  readonly preparationRequest: Readonly<Adr014LocalEvidencePreparationRequest>;
  readonly preparationConstraints: Readonly<Adr014LocalEvidenceHarnessConstraints>;
  readonly scenario: Adr014DryValidationScenario;
  readonly eventContext: Readonly<Adr014SessionControlEventContext>;
  readonly monotonicClock: Adr014MonotonicClock;
}

export interface Adr014DryValidationOrchestrator {
  readonly mode: 'DISABLED' | 'TEST_ONLY';
  validate(request: unknown): Adr014DryValidationResult;
}

export type Adr014DryValidationResult =
  | Readonly<{
      contractVersion: typeof ADR014_DRY_VALIDATION_CONTRACT_VERSION;
      status: 'DISABLED';
      projections: readonly [];
    }>
  | Readonly<{
      contractVersion: typeof ADR014_DRY_VALIDATION_CONTRACT_VERSION;
      status: 'BLOCKED';
      blockerCodes: readonly (
        | Adr014DryValidationBlockerCode
        | Adr014LocalEvidenceHarnessBlockerCode
      )[];
      projections: readonly [];
    }>
  | Readonly<{
      contractVersion: typeof ADR014_DRY_VALIDATION_CONTRACT_VERSION;
      status: 'DRY_VALIDATED';
      scenario: Adr014DryValidationScenario;
      factFamilies: readonly Adr014ObservationFactKind[];
      projections: readonly Adr014ObservationTelemetryProjection[];
    }>;

export interface Adr014DryValidationOrchestratorConfig {
  readonly mode: 'DISABLED' | 'TEST_ONLY';
}

export const ADR014_DRY_VALIDATION_DEFAULT_CONFIG = Object.freeze({
  mode: ADR014_DRY_VALIDATION_DEFAULT_MODE,
} as const satisfies Adr014DryValidationOrchestratorConfig);

const DISABLED_RESULT = Object.freeze({
  contractVersion: ADR014_DRY_VALIDATION_CONTRACT_VERSION,
  status: 'DISABLED' as const,
  projections: Object.freeze([] as []),
});

const REQUEST_KEYS = Object.freeze([
  'preparationRequest',
  'preparationConstraints',
  'scenario',
  'eventContext',
  'monotonicClock',
] as const);
const CLOCK_KEYS = Object.freeze(['readSeconds'] as const);

const ALLOWED_TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze(['ENVIRONMENT_VERIFIED']),
  ENVIRONMENT_VERIFIED: Object.freeze(['ACCESS_APPROVED']),
  ACCESS_APPROVED: Object.freeze(['EXECUTION_AUTHORIZED']),
  EXECUTION_AUTHORIZED: Object.freeze(['ACTIVE']),
  ACTIVE: Object.freeze(['CAPTURE_COMPLETE', 'ABORTED']),
  CAPTURE_COMPLETE: Object.freeze(['VALIDATION_PENDING']),
  VALIDATION_PENDING: Object.freeze(['VALIDATED', 'ABORTED']),
  VALIDATED: Object.freeze(['CLOSED']),
  CLOSED: Object.freeze([]),
  REJECTED: Object.freeze([]),
  ABORTED: Object.freeze([]),
  INVALIDATED: Object.freeze([]),
} as const satisfies Record<Adr014SessionState, readonly Adr014SessionState[]>);

type ScenarioStep =
  | Readonly<{ kind: 'SESSION_TRANSITION'; from?: Adr014SessionState; to: Adr014SessionState }>
  | Readonly<{ kind: 'OBSERVATION'; input: Adr014ObservationProducerInput }>
  | Readonly<{
      kind: 'PHASE';
      start: Adr014ObservationProducerInput;
      end: Adr014ObservationProducerInput;
    }>;

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

function blocked(
  blockerCodes: readonly (
    | Adr014DryValidationBlockerCode
    | Adr014LocalEvidenceHarnessBlockerCode
  )[],
): Adr014DryValidationResult {
  return Object.freeze({
    contractVersion: ADR014_DRY_VALIDATION_CONTRACT_VERSION,
    status: 'BLOCKED' as const,
    blockerCodes: Object.freeze([...blockerCodes]),
    projections: Object.freeze([] as []),
  });
}

export function isAdr014DryValidationTransitionAllowed(
  from: Adr014SessionState,
  to: Adr014SessionState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to as never);
}

function sessionPrefix(): readonly ScenarioStep[] {
  return Object.freeze([
    Object.freeze({ kind: 'SESSION_TRANSITION', to: 'DRAFT' }),
    Object.freeze({ kind: 'SESSION_TRANSITION', from: 'DRAFT', to: 'ENVIRONMENT_VERIFIED' }),
    Object.freeze({
      kind: 'OBSERVATION',
      input: Object.freeze({
        kind: 'MANIFEST', sourceState: 'APPROVED', evidenceValidity: 'VALID',
      }),
    }),
    Object.freeze({
      kind: 'OBSERVATION',
      input: Object.freeze({ kind: 'COVERAGE', category: 'REQUIRED', result: 'COMPLETE' }),
    }),
    Object.freeze({
      kind: 'OBSERVATION',
      input: Object.freeze({ kind: 'BOUNDARY', boundaryType: 'TENANT', result: 'PASS' }),
    }),
    Object.freeze({
      kind: 'OBSERVATION', input: Object.freeze({ kind: 'CONTROL', result: 'CONFIGURED' }),
    }),
    Object.freeze({
      kind: 'OBSERVATION',
      input: Object.freeze({ kind: 'HEALTH', component: 'METRIC', result: 'HEALTHY' }),
    }),
    Object.freeze({
      kind: 'SESSION_TRANSITION', from: 'ENVIRONMENT_VERIFIED', to: 'ACCESS_APPROVED',
    }),
    Object.freeze({
      kind: 'SESSION_TRANSITION', from: 'ACCESS_APPROVED', to: 'EXECUTION_AUTHORIZED',
    }),
    Object.freeze({
      kind: 'SESSION_TRANSITION', from: 'EXECUTION_AUTHORIZED', to: 'ACTIVE',
    }),
  ]);
}

function executionPhase(
  outcome: 'SUCCESS' | 'ERROR' | 'TIMEOUT' | 'CANCELLED',
): ScenarioStep {
  return Object.freeze({
    kind: 'PHASE',
    start: Object.freeze({ kind: 'PHASE', phase: 'EXECUTION', result: 'STARTED' }),
    end: outcome === 'SUCCESS'
      ? Object.freeze({
          kind: 'PHASE', phase: 'EXECUTION', result: 'COMPLETED', executionOutcome: 'SUCCESS',
        })
      : Object.freeze({
          kind: 'PHASE', phase: 'EXECUTION', result: 'FAILED',
          phaseFailure: 'FAILED', executionOutcome: outcome,
        }),
  });
}

function simplePhase(phase: 'CAPTURE' | 'VALIDATION'): ScenarioStep {
  return Object.freeze({
    kind: 'PHASE',
    start: Object.freeze({ kind: 'PHASE', phase, result: 'STARTED' }),
    end: Object.freeze({ kind: 'PHASE', phase, result: 'COMPLETED' }),
  });
}

function scenarioSteps(scenario: Adr014DryValidationScenario): readonly ScenarioStep[] {
  const prefix = sessionPrefix();
  if (scenario === 'INVALID_STATE_TRANSITION') {
    return Object.freeze([
      Object.freeze({ kind: 'SESSION_TRANSITION', to: 'DRAFT' }),
      Object.freeze({ kind: 'SESSION_TRANSITION', from: 'DRAFT', to: 'ACTIVE' }),
    ]);
  }
  if (scenario === 'SESSION_ABORTED') {
    return Object.freeze([
      ...prefix,
      Object.freeze({ kind: 'SESSION_TRANSITION', from: 'ACTIVE', to: 'ABORTED' }),
    ]);
  }
  if (scenario !== 'SESSION_SUCCESS') {
    const outcome = scenario === 'PHASE_FAILURE'
      ? 'ERROR'
      : scenario === 'PHASE_TIMEOUT'
        ? 'TIMEOUT'
        : 'CANCELLED';
    return Object.freeze([
      ...prefix,
      executionPhase(outcome),
      Object.freeze({ kind: 'SESSION_TRANSITION', from: 'ACTIVE', to: 'ABORTED' }),
    ]);
  }
  return Object.freeze([
    ...prefix,
    executionPhase('SUCCESS'),
    simplePhase('CAPTURE'),
    Object.freeze({ kind: 'SESSION_TRANSITION', from: 'ACTIVE', to: 'CAPTURE_COMPLETE' }),
    Object.freeze({
      kind: 'SESSION_TRANSITION', from: 'CAPTURE_COMPLETE', to: 'VALIDATION_PENDING',
    }),
    simplePhase('VALIDATION'),
    Object.freeze({ kind: 'SESSION_TRANSITION', from: 'VALIDATION_PENDING', to: 'VALIDATED' }),
    Object.freeze({ kind: 'SESSION_TRANSITION', from: 'VALIDATED', to: 'CLOSED' }),
  ]);
}

function project(
  producer: ReturnType<typeof createAdr014ObservationProducer>,
  input: Adr014ObservationProducerInput,
  eventContext: Adr014SessionControlEventContext,
  phaseDurationSeconds?: number,
): Adr014ObservationTelemetryProjection | Adr014DryValidationBlockerCode {
  const result = producer.produce(
    input,
    phaseDurationSeconds === undefined
      ? Object.freeze({ event: eventContext })
      : Object.freeze({ event: eventContext, phaseDurationSeconds }),
  );
  if (result.status !== 'PROJECTED') return 'OBSERVATION_PROJECTION_FAILED';
  if (result.projection.event.status !== 'MAPPED') return 'OBSERVATION_EVENT_MAPPING_BLOCKED';
  if (result.projection.metric.status === 'BLOCKED_WITH_REASON') {
    return 'OBSERVATION_METRIC_MAPPING_BLOCKED';
  }
  return result.projection;
}

function readClock(clock: Adr014MonotonicClock): number | undefined {
  try {
    const value = clock.readSeconds();
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  } catch (_error) {
    return undefined;
  }
}

function isScenario(value: unknown): value is Adr014DryValidationScenario {
  return typeof value === 'string' && ADR014_DRY_VALIDATION_SCENARIOS.includes(
    value as Adr014DryValidationScenario,
  );
}

export function createAdr014LocalSessionDryValidationOrchestrator(
  config: Readonly<Adr014DryValidationOrchestratorConfig> = ADR014_DRY_VALIDATION_DEFAULT_CONFIG,
): Adr014DryValidationOrchestrator {
  const mode = config.mode === 'TEST_ONLY' ? 'TEST_ONLY' : 'DISABLED';
  return Object.freeze({
    mode,
    validate(request: unknown): Adr014DryValidationResult {
      if (mode === 'DISABLED') return DISABLED_RESULT;
      if (!isObject(request) || !hasExactKeys(request, REQUEST_KEYS)) {
        return blocked(['INVALID_DRY_VALIDATION_REQUEST']);
      }

      const preparation = prepareAdr014DisabledLocalEvidenceHarness(
        field(request, 'preparationRequest') as Adr014LocalEvidencePreparationRequest,
        field(request, 'preparationConstraints') as Adr014LocalEvidenceHarnessConstraints,
      );
      if (preparation.status === 'BLOCKED') return blocked(preparation.blockerCodes);

      const scenario = field(request, 'scenario');
      const eventContext = field(request, 'eventContext');
      const clock = field(request, 'monotonicClock');
      if (
        !isScenario(scenario) ||
        !isObject(eventContext) ||
        !isObject(clock) ||
        !hasExactKeys(clock, CLOCK_KEYS) ||
        typeof field(clock, 'readSeconds') !== 'function'
      ) {
        return blocked(['INVALID_DRY_VALIDATION_REQUEST']);
      }

      const producer = createAdr014ObservationProducer({ mode: 'TEST_ONLY' });
      const projections: Adr014ObservationTelemetryProjection[] = [];
      let sessionState: Adr014SessionState | undefined;

      for (const step of scenarioSteps(scenario)) {
        if (step.kind === 'SESSION_TRANSITION') {
          if (
            step.from !== undefined &&
            (sessionState !== step.from || !isAdr014DryValidationTransitionAllowed(step.from, step.to))
          ) {
            return blocked(['INVALID_STATE_TRANSITION']);
          }
          sessionState = step.to;
          const projection = project(
            producer,
            Object.freeze({ kind: 'SESSION', state: step.to }),
            eventContext as unknown as Adr014SessionControlEventContext,
          );
          if (typeof projection === 'string') return blocked([projection]);
          projections.push(projection);
          continue;
        }

        if (step.kind === 'OBSERVATION') {
          const projection = project(
            producer,
            step.input,
            eventContext as unknown as Adr014SessionControlEventContext,
          );
          if (typeof projection === 'string') return blocked([projection]);
          projections.push(projection);
          continue;
        }

        const startedAt = readClock(clock as unknown as Adr014MonotonicClock);
        if (startedAt === undefined) return blocked(['INVALID_MONOTONIC_CLOCK']);
        const startProjection = project(
          producer,
          step.start,
          eventContext as unknown as Adr014SessionControlEventContext,
        );
        if (typeof startProjection === 'string') return blocked([startProjection]);
        projections.push(startProjection);

        const endedAt = readClock(clock as unknown as Adr014MonotonicClock);
        if (endedAt === undefined) return blocked(['INVALID_MONOTONIC_CLOCK']);
        if (endedAt < startedAt) return blocked(['NON_MONOTONIC_PHASE_DURATION']);
        const endProjection = project(
          producer,
          step.end,
          eventContext as unknown as Adr014SessionControlEventContext,
          endedAt - startedAt,
        );
        if (typeof endProjection === 'string') return blocked([endProjection]);
        projections.push(endProjection);
      }

      const factFamilies = Object.freeze(
        ADR014_DRY_VALIDATION_FACT_FAMILIES.filter((kind) =>
          projections.some((projection) => projection.fact.kind === kind),
        ),
      );
      return Object.freeze({
        contractVersion: ADR014_DRY_VALIDATION_CONTRACT_VERSION,
        status: 'DRY_VALIDATED' as const,
        scenario,
        factFamilies,
        projections: Object.freeze([...projections]),
      });
    },
  });
}
