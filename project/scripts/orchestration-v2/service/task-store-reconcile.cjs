'use strict';
/**
 * A task store that still says BLOCKED about work that merged.
 *
 * The sibling case to merged-reconcile.cjs, and the mirror image of it. There
 * the QUEUE was stuck while the change was in main; here the queue is CLOSED,
 * carries the merge sha, and the TASK STORE is the one holding a stale blocker.
 *
 * Observed on R03: queue CLOSED/MERGED, PR #1750 merged as 7854504b, and the
 * task store's last record BLOCKED(ATTESTATION_INVALIDATED) — written by a
 * finalize that failed, after which a later finalize succeeded and closed the
 * queue without the task store hearing about it. The record was not wrong when
 * it was written; it simply never learned what happened next.
 *
 * The state table has no edge for that, and correctly so: no EXECUTION produces
 * it. This is not an execution step at all — it is the record catching up with
 * something that already happened outside the machine. So it is gated on
 * external truth rather than on the state machine's own permission, every fact
 * is checked one by one, and the historical blocker is preserved rather than
 * erased.
 *
 * Nothing here merges, closes a pull request, or mints an attestation. It reads
 * GitHub and git, and it writes to the task store only after every condition
 * holds.
 */

const { execFileSync } = require('child_process');

/** Refusals. Every one leaves the task store exactly where it was found. */
const REFUSALS = [
  'TS_RECONCILE_AUTHORITY_MISSING',
  'TS_RECONCILE_TASK_UNKNOWN',
  'TS_RECONCILE_NOT_BLOCKED',
  'TS_RECONCILE_QUEUE_ENTRY_UNKNOWN',
  'TS_RECONCILE_QUEUE_NOT_CLOSED',
  'TS_RECONCILE_QUEUE_MERGE_SHA_MISSING',
  'TS_RECONCILE_TASK_IDENTITY_MISMATCH',
  'TS_RECONCILE_PR_NOT_MERGED',
  'TS_RECONCILE_PR_MISMATCH',
  'TS_RECONCILE_MERGE_SHA_MISMATCH',
  'TS_RECONCILE_MERGE_SHA_UNREACHABLE',
  'TS_RECONCILE_MERGE_REVERTED',
  'TS_RECONCILE_REPLACEMENT_TASK_CONFLICT',
  'TS_RECONCILE_GITHUB_UNREADABLE',
];

/** Why the record moved. Never "merged" alone — that would read as execution. */
const REASON = 'CLOSED_MERGED_EXTERNAL_TRUTH';

class TaskStoreReconcileError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'TaskStoreReconcileError';
    this.code = code;
    this.detail = detail || null;
  }
}

function refusal(code, detail) {
  return { disposition: 'REFUSED', refusal: code, detail: detail || null, reconciled: false };
}

/** What GitHub says about the pull request, read and never written. */
function readPullRequest(o) {
  const raw = execFileSync(
    'gh',
    ['pr', 'view', String(o.prNumber), '--json', 'number,state,headRefOid,mergeCommit,mergedAt'],
    { cwd: o.repoCwd, encoding: 'utf8' },
  );
  return JSON.parse(raw);
}

/** Is `sha` an ancestor of origin/main — i.e. did it actually land and stay? */
function reachableFromMain(repoCwd, sha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], { cwd: repoCwd, stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Has the merge been reverted since?
 *
 * A revert leaves the original sha reachable, so ancestry alone cannot answer
 * this. Git records the reverted sha in the revert commit's message, which is
 * the only durable trace there is.
 */
function revertedSince(repoCwd, sha) {
  try {
    const out = execFileSync(
      'git',
      ['log', '--grep', 'This reverts commit ' + sha, '--oneline', sha + '..origin/main'],
      { cwd: repoCwd, encoding: 'utf8' },
    ).trim();
    return out.length > 0 ? out.split('\n')[0] : null;
  } catch (e) {
    return null;
  }
}

/**
 * Bring a task store record into line with what demonstrably happened.
 *
 * Every condition the owner enumerated is checked here, in order, and the first
 * failure returns without writing. The order runs cheapest-and-most-local
 * first, so a refusal names the nearest reason rather than the last thing that
 * happened to break.
 */
function reconcileMergedTaskStore(o) {
  const store = o.store;
  const queue = o.queue;
  const taskId = o.taskId;
  const authority = o.reconciliationAuthority;
  const audit = o.audit || (() => {});
  const nowMs = o.nowMs || Date.now();
  const readPr = o.readPullRequest || readPullRequest;
  const reachable = o.reachableFromMain || reachableFromMain;
  const reverted = o.revertedSince || revertedSince;

  if (typeof authority !== 'string' || authority.trim() === '') {
    return refusal('TS_RECONCILE_AUTHORITY_MISSING', 'an owner authority reference is required');
  }

  const current = store.current(taskId);
  if (!current) return refusal('TS_RECONCILE_TASK_UNKNOWN', String(taskId));
  if (current.state !== 'BLOCKED') {
    // Idempotent by construction: a record already reconciled reports so rather
    // than being moved again.
    if (current.state === 'CLOSED') {
      return { disposition: 'ALREADY_RECONCILED', refusal: null, detail: 'task store is CLOSED', reconciled: false };
    }
    return refusal('TS_RECONCILE_NOT_BLOCKED', 'task store holds ' + current.state);
  }

  const entries = queue.list().filter((e) => e.taskId === taskId);
  if (!entries.length) return refusal('TS_RECONCILE_QUEUE_ENTRY_UNKNOWN', String(taskId));
  // A task with more than one live entry is a different problem, and moving the
  // store while it exists would attach the merge to the wrong attempt.
  const live = entries.filter((e) => ['CLOSED', 'FAILED', 'CANCELLED'].indexOf(e.state) === -1);
  if (live.length) {
    return refusal('TS_RECONCILE_REPLACEMENT_TASK_CONFLICT', 'another entry is still live: ' + live[0].entryId + ' in ' + live[0].state);
  }
  const entry = entries.filter((e) => e.state === 'CLOSED').pop();
  if (!entry) return refusal('TS_RECONCILE_QUEUE_NOT_CLOSED', entries[0].state);
  if (!entry.mergeSha) return refusal('TS_RECONCILE_QUEUE_MERGE_SHA_MISSING', entry.entryId);
  if (entry.taskId !== taskId) return refusal('TS_RECONCILE_TASK_IDENTITY_MISMATCH', entry.taskId + ' != ' + taskId);

  const prNumber = (entry.handoff && entry.handoff.prNumber) || entry.prNumber;
  if (!prNumber) return refusal('TS_RECONCILE_PR_MISMATCH', 'the queue entry names no pull request');

  let pr;
  try {
    pr = readPr({ repoCwd: o.repoCwd, prNumber });
  } catch (e) {
    return refusal('TS_RECONCILE_GITHUB_UNREADABLE', String(e.message).slice(0, 160));
  }
  if (pr.state !== 'MERGED') return refusal('TS_RECONCILE_PR_NOT_MERGED', '#' + prNumber + ' is ' + pr.state);

  const prMergeSha = (pr.mergeCommit && pr.mergeCommit.oid) || null;
  if (!prMergeSha || prMergeSha !== entry.mergeSha) {
    return refusal('TS_RECONCILE_MERGE_SHA_MISMATCH', 'queue ' + String(entry.mergeSha).slice(0, 12) + ' vs github ' + String(prMergeSha).slice(0, 12));
  }
  const pinnedHead = (entry.handoff && entry.handoff.prHeadSha) || entry.prHeadSha;
  if (pinnedHead && pr.headRefOid && pinnedHead !== pr.headRefOid) {
    return refusal('TS_RECONCILE_PR_MISMATCH', 'head ' + String(pinnedHead).slice(0, 12) + ' vs ' + String(pr.headRefOid).slice(0, 12));
  }

  if (!reachable(o.repoCwd, entry.mergeSha)) {
    return refusal('TS_RECONCILE_MERGE_SHA_UNREACHABLE', entry.mergeSha.slice(0, 12) + ' is not an ancestor of origin/main');
  }
  const revert = reverted(o.repoCwd, entry.mergeSha);
  if (revert) return refusal('TS_RECONCILE_MERGE_REVERTED', revert);

  // Everything holds. The evidence travels WITH the record, so a reader a year
  // from now can re-check the claim instead of trusting the word.
  const evidence = {
    reasonCode: REASON,
    previousState: current.state,
    previousBlockerCode: (current.payload && current.payload.blockerCode) || null,
    queueEntryId: entry.entryId,
    queueState: entry.state,
    prNumber,
    prHeadSha: pr.headRefOid || pinnedHead || null,
    mergeSha: entry.mergeSha,
    mergedAt: pr.mergedAt || null,
    reconciliationAuthority: authority,
    reconciledAtMs: nowMs,
  };

  audit('TASK_STORE_RECONCILE_STARTED', { taskId, ...evidence });

  store.transition({
    taskId,
    to: 'MERGED',
    expectedPreviousState: 'BLOCKED',
    writerIdentity: 'ORCHESTRATOR',
    externalTruthReconciliation: true,
    payload: { mergeSha: entry.mergeSha, externalTruthReconciliation: evidence },
    nowMs,
  });
  store.transition({
    taskId,
    to: 'CLOSED',
    expectedPreviousState: 'MERGED',
    writerIdentity: 'ORCHESTRATOR',
    externalTruthReconciliation: true,
    payload: { externalTruthReconciliation: evidence },
    nowMs,
  });

  audit('TASK_STORE_RECONCILED', { taskId, mergeSha: entry.mergeSha, reasonCode: REASON });

  return { disposition: 'RECONCILED', refusal: null, detail: null, reconciled: true, evidence };
}

module.exports = {
  REFUSALS,
  REASON,
  TaskStoreReconcileError,
  readPullRequest,
  reachableFromMain,
  revertedSince,
  reconcileMergedTaskStore,
};
