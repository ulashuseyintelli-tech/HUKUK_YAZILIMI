'use strict';
/**
 * GOV-COORD-V2 runtime — environment preparation adapter.
 *
 * Mirrors what CI does before any test runs (ci.yml: pnpm install
 * --frozen-lockfile, then prisma generate, both from the `project` workspace
 * root). A fresh orchestrator worktree has neither, because node_modules is
 * gitignored and `git worktree add` does not carry it.
 *
 * Two properties this adapter must hold, because runTask calls it after the
 * boundary verdict is frozen:
 *
 *   1. It must not write a tracked file. --frozen-lockfile cannot rewrite
 *      pnpm-lock.yaml — it errors instead — and prisma generate writes only
 *      under node_modules because schema.prisma declares no custom output.
 *   2. It must fail closed. A partially prepared tree would surface later as a
 *      confusing REQUIRED_TEST_FAILED rather than as what it is.
 *
 * Verified against this repository rather than assumed: no workspace
 * package.json declares preinstall/postinstall/prepare, so `pnpm install`
 * cannot run repository-authored scripts that touch tracked paths.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { safeSpawn } = require('./spawn-mode.cjs');

/** Commands, in order. cwd is relative to the worktree root. */
const STEPS = [
  { cwd: 'project', argv: ['pnpm', 'install', '--frozen-lockfile'], timeoutMs: 1800000 },
  { cwd: 'project', argv: ['pnpm', '--filter', '@hukuk/api', 'exec', 'prisma', 'generate'], timeoutMs: 600000 },
];

/**
 * Paths preparation is permitted to create or modify. Anything a step writes
 * outside these is a defect in the step, and the caller can assert on it.
 */
const EXPECTED_WRITE_PREFIXES = ['project/node_modules/', 'project/apps/api/node_modules/'];

/**
 * @param {object} opts
 * @param {string} opts.worktreePath  absolute path to the isolated worktree
 * @param {function} [opts.runner]    injection point for tests; defaults to spawnSync
 * @param {Array} [opts.steps]        override STEPS (tests only)
 * @returns {{ok: boolean, steps: Array, detail: (string|null)}}
 */
function prepareEnvironment(opts) {
  const worktreePath = opts && opts.worktreePath;
  if (!worktreePath) return { ok: false, steps: [], detail: 'worktreePath required' };
  const steps = opts.steps || STEPS;
  const run =
    opts.runner ||
    ((argv, cwd, timeoutMs) =>
      // The shell decision belongs to the resolved file, not to the platform.
      // Where pnpm is a .cmd shim it genuinely needs a shell (CVE-2024-27980
      // makes Node refuse a .cmd with shell:false); where it is a .exe — as it
      // is under Volta — a shell would hand cmd.exe an argv it re-splits.
      safeSpawn(spawnSync, argv[0], argv.slice(1), {
        cwd,
        encoding: 'utf8',
        timeout: timeoutMs,
      }));

  const results = [];
  for (const step of steps) {
    const cwd = step.cwd ? path.join(worktreePath, step.cwd) : worktreePath;
    const r = run(step.argv, cwd, step.timeoutMs);
    const status = r && typeof r.status === 'number' ? r.status : null;
    results.push({ argv: step.argv.slice(), cwd: step.cwd || '.', status: status });
    if (status !== 0) {
      const why = ((r && r.stderr) || (r && r.stdout) || (r && r.error && r.error.message) || '').slice(-400);
      return {
        ok: false,
        steps: results,
        detail: step.argv.join(' ') + ' exit=' + String(status) + (why ? ' :: ' + why.trim() : ''),
      };
    }
  }
  return { ok: true, steps: results, detail: null };
}

module.exports = { prepareEnvironment, STEPS, EXPECTED_WRITE_PREFIXES };
