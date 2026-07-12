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
