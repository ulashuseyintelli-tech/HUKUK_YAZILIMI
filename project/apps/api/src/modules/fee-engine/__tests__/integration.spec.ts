/**
 * Fee Engine Integration Tests
 * 
 * Test kapsamı:
 * - calculateOpeningFees() - farklı takip türleri için
 * - getPostageAmount() ve getPostageTypes()
 * - calculatePenalty() - karşılıksız çek tazminatı
 * - Tarife yükleme ve fallback davranışı
 * - Mock TariffRepository ile entegrasyon
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FeeEngineService, TARIFF_REPOSITORY } from '../fee-engine.service';
import type { ITariffRepository, Tariff, GeneratedFeeItem } from '@shared/types';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK TARIFF REPOSITORY
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_TARIFF_2025: Tariff = {
  version: 1,
  year: 2025,
  effectiveDate: '2025-01-01',
  fixedFees: {
    application_fee: { amount: 615.40, label: 'Başvurma Harcı', itemType: 'FEE', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
    poa_copy_fee: { amount: 87.50, label: 'Vekalet Suret Harcı', itemType: 'FEE', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
    bar_stamp_fee: { amount: 138.00, label: 'Vekalet Pulu', itemType: 'STAMP', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
  },
  rateFees: {
    ilamsiz_pesin_harc: { rate: 0.005, label: 'Peşin Harç', itemType: 'FEE', base: 'principal_plus_interest', appliesTo: ['ILAMSIZ', 'KIRA'], minAmount: 100 },
    kambiyo_pesin_harc: { rate: 0.005, label: 'Peşin Harç', itemType: 'FEE', base: 'principal_plus_interest', appliesTo: ['KAMBIYO'], minAmount: 100 },
  },
  postage: {
    UETS: { amount: 15.00, label: 'UETS Tebligat', description: 'Elektronik tebligat' },
    NORMAL: { amount: 210.00, label: 'Normal Tebligat', description: 'PTT normal tebligat' },
    FAST: { amount: 420.00, label: 'Hızlı Tebligat', description: 'PTT hızlı tebligat' },
    PUBLIC_ANNOUNCEMENT: { amount: null, label: 'İlanen Tebligat', description: 'Gazete ilanı' },
  },
  interestRates: {
    TRY: {
      YASAL: [{ startDate: '2024-01-01', rate: 24 }],
      TICARI: [{ startDate: '2024-01-01', rate: 48 }],
    },
  },
  penalties: {
    bad_check_compensation: { defaultRate: 0.10, maxRate: 0.20, label: 'Karşılıksız Çek Tazminatı' },
  },
};

const MOCK_TARIFF_2026: Tariff = {
  ...MOCK_TARIFF_2025,
  version: 2,
  year: 2026,
  effectiveDate: '2026-01-01',
  fixedFees: {
    ...MOCK_TARIFF_2025.fixedFees,
    application_fee: { amount: 750.00, label: 'Başvurma Harcı', itemType: 'FEE', appliesTo: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
  },
};

class MockTariffRepository implements ITariffRepository {
  private tariffs: Map<number, Tariff> = new Map([
    [2025, MOCK_TARIFF_2025],
    [2026, MOCK_TARIFF_2026],
  ]);

  getTariff(year: number): Tariff | null {
    return this.tariffs.get(year) || null;
  }

  getActiveTariff(): Tariff | null {
    // Mevcut yıl 2026 olduğu için 2026 tarifesini döndür
    const currentYear = new Date().getFullYear();
    return this.tariffs.get(currentYear) || MOCK_TARIFF_2025;
  }

  getAvailableYears(): number[] {
    return Array.from(this.tariffs.keys());
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe('FeeEngineService Integration', () => {
  let service: FeeEngineService;
  let mockTariffRepository: MockTariffRepository;

  beforeEach(async () => {
    mockTariffRepository = new MockTariffRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeEngineService,
        {
          provide: TARIFF_REPOSITORY,
          useValue: mockTariffRepository,
        },
      ],
    }).compile();

    service = module.get<FeeEngineService>(FeeEngineService);
    await service.onModuleInit();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // calculateOpeningFees() Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calculateOpeningFees()', () => {
    describe('ILAMSIZ takip', () => {
      it('sabit harçları doğru hesaplamalı', () => {
        // 2025 tarifesi ile test (sabit değerler için)
        const items = service.calculateOpeningFees('ILAMSIZ', 100_000, 0, 1, 'NORMAL', 2025);

        const applicationFee = items.find(i => i.tariffCode === 'application_fee');
        const poaCopyFee = items.find(i => i.tariffCode === 'poa_copy_fee');
        const barStampFee = items.find(i => i.tariffCode === 'bar_stamp_fee');

        expect(applicationFee).toBeDefined();
        expect(applicationFee!.amount).toBe(615.40);
        expect(applicationFee!.type).toBe('FEE');

        expect(poaCopyFee).toBeDefined();
        expect(poaCopyFee!.amount).toBe(87.50);

        expect(barStampFee).toBeDefined();
        expect(barStampFee!.amount).toBe(138.00);
        expect(barStampFee!.type).toBe('STAMP');
      });

      it('nispi harcı (peşin harç) doğru hesaplamalı', () => {
        const principal = 100_000;
        const interest = 5_000;
        const items = service.calculateOpeningFees('ILAMSIZ', principal, interest, 1, 'NORMAL');

        const pesinHarc = items.find(i => i.tariffCode === 'ilamsiz_pesin_harc');
        expect(pesinHarc).toBeDefined();
        
        // %0.5 oranında: (100000 + 5000) * 0.005 = 525
        expect(pesinHarc!.amount).toBe(525);
      });

      it('nispi harç minimum tutarı uygulamalı', () => {
        // Çok düşük anapara - minimum 100 TL uygulanmalı
        const items = service.calculateOpeningFees('ILAMSIZ', 1_000, 0, 1, 'NORMAL');

        const pesinHarc = items.find(i => i.tariffCode === 'ilamsiz_pesin_harc');
        expect(pesinHarc).toBeDefined();
        
        // 1000 * 0.005 = 5 TL < 100 TL minimum
        expect(pesinHarc!.amount).toBe(100);
      });

      it('tebligat giderini borçlu sayısına göre hesaplamalı', () => {
        const items1 = service.calculateOpeningFees('ILAMSIZ', 100_000, 0, 1, 'NORMAL');
        const items3 = service.calculateOpeningFees('ILAMSIZ', 100_000, 0, 3, 'NORMAL');

        const postage1 = items1.find(i => i.type === 'POSTAGE');
        const postage3 = items3.find(i => i.type === 'POSTAGE');

        expect(postage1!.amount).toBe(210); // 1 borçlu
        expect(postage3!.amount).toBe(630); // 3 borçlu * 210
      });
    });

    describe('KAMBIYO takip', () => {
      it('kambiyo peşin harcını hesaplamalı', () => {
        const items = service.calculateOpeningFees('KAMBIYO', 200_000, 10_000, 1, 'NORMAL');

        const pesinHarc = items.find(i => i.tariffCode === 'kambiyo_pesin_harc');
        expect(pesinHarc).toBeDefined();
        
        // (200000 + 10000) * 0.005 = 1050
        expect(pesinHarc!.amount).toBe(1050);
      });

      it('sabit harçları içermeli', () => {
        const items = service.calculateOpeningFees('KAMBIYO', 100_000, 0, 1, 'NORMAL');

        expect(items.find(i => i.tariffCode === 'application_fee')).toBeDefined();
        expect(items.find(i => i.tariffCode === 'poa_copy_fee')).toBeDefined();
        expect(items.find(i => i.tariffCode === 'bar_stamp_fee')).toBeDefined();
      });
    });

    describe('ILAMLI takip', () => {
      it('nispi harç içermemeli (ilamlı takipte peşin harç yok)', () => {
        const items = service.calculateOpeningFees('ILAMLI', 500_000, 0, 1, 'UETS');

        const pesinHarc = items.find(i => i.label.includes('Peşin Harç'));
        expect(pesinHarc).toBeUndefined();
      });

      it('sabit harçları içermeli', () => {
        const items = service.calculateOpeningFees('ILAMLI', 500_000, 0, 1, 'UETS');

        expect(items.find(i => i.tariffCode === 'application_fee')).toBeDefined();
        expect(items.find(i => i.tariffCode === 'poa_copy_fee')).toBeDefined();
        expect(items.find(i => i.tariffCode === 'bar_stamp_fee')).toBeDefined();
      });
    });

    describe('Tebligat türleri', () => {
      it('UETS tebligat ücreti doğru olmalı', () => {
        const items = service.calculateOpeningFees('ILAMSIZ', 100_000, 0, 1, 'UETS');
        const postage = items.find(i => i.type === 'POSTAGE');
        
        expect(postage!.amount).toBe(15);
        expect(postage!.label).toBe('UETS Tebligat');
      });

      it('FAST tebligat ücreti doğru olmalı', () => {
        const items = service.calculateOpeningFees('ILAMSIZ', 100_000, 0, 1, 'FAST');
        const postage = items.find(i => i.type === 'POSTAGE');
        
        expect(postage!.amount).toBe(420);
        expect(postage!.label).toBe('Hızlı Tebligat');
      });
    });

    describe('Bilinmeyen takip türü', () => {
      it('boş dizi dönmeli', () => {
        const items = service.calculateOpeningFees('UNKNOWN_TYPE', 100_000, 0, 1, 'NORMAL');
        expect(items).toEqual([]);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getPostageAmount() Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getPostageAmount()', () => {
    it('NORMAL tebligat ücreti dönmeli', () => {
      expect(service.getPostageAmount('NORMAL')).toBe(210);
    });

    it('UETS tebligat ücreti dönmeli', () => {
      expect(service.getPostageAmount('UETS')).toBe(15);
    });

    it('FAST tebligat ücreti dönmeli', () => {
      expect(service.getPostageAmount('FAST')).toBe(420);
    });

    it('PUBLIC_ANNOUNCEMENT için 0 dönmeli (amount null)', () => {
      expect(service.getPostageAmount('PUBLIC_ANNOUNCEMENT')).toBe(0);
    });

    it('bilinmeyen tür için 0 dönmeli', () => {
      expect(service.getPostageAmount('UNKNOWN')).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getPostageTypes() Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getPostageTypes()', () => {
    it('tüm tebligat türlerini dönmeli', () => {
      const types = service.getPostageTypes();

      expect(types).toHaveLength(4);
      expect(types.map(t => t.code)).toContain('UETS');
      expect(types.map(t => t.code)).toContain('NORMAL');
      expect(types.map(t => t.code)).toContain('FAST');
      expect(types.map(t => t.code)).toContain('PUBLIC_ANNOUNCEMENT');
    });

    it('her tür için label ve amount içermeli', () => {
      const types = service.getPostageTypes();
      const normal = types.find(t => t.code === 'NORMAL');

      expect(normal).toBeDefined();
      expect(normal!.label).toBe('Normal Tebligat');
      expect(normal!.amount).toBe(210);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // calculatePenalty() Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calculatePenalty()', () => {
    describe('bad_check_compensation (karşılıksız çek tazminatı)', () => {
      it('varsayılan oran ile hesaplamalı (%10)', () => {
        const penalty = service.calculatePenalty('bad_check_compensation', 100_000);
        
        // 100000 * 0.10 = 10000
        expect(penalty).toBe(10_000);
      });

      it('özel oran ile hesaplamalı', () => {
        const penalty = service.calculatePenalty('bad_check_compensation', 100_000, 0.15);
        
        // 100000 * 0.15 = 15000
        expect(penalty).toBe(15_000);
      });

      it('maksimum oranı aşmamalı (%20)', () => {
        const penalty = service.calculatePenalty('bad_check_compensation', 100_000, 0.30);
        
        // 0.30 > 0.20 max, so 100000 * 0.20 = 20000
        expect(penalty).toBe(20_000);
      });

      it('kuruş yuvarlaması yapmalı', () => {
        const penalty = service.calculatePenalty('bad_check_compensation', 12_345.67);
        
        // 12345.67 * 0.10 = 1234.567 → 1234.57
        expect(penalty).toBe(1234.57);
      });
    });

    it('bilinmeyen ceza türü için 0 dönmeli', () => {
      const penalty = service.calculatePenalty('unknown_penalty', 100_000);
      expect(penalty).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // calculateTotalFees() Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calculateTotalFees()', () => {
    it('tüm kalemlerin toplamını hesaplamalı', () => {
      const items: GeneratedFeeItem[] = [
        { type: 'FEE', label: 'Harç 1', amount: 100, currency: 'TRY', isAutoGenerated: true },
        { type: 'FEE', label: 'Harç 2', amount: 200, currency: 'TRY', isAutoGenerated: true },
        { type: 'POSTAGE', label: 'Tebligat', amount: 50, currency: 'TRY', isAutoGenerated: true },
      ];

      expect(service.calculateTotalFees(items)).toBe(350);
    });

    it('boş dizi için 0 dönmeli', () => {
      expect(service.calculateTotalFees([])).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getAllowedPostageTypes() Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAllowedPostageTypes()', () => {
    it('ILAMSIZ için izin verilen türleri dönmeli', () => {
      const allowed = service.getAllowedPostageTypes('ILAMSIZ');
      
      expect(allowed).toContain('UETS');
      expect(allowed).toContain('NORMAL');
      expect(allowed).toContain('FAST');
    });

    it('bilinmeyen tür için varsayılan NORMAL dönmeli', () => {
      const allowed = service.getAllowedPostageTypes('UNKNOWN');
      expect(allowed).toEqual(['NORMAL']);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Tariff Year Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Tarife yılı seçimi', () => {
    it('belirli yıl tarifesi ile hesaplama yapabilmeli', () => {
      // 2026 tarifesinde application_fee 750 TL
      const items2026 = service.calculateOpeningFees('ILAMSIZ', 100_000, 0, 1, 'NORMAL', 2026);
      const appFee2026 = items2026.find(i => i.tariffCode === 'application_fee');
      
      expect(appFee2026!.amount).toBe(750);
    });

    it('getCurrentTariffYear() mevcut yılı dönmeli', () => {
      const year = service.getCurrentTariffYear();
      expect(year).toBe(new Date().getFullYear());
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK BEHAVIOR TESTS (TariffRepository olmadan)
// ═══════════════════════════════════════════════════════════════════════════

describe('FeeEngineService Fallback Behavior', () => {
  let service: FeeEngineService;

  beforeEach(async () => {
    // TariffRepository inject etmeden test
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeeEngineService],
    }).compile();

    service = module.get<FeeEngineService>(FeeEngineService);
    await service.onModuleInit();
  });

  it('TariffRepository olmadan fallback tarife kullanmalı', () => {
    const items = service.calculateOpeningFees('ILAMSIZ', 100_000, 0, 1, 'NORMAL');
    
    // Fallback tarife ile hesaplama yapabilmeli
    expect(items.length).toBeGreaterThan(0);
    
    const appFee = items.find(i => i.tariffCode === 'application_fee');
    expect(appFee).toBeDefined();
    expect(appFee!.amount).toBe(615.40); // Fallback değer
  });

  it('getPostageAmount() fallback ile çalışmalı', () => {
    expect(service.getPostageAmount('NORMAL')).toBe(210);
  });

  it('calculatePenalty() fallback ile çalışmalı', () => {
    const penalty = service.calculatePenalty('bad_check_compensation', 100_000);
    expect(penalty).toBe(10_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('FeeEngineService Edge Cases', () => {
  let service: FeeEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeEngineService,
        {
          provide: TARIFF_REPOSITORY,
          useValue: new MockTariffRepository(),
        },
      ],
    }).compile();

    service = module.get<FeeEngineService>(FeeEngineService);
    await service.onModuleInit();
  });

  it('sıfır anapara ile hesaplama yapabilmeli', () => {
    const items = service.calculateOpeningFees('ILAMSIZ', 0, 0, 1, 'NORMAL');
    
    // Sabit harçlar yine de eklenmeli
    expect(items.find(i => i.tariffCode === 'application_fee')).toBeDefined();
    
    // Nispi harç minimum değer olmalı
    const pesinHarc = items.find(i => i.tariffCode === 'ilamsiz_pesin_harc');
    expect(pesinHarc!.amount).toBe(100); // minimum
  });

  it('negatif değerler için güvenli davranmalı', () => {
    // Negatif değer geçilse bile crash olmamalı
    expect(() => {
      service.calculateOpeningFees('ILAMSIZ', -1000, 0, 1, 'NORMAL');
    }).not.toThrow();
  });

  it('çok yüksek anapara ile hesaplama yapabilmeli', () => {
    const items = service.calculateOpeningFees('ILAMSIZ', 100_000_000, 0, 1, 'NORMAL');
    
    const pesinHarc = items.find(i => i.tariffCode === 'ilamsiz_pesin_harc');
    // 100M * 0.005 = 500,000
    expect(pesinHarc!.amount).toBe(500_000);
  });

  it('borçlu sayısı 0 olduğunda tebligat eklenmemeli', () => {
    const items = service.calculateOpeningFees('ILAMSIZ', 100_000, 0, 0, 'NORMAL');
    
    const postage = items.find(i => i.type === 'POSTAGE');
    expect(postage!.amount).toBe(0);
  });
});
