'use strict';
/**
 * GOV-COORD-V2 execution recovery.
 *
 * A service that only works when nothing goes wrong is not a service. This
 * module answers one question deterministically: after a crash, a restart, a
 * dropped network or a killed process, what is safe to do with an entry that is
 * still sitting in an active queue state?
 *
 * The hard rule it exists to enforce: RECOVERY NEVER STARTS A SECOND EXECUTOR.
 *
 * That rule decides the one genuinely hard case: a process that is still ALIVE
 * but has stopped heartbeating. It is tempting to reclaim it — fifteen minutes
 * of silence looks like death, and leaving it holds the single slot. But a
 * process that still exists can still be writing to its worktree, still holding
 * a lease, still about to open a PR. Rewinding its entry would put a second
 * executor on the same work, which is the one outcome this module exists to
 * prevent.
 *
 * So liveness WINS over staleness. Only an entry whose process is actually gone
 * AND whose heartbeat is past the grace may be reclaimed. A live-but-silent
 * worker is reported as OWNER_STALE — loudly, in status — and left alone. An
 * operator who has decided it is hung kills the process; the next scan then
 * sees no pid and reclaims it normally. That keeps the decision to end a
 * running process with a human, where it belongs, and out of a timer.
 *
 * Deliberately single-host. The runtime is one machine with one queue on one
 * filesystem; a distributed lease protocol would add failure modes this system
 * does not have. Ownership is a pid plus a heartbeat, checked against the
 * process table.
 */

const QUEUE_STATES_ACTIVE = require('./queue.cjs').OCCUPIES_SLOT;

/**
 * How long an entry may go without a heartbeat before its worker counts as
 * gone. Generous on purpose: an executor can legitimately be silent for minutes
 * while a model thinks or a CI poll sleeps, and reclaiming a live entry is far
 * worse than waiting out a dead one.
 */
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Where an entry rewinds to when it is reclaimed.
 *
 * Nothing rewinds to the middle of its own work. An entry that died while
 * executing goes back to AUTHORIZED and runs again from preflight; one that died
 * after the PR was open goes back to CI_WAITING, because the PR still exists and
 * re-running the executor would open a second one.
 *
 * MERGING has no safe rewind: the merge may or may not have happened, and only
 * looking at the remote can say. It becomes BLOCKED with the reason attached so
 * an operator — or WP05's merge controller — resolves it from evidence rather
 * than from a guess.
 */
const REWIND = {
  PLANNING: 'QUEUED',
  REVIEWING: 'QUEUED',
  AUTHORIZED: 'QUEUED',
  PREFLIGHT: 'AUTHORIZED',
  EXECUTING: 'AUTHORIZED',
  VALIDATING: 'AUTHORIZED',
  REPAIRING: 'AUTHORIZED',
  PR_OPEN: 'CI_WAITING',
  CI_WAITING: 'CI_WAITING',
  CI_FAILED: 'REPAIRING',
  MERGE_READY: 'MERGE_READY',
  MERGING: null,
  MERGED: 'SYNCING',
  SYNCING: 'CLEANING',
  CLEANING: 'CLEANING',
};

class RecoveryError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'RecoveryError';
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
    // EPERM means it exists but belongs to someone else — still alive.
    return e && e.code === 'EPERM';
  }
}

/**
 * Classify one entry. Pure: no I/O beyond the liveness probe, no mutation.
 *
 * @returns {{entryId, state, verdict, reason, rewindTo}}
 *   verdict is one of:
 *     HEALTHY          not occupying the slot, nothing to do
 *     OWNER_ALIVE      a worker still holds it; recovery must not touch it
 *     OWNER_STALE      the process is alive but has not beaten in far too
 *                      long; NOT reclaimed, because a live process can still
 *                      be writing. Surfaced for an operator to judge.
 *     RECLAIMABLE      worker gone, and there is a safe state to rewind to
 *     NEEDS_EVIDENCE   worker gone, but the safe next step depends on the
 *                      remote (mid-merge); block rather than guess
 */
function classify(entry, opts) {
  const now = (opts && opts.nowMs) || Date.now();
  const staleAfter = (opts && opts.staleAfterMs) || DEFAULT_STALE_AFTER_MS;
  const isAlive = (opts && opts.pidAlive) || pidAlive;

  if (!entry || QUEUE_STATES_ACTIVE.indexOf(entry.state) === -1) {
    return { entryId: entry && entry.entryId, state: entry && entry.state, verdict: 'HEALTHY', reason: null, rewindTo: null };
  }

  const owner = entry.owner || {};
  const beat = Number(owner.heartbeatAtMs || entry.updatedAtMs || 0);
  const age = now - beat;

  if (isAlive(owner.pid)) {
    // Liveness wins over staleness. A silent process is not a dead one, and
    // reclaiming it is how a second executor gets started.
    const stale = age >= staleAfter;
    return {
      entryId: entry.entryId,
      state: entry.state,
      verdict: stale ? 'OWNER_STALE' : 'OWNER_ALIVE',
      reason:
        'pid ' + owner.pid + ' alive, last beat ' + Math.round(age / 1000) + 's ago' +
        (stale ? ' — past the grace; kill the process if it is hung, then recovery can reclaim it' : ''),
      rewindTo: null,
    };
  }
  if (age < staleAfter) {
    // No live pid, but the heartbeat is recent enough that the worker may be
    // mid-restart. Waiting costs a few minutes; racing costs a second executor.
    return {
      entryId: entry.entryId,
      state: entry.state,
      verdict: 'OWNER_ALIVE',
      reason: 'heartbeat still inside the grace window (' + Math.round(age / 1000) + 's)',
      rewindTo: null,
    };
  }

  const rewind = REWIND[entry.state];
  if (rewind === null || rewind === undefined) {
    return {
      entryId: entry.entryId,
      state: entry.state,
      verdict: 'NEEDS_EVIDENCE',
      reason: 'died in ' + entry.state + '; whether the merge landed can only be read from the remote',
      rewindTo: null,
    };
  }
  return {
    entryId: entry.entryId,
    state: entry.state,
    verdict: 'RECLAIMABLE',
    reason: 'no live owner, last beat ' + Math.round(age / 1000) + 's ago',
    rewindTo: rewind,
  };
}

/** Classify every entry a queue holds. */
function scan(queue, opts) {
  return queue.list().map((e) => classify(e, opts));
}

/**
 * Take over the entries whose workers are provably gone.
 *
 * Applies only RECLAIMABLE verdicts. OWNER_ALIVE is skipped — that is the
 * no-second-executor rule — and NEEDS_EVIDENCE is moved to BLOCKED with its
 * reason so a human or a later controller resolves it from evidence.
 *
 * Idempotent: running it twice reclaims nothing the second time, because the
 * first pass moved the entries out of the states it acts on.
 */
function reclaim(queue, opts) {
  const o = opts || {};
  const now = o.nowMs || Date.now();
  const results = [];

  for (const verdict of scan(queue, o)) {
    // OWNER_STALE is skipped for the same reason OWNER_ALIVE is: the process
    // still exists. It is escalated by an operator, not by a timer.
    if (
      verdict.verdict === 'HEALTHY' ||
      verdict.verdict === 'OWNER_ALIVE' ||
      verdict.verdict === 'OWNER_STALE'
    ) {
      results.push(verdict);
      continue;
    }
    const entry = queue.get(verdict.entryId);
    if (verdict.verdict === 'NEEDS_EVIDENCE') {
      queue.transition({
        entryId: entry.entryId,
        to: 'BLOCKED',
        expectedPreviousState: entry.state,
        nowMs: now,
        patch: { blockerCode: 'RECOVERY_NEEDS_EVIDENCE', owner: null },
      });
      results.push(Object.assign({}, verdict, { applied: 'BLOCKED' }));
      continue;
    }
    // A rewind to the same state is a re-take, not a move: clear the dead
    // owner and let the worker pick it up again.
    if (verdict.rewindTo === entry.state) {
      queue.transition({
        entryId: entry.entryId,
        to: entry.state === 'CI_WAITING' ? 'CI_WAITING' : entry.state,
        expectedPreviousState: entry.state,
        nowMs: now,
        patch: { owner: null },
      });
      results.push(Object.assign({}, verdict, { applied: 'OWNER_CLEARED' }));
      continue;
    }
    queue.transition({
      entryId: entry.entryId,
      to: verdict.rewindTo,
      expectedPreviousState: entry.state,
      nowMs: now,
      patch: { owner: null },
    });
    results.push(Object.assign({}, verdict, { applied: verdict.rewindTo }));
  }
  return results;
}

/** Stamp ownership on an entry the caller is about to work on. */
function takeOwnership(queue, entryId, opts) {
  const o = opts || {};
  const entry = queue.get(entryId);
  if (!entry) throw new RecoveryError('QUEUE_ENTRY_UNKNOWN', String(entryId));
  const now = o.nowMs || Date.now();
  return queue.transition({
    entryId,
    to: entry.state,
    expectedPreviousState: entry.state,
    nowMs: now,
    patch: { owner: { pid: o.pid || process.pid, host: o.host || 'local', heartbeatAtMs: now } },
  });
}

/** Refresh the heartbeat without changing state. */
function heartbeat(queue, entryId, opts) {
  const o = opts || {};
  const entry = queue.get(entryId);
  if (!entry) throw new RecoveryError('QUEUE_ENTRY_UNKNOWN', String(entryId));
  const now = o.nowMs || Date.now();
  const owner = Object.assign({}, entry.owner || {}, { heartbeatAtMs: now });
  return queue.transition({
    entryId,
    to: entry.state,
    expectedPreviousState: entry.state,
    nowMs: now,
    patch: { owner },
  });
}

module.exports = {
  DEFAULT_STALE_AFTER_MS,
  REWIND,
  RecoveryError,
  pidAlive,
  classify,
  scan,
  reclaim,
  takeOwnership,
  heartbeat,
};
