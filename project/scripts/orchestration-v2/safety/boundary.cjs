'use strict';
/**
 * GOV-COORD-V2 safety kernel — actual-diff boundary validator.
 *
 * Contract: governance-orchestration-contract-v2.md §1 (profile policy), §8 (diff security)
 *
 * BOUNDED_CODE_TASK validates a *permitted change boundary*, not an expected
 * exact final content. The boundary is a task-specific POSITIVE allowlist:
 * anything outside the global denylist is NOT automatically permitted, and an
 * empty allowlist permits nothing (contract §1 — inverting V1's
 * deniedTargetPrefixes is explicitly forbidden).
 *
 * Path comparison runs over canonical Git paths from NUL-delimited plumbing
 * output. A filesystem glob check alone is insufficient (contract §8).
 */

const { execFileSync } = require('child_process');

const CHANGE_CLASSES = [
  'ADD',
  'MODIFY',
  'DELETE',
  'RENAME',
  'COPY',
  'TYPE_CHANGE',
  'SYMLINK',
  'GITLINK',
  'BINARY',
  'MODE_CHANGE',
  'UNTRACKED',
];

const MODE_SYMLINK = '120000';
const MODE_GITLINK = '160000';

class BoundaryError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'BoundaryError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new BoundaryError(code, detail);
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function splitNul(text) {
  const parts = String(text).split('\0');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/**
 * Reject anything that is not a canonical, relative, forward-slash Git path.
 * Backslashes, absolute paths, drive letters, '..' traversal, empty segments
 * and NUL/control characters are all fail-closed.
 */
function normalizeRepoPath(raw, label) {
  const p = String(raw);
  if (p.length === 0) fail('PATH_EMPTY', label);
  if (p.length > 400) fail('PATH_TOO_LONG', p.slice(0, 60) + '...');
  if (p.indexOf('\\') !== -1) fail('PATH_BACKSLASH', p);
  if (/^[A-Za-z]:/.test(p)) fail('PATH_ABSOLUTE', p);
  if (p.startsWith('/')) fail('PATH_ABSOLUTE', p);
  if (/[\x00-\x1f\x7f]/.test(p)) fail('PATH_CONTROL_CHAR', p);
  const segs = p.split('/');
  for (const s of segs) {
    if (s === '') fail('PATH_EMPTY_SEGMENT', p);
    if (s === '.' || s === '..') fail('PATH_TRAVERSAL', p);
  }
  return p;
}

function normalizeRoot(raw) {
  let r = String(raw);
  if (r.length === 0) fail('ROOT_EMPTY', 'boundary root');
  if (!r.endsWith('/')) r += '/';
  // Validate the body with the same rules as a path.
  normalizeRepoPath(r.slice(0, -1), 'boundary root');
  return r;
}

function underAnyRoot(path, roots) {
  return roots.some((r) => path === r.slice(0, -1) || path.startsWith(r));
}

/** Glob support limited to a trailing '**' plus literal prefixes. */
function matchesForbidden(path, patterns) {
  for (const raw of patterns) {
    const pat = String(raw).replace(/\\/g, '/');
    if (pat.endsWith('/**')) {
      const base = pat.slice(0, -3);
      if (path === base || path.startsWith(base + '/')) return pat;
      continue;
    }
    if (pat.endsWith('*')) {
      const base = pat.slice(0, -1);
      if (path.startsWith(base)) return pat;
      continue;
    }
    if (pat.endsWith('/')) {
      if (path.startsWith(pat)) return pat;
      continue;
    }
    if (path === pat) return pat;
    if (path.startsWith(pat + '/')) return pat;
  }
  return null;
}

/**
 * Extract change entries between two revisions using NUL-delimited plumbing.
 * `git diff --raw -z` carries modes and status; `--numstat -z` identifies
 * binary content; `ls-files --others` surfaces untracked files.
 */
function extractChanges(opts) {
  const cwd = opts.cwd || process.cwd();
  const range = opts.head ? [opts.base, opts.head] : [opts.base];
  const raw = git(['diff', '--raw', '-z', '-M', '-C', '--no-color'].concat(range), cwd);
  const fields = splitNul(raw);

  const changes = [];
  let i = 0;
  while (i < fields.length) {
    const meta = fields[i];
    if (!meta.startsWith(':')) {
      // Defensive: unexpected stream shape must not be silently skipped.
      fail('DIFF_STREAM_UNEXPECTED', meta.slice(0, 40));
    }
    // :srcMode dstMode srcSha dstSha status
    const parts = meta.slice(1).split(/\s+/);
    if (parts.length < 5) fail('DIFF_STREAM_UNEXPECTED', meta.slice(0, 40));
    const srcMode = parts[0];
    const dstMode = parts[1];
    const status = parts[4];
    const letter = status[0];
    const takesTwoPaths = letter === 'R' || letter === 'C';
    const pathA = fields[i + 1];
    const pathB = takesTwoPaths ? fields[i + 2] : null;
    i += takesTwoPaths ? 3 : 2;

    const entry = {
      status: status,
      srcMode: srcMode,
      dstMode: dstMode,
      path: normalizeRepoPath(takesTwoPaths ? pathB : pathA, 'diff path'),
      originalPath: takesTwoPaths ? normalizeRepoPath(pathA, 'diff source path') : null,
      classes: [],
    };

    if (letter === 'A') entry.classes.push('ADD');
    else if (letter === 'M') entry.classes.push('MODIFY');
    else if (letter === 'D') entry.classes.push('DELETE');
    else if (letter === 'R') entry.classes.push('RENAME');
    else if (letter === 'C') entry.classes.push('COPY');
    else if (letter === 'T') entry.classes.push('TYPE_CHANGE');
    else fail('DIFF_STATUS_UNSUPPORTED', status);

    if (srcMode === MODE_SYMLINK || dstMode === MODE_SYMLINK) entry.classes.push('SYMLINK');
    if (srcMode === MODE_GITLINK || dstMode === MODE_GITLINK) entry.classes.push('GITLINK');
    if (
      srcMode !== '000000' &&
      dstMode !== '000000' &&
      srcMode !== dstMode &&
      !entry.classes.includes('TYPE_CHANGE')
    ) {
      entry.classes.push('MODE_CHANGE');
    }
    changes.push(entry);
  }

  // Binary detection: numstat prints '-' '-' for binary blobs.
  const numstat = splitNul(git(['diff', '--numstat', '-z', '-M', '-C'].concat(range), cwd));
  const binary = new Set();
  let j = 0;
  while (j < numstat.length) {
    const rec = numstat[j];
    const m = /^(\S+)\t(\S+)\t([\s\S]*)$/.exec(rec);
    if (!m) {
      j += 1;
      continue;
    }
    const isBin = m[1] === '-' && m[2] === '-';
    if (m[3] === '') {
      // Rename/copy form: paths follow as two separate NUL fields.
      const to = numstat[j + 2];
      if (isBin && to) binary.add(to.replace(/\\/g, '/'));
      j += 3;
    } else {
      if (isBin) binary.add(m[3].replace(/\\/g, '/'));
      j += 1;
    }
  }
  for (const c of changes) {
    if (binary.has(c.path)) c.classes.push('BINARY');
  }

  if (opts.includeUntracked !== false) {
    const others = splitNul(
      git(['ls-files', '--others', '--exclude-standard', '-z'], cwd),
    );
    for (const p of others) {
      changes.push({
        status: '?',
        srcMode: '000000',
        dstMode: '000000',
        path: normalizeRepoPath(p, 'untracked path'),
        originalPath: null,
        classes: ['UNTRACKED'],
      });
    }
  }

  for (const c of changes) {
    for (const k of c.classes) {
      if (!CHANGE_CLASSES.includes(k)) fail('CHANGE_CLASS_UNKNOWN', k);
    }
  }
  return changes;
}

/**
 * Validate a change set against a permitted boundary. Fail-closed: the first
 * violation short-circuits into a rejection with an explicit reason.
 *
 * `allowedRoots` is a positive allowlist. An empty allowlist permits nothing.
 * `forbidden` is the immutable global denylist and can never be overridden by
 * a task (contract §1).
 */
function validate(opts) {
  const changes = opts.changes || [];
  const roots = (opts.allowedRoots || []).map(normalizeRoot);
  const forbidden = opts.forbidden || [];
  const violations = [];

  const note = (code, change, detail) =>
    violations.push({
      code: code,
      path: change ? change.path : null,
      originalPath: change ? change.originalPath : null,
      classes: change ? change.classes.slice() : [],
      detail: detail || null,
    });

  for (const c of changes) {
    // Untracked files are never part of a validated diff.
    if (c.classes.includes('UNTRACKED')) {
      note('UNTRACKED_FILE_PRESENT', c);
      continue;
    }

    // Structural classes that require an explicit, separate owner decision.
    if (c.classes.includes('SYMLINK')) note('SYMLINK_CHANGE_FORBIDDEN', c);
    if (c.classes.includes('GITLINK')) note('GITLINK_CHANGE_FORBIDDEN', c);
    if (c.classes.includes('TYPE_CHANGE')) note('TYPE_CHANGE_FORBIDDEN', c);
    if (c.classes.includes('MODE_CHANGE')) note('MODE_CHANGE_FORBIDDEN', c);

    const targets = [c.path];
    if (c.originalPath) targets.push(c.originalPath);

    for (const t of targets) {
      const hit = matchesForbidden(t, forbidden);
      if (hit) note('FORBIDDEN_PATH_TOUCHED', c, t + ' matches ' + hit);
      if (!underAnyRoot(t, roots)) note('OUTSIDE_PERMITTED_BOUNDARY', c, t);
    }

    // A rename that differs only by case is not a safe move on a
    // case-insensitive filesystem; it must never pass silently.
    if (
      c.originalPath &&
      c.originalPath !== c.path &&
      c.originalPath.toLowerCase() === c.path.toLowerCase()
    ) {
      note('CASE_ONLY_RENAME_FORBIDDEN', c, c.originalPath + ' -> ' + c.path);
    }

    if (opts.allowBinary !== true && c.classes.includes('BINARY')) {
      note('BINARY_CHANGE_FORBIDDEN', c);
    }
  }

  if (opts.maxChangedFiles != null && changes.length > opts.maxChangedFiles) {
    violations.push({
      code: 'MAX_CHANGED_FILES_EXCEEDED',
      path: null,
      originalPath: null,
      classes: [],
      detail: changes.length + ' > ' + opts.maxChangedFiles,
    });
  }

  return {
    withinBoundary: violations.length === 0,
    forbiddenPathsUntouched: !violations.some((v) => v.code === 'FORBIDDEN_PATH_TOUCHED'),
    violations: violations,
    changeCount: changes.length,
  };
}

module.exports = {
  // Exported so callers can ask the SAME question the validator asks. A second
  // implementation of "is this path inside an authorized root" would drift, and
  // the drift would be invisible until something outside a root was staged.
  normalizeRoot,
  underAnyRoot,
  CHANGE_CLASSES,
  BoundaryError,
  normalizeRepoPath,
  normalizeRoot,
  matchesForbidden,
  underAnyRoot,
  extractChanges,
  validate,
};
