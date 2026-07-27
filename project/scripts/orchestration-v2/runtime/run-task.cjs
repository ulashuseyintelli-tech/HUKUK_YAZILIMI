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
 *   - It never merges. performMerge throws by construction. Auto-merge is OFF
 *     in both V1 and V2 and merge is owner authority; an orchestrator that can
 *     merge is a different system from the one that was ratified.
 *   - It never authors authority. The plan and the grant are read from disk and
 *     validated against each other; if the grant's owner-ratification fields are
 *     unfilled, authority.validateAgainstGrant fails closed and the run stops.
 *   - It does not widen the boundary. IMMUTABLE_FORBIDDEN comes from the
 *     orchestrator module, not from configuration.
 *
 * usage:
 *   node run-task.cjs --plan <plan.v1.json> --grant <grant.json> --prompt <file>
 *                     [--lane CODEX_LOCAL] [--target-branch main] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const orchestrator = require('../orchestrator/orchestrator.cjs');
const stateMod = require('../orchestrator/state.cjs');
const { createGhPrProvider } = require('./gh-pr-provider.cjs');
const { createGhCiProvider } = require('./gh-ci-provider.cjs');
const { prepareEnvironment } = require('./prepare-environment.cjs');
const envPolicy = require('./env-policy.cjs');

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
 * Verified against the real CLIs on this machine rather than assumed: piping a
 * sentinel prompt into `claude -p` and into `codex exec -` returned the sentinel
 * and exit 0 for both.
 */
const LANE_ARGV = {
  CLAUDE_LOCAL: ['-p'],
  CODEX_LOCAL: ['exec', '-'],
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

  return {
    repoCwd,
    spec,
    grant,
    executorArgv,
    // createStore takes a directory, and defaultStateDir puts it under the git
    // common dir — outside the validated tree, so the orchestrator's own
    // bookkeeping can never be flagged as an untracked file by its own gate.
    store: opts.store || stateMod.createStore(stateMod.defaultStateDir(repoCwd)),
    holder: lane,
    baseRef: spec.baseSha || opts.targetBranch || 'main',
    worktreeRoot: opts.worktreeRoot || path.join(path.dirname(repoCwd), 'HUKUK_orch_runs'),

    prepareEnvironment:
      opts.prepareEnvironment ||
      ((a) => prepareEnvironment({ worktreePath: a.worktreePath })),

    prProvider:
      opts.prProvider ||
      createGhPrProvider({ repoCwd, targetBranch: opts.targetBranch || 'main' }),

    ciProvider:
      opts.ciProvider ||
      createGhCiProvider({
        repoCwd,
        targetBranch: opts.targetBranch || 'main',
        governanceRequired: GOVERNANCE_REQUIRED_CHECKS,
        taskSpecRequired: opts.taskSpecRequired || [],
      }),

    // Merge stays impossible from here. This is not a stub awaiting completion:
    // it is the enforcement point for "AUTO-MERGE: OFF · MANUAL OWNER MERGE
    // REQUIRED". completeAfterOwnerMerge() is the supported path, invoked
    // separately once a human has merged.
    performMerge: async () => {
      throw new RunnerError(
        'MERGE_NOT_PERMITTED',
        'auto-merge is OFF under GOV-COORD-V1 and V2; owner merges manually, then completeAfterOwnerMerge runs',
      );
    },

    prompt: opts.prompt,
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
}

async function main(argv) {
  const args = parseArgs(argv);
  const repoCwd = args.repoCwd || process.cwd();
  const spec = readJson(path.resolve(args.plan), 'plan');
  const grant = readJson(path.resolve(args.grant), 'grant');
  const prompt = args.prompt ? fs.readFileSync(path.resolve(args.prompt), 'utf8') : '';

  const ctx = buildContext({
    repoCwd,
    spec,
    grant,
    prompt,
    lane: args.lane,
    targetBranch: args.targetBranch,
    worktreeRoot: args.worktreeRoot,
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
      '  merge               : NOT PERMITTED from this runner',
      '',
    ].join('\n'),
  );

  if (args.dryRun) {
    // Validate authority and eligibility without creating a worktree, spawning
    // an executor or opening a PR. This is the safe preflight an operator runs
    // before committing a real attempt.
    const authority = require('../orchestrator/authority.cjs');
    const validated = authority.validateAgainstGrant({ grant, spec, nowMs: Date.now() });
    process.stdout.write(
      [
        'DRY RUN — authority validated, nothing executed',
        '  taskSpecSha256 : ' + validated.digests.taskSpecSha256,
        '  grantSha256    : ' + validated.grantSha256,
        '  allowedRoots   :',
        ...validated.spec.boundaryPolicy.allowedRoots.map((r) => '    ' + r),
        '',
      ].join('\n'),
    );
    return 0;
  }

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

module.exports = { buildContext, parseArgs, GOVERNANCE_REQUIRED_CHECKS, LANE_ARGV, RunnerError, main };
