'use strict';
/**
 * ORCHESTRA-ELIGIBLE-RESUME-RECOVERY-R01 — picking up a task left at ELIGIBLE.
 *
 * ELIGIBLE means something specific: the orchestrator has validated the grant,
 * the four pinned digests, the revocation marker and the predecessor/boundary
 * eligibility, and the task is ready to be CLAIMED under a lease. It is written
 * by exactly two transitions — AUTHORIZED -> ELIGIBLE on the normal path, and
 * BLOCKED -> ELIGIBLE on an owner-authorized resume — and its only legal
 * successor is CLAIMED.
 *
 * Nothing could start from it. runTask handled two openings, "no record" and
 * BLOCKED, and anything else fell through to a write that expected AUTHORIZED:
 *
 *   STATE_CAS_MISMATCH: expected DECLARED but store holds ELIGIBLE
 *
 * So a process that died between writing ELIGIBLE and taking the lease left the
 * task permanently unrunnable. That is not a rare window — it is every crash,
 * every timeout and every killed terminal in the seconds around the claim.
 *
 * The fix is NOT to rewind ELIGIBLE to DECLARED or QUEUED. That would discard a
 * validation that really happened and re-derive it from a world that may have
 * moved. ELIGIBLE is re-entered where it left off: re-verify, then claim.
 *
 * Re-verify is the whole point. This module answers one question — may this
 * ELIGIBLE record be claimed again, right now? — and it answers it from the
 * present state of eleven things rather than from the fact that they were once
 * true.
 */

/** Every reason a resume can be refused. A refusal not on this list is a bug. */
const REFUSALS = [
  'NOT_ELIGIBLE',
  'KILL_SWITCH_ENGAGED',
  'STANDING_GRANT_REVOKED',
  'PROGRAM_NOT_ELIGIBLE',
  'PARENT_AUTHORIZATION_MISMATCH',
  'TASK_IDENTITY_MISMATCH',
  'PLAN_HASH_MISMATCH',
  'EXECUTOR_LANE_CHANGED',
  'LIVE_EXECUTOR_HOLDS_LEASE',
  'LIVE_EXECUTOR_PROCESS',
  'STORE_DISAGREEMENT',
];

class EligibleResumeError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'EligibleResumeError';
    this.code = code;
    this.detail = detail || null;
  }
}

/** Is a process still alive? Signal 0 asks without touching it. */
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means it exists and belongs to someone else — still alive.
    return e && e.code === 'EPERM';
  }
}

function leaseIsLive(leaseRecord, nowMs) {
  if (!leaseRecord || leaseRecord.state !== 'HELD') return false;
  const expires = Date.parse(leaseRecord.expiresAt || '');
  if (!Number.isFinite(expires)) return true; // unparseable expiry is not permission
  return expires > nowMs;
}

/**
 * May this ELIGIBLE task be claimed again?
 *
 * Pure apart from the liveness probe. Ordered so the most overriding answer
 * wins: a kill switch beats a revocation beats an identity mismatch, and the
 * two "someone is already running this" checks come last because they are the
 * ones a caller most needs to see when everything else was fine.
 *
 * @param {object} o
 * @param {object} o.taskRecord            the task store's current record
 * @param {object|null} [o.leaseRecord]    the lease, if any
 * @param {object|null} [o.queueEntry]     the queue entry for this task
 * @param {boolean} [o.killSwitchEngaged]
 * @param {boolean} [o.grantRevoked]
 * @param {boolean} [o.programEligible]    from the DERIVED manifest, read now
 * @param {string} [o.parentAuthorizationId]        what the grant claims
 * @param {string} [o.expectedParentAuthorizationId] what the entry was admitted under
 * @param {string} [o.taskId]
 * @param {string} [o.expectedTaskSpecSha256]  pinned at admission
 * @param {string} [o.actualTaskSpecSha256]    recomputed now
 * @param {string} [o.expectedLane]            recorded on the entry
 * @param {string} [o.actualLane]              about to be used
 * @param {function} [o.isAlive]           injection point for tests
 * @param {number} [o.nowMs]
 * @returns {{resumable, refusal, reason, from, previousAttemptId}}
 */
function assessResume(o) {
  const now = (o && o.nowMs) || Date.now();
  const isAlive = (o && o.isAlive) || pidAlive;
  const task = (o && o.taskRecord) || null;
  const entry = (o && o.queueEntry) || null;

  const say = (refusal, reason) => ({
    resumable: refusal === null,
    refusal,
    reason,
    from: task ? task.state : null,
    previousAttemptId: (task && task.taskAttemptId) || null,
  });

  if (!task || task.state !== 'ELIGIBLE') {
    return say('NOT_ELIGIBLE', 'this path is only for a task left at ELIGIBLE');
  }

  if (o.killSwitchEngaged === true) return say('KILL_SWITCH_ENGAGED', 'the kill switch is engaged');
  if (o.grantRevoked === true) return say('STANDING_GRANT_REVOKED', 'the standing grant has been revoked');
  if (o.programEligible === false) return say('PROGRAM_NOT_ELIGIBLE', 'the program is no longer ELIGIBLE in the derived manifest');

  if (o.expectedParentAuthorizationId && o.parentAuthorizationId !== o.expectedParentAuthorizationId) {
    return say('PARENT_AUTHORIZATION_MISMATCH', o.expectedParentAuthorizationId + ' -> ' + o.parentAuthorizationId);
  }
  if (o.taskId && entry && entry.taskId && entry.taskId !== o.taskId) {
    return say('TASK_IDENTITY_MISMATCH', o.taskId + ' != ' + entry.taskId);
  }
  if (o.expectedTaskSpecSha256 && o.actualTaskSpecSha256 && o.expectedTaskSpecSha256 !== o.actualTaskSpecSha256) {
    return say('PLAN_HASH_MISMATCH', o.expectedTaskSpecSha256.slice(0, 12) + ' -> ' + o.actualTaskSpecSha256.slice(0, 12));
  }
  // The lane is part of what was authorized. Resuming an OFFICE task on a
  // different executor is a different run, not a continuation.
  if (o.expectedLane && o.actualLane && o.expectedLane !== o.actualLane) {
    return say('EXECUTOR_LANE_CHANGED', o.expectedLane + ' -> ' + o.actualLane);
  }

  // The two stores must not disagree about whether this task is finished.
  if (entry && ['CLOSED', 'FAILED', 'CANCELLED'].indexOf(entry.state) !== -1) {
    return say('STORE_DISAGREEMENT', 'queue says ' + entry.state + ' while the task store says ELIGIBLE');
  }

  // Someone is already running this. Two independent signals, because either
  // one alone can be stale in a direction that starts a second executor.
  if (leaseIsLive(o.leaseRecord, now)) {
    return say('LIVE_EXECUTOR_HOLDS_LEASE', 'lease held by ' + (o.leaseRecord.holder || 'unknown') + ' until ' + o.leaseRecord.expiresAt);
  }
  // Liveness beats staleness, exactly as in recovery.cjs: a silent process is
  // not a dead one, and a lease TTL that lapsed while the process kept working
  // must not become permission to start a second.
  const ownerPid = entry && entry.owner && entry.owner.pid;
  if (isAlive(ownerPid)) {
    return say('LIVE_EXECUTOR_PROCESS', 'pid ' + ownerPid + ' is still alive; a lapsed lease is not permission to replace it');
  }

  return say(null, 'validated at ELIGIBLE and no executor holds it');
}

/**
 * The payload that records the resume.
 *
 * Requirement, not decoration: the log must show which state was resumed from,
 * on what authority, and under which NEW attempt — a resume that reuses the old
 * attempt id is indistinguishable from the attempt that died.
 */
function resumeEvidence(o) {
  return {
    resumedFromState: 'ELIGIBLE',
    resumedReason: o.reason || 'interrupted before the lease was taken',
    previousAttemptId: o.previousAttemptId || null,
    attemptId: o.attemptId,
    resumeAuthorizedBy: o.parentAuthorizationId || null,
    revalidatedAtMs: o.nowMs || Date.now(),
  };
}

module.exports = {
  REFUSALS,
  EligibleResumeError,
  pidAlive,
  leaseIsLive,
  assessResume,
  resumeEvidence,
};
