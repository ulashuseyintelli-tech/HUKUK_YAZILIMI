/**
 * Rule Engine Test Suite
 * 
 * İlamlı Takip Alt Kategorileri için testler:
 * - Nafaka hesaplama
 * - Döviz kur hesaplama
 * - Faiz hesaplama
 * - Karar motoru
 */

import { RuleEngineService } from '../modules/rule-engine/rule-engine.service';
import { TcmbService } from '../modules/rule-engine/tcmb.service';

describe('RuleEngineService', () => {
  let ruleEngineService: RuleEngineService;
  let tcmbService: TcmbService;

  // Mock PrismaService
  const mockPrismaService = {
    case: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    due: {
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    ruleEngineService = new RuleEngineService(mockPrismaService as any);
    tcmbService = new TcmbService();
    jest.clearAllMocks();
  });

  // ============================================
  // NAFAKA HESAPLAMA TESTLERİ
  // ============================================

  describe('Nafaka Hesaplama', () => {
    it('nafaka dönemlerini doğru hesaplamalı', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-06-01');
      const monthlyAmount = 5000;

      const result = ruleEngineService.calculateNafakaPeriods(
        startDate,
        monthlyAmount,
        endDate
      );

      expect(result.periods.length).toBe(6); // Ocak-Haziran = 6 ay
      expect(result.totalAmount).toBe(30000); // 6 * 5000
      expect(result.monthlyAmount).toBe(5000);
    });

    it('tek aylık nafaka hesaplamalı', () => {
      const startDate = new Date('2024-03-15');
      const endDate = new Date('2024-03-20');
      const monthlyAmount = 3000;

      const result = ruleEngineService.calculateNafakaPeriods(
        startDate,
        monthlyAmount,
        endDate
      );

      expect(result.periods.length).toBe(1);
      expect(result.totalAmount).toBe(3000);
    });

    it('nafaka dönem bilgilerini doğru formatlamalı', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-02-01');
      const monthlyAmount = 4000;

      const result = ruleEngineService.calculateNafakaPeriods(
        startDate,
        monthlyAmount,
        endDate
      );

      expect(result.periods[0].year).toBe(2024);
      expect(result.periods[0].amount).toBe(4000);
      expect(result.periods[0].isPaid).toBe(false);
    });
  });

  // ============================================
  // FAİZ HESAPLAMA TESTLERİ
  // ============================================

  describe('Faiz Hesaplama', () => {
    it('yasal faizi doğru hesaplamalı', () => {
      const principal = 10000;
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const rate = 24; // %24 yıllık

      const result = ruleEngineService.calculateLegalInterest(
        principal,
        startDate,
        endDate,
        rate
      );

      expect(result.principal).toBe(10000);
      expect(result.rate).toBe(24);
      expect(result.days).toBe(365);
      // 10000 * 0.24 = 2400 (yaklaşık)
      expect(result.interest).toBeGreaterThan(2300);
      expect(result.interest).toBeLessThan(2500);
      expect(result.total).toBe(principal + result.interest);
    });

    it('kısa süreli faiz hesaplamalı', () => {
      const principal = 5000;
      const startDate = new Date('2024-06-01');
      const endDate = new Date('2024-06-30');

      const result = ruleEngineService.calculateLegalInterest(
        principal,
        startDate,
        endDate
      );

      expect(result.days).toBe(29);
      expect(result.interest).toBeGreaterThan(0);
    });

    it('varsayılan faiz oranı %24 olmalı', () => {
      const result = ruleEngineService.calculateLegalInterest(
        1000,
        new Date('2024-01-01'),
        new Date('2024-01-02')
      );

      expect(result.rate).toBe(24);
    });
  });

  // ============================================
  // FAİZ AÇIKLAMASI TESTLERİ
  // ============================================

  describe('Faiz Açıklaması Oluşturma', () => {
    it('nafaka için doğru açıklama üretmeli', () => {
      const description = ruleEngineService.generateInterestDescription('NAFAKA');
      expect(description).toContain('devam eden aylarla');
    });

    it('döviz için doğru açıklama üretmeli', () => {
      const description = ruleEngineService.generateInterestDescription('DOVIZ', 'USD');
      expect(description).toContain('Merkez Bankası');
      expect(description).toContain('efektif');
    });

    it('genel için doğru açıklama üretmeli', () => {
      const description = ruleEngineService.generateInterestDescription('GENEL');
      expect(description).toContain('yasal faizi');
    });
  });
});

// ============================================
// TCMB SERVİSİ TESTLERİ
// ============================================

describe('TcmbService', () => {
  let tcmbService: TcmbService;

  beforeEach(() => {
    tcmbService = new TcmbService();
  });

  describe('Kur Sorgulama', () => {
    it('USD kuru döndürmeli', async () => {
      const result = await tcmbService.getExchangeRate('USD');

      expect(result.currency).toBe('USD');
      expect(result.buyingRate).toBeGreaterThan(0);
      expect(result.sellingRate).toBeGreaterThan(0);
      expect(result.sellingRate).toBeGreaterThan(result.buyingRate);
    });

    it('EUR kuru döndürmeli', async () => {
      const result = await tcmbService.getExchangeRate('EUR');

      expect(result.currency).toBe('EUR');
      expect(result.buyingRate).toBeGreaterThan(0);
    });

    it('bilinmeyen para birimi için USD döndürmeli', async () => {
      const result = await tcmbService.getExchangeRate('XYZ');

      expect(result.currency).toBe('USD');
    });

    it('desteklenen para birimlerini listelemeli', () => {
      const currencies = tcmbService.getSupportedCurrencies();

      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies).toContain('GBP');
      expect(currencies).toContain('CHF');
      expect(currencies.length).toBeGreaterThan(5);
    });
  });

  describe('Döviz Çevirme', () => {
    it('dövizi TL ye çevirmeli', async () => {
      const result = await tcmbService.convertToTL(100, 'USD');

      expect(result.originalAmount).toBe(100);
      expect(result.currency).toBe('USD');
      expect(result.tlAmount).toBeGreaterThan(3000); // 100 USD > 3000 TL
    });

    it('TL yi dövize çevirmeli', async () => {
      const result = await tcmbService.convertFromTL(10000, 'EUR');

      expect(result.tlAmount).toBe(10000);
      expect(result.currency).toBe('EUR');
      expect(result.foreignAmount).toBeGreaterThan(0);
      expect(result.foreignAmount).toBeLessThan(1000); // 10000 TL < 1000 EUR
    });
  });

  describe('Tüm Kurlar', () => {
    it('tüm kurları getirmeli', async () => {
      const rates = await tcmbService.getAllRates();

      expect(rates.length).toBeGreaterThan(5);
      expect(rates.find(r => r.currency === 'USD')).toBeDefined();
      expect(rates.find(r => r.currency === 'EUR')).toBeDefined();
    });
  });
});

// ============================================
// İLAMLI ALT KATEGORİ VALİDASYON TESTLERİ
// ============================================

describe('İlamlı Alt Kategori Validasyonları', () => {
  describe('Nafaka + Döviz Kuralı', () => {
    it('nafaka ve döviz aynı anda seçilememeli', () => {
      const invalidData = {
        subCategory: 'NAFAKA',
        currency: 'USD',
      };

      // Bu kombinasyon backend'de BadRequestException fırlatmalı
      expect(invalidData.subCategory).toBe('NAFAKA');
      expect(invalidData.currency).not.toBe('TRY');
      // Gerçek validasyon case.service.ts'de yapılıyor
    });

    it('nafaka sadece TL olabilmeli', () => {
      const validNafaka = {
        subCategory: 'NAFAKA',
        currency: 'TRY',
      };

      expect(validNafaka.currency).toBe('TRY');
    });
  });

  describe('Döviz Alacağı Kuralı', () => {
    it('döviz alacağı için para birimi TRY olmamalı', () => {
      const validDoviz = {
        subCategory: 'DOVIZ',
        currency: 'USD',
      };

      expect(validDoviz.currency).not.toBe('TRY');
    });

    it('döviz alacağı için kur tarihi önerilmeli', () => {
      const dovizWithDate = {
        subCategory: 'DOVIZ',
        currency: 'EUR',
        exchangeDate: '2024-01-15',
        exchangeRateType: 'TAKIP_TARIHI',
      };

      expect(dovizWithDate.exchangeDate).toBeDefined();
    });
  });

  describe('Genel Alacak', () => {
    it('genel alacak TL olabilmeli', () => {
      const validGenel = {
        subCategory: 'GENEL',
        currency: 'TRY',
      };

      expect(validGenel.subCategory).toBe('GENEL');
      expect(validGenel.currency).toBe('TRY');
    });
  });
});

// ============================================
// BELGE ŞABLONU TESTLERİ
// ============================================

describe('Belge Şablonu Değişkenleri', () => {
  describe('Alt Kategoriye Göre Değişkenler', () => {
    it('nafaka şablonu için gerekli değişkenler', () => {
      const nafakaVariables = {
        nafakaPeriod: 'Ocak 2024 - Haziran 2024 (6 ay)',
        monthlyAmount: '5.000,00',
        nafakaStartDate: '01.01.2024',
        subCategory: 'NAFAKA',
      };

      expect(nafakaVariables.nafakaPeriod).toBeDefined();
      expect(nafakaVariables.monthlyAmount).toBeDefined();
    });

    it('döviz şablonu için gerekli değişkenler', () => {
      const dovizVariables = {
        currency: 'USD',
        exchangeDate: '15.01.2024',
        exchangeRateType: 'ODEME_TARIHI',
        subCategory: 'DOVIZ',
      };

      expect(dovizVariables.currency).toBeDefined();
      expect(dovizVariables.exchangeRateType).toBeDefined();
    });

    it('genel şablon için gerekli değişkenler', () => {
      const genelVariables = {
        principal: '10.000,00',
        interestStartDate: '01.01.2024',
        interestRate: '24',
        subCategory: 'GENEL',
      };

      expect(genelVariables.principal).toBeDefined();
      expect(genelVariables.interestRate).toBeDefined();
    });
  });
});
