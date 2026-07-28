'use strict';
/**
 * A stale worker must be harmless, not merely unlucky.
 *
 * The measured failure: a worktree checked out before the plan-identity fix
 * drained the shared queue, computed the old digest, and pushed another
 * session's entry to a TERMINAL blocker it had not earned. Every test here is
 * about the difference between "this worker cannot do the work" and "this
 * worker got to decide the work is dead".
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const RC = require('./runtime-contract.cjs');

const REQUIRED = RC.REQUIRED_FIX_ANCESTORS.map((f) => f.sha);

/** An entry as admission pins it. */
function entry(over) {
  return Object.assign(
    {
      entryId: 'e1',
      taskId: 'T-R01',
      state: 'QUEUED',
      runtimeContractVersion: RC.RUNTIME_CONTRACT_VERSION,
      minimumCompatibleRuntimeVersion: RC.RUNTIME_CONTRACT_VERSION,
      requiredFixAncestors: REQUIRED,
    },
    over || {},
  );
}

/** A worker as it measures itself. */
function worker(over) {
  return Object.assign(
    {
      runtimeContractVersion: RC.RUNTIME_CONTRACT_VERSION,
      codeSha: 'a'.repeat(40),
      worktree: 'C:/repo',
      repositoryRoot: 'C:/repo/.git',
      mainSha: 'b'.repeat(40),
      ahead: 0,
      behind: 0,
    },
    over || {},
  );
}

/** Ancestry is a repository question; these stub it deterministically. */
const HAS_ALL = 'C:/has-all';
const HAS_NONE = 'C:/has-none';
/** Ancestry is a repository question; injected so a test need not build one. */
const ancestry = (repoCwd) => repoCwd === HAS_ALL;

test('a current worker is dispatched', () => {
  const v = RC.assess({ entry: entry(), worker: worker(), repoCwd: HAS_ALL, hasAncestor: ancestry });
  assert.equal(v.compatible, true, v.refusal + ' ' + v.detail);
});

test('a worker missing a required fix relinquishes, and says which one', () => {
  const v = RC.assess({ entry: entry(), worker: worker(), repoCwd: HAS_NONE, hasAncestor: ancestry });
  assert.equal(v.compatible, false);
  assert.equal(v.refusal, 'WORKER_CODE_STALE');
  assert.match(v.detail, new RegExp(REQUIRED[0].slice(0, 12)));
  assert.match(v.detail, /C:\/repo/, 'and which worktree it is');
});

test('a worker implementing an older contract relinquishes', () => {
  const v = RC.assess({
    entry: entry({ minimumCompatibleRuntimeVersion: RC.RUNTIME_CONTRACT_VERSION + 1 }),
    worker: worker(),
    repoCwd: HAS_ALL,
    hasAncestor: ancestry,
  });
  assert.equal(v.refusal, 'WORKER_VERSION_INCOMPATIBLE');
  assert.match(v.detail, /v1.*v2|v2/);
});

test('a NEWER compatible worker is dispatched', () => {
  // Forward compatibility is the normal case: the fleet updates one worktree at
  // a time, and a worker ahead of the entry must not be refused for being ahead.
  const v = RC.assess({
    entry: entry(),
    worker: worker({ runtimeContractVersion: RC.RUNTIME_CONTRACT_VERSION + 5 }),
    repoCwd: HAS_ALL,
    hasAncestor: ancestry,
  });
  assert.equal(v.compatible, true, v.refusal);
});

test('a worker that cannot measure itself is refused, not assumed current', () => {
  // "I could not tell" and "I am up to date" must not produce the same outcome.
  const v = RC.assess({ entry: entry(), worker: worker({ codeSha: null }), repoCwd: HAS_ALL, hasAncestor: ancestry });
  assert.equal(v.refusal, 'WORKER_CODE_UNKNOWN');
});

test('an entry admitted before the fence still runs', () => {
  // Refusing these would strand every entry that predates this code — a worse
  // failure than the one being prevented.
  const v = RC.assess({
    entry: entry({ minimumCompatibleRuntimeVersion: undefined, requiredFixAncestors: undefined }),
    worker: worker(),
    repoCwd: HAS_NONE,
    hasAncestor: ancestry,
  });
  assert.equal(v.compatible, true);
  assert.match(v.detail, /predates/);
});

test('being ahead of main is not a reason to refuse', () => {
  // A worktree legitimately carries unmerged work. What matters is whether the
  // required fixes are IN it, not whether it has anything else besides.
  const v = RC.assess({ entry: entry(), worker: worker({ ahead: 12, behind: 3 }), repoCwd: HAS_ALL, hasAncestor: ancestry });
  assert.equal(v.compatible, true, v.refusal);
});

test('the pin an entry carries names a version AND a fix set', () => {
  // Not a single hard-coded sha: a version plus required ancestors says what
  // compatibility MEANS, which survives the next fix.
  const pin = RC.pinForAdmission({ admissionCodeSha: 'c'.repeat(40) });
  assert.equal(pin.runtimeContractVersion, RC.RUNTIME_CONTRACT_VERSION);
  assert.equal(pin.minimumCompatibleRuntimeVersion, RC.RUNTIME_CONTRACT_VERSION);
  assert.equal(pin.admissionCodeSha, 'c'.repeat(40));
  assert.ok(Array.isArray(pin.requiredFixAncestors));
  assert.ok(pin.requiredFixAncestors.length >= 1);
  for (const s of pin.requiredFixAncestors) assert.match(s, /^[0-9a-f]{40}$/);
});

test('every required fix says why it is required', () => {
  // A bare sha in a list is unmaintainable: nobody can tell later whether it
  // may be dropped.
  for (const f of RC.REQUIRED_FIX_ANCESTORS) {
    assert.match(f.sha, /^[0-9a-f]{40}$/);
    assert.ok(f.why && f.why.length > 20, f.sha + ' has no stated reason');
  }
});

test('measuring a real repository reports a sha and a worktree', () => {
  // The measurement is not a stub anywhere it matters, so it is exercised here
  // against this checkout.
  const m = RC.measureWorker({ repoCwd: __dirname });
  assert.match(String(m.codeSha), /^[0-9a-f]{40}$/);
  assert.ok(m.worktree && m.worktree.length > 0);
  assert.equal(m.runtimeContractVersion, RC.RUNTIME_CONTRACT_VERSION);
});

test('this checkout satisfies its own required fixes', () => {
  // If it did not, this worker could not run its own queue — and the fence
  // would be refusing everybody.
  //
  // A CI runner checks out at depth 1, so required-fix commits are not IN the
  // clone. That case is still asserted: the current worker must match the exact
  // commit pinned at admission. Nothing is skipped or assumed compatible.
  if (RC.isShallow(__dirname)) {
    const measured = RC.measureWorker({ repoCwd: __dirname });
    assert.equal(measured.shallow, true, 'a shallow checkout must report itself as one');
    const verdict = RC.assess({
      entry: RC.pinForAdmission({ admissionCodeSha: measured.codeSha }),
      worker: measured,
      repoCwd: __dirname,
    });
    assert.equal(verdict.compatible, true, verdict.detail);
    assert.equal(verdict.unverifiable, 'SHALLOW_HISTORY');
    return;
  }
  for (const f of RC.REQUIRED_FIX_ANCESTORS) {
    assert.equal(RC.hasAncestor(__dirname, f.sha), true, 'missing ' + f.sha.slice(0, 12) + ': ' + f.why);
  }
});

test('a shallow checkout is compatible only at the exact admission commit', () => {
  // Same missing ancestor, three verdicts: a complete history that genuinely
  // lacks the fix is refused; a truncated worker at the admission commit is
  // permitted and reports why; a different or unpinned truncated worker is
  // still refused. This is the old-worker safety property, not a test bypass.
  const entry = {
    minimumCompatibleRuntimeVersion: RC.RUNTIME_CONTRACT_VERSION,
    requiredFixAncestors: ['a'.repeat(40)],
    admissionCodeSha: 'b'.repeat(40),
  };
  const worker = { runtimeContractVersion: RC.RUNTIME_CONTRACT_VERSION, codeSha: 'b'.repeat(40), worktree: '/w' };
  const never = () => false;

  const complete = RC.assess({ entry, worker, hasAncestor: never, isShallow: () => false });
  assert.equal(complete.compatible, false, 'the case the fence exists for is untouched');
  assert.equal(complete.refusal, 'WORKER_CODE_STALE');

  const truncated = RC.assess({ entry, worker, hasAncestor: never, isShallow: () => true });
  assert.equal(truncated.compatible, true);
  assert.equal(truncated.refusal, null);
  assert.equal(truncated.unverifiable, 'SHALLOW_HISTORY', 'permitted, but never silently');
  assert.match(truncated.detail, /exact admission commit/);

  const different = RC.assess({
    entry,
    worker: Object.assign({}, worker, { codeSha: 'c'.repeat(40) }),
    hasAncestor: never,
    isShallow: () => true,
  });
  assert.equal(different.compatible, false, 'a different shallow worker is not assumed safe');
  assert.equal(different.refusal, 'WORKER_CODE_STALE');

  const unpinned = RC.assess({
    entry: Object.assign({}, entry, { admissionCodeSha: null }),
    worker,
    hasAncestor: never,
    isShallow: () => true,
  });
  assert.equal(unpinned.compatible, false, 'a shallow worker needs positive admission identity');
  assert.equal(unpinned.refusal, 'WORKER_CODE_STALE');
});
