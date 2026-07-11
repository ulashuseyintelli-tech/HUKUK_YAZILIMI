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
import {
  CalculationRequest,
  DEFAULT_INTERPRETATION_PROFILE_ID,
  GapPolicy,
} from '../types/calculation.types';
import { ClaimBucket, InterestTypeCode } from '../types/domain.types';
import {
  CalculationMode,
  RoundingMode,
  RoundingScope,
  SameDayPaymentRule,
} from '../types/common.types';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';
import { toCents } from '../allocation/minor-unit';

describe('ADR-014 PR-5 enforcement-date pre/post interest', () => {
  let engine: InterestEngineService;

  const rates: RateEntry[] = [
    {
      id: 'r-pr5',
      interestType: InterestTypeCode.LEGAL_3095,
      validFrom: '2025-01-01',
      validTo: null,
      annualRate: 0.365,
      source: RateSourceType.TCMB,
      versionHash: 'h-pr5',
      createdAt: '2025-01-01T00:00:00Z',
    },
  ];

  const claim = (extra: Partial<ClaimBucket> = {}): ClaimBucket => ({
    id: 'c1',
    amount: 1_000,
    currency: 'TRY',
    startDate: '2025-01-01',
    interestType: InterestTypeCode.LEGAL_3095,
    dayCountBasis: 365,
    ...extra,
  });

  const request = (overrides: Partial<CalculationRequest> = {}): CalculationRequest => ({
    caseId: 'PR5/001',
    claimBuckets: [claim()],
    payments: [],
    asOfDate: '2025-01-21',
    mode: CalculationMode.PREVIEW,
    options: {
      dayCountBasis: 365,
      sameDayPaymentRule: SameDayPaymentRule.START_OF_DAY,
      roundingMode: RoundingMode.HALF_UP,
      roundingScope: RoundingScope.PER_SEGMENT,
      gapPolicy: GapPolicy.BLOCK,
      claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST,
    },
    ...overrides,
  });

  const compute = (input: CalculationRequest, rateEntries = rates) => engine.computeBalance(
    input,
    rateEntries,
    '2025-01-21T10:00:00.000Z',
    DEFAULT_INTERPRETATION_PROFILE_ID,
  );

  const expectCentReconciliation = (result: ReturnType<typeof compute>) => {
    expect(
      toCents(result.preEnforcementInterest ?? 0)
      + toCents(result.postEnforcementInterest ?? 0),
    ).toBe(toCents(result.totalInterest));
  };

  beforeEach(() => {
    engine = new InterestEngineService(
      new PolicyGateV2Service(),
      new SegmentBuilderService(),
      new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
      new LegalReportRendererService(new SegmentReporterService()),
      new AuditWriterService(),
      new VersionPinningService(),
    );
  });

  it('takip tarihi olmayan mevcut sonucu ve phase-less segment davranışını değiştirmez', () => {
    const result = compute(request());

    expect(result.totalInterest).toBe(20);
    expect(result.preEnforcementInterest).toBe(0);
    expect(result.postEnforcementInterest).toBe(0);
    expect(result.segments.map((segment) => segment.phase)).toEqual([undefined]);
  });

  it('tamamı takip öncesindeki tek dönemi PRE olarak toplar', () => {
    const result = compute(request({ asOfDate: '2025-01-11', enforcementDate: '2025-01-21' }));

    expect(result.totalInterest).toBe(10);
    expect(result.preEnforcementInterest).toBe(10);
    expect(result.postEnforcementInterest).toBe(0);
    expect(result.segments.map((segment) => segment.phase)).toEqual(['PRE_ENFORCEMENT']);
    expectCentReconciliation(result);
  });

  it('tamamı takip sonrasındaki tek dönemi POST olarak toplar', () => {
    const result = compute(request({
      claimBuckets: [claim({ startDate: '2025-01-11' })],
      enforcementDate: '2025-01-01',
    }));

    expect(result.totalInterest).toBe(10);
    expect(result.preEnforcementInterest).toBe(0);
    expect(result.postEnforcementInterest).toBe(10);
    expect(result.segments.map((segment) => segment.phase)).toEqual(['POST_ENFORCEMENT']);
    expectCentReconciliation(result);
  });

  it('takip tarihini aşan değişken oranlı dönemi sınırda kayıpsız böler', () => {
    const result = compute(request({ enforcementDate: '2025-01-11' }));

    expect(result.totalInterest).toBe(20);
    expect(result.preEnforcementInterest).toBe(10);
    expect(result.postEnforcementInterest).toBe(10);
    expect(result.segments.map((segment) => [segment.periodStart, segment.periodEnd, segment.phase])).toEqual([
      ['2025-01-01', '2025-01-11', 'PRE_ENFORCEMENT'],
      ['2025-01-11', '2025-01-21', 'POST_ENFORCEMENT'],
    ]);
    expectCentReconciliation(result);
  });

  it('sabit oranlı dönemi de aynı enforcement boundary üzerinde böler', () => {
    const result = compute(request({
      claimBuckets: [claim({
        interestType: InterestTypeCode.COMMERCIAL_FIXED,
        fixedRate: 0.365,
      })],
      enforcementDate: '2025-01-11',
    }));

    expect(result.totalInterest).toBe(20);
    expect(result.preEnforcementInterest).toBe(10);
    expect(result.postEnforcementInterest).toBe(10);
    expect(result.segments.map((segment) => [segment.periodStart, segment.periodEnd, segment.phase])).toEqual([
      ['2025-01-01', '2025-01-11', 'PRE_ENFORCEMENT'],
      ['2025-01-11', '2025-01-21', 'POST_ENFORCEMENT'],
    ]);
    expectCentReconciliation(result);
  });

  it('TOTAL_ONLY dust farkını deterministik olarak POST fazına taşıyıp cent-exact mutabakat sağlar', () => {
    const input = request({
      claimBuckets: [claim({ amount: 4 })],
      asOfDate: '2025-01-03',
      enforcementDate: '2025-01-02',
    });
    input.options.roundingScope = RoundingScope.TOTAL_ONLY;
    const result = compute(input);

    expect(result.totalInterest).toBe(0.01);
    expect(result.preEnforcementInterest).toBe(0);
    expect(result.postEnforcementInterest).toBe(0.01);
    expectCentReconciliation(result);
  });

  it('takip öncesi principal payment PR-4 matrah mutasyonunu korur ve POST yeni matrahla sürer', () => {
    const result = compute(request({
      enforcementDate: '2025-01-15',
      payments: [{ id: 'p1', date: '2025-01-11', amount: 20, currency: 'TRY' }],
    }));

    expect(result.totalInterest).toBe(19.9);
    expect(result.preEnforcementInterest).toBe(13.96);
    expect(result.postEnforcementInterest).toBe(5.94);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 990, accruedInterest: 9.9 });
    expect(result.segments.map((segment) => [
      segment.periodStart,
      segment.periodEnd,
      segment.principal,
      segment.phase,
    ])).toEqual([
      ['2025-01-01', '2025-01-11', 1_000, 'PRE_ENFORCEMENT'],
      ['2025-01-11', '2025-01-15', 990, 'PRE_ENFORCEMENT'],
      ['2025-01-15', '2025-01-21', 990, 'POST_ENFORCEMENT'],
    ]);
    expectCentReconciliation(result);
  });

  it('takip günündeki START_OF_DAY payment önce uygulanır; takip günü yeni principal ile POST olur', () => {
    const result = compute(request({
      enforcementDate: '2025-01-11',
      payments: [{ id: 'p1', date: '2025-01-11', amount: 20, currency: 'TRY' }],
    }));

    expect(result.preEnforcementInterest).toBe(10);
    expect(result.postEnforcementInterest).toBe(9.9);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 990, accruedInterest: 9.9 });
    expect(result.segments.map((segment) => [segment.periodStart, segment.periodEnd, segment.principal, segment.phase]))
      .toEqual([
        ['2025-01-01', '2025-01-11', 1_000, 'PRE_ENFORCEMENT'],
        ['2025-01-11', '2025-01-21', 990, 'POST_ENFORCEMENT'],
      ]);
    expectCentReconciliation(result);
  });

  it('takip günündeki END_OF_DAY payment takip günü faizinden sonra uygulanır', () => {
    const input = request({
      enforcementDate: '2025-01-11',
      payments: [{ id: 'p1', date: '2025-01-11', amount: 20, currency: 'TRY' }],
    });
    input.options.sameDayPaymentRule = SameDayPaymentRule.END_OF_DAY;
    const result = compute(input);

    expect(result.totalInterest).toBe(19.92);
    expect(result.preEnforcementInterest).toBe(10);
    expect(result.postEnforcementInterest).toBe(9.92);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 991, accruedInterest: 8.92 });
    expect(result.segments.map((segment) => [segment.periodStart, segment.periodEnd, segment.principal, segment.phase]))
      .toEqual([
        ['2025-01-01', '2025-01-11', 1_000, 'PRE_ENFORCEMENT'],
        ['2025-01-11', '2025-01-12', 1_000, 'POST_ENFORCEMENT'],
        ['2025-01-12', '2025-01-21', 991, 'POST_ENFORCEMENT'],
      ]);
    expectCentReconciliation(result);
  });

  it('takip sonrası payment yalnız sonraki POST segmentin principal matrahını etkiler', () => {
    const result = compute(request({
      enforcementDate: '2025-01-11',
      payments: [{ id: 'p1', date: '2025-01-15', amount: 20, currency: 'TRY' }],
    }));

    expect(result.totalInterest).toBe(19.96);
    expect(result.preEnforcementInterest).toBe(10);
    expect(result.postEnforcementInterest).toBe(9.96);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 994, accruedInterest: 5.96 });
    expect(result.segments.map((segment) => [segment.periodStart, segment.periodEnd, segment.principal, segment.phase]))
      .toEqual([
        ['2025-01-01', '2025-01-11', 1_000, 'PRE_ENFORCEMENT'],
        ['2025-01-11', '2025-01-15', 1_000, 'POST_ENFORCEMENT'],
        ['2025-01-15', '2025-01-21', 994, 'POST_ENFORCEMENT'],
      ]);
    expectCentReconciliation(result);
  });

  it('takip günündeki çoklu payment input sırasından bağımsız date+id determinism korur', () => {
    const payments = [
      { id: 'p-b', date: '2025-01-11', amount: 5, currency: 'TRY' as const },
      { id: 'p-a', date: '2025-01-11', amount: 20, currency: 'TRY' as const },
    ];
    const first = compute(request({ enforcementDate: '2025-01-11', payments }));
    const second = compute(request({ enforcementDate: '2025-01-11', payments: [...payments].reverse() }));

    expect(first.allocations!.map((step) => step.paymentId)).toEqual(['p-a', 'p-a', 'p-b']);
    expect(second.allocations!.map((step) => step.paymentId)).toEqual(['p-a', 'p-a', 'p-b']);
    expect(second.totalInterest).toBe(first.totalInterest);
    expect(second.preEnforcementInterest).toBe(first.preEnforcementInterest);
    expect(second.postEnforcementInterest).toBe(first.postEnforcementInterest);
    expect(second.finalDebtStates).toEqual(first.finalDebtStates);
    expectCentReconciliation(first);
  });
});
