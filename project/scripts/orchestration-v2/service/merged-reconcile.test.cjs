'use strict';
/**
 * The merged-PR reconciliation path.
 *
 * These tests are written against a proven deadlock rather than a hypothetical
 * one. A foreign entry sat BLOCKED with its pull request already merged; every
 * legal way out of BLOCKED described something that had not happened; the drain
 * kept selecting it, retrying, re-blocking, and no unrelated queued work ran.
 *
 * The two that matter most are MR05 and MR12. MR05 is the case where saying
 * "merged" would be a lie — GitHub closed the PR without merging it — and MR12
 * is the case where saying "cancelled" would be a lie. Between them they hold
 * the shape of the whole module: this path exists to record a fact, and a path
 * that records facts is only worth having if it refuses to record non-facts.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const queueMod = require('../orchestrator/queue.cjs');
const finalizeMod = require('./finalize.cjs');
const reconcileMod = require('./merged-reconcile.cjs');

const AUTHORITY = 'OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01';
const MERGE_SHA = '7854504b25ef1c988606b1885d1562ef44ce54aa';
const HEAD_SHA = 'c04c3aaf8d9dcca31b5a72011ee8096272b76bec';

let seq = 0;
function scratchQueue() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-queue-' + process.pid + '-' + seq++ + '-'));
  return queueMod.createQueue(dir);
}

/** An entry parked in BLOCKED with a durable handoff — the deadlock's shape. */
function blockedEntry(queue, o) {
  const opts = o || {};
  const e = queue.enqueue({
    programId: 'CANARY',
    taskId: opts.taskId || 'TASK-' + seq++,
    taskClass: 'BOUNDED_CODE_FIX',
    parentAuthorizationId: 'OWNER-TEST',
  });
  queue.transition({
    entryId: e.entryId,
    to: 'BLOCKED',
    expectedPreviousState: 'QUEUED',
    patch: {
      blockerCode: opts.blockerCode || 'ATTESTATION_INVALIDATED',
      prNumber: opts.prNumber === undefined ? 1750 : opts.prNumber,
      handoff:
        opts.handoff === null
          ? null
          : Object.assign(
              {
                prNumber: opts.prNumber === undefined ? 1750 : opts.prNumber,
                prHeadSha: HEAD_SHA,
                targetBranch: 'main',
                branch: 'orchestrator/canary-r03',
                attestation: { ok: true },
                taskSchemaVersion: 1,
                deliveryContract: null,
                deliveryContractSha256: null,
              },
              opts.handoff || {},
            ),
    },
  });
  return queue.get(e.entryId);
}

/** A GitHub reader that answers from a literal, and records that it was asked. */
function fakeGh(pr, calls) {
  return {
    async getPr(n) {
      if (calls) calls.push(['getPr', n]);
      return Object.assign({ number: n }, pr);
    },
    // Present so that a reconciliation reaching for a merge would find one and
    // MR11 could see it happen. It never should.
    async merge() {
      if (calls) calls.push(['merge']);
      throw new Error('RECONCILIATION_MUST_NOT_MERGE');
    },
  };
}

const MERGED_PR = { state: 'MERGED', mergeCommitOid: MERGE_SHA, baseRefName: 'main', headRefOid: HEAD_SHA };

const reconcile = (queue, entryId, over) =>
  reconcileMod.reconcileMergedEntry(
    Object.assign(
      {
        queue,
        entryId,
        repoCwd: process.cwd(),
        gh: fakeGh(MERGED_PR),
        reconciliationAuthority: AUTHORITY,
        // Reachability is a git question, and these tests are about the queue.
        // The real probe has its own test below (MR06).
        isReachable: () => true,
      },
      over || {},
    ),
  );

// ── MR01 ────────────────────────────────────────────────────────────────────
test('MR01  a blocked entry whose PR is still OPEN keeps the finalize-retry path', async () => {
  // #1743 exists for a real case: a finalize that failed on a gate, whose PR is
  // open and whose work is done. Nothing here may take that away.
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR01' });

  const divert = await reconcileMod.needsReconciliation({
    entry,
    gh: fakeGh({ state: 'OPEN', mergeCommitOid: null, baseRefName: 'main', headRefOid: HEAD_SHA }),
  });
  assert.equal(divert, false, 'an open PR is not a reconciliation case');

  // And the edge itself still works, exactly as #1743 left it.
  const moved = queue.transition({
    entryId: entry.entryId,
    to: 'MERGE_READY',
    expectedPreviousState: 'BLOCKED',
    finalizeRetryAuthorized: true,
  });
  assert.equal(moved.state, 'MERGE_READY');
});

// ── MR02 ────────────────────────────────────────────────────────────────────
test('MR02  schema v1 reconciles to CLOSED / MERGED / LEGACY_UNVERIFIED', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR02' });

  const r = await reconcile(queue, entry.entryId);

  assert.equal(r.disposition, 'RECONCILED');
  assert.equal(r.executionState, 'CLOSED');
  assert.equal(r.changeState, 'MERGED');
  // Not PASS. The task never declared a delivery contract, so there is no
  // target it could have met — and no probe it could have failed either.
  assert.equal(r.deliveryState, 'LEGACY_UNVERIFIED');
  assert.equal(r.mergeSha, MERGE_SHA);
  assert.equal(queue.get(entry.entryId).state, 'CLOSED');
  assert.equal(queue.get(entry.entryId).mergeSha, MERGE_SHA);
  assert.match(r.evidenceSha256, /^[0-9a-f]{64}$/);
});

// ── MR03 ────────────────────────────────────────────────────────────────────
test('MR03  schema v2 with a passing delivery probe reaches DONE', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, {
    taskId: 'MR03',
    handoff: { taskSchemaVersion: 2, deliveryContract: { capability: 'X', targetState: 'WIRED' }, deliveryContractSha256: 'a'.repeat(64) },
  });

  const seen = [];
  const r = await reconcile(queue, entry.entryId, {
    verifyDelivery: async (arg) => {
      seen.push(arg.mergeSha);
      return { deliveryState: 'PASS', detail: 'observed WIRED' };
    },
  });

  assert.equal(r.deliveryState, 'PASS');
  assert.equal(r.overallState, 'DONE');
  // Verified at the SHA that actually merged, not at whatever the branch says.
  assert.deepEqual(seen, [MERGE_SHA]);
});

// ── MR04 ────────────────────────────────────────────────────────────────────
test('MR04  schema v2 with a failing probe is terminal, not finalize-ready', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, {
    taskId: 'MR04',
    handoff: { taskSchemaVersion: 2, deliveryContract: { capability: 'X', targetState: 'WIRED' } },
  });

  const r = await reconcile(queue, entry.entryId, {
    verifyDelivery: async () => ({ deliveryState: 'FAILED', detail: 'observed ABSENT' }),
  });

  assert.equal(r.changeState, 'MERGED', 'the merge happened whatever the probe says');
  assert.equal(r.deliveryState, 'FAILED');
  assert.equal(r.overallState, 'NOT_DONE');
  assert.equal(queue.get(entry.entryId).state, 'CLOSED', 'terminal for scheduling');
  assert.equal(
    finalizeMod.finalizable(queue).filter((f) => f.entryId === entry.entryId).length,
    0,
    'a merged task with failed delivery must not go back for another merge',
  );

  // A probe that could not run is a third answer, and must not read as either.
  const q2 = scratchQueue();
  const e2 = blockedEntry(q2, {
    taskId: 'MR04b',
    handoff: { taskSchemaVersion: 2, deliveryContract: { capability: 'X', targetState: 'WIRED' } },
  });
  const r2 = await reconcile(q2, e2.entryId, {
    verifyDelivery: async () => {
      throw new Error('worktree could not be created');
    },
  });
  assert.equal(r2.deliveryState, 'MERGED_UNVERIFIED');
  assert.equal(r2.overallState, 'NOT_DONE');
});

// ── MR05 ────────────────────────────────────────────────────────────────────
test('MR05  a PR that GitHub closed WITHOUT merging is refused', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR05' });

  const r = await reconcile(queue, entry.entryId, {
    gh: fakeGh({ state: 'CLOSED', mergeCommitOid: null, baseRefName: 'main', headRefOid: HEAD_SHA }),
  });

  assert.equal(r.disposition, 'REFUSED');
  assert.equal(r.refusal, 'RECONCILE_PR_NOT_MERGED');
  assert.equal(queue.get(entry.entryId).state, 'BLOCKED', 'left exactly where it was found');
  assert.equal(queue.get(entry.entryId).blockerCode, 'ATTESTATION_INVALIDATED', 'and keeps its blocker');
});

// ── MR06 ────────────────────────────────────────────────────────────────────
test('MR06  PR, target-branch, head and reachability mismatches are each refused', async () => {
  const cases = [
    [
      'RECONCILE_TARGET_BRANCH_MISMATCH',
      { gh: fakeGh(Object.assign({}, MERGED_PR, { baseRefName: 'release/2026-07' })) },
    ],
    [
      'RECONCILE_PR_HEAD_CONFLICT',
      { gh: fakeGh(Object.assign({}, MERGED_PR, { headRefOid: 'f'.repeat(40) })) },
    ],
    ['RECONCILE_MERGE_SHA_MISSING', { gh: fakeGh(Object.assign({}, MERGED_PR, { mergeCommitOid: null })) }],
    // GitHub says merged; the repository does not have the commit in the target
    // branch. GitHub's claim is about GitHub, and this is the claim about main.
    ['RECONCILE_MERGE_SHA_UNREACHABLE', { isReachable: () => false }],
  ];

  for (const [expected, over] of cases) {
    const queue = scratchQueue();
    const entry = blockedEntry(queue, { taskId: 'MR06-' + expected });
    const r = await reconcile(queue, entry.entryId, over);
    assert.equal(r.disposition, 'REFUSED', expected);
    assert.equal(r.refusal, expected);
    assert.equal(queue.get(entry.entryId).state, 'BLOCKED');
  }

  // Repository identity, when the durable record carries one.
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR06-repo', handoff: { repository: 'someone-else/OTHER_REPO' } });
  const r = await reconcile(queue, entry.entryId);
  assert.equal(r.refusal, 'RECONCILE_REPOSITORY_MISMATCH');
  assert.equal(queue.get(entry.entryId).state, 'BLOCKED');
});

// ── MR07 ────────────────────────────────────────────────────────────────────
test('MR07  reconciling twice is idempotent', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR07' });

  const first = await reconcile(queue, entry.entryId);
  const recordsAfterFirst = fs.readFileSync(queue.logFile, 'utf8').split('\n').filter(Boolean).length;

  const second = await reconcile(queue, entry.entryId);
  assert.equal(second.disposition, 'ALREADY_RECONCILED');
  assert.equal(second.mergeSha, first.mergeSha);
  assert.equal(second.deliveryState, first.deliveryState);
  assert.equal(
    fs.readFileSync(queue.logFile, 'utf8').split('\n').filter(Boolean).length,
    recordsAfterFirst,
    'the second run wrote no transition',
  );
});

// ── MR08 ────────────────────────────────────────────────────────────────────
test('MR08  the earlier history is preserved, and the new events are appended', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR08' });
  const events = [];

  await reconcile(queue, entry.entryId, { audit: (name, payload) => events.push([name, payload]) });

  const names = events.map((e) => e[0]);
  assert.deepEqual(names, [
    'MERGED_PR_RECONCILIATION_STARTED',
    'MERGED_PR_GITHUB_VERIFIED',
    'MERGED_PR_RECONCILIATION_COMPLETED',
  ]);
  const done = events[2][1];
  for (const f of ['entryId', 'taskId', 'previousState', 'prNumber', 'targetBranch', 'mergeSha', 'observedAt', 'authorityRef', 'taskSchemaVersion', 'deliveryState', 'resultingState', 'evidenceSha256']) {
    assert.ok(done[f] !== undefined && done[f] !== null, 'completed event records ' + f);
  }
  assert.equal(done.previousState, 'BLOCKED', 'the state it came from is on the record');

  // The queue log is append-only, so the original failure is still readable.
  const log = fs.readFileSync(queue.logFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.ok(
    log.some((r) => r.state === 'BLOCKED' && r.blockerCode === 'ATTESTATION_INVALIDATED'),
    'the original blocker record was not rewritten',
  );
  assert.ok(log.some((r) => r.state === 'RECONCILING'), 'the intermediate state is on the record too');
});

// ── MR09 ────────────────────────────────────────────────────────────────────
test('MR09  a reconciled entry is excluded from finalizable()', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR09' });
  assert.equal(
    finalizeMod.finalizable(queue).filter((f) => f.entryId === entry.entryId).length,
    1,
    'listed before, because its handoff is intact',
  );

  await reconcile(queue, entry.entryId);
  assert.equal(
    finalizeMod.finalizable(queue).filter((f) => f.entryId === entry.entryId).length,
    0,
    'and gone after',
  );
});

// ── MR10 ────────────────────────────────────────────────────────────────────
test('MR10  an unrelated queued entry becomes selectable once the blocker is reconciled', async () => {
  const queue = scratchQueue();
  const foreign = blockedEntry(queue, { taskId: 'MR10-FOREIGN' });
  const mine = queue.enqueue({
    programId: 'DELIVERY_TRUTH',
    taskId: 'MR10-MINE',
    taskClass: 'BOUNDED_CODE_FIX',
    parentAuthorizationId: 'OWNER-TEST',
  });

  // The deadlock: the drain's finalize pass keeps picking the foreign entry.
  assert.equal(finalizeMod.finalizable(queue).filter((f) => f.hasHandoff)[0].entryId, foreign.entryId);

  await reconcile(queue, foreign.entryId);

  assert.equal(finalizeMod.finalizable(queue).filter((f) => f.hasHandoff).length, 0, 'nothing left to finalize');
  const head = queue.head();
  assert.ok(head, 'the queue now has a head');
  assert.equal(head.entryId, mine.entryId, 'and it is the work that was waiting behind the blocker');
});

// ── MR11 ────────────────────────────────────────────────────────────────────
test('MR11  reconciliation reads GitHub and never asks it to merge', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR11' });
  const calls = [];

  await reconcile(queue, entry.entryId, { gh: fakeGh(MERGED_PR, calls) });

  assert.deepEqual(calls.map((c) => c[0]), ['getPr'], 'one read, no writes');
  // And nothing minted a fresh attestation to get past a gate.
  const closed = queue.get(entry.entryId);
  assert.equal(closed.handoff.attestation.ok, true, 'the original attestation is untouched');
  assert.equal(closed.reconciliation.authorityRef, AUTHORITY);
});

// ── MR12 ────────────────────────────────────────────────────────────────────
test('MR12  CANCELLED is never written for a merged PR', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR12' });

  await reconcile(queue, entry.entryId);

  const log = fs.readFileSync(queue.logFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const mine = log.filter((r) => r.entryId === entry.entryId);
  assert.equal(mine.filter((r) => r.state === 'CANCELLED').length, 0);
  assert.deepEqual(
    mine.map((r) => r.state),
    ['QUEUED', 'BLOCKED', 'RECONCILING', 'CLOSED'],
    'the whole life of the entry, with no fabricated step in it',
  );
});

// ── MR13 ────────────────────────────────────────────────────────────────────
test('MR13  an unauthorized caller is refused, at the function and at the queue', async () => {
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR13' });

  for (const bad of [undefined, null, '', '   ']) {
    const r = await reconcile(queue, entry.entryId, { reconciliationAuthority: bad });
    assert.equal(r.refusal, 'RECONCILE_AUTHORITY_MISSING', String(bad));
  }
  assert.equal(queue.get(entry.entryId).state, 'BLOCKED');

  // And the transition itself is not available to a caller who goes around the
  // function — which is the point of putting the guard in the queue.
  assert.throws(
    () => queue.transition({ entryId: entry.entryId, to: 'RECONCILING', expectedPreviousState: 'BLOCKED' }),
    (e) => e.code === 'QUEUE_RECONCILIATION_NOT_AUTHORIZED',
  );
  // Nor can an authorized caller close one without the evidence.
  queue.transition({
    entryId: entry.entryId,
    to: 'RECONCILING',
    expectedPreviousState: 'BLOCKED',
    reconciliationAuthorized: true,
  });
  assert.throws(
    () =>
      queue.transition({
        entryId: entry.entryId,
        to: 'CLOSED',
        expectedPreviousState: 'RECONCILING',
        reconciliationAuthorized: true,
      }),
    (e) => e.code === 'QUEUE_RECONCILIATION_EVIDENCE_MISSING',
    'CLOSED / MERGED must carry the merge it is asserting',
  );
});

// ── MR14 ────────────────────────────────────────────────────────────────────
test('MR14  the finalize path diverts a merged PR instead of retrying it', async () => {
  // The selector defect, end to end: this is what used to restore the entry to
  // MERGE_READY, fail, and re-block, forever.
  const queue = scratchQueue();
  const entry = blockedEntry(queue, { taskId: 'MR14' });
  const events = [];

  const out = await finalizeMod.finalizeEntry({
    queue,
    entryId: entry.entryId,
    repoCwd: process.cwd(),
    gh: fakeGh(MERGED_PR),
    isKillSwitchEngaged: () => false,
    audit: (name) => events.push(name),
  });

  assert.equal(out.disposition, 'NEEDS_RECONCILIATION');
  assert.equal(queue.get(entry.entryId).state, 'BLOCKED', 'the divert is a report, not a half-transition');
  assert.ok(events.includes('FINALIZE_DIVERTED_TO_RECONCILIATION'));
  assert.ok(!events.includes('FINALIZE_RETRY_FROM_BLOCKED'), 'and no retry was attempted');

  // Kill-switch semantics are unchanged: engaged means nothing moves, and that
  // is decided before the divert, so an engaged switch is never bypassed by
  // taking the new path.
  const halted = await finalizeMod.finalizeEntry({
    queue,
    entryId: entry.entryId,
    repoCwd: process.cwd(),
    gh: fakeGh(MERGED_PR),
    isKillSwitchEngaged: () => true,
    audit: () => {},
  });
  assert.equal(halted.disposition, 'BLOCKED');
  assert.equal(halted.blockerCode, 'KILL_SWITCH_ENGAGED');
});
