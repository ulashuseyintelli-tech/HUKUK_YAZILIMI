/**
 * PR-AO — TBK100AllocatorService P-0 SIRA kilidi (regresyon).
 *
 * P-0 (doc-27): MASRAF → FER'İ → FAİZ → ANAPARA.
 * Kısmi ödeme senaryolarıyla sıranın bu olduğunu kilitler (faiz artık 3. sırada).
 */

import { TBK100AllocatorService, AllocationResult } from '../tbk100-allocator.service';
import { AncillaryType } from '../../types/domain.types';

describe('TBK100AllocatorService — P-0 order lock (MASRAF→FER\'İ→FAİZ→ANAPARA)', () => {
  const svc = new TBK100AllocatorService();
  const find = (r: AllocationResult, category: string) =>
    r.allocations.find((a) => a.category === category);

  it('kısmi ödeme: masraf+fer\'i tam, faiz kısmi, anapara dokunulmaz', () => {
    // costs: HARC 50, ancillaries: VEKALET 30, interest 100, principal 1000
    const debt = svc.createDebtState(
      1000,
      100,
      { [AncillaryType.HARC]: 50 } as Record<AncillaryType, number>,
      { [AncillaryType.VEKALET_UCRETI]: 30 } as Record<AncillaryType, number>,
    );
    // 120 = 50 (masraf) + 30 (fer'i) + 40 (faiz) → anapara'ya kalmaz
    const r = svc.allocate(120, debt);

    expect(find(r, AncillaryType.HARC)!.amountAllocated).toBe(50); // 1. MASRAF
    expect(find(r, AncillaryType.HARC)!.amountAfter).toBe(0);
    expect(find(r, AncillaryType.VEKALET_UCRETI)!.amountAllocated).toBe(30); // 2. FER'İ
    expect(find(r, AncillaryType.VEKALET_UCRETI)!.amountAfter).toBe(0);
    expect(find(r, 'INTEREST')!.amountAllocated).toBe(40); // 3. FAİZ (kısmi)
    expect(find(r, 'INTEREST')!.amountAfter).toBe(60);
    expect(find(r, 'PRINCIPAL')!.amountAllocated).toBe(0); // 4. ANAPARA dokunulmaz
    expect(r.newDebtState.principal).toBe(1000);
  });

  it('çok küçük ödeme yalnız masrafa gider (faiz/fer\'i/anapara 0)', () => {
    const debt = svc.createDebtState(
      1000,
      100,
      { [AncillaryType.HARC]: 50 } as Record<AncillaryType, number>,
      { [AncillaryType.VEKALET_UCRETI]: 30 } as Record<AncillaryType, number>,
    );
    const r = svc.allocate(30, debt); // masrafın bir kısmı

    expect(find(r, AncillaryType.HARC)!.amountAllocated).toBe(30);
    expect(find(r, AncillaryType.HARC)!.amountAfter).toBe(20);
    expect(find(r, 'INTEREST')!.amountAllocated).toBe(0); // faize ulaşmadı (allocated 0)
    // fer'iye hiç ulaşmadı → remaining 0'da break, allocation array'e push edilmez
    expect(find(r, AncillaryType.VEKALET_UCRETI)).toBeUndefined();
    expect(find(r, 'PRINCIPAL')!.amountAllocated).toBe(0);
  });

  it('eski davranışın TERSİ: faiz+masraf varken ödeme önce MASRAFA gider (faize değil)', () => {
    const debt = svc.createDebtState(
      1000,
      100,
      { [AncillaryType.HARC]: 50 } as Record<AncillaryType, number>,
    );
    const r = svc.allocate(50, debt); // tam masraf kadar

    expect(find(r, AncillaryType.HARC)!.amountAfter).toBe(0); // masraf tam ödendi
    expect(find(r, 'INTEREST')!.amountAllocated).toBe(0); // faiz hiç ödenmedi (eski sırada 50 faize giderdi)
    expect(find(r, 'INTEREST')!.amountAfter).toBe(100);
  });
});
