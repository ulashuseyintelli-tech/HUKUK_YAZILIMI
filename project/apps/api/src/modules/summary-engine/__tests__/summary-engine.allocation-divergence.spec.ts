import { SummaryEngineService } from '../summary-engine.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';

/**
 * Regresyon: allocateLegacy() (YAML allocation_order) ile allocateWithTBK100()
 * (doc-27 P-0 hard rule: MASRAF → FER'İ → FAİZ → ANAPARA) aynı ödeme için
 * FARKLI sonuç üretiyor. InterestEngineModule exports'unda TBK100AllocatorService
 * eksikse, production'daki her ödeme sessizce legacy (yanlış) sıraya düşer.
 *
 * Fixture: YAML allocation_order (apps/api/src/config/summary-engine-rules.yaml)
 * içinde düz "INTEREST" itemType'ı YOK (yalnız PRE_INTEREST/POST_INTEREST var) →
 * legacy sıralamada indexOf('INTEREST') === -1 → 999 → INTEREST, PRINCIPAL'ın
 * ARKASINA düşüyor. TBK100'de ise INTEREST (faiz) her zaman PRINCIPAL'dan (anapara)
 * önce ödenir. Bu, ödemenin kalan kısmının FAİZ'e mi yoksa ANAPARA'ya mı
 * gideceğini değiştiren somut bir hukuki-sonuç farkıdır.
 */
describe('SummaryEngineService allocateLegacy vs allocateWithTBK100 divergence', () => {
  const items = [
    { id: 'fee-1', itemType: 'FEE', demandedAmount: 100, collectedAmount: 0 },
    { id: 'interest-1', itemType: 'INTEREST', demandedAmount: 500, collectedAmount: 0 },
    { id: 'principal-1', itemType: 'PRINCIPAL', demandedAmount: 1000, collectedAmount: 0 },
  ];
  const paymentAmount = 150; // FEE'yi tam kapatır, 50 kalır

  function buildLegacyService(): SummaryEngineService {
    const svc = new SummaryEngineService({} as any, undefined);
    (svc as any).rules = {
      policies: {
        allocation_order: ['EXPENSE', 'FEE', 'ATTORNEY_FEE', 'PRE_INTEREST', 'POST_INTEREST', 'PRINCIPAL', 'PENALTY', 'CHECK_PENALTY', 'COMMISSION', 'OTHER'],
      },
    };
    return svc;
  }

  function buildTBK100Service(): SummaryEngineService {
    return new SummaryEngineService({} as any, new TBK100AllocatorService());
  }

  it('allocateLegacy pays FEE then PRINCIPAL, skipping INTEREST (bug behavior, YAML has no INTEREST entry)', () => {
    const svc = buildLegacyService();
    const allocations = (svc as any).allocateLegacy(items, paymentAmount) as Array<{
      claimItemId: string;
      amount: number;
    }>;

    const byId = Object.fromEntries(allocations.map((a) => [a.claimItemId, a.amount]));
    expect(byId['fee-1']).toBe(100);
    expect(byId['principal-1']).toBe(50);
    expect(byId['interest-1']).toBeUndefined(); // faiz atlandı — TBK 100 ihlali
  });

  it('allocateWithTBK100 pays FEE then INTEREST, PRINCIPAL untouched (TBK 100 / doc-27 correct order)', () => {
    const svc = buildTBK100Service();
    const computation = (svc as any).allocateWithTBK100(items, paymentAmount) as {
      allocations: Array<{ claimItemId: string; amount: number }>;
    };

    const byId = Object.fromEntries(computation.allocations.map((a) => [a.claimItemId, a.amount]));
    expect(byId['fee-1']).toBe(100);
    expect(byId['interest-1']).toBe(50);
    expect(byId['principal-1']).toBeUndefined(); // anapara ödenmedi — faiz önce kapatıldı
  });

  it('the two allocation strategies diverge on the same payment (proves the DI bug has real financial impact)', () => {
    const legacy = (buildLegacyService() as any).allocateLegacy(items, paymentAmount);
    const tbk100 = (buildTBK100Service() as any).allocateWithTBK100(items, paymentAmount).allocations;

    const legacyById = Object.fromEntries(legacy.map((a: any) => [a.claimItemId, a.amount]));
    const tbk100ById = Object.fromEntries(tbk100.map((a: any) => [a.claimItemId, a.amount]));

    expect(legacyById).not.toEqual(tbk100ById);
    expect(legacyById['principal-1']).toBe(50);
    expect(tbk100ById['interest-1']).toBe(50);
  });
});
