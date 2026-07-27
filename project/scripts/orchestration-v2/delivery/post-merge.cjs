'use strict';
/**
 * Verification at the commit that was actually merged.
 *
 * Everything before this point proves something about a BRANCH. A branch is not
 * what runs: it is what was proposed. Between the last green check and the
 * squash commit the target moved, the merge resolved differently, and the tree
 * that now exists was never itself executed by anything.
 *
 * So delivery is re-proved here, at the merge SHA, in a worktree that contains
 * that commit and nothing else:
 *
 *   NOT the feature branch        it no longer exists after --delete-branch
 *   NOT the executor's worktree   it holds the pre-merge tree
 *   NOT the PR head               the squash commit has a different tree
 *   NOT canonical main dirty      uncommitted edits are not the merged code
 *   NOT an inferred sha           "the merge probably produced X" is not evidence
 *
 * The worktree is detached on purpose. A branch checkout could be moved by
 * anything else running on the machine; a detached HEAD at an explicit SHA can
 * only be what it says it is, and is re-asserted after creation rather than
 * assumed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const exec = require('./exec.cjs');

const VERIFY_CLI = path.join(__dirname, 'verify-live.cjs');

class PostMergeError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'PostMergeError';
    this.code = code;
    this.detail = detail || null;
  }
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: exec.buildEnv({}),
    windowsHide: true,
  }).trim();
}

/**
 * Make a detached worktree at one exact commit.
 *
 * Fetches first: the merge commit was created on the remote, and a local clone
 * that has not seen it would fail here in a way easily mistaken for "the merge
 * did not happen".
 */
function createVerificationWorktree(o) {
  const repoCwd = o.repoCwd;
  const mergeSha = o.mergeSha;
  if (!/^[0-9a-f]{40}$/.test(String(mergeSha))) {
    throw new PostMergeError('DELIVERY_EXPECTED_MERGE_SHA_MISSING', String(mergeSha));
  }

  try {
    git(['fetch', 'origin', o.targetBranch || 'main'], repoCwd);
  } catch (e) {
    // Not fatal on its own: the commit may already be local. Failing here would
    // turn a transient network problem into a delivery failure.
  }

  let type = null;
  try {
    type = git(['cat-file', '-t', mergeSha], repoCwd);
  } catch (e) {
    type = null;
  }
  if (type !== 'commit') {
    throw new PostMergeError('DELIVERY_MERGE_COMMIT_ABSENT', mergeSha + ' is not a commit in this repository');
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-postmerge-'));
  git(['worktree', 'add', '--detach', dir, mergeSha], repoCwd);

  // Re-asserted, not assumed. A worktree that is not at the commit it was asked
  // for would produce evidence bound to the wrong tree, which is worse than no
  // evidence: it would look correct.
  const head = git(['rev-parse', 'HEAD'], dir);
  if (head !== mergeSha) {
    throw new PostMergeError('DELIVERY_SHA_MISMATCH', 'worktree HEAD ' + head + ' != ' + mergeSha);
  }
  const status = git(['status', '--porcelain'], dir);
  if (status.length > 0) {
    throw new PostMergeError('DELIVERY_EVIDENCE_DIRTY_TREE', status.split('\n').slice(0, 5).join('; '));
  }

  return {
    dir,
    head,
    remove() {
      try {
        git(['worktree', 'remove', '--force', dir], repoCwd);
        git(['worktree', 'prune'], repoCwd);
        return { disposition: 'REMOVED', path: dir };
      } catch (e) {
        try {
          git(['worktree', 'prune'], repoCwd);
        } catch (e2) {
          /* prune is best-effort */
        }
        // Reported, never thrown: a directory that will not delete does not
        // undo a verification that happened.
        return { disposition: 'ORPHANED_WORKTREE_DIR', path: dir, detail: String((e && e.message) || e).slice(-200) };
      }
    },
  };
}

/**
 * Verify one capability at one merge SHA, through the public verifier.
 *
 * The verifier is SPAWNED, from inside the merge-SHA worktree, so the code that
 * runs is the merged code — not this process's already-loaded modules. Calling
 * the verifier in-process would prove the capability against whatever version
 * happens to be resident, which is the branch's version, which is the thing
 * this whole step exists to stop trusting.
 *
 * @param {object} o
 * @param {string} o.repoCwd
 * @param {string} o.mergeSha
 * @param {string} o.capabilityId
 * @param {string} [o.mode]          default 'sealed'
 * @param {number} [o.timeoutMs]
 * @param {string} [o.evidenceDir]   where to persist the panel
 * @returns {Promise<{verdict, observedState, targetState, panel, worktree, cleanup, failureCode, detail}>}
 */
async function verifyAtMergeSha(o) {
  const wt = createVerificationWorktree(o);
  const cliInWorktree = path.join(wt.dir, 'project', 'scripts', 'orchestration-v2', 'delivery', 'verify-live.cjs');
  const cli = fs.existsSync(cliInWorktree) ? cliInWorktree : VERIFY_CLI;

  const argv = [
    process.execPath,
    cli,
    '--capability',
    o.capabilityId,
    '--mode',
    o.mode || 'sealed',
    '--expected-merge-sha',
    o.mergeSha,
    '--repo',
    wt.dir,
    '--json',
  ];
  if (o.evidenceDir) argv.push('--evidence-dir', o.evidenceDir);

  const res = await exec.run({
    argv,
    cwd: path.join(wt.dir, 'project'),
    timeoutMs: o.timeoutMs || 600000,
  });

  let panel = null;
  try {
    panel = JSON.parse(res.stdout);
  } catch (e) {
    panel = null;
  }
  const cleanup = wt.remove();

  if (res.timedOut) {
    return {
      verdict: 'FAIL',
      failureCode: 'DELIVERY_PROBE_TIMEOUT',
      detail: 'post-merge verification did not finish',
      observedState: 'NOT_RUN',
      targetState: null,
      panel: null,
      worktree: wt.dir,
      cleanup,
    };
  }
  if (!panel || !panel.capabilities || !panel.capabilities.length) {
    // The verifier could not even produce a panel. That is an instrument
    // failure, and reporting it as a delivery failure would blame the system
    // for the instrument.
    return {
      verdict: 'FAIL',
      failureCode: 'DELIVERY_PROBE_INFRASTRUCTURE_ERROR',
      detail: (res.stderr || res.stdout || '').replace(/\s+/g, ' ').slice(0, 300),
      observedState: 'NOT_RUN',
      targetState: null,
      panel: null,
      worktree: wt.dir,
      cleanup,
    };
  }

  const rec = panel.capabilities[0];
  return {
    verdict: rec.verdict,
    failureCode: rec.failureCode || null,
    detail: rec.detail || null,
    observedState: rec.observedState,
    targetState: rec.targetState,
    record: rec,
    panel,
    worktree: wt.dir,
    cleanup,
  };
}

/**
 * The delivery record a CLOSED task carries, in the shape the successor gate
 * reads. Built here so the finalizer and the gate cannot disagree about field
 * names — the kind of drift that produces a gate which never fires.
 */
function deliveryRecordFrom(result, mergeSha) {
  const rec = result.record || {};
  return {
    verdict: result.verdict,
    observedState: result.observedState,
    targetState: result.targetState,
    capabilityId: rec.capabilityId || null,
    mergeSha: mergeSha,
    verifiedAtSha: rec.verifiedAtSha || null,
    expectedMergeSha: rec.expectedMergeSha || mergeSha,
    deliveryContractSha256: rec.deliveryContractSha256 || null,
    probeDefinitionSha256: rec.probeDefinitionSha256 || null,
    commandDigest: rec.commandDigest || null,
    evidenceDigest: rec.evidenceDigest || null,
    failureCode: result.failureCode || null,
    dirtyTree: rec.dirtyTree === true,
  };
}

module.exports = {
  VERIFY_CLI,
  PostMergeError,
  createVerificationWorktree,
  verifyAtMergeSha,
  deliveryRecordFrom,
};
