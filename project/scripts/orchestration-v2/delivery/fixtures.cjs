'use strict';
/**
 * Disposable worlds for probes to run against.
 *
 * A delivery probe must call the real entrypoint. It must NOT call it against
 * the real repository: opening a pull request or moving the real queue every
 * time someone asks "is this working?" would make the verifier the most
 * dangerous command in the system. So the entrypoint is real and the world it
 * runs in is built here, thrown away afterwards, and never reaches the network.
 *
 * The substitutes are all at the PROCESS boundary, which is the line the owner
 * decision draws and the reason these fixtures are not simply mocks:
 *
 *   a temp git repository        real git, real refs, real commits
 *   a temp queue directory       real queue files, written by the real queue
 *   a fake executable on PATH    resolved by the real resolver
 *   an origin/main ref set by    real rev-parse, no remote, no fetch
 *   update-ref
 *
 * Nothing in this file injects a function into the code under test. If a probe
 * would need that to pass, the capability is not deliverable and the honest
 * observation is UNWIRED.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const exec = require('./exec.cjs');

/** Repository root, derived from this file rather than assumed. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ACT = 'project/docs/governance/coordination-v2/activation';
const MANIFEST_REL = 'project/docs/governance/coordination-v2/programs.manifest.json';

const OFFICE_GRANT = ACT + '/STANDING-GRANT-OFFICE-LIVE-R01.json';
const GOV_GRANT = ACT + '/STANDING-GRANT-MECHANICAL-GOVERNANCE-R01.json';

/** Every temp directory this process created, for deterministic cleanup. */
const created = [];

class FixtureError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'FixtureError';
    this.code = code;
    this.detail = detail || null;
  }
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: exec.buildEnv({}),
    windowsHide: true,
  }).trim();
}

function tmpdir(tag) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-delivery-' + (tag || 'fx') + '-'));
  created.push(d);
  return d;
}

/**
 * Delete every fixture this process made.
 *
 * Recursive deletion is forbidden on worktrees by repository policy for good
 * reasons, and none of them apply here: these are mkdtemp directories under the
 * OS temp root, created by this process, containing no junction to anywhere.
 * assertContained is still called on every write path so a bug cannot turn this
 * into a recursive delete of something else.
 *
 * A directory that will not delete is reported, not thrown: a leaked temp dir is
 * an untidiness, and failing the verification over it would report the wrong
 * thing entirely.
 */
function cleanup() {
  const residual = [];
  for (const d of created.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 });
    } catch (e) {
      residual.push({ path: d, error: String((e && e.code) || e) });
    }
  }
  return residual;
}

function write(root, rel, content) {
  const abs = exec.assertContained(path.join(root, rel), root);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * A git repository with one commit, a main branch, and — the part that matters —
 * a real `origin/main` remote-tracking ref.
 *
 * run-task resolves its base from `origin/<target>`, deliberately, because a
 * local `main` can lag or sit detached. A fixture without that ref fails at
 * rev-parse and would look like an authority failure. update-ref rather than a
 * clone: it produces the same ref with no second repository and no fetch.
 */
function bareGitRepo(tag) {
  const dir = tmpdir(tag || 'repo');
  git(['init', '--initial-branch=main', '-q'], dir);
  git(['config', 'user.email', 'probe@example.invalid'], dir);
  git(['config', 'user.name', 'delivery-probe'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  return dir;
}

function commitAll(dir, message) {
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', message], dir);
  const sha = git(['rev-parse', 'HEAD'], dir);
  git(['update-ref', 'refs/remotes/origin/main', sha], dir);
  return sha;
}

/**
 * The world PROBE_RUNNER_AUTHORITY_DRY runs in.
 *
 * Three artefacts have to exist in the repository, at the right commit, with
 * the right content, or the runner's authority verification refuses — which is
 * precisely what makes this a real test of that verification:
 *
 *   1. a semantic authority record whose text contains the cited recordId
 *   2. an execution grant record carrying the V1 GOV-COORD-AUTHORITY marker
 *   3. an owner ratification excerpt, present at the commit the grant names and
 *      reachable from origin/main
 *
 * `over` bends exactly one of them at a time, which is how the negative probes
 * are built: same fixture, one fact broken, and the expected failure code names
 * the check that caught it.
 *
 * @returns {{root, planPath, grantPath, baseSha, spec, grant}}
 */
function authorityWorld(over) {
  const o = over || {};
  const root = bareGitRepo('auth');

  const semanticId = 'PROBE-SEMANTIC-AUTHORITY-01';
  const execId = 'PROBE-EXECUTION-GRANT-01';
  const citedSemanticId = o.fabricateSemanticRecordId ? 'PROBE-SEMANTIC-AUTHORITY-DOES-NOT-EXIST' : semanticId;

  const excerpt = 'probe owner ratification excerpt — disposable fixture';

  // The semantic record. Prose that mentions the id is enough for a semantic
  // reference; the stricter marker rule applies only to execution grants.
  write(
    root,
    'project/docs/governance/decision-log.md',
    ['# fixture decision log', '', 'Record ' + semanticId + ' — owner semantic authority for the probe.', '', excerpt, ''].join('\n'),
  );

  // The execution grant record. The marker line is what verifyAuthorityRefs
  // demands: a recordId appearing in prose is not a grant.
  const markerLine = o.omitExecutionMarker
    ? 'Execution grant ' + execId + ' (marker deliberately absent for the negative probe)'
    : '<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=' + execId + ' -->';
  write(
    root,
    'project/docs/governance/coordination-execution-grants/PROBE.md',
    ['# fixture execution grant', '', markerLine, '', 'Execution grant ' + execId + '.', ''].join('\n'),
  );

  fs.mkdirSync(path.join(root, 'fixture/lane-a'), { recursive: true });
  write(root, 'fixture/lane-a/seed.txt', 'seed\n');

  const baseSha = commitAll(root, 'fixture base');

  // Written after the base commit so the revocation is NOT part of it — a
  // revocation that only counts when it predates the grant is not a revocation.
  if (o.revoke) {
    write(root, 'project/docs/governance/coordination-execution-grants/PROBE-REVOKED.md', 'revoked by the probe fixture\n');
    commitAll(root, 'revoke the grant');
  }

  const authority = require('../orchestrator/authority.cjs');
  const spec = {
    schemaVersion: 1,
    taskId: 'PROBE-DELIVERY-DRY-01',
    taskSpecVersion: 1,
    profile: 'BOUNDED_CODE_TASK',
    declaredIntent: 'Disposable probe plan; the dry run never executes it.',
    boundaryPolicy: { allowedRoots: ['fixture/lane-a/'] },
    requiredTests: [{ argv: [process.execPath, '-e', 'process.exit(0)'] }],
    predecessorTaskIds: [],
    baseDriftPolicy: 'REFRESH_BEFORE_EXECUTION',
    successorDisposition: 'NO_SUCCESSOR',
  };
  const d = authority.specDigests(spec);

  const grant = {
    schemaVersion: 1,
    grantId: 'PROBE-GRANT-01',
    grantKind: 'TASK_SCOPED_ONE_SHOT',
    workstream: 'DELIVERY-PROBE',
    semanticAuthorityRef: {
      kind: 'SEMANTIC_AUTHORITY',
      recordId: citedSemanticId,
      sourcePath: 'project/docs/governance/decision-log.md',
    },
    executionGrantRef: {
      kind: 'EXECUTION_GRANT',
      recordId: execId,
      sourcePath: 'project/docs/governance/coordination-execution-grants/PROBE.md',
    },
    ownerRatificationEvidence: {
      sourcePath: 'project/docs/governance/decision-log.md',
      sourceCommitSha: baseSha,
      exactExcerpt: excerpt,
      excerptSha256: sha256(excerpt),
    },
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    revocationPath: 'project/docs/governance/coordination-execution-grants/PROBE-REVOKED.md',
    manualMergeRequired: true,
    allowedModuleRoots: ['fixture/'],
    authorizedTasks: [
      {
        taskId: spec.taskId,
        taskSpecVersion: spec.taskSpecVersion,
        taskSpecSha256: d.taskSpecSha256,
        declaredIntentSha256: d.declaredIntentSha256,
        boundaryPolicySha256: d.boundaryPolicySha256,
        requiredTestsSha256: d.requiredTestsSha256,
        predecessorTaskIds: [],
      },
    ],
  };

  // The plan and the grant live OUTSIDE the fixture repository's tracked tree
  // on purpose: run-task reads them from disk by path, and putting them in the
  // worktree would make the fixture's own inputs part of the diff it validates.
  const inputs = tmpdir('auth-inputs');
  const planPath = path.join(inputs, 'plan.json');
  const grantPath = path.join(inputs, 'grant.json');
  fs.writeFileSync(planPath, JSON.stringify(spec, null, 2), 'utf8');
  fs.writeFileSync(grantPath, JSON.stringify(grant, null, 2), 'utf8');

  return { root, planPath, grantPath, baseSha, spec, grant };
}

/**
 * The world the SERVICE probes run in.
 *
 * Copies the REAL programs manifest and the REAL standing grants, because a
 * probe against invented authority proves the probe works, not the system. The
 * only synthetic parts are the plan and the request, which is the same split
 * the bound-path acceptance tests make.
 */
function serviceWorld(over) {
  const o = over || {};
  const root = bareGitRepo('svc');

  const copy = (rel) => {
    const src = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(src)) throw new FixtureError('FIXTURE_SOURCE_MISSING', rel);
    const dst = exec.assertContained(path.join(root, rel), root);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  };
  fs.mkdirSync(path.join(root, ACT), { recursive: true });
  copy(MANIFEST_REL);
  copy(OFFICE_GRANT);
  copy(GOV_GRANT);

  if (o.manifest) {
    write(root, MANIFEST_REL, JSON.stringify(o.manifest, null, 2));
  }

  const baseSha = commitAll(root, 'service fixture base');
  return { root, baseSha, queueDir: path.join(root, '.probe-queue') };
}

function readRepoGrant(rel) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
}

/** Write a plan into a service world and return its repo-relative path. */
function writePlan(root, spec) {
  const rel = 'probe-plans/' + spec.taskId + '.json';
  write(root, rel, JSON.stringify(spec, null, 2));
  return rel;
}

/** Write a request into a service world and return its repo-relative path. */
function writeRequest(root, req) {
  const rel = 'probe-requests/' + req.taskId + '.json';
  write(root, rel, JSON.stringify(Object.assign({ schemaVersion: 1 }, req), null, 2));
  return rel;
}

/**
 * A valid OFFICE request, built from the real OFFICE standing grant so its
 * boundary genuinely sits inside the granted roots.
 */
function officeRequest(root, over) {
  const o = over || {};
  const g = readRepoGrant(OFFICE_GRANT);
  const spec = {
    schemaVersion: 1,
    taskId: o.taskId || 'PROBE-OFFICE-PATH-01',
    taskSpecVersion: 1,
    profile: 'BOUNDED_CODE_TASK',
    declaredIntent: 'delivery probe fixture: a bounded, test-only change inside the granted roots',
    boundaryPolicy: {
      allowedRoots: o.allowedRoots || [g.allowedPathRoots[0] + '__tests__/'],
      maxChangedFiles: 2,
    },
    requiredTests: [{ argv: ['pnpm', 'exec', 'jest', '--version'], cwd: 'project', timeoutMs: 60000 }],
    predecessorTaskIds: [],
    baseDriftPolicy: 'REFRESH_BEFORE_EXECUTION',
    successorDisposition: 'OWNER_AUTHORIZATION_REQUIRED',
  };
  const planPath = writePlan(root, spec);
  return {
    spec,
    requestPath: writeRequest(root, {
      programId: o.programId || 'OFFICE',
      taskId: spec.taskId,
      taskClass: o.taskClass || 'TEST_ONLY_CHARACTERIZATION',
      planPath,
      standingGrantPath: OFFICE_GRANT,
      executorLane: o.executorLane || 'CLAUDE_LOCAL',
    }),
  };
}

/** A governance request under the MECHANICAL_GOVERNANCE grant. */
function governanceRequest(root, over) {
  const o = over || {};
  const spec = {
    schemaVersion: 1,
    taskId: o.taskId || 'PROBE-GOV-01',
    taskSpecVersion: 1,
    profile: 'MECHANICAL_GOVERNANCE',
    declaredIntent: 'delivery probe fixture: an exact mechanical governance write',
    boundaryPolicy: {
      allowedRoots: o.allowedRoots || ['project/docs/governance/coordination-requests/PROBE-REQ-1/request.md'],
      maxChangedFiles: 1,
    },
    mechanicalOperation: {
      operationType: 'EXACT_APPEND_AT_DECLARED_ANCHOR',
      expectedResultSha256: 'a'.repeat(64),
    },
    predecessorTaskIds: [],
    baseDriftPolicy: 'REFRESH_BEFORE_EXECUTION',
    successorDisposition: 'OWNER_AUTHORIZATION_REQUIRED',
  };
  const planPath = writePlan(root, spec);
  return {
    spec,
    requestPath: writeRequest(root, {
      programId: o.programId || 'OFFICE',
      taskId: spec.taskId,
      taskClass: o.taskClass || 'CLOSURE_EVIDENCE',
      planPath,
      standingGrantPath: o.standingGrantPath || GOV_GRANT,
    }),
  };
}

/**
 * A directory containing a fake executor, for prepending to PATH.
 *
 * The real resolver scans PATH for the lane's command name and refuses anything
 * it cannot spawn directly. On POSIX that is a shebang script; on Windows a
 * directly-spawnable image means a .cmd. Both write a file and exit 0, which is
 * enough for the resolver's smoke check and enough to prove the chain reached an
 * executor — which is the claim, and the whole claim.
 *
 * @param {string} name  lane command, e.g. 'claude'
 */
function fakeExecutorDir(name) {
  const dir = tmpdir('bin');
  const marker = path.join(dir, 'invoked.txt');
  if (os.platform() === 'win32') {
    fs.writeFileSync(
      path.join(dir, name + '.cmd'),
      ['@echo off', 'echo GOV_COORD_V2_SMOKE_OK', 'echo invoked>>"' + marker + '"', 'exit /b 0', ''].join('\r\n'),
      'utf8',
    );
  } else {
    const p = path.join(dir, name);
    fs.writeFileSync(
      p,
      ['#!/bin/sh', 'echo GOV_COORD_V2_SMOKE_OK', 'echo invoked >> "' + marker + '"', 'exit 0', ''].join('\n'),
      'utf8',
    );
    fs.chmodSync(p, 0o755);
  }
  return { dir, marker };
}

/** PATH with `dir` in front, in the platform's own separator. */
function prependPath(dir) {
  const sep = os.platform() === 'win32' ? ';' : ':';
  const current = process.env.PATH || process.env.Path || '';
  return dir + sep + current;
}

/**
 * PATH with `dir` in front and every directory containing a real `name`
 * removed.
 *
 * Prepending is not enough, and the reason is worth stating because it cost an
 * hour: spawn-mode.cjs prefers a DIRECTLY SPAWNABLE image found anywhere on
 * PATH over a shim found first. On Windows a fake can only be a `.cmd`, so the
 * real `gh.exe` — however far down PATH it sits — wins, and the probe silently
 * talks to GitHub instead of to its fixture. It failed loudly here only because
 * the real gh demanded authentication; with a logged-in shell it would have
 * reached the network from a probe whose whole contract is that it does not.
 *
 * So the sealed world does not contain the real binary at all. That is also the
 * more honest fixture: "no gh is reachable except this one" is exactly the
 * property a sealed probe should be able to state.
 */
function pathWithout(dir, name) {
  const sep = os.platform() === 'win32' ? ';' : ':';
  const current = (process.env.PATH || process.env.Path || '').split(sep).filter(Boolean);

  // POSIX: prepending is enough and removing anything is actively harmful.
  //
  // spawn-mode only consults scanPath on win32; everywhere else it returns
  // shell:false immediately and Node resolves PATH in order, so the first match
  // wins and the fake is found. Dropping directories here would be blunt in a
  // way that CI proved: on the GitHub runner `gh` lives in /usr/bin, and
  // removing that directory to hide one binary removed `git` with it — every
  // sealed probe then failed with `spawnSync git ENOENT`, which reads like a
  // delivery failure and is a fixture bug.
  if (os.platform() !== 'win32') return [dir].concat(current).join(sep);

  // Windows: prepending genuinely is not enough. spawn-mode prefers a directly
  // spawnable image found ANYWHERE on PATH over a shim found first, and a fake
  // can only be a .cmd — so the real gh.exe wins however early the fake sits.
  // Only directories holding a directly spawnable `name` are dropped, and only
  // those: a .cmd of the same name is a shim and loses to our own anyway.
  const kept = current.filter((entry) => {
    return !['.exe', '.com'].some((e) => {
      try {
        return fs.existsSync(path.join(entry, name + e));
      } catch (err) {
        return false;
      }
    });
  });
  return [dir].concat(kept).join(sep);
}

/**
 * A `gh` that answers from a file instead of from GitHub.
 *
 * The owner decision allows a fake executable at the process boundary, and this
 * is the case it exists for: the finalizer's whole subject is a real merge, and
 * a merge cannot be proved by a probe that never performs one. So the merge IS
 * real — `git merge --squash` against a local bare remote, producing a genuine
 * commit and a genuine SHA — and only GitHub's answers about pull-request state
 * are substituted.
 *
 * What this deliberately does NOT substitute: the merge provider, the CI gate,
 * the attestation revalidation, the queue transitions, the finalizer, or the
 * service CLI. All of those are the shipped code, running for real. A probe that
 * faked any of them would be proving its own fixture.
 *
 * State lives in `state.json` so it survives between the several `gh`
 * invocations one finalize makes — `pr view` before the merge, `pr merge`, then
 * `pr view` again to read the resulting SHA, which is exactly the sequence the
 * provider's idempotency depends on.
 *
 * @param {object} o
 * @param {string} o.repoDir     working repository the merge lands in
 * @param {number} o.prNumber
 * @param {string} o.headBranch  branch the provider is allowed to merge
 * @param {string[]} [o.requiredChecks]
 * @param {boolean} [o.alreadyMerged]  start in the merged state (idempotency case B)
 * @param {string} [o.mergeStateStatus]
 */
function fakeGhDir(o) {
  const dir = tmpdir('gh');
  const statePath = path.join(dir, 'state.json');
  const checks = o.requiredChecks || ['Test Suite'];

  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        prNumber: o.prNumber,
        headBranch: o.headBranch,
        headSha: o.headSha || null,
        baseBranch: o.baseBranch || 'main',
        state: o.alreadyMerged ? 'MERGED' : 'OPEN',
        mergeable: o.mergeable || 'MERGEABLE',
        mergeStateStatus: o.mergeStateStatus || 'CLEAN',
        reviewDecision: o.reviewDecision || 'APPROVED',
        mergeCommitOid: o.mergeCommitOid || null,
        requiredChecks: checks,
        repoDir: o.repoDir,
        calls: [],
      },
      null,
      2,
    ),
    'utf8',
  );

  // A Node script rather than a shell script: the same file drives both
  // platforms, and the merge it performs is real git either way.
  const js = path.join(dir, 'gh-impl.cjs');
  fs.writeFileSync(js, FAKE_GH_SOURCE, 'utf8');

  if (os.platform() === 'win32') {
    fs.writeFileSync(
      path.join(dir, 'gh.cmd'),
      ['@echo off', '"' + process.execPath + '" "' + js + '" %*', 'exit /b %errorlevel%', ''].join('\r\n'),
      'utf8',
    );
  } else {
    const p = path.join(dir, 'gh');
    fs.writeFileSync(
      p,
      ['#!/bin/sh', 'exec "' + process.execPath + '" "' + js + '" "$@"', ''].join('\n'),
      'utf8',
    );
    fs.chmodSync(p, 0o755);
  }
  return {
    dir,
    statePath,
    read: () => JSON.parse(fs.readFileSync(statePath, 'utf8')),
  };
}

/**
 * The fake gh, as source. Kept as a string so the fixture writes ONE file and
 * there is no question of it accidentally being resolved as a module of this
 * package.
 *
 * It implements exactly the three calls the shipped providers make:
 *
 *   gh pr view <n> --json ...      state, mergeability, head, merge commit
 *   gh pr merge <n> --squash ...   a real squash merge into the base branch
 *   gh api .../required_status_checks --jq ...   the platform-required set
 *   gh pr view <n> --json statusCheckRollup      the observed conclusions
 *
 * Anything else exits non-zero, so a provider that starts making a call this
 * does not model fails loudly rather than silently reading an empty answer.
 */
const FAKE_GH_SOURCE = `'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const statePath = path.join(__dirname, 'state.json');
const S = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const argv = process.argv.slice(2);
const save = () => fs.writeFileSync(statePath, JSON.stringify(S, null, 2), 'utf8');
const git = (a) => execFileSync('git', a, { cwd: S.repoDir, encoding: 'utf8' }).trim();
S.calls.push(argv.join(' '));

function out(s) { process.stdout.write(s + '\\n'); save(); process.exit(0); }
function die(s) { process.stderr.write(s + '\\n'); save(); process.exit(1); }

const headSha = () => { try { return git(['rev-parse', S.headBranch]); } catch (e) { return S.headSha || null; } };

if (argv[0] === 'pr' && argv[1] === 'view') {
  const wants = argv[argv.indexOf('--json') + 1] || '';
  if (wants.indexOf('statusCheckRollup') !== -1) {
    out(JSON.stringify({
      statusCheckRollup: S.requiredChecks.map((n) => ({ name: n, status: 'COMPLETED', conclusion: 'SUCCESS' })),
    }));
  }
  out(JSON.stringify({
    state: S.state,
    mergeable: S.mergeable,
    mergeStateStatus: S.mergeStateStatus,
    reviewDecision: S.reviewDecision,
    headRefName: S.headBranch,
    headRefOid: headSha(),
    baseRefName: S.baseBranch,
    mergeCommit: S.mergeCommitOid ? { oid: S.mergeCommitOid } : null,
  }));
}

if (argv[0] === 'pr' && argv[1] === 'merge') {
  if (S.state === 'MERGED') die('already merged');
  // A real squash merge. The SHA the finalizer records is a commit that exists.
  const before = git(['rev-parse', 'HEAD']);
  git(['checkout', '-q', S.baseBranch]);
  git(['merge', '--squash', S.headBranch]);
  git(['-c', 'user.email=probe@example.invalid', '-c', 'user.name=fake-gh',
       'commit', '-q', '-m', 'squash merge of ' + S.headBranch]);
  S.mergeCommitOid = git(['rev-parse', 'HEAD']);
  S.state = 'MERGED';
  S.beforeSha = before;
  out('merged ' + S.mergeCommitOid);
}

if (argv[0] === 'api') {
  // The platform-required check set.
  out(JSON.stringify(S.requiredChecks));
}

die('fake gh: unmodelled call: ' + argv.join(' '));
`;

/**
 * A world in which a real merge can happen.
 *
 * Everything the finalizer touches is genuine: a bare remote, a working clone,
 * a feature branch carrying an actual diff, a real queue with a real durable
 * handoff, and the real standing grant. The only substitution is `gh`, and even
 * that performs a real `git merge --squash` — so the merge SHA the finalizer
 * records is a commit that exists and can be checked out.
 *
 * This is what makes capability D provable without a network: the claim is
 * "a stranded MERGE_READY entry can be carried to CLOSED by a public command",
 * and every link in that chain here is the shipped code.
 *
 * @param {object} [over]
 * @param {boolean} [over.autoMerge]        request asks for auto-merge (default true)
 * @param {boolean} [over.omitHandoff]      leave the entry with no durable handoff
 * @param {object}  [over.corruptHandoff]   replace the handoff with this
 * @param {boolean} [over.alreadyMerged]    the PR is already merged (idempotency B)
 * @param {boolean} [over.expireAttestation]  attestation is already expired
 * @param {boolean} [over.revokeGrant]      write the grant's revocation marker
 */
function mergeWorld(over) {
  const o = over || {};
  const authority = require('../orchestrator/authority.cjs');
  const mergeready = require('../orchestrator/mergeready.cjs');
  const queueMod = require('../orchestrator/queue.cjs');

  // ── the remote ──────────────────────────────────────────────────────────
  const remote = tmpdir('remote');
  git(['init', '--bare', '--initial-branch=main', '-q'], remote);
  // gh-pr-provider fetches the PR head by SHA, which a bare repo refuses unless
  // it is told to serve arbitrary objects.
  git(['config', 'uploadpack.allowAnySHA1InWant', 'true'], remote);
  git(['config', 'uploadpack.allowReachableSHA1InWant', 'true'], remote);

  // ── the working repository ──────────────────────────────────────────────
  const root = bareGitRepo('merge');
  git(['remote', 'add', 'origin', remote], root);

  const copy = (rel) => {
    const src = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(src)) throw new FixtureError('FIXTURE_SOURCE_MISSING', rel);
    const dst = exec.assertContained(path.join(root, rel), root);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  };
  fs.mkdirSync(path.join(root, ACT), { recursive: true });
  copy(MANIFEST_REL);
  copy(OFFICE_GRANT);
  copy(GOV_GRANT);

  const g = readRepoGrant(OFFICE_GRANT);
  const taskId = o.taskId || 'PROBE-FINALIZE-01';
  // A COMPLETE plan. Resolution normalizes the spec now — one notion of a
  // plan's identity, shared with the attestation and the merge gate — so a
  // fixture carrying only the two fields the old raw digest happened to read
  // is refused at enqueue, correctly.
  const spec = {
    schemaVersion: 1,
    taskId,
    taskSpecVersion: 1,
    profile: 'BOUNDED_CODE_TASK',
    declaredIntent: 'delivery probe fixture: a bounded, test-only change inside the granted roots',
    boundaryPolicy: { allowedRoots: [g.allowedPathRoots[0] + '__tests__/'], maxChangedFiles: 2 },
    requiredTests: [{ argv: ['pnpm', 'exec', 'jest', '--version'], cwd: 'project', timeoutMs: 60000 }],
    predecessorTaskIds: [],
    baseDriftPolicy: 'REFRESH_BEFORE_EXECUTION',
    successorDisposition: 'OWNER_AUTHORIZATION_REQUIRED',
  };
  const planPath = writePlan(root, spec);
  const requestPath = writeRequest(root, {
    programId: 'OFFICE',
    taskId,
    taskClass: 'TEST_ONLY_CHARACTERIZATION',
    planPath,
    standingGrantPath: OFFICE_GRANT,
    executorLane: 'CLAUDE_LOCAL',
    autoMerge: o.autoMerge !== false,
  });

  git(['add', '-A'], root);
  git(['commit', '-q', '-m', 'merge world base'], root);
  git(['push', '-q', 'origin', 'main'], root);
  const baseSha = git(['rev-parse', 'HEAD'], root);
  git(['update-ref', 'refs/remotes/origin/main', baseSha], root);

  // ── the feature branch, with an actual change ───────────────────────────
  const headBranch = 'probe/finalize-' + taskId.toLowerCase();
  git(['checkout', '-q', '-b', headBranch], root);
  write(root, g.allowedPathRoots[0] + '__tests__/probe-delivery.spec.ts', '// probe fixture change\n');
  git(['add', '-A'], root);
  git(['commit', '-q', '-m', 'probe: bounded fixture change'], root);
  git(['push', '-q', 'origin', headBranch], root);
  const headSha = git(['rev-parse', 'HEAD'], root);
  git(['checkout', '-q', 'main'], root);

  const prNumber = 4242;
  const gh = fakeGhDir({
    repoDir: root,
    prNumber,
    headBranch,
    headSha,
    baseBranch: 'main',
    alreadyMerged: o.alreadyMerged === true,
    mergeCommitOid: o.alreadyMerged ? headSha : null,
    requiredChecks: ['Test Suite', 'Architectural Guardrails'],
  });

  if (o.revokeGrant) {
    write(root, g.revocationPath, 'revoked by the probe fixture\n');
  }

  // ── the queue entry, walked to MERGE_READY with a durable handoff ───────
  const queueDir = path.join(root, '.probe-queue');
  const queue = queueMod.createQueue(queueDir);
  const entry = queue.enqueue({
    programId: 'OFFICE',
    taskId,
    taskClass: 'TEST_ONLY_CHARACTERIZATION',
    parentAuthorizationId: (g.parentAuthorizationRef && g.parentAuthorizationRef.authorizationId) || '',
    taskSpecSha256: authority.specDigests(spec).taskSpecSha256,
    standingGrantId: g.standingGrantId,
    priority: 100,
    dependsOn: [],
    requestPath,
    executorLane: 'CLAUDE_LOCAL',
  });

  // The required-CI digest is computed by the SAME function the finalizer's
  // fresh observation will use, over the SAME set the fake gh reports. Anything
  // else would make the attestation disagree with reality for a reason that has
  // nothing to do with the property under test.
  const required = ['Test Suite', 'Architectural Guardrails'];
  const ciEval = mergeready.evaluateCi({
    sources: { platformRequired: required, governanceRequired: [], taskSpecRequired: [] },
    observed: required.map((n) => ({ name: n, status: 'COMPLETED', conclusion: 'SUCCESS' })),
  });
  const mergeBase = git(['merge-base', headSha, baseSha], root);
  const nowMs = Date.now();
  const built = mergeready.buildAttestation({
    taskId,
    taskAttemptId: 'a'.repeat(32),
    taskSpecSha256: authority.specDigests(spec).taskSpecSha256,
    grantId: g.standingGrantId,
    grantSha256: authority.digest(g),
    leaseEpoch: 1,
    holderToken: 'b'.repeat(32),
    prNumber,
    prHeadSha: headSha,
    targetBranch: 'main',
    targetBranchObservedSha: baseSha,
    mergeBaseSha: mergeBase,
    requiredCiResultSetSha256: ciEval.resultSetSha256,
    nowMs: o.expireAttestation ? nowMs - 7200000 : nowMs,
    ttlMs: 30 * 60 * 1000,
    conjunction: require('../orchestrator/mergeready.cjs').CONJUNCTION_KEYS.reduce((acc, k) => {
      acc[k] = true;
      return acc;
    }, {}),
  });
  if (!built.ok) throw new FixtureError('FIXTURE_ATTESTATION_INVALID', built.failedConditions.join(','));

  const handoff = o.corruptHandoff !== undefined
    ? o.corruptHandoff
    : {
        schemaVersion: 1,
        entryId: entry.entryId,
        taskId,
        taskAttemptId: 'a'.repeat(32),
        taskSpecSha256: authority.specDigests(spec).taskSpecSha256,
        grantId: g.standingGrantId,
        grantSha256: authority.digest(g),
        standingGrantId: g.standingGrantId,
        requestPath,
        prNumber,
        prHeadSha: headSha,
        branch: headBranch,
        worktreePath: null,
        targetBranch: 'main',
        targetBranchObservedSha: baseSha,
        mergeBaseSha: mergeBase,
        requiredCiResultSetSha256: ciEval.resultSetSha256,
        leaseEpoch: 1,
        holderToken: 'b'.repeat(32),
        executorLane: 'CLAUDE_LOCAL',
        attestation: built.attestation,
        createdAt: built.attestation.createdAt,
        expiresAt: built.attestation.expiresAt,
      };

  const route = ['PLANNING', 'REVIEWING', 'AUTHORIZED', 'PREFLIGHT', 'EXECUTING', 'VALIDATING', 'PR_OPEN', 'CI_WAITING', 'MERGE_READY'];
  for (const to of route) {
    queue.transition({
      entryId: entry.entryId,
      to,
      expectedPreviousState: queue.get(entry.entryId).state,
      nowMs,
      patch:
        to === 'PR_OPEN'
          ? { prNumber, prHeadSha: headSha, branch: headBranch }
          : to === 'MERGE_READY'
            ? (o.omitHandoff ? { attestationAt: built.attestation.createdAt } : { attestationAt: built.attestation.createdAt, handoff })
            : {},
    });
  }

  // ── the orchestrator's OWN task store ───────────────────────────────────
  //
  // Two durable stores hold the same task: the queue (service-level) and the
  // task store (orchestrator-level). A real run writes both, and a crash after
  // MERGE_READY leaves both at MERGE_READY. Seeding only the queue would build
  // a world no crash can produce — and the finalizer would fail on a CAS
  // mismatch for a reason the probe invented.
  //
  // So the fixture walks the task store through the same lifecycle a real run
  // does, with the same lease identity the handoff carries.
  const stateMod = require('../orchestrator/state.cjs');
  if (o.omitTaskStore !== true) {
    const store = stateMod.createStore(stateMod.defaultStateDir(root));
    const lease = { leaseEpoch: 1, holderToken: 'b'.repeat(32) };
    const chain = [
      ['DECLARED', 'TASK_AUTHOR'],
      ['AUTHORIZED', 'OWNER'],
      ['ELIGIBLE', 'ORCHESTRATOR'],
      ['CLAIMED', 'ORCHESTRATOR'],
      ['WORKTREE_READY', 'ORCHESTRATOR'],
      ['EXECUTOR_RUNNING', 'ORCHESTRATOR'],
      ['VALIDATING', 'ORCHESTRATOR'],
      ['PR_OPEN', 'ORCHESTRATOR'],
      ['CI_PENDING', 'ORCHESTRATOR'],
      ['MERGE_READY', 'ORCHESTRATOR'],
    ];
    let from = null;
    for (const [to, writer] of chain) {
      store.transition(Object.assign(
        {
          taskId,
          to,
          expectedPreviousState: from,
          writerIdentity: writer,
          taskAttemptId: 'a'.repeat(32),
          nowMs,
          payload: to === 'MERGE_READY' ? { attestation: built.attestation } : {},
        },
        stateMod.requiresLease(to) ? lease : {},
      ));
      from = to;
    }
  }

  return { root, remote, queueDir, entryId: entry.entryId, taskId, prNumber, headBranch, headSha, baseSha, gh, requestPath };
}

module.exports = {
  REPO_ROOT,
  ACT,
  MANIFEST_REL,
  OFFICE_GRANT,
  GOV_GRANT,
  FixtureError,
  created,
  git,
  tmpdir,
  cleanup,
  write,
  sha256,
  bareGitRepo,
  commitAll,
  authorityWorld,
  serviceWorld,
  readRepoGrant,
  writePlan,
  writeRequest,
  officeRequest,
  governanceRequest,
  fakeExecutorDir,
  fakeGhDir,
  pathWithout,
  mergeWorld,
  prependPath,
};
