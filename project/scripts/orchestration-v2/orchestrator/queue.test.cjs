'use strict';
/**
 * Durable queue — the properties an operational service depends on.
 *
 * Not "does it store rows": whether a duplicate enqueue is a no-op, whether the
 * slot is genuinely serial, whether a restart reads back the same queue, and
 * whether an illegal move is refused rather than absorbed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Q = require('./queue.cjs');

const dirs = [];
function tmpQueue() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-q-'));
  dirs.push(d);
  return Q.createQueue(d);
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

const REQ = {
  programId: 'OFFICE',
  taskId: 'OFFICE-DEMO-01',
  taskClass: 'TEST_ONLY_CHARACTERIZATION',
  parentAuthorizationId: 'OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01',
  standingGrantId: 'STANDING-GRANT-OFFICE-LIVE-R01',
  taskSpecSha256: 'a'.repeat(64),
};

test('queue: an entry is admitted with the identity a service needs to resume it', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  assert.equal(e.state, 'QUEUED');
  assert.equal(e.programId, 'OFFICE');
  assert.equal(e.parentAuthorizationId, REQ.parentAuthorizationId);
  assert.equal(e.standingGrantId, REQ.standingGrantId);
  assert.equal(e.attempts, 0);
  assert.match(e.idempotencyKey, /^[0-9a-f]{64}$/);
});

test('queue: enqueueing the same work twice yields one entry, not two', () => {
  const q = tmpQueue();
  const first = q.enqueue(REQ);
  const second = q.enqueue(REQ);
  assert.equal(second.entryId, first.entryId);
  assert.equal(second.deduplicated, true);
  assert.equal(q.depth().total, 1);
});

test('queue: different work is not deduplicated', () => {
  const q = tmpQueue();
  q.enqueue(REQ);
  q.enqueue(Object.assign({}, REQ, { taskId: 'OFFICE-DEMO-02' }));
  assert.equal(q.depth().total, 2);
});

test('queue: a request missing its authorization identity is refused', () => {
  const q = tmpQueue();
  for (const missing of ['programId', 'taskId', 'taskClass', 'parentAuthorizationId']) {
    const bad = Object.assign({}, REQ);
    delete bad[missing];
    assert.throws(() => q.enqueue(bad), (e) => e.code === 'QUEUE_REQUEST_INVALID', missing);
  }
});

test('queue: the slot is serial — nothing is head while an entry is active', () => {
  const q = tmpQueue();
  const a = q.enqueue(REQ);
  q.enqueue(Object.assign({}, REQ, { taskId: 'OFFICE-DEMO-02' }));
  assert.equal(q.head().entryId, a.entryId);

  q.transition({ entryId: a.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });
  assert.equal(q.head(), null, 'a second entry may not start while one is in flight');
  assert.equal(q.active().entryId, a.entryId);
});

test('queue: order is priority then arrival', () => {
  const q = tmpQueue();
  q.enqueue(Object.assign({}, REQ, { taskId: 'T-LATE', priority: 100, nowMs: 1000 }));
  const urgent = q.enqueue(Object.assign({}, REQ, { taskId: 'T-URGENT', priority: 10, nowMs: 2000 }));
  assert.equal(q.head().entryId, urgent.entryId);
});

test('queue: an entry waits for its dependencies to close', () => {
  const q = tmpQueue();
  const first = q.enqueue(Object.assign({}, REQ, { taskId: 'T-FIRST' }));
  q.enqueue(Object.assign({}, REQ, { taskId: 'T-SECOND', dependsOn: ['T-FIRST'] }));
  assert.equal(q.head().taskId, 'T-FIRST');

  // Walk the first entry all the way to CLOSED.
  let s = 'QUEUED';
  for (const to of ['PLANNING', 'REVIEWING', 'AUTHORIZED', 'PREFLIGHT', 'EXECUTING', 'VALIDATING',
    'PR_OPEN', 'CI_WAITING', 'MERGE_READY', 'MERGING', 'MERGED', 'SYNCING', 'CLEANING', 'CLOSED']) {
    q.transition({ entryId: first.entryId, to, expectedPreviousState: s });
    s = to;
  }
  assert.equal(q.head().taskId, 'T-SECOND');
});

test('queue: an illegal transition is refused, not absorbed', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  assert.throws(
    () => q.transition({ entryId: e.entryId, to: 'MERGED', expectedPreviousState: 'QUEUED' }),
    (x) => x.code === 'QUEUE_TRANSITION_FORBIDDEN',
  );
  assert.throws(
    () => q.transition({ entryId: e.entryId, to: 'PLANNING', expectedPreviousState: 'EXECUTING' }),
    (x) => x.code === 'QUEUE_CAS_MISMATCH',
  );
});

test('queue: a failing check returns to repair inside the same entry', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  let s = 'QUEUED';
  for (const to of ['PLANNING', 'REVIEWING', 'AUTHORIZED', 'PREFLIGHT', 'EXECUTING', 'VALIDATING', 'PR_OPEN', 'CI_WAITING']) {
    q.transition({ entryId: e.entryId, to, expectedPreviousState: s });
    s = to;
  }
  // CI failure is not a stop condition: repair, re-execute, continue.
  q.transition({ entryId: e.entryId, to: 'CI_FAILED', expectedPreviousState: 'CI_WAITING' });
  q.transition({ entryId: e.entryId, to: 'REPAIRING', expectedPreviousState: 'CI_FAILED' });
  const back = q.transition({ entryId: e.entryId, to: 'EXECUTING', expectedPreviousState: 'REPAIRING' });
  assert.equal(back.state, 'EXECUTING');
  assert.equal(back.attempts, 2, 'a repair round counts as another attempt');
});

test('queue: a blocked entry does not silently retry', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  q.transition({ entryId: e.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });
  q.transition({ entryId: e.entryId, to: 'BLOCKED', expectedPreviousState: 'PLANNING', patch: { blockerCode: 'SOMETHING' } });

  assert.throws(
    () => q.transition({ entryId: e.entryId, to: 'QUEUED', expectedPreviousState: 'BLOCKED' }),
    (x) => x.code === 'QUEUE_RESUME_NOT_AUTHORIZED',
  );
  const resumed = q.transition({
    entryId: e.entryId, to: 'QUEUED', expectedPreviousState: 'BLOCKED', resumeAuthorized: true,
  });
  assert.equal(resumed.state, 'QUEUED');
  assert.equal(resumed.blockerCode, null);
});

test('queue: a terminal entry cannot be moved', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  q.transition({ entryId: e.entryId, to: 'CANCELLED', expectedPreviousState: 'QUEUED' });
  assert.throws(
    () => q.transition({ entryId: e.entryId, to: 'QUEUED', expectedPreviousState: 'CANCELLED' }),
    (x) => x.code === 'QUEUE_STATE_TERMINAL' || x.code === 'QUEUE_TRANSITION_FORBIDDEN',
  );
});

test('queue: a restart reads back the same queue', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  q.transition({ entryId: e.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });

  // A fresh handle over the same directory — this is what a restarted worker does.
  const reopened = Q.createQueue(q.dir);
  const seen = reopened.get(e.entryId);
  assert.equal(seen.state, 'PLANNING');
  assert.equal(seen.taskId, REQ.taskId);
  assert.equal(reopened.active().entryId, e.entryId);
  // And it still refuses to start a second entry.
  reopened.enqueue(Object.assign({}, REQ, { taskId: 'OFFICE-DEMO-02' }));
  assert.equal(reopened.head(), null);
});

test('queue: the log is append-only — history is not rewritten', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  q.transition({ entryId: e.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });
  q.transition({ entryId: e.entryId, to: 'REVIEWING', expectedPreviousState: 'PLANNING' });
  const lines = fs.readFileSync(q.logFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.state), ['QUEUED', 'PLANNING', 'REVIEWING']);
});

test('queue: depth answers what an operator asks first', () => {
  const q = tmpQueue();
  const a = q.enqueue(REQ);
  q.enqueue(Object.assign({}, REQ, { taskId: 'T-2' }));
  q.transition({ entryId: a.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });
  const d = q.depth();
  assert.equal(d.total, 2);
  assert.equal(d.queued, 1);
  assert.equal(d.active, 1);
});

test('queue: the lifecycle covers every stage the directive names', () => {
  for (const s of ['QUEUED', 'PLANNING', 'REVIEWING', 'AUTHORIZED', 'PREFLIGHT', 'EXECUTING',
    'VALIDATING', 'PR_OPEN', 'CI_WAITING', 'CI_FAILED', 'REPAIRING', 'MERGE_READY', 'MERGING',
    'MERGED', 'SYNCING', 'CLEANING', 'CLOSED', 'BLOCKED', 'FAILED', 'CANCELLED']) {
    assert.ok(Q.QUEUE_STATES.includes(s), s);
  }
  // BLOCKED is recoverable; the other three are not.
  assert.deepEqual(Q.QUEUE_TERMINAL, ['CLOSED', 'FAILED', 'CANCELLED']);
  assert.ok(!Q.QUEUE_TERMINAL.includes('BLOCKED'));
});
