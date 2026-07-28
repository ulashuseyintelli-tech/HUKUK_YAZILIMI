'use strict';
/**
 * Admission — the single gate a task passes to become live work.
 *
 * Three checks already existed and nothing joined them:
 *
 *   eligibility.cjs   is this program open for orchestrated execution?
 *   authority.cjs     does this program's standing grant admit this plan?
 *   queue.cjs         can the queue take it?
 *
 * Three modules with no caller in common is three modules that will eventually
 * disagree. This is the caller. It runs them in the one order that is safe and
 * refuses on the FIRST failure, so the answer an operator sees names the actual
 * reason rather than the last thing to break.
 *
 * The order is not arbitrary:
 *
 *   1. kill switch      cheapest, and the answer that overrides every other
 *   2. eligibility      a denied program's plan should never be parsed
 *   3. standing grant   the plan's own limits, enforced mechanically
 *   4. queue            last, because it is the only step that writes
 *
 * Putting the write last is what makes a refused admission leave no trace. A
 * task that fails any gate never enters the queue at all, so there is nothing to
 * clean up and no half-admitted entry for recovery to reason about.
 */

const authorityMod = require('./authority.cjs');
const eligibilityMod = require('./eligibility.cjs');
const governanceMod = require('./governance-profile.cjs');
const oneShotMod = require('./one-shot-grant.cjs');

class AdmissionError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'AdmissionError';
    this.code = code;
    this.detail = detail || null;
  }
}

/**
 * Decide whether a task may be admitted, WITHOUT admitting it.
 *
 * Pure with respect to the queue: it reads, it never writes. Exposed separately
 * from admit() so the operator console can answer "would this run?" without the
 * answer changing anything — a dry run that mutates is not a dry run.
 *
 * @param {object} opts
 * @param {object} opts.manifest        the DERIVED programs manifest
 * @param {object} opts.standingGrant
 * @param {object} opts.spec            the child plan
 * @param {string} opts.taskClass
 * @param {string} [opts.executorLane]
 * @param {boolean} [opts.killSwitchEngaged]
 * @param {boolean} [opts.revoked]
 * @returns {{admissible: boolean, refusal: string|null, detail: string|null, program: string|null}}
 */
function evaluate(opts) {
  const o = opts || {};

  if (o.killSwitchEngaged) {
    return { admissible: false, refusal: 'KILL_SWITCH_ENGAGED', detail: null, program: null };
  }

  const grant = o.standingGrant;
  if (!grant || typeof grant !== 'object') {
    return { admissible: false, refusal: 'STANDING_GRANT_MISSING', detail: null, program: null };
  }
  // A governance grant is a PROFILE, not a program: it deliberately carries no
  // program of its own, and the program a governance task serves comes from the
  // request. Demanding one from the grant made every governance task
  // unadmittable — the profile was reachable in theory and refused in practice.
  const programId = (grant.program && grant.program.programId) || o.programId || null;
  if (!programId) {
    return { admissible: false, refusal: 'STANDING_GRANT_PROGRAM_MISSING', detail: null, program: null };
  }

  // Eligibility is read from the DERIVED manifest, which is itself derived from
  // the owner's authority record. Reading a hand-set field here would make the
  // whole derivation ornamental.
  const entry = ((o.manifest && o.manifest.programs) || []).filter((p) => p.programId === programId)[0];
  if (!entry) {
    return { admissible: false, refusal: 'PROGRAM_NOT_IN_MANIFEST', detail: programId, program: programId };
  }
  if (entry.liveExecutionEligibility !== 'ELIGIBLE') {
    return {
      admissible: false,
      refusal: 'PROGRAM_NOT_ELIGIBLE',
      detail: programId + ' is ' + entry.liveExecutionEligibility,
      program: programId,
    };
  }
  // A manifest that has not been derived cannot be trusted to answer this.
  if (!o.manifest.eligibilityDerivedFrom || !o.manifest.eligibilityDerivedFrom.authorizationId) {
    return { admissible: false, refusal: 'MANIFEST_NOT_DERIVED', detail: null, program: programId };
  }

  // A governance task is judged by the governance profile, not by the code
  // path. Reaching this with a governance class and a code grant would admit a
  // governance write with no profile check at all — the profile existed for
  // exactly this and had no caller.
  if (governanceMod.isGovernanceTaskClass(o.taskClass)) {
    if (grant.profile !== 'MECHANICAL_GOVERNANCE') {
      return { admissible: false, refusal: 'GOVERNANCE_PROFILE_MISMATCH', detail: String(grant.profile), program: programId };
    }
    try {
      governanceMod.validateGovernanceTask({
        standingGrant: grant,
        spec: o.spec,
        operation: o.operation,
        targetPaths: o.targetPaths || (o.spec && o.spec.boundaryPolicy && o.spec.boundaryPolicy.allowedRoots),
      });
    } catch (e) {
      return { admissible: false, refusal: e.code || 'GOVERNANCE_REFUSED', detail: e.detail || null, program: programId };
    }
    // A governance grant carries no allowedPathRoots — its surface IS the queue
    // exception — so the code-shaped validator below would refuse it wrongly.
    return { admissible: true, refusal: null, detail: null, program: programId };
  }

  // Conversely, a governance grant must not be used to run code.
  if (grant.profile === 'MECHANICAL_GOVERNANCE') {
    return { admissible: false, refusal: 'GOVERNANCE_GRANT_CANNOT_RUN_CODE', detail: String(o.taskClass), program: programId };
  }

  try {
    authorityMod.validateAgainstStandingGrant({
      standingGrant: grant,
      spec: o.spec,
      taskClass: o.taskClass,
      executorLane: o.executorLane,
      revoked: o.revoked === true,
      killSwitchEngaged: false,
      nowMs: o.nowMs,
    });
  } catch (e) {
    return { admissible: false, refusal: e.code || 'STANDING_GRANT_REFUSED', detail: e.detail || null, program: programId };
  }

  // A one-shot grant answers a question the standing-grant validator cannot
  // even ask: has this authorization already been spent? Checked here so a
  // consumed grant is refused at the door rather than at the merge, after an
  // executor has run and a pull request exists that may not be merged.
  //
  // Checked AGAIN before the merge, because this answer is minutes old by
  // then and another process may have spent it in between.
  if (oneShotMod.isOneShot(grant)) {
    try {
      oneShotMod.assertUsable({
        grant,
        dir: o.oneShotLedgerDir,
        repoCwd: o.repoCwd,
        taskId: o.spec && o.spec.taskId,
        programId,
        taskClass: o.taskClass,
        executorLane: o.executorLane,
        taskSpecSha256: o.taskSpecSha256,
        specRoots: (o.spec && o.spec.boundaryPolicy && o.spec.boundaryPolicy.allowedRoots) || [],
      });
    } catch (e) {
      return { admissible: false, refusal: e.code || 'TASK_GRANT_REFUSED', detail: e.detail || null, program: programId };
    }
  }

  return { admissible: true, refusal: null, detail: null, program: programId };
}

/**
 * Evaluate, then enqueue if and only if every gate held.
 *
 * Returns the queue entry on success. Throws AdmissionError on refusal rather
 * than returning a falsy value: an admission that silently does nothing is the
 * shape that produces "why is nothing running" with no answer anywhere.
 */
function admit(opts) {
  const verdict = evaluate(opts);
  if (!verdict.admissible) throw new AdmissionError(verdict.refusal, verdict.detail);

  const grant = opts.standingGrant;
  return opts.queue.enqueue({
    programId: verdict.program,
    taskId: opts.spec.taskId,
    taskClass: opts.taskClass,
    parentAuthorizationId: (grant.parentAuthorizationRef && grant.parentAuthorizationRef.authorizationId) || '',
    taskSpecSha256: opts.taskSpecSha256 || authorityMod.digest(opts.spec),
    standingGrantId: grant.standingGrantId,
    priority: opts.priority === undefined ? 100 : opts.priority,
    dependsOn: opts.dependsOn || [],
    // The entry has to be able to find its own authority again at dispatch.
    // Without this the consumer would have nothing to re-read, and re-reading
    // is the whole point of the second gate.
    requestPath: opts.requestPath || null,
    artefactSha256: opts.artefactSha256 || null,
    artefactsCommitted: opts.artefactsCommitted === true,
    executorLane: opts.executorLane || null,
    nowMs: opts.nowMs,
  });
}

module.exports = { AdmissionError, evaluate, admit, eligibilityMod };
