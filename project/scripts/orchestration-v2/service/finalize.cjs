'use strict';
/**
 * Finalization from durable state.
 *
 * #1694 wired MERGE_READY to CLOSED and that was the missing half of the chain.
 * But it wired it IN-LINE: the closure runs inside the same runOnce() call that
 * produced the attestation, from an in-memory context holding live providers,
 * a lease handle and two closures. Everything needed to finish the task lives
 * in that process and nowhere else.
 *
 * Which means the one case a finalizer exists for is the one it cannot handle.
 * Kill the process between MERGE_READY and the merge — a reboot, a lost SSH
 * session, an OOM — and the queue holds an entry in MERGE_READY, with a real
 * open PR, that no command can advance. The queue's own recovery table says as
 * much: MERGE_READY rewinds to MERGE_READY, which clears the dead owner and
 * changes nothing, because nothing existed to pick it up.
 *
 * So this module makes the handoff DURABLE and the finalizer REACHABLE:
 *
 *   buildHandoff()    everything the second half needs, as plain JSON —
 *                     no functions, no closures, no providers
 *   finalizeEntry()   rebuilds the context from that record and finishes,
 *                     whether it is the process that made it or not
 *
 * There is one finalization path. The adapter calls this rather than calling
 * completeAfterOwnerMerge itself, so the in-line route and the recovery route
 * cannot drift — a second, weaker closure path is exactly the shape that let
 * "merged" and "closed" come apart in the first place.
 */

const path = require('path');

const queueMod = require('../orchestrator/queue.cjs');
const requestMod = require('./request.cjs');

class FinalizeError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'FinalizeError';
    this.code = code;
    this.detail = detail || null;
  }
}

/** Queue states from which finalization is the correct next step. */
const FINALIZABLE = ['MERGE_READY'];

/**
 * States a crash can strand an entry in AFTER the merge decision was taken.
 *
 * They are listed apart from FINALIZABLE because the merge has already happened
 * for some of them, and the difference decides whether performMerge may be
 * called at all. MERGING is the genuinely ambiguous one — only the remote can
 * say whether the merge landed — and the provider answers it idempotently.
 */
const RESUMABLE_AFTER_MERGE = ['MERGING', 'MERGED', 'SYNCING', 'CLEANING'];

/**
 * The durable MERGE_READY handoff.
 *
 * Plain JSON by construction. The rule is not stylistic: anything that cannot
 * survive JSON.stringify cannot survive a process boundary, and a handoff that
 * silently drops a provider would produce a finalizer that works in-process and
 * fails after a restart — which is precisely the bug being fixed.
 *
 * Contains no credential. It is written into a queue log that is read by
 * operators and quoted in audit records.
 */
function buildHandoff(o) {
  const entry = o.entry;
  const resolved = o.resolved;
  const result = o.result;
  const att = result.attestation || {};

  return {
    schemaVersion: 1,
    entryId: entry.entryId,
    taskId: result.taskId || entry.taskId,
    taskAttemptId: result.taskAttemptId || null,
    taskSpecSha256: att.taskSpecSha256 || resolved.taskSpecSha256 || null,
    grantId: att.grantId || null,
    grantSha256: att.grantSha256 || null,
    standingGrantId: (resolved.standingGrant && resolved.standingGrant.standingGrantId) || null,
    // The finalizer re-resolves authority from here rather than trusting a copy
    // of it: a grant revoked after MERGE_READY must still stop the merge.
    requestPath: entry.requestPath || null,
    prNumber: att.prNumber || (result.pr && result.pr.number) || null,
    prHeadSha: att.prHeadSha || (result.pr && result.pr.headSha) || null,
    branch: (result.pr && result.pr.branch) || entry.branch || null,
    worktreePath: result.worktreePath || null,
    targetBranch: att.targetBranch || resolved.request.targetBranch || 'main',
    targetBranchObservedSha: att.targetBranchObservedSha || null,
    mergeBaseSha: att.mergeBaseSha || null,
    requiredCiResultSetSha256: att.requiredCiResultSetSha256 || null,
    // Fencing identity. Carried so a finalizer running in another process can
    // prove it is finishing the attempt that was attested, not a later one.
    leaseEpoch: result.leaseEpoch != null ? result.leaseEpoch : att.leaseEpoch,
    holderToken: result.holderToken || att.holderToken || null,
    executorLane: entry.executorLane || null,
    // The attestation itself, whole. revalidate() compares against it field by
    // field, so a partial copy would silently skip whichever checks it lost.
    attestation: att,
    createdAt: att.createdAt || null,
    expiresAt: att.expiresAt || null,
    // ── delivery identity (schema v2) ────────────────────────────────────────
    //
    // Carried so a restarted process knows WHAT it must verify after the merge
    // without re-deriving it from a plan it may no longer be able to read.
    //
    // Transport, never authority: finalization re-reads the task, the grants
    // and the manifest from canonical sources and compares. A handoff copied
    // from an older task version therefore fails closed rather than verifying
    // the wrong claim — the handoff can say what to check, never whether the
    // check is still the ratified one.
    taskSchemaVersion: (resolved.spec && resolved.spec.schemaVersion) || 1,
    deliveryContract: (resolved.spec && resolved.spec.deliveryContract) || null,
    deliveryContractSha256: (resolved.spec && resolved.spec.deliveryContract)
      ? require('../orchestrator/authority.cjs').deliveryContractDigest(resolved.spec.deliveryContract)
      : null,
  };
}

/** Everything a handoff must carry to be finalizable at all. */
const REQUIRED_HANDOFF_FIELDS = ['entryId', 'taskId', 'requestPath', 'prNumber', 'attestation'];

function assertHandoff(h) {
  if (!h || typeof h !== 'object') {
    throw new FinalizeError('FINALIZATION_CONTEXT_MISSING', 'the entry carries no MERGE_READY handoff');
  }
  for (const f of REQUIRED_HANDOFF_FIELDS) {
    if (h[f] === null || h[f] === undefined || h[f] === '') {
      throw new FinalizeError('FINALIZATION_CONTEXT_INCOMPLETE', f);
    }
  }
  if (!h.attestation.conjunction) {
    throw new FinalizeError('FINALIZATION_CONTEXT_INCOMPLETE', 'attestation.conjunction');
  }
  return h;
}

/**
 * Rebuild the `result` shape completeAfterOwnerMerge consumes.
 *
 * Two of its fields are functions the original run held and a restarted process
 * cannot inherit: `release` and `cleanupWorktree`. Both are supplied here as
 * real operations rather than as no-ops — a finalizer that silently skipped
 * cleanup would leave a worktree behind on exactly the path where nobody is
 * watching.
 */
function rebuildResult(h, deps) {
  return {
    taskId: h.taskId,
    taskAttemptId: h.taskAttemptId,
    leaseEpoch: h.leaseEpoch,
    holderToken: h.holderToken,
    attestation: h.attestation,
    pr: { number: h.prNumber, headSha: h.prHeadSha, branch: h.branch },
    worktreePath: h.worktreePath,
    cleanupWorktree: deps.cleanupWorktree || (() => ({ disposition: 'NOT_ATTEMPTED_NO_WORKTREE_RECORDED' })),
    release: deps.release || (() => undefined),
  };
}

/**
 * Remove the attempt's isolated worktree, by the repository's own safe order.
 *
 * Never recursive deletion: repo policy forbids it and the reason is live in
 * this tree — several worktrees carry node_modules junctions pointing back at
 * the canonical repository. `git worktree remove` refuses rather than follows.
 * A residual is reported, never thrown: a directory that will not delete does
 * not undo a merge that happened.
 */
function makeWorktreeCleanup(repoCwd, worktreePath) {
  if (!worktreePath) return null;
  return () => {
    const { execFileSync } = require('child_process');
    const git = (args) => execFileSync('git', args, { cwd: repoCwd, encoding: 'utf8' }).trim();
    try {
      git(['worktree', 'remove', '--force', worktreePath]);
      git(['worktree', 'prune']);
      return { disposition: 'REMOVED', path: worktreePath };
    } catch (e) {
      try {
        git(['worktree', 'prune']);
      } catch (e2) {
        /* prune is best-effort */
      }
      return {
        disposition: 'ORPHANED_WORKTREE_DIR',
        path: worktreePath,
        detail: String((e && e.message) || e).slice(-200),
      };
    }
  };
}

/**
 * Finish one entry, from whatever durable state it is in.
 *
 * The idempotency cases the owner brief enumerates, and where each is answered:
 *
 *   A  PR open, gates pass          performMerge merges exactly once
 *   B  PR already merged            gh-merge-provider returns the existing sha
 *   C  merged with an unexpected    MERGE_PR_NOT_OWNED / MERGE_HEAD_DRIFTED
 *      head or method
 *   D  crash after merge, before    entry is in MERGING/MERGED; the provider's
 *      the state write              idempotent read resumes from the real sha
 *   E  crash after evidence,        entry is in SYNCING/CLEANING; the merge is
 *      before CLOSED                not retried, only the tail runs
 *   F  kill switch engaged          refused before performMerge is reached
 *   G  grant revoked                same, via the re-resolved standing grant
 *   H  attestation stale            completeAfterOwnerMerge's own fresh
 *                                   revalidation blocks it
 *
 * @returns {{disposition, entryId, queueState, mergeSha, blockerCode, detail}}
 */
async function finalizeEntry(o) {
  const queue = o.queue;
  const repoCwd = o.repoCwd;
  const clock = o.clock || (() => Date.now());
  const audit = o.audit || (() => {});

  const entry = queue.get(o.entryId);
  if (!entry) throw new FinalizeError('QUEUE_ENTRY_UNKNOWN', String(o.entryId));

  const finalizable = FINALIZABLE.indexOf(entry.state) !== -1;
  const resumable = RESUMABLE_AFTER_MERGE.indexOf(entry.state) !== -1;
  if (!finalizable && !resumable) {
    return {
      disposition: 'NOT_FINALIZABLE',
      entryId: entry.entryId,
      queueState: entry.state,
      mergeSha: entry.mergeSha || null,
      blockerCode: null,
      detail:
        entry.state === 'CLOSED'
          ? 'already closed'
          : 'state ' + entry.state + ' is not a point finalization acts from',
    };
  }

  const h = assertHandoff(entry.handoff);

  // The kill switch is read here and again inside the merge provider. This one
  // stops the attempt before any state moves; that one stops the merge itself.
  //
  // It does NOT move the entry to BLOCKED, and that is a deliberate change from
  // the inline path #1694 shipped. A kill switch is transient — an operator
  // engages it, deals with the incident, releases it — while BLOCKED is not: the
  // queue table lets BLOCKED go only to QUEUED, and QUEUED re-runs the executor.
  // Blocking a MERGE_READY entry for a switch that will be released in ten
  // minutes therefore sets up a SECOND pull request for work whose first one is
  // already open. Leaving it in MERGE_READY keeps it finalizable, and the
  // refusal is in the audit log where an operator reads it.
  if (o.isKillSwitchEngaged && o.isKillSwitchEngaged() === true) {
    audit('FINALIZE_REFUSED', { entryId: entry.entryId, refusal: 'KILL_SWITCH_ENGAGED' });
    return {
      disposition: 'BLOCKED',
      entryId: entry.entryId,
      queueState: entry.state,
      mergeSha: null,
      blockerCode: 'KILL_SWITCH_ENGAGED',
      detail: 'the kill switch is engaged; nothing merges while that file exists',
    };
  }

  // Authority is re-resolved from disk, not read from the handoff. A grant
  // revoked, expired or edited while the entry sat in the queue must be seen
  // now — that is the entire reason the handoff stores a PATH and not a copy.
  let resolved;
  try {
    resolved = requestMod.load({ repoCwd, requestPath: h.requestPath });
  } catch (e) {
    audit('FINALIZE_REFUSED', { entryId: entry.entryId, refusal: e.code || 'REQUEST_UNRESOLVABLE' });
    return {
      disposition: 'BLOCKED',
      entryId: entry.entryId,
      queueState: entry.state,
      mergeSha: null,
      blockerCode: e.code || 'FINALIZATION_CONTEXT_MISSING',
      detail: 'the entry can no longer resolve its own authority: ' + String(e.message).slice(0, 200),
    };
  }

  // Two keys, and BOTH are checked here rather than by the caller.
  //
  // The adapter checked them and this function did not, which made the rule
  // bypassable by taking the other route: `orch:service finalize --entry` and
  // the run-until-idle drain both reach this code directly, and both would have
  // merged a task whose request never asked for auto-merge. A rule enforced on
  // one of two paths to the same merge is not a rule — it is the weaker path's
  // policy, which is the exact shape #1687 removed from orch:run.
  //
  // So the decision lives in the one place that performs the merge, and every
  // caller inherits it.
  const standingGrant = resolved.standingGrant;
  const wantsMerge = resolved.request && resolved.request.autoMerge === true;
  const grantAllows = !!(standingGrant && standingGrant.mergePolicy && standingGrant.mergePolicy.autoMergeAuthorized === true);
  if (!wantsMerge || !grantAllows) {
    // Not a failure, and deliberately not a state change. The pilot's default is
    // that a human merges; an entry parked at MERGE_READY under a request or a
    // grant that does not authorize auto-merge is behaving exactly as designed,
    // and moving it to BLOCKED would take it out of the finalizable set for a
    // condition that is not an error.
    return {
      disposition: 'MERGE_NOT_AUTHORIZED',
      entryId: entry.entryId,
      queueState: entry.state,
      mergeSha: null,
      blockerCode: null,
      detail: !wantsMerge
        ? 'the request for ' + h.taskId + ' does not ask for auto-merge; this entry is waiting for a human merge'
        : 'standing grant ' + (h.standingGrantId || '(none)') +
          ' does not authorize auto-merge; this entry is waiting for a human merge',
    };
  }

  const ctx = o.buildContext({
    repoCwd,
    spec: resolved.spec,
    grant: resolved.grant || standingGrant,
    standingGrant,
    autoMerge: true,
    lane: h.executorLane || resolved.request.executorLane,
    targetBranch: h.targetBranch,
    // PR-scoped merge: the provider refuses any PR whose head branch is not the
    // one this attempt created. Without it, a grant plus a PR number would merge
    // whatever that number happened to be.
    expectedHeadBranch: h.branch,
    isRevoked: o.isRevoked ? () => o.isRevoked(standingGrant) === true : undefined,
    isKillSwitchEngaged: o.isKillSwitchEngaged,
  });

  const result = rebuildResult(h, {
    cleanupWorktree: makeWorktreeCleanup(repoCwd, h.worktreePath),
    release: o.release || null,
  });

  // MERGE_READY -> MERGING is written BEFORE the merge is attempted, so a crash
  // during the merge leaves a state that says "a merge may have started" rather
  // than one that says "nothing happened".
  if (entry.state === 'MERGE_READY') {
    queue.transition({
      entryId: entry.entryId,
      to: 'MERGING',
      expectedPreviousState: 'MERGE_READY',
      nowMs: clock(),
      patch: {},
    });
  }
  audit('FINALIZE_ATTEMPTED', { entryId: entry.entryId, pr: h.prNumber, fromState: entry.state });

  let deliveryResult = null;
  let closure;
  try {
    closure = await o.completeAfterOwnerMerge(Object.assign({}, ctx, { result }));
  } catch (e) {
    audit('FINALIZE_THREW', { entryId: entry.entryId, code: e && e.code, message: String((e && e.message) || e).slice(0, 300) });
    queue.transition({
      entryId: entry.entryId,
      to: 'BLOCKED',
      expectedPreviousState: queue.get(entry.entryId).state,
      nowMs: clock(),
      patch: { blockerCode: (e && e.code) || 'FINALIZE_THREW', owner: null },
    });
    return {
      disposition: 'BLOCKED',
      entryId: entry.entryId,
      queueState: 'BLOCKED',
      mergeSha: null,
      blockerCode: (e && e.code) || 'FINALIZE_THREW',
      detail: String((e && e.message) || e).slice(0, 300),
    };
  }

  if (closure.disposition !== 'CLOSED') {
    audit('FINALIZE_BLOCKED', { entryId: entry.entryId, blockerCode: closure.blockerCode, reasons: closure.reasons || null });
    queue.transition({
      entryId: entry.entryId,
      to: 'BLOCKED',
      expectedPreviousState: queue.get(entry.entryId).state,
      nowMs: clock(),
      patch: { blockerCode: closure.blockerCode || 'MERGE_NOT_COMPLETED', owner: null },
    });
    return {
      disposition: 'BLOCKED',
      entryId: entry.entryId,
      queueState: 'BLOCKED',
      mergeSha: null,
      blockerCode: closure.blockerCode || 'MERGE_NOT_COMPLETED',
      detail: (closure.reasons || []).join(',') || null,
    };
  }

  // The merge sha lands with MERGED specifically: a merge that happened and was
  // forgotten is worse than one that never happened, so it is durable before
  // sync or cleanup can fail.
  //
  // Each step is skipped if the entry is already past it, which is what makes
  // resuming from a crash in SYNCING or CLEANING finish the tail rather than
  // re-run the merge.
  // MERGED and SYNCING first. The merge sha is durable before anything that can
  // fail runs, because a merge that happened and was forgotten is worse than one
  // that never happened.
  for (const to of ['MERGED', 'SYNCING']) {
    const at = queue.get(entry.entryId).state;
    if (['MERGED', 'SYNCING', 'CLEANING', 'CLOSED'].indexOf(at) >= ['MERGED', 'SYNCING', 'CLEANING', 'CLOSED'].indexOf(to)) continue;
    queue.transition({
      entryId: entry.entryId,
      to,
      expectedPreviousState: at,
      nowMs: clock(),
      patch: to === 'MERGED' ? { mergeSha: closure.mergeSha } : {},
    });
  }

  // ── delivery verification, at the sha the merge actually produced ─────────
  //
  // Represented as a durable SUBSTATE of SYNCING rather than a new queue state.
  // Adding DELIVERY_VERIFYING to the table would be a migration of every reader
  // — recovery's rewind map, the slot calculation, the operator console — for a
  // phase that lasts one call, and recovery already knows how to resume from
  // SYNCING. What matters is that the durable log distinguishes the facts:
  // merge completed, verification started, verification's verdict, cleanup,
  // CLOSED. It does, by payload, at the same instant it would by state name.
  // The contract is re-read from the task, not taken from the handoff. The
  // handoff says which claim to verify; whether that claim is still the
  // ratified one is a question only the canonical sources can answer, and a
  // handoff written before the task was amended would otherwise verify a
  // capability the grant no longer covers.
  const liveSpec = resolved.spec || {};
  const contract = liveSpec.deliveryContract || null;
  if (h.deliveryContractSha256 || contract) {
    const authorityMod = require('../orchestrator/authority.cjs');
    if (!contract) {
      return blockedFinalization(queue, entry, clock, audit, 'FINALIZATION_DELIVERY_CONTRACT_MISSING',
        'the handoff declares a delivery contract the task no longer carries');
    }
    const liveDigest = authorityMod.deliveryContractDigest(contract);
    if (h.deliveryContractSha256 && h.deliveryContractSha256 !== liveDigest) {
      return blockedFinalization(queue, entry, clock, audit, 'FINALIZATION_DELIVERY_CONTRACT_CHANGED',
        'handoff=' + h.deliveryContractSha256 + ' live=' + liveDigest);
    }
  }
  if (contract && o.verifyDelivery) {
    queue.transition({
      entryId: entry.entryId,
      to: 'SYNCING',
      expectedPreviousState: 'SYNCING',
      nowMs: clock(),
      patch: { deliveryPhase: 'DELIVERY_VERIFYING', mergeSha: closure.mergeSha },
    });
    audit('DELIVERY_VERIFY_STARTED', { entryId: entry.entryId, mergeSha: closure.mergeSha, capabilityId: contract.capabilityId });

    let delivery;
    try {
      delivery = await o.verifyDelivery({
        repoCwd,
        mergeSha: closure.mergeSha,
        capabilityId: contract.capabilityId,
        targetBranch: h.targetBranch,
        timeoutMs: contract.timeoutMs,
      });
    } catch (e) {
      delivery = {
        verdict: 'FAIL',
        failureCode: (e && e.code) || 'POST_MERGE_DELIVERY_FAILED',
        detail: String((e && e.message) || e).slice(0, 300),
        observedState: 'NOT_RUN',
      };
    }

    if (delivery.verdict !== 'PASS' && delivery.verdict !== 'NOT_APPLICABLE') {
      // The merge HAPPENED. Saying otherwise, retrying it, or opening a second
      // PR would each be a lie about the repository's actual state — so the
      // entry blocks with the merge sha intact and the delivery failure named,
      // and a later authorized finalize resumes at verification rather than at
      // the merge.
      audit('DELIVERY_VERIFY_FAILED', {
        entryId: entry.entryId,
        mergeSha: closure.mergeSha,
        verdict: delivery.verdict,
        failureCode: delivery.failureCode || null,
      });
      queue.transition({
        entryId: entry.entryId,
        to: 'BLOCKED',
        expectedPreviousState: queue.get(entry.entryId).state,
        nowMs: clock(),
        patch: {
          blockerCode: delivery.failureCode || 'POST_MERGE_DELIVERY_FAILED',
          mergeSha: closure.mergeSha,
          deliveryPhase: 'DELIVERY_FAILED',
          delivery: delivery.record || delivery,
          owner: null,
        },
      });
      return {
        disposition: 'MERGED_UNVERIFIED',
        entryId: entry.entryId,
        queueState: 'BLOCKED',
        // Reported, not hidden: the change IS merged, and the operator's next
        // move depends on knowing that.
        mergeSha: closure.mergeSha,
        blockerCode: delivery.failureCode || 'POST_MERGE_DELIVERY_FAILED',
        delivery,
        detail: delivery.detail || 'delivery verification did not pass at the merge sha',
      };
    }

    audit('DELIVERY_VERIFY_PASSED', {
      entryId: entry.entryId,
      mergeSha: closure.mergeSha,
      capabilityId: contract.capabilityId,
      evidenceDigest: (delivery.record && delivery.record.evidenceDigest) || null,
    });
    queue.transition({
      entryId: entry.entryId,
      to: 'SYNCING',
      expectedPreviousState: 'SYNCING',
      nowMs: clock(),
      patch: { deliveryPhase: 'DELIVERY_VERIFIED', delivery: delivery.record || delivery },
    });
    deliveryResult = delivery;
  }

  for (const to of ['CLEANING', 'CLOSED']) {
    const at = queue.get(entry.entryId).state;
    if (['CLEANING', 'CLOSED'].indexOf(at) >= ['CLEANING', 'CLOSED'].indexOf(to)) continue;
    queue.transition({
      entryId: entry.entryId,
      to,
      expectedPreviousState: at,
      nowMs: clock(),
      patch: to === 'CLEANING' ? { cleanup: (closure.cleanup && closure.cleanup.disposition) || null } : { owner: null },
    });
  }

  audit('FINALIZE_CLOSED', {
    entryId: entry.entryId,
    mergeSha: closure.mergeSha,
    pr: h.prNumber,
    cleanup: (closure.cleanup && closure.cleanup.disposition) || null,
  });

  return {
    disposition: 'CLOSED',
    entryId: entry.entryId,
    queueState: 'CLOSED',
    mergeSha: closure.mergeSha,
    blockerCode: null,
    cleanup: closure.cleanup || null,
    delivery: deliveryResult,
    detail: null,
  };
}

/**
 * Block an entry whose delivery identity no longer matches the ratified one.
 *
 * The merge has already happened by the time this can fire, so the entry keeps
 * its merge sha and the operator is told exactly which digest moved. Retrying
 * the merge, or closing anyway, would each be a lie about what was verified.
 */
function blockedFinalization(queue, entry, clock, audit, code, detail) {
  audit('FINALIZE_BLOCKED', { entryId: entry.entryId, blockerCode: code, detail });
  queue.transition({
    entryId: entry.entryId,
    to: 'BLOCKED',
    expectedPreviousState: queue.get(entry.entryId).state,
    nowMs: clock(),
    patch: { blockerCode: code, deliveryPhase: 'DELIVERY_IDENTITY_CHANGED', owner: null },
  });
  return {
    disposition: 'BLOCKED',
    entryId: entry.entryId,
    queueState: 'BLOCKED',
    mergeSha: queue.get(entry.entryId).mergeSha || null,
    blockerCode: code,
    detail,
  };
}

/** Entries a finalize pass would act on, without acting on them. */
function finalizable(queue) {
  return queue
    .list()
    .filter((e) => FINALIZABLE.indexOf(e.state) !== -1 || RESUMABLE_AFTER_MERGE.indexOf(e.state) !== -1)
    .map((e) => ({
      entryId: e.entryId,
      taskId: e.taskId,
      state: e.state,
      prNumber: (e.handoff && e.handoff.prNumber) || e.prNumber || null,
      // An entry in a finalizable state with no handoff is the pre-WP02 shape.
      // Reported rather than hidden: it needs an operator, and saying so is the
      // difference between a known gap and a silent one.
      hasHandoff: !!(e.handoff && e.handoff.attestation),
    }));
}

module.exports = {
  FINALIZABLE,
  RESUMABLE_AFTER_MERGE,
  REQUIRED_HANDOFF_FIELDS,
  FinalizeError,
  buildHandoff,
  assertHandoff,
  rebuildResult,
  makeWorktreeCleanup,
  blockedFinalization,
  finalizeEntry,
  finalizable,
};
