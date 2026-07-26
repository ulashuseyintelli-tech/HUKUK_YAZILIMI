'use strict';
/**
 * GOV-COORD-V2 T4 gate — orchestration unit tests + synthetic dual-executor pilot.
 *
 * Contract: coordination-v2/governance-orchestration-contract-v2.md §2-§8, §10, §12, §13
 *
 * Everything here runs against a disposable fixture repository. No production
 * root, no real pull request, no governance mutation, no real grant, no
 * auto-merge. The two executor lanes carry their real identities and are
 * resolved through the real T3 resolver; the child process itself is a
 * deterministic stand-in so every scenario is reproducible without model calls.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const lease = require('../safety/lease.cjs');
const resolveMod = require('../executors/resolve.cjs');
const authority = require('./authority.cjs');
const stateMod = require('./state.cjs');
const mergeready = require('./mergeready.cjs');
const orch = require('./orchestrator.cjs');

const FAKE = path.join(__dirname, '..', 'executors', 'fake-executor.cjs');
const WORKER = path.join(__dirname, 'pilot-worker.cjs');
const NODE = process.execPath;
const SHA0 = '0'.repeat(40);

const temps = [];
function git(a, cwd) {
  return execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

/** Disposable fixture repository — never the real one. */
function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'govv2-t4-'));
  temps.push(dir);
  git(['init', '--initial-branch=main', '-q'], dir);
  git(['config', 'user.email', 't@example.invalid'], dir);
  git(['config', 'user.name', 'T4 Fixture'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  for (const rel of ['fixture/lane-a', 'fixture/lane-b', 'fixture/shared']) {
    fs.mkdirSync(path.join(dir, rel), { recursive: true });
    fs.writeFileSync(path.join(dir, rel, 'seed.txt'), 'seed\n');
  }
  fs.mkdirSync(path.join(dir, 'project/docs/governance'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project/docs/governance/decision-log.md'), '# fixture\n');
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'fixture base'], dir);
  return dir;
}

test.after(() => {
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 });
    } catch (e) {
      /* disposable */
    }
  }
});

function fakeResolved(lane) {
  return {
    schemaVersion: 1,
    executorLane: lane,
    state: 'AVAILABLE',
    resolutionSource: 'EXPLICIT_CONFIGURED_PATH',
    resolvedAbsolutePath: NODE,
    version: 'stand-in ' + process.version,
    launchPrefixArgv: [],
    smokeExitCode: 0,
    smokeResult: 'PASS',
  };
}

/** Build a spec + a grant that pins it by the four digests (§2). */
function specAndGrant(over) {
  const o = over || {};
  const spec = Object.assign(
    {
      schemaVersion: 1,
      taskId: o.taskId || 'PILOT-A',
      taskSpecVersion: 1,
      profile: 'BOUNDED_CODE_TASK',
      declaredIntent: o.declaredIntent || 'Write one fixture file inside the declared lane root.',
      boundaryPolicy: { allowedRoots: o.allowedRoots || ['fixture/lane-a/'] },
      requiredTests: o.requiredTests || [{ argv: [NODE, '-e', 'process.exit(0)'] }],
      predecessorTaskIds: o.predecessorTaskIds || [],
      baseDriftPolicy: o.baseDriftPolicy || 'REFRESH_BEFORE_EXECUTION',
      successorDisposition: o.successorDisposition || 'NO_SUCCESSOR',
    },
    o.specExtra || {},
  );
  const d = authority.specDigests(spec);
  const grant = Object.assign(
    {
      schemaVersion: 1,
      grantId: 'PILOT-GRANT-01',
      workstream: 'PILOT-WS',
      semanticAuthorityRef: {
        kind: 'SEMANTIC_AUTHORITY',
        recordId: 'PILOT-SEMANTIC-01',
        sourcePath: 'project/docs/governance/decision-log.md',
      },
      executionGrantRef: {
        kind: 'EXECUTION_GRANT',
        recordId: 'PILOT-EXEC-01',
        sourcePath: 'project/docs/governance/coordination-execution-grants/PILOT.md',
      },
      ownerRatificationEvidence: {
        sourcePath: 'project/docs/governance/decision-log.md',
        sourceCommitSha: 'a'.repeat(40),
        exactExcerpt: 'fixture owner ratification',
        excerptSha256: 'b'.repeat(64),
      },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revocationPath: 'project/docs/governance/coordination-execution-grants/PILOT.md',
      manualMergeRequired: true,
      allowedModuleRoots: o.grantRoots || ['fixture/'],
      authorizedTasks: [
        {
          taskId: spec.taskId,
          taskSpecVersion: spec.taskSpecVersion,
          taskSpecSha256: d.taskSpecSha256,
          declaredIntentSha256: d.declaredIntentSha256,
          boundaryPolicySha256: d.boundaryPolicySha256,
          requiredTestsSha256: d.requiredTestsSha256,
          predecessorTaskIds: spec.predecessorTaskIds,
        },
      ].concat(o.extraAuthorizedTasks || []),
    },
    o.grantExtra || {},
  );
  return { spec, grant, digests: d };
}

/** Fake PR/CI providers — a synthetic pilot must never open a real PR. */
function providers(over) {
  const o = over || {};
  return {
    prProvider: {
      open: async () => ({ number: o.prNumber || 4242, headSha: o.prHeadSha || 'c'.repeat(40) }),
      state: async () => ({
        headSha: o.prHeadSha || 'c'.repeat(40),
        targetBranch: 'main',
        targetBranchSha: o.targetBranchSha || 'd'.repeat(40),
        mergeBaseSha: o.mergeBaseSha || 'e'.repeat(40),
        open: o.prOpen !== false,
        mergeable: o.prMergeable !== false,
        blockingReview: o.blockingReview === true,
        competingWriter: o.competingWriter === true,
        baseDriftSatisfied: o.baseDriftSatisfied !== false,
      }),
    },
    ciProvider: {
      requiredSources: async () => ({
        taskSpecRequired: o.taskSpecRequired || ['Test Suite'],
        platformRequired: o.platformRequired || ['Web Tests (vitest)'],
        governanceRequired: o.governanceRequired || [],
      }),
      observe: async () =>
        o.observedCi || [
          { name: 'Test Suite', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
        ],
    },
  };
}

/** A stand-in worktree: the fixture repo itself, so no nested git is created. */
function inlineWorktree(repo) {
  return ({ pinnedBase }) => ({ path: repo, pinnedBaseSha: pinnedBase, branch: 'fixture' });
}

function baseCtx(repo, over) {
  const o = over || {};
  const sg = o.sg || specAndGrant(o.specOver);
  return Object.assign(
    {
      store: stateMod.createStore(stateMod.defaultStateDir(repo)),
      repoCwd: repo,
      spec: sg.spec,
      grant: sg.grant,
      holder: o.holder || 'CLAUDE_LOCAL',
      baseRef: 'HEAD',
      worktreeFactory: inlineWorktree(repo),
      executorOverride: fakeResolved(o.holder || 'CLAUDE_LOCAL'),
      executorArgv: o.executorArgv || [FAKE, '--mode', 'ok'],
      testRunner: o.testRunner,
      limits: o.limits,
      cancellationSignal: o.cancellationSignal,
      grantRevoked: o.grantRevoked,
    },
    providers(o.providerOver),
    o.ctxExtra || {},
  );
}

/** Write a file inside the fixture so a real diff exists. */
function seedChange(repo, rel, content) {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content || 'changed\n');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'work: ' + rel], repo);
}

// ------------------------------------------------------- §12 canonicalization

test('authority: canonicalization is RFC 8785 shaped and digest-stable', () => {
  assert.equal(authority.canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(authority.canonicalize([1, 'x', true, null]), '[1,"x",true,null]');
  assert.equal(authority.digest({ a: 1, b: 2 }), authority.digest({ b: 2, a: 1 }));
  assert.match(authority.digest({ x: 1 }), /^[0-9a-f]{64}$/);
  assert.throws(() => authority.canonicalize({ n: 1.5 }), (e) => e.code === 'CANON_NUMBER_NOT_INTEGER');
});

test('authority: path lists canonicalize and reject unsafe entries', () => {
  assert.deepEqual(authority.canonicalPathList(['b/x', 'a\\y'], 'l'), ['a/y', 'b/x']);
  assert.throws(() => authority.canonicalPathList(['a', 'a'], 'l'), (e) => e.code === 'PATH_LIST_DUPLICATE');
  assert.throws(() => authority.canonicalPathList(['/abs'], 'l'), (e) => e.code === 'PATH_LIST_ABSOLUTE');
  assert.throws(() => authority.canonicalPathList(['a/../b'], 'l'), (e) => e.code === 'PATH_LIST_TRAVERSAL');
});

test('authority: requiredTests never hash a shell command string', () => {
  assert.throws(
    () => authority.canonicalRequiredTests([{ argv: 'npm test && rm -rf /' }]),
    (e) => e.code === 'REQUIRED_TEST_SHELL_STRING',
  );
  assert.deepEqual(authority.canonicalRequiredTests([{ argv: ['node', '-e', '0'] }]), [
    { argv: ['node', '-e', '0'] },
  ]);
});

// ----------------------------------------------------- §2 immutable authority

test('authority: a spec edited after ratification is rejected by digest', () => {
  const { spec, grant } = specAndGrant();
  assert.doesNotThrow(() => authority.validateAgainstGrant({ grant, spec }));
  const tampered = Object.assign({}, spec, { declaredIntent: 'Something entirely different now.' });
  assert.throws(
    () => authority.validateAgainstGrant({ grant, spec: tampered }),
    (e) => e.code === 'TASK_SPEC_HASH_MISMATCH',
  );
});

test('authority: boundary may not exceed the grant roots', () => {
  const { spec, grant } = specAndGrant({ allowedRoots: ['project/apps/api/'], grantRoots: ['fixture/'] });
  assert.throws(
    () => authority.validateAgainstGrant({ grant, spec }),
    (e) => e.code === 'BOUNDARY_EXCEEDS_GRANT',
  );
});

test('authority: semantic and execution refs must be distinct records', () => {
  const { spec, grant } = specAndGrant();
  grant.executionGrantRef = Object.assign({}, grant.semanticAuthorityRef, { kind: 'EXECUTION_GRANT' });
  assert.throws(
    () => authority.validateAgainstGrant({ grant, spec }),
    (e) => e.code === 'AUTHORITY_REFS_NOT_DISTINCT',
  );
});

test('authority: expired or revoked grant, and manual-merge flag, all fail closed', () => {
  const a = specAndGrant();
  a.grant.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.throws(() => authority.validateAgainstGrant({ grant: a.grant, spec: a.spec }), (e) => e.code === 'GRANT_EXPIRED');

  const b = specAndGrant();
  assert.throws(
    () => authority.validateAgainstGrant({ grant: b.grant, spec: b.spec, revoked: true }),
    (e) => e.code === 'GRANT_REVOKED',
  );

  const c = specAndGrant();
  c.grant.manualMergeRequired = false;
  assert.throws(
    () => authority.validateAgainstGrant({ grant: c.grant, spec: c.spec }),
    (e) => e.code === 'GRANT_MANUAL_MERGE_REQUIRED',
  );
});

test('authority: BOUNDED_CODE_TASK needs roots and tests; empty allowlist permits nothing', () => {
  assert.throws(
    () => authority.normalizeTaskSpec(specAndGrant({ allowedRoots: [] }).spec),
    (e) => e.code === 'BOUNDED_CODE_TASK_NEEDS_ROOTS',
  );
  assert.throws(
    () => authority.normalizeTaskSpec(specAndGrant({ requiredTests: [] }).spec),
    (e) => e.code === 'BOUNDED_CODE_TASK_NEEDS_TESTS',
  );
});

test('authority: STRICT_PINNED_BASE requires a pinned baseSha', () => {
  assert.throws(
    () => authority.normalizeTaskSpec(specAndGrant({ baseDriftPolicy: 'STRICT_PINNED_BASE' }).spec),
    (e) => e.code === 'BASE_SHA_REQUIRED',
  );
});

// ---------------------------------------------------------- §3 state machine

test('state: an invalid transition is refused', () => {
  const repo = fixtureRepo();
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  store.transition({ taskId: 'T-X', to: 'DECLARED', expectedPreviousState: null, writerIdentity: 'TASK_AUTHOR' });
  assert.throws(
    () => store.transition({ taskId: 'T-X', to: 'PR_OPEN', expectedPreviousState: 'DECLARED' }),
    (e) => e.code === 'STATE_TRANSITION_FORBIDDEN',
  );
});

test('state: the CAS refuses a stale expectedPreviousState', () => {
  const repo = fixtureRepo();
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  store.transition({ taskId: 'T-C', to: 'DECLARED', expectedPreviousState: null, writerIdentity: 'TASK_AUTHOR' });
  store.transition({ taskId: 'T-C', to: 'AUTHORIZED', expectedPreviousState: 'DECLARED', writerIdentity: 'OWNER' });
  assert.throws(
    () => store.transition({ taskId: 'T-C', to: 'ELIGIBLE', expectedPreviousState: 'DECLARED' }),
    (e) => e.code === 'STATE_CAS_MISMATCH',
  );
});

test('state: lease identity is required from CLAIMED onward, not before', () => {
  const repo = fixtureRepo();
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  assert.equal(stateMod.requiresLease('DECLARED'), false);
  assert.equal(stateMod.requiresLease('AUTHORIZED'), false);
  assert.equal(stateMod.requiresLease('ELIGIBLE'), false);
  assert.equal(stateMod.requiresLease('CLAIMED'), true);
  assert.equal(stateMod.requiresLease('MERGE_READY'), true);

  store.transition({ taskId: 'T-L', to: 'DECLARED', expectedPreviousState: null, writerIdentity: 'TASK_AUTHOR' });
  store.transition({ taskId: 'T-L', to: 'AUTHORIZED', expectedPreviousState: 'DECLARED', writerIdentity: 'OWNER' });
  store.transition({ taskId: 'T-L', to: 'ELIGIBLE', expectedPreviousState: 'AUTHORIZED' });
  assert.throws(
    () => store.transition({ taskId: 'T-L', to: 'CLAIMED', expectedPreviousState: 'ELIGIBLE' }),
    (e) => e.code === 'LEASE_EPOCH_REQUIRED',
  );
});

test('state: a stale holder cannot advance, and epoch cannot regress', () => {
  const repo = fixtureRepo();
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const tok = 'a'.repeat(32);
  store.transition({ taskId: 'T-F', to: 'DECLARED', expectedPreviousState: null, writerIdentity: 'TASK_AUTHOR' });
  store.transition({ taskId: 'T-F', to: 'AUTHORIZED', expectedPreviousState: 'DECLARED', writerIdentity: 'OWNER' });
  store.transition({ taskId: 'T-F', to: 'ELIGIBLE', expectedPreviousState: 'AUTHORIZED' });
  store.transition({ taskId: 'T-F', to: 'CLAIMED', expectedPreviousState: 'ELIGIBLE', leaseEpoch: 2, holderToken: tok });

  assert.throws(
    () =>
      store.transition({
        taskId: 'T-F', to: 'WORKTREE_READY', expectedPreviousState: 'CLAIMED',
        leaseEpoch: 2, holderToken: 'b'.repeat(32),
      }),
    (e) => e.code === 'HOLDER_TOKEN_CHANGED_WITHIN_EPOCH',
  );
  assert.throws(
    () =>
      store.transition({
        taskId: 'T-F', to: 'WORKTREE_READY', expectedPreviousState: 'CLAIMED',
        leaseEpoch: 1, holderToken: tok,
      }),
    (e) => e.code === 'LEASE_EPOCH_REGRESSION',
  );
  assert.throws(
    () =>
      store.transition({
        taskId: 'T-F', to: 'WORKTREE_READY', expectedPreviousState: 'CLAIMED',
        leaseEpoch: 2, holderToken: tok,
        assertHeld: () => { const e = new Error('lost'); e.code = 'FENCING_FAILURE'; throw e; },
      }),
    (e) => e.code === 'FENCING_FAILURE',
  );
});

test('state: terminal states cannot be advanced out of', () => {
  const repo = fixtureRepo();
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  store.transition({ taskId: 'T-T', to: 'DECLARED', expectedPreviousState: null, writerIdentity: 'TASK_AUTHOR' });
  store.transition({ taskId: 'T-T', to: 'CANCELLED', expectedPreviousState: 'DECLARED', writerIdentity: 'OWNER' });
  assert.throws(
    () => store.transition({ taskId: 'T-T', to: 'ELIGIBLE', expectedPreviousState: 'CANCELLED' }),
    (e) => e.code === 'STATE_TERMINAL',
  );
});

test('state: history is append-only and recovery reports interrupted tasks', () => {
  const repo = fixtureRepo();
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const tok = 'a'.repeat(32);
  store.transition({ taskId: 'T-R', to: 'DECLARED', expectedPreviousState: null, writerIdentity: 'TASK_AUTHOR' });
  store.transition({ taskId: 'T-R', to: 'AUTHORIZED', expectedPreviousState: 'DECLARED', writerIdentity: 'OWNER' });
  store.transition({ taskId: 'T-R', to: 'ELIGIBLE', expectedPreviousState: 'AUTHORIZED' });
  store.transition({ taskId: 'T-R', to: 'CLAIMED', expectedPreviousState: 'ELIGIBLE', leaseEpoch: 1, holderToken: tok });

  const reopened = stateMod.createStore(stateMod.defaultStateDir(repo));
  const rec = reopened.recover();
  assert.equal(rec.tasks['T-R'].state, 'CLAIMED');
  assert.ok(rec.interrupted.includes('T-R'), 'a mid-flight task must be reported, not silently resumed');
  assert.equal(reopened.history('T-R').length, 4);
  for (const r of reopened.history('T-R')) assert.match(r.statePayloadSha256, /^[0-9a-f]{64}$/);
});

// ------------------------------------------------------ §5 / §5.1 MERGE_READY

test('mergeready: the effective CI set is the runtime union of three sources', () => {
  const u = mergeready.effectiveRequiredCiChecks({
    taskSpecRequired: ['Test Suite'],
    platformRequired: ['Web Tests (vitest)'],
    governanceRequired: ['Architectural Guardrails', 'Test Suite'],
  });
  assert.deepEqual(u, ['Architectural Guardrails', 'Test Suite', 'Web Tests (vitest)']);
});

test('mergeready: a required check that is absent or pending fails closed', () => {
  const missing = mergeready.evaluateCi({
    sources: { platformRequired: ['Test Suite', 'Analyze (python)'] },
    observed: [{ name: 'Test Suite', status: 'COMPLETED', conclusion: 'SUCCESS' }],
  });
  assert.equal(missing.pass, false);
  assert.deepEqual(missing.missing, ['Analyze (python)']);

  const pending = mergeready.evaluateCi({
    sources: { platformRequired: ['Test Suite'] },
    observed: [{ name: 'Test Suite', status: 'IN_PROGRESS', conclusion: null }],
  });
  assert.equal(pending.pass, false);
});

test('mergeready: any missing conjunction condition blocks the attestation', () => {
  const full = mergeready.CONJUNCTION_KEYS.reduce((a, k) => { a[k] = true; return a; }, {});
  const ok = mergeready.buildAttestation({
    taskId: 'X', taskAttemptId: 'a'.repeat(32), taskSpecSha256: 'f'.repeat(64),
    grantId: 'G', grantSha256: 'f'.repeat(64), leaseEpoch: 1, holderToken: 'a'.repeat(32),
    prNumber: 1, prHeadSha: 'c'.repeat(40), targetBranch: 'main',
    targetBranchObservedSha: 'd'.repeat(40), mergeBaseSha: 'e'.repeat(40),
    requiredCiResultSetSha256: 'f'.repeat(64), conjunction: full,
  });
  assert.equal(ok.ok, true);
  assert.match(ok.attestation.expiresAt, /Z$/);

  for (const k of ['prMergeable', 'requiredCiChecksPass', 'actualDiffWithinBoundary']) {
    const partial = Object.assign({}, full);
    partial[k] = false;
    const r = mergeready.buildAttestation({ conjunction: partial });
    assert.equal(r.ok, false);
    assert.ok(r.failedConditions.includes(k));
  }
});

test('mergeready: drift in head, target, lease, grant or spec invalidates it', () => {
  const a = {
    prHeadSha: 'c'.repeat(40), targetBranchObservedSha: 'd'.repeat(40), mergeBaseSha: 'e'.repeat(40),
    leaseEpoch: 3, holderToken: 'a'.repeat(32), taskSpecSha256: 'f'.repeat(64),
    requiredCiResultSetSha256: '1'.repeat(64),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  assert.equal(mergeready.revalidate({ attestation: a, observed: {} }).valid, true);

  const cases = [
    [{ prHeadSha: '9'.repeat(40) }, 'PR_HEAD_DRIFT'],
    [{ targetBranchObservedSha: '9'.repeat(40) }, 'TARGET_BRANCH_DRIFT'],
    [{ mergeBaseSha: '9'.repeat(40) }, 'MERGE_BASE_DRIFT'],
    [{ leaseEpoch: 4 }, 'LEASE_EPOCH_DRIFT'],
    [{ holderToken: 'b'.repeat(32) }, 'HOLDER_TOKEN_DRIFT'],
    [{ taskSpecSha256: '9'.repeat(64) }, 'TASK_SPEC_HASH_DRIFT'],
    [{ grantRevoked: true }, 'GRANT_REVOKED'],
    [{ prOpen: false }, 'PR_NOT_OPEN'],
    [{ prMergeable: false }, 'PR_NOT_MERGEABLE'],
    [{ blockingReview: true }, 'BLOCKING_REVIEW'],
    [{ competingWriter: true }, 'COMPETING_WRITER'],
    [{ requiredCiResultSetSha256: '9'.repeat(64) }, 'CI_RESULT_SET_DRIFT'],
  ];
  for (const [observed, expected] of cases) {
    const r = mergeready.revalidate({ attestation: a, observed });
    assert.equal(r.valid, false, expected);
    assert.ok(r.reasons.includes(expected), expected + ' not in ' + r.reasons.join(','));
  }
});

test('mergeready: an expired attestation is not merge-ready', () => {
  const a = { expiresAt: new Date(Date.now() - 1).toISOString() };
  const r = mergeready.revalidate({ attestation: a, observed: {} });
  assert.equal(r.valid, false);
  assert.ok(r.reasons.includes('ATTESTATION_EXPIRED'));
});

test('mergeready: a merge without a fresh attestation is not a clean closure', () => {
  const a = { expiresAt: new Date(Date.now() + 60000).toISOString(), prHeadSha: 'c'.repeat(40) };
  const clean = mergeready.classifyExternalMerge({ attestation: a, observed: { prHeadSha: 'c'.repeat(40) } });
  assert.equal(clean.disposition, 'MERGED');
  const dirty = mergeready.classifyExternalMerge({ attestation: a, observed: { prHeadSha: '9'.repeat(40) } });
  assert.equal(dirty.disposition, 'UNVERIFIED_EXTERNAL_MERGE_OWNER_REVIEW_REQUIRED');
});

module.exports = { fixtureRepo, specAndGrant, providers, baseCtx, seedChange, fakeResolved, inlineWorktree, temps, git };
