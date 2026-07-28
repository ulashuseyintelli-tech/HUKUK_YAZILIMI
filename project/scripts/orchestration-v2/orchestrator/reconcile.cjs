'use strict';
/**
 * STATE-STORE-RECONCILIATION-R01 — one deterministic effective state.
 *
 * There are two stores, and there have to be. The task store records what an
 * ATTEMPT did, keyed by taskId, with a lease and a writer identity per state.
 * The queue records what WORK is outstanding, keyed by an idempotency key, and
 * a single task can legitimately have several queue entries over its life
 * (a plan is corrected, a new identity is admitted).
 *
 * What is NOT legitimate is the two disagreeing without anyone noticing. The
 * canary found this the hard way: its queue entry was resumed to QUEUED while
 * the task store still said BLOCKED, and the only thing that stopped a second
 * executor was a guard deeper in runTask firing by luck of ordering. That is a
 * guarantee resting on an accident.
 *
 *   QUEUE STATE + TASK EXECUTION STATE = ONE DETERMINISTIC EFFECTIVE STATE
 *
 * This module computes that state, and refuses to produce a runnable verdict
 * whenever the two stores cannot be reconciled. Nothing here guesses: every
 * disagreement has a named verdict, and the ones that need a human say so.
 *
 * ATOMICITY. Two append-only JSONL files on one filesystem cannot be written in
 * one transaction. Rather than pretend, this module uses a write-ahead intent:
 * the exact target of BOTH writes is recorded before either happens, so a crash
 * between them leaves enough on disk to roll forward deterministically. An
 * intent without a commit is not ambiguity — it is an instruction.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Task-store states from which an executor may still be spawned. */
const TASK_LIVE_BEFORE_EXECUTION = ['DECLARED', 'AUTHORIZED', 'ELIGIBLE'];

/** Task-store states that mean an attempt is already under way. */
const TASK_IN_FLIGHT = ['CLAIMED', 'WORKTREE_READY', 'EXECUTOR_RUNNING', 'VALIDATING', 'PR_OPEN', 'CI_PENDING', 'MERGE_READY', 'MERGED'];

/** Verdicts. Every one of them is a decision, not a fallthrough. */
const VERDICTS = [
  'RUNNABLE',
  'IN_FLIGHT',
  'CLOSED',
  'TASK_BLOCKED',
  'QUEUE_BLOCKED',
  'DIVERGED_TERMINAL',
  'DUPLICATE_ACTIVE_ENTRY',
  'NOT_ADMITTED',
];

class ReconcileError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'ReconcileError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new ReconcileError(code, detail);
}

/**
 * The single effective state for one queue entry.
 *
 * Deliberately total and pure: it reads the two records it is handed and
 * returns a verdict for every combination. A combination with no verdict would
 * be the silent continuation this module exists to prevent.
 *
 * @param {object} o
 * @param {object} o.entry        the queue entry
 * @param {object|null} o.task    the task store's current record for entry.taskId
 * @param {object[]} [o.siblings] every queue entry sharing that taskId
 * @returns {{verdict, runnable, reason, queueState, taskState}}
 */
function effectiveState(o) {
  const entry = o && o.entry;
  if (!entry) fail('RECONCILE_ENTRY_MISSING');
  const task = o.task || null;
  const queueState = entry.state;
  const taskState = task ? task.state : null;
  const say = (verdict, reason) => ({
    verdict,
    runnable: verdict === 'RUNNABLE',
    reason,
    queueState,
    taskState,
  });

  // An old attempt must not be able to produce a second executor. Two queue
  // entries for one task, both still live, is exactly that shape — and it is
  // what the canary produced when a corrected plan was admitted beside its
  // predecessor.
  const siblings = (o.siblings || []).filter((s) => s.entryId !== entry.entryId);
  const liveSibling = siblings.filter((s) => ['CLOSED', 'FAILED', 'CANCELLED', 'BLOCKED'].indexOf(s.state) === -1)[0];
  if (liveSibling && ['CLOSED', 'FAILED', 'CANCELLED'].indexOf(queueState) === -1) {
    return say('DUPLICATE_ACTIVE_ENTRY', 'another live entry for the same task: ' + liveSibling.entryId + ' in ' + liveSibling.state);
  }

  if (queueState === 'CLOSED' || taskState === 'CLOSED') {
    // Both closed is closed. One closed and the other not is a divergence a
    // human has to look at: it means work landed that the other store never
    // heard about, or the reverse.
    if (queueState === 'CLOSED' && taskState === 'CLOSED') return say('CLOSED', 'both stores agree the task is closed');
    if (queueState === 'CLOSED' && taskState === null) return say('CLOSED', 'queue closed; the task never entered the task store');
    return say('DIVERGED_TERMINAL', 'queue=' + queueState + ' task=' + taskState);
  }

  if (queueState === 'FAILED' || queueState === 'CANCELLED' || taskState === 'CANCELLED') {
    return say('CLOSED', 'terminal: queue=' + queueState + ' task=' + taskState);
  }

  // The rule the canary broke. Opening the QUEUE entry must not silently
  // override a BLOCKED task: they are answers to different questions, and the
  // blocked attempt is the one that matters before an executor starts.
  if (taskState === 'BLOCKED') {
    // An AUTHORIZED resume is the one case where a BLOCKED task store is
    // expected rather than alarming. resumeBoth deliberately leaves that edge
    // to runTask — it is the single writer — and marks the entry instead. Not
    // honouring the mark here made the two halves of the same mechanism refuse
    // each other: the resume authorized a run that the guard then rejected.
    //
    // The mark is not a bypass. It is only ever written by an authorized
    // resume, and runTask still refuses with BLOCKED_RESUME_NOT_AUTHORIZED if
    // it arrives without one.
    if (entry.resumeFromBlocked === true) {
      return say('RUNNABLE', 'task store is BLOCKED and an authorized resume is recorded on the entry; runTask owns that transition');
    }
    return say('TASK_BLOCKED', 'task store is BLOCKED (' + ((task.payload && task.payload.blockerCode) || 'unknown') + '); resuming the queue entry does not clear it');
  }
  if (queueState === 'BLOCKED') {
    return say('QUEUE_BLOCKED', 'queue entry is BLOCKED (' + (entry.blockerCode || 'unknown') + ')');
  }

  if (taskState && TASK_IN_FLIGHT.indexOf(taskState) !== -1) {
    return say('IN_FLIGHT', 'an attempt is already under way in the task store (' + taskState + ')');
  }

  if (queueState !== 'QUEUED') {
    return say('IN_FLIGHT', 'the queue entry is already past admission (' + queueState + ')');
  }

  if (task && TASK_LIVE_BEFORE_EXECUTION.indexOf(taskState) === -1) {
    return say('DIVERGED_TERMINAL', 'queue is QUEUED but the task store says ' + taskState);
  }

  return say('RUNNABLE', task ? 'both stores agree the task may start' : 'queued, and no prior attempt exists');
}

/**
 * Is this resume authorized?
 *
 * Four independent conditions, all required. A resume that satisfies three of
 * them is a resume nobody authorized — and resume is the one operation that
 * turns a refusal back into permission.
 *
 * @param {object} o
 * @param {object} o.entry
 * @param {object} o.standingGrant
 * @param {string} o.parentAuthorizationId  what the caller claims authorizes it
 * @param {boolean} [o.killSwitchEngaged]
 * @param {boolean} [o.grantRevoked]
 * @param {string} o.taskSpecSha256         the plan identity being resumed
 * @returns {{authorized: boolean, refusal: string|null}}
 */
function authorizeResume(o) {
  const entry = (o && o.entry) || null;
  if (!entry) return { authorized: false, refusal: 'RESUME_ENTRY_MISSING' };
  if (o.killSwitchEngaged === true) return { authorized: false, refusal: 'KILL_SWITCH_ENGAGED' };
  if (o.grantRevoked === true) return { authorized: false, refusal: 'STANDING_GRANT_REVOKED' };

  const grant = o.standingGrant;
  if (!grant || typeof grant !== 'object') return { authorized: false, refusal: 'RESUME_GRANT_MISSING' };
  const grantParent = (grant.parentAuthorizationRef && grant.parentAuthorizationRef.authorizationId) || null;
  if (!grantParent) return { authorized: false, refusal: 'RESUME_GRANT_HAS_NO_PARENT' };
  if (!o.parentAuthorizationId || o.parentAuthorizationId !== grantParent) {
    return { authorized: false, refusal: 'RESUME_PARENT_AUTHORIZATION_MISMATCH' };
  }
  if (entry.parentAuthorizationId && entry.parentAuthorizationId !== grantParent) {
    return { authorized: false, refusal: 'RESUME_ENTRY_PARENT_MISMATCH' };
  }
  // Exact task identity: resuming "the OFFICE task" is not a thing. Resuming
  // THIS plan is.
  if (!o.taskSpecSha256 || (entry.taskSpecSha256 && entry.taskSpecSha256 !== o.taskSpecSha256)) {
    return { authorized: false, refusal: 'RESUME_TASK_IDENTITY_MISMATCH' };
  }
  return { authorized: true, refusal: null };
}

// ─────────────────────────────────────────────────── write-ahead intent

function intentLog(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'reconcile-intents.jsonl');
}

function appendIntent(dir, rec) {
  fs.appendFileSync(intentLog(dir), JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}

function readIntents(dir) {
  const p = intentLog(dir);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/**
 * Record what BOTH stores are about to become, before either changes.
 *
 * The intent carries the exact target of each write, which is what makes
 * recovery deterministic rather than a judgement call: a crash halfway through
 * leaves an instruction on disk, not a puzzle.
 */
function beginIntent(dir, o) {
  const intentId = crypto.randomBytes(12).toString('hex');
  return appendIntent(dir, {
    schemaVersion: 1,
    intentId,
    phase: 'INTENT',
    op: o.op,
    taskId: o.taskId,
    entryId: o.entryId,
    queue: o.queue || null,
    task: o.task || null,
    reason: o.reason || null,
    atMs: o.nowMs || Date.now(),
  });
}

function commitIntent(dir, intentId, nowMs) {
  return appendIntent(dir, { schemaVersion: 1, intentId, phase: 'COMMITTED', atMs: nowMs || Date.now() });
}

/** Intents with no commit — each one is a half-applied write to finish. */
function pendingIntents(dir) {
  const all = readIntents(dir);
  const committed = new Set(all.filter((r) => r.phase === 'COMMITTED').map((r) => r.intentId));
  return all.filter((r) => r.phase === 'INTENT' && !committed.has(r.intentId));
}

/**
 * Finish every half-applied write, then report.
 *
 * Roll FORWARD, never back: the intent is the decision that was already made,
 * and undoing it would discard a decision on the grounds that a process died
 * afterwards. Each side is applied only if it has not been applied already, so
 * running this twice changes nothing the second time.
 *
 * @param {object} o
 * @param {object} o.queue
 * @param {object} o.store        the task store
 * @param {string} o.dir          where intents live
 * @returns {object[]} what was completed
 */
function recoverIntents(o) {
  const done = [];
  for (const intent of pendingIntents(o.dir)) {
    const applied = { intentId: intent.intentId, op: intent.op, queue: 'ALREADY', task: 'ALREADY' };

    if (intent.queue) {
      const entry = o.queue.get(intent.entryId);
      if (entry && entry.state === intent.queue.from) {
        o.queue.transition({
          entryId: intent.entryId,
          to: intent.queue.to,
          expectedPreviousState: intent.queue.from,
          resumeAuthorized: intent.queue.resumeAuthorized === true,
          patch: intent.queue.patch || {},
        });
        applied.queue = 'APPLIED';
      }
    }

    if (intent.task) {
      const cur = o.store.current(intent.taskId);
      if (cur && cur.state === intent.task.from) {
        o.store.transition({
          taskId: intent.taskId,
          to: intent.task.to,
          expectedPreviousState: intent.task.from,
          writerIdentity: intent.task.writerIdentity || 'ORCHESTRATOR',
          payload: intent.task.payload || {},
        });
        applied.task = 'APPLIED';
      }
    }

    commitIntent(o.dir, intent.intentId);
    done.push(applied);
  }
  return done;
}

/**
 * Authorize a resume. ONE writer per edge.
 *
 * The task store's BLOCKED -> ELIGIBLE edge already has an owner: runTask does
 * it, having checked ctx.resumeFromBlocked, and records which blocker it
 * resumed from. This module performing that transition as well produced exactly
 * the collision it exists to prevent — the store was moved to ELIGIBLE, then
 * runTask found neither "no record" nor BLOCKED and died on
 * STATE_CAS_MISMATCH: expected DECLARED but store holds ELIGIBLE.
 *
 * So the reconciler AUTHORIZES the resume and does not perform it. It unblocks
 * the queue entry and marks it resumeFromBlocked, which the executor adapter
 * passes through; runTask then makes its own transition, as it always did.
 *
 * A happy consequence: resume is now a SINGLE queue write, so there is no
 * cross-store window to be atomic about. The write-ahead intent still records
 * it — the log should show who authorized what — but recovery has nothing to
 * roll forward, which is the strongest form of "or in neither".
 */
function resumeBoth(o) {
  const auth = authorizeResume(o);
  if (!auth.authorized) fail(auth.refusal, o.entry && o.entry.entryId);

  const entry = o.queue.get(o.entry.entryId);
  const task = o.store ? o.store.current(o.entry.taskId) : null;
  const taskIsBlocked = Boolean(task) && task.state === 'BLOCKED';
  const nowMs = o.nowMs || Date.now();

  const intent = beginIntent(o.dir, {
    op: 'RESUME',
    taskId: o.entry.taskId,
    entryId: o.entry.entryId,
    reason: o.reason || null,
    nowMs,
    queue: entry && entry.state === 'BLOCKED'
      ? {
          from: 'BLOCKED',
          to: 'QUEUED',
          resumeAuthorized: true,
          patch: {
            blockerCode: null,
            owner: null,
            // What the adapter passes to runTask, which owns the task-store
            // edge. Carried on the entry rather than held in memory so a
            // restart between the authorization and the dispatch does not
            // silently downgrade an authorized resume into a refused one.
            resumeFromBlocked: taskIsBlocked,
            resumeAuthorizedBy: o.parentAuthorizationId,
            resumeReason: o.reason || null,
          },
        }
      : null,
    // Deliberately null: runTask owns BLOCKED -> ELIGIBLE. Writing it here too
    // is what produced STATE_CAS_MISMATCH.
    task: null,
  });

  const applied = recoverIntents({ queue: o.queue, store: o.store, dir: o.dir });
  return { intentId: intent.intentId, applied, authorized: true };
}

module.exports = {
  VERDICTS,
  TASK_LIVE_BEFORE_EXECUTION,
  TASK_IN_FLIGHT,
  ReconcileError,
  effectiveState,
  authorizeResume,
  beginIntent,
  commitIntent,
  pendingIntents,
  recoverIntents,
  resumeBoth,
};
