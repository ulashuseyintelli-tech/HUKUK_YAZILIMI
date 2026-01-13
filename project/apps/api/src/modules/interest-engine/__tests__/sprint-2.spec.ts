/**
 * Sprint-2 Tests: SegmentBuilder Canonical Boundary
 * 
 * Kritik: [start, end) canonical rule
 */

import { 
  DayCountBasis, 
  RoundingMode, 
  RoundingScope,
  SameDayPaymentRule,
} from '../types/common.types';
import { InterestTypeCode, ClaimBucket } from '../types/domain.types';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';
import { generateRateEntryHash } from '../rates/rate-version-hash';
import {
  calculateDays,
  parseIstanbulDate,
  addDays,
  formatIstanbulDate,
  isDateInRange,
  adjustEndDateForPayment,
  determinePhase,
  validateDateRange,
  getDayCountRuleString,
} from '../segments/day-count-calculator';
import {
  generateTimeline,
  getTimelineSegments,
  findRateForDate,
  validateTimeline,
} from '../segments/timeline-generator';
import {
  calculateSegmentInterest,
  roundMoney,
  calculateTotalInterest,
  calculateEffectiveRate,
  verifySegmentInterest,
} from '../segments/interest-formula';
import { SegmentBuilderService } from '../segments/segment-builder.service';

// ═══════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const createMockRate = (
  id: string,
  validFrom: string,
  validTo: string | null,
  annualRate: number,
): RateEntry => ({
  id,
  interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
  validFrom,
  validTo,
  annualRate,
  source: RateSourceType.TCMB,
  sourceReference: `TCMB ${validFrom}`,
  versionHash: generateRateEntryHash({
    interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    validFrom,
    annualRate,
    source: RateSourceType.TCMB,
  }),
  createdAt: new Date().toISOString(),
});

const createMockClaimBucket = (
  id: string,
  amount: number,
  startDate: string,
  fixedRate?: number,
): ClaimBucket => ({
  id,
  amount,
  currency: 'TRY',
  startDate,
  interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
  dayCountBasis: 365,
  fixedRate,
});


describe('Sprint-2: SegmentBuilder Canonical Boundary', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 5.2: Day Count Calculator
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 5.2: Day Count Calculator', () => {
    describe('calculateDays - Canonical [start, end)', () => {
      it('should calculate days correctly (start inclusive, end exclusive)', () => {
        // 01.01 → 05.01 = 4 gün (1,2,3,4)
        expect(calculateDays('2025-01-01', '2025-01-05')).toBe(4);
      });

      it('should return 0 for same day', () => {
        expect(calculateDays('2025-01-01', '2025-01-01')).toBe(0);
      });

      it('should return 1 for consecutive days', () => {
        expect(calculateDays('2025-01-01', '2025-01-02')).toBe(1);
      });

      it('should handle month boundaries', () => {
        // 28.01 → 02.02 = 5 gün
        expect(calculateDays('2025-01-28', '2025-02-02')).toBe(5);
      });

      it('should handle year boundaries', () => {
        // 30.12.2024 → 02.01.2025 = 3 gün
        expect(calculateDays('2024-12-30', '2025-01-02')).toBe(3);
      });

      it('should return negative for reversed dates', () => {
        expect(calculateDays('2025-01-05', '2025-01-01')).toBe(-4);
      });

      it('should handle 30-day month', () => {
        // Full April = 30 days
        expect(calculateDays('2025-04-01', '2025-05-01')).toBe(30);
      });

      it('should handle 31-day month', () => {
        // Full January = 31 days
        expect(calculateDays('2025-01-01', '2025-02-01')).toBe(31);
      });
    });

    describe('parseIstanbulDate', () => {
      it('should parse date in Istanbul timezone', () => {
        const date = parseIstanbulDate('2025-01-15');
        expect(date.getDate()).toBe(15);
        expect(date.getMonth()).toBe(0); // January
        expect(date.getFullYear()).toBe(2025);
      });
    });

    describe('addDays', () => {
      it('should add days correctly', () => {
        expect(addDays('2025-01-01', 5)).toBe('2025-01-06');
      });

      it('should handle month overflow', () => {
        expect(addDays('2025-01-30', 5)).toBe('2025-02-04');
      });
    });

    describe('isDateInRange', () => {
      it('should return true for date in range [start, end)', () => {
        expect(isDateInRange('2025-01-15', '2025-01-01', '2025-01-31')).toBe(true);
      });

      it('should return true for start date (inclusive)', () => {
        expect(isDateInRange('2025-01-01', '2025-01-01', '2025-01-31')).toBe(true);
      });

      it('should return false for end date (exclusive)', () => {
        expect(isDateInRange('2025-01-31', '2025-01-01', '2025-01-31')).toBe(false);
      });
    });

    describe('adjustEndDateForPayment', () => {
      it('should add 1 day for END_OF_DAY rule', () => {
        const result = adjustEndDateForPayment('2025-01-15', SameDayPaymentRule.END_OF_DAY);
        expect(result).toBe('2025-01-16');
      });

      it('should keep same date for START_OF_DAY rule', () => {
        const result = adjustEndDateForPayment('2025-01-15', SameDayPaymentRule.START_OF_DAY);
        expect(result).toBe('2025-01-15');
      });
    });

    describe('determinePhase', () => {
      it('should return PRE_ENFORCEMENT when segment ends before enforcement', () => {
        const phase = determinePhase('2025-01-01', '2025-01-10', '2025-01-15');
        expect(phase).toBe('PRE_ENFORCEMENT');
      });

      it('should return POST_ENFORCEMENT when segment starts at enforcement', () => {
        const phase = determinePhase('2025-01-15', '2025-01-31', '2025-01-15');
        expect(phase).toBe('POST_ENFORCEMENT');
      });

      it('should return POST_ENFORCEMENT when segment starts after enforcement', () => {
        const phase = determinePhase('2025-01-20', '2025-01-31', '2025-01-15');
        expect(phase).toBe('POST_ENFORCEMENT');
      });

      it('should return undefined when no enforcement date', () => {
        const phase = determinePhase('2025-01-01', '2025-01-31', undefined);
        expect(phase).toBeUndefined();
      });
    });

    describe('validateDateRange', () => {
      it('should validate positive range', () => {
        const result = validateDateRange('2025-01-01', '2025-01-31');
        expect(result.valid).toBe(true);
        expect(result.days).toBe(30);
      });

      it('should invalidate negative range', () => {
        const result = validateDateRange('2025-01-31', '2025-01-01');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Negatif');
      });
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 5.1: Timeline Generator
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 5.1: Timeline Generator', () => {
    it('should generate timeline with start and end dates', () => {
      const timeline = generateTimeline('2025-01-01', '2025-01-31', []);
      
      expect(timeline).toHaveLength(2);
      expect(timeline[0]).toBe('2025-01-01');
      expect(timeline[1]).toBe('2025-01-31');
    });

    it('should include rate change dates', () => {
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-14', 0.50),
        createMockRate('r2', '2025-01-15', '2025-01-31', 0.55),
      ];

      const timeline = generateTimeline('2025-01-01', '2025-01-31', rates);

      expect(timeline).toContain('2025-01-15'); // Rate change date
      expect(timeline).toHaveLength(3);
    });

    it('should include enforcement date', () => {
      const timeline = generateTimeline('2025-01-01', '2025-01-31', [], {
        enforcementDate: '2025-01-10',
      });

      expect(timeline).toContain('2025-01-10');
      expect(timeline).toHaveLength(3);
    });

    it('should not include enforcement date outside range', () => {
      const timeline = generateTimeline('2025-01-01', '2025-01-31', [], {
        enforcementDate: '2025-02-15', // Outside range
      });

      expect(timeline).not.toContain('2025-02-15');
      expect(timeline).toHaveLength(2);
    });

    it('should sort dates chronologically', () => {
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-20', null, 0.55),
        createMockRate('r2', '2025-01-10', '2025-01-19', 0.50),
      ];

      const timeline = generateTimeline('2025-01-01', '2025-01-31', rates, {
        enforcementDate: '2025-01-15',
      });

      // Should be sorted
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i] > timeline[i - 1]).toBe(true);
      }
    });
  });

  describe('getTimelineSegments', () => {
    it('should return segment pairs', () => {
      const timeline = ['2025-01-01', '2025-01-15', '2025-01-31'];
      const segments = getTimelineSegments(timeline);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual(['2025-01-01', '2025-01-15']);
      expect(segments[1]).toEqual(['2025-01-15', '2025-01-31']);
    });
  });

  describe('findRateForDate', () => {
    it('should find applicable rate for date', () => {
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-14', 0.50),
        createMockRate('r2', '2025-01-15', null, 0.55),
      ];

      const rate1 = findRateForDate('2025-01-10', rates);
      const rate2 = findRateForDate('2025-01-20', rates);

      expect(rate1?.annualRate).toBe(0.50);
      expect(rate2?.annualRate).toBe(0.55);
    });

    it('should return null for empty rates', () => {
      const rate = findRateForDate('2025-01-10', []);
      expect(rate).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 5.3: Interest Formula
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 5.3: Interest Formula', () => {
    describe('calculateSegmentInterest', () => {
      it('should calculate interest correctly', () => {
        // 100,000 TL * 50% * 30 days / 365 = 4,109.59 TL
        const interest = calculateSegmentInterest(100000, 0.50, 30, 365);
        expect(interest).toBeCloseTo(4109.59, 2);
      });

      it('should return 0 for zero days', () => {
        expect(calculateSegmentInterest(100000, 0.50, 0, 365)).toBe(0);
      });

      it('should return 0 for zero principal', () => {
        expect(calculateSegmentInterest(0, 0.50, 30, 365)).toBe(0);
      });

      it('should handle 360 day basis', () => {
        // 100,000 TL * 50% * 30 days / 360 = 4,166.67 TL
        const interest = calculateSegmentInterest(100000, 0.50, 30, 360);
        expect(interest).toBeCloseTo(4166.67, 2);
      });
    });

    describe('roundMoney', () => {
      it('should round with HALF_UP mode', () => {
        expect(roundMoney(100.005, RoundingMode.HALF_UP)).toBe(100.01);
        expect(roundMoney(100.004, RoundingMode.HALF_UP)).toBe(100.00);
      });

      it('should round with BANKERS mode', () => {
        expect(roundMoney(100.015, RoundingMode.BANKERS)).toBe(100.02);
        expect(roundMoney(100.025, RoundingMode.BANKERS)).toBe(100.02); // Round to even
      });
    });

    describe('calculateTotalInterest', () => {
      it('should calculate total with PER_SEGMENT rounding', () => {
        const segments = [100.005, 200.005, 300.005];
        const result = calculateTotalInterest(segments, RoundingMode.HALF_UP, RoundingScope.PER_SEGMENT);
        
        // Each rounded: 100.01 + 200.01 + 300.01 = 600.03
        expect(result.total).toBe(600.03);
      });

      it('should calculate total with TOTAL_ONLY rounding', () => {
        const segments = [100.005, 200.005, 300.005];
        const result = calculateTotalInterest(segments, RoundingMode.HALF_UP, RoundingScope.TOTAL_ONLY);
        
        // Sum: 600.015, rounded: 600.02
        expect(result.total).toBe(600.02);
      });
    });

    describe('verifySegmentInterest', () => {
      it('should verify correct calculation', () => {
        const interest = calculateSegmentInterest(100000, 0.50, 30, 365);
        const isValid = verifySegmentInterest(100000, 0.50, 30, 365, interest);
        expect(isValid).toBe(true);
      });

      it('should reject incorrect calculation', () => {
        const isValid = verifySegmentInterest(100000, 0.50, 30, 365, 9999);
        expect(isValid).toBe(false);
      });
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 5.4: Segment Builder Service
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 5.4: Segment Builder Service', () => {
    const segmentBuilder = new SegmentBuilderService();

    const defaultOptions = {
      dayCountBasis: 365 as DayCountBasis,
      roundingMode: RoundingMode.HALF_UP,
      roundingScope: RoundingScope.PER_SEGMENT,
      sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
    };

    it('should build segments for single rate period', () => {
      const claim = createMockClaimBucket('c1', 100000, '2025-01-01');
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', null, 0.50),
      ];

      const result = segmentBuilder.buildSegments(claim, '2025-01-31', rates, defaultOptions);

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].days).toBe(30);
      expect(result.segments[0].rate).toBe(0.50);
      expect(result.totalInterest).toBeGreaterThan(0);
    });

    it('should build multiple segments for rate changes', () => {
      const claim = createMockClaimBucket('c1', 100000, '2025-01-01');
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-14', 0.50),
        createMockRate('r2', '2025-01-15', null, 0.55),
      ];

      const result = segmentBuilder.buildSegments(claim, '2025-01-31', rates, defaultOptions);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].rate).toBe(0.50);
      expect(result.segments[1].rate).toBe(0.55);
    });

    it('should separate PRE/POST enforcement phases', () => {
      const claim = createMockClaimBucket('c1', 100000, '2025-01-01');
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', null, 0.50),
      ];

      const result = segmentBuilder.buildSegments(claim, '2025-01-31', rates, {
        ...defaultOptions,
        enforcementDate: '2025-01-15',
      });

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].phase).toBe('PRE_ENFORCEMENT');
      expect(result.segments[1].phase).toBe('POST_ENFORCEMENT');
      expect(result.preEnforcementInterest).toBeGreaterThan(0);
      expect(result.postEnforcementInterest).toBeGreaterThan(0);
    });

    it('should handle fixed rate claim', () => {
      const claim = createMockClaimBucket('c1', 100000, '2025-01-01', 0.48);

      const result = segmentBuilder.buildSegments(claim, '2025-01-31', [], defaultOptions);

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].rate).toBe(0.48);
      expect(result.segments[0].rateSource).toBe('Sabit Oran');
    });

    it('should include dayCountRule in segments', () => {
      const claim = createMockClaimBucket('c1', 100000, '2025-01-01');
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', null, 0.50),
      ];

      const result = segmentBuilder.buildSegments(claim, '2025-01-31', rates, defaultOptions);

      expect(result.segments[0].dayCountRule).toBe('Actual/365');
    });

    it('should return timeline in result', () => {
      const claim = createMockClaimBucket('c1', 100000, '2025-01-01');
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-14', 0.50),
        createMockRate('r2', '2025-01-15', null, 0.55),
      ];

      const result = segmentBuilder.buildSegments(claim, '2025-01-31', rates, defaultOptions);

      expect(result.timeline).toContain('2025-01-01');
      expect(result.timeline).toContain('2025-01-15');
      expect(result.timeline).toContain('2025-01-31');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GOLDEN SCENARIO: Rate Change + Payment Boundary
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Golden Scenario: Rate Change + Payment Boundary', () => {
    const segmentBuilder = new SegmentBuilderService();

    it('should handle rate change on same day as payment (END_OF_DAY)', () => {
      const claim = createMockClaimBucket('c1', 100000, '2025-01-01');
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', '2025-01-14', 0.50),
        createMockRate('r2', '2025-01-15', null, 0.55), // Rate changes on 15th
      ];

      const result = segmentBuilder.buildSegments(claim, '2025-01-31', rates, {
        dayCountBasis: 365,
        roundingMode: RoundingMode.HALF_UP,
        roundingScope: RoundingScope.PER_SEGMENT,
        sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
        paymentDates: ['2025-01-15'], // Payment on same day as rate change
      });

      // Should have segments split at rate change
      expect(result.segments.length).toBeGreaterThanOrEqual(2);
      
      // First segment should use old rate
      expect(result.segments[0].rate).toBe(0.50);
    });

    it('should handle enforcement date splitting segments', () => {
      const claim = createMockClaimBucket('c1', 100000, '2025-01-01');
      const rates: RateEntry[] = [
        createMockRate('r1', '2025-01-01', null, 0.50),
      ];

      const result = segmentBuilder.buildSegments(claim, '2025-01-31', rates, {
        dayCountBasis: 365,
        roundingMode: RoundingMode.HALF_UP,
        roundingScope: RoundingScope.PER_SEGMENT,
        sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
        enforcementDate: '2025-01-10',
      });

      // Should split at enforcement date
      expect(result.segments).toHaveLength(2);
      
      // First segment: [01.01, 10.01) = 9 days, PRE_ENFORCEMENT
      expect(result.segments[0].days).toBe(9);
      expect(result.segments[0].phase).toBe('PRE_ENFORCEMENT');
      
      // Second segment: [10.01, 31.01) = 21 days, POST_ENFORCEMENT
      expect(result.segments[1].days).toBe(21);
      expect(result.segments[1].phase).toBe('POST_ENFORCEMENT');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SPRINT-2 HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Sprint-2 Health Check', () => {
    it('should have getDayCountRuleString helper', () => {
      expect(getDayCountRuleString(365)).toBe('Actual/365');
      expect(getDayCountRuleString(360)).toBe('Actual/360');
    });

    it('should have validateTimeline helper', () => {
      const valid = validateTimeline(['2025-01-01', '2025-01-15', '2025-01-31']);
      expect(valid.valid).toBe(true);

      const invalid = validateTimeline(['2025-01-31', '2025-01-01']);
      expect(invalid.valid).toBe(false);
    });

    it('should have calculateEffectiveRate helper', () => {
      // 100,000 TL principal, 4,109.59 TL interest, 30 days
      const effectiveRate = calculateEffectiveRate(100000, 4109.59, 30, 365);
      expect(effectiveRate).toBeCloseTo(0.50, 2);
    });
  });
});
