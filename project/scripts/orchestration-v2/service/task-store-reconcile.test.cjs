'use strict';
/**
 * Moving a task-store record to match what demonstrably happened.
 *
 * The property under test is never "the record can be updated". It is that
 * updating it costs the full evidence — a merged pull request, the same merge
 * sha in the queue, that sha reachable from main and not reverted, one task
 * identity, no live replacement — and that missing ANY of it leaves the record
 * exactly where it was found.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Q = require('../orchestrator/queue.cjs');
const St = require('../orchestrator/state.cjs');
const R = require('./task-store-reconcile.cjs');

const TASK = 'CANARY-RECON-01';
const MERGE = '7'.repeat(40);
const HEAD = '8'.repeat(40);
const PR = 1750;
const AUTH = 'OWNER-DECISION-ORCHESTRA-MERGED-TASK-TERMINAL-RECONCILIATION-R01';

const dirs = [];
function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-tsr-'));
  dirs.push(d);
  return d;
}
test.after(() => {
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e) {
      /* a temp dir that will not delete is not a test failure */
    }
  }
});

/** A world where the queue closed with a merge and the task store did not. */
function world(over) {
  const o = over || {};
  const root = tmpdir();
  const queue = Q.createQueue(path.join(root, '.queue'));
  const store = St.createStore(path.join(root, '.state'));

  const e = queue.enqueue({
    programId: 'OFFICE',
    taskId: o.queueTaskId || TASK,
    taskClass: 'TEST_ONLY_CHARACTERIZATION',
    parentAuthorizationId: 'OWNER-GRANT-X',
    idempotencyKey: 'k1',
  });
  // Straight to the terminal shape this reconciler exists for.
  if (o.queueState !== 'OPEN') {
    queue.transition({
      entryId: e.entryId,
      to: 'BLOCKED',
      expectedPreviousState: 'QUEUED',
      patch: {
        blockerCode: 'X',
        mergeSha: o.queueMergeSha === undefined ? MERGE : o.queueMergeSha,
        handoff: { prNumber: PR, prHeadSha: HEAD, attestation: {} },
      },
    });
  }

  // The task store: declared, then blocked, and never told what happened next.
  store.transition({ taskId: TASK, to: 'DECLARED', expectedPreviousState: null, writerIdentity: 'TASK_AUTHOR' });
  store.transition({ taskId: TASK, to: 'AUTHORIZED', expectedPreviousState: 'DECLARED', writerIdentity: 'OWNER' });
  store.transition({
    taskId: TASK,
    to: 'BLOCKED',
    expectedPreviousState: 'AUTHORIZED',
    writerIdentity: 'ORCHESTRATOR',
    payload: { blockerCode: 'ATTESTATION_INVALIDATED' },
  });

  return { root, queue, store, entryId: e.entryId };
}

/** Walk an entry the long way to CLOSED, the way a real run reaches it. */
function closeEntry(queue, entryId, over) {
  const o = over || {};
  queue.transition({
    entryId,
    to: 'QUEUED',
    expectedPreviousState: 'BLOCKED',
    resumeAuthorized: true,
  });
  const path2 = ['PLANNING', 'REVIEWING', 'AUTHORIZED', 'PREFLIGHT', 'EXECUTING', 'VALIDATING', 'PR_OPEN', 'CI_WAITING', 'MERGE_READY', 'MERGING', 'MERGED', 'SYNCING', 'CLEANING', 'CLOSED'];
  let from = 'QUEUED';
  for (const to of path2) {
    queue.transition({
      entryId,
      to,
      expectedPreviousState: from,
      patch: to === 'MERGED' ? { mergeSha: o.mergeSha === undefined ? MERGE : o.mergeSha } : {},
    });
    from = to;
  }
}

function run(w, over) {
  const o = over || {};
  return R.reconcileMergedTaskStore({
    store: w.store,
    queue: w.queue,
    taskId: o.taskId || TASK,
    repoCwd: w.root,
    reconciliationAuthority: o.authority === undefined ? AUTH : o.authority,
    readPullRequest: o.readPullRequest || (() => ({ number: PR, state: 'MERGED', headRefOid: HEAD, mergeCommit: { oid: MERGE }, mergedAt: '2026-07-28T00:00:00Z' })),
    reachableFromMain: o.reachableFromMain || (() => true),
    revertedSince: o.revertedSince || (() => null),
    nowMs: 1785000000000,
  });
}

test('a merged pull request with a closed queue and a blocked task reconciles', () => {
  const w = world();
  closeEntry(w.queue, w.entryId);
  const r = run(w);
  assert.equal(r.disposition, 'RECONCILED', r.refusal + ' ' + r.detail);

  const cur = w.store.current(TASK);
  assert.equal(cur.state, 'CLOSED');

  // The historical blocker is preserved, not erased.
  const hist = w.store.history(TASK).map((h) => h.state);
  assert.deepEqual(hist, ['DECLARED', 'AUTHORIZED', 'BLOCKED', 'MERGED', 'CLOSED']);
  const blocked = w.store.history(TASK).filter((h) => h.state === 'BLOCKED')[0];
  assert.equal(blocked.payload.blockerCode, 'ATTESTATION_INVALIDATED');

  // And the evidence travels with the record.
  const ev = cur.payload.externalTruthReconciliation;
  assert.equal(ev.reasonCode, 'CLOSED_MERGED_EXTERNAL_TRUTH');
  assert.equal(ev.previousState, 'BLOCKED');
  assert.equal(ev.previousBlockerCode, 'ATTESTATION_INVALIDATED');
  assert.equal(ev.mergeSha, MERGE);
  assert.equal(ev.prNumber, PR);
  assert.equal(ev.reconciliationAuthority, AUTH);
});

test('a pull request that is not merged is refused', () => {
  const w = world();
  closeEntry(w.queue, w.entryId);
  const r = run(w, { readPullRequest: () => ({ number: PR, state: 'OPEN', headRefOid: HEAD, mergeCommit: null }) });
  assert.equal(r.refusal, 'TS_RECONCILE_PR_NOT_MERGED');
  assert.equal(w.store.current(TASK).state, 'BLOCKED');
});

test('a merge sha that disagrees with the queue is refused', () => {
  const w = world();
  closeEntry(w.queue, w.entryId);
  const r = run(w, {
    readPullRequest: () => ({ number: PR, state: 'MERGED', headRefOid: HEAD, mergeCommit: { oid: '9'.repeat(40) } }),
  });
  assert.equal(r.refusal, 'TS_RECONCILE_MERGE_SHA_MISMATCH');
  assert.equal(w.store.current(TASK).state, 'BLOCKED');
});

test('a merge that is not in main ancestry is refused', () => {
  // Ancestry is what separates "GitHub says merged" from "the change is there".
  const w = world();
  closeEntry(w.queue, w.entryId);
  const r = run(w, { reachableFromMain: () => false });
  assert.equal(r.refusal, 'TS_RECONCILE_MERGE_SHA_UNREACHABLE');
  assert.equal(w.store.current(TASK).state, 'BLOCKED');
});

test('a merge that was reverted since is refused', () => {
  // A revert leaves the original sha reachable, so ancestry alone cannot see
  // it. Without this check the record would close over a change that is no
  // longer in main.
  const w = world();
  closeEntry(w.queue, w.entryId);
  const r = run(w, { revertedSince: () => 'deadbee Revert "the thing"' });
  assert.equal(r.refusal, 'TS_RECONCILE_MERGE_REVERTED');
  assert.equal(w.store.current(TASK).state, 'BLOCKED');
});

test('a task with no queue entry of its own is refused', () => {
  const w = world({ queueTaskId: 'SOME-OTHER-TASK-R09' });
  const r = run(w);
  assert.equal(r.refusal, 'TS_RECONCILE_QUEUE_ENTRY_UNKNOWN');
  assert.equal(w.store.current(TASK).state, 'BLOCKED');
});

test('a live replacement entry blocks reconciliation', () => {
  // Attaching the merge to the wrong attempt is worse than leaving the record
  // stale, so a second live entry for the same task stops this outright.
  const w = world();
  closeEntry(w.queue, w.entryId);
  w.queue.enqueue({
    programId: 'OFFICE',
    taskId: TASK,
    taskClass: 'TEST_ONLY_CHARACTERIZATION',
    parentAuthorizationId: 'OWNER-GRANT-X',
    idempotencyKey: 'k2',
  });
  const r = run(w);
  assert.equal(r.refusal, 'TS_RECONCILE_REPLACEMENT_TASK_CONFLICT');
  assert.equal(w.store.current(TASK).state, 'BLOCKED');
});

test('reconciling twice is idempotent', () => {
  const w = world();
  closeEntry(w.queue, w.entryId);
  assert.equal(run(w).disposition, 'RECONCILED');
  const again = run(w);
  assert.equal(again.disposition, 'ALREADY_RECONCILED');
  assert.equal(again.reconciled, false);
  assert.equal(w.store.history(TASK).length, 5, 'no second pair of records');
});

test('an authority reference is required', () => {
  const w = world();
  closeEntry(w.queue, w.entryId);
  const r = run(w, { authority: '' });
  assert.equal(r.refusal, 'TS_RECONCILE_AUTHORITY_MISSING');
  assert.equal(w.store.current(TASK).state, 'BLOCKED');
});

test('a queue entry that never closed is refused', () => {
  const w = world({ queueState: 'BLOCKED' });
  const r = run(w);
  assert.equal(r.refusal, 'TS_RECONCILE_REPLACEMENT_TASK_CONFLICT');
  assert.equal(w.store.current(TASK).state, 'BLOCKED');
});

test('the state machine refuses BLOCKED -> MERGED without the reconciliation flag', () => {
  // Below the service, so no caller can arrange otherwise. The edge exists for
  // external truth and for nothing else.
  const w = world();
  assert.throws(
    () =>
      w.store.transition({
        taskId: TASK,
        to: 'MERGED',
        expectedPreviousState: 'BLOCKED',
        writerIdentity: 'ORCHESTRATOR',
      }),
    (e) => e.code === 'STATE_TRANSITION_FORBIDDEN',
  );
  assert.equal(w.store.current(TASK).state, 'BLOCKED');
});
