/**
 * ADR-014 W0.3 — Diagnostic Dual Mode DB-gated doğrulaması.
 *
 * Fail-safe (W0.2 G6 emsali): yalnız `resolveTestDatabaseUrl` ile çözülen
 * `hukuk_*_gate` disposable DB'de koşar; TEST_DATABASE_URL yoksa suite SKIP.
 *
 * D1 — SYNTHETIC mod: ScenarioDefinition → materialize → GERÇEK üretim yolu
 *      (computeCaseBalance → toCaseBalanceDisplay) → expected-vs-actual
 *      match. Ek olarak W0.2 G5 devamlılığı: DB yolundaki currency satırı
 *      saf in-memory engine sonucuyla eşleşir (frozen e: AYNI senaryo
 *      id'sinin unit ve DB-gated gözlemleri karşılaştırılabilir).
 * D2 — Karşılaştırıcı DÜRÜSTLÜĞÜ: bilinçli yanlış expected → match=false ve
 *      mismatch alanı doğru raporlanır (yalancı-PASS yok).
 * D3 — ORGANIC mod: gerçek tenant case'leri taranır; excludeCaseIds yalnız
 *      bu modda; tenant-scope dışına taşmaz; evidence kaydı expected TAŞIMAZ.
 *
 * GUARDRAIL: buradaki hiçbir PASS, CollectionService.cancel() production
 * write-path'inin doğrulandığı anlamına GELMEZ (PR-1B ayrı gate).
 */
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import {
  runSyntheticScenarioDiagnostic,
  runOrganicReadinessDiagnostic,
  ScenarioDiagnosticFailure,
} from '../scenario-diagnostic/scenario-diagnostic-runner';
import {
  cleanupMaterializedScenario,
  materializeScenario,
  MaterializedScenarioRefs,
} from '../scenario-materializer/scenario-materializer';
import { defineScenario, scenarioClaimBucket, scenarioPayment } from '../scenario-support/scenario-builder';
import type { ScenarioDefinition } from '../scenario-support/scenario-definition';
import { CaseBalanceService } from '../orchestration/case-balance.service';
import { toCaseBalanceDisplay } from '../orchestration/case-balance-display';
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
import { InterestTypeCode } from '../types/domain.types';
import { toCents } from '../allocation/minor-unit';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env as Record<string, string | undefined>);
const describeIf = TEST_DB_URL ? describe : describe.skip;

const AS_OF = '2026-07-01';
const CLAIM_START = '2026-06-01';
const PAY_DATE = '2026-06-20';
const ANNUAL_RATE = 0.24;

const RATE: RateEntry = {
  id: 'w03-rate-legal',
  interestType: 'LEGAL_3095' as RateEntry['interestType'],
  annualRate: ANNUAL_RATE,
  validFrom: '2020-01-01',
  validTo: null,
  sourceId: 'w03-test',
  sourceName: 'W03_TEST',
  publishedAt: '2020-01-01',
  currency: 'TRY',
};

function buildEngine(): InterestEngineService {
  return new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    {} as never,
    {} as never,
    new VersionPinningService(),
    undefined,
  );
}

function simpleScenario(id: string, tenantSetup: 'SINGLE' | 'TWO_TENANT_ISOLATION' = 'SINGLE'): ScenarioDefinition {
  return defineScenario({
    id,
    title: 'W0.3 basit TRY: tek anapara + tek ödeme',
    domainInput: {
      claimBuckets: [
        scenarioClaimBucket({
          id: `${id}-claim-1`,
          amount: 10_000,
          currency: 'TRY',
          startDate: CLAIM_START,
          interestType: InterestTypeCode.LEGAL_3095,
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
      // Mevcut main davranışı SABİTLENİR (characterization): display mapper'ı
      // bugün OK durumunda HER ZAMAN 'SHADOW_ONLY' üretir; 'CANONICAL_CANDIDATE'
      // ataması cutover PR'larının (PR-11/12) işidir — burada beklenmez.
      authority: 'SHADOW_ONLY',
      // PR-8a official snapshot uretmez: blocker yokken read-only signal UNSAFE kalir.
      snapshotStatus: 'UNSAFE',
    },
    persistenceIntent: { tenantSetup, currency: 'TRY' },
  });
}

describeIf('W0.3 Diagnostic Dual Mode — DB-gated', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient;
  const allRefs: MaterializedScenarioRefs[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const refs of allRefs) {
      await cleanupMaterializedScenario(prisma, refs);
    }
    await prisma.$disconnect();
  });

  it('D1: synthetic mod — expected-vs-actual match + in-memory devamlılık (G5/frozen e)', async () => {
    const def = simpleScenario('w03-d1');
    const { evidence, refs } = await runSyntheticScenarioDiagnostic(prisma, def);
    allRefs.push(refs);

    expect(evidence.mode).toBe('SYNTHETIC_SCENARIO');
    expect(evidence.scenarioId).toBe('w03-d1');
    expect(evidence.classifications).toEqual([
      'Deterministic Setup',
      'Expected Evidence',
      'Actual Runtime Observation',
      'Diagnostic Output',
    ]);
    expect(evidence.comparison).toBeDefined();
    expect(evidence.comparison!.mismatches).toEqual([]);
    expect(evidence.comparison!.match).toBe(true);
    expect(evidence.observedStatus).toBe('OK');
    expect(evidence.observedAuthority).toBe(def.expected.authority);
    expect(evidence.observedSnapshotStatus).toBe('UNSAFE');
    expect(evidence.observedSnapshotAvailable).toBe(false);
    expect(evidence.observedPrimaryDisplayEligible).toBe(false);
    expect(evidence.observedReadinessBlockerCodes).toEqual([]);

    // W0.2 G5 devamlılığı: AYNI senaryonun saf in-memory engine sonucu,
    // DB-gated üretim yolu gözlemiyle eşleşir (assertion HESAPLAMAZ —
    // iki gerçek gözlem kıyaslanır).
    const mem = buildEngine().computeBalance(
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
    const service = new CaseBalanceService(
      prisma as never,
      new RateProviderService(prisma as never),
      buildEngine(),
    );
    const dbBalance = await service.computeCaseBalance(refs.tenantId, refs.caseId, AS_OF);
    const display = toCaseBalanceDisplay({ tenantId: refs.tenantId, caseId: refs.caseId, balance: dbBalance });
    const tryRow = display.currencies.find((c) => c.currency === 'TRY');
    expect(tryRow).toBeDefined();
    expect(tryRow!.skipped).toBe(false);
    expect(tryRow!.interest).toBeCloseTo(mem.totalInterest, 2);
    expect(tryRow!.claimRemaining).toBeCloseTo(mem.totalDue, 2);
  });

  it('D6 / PR-4: real DB flow mutates only the future principal interest base and preserves tenant isolation', async () => {
    const id = 'pr4-interest-base';
    const def = defineScenario({
      id,
      title: 'PR-4 partial payment reaches principal and reduces only the future interest base',
      domainInput: {
        claimBuckets: [
          scenarioClaimBucket({
            id: `${id}-claim-1`,
            amount: 1_000,
            currency: 'TRY',
            startDate: '2026-06-01',
            interestType: InterestTypeCode.LEGAL_3095,
          }),
        ],
        payments: [
          scenarioPayment({ id: `${id}-pay-1`, date: '2026-06-11', amount: 20, currency: 'TRY' }),
        ],
        asOfDate: '2026-06-21',
      },
      expected: {
        perCurrencyStatus: { TRY: 'OK' },
        blockerCodes: [],
        authority: 'SHADOW_ONLY',
      },
      persistenceIntent: { tenantSetup: 'TWO_TENANT_ISOLATION', currency: 'TRY' },
    });
    const { evidence, refs } = await runSyntheticScenarioDiagnostic(prisma, def, { annualRate: 0.365 });
    allRefs.push(refs);

    expect(evidence.comparison).toMatchObject({ match: true, mismatches: [] });
    expect(refs.secondaryTenantId).toBeDefined();

    const service = new CaseBalanceService(
      prisma as never,
      new RateProviderService(prisma as never),
      buildEngine(),
    );
    const balance = await service.computeCaseBalance(refs.tenantId, refs.caseId, def.domainInput.asOfDate);
    const tryResult = balance.currencyResults.find((currency) => currency.currency === 'TRY')?.result;

    expect(balance.source).toBe('LEDGER');
    expect(balance.diagnostics.fatal).toEqual([]);
    expect(tryResult).toBeDefined();
    expect(tryResult!.totalInterest).toBe(19.9);
    expect(tryResult!.finalDebtStates).toEqual([
      expect.objectContaining({ principal: 990, accruedInterest: 9.9 }),
    ]);
    expect(tryResult!.segments.map((segment) => [
      segment.periodStart,
      segment.periodEnd,
      segment.principal,
      segment.segmentInterest,
    ])).toEqual([
      ['2026-06-01', '2026-06-11', 1_000, 10],
      ['2026-06-11', '2026-06-21', 990, 9.9],
    ]);

    const crossTenant = await service.computeCaseBalance(
      refs.secondaryTenantId!,
      refs.caseId,
      def.domainInput.asOfDate,
    );
    expect(crossTenant.currencyResults).toEqual([]);
    expect(crossTenant.diagnostics.fatal).toEqual([{ code: 'CASE_NOT_FOUND', caseId: refs.caseId }]);
  });

  it('D7 / PR-5: real DB flow splits Case.caseDate PRE/POST and preserves PR-4 mutation plus tenant isolation', async () => {
    const id = 'pr5-enforcement-date';
    const def = defineScenario({
      id,
      title: 'PR-5 enforcement boundary with pre-enforcement principal payment',
      domainInput: {
        claimBuckets: [
          scenarioClaimBucket({
            id: `${id}-claim-1`,
            amount: 1_000,
            currency: 'TRY',
            startDate: '2026-06-01',
            interestType: InterestTypeCode.LEGAL_3095,
          }),
        ],
        payments: [
          scenarioPayment({ id: `${id}-pay-1`, date: '2026-06-11', amount: 20, currency: 'TRY' }),
        ],
        asOfDate: '2026-06-21',
        enforcementDate: '2026-06-15',
      },
      expected: {
        perCurrencyStatus: { TRY: 'OK' },
        blockerCodes: [],
        authority: 'SHADOW_ONLY',
      },
      persistenceIntent: { tenantSetup: 'TWO_TENANT_ISOLATION', currency: 'TRY' },
    });
    const { evidence, refs } = await runSyntheticScenarioDiagnostic(prisma, def, { annualRate: 0.365 });
    allRefs.push(refs);

    expect(evidence.comparison).toMatchObject({ match: true, mismatches: [] });
    expect(refs.secondaryTenantId).toBeDefined();

    const service = new CaseBalanceService(
      prisma as never,
      new RateProviderService(prisma as never),
      buildEngine(),
    );
    const balance = await service.computeCaseBalance(refs.tenantId, refs.caseId, def.domainInput.asOfDate);
    const tryResult = balance.currencyResults.find((currency) => currency.currency === 'TRY')?.result;

    expect(balance.diagnostics.fatal).toEqual([]);
    expect(tryResult).toMatchObject({
      totalInterest: 19.9,
      preEnforcementInterest: 13.96,
      postEnforcementInterest: 5.94,
    });
    expect(
      toCents(tryResult!.preEnforcementInterest ?? 0)
      + toCents(tryResult!.postEnforcementInterest ?? 0),
    ).toBe(toCents(tryResult!.totalInterest));
    expect(tryResult!.finalDebtStates).toEqual([
      expect.objectContaining({ principal: 990, accruedInterest: 9.9 }),
    ]);
    expect(tryResult!.segments.map((segment) => [
      segment.periodStart,
      segment.periodEnd,
      segment.principal,
      segment.phase,
    ])).toEqual([
      ['2026-06-01', '2026-06-11', 1_000, 'PRE_ENFORCEMENT'],
      ['2026-06-11', '2026-06-15', 990, 'PRE_ENFORCEMENT'],
      ['2026-06-15', '2026-06-21', 990, 'POST_ENFORCEMENT'],
    ]);

    const crossTenant = await service.computeCaseBalance(
      refs.secondaryTenantId!,
      refs.caseId,
      def.domainInput.asOfDate,
    );
    expect(crossTenant.currencyResults).toEqual([]);
    expect(crossTenant.diagnostics.fatal).toEqual([{ code: 'CASE_NOT_FOUND', caseId: refs.caseId }]);
  });

  it('D8 / PR-6: real DB flow isolates currencies and fail-closes payment/reversal mismatch evidence', async () => {
    const id = 'pr6-currency-hardening';
    const def = defineScenario({
      id,
      title: 'PR-6 TRY/USD independent groups with currency mismatch gates',
      domainInput: {
        claimBuckets: [
          scenarioClaimBucket({
            id: `${id}-claim-try`,
            amount: 1_000,
            currency: 'TRY',
            startDate: '2026-06-01',
            interestType: InterestTypeCode.LEGAL_3095,
          }),
          scenarioClaimBucket({
            id: `${id}-claim-usd`,
            amount: 500,
            currency: 'USD',
            startDate: '2026-06-01',
            interestType: InterestTypeCode.LEGAL_3095,
          }),
        ],
        payments: [
          scenarioPayment({ id: `${id}-pay-try`, date: '2026-06-10', amount: 20, currency: 'TRY' }),
          scenarioPayment({ id: `${id}-pay-usd`, date: '2026-06-12', amount: 10, currency: 'USD' }),
        ],
        asOfDate: '2026-06-21',
        enforcementDate: '2026-06-15',
      },
      expected: {
        perCurrencyStatus: { TRY: 'OK', USD: 'OK' },
        blockerCodes: [],
        authority: 'SHADOW_ONLY',
      },
      persistenceIntent: { tenantSetup: 'TWO_TENANT_ISOLATION', currency: 'TRY' },
    });
    const refs = await materializeScenario(prisma, def);
    allRefs.push(refs);

    // Fixed-rate test fixture: currency groupingi doğrularken yeni rate/FX authority kurmaz.
    await prisma.claimItem.updateMany({
      where: { tenantId: refs.tenantId, caseId: refs.caseId },
      data: { interestType: 'SABIT', interestRate: 12 },
    });

    const service = new CaseBalanceService(
      prisma as never,
      new RateProviderService(prisma as never),
      buildEngine(),
    );
    const valid = await service.computeCaseBalance(refs.tenantId, refs.caseId, def.domainInput.asOfDate);

    expect(valid.diagnostics.fatal).toEqual([]);
    expect(valid.diagnostics.currency).toEqual([]);
    expect(valid.currencyResults.map((row) => row.currency)).toEqual(['TRY', 'USD']);
    for (const row of valid.currencyResults) {
      expect(row.result).not.toBeNull();
      expect(new Set(row.result!.finalDebtStates.map((state) => state.currency))).toEqual(new Set([row.currency]));
      expect(
        toCents(row.result!.preEnforcementInterest ?? 0)
        + toCents(row.result!.postEnforcementInterest ?? 0),
      ).toBe(toCents(row.result!.totalInterest));
    }

    const crossTenant = await service.computeCaseBalance(
      refs.secondaryTenantId!,
      refs.caseId,
      def.domainInput.asOfDate,
    );
    expect(crossTenant.currencyResults).toEqual([]);
    expect(crossTenant.diagnostics.fatal).toEqual([{ code: 'CASE_NOT_FOUND', caseId: refs.caseId }]);

    const usdPaymentId = `${id}-pay-usd`;
    await prisma.ledgerEntry.update({ where: { id: usdPaymentId }, data: { currency: 'EUR' } });
    const paymentMismatch = await service.computeCaseBalance(refs.tenantId, refs.caseId, def.domainInput.asOfDate);
    const paymentMismatchDisplay = toCaseBalanceDisplay({
      tenantId: refs.tenantId,
      caseId: refs.caseId,
      balance: paymentMismatch,
    });

    expect(paymentMismatch.currencyResults.find((row) => row.currency === 'EUR')).toMatchObject({
      result: null,
      skippedReason: 'NO_BUCKETS',
    });
    expect(paymentMismatch.diagnostics.currency).toEqual([
      { code: 'CURRENCY_MISMATCH', currency: 'EUR', detail: '1 payment(s), 0 bucket' },
    ]);
    expect(paymentMismatchDisplay).toMatchObject({
      status: 'UNAVAILABLE',
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      snapshotAvailable: false,
      readiness: {
        status: 'BLOCKED',
        primaryDisplayEligible: false,
      },
    });
    expect(paymentMismatchDisplay.readiness.blockers.map((blocker) => blocker.code)).toEqual([
      'NO_BUCKETS',
      'CURRENCY_INTEGRITY',
    ]);
    expect(paymentMismatchDisplay.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CURRENCY_MISMATCH', severity: 'BLOCKER' }),
    ]));

    await prisma.ledgerEntry.update({ where: { id: usdPaymentId }, data: { currency: 'USD' } });
    await prisma.ledgerEntry.create({
      data: {
        id: `${id}-reversal-eur`,
        tenantId: refs.tenantId,
        caseId: refs.caseId,
        collectionId: refs.collectionIds[1],
        entryType: 'REVERSAL',
        amount: -10,
        currency: 'EUR',
        entryDate: new Date('2026-06-13T00:00:00.000Z'),
        reversesLedgerEntryId: usdPaymentId,
      },
    });
    const reversalMismatch = await service.computeCaseBalance(refs.tenantId, refs.caseId, def.domainInput.asOfDate);
    const reversalMismatchDisplay = toCaseBalanceDisplay({
      tenantId: refs.tenantId,
      caseId: refs.caseId,
      balance: reversalMismatch,
    });

    expect(reversalMismatch.currencyResults).toEqual([]);
    expect(reversalMismatch.diagnostics.fatal).toEqual([
      { code: 'REVERSAL_INTEGRITY_INVALID', caseId: refs.caseId },
    ]);
    expect(reversalMismatch.diagnostics.payments).toEqual([
      expect.objectContaining({ code: 'REVERSAL_CURRENCY_MISMATCH', paymentId: `${id}-reversal-eur` }),
    ]);
    expect(reversalMismatchDisplay.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'REVERSAL_CURRENCY_MISMATCH', severity: 'BLOCKER' }),
    ]));
    expect(reversalMismatchDisplay).toMatchObject({
      status: 'UNAVAILABLE',
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      snapshotAvailable: false,
      readiness: {
        status: 'BLOCKED',
        primaryDisplayEligible: false,
      },
    });
    expect(reversalMismatchDisplay.readiness.blockers.map((blocker) => blocker.code)).toEqual([
      'REVERSAL_INTEGRITY',
    ]);
  });

  it('D9 / PR-7: real DB carries persisted fee projection per currency and fails closed without zero fallback', async () => {
    const def = simpleScenario('pr7-fee-projection', 'TWO_TENANT_ISOLATION');
    const refs = await materializeScenario(prisma, def);
    allRefs.push(refs);
    const service = new CaseBalanceService(
      prisma as never,
      new RateProviderService(prisma as never),
      buildEngine(),
    );

    const before = await service.computeCaseBalance(refs.tenantId, refs.caseId, def.domainInput.asOfDate);
    const beforeDisplay = toCaseBalanceDisplay({ tenantId: refs.tenantId, caseId: refs.caseId, balance: before });
    expect(before.feeProjection).toMatchObject({
      status: 'NOT_CALCULATED',
      totalProjectedAmount: null,
    });
    expect(before.feeProjection.totalProjectedAmount).not.toBe(0);

    const feeId = `${def.id}-fee-try`;
    await prisma.claimItem.create({
      data: {
        id: feeId,
        tenantId: refs.tenantId,
        caseId: refs.caseId,
        itemType: 'FEE',
        originalAmount: 12.34,
        demandedAmount: 12.34,
        amount: 12.34,
        currency: 'TRY',
      },
    });

    const available = await service.computeCaseBalance(refs.tenantId, refs.caseId, def.domainInput.asOfDate);
    const availableDisplay = toCaseBalanceDisplay({
      tenantId: refs.tenantId,
      caseId: refs.caseId,
      balance: available,
    });
    expect(available.feeProjection).toMatchObject({
      status: 'AVAILABLE',
      authority: 'SOURCE_PROJECTION_ONLY',
      policyStatus: 'OWNER_GATED',
      currency: 'TRY',
      totalProjectedAmount: 12.34,
    });
    expect(available.feeProjection.groups[0].lines).toEqual([
      expect.objectContaining({ sourceItemId: feeId, amount: 12.34, currency: 'TRY' }),
    ]);
    expect(availableDisplay.feeProjection).toEqual(available.feeProjection);
    expect(availableDisplay.status).toBe(beforeDisplay.status);
    expect(availableDisplay.authority).toBe(beforeDisplay.authority);
    expect(availableDisplay.provenance.feeProjectionAuthorityPromoted).toBe(false);

    await prisma.claimItem.update({ where: { id: feeId }, data: { currency: 'USD' } });
    const mismatch = await service.computeCaseBalance(refs.tenantId, refs.caseId, def.domainInput.asOfDate);
    expect(mismatch.feeProjection).toMatchObject({
      status: 'UNAVAILABLE',
      totalProjectedAmount: null,
    });
    expect(mismatch.feeProjection.groups[0].lines[0]).toMatchObject({
      currency: 'USD',
      amount: null,
      status: 'UNAVAILABLE',
    });
    expect(mismatch.feeProjection.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'FEE_PROJECTION_CURRENCY_MISMATCH',
    );

    const crossTenant = await service.computeCaseBalance(
      refs.secondaryTenantId!,
      refs.caseId,
      def.domainInput.asOfDate,
    );
    expect(crossTenant.currencyResults).toEqual([]);
    expect(crossTenant.feeProjection).toMatchObject({
      status: 'UNAVAILABLE',
      authority: 'UNAVAILABLE',
      totalProjectedAmount: null,
    });
    expect(crossTenant.diagnostics.fatal).toEqual([{ code: 'CASE_NOT_FOUND', caseId: refs.caseId }]);
  });

  it('D2: karşılaştırıcı dürüstlüğü — bilinçli yanlış expected match=false üretir', async () => {
    const def = defineScenario({
      ...simpleScenario('w03-d2'),
      expected: {
        perCurrencyStatus: { TRY: 'OK' },
        blockerCodes: [],
        // Bilinçli yanlış: mevcut main yolu SHADOW_ONLY üretir (cutover öncesi);
        // CANONICAL_CANDIDATE beklentisi bugün mismatch ÜRETMEK ZORUNDADIR.
        authority: 'CANONICAL_CANDIDATE',
      },
    });
    const { evidence, refs } = await runSyntheticScenarioDiagnostic(prisma, def);
    allRefs.push(refs);

    expect(evidence.comparison!.match).toBe(false);
    expect(evidence.comparison!.mismatches.some((m) => m.field === 'authority')).toBe(true);
  });

  it('D3: organik mod — tenant-scoped tarama, excludeCaseIds yalnız bu modda, expected taşımaz', async () => {
    const def = simpleScenario('w03-d3', 'TWO_TENANT_ISOLATION');
    const { refs } = await runSyntheticScenarioDiagnostic(prisma, def);
    allRefs.push(refs);
    expect(refs.secondaryTenantId).toBeDefined();

    // (i) Organik tarama: tenant'ın gerçek case'i görünür; evidence gözlemdir.
    const organic = await runOrganicReadinessDiagnostic(prisma, {
      tenantId: refs.tenantId,
      asOfDate: AS_OF,
    });
    expect(organic).toHaveLength(1);
    expect(organic[0].scenarioId).toBe(`organic:${refs.caseId}`);
    expect(organic[0].mode).toBe('ORGANIC_READINESS');
    expect(organic[0].classifications).toEqual(['Actual Runtime Observation', 'Diagnostic Output']);
    expect(organic[0].expected).toBeUndefined();
    expect(organic[0].comparison).toBeUndefined();

    // (ii) QA-seed dışlama ilkesi (yalnız organik): dışlanan case taranmaz.
    const excluded = await runOrganicReadinessDiagnostic(prisma, {
      tenantId: refs.tenantId,
      asOfDate: AS_OF,
      excludeCaseIds: [refs.caseId],
    });
    expect(excluded).toHaveLength(0);

    // (iii) Tenant-scope: ikinci (boş) tenant'ta hiçbir case gözlemlenmez.
    const crossTenant = await runOrganicReadinessDiagnostic(prisma, {
      tenantId: refs.secondaryTenantId!,
      asOfDate: AS_OF,
    });
    expect(crossTenant).toHaveLength(0);
  });

  it('D4: hesaplama aşaması başarısızsa synthetic fixture otomatik temizlenir', async () => {
    const id = 'w03-d4-cleanup';
    const base = simpleScenario(id);
    const def = defineScenario({
      ...base,
      domainInput: { ...base.domainInput, asOfDate: 'not-a-date' },
    });

    let failure: unknown;
    try {
      await runSyntheticScenarioDiagnostic(prisma, def);
    } catch (cause) {
      failure = cause;
    }

    expect(failure).toBeInstanceOf(ScenarioDiagnosticFailure);
    expect(failure).toMatchObject({
      code: 'W03_DIAGNOSTIC_FAILURE',
      stage: 'CALCULATION',
    });
    expect(
      await prisma.tenant.findUnique({ where: { id: `w02-${id}-tenant` } }),
    ).toBeNull();
  });

  it('D5: failure taxonomy setup/calculation/observation/cleanup aşamalarını ayırır', () => {
    for (const stage of ['SETUP', 'CALCULATION', 'OBSERVATION', 'CLEANUP'] as const) {
      const failure = new ScenarioDiagnosticFailure(stage, new Error('diagnostic-test'));
      expect(failure).toMatchObject({
        code: 'W03_DIAGNOSTIC_FAILURE',
        stage,
      });
    }
  });
});
