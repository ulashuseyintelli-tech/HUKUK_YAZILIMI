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
const REGISTER_REPO_PATH =
  'project/docs/governance/governance-writer-coordination-register.md';

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
  assertNonEmptyString(ref.recordId, `${label}.recordId`, template);
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

function parseRequestFile(filePath, options = {}) {
  const markdown = fs.readFileSync(filePath, 'utf8');
  return validateRequestObject(extractStructuredJson(markdown, 'request'), options);
}

function parseResultFile(filePath, options = {}) {
  const markdown = fs.readFileSync(filePath, 'utf8');
  return validateResultObject(extractStructuredJson(markdown, 'result'), options);
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

function assertGitFileNotSymlink(ref, repoPath, cwd = REPO_ROOT) {
  const result = runGit(['ls-tree', ref, '--', repoPath], cwd);
  const line = result.stdout.trim();
  if (!line) reject('TARGET_NOT_FOUND', `${repoPath} does not exist at ${ref}`);
  const mode = line.split(/\s+/)[0];
  assertNotSymlink(mode === '120000', `${ref}:${repoPath}`);
}

function validateAuthorityRecordAtRef(ref, authorityRef, cwd = REPO_ROOT) {
  const content = gitShow(ref, authorityRef.path, cwd);
  const matches = countOccurrences(content, authorityRef.recordId);
  if (matches !== 1) {
    reject(
      'AUTHORITY_RECORD_MATCH_INVALID',
      `${authorityRef.path}#${authorityRef.recordId} matched ${matches} times at ${ref}`,
    );
  }
  if (!gitIsAncestor(authorityRef.evidenceSha, ref, cwd)) {
    reject('AUTHORITY_EVIDENCE_NOT_IN_MAIN', `${authorityRef.evidenceSha} is not ancestor of ${ref}`);
  }
}

function validateRequestAgainstGit(request, baseRef, headRef = null, cwd = REPO_ROOT) {
  if (request.baseMainSha !== baseRef) {
    reject('REQUEST_BASE_MISMATCH', `request base ${request.baseMainSha} != PR base ${baseRef}`);
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

function classifyPrChangeSet(changes) {
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
    paths.size === BOOTSTRAP_ALL.size &&
    [...paths].every((candidate) => BOOTSTRAP_ALL.has(candidate)) &&
    changes.every((change) => {
      if (BOOTSTRAP_MODIFY.has(change.path)) return change.status === 'M';
      return BOOTSTRAP_ADD.has(change.path) && change.status === 'A';
    })
  ) {
    return { mode: 'BOOTSTRAP' };
  }

  const newRequests = changes.filter(
    (change) => change.status === 'A' && isRequestInstancePath(change.path),
  );
  if (
    changes.length === 2 &&
    newRequests.length === 1 &&
    changes.some(
      (change) => change.status === 'M' && change.path === REGISTER_REPO_PATH,
    )
  ) {
    return { mode: 'REQUEST_ONLY', instancePath: newRequests[0].path };
  }

  const newResults = changes.filter(
    (change) => change.status === 'A' && isResultInstancePath(change.path),
  );
  if (
    changes.length === 2 &&
    newResults.length === 1 &&
    changes.some(
      (change) => change.status === 'M' && change.path === REGISTER_REPO_PATH,
    )
  ) {
    return { mode: 'RESULT_ONLY', instancePath: newResults[0].path };
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
  if (changes.some((change) => change.status !== 'M')) {
    reject('EXECUTION_SCOPE_INVALID', 'execution PR may only modify declared target files');
  }
  return { mode: 'EXECUTION' };
}

function repoPathToAbsolute(repoPath, repoRoot = REPO_ROOT) {
  return path.join(repoRoot, ...normalizeRepoPath(repoPath).split('/'));
}

function validatePrScope(options) {
  const { base, head, headRef = '', cwd = REPO_ROOT } = options;
  assertSha(base, 'base');
  assertSha(head, 'head');
  const changes = parseGitChanges(base, head, cwd);
  const classification = classifyPrChangeSet(changes);

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

  const branchMatch = /^codex\/gov-exec\/(GOV-REQ-\d{8}-[A-Z0-9][A-Z0-9-]*)$/.exec(
    headRef,
  );
  if (!branchMatch) {
    reject('EXECUTION_BRANCH_INVALID', 'execution branch must bind an exact requestId');
  }
  const requestId = branchMatch[1];
  const requestPath = path.join(
    cwd,
    'project',
    'docs',
    'governance',
    'coordination-requests',
    requestId,
    'request.md',
  );
  const request = parseRequestFile(requestPath);
  const changedPaths = changes.map((change) => change.path).sort();
  const allowedPaths = [...request.declaredTargetAllowlist].sort();
  if (
    changedPaths.length !== allowedPaths.length ||
    changedPaths.some((candidate, index) => candidate !== allowedPaths[index])
  ) {
    reject(
      'EXECUTION_TARGET_ALLOWLIST_MISMATCH',
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
      validatePrScope({
        base: args.base,
        head: args.head,
        headRef: args['head-ref'] || '',
      });
      console.log('GOV_COORD_PR_SCOPE_VALID');
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
  BOOTSTRAP_ADD,
  BOOTSTRAP_ALL,
  BOOTSTRAP_MODIFY,
  CoordinationError,
  EFFECTIVE_FROM_MAIN_SHA,
  GRANT_REPO_PATH,
  LEVEL_2_OPERATIONS,
  REGISTER_REPO_PATH,
  applyMechanicalOperation,
  assertNotSymlink,
  canonicalize,
  classifyPrChangeSet,
  computeRequestFingerprint,
  countOccurrences,
  extractStructuredJson,
  generateRegisterContent,
  loadRepositoryInstances,
  makeSelfTestRequest,
  normalizeRepoPath,
  parseRequestFile,
  parseResultFile,
  runSelfTest,
  sha256,
  validateRequestObject,
  validateBootstrapWorktree,
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
