'use strict';
/**
 * GOV-COORD-V2 runtime — bounded auto-merge.
 *
 * Until this module existed, `performMerge` threw MERGE_NOT_PERMITTED by
 * construction: the pilot could take a task all the way to MERGE_READY and then
 * stop, because merging was owner authority and there was no bounded way to
 * exercise it. That was the correct default for a pilot. It is also exactly why
 * the pilot could not run unattended.
 *
 * What replaces the refusal is not permission — it is a narrower refusal. Every
 * merge still has to pass the same gates a careful owner would check, and the
 * gates are re-read HERE, at merge time, rather than carried over from the
 * attestation:
 *
 *   The attestation proves what was true when it was written. Between then and
 *   the merge, the target branch can move, a review can land, a check can be
 *   re-run, a grant can be revoked. Trusting the attestation at merge time is
 *   trusting a photograph of a door to prove the door is still locked.
 *
 * Three properties keep this bounded rather than general:
 *
 *   Grant-scoped. The authority comes from a standing grant that names one
 *   program, one merge method and an explicit `repositoryWideAutoMerge: false`.
 *   A grant missing any of those does not merge.
 *
 *   PR-scoped. The provider merges only a PR whose head branch is the branch
 *   this run created. Without that check, an auto-merge capability handed a PR
 *   number would merge whatever that number happened to be.
 *
 *   Idempotent. A PR already merged returns its existing merge sha instead of
 *   failing, because a crash between the merge and the state write must not
 *   turn a completed merge into a permanent error.
 */

const { execFileSync, spawnSync } = require('child_process');
const { safeSpawn } = require('./spawn-mode.cjs');

class MergeProviderError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'MergeProviderError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new MergeProviderError(code, detail);
}

function gh(args, cwd) {
  const r = safeSpawn(spawnSync, 'gh', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    fail('GH_COMMAND_FAILED', args.join(' ') + ' :: ' + ((r.stderr || r.stdout || '').trim().slice(-400)));
  }
  return (r.stdout || '').trim();
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/**
 * A check counts as passing only on a terminal conclusion the policy admits.
 * SKIPPED and NEUTRAL are policy decisions, not defaults: a required check that
 * was skipped tells you nothing about the change, so admitting it is something
 * the grant has to say out loud.
 */
function checkPasses(check, ciPolicy) {
  if (check.status !== 'COMPLETED') return false;
  if (check.conclusion === 'SUCCESS') return true;
  if (check.conclusion === 'SKIPPED') return ciPolicy.allowSkipped === true;
  if (check.conclusion === 'NEUTRAL') return ciPolicy.allowNeutral === true;
  return false;
}

/**
 * @param {object} cfg
 * @param {string} cfg.repoCwd
 * @param {object} cfg.standingGrant     the program grant carrying mergePolicy
 * @param {object} cfg.ciProvider        supplies requiredSources() and observe()
 * @param {string} cfg.expectedHeadBranch the branch this run created
 * @param {function} [cfg.isRevoked]     () => boolean, re-read at merge time
 * @param {function} [cfg.isKillSwitchEngaged] () => boolean
 */
function createGhMergeProvider(cfg) {
  const repoCwd = cfg.repoCwd;
  const runGh = cfg.ghRunner || gh;
  const runGit = cfg.gitRunner || git;
  const grant = cfg.standingGrant || null;
  const isRevoked = cfg.isRevoked || (() => false);
  const isKilled = cfg.isKillSwitchEngaged || (() => false);

  /** Everything about the grant that does not depend on the PR. */
  function assertGrantPermitsMerge() {
    if (!grant || typeof grant !== 'object') fail('MERGE_NOT_AUTHORIZED', 'no standing grant supplied');
    const policy = grant.mergePolicy || {};
    if (policy.autoMergeAuthorized !== true) fail('MERGE_NOT_AUTHORIZED', grant.standingGrantId || 'grant');
    if (policy.repositoryWideAutoMerge === true) fail('REPOSITORY_WIDE_AUTO_MERGE_FORBIDDEN', grant.standingGrantId);
    if (policy.method !== 'SQUASH') fail('MERGE_METHOD_NOT_GRANTED', String(policy.method));
    if (grant.maxConcurrency !== 1) fail('STANDING_GRANT_CONCURRENCY_INVALID', String(grant.maxConcurrency));
    // Revocation and the kill switch are read now, not at plan time. A grant
    // pulled while CI was running must stop the merge it was pulled to stop.
    if (isRevoked()) fail('STANDING_GRANT_REVOKED', grant.standingGrantId);
    if (isKilled()) fail('KILL_SWITCH_ENGAGED', grant.killSwitchPath || 'kill switch');
  }

  function readPr(number) {
    const json = runGh(
      ['pr', 'view', String(number), '--json',
        'state,mergeable,mergeStateStatus,reviewDecision,headRefName,headRefOid,mergeCommit,baseRefName'],
      repoCwd,
    );
    try {
      return JSON.parse(json);
    } catch (e) {
      fail('PR_VIEW_UNPARSEABLE', json.slice(0, 200));
    }
  }

  return {
    /**
     * Merge one pull request, or refuse with the reason.
     *
     * @param {object} args
     * @param {object} args.result   the MERGE_READY result carrying pr + attestation
     * @returns {{mergeSha, idempotent, method, verifiedAt}}
     */
    async performMerge(args) {
      assertGrantPermitsMerge();

      const result = (args && args.result) || {};
      const pr = result.pr || {};
      if (!pr.number) fail('MERGE_PR_UNKNOWN', 'result carries no pr.number');

      const observed = readPr(pr.number);

      // Idempotency first: a PR already merged is a success, not an error. This
      // is the crash-between-merge-and-state-write case, and treating it as a
      // failure would strand a completed merge in a permanent blocked state.
      if (observed.state === 'MERGED') {
        const sha = observed.mergeCommit && observed.mergeCommit.oid;
        if (!sha) fail('MERGE_SHA_UNRESOLVED', 'PR reports MERGED with no merge commit');
        return { mergeSha: sha, idempotent: true, method: 'SQUASH', verifiedAt: null };
      }
      if (observed.state !== 'OPEN') fail('MERGE_PR_NOT_OPEN', observed.state);

      // PR-scoped, not number-scoped. The branch this run created is the only
      // branch this grant may merge.
      if (cfg.expectedHeadBranch && observed.headRefName !== cfg.expectedHeadBranch) {
        fail('MERGE_PR_NOT_OWNED', observed.headRefName + ' != ' + cfg.expectedHeadBranch);
      }
      // And the same commit that was attested. A push after MERGE_READY means
      // the merged content is not the content that passed the gates.
      const attestedHead = (result.attestation && result.attestation.observed && result.attestation.observed.headSha) || null;
      if (attestedHead && observed.headRefOid !== attestedHead) {
        fail('MERGE_HEAD_DRIFTED', observed.headRefOid + ' != ' + attestedHead);
      }

      if (observed.reviewDecision === 'CHANGES_REQUESTED') fail('MERGE_BLOCKING_REVIEW', pr.number);
      if (observed.mergeable !== 'MERGEABLE') fail('MERGE_NOT_MERGEABLE', String(observed.mergeable));
      if (observed.mergeStateStatus !== 'CLEAN') fail('MERGE_STATE_NOT_CLEAN', String(observed.mergeStateStatus));

      // Required checks, re-observed. Not the attested rollup — the live one.
      const ciPolicy = grant.ciPolicy || {};
      if (ciPolicy.requireTerminalSuccess !== true) fail('CI_TERMINAL_SUCCESS_NOT_REQUIRED', grant.standingGrantId);
      const sources = await cfg.ciProvider.requiredSources();
      const required = [].concat(
        sources.platformRequired || [],
        sources.governanceRequired || [],
        sources.taskSpecRequired || [],
      );
      const rollup = await cfg.ciProvider.observe({ pr: { number: pr.number } });
      const byName = new Map(rollup.map((c) => [c.name, c]));
      for (const name of required) {
        const check = byName.get(name);
        // Absent is a failure, not an absence of evidence. A required check that
        // never reported is the case a naive "nothing is red" reading misses.
        if (!check) fail('MERGE_REQUIRED_CHECK_MISSING', name);
        if (!checkPasses(check, ciPolicy)) {
          fail('MERGE_REQUIRED_CHECK_NOT_SUCCESS', name + '=' + (check.conclusion || check.status));
        }
      }

      // No --delete-branch, and the omission is the fix rather than a
      // simplification.
      //
      // `gh pr merge --delete-branch` deletes the LOCAL branch as well, and the
      // branch this run created is checked out in the run's own worktree, which
      // is still standing at merge time — cleanup is two states later. So git
      // refuses ("cannot delete branch ... used by worktree at ..."), gh exits
      // non-zero, and it does so AFTER the merge has landed on the remote.
      //
      // The merge succeeded and the system recorded GH_COMMAND_FAILED, with
      // mergeSha null and the entry BLOCKED. That is the worst state this
      // program can produce: reality and the record disagree about whether a
      // merge happened. Measured on the R03 canary, PR #1750 — and it would
      // have happened on every orchestrated auto-merge, because the orchestrator
      // always merges a branch its own worktree is holding.
      //
      // Branch deletion belongs to CLEANING, after the worktree is gone. Merging
      // and tidying are different operations with different consequences, and
      // coupling them made a tidying failure indistinguishable from a merge one.
      //
      // The re-read is the second half. A merge is not a retryable operation, so
      // a non-zero exit is INCONCLUSIVE, not negative: the only authority on
      // whether it landed is the remote. Asking is what makes the difference
      // between a recoverable hiccup and a permanent contradiction.
      try {
        runGh(['pr', 'merge', String(pr.number), '--squash'], repoCwd);
      } catch (e) {
        const recheck = readPr(pr.number);
        if (recheck.state !== 'MERGED') throw e;
        const landed = recheck.mergeCommit && recheck.mergeCommit.oid;
        if (!landed) fail('MERGE_SHA_UNRESOLVED', 'PR reports MERGED with no merge commit');
        return {
          mergeSha: landed,
          idempotent: false,
          method: 'SQUASH',
          // Kept, not swallowed: the merge is real, and so is whatever failed
          // around it. An operator reading a clean closure should still see that
          // the command reported an error.
          commandFailedAfterMerge: String((e && e.message) || e).slice(0, 300),
          verifiedAt: { requiredChecks: required.length, mergeStateStatus: observed.mergeStateStatus },
        };
      }

      const after = readPr(pr.number);
      const sha = after.mergeCommit && after.mergeCommit.oid;
      if (!sha) fail('MERGE_SHA_UNRESOLVED', 'merge reported success but no merge commit is visible');
      return {
        mergeSha: sha,
        idempotent: false,
        method: 'SQUASH',
        verifiedAt: { requiredChecks: required.length, mergeStateStatus: observed.mergeStateStatus },
      };
    },

    /**
     * Bring the canonical checkout back in line with the merged target branch.
     *
     * Fetch and fast-forward only. A canonical root that cannot fast-forward has
     * something in it this code did not put there — owner WIP, a detached HEAD,
     * a divergent local main — and the repo law on not touching owner WIP means
     * reporting that, not resolving it.
     */
    async syncTarget(targetBranch) {
      const branch = targetBranch || 'main';
      runGit(['fetch', 'origin', branch], repoCwd);
      const current = runGit(['branch', '--show-current'], repoCwd);
      if (current !== branch) {
        return { synced: false, reason: 'CANONICAL_NOT_ON_TARGET_BRANCH', observed: current || 'DETACHED' };
      }
      try {
        runGit(['merge', '--ff-only', 'origin/' + branch], repoCwd);
      } catch (e) {
        return { synced: false, reason: 'FAST_FORWARD_NOT_POSSIBLE', observed: String(e.message || '').slice(-200) };
      }
      return { synced: true, reason: null, sha: runGit(['rev-parse', 'HEAD'], repoCwd) };
    },
  };
}

module.exports = { createGhMergeProvider, MergeProviderError, checkPasses };
