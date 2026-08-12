import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PR-2A1 — SON DORT SIGNATURE SOZLESME SPEC'I
 * stable keys:
 *   components/case/IntakeLinksCard.tsx#handleRevoke
 *   components/reminders/reminder-widget.tsx#addReminder
 *   components/reports/scheduled-reports.tsx#saveReport
 *   components/quick-actions.tsx#handleSeedData
 *
 * NOT (durustluk): bu dort dugumun kaniti KAYNAK-SOZLESME duzeyindedir (cases/new
 * emsali). Ayni state machine'in DOM davranisi 8 ayri suite'te (hearings/deadlines/
 * expenses/office/claim-item/uyap/portal/tasks/notifications/calendar/icrabot)
 * fiilen kosturulmustur; buradaki assertler o makinenin dogru BAGLANDIGINI kilitler.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function segment(src: string, startMarker: string, endMarker: string): string {
  const i = src.indexOf(startMarker);
  expect(i, startMarker).toBeGreaterThan(-1);
  const j = src.indexOf(endMarker, i + startMarker.length);
  return src.slice(i, j > i ? j : i + 3000);
}

function assertNoSilentPatterns(seg: string, label: string) {
  expect(seg, label).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
  expect(seg, label).not.toMatch(/console\.error/);
  expect(seg, label).toContain('runMutation');
}

describe('IntakeLinksCard#handleRevoke', () => {
  const src = read('case/IntakeLinksCard.tsx');
  const seg = segment(src, 'const handleRevoke', 'return (');

  it('senkron keyed lock + dogru anahtar', () => {
    expect(seg).toContain('rowLock.run(`intake-link:revoke:${id}`');
    assertNoSilentPatterns(seg, 'handleRevoke');
  });

  it('TERS RAPOR imkansiz: basari + reload hatasi STALE olarak ayrisir', () => {
    // Eski kod revoke OK + reload FAIL durumunu "Link iptal edilemedi" diye raporluyordu.
    expect(seg).toContain('staleMessage');
    expect(seg).toContain("outcome.status === \"SUCCESS_STALE\"");
    const failed = seg.slice(seg.indexOf('=== "FAILED"'), seg.indexOf('=== "FAILED"') + 200);
    expect(failed).toContain('setRevokeError(outcome.error.message)');
  });

  it('refresh mutation refresh i olarak propagate eder; stale band refresh-only', () => {
    expect(seg).toContain('loadLinks({ propagateError: true })');
    expect(src).toContain('data-testid="stale-refresh"');
    // refresh-only dugmesi mutation cagirmaz: yalniz loadLinks baglidir.
    const band = src.slice(src.indexOf('data-testid="stale-notice"'), src.indexOf('data-testid="stale-notice"') + 600);
    expect(band).not.toContain('revokeIntakeLink');
  });
});

describe('reminder-widget#addReminder', () => {
  const src = read('reminders/reminder-widget.tsx');
  const seg = segment(src, 'const addReminder', 'const toggleComplete');

  it('localStorage SAHTE kayit uretimi KALDIRILDI', () => {
    expect(seg).not.toContain('localStorage.setItem');
    expect(seg).not.toContain('Date.now().toString()');
    assertNoSilentPatterns(seg, 'addReminder');
  });

  it('form/modal kapanisi YALNIZ basari dalinda; create kilidi dogru', () => {
    expect(seg).toContain("rowLock.run('reminder:create'");
    const fi = seg.indexOf("=== 'FAILED'");
    const failed = seg.slice(fi, seg.indexOf('return;', fi) + 7);
    expect(failed).not.toContain('setShowAddModal(false)');
    expect(failed).not.toContain('setNewReminder(');
    const after = seg.slice(seg.indexOf('return;', fi) + 7);
    expect(after).toContain('setShowAddModal(false)');
  });

  it('refresh propagate + stale band mevcut', () => {
    expect(seg).toContain('loadReminders({ propagateError: true })');
    expect(src).toContain('data-testid="stale-notice"');
  });
});

describe('scheduled-reports#saveReport', () => {
  const src = read('reports/scheduled-reports.tsx');
  const seg = segment(src, 'const saveReport', 'const calculateNextRun');

  it('sahte yerel rapor uretimi KALDIRILDI', () => {
    expect(seg).not.toContain('setReports(prev => [...prev, newReport])');
    expect(seg).not.toContain('setReports(prev => prev.map');
    assertNoSilentPatterns(seg, 'saveReport');
  });

  it('create/update ayrimi ve kilit anahtarlari endpoint sozlesmesine uygun', () => {
    expect(seg).toContain('`report:save:${targetId}`');
    expect(seg).toContain("'report:create'");
    expect(seg).toContain('api.put(`/reports/scheduled/${targetId}`');
    expect(seg).toContain("api.post('/reports/scheduled'");
  });

  it('resetForm YALNIZ basari dalinda', () => {
    const fi = seg.indexOf("=== 'FAILED'");
    const failed = seg.slice(fi, seg.indexOf('return;', fi) + 7);
    expect(failed).not.toContain('resetForm()');
    const after = seg.slice(seg.indexOf('return;', fi) + 7);
    expect(after).toContain('resetForm()');
  });
});

describe('quick-actions#handleSeedData', () => {
  const src = read('quick-actions.tsx');
  const seg = segment(src, 'const handleSeedData', 'const handleAction');

  it('fetch !ok sozlesmesi kuruldu; sayfa reload u yalniz DOGRULANMIS basarida', () => {
    expect(seg).toContain('throwIfNotOk');
    expect(seg).toContain("seedLock.run('quick-actions:seed'");
    assertNoSilentPatterns(seg, 'handleSeedData');
    // FAILED dalinda reload YOK.
    const failed = seg.slice(seg.indexOf("=== 'FAILED'"), seg.indexOf("=== 'FAILED'") + 260);
    expect(failed).not.toContain('window.location.reload');
    expect(failed).toContain('return');
  });

  it('hata sonucu GORUNUR result state ine yazilir', () => {
    expect(seg).toContain('setSeedResult({ success: false, message: outcome.error.message })');
  });
});
