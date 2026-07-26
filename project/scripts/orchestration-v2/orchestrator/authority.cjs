'use strict';
/**
 * GOV-COORD-V2 orchestration — canonicalization and immutable authority.
 *
 * Contract: coordination-v2/governance-orchestration-contract-v2.md
 *           §2  immutable authorization
 *           §12 hash canonicalization (RFC 8785)
 *           §13 base drift policy
 *
 * The orchestrator can never mint authority. It validates that a task spec is
 * pinned by hash inside an owner-ratified grant, and refuses everything else.
 * A spec edited after ratification produces a different digest and is rejected.
 */

const crypto = require('crypto');

const PROFILES = ['MECHANICAL_GOVERNANCE', 'BOUNDED_CODE_TASK'];
const BASE_DRIFT_POLICIES = [
  'STRICT_PINNED_BASE',
  'REBASE_AND_REVALIDATE',
  'REFRESH_BEFORE_EXECUTION',
];
const SUCCESSOR_DISPOSITIONS = [
  'DECLARED_SUCCESSOR',
  'DISCOVERED_FOLLOW_UP',
  'OWNER_AUTHORIZATION_REQUIRED',
  'NO_SUCCESSOR',
];
const MECHANICAL_OPERATIONS = [
  'EXACT_APPEND_AT_DECLARED_ANCHOR',
  'EXACT_LITERAL_REPLACEMENT',
  'EXACT_REFERENCE_REWRITE',
  'DETERMINISTIC_REGISTER_REGENERATION',
];

class AuthorityError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'AuthorityError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new AuthorityError(code, detail);
}

/**
 * RFC 8785 JSON Canonicalization Scheme, restricted to the value shapes a task
 * spec may contain. Object keys sort by UTF-16 code unit, no insignificant
 * whitespace, and numbers must be integers so no float formatting ambiguity can
 * enter a digest.
 */
function canonicalize(value, at) {
  const where = at || '$';
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) fail('CANON_NUMBER_NOT_FINITE', where);
    if (!Number.isInteger(value)) fail('CANON_NUMBER_NOT_INTEGER', where);
    return String(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v, i) => canonicalize(v, where + '[' + i + ']')).join(',') + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return (
      '{' +
      keys
        .map((k) => JSON.stringify(k) + ':' + canonicalize(value[k], where + '.' + k))
        .join(',') +
      '}'
    );
  }
  return fail('CANON_UNSUPPORTED_TYPE', where + ' is ' + t);
}

/**
 * SHA-256 over the canonical byte sequence, lowercase hex (§12).
 *
 * This is a content-integrity digest for task specifications, grants and state
 * payloads — it is a deterministic identifier, never a credential hash. No
 * secret, password or token is ever passed to it: the inputs are task metadata
 * that a grant pins by value so a spec edited after ratification produces a
 * different identifier.
 *
 * A password-strength KDF would be actively wrong here. Contract §12 mandates
 * RFC 8785 canonicalization plus SHA-256 precisely because the digest must be
 * reproducible byte-for-byte across machines and runs; a salted, deliberately
 * slow hash cannot satisfy that.
 */
function digest(value) {
  return crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

/**
 * Canonicalize a path list before hashing (§12): forward slashes, no
 * duplicates, lexicographic order, relative paths only.
 */
function canonicalPathList(list, label) {
  if (!Array.isArray(list)) fail('PATH_LIST_NOT_ARRAY', label);
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string' || raw.length === 0) fail('PATH_LIST_ENTRY_INVALID', label);
    const p = raw.split('\\').join('/');
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) fail('PATH_LIST_ABSOLUTE', p);
    if (p.split('/').some((s) => s === '..' || s === '.')) fail('PATH_LIST_TRAVERSAL', p);
    if (out.indexOf(p) !== -1) fail('PATH_LIST_DUPLICATE', p);
    out.push(p);
  }
  return out.sort();
}

/**
 * requiredTests canonicalize as an ordered list of argv objects. A shell
 * command string is never hashed, because it is never executed (§12, §7.2).
 */
function canonicalRequiredTests(tests) {
  if (!Array.isArray(tests)) fail('REQUIRED_TESTS_NOT_ARRAY', 'requiredTests');
  return tests.map((t, i) => {
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      fail('REQUIRED_TEST_NOT_OBJECT', 'requiredTests[' + i + ']');
    }
    if (typeof t.argv === 'string') fail('REQUIRED_TEST_SHELL_STRING', 'requiredTests[' + i + ']');
    if (!Array.isArray(t.argv) || t.argv.length === 0) {
      fail('REQUIRED_TEST_ARGV_INVALID', 'requiredTests[' + i + ']');
    }
    for (const a of t.argv) {
      if (typeof a !== 'string') fail('REQUIRED_TEST_ARGV_NOT_STRING', 'requiredTests[' + i + ']');
    }
    const out = { argv: t.argv.slice() };
    if (t.cwd !== undefined) out.cwd = String(t.cwd).split('\\').join('/');
    if (t.timeoutMs !== undefined) out.timeoutMs = t.timeoutMs;
    return out;
  });
}

/** Structural validation of a task spec. Produces the canonical form. */
function normalizeTaskSpec(spec) {
  if (!spec || typeof spec !== 'object') fail('TASK_SPEC_INVALID', 'not an object');
  if (spec.schemaVersion !== 1) fail('TASK_SPEC_SCHEMA_VERSION', String(spec.schemaVersion));
  if (!/^[A-Z0-9][A-Z0-9._-]{2,63}$/.test(String(spec.taskId))) {
    fail('TASK_ID_INVALID', String(spec.taskId));
  }
  if (!Number.isInteger(spec.taskSpecVersion) || spec.taskSpecVersion < 1) {
    fail('TASK_SPEC_VERSION_INVALID', String(spec.taskSpecVersion));
  }
  if (PROFILES.indexOf(spec.profile) === -1) fail('PROFILE_INVALID', String(spec.profile));
  if (typeof spec.declaredIntent !== 'string' || spec.declaredIntent.length < 10) {
    fail('DECLARED_INTENT_INVALID', 'must be a sentence of at least 10 characters');
  }
  if (spec.declaredIntent.length > 300) fail('DECLARED_INTENT_TOO_LONG', 'max 300');
  if (BASE_DRIFT_POLICIES.indexOf(spec.baseDriftPolicy) === -1) {
    fail('BASE_DRIFT_POLICY_INVALID', String(spec.baseDriftPolicy));
  }
  if (SUCCESSOR_DISPOSITIONS.indexOf(spec.successorDisposition) === -1) {
    fail('SUCCESSOR_DISPOSITION_INVALID', String(spec.successorDisposition));
  }
  if (spec.baseDriftPolicy === 'STRICT_PINNED_BASE' && !/^[0-9a-f]{40}$/.test(String(spec.baseSha))) {
    fail('BASE_SHA_REQUIRED', 'STRICT_PINNED_BASE requires a pinned baseSha');
  }

  const bp = spec.boundaryPolicy;
  if (!bp || typeof bp !== 'object') fail('BOUNDARY_POLICY_INVALID', 'missing');
  const allowedRoots = canonicalPathList(bp.allowedRoots || [], 'allowedRoots').map((r) =>
    r.endsWith('/') ? r : r + '/',
  );
  const exactTargets = canonicalPathList(bp.exactTargets || [], 'exactTargets');
  const requiredTests = canonicalRequiredTests(spec.requiredTests || []);

  if (spec.profile === 'BOUNDED_CODE_TASK') {
    if (allowedRoots.length === 0) fail('BOUNDED_CODE_TASK_NEEDS_ROOTS', 'empty allowlist permits nothing');
    if (requiredTests.length === 0) fail('BOUNDED_CODE_TASK_NEEDS_TESTS', 'at least one required test');
    if (spec.mechanicalOperation !== undefined) {
      fail('PROFILE_FIELD_MISMATCH', 'mechanicalOperation is not valid for BOUNDED_CODE_TASK');
    }
  } else {
    const op = spec.mechanicalOperation;
    if (!op || typeof op !== 'object') fail('MECHANICAL_OPERATION_REQUIRED', 'missing');
    if (MECHANICAL_OPERATIONS.indexOf(op.operationType) === -1) {
      fail('MECHANICAL_OPERATION_INVALID', String(op.operationType));
    }
    if (!/^[0-9a-f]{64}$/.test(String(op.expectedResultSha256))) {
      fail('EXPECTED_RESULT_SHA_INVALID', String(op.expectedResultSha256));
    }
  }

  const canonical = {
    schemaVersion: 1,
    taskId: spec.taskId,
    taskSpecVersion: spec.taskSpecVersion,
    profile: spec.profile,
    declaredIntent: spec.declaredIntent,
    boundaryPolicy: { allowedRoots: allowedRoots },
    requiredTests: requiredTests,
    predecessorTaskIds: canonicalPathList(
      (spec.predecessorTaskIds || []).map(String),
      'predecessorTaskIds',
    ),
    baseDriftPolicy: spec.baseDriftPolicy,
    successorDisposition: spec.successorDisposition,
  };
  if (exactTargets.length) canonical.boundaryPolicy.exactTargets = exactTargets;
  if (bp.maxChangedFiles !== undefined) canonical.boundaryPolicy.maxChangedFiles = bp.maxChangedFiles;
  if (spec.baseSha !== undefined) canonical.baseSha = spec.baseSha;
  if (spec.mechanicalOperation !== undefined) canonical.mechanicalOperation = spec.mechanicalOperation;

  return canonical;
}

/** The four digests a grant pins a task by (§2). */
function specDigests(spec) {
  const canonical = normalizeTaskSpec(spec);
  return {
    canonical: canonical,
    taskSpecSha256: digest(canonical),
    declaredIntentSha256: digest(canonical.declaredIntent),
    boundaryPolicySha256: digest(canonical.boundaryPolicy),
    requiredTestsSha256: digest(canonical.requiredTests),
  };
}

/**
 * Validate a task spec against an owner-ratified grant.
 *
 * Fail-closed on: unknown task, digest mismatch of any of the four pinned
 * hashes, expired or revoked grant, boundary escaping the grant's own roots,
 * and a missing execution grant reference. Returns the canonical spec plus the
 * grant binding so downstream stages never re-derive authority.
 */
function validateAgainstGrant(opts) {
  const grant = opts.grant;
  const spec = opts.spec;
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();

  if (!grant || typeof grant !== 'object') fail('GRANT_INVALID', 'missing');
  if (grant.schemaVersion !== 1) fail('GRANT_SCHEMA_VERSION', String(grant.schemaVersion));
  if (grant.manualMergeRequired !== true) fail('GRANT_MANUAL_MERGE_REQUIRED', 'must be true');
  if (!grant.semanticAuthorityRef || !grant.executionGrantRef) {
    fail('AUTHORITY_REF_MISSING', 'both semanticAuthorityRef and executionGrantRef are required');
  }
  // §2: the two references may not be satisfied by the same record identity.
  const sameRef =
    grant.semanticAuthorityRef.sourcePath === grant.executionGrantRef.sourcePath &&
    grant.semanticAuthorityRef.recordId === grant.executionGrantRef.recordId;
  if (sameRef) fail('AUTHORITY_REFS_NOT_DISTINCT', grant.semanticAuthorityRef.recordId);

  if (opts.revoked === true) fail('GRANT_REVOKED', grant.grantId);
  if (grant.expiresAt) {
    const exp = Date.parse(grant.expiresAt);
    if (!Number.isFinite(exp)) fail('GRANT_EXPIRY_INVALID', String(grant.expiresAt));
    if (exp <= nowMs) fail('GRANT_EXPIRED', grant.expiresAt);
  } else if (!grant.noExpiryPolicyRef) {
    fail('GRANT_EXPIRY_MISSING', 'either expiresAt or an explicit noExpiryPolicyRef');
  }

  const d = specDigests(spec);
  const pinned = (grant.authorizedTasks || []).find((t) => t.taskId === d.canonical.taskId);
  if (!pinned) fail('TASK_NOT_IN_GRANT', d.canonical.taskId);

  if (pinned.taskSpecVersion !== d.canonical.taskSpecVersion) {
    fail('TASK_SPEC_VERSION_MISMATCH', pinned.taskSpecVersion + ' != ' + d.canonical.taskSpecVersion);
  }
  for (const field of [
    'taskSpecSha256',
    'declaredIntentSha256',
    'boundaryPolicySha256',
    'requiredTestsSha256',
  ]) {
    if (pinned[field] !== d[field]) {
      fail('TASK_SPEC_HASH_MISMATCH', field + ' pinned=' + pinned[field] + ' actual=' + d[field]);
    }
  }

  // A task boundary can never exceed the grant's own allowed roots.
  if (Array.isArray(grant.allowedModuleRoots) && grant.allowedModuleRoots.length) {
    const grantRoots = canonicalPathList(grant.allowedModuleRoots, 'grant.allowedModuleRoots').map(
      (r) => (r.endsWith('/') ? r : r + '/'),
    );
    for (const root of d.canonical.boundaryPolicy.allowedRoots) {
      const inside = grantRoots.some((g) => root === g || root.startsWith(g));
      if (!inside) fail('BOUNDARY_EXCEEDS_GRANT', root);
    }
  }

  return {
    spec: d.canonical,
    digests: d,
    grantId: grant.grantId,
    grantSha256: digest(grant),
    pinned: pinned,
    predecessorTaskIds: pinned.predecessorTaskIds || d.canonical.predecessorTaskIds || [],
  };
}

module.exports = {
  PROFILES,
  BASE_DRIFT_POLICIES,
  SUCCESSOR_DISPOSITIONS,
  MECHANICAL_OPERATIONS,
  AuthorityError,
  canonicalize,
  digest,
  canonicalPathList,
  canonicalRequiredTests,
  normalizeTaskSpec,
  specDigests,
  validateAgainstGrant,
};
