'use strict';
/**
 * Dispatch revalidation.
 *
 * Admission proves a task was allowed to enter the queue. It proves nothing
 * about the moment it leaves.
 *
 * Between the two, a grant can be revoked, the kill switch can be engaged, an
 * eligibility authority can change, or the queue can simply have sat overnight.
 * The queue is durable precisely so that gap can be long — which makes trusting
 * the admission verdict at dispatch the same mistake WP05 removed from the merge
 * gate: an attestation is a photograph, not a lock.
 *
 * So the gate runs twice, deliberately. Not because the first run was wrong, but
 * because the world it described has had time to move.
 *
 * The failure this closes is not hypothetical. Revoking a grant while work sat
 * QUEUED had no effect whatsoever: nothing between enqueue and executor spawn
 * read the revocation marker, so a task admitted before the revocation would run
 * after it. The whole point of a revocation path is to stop work that has
 * already been authorized.
 */

const admissionMod = require('./admission.cjs');

class DispatchError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'DispatchError';
    this.code = code;
    this.detail = detail || null;
  }
}

/**
 * Re-run the admission gate against an entry that is about to be dispatched.
 *
 * Takes a RESOLVER rather than a grant, because the grant must be re-read from
 * disk at this moment. Holding the object from admission time would re-check the
 * old grant and prove nothing — the same shape of error as trusting the old
 * attestation.
 *
 * @param {object} opts
 * @param {object} opts.entry                the queue entry about to run
 * @param {function} opts.resolveGrant       (entry) => standing grant, re-read now
 * @param {function} opts.resolveManifest    () => the derived manifest, re-read now
 * @param {function} opts.resolveSpec        (entry) => the child plan
 * @param {boolean} [opts.killSwitchEngaged]
 * @param {function} [opts.isRevoked]        (grant) => boolean, re-read now
 * @param {function} [opts.resolveSpecHash]  (spec) => digest, re-computed now
 * @returns {{dispatchable: boolean, refusal: string|null, detail: string|null}}
 */
function revalidate(opts) {
  const o = opts || {};
  const entry = o.entry;
  if (!entry) throw new DispatchError('DISPATCH_ENTRY_MISSING');

  if (o.killSwitchEngaged) {
    return { dispatchable: false, refusal: 'KILL_SWITCH_ENGAGED', detail: null };
  }

  let grant;
  let spec;
  let manifest;
  try {
    grant = o.resolveGrant(entry);
    spec = o.resolveSpec(entry);
    manifest = o.resolveManifest();
  } catch (e) {
    // A grant, plan or manifest that no longer reads is not a reason to guess.
    // Deleting the grant file must stop the work it authorized.
    return { dispatchable: false, refusal: 'DISPATCH_AUTHORITY_UNREADABLE', detail: String((e && e.message) || e).slice(0, 200) };
  }

  // The grant that authorized admission must still be the grant on disk. A task
  // admitted under one grant and dispatched under a different one — same id,
  // edited limits — is the substitution this check exists to catch.
  if (entry.standingGrantId && grant.standingGrantId !== entry.standingGrantId) {
    return {
      dispatchable: false,
      refusal: 'DISPATCH_GRANT_IDENTITY_CHANGED',
      detail: entry.standingGrantId + ' -> ' + grant.standingGrantId,
    };
  }

  // The plan must still be the plan that was admitted. An edit between enqueue
  // and dispatch changes what runs without changing what was authorized — and
  // this lives here, with the other dispatch-time re-reads, so there is exactly
  // one place that answers "is this still the work we said yes to?".
  if (entry.taskSpecHash || entry.taskSpecSha256) {
    const pinned = entry.taskSpecSha256 || entry.taskSpecHash;
    const now = o.resolveSpecHash ? o.resolveSpecHash(spec) : null;
    if (now && now !== pinned) {
      return { dispatchable: false, refusal: 'DISPATCH_PLAN_HASH_CHANGED', detail: pinned.slice(0, 12) + ' -> ' + now.slice(0, 12) };
    }
  }

  const verdict = admissionMod.evaluate({
    manifest,
    standingGrant: grant,
    spec,
    // Carried from the entry so a governance task — whose grant names no
    // program — resolves to the same program at dispatch as it did at
    // admission, rather than becoming unresolvable on the second pass.
    programId: entry.programId,
    taskClass: entry.taskClass,
    executorLane: entry.executorLane,
    // The one-shot ledger and the repo root, carried here for the same reason
    // everything else on this call is: dispatch re-asks admission's questions,
    // and a question it cannot ask is one it silently stops asking.
    //
    // They were wired into enqueue and not into this path, so a one-shot grant
    // was re-checked at dispatch with no ledger to check against — one call
    // short, which is how a consumed grant would have reached an executor.
    oneShotLedgerDir: o.oneShotLedgerDir,
    repoCwd: o.repoCwd,
    taskSpecSha256: entry.taskSpecSha256,
    revoked: o.isRevoked ? o.isRevoked(grant) === true : false,
    killSwitchEngaged: false,
    nowMs: o.nowMs,
  });

  if (!verdict.admissible) {
    return { dispatchable: false, refusal: verdict.refusal, detail: verdict.detail };
  }
  return { dispatchable: true, refusal: null, detail: null };
}

module.exports = { DispatchError, revalidate };
