/**
 * K3-L TK-3 / TK-4 — kanonik bakiyede hesap tarihi ve brüt tahsilat:
 *  TK-3: hesap tarihinden SONRA tarihli ödeme bu tarihin bakiyesine girmez (faiz hesap tarihinde kesilirken ödeme yine
 *        düşülüyordu). Kayıt değişmez; çıkarılan ödeme ayrı bilgi olarak raporlanır. Ters kayıt netleşmesi (ADR-014
 *        MUST-6: hesap tarihinden sonraki iptal → sıfır net etki) aynen korunur.
 *  TK-4: kısmi fazla ödemede bekletilen (HELD) kalan, tahsilatın yüz değeriyle zaten sayılmışken brüt tahsilata ikinci
 *        kez eklenmez. totalPaidAmount / allocatedPaidAmount / heldOverpaymentAmount DEĞİŞMEZ (KP-7 etiketi ayrı karar).
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
const sabit = (id: string, amount: number, start: string) => ({
  id, itemType: 'PRINCIPAL', currency: 'TRY', status: 'ACTIVE', metadata: null, interestType: 'SABIT',
  interestTypeCode: null, interestRate: 36.5, interestStartDate: d(start), interestAccrualStatus: 'ACCRUES',
  interestStartDateProvenance: null, amount, demandedAmount: amount,
});
const col = (id: string, amount: number, date: string) => ({
  id, status: 'CONFIRMED', cancelledAt: null, amount, currency: 'TRY', date: d(date), sourceType: 'BANKA', channel: null,
});
const ledgerPayment = (id: string, amount: number, date: string) => ({
  id, tenantId: 't1', caseId: 'case1', entryType: 'PAYMENT', status: 'CONFIRMED', amount, currency: 'TRY',
  entryDate: d(date), effectiveDate: null, sourceType: 'BANKA', reversesLedgerEntryId: null,
});
const ledgerReversal = (id: string, of: string, amount: number, date: string) => ({
  id, tenantId: 't1', caseId: 'case1', entryType: 'REVERSAL', status: 'CONFIRMED', amount: -amount, currency: 'TRY',
  entryDate: d(date), effectiveDate: null, sourceType: 'COLLECTION_CANCEL', reversesLedgerEntryId: of,
});
const held = (id: string, collectionId: string, remaining: number, sourceLedgerEntryId: string | null = null) => ({
  id, collectionId, sourceLedgerEntryId, amount: remaining, remainingAmount: remaining, currency: 'TRY', status: 'HELD',
});

async function run(opts: {
  items: unknown[];
  collections?: unknown[];
  ledger?: unknown[];
  overpayments?: unknown[];
  asOf: string;
}) {
  const prisma = {
    case: { findFirst: async () => ({ interestType: null, interestStartDate: null, caseDate: null }) },
    claimItem: { findMany: async () => opts.items },
    ledgerEntry: { findMany: async () => opts.ledger ?? [] },
    collection: { findMany: async () => opts.collections ?? [] },
    collectionOverpayment: { findMany: async () => opts.overpayments ?? [] },
    icrabotTimelineEntry: { findMany: async () => [] },
  };
  const service = new CaseBalanceService(prisma as never, { getRatesForPeriod: async () => [] } as never, engine());
  const balance = await service.computeCaseBalance('t1', 'case1', opts.asOf);
  const display = toCaseBalanceDisplay({ tenantId: 't1', caseId: 'case1', balance, generatedAt: '2026-09-30T00:00:00.000Z' });
  return { balance, display };
}

describe('K3-L TK-3: hesap tarihinden sonraki ödeme o tarihin bakiyesine girmez', () => {
  it('hesap tarihi 11.04, ödeme 01.05 → bakiye 1.100 (önceden 1.000); ödeme ayrı bilgi olarak raporlanır', async () => {
    const collections = [col('p1', 100, '2026-05-01')];
    const snapshot = JSON.stringify(collections);
    const { balance, display } = await run({ items: [sabit('A', 1000, '2026-01-01')], collections, asOf: '2026-04-11' });

    const result = balance.currencyResults[0].result!;
    // 01.01 → 11.04 = 100 gün × 1.000 × %36,5 / 365 = 100,00 ; ödeme bu tarihte YOK
    expect(result.totalDue).toBe(1100);
    expect((result.finalDebtStates ?? []).find((s) => s.claimId === 'A')).toMatchObject({ principal: 1000, accruedInterest: 100 });
    expect(result.allocations ?? []).toEqual([]);
    expect(balance.paymentsAfterAsOf).toEqual([{ id: 'p1', date: '2026-05-01', amount: 100, currency: 'TRY', source: 'BANKA' }]);

    expect(display.status).toBe('OK');
    expect(display.currencies[0]).toMatchObject({ interest: 100, claimRemaining: 1100, collected: 0 });
    const info = display.diagnostics.find((diagnostic) => diagnostic.code === 'PAYMENTS_AFTER_AS_OF_EXCLUDED');
    expect(info).toMatchObject({ severity: 'INFO', details: { asOfDate: '2026-04-11', count: 1, amountByCurrency: { TRY: 100 } } });
    // Gerçek tahsilat kaydı değişmedi (salt okuma)
    expect(JSON.stringify(collections)).toBe(snapshot);
  });

  it('hesap tarihi = ödeme günü → ödeme dahil (sınır)', async () => {
    const { balance, display } = await run({
      items: [sabit('A', 1000, '2026-01-01')], collections: [col('p1', 100, '2026-04-11')], asOf: '2026-04-11',
    });
    // 100 gün faiz 100,00; ödeme 100 önce faize → kalan 1.000
    expect(balance.currencyResults[0].result!.totalDue).toBe(1000);
    expect(balance.paymentsAfterAsOf).toBeUndefined();
    expect(display.diagnostics.some((diagnostic) => diagnostic.code === 'PAYMENTS_AFTER_AS_OF_EXCLUDED')).toBe(false);
  });

  it('hesap tarihinden sonraki İPTAL: bağlı tam ters kayıt sıfır net etki (ADR-014 MUST-6) — bu davranış korunur', async () => {
    const withReversed = await run({
      items: [sabit('A', 1000, '2026-01-01')],
      ledger: [ledgerPayment('le1', 100, '2026-03-01'), ledgerReversal('lr1', 'le1', 100, '2026-05-01')],
      asOf: '2026-04-11',
    });
    const withoutPayment = await run({ items: [sabit('A', 1000, '2026-01-01')], asOf: '2026-04-11' });
    expect(withReversed.balance.currencyResults[0].result!.totalDue)
      .toBe(withoutPayment.balance.currencyResults[0].result!.totalDue);
    expect(withReversed.balance.paymentsAfterAsOf).toBeUndefined();
  });

  it('karma: hesap tarihinden önceki ödeme düşülür, sonraki düşülmez', async () => {
    const { balance } = await run({
      items: [sabit('A', 1000, '2026-01-01')],
      collections: [col('p0', 50, '2026-02-10'), col('p1', 100, '2026-05-01')],
      asOf: '2026-04-11',
    });
    const allocatedPaymentIds = new Set((balance.currencyResults[0].result!.allocations ?? []).map((step) => step.paymentId));
    expect([...allocatedPaymentIds]).toEqual(['p0']);
    expect(balance.paymentsAfterAsOf!.map((payment) => payment.id)).toEqual(['p1']);
  });
});

describe('K3-L TK-4: aynı tahsilatın bekletilen kısmı brüt tahsilatta iki kez sayılmaz', () => {
  it('tahsilat yedeği: 1.000 anapara, 1.200 tahsilat, HELD 200 → brüt 1.200 (önceden 1.400)', async () => {
    const { display } = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      collections: [col('c1', 1200, '2026-01-01')],
      overpayments: [held('op1', 'c1', 200)],
      asOf: '2026-01-31',
    });
    expect(display.status).toBe('OK');
    expect(display.totals.grossReceivedAmount).toBe(1200);
    // Değişmeyenler (KP-7 etiketi ayrı karar): yüz değer ve bekletilen kalan olduğu gibi
    expect(display.totals.totalPaidAmount).toBe(1200);
    expect(display.totals.allocatedPaidAmount).toBe(1200);
    expect(display.totals.heldOverpaymentAmount).toBe(200);
  });

  it('defter kaynağı: PAYMENT 1.200 (tam tutar) + HELD 200 (sourceLedgerEntryId) → brüt 1.200', async () => {
    const { balance, display } = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      ledger: [ledgerPayment('le1', 1200, '2026-01-01')],
      overpayments: [held('op1', 'c1', 200, 'le1')],
      asOf: '2026-01-31',
    });
    expect(balance.source).toBe('LEDGER');
    expect(display.totals.grossReceivedAmount).toBe(1200);
    expect(display.totals.heldOverpaymentAmount).toBe(200);
  });

  it('borç kapandıktan SONRA gelen ayrı tahsilat (tahsis adımı yok) → HELD brüte eklenir; değer değişmez (1.300)', async () => {
    const { display } = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      collections: [col('c1', 1000, '2026-01-01'), col('c2', 300, '2026-01-10')],
      overpayments: [held('op2', 'c2', 300)],
      asOf: '2026-01-31',
    });
    expect(display.totals.grossReceivedAmount).toBe(1300);
    expect(display.totals.heldOverpaymentAmount).toBe(300);
  });

  it('hesap tarihinden SONRAKİ tahsilata ait HELD o tarihin brüt tahsilatına girmez (önceden 1.400)', async () => {
    const { balance, display } = await run({
      items: [sabit('P1', 1000, '2026-01-01')],
      collections: [col('c1', 1200, '2026-03-01')],
      overpayments: [held('op1', 'c1', 200)],
      asOf: '2026-02-01',
    });
    expect(balance.paymentsAfterAsOf!.map((payment) => payment.id)).toEqual(['c1']);
    expect(display.totals.grossReceivedAmount).toBe(0);
    // Bekletilen kaydın kendisi bugünkü durum olarak aynen gösterilir (kayıt değişmedi)
    expect(display.totals.heldOverpaymentAmount).toBe(200);
  });
});
