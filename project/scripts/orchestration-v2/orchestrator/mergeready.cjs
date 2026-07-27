'use strict';
/**
 * GOV-COORD-V2 orchestration — MERGE_READY attestation.
 *
 * Contract: coordination-v2/governance-orchestration-contract-v2.md §5, §5.1
 *
 * MERGE_READY is not a durable status. It is a revocable, SHA-bound attestation
 * that expires, and it is produced only when every condition in the §5
 * conjunction holds. Any drift in PR head, target branch, merge base, CI
 * result, review state, mergeability, lease identity, grant validity or task
 * spec digest invalidates it immediately.
 *
 * The orchestrator never merges. It produces an attestation the owner can act
 * on, and re-verifies it immediately before the owner merges.
 */

const { digest } = require('./authority.cjs');

/** The §5 conjunction, in contract order. All must be true. */
const CONJUNCTION_KEYS = [
  'executorExitSuccess',
  'currentLeaseEpochConfirmed',
  'holderTokenConfirmed',
  'taskSpecHashMatchesGrant',
  'actualDiffWithinBoundary',
  'immutableForbiddenPathsUntouched',
  'requiredInvariantsPass',
  'requiredTestsPass',
  'requiredCiChecksPass',
  'prOpen',
  'prMergeable',
  'noBlockingReview',
  'noCompetingWriter',
  'baseDriftPolicySatisfied',
  'worktreeStateValid',
];

const DEFAULT_TTL_MS = 15 * 60 * 1000;

class MergeReadyError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'MergeReadyError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new MergeReadyError(code, detail);
}

/**
 * Effective required CI set (§5.1): the union of the task spec's own required
 * checks, the platform/branch-protection required checks and the
 * governance-required checks — all read at evaluation time, never pinned.
 *
 * Observed on this repository: the check set is not stable between runs (three
 * CodeQL checks appeared on a later push), which is precisely why this is a
 * runtime query.
 */
function effectiveRequiredCiChecks(sources) {
  const fromSpec = (sources.taskSpecRequired || []).map(String);
  const fromPlatform = (sources.platformRequired || []).map(String);
  const fromGovernance = (sources.governanceRequired || []).map(String);
  const set = new Set(fromSpec.concat(fromPlatform).concat(fromGovernance));
  return Array.from(set).sort();
}

/**
 * Evaluate the observed CI results against the effective required set.
 * A check that is required but absent, pending or non-SUCCESS fails closed.
 */
function evaluateCi(opts) {
  const required = effectiveRequiredCiChecks(opts.sources || {});
  const observed = {};
  for (const c of opts.observed || []) observed[String(c.name)] = c;

  const missing = [];
  const notSuccess = [];
  // A check that has not finished is not a check that failed. Both keep `pass`
  // false — nothing is merge-ready while CI is still deciding — but the caller
  // has to tell them apart, because one is worth waiting for and the other
  // never will be. Without the split the orchestrator observed CI once, seconds
  // after opening the PR, and reported REQUIRED_CI_FAILED for checks that were
  // still running.
  const pending = [];
  for (const name of required) {
    const c = observed[name];
    if (!c) {
      missing.push(name);
      continue;
    }
    if (c.status !== 'COMPLETED') {
      pending.push(name + '=' + (c.status || 'PENDING'));
      notSuccess.push(name + '=' + (c.conclusion || c.status));
      continue;
    }
    if (c.conclusion !== 'SUCCESS') {
      notSuccess.push(name + '=' + (c.conclusion || c.status));
    }
  }
  const pass = missing.length === 0 && notSuccess.length === 0;
  return {
    pass,
    required,
    missing,
    notSuccess,
    pending,
    // Two different kinds of "not yet", and collapsing either into the other is
    // wrong — both mistakes have now been made in turn.
    //
    // A check that EXISTS and is running is worth waiting a long time for.
    //
    // A check that is ABSENT from the observed set is usually a required check
    // that will never appear — the fail-closed case PILOT 10b pins. But for the
    // first moments after a push it is simply GitHub not having registered the
    // run yet, which is what actually happened to the OFFICE lane: the
    // orchestrator observed seconds after pushing, found nothing registered,
    // and failed closed on checks that appeared shortly afterwards and passed.
    //
    // So they are reported separately and the caller gives absence a short
    // grace instead of the full wait.
    settling: pending.length > 0,
    settlingMissing: missing.length > 0,
    failed: notSuccess.filter((n) => pending.indexOf(n) === -1),
    resultSetSha256: digest(
      required.map((n) => ({
        name: n,
        status: observed[n] ? observed[n].status : null,
        conclusion: observed[n] ? observed[n].conclusion : null,
      })),
    ),
  };
}

/**
 * Build a MERGE_READY attestation, or report exactly which conditions failed.
 * Never throws for a failing conjunction — a caller must be able to record the
 * BLOCKED reason.
 */
function buildAttestation(opts) {
  const c = opts.conjunction || {};
  const failed = CONJUNCTION_KEYS.filter((k) => c[k] !== true);
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  const ttl = opts.ttlMs != null ? opts.ttlMs : DEFAULT_TTL_MS;

  if (failed.length) {
    return { ok: false, failedConditions: failed, attestation: null };
  }

  for (const f of ['prHeadSha', 'targetBranchObservedSha', 'mergeBaseSha']) {
    if (!/^[0-9a-f]{40}$/.test(String(opts[f]))) fail('SHA_INVALID', f + '=' + String(opts[f]));
  }
  if (!Number.isInteger(opts.prNumber) || opts.prNumber < 1) fail('PR_NUMBER_INVALID', String(opts.prNumber));

  const attestation = {
    schemaVersion: 1,
    taskId: opts.taskId,
    taskAttemptId: opts.taskAttemptId,
    taskSpecSha256: opts.taskSpecSha256,
    grantId: opts.grantId,
    grantSha256: opts.grantSha256,
    leaseEpoch: opts.leaseEpoch,
    holderToken: opts.holderToken,
    prNumber: opts.prNumber,
    prHeadSha: opts.prHeadSha,
    targetBranch: opts.targetBranch,
    targetBranchObservedSha: opts.targetBranchObservedSha,
    mergeBaseSha: opts.mergeBaseSha,
    requiredCiResultSetSha256: opts.requiredCiResultSetSha256,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttl).toISOString(),
    conjunction: CONJUNCTION_KEYS.reduce((acc, k) => {
      acc[k] = true;
      return acc;
    }, {}),
  };
  return { ok: true, failedConditions: [], attestation };
}

/**
 * Merge-time fresh revalidation (§5). Compares the attestation against freshly
 * observed reality and returns every reason it is no longer valid.
 *
 * This is the gate the owner's merge depends on; it does not merge anything.
 */
function revalidate(opts) {
  const a = opts.attestation;
  if (!a) fail('ATTESTATION_MISSING', 'nothing to revalidate');
  const obs = opts.observed || {};
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  const reasons = [];

  if (Date.parse(a.expiresAt) <= nowMs) reasons.push('ATTESTATION_EXPIRED');
  if (obs.prHeadSha !== undefined && obs.prHeadSha !== a.prHeadSha) reasons.push('PR_HEAD_DRIFT');
  if (obs.targetBranchObservedSha !== undefined && obs.targetBranchObservedSha !== a.targetBranchObservedSha) {
    reasons.push('TARGET_BRANCH_DRIFT');
  }
  if (obs.mergeBaseSha !== undefined && obs.mergeBaseSha !== a.mergeBaseSha) reasons.push('MERGE_BASE_DRIFT');
  if (obs.leaseEpoch !== undefined && obs.leaseEpoch !== a.leaseEpoch) reasons.push('LEASE_EPOCH_DRIFT');
  if (obs.holderToken !== undefined && obs.holderToken !== a.holderToken) reasons.push('HOLDER_TOKEN_DRIFT');
  if (obs.taskSpecSha256 !== undefined && obs.taskSpecSha256 !== a.taskSpecSha256) {
    reasons.push('TASK_SPEC_HASH_DRIFT');
  }
  if (obs.grantRevoked === true) reasons.push('GRANT_REVOKED');
  if (obs.grantExpired === true) reasons.push('GRANT_EXPIRED');
  if (obs.prOpen === false) reasons.push('PR_NOT_OPEN');
  if (obs.prMergeable === false) reasons.push('PR_NOT_MERGEABLE');
  if (obs.blockingReview === true) reasons.push('BLOCKING_REVIEW');
  if (obs.competingWriter === true) reasons.push('COMPETING_WRITER');
  if (obs.requiredCiResultSetSha256 !== undefined && obs.requiredCiResultSetSha256 !== a.requiredCiResultSetSha256) {
    reasons.push('CI_RESULT_SET_DRIFT');
  }

  return { valid: reasons.length === 0, reasons, revalidatedAt: new Date(nowMs).toISOString() };
}

/**
 * A merge observed without a fresh, valid attestation cannot be recorded as a
 * clean closure (§5).
 */
function classifyExternalMerge(opts) {
  const r = revalidate(opts);
  if (r.valid) return { disposition: 'MERGED', revalidation: r };
  return {
    disposition: 'UNVERIFIED_EXTERNAL_MERGE_OWNER_REVIEW_REQUIRED',
    revalidation: r,
  };
}

module.exports = {
  CONJUNCTION_KEYS,
  DEFAULT_TTL_MS,
  MergeReadyError,
  effectiveRequiredCiChecks,
  evaluateCi,
  buildAttestation,
  revalidate,
  classifyExternalMerge,
};
