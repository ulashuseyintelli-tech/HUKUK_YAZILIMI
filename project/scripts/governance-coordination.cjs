#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const EFFECTIVE_FROM_MAIN_SHA = 'c046819b968d16f20cf2834ba805beb22e4aa488';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PROJECT_ROOT, '..');
const GOVERNANCE_ROOT = path.join(PROJECT_ROOT, 'docs', 'governance');
const POLICY_PATH = path.join(
  GOVERNANCE_ROOT,
  'governance-writer-coordination-protected-paths.json',
);
const REGISTER_PATH = path.join(
  GOVERNANCE_ROOT,
  'governance-writer-coordination-register.md',
);
const REQUESTS_ROOT = path.join(GOVERNANCE_ROOT, 'coordination-requests');
const RESULTS_ROOT = path.join(GOVERNANCE_ROOT, 'coordination-results');
const GRANT_REPO_PATH =
  'project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md';

const REQUEST_KEYS = [
  'schemaVersion',
  'requestId',
  'requestFingerprint',
  'requestedBy',
  'createdAt',
  'baseMainSha',
  'semanticAuthorityRef',
  'executionGrantRef',
  'operation',
  'declaredTargetAllowlist',
];
const AUTHORITY_REF_KEYS = ['kind', 'path', 'recordId', 'evidenceSha'];
const AUTHORITY_KINDS = new Set(['SEMANTIC_AUTHORITY', 'EXECUTION_GRANT']);
const AUTHORITY_RECORD_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/;
const OPERATION_KEYS = [
  'type',
  'changeClass',
  'targetFile',
  'recordIdentity',
  'anchor',
  'expectedOldValue',
  'newValue',
  'evidenceSha',
  'expectedResultSha256',
];
const RESULT_KEYS = [
  'schemaVersion',
  'resultId',
  'requestId',
  'requestFingerprint',
  'status',
  'executionPrNumber',
  'executionMergeSha',
  'effectiveMainSha',
  'completedAt',
  'validationEvidence',
];
const EVIDENCE_KEYS = ['name', 'status', 'evidenceSha'];
const RESULT_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'BLOCKED', 'REJECTED']);
const LEVEL_2_OPERATIONS = new Set([
  'EXACT_APPEND_AT_DECLARED_ANCHOR',
  'EXACT_LITERAL_REPLACEMENT',
  'EXACT_REFERENCE_REWRITE',
  'DETERMINISTIC_REGISTER_REGENERATION',
]);

const BOOTSTRAP_MODIFY = new Set([
  '.github/workflows/ci.yml',
  'AGENTS.md',
  'project/docs/governance/GOVERNANCE-INDEX.md',
  'project/docs/governance/decision-log.md',
]);
const BOOTSTRAP_ADD = new Set([
  'project/docs/governance/governance-writer-coordination-contract.md',
  'project/docs/governance/governance-writer-coordination-cutover-record.md',
  'project/docs/governance/governance-writer-coordination-protected-paths.json',
  'project/docs/governance/governance-writer-coordination-register.md',
  'project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md',
  'project/docs/governance/coordination-requests/README.md',
  'project/docs/governance/coordination-requests/_template/request.md',
  'project/docs/governance/coordination-results/README.md',
  'project/docs/governance/coordination-results/_template/result.md',
  'project/scripts/governance-coordination.cjs',
  'project/scripts/governance-coordination.test.cjs',
]);
const BOOTSTRAP_ALL = new Set([...BOOTSTRAP_MODIFY, ...BOOTSTRAP_ADD]);
const AUTHORITY_LOCATOR_REPAIR_I01 = Object.freeze({
  mode: 'AUTHORITY_LOCATOR_REPAIR_I01',
  baseSha: 'feadf408e9b6d02738d43a0ae78e38f75e594996',
  headRef: 'codex/gov-coord-v1-authority-locator-repair-i01',
  changedPaths: Object.freeze([
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
    'project/docs/governance/governance-writer-coordination-contract.md',
    'project/docs/governance/decision-log.md',
    GRANT_REPO_PATH,
  ]),
  semanticAuthority: Object.freeze({
    kind: 'SEMANTIC_AUTHORITY',
    path: 'project/docs/governance/decision-log.md',
    recordId: 'CLIENT-P2-U03-TRACK-B-D01-GOV',
  }),
  executionGrant: Object.freeze({
    kind: 'EXECUTION_GRANT',
    path: GRANT_REPO_PATH,
    recordId: 'GOV-COORD-V1-CODEX-LOCAL',
  }),
});
const AUTHORITY_LOCATOR_REPAIR_I01_PATHS = new Set(
  AUTHORITY_LOCATOR_REPAIR_I01.changedPaths,
);
const REGISTER_TEST_FIXTURE_REPAIR_I01 = Object.freeze({
  mode: 'REGISTER_TEST_FIXTURE_REPAIR_I01',
  baseSha: 'a02498dfd50e349b2cb1eddfbde0561ece30fba6',
  headRef: 'codex/gov-coord-v1-register-test-fixture-repair-i01',
  changedPaths: Object.freeze([
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
    'project/docs/governance/governance-writer-coordination-contract.md',
  ]),
});
const REGISTER_TEST_FIXTURE_REPAIR_I01_PATHS = new Set(
  REGISTER_TEST_FIXTURE_REPAIR_I01.changedPaths,
);
const EXECUTION_BASE_ANCESTRY_REPAIR_I01 = Object.freeze({
  mode: 'EXECUTION_BASE_ANCESTRY_REPAIR_I01',
  baseSha: 'c714769b10a60152b14c61b7fd75e76386fedfb9',
  headRef: 'codex/gov-coord-v1-execution-base-ancestry-repair-i01',
  changedPaths: Object.freeze([
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
  ]),
});
const EXECUTION_BASE_ANCESTRY_REPAIR_I01_PATHS = new Set(
  EXECUTION_BASE_ANCESTRY_REPAIR_I01.changedPaths,
);
const NONCOORD_PR_CLASSIFIER_REPAIR_R01 = Object.freeze({
  mode: 'NONCOORD_PR_CLASSIFIER_REPAIR_R01',
  baseSha: 'ba26f6adb98e3c1a7687f025e6d7dcd470e3fb6b',
  headRef: 'codex/gov-coord-noncoord-classifier-repair-r01',
  changedPaths: Object.freeze([
    'project/scripts/governance-coordination.cjs',
    'project/scripts/governance-coordination.test.cjs',
  ]),
});
const NONCOORD_PR_CLASSIFIER_REPAIR_R01_PATHS = new Set(
  NONCOORD_PR_CLASSIFIER_REPAIR_R01.changedPaths,
);
const REGISTER_REPO_PATH =
  'project/docs/governance/governance-writer-coordination-register.md';
const REQUEST_ONLY_BRANCH_PATTERN =
  /^codex\/gov-coord-(?:[a-z0-9]+-)*request-only(?:-[a-z0-9]+)*$/;
const EXECUTION_BRANCH_PATTERN =
  /^codex\/gov-exec\/(GOV-REQ-\d{8}-[A-Z0-9][A-Z0-9-]*)$/;
const RESULT_ONLY_BRANCH_PATTERN =
  /^codex\/gov-result\/(GOV-REQ-\d{8}-[A-Z0-9][A-Z0-9-]*)$/;

class CoordinationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'CoordinationError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new CoordinationError(code, message);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    reject('SCHEMA_INVALID', `${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    const unknown = actual.filter((key) => !expected.includes(key));
    const missing = expected.filter((key) => !actual.includes(key));
    reject(
      'UNKNOWN_OR_MISSING_FIELD',
      `${label} unknown=[${unknown.join(',')}] missing=[${missing.join(',')}]`,
    );
  }
}

function assertNonEmptyString(value, label, template = false) {
  if (typeof value !== 'string' || value.length === 0) {
    reject('SCHEMA_INVALID', `${label} must be a non-empty string`);
  }
  if (value.includes('\u0000')) {
    reject('SCHEMA_INVALID', `${label} contains NUL`);
  }
  if (!template && value.startsWith('TEMPLATE_')) {
    reject('TEMPLATE_VALUE_FORBIDDEN', `${label} contains an unresolved template value`);
  }
}

function assertAuthorityRecordId(value, label, template = false) {
  assertNonEmptyString(value, label, template);
  if (template && value.startsWith('TEMPLATE_')) return;
  if (!AUTHORITY_RECORD_ID_PATTERN.test(value)) {
    reject(
      'AUTHORITY_RECORD_ID_INVALID',
      `${label} must contain only uppercase ASCII letters, digits, and hyphens`,
    );
  }
}

function assertSha(value, label, template = false) {
  assertNonEmptyString(value, label, template);
  if (template && value.startsWith('TEMPLATE_')) return;
  if (!/^[0-9a-f]{40}$/.test(value)) {
    reject('SHA_INVALID', `${label} must be a lowercase 40-character Git SHA`);
  }
}

function assertSha256(value, label, template = false) {
  assertNonEmptyString(value, label, template);
  if (template && value === 'TEMPLATE_COMPUTE_BEFORE_SUBMISSION') return;
  if (template && value.startsWith('TEMPLATE_')) return;
  if (!/^[0-9a-f]{64}$/.test(value)) {
    reject('DIGEST_INVALID', `${label} must be a lowercase SHA-256 digest`);
  }
}

function assertTimestamp(value, label, template = false) {
  assertNonEmptyString(value, label, template);
  if (template && value.startsWith('TEMPLATE_')) return;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    reject('TIMESTAMP_INVALID', `${label} must be UTC RFC3339 at second precision`);
  }
}

function normalizeRepoPath(value, label = 'path') {
  assertNonEmptyString(value, label);
  if (
    path.isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith('/') ||
    value.startsWith('\\\\')
  ) {
    reject('ABSOLUTE_PATH_FORBIDDEN', `${label} must be repository-relative`);
  }
  if (value.includes('\\')) {
    reject('BACKSLASH_PATH_FORBIDDEN', `${label} must use POSIX separators`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    reject('PATH_TRAVERSAL_FORBIDDEN', `${label} contains an unsafe segment`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith('../')) {
    reject('PATH_TRAVERSAL_FORBIDDEN', `${label} is not canonical`);
  }
  return normalized;
}

function matchesPattern(repoPath, pattern) {
  if (pattern.includes('<requestId>')) {
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace('<requestId>', '[A-Za-z0-9._-]+');
    return new RegExp(`^${escaped}$`).test(repoPath);
  }
  if (pattern.endsWith('/**')) {
    return repoPath.startsWith(pattern.slice(0, -2));
  }
  if (pattern.endsWith('*')) {
    return repoPath.startsWith(pattern.slice(0, -1));
  }
  return repoPath === pattern;
}

function matchesAny(repoPath, patterns) {
  return patterns.some((pattern) => matchesPattern(repoPath, pattern));
}

function loadPolicy(policyPath = POLICY_PATH) {
  const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    reject('POLICY_SCHEMA_INVALID', 'protected-path policy schemaVersion must be 1');
  }
  if (parsed.effectiveFromMainSha !== EFFECTIVE_FROM_MAIN_SHA) {
    reject('POLICY_BASELINE_INVALID', 'protected-path policy effectiveFromMainSha mismatch');
  }
  return parsed;
}

function isRequestInstancePath(repoPath) {
  return /^project\/docs\/governance\/coordination-requests\/[A-Za-z0-9._-]+\/request\.md$/.test(
    repoPath,
  );
}

function isResultInstancePath(repoPath) {
  return /^project\/docs\/governance\/coordination-results\/[A-Za-z0-9._-]+\/result\.md$/.test(
    repoPath,
  );
}

function isCoordinationControlPlane(repoPath, policy) {
  return matchesAny(repoPath, policy.coordinationControlPlane);
}

function validateTargetPolicy(targetFile, operationType, policy = loadPolicy()) {
  const normalized = normalizeRepoPath(targetFile, 'operation.targetFile');

  if (policy.deniedTargetPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    reject('PRODUCTION_TARGET_FORBIDDEN', `${normalized} is outside governance scope`);
  }
  if (
    policy.grandfatheredOwnerWipExactPaths.includes(normalized) ||
    policy.grandfatheredOwnerWipPrefixes.some((prefix) => normalized.startsWith(prefix))
  ) {
    reject('OWNER_WIP_TARGET_FORBIDDEN', `${normalized} overlaps grandfathered owner WIP`);
  }
  if (isRequestInstancePath(normalized) || isResultInstancePath(normalized)) {
    reject('QUEUE_TARGET_FORBIDDEN', `${normalized} is governed by request/result PR mode`);
  }

  const registerRegeneration =
    operationType === 'DETERMINISTIC_REGISTER_REGENERATION' &&
    normalized === REGISTER_REPO_PATH;
  if (isCoordinationControlPlane(normalized, policy) && !registerRegeneration) {
    reject('CONTROL_PLANE_TARGET_FORBIDDEN', `${normalized} requires owner policy authority`);
  }
  if (!matchesAny(normalized, policy.canonicalSemanticGovernance) && !registerRegeneration) {
    reject('PROTECTED_PATH_ESCAPE', `${normalized} is not a protected governance path`);
  }
  return normalized;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function computeRequestFingerprint(request) {
  const copy = JSON.parse(JSON.stringify(request));
  delete copy.requestFingerprint;
  return sha256(canonicalize(copy));
}

function validateAuthorityRef(ref, expectedKind, label, template) {
  assertExactKeys(ref, AUTHORITY_REF_KEYS, label);
  if (ref.kind !== expectedKind) {
    reject('AUTHORITY_KIND_INVALID', `${label}.kind must be ${expectedKind}`);
  }
  ref.path = normalizeRepoPath(ref.path, `${label}.path`);
  assertAuthorityRecordId(ref.recordId, `${label}.recordId`, template);
  assertSha(ref.evidenceSha, `${label}.evidenceSha`, template);
}

function validateRequestObject(request, options = {}) {
  const { template = false, policy = loadPolicy() } = options;
  assertExactKeys(request, REQUEST_KEYS, 'request');
  if (request.schemaVersion !== SCHEMA_VERSION) {
    reject('SCHEMA_INVALID', 'request.schemaVersion must be 1');
  }
  assertNonEmptyString(request.requestId, 'request.requestId', template);
  if (!template && !/^GOV-REQ-\d{8}-[A-Z0-9][A-Z0-9-]*$/.test(request.requestId)) {
    reject('REQUEST_ID_INVALID', 'requestId must match GOV-REQ-YYYYMMDD-ID');
  }
  assertSha256(request.requestFingerprint, 'request.requestFingerprint', template);
  assertNonEmptyString(request.requestedBy, 'request.requestedBy', template);
  assertTimestamp(request.createdAt, 'request.createdAt', template);
  assertSha(request.baseMainSha, 'request.baseMainSha', template);

  validateAuthorityRef(
    request.semanticAuthorityRef,
    'SEMANTIC_AUTHORITY',
    'semanticAuthorityRef',
    template,
  );
  validateAuthorityRef(
    request.executionGrantRef,
    'EXECUTION_GRANT',
    'executionGrantRef',
    template,
  );
  if (
    request.semanticAuthorityRef.path === request.executionGrantRef.path &&
    request.semanticAuthorityRef.recordId === request.executionGrantRef.recordId
  ) {
    reject(
      'AUTHORITY_REFERENCE_COLLISION',
      'semanticAuthorityRef and executionGrantRef cannot resolve to the same authority record',
    );
  }
  if (
    !matchesAny(
      request.semanticAuthorityRef.path,
      policy.canonicalSemanticGovernance,
    ) ||
    isCoordinationControlPlane(request.semanticAuthorityRef.path, policy) ||
    isRequestInstancePath(request.semanticAuthorityRef.path) ||
    isResultInstancePath(request.semanticAuthorityRef.path)
  ) {
    reject(
      'SEMANTIC_AUTHORITY_PATH_INVALID',
      'semanticAuthorityRef must resolve inside canonical semantic governance',
    );
  }
  if (
    request.executionGrantRef.path !== GRANT_REPO_PATH ||
    request.executionGrantRef.recordId !== 'GOV-COORD-V1-CODEX-LOCAL'
  ) {
    reject('EXECUTION_GRANT_INVALID', 'executionGrantRef must point to the V1 CODEX_LOCAL grant');
  }

  assertExactKeys(request.operation, OPERATION_KEYS, 'operation');
  if (!LEVEL_2_OPERATIONS.has(request.operation.type)) {
    reject('OPERATION_NOT_ALLOWED', `${request.operation.type} is not a Level 2 operation`);
  }
  if (request.operation.changeClass !== 'LEVEL_2_MECHANICAL') {
    reject('FREE_FORM_EDIT_FORBIDDEN', 'operation.changeClass must be LEVEL_2_MECHANICAL');
  }
  request.operation.targetFile = validateTargetPolicy(
    request.operation.targetFile,
    request.operation.type,
    policy,
  );
  assertNonEmptyString(request.operation.recordIdentity, 'operation.recordIdentity', template);
  assertNonEmptyString(request.operation.anchor, 'operation.anchor', template);
  assertNonEmptyString(request.operation.expectedOldValue, 'operation.expectedOldValue', template);
  assertNonEmptyString(request.operation.newValue, 'operation.newValue', template);
  assertSha(request.operation.evidenceSha, 'operation.evidenceSha', template);
  assertSha256(
    request.operation.expectedResultSha256,
    'operation.expectedResultSha256',
    template,
  );

  if (!Array.isArray(request.declaredTargetAllowlist)) {
    reject('SCHEMA_INVALID', 'declaredTargetAllowlist must be an array');
  }
  if (request.declaredTargetAllowlist.length !== 1) {
    reject('TARGET_ALLOWLIST_INVALID', 'V1 request must declare exactly one target');
  }
  request.declaredTargetAllowlist = request.declaredTargetAllowlist.map((target, index) =>
    normalizeRepoPath(target, `declaredTargetAllowlist[${index}]`),
  );
  if (request.declaredTargetAllowlist[0] !== request.operation.targetFile) {
    reject('TARGET_ALLOWLIST_INVALID', 'declared target must equal operation.targetFile');
  }

  if (!template) {
    const expectedFingerprint = computeRequestFingerprint(request);
    if (request.requestFingerprint !== expectedFingerprint) {
      reject('REQUEST_FINGERPRINT_MISMATCH', 'requestFingerprint does not match canonical request');
    }
  }
  return request;
}

function validateResultObject(result, options = {}) {
  const { template = false } = options;
  assertExactKeys(result, RESULT_KEYS, 'result');
  if (result.schemaVersion !== SCHEMA_VERSION) {
    reject('SCHEMA_INVALID', 'result.schemaVersion must be 1');
  }
  assertNonEmptyString(result.resultId, 'result.resultId', template);
  assertNonEmptyString(result.requestId, 'result.requestId', template);
  if (!template && !/^GOV-REQ-\d{8}-[A-Z0-9][A-Z0-9-]*$/.test(result.requestId)) {
    reject('REQUEST_ID_INVALID', 'result.requestId must identify a valid request');
  }
  assertSha256(result.requestFingerprint, 'result.requestFingerprint', template);
  if (!RESULT_STATUSES.has(result.status)) {
    reject('RESULT_STATUS_INVALID', `unknown result status ${result.status}`);
  }
  if (!Number.isInteger(result.executionPrNumber) || result.executionPrNumber < (template ? 0 : 1)) {
    reject('SCHEMA_INVALID', 'executionPrNumber must be a positive integer');
  }
  assertSha(result.executionMergeSha, 'result.executionMergeSha', template);
  assertSha(result.effectiveMainSha, 'result.effectiveMainSha', template);
  assertTimestamp(result.completedAt, 'result.completedAt', template);
  if (!Array.isArray(result.validationEvidence) || result.validationEvidence.length === 0) {
    reject('SCHEMA_INVALID', 'validationEvidence must be a non-empty array');
  }
  for (const [index, evidence] of result.validationEvidence.entries()) {
    assertExactKeys(evidence, EVIDENCE_KEYS, `validationEvidence[${index}]`);
    assertNonEmptyString(evidence.name, `validationEvidence[${index}].name`, template);
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(evidence.status)) {
      reject('EVIDENCE_STATUS_INVALID', `invalid evidence status at index ${index}`);
    }
    assertSha(evidence.evidenceSha, `validationEvidence[${index}].evidenceSha`, template);
  }
  if (
    !template &&
    result.status === 'SUCCEEDED' &&
    result.validationEvidence.some((evidence) => evidence.status !== 'PASS')
  ) {
    reject('RESULT_EVIDENCE_CONTRADICTION', 'SUCCEEDED result requires all evidence to PASS');
  }
  return result;
}

function extractStructuredJson(markdown, kind) {
  const upper = kind.toUpperCase();
  const begin = `<!-- GOV_COORD_${upper}_JSON_BEGIN -->`;
  const end = `<!-- GOV_COORD_${upper}_JSON_END -->`;
  if (markdown.split(begin).length !== 2 || markdown.split(end).length !== 2) {
    reject('STRUCTURED_BLOCK_INVALID', `${kind} must contain exactly one sentinel pair`);
  }
  const start = markdown.indexOf(begin) + begin.length;
  const finish = markdown.indexOf(end, start);
  if (finish < start) {
    reject('STRUCTURED_BLOCK_INVALID', `${kind} sentinel order is invalid`);
  }
  const block = markdown.slice(start, finish).trim();
  const match = /^```json\r?\n([\s\S]*?)\r?\n```$/.exec(block);
  if (!match) {
    reject('STRUCTURED_BLOCK_INVALID', `${kind} must contain exactly one fenced JSON object`);
  }
  try {
    const parsed = JSON.parse(match[1]);
    if (!isPlainObject(parsed)) reject('SCHEMA_INVALID', `${kind} JSON must be an object`);
    return parsed;
  } catch (error) {
    if (error instanceof CoordinationError) throw error;
    reject('JSON_INVALID', `${kind} JSON parse failed: ${error.message}`);
  }
}

function parseRequestMarkdown(markdown, options = {}) {
  return validateRequestObject(extractStructuredJson(markdown, 'request'), options);
}

function parseRequestFile(filePath, options = {}) {
  return parseRequestMarkdown(fs.readFileSync(filePath, 'utf8'), options);
}

function parseResultMarkdown(markdown, options = {}) {
  return validateResultObject(extractStructuredJson(markdown, 'result'), options);
}

function parseResultFile(filePath, options = {}) {
  return parseResultMarkdown(fs.readFileSync(filePath, 'utf8'), options);
}

function countOccurrences(content, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = content.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function applyMechanicalOperation(content, operation) {
  const recordMatches = countOccurrences(content, operation.recordIdentity);
  if (recordMatches !== 1) {
    reject('RECORD_IDENTITY_MATCH_INVALID', `recordIdentity matched ${recordMatches} times`);
  }
  const anchorMatches = countOccurrences(content, operation.anchor);
  if (anchorMatches !== 1) {
    reject('ANCHOR_MATCH_INVALID', `anchor matched ${anchorMatches} times`);
  }
  const oldMatches = countOccurrences(content, operation.expectedOldValue);
  if (oldMatches !== 1) {
    reject('EXPECTED_OLD_VALUE_MATCH_INVALID', `expectedOldValue matched ${oldMatches} times`);
  }

  let result;
  switch (operation.type) {
    case 'EXACT_APPEND_AT_DECLARED_ANCHOR':
      if (operation.expectedOldValue !== operation.anchor) {
        reject(
          'APPEND_PRECONDITION_INVALID',
          'append operation expectedOldValue must equal the declared anchor',
        );
      }
      result = content.replace(operation.anchor, `${operation.anchor}${operation.newValue}`);
      break;
    case 'EXACT_LITERAL_REPLACEMENT':
    case 'EXACT_REFERENCE_REWRITE':
      result = content.replace(operation.expectedOldValue, operation.newValue);
      break;
    case 'DETERMINISTIC_REGISTER_REGENERATION':
      result = operation.newValue;
      break;
    default:
      reject('OPERATION_NOT_ALLOWED', operation.type);
  }
  const actualDigest = sha256(result);
  if (actualDigest !== operation.expectedResultSha256) {
    reject(
      'EXPECTED_RESULT_DIGEST_MISMATCH',
      `expected ${operation.expectedResultSha256}, produced ${actualDigest}`,
    );
  }
  return result;
}

function assertNotSymlink(isSymbolicLink, label) {
  if (isSymbolicLink) {
    reject('SYMLINK_TARGET_FORBIDDEN', `${label} resolves through a symlink`);
  }
}

function assertNoSymlinkPath(repoRoot, repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  let current = repoRoot;
  for (const segment of normalized.split('/')) {
    current = path.join(current, segment);
    if (fs.existsSync(current)) {
      assertNotSymlink(fs.lstatSync(current).isSymbolicLink(), normalized);
    }
  }
}

function runGit(args, cwd = REPO_ROOT, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });
  if (result.status !== 0 && !options.allowFailure) {
    reject(
      'GIT_VALIDATION_FAILED',
      `git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result;
}

function gitIsAncestor(ancestor, descendant, cwd = REPO_ROOT) {
  const result = runGit(['merge-base', '--is-ancestor', ancestor, descendant], cwd, {
    allowFailure: true,
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  reject('GIT_VALIDATION_FAILED', `cannot determine ancestry ${ancestor} -> ${descendant}`);
}

function gitShow(ref, repoPath, cwd = REPO_ROOT) {
  return runGit(['show', `${ref}:${repoPath}`], cwd).stdout;
}

function gitTreeEntry(ref, repoPath, cwd = REPO_ROOT) {
  return runGit(['ls-tree', ref, '--', repoPath], cwd).stdout.trim();
}

function assertGitFileNotSymlink(ref, repoPath, cwd = REPO_ROOT) {
  const line = gitTreeEntry(ref, repoPath, cwd);
  if (!line) reject('TARGET_NOT_FOUND', `${repoPath} does not exist at ${ref}`);
  const mode = line.split(/\s+/)[0];
  assertNotSymlink(mode === '120000', `${ref}:${repoPath}`);
}

function buildAuthorityMarker(authorityRef) {
  if (!AUTHORITY_KINDS.has(authorityRef.kind)) {
    reject(
      'AUTHORITY_KIND_INVALID',
      `authorityRef.kind must be one of ${[...AUTHORITY_KINDS].join(', ')}`,
    );
  }
  assertAuthorityRecordId(authorityRef.recordId, 'authorityRef.recordId');
  return `<!-- GOV-COORD-AUTHORITY kind=${authorityRef.kind} recordId=${authorityRef.recordId} -->`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function authorityMarkerLocatesSemanticRow(line, marker, recordId) {
  const markerIndex = line.indexOf(marker);
  if (markerIndex === -1) return false;
  const afterMarker = line.slice(markerIndex + marker.length);
  const headingPattern = new RegExp(
    `^[\\t ]*\\*\\*${escapeRegExp(recordId)}(?=[\\t ]|—|–|:|\\*\\*)`,
  );
  return headingPattern.test(afterMarker);
}

function validateAuthorityRecordAtRef(ref, authorityRef, cwd = REPO_ROOT) {
  const content = gitShow(ref, authorityRef.path, cwd);
  const marker = buildAuthorityMarker(authorityRef);
  const matches = countOccurrences(content, marker);
  if (matches === 0) {
    reject(
      'AUTHORITY_RECORD_MARKER_MISSING',
      `${authorityRef.path}#${authorityRef.recordId} has no exact authority marker at ${ref}`,
    );
  }
  if (matches > 1) {
    reject(
      'AUTHORITY_RECORD_MARKER_DUPLICATE',
      `${authorityRef.path}#${authorityRef.recordId} has ${matches} exact authority markers at ${ref}`,
    );
  }
  if (!gitIsAncestor(authorityRef.evidenceSha, ref, cwd)) {
    reject('AUTHORITY_EVIDENCE_NOT_IN_MAIN', `${authorityRef.evidenceSha} is not ancestor of ${ref}`);
  }
}

function assertRequestBaseAncestor(requestBaseRef, executionBaseRef, cwd = REPO_ROOT) {
  const result = runGit(
    ['merge-base', '--is-ancestor', requestBaseRef, executionBaseRef],
    cwd,
    { allowFailure: true },
  );
  if (result.status !== 0) {
    reject(
      'REQUEST_BASE_NOT_ANCESTOR',
      `${requestBaseRef} is not an ancestor of execution base ${executionBaseRef}`,
    );
  }
  return true;
}

function validateRequestAgainstGit(request, baseRef, headRef = null, cwd = REPO_ROOT) {
  assertRequestBaseAncestor(request.baseMainSha, baseRef, cwd);
  if (!gitIsAncestor(EFFECTIVE_FROM_MAIN_SHA, request.baseMainSha, cwd)) {
    reject(
      'EFFECTIVE_FROM_ANCESTRY_FAILED',
      `${EFFECTIVE_FROM_MAIN_SHA} is not ancestor of request base`,
    );
  }
  if (!gitIsAncestor(EFFECTIVE_FROM_MAIN_SHA, baseRef, cwd)) {
    reject('EFFECTIVE_FROM_ANCESTRY_FAILED', `${EFFECTIVE_FROM_MAIN_SHA} is not ancestor of base`);
  }
  if (!gitIsAncestor(request.operation.evidenceSha, baseRef, cwd)) {
    reject('OPERATION_EVIDENCE_NOT_IN_MAIN', 'operation evidence SHA is not in base main ancestry');
  }
  validateAuthorityRecordAtRef(baseRef, request.semanticAuthorityRef, cwd);
  validateAuthorityRecordAtRef(baseRef, request.executionGrantRef, cwd);
  assertGitFileNotSymlink(baseRef, request.operation.targetFile, cwd);

  const baseContent = gitShow(baseRef, request.operation.targetFile, cwd);
  const expectedContent = applyMechanicalOperation(baseContent, request.operation);
  if (headRef) {
    assertGitFileNotSymlink(headRef, request.operation.targetFile, cwd);
    const headContent = gitShow(headRef, request.operation.targetFile, cwd);
    if (headContent !== expectedContent) {
      reject('EXACT_RESULTING_DIFF_MISMATCH', 'execution head does not equal mechanical result');
    }
  }
  return expectedContent;
}

function validateCanonicalRequestAtExecutionBase(
  requestId,
  baseRef,
  headRef,
  cwd = REPO_ROOT,
) {
  const requestPath =
    `project/docs/governance/coordination-requests/${requestId}/request.md`;
  const baseEntry = gitTreeEntry(baseRef, requestPath, cwd);
  if (!baseEntry) {
    reject(
      'CANONICAL_REQUEST_MISSING_AT_PR_BASE',
      `${requestPath} does not exist at ${baseRef}`,
    );
  }
  const baseMode = baseEntry.split(/\s+/)[0];
  assertNotSymlink(baseMode === '120000', `${baseRef}:${requestPath}`);

  const baseMarkdown = gitShow(baseRef, requestPath, cwd);
  const request = parseRequestMarkdown(baseMarkdown);
  if (request.requestId !== requestId) {
    reject(
      'CANONICAL_REQUEST_MISMATCH',
      `${requestPath} contains requestId ${request.requestId}`,
    );
  }

  const headEntry = gitTreeEntry(headRef, requestPath, cwd);
  if (!headEntry || gitShow(headRef, requestPath, cwd) !== baseMarkdown) {
    reject(
      'CANONICAL_REQUEST_MISMATCH',
      `${requestPath} is not byte-identical between execution base and head`,
    );
  }
  const headMode = headEntry.split(/\s+/)[0];
  assertNotSymlink(headMode === '120000', `${headRef}:${requestPath}`);

  const resultPath =
    `project/docs/governance/coordination-results/${requestId}/result.md`;
  if (gitTreeEntry(baseRef, resultPath, cwd)) {
    reject('RESULT_ALREADY_EXISTS', `${resultPath} exists at ${baseRef}`);
  }

  const instances = loadRepositoryInstancesAtGitRef(baseRef, cwd);
  const canonicalRequest = instances.requests.find(
    ({ value }) => value.requestId === requestId,
  );
  if (
    !canonicalRequest ||
    canonicalize(canonicalRequest.value) !== canonicalize(request)
  ) {
    reject(
      'CANONICAL_REQUEST_MISMATCH',
      `${requestId} does not resolve uniquely from execution base`,
    );
  }
  const expectedRegister = generateRegisterContent(instances);
  const actualRegister = gitShow(baseRef, REGISTER_REPO_PATH, cwd).replace(
    /\r\n/g,
    '\n',
  );
  if (actualRegister !== expectedRegister) {
    reject(
      'REQUEST_NOT_PENDING',
      `${requestId} is not represented by the current PENDING register at ${baseRef}`,
    );
  }
  return request;
}

function walkInstanceFiles(root, filename) {
  if (!fs.existsSync(root)) return [];
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_template') continue;
    const candidate = path.join(root, entry.name, filename);
    if (fs.existsSync(candidate)) results.push(candidate);
  }
  return results.sort((a, b) => a.localeCompare(b));
}

function validateLoadedInstances(requests, results) {
  const requestIds = new Set();
  const fingerprints = new Set();
  for (const { value } of requests) {
    if (fingerprints.has(value.requestFingerprint)) {
      reject('DUPLICATE_REQUEST_FINGERPRINT', value.requestFingerprint);
    }
    if (requestIds.has(value.requestId)) {
      reject('DUPLICATE_REQUEST_ID', value.requestId);
    }
    requestIds.add(value.requestId);
    fingerprints.add(value.requestFingerprint);
  }

  const requestById = new Map(requests.map(({ value }) => [value.requestId, value]));
  const resultIds = new Set();
  for (const { value } of results) {
    if (resultIds.has(value.requestId)) {
      reject('DUPLICATE_RESULT', value.requestId);
    }
    const request = requestById.get(value.requestId);
    if (!request) reject('RESULT_WITHOUT_REQUEST', value.requestId);
    if (request.requestFingerprint !== value.requestFingerprint) {
      reject('RESULT_REQUEST_FINGERPRINT_MISMATCH', value.requestId);
    }
    resultIds.add(value.requestId);
  }
  return { requests, results };
}

function loadRepositoryInstances(options = {}) {
  const requestsRoot = options.requestsRoot || REQUESTS_ROOT;
  const resultsRoot = options.resultsRoot || RESULTS_ROOT;
  const policy = options.policy || loadPolicy();
  const requests = walkInstanceFiles(requestsRoot, 'request.md').map((file) => ({
    file,
    value: parseRequestFile(file, { policy }),
  }));
  const results = walkInstanceFiles(resultsRoot, 'result.md').map((file) => ({
    file,
    value: parseResultFile(file),
  }));
  return validateLoadedInstances(requests, results);
}

function gitListFiles(ref, repoPath, cwd = REPO_ROOT) {
  const output = runGit(
    ['ls-tree', '-r', '--name-only', ref, '--', repoPath],
    cwd,
  ).stdout.trim();
  if (!output) return [];
  return output.split(/\r?\n/).map((candidate) => normalizeRepoPath(candidate));
}

function loadRepositoryInstancesAtGitRef(ref, cwd = REPO_ROOT) {
  const requestFiles = gitListFiles(
    ref,
    'project/docs/governance/coordination-requests',
    cwd,
  ).filter(
    (file) =>
      isRequestInstancePath(file) &&
      !file.includes('/coordination-requests/_template/'),
  );
  const resultFiles = gitListFiles(
    ref,
    'project/docs/governance/coordination-results',
    cwd,
  ).filter(
    (file) =>
      isResultInstancePath(file) &&
      !file.includes('/coordination-results/_template/'),
  );
  const requests = requestFiles.map((file) => ({
    file,
    value: parseRequestMarkdown(gitShow(ref, file, cwd)),
  }));
  const results = resultFiles.map((file) => ({
    file,
    value: parseResultMarkdown(gitShow(ref, file, cwd)),
  }));
  return validateLoadedInstances(requests, results);
}

function escapeTable(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function generateRegisterContent(instances = loadRepositoryInstances()) {
  const resultByRequest = new Map(
    instances.results.map(({ value }) => [value.requestId, value]),
  );
  const rows = instances.requests
    .map(({ value: request }) => {
      const result = resultByRequest.get(request.requestId);
      return [
        request.requestId,
        request.requestFingerprint,
        request.baseMainSha,
        request.operation.type,
        request.operation.targetFile,
        result ? result.status : 'PENDING',
        result ? result.executionMergeSha : '_none_',
      ];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

  const lines = [
    '# Governance Writer Coordination Register',
    '',
    '<!-- GENERATED FILE: DO NOT EDIT MANUALLY -->',
    '',
    '```text',
    `Schema version         : ${SCHEMA_VERSION}`,
    `Effective-from main    : ${EFFECTIVE_FROM_MAIN_SHA}`,
    'Authority              : DERIVED / NON-AUTHORITATIVE',
    '```',
    '',
    '| Request ID | Request Fingerprint | Request Base | Operation | Target | Result | Execution Merge |',
    '|---|---|---|---|---|---|---|',
  ];
  if (rows.length === 0) {
    lines.push('| _none_ | _none_ | _none_ | _none_ | _none_ | _none_ | _none_ |');
  } else {
    for (const row of rows) {
      lines.push(`| ${row.map(escapeTable).join(' | ')} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function verifyRegister(registerPath = REGISTER_PATH, instances) {
  const expected = generateRegisterContent(instances);
  const actual = fs.readFileSync(registerPath, 'utf8').replace(/\r\n/g, '\n');
  if (actual !== expected) {
    reject('GENERATED_REGISTER_STALE', `${registerPath} is not byte-stable/current`);
  }
  return true;
}

function writeRegister(registerPath = REGISTER_PATH, instances) {
  const content = generateRegisterContent(instances);
  fs.writeFileSync(registerPath, content, 'utf8');
  return content;
}

function parseGitChanges(baseRef, headRef, cwd = REPO_ROOT) {
  const output = runGit(
    ['diff', '--name-status', '--find-renames', `${baseRef}...${headRef}`],
    cwd,
  ).stdout;
  if (!output.trim()) return [];
  return output
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const parts = line.split('\t');
      const status = parts[0];
      if (status.startsWith('R') || status.startsWith('C')) {
        return {
          status,
          oldPath: normalizeRepoPath(parts[1]),
          path: normalizeRepoPath(parts[2]),
        };
      }
      return { status, path: normalizeRepoPath(parts[1]) };
    });
}

function parseWorktreeChanges(cwd = REPO_ROOT) {
  const output = runGit(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    cwd,
  ).stdout;
  if (!output.trim()) return [];
  return output
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => {
      const porcelainStatus = line.slice(0, 2);
      const rawPath = line.slice(3);
      if (rawPath.includes(' -> ')) {
        const [oldPath, newPath] = rawPath.split(' -> ');
        return {
          status: 'R',
          oldPath: normalizeRepoPath(oldPath.replace(/^"|"$/g, '')),
          path: normalizeRepoPath(newPath.replace(/^"|"$/g, '')),
        };
      }
      const status =
        porcelainStatus === '??'
          ? 'A'
          : porcelainStatus.includes('D')
            ? 'D'
            : porcelainStatus.includes('M')
              ? 'M'
              : porcelainStatus.includes('A')
                ? 'A'
                : porcelainStatus.trim();
      return {
        status,
        path: normalizeRepoPath(rawPath.replace(/^"|"$/g, '')),
      };
    });
}

function hasExactModifiedPathSet(changes, expectedPaths) {
  const paths = new Set(changes.map((change) => change.path));
  return (
    changes.length === expectedPaths.size &&
    paths.size === expectedPaths.size &&
    [...paths].every((candidate) => expectedPaths.has(candidate)) &&
    changes.every((change) => change.status === 'M' && !change.oldPath)
  );
}

function classifyPrChangeSet(changes, context = {}) {
  if (changes.length === 0) reject('EMPTY_PR_SCOPE', 'PR has no changes');

  for (const change of changes) {
    const paths = [change.path, change.oldPath].filter(Boolean);
    if (
      paths.some((candidate) => isRequestInstancePath(candidate)) &&
      change.status !== 'A'
    ) {
      reject('IMMUTABLE_REQUEST_MODIFIED', `${change.status} ${paths.join(' -> ')}`);
    }
    if (
      paths.some((candidate) => isResultInstancePath(candidate)) &&
      change.status !== 'A'
    ) {
      reject('IMMUTABLE_RESULT_MODIFIED', `${change.status} ${paths.join(' -> ')}`);
    }
  }

  const paths = new Set(changes.map((change) => change.path));
  if (
    context.base === REGISTER_TEST_FIXTURE_REPAIR_I01.baseSha &&
    context.headRef === REGISTER_TEST_FIXTURE_REPAIR_I01.headRef &&
    hasExactModifiedPathSet(changes, REGISTER_TEST_FIXTURE_REPAIR_I01_PATHS)
  ) {
    return { mode: REGISTER_TEST_FIXTURE_REPAIR_I01.mode };
  }

  if (
    context.base === AUTHORITY_LOCATOR_REPAIR_I01.baseSha &&
    context.headRef === AUTHORITY_LOCATOR_REPAIR_I01.headRef &&
    hasExactModifiedPathSet(changes, AUTHORITY_LOCATOR_REPAIR_I01_PATHS)
  ) {
    return { mode: AUTHORITY_LOCATOR_REPAIR_I01.mode };
  }

  if (
    context.base === EXECUTION_BASE_ANCESTRY_REPAIR_I01.baseSha &&
    context.headRef === EXECUTION_BASE_ANCESTRY_REPAIR_I01.headRef &&
    hasExactModifiedPathSet(changes, EXECUTION_BASE_ANCESTRY_REPAIR_I01_PATHS)
  ) {
    return { mode: EXECUTION_BASE_ANCESTRY_REPAIR_I01.mode };
  }

  if (
    context.base === NONCOORD_PR_CLASSIFIER_REPAIR_R01.baseSha &&
    context.headRef === NONCOORD_PR_CLASSIFIER_REPAIR_R01.headRef &&
    hasExactModifiedPathSet(changes, NONCOORD_PR_CLASSIFIER_REPAIR_R01_PATHS)
  ) {
    return { mode: NONCOORD_PR_CLASSIFIER_REPAIR_R01.mode };
  }

  if (
    paths.size === BOOTSTRAP_ALL.size &&
    [...paths].every((candidate) => BOOTSTRAP_ALL.has(candidate)) &&
    changes.every((change) => {
      if (BOOTSTRAP_MODIFY.has(change.path)) return change.status === 'M';
      return BOOTSTRAP_ADD.has(change.path) && change.status === 'A';
    })
  ) {
    return { mode: 'BOOTSTRAP' };
  }

  if (
    [
      REGISTER_TEST_FIXTURE_REPAIR_I01.headRef,
      AUTHORITY_LOCATOR_REPAIR_I01.headRef,
      EXECUTION_BASE_ANCESTRY_REPAIR_I01.headRef,
      NONCOORD_PR_CLASSIFIER_REPAIR_R01.headRef,
    ].includes(context.headRef) ||
    /^codex\/gov-coord-(?:v1-)?(?:authority-locator|register-test-fixture|execution-base-ancestry|noncoord-classifier)-repair-/.test(
      context.headRef || '',
    )
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'control-plane repair binding mismatch');
  }

  const newRequests = changes.filter(
    (change) => change.status === 'A' && isRequestInstancePath(change.path),
  );
  const newResults = changes.filter(
    (change) => change.status === 'A' && isResultInstancePath(change.path),
  );
  const requestBranchMatches = REQUEST_ONLY_BRANCH_PATTERN.test(context.headRef || '');
  const executionBranchMatch = EXECUTION_BRANCH_PATTERN.exec(context.headRef || '');
  const resultBranchMatch = RESULT_ONLY_BRANCH_PATTERN.exec(context.headRef || '');
  const executionBranchIntent =
    (context.headRef || '').startsWith('codex/gov-exec/') ||
    /^codex\/gov-coord-(?:[a-z0-9]+-)*execution(?:-[a-z0-9]+)*$/.test(
      context.headRef || '',
    );
  const resultBranchIntent = (context.headRef || '').startsWith('codex/gov-result/');

  if (executionBranchIntent && !executionBranchMatch) {
    reject('EXECUTION_BRANCH_INVALID', 'execution branch must bind an exact requestId');
  }
  if (resultBranchIntent && !resultBranchMatch) {
    reject('RESULT_BRANCH_INVALID', 'result branch must bind an exact requestId');
  }
  if (newRequests.length > 0 && newResults.length > 0) {
    reject(
      'COORDINATION_CLASS_AMBIGUOUS',
      'PR cannot contain both request and result instances',
    );
  }

  const registerRegenerated = changes.some(
    (change) => change.status === 'M' && change.path === REGISTER_REPO_PATH,
  );
  if (newRequests.length > 0 || requestBranchMatches) {
    if (!requestBranchMatches) {
      reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'request path requires a request-only branch');
    }
    if (changes.length !== 2 || newRequests.length !== 1 || !registerRegenerated) {
      reject('REQUEST_SCOPE_INVALID', 'request-only PR requires one new request and register');
    }
    return { mode: 'REQUEST_ONLY', instancePath: newRequests[0].path };
  }

  if (newResults.length > 0 || resultBranchMatch) {
    if (!resultBranchMatch) {
      reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'result path requires an exact result branch');
    }
    if (changes.length !== 2 || newResults.length !== 1 || !registerRegenerated) {
      reject('RESULT_SCOPE_INVALID', 'result-only PR requires one new result and register');
    }
    return {
      mode: 'RESULT_ONLY',
      instancePath: newResults[0].path,
      requestId: resultBranchMatch[1],
    };
  }

  if (
    changes.some(
      (change) =>
        isCoordinationControlPlane(change.path, loadPolicy()) ||
        isRequestInstancePath(change.path) ||
        isResultInstancePath(change.path) ||
        change.path === REGISTER_REPO_PATH,
    )
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'non-bootstrap control-plane diff');
  }
  if (executionBranchMatch) {
    if (changes.some((change) => change.status !== 'M')) {
      reject('EXECUTION_SCOPE_INVALID', 'execution PR may only modify declared target files');
    }
    return { mode: 'EXECUTION', requestId: executionBranchMatch[1] };
  }
  return { mode: 'NON_COORDINATION_PR' };
}

function validateAuthorityLocatorRepairScope(options) {
  const { base, head, headRef, changes, cwd = REPO_ROOT } = options;
  if (
    base !== AUTHORITY_LOCATOR_REPAIR_I01.baseSha ||
    headRef !== AUTHORITY_LOCATOR_REPAIR_I01.headRef ||
    !hasExactModifiedPathSet(changes, AUTHORITY_LOCATOR_REPAIR_I01_PATHS)
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'authority locator repair binding mismatch');
  }

  if (
    changes.some(
      (change) =>
        isRequestInstancePath(change.path) ||
        isResultInstancePath(change.path) ||
        change.path === 'project/docs/governance/OFFICE-MASTER-SYNTHESIS.md',
    )
  ) {
    reject('CONTROL_PLANE_SCOPE_FORBIDDEN', 'authority locator repair contains forbidden paths');
  }

  const semanticAuthority = {
    ...AUTHORITY_LOCATOR_REPAIR_I01.semanticAuthority,
    evidenceSha: base,
  };
  const executionGrant = {
    ...AUTHORITY_LOCATOR_REPAIR_I01.executionGrant,
    evidenceSha: base,
  };
  validateAuthorityRecordAtRef(head, semanticAuthority, cwd);
  validateAuthorityRecordAtRef(head, executionGrant, cwd);

  let rawIdFallbackRejected = false;
  try {
    validateAuthorityRecordAtRef(base, semanticAuthority, cwd);
  } catch (error) {
    if (
      error instanceof CoordinationError &&
      error.code === 'AUTHORITY_RECORD_MARKER_MISSING'
    ) {
      rawIdFallbackRejected = true;
    } else {
      throw error;
    }
  }
  if (!rawIdFallbackRejected) {
    reject(
      'AUTHORITY_REPAIR_RAW_ID_FALLBACK_PRESENT',
      'base semantic authority resolved without an exact marker',
    );
  }

  const semanticMarker = buildAuthorityMarker(semanticAuthority);
  const baseDecisionLog = gitShow(base, semanticAuthority.path, cwd);
  const headDecisionLog = gitShow(head, semanticAuthority.path, cwd);
  const markerLine = headDecisionLog
    .split(/\r?\n/)
    .find((line) => line.includes(semanticMarker));
  if (
    !markerLine ||
    !authorityMarkerLocatesSemanticRow(
      markerLine,
      semanticMarker,
      semanticAuthority.recordId,
    )
  ) {
    reject(
      'AUTHORITY_REPAIR_SEMANTIC_MARKER_INVALID',
      'semantic marker must locate the expected decision row',
    );
  }
  const normalizedDecisionLog = headDecisionLog.replace(`${semanticMarker} `, '');
  if (!normalizedDecisionLog.startsWith(baseDecisionLog)) {
    reject(
      'AUTHORITY_REPAIR_DECISION_LOG_NOT_ADDITIVE',
      'existing decision-log content must remain byte-preserved after marker normalization',
    );
  }
  const appendedDecisionLines = normalizedDecisionLog
    .slice(baseDecisionLog.length)
    .split(/\r?\n/)
    .filter(Boolean);
  if (
    appendedDecisionLines.length !== 1 ||
    !appendedDecisionLines[0].startsWith(
      '| 2026-07-25 | **GOV-COORD-V1-AUTHORITY-LOCATOR-REPAIR-I01',
    )
  ) {
    reject(
      'AUTHORITY_REPAIR_DECISION_LOG_NOT_ADDITIVE',
      'decision-log may only append the exact repair record',
    );
  }

  const grantMarker = buildAuthorityMarker(executionGrant);
  const baseGrant = gitShow(base, executionGrant.path, cwd);
  const headGrant = gitShow(head, executionGrant.path, cwd);
  if (headGrant.replace(`${grantMarker}\n\n`, '') !== baseGrant) {
    reject(
      'AUTHORITY_REPAIR_GRANT_CHANGED',
      'execution grant must remain byte-equivalent after marker removal',
    );
  }

  const contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  for (const expectedLiteral of [
    AUTHORITY_LOCATOR_REPAIR_I01.mode,
    AUTHORITY_LOCATOR_REPAIR_I01.baseSha,
    AUTHORITY_LOCATOR_REPAIR_I01.headRef,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'AUTHORITY_REPAIR_CONTRACT_INVALID',
        `contract is missing exact repair binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: AUTHORITY_LOCATOR_REPAIR_I01.mode };
}

function validateRegisterTestFixtureRepairScope(options) {
  const { base, head, headRef, changes, cwd = REPO_ROOT } = options;
  if (
    base !== REGISTER_TEST_FIXTURE_REPAIR_I01.baseSha ||
    headRef !== REGISTER_TEST_FIXTURE_REPAIR_I01.headRef ||
    !hasExactModifiedPathSet(changes, REGISTER_TEST_FIXTURE_REPAIR_I01_PATHS)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'register test fixture repair binding mismatch',
    );
  }

  if (
    changes.some(
      (change) =>
        isRequestInstancePath(change.path) ||
        isResultInstancePath(change.path) ||
        change.path === REGISTER_REPO_PATH ||
        change.path === 'project/docs/governance/OFFICE-MASTER-SYNTHESIS.md',
    )
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'register test fixture repair contains forbidden paths',
    );
  }

  const contract = gitShow(
    head,
    'project/docs/governance/governance-writer-coordination-contract.md',
    cwd,
  );
  for (const expectedLiteral of [
    REGISTER_TEST_FIXTURE_REPAIR_I01.mode,
    REGISTER_TEST_FIXTURE_REPAIR_I01.baseSha,
    REGISTER_TEST_FIXTURE_REPAIR_I01.headRef,
  ]) {
    if (!contract.includes(expectedLiteral)) {
      reject(
        'REGISTER_TEST_FIXTURE_REPAIR_CONTRACT_INVALID',
        `contract is missing exact repair binding ${expectedLiteral}`,
      );
    }
  }

  return { mode: REGISTER_TEST_FIXTURE_REPAIR_I01.mode };
}

function validateExecutionBaseAncestryRepairScope(options) {
  const { base, headRef, changes } = options;
  if (
    base !== EXECUTION_BASE_ANCESTRY_REPAIR_I01.baseSha ||
    headRef !== EXECUTION_BASE_ANCESTRY_REPAIR_I01.headRef ||
    !hasExactModifiedPathSet(changes, EXECUTION_BASE_ANCESTRY_REPAIR_I01_PATHS)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'execution base ancestry repair binding mismatch',
    );
  }
  return { mode: EXECUTION_BASE_ANCESTRY_REPAIR_I01.mode };
}

function validateNoncoordPrClassifierRepairScope(options) {
  const { base, headRef, changes } = options;
  if (
    base !== NONCOORD_PR_CLASSIFIER_REPAIR_R01.baseSha ||
    headRef !== NONCOORD_PR_CLASSIFIER_REPAIR_R01.headRef ||
    !hasExactModifiedPathSet(changes, NONCOORD_PR_CLASSIFIER_REPAIR_R01_PATHS)
  ) {
    reject(
      'CONTROL_PLANE_SCOPE_FORBIDDEN',
      'non-coordination PR classifier repair binding mismatch',
    );
  }
  return { mode: NONCOORD_PR_CLASSIFIER_REPAIR_R01.mode };
}

function repoPathToAbsolute(repoPath, repoRoot = REPO_ROOT) {
  return path.join(repoRoot, ...normalizeRepoPath(repoPath).split('/'));
}

function validatePrScope(options) {
  const { base, head, headRef = '', cwd = REPO_ROOT } = options;
  assertSha(base, 'base');
  assertSha(head, 'head');
  const changes = parseGitChanges(base, head, cwd);
  const classification = classifyPrChangeSet(changes, { base, headRef });

  if (classification.mode === 'NON_COORDINATION_PR') {
    return classification;
  }

  if (classification.mode === REGISTER_TEST_FIXTURE_REPAIR_I01.mode) {
    return validateRegisterTestFixtureRepairScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === AUTHORITY_LOCATOR_REPAIR_I01.mode) {
    return validateAuthorityLocatorRepairScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === EXECUTION_BASE_ANCESTRY_REPAIR_I01.mode) {
    return validateExecutionBaseAncestryRepairScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === NONCOORD_PR_CLASSIFIER_REPAIR_R01.mode) {
    return validateNoncoordPrClassifierRepairScope({
      base,
      head,
      headRef,
      changes,
      cwd,
    });
  }

  if (classification.mode === 'BOOTSTRAP') {
    if (base !== EFFECTIVE_FROM_MAIN_SHA) {
      reject('BOOTSTRAP_BASE_INVALID', `bootstrap base must be ${EFFECTIVE_FROM_MAIN_SHA}`);
    }
    return classification;
  }

  if (classification.mode === 'REQUEST_ONLY') {
    assertGitFileNotSymlink(head, classification.instancePath, cwd);
    const request = parseRequestFile(repoPathToAbsolute(classification.instancePath, cwd));
    const folderRequestId = classification.instancePath.split('/').at(-2);
    if (folderRequestId !== request.requestId) {
      reject('REQUEST_PATH_ID_MISMATCH', `${folderRequestId} != ${request.requestId}`);
    }
    validateRequestAgainstGit(request, base, null, cwd);
    verifyRegister(path.join(cwd, REGISTER_REPO_PATH));
    return classification;
  }

  if (classification.mode === 'RESULT_ONLY') {
    assertGitFileNotSymlink(head, classification.instancePath, cwd);
    const result = parseResultFile(repoPathToAbsolute(classification.instancePath, cwd));
    const folderRequestId = classification.instancePath.split('/').at(-2);
    if (folderRequestId !== classification.requestId) {
      reject(
        'RESULT_BRANCH_REQUEST_MISMATCH',
        `${classification.requestId} != ${folderRequestId}`,
      );
    }
    if (folderRequestId !== result.requestId) {
      reject('RESULT_PATH_ID_MISMATCH', `${folderRequestId} != ${result.requestId}`);
    }
    const requestPath = path.join(
      cwd,
      'project',
      'docs',
      'governance',
      'coordination-requests',
      result.requestId,
      'request.md',
    );
    const request = parseRequestFile(requestPath);
    if (request.requestFingerprint !== result.requestFingerprint) {
      reject('RESULT_REQUEST_FINGERPRINT_MISMATCH', result.requestId);
    }
    if (result.effectiveMainSha !== base) {
      reject('RESULT_BASE_MISMATCH', `${result.effectiveMainSha} != ${base}`);
    }
    if (!gitIsAncestor(result.executionMergeSha, base, cwd)) {
      reject('EXECUTION_MERGE_NOT_IN_MAIN', result.executionMergeSha);
    }
    verifyRegister(path.join(cwd, REGISTER_REPO_PATH));
    return classification;
  }

  const requestId = classification.requestId;
  const request = validateCanonicalRequestAtExecutionBase(
    requestId,
    base,
    head,
    cwd,
  );
  const changedPaths = changes.map((change) => change.path).sort();
  const allowedPaths = [...request.declaredTargetAllowlist].sort();
  if (
    changedPaths.length !== allowedPaths.length ||
    changedPaths.some((candidate, index) => candidate !== allowedPaths[index])
  ) {
    reject(
      'EXECUTION_TARGET_SCOPE_INVALID',
      `changed=[${changedPaths}] allowed=[${allowedPaths}]`,
    );
  }
  validateRequestAgainstGit(request, base, head, cwd);
  return classification;
}

function validateRepository() {
  const instances = loadRepositoryInstances();
  const head = runGit(['rev-parse', 'HEAD'], REPO_ROOT).stdout.trim();
  for (const { value: result } of instances.results) {
    if (!gitIsAncestor(result.executionMergeSha, head, REPO_ROOT)) {
      reject('EXECUTION_MERGE_NOT_IN_MAIN', result.executionMergeSha);
    }
    if (!gitIsAncestor(result.effectiveMainSha, head, REPO_ROOT)) {
      reject('RESULT_BASE_NOT_IN_MAIN', result.effectiveMainSha);
    }
  }
  verifyRegister(REGISTER_PATH, instances);
  return instances;
}

function validateBootstrapWorktree(cwd = REPO_ROOT) {
  const branch = runGit(['branch', '--show-current'], cwd).stdout.trim();
  const head = runGit(['rev-parse', 'HEAD'], cwd).stdout.trim();
  if (branch !== 'codex/gov-coord-v1-bootstrap-i01') {
    reject('BOOTSTRAP_BRANCH_INVALID', branch);
  }
  if (head !== EFFECTIVE_FROM_MAIN_SHA) {
    reject('BOOTSTRAP_BASE_INVALID', head);
  }
  const classification = classifyPrChangeSet(parseWorktreeChanges(cwd));
  if (classification.mode !== 'BOOTSTRAP') {
    reject('BOOTSTRAP_SCOPE_INVALID', classification.mode);
  }
  return classification;
}

function makeSelfTestRequest(policy = loadPolicy()) {
  const baseContent = 'record: GOV-SELF-TEST\nanchor: OLD\n';
  const operation = {
    type: 'EXACT_LITERAL_REPLACEMENT',
    changeClass: 'LEVEL_2_MECHANICAL',
    targetFile: 'project/docs/governance/GOVERNANCE-INDEX.md',
    recordIdentity: 'record: GOV-SELF-TEST',
    anchor: 'anchor: OLD',
    expectedOldValue: 'OLD',
    newValue: 'NEW',
    evidenceSha: EFFECTIVE_FROM_MAIN_SHA,
    expectedResultSha256: sha256('record: GOV-SELF-TEST\nanchor: NEW\n'),
  };
  const request = {
    schemaVersion: 1,
    requestId: 'GOV-REQ-20260724-SELF-TEST',
    requestFingerprint: '',
    requestedBy: 'CODEX_LOCAL',
    createdAt: '2026-07-24T00:00:00Z',
    baseMainSha: EFFECTIVE_FROM_MAIN_SHA,
    semanticAuthorityRef: {
      kind: 'SEMANTIC_AUTHORITY',
      path: 'project/docs/governance/decision-log.md',
      recordId: 'GOV-SELF-TEST-SEMANTIC',
      evidenceSha: EFFECTIVE_FROM_MAIN_SHA,
    },
    executionGrantRef: {
      kind: 'EXECUTION_GRANT',
      path: GRANT_REPO_PATH,
      recordId: 'GOV-COORD-V1-CODEX-LOCAL',
      evidenceSha: EFFECTIVE_FROM_MAIN_SHA,
    },
    operation,
    declaredTargetAllowlist: [operation.targetFile],
  };
  request.requestFingerprint = computeRequestFingerprint(request);
  validateRequestObject(request, { policy });
  return { request, baseContent };
}

function runSelfTest() {
  const policy = loadPolicy();
  const { request, baseContent } = makeSelfTestRequest(policy);
  const result = applyMechanicalOperation(baseContent, request.operation);
  if (result !== 'record: GOV-SELF-TEST\nanchor: NEW\n') {
    reject('SELF_TEST_FAILED', 'mechanical replacement failed');
  }
  const generatedA = generateRegisterContent({ requests: [], results: [] });
  const generatedB = generateRegisterContent({ requests: [], results: [] });
  if (generatedA !== generatedB) reject('SELF_TEST_FAILED', 'register is not byte-stable');

  const forbidden = JSON.parse(JSON.stringify(request));
  forbidden.operation.targetFile = '../outside.md';
  forbidden.declaredTargetAllowlist = ['../outside.md'];
  forbidden.requestFingerprint = computeRequestFingerprint(forbidden);
  let rejected = false;
  try {
    validateRequestObject(forbidden, { policy });
  } catch (error) {
    rejected = error instanceof CoordinationError;
  }
  if (!rejected) reject('SELF_TEST_FAILED', 'path traversal fixture was not rejected');
  return true;
}

function parseCliArgs(args) {
  const options = { positional: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[index + 1];
      if (!value || value.startsWith('--')) reject('CLI_INVALID', `missing value for ${arg}`);
      options[key] = value;
      index += 1;
    } else {
      options.positional.push(arg);
    }
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parseCliArgs(rest);
  switch (command) {
    case 'self-test':
      runSelfTest();
      console.log('GOV_COORD_SELF_TEST_PASS');
      break;
    case 'validate-template': {
      const [kind, file] = args.positional;
      if (kind === 'request') parseRequestFile(path.resolve(file), { template: true });
      else if (kind === 'result') parseResultFile(path.resolve(file), { template: true });
      else reject('CLI_INVALID', 'validate-template requires request|result and a file');
      console.log(`GOV_COORD_TEMPLATE_VALID:${kind}`);
      break;
    }
    case 'validate-request':
      parseRequestFile(path.resolve(args.positional[0]));
      console.log('GOV_COORD_REQUEST_VALID');
      break;
    case 'validate-result':
      parseResultFile(path.resolve(args.positional[0]));
      console.log('GOV_COORD_RESULT_VALID');
      break;
    case 'generate-register':
      writeRegister();
      console.log('GOV_COORD_REGISTER_GENERATED');
      break;
    case 'verify-register':
      verifyRegister();
      console.log('GOV_COORD_REGISTER_CURRENT');
      break;
    case 'validate-repository':
      validateRepository();
      console.log('GOV_COORD_REPOSITORY_VALID');
      break;
    case 'validate-pr-scope':
      {
        const classification = validatePrScope({
          base: args.base,
          head: args.head,
          headRef: args['head-ref'] || '',
        });
        console.log(
          classification.mode === 'NON_COORDINATION_PR'
            ? 'GOV_COORD_NON_COORDINATION_PR'
            : 'GOV_COORD_PR_SCOPE_VALID',
        );
      }
      break;
    case 'validate-bootstrap-worktree':
      validateBootstrapWorktree();
      console.log('GOV_COORD_BOOTSTRAP_WORKTREE_VALID');
      break;
    default:
      reject(
        'CLI_INVALID',
        'command must be self-test, validate-template, validate-request, validate-result, generate-register, verify-register, validate-repository, validate-pr-scope or validate-bootstrap-worktree',
      );
  }
}

module.exports = {
  AUTHORITY_LOCATOR_REPAIR_I01,
  BOOTSTRAP_ADD,
  BOOTSTRAP_ALL,
  BOOTSTRAP_MODIFY,
  CoordinationError,
  EFFECTIVE_FROM_MAIN_SHA,
  EXECUTION_BASE_ANCESTRY_REPAIR_I01,
  GRANT_REPO_PATH,
  LEVEL_2_OPERATIONS,
  NONCOORD_PR_CLASSIFIER_REPAIR_R01,
  REGISTER_REPO_PATH,
  REGISTER_TEST_FIXTURE_REPAIR_I01,
  applyMechanicalOperation,
  assertNotSymlink,
  authorityMarkerLocatesSemanticRow,
  buildAuthorityMarker,
  canonicalize,
  classifyPrChangeSet,
  computeRequestFingerprint,
  countOccurrences,
  extractStructuredJson,
  generateRegisterContent,
  loadRepositoryInstances,
  loadRepositoryInstancesAtGitRef,
  makeSelfTestRequest,
  normalizeRepoPath,
  parseRequestFile,
  parseRequestMarkdown,
  parseResultFile,
  parseResultMarkdown,
  runSelfTest,
  sha256,
  validateRequestObject,
  validateBootstrapWorktree,
  validateAuthorityRecordAtRef,
  validateCanonicalRequestAtExecutionBase,
  validatePrScope,
  validateRequestAgainstGit,
  assertRequestBaseAncestor,
  validateResultObject,
  validateTargetPolicy,
  verifyRegister,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    if (error instanceof CoordinationError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  }
}
