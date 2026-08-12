import { describe, it, expect } from 'vitest';
import {
  toActionError,
  toActionErrorMessage,
  ACTION_ERROR_NETWORK,
  ACTION_ERROR_UNKNOWN,
} from '../action-error';

/**
 * PR-2A1 — ortak hata primitifinin sözleşmesi.
 *
 * İki yönlü kilit:
 *  1. Backend'in KULLANICIYA YÖNELİK bilgisi (message/code/fieldErrors) körlemesine genel
 *     ağ hatasına çevrilmez — validation kullanıcının işine yarar.
 *  2. İÇ AYRINTI (stack, URL, SQL, dosya yolu, ORM kodu) hiçbir koşulda yüzeye çıkmaz.
 */
describe('toActionError — backend validation sözleşmesi korunur', () => {
  it('sunucu mesajını olduğu gibi kullanır', () => {
    const r = toActionError({ body: { message: 'Bu tarihte başka duruşma var.' } }, 'yedek');
    expect(r.message).toBe('Bu tarihte başka duruşma var.');
    expect(r.transient).toBe(false);
  });

  it('kararlı hata kodunu korur', () => {
    const r = toActionError({ body: { message: 'Çakışma', code: 'HEARING_CONFLICT' } }, 'yedek');
    expect(r.code).toBe('HEARING_CONFLICT');
  });

  it('alan-bazlı validation mesajlarını korur', () => {
    const r = toActionError(
      { body: { message: 'Doğrulama hatası', fieldErrors: { court: 'Mahkeme zorunlu' } } },
      'yedek',
    );
    expect(r.fieldErrors).toEqual({ court: 'Mahkeme zorunlu' });
  });

  it('dizi biçimli alan hatasının ilk mesajını alır', () => {
    const r = toActionError({ body: { errors: { date: ['Geçersiz tarih', 'x'] } } }, 'yedek');
    expect(r.fieldErrors).toEqual({ date: 'Geçersiz tarih' });
  });

  it('axios tarzı response.data gövdesini de okur', () => {
    const r = toActionError({ response: { data: { message: 'Yetkiniz yok' } } }, 'yedek');
    expect(r.message).toBe('Yetkiniz yok');
  });

  it('sunucu gövdesi VARSA ağ hatasına DÜŞMEZ (kural 1 regresyon kilidi)', () => {
    const err = Object.assign(new TypeError('Failed to fetch'), {
      body: { message: 'IBAN geçersiz', code: 'INVALID_IBAN' },
    });
    const r = toActionError(err, 'yedek');
    expect(r.message).toBe('IBAN geçersiz');
    expect(r.code).toBe('INVALID_IBAN');
    expect(r.transient).toBe(false);
  });
});

describe('toActionError — iç ayrıntı maskelenir', () => {
  const leaks: [string, string][] = [
    ['stack frame', 'Error at handleSave (case-hearings.tsx:102)'],
    ['dosya:satır', 'crash in module.ts:44'],
    ['URL/endpoint', 'POST https://api.internal/cases/1/hearings failed'],
    ['SQL', 'insert into hearings (id) values ($1)'],
    ['ORM kodu', 'PrismaClientKnownRequestError P2002'],
    ['windows yolu', 'C:\\app\\dist\\main.js not found'],
    ['ham soket hatası', 'connect ECONNREFUSED 127.0.0.1:8080'],
  ];

  it.each(leaks)('%s içeren sunucu mesajı gösterilmez', (_label, message) => {
    const r = toActionError({ body: { message } }, 'Duruşma kaydedilemedi.');
    expect(r.message).toBe('Duruşma kaydedilemedi.');
    expect(r.message).not.toContain(message);
  });

  it('sızıntı taşıyan alan hatası atılır, temiz olan korunur', () => {
    const r = toActionError(
      {
        body: {
          message: 'Doğrulama hatası',
          fieldErrors: { court: 'Mahkeme zorunlu', date: 'at parse (x.ts:9)' },
        },
      },
      'yedek',
    );
    expect(r.fieldErrors).toEqual({ court: 'Mahkeme zorunlu' });
  });

  it('sızıntı taşıyan hata kodu gösterilmez', () => {
    const r = toActionError({ body: { message: 'Hata', code: 'https://x/y' } }, 'yedek');
    expect(r.code).toBeUndefined();
  });
});

describe('toActionError — ağ ve bilinmeyen hata', () => {
  it('gövdesiz fetch hatası ağ hatasıdır ve transient olur', () => {
    const r = toActionError(new TypeError('Failed to fetch'), 'yedek');
    expect(r.message).toBe(ACTION_ERROR_NETWORK);
    expect(r.transient).toBe(true);
  });

  it('sunucu status döndüyse ağ hatası SAYILMAZ', () => {
    const r = toActionError({ status: 409, message: 'Failed to fetch' }, 'Kaydedilemedi.');
    expect(r.transient).toBe(false);
    expect(r.message).toBe('Kaydedilemedi.');
  });

  it('tanınmayan hata çağıranın yedek metnine düşer', () => {
    const r = toActionError({ weird: true }, 'Masraf kaydedilemedi.');
    expect(r.message).toBe('Masraf kaydedilemedi.');
    expect(r.transient).toBe(false);
  });

  it('yedek metin de boşsa mesaj yine DOLU döner', () => {
    expect(toActionError(null, '   ').message).toBe(ACTION_ERROR_UNKNOWN);
    expect(toActionError(undefined, '').message).toBe(ACTION_ERROR_UNKNOWN);
  });

  it('mesaj hiçbir girdide boş dönmez (sessizliğe düşüş kilidi)', () => {
    for (const input of [null, undefined, {}, new Error(''), 'x', 42]) {
      expect(toActionErrorMessage(input, 'yedek').length).toBeGreaterThan(0);
    }
  });
});
