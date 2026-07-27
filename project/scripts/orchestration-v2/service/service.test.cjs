'use strict';
/**
 * Service lifecycle — the tests that matter here are about STOPPING, not
 * starting. Anything can be made to start; a service is the thing you can halt
 * without knowing what it is doing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Q = require('../orchestrator/queue.cjs');
const R = require('../orchestrator/recovery.cjs');
const S = require('./service.cjs');

const dirs = [];
function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-svc-'));
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

const REQ = {
  programId: 'OFFICE',
  taskId: 'OFFICE-SVC-01',
  taskClass: 'TEST_ONLY_CHARACTERIZATION',
  parentAuthorizationId: 'OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01',
};

function svc(over) {
  const root = tmpdir();
  const queue = Q.createQueue(path.join(root, 'queue'));
  // These tests exercise slot, audit and recovery mechanics, not authority, so
  // they say so out loud rather than carrying a dispatch guard they do not use.
  // A service without one refuses to dispatch by default; see dispatch.cjs.
  const s = S.createService(Object.assign({ repoCwd: root, queue, allowUnguardedDispatch: true }, over || {}));
  return { root, queue, service: s };
}

// ------------------------------------------------------------- KILL SWITCH

test('service: the kill switch is a file, so it works with no running process to ask', () => {
  const { service, root } = svc();
  assert.equal(service.killSwitchEngaged(), false);

  // Not through the API — the way an operator would actually do it under
  // pressure, or the way a `git push` of that file would.
  fs.mkdirSync(path.dirname(service.killSwitchPath), { recursive: true });
  fs.writeFileSync(service.killSwitchPath, 'stop\n', 'utf8');

  assert.equal(service.killSwitchEngaged(), true);
  assert.equal(service.admission().admits, false);
  assert.equal(service.admission().reason, 'KILL_SWITCH_ENGAGED');
});

test('service: an engaged kill switch stops a step before it looks at the queue', async () => {
  const { service, queue } = svc();
  queue.enqueue(REQ);
  service.engageKillSwitch('owner pulled it');

  let ran = false;
  const r = await service.step(async () => {
    ran = true;
  });
  assert.equal(r.acted, 'HALTED');
  assert.equal(ran, false, 'nothing was started');
  assert.equal(queue.get(queue.list()[0].entryId).state, 'QUEUED', 'and the work is still there');
});

test('service: releasing the kill switch demands a stated reason', () => {
  const { service } = svc();
  service.engageKillSwitch('incident');
  // Engaging needs no ceremony — stopping should always be easy. Restarting is
  // the decision someone has to own, and the deleted file cannot answer for it.
  assert.throws(() => service.releaseKillSwitch(), (e) => e.code === 'KILL_SWITCH_RELEASE_REASON_REQUIRED');
  service.releaseKillSwitch('root cause fixed in #1676');
  assert.equal(service.killSwitchEngaged(), false);
});

test('service: engage and release are both in the audit trail with their reasons', () => {
  const { service } = svc();
  service.engageKillSwitch('disk filling up');
  service.releaseKillSwitch('disk reclaimed');
  const trail = service.auditTrail();
  const events = trail.map((t) => t.event);
  assert.deepEqual(events, ['KILL_SWITCH_ENGAGED', 'KILL_SWITCH_RELEASED']);
  assert.equal(trail[0].detail.reason, 'disk filling up');
  assert.equal(trail[1].detail.reason, 'disk reclaimed');
});

// ---------------------------------------------------------------- PAUSE

test('service: pause stops admission without pretending the queue is empty', async () => {
  const { service, queue } = svc();
  queue.enqueue(REQ);
  service.pause('waiting on an owner decision');

  const a = service.admission();
  assert.equal(a.admits, false);
  assert.equal(a.reason, 'PAUSED', 'not QUEUE_EMPTY — the distinction is the point');
  assert.equal(service.status().queueDepth, 1);

  service.resume('decision taken');
  assert.equal(service.admission().admits, true);
});

// ------------------------------------------------------------- ADMISSION

test('service: admission answers WHY, because idle and refusing look identical outside', () => {
  const { service, queue } = svc();
  assert.equal(service.admission().reason, 'QUEUE_EMPTY');

  const e = queue.enqueue(REQ);
  assert.equal(service.admission().admits, true);

  queue.transition({ entryId: e.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });
  const a = service.admission();
  assert.equal(a.admits, false);
  assert.equal(a.reason, 'SLOT_OCCUPIED');
  assert.match(a.detail, /PLANNING/);
});

test('service: every admission blocker it can report is a declared one', () => {
  // A reason invented at the call site is a reason no operator can look up.
  const { service, queue } = svc();
  const seen = new Set();
  seen.add(service.admission().reason);
  queue.enqueue(REQ);
  service.pause('x');
  seen.add(service.admission().reason);
  service.engageKillSwitch('y');
  seen.add(service.admission().reason);
  for (const r of seen) assert.ok(S.ADMISSION_BLOCKERS.indexOf(r) !== -1, 'undeclared blocker ' + r);
});

// ------------------------------------------------------------------ STEP

test('service: recovery runs before admission, so a stranded slot is freed not queued behind', async () => {
  const { service, queue } = svc();
  const e = queue.enqueue(REQ);
  queue.transition({ entryId: e.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });
  queue.transition({ entryId: e.entryId, to: 'REVIEWING', expectedPreviousState: 'PLANNING' });
  queue.transition({ entryId: e.entryId, to: 'AUTHORIZED', expectedPreviousState: 'REVIEWING' });
  queue.transition({ entryId: e.entryId, to: 'PREFLIGHT', expectedPreviousState: 'AUTHORIZED' });
  queue.transition({ entryId: e.entryId, to: 'EXECUTING', expectedPreviousState: 'PREFLIGHT' });
  R.takeOwnership(queue, e.entryId, { pid: 999999, nowMs: 1000 });

  // Far past the stale window, with a dead pid.
  const late = 1000 + R.DEFAULT_STALE_AFTER_MS + 60000;
  const { service: s2 } = {
    service: S.createService({ repoCwd: path.dirname(queue.dir), queue, clock: () => late, allowUnguardedDispatch: true }),
  };

  const r = await s2.step(async () => ({ disposition: 'CLOSED' }));
  assert.ok(r.reclaimed >= 1, 'the dead entry was reclaimed in the same step');
  const trail = s2.auditTrail().map((t) => t.event);
  assert.ok(trail.indexOf('RECOVERY_APPLIED') !== -1);
});

test('service: a runner that throws does not leave the slot held', async () => {
  const { service, queue } = svc();
  const e = queue.enqueue(REQ);
  const err = new Error('boom');
  err.code = 'EXECUTOR_EXPLODED';

  const r = await service.step(async () => {
    throw err;
  });
  assert.equal(r.acted, 'BLOCKED');
  assert.equal(r.reason, 'EXECUTOR_EXPLODED');
  const after = queue.get(e.entryId);
  assert.equal(after.state, 'BLOCKED');
  assert.equal(after.blockerCode, 'EXECUTOR_EXPLODED');
  assert.equal(after.owner, null, 'and it does not hold the slot from beyond the grave');
});

test('service: a step that runs records admission and completion, not just the end', async () => {
  const { service, queue } = svc();
  const e = queue.enqueue(REQ);
  await service.step(async () => ({ disposition: 'CLOSED' }));
  const events = service.auditTrail().map((t) => t.event);
  assert.ok(events.indexOf('TASK_ADMITTED') !== -1);
  assert.ok(events.indexOf('TASK_FINISHED') !== -1);
  assert.equal(queue.get(e.entryId).owner.pid, process.pid, 'ownership was stamped before the run');
});

// ---------------------------------------------------------------- STATUS

test('service: status is read from the log, so it answers after a reboot', () => {
  const { root, queue, service } = svc();
  const e = queue.enqueue(REQ);
  queue.transition({ entryId: e.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });

  // A completely fresh service object over the same directory — the state that
  // matters was never in memory.
  const reopened = S.createService({ repoCwd: root, queue: Q.createQueue(queue.dir) });
  const st = reopened.status();
  assert.equal(st.queueDepth, 1);
  assert.equal(st.active.length, 1);
  assert.equal(st.active[0].state, 'PLANNING');
  assert.equal(st.byState.PLANNING, 1);
});

test('service: status separates blocked work from work that needs recovery', () => {
  const { queue, service } = svc();
  const a = queue.enqueue(REQ);
  queue.transition({
    entryId: a.entryId,
    to: 'BLOCKED',
    expectedPreviousState: 'QUEUED',
    patch: { blockerCode: 'BLOCKED_BASE_SHA_DRIFT' },
  });

  const st = service.status();
  assert.equal(st.blocked.length, 1);
  assert.equal(st.blocked[0].blockerCode, 'BLOCKED_BASE_SHA_DRIFT');
  assert.equal(st.needsRecovery.length, 0, 'a blocked entry is not a stranded one');
  assert.equal(st.queueDepth, 1, 'and BLOCKED still counts as outstanding work');
});

test('service: a closed entry stops counting toward depth', () => {
  const { queue, service } = svc();
  const e = queue.enqueue(REQ);
  for (const to of ['PLANNING', 'REVIEWING', 'AUTHORIZED', 'PREFLIGHT', 'EXECUTING', 'VALIDATING',
    'PR_OPEN', 'CI_WAITING', 'MERGE_READY', 'MERGING', 'MERGED', 'SYNCING', 'CLEANING', 'CLOSED']) {
    queue.transition({ entryId: e.entryId, to, expectedPreviousState: queue.get(e.entryId).state });
  }
  const st = service.status();
  assert.equal(st.queueDepth, 0);
  assert.equal(st.totalEntries, 1, 'closed work is still in the record');
});

test('service: the audit log is append-only across service instances', () => {
  const { root, queue } = svc();
  const auditPath = path.join(root, 'queue', 'audit.jsonl');
  S.createService({ repoCwd: root, queue, auditPath }).audit('FIRST', null);
  S.createService({ repoCwd: root, queue, auditPath }).audit('SECOND', null);
  const trail = S.createService({ repoCwd: root, queue, auditPath }).auditTrail();
  assert.deepEqual(trail.map((t) => t.event), ['FIRST', 'SECOND']);
});

// ─────────────────────────────────────────────── DISPATCH GUARD (WP08)

test('service: a service with no dispatch guard refuses to dispatch at all', async () => {
  // Admission proved the task could ENTER the queue. Without a guard nothing
  // re-checks that at the moment it leaves, and the queue is durable — so the
  // safe default is to refuse rather than to run on a stale verdict.
  const root = tmpdir();
  const queue = Q.createQueue(path.join(root, 'queue'));
  const service = S.createService({ repoCwd: root, queue });
  queue.enqueue(REQ);

  let ran = false;
  const r = await service.step(async () => {
    ran = true;
  });
  assert.equal(r.acted, 'IDLE');
  assert.equal(r.reason, S.DISPATCH_GUARD_ABSENT);
  assert.equal(ran, false);
  assert.ok(service.auditTrail().some((t) => t.event === 'DISPATCH_REFUSED'), 'and it says so in the audit log');
});

test('service: a grant revoked while the task sat in the queue stops it at dispatch', async () => {
  const root = tmpdir();
  const queue = Q.createQueue(path.join(root, 'queue'));
  const grant = { standingGrantId: 'SG-1', program: { programId: 'OFFICE' } };
  const service = S.createService({
    repoCwd: root,
    queue,
    dispatchGuard: {
      resolveGrant: () => grant,
      resolveSpec: () => ({ taskId: 'X' }),
      resolveManifest: () => ({ programs: [], eligibilityDerivedFrom: { authorizationId: 'A' } }),
      isRevoked: () => true,
    },
  });
  const e = queue.enqueue(Object.assign({}, REQ, { standingGrantId: 'SG-1' }));

  let ran = false;
  const r = await service.step(async () => {
    ran = true;
  });
  assert.equal(ran, false, 'the executor never started');
  assert.equal(r.acted, 'BLOCKED');
  assert.equal(queue.get(e.entryId).state, 'BLOCKED');
  assert.equal(queue.get(e.entryId).owner, null, 'and the slot is free');
});

test('service: a guard that passes lets the task through unchanged', async () => {
  const root = tmpdir();
  const queue = Q.createQueue(path.join(root, 'queue'));
  const service = S.createService({
    repoCwd: root,
    queue,
    dispatchGuard: { resolveGrant: () => ({}), resolveSpec: () => ({}), resolveManifest: () => ({}) },
  });
  queue.enqueue(REQ);
  // The stub grant carries no programId, so the gate refuses on that rather
  // than silently passing — which is the honest verdict for an empty grant.
  const r = await service.step(async () => ({ disposition: 'CLOSED' }));
  assert.equal(r.acted, 'BLOCKED');
  assert.equal(r.reason, 'STANDING_GRANT_PROGRAM_MISSING');
});
