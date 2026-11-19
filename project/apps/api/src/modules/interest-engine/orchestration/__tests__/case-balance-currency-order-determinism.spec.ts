/**
 * Kanonik bakiyede para birimi SIRASI ve tutarlar giriş / sorgu sırasından BAĞIMSIZDIR (D8 / PR-6 düzeltmesi, 2026-11-19).
 *
 * Sözleşme: `CaseBalanceResult.currencyResults` ve `diagnostics.perCurrency` para birimi koduna göre ARTAN sıradadır
 * (ikili / ordinal karşılaştırma; yerel ayara bağlı değil). Kalemlerin ve tahsilatların veritabanından hangi sırada
 * geldiği sonucu DEĞİŞTİRMEZ: para birimi başına anapara, faiz, toplam, kalem başına son durum ve tahsilat dağıtımı aynıdır.
 *
 * Ölçülen ayrışma: `claimItem.findMany` sırasız okunuyor, `groupByCurrency` grupları ilk görülme sırasıyla döndürüyordu →
 * satırları güncellenen (PostgreSQL yeni konuma yazar) dosyada sonuç `[USD, TRY]` gelebiliyordu
 * (scenario-diagnostic.db-gated D8 / PR-6, tam liste koşusunda aralıklı düşüş).
 * Gerçek motor + CaseBalanceService + display; prisma sahte (sorgu sırası testin elinde); sabit oranlı kalemler.
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
const sabit = (id: string, currency: string, amount: number, start: string, rate: number) => ({
  id, itemType: 'PRINCIPAL', currency, status: 'ACTIVE', metadata: null, interestType: 'SABIT',
  interestTypeCode: null, interestRate: rate, interestStartDate: d(start), interestAccrualStatus: 'ACCRUES',
  interestStartDateProvenance: null, amount, demandedAmount: amount,
});
const col = (id: string, currency: string, amount: number, date: string) => ({
  id, status: 'CONFIRMED', cancelledAt: null, amount, currency, date: d(date), sourceType: 'BANKA', channel: null,
});

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [xs.slice()];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

async function run(items: unknown[], collections: unknown[], asOf: string) {
  const prisma = {
    case: { findFirst: async () => ({ interestType: null, interestStartDate: null, caseDate: null }) },
    claimItem: { findMany: async () => items },
    ledgerEntry: { findMany: async () => [] },
    collection: { findMany: async () => collections },
    collectionOverpayment: { findMany: async () => [] },
    icrabotTimelineEntry: { findMany: async () => [] },
  };
  const service = new CaseBalanceService(prisma as never, { getRatesForPeriod: async () => [] } as never, engine());
  const balance = await service.computeCaseBalance('t1', 'case1', asOf);
  const display = toCaseBalanceDisplay({ tenantId: 't1', caseId: 'case1', balance, generatedAt: '2026-11-19T00:00:00.000Z' });
  return { balance, display };
}

/** Para birimi başına sıradan bağımsız karşılaştırma görüntüsü (kalem / dağıtım satırları kimliğe göre sıralanır). */
function perCurrencyView(balance: Awaited<ReturnType<typeof run>>['balance']) {
  return balance.currencyResults.map((row) => ({
    currency: row.currency,
    grossPrincipal: row.grossPrincipal,
    skippedReason: row.skippedReason ?? null,
    totalDue: row.result?.totalDue,
    totalInterest: row.result?.totalInterest,
    finalDebtStates: [...(row.result?.finalDebtStates ?? [])]
      .map((s) => ({ claimId: s.claimId, currency: s.currency, principal: s.principal, accruedInterest: s.accruedInterest }))
      .sort((a, b) => (a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0)),
    allocations: [...(row.result?.allocations ?? [])]
      .map((a) => JSON.stringify(a))
      .sort(),
  }));
}

const SENARYOLAR = [
  {
    ad: 'farklı başlangıç tarihleri (iki TRY + bir USD; iki TRY tahsilat + bir USD tahsilat)',
    items: [sabit('A-TRY', 'TRY', 1000, '2026-01-01', 36.5), sabit('B-TRY', 'TRY', 500, '2026-02-01', 36.5), sabit('U-USD', 'USD', 800, '2026-01-01', 10)],
    collections: [col('c1', 'TRY', 200, '2026-03-01'), col('c2', 'TRY', 150, '2026-04-01'), col('c3', 'USD', 100, '2026-03-15')],
  },
  {
    ad: 'EŞİT başlangıç tarihi, farklı oran (dağıtım önceliğinde eşitlik; kalem sırası sonucu değiştirmemeli)',
    items: [sabit('A-TRY', 'TRY', 1000, '2026-01-01', 36.5), sabit('B-TRY', 'TRY', 1000, '2026-01-01', 12), sabit('U-USD', 'USD', 800, '2026-01-01', 10)],
    collections: [col('c1', 'TRY', 300, '2026-03-01'), col('c3', 'USD', 100, '2026-03-15')],
  },
] as const;

describe('D8 / PR-6: para birimi sırası ve tutarlar giriş / sorgu sırasından bağımsız', () => {
  for (const s of SENARYOLAR) {
    it(`${s.ad}: her kalem × tahsilat sırasında currencyResults [TRY, USD]; para birimi başına tutar, faiz, toplam, dağıtım ve kalem son durumu AYNI`, async () => {
      const referans = await run([...s.items], [...s.collections], '2026-06-30');
      const refView = perCurrencyView(referans.balance);
      expect(refView.map((r) => r.currency)).toEqual(['TRY', 'USD']);
      expect(refView.every((r) => typeof r.totalDue === 'number' && r.totalDue > 0)).toBe(true);
      // perCurrency tanıları bu senaryolarda boş olabilir; varsa sırası da sabittir (aşağıda her sırada aynı olmalı).
      const refPerCurrency = referans.balance.diagnostics.perCurrency.map((p) => p.currency);
      const refDisplay = referans.display.currencies.map((c) => JSON.stringify(c));

      let sayac = 0;
      for (const itemOrder of permutations(s.items)) {
        for (const colOrder of permutations(s.collections)) {
          const { balance, display } = await run(itemOrder, colOrder, '2026-06-30');
          expect(perCurrencyView(balance)).toEqual(refView);
          expect(balance.diagnostics.perCurrency.map((p) => p.currency)).toEqual(refPerCurrency);
          expect(display.currencies.map((c) => JSON.stringify(c))).toEqual(refDisplay);
          sayac += 1;
        }
      }
      expect(sayac).toBe(permutations(s.items).length * permutations(s.collections).length);
    });
  }
});
