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
const path = require('path');

const lease = require('../safety/lease.cjs');
const resolveMod = require('../executors/resolve.cjs');
const authority = require('./authority.cjs');
const stateMod = require('./state.cjs');
const mergeready = require('./mergeready.cjs');
const orch = require('./orchestrator.cjs');

const FAKE = path.join(__dirname, '..', 'executors', 'fake-executor.cjs');

// Fixtures live in pilot-fixtures.cjs so the pilot and these unit tests
// cannot drift apart. This file previously carried its own copies of six
// helpers plus a trailing module.exports; only fixtureRepo and specAndGrant
// were ever called by a test, and nothing imported the export.
const F = require('./pilot-fixtures.cjs');

const fixtureRepo = F.fixtureRepo;
const specAndGrant = F.specAndGrant;
const NODE = F.NODE;

test.after(F.cleanupTemps);

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

  // Manual merge stays the default. Turning it off is allowed only by NAMING
  // the authorization that says otherwise — an unattributed `false` is
  // indistinguishable from a typo, and this is the field whose typo would be a
  // merge nobody authorized.
  const c = specAndGrant();
  c.grant.manualMergeRequired = false;
  assert.throws(
    () => authority.validateAgainstGrant({ grant: c.grant, spec: c.spec }),
    (e) => e.code === 'GRANT_AUTO_MERGE_UNATTRIBUTED',
  );

  const d = specAndGrant();
  d.grant.manualMergeRequired = 'no';
  assert.throws(
    () => authority.validateAgainstGrant({ grant: d.grant, spec: d.spec }),
    (e) => e.code === 'GRANT_MANUAL_MERGE_REQUIRED',
    'anything that is not a boolean is malformed, not permissive',
  );

  // Attributed, and therefore admissible here. Being admissible here is not
  // being allowed to merge: gh-merge-provider re-reads every gate at merge time.
  const e2 = specAndGrant();
  e2.grant.manualMergeRequired = false;
  e2.grant.autoMergeAuthorizedBy = 'OWNER-GRANT-ORCHESTRA-E2E-ALL-PROGRAMS-R02';
  assert.ok(authority.validateAgainstGrant({ grant: e2.grant, spec: e2.spec }));
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

// ------------------------------------------- §1 IMMUTABLE FORBIDDEN COVERAGE
//
// IMMUTABLE_FORBIDDEN is transcribed by hand from the V1 protected-path source.
// A transcription drifts silently: the missing entry does not throw, it simply
// stops protecting something. These two tests turn each drift into a failure.
//
// Coverage is asserted semantically, not by string equality, because one broad
// pattern legitimately covers several source entries — `project/docs/governance/**`
// subsumes the coordination-request/result/grant directories, `.codex/` subsumes
// every grandfathered exact path beneath it.

const boundaryMod = require('../safety/boundary.cjs');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/** A concrete path that must be caught if `entry` is genuinely protected. */
function probeFor(entry) {
  if (entry.endsWith('/**')) return entry.slice(0, -3) + '/probe-file.md';
  if (entry.endsWith('*')) return entry.slice(0, -1) + 'probe-file.json';
  if (entry.endsWith('/')) return entry + 'probe-file';
  return entry;
}

test('§1: every V1 protected-path entry is covered by IMMUTABLE_FORBIDDEN', () => {
  const src = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, 'project/docs/governance/governance-writer-coordination-protected-paths.json'),
      'utf8',
    ),
  );
  // queueExceptions is an exception list carrying <requestId> placeholders, not
  // a protected set, so it is deliberately not asserted here.
  const groups = [
    'canonicalSemanticGovernance',
    'coordinationControlPlane',
    'grandfatheredOwnerWipPrefixes',
    'grandfatheredOwnerWipExactPaths',
  ];
  const uncovered = [];
  for (const g of groups) {
    for (const entry of src[g] || []) {
      const probe = probeFor(entry);
      if (!boundaryMod.matchesForbidden(probe, orch.IMMUTABLE_FORBIDDEN)) uncovered.push(g + ' :: ' + entry);
    }
  }
  assert.deepEqual(uncovered, [], 'protected-path entries not covered by §1');
});

test('§1: every tracked schema/migration path is covered by IMMUTABLE_FORBIDDEN', () => {
  // PRODUCTION_SCHEMA_MIGRATION_RUNTIME is DENIED in V1 §3, and §15.2 enforces
  // it only through this list. A second Prisma surface added anywhere in the
  // tree must therefore fail here rather than become quietly writable.
  const tracked = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((p) => /(^|\/)schema\.prisma$|\/prisma\/migrations\//.test(p));
  assert.ok(tracked.length > 0, 'expected to find the schema/migration surface');
  const uncovered = tracked.filter((p) => !boundaryMod.matchesForbidden(p, orch.IMMUTABLE_FORBIDDEN));
  assert.deepEqual(uncovered, [], 'schema/migration paths reachable by a bounded task');

  // The Prisma *module* is application code and must stay reachable, otherwise
  // the fix would over-tighten BOUNDED_CODE_TASK out of usefulness.
  assert.equal(
    boundaryMod.matchesForbidden('project/apps/api/src/prisma/prisma.service.ts', orch.IMMUTABLE_FORBIDDEN),
    null,
  );
});

// ------------------------------------------- OWNER RATIFICATION EVIDENCE (§2)
//
// grant.schema.json has always required ownerRatificationEvidence, and nothing
// read it: "<OWNER-FILLS>" validated as readily as a real excerpt, so a grant
// nobody had ratified was accepted as long as its expiry parsed. Found by
// filling a real expiry into an otherwise-placeholder grant and watching
// validateAgainstGrant succeed.

const authorityMod = require('./authority.cjs');
const nodeCrypto = require('crypto');

function evidenceFor(excerpt, sha) {
  return {
    sourcePath: 'project/docs/governance/decision-log.md',
    sourceCommitSha: sha || 'a'.repeat(40),
    exactExcerpt: excerpt,
    excerptSha256: nodeCrypto.createHash('sha256').update(excerpt, 'utf8').digest('hex'),
  };
}

function grantWith(evidence, spec) {
  const d = authorityMod.specDigests(spec);
  return {
    schemaVersion: 1,
    grantId: 'G-TEST',
    workstream: 'WS',
    manualMergeRequired: true,
    semanticAuthorityRef: { kind: 'SEMANTIC_AUTHORITY', recordId: 'SEM', sourcePath: 'a/b.md' },
    executionGrantRef: { kind: 'EXECUTION_GRANT', recordId: 'EXE', sourcePath: 'c/d.md' },
    ownerRatificationEvidence: evidence,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    revocationPath: 'x/REVOKED',
    authorizedTasks: [
      {
        taskId: spec.taskId,
        taskSpecVersion: spec.taskSpecVersion,
        taskSpecSha256: d.taskSpecSha256,
        declaredIntentSha256: d.declaredIntentSha256,
        boundaryPolicySha256: d.boundaryPolicySha256,
        requiredTestsSha256: d.requiredTestsSha256,
      },
    ],
  };
}

const EV_SPEC = {
  schemaVersion: 1,
  taskId: 'EVIDENCE-TEST-01',
  taskSpecVersion: 1,
  profile: 'BOUNDED_CODE_TASK',
  declaredIntent: 'Evidence-gate fixture spec; digested only, never executed.',
  boundaryPolicy: { allowedRoots: ['project/apps/api/src/x/'] },
  requiredTests: [{ argv: ['true'] }],
  predecessorTaskIds: [],
  baseDriftPolicy: 'STRICT_PINNED_BASE',
  baseSha: 'b'.repeat(40),
  successorDisposition: 'NO_SUCCESSOR',
};

test('§2: a placeholder ratification is not evidence', () => {
  for (const bad of ['<OWNER-FILLS>', 'TBD', 'TODO', 'owner-fill']) {
    const ev = evidenceFor('real excerpt');
    ev.exactExcerpt = bad;
    ev.excerptSha256 = nodeCrypto.createHash('sha256').update(bad, 'utf8').digest('hex');
    assert.throws(
      () => authorityMod.validateAgainstGrant({ grant: grantWith(ev, EV_SPEC), spec: EV_SPEC }),
      (e) => e.code === 'OWNER_RATIFICATION_EVIDENCE_PLACEHOLDER',
      bad,
    );
  }
});

test('§2: a missing or incomplete evidence block fails closed', () => {
  const g1 = grantWith(evidenceFor('x'), EV_SPEC);
  delete g1.ownerRatificationEvidence;
  assert.throws(
    () => authorityMod.validateAgainstGrant({ grant: g1, spec: EV_SPEC }),
    (e) => e.code === 'OWNER_RATIFICATION_EVIDENCE_MISSING',
  );
  const g2 = grantWith(evidenceFor('x'), EV_SPEC);
  g2.ownerRatificationEvidence.exactExcerpt = '';
  assert.throws(
    () => authorityMod.validateAgainstGrant({ grant: g2, spec: EV_SPEC }),
    (e) => e.code === 'OWNER_RATIFICATION_EVIDENCE_INCOMPLETE',
  );
});

test('§2: the digest must be of the excerpt it travels with', () => {
  const ev = evidenceFor('the owner decided X');
  ev.exactExcerpt = 'the owner decided Y';
  assert.throws(
    () => authorityMod.validateAgainstGrant({ grant: grantWith(ev, EV_SPEC), spec: EV_SPEC }),
    (e) => e.code === 'OWNER_RATIFICATION_EXCERPT_DIGEST_MISMATCH',
  );
});

test('§2: a well-formed evidence block still passes', () => {
  const v = authorityMod.validateAgainstGrant({
    grant: grantWith(evidenceFor('RC-COL / W2.2D-1A OWNER AUTHORIZATION'), EV_SPEC),
    spec: EV_SPEC,
  });
  assert.equal(v.grantId, 'G-TEST');
});

test('§2: verification against the repository catches an excerpt that is not there', () => {
  const grant = grantWith(evidenceFor('the owner decided X'), EV_SPEC);
  assert.throws(
    () =>
      authorityMod.verifyRatificationEvidence({
        grant,
        readAtCommit: () => 'a file that says something else entirely',
      }),
    (e) => e.code === 'OWNER_RATIFICATION_EXCERPT_ABSENT',
  );
  // Present verbatim -> accepted.
  const ok = authorityMod.verifyRatificationEvidence({
    grant,
    readAtCommit: () => 'preamble\nthe owner decided X\ntrailer',
  });
  assert.equal(ok.ok, true);
});

test('§2: a ratification commit outside the target branch is not in force', () => {
  const grant = grantWith(evidenceFor('decided'), EV_SPEC);
  assert.throws(
    () =>
      authorityMod.verifyRatificationEvidence({
        grant,
        isAncestor: () => false,
        readAtCommit: () => 'decided',
      }),
    (e) => e.code === 'OWNER_RATIFICATION_NOT_IN_MAIN',
  );
});

test('§2: verification refuses to run without a reader rather than passing', () => {
  assert.throws(
    () => authorityMod.verifyRatificationEvidence({ grant: grantWith(evidenceFor('x'), EV_SPEC) }),
    (e) => e.code === 'EVIDENCE_READER_REQUIRED',
  );
});

// ------------------------------------------------- AUTHORITY REFS EXIST (§15.5)
//
// §15.5 forbids a planner from producing semanticAuthorityRef, and nothing
// enforced it: validateAgainstGrant only checks the two refs are distinct, so a
// fabricated recordId pointing at a real file passed every gate. It happened in
// this repository — a plan cited OFFICE-P2-CAP02-REPORTINGLINE-READ-CHARACTERIZATION
// against OFFICE-DELIVERY-MANIFEST.md, a string that existed nowhere but the
// grant that invented it, and only human review caught it.

const SHA40 = 'f'.repeat(40);

function refGrant(over) {
  return Object.assign(
    {
      semanticAuthorityRef: {
        kind: 'SEMANTIC_AUTHORITY',
        recordId: 'REAL-SEMANTIC-RECORD',
        sourcePath: 'project/docs/governance/X.md',
      },
      executionGrantRef: {
        kind: 'EXECUTION_GRANT',
        recordId: 'REAL-EXEC-GRANT',
        sourcePath: 'project/docs/governance/Y.md',
      },
    },
    over || {},
  );
}

const REAL_FILES = {
  'project/docs/governance/X.md': 'prose mentioning REAL-SEMANTIC-RECORD in context',
  'project/docs/governance/Y.md':
    '<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=REAL-EXEC-GRANT -->\nbody',
};
const reader = (p) => {
  if (!(p in REAL_FILES)) throw new Error('ENOENT ' + p);
  return REAL_FILES[p];
};

test('§15.5: a fabricated semanticAuthorityRef recordId is rejected', () => {
  const g = refGrant({
    semanticAuthorityRef: {
      kind: 'SEMANTIC_AUTHORITY',
      recordId: 'OFFICE-P2-CAP02-REPORTINGLINE-READ-CHARACTERIZATION',
      sourcePath: 'project/docs/governance/X.md',
    },
  });
  assert.throws(
    () => authorityMod.verifyAuthorityRefs({ grant: g, readAtCommit: reader, atCommit: SHA40 }),
    (e) => e.code === 'AUTHORITY_RECORD_ID_ABSENT',
  );
});

test('§15.5: a reference to a file that does not exist is rejected', () => {
  const g = refGrant({
    semanticAuthorityRef: {
      kind: 'SEMANTIC_AUTHORITY',
      recordId: 'REAL-SEMANTIC-RECORD',
      sourcePath: 'project/docs/governance/DOES-NOT-EXIST.md',
    },
  });
  assert.throws(
    () => authorityMod.verifyAuthorityRefs({ grant: g, readAtCommit: reader, atCommit: SHA40 }),
    (e) => e.code === 'AUTHORITY_RECORD_UNREADABLE',
  );
});

test('§15.5: an execution grant needs its authority marker, not just its name', () => {
  const files = Object.assign({}, REAL_FILES, {
    'project/docs/governance/Y.md': 'this document merely mentions REAL-EXEC-GRANT in passing',
  });
  assert.throws(
    () =>
      authorityMod.verifyAuthorityRefs({
        grant: refGrant(),
        readAtCommit: (p) => files[p],
        atCommit: SHA40,
      }),
    (e) => e.code === 'AUTHORITY_RECORD_MARKER_MISSING',
  );
});

test('§15.5: both references resolving to real records passes', () => {
  const r = authorityMod.verifyAuthorityRefs({
    grant: refGrant(),
    readAtCommit: reader,
    atCommit: SHA40,
  });
  assert.deepEqual(r.checked, ['semanticAuthorityRef', 'executionGrantRef']);
});

test('§15.5: verification refuses to run without a reader or a pinned commit', () => {
  assert.throws(
    () => authorityMod.verifyAuthorityRefs({ grant: refGrant(), atCommit: SHA40 }),
    (e) => e.code === 'EVIDENCE_READER_REQUIRED',
  );
  assert.throws(
    () => authorityMod.verifyAuthorityRefs({ grant: refGrant(), readAtCommit: reader, atCommit: 'HEAD' }),
    (e) => e.code === 'EVIDENCE_COMMIT_INVALID',
  );
});

// ------------------------------------------------- STANDING GRANT (WP02)

// A standing grant removes the per-task owner ratification round. What replaces
// it is validateAgainstStandingGrant: every limit the grant states is enforced
// mechanically, on the plan, before anything runs. These tests are that
// promise's teeth.
const SG_ACT = 'project/docs/governance/coordination-v2/activation';

function standingGrant(over) {
  return Object.assign(
    {
      schemaVersion: 1,
      standingGrantId: 'STANDING-GRANT-TEST-R01',
      parentAuthorizationRef: {
        authorizationId: 'OWNER-GRANT-TEST-R01',
        sourcePath: SG_ACT + '/PARENT-AUTHORIZATION-ENVELOPE.md',
        payloadSha256: 'a'.repeat(64),
      },
      program: { programId: 'OFFICE', eligibilityAuthorityRef: SG_ACT + '/PROGRAM-ELIGIBILITY-AUTHORITY.md' },
      allowedTaskClasses: ['TEST_ONLY_CHARACTERIZATION'],
      allowedPathRoots: ['project/apps/api/src/modules/office/'],
      prohibitedPathRoots: ['project/scripts/orchestration-v2/'],
      allowedExecutorLanes: ['CLAUDE_LOCAL'],
      requiredIndependentReview: true,
      ciPolicy: { requireTerminalSuccess: true, allowSkipped: false, allowNeutral: true },
      mergePolicy: { method: 'SQUASH', autoMergeAuthorized: true, repositoryWideAutoMerge: false },
      maxConcurrency: 1,
      revocationPath: SG_ACT + '/REVOKED-OFFICE',
      killSwitchPath: SG_ACT + '/KILL-SWITCH',
      ownerRatificationEvidence: {
        sourcePath: SG_ACT + '/PARENT-AUTHORIZATION-ENVELOPE.md',
        sourceCommitSha: 'b'.repeat(40),
        exactExcerpt: 'OFFICE opened to controlled live execution',
        excerptSha256: 'c'.repeat(64),
      },
      auditLogPath: SG_ACT + '/audit/office.jsonl',
      childPlanDerivation: {
        requirePlanHash: true,
        requireParentRef: true,
        requireBoundarySubset: true,
        requireTaskClassMatch: true,
      },
      prohibitions: {
        noPrivilegeDelegation: true,
        noSecretAccessExpansion: true,
        noProductionDataMutation: true,
        noCrossProgramMutation: true,
        noSelfAuthorizationChange: true,
      },
    },
    over || {},
  );
}

const sgSpec = (roots) => ({
  taskId: 'SG-TEST-01',
  boundaryPolicy: { allowedRoots: roots, maxChangedFiles: 1 },
});

function sgThrows(opts, code) {
  assert.throws(
    () => authorityMod.validateAgainstStandingGrant(opts),
    (e) => e.code === code,
    'expected ' + code,
  );
}

function sgRead(file) {
  const fs2 = require('fs');
  const p2 = require('path');
  const root = p2.join(__dirname, '..', '..', '..', '..');
  return JSON.parse(fs2.readFileSync(p2.join(root, SG_ACT, file), 'utf8'));
}

test('standing grant: a plan inside every limit is admitted', () => {
  const r = authorityMod.validateAgainstStandingGrant({
    standingGrant: standingGrant(),
    spec: sgSpec(['project/apps/api/src/modules/office/__tests__/']),
    taskClass: 'TEST_ONLY_CHARACTERIZATION',
    executorLane: 'CLAUDE_LOCAL',
    nowMs: Date.now(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.program, 'OFFICE');
});

test('standing grant: a path outside the granted roots is refused', () => {
  sgThrows(
    {
      standingGrant: standingGrant(),
      spec: sgSpec(['project/apps/api/src/modules/collection/']),
      taskClass: 'TEST_ONLY_CHARACTERIZATION',
    },
    'BOUNDARY_EXCEEDS_STANDING_GRANT',
  );
});

test('standing grant: a prohibited shared surface is refused even inside a granted root', () => {
  sgThrows(
    {
      standingGrant: standingGrant({ allowedPathRoots: ['project/'] }),
      spec: sgSpec(['project/scripts/orchestration-v2/orchestrator/']),
      taskClass: 'TEST_ONLY_CHARACTERIZATION',
    },
    'BOUNDARY_TOUCHES_PROHIBITED_SURFACE',
  );
});

test('standing grant: an ungranted task class is refused, known vocabulary or not', () => {
  const spec = sgSpec(['project/apps/api/src/modules/office/']);
  sgThrows({ standingGrant: standingGrant(), spec, taskClass: 'BOUNDED_CODE_FIX' }, 'TASK_CLASS_NOT_GRANTED');
  sgThrows({ standingGrant: standingGrant(), spec, taskClass: 'DELETE_EVERYTHING' }, 'TASK_CLASS_UNKNOWN');
});

test('standing grant: an ungranted executor lane is refused', () => {
  sgThrows(
    {
      standingGrant: standingGrant(),
      spec: sgSpec(['project/apps/api/src/modules/office/']),
      taskClass: 'TEST_ONLY_CHARACTERIZATION',
      executorLane: 'CODEX_LOCAL',
    },
    'EXECUTOR_LANE_NOT_GRANTED',
  );
});

test('standing grant: revocation and the kill switch each stop everything', () => {
  const base = {
    standingGrant: standingGrant(),
    spec: sgSpec(['project/apps/api/src/modules/office/']),
    taskClass: 'TEST_ONLY_CHARACTERIZATION',
  };
  sgThrows(Object.assign({}, base, { revoked: true }), 'STANDING_GRANT_REVOKED');
  sgThrows(Object.assign({}, base, { killSwitchEngaged: true }), 'KILL_SWITCH_ENGAGED');
});

test('standing grant: a grant citing no parent authorization is self-authorizing and refused', () => {
  sgThrows(
    {
      standingGrant: standingGrant({
        parentAuthorizationRef: { authorizationId: 'X', sourcePath: 'a.md', payloadSha256: 'not-a-digest' },
      }),
      spec: sgSpec(['project/apps/api/src/modules/office/']),
      taskClass: 'TEST_ONLY_CHARACTERIZATION',
    },
    'STANDING_GRANT_PARENT_REF_INVALID',
  );
});

test('standing grant: serial execution, independent review and bounded merge cannot be softened', () => {
  const spec = sgSpec(['project/apps/api/src/modules/office/']);
  const cls = 'TEST_ONLY_CHARACTERIZATION';
  sgThrows({ standingGrant: standingGrant({ maxConcurrency: 4 }), spec, taskClass: cls }, 'STANDING_GRANT_CONCURRENCY_INVALID');
  sgThrows({ standingGrant: standingGrant({ requiredIndependentReview: false }), spec, taskClass: cls }, 'INDEPENDENT_REVIEW_NOT_REQUIRED');
  sgThrows(
    {
      standingGrant: standingGrant({
        mergePolicy: { method: 'SQUASH', autoMergeAuthorized: true, repositoryWideAutoMerge: true },
      }),
      spec,
      taskClass: cls,
    },
    'REPOSITORY_WIDE_AUTO_MERGE_FORBIDDEN',
  );
  sgThrows(
    {
      standingGrant: standingGrant({
        ciPolicy: { requireTerminalSuccess: false, allowSkipped: true, allowNeutral: true },
      }),
      spec,
      taskClass: cls,
    },
    'CI_TERMINAL_SUCCESS_NOT_REQUIRED',
  );
});

test('standing grant: a missing self-modification prohibition is malformed, not permissive', () => {
  sgThrows(
    {
      standingGrant: standingGrant({
        prohibitions: {
          noPrivilegeDelegation: true,
          noSecretAccessExpansion: true,
          noProductionDataMutation: true,
          noCrossProgramMutation: true,
          noSelfAuthorizationChange: false,
        },
      }),
      spec: sgSpec(['project/apps/api/src/modules/office/']),
      taskClass: 'TEST_ONLY_CHARACTERIZATION',
    },
    'STANDING_GRANT_PROHIBITION_MISSING',
  );
});

test('standing grant: the two shipped grants hold their own stated limits', () => {
  for (const [file, program] of [
    ['STANDING-GRANT-OFFICE-LIVE-R01.json', 'OFFICE'],
    ['STANDING-GRANT-COLLECTION-LIVE-R01.json', 'COLLECTION'],
  ]) {
    const g = sgRead(file);
    assert.equal(g.program.programId, program);
    assert.equal(g.maxConcurrency, 1);
    assert.equal(g.mergePolicy.repositoryWideAutoMerge, false);
    assert.equal(g.requiredIndependentReview, true);
    for (const k of Object.keys(g.prohibitions)) assert.equal(g.prohibitions[k], true, program + ' ' + k);
    const r = authorityMod.validateAgainstStandingGrant({
      standingGrant: g,
      spec: sgSpec([g.allowedPathRoots[0] + '__tests__/']),
      taskClass: 'TEST_ONLY_CHARACTERIZATION',
      executorLane: 'CLAUDE_LOCAL',
      nowMs: Date.now(),
    });
    assert.equal(r.program, program);
  }
});

test('standing grant: neither shipped grant can reach the other program or the control plane', () => {
  const office = sgRead('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const collection = sgRead('STANDING-GRANT-COLLECTION-LIVE-R01.json');
  const cls = 'TEST_ONLY_CHARACTERIZATION';
  sgThrows({ standingGrant: office, spec: sgSpec(collection.allowedPathRoots.slice(0, 1)), taskClass: cls }, 'BOUNDARY_EXCEEDS_STANDING_GRANT');
  sgThrows({ standingGrant: collection, spec: sgSpec(office.allowedPathRoots.slice(0, 1)), taskClass: cls }, 'BOUNDARY_EXCEEDS_STANDING_GRANT');
  for (const g of [office, collection]) {
    sgThrows({ standingGrant: g, spec: sgSpec(['project/scripts/orchestration-v2/']), taskClass: cls }, 'BOUNDARY_EXCEEDS_STANDING_GRANT');
  }
});

test('standing grant: the task-scoped grant model still works alongside it', () => {
  // Backward compatibility is a stated requirement: standing grants stand
  // beside grant.schema.json, they do not replace it.
  assert.equal(typeof authorityMod.validateAgainstGrant, 'function');
  assert.equal(typeof authorityMod.validateAgainstStandingGrant, 'function');
  assert.notEqual(authorityMod.validateAgainstGrant, authorityMod.validateAgainstStandingGrant);
});

test('orchestrator: a failed executor records what it actually said', () => {
  // spawn.cjs captures stdout and stderr; summarize dropped both, so a failed
  // lane recorded exactly "exit=1". That cost a full investigation to learn a
  // codex lane was exiting in 139ms, because the record could not say why.
  const run = {
    exitCode: 1,
    durationMs: 139,
    termination: { reason: 'NORMAL_EXIT', orphanProcessDetected: false },
    stdoutTruncated: false,
    executorExitSuccess: false,
    stdout: 'some ordinary chatter',
    stderr: 'Not inside a trusted directory and --skip-git-repo-check was not specified.',
  };

  const quiet = orch.summarize(run);
  assert.equal(quiet.stderrTail, undefined, 'a successful run does not carry its output');

  const loud = orch.summarize(run, true);
  assert.match(loud.stderrTail, /trusted directory/);
  assert.equal(loud.stdoutTail, 'some ordinary chatter');
  assert.equal(loud.exitCode, 1);
});

test('orchestrator: a runaway executor cannot fill the state log', () => {
  // The tail, not the head: a tool that fails says why at the end.
  const huge = 'x'.repeat(50000) + 'THE ACTUAL ERROR';
  const s = orch.summarize(
    { exitCode: 1, durationMs: 1, termination: { reason: 'NORMAL_EXIT', orphanProcessDetected: false }, stdout: '', stderr: huge, stdoutTruncated: false, executorExitSuccess: false },
    true,
  );
  assert.ok(s.stderrTail.length < 2200, 'the tail is capped');
  assert.match(s.stderrTail, /THE ACTUAL ERROR$/, 'and it keeps the end, where the reason is');
  assert.match(s.stderrTail, /chars elided/, 'and says it elided something');
});
