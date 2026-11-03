import { describe, expect, it } from 'vitest';
import { toActionError } from '../action-error';
import {
  classifyLawyerDeactivationFailure,
  REPLACEMENT_NOT_ASSIGNED_TO_CASES,
  REPLACEMENT_REQUIRED_MESSAGE,
} from '../lawyer-deactivation';

// O-1: backend yanıtı (lawyer.service.ts `delete`, H1) ile birebir gövdeler.
const REQUIRED_TEXT =
  'Bu avukat bir veya daha fazla dosyada sorumlu; pasifleştirmeden önce yeni sorumlu avukat (replacementLawyerId) seçilmelidir.';

function classify(raw: unknown) {
  return classifyLawyerDeactivationFailure(raw, toActionError(raw, 'Avukat pasifleştirilemedi.'));
}

describe('classifyLawyerDeactivationFailure', () => {
  it('devralan gerekli: 400 + kodsuz gövde + alan adı geçen metin → REPLACEMENT_REQUIRED', () => {
    const r = classify({ status: 400, body: { statusCode: 400, message: REQUIRED_TEXT, error: 'Bad Request' } });
    expect(r).toEqual({ kind: 'REPLACEMENT_REQUIRED', message: REPLACEMENT_REQUIRED_MESSAGE });
  });

  it('aynı metin 400 dışında ya da kodlu gelirse devralan gerekli SAYILMAZ (mesaj aynen gösterilir)', () => {
    expect(classify({ status: 403, body: { message: REQUIRED_TEXT } }).kind).toBe('OTHER');
    expect(classify({ status: 400, body: { message: REQUIRED_TEXT, code: 'SOMETHING_ELSE' } })).toEqual({ kind: 'OTHER', message: REQUIRED_TEXT });
  });

  it('eksik atama: kod + dosya listesi → REPLACEMENT_NOT_ASSIGNED, yalnız güvenli kimlikler taşınır', () => {
    const r = classify({
      status: 400,
      body: {
        message: 'Yeni sorumlu avukat aşağıdaki dosyalara henüz atanmamış; önce dosyalara ekleyin.',
        code: REPLACEMENT_NOT_ASSIGNED_TO_CASES,
        caseIds: ['c-1', '0f8fad5b-d9cb-469f-a165-70867728950e', '../x', '<script>', 42, 'a'.repeat(65)],
      },
    });
    expect(r.kind).toBe('REPLACEMENT_NOT_ASSIGNED');
    if (r.kind !== 'REPLACEMENT_NOT_ASSIGNED') return;
    expect(r.caseIds).toEqual(['c-1', '0f8fad5b-d9cb-469f-a165-70867728950e']);
    expect(r.message).toContain('aşağıdaki 2 dosyaya henüz atanmamış');
    expect(r.message).toContain('Otomatik atama yapılmaz');
  });

  it('eksik atama kodu dosya listesiz gelse de hata gizlenmez', () => {
    const r = classify({ status: 400, body: { code: REPLACEMENT_NOT_ASSIGNED_TO_CASES, message: 'x' } });
    expect(r.kind).toBe('REPLACEMENT_NOT_ASSIGNED');
    if (r.kind !== 'REPLACEMENT_NOT_ASSIGNED') return;
    expect(r.caseIds).toEqual([]);
    expect(r.message).toContain('sorumlu olunan dosyaların bir kısmına');
  });

  it('bilinmeyen kod ve düz backend metni GİZLENMEZ', () => {
    expect(classify({ status: 400, body: { code: 'YENI_KURAL', message: 'Yeni bir kural ihlali.' } })).toEqual({ kind: 'OTHER', message: 'Yeni bir kural ihlali.' });
    expect(classify({ status: 400, body: { message: 'Yeni sorumlu avukat aktif olmalıdır.' } })).toEqual({ kind: 'OTHER', message: 'Yeni sorumlu avukat aktif olmalıdır.' });
  });

  it('gövdesiz / ağ hatasında kullanıcı yüzeyi mesajı kullanılır', () => {
    expect(classify(new TypeError('Failed to fetch')).kind).toBe('OTHER');
    expect(classify(new TypeError('Failed to fetch')).message).toMatch(/Sunucuya ulaşılamadı/);
    expect(classify(null)).toEqual({ kind: 'OTHER', message: 'Avukat pasifleştirilemedi.' });
  });
});
