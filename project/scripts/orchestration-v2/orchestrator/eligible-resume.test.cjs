'use strict';
/**
 * ELIGIBLE resume recovery.
 *
 * One property: a task left at ELIGIBLE can be picked up again, and picking it
 * up can never produce a second executor. Everything else here is a way that
 * could go wrong.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('./eligible-resume.cjs');

const NOW = 1_700_000_000_000;
const eligible = (over) => Object.assign({ taskId: 'T-1', state: 'ELIGIBLE', taskAttemptId: 'old-attempt', payload: {} }, over || {});
const entry = (over) => Object.assign({ entryId: 'e1', taskId: 'T-1', state: 'QUEUED', owner: null }, over || {});
const DEAD = () => false;
const ALIVE = () => true;

function assess(over) {
  return E.assessResume(Object.assign({ taskRecord: eligible(), queueEntry: entry(), isAlive: DEAD, nowMs: NOW }, over || {}));
}

// ─────────────────────────────────────────────────────────── THE HAPPY CASE

test('ELIGIBLE + no live executor is safely claimable', () => {
  const v = assess();
  assert.equal(v.resumable, true);
  assert.equal(v.refusal, null);
  assert.equal(v.from, 'ELIGIBLE');
  assert.equal(v.previousAttemptId, 'old-attempt', 'the attempt that died is named');
});

test('a state other than ELIGIBLE is not this path', () => {
  for (const s of ['DECLARED', 'AUTHORIZED', 'CLAIMED', 'BLOCKED', 'CLOSED']) {
    assert.equal(assess({ taskRecord: eligible({ state: s }) }).refusal, 'NOT_ELIGIBLE', s);
  }
  assert.equal(assess({ taskRecord: null }).refusal, 'NOT_ELIGIBLE');
});

// ───────────────────────────────────────────── NEVER A SECOND EXECUTOR

test('ELIGIBLE + a live lease held by someone else is refused', () => {
  const v = assess({
    leaseRecord: { state: 'HELD', holder: 'CODEX_LOCAL', expiresAt: new Date(NOW + 60000).toISOString() },
  });
  assert.equal(v.refusal, 'LIVE_EXECUTOR_HOLDS_LEASE');
  assert.match(v.reason, /CODEX_LOCAL/);
});

test('ELIGIBLE + a live PID is refused even though the lease lapsed', () => {
  // Liveness beats staleness. A lease TTL that expired while the process kept
  // working is not permission to start a second one.
  const v = assess({
    leaseRecord: { state: 'HELD', holder: 'CODEX_LOCAL', expiresAt: new Date(NOW - 60000).toISOString() },
    queueEntry: entry({ owner: { pid: 4242, heartbeatAtMs: NOW - 3600_000 } }),
    isAlive: ALIVE,
  });
  assert.equal(v.refusal, 'LIVE_EXECUTOR_PROCESS');
  assert.match(v.reason, /lapsed lease is not permission/);
});

test('ELIGIBLE + a stale heartbeat but a live PID is still no takeover', () => {
  const v = assess({
    queueEntry: entry({ owner: { pid: 4242, heartbeatAtMs: NOW - 24 * 3600_000 } }),
    isAlive: ALIVE,
  });
  assert.equal(v.resumable, false);
  assert.equal(v.refusal, 'LIVE_EXECUTOR_PROCESS');
});

test('ELIGIBLE + a dead PID recovers deterministically', () => {
  const v = assess({
    leaseRecord: { state: 'RELEASED', holder: 'CODEX_LOCAL', expiresAt: new Date(NOW - 1).toISOString() },
    queueEntry: entry({ owner: { pid: 999999, heartbeatAtMs: NOW - 3600_000 } }),
    isAlive: DEAD,
  });
  assert.equal(v.resumable, true);
});

test('an unparseable lease expiry is treated as live, not as permission', () => {
  const v = assess({ leaseRecord: { state: 'HELD', holder: 'X', expiresAt: 'not-a-date' } });
  assert.equal(v.refusal, 'LIVE_EXECUTOR_HOLDS_LEASE');
});

// ─────────────────────────────────────────────────── AUTHORITY, RE-READ NOW

test('ELIGIBLE + a revoked grant is refused', () => {
  assert.equal(assess({ grantRevoked: true }).refusal, 'STANDING_GRANT_REVOKED');
});

test('ELIGIBLE + a program that is no longer eligible is refused', () => {
  assert.equal(assess({ programEligible: false }).refusal, 'PROGRAM_NOT_ELIGIBLE');
  // Undefined is not false: a caller that does not supply it has not asserted
  // ineligibility, and inventing one would be this module deciding policy.
  assert.equal(assess({ programEligible: undefined }).resumable, true);
});

test('ELIGIBLE + the kill switch beats everything else', () => {
  const v = assess({ killSwitchEngaged: true, grantRevoked: true, programEligible: false });
  assert.equal(v.refusal, 'KILL_SWITCH_ENGAGED', 'the most overriding answer wins');
});

test('ELIGIBLE + a plan edited since admission is refused', () => {
  const v = assess({
    taskRecord: eligible({ payload: { taskSpecSha256: 'a'.repeat(64) } }),
    expectedTaskSpecSha256: 'a'.repeat(64),
    actualTaskSpecSha256: 'b'.repeat(64),
  });
  assert.equal(v.refusal, 'PLAN_HASH_MISMATCH');
});

test('ELIGIBLE + a different parent authorization is refused', () => {
  assert.equal(
    assess({ expectedParentAuthorizationId: 'OWNER-R02', parentAuthorizationId: 'OWNER-SOMETHING-ELSE' }).refusal,
    'PARENT_AUTHORIZATION_MISMATCH',
  );
});

test('ELIGIBLE + a different executor lane is a different run, not a continuation', () => {
  assert.equal(assess({ expectedLane: 'CODEX_LOCAL', actualLane: 'CLAUDE_LOCAL' }).refusal, 'EXECUTOR_LANE_CHANGED');
  assert.equal(assess({ expectedLane: 'CODEX_LOCAL', actualLane: 'CODEX_LOCAL' }).resumable, true);
});

test('ELIGIBLE + a queue entry for another task is refused on identity', () => {
  assert.equal(assess({ queueEntry: entry({ taskId: 'T-OTHER' }), taskId: 'T-1' }).refusal, 'TASK_IDENTITY_MISMATCH');
});

// ────────────────────────────────────────────────────── STORE DISAGREEMENT

test('ELIGIBLE in the task store while the queue says finished is a disagreement', () => {
  for (const s of ['CLOSED', 'FAILED', 'CANCELLED']) {
    const v = assess({ queueEntry: entry({ state: s }) });
    assert.equal(v.refusal, 'STORE_DISAGREEMENT', s);
    assert.match(v.reason, new RegExp(s));
  }
});

test('every refusal it can return is a declared one', () => {
  // A refusal invented at the call site is one no operator can look up.
  const cases = [
    {},
    { taskRecord: eligible({ state: 'CLOSED' }) },
    { killSwitchEngaged: true },
    { grantRevoked: true },
    { programEligible: false },
    { expectedParentAuthorizationId: 'A', parentAuthorizationId: 'B' },
    { queueEntry: entry({ taskId: 'X' }), taskId: 'T-1' },
    { expectedTaskSpecSha256: 'a'.repeat(64), actualTaskSpecSha256: 'b'.repeat(64) },
    { expectedLane: 'A', actualLane: 'B' },
    { queueEntry: entry({ state: 'CLOSED' }) },
    { leaseRecord: { state: 'HELD', holder: 'X', expiresAt: new Date(NOW + 1000).toISOString() } },
    { queueEntry: entry({ owner: { pid: 1 } }), isAlive: ALIVE },
  ];
  for (const c of cases) {
    const v = assess(c);
    if (v.refusal !== null) assert.ok(E.REFUSALS.indexOf(v.refusal) !== -1, 'undeclared refusal ' + v.refusal);
  }
});

// ─────────────────────────────────────────────────────────── IDEMPOTENCE

test('asking twice gives the same answer and changes nothing', () => {
  // assessResume is pure apart from the liveness probe, so a duplicate resume
  // command cannot half-apply anything.
  const a = assess();
  const b = assess();
  assert.deepEqual(a, b);
});

// ──────────────────────────────────────────────────────── RESUME EVIDENCE

test('the resume records where it came from, on whose authority, and under a NEW attempt', () => {
  // A resume that reuses the old attempt id is indistinguishable in the log
  // from the attempt that died.
  const ev = E.resumeEvidence({
    attemptId: 'new-attempt',
    previousAttemptId: 'old-attempt',
    parentAuthorizationId: 'OWNER-GRANT-ORCHESTRA-E2E-ALL-PROGRAMS-R02',
    reason: 'interrupted before the lease was taken',
    nowMs: NOW,
  });
  assert.equal(ev.resumedFromState, 'ELIGIBLE');
  assert.equal(ev.attemptId, 'new-attempt');
  assert.notEqual(ev.attemptId, ev.previousAttemptId);
  assert.equal(ev.previousAttemptId, 'old-attempt');
  assert.equal(ev.resumeAuthorizedBy, 'OWNER-GRANT-ORCHESTRA-E2E-ALL-PROGRAMS-R02');
  assert.equal(ev.revalidatedAtMs, NOW);
  assert.match(ev.resumedReason, /lease/);
});
