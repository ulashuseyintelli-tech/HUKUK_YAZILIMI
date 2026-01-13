import { Test, TestingModule } from '@nestjs/testing';
import { ExpenseCalculatorService, CaseData, EXPENSE_SET_TEMPLATES } from './expense-calculator.service';
import { TariffService } from '@/modules/tariff/tariff.service';

// Mock TariffService
const mockTariffService = {
  getActiveTariff: jest.fn().mockReturnValue({
    fixed_fees: {
      application_fee: { amount: 738.50 },
      poa_copy_fee: { amount: 105.00 },
      bar_stamp_fee: { amount: 165.60 },
      file_expense: { amount: 50.00 },
    },
    rate_fees: {
      ilamsiz_pesin_harc: { rate: 0.005, min_amount: 120 },
    },
    postage: {
      NORMAL: { amount: 252.00 },
      UETS: { amount: 18.00 },
      FAST: { amount: 504.00 },
    },
    seizure_fees: {
      haciz_harci: { rate: 0.0044, min_amount: 100 },
      haciz_yolluk: { amount: 350.00 },
    },
    sale_fees: {
      ilan_gideri: { amount: 2500.00 },
      satis_harci: { rate: 0.0113 },
    },
  }),
};

describe('ExpenseCalculatorService', () => {
  let service: ExpenseCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseCalculatorService,
        { provide: TariffService, useValue: mockTariffService },
      ],
    }).compile();

    service = module.get<ExpenseCalculatorService>(ExpenseCalculatorService);
  });

  describe('Property 8: Tariff Calculation Correctness', () => {
    /**
     * Property: For any principal amount, the calculated Başvurma Harcı 
     * should match the fixed amount in the current tariff table.
     */
    it('should calculate Başvurma Harcı as fixed amount from tariff', () => {
      const testAmounts = [1000, 10000, 100000, 1000000, 5000000];
      
      for (const amount of testAmounts) {
        const result = service.calculateBasvurmaHarci(amount);
        expect(result.toNumber()).toBe(738.50);
      }
    });

    /**
     * Property: For any principal amount, the calculated Peşin Harç 
     * should be max(principal * 0.005, minAmount).
     */
    it('should calculate Peşin Harç correctly with minimum threshold', () => {
      // Below minimum threshold
      const smallAmount = service.calculatePesinHarc(10000); // 10000 * 0.005 = 50 < 120
      expect(smallAmount.toNumber()).toBe(120); // Should be minimum

      // Above minimum threshold
      const largeAmount = service.calculatePesinHarc(100000); // 100000 * 0.005 = 500 > 120
      expect(largeAmount.toNumber()).toBe(500);

      // With interest
      const withInterest = service.calculatePesinHarc(100000, 20000); // (100000 + 20000) * 0.005 = 600
      expect(withInterest.toNumber()).toBe(600);
    });

    /**
     * Property: Peşin Harç should never be less than minimum amount.
     */
    it('should never return Peşin Harç below minimum', () => {
      const testAmounts = [0, 100, 1000, 5000, 10000, 20000];
      const minAmount = 120;

      for (const amount of testAmounts) {
        const result = service.calculatePesinHarc(amount);
        expect(result.toNumber()).toBeGreaterThanOrEqual(minAmount);
      }
    });

    /**
     * Property: Tebligat Gideri should scale linearly with count.
     */
    it('should calculate Tebligat Gideri linearly with count', () => {
      const unitPrice = 252.00;
      
      for (let count = 1; count <= 5; count++) {
        const result = service.calculateTebligatGideri(count);
        expect(result.toNumber()).toBe(unitPrice * count);
      }
    });

    /**
     * Property: Fixed fees should always return the same value.
     */
    it('should return consistent fixed fees', () => {
      expect(service.calculateVekaletHarci().toNumber()).toBe(105.00);
      expect(service.calculateDosyaGideri().toNumber()).toBe(50.00);
      expect(service.calculateVekaletPulu().toNumber()).toBe(165.60);
      expect(service.calculateHacizYolluk().toNumber()).toBe(350.00);
      expect(service.calculateIlanGideri().toNumber()).toBe(2500.00);
    });

    /**
     * Property: Haciz Harcı should be max(principal * rate, minAmount).
     */
    it('should calculate Haciz Harcı with minimum threshold', () => {
      // Below minimum: 10000 * 0.0044 = 44 < 100
      const small = service.calculateHacizHarci(10000);
      expect(small.toNumber()).toBe(100);

      // Above minimum: 100000 * 0.0044 = 440 > 100
      const large = service.calculateHacizHarci(100000);
      expect(large.toNumber()).toBe(440);
    });

    /**
     * Property: Satış Harcı should be proportional to sale amount.
     */
    it('should calculate Satış Harcı proportionally', () => {
      const rate = 0.0113;
      const testAmounts = [100000, 500000, 1000000];

      for (const amount of testAmounts) {
        const result = service.calculateSatisHarci(amount);
        expect(result.toNumber()).toBeCloseTo(amount * rate, 2);
      }
    });
  });

  describe('Opening Expenses Calculation', () => {
    /**
     * Property: Opening expenses should always contain exactly 6 items.
     */
    it('should return exactly 6 items for opening expenses', () => {
      const caseData: CaseData = {
        principalAmount: 100000,
        interestAmount: 10000,
        caseType: 'ILAMSIZ',
        debtorCount: 1,
      };

      const items = service.calculateOpeningExpenses(caseData);
      expect(items).toHaveLength(6);
    });

    /**
     * Property: All opening expense items should have positive amounts.
     */
    it('should return positive amounts for all opening expense items', () => {
      const caseData: CaseData = {
        principalAmount: 100000,
        caseType: 'ILAMSIZ',
      };

      const items = service.calculateOpeningExpenses(caseData);
      
      for (const item of items) {
        expect(item.suggestedAmount).toBeGreaterThan(0);
      }
    });

    /**
     * Property: Opening expenses should include all required item codes.
     */
    it('should include all required item codes', () => {
      const caseData: CaseData = {
        principalAmount: 100000,
        caseType: 'ILAMSIZ',
      };

      const items = service.calculateOpeningExpenses(caseData);
      const itemCodes = items.map(i => i.itemCode);

      expect(itemCodes).toContain('BASVURMA_HARCI');
      expect(itemCodes).toContain('PESIN_HARC');
      expect(itemCodes).toContain('VEKALET_HARCI');
      expect(itemCodes).toContain('TEBLIGAT_GIDERI');
      expect(itemCodes).toContain('DOSYA_GIDERI');
      expect(itemCodes).toContain('VEKALET_PULU');
    });

    /**
     * Property: Total should equal sum of all items.
     */
    it('should calculate correct total', () => {
      const caseData: CaseData = {
        principalAmount: 100000,
        caseType: 'ILAMSIZ',
      };

      const items = service.calculateOpeningExpenses(caseData);
      const calculatedTotal = service.calculateTotal(items);
      const manualTotal = items.reduce((sum, item) => sum + item.suggestedAmount, 0);

      expect(calculatedTotal).toBe(manualTotal);
    });
  });

  describe('Stage Expenses Calculation', () => {
    /**
     * Property: RE_NOTIFICATION stage should have 1 item.
     */
    it('should return 1 item for RE_NOTIFICATION stage', () => {
      const caseData: CaseData = { principalAmount: 100000, caseType: 'ILAMSIZ' };
      const items = service.calculateStageExpenses('RE_NOTIFICATION', caseData);
      expect(items).toHaveLength(1);
      expect(items[0].itemCode).toBe('YENIDEN_TEBLIGAT');
    });

    /**
     * Property: SEIZURE stage should have 2 items.
     */
    it('should return 2 items for SEIZURE stage', () => {
      const caseData: CaseData = { principalAmount: 100000, caseType: 'ILAMSIZ' };
      const items = service.calculateStageExpenses('SEIZURE', caseData);
      expect(items).toHaveLength(2);
    });

    /**
     * Property: SALE stage should have 2 items.
     */
    it('should return 2 items for SALE stage', () => {
      const caseData: CaseData = { principalAmount: 100000, caseType: 'ILAMSIZ' };
      const items = service.calculateStageExpenses('SALE', caseData);
      expect(items).toHaveLength(2);
    });

    /**
     * Property: Unknown stage should return empty array.
     */
    it('should return empty array for unknown stage', () => {
      const caseData: CaseData = { principalAmount: 100000, caseType: 'ILAMSIZ' };
      const items = service.calculateStageExpenses('UNKNOWN_STAGE', caseData);
      expect(items).toHaveLength(0);
    });
  });

  describe('Template Management', () => {
    it('should return correct template for valid stage code', () => {
      const template = service.getTemplate('OPENING');
      expect(template).toBeDefined();
      expect(template?.code).toBe('OPENING');
      expect(template?.gateType).toBe('BLOCKING');
    });

    it('should return null for invalid stage code', () => {
      const template = service.getTemplate('INVALID');
      expect(template).toBeNull();
    });

    it('should return all templates', () => {
      const templates = service.getAllTemplates();
      expect(Object.keys(templates)).toContain('OPENING');
      expect(Object.keys(templates)).toContain('RE_NOTIFICATION');
      expect(Object.keys(templates)).toContain('SEIZURE');
      expect(Object.keys(templates)).toContain('SALE');
    });
  });
});
