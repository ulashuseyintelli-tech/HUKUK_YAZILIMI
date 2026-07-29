'use strict';
/**
 * GOV-COORD-V2 T3 executor adapter gate.
 *
 * Contract §7.1 (resolution order) and §7.2-§7.6 (process contract).
 *
 * The process contract is exercised against a controllable stand-in executor —
 * argv safety, environment construction, stream caps, cancellation and
 * process-tree termination do not depend on the child being model-backed.
 * Live-CLI resolution/version/smoke evidence is produced by
 * verify-executors.cjs, which is not part of this deterministic suite.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const resolve = require('./resolve.cjs');
const spawnMod = require('./spawn.cjs');

const FAKE = path.join(__dirname, 'fake-executor.cjs');
const NODE = process.execPath;
const SENTINEL = 'GOV_COORD_V2_SMOKE_OK';

const temps = [];
function tempDir(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
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

/** An AVAILABLE manifest that runs the stand-in through the real node binary. */
function fakeResolved(lane) {
  return {
    schemaVersion: 1,
    executorLane: lane || 'CLAUDE_LOCAL',
    state: 'AVAILABLE',
    resolutionSource: 'EXPLICIT_CONFIGURED_PATH',
    resolvedAbsolutePath: NODE,
    version: 'fake ' + process.version,
    smokeExitCode: 0,
    smokeResult: 'PASS',
  };
}

function run(argvTail, over) {
  return spawnMod.runExecutor(
    Object.assign(
      {
        resolved: fakeResolved(),
        argv: [FAKE].concat(argvTail),
        workingDirectory: process.cwd(),
      },
      over || {},
    ),
  );
}

// ----------------------------------------------------------- RESOLUTION ORDER

test('resolve: step 1 — explicit configured path wins', () => {
  const m = resolve.locate({ lane: 'CLAUDE_LOCAL', configuredPath: NODE, env: { PATH: '' } });
  assert.equal(m.resolutionSource, 'EXPLICIT_CONFIGURED_PATH');
  assert.equal(path.resolve(m.resolvedAbsolutePath), path.resolve(NODE));
});

test('resolve: step 2 — PATH resolution finds a binary without a shell', () => {
  const dir = tempDir('govv2-path-');
  const name = process.platform === 'win32' ? 'faketool.exe' : 'faketool';
  fs.writeFileSync(path.join(dir, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const found = resolve.resolveOnPath('faketool', { PATH: dir, PATHEXT: '.EXE' });
  assert.ok(found, 'must resolve on PATH');
  assert.equal(path.dirname(found), dir);
});

test('resolve: step 3 — known installation fallback is used when PATH misses', () => {
  const dir = tempDir('govv2-known-');
  const target = path.join(dir, 'claude.exe');
  fs.writeFileSync(target, 'x', { mode: 0o755 });
  const m = resolve.locate({
    lane: 'CLAUDE_LOCAL',
    env: { PATH: '' },
    knownInstallations: [target],
  });
  assert.equal(m.resolutionSource, 'KNOWN_INSTALLATION_FALLBACK');
});

test('resolve: an unresolvable executor is NOT reported as "not installed"', () => {
  const m = resolve.resolveExecutor({
    lane: 'CODEX_LOCAL',
    env: { PATH: '' },
    knownInstallations: [],
  });
  assert.equal(m.state, 'UNAVAILABLE');
  assert.equal(m.unavailableReason, 'NOT_RESOLVABLE_FROM_THIS_PROCESS_ENVIRONMENT');
});

test('resolve: step 4 — version verification failure yields UNAVAILABLE', () => {
  const m = resolve.resolveExecutor({
    lane: 'CLAUDE_LOCAL',
    configuredPath: NODE,
    versionArgs: ['-e', 'process.exit(3)'],
    skipSmoke: true,
  });
  assert.equal(m.state, 'UNAVAILABLE');
  assert.equal(m.unavailableReason, 'VERSION_VERIFICATION_FAILED');
});

test('resolve: step 5 — smoke PASS produces an AVAILABLE manifest', () => {
  const m = resolve.resolveExecutor({
    lane: 'CLAUDE_LOCAL',
    configuredPath: NODE,
    versionArgs: ['--version'],
    smokeArgs: [FAKE, '--mode', 'smoke', '--sentinel', SENTINEL],
    sentinel: SENTINEL,
  });
  assert.equal(m.state, 'AVAILABLE');
  assert.equal(m.smokeResult, 'PASS');
  assert.equal(m.smokeExitCode, 0);
  assert.match(m.version, /\d+\.\d+\.\d+/);
  assert.equal(m.resolutionSource, 'EXPLICIT_CONFIGURED_PATH');
});

test('resolve: smoke without the sentinel FAILS closed even on exit 0', () => {
  const m = resolve.resolveExecutor({
    lane: 'CLAUDE_LOCAL',
    configuredPath: NODE,
    versionArgs: ['--version'],
    smokeArgs: [FAKE, '--mode', 'ok'],
    sentinel: SENTINEL,
  });
  assert.equal(m.state, 'UNAVAILABLE');
  assert.equal(m.smokeResult, 'FAIL');
  assert.equal(m.unavailableReason, 'SMOKE_FAILED');
});

test('resolve: an unmet smoke precondition is distinguished from a real failure', () => {
  // A lane whose CLI refuses to run in an untrusted cwd must not be reported as
  // unavailable — that would block tasks for a working installation. Driven here
  // through a stand-in that emits the real CODEX_LOCAL message.
  const msg = 'Not inside a trusted directory and --skip-git-repo-check was not specified.';
  const precondition = resolve.resolveExecutor({
    lane: 'CODEX_LOCAL',
    configuredPath: NODE,
    versionArgs: ['--version'],
    smokeArgs: ['-e', 'process.stderr.write(' + JSON.stringify(msg) + ');process.exit(1)'],
    sentinel: SENTINEL,
  });
  assert.equal(precondition.state, 'UNAVAILABLE');
  assert.equal(precondition.unavailableReason, 'SMOKE_PRECONDITION_UNMET');
  assert.match(precondition.smokePreconditionHint, /trusted \(git repository\) working directory/);

  // An ordinary smoke failure keeps the plain reason.
  const genuine = resolve.resolveExecutor({
    lane: 'CODEX_LOCAL',
    configuredPath: NODE,
    versionArgs: ['--version'],
    smokeArgs: ['-e', 'process.stderr.write("boom");process.exit(1)'],
    sentinel: SENTINEL,
  });
  assert.equal(genuine.unavailableReason, 'SMOKE_FAILED');
  assert.equal(genuine.smokePreconditionHint, null);

  // The lane that carries no precondition pattern never reports one.
  const claude = resolve.resolveExecutor({
    lane: 'CLAUDE_LOCAL',
    configuredPath: NODE,
    versionArgs: ['--version'],
    smokeArgs: ['-e', 'process.stderr.write(' + JSON.stringify(msg) + ');process.exit(1)'],
    sentinel: SENTINEL,
  });
  assert.equal(claude.unavailableReason, 'SMOKE_FAILED');
});

test('resolve: skipping the smoke keeps the executor UNAVAILABLE by contract', () => {
  const m = resolve.resolveExecutor({
    lane: 'CLAUDE_LOCAL', configuredPath: NODE, versionArgs: ['--version'], skipSmoke: true,
  });
  assert.equal(m.state, 'UNAVAILABLE');
  assert.equal(m.unavailableReason, 'SMOKE_SKIPPED');
});

test('resolve: minVersion policy is enforced when supplied', () => {
  const m = resolve.resolveExecutor({
    lane: 'CLAUDE_LOCAL', configuredPath: NODE, versionArgs: ['--version'],
    minVersion: '9999.0.0', skipSmoke: true,
  });
  assert.equal(m.unavailableReason, 'VERSION_BELOW_MINIMUM');
});

test('resolve: both lanes have known-installation candidates and no pinned version', () => {
  for (const lane of resolve.LANES) {
    const spec = resolve.LANE_SPEC[lane];
    assert.ok(spec.knownInstallations({ USERPROFILE: 'C:/u', LOCALAPPDATA: 'C:/u/AppData/Local', HOME: '/home/u' }).length > 0, lane);
    assert.ok(spec.versionPattern instanceof RegExp, lane);
  }
  const src = fs.readFileSync(path.join(__dirname, 'resolve.cjs'), 'utf8');
  assert.equal(/2\.1\.220|0\.144\.5/.test(src), false, 'no observed version may be pinned in code');
});

/**
 * The shim concept is Windows-specific.
 *
 * On Windows, CreateProcess cannot run .cmd/.bat/.ps1 without a shell, so those
 * extensions are shims no matter what permission bits they carry, and an
 * extensionless file is the npm `sh` shim. On POSIX the extension carries no
 * execution meaning at all — the exec bit decides, and an executable file with
 * a .cmd name would be run through its shebang like anything else.
 *
 * These tests therefore assert the correct model for the platform they run on
 * rather than skipping: CI is ubuntu-latest while development is Windows, and a
 * test that only holds on one of them is a false green on the other.
 */
const WIN = process.platform === 'win32';

function writeExec(p, content) {
  fs.writeFileSync(p, content, { mode: 0o755 });
  return p;
}

test('resolve: shim classification follows the platform execution model', () => {
  const dir = tempDir('govv2-shim-');
  const exe = writeExec(path.join(dir, 'tool.exe'), 'MZ');
  const cmd = writeExec(path.join(dir, 'tool.cmd'), '@echo off\n');

  if (WIN) {
    for (const name of ['tool.cmd', 'tool.bat', 'tool.ps1']) {
      const p = writeExec(path.join(dir, name), '@echo off\n');
      assert.equal(resolve.isDirectlySpawnable(p), false, name + ' needs a shell');
      assert.equal(resolve.isShim(p), true, name);
    }
    assert.equal(resolve.isDirectlySpawnable(exe), true);
    const bare = writeExec(path.join(dir, 'tool'), '#!/bin/sh\n');
    assert.equal(resolve.isDirectlySpawnable(bare), false, 'extensionless is an sh shim on Windows');
    assert.equal(resolve.isShim(bare), true);
  } else {
    assert.equal(resolve.isDirectlySpawnable(cmd), true, 'exec bit is what matters on POSIX');
    assert.equal(resolve.isShim(cmd), false, 'extension carries no execution meaning');
    assert.equal(resolve.isDirectlySpawnable(exe), true);
    const notExec = path.join(dir, 'tool.noexec');
    fs.writeFileSync(notExec, 'x', { mode: 0o644 });
    assert.equal(resolve.isDirectlySpawnable(notExec), false, 'no exec bit, not spawnable');
    assert.equal(resolve.isShim(notExec), false, 'a non-executable file is neither direct nor shim');
  }
});

test('resolve: scanPath applies the platform candidate model', () => {
  const dir = tempDir('govv2-scan-');
  writeExec(path.join(dir, 'thing.cmd'), '@echo off\n');
  writeExec(path.join(dir, 'thing.exe'), 'MZ');
  const scan = resolve.scanPath('thing', { PATH: dir, PATHEXT: '.EXE;.CMD' });

  if (WIN) {
    assert.equal(scan.direct.length, 1);
    assert.ok(scan.direct[0].toUpperCase().endsWith('.EXE'));
    assert.ok(scan.shims.some((s) => s.toUpperCase().endsWith('.CMD')));
  } else {
    // PATHEXT has no meaning on POSIX, so only the bare name is a candidate.
    assert.deepEqual(scan.direct, [], 'PATHEXT must not be applied on POSIX');
    assert.deepEqual(scan.shims, []);
    writeExec(path.join(dir, 'thing'), '#!/bin/sh\nexit 0\n');
    const again = resolve.scanPath('thing', { PATH: dir });
    assert.equal(again.direct.length, 1, 'the bare name resolves once it exists');
    assert.equal(path.basename(again.direct[0]), 'thing');
  }

  // One file must never resolve into two hits. On POSIX the extension list is
  // [''], so the bare name is generated by both the ext loop and the trailing
  // extension-less candidate; a repeated PATH entry produces the same collision
  // on either platform. Only Windows exercised this list before CI ran the suite
  // on Linux, which is how the duplicate went unnoticed.
  const sep = WIN ? ';' : ':';
  const twice = resolve.scanPath('thing', { PATH: dir + sep + dir, PATHEXT: '.EXE;.CMD' });
  assert.deepEqual(
    twice.direct,
    [...new Set(twice.direct)],
    'a repeated PATH entry must not duplicate a resolution',
  );
  assert.deepEqual(twice.shims, [...new Set(twice.shims)]);
});

test('resolve: an npm shim yields its JS entry point for node-hosted launch', () => {
  const dir = tempDir('govv2-npmshim-');
  const entryDir = path.join(dir, 'node_modules', '@vendor', 'tool', 'bin');
  fs.mkdirSync(entryDir, { recursive: true });
  fs.writeFileSync(path.join(entryDir, 'tool.js'), '// entry\n');
  fs.writeFileSync(
    path.join(dir, 'tool.cmd'),
    '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@vendor\\tool\\bin\\tool.js" %*\r\n',
  );
  const entry = resolve.resolveNodeHostedEntry(path.join(dir, 'tool.cmd'));
  assert.ok(entry, 'entry must be recovered from the shim');
  assert.equal(path.basename(entry), 'tool.js');
});

test('resolve: shim-only lane reaches its entry point on either platform', () => {
  const dir = tempDir('govv2-hosted-');
  const entryDir = path.join(dir, 'node_modules', '@vendor', 'codex', 'bin');
  fs.mkdirSync(entryDir, { recursive: true });
  fs.writeFileSync(path.join(entryDir, 'codex.js'), 'process.stdout.write("codex-cli 1.2.3\\n");\n');

  if (WIN) {
    // Only a .cmd exists, so resolution must go through it to the JS entry.
    writeExec(
      path.join(dir, 'codex.cmd'),
      '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@vendor\\codex\\bin\\codex.js" %*\r\n',
    );
    const located = resolve.locate({ lane: 'CODEX_LOCAL', env: { PATH: dir, PATHEXT: '.CMD' }, knownInstallations: [] });
    assert.equal(located.resolutionSource, 'NODE_HOSTED_SHIM_RESOLUTION');
    assert.equal(located.resolvedAbsolutePath, NODE);
    assert.equal(path.basename(located.hostedEntryScript), 'codex.js');
    assert.deepEqual(located.launchPrefixArgv, [located.hostedEntryScript]);

    const m = resolve.resolveExecutor({
      lane: 'CODEX_LOCAL', env: { PATH: dir, PATHEXT: '.CMD' }, knownInstallations: [], skipSmoke: true,
    });
    assert.match(m.version, /1\.2\.3/);
    assert.equal(m.resolutionSource, 'NODE_HOSTED_SHIM_RESOLUTION');
  } else {
    // npm also writes an executable POSIX shim next to the .cmd. That one runs
    // directly, so node-hosted resolution is not needed and must not engage.
    //
    // `${0%/*}` rather than `$(dirname "$0")`: this fixture is spawned with the
    // env the test declares, which is PATH=<tempdir> and nothing else. `dirname`
    // is an external binary in /usr/bin, not a shell builtin in dash, so under
    // that PATH the substitution fails, `$0`'s directory comes out empty and the
    // entry point resolves to /node_modules/... — a fixture artifact, not a
    // resolver defect. Parameter expansion is builtin and needs no PATH.
    //
    // Worth keeping in mind for real callers: resolveExecutor passes the given
    // env straight to the child, so handing it a minimal env will break any
    // shim that shells out to coreutils. Production callers pass process.env.
    writeExec(
      path.join(dir, 'codex'),
      '#!/bin/sh\nexec "' + NODE + '" "${0%/*}/node_modules/@vendor/codex/bin/codex.js" "$@"\n',
    );
    const located = resolve.locate({ lane: 'CODEX_LOCAL', env: { PATH: dir }, knownInstallations: [] });
    assert.equal(located.resolutionSource, 'PATH_RESOLUTION');
    assert.deepEqual(located.launchPrefixArgv, [], 'no host prefix is needed for a directly-runnable shim');

    const m = resolve.resolveExecutor({
      lane: 'CODEX_LOCAL', env: { PATH: dir }, knownInstallations: [], skipSmoke: true,
    });
    assert.match(m.version, /1\.2\.3/, 'the POSIX shim still reports the CLI version');
  }
});

test('resolve: a shim that names no entry point fails closed rather than being spawned', () => {
  const dir = tempDir('govv2-badshim-');
  if (WIN) {
    // A Volta-style .cmd names no JS entry, and running it would need a shell.
    writeExec(path.join(dir, 'codex.cmd'), '@echo off\nvolta run %~n0 %*\n');
    assert.throws(
      () => resolve.locate({ lane: 'CODEX_LOCAL', env: { PATH: dir, PATHEXT: '.CMD' }, knownInstallations: [] }),
      (e) => e.code === 'ONLY_SHELL_REQUIRING_SHIM_FOUND',
    );
  } else {
    // On POSIX nothing is spawnable without the exec bit, so the same file is
    // simply not a candidate and resolution reports "not resolvable here".
    fs.writeFileSync(path.join(dir, 'codex.cmd'), '@echo off\nvolta run %~n0 %*\n', { mode: 0o644 });
    assert.equal(resolve.locate({ lane: 'CODEX_LOCAL', env: { PATH: dir }, knownInstallations: [] }), null);
    const m = resolve.resolveExecutor({ lane: 'CODEX_LOCAL', env: { PATH: dir }, knownInstallations: [] });
    assert.equal(m.state, 'UNAVAILABLE');
    assert.equal(m.unavailableReason, 'NOT_RESOLVABLE_FROM_THIS_PROCESS_ENVIRONMENT');
  }
});

// ------------------------------------------------------------ PROCESS CONTRACT

test('spawn: refuses to run an UNAVAILABLE executor', () => {
  assert.throws(
    () => spawnMod.runExecutor({ resolved: { state: 'UNAVAILABLE' }, argv: ['x'], workingDirectory: process.cwd() }),
    (e) => e.code === 'EXECUTOR_UNAVAILABLE',
  );
});

test('spawn: argv elements are passed literally — no shell interpolation', async () => {
  const hostile = '$(echo pwned) && echo pwned2 `id` ; rm -rf /';
  const r = await run(['--mode', 'dump-argv', '--payload', hostile]);
  assert.equal(r.exitCode, 0);
  const seen = JSON.parse(r.stdout.trim());
  assert.ok(seen.includes(hostile), 'hostile string must arrive as one literal argv element');
  assert.equal(r.spawnPolicy.useShellExecute, false);
  assert.equal(r.stdout.includes('pwned'), true, 'appears only as literal text');
  assert.equal(/^pwned$/m.test(r.stdout), false, 'and never as executed output');
});

test('spawn: child environment is an allowlist, not the parent environment', async () => {
  const r = await run(['--mode', 'dump-env'], {
    parentEnv: Object.assign({}, process.env, {
      GOV_SECRET_TOKEN: 'super-secret',
      RANDOM_LEAK: 'leaked',
    }),
  });
  const childEnv = JSON.parse(r.stdout.trim());
  assert.equal(childEnv.GOV_SECRET_TOKEN, undefined, 'non-allowlisted secret must not reach child');
  assert.equal(childEnv.RANDOM_LEAK, undefined);
  assert.ok(childEnv.PATH, 'PATH is constructed deterministically');
  // The platform adds a fixed floor of variables to every child regardless of
  // the env we pass (see RUNTIME_INJECTED_ENV). The property that must hold is
  // that nothing ELSE gets through — that would be a real leak.
  const leaks = spawnMod.auditChildEnv(Object.keys(childEnv), []);
  assert.deepEqual(leaks, [], 'unexpected env keys reached child: ' + leaks.join(','));
});

test('spawn: the platform env floor is exactly the measured injected set', async () => {
  // Guard against the floor changing silently under a runtime upgrade.
  const r = await run(['--mode', 'dump-env'], { parentEnv: { PATH: process.env.PATH } });
  const seen = Object.keys(JSON.parse(r.stdout.trim()));
  const unexpected = seen.filter(
    (k) => k !== 'PATH' && !spawnMod.RUNTIME_INJECTED_ENV.includes(k),
  );
  assert.deepEqual(
    unexpected,
    [],
    'runtime injected an undocumented variable: ' + unexpected.join(','),
  );
});

test('spawn: a lane credential allowlist admits exactly the named keys', async () => {
  const r = await run(['--mode', 'dump-env'], {
    parentEnv: Object.assign({}, process.env, { LANE_API_KEY: 'k', OTHER_KEY: 'o' }),
    credentialAllowlist: ['LANE_API_KEY'],
  });
  const childEnv = JSON.parse(r.stdout.trim());
  assert.equal(childEnv.LANE_API_KEY, 'k');
  assert.equal(childEnv.OTHER_KEY, undefined);
});

test('spawn: the prompt never travels through the environment', async () => {
  const prompt = 'DO-THE-TASK-XYZ';
  await assert.rejects(
    () =>
      Promise.resolve().then(() =>
        run(['--mode', 'ok'], {
          prompt,
          parentEnv: Object.assign({}, process.env, { TEMP: 'C:/x/' + prompt }),
        }),
      ),
    (e) => e.code === 'PROMPT_LEAKED_INTO_ENV',
  );
});

test('spawn: PATH is composed from configured dirs ahead of the inherited PATH', () => {
  const env = spawnMod.buildChildEnv({
    parentEnv: { PATH: '/inherited/bin' },
    configuredPathDirs: ['/configured/bin'],
  });
  const sep = process.platform === 'win32' ? ';' : ':';
  assert.equal(env.PATH.split(sep)[0], '/configured/bin');
  assert.ok(env.PATH.includes('/inherited/bin'));
});

test('spawn: additionalEnv outside the allowlist is rejected', () => {
  assert.throws(
    () => spawnMod.buildChildEnv({ parentEnv: {}, additionalEnv: { NOT_ALLOWED: '1' } }),
    (e) => e.code === 'ENV_KEY_NOT_ALLOWLISTED',
  );
});

test('spawn: working directory is pinned to the given isolated path', async () => {
  const dir = tempDir('govv2-cwd-');
  const r = await run(['--mode', 'dump-cwd'], { workingDirectory: dir });
  // The manifest records the canonical form, so evidence never carries an 8.3
  // short name that would fail a later string comparison.
  const canonical = spawnMod.canonicalDir(dir);
  assert.equal(r.workingDirectory, canonical);
  assert.equal(r.stdout.trim(), canonical);
});

test('spawn: stdout and stderr are captured separately', async () => {
  const r = await run(['--mode', 'stderr']);
  assert.equal(r.stdout.trim(), 'on-stdout');
  assert.equal(r.stderr.trim(), 'on-stderr');
});

test('spawn: stream byte caps truncate instead of growing without bound', async () => {
  const r = await run(['--mode', 'flood', '--bytes', '200000'], {
    limits: { maxStdoutBytes: 4096 },
  });
  assert.equal(r.stdoutTruncated, true);
  assert.ok(Buffer.byteLength(r.stdout, 'utf8') <= 4096);
});

test('spawn: a non-zero exit is not success', async () => {
  const r = await run(['--mode', 'fail']);
  assert.equal(r.exitCode, 7);
  assert.equal(r.executorExitSuccess, false);
  assert.equal(r.termination.reason, 'NORMAL_EXIT');
  assert.equal(r.publishable, true, 'a clean failure is still a publishable result');
});

test('spawn: STDIN_PAYLOAD delivers the prompt without an argv or env surface', async () => {
  const r = await run(['--mode', 'read-stdin'], {
    prompt: 'PROMPT-VIA-STDIN',
    promptTransport: 'STDIN_PAYLOAD',
  });
  assert.equal(r.stdout.trim(), 'stdin=PROMPT-VIA-STDIN');
  assert.equal(r.spawnPolicy.argv.includes('PROMPT-VIA-STDIN'), false);
});

test('spawn: structured result must validate before success is granted', async () => {
  const good = await run(['--mode', 'json'], {
    structuredResult: { marker: 'GOV_COORD_RESULT', validate: (v) => v && v.ok === true },
  });
  assert.equal(good.structuredResultValid, true);
  assert.equal(good.executorExitSuccess, true);
  assert.deepEqual(good.structuredResult.changed, ['a.ts']);

  const invalid = await run(['--mode', 'json-invalid'], {
    structuredResult: { marker: 'GOV_COORD_RESULT', validate: (v) => v && v.ok === true },
  });
  assert.equal(invalid.exitCode, 0);
  assert.equal(invalid.structuredResultValid, false);
  assert.equal(invalid.executorExitSuccess, false, 'exit 0 is not success without a valid result');
  assert.equal(invalid.structuredResultError, 'STRUCTURED_RESULT_INVALID');

  const broken = await run(['--mode', 'json-unparseable'], {
    structuredResult: { marker: 'GOV_COORD_RESULT', validate: () => true },
  });
  assert.equal(broken.structuredResultError, 'STRUCTURED_RESULT_UNPARSEABLE');
  assert.equal(broken.executorExitSuccess, false);
});

test('spawn: production executor timeout defaults to 30 minutes', () => {
  assert.equal(spawnMod.DEFAULTS.timeoutMs, 30 * 60 * 1000);
});

test('spawn: TIMEOUT cancels gracefully then forcibly, and is not publishable', async () => {
  const r = await run(['--mode', 'hang'], {
    limits: { timeoutMs: 1200, gracePeriodMs: 400 },
  });
  assert.equal(r.termination.reason, 'TIMEOUT');
  assert.equal(r.termination.gracefulAttempted, true);
  assert.equal(r.termination.processTreeTerminated, true);
  assert.equal(r.termination.orphanProcessDetected, false);
  assert.equal(r.executorExitSuccess, false);
  assert.equal(r.publishable, false, 'a cancelled attempt must not publish a result');
});

test('spawn: OWNER_CANCELLATION uses the same primitive as timeout', async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 600);
  const r = await run(['--mode', 'hang'], {
    limits: { timeoutMs: 60000, gracePeriodMs: 400 },
    cancellationSignal: ac.signal,
  });
  assert.equal(r.termination.reason, 'OWNER_CANCELLATION');
  assert.equal(r.termination.processTreeTerminated, true);
  assert.equal(r.publishable, false);
});

test('T3 GATE: lease-epoch loss freezes mutation and terminates the process tree', async () => {
  let calls = 0;
  const r = await run(['--mode', 'spawn-child-hang'], {
    limits: { timeoutMs: 60000, gracePeriodMs: 500, leaseCheckIntervalMs: 300 },
    leaseCheck: () => {
      calls += 1;
      if (calls >= 2) {
        const e = new Error('epoch drift');
        e.code = 'FENCING_FAILURE';
        throw e;
      }
    },
  });
  assert.equal(r.termination.reason, 'LEASE_EPOCH_LOSS');
  assert.equal(r.termination.leaseLossDetail, 'FENCING_FAILURE');
  assert.equal(r.termination.processTreeTerminated, true);
  assert.equal(r.termination.orphanProcessDetected, false, 'no surviving process after tree kill');
  assert.equal(r.executorExitSuccess, false);
  assert.equal(
    r.publishable,
    false,
    'a stale attempt result must never be publishable (contract §7.6)',
  );
});

test('spawn: descendantPids finds a child that escaped into its own group', async () => {
  if (WIN) {
    // Windows delegates to `taskkill /T`, which walks the tree itself, so this
    // enumeration is only exercised on POSIX.
    assert.equal(typeof spawnMod.descendantPids, 'function');
    return;
  }
  const child = require('child_process').spawn(
    process.execPath,
    [FAKE, '--mode', 'spawn-child-hang'],
    { detached: true, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  try {
    const grandchildPid = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('fixture never reported a grandchild')), 10000);
      child.stdout.on('data', (d) => {
        buf += d;
        const m = /grandchild=(\d+)/.exec(buf);
        if (m) {
          clearTimeout(t);
          res(Number(m[1]));
        }
      });
    });
    // The grandchild detaches into its own process group, so kill(-childPid)
    // cannot reach it. Walking parent-child links must still find it.
    const found = spawnMod.descendantPids(child.pid);
    assert.ok(
      found.includes(grandchildPid),
      'grandchild ' + grandchildPid + ' not enumerated; got ' + found.join(','),
    );
  } finally {
    spawnMod.killProcessTree(child.pid, true);
  }
});

test('T3 GATE: a whole process tree is terminated, not just the direct child', async () => {
  const r = await run(['--mode', 'spawn-child-hang'], {
    limits: { timeoutMs: 1200, gracePeriodMs: 500 },
  });
  const m = /grandchild=(\d+)/.exec(r.stdout);
  assert.ok(m, 'fixture must report its grandchild pid, got: ' + JSON.stringify(r.stdout));
  const grandchildPid = Number(m[1]);
  // Give the OS a moment to reap the tree before asserting.
  await new Promise((res) => setTimeout(res, 1500));
  assert.equal(
    spawnMod.processAlive(grandchildPid),
    false,
    'grandchild ' + grandchildPid + ' survived the tree kill',
  );
});

test('spawn: extractJson honours a marker and refuses to guess otherwise', () => {
  assert.deepEqual(JSON.parse(spawnMod.extractJson('noise\nMARK {"a":1}\n', 'MARK')), { a: 1 });
  assert.throws(() => spawnMod.extractJson('no json here', 'MARK'));
  assert.throws(() => spawnMod.extractJson('no json here'));
});

test('spawn: manifest records the full attempt evidence required by §7.1', async () => {
  const r = await run(['--mode', 'ok']);
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.resolvedAbsolutePath, NODE);
  assert.ok(r.version);
  assert.ok(Array.isArray(r.environmentAllowlist) && r.environmentAllowlist.length > 0);
  assert.ok(spawnMod.TERMINATION_REASONS.includes(r.termination.reason));
  assert.equal(typeof r.durationMs, 'number');
});
