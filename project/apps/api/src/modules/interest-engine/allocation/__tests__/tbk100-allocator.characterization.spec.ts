/**
 * CHARACTERIZATION TEST — TBK100AllocatorService (L1, messy/float-dust baseline)
 *
 * Amaç: Production TBK 100 para matematiğinin BUGÜNKÜ float davranışını (yuvarlanmamış
 * ham değerler + IEEE-754 dust) minor-unit refactor ÖNCESİ kilitlemek.
 *
 * TBK100Allocator HİÇ yuvarlama yapmaz (ham Math.min + subtraction) → 0.005 ham kalır,
 * remainingPayment float farkı taşır, calculateTotalDebt dust üretir.
 *
 * KAPSAM SINIRI (sprint-3 ile tekrar YOK):
 * - Bu dosya yalnız MESSY/ondalık/float-dust senaryolarını kilitler.
 * - TBK 100 sırası, temiz integer exact/partial/overpay, edge case ve property testleri
 *   sprint-3.spec.ts (Task 8.1 / 8.4) sahibidir; burada TEKRAR EDİLMEZ.
 *
 * Money Faz 1B / L1 safety-net: minor-unit refactor bu dust'ı temizleyince bu testler
 * bilinçli olarak kırılacak; her değer review'da yeni doğru değer olarak onaylanır.
 *
 * Kurallar: snapshot yok; float-dust değerleri literal exact assert.
 */

import { TBK100AllocatorService, AllocationResult } from '../tbk100-allocator.service';
import { AncillaryType } from '../../types/domain.types';

describe('TBK100AllocatorService characterization (messy/float-dust baseline)', () => {
  const svc = new TBK100AllocatorService();
  const find = (r: AllocationResult, category: string) =>
    r.allocations.find((a) => a.category === category);

  it('S1: messy interest+principal → ham 0.005 + remainingPayment float-dust 234.5569999999999', () => {
    const r = svc.allocate(1234.567, svc.createDebtState(1000.005, 0.005));

    const interest = find(r, 'INTEREST')!;
    expect(interest.amountBefore).toBe(0.005); // yuvarlanmamış (ham)
    expect(interest.amountAllocated).toBe(0.005);
    expect(interest.amountAfter).toBe(0);

    const principal = find(r, 'PRINCIPAL')!;
    expect(principal.amountBefore).toBe(1000.005);
    expect(principal.amountAllocated).toBe(1000.005);
    expect(principal.amountAfter).toBe(0);

    expect(r.remainingPayment).toBe(234.5569999999999); // IEEE-754 dust [bilinçli kilit]
    expect(r.newDebtState.principal).toBe(0);
    expect(r.newDebtState.accruedInterest).toBe(0);
  });

  it('S2: multi-cost + multi-ancillary partial → VEKALET amountAfter dust 49.85499999999999', () => {
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
    expect(vekalet.amountAllocated).toBe(200.4);
    expect(vekalet.amountAfter).toBe(49.85499999999999); // dust [bilinçli kilit]

    expect(r.newDebtState.costs.get(AncillaryType.HARC)).toBe(0);
    expect(r.newDebtState.costs.get(AncillaryType.TEBLIGAT_MASRAFI)).toBe(0);
    expect(r.newDebtState.ancillaries.get(AncillaryType.VEKALET_UCRETI)).toBe(49.85499999999999);
    expect(r.newDebtState.ancillaries.get(AncillaryType.CEK_TAZMINATI)).toBe(0.005); // ham, dokunulmadı
    expect(r.newDebtState.principal).toBe(5000.55); // anaparaya ulaşmadı
    expect(r.remainingPayment).toBe(0);
  });

  it('S3: messy overpayment → remainingPayment float-dust 98949.97899999999', () => {
    const r = svc.allocate(
      99999.999,
      svc.createDebtState(1000.01, 50.005, { [AncillaryType.HARC]: 0.005 } as Record<AncillaryType, number>),
    );

    expect(find(r, 'HARC')!.amountBefore).toBe(0.005);
    expect(find(r, 'HARC')!.amountAllocated).toBe(0.005);
    expect(r.remainingPayment).toBe(98949.97899999999); // dust [bilinçli kilit]
    expect(r.newDebtState.principal).toBe(0);
    expect(r.newDebtState.accruedInterest).toBe(0);
    expect(r.newDebtState.costs.get(AncillaryType.HARC)).toBe(0);
  });

  it('S4: multi-cost partial (interest 0) → TEBLIGAT amountAfter dust 50.04999999999998', () => {
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
    expect(tebligat.amountAfter).toBe(50.04999999999998); // dust [bilinçli kilit]

    expect(r.newDebtState.costs.get(AncillaryType.HARC)).toBe(0);
    expect(r.newDebtState.costs.get(AncillaryType.TEBLIGAT_MASRAFI)).toBe(50.04999999999998);
    expect(r.newDebtState.ancillaries.get(AncillaryType.VEKALET_UCRETI)).toBe(300.3); // dokunulmadı
    expect(r.newDebtState.principal).toBe(10000);
    expect(r.remainingPayment).toBe(0);
  });

  it('S5: calculateTotalDebt messy Map toplamı → dust 1550.0200000000002', () => {
    const debt = svc.createDebtState(
      1000.01,
      50.005,
      { [AncillaryType.HARC]: 333.33, [AncillaryType.TEBLIGAT_MASRAFI]: 166.67 } as Record<AncillaryType, number>,
      { [AncillaryType.VEKALET_UCRETI]: 0.005 } as Record<AncillaryType, number>,
    );
    expect(svc.calculateTotalDebt(debt)).toBe(1550.0200000000002); // dust [bilinçli kilit]
  });

  it('S6: sub-kuruş 0.005 ham kalır (yuvarlama yok); anapara ödenmez', () => {
    const r = svc.allocate(0.005, svc.createDebtState(0.005, 0.005));

    const interest = find(r, 'INTEREST')!;
    expect(interest.amountBefore).toBe(0.005); // ham 0.005, 0.01'e yuvarlanmaz
    expect(interest.amountAllocated).toBe(0.005);
    expect(interest.amountAfter).toBe(0);

    const principal = find(r, 'PRINCIPAL')!;
    expect(principal.amountBefore).toBe(0.005);
    expect(principal.amountAllocated).toBe(0); // ödeme faizde bitti
    expect(principal.amountAfter).toBe(0.005);

    expect(r.remainingPayment).toBe(0);
    expect(r.newDebtState.principal).toBe(0.005);
    expect(r.newDebtState.accruedInterest).toBe(0);
  });
});
