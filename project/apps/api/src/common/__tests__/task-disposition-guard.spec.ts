/**
 * GOV-TASK-REVISION-EXIT-GATE-R01 — final disposition guard, tam matris.
 *
 * Guard: `project/scripts/governance/task-disposition-guard.cjs`
 * CI: `apps/api/ci-manifests/pure/platform-scripts-shared.txt` (Test Suite)
 * Kritik invariant'lar ayrıca REQUIRED job'da:
 * `apps/web/src/__tests__/task-disposition-invariants.test.ts`
 */

const guard = require('../../../../../scripts/governance/task-disposition-guard.cjs');

type Json = Record<string, any>;

/** Alanları tam bir BLOCKED kapanışı. */
function blockedMessage(disposition: string, extra = ''): string {
  return [
    `STATUS: ${disposition}`,
    'EXACT BLOCKER: somut blocker',
    'blockingLayer: EXTERNAL_DEPENDENCY',
    'EVIDENCE: gozlenen cikti',
    'Revision ile devam edilemez cunku sebep task disindadir.',
    'required owner action: owner karari',
    'preserved WIP: worktree korundu',
    'next eligible action: sebep ortadan kalkinca devam',
    extra,
  ].join('\n');
}

describe('task disposition guard — invalid terminal dispositions', () => {
  it.each(guard.INVALID_TERMINAL)('%s tek başına terminal kapanış olamaz', (token: string) => {
    const r = guard.validateFinalMessage(`STATUS: ${token} — teknik katman değişti.`);
    expect(r.valid).toBe(false);
    expect(r.violations[0].code).toBe(guard.VIOLATION.INVALID_TERMINAL_DISPOSITION);
    expect(r.violations[0].tokens).toContain(token);
  });

  it('superseded implementation design final olamaz', () => {
    const r = guard.validateFinalMessage(
      'Owner yeni teknik kontrat gönderdi. STATUS: SUPERSEDED — mevcut tasarım geçersiz, IMPLEMENTATION_CHANGED.',
    );
    expect(r.valid).toBe(false);
    expect(r.invalidFound).toEqual(expect.arrayContaining(['SUPERSEDED', 'IMPLEMENTATION_CHANGED']));
  });

  it('newer contract exists final olamaz', () => {
    expect(guard.validateFinalMessage('STATUS: NEWER_CONTRACT_EXISTS').valid).toBe(false);
  });

  it('base drift final olamaz', () => {
    expect(guard.validateFinalMessage('STATUS: BASE_DRIFT — origin/main ilerledi').valid).toBe(false);
  });

  it('revision required final olamaz', () => {
    expect(guard.validateFinalMessage('STATUS: REVISION_REQUIRED').valid).toBe(false);
  });

  it('reddedilen kapanışın gerekçesi revision devamlılığını anlatır', () => {
    const r = guard.validateFinalMessage('STATUS: HANDOFF_REQUIRED');
    expect(r.violations[0].detail).toMatch(/WIP korunur/);
    expect(r.violations[0].detail).toMatch(/ayni task altinda yeni revision/);
  });
});

describe('task disposition guard — valid terminal dispositions', () => {
  it('COMPLETED geçerlidir ve ek alan istemez', () => {
    expect(guard.validateFinalMessage('STATUS: COMPLETED — merged, main sync 0/0').valid).toBe(true);
  });

  it('CLOSED ve CANCELLED_BY_OWNER geçerlidir', () => {
    expect(guard.validateFinalMessage('STATUS: CLOSED').valid).toBe(true);
    expect(guard.validateFinalMessage('STATUS: CANCELLED_BY_OWNER').valid).toBe(true);
  });

  it.each([
    'BLOCKED_EXTERNAL',
    'BLOCKED_OWNER_DECISION',
    'BLOCKED_CANONICAL_CONFLICT',
    'BLOCKED_SECURITY_RISK',
    'BLOCKED_DATA_LOSS_RISK',
    'BLOCKED_AUTHORITY_MISSING',
    'BLOCKED_UNRESOLVED_TECHNICAL_RISK',
  ])('%s tam alanlarla geçerlidir', (d: string) => {
    const r = guard.validateFinalMessage(blockedMessage(d));
    expect(r.valid).toBe(true);
  });

  it('alanları eksik bir BLOCKED reddedilir', () => {
    const r = guard.validateFinalMessage('STATUS: BLOCKED_EXTERNAL — servis yok');
    expect(r.valid).toBe(false);
    expect(r.violations.some((v: Json) => v.code === guard.VIOLATION.BLOCKED_MISSING_FIELDS)).toBe(true);
  });

  it('eksik alanlar isim isim raporlanır', () => {
    const r = guard.validateFinalMessage('STATUS: BLOCKED_SECURITY_RISK');
    const v = r.violations.find((x: Json) => x.code === guard.VIOLATION.BLOCKED_MISSING_FIELDS);
    expect(v.detail).toMatch(/blockingLayer/);
    expect(v.detail).toMatch(/preservedWip/);
  });
});

describe('task disposition guard — owner handoff ve next-action', () => {
  it('owner kararı gerektiren handoff BLOCKED_OWNER_DECISION ile geçerlidir', () => {
    const r = guard.validateFinalMessage(
      blockedMessage('BLOCKED_OWNER_DECISION', 'HANDOFF_REQUIRED talebi owner onayına açıldı.'),
    );
    expect(r.valid).toBe(true);
  });

  it('geçersiz ifade, geçerli bir disposition eşliğinde next-action olarak okunur', () => {
    const r = guard.validateFinalMessage(
      'STATUS: COMPLETED\nnext action: BASE_DRIFT var, sonraki revision reconciliation yapacak.',
    );
    expect(r.valid).toBe(true);
  });

  it('kod bloğu içindeki token kapanış iddiası sayılmaz', () => {
    const r = guard.validateFinalMessage('STATUS: COMPLETED\n```text\nHANDOFF_REQUIRED\n```');
    expect(r.valid).toBe(true);
    expect(r.invalidFound).toHaveLength(0);
  });
});

describe('task disposition guard — kapsam ve sınırlar', () => {
  it('orchestrator ve direct-owner task ayrımı yapmaz: metin tabanlıdır', () => {
    // Direct-owner task'in state store kaydi yoktur; state-model tabanli bir
    // enforcement onu yakalayamaz. Guard yalniz final mesaji okur.
    const orchestrator = guard.validateFinalMessage('taskId: GOV-X\nSTATUS: HANDOFF_REQUIRED');
    const directOwner = guard.validateFinalMessage('Owner directive ile yurutuldu.\nSTATUS: HANDOFF_REQUIRED');
    expect(orchestrator.valid).toBe(false);
    expect(directOwner.valid).toBe(false);
  });

  it('requireTerminal kapalıyken sıradan metin engellenmez', () => {
    expect(guard.validateFinalMessage('sadece bir ara açıklama').valid).toBe(true);
  });

  it('requireTerminal açıkken disposition yokluğu ihlaldir', () => {
    const r = guard.validateFinalMessage('is bitti gibi', { requireTerminal: true });
    expect(r.valid).toBe(false);
    expect(r.violations[0].code).toBe(guard.VIOLATION.NO_TERMINAL_DISPOSITION);
  });

  it('kelime sınırı yanlış eşleşmeyi önler', () => {
    expect(guard.mentions('PR_OPENED_BY someone', 'PR_OPEN')).toBe(false);
    expect(guard.mentions('STATUS: PR_OPEN', 'PR_OPEN')).toBe(true);
  });

  it('rapor çıktısı geçerli sınıfları listeler', () => {
    const rejected = guard.formatReport(guard.validateFinalMessage('STATUS: SUPERSEDED'));
    expect(rejected).toMatch(/TASK_DISPOSITION_REJECTED/);
    expect(rejected).toMatch(/BLOCKED_OWNER_DECISION/);
    const ok = guard.formatReport(guard.validateFinalMessage('STATUS: COMPLETED'));
    expect(ok).toMatch(/TASK_DISPOSITION_OK/);
  });

  it('CLI modülü yüklenir ve main dışa açıktır', () => {
    expect(typeof guard.main).toBe('function');
    expect(guard.VALID_TERMINAL).toHaveLength(10);
    expect(guard.INVALID_TERMINAL).toHaveLength(12);
  });
});

describe('task disposition guard — backward compatibility', () => {
  it('mevcut closeout raporlarını engellemez', () => {
    // Bu oturumda uretilen gercek kapanis bicimleri.
    const closeoutStyle = 'STATUS      CLOSED\nSTAGE       CLOSED\nMERGE SHA   abc123\nCANONICAL   OK';
    expect(guard.validateFinalMessage(closeoutStyle).valid).toBe(true);
  });

  it('açık PR disposition satırlarını engellemez', () => {
    const prLines = [
      'PR #1738: OTHER_SESSION — HY_SH worktree — dokunma',
      'PR #1740: MERGED — 837c9f33 — main sync 0/0',
      'STATUS: COMPLETED',
    ].join('\n');
    expect(guard.validateFinalMessage(prLines).valid).toBe(true);
  });
});
