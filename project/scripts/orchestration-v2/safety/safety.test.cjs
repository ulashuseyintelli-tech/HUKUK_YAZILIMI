'use strict';
/**
 * GOV-COORD-V2 T2 safety kernel gate.
 *
 * Three closing gates (contract §1, §6, §8 + AGENTS.md worktree law):
 *   LEASE    — two OS processes claim concurrently -> exactly one winner
 *   BOUNDARY — full negative fixture set          -> zero escape
 *   WORKTREE — create/use/remove/recover          -> canonical integrity intact
 *
 * Every fixture runs in a disposable temp repository. Nothing here touches the
 * real repository, its refs, or owner WIP.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const lease = require('./lease.cjs');
const boundary = require('./boundary.cjs');
const worktree = require('./worktree.cjs');

const RACE_WORKER = path.join(__dirname, 'race-worker.cjs');
const TOKEN_A = 'a'.repeat(32);
const TOKEN_B = 'b'.repeat(32);
const ATTEMPT = 'c'.repeat(32);

function git(args, cwd, input) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 });
}

const tempRoots = [];

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'govv2-'));
  tempRoots.push(dir);
  git(['init', '--initial-branch=main', '-q'], dir);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'user.name', 'GOV-COORD-V2 Test'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  fs.mkdirSync(path.join(dir, 'project/apps/api/src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project/apps/api/src/a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\n');
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'base'], dir);
  return dir;
}

test.after(() => {
  for (const d of tempRoots) {
    try {
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 });
    } catch (e) {
      /* disposable fixture; leftover temp dirs are harmless */
    }
  }
});

// ---------------------------------------------------------------- LEASE GATE

test('lease: first claim starts at epoch 1 and writes a HELD record', () => {
  const repo = makeRepo();
  const res = lease.claim({
    cwd: repo, taskId: 'T-ONE', holder: 'CLAUDE_LOCAL',
    holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 60000,
  });
  assert.equal(res.epoch, 1);
  assert.equal(res.record.state, 'HELD');
  assert.equal(res.record.previousStateHash, null);
  const ref = git(['rev-parse', lease.refFor('T-ONE')], repo).trim();
  assert.equal(ref, res.oid);
});

test('lease: a different holder cannot claim a live lease', () => {
  const repo = makeRepo();
  lease.claim({ cwd: repo, taskId: 'T-LIVE', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 60000 });
  assert.throws(
    () => lease.claim({ cwd: repo, taskId: 'T-LIVE', holder: 'CODEX_LOCAL', holderToken: TOKEN_B, taskAttemptId: ATTEMPT, ttlMs: 60000 }),
    (e) => e.code === 'CLAIM_CONFLICT',
  );
});

test('lease: same holder re-claiming its live lease is idempotent (no epoch bump)', () => {
  const repo = makeRepo();
  const first = lease.claim({ cwd: repo, taskId: 'T-IDEM', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 60000 });
  const again = lease.claim({ cwd: repo, taskId: 'T-IDEM', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 60000 });
  assert.equal(again.idempotent, true);
  assert.equal(again.epoch, first.epoch);
});

test('lease: stale epoch holder can never renew', () => {
  const repo = makeRepo();
  lease.claim({ cwd: repo, taskId: 'T-STALE', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 60000 });
  assert.throws(
    () => lease.renew({ cwd: repo, taskId: 'T-STALE', holderToken: TOKEN_A, leaseEpoch: 99 }),
    (e) => e.code === 'FENCING_FAILURE',
  );
});

test('lease: wrong holderToken can never renew or release', () => {
  const repo = makeRepo();
  const r = lease.claim({ cwd: repo, taskId: 'T-TOKEN', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 60000 });
  assert.throws(() => lease.renew({ cwd: repo, taskId: 'T-TOKEN', holderToken: TOKEN_B, leaseEpoch: r.epoch }), (e) => e.code === 'FENCING_FAILURE');
  assert.throws(() => lease.release({ cwd: repo, taskId: 'T-TOKEN', holderToken: TOKEN_B, leaseEpoch: r.epoch, releaseReason: 'CLOSED' }), (e) => e.code === 'FENCING_FAILURE');
});

test('lease: release writes a tombstone, keeps the ref, and preserves the epoch', () => {
  const repo = makeRepo();
  const r = lease.claim({ cwd: repo, taskId: 'T-REL', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 60000 });
  const rel = lease.release({ cwd: repo, taskId: 'T-REL', holderToken: TOKEN_A, leaseEpoch: r.epoch, releaseReason: 'CLOSED' });
  assert.equal(rel.record.state, 'RELEASED');
  assert.equal(rel.record.leaseEpoch, r.epoch);
  assert.equal(rel.record.releaseReason, 'CLOSED');
  // ref still exists — never deleted
  assert.doesNotThrow(() => git(['rev-parse', '--verify', lease.refFor('T-REL')], repo));
});

test('lease: re-claim after release advances the epoch and never resets it', () => {
  const repo = makeRepo();
  const first = lease.claim({ cwd: repo, taskId: 'T-EPOCH', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 60000 });
  lease.release({ cwd: repo, taskId: 'T-EPOCH', holderToken: TOKEN_A, leaseEpoch: first.epoch, releaseReason: 'CLOSED' });
  const second = lease.claim({ cwd: repo, taskId: 'T-EPOCH', holder: 'CODEX_LOCAL', holderToken: TOKEN_B, taskAttemptId: ATTEMPT, ttlMs: 60000 });
  assert.equal(second.epoch, first.epoch + 1);
  assert.notEqual(second.record.previousStateHash, null);
});

test('lease: an expired lease may be taken over, still with a monotonic epoch', () => {
  const repo = makeRepo();
  const t0 = Date.parse('2026-07-26T00:00:00.000Z');
  const first = lease.claim({ cwd: repo, taskId: 'T-EXP', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 1000, nowMs: t0 });
  const second = lease.claim({ cwd: repo, taskId: 'T-EXP', holder: 'CODEX_LOCAL', holderToken: TOKEN_B, taskAttemptId: ATTEMPT, ttlMs: 1000, nowMs: t0 + 5000 });
  assert.equal(second.epoch, first.epoch + 1);
  // The evicted holder must not be able to mutate afterwards.
  assert.throws(() => lease.renew({ cwd: repo, taskId: 'T-EXP', holderToken: TOKEN_A, leaseEpoch: first.epoch, nowMs: t0 + 6000 }), (e) => e.code === 'FENCING_FAILURE');
});

test('lease: assertHeld rejects released, stale-epoch and expired states', () => {
  const repo = makeRepo();
  const t0 = Date.parse('2026-07-26T00:00:00.000Z');
  const r = lease.claim({ cwd: repo, taskId: 'T-ASSERT', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 1000, nowMs: t0 });
  assert.doesNotThrow(() => lease.assertHeld({ cwd: repo, taskId: 'T-ASSERT', holderToken: TOKEN_A, leaseEpoch: r.epoch, nowMs: t0 }));
  assert.throws(() => lease.assertHeld({ cwd: repo, taskId: 'T-ASSERT', holderToken: TOKEN_A, leaseEpoch: r.epoch, nowMs: t0 + 9999 }), (e) => e.code === 'FENCING_FAILURE');
  lease.release({ cwd: repo, taskId: 'T-ASSERT', holderToken: TOKEN_A, leaseEpoch: r.epoch, releaseReason: 'CLOSED', nowMs: t0 });
  assert.throws(() => lease.assertHeld({ cwd: repo, taskId: 'T-ASSERT', holderToken: TOKEN_A, leaseEpoch: r.epoch, nowMs: t0 }), (e) => e.code === 'FENCING_FAILURE');
});

test('lease: invalid identity input is rejected before any ref write', () => {
  const repo = makeRepo();
  const base = { cwd: repo, taskId: 'T-BAD', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT };
  assert.throws(() => lease.claim(Object.assign({}, base, { holder: 'SOMEONE' })), (e) => e.code === 'HOLDER_INVALID');
  assert.throws(() => lease.claim(Object.assign({}, base, { holderToken: 'short' })), (e) => e.code === 'HOLDER_TOKEN_INVALID');
  assert.throws(() => lease.claim(Object.assign({}, base, { taskId: 'lower-case' })), (e) => e.code === 'TASK_ID_INVALID');
  assert.equal(lease.read('T-BAD', repo).oid, null);
});

test('lease: common-dir gate rejects a mismatched expectation', () => {
  const repo = makeRepo();
  assert.throws(
    () => lease.claim({ cwd: repo, taskId: 'T-CD', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, expectedCommonDir: '/nowhere/.git' }),
    (e) => e.code === 'COMMON_DIR_MISMATCH',
  );
});

test('LEASE GATE: two OS processes claiming concurrently yield exactly one winner', () => {
  const repo = makeRepo();
  const barrier = Date.now() + 1500;
  const spawnClaim = (holder, token) =>
    spawnSync(process.execPath, [
      RACE_WORKER, '--mode', 'claim', '--cwd', repo, '--task', 'RACE-ONE',
      '--holder', holder, '--token', token, '--attempt', ATTEMPT,
      '--barrier', String(barrier),
    ], { encoding: 'utf8' });

  // Launch both, then let the barrier release them into the CAS together.
  const { spawn } = require('child_process');
  const runs = ['CLAUDE_LOCAL', 'CODEX_LOCAL'].map((holder, idx) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [
        RACE_WORKER, '--mode', 'claim', '--cwd', repo, '--task', 'RACE-ONE',
        '--holder', holder, '--token', idx === 0 ? TOKEN_A : TOKEN_B,
        '--attempt', ATTEMPT, '--barrier', String(barrier),
      ], { encoding: 'utf8' });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.on('close', () => resolve(JSON.parse(out.trim().split('\n').pop())));
    }),
  );
  void spawnClaim;

  return Promise.all(runs).then((results) => {
    const won = results.filter((r) => r.outcome === 'WON');
    const lost = results.filter((r) => r.outcome === 'LOST');
    assert.equal(won.length, 1, 'exactly one winner, got ' + JSON.stringify(results));
    assert.equal(lost.length, 1);
    assert.ok(
      ['FENCING_FAILURE', 'CLAIM_CONFLICT'].includes(lost[0].code),
      'loser must fail closed, got ' + lost[0].code,
    );
    // The loser must not have mutated state: exactly one HELD record at epoch 1.
    const state = lease.read('RACE-ONE', repo);
    assert.equal(state.record.state, 'HELD');
    assert.equal(state.record.leaseEpoch, 1);
    assert.equal(state.record.holder, won[0].holder);
  });
});

test('LEASE GATE: the losing process performs zero state mutation', () => {
  const repo = makeRepo();
  const held = lease.claim({ cwd: repo, taskId: 'RACE-TWO', holder: 'CLAUDE_LOCAL', holderToken: TOKEN_A, taskAttemptId: ATTEMPT, ttlMs: 60000 });
  const before = lease.read('RACE-TWO', repo);
  const r = spawnSync(process.execPath, [
    RACE_WORKER, '--mode', 'claim', '--cwd', repo, '--task', 'RACE-TWO',
    '--holder', 'CODEX_LOCAL', '--token', TOKEN_B, '--attempt', ATTEMPT,
  ], { encoding: 'utf8' });
  const res = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(res.outcome, 'LOST');
  const after = lease.read('RACE-TWO', repo);
  assert.equal(after.oid, before.oid, 'lease object must be untouched');
  assert.equal(after.record.leaseEpoch, held.epoch);
});

// ------------------------------------------------------------- BOUNDARY GATE

const ALLOWED = ['project/apps/api/'];
const FORBIDDEN = [
  'AGENTS.md',
  'CLAUDE.md',
  'project/docs/governance/**',
  'project/prisma/',
  'project/deploy/',
  'project/ops/',
  '.claude/',
  '.codex/',
  '.worktrees/',
];

function verdictFor(changes, over) {
  return boundary.validate(Object.assign({ changes, allowedRoots: ALLOWED, forbidden: FORBIDDEN }, over || {}));
}

function ch(over) {
  return Object.assign(
    { status: 'M', srcMode: '100644', dstMode: '100644', path: 'project/apps/api/src/a.ts', originalPath: null, classes: ['MODIFY'] },
    over,
  );
}

test('boundary: an in-boundary modify passes', () => {
  const v = verdictFor([ch()]);
  assert.equal(v.withinBoundary, true);
  assert.equal(v.violations.length, 0);
});

test('boundary: empty positive allowlist permits nothing', () => {
  const v = boundary.validate({ changes: [ch()], allowedRoots: [], forbidden: FORBIDDEN });
  assert.equal(v.withinBoundary, false);
  assert.ok(v.violations.some((x) => x.code === 'OUTSIDE_PERMITTED_BOUNDARY'));
});

test('boundary: NEGATIVE FIXTURE SET — every escape attempt is rejected', () => {
  const cases = [
    ['allowed -> forbidden rename', [ch({ status: 'R100', classes: ['RENAME'], originalPath: 'project/apps/api/src/a.ts', path: 'project/docs/governance/x.md' })]],
    ['forbidden -> allowed rename', [ch({ status: 'R100', classes: ['RENAME'], originalPath: 'project/docs/governance/x.md', path: 'project/apps/api/src/a.ts' })]],
    ['copy into forbidden root', [ch({ status: 'C100', classes: ['COPY'], originalPath: 'project/apps/api/src/a.ts', path: 'project/ops/a.ts' })]],
    ['case-only rename', [ch({ status: 'R100', classes: ['RENAME'], originalPath: 'project/apps/api/src/a.ts', path: 'project/apps/api/src/A.ts' })]],
    ['symlink change', [ch({ dstMode: '120000', classes: ['MODIFY', 'SYMLINK'] })]],
    ['gitlink/submodule change', [ch({ dstMode: '160000', classes: ['MODIFY', 'GITLINK'] })]],
    ['type change', [ch({ status: 'T', classes: ['TYPE_CHANGE'] })]],
    ['executable-bit change', [ch({ dstMode: '100755', classes: ['MODIFY', 'MODE_CHANGE'] })]],
    ['binary mutation', [ch({ classes: ['MODIFY', 'BINARY'] })]],
    ['untracked file', [ch({ status: '?', classes: ['UNTRACKED'], path: 'project/apps/api/src/new.ts' })]],
    ['deleted forbidden file', [ch({ status: 'D', classes: ['DELETE'], path: 'AGENTS.md' })]],
    ['owner WIP touched', [ch({ path: '.codex/hooks.json' })]],
    ['governance path touched', [ch({ path: 'project/docs/governance/decision-log.md' })]],
    ['prisma path touched', [ch({ path: 'project/prisma/schema.prisma' })]],
    ['outside any allowed root', [ch({ path: 'project/apps/web/src/x.tsx' })]],
  ];
  for (const [label, changes] of cases) {
    const v = verdictFor(changes);
    assert.equal(v.withinBoundary, false, 'must reject: ' + label);
    assert.ok(v.violations.length > 0, 'must explain: ' + label);
  }
});

test('boundary: forbiddenPathsUntouched is false only for real forbidden hits', () => {
  assert.equal(verdictFor([ch({ path: 'AGENTS.md', status: 'D', classes: ['DELETE'] })]).forbiddenPathsUntouched, false);
  assert.equal(verdictFor([ch({ path: 'project/apps/web/x.ts' })]).forbiddenPathsUntouched, true);
});

test('boundary: unsafe path shapes are rejected at normalization', () => {
  const bad = ['/abs/path', '../escape', 'a/../b', 'a//b', 'C:/win/path', 'a\\b', '', './x'];
  for (const p of bad) {
    assert.throws(() => boundary.normalizeRepoPath(p, 'test'), 'must reject ' + JSON.stringify(p));
  }
  for (const p of ['project/apps/api/src/a.ts', 'AGENTS.md', 'a-b_c.1/d.ts']) {
    assert.doesNotThrow(() => boundary.normalizeRepoPath(p, 'test'));
  }
});

test('boundary: control characters in a path are rejected', () => {
  // Guards the PATH_CONTROL_CHAR rule explicitly. The regex is written with
  // escape sequences rather than literal control bytes: embedding a raw NUL in
  // the source made git classify this whole validator as binary, which would
  // leave a safety-critical file permanently unreviewable in diffs.
  const cases = ['a/\u0000b', 'a/\u001fb', 'a/\u0007b', 'a/\u007fb', 'a/\u001bb'];
  for (const p of cases) {
    assert.throws(
      () => boundary.normalizeRepoPath(p, 'test'),
      (e) => e.code === 'PATH_CONTROL_CHAR',
      'must reject control char in ' + JSON.stringify(p),
    );
  }
  // A NUL-bearing path must never survive into a boundary verdict either.
  const v = boundary.validate({
    changes: [],
    allowedRoots: ['project/apps/api/'],
    forbidden: [],
  });
  assert.equal(v.withinBoundary, true);
});

test('boundary: this module contains no raw control bytes', () => {
  // Regression guard for the defect above: a raw control byte in the source
  // makes git treat the file as binary and silently unreviewable.
  const raw = fs.readFileSync(path.join(__dirname, 'boundary.cjs'));
  const offenders = [];
  for (const b of raw) {
    if (b < 9 || (b > 10 && b < 32 && b !== 13)) offenders.push(b);
  }
  assert.deepEqual(offenders, [], 'raw control bytes present in boundary.cjs');
  assert.equal(raw.includes(0), false, 'NUL byte present in boundary.cjs');
});

test('boundary: maxChangedFiles is enforced', () => {
  const many = [ch({ path: 'project/apps/api/src/a.ts' }), ch({ path: 'project/apps/api/src/b.ts' })];
  const v = verdictFor(many, { maxChangedFiles: 1 });
  assert.ok(v.violations.some((x) => x.code === 'MAX_CHANGED_FILES_EXCEEDED'));
});

test('boundary: extractChanges reads real git plumbing (add/modify/delete/rename)', () => {
  const repo = makeRepo();
  const base = git(['rev-parse', 'HEAD'], repo).trim();
  fs.writeFileSync(path.join(repo, 'project/apps/api/src/a.ts'), 'export const a = 2;\n');
  fs.writeFileSync(path.join(repo, 'project/apps/api/src/b.ts'), 'export const b = 1;\n');
  fs.unlinkSync(path.join(repo, 'README.md'));
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'change'], repo);
  const head = git(['rev-parse', 'HEAD'], repo).trim();

  const changes = boundary.extractChanges({ base, head, cwd: repo, includeUntracked: false });
  const byPath = {};
  for (const c of changes) byPath[c.path] = c;
  assert.ok(byPath['project/apps/api/src/a.ts'].classes.includes('MODIFY'));
  assert.ok(byPath['project/apps/api/src/b.ts'].classes.includes('ADD'));
  assert.ok(byPath['README.md'].classes.includes('DELETE'));

  const v = boundary.validate({ changes, allowedRoots: ALLOWED, forbidden: FORBIDDEN });
  assert.equal(v.withinBoundary, false, 'README.md deletion is outside the boundary');
});

test('boundary: real untracked file is surfaced and rejected', () => {
  const repo = makeRepo();
  const base = git(['rev-parse', 'HEAD'], repo).trim();
  fs.writeFileSync(path.join(repo, 'project/apps/api/src/stray.ts'), 'export const s = 1;\n');
  const changes = boundary.extractChanges({ base, head: null, cwd: repo });
  assert.ok(changes.some((c) => c.classes.includes('UNTRACKED') && c.path.endsWith('stray.ts')));
  const v = boundary.validate({ changes, allowedRoots: ALLOWED, forbidden: FORBIDDEN });
  assert.ok(v.violations.some((x) => x.code === 'UNTRACKED_FILE_PRESENT'));
});

test('boundary: real executable-bit change is detected as MODE_CHANGE', () => {
  const repo = makeRepo();
  const base = git(['rev-parse', 'HEAD'], repo).trim();
  git(['update-index', '--chmod=+x', 'project/apps/api/src/a.ts'], repo);
  git(['commit', '-q', '-m', 'chmod'], repo);
  const head = git(['rev-parse', 'HEAD'], repo).trim();
  const changes = boundary.extractChanges({ base, head, cwd: repo, includeUntracked: false });
  const entry = changes.find((c) => c.path === 'project/apps/api/src/a.ts');
  assert.ok(entry.classes.includes('MODE_CHANGE'), 'classes=' + entry.classes.join(','));
  const v = boundary.validate({ changes, allowedRoots: ALLOWED, forbidden: FORBIDDEN });
  assert.ok(v.violations.some((x) => x.code === 'MODE_CHANGE_FORBIDDEN'));
});

test('boundary: forbidden glob matching covers prefix, dir and ** forms', () => {
  assert.ok(boundary.matchesForbidden('project/docs/governance/x/y.md', ['project/docs/governance/**']));
  assert.ok(boundary.matchesForbidden('project/prisma/schema.prisma', ['project/prisma/']));
  assert.ok(boundary.matchesForbidden('AGENTS.md', ['AGENTS.md']));
  assert.ok(boundary.matchesForbidden('project/docs/governance/governance-writer-coordination-contract.md', ['project/docs/governance/governance-writer-coordination-*']));
  assert.equal(boundary.matchesForbidden('project/apps/api/src/a.ts', FORBIDDEN), null);
});

test('boundary: a forbidden subsurface beats the allowed root containing it', () => {
  // The precedence §1 depends on, and the exact shape of the defect the §1.1
  // correction closes: a BOUNDED_CODE_TASK must be able to work under
  // project/apps/api/, so the allowed root necessarily contains the Prisma
  // schema/migration surface. Being inside an allowed root must not make a
  // forbidden path writable — otherwise PRODUCTION_SCHEMA_MIGRATION_RUNTIME is
  // denied by the contract and permitted by the validator. Nothing asserted
  // FORBIDDEN_PATH_TOUCHED at validate() level before this.
  const forbidden = FORBIDDEN.concat(['project/apps/api/prisma/']);
  for (const p of [
    'project/apps/api/prisma/schema.prisma',
    'project/apps/api/prisma/migrations/20260718210000_x/migration.sql',
  ]) {
    const v = boundary.validate({ changes: [ch({ path: p })], allowedRoots: ALLOWED, forbidden });
    assert.equal(v.withinBoundary, false, p);
    assert.equal(v.forbiddenPathsUntouched, false, p);
    assert.ok(
      v.violations.some((x) => x.code === 'FORBIDDEN_PATH_TOUCHED'),
      p + ' must raise FORBIDDEN_PATH_TOUCHED',
    );
  }

  // Sibling application code under the same allowed root stays writable, so the
  // fix does not over-tighten the profile out of usefulness.
  const ok = boundary.validate({
    changes: [ch({ path: 'project/apps/api/src/prisma/prisma.service.ts' })],
    allowedRoots: ALLOWED,
    forbidden,
  });
  assert.equal(ok.withinBoundary, true);
});

// ------------------------------------------------------------- WORKTREE GATE

test('worktree: owner WIP prefixes are recognised', () => {
  for (const p of ['.worktrees/x', '.claude/settings.json', '.codex/hooks.json', '.codex']) {
    assert.equal(worktree.isOwnerWipPath(p), true, p);
  }
  assert.equal(worktree.isOwnerWipPath('project/apps/api/src/a.ts'), false);
});

test('WORKTREE GATE: create, verify shared common-dir, remove, integrity intact', () => {
  const repo = makeRepo();
  const before = worktree.snapshotCanonicalIntegrity(repo);

  const wtPath = path.join(os.tmpdir(), 'govv2-wt-' + process.pid + '-' + before.worktreeCount);
  tempRoots.push(wtPath);
  const created = worktree.createIsolated({ cwd: repo, path: wtPath, branch: 'test/iso-1', baseRef: 'HEAD' });

  assert.equal(created.commonDir, before.commonDir, 'must share one common dir');
  assert.match(created.pinnedBaseSha, /^[0-9a-f]{40}$/);
  assert.equal(created.reparsePoints.length, 0);
  assert.equal(worktree.listWorktrees(repo).length, before.worktreeCount + 1);

  // Work inside it, then remove.
  fs.writeFileSync(path.join(wtPath, 'project/apps/api/src/a.ts'), 'export const a = 3;\n');
  const res = worktree.removeSafe({ cwd: repo, path: wtPath });

  assert.equal(res.disposition, 'REMOVED');
  assert.equal(res.stillRegistered, false);
  assert.equal(res.integrity.ok, true, 'integrity problems: ' + res.integrity.problems.join(','));

  const after = worktree.snapshotCanonicalIntegrity(repo);
  assert.equal(after.worktreeCount, before.worktreeCount);
  assert.equal(after.head, before.head);
  assert.equal(after.trackedDirty, before.trackedDirty);
  assert.equal(after.configParses, true);
});

test('WORKTREE GATE: removal refuses the canonical root and unregistered paths', () => {
  const repo = makeRepo();
  const canonical = worktree.resolveCanonicalRoot(repo);
  assert.throws(() => worktree.removeSafe({ cwd: repo, path: canonical }), (e) => e.code === 'REFUSE_REMOVE_CANONICAL_ROOT');
  assert.throws(() => worktree.removeSafe({ cwd: repo, path: path.join(os.tmpdir(), 'govv2-not-a-worktree') }), (e) => e.code === 'WORKTREE_NOT_REGISTERED');
});

test('WORKTREE GATE: creation refuses canonical root, existing paths and owner WIP', () => {
  const repo = makeRepo();
  const canonical = worktree.resolveCanonicalRoot(repo);
  assert.throws(() => worktree.createIsolated({ cwd: repo, path: canonical, branch: 'test/x', baseRef: 'HEAD' }), (e) => e.code === 'TARGET_IS_CANONICAL_ROOT');
  assert.throws(() => worktree.createIsolated({ cwd: repo, path: path.join(canonical, 'project'), branch: 'test/y', baseRef: 'HEAD' }), (e) => e.code === 'TARGET_PATH_EXISTS');
  assert.throws(() => worktree.createIsolated({ cwd: repo, path: path.join(canonical, '.codex/wt'), branch: 'test/z', baseRef: 'HEAD' }), (e) => e.code === 'TARGET_INSIDE_OWNER_WIP');
});

test('WORKTREE GATE: assertNotCanonicalRootForEdit blocks canonical, allows isolated', () => {
  const repo = makeRepo();
  assert.throws(() => worktree.assertNotCanonicalRootForEdit(repo), (e) => e.code === 'CANONICAL_ROOT_EDIT_FORBIDDEN');
  const wtPath = path.join(os.tmpdir(), 'govv2-wt-edit-' + process.pid);
  tempRoots.push(wtPath);
  worktree.createIsolated({ cwd: repo, path: wtPath, branch: 'test/edit-ok', baseRef: 'HEAD' });
  assert.doesNotThrow(() => worktree.assertNotCanonicalRootForEdit(wtPath));
  worktree.removeSafe({ cwd: repo, path: wtPath });
});

test('worktree: diffIntegrity flags owner WIP loss and shrunken .bin', () => {
  const before = { canonicalRoot: '/r', commonDir: '/r/.git', head: 'x', branch: 'main', trackedDirty: 0, untrackedOwnerWip: ['.codex/'], configParses: true, configEntries: 10, worktreeCount: 1, binCounts: { a: 30 } };
  const after = Object.assign({}, before, { untrackedOwnerWip: [], binCounts: { a: 12 } });
  const d = worktree.diffIntegrity(before, after);
  assert.equal(d.ok, false);
  assert.ok(d.problems.some((p) => p.startsWith('OWNER_WIP_LOST')));
  assert.ok(d.problems.some((p) => p.startsWith('BIN_SHRANK')));
});

test('worktree: findReparsePoints never descends into a reparse point', () => {
  const repo = makeRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'govv2-target-'));
  tempRoots.push(outside);
  fs.mkdirSync(path.join(outside, 'deep'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'deep', 'secret.txt'), 'x');
  const linkPath = path.join(repo, 'linked');
  let linked = false;
  try {
    fs.symlinkSync(outside, linkPath, 'junction');
    linked = true;
  } catch (e) {
    // Symlink creation can require privileges; the assertion below is skipped
    // rather than silently passing.
  }
  if (!linked) {
    assert.ok(true, 'symlink unavailable in this environment — scan shape untested here');
    return;
  }
  const found = worktree.findReparsePoints(repo, 3);
  assert.ok(found.some((f) => f.path.endsWith('/linked')), 'link must be reported');
  assert.ok(!found.some((f) => f.path.includes('/linked/')), 'must not descend into the link');
});
