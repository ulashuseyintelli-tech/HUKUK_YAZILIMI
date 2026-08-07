'use strict';
/**
 * Real production-entry tests for install-pr-status-hook.cjs.
 *
 * RECURSION SAFETY — read this before adding a test.
 * This file is itself one of the four files runFullTestMatrixOrThrow()
 * spawns during a real (non-skipTests) activation. Every test that reaches
 * performActivation() must therefore do ONE of:
 *   (a) call performActivation() directly with { skipTests: true } (see
 *       activateSkippingTests() below) — the default for this whole file, or
 *   (b) go through main() for real, but ONLY against a makeSourceRepo()
 *       fixture — whose own project/scripts/*.test.cjs files are trivial
 *       synthetic stand-ins, never this real file — so the nested
 *       `node --test project/scripts/install-pr-status-hook.test.cjs` spawn
 *       resolves to the tiny fixture file, not this one.
 * The tests marked "REAL END-TO-END" (§9) and "§CLI" use (b) — including via
 * a full `node install-pr-status-hook.cjs` subprocess — and none may be
 * added without keeping that guarantee.
 *
 * Nothing here ever touches the real ~/.claude/hooks/: every test builds
 * its own hooksDir via makeHooksDir() and its own source repo via
 * makeSourceRepo(). The one exception (§8, live parity) only ever READS the
 * real legacy file if present, and skips gracefully if it is not.
 */
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync, spawnSync } = require('node:child_process');

const installer = require('./install-pr-status-hook.cjs');

function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function git(args, cwd) { return execFileSync('git', args, { cwd, encoding: 'utf8' }); }
function makeHooksDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pr-status-install-')); }
function cleanup(...dirs) { for (const d of dirs) { if (d) fs.rmSync(d, { recursive: true, force: true }); } }

// Tagged with the two substrings looksLikeOurLauncher() checks for, so a
// fixture launcher is recognised as "ours" on a second activation exactly
// the way the real pr-status-hook-launcher.cjs (which genuinely contains
// both) would be. See §7.
const FIXTURE_LAUNCHER_OK = '#!/usr/bin/env node\n'
  + '// fixture stand-in for pr-status-hook-launcher.cjs (PROTOCOL_VERSION, pr-status-active.json)\n'
  + 'process.exit(0);\n';
const FIXTURE_TAXONOMY_V1 = "module.exports = { TOKEN_NAMES: ['MERGED'], v: 1 };\n";
const FIXTURE_ADAPTER_V1 = "module.exports = { run: () => ({ decision: 'allow' }), v: 1 };\n";
const PASS_TEST_BODY = "require('node:test')('fixture-ok', () => {});\n";
const FAIL_TEST_BODY = "require('node:test')('fixture-fail', () => { throw new Error('deliberate fixture failure'); });\n";
const FIXTURE_TEST_FILES = [
  'pr-status-taxonomy.test.cjs',
  'pr-status-hook-adapter.test.cjs',
  'pr-status-hook-launcher.test.cjs',
  'install-pr-status-hook.test.cjs',
];

/**
 * A throwaway git repo laid out exactly like the real one at the three
 * paths the installer reads, plus trivial project/scripts/*.test.cjs
 * stand-ins at the same relative paths runFullTestMatrixOrThrow expects.
 * See RECURSION SAFETY above for why these must never be the real files.
 */
function makeSourceRepo(opts) {
  const o = opts || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-status-source-'));
  git(['init', '--quiet'], dir);
  git(['config', 'user.email', 'x@x.invalid'], dir);
  git(['config', 'user.name', 'X'], dir);
  const scriptsDir = path.join(dir, 'project', 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(path.join(scriptsDir, 'pr-status-taxonomy.cjs'), o.taxonomy || FIXTURE_TAXONOMY_V1);
  fs.writeFileSync(path.join(scriptsDir, 'pr-status-hook-adapter.cjs'), o.adapter || FIXTURE_ADAPTER_V1);
  fs.writeFileSync(path.join(scriptsDir, 'pr-status-hook-launcher.cjs'), o.launcher || FIXTURE_LAUNCHER_OK);
  const testBody = o.testsPass === false ? FAIL_TEST_BODY : PASS_TEST_BODY;
  for (const f of FIXTURE_TEST_FILES) fs.writeFileSync(path.join(scriptsDir, f), testBody);
  git(['add', '-A'], dir);
  git(['commit', '--quiet', '-m', 'init'], dir);

  let originDir = null;
  if (o.withOrigin !== false) {
    originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-status-origin-'));
    git(['init', '--quiet', '--bare'], originDir);
    git(['remote', 'add', 'origin', originDir], dir);
    git(['push', '--quiet', 'origin', 'HEAD:refs/heads/main'], dir);
    git(['fetch', '--quiet', 'origin'], dir);
  }
  return { dir, originDir };
}

function commitChange(dir, relPath, content, message) {
  fs.writeFileSync(path.join(dir, relPath), content);
  git(['add', '-A'], dir);
  git(['commit', '--quiet', '-m', message || 'change'], dir);
}
function pushAndFetch(dir) {
  git(['push', '--quiet', 'origin', 'HEAD:refs/heads/main'], dir);
  git(['fetch', '--quiet', 'origin'], dir);
}
function advanceOriginBehindOurBack(originDir) {
  const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-status-race-'));
  git(['clone', '--quiet', originDir, cloneDir]);
  git(['config', 'user.email', 'x@x.invalid'], cloneDir);
  git(['config', 'user.name', 'X'], cloneDir);
  fs.writeFileSync(path.join(cloneDir, 'race.txt'), 'raced\n');
  git(['add', '-A'], cloneDir);
  git(['commit', '--quiet', '-m', 'race'], cloneDir);
  git(['push', '--quiet', 'origin', 'HEAD:refs/heads/main'], cloneDir);
  cleanup(cloneDir);
}

/** The fast path used by almost every test: real transaction mechanics, no nested test-matrix spawn. */
function activateSkippingTests(cwd, hooksDir) {
  const paths = installer.makePaths(hooksDir);
  const r = installer.inspect(installer.parseArgs([]), cwd, paths);
  return installer.performActivation(r, cwd, paths, { skipTests: true });
}

/** A believable, self-consistent "already installed and working" prior state. */
function buildPriorInstall(hooksDir) {
  const paths = installer.makePaths(hooksDir);
  const oldCommit = 'b'.repeat(40);
  const oldTaxonomy = "module.exports = { v: 'old-taxonomy' };\n";
  const oldAdapter = "module.exports = { run: () => ({ decision: 'allow' }), v: 'old-adapter' };\n";
  const oldLauncher = `${FIXTURE_LAUNCHER_OK}// old\n`;
  const oldBundleDir = path.join(paths.bundlesDir, oldCommit);
  fs.mkdirSync(oldBundleDir, { recursive: true });
  fs.writeFileSync(path.join(oldBundleDir, 'pr-status-taxonomy.cjs'), oldTaxonomy);
  fs.writeFileSync(path.join(oldBundleDir, 'pr-status-hook-adapter.cjs'), oldAdapter);
  fs.mkdirSync(paths.hooksDir, { recursive: true });
  fs.writeFileSync(paths.installedLauncher, oldLauncher);
  const oldHashes = { taxonomy: sha256(oldTaxonomy), adapter: sha256(oldAdapter), launcher: sha256(oldLauncher) };
  fs.writeFileSync(paths.activeManifest, JSON.stringify({
    schemaVersion: 1, protocolVersion: 1, activeCommit: oldCommit, hashes: oldHashes, previousCommit: null,
  }, null, 2));
  return {
    paths, oldCommit, oldTaxonomy, oldAdapter, oldLauncher, oldHashes,
  };
}

// =========================================================== §1 inspect()
test('§1 inspect: fresh repo, fresh hooksDir -> NOT_INSTALLED', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  const r = installer.inspect(installer.parseArgs([]), dir, paths);
  assert.equal(r.status, 'NOT_INSTALLED');
  cleanup(dir, originDir, hooksDir);
});

test('§1 inspect: after activation -> UP_TO_DATE', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  const r = installer.inspect(installer.parseArgs([]), dir, paths);
  assert.equal(r.status, 'UP_TO_DATE');
  cleanup(dir, originDir, hooksDir);
});

test('§1 inspect: main advances after install -> OUTDATED (self-consistent, different commit)', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  commitChange(dir, 'project/scripts/pr-status-taxonomy.cjs', "module.exports = { TOKEN_NAMES: ['MERGED'], v: 2 };\n", 'bump');
  pushAndFetch(dir);
  const paths = installer.makePaths(hooksDir);
  const r = installer.inspect(installer.parseArgs([]), dir, paths);
  assert.equal(r.status, 'OUTDATED');
  cleanup(dir, originDir, hooksDir);
});

test('§1 inspect: tampering the installed bundle after activation -> LOCAL_DRIFT', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  const active = JSON.parse(fs.readFileSync(paths.activeManifest, 'utf8'));
  fs.writeFileSync(path.join(paths.bundlesDir, active.activeCommit, 'pr-status-hook-adapter.cjs'), '// tampered\n');
  const r = installer.inspect(installer.parseArgs([]), dir, paths);
  assert.equal(r.status, 'LOCAL_DRIFT');
  cleanup(dir, originDir, hooksDir);
});

test('§1 inspect: active.json missing the launcher hash field (version-skew) -> LOCAL_DRIFT', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  const active = JSON.parse(fs.readFileSync(paths.activeManifest, 'utf8'));
  delete active.hashes.launcher;
  fs.writeFileSync(paths.activeManifest, JSON.stringify(active, null, 2));
  const r = installer.inspect(installer.parseArgs([]), dir, paths);
  assert.equal(r.status, 'LOCAL_DRIFT');
  cleanup(dir, originDir, hooksDir);
});

test('§1 inspect: corrupt (unparsable) active.json is treated as NOT_INSTALLED, not a crash', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  fs.mkdirSync(paths.hooksDir, { recursive: true });
  fs.writeFileSync(paths.activeManifest, '{not valid json');
  const r = installer.inspect(installer.parseArgs([]), dir, paths);
  assert.equal(r.status, 'NOT_INSTALLED');
  cleanup(dir, originDir, hooksDir);
});

// ======================================================= §2 main() surface
test('§2 main(): fresh activation writes bundle+active.json+launcher and leaves no journal/mutex', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  assert.ok(fs.existsSync(paths.activeManifest));
  assert.ok(fs.existsSync(paths.installedLauncher));
  assert.ok(!fs.existsSync(paths.journalPath), 'journal must not survive a clean activation');
  assert.ok(!fs.existsSync(paths.mutexDir), 'mutex must be released');
  cleanup(dir, originDir, hooksDir);
});

test('§2 main(): LOCAL_DRIFT refuses to reactivate without --repair-from-canonical-main', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  const active = JSON.parse(fs.readFileSync(paths.activeManifest, 'utf8'));
  fs.writeFileSync(path.join(paths.bundlesDir, active.activeCommit, 'pr-status-hook-adapter.cjs'), '// tampered\n');
  const exit = installer.main([], dir, hooksDir);
  assert.equal(exit, 1);
  cleanup(dir, originDir, hooksDir);
});

test('§2 main(): --repair-from-canonical-main clears drift and reactivates cleanly', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  const active = JSON.parse(fs.readFileSync(paths.activeManifest, 'utf8'));
  fs.writeFileSync(path.join(paths.bundlesDir, active.activeCommit, 'pr-status-hook-adapter.cjs'), '// tampered\n');
  // main() itself always runs the (skip-free) real test matrix, so drive
  // the repair through performActivation directly with skipTests, exactly
  // like every other non-end-to-end test in this file.
  const r = installer.inspect(installer.parseArgs(['--repair-from-canonical-main']), dir, paths);
  assert.equal(r.status, 'LOCAL_DRIFT');
  assert.equal(installer.performActivation(r, dir, paths, { skipTests: true }), 0);
  const after = installer.inspect(installer.parseArgs([]), dir, paths);
  assert.equal(after.status, 'UP_TO_DATE');
  cleanup(dir, originDir, hooksDir);
});

test('§2 main(): --dry-run never writes anything, even against NOT_INSTALLED', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  const exit = installer.main(['--dry-run'], dir, hooksDir);
  assert.equal(exit, 0);
  assert.ok(!fs.existsSync(hooksDir) || fs.readdirSync(hooksDir).length === 0, '--dry-run must not create anything under hooksDir');
  cleanup(dir, originDir, hooksDir);
});

test('§2 main(): --verify reports UP_TO_DATE (0) then drifts to non-zero after tampering', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  assert.equal(installer.main(['--verify'], dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  const active = JSON.parse(fs.readFileSync(paths.activeManifest, 'utf8'));
  fs.writeFileSync(path.join(paths.bundlesDir, active.activeCommit, 'pr-status-hook-adapter.cjs'), '// tampered\n');
  assert.equal(installer.main(['--verify'], dir, hooksDir), 1);
  cleanup(dir, originDir, hooksDir);
});

test('§2 main(): --candidate-ref validates an arbitrary ref without ever installing', () => {
  const { dir, originDir } = makeSourceRepo({ withOrigin: false });
  commitChange(dir, 'project/scripts/pr-status-taxonomy.cjs', "module.exports = { v: 'candidate' };\n", 'candidate commit');
  git(['tag', 'candidate-tag'], dir);
  const hooksDir = makeHooksDir();
  const exit = installer.main(['--dry-run', '--candidate-ref', 'candidate-tag'], dir, hooksDir);
  assert.equal(exit, 0);
  assert.ok(!fs.existsSync(hooksDir) || fs.readdirSync(hooksDir).length === 0, 'a candidate ref must never be installed');
  cleanup(dir, originDir, hooksDir);
});

test('§2 parseArgs: --candidate-ref without --dry-run/--verify is a usage error (can never install)', () => {
  assert.throws(() => installer.parseArgs(['--candidate-ref', 'x']), (e) => e instanceof installer.InstallError && e.code === 'USAGE');
});

test('§2 parseArgs: --repair-from-canonical-main combined with --candidate-ref is rejected', () => {
  assert.throws(
    () => installer.parseArgs(['--repair-from-canonical-main', '--candidate-ref', 'x', '--dry-run']),
    (e) => e instanceof installer.InstallError && e.code === 'USAGE',
  );
});

test('§2 parseArgs: an unknown flag is a usage error', () => {
  assert.throws(() => installer.parseArgs(['--nonsense']), (e) => e instanceof installer.InstallError && e.code === 'USAGE');
});

// ================================================ §3 bundle immutability
test('§3 immutability: re-activating the SAME unchanged commit never rewrites its bundle file', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  const active1 = JSON.parse(fs.readFileSync(paths.activeManifest, 'utf8'));
  const bundleFile = path.join(paths.bundlesDir, active1.activeCommit, 'pr-status-taxonomy.cjs');
  const beforeStat = fs.statSync(bundleFile);
  // UP_TO_DATE short-circuits in main() before performActivation is ever
  // called — exercise that exact real gate here (cheap: no test-matrix
  // spawn is reachable from this branch).
  assert.equal(installer.main([], dir, hooksDir), 0);
  const afterStat = fs.statSync(bundleFile);
  assert.equal(beforeStat.mtimeMs, afterStat.mtimeMs, 'file must not have been rewritten');
  cleanup(dir, originDir, hooksDir);
});

test('§3 immutability: previousCommit bundle survives an update to a new commit byte-for-byte', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  const active1 = JSON.parse(fs.readFileSync(paths.activeManifest, 'utf8'));
  const oldCommit = active1.activeCommit;
  const oldBundleDir = path.join(paths.bundlesDir, oldCommit);
  const oldTaxonomyBefore = fs.readFileSync(path.join(oldBundleDir, 'pr-status-taxonomy.cjs'), 'utf8');

  commitChange(dir, 'project/scripts/pr-status-taxonomy.cjs', "module.exports = { TOKEN_NAMES: ['MERGED'], v: 2 };\n", 'bump');
  pushAndFetch(dir);
  assert.equal(activateSkippingTests(dir, hooksDir), 0);

  const active2 = JSON.parse(fs.readFileSync(paths.activeManifest, 'utf8'));
  assert.equal(active2.previousCommit, oldCommit);
  assert.notEqual(active2.activeCommit, oldCommit);
  assert.ok(fs.existsSync(oldBundleDir), 'old bundle dir must still exist');
  assert.equal(fs.readFileSync(path.join(oldBundleDir, 'pr-status-taxonomy.cjs'), 'utf8'), oldTaxonomyBefore);
  cleanup(dir, originDir, hooksDir);
});

test('§3 immutability: repairing a corrupted bundle for the CURRENT commit replaces only that dir', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const paths = installer.makePaths(hooksDir);
  const active = JSON.parse(fs.readFileSync(paths.activeManifest, 'utf8'));
  const bundleDir = path.join(paths.bundlesDir, active.activeCommit);
  fs.writeFileSync(path.join(bundleDir, 'pr-status-hook-adapter.cjs'), '// corrupted\n');

  const r = installer.inspect(installer.parseArgs(['--repair-from-canonical-main']), dir, paths);
  assert.equal(r.status, 'LOCAL_DRIFT');
  assert.equal(installer.performActivation(r, dir, paths, { skipTests: true }), 0);

  const fixedAdapter = fs.readFileSync(path.join(bundleDir, 'pr-status-hook-adapter.cjs'), 'utf8');
  assert.equal(sha256(fixedAdapter), sha256(FIXTURE_ADAPTER_V1));
  cleanup(dir, originDir, hooksDir);
});

// =========================================================== §4 TOCTOU
test('§4 TOCTOU: resolveSourceCommit refuses when remote has moved past our last fetch', () => {
  const { dir, originDir } = makeSourceRepo();
  advanceOriginBehindOurBack(originDir);
  assert.throws(
    () => installer.resolveSourceCommit(dir),
    (e) => e instanceof installer.InstallError && e.code === 'STALE_CANONICAL_MAIN' && e.stale === true,
  );
  cleanup(dir, originDir);
});

test('§4 TOCTOU: main() propagates the stale-remote failure rather than installing an unpinned commit', () => {
  const { dir, originDir } = makeSourceRepo();
  advanceOriginBehindOurBack(originDir);
  const hooksDir = makeHooksDir();
  assert.throws(() => installer.main([], dir, hooksDir), /STALE_CANONICAL_MAIN/);
  assert.ok(!fs.existsSync(path.join(hooksDir, 'pr-status-active.json')));
  cleanup(dir, originDir, hooksDir);
});

test('§4 TOCTOU: a fresh "git fetch" (no race) resolves cleanly to the real tip', () => {
  const { dir, originDir } = makeSourceRepo();
  const before = installer.resolveSourceCommit(dir);
  assert.match(before, /^[0-9a-f]{40}$/);
  cleanup(dir, originDir);
});

// ====================================================== §5 mutex / concurrency
test('§5 mutex: a second acquireMutex while one is held is rejected', () => {
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  installer.acquireMutex(paths);
  assert.throws(() => installer.acquireMutex(paths), (e) => e instanceof installer.InstallError && e.code === 'CONCURRENT_INSTALL_IN_PROGRESS');
  installer.releaseMutex(paths);
  cleanup(hooksDir);
});

test('§5 mutex: performActivation refuses to run while another holds the lock', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  installer.acquireMutex(paths); // simulate another installer process mid-activation
  const r = installer.inspect(installer.parseArgs([]), dir, paths);
  assert.throws(() => installer.performActivation(r, dir, paths, { skipTests: true }), /CONCURRENT_INSTALL_IN_PROGRESS/);
  installer.releaseMutex(paths);
  cleanup(dir, originDir, hooksDir);
});

test('§5 mutex: a STALE mutex with no journal (pre-journal crash) is cleared automatically', () => {
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  fs.mkdirSync(paths.mutexDir, { recursive: true });
  const oldTime = new Date(Date.now() - (installer.MUTEX_STALE_MS + 60000));
  fs.utimesSync(paths.mutexDir, oldTime, oldTime);
  const result = installer.recoverStaleJournalIfAny(paths);
  assert.equal(result.recovered, true);
  assert.equal(fs.existsSync(paths.mutexDir), false);
  cleanup(hooksDir);
});

test('§5 mutex: a FRESH mutex with no journal is left alone (assume a live racer)', () => {
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  fs.mkdirSync(paths.mutexDir, { recursive: true });
  const result = installer.recoverStaleJournalIfAny(paths);
  assert.equal(result.recovered, false);
  assert.equal(fs.existsSync(paths.mutexDir), true);
  cleanup(hooksDir);
});

// ============================================ §6 journal-phase crash recovery
test('§6 journal PREPARED: recovery is a no-op — nothing live was touched yet', () => {
  const hooksDir = makeHooksDir();
  const { paths } = buildPriorInstall(hooksDir);
  const activeBackup = installer.backupFileIfExists(paths, paths.activeManifest, 'active.json');
  const launcherBackup = installer.backupFileIfExists(paths, paths.installedLauncher, 'launcher.cjs');
  installer.writeJournal(paths, {
    phase: 'PREPARED',
    targetCommit: 'c'.repeat(40),
    expectedHashes: {},
    backup: {
      activeJsonPath: activeBackup.path, activeJsonSha256: activeBackup.sha256, launcherPath: launcherBackup.path, launcherSha256: launcherBackup.sha256,
    },
  });
  const activeBefore = fs.readFileSync(paths.activeManifest, 'utf8');
  const launcherBefore = fs.readFileSync(paths.installedLauncher, 'utf8');

  const result = installer.recoverStaleJournalIfAny(paths);
  assert.equal(result.recovered, true);
  assert.equal(result.phase, 'PREPARED');
  assert.equal(fs.existsSync(paths.journalPath), false);
  assert.equal(fs.readFileSync(paths.activeManifest, 'utf8'), activeBefore);
  assert.equal(fs.readFileSync(paths.installedLauncher, 'utf8'), launcherBefore);
  cleanup(hooksDir);
});

test('§6 journal POINTER_SWITCHED: active.json rolls back byte-identical, launcher untouched', () => {
  const hooksDir = makeHooksDir();
  const { paths, oldLauncher } = buildPriorInstall(hooksDir);
  const activeBackup = installer.backupFileIfExists(paths, paths.activeManifest, 'active.json');
  const launcherBackup = installer.backupFileIfExists(paths, paths.installedLauncher, 'launcher.cjs');
  const preTransactionActive = fs.readFileSync(paths.activeManifest, 'utf8');

  fs.writeFileSync(paths.activeManifest, JSON.stringify({
    schemaVersion: 1, protocolVersion: 1, activeCommit: 'c'.repeat(40), hashes: { taxonomy: 'x', adapter: 'y', launcher: 'z' }, previousCommit: null,
  }, null, 2));
  installer.writeJournal(paths, {
    phase: 'POINTER_SWITCHED',
    targetCommit: 'c'.repeat(40),
    expectedHashes: {},
    backup: {
      activeJsonPath: activeBackup.path, activeJsonSha256: activeBackup.sha256, launcherPath: launcherBackup.path, launcherSha256: launcherBackup.sha256,
    },
  });

  const result = installer.recoverStaleJournalIfAny(paths);
  assert.equal(result.phase, 'POINTER_SWITCHED');
  assert.equal(fs.readFileSync(paths.activeManifest, 'utf8'), preTransactionActive, 'active.json must be BYTE-IDENTICAL to its pre-transaction content');
  assert.equal(fs.readFileSync(paths.installedLauncher, 'utf8'), oldLauncher, 'launcher was never switched in this phase and must be untouched');
  assert.equal(fs.existsSync(paths.journalPath), false);
  cleanup(hooksDir);
});

test('§6 journal LAUNCHER_SWITCHED: BOTH active.json and launcher roll back byte-identical', () => {
  const hooksDir = makeHooksDir();
  const { paths } = buildPriorInstall(hooksDir);
  const activeBackup = installer.backupFileIfExists(paths, paths.activeManifest, 'active.json');
  const launcherBackup = installer.backupFileIfExists(paths, paths.installedLauncher, 'launcher.cjs');
  const preTransactionActive = fs.readFileSync(paths.activeManifest, 'utf8');
  const preTransactionLauncher = fs.readFileSync(paths.installedLauncher, 'utf8');

  fs.writeFileSync(paths.activeManifest, JSON.stringify({
    schemaVersion: 1, protocolVersion: 1, activeCommit: 'c'.repeat(40), hashes: { taxonomy: 'x', adapter: 'y', launcher: 'z' }, previousCommit: null,
  }, null, 2));
  fs.writeFileSync(paths.installedLauncher, '#!/usr/bin/env node\nprocess.exit(0); // NEW, crashed right after this write\n');
  installer.writeJournal(paths, {
    phase: 'LAUNCHER_SWITCHED',
    targetCommit: 'c'.repeat(40),
    expectedHashes: {},
    backup: {
      activeJsonPath: activeBackup.path, activeJsonSha256: activeBackup.sha256, launcherPath: launcherBackup.path, launcherSha256: launcherBackup.sha256,
    },
  });

  const result = installer.recoverStaleJournalIfAny(paths);
  assert.equal(result.phase, 'LAUNCHER_SWITCHED');
  assert.equal(fs.readFileSync(paths.activeManifest, 'utf8'), preTransactionActive);
  assert.equal(fs.readFileSync(paths.installedLauncher, 'utf8'), preTransactionLauncher);
  assert.equal(fs.existsSync(paths.journalPath), false);
  cleanup(hooksDir);
});

test('§6 journal LAUNCHER_SWITCHED with no prior install (fresh-activation crash) deletes rather than restores', () => {
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  fs.mkdirSync(paths.hooksDir, { recursive: true });
  fs.writeFileSync(paths.activeManifest, JSON.stringify({
    schemaVersion: 1, protocolVersion: 1, activeCommit: 'c'.repeat(40), hashes: {}, previousCommit: null,
  }));
  fs.writeFileSync(paths.installedLauncher, 'brand new, never existed before\n');
  installer.writeJournal(paths, {
    phase: 'LAUNCHER_SWITCHED',
    targetCommit: 'c'.repeat(40),
    expectedHashes: {},
    backup: {
      activeJsonPath: null, activeJsonSha256: null, launcherPath: null, launcherSha256: null,
    },
  });
  installer.recoverStaleJournalIfAny(paths);
  assert.equal(fs.existsSync(paths.activeManifest), false);
  assert.equal(fs.existsSync(paths.installedLauncher), false);
  cleanup(hooksDir);
});

test('§6 journal VERIFIED: a leftover VERIFIED journal is just cleaned up, no rollback', () => {
  const hooksDir = makeHooksDir();
  const { paths } = buildPriorInstall(hooksDir);
  const activeContent = fs.readFileSync(paths.activeManifest, 'utf8');
  const launcherContent = fs.readFileSync(paths.installedLauncher, 'utf8');
  installer.writeJournal(paths, {
    phase: 'VERIFIED', targetCommit: 'b'.repeat(40), expectedHashes: {}, backup: {},
  });
  const result = installer.recoverStaleJournalIfAny(paths);
  assert.equal(result.phase, 'VERIFIED');
  assert.equal(fs.readFileSync(paths.activeManifest, 'utf8'), activeContent, 'must not roll back an already-completed transaction');
  assert.equal(fs.readFileSync(paths.installedLauncher, 'utf8'), launcherContent);
  assert.equal(fs.existsSync(paths.journalPath), false);
  cleanup(hooksDir);
});

test('§6 rollback: a corrupted backup file is refused, not silently used', () => {
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  fs.mkdirSync(paths.hooksDir, { recursive: true });
  const backupPath = path.join(paths.hooksDir, 'fake-backup.json');
  fs.writeFileSync(backupPath, 'actual content');
  assert.throws(
    () => installer.restoreFileByteIdentical(backupPath, path.join(paths.hooksDir, 'target.json'), sha256('a different content')),
    (e) => e instanceof installer.InstallError && e.code === 'ROLLBACK_BACKUP_CORRUPT',
  );
  cleanup(hooksDir);
});

test('§6 recoverStaleJournalIfAny runs harmlessly on a completely clean hooksDir', () => {
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  const result = installer.recoverStaleJournalIfAny(paths);
  assert.equal(result.recovered, false);
  cleanup(hooksDir);
});

// ==================================================== §7 legacy backup, write-once
test('§7 legacy backup: first activation over a hand-written hook captures a write-once record', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  fs.mkdirSync(paths.hooksDir, { recursive: true });
  const legacyContent = '#!/usr/bin/env node\n// a hand-written pre-PR-A hook, not ours\nprocess.exit(0);\n';
  fs.writeFileSync(paths.installedLauncher, legacyContent);

  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  assert.ok(fs.existsSync(paths.legacyBackupRecord));
  const record = JSON.parse(fs.readFileSync(paths.legacyBackupRecord, 'utf8'));
  assert.equal(record.sha256, sha256(legacyContent));
  assert.equal(fs.readFileSync(record.backupPath, 'utf8'), legacyContent);
  cleanup(dir, originDir, hooksDir);
});

test('§7 legacy backup: a second activation never overwrites the write-once record', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  fs.mkdirSync(paths.hooksDir, { recursive: true });
  fs.writeFileSync(paths.installedLauncher, '#!/usr/bin/env node\n// hand-written\nprocess.exit(0);\n');
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const recordAfterFirst = fs.readFileSync(paths.legacyBackupRecord, 'utf8');

  commitChange(dir, 'project/scripts/pr-status-taxonomy.cjs', "module.exports = { v: 2 };\n", 'bump');
  pushAndFetch(dir);
  assert.equal(activateSkippingTests(dir, hooksDir), 0);
  const recordAfterSecond = fs.readFileSync(paths.legacyBackupRecord, 'utf8');
  assert.equal(recordAfterFirst, recordAfterSecond, 'legacy record is write-once');
  cleanup(dir, originDir, hooksDir);
});

test('§7 legacy backup: activating over OUR OWN prior launcher creates no legacy record', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  const paths = installer.makePaths(hooksDir);
  assert.equal(activateSkippingTests(dir, hooksDir), 0); // installs OUR fixture launcher
  assert.equal(fs.existsSync(paths.legacyBackupRecord), false);

  commitChange(dir, 'project/scripts/pr-status-taxonomy.cjs', "module.exports = { v: 2 };\n", 'bump');
  pushAndFetch(dir);
  assert.equal(activateSkippingTests(dir, hooksDir), 0); // replaces OUR OWN launcher
  assert.equal(fs.existsSync(paths.legacyBackupRecord), false, 'replacing our own launcher is not a legacy event');
  cleanup(dir, originDir, hooksDir);
});

// ============================================ §8 live legacy-vs-new parity
test('§8 live parity (skips gracefully if absent): legacy hook and new adapter agree on every golden scenario', (t) => {
  let legacy;
  try {
    legacy = require(path.join(os.homedir(), '.claude', 'hooks', 'open-pr-guard.cjs'));
  } catch {
    t.diagnostic('skip: ~/.claude/hooks/open-pr-guard.cjs not present on this machine (expected on CI)');
    return;
  }
  if (typeof legacy.verify !== 'function' || typeof legacy.findDisposition !== 'function' || typeof legacy.__setGhPr !== 'function') {
    t.diagnostic('skip: legacy hook does not expose the expected verify/findDisposition/__setGhPr surface');
    return;
  }

  // eslint-disable-next-line global-require
  const adapter = require('./pr-status-hook-adapter.cjs');
  const RUNNING = {
    number: 1, state: 'OPEN', statusCheckRollup: [{ name: 'Test Suite', status: 'IN_PROGRESS', conclusion: null }],
  };
  const GREEN = {
    number: 1, state: 'OPEN', statusCheckRollup: [{ name: 'Web Tests (vitest)', status: 'COMPLETED', conclusion: 'SUCCESS' }],
  };
  const RED = {
    number: 1, state: 'OPEN', statusCheckRollup: [{ name: 'Architectural Guardrails', status: 'COMPLETED', conclusion: 'FAILURE' }],
  };
  const MERGED = {
    number: 1, state: 'MERGED', mergedAt: '2026-08-01T00:00:00Z', statusCheckRollup: [],
  };
  const scenarios = [
    { pr: RUNNING, line: 'PR #1: WAITING_FOR_CI - Test Suite kosuyor - beklemeye devam' },
    { pr: GREEN, line: 'PR #1: WAITING_FOR_CI - Test Suite kosuyor - beklemeye devam' },
    { pr: RED, line: 'PR #1: CI_FIX_REQUIRED - Architectural Guardrails FAILURE - duzeltilecek' },
    { pr: RUNNING, line: 'PR #1: CI_FIX_REQUIRED - Architectural Guardrails FAILURE - duzeltilecek' },
    { pr: RED, line: 'PR #1: BLOCKED_EXACT - disaridan giderilemeyen yetki eksikligi var ve owner karari gerekiyor - sonraki adim - owner karari: evet' },
    { pr: MERGED, line: 'PR #1: MERGED - abc1234def - main sync OK' },
  ];

  for (const { pr, line } of scenarios) {
    legacy.__setGhPr(() => pr);
    adapter.__setGhPr(() => pr);
    const legacyDisp = legacy.findDisposition(line, 1);
    const adapterDisp = adapter.findDisposition(line, 1);
    const legacyOutcome = legacy.verify(1, legacyDisp) === null ? 'ACCEPT' : 'REJECT';
    const adapterOutcome = adapter.verify(1, adapterDisp) === null ? 'ACCEPT' : 'REJECT';
    assert.equal(adapterOutcome, legacyOutcome, `parity break for "${line}" against PR state ${pr.state}: legacy=${legacyOutcome} adapter=${adapterOutcome}`);
  }
});

// ============================================ §9 REAL END-TO-END (see header)
test('§9 REAL END-TO-END: main() succeeds through the actual, un-skipped pre-activation test gate', () => {
  const { dir, originDir } = makeSourceRepo({ testsPass: true });
  const hooksDir = makeHooksDir();
  const exit = installer.main([], dir, hooksDir);
  assert.equal(exit, 0);
  const paths = installer.makePaths(hooksDir);
  assert.equal(installer.inspect(installer.parseArgs([]), dir, paths).status, 'UP_TO_DATE');
  cleanup(dir, originDir, hooksDir);
});

test('§9 REAL END-TO-END: a genuinely failing test file aborts activation and rolls back to nothing', () => {
  const { dir, originDir } = makeSourceRepo({ testsPass: false });
  const hooksDir = makeHooksDir();
  const exit = installer.main([], dir, hooksDir);
  assert.equal(exit, 1);
  assert.equal(fs.existsSync(path.join(hooksDir, 'pr-status-active.json')), false, 'a failed pre-activation test run must leave no live pointer');
  assert.equal(fs.existsSync(path.join(hooksDir, 'open-pr-guard.cjs')), false, 'a failed pre-activation test run must leave no live launcher');
  cleanup(dir, originDir, hooksDir);
});

// ======================== §CLI: the real `node install-pr-status-hook.cjs` subprocess entry
// PR_STATUS_HOOKS_DIR_TEST_OVERRIDE exists solely so these tests can drive
// the actual require.main===module bootstrapping (real argv, real
// exit-code mapping) without ever touching ~/.claude/hooks/ — see the
// comment on that block in install-pr-status-hook.cjs.
function runCliSubprocess(cwd, hooksDir, extraArgv) {
  return spawnSync(process.execPath, [path.join(__dirname, 'install-pr-status-hook.cjs'), ...(extraArgv || [])], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PR_STATUS_HOOKS_DIR_TEST_OVERRIDE: hooksDir },
  });
}

test('§CLI: fresh activation via the real subprocess exits 0 and installs for real', () => {
  const { dir, originDir } = makeSourceRepo({ testsPass: true });
  const hooksDir = makeHooksDir();
  const result = runCliSubprocess(dir, hooksDir);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(hooksDir, 'pr-status-active.json')));
  cleanup(dir, originDir, hooksDir);
});

test('§CLI: a stale-remote failure through the real subprocess maps to exit 1 with a clear stderr message', () => {
  const { dir, originDir } = makeSourceRepo();
  advanceOriginBehindOurBack(originDir);
  const hooksDir = makeHooksDir();
  const result = runCliSubprocess(dir, hooksDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /STALE_CANONICAL_MAIN/);
  cleanup(dir, originDir, hooksDir);
});

test('§CLI: an unknown flag through the real subprocess maps to exit 2 (usage error), not 1', () => {
  const { dir, originDir } = makeSourceRepo();
  const hooksDir = makeHooksDir();
  const result = runCliSubprocess(dir, hooksDir, ['--bogus-flag']);
  assert.equal(result.status, 2);
  cleanup(dir, originDir, hooksDir);
});

test('§CLI: without the test override, the subprocess falls back to DEFAULT_HOOKS_DIR (verified by argument, not by touching it)', () => {
  // Never actually run this against the real hooksDir — just prove the
  // fallback wiring by inspecting the exported default, matching what the
  // require.main block uses when PR_STATUS_HOOKS_DIR_TEST_OVERRIDE is unset.
  assert.equal(installer.DEFAULT_HOOKS_DIR, path.join(os.homedir(), '.claude', 'hooks'));
});

// ==================================================== misc small units
test('looksLikeOurLauncher: recognises the markers, rejects arbitrary content', () => {
  assert.equal(installer.looksLikeOurLauncher(FIXTURE_LAUNCHER_OK), true);
  assert.equal(installer.looksLikeOurLauncher('#!/usr/bin/env node\nconsole.log(1);\n'), false);
  assert.equal(installer.looksLikeOurLauncher(null), false);
  assert.equal(installer.looksLikeOurLauncher(undefined), false);
});

test('makePaths: derives every path from the given hooksDir and defaults sanely', () => {
  const customDir = path.join(os.tmpdir(), 'xyz-hooks-dir-probe');
  const custom = installer.makePaths(customDir);
  assert.equal(custom.hooksDir, customDir);
  assert.ok(custom.bundlesDir.startsWith(customDir));
  assert.ok(custom.activeManifest.startsWith(customDir));
  const def = installer.makePaths();
  assert.equal(def.hooksDir, installer.DEFAULT_HOOKS_DIR);
});
