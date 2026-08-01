'use strict';

const assert = require('node:assert');
const test = require('node:test');
const taxonomy = require('./pr-status-taxonomy.cjs');

const running = () => [
  { name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
  { name: 'Test Suite', status: 'IN_PROGRESS', conclusion: null },
];
const green = () => [
  { name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
  { name: 'Architectural Guardrails', status: 'COMPLETED', conclusion: 'SUCCESS' },
];
const red = () => [
  { name: 'Architectural Guardrails', status: 'COMPLETED', conclusion: 'FAILURE' },
];

test('taxonomy exposes exactly the eight canonical tokens', () => {
  assert.deepEqual([...taxonomy.TOKEN_NAMES].sort(), [
    'BLOCKED_EXACT',
    'CHANGES_REQUIRED',
    'CI_FIX_REQUIRED',
    'CLOSED_SUPERSEDED',
    'MERGED',
    'OTHER_SESSION',
    'WAITING_DEPENDENCY',
    'WAITING_FOR_CI',
  ]);
});

test('green PR with author-applicable changes is CHANGES_REQUIRED, not blocked', () => {
  const r = taxonomy.classify({
    state: 'OPEN', statusCheckRollup: green(), changesRequested: true,
  });
  assert.equal(r.token, 'CHANGES_REQUIRED');
});

test('the same PR IS blocked while an owner decision is genuinely pending', () => {
  const r = taxonomy.classify({
    state: 'OPEN', statusCheckRollup: green(),
    changesRequested: true, ownerDecisionPending: true,
  });
  assert.equal(r.token, 'BLOCKED_EXACT');
  assert.match(r.reason, /MATERIAL_ALTERNATIVE_REQUIRES_OWNER/);
});

test('BLOCKED_EXACT is rejected once the owner decision is made', () => {
  // The exact error this taxonomy exists to stop, applied to its own PR.
  assert.match(
    String(taxonomy.verifyClaim('BLOCKED_EXACT', {
      state: 'OPEN', statusCheckRollup: green(), changesRequested: true,
    })),
    /report CHANGES_REQUIRED/);
});

test('CHANGES_REQUIRED is rejected while an owner decision is pending', () => {
  assert.match(
    String(taxonomy.verifyClaim('CHANGES_REQUIRED', {
      state: 'OPEN', statusCheckRollup: green(),
      changesRequested: true, ownerDecisionPending: true,
    })),
    /owner decision is pending/);
});

test('external gates still outrank author-applicable changes', () => {
  // A running pipeline and an active incident are not the author's to clear.
  assert.equal(taxonomy.classify({
    state: 'OPEN', statusCheckRollup: running(), changesRequested: true,
  }).token, 'WAITING_FOR_CI');
  assert.equal(taxonomy.classify({
    state: 'OPEN', statusCheckRollup: green(), changesRequested: true, incident: relock(),
  }).token, 'WAITING_DEPENDENCY');
});

test('BLOCKED_EXACT admissible causes stay narrow', () => {
  assert.deepEqual(taxonomy.BLOCKED_EXACT_ADMISSIBLE_CAUSES, [
    'AUTHORITY_NOT_EXTERNALLY_OBTAINABLE',
    'REAL_SAME_FILE_COMPETING_WRITER',
    'UNRESOLVABLE_MERGE_CONFLICT',
    'MATERIAL_ALTERNATIVE_REQUIRES_OWNER',
  ]);
});

// ---------------------------------------------------------------- classify --

test('running checks classify as WAITING_FOR_CI, not a blocker', () => {
  assert.equal(taxonomy.classify({ state: 'OPEN', statusCheckRollup: running() }).token,
    'WAITING_FOR_CI');
});

test('a running pipeline outranks a locked base branch', () => {
  // A lock may lift before CI finishes; reporting it as blocked would hide the
  // fact that the work itself is still progressing.
  assert.equal(
    taxonomy.classify({ state: 'OPEN', statusCheckRollup: running(), lockedBranch: true }).token,
    'WAITING_FOR_CI');
});

test('failing check classifies as CI_FIX_REQUIRED', () => {
  assert.equal(taxonomy.classify({ state: 'OPEN', statusCheckRollup: red() }).token,
    'CI_FIX_REQUIRED');
});

test('locked base branch with green CI is a real BLOCKED_EXACT', () => {
  const r = taxonomy.classify({ state: 'OPEN', statusCheckRollup: green(), lockedBranch: true });
  assert.equal(r.token, 'BLOCKED_EXACT');
  assert.match(r.reason, /AUTHORITY_NOT_EXTERNALLY_OBTAINABLE/);
});

test('merge conflict is a real BLOCKED_EXACT', () => {
  const r = taxonomy.classify({ state: 'OPEN', statusCheckRollup: green(), mergeable: 'CONFLICTING' });
  assert.equal(r.token, 'BLOCKED_EXACT');
  assert.match(r.reason, /UNRESOLVABLE_MERGE_CONFLICT/);
});

test('open prerequisite classifies as WAITING_DEPENDENCY', () => {
  assert.equal(
    taxonomy.classify({ state: 'OPEN', statusCheckRollup: green(), dependencyOpen: true }).token,
    'WAITING_DEPENDENCY');
});

test('a fully green unblocked PR is to be merged, not reported', () => {
  assert.equal(taxonomy.classify({ state: 'OPEN', statusCheckRollup: green() }).token, 'MERGED');
});

test('merged and closed states classify terminally', () => {
  assert.equal(taxonomy.classify({ state: 'MERGED' }).token, 'MERGED');
  assert.equal(taxonomy.classify({ state: 'CLOSED' }).token, 'CLOSED_SUPERSEDED');
});

// -------------------------------------------------------------- verifyClaim --

test('WAITING_FOR_CI cannot park a green PR', () => {
  assert.match(
    String(taxonomy.verifyClaim('WAITING_FOR_CI', { state: 'OPEN', statusCheckRollup: green() })),
    /no check is running/);
  assert.equal(
    taxonomy.verifyClaim('WAITING_FOR_CI', { state: 'OPEN', statusCheckRollup: running() }),
    null);
});

test('CI_FIX_REQUIRED cannot be claimed while checks are still running', () => {
  assert.match(
    String(taxonomy.verifyClaim('CI_FIX_REQUIRED', { state: 'OPEN', statusCheckRollup: running() })),
    /still running/);
  assert.equal(
    taxonomy.verifyClaim('CI_FIX_REQUIRED', { state: 'OPEN', statusCheckRollup: red() }),
    null);
});

test('BLOCKED_EXACT cannot be claimed while checks are still running', () => {
  assert.match(
    String(taxonomy.verifyClaim('BLOCKED_EXACT', { state: 'OPEN', statusCheckRollup: running() })),
    /still running/);
  assert.equal(
    taxonomy.verifyClaim('BLOCKED_EXACT', { state: 'OPEN', statusCheckRollup: green() }),
    null);
});

test('claimed token must match observed GitHub state', () => {
  assert.match(
    String(taxonomy.verifyClaim('MERGED', { state: 'OPEN', statusCheckRollup: green() })),
    /DISPOSITION_MISMATCH/);
  assert.equal(taxonomy.verifyClaim('MERGED', { state: 'MERGED' }), null);
});

test('unknown tokens are rejected', () => {
  assert.match(String(taxonomy.verifyClaim('LGTM', { state: 'OPEN' })), /unknown disposition token/);
});

// ------------------------------------------------------------ check helpers --

// ----------------------------------------------- incident deduplication --

const relock = () => taxonomy.declareIncident('CONTROL_PLANE_RELOCK_INCIDENT', {
  cause: 'AUTHORITY_NOT_EXTERNALLY_OBTAINABLE',
  evidence: 'GET .../branches/main/protection -> lock_branch=true',
});

test('one incident carries the blocker; stalled PRs defer to it', () => {
  const inc = relock();
  assert.equal(inc.token, 'BLOCKED_EXACT');
  // Six green PRs stalled by ONE lock must not produce six BLOCKED_EXACT lines.
  for (const n of [2072, 2075, 2077]) {
    const r = taxonomy.classify({
      state: 'OPEN', statusCheckRollup: green(), lockedBranch: true, incident: inc,
    });
    assert.equal(r.token, 'WAITING_DEPENDENCY', `#${n} should defer to the incident`);
    assert.equal(r.incidentId, 'CONTROL_PLANE_RELOCK_INCIDENT');
  }
});

test('BLOCKED_EXACT is rejected on a PR while its incident is active', () => {
  assert.match(
    String(taxonomy.verifyClaim('BLOCKED_EXACT', {
      state: 'OPEN', statusCheckRollup: green(), incident: relock(),
    })),
    /report WAITING_DEPENDENCY against the incident/);
});

test('an undeclared lock still blocks, and asks for an incident', () => {
  const r = taxonomy.classify({ state: 'OPEN', statusCheckRollup: green(), lockedBranch: true });
  assert.equal(r.token, 'BLOCKED_EXACT');
  assert.match(r.reason, /declare a CONTROL_PLANE_RELOCK_INCIDENT/);
});

test('WAITING_DEPENDENCY accepts an incident ID and requires it to be active', () => {
  const inc = relock();
  assert.equal(taxonomy.verifyClaim('WAITING_DEPENDENCY', { state: 'OPEN', incident: inc }), null);
  const cleared = taxonomy.declareIncident('CONTROL_PLANE_RELOCK_INCIDENT', {
    cause: 'AUTHORITY_NOT_EXTERNALLY_OBTAINABLE', evidence: 'lock_branch=false', active: false,
  });
  assert.match(
    String(taxonomy.verifyClaim('WAITING_DEPENDENCY', {
      state: 'OPEN', dependencyRef: 'CONTROL_PLANE_RELOCK_INCIDENT', incident: cleared,
    })),
    /is not active/);
});

test('WAITING_DEPENDENCY without any reference is rejected', () => {
  assert.match(String(taxonomy.verifyClaim('WAITING_DEPENDENCY', { state: 'OPEN' })),
    /without a PR, task or incident ID/);
});

test('incidents require an admissible cause and read-only evidence', () => {
  assert.throws(() => taxonomy.declareIncident('X', { cause: 'BECAUSE', evidence: 'e' }),
    /cause must be one of/);
  assert.throws(() => taxonomy.declareIncident('X', { cause: 'UNRESOLVABLE_MERGE_CONFLICT' }),
    /requires read-only evidence/);
});

test('a running pipeline still outranks an active incident', () => {
  // The PR is progressing; the incident may clear before CI finishes.
  assert.equal(
    taxonomy.classify({ state: 'OPEN', statusCheckRollup: running(), incident: relock() }).token,
    'WAITING_FOR_CI');
});

test('unknown check shapes are not treated as terminal', () => {
  // Fail-closed direction: counting an unrecognised shape as finished would let
  // a green-looking PR be parked as WAITING_FOR_CI.
  assert.equal(taxonomy.isNonTerminalCheck({}), false);
  assert.equal(taxonomy.isNonTerminalCheck({ status: 'QUEUED' }), true);
  assert.equal(taxonomy.isNonTerminalCheck({ state: 'PENDING' }), true);
  assert.equal(taxonomy.isFailingCheck({ conclusion: 'TIMED_OUT' }), true);
  assert.equal(taxonomy.isFailingCheck({ conclusion: 'SUCCESS' }), false);
});
