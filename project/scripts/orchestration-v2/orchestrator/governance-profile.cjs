'use strict';
/**
 * MECHANICAL_GOVERNANCE — the restricted profile, ported rather than invented.
 *
 * Contract §1.2 declared this profile and then proved it unusable: its real
 * targets (decision-log.md, active-roadmap.md, the registers, the ADRs) all sit
 * inside `project/docs/governance/**`, which §1 makes immutably forbidden with
 * no task-level override. The profile was declared and could not, by
 * definition, do the job it was declared for.
 *
 * §1.2 also says how to close it, and rules out every other shape:
 *
 *   "Kanonik olarak tutarlı tek aday, V1'in yukarıdaki ratifiye mekanizmasını
 *    V2'ye taşımaktır; başka her şekil yeni authority modeli üretir ve §15'in
 *    'yeni authority modeli ÜRETMEZ' hükmünü ihlal eder."
 *
 * So this module invents nothing. Both halves are lifted from V1's already
 * ratified governance-writer-coordination-protected-paths.json:
 *
 *   level2Operations   the only four ways a governance file may be written
 *   queueExceptions    the only two paths that may be written at all
 *
 * The consequence is the point, not a limitation to work around: a governance
 * task under this profile does NOT edit decision-log.md. It writes a request or
 * a result artefact, and the ratified V1 flow — or the owner — applies it. The
 * orchestrator gains the ability to prepare governance work mechanically
 * without gaining the ability to author governance.
 *
 * Opening the profile at all is an owner policy decision, which §1.2 said was
 * required and which the activation envelope supplies. This module enforces the
 * decision; it does not make it.
 */

/**
 * The four operations, verbatim from V1. Anything that is not one of these is
 * FREE_FORM_GOVERNANCE_EDIT, which V1 already denies.
 */
const LEVEL2_OPERATIONS = [
  'EXACT_APPEND_AT_DECLARED_ANCHOR',
  'EXACT_LITERAL_REPLACEMENT',
  'EXACT_REFERENCE_REWRITE',
  'DETERMINISTIC_REGISTER_REGENERATION',
];

/**
 * The reachable surface, verbatim from V1's queueExceptions. Two path shapes,
 * both under a per-request directory, and nothing else in the entire governance
 * tree.
 */
const QUEUE_EXCEPTION_PATTERNS = [
  { prefix: 'project/docs/governance/coordination-requests/', file: 'request.md' },
  { prefix: 'project/docs/governance/coordination-results/', file: 'result.md' },
];

/**
 * Capabilities V1 denies. Carried across unchanged — a profile that gains a
 * capability in translation is a new authority model, which is the thing §15
 * forbids.
 *
 * AUTO_MERGE is on this list, and it stays on it. The activation envelope
 * authorizes auto-merge for orchestration-owned PRs under the envelope or under
 * the OFFICE/COLLECTION standing grants; a MECHANICAL_GOVERNANCE task is
 * neither, so its grant must set autoMergeAuthorized false and its PRs are
 * merged by a human.
 */
const DENIED_CAPABILITIES = [
  'AUTO_MERGE',
  'RECONCILIATION',
  'POLICY_CHANGE',
  'PROGRAM_SEQUENCE_CHANGE',
  'PRODUCTION_SCHEMA_MIGRATION_RUNTIME',
  'OWNER_WIP_MUTATION',
  'FAILOVER_WITHOUT_OWNER_ACTIVATION',
  'FREE_FORM_GOVERNANCE_EDIT',
];

/**
 * Surfaces the activation envelope forbids this profile from touching, quoted
 * from the envelope's own list. These are checked in ADDITION to the queue
 * exception rule, so a path that somehow satisfied the exception pattern while
 * naming one of these would still be refused.
 */
const ENVELOPE_PROHIBITED_SURFACES = [
  'project/scripts/orchestration-v2/',
  'project/docs/governance/coordination-v2/schemas/',
  'project/docs/governance/coordination-v2/activation/',
  'project/docs/governance/governance-writer-coordination-protected-paths.json',
  '.github/',
];

class GovernanceProfileError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'GovernanceProfileError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new GovernanceProfileError(code, detail);
}

/**
 * Does a path sit on the reachable surface?
 *
 * Requires the full `<prefix><requestId>/<file>` shape, not merely the prefix.
 * A prefix test would admit `coordination-requests/anything.md`, and the whole
 * value of the exception is that it is one named file inside one per-request
 * directory.
 */
function isQueueExceptionPath(p) {
  const s = String(p);
  for (const pat of QUEUE_EXCEPTION_PATTERNS) {
    if (s.indexOf(pat.prefix) !== 0) continue;
    const rest = s.slice(pat.prefix.length);
    const parts = rest.split('/');
    if (parts.length !== 2) continue;
    if (!parts[0]) continue;
    // A request id that walks upward is not a request id.
    if (parts[0] === '.' || parts[0] === '..' || parts[0].indexOf('\\') !== -1) continue;
    if (parts[1] !== pat.file) continue;
    return true;
  }
  return false;
}

/**
 * Validate one MECHANICAL_GOVERNANCE task before it runs.
 *
 * Deterministic and total, like validateAgainstStandingGrant: reads only its
 * arguments, performs no I/O, returns the same verdict for the same inputs.
 *
 * @param {object} opts
 * @param {object} opts.standingGrant   the MECHANICAL_GOVERNANCE grant
 * @param {object} opts.spec            the child plan
 * @param {string} opts.operation       one of LEVEL2_OPERATIONS
 * @param {string[]} [opts.targetPaths] exact files the task declares it writes
 */
function validateGovernanceTask(opts) {
  const g = opts && opts.standingGrant;
  const spec = opts && opts.spec;
  if (!g || typeof g !== 'object') fail('GOVERNANCE_GRANT_MISSING');
  if (!spec || typeof spec !== 'object') fail('GOVERNANCE_SPEC_MISSING');

  if (g.profile !== 'MECHANICAL_GOVERNANCE') fail('GOVERNANCE_PROFILE_MISMATCH', String(g.profile));

  // The envelope opened this profile; a grant that cannot point at that
  // decision is self-authorizing.
  const ref = g.parentAuthorizationRef || {};
  if (!ref.authorizationId || !/^[0-9a-f]{64}$/.test(String(ref.payloadSha256 || ''))) {
    fail('GOVERNANCE_PARENT_REF_INVALID', ref.authorizationId || '(none)');
  }

  // Auto-merge stays denied. Not a default that a grant may override — V1
  // denies the capability, and translation must not grant it.
  if (g.mergePolicy && g.mergePolicy.autoMergeAuthorized === true) {
    fail('GOVERNANCE_AUTO_MERGE_FORBIDDEN', g.standingGrantId || 'grant');
  }
  for (const cap of DENIED_CAPABILITIES) {
    if ((g.deniedCapabilities || []).indexOf(cap) === -1) {
      fail('GOVERNANCE_DENIED_CAPABILITY_MISSING', cap);
    }
  }

  const op = opts.operation;
  if (LEVEL2_OPERATIONS.indexOf(op) === -1) {
    // Everything that is not one of the four IS free-form editing, which is
    // the capability V1 denies by name.
    fail('GOVERNANCE_OPERATION_NOT_LEVEL2', String(op || '(none)'));
  }

  const declared = opts.targetPaths || (spec.boundaryPolicy && spec.boundaryPolicy.allowedRoots) || [];
  if (!declared.length) fail('GOVERNANCE_TARGETS_UNDECLARED', spec.taskId || '(unknown task)');

  for (const p of declared) {
    for (const forbidden of ENVELOPE_PROHIBITED_SURFACES) {
      if (String(p).indexOf(forbidden) === 0) fail('GOVERNANCE_TOUCHES_PROHIBITED_SURFACE', p);
    }
    if (!isQueueExceptionPath(p)) {
      // The honest message: this is not a narrower allowlist that happens to
      // exclude decision-log.md. Canonical governance is unreachable from this
      // profile, and a task that wants it must go through the V1 flow.
      fail('GOVERNANCE_TARGET_OFF_QUEUE_SURFACE', p);
    }
  }

  return {
    ok: true,
    profile: 'MECHANICAL_GOVERNANCE',
    operation: op,
    targets: declared.slice(),
    autoMerge: false,
    appliesVia: 'V1 governance-writer-coordination flow',
  };
}

module.exports = {
  LEVEL2_OPERATIONS,
  QUEUE_EXCEPTION_PATTERNS,
  DENIED_CAPABILITIES,
  ENVELOPE_PROHIBITED_SURFACES,
  GovernanceProfileError,
  isQueueExceptionPath,
  validateGovernanceTask,
};
