'use strict';
/**
 * GOV-COORD-V2 runtime — composition root.
 *
 * runTask() has always contained the whole orchestration, but it takes its
 * collaborators by injection: prProvider, ciProvider and performMerge are
 * called with no fallback, and nothing in the repository supplied them. The
 * engine was complete and had no ignition. This is the ignition.
 *
 * What it does NOT do, deliberately:
 *
 *   - It does not merge by default. performMerge throws unless a standing grant
 *     is supplied AND --auto-merge is passed. Absent both, merge remains owner
 *     authority exercised by hand, which is what V1 and the V2 pilot ratified.
 *     Supplying them is not a switch that turns the gates off: gh-merge-provider
 *     re-reads every gate at merge time and refuses on any of a dozen grounds.
 *   - It never authors authority. The plan and the grant are read from disk and
 *     validated against each other; if the grant's owner-ratification fields are
 *     unfilled, authority.validateAgainstGrant fails closed and the run stops.
 *   - It does not widen the boundary. IMMUTABLE_FORBIDDEN comes from the
 *     orchestrator module, not from configuration.
 *
 * usage:
 *   node run-task.cjs --plan <plan.v1.json> --grant <grant.json> --prompt <file>
 *                     [--lane CODEX_LOCAL] [--target-branch main] [--dry-run]
 *                     [--worktree-root <dir>] [--resume-blocked]
 *                     [--standing-grant <grant.json> --auto-merge]
 *
 * NOT the production entry point. Running a task for real goes through:
 *   pnpm orch:service enqueue --request <request.json>
 *   pnpm orch:service run-until-idle
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const orchestrator = require('../orchestrator/orchestrator.cjs');
const stateMod = require('../orchestrator/state.cjs');
const mergeready = require('../orchestrator/mergeready.cjs');
const { specDigests: authoritySpecDigests } = require('../orchestrator/authority.cjs');
const { createGhPrProvider } = require('./gh-pr-provider.cjs');
const { createGhCiProvider } = require('./gh-ci-provider.cjs');
const { createGhMergeProvider } = require('./gh-merge-provider.cjs');
const { prepareEnvironment } = require('./prepare-environment.cjs');
const envPolicy = require('./env-policy.cjs');
const promptIdentity = require('./prompt-identity.cjs');

/**
 * Resolve the grant's authority references and owner ratification against the
 * repository, not merely against the grant's own shape.
 *
 * authority.cjs has carried both halves since PR #1644/#1645 and neither was
 * ever called outside its tests: the live path (orch:run -> runTask ->
 * validateAgainstGrant) checks that the two refs exist and are distinct, and
 * that ownerRatificationEvidence is well formed and not a placeholder — but it
 * never opens the files they name. A grant citing a recordId that appears
 * nowhere passed every live gate. That is not hypothetical: a plan in this
 * repository cited a fabricated semanticAuthorityRef and only human review
 * caught it, which is precisely what #1645 was written to prevent.
 *
 * Both records are read at the CURRENT target tip, not at the ratification
 * commit: an authority that has since been removed is not in force, and this is
 * the last moment before an executor is spawned.
 *
 * @param {object} opts
 * @param {string} opts.repoCwd
 * @param {object} opts.grant
 * @param {string} opts.baseRef  remote ref the task targets, e.g. origin/main
 * @returns {{atCommit: string}}  throws AuthorityError on any failure
 */
function verifyAuthorityAgainstRepo(opts) {
  const authority = require('../orchestrator/authority.cjs');
  const cwd = opts.repoCwd;
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

  const atCommit = git(['rev-parse', opts.baseRef]);

  const readAtCommit = (sourcePath, sha) => git(['show', sha + ':' + sourcePath]);
  const isAncestor = (sha) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', sha, atCommit], { cwd, stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  };

  authority.verifyRatificationEvidence({ grant: opts.grant, readAtCommit, isAncestor });
  authority.verifyAuthorityRefs({ grant: opts.grant, readAtCommit, atCommit });

  // Read the revocation marker at the CURRENT tip. Nothing did this before, so
  // `revocationPath` — a required grant field — was decorative: creating the
  // file it names had no effect, because validateAgainstGrant honours only a
  // `revoked` boolean and nothing on the live path ever computed one. A
  // revocation written AFTER the grant was issued is the whole point, which is
  // why it is read at the tip rather than at the grant's own commit.
  const revocation = authority.isGrantRevoked({ grant: opts.grant, readAtCommit, atCommit });
  return { atCommit, revocation };
}

/**
 * Governance-mandated checks. These are required regardless of what branch
 * protection currently says, because protection is editable and this list is
 * the governance floor. Kept short on purpose: every entry here must be a check
 * that genuinely gates correctness, not merely one that usually runs.
 */
const GOVERNANCE_REQUIRED_CHECKS = ['Test Suite', 'Architectural Guardrails'];

/**
 * Headless invocation per lane, WITHOUT the prompt.
 *
 * spawn.cjs does not append the prompt to argv — SINGLE_ARGUMENT means "the
 * caller already put it there", and only STDIN_PAYLOAD actually writes it. We
 * use stdin because a task prompt is long, multi-line, and has no business in a
 * process listing, so each lane's argv must be the form that reads stdin.
 *
 * Each lane must also be able to WRITE. That is a separate property from being
 * able to answer, and the earlier version of this table confused the two: it
 * was "verified" by piping a sentinel prompt into `claude -p` and `codex exec -`
 * and getting the sentinel back with exit 0. That proves the pipe works. It
 * proves nothing about file permissions.
 *
 * Measured on a real run: `codex exec -` with no sandbox flag thought for 260
 * seconds, exited 0, reported success — and changed zero files, because `codex
 * exec` defaults to the read-only sandbox. The orchestrator then pushed an empty
 * branch and failed at PR creation. `claude -p` has the same shape: without
 * --permission-mode it has no standing permission to edit.
 *
 * So the flags below are load-bearing, not decoration:
 *
 *   codex   --sandbox workspace-write   writes inside its own worktree only
 *   claude  --permission-mode acceptEdits   auto-accepts edits, nothing more
 *
 * Neither is the "bypass everything" setting (`danger-full-access`,
 * `bypassPermissions`). The executor is meant to edit files in an isolated
 * worktree and nothing else; what it actually touched is then judged by the
 * boundary validator against the real diff, which is where the guarantee lives.
 */
const LANE_ARGV = {
  CLAUDE_LOCAL: ['-p', '--permission-mode', 'acceptEdits'],
  CODEX_LOCAL: ['exec', '--sandbox', 'workspace-write', '-'],
};

class RunnerError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.code = code;
    this.detail = detail || null;
  }
}

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => {
      const v = argv[++i];
      if (v === undefined) throw new RunnerError('ARG_MISSING_VALUE', a);
      return v;
    };
    if (a === '--plan') out.plan = take();
    else if (a === '--grant') out.grant = take();
    else if (a === '--prompt') out.prompt = take();
    else if (a === '--lane') out.lane = take();
    else if (a === '--target-branch') out.targetBranch = take();
    else if (a === '--repo') out.repoCwd = take();
    else if (a === '--worktree-root') out.worktreeRoot = take();
    else if (a === '--dry-run') out.dryRun = true;
    // A task that reached BLOCKED does not retry on its own; state.cjs allows
    // BLOCKED -> ELIGIBLE only "by owner action", and this flag IS that action.
    else if (a === '--resume-blocked') out.resumeFromBlocked = true;
    // Both halves of the merge key. Neither works alone; see buildMergeStep.
    else if (a === '--standing-grant') out.standingGrantPath = take();
    else if (a === '--auto-merge') out.autoMerge = true;
    // Development only. The canonical path is enqueue + run-until-idle; see
    // the refusal in main() for why the direct path is not the default.
    else if (a === '--dev-direct') out.devDirect = true;
    else throw new RunnerError('ARG_UNKNOWN', a);
  }
  if (!out.plan) throw new RunnerError('ARG_REQUIRED', '--plan');
  if (!out.grant) throw new RunnerError('ARG_REQUIRED', '--grant');
  return out;
}

function readJson(p, label) {
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch (e) {
    throw new RunnerError('FILE_UNREADABLE', label + ' ' + p);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new RunnerError('JSON_INVALID', label + ' ' + p + ' :: ' + e.message);
  }
}

/**
 * The merge step, or the refusal that stands in its place.
 *
 * Two keys, both required. A standing grant alone does not make a run a merging
 * run — a grant is a durable file, and a file on disk quietly changing the
 * behaviour of every later invocation is how a bounded authority becomes a
 * general one. The flag alone does not either, because a flag cannot grant what
 * no owner wrote down.
 *
 * When both are present the refusal does not disappear; it moves into
 * gh-merge-provider, which re-reads the grant, the PR, the review state and the
 * live required checks at merge time and refuses on any of a dozen grounds.
 *
 * @returns {function} the performMerge callback runTask will invoke
 */
function buildMergeStep(opts, repoCwd, ciProvider) {
  const grant = opts.standingGrant || null;
  if (!opts.autoMerge || !grant) {
    return async () => {
      throw new RunnerError(
        'MERGE_NOT_PERMITTED',
        !grant
          ? 'no standing grant supplied; owner merges manually, then completeAfterOwnerMerge runs'
          : '--auto-merge was not passed; a grant on disk does not by itself authorize this run to merge',
      );
    };
  }
  const provider = createGhMergeProvider({
    repoCwd,
    standingGrant: grant,
    ciProvider,
    expectedHeadBranch: opts.expectedHeadBranch || null,
    isRevoked: opts.isRevoked,
    isKillSwitchEngaged: opts.isKillSwitchEngaged,
  });
  return (a) => provider.performMerge(a);
}

/**
 * Build the ctx runTask expects. Exported so tests can assemble the same
 * context with fakes rather than re-deriving it and drifting from the real one.
 */
function buildContext(opts) {
  const repoCwd = opts.repoCwd;
  const spec = opts.spec;
  const grant = opts.grant;

  const credentialAllowlist = envPolicy.resolveCredentialAllowlist(opts.extraCredentials);
  const lane = opts.lane || 'CODEX_LOCAL';
  const executorArgv = opts.executorArgv || LANE_ARGV[lane];
  // runTask passes this straight to spawn.cjs, which fails ARGV_REQUIRED on an
  // empty or absent vector — after the lease is taken and the worktree built.
  // Catch an unknown lane here instead, where the message is useful.
  if (!Array.isArray(executorArgv) || executorArgv.length === 0) {
    throw new RunnerError('EXECUTOR_ARGV_UNKNOWN_LANE', lane);
  }

  // Hoisted out of the object literal because the merge step reads the same
  // required-check set the CI gate does. Two independently built providers could
  // disagree about what is required, and the merge side disagreeing downward is
  // the dangerous direction.
  const ciProvider =
    opts.ciProvider ||
    createGhCiProvider({
      repoCwd,
      targetBranch: opts.targetBranch || 'main',
      governanceRequired: GOVERNANCE_REQUIRED_CHECKS,
      taskSpecRequired: opts.taskSpecRequired || [],
    });

  // Named rather than returned as a literal: observeFresh below reaches back
  // into the providers this same object carries, so the merge gate and the CI
  // gate cannot end up observing through two differently-configured clients.
  const ctx = {
    repoCwd,
    spec,
    grant,
    // Carried through so the AUTHORIZED stage can tell a PROGRAM_STANDING grant
    // what task class and lane it is being asked to admit — the same two facts
    // validateAgainstStandingGrant already checks at admission, now checked
    // again where the grant is actually consumed. Absent for a task-scoped
    // grant's own callers (validateAgainstGrant does not read them on that
    // path), so nothing here changes for them.
    taskClass: opts.taskClass,
    executorArgv,
    // createStore takes a directory, and defaultStateDir puts it under the git
    // common dir — outside the validated tree, so the orchestrator's own
    // bookkeeping can never be flagged as an untracked file by its own gate.
    store: opts.store || stateMod.createStore(stateMod.defaultStateDir(repoCwd)),
    holder: lane,
    // The ref the §13 drift gate compares the pinned base against — and nothing
    // else. Under STRICT_PINNED_BASE the orchestrator takes the worktree base
    // from spec.baseSha directly (orchestrator.cjs:265), so baseRef's only job
    // is to answer "has the target branch moved past what this plan was pinned
    // to?".
    //
    // This used to be `spec.baseSha || ...`, which made the gate compare the
    // pinned base against itself: rev-parse of a commit id returns that id, the
    // inequality never held, and BLOCKED_BASE_SHA_DRIFT could not fire. A plan
    // pinned to a commit main had long moved past would execute anyway and
    // attest that §13 was satisfied.
    //
    // A remote ref, not a local branch name: a local `main` can lag origin or
    // sit detached, which would compare against a stale tip.
    baseRef: opts.baseRef || 'origin/' + (opts.targetBranch || 'main'),
    worktreeRoot: opts.worktreeRoot || path.join(path.dirname(repoCwd), 'HUKUK_orch_runs'),
    resumeFromBlocked: opts.resumeFromBlocked === true,

    prepareEnvironment:
      opts.prepareEnvironment ||
      ((a) => prepareEnvironment({ worktreePath: a.worktreePath })),

    prProvider:
      opts.prProvider ||
      createGhPrProvider({ repoCwd, targetBranch: opts.targetBranch || 'main' }),

    ciProvider,

    // Merge is refused unless BOTH halves are present: a standing grant that
    // authorizes it, and an explicit --auto-merge on this run. Either alone
    // still throws.
    //
    // The two-key shape is the point. A grant sitting on disk must not make
    // every subsequent run a merging run, and a flag must not manufacture
    // authority the grant never gave. The default — no grant, no flag — is the
    // V1/V2 behaviour unchanged: manual owner merge, then
    // completeAfterOwnerMerge().
    performMerge: opts.performMerge || buildMergeStep(opts, repoCwd, ciProvider),

    /**
     * Freshly observed reality, for the revalidation that gates the merge.
     *
     * completeAfterOwnerMerge has called ctx.observeFresh() since it was
     * written, and NOTHING outside pilot.test.cjs ever supplied it. The tests
     * injected a fake and passed; the live composition root did not define the
     * field at all, so `typeof ctx.observeFresh` was `undefined` on every real
     * run. #1694 then wired the adapter to call completeAfterOwnerMerge — and
     * the first thing that function does is call this. The auto-merge path
     * therefore threw TypeError on its first step, was caught by the adapter's
     * MERGE_THREW handler, and parked the entry at BLOCKED.
     *
     * That is the same class of defect as every other one this program is
     * about: a function with a caller in tests and none in production, green
     * the whole time. It is fixed here rather than in the adapter because the
     * composition root is where a context's fields belong — an adapter that
     * patched in a missing collaborator would leave the next caller of
     * buildContext with the same hole.
     *
     * Takes its subject as an argument rather than closing over ctx.result:
     * the result does not exist when the context is built, and the caller
     * already has it.
     */
    observeFresh:
      opts.observeFresh ||
      (async (a) => {
        const result = (a && a.result) || {};
        const pr = result.pr || {};
        if (!pr.number) throw new RunnerError('OBSERVE_FRESH_PR_UNKNOWN', 'the result carries no pr.number');

        const st = await ctx.prProvider.state({ pr });
        const sources = await ctx.ciProvider.requiredSources();
        const ci = mergeready.evaluateCi({
          sources,
          observed: await ctx.ciProvider.observe({ pr }),
        });

        return {
          prHeadSha: st.headSha,
          targetBranchObservedSha: st.targetBranchSha,
          mergeBaseSha: st.mergeBaseSha,
          prOpen: st.open,
          prMergeable: st.mergeable,
          blockingReview: st.blockingReview === true,
          competingWriter: st.competingWriter === true,
          requiredCiResultSetSha256: ci.resultSetSha256,
          // Re-read now, not carried from the attestation: a grant pulled while
          // CI was running must stop the merge it was pulled to stop.
          grantRevoked: opts.isRevoked ? opts.isRevoked() === true : false,
          grantExpired:
            grant && grant.expiresAt ? Date.parse(grant.expiresAt) <= Date.now() : false,
          // Recomputed from the spec rather than echoed from the attestation.
          // Echoing it would compare a value with itself and always agree,
          // which is worse than not checking it — it would look checked.
          //
          // specDigests, NOT digest(spec). They are different numbers: one
          // normalizes the spec first and the other hashes it as written, and
          // the attestation, the grant and validateAgainstGrant all pin the
          // normalized one. Using the other here compared a plan against itself
          // measured two ways, so every attestation failed revalidation with
          // TASK_SPEC_HASH_DRIFT — including one whose PR was already open with
          // nine green checks.
          taskSpecSha256: (() => {
            // specDigests VALIDATES, and a caller driving this with something
            // that is not a full plan has no attestation hash either — so
            // there is nothing to compare and the field is left absent.
            //
            // Absent, NOT computed the other way. Falling back to digest(spec)
            // would put the second notion straight back and the drift with it;
            // mergeready skips an undefined field, which is the honest reading
            // of "this cannot be checked here".
            if (!spec) return undefined;
            try {
              return authoritySpecDigests(spec).taskSpecSha256;
            } catch (e) {
              return undefined;
            }
          })(),
          // leaseEpoch and holderToken are deliberately absent. On this path the
          // lease is held by THIS process, so re-reading it here would compare
          // the holder against itself. The durable finalizer, which runs in a
          // process that may not hold it, reads the lease for real.
        };
      }),

    // The prompt the executor actually receives, not the file as written.
    //
    // A prompt file is a shared artefact that outlives the revision it was
    // written for. The canary's still opened with "GOREV: ...-R01" three
    // revisions later, and the executor — reading the plan as R03 and the prose
    // as R01 — refused the work rather than guess which one had authority. It
    // was right to refuse. The identity is therefore composed here, from the
    // records that ARE authoritative, and a body that declares an identity of
    // its own is refused instead of silently overridden.
    prompt:
      opts.prompt == null
        ? opts.prompt
        : promptIdentity.composePrompt({
            body: opts.prompt,
            taskId: spec.taskId,
            programId: spec.programId,
            attempt: opts.attempt,
            lane,
            taskSpecSha256: (() => {
              try {
                return authoritySpecDigests(spec).taskSpecSha256;
              } catch (e) {
                return undefined;
              }
            })(),
            targetPaths: (spec.boundaryPolicy && spec.boundaryPolicy.allowedRoots) || [],
          }),
    // 'STDIN_PAYLOAD', not 'STDIN'. spawn.cjs accepts exactly two values and
    // fails PROMPT_TRANSPORT_INVALID on anything else, so the earlier spelling
    // would have killed every run at the executor spawn — after the lease was
    // taken and the worktree built. Stdin rather than an argument because a task
    // prompt is long, multi-line, and must not appear in a process listing.
    promptTransport: opts.promptTransport || 'STDIN_PAYLOAD',
    parentEnv: opts.parentEnv || process.env,
    credentialAllowlist,
    attestationTtlMs: opts.attestationTtlMs || 30 * 60 * 1000,
    leaseTtlMs: opts.leaseTtlMs || 60 * 60 * 1000,
  };

  return ctx;
}

async function main(argv) {
  const args = parseArgs(argv);
  const repoCwd = args.repoCwd || process.cwd();

  // The direct executor path stops here unless it is explicitly opted into.
  //
  // This used to run. That made `orch:run` a second production path that
  // reached an executor without passing admission, without entering the queue
  // and without dispatch-time revalidation — every gate the service layer adds,
  // bypassable by typing a different command. Two paths to the same executor
  // means the weaker one is the real policy.
  //
  // The canonical path is enqueue + run. `--dev-direct` keeps the old behaviour
  // available for development and debugging, loudly and by name, so nobody
  // reaches it by accident or by habit.
  if (!args.devDirect) {
    process.stderr.write(
      [
        'ORCH_RUN_DIRECT_PATH_NOT_PERMITTED',
        '',
        'Bu yol admission, kuyruk ve dispatch revalidation adimlarini atlar.',
        'Canonical yol:',
        '',
        '  pnpm orch:service enqueue --request <request.json>',
        '  pnpm orch:service run-until-idle',
        '',
        'Sadece gelistirme/hata ayiklama icin dogrudan calistirmak gerekiyorsa',
        '--dev-direct bayragini acikca ekleyin; bu production yolu DEGILDIR.',
        '',
      ].join('\n'),
    );
    return 2;
  }

  const spec = readJson(path.resolve(args.plan), 'plan');
  const grant = readJson(path.resolve(args.grant), 'grant');
  const prompt = args.prompt ? fs.readFileSync(path.resolve(args.prompt), 'utf8') : '';
  const standingGrant = args.standingGrantPath
    ? readJson(path.resolve(args.standingGrantPath), 'standing grant')
    : null;

  const ctx = buildContext({
    repoCwd,
    spec,
    grant,
    prompt,
    lane: args.lane,
    targetBranch: args.targetBranch,
    worktreeRoot: args.worktreeRoot,
    resumeFromBlocked: args.resumeFromBlocked,
    standingGrant,
    autoMerge: args.autoMerge === true,
    // Both markers are read from the working tree at the moment of the merge,
    // not captured now. A kill switch that only takes effect on the next run is
    // not a kill switch.
    isRevoked: standingGrant && standingGrant.revocationPath
      ? () => fs.existsSync(path.join(repoCwd, standingGrant.revocationPath))
      : undefined,
    isKillSwitchEngaged: standingGrant && standingGrant.killSwitchPath
      ? () => fs.existsSync(path.join(repoCwd, standingGrant.killSwitchPath))
      : undefined,
  });

  const withheld = envPolicy.withheldFromParent(ctx.parentEnv);

  process.stdout.write(
    [
      'GOV-COORD-V2 run',
      '  taskId              : ' + spec.taskId,
      '  profile             : ' + spec.profile,
      '  baseDriftPolicy     : ' + spec.baseDriftPolicy + ' @ ' + (spec.baseSha || '(unpinned)'),
      '  grantId             : ' + grant.grantId,
      '  executor lane       : ' + ctx.holder,
      '  credentialAllowlist : ' + ctx.credentialAllowlist.join(', '),
      '  withheld (present)  : ' + (withheld.length ? withheld.join(', ') : '(none)'),
      '  merge               : ' +
        (args.autoMerge && standingGrant
          ? 'BOUNDED AUTO-MERGE under ' + standingGrant.standingGrantId
          : 'NOT PERMITTED from this runner'),
      ...(ctx.resumeFromBlocked ? ['  resume              : OWNER-AUTHORIZED resume of a BLOCKED task'] : []),
      '',
    ].join('\n'),
  );

  // Before anything else: do the grant's authority references and owner
  // ratification actually resolve in the repository? runTask's own
  // validateAgainstGrant only checks their shape, so this is the only place a
  // fabricated recordId or a ratification that never landed in main is caught.
  // It runs for the dry run too — a preflight that skips it would report a
  // clean bill of health the real run does not have.
  const authorityAt = verifyAuthorityAgainstRepo({
    repoCwd,
    grant,
    baseRef: ctx.baseRef,
  });

  // The revocation verdict reaches runTask, which passes it to
  // validateAgainstGrant as `revoked`. Without this the grant's own escape
  // hatch did nothing.
  ctx.grantRevoked = authorityAt.revocation.revoked;

  if (args.dryRun) {
    // Validate authority and eligibility without creating a worktree, spawning
    // an executor or opening a PR. This is the safe preflight an operator runs
    // before committing a real attempt.
    const authority = require('../orchestrator/authority.cjs');
    const validated = authority.validateAgainstGrant({
      grant,
      spec,
      revoked: ctx.grantRevoked,
      nowMs: Date.now(),
    });
    process.stdout.write(
      [
        'DRY RUN — authority validated, nothing executed',
        '  taskSpecSha256 : ' + validated.digests.taskSpecSha256,
        '  grantSha256    : ' + validated.grantSha256,
        '  authority refs : resolved at ' + authorityAt.atCommit,
        '  revocation     : ' + (authorityAt.revocation.revoked ? 'REVOKED — ' + authorityAt.revocation.reason : 'none at ' + authorityAt.revocation.path),
        '  allowedRoots   :',
        ...validated.spec.boundaryPolicy.allowedRoots.map((r) => '    ' + r),
        '',
      ].join('\n'),
    );
    return 0;
  }

  process.stderr.write(
    'UYARI: --dev-direct — admission/queue/dispatch atlaniyor. Production yolu degildir.\n',
  );
  const result = await orchestrator.runTask(ctx);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.disposition === 'BLOCKED' ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write((err.code ? err.code + ': ' : '') + (err.detail || err.message) + '\n');
      process.exit(2);
    },
  );
}

module.exports = {
  buildContext,
  parseArgs,
  verifyAuthorityAgainstRepo,
  GOVERNANCE_REQUIRED_CHECKS,
  LANE_ARGV,
  RunnerError,
  main,
};
