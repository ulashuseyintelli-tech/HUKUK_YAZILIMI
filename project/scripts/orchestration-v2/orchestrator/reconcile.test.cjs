'use strict';
/**
 * State-store reconciliation.
 *
 * The property under test is one sentence: a task cannot acquire a second
 * attempt because two stores disagreed and nobody looked. Every case below is
 * a way that disagreement can arise, and the verdict it must produce.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const R = require('./reconcile.cjs');
const Q = require('./queue.cjs');
const S = require('./state.cjs');

const dirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-rec2-'));
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

const entry = (over) => Object.assign({ entryId: 'e1', taskId: 'T-1', state: 'QUEUED', blockerCode: null }, over || {});
const task = (state, blockerCode) => ({ taskId: 'T-1', state, payload: blockerCode ? { blockerCode } : {} });

// ───────────────────────────────────────────────────────── EFFECTIVE STATE

test('reconcile: queued with no prior attempt is runnable', () => {
  const e = R.effectiveState({ entry: entry(), task: null });
  assert.equal(e.verdict, 'RUNNABLE');
  assert.equal(e.runnable, true);
});

test('reconcile: a BLOCKED task is not cleared by opening its queue entry', () => {
  // This is the exact hole the canary exposed. The queue entry was resumed to
  // QUEUED while the task store still said BLOCKED, and only a guard deeper in
  // runTask stopped a second attempt — a guarantee resting on ordering luck.
  const e = R.effectiveState({ entry: entry({ state: 'QUEUED' }), task: task('BLOCKED', 'EXECUTOR_NONZERO_EXIT') });
  assert.equal(e.verdict, 'TASK_BLOCKED');
  assert.equal(e.runnable, false);
  assert.match(e.reason, /EXECUTOR_NONZERO_EXIT/);
});

test('reconcile: a BLOCKED queue entry is reported as such, not as runnable', () => {
  const e = R.effectiveState({ entry: entry({ state: 'BLOCKED', blockerCode: 'DISPATCH_PLAN_HASH_CHANGED' }), task: task('ELIGIBLE') });
  assert.equal(e.verdict, 'QUEUE_BLOCKED');
  assert.match(e.reason, /DISPATCH_PLAN_HASH_CHANGED/);
});

test('reconcile: an attempt already under way is never restarted', () => {
  for (const s of R.TASK_IN_FLIGHT) {
    const e = R.effectiveState({ entry: entry({ state: 'QUEUED' }), task: task(s) });
    assert.equal(e.runnable, false, s + ' was reported runnable');
    assert.equal(e.verdict, 'IN_FLIGHT');
  }
});

test('reconcile: one store closed and the other not is a divergence, not a default', () => {
  assert.equal(R.effectiveState({ entry: entry({ state: 'CLOSED' }), task: task('MERGE_READY') }).verdict, 'DIVERGED_TERMINAL');
  assert.equal(R.effectiveState({ entry: entry({ state: 'QUEUED' }), task: task('CLOSED') }).verdict, 'DIVERGED_TERMINAL');
  // And agreement is agreement.
  assert.equal(R.effectiveState({ entry: entry({ state: 'CLOSED' }), task: task('CLOSED') }).verdict, 'CLOSED');
});

test('reconcile: an old live entry beside a new one cannot produce a second executor', () => {
  // Exactly what the canary produced: a corrected plan admitted a second entry
  // while the first was still live.
  const mine = entry({ entryId: 'new', state: 'QUEUED' });
  const old = entry({ entryId: 'old', state: 'QUEUED' });
  const e = R.effectiveState({ entry: mine, task: null, siblings: [mine, old] });
  assert.equal(e.verdict, 'DUPLICATE_ACTIVE_ENTRY');
  assert.match(e.reason, /old/);

  // A terminated sibling is not competition.
  const dead = entry({ entryId: 'old', state: 'CLOSED' });
  assert.equal(R.effectiveState({ entry: mine, task: null, siblings: [mine, dead] }).verdict, 'RUNNABLE');
});

test('reconcile: every verdict it can return is a declared one', () => {
  // A verdict invented at the call site is a verdict no operator can look up.
  const combos = [
    [entry(), null],
    [entry(), task('BLOCKED', 'X')],
    [entry({ state: 'BLOCKED' }), task('ELIGIBLE')],
    [entry(), task('EXECUTOR_RUNNING')],
    [entry({ state: 'CLOSED' }), task('CLOSED')],
    [entry({ state: 'CLOSED' }), task('PR_OPEN')],
    [entry({ state: 'CANCELLED' }), null],
    [entry({ state: 'MERGE_READY' }), task('MERGE_READY')],
  ];
  for (const [e, t] of combos) {
    const v = R.effectiveState({ entry: e, task: t });
    assert.ok(R.VERDICTS.indexOf(v.verdict) !== -1, 'undeclared verdict ' + v.verdict);
  }
});

// ───────────────────────────────────────────────────────── RESUME AUTHORITY

const GRANT = { standingGrantId: 'SG', parentAuthorizationRef: { authorizationId: 'OWNER-R02' } };
const RESUMABLE = {
  entry: entry({ state: 'BLOCKED', parentAuthorizationId: 'OWNER-R02', taskSpecSha256: 'a'.repeat(64) }),
  standingGrant: GRANT,
  parentAuthorizationId: 'OWNER-R02',
  taskSpecSha256: 'a'.repeat(64),
};

test('resume: all four conditions together, and no fewer', () => {
  assert.equal(R.authorizeResume(RESUMABLE).authorized, true);

  const without = (over) => R.authorizeResume(Object.assign({}, RESUMABLE, over));
  assert.equal(without({ killSwitchEngaged: true }).refusal, 'KILL_SWITCH_ENGAGED');
  assert.equal(without({ grantRevoked: true }).refusal, 'STANDING_GRANT_REVOKED');
  assert.equal(without({ standingGrant: null }).refusal, 'RESUME_GRANT_MISSING');
  assert.equal(without({ parentAuthorizationId: 'SOMETHING-ELSE' }).refusal, 'RESUME_PARENT_AUTHORIZATION_MISMATCH');
  assert.equal(without({ taskSpecSha256: 'b'.repeat(64) }).refusal, 'RESUME_TASK_IDENTITY_MISMATCH');
});

test('resume: "resume the OFFICE task" is not a thing — only THIS plan is', () => {
  assert.equal(R.authorizeResume(Object.assign({}, RESUMABLE, { taskSpecSha256: null })).refusal, 'RESUME_TASK_IDENTITY_MISMATCH');
});

test('resume: a grant that cannot name its parent cannot authorize anything', () => {
  assert.equal(
    R.authorizeResume(Object.assign({}, RESUMABLE, { standingGrant: { standingGrantId: 'SG' } })).refusal,
    'RESUME_GRANT_HAS_NO_PARENT',
  );
});

// ─────────────────────────────────────────────── WRITE-AHEAD INTENT

function bothStores() {
  const root = tmp();
  const queue = Q.createQueue(path.join(root, 'queue'));
  const store = S.createStore(path.join(root, 'state'));
  return { root, queue, store, dir: queue.dir };
}

/** Drive a task through the task store to BLOCKED. */
function blockedTask(store, taskId) {
  const base = { taskId, taskSpecVersion: 1, taskSpecSha256: 'a'.repeat(64) };
  // The first transition still declares what it expects to find: null. The CAS
  // has no exemption for the first write, and leaving it undefined is how a
  // second writer's record gets silently overwritten.
  store.transition(Object.assign({ to: 'DECLARED', expectedPreviousState: null, writerIdentity: 'TASK_AUTHOR' }, base));
  store.transition(Object.assign({ to: 'AUTHORIZED', expectedPreviousState: 'DECLARED', writerIdentity: 'OWNER' }, base));
  store.transition(Object.assign({ to: 'BLOCKED', expectedPreviousState: 'AUTHORIZED', writerIdentity: 'ORCHESTRATOR', payload: { blockerCode: 'EXECUTOR_NONZERO_EXIT' } }, base));
}

test('intent: resume moves BOTH stores, and the pair is recoverable', () => {
  const { queue, store, dir } = bothStores();
  const e = queue.enqueue({ programId: 'OFFICE', taskId: 'T-1', taskClass: 'TEST_ONLY_CHARACTERIZATION', parentAuthorizationId: 'OWNER-R02', taskSpecSha256: 'a'.repeat(64) });
  queue.transition({ entryId: e.entryId, to: 'BLOCKED', expectedPreviousState: 'QUEUED', patch: { blockerCode: 'X' } });
  blockedTask(store, 'T-1');

  const r = R.resumeBoth({
    queue, store, dir,
    entry: queue.get(e.entryId),
    standingGrant: GRANT,
    parentAuthorizationId: 'OWNER-R02',
    taskSpecSha256: 'a'.repeat(64),
    reason: 'blocker fixed at source',
  });

  assert.equal(r.authorized, true);
  assert.equal(queue.get(e.entryId).state, 'QUEUED');
  // The task store is NOT moved here. runTask owns BLOCKED -> ELIGIBLE, and
  // this module doing it too produced STATE_CAS_MISMATCH: expected DECLARED but
  // store holds ELIGIBLE. It authorizes the resume instead.
  assert.equal(store.current('T-1').state, 'BLOCKED', 'the task-store edge has one owner, and it is not this');
  assert.equal(queue.get(e.entryId).resumeFromBlocked, true, 'and the authorization travels on the entry');
  assert.equal(queue.get(e.entryId).resumeAuthorizedBy, 'OWNER-R02');
  assert.equal(R.pendingIntents(dir).length, 0, 'the intent was committed');
});

test('intent: a crash between the two writes is finished, not left half-done', () => {
  // The whole reason the write-ahead record exists. Two JSONL files on one
  // filesystem cannot be written in one transaction; rather than pretend, the
  // exact target of BOTH writes is recorded before either happens.
  const { queue, store, dir } = bothStores();
  const e = queue.enqueue({ programId: 'OFFICE', taskId: 'T-1', taskClass: 'TEST_ONLY_CHARACTERIZATION', parentAuthorizationId: 'OWNER-R02' });
  queue.transition({ entryId: e.entryId, to: 'BLOCKED', expectedPreviousState: 'QUEUED', patch: { blockerCode: 'X' } });
  blockedTask(store, 'T-1');

  // Simulate the crash: the intent is written, the QUEUE side is applied, the
  // process dies before the task side.
  R.beginIntent(dir, {
    op: 'RESUME',
    taskId: 'T-1',
    entryId: e.entryId,
    queue: { from: 'BLOCKED', to: 'QUEUED', resumeAuthorized: true, patch: { blockerCode: null } },
    task: { from: 'BLOCKED', to: 'ELIGIBLE', writerIdentity: 'ORCHESTRATOR', payload: {} },
  });
  queue.transition({ entryId: e.entryId, to: 'QUEUED', expectedPreviousState: 'BLOCKED', resumeAuthorized: true, patch: { blockerCode: null } });

  assert.equal(store.current('T-1').state, 'BLOCKED', 'the stores disagree right now');
  assert.equal(R.pendingIntents(dir).length, 1);

  const done = R.recoverIntents({ queue, store, dir });
  assert.equal(done.length, 1);
  assert.equal(done[0].queue, 'ALREADY', 'the applied side was not applied twice');
  assert.equal(done[0].task, 'APPLIED', 'the missing side was completed');
  assert.equal(store.current('T-1').state, 'ELIGIBLE');
  assert.equal(R.pendingIntents(dir).length, 0);
});

test('intent: recovery rolls FORWARD — a decision is not undone because a process died', () => {
  const { queue, store, dir } = bothStores();
  const e = queue.enqueue({ programId: 'OFFICE', taskId: 'T-1', taskClass: 'TEST_ONLY_CHARACTERIZATION', parentAuthorizationId: 'OWNER-R02' });
  queue.transition({ entryId: e.entryId, to: 'BLOCKED', expectedPreviousState: 'QUEUED', patch: { blockerCode: 'X' } });
  blockedTask(store, 'T-1');

  R.beginIntent(dir, {
    op: 'RESUME', taskId: 'T-1', entryId: e.entryId,
    queue: { from: 'BLOCKED', to: 'QUEUED', resumeAuthorized: true, patch: { blockerCode: null } },
    task: { from: 'BLOCKED', to: 'ELIGIBLE', writerIdentity: 'ORCHESTRATOR', payload: {} },
  });

  R.recoverIntents({ queue, store, dir });
  assert.equal(queue.get(e.entryId).state, 'QUEUED');
  assert.equal(store.current('T-1').state, 'ELIGIBLE');
});

test('intent: running recovery twice changes nothing the second time', () => {
  const { queue, store, dir } = bothStores();
  const e = queue.enqueue({ programId: 'OFFICE', taskId: 'T-1', taskClass: 'TEST_ONLY_CHARACTERIZATION', parentAuthorizationId: 'OWNER-R02' });
  queue.transition({ entryId: e.entryId, to: 'BLOCKED', expectedPreviousState: 'QUEUED', patch: { blockerCode: 'X' } });
  blockedTask(store, 'T-1');
  R.beginIntent(dir, {
    op: 'RESUME', taskId: 'T-1', entryId: e.entryId,
    queue: { from: 'BLOCKED', to: 'QUEUED', resumeAuthorized: true, patch: {} },
    task: { from: 'BLOCKED', to: 'ELIGIBLE', writerIdentity: 'ORCHESTRATOR', payload: {} },
  });
  R.recoverIntents({ queue, store, dir });
  const after = queue.get(e.entryId).state + '/' + store.current('T-1').state;
  R.recoverIntents({ queue, store, dir });
  assert.equal(queue.get(e.entryId).state + '/' + store.current('T-1').state, after);
});

test('resume: an unauthorized resume moves neither store', () => {
  const { queue, store, dir } = bothStores();
  const e = queue.enqueue({ programId: 'OFFICE', taskId: 'T-1', taskClass: 'TEST_ONLY_CHARACTERIZATION', parentAuthorizationId: 'OWNER-R02' });
  queue.transition({ entryId: e.entryId, to: 'BLOCKED', expectedPreviousState: 'QUEUED', patch: { blockerCode: 'X' } });
  blockedTask(store, 'T-1');

  assert.throws(
    () => R.resumeBoth({ queue, store, dir, entry: queue.get(e.entryId), standingGrant: GRANT, parentAuthorizationId: 'WRONG', taskSpecSha256: 'a'.repeat(64) }),
    (err) => err.code === 'RESUME_PARENT_AUTHORIZATION_MISMATCH',
  );
  assert.equal(queue.get(e.entryId).state, 'BLOCKED');
  assert.equal(store.current('T-1').state, 'BLOCKED');
  assert.equal(R.pendingIntents(dir).length, 0, 'and no intent was left behind');
});

test('resume: the authorization travels to runTask, which owns the edge', () => {
  // The collision this replaced: the reconciler moved the task store to
  // ELIGIBLE, then runTask found neither "no record" nor BLOCKED and died with
  // STATE_CAS_MISMATCH: expected DECLARED but store holds ELIGIBLE. One edge,
  // one writer.
  const { queue, store, dir } = bothStores();
  const e = queue.enqueue({ programId: 'OFFICE', taskId: 'T-1', taskClass: 'TEST_ONLY_CHARACTERIZATION', parentAuthorizationId: 'OWNER-R02', taskSpecSha256: 'a'.repeat(64) });
  queue.transition({ entryId: e.entryId, to: 'BLOCKED', expectedPreviousState: 'QUEUED', patch: { blockerCode: 'EXECUTOR_NONZERO_EXIT' } });
  blockedTask(store, 'T-1');

  R.resumeBoth({
    queue, store, dir,
    entry: queue.get(e.entryId),
    standingGrant: GRANT,
    parentAuthorizationId: 'OWNER-R02',
    taskSpecSha256: 'a'.repeat(64),
    reason: 'blocker fixed at source',
  });

  const after = queue.get(e.entryId);
  assert.equal(after.state, 'QUEUED');
  assert.equal(after.resumeFromBlocked, true);
  assert.equal(after.resumeReason, 'blocker fixed at source');
  assert.equal(store.current('T-1').state, 'BLOCKED', 'the task store makes its own transition');
});

test('resume: a queue entry blocked with no task-store record needs no resume flag', () => {
  // Nothing to resume in the task store means nothing to authorize there. The
  // flag says what is true rather than being set unconditionally.
  const { queue, store, dir } = bothStores();
  const e = queue.enqueue({ programId: 'OFFICE', taskId: 'T-NONE', taskClass: 'TEST_ONLY_CHARACTERIZATION', parentAuthorizationId: 'OWNER-R02', taskSpecSha256: 'a'.repeat(64) });
  queue.transition({ entryId: e.entryId, to: 'BLOCKED', expectedPreviousState: 'QUEUED', patch: { blockerCode: 'DISPATCH_PLAN_HASH_CHANGED' } });

  R.resumeBoth({
    queue, store, dir,
    entry: queue.get(e.entryId),
    standingGrant: GRANT,
    parentAuthorizationId: 'OWNER-R02',
    taskSpecSha256: 'a'.repeat(64),
    reason: 'plan corrected',
  });
  assert.equal(queue.get(e.entryId).state, 'QUEUED');
  assert.equal(queue.get(e.entryId).resumeFromBlocked, false);
});

test('reconcile: an AUTHORIZED resume makes a BLOCKED task store expected, not alarming', () => {
  // The two halves of one mechanism were refusing each other: resumeBoth
  // deliberately leaves the task-store edge to runTask (the single writer) and
  // marks the entry, and effectiveState then rejected the run it had just
  // authorized.
  const marked = entry({ state: 'QUEUED', resumeFromBlocked: true });
  const v = R.effectiveState({ entry: marked, task: task('BLOCKED', 'EXECUTOR_NONZERO_EXIT') });
  assert.equal(v.verdict, 'RUNNABLE');
  assert.match(v.reason, /runTask owns that transition/);
});

test('reconcile: the mark is not a bypass — without it, BLOCKED still stops the run', () => {
  const unmarked = entry({ state: 'QUEUED' });
  assert.equal(R.effectiveState({ entry: unmarked, task: task('BLOCKED', 'X') }).verdict, 'TASK_BLOCKED');
  // And an explicit false is the same as absent.
  const denied = entry({ state: 'QUEUED', resumeFromBlocked: false });
  assert.equal(R.effectiveState({ entry: denied, task: task('BLOCKED', 'X') }).verdict, 'TASK_BLOCKED');
});
