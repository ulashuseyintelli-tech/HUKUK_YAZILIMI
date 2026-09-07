/**
 * CLIENT-IDENTITY-REASONCODE-CONSISTENCY — ISTEMCI TARAFI SOZLESMESI (owner GO 2026-09-08)
 *
 * Backend'in kimlik checksum reddi artik UC yolda da AYNI govdeyi tasir:
 *   `{ message, reasonCode: 'CLIENT_IDENTITY_CHECKSUM_INVALID', offendingFields }`
 * Onceki halde create ve degisen-deger update yollari DUZ METIN gonderiyordu.
 *
 * Bu suite, govde zenginlesirken **kullanicinin gordugu mesajin DEGISMEDIGINI** ve yapisal
 * alanlarin makinece okunabilir kaldigini kilitler. `buildApiHttpError` DEGISTIRILMEDI —
 * burada dogrulanan, mevcut kanonik hata kurucusunun yeni govdeyle uyumu.
 */
import { describe, expect, it } from 'vitest';
import { buildApiHttpError } from '../lib/api-error';

const INVALID_TCKN = '12345678901'; // sentetik; gercek kisi verisi DEGIL
const CHECKSUM_BODY = {
  message: 'Geçersiz TCKN (kimlik no doğrulaması başarısız)',
  reasonCode: 'CLIENT_IDENTITY_CHECKSUM_INVALID',
  offendingFields: ['tckn'],
};

describe('kimlik checksum reddi — istemci hata sozlesmesi', () => {
  it('kullaniciya gosterilen mesaj AYNEN korunur', () => {
    const err = buildApiHttpError(CHECKSUM_BODY, 400);
    expect(err.message).toBe('Geçersiz TCKN (kimlik no doğrulaması başarısız)');
    expect(err.status).toBe(400);
  });

  it('yapisal alanlar `body` icinde KORUNUR (makinece ayirt edilebilir)', () => {
    const err = buildApiHttpError(CHECKSUM_BODY, 400);
    const body = err.body as typeof CHECKSUM_BODY;
    expect(body.reasonCode).toBe('CLIENT_IDENTITY_CHECKSUM_INVALID');
    expect(body.offendingFields).toEqual(['tckn']);
  });

  it('reaktivasyon reddi ayni sekli tasir; kendi metnini gosterir', () => {
    const err = buildApiHttpError(
      {
        message:
          'Kaydı aktifleştirmek için geçerli kimlik numarası gerekir (kimlik doğrulaması başarısız). ' +
          'Önce kaynak belgeye dayanarak kimliği düzeltin.',
        reasonCode: 'CLIENT_IDENTITY_CHECKSUM_INVALID',
        offendingFields: ['tckn', 'vkn'],
      },
      400,
    );
    expect(err.message).toContain('aktifleştirmek');
    expect((err.body as { reasonCode: string }).reasonCode).toBe('CLIENT_IDENTITY_CHECKSUM_INVALID');
  });

  it('hata nesnesinde kimlik DEGERI bulunmaz (PII yasagi)', () => {
    const err = buildApiHttpError(CHECKSUM_BODY, 400);
    expect(JSON.stringify(err.body)).not.toContain(INVALID_TCKN);
    expect(err.message).not.toContain(INVALID_TCKN);
  });

  it('duz metin govde (eski bicim) hala calisir — geriye uyumluluk', () => {
    const err = buildApiHttpError({ message: 'Geçersiz TCKN (kimlik no doğrulaması başarısız)' }, 400);
    expect(err.message).toBe('Geçersiz TCKN (kimlik no doğrulaması başarısız)');
    expect((err.body as { reasonCode?: string }).reasonCode).toBeUndefined();
  });
});
