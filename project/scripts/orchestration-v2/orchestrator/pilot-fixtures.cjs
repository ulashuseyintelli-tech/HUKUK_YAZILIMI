'use strict';
/**
 * Shared fixtures for the T4 orchestration tests and synthetic pilot.
 *
 * Everything here builds disposable state: a temp git repository, a task spec
 * with a grant that pins it by digest, and fake PR/CI providers. A synthetic
 * pilot must never touch a production root or open a real pull request
 * (contract §10), so no helper in this file reaches outside its temp directory.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const authority = require('./authority.cjs');

const NODE = process.execPath;
const FAKE = path.join(__dirname, '..', 'executors', 'fake-executor.cjs');

// Derived, not hard-coded, so the fixture cannot drift out of agreement with
// itself the way the previous 'b'.repeat(64) placeholder had.
const RATIFICATION_EXCERPT = 'fixture owner ratification';
const RATIFICATION_DIGEST = require('crypto')
  .createHash('sha256')
  .update(RATIFICATION_EXCERPT, 'utf8')
  .digest('hex');
const temps = [];

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

/** Disposable fixture repository. Two lane roots plus a deliberately shared one. */
function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'govv2-t4-'));
  temps.push(dir);
  git(['init', '--initial-branch=main', '-q'], dir);
  git(['config', 'user.email', 't@example.invalid'], dir);
  git(['config', 'user.name', 'T4 Fixture'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  for (const rel of ['fixture/lane-a', 'fixture/lane-b', 'fixture/shared']) {
    fs.mkdirSync(path.join(dir, rel), { recursive: true });
    fs.writeFileSync(path.join(dir, rel, 'seed.txt'), 'seed\n');
  }
  fs.mkdirSync(path.join(dir, 'project/docs/governance'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project/docs/governance/decision-log.md'), '# fixture\n');
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'fixture base'], dir);
  return dir;
}

function cleanupTemps() {
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 });
    } catch (e) {
      /* disposable fixture */
    }
  }
}

/** An AVAILABLE manifest carrying a real lane identity and a stand-in child. */
function fakeResolved(lane) {
  return {
    schemaVersion: 1,
    executorLane: lane,
    state: 'AVAILABLE',
    resolutionSource: 'EXPLICIT_CONFIGURED_PATH',
    resolvedAbsolutePath: NODE,
    version: 'stand-in ' + process.version,
    launchPrefixArgv: [],
    smokeExitCode: 0,
    smokeResult: 'PASS',
  };
}

/** Build a spec plus a grant that pins it by the four §2 digests. */
function specAndGrant(over) {
  const o = over || {};
  const spec = Object.assign(
    {
      schemaVersion: 1,
      taskId: o.taskId || 'PILOT-A',
      taskSpecVersion: 1,
      profile: 'BOUNDED_CODE_TASK',
      declaredIntent: o.declaredIntent || 'Write one fixture file inside the declared lane root.',
      boundaryPolicy: Object.assign({ allowedRoots: o.allowedRoots || ['fixture/lane-a/'] }, o.boundaryExtra || {}),
      requiredTests: o.requiredTests || [{ argv: [NODE, '-e', 'process.exit(0)'] }],
      predecessorTaskIds: o.predecessorTaskIds || [],
      baseDriftPolicy: o.baseDriftPolicy || 'REFRESH_BEFORE_EXECUTION',
      successorDisposition: o.successorDisposition || 'NO_SUCCESSOR',
    },
    o.specExtra || {},
  );
  const d = authority.specDigests(spec);
  const pin = (s) => {
    const dd = authority.specDigests(s);
    return {
      taskId: s.taskId,
      taskSpecVersion: s.taskSpecVersion,
      taskSpecSha256: dd.taskSpecSha256,
      declaredIntentSha256: dd.declaredIntentSha256,
      boundaryPolicySha256: dd.boundaryPolicySha256,
      requiredTestsSha256: dd.requiredTestsSha256,
      predecessorTaskIds: dd.canonical.predecessorTaskIds,
    };
  };
  const grant = Object.assign(
    {
      schemaVersion: 1,
      grantId: 'PILOT-GRANT-01',
      grantKind: 'TASK_SCOPED_ONE_SHOT',
      workstream: 'PILOT-WS',
      semanticAuthorityRef: {
        kind: 'SEMANTIC_AUTHORITY',
        recordId: 'PILOT-SEMANTIC-01',
        sourcePath: 'project/docs/governance/decision-log.md',
      },
      executionGrantRef: {
        kind: 'EXECUTION_GRANT',
        recordId: 'PILOT-EXEC-01',
        sourcePath: 'project/docs/governance/coordination-execution-grants/PILOT.md',
      },
      // The digest is the real SHA-256 of the excerpt above it, not a filler
      // string. validateAgainstGrant now checks that the pair agrees, because a
      // digest that does not match its excerpt proves nothing — either half
      // could be swapped without detection. The old 'b'.repeat(64) was exactly
      // the kind of plausible-looking placeholder the check exists to catch.
      ownerRatificationEvidence: {
        sourcePath: 'project/docs/governance/decision-log.md',
        sourceCommitSha: 'a'.repeat(40),
        exactExcerpt: RATIFICATION_EXCERPT,
        excerptSha256: RATIFICATION_DIGEST,
      },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revocationPath: 'project/docs/governance/coordination-execution-grants/PILOT.md',
      manualMergeRequired: true,
      allowedModuleRoots: o.grantRoots || ['fixture/'],
      authorizedTasks: [pin(spec)].concat((o.additionalTaskSpecs || []).map(pin)),
    },
    o.grantExtra || {},
  );
  return { spec, grant, digests: d, pin };
}

/** Fake PR/CI providers. A synthetic pilot never opens a real pull request. */
function providers(over) {
  const o = over || {};
  const opened = [];
  return {
    openedPrs: opened,
    prProvider: {
      open: async (args) => {
        if (o.prOpenThrows) throw new Error('pr provider failure');
        const pr = { number: o.prNumber || 4242, headSha: o.prHeadSha || 'c'.repeat(40) };
        opened.push({ pr, taskId: args.taskId });
        return pr;
      },
      state: async () => ({
        headSha: o.prHeadSha || 'c'.repeat(40),
        targetBranch: 'main',
        targetBranchSha: o.targetBranchSha || 'd'.repeat(40),
        mergeBaseSha: o.mergeBaseSha || 'e'.repeat(40),
        open: o.prOpen !== false,
        mergeable: o.prMergeable !== false,
        blockingReview: o.blockingReview === true,
        competingWriter: o.competingWriter === true,
        baseDriftSatisfied: o.baseDriftSatisfied !== false,
      }),
    },
    ciProvider: {
      requiredSources: async () => ({
        taskSpecRequired: o.taskSpecRequired || ['Test Suite'],
        platformRequired: o.platformRequired || ['Web Tests (vitest)'],
        governanceRequired: o.governanceRequired || [],
      }),
      observe: async () =>
        o.observedCi || [
          { name: 'Test Suite', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' },
        ],
    },
  };
}

/**
 * Stand-in worktree factory: hands back the fixture repo itself.
 *
 * The real worktree lifecycle has its own gate in T2; wiring a nested git
 * worktree here would test git rather than the orchestration chain.
 */
function inlineWorktree(repo) {
  return ({ pinnedBase }) => ({ path: repo, pinnedBaseSha: pinnedBase, branch: 'fixture' });
}

/**
 * Leave a change in the fixture worktree the way a real executor leaves one.
 *
 * This used to commit, and could not produce a diff that way: the orchestrator
 * pins the base at worktree time, which is AFTER this runs, so base == HEAD and
 * `extractChanges(base, head=null)` saw nothing. Every pilot test that believed
 * it was validating a real diff was validating an empty one — which is how a
 * missing "the executor produced nothing" gate went unnoticed until a live run
 * pushed an empty branch.
 *
 * Committing was unfaithful on its own terms too: the executor is forbidden to
 * commit, so in the real flow the change sits staged-but-uncommitted in the
 * worktree. Staged rather than untracked, because an untracked file is itself a
 * boundary violation (UNTRACKED_FILE_PRESENT).
 */
function seedChange(repo, rel, content) {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content || 'changed\n');
  git(['add', '-A'], repo);
  return git(['rev-parse', 'HEAD'], repo);
}

module.exports = {
  NODE,
  FAKE,
  temps,
  git,
  fixtureRepo,
  cleanupTemps,
  fakeResolved,
  specAndGrant,
  providers,
  inlineWorktree,
  seedChange,
};
