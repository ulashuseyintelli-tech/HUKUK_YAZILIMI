export const ADR014_OPERATIONAL_EVENT_VERSION = '1' as const;

export const ADR014_OPERATIONAL_EVENT_TYPES = [
  'ADR014_SHADOW_COMPARISON_STARTED',
  'ADR014_SHADOW_COMPONENT_COMPLETED',
  'ADR014_SHADOW_COMPONENT_FAILED',
  'ADR014_SHADOW_COMPARISON_COMPLETED',
  'ADR014_SHADOW_COMPARISON_BLOCKED',
  'ADR014_SHADOW_COMPARISON_UNAVAILABLE',
] as const;

export const ADR014_OPERATIONAL_EVENT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL', 'HARD_STOP'] as const;
export const ADR014_OPERATIONAL_EVENT_COMPONENTS = ['LEGACY', 'CANONICAL', 'SHADOW_COMPARE'] as const;
export const ADR014_OPERATIONAL_EVENT_OPERATIONS = ['CALCULATE', 'COMPARE', 'EVALUATE_READINESS'] as const;
export const ADR014_OPERATIONAL_EVENT_RESULTS = ['SUCCESS', 'ERROR', 'BLOCKED', 'UNAVAILABLE'] as const;
export const ADR014_OPERATIONAL_EVENT_FAILURE_CODES = [
  'NONE',
  'LEGACY_SOURCE_ERROR',
  'CANONICAL_SOURCE_ERROR',
  'LEGACY_SOURCE_UNAVAILABLE',
  'CANONICAL_SOURCE_UNAVAILABLE',
  'NON_ZERO_FINANCIAL_DELTA',
  'MANDATORY_COMPARISON_UNKNOWN',
  'MANDATORY_FIELD_NOT_COMPARABLE',
  'CURRENCY_INTEGRITY_FAILURE',
  'AUTHORITY_INTEGRITY_FAILURE',
  'MISSING_PAYMENT_ALLOCATION_EVIDENCE',
  'MISSING_INTEREST_BASE_EVIDENCE',
  'MISSING_FEE_PROJECTION_EVIDENCE',
  'READINESS_BLOCKED',
] as const;

export type Adr014OperationalEventType = (typeof ADR014_OPERATIONAL_EVENT_TYPES)[number];
export type Adr014OperationalEventSeverity = (typeof ADR014_OPERATIONAL_EVENT_SEVERITIES)[number];
export type Adr014OperationalEventComponent = (typeof ADR014_OPERATIONAL_EVENT_COMPONENTS)[number];
export type Adr014OperationalEventOperation = (typeof ADR014_OPERATIONAL_EVENT_OPERATIONS)[number];
export type Adr014OperationalEventResult = (typeof ADR014_OPERATIONAL_EVENT_RESULTS)[number];
export type Adr014OperationalEventFailureCode = (typeof ADR014_OPERATIONAL_EVENT_FAILURE_CODES)[number];
export type Adr014EnvironmentReference = 'PRODUCTION' | 'DEVELOPMENT' | 'TEST' | 'UNKNOWN';

declare const opaqueReferenceBrand: unique symbol;
type Adr014OpaqueReference = string & { readonly [opaqueReferenceBrand]: true };

/**
 * Non-durable, allowlist-only operational telemetry. It is not AuditLog,
 * LegalEvidence, a financial event, or runtime/cutover authority.
 */
export interface Adr014OperationalEvent {
  readonly event_type: Adr014OperationalEventType;
  readonly event_version: typeof ADR014_OPERATIONAL_EVENT_VERSION;
  readonly timestamp: string;
  readonly severity: Adr014OperationalEventSeverity;
  readonly component: Adr014OperationalEventComponent;
  readonly operation: Adr014OperationalEventOperation;
  readonly result: Adr014OperationalEventResult;
  readonly failure_code: Adr014OperationalEventFailureCode;
  readonly canonical_sha_reference: string;
  readonly environment_reference: Adr014EnvironmentReference;
  readonly session_reference?: Adr014OpaqueReference;
  readonly manifest_reference?: Adr014OpaqueReference;
  readonly trace_reference?: Adr014OpaqueReference;
  readonly evidence_reference?: Adr014OpaqueReference;
}

export interface BuildAdr014OperationalEventInput {
  readonly eventType: Adr014OperationalEventType;
  readonly severity: Adr014OperationalEventSeverity;
  readonly component: Adr014OperationalEventComponent;
  readonly operation: Adr014OperationalEventOperation;
  readonly result: Adr014OperationalEventResult;
  readonly failureCode: Adr014OperationalEventFailureCode;
}

const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

export function canonicalShaReference(environment: NodeJS.ProcessEnv = process.env): string {
  const candidate = environment.GIT_SHA;
  return typeof candidate === 'string' && FULL_GIT_SHA.test(candidate) ? candidate.toLowerCase() : 'UNKNOWN';
}

export function environmentReference(environment: NodeJS.ProcessEnv = process.env): Adr014EnvironmentReference {
  if (environment.NODE_ENV === 'production') return 'PRODUCTION';
  if (environment.NODE_ENV === 'development') return 'DEVELOPMENT';
  if (environment.NODE_ENV === 'test') return 'TEST';
  return 'UNKNOWN';
}

export function buildAdr014OperationalEvent(
  input: BuildAdr014OperationalEventInput,
  now: Date = new Date(),
  environment: NodeJS.ProcessEnv = process.env,
): Adr014OperationalEvent {
  return Object.freeze({
    event_type: input.eventType,
    event_version: ADR014_OPERATIONAL_EVENT_VERSION,
    timestamp: now.toISOString(),
    severity: input.severity,
    component: input.component,
    operation: input.operation,
    result: input.result,
    failure_code: input.failureCode,
    canonical_sha_reference: canonicalShaReference(environment),
    environment_reference: environmentReference(environment),
  });
}

export const ADR014_SESSION_CONTROL_EVENT_VERSION = '2' as const;
export const ADR014_SESSION_CONTROL_EVENT_PROFILE = 'SESSION_CONTROL' as const;

export const ADR014_SESSION_CONTROL_EVENT_TYPES = [
  'ADR014_SESSION_REQUESTED',
  'ADR014_SESSION_ENVIRONMENT_VERIFIED',
  'ADR014_SESSION_ACCESS_STATE_OBSERVED',
  'ADR014_SESSION_EXECUTION_AUTH_STATE_OBSERVED',
  'ADR014_SESSION_STARTED',
  'ADR014_SESSION_CAPTURE_COMPLETED',
  'ADR014_SESSION_VALIDATION_STARTED',
  'ADR014_SESSION_VALIDATED',
  'ADR014_SESSION_CLOSED',
  'ADR014_SESSION_REJECTED',
  'ADR014_SESSION_ABORTED',
  'ADR014_SESSION_INVALIDATED',
  'ADR014_PHASE_STARTED',
  'ADR014_PHASE_COMPLETED',
  'ADR014_PHASE_FAILED',
  'ADR014_PHASE_TIMEOUT',
  'ADR014_PHASE_CANCELLED',
  'ADR014_MANIFEST_STATE_OBSERVED',
  'ADR014_COVERAGE_STATE_OBSERVED',
  'ADR014_BOUNDARY_RESULT_OBSERVED',
  'ADR014_CONTROL_STATE_OBSERVED',
  'ADR014_INSTRUMENTATION_HEALTH_OBSERVED',
] as const;

export const ADR014_SESSION_CONTROL_EVENT_COMPONENTS = [
  'SESSION',
  'PHASE',
  'MANIFEST',
  'COVERAGE',
  'BOUNDARY',
  'CONTROL',
  'INSTRUMENTATION_HEALTH',
] as const;

export const ADR014_SESSION_CONTROL_EVENT_OPERATIONS = [
  'OBSERVE_SESSION',
  'OBSERVE_PHASE',
  'OBSERVE_MANIFEST',
  'OBSERVE_COVERAGE',
  'VERIFY_BOUNDARY',
  'OBSERVE_CONTROL',
  'OBSERVE_HEALTH',
  'EVALUATE_EXECUTION_REQUEST',
] as const;

export const ADR014_SESSION_CONTROL_EVENT_RESULTS = [
  'OBSERVED',
  'STARTED',
  'COMPLETED',
  'ACCEPTED',
  'SUCCESS',
  'ERROR',
  'TIMEOUT',
  'CANCELLED',
  'FAILED',
  'REJECTED',
  'NOT_AUTHORIZED',
  'INVALID_STATE',
  'UNAVAILABLE',
  'BLOCKED',
  'ABORTED',
  'INVALIDATED',
] as const;

export const ADR014_SESSION_CONTROL_EVENT_FAILURE_CODES = [
  'NONE',
  'AUTHORIZATION_ABSENT',
  'REQUEST_REJECTED',
  'INVALID_LIFECYCLE_STATE',
  'SOURCE_UNAVAILABLE',
  'PHASE_PROCESSING_ERROR',
  'PHASE_TIMEOUT',
  'PHASE_CANCELLED',
  'SESSION_ABORTED',
  'SESSION_INVALIDATED',
  'MANIFEST_ABSENT',
  'MANIFEST_INVALID',
  'MANIFEST_REJECTED',
  'COVERAGE_MISSING',
  'COVERAGE_INVALID',
  'BOUNDARY_FAILED',
  'BOUNDARY_NOT_EVALUATED',
  'CONTROL_NOT_CONFIGURED',
  'CONTROL_BLOCKED',
  'CONTROL_UNAVAILABLE',
  'INSTRUMENTATION_DEGRADED',
  'INSTRUMENTATION_FAILED',
  'INSTRUMENTATION_UNKNOWN',
  'INSTRUMENTATION_NOT_CONFIGURED',
] as const;

export type Adr014SessionControlEventType = (typeof ADR014_SESSION_CONTROL_EVENT_TYPES)[number];
export type Adr014SessionControlEventComponent =
  (typeof ADR014_SESSION_CONTROL_EVENT_COMPONENTS)[number];
export type Adr014SessionControlEventOperation =
  (typeof ADR014_SESSION_CONTROL_EVENT_OPERATIONS)[number];
export type Adr014SessionControlEventResult =
  (typeof ADR014_SESSION_CONTROL_EVENT_RESULTS)[number];
export type Adr014SessionControlEventFailureCode =
  (typeof ADR014_SESSION_CONTROL_EVENT_FAILURE_CODES)[number];

/**
 * PE-06C1 profile in the existing ADR-014 operational-event envelope family.
 * This profile is preparation-only and does not create execution or evidence authority.
 */
export interface Adr014SessionControlEvent {
  readonly event_type: Adr014SessionControlEventType;
  readonly event_version: typeof ADR014_SESSION_CONTROL_EVENT_VERSION;
  readonly event_profile: typeof ADR014_SESSION_CONTROL_EVENT_PROFILE;
  readonly timestamp: string;
  readonly severity: Adr014OperationalEventSeverity;
  readonly component: Adr014SessionControlEventComponent;
  readonly operation: Adr014SessionControlEventOperation;
  readonly result: Adr014SessionControlEventResult;
  readonly failure_code: Adr014SessionControlEventFailureCode;
  readonly canonical_sha_reference: string;
  readonly environment_reference: Adr014EnvironmentReference;
  readonly session_reference?: Adr014OpaqueReference;
  readonly manifest_reference?: Adr014OpaqueReference;
  readonly trace_reference?: Adr014OpaqueReference;
  readonly evidence_reference?: Adr014OpaqueReference;
}

export type Adr014CanonicalOperationalEvent = Adr014OperationalEvent | Adr014SessionControlEvent;

export interface BuildAdr014SessionControlEventInput {
  readonly eventType: Adr014SessionControlEventType;
  readonly severity: Adr014OperationalEventSeverity;
  readonly component: Adr014SessionControlEventComponent;
  readonly operation: Adr014SessionControlEventOperation;
  readonly result: Adr014SessionControlEventResult;
  readonly failureCode: Adr014SessionControlEventFailureCode;
}

export interface Adr014SessionControlEventContext {
  readonly timestamp: string;
  readonly canonicalShaReference: string;
  readonly environmentReference: Exclude<Adr014EnvironmentReference, 'UNKNOWN'>;
}

const LOWERCASE_FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const UTC_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isBoundedValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

export function isAdr014SessionControlEventContext(
  context: unknown,
): context is Adr014SessionControlEventContext {
  if (typeof context !== 'object' || context === null || Array.isArray(context)) return false;
  const candidate = context as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 3 ||
    !UTC_ISO_TIMESTAMP.test(String(candidate.timestamp)) ||
    Number.isNaN(Date.parse(String(candidate.timestamp))) ||
    !LOWERCASE_FULL_GIT_SHA.test(String(candidate.canonicalShaReference)) ||
    !isBoundedValue(
      ['PRODUCTION', 'DEVELOPMENT', 'TEST'] as const,
      candidate.environmentReference,
    )
  ) {
    return false;
  }
  return true;
}

export function buildAdr014SessionControlEvent(
  input: BuildAdr014SessionControlEventInput,
  context: Adr014SessionControlEventContext,
): Adr014SessionControlEvent {
  if (
    !isBoundedValue(ADR014_SESSION_CONTROL_EVENT_TYPES, input.eventType) ||
    !isBoundedValue(ADR014_OPERATIONAL_EVENT_SEVERITIES, input.severity) ||
    !isBoundedValue(ADR014_SESSION_CONTROL_EVENT_COMPONENTS, input.component) ||
    !isBoundedValue(ADR014_SESSION_CONTROL_EVENT_OPERATIONS, input.operation) ||
    !isBoundedValue(ADR014_SESSION_CONTROL_EVENT_RESULTS, input.result) ||
    !isBoundedValue(ADR014_SESSION_CONTROL_EVENT_FAILURE_CODES, input.failureCode)
  ) {
    throw new TypeError('INVALID_ADR014_SESSION_CONTROL_EVENT_INPUT');
  }
  if (!isAdr014SessionControlEventContext(context)) {
    throw new TypeError('INVALID_ADR014_SESSION_CONTROL_EVENT_CONTEXT');
  }

  return Object.freeze({
    event_type: input.eventType,
    event_version: ADR014_SESSION_CONTROL_EVENT_VERSION,
    event_profile: ADR014_SESSION_CONTROL_EVENT_PROFILE,
    timestamp: context.timestamp,
    severity: input.severity,
    component: input.component,
    operation: input.operation,
    result: input.result,
    failure_code: input.failureCode,
    canonical_sha_reference: context.canonicalShaReference,
    environment_reference: context.environmentReference,
  });
}
