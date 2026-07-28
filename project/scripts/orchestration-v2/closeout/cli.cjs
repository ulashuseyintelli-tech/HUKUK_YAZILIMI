'use strict';

/**
 * `pnpm orch:closeout` — task-bound owner-authorized PR closeout.
 *
 * Bu komut owner authority URETMEZ. Owner'in belirli bir task/PR icin verdigi
 * merge authority'yi input olarak alir, deterministik gate'leri dogrular ve
 * mekanik kapanisi yurutur. Authority yoksa veya bir gate PASS degilse hicbir
 * mutation yapmaz.
 *
 * Kullanim:
 *   pnpm orch:closeout \
 *     --task-id GOV-EXAMPLE-R01 \
 *     --pr 1234 \
 *     --expected-head <40-hex-sha> \
 *     --authority-type EX_ANTE_GO_COMPLETE \
 *     --authority-ref "owner directive 2026-07-28 GO-COMPLETE #1234" \
 *     --allowed-paths AGENTS.md,CLAUDE.md \
 *     --branch claude/example-r01 \
 *     --worktree C:/Development/HUKUK_YAZILIMI/HY_example \
 *     [--required-checks "Web Tests (vitest),Architectural Guardrails"] \
 *     [--dry-run] [--json]
 *
 * --dry-run hicbir mutation yapmaz; yalniz gate'leri degerlendirir ve
 * DRY_RUN_ELIGIBLE veya BLOCKED doner.
 *
 * Cikis kodu: 0 = CLOSED veya DRY_RUN_ELIGIBLE, 1 = BLOCKED veya
 * MERGED_CLEANUP_BLOCKED.
 */

const path = require('node:path');
const { closeoutPr, formatReport } = require('./closeout.cjs');
const { createGhCloseoutAdapter } = require('./gh-adapter.cjs');

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'dry-run' || key === 'json') {
      o[key] = true;
      continue;
    }
    o[key] = argv[i + 1];
    i += 1;
  }
  return o;
}

function list(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main(argv) {
  const a = parseArgs(argv);
  const repoCwd = a['repo-cwd'] ? path.resolve(a['repo-cwd']) : path.resolve(__dirname, '..', '..', '..', '..');

  const input = {
    taskId: a['task-id'],
    pr: a.pr != null ? Number(a.pr) : NaN,
    expectedHead: a['expected-head'],
    authorityType: a['authority-type'],
    authorityRef: a['authority-ref'],
    allowedPaths: list(a['allowed-paths']),
    requiredChecks: list(a['required-checks']),
    governanceRequiredChecks: list(a['governance-required-checks']),
    branch: a.branch || null,
    worktree: a.worktree ? path.resolve(a.worktree) : null,
    targetBranch: a['target-branch'] || 'main',
    repository: a.repository || null,
    expectedMergeSha: a['expected-merge-sha'] || null,
    dryRun: a['dry-run'] === true,
  };

  const adapter = createGhCloseoutAdapter({
    repoCwd,
    targetBranch: input.targetBranch,
    ledgerPath: a['ledger'] ? path.resolve(a['ledger']) : null,
  });

  const result = await closeoutPr(input, adapter);

  if (a.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write(formatReport(result) + '\n');

  const ok = result.status === 'CLOSED' || result.status === 'DRY_RUN_ELIGIBLE';
  process.exitCode = ok ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write('CLOSEOUT_FATAL: ' + String((e && e.message) || e) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
