/**
 * ADR-014 temsili fikstürler — AYNI iş olayı hem legacy hem canonical kaynakta (disposable PostgreSQL).
 *
 * Önceki sentetik vakalar (scenario-materializer) karşılaştırma için anlamsızdı: alacağı yalnız
 * `ClaimItem` olarak yazıyordu (legacy `Case.dues`/`principalAmount` okur → anapara 0) ve iptali yalnız
 * REVERSAL ledger satırıyla temsil ediyordu (legacy `Collection.status != CANCELLED` sayar).
 * Burada iş olayı ÜRETİM yollarıyla kurulur:
 *   - Dosya: gerçek `CaseService.create` (POST /cases) → `Due` + aynı transaction'da G1 köprüsüyle ClaimItem.
 *     Due yazma sınırı faiz işletimini ACCRUES YAZAMAZ (UNKNOWN'a çeker; üretim kuralı).
 *   - Faiz teyidi — KAPSAM SINIRI: teyit, aynı normalize + doğrulama mantığını (provenance zorunluluğu dahil)
 *     uygulayan iç yazıcı `ClaimItemService.update` ile yapılır; yazma kapısı ve K4 dört-göz onayı bu adımda
 *     KOŞULMAZ (bu fikstürün konusu legacy↔canonical karşılaştırmasıdır). Üretimdeki kullanıcı yolu
 *     (`PUT /claim-items/:id` → `updateFromUser`, K4 onay talebi) bu fikstür yazıldığında ACCRUES teyidini
 *     `UNSUPPORTED_UPDATE_FIELD` ile reddediyordu; #2819 (`912866c6`) ile düzeltildi — artık onay + senkronla
 *     uygulanır. Kullanıcı yolu `claim-item/__tests__/claim-item-user-interest-accrual-gate.db-gated` spec'inde
 *     gerçek HTTP + kapı + onay ile sınanır.
 *   - Ödeme: gerçek `CollectionService.create`; iptal: gerçek `CollectionService.cancel` (Collection →
 *     CANCELLED + REVERSAL ledger + yevmiye).
 * Dış yan etkiler izole edilir (DB dışı): müvekkil otomatik bilgi talebi ve açılış masraf seti.
 *
 * Doğrulanan: (1) iki temsilin aynı olayı taşıdığı, (2) canonical'ın koddan BAĞIMSIZ elle aritmetikle
 * beklenen değerleri. Legacy tutarları KAYDEDİLİR ama eşitlik HEDEFLENMEZ — kalan legacy farkları raporlanır.
 */

// Runner grafiği CaseModule üzerinden `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1)
// verir (CI emsali: collection/__tests__/receipt-public-entrypoints-authorization.contract.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { Adr014ShadowEvidenceRunnerModule } from '../../../scripts/adr014-shadow-evidence-runner.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { BalanceDisplayShadowDiffService } from '../balance-display-shadow-diff.service';
import { CaseService } from '../../case/case.service';
import { CollectionService } from '../../collection/collection.service';
import { CollectionChannel, CollectionSource, CollectionType } from '../../collection/dto/collection.dto';
import { ClaimItemService } from '../../claim-item/claim-item.service';
import { ClientInfoRequestService } from '../../address-discovery/client-info-request.service';
import { ExpenseRequestService } from '../../expense-request/expense-request.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('ADR-014 temsili fikstur DB kapisi: CI onayli TEST_DATABASE_URL ister.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const START = '2026-06-01';
const PAYMENT_DATE = '2026-06-20';
const AS_OF = '2026-07-01';
const PRINCIPAL = 10_000;
const PAYMENT = 2_000;
const LEGAL_RATE = 0.24;

type Scenario = 'SINGLE_PAYMENT' | 'PAYMENT_THEN_CANCEL' | 'NO_PAYMENT';

// Koddan BAĞIMSIZ beklenen değerler: basit faiz, gün/365, kuruşa yuvarlama; TBK m.100 — ödeme önce
// işlemiş faize, kalanı anaparaya. Motorun kendi fonksiyonları KULLANILMAZ.
const r2 = (x: number) => Math.round(x * 100) / 100;
const days = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
const simple = (principal: number, from: string, to: string) => r2((principal * LEGAL_RATE * days(from, to)) / 365);
function expected(scenario: Scenario) {
  if (scenario === 'SINGLE_PAYMENT') {
    const i1 = simple(PRINCIPAL, START, PAYMENT_DATE); // 124.93
    const principalAfter = r2(PRINCIPAL - (PAYMENT - i1)); // 8124.93
    const i2 = simple(principalAfter, PAYMENT_DATE, AS_OF); // 58.77
    return { interest: r2(i1 + i2), principal: principalAfter, outstanding: r2(principalAfter + i2), paid: PAYMENT };
  }
  const i = simple(PRINCIPAL, START, AS_OF); // 197.26 — iptal edilen ödeme hiç olmamış gibi
  return { interest: i, principal: PRINCIPAL, outstanding: r2(PRINCIPAL + i), paid: 0 };
}

describeWithDisposableDb('ADR-014 temsili fikstürler — legacy ve canonical aynı iş olayı', () => {
  jest.setTimeout(180_000);
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  const report: Record<string, unknown>[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [Adr014ShadowEvidenceRunnerModule] }).compile();
    // DB dışı yan etkiler: müvekkile otomatik bilgi talebi ve açılış masraf seti (e-posta/iş akışı).
    jest.spyOn(moduleRef.get(ClientInfoRequestService, { strict: false }), 'sendAutoRequestOnCaseCreate').mockResolvedValue(undefined as never);
    jest.spyOn(moduleRef.get(ExpenseRequestService, { strict: false }), 'createOpeningExpenseSet').mockResolvedValue(null as never);
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService, { strict: false });
  });

  afterAll(async () => {
    // Kalan legacy farkları raporu (eşitlik iddiası DEĞİL).
    // eslint-disable-next-line no-console
    console.info(`ADR014_FIXTURE_REPORT ${JSON.stringify(report)}`);
    await moduleRef?.close();
  });

  async function seedTenant() {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `adr014fx-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `ADR014 fikstur ${suffix}`, slug: tenantId } });
    const user = await prisma.user.create({
      data: { tenantId, email: `${tenantId}@test.invalid`, name: 'ADR014', surname: 'Fikstur', role: 'ADMIN' },
    });
    // RateSchedule.tenantId → Office.id köprüsü (scenario-diagnostic-runner.seedLegalRate ile aynı).
    await prisma.office.create({ data: { id: tenantId, tenantId, name: 'ADR014 fikstur ofis' } });
    await prisma.rateSchedule.create({
      data: {
        tenantId,
        interestType: 'LEGAL_3095',
        validFrom: new Date('2020-01-01T00:00:00.000Z'),
        annualRate: LEGAL_RATE,
        source: 'MANUAL',
        versionHash: `adr014fx-${suffix}`,
      },
    });
    const client = await prisma.client.create({ data: { tenantId, displayName: 'ADR014 Muvekkil', type: 'INDIVIDUAL' } });
    const debtor = await prisma.debtor.create({ data: { tenantId, name: 'ADR014 Borclu', type: 'INDIVIDUAL' } });
    return { tenantId, userId: user.id, clientId: client.id, debtorId: debtor.id, suffix };
  }

  async function buildScenario(scenario: Scenario) {
    const t = await seedTenant();
    const caseService = moduleRef.get(CaseService, { strict: false });
    const created: any = await caseService.create(
      t.tenantId,
      {
        fileNumber: `ADR014FX/${t.suffix}`,
        type: 'GENERAL_EXECUTION',
        currency: 'TRY',
        startDate: START,
        creditors: [{ id: t.clientId }],
        debtors: [{ id: t.debtorId }],
        dues: [
          {
            type: 'PRINCIPAL',
            amount: PRINCIPAL,
            dueDate: START,
            currency: 'TRY',
            interestType: 'YASAL',
            interestStartDate: START,
          },
        ],
      } as any,
      t.userId,
      'ADMIN',
    );
    const caseId: string = created?.id ?? created?.case?.id;
    expect(caseId).toBeTruthy();

    // Faiz teyidi — iç yazıcı (başlıktaki KAPSAM SINIRI): normalize + validateInterestAccrualState uygulanır.
    const bridged = await prisma.claimItem.findFirstOrThrow({ where: { tenantId: t.tenantId, caseId } });
    expect(bridged.interestAccrualStatus).toBe('UNKNOWN'); // Due sınırı ACCRUES yazamaz
    await moduleRef.get(ClaimItemService, { strict: false }).update(
      t.tenantId,
      bridged.id,
      {
        interestAccrualStatus: 'ACCRUES',
        interestStartDateProvenance: 'MANUAL_LAWYER_CONFIRMED',
        interestStartDate: START,
        interestType: 'YASAL',
      } as any,
      t.userId,
    );

    if (scenario !== 'NO_PAYMENT') {
      const caseDebtor = await prisma.caseDebtor.findFirstOrThrow({ where: { caseId } });
      const collection = await moduleRef.get(CollectionService, { strict: false }).create(
        t.tenantId,
        {
          caseId,
          caseDebtorId: caseDebtor.id,
          idempotencyKey: randomUUID(),
          amount: PAYMENT,
          currency: 'TRY',
          type: CollectionType.BANK_TRANSFER,
          channel: CollectionChannel.BANKA,
          date: `${PAYMENT_DATE}T00:00:00.000Z`,
          sourceType: CollectionSource.MANUAL,
          receiptNo: `ADR014FX-${randomUUID()}`,
          autoAllocate: false,
        },
        t.userId,
        { correlationId: `adr014fx-${randomUUID()}` },
      );
      if (scenario === 'PAYMENT_THEN_CANCEL') {
        await moduleRef.get(CollectionService, { strict: false }).cancel(
          t.tenantId,
          collection.id,
          { cancelReason: 'ADR-014 temsili fikstur iptali' } as any,
          t.userId,
          caseId,
          { correlationId: `adr014fx-${randomUUID()}` },
        );
      }
    }
    return { ...t, caseId };
  }

  const amountOf = (diffs: any[], code: string) => diffs.find((d) => d.code === code);
  const bucketOf = (diffs: any[], bucket: string) => diffs.find((d) => d.bucket === bucket);

  it.each<Scenario>(['SINGLE_PAYMENT', 'PAYMENT_THEN_CANCEL', 'NO_PAYMENT'])(
    '%s: iki temsil aynı olayı taşır; canonical bağımsız beklenene eşit',
    async (scenario) => {
      const s = await buildScenario(scenario);

      // (1) AYNI iş olayı: tek Due ve onun G1 köprüsüyle üretilmiş tek PRINCIPAL ClaimItem'ı.
      const dues = await prisma.due.findMany({ where: { caseId: s.caseId } });
      expect(dues).toHaveLength(1);
      const claimItems = await prisma.claimItem.findMany({ where: { tenantId: s.tenantId, caseId: s.caseId } });
      expect(claimItems).toHaveLength(1);
      expect(claimItems[0].itemType).toBe('PRINCIPAL');
      expect(Number(claimItems[0].amount)).toBe(PRINCIPAL);
      expect((claimItems[0].metadata as any)?.dueSync?.sourceDueId).toBe(dues[0].id);
      expect(claimItems[0].interestAccrualStatus).toBe('ACCRUES');
      expect(claimItems[0].interestStartDateProvenance).toBe('MANUAL_LAWYER_CONFIRMED');
      const collections = await prisma.collection.findMany({ where: { tenantId: s.tenantId, caseId: s.caseId } });
      expect(collections.map((c) => c.status)).toEqual(
        scenario === 'NO_PAYMENT' ? [] : scenario === 'PAYMENT_THEN_CANCEL' ? ['CANCELLED'] : ['CONFIRMED'],
      );

      const caseService = moduleRef.get(CaseService, { strict: false });
      const legacy: any = await caseService.getCalculationSummary(s.tenantId, s.caseId, AS_OF);
      // Legacy aynı anaparayı ve aynı AKTİF ödemeyi görür (önceki fikstür artefaktları giderildi).
      expect(legacy.asilAlacak).toBe(PRINCIPAL);
      expect(legacy.toplamTahsilat).toBe(expected(scenario).paid);

      const shadow = moduleRef.get(BalanceDisplayShadowDiffService, { strict: false });
      const r: any = await shadow.compare(s.tenantId, s.caseId, AS_OF, new Date().toISOString());
      expect(r.sources.legacyCalculationSummary.available).toBe(true);
      expect(r.sources.canonicalBalanceDisplay.available).toBe(true);

      // (2) canonical == bağımsız beklenen.
      const e = expected(scenario);
      expect(amountOf(r.totals.diffs, 'INTEREST_DELTA').canonicalAmount).toBeCloseTo(e.interest, 2);
      expect(amountOf(r.totals.diffs, 'OUTSTANDING_DELTA').canonicalAmount).toBeCloseTo(e.outstanding, 2);
      expect(amountOf(r.totals.diffs, 'PAID_DELTA').canonicalAmount).toBeCloseTo(e.paid, 2);
      expect(bucketOf(r.bucketDiffs, 'PRINCIPAL').canonicalAmount).toBeCloseTo(e.principal, 2);

      report.push({
        scenario,
        expectedCanonical: e,
        totals: r.totals.diffs.map((d: any) => ({ code: d.code, legacy: d.legacyAmount, canonical: d.canonicalAmount, status: d.status })),
        buckets: r.bucketDiffs.map((d: any) => ({ bucket: d.bucket, legacy: d.legacyAmount, canonical: d.canonicalAmount, status: d.status })),
        legacyFields: {
          asilAlacak: legacy.asilAlacak,
          takipOncesiFaiz: legacy.takipOncesiFaiz,
          takipSonrasiFaiz: legacy.takipSonrasiFaiz,
          icraMasraflari: legacy.icraMasraflari,
          vekaletUcreti: legacy.vekaletUcreti,
          pesinHarcHaricTahsilHarci: legacy.pesinHarcHaricTahsilHarci,
          toplamTahsilat: legacy.toplamTahsilat,
          kalanAnapara: legacy.kalanAnapara,
          kalanBorc: legacy.kalanBorc,
        },
        comparabilityBlockers: r.comparability.blockers.map((b: any) => b.code),
      });
    },
  );
});
