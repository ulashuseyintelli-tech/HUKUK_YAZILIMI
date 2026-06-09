/**
 * CHARACTERIZATION TEST — TBK100AllocatorService (L1, minor-unit / cents POST-ADOPTION)
 *
 * Amaç: Production TBK 100 para matematiğinin minor-unit adoption (PR-B, doc 18/25)
 * SONRASI davranışını kilitlemek. Allocator artık iç hesabı integer kuruş (bigint cents)
 * üzerinde yürütür; sub-cent number input'lar sistem sınırında HALF_UP away-from-zero
 * normalize edilir (doc 25: 0.005→0.01, 0.004→0.00, -0.005→-0.01).
 *
 * SONUÇ: eski "ham 0.005 / IEEE-754 dust" davranışı yerine artık temiz kuruş değerleri
 * (0.005→0.01, remainingPayment/total dust YOK). Aşağıdaki literal değerler bu PR-B
 * kademe-2 capture'ında (gerçek minor-unit koddan harness ile) doğrulanıp pinlenmiştir.
 *
 * KAPSAM SINIRI (sprint-3 ile tekrar YOK):
 * - Bu dosya yalnız MESSY/ondalık/sub-cent senaryolarını (normalize edilmiş) kilitler.
 * - TBK 100 sırası, temiz integer exact/partial/overpay, edge case ve property testleri
 *   sprint-3.spec.ts (Task 8.1 / 8.4) sahibidir; burada TEKRAR EDİLMEZ.
 *
 * Kurallar: snapshot yok; değerler literal exact assert.
 */

import { TBK100AllocatorService, AllocationResult } from '../tbk100-allocator.service';
import { AncillaryType } from '../../types/domain.types';

describe('TBK100AllocatorService characterization (messy/float-dust baseline)', () => {
  const svc = new TBK100AllocatorService();
  const find = (r: AllocationResult, category: string) =>
    r.allocations.find((a) => a.category === category);

  it('S1: messy interest+principal → sub-cent 0.005 normalize 0.01 + remainingPayment dust-free 234.55', () => {
    const r = svc.allocate(1234.567, svc.createDebtState(1000.005, 0.005));

    const interest = find(r, 'INTEREST')!;
    expect(interest.amountBefore).toBe(0.01); // 0.005 → HALF_UP away-from-zero → 0.01
    expect(interest.amountAllocated).toBe(0.01);
    expect(interest.amountAfter).toBe(0);

    const principal = find(r, 'PRINCIPAL')!;
    expect(principal.amountBefore).toBe(1000.01); // 1000.005 → 1000.01
    expect(principal.amountAllocated).toBe(1000.01);
    expect(principal.amountAfter).toBe(0);

    expect(r.remainingPayment).toBe(234.55); // dust YOK (integer cents)
    expect(r.newDebtState.principal).toBe(0);
    expect(r.newDebtState.accruedInterest).toBe(0);
  });

  it('S2: multi-cost + multi-ancillary partial → VEKALET 250.255 normalize 250.26, amountAfter 49.86', () => {
    const r = svc.allocate(
      800.5,
      svc.createDebtState(
        5000.55,
        100.1,
        { [AncillaryType.HARC]: 333.33, [AncillaryType.TEBLIGAT_MASRAFI]: 166.67 } as Record<AncillaryType, number>,
        { [AncillaryType.VEKALET_UCRETI]: 250.255, [AncillaryType.CEK_TAZMINATI]: 0.005 } as Record<AncillaryType, number>,
      ),
    );

    const vekalet = find(r, AncillaryType.VEKALET_UCRETI)!;
    expect(vekalet.amountBefore).toBe(250.26); // 250.255 → 250.26
    expect(vekalet.amountAllocated).toBe(200.4);
    expect(vekalet.amountAfter).toBe(49.86); // 250.26 - 200.4 (dust YOK)

    expect(r.newDebtState.costs.get(AncillaryType.HARC)).toBe(0);
    expect(r.newDebtState.costs.get(AncillaryType.TEBLIGAT_MASRAFI)).toBe(0);
    expect(r.newDebtState.ancillaries.get(AncillaryType.VEKALET_UCRETI)).toBe(49.86);
    expect(r.newDebtState.ancillaries.get(AncillaryType.CEK_TAZMINATI)).toBe(0.005); // ödemeye ulaşmadı, dokunulmadı (raw)
    expect(r.newDebtState.principal).toBe(5000.55); // anaparaya ulaşmadı (dokunulmadı, raw)
    expect(r.remainingPayment).toBe(0);
  });

  it('S3: messy overpayment → HARC 0.005 normalize 0.01, remainingPayment dust-free 98949.97', () => {
    const r = svc.allocate(
      99999.999,
      svc.createDebtState(1000.01, 50.005, { [AncillaryType.HARC]: 0.005 } as Record<AncillaryType, number>),
    );

    expect(find(r, 'HARC')!.amountBefore).toBe(0.01); // 0.005 → 0.01
    expect(find(r, 'HARC')!.amountAllocated).toBe(0.01);
    expect(r.remainingPayment).toBe(98949.97); // dust YOK
    expect(r.newDebtState.principal).toBe(0);
    expect(r.newDebtState.accruedInterest).toBe(0);
    expect(r.newDebtState.costs.get(AncillaryType.HARC)).toBe(0);
  });

  it('S4: multi-cost partial (interest 0) → TEBLIGAT amountAfter dust-free 50.05', () => {
    const r = svc.allocate(
      250.25,
      svc.createDebtState(
        10000,
        0,
        { [AncillaryType.HARC]: 100.1, [AncillaryType.TEBLIGAT_MASRAFI]: 200.2 } as Record<AncillaryType, number>,
        { [AncillaryType.VEKALET_UCRETI]: 300.3 } as Record<AncillaryType, number>,
      ),
    );

    expect(find(r, 'HARC')!.amountAllocated).toBe(100.1);
    const tebligat = find(r, AncillaryType.TEBLIGAT_MASRAFI)!;
    expect(tebligat.amountAllocated).toBe(150.15);
    expect(tebligat.amountAfter).toBe(50.05); // dust YOK (200.2 - 150.15)

    expect(r.newDebtState.costs.get(AncillaryType.HARC)).toBe(0);
    expect(r.newDebtState.costs.get(AncillaryType.TEBLIGAT_MASRAFI)).toBe(50.05);
    expect(r.newDebtState.ancillaries.get(AncillaryType.VEKALET_UCRETI)).toBe(300.3); // dokunulmadı
    expect(r.newDebtState.principal).toBe(10000);
    expect(r.remainingPayment).toBe(0);
  });

  it('S5: calculateTotalDebt sub-cent Map toplamı → cents-exact 1550.03 (dust YOK)', () => {
    const debt = svc.createDebtState(
      1000.01,
      50.005,
      { [AncillaryType.HARC]: 333.33, [AncillaryType.TEBLIGAT_MASRAFI]: 166.67 } as Record<AncillaryType, number>,
      { [AncillaryType.VEKALET_UCRETI]: 0.005 } as Record<AncillaryType, number>,
    );
    // Her kalem cent'e normalize: 100001+5001+33333+16667+1 = 155003 cents → 1550.03
    expect(svc.calculateTotalDebt(debt)).toBe(1550.03);
  });

  it('S6: sub-kuruş 0.005 → 0.01 normalize edilir; ödeme faizde biter, anapara ödenmez', () => {
    const r = svc.allocate(0.005, svc.createDebtState(0.005, 0.005));

    const interest = find(r, 'INTEREST')!;
    expect(interest.amountBefore).toBe(0.01); // 0.005 → HALF_UP → 0.01
    expect(interest.amountAllocated).toBe(0.01);
    expect(interest.amountAfter).toBe(0);

    const principal = find(r, 'PRINCIPAL')!;
    expect(principal.amountBefore).toBe(0.01); // 0.005 → 0.01
    expect(principal.amountAllocated).toBe(0); // ödeme (0.01) faizde bitti
    expect(principal.amountAfter).toBe(0.01);

    expect(r.remainingPayment).toBe(0);
    expect(r.newDebtState.principal).toBe(0.01);
    expect(r.newDebtState.accruedInterest).toBe(0);
  });
});
