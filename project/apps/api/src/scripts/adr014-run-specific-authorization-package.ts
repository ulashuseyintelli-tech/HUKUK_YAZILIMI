import { createHash } from 'node:crypto';
import {
  ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION,
  type Adr014BoundOpaqueReference,
  prepareAdr014DisabledLocalEvidenceHarness,
} from './adr014-disabled-local-evidence-harness';

export const ADR014_RUN_AUTHORIZATION_PACKAGE_CONTRACT_VERSION = '1' as const;

export const ADR014_RUN_AUTHORIZATION_PACKAGE_STATUSES = Object.freeze([
  'BLOCKED',
  'PACKAGE_COMPLETE',
] as const);

export const ADR014_RUN_AUTHORIZATION_SIGNOFF_SCOPES = Object.freeze([
  'TECHNICAL',
  'PRIVACY',
  'FINANCIAL',
  'LEGAL',
  'OPERATIONS',
] as const);

export const ADR014_RUN_AUTHORIZATION_BLOCKER_CODES = Object.freeze([
  'INVALID_REQUEST_SHAPE',
  'UNSUPPORTED_CONTRACT_VERSION',
  'INVALID_CANONICAL_SHA',
  'CANONICAL_SHA_MISMATCH',
  'MISSING_ENVIRONMENT_REFERENCE',
  'MISSING_SESSION_REFERENCE',
  'MISSING_APPROVED_MANIFEST_REFERENCE',
  'MANIFEST_NOT_APPROVED',
  'MISSING_ACCESS_AUTHORIZATION',
  'MISSING_EXECUTION_AUTHORIZATION',
  'AUTHORIZATION_REFERENCES_NOT_DISTINCT',
  'REFERENCE_BINDING_MISMATCH',
  'MISSING_OPERATOR_ASSIGNMENT',
  'MISSING_INDEPENDENT_REVIEWER_ASSIGNMENT',
  'ASSIGNMENT_CONFLICT',
  'INVALID_ACCESS_WINDOW',
  'INVALID_EXECUTION_WINDOW',
  'EXECUTION_OUTSIDE_ACCESS_WINDOW',
  'MISSING_READ_ONLY_PROOF',
  'MISSING_NO_EGRESS_PROOF',
  'MISSING_OUTPUT_PATH_CONTRACT',
  'MISSING_RETENTION_DECISION',
  'INVALID_RETENTION_DURATION',
  'MISSING_BASELINE_DEFINITION',
  'INVALID_BASELINE_WINDOW',
  'INVALID_POPULATION_OR_REQUEST_COUNT',
  'MISSING_TECHNICAL_SIGNOFF',
  'MISSING_PRIVACY_SIGNOFF',
  'MISSING_FINANCIAL_SIGNOFF',
  'MISSING_LEGAL_SIGNOFF',
  'MISSING_OPERATIONS_SIGNOFF',
  'SIGNOFF_NOT_APPROVED',
] as const);

export type Adr014RunAuthorizationPackageStatus =
  (typeof ADR014_RUN_AUTHORIZATION_PACKAGE_STATUSES)[number];
export type Adr014RunAuthorizationSignoffScope =
  (typeof ADR014_RUN_AUTHORIZATION_SIGNOFF_SCOPES)[number];
export type Adr014RunAuthorizationBlockerCode =
  (typeof ADR014_RUN_AUTHORIZATION_BLOCKER_CODES)[number];

export interface Adr014AuthorizationWindow {
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface Adr014ApprovedManifestReference {
  readonly reference: Adr014BoundOpaqueReference<'MANIFEST'>;
  readonly approvalStatus: 'APPROVED';
  readonly approvalReference: string;
}

export interface Adr014RunAuthorizationRecord<K extends 'ACCESS_AUTHORIZATION' | 'EXECUTION_AUTHORIZATION'> {
  readonly reference: Adr014BoundOpaqueReference<K>;
  readonly approvalStatus: 'APPROVED';
  readonly authorizedByReference: string;
  readonly window: Adr014AuthorizationWindow;
}

export interface Adr014RunRoleAssignment {
  readonly actorReference: string;
  readonly assignmentReference: string;
}

export interface Adr014ReadOnlyProofContract {
  readonly proofReference: string;
  readonly sourceAccess: 'READ_ONLY';
  readonly transactionBoundary: 'REPEATABLE_READ_READ_ONLY';
  readonly writeBack: 'FORBIDDEN';
}

export interface Adr014NoEgressProofContract {
  readonly proofReference: string;
  readonly networkBoundary: 'NO_EGRESS';
  readonly externalServices: 'FORBIDDEN';
  readonly externalAi: 'FORBIDDEN';
  readonly cloudOrRemoteStaging: 'FORBIDDEN';
}

export interface Adr014OutputPathContract {
  readonly outputPathReference: string;
  readonly ownerControlledRootReference: string;
  readonly locality: 'OWNER_CONTROLLED_LOCAL';
  readonly writeMode: 'CREATE_ONCE';
}

export interface Adr014RetentionDecision {
  readonly ownerReference: string;
  readonly durationDays: number;
  readonly dispositionRuleReference: string;
}

export interface Adr014BaselineDefinition {
  readonly window: Adr014AuthorizationWindow;
  readonly warmupRequestCount: number;
  readonly populationCount: number;
  readonly requestCount: number;
  readonly latencyPercentiles: readonly ['P95', 'P99'];
  readonly errorComparisonBasis: 'BASELINE_RELATIVE';
  readonly timeoutComparisonBasis: 'BASELINE_RELATIVE';
}

export interface Adr014RunAuthorizationSignoff {
  readonly scope: Adr014RunAuthorizationSignoffScope;
  readonly reviewerReference: string;
  readonly decisionReference: string;
  readonly decision: 'APPROVED_FOR_RUN';
}

export interface Adr014RunSpecificAuthorizationPackageRequest {
  readonly contractVersion: typeof ADR014_RUN_AUTHORIZATION_PACKAGE_CONTRACT_VERSION;
  readonly canonicalSha: string;
  readonly environmentReference: Adr014BoundOpaqueReference<'ENVIRONMENT'>;
  readonly sessionReference: Adr014BoundOpaqueReference<'SESSION'>;
  readonly approvedManifest: Adr014ApprovedManifestReference;
  readonly accessAuthorization: Adr014RunAuthorizationRecord<'ACCESS_AUTHORIZATION'>;
  readonly executionAuthorization: Adr014RunAuthorizationRecord<'EXECUTION_AUTHORIZATION'>;
  readonly operatorAssignment: Adr014RunRoleAssignment;
  readonly independentReviewerAssignment: Adr014RunRoleAssignment;
  readonly readOnlyProof: Adr014ReadOnlyProofContract;
  readonly noEgressProof: Adr014NoEgressProofContract;
  readonly outputPath: Adr014OutputPathContract;
  readonly retention: Adr014RetentionDecision;
  readonly baseline: Adr014BaselineDefinition;
  readonly signoffs: readonly Adr014RunAuthorizationSignoff[];
}

export interface Adr014RunAuthorizationConstraints {
  readonly currentCanonicalSha: string;
}

export interface Adr014CompletedRunAuthorizationPackage
  extends Adr014RunSpecificAuthorizationPackageRequest {
  readonly packageReference: string;
  readonly status: 'PACKAGE_COMPLETE';
  readonly executionStarted: false;
  readonly representativeEvidenceProduced: false;
  readonly representativeEvidenceAccepted: false;
  readonly pr11Ready: false;
  readonly runtimeCutoverAuthorized: false;
  readonly authority: 'RUN_SPECIFIC_AUTHORIZATION_REFERENCES_ONLY';
}

export type Adr014RunAuthorizationPackageResult =
  | Readonly<{
      contractVersion: typeof ADR014_RUN_AUTHORIZATION_PACKAGE_CONTRACT_VERSION;
      status: 'BLOCKED';
      blockerCodes: readonly Adr014RunAuthorizationBlockerCode[];
    }>
  | Readonly<{
      contractVersion: typeof ADR014_RUN_AUTHORIZATION_PACKAGE_CONTRACT_VERSION;
      status: 'PACKAGE_COMPLETE';
      blockerCodes: readonly [];
      package: Readonly<Adr014CompletedRunAuthorizationPackage>;
    }>;

const FULL_SHA = /^[0-9a-f]{40}$/;
const OPAQUE_REF = /^adr014-ref:v1:[a-z][a-z0-9-]*:[0-9a-f]{32}$/;
const BINDING_REF = /^adr014-binding:v1:[0-9a-f]{32}$/;
const OUTPUT_REF = /^adr014-output-path:v1:[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const REQUEST_KEYS = Object.freeze([
  'contractVersion', 'canonicalSha', 'environmentReference', 'sessionReference',
  'approvedManifest', 'accessAuthorization', 'executionAuthorization', 'operatorAssignment',
  'independentReviewerAssignment', 'readOnlyProof', 'noEgressProof', 'outputPath', 'retention',
  'baseline', 'signoffs',
] as const);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validOpaque(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_REF.test(value);
}

function validWindow(value: unknown): value is Adr014AuthorizationWindow {
  if (!isObject(value) || !exactKeys(value, ['startsAt', 'endsAt'])) return false;
  if (typeof value.startsAt !== 'string' || typeof value.endsAt !== 'string') return false;
  if (!ISO_INSTANT.test(value.startsAt) || !ISO_INSTANT.test(value.endsAt)) return false;
  return Date.parse(value.startsAt) < Date.parse(value.endsAt);
}

function validAssignment(value: unknown): value is Adr014RunRoleAssignment {
  return isObject(value) && exactKeys(value, ['actorReference', 'assignmentReference']) &&
    validOpaque(value.actorReference) && validOpaque(value.assignmentReference);
}

function bindingOf(value: unknown): string | undefined {
  return isObject(value) && typeof value.bindingReference === 'string' &&
    BINDING_REF.test(value.bindingReference) ? value.bindingReference : undefined;
}

function blocked(codes: readonly Adr014RunAuthorizationBlockerCode[]): Adr014RunAuthorizationPackageResult {
  return Object.freeze({
    contractVersion: ADR014_RUN_AUTHORIZATION_PACKAGE_CONTRACT_VERSION,
    status: 'BLOCKED' as const,
    blockerCodes: Object.freeze(
      ADR014_RUN_AUTHORIZATION_BLOCKER_CODES.filter((code) => codes.includes(code)),
    ),
  });
}

function signoffBlocker(scope: Adr014RunAuthorizationSignoffScope): Adr014RunAuthorizationBlockerCode {
  switch (scope) {
    case 'TECHNICAL': return 'MISSING_TECHNICAL_SIGNOFF';
    case 'PRIVACY': return 'MISSING_PRIVACY_SIGNOFF';
    case 'FINANCIAL': return 'MISSING_FINANCIAL_SIGNOFF';
    case 'LEGAL': return 'MISSING_LEGAL_SIGNOFF';
    case 'OPERATIONS': return 'MISSING_OPERATIONS_SIGNOFF';
  }
}

function validSignoff(value: unknown): value is Adr014RunAuthorizationSignoff {
  return isObject(value) &&
    exactKeys(value, ['scope', 'reviewerReference', 'decisionReference', 'decision']) &&
    ADR014_RUN_AUTHORIZATION_SIGNOFF_SCOPES.includes(
      value.scope as Adr014RunAuthorizationSignoffScope,
    ) && validOpaque(value.reviewerReference) && validOpaque(value.decisionReference) &&
    value.decision === 'APPROVED_FOR_RUN';
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Validates and seals run-specific authorization references. It performs no access,
 * execution, evidence capture, telemetry activation or runtime authority promotion.
 */
export function completeAdr014RunSpecificAuthorizationPackage(
  candidate: unknown,
  constraints: Readonly<Adr014RunAuthorizationConstraints>,
): Adr014RunAuthorizationPackageResult {
  if (!isObject(candidate)) return blocked(['INVALID_REQUEST_SHAPE']);
  const blockers: Adr014RunAuthorizationBlockerCode[] = [];

  if (!exactKeys(candidate, REQUEST_KEYS)) blockers.push('INVALID_REQUEST_SHAPE');
  if (candidate.contractVersion !== ADR014_RUN_AUTHORIZATION_PACKAGE_CONTRACT_VERSION) {
    blockers.push('UNSUPPORTED_CONTRACT_VERSION');
  }

  const canonicalSha = candidate.canonicalSha;
  const currentCanonicalSha = constraints?.currentCanonicalSha;
  if (typeof canonicalSha !== 'string' || !FULL_SHA.test(canonicalSha) ||
    typeof currentCanonicalSha !== 'string' || !FULL_SHA.test(currentCanonicalSha)) {
    blockers.push('INVALID_CANONICAL_SHA');
  } else if (canonicalSha !== currentCanonicalSha) {
    blockers.push('CANONICAL_SHA_MISMATCH');
  }

  const approvedManifest = candidate.approvedManifest;
  const access = candidate.accessAuthorization;
  const execution = candidate.executionAuthorization;
  if (!isObject(approvedManifest) || !isObject(approvedManifest.reference)) {
    blockers.push('MISSING_APPROVED_MANIFEST_REFERENCE');
  } else if (approvedManifest.approvalStatus !== 'APPROVED' ||
    !validOpaque(approvedManifest.approvalReference)) {
    blockers.push('MANIFEST_NOT_APPROVED');
  }
  if (!isObject(access) || !isObject(access.reference)) blockers.push('MISSING_ACCESS_AUTHORIZATION');
  if (!isObject(execution) || !isObject(execution.reference)) blockers.push('MISSING_EXECUTION_AUTHORIZATION');

  if (isObject(access) && isObject(execution) && isObject(access.reference) &&
    isObject(execution.reference) && access.reference.opaqueReference === execution.reference.opaqueReference) {
    blockers.push('AUTHORIZATION_REFERENCES_NOT_DISTINCT');
  }

  const harnessResult = prepareAdr014DisabledLocalEvidenceHarness({
    contractVersion: ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION,
    enabled: true,
    canonicalSha: typeof canonicalSha === 'string' ? canonicalSha : '',
    environmentReference: candidate.environmentReference,
    sessionReference: candidate.sessionReference,
    manifestReference: isObject(approvedManifest) ? approvedManifest.reference : undefined,
    accessAuthorizationReference: isObject(access) ? access.reference : undefined,
    executionAuthorizationReference: isObject(execution) ? execution.reference : undefined,
  } as never, { currentCanonicalSha });
  if (harnessResult.status === 'BLOCKED') {
    if (harnessResult.blockerCodes.includes('MISSING_ENVIRONMENT_REFERENCE')) blockers.push('MISSING_ENVIRONMENT_REFERENCE');
    if (harnessResult.blockerCodes.includes('MISSING_SESSION_REFERENCE')) blockers.push('MISSING_SESSION_REFERENCE');
    if (harnessResult.blockerCodes.includes('MISSING_MANIFEST_REFERENCE')) blockers.push('MISSING_APPROVED_MANIFEST_REFERENCE');
    if (harnessResult.blockerCodes.includes('MISSING_ACCESS_AUTHORIZATION')) blockers.push('MISSING_ACCESS_AUTHORIZATION');
    if (harnessResult.blockerCodes.includes('MISSING_EXECUTION_AUTHORIZATION')) blockers.push('MISSING_EXECUTION_AUTHORIZATION');
    if (harnessResult.blockerCodes.includes('REFERENCE_BINDING_MISMATCH') ||
      harnessResult.blockerCodes.includes('INVALID_OPAQUE_REFERENCE')) blockers.push('REFERENCE_BINDING_MISMATCH');
  }

  const bindings = [candidate.environmentReference, candidate.sessionReference,
    isObject(approvedManifest) ? approvedManifest.reference : undefined,
    isObject(access) ? access.reference : undefined, isObject(execution) ? execution.reference : undefined]
    .map(bindingOf).filter((value): value is string => value !== undefined);
  if (bindings.length > 1 && bindings.some((value) => value !== bindings[0])) {
    blockers.push('REFERENCE_BINDING_MISMATCH');
  }

  if (!validAssignment(candidate.operatorAssignment)) blockers.push('MISSING_OPERATOR_ASSIGNMENT');
  if (!validAssignment(candidate.independentReviewerAssignment)) {
    blockers.push('MISSING_INDEPENDENT_REVIEWER_ASSIGNMENT');
  }
  if (validAssignment(candidate.operatorAssignment) && validAssignment(candidate.independentReviewerAssignment) &&
    candidate.operatorAssignment.actorReference === candidate.independentReviewerAssignment.actorReference) {
    blockers.push('ASSIGNMENT_CONFLICT');
  }

  const accessWindow = isObject(access) ? access.window : undefined;
  const executionWindow = isObject(execution) ? execution.window : undefined;
  if (!validWindow(accessWindow) || !isObject(access) || access.approvalStatus !== 'APPROVED' ||
    !validOpaque(access.authorizedByReference)) blockers.push('INVALID_ACCESS_WINDOW');
  if (!validWindow(executionWindow) || !isObject(execution) || execution.approvalStatus !== 'APPROVED' ||
    !validOpaque(execution.authorizedByReference)) blockers.push('INVALID_EXECUTION_WINDOW');
  if (validWindow(accessWindow) && validWindow(executionWindow) &&
    (Date.parse(executionWindow.startsAt) < Date.parse(accessWindow.startsAt) ||
      Date.parse(executionWindow.endsAt) > Date.parse(accessWindow.endsAt))) {
    blockers.push('EXECUTION_OUTSIDE_ACCESS_WINDOW');
  }

  const readOnly = candidate.readOnlyProof;
  if (!isObject(readOnly) || !exactKeys(readOnly, ['proofReference', 'sourceAccess', 'transactionBoundary', 'writeBack']) ||
    !validOpaque(readOnly.proofReference) || readOnly.sourceAccess !== 'READ_ONLY' ||
    readOnly.transactionBoundary !== 'REPEATABLE_READ_READ_ONLY' || readOnly.writeBack !== 'FORBIDDEN') {
    blockers.push('MISSING_READ_ONLY_PROOF');
  }
  const noEgress = candidate.noEgressProof;
  if (!isObject(noEgress) || !exactKeys(noEgress, ['proofReference', 'networkBoundary', 'externalServices', 'externalAi', 'cloudOrRemoteStaging']) ||
    !validOpaque(noEgress.proofReference) || noEgress.networkBoundary !== 'NO_EGRESS' ||
    noEgress.externalServices !== 'FORBIDDEN' || noEgress.externalAi !== 'FORBIDDEN' ||
    noEgress.cloudOrRemoteStaging !== 'FORBIDDEN') blockers.push('MISSING_NO_EGRESS_PROOF');

  const output = candidate.outputPath;
  if (!isObject(output) || !exactKeys(output, ['outputPathReference', 'ownerControlledRootReference', 'locality', 'writeMode']) ||
    typeof output.outputPathReference !== 'string' || !OUTPUT_REF.test(output.outputPathReference) ||
    !validOpaque(output.ownerControlledRootReference) || output.locality !== 'OWNER_CONTROLLED_LOCAL' ||
    output.writeMode !== 'CREATE_ONCE') blockers.push('MISSING_OUTPUT_PATH_CONTRACT');

  const retention = candidate.retention;
  if (!isObject(retention) || !exactKeys(retention, ['ownerReference', 'durationDays', 'dispositionRuleReference']) ||
    !validOpaque(retention.ownerReference) || !validOpaque(retention.dispositionRuleReference)) {
    blockers.push('MISSING_RETENTION_DECISION');
  }
  if (!isObject(retention) || !Number.isInteger(retention.durationDays) ||
    Number(retention.durationDays) <= 0) blockers.push('INVALID_RETENTION_DURATION');

  const baseline = candidate.baseline;
  if (!isObject(baseline) || !exactKeys(baseline, ['window', 'warmupRequestCount', 'populationCount', 'requestCount',
    'latencyPercentiles', 'errorComparisonBasis', 'timeoutComparisonBasis'])) {
    blockers.push('MISSING_BASELINE_DEFINITION');
  } else {
    if (!validWindow(baseline.window)) blockers.push('INVALID_BASELINE_WINDOW');
    if (!Number.isInteger(baseline.warmupRequestCount) || Number(baseline.warmupRequestCount) < 0 ||
      !Number.isInteger(baseline.populationCount) || Number(baseline.populationCount) <= 0 ||
      !Number.isInteger(baseline.requestCount) || Number(baseline.requestCount) <= 0) {
      blockers.push('INVALID_POPULATION_OR_REQUEST_COUNT');
    }
    if (!Array.isArray(baseline.latencyPercentiles) || baseline.latencyPercentiles.length !== 2 ||
      baseline.latencyPercentiles[0] !== 'P95' || baseline.latencyPercentiles[1] !== 'P99' ||
      baseline.errorComparisonBasis !== 'BASELINE_RELATIVE' ||
      baseline.timeoutComparisonBasis !== 'BASELINE_RELATIVE') blockers.push('MISSING_BASELINE_DEFINITION');
  }

  const signoffs = candidate.signoffs;
  if (!Array.isArray(signoffs)) {
    for (const scope of ADR014_RUN_AUTHORIZATION_SIGNOFF_SCOPES) blockers.push(signoffBlocker(scope));
  } else {
    for (const scope of ADR014_RUN_AUTHORIZATION_SIGNOFF_SCOPES) {
      const matches = signoffs.filter((signoff) => isObject(signoff) && signoff.scope === scope);
      if (matches.length !== 1) blockers.push(signoffBlocker(scope));
      else if (!validSignoff(matches[0])) blockers.push('SIGNOFF_NOT_APPROVED');
    }
    if (signoffs.some((signoff) => !validSignoff(signoff))) blockers.push('SIGNOFF_NOT_APPROVED');
  }

  if (blockers.length > 0) return blocked(blockers);

  const request = canonicalize(candidate) as Adr014RunSpecificAuthorizationPackageRequest;
  const body = deepFreeze({
    ...request,
    signoffs: [...request.signoffs].sort((left, right) =>
      ADR014_RUN_AUTHORIZATION_SIGNOFF_SCOPES.indexOf(left.scope) -
      ADR014_RUN_AUTHORIZATION_SIGNOFF_SCOPES.indexOf(right.scope)),
    status: 'PACKAGE_COMPLETE' as const,
    executionStarted: false as const,
    representativeEvidenceProduced: false as const,
    representativeEvidenceAccepted: false as const,
    pr11Ready: false as const,
    runtimeCutoverAuthorized: false as const,
    authority: 'RUN_SPECIFIC_AUTHORIZATION_REFERENCES_ONLY' as const,
  });
  const packageReference = `adr014-authorization-package:v1:${createHash('sha256')
    .update(stableJson(body)).digest('hex')}`;
  const completed = deepFreeze({ ...body, packageReference });
  return Object.freeze({
    contractVersion: ADR014_RUN_AUTHORIZATION_PACKAGE_CONTRACT_VERSION,
    status: 'PACKAGE_COMPLETE' as const,
    blockerCodes: Object.freeze([] as []),
    package: completed,
  });
}
