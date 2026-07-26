'use strict';
/**
 * GOV-COORD-V2 runtime — ciProvider backed by the gh CLI.
 *
 * §5.1 defines the effective required set as a runtime union of three sources
 * rather than a list pinned in the contract, because the check set on this
 * repository is demonstrably not stable between runs — during T3/T4 it went
 * from three checks to four and then to eight, and branch protection went from
 * one required check to two. A pinned list would have silently under-required.
 *
 *   platformRequired    branch protection's required contexts, read live
 *   governanceRequired  checks governance insists on regardless of platform
 *   taskSpecRequired    caller-supplied; task.schema.json has no field for it,
 *                       so it comes from the run configuration, not the plan
 *
 * observe() returns the shape evaluateCi expects: {name, status, conclusion},
 * where anything not COMPLETED/SUCCESS fails closed — including a check that is
 * required but absent, which is the case a naive "all green" reading misses.
 */

const { spawnSync } = require('child_process');

class CiProviderError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.code = code;
    this.detail = detail || null;
  }
}

function gh(args, cwd) {
  const r = spawnSync('gh', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    return { ok: false, out: (r.stderr || r.stdout || '').trim() };
  }
  return { ok: true, out: (r.stdout || '').trim() };
}

/**
 * @param {object} cfg
 * @param {string} cfg.repoCwd
 * @param {string} [cfg.targetBranch]        branch whose protection is read
 * @param {string[]} [cfg.governanceRequired] governance-mandated check names
 * @param {string[]} [cfg.taskSpecRequired]   run-configured check names
 * @param {function} [cfg.ghRunner]           injection point for tests
 */
function createGhCiProvider(cfg) {
  const repoCwd = cfg.repoCwd;
  const targetBranch = cfg.targetBranch || 'main';
  const runGh = cfg.ghRunner || gh;

  return {
    async requiredSources() {
      // Branch protection is queried live. A repository without protection, or
      // a token lacking admin scope, yields an empty platform set — which is
      // reported as empty rather than silently treated as "nothing required",
      // because the union still has to carry the governance set.
      let platformRequired = [];
      const r = runGh(
        ['api', 'repos/{owner}/{repo}/branches/' + targetBranch + '/protection/required_status_checks',
          '--jq', '.contexts // []'],
        repoCwd,
      );
      if (r.ok && r.out) {
        try {
          const parsed = JSON.parse(r.out);
          if (Array.isArray(parsed)) platformRequired = parsed.map(String);
        } catch (e) {
          throw new CiProviderError('PROTECTION_UNPARSEABLE', r.out.slice(0, 200));
        }
      }
      return {
        platformRequired: platformRequired,
        governanceRequired: (cfg.governanceRequired || []).map(String),
        taskSpecRequired: (cfg.taskSpecRequired || []).map(String),
      };
    },

    async observe(args) {
      const n = String(args.pr.number);
      const r = runGh(['pr', 'view', n, '--json', 'statusCheckRollup'], repoCwd);
      if (!r.ok) throw new CiProviderError('ROLLUP_QUERY_FAILED', r.out.slice(-300));
      let parsed;
      try {
        parsed = JSON.parse(r.out);
      } catch (e) {
        throw new CiProviderError('ROLLUP_UNPARSEABLE', r.out.slice(0, 200));
      }
      const rollup = (parsed && parsed.statusCheckRollup) || [];
      return rollup.map((c) => ({
        // CheckRun exposes `name`; the older commit-status shape exposes
        // `context`. Both appear in this repository's rollup.
        name: c.name || c.context || '',
        // A check with no conclusion yet is still running. Reporting it as
        // COMPLETED with a null conclusion would let a pending check pass the
        // status test and fail only on the conclusion test — same verdict, but
        // a misleading reason. PENDING is the honest label.
        status: c.conclusion ? 'COMPLETED' : 'PENDING',
        conclusion: c.conclusion || null,
      }));
    },
  };
}

module.exports = { createGhCiProvider, CiProviderError };
