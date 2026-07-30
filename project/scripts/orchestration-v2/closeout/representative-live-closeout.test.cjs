'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const closeout = require('./closeout.cjs');
const ledger = require('./merge-authority-ledger.cjs');
const { parseNameStatus } = require('./gh-adapter.cjs');

const PROGRAM = 'GOVERNANCE-CLOSEOUT-OPERABILITY-REMEDIATION-R01';
const TASK = 'GOVERNANCE-CLOSEOUT-LIVE-LEDGER-GAP-R01';
const OWNER = 'Av. Ulaş Hüseyin Telli';
const ROLE = 'Repository Owner / Semantic Authority';
const REPOSITORY = 'fixture/live-closeout';
const BRANCH = 'codex/governance-closeout-live-ledger-gap-r01';
const CHECK = 'Required Check';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function authorityText(kind, recordId, fields) {
  const body = Object.entries(Object.assign({ recordType: kind, recordId }, fields))
    .map(([key, value]) => key + ' : ' + value)
    .join('\n');
  return '```text\n' + body + '\n```\n\n'
    + '<!-- GOV-COORD-AUTHORITY kind=' + kind + ' recordId=' + recordId + ' -->\n';
}

test('representative real bare Git flow materializes, dry-runs, squash-merges, consumes and rejects reuse', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hukuk-closeout-bare-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git');
  const canonical = path.join(root, 'canonical');
  const taskWorktree = path.join(root, 'task-worktree');
  const ledgerPath = path.join(root, 'task-ledger.json');

  git(root, ['init', '--bare', remote]);
  git(root, ['clone', remote, canonical]);
  git(canonical, ['config', 'user.name', 'Closeout Fixture']);
  git(canonical, ['config', 'user.email', 'closeout@example.invalid']);

  const saId = TASK + '-SA01';
  const egId = TASK + '-EG01';
  const saPath = 'project/docs/governance/decision-log.md';
  const egPath = 'project/docs/governance/coordination-execution-grants/' + egId + '.md';
  fs.mkdirSync(path.join(canonical, path.dirname(saPath)), { recursive: true });
  fs.mkdirSync(path.join(canonical, path.dirname(egPath)), { recursive: true });
  fs.writeFileSync(path.join(canonical, saPath), authorityText('SEMANTIC_AUTHORITY', saId, {
    programId: PROGRAM, taskId: TASK, ownerName: OWNER, ownerRole: ROLE,
    decision: 'RATIFIED', status: 'ACTIVE_AFTER_APPROVED_MERGE',
    exactTaskBinding: 'REQUIRED', exactPrBinding: 'REQUIRED', exactHeadBinding: 'REQUIRED',
    exactScopeBinding: 'REQUIRED', requiredChecksBinding: 'REQUIRED', singleUseConsumption: 'REQUIRED',
    staleReuse: 'PROHIBITED', manualFallback: 'EMERGENCY_ONLY', productionActivation: 'NOT_AUTHORIZED',
    standingAuthority: 'PROHIBITED',
  }), 'utf8');
  fs.writeFileSync(path.join(canonical, egPath), authorityText('EXECUTION_GRANT', egId, {
    programId: PROGRAM, taskId: TASK, ownerName: OWNER, ownerRole: ROLE,
    executionMode: 'GO-COMPLETE', workspaceModule: 'SHARED_CONTROL_PLANE',
    status: 'ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK', productionActivation: 'NOT_AUTHORIZED',
    ciBypass: 'PROHIBITED', ledgerBypass: 'PROHIBITED', standingAuthority: 'PROHIBITED',
    reusableAuthority: 'PROHIBITED',
    'semanticAuthorityRef.kind': 'SEMANTIC_AUTHORITY',
    'semanticAuthorityRef.path': saPath,
    'semanticAuthorityRef.recordId': saId,
  }), 'utf8');
  fs.writeFileSync(path.join(canonical, 'README.md'), 'base\n', 'utf8');
  git(canonical, ['add', '--', 'project', 'README.md']);
  git(canonical, ['commit', '-m', 'fixture authority base']);
  git(canonical, ['branch', '-M', 'main']);
  git(canonical, ['push', '-u', 'origin', 'main']);
  const baseSha = git(canonical, ['rev-parse', 'HEAD']);

  git(canonical, ['worktree', 'add', '-b', BRANCH, taskWorktree, 'main']);
  fs.writeFileSync(path.join(taskWorktree, 'payload.txt'), 'self-hosted closeout\n', 'utf8');
  git(taskWorktree, ['add', '--', 'payload.txt']);
  git(taskWorktree, ['commit', '-m', 'fixture payload']);
  git(taskWorktree, ['push', '-u', 'origin', BRANCH]);
  const headSha = git(taskWorktree, ['rev-parse', 'HEAD']);

  const saRef = { kind: 'SEMANTIC_AUTHORITY', path: saPath, recordId: saId, evidenceSha: baseSha };
  const egRef = { kind: 'EXECUTION_GRANT', path: egPath, recordId: egId, evidenceSha: baseSha };
  let prState = 'OPEN';
  let mergeSha = null;
  let squashCalls = 0;

  const common = {
    repositoryIdentity: async () => REPOSITORY,
    resolveAuthority: async (ref, atRef) => ledger.resolveCanonicalAuthority(ref, atRef, canonical),
    getPr: async () => prState === 'OPEN'
      ? {
          number: 1, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN',
          headRefOid: headSha, headRefName: BRANCH, baseRefName: 'main', baseRefOid: baseSha,
          mergeCommitOid: null,
        }
      : { number: 1, state: 'MERGED', mergeCommitOid: mergeSha },
    currentBaseHead: async () => git(canonical, ['rev-parse', 'origin/main']),
    changedScope: async (base, head) => parseNameStatus(git(canonical, ['diff', '--name-status', base + '...' + head])),
    platformRequiredChecks: async () => [],
    getChecks: async () => [{ name: CHECK, status: 'COMPLETED', conclusion: 'SUCCESS' }],
    competingWriters: async () => [],
  };

  const materialized = await ledger.materializeMergeAuthority({
    programId: PROGRAM, taskId: TASK,
    semanticAuthorityRef: saRef, executionGrantRef: egRef,
    repository: REPOSITORY, baseBranch: 'main', taskBranch: BRANCH,
    prNumber: 1, expectedBase: baseSha, expectedHead: headSha,
    allowedPaths: ['payload.txt'], requiredChecks: [CHECK],
    mergeMethod: 'SQUASH', issuedBy: OWNER, ledgerPath,
    now: '2026-07-30T01:00:00.000Z',
  }, common);
  assert.equal(materialized.status, 'LEDGER_MATERIALIZED');

  const runner = Object.assign({}, common, {
    authorityLedgerEntry: async (ref) => ledger.loadLedgerEntry(ledgerPath, ref),
    validateCanonicalAuthorities: async (entry) => ({
      ok: true,
      semantic: ledger.resolveCanonicalAuthority(entry.semanticAuthorityRef, entry.authorizedBaseSha, canonical),
      execution: ledger.resolveCanonicalAuthority(entry.executionGrantRef, entry.authorizedBaseSha, canonical),
    }),
    remoteBranchHead: async () => git(canonical, ['rev-parse', 'origin/' + BRANCH]),
    localHead: async () => git(taskWorktree, ['rev-parse', 'HEAD']),
    ownerWipCollision: async () => false,
    squashMerge: async () => {
      squashCalls += 1;
      git(canonical, ['merge', '--squash', 'origin/' + BRANCH]);
      git(canonical, ['commit', '-m', 'fixture squash merge']);
      mergeSha = git(canonical, ['rev-parse', 'HEAD']);
      git(canonical, ['push', 'origin', 'main']);
      prState = 'MERGED';
      return true;
    },
    syncMain: async () => {
      git(canonical, ['fetch', 'origin']);
      return {
        mainSha: git(canonical, ['rev-parse', 'main']),
        aheadBehind: git(canonical, ['rev-list', '--left-right', '--count', 'origin/main...main']).replace(/\s+/, '/'),
      };
    },
    isAncestor: async (sha) => {
      try { git(canonical, ['merge-base', '--is-ancestor', sha, 'origin/main']); return true; } catch (error) { return false; }
    },
    cleanupWorktree: async () => {
      git(canonical, ['worktree', 'remove', '--force', taskWorktree]);
      git(canonical, ['worktree', 'prune']);
      return fs.existsSync(taskWorktree) ? 'ORPHANED_WORKTREE_DIR' : 'REMOVED';
    },
    cleanupBranch: async () => {
      git(canonical, ['branch', '-D', BRANCH]);
      git(canonical, ['push', 'origin', '--delete', BRANCH]);
      return 'DELETED';
    },
    verifyCanonical: async () => {
      const clean = git(canonical, ['status', '--porcelain']);
      return clean === '' && git(canonical, ['rev-parse', 'main']) === git(canonical, ['rev-parse', 'origin/main']) ? 'OK' : 'FAILED';
    },
    consumeAuthority: async (ref, meta) => ledger.consumeLedgerFile(ledgerPath, ref, Object.assign({}, meta, {
      consumedAt: '2026-07-30T02:00:00.000Z',
    })),
  });

  const runnerInput = {
    programId: PROGRAM, taskId: TASK, pr: 1,
    expectedHead: headSha, authorityType: 'EX_ANTE_GO_COMPLETE', authorityRef: egId,
    semanticAuthorityRef: saRef, executionGrantRef: egRef,
    allowedPaths: ['payload.txt'], requiredChecks: [CHECK], governanceRequiredChecks: [],
    branch: BRANCH, worktree: taskWorktree, targetBranch: 'main', repository: REPOSITORY,
  };
  const dry = await closeout.closeoutPr(Object.assign({}, runnerInput, { dryRun: true }), runner);
  assert.equal(dry.status, 'DRY_RUN_ELIGIBLE');
  assert.equal(dry.structuralEligibility, 'DRY_RUN_STRUCTURALLY_ELIGIBLE');
  assert.equal(dry.liveAuthorityReadiness, 'LIVE_AUTHORITY_READY');
  assert.equal(squashCalls, 0);

  const live = await closeout.closeoutPr(runnerInput, runner);
  assert.equal(live.status, 'CLOSED');
  assert.equal(live.authorityConsumed, 'CONSUMED');
  assert.equal(squashCalls, 1);
  assert.match(fs.readFileSync(path.join(canonical, 'payload.txt'), 'utf8'), /self-hosted closeout/);
  assert.equal(ledger.loadLedgerEntry(ledgerPath, egId).status, 'CONSUMED');

  const second = await closeout.closeoutPr(runnerInput, runner);
  assert.equal(second.status, 'BLOCKED');
  assert.equal(second.blockerCode, ledger.CODE.CONSUMED);
  assert.equal(squashCalls, 1);
});
