'use strict';

/**
 * GOV-TASK-REVISION-EXIT-GATE-R01 — final disposition guard.
 *
 * Bir gorev sirasinda implementation design, test design veya base revision
 * superseded oldugunda ajan gorevi serbest metinle "BLOCKED — HANDOFF REQUIRED"
 * diyerek birakabiliyordu. Bu bir state gecisi degil, sadece rapor cumlesiydi:
 * orchestrator state machine'inde HANDOFF_REQUIRED diye bir state YOKTUR
 * (state.cjs: DECLARED..CANCELLED, 14 state). Yani kacis noktasi state model
 * degil, kapanisin serbest metin olmasiydi.
 *
 * Bu guard final mesaji okur ve gecersiz bir terminal disposition ile kapanmayi
 * reddeder. Metin tabanli oldugu icin HEM orchestrator uzerinden yuruyen HEM DE
 * dogrudan owner directive ile yuruyen task'lari kapsar — ikincisinin state
 * store kaydi yoktur, dolayisiyla state-model tabanli bir enforcement onlari
 * yakalayamaz.
 *
 * Guard authority URETMEZ ve gercek owner handoff'unu engellemez: owner karari
 * gerektiren bir handoff `BLOCKED_OWNER_DECISION` ile birlikte raporlanir.
 *
 * Cagrildigi yerler:
 * - CLI: node scripts/governance/task-disposition-guard.cjs check --file <mesaj>
 * - apps/api/src/common/__tests__/task-disposition-guard.spec.ts
 * - apps/web/src/__tests__/task-disposition-invariants.test.ts (REQUIRED)
 */

const fs = require('node:fs');

/**
 * Tek basina terminal kapanis olarak KABUL EDILMEZ. Bunlar ara execution
 * event'i, revision nedeni veya next-action'dir; gorevin bittigini gostermez.
 */
const INVALID_TERMINAL = Object.freeze([
  'HANDOFF_REQUIRED',
  'SUPERSEDED',
  'DESIGN_CHANGED',
  'IMPLEMENTATION_CHANGED',
  'TEST_DESIGN_CHANGED',
  'NEWER_CONTRACT_EXISTS',
  'NEEDS_REEVALUATION',
  'BASE_DRIFT',
  'CI_RUNNING',
  'PR_OPEN',
  'NEXT_TASK_PENDING',
  'REVISION_REQUIRED',
]);

/** Gecerli terminal disposition sinifları. */
const VALID_TERMINAL = Object.freeze([
  'COMPLETED',
  'CLOSED',
  'CANCELLED_BY_OWNER',
  'BLOCKED_EXTERNAL',
  'BLOCKED_OWNER_DECISION',
  'BLOCKED_CANONICAL_CONFLICT',
  'BLOCKED_SECURITY_RISK',
  'BLOCKED_DATA_LOSS_RISK',
  'BLOCKED_AUTHORITY_MISSING',
  'BLOCKED_UNRESOLVED_TECHNICAL_RISK',
]);

/** Bir BLOCKED_* kapanisinin tasimak zorunda oldugu alanlar. */
const BLOCKED_REQUIRED_FIELDS = Object.freeze([
  { key: 'blockerCode', pattern: /blocker\s*code|blockerCode|EXACT BLOCKER/i },
  { key: 'blockingLayer', pattern: /blocking\s*layer|blockingLayer|blocked layer/i },
  { key: 'evidence', pattern: /evidence|kanit/i },
  { key: 'whyNotRevision', pattern: /revision|revizyon/i },
  { key: 'requiredAction', pattern: /required (owner|external) action|owner (action|karar)|sonraki adim|next (eligible )?action/i },
  { key: 'preservedWip', pattern: /preserved wip|wip (korun|preserved)|worktree (korun|preserved)/i },
]);

const VIOLATION = Object.freeze({
  INVALID_TERMINAL_DISPOSITION: 'INVALID_TERMINAL_DISPOSITION',
  BLOCKED_MISSING_FIELDS: 'BLOCKED_MISSING_FIELDS',
  NO_TERMINAL_DISPOSITION: 'NO_TERMINAL_DISPOSITION',
});

/** Kod blogu ve alintilar kural metni degildir; kapanis iddiasi orada aranmaz. */
function stripFenced(text) {
  return String(text == null ? '' : text).replace(/```[\s\S]*?```/g, ' ');
}

/**
 * Bir token'i "kapanis iddiasi" olarak arar. Kelime siniri kullanilir ki
 * `PR_OPEN` gibi bir token `PR_OPENED_BY` icinde yanlislikla eslesmesin.
 */
function mentions(text, token) {
  return new RegExp('(^|[^A-Z_])' + token + '([^A-Z_]|$)').test(text);
}

function foundTokens(text, list) {
  return list.filter((t) => mentions(text, t));
}

/**
 * Final mesaji dogrular.
 *
 * Kural: gecersiz bir terminal ifade TEK BASINA kapanis olamaz. Gecerli bir
 * terminal disposition da varsa, gecersiz ifade next-action / revision nedeni
 * olarak okunur ve kabul edilir.
 *
 * @param {string} message final mesaj metni
 * @param {{requireTerminal?: boolean}} [opts] requireTerminal: hic terminal
 *        disposition yoksa da ihlal say (varsayilan false — her mesaj bir task
 *        kapanisi degildir)
 */
function validateFinalMessage(message, opts) {
  const text = stripFenced(message);
  const options = opts || {};
  const violations = [];

  const invalid = foundTokens(text, INVALID_TERMINAL);
  const valid = foundTokens(text, VALID_TERMINAL);

  if (invalid.length > 0 && valid.length === 0) {
    violations.push({
      code: VIOLATION.INVALID_TERMINAL_DISPOSITION,
      tokens: invalid,
      detail:
        invalid.join(', ') +
        ' tek basina terminal kapanis degildir. Task identity ve semantic outcome ' +
        'degismediyse is DURMAZ: WIP korunur, diff yeniden degerlendirilir ve ayni ' +
        'task altinda yeni revision ile devam edilir.',
    });
  }

  if (options.requireTerminal === true && valid.length === 0 && invalid.length === 0) {
    violations.push({
      code: VIOLATION.NO_TERMINAL_DISPOSITION,
      tokens: [],
      detail: 'gecerli bir terminal disposition bildirilmedi',
    });
  }

  const blocked = valid.filter((v) => v.startsWith('BLOCKED_'));
  for (const b of blocked) {
    const missing = BLOCKED_REQUIRED_FIELDS.filter((f) => !f.pattern.test(text)).map((f) => f.key);
    if (missing.length > 0) {
      violations.push({
        code: VIOLATION.BLOCKED_MISSING_FIELDS,
        tokens: [b],
        detail: b + ' kapanisi su alanlari tasimiyor: ' + missing.join(', '),
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    terminalFound: valid,
    invalidFound: invalid,
  };
}

function formatReport(result) {
  if (result.valid) {
    return 'TASK_DISPOSITION_OK' + (result.terminalFound.length ? ' — ' + result.terminalFound.join(', ') : '');
  }
  const lines = ['TASK_DISPOSITION_REJECTED'];
  for (const v of result.violations) lines.push('  [' + v.code + '] ' + v.detail);
  lines.push('');
  lines.push('Gecerli terminal disposition sinifları:');
  lines.push('  ' + VALID_TERMINAL.join(' · '));
  return lines.join('\n');
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  if (args[0] !== 'check') {
    process.stderr.write('usage: task-disposition-guard.cjs check --file <path> [--require-terminal]\n');
    process.exitCode = 1;
    return;
  }
  const fileIdx = args.indexOf('--file');
  if (fileIdx === -1 || !args[fileIdx + 1]) {
    process.stderr.write('--file is required\n');
    process.exitCode = 1;
    return;
  }
  let text = '';
  try {
    text = fs.readFileSync(args[fileIdx + 1], 'utf8');
  } catch (e) {
    process.stderr.write('cannot read message file\n');
    process.exitCode = 1;
    return;
  }
  const result = validateFinalMessage(text, { requireTerminal: args.includes('--require-terminal') });
  process.stdout.write(formatReport(result) + '\n');
  process.exitCode = result.valid ? 0 : 1;
}

module.exports = {
  BLOCKED_REQUIRED_FIELDS,
  INVALID_TERMINAL,
  VALID_TERMINAL,
  VIOLATION,
  formatReport,
  main,
  mentions,
  validateFinalMessage,
};

if (require.main === module) {
  main();
}
