'use strict';
/**
 * GOV-COORD-V2 T4 closing gate — SYNTHETIC_DUAL_EXECUTOR pilot.
 *
 * Contract §10. Every scenario the pilot contract requires is exercised end to
 * end through the real chain: authority validation, the persisted lifecycle,
 * the T2 lease CAS and diff boundary validator, and the T3 executor adapters.
 *
 * Boundaries held throughout:
 *   - disposable fixture repositories only, never a production root
 *   - fake PR/CI providers, never a real pull request
 *   - no governance mutation, no real grant, no auto-merge
 *   - the two lanes carry their real identities (CLAUDE_LOCAL / CODEX_LOCAL)
 *     while the child process is a deterministic stand-in, so the scenarios are
 *     reproducible without model calls
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const lease = require('../safety/lease.cjs');
const resolveMod = require('../executors/resolve.cjs');
const stateMod = require('./state.cjs');
const mergeready = require('./mergeready.cjs');
const orch = require('./orchestrator.cjs');
const F = require('./pilot-fixtures.cjs');

const RACE_WORKER = path.join(__dirname, '..', 'safety', 'race-worker.cjs');

test.after(F.cleanupTemps);

/** Assemble a runnable context over a fixture repo. */
function ctxFor(repo, over) {
  const o = over || {};
  const sg = o.sg || F.specAndGrant(o.specOver);
  const p = F.providers(o.providerOver);
  return Object.assign(
    {
      store: o.store || stateMod.createStore(stateMod.defaultStateDir(repo)),
      repoCwd: repo,
      spec: sg.spec,
      grant: sg.grant,
      holder: o.holder || 'CLAUDE_LOCAL',
      baseRef: 'HEAD',
      worktreeFactory: F.inlineWorktree(repo),
      executorOverride: F.fakeResolved(o.holder || 'CLAUDE_LOCAL'),
      executorArgv: o.executorArgv || [F.FAKE, '--mode', 'ok'],
      limits: o.limits,
      cancellationSignal: o.cancellationSignal,
      grantRevoked: o.grantRevoked,
      testRunner: o.testRunner,
      attestationTtlMs: o.attestationTtlMs,
      _sg: sg,
      _providers: p,
    },
    { prProvider: p.prProvider, ciProvider: p.ciProvider },
    o.ctxExtra || {},
  );
}

// ---------------------------------------------------------------- SCENARIO 1

test('PILOT 1: two lanes complete bounded tasks in parallel, each MERGE_READY', async () => {
  const repoA = F.fixtureRepo();
  const repoB = F.fixtureRepo();
  F.seedChange(repoA, 'fixture/lane-a/out.txt', 'lane a work\n');
  F.seedChange(repoB, 'fixture/lane-b/out.txt', 'lane b work\n');

  const a = ctxFor(repoA, { holder: 'CLAUDE_LOCAL', specOver: { taskId: 'PILOT-LANE-A', allowedRoots: ['fixture/lane-a/'] } });
  const b = ctxFor(repoB, { holder: 'CODEX_LOCAL', specOver: { taskId: 'PILOT-LANE-B', allowedRoots: ['fixture/lane-b/'] } });

  const [ra, rb] = await Promise.all([orch.runTask(a), orch.runTask(b)]);

  for (const [r, lane] of [[ra, 'CLAUDE_LOCAL'], [rb, 'CODEX_LOCAL']]) {
    assert.equal(r.disposition, 'MERGE_READY', lane + ': ' + JSON.stringify(r.blockerCode || r.detail));
    assert.equal(r.attestation.leaseEpoch, 1);
    assert.match(r.attestation.expiresAt, /Z$/);
    for (const k of mergeready.CONJUNCTION_KEYS) assert.equal(r.attestation.conjunction[k], true, lane + ' ' + k);
  }
  assert.notEqual(ra.holderToken, rb.holderToken);
  // Lanes advanced independently, and each held its own lease.
  assert.equal(a.store.current('PILOT-LANE-A').state, 'MERGE_READY');
  assert.equal(b.store.current('PILOT-LANE-B').state, 'MERGE_READY');
});

// ---------------------------------------------------------------- SCENARIO 2

test('PILOT 2: duplicate claim on one task yields exactly one winner', async () => {
  const repo = F.fixtureRepo();
  const barrier = Date.now() + 1500;
  const runs = ['CLAUDE_LOCAL', 'CODEX_LOCAL'].map((holder, i) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [
        RACE_WORKER, '--mode', 'claim', '--cwd', repo, '--task', 'PILOT-DUP',
        '--holder', holder, '--token', (i === 0 ? 'a' : 'b').repeat(32),
        '--attempt', 'c'.repeat(32), '--barrier', String(barrier),
      ]);
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.on('close', () => resolve(JSON.parse(out.trim().split('\n').pop())));
    }),
  );
  const results = await Promise.all(runs);
  assert.equal(results.filter((r) => r.outcome === 'WON').length, 1, JSON.stringify(results));
  const loser = results.find((r) => r.outcome === 'LOST');
  assert.ok(['FENCING_FAILURE', 'CLAIM_CONFLICT'].includes(loser.code), loser.code);
  const held = lease.read('PILOT-DUP', repo);
  assert.equal(held.record.state, 'HELD');
  assert.equal(held.record.leaseEpoch, 1);
});

// ---------------------------------------------------------------- SCENARIO 3

test('PILOT 3: shared-path conflict blocks the second task fail-closed', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/shared/out.txt', 'shared\n');
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));

  const first = ctxFor(repo, { store, specOver: { taskId: 'PILOT-SH-1', allowedRoots: ['fixture/shared/'] } });
  const r1 = await orch.runTask(first);
  assert.equal(r1.disposition, 'MERGE_READY', JSON.stringify(r1.blockerCode));

  // Second task declares an overlapping root while the first is still in flight.
  const second = ctxFor(repo, {
    store, holder: 'CODEX_LOCAL',
    specOver: { taskId: 'PILOT-SH-2', allowedRoots: ['fixture/shared/'] },
  });
  const r2 = await orch.runTask(second);
  assert.equal(r2.disposition, 'BLOCKED');
  assert.equal(r2.blockerCode, 'NOT_ELIGIBLE');
  assert.match(r2.detail, /SHARED_PATH_CONFLICT/);
  assert.equal(store.current('PILOT-SH-2').state, 'BLOCKED');
});

// ---------------------------------------------------------------- SCENARIO 4

/**
 * An escape must be produced by the executor *after* the base is pinned —
 * seeding it beforehand would leave an empty diff and prove nothing. These argv
 * make the stand-in child write and commit its own work, exactly as a real
 * executor would.
 */
function writeAndCommitArgv(relPath, content) {
  const script = [
    "const {execFileSync:x}=require('child_process');",
    "const fs=require('fs');const p=require('path');",
    'const rel=' + JSON.stringify(relPath) + ';',
    'fs.mkdirSync(p.dirname(rel),{recursive:true});',
    'fs.writeFileSync(rel,' + JSON.stringify(content) + ');',
    "x('git',['add','-A']);",
    "x('git',['-c','user.email=e@x.invalid','-c','user.name=Executor','commit','-q','-m','executor work']);",
    "process.stdout.write('wrote '+rel+String.fromCharCode(10));",
  ].join('');
  return ['-e', script];
}

test('PILOT 4: a diff outside the allowed root is rejected before any PR', async () => {
  const repo = F.fixtureRepo();
  const c = ctxFor(repo, {
    specOver: { taskId: 'PILOT-ESCAPE', allowedRoots: ['fixture/lane-a/'] },
    // The executor writes outside its declared lane, after the base is pinned.
    executorArgv: writeAndCommitArgv('fixture/lane-b/escaped.txt', 'escaped\n'),
  });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'BLOCKED', JSON.stringify(r.blockerCode || r.detail));
  assert.equal(r.blockerCode, 'BOUNDARY_ESCAPE');
  assert.match(r.detail, /OUTSIDE_PERMITTED_BOUNDARY/);
  assert.equal(c._providers.openedPrs.length, 0, 'no PR may be opened for an out-of-boundary attempt');
});

test('PILOT 4b: touching an immutable forbidden path is reported distinctly', async () => {
  const repo = F.fixtureRepo();
  const c = ctxFor(repo, {
    specOver: { taskId: 'PILOT-FORBIDDEN', allowedRoots: ['project/docs/'], grantRoots: ['project/'] },
    executorArgv: writeAndCommitArgv('project/docs/governance/decision-log.md', '# fixture\nmutated\n'),
  });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'BLOCKED', JSON.stringify(r.blockerCode || r.detail));
  assert.equal(r.blockerCode, 'FORBIDDEN_PATH_TOUCHED');
  assert.match(r.detail, /FORBIDDEN_PATH_TOUCHED/);
  assert.equal(c._providers.openedPrs.length, 0);
});

test('PILOT 4c: an in-boundary executor commit passes the boundary gate', async () => {
  const repo = F.fixtureRepo();
  const c = ctxFor(repo, {
    specOver: { taskId: 'PILOT-INBOUNDS', allowedRoots: ['fixture/lane-a/'] },
    executorArgv: writeAndCommitArgv('fixture/lane-a/produced.txt', 'inside\n'),
  });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'MERGE_READY', JSON.stringify(r.blockerCode || r.detail));
  assert.equal(r.verdict.withinBoundary, true);
  assert.ok(r.verdict.changeCount >= 1, 'the executor really did change something');
});

// ------------------------------------------------------------- SCENARIOS 5-7

test('PILOT 5: executor timeout terminates the process tree, no PR', async () => {
  const repo = F.fixtureRepo();
  const c = ctxFor(repo, {
    specOver: { taskId: 'PILOT-TIMEOUT' },
    executorArgv: [F.FAKE, '--mode', 'spawn-child-hang'],
    limits: { timeoutMs: 1200, gracePeriodMs: 400 },
  });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'EXECUTOR_TIMEOUT');
  assert.equal(c._providers.openedPrs.length, 0);
  assert.equal(c.store.current('PILOT-TIMEOUT').payload.stale_result_suppressed, true);
});

test('PILOT 6: owner cancellation terminates the process tree, no PR', async () => {
  const repo = F.fixtureRepo();
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 600);
  const c = ctxFor(repo, {
    specOver: { taskId: 'PILOT-CANCEL' },
    executorArgv: [F.FAKE, '--mode', 'hang'],
    limits: { timeoutMs: 60000, gracePeriodMs: 400 },
    cancellationSignal: ac.signal,
  });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'CANCELLED');
  assert.equal(c._providers.openedPrs.length, 0);
});

test('PILOT 7: lease loss freezes mutation, kills the tree and suppresses the result', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/lane-a/out.txt', 'work\n');
  const c = ctxFor(repo, {
    specOver: { taskId: 'PILOT-FENCE' },
    executorArgv: [F.FAKE, '--mode', 'spawn-child-hang'],
    limits: { timeoutMs: 60000, gracePeriodMs: 500, leaseCheckIntervalMs: 300 },
  });

  // Revoke the lease out from under the running attempt: another holder takes
  // it after expiry, which advances the epoch.
  const originalClaim = lease.claim;
  let hijacked = false;
  const hijack = setInterval(() => {
    if (hijacked) return;
    const cur = lease.read('PILOT-FENCE', repo);
    if (cur.record && cur.record.state === 'HELD') {
      hijacked = true;
      // Force expiry, then take over as the other lane.
      lease.claim({
        cwd: repo, taskId: 'PILOT-FENCE', holder: 'CODEX_LOCAL',
        holderToken: 'f'.repeat(32), taskAttemptId: '9'.repeat(32),
        ttlMs: 60000, nowMs: Date.parse(cur.record.expiresAt) + 1000,
      });
    }
  }, 250);

  const r = await orch.runTask(c);
  clearInterval(hijack);
  assert.equal(originalClaim, lease.claim, 'the module must not be monkey-patched');

  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'FENCING_FAILURE');
  assert.equal(r.trace.includes('EXECUTOR_RUNNING'), true);
  assert.equal(c._providers.openedPrs.length, 0, 'a stale attempt must never publish a PR');
  const rec = c.store.current('PILOT-FENCE');
  assert.equal(rec.state, 'BLOCKED');
  assert.equal(rec.payload.stale_result_suppressed, true);
});

// ------------------------------------------------------------ SCENARIOS 8-10

test('PILOT 8: a non-zero executor exit is a deterministic BLOCKED disposition', async () => {
  const repo = F.fixtureRepo();
  const c = ctxFor(repo, { specOver: { taskId: 'PILOT-NONZERO' }, executorArgv: [F.FAKE, '--mode', 'fail'] });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'EXECUTOR_NONZERO_EXIT');
  assert.match(r.detail, /exit=7/);
  assert.equal(c._providers.openedPrs.length, 0);
});

test('PILOT 9: a failing required test prevents PR and MERGE_READY', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/lane-a/out.txt', 'work\n');
  const c = ctxFor(repo, {
    specOver: { taskId: 'PILOT-TESTFAIL', requiredTests: [{ argv: [F.NODE, '-e', 'process.exit(3)'] }] },
  });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'REQUIRED_TEST_FAILED');
  assert.equal(c._providers.openedPrs.length, 0);
  assert.equal(c.store.current('PILOT-TESTFAIL').state, 'BLOCKED');
});

test('PILOT 10: CI failure blocks MERGE_READY even though the PR opened', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/lane-a/out.txt', 'work\n');
  const c = ctxFor(repo, {
    specOver: { taskId: 'PILOT-CIFAIL' },
    providerOver: {
      observedCi: [
        { name: 'Test Suite', status: 'COMPLETED', conclusion: 'FAILURE' },
        { name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
      ],
    },
  });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'REQUIRED_CI_FAILED');
  assert.equal(c._providers.openedPrs.length, 1, 'the PR did open; CI is what failed');
  assert.equal(c.store.current('PILOT-CIFAIL').state, 'BLOCKED');
});

test('PILOT 10b: a required check absent from the observed set fails closed', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/lane-a/out.txt', 'work\n');
  const c = ctxFor(repo, {
    specOver: { taskId: 'PILOT-CIMISSING' },
    // The effective set gains a governance-required check that CI never reported.
    providerOver: { governanceRequired: ['Analyze (python)'] },
  });
  // Absence now gets a short grace, because for the first seconds after a push
  // every check is absent. Zero here keeps this test about the property it
  // pins: a check that never appears fails closed.
  c.ciMissingGraceMs = 0;
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'REQUIRED_CI_FAILED');
  assert.match(r.detail, /Analyze \(python\)/);
});

// ----------------------------------------------------------- SCENARIOS 11-14

test('PILOT 11-12: PR head or target branch drift invalidates the attestation', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/lane-a/out.txt', 'work\n');
  const c = ctxFor(repo, { specOver: { taskId: 'PILOT-DRIFT' } });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'MERGE_READY');

  const headDrift = mergeready.revalidate({ attestation: r.attestation, observed: { prHeadSha: '9'.repeat(40) } });
  assert.equal(headDrift.valid, false);
  assert.ok(headDrift.reasons.includes('PR_HEAD_DRIFT'));

  const targetDrift = mergeready.revalidate({
    attestation: r.attestation,
    observed: { targetBranchObservedSha: '9'.repeat(40) },
  });
  assert.equal(targetDrift.valid, false);
  assert.ok(targetDrift.reasons.includes('TARGET_BRANCH_DRIFT'));

  // Owner merge must be refused while drift stands.
  const outcome = await orch.completeAfterOwnerMerge({
    store: c.store,
    result: r,
    observeFresh: async () => ({ prHeadSha: '9'.repeat(40) }),
    performMerge: async () => assert.fail('merge must not be attempted on an invalid attestation'),
  });
  assert.equal(outcome.disposition, 'BLOCKED');
  assert.equal(outcome.blockerCode, 'ATTESTATION_INVALIDATED');
  assert.equal(c.store.current('PILOT-DRIFT').state, 'BLOCKED');
});

test('PILOT 13: a revoked grant stops the task before any execution', async () => {
  const repo = F.fixtureRepo();
  const c = ctxFor(repo, { specOver: { taskId: 'PILOT-REVOKED' }, grantRevoked: true });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'GRANT_REVOKED');
  assert.equal(lease.read('PILOT-REVOKED', repo).oid, null, 'no lease may be taken for a revoked grant');
  assert.equal(c._providers.openedPrs.length, 0);
});

test('PILOT 14: an expired attestation is not merge-ready', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/lane-a/out.txt', 'work\n');
  const c = ctxFor(repo, { specOver: { taskId: 'PILOT-EXPIRED' }, attestationTtlMs: 1 });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'MERGE_READY');
  await new Promise((res) => setTimeout(res, 30));
  const check = mergeready.revalidate({ attestation: r.attestation, observed: {} });
  assert.equal(check.valid, false);
  assert.ok(check.reasons.includes('ATTESTATION_EXPIRED'));
});

// ----------------------------------------------------------- SCENARIOS 15-16

test('PILOT 15-16: only a pinned successor becomes eligible; discovered work does not', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/lane-a/out.txt', 'work\n');

  const successor = {
    schemaVersion: 1,
    taskId: 'PILOT-SUCC',
    taskSpecVersion: 1,
    profile: 'BOUNDED_CODE_TASK',
    declaredIntent: 'Follow the first task inside the same declared lane root.',
    boundaryPolicy: { allowedRoots: ['fixture/lane-a/'] },
    requiredTests: [{ argv: [F.NODE, '-e', 'process.exit(0)'] }],
    predecessorTaskIds: ['PILOT-PRED'],
    baseDriftPolicy: 'REFRESH_BEFORE_EXECUTION',
    successorDisposition: 'NO_SUCCESSOR',
  };
  const sg = F.specAndGrant({
    taskId: 'PILOT-PRED',
    successorDisposition: 'DECLARED_SUCCESSOR',
    additionalTaskSpecs: [successor],
  });

  const c = ctxFor(repo, { sg });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'MERGE_READY');

  // Before closure the successor is not eligible.
  const early = orch.successorDisposition({ store: c.store, grant: sg.grant, closedTaskId: 'PILOT-PRED' });
  assert.deepEqual(early.eligible, []);
  assert.equal(early.reason, 'PREDECESSOR_NOT_CLOSED');

  const done = await orch.completeAfterOwnerMerge({
    store: c.store,
    result: r,
    observeFresh: async () => ({}),
    performMerge: async () => ({ mergeSha: '7'.repeat(40) }),
  });
  assert.equal(done.disposition, 'CLOSED');

  const after = orch.successorDisposition({
    store: c.store, grant: sg.grant, closedTaskId: 'PILOT-PRED',
    discoveredFollowUps: ['refactor something the executor noticed'],
  });
  assert.deepEqual(after.eligible, ['PILOT-SUCC'], 'a pinned successor becomes eligible');
  assert.equal(after.discovered.length, 1);
  assert.equal(after.discovered[0].disposition, 'DISCOVERED_FOLLOW_UP');
  assert.ok(!after.eligible.includes(after.discovered[0].description));
});

// ----------------------------------------------------------- SCENARIOS 17-18

test('PILOT 17-18: closure leaves no orphan lease, no orphan state, integrity intact', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/lane-a/out.txt', 'work\n');
  const beforeStatus = F.git(['status', '--porcelain'], repo);

  const c = ctxFor(repo, { specOver: { taskId: 'PILOT-CLEAN' } });
  const r = await orch.runTask(c);
  assert.equal(r.disposition, 'MERGE_READY');

  // While MERGE_READY the lease is deliberately still held (§3.2).
  const during = lease.read('PILOT-CLEAN', repo);
  assert.equal(during.record.state, 'HELD', 'MERGE_READY must not release the lease');

  const done = await orch.completeAfterOwnerMerge({
    store: c.store,
    result: r,
    observeFresh: async () => ({}),
    performMerge: async () => ({ mergeSha: '8'.repeat(40) }),
  });
  assert.equal(done.disposition, 'CLOSED');

  const after = lease.read('PILOT-CLEAN', repo);
  assert.equal(after.record.state, 'RELEASED', 'closure must release the lease');
  assert.equal(after.record.releaseReason, 'CLOSED');
  assert.equal(after.record.leaseEpoch, during.record.leaseEpoch, 'epoch preserved on release');
  // Ref is never deleted.
  assert.doesNotThrow(() => F.git(['rev-parse', '--verify', lease.refFor('PILOT-CLEAN')], repo));

  // The fixture working tree is no dirtier than we left it.
  assert.equal(F.git(['status', '--porcelain'], repo).replace(/\.orch-state\/\S*/g, '').trim(),
    beforeStatus.replace(/\.orch-state\/\S*/g, '').trim());

  const hist = c.store.history('PILOT-CLEAN').map((h) => h.state);
  assert.deepEqual(hist, [
    'DECLARED', 'AUTHORIZED', 'ELIGIBLE', 'CLAIMED', 'WORKTREE_READY',
    'EXECUTOR_RUNNING', 'VALIDATING', 'PR_OPEN', 'CI_PENDING', 'MERGE_READY',
    'MERGED', 'CLOSED',
  ]);
  assert.deepEqual(c.store.recover().interrupted, [], 'no task left mid-flight');
});

test('PILOT: no production root is ever touched by this pilot', () => {
  // Every fixture lives under the OS temp dir; assert that invariant directly.
  const tmp = require('os').tmpdir().split('\\').join('/').toLowerCase();
  for (const d of F.temps) {
    assert.ok(d.split('\\').join('/').toLowerCase().startsWith(tmp), 'fixture outside temp: ' + d);
  }
  assert.ok(F.temps.length > 0, 'the pilot must actually have created fixtures');
});

test('PILOT: resolution reports a well-formed verdict for both lanes', () => {
  // This previously asserted that both executors resolve "on this machine" —
  // a developer-workstation fact that fails on a CI runner where neither CLI is
  // installed. What must hold everywhere is that resolution returns a coherent
  // manifest either way: a resolvable lane names its source and version, and an
  // unresolvable one says why without ever claiming AVAILABLE.
  for (const lane of resolveMod.LANES) {
    const m = resolveMod.resolveExecutor({ lane, skipSmoke: true });
    assert.equal(m.schemaVersion, 1, lane);
    assert.equal(m.executorLane, lane);
    assert.equal(m.state, 'UNAVAILABLE', 'skipSmoke keeps state UNAVAILABLE by §7.1');
    assert.ok(m.unavailableReason, lane + ' must always give a reason');

    if (!m.resolutionSource) {
      // Not resolvable from this process environment — an environmental fact,
      // never a claim that the executor is broken or absent (§7.1).
      assert.equal(m.unavailableReason, 'NOT_RESOLVABLE_FROM_THIS_PROCESS_ENVIRONMENT', lane);
      assert.equal(m.version, null, lane);
      assert.equal(m.smokeResult, 'FAIL', lane);
      continue;
    }
    assert.ok(m.version, lane + ' resolved but reported no version');
    assert.ok(
      resolveMod.LANE_SPEC[lane].versionPattern.test(m.version),
      lane + ' version does not match its lane pattern: ' + m.version,
    );
    // Resolvable here, so the version gate ran and the only thing missing is
    // the smoke step this call deliberately skips (§7.1).
    assert.equal(m.unavailableReason, 'SMOKE_SKIPPED', lane + ': ' + m.unavailableReason);
  }
});

// -------------------------------------------------- ENVIRONMENT PREPARATION
//
// The orchestrator creates an isolated worktree and, until this hook existed,
// installed nothing into it. node_modules is gitignored, so `git worktree add`
// does not carry it, and both the executor and every requiredTests entry then
// ran against an unprepared tree. That is not a test failure; it is a gate that
// cannot go green. These tests pin the hook's contract, not the commands —
// those belong to the runtime adapter.

test('PILOT: prepareEnvironment runs before the executor and is traced', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/prep/out.txt', 'prep\n');
  const order = [];
  const ctx = ctxFor(repo, {
    specOver: { taskId: 'PILOT-PREP-OK', allowedRoots: ['fixture/prep/'] },
    ctxExtra: {
      prepareEnvironment: (a) => {
        order.push(a.worktreePath ? 'prepare:has-worktree' : 'prepare:no-worktree');
        return { ok: true };
      },
    },
  });
  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'MERGE_READY', JSON.stringify(r.blockerCode || r.detail));
  assert.ok(r.trace.includes('ENVIRONMENT_PREPARED'));
  // It received the worktree path, so it can install into the right tree.
  assert.deepEqual(order, ['prepare:has-worktree']);
  assert.ok(r.trace.indexOf('ENVIRONMENT_PREPARED') < r.trace.indexOf('EXECUTOR_RUNNING'));
});

test('PILOT: a preparation failure blocks before any test runs', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/prep/out.txt', 'prep\n');
  let testsRan = false;
  const ctx = ctxFor(repo, {
    specOver: { taskId: 'PILOT-PREP-FAIL', allowedRoots: ['fixture/prep/'] },
    testRunner: () => {
      testsRan = true;
      return { status: 0 };
    },
    ctxExtra: {
      prepareEnvironment: () => ({ ok: false, detail: 'pnpm install --frozen-lockfile exit=1' }),
    },
  });
  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'BLOCKED');
  // result.schema.json pins blockerCode to a fixed enum, so the precise cause
  // travels in detail rather than as a code the result record could not carry.
  assert.equal(r.blockerCode, 'EXECUTOR_UNAVAILABLE');
  assert.match(r.detail, /^ENVIRONMENT_PREPARATION_FAILED: /);
  assert.match(r.detail, /frozen-lockfile/);
  assert.equal(testsRan, false, 'requiredTests must not run on an unprepared tree');
  assert.ok(!r.trace.includes('ENVIRONMENT_PREPARED'));
});

test('PILOT: a throwing preparation adapter blocks the same way', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/prep/out.txt', 'prep\n');
  const ctx = ctxFor(repo, {
    specOver: { taskId: 'PILOT-PREP-THROW', allowedRoots: ['fixture/prep/'] },
    ctxExtra: {
      prepareEnvironment: () => {
        throw Object.assign(new Error('spawn ENOENT'), { detail: 'pnpm not on PATH' });
      },
    },
  });
  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'EXECUTOR_UNAVAILABLE');
  assert.match(r.detail, /ENVIRONMENT_PREPARATION_FAILED: pnpm not on PATH/);
});

test('PILOT: without the hook the flow is unchanged', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/prep/out.txt', 'prep\n');
  const ctx = ctxFor(repo, { specOver: { taskId: 'PILOT-PREP-ABSENT', allowedRoots: ['fixture/prep/'] } });
  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'MERGE_READY', JSON.stringify(r.blockerCode || r.detail));
  assert.ok(!r.trace.includes('ENVIRONMENT_PREPARED'), 'no hook, no trace entry');
});

// ------------------------------------------------- RESUME FROM BLOCKED (§3)

// state.cjs keeps BLOCKED out of TERMINAL and allows BLOCKED -> ELIGIBLE "only
// by owner action", and nothing implemented that return. A task blocked by a
// transient failure could never run again: its record exists so DECLARED is
// skipped, then AUTHORIZED demands DECLARED and fails STATE_CAS_MISMATCH — a
// ratified plan hash burned by an infrastructure hiccup. Found for real: both
// T5 tasks blocked on WORKTREE_ADD_FAILED (Windows MAX_PATH) and could not be
// retried after the path was shortened.
test('PILOT: a BLOCKED task does not silently retry', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/resume/out.txt', 'x\n');
  const spec = { taskId: 'PILOT-RESUME-GUARD', allowedRoots: ['fixture/resume/'] };
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));

  const first = await orch.runTask(
    ctxFor(repo, {
      store,
      specOver: spec,
      ctxExtra: {
        worktreeFactory: () => {
          throw Object.assign(new Error('unable to create file: Filename too long'), {
            code: 'WORKTREE_ADD_FAILED',
          });
        },
      },
    }),
  );
  assert.equal(first.disposition, 'BLOCKED');
  assert.equal(store.current('PILOT-RESUME-GUARD').state, 'BLOCKED');

  // Same invocation again, infrastructure now fine: still refused.
  const second = await orch.runTask(ctxFor(repo, { store, specOver: spec }));
  assert.equal(second.disposition, 'BLOCKED');
  assert.equal(second.blockerCode, 'BLOCKED_RESUME_NOT_AUTHORIZED');
  assert.match(second.detail, /owner-authorized resume is required/);
});

test('PILOT: an owner-authorized resume completes and leaves the blocker in the log', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/resume2/out.txt', 'x\n');
  const spec = { taskId: 'PILOT-RESUME-OK', allowedRoots: ['fixture/resume2/'] };
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));

  const first = await orch.runTask(
    ctxFor(repo, {
      store,
      specOver: spec,
      ctxExtra: {
        worktreeFactory: () => {
          throw Object.assign(new Error('Filename too long'), { code: 'WORKTREE_ADD_FAILED' });
        },
      },
    }),
  );
  assert.equal(first.disposition, 'BLOCKED');

  const resumed = await orch.runTask(
    ctxFor(repo, { store, specOver: spec, ctxExtra: { resumeFromBlocked: true } }),
  );
  assert.equal(resumed.disposition, 'MERGE_READY', JSON.stringify(resumed.blockerCode || resumed.detail));

  // BLOCKED -> ELIGIBLE, never BLOCKED -> AUTHORIZED, and the recovery is
  // visible rather than erased.
  assert.ok(resumed.trace.includes('ELIGIBLE(resumed)'), JSON.stringify(resumed.trace));
  assert.ok(!resumed.trace.includes('AUTHORIZED'), 'BLOCKED -> AUTHORIZED is not a legal edge');
  const rec = store.current('PILOT-RESUME-OK');
  assert.equal(rec.state, 'MERGE_READY');
});

test('PILOT: resume still re-validates the grant, it does not inherit the old one', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/resume3/out.txt', 'x\n');
  const spec = { taskId: 'PILOT-RESUME-AUTH', allowedRoots: ['fixture/resume3/'] };
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));

  const first = await orch.runTask(
    ctxFor(repo, {
      store,
      specOver: spec,
      ctxExtra: {
        worktreeFactory: () => {
          throw Object.assign(new Error('Filename too long'), { code: 'WORKTREE_ADD_FAILED' });
        },
      },
    }),
  );
  assert.equal(first.disposition, 'BLOCKED');

  // Resume authorized, but the grant has since been revoked.
  const revoked = await orch.runTask(
    ctxFor(repo, { store, specOver: spec, grantRevoked: true, ctxExtra: { resumeFromBlocked: true } }),
  );
  assert.equal(revoked.disposition, 'BLOCKED');
  assert.equal(revoked.blockerCode, 'GRANT_REVOKED');
});

// ------------------------------------------------ EXECUTOR PRODUCED NOTHING

// boundary.validate calls an empty diff within boundary, correctly — nothing
// escaped. But an executor that changed nothing did not do the task, and the
// old flow let that sail through validation, push an empty branch to the
// remote, and fail at PR creation with "No commits between main and ...".
// Measured on a real run: a lane without write permission ran four minutes,
// exited 0, and left a stray remote branch behind.
test('PILOT: an executor that changes nothing is blocked before anything is pushed', async () => {
  const repo = F.fixtureRepo();
  let opened = 0;
  const ctx = ctxFor(repo, {
    specOver: { taskId: 'PILOT-NO-CHANGES', allowedRoots: ['fixture/none/'] },
    // exit 0, touch nothing — exactly what a read-only sandbox produces.
    executorArgv: [F.FAKE, '--mode', 'ok'],
  });
  ctx.prProvider = Object.assign({}, ctx.prProvider, {
    open: async () => {
      opened += 1;
      throw new Error('prProvider.open must not be reached');
    },
  });

  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'NO_CHANGES_PRODUCED');
  assert.match(r.detail, /changed no files/);
  assert.equal(opened, 0, 'no branch may be published for an empty attempt');
  assert.ok(r.trace.includes('VALIDATING'), JSON.stringify(r.trace));
  assert.ok(!r.trace.includes('PR_OPEN'), 'PR must not be opened');

  // The executor's own words survive into the record.
  //
  // They did not. summarize() keeps stdout and stderr only when told to, this
  // branch did not tell it to, and cleanupWorktree() then deleted the tree the
  // run happened in — so the ONE verdict that cannot be diagnosed without the
  // executor's output was the one keeping none of it. A real canary attempt
  // ended here and left "changed no files" as the entire evidence: whether the
  // lane refused, misread its prompt, or wrote outside the boundary was
  // unanswerable, and the only way to ask was to run it again blind.
  const rec = ctx.store.current('PILOT-NO-CHANGES');
  assert.equal(rec.state, 'BLOCKED');
  assert.ok(rec.payload.run, 'the run summary is recorded');
  assert.equal(typeof rec.payload.run.stdoutTail, 'string', 'stdout is kept');
  assert.equal(typeof rec.payload.run.stderrTail, 'string', 'stderr is kept');
  assert.equal(rec.payload.run.exitCode, 0, 'and the exit code that made this confusing');
});

// ------------------------------------------------------------- CI WAITING

const CI_NAMES = ['Test Suite', 'Web Tests (vitest)'];
const ciPending = () => CI_NAMES.map((name) => ({ name, status: 'PENDING', conclusion: null }));
const ciGreen = () => CI_NAMES.map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' }));

// CI used to be observed exactly once, seconds after the push, while every
// check was still queued — and a pending check was reported as
// REQUIRED_CI_FAILED. A correct attempt could not reach MERGE_READY whatever CI
// later said. Measured on a live run: PR opened, seven checks IN_PROGRESS, run
// blocked naming three of them.
test('PILOT: pending CI is waited on, not called a failure', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/ciwait/out.txt', 'x\n');
  let look = 0;
  const slept = [];
  const ctx = ctxFor(repo, { specOver: { taskId: 'PILOT-CI-WAIT', allowedRoots: ['fixture/ciwait/'] } });
  ctx.ciProvider = {
    requiredSources: async () => ({ taskSpecRequired: ['Test Suite'], platformRequired: ['Web Tests (vitest)'], governanceRequired: [] }),
    observe: async () => (++look < 3 ? ciPending() : ciGreen()),
  };
  ctx.ciWaitMs = 60000;
  ctx.ciPollMs = 5;
  ctx.sleep = async (ms) => { slept.push(ms); };

  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'MERGE_READY', JSON.stringify(r.blockerCode || r.detail));
  assert.equal(look, 3, 'must keep observing until CI settles');
  assert.deepEqual(slept, [5, 5], 'must sleep between observations');
});

test('PILOT: a genuinely failed required check is not waited on', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/cifail/out.txt', 'x\n');
  let look = 0;
  const ctx = ctxFor(repo, { specOver: { taskId: 'PILOT-CI-FAIL', allowedRoots: ['fixture/cifail/'] } });
  ctx.ciProvider = {
    requiredSources: async () => ({ taskSpecRequired: ['Test Suite'], platformRequired: ['Web Tests (vitest)'], governanceRequired: [] }),
    observe: async () => {
      look += 1;
      return [
        { name: 'Test Suite', status: 'COMPLETED', conclusion: 'FAILURE' },
        { name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
      ];
    },
  };
  ctx.ciWaitMs = 60000;
  ctx.sleep = async () => { throw new Error('must not sleep on a real failure'); };

  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'REQUIRED_CI_FAILED');
  assert.match(r.detail, /Test Suite=FAILURE/);
  assert.equal(look, 1, 'a completed failure is decided on the first look');
});

test('PILOT: CI that never settles times out, and says so without a new blocker code', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/citimeout/out.txt', 'x\n');
  const ctx = ctxFor(repo, { specOver: { taskId: 'PILOT-CI-TIMEOUT', allowedRoots: ['fixture/citimeout/'] } });
  ctx.ciProvider = {
    requiredSources: async () => ({ taskSpecRequired: ['Test Suite'], platformRequired: ['Web Tests (vitest)'], governanceRequired: [] }),
    observe: async () => ciPending(),
  };
  ctx.ciWaitMs = 0; // deadline already past on the first look
  ctx.sleep = async () => { throw new Error('must not sleep past the deadline'); };

  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'BLOCKED');
  // result.schema.json pins blockerCode to a fixed enum and adding a value is
  // an owner amendment, so the distinction rides in the detail and in ci.pending.
  assert.equal(r.blockerCode, 'REQUIRED_CI_FAILED');
  assert.match(r.detail, /^CI_STILL_PENDING_AT_DEADLINE: /);
});

test('PILOT: checks not yet registered are waited out, then still fail closed', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/cimissing/out.txt', 'x\n');
  let look = 0;
  const slept = [];
  const ctx = ctxFor(repo, { specOver: { taskId: 'PILOT-CI-NOTYET', allowedRoots: ['fixture/cimissing/'] } });
  ctx.ciProvider = {
    requiredSources: async () => ({ taskSpecRequired: ['Test Suite'], platformRequired: ['Web Tests (vitest)'], governanceRequired: [] }),
    // Nothing registered on the first two looks — exactly what GitHub returns
    // in the seconds after a push, and what blocked the OFFICE lane.
    observe: async () => (++look < 3 ? [] : ciGreen()),
  };
  ctx.ciMissingGraceMs = 60000;
  ctx.ciPollMs = 5;
  ctx.sleep = async (ms) => { slept.push(ms); };

  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'MERGE_READY', JSON.stringify(r.blockerCode || r.detail));
  assert.equal(look, 3, 'must keep looking while checks are still being registered');
  assert.deepEqual(slept, [5, 5]);
});

test('PILOT: a check that never registers fails closed once the grace is spent', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/cinever/out.txt', 'x\n');
  const ctx = ctxFor(repo, { specOver: { taskId: 'PILOT-CI-NEVER', allowedRoots: ['fixture/cinever/'] } });
  ctx.ciProvider = {
    requiredSources: async () => ({ taskSpecRequired: ['Test Suite'], platformRequired: ['Web Tests (vitest)'], governanceRequired: [] }),
    observe: async () => [{ name: 'Test Suite', status: 'COMPLETED', conclusion: 'SUCCESS' }],
  };
  ctx.ciMissingGraceMs = 0;
  ctx.sleep = async () => { throw new Error('must not sleep past the grace'); };

  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'REQUIRED_CI_FAILED');
  assert.match(r.detail, /Web Tests \(vitest\)/);
});

// ------------------------------------------- ATTESTATION TERMS ARE MEASURED

// Three conjunction terms were the literal `true`: taskSpecHashMatchesGrant,
// requiredInvariantsPass and worktreeStateValid. The attestation reported
// "15/15" while three of the fifteen asserted nothing at all.
test('PILOT: requiredInvariantsPass fails when the gates that ran are not the ratified ones', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/inv/out.txt', 'x');
  const ctx = ctxFor(repo, { specOver: { taskId: 'PILOT-INVARIANT', allowedRoots: ['fixture/inv/'] } });
  // A runner that reports success for a DIFFERENT command than the plan pinned.
  // requiredTestsPass still reports true — every result is status 0 — which is
  // exactly why the gate set has to be re-digested rather than counted.
  ctx.testRunner = (t) => {
    t.argv = ['pnpm', 'exec', 'something-else'];
    return { status: 0 };
  };

  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'MERGE_READY_CONJUNCTION_FAILED');
  assert.match(r.detail, /requiredInvariantsPass/);
});

test('PILOT: worktreeStateValid fails when the validated tree is gone', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/wtv/out.txt', 'x\n');
  const ctx = ctxFor(repo, { specOver: { taskId: 'PILOT-WTVALID', allowedRoots: ['fixture/wtv/'] } });
  // A worktree whose path does not exist: the diff's provenance is unprovable.
  ctx.worktreeFactory = ({ pinnedBase }) => ({
    path: path.join(repo, 'no-such-worktree'),
    pinnedBaseSha: pinnedBase,
    branch: 'fixture',
  });

  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'BLOCKED');
  assert.notEqual(r.blockerCode, undefined);
});

test('PILOT: a healthy run reports every conjunction term as measured, none constant', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/allterms/out.txt', 'x\n');
  const ctx = ctxFor(repo, { specOver: { taskId: 'PILOT-ALLTERMS', allowedRoots: ['fixture/allterms/'] } });
  const r = await orch.runTask(ctx);
  assert.equal(r.disposition, 'MERGE_READY', JSON.stringify(r.blockerCode || r.detail));
  const c = r.attestation.conjunction;
  for (const k of ['taskSpecHashMatchesGrant', 'requiredInvariantsPass', 'worktreeStateValid']) {
    assert.equal(c[k], true, k);
  }
});

// --------------------------------------------------- WORKTREE PATH BUDGET

// Windows MAX_PATH is 260 and this repository's longest tracked path is 163.
// A full taskId plus attempt suffix was 62 characters, which left no headroom:
// `git worktree add` half-populated the tree AND `git worktree remove` then
// could not delete it, stranding directories the cleanup policy forbids
// removing recursively. Three such directories exist in this repository today.
test('PILOT: the worktree directory name stays inside the path budget', () => {
  const longest = 163; // measured: the longest tracked path in this repository
  const worstTask = 'OFFICE-CAP-02-REPORTINGLINE-READ-CHARACTERIZATION-R01';
  const name = orch.worktreeDirName(worstTask, 'deadbeefcafebabe');

  assert.ok(name.length <= orch.WORKTREE_DIR_TASK_CHARS + 9, 'dir name is bounded: ' + name);
  // Under a short root, the deepest file must still fit with room to spare.
  const total = 'C:/HY_ORCH/'.length + name.length + 1 + longest;
  assert.ok(total < 260, 'deepest path would be ' + total);

  // Still recognisable, and two truncations of different attempts stay apart.
  assert.ok(name.startsWith('OFFICE-CAP-02'), name);
  assert.notEqual(orch.worktreeDirName(worstTask, 'aaaaaaaa11'), orch.worktreeDirName(worstTask, 'bbbbbbbb22'));
});

// ------------------------------------------------- SCENARIO: ELIGIBLE RESUME

/**
 * A task left at ELIGIBLE is the crash window nobody handled: everything was
 * validated, the lease had not yet been taken, and the process died. These run
 * the REAL runTask against a real store, because the defect was an interaction
 * between the opening branch and the state CAS — not something a unit test on
 * the guard could have caught.
 */

/** Drive a real task store to ELIGIBLE the way a dying run would leave it. */
function leaveAtEligible(repo, store, sg) {
  const base = { taskId: sg.spec.taskId, taskSpecVersion: 1 };
  store.transition(Object.assign({ to: 'DECLARED', expectedPreviousState: null, writerIdentity: 'TASK_AUTHOR' }, base));
  store.transition(Object.assign({ to: 'AUTHORIZED', expectedPreviousState: 'DECLARED', writerIdentity: 'OWNER' }, base));
  store.transition(
    Object.assign(
      {
        to: 'ELIGIBLE',
        expectedPreviousState: 'AUTHORIZED',
        writerIdentity: 'ORCHESTRATOR',
        payload: { allowedRoots: sg.spec.boundaryPolicy.allowedRoots },
      },
      base,
    ),
  );
}

test('PILOT ER-1: a task left at ELIGIBLE is picked up, not permanently stuck', async () => {
  // Before this, the opening branch handled only "no record" and BLOCKED, so a
  // record at ELIGIBLE fell through to a write expecting AUTHORIZED and died
  // with STATE_CAS_MISMATCH: expected DECLARED but store holds ELIGIBLE.
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/er1/out.txt', 'x\n');
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const sg = F.specAndGrant({ taskId: 'PILOT-ER-1', allowedRoots: ['fixture/er1/'] });

  leaveAtEligible(repo, store, sg);
  assert.equal(store.current('PILOT-ER-1').state, 'ELIGIBLE');

  const r = await orch.runTask(ctxFor(repo, { store, sg }));
  assert.equal(r.disposition, 'MERGE_READY', JSON.stringify(r.blockerCode || r.detail));
  assert.ok(r.trace.indexOf('ELIGIBLE(resumed-in-place)') !== -1, 'the resume is visible in the trace');
});

test('PILOT ER-2: the resume records where it came from, and under a NEW attempt', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/er2/out.txt', 'x\n');
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const sg = F.specAndGrant({ taskId: 'PILOT-ER-2', allowedRoots: ['fixture/er2/'] });
  leaveAtEligible(repo, store, sg);

  await orch.runTask(ctxFor(repo, { store, sg }));

  const claimed = store.history('PILOT-ER-2').filter((h) => h.state === 'CLAIMED').pop();
  assert.ok(claimed, 'the task reached CLAIMED');
  assert.equal(claimed.payload.resumedFromState, 'ELIGIBLE');
  assert.ok(claimed.payload.attemptId, 'a new attempt id was recorded');
  assert.notEqual(claimed.payload.attemptId, claimed.payload.previousAttemptId);
  assert.ok(claimed.payload.revalidatedAtMs, 'and when it was re-validated');
});

test('PILOT ER-3: a revoked grant is refused at the ELIGIBLE resume, not run', async () => {
  // Everything is re-verified on the way through: the resume skips the state
  // WRITES, never the checks.
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/er3/out.txt', 'x\n');
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const sg = F.specAndGrant({ taskId: 'PILOT-ER-3', allowedRoots: ['fixture/er3/'] });
  leaveAtEligible(repo, store, sg);

  const r = await orch.runTask(ctxFor(repo, { store, sg, grantRevoked: true }));
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'GRANT_REVOKED');
});

test('PILOT ER-4: a live lease stops the ELIGIBLE resume before an executor starts', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/er4/out.txt', 'x\n');
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const sg = F.specAndGrant({ taskId: 'PILOT-ER-4', allowedRoots: ['fixture/er4/'] });
  leaveAtEligible(repo, store, sg);

  // Somebody else is holding it.
  lease.claim({
    cwd: repo,
    taskId: 'PILOT-ER-4',
    holder: 'CODEX_LOCAL',
    holderToken: 'f'.repeat(32),
    taskAttemptId: 'e'.repeat(32),
    ttlMs: 10 * 60 * 1000,
  });

  const r = await orch.runTask(ctxFor(repo, { store, sg }));
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'ELIGIBLE_RESUME_REFUSED');
  assert.match(r.detail, /LIVE_EXECUTOR_HOLDS_LEASE/);
});

test('PILOT ER-5: a live PID stops it even when the lease has lapsed', async () => {
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/er5/out.txt', 'x\n');
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const sg = F.specAndGrant({ taskId: 'PILOT-ER-5', allowedRoots: ['fixture/er5/'] });
  leaveAtEligible(repo, store, sg);

  // No lease at all, but the queue says this process is still running it.
  const r = await orch.runTask(
    ctxFor(repo, {
      store,
      sg,
      ctxExtra: { queueEntry: { entryId: 'e1', taskId: 'PILOT-ER-5', state: 'EXECUTING', owner: { pid: process.pid } } },
    }),
  );
  assert.equal(r.disposition, 'BLOCKED');
  assert.match(r.detail, /LIVE_EXECUTOR_PROCESS/);
});

test('PILOT ER-6: resuming twice does not run twice', async () => {
  // The first resume takes the lease and finishes at MERGE_READY; the second
  // finds a state that is no longer ELIGIBLE and does not start again.
  const repo = F.fixtureRepo();
  F.seedChange(repo, 'fixture/er6/out.txt', 'x\n');
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const sg = F.specAndGrant({ taskId: 'PILOT-ER-6', allowedRoots: ['fixture/er6/'] });
  leaveAtEligible(repo, store, sg);

  const first = await orch.runTask(ctxFor(repo, { store, sg }));
  assert.equal(first.disposition, 'MERGE_READY', JSON.stringify(first.blockerCode));

  const second = await orch.runTask(ctxFor(repo, { store, sg }));
  assert.equal(second.disposition, 'BLOCKED', 'the second attempt does not re-run the executor');
  // Refused BY NAME. Before this the caller got "STATE_CAS_MISMATCH: expected
  // DECLARED but store holds MERGE_READY" — a message about an internal write,
  // for a caller whose actual mistake was starting a finished task again.
  assert.equal(second.blockerCode, 'TASK_NOT_REENTRANT');
  assert.match(second.detail, /MERGE_READY/);
});

test('PILOT CR-1: a task may CREATE a file inside its authorized root', async () => {
  // It could not. Every untracked path is an escape to the validator — right,
  // since an untracked file is not part of a diff it can judge — so no task
  // could ever add a file, while "add a characterization test" is the canonical
  // task class here. Created files inside the roots are now staged with
  // --intent-to-add and judged by the same rules as any other change.
  const repo = F.fixtureRepo();
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const sg = F.specAndGrant({ taskId: 'PILOT-CR-1', allowedRoots: ['fixture/created/'] });

  // The fake executor writes a NEW file inside the authorized root.
  const r = await orch.runTask(
    ctxFor(repo, {
      store,
      sg,
      executorArgv: [F.FAKE, '--mode', 'ok', '--create', 'fixture/created/new.txt'],
    }),
  );
  assert.equal(r.disposition, 'MERGE_READY', JSON.stringify(r.blockerCode || r.detail));
  assert.ok(r.trace.some((x) => x.indexOf('STAGED_CREATED:') === 0), 'the creation was staged for the validator');
});

test('PILOT CR-2: a file created OUTSIDE the authorized root is still an escape', async () => {
  // The escape path is unchanged: anything outside is not staged, stays
  // untracked, and still trips UNTRACKED_FILE_PRESENT.
  const repo = F.fixtureRepo();
  const store = stateMod.createStore(stateMod.defaultStateDir(repo));
  const sg = F.specAndGrant({ taskId: 'PILOT-CR-2', allowedRoots: ['fixture/allowed/'] });

  const r = await orch.runTask(
    ctxFor(repo, {
      store,
      sg,
      executorArgv: [F.FAKE, '--mode', 'ok', '--create', 'fixture/elsewhere/sneaky.txt'],
    }),
  );
  assert.equal(r.disposition, 'BLOCKED');
  assert.equal(r.blockerCode, 'BOUNDARY_ESCAPE');
  assert.match(r.detail, /UNTRACKED_FILE_PRESENT/);
});
