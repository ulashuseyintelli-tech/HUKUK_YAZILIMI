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

  for (const pred of validated.predecessorTaskIds || []) {
    const rec = store.current(pred);
    if (!rec) {
      reasons.push('PREDECESSOR_NOT_DECLARED:' + pred);
      continue;
    }
    if (rec.state !== 'CLOSED') reasons.push('PREDECESSOR_NOT_CLOSED:' + pred + '=' + rec.state);
  }

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
      nowMs: nowMs(),
    });
  } catch (e) {
    return blocked(e.code || 'AUTHORITY_INVALID', e.detail || e.message);
  }
  // BLOCKED -> AUTHORIZED is not a legal edge, so a resume goes straight to
  // ELIGIBLE. The authority check above still ran unconditionally, so the grant
  // and hashes are re-validated on every attempt including this one — what is
  // skipped is the state-log entry, not the verification.
  if (!resumingFromBlocked) {
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
  store.transition({
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

  advance('CLAIMED', 'ELIGIBLE', { leaseId: claim.record.leaseId, epoch });
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
          path: path.join(ctx.worktreeRoot, taskId + '-' + attemptId.slice(0, 8)),
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
    return blocked('EXECUTOR_NONZERO_EXIT', 'exit=' + String(run.exitCode), { run: summarize(run) });
  }

  // --- actual diff boundary validation (§1, §8) ---------------------------
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

  // --- required tests -----------------------------------------------------
  const testResults = [];
  for (const t of validated.spec.requiredTests) {
    const r = ctx.testRunner
      ? ctx.testRunner(t, wt.path)
      : resolveMod.runCapture(t.argv[0], t.argv.slice(1), {
          cwd: t.cwd ? path.join(wt.path, t.cwd) : wt.path,
          timeoutMs: t.timeoutMs || 300000,
        });
    testResults.push({ argv: t.argv, status: r.status });
    if (r.status !== 0) {
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
  const ci = mergeready.evaluateCi({
    sources: await ctx.ciProvider.requiredSources({ taskId, pr }),
    observed: await ctx.ciProvider.observe({ taskId, pr }),
  });
  if (!ci.pass) {
    cleanupWorktree();
    release('TERMINAL_BLOCKED_PUBLISHED');
    return blocked('REQUIRED_CI_FAILED', ci.missing.concat(ci.notSuccess).join('; '), { ci });
  }

  // --- MERGE_READY attestation (§5) --------------------------------------
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
    conjunction: {
      executorExitSuccess: run.executorExitSuccess === true,
      currentLeaseEpochConfirmed: safeAssert(assertHeld),
      holderTokenConfirmed: safeAssert(assertHeld),
      taskSpecHashMatchesGrant: true,
      actualDiffWithinBoundary: verdict.withinBoundary === true,
      immutableForbiddenPathsUntouched: verdict.forbiddenPathsUntouched === true,
      requiredInvariantsPass: true,
      requiredTestsPass: testResults.every((t) => t.status === 0),
      requiredCiChecksPass: ci.pass === true,
      prOpen: prState.open === true,
      prMergeable: prState.mergeable === true,
      noBlockingReview: prState.blockingReview !== true,
      noCompetingWriter: prState.competingWriter !== true,
      baseDriftPolicySatisfied: prState.baseDriftSatisfied !== false,
      worktreeStateValid: true,
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

function summarize(run) {
  return {
    exitCode: run.exitCode,
    durationMs: run.durationMs,
    termination: run.termination.reason,
    orphanProcessDetected: run.termination.orphanProcessDetected,
    stdoutTruncated: run.stdoutTruncated,
    executorExitSuccess: run.executorExitSuccess,
  };
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
    observed: await ctx.observeFresh(),
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

  const cleanup = ctx.result.cleanupWorktree ? ctx.result.cleanupWorktree() : null;
  store.transition({
    taskId,
    to: 'CLOSED',
    expectedPreviousState: 'MERGED',
    taskAttemptId: ctx.result.taskAttemptId,
    leaseEpoch: ctx.result.leaseEpoch,
    holderToken: ctx.result.holderToken,
    writerIdentity: 'ORCHESTRATOR',
    payload: { mergeSha: merge.mergeSha, cleanup: cleanup ? cleanup.disposition : null },
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
  for (const pinned of grant.authorizedTasks || []) {
    if (pinned.taskId === closedTaskId) continue;
    const preds = pinned.predecessorTaskIds || [];
    if (preds.indexOf(closedTaskId) === -1) continue;
    const allClosed = preds.every((p) => {
      const r = store.current(p);
      return r && r.state === 'CLOSED';
    });
    if (allClosed) eligible.push(pinned.taskId);
  }

  return {
    eligible,
    discovered: discovered.map((d) => ({ description: d, disposition: 'DISCOVERED_FOLLOW_UP' })),
    note: 'DISCOVERED_FOLLOW_UP never becomes ELIGIBLE (§4)',
  };
}

module.exports = {
  IMMUTABLE_FORBIDDEN,
  OrchestratorError,
  evaluateEligibility,
  runTask,
  completeAfterOwnerMerge,
  successorDisposition,
};
