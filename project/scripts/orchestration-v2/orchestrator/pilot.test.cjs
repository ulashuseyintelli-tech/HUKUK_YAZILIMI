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
