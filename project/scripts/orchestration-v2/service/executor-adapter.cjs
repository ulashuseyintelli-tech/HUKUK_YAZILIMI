'use strict';
/**
 * The missing link: queue entry → real executor → queue state.
 *
 * runTask has always been able to take a plan all the way to MERGE_READY. The
 * queue has always been able to remember work. Nothing joined them, so the two
 * halves of the system could each be tested and neither could run the other.
 * This is the join.
 *
 * What it is responsible for, and nothing else:
 *
 *   1. Re-validate at dispatch (grant, eligibility, plan hash re-read NOW).
 *   2. Build the real runTask context from the resolved request.
 *   3. Run it.
 *   4. Write what happened into the queue, as queue states, durably.
 *
 * Point 4 is the one that was missing entirely. runTask's disposition used to
 * be printed and discarded; a crash after MERGE_READY lost the fact that a PR
 * existed. Now every stage lands in the append-only log, so the PR number and
 * head SHA survive the process that created them — which is what makes recovery
 * able to say "this one already has a PR, do not open a second".
 */

const queueMod = require('../orchestrator/queue.cjs');
const requestMod = require('./request.cjs');

class AdapterError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'AdapterError';
    this.code = code;
    this.detail = detail || null;
  }
}

/**
 * runTask reports one disposition for a whole attempt. The queue tracks the
 * stages that attempt passed through, so a successful run is replayed into the
 * log rather than collapsed into a single write.
 *
 * Replayed, not guessed: each state below is only written when the result
 * carries the evidence for it (a pr object, a ci object, an attestation).
 */
function stagesFor(result) {
  const stages = ['EXECUTING', 'VALIDATING'];
  if (result.pr && result.pr.number) stages.push('PR_OPEN', 'CI_WAITING');
  if (result.disposition === 'MERGE_READY') stages.push('MERGE_READY');
  return stages;
}

/**
 * The shortest legal route between two lifecycle states.
 *
 * An entry admitted with an authored plan and a ratified grant has, in a real
 * sense, already been through PLANNING and REVIEWING — but it cannot simply
 * appear in EXECUTING, because QUEUED -> EXECUTING is not a transition the
 * table allows, and the table is the single answer to what is legal.
 *
 * So the adapter WALKS. Each intermediate state is written, in order, to the
 * append-only log. That keeps the history readable ("this went through
 * AUTHORIZED at 12:04") instead of showing a jump no reader could reconstruct,
 * and it means adding a lifecycle stage cannot be silently skipped by a
 * teleporting writer.
 *
 * BFS over QUEUE_ALLOWED, ignoring the backward recovery edges and the terminal
 * escapes: a route to EXECUTING that goes through BLOCKED is not a route.
 */
function routeBetween(from, to) {
  if (from === to) return [];
  const SKIP = ['BLOCKED', 'FAILED', 'CANCELLED'];
  const seen = new Set([from]);
  const queueBfs = [[from, []]];
  while (queueBfs.length) {
    const [at, sofar] = queueBfs.shift();
    for (const next of queueMod.QUEUE_ALLOWED[at] || []) {
      if (seen.has(next)) continue;
      const route = sofar.concat([next]);
      // The target is always reachable if the table allows it — the skip list
      // stops BLOCKED being used as a THROUGH-route, not as a destination.
      // Blocking an entry is exactly the case that needs this edge.
      if (next === to) return route;
      if (SKIP.indexOf(next) !== -1) continue;
      seen.add(next);
      queueBfs.push([next, route]);
    }
  }
  return null;
}

function advance(queue, entryId, to, patch, nowMs) {
  const cur = queue.get(entryId);
  const route = routeBetween(cur.state, to);
  if (route === null) throw new AdapterError('ADAPTER_NO_LEGAL_ROUTE', cur.state + ' -> ' + to);
  let last = null;
  for (let i = 0; i < route.length; i++) {
    const step = route[i];
    last = queue.transition({
      entryId,
      to: step,
      expectedPreviousState: queue.get(entryId).state,
      nowMs,
      // The payload belongs to the state it describes, not to the states walked
      // through on the way there.
      patch: step === to ? patch || {} : {},
    });
  }
  return last;
}

/**
 * Run one queue entry through the real orchestrator.
 *
 * @param {object} o
 * @param {object} o.queue
 * @param {object} o.entry          the entry claimed by the caller
 * @param {string} o.repoCwd
 * @param {function} o.buildContext runTask's composition root (injected so
 *                                  tests can drive the adapter without spawning)
 * @param {function} o.runTask
 * @param {function} [o.completeAfterOwnerMerge] merge + sync + cleanup + close
 * @param {function} [o.audit]
 * @param {function} [o.isKillSwitchEngaged]
 * @param {function} [o.isRevoked]
 * @param {function} [o.clock]
 * @returns {{disposition, entryId, queueState, blockerCode, pr, result}}
 */
async function runEntry(o) {
  const queue = o.queue;
  const entry = o.entry;
  const clock = o.clock || (() => Date.now());
  const audit = o.audit || (() => {});
  const repoCwd = o.repoCwd;

  if (!entry || !entry.requestPath) {
    throw new AdapterError('ADAPTER_ENTRY_HAS_NO_REQUEST', entry && entry.entryId);
  }

  // NOTE: this adapter does NOT re-validate. dispatch.revalidate does, and it
  // is invoked by the service's dispatch guard immediately before this runs.
  // Two revalidation points would drift, and a drifting gate is worse than one
  // gate — so the answer to "is this still allowed?" has exactly one owner.
  const resolveNow = () => requestMod.load({ repoCwd, requestPath: entry.requestPath });

  const resolved = resolveNow();

  const ctx = o.buildContext({
    repoCwd,
    spec: resolved.spec,
    grant: resolved.grant || resolved.standingGrant,
    standingGrant: resolved.standingGrant,
    autoMerge: resolved.request.autoMerge === true,
    lane: entry.executorLane || resolved.request.executorLane,
    targetBranch: resolved.request.targetBranch,
    // Carried from the queue entry, where an authorized resume recorded it.
    // runTask owns the task-store BLOCKED -> ELIGIBLE edge; this is the flag
    // that tells it the resume was authorized, and without it a resumed entry
    // is refused with BLOCKED_RESUME_NOT_AUTHORIZED — correctly.
    resumeFromBlocked: entry.resumeFromBlocked === true,
    prompt: o.prompt || '',
    expectedHeadBranch: o.expectedHeadBranch || null,
    isRevoked: o.isRevoked ? () => o.isRevoked(resolved.standingGrant) === true : undefined,
    isKillSwitchEngaged: o.isKillSwitchEngaged,
  });

  advance(queue, entry.entryId, 'EXECUTING', {}, clock());
  // Not EXECUTOR_STARTED: runTask validates authority, base drift and the
  // lease long before it spawns anything, and a log line claiming an executor
  // started 9ms before a grant refusal is a lie the log tells about itself.
  audit('TASK_DISPATCHED', { entryId: entry.entryId, taskId: entry.taskId, lane: ctx.holder });

  let result;
  try {
    result = await o.runTask(ctx);
  } catch (e) {
    audit('EXECUTOR_THREW', { entryId: entry.entryId, code: e && e.code, message: String((e && e.message) || e).slice(0, 300) });
    advance(queue, entry.entryId, 'BLOCKED', { blockerCode: (e && e.code) || 'EXECUTOR_THREW', owner: null }, clock());
    return { disposition: 'BLOCKED', entryId: entry.entryId, queueState: 'BLOCKED', blockerCode: (e && e.code) || 'EXECUTOR_THREW', pr: null, result: null };
  }

  if (result.disposition === 'BLOCKED') {
    audit('TASK_BLOCKED', { entryId: entry.entryId, blockerCode: result.blockerCode, detail: result.detail || null });
    // EXECUTING -> BLOCKED is legal; the entry keeps its blocker for an operator.
    advance(queue, entry.entryId, 'BLOCKED', { blockerCode: result.blockerCode, owner: null }, clock());
    return { disposition: 'BLOCKED', entryId: entry.entryId, queueState: 'BLOCKED', blockerCode: result.blockerCode, pr: null, result };
  }

  // Replay the stages the evidence supports. The PR number and head SHA are
  // written as they are reached, so a crash later cannot lose the fact that a
  // PR exists — which is exactly what stops a second one being opened.
  const patchFor = (state) => {
    if (state === 'PR_OPEN') {
      return {
        prNumber: (result.pr && result.pr.number) || null,
        prHeadSha: (result.pr && result.pr.headSha) || null,
        branch: (result.pr && result.pr.branch) || null,
        worktreePath: result.worktreePath || null,
      };
    }
    if (state === 'MERGE_READY') return { attestationAt: (result.attestation && result.attestation.builtAt) || null };
    return {};
  };
  for (const state of stagesFor(result)) {
    if (queue.get(entry.entryId).state === state) continue;
    advance(queue, entry.entryId, state, patchFor(state), clock());
  }

  audit('TASK_REACHED', {
    entryId: entry.entryId,
    disposition: result.disposition,
    queueState: queue.get(entry.entryId).state,
    pr: (result.pr && result.pr.number) || null,
  });

  // MERGE_READY was where the chain stopped. runTask reaches it and returns;
  // completeAfterOwnerMerge exists to take it the rest of the way and had ZERO
  // non-test callers, so every task ended parked with an open PR and a queue
  // entry nobody would ever advance.
  //
  // Two keys, as everywhere else: the request asks for it AND the standing
  // grant authorizes it. Absent either, the task stays at MERGE_READY for a
  // human — which is the pilot's behaviour, unchanged.
  const wantsMerge = resolved.request.autoMerge === true;
  const grantAllows = !!(resolved.standingGrant && resolved.standingGrant.mergePolicy
    && resolved.standingGrant.mergePolicy.autoMergeAuthorized === true);

  if (result.disposition !== 'MERGE_READY' || !wantsMerge || !grantAllows) {
    return {
      disposition: result.disposition,
      entryId: entry.entryId,
      queueState: queue.get(entry.entryId).state,
      blockerCode: null,
      pr: result.pr || null,
      result,
    };
  }

  // The kill switch is read once more here. A merge is the least reversible
  // thing this system does, so the last thing before it is a fresh look at the
  // one control that means stop.
  if (o.isKillSwitchEngaged && o.isKillSwitchEngaged() === true) {
    audit('MERGE_REFUSED', { entryId: entry.entryId, refusal: 'KILL_SWITCH_ENGAGED' });
    advance(queue, entry.entryId, 'BLOCKED', { blockerCode: 'KILL_SWITCH_ENGAGED', owner: null }, clock());
    return { disposition: 'BLOCKED', entryId: entry.entryId, queueState: 'BLOCKED', blockerCode: 'KILL_SWITCH_ENGAGED', pr: result.pr || null, result };
  }

  advance(queue, entry.entryId, 'MERGING', {}, clock());
  audit('MERGE_ATTEMPTED', { entryId: entry.entryId, pr: (result.pr && result.pr.number) || null });

  let closure;
  try {
    closure = await o.completeAfterOwnerMerge(Object.assign({}, ctx, { result }));
  } catch (e) {
    audit('MERGE_THREW', { entryId: entry.entryId, code: e && e.code, message: String((e && e.message) || e).slice(0, 300) });
    advance(queue, entry.entryId, 'BLOCKED', { blockerCode: (e && e.code) || 'MERGE_THREW', owner: null }, clock());
    return { disposition: 'BLOCKED', entryId: entry.entryId, queueState: 'BLOCKED', blockerCode: (e && e.code) || 'MERGE_THREW', pr: result.pr || null, result };
  }

  if (closure.disposition !== 'CLOSED') {
    // Its own blocker, not a generic one. ATTESTATION_INVALIDATED means the
    // world moved between MERGE_READY and the merge, and an operator needs to
    // read that rather than "merge failed".
    audit('MERGE_BLOCKED', { entryId: entry.entryId, blockerCode: closure.blockerCode, reasons: closure.reasons || null });
    advance(queue, entry.entryId, 'BLOCKED', { blockerCode: closure.blockerCode || 'MERGE_NOT_COMPLETED', owner: null }, clock());
    return { disposition: 'BLOCKED', entryId: entry.entryId, queueState: 'BLOCKED', blockerCode: closure.blockerCode || 'MERGE_NOT_COMPLETED', pr: result.pr || null, result };
  }

  // MERGED -> SYNCING -> CLEANING -> CLOSED, each written as it happens. The
  // merge sha lands with MERGED so it survives a crash during cleanup: a merge
  // that happened and was forgotten is worse than one that never happened.
  advance(queue, entry.entryId, 'MERGED', { mergeSha: closure.mergeSha }, clock());
  advance(queue, entry.entryId, 'SYNCING', {}, clock());
  advance(queue, entry.entryId, 'CLEANING', { cleanup: (closure.cleanup && closure.cleanup.disposition) || null }, clock());
  advance(queue, entry.entryId, 'CLOSED', { owner: null }, clock());

  audit('TASK_CLOSED', {
    entryId: entry.entryId,
    mergeSha: closure.mergeSha,
    pr: (result.pr && result.pr.number) || null,
    cleanup: (closure.cleanup && closure.cleanup.disposition) || null,
  });

  return {
    disposition: 'CLOSED',
    entryId: entry.entryId,
    queueState: 'CLOSED',
    blockerCode: null,
    pr: result.pr || null,
    mergeSha: closure.mergeSha,
    result,
  };
}

module.exports = { AdapterError, stagesFor, routeBetween, runEntry };
