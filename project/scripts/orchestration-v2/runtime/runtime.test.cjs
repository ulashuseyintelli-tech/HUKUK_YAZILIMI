'use strict';
/**
 * GOV-COORD-V2 runtime gate — composition root and adapter tests.
 *
 * Everything here runs against fakes. No real gh call, no real PR, no real
 * install, no worktree in the production root. The one property these tests
 * exist to protect is that the runner cannot merge and cannot leak a
 * credential, and that the adapters fail closed rather than guessing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const runner = require('./run-task.cjs');
const envPolicy = require('./env-policy.cjs');
const prep = require('./prepare-environment.cjs');
const { createGhPrProvider } = require('./gh-pr-provider.cjs');
const { createGhCiProvider } = require('./gh-ci-provider.cjs');
const mergeready = require('../orchestrator/mergeready.cjs');
const spawnMod = require('../executors/spawn.cjs');
const stateMod = require('../orchestrator/state.cjs');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const SPEC = {
  schemaVersion: 1,
  taskId: 'RUNTIME-TEST-TASK-01',
  taskSpecVersion: 1,
  profile: 'BOUNDED_CODE_TASK',
  declaredIntent: 'fake',
  boundaryPolicy: { allowedRoots: ['project/apps/api/src/modules/staff/'] },
  requiredTests: [{ cwd: 'project/apps/api', argv: ['pnpm', 'exec', 'jest'] }],
  predecessorTaskIds: [],
  baseDriftPolicy: 'STRICT_PINNED_BASE',
  baseSha: 'a'.repeat(40),
  successorDisposition: 'NO_SUCCESSOR',
};

// ------------------------------------------------------------- MERGE REFUSAL

test('runner: performMerge is impossible, not merely unimplemented', async () => {
  const ctx = runner.buildContext({
    repoCwd: tmp('gov-rt-'),
    spec: SPEC,
    grant: { grantId: 'G' },
    store: { current: () => null, transition: () => {} },
    prProvider: {},
    ciProvider: {},
    prepareEnvironment: () => ({ ok: true }),
  });
  await assert.rejects(() => ctx.performMerge({ result: {} }), (e) => e.code === 'MERGE_NOT_PERMITTED');
});

// -------------------------------------------------------------- BASE DRIFT

// orchestrator.cjs §13 uses baseRef for exactly one thing under
// STRICT_PINNED_BASE: `git rev-parse(baseRef) !== spec.baseSha` -> BLOCKED. The
// worktree base is taken from spec.baseSha directly, not from baseRef.
//
// So handing baseRef the pinned sha made the gate compare the pinned base
// against itself: rev-parse of a commit id is that commit id, the inequality
// could never hold, and a plan pinned to a commit main had long moved past
// would still execute — silently, with an attestation claiming §13 was
// satisfied. Both T5 plans were in exactly that state when this was found.
test('runner: baseRef is a branch ref, so the §13 drift gate can actually fire', () => {
  const ctx = runner.buildContext({
    repoCwd: tmp('gov-rt-'),
    spec: SPEC,
    grant: { grantId: 'G' },
    store: { current: () => null, transition: () => {} },
    prProvider: {},
    ciProvider: {},
    prepareEnvironment: () => ({ ok: true }),
  });
  assert.notEqual(ctx.baseRef, SPEC.baseSha, 'baseRef must not be the pinned sha');
  assert.equal(ctx.baseRef, 'origin/main');
});

test('runner: baseRef follows targetBranch as a remote ref', () => {
  const base = {
    repoCwd: tmp('gov-rt-'),
    spec: SPEC,
    grant: { grantId: 'G' },
    store: { current: () => null, transition: () => {} },
    prProvider: {},
    ciProvider: {},
    prepareEnvironment: () => ({ ok: true }),
  };
  assert.equal(runner.buildContext({ ...base, targetBranch: 'release/v2' }).baseRef, 'origin/release/v2');
  // An explicit baseRef still wins — the orchestrator's own tests inject one.
  assert.equal(runner.buildContext({ ...base, baseRef: 'upstream/main' }).baseRef, 'upstream/main');
});

// -------------------------------------------------------------- ENV POLICY

test('env policy: forbidden credentials cannot be allowlisted, even explicitly', () => {
  assert.throws(
    () => envPolicy.resolveCredentialAllowlist(['DATABASE_URL']),
    (e) => e.code === 'CREDENTIAL_FORBIDDEN',
  );
  assert.throws(
    () => envPolicy.resolveCredentialAllowlist(['GH_TOKEN', 'SMTP_PASSWORD']),
    (e) => e.code === 'CREDENTIAL_FORBIDDEN',
  );
});

test('env policy: default allowlist carries no secret beyond GitHub and pnpm', () => {
  const allow = envPolicy.resolveCredentialAllowlist();
  assert.deepEqual(allow, ['COREPACK_HOME', 'GH_TOKEN', 'GITHUB_TOKEN', 'PNPM_HOME']);
  for (const denied of envPolicy.NEVER_FORWARD) assert.equal(allow.indexOf(denied), -1, denied);
});

test('env policy: withheld names are reported by name only, never by value', () => {
  const parent = { DATABASE_URL: 'postgres://secret', GH_TOKEN: 'x', PATH: '/usr/bin' };
  const withheld = envPolicy.withheldFromParent(parent);
  assert.deepEqual(withheld, ['DATABASE_URL']);
  assert.equal(JSON.stringify(withheld).indexOf('secret'), -1);
});

test('runner: the built context forwards the policy allowlist, not the raw env', () => {
  const ctx = runner.buildContext({
    repoCwd: tmp('gov-rt-'),
    spec: SPEC,
    grant: {},
    store: { current: () => null, transition: () => {} },
    parentEnv: { DATABASE_URL: 'nope', GH_TOKEN: 'ok' },
    prProvider: {},
    ciProvider: {},
    prepareEnvironment: () => ({ ok: true }),
  });
  assert.equal(ctx.credentialAllowlist.indexOf('DATABASE_URL'), -1);
  assert.ok(ctx.credentialAllowlist.indexOf('GH_TOKEN') >= 0);
});

// -------------------------------------------------------- ENVIRONMENT PREP

test('prepare: a failing step stops the chain and names the command', () => {
  const calls = [];
  const r = prep.prepareEnvironment({
    worktreePath: '/wt',
    steps: [
      { cwd: 'project', argv: ['ok-step'], timeoutMs: 1000 },
      { cwd: 'project', argv: ['bad-step'], timeoutMs: 1000 },
      { cwd: 'project', argv: ['never-runs'], timeoutMs: 1000 },
    ],
    runner: (argv) => {
      calls.push(argv[0]);
      return argv[0] === 'bad-step' ? { status: 3, stderr: 'boom' } : { status: 0, stdout: '' };
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.detail, /bad-step exit=3/);
  assert.match(r.detail, /boom/);
  assert.deepEqual(calls, ['ok-step', 'bad-step'], 'the third step must not run');
});

test('prepare: the real steps only ever write under gitignored node_modules', () => {
  for (const s of prep.STEPS) {
    assert.equal(s.cwd, 'project');
    assert.equal(s.argv[0], 'pnpm');
  }
  // --frozen-lockfile is what keeps the install from rewriting a tracked file.
  assert.ok(prep.STEPS[0].argv.includes('--frozen-lockfile'), 'install must be frozen');
  assert.ok(prep.STEPS.some((s) => s.argv.includes('prisma') && s.argv.includes('generate')));
  for (const p of prep.EXPECTED_WRITE_PREFIXES) assert.match(p, /node_modules\/$/);
});

// ------------------------------------------------------------- CI PROVIDER

test('ci provider: the required set is the union of all three sources', async () => {
  const p = createGhCiProvider({
    repoCwd: '/repo',
    governanceRequired: ['Test Suite'],
    taskSpecRequired: ['Orchestration Tests'],
    ghRunner: () => ({ ok: true, out: '["CodeQL","Test Suite"]' }),
  });
  const sources = await p.requiredSources();
  const required = mergeready.effectiveRequiredCiChecks(sources);
  assert.deepEqual(required, ['CodeQL', 'Orchestration Tests', 'Test Suite']);
});

test('ci provider: unreadable branch protection yields an empty platform set, not a pass', async () => {
  const p = createGhCiProvider({
    repoCwd: '/repo',
    governanceRequired: ['Test Suite'],
    ghRunner: () => ({ ok: false, out: 'HTTP 404' }),
  });
  const sources = await p.requiredSources();
  assert.deepEqual(sources.platformRequired, []);
  // The governance floor still applies, so the union is never empty.
  assert.deepEqual(mergeready.effectiveRequiredCiChecks(sources), ['Test Suite']);
});

test('ci provider: a pending check is PENDING, and evaluateCi fails closed on it', async () => {
  const p = createGhCiProvider({
    repoCwd: '/repo',
    governanceRequired: ['Test Suite'],
    ghRunner: (args) =>
      args.includes('statusCheckRollup')
        ? { ok: true, out: JSON.stringify({ statusCheckRollup: [{ name: 'Test Suite', conclusion: null }] }) }
        : { ok: true, out: '[]' },
  });
  const observed = await p.observe({ pr: { number: 1 } });
  assert.deepEqual(observed, [{ name: 'Test Suite', status: 'PENDING', conclusion: null }]);
  const ci = mergeready.evaluateCi({ sources: await p.requiredSources(), observed });
  assert.equal(ci.pass, false);
  assert.deepEqual(ci.notSuccess, ['Test Suite=PENDING']);
});

test('ci provider: a required check absent from the rollup fails closed', async () => {
  const p = createGhCiProvider({
    repoCwd: '/repo',
    governanceRequired: ['Test Suite', 'Architectural Guardrails'],
    ghRunner: (args) =>
      args.includes('statusCheckRollup')
        ? { ok: true, out: JSON.stringify({ statusCheckRollup: [{ name: 'Test Suite', conclusion: 'SUCCESS' }] }) }
        : { ok: true, out: '[]' },
  });
  const ci = mergeready.evaluateCi({
    sources: await p.requiredSources(),
    observed: await p.observe({ pr: { number: 1 } }),
  });
  assert.equal(ci.pass, false);
  assert.deepEqual(ci.missing, ['Architectural Guardrails']);
});

test('ci provider: commit-status entries expose `context`, check runs expose `name`', async () => {
  const p = createGhCiProvider({
    repoCwd: '/repo',
    ghRunner: (args) =>
      args.includes('statusCheckRollup')
        ? {
            ok: true,
            out: JSON.stringify({
              statusCheckRollup: [
                { name: 'CheckRun', conclusion: 'SUCCESS' },
                { context: 'LegacyStatus', conclusion: 'SUCCESS' },
              ],
            }),
          }
        : { ok: true, out: '[]' },
  });
  const observed = await p.observe({ pr: { number: 1 } });
  assert.deepEqual(observed.map((c) => c.name), ['CheckRun', 'LegacyStatus']);
});

// ------------------------------------------------------------- PR PROVIDER

test('pr provider: state reads the target tip from the remote, not a local ref', async () => {
  const gitCalls = [];
  const p = createGhPrProvider({
    repoCwd: '/repo',
    ghRunner: () => JSON.stringify({ headRefOid: 'b'.repeat(40), baseRefName: 'main', state: 'OPEN' }),
    gitRunner: (args) => {
      gitCalls.push(args.join(' '));
      if (args[0] === 'ls-remote') return 'c'.repeat(40) + '\trefs/heads/main';
      if (args[0] === 'merge-base') return 'd'.repeat(40);
      return '';
    },
  });
  const st = await p.state({ pr: { number: 7 } });
  assert.equal(st.headSha, 'b'.repeat(40));
  assert.equal(st.targetBranchSha, 'c'.repeat(40));
  assert.equal(st.mergeBaseSha, 'd'.repeat(40));
  assert.ok(gitCalls.some((c) => c.startsWith('ls-remote origin refs/heads/main')));
});

test('pr provider: a detached worktree HEAD refuses to open a PR', async () => {
  const p = createGhPrProvider({
    repoCwd: '/repo',
    ghRunner: () => '',
    gitRunner: () => 'HEAD',
  });
  await assert.rejects(() => p.open({ worktreePath: '/wt', taskId: 'T' }), (e) => e.code === 'DETACHED_HEAD');
});

test('pr provider: an unparseable create response fails rather than inventing a number', async () => {
  const p = createGhPrProvider({
    repoCwd: '/repo',
    ghRunner: () => 'something went sideways',
    gitRunner: (args) => (args[0] === 'rev-parse' ? 'orchestrator/t-1' : ''),
  });
  await assert.rejects(
    () => p.open({ worktreePath: '/wt', taskId: 'T', validated: {}, verdict: {} }),
    (e) => e.code === 'PR_NUMBER_UNPARSEABLE',
  );
});

test('pr provider: the adapter exposes no merge capability at all', () => {
  const p = createGhPrProvider({ repoCwd: '/repo', ghRunner: () => '', gitRunner: () => '' });
  assert.deepEqual(Object.keys(p).sort(), ['open', 'state']);
});

// ------------------------------------------------------------------- ARGS

test('runner: argument parsing rejects unknown flags and missing values', () => {
  assert.throws(() => runner.parseArgs(['--nope']), (e) => e.code === 'ARG_UNKNOWN');
  assert.throws(() => runner.parseArgs(['--plan']), (e) => e.code === 'ARG_MISSING_VALUE');
  assert.throws(() => runner.parseArgs(['--grant', 'g.json']), (e) => e.code === 'ARG_REQUIRED');
  const ok = runner.parseArgs(['--plan', 'p.json', '--grant', 'g.json', '--dry-run']);
  assert.equal(ok.dryRun, true);
});

test('runner: the governance floor names checks, and they reach the required set', async () => {
  assert.ok(runner.GOVERNANCE_REQUIRED_CHECKS.length > 0);
  const ctx = runner.buildContext({
    repoCwd: tmp('gov-rt-'),
    spec: SPEC,
    grant: {},
    store: { current: () => null, transition: () => {} },
    prProvider: {},
    prepareEnvironment: () => ({ ok: true }),
    taskSpecRequired: [],
  });
  const sources = await ctx.ciProvider.requiredSources();
  for (const c of runner.GOVERNANCE_REQUIRED_CHECKS) {
    assert.ok(sources.governanceRequired.indexOf(c) >= 0, c);
  }
});

// --------------------------------------------------------------- SPAWN MODE
//
// These tests exercise the REAL spawn path. The adapters above inject a fake gh
// runner, which is why they all passed while the live ciProvider returned an
// empty platform-required set: the defect lived in exactly the layer the tests
// mocked out. A live preflight found it, not the suite.

const spawnMode = require('./spawn-mode.cjs');

test('spawn mode: the decision follows the resolved file, not the platform', () => {
  const m = spawnMode.spawnModeFor('node');
  // node resolves to a real image everywhere this runs.
  assert.equal(m.shell, false);
  assert.ok(['DIRECTLY_SPAWNABLE', 'POSIX_NEVER_NEEDS_SHELL'].includes(m.reason), m.reason);
});

test('spawn mode: an unresolvable command does not silently get a shell', () => {
  const m = spawnMode.spawnModeFor('definitely-not-a-real-command-x9z');
  assert.equal(m.shell, false);
  assert.ok(['UNRESOLVED', 'POSIX_NEVER_NEEDS_SHELL'].includes(m.reason), m.reason);
});

test('spawn mode: whitespace in an argument is unsafe under a shell', () => {
  assert.equal(spawnMode.quotingIsSafe(['api', 'repos/x/y']), true);
  assert.equal(spawnMode.quotingIsSafe(['--jq', '.contexts // []']), false);
  assert.equal(spawnMode.quotingIsSafe(['--title', 'orchestrated: TASK-1']), false);
  assert.equal(spawnMode.quotingIsSafe(['--body', 'a&b']), false);
});

test('spawn mode: a real .cmd shim takes the shell branch, and an unsafe argv there fails closed', (t) => {
  if (process.platform !== 'win32') return t.skip('shim semantics are Windows-only');
  // A real shim on a real PATH — not a stub, because the defect this guards
  // against lived precisely in the layer a stub would replace.
  const dir = tmp('gov-shim-');
  fs.writeFileSync(path.join(dir, 'toolshim.cmd'), '@echo off\r\necho ok\r\n');
  const env = { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' };

  const mode = spawnMode.spawnModeFor('toolshim', env);
  assert.equal(mode.shell, true, 'a .cmd cannot be spawned with shell:false on Windows');
  assert.equal(mode.reason, 'SHIM_REQUIRES_SHELL');

  // Safe argv: it runs, and it runs under a shell.
  let sawShell = null;
  const okRun = spawnMode.safeSpawn(
    (c, a, o) => {
      sawShell = o.shell;
      return { status: 0, stdout: '', stderr: '' };
    },
    'toolshim',
    ['--flag', 'value'],
    { env },
  );
  assert.equal(okRun.status, 0);
  assert.equal(sawShell, true);

  // Unsafe argv: refused rather than handed to cmd.exe to re-split.
  let called = false;
  const refused = spawnMode.safeSpawn(
    () => {
      called = true;
      return { status: 0 };
    },
    'toolshim',
    ['--jq', '.contexts // []'],
    { env },
  );
  assert.equal(called, false, 'the corrupting call must not be made at all');
  assert.equal(refused.status, null);
  assert.equal(refused.error.code, 'SPAWN_UNSAFE_UNDER_SHELL');
  assert.match(refused.stderr, /re-split/);
});

test('spawn mode: the real gh argv that broke the preflight now survives', () => {
  const argv = ['api', 'repos/{owner}/{repo}/branches/main/protection/required_status_checks', '--jq', '.contexts // []'];
  const mode = spawnMode.spawnModeFor('gh');
  if (mode.reason === 'UNRESOLVED') return; // gh not installed in this environment
  // The whole point: gh is a real image, so this argv is delivered intact.
  assert.equal(mode.shell, false, 'gh resolved to ' + mode.resolvedPath + ' and must not go through cmd.exe');
  assert.equal(spawnMode.quotingIsSafe(argv), false, 'the argv is genuinely shell-unsafe, which is why shell:false matters');
});

// ------------------------------------------------- CONTRACT WITH REAL MODULES
//
// buildContext hands values to modules whose accepted vocabulary it does not
// share. A misspelling there is invisible until a live run reaches that stage —
// promptTransport was set to 'STDIN' where spawn.cjs accepts only
// 'SINGLE_ARGUMENT' and 'STDIN_PAYLOAD', which would have failed every run at
// the executor spawn, after the lease was taken and the worktree built. These
// tests assert the composition root's output against the real consumers rather
// than against a restatement of them.

test('context: promptTransport is a value spawn.cjs actually accepts', () => {
  const ctx = runner.buildContext({
    repoCwd: tmp('gov-rt-'),
    spec: SPEC,
    grant: {},
    store: { current: () => null, transition: () => {} },
    prProvider: {},
    ciProvider: {},
    prepareEnvironment: () => ({ ok: true }),
  });
  assert.ok(
    spawnMod.PROMPT_TRANSPORTS
      ? spawnMod.PROMPT_TRANSPORTS.includes(ctx.promptTransport)
      : ['SINGLE_ARGUMENT', 'STDIN_PAYLOAD'].includes(ctx.promptTransport),
    'promptTransport=' + ctx.promptTransport + ' is not accepted by spawn.cjs',
  );
});

test('context: the real spawn rejects the old spelling, which is why the test above exists', async () => {
  // runExecutor checks executor availability before transport, so the fixture
  // has to be a manifest that passes the first gate — otherwise the test
  // "passes" against EXECUTOR_UNAVAILABLE and proves nothing about transport.
  const resolved = {
    state: 'AVAILABLE',
    executorLane: 'CODEX_LOCAL',
    resolvedAbsolutePath: process.execPath,
    launchPrefixArgv: [],
  };
  const base = {
    resolved,
    argv: ['-e', 'process.exit(0)'],
    workingDirectory: tmp('gov-rt-'),
    prompt: 'x',
  };
  let code = null;
  try {
    await spawnMod.runExecutor(Object.assign({}, base, { promptTransport: 'STDIN' }));
  } catch (e) {
    code = e.code;
  }
  assert.equal(code, 'PROMPT_TRANSPORT_INVALID', 'the old spelling must be rejected by the real module');

  // And the value buildContext now produces gets past that gate.
  let accepted = true;
  try {
    await spawnMod.runExecutor(Object.assign({}, base, { promptTransport: 'STDIN_PAYLOAD' }));
  } catch (e) {
    if (e.code === 'PROMPT_TRANSPORT_INVALID') accepted = false;
  }
  assert.equal(accepted, true, 'STDIN_PAYLOAD must be accepted');
});

test('context: the store lands outside the validated tree', () => {
  const repo = tmp('gov-rt-');
  // defaultStateDir resolves under the git common dir; without a repo it throws,
  // which is itself the right behaviour — the runner must not invent a location.
  assert.throws(() => stateMod.defaultStateDir(repo));
});

test('context: every collaborator runTask calls without a fallback is supplied', () => {
  const ctx = runner.buildContext({
    repoCwd: tmp('gov-rt-'),
    spec: SPEC,
    grant: {},
    store: { current: () => null, transition: () => {} },
    prepareEnvironment: () => ({ ok: true }),
  });
  // These three are invoked directly by runTask with no `ctx.x ? … : fallback`.
  assert.equal(typeof ctx.prProvider.open, 'function');
  assert.equal(typeof ctx.prProvider.state, 'function');
  assert.equal(typeof ctx.ciProvider.requiredSources, 'function');
  assert.equal(typeof ctx.ciProvider.observe, 'function');
  assert.equal(typeof ctx.performMerge, 'function');
  assert.equal(typeof ctx.store.transition, 'function');
});

test('context: each lane gets the headless argv its CLI actually needs', () => {
  for (const lane of ['CLAUDE_LOCAL', 'CODEX_LOCAL']) {
    const ctx = runner.buildContext({
      repoCwd: tmp('gov-rt-'),
      spec: SPEC,
      grant: {},
      lane,
      store: { current: () => null, transition: () => {} },
      prProvider: {},
      ciProvider: {},
      prepareEnvironment: () => ({ ok: true }),
    });
    assert.ok(Array.isArray(ctx.executorArgv) && ctx.executorArgv.length > 0, lane);
    assert.equal(ctx.holder, lane);
    // The prompt is NOT in argv: spawn.cjs writes it to stdin, and these argv
    // forms are the ones that read stdin. Verified against the real CLIs.
    assert.ok(!ctx.executorArgv.some((a) => a.length > 40), lane + ' argv must not carry the prompt');
  }
  assert.deepEqual(runner.LANE_ARGV.CLAUDE_LOCAL, ['-p']);
  assert.deepEqual(runner.LANE_ARGV.CODEX_LOCAL, ['exec', '-']);
});

test('context: an unknown lane fails at build time, not after the lease is taken', () => {
  assert.throws(
    () =>
      runner.buildContext({
        repoCwd: tmp('gov-rt-'),
        spec: SPEC,
        grant: {},
        lane: 'SOME_FUTURE_LANE',
        store: { current: () => null, transition: () => {} },
        prProvider: {},
        ciProvider: {},
        prepareEnvironment: () => ({ ok: true }),
      }),
    (e) => e.code === 'EXECUTOR_ARGV_UNKNOWN_LANE',
  );
});
