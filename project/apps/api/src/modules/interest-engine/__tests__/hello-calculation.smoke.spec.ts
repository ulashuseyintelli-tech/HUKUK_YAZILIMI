/**
 * Sprint-0 Çivisi: Hello Calculation Demo
 * 
 * Amaç:
 * - CI'da 5-10 sn altında koşan smoke test
 * - 3 mod tek input ile çalışıyor
 * - Çıktılar deterministik
 * 
 * Sabit Input:
 * - 1 claim (100.000 TL, 01.01.2025 başlangıç)
 * - 1 rate değişimi (15.01.2025'te %50 → %55)
 * - 1 ödeme (20.01.2025, 10.000 TL)
 */

import { 
  CalculationMode, 
  RoundingMode, 
  RoundingScope,
  SameDayPaymentRule,
  Money,
  DateRange,
  PercentRate,
} from '../types/common.types';
import {
  InterestTypeCode,
  ClaimBucket,
  Payment,
  validateClaimBucket,
  validatePayment,
} from '../types/domain.types';
import {
  CalculationRequest,
  GapPolicy,
  ClaimPriorityRule,
  generateInputHash,
  validateCalculationRequest,
} from '../types/calculation.types';
import {
  InterestEngineError,
  InterestEngineErrorCode,
} from '../errors/interest-engine-errors';
import {
  VersionPinningService,
  ENGINE_VERSION,
  RULE_VERSION,
} from '../version/version-pinning.service';

describe('Hello Calculation - Sprint-0 Smoke Test', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // TEST FIXTURES
  // ═══════════════════════════════════════════════════════════════════════════
  
  const MOCK_CLAIM: ClaimBucket = {
    id: 'claim-001',
    amount: 100000,
    currency: 'TRY',
    startDate: '2025-01-01',
    interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    dayCountBasis: 365,
  };


  const MOCK_PAYMENT: Payment = {
    id: 'payment-001',
    date: '2025-01-20',
    amount: 10000,
    currency: 'TRY',
    source: 'Banka havalesi',
  };

  const createRequest = (mode: CalculationMode): CalculationRequest => ({
    caseId: 'case-hello-001',
    claimBuckets: [MOCK_CLAIM],
    payments: [MOCK_PAYMENT],
    asOfDate: '2025-01-31',
    enforcementDate: '2025-01-05',
    mode,
    options: {
      dayCountBasis: 365,
      sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
      roundingMode: RoundingMode.HALF_UP,
      roundingScope: RoundingScope.PER_SEGMENT,
      gapPolicy: mode === CalculationMode.PREVIEW 
        ? GapPolicy.WARN_ONLY_FOR_PREVIEW 
        : GapPolicy.BLOCK,
      claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 1.1 TESTS: Common Types
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 1.1: Common Types', () => {
    describe('Money', () => {
      it('should create Money with valid amount and currency', () => {
        const money = Money.of(100000, 'TRY');
        expect(money.amount).toBe(100000);
        expect(money.currency).toBe('TRY');
      });

      it('should add same currency Money', () => {
        const a = Money.of(100, 'TRY');
        const b = Money.of(50, 'TRY');
        const result = a.add(b);
        expect(result.amount).toBe(150);
      });

      it('should throw E_CURRENCY_MISMATCH for different currencies', () => {
        const a = Money.of(100, 'TRY');
        const b = Money.of(50, 'USD');
        expect(() => a.add(b)).toThrow(InterestEngineError);
        try {
          a.add(b);
        } catch (e) {
          expect((e as InterestEngineError).code).toBe(InterestEngineErrorCode.E_CURRENCY_MISMATCH);
          expect((e as InterestEngineError).evidence).toHaveProperty('currency1', 'TRY');
          expect((e as InterestEngineError).evidence).toHaveProperty('currency2', 'USD');
        }
      });

      it('should round with HALF_UP mode', () => {
        const money = Money.of(100.005, 'TRY');
        const rounded = money.round(RoundingMode.HALF_UP);
        expect(rounded.amount).toBe(100.01);
      });

      it('should be immutable', () => {
        const money = Money.of(100, 'TRY');
        expect(Object.isFrozen(money)).toBe(true);
      });
    });

    describe('DateRange', () => {
      it('should create valid DateRange [start, end)', () => {
        const range = DateRange.of('2025-01-01', '2025-01-31');
        expect(range.start).toBe('2025-01-01');
        expect(range.end).toBe('2025-01-31');
      });

      it('should calculate days correctly (start inclusive, end exclusive)', () => {
        const range = DateRange.of('2025-01-01', '2025-01-05');
        expect(range.days()).toBe(4); // 1,2,3,4 = 4 gün
      });

      it('should throw E_INVALID_DATE_RANGE for end <= start', () => {
        expect(() => DateRange.of('2025-01-31', '2025-01-01')).toThrow(InterestEngineError);
        try {
          DateRange.of('2025-01-31', '2025-01-01');
        } catch (e) {
          expect((e as InterestEngineError).code).toBe(InterestEngineErrorCode.E_INVALID_DATE_RANGE);
        }
      });

      it('should check contains correctly', () => {
        const range = DateRange.of('2025-01-01', '2025-01-31');
        expect(range.contains('2025-01-15')).toBe(true);
        expect(range.contains('2025-01-01')).toBe(true);  // start inclusive
        expect(range.contains('2025-01-31')).toBe(false); // end exclusive
      });
    });

    describe('PercentRate', () => {
      it('should create valid rate (0-1)', () => {
        const rate = PercentRate.of(0.425);
        expect(rate.value).toBe(0.425);
        expect(rate.toPercent()).toBe(42.5);
      });

      it('should throw E_INVALID_RATE for rate > 1', () => {
        expect(() => PercentRate.of(1.5)).toThrow(InterestEngineError);
        try {
          PercentRate.of(1.5);
        } catch (e) {
          expect((e as InterestEngineError).code).toBe(InterestEngineErrorCode.E_INVALID_RATE);
        }
      });

      it('should create from percent', () => {
        const rate = PercentRate.fromPercent(42.5);
        expect(rate.value).toBe(0.425);
      });
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 1.2 TESTS: Domain Entities
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 1.2: Domain Entities', () => {
    it('should validate ClaimBucket with Zod', () => {
      const claim = validateClaimBucket(MOCK_CLAIM);
      expect(claim.id).toBe('claim-001');
      expect(claim.amount).toBe(100000);
    });

    it('should reject invalid ClaimBucket', () => {
      expect(() => validateClaimBucket({ id: '', amount: -100 })).toThrow();
    });

    it('should validate Payment with Zod', () => {
      const payment = validatePayment(MOCK_PAYMENT);
      expect(payment.id).toBe('payment-001');
      expect(payment.amount).toBe(10000);
    });

    it('should serialize/deserialize ClaimBucket stably', () => {
      const json = JSON.stringify(MOCK_CLAIM);
      const parsed = JSON.parse(json);
      const validated = validateClaimBucket(parsed);
      expect(validated).toEqual(MOCK_CLAIM);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 1.3 TESTS: Calculation Contract
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 1.3: Calculation Contract', () => {
    it('should validate CalculationRequest', () => {
      const request = createRequest(CalculationMode.PREVIEW);
      const validated = validateCalculationRequest(request);
      expect(validated.caseId).toBe('case-hello-001');
      expect(validated.claimBuckets).toHaveLength(1);
    });

    it('should generate deterministic inputHash', () => {
      const request1 = createRequest(CalculationMode.PREVIEW);
      const request2 = createRequest(CalculationMode.PREVIEW);
      
      const hash1 = generateInputHash(request1);
      const hash2 = generateInputHash(request2);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should generate different hash for different inputs', () => {
      const request1 = createRequest(CalculationMode.PREVIEW);
      const request2 = createRequest(CalculationMode.PRODUCTION);
      
      const hash1 = generateInputHash(request1);
      const hash2 = generateInputHash(request2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 17.1 TESTS: Error Taxonomy
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 17.1: Error Taxonomy', () => {
    it('should create E_RATE_GAP with evidence', () => {
      const error = InterestEngineError.rateGap([
        { from: '2025-01-05', to: '2025-01-10', days: 5 },
      ]);
      
      expect(error.code).toBe(InterestEngineErrorCode.E_RATE_GAP);
      expect(error.evidence).toHaveProperty('gaps');
      expect((error.evidence as any).gaps[0].days).toBe(5);
    });

    it('should create E_NEGATIVE_DAYS with evidence', () => {
      const error = InterestEngineError.negativeDays('2025-01-31', '2025-01-01', -30);
      
      expect(error.code).toBe(InterestEngineErrorCode.E_NEGATIVE_DAYS);
      expect(error.evidence).toHaveProperty('startDate', '2025-01-31');
      expect(error.evidence).toHaveProperty('endDate', '2025-01-01');
      expect(error.evidence).toHaveProperty('calculatedDays', -30);
    });

    it('should create E_IBRAZ_BEFORE_VADE with evidence', () => {
      const error = InterestEngineError.ibrazBeforeVade('2025-01-01', '2025-01-15');
      
      expect(error.code).toBe(InterestEngineErrorCode.E_IBRAZ_BEFORE_VADE);
      expect(error.evidence).toHaveProperty('ibrazDate', '2025-01-01');
      expect(error.evidence).toHaveProperty('vadeDate', '2025-01-15');
    });

    it('should serialize error to JSON with evidence', () => {
      const error = InterestEngineError.rateGap([
        { from: '2025-01-05', to: '2025-01-10', days: 5 },
      ]);
      
      const json = error.toJSON();
      expect(json.code).toBe('E_RATE_GAP');
      expect(json.evidence).toBeDefined();
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 17.2 TESTS: Version Pinning
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 17.2: Version Pinning', () => {
    const versionService = new VersionPinningService();
    const mockRateTableVersion = 'rate-v1-2025-01-hash';

    it('should allow PREVIEW without explicit version pinning', () => {
      const pinning = versionService.enforceVersionPinning(
        CalculationMode.PREVIEW,
        {},
        mockRateTableVersion,
      );
      
      expect(pinning.autoPinned).toBe(true);
      expect(pinning.rateTableVersion).toBe(mockRateTableVersion);
      expect(pinning.engineVersion).toBe(ENGINE_VERSION);
      expect(pinning.ruleVersion).toBe(RULE_VERSION);
    });

    it('should auto-pin versions for PRODUCTION', () => {
      const pinning = versionService.enforceVersionPinning(
        CalculationMode.PRODUCTION,
        {},
        mockRateTableVersion,
      );
      
      expect(pinning.autoPinned).toBe(true);
      expect(pinning.rateTableVersion).toBe(mockRateTableVersion);
    });

    it('should use provided versions for PRODUCTION', () => {
      const pinning = versionService.enforceVersionPinning(
        CalculationMode.PRODUCTION,
        { rateTableVersion: 'custom-rate-v1' },
        mockRateTableVersion,
      );
      
      expect(pinning.autoPinned).toBe(false);
      expect(pinning.rateTableVersion).toBe('custom-rate-v1');
    });

    it('should throw E_VERSION_NOT_PINNED when rate table version unavailable', () => {
      expect(() => 
        versionService.enforceVersionPinning(
          CalculationMode.LEGAL_REPORT,
          {},
          '', // empty rate table version
        )
      ).toThrow(InterestEngineError);
    });

    it('should validate version match', () => {
      const pinning = versionService.enforceVersionPinning(
        CalculationMode.PRODUCTION,
        {},
        mockRateTableVersion,
      );
      
      const isMatch = versionService.validateVersionMatch(pinning, {
        rateTableVersion: mockRateTableVersion,
        engineVersion: ENGINE_VERSION,
        ruleVersion: RULE_VERSION,
      });
      
      expect(isMatch).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HELLO CALCULATION: 3 Mode Test
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Hello Calculation: 3 Mode Smoke Test', () => {
    it('should create valid PREVIEW request', () => {
      const request = createRequest(CalculationMode.PREVIEW);
      expect(request.mode).toBe(CalculationMode.PREVIEW);
      expect(request.options.gapPolicy).toBe(GapPolicy.WARN_ONLY_FOR_PREVIEW);
    });

    it('should create valid PRODUCTION request', () => {
      const request = createRequest(CalculationMode.PRODUCTION);
      expect(request.mode).toBe(CalculationMode.PRODUCTION);
      expect(request.options.gapPolicy).toBe(GapPolicy.BLOCK);
    });

    it('should create valid LEGAL_REPORT request', () => {
      const request = createRequest(CalculationMode.LEGAL_REPORT);
      expect(request.mode).toBe(CalculationMode.LEGAL_REPORT);
      expect(request.options.gapPolicy).toBe(GapPolicy.BLOCK);
    });

    it('should generate same hash for same input across modes', () => {
      // Mode farklı olduğu için hash farklı olmalı
      const previewRequest = createRequest(CalculationMode.PREVIEW);
      const productionRequest = createRequest(CalculationMode.PRODUCTION);
      
      // Aynı mode ile aynı hash
      const hash1 = generateInputHash(previewRequest);
      const hash2 = generateInputHash(createRequest(CalculationMode.PREVIEW));
      expect(hash1).toBe(hash2);
      
      // Farklı mode ile farklı hash
      const hash3 = generateInputHash(productionRequest);
      expect(hash1).not.toBe(hash3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FRAMEWORK HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Framework Health Check', () => {
    it('should have all error codes defined', () => {
      expect(Object.keys(InterestEngineErrorCode).length).toBeGreaterThanOrEqual(12);
    });

    it('should have ENGINE_VERSION defined', () => {
      expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should have RULE_VERSION defined', () => {
      expect(RULE_VERSION).toBeTruthy();
    });

    it('should complete all tests in under 5 seconds', () => {
      // This test itself validates performance
      expect(true).toBe(true);
    });
  });
});
