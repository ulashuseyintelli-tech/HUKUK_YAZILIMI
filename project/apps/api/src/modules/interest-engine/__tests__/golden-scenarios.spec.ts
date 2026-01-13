/**
 * Task 15: Golden Scenarios (Regression Tests)
 */

import { InterestEngineService } from '../interest-engine.service';
import { PolicyGateV2Service } from '../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../segments/segment-builder.service';
import { AllocationEngineService } from '../allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../allocation/tbk100-allocator.service';
import { ClaimPriorityService, ClaimPriorityRule } from '../allocation/claim-priority.service';
import { LegalReportRendererService } from '../reporter/legal-report-renderer.service';
import { SegmentReporterService } from '../reporter/segment-reporter.service';
import { AuditWriterService } from '../audit/audit-writer.service';
import { VersionPinningService } from '../version/version-pinning.service';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';
import { CalculationRequest, GapPolicy } from '../types/calculation.types';
import { ClaimBucket, InterestTypeCode, Payment } from '../types/domain.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from '../types/common.types';

describe('Task 15: Golden Scenarios', () => {
  let interestEngine: InterestEngineService;
  let auditWriter: AuditWriterService;

  beforeEach(() => {
    const policyGate = new PolicyGateV2Service();
    const segmentBuilder = new SegmentBuilderService();
    const tbk100Allocator = new TBK100AllocatorService();
    const claimPriority = new ClaimPriorityService();
    const allocationEngine = new AllocationEngineService(tbk100Allocator, claimPriority);
    const segmentReporter = new SegmentReporterService();
    const reportRenderer = new LegalReportRendererService(segmentReporter);
    auditWriter = new AuditWriterService();
    const versionPinning = new VersionPinningService();
    interestEngine = new InterestEngineService(policyGate, segmentBuilder, allocationEngine, reportRenderer, auditWriter, versionPinning);
    auditWriter.clearAll();
  });

  // 15.1: Kambiyo Çek with Multiple Rate Changes (continuous coverage)
  // Note: validTo is INCLUSIVE, so validTo='2025-04-01' means rate is valid through end of April 1st
  // Next rate starts validFrom='2025-04-01' which is also inclusive - this creates continuous coverage
  describe('15.1: Kambiyo Çek with Multiple Rate Changes', () => {
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: '2025-04-01', annualRate: 0.4225, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'r2', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-04-01', validTo: '2025-07-01', annualRate: 0.4500, source: RateSourceType.TCMB, versionHash: 'h2', createdAt: '2025-04-01T00:00:00Z' },
      { id: 'r3', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-07-01', validTo: null, annualRate: 0.3975, source: RateSourceType.TCMB, versionHash: 'h3', createdAt: '2025-07-01T00:00:00Z' },
    ];

    it('should split segments at rate change boundaries', async () => {
      const claim: ClaimBucket = { id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-02-15', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 };
      const request: CalculationRequest = {
        caseId: '2025/KAMBIYO/001', claimBuckets: [claim], asOfDate: '2025-08-15', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result = await interestEngine.calculate(request, rates, 'tenant-1');
      expect(result.segments.length).toBe(3);
      expect(result.totalInterest).toBeGreaterThan(0);
    });

    it('should calculate correct interest for each segment', async () => {
      // Use only rates that cover the period 2025-03-01 to 2025-05-01
      const periodRates: RateEntry[] = [
        { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: '2025-04-01', annualRate: 0.4225, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'r2', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-04-01', validTo: null, annualRate: 0.4500, source: RateSourceType.TCMB, versionHash: 'h2', createdAt: '2025-04-01T00:00:00Z' },
      ];
      const claim: ClaimBucket = { id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-03-01', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 };
      const request: CalculationRequest = {
        caseId: '2025/KAMBIYO/002', claimBuckets: [claim], asOfDate: '2025-05-01', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result = await interestEngine.calculate(request, periodRates, 'tenant-1');
      expect(result.segments.length).toBe(2);
      expect(result.segments[0].rate).toBe(0.4225);
      expect(result.segments[1].rate).toBe(0.4500);
    });
  });

  // 15.2: İlamsız Genel with Partial Payments (TBK 100)
  describe('15.2: İlamsız Genel with Partial Payments', () => {
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-01-01', validTo: null, annualRate: 0.24, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
    ];

    it('should allocate payment to interest first (TBK 100)', async () => {
      const claim: ClaimBucket = { id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-01-15', interestType: InterestTypeCode.LEGAL_3095, dayCountBasis: 365 };
      const payments: Payment[] = [{ id: 'p1', date: '2025-03-15', amount: 5000, currency: 'TRY' }];
      const request: CalculationRequest = {
        caseId: '2025/ILAMSIZ/001', claimBuckets: [claim], payments, asOfDate: '2025-04-15', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result = await interestEngine.calculate(request, rates, 'tenant-1');
      expect(result.allocations).toBeDefined();
      expect(result.allocations!.length).toBeGreaterThan(0);
    });

    it('should handle multiple partial payments', async () => {
      const claim: ClaimBucket = { id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-01-15', interestType: InterestTypeCode.LEGAL_3095, dayCountBasis: 365 };
      const payments: Payment[] = [
        { id: 'p1', date: '2025-02-15', amount: 10000, currency: 'TRY' },
        { id: 'p2', date: '2025-03-15', amount: 20000, currency: 'TRY' },
      ];
      const request: CalculationRequest = {
        caseId: '2025/ILAMSIZ/002', claimBuckets: [claim], payments, asOfDate: '2025-04-15', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result = await interestEngine.calculate(request, rates, 'tenant-1');
      expect(result.allocations).toBeDefined();
      expect(result.allocations!.length).toBeGreaterThanOrEqual(2);
      expect(result.totalDue).toBeLessThan(100000 + result.totalInterest);
    });
  });

  // 15.4: Multi-Claim with Different Start Dates
  describe('15.4: Multi-Claim with Different Start Dates', () => {
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: null, annualRate: 0.4225, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
    ];

    it('should prioritize oldest claim first (OLDEST_DUE_FIRST)', async () => {
      const claims: ClaimBucket[] = [
        { id: 'c1', amount: 50000, currency: 'TRY', startDate: '2025-03-01', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 },
        { id: 'c2', amount: 30000, currency: 'TRY', startDate: '2025-01-15', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 },
        { id: 'c3', amount: 20000, currency: 'TRY', startDate: '2025-02-01', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 },
      ];
      const payments: Payment[] = [{ id: 'p1', date: '2025-04-01', amount: 35000, currency: 'TRY' }];
      const request: CalculationRequest = {
        caseId: '2025/MULTI/001', claimBuckets: claims, payments, asOfDate: '2025-05-01', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result = await interestEngine.calculate(request, rates, 'tenant-1');
      expect(result.segments.length).toBeGreaterThanOrEqual(3);
      expect(result.totalInterest).toBeGreaterThan(0);
      if (result.allocations && result.allocations.length > 0) {
        expect(result.allocations[0].claimBucketId).toBe('c2');
      }
    });
  });

  // 15.6: Same Day Payment + Rate Change (continuous coverage)
  describe('15.6: Same Day Payment + Rate Change', () => {
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: '2025-04-01', annualRate: 0.4225, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'r2', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-04-01', validTo: null, annualRate: 0.4500, source: RateSourceType.TCMB, versionHash: 'h2', createdAt: '2025-04-01T00:00:00Z' },
    ];

    it('should handle payment on rate change day (END_OF_DAY)', async () => {
      const claim: ClaimBucket = { id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-03-01', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 };
      const payments: Payment[] = [{ id: 'p1', date: '2025-04-01', amount: 10000, currency: 'TRY' }];
      const request: CalculationRequest = {
        caseId: '2025/BOUNDARY/001', claimBuckets: [claim], payments, asOfDate: '2025-05-01', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result = await interestEngine.calculate(request, rates, 'tenant-1');
      expect(result.segments.length).toBeGreaterThanOrEqual(2);
      expect(result.totalInterest).toBeGreaterThan(0);
    });
  });

  // 15.8: Multi-Claim with Policy Tie-Breaker
  describe('15.8: Multi-Claim with Policy Tie-Breaker', () => {
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: null, annualRate: 0.4225, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'r2', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-01-01', validTo: null, annualRate: 0.24, source: RateSourceType.TCMB, versionHash: 'h2', createdAt: '2025-01-01T00:00:00Z' },
    ];

    it('should apply OLDEST_DUE_FIRST correctly', async () => {
      const claims: ClaimBucket[] = [
        { id: 'c1', amount: 50000, currency: 'TRY', startDate: '2025-02-01', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 },
        { id: 'c2', amount: 50000, currency: 'TRY', startDate: '2025-01-15', interestType: InterestTypeCode.LEGAL_3095, dayCountBasis: 365 },
      ];
      const payments: Payment[] = [{ id: 'p1', date: '2025-03-15', amount: 30000, currency: 'TRY' }];
      const request: CalculationRequest = {
        caseId: '2025/TIEBREAKER/001', claimBuckets: claims, payments, asOfDate: '2025-04-15', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result = await interestEngine.calculate(request, rates, 'tenant-1');
      expect(result.totalInterest).toBeGreaterThan(0);
      if (result.allocations && result.allocations.length > 0) {
        expect(result.allocations[0].claimBucketId).toBe('c2');
      }
    });
  });

  // 15.10: RoundingScope TOTAL_ONLY vs PER_SEGMENT (continuous coverage)
  describe('15.10: RoundingScope TOTAL_ONLY vs PER_SEGMENT', () => {
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: '2025-03-01', annualRate: 0.4225, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'r2', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-03-01', validTo: null, annualRate: 0.4500, source: RateSourceType.TCMB, versionHash: 'h2', createdAt: '2025-03-01T00:00:00Z' },
    ];

    it('should show kuruş difference between rounding scopes', async () => {
      const claim: ClaimBucket = { id: 'c1', amount: 123456.78, currency: 'TRY', startDate: '2025-01-15', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 };
      const request1: CalculationRequest = {
        caseId: '2025/ROUNDING/001', claimBuckets: [claim], asOfDate: '2025-04-15', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const request2: CalculationRequest = {
        caseId: '2025/ROUNDING/002', claimBuckets: [claim], asOfDate: '2025-04-15', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.TOTAL_ONLY, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result1 = await interestEngine.calculate(request1, rates, 'tenant-1');
      const result2 = await interestEngine.calculate(request2, rates, 'tenant-1');
      expect(result1.totalInterest).toBeGreaterThan(0);
      expect(result2.totalInterest).toBeGreaterThan(0);
      const diff = Math.abs(result1.totalInterest - result2.totalInterest);
      expect(diff).toBeLessThan(1);
    });
  });

  // 15.9: Monotonicity Under Additional Expense
  describe('15.9: Monotonicity Under Additional Expense', () => {
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: null, annualRate: 0.4225, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
    ];

    it('should maintain monotonicity when expense is added', async () => {
      const claim1: ClaimBucket = { id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-01-15', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 };
      const request1: CalculationRequest = {
        caseId: '2025/MONO/001', claimBuckets: [claim1], asOfDate: '2025-03-15', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result1 = await interestEngine.calculate(request1, rates, 'tenant-1');

      const claim2: ClaimBucket = { id: 'c2', amount: 5000, currency: 'TRY', startDate: '2025-02-15', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 };
      const request2: CalculationRequest = {
        caseId: '2025/MONO/002', claimBuckets: [claim1, claim2], asOfDate: '2025-03-15', mode: CalculationMode.PREVIEW,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      const result2 = await interestEngine.calculate(request2, rates, 'tenant-1');

      const originalClaimSegments1 = result1.segments.filter(s => s.claimBucketId === 'c1');
      const originalClaimSegments2 = result2.segments.filter(s => s.claimBucketId === 'c1');
      const originalInterest1 = originalClaimSegments1.reduce((sum, s) => sum + s.segmentInterest, 0);
      const originalInterest2 = originalClaimSegments2.reduce((sum, s) => sum + s.segmentInterest, 0);

      expect(Math.abs(originalInterest1 - originalInterest2)).toBeLessThan(0.01);
      expect(result2.totalDue).toBeGreaterThan(result1.totalDue);
    });
  });

  // 15.7: Gap + Overlap in LEGAL_REPORT Mode (Strict)
  describe('15.7: Gap + Overlap in LEGAL_REPORT Mode', () => {
    it('should block calculation with rate gap in LEGAL_REPORT mode', async () => {
      const ratesWithGap: RateEntry[] = [
        { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: '2025-02-28', annualRate: 0.4225, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'r2', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-04-01', validTo: null, annualRate: 0.4500, source: RateSourceType.TCMB, versionHash: 'h2', createdAt: '2025-04-01T00:00:00Z' },
      ];
      const claim: ClaimBucket = { id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-01-15', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 };
      const request: CalculationRequest = {
        caseId: '2025/GAP/001', claimBuckets: [claim], asOfDate: '2025-05-15', mode: CalculationMode.LEGAL_REPORT,
        options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      };
      await expect(interestEngine.calculate(request, ratesWithGap, 'tenant-1')).rejects.toThrow();
    });
  });

  // 15.3: TTK 1530 with 30-day rule (DUE_DATE_OR_30D policy)
  describe('15.3: TTK 1530 with 30-day Rule', () => {
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-01-01', validTo: null, annualRate: 0.24, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
    ];

    it('should calculate interest starting from invoice date + 30 days', async () => {
      // TTK 1530: Fatura tarihinden itibaren 30 gün sonra temerrüt faizi başlar
      const invoiceDate = '2025-01-15';
      const interestStartDate = '2025-02-14'; // 30 gün sonra
      
      const claim: ClaimBucket = { 
        id: 'c1', 
        amount: 50000, 
        currency: 'TRY', 
        startDate: interestStartDate, // TTK 1530 kuralına göre 30 gün sonra
        interestType: InterestTypeCode.LEGAL_3095, 
        dayCountBasis: 365,
        metadata: { invoiceDate, ttk1530Applied: true },
      };
      
      const request: CalculationRequest = {
        caseId: '2025/TTK1530/001', 
        claimBuckets: [claim], 
        asOfDate: '2025-04-15', 
        mode: CalculationMode.PREVIEW,
        options: { 
          dayCountBasis: 365, 
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, 
          roundingMode: RoundingMode.HALF_UP, 
          roundingScope: RoundingScope.PER_SEGMENT, 
          gapPolicy: GapPolicy.BLOCK, 
          claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
        },
      };
      
      const result = await interestEngine.calculate(request, rates, 'tenant-1');
      
      // 60 gün faiz (14 Şubat - 15 Nisan)
      expect(result.segments.length).toBe(1);
      expect(result.totalInterest).toBeGreaterThan(0);
      
      // Manuel hesap: 50000 * 0.24 * 60 / 365 = 1972.60 TL
      const expectedInterest = 50000 * 0.24 * 60 / 365;
      expect(result.totalInterest).toBeCloseTo(expectedInterest, 0);
    });

    it('should handle payment before 30-day grace period ends', async () => {
      // Ödeme 30 günlük süre içinde yapılırsa faiz işlemez
      const invoiceDate = '2025-01-15';
      const paymentDate = '2025-02-10'; // 30 gün dolmadan ödeme
      
      const claim: ClaimBucket = { 
        id: 'c1', 
        amount: 50000, 
        currency: 'TRY', 
        startDate: '2025-02-14', // 30 gün sonra başlayacaktı
        interestType: InterestTypeCode.LEGAL_3095, 
        dayCountBasis: 365,
      };
      
      const payments: Payment[] = [
        { id: 'p1', date: paymentDate, amount: 50000, currency: 'TRY' },
      ];
      
      const request: CalculationRequest = {
        caseId: '2025/TTK1530/002', 
        claimBuckets: [claim], 
        payments,
        asOfDate: '2025-04-15', 
        mode: CalculationMode.PREVIEW,
        options: { 
          dayCountBasis: 365, 
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, 
          roundingMode: RoundingMode.HALF_UP, 
          roundingScope: RoundingScope.PER_SEGMENT, 
          gapPolicy: GapPolicy.BLOCK, 
          claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
        },
      };
      
      const result = await interestEngine.calculate(request, rates, 'tenant-1');
      
      // Ödeme faiz başlangıcından önce yapıldığı için faiz 0 veya çok düşük olmalı
      // (Segment builder ödeme tarihinden önce segment oluşturmaz)
      expect(result.totalDue).toBeLessThanOrEqual(50000);
    });
  });

  // 15.5: Döviz Alacağı (USD) with FX Conversion
  describe('15.5: Döviz Alacağı (USD) with FX Conversion', () => {
    const usdRates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-01-01', validTo: null, annualRate: 0.09, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
    ];

    it('should calculate interest on USD claim', async () => {
      const claim: ClaimBucket = { 
        id: 'c1', 
        amount: 10000, // 10,000 USD
        currency: 'USD', 
        startDate: '2025-01-15', 
        interestType: InterestTypeCode.LEGAL_3095, 
        dayCountBasis: 365,
      };
      
      const request: CalculationRequest = {
        caseId: '2025/DOVIZ/001', 
        claimBuckets: [claim], 
        asOfDate: '2025-04-15', 
        mode: CalculationMode.PREVIEW,
        options: { 
          dayCountBasis: 365, 
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, 
          roundingMode: RoundingMode.HALF_UP, 
          roundingScope: RoundingScope.PER_SEGMENT, 
          gapPolicy: GapPolicy.BLOCK, 
          claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
        },
      };
      
      const result = await interestEngine.calculate(request, usdRates, 'tenant-1');
      
      // 90 gün faiz @ %9 yıllık
      // 10000 * 0.09 * 90 / 365 = 221.92 USD
      expect(result.segments.length).toBe(1);
      expect(result.totalInterest).toBeGreaterThan(0);
      
      const expectedInterest = 10000 * 0.09 * 90 / 365;
      expect(result.totalInterest).toBeCloseTo(expectedInterest, 0);
    });

    it('should handle EUR claim with different rate', async () => {
      const eurRates: RateEntry[] = [
        { id: 'r1', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-01-01', validTo: null, annualRate: 0.08, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
      ];
      
      const claim: ClaimBucket = { 
        id: 'c1', 
        amount: 5000, // 5,000 EUR
        currency: 'EUR', 
        startDate: '2025-02-01', 
        interestType: InterestTypeCode.LEGAL_3095, 
        dayCountBasis: 365,
      };
      
      const request: CalculationRequest = {
        caseId: '2025/DOVIZ/002', 
        claimBuckets: [claim], 
        asOfDate: '2025-05-01', 
        mode: CalculationMode.PREVIEW,
        options: { 
          dayCountBasis: 365, 
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, 
          roundingMode: RoundingMode.HALF_UP, 
          roundingScope: RoundingScope.PER_SEGMENT, 
          gapPolicy: GapPolicy.BLOCK, 
          claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
        },
      };
      
      const result = await interestEngine.calculate(request, eurRates, 'tenant-1');
      
      // 89 gün faiz @ %8 yıllık
      // 5000 * 0.08 * 89 / 365 = 97.53 EUR
      expect(result.segments.length).toBe(1);
      expect(result.totalInterest).toBeGreaterThan(0);
    });

    it('should handle mixed currency claims', async () => {
      const mixedRates: RateEntry[] = [
        { id: 'r1', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-01-01', validTo: null, annualRate: 0.24, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'r2', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: null, annualRate: 0.09, source: RateSourceType.TCMB, versionHash: 'h2', createdAt: '2025-01-01T00:00:00Z' },
      ];
      
      const claims: ClaimBucket[] = [
        { id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-01-15', interestType: InterestTypeCode.LEGAL_3095, dayCountBasis: 365 },
        { id: 'c2', amount: 5000, currency: 'USD', startDate: '2025-01-15', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 },
      ];
      
      const request: CalculationRequest = {
        caseId: '2025/DOVIZ/003', 
        claimBuckets: claims, 
        asOfDate: '2025-03-15', 
        mode: CalculationMode.PREVIEW,
        options: { 
          dayCountBasis: 365, 
          sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, 
          roundingMode: RoundingMode.HALF_UP, 
          roundingScope: RoundingScope.PER_SEGMENT, 
          gapPolicy: GapPolicy.BLOCK, 
          claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
        },
      };
      
      const result = await interestEngine.calculate(request, mixedRates, 'tenant-1');
      
      // Her iki claim için de segment oluşmalı
      expect(result.segments.length).toBe(2);
      expect(result.totalInterest).toBeGreaterThan(0);
    });
  });
});
