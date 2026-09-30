import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  consumeNewStartParam,
  isResponsibleStillCandidate,
  resolveFileNumberOnReopen,
  restoreResponsibleSelection,
} from '@/lib/case-wizard-reopen';
import { api } from '@/lib/api';

describe('consumeNewStartParam — yeni başlangıç talebi bir kez işlenir', () => {
  it('new=true ayıklanır, diğer parametreler korunur', () => {
    expect(consumeNewStartParam('?new=true&clientId=c1')).toEqual({ isNewStart: true, remainingSearch: '?clientId=c1' });
    expect(consumeNewStartParam('?new=true')).toEqual({ isNewStart: true, remainingSearch: '' });
  });
  it('parametre yoksa yeni başlangıç değildir (F5 taslağı silmez)', () => {
    expect(consumeNewStartParam('')).toEqual({ isNewStart: false, remainingSearch: '' });
    expect(consumeNewStartParam('?new=false')).toMatchObject({ isNewStart: false });
  });
});

describe('resolveFileNumberOnReopen — elle girilen dosya no ezilmez', () => {
  it('boş taslak → güncel öneri', () => {
    expect(resolveFileNumberOnReopen({ draftFileNumber: '', draftAutoFileNumber: undefined, suggestion: '2026/9' })).toEqual({
      fileNumber: '2026/9',
      autoFileNumber: '2026/9',
    });
  });
  it('taslak değeri son otomatik öneriyle aynı (kullanıcı değiştirmemiş) → tazelenir', () => {
    expect(resolveFileNumberOnReopen({ draftFileNumber: '2026/5', draftAutoFileNumber: '2026/5', suggestion: '2026/9' })).toEqual({
      fileNumber: '2026/9',
      autoFileNumber: '2026/9',
    });
  });
  it('elle girilmiş numara KORUNUR', () => {
    expect(resolveFileNumberOnReopen({ draftFileNumber: 'OZEL-77', draftAutoFileNumber: '2026/5', suggestion: '2026/9' })).toEqual({
      fileNumber: 'OZEL-77',
      autoFileNumber: '2026/5',
    });
  });
  it('alanı taşımayan eski taslakta dolu değer KORUNUR (sessiz kayıp yok; benzersizlik açılışta)', () => {
    expect(resolveFileNumberOnReopen({ draftFileNumber: '2026/5', draftAutoFileNumber: undefined, suggestion: '2026/9' })).toEqual({
      fileNumber: '2026/5',
      autoFileNumber: null,
    });
  });
});

describe('dosya sorumlusu geri yükleme', () => {
  it('yalnız geçerli şekil geri yüklenir', () => {
    expect(restoreResponsibleSelection({ type: 'LAWYER', id: 'l1' })).toEqual({ type: 'LAWYER', id: 'l1' });
    expect(restoreResponsibleSelection({ type: 'STAFF', id: 's1', extra: 1 })).toEqual({ type: 'STAFF', id: 's1' });
    for (const bad of [null, 'l1', { type: 'ADMIN', id: 'x' }, { type: 'LAWYER', id: '' }, { type: 'LAWYER' }]) {
      expect(restoreResponsibleSelection(bad)).toBeNull();
    }
  });
  it('güncel aday listesinde olmayan kimlik geçerli sayılmaz', () => {
    const sel = { type: 'LAWYER' as const, id: 'l1' };
    expect(isResponsibleStillCandidate(sel, [{ type: 'LAWYER', id: 'l1' }])).toBe(true);
    expect(isResponsibleStillCandidate(sel, [{ type: 'STAFF', id: 'l1' }])).toBe(false);
    expect(isResponsibleStillCandidate(sel, [])).toBe(false);
    expect(isResponsibleStillCandidate(sel, undefined)).toBe(false);
  });
});

describe('taslak belge (Word/PDF/XML) — ortak kimlik doğrulama istemcisi', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    sessionStorage.clear();
    api.clearToken();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each([
    ['"Beni hatırla" KAPALI (sessionStorage)', () => sessionStorage.setItem('token', 'tok-session'), 'tok-session'],
    ['"Beni hatırla" AÇIK (localStorage)', () => localStorage.setItem('token', 'tok-local'), 'tok-local'],
  ])('%s: token gönderilir, dosya döner', async (_label, seed, expected) => {
    seed();
    fetchMock.mockImplementation(async () => new Response('docx-bytes', { status: 200 }));
    for (const [method, pathPart] of [
      ['downloadTakipTalebiWord', 'takip-talebi/word'],
      ['downloadTakipTalebiPdf', 'takip-talebi/pdf'],
      ['downloadTakipTalebiXml', 'takip-talebi/xml'],
    ] as const) {
      fetchMock.mockClear();
      const blob = await api[method]({ caseType: 'KAMBIYO' });
      expect(blob.size).toBe('docx-bytes'.length);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain(`/api/template-engine/${pathPart}`);
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${expected}`);
    }
  });

  it('sunucu hata açıklaması ve kodu KORUNUR (ör. belge türü belirsiz)', async () => {
    sessionStorage.setItem('token', 't');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'BELGE_TURU_BELIRSIZ', message: 'Kambiyo takip talebi için belge türü belirlenemedi.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(api.downloadTakipTalebiWord({})).rejects.toMatchObject({
      message: 'Kambiyo takip talebi için belge türü belirlenemedi.',
      status: 400,
      body: expect.objectContaining({ code: 'BELGE_TURU_BELIRSIZ' }),
    });
  });

  it('sihirbaz düğmeleri yalnız localStorage token\'ına ve doğrudan fetch\'e dayanmaz (statik)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/claim-item/ProfessionalClaimItemForm.tsx'), 'utf8');
    expect(src).not.toContain('localStorage.getItem("token")');
    expect(src).not.toMatch(/fetch\([^)]*template-engine\/takip-talebi/);
    for (const m of ['downloadTakipTalebiWord', 'downloadTakipTalebiPdf', 'downloadTakipTalebiXml']) {
      expect(src).toContain(`api.${m}(templateData)`);
    }
  });
});
