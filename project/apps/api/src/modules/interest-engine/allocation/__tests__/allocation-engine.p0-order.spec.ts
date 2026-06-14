/**
 * PR-AO-2 — AllocationEngineService P-0 SIRA kilidi (kısmi ödeme).
 *
 * P-0 (doc-27): MASRAF → FER'İ → FAİZ → ANAPARA. Mevcut testler full-coverage/
 * identity-based olduğu için sırayı pinlemiyordu; bu dosya kısmi-ödeme dağılımını kilitler.
 */

import { TBK100AllocatorService } from '../tbk100-allocator.service';
import { ClaimPriorityService, ClaimPriorityRule } from '../claim-priority.service';
import { AllocationEngineService } from '../allocation-engine.service';
import { AncillaryType, ClaimBucket, Payment } from '../../types/domain.types';

describe('AllocationEngineService — P-0 order lock (MASRAF→FER\'İ→FAİZ→ANAPARA)', () => {
  const tbk = new TBK100AllocatorService();
  const cp = new ClaimPriorityService();
  const engine = new AllocationEngineService(tbk, cp);

  const claim: ClaimBucket = {
    id: 'c1',
    amount: 1000,
    currency: 'TRY',
    startDate: '2025-01-01',
    interestType: 'YASAL' as any,
    dayCountBasis: 365,
  };

  // debtState: principal 1000, faiz 100, masraf HARC 50, fer'i VEKALET 30
  const debt = () =>
    tbk.createDebtState(
      1000,
      100,
      { [AncillaryType.HARC]: 50 } as Record<AncillaryType, number>,
      { [AncillaryType.VEKALET_UCRETI]: 30 } as Record<AncillaryType, number>,
    );

  const run = (amount: number) => {
    const payment: Payment = { id: 'p1', date: '2026-01-01', amount } as any;
    return engine.allocateSinglePayment(
      payment,
      [{ claimId: 'c1', claim, debtState: debt(), segments: [] } as any],
      { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
    );
  };

  const cat = (steps: any[], c: string) =>
    steps.filter((s) => s.allocations[0].category === c);
  const sum = (steps: any[]) =>
    steps.reduce((t, s) => t + s.allocations[0].amountAllocated, 0);

  it('1) kısmi ödeme MASRAFA önce gider', () => {
    const steps = run(30); // < HARC 50
    expect(steps[0].allocations[0].category).toBe(AncillaryType.HARC);
    expect(cat(steps, AncillaryType.HARC)[0].allocations[0].amountAllocated).toBe(30);
    expect(cat(steps, 'INTEREST').length).toBe(0);
    expect(cat(steps, 'PRINCIPAL').length).toBe(0);
  });

  it('2) masraf bitmeden FAİZ ödemez', () => {
    const steps = run(40); // HARC 50'nin bir kısmı
    expect(cat(steps, AncillaryType.HARC)[0].allocations[0].amountAllocated).toBe(40);
    expect(cat(steps, 'INTEREST').length).toBe(0); // faize ulaşmadı
    expect(cat(steps, AncillaryType.VEKALET_UCRETI).length).toBe(0);
  });

  it('3) masraf + fer\'i bitince FAİZ öder', () => {
    const steps = run(100); // HARC 50 + VEKALET 30 + faiz 20
    expect(cat(steps, AncillaryType.HARC)[0].allocations[0].amountAllocated).toBe(50);
    expect(cat(steps, AncillaryType.VEKALET_UCRETI)[0].allocations[0].amountAllocated).toBe(30);
    expect(cat(steps, 'INTEREST')[0].allocations[0].amountAllocated).toBe(20);
    expect(cat(steps, 'PRINCIPAL').length).toBe(0);
  });

  it('4) PRINCIPAL en son', () => {
    const steps = run(200); // 50+30+100(faiz)+20(anapara)
    expect(cat(steps, 'PRINCIPAL')[0].allocations[0].amountAllocated).toBe(20);
    // anapara step'i EN SON
    expect(steps[steps.length - 1].allocations[0].category).toBe('PRINCIPAL');
  });

  it('5) döküm sırası P-0 yansıtır + toplam ödemeyi korur (totalDue sıra-bağımsız)', () => {
    const steps = run(200);
    const order = steps.map((s) => s.allocations[0].category);
    expect(order).toEqual([
      AncillaryType.HARC,
      AncillaryType.VEKALET_UCRETI,
      'INTEREST',
      'PRINCIPAL',
    ]);
    // toplam dağıtılan = ödeme (kayıp yok; kalan/totalDue sıradan bağımsız)
    expect(sum(steps)).toBe(200);
  });
});
