import { createHash } from 'node:crypto';
import type { Adr014AuditCorrelationReference } from '../modules/balance-display-shadow-diff/balance-display-shadow-diff-audit-correlation';

export const ADR014_LOCAL_OBSERVABILITY_CONTRACT_VERSION = '1' as const;
export const ADR014_LOCAL_OBSERVABILITY_DEFAULT_MODE = 'DISABLED' as const;

export const ADR014_LOCAL_AUDIT_ACTIONS = Object.freeze([
  'ACCESS_APPROVAL_RECORDED',
  'EXECUTION_AUTHORIZATION_RECORDED',
  'SESSION_STATE_OBSERVED',
  'CANONICAL_SHA_PIN_RECORDED',
  'MANIFEST_ATTACHMENT_RECORDED',
  'CONTROL_STATE_OBSERVED',
  'SOURCE_WRITE_ATTEMPT_OBSERVED',
  'EXTERNAL_EGRESS_ATTEMPT_OBSERVED',
  'EVIDENCE_REFERENCE_SEALED',
  'EVIDENCE_REFERENCE_SUPERSEDED',
] as const);

export const ADR014_LOCAL_AUDIT_ACTOR_ROLES = Object.freeze([
  'OWNER',
  'OPERATOR',
  'TECHNICAL_REVIEWER',
  'OPERATIONS',
  'LEGAL_FINANCIAL_REVIEWER',
  'PRIVACY_ACCESS_REVIEWER',
] as const);

export const ADR014_LOCAL_AUDIT_TARGETS = Object.freeze([
  'ACCESS_AUTHORIZATION',
  'EXECUTION_AUTHORIZATION',
  'SESSION',
  'CANONICAL_SHA',
  'MANIFEST',
  'CONTROL',
  'SOURCE_BOUNDARY',
  'EGRESS_BOUNDARY',
  'EVIDENCE_REFERENCE',
] as const);

export const ADR014_LOCAL_AUDIT_STATES = Object.freeze([
  'NOT_APPLICABLE',
  'ABSENT',
  'RECORDED',
  'APPROVED',
  'AUTHORIZED',
  'DRAFT',
  'ACTIVE',
  'ABORTED',
  'INVALIDATED',
  'PINNED',
  'ATTACHED',
  'CONFIGURED',
  'NOT_CONFIGURED',
  'BLOCKED',
  'UNAVAILABLE',
  'DETECTED',
  'REFERENCE_SEALED',
  'SUPERSEDED',
] as const);

export const ADR014_LOCAL_AUDIT_REASON_CODES = Object.freeze([
  'NONE',
  'AUTHORIZATION_ABSENT',
  'INVALID_LIFECYCLE_STATE',
  'SOURCE_UNAVAILABLE',
  'SESSION_ABORTED',
  'SESSION_INVALIDATED',
  'MANIFEST_ABSENT',
  'MANIFEST_INVALID',
  'CONTROL_NOT_CONFIGURED',
  'CONTROL_BLOCKED',
  'CONTROL_UNAVAILABLE',
  'SOURCE_WRITE_DETECTED',
  'EXTERNAL_EGRESS_DETECTED',
  'REFERENCE_CHAIN_INVALID',
  'SUPERSESSION_RECORDED',
] as const);

export type Adr014LocalAuditAction = (typeof ADR014_LOCAL_AUDIT_ACTIONS)[number];
export type Adr014LocalAuditActorRole = (typeof ADR014_LOCAL_AUDIT_ACTOR_ROLES)[number];
export type Adr014LocalAuditTarget = (typeof ADR014_LOCAL_AUDIT_TARGETS)[number];
export type Adr014LocalAuditState = (typeof ADR014_LOCAL_AUDIT_STATES)[number];
export type Adr014LocalAuditReasonCode = (typeof ADR014_LOCAL_AUDIT_REASON_CODES)[number];

export type Adr014LocalAuditReference = `adr014-audit:v1:${string}`;
export type Adr014LocalEvidenceSealReference = `adr014-evidence-seal:v1:${string}`;

export interface Adr014LocalAuditEntryInput {
  readonly correlationReference: Adr014AuditCorrelationReference;
  readonly actorRole: Adr014LocalAuditActorRole;
  readonly action: Adr014LocalAuditAction;
  readonly target: Adr014LocalAuditTarget;
  readonly previousState: Adr014LocalAuditState;
  readonly newState: Adr014LocalAuditState;
  readonly reasonCode: Adr014LocalAuditReasonCode;
  readonly timestamp: string;
  readonly canonicalSha: string;
  readonly environmentReference: string;
  readonly sessionReference: string;
  readonly authorizationReference: string;
}

export interface Adr014LocalAuditEntry extends Adr014LocalAuditEntryInput {
  readonly contractVersion: typeof ADR014_LOCAL_OBSERVABILITY_CONTRACT_VERSION;
  readonly sequence: number;
  readonly auditReference: Adr014LocalAuditReference;
  readonly parentAuditReference: Adr014LocalAuditReference | null;
}

export interface Adr014AppendAuditRequest {
  readonly chain: readonly Adr014LocalAuditEntry[];
  readonly entry: Readonly<Adr014LocalAuditEntryInput>;
}

export const ADR014_EVIDENCE_SEAL_ITEM_KINDS = Object.freeze([
  'METRIC_WINDOW',
  'DASHBOARD_SNAPSHOT',
  'ALERT_INVENTORY',
  'AUDIT_CHAIN',
] as const);
export type Adr014EvidenceSealItemKind = (typeof ADR014_EVIDENCE_SEAL_ITEM_KINDS)[number];

export interface Adr014EvidenceSealItem {
  readonly kind: Adr014EvidenceSealItemKind;
  readonly reference: string;
  readonly digest: `sha256:${string}`;
}

export interface Adr014SealEvidenceRequest {
  readonly canonicalSha: string;
  readonly environmentReference: string;
  readonly sessionReference: string;
  readonly manifestReference: string;
  readonly sealedAt: string;
  readonly auditChain: readonly Adr014LocalAuditEntry[];
  readonly items: readonly Adr014EvidenceSealItem[];
  readonly supersedesEvidenceReference?: Adr014LocalEvidenceSealReference;
}

export interface Adr014LocalEvidenceSeal {
  readonly contractVersion: typeof ADR014_LOCAL_OBSERVABILITY_CONTRACT_VERSION;
  readonly status: 'REFERENCE_SEALED';
  readonly authority: 'NONE';
  readonly official: false;
  readonly persisted: false;
  readonly canonicalSha: string;
  readonly environmentReference: string;
  readonly sessionReference: string;
  readonly manifestReference: string;
  readonly sealedAt: string;
  readonly terminalAuditReference: Adr014LocalAuditReference;
  readonly items: readonly Adr014EvidenceSealItem[];
  readonly supersedesEvidenceReference?: Adr014LocalEvidenceSealReference;
  readonly evidenceReference: Adr014LocalEvidenceSealReference;
}

export const ADR014_LOCAL_MONITORING_METRICS = Object.freeze([
  'adr014_evidence_sessions_total',
  'adr014_evidence_session_state',
  'adr014_evidence_phase_duration_seconds',
  'adr014_shadow_requests_total',
  'adr014_shadow_request_duration_seconds',
  'adr014_calculation_duration_seconds',
  'adr014_shadow_comparisons_total',
  'adr014_financial_discrepancies_total',
  'adr014_missing_evidence_total',
  'adr014_integrity_failures_total',
  'adr014_readiness_blockers_total',
  'adr014_primary_display_safety_total',
  'adr014_dataset_manifest_state',
  'adr014_dataset_coverage_state',
  'adr014_boundary_verification_total',
  'adr014_kill_switch_state',
  'adr014_instrumentation_health',
] as const);
export type Adr014LocalMonitoringMetric = (typeof ADR014_LOCAL_MONITORING_METRICS)[number];

export const ADR014_LOCAL_DASHBOARD_SECTIONS = Object.freeze([
  'SESSION_OVERVIEW',
  'FINANCIAL_INTEGRITY',
  'PERFORMANCE_RELIABILITY',
  'EVIDENCE_OPERATIONS',
] as const);
export type Adr014LocalDashboardSection = (typeof ADR014_LOCAL_DASHBOARD_SECTIONS)[number];

export interface Adr014LocalDashboardQuery {
  readonly queryId: string;
  readonly section: Adr014LocalDashboardSection;
  readonly metricName: Adr014LocalMonitoringMetric;
  readonly aggregation: 'CURRENT_STATE' | 'COUNT' | 'RATE' | 'HISTOGRAM_QUANTILE';
  readonly groupBy: readonly string[];
  readonly access: 'READ_ONLY';
}

export const ADR014_LOCAL_DASHBOARD_QUERIES = Object.freeze([
  Object.freeze({ queryId: 'SESSION_STATE', section: 'SESSION_OVERVIEW', metricName: 'adr014_evidence_session_state', aggregation: 'CURRENT_STATE', groupBy: Object.freeze(['session_state']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'SESSION_OUTCOMES', section: 'SESSION_OVERVIEW', metricName: 'adr014_evidence_sessions_total', aggregation: 'COUNT', groupBy: Object.freeze(['result']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'MANIFEST_STATE', section: 'SESSION_OVERVIEW', metricName: 'adr014_dataset_manifest_state', aggregation: 'CURRENT_STATE', groupBy: Object.freeze(['source_state', 'evidence_validity']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'FINANCIAL_DISCREPANCIES', section: 'FINANCIAL_INTEGRITY', metricName: 'adr014_financial_discrepancies_total', aggregation: 'COUNT', groupBy: Object.freeze(['financial_field', 'discrepancy_code']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'MISSING_EVIDENCE', section: 'FINANCIAL_INTEGRITY', metricName: 'adr014_missing_evidence_total', aggregation: 'COUNT', groupBy: Object.freeze(['failure_code']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'INTEGRITY_FAILURES', section: 'FINANCIAL_INTEGRITY', metricName: 'adr014_integrity_failures_total', aggregation: 'COUNT', groupBy: Object.freeze(['integrity_type', 'result']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'PRIMARY_DISPLAY_SAFETY', section: 'FINANCIAL_INTEGRITY', metricName: 'adr014_primary_display_safety_total', aggregation: 'COUNT', groupBy: Object.freeze(['result']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'SHADOW_REQUEST_RATE', section: 'PERFORMANCE_RELIABILITY', metricName: 'adr014_shadow_requests_total', aggregation: 'RATE', groupBy: Object.freeze(['outcome']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'SHADOW_LATENCY', section: 'PERFORMANCE_RELIABILITY', metricName: 'adr014_shadow_request_duration_seconds', aggregation: 'HISTOGRAM_QUANTILE', groupBy: Object.freeze(['outcome']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'PHASE_LATENCY', section: 'PERFORMANCE_RELIABILITY', metricName: 'adr014_evidence_phase_duration_seconds', aggregation: 'HISTOGRAM_QUANTILE', groupBy: Object.freeze(['phase', 'result']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'INSTRUMENTATION_HEALTH', section: 'EVIDENCE_OPERATIONS', metricName: 'adr014_instrumentation_health', aggregation: 'CURRENT_STATE', groupBy: Object.freeze(['component', 'result']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'DATASET_COVERAGE', section: 'EVIDENCE_OPERATIONS', metricName: 'adr014_dataset_coverage_state', aggregation: 'CURRENT_STATE', groupBy: Object.freeze(['coverage_category', 'result']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'BOUNDARY_RESULTS', section: 'EVIDENCE_OPERATIONS', metricName: 'adr014_boundary_verification_total', aggregation: 'COUNT', groupBy: Object.freeze(['boundary_type', 'result']), access: 'READ_ONLY' }),
  Object.freeze({ queryId: 'CONTROL_STATE', section: 'EVIDENCE_OPERATIONS', metricName: 'adr014_kill_switch_state', aggregation: 'CURRENT_STATE', groupBy: Object.freeze(['result']), access: 'READ_ONLY' }),
] as const satisfies readonly Adr014LocalDashboardQuery[]);

export const ADR014_LOCAL_ALERT_RULES = Object.freeze([
  Object.freeze({ ruleCode: 'NON_ZERO_FINANCIAL_DISCREPANCY', sourceQueryId: 'FINANCIAL_DISCREPANCIES', condition: 'ANY_OBSERVED', severity: 'HARD_STOP', delivery: 'NOT_CONFIGURED' }),
  Object.freeze({ ruleCode: 'MISSING_MANDATORY_EVIDENCE', sourceQueryId: 'MISSING_EVIDENCE', condition: 'ANY_OBSERVED', severity: 'HARD_STOP', delivery: 'NOT_CONFIGURED' }),
  Object.freeze({ ruleCode: 'INTEGRITY_FAILURE', sourceQueryId: 'INTEGRITY_FAILURES', condition: 'ANY_OBSERVED', severity: 'HARD_STOP', delivery: 'NOT_CONFIGURED' }),
  Object.freeze({ ruleCode: 'PRIMARY_DISPLAY_UNSAFE', sourceQueryId: 'PRIMARY_DISPLAY_SAFETY', condition: 'FALSE_STATE_OBSERVED', severity: 'HARD_STOP', delivery: 'NOT_CONFIGURED' }),
  Object.freeze({ ruleCode: 'SESSION_ABORTED', sourceQueryId: 'SESSION_OUTCOMES', condition: 'ABORTED_STATE_OBSERVED', severity: 'CRITICAL', delivery: 'NOT_CONFIGURED' }),
  Object.freeze({ ruleCode: 'INSTRUMENTATION_UNHEALTHY', sourceQueryId: 'INSTRUMENTATION_HEALTH', condition: 'NON_HEALTHY_STATE_OBSERVED', severity: 'HARD_STOP', delivery: 'NOT_CONFIGURED' }),
  Object.freeze({ ruleCode: 'BOUNDARY_FAILURE', sourceQueryId: 'BOUNDARY_RESULTS', condition: 'NON_PASS_STATE_OBSERVED', severity: 'HARD_STOP', delivery: 'NOT_CONFIGURED' }),
  Object.freeze({ ruleCode: 'CONTROL_UNAVAILABLE', sourceQueryId: 'CONTROL_STATE', condition: 'NON_CONFIGURED_STATE_OBSERVED', severity: 'HARD_STOP', delivery: 'NOT_CONFIGURED' }),
] as const);

export type Adr014LocalAlertRule = (typeof ADR014_LOCAL_ALERT_RULES)[number];

export interface Adr014LocalMonitoringSurfaceContract {
  readonly contractVersion: typeof ADR014_LOCAL_OBSERVABILITY_CONTRACT_VERSION;
  readonly locality: 'OWNER_CONTROLLED_LOCAL_ONLY';
  readonly access: 'READ_ONLY';
  readonly defaultMode: 'DISABLED';
  readonly runtimeEmission: 'NONE';
  readonly persistence: 'NOT_CONFIGURED';
  readonly externalDelivery: 'NOT_CONFIGURED';
  readonly dashboardQueries: typeof ADR014_LOCAL_DASHBOARD_QUERIES;
  readonly alertRules: typeof ADR014_LOCAL_ALERT_RULES;
}

export type Adr014LocalObservabilityResult<T> =
  | Readonly<{ status: 'DISABLED' }>
  | Readonly<{ status: 'BLOCKED'; blockerCode: Adr014LocalObservabilityBlockerCode }>
  | Readonly<{ status: 'PREPARED'; value: T }>;

export const ADR014_LOCAL_OBSERVABILITY_BLOCKER_CODES = Object.freeze([
  'INVALID_AUDIT_APPEND_REQUEST',
  'INVALID_AUDIT_CHAIN',
  'AUDIT_CHAIN_CONTINUITY_MISMATCH',
  'BACKDATED_AUDIT_ENTRY',
  'INVALID_EVIDENCE_SEAL_REQUEST',
  'INCOMPLETE_EVIDENCE_REFERENCE_INDEX',
] as const);
export type Adr014LocalObservabilityBlockerCode =
  (typeof ADR014_LOCAL_OBSERVABILITY_BLOCKER_CODES)[number];

export interface Adr014LocalObservabilityPreparation {
  readonly mode: 'DISABLED' | 'TEST_ONLY';
  appendAudit(request: unknown): Adr014LocalObservabilityResult<readonly Adr014LocalAuditEntry[]>;
  sealEvidence(request: unknown): Adr014LocalObservabilityResult<Adr014LocalEvidenceSeal>;
  describeMonitoring(): Adr014LocalObservabilityResult<Adr014LocalMonitoringSurfaceContract>;
}

const FULL_SHA = /^[0-9a-f]{40}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CORRELATION_REFERENCE = /^adr014-correlation:v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AUDIT_REFERENCE = /^adr014-audit:v1:[0-9a-f]{64}$/;
const EVIDENCE_REFERENCE = /^adr014-evidence-seal:v1:[0-9a-f]{64}$/;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const ENVIRONMENT_REFERENCE = /^adr014-ref:v1:environment:[0-9a-f]{32}$/;
const SESSION_REFERENCE = /^adr014-ref:v1:session:[0-9a-f]{32}$/;
const MANIFEST_REFERENCE = /^adr014-ref:v1:manifest:[0-9a-f]{32}$/;
const AUTHORIZATION_REFERENCE = /^adr014-ref:v1:(access-authorization|execution-authorization):[0-9a-f]{32}$/;
const SEAL_ITEM_REFERENCE: Readonly<Record<Adr014EvidenceSealItemKind, RegExp>> = Object.freeze({
  METRIC_WINDOW: /^adr014-metric-window:v1:[0-9a-f]{64}$/,
  DASHBOARD_SNAPSHOT: /^adr014-dashboard-snapshot:v1:[0-9a-f]{64}$/,
  ALERT_INVENTORY: /^adr014-alert-inventory:v1:[0-9a-f]{64}$/,
  AUDIT_CHAIN: /^adr014-audit-chain:v1:[0-9a-f]{64}$/,
});

const DISABLED = Object.freeze({ status: 'DISABLED' as const });
const MONITORING_SURFACE = Object.freeze({
  contractVersion: ADR014_LOCAL_OBSERVABILITY_CONTRACT_VERSION,
  locality: 'OWNER_CONTROLLED_LOCAL_ONLY',
  access: 'READ_ONLY',
  defaultMode: 'DISABLED',
  runtimeEmission: 'NONE',
  persistence: 'NOT_CONFIGURED',
  externalDelivery: 'NOT_CONFIGURED',
  dashboardQueries: ADR014_LOCAL_DASHBOARD_QUERIES,
  alertRules: ADR014_LOCAL_ALERT_RULES,
} as const satisfies Adr014LocalMonitoringSurfaceContract);

const AUDIT_INPUT_KEYS = Object.freeze([
  'correlationReference', 'actorRole', 'action', 'target', 'previousState', 'newState',
  'reasonCode', 'timestamp', 'canonicalSha', 'environmentReference', 'sessionReference',
  'authorizationReference',
] as const);
const AUDIT_ENTRY_KEYS = Object.freeze([
  'contractVersion', 'sequence', 'auditReference', 'parentAuditReference', ...AUDIT_INPUT_KEYS,
] as const);
const APPEND_KEYS = Object.freeze(['chain', 'entry'] as const);
const SEAL_REQUIRED_KEYS = Object.freeze([
  'canonicalSha', 'environmentReference', 'sessionReference', 'manifestReference', 'sealedAt',
  'auditChain', 'items',
] as const);
const ITEM_KEYS = Object.freeze(['kind', 'reference', 'digest'] as const);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function hasSealKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  const expectedLength = SEAL_REQUIRED_KEYS.length +
    (value.supersedesEvidenceReference === undefined ? 0 : 1);
  return keys.length === expectedLength &&
    SEAL_REQUIRED_KEYS.every((key) => keys.includes(key)) &&
    keys.every((key) => key === 'supersedesEvidenceReference' || SEAL_REQUIRED_KEYS.includes(
      key as (typeof SEAL_REQUIRED_KEYS)[number],
    ));
}

function bounded<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && UTC_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function blocked<T>(blockerCode: Adr014LocalObservabilityBlockerCode): Adr014LocalObservabilityResult<T> {
  return Object.freeze({ status: 'BLOCKED' as const, blockerCode });
}

function validAuditFields(value: Record<string, unknown>): value is Record<string, unknown> & Adr014LocalAuditEntryInput {
  return CORRELATION_REFERENCE.test(String(value.correlationReference)) &&
    bounded(ADR014_LOCAL_AUDIT_ACTOR_ROLES, value.actorRole) &&
    bounded(ADR014_LOCAL_AUDIT_ACTIONS, value.action) &&
    bounded(ADR014_LOCAL_AUDIT_TARGETS, value.target) &&
    bounded(ADR014_LOCAL_AUDIT_STATES, value.previousState) &&
    bounded(ADR014_LOCAL_AUDIT_STATES, value.newState) &&
    bounded(ADR014_LOCAL_AUDIT_REASON_CODES, value.reasonCode) &&
    validTimestamp(value.timestamp) && FULL_SHA.test(String(value.canonicalSha)) &&
    ENVIRONMENT_REFERENCE.test(String(value.environmentReference)) &&
    SESSION_REFERENCE.test(String(value.sessionReference)) &&
    AUTHORIZATION_REFERENCE.test(String(value.authorizationReference));
}

function validAuditInput(value: unknown): value is Adr014LocalAuditEntryInput {
  return isObject(value) && hasExactKeys(value, AUDIT_INPUT_KEYS) && validAuditFields(value);
}

function copyAuditInput(input: Adr014LocalAuditEntryInput): Adr014LocalAuditEntryInput {
  return Object.freeze({
    correlationReference: input.correlationReference,
    actorRole: input.actorRole,
    action: input.action,
    target: input.target,
    previousState: input.previousState,
    newState: input.newState,
    reasonCode: input.reasonCode,
    timestamp: input.timestamp,
    canonicalSha: input.canonicalSha,
    environmentReference: input.environmentReference,
    sessionReference: input.sessionReference,
    authorizationReference: input.authorizationReference,
  });
}

function auditReferenceFor(
  sequence: number,
  parentAuditReference: Adr014LocalAuditReference | null,
  input: Adr014LocalAuditEntryInput,
): Adr014LocalAuditReference {
  return `adr014-audit:v1:${digest({
    contractVersion: ADR014_LOCAL_OBSERVABILITY_CONTRACT_VERSION,
    sequence,
    parentAuditReference,
    ...copyAuditInput(input),
  })}`;
}

function copyAuditEntry(entry: Adr014LocalAuditEntry): Adr014LocalAuditEntry {
  return Object.freeze({
    contractVersion: entry.contractVersion,
    sequence: entry.sequence,
    auditReference: entry.auditReference,
    parentAuditReference: entry.parentAuditReference,
    correlationReference: entry.correlationReference,
    actorRole: entry.actorRole,
    action: entry.action,
    target: entry.target,
    previousState: entry.previousState,
    newState: entry.newState,
    reasonCode: entry.reasonCode,
    timestamp: entry.timestamp,
    canonicalSha: entry.canonicalSha,
    environmentReference: entry.environmentReference,
    sessionReference: entry.sessionReference,
    authorizationReference: entry.authorizationReference,
  });
}

function validAuditChain(value: unknown): value is readonly Adr014LocalAuditEntry[] {
  if (!Array.isArray(value)) return false;
  let previous: Adr014LocalAuditEntry | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isObject(entry) || !hasExactKeys(entry, AUDIT_ENTRY_KEYS) ||
      entry.contractVersion !== ADR014_LOCAL_OBSERVABILITY_CONTRACT_VERSION ||
      entry.sequence !== index + 1 || !AUDIT_REFERENCE.test(String(entry.auditReference)) ||
      !validAuditFields(entry) ||
      entry.parentAuditReference !== (previous?.auditReference ?? null) ||
      entry.auditReference !== auditReferenceFor(index + 1, previous?.auditReference ?? null, entry) ||
      (previous !== undefined && (
        entry.canonicalSha !== previous.canonicalSha ||
        entry.sessionReference !== previous.sessionReference ||
        Date.parse(entry.timestamp as string) < Date.parse(previous.timestamp)
      ))) return false;
    previous = entry as unknown as Adr014LocalAuditEntry;
  }
  return true;
}

function appendAudit(request: unknown): Adr014LocalObservabilityResult<readonly Adr014LocalAuditEntry[]> {
  if (!isObject(request) || !hasExactKeys(request, APPEND_KEYS) || !validAuditInput(request.entry)) {
    return blocked('INVALID_AUDIT_APPEND_REQUEST');
  }
  if (!validAuditChain(request.chain)) return blocked('INVALID_AUDIT_CHAIN');
  const chain = request.chain;
  const previous = chain.at(-1);
  if (previous !== undefined && (
    request.entry.canonicalSha !== previous.canonicalSha ||
    request.entry.sessionReference !== previous.sessionReference
  )) return blocked('AUDIT_CHAIN_CONTINUITY_MISMATCH');
  if (previous !== undefined &&
    Date.parse(request.entry.timestamp) < Date.parse(previous.timestamp)) {
    return blocked('BACKDATED_AUDIT_ENTRY');
  }

  const input = copyAuditInput(request.entry);
  const sequence = chain.length + 1;
  const parentAuditReference = previous?.auditReference ?? null;
  const next = Object.freeze({
    contractVersion: ADR014_LOCAL_OBSERVABILITY_CONTRACT_VERSION,
    sequence,
    auditReference: auditReferenceFor(sequence, parentAuditReference, input),
    parentAuditReference,
    ...input,
  });
  return Object.freeze({
    status: 'PREPARED' as const,
    value: Object.freeze([...chain.map(copyAuditEntry), next]),
  });
}

function validSealItem(value: unknown): value is Adr014EvidenceSealItem {
  return isObject(value) && hasExactKeys(value, ITEM_KEYS) &&
    bounded(ADR014_EVIDENCE_SEAL_ITEM_KINDS, value.kind) &&
    typeof value.reference === 'string' && SEAL_ITEM_REFERENCE[value.kind].test(value.reference) &&
    SHA256_DIGEST.test(String(value.digest));
}

function sealEvidence(request: unknown): Adr014LocalObservabilityResult<Adr014LocalEvidenceSeal> {
  if (!isObject(request) || !hasSealKeys(request) ||
    !FULL_SHA.test(String(request.canonicalSha)) || !validTimestamp(request.sealedAt) ||
    !ENVIRONMENT_REFERENCE.test(String(request.environmentReference)) ||
    !SESSION_REFERENCE.test(String(request.sessionReference)) ||
    !MANIFEST_REFERENCE.test(String(request.manifestReference)) ||
    !validAuditChain(request.auditChain) || request.auditChain.length === 0 ||
    !Array.isArray(request.items) || !request.items.every(validSealItem) ||
    (request.supersedesEvidenceReference !== undefined &&
      !EVIDENCE_REFERENCE.test(String(request.supersedesEvidenceReference)))) {
    return blocked('INVALID_EVIDENCE_SEAL_REQUEST');
  }
  const sealRequest = request as unknown as Adr014SealEvidenceRequest;
  const kinds = sealRequest.items.map((item) => item.kind);
  if (ADR014_EVIDENCE_SEAL_ITEM_KINDS.some((kind) => kinds.filter((item) => item === kind).length !== 1)) {
    return blocked('INCOMPLETE_EVIDENCE_REFERENCE_INDEX');
  }
  const terminal = sealRequest.auditChain.at(-1)!;
  if (terminal.canonicalSha !== sealRequest.canonicalSha ||
    terminal.sessionReference !== sealRequest.sessionReference) {
    return blocked('INVALID_EVIDENCE_SEAL_REQUEST');
  }
  const items = Object.freeze(
    ADR014_EVIDENCE_SEAL_ITEM_KINDS.map((kind) => {
      const item = sealRequest.items.find((candidate) => candidate.kind === kind)!;
      return Object.freeze({ kind: item.kind, reference: item.reference, digest: item.digest });
    }),
  );
  const body = {
    contractVersion: ADR014_LOCAL_OBSERVABILITY_CONTRACT_VERSION,
    status: 'REFERENCE_SEALED' as const,
    authority: 'NONE' as const,
    official: false as const,
    persisted: false as const,
    canonicalSha: sealRequest.canonicalSha,
    environmentReference: sealRequest.environmentReference,
    sessionReference: sealRequest.sessionReference,
    manifestReference: sealRequest.manifestReference,
    sealedAt: sealRequest.sealedAt,
    terminalAuditReference: terminal.auditReference,
    items,
    ...(sealRequest.supersedesEvidenceReference === undefined
      ? {}
      : { supersedesEvidenceReference: sealRequest.supersedesEvidenceReference }),
  };
  return Object.freeze({
    status: 'PREPARED' as const,
    value: Object.freeze({
      ...body,
      evidenceReference: `adr014-evidence-seal:v1:${digest(body)}` as Adr014LocalEvidenceSealReference,
    }),
  });
}

export function createAdr014LocalObservabilityPreparation(
  config: Readonly<{ mode: 'DISABLED' | 'TEST_ONLY' }> = Object.freeze({ mode: 'DISABLED' }),
): Adr014LocalObservabilityPreparation {
  const mode = config.mode === 'TEST_ONLY' ? 'TEST_ONLY' : 'DISABLED';
  return Object.freeze({
    mode,
    appendAudit(request: unknown) {
      return mode === 'DISABLED' ? DISABLED : appendAudit(request);
    },
    sealEvidence(request: unknown) {
      return mode === 'DISABLED' ? DISABLED : sealEvidence(request);
    },
    describeMonitoring() {
      return mode === 'DISABLED'
        ? DISABLED
        : Object.freeze({ status: 'PREPARED' as const, value: MONITORING_SURFACE });
    },
  });
}
