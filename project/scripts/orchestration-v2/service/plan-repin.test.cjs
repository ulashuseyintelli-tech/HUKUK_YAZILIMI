'use strict';
/**
 * Re-pinning a plan digest that moved for an authorized reason.
 *
 * The property under test is not "the pin can be updated" — it is that
 * updating it still costs everything admission costs. A repin verb that
 * skipped the gates would be a way to run an edited plan under an
 * authorization granted for a different one, which is exactly what the pin
 * exists to prevent.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Q = require('../orchestrator/queue.cjs');
const repin = require('./artefact-repin.cjs');

const dirs = [];
function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-repin-'));
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

const OLD = 'a'.repeat(64);
const NEW = 'b'.repeat(64);

/** A queue holding one entry blocked exactly the way a moved pin blocks it. */
function blockedEntry(over) {
  const queue = Q.createQueue(path.join(tmpdir(), '.queue'));
  const e = queue.enqueue({
    programId: 'ORCHESTRA_OPERATIONAL_CANARY',
    taskId: 'CANARY-REPIN-01',
    taskClass: 'OPERATIONAL_CANARY_EVIDENCE',
    parentAuthorizationId: 'OWNER-GRANT-ORCHESTRA-E2E-ALL-PROGRAMS-R02',
    requestPath: 'requests/x.json',
    taskSpecSha256: OLD,
    executorLane: 'CODEX_LOCAL',
    idempotencyKey: 'k1',
  });
  queue.transition({
    entryId: e.entryId,
    to: 'BLOCKED',
    expectedPreviousState: 'QUEUED',
    patch: { blockerCode: (over && over.blockerCode) || 'DISPATCH_PLAN_HASH_CHANGED' },
  });
  return { queue, entryId: e.entryId };
}

const resolveNew = () => ({
  request: { programId: 'ORCHESTRA_OPERATIONAL_CANARY', taskClass: 'OPERATIONAL_CANARY_EVIDENCE', executorLane: 'CODEX_LOCAL' },
  spec: { taskId: 'CANARY-REPIN-01' },
  standingGrant: {},
  manifest: {},
  taskSpecSha256: NEW,
  artefacts: null,
});

test('an authorized repin moves the pin and records where it came from', () => {
  const { queue, entryId } = blockedEntry();
  const r = repin.repinPlan({
    queue,
    entryId,
    repoCwd: '/nowhere',
    repinAuthority: 'OWNER-DECISION-R04',
    resolve: resolveNew,
    evaluate: () => ({ admissible: true }),
  });
  assert.equal(r.disposition, 'REPINNED', r.refusal + ' ' + r.detail);
  const e = queue.get(entryId);
  assert.equal(e.taskSpecSha256, NEW);
  assert.equal(e.state, 'BLOCKED', 'a repin does not decide that the work may run');
  assert.equal(e.blockerCode, 'DISPATCH_PLAN_HASH_CHANGED', 'and resuming stays a separate act');
  assert.equal(e.planRepin.previousTaskSpecSha256, OLD);
  assert.equal(e.planRepin.authorityRef, 'OWNER-DECISION-R04');
});

test('a plan that no longer passes admission is refused', () => {
  // The gate. Without it this verb would be a way to run an edited plan under
  // an authorization granted for a different one.
  const { queue, entryId } = blockedEntry();
  const r = repin.repinPlan({
    queue,
    entryId,
    repoCwd: '/nowhere',
    repinAuthority: 'OWNER-DECISION-R04',
    resolve: resolveNew,
    evaluate: () => ({ admissible: false, refusal: 'TASK_GRANT_PLAN_HASH_MISMATCH', detail: 'grant pins something else' }),
  });
  assert.equal(r.refusal, 'REPIN_PLAN_NOT_ADMISSIBLE');
  assert.match(r.detail, /TASK_GRANT_PLAN_HASH_MISMATCH/);
  assert.equal(queue.get(entryId).taskSpecSha256, OLD, 'the pin did not move');
});

test('it answers one blocker and refuses every other situation', () => {
  // Not a general "update the entry" verb: an entry blocked for another reason
  // has a different problem, and re-pinning would hide it.
  const { queue, entryId } = blockedEntry({ blockerCode: 'EXECUTOR_NONZERO_EXIT' });
  const r = repin.repinPlan({
    queue, entryId, repoCwd: '/nowhere', repinAuthority: 'X', resolve: resolveNew, evaluate: () => ({ admissible: true }),
  });
  assert.equal(r.refusal, 'REPIN_WRONG_BLOCKER');
  assert.equal(queue.get(entryId).taskSpecSha256, OLD);
});

test('an authority reference is required, and an unchanged pin is a no-op', () => {
  const { queue, entryId } = blockedEntry();
  assert.equal(
    repin.repinPlan({ queue, entryId, repoCwd: '/nowhere', resolve: resolveNew, evaluate: () => ({ admissible: true }) }).refusal,
    'REPIN_AUTHORITY_MISSING',
  );
  const same = repin.repinPlan({
    queue,
    entryId,
    repoCwd: '/nowhere',
    repinAuthority: 'X',
    resolve: () => Object.assign(resolveNew(), { taskSpecSha256: OLD }),
    evaluate: () => ({ admissible: true }),
  });
  assert.equal(same.disposition, 'ALREADY_PINNED');
  assert.equal(same.repinned, false);
});

test('the queue refuses a plan-digest patch nobody authorized', () => {
  // Below the service, so no caller can arrange otherwise. Until this guard
  // existed the plan digest — the identity of the WORK — could be moved by any
  // transition carrying a patch, silently.
  const { queue, entryId } = blockedEntry();
  assert.throws(
    () =>
      queue.transition({
        entryId,
        to: 'BLOCKED',
        expectedPreviousState: 'BLOCKED',
        patch: { taskSpecSha256: NEW },
      }),
    (e) => e.code === 'QUEUE_PLAN_REPIN_NOT_AUTHORIZED',
  );
  assert.equal(queue.get(entryId).taskSpecSha256, OLD);
});
