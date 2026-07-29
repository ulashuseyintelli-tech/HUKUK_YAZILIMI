'use strict';
/**
 * TASK_SCOPED vs PROGRAM_STANDING — the discriminator, not a guess from shape.
 *
 * The defect this repairs: validateAgainstGrant ran ONE contract — an exact
 * `authorizedTasks` pin per task — against every grant it was handed. That is
 * correct for a grant scoped to one task, and it is wrong for the other eight
 * grants in this repository, which authorize a PROGRAM and cannot enumerate
 * tasks that do not exist yet. Every one of them failed TASK_NOT_IN_GRANT on
 * the very first task ever run through runTask() against its own standing
 * grant — RECEIVABLE, not a synthetic pilot.
 *
 * The tempting fix — "skip the pin when authorizedTasks is absent" — was
 * rejected on purpose. An absent field is not proof the grant is standing; it
 * is equally a task-scoped grant somebody forgot to fill in, and treating
 * silence as standing authority would let a malformed grant escalate into one
 * that runs anything in its path roots. So the kind is DECLARED, checked
 * against exactly two values, and anything else — including no value — is
 * refused by name.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const A = require('./authority.cjs');

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const EXCERPT = 'the owner ratified this grant';
const EXCERPT_SHA = sha256(EXCERPT);

function spec(over) {
  return Object.assign(
    {
      schemaVersion: 1,
      taskId: 'GK-TASK-01',
      taskSpecVersion: 1,
      profile: 'BOUNDED_CODE_TASK',
      declaredIntent: 'grant-kind test probe',
      boundaryPolicy: { allowedRoots: ['fixture/lane/'] },
      requiredTests: [{ argv: ['node', '-e', '0'] }],
      predecessorTaskIds: [],
      baseDriftPolicy: 'REFRESH_BEFORE_EXECUTION',
      baseSha: 'a'.repeat(40),
      successorDisposition: 'NO_SUCCESSOR',
    },
    over || {},
  );
}

function ratification(over) {
  return Object.assign(
    { sourcePath: 'a.md', sourceCommitSha: 'b'.repeat(40), exactExcerpt: EXCERPT, excerptSha256: EXCERPT_SHA },
    over || {},
  );
}

function baseGrant(over) {
  return Object.assign(
    {
      schemaVersion: 1,
      grantId: 'GK-GRANT-01',
      semanticAuthorityRef: { kind: 'SEMANTIC_AUTHORITY', recordId: 'SEM', sourcePath: 'a.md' },
      executionGrantRef: { kind: 'EXECUTION_GRANT', recordId: 'EXE', sourcePath: 'b.md' },
      ownerRatificationEvidence: ratification(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revocationPath: 'x/REVOKED',
    },
    over || {},
  );
}

function pin(s) {
  const d = A.specDigests(s);
  return {
    taskId: s.taskId,
    taskSpecVersion: s.taskSpecVersion,
    taskSpecSha256: d.taskSpecSha256,
    declaredIntentSha256: d.declaredIntentSha256,
    boundaryPolicySha256: d.boundaryPolicySha256,
    requiredTestsSha256: d.requiredTestsSha256,
  };
}

function taskScopedGrant(theSpec, over) {
  return baseGrant(
    Object.assign(
      { grantKind: 'TASK_SCOPED_ONE_SHOT', manualMergeRequired: true, authorizedTasks: [pin(theSpec)] },
      over || {},
    ),
  );
}

function standingGrant(over) {
  return baseGrant(
    Object.assign(
      {
        grantKind: 'PROGRAM_STANDING',
        standingGrantId: 'GK-STANDING-01',
        program: { programId: 'GK_PROGRAM' },
        allowedTaskClasses: ['BOUNDED_CODE_FIX'],
        allowedExecutorLanes: ['CODEX_LOCAL'],
        // Wide enough to contain the prohibited subtree below: the allowed-root
        // check runs BEFORE the prohibited-root check, so a path outside both
        // would report BOUNDARY_EXCEEDS_STANDING_GRANT rather than the
        // prohibition test 6 is about.
        allowedPathRoots: ['fixture/'],
        prohibitedPathRoots: ['fixture/forbidden/'],
        maxConcurrency: 1,
        requiredIndependentReview: true,
        ciPolicy: { requireTerminalSuccess: true, allowSkipped: false, allowNeutral: true },
        mergePolicy: { method: 'SQUASH', autoMergeAuthorized: true, repositoryWideAutoMerge: false },
        prohibitions: {
          noPrivilegeDelegation: true,
          noSecretAccessExpansion: true,
          noProductionDataMutation: true,
          noCrossProgramMutation: true,
          noSelfAuthorizationChange: true,
        },
        parentAuthorizationRef: { authorizationId: 'OWNER-X', sourcePath: 'y.md', payloadSha256: 'c'.repeat(64) },
        manualMergeRequired: false,
        autoMergeAuthorizedBy: 'OWNER-X',
      },
      over || {},
    ),
  );
}

// ───────────────────────────────────────────────────────── TASK_SCOPED (1-3)

test('1. TASK_SCOPED with a matching authorizedTasks entry passes', () => {
  const s = spec();
  const v = A.validateAgainstGrant({ grant: taskScopedGrant(s), spec: s });
  assert.equal(v.grantId, 'GK-GRANT-01');
});

test('2. TASK_SCOPED with authorizedTasks entirely missing fails closed', () => {
  const s = spec();
  const g = taskScopedGrant(s);
  delete g.authorizedTasks;
  assert.throws(
    () => A.validateAgainstGrant({ grant: g, spec: s }),
    (e) => e.code === 'TASK_NOT_IN_GRANT',
  );
});

test('3. TASK_SCOPED pinning a different task id refuses this one', () => {
  const pinned = spec({ taskId: 'GK-OTHER-TASK' });
  const asked = spec({ taskId: 'GK-TASK-01' });
  assert.throws(
    () => A.validateAgainstGrant({ grant: taskScopedGrant(pinned), spec: asked }),
    (e) => e.code === 'TASK_NOT_IN_GRANT',
  );
});

// ─────────────────────────────────────────────────────── PROGRAM_STANDING (4-8)

test('4. PROGRAM_STANDING with matching program/taskClass/path passes', () => {
  const s = spec();
  const v = A.validateAgainstGrant({
    grant: standingGrant(),
    spec: s,
    taskClass: 'BOUNDED_CODE_FIX',
    executorLane: 'CODEX_LOCAL',
  });
  assert.equal(v.grantId, 'GK-GRANT-01');
  // No per-task pin exists for a standing grant, and none is invented.
  assert.equal(v.pinned, null);
});

test('5. PROGRAM_STANDING run for a task class the grant never listed is refused', () => {
  // "wrong program" in practice: the boundary and task-class vocabulary are
  // what stand in for program identity here, since a standing grant is
  // resolved BY the program it belongs to, not matched against one.
  const s = spec();
  assert.throws(
    () => A.validateAgainstGrant({ grant: standingGrant(), spec: s, taskClass: 'TEST_ONLY_CHARACTERIZATION', executorLane: 'CODEX_LOCAL' }),
    (e) => e.code === 'TASK_CLASS_NOT_GRANTED',
  );
});

test('6. PROGRAM_STANDING refuses a plan that touches a prohibited path', () => {
  const s = spec({ boundaryPolicy: { allowedRoots: ['fixture/forbidden/'] } });
  assert.throws(
    () => A.validateAgainstGrant({ grant: standingGrant(), spec: s, taskClass: 'BOUNDED_CODE_FIX', executorLane: 'CODEX_LOCAL' }),
    (e) => e.code === 'BOUNDARY_TOUCHES_PROHIBITED_SURFACE',
  );
});

test('7. PROGRAM_STANDING refuses an unauthorized task class by name', () => {
  const s = spec();
  assert.throws(
    () => A.validateAgainstGrant({ grant: standingGrant(), spec: s, taskClass: 'PRODUCTION_SCHEMA_MIGRATION', executorLane: 'CODEX_LOCAL' }),
    (e) => e.code === 'TASK_CLASS_UNKNOWN' || e.code === 'TASK_CLASS_NOT_GRANTED',
  );
});

test('8. A grant missing an explicit, recognized grantKind is refused — never treated as standing', () => {
  // This is the fix's entire point: absence of a discriminator is not
  // evidence of any particular kind. Three ways a grant can fail to declare
  // one, all refused the same way.
  for (const bad of [undefined, null, '', 'STANDING', 'standing', 'TASK_SCOPED']) {
    const g = standingGrant({ grantKind: bad });
    const s = spec();
    assert.throws(
      () => A.validateAgainstGrant({ grant: g, spec: s, taskClass: 'BOUNDED_CODE_FIX', executorLane: 'CODEX_LOCAL' }),
      (e) => e.code === 'GRANT_KIND_MISSING_OR_UNKNOWN',
      String(bad),
    );
  }
});

// ────────────────────────────────────────────────────────────────── (9-12)

test('9. a task-scoped grant cannot pin a boundary wider than its own allowed roots', () => {
  // The shape "child grant tries to widen a standing grant" takes here: a
  // one-shot grant is not nested inside a standing one in this model — it is
  // its own, narrower authorization — and its OWN allowedModuleRoots still
  // bounds it, checked independently of authorizedTasks matching.
  const s = spec({ boundaryPolicy: { allowedRoots: ['fixture/lane/', 'fixture/other-lane/'] } });
  const g = taskScopedGrant(s, { allowedModuleRoots: ['fixture/lane/'] });
  assert.throws(
    () => A.validateAgainstGrant({ grant: g, spec: s }),
    (e) => e.code === 'BOUNDARY_EXCEEDS_GRANT',
  );
});

test('10. a revoked standing grant authorizes nothing', () => {
  const s = spec();
  assert.throws(
    () => A.validateAgainstGrant({ grant: standingGrant(), spec: s, taskClass: 'BOUNDED_CODE_FIX', executorLane: 'CODEX_LOCAL', revoked: true }),
    (e) => e.code === 'GRANT_REVOKED',
  );
});

test('11. an expired standing grant authorizes nothing', () => {
  const s = spec();
  const g = standingGrant({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.throws(
    () => A.validateAgainstGrant({ grant: g, spec: s, taskClass: 'BOUNDED_CODE_FIX', executorLane: 'CODEX_LOCAL' }),
    (e) => e.code === 'GRANT_EXPIRED',
  );
});

test('12. a consumed one-shot grant cannot authorize a second task', () => {
  // validateAgainstGrant answers "is this grant well-formed and unexpired";
  // whether it has already been SPENT is one-shot-grant.cjs's question, asked
  // again at dispatch and again immediately before merge. Both gates are
  // exercised here rather than assuming either alone is sufficient.
  const oneShot = require('./one-shot-grant.cjs');
  const s = spec();
  const g = Object.assign(taskScopedGrant(s), { standingGrantId: 'GK-ONESHOT-01' });
  const dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'gov-gk-'));
  oneShot.consume({ grant: g, dir, taskId: s.taskId, mergeSha: 'd'.repeat(40) });
  assert.throws(
    () => oneShot.assertUsable({ grant: g, dir, taskId: s.taskId }),
    (e) => e.code === 'TASK_GRANT_CONSUMED',
  );
  // validateAgainstGrant itself still passes shape/ratification/pin — spend
  // state is not its concern, and conflating the two would mean a spent grant
  // could still be "re-verified" as merely well-formed and mistaken for usable.
  assert.doesNotThrow(() => A.validateAgainstGrant({ grant: g, spec: s }));
  require('fs').rmSync(dir, { recursive: true, force: true });
});

// ──────────────────────────────────────────────── (13-15) real committed grants

test('13. the CLIENT standing grant, as committed, passes runTask-shaped authorization', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', '..', '..', '..');
  const g = JSON.parse(
    fs.readFileSync(path.join(root, 'project/docs/governance/coordination-v2/activation/STANDING-GRANT-CLIENT-LIVE-R01.json'), 'utf8'),
  );
  const s = spec({
    taskId: 'GK-CLIENT-VERIFY',
    boundaryPolicy: { allowedRoots: [g.allowedPathRoots[0]] },
  });
  const v = A.validateAgainstGrant({
    grant: g,
    spec: s,
    taskClass: g.allowedTaskClasses[0],
    executorLane: g.allowedExecutorLanes[0],
    nowMs: Date.now(),
  });
  assert.equal(v.grantId, g.grantId);
});

test('14. the RECEIVABLE standing grant, as committed, passes runTask-shaped authorization', () => {
  // The exact gate the live task hit: TASK_NOT_IN_GRANT on RECEIVABLE's own
  // standing grant, the first time any program's standing grant was driven
  // through this function rather than a one-shot grant of its own.
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', '..', '..', '..');
  const g = JSON.parse(
    fs.readFileSync(path.join(root, 'project/docs/governance/coordination-v2/activation/STANDING-GRANT-RECEIVABLE-LIVE-R01.json'), 'utf8'),
  );
  const s = spec({
    taskId: 'RECEIVABLE-LEGAL-BASIS-RESOLVER-CONTROLLED-DEFAULT-OFF-R01',
    boundaryPolicy: { allowedRoots: [g.allowedPathRoots[0]] },
  });
  const v = A.validateAgainstGrant({
    grant: g,
    spec: s,
    taskClass: g.allowedTaskClasses[g.allowedTaskClasses.indexOf('BOUNDED_CODE_FIX')],
    executorLane: g.allowedExecutorLanes[0],
    nowMs: Date.now(),
  });
  assert.equal(v.grantId, g.grantId);
});

test('15. a UYAP-shaped task cannot run under the RECEIVABLE grant', () => {
  // Not a program-identity field comparison — this repository has none, by
  // design (queueExceptions aside). The separation is structural: a UYAP task
  // asks for uyap/ paths, and no allowedPathRoots on the RECEIVABLE grant
  // reaches there.
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', '..', '..', '..');
  const receivable = JSON.parse(
    fs.readFileSync(path.join(root, 'project/docs/governance/coordination-v2/activation/STANDING-GRANT-RECEIVABLE-LIVE-R01.json'), 'utf8'),
  );
  const uyapShapedTask = spec({
    taskId: 'GK-UYAP-TASK',
    boundaryPolicy: { allowedRoots: ['project/apps/api/src/modules/uyap/authority/'] },
  });
  assert.throws(
    () =>
      A.validateAgainstGrant({
        grant: receivable,
        spec: uyapShapedTask,
        taskClass: receivable.allowedTaskClasses[0],
        executorLane: receivable.allowedExecutorLanes[0],
        nowMs: Date.now(),
      }),
    (e) => e.code === 'BOUNDARY_EXCEEDS_STANDING_GRANT',
  );
});

// ───────────────────────────────────────────────────────────── (16) legacy

// ────────────────────────────────────────── composition, no injected validator

test('composition: the CLIENT standing grant, as committed, reaches runTask AUTHORIZED for real', async () => {
  // Not a call to validateAgainstGrant in isolation — this drives the actual
  // orchestrator.cjs runTask() the way runOnce() does, with a real fixture
  // repo, a real worktree/executor stand-in, and the COMMITTED CLIENT grant
  // file. Only the worktree and the executor process are stand-ins; the
  // authorization gate itself is never mocked, which is the property this
  // repair exists to prove — a fake validator injected here would make the
  // test pass regardless of whether the real one still works.
  const F = require('./pilot-fixtures.cjs');
  const orch = require('./orchestrator.cjs');
  const stateMod = require('./state.cjs');
  const fs = require('fs');
  const path = require('path');

  const root = path.join(__dirname, '..', '..', '..', '..');
  const grant = JSON.parse(
    fs.readFileSync(path.join(root, 'project/docs/governance/coordination-v2/activation/STANDING-GRANT-CLIENT-LIVE-R01.json'), 'utf8'),
  );

  const repo = F.fixtureRepo();
  const taskSpec = {
    schemaVersion: 1,
    taskId: 'GK-COMPOSITION-CLIENT-01',
    taskSpecVersion: 1,
    profile: 'BOUNDED_CODE_TASK',
    declaredIntent: 'composition probe against the committed CLIENT grant',
    boundaryPolicy: { allowedRoots: ['fixture/lane-a/'] },
    requiredTests: [{ argv: [F.FAKE === undefined ? 'node' : process.execPath, '-e', 'process.exit(0)'] }],
    predecessorTaskIds: [],
    baseDriftPolicy: 'REFRESH_BEFORE_EXECUTION',
    successorDisposition: 'NO_SUCCESSOR',
  };
  // The committed grant's own boundary is the real one (project/apps/api/...);
  // the fixture repo only has fixture/ on disk. Widened here, on a CLONE of
  // the grant object, so a probe task can prove authorization without needing
  // the real product tree checked out — the ratification, merge policy and
  // task-class fields are exactly as committed and untouched.
  const grantForProbe = Object.assign({}, grant, { allowedPathRoots: ['fixture/lane-a/'] });

  F.seedChange(repo, 'fixture/lane-a/out.txt', 'composition probe\n');

  const ctx = {
    store: stateMod.createStore(stateMod.defaultStateDir(repo)),
    repoCwd: repo,
    spec: taskSpec,
    grant: grantForProbe,
    taskClass: grant.allowedTaskClasses[grant.allowedTaskClasses.indexOf('BOUNDED_CODE_FIX')],
    holder: grant.allowedExecutorLanes[0],
    baseRef: 'HEAD',
    worktreeFactory: F.inlineWorktree(repo),
    executorOverride: F.fakeResolved(grant.allowedExecutorLanes[0]),
    executorArgv: [F.FAKE, '--mode', 'ok'],
    prProvider: F.providers().prProvider,
    ciProvider: F.providers().ciProvider,
  };

  const r = await orch.runTask(ctx);
  assert.ok(r.trace.includes('AUTHORIZED'), 'runTask reached the real authorization stage: ' + JSON.stringify(r.trace));
  const AUTHORITY_CODES = [
    'GRANT_KIND_MISSING_OR_UNKNOWN',
    'TASK_NOT_IN_GRANT',
    'OWNER_RATIFICATION_EVIDENCE_MISSING',
    'TASK_CLASS_NOT_GRANTED',
    'BOUNDARY_EXCEEDS_STANDING_GRANT',
  ];
  assert.equal(
    AUTHORITY_CODES.indexOf(r.blockerCode),
    -1,
    'the committed CLIENT grant must clear real authorization: ' + r.blockerCode + ' ' + r.detail,
  );
});

test('16. a legacy grant that predates grantKind is refused, not guessed at', () => {
  // The MECHANICAL_GOVERNANCE grant, exactly as committed, carries neither
  // grantKind nor authorizedTasks nor the ratification/merge fields this
  // function now requires of every grant. It is left exactly as it was —
  // this repair does not touch it, because its own callers (governance task
  // classes) never reach validateAgainstGrant in the first place — but if it
  // ever were handed here, ambiguity must fail closed rather than being
  // read as either kind.
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..', '..', '..', '..');
  const g = JSON.parse(
    fs.readFileSync(path.join(root, 'project/docs/governance/coordination-v2/activation/STANDING-GRANT-MECHANICAL-GOVERNANCE-R01.json'), 'utf8'),
  );
  assert.equal(g.grantKind, undefined, 'fixture assumption: this grant still declares no kind');
  const s = spec();
  assert.throws(
    () => A.validateAgainstGrant({ grant: g, spec: s }),
    (e) => e.code === 'GRANT_KIND_MISSING_OR_UNKNOWN',
  );
});
