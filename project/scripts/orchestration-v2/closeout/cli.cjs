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
const crypto = require('node:crypto');
const fs = require('node:fs');
const { closeoutPr, formatReport } = require('./closeout.cjs');
const { createGhCloseoutAdapter } = require('./gh-adapter.cjs');
const { materializeMergeAuthority } = require('./merge-authority-ledger.cjs');
const { assertOutsideWorktree } = require('./merge-authority-ledger.cjs');

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'dry-run' || key === 'json' || key === 'materialize-ledger') {
      o[key] = true;
      continue;
    }
    o[key] = argv[i + 1];
    i += 1;
  }
  return o;
}

function authorityRef(args, prefix) {
  const kind = args[prefix + '-kind'];
  const recordPath = args[prefix + '-path'];
  const recordId = args[prefix + '-record-id'];
  const evidenceSha = args[prefix + '-evidence-sha'];
  if (![kind, recordPath, recordId, evidenceSha].some(Boolean)) return null;
  return { kind, path: recordPath, recordId, evidenceSha };
}

function writeResultFile(resultPath, result, worktreePath) {
  if (!resultPath) return;
  assertOutsideWorktree(resultPath, worktreePath, 'result-file');
  const target = path.resolve(resultPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  try {
    fs.writeFileSync(temp, JSON.stringify(result, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    JSON.parse(fs.readFileSync(temp, 'utf8'));
    fs.renameSync(temp, target);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
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
    programId: a['program-id'] || null,
    taskId: a['task-id'],
    pr: a.pr != null ? Number(a.pr) : NaN,
    expectedHead: a['expected-head'],
    authorityType: a['authority-type'],
    authorityRef: a['authority-ref'],
    semanticAuthorityRef: authorityRef(a, 'semantic-authority'),
    executionGrantRef: authorityRef(a, 'execution-grant'),
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

  if (a['materialize-ledger'] === true) {
    const materialized = await materializeMergeAuthority({
      programId: input.programId,
      taskId: input.taskId,
      semanticAuthorityRef: input.semanticAuthorityRef,
      executionGrantRef: input.executionGrantRef,
      repository: input.repository,
      baseBranch: input.targetBranch,
      taskBranch: input.branch,
      prNumber: input.pr,
      expectedBase: a['expected-base'],
      expectedHead: input.expectedHead,
      allowedPaths: input.allowedPaths.length ? input.allowedPaths : null,
      requiredChecks: input.requiredChecks,
      mergeMethod: String(a['merge-method'] || 'SQUASH').toUpperCase(),
      issuedBy: a['issued-by'] || null,
      ledgerPath: a.ledger ? path.resolve(a.ledger) : null,
      worktreePath: input.worktree,
    }, adapter);
    writeResultFile(a['result-file'], materialized, input.worktree);
    process.stdout.write(JSON.stringify(materialized, null, 2) + '\n');
    return materialized;
  }

  if (input.dryRun && a['result-file']) {
    throw new Error('DRY_RUN_RESULT_FILE_FORBIDDEN: dry-run performs no filesystem mutation');
  }

  const result = await closeoutPr(input, adapter);
  writeResultFile(a['result-file'], result, input.worktree);

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

module.exports = { authorityRef, main, parseArgs, writeResultFile };
