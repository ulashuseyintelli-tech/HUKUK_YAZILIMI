'use strict';
/**
 * The executor must be told who it is working for by the machinery, not by a
 * line somebody typed three revisions ago.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const P = require('./prompt-identity.cjs');

const ID = 'CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04';

test('a prompt declaring a different task is refused, not silently overridden', () => {
  // The measured defect. The canary prompt opened with R01 for three
  // revisions; the plan said R03. The executor read both, could not tell which
  // had authority, and refused the work — correctly.
  //
  // Stapling a correct header onto a contradicting body would leave the
  // executor adjudicating the same disagreement, one line further down.
  const body = 'GOREV: CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R01\n\nDo the thing.\n';
  assert.throws(
    () => P.composePrompt({ body, taskId: ID }),
    (e) => e.code === 'PROMPT_TASK_IDENTITY_CONFLICT' && /R01/.test(e.detail) && /R04/.test(e.detail),
  );
});

test('the diacritic and English spellings are caught too', () => {
  // The repository writes Turkish both ways, and an identity that hides behind
  // an ö is still an identity.
  for (const label of ['GÖREV', 'TASK', 'TASK ID', 'taskid']) {
    assert.throws(
      () => P.composePrompt({ body: label + ': OTHER-PROGRAM-R09\n', taskId: ID }),
      (e) => e.code === 'PROMPT_TASK_IDENTITY_CONFLICT',
      label + ' must be caught',
    );
  }
});

test('prose that merely mentions another task is allowed', () => {
  // Discussing a task is not claiming to be one. A guard that cannot tell the
  // difference makes supersession notes and cross-references unwritable, and
  // the first person to hit that will delete the guard rather than the note.
  const body =
    'Bu is, CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R03 gorevinin yerine gecer.\n' +
    'Ilgili PR: #1750. Onceki deneme GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R01 ile catisti.\n';
  const out = P.composePrompt({ body, taskId: ID });
  assert.match(out, /gorevinin yerine gecer/);
});

test('a body declaring the CORRECT id is allowed and left alone', () => {
  // Allowed because it is not wrong. Left alone because rewriting an
  // authorized artefact to agree with the runtime creates a second source of
  // truth that merely happens to match today.
  const body = 'GOREV: ' + ID + '\n\nDo the thing.\n';
  const out = P.composePrompt({ body, taskId: ID });
  assert.ok(out.endsWith(body), 'the body is delivered verbatim');
});

test('the identity block carries what the runtime knows', () => {
  const out = P.composePrompt({
    body: 'Do the thing.\n',
    taskId: ID,
    programId: 'OFFICE',
    attempt: 4,
    lane: 'CODEX_LOCAL',
    taskSpecSha256: 'a'.repeat(64),
    targetPaths: ['project/docs/governance/coordination-v2/evidence/'],
  });
  assert.match(out, /TASK ID +: CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04/);
  assert.match(out, /PROGRAM +: OFFICE/);
  assert.match(out, /ATTEMPT +: 4/);
  assert.match(out, /EXECUTOR LANE +: CODEX_LOCAL/);
  assert.match(out, /PLAN HASH +: a{64}/);
  assert.match(out, /project\/docs\/governance\/coordination-v2\/evidence\//);
  // And it says which source wins, because the executor has to arbitrate when
  // a body it was given years ago says something else.
  assert.match(out, /this block is correct/);
  assert.ok(out.indexOf('Do the thing.') > out.indexOf('TASK ID'), 'identity comes first');
});

test('a field with no authoritative value is omitted rather than invented', () => {
  // An executor reading "attempt: 1" on the fourth attempt has been lied to;
  // one reading nothing has merely not been told.
  const out = P.composePrompt({ body: 'x', taskId: ID, lane: 'CODEX_LOCAL' });
  assert.doesNotMatch(out, /ATTEMPT/);
  assert.doesNotMatch(out, /PROGRAM/);
  assert.doesNotMatch(out, /PLAN HASH/);
  assert.doesNotMatch(out, /undefined|null|unknown/i);
  assert.match(out, /EXECUTOR LANE +: CODEX_LOCAL/);
});

test('every conflicting declaration is reported, not just the first', () => {
  const body = 'GOREV: A-PROGRAM-R01\nTASK: B-PROGRAM-R02\n';
  assert.throws(
    () => P.assertIdentityConsistent(body, ID),
    (e) => /A-PROGRAM-R01/.test(e.detail) && /B-PROGRAM-R02/.test(e.detail),
  );
});

test('the canary prompt in the repository no longer declares an identity', () => {
  // The artefact this defect lived in. Asserted against the real file, because
  // a unit test of the checker proves the checker works and nothing about the
  // prompt that is actually shipped.
  const fs = require('fs');
  const path = require('path');
  const p = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'docs',
    'governance',
    'coordination-v2',
    'task-plans',
    'CANARY',
    'executor-prompt.md',
  );
  const body = fs.readFileSync(p, 'utf8');
  assert.deepEqual(P.declaredIdentities(body), [], 'the prompt file declares no task id');
});
