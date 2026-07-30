'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ledger = require('./merge-authority-ledger.cjs');
const closeout = require('./closeout.cjs');

const PROGRAM = 'GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01';
const TASK = 'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01';
const OWNER = 'Av. Ulaş Hüseyin Telli';
const OWNER_ROLE = 'Repository Owner / Semantic Authority';
const REPOSITORY = 'ulashuseyintelli-tech/HUKUK_YAZILIMI';
const BASE = 'b'.repeat(40);
const HEAD = 'a'.repeat(40);
const MERGE = 'c'.repeat(40);
const BRANCH = 'codex/governance-closeout-live-ledger-gap-r01';
const SA = Object.freeze({
  kind: 'SEMANTIC_AUTHORITY',
  path: 'project/docs/governance/decision-log.md',
  recordId: TASK + '-SA01',
  evidenceSha: 'd'.repeat(40),
});
const EG = Object.freeze({
  kind: 'EXECUTION_GRANT',
  path: 'project/docs/governance/coordination-execution-grants/' + TASK + '-EG01.md',
  recordId: TASK + '-EG01',
  evidenceSha: 'd'.repeat(40),
});
const SCOPE = Object.freeze([
  { status: 'M', path: 'project/scripts/orchestration-v2/closeout/closeout.cjs' },
  { status: 'A', path: 'project/scripts/orchestration-v2/closeout/merge-authority-ledger.cjs' },
]);
const REQUIRED = Object.freeze(['Architectural Guardrails', 'Web Tests (vitest)']);

function saRecord(over = {}) {
  return Object.assign({
    recordType: 'SEMANTIC_AUTHORITY', recordId: SA.recordId,
    programId: PROGRAM, taskId: TASK,
    ownerName: OWNER, ownerRole: OWNER_ROLE,
    decision: 'RATIFIED', status: 'ACTIVE_AFTER_APPROVED_MERGE',
    exactTaskBinding: 'REQUIRED', exactPrBinding: 'REQUIRED', exactHeadBinding: 'REQUIRED',
    exactScopeBinding: 'REQUIRED', requiredChecksBinding: 'REQUIRED', singleUseConsumption: 'REQUIRED',
    staleReuse: 'PROHIBITED', manualFallback: 'EMERGENCY_ONLY',
    productionActivation: 'NOT_AUTHORIZED', standingAuthority: 'PROHIBITED',
  }, over);
}

function egRecord(over = {}) {
  return Object.assign({
    recordType: 'EXECUTION_GRANT', recordId: EG.recordId,
    programId: PROGRAM, taskId: TASK,
    ownerName: OWNER, ownerRole: OWNER_ROLE,
    executionMode: 'GO-COMPLETE', workspaceModule: 'SHARED_CONTROL_PLANE',
    status: 'ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK',
    productionActivation: 'NOT_AUTHORIZED', ciBypass: 'PROHIBITED', ledgerBypass: 'PROHIBITED',
    standingAuthority: 'PROHIBITED', reusableAuthority: 'PROHIBITED',
    'semanticAuthorityRef.kind': SA.kind,
    'semanticAuthorityRef.path': SA.path,
    'semanticAuthorityRef.recordId': SA.recordId,
  }, over);
}

function adapter(over = {}) {
  const base = {
    resolveAuthority: async (ref) => ref.kind === 'SEMANTIC_AUTHORITY' ? saRecord() : egRecord(),
    repositoryIdentity: async () => REPOSITORY,
    getPr: async () => ({
      number: 1936, state: 'OPEN', headRefOid: HEAD, headRefName: BRANCH,
      baseRefName: 'main', baseRefOid: BASE,
    }),
    currentBaseHead: async () => BASE,
    changedScope: async () => SCOPE.map((entry) => Object.assign({}, entry)),
    platformRequiredChecks: async () => [...REQUIRED],
    getChecks: async () => REQUIRED.map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })),
    competingWriters: async () => [],
  };
  return Object.assign(base, over);
}

function input(ledgerPath, over = {}) {
  return Object.assign({
    programId: PROGRAM, taskId: TASK,
    semanticAuthorityRef: Object.assign({}, SA), executionGrantRef: Object.assign({}, EG),
    repository: REPOSITORY, baseBranch: 'main', taskBranch: BRANCH,
    prNumber: 1936, expectedBase: BASE, expectedHead: HEAD,
    allowedPaths: SCOPE.map((entry) => entry.path), requiredChecks: [...REQUIRED],
    mergeMethod: 'SQUASH', issuedBy: OWNER,
    now: '2026-07-30T01:00:00.000Z', ledgerPath,
  }, over);
}

function tempLedger(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hukuk-live-ledger-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'ledger.json');
}

async function materialized(t) {
  const ledgerPath = tempLedger(t);
  const result = await ledger.materializeMergeAuthority(input(ledgerPath), adapter());
  return { ledgerPath, result, entry: ledger.loadLedgerEntry(ledgerPath, EG.recordId) };
}

function expectLedgerCode(expected, action) {
  return assert.rejects(action, (error) => error && error.code === expected);
}

test('valid SA01 + EG01 materializes exact schema-v2 bindings', async (t) => {
  const { result, entry } = await materialized(t);
  assert.equal(result.status, 'LEDGER_MATERIALIZED');
  assert.equal(entry.status, 'VALIDATED');
  assert.equal(entry.programId, PROGRAM);
  assert.equal(entry.taskId, TASK);
  assert.equal(entry.prNumber, 1936);
  assert.equal(entry.authorizedBaseSha, BASE);
  assert.equal(entry.authorizedHeadSha, HEAD);
  assert.deepEqual(entry.lifecycle.map((item) => item.status), ['ISSUED', 'VALIDATED']);
  assert.deepEqual(entry.requiredChecks.map((item) => item.name), [...REQUIRED].sort());
});

test('deterministic serialization and digests do not depend on object key order', () => {
  assert.equal(ledger.stableSerialize({ z: 1, a: { y: 2, b: 3 } }), ledger.stableSerialize({ a: { b: 3, y: 2 }, z: 1 }));
  assert.equal(ledger.scopeDigest(SCOPE), ledger.scopeDigest([...SCOPE].reverse()));
});

const materializationNegatives = [
  ['same SA/EG locator rejected', ledger.CODE.AUTHORITY_REFS_NOT_DISTINCT,
    (i) => { i.executionGrantRef.path = i.semanticAuthorityRef.path; i.executionGrantRef.recordId = i.semanticAuthorityRef.recordId; }],
  ['missing SA rejected', ledger.CODE.AUTHORITY_RESOLUTION_FAILED, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'SEMANTIC_AUTHORITY' ? null : egRecord(); }],
  ['missing EG rejected', ledger.CODE.AUTHORITY_RESOLUTION_FAILED, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'EXECUTION_GRANT' ? null : saRecord(); }],
  ['wrong SA task rejected', ledger.CODE.AUTHORITY_TASK_MISMATCH, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'SEMANTIC_AUTHORITY' ? saRecord({ taskId: 'OTHER' }) : egRecord(); }],
  ['wrong EG task rejected', ledger.CODE.AUTHORITY_TASK_MISMATCH, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'EXECUTION_GRANT' ? egRecord({ taskId: 'OTHER' }) : saRecord(); }],
  ['wrong program rejected', ledger.CODE.AUTHORITY_PROGRAM_MISMATCH, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'SEMANTIC_AUTHORITY' ? saRecord({ programId: 'OTHER' }) : egRecord(); }],
  ['wrong canonical owner rejected', ledger.CODE.AUTHORITY_OWNER_MISMATCH, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'EXECUTION_GRANT' ? egRecord({ ownerName: 'Other Owner' }) : saRecord(); }],
  ['wrong issuedBy rejected', ledger.CODE.AUTHORITY_OWNER_MISMATCH,
    (i) => { i.issuedBy = 'Other Owner'; }],
  ['wrong execution mode rejected', ledger.CODE.AUTHORITY_MODE_INVALID, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'EXECUTION_GRANT' ? egRecord({ executionMode: 'GO-IMPLEMENT' }) : saRecord(); }],
  ['missing PR rejected', ledger.CODE.PR_NOT_OPEN, null,
    (a) => { a.getPr = async () => null; }],
  ['closed PR rejected', ledger.CODE.PR_NOT_OPEN, null,
    (a) => { a.getPr = async () => ({ state: 'MERGED' }); }],
  ['wrong PR rejected', ledger.CODE.PR_IDENTITY_MISMATCH, null,
    (a) => { a.getPr = async () => ({ number: 9, state: 'OPEN', headRefOid: HEAD, headRefName: BRANCH, baseRefName: 'main', baseRefOid: BASE }); }],
  ['head drift rejected', ledger.CODE.AUTHORIZED_HEAD_MISMATCH, null,
    (a) => { a.getPr = async () => ({ number: 1936, state: 'OPEN', headRefOid: 'e'.repeat(40), headRefName: BRANCH, baseRefName: 'main', baseRefOid: BASE }); }],
  ['PR base drift rejected', ledger.CODE.AUTHORIZED_BASE_MISMATCH, null,
    (a) => { a.getPr = async () => ({ number: 1936, state: 'OPEN', headRefOid: HEAD, headRefName: BRANCH, baseRefName: 'main', baseRefOid: 'e'.repeat(40) }); }],
  ['current base drift rejected', ledger.CODE.AUTHORIZED_BASE_MISMATCH, null,
    (a) => { a.currentBaseHead = async () => 'e'.repeat(40); }],
  ['scope drift rejected', ledger.CODE.AUTHORIZED_SCOPE_MISMATCH,
    (i) => { i.allowedPaths = ['different.md']; }],
  ['empty scope rejected', ledger.CODE.AUTHORIZED_SCOPE_MISMATCH, null,
    (a) => { a.changedScope = async () => []; }],
  ['wrong task branch rejected', ledger.CODE.WRONG_BRANCH, null,
    (a) => { a.getPr = async () => ({ number: 1936, state: 'OPEN', headRefOid: HEAD, headRefName: 'codex/other', baseRefName: 'main', baseRefOid: BASE }); }],
  ['wrong base branch rejected', ledger.CODE.WRONG_BRANCH, null,
    (a) => { a.getPr = async () => ({ number: 1936, state: 'OPEN', headRefOid: HEAD, headRefName: BRANCH, baseRefName: 'release', baseRefOid: BASE }); }],
  ['required check pending rejected', ledger.CODE.REQUIRED_CHECK_PENDING, null,
    (a) => { a.getChecks = async () => REQUIRED.map((name) => ({ name, status: 'IN_PROGRESS', conclusion: null })); }],
  ['required check failure rejected', ledger.CODE.REQUIRED_CHECK_FAILED, null,
    (a) => { a.getChecks = async () => REQUIRED.map((name) => ({ name, status: 'COMPLETED', conclusion: 'FAILURE' })); }],
  ['undiscoverable required checks rejected', ledger.CODE.REQUIRED_CHECKS_UNDISCOVERABLE,
    (i) => { i.requiredChecks = []; }, (a) => { a.platformRequiredChecks = async () => []; }],
  ['required-check discovery failure rejected', ledger.CODE.REQUIRED_CHECKS_UNDISCOVERABLE, null,
    (a) => { a.discoverPlatformRequiredChecks = async () => { throw new Error('protection unavailable'); }; }],
  ['wrong repository rejected', ledger.CODE.WRONG_REPOSITORY, null,
    (a) => { a.repositoryIdentity = async () => 'other/repo'; }],
  ['wrong merge method rejected', ledger.CODE.WRONG_MERGE_METHOD,
    (i) => { i.mergeMethod = 'MERGE'; }],
  ['competing writer rejected', ledger.CODE.COMPETING_WRITER, null,
    (a) => { a.competingWriters = async () => ['#99:decision-log.md']; }],
  ['manual fallback weakening rejected', ledger.CODE.MANUAL_FALLBACK_NOT_GATED, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'SEMANTIC_AUTHORITY' ? saRecord({ manualFallback: 'NORMAL' }) : egRecord(); }],
  ['non-ratified semantic authority rejected', ledger.CODE.AUTHORITY_RECORD_INVALID, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'SEMANTIC_AUTHORITY' ? saRecord({ decision: 'DRAFT' }) : egRecord(); }],
  ['CI bypass weakening rejected', ledger.CODE.AUTHORITY_RECORD_INVALID, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'EXECUTION_GRANT' ? egRecord({ ciBypass: 'ALLOWED' }) : saRecord(); }],
  ['reusable grant rejected', ledger.CODE.AUTHORITY_RECORD_INVALID, null,
    (a) => { a.resolveAuthority = async (ref) => ref.kind === 'EXECUTION_GRANT' ? egRecord({ reusableAuthority: 'ALLOWED' }) : saRecord(); }],
  ['cross-task input reuse rejected', ledger.CODE.AUTHORITY_TASK_MISMATCH,
    (i) => { i.taskId = 'OTHER-TASK'; }],
  ['unsafe semantic authority path rejected', ledger.CODE.AUTHORITY_RECORD_INVALID,
    (i) => { i.semanticAuthorityRef.path = '../decision-log.md'; }],
  ['invalid expected head rejected', ledger.CODE.INPUT_INVALID,
    (i) => { i.expectedHead = 'short'; }],
  ['invalid expected base rejected', ledger.CODE.INPUT_INVALID,
    (i) => { i.expectedBase = 'short'; }],
  ['ledger inside disposable worktree rejected', ledger.CODE.INPUT_INVALID,
    (i) => { i.worktreePath = path.dirname(i.ledgerPath); }],
];

for (const [name, code, mutateInput, mutateAdapter] of materializationNegatives) {
  test(name, async (t) => {
    const ledgerPath = tempLedger(t);
    const i = input(ledgerPath);
    const a = adapter();
    if (mutateInput) mutateInput(i);
    if (mutateAdapter) mutateAdapter(a);
    await expectLedgerCode(code, () => ledger.materializeMergeAuthority(i, a));
    assert.equal(fs.existsSync(ledgerPath), false);
  });
}

test('checked SHA mismatch is rejected', () => {
  assert.throws(
    () => ledger.validateRequiredChecks(REQUIRED, REQUIRED.map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })), 'e'.repeat(40), HEAD),
    (error) => error.code === ledger.CODE.CHECKED_SHA_MISMATCH,
  );
});

test('existing active ledger prevents conflicting materialization', async (t) => {
  const { ledgerPath } = await materialized(t);
  await expectLedgerCode(ledger.CODE.CONFLICT, () => ledger.materializeMergeAuthority(input(ledgerPath), adapter()));
});

test('missing ledger is fail-closed', (t) => {
  const ledgerPath = tempLedger(t);
  assert.throws(() => ledger.readLedgerFile(ledgerPath), (error) => error.code === ledger.CODE.MISSING);
});

test('malformed ledger is fail-closed', (t) => {
  const ledgerPath = tempLedger(t);
  fs.writeFileSync(ledgerPath, '{broken', 'utf8');
  assert.throws(() => ledger.readLedgerFile(ledgerPath), (error) => error.code === ledger.CODE.MALFORMED);
});

test('partial temporary write is never active authority', (t) => {
  const ledgerPath = tempLedger(t);
  fs.writeFileSync(ledgerPath + '.tmp-partial', '{', 'utf8');
  assert.throws(() => ledger.readLedgerFile(ledgerPath), (error) => error.code === ledger.CODE.MISSING);
});

test('ledger digest tamper is rejected', async (t) => {
  const { ledgerPath } = await materialized(t);
  const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  raw.entries[0].taskId = 'TAMPERED';
  fs.writeFileSync(ledgerPath, JSON.stringify(raw), 'utf8');
  assert.throws(() => ledger.readLedgerFile(ledgerPath), (error) => error.code === ledger.CODE.DIGEST_MISMATCH);
});

test('conflicting active ledgers are rejected', async (t) => {
  const { ledgerPath } = await materialized(t);
  const raw = ledger.readLedgerFile(ledgerPath);
  const clone = Object.assign({}, raw.entries[0], { authorizedHeadSha: 'e'.repeat(40) });
  const conflicting = ledger.finalizeLedger({ entries: [raw.entries[0], clone] });
  fs.writeFileSync(ledgerPath, JSON.stringify(conflicting), 'utf8');
  assert.throws(() => ledger.readLedgerFile(ledgerPath), (error) => error.code === ledger.CODE.CONFLICT);
});

function liveInput(over = {}) {
  return Object.assign({
    programId: PROGRAM, taskId: TASK, pr: 1936, expectedHead: HEAD,
    targetBranch: 'main', branch: BRANCH, repository: REPOSITORY,
    semanticAuthorityRef: Object.assign({}, SA), executionGrantRef: Object.assign({}, EG),
    allowedPaths: SCOPE.map((entry) => entry.path), requiredChecks: [...REQUIRED],
  }, over);
}

for (const [status, code] of [
  ['REVOKED', ledger.CODE.REVOKED],
  ['EXPIRED', ledger.CODE.EXPIRED],
  ['INVALIDATED', ledger.CODE.INVALIDATED],
  ['CONSUMED', ledger.CODE.CONSUMED],
]) {
  test(status.toLowerCase() + ' ledger is rejected', async (t) => {
    const { entry } = await materialized(t);
    entry.status = status;
    const result = ledger.validateLiveLedgerBinding(liveInput(), entry);
    assert.equal(result.code, code);
  });
}

test('wrong live task binding is rejected', async (t) => {
  const { entry } = await materialized(t);
  assert.equal(ledger.validateLiveLedgerBinding(liveInput({ taskId: 'OTHER' }), entry).code, ledger.CODE.AUTHORITY_TASK_MISMATCH);
});

test('wrong live program binding is rejected', async (t) => {
  const { entry } = await materialized(t);
  assert.equal(ledger.validateLiveLedgerBinding(liveInput({ programId: 'OTHER' }), entry).code, ledger.CODE.AUTHORITY_PROGRAM_MISMATCH);
});

test('wrong live PR binding is rejected', async (t) => {
  const { entry } = await materialized(t);
  assert.equal(ledger.validateLiveLedgerBinding(liveInput({ pr: 9 }), entry).code, ledger.CODE.PR_IDENTITY_MISMATCH);
});

test('wrong live head binding is rejected', async (t) => {
  const { entry } = await materialized(t);
  assert.equal(ledger.validateLiveLedgerBinding(liveInput({ expectedHead: 'e'.repeat(40) }), entry).code, ledger.CODE.AUTHORIZED_HEAD_MISMATCH);
});

test('wrong live branch binding is rejected', async (t) => {
  const { entry } = await materialized(t);
  assert.equal(ledger.validateLiveLedgerBinding(liveInput({ branch: 'codex/other' }), entry).code, ledger.CODE.WRONG_BRANCH);
});

test('wrong live repository binding is rejected', async (t) => {
  const { entry } = await materialized(t);
  assert.equal(ledger.validateLiveLedgerBinding(liveInput({ repository: 'other/repo' }), entry).code, ledger.CODE.WRONG_REPOSITORY);
});

test('wrong live scope binding is rejected', async (t) => {
  const { entry } = await materialized(t);
  assert.equal(ledger.validateLiveLedgerBinding(liveInput({ allowedPaths: ['other.md'] }), entry).code, ledger.CODE.AUTHORIZED_SCOPE_MISMATCH);
});

test('wrong live required-check binding is rejected', async (t) => {
  const { entry } = await materialized(t);
  assert.equal(ledger.validateLiveLedgerBinding(liveInput({ requiredChecks: ['Other'] }), entry).code, ledger.CODE.REQUIRED_CHECKS_UNDISCOVERABLE);
});

test('valid ledger consumes once and rejects second consumption', async (t) => {
  const { ledgerPath } = await materialized(t);
  assert.equal(ledger.consumeLedgerFile(ledgerPath, EG.recordId, {
    taskId: TASK, pr: 1936, expectedHead: HEAD, mergeSha: MERGE,
    consumedAt: '2026-07-30T02:00:00.000Z',
  }), 'CONSUMED');
  const consumed = ledger.loadLedgerEntry(ledgerPath, EG.recordId);
  assert.equal(consumed.status, 'CONSUMED');
  assert.equal(consumed.consumedByMergeSha, MERGE);
  assert.deepEqual(consumed.lifecycle.map((item) => item.status), ['ISSUED', 'VALIDATED', 'CONSUMED']);
  assert.throws(
    () => ledger.consumeLedgerFile(ledgerPath, EG.recordId, { taskId: TASK, pr: 1936, expectedHead: HEAD, mergeSha: MERGE }),
    (error) => error.code === ledger.CODE.REUSE_FORBIDDEN,
  );
});

test('cross-task consumption is rejected', async (t) => {
  const { ledgerPath } = await materialized(t);
  assert.throws(
    () => ledger.consumeLedgerFile(ledgerPath, EG.recordId, { taskId: 'OTHER', pr: 1936, expectedHead: HEAD, mergeSha: MERGE }),
    (error) => error.code === ledger.CODE.REUSE_FORBIDDEN,
  );
});

test('consumption head drift is rejected', async (t) => {
  const { ledgerPath } = await materialized(t);
  assert.throws(
    () => ledger.consumeLedgerFile(ledgerPath, EG.recordId, { taskId: TASK, pr: 1936, expectedHead: 'e'.repeat(40), mergeSha: MERGE }),
    (error) => error.code === ledger.CODE.AUTHORIZED_HEAD_MISMATCH,
  );
});

test('live binding accepts the exact validated candidate', async (t) => {
  const { entry } = await materialized(t);
  assert.deepEqual(ledger.validateLiveLedgerBinding(liveInput(), entry), { ok: true, liveReady: true, legacy: false });
});

test('post-merge consumption failure is reported by the exact residual code before cleanup', async () => {
  const calls = { cleanup: 0 };
  const result = await closeout.recoverAfterMerge({
    ledgerSchemaVersion: ledger.SCHEMA_VERSION,
    mergeSha: MERGE,
    stage: 'MERGED',
  }, {
    authorityRef: EG.recordId,
    taskId: TASK,
    pr: 1936,
    expectedHead: HEAD,
    branch: BRANCH,
    worktree: 'fixture-worktree',
  }, {
    syncMain: async () => ({ mainSha: MERGE, aheadBehind: '0/0' }),
    isAncestor: async () => true,
    consumeAuthority: async () => {
      const error = new Error('exclusive ledger lock exists');
      error.code = ledger.CODE.WRITE_CONFLICT;
      throw error;
    },
    cleanupWorktree: async () => { calls.cleanup += 1; return 'REMOVED'; },
  });
  assert.equal(result.status, 'MERGED_CLEANUP_BLOCKED');
  assert.equal(result.blockerCode, ledger.CODE.CONSUMPTION_FAILED);
  assert.equal(calls.cleanup, 0);
});
