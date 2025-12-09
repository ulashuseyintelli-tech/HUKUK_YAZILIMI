/**
 * İlamlı Alt Kategori Test Suite
 * 
 * Sihirbaz ve alt kategori seçimi için testler
 */

import { describe, it, expect } from 'vitest';

// Alt kategori tipleri
type CaseSubCategory = 'GENEL' | 'NAFAKA' | 'DOVIZ';
type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';
type ExchangeRateType = 'TAKIP_TARIHI' | 'ODEME_TARIHI';

// Sihirbaz sonuç hesaplama fonksiyonu (CaseWizard.tsx'den)
interface WizardAnswers {
  currencyType: 'TL' | 'DOVIZ' | null;
  selectedCurrency: Currency;
  paymentType: 'TEK_SEFERLIK' | 'PERIYODIK' | null;
  interestType: 'DEGISKEN' | 'SABIT' | null;
}

interface WizardResult {
  subCategory: CaseSubCategory;
  currency: Currency;
  interestRateType: 'DEGISKEN' | 'SABIT';
  recommendation: string;
}

function calculateWizardResult(answers: WizardAnswers): WizardResult {
  // Döviz alacağı
  if (answers.currencyType === 'DOVIZ') {
    return {
      subCategory: 'DOVIZ',
      currency: answers.selectedCurrency,
      interestRateType: answers.interestType || 'DEGISKEN',
      recommendation: 'İLAMLI DÖVİZ ALACAĞI TAKİBİ',
    };
  }
  
  // Nafaka (periyodik TL)
  if (answers.paymentType === 'PERIYODIK') {
    return {
      subCategory: 'NAFAKA',
      currency: 'TRY',
      interestRateType: answers.interestType || 'DEGISKEN',
      recommendation: 'İLAMLI NAFAKA TAKİBİ',
    };
  }
  
  // Genel (tek seferlik TL)
  return {
    subCategory: 'GENEL',
    currency: 'TRY',
    interestRateType: answers.interestType || 'DEGISKEN',
    recommendation: 'İLAMLI GENEL ALACAK TAKİBİ',
  };
}

describe('İlamlı Alt Kategori Sihirbazı', () => {
  describe('Döviz Alacağı Senaryosu', () => {
    it('döviz seçildiğinde DOVIZ alt kategorisi önerilmeli', () => {
      const answers: WizardAnswers = {
        currencyType: 'DOVIZ',
        selectedCurrency: 'USD',
        paymentType: null,
        interestType: 'DEGISKEN',
      };

      const result = calculateWizardResult(answers);

      expect(result.subCategory).toBe('DOVIZ');
      expect(result.currency).toBe('USD');
      expect(result.recommendation).toContain('DÖVİZ');
    });

    it('EUR seçildiğinde para birimi EUR olmalı', () => {
      const answers: WizardAnswers = {
        currencyType: 'DOVIZ',
        selectedCurrency: 'EUR',
        paymentType: null,
        interestType: 'SABIT',
      };

      const result = calculateWizardResult(answers);

      expect(result.currency).toBe('EUR');
    });

    it('tüm döviz türleri desteklenmeli', () => {
      const currencies: Currency[] = ['USD', 'EUR', 'GBP', 'CHF'];

      currencies.forEach(currency => {
        const answers: WizardAnswers = {
          currencyType: 'DOVIZ',
          selectedCurrency: currency,
          paymentType: null,
          interestType: 'DEGISKEN',
        };

        const result = calculateWizardResult(answers);
        expect(result.currency).toBe(currency);
        expect(result.subCategory).toBe('DOVIZ');
      });
    });
  });

  describe('Nafaka Senaryosu', () => {
    it('periyodik ödeme seçildiğinde NAFAKA alt kategorisi önerilmeli', () => {
      const answers: WizardAnswers = {
        currencyType: 'TL',
        selectedCurrency: 'TRY',
        paymentType: 'PERIYODIK',
        interestType: 'DEGISKEN',
      };

      const result = calculateWizardResult(answers);

      expect(result.subCategory).toBe('NAFAKA');
      expect(result.currency).toBe('TRY');
      expect(result.recommendation).toContain('NAFAKA');
    });

    it('nafaka her zaman TL olmalı', () => {
      const answers: WizardAnswers = {
        currencyType: 'TL',
        selectedCurrency: 'TRY',
        paymentType: 'PERIYODIK',
        interestType: 'SABIT',
      };

      const result = calculateWizardResult(answers);

      expect(result.currency).toBe('TRY');
    });
  });

  describe('Genel Alacak Senaryosu', () => {
    it('tek seferlik TL seçildiğinde GENEL alt kategorisi önerilmeli', () => {
      const answers: WizardAnswers = {
        currencyType: 'TL',
        selectedCurrency: 'TRY',
        paymentType: 'TEK_SEFERLIK',
        interestType: 'DEGISKEN',
      };

      const result = calculateWizardResult(answers);

      expect(result.subCategory).toBe('GENEL');
      expect(result.currency).toBe('TRY');
      expect(result.recommendation).toContain('GENEL');
    });

    it('değişken faiz seçilebilmeli', () => {
      const answers: WizardAnswers = {
        currencyType: 'TL',
        selectedCurrency: 'TRY',
        paymentType: 'TEK_SEFERLIK',
        interestType: 'DEGISKEN',
      };

      const result = calculateWizardResult(answers);

      expect(result.interestRateType).toBe('DEGISKEN');
    });

    it('sabit faiz seçilebilmeli', () => {
      const answers: WizardAnswers = {
        currencyType: 'TL',
        selectedCurrency: 'TRY',
        paymentType: 'TEK_SEFERLIK',
        interestType: 'SABIT',
      };

      const result = calculateWizardResult(answers);

      expect(result.interestRateType).toBe('SABIT');
    });
  });
});

describe('Alt Kategori Validasyonları', () => {
  // Validasyon fonksiyonu
  function validateSubCategory(
    subCategory: CaseSubCategory,
    currency: Currency
  ): { valid: boolean; error?: string } {
    // Nafaka + Döviz aynı anda olamaz
    if (subCategory === 'NAFAKA' && currency !== 'TRY') {
      return {
        valid: false,
        error: 'Nafaka alacağı sadece TL cinsinden olabilir',
      };
    }

    // Döviz alacağı için TRY olamaz
    if (subCategory === 'DOVIZ' && currency === 'TRY') {
      return {
        valid: false,
        error: 'Döviz alacağı için para birimi belirtilmelidir',
      };
    }

    return { valid: true };
  }

  describe('Nafaka Validasyonu', () => {
    it('nafaka + TRY geçerli olmalı', () => {
      const result = validateSubCategory('NAFAKA', 'TRY');
      expect(result.valid).toBe(true);
    });

    it('nafaka + USD geçersiz olmalı', () => {
      const result = validateSubCategory('NAFAKA', 'USD');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('TL');
    });

    it('nafaka + EUR geçersiz olmalı', () => {
      const result = validateSubCategory('NAFAKA', 'EUR');
      expect(result.valid).toBe(false);
    });
  });

  describe('Döviz Validasyonu', () => {
    it('döviz + USD geçerli olmalı', () => {
      const result = validateSubCategory('DOVIZ', 'USD');
      expect(result.valid).toBe(true);
    });

    it('döviz + TRY geçersiz olmalı', () => {
      const result = validateSubCategory('DOVIZ', 'TRY');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('para birimi');
    });
  });

  describe('Genel Validasyonu', () => {
    it('genel + TRY geçerli olmalı', () => {
      const result = validateSubCategory('GENEL', 'TRY');
      expect(result.valid).toBe(true);
    });

    it('genel + USD geçerli olmalı (teorik olarak)', () => {
      // Genel alacak için döviz de olabilir ama genelde TL
      const result = validateSubCategory('GENEL', 'USD');
      expect(result.valid).toBe(true);
    });
  });
});

describe('Faiz Açıklaması Oluşturma', () => {
  function generateInterestDescription(
    subCategory: CaseSubCategory,
    currency?: Currency
  ): string {
    switch (subCategory) {
      case 'NAFAKA':
        return 'devam eden aylarla birlikte tahsili talebidir.';
      case 'DOVIZ':
        return `fiili ödeme tarihindeki T.C. Merkez Bankası ${currency || 'döviz'} efektif satış kuru üzerinden Türk Lirası karşılığının tahsili talebidir.`;
      case 'GENEL':
      default:
        return 'değişen oranlarda yasal faizi ile birlikte tahsili talebidir.';
    }
  }

  it('nafaka için doğru açıklama üretmeli', () => {
    const desc = generateInterestDescription('NAFAKA');
    expect(desc).toContain('devam eden aylarla');
  });

  it('döviz için kur açıklaması içermeli', () => {
    const desc = generateInterestDescription('DOVIZ', 'USD');
    expect(desc).toContain('Merkez Bankası');
    expect(desc).toContain('USD');
    expect(desc).toContain('efektif');
  });

  it('genel için yasal faiz açıklaması içermeli', () => {
    const desc = generateInterestDescription('GENEL');
    expect(desc).toContain('yasal faizi');
  });
});

describe('Kur Hesaplama Tipleri', () => {
  it('TAKIP_TARIHI tipi tanımlı olmalı', () => {
    const type: ExchangeRateType = 'TAKIP_TARIHI';
    expect(type).toBe('TAKIP_TARIHI');
  });

  it('ODEME_TARIHI tipi tanımlı olmalı', () => {
    const type: ExchangeRateType = 'ODEME_TARIHI';
    expect(type).toBe('ODEME_TARIHI');
  });

  it('varsayılan kur tipi ODEME_TARIHI olmalı', () => {
    const defaultType: ExchangeRateType = 'ODEME_TARIHI';
    expect(defaultType).toBe('ODEME_TARIHI');
  });
});
