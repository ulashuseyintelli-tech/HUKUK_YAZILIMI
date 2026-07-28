'use strict';
/**
 * Shared task-artefact lifecycle.
 *
 * One property: a task's papers travel with it. The queue is shared across
 * every worktree of this repository, so an artefact that only exists in the
 * worktree that enqueued the task is not an artefact — it is a local file the
 * consumer cannot see.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const A = require('./artefact.cjs');

const dirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-art-'));
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

const REQ_DIR = 'project/docs/governance/coordination-v2/requests/';
const PLAN_DIR = 'project/docs/governance/coordination-v2/task-plans/';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/** A repository with the artefacts committed, plus a second worktree. */
function repoWithArtefacts(files) {
  const root = tmp();
  git(['init', '-q', '.'], root);
  git(['config', 'user.email', 'a@a'], root);
  git(['config', 'user.name', 'a'], root);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, 'utf8');
  }
  git(['add', '-A'], root);
  git(['commit', '-qm', 'artefacts'], root);
  // Whatever `git init` called the initial branch. Forcing a name here fails
  // when the repository's own checkout is already on it, and the ref a worker
  // reads from is a parameter anyway.
  return root;
}

/** The branch this repository's checkout is on. */
function branchOf(root) {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], root).trim();
}

// ─────────────────────────────────────────────── CANONICAL REFERENCES

test('artefact: an absolute path is refused, not resolved', () => {
  // It is a path into one machine's one worktree; it cannot mean the same thing
  // to the next worker that pulls this task off the shared queue.
  for (const bad of ['C:/Development/HUKUK_YAZILIMI/project/x.json', '/var/tmp/x.json']) {
    assert.throws(() => A.assertCanonicalRef(bad, 'x'), (e) => e.code === 'ARTEFACT_REF_ABSOLUTE', bad);
  }
});

test('artefact: traversal is refused', () => {
  for (const bad of ['project/../../etc/passwd', 'project/./x.json', '../x.json']) {
    assert.throws(() => A.assertCanonicalRef(bad, 'x'), (e) => e.code === 'ARTEFACT_REF_TRAVERSAL', bad);
  }
});

test('artefact: a backslash is refused rather than normalised', () => {
  // It means the caller built the path with platform joins, and the next caller
  // on another platform would build a different string for the same file.
  assert.throws(
    () => A.assertCanonicalRef('project\\docs\\x.json', 'x'),
    (e) => e.code === 'ARTEFACT_REF_BACKSLASH',
  );
});

test('artefact: an empty or control-character reference is refused', () => {
  assert.throws(() => A.assertCanonicalRef('', 'x'), (e) => e.code === 'ARTEFACT_REF_EMPTY');
  assert.throws(() => A.assertCanonicalRef('a//b.json', 'x'), (e) => e.code === 'ARTEFACT_REF_EMPTY_SEGMENT');
  assert.throws(() => A.assertCanonicalRef('a/\u0000b.json', 'x'), (e) => e.code === 'ARTEFACT_REF_CONTROL_CHAR');
});

test('artefact: references must sit in the canonical governance directories', () => {
  // Not a new store — these are the directories the governance model already
  // uses. Naming them makes "canonical location" checkable rather than merely
  // conventional.
  assert.equal(A.assertUnderArtefactRoot(REQ_DIR + 'T.json', 'r'), REQ_DIR + 'T.json');
  assert.throws(
    () => A.assertUnderArtefactRoot('project/apps/api/src/somewhere.json', 'r'),
    (e) => e.code === 'ARTEFACT_REF_OUTSIDE_CANONICAL_ROOTS',
  );
});

// ─────────────────────────────────────────── COMMITTED, NOT MERELY PRESENT

test('artefact: an uncommitted artefact is refused at the desk', () => {
  // The exact failure the canary hit — caught here instead of by a worker in
  // another worktree eight minutes into a run.
  const root = repoWithArtefacts({ [REQ_DIR + 'A.json']: '{"a":1}\n' });
  const stray = path.join(root, REQ_DIR + 'B.json');
  fs.writeFileSync(stray, '{"b":2}\n', 'utf8');

  assert.throws(
    () => A.verifyArtefacts({ repoCwd: root, refs: [REQ_DIR + 'B.json'], ref: branchOf(root) }),
    (e) => e.code === 'ARTEFACT_NOT_COMMITTED',
    'a file that exists only in this checkout is not an artefact',
  );
  // And the committed one is fine.
  assert.ok(A.verifyArtefacts({ repoCwd: root, refs: [REQ_DIR + 'A.json'], ref: branchOf(root) }).digest);
});

test('artefact: enqueue in one worktree, dispatch in another — the papers travel', () => {
  // The property the whole module exists for.
  const root = repoWithArtefacts({
    [REQ_DIR + 'T.json']: '{"task":"T"}\n',
    [PLAN_DIR + 'T/plan.json']: '{"plan":1}\n',
  });
  const other = path.join(tmp(), 'wt');
  git(['worktree', 'add', '-q', '--detach', other, branchOf(root)], root);

  const refs = [REQ_DIR + 'T.json', PLAN_DIR + 'T/plan.json'];
  const fromA = A.verifyArtefacts({ repoCwd: root, refs, ref: branchOf(root) });
  const fromB = A.verifyArtefacts({ repoCwd: other, refs, ref: 'HEAD' });
  assert.equal(fromB.digest, fromA.digest, 'the same papers, read from a different worktree');
});

test('artefact: a fresh clone with no working tree reads the same artefacts', () => {
  // Because they come from the object database, not from someone's checkout.
  const root = repoWithArtefacts({ [REQ_DIR + 'T.json']: '{"task":"T"}\n' });
  const clone = path.join(tmp(), 'bare-consumer');
  git(['clone', '-q', '--no-checkout', root, clone], tmp());

  const refs = [REQ_DIR + 'T.json'];
  const a = A.verifyArtefacts({ repoCwd: root, refs, ref: branchOf(root) });
  const b = A.verifyArtefacts({ repoCwd: clone, refs, ref: 'HEAD' });
  assert.equal(b.digest, a.digest);
});

// ────────────────────────────────────────────────────── PINNED BY CONTENT

test('artefact: the digest covers CONTENT, so an edit changes it', () => {
  // A digest over the paths alone would let the contents change underneath it —
  // which is the failure it exists to prevent.
  const one = A.artefactSetDigest([{ ref: 'a', content: '1' }]);
  const two = A.artefactSetDigest([{ ref: 'a', content: '2' }]);
  assert.notEqual(one, two);
});

test('artefact: swapping two files changes the digest', () => {
  const a = A.artefactSetDigest([{ ref: 'x', content: '1' }, { ref: 'y', content: '2' }]);
  const b = A.artefactSetDigest([{ ref: 'x', content: '2' }, { ref: 'y', content: '1' }]);
  assert.notEqual(a, b);
});

test('artefact: order does not change the digest — the SET is what is pinned', () => {
  const a = A.artefactSetDigest([{ ref: 'x', content: '1' }, { ref: 'y', content: '2' }]);
  const b = A.artefactSetDigest([{ ref: 'y', content: '2' }, { ref: 'x', content: '1' }]);
  assert.equal(a, b);
});

test('artefact: a digest that no longer matches stops the run', () => {
  const root = repoWithArtefacts({ [REQ_DIR + 'T.json']: '{"task":"T"}\n' });
  const refs = [REQ_DIR + 'T.json'];
  const pinned = A.verifyArtefacts({ repoCwd: root, refs, ref: branchOf(root) }).digest;

  // Same reference, different committed content.
  fs.writeFileSync(path.join(root, REQ_DIR + 'T.json'), '{"task":"T","edited":true}\n', 'utf8');
  git(['add', '-A'], root);
  git(['commit', '-qm', 'edit'], root);

  assert.throws(
    () => A.verifyArtefacts({ repoCwd: root, refs, ref: branchOf(root), expectedDigest: pinned }),
    (e) => e.code === 'ARTEFACT_DIGEST_MISMATCH',
  );
});

test('artefact: an empty artefact set is refused', () => {
  const root = repoWithArtefacts({ [REQ_DIR + 'T.json']: '{}\n' });
  assert.throws(() => A.verifyArtefacts({ repoCwd: root, refs: [], ref: branchOf(root) }), (e) => e.code === 'ARTEFACT_SET_EMPTY');
});

test('artefact: the same request yields the same digest twice — enqueue is idempotent', () => {
  const root = repoWithArtefacts({ [REQ_DIR + 'T.json']: '{"task":"T"}\n' });
  const refs = [REQ_DIR + 'T.json'];
  assert.equal(
    A.verifyArtefacts({ repoCwd: root, refs, ref: branchOf(root) }).digest,
    A.verifyArtefacts({ repoCwd: root, refs, ref: branchOf(root) }).digest,
  );
});

test('artefact: refsFor collects every paper a request depends on', () => {
  const refs = A.refsFor({
    sourcePath: REQ_DIR + 'T.json',
    planPath: PLAN_DIR + 'T/plan.json',
    standingGrantPath: 'project/docs/governance/coordination-v2/activation/G.json',
    grantPath: PLAN_DIR + 'T/grant.json',
    promptPath: PLAN_DIR + 'T/prompt.md',
  });
  assert.equal(refs.length, 5);
  // An optional one that is absent is simply not in the set.
  assert.equal(A.refsFor({ sourcePath: 'a', planPath: 'b', standingGrantPath: 'c' }).length, 3);
});
