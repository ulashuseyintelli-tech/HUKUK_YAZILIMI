'use strict';
/**
 * Operational acceptance — ORCHESTRA-PRODUCTION-ACTIVATION-R01.
 *
 * The directive's closing instruction was not to write PASS. It was to state
 * operational reality. A prose checklist cannot do that: it says what someone
 * believed at the moment they typed it, and it stays saying that after the code
 * moves underneath it.
 *
 * So the acceptance criteria are tests. Each one is a claim the final report
 * makes, checked against the system as it actually is. If the report says the
 * kill switch stops a merge, criterion 11 fails when that stops being true.
 *
 * These are deliberately END-TO-END across modules and deliberately boring
 * individually. Their value is coverage of the claims, not cleverness.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const authority = require('../orchestrator/authority.cjs');
const eligibility = require('../orchestrator/eligibility.cjs');
const admission = require('../orchestrator/admission.cjs');
const queueMod = require('../orchestrator/queue.cjs');
const recovery = require('../orchestrator/recovery.cjs');
const governance = require('../orchestrator/governance-profile.cjs');
const serviceMod = require('./service.cjs');
const mergeMod = require('../runtime/gh-merge-provider.cjs');
const runner = require('../runtime/run-task.cjs');

const ACT = 'project/docs/governance/coordination-v2/activation';
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const tmps = [];
function tmpQueue() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-acc-'));
  tmps.push(d);
  return queueMod.createQueue(d);
}
test.after(() => {
  for (const d of tmps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e) {
      /* a temp dir that will not delete is not a test failure */
    }
  }
});

const OFFICE = () => json(ACT + '/STANDING-GRANT-OFFICE-LIVE-R01.json');
const COLLECTION = () => json(ACT + '/STANDING-GRANT-COLLECTION-LIVE-R01.json');
const MANIFEST = () => json('project/docs/governance/coordination-v2/programs.manifest.json');

function specFor(g, over) {
  return Object.assign(
    { taskId: 'ACC-01', boundaryPolicy: { allowedRoots: [g.allowedPathRoots[0] + '__tests__/'], maxChangedFiles: 2 } },
    over || {},
  );
}
function admitOpts(g, over) {
  return Object.assign(
    {
      manifest: MANIFEST(),
      standingGrant: g,
      spec: specFor(g),
      taskClass: 'TEST_ONLY_CHARACTERIZATION',
      executorLane: 'CLAUDE_LOCAL',
      nowMs: Date.now(),
    },
    over || {},
  );
}

// ─────────────────────────────────────────────── AUTHORITY (1–5)

test('AC-01  the owner envelope exists and its payload digest is the one the grants pin', () => {
  const payload = json(ACT + '/parent-authorization-payload.json');
  const digest = authority.digest(payload);
  for (const g of [OFFICE(), COLLECTION()]) {
    assert.equal(g.parentAuthorizationRef.payloadSha256, digest, g.standingGrantId + ' pins a stale payload digest');
  }
  assert.ok(read(ACT + '/PARENT-AUTHORIZATION-ENVELOPE.md').indexOf(digest) !== -1, 'the envelope does not carry its own digest');
});

test('AC-02  the eligibility authority verifies against the envelope, not against itself', () => {
  const r = eligibility.verifyAuthorityRecord({
    authority: json(ACT + '/program-eligibility-authority.json'),
    readFile: read,
  });
  assert.equal(r.verified, true);
});

test('AC-03  the manifest is exactly the derivation of its authority — no hand edit survives', () => {
  const committed = MANIFEST();
  const derived = eligibility.deriveManifest({
    manifest: committed,
    authority: json(ACT + '/program-eligibility-authority.json'),
    readFile: read,
    authorityPath: ACT + '/PROGRAM-ELIGIBILITY-AUTHORITY.md',
  }).manifest;
  assert.deepEqual(derived, committed);
});

test('AC-04  exactly two programs are ELIGIBLE and the other four are not', () => {
  const m = MANIFEST();
  assert.equal(m.programs.length, 6);
  assert.deepEqual(
    m.programs.filter((p) => p.liveExecutionEligibility === 'ELIGIBLE').map((p) => p.programId).sort(),
    ['COLLECTION', 'OFFICE'],
  );
});

test('AC-05  every eligible program is bound to a standing grant that exists on disk', () => {
  for (const p of json(ACT + '/program-eligibility-authority.json').eligiblePrograms) {
    const g = JSON.parse(read(p.standingGrantRef));
    assert.equal(g.program.programId, p.programId);
  }
});

// ─────────────────────────────────────────────── BOUNDS (6–11)

test('AC-06  serial execution is pinned at 1 in every shipped grant', () => {
  for (const g of [OFFICE(), COLLECTION()]) assert.equal(g.maxConcurrency, 1);
});

test('AC-07  repository-wide auto-merge is off in every shipped grant, and cannot be turned on', async () => {
  for (const g of [OFFICE(), COLLECTION()]) assert.equal(g.mergePolicy.repositoryWideAutoMerge, false);

  // And a grant that asks for it is refused rather than honoured — the flag is
  // not a setting the caller gets to choose.
  const provider = mergeMod.createGhMergeProvider({
    repoCwd: ROOT,
    standingGrant: Object.assign({}, OFFICE(), {
      mergePolicy: Object.assign({}, OFFICE().mergePolicy, { repositoryWideAutoMerge: true }),
    }),
    ciProvider: { requiredSources: async () => ({}), observe: async () => [] },
    ghRunner: () => '{}',
    gitRunner: () => '',
  });
  await assert.rejects(
    () => provider.performMerge({ result: { pr: { number: 1 } } }),
    (e) => e.code === 'REPOSITORY_WIDE_AUTO_MERGE_FORBIDDEN',
  );
});

test('AC-08  neither opened program can mutate the other', () => {
  assert.equal(
    admission.evaluate(admitOpts(OFFICE(), { spec: specFor(COLLECTION()) })).refusal,
    'BOUNDARY_EXCEEDS_STANDING_GRANT',
  );
  assert.equal(
    admission.evaluate(admitOpts(COLLECTION(), { spec: specFor(OFFICE()) })).refusal,
    'BOUNDARY_EXCEEDS_STANDING_GRANT',
  );
});

test('AC-09  neither opened program can reach the orchestration control plane', () => {
  for (const g of [OFFICE(), COLLECTION()]) {
    const spec = specFor(g, { boundaryPolicy: { allowedRoots: ['project/scripts/orchestration-v2/'], maxChangedFiles: 1 } });
    assert.equal(admission.evaluate(admitOpts(g, { spec })).refusal, 'BOUNDARY_EXCEEDS_STANDING_GRANT');
  }
});

test('AC-10  independent review cannot be waived by a grant', () => {
  for (const g of [OFFICE(), COLLECTION()]) assert.equal(g.requiredIndependentReview, true);
  assert.throws(
    () =>
      authority.validateAgainstStandingGrant({
        standingGrant: Object.assign({}, OFFICE(), { requiredIndependentReview: false }),
        spec: specFor(OFFICE()),
        taskClass: 'TEST_ONLY_CHARACTERIZATION',
      }),
    (e) => e.code === 'INDEPENDENT_REVIEW_NOT_REQUIRED',
  );
});

test('AC-11  the kill switch refuses admission before any other check is consulted', () => {
  const v = admission.evaluate({ killSwitchEngaged: true });
  assert.equal(v.refusal, 'KILL_SWITCH_ENGAGED');
});

// ─────────────────────────────────────────────── QUEUE + RECOVERY (12–17)

test('AC-12  the queue survives a restart because it is a file, not a process', () => {
  const q = tmpQueue();
  const e = q.enqueue({ programId: 'OFFICE', taskId: 'ACC-12', taskClass: 'TEST_ONLY_CHARACTERIZATION', parentAuthorizationId: 'X' });
  const reopened = queueMod.createQueue(q.dir);
  assert.equal(reopened.get(e.entryId).state, 'QUEUED');
});

test('AC-13  admitting the same work twice yields one entry', () => {
  const q = tmpQueue();
  const g = OFFICE();
  const a = admission.admit(Object.assign(admitOpts(g), { queue: q }));
  const b = admission.admit(Object.assign(admitOpts(g), { queue: q }));
  assert.equal(b.entryId, a.entryId);
  assert.equal(q.list().length, 1);
});

test('AC-14  a refused admission writes nothing', () => {
  const q = tmpQueue();
  assert.throws(
    () => admission.admit(Object.assign(admitOpts(OFFICE(), { taskClass: 'DECISION_LOG_APPEND' }), { queue: q })),
    (e) => e.code === 'TASK_CLASS_NOT_GRANTED',
  );
  assert.equal(q.list().length, 0);
});

test('AC-15  only one entry can occupy the execution slot', () => {
  const q = tmpQueue();
  const a = admission.admit(Object.assign(admitOpts(OFFICE()), { queue: q }));
  admission.admit(
    Object.assign(admitOpts(COLLECTION(), { spec: specFor(COLLECTION(), { taskId: 'ACC-15b' }) }), { queue: q }),
  );
  q.transition({ entryId: a.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });
  assert.equal(q.head(), null);
  assert.equal(q.active().entryId, a.entryId);
});

test('AC-16  recovery never resumes mid-execution and never re-opens a PR', () => {
  assert.equal(recovery.REWIND.EXECUTING, 'AUTHORIZED');
  assert.equal(recovery.REWIND.PR_OPEN, 'CI_WAITING');
  assert.equal(recovery.REWIND.MERGING, null);
  for (const s of queueMod.OCCUPIES_SLOT) {
    assert.ok(Object.prototype.hasOwnProperty.call(recovery.REWIND, s), 'no disposition decided for ' + s);
  }
});

test('AC-17  a live worker is never reclaimed, however long it has been silent', () => {
  // This criterion found a real defect. The module reclaimed a live-but-silent
  // process once its heartbeat went stale, which is precisely how a second
  // executor gets started on the same work. Liveness now wins over staleness,
  // and a hung process is escalated to an operator rather than to a timer.
  const q = tmpQueue();
  const e = q.enqueue({ programId: 'OFFICE', taskId: 'ACC-17', taskClass: 'TEST_ONLY_CHARACTERIZATION', parentAuthorizationId: 'X' });
  q.transition({ entryId: e.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });
  recovery.takeOwnership(q, e.entryId, { pid: 4242 });

  const long = Date.now() + 10 * recovery.DEFAULT_STALE_AFTER_MS;
  assert.equal(recovery.classify(q.get(e.entryId), { pidAlive: () => true, nowMs: long }).verdict, 'OWNER_STALE');
  recovery.reclaim(q, { pidAlive: () => true, nowMs: long });
  assert.equal(q.get(e.entryId).state, 'PLANNING');
  assert.equal(q.get(e.entryId).owner.pid, 4242);
});

// ─────────────────────────────────────────────── MERGE (18–21)

test('AC-18  merge is refused with no grant and no flag', async () => {
  const ctx = runner.buildContext({
    repoCwd: fs.mkdtempSync(path.join(os.tmpdir(), 'gov-acc-ctx-')),
    spec: { taskId: 'ACC-18', profile: 'BOUNDED_CODE_TASK' },
    grant: { grantId: 'G' },
    store: { current: () => null, transition: () => {} },
    prProvider: {},
    ciProvider: {},
    prepareEnvironment: () => ({ ok: true }),
  });
  await assert.rejects(() => ctx.performMerge({ result: {} }), (e) => e.code === 'MERGE_NOT_PERMITTED');
});

test('AC-19  neither half of the merge key works alone', async () => {
  const base = {
    repoCwd: fs.mkdtempSync(path.join(os.tmpdir(), 'gov-acc-ctx-')),
    spec: { taskId: 'ACC-19', profile: 'BOUNDED_CODE_TASK' },
    grant: { grantId: 'G' },
    store: { current: () => null, transition: () => {} },
    prProvider: {},
    ciProvider: {},
    prepareEnvironment: () => ({ ok: true }),
  };
  await assert.rejects(
    () => runner.buildContext(Object.assign({}, base, { standingGrant: OFFICE() })).performMerge({ result: {} }),
    (e) => e.code === 'MERGE_NOT_PERMITTED',
  );
  await assert.rejects(
    () => runner.buildContext(Object.assign({}, base, { autoMerge: true })).performMerge({ result: {} }),
    (e) => e.code === 'MERGE_NOT_PERMITTED',
  );
});

test('AC-20  a required check that never reported blocks the merge', async () => {
  const provider = mergeMod.createGhMergeProvider({
    repoCwd: ROOT,
    standingGrant: OFFICE(),
    expectedHeadBranch: 'claude/acc-20',
    ciProvider: {
      requiredSources: async () => ({ platformRequired: ['Web Tests (vitest)'] }),
      observe: async () => [],
    },
    ghRunner: () =>
      JSON.stringify({
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'CLEAN',
        reviewDecision: null,
        headRefName: 'claude/acc-20',
        headRefOid: 'a'.repeat(40),
        mergeCommit: null,
      }),
    gitRunner: () => '',
  });
  await assert.rejects(
    () => provider.performMerge({ result: { pr: { number: 1 }, attestation: { observed: { headSha: 'a'.repeat(40) } } } }),
    (e) => e.code === 'MERGE_REQUIRED_CHECK_MISSING',
  );
});

test('AC-21  revocation and the kill switch are read at merge time', async () => {
  const mk = (over) =>
    mergeMod.createGhMergeProvider(
      Object.assign(
        {
          repoCwd: ROOT,
          standingGrant: OFFICE(),
          ciProvider: { requiredSources: async () => ({}), observe: async () => [] },
          ghRunner: () => '{}',
          gitRunner: () => '',
        },
        over,
      ),
    );
  await assert.rejects(() => mk({ isRevoked: () => true }).performMerge({ result: { pr: { number: 1 } } }), (e) => e.code === 'STANDING_GRANT_REVOKED');
  await assert.rejects(
    () => mk({ isKillSwitchEngaged: () => true }).performMerge({ result: { pr: { number: 1 } } }),
    (e) => e.code === 'KILL_SWITCH_ENGAGED',
  );
});

// ─────────────────────────────────────────────── GOVERNANCE + OPS (22–25)

test('AC-22  MECHANICAL_GOVERNANCE cannot reach canonical governance, and cannot auto-merge', () => {
  const g = json(ACT + '/STANDING-GRANT-MECHANICAL-GOVERNANCE-R01.json');
  assert.equal(g.mergePolicy.autoMergeAuthorized, false);
  assert.throws(
    () =>
      governance.validateGovernanceTask({
        standingGrant: g,
        spec: { taskId: 'ACC-22' },
        operation: 'EXACT_LITERAL_REPLACEMENT',
        targetPaths: ['project/docs/governance/decision-log.md'],
      }),
    (e) => e.code === 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE',
  );
});

test('AC-23  the service answers status from disk, with no process running', () => {
  const q = tmpQueue();
  const svc = serviceMod.createService({ repoCwd: path.dirname(q.dir), queue: q });
  const st = svc.status();
  assert.equal(st.killSwitch, 'CLEAR');
  assert.equal(st.admission.reason, 'QUEUE_EMPTY');
  assert.equal(typeof st.queueDepth, 'number');
});

test('AC-24  stopping needs no reason and restarting does', () => {
  const q = tmpQueue();
  const svc = serviceMod.createService({ repoCwd: path.dirname(q.dir), queue: q });
  svc.engageKillSwitch(null);
  assert.equal(svc.admission().reason, 'KILL_SWITCH_ENGAGED');
  assert.throws(() => svc.releaseKillSwitch(), (e) => e.code === 'KILL_SWITCH_RELEASE_REASON_REQUIRED');
  svc.releaseKillSwitch('acceptance run');
  assert.equal(svc.killSwitchEngaged(), false);
});

test('AC-25  every control action leaves an audit record', () => {
  const q = tmpQueue();
  const svc = serviceMod.createService({ repoCwd: path.dirname(q.dir), queue: q });
  svc.engageKillSwitch('AC-25');
  svc.releaseKillSwitch('AC-25 done');
  svc.pause('AC-25 pause');
  svc.resume('AC-25 resume');
  assert.deepEqual(
    svc.auditTrail().map((t) => t.event),
    ['KILL_SWITCH_ENGAGED', 'KILL_SWITCH_RELEASED', 'PAUSED', 'RESUMED'],
  );
});
