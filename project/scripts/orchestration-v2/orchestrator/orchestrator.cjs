'use strict';
/**
 * GOV-COORD-V2 orchestration — the task chain.
 *
 * Contract: coordination-v2/governance-orchestration-contract-v2.md §3-§8
 *
 * Wires the T2 safety kernel (lease CAS, diff boundary, worktree lifecycle) to
 * the T3 executor adapters under the persisted lifecycle:
 *
 *   spec load -> grant/hash validation -> eligibility -> lease claim ->
 *   isolated worktree -> executor resolution -> spawn -> output capture ->
 *   actual diff validation -> required tests -> PR -> CI observation ->
 *   MERGE_READY attestation -> manual merge wait -> fresh revalidation ->
 *   closure -> successor eligibility
 *
 * The orchestrator never merges and never mints authority. PR and CI are
 * injected so a synthetic pilot can exercise the whole chain without creating
 * real pull requests.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const lease = require('../safety/lease.cjs');
const boundary = require('../safety/boundary.cjs');
const worktree = require('../safety/worktree.cjs');
const resolveMod = require('../executors/resolve.cjs');
const spawnMod = require('../executors/spawn.cjs');
const authority = require('./authority.cjs');
const stateMod = require('./state.cjs');
const mergeready = require('./mergeready.cjs');
const eligibleResume = require('./eligible-resume.cjs');
const successorMod = require('./successor.cjs');

/**
 * Immutable global forbidden set (§1). Never overridable by a task.
 *
 * This is a hand-written list, not a read of
 * `governance-writer-coordination-protected-paths.json`, so that the set is
 * greppable and needs no I/O at require time. That transcription had drifted
 * from its source — `project/docs/design/**`, `project/docs/runbooks/**`,
 * `.agents/skills/**` and the coordination guard's own test file were all
 * missing, and the schema/migration surface was named by two paths that do not
 * exist in the tree instead of the one that does. `orchestrator.test.cjs` now
 * asserts semantic coverage of every protected entry and of every tracked
 * schema/migration path, so a future drift fails a test rather than silently
 * widening what a task may touch.
 */
const IMMUTABLE_FORBIDDEN = [
  // canonicalSemanticGovernance
  'AGENTS.md',
  'CLAUDE.md',
  'project/docs/governance/**',
  'project/docs/adr/**',
  'project/docs/blueprint/**',
  'project/docs/design/**',
  'project/docs/runbooks/**',
  // coordinationControlPlane
  '.github/workflows/ci.yml',
  'project/scripts/governance-coordination.cjs',
  'project/scripts/governance-coordination.test.cjs',
  'project/scripts/gh-guard-readonly.ps1',
  'project/scripts/gh-guard-readonly.test.cjs',
  '.agents/skills/**',
  // grandfatheredOwnerWip (prefixes + every exact path falls under these)
  '.claude/',
  '.codex/',
  '.worktrees/',
  // PRODUCTION_SCHEMA_MIGRATION_RUNTIME — V1 §3 DENIED.
  // The tree's only schema/migration surface is project/apps/api/prisma/;
  // project/apps/api/src/prisma/ is PrismaModule/PrismaService code and stays
  // reachable. project/prisma/ and project/deploy/ are inherited from V1 and
  // have no counterpart in the tree — kept as defensive prefixes only (§1.1).
  'project/apps/api/prisma/',
  'project/ops/',
  'project/node_modules/',
  'project/prisma/',
  'project/deploy/',
];

class OrchestratorError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'OrchestratorError';
    this.code = code;
    this.detail = detail || null;
  }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
}

function randomId() {
  return require('crypto').randomBytes(16).toString('hex');
}

/**
 * Eligibility (§3, §4): every declared predecessor must be CLOSED, and the
 * task's boundary must not overlap a boundary already held by an in-flight task.
 */
function evaluateEligibility(opts) {
  const store = opts.store;
  const validated = opts.validated;
  const reasons = [];

  // The live predecessor gate. One rule, shared with successorDisposition and
  // the queue's dependsOn check — three copies of it is three places for it to
  // drift, and the drift releases a successor from whichever site was checked.
  //
  // Scoped by the SUCCESSOR's schema: a v2 task additionally requires each
  // predecessor to carry merge-SHA-bound delivery evidence, while a v1 task
  // keeps the rule it was authored under.
  const successorGate = successorMod.evaluate({
    predecessorTaskIds: validated.predecessorTaskIds || [],
    currentOf: (id) => store.current(id),
    successorSchema: validated.spec.schemaVersion,
  });
  for (const r of successorGate.reasons) reasons.push(r);

  const myRoots = validated.spec.boundaryPolicy.allowedRoots;
  for (const otherId of store.list()) {
    if (otherId === validated.spec.taskId) continue;
    const rec = store.current(otherId);
    if (!rec || !stateMod.requiresLease(rec.state)) continue;
    const theirRoots = (rec.payload && rec.payload.allowedRoots) || [];
    for (const a of myRoots) {
      for (const b of theirRoots) {
        if (a === b || a.startsWith(b) || b.startsWith(a)) {
          reasons.push('SHARED_PATH_CONFLICT:' + otherId + ':' + a + '~' + b);
        }
      }
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Run one task through the chain.
 *
 * `deps` supplies the injectable surfaces: prProvider, ciProvider, an optional
 * executorOverride (used by the synthetic pilot), and the worktree factory.
 * Returns a disposition record; never throws for an expected fail-closed path.
 */
async function runTask(ctx) {
  const store = ctx.store;
  const repoCwd = ctx.repoCwd;
  const taskId = ctx.spec && ctx.spec.taskId;
  const attemptId = ctx.taskAttemptId || randomId();
  const holderToken = ctx.holderToken || randomId();
  const holder = ctx.holder;
  const nowMs = () => (ctx.clock ? ctx.clock() : Date.now());
  const trace = [];

  const blocked = (code, detail, extra) => {
    try {
      store.transition({
        taskId,
        to: 'BLOCKED',
        expectedPreviousState: store.current(taskId) ? store.current(taskId).state : null,
        writerIdentity: 'ORCHESTRATOR',
        payload: Object.assign({ blockerCode: code, detail: detail || null }, extra || {}),
        nowMs: nowMs(),
      });
    } catch (e) {
      // A failure to record BLOCKED must surface, not be swallowed.
      trace.push('BLOCKED_RECORD_FAILED:' + (e.code || e.message));
    }
    return { disposition: 'BLOCKED', blockerCode: code, detail: detail || null, trace, taskId };
  };

  // --- DECLARED -----------------------------------------------------------
  //
  // state.cjs models BLOCKED as recoverable — it is not in TERMINAL, and
  // ALLOWED.BLOCKED is ['ELIGIBLE', 'CANCELLED'] under the comment "BLOCKED
  // returns only to ELIGIBLE, and only by owner action". Nothing implemented
  // that return. A task blocked by a transient failure — a worktree that could
  // not be created, an executor that was not installed — could never run again:
  // the record exists so DECLARED is skipped, and AUTHORIZED then demands
  // DECLARED and fails STATE_CAS_MISMATCH. Any infrastructure hiccup burned a
  // ratified plan hash and forced a fresh ratification cycle.
  //
  // Resume is deliberately NOT automatic. Silently retrying a blocked task is
  // what the CAS guard exists to prevent, so the caller must ask for it:
  // ctx.resumeFromBlocked, surfaced as --resume-blocked. The blocker it resumed
  // from is recorded in the ELIGIBLE payload, so the append-only log shows the
  // recovery instead of hiding it.
  const opening = store.current(taskId);
  const resumingFromBlocked = Boolean(opening) && opening.state === 'BLOCKED';
  const resumedFromBlocker =
    resumingFromBlocked && opening.payload ? opening.payload.blockerCode || null : null;
  if (resumingFromBlocked && ctx.resumeFromBlocked !== true) {
    return blocked(
      'BLOCKED_RESUME_NOT_AUTHORIZED',
      taskId + ' is BLOCKED (' + (resumedFromBlocker || 'unknown') + '); an owner-authorized resume is required',
    );
  }
  // A task left at ELIGIBLE is re-entered where it stopped, not rewound.
  //
  // ELIGIBLE means the grant, the four digests, the revocation marker and the
  // eligibility checks all passed and the task was about to take its lease. A
  // process that died in that window used to leave the task permanently
  // unrunnable: nothing handled this opening, so the AUTHORIZED write below
  // failed with STATE_CAS_MISMATCH: expected DECLARED but store holds ELIGIBLE.
  //
  // Rewinding to DECLARED would throw away a validation that really happened
  // and re-derive it from a world that may since have moved. Instead the same
  // checks run again below — they are not skipped — and the only thing this
  // branch changes is that the three lifecycle writes are not repeated, because
  // the states they would write are already recorded.
  const resumingFromEligible = Boolean(opening) && opening.state === 'ELIGIBLE';
  // AUTHORIZED is the same crash window one step earlier: validated, but the
  // ELIGIBLE write had not landed. Re-entered the same way.
  const resumingFromAuthorized = Boolean(opening) && opening.state === 'AUTHORIZED';

  // Every other opening is refused BY NAME rather than by falling through to a
  // write that expects DECLARED. ER-6 found this: a second run against a task
  // already at MERGE_READY died with "STATE_CAS_MISMATCH: expected DECLARED but
  // store holds MERGE_READY" — a CAS message describing an internal write, for
  // a caller whose actual mistake was starting a finished task again.
  const REENTRANT = ['DECLARED', 'AUTHORIZED', 'ELIGIBLE', 'BLOCKED'];
  if (opening && REENTRANT.indexOf(opening.state) === -1) {
    return blocked(
      'TASK_NOT_REENTRANT',
      taskId + ' is at ' + opening.state + '; only a task that has not yet been claimed can be started',
      { openingState: opening.state },
    );
  }

  if (!opening) {
    store.transition({
      taskId,
      to: 'DECLARED',
      expectedPreviousState: null,
      writerIdentity: 'TASK_AUTHOR',
      payload: { taskSpecVersion: ctx.spec.taskSpecVersion },
      nowMs: nowMs(),
    });
    trace.push('DECLARED');
  }

  // --- AUTHORIZED : immutable grant/hash validation (§2) -------------------
  let validated;
  try {
    validated = authority.validateAgainstGrant({
      grant: ctx.grant,
      spec: ctx.spec,
      revoked: ctx.grantRevoked === true,
      // Read only by the PROGRAM_STANDING branch — a task-scoped grant pins its
      // task by exact digest and never asks what class or lane is running it.
      taskClass: ctx.taskClass,
      executorLane: ctx.holder,
      killSwitchEngaged: ctx.killSwitchEngaged === true,
      nowMs: nowMs(),
    });
  } catch (e) {
    return blocked(e.code || 'AUTHORITY_INVALID', e.detail || e.message);
  }
  // BLOCKED -> AUTHORIZED is not a legal edge, so a resume goes straight to
  // ELIGIBLE. The authority check above still ran unconditionally, so the grant
  // and hashes are re-validated on every attempt including this one — what is
  // skipped is the state-log entry, not the verification.
  if (!resumingFromBlocked && !resumingFromEligible && !resumingFromAuthorized) {
    store.transition({
      taskId,
      to: 'AUTHORIZED',
      expectedPreviousState: 'DECLARED',
      writerIdentity: 'OWNER',
      payload: { grantId: validated.grantId, taskSpecSha256: validated.digests.taskSpecSha256 },
      nowMs: nowMs(),
    });
    trace.push('AUTHORIZED');
  }

  // --- ELIGIBLE -----------------------------------------------------------
  const elig = evaluateEligibility({ store, validated });
  if (!elig.eligible) {
    return blocked('NOT_ELIGIBLE', elig.reasons.join('; '), { reasons: elig.reasons });
  }

  // Re-entering at ELIGIBLE: every check above has just run again, so what is
  // left to establish is that nobody else is running this task. Both signals
  // are consulted — a live lease and a live process — because either alone can
  // be stale in the direction that starts a second executor.
  let eligibleResumeEvidence = null;
  if (resumingFromEligible) {
    let leaseRecord = null;
    try {
      // Positional, not an options object: lease.read is read(taskId, cwd).
      // Passing an object made the guard silently see no lease, so a live
      // lease was caught one step later by the claim CAS — safe, but with
      // CLAIM_CONFLICT instead of the reason the caller needed.
      leaseRecord = lease.read(taskId, repoCwd).record || null;
    } catch (e) {
      leaseRecord = null;
    }
    const verdict = eligibleResume.assessResume({
      taskRecord: opening,
      leaseRecord,
      queueEntry: ctx.queueEntry || null,
      killSwitchEngaged: ctx.isKillSwitchEngaged ? ctx.isKillSwitchEngaged() === true : false,
      grantRevoked: ctx.grantRevoked === true,
      programEligible: ctx.programEligible,
      parentAuthorizationId: ctx.parentAuthorizationId,
      expectedParentAuthorizationId: ctx.expectedParentAuthorizationId,
      taskId,
      expectedTaskSpecSha256: (opening.payload && opening.payload.taskSpecSha256) || null,
      actualTaskSpecSha256: validated.digests.taskSpecSha256,
      expectedLane: ctx.expectedLane,
      actualLane: holder,
      nowMs: nowMs(),
    });
    if (!verdict.resumable) {
      return blocked('ELIGIBLE_RESUME_REFUSED', verdict.refusal + ': ' + verdict.reason, {
        refusal: verdict.refusal,
        from: verdict.from,
      });
    }
    // A NEW attempt id, recorded. A resume that reuses the old one is
    // indistinguishable in the log from the attempt that died.
    eligibleResumeEvidence = eligibleResume.resumeEvidence({
      attemptId,
      previousAttemptId: verdict.previousAttemptId,
      parentAuthorizationId: ctx.parentAuthorizationId,
      reason: verdict.reason,
      nowMs: nowMs(),
    });
    trace.push('ELIGIBLE(resumed-in-place)');
  }

  if (!resumingFromEligible) store.transition({
    taskId,
    to: 'ELIGIBLE',
    expectedPreviousState: resumingFromBlocked ? 'BLOCKED' : 'AUTHORIZED',
    // ELIGIBLE is authored by the ORCHESTRATOR in every case — WRITER pins it
    // and enforces it. The owner's part is the decision to resume, not the
    // write; it is recorded in the payload rather than by borrowing the owner's
    // identity for a state the owner is not permitted to author.
    writerIdentity: 'ORCHESTRATOR',
    payload: resumingFromBlocked
      ? {
          allowedRoots: validated.spec.boundaryPolicy.allowedRoots,
          ownerAuthorizedResume: true,
          resumedFromBlocker,
          grantId: validated.grantId,
          taskSpecSha256: validated.digests.taskSpecSha256,
        }
      : { allowedRoots: validated.spec.boundaryPolicy.allowedRoots },
    nowMs: nowMs(),
  });
  trace.push(resumingFromBlocked ? 'ELIGIBLE(resumed)' : 'ELIGIBLE');

  // --- CLAIMED : atomic lease CAS (§6) ------------------------------------
  let claim;
  try {
    claim = lease.claim({
      cwd: repoCwd,
      taskId,
      holder,
      holderToken,
      taskAttemptId: attemptId,
      ttlMs: ctx.leaseTtlMs || 10 * 60 * 1000,
      nowMs: nowMs(),
    });
  } catch (e) {
    return blocked(e.code || 'CLAIM_FAILED', e.detail || e.message);
  }
  const epoch = claim.epoch;
  const assertHeld = () =>
    lease.assertHeld({ cwd: repoCwd, taskId, holderToken, leaseEpoch: epoch, nowMs: nowMs() });

  const advance = (to, from, payload) =>
    store.transition({
      taskId,
      to,
      expectedPreviousState: from,
      taskAttemptId: attemptId,
      leaseEpoch: epoch,
      holderToken,
      assertHeld,
      writerIdentity: to === 'MERGED' ? 'OWNER' : 'ORCHESTRATOR',
      payload: Object.assign({ allowedRoots: validated.spec.boundaryPolicy.allowedRoots }, payload || {}),
      nowMs: nowMs(),
    });

  advance('CLAIMED', 'ELIGIBLE', Object.assign({ leaseId: claim.record.leaseId, epoch }, eligibleResumeEvidence || {}));
  trace.push('CLAIMED');

  const release = (reason) => {
    try {
      lease.release({ cwd: repoCwd, taskId, holderToken, leaseEpoch: epoch, releaseReason: reason, nowMs: nowMs() });
    } catch (e) {
      trace.push('LEASE_RELEASE_FAILED:' + (e.code || e.message));
    }
  };

  // --- WORKTREE_READY : base drift policy (§13) ---------------------------
  let wt = null;
  try {
    const baseRef = ctx.baseRef || 'origin/main';
    const policy = validated.spec.baseDriftPolicy;
    let pinnedBase;
    if (policy === 'STRICT_PINNED_BASE') {
      pinnedBase = validated.spec.baseSha;
      const head = git(['rev-parse', baseRef], repoCwd);
      if (head !== pinnedBase) {
        release('TERMINAL_BLOCKED_PUBLISHED');
        return blocked('BLOCKED_BASE_SHA_DRIFT', baseRef + '=' + head + ' pinned=' + pinnedBase);
      }
    } else {
      pinnedBase = git(['rev-parse', baseRef], repoCwd);
    }
    wt = ctx.worktreeFactory
      ? ctx.worktreeFactory({ taskId, attemptId, pinnedBase })
      : worktree.createIsolated({
          cwd: repoCwd,
          // The directory name is TRUNCATED; the branch name is not.
          //
          // Windows MAX_PATH is 260 and this repository's longest tracked path
          // is 163 characters. A full taskId plus attempt suffix is 62, which
          // left no room: `git worktree add` half-populated the tree and then
          // `git worktree remove` could not delete it either, stranding
          // directories that no recursive-delete policy permits cleaning up.
          // Three such directories exist today, and MAX_PATH — not orphan
          // detection — is why.
          //
          // 24 characters keep the task recognisable to an operator; the
          // attempt suffix keeps two truncations of different tasks distinct.
          path: path.join(ctx.worktreeRoot, worktreeDirName(taskId, attemptId)),
          branch: 'orchestrator/' + taskId.toLowerCase() + '-' + attemptId.slice(0, 8),
          baseRef: pinnedBase,
        });
    advance('WORKTREE_READY', 'CLAIMED', { worktreePath: wt.path, pinnedBaseSha: wt.pinnedBaseSha || pinnedBase });
    trace.push('WORKTREE_READY');
  } catch (e) {
    release('TERMINAL_BLOCKED_PUBLISHED');
    return blocked(e.code || 'WORKTREE_FAILED', e.detail || e.message);
  }

  const cleanupWorktree = () => {
    if (!wt || ctx.worktreeFactory) return null;
    try {
      return worktree.removeSafe({ cwd: repoCwd, path: wt.path });
    } catch (e) {
      trace.push('WORKTREE_CLEANUP_FAILED:' + (e.code || e.message));
      return null;
    }
  };

  // --- environment preparation -------------------------------------------
  //
  // A fresh worktree has no node_modules: it is gitignored, so `git worktree
  // add` does not carry it, and nothing here installed it. Without preparation
  // both the executor and every requiredTests entry fail on an unprepared tree
  // — not a test failure, an unrunnable gate.
  //
  // This belongs to the orchestrator, not to each task spec. Putting it in
  // requiredTests made every plan re-declare the same two commands and muddied
  // the attestation, which then reported "4/4 requiredTests" for two setup
  // steps plus two actual test runs.
  //
  // It runs AFTER the worktree exists and BEFORE the executor, so the executor
  // can run tests itself. It is deliberately NOT part of the boundary verdict:
  // the diff gate reads tracked paths, and preparation writes only into
  // gitignored directories. A preparation step that dirtied a tracked file
  // would be a defect in the adapter, not something to tolerate here — so the
  // adapter is expected to fail closed rather than mutate the tree.
  // The blocker code is EXECUTOR_UNAVAILABLE, not a new ENVIRONMENT_* value:
  // result.schema.json pins blockerCode to a 15-value enum and the contract is
  // now ratified, so adding a value is an owner amendment. The precise cause is
  // carried in `detail`. (orchestrator.cjs already emits four codes outside that
  // enum — EXECUTOR_NONZERO_EXIT, MERGE_READY_CONJUNCTION_FAILED, NOT_ELIGIBLE,
  // PR_OPEN_FAILED — which is a pre-existing divergence reported separately, not
  // a licence to add a fifth.)
  if (ctx.prepareEnvironment) {
    let prep;
    try {
      prep = await ctx.prepareEnvironment({ taskId, worktreePath: wt.path, spec: validated.spec });
    } catch (e) {
      cleanupWorktree();
      release('TERMINAL_BLOCKED_PUBLISHED');
      return blocked('EXECUTOR_UNAVAILABLE', 'ENVIRONMENT_PREPARATION_FAILED: ' + (e.detail || e.message));
    }
    if (prep && prep.ok === false) {
      cleanupWorktree();
      release('TERMINAL_BLOCKED_PUBLISHED');
      return blocked(
        'EXECUTOR_UNAVAILABLE',
        'ENVIRONMENT_PREPARATION_FAILED: ' + (prep.detail || 'adapter reported failure'),
      );
    }
    trace.push('ENVIRONMENT_PREPARED');
  }

  // --- EXECUTOR_RUNNING : resolution (§7.1) + spawn (§7.2-§7.6) -----------
  let resolved = ctx.executorOverride || null;
  if (!resolved) {
    resolved = resolveMod.resolveExecutor({ lane: holder, cwd: wt.path, skipSmoke: ctx.skipSmoke === true });
  }
  if (!resolved || resolved.state !== 'AVAILABLE') {
    cleanupWorktree();
    release('TERMINAL_BLOCKED_PUBLISHED');
    return blocked('EXECUTOR_UNAVAILABLE', (resolved && resolved.unavailableReason) || 'unresolved');
  }
  advance('EXECUTOR_RUNNING', 'WORKTREE_READY', {
    executorLane: resolved.executorLane,
    resolvedAbsolutePath: resolved.resolvedAbsolutePath,
    version: resolved.version,
    resolutionSource: resolved.resolutionSource,
  });
  trace.push('EXECUTOR_RUNNING');

  let run;
  try {
    run = await spawnMod.runExecutor({
      resolved,
      argv: ctx.executorArgv,
      workingDirectory: wt.path,
      prompt: ctx.prompt,
      promptTransport: ctx.promptTransport,
      parentEnv: ctx.parentEnv,
      credentialAllowlist: ctx.credentialAllowlist,
      limits: ctx.limits,
      cancellationSignal: ctx.cancellationSignal,
      structuredResult: ctx.structuredResult,
      // §7.6: lease loss freezes mutation and terminates the process tree.
      leaseCheck: assertHeld,
    });
  } catch (e) {
    cleanupWorktree();
    release('TERMINAL_BLOCKED_PUBLISHED');
    return blocked(e.code || 'SPAWN_FAILED', e.detail || e.message);
  }

  // A cancelled or orphan-bearing attempt may never publish a result (§7.6).
  if (!run.publishable) {
    cleanupWorktree();
    const code =
      run.termination.reason === 'LEASE_EPOCH_LOSS'
        ? 'FENCING_FAILURE'
        : run.termination.reason === 'TIMEOUT'
          ? 'EXECUTOR_TIMEOUT'
          : run.termination.orphanProcessDetected
            ? 'ORPHAN_PROCESS_DETECTED'
            : 'CANCELLED';
    if (code !== 'FENCING_FAILURE') release('CANCELLED_CLEANUP_COMPLETE');
    return blocked(code, run.termination.reason, {
      termination: run.termination,
      stale_result_suppressed: true,
    });
  }

  advance('VALIDATING', 'EXECUTOR_RUNNING', {
    exitCode: run.exitCode,
    executorExitSuccess: run.executorExitSuccess,
    durationMs: run.durationMs,
  });
  trace.push('VALIDATING');

  if (!run.executorExitSuccess) {
    cleanupWorktree();
    release('TERMINAL_BLOCKED_PUBLISHED');
    // withOutput: this is the one failure an operator cannot diagnose without
    // seeing what the tool said.
    return blocked('EXECUTOR_NONZERO_EXIT', 'exit=' + String(run.exitCode), { run: summarize(run, true) });
  }

  // --- actual diff boundary validation (§1, §8) ---------------------------
  //
  // A file the executor CREATED is untracked, and the validator treats every
  // untracked path as an escape — correctly, because an untracked file is not
  // part of a diff it can judge. But "add a characterization test" is the
  // canonical task class here, so as written no task could ever create a file:
  // the canary produced exactly the file its plan authorized, at exactly the
  // authorized path, and was refused for being new.
  //
  // Rather than weaken the validator, the created files inside the authorized
  // roots are staged with --intent-to-add. They then appear in the diff as
  // additions and are judged by the SAME rules as every other change —
  // forbidden paths, allowedRoots, maxChangedFiles, structural classes.
  //
  // Anything created OUTSIDE the roots is deliberately NOT staged: it stays
  // untracked and still trips UNTRACKED_FILE_PRESENT. The escape path is
  // unchanged; what changed is that an authorized creation is now visible to
  // the rules instead of being refused before they run.
  try {
    const roots = validated.spec.boundaryPolicy.allowedRoots.map((r) => boundary.normalizeRoot(r));
    const created = git(['ls-files', '--others', '--exclude-standard', '-z'], wt.path)
      .split(' ')
      .filter(Boolean)
      .filter((p) => boundary.underAnyRoot(p, roots));
    if (created.length) {
      execFileSync('git', ['add', '--intent-to-add', '--'].concat(created), { cwd: wt.path });
      trace.push('STAGED_CREATED:' + created.length);
    }
  } catch (e) {
    // Staging is a convenience for the validator, not a gate. If it fails the
    // files stay untracked and the validator refuses them — the safe direction.
    trace.push('STAGE_CREATED_FAILED:' + (e.code || e.message));
  }

  let verdict;
  try {
    const changes = boundary.extractChanges({
      base: wt.pinnedBaseSha || ctx.baseRef || 'HEAD',
      head: null,
      cwd: wt.path,
    });
    verdict = boundary.validate({
      changes,
      allowedRoots: validated.spec.boundaryPolicy.allowedRoots,
      forbidden: IMMUTABLE_FORBIDDEN.concat(ctx.extraForbidden || []),
      maxChangedFiles: validated.spec.boundaryPolicy.maxChangedFiles,
    });
  } catch (e) {
    cleanupWorktree();
    release('TERMINAL_BLOCKED_PUBLISHED');
    return blocked(e.code || 'DIFF_EXTRACTION_FAILED', e.detail || e.message);
  }

  if (!verdict.withinBoundary) {
    // No PR is opened for an out-of-boundary attempt (§5 precondition).
    cleanupWorktree();
    release('TERMINAL_BLOCKED_PUBLISHED');
    const code = verdict.forbiddenPathsUntouched ? 'BOUNDARY_ESCAPE' : 'FORBIDDEN_PATH_TOUCHED';
    return blocked(code, verdict.violations.map((v) => v.code + ':' + (v.path || '')).join('; '), {
      violations: verdict.violations,
    });
  }

  // An executor that changed nothing did not do the task; it is not a clean
  // run, it is an absent one. boundary.validate calls an empty diff within
  // boundary — correctly, nothing escaped — so without this the attempt passes
  // validation, pushes an empty branch to the remote, and fails three steps
  // later at PR creation with "No commits between main and ...".
  //
  // Measured exactly that way: a lane with no write permission thought for four
  // minutes, exited 0, reported success, and left a stray remote branch behind.
  // Blocking here keeps the remote clean and names the real cause.
  if (verdict.changeCount === 0) {
    // The executor's own output is kept HERE, and it is the only place it can
    // be kept. This branch runs on a successful exit, and summarize() drops
    // stdout and stderr unless it is told otherwise — so the one verdict that
    // cannot be diagnosed without the executor's words was the one recording
    // none of them. cleanupWorktree() then removes the tree the run happened
    // in, and with it the last copy.
    //
    // Measured: a second canary attempt reached exactly this line, and all that
    // survived was "executor exited successfully but changed no files". Whether
    // the lane refused, misread its prompt, or wrote outside the boundary was
    // unanswerable, and the run had to be repeated blind to find out.
    //
    // Read the output BEFORE the cleanup, for the obvious reason.
    const silence = summarize(run, true);
    cleanupWorktree();
    release('TERMINAL_BLOCKED_PUBLISHED');
    return blocked(
      'NO_CHANGES_PRODUCED',
      'executor exited successfully but changed no files; nothing to publish',
      { run: silence },
    );
  }

  // --- required tests -----------------------------------------------------
  const testResults = [];
  for (const t of validated.spec.requiredTests) {
    const r = ctx.testRunner
      ? ctx.testRunner(t, wt.path)
      : resolveMod.runCapture(t.argv[0], t.argv.slice(1), {
          cwd: t.cwd ? path.join(wt.path, t.cwd) : wt.path,
          timeoutMs: t.timeoutMs || 300000,
        });
    // The whole entry, not just argv. The attestation re-derives the gate set's
    // digest from what actually ran and compares it to the ratified one, which
    // is only possible if cwd and timeoutMs are recorded alongside.
    testResults.push({ cwd: t.cwd, argv: t.argv, timeoutMs: t.timeoutMs, status: r.status });
    if (r.status !== 0) {
      // Keep WHY, not just THAT.
      //
      // This recorded `exit=1` and nothing else, and then cleanupWorktree()
      // deleted the tree the failure happened in. The evidence was destroyed
      // twice: once by discarding the output runCapture had already captured,
      // and once by removing the only place it could be reproduced from. An
      // operator holding a blocked entry could see that a gate refused and had
      // no way at all to learn what it refused — which, in a system whose whole
      // subject is delivery truth, is the wrong thing to be silent about.
      //
      // The tail rather than the whole log: this lands in an append-only
      // durable store that is read on every fold, and a failing suite can emit
      // megabytes. The end is also where assertion failures and stack traces
      // are, so a bounded tail is not a lossy compromise here — it is the part
      // worth keeping.
      const tail = (s) => {
        const text = String(s || '');
        return text.length > 8000 ? '…(truncated)…\n' + text.slice(-8000) : text;
      };
      testResults[testResults.length - 1].failure = {
        stdout: tail(r.stdout),
        stderr: tail(r.stderr),
        signal: r.signal || null,
        timedOut: r.timedOut === true,
        error: r.error || null,
      };
      cleanupWorktree();
      release('TERMINAL_BLOCKED_PUBLISHED');
      return blocked('REQUIRED_TEST_FAILED', t.argv.join(' ') + ' exit=' + String(r.status), {
        testResults,
      });
    }
  }

  // --- PR_OPEN ------------------------------------------------------------
  let pr;
  try {
    pr = await ctx.prProvider.open({ taskId, worktreePath: wt.path, verdict, validated });
  } catch (e) {
    cleanupWorktree();
    release('TERMINAL_BLOCKED_PUBLISHED');
    return blocked('PR_OPEN_FAILED', e.message);
  }
  advance('PR_OPEN', 'VALIDATING', { prNumber: pr.number, prHeadSha: pr.headSha });
  trace.push('PR_OPEN');

  advance('CI_PENDING', 'PR_OPEN', { prNumber: pr.number });
  trace.push('CI_PENDING');

  // --- CI observation (§5.1 runtime-resolved required set) ----------------
  //
  // CI is observed until it settles, not once. The previous version asked
  // exactly once — seconds after the push, while every check was still queued —
  // and returned REQUIRED_CI_FAILED naming checks that were merely running. A
  // correct attempt could not reach MERGE_READY no matter what CI later said.
  //
  // A real failure is NOT waited on: once a required check has completed
  // non-successfully, waiting cannot change it, so the run stops immediately.
  // Waiting happens only while checks are pending or not yet registered.
  //
  // "We stopped looking" and "CI said no" are different facts, and the result
  // record must not blur them — but result.schema.json pins blockerCode to a
  // fixed enum and adding a value is an owner amendment, so the distinction
  // rides in the detail prefix and in the structured `ci` payload
  // (ci.pending / ci.missing / ci.failed) rather than in a new code.
  const ciWaitMs = Number.isFinite(ctx.ciWaitMs) ? ctx.ciWaitMs : 20 * 60 * 1000;
  const ciPollMs = Number.isFinite(ctx.ciPollMs) ? ctx.ciPollMs : 60 * 1000;
  // How long a required check may be entirely absent before that counts as
  // "it is never coming". Short: GitHub registers a pushed branch's checks in
  // seconds, so anything beyond this really is a missing required check.
  const ciMissingGraceMs = Number.isFinite(ctx.ciMissingGraceMs) ? ctx.ciMissingGraceMs : 3 * 60 * 1000;
  const sleep = ctx.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const startedAt = nowMs();
  const ciDeadline = startedAt + ciWaitMs;
  const missingDeadline = startedAt + ciMissingGraceMs;

  let ci;
  for (;;) {
    ci = mergeready.evaluateCi({
      sources: await ctx.ciProvider.requiredSources({ taskId, pr }),
      observed: await ctx.ciProvider.observe({ taskId, pr }),
    });
    if (ci.pass) break;
    if ((ci.failed || []).length > 0) {
      cleanupWorktree();
      release('TERMINAL_BLOCKED_PUBLISHED');
      return blocked('REQUIRED_CI_FAILED', ci.failed.join('; '), { ci });
    }
    // Absent checks get the short grace; running checks get the long wait.
    const waitingForMissing = !ci.settling && ci.settlingMissing;
    if (waitingForMissing && nowMs() >= missingDeadline) {
      cleanupWorktree();
      release('TERMINAL_BLOCKED_PUBLISHED');
      return blocked('REQUIRED_CI_FAILED', ci.missing.concat(ci.notSuccess).join('; '), { ci });
    }
    if (!ci.settling && !ci.settlingMissing) {
      // Neither running nor absent, yet not passing: nothing left to wait for.
      cleanupWorktree();
      release('TERMINAL_BLOCKED_PUBLISHED');
      return blocked('REQUIRED_CI_FAILED', ci.notSuccess.join('; '), { ci });
    }
    if (ci.settling && nowMs() >= ciDeadline) {
      cleanupWorktree();
      release('TERMINAL_BLOCKED_PUBLISHED');
      return blocked(
        'REQUIRED_CI_FAILED',
        'CI_STILL_PENDING_AT_DEADLINE: ' + (ci.pending || []).join('; '),
        { ci },
      );
    }
    await sleep(ciPollMs);
  }

  // --- MERGE_READY attestation (§5) --------------------------------------
  // The hash the grant actually pinned for this task, so the attestation term
  // states an observation rather than an inference from an earlier throw.
  const grantPinnedTaskSpecSha = (validated.pinned || {}).taskSpecSha256 || null;

  // Re-digest the gates that actually executed and compare to the ratified
  // requiredTestsSha256. This is the honest version of "required invariants
  // pass": there is no separate invariant list in the task schema, and the
  // strongest real statement available is that the gate set which ran is
  // byte-identical to the gate set the owner ratified.
  const executedGateSetMatchesRatified = () => {
    try {
      const ran = testResults.map((t) => ({ cwd: t.cwd, argv: t.argv, timeoutMs: t.timeoutMs }));
      return (
        authority.digest(authority.canonicalRequiredTests(ran)) ===
        validated.digests.requiredTestsSha256
      );
    } catch (e) {
      return false;
    }
  };

  // The tree the validated diff came from must STILL be there, and must still
  // be the root of a working tree, at attestation time. A worktree removed by a
  // partial cleanup, or a path swapped underneath the run, makes the diff's
  // provenance unprovable — and the attestation should say so rather than
  // asserting a constant.
  //
  // Deliberately not "must not be the canonical root": createIsolated already
  // refuses that at creation (TARGET_IS_CANONICAL_ROOT), so re-litigating it
  // here would only encode an assumption about how the worktree was made.
  // Both sides go through realpath before comparison. Windows hands back 8.3
  // short names (ULASTE~1) where git reports the long form, and a junction
  // resolves differently again — comparing the raw strings would report a
  // perfectly healthy worktree as invalid, which is the failure mode a
  // constant `true` was hiding in the first place.
  const realOrNull = (p) => {
    try {
      return fs.realpathSync.native(p).replace(/\\/g, '/').replace(/\/+$/, '');
    } catch (e) {
      return null;
    }
  };
  const worktreeStillValid = () => {
    if (!wt || !wt.path) return false;
    const want = realOrNull(wt.path);
    if (!want) return false;
    try {
      const top = git(['rev-parse', '--path-format=absolute', '--show-toplevel'], wt.path);
      return realOrNull(top) === want;
    } catch (e) {
      return false;
    }
  };

  const prState = await ctx.prProvider.state({ pr });
  const built = mergeready.buildAttestation({
    taskId,
    taskAttemptId: attemptId,
    taskSpecSha256: validated.digests.taskSpecSha256,
    grantId: validated.grantId,
    grantSha256: validated.grantSha256,
    leaseEpoch: epoch,
    holderToken,
    prNumber: pr.number,
    prHeadSha: prState.headSha,
    targetBranch: prState.targetBranch,
    targetBranchObservedSha: prState.targetBranchSha,
    mergeBaseSha: prState.mergeBaseSha,
    requiredCiResultSetSha256: ci.resultSetSha256,
    ttlMs: ctx.attestationTtlMs,
    nowMs: nowMs(),
    // Three of these were the literal `true`. An attestation that reports
    // "15/15" while three terms assert nothing is worth less than it looks, so
    // each now reads something the run actually observed.
    conjunction: {
      executorExitSuccess: run.executorExitSuccess === true,
      currentLeaseEpochConfirmed: safeAssert(assertHeld),
      holderTokenConfirmed: safeAssert(assertHeld),
      // Re-derived from the grant here rather than trusted from the earlier
      // throw. validateAgainstGrant already refuses a mismatch, so this was
      // "true" by inference — but an attestation term should state what was
      // observed, not what would have thrown.
      taskSpecHashMatchesGrant: grantPinnedTaskSpecSha === validated.digests.taskSpecSha256,
      actualDiffWithinBoundary: verdict.withinBoundary === true,
      immutableForbiddenPathsUntouched: verdict.forbiddenPathsUntouched === true,
      // The gate set that RAN, re-digested and compared to the one the grant
      // ratified. Comparing counts would have been a tautology — the loop
      // returns REQUIRED_TEST_FAILED before the lengths can diverge — so this
      // compares content: a spec mutated in memory after validation, or a
      // substituted test runner executing different argv, breaks it while
      // requiredTestsPass would still report true over whatever did run.
      requiredInvariantsPass: executedGateSetMatchesRatified(),
      requiredTestsPass: testResults.every((t) => t.status === 0),
      requiredCiChecksPass: ci.pass === true,
      prOpen: prState.open === true,
      prMergeable: prState.mergeable === true,
      noBlockingReview: prState.blockingReview !== true,
      noCompetingWriter: prState.competingWriter !== true,
      baseDriftPolicySatisfied: prState.baseDriftSatisfied !== false,
      // The worktree the diff came from must still be the isolated one this
      // attempt created, registered under the expected branch — not the
      // canonical root, and not something a partial cleanup left behind.
      worktreeStateValid: worktreeStillValid(),
    },
  });

  if (!built.ok) {
    cleanupWorktree();
    release('TERMINAL_BLOCKED_PUBLISHED');
    return blocked('MERGE_READY_CONJUNCTION_FAILED', built.failedConditions.join(','), {
      failedConditions: built.failedConditions,
    });
  }

  advance('MERGE_READY', 'CI_PENDING', { attestation: built.attestation });
  trace.push('MERGE_READY');

  // The lease is deliberately NOT released here (§3.2): the owner's merge
  // decision is still pending and no other writer may take the task.
  return {
    disposition: 'MERGE_READY',
    taskId,
    taskAttemptId: attemptId,
    leaseEpoch: epoch,
    holderToken,
    attestation: built.attestation,
    pr,
    ci,
    verdict,
    testResults,
    worktreePath: wt.path,
    run: summarize(run),
    trace,
    release,
    cleanupWorktree,
  };
}

function safeAssert(fn) {
  try {
    fn();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Directory name for an attempt's isolated worktree.
 *
 * Bounded on purpose. Windows MAX_PATH is 260, this repository's longest
 * tracked path is 163, and a full taskId plus attempt suffix was 62 — leaving
 * no headroom under any reasonable worktree root. When it overflowed, `git
 * worktree add` half-populated the tree AND `git worktree remove` could not
 * delete it, stranding directories that the repository's own cleanup policy
 * forbids removing recursively.
 *
 * The branch name is deliberately left full: it lives in refs, not on the
 * filesystem, and readability there is worth more than the bytes.
 */
const WORKTREE_DIR_TASK_CHARS = 24;
function worktreeDirName(taskId, attemptId) {
  const short = String(taskId).slice(0, WORKTREE_DIR_TASK_CHARS).replace(/[^A-Za-z0-9._-]/g, '-');
  return short + '-' + String(attemptId).slice(0, 8);
}

/**
 * How much of a failing executor's output to keep.
 *
 * Enough to see a stack trace or a refusal message, capped so a runaway process
 * cannot fill the state log. The TAIL rather than the head: a tool that fails
 * says why at the end.
 */
const OUTPUT_TAIL_CHARS = 2000;

function tail(text) {
  const s = String(text || '');
  if (s.length <= OUTPUT_TAIL_CHARS) return s;
  return '...(' + (s.length - OUTPUT_TAIL_CHARS) + ' chars elided)...' + s.slice(-OUTPUT_TAIL_CHARS);
}

/**
 * @param {object} run
 * @param {boolean} [withOutput] keep a tail of what the executor actually said
 *
 * spawn.cjs captures stdout and stderr, and this dropped both — so a failed lane
 * recorded exactly `exit=1` and nothing else. That is not a diagnosable failure:
 * it cost a full investigation to learn that a codex lane was exiting in 139ms,
 * because the record could not say what it printed.
 *
 * Kept only on the failure path. A successful run's output is large, mostly
 * uninteresting, and already summarised by the artefacts it produced.
 *
 * Not sanitised, deliberately. Inventing a redaction policy here would be
 * guessing at what a secret looks like; the child environment is
 * credential-allowlisted upstream, which is where that guarantee belongs. The
 * tail lands in the state log under .git/ — local and uncommitted, the same
 * trust level as the queue.
 */
function summarize(run, withOutput) {
  const out = {
    exitCode: run.exitCode,
    durationMs: run.durationMs,
    termination: run.termination.reason,
    orphanProcessDetected: run.termination.orphanProcessDetected,
    stdoutTruncated: run.stdoutTruncated,
    executorExitSuccess: run.executorExitSuccess,
  };
  if (withOutput) {
    out.stderrTail = tail(run.stderr);
    out.stdoutTail = tail(run.stdout);
  }
  return out;
}

/**
 * Owner merge step: fresh revalidation, then closure. The orchestrator does not
 * perform the merge; `performMerge` is the owner-controlled callback.
 */
async function completeAfterOwnerMerge(ctx) {
  const store = ctx.store;
  const taskId = ctx.result.taskId;
  const nowMs = ctx.clock ? ctx.clock() : Date.now();

  const fresh = mergeready.revalidate({
    attestation: ctx.result.attestation,
    // The subject is passed rather than closed over. observeFresh is built by
    // the composition root, where the result does not yet exist; asking it to
    // reach ctx.result would make the context depend on a field added to a COPY
    // of itself later, which is how it came to be undefined on the live path.
    observed: await ctx.observeFresh({ result: ctx.result }),
    nowMs,
  });
  if (!fresh.valid) {
    store.transition({
      taskId,
      to: 'BLOCKED',
      expectedPreviousState: 'MERGE_READY',
      writerIdentity: 'ORCHESTRATOR',
      payload: { blockerCode: 'ATTESTATION_INVALIDATED', reasons: fresh.reasons },
      nowMs,
    });
    return { disposition: 'BLOCKED', blockerCode: 'ATTESTATION_INVALIDATED', reasons: fresh.reasons };
  }

  const merge = await ctx.performMerge({ result: ctx.result });
  store.transition({
    taskId,
    to: 'MERGED',
    expectedPreviousState: 'MERGE_READY',
    taskAttemptId: ctx.result.taskAttemptId,
    leaseEpoch: ctx.result.leaseEpoch,
    holderToken: ctx.result.holderToken,
    writerIdentity: 'OWNER',
    payload: { mergeSha: merge.mergeSha, revalidatedAt: fresh.revalidatedAt },
    nowMs,
  });

  // Delivery is proved HERE, between MERGED and CLOSED, because CLOSED is
  // terminal in this store and there is no second write.
  //
  // Found by the WP04 dogfood run at the last gate it had left. The finalizer
  // verified delivery correctly, at the real merge SHA, and recorded PASS — onto
  // the QUEUE entry. The successor gate reads record.payload.delivery from THIS
  // store. So a task with genuine, merge-SHA-bound, passing evidence reported to
  // its successor as "no delivery evidence recorded" and stayed LEGACY_UNVERIFIED
  // forever. Both halves worked; the wire between them was never run, which is
  // the exact word this programme exists to stop being true of anything.
  //
  // Optional: a caller with no delivery contract passes nothing and the payload
  // is unchanged, so v1 tasks close exactly as they always did.
  let delivery = null;
  if (ctx.verifyDeliveryAtMerge) {
    delivery = await ctx.verifyDeliveryAtMerge(merge.mergeSha);
  }

  const cleanup = ctx.result.cleanupWorktree ? ctx.result.cleanupWorktree() : null;
  store.transition({
    taskId,
    to: 'CLOSED',
    expectedPreviousState: 'MERGED',
    taskAttemptId: ctx.result.taskAttemptId,
    leaseEpoch: ctx.result.leaseEpoch,
    holderToken: ctx.result.holderToken,
    writerIdentity: 'ORCHESTRATOR',
    payload: Object.assign(
      { mergeSha: merge.mergeSha, cleanup: cleanup ? cleanup.disposition : null },
      delivery ? { delivery } : {},
    ),
    nowMs,
  });
  if (ctx.result.release) ctx.result.release('CLOSED');

  return { disposition: 'CLOSED', mergeSha: merge.mergeSha, cleanup, revalidation: fresh };
}

/**
 * Successor eligibility (§4). Only a successor pinned in the grant becomes
 * eligible; work discovered by an executor is recorded and goes no further.
 */
function successorDisposition(opts) {
  const store = opts.store;
  const grant = opts.grant;
  const closedTaskId = opts.closedTaskId;
  const discovered = opts.discoveredFollowUps || [];

  const closed = store.current(closedTaskId);
  if (!closed || closed.state !== 'CLOSED') {
    return { eligible: [], discovered, reason: 'PREDECESSOR_NOT_CLOSED' };
  }

  const eligible = [];
  const refused = [];
  for (const pinned of grant.authorizedTasks || []) {
    if (pinned.taskId === closedTaskId) continue;
    const preds = pinned.predecessorTaskIds || [];
    if (preds.indexOf(closedTaskId) === -1) continue;
    // The same gate evaluateEligibility uses. This function used to carry its
    // own `every(r => r.state === 'CLOSED')`, which is how the two could come to
    // disagree about what "ready" means.
    const gate = successorMod.evaluate({
      predecessorTaskIds: preds,
      currentOf: (id) => store.current(id),
      // The grant records the schema it authorized. Absent, it is a v1 entry.
      successorSchema: pinned.taskSchemaVersion === 2 ? 2 : 1,
    });
    if (gate.eligible) eligible.push(pinned.taskId);
    else refused.push({ taskId: pinned.taskId, reasons: gate.reasons });
  }

  return {
    eligible,
    // Reported rather than dropped: "nothing became eligible" and "something
    // was held back, for these reasons" are different facts, and only one of
    // them tells an operator what to do next.
    refused,
    discovered: discovered.map((d) => ({ description: d, disposition: 'DISCOVERED_FOLLOW_UP' })),
    note: 'DISCOVERED_FOLLOW_UP never becomes ELIGIBLE (§4)',
  };
}

module.exports = {
  summarize,
  IMMUTABLE_FORBIDDEN,
  WORKTREE_DIR_TASK_CHARS,
  worktreeDirName,
  OrchestratorError,
  evaluateEligibility,
  runTask,
  completeAfterOwnerMerge,
  successorDisposition,
};
