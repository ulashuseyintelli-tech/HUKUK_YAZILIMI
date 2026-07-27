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
    taskId: o.taskId || 'PROBE-OFFICE-PATH-01',
    boundaryPolicy: {
      allowedRoots: o.allowedRoots || [g.allowedPathRoots[0] + '__tests__/'],
      maxChangedFiles: 2,
    },
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
    taskId: o.taskId || 'PROBE-GOV-01',
    boundaryPolicy: {
      allowedRoots: o.allowedRoots || ['project/docs/governance/coordination-requests/PROBE-REQ-1/request.md'],
      maxChangedFiles: 1,
    },
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
  prependPath,
};
