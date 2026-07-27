'use strict';
/**
 * Execution recovery — the rule this module exists to enforce is that recovery
 * NEVER starts a second executor. Every test here is either that rule or a
 * consequence of it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Q = require('./queue.cjs');
const R = require('./recovery.cjs');

const dirs = [];
function tmpQueue() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-rec-'));
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
  taskId: 'OFFICE-REC-01',
  taskClass: 'TEST_ONLY_CHARACTERIZATION',
  parentAuthorizationId: 'OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01',
};

/** Drive an entry to a given state through the legal path. */
function drive(q, entryId, target) {
  const PATH = ['QUEUED', 'PLANNING', 'REVIEWING', 'AUTHORIZED', 'PREFLIGHT', 'EXECUTING',
    'VALIDATING', 'PR_OPEN', 'CI_WAITING', 'MERGE_READY', 'MERGING', 'MERGED', 'SYNCING', 'CLEANING'];
  let s = q.get(entryId).state;
  for (const to of PATH.slice(PATH.indexOf(s) + 1)) {
    q.transition({ entryId, to, expectedPreviousState: s });
    s = to;
    if (to === target) return;
  }
}

const DEAD = { pidAlive: () => false };
const ALIVE = { pidAlive: () => true };

test('recovery: an idle entry needs nothing', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  assert.equal(R.classify(q.get(e.entryId), DEAD).verdict, 'HEALTHY');
});

test('recovery: an entry whose worker is alive is never touched', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'EXECUTING');
  R.takeOwnership(q, e.entryId, { pid: 4242 });

  const v = R.classify(q.get(e.entryId), Object.assign({ nowMs: Date.now() }, ALIVE));
  assert.equal(v.verdict, 'OWNER_ALIVE');
  assert.equal(v.rewindTo, null);

  // And reclaim leaves it exactly where it was.
  R.reclaim(q, Object.assign({ nowMs: Date.now() }, ALIVE));
  assert.equal(q.get(e.entryId).state, 'EXECUTING');
});

test('recovery: a recent heartbeat wins even with no live pid — a restart is not a death', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'EXECUTING');
  const now = Date.now();
  R.takeOwnership(q, e.entryId, { pid: 999999, nowMs: now });

  const v = R.classify(q.get(e.entryId), { nowMs: now + 60000, pidAlive: () => false });
  assert.equal(v.verdict, 'OWNER_ALIVE', 'inside the grace window nothing is reclaimed');
});

test('recovery: a dead worker past the grace rewinds to a state a fresh attempt can start from', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'EXECUTING');
  const now = Date.now();
  R.takeOwnership(q, e.entryId, { pid: 999999, nowMs: now });

  const late = now + R.DEFAULT_STALE_AFTER_MS + 1000;
  const v = R.classify(q.get(e.entryId), Object.assign({ nowMs: late }, DEAD));
  assert.equal(v.verdict, 'RECLAIMABLE');
  assert.equal(v.rewindTo, 'AUTHORIZED', 'never resumes mid-execution');

  R.reclaim(q, Object.assign({ nowMs: late }, DEAD));
  const after = q.get(e.entryId);
  assert.equal(after.state, 'AUTHORIZED');
  assert.equal(after.owner, null, 'the dead owner is cleared');
});

test('recovery: an entry that died after the PR opened does not re-run the executor', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'PR_OPEN');
  const now = Date.now();
  R.takeOwnership(q, e.entryId, { pid: 999999, nowMs: now });

  const late = now + R.DEFAULT_STALE_AFTER_MS + 1000;
  const v = R.classify(q.get(e.entryId), Object.assign({ nowMs: late }, DEAD));
  // Rewinding to EXECUTING would open a second PR for the same work.
  assert.equal(v.rewindTo, 'CI_WAITING');
});

test('recovery: dying mid-merge is not guessed at — it is blocked for evidence', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'MERGING');
  const now = Date.now();
  R.takeOwnership(q, e.entryId, { pid: 999999, nowMs: now });

  const late = now + R.DEFAULT_STALE_AFTER_MS + 1000;
  const v = R.classify(q.get(e.entryId), Object.assign({ nowMs: late }, DEAD));
  assert.equal(v.verdict, 'NEEDS_EVIDENCE');
  assert.equal(v.rewindTo, null);

  R.reclaim(q, Object.assign({ nowMs: late }, DEAD));
  const after = q.get(e.entryId);
  assert.equal(after.state, 'BLOCKED');
  assert.equal(after.blockerCode, 'RECOVERY_NEEDS_EVIDENCE');
});

test('recovery: reclaiming twice changes nothing the second time', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'EXECUTING');
  const now = Date.now();
  R.takeOwnership(q, e.entryId, { pid: 999999, nowMs: now });
  const late = now + R.DEFAULT_STALE_AFTER_MS + 1000;

  R.reclaim(q, Object.assign({ nowMs: late }, DEAD));
  const afterFirst = q.get(e.entryId).state;
  R.reclaim(q, Object.assign({ nowMs: late }, DEAD));
  assert.equal(q.get(e.entryId).state, afterFirst, 'recovery is idempotent');
});

test('recovery: a heartbeat refreshes without pretending to advance', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'EXECUTING');
  const t0 = Date.now();
  R.takeOwnership(q, e.entryId, { pid: 1234, nowMs: t0 });
  const beat = R.heartbeat(q, e.entryId, { nowMs: t0 + 5000 });

  assert.equal(beat.state, 'EXECUTING', 'the lifecycle did not move');
  assert.equal(beat.owner.heartbeatAtMs, t0 + 5000);
  assert.equal(beat.owner.pid, 1234, 'ownership is preserved, not replaced');
});

test('recovery: ownership and heartbeats are in the append-only history', () => {
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'EXECUTING');
  R.takeOwnership(q, e.entryId, { pid: 1234 });
  R.heartbeat(q, e.entryId);
  const lines = fs.readFileSync(q.logFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const owned = lines.filter((l) => l.owner && l.owner.pid === 1234);
  assert.ok(owned.length >= 2, 'who held what, and when, is recoverable from the log');
});

test('recovery: a scan reports every entry without mutating any', () => {
  const q = tmpQueue();
  const a = q.enqueue(REQ);
  drive(q, a.entryId, 'EXECUTING');
  const before = q.list().map((x) => x.state);
  const verdicts = R.scan(q, DEAD);
  assert.equal(verdicts.length, 1);
  assert.deepEqual(q.list().map((x) => x.state), before, 'scan is read-only');
});

test('recovery: every active queue state has a defined disposition', () => {
  // A state with no entry in REWIND would fall through to NEEDS_EVIDENCE by
  // accident rather than by decision. This asserts each one was decided.
  for (const s of Q.OCCUPIES_SLOT) {
    assert.ok(Object.prototype.hasOwnProperty.call(R.REWIND, s), 'no disposition decided for ' + s);
  }
});

test('recovery: a live process that has gone silent is reported, never reclaimed', () => {
  // The hard case. Fifteen minutes of silence looks like death, and leaving the
  // entry holds the single slot — but a process that still exists can still be
  // writing to its worktree and still about to open a PR. Reclaiming it is
  // exactly how a second executor gets started.
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'EXECUTING');
  const now = Date.now();
  R.takeOwnership(q, e.entryId, { pid: 4242, nowMs: now });

  const late = now + R.DEFAULT_STALE_AFTER_MS + 60000;
  const v = R.classify(q.get(e.entryId), Object.assign({ nowMs: late }, ALIVE));
  assert.equal(v.verdict, 'OWNER_STALE');
  assert.equal(v.rewindTo, null);
  assert.match(v.reason, /kill the process/, 'the verdict says what a human should do');

  R.reclaim(q, Object.assign({ nowMs: late }, ALIVE));
  assert.equal(q.get(e.entryId).state, 'EXECUTING', 'a live process is never rewound');
  assert.equal(q.get(e.entryId).owner.pid, 4242, 'and it keeps its owner');
});

test('recovery: killing the hung process is what makes it reclaimable', () => {
  // The escalation path: the decision to end a running process stays with a
  // human, and once made, recovery behaves normally.
  const q = tmpQueue();
  const e = q.enqueue(REQ);
  drive(q, e.entryId, 'EXECUTING');
  const now = Date.now();
  R.takeOwnership(q, e.entryId, { pid: 4242, nowMs: now });
  const late = now + R.DEFAULT_STALE_AFTER_MS + 60000;

  R.reclaim(q, Object.assign({ nowMs: late }, ALIVE));
  assert.equal(q.get(e.entryId).state, 'EXECUTING');

  R.reclaim(q, Object.assign({ nowMs: late }, DEAD));
  assert.equal(q.get(e.entryId).state, 'AUTHORIZED');
});
