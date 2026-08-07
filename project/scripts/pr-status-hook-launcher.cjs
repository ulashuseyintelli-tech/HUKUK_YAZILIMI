#!/usr/bin/env node
'use strict';

/**
 * REPOSITORY-WIDE-MERGE-FLOW-REMEDIATION-R01 — PR-A remediation
 *
 * The installed entry point (`~/.claude/hooks/open-pr-guard.cjs`). This file
 * is deliberately as small as it can be:
 *
 *   1. read the active-bundle pointer
 *   2. resolve the bundle directory it names
 *   3. verify the bundle's taxonomy + adapter against the pointer's recorded
 *      hashes
 *   4. require() the adapter — only after verification passes
 *   5. hand it the hook's stdin payload, print what it returns, exit with
 *      its decision
 *
 * No `gh` call, no state file, no disposition token, no classification rule
 * lives here. All of that is the adapter's job (bundled, hash-verified,
 * updated only by a pointer swap). This file changes only across an
 * owner-approved protocol migration (see PROTOCOL_VERSION below) — routine
 * taxonomy or adapter updates never touch it.
 *
 * Fail-closed on an integrity problem (missing pointer, missing bundle,
 * hash mismatch): the stop is BLOCKED with a diagnostic, not silently
 * allowed — an unverifiable classifier is not the same as an absent one.
 * Fail-OPEN only on a plain "nothing installed yet" (NOT_ACTIVATED) or a
 * non-repository / gh-less environment, exactly as the adapter itself
 * already decides for those cases once it does load.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Bumped only by an owner-approved migration. The installer refuses to
// activate a bundle whose pointer format this launcher does not understand.
const PROTOCOL_VERSION = 1;

const HOOKS_DIR = path.join(os.homedir(), '.claude', 'hooks');
const ACTIVE_MANIFEST = path.join(HOOKS_DIR, 'pr-status-active.json');
const BUNDLES_DIR = path.join(HOOKS_DIR, 'pr-status-bundles');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * @returns {{ok:true, adapter:object}|{ok:false, reason:string, notActivated?:boolean}}
 */
function loadActiveAdapter(env) {
  const activeManifestPath = (env && env.activeManifestPath) || ACTIVE_MANIFEST;
  const bundlesDir = (env && env.bundlesDir) || BUNDLES_DIR;

  let active;
  try {
    active = JSON.parse(fs.readFileSync(activeManifestPath, 'utf8'));
  } catch {
    return { ok: false, notActivated: true, reason: 'NOT_ACTIVATED: run project/scripts/install-pr-status-hook.cjs first' };
  }

  if (typeof active.protocolVersion !== 'number') {
    return { ok: false, reason: 'ACTIVE_MANIFEST_MALFORMED: missing protocolVersion' };
  }
  if (active.protocolVersion > PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: `PROTOCOL_VERSION_MISMATCH: active manifest requires protocol ${active.protocolVersion}, `
        + `this launcher understands up to ${PROTOCOL_VERSION} — upgrade the launcher via an `
        + 'owner-approved migration before this pointer can be used',
    };
  }
  if (!active.activeCommit || !/^[0-9a-f]{40}$/.test(active.activeCommit)) {
    return { ok: false, reason: 'ACTIVE_MANIFEST_MALFORMED: activeCommit is not a valid commit SHA' };
  }
  if (!active.hashes || typeof active.hashes.taxonomy !== 'string' || typeof active.hashes.adapter !== 'string') {
    return { ok: false, reason: 'ACTIVE_MANIFEST_MALFORMED: missing taxonomy/adapter hash record' };
  }

  const bundleDir = path.join(bundlesDir, active.activeCommit);
  let taxonomySrc;
  let adapterSrc;
  try {
    taxonomySrc = fs.readFileSync(path.join(bundleDir, 'pr-status-taxonomy.cjs'), 'utf8');
    adapterSrc = fs.readFileSync(path.join(bundleDir, 'pr-status-hook-adapter.cjs'), 'utf8');
  } catch {
    return { ok: false, reason: `BUNDLE_MISSING: active bundle ${active.activeCommit} not found on disk at ${bundleDir}` };
  }

  if (sha256(taxonomySrc) !== active.hashes.taxonomy) {
    return { ok: false, reason: 'HASH_MISMATCH: installed taxonomy does not match the active manifest — tamper or corruption' };
  }
  if (sha256(adapterSrc) !== active.hashes.adapter) {
    return { ok: false, reason: 'HASH_MISMATCH: installed adapter does not match the active manifest — tamper or corruption' };
  }

  // require() only after both hashes are confirmed to match the pointer we
  // just read. The adapter module loads its own taxonomy sibling the same
  // way (require(path.join(__dirname, 'pr-status-taxonomy.cjs'))), so this is
  // the one and only place a bundle's code is ever brought into this process.
  let adapter;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    adapter = require(path.join(bundleDir, 'pr-status-hook-adapter.cjs'));
    if (typeof adapter.run !== 'function') throw new Error('adapter.run is not a function');
  } catch (e) {
    return { ok: false, reason: `ADAPTER_UNLOADABLE: ${(e && e.message) || e}` };
  }

  return { ok: true, adapter };
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

/**
 * @returns {number} the process exit code the caller should use
 */
function main(env) {
  const loaded = loadActiveAdapter(env);
  if (!loaded.ok) {
    if (loaded.notActivated) {
      // Nothing installed is not a tamper signal — degrade the way the
      // pre-PR-A hook degraded when it had nothing to check.
      return 0;
    }
    // Any other integrity problem is fail-closed: block rather than guess.
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: `PR_STATUS_HOOK_INTEGRITY: ${loaded.reason}\n\n`
        + 'Bir tur kapanisi bu tespit edilemeyen siniflandiriciyla kabul edilmiyor. '
        + 'Onarim: node project/scripts/install-pr-status-hook.cjs --repair-from-canonical-main',
    }));
    return 0;
  }

  const raw = readStdin();
  let payload = {};
  try { payload = JSON.parse(raw); } catch { return 0; }

  let result;
  try {
    result = loaded.adapter.run(payload);
  } catch (e) {
    // The adapter crashing is not the same integrity class as a hash
    // mismatch — it is the adapter's own bug, not a tamper signal on this
    // process's trust chain. Fail open rather than strand every session on
    // an unrelated repository until it is fixed.
    process.stderr.write(`PR_STATUS_HOOK_ADAPTER_ERROR: ${(e && e.message) || e}\n`);
    return 0;
  }

  if (result && result.decision === 'block') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason || '' }));
    return 0;
  }
  if (result && result.notice) {
    try { process.stderr.write(result.notice + '\n'); } catch { /* ignore */ }
  }
  return 0;
}

module.exports = {
  PROTOCOL_VERSION,
  HOOKS_DIR,
  ACTIVE_MANIFEST,
  BUNDLES_DIR,
  sha256,
  loadActiveAdapter,
  main,
};

if (require.main === module) {
  process.exit(main());
}
