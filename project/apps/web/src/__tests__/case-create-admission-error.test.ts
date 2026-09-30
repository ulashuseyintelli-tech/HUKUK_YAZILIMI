import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildApiHttpError } from '../lib/api-error';
import {
  MANUAL_CASE_INSTRUMENTS_DISABLED,
  formatCaseCreateAdmissionError,
  formatCaseDueValidationError,
} from '../lib/case-due-payload';

/**
 * POST /cases kabul reddi → okunur mesaj. API, sunucuda MANUAL_CASE_INSTRUMENTS kapalıyken
 * `source: MANUAL` çek/senet kaydını sessizce atlamak yerine 400 + kararlı kodla reddeder
 * (dosya oluşmaz). Web bu KODU (sunucu metnini değil) kullanıcıya açıklar.
 */
describe('formatCaseCreateAdmissionError — MANUAL_CASE_INSTRUMENTS_DISABLED', () => {
  // API gövdesi AllExceptionsFilter passthrough ile birebir budur; hata nesnesi iki istemcinin
  // ortak kurucusundan (buildApiHttpError) geçer → gerçek istemci şekli ölçülür.
  const apiError = (body: unknown) => buildApiHttpError(body, 400);

  it('kararlı kod + kalem sayısı → sayılı okunur mesaj', () => {
    const msg = formatCaseCreateAdmissionError(
      apiError({ code: MANUAL_CASE_INSTRUMENTS_DISABLED, message: 'sunucu metni', manualInstrumentCount: 2 }),
    );
    expect(msg).toContain('Takip oluşturulmadı');
    expect(msg).toContain('manuel çek/senet kaydı sunucuda kapalı');
    expect(msg).toContain('2 çek/senet kalemi');
    expect(msg).toContain('Girdiğiniz bilgiler silinmedi');
    expect(msg).not.toContain('sunucu metni'); // koda bağlı; sunucu metnine değil
  });

  it.each([undefined, 0, -1, 1.5, '2', null])('geçersiz/eksik sayı (%s) → genel ifade, yine okunur mesaj', (count) => {
    const msg = formatCaseCreateAdmissionError(
      apiError({ code: MANUAL_CASE_INSTRUMENTS_DISABLED, message: 'x', manualInstrumentCount: count }),
    );
    expect(msg).toContain('Çek/senet kalemleri dosyaya yazılamayacağı');
  });

  it.each([
    ['başka kod', { code: 'UNSUPPORTED_COMPONENT', message: 'Due component is not supported' }],
    ['kod yok', { message: ['dues.0.interestRate must be a number'] }],
    ['boş gövde', {}],
  ])('%s → null (mevcut biçimleyicilere düşer)', (_label, body) => {
    expect(formatCaseCreateAdmissionError(apiError(body))).toBeNull();
  });

  it.each([null, undefined, new Error('ağ hatası'), 'metin'])('gövdesiz hata (%s) → null', (err) => {
    expect(formatCaseCreateAdmissionError(err)).toBeNull();
  });

  it('due alan hatası kendi biçimleyicisinde kalır (zincir sırası bozulmaz)', () => {
    const err = apiError({ message: ['dues.0.interestRate must be a number'] });
    expect(formatCaseCreateAdmissionError(err)).toBeNull();
    expect(formatCaseDueValidationError(err)).toBe('1. alacak kalemindeki sabit faiz oranı geçersiz veya eksik.');
  });

  it('Yeni Takip sayfası POST /cases hatasında önce bu biçimleyiciyi kullanır', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/(dashboard)/cases/new/page.tsx'),
      'utf8',
    );
    expect(src).toMatch(
      /setError\(formatCaseCreateAdmissionError\(err\) \|\| formatCaseDueValidationError\(err\) \|\| err\.message/,
    );
  });
});
