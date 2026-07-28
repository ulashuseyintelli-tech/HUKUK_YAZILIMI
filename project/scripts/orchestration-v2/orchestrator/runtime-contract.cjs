'use strict';
/**
 * Which workers may process which queue entries.
 *
 * The queue lives in the git COMMON dir, so every worktree of this repository
 * shares one copy of it — that is the whole point, and it is also the hazard.
 * A worktree checked out at an older commit runs older dispatch code against
 * the same durable entries, and older code can compute a different answer to
 * the same question.
 *
 * Measured, not imagined. The R04 canary was pushed to a terminal
 * DISPATCH_PLAN_HASH_CHANGED by a worker whose checkout predated the fix that
 * made the two notions of a plan's identity agree. The entry pinned the
 * normalized digest, the stale worker computed the raw one, and a plan that had
 * not moved failed the guard that exists to catch plans that did. The blocker
 * was terminal, so one out-of-date worktree could permanently kill another
 * session's work by merely draining the queue.
 *
 * The fence closes that. An entry records, at admission, what a worker must be
 * to touch it; a worker measures what it actually is; and a worker that does
 * not qualify RELINQUISHES — it does not block the entry, does not mutate the
 * task store, does not spend a retry, and does not decide anything terminal.
 * It writes one audit line naming its own sha and worktree, and leaves the work
 * runnable for a worker that qualifies.
 *
 * Deliberately NOT a single pinned commit. A version plus a set of required
 * ancestors says what compatibility MEANS, which survives the next fix; one
 * hard-coded sha says only what was true on the day it was written.
 */

const { execFileSync } = require('child_process');

/**
 * The dispatch semantics this code implements.
 *
 * Bump this ONLY when a change makes an older worker answer a dispatch-time
 * question differently — a digest notion, a boundary rule, a state edge that
 * decides terminality. A version bump makes every entry admitted afterwards
 * unreachable to older workers, which is a real cost and the reason it is not
 * a routine act.
 *
 *   1  the contract as of the R04 canary: plan identity is the NORMALIZED
 *      digest (specDigests), artefact digests are verified at a canonical ref,
 *      and a plan-digest re-pin is an authorized act rather than a patch.
 */
const RUNTIME_CONTRACT_VERSION = 1;

/**
 * Fixes a worker must already have, by merge ancestry.
 *
 * This is the second half of the answer and the more precise one: a worker may
 * report the right contract version and still predate a specific correction if
 * it was branched before the fix and rebuilt after the bump. Ancestry cannot be
 * fooled that way.
 *
 * Each entry says WHY, because a bare sha in a list is unmaintainable — nobody
 * can tell later whether it may be dropped.
 */
const REQUIRED_FIX_ANCESTORS = [
  {
    sha: '516bac054804d0969db9ee875e06eed2ee7a6467',
    why: 'dispatch compares the same plan identity the entry pins; older workers push entries to a terminal DISPATCH_PLAN_HASH_CHANGED',
  },
];

const REFUSALS = [
  'WORKER_VERSION_INCOMPATIBLE',
  'WORKER_CODE_STALE',
  'WORKER_CODE_UNKNOWN',
];

class WorkerFenceError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'WorkerFenceError';
    this.code = code;
    this.detail = detail || null;
  }
}

function git(repoCwd, args) {
  return execFileSync('git', args, { cwd: repoCwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * What this worker actually is, measured from the repository it runs in.
 *
 * Every field is observed. A worker that cannot measure itself reports
 * `codeSha: null` and is refused rather than assumed current — "I could not
 * tell" and "I am up to date" must not produce the same outcome.
 */
function measureWorker(o) {
  // The worker's OWN checkout, not the repository a task happens to target.
  // The question this answers is "does the code I am running contain the
  // fix?", which is about where this module lives — a service pointed at a
  // scratch directory would otherwise measure the scratch directory and
  // report whatever it found there as its own version.
  const repoCwd = (o && o.repoCwd) || __dirname;
  const out = {
    runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
    codeSha: null,
    worktree: null,
    repositoryRoot: null,
    mainSha: null,
    ahead: null,
    behind: null,
    // Visible in status output: a truncated history is why the fence may be
    // unable to answer, and an operator should not have to infer that.
    shallow: null,
    pid: o.pid === undefined ? process.pid : o.pid,
  };
  try {
    out.codeSha = git(repoCwd, ['rev-parse', 'HEAD']);
    out.worktree = git(repoCwd, ['rev-parse', '--show-toplevel']);
    out.repositoryRoot = git(repoCwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    out.shallow = isShallow(repoCwd);
  } catch (e) {
    return out;
  }
  // Ahead/behind is reported but never gates: a worktree legitimately carries
  // unmerged work, and refusing it for that would stop ordinary development.
  // What matters is whether the required fixes are IN it.
  try {
    out.mainSha = git(repoCwd, ['rev-parse', 'origin/main']);
    const counts = git(repoCwd, ['rev-list', '--left-right', '--count', 'origin/main...HEAD']).split(/\s+/);
    out.behind = Number(counts[0]);
    out.ahead = Number(counts[1]);
  } catch (e) {
    /* a repository with no origin/main still has a measurable HEAD */
  }
  return out;
}

/**
 * Is this checkout's history truncated?
 *
 * The fence asks "does the code I am running contain the fix?" and answers it
 * with git ancestry. In a shallow clone that instrument cannot answer at all:
 * the commit is not absent from the LINEAGE, it is absent from the CLONE, and
 * hasAncestor reports both as false.
 *
 * The two are not the same fact and must not produce the same verdict. A CI
 * runner checks out with actions/checkout's default depth of 1, so every
 * required fix looks missing, every worker judges itself stale, and every
 * dispatch relinquishes — which is exactly what turned main red while the fix
 * was sitting in the working tree the whole time.
 */
function isShallow(repoCwd) {
  try {
    return (
      execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
        cwd: repoCwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === 'true'
    );
  } catch (e) {
    // Unknown depth is treated as complete: this only ever RELAXES a refusal,
    // and a repository that cannot answer rev-parse has already failed the
    // measurement above with codeSha null.
    return false;
  }
}

/** Is `sha` an ancestor of the worker's HEAD? Unknown counts as no. */
function hasAncestor(repoCwd, sha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], {
      cwd: repoCwd,
      stdio: 'ignore',
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * What an entry pins at admission: what a worker must be, not who admitted it.
 */
function pinForAdmission(o) {
  return {
    runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
    admissionCodeSha: (o && o.admissionCodeSha) || null,
    minimumCompatibleRuntimeVersion: RUNTIME_CONTRACT_VERSION,
    requiredFixAncestors: REQUIRED_FIX_ANCESTORS.map((f) => f.sha),
  };
}

/**
 * May this worker process this entry?
 *
 * An entry with no pin is pre-fence and is allowed through: refusing it would
 * strand every entry admitted before this code existed, which is a worse
 * failure than the one being prevented.
 */
function assess(o) {
  const entry = o.entry || {};
  const worker = o.worker;
  const min = entry.minimumCompatibleRuntimeVersion;
  const required = entry.requiredFixAncestors || [];

  if (min === undefined || min === null) {
    return { compatible: true, refusal: null, detail: 'entry predates the worker fence', worker };
  }
  if (!worker || !worker.codeSha) {
    return {
      compatible: false,
      refusal: 'WORKER_CODE_UNKNOWN',
      detail: 'the worker cannot measure its own commit; refusing rather than assuming it is current',
      worker,
    };
  }
  if (!(worker.runtimeContractVersion >= min)) {
    return {
      compatible: false,
      refusal: 'WORKER_VERSION_INCOMPATIBLE',
      detail: 'worker implements contract v' + worker.runtimeContractVersion + ', entry needs v' + min,
      worker,
    };
  }
  // Injectable because ancestry is a repository question, and a test that has
  // to build a repository to ask it will not be written.
  const ancestorOf = o.hasAncestor || hasAncestor;
  const codeCwd = o.repoCwd || __dirname;
  const missing = required.filter((sha) => !ancestorOf(codeCwd, sha));
  if (missing.length) {
    // "Not an ancestor" and "not in this clone" arrive here as the same false.
    // Only the first means the worker is old; the second means the question was
    // never answerable, and refusing on an unanswerable question is not a
    // safety property, it is an outage. A shallow checkout runs the tree it
    // checked out — the fix is in the code even when the commit that introduced
    // it is not in the history.
    //
    // The case the fence exists for is untouched: a full clone whose HEAD
    // genuinely predates a required fix still answers false, is still not
    // shallow, and is still refused.
    const shallow = (o.isShallow || isShallow)(codeCwd);
    if (!shallow) {
      return {
        compatible: false,
        refusal: 'WORKER_CODE_STALE',
        detail: 'missing required fix ' + missing.map((s) => s.slice(0, 12)).join(', ') + ' in ' + (worker.worktree || '(unknown worktree)'),
        worker,
      };
    }
    return {
      compatible: true,
      refusal: null,
      // Reported, never silent: an operator reading this must be able to see
      // that the fence was asked and could not answer, rather than believe it
      // answered yes.
      detail:
        'ancestry unverifiable in a shallow checkout; ' +
        missing.map((s) => s.slice(0, 12)).join(', ') +
        ' could not be located in a truncated history',
      unverifiable: 'SHALLOW_HISTORY',
      worker,
    };
  }
  return { compatible: true, refusal: null, detail: null, worker };
}

module.exports = {
  RUNTIME_CONTRACT_VERSION,
  REQUIRED_FIX_ANCESTORS,
  REFUSALS,
  WorkerFenceError,
  measureWorker,
  hasAncestor,
  isShallow,
  pinForAdmission,
  assess,
};
