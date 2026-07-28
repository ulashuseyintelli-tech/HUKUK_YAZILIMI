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
  // Version dispatch, not a widened check. v1 keeps its exact meaning and its
  // exact canonical shape — every historical digest must still reproduce — and
  // v2 adds the delivery contract. A record that is neither fails closed.
  const schemaVersion = spec.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) fail('TASK_SPEC_SCHEMA_VERSION', String(schemaVersion));
  if (schemaVersion === 1 && spec.deliveryContract !== undefined) {
    // A v1 spec carrying a delivery contract is a mixed-version object: the
    // contract would not be in the canonical form, so it would not be in the
    // digest, so a grant could pin the spec while the contract said anything.
    fail('TASK_SPEC_MIXED_VERSION', 'a schemaVersion 1 task may not carry a deliveryContract');
  }
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
    schemaVersion: schemaVersion,
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

  if (schemaVersion === 2) {
    // A v2 task without a delivery contract is a task that can never be shown
    // to have delivered anything, which is the whole point of the version.
    if (spec.deliveryContract === undefined) {
      fail('TASK_SPEC_DELIVERY_CONTRACT_REQUIRED', spec.taskId);
    }
    // NORMALIZED into the canonical spec, so the contract is inside
    // taskSpecSha256. A contract hashed separately and referenced by digest
    // could drift from the spec the grant pinned; inside, it cannot.
    canonical.deliveryContract = normalizeDeliveryContract(spec.deliveryContract);

    // A self-declared digest is a claim, not evidence. It is recomputed and
    // compared rather than trusted — the #1696 defect in one line.
    if (spec.deliveryContractSha256 !== undefined) {
      const actual = digest(canonical.deliveryContract);
      if (spec.deliveryContractSha256 !== actual) {
        fail('DELIVERY_CONTRACT_HASH_MISMATCH', 'declared=' + String(spec.deliveryContractSha256) + ' actual=' + actual);
      }
    }
  }

  return canonical;
}

/**
 * The digests a grant pins a task by (§2).
 *
 * v1 returns four. v2 returns five — the delivery contract is pinned like every
 * other semantic field, so changing the capability, its target state or its
 * probe invalidates the grant exactly as changing the boundary policy does.
 *
 * Every value derives from the NORMALIZED spec. Nothing here hashes a raw input
 * field: that divergence — generator over raw text, validator over canonical
 * JSON — is what #1696 was.
 */
function specDigests(spec) {
  const canonical = normalizeTaskSpec(spec);
  const out = {
    canonical: canonical,
    taskSpecSha256: digest(canonical),
    declaredIntentSha256: digest(canonical.declaredIntent),
    boundaryPolicySha256: digest(canonical.boundaryPolicy),
    requiredTestsSha256: digest(canonical.requiredTests),
  };
  if (canonical.schemaVersion === 2) {
    out.deliveryContractSha256 = digest(canonical.deliveryContract);
  }
  return out;
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
  // Manual merge is the default and stays the default.
  //
  // A grant may set it false ONLY by naming the parent authorization that says
  // otherwise. That keeps the exception evidenced rather than merely available:
  // an unnamed `false` is indistinguishable from a typo, and this is the field
  // whose typo would be a merge nobody authorized.
  //
  // Naming an envelope is not the same as being allowed to merge — it gets the
  // task past THIS check. gh-merge-provider then re-reads the standing grant,
  // the PR, the review state and the live required checks at merge time and
  // refuses on any of a dozen grounds.
  if (grant.manualMergeRequired !== true) {
    if (grant.manualMergeRequired !== false) {
      fail('GRANT_MANUAL_MERGE_REQUIRED', 'must be true, or false with autoMergeAuthorizedBy');
    }
    if (typeof grant.autoMergeAuthorizedBy !== 'string' || !grant.autoMergeAuthorizedBy) {
      fail('GRANT_AUTO_MERGE_UNATTRIBUTED', 'manualMergeRequired:false needs autoMergeAuthorizedBy');
    }
  }
  if (!grant.semanticAuthorityRef || !grant.executionGrantRef) {
    fail('AUTHORITY_REF_MISSING', 'both semanticAuthorityRef and executionGrantRef are required');
  }
  // §2: the two references may not be satisfied by the same record identity.
  const sameRef =
    grant.semanticAuthorityRef.sourcePath === grant.executionGrantRef.sourcePath &&
    grant.semanticAuthorityRef.recordId === grant.executionGrantRef.recordId;
  if (sameRef) fail('AUTHORITY_REFS_NOT_DISTINCT', grant.semanticAuthorityRef.recordId);

  // §2: the owner's ratification must actually be present, not merely declared.
  //
  // grant.schema.json requires ownerRatificationEvidence with four fields, and
  // until now nothing read it — the string "<OWNER-FILLS>" passed validation as
  // readily as a real excerpt. That made the whole point of the field decorative:
  // an unratified grant was accepted as long as its expiry parsed. Caught by
  // filling a real expiry into an otherwise-placeholder grant and watching
  // validateAgainstGrant return success.
  //
  // Shape only is enforced here. Whether the excerpt genuinely appears at that
  // path and commit is a repository-state question, verified by
  // verifyRatificationEvidence() below when a reader is supplied — the same
  // separation V1 makes between a well-formed record and one that is actually
  // in main.
  const ev = grant.ownerRatificationEvidence;
  if (!ev || typeof ev !== 'object') {
    fail('OWNER_RATIFICATION_EVIDENCE_MISSING', 'grant carries no ownerRatificationEvidence');
  }
  for (const field of ['sourcePath', 'sourceCommitSha', 'exactExcerpt', 'excerptSha256']) {
    const v = ev[field];
    if (typeof v !== 'string' || v.length === 0) {
      fail('OWNER_RATIFICATION_EVIDENCE_INCOMPLETE', field);
    }
    // A placeholder is not evidence. Fail closed on the shapes a half-filled
    // template leaves behind rather than treating them as opaque strings.
    if (/^<.*>$/.test(v) || /OWNER[-_ ]?FILL/i.test(v) || v === 'TBD' || v === 'TODO') {
      fail('OWNER_RATIFICATION_EVIDENCE_PLACEHOLDER', field + '=' + v.slice(0, 40));
    }
  }
  if (!/^[0-9a-f]{40}$/.test(ev.sourceCommitSha)) {
    fail('OWNER_RATIFICATION_EVIDENCE_SHA_INVALID', ev.sourceCommitSha.slice(0, 40));
  }
  if (!/^[0-9a-f]{64}$/.test(ev.excerptSha256)) {
    fail('OWNER_RATIFICATION_EVIDENCE_DIGEST_INVALID', ev.excerptSha256.slice(0, 40));
  }
  // The digest must be of the excerpt it travels with, otherwise the pair proves
  // nothing: either half could be swapped without detection.
  const excerptDigest = crypto.createHash('sha256').update(ev.exactExcerpt, 'utf8').digest('hex');
  if (excerptDigest !== ev.excerptSha256) {
    fail('OWNER_RATIFICATION_EXCERPT_DIGEST_MISMATCH', 'computed=' + excerptDigest);
  }

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
  // Schema agreement between the task and the entry that authorizes it.
  //
  // A v1 grant entry cannot authorize a v2 task: it has no delivery digest to
  // pin, so it would be authorizing a delivery claim it never saw. The converse
  // is equally refused — a v2 entry pinning a v1 task pins a digest that does
  // not exist.
  const pinnedVersion = pinned.taskSchemaVersion === undefined ? 1 : pinned.taskSchemaVersion;
  if (pinnedVersion !== d.canonical.schemaVersion) {
    fail(
      'GRANT_TASK_SCHEMA_VERSION_MISMATCH',
      'grant pins schema ' + pinnedVersion + ', task is schema ' + d.canonical.schemaVersion,
    );
  }
  if (d.canonical.schemaVersion === 2) {
    if (typeof pinned.deliveryContractSha256 !== 'string' || !pinned.deliveryContractSha256) {
      fail('GRANT_DELIVERY_CONTRACT_DIGEST_MISSING', d.canonical.taskId);
    }
    if (pinned.deliveryContractSha256 !== d.deliveryContractSha256) {
      // The grant ratified one delivery claim and the task now makes another.
      // Changing the capability, its target state or its probe lands here;
      // editing a title or a rationale does not, because neither is hashed.
      fail(
        'DELIVERY_CONTRACT_HASH_MISMATCH',
        'pinned=' + pinned.deliveryContractSha256 + ' actual=' + d.deliveryContractSha256,
      );
    }
  }

  // The four (v1) or five (v2) pinned digests, checked AFTER the delivery
  // comparison above. Order matters for diagnosis rather than for safety: the
  // contract lives inside the canonical spec, so changing a capability's target
  // state moves taskSpecSha256 too, and reporting that first would tell an
  // operator "the spec changed" when the useful answer is "the delivery claim
  // changed". Both refuse; only one names the cause.
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

/**
 * Confirm the owner's ratification is actually in the repository, not merely
 * well-formed inside the grant.
 *
 * validateAgainstGrant checks shape, because it must stay pure — it is called in
 * tests against fixtures with no repository behind them. This is the second
 * half, and the separation mirrors V1's: a record can be structurally valid and
 * still not be in main.
 *
 * @param {object} opts
 * @param {object} opts.grant
 * @param {function} opts.readAtCommit  (sourcePath, sourceCommitSha) => string
 *        Typically `git show <sha>:<path>`. Must throw or return null if the
 *        path does not exist at that commit.
 * @param {function} [opts.isAncestor]  (sha) => boolean, whether the commit is
 *        reachable from the target branch. Omit to skip the reachability test.
 * @returns {{ok: true}} or throws AuthorityError
 */
function verifyRatificationEvidence(opts) {
  const grant = opts && opts.grant;
  const ev = grant && grant.ownerRatificationEvidence;
  if (!ev) fail('OWNER_RATIFICATION_EVIDENCE_MISSING', 'nothing to verify');
  if (typeof opts.readAtCommit !== 'function') {
    fail('EVIDENCE_READER_REQUIRED', 'readAtCommit is required to verify against the repository');
  }

  // A ratification that is not reachable from the branch the task targets is
  // not in force, however genuine it looked when it was written.
  if (typeof opts.isAncestor === 'function' && !opts.isAncestor(ev.sourceCommitSha)) {
    fail('OWNER_RATIFICATION_NOT_IN_MAIN', ev.sourceCommitSha);
  }

  let content;
  try {
    content = opts.readAtCommit(ev.sourcePath, ev.sourceCommitSha);
  } catch (e) {
    fail('OWNER_RATIFICATION_SOURCE_UNREADABLE', ev.sourcePath + '@' + ev.sourceCommitSha);
  }
  if (typeof content !== 'string' || content.length === 0) {
    fail('OWNER_RATIFICATION_SOURCE_EMPTY', ev.sourcePath + '@' + ev.sourceCommitSha);
  }

  // The excerpt must appear verbatim. Line numbers are deliberately not used:
  // they go stale silently as a file grows, which is the failure mode the
  // exactExcerpt + digest pair exists to replace.
  if (content.indexOf(ev.exactExcerpt) === -1) {
    fail('OWNER_RATIFICATION_EXCERPT_ABSENT', ev.sourcePath + '@' + ev.sourceCommitSha);
  }
  return { ok: true };
}

/**
 * Confirm both authority references resolve to records that actually exist.
 *
 * §15.5 forbids a planner from producing semanticAuthorityRef — it is an owner
 * or domain decision — and nothing enforced it. validateAgainstGrant checks only
 * that the two refs are distinct, so a fabricated recordId pointing at a real
 * file passed every gate: the reference looked authoritative and referred to
 * nothing.
 *
 * That is not hypothetical. A plan was authored in this repository citing
 * semanticAuthorityRef recordId OFFICE-P2-CAP02-REPORTINGLINE-READ-CHARACTERIZATION
 * against OFFICE-DELIVERY-MANIFEST.md; the string appeared nowhere in that file,
 * or anywhere else except the grant that invented it. Only human review caught
 * it. This is the code path that would have.
 *
 * An EXECUTION_GRANT record must additionally carry the authority marker V1
 * established, because an execution grant is a stronger claim than a semantic
 * reference and should be impossible to satisfy by coincidence — a recordId that
 * merely appears somewhere in prose is not a grant.
 *
 * @param {object} opts
 * @param {object} opts.grant
 * @param {function} opts.readAtCommit (sourcePath, commitSha) => string
 * @param {string} opts.atCommit        commit to read both records at
 * @returns {{ok: true, checked: string[]}}
 */
function verifyAuthorityRefs(opts) {
  const grant = opts && opts.grant;
  if (!grant) fail('GRANT_INVALID', 'missing');
  if (typeof opts.readAtCommit !== 'function') {
    fail('EVIDENCE_READER_REQUIRED', 'readAtCommit is required to verify authority references');
  }
  const at = opts.atCommit;
  if (!/^[0-9a-f]{40}$/.test(String(at || ''))) fail('EVIDENCE_COMMIT_INVALID', String(at));

  const checked = [];
  for (const field of ['semanticAuthorityRef', 'executionGrantRef']) {
    const ref = grant[field];
    if (!ref) fail('AUTHORITY_REF_MISSING', field);

    let content;
    try {
      content = opts.readAtCommit(ref.sourcePath, at);
    } catch (e) {
      fail('AUTHORITY_RECORD_UNREADABLE', field + ' ' + ref.sourcePath + '@' + at);
    }
    if (typeof content !== 'string' || content.length === 0) {
      fail('AUTHORITY_RECORD_EMPTY', field + ' ' + ref.sourcePath);
    }
    if (content.indexOf(ref.recordId) === -1) {
      fail('AUTHORITY_RECORD_ID_ABSENT', field + ' ' + ref.recordId + ' not in ' + ref.sourcePath);
    }
    if (ref.kind === 'EXECUTION_GRANT') {
      // The marker V1 uses, so a grant cannot be satisfied by an incidental
      // mention of its own id in prose.
      const marker = new RegExp(
        'GOV-COORD-AUTHORITY[^\\n]*kind=EXECUTION_GRANT[^\\n]*recordId=' +
          ref.recordId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      );
      if (!marker.test(content)) {
        fail('AUTHORITY_RECORD_MARKER_MISSING', ref.recordId + ' in ' + ref.sourcePath);
      }
    }
    checked.push(field);
  }
  return { ok: true, checked };
}

/**
 * Is this grant revoked, according to the repository?
 *
 * `revocationPath` is a REQUIRED field of every grant and no code read it.
 * Creating the file it names did nothing: validateAgainstGrant honours only a
 * `revoked` boolean, and nothing on the live path ever computed one. So a
 * grant could not actually be revoked — the owner's stated escape hatch was
 * decorative.
 *
 * That matters more once grants become standing rather than task-scoped: a
 * standing authority that cannot be withdrawn is worse than no standing
 * authority at all, which is why this gates the standing-grant work.
 *
 * Revocation is read at the CURRENT tip, not at the grant's own commit — a
 * revocation written after the grant was issued is exactly the case that has
 * to work.
 *
 * @param {object} opts
 * @param {object} opts.grant
 * @param {function} opts.readAtCommit (sourcePath, commitSha) => string; must
 *        throw when the path does not exist at that commit.
 * @param {string} opts.atCommit
 * @returns {{revoked: boolean, path: string, reason: string|null}}
 */
function isGrantRevoked(opts) {
  const grant = opts && opts.grant;
  if (!grant) fail('GRANT_INVALID', 'missing');
  const p = grant.revocationPath;
  if (typeof p !== 'string' || p.length === 0) {
    // The schema makes it required; an absent one is a malformed grant, not an
    // invitation to assume "not revoked".
    fail('GRANT_REVOCATION_PATH_MISSING', String(p));
  }
  if (typeof opts.readAtCommit !== 'function') {
    fail('EVIDENCE_READER_REQUIRED', 'readAtCommit is required to read the revocation path');
  }
  let body = null;
  try {
    body = opts.readAtCommit(p, opts.atCommit);
  } catch (e) {
    // Absent file is the normal, healthy case: the grant is live.
    return { revoked: false, path: p, reason: null };
  }
  return { revoked: true, path: p, reason: String(body || '').trim().slice(0, 300) || 'revocation marker present' };
}

/**
 * Task classes a standing grant may admit. Mirrors standing-grant.schema.json;
 * kept here so the validator needs no I/O and the vocabulary stays greppable.
 */
const TASK_CLASSES = [
  'TEST_ONLY_CHARACTERIZATION',
  'BOUNDED_CODE_FIX',
  'CANONICAL_STATUS_UPDATE',
  'DECISION_LOG_APPEND',
  'CLOSURE_EVIDENCE',
  'GENERATED_MANIFEST_REFRESH',
  'PROGRAM_POINTER_UPDATE',
  'DOCUMENTATION_SYNCHRONIZATION',
  'OPERATOR_RUNBOOK_UPDATE',
  'AUDIT_RECORD_MATERIALIZATION',
];

/** A path sits under a root when the root is a directory prefix, or names it. */
function underRoot(p, root) {
  const c = String(p);
  const r = String(root);
  return c === r || c === r.slice(0, -1) || c.startsWith(r);
}

/**
 * Is this child plan inside its standing grant?
 *
 * A standing grant removes the per-task owner ratification round. What replaces
 * it is this function: every limit the grant states is enforced mechanically,
 * on the plan, before anything runs. Nothing in the grant is advisory.
 *
 * Deterministic and total on purpose — it reads only the grant and the spec,
 * performs no I/O, and returns the same verdict for the same inputs — so queue
 * admission, preflight and attestation can all call it without the three
 * drifting apart.
 *
 * @param {object} opts
 * @param {object} opts.standingGrant
 * @param {object} opts.spec              child task spec
 * @param {string} opts.taskClass
 * @param {string} [opts.executorLane]
 * @param {boolean} [opts.revoked]        from isGrantRevoked(), read at the tip
 * @param {boolean} [opts.killSwitchEngaged]
 * @param {number} [opts.nowMs]
 * @returns {{ok: true, program: string, taskClass: string}} or throws
 */
function validateAgainstStandingGrant(opts) {
  const g = opts && opts.standingGrant;
  const spec = opts && opts.spec;
  if (!g) fail('STANDING_GRANT_INVALID', 'missing');
  if (!spec) fail('TASK_SPEC_INVALID', 'missing');
  if (g.schemaVersion !== 1) fail('STANDING_GRANT_SCHEMA_VERSION', String(g.schemaVersion));

  // A revoked or killed grant authorizes nothing, whatever else holds.
  if (opts.revoked === true) fail('STANDING_GRANT_REVOKED', g.standingGrantId);
  if (opts.killSwitchEngaged === true) fail('KILL_SWITCH_ENGAGED', g.killSwitchPath || '(unset)');

  if (g.expiresAt) {
    const t = Date.parse(g.expiresAt);
    if (!Number.isFinite(t)) fail('STANDING_GRANT_EXPIRY_INVALID', String(g.expiresAt));
    if ((opts.nowMs || Date.now()) >= t) fail('STANDING_GRANT_EXPIRED', g.expiresAt);
  }

  // The grant must be anchored to an owner decision. One that cites no parent
  // is self-authorizing, which is the single thing it may never be.
  const parent = g.parentAuthorizationRef;
  if (
    !parent ||
    !parent.authorizationId ||
    !parent.sourcePath ||
    !/^[0-9a-f]{64}$/.test(String(parent.payloadSha256 || ''))
  ) {
    fail('STANDING_GRANT_PARENT_REF_INVALID', JSON.stringify(parent || null).slice(0, 120));
  }

  // Task class must be admitted explicitly. Anything unlisted is refused,
  // including classes that exist in the vocabulary but were not granted.
  const cls = String(opts.taskClass || '');
  if (TASK_CLASSES.indexOf(cls) === -1) fail('TASK_CLASS_UNKNOWN', cls || '(none)');
  if ((g.allowedTaskClasses || []).indexOf(cls) === -1) {
    fail('TASK_CLASS_NOT_GRANTED', cls + ' not in ' + JSON.stringify(g.allowedTaskClasses));
  }

  if (opts.executorLane && (g.allowedExecutorLanes || []).indexOf(opts.executorLane) === -1) {
    fail('EXECUTOR_LANE_NOT_GRANTED', String(opts.executorLane));
  }

  // Boundary: every root the plan asks for must sit under a granted root, and
  // none may touch a prohibited one. Subset, not intersection — a plan that
  // reaches one path outside the grant is outside the grant.
  const asked = (spec.boundaryPolicy && spec.boundaryPolicy.allowedRoots) || [];
  if (asked.length === 0) fail('BOUNDARY_EMPTY', spec.taskId || '(no taskId)');
  for (const root of asked) {
    if (!(g.allowedPathRoots || []).some((allowed) => underRoot(root, allowed))) {
      fail('BOUNDARY_EXCEEDS_STANDING_GRANT', root);
    }
    for (const banned of g.prohibitedPathRoots || []) {
      if (underRoot(root, banned) || underRoot(banned, root)) {
        fail('BOUNDARY_TOUCHES_PROHIBITED_SURFACE', root + ' ~ ' + banned);
      }
    }
  }

  // Serial execution, independent review and bounded merge are properties of
  // the grant, not runtime preferences that a caller may soften.
  if (g.maxConcurrency !== 1) fail('STANDING_GRANT_CONCURRENCY_INVALID', String(g.maxConcurrency));
  if (g.requiredIndependentReview !== true) fail('INDEPENDENT_REVIEW_NOT_REQUIRED', g.standingGrantId);
  if (!g.mergePolicy || g.mergePolicy.repositoryWideAutoMerge !== false) {
    fail('REPOSITORY_WIDE_AUTO_MERGE_FORBIDDEN', g.standingGrantId);
  }
  if (!g.ciPolicy || g.ciPolicy.requireTerminalSuccess !== true) {
    fail('CI_TERMINAL_SUCCESS_NOT_REQUIRED', g.standingGrantId);
  }

  // The self-modification bar. A grant whose prohibitions are not all asserted
  // is malformed rather than permissive.
  const pro = g.prohibitions || {};
  for (const k of [
    'noPrivilegeDelegation',
    'noSecretAccessExpansion',
    'noProductionDataMutation',
    'noCrossProgramMutation',
    'noSelfAuthorizationChange',
  ]) {
    if (pro[k] !== true) fail('STANDING_GRANT_PROHIBITION_MISSING', k);
  }

  return { ok: true, program: g.program.programId, taskClass: cls };
}

/**
 * The delivery contract, canonicalized — the identity of a delivery CLAIM.
 *
 * This lives here, beside specDigests, rather than in the delivery package, and
 * that placement is the point. manifest.cjs shipped its own canonicalJson and
 * its own sha256, so the repository had two independent answers to "what is the
 * canonical form of this object?" — and #1696 is the record of what that costs:
 * a generator hashed raw text while a validator hashed canonical JSON, and the
 * two disagreed silently until a human noticed. One canonicalization, one
 * digest function, every caller.
 *
 * What is IN the digest is a semantic decision, not a convenience:
 *
 *   capabilityId            which claim this is
 *   targetState             what "delivered" means for it
 *   probeId, probeClass     what will be asked
 *   probeDefinitionSha256   what the probe actually checks
 *   publicEntrypoint        the door the probe must use
 *   the policy flags        whether it may be proved internally, whether it
 *                           must be re-proved after merge, its time bound
 *
 * Change any of those and the claim has changed, so the digest must change. A
 * grant that pinned the old digest must stop matching — that is the whole
 * mechanism.
 *
 * What is OUT: title and rationale. They are for the reader of the panel. If
 * editing a sentence invalidated a ratified grant, nobody would ever improve
 * one.
 *
 * @param {object} input
 * @returns {object} the canonical contract, key order irrelevant to the digest
 */
const DELIVERY_CONTRACT_FIELDS = [
  'schemaVersion',
  'capabilityId',
  'deliveryClass',
  'targetState',
  'probeId',
  'probeClass',
  'probeDefinitionSha256',
  'publicEntrypoint',
  'publicEntrypointOnly',
  'nonDestructivePulse',
  'postMergeRequired',
  'timeoutMs',
  'evidencePolicy',
];

/** Fields a contract may carry for humans, which never reach the digest. */
const DELIVERY_CONTRACT_PRESENTATION_FIELDS = ['title', 'rationale'];

const DELIVERY_TARGET_STATES = ['OPERABLE', 'ENFORCED', 'ROUTABLE', 'WIRED_DISABLED', 'NOT_APPLICABLE'];
const DELIVERY_PROBE_CLASSES = ['PROBE_DRY', 'PROBE_SEALED', 'PROBE_CERTIFY'];

/**
 * What a piece of evidence must satisfy before it may say PASS.
 *
 * Six booleans rather than a policy NAME, because a name is a promise nobody
 * can check. "MERGE_SHA_BOUND" reads like a guarantee and enforces nothing; the
 * verdict function has to be able to ask "is a merge SHA required here?" and
 * get an answer from the contract itself. Written into the contract — and
 * therefore into its digest — so relaxing any of them changes the claim and
 * breaks the grant that pinned it.
 *
 * Presets exist for ergonomics only. They expand to exactly these fields, and
 * the expanded form is what is hashed.
 */
const DELIVERY_EVIDENCE_POLICY_FIELDS = [
  'mergeShaRequired',
  'cleanTreeRequired',
  'probeDigestRequired',
  'commandDigestRequired',
  'contractDigestRequired',
  'publicEntrypointRequired',
];

const DELIVERY_EVIDENCE_POLICY_PRESETS = {
  // The default for anything with a runtime effect: evidence means nothing
  // unless it is bound to the commit that was actually merged.
  MERGE_SHA_BOUND: {
    mergeShaRequired: true,
    cleanTreeRequired: true,
    probeDigestRequired: true,
    commandDigestRequired: true,
    contractDigestRequired: true,
    publicEntrypointRequired: true,
  },
  // Pre-merge verification on a branch. Everything else still holds; only the
  // merge-SHA binding is deferred, and a capability that stops here can never
  // satisfy DONE.
  BRANCH_HEAD_ONLY: {
    mergeShaRequired: false,
    cleanTreeRequired: true,
    probeDigestRequired: true,
    commandDigestRequired: true,
    contractDigestRequired: true,
    publicEntrypointRequired: true,
  },
  // Genuinely non-runtime work. Nothing is probed, so nothing is required —
  // and §13's diff classifier, not the author, decides whether this is allowed.
  NOT_APPLICABLE: {
    mergeShaRequired: false,
    cleanTreeRequired: false,
    probeDigestRequired: false,
    commandDigestRequired: false,
    contractDigestRequired: false,
    publicEntrypointRequired: false,
  },
};

const DELIVERY_EVIDENCE_POLICIES = Object.keys(DELIVERY_EVIDENCE_POLICY_PRESETS);

/**
 * Expand a policy to its canonical field form.
 *
 * Accepts a preset name for readability or an explicit object for a capability
 * whose requirements are genuinely its own. Either way the canonical result is
 * the object, so two contracts requiring the same things hash the same however
 * they were written.
 */
function normalizeEvidencePolicy(input, targetState) {
  let src = input;
  if (src === undefined) src = targetState === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'MERGE_SHA_BOUND';
  if (typeof src === 'string') {
    const preset = DELIVERY_EVIDENCE_POLICY_PRESETS[src];
    if (!preset) fail('DELIVERY_CONTRACT_EVIDENCE_POLICY_INVALID', src);
    src = preset;
  }
  if (!src || typeof src !== 'object' || Array.isArray(src)) {
    fail('DELIVERY_CONTRACT_EVIDENCE_POLICY_INVALID', String(input));
  }
  for (const k of Object.keys(src)) {
    if (DELIVERY_EVIDENCE_POLICY_FIELDS.indexOf(k) === -1) {
      fail('DELIVERY_CONTRACT_EVIDENCE_POLICY_FIELD_UNKNOWN', k);
    }
  }
  const out = {};
  for (const k of DELIVERY_EVIDENCE_POLICY_FIELDS) {
    if (typeof src[k] !== 'boolean') fail('DELIVERY_CONTRACT_EVIDENCE_POLICY_INVALID', k);
    out[k] = src[k];
  }
  // A capability that is probed at all must be probed through its public
  // entrypoint. Allowing otherwise would reintroduce, as a per-capability
  // option, exactly the internal-call proof this package exists to outlaw.
  if (out.probeDigestRequired && !out.publicEntrypointRequired) {
    fail('DELIVERY_CONTRACT_EVIDENCE_POLICY_INVALID', 'a probed capability must require its public entrypoint');
  }
  return out;
}

function normalizeDeliveryContract(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('DELIVERY_CONTRACT_INVALID', 'not an object');
  }
  // Unknown fields are refused rather than dropped. Dropping them would let a
  // contract carry a term the digest does not cover, which is the same failure
  // as not hashing it at all — except quieter.
  for (const k of Object.keys(input)) {
    if (DELIVERY_CONTRACT_FIELDS.indexOf(k) === -1 && DELIVERY_CONTRACT_PRESENTATION_FIELDS.indexOf(k) === -1) {
      fail('DELIVERY_CONTRACT_FIELD_UNKNOWN', k);
    }
  }

  const out = {
    // Defaulted deterministically: an absent version is v2, never "whatever the
    // reader assumes". A v1 contract does not exist — v1 tasks carry no
    // contract at all, which is what LEGACY_UNVERIFIED means.
    schemaVersion: input.schemaVersion === undefined ? 2 : input.schemaVersion,
    capabilityId: input.capabilityId,
    deliveryClass: input.deliveryClass,
    targetState: input.targetState,
    probeId: input.probeId,
    probeClass: input.probeClass,
    probeDefinitionSha256: input.probeDefinitionSha256,
    publicEntrypoint: input.publicEntrypoint,
    publicEntrypointOnly: input.publicEntrypointOnly === undefined ? true : input.publicEntrypointOnly,
    nonDestructivePulse: input.nonDestructivePulse === undefined ? false : input.nonDestructivePulse,
    postMergeRequired: input.postMergeRequired === undefined ? true : input.postMergeRequired,
    timeoutMs: input.timeoutMs,
    // Expanded to its six fields here, not kept as a name: a policy name is a
    // promise nobody can check, and the verdict function must be able to ask
    // what is required rather than infer it from a label.
    evidencePolicy: normalizeEvidencePolicy(input.evidencePolicy, input.targetState),
  };

  if (out.schemaVersion !== 2) fail('DELIVERY_CONTRACT_SCHEMA_VERSION', String(out.schemaVersion));
  if (typeof out.capabilityId !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(out.capabilityId)) {
    fail('DELIVERY_CONTRACT_CAPABILITY_ID_INVALID', String(out.capabilityId));
  }
  if (typeof out.deliveryClass !== 'string' || !out.deliveryClass) {
    fail('DELIVERY_CONTRACT_DELIVERY_CLASS_INVALID', String(out.deliveryClass));
  }
  if (DELIVERY_TARGET_STATES.indexOf(out.targetState) === -1) {
    fail('DELIVERY_CONTRACT_TARGET_STATE_INVALID', String(out.targetState));
  }
  if (typeof out.probeId !== 'string' || !out.probeId) {
    fail('DELIVERY_CONTRACT_PROBE_ID_INVALID', String(out.probeId));
  }
  if (DELIVERY_PROBE_CLASSES.indexOf(out.probeClass) === -1) {
    fail('DELIVERY_CONTRACT_PROBE_CLASS_INVALID', String(out.probeClass));
  }
  // The probe's own identity is part of the contract's identity. Without it a
  // contract could keep its digest while the check behind it was rewritten,
  // and "the verifier was not weakened between the red run and the green one"
  // would stop being provable.
  if (!/^[0-9a-f]{64}$/.test(String(out.probeDefinitionSha256))) {
    fail('DELIVERY_CONTRACT_PROBE_DIGEST_INVALID', String(out.probeDefinitionSha256));
  }
  if (typeof out.publicEntrypoint !== 'string' || !out.publicEntrypoint) {
    fail('DELIVERY_CONTRACT_PUBLIC_ENTRYPOINT_MISSING', String(out.capabilityId));
  }
  for (const flag of ['publicEntrypointOnly', 'nonDestructivePulse', 'postMergeRequired']) {
    if (typeof out[flag] !== 'boolean') fail('DELIVERY_CONTRACT_FLAG_INVALID', flag);
  }
  // A contract that permits proof by internal call is not a delivery contract.
  // It is a field rather than an assumption so that relaxing it has to be
  // written down and reviewed.
  if (out.publicEntrypointOnly !== true) {
    fail('DELIVERY_CONTRACT_PUBLIC_ENTRYPOINT_ONLY_REQUIRED', out.capabilityId);
  }
  if (!Number.isInteger(out.timeoutMs) || out.timeoutMs < 1000 || out.timeoutMs > 900000) {
    fail('DELIVERY_CONTRACT_TIMEOUT_INVALID', String(out.timeoutMs));
  }
  // A NOT_APPLICABLE capability probes nothing, so requiring probe evidence
  // from it would be unsatisfiable by construction — and a contract that cannot
  // be satisfied is a contract nobody will honour.
  if (out.targetState === 'NOT_APPLICABLE' && out.evidencePolicy.probeDigestRequired) {
    fail('DELIVERY_CONTRACT_NOT_APPLICABLE_POLICY_MISMATCH', out.capabilityId);
  }
  if (out.targetState !== 'NOT_APPLICABLE' && !out.evidencePolicy.probeDigestRequired) {
    fail('DELIVERY_CONTRACT_EVIDENCE_POLICY_INVALID', out.capabilityId + ' must require probe evidence');
  }
  if (out.postMergeRequired && !out.evidencePolicy.mergeShaRequired) {
    // postMergeRequired without mergeShaRequired says "verify after merge" and
    // then accepts evidence not bound to the merge — the two halves of the same
    // claim, disagreeing.
    fail('DELIVERY_CONTRACT_EVIDENCE_POLICY_INVALID', out.capabilityId + ' requires post-merge proof but not a merge sha');
  }
  return out;
}

/** SHA-256 of the canonical delivery contract. One implementation, everywhere. */
function deliveryContractDigest(input) {
  return digest(normalizeDeliveryContract(input));
}

module.exports = {
  PROFILES,
  BASE_DRIFT_POLICIES,
  SUCCESSOR_DISPOSITIONS,
  MECHANICAL_OPERATIONS,
  TASK_CLASSES,
  DELIVERY_CONTRACT_FIELDS,
  DELIVERY_CONTRACT_PRESENTATION_FIELDS,
  DELIVERY_TARGET_STATES,
  DELIVERY_PROBE_CLASSES,
  DELIVERY_EVIDENCE_POLICIES,
  DELIVERY_EVIDENCE_POLICY_FIELDS,
  DELIVERY_EVIDENCE_POLICY_PRESETS,
  normalizeEvidencePolicy,
  AuthorityError,
  canonicalize,
  digest,
  normalizeDeliveryContract,
  deliveryContractDigest,
  canonicalPathList,
  canonicalRequiredTests,
  normalizeTaskSpec,
  specDigests,
  validateAgainstGrant,
  validateAgainstStandingGrant,
  verifyRatificationEvidence,
  verifyAuthorityRefs,
  isGrantRevoked,
};
