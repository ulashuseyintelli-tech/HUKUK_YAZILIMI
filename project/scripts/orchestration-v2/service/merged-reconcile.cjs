'use strict';
/**
 * Reconciling a BLOCKED entry whose pull request is already merged.
 *
 * The defect this repairs is a control-plane deadlock, and it is worth stating
 * precisely because the shape recurs. A finalize failed on a gate and left its
 * entry BLOCKED. The merge, however, had already happened — the change is in
 * main. From BLOCKED the queue offered exactly three ways out, and every one of
 * them was a lie:
 *
 *   QUEUED     invents a fresh execution lifecycle for work that is finished
 *   MERGE_READY retries a merge that already landed
 *   CANCELLED  denies a change that is demonstrably in main
 *
 * So the entry stayed BLOCKED, the drain kept selecting it, retried, re-blocked,
 * and unrelated queued work never ran. The state machine could describe every
 * outcome except the one that actually occurred.
 *
 * This module adds the missing one. It observes GitHub, it never acts on it:
 * there is no merge call anywhere in this file, and no attestation is minted.
 * The queue is told what already happened, and told it only after the external
 * facts have been checked one by one.
 *
 * What it deliberately does NOT do is decide that delivery succeeded. A merged
 * change is a CHANGE fact. Whether the capability is delivered is a separate
 * axis with its own evidence, and a task that never declared a delivery
 * contract cannot retroactively be said to have passed one — it is
 * LEGACY_UNVERIFIED, which is the honest word for "merged, never probed".
 */

const { execFileSync } = require('child_process');
const authority = require('../orchestrator/authority.cjs');

/** Refusals. Every one leaves the entry exactly where it was found. */
const REFUSALS = [
  'RECONCILE_AUTHORITY_MISSING',
  'RECONCILE_ENTRY_UNKNOWN',
  'RECONCILE_STATE_NOT_BLOCKED',
  'RECONCILE_HANDOFF_INCOMPLETE',
  'RECONCILE_PR_NOT_MERGED',
  'RECONCILE_MERGE_SHA_MISSING',
  'RECONCILE_MERGE_SHA_UNREACHABLE',
  'RECONCILE_REPOSITORY_MISMATCH',
  'RECONCILE_PR_MISMATCH',
  'RECONCILE_TARGET_BRANCH_MISMATCH',
  'RECONCILE_PR_HEAD_CONFLICT',
  'RECONCILE_GITHUB_UNREADABLE',
];

/**
 * Delivery classification for a merged change.
 *
 * v1 and contractless v2 are LEGACY_UNVERIFIED rather than FAILED: the task
 * never claimed a delivery target, so there is nothing it failed to meet.
 * Demanding a probe the task never declared would manufacture a failure, and
 * calling it PASS would manufacture a success.
 */
const LEGACY_UNVERIFIED = 'LEGACY_UNVERIFIED';
const MERGED_UNVERIFIED = 'MERGED_UNVERIFIED';

class ReconcileError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'ReconcileError';
    this.code = code;
    this.detail = detail || null;
  }
}

const SHA_RE = /^[0-9a-f]{40}$/;

/** Both halves of the handoff are consulted; the entry's own fields win when set. */
function factsOf(entry) {
  const h = (entry && entry.handoff) || {};
  return {
    prNumber: entry.prNumber || h.prNumber || null,
    prHeadSha: entry.prHeadSha || h.prHeadSha || null,
    branch: entry.branch || h.branch || null,
    targetBranch: h.targetBranch || null,
    repository: entry.repository || h.repository || null,
    // §5.12: schema and contract come from the durable record written at
    // MERGE_READY, which was itself built from committed authority artefacts.
    // Re-reading the plan file today would read whatever it says today.
    taskSchemaVersion: h.taskSchemaVersion || entry.taskSchemaVersion || 1,
    deliveryContract: h.deliveryContract || null,
    deliveryContractSha256: h.deliveryContractSha256 || null,
  };
}

/** Default reachability probe: is the merge SHA an ancestor of fresh origin/<target>? */
function defaultReachability(repoCwd) {
  return function isReachable(sha, targetBranch) {
    const git = (args) => execFileSync('git', args, { cwd: repoCwd, encoding: 'utf8', maxBuffer: 32e6 }).trim();
    // Fresh, not cached: a stale remote-tracking ref would let a SHA that is
    // not in main today look reachable because it was fetched when it was.
    git(['fetch', 'origin', String(targetBranch), '--quiet']);
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', sha, 'FETCH_HEAD'], { cwd: repoCwd, stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  };
}

/** The observed repository identity, for the §5.6 check. */
function observedRepository(repoCwd) {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: repoCwd, encoding: 'utf8' }).trim();
    const m = /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function refusal(entry, code, detail) {
  return {
    disposition: 'REFUSED',
    entryId: entry ? entry.entryId : null,
    queueState: entry ? entry.state : null,
    reconciled: false,
    refusal: code,
    detail: detail || null,
  };
}

/**
 * The canonical reconciliation.
 *
 * Asynchronous because the GitHub read is; everything else is synchronous
 * checking. The order matters: authority first, durable facts second, GitHub
 * third, and the transition only after all three agree.
 */
async function reconcileMergedEntry(o) {
  const queue = o.queue;
  const audit = o.audit || (() => {});
  const nowMs = o.nowMs || Date.now();
  const authorityRef = o.reconciliationAuthority;

  // §5.13 — an unauthorized caller is refused before anything is read, so a
  // caller without authority cannot even use this as a GitHub oracle.
  if (typeof authorityRef !== 'string' || authorityRef.trim() === '') {
    return refusal(null, 'RECONCILE_AUTHORITY_MISSING', 'a reconciliation authority reference is required');
  }

  const entry = queue.get(o.entryId);
  if (!entry) return refusal(null, 'RECONCILE_ENTRY_UNKNOWN', String(o.entryId));

  // §5.14 — idempotent. A second run over a reconciled entry reports what the
  // first one concluded and changes nothing.
  if (entry.state === 'CLOSED' && entry.reconciliation) {
    return {
      disposition: 'ALREADY_RECONCILED',
      entryId: entry.entryId,
      queueState: entry.state,
      reconciled: true,
      executionState: 'CLOSED',
      changeState: 'MERGED',
      deliveryState: entry.reconciliation.deliveryState,
      mergeSha: entry.reconciliation.mergeSha,
      evidenceSha256: entry.reconciliation.evidenceSha256 || null,
    };
  }

  // §5.1
  if (entry.state !== 'BLOCKED') {
    return refusal(entry, 'RECONCILE_STATE_NOT_BLOCKED', 'entry holds ' + entry.state);
  }

  // §5.2 — a concrete repository, PR and target, or there is nothing to verify.
  const f = factsOf(entry);
  if (!f.prNumber || !f.targetBranch) {
    return refusal(
      entry,
      'RECONCILE_HANDOFF_INCOMPLETE',
      'durable handoff must identify a pull request and a target branch',
    );
  }

  // §5.6 — repository identity. Checked only when the durable record carries
  // one: inventing a comparison against a field that was never written would
  // fail every pre-WP02 entry for a reason that has nothing to do with truth.
  const repoCwd = o.repoCwd;
  if (f.repository) {
    const observed = observedRepository(repoCwd);
    if (observed && observed !== f.repository) {
      return refusal(entry, 'RECONCILE_REPOSITORY_MISMATCH', 'entry says ' + f.repository + ', origin is ' + observed);
    }
  }

  audit('MERGED_PR_RECONCILIATION_STARTED', {
    entryId: entry.entryId,
    taskId: entry.taskId,
    previousState: entry.state,
    blockerCode: entry.blockerCode || null,
    prNumber: f.prNumber,
    targetBranch: f.targetBranch,
    authorityRef,
    taskSchemaVersion: f.taskSchemaVersion,
  });

  // §5.3/5.4 — fresh GitHub truth. Read only: getPr, nothing else.
  let pr;
  try {
    pr = await o.gh.getPr(f.prNumber);
  } catch (e) {
    return refusal(entry, 'RECONCILE_GITHUB_UNREADABLE', String(e.message).slice(0, 200));
  }
  const observedAt = new Date(nowMs).toISOString();

  if (!pr || String(pr.state).toUpperCase() !== 'MERGED') {
    // MR05: closed-but-not-merged is the case this must never wave through.
    // A closed PR abandoned its change; treating it as delivered would put a
    // CLOSED/MERGED record behind a change that is not in main.
    return refusal(entry, 'RECONCILE_PR_NOT_MERGED', 'GitHub reports state=' + String(pr && pr.state));
  }
  const mergeSha = pr.mergeCommitOid || null;
  if (!mergeSha || !SHA_RE.test(String(mergeSha))) {
    return refusal(entry, 'RECONCILE_MERGE_SHA_MISSING', 'GitHub returned mergeCommitOid=' + String(mergeSha));
  }

  // §5.8 — the PR merged into the branch the entry was targeting.
  if (pr.baseRefName && pr.baseRefName !== f.targetBranch) {
    return refusal(
      entry,
      'RECONCILE_TARGET_BRANCH_MISMATCH',
      'entry targets ' + f.targetBranch + ', PR merged into ' + pr.baseRefName,
    );
  }
  // §5.7 — same pull request, not merely the same number in another repo view.
  if (pr.number != null && String(pr.number) !== String(f.prNumber)) {
    return refusal(entry, 'RECONCILE_PR_MISMATCH', 'asked for ' + f.prNumber + ', GitHub answered ' + pr.number);
  }
  // §5.9 — the recorded head must not contradict GitHub's history. Compared
  // only when both sides have one; a deleted branch reports no head oid, and
  // that is an absence rather than a contradiction.
  if (f.prHeadSha && pr.headRefOid && pr.headRefOid !== f.prHeadSha) {
    return refusal(
      entry,
      'RECONCILE_PR_HEAD_CONFLICT',
      'entry recorded head ' + f.prHeadSha.slice(0, 12) + ', GitHub reports ' + String(pr.headRefOid).slice(0, 12),
    );
  }

  // §5.5 — and the merge commit is actually in the target branch. GitHub
  // saying MERGED is a claim about GitHub; this is the claim about the repo.
  const isReachable = o.isReachable || defaultReachability(repoCwd);
  let reachable;
  try {
    reachable = isReachable(mergeSha, f.targetBranch);
  } catch (e) {
    reachable = false;
  }
  if (!reachable) {
    return refusal(
      entry,
      'RECONCILE_MERGE_SHA_UNREACHABLE',
      mergeSha.slice(0, 12) + ' is not an ancestor of origin/' + f.targetBranch,
    );
  }

  audit('MERGED_PR_GITHUB_VERIFIED', {
    entryId: entry.entryId,
    prNumber: f.prNumber,
    prHead: pr.headRefOid || f.prHeadSha || null,
    targetBranch: pr.baseRefName || f.targetBranch,
    mergeSha,
    observedAt,
    authorityRef,
  });

  // ── delivery classification ────────────────────────────────────────────────
  // §6 for v1 and contractless tasks, §7 for a v2 task that declared one.
  let deliveryState = LEGACY_UNVERIFIED;
  let deliveryDetail = 'task declared no delivery contract; merged but never probed';
  let verification = null;
  if (f.taskSchemaVersion === 2 && f.deliveryContract) {
    if (typeof o.verifyDelivery !== 'function') {
      deliveryState = MERGED_UNVERIFIED;
      deliveryDetail = 'schema v2 declares a delivery contract but no verifier was supplied';
    } else {
      try {
        verification = await o.verifyDelivery({ entry, mergeSha, deliveryContract: f.deliveryContract });
        const v = verification && verification.deliveryState;
        deliveryState = v === 'PASS' ? 'PASS' : v === 'FAILED' ? 'FAILED' : MERGED_UNVERIFIED;
        deliveryDetail = (verification && verification.detail) || deliveryState;
      } catch (e) {
        // Could not validly run is not the same as failed, and the difference
        // is the one this whole programme exists to keep: an unrun probe must
        // never read as a passing one, nor as a failing one.
        deliveryState = MERGED_UNVERIFIED;
        deliveryDetail = 'delivery verification could not run: ' + String(e.message).slice(0, 160);
      }
    }
  }

  const evidence = {
    entryId: entry.entryId,
    taskId: entry.taskId,
    previousState: 'BLOCKED',
    previousBlockerCode: entry.blockerCode || null,
    repository: f.repository || observedRepository(repoCwd),
    prNumber: f.prNumber,
    prHead: pr.headRefOid || f.prHeadSha || null,
    targetBranch: pr.baseRefName || f.targetBranch,
    mergeSha,
    observedAt,
    authorityRef,
    taskSchemaVersion: f.taskSchemaVersion,
    deliveryContractSha256: f.deliveryContractSha256 || null,
    deliveryState,
  };
  const evidenceSha256 = authority.digest(evidence);

  const reconciliation = Object.assign({}, evidence, {
    evidenceSha256,
    reconciledAtMs: nowMs,
    // The word the operator surfaces read. NOT_DONE is terminal for scheduling
    // either way — a merged task with unproven delivery does not go back for
    // another merge, it goes to a human.
    overallState: deliveryState === 'PASS' ? 'DONE' : deliveryState === LEGACY_UNVERIFIED ? 'TERMINAL_LEGACY' : 'NOT_DONE',
    deliveryDetail,
  });

  // Two hops, both guarded, both in the append-only log. The intermediate
  // state is not decoration: a crash between them leaves an entry that says
  // RECONCILING, which is recoverable and readable, rather than one that says
  // BLOCKED while its evidence has already been gathered.
  queue.transition({
    entryId: entry.entryId,
    to: 'RECONCILING',
    expectedPreviousState: 'BLOCKED',
    reconciliationAuthorized: true,
    nowMs,
    patch: { reconciliation },
  });
  const closed = queue.transition({
    entryId: entry.entryId,
    to: 'CLOSED',
    expectedPreviousState: 'RECONCILING',
    reconciliationAuthorized: true,
    nowMs,
    patch: { reconciliation, mergeSha },
  });

  audit('MERGED_PR_RECONCILIATION_COMPLETED', {
    entryId: entry.entryId,
    taskId: entry.taskId,
    previousState: 'BLOCKED',
    repository: evidence.repository,
    prNumber: f.prNumber,
    prHead: evidence.prHead,
    targetBranch: evidence.targetBranch,
    mergeSha,
    observedAt,
    authorityRef,
    taskSchemaVersion: f.taskSchemaVersion,
    deliveryState,
    resultingState: closed.state,
    evidenceSha256,
  });

  return {
    disposition: 'RECONCILED',
    entryId: entry.entryId,
    queueState: closed.state,
    reconciled: true,
    executionState: 'CLOSED',
    changeState: 'MERGED',
    deliveryState,
    deliveryDetail,
    overallState: reconciliation.overallState,
    mergeSha,
    prNumber: f.prNumber,
    evidenceSha256,
    verification,
  };
}

/**
 * Does this BLOCKED entry need reconciliation rather than a finalize retry?
 *
 * Called from the one place that is already talking to GitHub, so that listing
 * the queue stays a local operation. The answer is deliberately narrow: only a
 * merged PR diverts, and anything unreadable stays on the retry path, where the
 * existing gates will refuse it on their own terms.
 */
async function needsReconciliation(o) {
  const entry = o.entry;
  if (!entry || entry.state !== 'BLOCKED') return false;
  const f = factsOf(entry);
  if (!f.prNumber) return false;
  try {
    const pr = await o.gh.getPr(f.prNumber);
    return !!(pr && String(pr.state).toUpperCase() === 'MERGED' && pr.mergeCommitOid);
  } catch (e) {
    return false;
  }
}

module.exports = {
  REFUSALS,
  LEGACY_UNVERIFIED,
  MERGED_UNVERIFIED,
  ReconcileError,
  factsOf,
  observedRepository,
  defaultReachability,
  reconcileMergedEntry,
  needsReconciliation,
};
