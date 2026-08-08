'use strict';
/**
 * Real production-entry tests for pr-status-hook-launcher.cjs — the thin
 * entry point installed as ~/.claude/hooks/open-pr-guard.cjs.
 *
 * Every test builds its own throwaway hooks-dir layout and passes it via the
 * `env` override, so nothing here touches the real ~/.claude/hooks/.
 */
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const launcher = require('./pr-status-hook-launcher.cjs');

function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

function makeHooksDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-status-launcher-'));
  return dir;
}

function writeBundle(hooksDir, commit, taxonomySrc, adapterSrc) {
  const bundleDir = path.join(hooksDir, 'pr-status-bundles', commit);
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'pr-status-taxonomy.cjs'), taxonomySrc, 'utf8');
  fs.writeFileSync(path.join(bundleDir, 'pr-status-hook-adapter.cjs'), adapterSrc, 'utf8');
  return bundleDir;
}

function writeActive(hooksDir, obj) {
  const p = path.join(hooksDir, 'pr-status-active.json');
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
  return p;
}

const FAKE_COMMIT = 'a'.repeat(40);
const WORKING_ADAPTER = `
module.exports = { run: (payload) => ({ decision: 'allow' }) };
`;
const BLOCKING_ADAPTER = `
module.exports = { run: (payload) => ({ decision: 'block', reason: 'test-block' }) };
`;
const CRASHING_ADAPTER = `
module.exports = { run: (payload) => { throw new Error('boom'); } };
`;
const FAKE_TAXONOMY = `module.exports = { TOKEN_NAMES: [] };\n`;

test('NOT_ACTIVATED (no pointer at all) degrades to allow (exit 0, silent)', () => {
  const hooksDir = makeHooksDir();
  const env = { activeManifestPath: path.join(hooksDir, 'pr-status-active.json'), bundlesDir: path.join(hooksDir, 'pr-status-bundles') };
  const loaded = launcher.loadActiveAdapter(env);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.notActivated, true);
  fs.rmSync(hooksDir, { recursive: true, force: true });
});

test('valid pointer + valid bundle loads the adapter and delegates', () => {
  const hooksDir = makeHooksDir();
  const bundleDir = writeBundle(hooksDir, FAKE_COMMIT, FAKE_TAXONOMY, WORKING_ADAPTER);
  writeActive(hooksDir, {
    schemaVersion: 1, protocolVersion: 1, activeCommit: FAKE_COMMIT,
    hashes: { taxonomy: sha256(FAKE_TAXONOMY), adapter: sha256(WORKING_ADAPTER) },
    previousCommit: null,
  });
  const env = { activeManifestPath: path.join(hooksDir, 'pr-status-active.json'), bundlesDir: path.join(hooksDir, 'pr-status-bundles') };
  const loaded = launcher.loadActiveAdapter(env);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.adapter.run({}).decision, 'allow');
  fs.rmSync(hooksDir, { recursive: true, force: true });
  void bundleDir;
});

test('tampered bundle (hash mismatch) is fail-closed, not silently trusted', () => {
  const hooksDir = makeHooksDir();
  writeBundle(hooksDir, FAKE_COMMIT, FAKE_TAXONOMY, WORKING_ADAPTER);
  writeActive(hooksDir, {
    schemaVersion: 1, protocolVersion: 1, activeCommit: FAKE_COMMIT,
    hashes: { taxonomy: sha256(FAKE_TAXONOMY), adapter: sha256(WORKING_ADAPTER) },
    previousCommit: null,
  });
  // Tamper AFTER the pointer was written — this is exactly the LOCAL_DRIFT /
  // tamper scenario, detected here by the launcher itself, independently of
  // the installer's own drift check.
  fs.writeFileSync(path.join(hooksDir, 'pr-status-bundles', FAKE_COMMIT, 'pr-status-hook-adapter.cjs'), BLOCKING_ADAPTER, 'utf8');
  const env = { activeManifestPath: path.join(hooksDir, 'pr-status-active.json'), bundlesDir: path.join(hooksDir, 'pr-status-bundles') };
  const loaded = launcher.loadActiveAdapter(env);
  assert.equal(loaded.ok, false);
  assert.match(loaded.reason, /HASH_MISMATCH/);
  fs.rmSync(hooksDir, { recursive: true, force: true });
});

test('bundle directory missing entirely is fail-closed', () => {
  const hooksDir = makeHooksDir();
  writeActive(hooksDir, {
    schemaVersion: 1, protocolVersion: 1, activeCommit: FAKE_COMMIT,
    hashes: { taxonomy: sha256(FAKE_TAXONOMY), adapter: sha256(WORKING_ADAPTER) },
    previousCommit: null,
  });
  const env = { activeManifestPath: path.join(hooksDir, 'pr-status-active.json'), bundlesDir: path.join(hooksDir, 'pr-status-bundles') };
  const loaded = launcher.loadActiveAdapter(env);
  assert.equal(loaded.ok, false);
  assert.match(loaded.reason, /BUNDLE_MISSING/);
  fs.rmSync(hooksDir, { recursive: true, force: true });
});

test('malformed active.json (missing hashes) is fail-closed', () => {
  const hooksDir = makeHooksDir();
  writeBundle(hooksDir, FAKE_COMMIT, FAKE_TAXONOMY, WORKING_ADAPTER);
  writeActive(hooksDir, { schemaVersion: 1, protocolVersion: 1, activeCommit: FAKE_COMMIT });
  const env = { activeManifestPath: path.join(hooksDir, 'pr-status-active.json'), bundlesDir: path.join(hooksDir, 'pr-status-bundles') };
  const loaded = launcher.loadActiveAdapter(env);
  assert.equal(loaded.ok, false);
  assert.match(loaded.reason, /ACTIVE_MANIFEST_MALFORMED/);
  fs.rmSync(hooksDir, { recursive: true, force: true });
});

test('a pointer requiring a newer protocol than this launcher understands is refused, not guessed at', () => {
  const hooksDir = makeHooksDir();
  writeBundle(hooksDir, FAKE_COMMIT, FAKE_TAXONOMY, WORKING_ADAPTER);
  writeActive(hooksDir, {
    schemaVersion: 1, protocolVersion: 999, activeCommit: FAKE_COMMIT,
    hashes: { taxonomy: sha256(FAKE_TAXONOMY), adapter: sha256(WORKING_ADAPTER) },
    previousCommit: null,
  });
  const env = { activeManifestPath: path.join(hooksDir, 'pr-status-active.json'), bundlesDir: path.join(hooksDir, 'pr-status-bundles') };
  const loaded = launcher.loadActiveAdapter(env);
  assert.equal(loaded.ok, false);
  assert.match(loaded.reason, /PROTOCOL_VERSION_MISMATCH/);
  fs.rmSync(hooksDir, { recursive: true, force: true });
});

// ------------------------------------------------ full-process invocations
function runLauncherProcess(hooksDir, stdinPayload) {
  return spawnSync(process.execPath, ['-e', `
    const launcher = require(${JSON.stringify(path.join(__dirname, 'pr-status-hook-launcher.cjs'))});
    process.exit(launcher.main({
      activeManifestPath: ${JSON.stringify(path.join(hooksDir, 'pr-status-active.json'))},
      bundlesDir: ${JSON.stringify(path.join(hooksDir, 'pr-status-bundles'))},
    }));
  `], { input: stdinPayload, encoding: 'utf8' });
}

test('full process: NOT_ACTIVATED prints nothing and exits 0', () => {
  const hooksDir = makeHooksDir();
  const result = runLauncherProcess(hooksDir, '{}');
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
  fs.rmSync(hooksDir, { recursive: true, force: true });
});

test('full process: hash mismatch exits 0 but prints a block decision (fail-closed content, not a crash)', () => {
  const hooksDir = makeHooksDir();
  writeBundle(hooksDir, FAKE_COMMIT, FAKE_TAXONOMY, WORKING_ADAPTER);
  writeActive(hooksDir, {
    schemaVersion: 1, protocolVersion: 1, activeCommit: FAKE_COMMIT,
    hashes: { taxonomy: sha256(FAKE_TAXONOMY), adapter: 'deadbeef'.repeat(8) },
    previousCommit: null,
  });
  const result = runLauncherProcess(hooksDir, '{}');
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.decision, 'block');
  assert.match(parsed.reason, /HASH_MISMATCH/);
  fs.rmSync(hooksDir, { recursive: true, force: true });
});

test('full process: a crashing adapter fails OPEN (its own bug is not a trust-chain problem)', () => {
  const hooksDir = makeHooksDir();
  writeBundle(hooksDir, FAKE_COMMIT, FAKE_TAXONOMY, CRASHING_ADAPTER);
  writeActive(hooksDir, {
    schemaVersion: 1, protocolVersion: 1, activeCommit: FAKE_COMMIT,
    hashes: { taxonomy: sha256(FAKE_TAXONOMY), adapter: sha256(CRASHING_ADAPTER) },
    previousCommit: null,
  });
  const result = runLauncherProcess(hooksDir, '{}');
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
  assert.match(result.stderr, /PR_STATUS_HOOK_ADAPTER_ERROR/);
  fs.rmSync(hooksDir, { recursive: true, force: true });
});

test('full process: a blocking adapter decision is passed through verbatim', () => {
  const hooksDir = makeHooksDir();
  writeBundle(hooksDir, FAKE_COMMIT, FAKE_TAXONOMY, BLOCKING_ADAPTER);
  writeActive(hooksDir, {
    schemaVersion: 1, protocolVersion: 1, activeCommit: FAKE_COMMIT,
    hashes: { taxonomy: sha256(FAKE_TAXONOMY), adapter: sha256(BLOCKING_ADAPTER) },
    previousCommit: null,
  });
  const result = runLauncherProcess(hooksDir, '{}');
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.decision, 'block');
  assert.equal(parsed.reason, 'test-block');
  fs.rmSync(hooksDir, { recursive: true, force: true });
});
