'use strict';
/**
 * GOV-COORD-V2 safety kernel — safe isolated worktree lifecycle.
 *
 * Contract: governance-orchestration-contract-v2.md §6 (shared common-dir gate)
 * Repo law: AGENTS.md (implementation worktree gate, cleanup prohibitions)
 *           project/docs/runbooks/worktree-cleanup.md
 *
 * This module encodes rules that already bind every agent in this repository:
 *
 *   - No implementation inside the canonical project root.
 *   - Isolated worktrees are created from a freshly resolved origin/main.
 *   - Every worktree must share the one Git common directory.
 *   - Owner WIP (.worktrees/, .claude/, .codex/ and grandfathered exact paths)
 *     is never mutated, stashed, reset or removed.
 *   - Cleanup NEVER begins with a generic recursive delete. Removal is
 *     `git worktree remove --force` then `git worktree prune`, and a residual
 *     directory is reported as ORPHANED_WORKTREE_DIR for the owner — never
 *     deleted by this code.
 *
 * A reparse point (Windows junction/symlink) inside a worktree can chain to
 * the canonical root's live node_modules, so the walk below never descends
 * into one.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OWNER_WIP_PREFIXES = ['.worktrees/', '.claude/', '.codex/'];
const RESIDUAL_MARKERS = [
  'directory not empty',
  'result too large',
  'contains modified or untracked files',
];

class WorktreeError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'WorktreeError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new WorktreeError(code, detail);
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function gitTry(args, cwd) {
  try {
    return { ok: true, stdout: git(args, cwd) };
  } catch (err) {
    return {
      ok: false,
      status: typeof err.status === 'number' ? err.status : null,
      stderr: String((err.stderr || '') + (err.stdout || '')),
    };
  }
}

function norm(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Canonicalize a filesystem path for comparison.
 *
 * Required on Windows: `os.tmpdir()` and other APIs can hand back 8.3 short
 * names (`C:/Users/ULASTE~1/...`) while `git worktree list` reports the long
 * form, and drive/segment casing can differ between the two. Comparing raw
 * strings silently mismatches, which would make a registered worktree look
 * unregistered. realpath resolves short names and on-disk casing; for a path
 * that does not exist yet we canonicalize the deepest existing ancestor and
 * re-append the remainder.
 */
function canonicalPath(p) {
  const n = norm(p);
  if (!n) return n;
  try {
    return norm(fs.realpathSync.native(n));
  } catch (e) {
    const parent = norm(path.dirname(n));
    const base = path.basename(n);
    if (!parent || parent === n) return n;
    return norm(path.join(canonicalPath(parent), base));
  }
}

/** Parse `git worktree list --porcelain` into structured records. */
function listWorktrees(cwd) {
  const out = git(['worktree', 'list', '--porcelain'], cwd);
  const records = [];
  let cur = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (cur) records.push(cur);
      cur = { path: canonicalPath(line.slice('worktree '.length)), branch: null, head: null, detached: false, bare: false };
    } else if (!cur) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      cur.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
    } else if (line === 'detached') {
      cur.detached = true;
    } else if (line === 'bare') {
      cur.bare = true;
    }
  }
  if (cur) records.push(cur);
  return records;
}

function resolveCommonDir(cwd) {
  const out = gitTry(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  if (!out.ok) fail('COMMON_DIR_UNRESOLVED', out.stderr.trim());
  return canonicalPath(out.stdout.trim());
}

/** The canonical root is the first (main) worktree of the common directory. */
function resolveCanonicalRoot(cwd) {
  const wts = listWorktrees(cwd);
  if (!wts.length) fail('CANONICAL_ROOT_UNRESOLVED', 'no worktrees listed');
  return wts[0].path;
}

/**
 * AGENTS.md implementation gate: refuse to treat the canonical root as an
 * implementation workspace.
 */
function assertNotCanonicalRootForEdit(cwd) {
  const top = gitTry(['rev-parse', '--show-toplevel'], cwd);
  const here = canonicalPath((top.stdout || '').trim() || cwd);
  const canonical = resolveCanonicalRoot(cwd);
  if (here === canonical) {
    fail('CANONICAL_ROOT_EDIT_FORBIDDEN', here);
  }
  return { here, canonical };
}

function isOwnerWipPath(relPath) {
  const p = norm(relPath);
  return OWNER_WIP_PREFIXES.some((pref) => p === pref.slice(0, -1) || p.startsWith(pref));
}

/**
 * Bounded reparse-point scan. Never descends into a reparse point, so a
 * junction can never be followed out of the worktree.
 */
function findReparsePoints(root, maxDepth) {
  const limit = maxDepth == null ? 3 : maxDepth;
  const found = [];
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      let st;
      try {
        st = fs.lstatSync(full);
      } catch (e) {
        continue;
      }
      if (st.isSymbolicLink()) {
        let target = null;
        try {
          target = fs.readlinkSync(full);
        } catch (e) {
          target = '(unreadable)';
        }
        found.push({ path: norm(full), target: canonicalPath(target) });
        continue; // never descend
      }
      if (ent.isDirectory() && depth < limit) walk(full, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

/** Capture the canonical invariants that cleanup must not disturb. */
function snapshotCanonicalIntegrity(cwd) {
  const canonical = resolveCanonicalRoot(cwd);
  const status = gitTry(['status', '--porcelain'], canonical);
  const untracked = (status.stdout || '')
    .split(/\r?\n/)
    .filter((l) => l.startsWith('??'))
    .map((l) => norm(l.slice(3)))
    .sort();
  const configOk = gitTry(['config', '--list'], canonical);
  const binCounts = {};
  for (const rel of ['node_modules/.bin', 'project/apps/api/node_modules/.bin', 'project/apps/web/node_modules/.bin']) {
    let n = 0;
    try {
      n = fs.readdirSync(path.join(canonical, rel)).length;
    } catch (e) {
      n = 0;
    }
    binCounts[rel] = n;
  }
  return {
    canonicalRoot: canonical,
    commonDir: resolveCommonDir(canonical),
    head: gitTry(['rev-parse', 'HEAD'], canonical).stdout.trim(),
    branch: (gitTry(['branch', '--show-current'], canonical).stdout || '').trim(),
    trackedDirty: (status.stdout || '')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('??')).length,
    untrackedOwnerWip: untracked,
    configParses: configOk.ok,
    configEntries: configOk.ok ? configOk.stdout.split(/\r?\n/).filter(Boolean).length : 0,
    worktreeCount: listWorktrees(canonical).length,
    binCounts: binCounts,
  };
}

/** Compare two snapshots; any regression is a hard failure signal. */
function diffIntegrity(before, after) {
  const problems = [];
  if (!after.configParses) problems.push('CONFIG_UNPARSEABLE');
  if (after.canonicalRoot !== before.canonicalRoot) problems.push('CANONICAL_ROOT_CHANGED');
  if (after.commonDir !== before.commonDir) problems.push('COMMON_DIR_CHANGED');
  if (after.head !== before.head) problems.push('CANONICAL_HEAD_MOVED');
  if (after.branch !== before.branch) problems.push('CANONICAL_BRANCH_CHANGED');
  if (after.trackedDirty !== before.trackedDirty) problems.push('CANONICAL_TRACKED_TREE_CHANGED');
  for (const w of before.untrackedOwnerWip) {
    if (!after.untrackedOwnerWip.includes(w)) problems.push('OWNER_WIP_LOST:' + w);
  }
  for (const k of Object.keys(before.binCounts)) {
    if (after.binCounts[k] < before.binCounts[k]) problems.push('BIN_SHRANK:' + k);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Create an isolated worktree from a freshly resolved base ref.
 * Refuses to reuse an existing path or an already-checked-out branch.
 */
function createIsolated(opts) {
  const cwd = opts.cwd || process.cwd();
  const targetPath = canonicalPath(opts.path);
  const branch = String(opts.branch);
  const baseRef = opts.baseRef || 'origin/main';
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]{2,120}$/.test(branch)) fail('BRANCH_NAME_INVALID', branch);

  const canonical = resolveCanonicalRoot(cwd);
  if (targetPath === canonical) fail('TARGET_IS_CANONICAL_ROOT', targetPath);
  if (canonical.startsWith(targetPath + '/')) fail('TARGET_CONTAINS_CANONICAL_ROOT', targetPath);
  if (isOwnerWipPath(path.relative(canonical, targetPath).replace(/\\/g, '/'))) {
    fail('TARGET_INSIDE_OWNER_WIP', targetPath);
  }
  if (fs.existsSync(targetPath)) fail('TARGET_PATH_EXISTS', targetPath);
  if (listWorktrees(cwd).some((w) => w.branch === branch)) {
    fail('BRANCH_ALREADY_CHECKED_OUT', branch);
  }

  const baseSha = gitTry(['rev-parse', '--verify', baseRef], cwd);
  if (!baseSha.ok) fail('BASE_REF_UNRESOLVED', baseRef);
  const pinnedBase = baseSha.stdout.trim();

  const add = gitTry(['worktree', 'add', targetPath, pinnedBase, '-b', branch], cwd);
  if (!add.ok) fail('WORKTREE_ADD_FAILED', add.stderr.trim());

  const sharedCommonDir = resolveCommonDir(targetPath);
  const canonicalCommonDir = resolveCommonDir(canonical);
  if (sharedCommonDir !== canonicalCommonDir) {
    fail('COMMON_DIR_MISMATCH', sharedCommonDir + ' != ' + canonicalCommonDir);
  }

  return {
    path: targetPath,
    branch: branch,
    baseRef: baseRef,
    pinnedBaseSha: pinnedBase,
    commonDir: sharedCommonDir,
    reparsePoints: findReparsePoints(targetPath, 2),
  };
}

/**
 * Remove a worktree safely. Verification precedes any removal, and no
 * physical recursive delete is ever performed by this function.
 *
 * Returns { disposition: 'REMOVED' | 'ORPHANED_WORKTREE_DIR', ... }.
 */
function removeSafe(opts) {
  const cwd = opts.cwd || process.cwd();
  const targetPath = canonicalPath(opts.path);
  const canonical = resolveCanonicalRoot(cwd);

  // --- pre-removal verification (contract + AGENTS.md) --------------------
  if (targetPath === canonical) fail('REFUSE_REMOVE_CANONICAL_ROOT', targetPath);
  if (canonical.startsWith(targetPath + '/')) fail('REFUSE_REMOVE_CANONICAL_PARENT', targetPath);
  const rel = path.relative(canonical, targetPath).replace(/\\/g, '/');
  if (isOwnerWipPath(rel)) fail('REFUSE_REMOVE_OWNER_WIP', targetPath);

  const registered = listWorktrees(cwd).find((w) => w.path === targetPath);
  if (!registered) fail('WORKTREE_NOT_REGISTERED', targetPath);
  if (registered.bare) fail('REFUSE_REMOVE_BARE', targetPath);

  const wtCommonDir = fs.existsSync(targetPath) ? resolveCommonDir(targetPath) : null;
  const canonicalCommonDir = resolveCommonDir(canonical);
  if (wtCommonDir && wtCommonDir !== canonicalCommonDir) {
    fail('COMMON_DIR_MISMATCH', String(wtCommonDir) + ' != ' + canonicalCommonDir);
  }

  const reparse = fs.existsSync(targetPath) ? findReparsePoints(targetPath, 2) : [];
  const escaping = reparse.filter((r) => {
    const t = r.target;
    return t.startsWith(canonical + '/') || t === canonical;
  });
  if (escaping.length && opts.allowEscapingReparse !== true) {
    fail(
      'REPARSE_POINT_ESCAPES_TO_CANONICAL',
      escaping.map((r) => r.path + ' -> ' + r.target).join(', '),
    );
  }

  const before = snapshotCanonicalIntegrity(cwd);

  // --- removal: git only, never a filesystem recursive delete ------------
  const rm = gitTry(['worktree', 'remove', '--force', targetPath], canonical);
  const prune = gitTry(['worktree', 'prune'], canonical);

  const after = snapshotCanonicalIntegrity(cwd);
  const integrity = diffIntegrity(before, after);

  let disposition;
  if (rm.ok && !fs.existsSync(targetPath)) {
    disposition = 'REMOVED';
  } else {
    const msg = (rm.stderr || '').toLowerCase();
    const residual = RESIDUAL_MARKERS.some((m) => msg.includes(m)) || fs.existsSync(targetPath);
    if (!residual) fail('WORKTREE_REMOVE_FAILED', rm.stderr.trim());
    // Leave it for the owner. Physical deletion is prohibited.
    disposition = 'ORPHANED_WORKTREE_DIR';
  }

  return {
    disposition,
    path: targetPath,
    stillRegistered: listWorktrees(cwd).some((w) => w.path === targetPath),
    pruneOk: prune.ok,
    reparsePoints: reparse,
    integrity,
    removeStderr: rm.ok ? null : rm.stderr.trim(),
  };
}

module.exports = {
  OWNER_WIP_PREFIXES,
  WorktreeError,
  canonicalPath,
  listWorktrees,
  resolveCommonDir,
  resolveCanonicalRoot,
  assertNotCanonicalRootForEdit,
  isOwnerWipPath,
  findReparsePoints,
  snapshotCanonicalIntegrity,
  diffIntegrity,
  createIsolated,
  removeSafe,
};
