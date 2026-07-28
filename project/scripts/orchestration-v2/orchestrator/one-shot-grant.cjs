'use strict';
/**
 * A grant that authorizes exactly one merge, and then stops existing.
 *
 * Every other grant in this system is standing: it names a program, a set of
 * path roots and a set of task classes, and it keeps authorizing work until
 * somebody revokes it. That shape could not express what the R04 canary needed
 * — a single operational evidence file, written once, merged once, by a
 * service that owns the merge — without widening a standing grant, and
 * widening one is a self-authorization change every grant here forbids.
 *
 * So this is the other shape. A one-shot grant is bound to ONE task id, ONE
 * plan hash, ONE exact file, and ONE successful merge. Recovery attempts are
 * allowed — a run that fails should not burn the authorization — but a second
 * pull request, a second task, or anything at all after a merge lands is
 * refused by name.
 *
 * The ledger lives beside the queue, in the git common dir, for the same
 * reason the queue does: every worktree and every session sees one copy. A
 * consumption record written where only one process can see it authorizes the
 * second merge it was created to prevent.
 */

const fs = require('fs');
const path = require('path');

const GRANT_KIND = 'TASK_SCOPED_ONE_SHOT';
const LEDGER = 'one-shot-grants.jsonl';

/**
 * Refusals, all of them. A caller that wants to distinguish "not usable yet"
 * from "never again" reads the code, not the message.
 */
const REFUSALS = [
  'TASK_GRANT_CONSUMED',
  'TASK_GRANT_REVOKED',
  'TASK_GRANT_TASK_MISMATCH',
  'TASK_GRANT_PROGRAM_MISMATCH',
  'TASK_GRANT_CLASS_FORBIDDEN',
  'TASK_GRANT_LANE_FORBIDDEN',
  'TASK_GRANT_PATH_NOT_EXACT',
  'TASK_GRANT_PLAN_HASH_MISMATCH',
  'TASK_GRANT_PR_BUDGET_EXHAUSTED',
  'TASK_GRANT_MERGE_BUDGET_EXHAUSTED',
  'TASK_GRANT_LEDGER_DIR_MISSING',
];

class OneShotGrantError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'OneShotGrantError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new OneShotGrantError(code, detail);
}

/**
 * The ledger directory, checked before any path is built from it.
 *
 * Without this, a caller that forgot to pass it reached path.join(undefined)
 * and produced ERR_INVALID_ARG_TYPE — a raw Node TypeError, which admission
 * then reported as `refusal: ERR_INVALID_ARG_TYPE` with no detail. A wiring
 * mistake wore the costume of a governance decision, and the entry was blocked
 * by a code no rule in this system defines.
 *
 * Measured: dispatch re-checked a one-shot grant with no ledger to check
 * against, because the field was wired into enqueue and not into the dispatch
 * path. One call short.
 */
function requireLedgerDir(dir, who) {
  if (typeof dir !== 'string' || dir === '') {
    fail('TASK_GRANT_LEDGER_DIR_MISSING', who + ' was given no one-shot ledger directory');
  }
  return dir;
}

/** Is this grant one-shot? Declared, never inferred. */
function isOneShot(grant) {
  return !!grant && grant.grantKind === GRANT_KIND;
}

function ledgerFile(dir) {
  return path.join(dir, LEDGER);
}

/**
 * Every record for one grant, oldest first.
 *
 * Append-only and read whole. The file holds one grant's worth of rows in
 * practice, and a fold that reads the tail only would miss the consumption
 * record if a later attempt appended after it.
 */
function history(dir, grantId) {
  const f = ledgerFile(dir);
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        return null;
      }
    })
    .filter((r) => r && r.grantId === grantId);
}

/** The merge, if one has landed. Its presence is what CONSUMED means. */
function consumptionOf(dir, grantId) {
  return history(dir, grantId).filter((r) => r.event === 'CONSUMED')[0] || null;
}

/** Pull requests this grant has been used to open, by number. */
function pullRequestsOf(dir, grantId) {
  const seen = [];
  for (const r of history(dir, grantId)) {
    if (r.event === 'PR_OPENED' && seen.indexOf(r.prNumber) === -1) seen.push(r.prNumber);
  }
  return seen;
}

function append(dir, row) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ledgerFile(dir), JSON.stringify(row) + '\n', 'utf8');
  return row;
}

/**
 * The exact file this grant authorizes, or null if it is not one-shot.
 *
 * Singular by construction: a one-shot grant that could name two files would
 * need a rule for what happens when one of them merges, and there is no good
 * answer to that question.
 */
function exactTarget(grant) {
  const roots = grant.allowedPathRoots || [];
  if (roots.length !== 1) fail('TASK_GRANT_PATH_NOT_EXACT', roots.length + ' paths declared; exactly one is allowed');
  return roots[0];
}

/**
 * May this grant authorize this task, right now?
 *
 * Called at admission AND again before the merge. Twice, because the first
 * answer is minutes old by the time the merge happens and a grant consumed by
 * another process in between must not be honoured.
 */
function assertUsable(o) {
  const grant = o.grant;
  if (!isOneShot(grant)) return;
  const dir = requireLedgerDir(o.dir, 'assertUsable');
  const grantId = grant.standingGrantId || grant.grantId;

  if (grant.revocationPath && o.repoCwd && fs.existsSync(path.join(o.repoCwd, grant.revocationPath))) {
    fail('TASK_GRANT_REVOKED', grant.revocationPath);
  }

  const consumed = consumptionOf(dir, grantId);
  if (consumed) {
    fail(
      'TASK_GRANT_CONSUMED',
      'merged as ' + consumed.mergeSha + ' for ' + consumed.taskId + '; a one-shot grant authorizes one merge',
    );
  }

  // Bound to ONE task. Not "a task in this program" — this one, by id.
  if (o.taskId !== undefined && grant.taskId && o.taskId !== grant.taskId) {
    fail('TASK_GRANT_TASK_MISMATCH', 'grant is bound to ' + grant.taskId + ', asked for ' + o.taskId);
  }
  const gp = (grant.program && grant.program.programId) || null;
  if (o.programId !== undefined && gp && o.programId !== gp) {
    fail('TASK_GRANT_PROGRAM_MISMATCH', 'grant is bound to ' + gp + ', asked for ' + o.programId);
  }
  if (o.taskClass !== undefined && (grant.allowedTaskClasses || []).indexOf(o.taskClass) === -1) {
    fail('TASK_GRANT_CLASS_FORBIDDEN', String(o.taskClass));
  }
  if (o.executorLane !== undefined && (grant.allowedExecutorLanes || []).indexOf(o.executorLane) === -1) {
    fail('TASK_GRANT_LANE_FORBIDDEN', String(o.executorLane));
  }

  // The plan is pinned by hash, so a plan edited after ratification cannot be
  // run under the authorization that ratified a different one.
  if (o.taskSpecSha256 !== undefined && grant.planSha256 && o.taskSpecSha256 !== grant.planSha256) {
    fail('TASK_GRANT_PLAN_HASH_MISMATCH', 'grant pins ' + grant.planSha256.slice(0, 12) + ', plan hashes ' + String(o.taskSpecSha256).slice(0, 12));
  }

  // The boundary must be the grant's single file, exactly. A subset rule would
  // let a plan declare a directory that CONTAINS the file.
  const target = exactTarget(grant);
  if (o.specRoots !== undefined) {
    const roots = o.specRoots || [];
    if (roots.length !== 1 || roots[0] !== target) {
      fail('TASK_GRANT_PATH_NOT_EXACT', 'grant authorizes exactly ' + target + ', plan declares ' + JSON.stringify(roots));
    }
  }

  // One pull request. A second one for the same grant means the first is being
  // abandoned mid-flight, which is a decision, not a retry.
  const prs = pullRequestsOf(dir, grantId);
  const max = grant.maxPRs === undefined ? 1 : grant.maxPRs;
  if (o.prNumber !== undefined && o.prNumber !== null) {
    if (prs.indexOf(o.prNumber) === -1 && prs.length >= max) {
      fail('TASK_GRANT_PR_BUDGET_EXHAUSTED', 'already opened ' + JSON.stringify(prs));
    }
  }
}

/** Record that this grant opened a pull request. Idempotent per number. */
function recordPr(o) {
  const grant = o.grant;
  if (!isOneShot(grant)) return null;
  const dir = requireLedgerDir(o.dir, 'recordPr');
  const grantId = grant.standingGrantId || grant.grantId;
  const prs = pullRequestsOf(dir, grantId);
  if (prs.indexOf(o.prNumber) !== -1) return null;
  const max = grant.maxPRs === undefined ? 1 : grant.maxPRs;
  if (prs.length >= max) fail('TASK_GRANT_PR_BUDGET_EXHAUSTED', 'already opened ' + JSON.stringify(prs));
  return append(dir, {
    event: 'PR_OPENED',
    grantId,
    taskId: o.taskId || null,
    entryId: o.entryId || null,
    prNumber: o.prNumber,
    atMs: o.nowMs || Date.now(),
  });
}

/**
 * Spend the grant.
 *
 * Written AFTER the merge is observed, never before: a grant consumed by an
 * attempt that then failed would leave real work with no authorization to
 * finish it, and re-issuing an owner grant is not something this system may do
 * for itself.
 */
function consume(o) {
  const grant = o.grant;
  if (!isOneShot(grant)) return null;
  if (!o.mergeSha) fail('TASK_GRANT_MERGE_BUDGET_EXHAUSTED', 'refusing to consume without a merge sha');
  const dir = requireLedgerDir(o.dir, 'consume');
  const grantId = grant.standingGrantId || grant.grantId;
  const already = consumptionOf(dir, grantId);
  if (already) {
    if (already.mergeSha === o.mergeSha) return already;
    fail('TASK_GRANT_CONSUMED', 'already consumed by ' + already.mergeSha);
  }
  return append(dir, {
    event: 'CONSUMED',
    grantId,
    taskId: o.taskId || null,
    entryId: o.entryId || null,
    prNumber: o.prNumber || null,
    mergeSha: o.mergeSha,
    atMs: o.nowMs || Date.now(),
  });
}

/** What an operator asks: is this grant still good for anything? */
function statusOf(dir, grant) {
  const grantId = grant.standingGrantId || grant.grantId;
  const consumed = consumptionOf(dir, grantId);
  return {
    grantId,
    oneShot: isOneShot(grant),
    state: consumed ? 'CONSUMED' : 'ACTIVE',
    mergeSha: consumed ? consumed.mergeSha : null,
    pullRequests: pullRequestsOf(dir, grantId),
  };
}

module.exports = {
  GRANT_KIND,
  REFUSALS,
  OneShotGrantError,
  isOneShot,
  exactTarget,
  history,
  consumptionOf,
  pullRequestsOf,
  assertUsable,
  recordPr,
  consume,
  statusOf,
};
