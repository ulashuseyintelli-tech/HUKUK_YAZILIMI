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
import { AncillaryType, ClaimBucket, InterestTypeCode } from '../types/domain.types';
import {
  CalculationMode,
  RoundingMode,
  RoundingScope,
  SameDayPaymentRule,
} from '../types/common.types';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';

describe('ADR-014 PR-4 partial-payment interest-base mutation', () => {
  let engine: InterestEngineService;

  const rates: RateEntry[] = [
    {
      id: 'r-pr4',
      interestType: InterestTypeCode.LEGAL_3095,
      validFrom: '2025-01-01',
      validTo: null,
      annualRate: 0.365,
      source: RateSourceType.TCMB,
      versionHash: 'h-pr4',
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

  const request = (
    claimBuckets: ClaimBucket[],
    payments: CalculationRequest['payments'],
  ): CalculationRequest => ({
    caseId: 'PR4/001',
    claimBuckets,
    payments,
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
  });

  const compute = (input: CalculationRequest) => engine.computeBalance(
    input,
    rates,
    '2025-01-21T10:00:00.000Z',
    DEFAULT_INTERPRETATION_PROFILE_ID,
  );

  const allocated = (
    result: ReturnType<InterestEngineService['computeBalance']>,
    category: 'INTEREST' | 'PRINCIPAL',
  ) => (result.allocations ?? [])
    .flatMap((step) => step.allocations)
    .filter((allocation) => allocation.category === category)
    .reduce((sum, allocation) => sum + allocation.amountAllocated, 0);

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

  it('interest-only payment leaves principal and future interest base unchanged', () => {
    const result = compute(request([claim()], [
      { id: 'p1', date: '2025-01-11', amount: 5, currency: 'TRY' },
    ]));

    expect(allocated(result, 'PRINCIPAL')).toBe(0);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 1_000, accruedInterest: 15 });
    expect(result.totalInterest).toBe(20);
    expect(result.segments.map((segment) => segment.principal)).toEqual([1_000, 1_000]);
  });

  it('cost, ancillary and interest allocation does not mutate principal base', () => {
    const result = compute(request([
      claim({
        costs: { [AncillaryType.HARC]: 8 } as Record<AncillaryType, number>,
        ancillaries: { [AncillaryType.VEKALET_UCRETI]: 4 } as Record<AncillaryType, number>,
      }),
    ], [
      { id: 'p1', date: '2025-01-11', amount: 20, currency: 'TRY' },
    ]));

    expect(allocated(result, 'PRINCIPAL')).toBe(0);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 1_000, accruedInterest: 12 });
    expect(result.totalInterest).toBe(20);
    expect(result.segments.map((segment) => segment.principal)).toEqual([1_000, 1_000]);
  });

  it('principal-reaching payment reduces only the future interest base', () => {
    const result = compute(request([claim()], [
      { id: 'p1', date: '2025-01-11', amount: 20, currency: 'TRY' },
    ]));

    expect(allocated(result, 'INTEREST')).toBe(10);
    expect(allocated(result, 'PRINCIPAL')).toBe(10);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 990, accruedInterest: 9.9 });
    expect(result.totalInterest).toBe(19.9);
    expect(result.segments.map((segment) => [
      segment.periodStart,
      segment.periodEnd,
      segment.principal,
      segment.segmentInterest,
    ])).toEqual([
      ['2025-01-01', '2025-01-11', 1_000, 10],
      ['2025-01-11', '2025-01-21', 990, 9.9],
    ]);
  });

  it('applies END_OF_DAY principal mutation after payment-day interest accrual', () => {
    const input = request([claim()], [
      { id: 'p1', date: '2025-01-11', amount: 20, currency: 'TRY' },
    ]);
    input.options.sameDayPaymentRule = SameDayPaymentRule.END_OF_DAY;
    const result = compute(input);

    expect(allocated(result, 'INTEREST')).toBe(11);
    expect(allocated(result, 'PRINCIPAL')).toBe(9);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 991, accruedInterest: 8.92 });
    expect(result.totalInterest).toBe(19.92);
    expect(result.segments.map((segment) => [
      segment.periodStart,
      segment.periodEnd,
      segment.principal,
      segment.segmentInterest,
    ])).toEqual([
      ['2025-01-01', '2025-01-12', 1_000, 11],
      ['2025-01-12', '2025-01-21', 991, 8.92],
    ]);
  });

  it('multiple periods continue from the base produced by prior allocations', () => {
    const result = compute(request([claim()], [
      { id: 'p1', date: '2025-01-06', amount: 3, currency: 'TRY' },
      { id: 'p2', date: '2025-01-11', amount: 20, currency: 'TRY' },
    ]));

    expect(allocated(result, 'PRINCIPAL')).toBe(13);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 987, accruedInterest: 9.87 });
    expect(result.totalInterest).toBe(19.87);
    expect(result.segments.map((segment) => [
      segment.periodStart,
      segment.periodEnd,
      segment.principal,
      segment.segmentInterest,
    ])).toEqual([
      ['2025-01-01', '2025-01-06', 1_000, 5],
      ['2025-01-06', '2025-01-11', 1_000, 5],
      ['2025-01-11', '2025-01-21', 987, 9.87],
    ]);
  });

  it('normalizes fractional-cent payment before mutating the future base', () => {
    const result = compute(request([claim({ amount: 1_000.01 })], [
      { id: 'p1', date: '2025-01-11', amount: 20.005, currency: 'TRY' },
    ]));

    expect(allocated(result, 'INTEREST')).toBe(10);
    expect(allocated(result, 'PRINCIPAL')).toBe(10.01);
    expect(result.finalDebtStates![0]).toMatchObject({ principal: 990, accruedInterest: 9.9 });
    expect(result.segments[1]).toMatchObject({ principal: 990, segmentInterest: 9.9 });
  });

  it('orders same-day payments by date and id before mutating principal', () => {
    const payments = [
      { id: 'p-b', date: '2025-01-11', amount: 5, currency: 'TRY' as const },
      { id: 'p-a', date: '2025-01-11', amount: 20, currency: 'TRY' as const },
    ];
    const first = compute(request([claim()], payments));
    const second = compute(request([claim()], [...payments].reverse()));

    expect(first.allocations!.map((step) => step.paymentId)).toEqual(['p-a', 'p-a', 'p-b']);
    expect(second.allocations!.map((step) => step.paymentId)).toEqual(['p-a', 'p-a', 'p-b']);
    expect(first.totalInterest).toBe(19.85);
    expect(first.finalDebtStates![0]).toMatchObject({ principal: 985, accruedInterest: 9.85 });
    expect(second.totalInterest).toBe(first.totalInterest);
    expect(second.finalDebtStates).toEqual(first.finalDebtStates);
  });

  it('mutates only the priority claim whose principal receives the payment', () => {
    const newer = claim({ id: 'newer', amount: 500, startDate: '2025-01-02' });
    const older = claim({ id: 'older' });
    const result = compute(request([newer, older], [
      { id: 'p1', date: '2025-01-11', amount: 24.5, currency: 'TRY' },
    ]));

    expect(result.finalDebtStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimId: 'older', principal: 990, accruedInterest: 9.9 }),
      expect.objectContaining({ claimId: 'newer', principal: 500, accruedInterest: 5 }),
    ]));
    expect(result.segments.filter((segment) => segment.claimBucketId === 'older').map((segment) => segment.principal))
      .toEqual([1_000, 990]);
    expect(result.segments.filter((segment) => segment.claimBucketId === 'newer').map((segment) => segment.principal))
      .toEqual([500, 500]);
  });
});
