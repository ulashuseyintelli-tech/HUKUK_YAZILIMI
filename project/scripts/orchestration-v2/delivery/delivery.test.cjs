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
    // A real run always has one, and the contract requires it: a capability
    // proved by running something cannot be proved by running nothing.
    commandDigest: 'f'.repeat(64),
    commandCount: 3,
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
  assert.equal(rec.schemaVersion, 2);

  // A run that DECLARES itself post-merge and then verifies a different commit
  // has not verified the merge — however green the probe was. This is the
  // difference between "this worked somewhere" and "this works in what was
  // merged", and it is the whole of the DONE formula's SHA clause.
  const postMerge = (expected) =>
    evidenceMod.build({
      capability: cap,
      probe,
      result: { observedState: 'OPERABLE', failureCode: null, detail: null, steps: [] },
      repoState: { verifiedAtSha: 'a'.repeat(40), sourceBranch: 'main', dirtyTree: false },
      startedAt: '2026-07-28T00:00:00.000Z',
      finishedAt: '2026-07-28T00:00:01.000Z',
      commandDigest: 'f'.repeat(64),
      postMergeRun: true,
      expectedMergeSha: expected,
    });
  assert.equal(postMerge('a'.repeat(40)).verdict, 'PASS', 'verified AT the merge sha');
  const wrong = postMerge('b'.repeat(40));
  assert.equal(wrong.verdict, 'STALE');
  assert.equal(wrong.failureCode, 'DELIVERY_SHA_MISMATCH');
  const missing = postMerge(null);
  assert.equal(missing.verdict, 'FAIL');
  assert.equal(missing.failureCode, 'DELIVERY_EXPECTED_MERGE_SHA_MISSING');

  // A branch-head run makes no post-merge claim, so it may be green — and its
  // null expectedMergeSha is exactly what stops it satisfying DONE.
  assert.equal(rec.expectedMergeSha, null);
  assert.equal(rec.verdict, 'PASS');

  // And a probe that executed nothing cannot prove a capability defined by
  // running something.
  const noCommands = evidenceMod.build({
    capability: cap,
    probe,
    result: { observedState: 'OPERABLE', failureCode: null, detail: null, steps: [] },
    repoState: { verifiedAtSha: 'a'.repeat(40), sourceBranch: 'main', dirtyTree: false },
    startedAt: '2026-07-28T00:00:00.000Z',
    finishedAt: '2026-07-28T00:00:01.000Z',
  });
  assert.equal(noCommands.verdict, 'FAIL');
  assert.equal(noCommands.failureCode, 'DELIVERY_COMMAND_DIGEST_MISSING');
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

// ───────────────────────────────────── RUNTIME IMPACT (DV60–DV63)

const impactMod = require('./runtime-impact.cjs');

test('DV60  a diff that touches anything executable is runtime-impacting', () => {
  const runtime = [
    'project/apps/api/src/modules/office/x.ts',
    'project/packages/shared/y.ts',
    'project/scripts/orchestration-v2/service/finalize.cjs',
    'project/prisma/schema.prisma',
    '.github/workflows/ci.yml',
    'project/package.json',
    'AGENTS.md',
    'some/other/place/tool.sh',
  ];
  for (const p of runtime) {
    assert.equal(impactMod.classifyPath(p).runtime, true, p);
    assert.equal(impactMod.classify([p]).runtimeImpact, true, p);
  }
});

test('DV61  documentation is not automatically non-runtime', () => {
  // Each of these is a text file that decides what the system does. A CI
  // manifest chooses which specs execute; a coordination-v2 record decides what
  // may run at all. Calling them "docs" is how a runtime change gets a
  // NOT_APPLICABLE.
  const deceptive = [
    'project/apps/api/ci-manifests/pure/platform-scripts-shared.txt',
    'project/docs/governance/coordination-v2/programs.manifest.json',
    'project/docs/governance/coordination-v2/activation/STANDING-GRANT-OFFICE-LIVE-R01.json',
    'project/docs/governance/coordination-v2/task-plans/CANARY/plan.v2.json',
    'project/docs/governance/governance-writer-coordination-protected-paths.json',
  ];
  for (const p of deceptive) assert.equal(impactMod.classifyPath(p).runtime, true, p);
});

test('DV62  genuinely inert files classify as non-runtime', () => {
  const inert = [
    'project/docs/governance/decision-log.md',
    'project/docs/adr/ADR-014.md',
    'README.md',
    'project/docs/design/diagram.png',
  ];
  for (const p of inert) assert.equal(impactMod.classifyPath(p).runtime, false, p);
  const v = impactMod.classify(inert);
  assert.equal(v.runtimeImpact, false);
  assert.equal(v.classifiedPaths.length, inert.length);

  // A markdown file beside the code it documents is still documentation.
  assert.equal(impactMod.classifyPath('project/scripts/orchestration-v2/delivery/evidence/README.md').runtime, false);
});

test('DV63  the unknown case and the empty case both fail towards runtime', () => {
  // A classifier whose unknown case is "harmless" will one day be handed
  // something that is not. Being wrong in this direction costs a probe that ran
  // unnecessarily.
  assert.equal(impactMod.classifyPath('weird/thing.unknownext').runtime, true);
  assert.equal(impactMod.classifyPath('no-extension-file').runtime, true);

  // A task that changed nothing did not deliver anything either; calling that
  // NOT_APPLICABLE would let a no-op close a chain.
  const empty = impactMod.classify([]);
  assert.equal(empty.runtimeImpact, true);
  assert.deepEqual(empty.reasons, ['EMPTY_DIFF_IS_NOT_PROOF']);

  assert.throws(
    () => impactMod.assertNotApplicableAllowed(['project/apps/api/src/x.ts']),
    (e) => e.code === 'DELIVERY_NOT_APPLICABLE_FOR_RUNTIME_DIFF',
  );
  assert.ok(impactMod.assertNotApplicableAllowed(['project/docs/governance/decision-log.md']));
});

// ───────────────────────────────────── SUCCESSOR GATE (DV50–DV58)

const successorMod = require('../orchestrator/successor.cjs');
const authority = require('../orchestrator/authority.cjs');
const postMergeMod = require('./post-merge.cjs');

/** A CLOSED predecessor carrying the delivery record a finalizer would write. */
function closedWith(delivery) {
  return { state: 'CLOSED', payload: delivery === undefined ? {} : { delivery } };
}
const GOOD_DELIVERY = {
  verdict: 'PASS',
  mergeSha: 'f'.repeat(40),
  verifiedAtSha: 'f'.repeat(40),
  evidenceDigest: 'e'.repeat(64),
  deliveryContractSha256: 'c'.repeat(64),
  probeDefinitionSha256: 'p'.repeat(64),
};

test('DV50  a v1 successor keeps v1 rules — CLOSED is the whole rule', () => {
  // Not a bypass. v1 tasks carry no delivery contract and never could have
  // satisfied a delivery gate; applying the new rule backwards would make every
  // historical chain permanently ineligible and force an exception, which is
  // how a gate becomes decorative.
  assert.equal(successorMod.predecessorSatisfied(closedWith(undefined), 1).ok, true);
  assert.equal(successorMod.predecessorSatisfied({ state: 'MERGED' }, 1).ok, false);
  assert.equal(successorMod.predecessorSatisfied(null, 1).reason, 'PREDECESSOR_NOT_DECLARED');
});

test('DV51  a v2 successor requires merge-SHA-bound delivery evidence', () => {
  assert.equal(successorMod.predecessorSatisfied(closedWith(GOOD_DELIVERY), 2).ok, true);

  const refused = (delivery, reason) => {
    const v = successorMod.predecessorSatisfied(closedWith(delivery), 2);
    assert.equal(v.ok, false, reason);
    assert.equal(v.reason, reason, JSON.stringify(v));
  };

  // Closed under the old rules: the work may well be fine, but nothing here
  // can say so, and saying so anyway is the thing this program is about.
  refused(undefined, 'PREDECESSOR_DELIVERY_LEGACY_UNVERIFIED');
  refused(Object.assign({}, GOOD_DELIVERY, { verdict: 'FAIL' }), 'PREDECESSOR_DELIVERY_FAILED');
  refused(Object.assign({}, GOOD_DELIVERY, { verdict: 'STALE' }), 'PREDECESSOR_DELIVERY_STALE');
  refused(Object.assign({}, GOOD_DELIVERY, { verdict: 'NOT_RUN' }), 'PREDECESSOR_DELIVERY_NOT_RUN');
  refused(Object.assign({}, GOOD_DELIVERY, { verdict: 'UNWIRED' }), 'PREDECESSOR_DELIVERY_UNWIRED');
  refused(Object.assign({}, GOOD_DELIVERY, { verdict: 'LEGACY_UNVERIFIED' }), 'PREDECESSOR_DELIVERY_LEGACY_UNVERIFIED');

  // A PASS is only a PASS at the commit that was merged. Branch-head evidence
  // is a different claim wearing the same word.
  refused(Object.assign({}, GOOD_DELIVERY, { verifiedAtSha: 'a'.repeat(40) }), 'PREDECESSOR_DELIVERY_STALE');
  refused(Object.assign({}, GOOD_DELIVERY, { mergeSha: null }), 'PREDECESSOR_DELIVERY_STALE');
  refused(Object.assign({}, GOOD_DELIVERY, { evidenceDigest: null }), 'PREDECESSOR_DELIVERY_EVIDENCE_INVALID');
  refused(Object.assign({}, GOOD_DELIVERY, { probeDefinitionSha256: null }), 'PREDECESSOR_DELIVERY_EVIDENCE_INVALID');

  // MERGED without CLOSED never releases anything.
  assert.equal(successorMod.predecessorSatisfied({ state: 'MERGED', payload: { delivery: GOOD_DELIVERY } }, 2).reason, 'PREDECESSOR_NOT_CLOSED');
});

test('DV52  NOT_APPLICABLE needs the classifier\'s verdict, not the author\'s word', () => {
  const asserted = { verdict: 'NOT_APPLICABLE' };
  assert.equal(successorMod.predecessorSatisfied(closedWith(asserted), 2).reason, 'PREDECESSOR_NOT_APPLICABLE_UNPROVEN');

  const proven = { verdict: 'NOT_APPLICABLE', runtimeImpact: false, classifiedPaths: ['project/docs/x.md'] };
  assert.equal(successorMod.predecessorSatisfied(closedWith(proven), 2).ok, true);

  // A classification that says the diff DID touch runtime cannot be
  // NOT_APPLICABLE, whatever the record claims.
  const contradicted = { verdict: 'NOT_APPLICABLE', runtimeImpact: true, classifiedPaths: ['project/apps/api/x.ts'] };
  assert.equal(successorMod.predecessorSatisfied(closedWith(contradicted), 2).ok, false);
});

test('DV53  every production successor path uses the one gate', () => {
  // The inventory this replaced found three independent rules. A grep is the
  // honest test: if a fourth appears, or one of these grows its own copy again,
  // this fails and names the file.
  const root = path.join(REPO_ROOT, 'project', 'scripts', 'orchestration-v2');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

  // Comment lines are stripped: this file's own prose explains the rule it
  // replaced, and a grep that counted that would fail for the wrong reason.
  const codeLines = (text) =>
    text.split('\n').filter((l) => {
      const t = l.trim();
      return t && t.indexOf('//') !== 0 && t.indexOf('*') !== 0 && t.indexOf('/*') !== 0;
    });

  const orch = read('orchestrator/orchestrator.cjs');
  assert.ok(orch.indexOf("require('./successor.cjs')") !== -1, 'orchestrator must use the shared gate');
  assert.equal(
    codeLines(orch).filter((l) => /state === 'CLOSED'/.test(l)).length,
    0,
    'orchestrator must not carry its own CLOSED-only successor rule',
  );

  const queue = read('orchestrator/queue.cjs');
  assert.ok(queue.indexOf('taskSchemaVersion !== 2') !== -1, 'the queue dependsOn gate must be version-scoped');

  // And the gate itself must still refuse the case that motivated it.
  assert.equal(successorMod.predecessorSatisfied(closedWith(undefined), 2).ok, false);
});

test('DV54  delivery evidence for another merge does not release a v2 successor', () => {
  const predecessorMergeSha = 'a'.repeat(40);
  const evidenceMergeSha = 'b'.repeat(40);
  const record = {
    state: 'CLOSED',
    payload: {
      mergeSha: predecessorMergeSha,
      delivery: Object.assign({}, GOOD_DELIVERY, {
        mergeSha: evidenceMergeSha,
        verifiedAtSha: evidenceMergeSha,
        probeDefinitionSha256: 'd'.repeat(64),
      }),
    },
  };

  // The evidence is internally consistent and passes every existing shape
  // check, but it proves a different merge than the predecessor produced.
  assert.equal(record.payload.delivery.verifiedAtSha, record.payload.delivery.mergeSha);
  assert.notEqual(record.payload.delivery.mergeSha, record.payload.mergeSha);

  const v = successorMod.predecessorSatisfied(record, 2);
  assert.equal(v.ok, false, JSON.stringify(v));
  assert.equal(v.reason, 'PREDECESSOR_DELIVERY_MERGE_SHA_MISMATCH', JSON.stringify(v));
});

test('DV55  delivery evidence for another task does not release a v2 successor', () => {
  const predecessorTaskId = 'GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R02';
  const mergeSha = 'a'.repeat(40);
  const record = {
    state: 'CLOSED',
    payload: {
      taskId: predecessorTaskId,
      mergeSha,
      delivery: Object.assign({}, GOOD_DELIVERY, {
        taskId: predecessorTaskId,
        mergeSha,
        verifiedAtSha: mergeSha,
        probeDefinitionSha256: 'd'.repeat(64),
      }),
    },
  };

  // The identity check must discriminate rather than reject every otherwise
  // valid record.
  const matching = successorMod.predecessorSatisfied(record, 2);
  assert.equal(matching.ok, true, JSON.stringify(matching));

  // Every SHA remains bound to this predecessor, but the evidence now claims
  // that it belongs to a different task.
  record.payload.delivery.taskId = 'OTHER-PREDECESSOR-TASK';
  assert.equal(record.payload.delivery.verifiedAtSha, record.payload.delivery.mergeSha);
  assert.equal(record.payload.delivery.mergeSha, record.payload.mergeSha);
  assert.notEqual(record.payload.delivery.taskId, record.payload.taskId);

  const v = successorMod.predecessorSatisfied(record, 2);
  assert.equal(v.ok, false, JSON.stringify(v));
  assert.equal(v.reason, 'PREDECESSOR_DELIVERY_TASK_ID_MISMATCH', JSON.stringify(v));
});

test('DV56  production writes the task identity consumed by the successor gate', () => {
  const taskId = 'GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R02';
  const mergeSha = 'a'.repeat(40);
  const result = {
    verdict: 'PASS',
    observedState: 'ENFORCED',
    targetState: 'ENFORCED',
    record: {
      capabilityId: 'GOV_COORD_V2_POST_MERGE_DELIVERY_CLOSURE',
      taskId: 'STALE-VERIFICATION-TASK',
      verifiedAtSha: mergeSha,
      expectedMergeSha: mergeSha,
      deliveryContractSha256: 'c'.repeat(64),
      probeDefinitionSha256: 'd'.repeat(64),
      commandDigest: 'b'.repeat(64),
      evidenceDigest: 'e'.repeat(64),
    },
  };

  const delivery = postMergeMod.deliveryRecordFrom(result, mergeSha, taskId);
  assert.equal(delivery.taskId, taskId, 'the producer must stamp the task identity it was given');

  const record = { state: 'CLOSED', payload: { taskId, mergeSha, delivery } };
  const accepted = successorMod.predecessorSatisfied(record, 2);
  assert.equal(accepted.ok, true, JSON.stringify(accepted));

  record.payload.delivery = Object.assign({}, delivery, { taskId: 'OTHER-PREDECESSOR-TASK' });
  const refused = successorMod.predecessorSatisfied(record, 2);
  assert.equal(refused.ok, false, JSON.stringify(refused));
  assert.equal(refused.reason, 'PREDECESSOR_DELIVERY_TASK_ID_MISMATCH', JSON.stringify(refused));

  const finalizeSource = fs.readFileSync(
    path.join(REPO_ROOT, 'project', 'scripts', 'orchestration-v2', 'service', 'finalize.cjs'),
    'utf8',
  );
  const finalizeCode = finalizeSource.split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
  }).join('\n');
  assert.match(
    finalizeCode,
    /const deliveryRecord\s*=\s*Object\.assign\(\s*\{\}\s*,\s*delivery\.record\s*\|\|\s*delivery\s*,\s*\{\s*taskId:\s*entry\.taskId\s*\}\s*\)/,
    'finalize must stamp the active task identity onto the delivery record',
  );
  assert.match(
    finalizeCode,
    /deliveryPhase:\s*'DELIVERY_FAILED'[\s\S]{0,160}\bdelivery:\s*deliveryRecord/,
    'the failed-verification path must persist the stamped delivery record',
  );
  assert.match(
    finalizeCode,
    /deliveryPhase:\s*'DELIVERY_VERIFIED'\s*,\s*delivery:\s*deliveryRecord/,
    'the verified path must persist the stamped delivery record',
  );
});

test('DV57  real producer output survives production stamping and satisfies the successor gate', () => {
  const capability = manifestMod.CAPABILITIES[0];
  const probe = probesMod.PROBES[capability.probeId];
  const mergeSha = 'a'.repeat(40);
  const taskId = 'GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R03';
  const producerRecord = evidenceMod.build({
    capability,
    probe,
    result: { observedState: capability.targetState, failureCode: null, detail: 'ok', steps: [] },
    repoState: { verifiedAtSha: mergeSha, sourceBranch: 'main', dirtyTree: false },
    startedAt: '2026-07-28T00:00:00.000Z',
    finishedAt: '2026-07-28T00:00:01.000Z',
    commandDigest: 'b'.repeat(64),
    commandCount: 1,
    postMergeRun: true,
    expectedMergeSha: mergeSha,
  });
  assert.equal(producerRecord.verdict, 'PASS');

  // Feed the actual evidence.build output through the same adapter production
  // uses. No gate-facing field below is invented by this test.
  const delivery = postMergeMod.deliveryRecordFrom(
    Object.assign({}, producerRecord, { record: producerRecord }),
    mergeSha,
    taskId,
  );
  const predecessor = { state: 'CLOSED', payload: { taskId, mergeSha, delivery } };

  const producedGateFields = {
    verdict: 'PASS',
    taskId,
    mergeSha,
    verifiedAtSha: mergeSha,
    evidenceDigest: producerRecord.evidenceDigest,
    deliveryContractSha256: producerRecord.deliveryContractSha256,
    probeDefinitionSha256: producerRecord.probeDefinitionSha256,
  };
  for (const [field, expected] of Object.entries(producedGateFields)) {
    assert.equal(delivery[field], expected, 'production did not produce successor field ' + field);
  }

  const accepted = successorMod.predecessorSatisfied(predecessor, 2);
  assert.equal(accepted.ok, true, JSON.stringify(accepted));

  // A positive assertion alone would also pass through a gate that accepted
  // everything. Remove each field that is mandatory on the PASS path and prove
  // the same predecessor is refused.
  for (const field of [
    'verdict',
    'mergeSha',
    'verifiedAtSha',
    'evidenceDigest',
    'deliveryContractSha256',
    'probeDefinitionSha256',
  ]) {
    const incomplete = Object.assign({}, delivery);
    delete incomplete[field];
    const refused = successorMod.predecessorSatisfied(
      { state: 'CLOSED', payload: { taskId, mergeSha, delivery: incomplete } },
      2,
    );
    assert.equal(refused.ok, false, 'successor accepted delivery without ' + field);
  }
});

test('DV58  committed R03 successor authority is digest-pinned to the production successor gate', () => {
  const predecessorTaskId = 'GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R03';
  const successorTaskId = 'GOV-COORD-DTV-DOGFOOD-SUCCESSOR-R03';
  const artefactRoot = path.join(
    REPO_ROOT,
    'project',
    'docs',
    'governance',
    'coordination-v2',
    'task-plans',
    'DOGFOOD-R03',
  );
  const readJson = (name) => JSON.parse(fs.readFileSync(path.join(artefactRoot, name), 'utf8'));
  const predecessorPlan = readJson('plan.v4.json');
  const successorPlan = readJson('successor.plan.v4.json');
  const grant = readJson('grant.v4.json');
  const semanticAuthority = fs.readFileSync(path.join(artefactRoot, 'semantic-authority.R02.md'), 'utf8');
  const digestFields = [
    'taskSpecSha256',
    'declaredIntentSha256',
    'boundaryPolicySha256',
    'requiredTestsSha256',
    'deliveryContractSha256',
  ];

  const assertFourSurfaceParity = (candidateGrant) => {
    assert.equal(predecessorPlan.taskId, predecessorTaskId);
    assert.equal(predecessorPlan.successorDisposition, 'DECLARED_SUCCESSOR');
    assert.equal(successorPlan.taskId, successorTaskId);
    assert.deepEqual(successorPlan.predecessorTaskIds, [predecessorTaskId]);

    const authoritySuccessors = semanticAuthority
      .split(/\r?\n/)
      .map((line) => /^Successor\s*:\s*(\S+)\s*$/.exec(line))
      .filter(Boolean)
      .map((match) => match[1]);
    assert.deepEqual(authoritySuccessors, [successorTaskId]);

    // Use the production grant validator before comparing the full digest
    // surface. A renamed pin must fail closed instead of being found through a
    // fixture-specific lookup or accepted by the successor gate alone.
    const admission = authority.validateAgainstGrant({
      grant: candidateGrant,
      spec: successorPlan,
      nowMs: Date.parse('2026-07-29T00:00:00.000Z'),
    });
    const expectedDigests = authority.specDigests(successorPlan);
    assert.equal(admission.pinned.taskId, successorTaskId);
    assert.deepEqual(admission.predecessorTaskIds, successorPlan.predecessorTaskIds);
    assert.deepEqual(
      Object.fromEntries(digestFields.map((field) => [field, admission.pinned[field]])),
      Object.fromEntries(digestFields.map((field) => [field, expectedDigests[field]])),
    );
    return expectedDigests;
  };

  const successorDigests = assertFourSurfaceParity(grant);
  const capability = manifestMod.capability(successorPlan.deliveryContract.capabilityId);
  const probe = probesMod.PROBES[capability.probeId];
  const mergeSha = 'a'.repeat(40);
  const producerRecord = evidenceMod.build({
    capability,
    probe,
    result: { observedState: capability.targetState, failureCode: null, detail: 'ok', steps: [] },
    repoState: { verifiedAtSha: mergeSha, sourceBranch: 'main', dirtyTree: false },
    startedAt: '2026-07-29T00:00:00.000Z',
    finishedAt: '2026-07-29T00:00:01.000Z',
    commandDigest: 'b'.repeat(64),
    commandCount: 1,
    postMergeRun: true,
    expectedMergeSha: mergeSha,
  });
  assert.equal(producerRecord.verdict, 'PASS');
  assert.equal(producerRecord.deliveryContractSha256, successorDigests.deliveryContractSha256);

  const delivery = postMergeMod.deliveryRecordFrom(
    Object.assign({}, producerRecord, { record: producerRecord }),
    mergeSha,
    predecessorTaskId,
  );
  assert.equal(delivery.taskId, predecessorTaskId);
  assert.equal(delivery.deliveryContractSha256, successorDigests.deliveryContractSha256);
  assert.equal(delivery.evidenceDigest, producerRecord.evidenceDigest);
  const predecessor = {
    state: 'CLOSED',
    payload: { taskId: predecessorTaskId, mergeSha, delivery },
  };
  const evaluated = successorMod.evaluate({
    predecessorTaskIds: successorPlan.predecessorTaskIds,
    successorSchema: successorPlan.schemaVersion,
    currentOf: (taskId) => (taskId === predecessorTaskId ? predecessor : null),
  });
  assert.deepEqual(evaluated, { eligible: true, reasons: [] });

  const renamedGrant = JSON.parse(JSON.stringify(grant));
  const renamedPin = renamedGrant.authorizedTasks.find((entry) => entry.taskId === successorTaskId);
  assert.ok(renamedPin, 'the committed grant must carry the R03 successor pin');
  renamedPin.taskId = 'GOV-COORD-DTV-DOGFOOD-OTHER-SUCCESSOR-R03';
  assert.throws(
    () => assertFourSurfaceParity(renamedGrant),
    (error) => error && error.code === 'TASK_NOT_IN_GRANT',
  );
});

// ───────────────────────────────────── SCHEMA V2 (DV40–DV45)

const V2_CONTRACT = {
  capabilityId: 'TEST_CAPABILITY',
  deliveryClass: 'OPERATOR_CLI',
  targetState: 'OPERABLE',
  probeId: 'PROBE_X',
  probeClass: 'PROBE_DRY',
  probeDefinitionSha256: 'a'.repeat(64),
  publicEntrypoint: 'node x.cjs',
  timeoutMs: 60000,
};
const SPEC_V1 = {
  schemaVersion: 1,
  taskId: 'T-1',
  taskSpecVersion: 1,
  profile: 'BOUNDED_CODE_TASK',
  declaredIntent: 'A schema v1 task, unchanged in meaning.',
  boundaryPolicy: { allowedRoots: ['fixture/a/'] },
  requiredTests: [{ argv: ['node', '-e', '0'] }],
  predecessorTaskIds: [],
  baseDriftPolicy: 'REFRESH_BEFORE_EXECUTION',
  successorDisposition: 'NO_SUCCESSOR',
};
const SPEC_V2 = Object.assign({}, SPEC_V1, { schemaVersion: 2, deliveryContract: V2_CONTRACT });

function pinFor(spec, over) {
  const d = authority.specDigests(spec);
  return Object.assign(
    {
      taskId: spec.taskId,
      taskSpecVersion: spec.taskSpecVersion,
      taskSpecSha256: d.taskSpecSha256,
      declaredIntentSha256: d.declaredIntentSha256,
      boundaryPolicySha256: d.boundaryPolicySha256,
      requiredTestsSha256: d.requiredTestsSha256,
      predecessorTaskIds: [],
    },
    spec.schemaVersion === 2 ? { taskSchemaVersion: 2, deliveryContractSha256: d.deliveryContractSha256 } : {},
    over || {},
  );
}
function grantFor(spec, over) {
  const excerpt = 'owner ratification';
  return {
    schemaVersion: 1,
    grantId: 'G-1',
    grantKind: 'TASK_SCOPED_ONE_SHOT',
    semanticAuthorityRef: { kind: 'SEMANTIC_AUTHORITY', recordId: 'S1', sourcePath: 'a.md' },
    executionGrantRef: { kind: 'EXECUTION_GRANT', recordId: 'E1', sourcePath: 'b.md' },
    ownerRatificationEvidence: {
      sourcePath: 'a.md',
      sourceCommitSha: 'c'.repeat(40),
      exactExcerpt: excerpt,
      excerptSha256: require('crypto').createHash('sha256').update(excerpt, 'utf8').digest('hex'),
    },
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    revocationPath: 'r.md',
    manualMergeRequired: true,
    allowedModuleRoots: ['fixture/'],
    authorizedTasks: [pinFor(spec, over)],
  };
}

test('DV40  schema v1 keeps its exact meaning and its exact digests', () => {
  const d = authority.specDigests(SPEC_V1);
  assert.equal(d.canonical.schemaVersion, 1);
  // A v1 task has no delivery digest at all — not a null, not an empty string.
  // Every historical grant pins four values and must keep matching.
  assert.equal(d.deliveryContractSha256, undefined);
  assert.equal(d.canonical.deliveryContract, undefined);
  assert.ok(authority.validateAgainstGrant({ grant: grantFor(SPEC_V1), spec: SPEC_V1 }).grantId);
});

test('DV41  a schema v2 task carries its delivery contract inside the canonical spec', () => {
  const d = authority.specDigests(SPEC_V2);
  assert.equal(d.canonical.schemaVersion, 2);
  assert.match(d.deliveryContractSha256, /^[0-9a-f]{64}$/);
  // Inside, not referenced. A contract hashed separately could drift from the
  // spec the grant pinned; inside taskSpecSha256, it cannot.
  assert.ok(d.canonical.deliveryContract);
  assert.notEqual(d.taskSpecSha256, authority.specDigests(SPEC_V1).taskSpecSha256);

  // The evidence policy is expanded to its fields, never left as a name: a
  // policy name is a promise nobody can check.
  for (const f of authority.DELIVERY_EVIDENCE_POLICY_FIELDS) {
    assert.equal(typeof d.canonical.deliveryContract.evidencePolicy[f], 'boolean', f);
  }
});

test('DV42  digests are settled — materializing them does not move them', () => {
  const d = authority.specDigests(SPEC_V2);
  const materialized = Object.assign({}, SPEC_V2, { deliveryContractSha256: d.deliveryContractSha256 });
  const again = authority.specDigests(materialized);
  assert.equal(again.taskSpecSha256, d.taskSpecSha256);
  assert.equal(again.deliveryContractSha256, d.deliveryContractSha256);
});

test('DV43  a mixed-version or self-contradicting task fails closed', () => {
  const bad = (spec, code) => assert.throws(() => authority.specDigests(spec), (e) => e.code === code, code);
  bad(Object.assign({}, SPEC_V2, { deliveryContract: undefined }), 'TASK_SPEC_DELIVERY_CONTRACT_REQUIRED');
  bad(Object.assign({}, SPEC_V1, { deliveryContract: V2_CONTRACT }), 'TASK_SPEC_MIXED_VERSION');
  bad(Object.assign({}, SPEC_V1, { schemaVersion: 3 }), 'TASK_SPEC_SCHEMA_VERSION');
  // A self-declared digest is a claim, not evidence: it is recomputed. This is
  // the #1696 defect in one assertion.
  bad(Object.assign({}, SPEC_V2, { deliveryContractSha256: 'b'.repeat(64) }), 'DELIVERY_CONTRACT_HASH_MISMATCH');
});

test('DV44  a grant must pin the delivery claim it ratified', () => {
  assert.ok(authority.validateAgainstGrant({ grant: grantFor(SPEC_V2), spec: SPEC_V2 }).grantId);

  const reject = (grant, spec, code) =>
    assert.throws(() => authority.validateAgainstGrant({ grant, spec }), (e) => e.code === code, code);

  // A v1 entry has no delivery digest, so authorizing a v2 task would be
  // authorizing a delivery claim it never saw.
  reject(grantFor(SPEC_V2, { taskSchemaVersion: undefined, deliveryContractSha256: undefined }), SPEC_V2, 'GRANT_TASK_SCHEMA_VERSION_MISMATCH');
  reject(grantFor(SPEC_V2, { deliveryContractSha256: undefined }), SPEC_V2, 'GRANT_DELIVERY_CONTRACT_DIGEST_MISSING');
  reject(grantFor(SPEC_V2, { deliveryContractSha256: 'd'.repeat(64) }), SPEC_V2, 'DELIVERY_CONTRACT_HASH_MISMATCH');
});

test('DV45  changing the claim breaks the grant; changing the prose does not', () => {
  const g = grantFor(SPEC_V2);

  const retargeted = Object.assign({}, SPEC_V2, {
    deliveryContract: Object.assign({}, V2_CONTRACT, { targetState: 'WIRED_DISABLED' }),
  });
  assert.throws(
    () => authority.validateAgainstGrant({ grant: g, spec: retargeted }),
    (e) => e.code === 'DELIVERY_CONTRACT_HASH_MISMATCH',
    'a changed target state must be reported as a changed delivery claim, not a generic spec drift',
  );

  // If editing a sentence invalidated a ratified grant, nobody would ever
  // improve one.
  const retitled = Object.assign({}, SPEC_V2, {
    deliveryContract: Object.assign({}, V2_CONTRACT, { title: 'nicer words', rationale: 'because' }),
  });
  assert.ok(authority.validateAgainstGrant({ grant: g, spec: retitled }).grantId);
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
