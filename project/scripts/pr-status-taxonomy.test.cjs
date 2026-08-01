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

test('taxonomy exposes exactly the seven canonical tokens', () => {
  assert.deepEqual([...taxonomy.TOKEN_NAMES].sort(), [
    'BLOCKED_EXACT',
    'CI_FIX_REQUIRED',
    'CLOSED_SUPERSEDED',
    'MERGED',
    'OTHER_SESSION',
    'WAITING_DEPENDENCY',
    'WAITING_FOR_CI',
  ]);
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

test('unknown check shapes are not treated as terminal', () => {
  // Fail-closed direction: counting an unrecognised shape as finished would let
  // a green-looking PR be parked as WAITING_FOR_CI.
  assert.equal(taxonomy.isNonTerminalCheck({}), false);
  assert.equal(taxonomy.isNonTerminalCheck({ status: 'QUEUED' }), true);
  assert.equal(taxonomy.isNonTerminalCheck({ state: 'PENDING' }), true);
  assert.equal(taxonomy.isFailingCheck({ conclusion: 'TIMED_OUT' }), true);
  assert.equal(taxonomy.isFailingCheck({ conclusion: 'SUCCESS' }), false);
});
