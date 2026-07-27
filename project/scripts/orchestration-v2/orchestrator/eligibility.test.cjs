'use strict';
/**
 * Eligibility derivation.
 *
 * The rule these tests defend is the owner's own correction: a manifest is not
 * made ELIGIBLE by hand. Everything below is a way that hand-authoring, or its
 * mechanical equivalents, must fail.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const E = require('./eligibility.cjs');

const ACT = 'project/docs/governance/coordination-v2/activation';
const ENVELOPE = ACT + '/PARENT-AUTHORIZATION-ENVELOPE.md';
const EXCERPT = 'OFFICE      kontrollu canli calistirmaya acilir';

function repoRoot() {
  return path.join(__dirname, '..', '..', '..', '..');
}
function readFromRepo(rel) {
  return fs.readFileSync(path.join(repoRoot(), rel), 'utf8');
}

function authorityRecord(over) {
  return Object.assign(
    {
      schemaVersion: 1,
      authorizationId: 'OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01',
      ownerDecisionEvidence: {
        sourcePath: ENVELOPE,
        exactExcerpt: EXCERPT,
        excerptSha256: E.sha256(EXCERPT),
      },
      eligiblePrograms: [
        { programId: 'OFFICE', standingGrantRef: ACT + '/STANDING-GRANT-OFFICE-LIVE-R01.json' },
        { programId: 'COLLECTION', standingGrantRef: ACT + '/STANDING-GRANT-COLLECTION-LIVE-R01.json' },
      ],
    },
    over || {},
  );
}

const PROGRAM = {
  OFFICE: { programId: 'OFFICE', taxonomyLevel: 'PROGRAM', authorizationState: 'OWNER_GATED' },
  COLLECTION: { programId: 'COLLECTION', taxonomyLevel: 'PROGRAM', authorizationState: 'OWNER_GATED' },
  CLIENT: { programId: 'CLIENT', taxonomyLevel: 'PROGRAM', authorizationState: 'NOT_AUTHORIZED' },
  RECEIVABLE: { programId: 'RECEIVABLE', taxonomyLevel: 'UNKNOWN', authorizationState: 'NOT_AUTHORIZED' },
};

function throwsWith(fn, code) {
  assert.throws(fn, (e) => e.code === code, 'expected ' + code);
}

// ------------------------------------------------------ AUTHORITY EVIDENCE

test('eligibility: the authority record is checked against the repository, not believed', () => {
  const r = E.verifyAuthorityRecord({ authority: authorityRecord(), readFile: readFromRepo });
  assert.equal(r.verified, true);
  assert.equal(r.authorizationId, 'OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01');
});

test('eligibility: a record citing itself is not evidence', () => {
  // A self-authored document claiming owner approval is never evidence of owner
  // approval. This is the exact failure this layer exists to prevent.
  throwsWith(
    () =>
      E.verifyAuthorityRecord({
        authority: authorityRecord({
          ownerDecisionEvidence: {
            sourcePath: ACT + '/PROGRAM-ELIGIBILITY-AUTHORITY.md',
            exactExcerpt: EXCERPT,
            excerptSha256: E.sha256(EXCERPT),
          },
        }),
        readFile: readFromRepo,
      }),
    'ELIGIBILITY_EVIDENCE_SELF_REFERENTIAL',
  );
});

test('eligibility: an excerpt that is not in the cited file fails', () => {
  throwsWith(
    () =>
      E.verifyAuthorityRecord({
        authority: authorityRecord({
          ownerDecisionEvidence: {
            sourcePath: ENVELOPE,
            exactExcerpt: 'DEBTOR kontrollu canli calistirmaya acilir',
            excerptSha256: E.sha256('DEBTOR kontrollu canli calistirmaya acilir'),
          },
        }),
        readFile: readFromRepo,
      }),
    'ELIGIBILITY_EXCERPT_NOT_FOUND',
  );
});

test('eligibility: an excerpt whose digest does not match it fails before the file is read', () => {
  throwsWith(
    () =>
      E.verifyAuthorityRecord({
        authority: authorityRecord({
          ownerDecisionEvidence: { sourcePath: ENVELOPE, exactExcerpt: EXCERPT, excerptSha256: 'f'.repeat(64) },
        }),
        readFile: () => {
          throw new Error('the file must not be read once the digest is already wrong');
        },
      }),
    'ELIGIBILITY_EXCERPT_DIGEST_MISMATCH',
  );
});

test('eligibility: an eligible program with no standing grant is an open door with no frame', () => {
  throwsWith(
    () =>
      E.verifyAuthorityRecord({
        authority: authorityRecord({ eligiblePrograms: [{ programId: 'OFFICE', standingGrantRef: '' }] }),
        readFile: readFromRepo,
      }),
    'ELIGIBILITY_PROGRAM_WITHOUT_GRANT',
  );
});

// ---------------------------------------------------------- THE CONJUNCTION

test('eligibility: naming a program is necessary and not sufficient', () => {
  const a = authorityRecord();
  assert.equal(E.deriveForProgram(PROGRAM.OFFICE, a).eligibility, 'ELIGIBLE');

  // Named, but its own governance denies implementation. The envelope grants a
  // lane, not a mandate.
  const namedButDenied = authorityRecord({
    eligiblePrograms: [{ programId: 'CLIENT', standingGrantRef: 'x.json' }],
  });
  const d = E.deriveForProgram(PROGRAM.CLIENT, namedButDenied);
  assert.equal(d.eligibility, 'DENIED');
  assert.equal(d.reason, 'PROGRAM_GOVERNANCE_NOT_AUTHORIZED');
});

test('eligibility: a program the authority does not name stays denied', () => {
  const d = E.deriveForProgram({ programId: 'DEBTOR', taxonomyLevel: 'PROGRAM', authorizationState: 'OWNER_GATED' }, authorityRecord());
  assert.equal(d.eligibility, 'DENIED');
  assert.equal(d.reason, 'NOT_NAMED_BY_AUTHORITY');
});

test('eligibility: OWNER_GATED is not a denial — it is what a standing grant is for', () => {
  // Treating "awaiting owner selection of the next unit" as a denial would make
  // the standing grant model unreachable, since that is the state both opened
  // programs are actually in.
  assert.equal(E.BLOCKING_AUTHORIZATION_STATES.indexOf('OWNER_GATED'), -1);
  assert.equal(E.deriveForProgram(PROGRAM.OFFICE, authorityRecord()).eligibility, 'ELIGIBLE');
});

test('eligibility: an unresolved taxonomy is UNKNOWN, not resolved by omission', () => {
  const a = authorityRecord({ eligiblePrograms: [{ programId: 'RECEIVABLE', standingGrantRef: 'x.json' }] });
  const permissive = Object.assign({}, PROGRAM.RECEIVABLE, { authorizationState: 'OWNER_GATED' });
  const d = E.deriveForProgram(permissive, a);
  assert.equal(d.eligibility, 'UNKNOWN');
  assert.equal(d.reason, 'TAXONOMY_UNRESOLVED');
});

// -------------------------------------------------------------- MANIFEST

test('eligibility: the derived manifest keeps saying it is derived', () => {
  const manifest = { schemaVersion: 1, authority: 'DERIVED / NON-AUTHORITATIVE', programs: [PROGRAM.OFFICE, PROGRAM.COLLECTION, PROGRAM.CLIENT] };
  const out = E.deriveManifest({ manifest, authority: authorityRecord(), readFile: readFromRepo, authorityPath: ACT + '/PROGRAM-ELIGIBILITY-AUTHORITY.md' });
  assert.equal(out.manifest.authority, 'DERIVED / NON-AUTHORITATIVE');
  assert.equal(out.manifest.eligibilityDerivedFrom.authorizationId, 'OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01');
});

test('eligibility: every program carries the reason it got its verdict', () => {
  const manifest = { programs: [PROGRAM.OFFICE, PROGRAM.COLLECTION, PROGRAM.CLIENT] };
  const out = E.deriveManifest({ manifest, authority: authorityRecord(), readFile: readFromRepo });
  for (const p of out.manifest.programs) {
    assert.ok(p.liveExecutionEligibilityDerivation.reason, p.programId + ' has no stated reason');
    assert.ok(E.ELIGIBILITY.indexOf(p.liveExecutionEligibility) !== -1);
  }
});

test('eligibility: an authority naming a program nobody has heard of is caught, not ignored', () => {
  // The quiet failure mode: the owner believes a program is open and nothing
  // ever opens it, because the name was a typo.
  throwsWith(
    () =>
      E.deriveManifest({
        manifest: { programs: [PROGRAM.OFFICE] },
        authority: authorityRecord({ eligiblePrograms: [{ programId: 'OFFICE_TYPO', standingGrantRef: 'x.json' }] }),
        readFile: readFromRepo,
      }),
    'ELIGIBILITY_AUTHORITY_NAMES_UNKNOWN_PROGRAM',
  );
});

// ------------------------------------------------------- THE SHIPPED FILES

test('eligibility: the shipped authority record verifies against the shipped envelope', () => {
  const record = JSON.parse(readFromRepo(ACT + '/program-eligibility-authority.json'));
  const r = E.verifyAuthorityRecord({ authority: record, readFile: readFromRepo });
  assert.equal(r.verified, true);
});

test('eligibility: the committed manifest is exactly what the deriver produces', () => {
  // If these differ, someone edited the manifest by hand — which is the thing
  // this whole module exists to make impossible to do quietly.
  const record = JSON.parse(readFromRepo(ACT + '/program-eligibility-authority.json'));
  const committed = JSON.parse(readFromRepo('project/docs/governance/coordination-v2/programs.manifest.json'));
  const derived = E.deriveManifest({
    manifest: committed,
    authority: record,
    readFile: readFromRepo,
    authorityPath: ACT + '/PROGRAM-ELIGIBILITY-AUTHORITY.md',
  }).manifest;
  assert.deepEqual(derived, committed, 'programs.manifest.json is not the derivation of its own authority');
});

test('eligibility: exactly the two opened programs are eligible, and the other four are not', () => {
  const committed = JSON.parse(readFromRepo('project/docs/governance/coordination-v2/programs.manifest.json'));
  const eligible = committed.programs.filter((p) => p.liveExecutionEligibility === 'ELIGIBLE').map((p) => p.programId);
  assert.deepEqual(eligible.sort(), ['COLLECTION', 'OFFICE']);
  assert.equal(committed.programs.length, 6);
});

// ------------------------------------------------------- ADMISSION (WP07)

// Three gates existed with no caller in common. These tests are about the
// JOINING: the order they run in, that a refusal names the real reason, and
// that a refused task leaves nothing behind.

const A = require('./admission.cjs');
const QforA = require('./queue.cjs');
const fsA = require('fs');
const osA = require('os');
const pathA = require('path');

const ADM_ACT = 'project/docs/governance/coordination-v2/activation';

function admRepoRead(rel) {
  return fsA.readFileSync(pathA.join(__dirname, '..', '..', '..', '..', rel), 'utf8');
}
function admGrant(file) {
  return JSON.parse(admRepoRead(ADM_ACT + '/' + file));
}
function admManifest() {
  return JSON.parse(admRepoRead('project/docs/governance/coordination-v2/programs.manifest.json'));
}
function admQueue() {
  return QforA.createQueue(fsA.mkdtempSync(pathA.join(osA.tmpdir(), 'gov-adm-')));
}
function admSpec(grant, over) {
  return Object.assign(
    {
      taskId: 'ADM-TEST-01',
      boundaryPolicy: { allowedRoots: [grant.allowedPathRoots[0] + '__tests__/'], maxChangedFiles: 2 },
    },
    over || {},
  );
}
function admOpts(grant, over) {
  return Object.assign(
    {
      manifest: admManifest(),
      standingGrant: grant,
      spec: admSpec(grant),
      taskClass: 'TEST_ONLY_CHARACTERIZATION',
      executorLane: 'CLAUDE_LOCAL',
      nowMs: Date.now(),
    },
    over || {},
  );
}

test('admission: an OFFICE plan inside every limit is admissible and enqueues', () => {
  const g = admGrant('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const v = A.evaluate(admOpts(g));
  assert.equal(v.admissible, true);
  assert.equal(v.program, 'OFFICE');

  const q = admQueue();
  const entry = A.admit(Object.assign(admOpts(g), { queue: q }));
  assert.equal(entry.state, 'QUEUED');
  assert.equal(entry.programId, 'OFFICE');
  assert.equal(entry.standingGrantId, g.standingGrantId);
});

test('admission: the kill switch answers before anything else is even looked at', () => {
  const v = A.evaluate({ killSwitchEngaged: true });
  assert.equal(v.refusal, 'KILL_SWITCH_ENGAGED');
  // No grant, no manifest, no spec supplied — and it still answers correctly,
  // which is the property that makes the switch trustworthy.
});

test('admission: a program the manifest does not call ELIGIBLE is refused by name', () => {
  const g = admGrant('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const manifest = admManifest();
  for (const p of manifest.programs) if (p.programId === 'OFFICE') p.liveExecutionEligibility = 'DENIED';
  const v = A.evaluate(admOpts(g, { manifest }));
  assert.equal(v.refusal, 'PROGRAM_NOT_ELIGIBLE');
  assert.match(v.detail, /OFFICE is DENIED/);
});

test('admission: a manifest that was never derived cannot answer the eligibility question', () => {
  // Reading a hand-set field would make the whole derivation ornamental.
  const g = admGrant('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const manifest = admManifest();
  delete manifest.eligibilityDerivedFrom;
  assert.equal(A.evaluate(admOpts(g, { manifest })).refusal, 'MANIFEST_NOT_DERIVED');
});

test('admission: a grant refusal surfaces the grant\'s own code, not a generic one', () => {
  const g = admGrant('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const outside = admSpec(g, { boundaryPolicy: { allowedRoots: ['project/apps/api/src/modules/debtor/'], maxChangedFiles: 1 } });
  assert.equal(A.evaluate(admOpts(g, { spec: outside })).refusal, 'BOUNDARY_EXCEEDS_STANDING_GRANT');
  assert.equal(A.evaluate(admOpts(g, { taskClass: 'DECISION_LOG_APPEND' })).refusal, 'TASK_CLASS_NOT_GRANTED');
  assert.equal(A.evaluate(admOpts(g, { revoked: true })).refusal, 'STANDING_GRANT_REVOKED');
});

test('admission: a refused task leaves nothing in the queue to clean up', () => {
  // The write is last on purpose: a half-admitted entry is something recovery
  // would then have to reason about.
  const g = admGrant('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const q = admQueue();
  const bad = Object.assign(admOpts(g, { taskClass: 'DECISION_LOG_APPEND' }), { queue: q });
  assert.throws(() => A.admit(bad), (e) => e.code === 'TASK_CLASS_NOT_GRANTED');
  assert.equal(q.list().length, 0);
});

test('admission: admitting the same task twice yields one entry', () => {
  const g = admGrant('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const q = admQueue();
  const opts = Object.assign(admOpts(g), { queue: q });
  const first = A.admit(opts);
  const second = A.admit(Object.assign(admOpts(g), { queue: q }));
  assert.equal(second.entryId, first.entryId);
  assert.equal(second.deduplicated, true);
  assert.equal(q.list().length, 1);
});

test('admission: neither opened program can be used to run the other', () => {
  const office = admGrant('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const collection = admGrant('STANDING-GRANT-COLLECTION-LIVE-R01.json');
  const crossed = admSpec(collection);
  assert.equal(A.evaluate(admOpts(office, { spec: crossed })).refusal, 'BOUNDARY_EXCEEDS_STANDING_GRANT');
  assert.equal(
    A.evaluate(admOpts(collection, { spec: admSpec(office) })).refusal,
    'BOUNDARY_EXCEEDS_STANDING_GRANT',
  );
});

test('admission: neither opened program can reach the control plane', () => {
  for (const file of ['STANDING-GRANT-OFFICE-LIVE-R01.json', 'STANDING-GRANT-COLLECTION-LIVE-R01.json']) {
    const g = admGrant(file);
    const spec = admSpec(g, { boundaryPolicy: { allowedRoots: ['project/scripts/orchestration-v2/'], maxChangedFiles: 1 } });
    assert.equal(A.evaluate(admOpts(g, { spec })).refusal, 'BOUNDARY_EXCEEDS_STANDING_GRANT');
  }
});

test('admission: evaluate never writes, so a dry run stays a dry run', () => {
  const g = admGrant('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const q = admQueue();
  A.evaluate(Object.assign(admOpts(g), { queue: q }));
  A.evaluate(Object.assign(admOpts(g, { taskClass: 'DECISION_LOG_APPEND' }), { queue: q }));
  assert.equal(q.list().length, 0);
});

test('admission: two programs share ONE slot, and the second waits', () => {
  // Serial execution is the standing grants own maxConcurrency 1, and it is a
  // property of the queue rather than of either program.
  const office = admGrant('STANDING-GRANT-OFFICE-LIVE-R01.json');
  const collection = admGrant('STANDING-GRANT-COLLECTION-LIVE-R01.json');
  const q = admQueue();

  const a = A.admit(Object.assign(admOpts(office), { queue: q }));
  const b = A.admit(Object.assign(admOpts(collection, { spec: admSpec(collection, { taskId: 'ADM-TEST-02' }) }), { queue: q }));
  assert.notEqual(a.entryId, b.entryId);

  assert.equal(q.head().entryId, a.entryId, 'first in, first out at equal priority');
  q.transition({ entryId: a.entryId, to: 'PLANNING', expectedPreviousState: 'QUEUED' });
  assert.equal(q.head(), null, 'while one occupies the slot, nothing else is head');
  assert.equal(q.active().entryId, a.entryId);
});
