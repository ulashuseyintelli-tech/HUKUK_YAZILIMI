'use strict';
/**
 * The DELIVERY_TRUTH standing grant, and the generator that produces it.
 *
 * These exist because of a specific mistake worth not repeating: the grant
 * shipped in #1744 with requiredIndependentReview false, admission refused R02
 * with INDEPENDENT_REVIEW_NOT_REQUIRED, and the cause was that an earlier fix
 * had been applied to the GENERATED json while the generator that rewrites it
 * still said false. The next regeneration silently undid the fix.
 *
 * So these tests exercise the GENERATOR, not just the committed file. A test
 * that only parsed the json would have passed on the day the defect was
 * introduced — the file was correct right up until it was regenerated.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const GENERATOR = path.join(__dirname, 'make-dogfood-authority.cjs');
const GRANT_REL = 'project/docs/governance/coordination-v2/activation/STANDING-GRANT-DELIVERY-TRUTH-DOGFOOD-R01.json';
const REQUEST_REL = 'project/docs/governance/coordination-v2/requests/GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R02.request.json';

const readGrant = () => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, GRANT_REL), 'utf8'));

test('DG01  the committed DELIVERY_TRUTH grant requires independent review', () => {
  const g = readGrant();
  assert.equal(g.requiredIndependentReview, true, 'admission refuses this grant without it');
  // The narrowness that makes a task-bounded auto-merge grant safe at all.
  assert.equal(g.maxConcurrency, 1);
  assert.equal(g.mergePolicy.method, 'SQUASH');
  assert.equal(g.mergePolicy.repositoryWideAutoMerge, false);
  assert.deepEqual(g.allowedExecutorLanes, ['CODEX_LOCAL']);
  assert.deepEqual(g.allowedPathRoots, ['project/scripts/orchestration-v2/delivery/']);
  assert.equal(g.ciPolicy.requireTerminalSuccess, true);
  assert.ok(g.revocationPath && g.killSwitchPath);
});

test('DG02  the GENERATOR emits it too, and regenerating is a no-op', () => {
  // The one that would have caught #1744. Run the real generator and compare
  // its output to what is committed — correcting the output while leaving the
  // generator wrong is a fix with a timer on it.
  const before = fs.readFileSync(path.join(REPO_ROOT, GRANT_REL), 'utf8');
  const requestBefore = fs.readFileSync(path.join(REPO_ROOT, REQUEST_REL), 'utf8');

  const run = spawnSync(process.execPath, [GENERATOR], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000 });
  assert.equal(run.status, 0, run.stderr);

  const after = fs.readFileSync(path.join(REPO_ROOT, GRANT_REL), 'utf8');
  try {
    assert.equal(JSON.parse(after).requiredIndependentReview, true, 'the generator source still says false');
    assert.equal(after, before, 'committed standing grant is not what the generator produces');

    const again = spawnSync(process.execPath, [GENERATOR], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000 });
    assert.equal(again.status, 0, again.stderr);
    assert.equal(fs.readFileSync(path.join(REPO_ROOT, GRANT_REL), 'utf8'), after, 'regeneration is not idempotent');
  } finally {
    // The generator also rewrites artefacts carrying a time-varying expiry;
    // this test is about the grant, so the rest is restored rather than left
    // dirty for whatever runs next.
    fs.writeFileSync(path.join(REPO_ROOT, GRANT_REL), before, 'utf8');
    fs.writeFileSync(path.join(REPO_ROOT, REQUEST_REL), requestBefore, 'utf8');
    spawnSync('git', ['checkout', '--', 'project/docs/governance/coordination-v2/task-plans/DOGFOOD-R02/'], { cwd: REPO_ROOT });
  }
});

test('DG03  a grant that does not require independent review is refused', () => {
  const authority = require('../orchestrator/authority.cjs');
  const g = readGrant();
  const spec = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'project/docs/governance/coordination-v2/task-plans/DOGFOOD-R02/plan.v2.json'), 'utf8'),
  );
  const weakened = Object.assign({}, g, { requiredIndependentReview: false });
  assert.throws(
    () =>
      authority.validateAgainstStandingGrant({
        standingGrant: weakened,
        spec,
        taskClass: 'BOUNDED_CODE_FIX',
        executorLane: 'CODEX_LOCAL',
        revoked: false,
        killSwitchEngaged: false,
        nowMs: Date.now(),
      }),
    (e) => e.code === 'INDEPENDENT_REVIEW_NOT_REQUIRED',
    'the exact refusal that stopped R02',
  );
});

test('DG04  the committed R02 request is admissible against the corrected grant', () => {
  // End to end through the real resolver and the real admission gate, against
  // the files as committed. This is the condition PR 5 exists to restore.
  const requestMod = require('../service/request.cjs');
  const admissionMod = require('../orchestrator/admission.cjs');

  const resolved = requestMod.load({
    repoCwd: REPO_ROOT,
    requestPath: REQUEST_REL,
    // The committed-artefact regime is exercised by the artefact lifecycle
    // suite; here the subject is the grant, and requiring origin/main would
    // make this test fail on a branch for an unrelated reason.
    verifyArtefacts: false,
  });
  assert.equal(resolved.request.requireCommittedArtefacts, true, 'the request must still ask for committed artefacts');

  const verdict = admissionMod.evaluate({
    manifest: resolved.manifest,
    standingGrant: resolved.standingGrant,
    spec: resolved.spec,
    programId: resolved.request.programId,
    taskClass: resolved.request.taskClass,
    executorLane: resolved.request.executorLane,
    revoked: false,
    killSwitchEngaged: false,
    nowMs: Date.now(),
  });
  assert.equal(verdict.admissible, true, verdict.refusal + ' ' + (verdict.detail || ''));
  assert.equal(verdict.program, 'DELIVERY_TRUTH');
});
