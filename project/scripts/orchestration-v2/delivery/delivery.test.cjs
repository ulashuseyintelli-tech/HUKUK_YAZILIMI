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

  // The red. WP02 replaces this assertion with ENFORCED; until it does, a green
  // panel here would mean the probe stopped asking the question.
  const closure = by.GOV_COORD_V2_POST_MERGE_DELIVERY_CLOSURE;
  assert.equal(closure.observedState, 'UNWIRED', closure.detail);
  assert.equal(closure.failureCode, 'DELIVERY_PROBE_MISSING');
  assert.equal(closure.verdict === 'PASS', false, 'an unwired capability must never report PASS');

  // And the panel as a whole must refuse to call this delivered.
  assert.equal(panel.overall, 'FAIL');
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

test('DV23  --json emits the panel as data with the fields a machine needs', { timeout: 600000 }, () => {
  const r = cli(['--capability', 'GOV_COORD_V2_POST_MERGE_DELIVERY_CLOSURE', '--mode', 'sealed', '--json']);
  const panel = JSON.parse(r.stdout);
  assert.equal(panel.capabilities.length, 1);
  assert.equal(panel.capabilities[0].observedState, 'UNWIRED');
  assert.equal(panel.overall, 'FAIL');
  assert.match(panel.evidenceDigest, /^[0-9a-f]{64}$/);
  // Exit 1 = not delivered. Not 0, and not 2.
  assert.equal(r.status, verifyMod.EXIT_NOT_DELIVERED);
});

test('DV24  --evidence-dir persists a panel bound to the SHA it was taken at', { timeout: 600000 }, () => {
  const dir = tmpdir();
  const r = cli(['--capability', 'GOV_COORD_V2_POST_MERGE_DELIVERY_CLOSURE', '--mode', 'sealed', '--evidence-dir', dir]);
  assert.equal(r.status, verifyMod.EXIT_NOT_DELIVERED);
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
