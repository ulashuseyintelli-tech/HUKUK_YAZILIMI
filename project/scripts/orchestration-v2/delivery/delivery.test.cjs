'use strict';
/**
 * Tests for the delivery verifier.
 *
 * A verifier is a strange thing to test, because the usual failure — "it says
 * PASS and the system is broken" — is exactly the failure it exists to prevent
 * elsewhere. So these tests are weighted towards the verifier being WRONG in the
 * optimistic direction: a capability that quietly disappears from the panel, a
 * probe that agrees with whatever it finds, evidence that survives being taken
 * at the wrong commit.
 *
 * DV20 is the one that matters most. It runs all four real probes against the
 * real repository and asserts the discrimination: three capabilities that are
 * genuinely wired must be observed as wired, and the one that is genuinely not
 * must be observed as UNWIRED. A verifier that cannot tell those apart is
 * decoration, and the only way to know it can is to make it do so.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const manifestMod = require('./manifest.cjs');
const commandMod = require('./command.cjs');
const evidenceMod = require('./evidence.cjs');
const execMod = require('./exec.cjs');
const probesMod = require('./probes.cjs');
const renderMod = require('./render.cjs');
const verifyMod = require('./verify-live.cjs');
const fixtures = require('./fixtures.cjs');

const CLI = path.join(__dirname, 'verify-live.cjs');
const REPO_ROOT = fixtures.REPO_ROOT;

const tmps = [];
function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-dv-'));
  tmps.push(d);
  return d;
}
test.after(() => {
  for (const d of tmps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e) {
      /* a temp dir that will not delete is not a test failure */
    }
  }
  fixtures.cleanup();
});

function baseCapability(over) {
  return Object.assign(
    {
      capabilityId: 'TEST_CAP',
      title: 'test',
      deliveryClass: 'OPERATOR_CLI',
      targetState: 'OPERABLE',
      probeId: 'TEST_PROBE',
      probeClass: 'PROBE_DRY',
      publicEntrypoint: 'node something.cjs',
      contract: { publicEntrypointOnly: true, nonDestructivePulse: true, postMergeRequired: true, timeoutMs: 5000 },
    },
    over || {},
  );
}

// ───────────────────────────────────────────────────────── MANIFEST (DV01–DV07)

test('DV01  the shipped manifest is valid and every capability has a real probe', () => {
  const r = manifestMod.validateManifest();
  assert.equal(r.ok, true);
  assert.ok(r.count >= 4, 'the pilot declares four capabilities');
  for (const cap of manifestMod.CAPABILITIES) {
    const probe = probesMod.PROBES[cap.probeId];
    // A manifest entry naming a probe that does not exist is the manifest
    // lying about what is checked — the exact failure mode being guarded.
    assert.ok(probe, cap.capabilityId + ' names probe ' + cap.probeId + ' which does not exist');
    const v = manifestMod.validateProbeDefinition(cap, probe);
    assert.match(v.probeDefinitionSha256, /^[0-9a-f]{64}$/);
  }
});

test('DV02  a duplicate capability id is refused', () => {
  const dup = [baseCapability(), baseCapability()];
  assert.throws(() => manifestMod.validateManifest(dup), (e) => e.code === 'CAPABILITY_ID_DUPLICATE');
});

test('DV03  an unknown target state is refused', () => {
  assert.throws(
    () => manifestMod.validateManifest([baseCapability({ targetState: 'ON' })]),
    (e) => e.code === 'TARGET_STATE_UNKNOWN',
  );
});

test('DV04  a capability that opts out of public-entrypoint-only is refused', () => {
  const cap = baseCapability();
  cap.contract.publicEntrypointOnly = false;
  assert.throws(() => manifestMod.validateManifest([cap]), (e) => e.code === 'PUBLIC_ENTRYPOINT_ONLY_REQUIRED');
});

test('DV05  an empty manifest verifies nothing and is refused', () => {
  assert.throws(() => manifestMod.validateManifest([]), (e) => e.code === 'MANIFEST_EMPTY');
});

test('DV06  a capability absent from the manifest is an error, never an empty result', () => {
  assert.throws(() => manifestMod.capability('NO_SUCH_CAPABILITY'), (e) => e.code === 'CAPABILITY_NOT_IN_MANIFEST');
});

test('DV07  a probe whose declared identity disagrees with the manifest is refused', () => {
  const cap = baseCapability();
  assert.throws(
    () => manifestMod.validateProbeDefinition(cap, { probeId: 'OTHER', probeClass: 'PROBE_DRY', run: () => {}, definition: {} }),
    (e) => e.code === 'PROBE_ID_MISMATCH',
  );
  assert.throws(
    () => manifestMod.validateProbeDefinition(cap, { probeId: 'TEST_PROBE', probeClass: 'PROBE_SEALED', run: () => {}, definition: {} }),
    (e) => e.code === 'PROBE_CLASS_MISMATCH',
  );
  assert.throws(() => manifestMod.validateProbeDefinition(cap, null), (e) => e.code === 'DELIVERY_PROBE_MISSING');
  assert.throws(
    () => manifestMod.validateProbeDefinition(cap, { probeId: 'TEST_PROBE', probeClass: 'PROBE_DRY', run: () => {} }),
    (e) => e.code === 'PROBE_DEFINITION_MISSING',
  );
});

// ───────────────────────────────────────────────────────── VERDICTS (DV08–DV11)

test('DV08  the verdict is the comparison of target and observed, nothing else', () => {
  assert.equal(evidenceMod.verdictFor('OPERABLE', 'OPERABLE', true), 'PASS');
  assert.equal(evidenceMod.verdictFor('ENFORCED', 'ENFORCED', true), 'PASS');
  assert.equal(evidenceMod.verdictFor('WIRED_DISABLED', 'WIRED_DISABLED', true), 'PASS');
  assert.equal(evidenceMod.verdictFor('ENFORCED', 'UNWIRED', true), 'FAIL');
  assert.equal(evidenceMod.verdictFor('OPERABLE', 'FAILED', true), 'FAIL');
});

test('DV09  UNWIRED is never treated as a deliberate disable', () => {
  // The single most important line in this file. If this ever passes, the
  // distinction the whole package exists to draw has been erased.
  assert.equal(evidenceMod.verdictFor('WIRED_DISABLED', 'UNWIRED', true), 'FAIL');
  assert.notEqual(evidenceMod.verdictFor('WIRED_DISABLED', 'UNWIRED', true), 'PASS');
});

test('DV10  a probe that never ran is a failure, not an absence', () => {
  assert.equal(evidenceMod.verdictFor('OPERABLE', 'NOT_RUN', true), 'FAIL');
});

test('DV11  evidence taken at another commit or with a dirty tree is STALE', () => {
  assert.equal(evidenceMod.verdictFor('OPERABLE', 'OPERABLE', false), 'STALE');
  assert.equal(evidenceMod.verdictFor('OPERABLE', 'STALE', true), 'STALE');
});

// ───────────────────────────────────────────────────────── EVIDENCE (DV12–DV16)

test('DV12  an evidence record carries every field DONE will be judged on', () => {
  const cap = manifestMod.CAPABILITIES[0];
  const probe = probesMod.PROBES[cap.probeId];
  const rec = evidenceMod.build({
    capability: cap,
    probe,
    result: { observedState: 'OPERABLE', failureCode: null, detail: 'ok', steps: [] },
    repoState: { verifiedAtSha: 'a'.repeat(40), sourceBranch: 'main', dirtyTree: false },
    startedAt: '2026-07-28T00:00:00.000Z',
    finishedAt: '2026-07-28T00:00:10.000Z',
  });
  for (const field of [
    'capabilityId',
    'probeId',
    'deliveryContractSha256',
    'probeDefinitionSha256',
    'targetState',
    'observedState',
    'verdict',
    'verifiedAtSha',
    'expectedMergeSha',
    'sourceBranch',
    'startedAt',
    'finishedAt',
    'durationMs',
    'evidenceDigest',
    'dirtyTree',
    'failureCode',
    'detail',
  ]) {
    assert.ok(field in rec, 'evidence record is missing ' + field);
  }
  assert.equal(rec.verdict, 'PASS');
  assert.equal(rec.durationMs, 10000);
  assert.match(rec.evidenceDigest, /^[0-9a-f]{64}$/);
});

test('DV13  a dirty tree makes the record STALE regardless of what the probe saw', () => {
  const cap = manifestMod.CAPABILITIES[0];
  const rec = evidenceMod.build({
    capability: cap,
    probe: probesMod.PROBES[cap.probeId],
    result: { observedState: 'OPERABLE', failureCode: null, detail: null, steps: [] },
    repoState: { verifiedAtSha: 'a'.repeat(40), sourceBranch: 'wip', dirtyTree: true },
    startedAt: '2026-07-28T00:00:00.000Z',
    finishedAt: '2026-07-28T00:00:01.000Z',
  });
  assert.equal(rec.verdict, 'STALE');
  assert.equal(rec.dirtyTree, true);
});

test('DV14  evidence without a resolvable commit cannot be built', () => {
  const cap = manifestMod.CAPABILITIES[0];
  assert.throws(
    () =>
      evidenceMod.build({
        capability: cap,
        probe: probesMod.PROBES[cap.probeId],
        result: { observedState: 'OPERABLE', steps: [] },
        repoState: { verifiedAtSha: null, dirtyTree: false },
        startedAt: 'x',
        finishedAt: 'y',
      }),
    (e) => e.code === 'EVIDENCE_SHA_MISSING',
  );
});

test('DV15  stored evidence from another SHA is not current', () => {
  const panel = { verifiedAtSha: 'a'.repeat(40), dirtyTree: false, capabilities: [] };
  assert.equal(evidenceMod.isCurrent(panel, { verifiedAtSha: 'b'.repeat(40), dirtyTree: false }).reason, 'DELIVERY_SHA_MISMATCH');
  assert.equal(evidenceMod.isCurrent(null, { verifiedAtSha: 'a'.repeat(40) }).reason, 'EVIDENCE_NOT_RUN');
  assert.equal(evidenceMod.isCurrent(panel, { verifiedAtSha: 'a'.repeat(40), dirtyTree: false }).current, true);
});

test('DV16  evidence produced by a probe that has since changed is not current', () => {
  // This is what makes red-then-green mean anything: if the probe were quietly
  // weakened between the two runs, the green would be measuring a different
  // question and nothing would say so.
  const panel = {
    verifiedAtSha: 'a'.repeat(40),
    dirtyTree: false,
    capabilities: [{ capabilityId: 'X', probeDefinitionSha256: 'c'.repeat(64) }],
  };
  const r = evidenceMod.isCurrent(panel, { verifiedAtSha: 'a'.repeat(40), dirtyTree: false }, { X: 'd'.repeat(64) });
  assert.equal(r.current, false);
  assert.equal(r.reason, 'DELIVERY_PROBE_DEFINITION_CHANGED');
});

// ───────────────────────────────────────────────────────── SAFETY (DV17–DV19)

test('DV17  a probe command must be an argv array and is never shell-interpreted', async () => {
  await assert.rejects(() => execMod.run({ argv: 'echo hi', cwd: os.tmpdir(), timeoutMs: 1000 }), (e) => e.code === 'PROBE_ARGV_REQUIRED');
  await assert.rejects(
    () => execMod.run({ argv: [process.execPath, 42], cwd: os.tmpdir(), timeoutMs: 1000 }),
    (e) => e.code === 'PROBE_ARGV_NOT_STRINGS',
  );
});

test('DV18  the probe environment is built from an allowlist and refuses credential names', () => {
  const env = execMod.buildEnv({});
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  // A probe that could authenticate is not sealed.
  assert.throws(() => execMod.buildEnv({ GITHUB_TOKEN: 'x' }), (e) => e.code === 'PROBE_ENV_FORBIDDEN_NAME');
  assert.throws(() => execMod.buildEnv({ MY_SECRET: 'x' }), (e) => e.code === 'PROBE_ENV_FORBIDDEN_NAME');
  for (const k of Object.keys(env)) {
    assert.ok(
      execMod.ENV_FORBIDDEN_SUBSTRINGS.every((f) => k.toUpperCase().indexOf(f) === -1) || k.indexOf('GIT_') === 0,
      'a forbidden name reached the probe environment: ' + k,
    );
  }
});

test('DV19  fixture writes cannot escape the fixture, and output is redacted', () => {
  const root = tmpdir();
  assert.throws(() => execMod.assertContained(path.join(root, '..', 'escape.txt'), root), (e) => e.code === 'PROBE_PATH_ESCAPES_FIXTURE');
  assert.ok(execMod.assertContained(path.join(root, 'inside', 'ok.txt'), root));

  const dirty = 'token ghp_' + 'A'.repeat(36) + ' and postgres://u:p@h/db';
  const clean = execMod.sanitize(dirty);
  assert.equal(clean.indexOf('ghp_'), -1);
  assert.equal(clean.indexOf('postgres://'), -1);
  // A git SHA must survive: it is evidence, and redacting it would destroy the
  // one field DONE is judged on.
  assert.equal(execMod.sanitize('a'.repeat(40)), 'a'.repeat(40));
});

// ───────────────────────────────────── THE DISCRIMINATION (DV20) — the point

test('DV20  the real probes tell a wired capability from an unwired one', { timeout: 900000 }, async () => {
  // Every probe, against the real repository, through the real entrypoints.
  //
  // Asserted on observedState rather than verdict, deliberately: a developer
  // running this with uncommitted changes gets STALE verdicts, and the property
  // under test is what the probes SAW, which a dirty tree does not change.
  const panel = await verifyMod.verify({ mode: 'sealed', repo: REPO_ROOT });
  const by = {};
  for (const r of panel.capabilities) by[r.capabilityId] = r;

  assert.equal(by.GOV_COORD_V2_RUNNER_AUTHORITY.observedState, 'OPERABLE', by.GOV_COORD_V2_RUNNER_AUTHORITY.detail);
  assert.equal(by.GOV_COORD_V2_REQUEST_EXECUTOR_PATH.observedState, 'OPERABLE', by.GOV_COORD_V2_REQUEST_EXECUTOR_PATH.detail);
  assert.equal(by.MECHANICAL_GOVERNANCE_GATE.observedState, 'ENFORCED', by.MECHANICAL_GOVERNANCE_GATE.detail);

  // The capability that was RED at WP01 and is repaired here.
  //
  // The assertion moved from UNWIRED to ENFORCED because the SYSTEM changed, not
  // the probe's standard: the probe now performs a real merge against a local
  // remote and refuses in six ways before it will do so, which is a strictly
  // harder question than "does a finalize command exist?". WP01's RED evidence
  // is preserved unchanged as the record of what was true before.
  const closure = by.GOV_COORD_V2_POST_MERGE_DELIVERY_CLOSURE;
  assert.equal(closure.observedState, 'ENFORCED', closure.detail);
  assert.equal(closure.failureCode, null);

  // Every capability must match its declared target. Asserted per-capability
  // rather than only on the summary so a regression names itself.
  for (const r of panel.capabilities) {
    assert.equal(r.observedState, r.targetState, r.capabilityId + ': ' + (r.detail || ''));
  }
});

// ───────────────────────────────────────────────────────── THE CLI (DV21–DV25)

function cli(args) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    timeout: 900000,
    windowsHide: true,
  });
}

test('DV21  an unknown mode and an unknown capability are verifier errors, not failures', () => {
  const mode = cli(['--mode', 'whatever']);
  assert.equal(mode.status, verifyMod.EXIT_VERIFIER_ERROR);
  assert.match(mode.stderr, /MODE_UNKNOWN/);

  const cap = cli(['--capability', 'NO_SUCH_THING', '--mode', 'pulse']);
  assert.equal(cap.status, verifyMod.EXIT_VERIFIER_ERROR);
  assert.match(cap.stderr, /CAPABILITY_NOT_IN_MANIFEST/);

  const arg = cli(['--nonsense']);
  assert.equal(arg.status, verifyMod.EXIT_VERIFIER_ERROR);
});

test('DV22  a sealed capability cannot be smuggled into pulse mode', () => {
  // Otherwise "verify:live --mode pulse" in CI would silently skip every
  // capability whose probe actually touches the system.
  const r = cli(['--capability', 'MECHANICAL_GOVERNANCE_GATE', '--mode', 'pulse']);
  assert.equal(r.status, verifyMod.EXIT_VERIFIER_ERROR);
  assert.match(r.stderr, /CAPABILITY_NOT_IN_MODE/);
});

// DV23/DV24 use the DRY capability deliberately.
//
// Their subject is the panel's SHAPE and its persistence, not any particular
// capability. Pointing them at the closure probe made each one build seven
// disposable git repositories with bare remotes, and under the parallel load of
// the full suite that was slow enough to flake — a test that fails for load
// reasons teaches nobody anything and eventually gets ignored. DV20 remains the
// one that exercises all four probes for real.
test('DV23  --json emits the panel as data with the fields a machine needs', { timeout: 600000 }, () => {
  const r = cli(['--capability', 'GOV_COORD_V2_RUNNER_AUTHORITY', '--mode', 'pulse', '--json']);
  const panel = JSON.parse(r.stdout);
  assert.equal(panel.capabilities.length, 1);
  const rec = panel.capabilities[0];
  assert.equal(rec.observedState, 'OPERABLE', rec.detail);
  assert.match(panel.evidenceDigest, /^[0-9a-f]{64}$/);
  assert.match(rec.probeDefinitionSha256, /^[0-9a-f]{64}$/);
  assert.match(rec.deliveryContractSha256, /^[0-9a-f]{64}$/);

  // The exit code is the contract, and it follows the verdict rather than the
  // observation: on a clean tree this is PASS and exit 0; run from a working
  // tree with edits in it the verdict is STALE and exit 1, because evidence
  // taken with uncommitted changes is not evidence for this SHA.
  const expected = rec.verdict === 'PASS' ? verifyMod.EXIT_OK : verifyMod.EXIT_NOT_DELIVERED;
  assert.equal(r.status, expected, 'verdict ' + rec.verdict + ' must map to exit ' + expected);
  assert.equal(panel.overall, rec.verdict === 'PASS' ? 'PASS' : 'FAIL');
});

test('DV24  --evidence-dir persists a panel bound to the SHA it was taken at', { timeout: 600000 }, () => {
  const dir = tmpdir();
  const r = cli(['--capability', 'GOV_COORD_V2_RUNNER_AUTHORITY', '--mode', 'pulse', '--evidence-dir', dir]);
  // Either exit is legitimate and which one is not this test's subject: on a
  // clean tree the capability passes (0), and from a working tree with edits in
  // it the verdict is STALE (1). What IS the subject is that a record was
  // written and that it names the commit it was taken at.
  assert.ok(
    r.status === verifyMod.EXIT_OK || r.status === verifyMod.EXIT_NOT_DELIVERED,
    'a verifier error (2) means no evidence was produced: ' + r.stderr.slice(0, 200),
  );
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  const panel = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  assert.match(panel.verifiedAtSha, /^[0-9a-f]{40}$/);
  assert.ok(files[0].indexOf(panel.verifiedAtSha.slice(0, 12)) !== -1, 'the filename must name the commit');
});

test('DV25  the panel prints every selected capability, green ones included', () => {
  const panel = {
    mode: 'sealed',
    verifiedAtSha: 'a'.repeat(40),
    sourceBranch: 'main',
    dirtyTree: false,
    counts: { PASS: 3, FAIL: 1 },
    overall: 'FAIL',
    evidenceDigest: 'd'.repeat(64),
    capabilities: [
      { capabilityId: 'ONE', deliveryClass: 'OPERATOR_CLI', targetState: 'OPERABLE', observedState: 'OPERABLE', verdict: 'PASS', probeClass: 'PROBE_DRY', verifiedAtSha: 'a'.repeat(40), steps: [] },
      { capabilityId: 'TWO', deliveryClass: 'SERVICE_FINALIZATION', targetState: 'ENFORCED', observedState: 'UNWIRED', verdict: 'FAIL', probeClass: 'PROBE_SEALED', verifiedAtSha: 'a'.repeat(40), failureCode: 'DELIVERY_PROBE_MISSING', detail: 'no finalize command', steps: [] },
    ],
  };
  const text = renderMod.panel(panel);
  // Hiding the green lines would make "capability absent from the manifest"
  // invisible, which is one of the failures being guarded against.
  assert.match(text, /ONE/);
  assert.match(text, /TWO/);
  assert.match(text, /NOT DELIVERED/);
  assert.match(text, /DELIVERY_PROBE_MISSING/);
  assert.match(text, /OVERALL: FAIL/);
});

// ───────────────────────────────────── COMMAND DIGEST (DV30–DV34)

const CMD_CTX = { repoRoot: 'C:/repo', fixtureRoot: 'C:/tmp/fx-123' };
function cmdDef(over) {
  return Object.assign(
    {
      probeId: 'P1',
      mode: 'sealed',
      commands: [
        { argv: [process.execPath, 'C:/repo/a.cjs', '--x', 'C:/tmp/fx-123/plan.json'], cwd: 'C:/tmp/fx-123', timeoutMs: 60000 },
        { argv: [process.execPath, 'C:/repo/b.cjs'], cwd: 'C:/tmp/fx-123', timeoutMs: 60000 },
      ],
    },
    over || {},
  );
}
const cmdDigest = (d) => commandMod.commandDigest(d, CMD_CTX);

test('DV30  every part of an invocation that changes its meaning changes the digest', () => {
  const base = cmdDigest(cmdDef());
  const clone = () => JSON.parse(JSON.stringify(cmdDef()));

  const argvOrder = clone();
  argvOrder.commands[0].argv = [process.execPath, 'C:/repo/a.cjs', 'C:/tmp/fx-123/plan.json', '--x'];
  assert.notEqual(cmdDigest(argvOrder), base, 'argument order');

  const cmdOrder = clone();
  cmdOrder.commands.reverse();
  assert.notEqual(cmdDigest(cmdOrder), base, 'command order');

  const cwd = clone();
  cwd.commands[0].cwd = 'C:/repo';
  assert.notEqual(cmdDigest(cwd), base, 'cwd');

  const timeout = clone();
  timeout.commands[0].timeoutMs = 61000;
  assert.notEqual(cmdDigest(timeout), base, 'timeout');

  assert.notEqual(cmdDigest(cmdDef({ mode: 'pulse' })), base, 'probe mode');
  assert.notEqual(cmdDigest(cmdDef({ probeId: 'P2' })), base, 'probe id');

  // A run that could reach the network is making a weaker claim with the same
  // argv, and the digest has to notice.
  const policy = clone();
  policy.commands[0].executionPolicy = { networkExpected: true };
  assert.notEqual(cmdDigest(policy), base, 'execution policy');
});

test('DV31  the digest is stable across platforms and across fixtures', () => {
  const base = cmdDigest(cmdDef());

  // The same invocation expressed with POSIX paths must produce the same
  // digest, or the field could never be compared between a developer's machine
  // and CI.
  const posix = {
    probeId: 'P1',
    mode: 'sealed',
    commands: [
      { argv: [process.execPath, '/repo/a.cjs', '--x', '/tmp/fx-123/plan.json'], cwd: '/tmp/fx-123', timeoutMs: 60000 },
      { argv: [process.execPath, '/repo/b.cjs'], cwd: '/tmp/fx-123', timeoutMs: 60000 },
    ],
  };
  assert.equal(commandMod.commandDigest(posix, { repoRoot: '/repo', fixtureRoot: '/tmp/fx-123' }), base);

  // Every sealed probe runs in a fresh mkdtemp directory. If that path reached
  // the digest, the field would differ on every run and prove nothing.
  const other = JSON.parse(JSON.stringify(cmdDef()));
  other.commands[0].argv[3] = 'C:/tmp/fx-999/plan.json';
  other.commands[0].cwd = 'C:/tmp/fx-999';
  other.commands[1].cwd = 'C:/tmp/fx-999';
  assert.equal(commandMod.commandDigest(other, { repoRoot: 'C:/repo', fixtureRoot: 'C:/tmp/fx-999' }), base);
});

test('DV32  a command definition that cannot be trusted fails closed', () => {
  const bad = (cmd, code) =>
    assert.throws(() => commandMod.normalizeCommand(cmd, CMD_CTX), (e) => e.code === code, code);

  // The single most dangerous shape here: a shell string is not a command
  // definition, it is an invitation to re-split on whitespace.
  bad({ argv: 'echo hi', timeoutMs: 5000 }, 'COMMAND_ARGV_INVALID');
  bad({ argv: [], timeoutMs: 5000 }, 'COMMAND_ARGV_INVALID');
  bad({ argv: [process.execPath, 42], timeoutMs: 5000 }, 'COMMAND_ARGV_INVALID');
  bad({ argv: ['x'], timeoutMs: 10 }, 'COMMAND_TIMEOUT_INVALID');
  bad({ argv: ['x'] }, 'COMMAND_TIMEOUT_INVALID');
  bad({ argv: ['x'], timeoutMs: 5000, cwd: 7 }, 'COMMAND_CWD_INVALID');
  bad({ argv: ['x'], timeoutMs: 5000, executionPolicy: { shell: true } }, 'COMMAND_DEFINITION_INVALID');
  assert.throws(
    () => commandMod.normalizeCommandDefinition({ probeId: 'p', mode: 'm', commands: [] }, CMD_CTX),
    (e) => e.code === 'COMMAND_DEFINITION_INVALID',
  );
});

test('DV33  a recorder digests what ran, not what was declared', () => {
  const rec = commandMod.createRecorder('P1', 'sealed', CMD_CTX);
  // A probe that ran nothing has no invocation to digest, and a digest of an
  // empty list would make "it ran" and "it did not" agree.
  assert.equal(rec.digest(), null);
  assert.equal(rec.count, 0);

  rec.record([process.execPath, 'C:/repo/a.cjs'], 'C:/tmp/fx-123', 60000);
  const one = rec.digest();
  assert.match(one, /^[0-9a-f]{64}$/);
  assert.equal(rec.count, 1);

  rec.record([process.execPath, 'C:/repo/b.cjs'], 'C:/tmp/fx-123', 60000);
  assert.notEqual(rec.digest(), one, 'a second command must change the digest');
  assert.equal(rec.count, 2);
});

test('DV34  real probes record a real invocation, and no secret enters it', { timeout: 600000 }, async () => {
  const panel = await verifyMod.verify({ mode: 'pulse', repo: REPO_ROOT });
  const rec = panel.capabilities[0];
  assert.match(rec.commandDigest, /^[0-9a-f]{64}$/, 'a probe that ran must carry a command digest');
  assert.ok(rec.commandCount >= 1);

  // The canonical form must contain no machine-specific absolute path and no
  // environment value. Asserted on the normalized shape rather than trusting
  // the redactor, because the redactor is the second line of defence.
  const def = commandMod.normalizeCommandDefinition(
    { probeId: 'P', mode: 'pulse', commands: [{ argv: [process.execPath, 'C:/Users/someone/secret-token-dir/x.cjs'], cwd: 'C:/Users/someone', timeoutMs: 5000 }] },
    { repoRoot: REPO_ROOT },
  );
  assert.equal(def.commands[0].argv[0], '<node>');
  assert.equal(def.commands[0].argv[1], commandMod.VARIABLE, 'an unrecognised absolute path must not enter the digest');
  assert.equal(def.commands[0].cwd, commandMod.VARIABLE);
});

// ─────────────────────────────────────────── PUBLIC ENTRYPOINT BINDING (DV26)

test('DV26  the probes call the same files the package scripts expose', () => {
  // A probe that drifts from the published script is a probe measuring
  // something an operator cannot reach. The binding is checked mechanically
  // rather than trusted, because the drift is invisible in review.
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'project', 'package.json'), 'utf8'));
  const rel = (abs) => path.relative(path.join(REPO_ROOT, 'project'), abs).split(path.sep).join('/');

  assert.ok(pkg.scripts['verify:live'], 'package.json must expose verify:live');
  assert.ok(pkg.scripts['verify:live'].indexOf(rel(CLI)) !== -1, 'verify:live must run the CLI these tests exercise');
  assert.ok(
    pkg.scripts['orch:run'].indexOf(rel(probesMod.RUN_TASK_CLI)) !== -1,
    'the authority probe must call the file orch:run runs',
  );
  assert.ok(
    pkg.scripts['orch:service'].indexOf(rel(probesMod.ORCH_SERVICE_CLI)) !== -1,
    'the service probes must call the file orch:service runs',
  );
});

// ─────────────────────────────────────────────── FIXTURE HONESTY (DV27–DV28)

test('DV27  the authority fixture is a real repository with a real origin/main', () => {
  const w = fixtures.authorityWorld();
  const originMain = fixtures.git(['rev-parse', 'refs/remotes/origin/main'], w.root);
  assert.equal(originMain, w.baseSha);
  assert.match(w.baseSha, /^[0-9a-f]{40}$/);
  // The grant's ratification must genuinely be readable at the commit it names,
  // or the positive case would be passing for the wrong reason.
  const shown = fixtures.git(['show', w.baseSha + ':project/docs/governance/decision-log.md'], w.root);
  assert.ok(shown.indexOf(w.grant.ownerRatificationEvidence.exactExcerpt) !== -1);
});

test('DV28  the service fixture carries the REAL manifest and standing grants', () => {
  const w = fixtures.serviceWorld();
  const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, fixtures.MANIFEST_REL), 'utf8'));
  const copied = JSON.parse(fs.readFileSync(path.join(w.root, fixtures.MANIFEST_REL), 'utf8'));
  // A probe against invented authority proves the probe works, not the system.
  assert.deepEqual(copied.eligibilityDerivedFrom, real.eligibilityDerivedFrom);
  assert.ok(fs.existsSync(path.join(w.root, fixtures.OFFICE_GRANT)));
  assert.ok(fs.existsSync(path.join(w.root, fixtures.GOV_GRANT)));
});
