/**
 * PR-AO-2 — AllocationEngineService P-0 SIRA kilidi (kısmi ödeme) + PR-3h R3 negatif-guard.
 *
 * P-0 (doc-27): MASRAF → FER'İ → FAİZ → ANAPARA. Mevcut testler full-coverage/
 * identity-based olduğu için sırayı pinlemiyordu; bu dosya kısmi-ödeme dağılımını kilitler.
 */

import { TBK100AllocatorService } from '../tbk100-allocator.service';
import { ClaimPriorityService, ClaimPriorityRule } from '../claim-priority.service';
import { AllocationEngineService } from '../allocation-engine.service';
import {
  InterestEngineError,
  InterestEngineErrorCode,
  AllocationOverflowEvidence,
} from '../../errors/interest-engine-errors';
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

describe('AllocationEngineService — negatif-payment guard (PR-3h R3)', () => {
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

  const debt = () =>
    tbk.createDebtState(1000, 100, {} as Record<AncillaryType, number>, {} as Record<AncillaryType, number>);

  const run = (amount: number) => {
    const payment: Payment = { id: 'p1', date: '2026-01-01', amount } as any;
    return engine.allocateSinglePayment(
      payment,
      [{ claimId: 'c1', claim, debtState: debt(), segments: [] } as any],
      { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
    );
  };

  it('allocateSinglePayment(-1) reddedilir', () => {
    expect(() => run(-1)).toThrow(InterestEngineError);
  });

  it('allocateSinglePayment(-0.01) reddedilir', () => {
    expect(() => run(-0.01)).toThrow(InterestEngineError);
  });

  it('allocateSinglePayment(-0.001) reddedilir (normalize-sonrası 0\'a düşecek sub-cent dust dahi guard\'ı atlatamaz)', () => {
    // Guard normalize-SONRASI (cents üzerinde) olsaydı, toCents(-0.001)=0n olacağından
    // 0n < 0n=false → guard'ı atlatırdı. Number-seviyeli guard bunu normalize'a hiç
    // girmeden yakalar (bkz. allocateSinglePayment() içindeki R3 yorumu).
    expect(() => run(-0.001)).toThrow(InterestEngineError);
  });

  it('hata E_ALLOCATION_OVERFLOW koduyla ve orijinal (normalize edilmemiş) payment değeriyle fırlatılır', () => {
    try {
      run(-1.005);
      throw new Error('beklenen throw gerçekleşmedi');
    } catch (e) {
      expect(e).toBeInstanceOf(InterestEngineError);
      const err = e as InterestEngineError;
      expect(err.code).toBe(InterestEngineErrorCode.E_ALLOCATION_OVERFLOW);
      // orijinal number girdi (-1.005), cents'e yuvarlanmış hali DEĞİL
      const evidence = err.evidence as AllocationOverflowEvidence;
      expect(evidence.paymentAmount).toBe(-1.005);
    }
  });

  it('0 mevcut davranışı korur (throw yok, boş allocation)', () => {
    expect(() => run(0)).not.toThrow();
    expect(run(0)).toEqual([]);
  });

  it('-0 mevcut davranışı korur (JS -0 < 0 === false; throw yok, boş allocation, 0 ile aynı)', () => {
    expect(-0 < 0).toBe(false); // JS davranışı, dokümantasyon amaçlı
    expect(() => run(-0)).not.toThrow();
    expect(run(-0)).toEqual([]);
  });

  it('allocateMultiplePayments() üzerinden negatif input regresyonu (üst-seviye validateInputs korunur)', () => {
    const claims: ClaimBucket[] = [claim];
    const segments = new Map([['c1', []]]);
    expect(() =>
      engine.allocateMultiplePayments(
        [{ id: 'p1', date: '2026-01-01', amount: -5 } as any],
        claims,
        segments,
        { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      ),
    ).toThrow(InterestEngineError);
  });
});

describe('AllocationEngineService — cent-normalization (PR-3h R2)', () => {
  const tbk = new TBK100AllocatorService();
  const cp = new ClaimPriorityService();
  const engine = new AllocationEngineService(tbk, cp);

  const claim: ClaimBucket = {
    id: 'c1',
    amount: 100,
    currency: 'TRY',
    startDate: '2025-01-01',
    interestType: 'YASAL' as any,
    dayCountBasis: 365,
  };

  it('fractional-cent aşağı yuvarlama: masraf 0.014 → 0.01 (HALF_UP away-from-zero)', () => {
    const debt = tbk.createDebtState(0, 0, { [AncillaryType.HARC]: 0.014 } as Record<AncillaryType, number>);
    const payment: Payment = { id: 'p1', date: '2026-01-01', amount: 1 } as any;
    const steps = engine.allocateSinglePayment(
      payment,
      [{ claimId: 'c1', claim, debtState: debt, segments: [] } as any],
      { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
    );
    expect(steps[0].allocations[0].amountAllocated).toBe(0.01);
  });

  it('fractional-cent yukarı yuvarlama: masraf 0.016 → 0.02 (HALF_UP away-from-zero)', () => {
    const debt = tbk.createDebtState(0, 0, { [AncillaryType.HARC]: 0.016 } as Record<AncillaryType, number>);
    const payment: Payment = { id: 'p1', date: '2026-01-01', amount: 1 } as any;
    const steps = engine.allocateSinglePayment(
      payment,
      [{ claimId: 'c1', claim, debtState: debt, segments: [] } as any],
      { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
    );
    expect(steps[0].allocations[0].amountAllocated).toBe(0.02);
  });

  it('dust accumulation oluşmaz: 10× 0.1 TL ödeme (aynı claim principal) → tam 1.00 TL azalma', () => {
    const claims: ClaimBucket[] = [claim];
    const segments = new Map([['c1', []]]);
    const payments: Payment[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      amount: 0.1,
    } as any));

    const r = engine.allocateMultiplePayments(
      payments,
      claims,
      segments,
      { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
    );

    // DebtState.principal mutasyonu allocateSinglePayment() içinde HER ödeme sonrası
    // cents-round-trip edilir (PR-3h kapsamı) → 10 ödeme sonrası dust birikmez, tam 99.
    // NOT: r.totalAllocated, allocateMultiplePayments()'ın KENDİ float-reduce toplamıdır
    // (PR-3h'nin dar allocateSinglePayment() sınırı DIŞINDA, bilinçli olarak dokunulmadı) —
    // bu yüzden burada assert edilmiyor, S3 characterization testindeki not ile tutarlı.
    expect(r.finalDebtStates[0].debtState.principal).toBe(99); // 100 - 1, dust yok
  });
});
