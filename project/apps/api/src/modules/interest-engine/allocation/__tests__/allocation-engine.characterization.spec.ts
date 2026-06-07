/**
 * CHARACTERIZATION TEST — AllocationEngineService (L2, messy/dust/recalc baseline)
 *
 * Amaç: Production TBK 100 ORKESTRASYON akışının (çok-claim / çok-ödeme / interest recalc)
 * BUGÜNKÜ float-dust davranışını minor-unit refactor ÖNCESİ kilitlemek.
 *
 * KAPSAM SINIRI (sprint-3 ile tekrar YOK):
 * - sprint-3 (Task 8.3 / 8.5-8.7) sıralama, step count, priority order, property'leri kapsar.
 * - Bu dosya YALNIZ exact money/dust DEĞERLERİNİ kilitler (totalAllocated/Remaining,
 *   per-step amountAllocated/After, finalDebtStates, interestCalculator recalc birikimi).
 * - Step'ler sıraya göre değil (paymentId, claimBucketId, category) ile bulunur → order assert YOK.
 *
 * minor-unit adoption bu dust'ı temizleyince testler bilinçli kırılacak; review'da onaylanır.
 * Kurallar: snapshot yok; dust değerleri literal exact.
 */

import { TBK100AllocatorService } from '../tbk100-allocator.service';
import { ClaimPriorityService, ClaimPriorityRule } from '../claim-priority.service';
import {
  AllocationEngineService,
  AllocationEngineResult,
  InterestCalculatorFn,
} from '../allocation-engine.service';
import { ClaimBucket, Segment, Payment, InterestTypeCode } from '../../types/domain.types';

describe('AllocationEngineService characterization (messy/dust/recalc baseline)', () => {
  const eng = new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService());

  const claim = (id: string, amount: number, startDate: string): ClaimBucket => ({
    id, amount, currency: 'TRY', startDate,
    interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365,
  });
  const seg = (claimBucketId: string, segmentInterest: number): Segment => ({
    claimBucketId, periodStart: '2025-01-01', periodEnd: '2025-01-15', days: 15, rate: 0.5,
    rateId: 'r', rateSource: 'TCMB', principal: 100000, segmentInterest,
  });
  const pay = (id: string, date: string, amount: number): Payment => ({ id, date, amount, currency: 'TRY' });

  // Step'i kimliğe göre bul (sıraya göre DEĞİL) — order assert etmiyoruz.
  const step = (r: AllocationEngineResult, paymentId: string, claimBucketId: string, category: string) => {
    const s = r.steps.find(
      (st) => st.paymentId === paymentId && st.claimBucketId === claimBucketId
        && st.allocations.some((a) => a.category === category),
    );
    return s!.allocations.find((a) => a.category === category)!;
  };
  const finalOf = (r: AllocationEngineResult, claimId: string) =>
    r.finalDebtStates.find((f) => f.claimId === claimId)!.debtState;

  it('S1: 2 claim, 1 ödeme, messy → c1 PRINCIPAL dust 3836.186999999999', () => {
    const r = eng.allocateMultiplePayments(
      [pay('p1', '2025-03-15', 10000.567)],
      [claim('c1', 100000.55, '2025-01-01'), claim('c2', 50000.33, '2025-02-01')],
      new Map([['c1', [seg('c1', 4109.59)]], ['c2', [seg('c2', 2054.79)]]]),
      { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
    );

    expect(r.totalAllocated).toBe(10000.567);
    expect(r.totalRemaining).toBe(0);
    expect(r.isFullyPaid).toBe(false);

    const c1Principal = step(r, 'p1', 'c1', 'PRINCIPAL');
    expect(c1Principal.amountAllocated).toBe(3836.186999999999); // dust
    expect(c1Principal.amountAfter).toBe(96164.363);

    expect(finalOf(r, 'c1').principal).toBe(96164.363);
    expect(finalOf(r, 'c2').principal).toBe(50000.33);
  });

  it('S2: 2 ödeme + interestCalculator recalc → birikmiş dust final principal 70014.8987431011', () => {
    const calc: InterestCalculatorFn = (_c, _d, principal) => ({ accruedInterest: principal * 0.0001, segments: [] });
    const r = eng.allocateMultiplePayments(
      [pay('p2', '2025-04-01', 7000.123), pay('p1', '2025-02-01', 3000.789)],
      [claim('c1', 80000.11, '2025-01-01')],
      new Map([['c1', [seg('c1', 1000.005)]]]),
      { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      calc,
    );

    expect(r.totalAllocated).toBe(10000.912);
    expect(step(r, 'p1', 'c1', 'INTEREST').amountAllocated).toBe(8.000011);
    expect(step(r, 'p2', 'c1', 'INTEREST').amountAllocated).toBe(7.700732101100001);
    expect(step(r, 'p2', 'c1', 'PRINCIPAL').amountAllocated).toBe(6992.4222678989);
    expect(finalOf(r, 'c1').principal).toBe(70014.8987431011); // recalc birikimi dust
  });

  it('S3: overpayment tüm claim → totalRemaining dust 998449.9739999999', () => {
    const r = eng.allocateMultiplePayments(
      [pay('p1', '2025-03-15', 999999.999)],
      [claim('c1', 1000.01, '2025-01-01'), claim('c2', 500.005, '2025-02-01')],
      new Map([['c1', [seg('c1', 50.005)]], ['c2', [seg('c2', 0.005)]]]),
      { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
    );

    expect(r.totalAllocated).toBe(1550.025);
    expect(r.totalRemaining).toBe(998449.9739999999); // dust
    expect(r.isFullyPaid).toBe(true);
    expect(step(r, 'p1', 'c2', 'INTEREST').amountAllocated).toBe(0.005); // ham
    expect(finalOf(r, 'c1').principal).toBe(0);
    expect(finalOf(r, 'c2').principal).toBe(0);
  });

  it('S4: partial yalnız faiz → c2 accruedInterest dust 999.6800000000003', () => {
    const r = eng.allocateMultiplePayments(
      [pay('p1', '2025-03-15', 3000.33)],
      [claim('c1', 100000, '2025-01-01'), claim('c2', 100000, '2025-02-01')],
      new Map([['c1', [seg('c1', 2000.005)]], ['c2', [seg('c2', 2000.005)]]]),
      { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
    );

    expect(r.totalAllocated).toBe(3000.33);
    expect(step(r, 'p1', 'c1', 'INTEREST').amountAllocated).toBe(2000.005);
    const c2Interest = step(r, 'p1', 'c2', 'INTEREST');
    expect(c2Interest.amountAllocated).toBe(1000.3249999999998); // dust
    expect(c2Interest.amountAfter).toBe(999.6800000000003);
    expect(finalOf(r, 'c2').accruedInterest).toBe(999.6800000000003); // dust
    expect(finalOf(r, 'c1').principal).toBe(100000);
    expect(finalOf(r, 'c2').principal).toBe(100000);
  });

  it('S5: HIGHEST_RATE_FIRST value etkisi → c1 PRINCIPAL dust 0.5500000000001819', () => {
    const r = eng.allocateMultiplePayments(
      [pay('p1', '2025-03-15', 5000.55)],
      [claim('c1', 100000, '2025-01-01'), claim('c2', 100000, '2025-01-01')],
      new Map([['c1', [seg('c1', 3333.33)]], ['c2', [seg('c2', 1666.67)]]]),
      { claimPriorityRule: ClaimPriorityRule.HIGHEST_RATE_FIRST },
    );

    expect(r.totalAllocated).toBe(5000.55);
    expect(step(r, 'p1', 'c1', 'INTEREST').amountAllocated).toBe(3333.33);
    expect(step(r, 'p1', 'c2', 'INTEREST').amountAllocated).toBe(1666.67);
    const c1Principal = step(r, 'p1', 'c1', 'PRINCIPAL');
    expect(c1Principal.amountAllocated).toBe(0.5500000000001819); // dust
    expect(c1Principal.amountAfter).toBe(99999.45);
    expect(finalOf(r, 'c1').principal).toBe(99999.45);
    expect(finalOf(r, 'c2').principal).toBe(100000);
  });
});
