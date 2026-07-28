'use strict';
/**
 * Bound-path acceptance — the chain, not the parts.
 *
 * Every module here already had isolated unit tests, and every one of them
 * passed while the system could not run a single task: nothing joined them.
 * These tests exist at the joins. Their subject is the chain
 *
 *   request → enqueue → admission → queue → run-once → dispatch → executor
 *
 * and the property under test is always the same one: a gate that is bypassable
 * by taking a different route is not a gate.
 *
 * AC30 spawns the REAL CLI as a child process against a REAL on-disk queue,
 * because everything else here shares this process's module cache and would not
 * notice if the CLI stopped calling any of it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const Q = require('../orchestrator/queue.cjs');
const S = require('./service.cjs');
const requestMod = require('./request.cjs');
const authority = require('../orchestrator/authority.cjs');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const ACT = 'project/docs/governance/coordination-v2/activation';
const CLI = path.join(__dirname, 'orch-service.cjs');

const dirs = [];
function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-bp-'));
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

const OFFICE_GRANT = ACT + '/STANDING-GRANT-OFFICE-LIVE-R01.json';
const COLL_GRANT = ACT + '/STANDING-GRANT-COLLECTION-LIVE-R01.json';
const GOV_GRANT = ACT + '/STANDING-GRANT-MECHANICAL-GOVERNANCE-R01.json';

function readGrant(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/**
 * A scratch repo that looks enough like the real one for resolution: the same
 * governance paths, the real manifest and the real grants, and a plan written
 * per test. Nothing here reaches the network or the real queue.
 */
function scratchRepo(over) {
  const root = tmpdir();
  const copy = (rel) => {
    const dst = path.join(root, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dst);
  };
  fs.mkdirSync(path.join(root, ACT), { recursive: true });
  copy('project/docs/governance/coordination-v2/programs.manifest.json');
  for (const g of [OFFICE_GRANT, COLL_GRANT, GOV_GRANT]) copy(g);
  if (over && over.manifest) {
    fs.writeFileSync(
      path.join(root, 'project/docs/governance/coordination-v2/programs.manifest.json'),
      JSON.stringify(over.manifest, null, 2),
      'utf8',
    );
  }
  return root;
}

function writePlan(root, spec) {
  const rel = 'plans/' + spec.taskId + '.json';
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(spec, null, 2), 'utf8');
  return rel;
}

function writeRequest(root, req) {
  const rel = 'requests/' + req.taskId + '.json';
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(Object.assign({ schemaVersion: 1 }, req), null, 2), 'utf8');
  return rel;
}

/** A valid OFFICE request plus its plan, ready to enqueue. */
function officeRequest(root, over) {
  const o = over || {};
  const g = readGrant(OFFICE_GRANT);
  const spec = Object.assign(
    {
      taskId: o.taskId || 'BP-OFFICE-01',
      boundaryPolicy: {
        allowedRoots: o.allowedRoots || [g.allowedPathRoots[0] + '__tests__/'],
        maxChangedFiles: 2,
      },
    },
    o.spec || {},
  );
  const planPath = writePlan(root, spec);
  return {
    spec,
    requestPath: writeRequest(root, {
      programId: o.programId || 'OFFICE',
      taskId: spec.taskId,
      taskClass: o.taskClass || 'TEST_ONLY_CHARACTERIZATION',
      planPath,
      standingGrantPath: o.standingGrantPath || OFFICE_GRANT,
      executorLane: o.executorLane || 'CLAUDE_LOCAL',
    }),
  };
}

function svc(root, over) {
  const queue = Q.createQueue(path.join(root, '.queue'));
  return { queue, service: S.createService(Object.assign({ repoCwd: root, queue }, over || {})) };
}

// ───────────────────────────────────────────────────── ENQUEUE (AC01–AC11)

test('AC01  a valid request is admitted and lands in the queue', () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const r = service.enqueue({ requestPath: officeRequest(root).requestPath });

  assert.equal(r.admitted, true, r.refusal + ' ' + r.detail);
  assert.equal(r.entry.state, 'QUEUED');
  assert.equal(r.entry.programId, 'OFFICE');
  assert.equal(queue.list().length, 1);
  // The entry must be able to find its own authority again at dispatch.
  assert.ok(r.entry.requestPath, 'the entry does not know where its request is');
});

test('AC02  enqueueing the same request twice yields one entry', () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const req = officeRequest(root).requestPath;
  const a = service.enqueue({ requestPath: req });
  const b = service.enqueue({ requestPath: req });
  assert.equal(b.entry.entryId, a.entry.entryId);
  assert.equal(b.entry.deduplicated, true);
  assert.equal(queue.list().length, 1);
});

test('AC03  a program the manifest does not call ELIGIBLE is refused', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'project/docs/governance/coordination-v2/programs.manifest.json'), 'utf8'));
  for (const p of manifest.programs) if (p.programId === 'OFFICE') p.liveExecutionEligibility = 'DENIED';
  const root = scratchRepo({ manifest });
  const { queue, service } = svc(root);
  const r = service.enqueue({ requestPath: officeRequest(root).requestPath });
  assert.equal(r.admitted, false);
  assert.equal(r.refusal, 'PROGRAM_NOT_ELIGIBLE');
  assert.equal(queue.list().length, 0, 'a refused request must leave nothing behind');
});

test('AC04  a revoked standing grant is refused at enqueue', () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const r = service.enqueue({ requestPath: officeRequest(root).requestPath, isRevoked: () => true });
  assert.equal(r.refusal, 'STANDING_GRANT_REVOKED');
  assert.equal(queue.list().length, 0);
});

test('AC06  a path outside the granted roots is refused', () => {
  const root = scratchRepo();
  const { service } = svc(root);
  const r = service.enqueue({
    requestPath: officeRequest(root, { allowedRoots: ['project/apps/api/src/modules/debtor/'] }).requestPath,
  });
  assert.equal(r.refusal, 'BOUNDARY_EXCEEDS_STANDING_GRANT');
});

test('AC07  one program cannot be run under the other\'s grant', () => {
  const root = scratchRepo();
  const { service } = svc(root);
  const coll = readGrant(COLL_GRANT);
  const r = service.enqueue({
    requestPath: officeRequest(root, { allowedRoots: [coll.allowedPathRoots[0]] }).requestPath,
  });
  assert.equal(r.refusal, 'BOUNDARY_EXCEEDS_STANDING_GRANT');
});

test('AC08  a task class the grant does not allow is refused', () => {
  const root = scratchRepo();
  const { service } = svc(root);
  const r = service.enqueue({ requestPath: officeRequest(root, { taskClass: 'PRODUCTION_SCHEMA_MIGRATION' }).requestPath });
  assert.ok(r.refusal === 'TASK_CLASS_UNKNOWN' || r.refusal === 'TASK_CLASS_NOT_GRANTED', r.refusal);
});

test('AC09  the governance profile admits a request/result write', () => {
  const root = scratchRepo();
  const { service } = svc(root);
  const spec = {
    taskId: 'BP-GOV-01',
    boundaryPolicy: { allowedRoots: ['project/docs/governance/coordination-requests/REQ-1/request.md'], maxChangedFiles: 1 },
  };
  const planPath = writePlan(root, spec);
  const requestPath = writeRequest(root, {
    programId: 'OFFICE',
    taskId: spec.taskId,
    taskClass: 'CLOSURE_EVIDENCE',
    planPath,
    standingGrantPath: GOV_GRANT,
  });
  const r = service.enqueue({ requestPath, operation: 'EXACT_APPEND_AT_DECLARED_ANCHOR' });
  assert.equal(r.admitted, true, r.refusal + ' ' + r.detail);
});

test('AC10  the governance profile refuses canonical governance and control-plane writes', () => {
  const root = scratchRepo();
  const { service } = svc(root);
  for (const target of [
    'project/docs/governance/decision-log.md',
    'project/scripts/orchestration-v2/orchestrator/authority.cjs',
    ACT + '/program-eligibility-authority.json',
  ]) {
    const spec = { taskId: 'BP-GOV-BAD-' + target.length, boundaryPolicy: { allowedRoots: [target], maxChangedFiles: 1 } };
    const requestPath = writeRequest(root, {
      programId: 'OFFICE',
      taskId: spec.taskId,
      taskClass: 'CANONICAL_STATUS_UPDATE',
      planPath: writePlan(root, spec),
      standingGrantPath: GOV_GRANT,
    });
    const r = service.enqueue({ requestPath, operation: 'EXACT_LITERAL_REPLACEMENT' });
    assert.equal(r.admitted, false, target + ' was admitted');
    assert.ok(
      r.refusal === 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE' || r.refusal === 'GOVERNANCE_TOUCHES_PROHIBITED_SURFACE',
      target + ' -> ' + r.refusal,
    );
  }
});

test('AC10b a governance grant cannot be used to run code, and vice versa', () => {
  // Two separate confusions, both of which would put a task through the wrong
  // validator entirely.
  const root = scratchRepo();
  const { service } = svc(root);
  const asCode = service.enqueue({ requestPath: officeRequest(root, { taskId: 'BP-X1', standingGrantPath: GOV_GRANT }).requestPath });
  assert.equal(asCode.refusal, 'GOVERNANCE_GRANT_CANNOT_RUN_CODE');

  const spec = { taskId: 'BP-X2', boundaryPolicy: { allowedRoots: ['project/docs/governance/coordination-requests/R/request.md'], maxChangedFiles: 1 } };
  const requestPath = writeRequest(root, {
    programId: 'OFFICE', taskId: spec.taskId, taskClass: 'CLOSURE_EVIDENCE',
    planPath: writePlan(root, spec), standingGrantPath: OFFICE_GRANT,
  });
  assert.equal(service.enqueue({ requestPath }).refusal, 'GOVERNANCE_PROFILE_MISMATCH');
});

test('AC11  the kill switch blocks enqueue', () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  service.engageKillSwitch('AC11');
  const r = service.enqueue({ requestPath: officeRequest(root).requestPath });
  assert.equal(r.refusal, 'KILL_SWITCH_ENGAGED');
  assert.equal(queue.list().length, 0);
});

test('a request carrying a credential field is refused before anything is read', () => {
  const root = scratchRepo();
  const { service } = svc(root);
  const requestPath = writeRequest(root, {
    programId: 'OFFICE', taskId: 'BP-SECRET', taskClass: 'TEST_ONLY_CHARACTERIZATION',
    planPath: 'plans/none.json', standingGrantPath: OFFICE_GRANT, githubToken: 'ghp_x',
  });
  assert.equal(service.enqueue({ requestPath }).refusal, 'REQUEST_CONTAINS_CREDENTIAL_FIELD');
});

// ─────────────────────────────────────────────────── DISPATCH (AC05, AC12–AC21)

/**
 * The attestation a real MERGE_READY result always carries.
 *
 * These fakes used to omit it, and nothing noticed while MERGE_READY was where
 * the chain stopped. Once the handoff became durable it mattered: finalization
 * reads the attestation from the queue and refuses without one, so a fake that
 * reports MERGE_READY with no attestation is claiming a state the orchestrator
 * cannot actually produce.
 */
function fakeAttestation(over) {
  return Object.assign(
    {
      schemaVersion: 1,
      prNumber: 4242,
      prHeadSha: 'a'.repeat(40),
      targetBranch: 'main',
      targetBranchObservedSha: 'd'.repeat(40),
      mergeBaseSha: 'e'.repeat(40),
      requiredCiResultSetSha256: '0'.repeat(64),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      conjunction: { executorExitSuccess: true },
    },
    over || {},
  );
}

/** A fake runner that records it was called and reports a PR. */
function fakeRun(over) {
  const calls = [];
  return {
    calls,
    buildContext: (o) => Object.assign({ holder: o.lane || 'CLAUDE_LOCAL' }, o),
    runTask: async (ctx) => {
      calls.push(ctx.spec.taskId);
      return Object.assign(
        {
          disposition: 'MERGE_READY',
          taskId: ctx.spec.taskId,
          pr: { number: 4242, headSha: 'a'.repeat(40), branch: 'claude/bp' },
          worktreePath: null,
          attestation: fakeAttestation(),
        },
        over || {},
      );
    },
  };
}

test('AC05  a grant revoked AFTER enqueue is caught at dispatch, not run', async () => {
  const root = scratchRepo();
  const { queue, service } = svc(root, { isRevoked: () => true });
  // Admitted while live...
  const clean = S.createService({ repoCwd: root, queue });
  const e = clean.enqueue({ requestPath: officeRequest(root).requestPath });
  assert.equal(e.admitted, true);

  const runner = fakeRun();
  const r = await service.runOnce(runner);
  assert.equal(runner.calls.length, 0, 'the executor must never have started');
  assert.equal(r.acted, 'BLOCKED');
  assert.equal(queue.get(e.entry.entryId).state, 'BLOCKED');
  assert.equal(queue.get(e.entry.entryId).blockerCode, 'STANDING_GRANT_REVOKED');
});

test('AC12  the kill switch blocks dispatch', async () => {
  const root = scratchRepo();
  const { service } = svc(root);
  service.enqueue({ requestPath: officeRequest(root).requestPath });
  service.engageKillSwitch('AC12');
  const runner = fakeRun();
  const r = await service.runOnce(runner);
  assert.equal(r.acted, 'HALTED');
  assert.equal(runner.calls.length, 0);
});

test('AC13  a paused service does not dispatch', async () => {
  const root = scratchRepo();
  const { service } = svc(root);
  service.enqueue({ requestPath: officeRequest(root).requestPath });
  service.pause('AC13');
  const runner = fakeRun();
  const r = await service.runOnce(runner);
  assert.equal(r.acted, 'IDLE');
  assert.equal(r.reason, 'PAUSED');
  assert.equal(runner.calls.length, 0);
});

test('AC14  run-once dispatches exactly one task and records the PR', async () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const a = service.enqueue({ requestPath: officeRequest(root, { taskId: 'BP-A' }).requestPath });
  service.enqueue({ requestPath: officeRequest(root, { taskId: 'BP-B' }).requestPath });

  const runner = fakeRun();
  const r = await service.runOnce(runner);
  assert.equal(r.acted, 'RAN');
  assert.equal(runner.calls.length, 1, 'exactly one');

  const entry = queue.get(a.entry.entryId);
  assert.equal(entry.state, 'MERGE_READY');
  assert.equal(entry.prNumber, 4242, 'the PR number is durable, not printed and lost');
  assert.equal(entry.prHeadSha, 'a'.repeat(40));
});

test('AC15  run-until-idle processes tasks serially and stops when empty', async () => {
  const root = scratchRepo();
  const { service } = svc(root);
  for (const id of ['BP-1', 'BP-2', 'BP-3']) service.enqueue({ requestPath: officeRequest(root, { taskId: id }).requestPath });

  const order = [];
  const runner = {
    buildContext: (o) => Object.assign({ holder: 'CLAUDE_LOCAL' }, o),
    runTask: async (ctx) => {
      order.push(ctx.spec.taskId);
      return { disposition: 'MERGE_READY', taskId: ctx.spec.taskId, pr: { number: 1, headSha: 'b'.repeat(40) }, attestation: fakeAttestation({ prNumber: 1, prHeadSha: 'b'.repeat(40) }) };
    },
  };
  // MERGE_READY is not terminal, so the slot stays occupied; the drain reports
  // that rather than spinning. Serial is the property under test.
  const r = await service.runUntilIdle(Object.assign({ maxTasks: 5 }, runner));
  assert.equal(order.length, 1, 'one at a time — the slot is not shared');
  assert.equal(r.stopped, 'SLOT_OCCUPIED');
});

test('AC16  a task already owned by a live worker is not dispatched twice', async () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const e = service.enqueue({ requestPath: officeRequest(root).requestPath });
  // Simulate a live worker holding it.
  queue.transition({ entryId: e.entry.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });

  const runner = fakeRun();
  const r = await service.runOnce(runner);
  assert.equal(r.reason, 'SLOT_OCCUPIED');
  assert.equal(runner.calls.length, 0);
});

test('AC18  a worker restart preserves the queue and its PR evidence', async () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const e = service.enqueue({ requestPath: officeRequest(root).requestPath });
  await service.runOnce(fakeRun());

  // A completely fresh service and queue object over the same directory.
  const reopened = Q.createQueue(queue.dir);
  const entry = reopened.get(e.entry.entryId);
  assert.equal(entry.state, 'MERGE_READY');
  assert.equal(entry.prNumber, 4242, 'the PR survived the process that opened it');
});

test('AC19  a plan edited between enqueue and dispatch is refused', async () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const { spec, requestPath } = officeRequest(root);
  const e = service.enqueue({ requestPath });

  // Someone widens the plan after it was admitted.
  const widened = JSON.parse(JSON.stringify(spec));
  widened.boundaryPolicy.maxChangedFiles = 99;
  fs.writeFileSync(path.join(root, 'plans/' + spec.taskId + '.json'), JSON.stringify(widened, null, 2), 'utf8');

  const runner = fakeRun();
  const r = await service.runOnce(runner);
  assert.equal(runner.calls.length, 0, 'the edited plan must never reach an executor');
  assert.equal(queue.get(e.entry.entryId).blockerCode, 'DISPATCH_PLAN_HASH_CHANGED');
});

test('AC20  a substituted standing grant is refused on identity', async () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const { requestPath } = officeRequest(root);
  const e = service.enqueue({ requestPath });

  // Point the same request at the other program's grant.
  const req = JSON.parse(fs.readFileSync(path.join(root, requestPath), 'utf8'));
  req.standingGrantPath = COLL_GRANT;
  req.programId = 'COLLECTION';
  fs.writeFileSync(path.join(root, requestPath), JSON.stringify(req, null, 2), 'utf8');

  const runner = fakeRun();
  await service.runOnce(runner);
  assert.equal(runner.calls.length, 0);
  assert.equal(queue.get(e.entry.entryId).blockerCode, 'DISPATCH_GRANT_IDENTITY_CHANGED');
});

test('a blocked executor result lands in the queue with its own code', async () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const e = service.enqueue({ requestPath: officeRequest(root).requestPath });
  const r = await service.runOnce(fakeRun({ disposition: 'BLOCKED', blockerCode: 'BLOCKED_BASE_SHA_DRIFT', pr: null }));
  assert.equal(r.acted, 'RAN');
  assert.equal(queue.get(e.entry.entryId).state, 'BLOCKED');
  assert.equal(queue.get(e.entry.entryId).blockerCode, 'BLOCKED_BASE_SHA_DRIFT');
});

// ───────────────────────────────────────────────────────── THE REAL CLI (AC30)

test('AC30  the real CLI enqueues to a real on-disk queue, and orch:run cannot bypass it', () => {
  // Everything above shares this process's module cache. This one does not: it
  // spawns the shipped CLI and reads the queue file it wrote. If the CLI ever
  // stops calling admission, only this test notices.
  const root = scratchRepo();
  const queueDir = path.join(root, '.cli-queue');
  const { requestPath } = officeRequest(root, { taskId: 'BP-CLI-01' });

  const run = (args) =>
    spawnSync(process.execPath, [CLI].concat(args, ['--repo', root, '--queue-dir', queueDir]), {
      encoding: 'utf8',
      cwd: root,
    });

  const ok = run(['enqueue', '--request', requestPath]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /ADMITTED/);

  // The queue is a file the CLI actually wrote.
  const log = path.join(queueDir, 'queue.jsonl');
  assert.ok(fs.existsSync(log), 'the CLI did not persist anything');
  const entries = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(entries[0].taskId, 'BP-CLI-01');
  assert.equal(entries[0].state, 'QUEUED');

  // Second enqueue deduplicates rather than creating a second task.
  assert.match(run(['enqueue', '--request', requestPath]).stdout, /ALREADY QUEUED/);

  const status = run(['status']);
  assert.match(status.stdout, /queue depth   : 1/);

  // A refused request writes nothing and exits non-zero.
  const bad = officeRequest(root, { taskId: 'BP-CLI-BAD', allowedRoots: ['project/scripts/orchestration-v2/'] });
  const refused = run(['enqueue', '--request', bad.requestPath]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /BOUNDARY_EXCEEDS_STANDING_GRANT/);
  assert.equal(fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter((e) => e.taskId === 'BP-CLI-BAD').length, 0);

  // And the old direct path refuses rather than reaching an executor.
  const direct = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'runtime', 'run-task.cjs'), '--plan', 'x.json', '--grant', 'y.json'],
    { encoding: 'utf8', cwd: root },
  );
  assert.equal(direct.status, 2);
  assert.match(direct.stderr, /ORCH_RUN_DIRECT_PATH_NOT_PERMITTED/);
});

test('the shipped request resolver agrees with the shipped grants', () => {
  // A cheap guard against the request schema and the grant schema drifting.
  const root = scratchRepo();
  const { requestPath } = officeRequest(root);
  const resolved = requestMod.load({ repoCwd: root, requestPath });
  assert.equal(resolved.standingGrant.program.programId, 'OFFICE');
  assert.equal(resolved.taskSpecSha256, authority.digest(resolved.spec));
});

// ───────────────────────────── MERGE_READY -> CLOSED (AC27, AC28, AC29)

/** A runner that reaches MERGE_READY, plus a closure step that reports CLOSED. */
function mergingRun(over) {
  const o = over || {};
  const calls = { ran: 0, merged: 0 };
  return {
    calls,
    buildContext: (a) => Object.assign({ holder: 'CLAUDE_LOCAL' }, a),
    runTask: async (ctx) => {
      calls.ran++;
      return { disposition: 'MERGE_READY', taskId: ctx.spec.taskId, pr: { number: 777, headSha: 'c'.repeat(40) }, attestation: fakeAttestation({ prNumber: 777, prHeadSha: 'c'.repeat(40) }) };
    },
    completeAfterOwnerMerge: async () => {
      calls.merged++;
      return o.closure || { disposition: 'CLOSED', mergeSha: 'd'.repeat(40), cleanup: { disposition: 'REMOVED' } };
    },
  };
}

test('AC27  a merged task reaches CLOSED, with the merge sha in the queue', async () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const { requestPath } = officeRequest(root, { taskId: 'BP-MERGE-1' });
  // autoMerge is a property of the request; without it the task parks at
  // MERGE_READY, which is the pilot behaviour.
  const req = JSON.parse(fs.readFileSync(path.join(root, requestPath), 'utf8'));
  req.autoMerge = true;
  fs.writeFileSync(path.join(root, requestPath), JSON.stringify(req, null, 2), 'utf8');

  const e = service.enqueue({ requestPath });
  const runner = mergingRun();
  const r = await service.runOnce(runner);

  assert.equal(runner.calls.merged, 1, 'the closure step ran');
  assert.equal(r.outcome.disposition, 'CLOSED');
  const entry = queue.get(e.entry.entryId);
  assert.equal(entry.state, 'CLOSED');
  assert.equal(entry.mergeSha, 'd'.repeat(40), 'the merge sha is durable');
  assert.equal(entry.prNumber, 777);
});

test('AC28  the queue records every stage between MERGE_READY and CLOSED', async () => {
  // A merge that happened and was forgotten is worse than one that never
  // happened, so each stage is written as it occurs rather than collapsed.
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const { requestPath } = officeRequest(root, { taskId: 'BP-MERGE-2' });
  const req = JSON.parse(fs.readFileSync(path.join(root, requestPath), 'utf8'));
  req.autoMerge = true;
  fs.writeFileSync(path.join(root, requestPath), JSON.stringify(req, null, 2), 'utf8');
  const e = service.enqueue({ requestPath });
  await service.runOnce(mergingRun());

  const history = fs.readFileSync(queue.logFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
    .filter((x) => x.entryId === e.entry.entryId).map((x) => x.state);
  for (const stage of ['MERGE_READY', 'MERGING', 'MERGED', 'SYNCING', 'CLEANING', 'CLOSED']) {
    assert.ok(history.indexOf(stage) !== -1, stage + ' missing from the history');
  }
  // The audit vocabulary is the finalizer's now, not the adapter's. #1694 wrote
  // MERGE_ATTEMPTED/TASK_CLOSED from forty inline lines that WP02 deleted: the
  // in-line route and the after-a-crash route are one implementation, so they
  // emit one set of events. Asserting the old labels would be asserting that the
  // second closure path still exists.
  const trail = service.auditTrail().map((x) => x.event);
  assert.ok(trail.indexOf('FINALIZE_ATTEMPTED') !== -1, 'the finalizer records the attempt');
  assert.ok(trail.indexOf('FINALIZE_CLOSED') !== -1, 'the finalizer records the closure');

  // And the merge sha is in the audit record, not only in the queue: the two are
  // read by different people at different times, and a merge that happened is
  // the one fact neither may be missing.
  const closed = service.auditTrail().filter((x) => x.event === 'FINALIZE_CLOSED')[0];
  assert.equal(closed.detail.mergeSha, 'd'.repeat(40));
  assert.equal(closed.detail.entryId, e.entry.entryId);
});

test('AC29  a CLOSED task frees the slot for the next one', async () => {
  const root = scratchRepo();
  const { service } = svc(root);
  for (const id of ['BP-Q1', 'BP-Q2']) {
    const { requestPath } = officeRequest(root, { taskId: id });
    const req = JSON.parse(fs.readFileSync(path.join(root, requestPath), 'utf8'));
    req.autoMerge = true;
    fs.writeFileSync(path.join(root, requestPath), JSON.stringify(req, null, 2), 'utf8');
    service.enqueue({ requestPath });
  }
  const runner = mergingRun();
  const r = await service.runUntilIdle(Object.assign({ maxTasks: 5 }, runner));
  assert.equal(runner.calls.ran, 2, 'both tasks ran, one after the other');
  assert.equal(r.stopped, 'QUEUE_EMPTY');
});

test('auto-merge needs BOTH the request and the grant — neither alone', async () => {
  const root = scratchRepo();
  const { queue, service } = svc(root);
  // Request does not ask for it; the grant does allow it.
  const e = service.enqueue({ requestPath: officeRequest(root, { taskId: 'BP-NOMERGE' }).requestPath });
  const runner = mergingRun();
  await service.runOnce(runner);
  assert.equal(runner.calls.merged, 0, 'no request, no merge');
  assert.equal(queue.get(e.entry.entryId).state, 'MERGE_READY', 'it parks for a human');
});

test('the kill switch is read once more immediately before the merge', async () => {
  // A merge is the least reversible thing this system does.
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const { requestPath } = officeRequest(root, { taskId: 'BP-KILLMERGE' });
  const req = JSON.parse(fs.readFileSync(path.join(root, requestPath), 'utf8'));
  req.autoMerge = true;
  fs.writeFileSync(path.join(root, requestPath), JSON.stringify(req, null, 2), 'utf8');
  const e = service.enqueue({ requestPath });

  const runner = mergingRun();
  const armed = Object.assign({}, runner, {
    runTask: async (ctx) => {
      // Engage it DURING the run, after admission and dispatch have both passed.
      service.engageKillSwitch('mid-run');
      return { disposition: 'MERGE_READY', taskId: ctx.spec.taskId, pr: { number: 778, headSha: 'e'.repeat(40) }, attestation: fakeAttestation({ prNumber: 778, prHeadSha: 'e'.repeat(40) }) };
    },
  });
  await service.runOnce(armed);
  assert.equal(runner.calls.merged, 0, 'nothing merged');

  // The entry stays in MERGE_READY rather than moving to BLOCKED, and that is
  // the stronger behaviour, not the weaker one. A kill switch is transient; the
  // queue table lets BLOCKED go only to QUEUED, and QUEUED re-runs the executor.
  // Blocking here would mean that releasing a switch ten minutes later opens a
  // SECOND pull request for work whose first one is already open.
  const entry = queue.get(e.entry.entryId);
  assert.equal(entry.state, 'MERGE_READY', 'a transient refusal must not strand the entry');
  assert.ok(!entry.blockerCode, 'not a blocker: nothing failed, a switch was on');

  // It must still be finalizable, so releasing the switch is the whole recovery.
  assert.equal(service.finalizable().filter((f) => f.entryId === e.entry.entryId).length, 1);

  // And the refusal has to be legible afterwards, or an operator sees an entry
  // that simply did not move.
  const refusals = service.auditTrail().filter((x) => x.event === 'FINALIZE_REFUSED');
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].detail.refusal, 'KILL_SWITCH_ENGAGED');

  // Releasing it lets the same entry finish — proving the refusal cost nothing
  // but the attempt.
  service.releaseKillSwitch('test: incident over');
  const again = await service.finalizeEntry(e.entry.entryId, runner);
  assert.equal(again.disposition, 'CLOSED', again.blockerCode || again.detail);
  assert.equal(queue.get(e.entry.entryId).state, 'CLOSED');
});

test('a closure that does not report CLOSED keeps its own blocker code', async () => {
  // ATTESTATION_INVALIDATED means the world moved between MERGE_READY and the
  // merge. An operator has to read that, not "merge failed".
  const root = scratchRepo();
  const { queue, service } = svc(root);
  const { requestPath } = officeRequest(root, { taskId: 'BP-STALE' });
  const req = JSON.parse(fs.readFileSync(path.join(root, requestPath), 'utf8'));
  req.autoMerge = true;
  fs.writeFileSync(path.join(root, requestPath), JSON.stringify(req, null, 2), 'utf8');
  const e = service.enqueue({ requestPath });

  await service.runOnce(mergingRun({ closure: { disposition: 'BLOCKED', blockerCode: 'ATTESTATION_INVALIDATED' } }));
  assert.equal(queue.get(e.entry.entryId).blockerCode, 'ATTESTATION_INVALIDATED');
});

// ─────────────────────────────────────────────────── PROMPT DELIVERY

test('the prompt named by a request is actually read and delivered', () => {
  // It was not. promptPath was carried and never opened, so the executor was
  // spawned with empty stdin and codex answered "No prompt provided via
  // stdin." — after a full worktree checkout, every time.
  const root = scratchRepo();
  const { requestPath } = officeRequest(root, { taskId: 'BP-PROMPT-1' });
  const promptRel = 'prompts/p.md';
  fs.mkdirSync(path.join(root, 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(root, promptRel), 'DO THE BOUNDED THING\n', 'utf8');

  const req = JSON.parse(fs.readFileSync(path.join(root, requestPath), 'utf8'));
  req.promptPath = promptRel;
  fs.writeFileSync(path.join(root, requestPath), JSON.stringify(req, null, 2), 'utf8');

  const resolved = requestMod.load({ repoCwd: root, requestPath });
  assert.match(resolved.prompt, /DO THE BOUNDED THING/);
});

test('a request naming a prompt file that is missing or empty is refused', () => {
  // A field that names a file nobody reads is worse than no field: it looks
  // like the prompt is wired. Both failures are named rather than silently
  // producing an empty stdin.
  const root = scratchRepo();
  const { requestPath } = officeRequest(root, { taskId: 'BP-PROMPT-2' });
  const setPrompt = (rel) => {
    const req = JSON.parse(fs.readFileSync(path.join(root, requestPath), 'utf8'));
    req.promptPath = rel;
    fs.writeFileSync(path.join(root, requestPath), JSON.stringify(req, null, 2), 'utf8');
  };

  setPrompt('prompts/missing.md');
  assert.throws(
    () => requestMod.load({ repoCwd: root, requestPath }),
    (e) => e.code === 'REQUEST_PROMPT_UNREADABLE',
  );

  fs.mkdirSync(path.join(root, 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'prompts/blank.md'), '   \n\n', 'utf8');
  setPrompt('prompts/blank.md');
  assert.throws(
    () => requestMod.load({ repoCwd: root, requestPath }),
    (e) => e.code === 'REQUEST_PROMPT_EMPTY',
  );
});

test('the adapter hands the resolved prompt to the executor', () => {
  const root = scratchRepo();
  const { requestPath } = officeRequest(root, { taskId: 'BP-PROMPT-3' });
  fs.mkdirSync(path.join(root, 'prompts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'prompts/p3.md'), 'PROMPT-THREE\n', 'utf8');
  const req = JSON.parse(fs.readFileSync(path.join(root, requestPath), 'utf8'));
  req.promptPath = 'prompts/p3.md';
  fs.writeFileSync(path.join(root, requestPath), JSON.stringify(req, null, 2), 'utf8');

  const { service } = svc(root);
  service.enqueue({ requestPath });

  let seen = null;
  const runner = {
    buildContext: (o) => {
      seen = o.prompt;
      return Object.assign({ holder: 'CLAUDE_LOCAL' }, o);
    },
    runTask: async (ctx) => ({ disposition: 'MERGE_READY', taskId: ctx.spec.taskId, pr: { number: 1, headSha: 'a'.repeat(40) } }),
  };
  return service.runOnce(runner).then(() => {
    assert.match(String(seen), /PROMPT-THREE/, 'the executor context carried the prompt');
  });
});
