'use strict';

/**
 * REPOSITORY-WIDE-MERGE-FLOW-REMEDIATION-R01 — PR-A
 *
 * Canonical PR disposition taxonomy for this repository.
 *
 * WHY THIS EXISTS
 * ---------------
 * The predecessor model had four tokens: MERGED, CLOSED_SUPERSEDED,
 * OTHER_SESSION, BLOCKED_EXACT. It had no way to say "CI is still running",
 * so every ordinary wait had to be reported as BLOCKED_EXACT. Measured over a
 * 15-PR evidence set (#2039..#2071, #2066 not observed), **zero** were real
 * blockers: seven were control-plane defects and seven were ordinary CI waits.
 * One (#2059) was a genuine CI failure requiring a fix.
 * When one word means both "nine more minutes of Jest" and "a human must
 * decide", real blockers stop being visible.
 *
 * SECURITY POSTURE
 * ----------------
 * The WAITING_* tokens are NOT an escape hatch. Every token here declares how
 * it must be cross-verified against observed GitHub state. A green PR may not
 * be parked as WAITING_FOR_CI, and a running PR may not be parked as
 * CI_FIX_REQUIRED or BLOCKED_EXACT. The "no silent deferral" property of the
 * predecessor guard is preserved — only its vocabulary is corrected.
 *
 * This module is deliberately pure and dependency-free: it is consumed by the
 * session stop-hook (which runs outside this repo and must not import repo
 * runtime), by CI, and by diagnostic tooling. It performs no I/O and never
 * calls `gh` itself; callers supply observed state.
 */

/** Terminal check states, per GitHub CheckRun.status / StatusContext.state. */
const TERMINAL_CHECK_STATUS = Object.freeze(['COMPLETED']);
const FAILING_CONCLUSIONS = Object.freeze([
  'FAILURE',
  'ERROR',
  'TIMED_OUT',
  'CANCELLED',
  'STARTUP_FAILURE',
]);

/**
 * BLOCKED_EXACT is deliberately narrow. These are the ONLY admissible causes.
 * Anything outside this list has its own token and must use it.
 */
const BLOCKED_EXACT_ADMISSIBLE_CAUSES = Object.freeze([
  'AUTHORITY_NOT_EXTERNALLY_OBTAINABLE',
  'REAL_SAME_FILE_COMPETING_WRITER',
  'UNRESOLVABLE_MERGE_CONFLICT',
  'MATERIAL_ALTERNATIVE_REQUIRES_OWNER',
]);

const TOKENS = Object.freeze({
  MERGED: Object.freeze({
    terminal: true,
    requiresGithubState: 'MERGED',
    requiresEvidence: ['mergeSha'],
  }),
  CLOSED_SUPERSEDED: Object.freeze({
    terminal: true,
    requiresGithubState: 'CLOSED',
    requiresEvidence: ['supersedingRef'],
  }),
  OTHER_SESSION: Object.freeze({
    terminal: true,
    requiresGithubState: null, // ownership is not provable from GitHub alone
    requiresEvidence: ['owningSessionOrTask'],
  }),
  WAITING_FOR_CI: Object.freeze({
    terminal: false,
    requiresGithubState: 'OPEN',
    requiresEvidence: ['runningChecks'],
    // Admissible ONLY while at least one check is non-terminal.
    requiresNonTerminalChecks: true,
  }),
  WAITING_DEPENDENCY: Object.freeze({
    terminal: false,
    requiresGithubState: 'OPEN',
    // A dependency reference is a PR number, a task ID, or a declared
    // incident ID. Incident IDs matter because one external fault routinely
    // stalls many PRs at once.
    requiresEvidence: ['dependencyRef'],
  }),
  // Green CI, no external gate, but concrete review- or owner-identified
  // changes are outstanding and the author can apply them. Without this token
  // such a PR gets mislabelled BLOCKED_EXACT — which is blocker inflation of
  // exactly the kind this taxonomy exists to remove. The distinguishing test
  // is not "is there an owner instruction?" but "is an owner DECISION still
  // pending?". If the decision is made and the work is the author's, this is
  // the token.
  CHANGES_REQUIRED: Object.freeze({
    terminal: false,
    requiresGithubState: 'OPEN',
    requiresEvidence: ['requestedChanges', 'owner'],
    // Never admissible while an owner decision is genuinely outstanding —
    // that case is BLOCKED_EXACT / MATERIAL_ALTERNATIVE_REQUIRES_OWNER.
    forbiddenWhenOwnerDecisionPending: true,
  }),
  CI_FIX_REQUIRED: Object.freeze({
    terminal: false,
    requiresGithubState: 'OPEN',
    requiresEvidence: ['failingCheck', 'remediation'],
    requiresFailingCheck: true,
  }),
  BLOCKED_EXACT: Object.freeze({
    terminal: false,
    requiresGithubState: null,
    requiresEvidence: ['exactBlocker', 'nextAction', 'ownerDecision'],
    admissibleCauses: BLOCKED_EXACT_ADMISSIBLE_CAUSES,
  }),
});

const TOKEN_NAMES = Object.freeze(Object.keys(TOKENS));

/** A check is non-terminal when GitHub has not finished reporting it. */
function isNonTerminalCheck(check) {
  if (!check || typeof check !== 'object') return false;
  if (typeof check.status === 'string') {
    return !TERMINAL_CHECK_STATUS.includes(check.status.toUpperCase());
  }
  if (typeof check.state === 'string') return check.state.toUpperCase() === 'PENDING';
  return false;
}

function isFailingCheck(check) {
  if (!check || typeof check !== 'object') return false;
  const verdict = String(check.conclusion || check.state || '').toUpperCase();
  return FAILING_CONCLUSIONS.includes(verdict);
}

function nonTerminalChecks(rollup) {
  return Array.isArray(rollup) ? rollup.filter(isNonTerminalCheck) : [];
}

function failingChecks(rollup) {
  return Array.isArray(rollup) ? rollup.filter(isFailingCheck) : [];
}

/**
 * Classify observed PR state into the token the reporter is REQUIRED to use.
 * This is the single source of truth: reporters do not get to choose a token
 * that contradicts observed state.
 *
 * @param {object} observed
 * @param {string} observed.state              GitHub PR state
 * @param {boolean} [observed.merged]
 * @param {Array}  [observed.statusCheckRollup]
 * @param {string} [observed.mergeable]        MERGEABLE | CONFLICTING | UNKNOWN
 * @param {boolean} [observed.lockedBranch]    base branch is read-only
 * @param {boolean} [observed.dependencyOpen]  a declared prerequisite is unmerged
 * @returns {{token: string, reason: string}}
 */
function classify(observed) {
  const o = observed || {};
  const state = String(o.state || '').toUpperCase();

  if (state === 'MERGED' || o.merged === true) {
    return { token: 'MERGED', reason: 'GitHub reports the pull request as merged' };
  }
  if (state === 'CLOSED') {
    return { token: 'CLOSED_SUPERSEDED', reason: 'pull request is closed without merge' };
  }

  const running = nonTerminalChecks(o.statusCheckRollup);
  const failing = failingChecks(o.statusCheckRollup);

  // Ordering matters. A running pipeline is a wait, never a blocker — even if
  // the base branch is locked, because the lock may lift before CI finishes.
  if (running.length > 0) {
    return {
      token: 'WAITING_FOR_CI',
      reason: `${running.length} check(s) have not reached a terminal state`,
    };
  }
  if (failing.length > 0) {
    return {
      token: 'CI_FIX_REQUIRED',
      reason: `${failing.length} check(s) reported a failing conclusion`,
    };
  }
  if (String(o.mergeable || '').toUpperCase() === 'CONFLICTING') {
    return { token: 'BLOCKED_EXACT', reason: 'UNRESOLVABLE_MERGE_CONFLICT until rebased' };
  }
  // INCIDENT DEDUPLICATION.
  //
  // One external fault routinely stalls every open PR at once — a locked base
  // branch stalled six simultaneously. Reporting BLOCKED_EXACT on each of them
  // reproduces exactly the blocker noise this taxonomy exists to remove: six
  // lines, one cause, and no way to see that it is one cause.
  //
  // So the incident carries the BLOCKED_EXACT, once. Every PR it stalls
  // reports WAITING_DEPENDENCY against the incident ID. Clearing the incident
  // clears all of them; there is exactly one thing to fix and one line saying so.
  if (o.incident && o.incident.active === true) {
    return {
      token: 'WAITING_DEPENDENCY',
      reason: `stalled by incident ${o.incident.id}`,
      incidentId: o.incident.id,
    };
  }
  if (o.lockedBranch === true) {
    // Reached only when no incident has been declared for the lock. The lock is
    // still real, so it must not silently pass — but the correct remedy is to
    // declare the incident so sibling PRs deduplicate against it.
    return {
      token: 'BLOCKED_EXACT',
      reason: 'AUTHORITY_NOT_EXTERNALLY_OBTAINABLE: base branch is locked '
        + '(declare a CONTROL_PLANE_RELOCK_INCIDENT so sibling PRs deduplicate)',
    };
  }
  if (o.dependencyOpen === true) {
    return { token: 'WAITING_DEPENDENCY', reason: 'a declared prerequisite is still open' };
  }
  // Outstanding review/owner-identified work the author can apply. Checked
  // after all external gates: an external gate is not the author's to clear,
  // whereas this is.
  if (o.changesRequested === true) {
    return o.ownerDecisionPending === true
      ? {
        token: 'BLOCKED_EXACT',
        reason: 'MATERIAL_ALTERNATIVE_REQUIRES_OWNER: requested change needs an owner decision',
      }
      : {
        token: 'CHANGES_REQUIRED',
        reason: 'owner/review identified concrete changes the author can apply',
      };
  }
  return { token: 'MERGED', reason: 'all gates satisfied — the disposition is to merge, not to report' };
}

/**
 * Verify a claimed token against observed state.
 * @returns {null|string} null when admissible, otherwise the mismatch reason.
 */
function verifyClaim(claimedToken, observed) {
  if (!TOKEN_NAMES.includes(claimedToken)) return `unknown disposition token: ${claimedToken}`;
  const o = observed || {};
  const spec = TOKENS[claimedToken];
  const state = String(o.state || '').toUpperCase();

  if (spec.requiresGithubState && state && state !== spec.requiresGithubState) {
    return `DISPOSITION_MISMATCH: ${claimedToken} claimed, GitHub reports ${state}`;
  }

  const running = nonTerminalChecks(o.statusCheckRollup);
  const failing = failingChecks(o.statusCheckRollup);

  if (spec.requiresNonTerminalChecks && running.length === 0) {
    return `DISPOSITION_MISMATCH: WAITING_FOR_CI claimed but no check is running`;
  }
  if (spec.requiresFailingCheck && failing.length === 0 && running.length > 0) {
    return `DISPOSITION_MISMATCH: CI_FIX_REQUIRED claimed while checks are still running`;
  }
  if (claimedToken === 'BLOCKED_EXACT' && running.length > 0 && failing.length === 0) {
    return `DISPOSITION_MISMATCH: BLOCKED_EXACT claimed while checks are still running`;
  }
  // A PR stalled by a declared, active incident must defer to it rather than
  // restate the incident's cause as its own blocker.
  if (claimedToken === 'BLOCKED_EXACT' && o.incident && o.incident.active === true) {
    return `DISPOSITION_MISMATCH: BLOCKED_EXACT claimed while incident ${o.incident.id} `
      + `is active — report WAITING_DEPENDENCY against the incident`;
  }
  // CHANGES_REQUIRED asserts the author can finish the work. If an owner
  // decision is genuinely outstanding it is not the author's to finish.
  if (claimedToken === 'CHANGES_REQUIRED' && o.ownerDecisionPending === true) {
    return `DISPOSITION_MISMATCH: CHANGES_REQUIRED claimed while an owner decision is pending`;
  }
  // The mirror check, and the error this taxonomy was written to stop: a PR
  // whose owner decision is already made is not blocked — the work is simply
  // the author's to do.
  if (claimedToken === 'BLOCKED_EXACT'
    && o.changesRequested === true
    && o.ownerDecisionPending !== true) {
    return `DISPOSITION_MISMATCH: BLOCKED_EXACT claimed but the owner decision is made and the `
      + `changes are the author's to apply — report CHANGES_REQUIRED`;
  }
  if (claimedToken === 'WAITING_DEPENDENCY') {
    const ref = o.dependencyRef || (o.incident && o.incident.id);
    if (!ref) {
      return `DISPOSITION_MISMATCH: WAITING_DEPENDENCY claimed without a PR, task or incident ID`;
    }
    // Read-only proof: an incident may only be cited while it is active.
    if (o.incident && o.incident.id === ref && o.incident.active !== true) {
      return `DISPOSITION_MISMATCH: incident ${ref} is not active`;
    }
  }
  return null;
}

/**
 * Declare a control-plane incident. The incident — not each stalled PR —
 * carries the BLOCKED_EXACT disposition.
 *
 * @param {string} id      e.g. 'CONTROL_PLANE_RELOCK_INCIDENT'
 * @param {object} opts
 * @param {string} opts.cause     one of BLOCKED_EXACT_ADMISSIBLE_CAUSES
 * @param {string} opts.evidence  read-only observation proving it is active
 * @param {boolean} opts.active
 */
function declareIncident(id, opts) {
  const o = opts || {};
  if (!id || typeof id !== 'string') throw new TypeError('incident id is required');
  if (!BLOCKED_EXACT_ADMISSIBLE_CAUSES.includes(o.cause)) {
    throw new TypeError(`incident cause must be one of ${BLOCKED_EXACT_ADMISSIBLE_CAUSES.join(', ')}`);
  }
  if (!o.evidence) throw new TypeError('incident requires read-only evidence');
  return Object.freeze({
    id,
    cause: o.cause,
    evidence: String(o.evidence),
    active: o.active !== false,
    token: 'BLOCKED_EXACT',
  });
}

module.exports = {
  TOKENS,
  TOKEN_NAMES,
  BLOCKED_EXACT_ADMISSIBLE_CAUSES,
  FAILING_CONCLUSIONS,
  isNonTerminalCheck,
  isFailingCheck,
  nonTerminalChecks,
  failingChecks,
  classify,
  verifyClaim,
  declareIncident,
};
