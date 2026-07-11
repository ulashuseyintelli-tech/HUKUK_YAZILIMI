/** ADR-014 W0.2 materializer validation on a disposable database (PAYMENT + Conditional Option B REVERSAL). */
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import {
  cleanupMaterializedScenario,
  materializeScenario,
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
import { toCaseBalanceDisplay } from '../orchestration/case-balance-display';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('W0.2 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const AS_OF = '2026-07-01';
const CLAIM_START = '2026-06-01';
const PAY_DATE = '2026-06-20';
const ANNUAL_RATE = 0.24;

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

interface ScopedState {
  tenant: number;
  client: number;
  debtor: number;
  caseRow: number;
  caseDebtor: number;
  claimItem: number;
  collection: number;
  ledgerEntry: number;
  ledgerAllocation: number;
}

const EMPTY_STATE: ScopedState = {
  tenant: 0,
  client: 0,
  debtor: 0,
  caseRow: 0,
  caseDebtor: 0,
  claimItem: 0,
  collection: 0,
  ledgerEntry: 0,
  ledgerAllocation: 0,
};

describeWithDisposableDb('W0.2 PAYMENT-only materializer - disposable DB', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient;
  let caseBalance: CaseBalanceService;
  const refsToClean: MaterializedScenarioRefs[] = [];
  const sentinelTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    caseBalance = new CaseBalanceService(
      prisma as never,
      new RateProviderService(prisma as never),
      buildEngine(),
    );
  });

  afterAll(async () => {
    for (const refs of refsToClean.reverse()) {
      await cleanupMaterializedScenario(prisma, refs);
    }
    if (sentinelTenantIds.size > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: [...sentinelTenantIds] } } });
    }
    await prisma.$disconnect();
  });

  function expectedTenantId(scenarioId: string): string {
    return `w02-${scenarioId}-tenant`;
  }

  function simpleScenario(id: string, paymentId = `${id}-pay-1`) {
    return defineScenario({
      id,
      title: 'W0.2 simple TRY principal and payment',
      domainInput: {
        claimBuckets: [
          scenarioClaimBucket({
            id: `${id}-claim-1`,
            amount: 10_000,
            currency: 'TRY',
            startDate: CLAIM_START,
            interestType: 'LEGAL_3095' as never,
          }),
        ],
        payments: [
          scenarioPayment({ id: paymentId, date: PAY_DATE, amount: 2_000, currency: 'TRY' }),
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

  async function scopedState(tenantId: string): Promise<ScopedState> {
    const [tenant, client, debtor, caseRow, caseDebtor, claimItem, collection, ledgerEntry, ledgerAllocation] =
      await Promise.all([
        prisma.tenant.count({ where: { id: tenantId } }),
        prisma.client.count({ where: { tenantId } }),
        prisma.debtor.count({ where: { tenantId } }),
        prisma.case.count({ where: { tenantId } }),
        prisma.caseDebtor.count({ where: { case: { tenantId } } }),
        prisma.claimItem.count({ where: { tenantId } }),
        prisma.collection.count({ where: { tenantId } }),
        prisma.ledgerEntry.count({ where: { tenantId } }),
        prisma.ledgerAllocation.count({ where: { ledgerEntry: { tenantId } } }),
      ]);
    return { tenant, client, debtor, caseRow, caseDebtor, claimItem, collection, ledgerEntry, ledgerAllocation };
  }

  async function seedRate(tenantId: string): Promise<void> {
    await prisma.office.create({ data: { id: tenantId, tenantId, name: `W0.2 Office (${tenantId})` } });
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

  function inMemoryResult(
    def: ReturnType<typeof simpleScenario>,
    payments = def.domainInput.payments,
  ) {
    return buildEngine().computeBalance(
      {
        caseId: def.id,
        claimBuckets: def.domainInput.claimBuckets,
        payments,
        asOfDate: def.domainInput.asOfDate,
        mode: 'PREVIEW',
        options: { dayCountBasis: 365 },
      } as never,
      [RATE as never],
      `${AS_OF}T00:00:00.000Z`,
      DEFAULT_INTERPRETATION_PROFILE_ID,
    );
  }

  async function forbiddenWriteCounts(refs: MaterializedScenarioRefs) {
    const [nonPaymentLedger, allocations, timeline, outbox, journal, audit] = await Promise.all([
      prisma.ledgerEntry.count({ where: { tenantId: refs.tenantId, entryType: { not: 'PAYMENT' } } }),
      prisma.ledgerAllocation.count({ where: { ledgerEntry: { tenantId: refs.tenantId } } }),
      (prisma as never as { icrabotTimelineEntry: { count(a: object): Promise<number> } })
        .icrabotTimelineEntry.count({ where: { caseId: refs.caseId } }),
      (prisma as never as { icrabotOutboxAction: { count(a: object): Promise<number> } })
        .icrabotOutboxAction.count({ where: { tenantId: refs.tenantId } }),
      (prisma as never as { accountingJournalEntry: { count(a: object): Promise<number> } })
        .accountingJournalEntry.count({ where: { tenantId: refs.tenantId } }),
      (prisma as never as { auditLog: { count(a: object): Promise<number> } })
        .auditLog.count({ where: { tenantId: refs.tenantId } }),
    ]);
    return { nonPaymentLedger, allocations, timeline, outbox, journal, audit };
  }

  it('commits exact tenant-scoped PAYMENT state and preserves an unrelated tenant', async () => {
    const def = simpleScenario('w02-success');
    const tenantId = expectedTenantId(def.id);
    const sentinelId = 'w02-unrelated-success';
    sentinelTenantIds.add(sentinelId);
    await prisma.tenant.create({ data: { id: sentinelId, slug: sentinelId, name: 'Unrelated tenant' } });

    const before = await scopedState(tenantId);
    const unrelatedBefore = await scopedState(sentinelId);
    expect(before).toEqual(EMPTY_STATE);

    const refs = await materializeScenario(prisma, def);
    refsToClean.push(refs);

    expect(await scopedState(tenantId)).toEqual({
      tenant: 1,
      client: 1,
      debtor: 1,
      caseRow: 1,
      caseDebtor: 1,
      claimItem: 1,
      collection: 1,
      ledgerEntry: 1,
      ledgerAllocation: 0,
    });
    expect(await scopedState(sentinelId)).toEqual(unrelatedBefore);

    const collection = await prisma.collection.findUniqueOrThrow({ where: { id: refs.collectionIds[0] } });
    const ledger = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: refs.paymentLedgerEntryIds[0] } });
    expect({
      collectionTenant: collection.tenantId,
      collectionCase: collection.caseId,
      collectionAmount: Number(collection.amount),
      collectionCurrency: collection.currency,
      collectionDate: collection.date.toISOString().slice(0, 10),
      ledgerTenant: ledger.tenantId,
      ledgerCase: ledger.caseId,
      ledgerCollection: ledger.collectionId,
      ledgerAmount: Number(ledger.amount),
      ledgerCurrency: ledger.currency,
      ledgerDate: ledger.entryDate.toISOString().slice(0, 10),
    }).toEqual({
      collectionTenant: refs.tenantId,
      collectionCase: refs.caseId,
      collectionAmount: 2_000,
      collectionCurrency: 'TRY',
      collectionDate: PAY_DATE,
      ledgerTenant: refs.tenantId,
      ledgerCase: refs.caseId,
      ledgerCollection: refs.collectionIds[0],
      ledgerAmount: 2_000,
      ledgerCurrency: 'TRY',
      ledgerDate: PAY_DATE,
    });
    expect(await forbiddenWriteCounts(refs)).toEqual({
      nonPaymentLedger: 0,
      allocations: 0,
      timeline: 0,
      outbox: 0,
      journal: 0,
      audit: 0,
    });

    await seedRate(refs.tenantId);
    const dbResult = await caseBalance.computeCaseBalance(refs.tenantId, refs.caseId, AS_OF);
    const memoryResult = inMemoryResult(def);
    const dbTry = dbResult.currencyResults.find((currency) => currency.currency === 'TRY');
    expect(dbTry?.result).not.toBeNull();
    expect(dbTry!.result!.totalInterest).toBeCloseTo(memoryResult.totalInterest, 2);
    expect(dbTry!.result!.totalDue).toBeCloseTo(memoryResult.totalDue, 2);
  });

  it('fails closed when a materialized payment has no calculable claim bucket', async () => {
    const def = simpleScenario('pr2-no-buckets');
    def.domainInput.claimBuckets = [];
    def.expected = {
      perCurrencyStatus: { TRY: 'SKIPPED' },
      blockerCodes: ['NO_BUCKETS'],
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
    };
    const refs = await materializeScenario(prisma, def);
    refsToClean.push(refs);

    expect(await scopedState(refs.tenantId)).toEqual({
      tenant: 1,
      client: 1,
      debtor: 1,
      caseRow: 1,
      caseDebtor: 1,
      claimItem: 0,
      collection: 1,
      ledgerEntry: 1,
      ledgerAllocation: 0,
    });

    const result = await caseBalance.computeCaseBalance(refs.tenantId, refs.caseId, AS_OF);
    const display = toCaseBalanceDisplay({
      tenantId: refs.tenantId,
      caseId: refs.caseId,
      balance: result,
      generatedAt: `${AS_OF}T00:00:00.000Z`,
    });

    expect(result.source).toBe('LEDGER');
    expect(result.currencyResults).toEqual([
      { currency: 'TRY', result: null, skippedReason: 'NO_BUCKETS', grossPrincipal: 0 },
    ]);
    expect(result.diagnostics.fatal).toEqual([{ code: 'NO_BUCKETS', caseId: refs.caseId }]);
    expect(display).toMatchObject({
      status: 'UNAVAILABLE',
      authority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      unavailableReason: 'NO_BUCKETS',
    });
    expect(display.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'NO_BUCKETS',
        severity: 'BLOCKER',
        details: { currencies: ['TRY'] },
      }),
    ]));
    expect(display.trace).toMatchObject({
      authority: 'NONE',
      persisted: false,
      allocationSteps: [],
      blockerCodes: ['NO_BUCKETS', 'CURRENCY_INTEGRITY'],
    });
    expect(display.nonOfficialSnapshot).toMatchObject({
      official: false,
      persisted: false,
      authority: 'NONE',
      officialSnapshotAvailable: false,
      displayAuthority: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      blockerCodes: ['NO_BUCKETS', 'CURRENCY_INTEGRITY'],
      readiness: { status: 'BLOCKED', primaryDisplayEligible: false },
    });
  });

  it('rolls back every intermediate write when canonical input is unsupported', async () => {
    const def = simpleScenario('w02-rollback');
    def.domainInput.claimBuckets.push(
      scenarioClaimBucket({
        id: 'w02-rollback-unsupported',
        interestType: 'UNSUPPORTED_W02_INPUT' as never,
      }),
    );
    const tenantId = expectedTenantId(def.id);
    expect(await scopedState(tenantId)).toEqual(EMPTY_STATE);

    await expect(materializeScenario(prisma, def)).rejects.toThrow(
      "interestType 'UNSUPPORTED_W02_INPUT' icin Prisma ters-koprusu tanimli degil",
    );

    expect(await scopedState(tenantId)).toEqual(EMPTY_STATE);
  });

  it('fails repeated execution deterministically without adding partial rows', async () => {
    const def = simpleScenario('w02-duplicate');
    const refs = await materializeScenario(prisma, def);
    refsToClean.push(refs);
    const committed = await scopedState(refs.tenantId);

    let duplicateError: unknown;
    try {
      await materializeScenario(prisma, def);
    } catch (error) {
      duplicateError = error;
    }

    expect(duplicateError).toMatchObject({
      name: 'DuplicateScenarioMaterializationError',
      code: 'W02_DUPLICATE_MATERIALIZATION',
      cause: { code: 'P2002' },
    });
    expect(await scopedState(refs.tenantId)).toEqual(committed);
  });

  it('rejects cross-scenario identifier reuse and rolls back the second tenant', async () => {
    const sharedPaymentId = 'w02-cross-scenario-payment';
    const ownerDef = simpleScenario('w02-owner', sharedPaymentId);
    const conflictingDef = simpleScenario('w02-conflict', sharedPaymentId);
    const ownerRefs = await materializeScenario(prisma, ownerDef);
    refsToClean.push(ownerRefs);
    const ownerState = await scopedState(ownerRefs.tenantId);

    await expect(materializeScenario(prisma, conflictingDef)).rejects.toMatchObject({
      code: 'W02_DUPLICATE_MATERIALIZATION',
      cause: { code: 'P2002' },
    });

    expect(await scopedState(expectedTenantId(conflictingDef.id))).toEqual(EMPTY_STATE);
    expect(await scopedState(ownerRefs.tenantId)).toEqual(ownerState);
  });

  it('isolates both scenario tenants and cleanup leaves an unrelated tenant untouched', async () => {
    const def = defineScenario({
      ...simpleScenario('w02-isolation'),
      persistenceIntent: { tenantSetup: 'TWO_TENANT_ISOLATION', currency: 'TRY' },
    });
    const sentinelId = 'w02-unrelated-isolation';
    sentinelTenantIds.add(sentinelId);
    await prisma.tenant.create({ data: { id: sentinelId, slug: sentinelId, name: 'Cleanup sentinel' } });
    const refs = await materializeScenario(prisma, def);
    expect(refs.secondaryTenantId).toBeDefined();

    expect(await scopedState(refs.secondaryTenantId!)).toEqual({ ...EMPTY_STATE, tenant: 1 });
    const crossTenant = await caseBalance.computeCaseBalance(refs.secondaryTenantId!, refs.caseId, AS_OF);
    expect(crossTenant.currencyResults.some((currency) => currency.result !== null)).toBe(false);

    await cleanupMaterializedScenario(prisma, refs);
    expect(await scopedState(refs.tenantId)).toEqual(EMPTY_STATE);
    expect(await scopedState(refs.secondaryTenantId!)).toEqual(EMPTY_STATE);
    expect(await scopedState(sentinelId)).toEqual({ ...EMPTY_STATE, tenant: 1 });
  });

  it('commits an opt-in REVERSAL row in the same transaction with reversesLedgerEntryId set, and no timeline/outbox/journal/audit side-effects', async () => {
    const paymentId = 'w02-reversal-pay-1';
    const def = simpleScenario('w02-reversal', paymentId);
    const refs = await materializeScenario(prisma, def, {
      reversals: [{ ofPaymentId: paymentId }],
    });
    refsToClean.push(refs);

    expect(refs.reversalLedgerEntryIds).toHaveLength(1);
    expect(refs.writePathNote).toContain('WRITE_PATH_NOT_EXERCISED');

    const reversal = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: refs.reversalLedgerEntryIds[0] },
    });
    expect(reversal.entryType).toBe('REVERSAL');
    expect(reversal.reversesLedgerEntryId).toBe(refs.paymentLedgerEntryIds[0]);
    expect(Number(reversal.amount)).toBe(-2_000);
    expect(reversal.tenantId).toBe(refs.tenantId);
    expect(reversal.caseId).toBe(refs.caseId);

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
    expect({ timeline, outbox, journal, audit }).toEqual({ timeline: 0, outbox: 0, journal: 0, audit: 0 });

    // PR-1B: test-support materializer'ın açıkça bağlı PAYMENT + REVERSAL çifti
    // CaseBalance'da net-sıfırdır. Bu, gerçek CollectionService.cancel() write-path
    // fidelity kanıtı değildir; yalnız W0.2 materialized-state okuma kanıtıdır.
    await seedRate(refs.tenantId);
    const dbResult = await caseBalance.computeCaseBalance(refs.tenantId, refs.caseId, AS_OF);
    const prePaymentResult = inMemoryResult(def, []);
    const dbTry = dbResult.currencyResults.find((currency) => currency.currency === 'TRY');
    expect(dbResult.source).toBe('LEDGER');
    expect(dbResult.diagnostics.fatal).toEqual([]);
    expect(dbTry!.result!.totalDue).toBeCloseTo(prePaymentResult.totalDue, 2);
  });

  it('rejects a REVERSAL for an unknown ofPaymentId (G1) and rolls back the whole scenario', async () => {
    const def = simpleScenario('w02-reversal-missing');
    const tenantId = expectedTenantId(def.id);

    await expect(
      materializeScenario(prisma, def, { reversals: [{ ofPaymentId: 'no-such-payment' }] }),
    ).rejects.toThrow('REVERSAL icin orijinal PAYMENT bulunamadi');

    expect(await scopedState(tenantId)).toEqual(EMPTY_STATE);
  });
});
