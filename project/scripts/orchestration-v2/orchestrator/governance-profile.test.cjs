'use strict';
/**
 * MECHANICAL_GOVERNANCE profile.
 *
 * The property under test is not "this allowlist is correct". It is that the
 * profile is V1's ratified mechanism ported unchanged — so most of these tests
 * compare against V1's own JSON rather than against a list written here.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const G = require('./governance-profile.cjs');

function repoRoot() {
  return path.join(__dirname, '..', '..', '..', '..');
}
function readRepo(rel) {
  return fs.readFileSync(path.join(repoRoot(), rel), 'utf8');
}
const V1 = () => JSON.parse(readRepo('project/docs/governance/governance-writer-coordination-protected-paths.json'));

const REQ_PATH = 'project/docs/governance/coordination-requests/REQ-001/request.md';
const RES_PATH = 'project/docs/governance/coordination-results/REQ-001/result.md';

function grant(over) {
  return Object.assign(
    {
      standingGrantId: 'STANDING-GRANT-MECHANICAL-GOVERNANCE-R01',
      profile: 'MECHANICAL_GOVERNANCE',
      parentAuthorizationRef: {
        authorizationId: 'OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01',
        payloadSha256: 'a'.repeat(64),
      },
      mergePolicy: { method: 'SQUASH', autoMergeAuthorized: false, repositoryWideAutoMerge: false },
      deniedCapabilities: G.DENIED_CAPABILITIES.slice(),
    },
    over || {},
  );
}

function run(over) {
  return G.validateGovernanceTask(
    Object.assign(
      {
        standingGrant: grant(),
        spec: { taskId: 'GOV-01' },
        operation: 'EXACT_APPEND_AT_DECLARED_ANCHOR',
        targetPaths: [REQ_PATH],
      },
      over || {},
    ),
  );
}

function throwsWith(over, code) {
  assert.throws(() => run(over), (e) => e.code === code, 'expected ' + code);
}

// ------------------------------------------------------- PORTED, NOT INVENTED

test('governance profile: the four operations are V1s four, not a list written here', () => {
  assert.deepEqual(G.LEVEL2_OPERATIONS.slice().sort(), V1().level2Operations.slice().sort());
});

test('governance profile: the denied capabilities are V1s, carried across unchanged', () => {
  // A profile that gains a capability in translation is a new authority model,
  // which is exactly what §15 forbids.
  assert.deepEqual(G.DENIED_CAPABILITIES.slice().sort(), V1().deniedCapabilities.slice().sort());
});

test('governance profile: the reachable surface is V1s two queue exceptions', () => {
  const v1 = V1().queueExceptions;
  assert.equal(v1.length, G.QUEUE_EXCEPTION_PATTERNS.length);
  for (const pat of G.QUEUE_EXCEPTION_PATTERNS) {
    assert.ok(
      v1.some((q) => q.indexOf(pat.prefix) === 0 && q.endsWith(pat.file)),
      pat.prefix + pat.file + ' is not one of V1s queue exceptions',
    );
  }
});

// ------------------------------------------------------------ THE SURFACE

test('governance profile: the two queue exception paths are reachable', () => {
  assert.equal(run({ targetPaths: [REQ_PATH] }).ok, true);
  assert.equal(run({ targetPaths: [RES_PATH] }).ok, true);
});

test('governance profile: canonical governance is UNREACHABLE, not merely excluded', () => {
  // This is the honest reading of §1.2 rather than a narrower allowlist that
  // happens to leave these out. A task that needs them goes through V1.
  for (const p of [
    'project/docs/governance/decision-log.md',
    'project/docs/governance/active-roadmap.md',
    'project/docs/governance/product-backlog.md',
    'project/docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md',
    'AGENTS.md',
    'CLAUDE.md',
  ]) {
    throwsWith({ targetPaths: [p] }, 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE');
  }
});

test('governance profile: the exception is a named file in a request directory, not a prefix', () => {
  // A prefix test would admit anything dropped into the directory, and the
  // entire value of the exception is that it is ONE file per request.
  throwsWith({ targetPaths: ['project/docs/governance/coordination-requests/anything.md'] }, 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE');
  throwsWith({ targetPaths: ['project/docs/governance/coordination-requests/REQ-001/notes.md'] }, 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE');
  throwsWith({ targetPaths: ['project/docs/governance/coordination-requests/REQ-001/sub/request.md'] }, 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE');
  throwsWith({ targetPaths: ['project/docs/governance/coordination-results/REQ-001/request.md'] }, 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE');
});

test('governance profile: a request id that walks upward is not a request id', () => {
  throwsWith({ targetPaths: ['project/docs/governance/coordination-requests/../decision-log.md'] }, 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE');
  assert.equal(G.isQueueExceptionPath('project/docs/governance/coordination-requests/../request.md'), false);
});

test('governance profile: the control plane is refused even before the surface test', () => {
  for (const p of G.ENVELOPE_PROHIBITED_SURFACES) {
    throwsWith({ targetPaths: [p + 'anything.md'] }, 'GOVERNANCE_TOUCHES_PROHIBITED_SURFACE');
  }
});

test('governance profile: one bad target poisons a batch of good ones', () => {
  throwsWith({ targetPaths: [REQ_PATH, RES_PATH, 'project/docs/governance/decision-log.md'] }, 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE');
});

// ------------------------------------------------------------ OPERATIONS

test('governance profile: anything outside the four operations is free-form editing', () => {
  throwsWith({ operation: 'REWRITE_SECTION' }, 'GOVERNANCE_OPERATION_NOT_LEVEL2');
  throwsWith({ operation: undefined }, 'GOVERNANCE_OPERATION_NOT_LEVEL2');
  for (const op of G.LEVEL2_OPERATIONS) assert.equal(run({ operation: op }).ok, true);
});

test('governance profile: a task that declares no targets does not run', () => {
  throwsWith({ targetPaths: [], spec: { taskId: 'GOV-01' } }, 'GOVERNANCE_TARGETS_UNDECLARED');
});

// ------------------------------------------------------------ AUTO-MERGE

test('governance profile: auto-merge stays denied, and a grant cannot grant it', () => {
  // The envelope authorizes auto-merge for orchestration-owned PRs under it or
  // under the OFFICE/COLLECTION standing grants. A governance task is neither.
  throwsWith(
    { standingGrant: grant({ mergePolicy: { method: 'SQUASH', autoMergeAuthorized: true, repositoryWideAutoMerge: false } }) },
    'GOVERNANCE_AUTO_MERGE_FORBIDDEN',
  );
  assert.equal(run().autoMerge, false);
});

test('governance profile: a grant that drops any denied capability is malformed', () => {
  for (const cap of G.DENIED_CAPABILITIES) {
    throwsWith(
      { standingGrant: grant({ deniedCapabilities: G.DENIED_CAPABILITIES.filter((c) => c !== cap) }) },
      'GOVERNANCE_DENIED_CAPABILITY_MISSING',
    );
  }
});

// ------------------------------------------------------------- AUTHORITY

test('governance profile: a grant that cannot point at the owner decision is self-authorizing', () => {
  throwsWith({ standingGrant: grant({ parentAuthorizationRef: { authorizationId: 'X', payloadSha256: 'nope' } }) }, 'GOVERNANCE_PARENT_REF_INVALID');
  throwsWith({ standingGrant: grant({ parentAuthorizationRef: {} }) }, 'GOVERNANCE_PARENT_REF_INVALID');
});

test('governance profile: another profile cannot borrow this validator', () => {
  throwsWith({ standingGrant: grant({ profile: 'BOUNDED_CODE_TASK' }) }, 'GOVERNANCE_PROFILE_MISMATCH');
});

// -------------------------------------------------------- THE SHIPPED GRANT

test('governance profile: the shipped grant validates a real request write and nothing more', () => {
  const shipped = JSON.parse(
    readRepo('project/docs/governance/coordination-v2/activation/STANDING-GRANT-MECHANICAL-GOVERNANCE-R01.json'),
  );
  const ok = G.validateGovernanceTask({
    standingGrant: shipped,
    spec: { taskId: 'GOV-SHIPPED-01' },
    operation: 'EXACT_APPEND_AT_DECLARED_ANCHOR',
    targetPaths: [REQ_PATH],
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.autoMerge, false);
  assert.equal(shipped.mergePolicy.autoMergeAuthorized, false);
  assert.equal(shipped.maxConcurrency, 1);

  assert.throws(
    () =>
      G.validateGovernanceTask({
        standingGrant: shipped,
        spec: { taskId: 'GOV-SHIPPED-02' },
        operation: 'EXACT_LITERAL_REPLACEMENT',
        targetPaths: ['project/docs/governance/decision-log.md'],
      }),
    (e) => e.code === 'GOVERNANCE_TARGET_OFF_QUEUE_SURFACE',
  );
});

test('governance profile: the shipped grant is not eligible for live program execution', () => {
  // MECHANICAL_GOVERNANCE is a profile, not a program. The eligibility authority
  // names programs; this grant must not appear there.
  const authority = JSON.parse(
    readRepo('project/docs/governance/coordination-v2/activation/program-eligibility-authority.json'),
  );
  assert.ok(
    !authority.eligiblePrograms.some((p) => p.programId === 'MECHANICAL_GOVERNANCE'),
    'a profile leaked into the program eligibility list',
  );
});
