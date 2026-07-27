'use strict';

/**
 * Instruction policy guard.
 *
 * AGENTS.md ve CLAUDE.md uzerindeki DETERMINISTIK kurallari zorlar. Metinde
 * yorum gerektiren semantic hukumler AGENTS.md'de kalir; yalniz makine tarafindan
 * kesin dogrulanabilen kurallar buraya tasinir.
 *
 * Bilerek KAPSAM DISI (CI bir PR artifact'indan dogrulayamaz; bunlar developer
 * workstation policy'sidir ve AGENTS.md'de metin olarak kalir):
 *   - canonical root'ta edit yasagi
 *   - isolated worktree zorunlulugu
 *   - canonical equality (main == origin/main)
 *
 * Cagrildigi yerler:
 * - apps/api/src/common/__tests__/instruction-policy.spec.ts -> guard davranis testleri
 *   (CI baglantisi: apps/api/ci-manifests/pure/platform-scripts-shared.txt)
 * - CLI: node scripts/instruction-policy.cjs verify [--head-ref <ref>] [--changed-paths a,b]
 */

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PROJECT_ROOT, '..');

/** AGENTS.md bakim hedefi. Asilmasi WARN uretir, merge'i engellemez. */
const AGENTS_TARGET_BYTES = 17000;
/** AGENTS.md + CLAUDE.md hard ceiling. Yalniz acik owner amendment ile degistirilir. */
const COMBINED_CEILING_BYTES = 20000;

const INSTRUCTION_FILES = Object.freeze(['AGENTS.md', 'CLAUDE.md']);
const CONTROL_PLANE_PREFIXES = Object.freeze(['.github/workflows/']);

const BRANCH_PREFIX_PATTERN = /^(claude|codex)\/[a-z0-9][a-z0-9._-]*$/;
const BRANCH_EXEMPT_PATTERN = /^(main|master|gh-pages|dependabot\/|revert-|release\/)/;

/** Bu uzunlugun altindaki ortak cumleler duplicate sayilmaz (baslik, kisa ibare). */
const DUPLICATE_MIN_LENGTH = 40;

class InstructionPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InstructionPolicyError';
    this.code = code;
  }
}

function normalizeContent(text) {
  return String(text).replace(/\r\n/g, '\n');
}

function normalizedBytes(text) {
  return Buffer.byteLength(normalizeContent(text), 'utf8');
}

function normalizedWords(text) {
  const trimmed = normalizeContent(text).trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Fenced kod bloklarini cikarir; ornek yollar ve sablonlar kural metni degildir. */
function stripFencedBlocks(text) {
  return normalizeContent(text).replace(/^```[\s\S]*?^```/gm, '');
}

function readInstructionFiles(root = REPO_ROOT) {
  const files = {};
  for (const name of INSTRUCTION_FILES) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) {
      throw new InstructionPolicyError(
        'INSTRUCTION_FILE_MISSING',
        `${name} not found under ${root}`,
      );
    }
    files[name] = fs.readFileSync(full, 'utf8');
  }
  return files;
}

function measure(files) {
  const perFile = {};
  let combined = 0;
  for (const [name, text] of Object.entries(files)) {
    const bytes = normalizedBytes(text);
    perFile[name] = { bytes, words: normalizedWords(text) };
    combined += bytes;
  }
  return { perFile, combinedBytes: combined };
}

function checkSize(measurement) {
  const violations = [];
  const agents = measurement.perFile['AGENTS.md'];
  if (agents && agents.bytes > AGENTS_TARGET_BYTES) {
    violations.push({
      code: 'SIZE_TARGET_EXCEEDED',
      severity: 'warn',
      message: `AGENTS.md ${agents.bytes} > maintenance target ${AGENTS_TARGET_BYTES} normalized bytes`,
    });
  }
  if (measurement.combinedBytes > COMBINED_CEILING_BYTES) {
    violations.push({
      code: 'SIZE_CEILING_EXCEEDED',
      severity: 'error',
      message:
        `combined ${measurement.combinedBytes} > hard ceiling ${COMBINED_CEILING_BYTES} ` +
        'normalized bytes; requires explicit owner amendment',
    });
  }
  return violations;
}

/** Metinde gecen repository-local dosya yollarini toplar. */
function extractRepoPaths(text) {
  const body = stripFencedBlocks(text);
  const matches = body.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.(?:md|json|cjs|js|ts|yml)/g) || [];
  return [...new Set(matches.filter((candidate) => !candidate.includes('<')))];
}

function checkReferences(files, root = REPO_ROOT) {
  const violations = [];
  for (const [name, text] of Object.entries(files)) {
    for (const candidate of extractRepoPaths(text)) {
      if (!fs.existsSync(path.join(root, candidate))) {
        violations.push({
          code: 'REFERENCE_MISSING',
          severity: 'error',
          message: `${name} references ${candidate} which does not exist`,
        });
      }
    }
  }
  return violations;
}

function maxSectionNumber(text) {
  const headings = normalizeContent(text).match(/^## (\d+)\./gm) || [];
  return headings.reduce((max, heading) => {
    const value = Number(heading.replace(/[^\d]/g, ''));
    return value > max ? value : max;
  }, 0);
}

function checkSectionRefs(files) {
  const violations = [];
  for (const [name, text] of Object.entries(files)) {
    if (name !== 'AGENTS.md') continue;
    const max = maxSectionNumber(text);
    const refs = [...new Set(normalizeContent(text).match(/§\d+/g) || [])];
    for (const ref of refs) {
      const value = Number(ref.slice(1));
      if (value < 1 || value > max) {
        violations.push({
          code: 'SECTION_REF_BROKEN',
          severity: 'error',
          message: `${name} references ${ref} but the file defines sections 1..${max}`,
        });
      }
    }
  }
  return violations;
}

/** Normatif cumleleri kanonik forma indirger; bicimsel fark duplicate'i gizlemesin. */
function normativeSentences(text) {
  return stripFencedBlocks(text)
    .split('\n')
    .filter((line) => !line.startsWith('#') && !line.startsWith('|'))
    .join(' ')
    .split(/(?<=[.:;])\s+/)
    .map((sentence) =>
      sentence
        .replace(/[`*_]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase(),
    )
    .filter((sentence) => sentence.length >= DUPLICATE_MIN_LENGTH);
}

/** TEK CANONICAL HOME: supplement, baseline'daki normatif cumleyi tekrar edemez. */
function checkDuplicates(files) {
  const baseline = normativeSentences(files['AGENTS.md'] || '');
  const supplement = normativeSentences(files['CLAUDE.md'] || '');
  const baselineSet = new Set(baseline);
  const violations = [];
  for (const sentence of new Set(supplement)) {
    if (baselineSet.has(sentence)) {
      violations.push({
        code: 'DUPLICATE_NORMATIVE_RULE',
        severity: 'error',
        message: `CLAUDE.md repeats an AGENTS.md rule verbatim: "${sentence.slice(0, 80)}"`,
      });
    }
  }
  return violations;
}

function checkBranchPrefix(headRef) {
  if (!headRef) return [];
  if (BRANCH_EXEMPT_PATTERN.test(headRef)) return [];
  if (BRANCH_PREFIX_PATTERN.test(headRef)) return [];
  return [
    {
      code: 'BRANCH_PREFIX_INVALID',
      severity: 'error',
      message: `branch ${headRef} does not match <ajan>/<konu> (claude/… or codex/…)`,
    },
  ];
}

/** Instruction yuzeyi ile CI control-plane ayni PR'da degistirilemez. */
function checkChangedPathScope(changedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) return [];
  const touchesInstructions = changedPaths.some((p) => INSTRUCTION_FILES.includes(p));
  if (!touchesInstructions) return [];
  const controlPlane = changedPaths.filter((p) =>
    CONTROL_PLANE_PREFIXES.some((prefix) => p.startsWith(prefix)),
  );
  if (controlPlane.length === 0) return [];
  return [
    {
      code: 'INSTRUCTION_CONTROL_PLANE_MIX',
      severity: 'error',
      message: `instruction change may not also modify control-plane paths: ${controlPlane.join(', ')}`,
    },
  ];
}

function verifyInstructions(options = {}) {
  const root = options.root || REPO_ROOT;
  const files = options.files || readInstructionFiles(root);
  const measurement = measure(files);
  const violations = [
    ...checkSize(measurement),
    ...checkReferences(files, root),
    ...checkSectionRefs(files),
    ...checkDuplicates(files),
    ...checkBranchPrefix(options.headRef),
    ...checkChangedPathScope(options.changedPaths),
  ];
  return {
    measurement,
    violations,
    errors: violations.filter((v) => v.severity === 'error'),
    warnings: violations.filter((v) => v.severity === 'warn'),
  };
}

function formatReport(result) {
  const lines = [];
  for (const [name, stats] of Object.entries(result.measurement.perFile)) {
    lines.push(`  ${name}: ${stats.bytes} normalized bytes, ${stats.words} words`);
  }
  lines.push(
    `  combined: ${result.measurement.combinedBytes} / ${COMBINED_CEILING_BYTES} normalized bytes`,
  );
  for (const violation of result.violations) {
    lines.push(`  [${violation.severity.toUpperCase()}] ${violation.code}: ${violation.message}`);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--head-ref') options.headRef = argv[i + 1];
    if (arg === '--changed-paths') {
      options.changedPaths = String(argv[i + 1] || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    }
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command !== 'verify') {
    process.stderr.write('usage: instruction-policy.cjs verify [--head-ref <ref>] [--changed-paths a,b]\n');
    process.exitCode = 1;
    return;
  }
  const result = verifyInstructions(parseArgs(rest));
  process.stdout.write(`${formatReport(result)}\n`);
  if (result.errors.length > 0) {
    process.stdout.write('INSTRUCTION_POLICY_FAIL\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('INSTRUCTION_POLICY_PASS\n');
}

module.exports = {
  AGENTS_TARGET_BYTES,
  COMBINED_CEILING_BYTES,
  CONTROL_PLANE_PREFIXES,
  DUPLICATE_MIN_LENGTH,
  INSTRUCTION_FILES,
  InstructionPolicyError,
  REPO_ROOT,
  checkBranchPrefix,
  checkChangedPathScope,
  checkDuplicates,
  checkReferences,
  checkSectionRefs,
  checkSize,
  extractRepoPaths,
  formatReport,
  main,
  maxSectionNumber,
  measure,
  normalizeContent,
  normalizedBytes,
  normalizedWords,
  normativeSentences,
  readInstructionFiles,
  verifyInstructions,
};

if (require.main === module) {
  main();
}
