'use strict';
/**
 * A one-shot grant is only worth having if it cannot be used twice.
 *
 * These are the negative tests the owner enumerated when authorizing the R04
 * canary grant. They are written as refusals rather than as capabilities on
 * purpose: the capability is one file and one merge, and everything else this
 * grant might be asked to do is the thing that must not happen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const G = require('./one-shot-grant.cjs');

const TARGET = 'project/scripts/orchestration-v2/activation-evidence/CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04.md';
const TASK = 'CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04';
const PLAN_SHA = 'a'.repeat(64);

const dirs = [];
function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-osg-'));
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

function grant(over) {
  return Object.assign(
    {
      schemaVersion: 1,
      standingGrantId: 'TASK-GRANT-CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04',
      grantKind: G.GRANT_KIND,
      profile: 'BOUNDED_CODE_TASK',
      program: { programId: 'ORCHESTRA_OPERATIONAL_CANARY' },
      taskId: TASK,
      planSha256: PLAN_SHA,
      allowedTaskClasses: ['OPERATIONAL_CANARY_EVIDENCE'],
      allowedPathRoots: [TARGET],
      allowedExecutorLanes: ['CODEX_LOCAL'],
      maxPRs: 1,
      maxSuccessfulMerges: 1,
      mergePolicy: { method: 'SQUASH', autoMergeAuthorized: true, repositoryWideAutoMerge: false },
    },
    over || {},
  );
}

/** The call admission makes, with every field the grant is bound to. */
function use(dir, over) {
  return G.assertUsable(
    Object.assign(
      {
        grant: grant(),
        dir,
        taskId: TASK,
        programId: 'ORCHESTRA_OPERATIONAL_CANARY',
        taskClass: 'OPERATIONAL_CANARY_EVIDENCE',
        executorLane: 'CODEX_LOCAL',
        taskSpecSha256: PLAN_SHA,
        specRoots: [TARGET],
      },
      over || {},
    ),
  );
}

function refuses(dir, over, code) {
  assert.throws(() => use(dir, over), (e) => e.code === code, code + ' expected');
}

test('the authorized use is allowed', () => {
  // The control. Every refusal below is only meaningful because this passes.
  const dir = tmpdir();
  assert.doesNotThrow(() => use(dir));
  assert.equal(G.statusOf(dir, grant()).state, 'ACTIVE');
});

test('a second task id cannot use the same grant', () => {
  refuses(tmpdir(), { taskId: 'CANARY-SOMETHING-ELSE-R05' }, 'TASK_GRANT_TASK_MISMATCH');
});

test('a second program cannot use the same grant', () => {
  refuses(tmpdir(), { programId: 'OFFICE' }, 'TASK_GRANT_PROGRAM_MISMATCH');
});

test('the grant cannot open a second pull request', () => {
  const dir = tmpdir();
  G.recordPr({ grant: grant(), dir, taskId: TASK, entryId: 'e1', prNumber: 1801 });
  // The same PR again is a retry, and retries are allowed.
  assert.doesNotThrow(() => use(dir, { prNumber: 1801 }));
  // A different one is a second attempt at the same authorization.
  refuses(dir, { prNumber: 1802 }, 'TASK_GRANT_PR_BUDGET_EXHAUSTED');
});

test('after a successful merge the grant is spent for everything', () => {
  const dir = tmpdir();
  G.consume({ grant: grant(), dir, taskId: TASK, entryId: 'e1', prNumber: 1801, mergeSha: 'b'.repeat(40) });
  refuses(dir, {}, 'TASK_GRANT_CONSUMED');
  refuses(dir, { prNumber: 1801 }, 'TASK_GRANT_CONSUMED');
  const st = G.statusOf(dir, grant());
  assert.equal(st.state, 'CONSUMED');
  assert.equal(st.mergeSha, 'b'.repeat(40));
});

test('consumption is idempotent for the same merge and refuses a different one', () => {
  // A finalizer that crashes after the merge and re-runs must not be told its
  // own merge was somebody else's.
  const dir = tmpdir();
  const sha = 'c'.repeat(40);
  G.consume({ grant: grant(), dir, taskId: TASK, entryId: 'e1', prNumber: 1801, mergeSha: sha });
  assert.doesNotThrow(() => G.consume({ grant: grant(), dir, taskId: TASK, entryId: 'e1', prNumber: 1801, mergeSha: sha }));
  assert.throws(
    () => G.consume({ grant: grant(), dir, taskId: TASK, entryId: 'e2', prNumber: 1802, mergeSha: 'd'.repeat(40) }),
    (e) => e.code === 'TASK_GRANT_CONSUMED',
  );
});

test('the grant is never consumed without a merge sha', () => {
  // The failure mode this prevents: a run that blows up somewhere near the
  // merge spends the authorization, and the real merged work has none left to
  // finish with. Re-issuing an owner grant is not something this may do.
  const dir = tmpdir();
  assert.throws(
    () => G.consume({ grant: grant(), dir, taskId: TASK, entryId: 'e1', prNumber: 1801, mergeSha: null }),
    (e) => e.code === 'TASK_GRANT_MERGE_BUDGET_EXHAUSTED',
  );
  assert.equal(G.statusOf(dir, grant()).state, 'ACTIVE', 'still usable');
});

test('the plan is pinned by hash', () => {
  refuses(tmpdir(), { taskSpecSha256: 'f'.repeat(64) }, 'TASK_GRANT_PLAN_HASH_MISMATCH');
});

test('the boundary must be the exact file, not a directory containing it', () => {
  // A subset rule would accept the directory and hand the executor the whole
  // of it. "Exactly one file" has to mean the file.
  const dir = tmpdir();
  refuses(dir, { specRoots: ['project/scripts/orchestration-v2/activation-evidence/'] }, 'TASK_GRANT_PATH_NOT_EXACT');
  refuses(dir, { specRoots: ['project/scripts/orchestration-v2/'] }, 'TASK_GRANT_PATH_NOT_EXACT');
  refuses(dir, { specRoots: [TARGET, 'project/scripts/orchestration-v2/service/'] }, 'TASK_GRANT_PATH_NOT_EXACT');
});

test('it cannot reach any other orchestration file, activation file or grant', () => {
  // Named individually because each is a surface somebody could argue is
  // "close enough": the module tree it lives in, the directory its own
  // authority lives in, and the authority itself.
  const dir = tmpdir();
  for (const p of [
    'project/scripts/orchestration-v2/service/service.cjs',
    'project/scripts/orchestration-v2/orchestrator/',
    'project/docs/governance/coordination-v2/activation/',
    'project/docs/governance/coordination-v2/activation/STANDING-GRANT-MECHANICAL-GOVERNANCE-R01.json',
    'project/docs/governance/coordination-v2/activation/program-eligibility-authority.json',
  ]) {
    refuses(dir, { specRoots: [p] }, 'TASK_GRANT_PATH_NOT_EXACT');
  }
});

test('it cannot reach the DELIVERY_TRUTH surface or a product module', () => {
  const dir = tmpdir();
  refuses(dir, { specRoots: ['project/scripts/orchestration-v2/delivery/'] }, 'TASK_GRANT_PATH_NOT_EXACT');
  refuses(dir, { specRoots: ['project/apps/api/src/modules/office/'] }, 'TASK_GRANT_PATH_NOT_EXACT');
  refuses(dir, { specRoots: ['project/apps/api/src/modules/client/'] }, 'TASK_GRANT_PATH_NOT_EXACT');
});

test('a task class the grant does not name is refused', () => {
  const dir = tmpdir();
  refuses(dir, { taskClass: 'BOUNDED_CODE_FIX' }, 'TASK_GRANT_CLASS_FORBIDDEN');
  refuses(dir, { taskClass: 'CLOSURE_EVIDENCE' }, 'TASK_GRANT_CLASS_FORBIDDEN');
  refuses(dir, { taskClass: 'PRODUCTION_SCHEMA_MIGRATION' }, 'TASK_GRANT_CLASS_FORBIDDEN');
});

test('a lane the grant does not name is refused', () => {
  refuses(tmpdir(), { executorLane: 'CLAUDE_LOCAL' }, 'TASK_GRANT_LANE_FORBIDDEN');
});

test('a revocation file stops it even before consumption', () => {
  const dir = tmpdir();
  const repo = tmpdir();
  const rel = 'REVOKED-R04';
  fs.writeFileSync(path.join(repo, rel), 'owner withdrew this\n', 'utf8');
  assert.throws(
    () => G.assertUsable({ grant: grant({ revocationPath: rel }), dir, repoCwd: repo, taskId: TASK }),
    (e) => e.code === 'TASK_GRANT_REVOKED',
  );
});

test('a grant declaring more than one path is malformed, not merely broad', () => {
  // Refused at the shape, before any of the bindings are consulted: a one-shot
  // grant with two files has no answer for what happens when one merges.
  assert.throws(
    () => G.exactTarget(grant({ allowedPathRoots: [TARGET, 'x/'] })),
    (e) => e.code === 'TASK_GRANT_PATH_NOT_EXACT',
  );
  assert.throws(
    () => G.exactTarget(grant({ allowedPathRoots: [] })),
    (e) => e.code === 'TASK_GRANT_PATH_NOT_EXACT',
  );
});

test('a standing grant is left entirely alone', () => {
  // Every check here is gated on grantKind. A standing grant passing through
  // must not acquire one-shot semantics by proximity.
  const dir = tmpdir();
  const standing = grant({ grantKind: undefined });
  assert.equal(G.isOneShot(standing), false);
  assert.doesNotThrow(() => G.assertUsable({ grant: standing, dir, taskId: 'ANYTHING-ELSE-R09' }));
  assert.equal(G.recordPr({ grant: standing, dir, prNumber: 1 }), null);
  assert.equal(G.consume({ grant: standing, dir, mergeSha: 'e'.repeat(40) }), null);
});

test('the ledger is shared, so a second process sees the first one spend it', () => {
  // The whole point of putting it in the git common dir. Simulated by reading
  // through a second, independently constructed view of the same directory.
  const dir = tmpdir();
  G.consume({ grant: grant(), dir, taskId: TASK, entryId: 'e1', prNumber: 1801, mergeSha: 'f'.repeat(40) });
  delete require.cache[require.resolve('./one-shot-grant.cjs')];
  const Fresh = require('./one-shot-grant.cjs');
  assert.equal(Fresh.statusOf(dir, grant()).state, 'CONSUMED');
});
