/**
 * E-G2a testleri — fixedRate birim dönüşümü + zorunluluk guard.
 * Kilitli kararlar: Q1 (% ↔ 0-1 tek dönüştürücü, saf matematik) · Q3 (validateRequest =
 * kanonik enforcement, preview = UX yansıması; E_FIXED_RATE_REQUIRED, silent default yok) · Q5.
 */

import { percentToRate, rateToPercent, requiresFixedRate } from '@shared/types';
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
import { ClaimBucket, InterestTypeCode } from '../types/domain.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from '../types/common.types';
import { InterestEngineErrorCode } from '../errors/interest-engine-errors';

const OPTIONS = {
  dayCountBasis: 365 as const,
  sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
  roundingMode: RoundingMode.HALF_UP,
  roundingScope: RoundingScope.PER_SEGMENT,
  gapPolicy: GapPolicy.BLOCK,
  claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
};

function buildRequest(claim: ClaimBucket): CalculationRequest {
  return {
    caseId: '2025/EG2A/001',
    claimBuckets: [claim],
    asOfDate: '2025-05-01',
    mode: CalculationMode.PREVIEW,
    options: OPTIONS,
  };
}

describe('E-G2a: birim dönüştürücüler (Q1, saf matematik)', () => {
  it('percentToRate: % → 0-1 (sessiz yuvarlama yok)', () => {
    expect(percentToRate(18)).toBe(0.18);
    expect(percentToRate(48)).toBe(0.48);
    expect(percentToRate(0)).toBe(0);
    expect(percentToRate(999.99)).toBeCloseTo(9.9999, 10);
  });

  it('rateToPercent: 0-1 → % (percentToRate tersi)', () => {
    expect(rateToPercent(0.18)).toBeCloseTo(18, 10);
    expect(rateToPercent(0.48)).toBeCloseTo(48, 10);
    expect(rateToPercent(0)).toBe(0);
  });

  it('round-trip: rateToPercent(percentToRate(x)) ≈ x', () => {
    for (const x of [9, 24, 39.75, 60, 999.99]) {
      expect(rateToPercent(percentToRate(x))).toBeCloseTo(x, 8);
    }
  });

  it('percentToRate(x) === x/100 (regresyon: eski ad-hoc /100 ile sayısal AYNI)', () => {
    for (const x of [24, 39.75, 45, 42, 48]) {
      expect(percentToRate(x)).toBe(x / 100);
    }
  });
});

describe('E-G2a: requiresFixedRate tek kaynak (Q5)', () => {
  it('COMMERCIAL_FIXED ve CONTRACTUAL → true', () => {
    expect(requiresFixedRate(InterestTypeCode.COMMERCIAL_FIXED)).toBe(true);
    expect(requiresFixedRate(InterestTypeCode.CONTRACTUAL)).toBe(true);
  });

  it('değişken/diğer türler → false', () => {
    expect(requiresFixedRate(InterestTypeCode.LEGAL_3095)).toBe(false);
    expect(requiresFixedRate(InterestTypeCode.COMMERCIAL_AVANS_3095_2_2)).toBe(false);
    expect(requiresFixedRate(InterestTypeCode.TTK_1530)).toBe(false);
    expect(requiresFixedRate(InterestTypeCode.MEVDUAT_TL_BANKALARCA)).toBe(false);
  });
});

describe('E-G2a: validateRequest guard (Q3 — KANONİK legal enforcement)', () => {
  let engine: InterestEngineService;

  beforeEach(() => {
    const policyGate = new PolicyGateV2Service();
    const segmentBuilder = new SegmentBuilderService();
    const tbk100Allocator = new TBK100AllocatorService();
    const claimPriority = new ClaimPriorityService();
    const allocationEngine = new AllocationEngineService(tbk100Allocator, claimPriority);
    const segmentReporter = new SegmentReporterService();
    const reportRenderer = new LegalReportRendererService(segmentReporter);
    const auditWriter = new AuditWriterService();
    const versionPinning = new VersionPinningService();
    engine = new InterestEngineService(policyGate, segmentBuilder, allocationEngine, reportRenderer, auditWriter, versionPinning);
    auditWriter.clearAll();
  });

  it('COMMERCIAL_FIXED + fixedRate YOK → E_FIXED_RATE_REQUIRED (generic değil)', async () => {
    const claim: ClaimBucket = {
      id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-03-01',
      interestType: InterestTypeCode.COMMERCIAL_FIXED, dayCountBasis: 365,
    };
    await expect(engine.calculate(buildRequest(claim), [], 'tenant-1')).rejects.toMatchObject({
      code: InterestEngineErrorCode.E_FIXED_RATE_REQUIRED,
    });
  });

  it('CONTRACTUAL + fixedRate YOK → E_FIXED_RATE_REQUIRED', async () => {
    const claim: ClaimBucket = {
      id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-03-01',
      interestType: InterestTypeCode.CONTRACTUAL, dayCountBasis: 365,
    };
    await expect(engine.calculate(buildRequest(claim), [], 'tenant-1')).rejects.toMatchObject({
      code: InterestEngineErrorCode.E_FIXED_RATE_REQUIRED,
    });
  });

  it('COMMERCIAL_FIXED + fixedRate VAR (0.48) → guard geçer, fixedRate ile hesaplar', async () => {
    const claim: ClaimBucket = {
      id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-03-01',
      interestType: InterestTypeCode.COMMERCIAL_FIXED, dayCountBasis: 365, fixedRate: 0.48,
    };
    // Segment fixedRate'i kullanır; rate yalnız policy-gate coverage gap'ini engellemek için.
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_FIXED, validFrom: '2025-01-01', validTo: null, annualRate: 0.48, source: RateSourceType.CONTRACT, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
    ];
    const result = await engine.calculate(buildRequest(claim), rates, 'tenant-1');
    expect(result.totalInterest).toBeGreaterThan(0);
  });

  it('değişken tür (COMMERCIAL_AVANS) + fixedRate YOK → guard TETİKLENMEZ', async () => {
    const claim: ClaimBucket = {
      id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-03-01',
      interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365,
    };
    const rates: RateEntry[] = [
      { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: null, annualRate: 0.45, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
    ];
    const result = await engine.calculate(buildRequest(claim), rates, 'tenant-1');
    expect(result.totalInterest).toBeGreaterThan(0);
  });
});

describe('E-G2a: previewCalculation guard (Q3 — UX/diagnostic yansıması)', () => {
  let engine: InterestEngineService;

  beforeEach(() => {
    const policyGate = new PolicyGateV2Service();
    const segmentBuilder = new SegmentBuilderService();
    const tbk100Allocator = new TBK100AllocatorService();
    const claimPriority = new ClaimPriorityService();
    const allocationEngine = new AllocationEngineService(tbk100Allocator, claimPriority);
    const segmentReporter = new SegmentReporterService();
    const reportRenderer = new LegalReportRendererService(segmentReporter);
    const auditWriter = new AuditWriterService();
    const versionPinning = new VersionPinningService();
    engine = new InterestEngineService(policyGate, segmentBuilder, allocationEngine, reportRenderer, auditWriter, versionPinning);
    auditWriter.clearAll();
  });

  it('COMMERCIAL_FIXED + fixedRate YOK → FIXED_RATE_REQUIRED (RATE_NOT_FOUND DEĞİL)', async () => {
    const res = await engine.previewCalculation({
      principalAmount: 100000, startDate: '2025-03-01', endDate: '2025-05-01',
      interestType: 'COMMERCIAL_FIXED',
    });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('FIXED_RATE_REQUIRED');
  });

  it('COMMERCIAL_FIXED + fixedRate=%48 → success (percentToRate ile 0.48 uygulanır)', async () => {
    const res = await engine.previewCalculation({
      principalAmount: 100000, startDate: '2025-03-01', endDate: '2025-05-01',
      interestType: 'COMMERCIAL_FIXED', fixedRate: 48,
    });
    expect(res.success).toBe(true);
    expect(res.data?.estimatedInterest).toBeGreaterThan(0);
  });
});
