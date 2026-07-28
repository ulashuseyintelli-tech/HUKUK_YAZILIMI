/**
 * Task disposition guard — REQUIRED-path invariant guard.
 *
 * Tam matris `apps/api/src/common/__tests__/task-disposition-guard.spec.ts`tedir ve
 * `Test Suite` job'inda kosar; o job REQUIRED DEGILDIR. Bu dosya yalniz "bunlar
 * bozulursa gorev revision yuzunden yanlislikla terminal kapatilabilir" sinirini
 * tasir ve `Web Tests (vitest)` job'inda kosar — o job REQUIRED'dir.
 *
 * Cagrildigi yerler:
 * - pnpm --filter @hukuk/web test  (CI: Web Tests (vitest), REQUIRED)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const guard = require('../../../../scripts/governance/task-disposition-guard.cjs');

// cwd'den yukari yurunur: vitest'in nereden cagrildigina (repo koku, apps/web,
// pnpm --filter) bagimli olmadan repository kokunu bulur.
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'AGENTS.md'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('AGENTS.md bulunamadi; repository koku cozulemedi');
}

const read = (repoPath: string) => readFileSync(join(repoRoot(), repoPath), 'utf8');

describe('task disposition — required-path invariants', () => {
  it('revision sinyalleri tek başına terminal kapanış olamaz', () => {
    for (const token of [
      'HANDOFF_REQUIRED',
      'SUPERSEDED',
      'DESIGN_CHANGED',
      'IMPLEMENTATION_CHANGED',
      'TEST_DESIGN_CHANGED',
      'NEWER_CONTRACT_EXISTS',
      'NEEDS_REEVALUATION',
      'BASE_DRIFT',
      'REVISION_REQUIRED',
    ]) {
      const r = guard.validateFinalMessage(`STATUS: ${token}`);
      expect(r.valid).toBe(false);
      expect(r.violations[0].code).toBe(guard.VIOLATION.INVALID_TERMINAL_DISPOSITION);
    }
  });

  it('ara execution durumları terminal kapanış olamaz', () => {
    for (const token of ['CI_RUNNING', 'PR_OPEN', 'NEXT_TASK_PENDING']) {
      expect(guard.validateFinalMessage(`STATUS: ${token}`).valid).toBe(false);
    }
  });

  it('geçerli terminal sınıfları tam olarak on tanedir', () => {
    expect(guard.VALID_TERMINAL).toEqual([
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
  });

  it('alanları eksik bir BLOCKED kapanışı reddedilir', () => {
    const r = guard.validateFinalMessage('STATUS: BLOCKED_EXTERNAL — servis yok');
    expect(r.valid).toBe(false);
    expect(r.violations.some((v: { code: string }) => v.code === guard.VIOLATION.BLOCKED_MISSING_FIELDS)).toBe(true);
  });

  it('gerçek owner handoff kararı engellenmez', () => {
    const r = guard.validateFinalMessage(
      [
        'STATUS: BLOCKED_OWNER_DECISION',
        'HANDOFF_REQUIRED talebi owner onayina acildi.',
        'EXACT BLOCKER: primary executor degisikligi',
        'blockingLayer: EXECUTOR_OWNERSHIP',
        'EVIDENCE: mevcut executor devam edemiyor',
        'revision ile cozulemez',
        'owner action: yeni execution grant',
        'preserved WIP: worktree korundu',
        'next eligible action: grant sonrasi devam',
      ].join('\n'),
    );
    expect(r.valid).toBe(true);
  });

  it('metin tabanlıdır: direct-owner task da kapsanır', () => {
    // Direct-owner task'in orchestrator state kaydi yoktur; state-model tabanli
    // bir enforcement onu yakalayamaz.
    const r = guard.validateFinalMessage('Owner directive ile yurutuldu.\nSTATUS: SUPERSEDED');
    expect(r.valid).toBe(false);
  });

  it('mevcut kapanış biçimlerini engellemez', () => {
    expect(guard.validateFinalMessage('STATUS      CLOSED\nCANONICAL   OK').valid).toBe(true);
    expect(guard.validateFinalMessage('PR #1: MERGED — abc — main sync\nSTATUS: COMPLETED').valid).toBe(true);
  });

  it('guard modülü yüklenir', () => {
    expect(typeof guard.validateFinalMessage).toBe('function');
    expect(typeof guard.main).toBe('function');
    expect(guard.INVALID_TERMINAL).toHaveLength(12);
  });
});

describe('task revision protokolü — belge bağları', () => {
  it('AGENTS.md ratifiye edilmiş ayrım cümlesini taşır', () => {
    expect(read('AGENTS.md')).toMatch(
      /`TASK REVISION ≠ TASK TERMINATION ≠ EXECUTOR HANDOFF\.`/,
    );
  });

  it('AGENTS.md çekirdeği revision sürekliliğini normatif olarak kurar', () => {
    const agents = read('AGENTS.md');
    // Kod yerine metni bağlıyoruz cünkü ajan bu cümleyi okuyup davranıyor.
    expect(agents).toMatch(/task identity, semantic outcome ve\s+primary ownership/i);
    expect(agents).toMatch(/yeni immutable revision ile devam eder/i);
  });

  it('detay katmanı process-rules.md tarafında durur', () => {
    const rules = read('project/docs/governance/process-rules.md');
    expect(rules).toMatch(/## Task Revision Protokolü/);
    expect(rules).toMatch(/### Revision tetikleyicileri/);
    expect(rules).toMatch(/### Terminal disposition sınıfları/);
    expect(rules).toMatch(/### Gerçek executor handoff istisnaları/);
  });

  it('handoff istisna listesi AGENTS.md’de tekrar edilmez', () => {
    // TEK CANONICAL HOME: dört istisnanın sayıldığı yer process-rules.md'dir.
    expect(read('AGENTS.md')).not.toMatch(/primary executor gerekli araci teknik olarak/i);
    expect(read('project/docs/governance/process-rules.md')).toMatch(
      /Primary executor gerekli aracı teknik olarak çağıramıyor/,
    );
  });

  it('process-rules.md geçerli terminal sınıflarını guard ile aynı listede tutar', () => {
    const rules = read('project/docs/governance/process-rules.md');
    for (const token of guard.VALID_TERMINAL) expect(rules).toContain(token);
    for (const token of guard.INVALID_TERMINAL) expect(rules).toContain(token);
  });
});
