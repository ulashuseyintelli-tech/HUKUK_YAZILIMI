'use strict';

/**
 * Instruction policy guard testleri.
 *
 * Bu dosya governance-coordination.test.cjs tarafindan require edilir; boylece
 * CI'daki mevcut `node --test scripts/governance-coordination.test.cjs` adimi
 * bu testleri de kosar ve ci.yml'e yeni bir step eklemek gerekmez.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const policy = require('./instruction-policy.cjs');

const REPO_ROOT = policy.REPO_ROOT;

function fixtureRoot(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instr-policy-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

// ------------------------------------------------------------ normalization

test('instruction policy normalizes CRLF before measuring', () => {
  assert.equal(policy.normalizedBytes('a\r\nb'), policy.normalizedBytes('a\nb'));
  assert.equal(policy.normalizedBytes('a\r\nb'), 3);
});

test('instruction policy counts words on normalized content', () => {
  assert.equal(policy.normalizedWords('bir\r\niki  uc'), 3);
  assert.equal(policy.normalizedWords('   '), 0);
});

// -------------------------------------------------------------------- size

test('combined hard ceiling is an error, AGENTS target is only a warning', () => {
  const overTarget = 'x'.repeat(policy.AGENTS_TARGET_BYTES + 10);
  const withinCeiling = policy.verifyInstructions({
    root: fixtureRoot({ 'AGENTS.md': overTarget, 'CLAUDE.md': 'y' }),
  });
  assert.equal(withinCeiling.errors.length, 0, 'target overflow alone must not fail the build');
  assert.equal(withinCeiling.warnings[0].code, 'SIZE_TARGET_EXCEEDED');

  const overCeiling = policy.verifyInstructions({
    root: fixtureRoot({
      'AGENTS.md': 'x'.repeat(policy.COMBINED_CEILING_BYTES),
      'CLAUDE.md': 'y'.repeat(200),
    }),
  });
  assert.ok(overCeiling.errors.some((v) => v.code === 'SIZE_CEILING_EXCEEDED'));
});

// -------------------------------------------------------------- references

test('missing repository-local reference is rejected', () => {
  const root = fixtureRoot({
    'AGENTS.md': 'Bkz. project/docs/governance/YOK-BOYLE-BIR-BELGE.md dosyasi.',
    'CLAUDE.md': 'delta',
  });
  const result = policy.verifyInstructions({ root });
  const violation = result.errors.find((v) => v.code === 'REFERENCE_MISSING');
  assert.ok(violation, 'a dangling governance reference must fail');
  assert.match(violation.message, /YOK-BOYLE-BIR-BELGE\.md/);
});

test('placeholder paths inside fenced blocks are not treated as references', () => {
  const root = fixtureRoot({
    'AGENTS.md': ['metin', '```text', 'git worktree add ../HY_<konu> origin/main', '```'].join('\n'),
    'CLAUDE.md': 'delta',
  });
  assert.equal(policy.verifyInstructions({ root }).errors.length, 0);
});

// ---------------------------------------------------------- section refs

test('section reference beyond the last defined section is rejected', () => {
  const root = fixtureRoot({
    'AGENTS.md': ['## 1. Bir', 'metin', '## 2. Iki', 'bkz. §9 kurali gecerlidir.'].join('\n'),
    'CLAUDE.md': 'delta',
  });
  const result = policy.verifyInstructions({ root });
  assert.ok(result.errors.some((v) => v.code === 'SECTION_REF_BROKEN'));
});

test('maxSectionNumber reads the highest numbered heading', () => {
  assert.equal(policy.maxSectionNumber('## 1. a\n## 14. b\n## 7. c'), 14);
});

// ----------------------------------------------------------- duplicates

test('supplement repeating a baseline rule verbatim is rejected', () => {
  const rule = 'Commit, push, merge veya branch silme yalniz kullanici acikca yetki verdiginde yapilir.';
  const root = fixtureRoot({
    'AGENTS.md': `## 1. Kurallar\n${rule}`,
    'CLAUDE.md': `## 1. Delta\n${rule}`,
  });
  const result = policy.verifyInstructions({ root });
  assert.ok(result.errors.some((v) => v.code === 'DUPLICATE_NORMATIVE_RULE'));
});

test('short shared phrases do not count as duplicated rules', () => {
  const root = fixtureRoot({
    'AGENTS.md': '## 1. Kurallar\nKisa ibare.',
    'CLAUDE.md': '## 1. Delta\nKisa ibare.',
  });
  assert.equal(policy.verifyInstructions({ root }).errors.length, 0);
});

// -------------------------------------------------------------- branch

test('branch prefix must be <ajan>/<konu>', () => {
  assert.equal(policy.checkBranchPrefix('claude/exec-policy-r01').length, 0);
  assert.equal(policy.checkBranchPrefix('codex/ver05-inventory').length, 0);
  assert.equal(policy.checkBranchPrefix('main').length, 0, 'main is exempt');
  assert.equal(policy.checkBranchPrefix('dependabot/npm/x').length, 0, 'bots are exempt');
  assert.equal(policy.checkBranchPrefix('').length, 0, 'absent ref is not a violation');
  assert.equal(policy.checkBranchPrefix('feature/x')[0].code, 'BRANCH_PREFIX_INVALID');
});

// -------------------------------------------------------- changed paths

test('instruction change may not carry a control-plane edit', () => {
  assert.equal(policy.checkChangedPathScope(['AGENTS.md', 'CLAUDE.md']).length, 0);
  assert.equal(
    policy.checkChangedPathScope(['.github/workflows/ci.yml']).length,
    0,
    'control-plane alone is out of this guard scope',
  );
  const mixed = policy.checkChangedPathScope(['AGENTS.md', '.github/workflows/ci.yml']);
  assert.equal(mixed[0].code, 'INSTRUCTION_CONTROL_PLANE_MIX');
});

// ------------------------------------------------- live repository state

test('current repository instruction surface satisfies the policy', () => {
  const result = policy.verifyInstructions({ root: REPO_ROOT });
  assert.deepEqual(
    result.errors.map((v) => `${v.code}: ${v.message}`),
    [],
    'AGENTS.md/CLAUDE.md must satisfy every deterministic instruction rule',
  );
});

test('current repository stays under the combined hard ceiling', () => {
  const result = policy.verifyInstructions({ root: REPO_ROOT });
  assert.ok(
    result.measurement.combinedBytes <= policy.COMBINED_CEILING_BYTES,
    `combined ${result.measurement.combinedBytes} exceeds ${policy.COMBINED_CEILING_BYTES}`,
  );
});

test('AGENTS.md declares that deterministic rules are machine enforced', () => {
  const agents = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');
  assert.match(agents, /instruction-policy\.cjs/);
});
