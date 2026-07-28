/**
 * GOV-DETERMINISTIC-PR-CLOSEOUT-AUTOMATION-R01 — closeout runner davranis testleri.
 *
 * Motor: `project/scripts/orchestration-v2/closeout/closeout.cjs`
 *
 * Gercek GitHub merge'i test edilmez (owner 3.12). Tum I/O fake adapter
 * uzerinden gecer; gercek `gh`/`git` adapter'i (gh-adapter.cjs) bu spec'te
 * kullanilmaz.
 *
 * CI baglantisi: apps/api/ci-manifests/pure/platform-scripts-shared.txt
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const closeout = require('../../../../../scripts/orchestration-v2/closeout/closeout.cjs');

const HEAD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);

type Json = Record<string, any>;

/** Butun gate'leri PASS eden temel senaryo; testler tek tek bozar. */
function makeAdapter(over: Json = {}): Json {
  const calls: Json = { squashMerge: 0, cleanupBranch: 0, cleanupWorktree: 0, syncMain: 0 };
  const state: Json = { pr: { state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', headRefOid: HEAD, headRefName: 'claude/x-r01', baseRefName: 'main', mergeCommitOid: null } };
  const base: Json = {
    calls,
    state,
    repositoryIdentity: async () => 'ulashuseyintelli-tech/HUKUK_YAZILIMI',
    // Live closeout artik ledger zorunlu kiliyor; varsayilan fixture gecerli bir
    // binding tasir. Ledger'siz senaryolar testlerde acikca override eder.
    authorityLedgerEntry: async () => ({
      authorityRef: 'owner directive 2026-07-28 GO-COMPLETE #1234',
      taskId: 'GOV-EXAMPLE-R01',
      pr: 1234,
      expectedHead: HEAD,
      consumed: false,
    }),
    getPr: async () => Object.assign({}, state.pr),
    changedPaths: async () => ['AGENTS.md'],
    getChecks: async () => [
      { name: 'Architectural Guardrails', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ],
    platformRequiredChecks: async () => ['Architectural Guardrails', 'Web Tests (vitest)'],
    remoteBranchHead: async () => HEAD,
    localHead: async () => HEAD,
    competingWriters: async () => [],
    ownerWipCollision: async () => false,
    squashMerge: async () => {
      calls.squashMerge += 1;
      state.pr = Object.assign({}, state.pr, { state: 'MERGED', mergeCommitOid: MERGE_SHA });
      return true;
    },
    syncMain: async () => {
      calls.syncMain += 1;
      return { mainSha: MERGE_SHA, aheadBehind: '0/0' };
    },
    isAncestor: async () => true,
    cleanupBranch: async () => {
      calls.cleanupBranch += 1;
      return 'DELETED';
    },
    cleanupWorktree: async () => {
      calls.cleanupWorktree += 1;
      return 'REMOVED';
    },
    verifyCanonical: async () => 'OK',
  };
  return Object.assign(base, over);
}

function makeInput(over: Json = {}): Json {
  return Object.assign(
    {
      taskId: 'GOV-EXAMPLE-R01',
      pr: 1234,
      expectedHead: HEAD,
      authorityType: 'EX_ANTE_GO_COMPLETE',
      authorityRef: 'owner directive 2026-07-28 GO-COMPLETE #1234',
      allowedPaths: ['AGENTS.md'],
      branch: 'claude/x-r01',
      worktree: null,
      targetBranch: 'main',
    },
    over,
  );
}

describe('closeout — authority (owner 3.2)', () => {
  it('1. valid EX_ANTE_GO_COMPLETE context is dry-run eligible', async () => {
    const r = await closeout.closeoutPr(makeInput({ dryRun: true }), makeAdapter());
    expect(r.status).toBe('DRY_RUN_ELIGIBLE');
    expect(r.stage).toBe('MERGE_GATE_VALIDATED');
  });

  it('2. valid IN_TASK_GO_COMPLETE context is dry-run eligible', async () => {
    const r = await closeout.closeoutPr(makeInput({ dryRun: true, authorityType: 'IN_TASK_GO_COMPLETE' }), makeAdapter());
    expect(r.status).toBe('DRY_RUN_ELIGIBLE');
  });

  it('3. missing authority fails closed', async () => {
    const r = await closeout.closeoutPr(makeInput({ authorityRef: undefined, authorityType: undefined }), makeAdapter());
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_MISSING);
    expect(r.status).toBe('BLOCKED');
  });

  it('4. an implicit phrase is not an authority type', async () => {
    for (const phrase of ['devam', 'uygula', 'basla', 'commit et', 'PR ac']) {
      const r = await closeout.closeoutPr(makeInput({ authorityType: phrase }), makeAdapter());
      expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_INVALID);
    }
    expect(closeout.AUTHORITY_TYPES).toEqual([
      'EX_ANTE_GO_COMPLETE',
      'IN_TASK_GO_COMPLETE',
      'EXPLICIT_PR_MERGE_AUTHORITY',
    ]);
  });

  it('5. authority bound to another task is rejected', async () => {
    const a = makeAdapter({ authorityLedgerEntry: async () => ({ taskId: 'OTHER-TASK', pr: 1234 }) });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_TASK_MISMATCH);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('6. authority bound to another PR is rejected', async () => {
    const a = makeAdapter({ authorityLedgerEntry: async () => ({ taskId: 'GOV-EXAMPLE-R01', pr: 9999 }) });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_PR_MISMATCH);
  });

  it('7. carrying a consumed authority reference to another PR is forbidden', async () => {
    // Reuse yasagi PR eksenindedir: ayni ref BASKA bir PR'da kullanilamaz.
    // Ayni PR icin recovery kosusu mesrudur ve test 36'da ayrica dogrulanir.
    const a = makeAdapter({
      authorityLedgerEntry: async () => ({
        taskId: 'GOV-EXAMPLE-R01', pr: 1234, consumed: true, consumedPr: 999,
      }),
    });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_REUSE_FORBIDDEN);
    expect(a.calls.squashMerge).toBe(0);
  });
});

describe('closeout — identity and scope (owner 3.4)', () => {
  it('8. PR head drift blocks the merge', async () => {
    const a = makeAdapter();
    a.state.pr.headRefOid = OTHER;
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.PR_HEAD_MISMATCH);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('8b. remote branch head drift blocks the merge', async () => {
    const a = makeAdapter({ remoteBranchHead: async () => OTHER });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.REMOTE_HEAD_MISMATCH);
  });

  it('8c. local worktree head drift blocks the merge', async () => {
    const a = makeAdapter({ localHead: async () => OTHER });
    const r = await closeout.closeoutPr(makeInput({ worktree: '/tmp/wt' }), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.LOCAL_HEAD_MISMATCH);
  });

  it('9. a changed path outside the authorized scope is forbidden', async () => {
    const a = makeAdapter({ changedPaths: async () => ['AGENTS.md', '.github/workflows/ci.yml'] });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.CHANGED_PATH_SCOPE_FORBIDDEN);
    expect(r.detail).toContain('.github/workflows/ci.yml');
    expect(a.calls.squashMerge).toBe(0);
  });

  it('28. a control-plane path can never enter through scope', async () => {
    const a = makeAdapter({ changedPaths: async () => ['project/scripts/governance-coordination.cjs'] });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.CHANGED_PATH_SCOPE_FORBIDDEN);
  });
});

describe('closeout — CI (owner 3.5)', () => {
  it('10. pending required CI is not terminal and does not merge', async () => {
    const a = makeAdapter({
      getChecks: async () => [
        { name: 'Architectural Guardrails', status: 'IN_PROGRESS', conclusion: null },
        { name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
      ],
    });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.CI_NOT_TERMINAL);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('11. failed required CI blocks the merge', async () => {
    const a = makeAdapter({
      getChecks: async () => [
        { name: 'Architectural Guardrails', status: 'COMPLETED', conclusion: 'FAILURE' },
        { name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
      ],
    });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.CI_FAILED);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('11b. a required check absent from the observed set fails closed', async () => {
    const a = makeAdapter({ getChecks: async () => [{ name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' }] });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.CI_NOT_TERMINAL);
  });

  it('12. terminal CI with CLEAN/MERGEABLE reaches the merge gate', async () => {
    const r = await closeout.closeoutPr(makeInput({ dryRun: true }), makeAdapter());
    expect(r.status).toBe('DRY_RUN_ELIGIBLE');
    expect(r.ci.length).toBe(2);
  });

  it('12b. NOT CLEAN merge state blocks even when CI passed', async () => {
    const a = makeAdapter();
    a.state.pr.mergeStateStatus = 'BLOCKED';
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.PR_NOT_CLEAN);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('12c. a non-mergeable PR blocks', async () => {
    const a = makeAdapter();
    a.state.pr.mergeable = 'CONFLICTING';
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.PR_NOT_MERGEABLE);
  });
});

describe('closeout — collisions (owner 3.4/9-10)', () => {
  it('13. a competing writer on a shared path blocks', async () => {
    const a = makeAdapter({ competingWriters: async () => ['#99:AGENTS.md'] });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.COMPETING_WRITER_FOUND);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('14. owner WIP in the canonical root blocks', async () => {
    const a = makeAdapter({ ownerWipCollision: async () => true });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.OWNER_WIP_COLLISION);
  });
});

describe('closeout — merge and post-merge chain (owner 3.6, 3.7)', () => {
  it('15/16. a clean run merges, syncs, cleans branch and worktree, then closes', async () => {
    const a = makeAdapter();
    const r = await closeout.closeoutPr(makeInput({ worktree: '/tmp/wt' }), a);
    expect(r.status).toBe('CLOSED');
    expect(r.stage).toBe('CLOSED');
    expect(r.mergeSha).toBe(MERGE_SHA);
    expect(r.aheadBehind).toBe('0/0');
    expect(r.branchCleanup).toBe('DELETED');
    expect(r.worktreeCleanup).toBe('REMOVED');
    expect(r.canonicalVerification).toBe('OK');
    expect(a.calls.squashMerge).toBe(1);
  });

  it('17. worktree cleanup failure reports MERGED_CLEANUP_BLOCKED and does not undo the merge', async () => {
    const a = makeAdapter({ cleanupWorktree: async () => 'ORPHANED_WORKTREE_DIR' });
    const r = await closeout.closeoutPr(makeInput({ worktree: '/tmp/wt' }), a);
    expect(r.status).toBe('MERGED_CLEANUP_BLOCKED');
    expect(r.blockerCode).toBe(closeout.BLOCKER.WORKTREE_CLEANUP_FAILED);
    expect(r.mergeSha).toBe(MERGE_SHA);
    expect(a.calls.squashMerge).toBe(1);
  });

  it('17b. a failed main sync reports MERGED_CLEANUP_BLOCKED', async () => {
    const a = makeAdapter({ syncMain: async () => ({ mainSha: MERGE_SHA, aheadBehind: '1/0' }) });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.status).toBe('MERGED_CLEANUP_BLOCKED');
    expect(r.blockerCode).toBe(closeout.BLOCKER.MAIN_SYNC_FAILED);
  });

  it('17c. a squash sha missing from main ancestry is unverified', async () => {
    const a = makeAdapter({ isAncestor: async () => false });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_STATE_UNVERIFIED);
  });

  it('17d. canonical verification failure blocks closure', async () => {
    const a = makeAdapter({ verifyCanonical: async () => 'CANONICAL_EQUALITY_FAILED' });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.CANONICAL_VERIFICATION_FAILED);
  });
});

describe('closeout — idempotency and recovery (owner 3.8)', () => {
  it('18/19. an already merged PR is not merged a second time', async () => {
    const a = makeAdapter();
    a.state.pr = Object.assign({}, a.state.pr, { state: 'MERGED', mergeCommitOid: MERGE_SHA });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(a.calls.squashMerge).toBe(0);
    expect(r.status).toBe('CLOSED');
    expect(r.mergeSha).toBe(MERGE_SHA);
  });

  it('19b. a PR merged with a different sha fails closed', async () => {
    const a = makeAdapter();
    a.state.pr = Object.assign({}, a.state.pr, { state: 'MERGED', mergeCommitOid: OTHER });
    const r = await closeout.closeoutPr(makeInput({ expectedMergeSha: MERGE_SHA }), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_STATE_UNVERIFIED);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('20. an already deleted branch is success, not an error', async () => {
    const a = makeAdapter({ cleanupBranch: async () => 'DELETED' });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.status).toBe('CLOSED');
  });

  it('21. an already removed worktree is success, not an error', async () => {
    const a = makeAdapter({ cleanupWorktree: async () => 'ALREADY_ABSENT' });
    const r = await closeout.closeoutPr(makeInput({ worktree: '/tmp/gone' }), a);
    expect(r.status).toBe('CLOSED');
    expect(r.worktreeCleanup).toBe('ALREADY_ABSENT');
  });
});

describe('closeout — security (owner 3.11)', () => {
  it('22. command injection shaped input is rejected', async () => {
    const bad = ['claude/x; rm -rf /', 'claude/x`whoami`', '--upload-pack=evil', 'claude/x$(id)'];
    for (const branch of bad) {
      const r = await closeout.closeoutPr(makeInput({ branch }), makeAdapter());
      expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_INVALID);
    }
  });

  it('23. path traversal in the worktree path is rejected', async () => {
    const r = await closeout.closeoutPr(makeInput({ worktree: '../../etc/passwd' }), makeAdapter());
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_INVALID);
  });

  it('23b. a non-sha expected head is rejected', async () => {
    const r = await closeout.closeoutPr(makeInput({ expectedHead: 'HEAD' }), makeAdapter());
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_INVALID);
  });

  it('24. an unexpected repository identity fails closed', async () => {
    const a = makeAdapter({ repositoryIdentity: async () => 'someone/else' });
    const r = await closeout.closeoutPr(makeInput({ repository: 'ulashuseyintelli-tech/HUKUK_YAZILIMI' }), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.REPOSITORY_IDENTITY_MISMATCH);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('25. secrets are redacted from output', async () => {
    expect(closeout.redact('token=ghp_abcdefghijklmnopqrstuvwxyz0123')).toContain('[REDACTED]');
    expect(closeout.redact('GITHUB_TOKEN: ghs_abcdefghijklmnopqrstuvwxyz0123')).toContain('[REDACTED]');
    expect(closeout.redact('nothing sensitive here')).toBe('nothing sensitive here');
  });
});

describe('closeout — contract (owner 3.9, 3.15, 3.16)', () => {
  it('26. the structured result carries every declared field', async () => {
    const r = await closeout.closeoutPr(makeInput({ worktree: '/tmp/wt' }), makeAdapter());
    for (const k of [
      'taskId', 'pr', 'authorityRef', 'status', 'stage', 'expectedHead', 'observedHead',
      'mergeSha', 'changedPaths', 'ci', 'mainSha', 'aheadBehind', 'branchCleanup',
      'worktreeCleanup', 'canonicalVerification', 'blockerCode',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(r, k)).toBe(true);
    }
  });

  it('27. dry-run performs no mutation at all', async () => {
    const a = makeAdapter();
    const r = await closeout.closeoutPr(makeInput({ dryRun: true, worktree: '/tmp/wt' }), a);
    expect(r.status).toBe('DRY_RUN_ELIGIBLE');
    expect(a.calls.squashMerge).toBe(0);
    expect(a.calls.syncMain).toBe(0);
    expect(a.calls.cleanupBranch).toBe(0);
    expect(a.calls.cleanupWorktree).toBe(0);
  });

  it('29. the runner is opt-in: it never runs unless explicitly invoked with authority', async () => {
    const r = await closeout.closeoutPr({}, makeAdapter());
    expect(r.status).toBe('BLOCKED');
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_MISSING);
  });

  it('30. no standing or reusable grant is produced', async () => {
    const a = makeAdapter();
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.status).toBe('CLOSED');
    // Sonuc yalniz bu task/PR'a aittir; hicbir alan sonraki calistirmaya
    // tasinabilir bir yetki tasimaz.
    expect(Object.keys(r)).not.toContain('standingGrant');
    expect(Object.keys(r)).not.toContain('reusableAuthority');
    expect(r.taskId).toBe('GOV-EXAMPLE-R01');
    expect(r.pr).toBe(1234);
  });

  it('31. a successful closeout consumes the authority reference', async () => {
    const consumed: Json[] = [];
    const a = makeAdapter({
      consumeAuthority: async (ref: string, meta: Json) => {
        consumed.push({ ref, meta });
        return 'CONSUMED';
      },
    });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.status).toBe('CLOSED');
    expect(r.authorityConsumed).toBe('CONSUMED');
    expect(consumed).toHaveLength(1);
    expect(consumed[0].ref).toBe('owner directive 2026-07-28 GO-COMPLETE #1234');
    expect(consumed[0].meta.pr).toBe(1234);
    expect(consumed[0].meta.mergeSha).toBe(MERGE_SHA);
  });

  it('32. a blocked run never consumes the authority reference', async () => {
    const consumed: Json[] = [];
    const a = makeAdapter({
      getChecks: async () => [{ name: 'Architectural Guardrails', status: 'COMPLETED', conclusion: 'FAILURE' }],
      consumeAuthority: async (ref: string) => {
        consumed.push({ ref });
        return 'CONSUMED';
      },
    });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.status).toBe('BLOCKED');
    expect(consumed).toHaveLength(0);
  });

  it('33. an adapter without consumeAuthority still closes cleanly', async () => {
    const r = await closeout.closeoutPr(makeInput(), makeAdapter());
    expect(r.status).toBe('CLOSED');
    expect(r.authorityConsumed).toBeNull();
  });

  it('34. the real gh/git adapter module loads and exposes the full surface', () => {
    // Pilot bulgusu: gh-adapter.cjs'i hicbir test require etmiyordu, bu yuzden
    // icindeki bir syntax hatasi butun CI yesilken main'e gidebiliyordu. Bu test
    // adapter'i gercekten yukler; hata artik CI'da patlar.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../../../scripts/orchestration-v2/closeout/gh-adapter.cjs');
    const adapter = mod.createGhCloseoutAdapter({ repoCwd: process.cwd() });
    for (const fn of [
      'repositoryIdentity', 'authorityLedgerEntry', 'getPr', 'changedPaths', 'getChecks',
      'platformRequiredChecks', 'remoteBranchHead', 'localHead', 'competingWriters',
      'ownerWipCollision', 'squashMerge', 'syncMain', 'isAncestor', 'cleanupBranch',
      'cleanupWorktree', 'consumeAuthority', 'verifyCanonical',
    ]) {
      expect(typeof adapter[fn]).toBe('function');
    }
  });

  it('35. the CLI module loads', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cli = require('../../../../../scripts/orchestration-v2/closeout/cli.cjs');
    expect(typeof cli.main).toBe('function');
    expect(cli.parseArgs(['--pr', '7', '--dry-run'])).toEqual({ pr: '7', 'dry-run': true });
  });

  it('36. a consumed reference still allows recovery for the SAME task and PR', async () => {
    // Pilot bulgusu: consumed kontrolu PR ayrimi yapmiyordu, bu yuzden ayni PR
    // icin ikinci kosu (recovery) REUSE_FORBIDDEN aliyordu.
    const a = makeAdapter({
      authorityLedgerEntry: async () => ({
        authorityRef: 'r', taskId: 'GOV-EXAMPLE-R01', pr: 1234, expectedHead: HEAD,
        consumed: true, consumedTaskId: 'GOV-EXAMPLE-R01', consumedPr: 1234,
      }),
    });
    a.state.pr = Object.assign({}, a.state.pr, { state: 'MERGED', mergeCommitOid: MERGE_SHA });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.status).toBe('CLOSED');
    expect(a.calls.squashMerge).toBe(0);
  });

  it('37. a consumed reference is refused for a DIFFERENT PR', async () => {
    const a = makeAdapter({
      authorityLedgerEntry: async () => ({
        authorityRef: 'r', taskId: 'GOV-EXAMPLE-R01', pr: 1234, expectedHead: HEAD,
        consumed: true, consumedTaskId: 'GOV-EXAMPLE-R01', consumedPr: 999,
      }),
    });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_REUSE_FORBIDDEN);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('38. the worktree is removed before the branch is deleted', async () => {
    // Pilot bulgusu: branch cleanup once kosuyordu; worktree branch'i checkout
    // tuttugu icin `git branch -D` sessizce basarisiz oluyor, yine de DELETED
    // raporlaniyordu.
    const order: string[] = [];
    const a = makeAdapter({
      cleanupWorktree: async () => { order.push('worktree'); return 'REMOVED'; },
      cleanupBranch: async () => { order.push('branch'); return 'DELETED'; },
    });
    const r = await closeout.closeoutPr(makeInput({ worktree: '/tmp/wt' }), a);
    expect(r.status).toBe('CLOSED');
    expect(order).toEqual(['worktree', 'branch']);
  });

  it('39. a branch that survives cleanup blocks closure', async () => {
    const a = makeAdapter({ cleanupBranch: async () => 'LOCAL_BRANCH_REMAINS' });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.status).toBe('MERGED_CLEANUP_BLOCKED');
    expect(r.blockerCode).toBe(closeout.BLOCKER.BRANCH_CLEANUP_FAILED);
    expect(r.mergeSha).toBe(MERGE_SHA);
  });

  it('40. a consumed reference carried to another PR reports REUSE, not PR_MISMATCH', async () => {
    // R02 pilot bulgusu: binding kontrolu (PR_MISMATCH) consumed kontrolunden
    // once tetikleniyordu. Davranis guvenliydi ama sinyal yanlisti — operatore
    // "yanlis PR" diyordu, gercek sebep reference'in tuketilmis olmasiydi.
    const a = makeAdapter({
      authorityLedgerEntry: async () => ({
        taskId: 'GOV-EXAMPLE-R01', pr: 1234, consumed: true,
        consumedTaskId: 'GOV-EXAMPLE-R01', consumedPr: 1234,
      }),
    });
    const r = await closeout.closeoutPr(makeInput({ pr: 4321 }), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_REUSE_FORBIDDEN);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('41. an UNCONSUMED reference bound to another PR still reports PR_MISMATCH', async () => {
    const a = makeAdapter({
      authorityLedgerEntry: async () => ({ taskId: 'GOV-EXAMPLE-R01', pr: 1234, consumed: false }),
    });
    const r = await closeout.closeoutPr(makeInput({ pr: 4321 }), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_PR_MISMATCH);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('42. a consumed reference without consumedPr falls back to the binding PR', async () => {
    const a = makeAdapter({
      authorityLedgerEntry: async () => ({ taskId: 'GOV-EXAMPLE-R01', pr: 1234, consumed: true }),
    });
    const r = await closeout.closeoutPr(makeInput({ pr: 4321 }), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_REUSE_FORBIDDEN);
  });

  it('43. live closeout without an authority ledger fails closed', async () => {
    const a = makeAdapter({ authorityLedgerEntry: async () => null });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_LEDGER_REQUIRED);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('44. dry-run without a ledger is still allowed', async () => {
    const a = makeAdapter({ authorityLedgerEntry: async () => null });
    const r = await closeout.closeoutPr(makeInput({ dryRun: true }), a);
    expect(r.status).toBe('DRY_RUN_ELIGIBLE');
    expect(a.calls.squashMerge).toBe(0);
  });

  it('45. a ledger entry missing a binding field fails closed', async () => {
    for (const missing of ['taskId', 'pr']) {
      const entry: Json = { authorityRef: 'r', taskId: 'GOV-EXAMPLE-R01', pr: 1234, expectedHead: HEAD };
      delete entry[missing];
      const a = makeAdapter({ authorityLedgerEntry: async () => entry });
      const r = await closeout.closeoutPr(makeInput(), a);
      expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_LEDGER_REQUIRED);
      expect(a.calls.squashMerge).toBe(0);
    }
  });

  it('46. live closeout requires expectedHead in the ledger', async () => {
    const a = makeAdapter({
      authorityLedgerEntry: async () => ({ authorityRef: 'r', taskId: 'GOV-EXAMPLE-R01', pr: 1234 }),
    });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_LEDGER_REQUIRED);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('47. a ledger expectedHead that disagrees with the input is rejected', async () => {
    const a = makeAdapter({
      authorityLedgerEntry: async () => ({
        authorityRef: 'r', taskId: 'GOV-EXAMPLE-R01', pr: 1234, expectedHead: OTHER,
      }),
    });
    const r = await closeout.closeoutPr(makeInput(), a);
    expect(r.blockerCode).toBe(closeout.BLOCKER.MERGE_AUTHORITY_PR_MISMATCH);
    expect(a.calls.squashMerge).toBe(0);
  });

  it('the state machine is single-directional and declared', () => {
    expect(closeout.STAGES[0]).toBe('PREFLIGHT');
    expect(closeout.STAGES[closeout.STAGES.length - 1]).toBe('CLOSED');
    expect(closeout.STAGES).toContain('MERGE_GATE_VALIDATED');
    expect(closeout.STAGES.indexOf('MERGED')).toBeLessThan(closeout.STAGES.indexOf('MAIN_SYNCED'));
  });
});
