/**
 * Vekalet müvekkil telefonu guard testleri.
 * Bug: Vekaletname taramasında noterin/büronun sabit hattı (ör. 0212 / +90 212 ...)
 * müvekkilin telefonu sanılıp PowerOfAttorneyResult.phone alanına yazılıyordu.
 * Fix: sanitizeClientPhone() yalnızca Türk cep telefonunu (05XX / +905XX / 5XX) kabul eder,
 * sabit hatları ve geçersiz değerleri eler. Hem AI text hem Vision parse return'lerinde uygulanır.
 */

import { sanitizeClientPhone } from '../ocr.service';

describe('sanitizeClientPhone (müvekkil telefon guard)', () => {
  describe('sabit hat (noter/büro santrali) → reddedilir', () => {
    it('+902128035672 (örnek bug: 0212 İstanbul sabit hat) → undefined', () => {
      expect(sanitizeClientPhone('+902128035672')).toBeUndefined();
    });

    it('biçimlendirilmiş 0212 sabit hat → undefined', () => {
      expect(sanitizeClientPhone('0212 803 56 72')).toBeUndefined();
    });

    it('0216 (İstanbul Anadolu) → undefined', () => {
      expect(sanitizeClientPhone('0216 444 11 22')).toBeUndefined();
    });

    it('0312 (Ankara) → undefined', () => {
      expect(sanitizeClientPhone('0312 555 66 77')).toBeUndefined();
    });

    it('AI dönüşü sabit hat verse bile (return mapping = sanitizeClientPhone) → boş', () => {
      // PowerOfAttorneyResult.phone = sanitizeClientPhone(parsed.phone) olduğundan,
      // AI noterin sabit hattını döndürse de sonuç undefined olur.
      const aiReturnedLandline = '+90 (212) 803 56 72';
      expect(sanitizeClientPhone(aiReturnedLandline)).toBeUndefined();
    });
  });

  describe('gerçek cep telefonu → korunur ve normalize edilir', () => {
    it('05321234567 → 05321234567', () => {
      expect(sanitizeClientPhone('05321234567')).toBe('05321234567');
    });

    it('boşluklu 0532 123 45 67 → 05321234567', () => {
      expect(sanitizeClientPhone('0532 123 45 67')).toBe('05321234567');
    });

    it('+905321234567 → 05321234567', () => {
      expect(sanitizeClientPhone('+905321234567')).toBe('05321234567');
    });

    it('905321234567 (ülke kodu, + yok) → 05321234567', () => {
      expect(sanitizeClientPhone('905321234567')).toBe('05321234567');
    });

    it('5321234567 (10 hane ulusal) → 05321234567', () => {
      expect(sanitizeClientPhone('5321234567')).toBe('05321234567');
    });

    it('+90 (532) 123-45-67 (karışık biçim) → 05321234567', () => {
      expect(sanitizeClientPhone('+90 (532) 123-45-67')).toBe('05321234567');
    });
  });

  describe('geçersiz / boş girdiler → undefined', () => {
    it('undefined → undefined', () => {
      expect(sanitizeClientPhone(undefined)).toBeUndefined();
    });

    it('null → undefined', () => {
      expect(sanitizeClientPhone(null)).toBeUndefined();
    });

    it('boş string → undefined', () => {
      expect(sanitizeClientPhone('')).toBeUndefined();
    });

    it('rakam içermeyen metin → undefined', () => {
      expect(sanitizeClientPhone('Telefon yok')).toBeUndefined();
    });

    it('eksik haneli numara → undefined', () => {
      expect(sanitizeClientPhone('0532123')).toBeUndefined();
    });

    it('fazla haneli numara → undefined', () => {
      expect(sanitizeClientPhone('0532123456789')).toBeUndefined();
    });

    it('string olmayan tip (number) → undefined', () => {
      expect(sanitizeClientPhone(5321234567 as unknown)).toBeUndefined();
    });
  });
});
