import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';
import { AiService } from '../../ai/ai.service';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { CasePaymentPreviewService } from '../../case/case-payment-preview.service';
import { CaseService } from '../../case/case.service';
import { ClientSettlementReadService } from '../../client-settlement/client-settlement-read.service';
import { DistributionRecommendationService } from '../../client-settlement/distribution-recommendation.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { AllocationEngineService } from '../../interest-engine/allocation/allocation-engine.service';
import { ClaimPriorityService } from '../../interest-engine/allocation/claim-priority.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { InterestEngineService } from '../../interest-engine/interest-engine.service';
import { CaseBalanceService } from '../../interest-engine/orchestration/case-balance.service';
import { PolicyGateV2Service } from '../../interest-engine/policy-gate/policy-gate-v2.service';
import { RateProviderService } from '../../interest-engine/rates/rate-provider.service';
import { SegmentBuilderService } from '../../interest-engine/segments/segment-builder.service';
import { VersionPinningService } from '../../interest-engine/version/version-pinning.service';
import { ReportService } from '../../report/report.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { EXCLUDE_ALLOCATION_HELD_COLLECTIONS } from '../collection-allocation-hold';
import { createCollectionMutationTrace } from '../collection-audit';
import { executeCollectionCancelInTransaction } from '../collection-cancel-executor';
import { CollectionService } from '../collection.service';
import { CollectionType, type CreateCollectionDto } from '../dto/collection.dto';
import { ReceiptObjectScopeAuthorizationService } from '../receipt-object-scope-authorization.service';

/**
 * K3-L D1 / D2 (owner GO 2026-09-29 §6) — mahsubu BEKLETİLEN tahsilat:
 *  D1: hiçbir hesap yolunda kendiliğinden mahsup edilmez — borçtan düşülmez, "tahsil edilen" sayılmaz, fazla ödeme ya da
 *      müvekkile dağıtılabilir tutar gibi gösterilmez; ayrı "mahsubu bekleyen" olarak raporlanır.
 *  D2: mahsup tamamlanınca AYNI para iki kez düşülmez — her okuyucuda tam bir kez sayılır.
 * Gerçek servisler + disposable PostgreSQL. Sentetik veri; canlı veriyle ilgisi yoktur.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('K3-L held collection readers DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const AS_OF = '2026-09-30';

describeWithDisposableDb('K3-L bekletilen tahsilat okuyucuları — D1/D2 (disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient;
  let engine: SummaryEngineService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    engine = new SummaryEngineService(prisma as never, new TBK100AllocatorService());
    await engine.onModuleInit();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const domainEvents = new DomainEventIngestService();
  const journalWriter = () => new AccountingJournalWriterService(prisma as any);
  const collections = () =>
    new CollectionService(
      prisma as any,
      domainEvents,
      new CaseDebtorLifecycleGuardService(prisma as any),
      engine,
      journalWriter(),
      undefined,
      new AuditService(prisma as any),
      new ReceiptObjectScopeAuthorizationService(prisma as any, { isSecretConfigured: () => false } as any),
    );
  const caseService = () => Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
  const reports = () => new ReportService(prisma as any, collections(), {} as any);
  const clientCari = () => new ClientSettlementReadService(prisma as any);
  const recommendations = () =>
    new DistributionRecommendationService(
      prisma as any,
      { getEligibility: async () => ({ eligibleExpenseRequests: [] }) } as any,
      { getActiveForCaseClient: async () => null } as any,
    );
  const ai = () => new AiService(prisma as any, { get: () => undefined } as any);
  const canonicalBalance = () =>
    new CaseBalanceService(
      prisma as never,
      new RateProviderService(prisma as never),
      new InterestEngineService(
        new PolicyGateV2Service(),
        new SegmentBuilderService(),
        new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
        {} as never,
        {} as never,
        new VersionPinningService(),
        undefined,
      ),
    );

  async function fixture(label: string, options: { accruingPrincipal?: boolean } = {}) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-k3l-d1-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `K3L D1 ${label}`, slug: tenantId } });
    if (options.accruingPrincipal) {
      // K3-L TK-2: faiz işleyen YASAL (LEGAL_3095) kalem oran verisi olmadan artık "faiz bilinmiyor" (INTEREST_UNRESOLVED)
      // sayılır — önceden oran yokken faiz sessizce 0'dı. Bu test bekletme davranışını sınar; oran açıkça tohumlanır.
      await prisma.office.create({ data: { id: tenantId, tenantId, name: `K3L D1 ${label}` } as never });
      await prisma.rateSchedule.create({
        data: {
          tenantId,
          interestType: 'LEGAL_3095',
          validFrom: new Date('2020-01-01'),
          validTo: null,
          annualRate: 0.24,
          source: 'MANUAL',
          versionHash: `k3l-d1-${suffix}`,
        },
      });
    }
    const client = await prisma.client.create({ data: { tenantId, displayName: 'Alacaklı', type: 'COMPANY' } as never });
    const legalCase = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `K3L-D1-${suffix}`,
        type: 'CHECK',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        currency: 'TRY',
        principalAmount: 10000,
      } as never,
    });
    const caseClient = await prisma.caseClient.create({ data: { caseId: legalCase.id, clientId: client.id, role: 'ALACAKLI' } });
    const kesideci = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: 'Keşideci Ali' } as never });
    const ciranta = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: 'Ciranta Ayşe' } as never });
    const kesideciCd = await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: kesideci.id, role: 'KESIDECI' } });
    const cirantaCd = await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: ciranta.id, role: 'CIRANTA' } });
    const item = (itemType: 'PRINCIPAL' | 'CHECK_PENALTY', amount: number, sortOrder: number, restrictedTo: string[] | null) =>
      prisma.claimItem.create({
        data: {
          tenantId,
          caseId: legalCase.id,
          itemType,
          originalAmount: amount,
          demandedAmount: amount,
          amount,
          currency: 'TRY',
          // Kanonik bakiye motoru yalnız faiz işleyen kalem için sonuç üretir (faizsiz dosya: ayrı bulgu, bu PR dışı)
          ...(options.accruingPrincipal && itemType === 'PRINCIPAL'
            ? {
                interestAccrualStatus: 'ACCRUES' as const,
                interestType: 'YASAL' as const,
                interestRate: 24,
                interestStartDate: new Date('2026-01-01T00:00:00.000Z'),
                interestStartDateProvenance: 'DOCUMENT_DUE_DATE' as const,
              }
            : { interestAccrualStatus: 'NO_INTEREST' as const }),
          isAllDebtorsLiable: restrictedTo === null,
          liableDebtorIds: restrictedTo ?? [],
          sortOrder,
        },
      });
    await item('PRINCIPAL', 10000, 1, null);
    await item('CHECK_PENALTY', 1000, 2, [kesideci.id]);

    const user = await prisma.user.create({
      data: { tenantId, email: `k3l-d1-${suffix}@example.test`, name: 'Mahsup', surname: 'Aktörü' },
    });
    const lawyer = await prisma.lawyer.create({ data: { tenantId, userId: user.id, name: 'Mahsup', surname: 'Aktörü' } });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: lawyer.id } });

    return { tenantId, caseId: legalCase.id, clientId: client.id, caseClientId: caseClient.id, kesideciCd, cirantaCd, userId: user.id };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  const pay = async (f: Fixture, amount: number, caseDebtorId?: string) => {
    const created = await collections().create(
      f.tenantId,
      {
        caseId: f.caseId,
        idempotencyKey: `k3l-d1-${randomUUID()}`,
        amount,
        currency: 'TRY',
        type: CollectionType.BANK_TRANSFER,
        date: '2026-09-20T09:00:00.000Z',
        ...(caseDebtorId ? { caseDebtorId } : {}),
      } as CreateCollectionDto,
      f.userId,
    );
    return (created as any).id as string;
  };

  const complete = (f: Fixture, collectionId: string, caseDebtorId: string) =>
    collections().completeHeldAllocation(
      f.tenantId,
      { caseId: f.caseId, collectionId, caseDebtorId, authorizationBasis: 'MEMBERSHIP' },
      f.userId,
    );

  const cancel = (f: Fixture, collectionId: string) =>
    prisma.$transaction((tx) =>
      executeCollectionCancelInTransaction(
        tx,
        { domainEventIngestService: domainEvents, journalWriter: journalWriter(), auditService: new AuditService(prisma as any) },
        {
          tenantId: f.tenantId,
          id: collectionId,
          dto: { cancelReason: 'k3l d1 iptal' },
          actorUserId: f.userId,
          expectedCaseId: f.caseId,
          approvalRequestId: `approval-${randomUUID()}`,
          trace: createCollectionMutationTrace(`corr-${randomUUID()}`, 'approval-k3l-d1'),
        },
      ),
    );

  /** Dağıtım kaydı (taslak) — üretim akışında tahsilat olayıyla oluşur; burada yoksa aynı biçimde kurulur. */
  const ensureDisposition = async (f: Fixture, collectionId: string, amount: number) => {
    const existing = await prisma.collectionDisposition.findUnique({ where: { collectionId } });
    if (existing) return existing;
    return prisma.collectionDisposition.create({
      data: {
        tenantId: f.tenantId,
        caseId: f.caseId,
        collectionId,
        beneficiaryScope: 'SINGLE_CASE_CLIENT',
        caseClientId: f.caseClientId,
        totalAmount: amount,
        currency: 'TRY',
      },
    });
  };

  /** Tüm okuyucuların tek seferde ölçümü. */
  async function readAll(f: Fixture) {
    const report = await reports().getCaseDebtReport(f.tenantId, f.caseId, `${AS_OF}T00:00:00.000Z`);
    const cover = await collections().calculateCover(f.tenantId, f.caseId);
    const completion = await collections().checkCaseCompletion(f.tenantId, f.caseId);
    const finance = await caseService().getCaseFinanceSummary(f.tenantId, f.caseId);
    const list = await caseService().findAll(f.tenantId);
    const listed = (await caseService().getCaseCollections(f.tenantId, f.caseId)) as any[];
    const debtorBalances = await caseService().getDebtorLedgerBalances(f.tenantId, f.caseId);
    const cari = await clientCari().getClientAccountingSummary(f.tenantId, f.clientId, 'TRY');
    const aiCase = await (ai() as any).getCaseWithDetails(f.tenantId, f.caseId);
    const prompt = (ai() as any).buildSuggestionPrompt(aiCase) as string;
    const fragmentAgg = await prisma.collection.aggregate({
      where: { caseId: f.caseId, status: 'CONFIRMED', ...EXCLUDE_ALLOCATION_HELD_COLLECTIONS },
      _sum: { amount: true },
    });
    const canonical = await canonicalBalance().computeCaseBalance(f.tenantId, f.caseId, AS_OF);
    const claimItems = await prisma.claimItem.findMany({ where: { caseId: f.caseId } });
    const ledgerPayments = await prisma.ledgerEntry.findMany({
      where: { tenantId: f.tenantId, caseId: f.caseId, entryType: 'PAYMENT', status: 'CONFIRMED' },
      select: { id: true, amount: true, collectionId: true },
    });
    const ledgerAllocations = await prisma.ledgerAllocation.findMany({
      where: { ledgerEntryId: { in: ledgerPayments.map((row) => row.id) } },
      select: { amount: true },
    });
    const overpayments = await prisma.collectionOverpayment.count({ where: { tenantId: f.tenantId, caseId: f.caseId } });
    return {
      report: {
        totalCollected: report.collectionDetails.totalCollected,
        collectionCount: report.collectionDetails.collectionCount,
        allocationHeldAmount: report.collectionDetails.allocationHeldAmount,
        allocationHeldCount: report.collectionDetails.allocationHeldCount,
        remainingDebt: report.balance.remainingDebt,
      },
      cover: {
        totalCollected: cover.totalCollected,
        allocationHeldAmount: cover.allocationHeldAmount,
        remainingDebt: cover.remainingDebt,
      },
      completion: { canClose: completion.canClose, allocationHeldAmount: completion.allocationHeldAmount ?? 0 },
      finance: {
        totalCollections: finance.totalCollections,
        mahsubuBekleyenTahsilat: finance.mahsubuBekleyenTahsilat,
        channelTotal: finance.collectionsByChannel.reduce((sum, row) => sum + row.amount, 0),
      },
      listTotalCollected: (list.data.find((row: any) => row.id === f.caseId) as any)?.totalCollected,
      fragmentTotal: Number(fragmentAgg._sum.amount ?? 0),
      listedHeldIds: listed.filter((row) => row.allocationHold?.status === 'HELD').map((row) => row.id),
      debtorLedgerHeld: debtorBalances.mahsubuBekleyenTahsilatlar.length,
      cari: {
        debtorCollection: Number(cari.caseScopedContext.debtorCollection),
        pendingDistribution: Number(cari.caseScopedContext.pendingDistribution),
        allocationHeld: Number(cari.caseScopedContext.allocationHeld),
        pendingDistributionExcludingHeld: Number(cari.caseScopedContext.pendingDistributionExcludingHeld),
        breakdownHeld: Number(cari.caseBreakdown[0].allocationHeld),
        breakdownExcludingHeld: Number(cari.caseBreakdown[0].pendingDistributionExcludingHeld),
        needsReview: cari.needsReview,
      },
      prompt,
      canonical: {
        holds: (canonical.allocationHolds ?? []).map((hold) => ({ collectionId: hold.collectionId, amount: hold.amount })),
      },
      books: {
        claimCollected: claimItems.reduce((sum, row) => sum + Number(row.collectedAmount), 0),
        ledgerPaymentCount: ledgerPayments.length,
        ledgerPaymentTotal: ledgerPayments.reduce((sum, row) => sum + Number(row.amount), 0),
        ledgerAllocationTotal: ledgerAllocations.reduce((sum, row) => sum + Number(row.amount), 0),
        ledgerCollectionIds: ledgerPayments.map((row) => row.collectionId).sort(),
        overpayments,
      },
    };
  }

  it('D1: bekletilen tahsilat hiçbir okuyucuda borçtan düşmez / tahsil edilen sayılmaz; ayrı gösterilir', async () => {
    const f = await fixture('held');
    const allocatedId = await pay(f, 500, f.cirantaCd.id);
    const before = await readAll(f);
    expect(before.report).toEqual({ totalCollected: 500, collectionCount: 1, allocationHeldAmount: 0, allocationHeldCount: 0, remainingDebt: 9500 });

    const heldId = await pay(f, 1500); // hesabına ödeme yapılan borçlu belirsiz → mahsup bekletilir
    expect((await prisma.collection.findUniqueOrThrow({ where: { id: heldId } })).status).toBe('CONFIRMED');
    const held = await readAll(f);

    // Rapor / kapak hesabı / kapanış / finans özeti / dosya listesi: bekletilen 1.500 borçtan DÜŞMEDİ
    expect(held.report).toEqual({ totalCollected: 500, collectionCount: 1, allocationHeldAmount: 1500, allocationHeldCount: 1, remainingDebt: 9500 });
    expect(held.cover).toEqual({ totalCollected: 500, allocationHeldAmount: 1500, remainingDebt: 9500 });
    expect(held.completion).toEqual({ canClose: false, allocationHeldAmount: 1500 });
    expect(held.finance).toEqual({ totalCollections: 500, mahsubuBekleyenTahsilat: 1500, channelTotal: 500 });
    expect(held.listTotalCollected).toBe(500);
    expect(held.fragmentTotal).toBe(500);
    // Liste: tahsilat görünür ve "mahsubu bekliyor" olarak işaretlenir (gizlenmez)
    expect(held.listedHeldIds).toEqual([heldId]);
    expect(held.debtorLedgerHeld).toBe(1);
    // Müvekkil cari: alınan para 2.000; bekletilen 1.500 dağıtılabilir bekleyen tutara GİRMEZ
    expect(held.cari).toEqual({
      debtorCollection: 2000,
      pendingDistribution: 2000,
      allocationHeld: 1500,
      pendingDistributionExcludingHeld: 500,
      breakdownHeld: 1500,
      breakdownExcludingHeld: 500,
      needsReview: false,
    });
    // Yapay zekâ istemi
    expect(held.prompt).toContain('- Tahsil Edilen: 500 TL');
    expect(held.prompt).toContain('- Mahsubu Bekleyen Tahsilat (borçtan düşülmedi): 1500 TL');
    expect(held.prompt).toContain('- Kalan Borç: 9500 TL');
    // Kanonik bakiye: bekletme ayrı raporlanır (borç tutarı etkisi ayrı testte, faiz işleyen fikstürle)
    expect(held.canonical.holds).toEqual([{ collectionId: heldId, amount: 1500 }]);
    // Defterler: bekletilen tahsilat için defter kaydı / mahsup / fazla ödeme YOK
    expect(held.books).toEqual({
      claimCollected: 500,
      ledgerPaymentCount: 1,
      ledgerPaymentTotal: 500,
      ledgerAllocationTotal: 500,
      ledgerCollectionIds: [allocatedId],
      overpayments: 0,
    });

    // Dağıtım önerisi ve ödeme önizlemesi: bekletme varken dağıtım ÜRETİLMEZ
    const disposition = await ensureDisposition(f, heldId, 1500);
    await expect(recommendations().generate(f.tenantId, disposition.id, {}, { userId: f.userId })).rejects.toMatchObject({
      response: { code: 'COLLECTION_ALLOCATION_HELD' },
    });
    const preview = await new CasePaymentPreviewService(prisma as any).preview({
      tenantId: f.tenantId,
      caseId: f.caseId,
      input: { amount: 300, currency: 'TRY' } as any,
    });
    expect(preview.distributionPreview).toMatchObject({ status: 'BLOCKED', lines: [], requiresClientSelection: false });
    expect(preview.balanceImpact).toMatchObject({ appliedAmount: 0, overpaymentAmount: 0 });
    expect(preview.acceptance.warnings).toContain('DISTRIBUTION_DEFERRED_UNTIL_ALLOCATION_COMPLETED');
  });

  it('D2: mahsup tamamlanınca aynı para her okuyucuda TAM BİR KEZ sayılır; tekrar istek ikinci kez düşmez', async () => {
    const f = await fixture('complete');
    const allocatedId = await pay(f, 500, f.cirantaCd.id);
    const baseline = await readAll(f);
    const heldId = await pay(f, 1500);
    const held = await readAll(f);

    const result = await complete(f, heldId, f.kesideciCd.id);
    expect(result).toMatchObject({ status: 'RELEASED', replayed: false, allocatedAmount: 1500, heldOverpaymentAmount: 0 });
    const done = await readAll(f);

    expect(done.report).toEqual({ totalCollected: 2000, collectionCount: 2, allocationHeldAmount: 0, allocationHeldCount: 0, remainingDebt: 8000 });
    expect(done.cover).toEqual({ totalCollected: 2000, allocationHeldAmount: 0, remainingDebt: 8000 });
    expect(done.completion).toEqual({ canClose: false, allocationHeldAmount: 0 });
    expect(done.finance).toEqual({ totalCollections: 2000, mahsubuBekleyenTahsilat: 0, channelTotal: 2000 });
    expect(done.listTotalCollected).toBe(2000);
    expect(done.fragmentTotal).toBe(2000);
    expect(done.listedHeldIds).toEqual([]);
    expect(done.debtorLedgerHeld).toBe(0);
    // Alınan para DEĞİŞMEDİ (2.000); bekletme kalktı → tamamı dağıtılabilir bekleyen
    expect(done.cari).toEqual({
      debtorCollection: 2000,
      pendingDistribution: 2000,
      allocationHeld: 0,
      pendingDistributionExcludingHeld: 2000,
      breakdownHeld: 0,
      breakdownExcludingHeld: 2000,
      needsReview: false,
    });
    expect(done.prompt).toContain('- Tahsil Edilen: 2000 TL');
    expect(done.prompt).toContain('- Mahsubu Bekleyen Tahsilat (borçtan düşülmedi): 0 TL');
    expect(done.prompt).toContain('- Kalan Borç: 8000 TL');
    // Defterler: tahsilat başına TEK defter ödemesi; mahsup toplamı = tahsilat toplamı
    expect(done.books).toEqual({
      claimCollected: 2000,
      ledgerPaymentCount: 2,
      ledgerPaymentTotal: 2000,
      ledgerAllocationTotal: 2000,
      ledgerCollectionIds: [allocatedId, heldId].sort(),
      overpayments: 0,
    });
    // Kanonik bakiye: bekletme listesi boş (borç tutarı etkisi ayrı testte)
    expect(done.canonical.holds).toEqual([]);
    expect(held.books).toEqual(baseline.books);

    // Tekrar istek: ikinci defter kaydı / ikinci düşüm YOK
    const again = await complete(f, heldId, f.kesideciCd.id);
    expect(again).toMatchObject({ replayed: true, status: 'RELEASED' });
    const replayed = await readAll(f);
    expect(replayed.report).toEqual(done.report);
    expect(replayed.cover).toEqual(done.cover);
    expect(replayed.finance).toEqual(done.finance);
    expect(replayed.cari).toEqual(done.cari);
    expect(replayed.books).toEqual(done.books);
    expect(replayed.canonical).toEqual(done.canonical);

    // Bekletme kalkınca dağıtım önerisi üretilebilir (kapı yalnız HELD iken kapalı)
    const disposition = await ensureDisposition(f, heldId, 1500);
    const recommendation = await recommendations().generate(f.tenantId, disposition.id, {}, { userId: f.userId });
    expect(recommendation.suggestedLines.map((line) => [line.type, line.amount])).toEqual([['CLIENT_PAYABLE', '1500']]);
  });

  it('kanonik bakiye (computeCaseBalance): bekletilen tahsilat borcu DEĞİŞTİRMEZ; tamamlanınca düşüş tam bekletilen tutar kadardır', async () => {
    const f = await fixture('canonical', { accruingPrincipal: true });
    const totalDue = async () => {
      const result = await canonicalBalance().computeCaseBalance(f.tenantId, f.caseId, AS_OF);
      const row = result.currencyResults.find((entry: any) => entry.currency === 'TRY') as any;
      // Sonuç üretilmiyorsa karşılaştırma anlamsızdır → test açıkça kırılır (sessiz geçiş yok)
      expect(typeof row?.result?.totalDue).toBe('number');
      return { totalDue: Math.round(Number(row.result.totalDue) * 100), source: result.source, holds: result.allocationHolds ?? [] };
    };

    await pay(f, 500, f.cirantaCd.id);
    const baseline = await totalDue();
    expect(baseline.holds).toEqual([]);

    const heldId = await pay(f, 1500);
    const held = await totalDue();
    expect(held.totalDue).toBe(baseline.totalDue);
    expect(held.holds.map((hold) => hold.collectionId)).toEqual([heldId]);

    await complete(f, heldId, f.kesideciCd.id);
    const done = await totalDue();
    expect(done.holds).toEqual([]);
    // Düşüş = bekletilen 1.500,00 (bir kez) + ödeme tarihinden hesap tarihine kadar işlemeyen faiz farkı
    // (tohumlanan %24 oranla ~9,86); iki kat düşüm (3.000,00) ASLA olamaz.
    const reductionMinor = baseline.totalDue - done.totalDue;
    expect(reductionMinor).toBeGreaterThanOrEqual(150000);
    expect(reductionMinor).toBeLessThan(155000);
    expect(done.source).toBe('LEDGER');

    await complete(f, heldId, f.kesideciCd.id); // tekrar istek
    expect((await totalDue()).totalDue).toBe(done.totalDue);
  });

  it('iptal: bekletilen tahsilat iptal edilince "mahsubu bekleyen" de kalkar; tamamlanmış tahsilat iptalinde tutar bir kez geri alınır', async () => {
    const f = await fixture('cancel');
    await pay(f, 500, f.cirantaCd.id);
    const heldId = await pay(f, 1500);
    await cancel(f, heldId);
    const heldCancelled = await readAll(f);
    expect(heldCancelled.report).toEqual({ totalCollected: 500, collectionCount: 1, allocationHeldAmount: 0, allocationHeldCount: 0, remainingDebt: 9500 });
    expect(heldCancelled.cover).toEqual({ totalCollected: 500, allocationHeldAmount: 0, remainingDebt: 9500 });
    expect(heldCancelled.finance).toEqual({ totalCollections: 500, mahsubuBekleyenTahsilat: 0, channelTotal: 500 });
    expect(heldCancelled.listTotalCollected).toBe(500);
    expect(heldCancelled.cari).toMatchObject({ debtorCollection: 500, allocationHeld: 0, pendingDistributionExcludingHeld: 500 });
    expect(heldCancelled.canonical.holds).toEqual([]);
    expect(heldCancelled.books).toMatchObject({ claimCollected: 500, overpayments: 0 });

    const secondId = await pay(f, 700);
    await complete(f, secondId, f.kesideciCd.id);
    expect((await readAll(f)).report).toMatchObject({ totalCollected: 1200, allocationHeldAmount: 0, remainingDebt: 8800 });
    await cancel(f, secondId);
    const completedCancelled = await readAll(f);
    expect(completedCancelled.report).toEqual({ totalCollected: 500, collectionCount: 1, allocationHeldAmount: 0, allocationHeldCount: 0, remainingDebt: 9500 });
    expect(completedCancelled.finance).toEqual({ totalCollections: 500, mahsubuBekleyenTahsilat: 0, channelTotal: 500 });
    expect(completedCancelled.listTotalCollected).toBe(500);
    expect(completedCancelled.books.claimCollected).toBe(500);
    expect(completedCancelled.canonical.holds).toEqual([]);
  });
});
