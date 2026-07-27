/**
 * Instruction policy guard — CI kosumu.
 *
 * Guard tanimi: `project/scripts/instruction-policy.cjs`
 *
 * Bu spec CI'a `apps/api/ci-manifests/pure/platform-scripts-shared.txt` uzerinden
 * baglidir. ci.yml ve governance-coordination.test.cjs governance control-plane
 * oldugu icin (bkz. governance-writer-coordination-protected-paths.json →
 * coordinationControlPlane) oraya dokunulmaz; manifest korumali degildir ve bir
 * feature PR kendi spec'ini kendisi baglayabilir.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const policy = require('../../../../../scripts/instruction-policy.cjs');

const REPO_ROOT: string = policy.REPO_ROOT;

function fixtureRoot(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instr-policy-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

describe('instruction policy — normalization', () => {
  it('normalizes CRLF before measuring', () => {
    expect(policy.normalizedBytes('a\r\nb')).toBe(policy.normalizedBytes('a\nb'));
    expect(policy.normalizedBytes('a\r\nb')).toBe(3);
  });

  it('counts words on normalized content', () => {
    expect(policy.normalizedWords('bir\r\niki  uc')).toBe(3);
    expect(policy.normalizedWords('   ')).toBe(0);
  });
});

describe('instruction policy — size', () => {
  it('treats the AGENTS target as a warning, not a build failure', () => {
    const result = policy.verifyInstructions({
      root: fixtureRoot({
        'AGENTS.md': 'x'.repeat(policy.AGENTS_TARGET_BYTES + 10),
        'CLAUDE.md': 'y',
      }),
    });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings[0].code).toBe('SIZE_TARGET_EXCEEDED');
  });

  it('treats the combined hard ceiling as an error', () => {
    const result = policy.verifyInstructions({
      root: fixtureRoot({
        'AGENTS.md': 'x'.repeat(policy.COMBINED_CEILING_BYTES),
        'CLAUDE.md': 'y'.repeat(200),
      }),
    });
    expect(result.errors.map((v: { code: string }) => v.code)).toContain('SIZE_CEILING_EXCEEDED');
  });
});

describe('instruction policy — references', () => {
  it('rejects a dangling repository-local reference', () => {
    const result = policy.verifyInstructions({
      root: fixtureRoot({
        'AGENTS.md': 'Bkz. project/docs/governance/YOK-BOYLE-BIR-BELGE.md dosyasi.',
        'CLAUDE.md': 'delta',
      }),
    });
    const violation = result.errors.find(
      (v: { code: string }) => v.code === 'REFERENCE_MISSING',
    );
    expect(violation).toBeDefined();
    expect(violation.message).toMatch(/YOK-BOYLE-BIR-BELGE\.md/);
  });

  it('does not treat placeholder paths inside fenced blocks as references', () => {
    const result = policy.verifyInstructions({
      root: fixtureRoot({
        'AGENTS.md': ['metin', '```text', 'git worktree add ../HY_<konu> origin/main', '```'].join(
          '\n',
        ),
        'CLAUDE.md': 'delta',
      }),
    });
    expect(result.errors).toHaveLength(0);
  });
});

describe('instruction policy — section references', () => {
  it('rejects a section reference beyond the last defined section', () => {
    const result = policy.verifyInstructions({
      root: fixtureRoot({
        'AGENTS.md': ['## 1. Bir', 'metin', '## 2. Iki', 'bkz. §9 kurali gecerlidir.'].join('\n'),
        'CLAUDE.md': 'delta',
      }),
    });
    expect(result.errors.map((v: { code: string }) => v.code)).toContain('SECTION_REF_BROKEN');
  });

  it('reads the highest numbered heading', () => {
    expect(policy.maxSectionNumber('## 1. a\n## 14. b\n## 7. c')).toBe(14);
  });
});

describe('instruction policy — TEK CANONICAL HOME', () => {
  it('rejects a supplement that repeats a baseline rule verbatim', () => {
    const rule =
      'Commit, push, merge veya branch silme yalniz kullanici acikca yetki verdiginde yapilir.';
    const result = policy.verifyInstructions({
      root: fixtureRoot({
        'AGENTS.md': `## 1. Kurallar\n${rule}`,
        'CLAUDE.md': `## 1. Delta\n${rule}`,
      }),
    });
    expect(result.errors.map((v: { code: string }) => v.code)).toContain(
      'DUPLICATE_NORMATIVE_RULE',
    );
  });

  it('does not count short shared phrases as duplicated rules', () => {
    const result = policy.verifyInstructions({
      root: fixtureRoot({
        'AGENTS.md': '## 1. Kurallar\nKisa ibare.',
        'CLAUDE.md': '## 1. Delta\nKisa ibare.',
      }),
    });
    expect(result.errors).toHaveLength(0);
  });
});

describe('instruction policy — branch and changed paths', () => {
  it('accepts <ajan>/<konu> and exempts bots and main', () => {
    expect(policy.checkBranchPrefix('claude/exec-policy-r01')).toHaveLength(0);
    expect(policy.checkBranchPrefix('codex/ver05-inventory')).toHaveLength(0);
    expect(policy.checkBranchPrefix('main')).toHaveLength(0);
    expect(policy.checkBranchPrefix('dependabot/npm/x')).toHaveLength(0);
    expect(policy.checkBranchPrefix('')).toHaveLength(0);
  });

  it('rejects a branch without an agent prefix', () => {
    expect(policy.checkBranchPrefix('feature/x')[0].code).toBe('BRANCH_PREFIX_INVALID');
  });

  it('rejects mixing an instruction change with a control-plane edit', () => {
    expect(policy.checkChangedPathScope(['AGENTS.md', 'CLAUDE.md'])).toHaveLength(0);
    expect(policy.checkChangedPathScope(['.github/workflows/ci.yml'])).toHaveLength(0);
    expect(policy.checkChangedPathScope(['AGENTS.md', '.github/workflows/ci.yml'])[0].code).toBe(
      'INSTRUCTION_CONTROL_PLANE_MIX',
    );
  });
});

describe('instruction policy — live repository state', () => {
  it('current instruction surface satisfies every deterministic rule', () => {
    const result = policy.verifyInstructions({ root: REPO_ROOT });
    expect(
      result.errors.map((v: { code: string; message: string }) => `${v.code}: ${v.message}`),
    ).toEqual([]);
  });

  it('current instruction surface stays under the combined hard ceiling', () => {
    const result = policy.verifyInstructions({ root: REPO_ROOT });
    expect(result.measurement.combinedBytes).toBeLessThanOrEqual(policy.COMBINED_CEILING_BYTES);
  });

  it('AGENTS.md declares that deterministic rules are machine enforced', () => {
    const agents = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');
    expect(agents).toMatch(/instruction-policy\.cjs/);
  });
});
