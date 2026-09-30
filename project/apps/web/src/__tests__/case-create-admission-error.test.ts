import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildApiHttpError } from '../lib/api-error';
import {
  CASE_INSTRUMENT_SOURCES_DISABLED,
  CASE_INSTRUMENT_UNPROCESSABLE,
  MANUAL_CASE_INSTRUMENTS_DISABLED,
  OCR_CASE_INSTRUMENTS_DISABLED,
  formatCaseCreateAdmissionError,
  formatCaseDueValidationError,
} from '../lib/case-due-payload';

/**
 * POST /cases evrak kabul reddi → kaynak türüne uygun okunur mesaj. API, kaynağı kapalı (MANUAL / OCR) ya da
 * işlenemeyen evrak kaydını sessizce atlamak yerine 400 + kararlı kodla reddeder (dosya oluşmaz). Web bu KODU
 * (sunucu metnini değil) kullanıcıya açıklar; taslak ve tarama sonucu korunur (sayfa catch'i temizlemez).
 */
describe('formatCaseCreateAdmissionError — evrak kabul reddi (MANUAL + OCR)', () => {
  // API gövdesi AllExceptionsFilter passthrough ile birebir budur; hata nesnesi iki istemcinin
  // ortak kurucusundan (buildApiHttpError) geçer → gerçek istemci şekli ölçülür.
  const apiError = (body: unknown) => buildApiHttpError(body, 400);

  it('MANUAL kapalı → manuel çek/senet mesajı, sayı; sunucu metni kullanılmaz', () => {
    const msg = formatCaseCreateAdmissionError(
      apiError({ code: MANUAL_CASE_INSTRUMENTS_DISABLED, message: 'sunucu metni', manualInstrumentCount: 2, ocrInstrumentCount: 0 }),
    );
    expect(msg).toContain('Takip oluşturulmadı');
    expect(msg).toContain('manuel çek/senet kaydı sunucuda kapalı');
    expect(msg).toContain('2 çek/senet kalemi');
    expect(msg).toContain('Girdiğiniz bilgiler silinmedi');
    expect(msg).not.toContain('sunucu metni');
    expect(msg).not.toContain('OCR');
  });

  it('OCR kapalı → taranan evrak mesajı, sayı; tarama sonucunun korunduğu söylenir', () => {
    const msg = formatCaseCreateAdmissionError(
      apiError({ code: OCR_CASE_INSTRUMENTS_DISABLED, message: 'x', manualInstrumentCount: 0, ocrInstrumentCount: 3 }),
    );
    expect(msg).toContain('taranan (OCR) evrak kaydı sunucuda kapalı');
    expect(msg).toContain('3 taranan evrak');
    expect(msg).toContain('tarama sonucu silinmedi');
    expect(msg).not.toContain('manuel');
  });

  it('iki kaynak kapalı → ikisini de adlandırır', () => {
    const msg = formatCaseCreateAdmissionError(
      apiError({ code: CASE_INSTRUMENT_SOURCES_DISABLED, message: 'x', manualInstrumentCount: 1, ocrInstrumentCount: 2 }),
    );
    expect(msg).toContain('manuel çek/senet ve taranan (OCR) evrak kaydı sunucuda kapalı');
    expect(msg).toContain('1 manuel ve 2 taranan evrak');
  });

  it('işlenemeyen evrak → sıra + tür + gerekçe (1 tabanlı), fatura yönlendirmesi', () => {
    const msg = formatCaseCreateAdmissionError(
      apiError({
        code: CASE_INSTRUMENT_UNPROCESSABLE,
        message: 'x',
        items: [
          { index: 1, source: 'OCR', type: 'FATURA', reason: 'NOT_KAMBIYO' },
          { index: 2, source: 'MANUAL', type: 'CEK', reason: 'DOCUMENT_NO_MISSING' },
        ],
      }),
    );
    expect(msg).toContain('2 evrak kaydı dosyaya işlenemiyor');
    expect(msg).toContain('2. evrak (Fatura): kambiyo senedi (çek/senet/poliçe) değil');
    expect(msg).toContain('3. evrak (Çek): belge/seri numarası eksik');
    expect(msg).toContain('alacak kalemi olarak girilmelidir');
  });

  it.each([undefined, 0, -1, 1.5, '2', null])('geçersiz/eksik sayı (%s) → genel ifade, yine okunur mesaj', (count) => {
    expect(
      formatCaseCreateAdmissionError(apiError({ code: MANUAL_CASE_INSTRUMENTS_DISABLED, message: 'x', manualInstrumentCount: count })),
    ).toContain('Çek/senet kalemleri dosyaya yazılamayacağı');
    expect(
      formatCaseCreateAdmissionError(apiError({ code: OCR_CASE_INSTRUMENTS_DISABLED, message: 'x', ocrInstrumentCount: count })),
    ).toContain('Taranan evraklar dosyaya yazılamayacağı');
  });

  it('bozuk items → genel ifade (çökmez)', () => {
    expect(formatCaseCreateAdmissionError(apiError({ code: CASE_INSTRUMENT_UNPROCESSABLE, items: 'x' }))).toContain(
      'Bazı evrak kayıtları dosyaya işlenemiyor',
    );
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

  it('Yeni Takip sayfası: POST /cases hatasında önce bu biçimleyici; taslak YALNIZ başarıda temizlenir', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../app/(dashboard)/cases/new/page.tsx'), 'utf8');
    expect(src).toMatch(
      /setError\(formatCaseCreateAdmissionError\(err\) \|\| formatCaseDueValidationError\(err\) \|\| err\.message/,
    );
    // doCreateCase: temizleme çağrısı api.createCase başarısından SONRA ve catch'ten ÖNCE (hata yolunda yok)
    const body = src.slice(src.indexOf('const doCreateCase'), src.indexOf('const filteredForms'));
    const createAt = body.indexOf('await api.createCase(');
    const clearAt = body.indexOf('clearCaseWizardDraftState(');
    const catchAt = body.indexOf('} catch (err: any) {');
    expect(createAt).toBeGreaterThan(0);
    expect(clearAt).toBeGreaterThan(createAt);
    expect(catchAt).toBeGreaterThan(clearAt);
    expect(body.slice(catchAt).includes('clearCaseWizardDraftState(')).toBe(false);
    expect(body.slice(catchAt).includes('setInstruments(')).toBe(false);
  });
});
