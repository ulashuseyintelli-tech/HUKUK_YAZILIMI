/**
 * Deterministic closeout runner — REQUIRED-path invariant guard.
 *
 * Neden burada: runner'in tam test matrisi
 * `apps/api/src/common/__tests__/pr-closeout.spec.ts`tedir ve `Test Suite` job'inda
 * kosar; o job branch protection'da REQUIRED DEGILDIR. Bir ihlal PR'i kirmizi yakar
 * ama teknik olarak merge'i bloke etmez.
 *
 * Bu dosya yalniz merge guvenligini dogrudan belirleyen invariant'lari tasir ve
 * `Web Tests (vitest)` job'inda kosar — o job REQUIRED'dir. Boylece bu invariant'lar
 * ci.yml'e (governance control-plane) dokunmadan required korumaya girer.
 *
 * Kapsam bilincli olarak dardir: burada davranis matrisi tekrar edilmez, yalniz
 * "bunlar bozulursa yetkisiz merge mumkun olur" siniri korunur.
 *
 * Cagrildigi yerler:
 * - pnpm --filter @hukuk/web test  (CI: Web Tests (vitest), REQUIRED)
 */

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const closeout = require('../../../../scripts/orchestration-v2/closeout/closeout.cjs');

const HEAD = 'a'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);

type Json = Record<string, any>;

function makeAdapter(over: Json = {}): Json {
  const calls: Json = { squashMerge: 0, syncMain: 0, cleanupBranch: 0, cleanupWorktree: 0 };
  const state: Json = {
    pr: {
      state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN',
      headRefOid: HEAD, headRefName: 'claude/x', baseRefName: 'main', mergeCommitOid: null,
    },
  };
  return Object.assign(
    {
      calls,
      state,
      repositoryIdentity: async () => 'ulashuseyintelli-tech/HUKUK_YAZILIMI',
      authorityLedgerEntry: async () => ({
        authorityRef: 'r', taskId: 'T', pr: 1, expectedHead: HEAD, consumed: false,
      }),
      getPr: async () => Object.assign({}, state.pr),
      changedPaths: async () => ['A.md'],
      getChecks: async () => [{ name: 'A', status: 'COMPLETED', conclusion: 'SUCCESS' }],
      platformRequiredChecks: async () => ['A'],
      remoteBranchHead: async () => HEAD,
      localHead: async () => HEAD,
      competingWriters: async () => [],
      ownerWipCollision: async () => false,
      squashMerge: async () => {
        calls.squashMerge += 1;
        state.pr = Object.assign({}, state.pr, { state: 'MERGED', mergeCommitOid: MERGE_SHA });
        return true;
      },
      syncMain: async () => { calls.syncMain += 1; return { mainSha: MERGE_SHA, aheadBehind: '0/0' }; },
      isAncestor: async () => true,
      cleanupBranch: async () => { calls.cleanupBranch += 1; return 'DELETED'; },
      cleanupWorktree: async () => { calls.cleanupWorktree += 1; return 'REMOVED'; },
      verifyCanonical: async () => 'OK',
      consumeAuthority: async () => 'CONSUMED',
    },
    over,
  );
}

const input = (over: Json = {}): Json =>
  Object.assign(
    {
      taskId: 'T', pr: 1, expectedHead: HEAD,
      authorityType: 'EX_ANTE_GO_COMPLETE', authorityRef: 'r',
      allowedPaths: ['A.md'], branch: 'claude/x',
    },
    over,
  );

describe('closeout runner — required-path invariants', () => {
  it('accepts only the three task-bound authority types', () => {
    expect(closeout.AUTHORITY_TYPES).toEqual([
      'EX_ANTE_GO_COMPLETE',
      'IN_TASK_GO_COMPLETE',
      'EXPLICIT_PR_MERGE_AUTHORITY',
    ]);
  });

  it('never derives merge authority from an implicit owner phrase', async () => {
    for (const phrase of ['devam', 'uygula', 'basla', 'commit et', 'push et', 'PR ac', 'CI izle']) {
      const a = makeAdapter();
      const r = await closeout.closeoutPr(input({ authorityType: phrase }), a);
      expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_INVALID);
      expect(a.calls.squashMerge).toBe(0);
    }
  });

  it('refuses to merge without any authority at all', async () => {
    const a = makeAdapter();
    const r = await closeout.closeoutPr({}, a);
    expect(r.status).toBe('BLOCKED');
    expect(a.calls.squashMerge).toBe(0);
  });

  it('refuses a live merge when no authority ledger exists', async () => {
    const a = makeAdapter({ authorityLedgerEntry: async () => null });
    const r = await closeout.closeoutPr(input(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_LEDGER_REQUIRED);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('refuses to carry a consumed authority reference to another PR', async () => {
    const a = makeAdapter({
      authorityLedgerEntry: async () => ({
        authorityRef: 'r', taskId: 'T', pr: 1, expectedHead: HEAD,
        consumed: true, consumedTaskId: 'T', consumedPr: 999,
      }),
    });
    const r = await closeout.closeoutPr(input(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_REUSE_FORBIDDEN);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('performs no mutation at all in dry-run', async () => {
    const a = makeAdapter();
    const r = await closeout.closeoutPr(input({ dryRun: true }), a);
    expect(r.status).toBe('DRY_RUN_ELIGIBLE');
    expect(a.calls.squashMerge).toBe(0);
    expect(a.calls.syncMain).toBe(0);
    expect(a.calls.cleanupBranch).toBe(0);
    expect(a.calls.cleanupWorktree).toBe(0);
  });

  it('refuses a changed path outside the authorized scope', async () => {
    const a = makeAdapter({ changedPaths: async () => ['A.md', '.github/workflows/ci.yml'] });
    const r = await closeout.closeoutPr(input(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.CHANGED_PATH_SCOPE_FORBIDDEN);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('refuses to merge while required CI is not terminal or has failed', async () => {
    const pending = makeAdapter({ getChecks: async () => [{ name: 'A', status: 'IN_PROGRESS', conclusion: null }] });
    expect((await closeout.closeoutPr(input(), pending)).blockerCode).toBe(closeout.BLOCKER.CI_NOT_TERMINAL);
    expect(pending.calls.squashMerge).toBe(0);

    const failed = makeAdapter({ getChecks: async () => [{ name: 'A', status: 'COMPLETED', conclusion: 'FAILURE' }] });
    expect((await closeout.closeoutPr(input(), failed)).blockerCode).toBe(closeout.BLOCKER.CI_FAILED);
    expect(failed.calls.squashMerge).toBe(0);
  });

  it('refuses to merge on head drift or a competing writer', async () => {
    const drift = makeAdapter();
    drift.state.pr.headRefOid = 'b'.repeat(40);
    expect((await closeout.closeoutPr(input(), drift)).blockerCode).toBe(closeout.BLOCKER.PR_HEAD_MISMATCH);
    expect(drift.calls.squashMerge).toBe(0);

    const writer = makeAdapter({ competingWriters: async () => ['#99:A.md'] });
    expect((await closeout.closeoutPr(input(), writer)).blockerCode).toBe(closeout.BLOCKER.COMPETING_WRITER_FOUND);
    expect(writer.calls.squashMerge).toBe(0);
  });

  it('rejects command-injection and path-traversal shaped input', async () => {
    for (const branch of ['claude/x; rm -rf /', '--upload-pack=evil', 'claude/x$(id)']) {
      const r = await closeout.closeoutPr(input({ branch }), makeAdapter());
      expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_INVALID);
    }
    const traversal = await closeout.closeoutPr(input({ worktree: '../../etc/passwd' }), makeAdapter());
    expect(traversal.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_INVALID);
  });

  it('produces no standing or reusable grant in its result', async () => {
    const r = await closeout.closeoutPr(input(), makeAdapter());
    expect(r.status).toBe('CLOSED');
    expect(Object.keys(r)).not.toContain('standingGrant');
    expect(Object.keys(r)).not.toContain('reusableAuthority');
    expect(r.taskId).toBe('T');
    expect(r.pr).toBe(1);
  });

  it('keeps the state machine single-directional', () => {
    expect(closeout.STAGES[0]).toBe('PREFLIGHT');
    expect(closeout.STAGES[closeout.STAGES.length - 1]).toBe('CLOSED');
    expect(closeout.STAGES.indexOf('MERGED')).toBeLessThan(closeout.STAGES.indexOf('MAIN_SYNCED'));
    expect(closeout.STAGES.indexOf('WORKTREE_CLEANED')).toBeLessThan(closeout.STAGES.indexOf('BRANCH_CLEANED'));
  });

  it('loads the real gh/git adapter module', () => {
    // R01 pilot bulgusu: gercek adapter'i hicbir test require etmiyordu ve
    // icindeki syntax hatasi butun CI yesilken main'e gidebiliyordu.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../../scripts/orchestration-v2/closeout/gh-adapter.cjs');
    const adapter = mod.createGhCloseoutAdapter({ repoCwd: process.cwd() });
    for (const fn of ['getPr', 'squashMerge', 'syncMain', 'cleanupWorktree', 'cleanupBranch', 'consumeAuthority', 'verifyCanonical']) {
      expect(typeof adapter[fn]).toBe('function');
    }
  });
});
