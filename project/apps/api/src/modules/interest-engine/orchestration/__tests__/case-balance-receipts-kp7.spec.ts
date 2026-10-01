/**
 * K3-L KP-7 / TK-5 / KP-3 (owner kararı 2026-10-01) — kanonik tahsilat gösterimi ve talep edilmiş işlemiş faiz:
 *  KP-7: "Toplam tahsilat" = dosyaya fiilen giren, ters kayıtla netleşmiş para (hesap tarihine kadar); "Borca uygulanan"
 *        ve "Dağıtım bekleyen" ayrı; aynı para iki kez sayılmaz (Toplam = Uygulanan + Bekleyen); tarih kapsamı açık;
 *        bilinmeyen (motor çalışmadı) yalnız uygulanan/bekleyen null — bilinen tahsilat görünür kalır.
 *  TK-5: totalPaidAmount / allocatedPaidAmount = borca FİİLEN uygulanan (önceden yüz değer).
 *  K3-L D1: mahsubu bekletilen tahsilat borçtan düşülmez; Dağıtım bekleyen içinde ayrı satırdır.
 *  KP-3 / TK-7: talep edilmiş işlemiş faiz görünür, hesaba DAHİL DEĞİL, hiçbir toplama eklenmez.
 * Gerçek motor + CaseBalanceService + display; prisma sahte, sabit oran (%36,5 → günlük tutarın binde biri).
 */

import { CaseBalanceService } from '../case-balance.service';
import { toCaseBalanceDisplay } from '../case-balance-display';
import { InterestEngineService } from '../../interest-engine.service';
import { PolicyGateV2Service } from '../../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../../segments/segment-builder.service';
import { AllocationEngineService } from '../../allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../../allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../../allocation/claim-priority.service';
import { VersionPinningService } from '../../version/version-pinning.service';

function engine(): InterestEngineService {
  return new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    {} as never,
    { record: () => undefined, clearAll: () => undefined } as never,
    new VersionPinningService(),
  );
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const item = (id: string, itemType: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, itemType, currency: 'TRY', status: 'ACTIVE', metadata: null, interestType: null, interestTypeCode: null,
  interestRate: null, interestStartDate: null, interestAccrualStatus: null, interestStartDateProvenance: null,
  amount, demandedAmount: amount, ...extra,
});
const sabit = (id: string, amount: number, start: string) => item(id, 'PRINCIPAL', amount, {
  interestType: 'SABIT', interestRate: 36.5, interestStartDate: d(start), interestAccrualStatus: 'ACCRUES',
});
const col = (id: string, amount: number, date: string, currency = 'TRY') => ({
  id, status: 'CONFIRMED', cancelledAt: null, amount, currency, date: d(date), sourceType: 'BANKA', channel: null,
});
const ledgerPayment = (id: string, amount: number, date: string) => ({
  id, tenantId: 't1', caseId: 'case1', entryType: 'PAYMENT', status: 'CONFIRMED', amount, currency: 'TRY',
  entryDate: d(date), effectiveDate: null, sourceType: 'BANKA', reversesLedgerEntryId: null,
});
const ledgerReversal = (id: string, of: string, amount: number, date: string) => ({
  id, tenantId: 't1', caseId: 'case1', entryType: 'REVERSAL', status: 'CONFIRMED', amount: -amount, currency: 'TRY',
  entryDate: d(date), effectiveDate: null, sourceType: 'COLLECTION_CANCEL', reversesLedgerEntryId: of,
});
const heldOverpayment = (id: string, collectionId: string, remaining: number) => ({
  id, collectionId, sourceLedgerEntryId: null, amount: remaining, remainingAmount: remaining, currency: 'TRY', status: 'HELD',
});
const allocationHold = (id: string, collectionId: string, amount: number) => ({
  id, collectionId, amount, currency: 'TRY', holdReason: 'CASE_DEBTOR_AMBIGUOUS', createdAt: d('2026-01-01'),
});

async function run(opts: {
  items: unknown[];
  collections?: unknown[];
  ledger?: unknown[];
  overpayments?: unknown[];
  holds?: unknown[];
  asOf: string;
}) {
  const prisma = {
    case: { findFirst: async () => ({ interestType: null, interestStartDate: null, caseDate: null }) },
    claimItem: { findMany: async () => opts.items },
    ledgerEntry: { findMany: async () => opts.ledger ?? [] },
    collection: { findMany: async () => opts.collections ?? [] },
    collectionOverpayment: { findMany: async () => opts.overpayments ?? [] },
    collectionAllocationHold: { findMany: async () => opts.holds ?? [] },
    icrabotTimelineEntry: { findMany: async () => [] },
  };
  const service = new CaseBalanceService(prisma as never, { getRatesForPeriod: async () => [] } as never, engine());
  const balance = await service.computeCaseBalance('t1', 'case1', opts.asOf);
  const display = toCaseBalanceDisplay({ tenantId: 't1', caseId: 'case1', balance, generatedAt: '2026-10-01T00:00:00.000Z' });
  return { balance, display };
}

const cents = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100));

describe('K3-L KP-7 / TK-5: Toplam tahsilat — Borca uygulanan — Dağıtım bekleyen', () => {
  it('R02 örneği: 1.000 anapara, 1.200 tahsilat (HELD 200) → Toplam 1.200 · Borca uygulanan 1.000 · Dağıtım bekleyen 200', async () => {
    const { display } = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      collections: [col('c1', 1200, '2026-01-01')],
      overpayments: [heldOverpayment('op1', 'c1', 200)],
      asOf: '2026-01-31',
    });
    expect(display.status).toBe('OK');
    expect(display.receipts).toEqual({
      currency: 'TRY',
      asOfDate: '2026-01-31',
      scope: 'ON_OR_BEFORE_AS_OF_DATE',
      receivedAmount: 1200,
      paymentAmount: 1200,
      allocationHeldAmount: 0,
      appliedToDebtAmount: 1000,
      unappliedPaymentAmount: 200,
      notAppliedAmount: 200,
      afterAsOfExcludedAmount: 0,
      appliedScope: 'PRINCIPAL_AND_INTEREST_ONLY',
    });
    // TK-5: borca uygulanan (önceden yüz değer 1.200) · KP-7: Toplam tahsilat = dosyaya giren
    expect(display.totals).toMatchObject({ totalPaidAmount: 1000, allocatedPaidAmount: 1000, grossReceivedAmount: 1200 });
  });

  it('mahsubu bekletilen tahsilat (K3-L D1): Toplam tahsilata girer, borca UYGULANMAZ, borçtan düşülmez', async () => {
    const withHold = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      ledger: [ledgerPayment('le1', 300, '2026-01-15')],
      collections: [col('c-held', 500, '2026-01-20')],
      holds: [allocationHold('h1', 'c-held', 500)],
      asOf: '2026-01-31',
    });
    const withoutHold = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      ledger: [ledgerPayment('le1', 300, '2026-01-15')],
      asOf: '2026-01-31',
    });
    expect(withHold.display.receipts).toMatchObject({
      receivedAmount: 800,
      paymentAmount: 300,
      allocationHeldAmount: 500,
      appliedToDebtAmount: 300,
      unappliedPaymentAmount: 0,
      notAppliedAmount: 500,
    });
    // Bekletme borcu değiştirmez (D1): kalan alacak bekletmesiz hesapla birebir aynı
    expect(withHold.display.currencies[0].claimRemaining).toBe(withoutHold.display.currencies[0].claimRemaining);
    expect(withHold.display.totals.outstandingAmount).toBe(withoutHold.display.totals.outstandingAmount);
    expect(withHold.display.totals.totalPaidAmount).toBe(300);
    expect(withHold.display.totals.grossReceivedAmount).toBe(800);
  });

  it('aynı para iki kez sayılmaz: Toplam = Borca uygulanan + Dağıtım bekleyen (kuruş eşitliği; fazla ödeme + bekletme birlikte)', async () => {
    const { display } = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      ledger: [ledgerPayment('le1', 1234.56, '2026-01-11')],
      collections: [col('c-held', 77.77, '2026-01-12')],
      holds: [allocationHold('h1', 'c-held', 77.77)],
      overpayments: [heldOverpayment('op1', 'c-x', 224.56)],
      asOf: '2026-02-01',
    });
    const r = display.receipts!;
    expect(cents(r.receivedAmount)).toBe(cents(r.appliedToDebtAmount)! + cents(r.notAppliedAmount)!);
    expect(cents(r.notAppliedAmount)).toBe(cents(r.allocationHeldAmount)! + cents(r.unappliedPaymentAmount)!);
    expect(r.receivedAmount).toBe(1312.33);
    // 01.01 → 11.01 = 10 gün faiz 10,00; 1.234,56 → faiz 10 + anapara 1.000 = 1.010 uygulanır
    expect(r.appliedToDebtAmount).toBe(1010);
  });

  it('tarih kapsamı açık: hesap tarihinden sonraki ödeme ve bekletme toplama girmez, ayrıca yazılır', async () => {
    const { display } = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      ledger: [ledgerPayment('le1', 100, '2026-01-15'), ledgerPayment('le2', 250, '2026-03-01')],
      collections: [col('c-held', 40, '2026-03-05')],
      holds: [allocationHold('h1', 'c-held', 40)],
      asOf: '2026-02-01',
    });
    expect(display.receipts).toMatchObject({
      asOfDate: '2026-02-01',
      receivedAmount: 100,
      allocationHeldAmount: 0,
      afterAsOfExcludedAmount: 290,
    });
  });

  it('ters kayıt netleşmesi (ADR-014 MUST-6): iptal edilen ödeme Toplam tahsilata girmez', async () => {
    const { display } = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      ledger: [
        ledgerPayment('le1', 300, '2026-01-15'),
        ledgerPayment('le2', 200, '2026-01-20'),
        ledgerReversal('lr2', 'le2', 200, '2026-03-10'),
      ],
      asOf: '2026-01-31',
    });
    expect(display.receipts).toMatchObject({ receivedAmount: 300, paymentAmount: 300, appliedToDebtAmount: 300 });
  });

  it('faiz çözülemedi (motor çalışmadı): bilinen Toplam tahsilat görünür; uygulanan/bekleyen null + neden; üst toplamlar null', async () => {
    const { display } = await run({
      items: [item('P1', 'PRINCIPAL', 1000, { interestAccrualStatus: 'ACCRUES' })],
      ledger: [ledgerPayment('le1', 300, '2026-01-15')],
      asOf: '2026-01-31',
    });
    expect(display.status).toBe('UNAVAILABLE');
    expect(display.receipts).toMatchObject({
      receivedAmount: 300,
      paymentAmount: 300,
      appliedToDebtAmount: null,
      unappliedPaymentAmount: null,
      notAppliedAmount: null,
      appliedUnavailableReason: 'INTEREST_UNRESOLVED',
    });
    expect(display.totals.totalPaidAmount).toBeNull();
    expect(display.totals.grossReceivedAmount).toBeNull();
  });

  it('para birimleri arası toplam yok (REC-ALLOC-008): iki para biriminde tahsilat → blok null + neden', async () => {
    const { display } = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      collections: [col('c1', 100, '2026-01-10'), col('c2', 50, '2026-01-12', 'USD')],
      asOf: '2026-01-31',
    });
    expect(display.receipts).toBeNull();
    expect(display.receiptsUnavailableReason).toBe('MULTI_CURRENCY');
  });

  it('masraf/fer\'i varken borca uygulanmayan ödeme → UNAPPLIED_MAY_BELONG_TO_COSTS uyarısı (TK-6 sınırı görünür)', async () => {
    const { display } = await run({
      items: [sabit('P1', 1000, '2026-01-01'), item('E1', 'EXPENSE', 100)],
      collections: [col('c1', 1100, '2026-01-01')],
      asOf: '2026-01-31',
    });
    expect(display.receipts).toMatchObject({ appliedToDebtAmount: 1000, unappliedPaymentAmount: 100 });
    expect(display.diagnostics).toContainEqual(expect.objectContaining({
      code: 'UNAPPLIED_MAY_BELONG_TO_COSTS', severity: 'WARNING',
    }));
  });
});

describe('K3-L KP-3 / TK-7: talep edilmiş işlemiş faiz görünür, hesaba dahil değil', () => {
  it('500 talep edilmiş faiz: ayrı blok + WARNING tanı; toplam borç DEĞİŞMEZ; tutarsız faiz ayar kalemi listelenmez', async () => {
    const base = await run({ items: [sabit('P1', 10000, '2026-01-01')], asOf: '2026-03-31' });
    const { display } = await run({
      items: [
        sabit('P1', 10000, '2026-01-01'),
        item('I1', 'PRE_INTEREST', 500),
        item('I0', 'INTEREST', 0),
        item('I9', 'INTEREST', 70, { status: 'CANCELLED' }),
      ],
      asOf: '2026-03-31',
    });
    expect(display.claimedInterest).toEqual({
      includedInCalculation: false,
      reasonCode: 'CLAIMED_INTEREST_EXCLUDED_FROM_CANONICAL',
      amountByCurrency: { TRY: 500 },
      items: [{ claimItemId: 'I1', itemType: 'PRE_INTEREST', amount: 500, currency: 'TRY' }],
    });
    expect(display.diagnostics).toContainEqual(expect.objectContaining({
      code: 'CLAIMED_INTEREST_NOT_INCLUDED',
      severity: 'WARNING',
      details: expect.objectContaining({ count: 1, amountByCurrency: { TRY: 500 } }),
    }));
    // Aynı faiz iki kez toplanmaz: hesap ve toplamlar talep edilmiş faizden bağımsız
    expect(display.totals.totalDebtAmount).toBe(base.display.totals.totalDebtAmount);
    expect(display.totals.outstandingAmount).toBe(base.display.totals.outstandingAmount);
    expect(display.currencies[0].interest).toBe(base.display.currencies[0].interest);
  });

  it('talep edilmiş faiz kaydı yoksa blok ve tanı yazılmaz', async () => {
    const { display } = await run({ items: [sabit('P1', 1000, '2026-01-01')], asOf: '2026-01-31' });
    expect(display.claimedInterest).toBeUndefined();
    expect(display.diagnostics.some((diagnostic) => diagnostic.code === 'CLAIMED_INTEREST_NOT_INCLUDED')).toBe(false);
  });
});
