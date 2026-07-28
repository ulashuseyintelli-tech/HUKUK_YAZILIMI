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

import { describe, expect, it } from 'vitest';

const guard = require('../../../../scripts/governance/task-disposition-guard.cjs');

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
