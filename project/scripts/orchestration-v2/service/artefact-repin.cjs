'use strict';
/**
 * Re-pinning an entry's artefact digest after an authorized artefact correction.
 *
 * The pin exists for a good reason: a task cannot be edited after admission and
 * run anyway. Dispatch re-reads the committed artefacts, re-digests them, and
 * refuses ARTEFACT_DIGEST_MISMATCH if they are not the ones that were admitted.
 *
 * That guard has one blind spot, and the dogfood run walked straight into it.
 * The R02 request itself was DEFECTIVE — it named no task grant, so dispatch
 * validated the standing grant against task-grant rules and refused. The owner
 * authorized the correction; it merged; and then the entry could not run,
 * because the artefacts were no longer the ones it had pinned. The guard was
 * doing its job. It simply had no way to distinguish "someone edited the task
 * to sneak past admission" from "the owner corrected a defect the task could
 * not run without".
 *
 * This is the distinction, made explicit and made narrow:
 *
 *   the WORK must not change    taskSpecSha256 — the plan digest — must be
 *                               IDENTICAL. If the plan changed this is
 *                               different work and needs its own admission,
 *                               not a re-pin.
 *   the PAPERWORK may change    the artefact set around it re-digests, and the
 *                               new digest is recorded with the authority that
 *                               asked for it.
 *
 * So this does not weaken the guard. It re-makes the promise about corrected
 * artefacts and says who asked, rather than moving the pin to whatever is on
 * disk today.
 */

const requestMod = require('./request.cjs');

const REFUSALS = [
  'REPIN_AUTHORITY_MISSING',
  'REPIN_ENTRY_UNKNOWN',
  'REPIN_STATE_NOT_BLOCKED',
  'REPIN_WRONG_BLOCKER',
  'REPIN_NO_REQUEST_PATH',
  'REPIN_ARTEFACTS_UNREADABLE',
  'REPIN_TASK_SPEC_CHANGED',
  'REPIN_DIGEST_UNCHANGED',
];

function refusal(entry, code, detail) {
  return {
    disposition: 'REFUSED',
    entryId: entry ? entry.entryId : null,
    queueState: entry ? entry.state : null,
    repinned: false,
    refusal: code,
    detail: detail || null,
  };
}

/**
 * Re-pin one entry.
 *
 * @param {object} o
 * @param {object} o.queue
 * @param {string} o.entryId
 * @param {string} o.repoCwd
 * @param {string} o.repinAuthority   owner decision reference; required
 * @param {function} [o.resolve]      request resolver, for tests
 * @param {function} [o.audit]
 * @param {number} [o.nowMs]
 */
function repinArtefacts(o) {
  const queue = o.queue;
  const audit = o.audit || (() => {});
  const nowMs = o.nowMs || Date.now();
  const authorityRef = o.repinAuthority;
  const resolve = o.resolve || requestMod.load;

  if (typeof authorityRef !== 'string' || authorityRef.trim() === '') {
    return refusal(null, 'REPIN_AUTHORITY_MISSING', 'an owner authority reference is required');
  }

  const entry = queue.get(o.entryId);
  if (!entry) return refusal(null, 'REPIN_ENTRY_UNKNOWN', String(o.entryId));

  // Fail closed on the situation. This is not a general "update the entry"
  // verb — it answers exactly one blocker, and an entry blocked for any other
  // reason has a different problem that re-pinning would hide.
  if (entry.state !== 'BLOCKED') {
    return refusal(entry, 'REPIN_STATE_NOT_BLOCKED', 'entry holds ' + entry.state);
  }
  if (entry.blockerCode !== 'ARTEFACT_DIGEST_MISMATCH') {
    return refusal(entry, 'REPIN_WRONG_BLOCKER', 'blocker is ' + String(entry.blockerCode));
  }
  if (!entry.requestPath) {
    return refusal(entry, 'REPIN_NO_REQUEST_PATH', 'the entry cannot find its own authority to re-read');
  }

  let resolved;
  try {
    resolved = resolve({
      repoCwd: o.repoCwd,
      requestPath: entry.requestPath,
      // The SAME regime the entry was admitted under. Re-pinning against
      // uncommitted artefacts would let a branch-local edit become the new
      // promise, which is the hole the committed regime exists to close.
      requireCommitted: entry.artefactsCommitted === true,
    });
  } catch (e) {
    return refusal(entry, 'REPIN_ARTEFACTS_UNREADABLE', (e.code || '') + ' ' + String(e.message).slice(0, 160));
  }

  // The whole safety of this operation. Same plan digest means the WORK the
  // entry was admitted to do is unchanged; only the artefacts around it were
  // corrected. A changed plan is different work wearing the same entry id.
  const observedSpec = resolved.taskSpecSha256;
  if (entry.taskSpecSha256 && observedSpec && observedSpec !== entry.taskSpecSha256) {
    return refusal(
      entry,
      'REPIN_TASK_SPEC_CHANGED',
      'plan digest moved ' + entry.taskSpecSha256.slice(0, 12) + ' -> ' + observedSpec.slice(0, 12) +
        '; that is different work and needs its own admission',
    );
  }

  const newDigest = resolved.artefacts && resolved.artefacts.digest;
  if (!newDigest) {
    return refusal(entry, 'REPIN_ARTEFACTS_UNREADABLE', 'no artefact digest was produced');
  }
  // Idempotent, and honest about it: if the pin already matches, the entry did
  // not need this and nothing is written.
  if (newDigest === entry.artefactSha256) {
    return {
      disposition: 'ALREADY_PINNED',
      entryId: entry.entryId,
      queueState: entry.state,
      repinned: false,
      artefactSha256: newDigest,
    };
  }

  audit('ARTEFACT_REPIN_STARTED', {
    entryId: entry.entryId,
    taskId: entry.taskId,
    previousDigest: entry.artefactSha256,
    requestPath: entry.requestPath,
    authorityRef,
  });

  // BLOCKED -> BLOCKED. A same-state move is a metadata touch by design, so the
  // entry does not pretend to advance: re-pinning does not decide that the work
  // may run, it only records what the work is now pinned to. Resuming it stays
  // the separate authorized act it always was.
  const written = queue.transition({
    entryId: entry.entryId,
    to: 'BLOCKED',
    expectedPreviousState: 'BLOCKED',
    artefactRepinAuthorized: true,
    nowMs,
    patch: {
      artefactSha256: newDigest,
      blockerCode: entry.blockerCode,
      artefactRepin: {
        previousDigest: entry.artefactSha256,
        digest: newDigest,
        taskSpecSha256: observedSpec || entry.taskSpecSha256 || null,
        requestPath: entry.requestPath,
        artefactRefs: (resolved.artefacts && resolved.artefacts.refs) || [],
        readFromRef: (resolved.artefacts && resolved.artefacts.readFromRef) || null,
        authorityRef,
        repinnedAtMs: nowMs,
      },
    },
  });

  audit('ARTEFACT_REPIN_COMPLETED', {
    entryId: entry.entryId,
    taskId: entry.taskId,
    previousDigest: entry.artefactSha256,
    digest: newDigest,
    taskSpecSha256: written.taskSpecSha256,
    readFromRef: (resolved.artefacts && resolved.artefacts.readFromRef) || null,
    artefactRefCount: ((resolved.artefacts && resolved.artefacts.refs) || []).length,
    authorityRef,
  });

  return {
    disposition: 'REPINNED',
    entryId: entry.entryId,
    queueState: written.state,
    repinned: true,
    previousDigest: entry.artefactSha256,
    artefactSha256: newDigest,
    taskSpecSha256: written.taskSpecSha256,
    readFromRef: (resolved.artefacts && resolved.artefacts.readFromRef) || null,
  };
}

module.exports = { REFUSALS, repinArtefacts };
