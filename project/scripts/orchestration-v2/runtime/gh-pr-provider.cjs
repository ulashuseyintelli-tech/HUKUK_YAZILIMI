'use strict';
/**
 * GOV-COORD-V2 runtime — prProvider backed by the gh CLI.
 *
 * runTask calls ctx.prProvider.open() and .state() with no fallback, so until
 * this existed the orchestrator could not complete a task no matter what
 * authority was in place.
 *
 * open() creates the pull request from the isolated worktree's branch.
 * state() supplies the four values the MERGE_READY attestation pins: the PR
 * head, the target branch, that branch's observed tip, and the merge base.
 * Those are read at attestation time precisely so head drift and target-branch
 * drift invalidate the attestation rather than being assumed stable.
 *
 * Deliberately absent: anything that merges. Merge is owner authority under
 * both V1 and V2, and this adapter must not be able to perform one.
 */

const { execFileSync, spawnSync } = require('child_process');
const { safeSpawn } = require('./spawn-mode.cjs');

class PrProviderError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.code = code;
    this.detail = detail || null;
  }
}

function gh(args, cwd) {
  // Not shell:true — the PR title and body are single arguments containing
  // spaces and newlines, which cmd.exe would re-split. See spawn-mode.cjs; the
  // same defect silently emptied the ciProvider's platform-required set.
  const r = safeSpawn(spawnSync, 'gh', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new PrProviderError('GH_COMMAND_FAILED', args.join(' ') + ' :: ' + ((r.stderr || r.stdout || '').trim().slice(-400)));
  }
  return (r.stdout || '').trim();
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/**
 * @param {object} cfg
 * @param {string} cfg.repoCwd       canonical repository root
 * @param {string} cfg.targetBranch  branch the PR targets (e.g. 'main')
 * @param {function} [cfg.ghRunner]  injection point for tests
 */
function createGhPrProvider(cfg) {
  const repoCwd = cfg.repoCwd;
  const targetBranch = cfg.targetBranch || 'main';
  const runGh = cfg.ghRunner || gh;
  const runGit = cfg.gitRunner || git;

  return {
    /**
     * Push the worktree branch and open the PR. The body deliberately records
     * the immutable identity the reviewer needs — task id, spec hash, grant —
     * so a human looking at the PR can tell which ratified plan produced it.
     */
    async open(args) {
      const wt = args.worktreePath;
      const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], wt);
      if (!branch || branch === 'HEAD') throw new PrProviderError('DETACHED_HEAD', branch || '(none)');

      // The executor is forbidden to commit — a deliberate boundary — so it
      // leaves its work uncommitted in the worktree. Something has to turn that
      // into a commit before a branch can be pushed, and nothing did: `push`
      // alone produced a branch identical to main, and PR creation failed with
      // "No commits between main and ...". Measured on a live run where the
      // executor had written the file correctly and every required test had
      // passed. The work was real; it simply was never published.
      //
      // The commit is authored here, at the publish boundary, because this is
      // the step that turns a validated worktree into something reviewable. It
      // runs AFTER boundary validation and the required tests, so what is
      // committed is exactly what was judged.
      //
      // `add -A` is safe here: an untracked file is itself a boundary violation
      // (UNTRACKED_FILE_PRESENT), so a diff that reached this point has none.
      runGit(['add', '-A'], wt);
      runGit(
        [
          'commit',
          '-m',
          'orchestrated: ' + (args.taskId || branch),
          '-m',
          'Produced by a GOV-COORD-V2 executor inside a validated boundary. ' +
            'Auto-merge is OFF; this requires owner merge.',
        ],
        wt,
      );

      runGit(['push', '-u', 'origin', branch], wt);

      const v = args.validated || {};
      // changeCount, not `changes`: boundary.validate has never returned a
      // `changes` array, so this line rendered "changedFiles : 0" on every PR
      // regardless of what the executor did — including the run that produced a
      // correct file and passed every test.
      const verdict = args.verdict || {};
      const body = [
        'Orchestrated under GOV-COORD-V2. Auto-merge is OFF; this PR requires owner merge.',
        '',
        '```text',
        'taskId          : ' + (args.taskId || ''),
        'taskSpecSha256  : ' + ((v.digests && v.digests.taskSpecSha256) || ''),
        'grantId         : ' + (v.grantId || ''),
        'grantSha256     : ' + (v.grantSha256 || ''),
        'changedFiles    : ' + (verdict.changeCount === undefined ? 'unknown' : verdict.changeCount),
        '```',
      ].join('\n');

      const out = runGh(
        ['pr', 'create', '--base', targetBranch, '--head', branch, '--title',
          'orchestrated: ' + (args.taskId || branch), '--body', body],
        wt,
      );
      const m = /\/pull\/(\d+)\s*$/.exec(out) || /(\d+)\s*$/.exec(out);
      if (!m) throw new PrProviderError('PR_NUMBER_UNPARSEABLE', out.slice(-200));
      return { number: Number(m[1]), branch: branch, url: out };
    },

    /**
     * Read the drift-sensitive values at attestation time. The target branch tip
     * is read from the remote, not from a local ref, because a local ref can be
     * stale and would make a drifted attestation look clean.
     *
     * The keys and TYPES here are a contract with orchestrator.cjs, which builds
     * the §5 conjunction from `prState.open === true` and
     * `prState.mergeable === true`. This method used to return `prState: "OPEN"`
     * and `mergeable: "MERGEABLE"` — strings, under one wrong key — so both
     * terms were permanently false and MERGE_READY was unreachable in
     * production. Every test passed because the pilot's fake provider returns
     * booleans under the right names; only the fake was ever exercised.
     *
     * `blockingReview` comes from reviewDecision for the same reason: the
     * orchestrator reads it as `!== true`, so omitting it silently asserted
     * "no blocking review" without ever asking.
     */
    async state(args) {
      const n = String(args.pr.number);
      const fields = 'headRefOid,baseRefName,state,mergeStateStatus,mergeable,reviewDecision';

      // GitHub computes mergeability asynchronously and answers UNKNOWN while it
      // works — which is exactly the state moments after CI turns green, when
      // this is called. Treating that as "not mergeable" fails a correct
      // attempt; a couple of short re-reads is enough.
      let parsed = null;
      const tries = Number.isFinite(cfg.mergeableRetries) ? cfg.mergeableRetries : 3;
      const waitMs = Number.isFinite(cfg.mergeableRetryMs) ? cfg.mergeableRetryMs : 5000;
      const nap = cfg.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
      for (let i = 0; i < Math.max(1, tries); i += 1) {
        const json = runGh(['pr', 'view', n, '--json', fields], repoCwd);
        try {
          parsed = JSON.parse(json);
        } catch (e) {
          throw new PrProviderError('PR_VIEW_UNPARSEABLE', json.slice(0, 200));
        }
        if (parsed.mergeable !== 'UNKNOWN') break;
        if (i < Math.max(1, tries) - 1) await nap(waitMs);
      }

      const base = parsed.baseRefName || targetBranch;
      const remote = runGit(['ls-remote', 'origin', 'refs/heads/' + base], repoCwd).split(/\s+/)[0];
      if (!remote) throw new PrProviderError('TARGET_BRANCH_TIP_UNRESOLVED', base);

      let mergeBase = null;
      try {
        runGit(['fetch', 'origin', parsed.headRefOid, base], repoCwd);
        mergeBase = runGit(['merge-base', parsed.headRefOid, remote], repoCwd);
      } catch (e) {
        // Leave null rather than guess; the attestation conjunction treats a
        // missing merge base as a failed condition, which is the safe reading.
        mergeBase = null;
      }

      return {
        headSha: parsed.headRefOid,
        targetBranch: base,
        targetBranchSha: remote,
        mergeBaseSha: mergeBase,
        // What the conjunction actually reads.
        open: parsed.state === 'OPEN',
        mergeable: parsed.mergeable === 'MERGEABLE',
        blockingReview: parsed.reviewDecision === 'CHANGES_REQUESTED',
        // Kept for diagnostics and result payloads; not what the gate reads.
        prState: parsed.state,
        mergeStateStatus: parsed.mergeStateStatus,
        mergeableRaw: parsed.mergeable,
        reviewDecision: parsed.reviewDecision || null,
      };
    },
  };
}

module.exports = { createGhPrProvider, PrProviderError };
