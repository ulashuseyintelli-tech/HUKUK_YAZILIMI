/**
 * ADR-014 W0.2 — Hybrid Materializer DB-gated doğrulaması (G1/G2/G3/G5 + Conditional B).
 *
 * G6 (fail-safe): yalnız `resolveTestDatabaseUrl` ile çözülen `hukuk_*_gate`
 * disposable DB'de koşar; TEST_DATABASE_URL yoksa suite SKIP (CI'da beklenen).
 *
 * G5 self-check: materialize → GERÇEK `CaseBalanceService.computeCaseBalance`
 * (DB-okuma + assembler + mapper + engine) sonucu, AYNI senaryonun saf in-memory
 * `engine.computeBalance` sonucuyla karşılaştırılır. Assertion HESAPLAMAZ —
 * yalnız iki gerçek-engine gözlemini kıyaslar (Acceptance Criteria §12).
 *
 * S2 (Conditional B): REVERSAL satırı direct-write ÜRETİLİR (G1 ilişkisiyle);
 * main'in mevcut `computeCaseBalance` semantiği REVERSAL'ı OKUMAZ
 * (`entryType: 'PAYMENT'` filtresi) — beklenti bu MEVCUT davranışa sabitlenir
 * (davranış değişikliği YOK; netting PR-1B'nin işi). `writePathNote` =
 * WRITE_PATH_NOT_EXERCISED işareti doğrulanır.
 *
 * GUARDRAIL: buradaki hiçbir PASS, CollectionService.cancel() production
 * write-path'inin doğrulandığı anlamına GELMEZ (ayrı PR-1B gate'i).
 */
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import {
  materializeScenario,
  cleanupMaterializedScenario,
  MaterializedScenarioRefs,
} from '../scenario-materializer/scenario-materializer';
import { defineScenario, scenarioClaimBucket, scenarioPayment } from '../scenario-support/scenario-builder';
import { CaseBalanceService } from '../orchestration/case-balance.service';
import { RateProviderService } from '../rates/rate-provider.service';
import { InterestEngineService } from '../interest-engine.service';
import { PolicyGateV2Service } from '../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../segments/segment-builder.service';
import { VersionPinningService } from '../version/version-pinning.service';
import { TBK100AllocatorService } from '../allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../allocation/claim-priority.service';
import { AllocationEngineService } from '../allocation/allocation-engine.service';
import { DEFAULT_INTERPRETATION_PROFILE_ID } from '../types/calculation.types';
import type { RateEntry } from '../rates/rate-provider.service';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env as Record<string, string | undefined>);
const describeIf = TEST_DB_URL ? describe : describe.skip;

const AS_OF = '2026-07-01';
const CLAIM_START = '2026-06-01';
const PAY_DATE = '2026-06-20';
const ANNUAL_RATE = 0.24;

function buildEngine(): InterestEngineService {
  return new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    {} as never, // reportRenderer — computeBalance() içinde kullanılmaz (diagnostic-script emsali)
    {} as never, // auditWriter — yalnız calculate() orkestratöründe
    new VersionPinningService(),
    undefined,
  );
}

const RATE: RateEntry = {
  id: 'w02-rate-legal',
  interestType: 'LEGAL_3095' as RateEntry['interestType'],
  annualRate: ANNUAL_RATE,
  validFrom: '2020-01-01',
  validTo: null,
  sourceId: 'w02-test',
  sourceName: 'W02_TEST',
  publishedAt: '2020-01-01',
  currency: 'TRY',
};

describeIf('W0.2 Hybrid Materializer — DB-gated (G1/G2/G3/G5 + Conditional B)', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient;
  let caseBalance: CaseBalanceService;
  const allRefs: MaterializedScenarioRefs[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const engine = buildEngine();
    caseBalance = new CaseBalanceService(
      prisma as never,
      new RateProviderService(prisma as never),
      engine,
    );
  });

  afterAll(async () => {
    for (const refs of allRefs) {
      await cleanupMaterializedScenario(prisma, refs);
    }
    await prisma.$disconnect();
  });

  async function seedRate(tenantId: string): Promise<void> {
    // Şema: RateSchedule.tenantId FK'sı Office.id'ye bağlıdır (`tenant Office @relation`);
    // runtime sorgusu (RateProviderService) ise computeCaseBalance'ın Tenant.id'siyle
    // filtreler. Bu ikisi ancak Office.id == Tenant.id iken buluşur (Office.tenantId
    // @unique — tenant başına tek ofis). Kurulum aynı eşleşmeyi köprü satırıyla kurar.
    await prisma.office.create({
      data: { id: tenantId, tenantId, name: `W0.2 Office (${tenantId})` },
    });
    await prisma.rateSchedule.create({
      data: {
        tenantId,
        interestType: 'LEGAL_3095',
        validFrom: new Date(RATE.validFrom),
        validTo: null,
        annualRate: ANNUAL_RATE,
        source: 'MANUAL',
        versionHash: 'w02-test-hash',
      },
    });
  }

  function simpleScenario(id: string) {
    return defineScenario({
      id,
      title: 'W0.2 basit TRY: tek anapara + tek ödeme',
      domainInput: {
        claimBuckets: [
          scenarioClaimBucket({
            id: `${id}-claim-1`,
            amount: 10_000,
            currency: 'TRY',
            startDate: CLAIM_START,
            interestType: 'LEGAL_3095',
          }),
        ],
        payments: [
          scenarioPayment({ id: `${id}-pay-1`, date: PAY_DATE, amount: 2_000, currency: 'TRY' }),
        ],
        asOfDate: AS_OF,
      },
      expected: {
        perCurrencyStatus: { TRY: 'OK' },
        blockerCodes: [],
        authority: 'CANONICAL_CANDIDATE',
      },
      persistenceIntent: { tenantSetup: 'SINGLE', currency: 'TRY' },
    });
  }

  /** Saf in-memory beklenti — GERÇEK engine, DB'siz (golden-matrix deseni). */
  function inMemoryResult(def: ReturnType<typeof simpleScenario>) {
    const engine = buildEngine();
    return engine.computeBalance(
      {
        caseId: def.id,
        claimBuckets: def.domainInput.claimBuckets,
        payments: def.domainInput.payments,
        asOfDate: def.domainInput.asOfDate,
        mode: 'PREVIEW',
        options: { dayCountBasis: 365 },
      } as never,
      [RATE as never],
      new Date().toISOString(),
      DEFAULT_INTERPRETATION_PROFILE_ID,
    );
  }

  it('S1: G1/G2 satır bütünlüğü + G5 self-check (materialize→computeCaseBalance == in-memory engine)', async () => {
    const def = simpleScenario('w02-s1');
    const refs = await materializeScenario(prisma, def, { fileNumberPrefix: 'W02S1' });
    allRefs.push(refs);

    // G1: ilişki bütünlüğü — tek tenant kaynağı + FK zinciri
    const item = await prisma.claimItem.findUniqueOrThrow({ where: { id: refs.claimItemIds[0] } });
    const ledger = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: refs.paymentLedgerEntryIds[0] },
    });
    const collection = await prisma.collection.findUniqueOrThrow({
      where: { id: refs.collectionIds[0] },
    });
    expect(item.tenantId).toBe(refs.tenantId);
    expect(item.caseId).toBe(refs.caseId);
    expect(ledger.tenantId).toBe(refs.tenantId);
    expect(ledger.caseId).toBe(refs.caseId);
    expect(ledger.collectionId).toBe(collection.id);
    expect(collection.caseId).toBe(refs.caseId);
    expect(collection.status).toBe('CONFIRMED');

    // G2: üç-tutar her zaman set
    expect(Number(item.originalAmount)).toBe(10_000);
    expect(Number(item.demandedAmount)).toBe(10_000);
    expect(Number(item.amount)).toBe(10_000);

    // G5: self-check — DB yolu == saf in-memory engine
    await seedRate(refs.tenantId);
    const dbResult = await caseBalance.computeCaseBalance(refs.tenantId, refs.caseId, AS_OF);
    const memResult = inMemoryResult(def);

    const dbTry = dbResult.currencyResults.find((c) => c.currency === 'TRY');
    expect(dbTry?.result).not.toBeNull();
    expect(dbTry!.result!.totalInterest).toBeCloseTo(memResult.totalInterest, 2);
    expect(dbTry!.result!.totalDue).toBeCloseTo(memResult.totalDue, 2);
  });

  it('S2: Conditional B — REVERSAL direct-write üretilir (G1) ama mevcut main semantiği onu okumaz; writePathNote işaretli', async () => {
    const def = simpleScenario('w02-s2');
    const refs = await materializeScenario(prisma, def, {
      fileNumberPrefix: 'W02S2',
      reversals: [{ ofPaymentId: 'w02-s2-pay-1' }],
    });
    allRefs.push(refs);

    // G1: REVERSAL ilişkisi zorunlu ve doğru
    expect(refs.reversalLedgerEntryIds).toHaveLength(1);
    const reversal = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: refs.reversalLedgerEntryIds[0] },
    });
    expect(reversal.entryType).toBe('REVERSAL');
    expect(reversal.reversesLedgerEntryId).toBe(refs.paymentLedgerEntryIds[0]);
    expect(Number(reversal.amount)).toBe(-2_000);

    // Conditional B işareti (serbest-metin metadata)
    expect(refs.writePathNote).toContain('WRITE_PATH_NOT_EXERCISED');

    // Mevcut main davranışı SABİTLENİR: computeCaseBalance yalnız PAYMENT okur →
    // sonuç, REVERSAL'sız in-memory ile AYNI (netting PR-1B'nin işi, burada beklenmez).
    await seedRate(refs.tenantId);
    const dbResult = await caseBalance.computeCaseBalance(refs.tenantId, refs.caseId, AS_OF);
    const memResult = inMemoryResult(def);
    const dbTry = dbResult.currencyResults.find((c) => c.currency === 'TRY');
    expect(dbTry!.result!.totalDue).toBeCloseTo(memResult.totalDue, 2);
  });

  it('S3: G3 — scoped before/after delta==0 (timeline/outbox/journal/audit taklit edilmez)', async () => {
    const def = simpleScenario('w02-s3');

    // Scope'lu ÖNCE sayımları: tenant henüz yok → tenant-scoped sayaçlar 0 taban;
    // caseId de materialize'da doğacak. Bu yüzden delta ölçümü materialize'ın
    // ÜRETTİĞİ tenant/case kapsamı üzerinden yapılır (global count DEĞİL — owner G3 kuralı).
    const refs = await materializeScenario(prisma, def, { fileNumberPrefix: 'W02S3' });
    allRefs.push(refs);

    const [timeline, outbox, journal, audit] = await Promise.all([
      (prisma as never as { icrabotTimelineEntry: { count(a: object): Promise<number> } })
        .icrabotTimelineEntry.count({ where: { caseId: refs.caseId } }),
      (prisma as never as { icrabotOutboxAction: { count(a: object): Promise<number> } })
        .icrabotOutboxAction.count({ where: { tenantId: refs.tenantId } }),
      (prisma as never as { accountingJournalEntry: { count(a: object): Promise<number> } })
        .accountingJournalEntry.count({ where: { tenantId: refs.tenantId } }),
      (prisma as never as { auditLog: { count(a: object): Promise<number> } })
        .auditLog.count({ where: { tenantId: refs.tenantId } }),
    ]);

    expect({ timeline, outbox, journal, audit }).toEqual({
      timeline: 0,
      outbox: 0,
      journal: 0,
      audit: 0,
    });
  });

  it('S4: tenant izolasyonu — yanlış tenant ile senaryonun case verisi görünmez', async () => {
    const def = defineScenario({
      ...simpleScenario('w02-s4'),
      id: 'w02-s4',
      persistenceIntent: { tenantSetup: 'TWO_TENANT_ISOLATION', currency: 'TRY' },
    });
    const refs = await materializeScenario(prisma, def, { fileNumberPrefix: 'W02S4' });
    allRefs.push(refs);
    expect(refs.secondaryTenantId).toBeDefined();

    await seedRate(refs.tenantId);
    const crossTenant = await caseBalance.computeCaseBalance(
      refs.secondaryTenantId!,
      refs.caseId,
      AS_OF,
    );

    // Yanlış tenant: canonical sonuç ÜRETİLMEMELİ (case tenant-scoped bulunamaz).
    const produced = crossTenant.currencyResults.some((c) => c.result !== null);
    expect(produced).toBe(false);
  });
});
