'use strict';
/**
 * Re-pinning after an authorized artefact correction.
 *
 * The property that makes this safe is AR04: the plan digest must be identical.
 * Everything else here is the fail-closed shell around that one check — because
 * without it, "re-pin" would be a verb that lets any edited task run under an
 * entry that was admitted for something else.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const queueMod = require('../orchestrator/queue.cjs');
const repinMod = require('./artefact-repin.cjs');

const AUTHORITY = 'OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01';
const OLD_DIGEST = 'a'.repeat(64);
const NEW_DIGEST = 'b'.repeat(64);
const PLAN = 'c'.repeat(64);

let seq = 0;
function scratchQueue() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-queue-' + process.pid + '-' + seq++ + '-'));
  return queueMod.createQueue(dir);
}

function mismatchedEntry(queue, o) {
  const opts = o || {};
  const e = queue.enqueue({
    programId: 'DELIVERY_TRUTH',
    taskId: 'AR-' + seq++,
    taskClass: 'BOUNDED_CODE_FIX',
    parentAuthorizationId: 'OWNER-TEST',
    taskSpecSha256: PLAN,
    requestPath: opts.requestPath === undefined ? 'project/docs/governance/coordination-v2/requests/X.json' : opts.requestPath,
    artefactSha256: OLD_DIGEST,
    artefactsCommitted: true,
  });
  queue.transition({
    entryId: e.entryId,
    to: 'BLOCKED',
    expectedPreviousState: 'QUEUED',
    patch: { blockerCode: opts.blockerCode === undefined ? 'ARTEFACT_DIGEST_MISMATCH' : opts.blockerCode },
  });
  return queue.get(e.entryId);
}

/** A resolver standing in for request.load, so no repository is needed. */
const resolver = (over) => () =>
  Object.assign(
    {
      taskSpecSha256: PLAN,
      artefacts: { digest: NEW_DIGEST, refs: ['a.json', 'b.json'], readFromRef: 'origin/main' },
    },
    over || {},
  );

const repin = (queue, entryId, over) =>
  repinMod.repinArtefacts(
    Object.assign({ queue, entryId, repoCwd: process.cwd(), repinAuthority: AUTHORITY, resolve: resolver() }, over || {}),
  );

test('AR01  an authorized re-pin records the new digest and who asked', () => {
  const queue = scratchQueue();
  const entry = mismatchedEntry(queue);
  const events = [];

  const r = repin(queue, entry.entryId, { audit: (n, p) => events.push([n, p]) });

  assert.equal(r.disposition, 'REPINNED');
  assert.equal(r.previousDigest, OLD_DIGEST);
  assert.equal(r.artefactSha256, NEW_DIGEST);
  const after = queue.get(entry.entryId);
  assert.equal(after.artefactSha256, NEW_DIGEST);
  assert.equal(after.artefactRepin.authorityRef, AUTHORITY);
  assert.equal(after.artefactRepin.previousDigest, OLD_DIGEST);
  assert.equal(after.artefactRepin.readFromRef, 'origin/main');
  assert.deepEqual(events.map((e) => e[0]), ['ARTEFACT_REPIN_STARTED', 'ARTEFACT_REPIN_COMPLETED']);
});

test('AR02  re-pinning does not resume the entry', () => {
  // The two acts stay separate on purpose: a re-pin that also restarted work
  // would mean correcting paperwork is enough to make a task run.
  const queue = scratchQueue();
  const entry = mismatchedEntry(queue);

  repin(queue, entry.entryId);

  const after = queue.get(entry.entryId);
  assert.equal(after.state, 'BLOCKED');
  assert.equal(after.blockerCode, 'ARTEFACT_DIGEST_MISMATCH', 'the blocker is kept for the operator to clear');
});

test('AR03  an unauthorized caller is refused, at the function and at the queue', () => {
  const queue = scratchQueue();
  const entry = mismatchedEntry(queue);

  for (const bad of [undefined, null, '', '  ']) {
    assert.equal(repin(queue, entry.entryId, { repinAuthority: bad }).refusal, 'REPIN_AUTHORITY_MISSING', String(bad));
  }
  assert.equal(queue.get(entry.entryId).artefactSha256, OLD_DIGEST);

  // And the pin cannot be moved by a caller who goes around the function.
  assert.throws(
    () =>
      queue.transition({
        entryId: entry.entryId,
        to: 'BLOCKED',
        expectedPreviousState: 'BLOCKED',
        patch: { artefactSha256: NEW_DIGEST },
      }),
    (e) => e.code === 'QUEUE_ARTEFACT_REPIN_NOT_AUTHORIZED',
    'moving the pin is never a side effect of another transition',
  );
});

test('AR04  a changed plan digest is refused — that is different work', () => {
  // The property the whole operation rests on. Same artefacts-around-it may be
  // corrected; the work itself may not change under an entry already admitted
  // to do something else.
  const queue = scratchQueue();
  const entry = mismatchedEntry(queue);

  const r = repin(queue, entry.entryId, { resolve: resolver({ taskSpecSha256: 'd'.repeat(64) }) });

  assert.equal(r.refusal, 'REPIN_TASK_SPEC_CHANGED');
  assert.match(r.detail, /needs its own admission/);
  assert.equal(queue.get(entry.entryId).artefactSha256, OLD_DIGEST, 'the pin did not move');
});

test('AR05  it answers one blocker and nothing else', () => {
  const queue = scratchQueue();

  const other = mismatchedEntry(queue, { blockerCode: 'REQUIRED_TEST_FAILED' });
  assert.equal(repin(queue, other.entryId).refusal, 'REPIN_WRONG_BLOCKER');

  const noPath = mismatchedEntry(queue, { requestPath: null });
  assert.equal(repin(queue, noPath.entryId).refusal, 'REPIN_NO_REQUEST_PATH');

  // Not blocked at all.
  const running = queue.enqueue({
    programId: 'DELIVERY_TRUTH',
    taskId: 'AR05-QUEUED',
    taskClass: 'BOUNDED_CODE_FIX',
    parentAuthorizationId: 'OWNER-TEST',
    artefactSha256: OLD_DIGEST,
  });
  assert.equal(repin(queue, running.entryId).refusal, 'REPIN_STATE_NOT_BLOCKED');

  assert.equal(repin(queue, 'no-such-entry').refusal, 'REPIN_ENTRY_UNKNOWN');
});

test('AR06  re-pinning twice is idempotent', () => {
  const queue = scratchQueue();
  const entry = mismatchedEntry(queue);

  repin(queue, entry.entryId);
  const records = fs.readFileSync(queue.logFile, 'utf8').split('\n').filter(Boolean).length;

  const second = repin(queue, entry.entryId);
  assert.equal(second.disposition, 'ALREADY_PINNED');
  assert.equal(second.repinned, false);
  assert.equal(fs.readFileSync(queue.logFile, 'utf8').split('\n').filter(Boolean).length, records, 'nothing written');
});

test('AR07  unreadable artefacts refuse rather than clear the pin', () => {
  const queue = scratchQueue();
  const entry = mismatchedEntry(queue);

  const thrown = repin(queue, entry.entryId, {
    resolve: () => {
      const e = new Error('not present at origin/main');
      e.code = 'ARTEFACT_NOT_COMMITTED';
      throw e;
    },
  });
  assert.equal(thrown.refusal, 'REPIN_ARTEFACTS_UNREADABLE');
  assert.match(thrown.detail, /ARTEFACT_NOT_COMMITTED/);

  const empty = repin(queue, entry.entryId, { resolve: resolver({ artefacts: { digest: null, refs: [], readFromRef: null } }) });
  assert.equal(empty.refusal, 'REPIN_ARTEFACTS_UNREADABLE');

  assert.equal(queue.get(entry.entryId).artefactSha256, OLD_DIGEST, 'the old pin survives every refusal');
});

test('AR08  the history keeps both digests', () => {
  const queue = scratchQueue();
  const entry = mismatchedEntry(queue);
  repin(queue, entry.entryId);

  const log = fs.readFileSync(queue.logFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
    .filter((r) => r.entryId === entry.entryId);
  assert.ok(log.some((r) => r.artefactSha256 === OLD_DIGEST), 'what it was admitted with is still readable');
  assert.equal(log[log.length - 1].artefactSha256, NEW_DIGEST);
  assert.deepEqual(log.map((r) => r.state), ['QUEUED', 'BLOCKED', 'BLOCKED']);
});
