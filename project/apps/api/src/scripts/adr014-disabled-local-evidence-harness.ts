export const ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION = '1' as const;
export const ADR014_LOCAL_EVIDENCE_HARNESS_DEFAULT_ENABLED = false as const;

export const ADR014_LOCAL_EVIDENCE_HARNESS_RESULT_STATUSES = Object.freeze([
  'BLOCKED',
  'PREPARED',
] as const);

export const ADR014_LOCAL_EVIDENCE_HARNESS_REFERENCE_KINDS = Object.freeze([
  'ENVIRONMENT',
  'SESSION',
  'MANIFEST',
  'ACCESS_AUTHORIZATION',
  'EXECUTION_AUTHORIZATION',
] as const);

export const ADR014_LOCAL_EVIDENCE_HARNESS_BLOCKER_CODES = Object.freeze([
  'HARNESS_DISABLED',
  'INVALID_REQUEST_SHAPE',
  'UNSUPPORTED_CONTRACT_VERSION',
  'INVALID_CANONICAL_SHA',
  'CANONICAL_SHA_MISMATCH',
  'MISSING_ENVIRONMENT_REFERENCE',
  'MISSING_SESSION_REFERENCE',
  'MISSING_MANIFEST_REFERENCE',
  'MISSING_ACCESS_AUTHORIZATION',
  'MISSING_EXECUTION_AUTHORIZATION',
  'INVALID_OPAQUE_REFERENCE',
  'REFERENCE_BINDING_MISMATCH',
] as const);

export type Adr014LocalEvidenceHarnessResultStatus =
  (typeof ADR014_LOCAL_EVIDENCE_HARNESS_RESULT_STATUSES)[number];
export type Adr014LocalEvidenceHarnessReferenceKind =
  (typeof ADR014_LOCAL_EVIDENCE_HARNESS_REFERENCE_KINDS)[number];
export type Adr014LocalEvidenceHarnessBlockerCode =
  (typeof ADR014_LOCAL_EVIDENCE_HARNESS_BLOCKER_CODES)[number];

export interface Adr014BoundOpaqueReference<K extends Adr014LocalEvidenceHarnessReferenceKind> {
  readonly kind: K;
  readonly opaqueReference: string;
  readonly bindingReference: string;
}

export interface Adr014LocalEvidencePreparationRequest {
  readonly contractVersion: typeof ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION;
  readonly enabled: boolean;
  readonly canonicalSha: string;
  readonly environmentReference: Adr014BoundOpaqueReference<'ENVIRONMENT'>;
  readonly sessionReference: Adr014BoundOpaqueReference<'SESSION'>;
  readonly manifestReference: Adr014BoundOpaqueReference<'MANIFEST'>;
  readonly accessAuthorizationReference: Adr014BoundOpaqueReference<'ACCESS_AUTHORIZATION'>;
  readonly executionAuthorizationReference: Adr014BoundOpaqueReference<'EXECUTION_AUTHORIZATION'>;
}

export interface Adr014LocalEvidenceHarnessConstraints {
  readonly currentCanonicalSha: string;
}

export interface Adr014LocalEvidenceHarnessBlockedResult {
  readonly contractVersion: typeof ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION;
  readonly status: 'BLOCKED';
  readonly blockerCodes: readonly Adr014LocalEvidenceHarnessBlockerCode[];
}

export interface Adr014LocalEvidenceHarnessPreparedResult {
  readonly contractVersion: typeof ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION;
  readonly status: 'PREPARED';
  readonly blockerCodes: readonly [];
}

export type Adr014LocalEvidenceHarnessResult =
  | Adr014LocalEvidenceHarnessBlockedResult
  | Adr014LocalEvidenceHarnessPreparedResult;

const REQUEST_KEYS = Object.freeze([
  'contractVersion',
  'enabled',
  'canonicalSha',
  'environmentReference',
  'sessionReference',
  'manifestReference',
  'accessAuthorizationReference',
  'executionAuthorizationReference',
] as const);

const CONSTRAINT_KEYS = Object.freeze(['currentCanonicalSha'] as const);
const REFERENCE_KEYS = Object.freeze(['kind', 'opaqueReference', 'bindingReference'] as const);
const FULL_LOWERCASE_GIT_SHA = /^[0-9a-f]{40}$/;
const BINDING_REFERENCE = /^adr014-binding:v1:[0-9a-f]{32}$/;

interface ReferenceValidation {
  readonly valid: boolean;
  readonly bindingReference?: string;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(value: object, key: string): unknown {
  return Reflect.get(value, key);
}

function hasOnlyKeys(value: object, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isCanonicalSha(value: unknown): value is string {
  return typeof value === 'string' && FULL_LOWERCASE_GIT_SHA.test(value);
}

function isReferenceMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!isObject(value)) return false;
  const opaqueReference = field(value, 'opaqueReference');
  return opaqueReference === undefined || opaqueReference === '';
}

function isExpectedOpaqueReference(kind: Adr014LocalEvidenceHarnessReferenceKind, value: string): boolean {
  switch (kind) {
    case 'ENVIRONMENT':
      return /^adr014-ref:v1:environment:[0-9a-f]{32}$/.test(value);
    case 'SESSION':
      return /^adr014-ref:v1:session:[0-9a-f]{32}$/.test(value);
    case 'MANIFEST':
      return /^adr014-ref:v1:manifest:[0-9a-f]{32}$/.test(value);
    case 'ACCESS_AUTHORIZATION':
      return /^adr014-ref:v1:access-authorization:[0-9a-f]{32}$/.test(value);
    case 'EXECUTION_AUTHORIZATION':
      return /^adr014-ref:v1:execution-authorization:[0-9a-f]{32}$/.test(value);
  }
}

function validateReference(
  value: unknown,
  expectedKind: Adr014LocalEvidenceHarnessReferenceKind,
): ReferenceValidation {
  if (!isObject(value) || !hasOnlyKeys(value, REFERENCE_KEYS)) return { valid: false };

  const kind = field(value, 'kind');
  const opaqueReference = field(value, 'opaqueReference');
  const bindingReference = field(value, 'bindingReference');

  if (
    kind !== expectedKind ||
    typeof opaqueReference !== 'string' ||
    !isExpectedOpaqueReference(expectedKind, opaqueReference) ||
    typeof bindingReference !== 'string' ||
    !BINDING_REFERENCE.test(bindingReference)
  ) {
    return { valid: false };
  }

  return { valid: true, bindingReference };
}

function addReferenceValidation(
  request: object,
  requestKey: string,
  expectedKind: Adr014LocalEvidenceHarnessReferenceKind,
  missingCode: Adr014LocalEvidenceHarnessBlockerCode,
  blockers: Adr014LocalEvidenceHarnessBlockerCode[],
  bindingReferences: string[],
): void {
  const candidate = field(request, requestKey);
  if (isReferenceMissing(candidate)) {
    blockers.push(missingCode);
    return;
  }

  const validation = validateReference(candidate, expectedKind);
  if (!validation.valid || validation.bindingReference === undefined) {
    blockers.push('INVALID_OPAQUE_REFERENCE');
    return;
  }

  bindingReferences.push(validation.bindingReference);
}

function orderedUniqueBlockers(
  blockers: readonly Adr014LocalEvidenceHarnessBlockerCode[],
): readonly Adr014LocalEvidenceHarnessBlockerCode[] {
  return Object.freeze(
    ADR014_LOCAL_EVIDENCE_HARNESS_BLOCKER_CODES.filter((code) => blockers.includes(code)),
  );
}

function blockedResult(
  blockers: readonly Adr014LocalEvidenceHarnessBlockerCode[],
): Adr014LocalEvidenceHarnessBlockedResult {
  return Object.freeze({
    contractVersion: ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION,
    status: 'BLOCKED' as const,
    blockerCodes: orderedUniqueBlockers(blockers),
  });
}

/**
 * Validates a preparation contract without starting or authorizing execution.
 * The trusted current SHA is an explicit caller constraint because this shell does not inspect Git or process state.
 */
export function prepareAdr014DisabledLocalEvidenceHarness(
  request: Readonly<Adr014LocalEvidencePreparationRequest>,
  constraints: Readonly<Adr014LocalEvidenceHarnessConstraints>,
): Adr014LocalEvidenceHarnessResult {
  if (!isObject(request)) return blockedResult(['INVALID_REQUEST_SHAPE']);

  const blockers: Adr014LocalEvidenceHarnessBlockerCode[] = [];
  const bindingReferences: string[] = [];

  if (!hasOnlyKeys(request, REQUEST_KEYS)) blockers.push('INVALID_REQUEST_SHAPE');

  const enabled = field(request, 'enabled');
  if (enabled !== true) blockers.push('HARNESS_DISABLED');
  if (typeof enabled !== 'boolean') blockers.push('INVALID_REQUEST_SHAPE');

  if (field(request, 'contractVersion') !== ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION) {
    blockers.push('UNSUPPORTED_CONTRACT_VERSION');
  }

  const canonicalSha = field(request, 'canonicalSha');
  const constraintsAreExact = isObject(constraints) && hasOnlyKeys(constraints, CONSTRAINT_KEYS);
  const currentCanonicalSha = isObject(constraints) ? field(constraints, 'currentCanonicalSha') : undefined;
  const requestShaIsValid = isCanonicalSha(canonicalSha);
  const currentShaIsValid = isCanonicalSha(currentCanonicalSha);

  if (!constraintsAreExact) blockers.push('INVALID_REQUEST_SHAPE');
  if (!requestShaIsValid || !currentShaIsValid) blockers.push('INVALID_CANONICAL_SHA');
  if (requestShaIsValid && currentShaIsValid && canonicalSha !== currentCanonicalSha) {
    blockers.push('CANONICAL_SHA_MISMATCH');
  }

  addReferenceValidation(
    request,
    'environmentReference',
    'ENVIRONMENT',
    'MISSING_ENVIRONMENT_REFERENCE',
    blockers,
    bindingReferences,
  );
  addReferenceValidation(
    request,
    'sessionReference',
    'SESSION',
    'MISSING_SESSION_REFERENCE',
    blockers,
    bindingReferences,
  );
  addReferenceValidation(
    request,
    'manifestReference',
    'MANIFEST',
    'MISSING_MANIFEST_REFERENCE',
    blockers,
    bindingReferences,
  );
  addReferenceValidation(
    request,
    'accessAuthorizationReference',
    'ACCESS_AUTHORIZATION',
    'MISSING_ACCESS_AUTHORIZATION',
    blockers,
    bindingReferences,
  );
  addReferenceValidation(
    request,
    'executionAuthorizationReference',
    'EXECUTION_AUTHORIZATION',
    'MISSING_EXECUTION_AUTHORIZATION',
    blockers,
    bindingReferences,
  );

  const firstBinding = bindingReferences[0];
  if (firstBinding !== undefined && bindingReferences.some((reference) => reference !== firstBinding)) {
    blockers.push('REFERENCE_BINDING_MISMATCH');
  }

  if (blockers.length > 0) return blockedResult(blockers);

  return Object.freeze({
    contractVersion: ADR014_LOCAL_EVIDENCE_HARNESS_CONTRACT_VERSION,
    status: 'PREPARED' as const,
    blockerCodes: Object.freeze([] as []),
  });
}
