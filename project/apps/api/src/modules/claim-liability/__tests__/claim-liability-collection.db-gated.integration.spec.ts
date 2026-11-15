import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { CasePaymentPreviewService } from '../../case/case-payment-preview.service';
import { CaseService } from '../../case/case.service';
import { createCollectionMutationTrace } from '../../collection/collection-audit';
import { executeCollectionCancelInTransaction } from '../../collection/collection-cancel-executor';
import { CollectionService } from '../../collection/collection.service';
import { CollectionType, type CreateCollectionDto } from '../../collection/dto/collection.dto';
import { ReceiptObjectScopeAuthorizationService } from '../../collection/receipt-object-scope-authorization.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { fromKurus, legacyProjection, toKurus, type ClaimLiabilityModeValue } from '../claim-liability.domain';
import { loadCaseLiabilityContext } from '../claim-liability.reader';

/**
 * SEÇİMLİK KALEM BAZLI BORÇLU SORUMLULUĞU — tahsilat bağlantısı (karar günlüğü 2026-11-15).
 * Gerçek CollectionService + SummaryEngine (TBK100) + iptal yürütücüsü + disposable PostgreSQL.
 *
 * Seçim kayıtları burada test verisi olarak DOĞRUDAN kurulur (seçim komutları ayrı testte). Tutarlar SENTETİKTİR.
 *
 * Kanıtlananlar: uzlaştırma eşitliği (AT-3), müteselsil (AT-8), paylı Örnek 1 (AT-9), tutarla sınırlı Örnek 3 (AT-10),
 * farklı sorumluluklu kalemler + değişmeyen mahsup sırası (AT-11), eşzamanlı tahsilat ve tekrar istek (AT-12),
 * borçlusuz ödeme → bekletme → tamamlama (AT-13), belirlenmedi (AT-14), uzlaşmayan kalem (AT-15), aşan ödeme (AT-16),
 * tahsilat = mahsup + fazla ödeme + bekletilen ve bozulunca geri alma (AT-16b), haciz kaynağı (AT-16c),
 * kiracı yalıtımı (AT-16d).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('Claim liability collection DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('Seçimlik borçlu sorumluluğu — tahsilat ve mahsup (disposable PostgreSQL)', () => {
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
  const receiptAuthorization = () =>
    new ReceiptObjectScopeAuthorizationService(prisma as any, { isSecretConfigured: () => false } as any);
  const collections = (summaryEngine: SummaryEngineService = engine) =>
    new CollectionService(
      prisma as any,
      domainEvents,
      new CaseDebtorLifecycleGuardService(prisma as any),
      summaryEngine,
      journalWriter(),
      undefined,
      new AuditService(prisma as any),
      receiptAuthorization(),
    );

  type ItemSeed = { key: string; itemType: string; amount: number; sortOrder: number };

  async function fixture(label: string, items: ItemSeed[], debtorCount = 2) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-liab-col-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `LIAB ${label}`, slug: tenantId } });
    const client = await prisma.client.create({ data: { tenantId, displayName: 'Alacaklı', type: 'COMPANY' } as never });
    const legalCase = await prisma.case.create({
      data: { tenantId, clientId: client.id, fileNumber: `LIAB-${suffix}`, type: 'GENERAL_EXECUTION', caseStatus: 'DERDEST', status: 'ACTIVE', currency: 'TRY' } as never,
    });
    const debtors: Array<{ caseDebtorId: string; debtorId: string }> = [];
    for (let index = 1; index <= debtorCount; index += 1) {
      const debtor = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: `Sentetik Borçlu ${index}` } as never });
      const caseDebtor = await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: debtor.id, role: 'ASIL_BORCLU' } });
      debtors.push({ caseDebtorId: caseDebtor.id, debtorId: debtor.id });
    }
    const itemIds: Record<string, string> = {};
    for (const seed of items) {
      const created = await prisma.claimItem.create({
        data: {
          tenantId,
          caseId: legalCase.id,
          itemType: seed.itemType as never,
          originalAmount: seed.amount,
          demandedAmount: seed.amount,
          amount: seed.amount,
          currency: 'TRY',
          interestAccrualStatus: 'NO_INTEREST',
          liableDebtorIds: [],
          sortOrder: seed.sortOrder,
        },
      });
      itemIds[seed.key] = created.id;
    }
    return { tenantId, caseId: legalCase.id, debtors, itemIds, b1: debtors[0], b2: debtors[1] };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  /** Onaylanmış bir seçimin bıraktığı kayıtlar: etkin seçim sürümü + kalemdeki izdüşüm. */
  async function select(
    f: Fixture,
    itemKey: string,
    mode: ClaimLiabilityModeValue,
    parties: Array<{ caseDebtorId: string; debtorId: string; shareWeight?: number; limitAmount?: number; unlimited?: boolean }>,
  ) {
    const claimItemId = f.itemIds[itemKey];
    const previous = await prisma.claimItemLiabilitySet.findFirst({ where: { claimItemId, status: 'ACTIVE' } });
    const latest = await prisma.claimItemLiabilitySet.aggregate({ where: { claimItemId }, _max: { version: true } });
    const newId = randomUUID();
    if (previous) {
      await prisma.claimItemLiabilitySet.update({
        where: { id: previous.id },
        data: { status: 'SUPERSEDED', supersededAt: new Date(), supersededBySetId: newId },
      });
    }
    await prisma.claimItemLiabilitySet.create({
      data: {
        id: newId,
        tenantId: f.tenantId,
        caseId: f.caseId,
        claimItemId,
        version: (latest._max.version ?? 0) + 1,
        mode,
        limitScope: mode === 'CAPPED' ? 'ITEM_AMOUNT' : null,
        basis: mode === 'UNDETERMINED' ? null : 'COURT_JUDGMENT',
        decidedByUserId: `actor-${f.tenantId}`,
        decidedAt: new Date(),
        appliedVia: 'SINGLE',
        parties: {
          create: parties.map((party, sortOrder) => ({
            caseDebtorId: party.caseDebtorId,
            shareWeight: party.shareWeight ?? null,
            limitAmount: party.limitAmount ?? null,
            unlimited: party.unlimited ?? false,
            sortOrder,
          })),
        },
      },
    });
    await prisma.claimItem.update({ where: { id: claimItemId }, data: legacyProjection(mode, parties.map((party) => party.debtorId)) });
  }

  const pay = (f: Fixture, amount: number, caseDebtorId?: string, extra: Partial<CreateCollectionDto> = {}, service = collections()) =>
    service.create(
      f.tenantId,
      {
        caseId: f.caseId,
        idempotencyKey: `liab-pay-${randomUUID()}`,
        amount,
        currency: 'TRY',
        type: CollectionType.BANK_TRANSFER,
        date: '2026-09-20T09:00:00.000Z',
        ...(caseDebtorId ? { caseDebtorId } : {}),
        ...extra,
      } as CreateCollectionDto,
      `actor-${f.tenantId}`,
    );

  async function actor(f: Fixture) {
    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({ data: { tenantId: f.tenantId, email: `liab-${suffix}@example.test`, name: 'Mahsup', surname: 'Aktörü' } });
    const lawyer = await prisma.lawyer.create({ data: { tenantId: f.tenantId, userId: user.id, name: 'Mahsup', surname: 'Aktörü' } });
    await prisma.caseLawyer.create({ data: { caseId: f.caseId, lawyerId: lawyer.id } });
    return user.id;
  }

  const cancel = async (f: Fixture, collectionId: string) => {
    const actorUserId = await actor(f);
    return prisma.$transaction((tx) =>
      executeCollectionCancelInTransaction(
        tx,
        { domainEventIngestService: domainEvents, journalWriter: journalWriter(), auditService: new AuditService(prisma as any) },
        {
          tenantId: f.tenantId,
          id: collectionId,
          dto: { cancelReason: 'sentetik iptal' },
          actorUserId,
          expectedCaseId: f.caseId,
          approvalRequestId: `approval-${randomUUID()}`,
          trace: createCollectionMutationTrace(`corr-${randomUUID()}`, 'approval-liab'),
        },
      ),
    );
  };

  /** Kalem başına: tahsil edilen (tek sayaç), ortak kalan ve borçlu görünümü — okuma modelinden. */
  async function view(f: Fixture) {
    const items = await prisma.claimItem.findMany({ where: { caseId: f.caseId }, orderBy: { sortOrder: 'asc' } });
    const context = await loadCaseLiabilityContext(prisma, { tenantId: f.tenantId, caseId: f.caseId, items, always: true });
    const keyById = Object.fromEntries(Object.entries(f.itemIds).map(([key, id]) => [id, key]));
    const personIndex = new Map(f.debtors.map((debtor, index) => [debtor.debtorId, `B${index + 1}`]));
    const out: Record<string, { C: number; R: number; kalan: Record<string, number | null>; A: Record<string, number>; atifsiz: number; uzlasiyor: boolean; tur: string }> = {};
    for (const item of items) {
      const evaluation = context.evaluations.get(item.id)!;
      out[keyById[item.id]] = {
        C: fromKurus(evaluation.collectedKurus),
        R: fromKurus(evaluation.remainingKurus),
        kalan: Object.fromEntries(evaluation.parties.map((party) => [personIndex.get(party.debtorId)!, party.remainingLiabilityKurus === null ? null : fromKurus(party.remainingLiabilityKurus)])),
        A: Object.fromEntries([...evaluation.attribution.byDebtor].filter(([, kurus]) => kurus !== 0n).map(([debtorId, kurus]) => [personIndex.get(debtorId) ?? debtorId, fromKurus(kurus)])),
        atifsiz: fromKurus(evaluation.attribution.unattributedKurus),
        uzlasiyor: evaluation.reconciled,
        tur: evaluation.kind,
      };
      // AT-3 — uzlaştırma eşitliği her okumada: kalem sayacı = borçlu atıfları + atıfsız
      expect(evaluation.attribution.totalKurus).toBe(evaluation.collectedKurus);
    }
    return out;
  }

  /** AT-16b — her tahsilatta: tutar = mahsup edilen + fazla ödeme olarak ayrılan + bekletilen (kuruşu kuruşuna). */
  async function assertCollectionsReconciled(f: Fixture) {
    const rows = await prisma.collection.findMany({
      where: { caseId: f.caseId, status: 'CONFIRMED' },
      include: { overpayment: true, allocationHold: true, ledgerEntries: { where: { entryType: 'PAYMENT', status: 'CONFIRMED' }, include: { allocations: true } } },
    });
    for (const row of rows) {
      const allocated = row.ledgerEntries.flatMap((entry) => entry.allocations).reduce((sum, allocation) => sum + toKurus(allocation.amount), 0n);
      const overpayment = row.overpayment && row.overpayment.status === 'HELD' ? toKurus(row.overpayment.amount) : 0n;
      const held = row.allocationHold && row.allocationHold.status === 'HELD' ? toKurus(row.allocationHold.amount) : 0n;
      expect({ collectionId: row.id, total: allocated + overpayment + held }).toEqual({ collectionId: row.id, total: toKurus(row.amount) });
    }
    return rows.length;
  }

  it('AT-8 müteselsil tek tahsilat: ortak borç bir kez azalır; iki borçlu da ortak kalandan sorumlu; dosya kalanı toplanmaz', async () => {
    const f = await fixture('joint', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 12000, sortOrder: 1 }]);
    await select(f, 'K1', 'JOINT_AND_SEVERAL', [f.b1, f.b2]);
    await pay(f, 5000, f.b1.caseDebtorId);
    const v = await view(f);
    expect(v.K1).toMatchObject({ C: 5000, R: 7000, kalan: { B1: 7000, B2: 7000 }, A: { B1: 5000 }, tur: 'JOINT_AND_SEVERAL' });
    const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
    const balances = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(balances.dosyaKalani).toEqual([{ paraBirimi: 'TRY', kalan: 7000 }]);
    expect(balances.borclular.map((b) => b.sorumlulukOzeti?.kesinSorumluluk.toplamlar)).toEqual([
      [{ paraBirimi: 'TRY', kalan: 7000 }],
      [{ paraBirimi: 'TRY', kalan: 7000 }],
    ]);
    // Liste etkin borçluların tamamı → borçlusuz ödeme de mahsup edilir (bekletilmez)
    await pay(f, 1000);
    expect((await view(f)).K1).toMatchObject({ C: 6000, R: 6000, atifsiz: 1000 });
    expect(await prisma.collectionAllocationHold.count({ where: { caseId: f.caseId } })).toBe(0);
    await assertCollectionsReconciled(f);
  });

  it('AT-9 paylı — tasarım Örnek 1: pay içi mahsup, aşan tutar borçlu fazla ödemesi, iptalde geri dönüş', async () => {
    const f = await fixture('prop', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 9000, sortOrder: 1 }]);
    await select(f, 'K1', 'PROPORTIONAL', [{ ...f.b1, shareWeight: 6000 }, { ...f.b2, shareWeight: 4000 }]);
    expect((await view(f)).K1).toMatchObject({ C: 0, R: 9000, kalan: { B1: 5400, B2: 3600 } });

    // B2 hesabına 1.000,00 — ödeyen üçüncü kişi (ödeyen adı ayrı tutulur)
    const third = await pay(f, 1000, f.b2.caseDebtorId, { payerName: 'Sentetik Üçüncü Kişi' });
    expect((await view(f)).K1).toMatchObject({ C: 1000, R: 8000, kalan: { B1: 5400, B2: 2600 }, A: { B2: 1000 }, atifsiz: 0 });
    expect(await prisma.collection.findUniqueOrThrow({ where: { id: (third as any).id } })).toMatchObject({ payerName: 'Sentetik Üçüncü Kişi', caseDebtorId: f.b2.caseDebtorId });

    // B1 hesabına 6.000,00 → 5.400,00 mahsup; 600,00 B1'in aşan ödemesi (B2'nin payına AKTARILMAZ)
    const over = await pay(f, 6000, f.b1.caseDebtorId);
    expect((await view(f)).K1).toMatchObject({ C: 6400, R: 2600, kalan: { B1: 0, B2: 2600 }, A: { B1: 5400, B2: 1000 } });
    const overpayment = await prisma.collectionOverpayment.findUniqueOrThrow({ where: { collectionId: (over as any).id } });
    expect(overpayment).toMatchObject({ status: 'HELD', caseDebtorId: f.b1.caseDebtorId });
    expect(Number(overpayment.amount)).toBe(600);
    expect(await assertCollectionsReconciled(f)).toBe(2);

    // Son tahsilatın iptali: borçlunun kapasitesi kendiliğinden geri gelir, aşan ödeme kaydı kapanır
    await cancel(f, (over as any).id);
    expect((await view(f)).K1).toMatchObject({ C: 1000, R: 8000, kalan: { B1: 5400, B2: 2600 }, A: { B2: 1000 } });
    expect(await prisma.collectionOverpayment.findUniqueOrThrow({ where: { collectionId: (over as any).id } })).toMatchObject({ status: 'REVERSED' });
    await assertCollectionsReconciled(f);
  });

  it('AT-10 tutarla sınırlı — tasarım Örnek 3: tavanlar aynı ortak borcun üzerine biner; tavanı aşan tutar ayrılır', async () => {
    const f = await fixture('cap', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 20000, sortOrder: 1 }]);
    await select(f, 'K1', 'CAPPED', [{ ...f.b1, unlimited: true }, { ...f.b2, limitAmount: 8000 }]);
    await pay(f, 3000, f.b2.caseDebtorId);
    expect((await view(f)).K1).toMatchObject({ C: 3000, R: 17000, kalan: { B1: 17000, B2: 5000 }, A: { B2: 3000 } });
    await pay(f, 14000, f.b1.caseDebtorId);
    expect((await view(f)).K1).toMatchObject({ C: 17000, R: 3000, kalan: { B1: 3000, B2: 3000 } });
    const last = await pay(f, 6000, f.b2.caseDebtorId);
    expect((await view(f)).K1).toMatchObject({ C: 20000, R: 0, kalan: { B1: 0, B2: 0 }, A: { B1: 14000, B2: 6000 } });
    const overpayment = await prisma.collectionOverpayment.findUniqueOrThrow({ where: { collectionId: (last as any).id } });
    expect(Number(overpayment.amount)).toBe(3000);
    expect(overpayment.caseDebtorId).toBe(f.b2.caseDebtorId);
    await assertCollectionsReconciled(f);

    // Tavanlı kalemi olan borçluda borçlu toplamı "belirlenemedi"; kalem satırı görünür
    const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
    const balances = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(balances.borclular.map((b) => [b.toplamDurumu, b.toplamlar.length, b.kalemler.length])).toEqual([
      ['BELIRLENEMEDI', 0, 1],
      ['BELIRLENEMEDI', 0, 1],
    ]);
  });

  it('AT-11 farklı sorumluluklu kalemler: müteselsil masraf + belirlenmemiş fer\'i + paylı anapara; mahsup sırası değişmez', async () => {
    const f = await fixture('mixed', [
      { key: 'ANAPARA', itemType: 'PRINCIPAL', amount: 10000, sortOrder: 1 },
      { key: 'FERI', itemType: 'CHECK_PENALTY', amount: 2000, sortOrder: 2 },
      { key: 'MASRAF', itemType: 'EXPENSE', amount: 1000, sortOrder: 3 },
    ]);
    await select(f, 'MASRAF', 'JOINT_AND_SEVERAL', [f.b1, f.b2]);
    await select(f, 'ANAPARA', 'PROPORTIONAL', [{ ...f.b1, shareWeight: 1 }, { ...f.b2, shareWeight: 1 }]);
    const created = await pay(f, 4000, f.b1.caseDebtorId);
    const v = await view(f);
    expect([v.MASRAF.C, v.FERI.C, v.ANAPARA.C]).toEqual([1000, 2000, 1000]);
    expect(v.ANAPARA.kalan).toEqual({ B1: 4000, B2: 5000 });
    // Sıra dağıtıcıdan: masraf → fer'i → anapara
    const allocations = await prisma.ledgerAllocation.findMany({
      where: { ledgerEntry: { collectionId: (created as any).id } },
      orderBy: { allocationOrder: 'asc' },
    });
    expect(allocations.map((allocation) => allocation.claimItemId)).toEqual([f.itemIds.MASRAF, f.itemIds.FERI, f.itemIds.ANAPARA]);
    await assertCollectionsReconciled(f);
  });

  it('AT-12 eşzamanlı tahsilat: ikinci ödeme birincinin tükettiği kapasiteyi görür; tekrar istek tek kayıt', async () => {
    const f = await fixture('race', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 10000, sortOrder: 1 }]);
    await select(f, 'K1', 'PROPORTIONAL', [{ ...f.b1, shareWeight: 1 }, { ...f.b2, shareWeight: 1 }]); // B1 kapasitesi 5.000,00
    const results = await Promise.all([pay(f, 3000, f.b1.caseDebtorId), pay(f, 3000, f.b1.caseDebtorId)]);
    const v = await view(f);
    expect(v.K1).toMatchObject({ C: 5000, kalan: { B1: 0, B2: 5000 }, A: { B1: 5000 }, uzlasiyor: true });
    const perCollection = await Promise.all(
      results.map(async (row: any) => ({
        allocated: Number((await prisma.ledgerAllocation.aggregate({ where: { ledgerEntry: { collectionId: row.id } }, _sum: { amount: true } }))._sum.amount ?? 0),
        over: Number((await prisma.collectionOverpayment.findUnique({ where: { collectionId: row.id } }))?.amount ?? 0),
      })),
    );
    expect(perCollection.map((row) => row.allocated).sort()).toEqual([2000, 3000]);
    expect(perCollection.map((row) => row.over).sort()).toEqual([0, 1000]);
    await assertCollectionsReconciled(f);

    // Aynı anahtarla tekrar istek: tek tahsilat, tek defter kaydı, tek fazla ödeme kaydı
    const key = `liab-replay-${randomUUID()}`;
    const first = await pay(f, 700, f.b1.caseDebtorId, { idempotencyKey: key });
    const second = await pay(f, 700, f.b1.caseDebtorId, { idempotencyKey: key });
    expect((second as any).id).toBe((first as any).id);
    expect(await prisma.collection.count({ where: { caseId: f.caseId } })).toBe(3);
    expect(await prisma.collectionOverpayment.count({ where: { collectionId: (first as any).id } })).toBe(1);
    expect((await view(f)).K1.A).toEqual({ B1: 5000 });
    await assertCollectionsReconciled(f);
  });

  it('AT-13 borçlusu belirtilmeyen ödeme: kaydedilir, mahsup bekletilir, kimseden düşülmez; sonradan borçlu hesabına tamamlanır', async () => {
    const f = await fixture('hold', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 9000, sortOrder: 1 }]);
    await select(f, 'K1', 'PROPORTIONAL', [{ ...f.b1, shareWeight: 6000 }, { ...f.b2, shareWeight: 4000 }]);
    const held = await pay(f, 1000, undefined, { payerName: 'Sentetik Üçüncü Kişi' });
    expect(held).toMatchObject({ status: 'CONFIRMED' });
    expect(await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (held as any).id } })).toMatchObject({ status: 'HELD', holdReason: 'ON_BEHALF_DEBTOR_REQUIRED' });
    expect((await view(f)).K1).toMatchObject({ C: 0, kalan: { B1: 5400, B2: 3600 } });
    expect(await prisma.ledgerEntry.count({ where: { caseId: f.caseId } })).toBe(0);
    await assertCollectionsReconciled(f); // tamamı "bekletilen"

    const actorUserId = await actor(f);
    const result = await collections().completeHeldAllocation(
      f.tenantId,
      { caseId: f.caseId, collectionId: (held as any).id, caseDebtorId: f.b2.caseDebtorId, authorizationBasis: 'MEMBERSHIP' },
      actorUserId,
    );
    expect(result).toMatchObject({ status: 'RELEASED', allocatedAmount: 1000, heldOverpaymentAmount: 0 });
    // Atıf tamamlamada seçilen borçluya; tahsilat satırındaki borçlu alanı değişmez
    expect((await view(f)).K1).toMatchObject({ C: 1000, kalan: { B1: 5400, B2: 2600 }, A: { B2: 1000 }, atifsiz: 0 });
    expect((await prisma.collection.findUniqueOrThrow({ where: { id: (held as any).id } })).caseDebtorId).toBeNull();
    await assertCollectionsReconciled(f);

    // Tamamlamada da kapasite kuralı: B2'nin kalan payı 2.600,00 → 3.000,00 bekletilen ödemenin 400,00'ı aşan
    const second = await pay(f, 3000);
    const completed = await collections().completeHeldAllocation(
      f.tenantId,
      { caseId: f.caseId, collectionId: (second as any).id, caseDebtorId: f.b2.caseDebtorId, authorizationBasis: 'MEMBERSHIP' },
      actorUserId,
    );
    expect(completed).toMatchObject({ allocatedAmount: 2600, heldOverpaymentAmount: 400 });
    expect(await prisma.collectionOverpayment.findUniqueOrThrow({ where: { collectionId: (second as any).id } })).toMatchObject({ caseDebtorId: f.b2.caseDebtorId, status: 'HELD' });
    expect((await view(f)).K1).toMatchObject({ kalan: { B1: 5400, B2: 0 } });
    await assertCollectionsReconciled(f);
  });

  it('AT-14 belirlenmedi: ödeme bugünkü kurallarla kalemi azaltır; ödeyen ve borçlu saklanır; kesin borçlu rakamı üretilmez', async () => {
    const f = await fixture('undet', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 5000, sortOrder: 1 }]);
    // Seçim hiç yok
    const created = await pay(f, 1200, f.b1.caseDebtorId, { payerName: 'Sentetik Ödeyen' });
    expect((await view(f)).K1).toMatchObject({ C: 1200, R: 3800, tur: 'UNDETERMINED', kalan: {} });
    expect(await prisma.collection.findUniqueOrThrow({ where: { id: (created as any).id } })).toMatchObject({ payerName: 'Sentetik Ödeyen', caseDebtorId: f.b1.caseDebtorId });
    const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
    const balances = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    for (const debtor of balances.borclular) {
      expect(debtor.kalemler[0].sorumluluk).toMatchObject({ tur: 'BELIRLENMEDI', kalanSorumluluk: null, ortakKalan: 3800 });
      expect(debtor.sorumlulukOzeti).toEqual({
        kesinSorumluluk: { durum: 'HESAPLANDI', neden: null, toplamlar: [] },
        belirlenmemisOrtakKalan: [{ paraBirimi: 'TRY', kalan: 3800 }],
      });
    }
    // Bilinçli "belirlenmedi" seçim sürümü (geri dönüş) aynı davranışı verir: borçlusuz ödeme bekletilmez
    await select(f, 'K1', 'UNDETERMINED', []);
    await pay(f, 300);
    expect((await view(f)).K1).toMatchObject({ C: 1500, R: 3500, tur: 'UNDETERMINED' });
    expect(await prisma.collectionAllocationHold.count({ where: { caseId: f.caseId } })).toBe(0);
  });

  it('AT-15 uzlaşmayan kalem: kalem tutarı düşünce borçluya bağlı mahsup o kalemde durur; dosya toplamı ve diğer kalemler doğru', async () => {
    const f = await fixture('unrec', [
      { key: 'K1', itemType: 'PRINCIPAL', amount: 10000, sortOrder: 1 },
      { key: 'MASRAF', itemType: 'EXPENSE', amount: 500, sortOrder: 2 },
    ]);
    await select(f, 'K1', 'PROPORTIONAL', [{ ...f.b1, shareWeight: 1 }, { ...f.b2, shareWeight: 1 }]);
    await pay(f, 4500, f.b1.caseDebtorId); // 500 masraf + 4.000 anapara (pay 5.000)
    expect((await view(f)).K1).toMatchObject({ C: 4000, kalan: { B1: 1000, B2: 5000 }, uzlasiyor: true });
    // Kalem tutarı sistem yolundan düşer: yeni pay 3.000,00 < B1 hesabına sayılan 4.000,00
    await prisma.claimItem.update({ where: { id: f.itemIds.K1 }, data: { demandedAmount: 6000, amount: 6000 } });
    const v = await view(f);
    expect(v.K1).toMatchObject({ C: 4000, R: 2000, uzlasiyor: false, kalan: { B1: null, B2: null } });
    // B2 hesabına ödeme: K1'e mahsup DURUR; tamamı borçlu fazla ödemesi olarak izlenir (sınır aşılmaz, para kaybolmaz)
    const created = await pay(f, 800, f.b2.caseDebtorId);
    expect((await view(f)).K1).toMatchObject({ C: 4000, R: 2000 });
    expect(Number((await prisma.collectionOverpayment.findUniqueOrThrow({ where: { collectionId: (created as any).id } })).amount)).toBe(800);
    await assertCollectionsReconciled(f);
    const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
    const balances = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(balances.dosyaKalani).toEqual([{ paraBirimi: 'TRY', kalan: 2000 }]);
    expect(balances.borclular.map((b) => b.sorumlulukOzeti?.kesinSorumluluk)).toEqual([
      { durum: 'BELIRLENEMEDI', neden: 'UZLASMAYAN_KALEM', toplamlar: [] },
      { durum: 'BELIRLENEMEDI', neden: 'UZLASMAYAN_KALEM', toplamlar: [] },
    ]);
  });

  it('AT-16 / AT-16b aşan ödeme: borçlu atıflı "emanette" kayıt; yalnız tanı olayı DEĞİL; bozulan uzlaştırmada işlem geri alınır', async () => {
    const f = await fixture('over', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 4000, sortOrder: 1 }]);
    await select(f, 'K1', 'PROPORTIONAL', [{ ...f.b1, shareWeight: 1 }, { ...f.b2, shareWeight: 1 }]);
    const created = await pay(f, 2500, f.b1.caseDebtorId);
    const overpayment = await prisma.collectionOverpayment.findUniqueOrThrow({ where: { collectionId: (created as any).id } });
    expect(overpayment).toMatchObject({ status: 'HELD', caseDebtorId: f.b1.caseDebtorId, tenantId: f.tenantId, caseId: f.caseId });
    expect([Number(overpayment.amount), Number(overpayment.remainingAmount)]).toEqual([500, 500]);
    // Tanı olayı (OVERPAYMENT_BLOCKED) üretilmedi; kayıt olayı üretildi
    const events = await prisma.icrabotTimelineEntry.findMany({ where: { tenantId: f.tenantId, caseId: f.caseId, type: { in: ['OVERPAYMENT_BLOCKED', 'OVERPAYMENT_RECORDED'] } } });
    expect(events.map((event) => event.type)).toEqual(['OVERPAYMENT_RECORDED']);
    await assertCollectionsReconciled(f);

    // Bilerek bozulan durum: motor, haciz kaynaklı ödemede aşan tutarı "ayrılabilir" sayacak biçimde zorlanır →
    // tahsilat servisi eski yola (yalnız tanı olayı) düşmez; işlem TAMAMEN geri alınır.
    const forced = Object.create(engine) as SummaryEngineService;
    forced.allocatePaymentToLedgerInTx = ((tx: any, tenantId: string, caseId: string, amount: number, options: any) =>
      engine.allocatePaymentToLedgerInTx(tx, tenantId, caseId, amount, { ...options, liabilityExcessAllowed: true })) as never;
    const before = await prisma.collection.count({ where: { caseId: f.caseId } });
    await expect(pay(f, 9000, f.b2.caseDebtorId, { channel: 'HACIZ' as never }, collections(forced))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COLLECTION_RECONCILIATION_FAILED' }),
    });
    expect(await prisma.collection.count({ where: { caseId: f.caseId } })).toBe(before);
    expect((await view(f)).K1).toMatchObject({ C: 2000, A: { B1: 2000 } });
    expect(await prisma.collectionOverpayment.count({ where: { caseId: f.caseId } })).toBe(1);
  });

  it('AT-16c haciz kaynağı: kapasite içinde normal mahsup; aşınca tamamı bekletilir, sınır aşılmaz, önizleme engel gösterir', async () => {
    const f = await fixture('seize', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 4000, sortOrder: 1 }]);
    await select(f, 'K1', 'PROPORTIONAL', [{ ...f.b1, shareWeight: 1 }, { ...f.b2, shareWeight: 1 }]); // pay 2.000,00
    const preview = new CasePaymentPreviewService(prisma as any);

    // Kapasite içinde: normal mahsup
    await pay(f, 1500, f.b1.caseDebtorId, { channel: 'HACIZ' as never });
    expect((await view(f)).K1).toMatchObject({ C: 1500, kalan: { B1: 500, B2: 2000 } });

    // Kapasiteyi aşan haciz ödemesi: önizleme kayıttan ÖNCE açıklayıcı engel
    const blocked = await preview.preview({ tenantId: f.tenantId, caseId: f.caseId, input: { amount: 900, caseDebtorId: f.b1.caseDebtorId, channel: 'HACIZ' } as any });
    expect(blocked.acceptance).toMatchObject({ wouldAccept: false, blockingReasons: ['LIABILITY_LIMIT_EXCEEDED_RESTRICTED_SOURCE'] });
    expect(blocked.liability).toEqual({ shareOrCapBound: true, debtorCapacityAmount: 500, excessAmount: 400, excessHandling: 'ALLOCATION_HELD_LIMIT_EXCEEDED', refundCommandsAvailable: false });
    expect(blocked.balanceImpact.appliedAmount).toBe(0);
    // Aynı tutar haciz dışı kaynakta: engel yok, aşan tutarın akıbeti gösterilir
    const allowed = await preview.preview({ tenantId: f.tenantId, caseId: f.caseId, input: { amount: 900, caseDebtorId: f.b1.caseDebtorId } as any });
    expect(allowed.acceptance.wouldAccept).toBe(true);
    expect(allowed.liability).toMatchObject({ excessAmount: 400, excessHandling: 'DEBTOR_OVERPAYMENT_HELD' });
    expect(allowed.balanceImpact).toMatchObject({ appliedAmount: 500, overpaymentAmount: 400 });

    // Yine de gelen haciz tahsilatı: kaydedilir, TAMAMI bekletilir; hiçbir kaleme düşülmez, fazla ödeme / tanı olayı yok
    const created = await pay(f, 900, f.b1.caseDebtorId, { channel: 'HACIZ' as never });
    expect(created).toMatchObject({ status: 'CONFIRMED' });
    const hold = await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (created as any).id } });
    // Kayıtlı neden eski sürümün okuyabildiği değerdir; ayrıntı kodu metadata'da (gerçek eski sürüm sınaması bulgusu)
    expect(hold).toMatchObject({ status: 'HELD', holdReason: 'ON_BEHALF_DEBTOR_NOT_LIABLE' });
    expect((hold.metadata as any).details).toMatchObject({ reasonCode: 'LIABILITY_LIMIT_EXCEEDED', restrictedSourceOrChannel: true, excessAmount: 400 });
    expect(Number(hold.amount)).toBe(900);
    const heldView = await (Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService).getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(heldView.mahsubuBekleyenTahsilatlar).toEqual([
      { collectionId: (created as any).id, tutar: 900, paraBirimi: 'TRY', sebep: 'LIABILITY_LIMIT_EXCEEDED' },
    ]);
    expect(await prisma.ledgerEntry.count({ where: { collectionId: (created as any).id } })).toBe(0);
    expect(await prisma.collectionOverpayment.count({ where: { collectionId: (created as any).id } })).toBe(0);
    expect((await view(f)).K1).toMatchObject({ C: 1500, kalan: { B1: 500, B2: 2000 }, uzlasiyor: true });
    expect(await prisma.icrabotTimelineEntry.count({ where: { tenantId: f.tenantId, caseId: f.caseId, type: 'OVERPAYMENT_BLOCKED' } })).toBe(0);
    await assertCollectionsReconciled(f);

    // Bekletilen haciz tahsilatı borçlu seçilerek de sınırı aşamaz: tamamlama reddedilir, bekletme korunur
    const actorUserId = await actor(f);
    await expect(
      collections().completeHeldAllocation(
        f.tenantId,
        { caseId: f.caseId, collectionId: (created as any).id, caseDebtorId: f.b1.caseDebtorId, authorizationBasis: 'MEMBERSHIP' },
        actorUserId,
      ),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LIABILITY_LIMIT_EXCEEDED' }) });
    expect((await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (created as any).id } })).status).toBe('HELD');
    expect((await view(f)).K1.C).toBe(1500);
  });

  it('AT-16c (seçimsiz dosya) haciz kaynağında bugünkü davranış AYNEN: mahsup yapılır, aşan tutar için bekletme / borçlu fazla ödemesi üretilmez', async () => {
    const f = await fixture('seize-legacy', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 1000, sortOrder: 1 }]);
    const created = await pay(f, 1300, f.b1.caseDebtorId, { channel: 'HACIZ' as never });
    expect((await view(f)).K1).toMatchObject({ C: 1000, R: 0, tur: 'UNDETERMINED' });
    expect(await prisma.collectionAllocationHold.count({ where: { collectionId: (created as any).id } })).toBe(0);
    expect(await prisma.collectionOverpayment.count({ where: { collectionId: (created as any).id } })).toBe(0);
    expect(await prisma.icrabotTimelineEntry.count({ where: { tenantId: f.tenantId, caseId: f.caseId, type: 'OVERPAYMENT_BLOCKED' } })).toBe(1);
  });

  it('AT-16d kiracı yalıtımı: bir kiracının seçim, atıf ve fazla ödeme kayıtları başka kiracının okumasına ve mahsubuna girmez', async () => {
    const a = await fixture('tenant-a', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 6000, sortOrder: 1 }]);
    const b = await fixture('tenant-b', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 6000, sortOrder: 1 }]);
    await select(a, 'K1', 'PROPORTIONAL', [{ ...a.b1, shareWeight: 1 }, { ...a.b2, shareWeight: 1 }]);
    await pay(a, 3500, a.b1.caseDebtorId); // 3.000 mahsup + 500 borçlu fazla ödemesi

    // B kiracısı: seçimi yok → borçlusuz ödeme bugünkü gibi mahsup edilir; A'nın seçimi etkisiz
    await pay(b, 1000);
    expect((await view(b)).K1).toMatchObject({ C: 1000, tur: 'UNDETERMINED' });
    expect(await prisma.collectionOverpayment.count({ where: { tenantId: b.tenantId } })).toBe(0);

    // Yanlış kiracı kimliğiyle A'nın dosyası okunursa seçim de atıf da görünmez
    const items = await prisma.claimItem.findMany({ where: { caseId: a.caseId } });
    const cross = await loadCaseLiabilityContext(prisma, { tenantId: b.tenantId, caseId: a.caseId, items, always: true });
    expect(cross.hasEffectiveSelection).toBe(false);
    expect(cross.caseDebtors).toEqual([]);
    // Seçim ve atıf görünmez; kalemdeki izdüşüm (kısıtlı, BOŞ liste) tek başına hiçbir borçluya mahsup kapasitesi vermez
    expect(
      [...cross.evaluations.values()].map((evaluation) => [evaluation.kind, evaluation.setId, evaluation.liableDebtorIds, evaluation.attribution.totalKurus]),
    ).toEqual([['LEGACY_RESTRICTED', null, [], 0n]]);
    const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
    await expect(caseService.getDebtorLedgerBalances(b.tenantId, a.caseId)).rejects.toThrow('Dosya bulunamadı');
    await expect(caseService.getClaimLiabilityState(b.tenantId, a.caseId)).rejects.toThrow('Dosya bulunamadı');

    // Veritabanı düzeyi: başka kiracının kalemine seçim yazılamaz (bileşik yabancı anahtar)
    await expect(
      prisma.claimItemLiabilitySet.create({
        data: {
          tenantId: b.tenantId,
          caseId: a.caseId,
          claimItemId: a.itemIds.K1,
          version: 9,
          mode: 'UNDETERMINED',
          decidedByUserId: 'x',
          decidedAt: new Date(),
          appliedVia: 'SINGLE',
        },
      }),
    ).rejects.toThrow();
    // A'nın kayıtları yerinde ve A kiracısına ait
    expect((await view(a)).K1).toMatchObject({ C: 3000, kalan: { B1: 0, B2: 3000 } });
    expect(await prisma.collectionOverpayment.findMany({ where: { caseId: a.caseId }, select: { tenantId: true, caseDebtorId: true } })).toEqual([
      { tenantId: a.tenantId, caseDebtorId: a.b1.caseDebtorId },
    ]);
  });

  it('veritabanı kısıtları: kalem başına tek etkin seçim; seçim sürümü değiştirilemez, yalnız kapanır', async () => {
    const f = await fixture('db', [{ key: 'K1', itemType: 'PRINCIPAL', amount: 1000, sortOrder: 1 }]);
    await select(f, 'K1', 'JOINT_AND_SEVERAL', [f.b1]);
    const active = await prisma.claimItemLiabilitySet.findFirstOrThrow({ where: { claimItemId: f.itemIds.K1, status: 'ACTIVE' }, include: { parties: true } });
    const base = { tenantId: f.tenantId, caseId: f.caseId, claimItemId: f.itemIds.K1, decidedByUserId: 'x', decidedAt: new Date(), appliedVia: 'SINGLE' };
    // İkinci etkin seçim
    await expect(prisma.claimItemLiabilitySet.create({ data: { ...base, version: 2, mode: 'UNDETERMINED' } })).rejects.toThrow();
    // Karar alanı değiştirilemez
    await expect(prisma.claimItemLiabilitySet.update({ where: { id: active.id }, data: { basisNote: 'sonradan' } })).rejects.toThrow();
    await expect(prisma.claimItemLiabilityParty.update({ where: { id: active.parties[0].id }, data: { sortOrder: 5 } })).rejects.toThrow();
    // Tür / alan uyumsuzluğu: dayanaksız müteselsil, tavan kapsamı olmayan tutarla sınırlı
    await prisma.claimItemLiabilitySet.update({ where: { id: active.id }, data: { status: 'SUPERSEDED', supersededAt: new Date(), supersededBySetId: 'yeni' } });
    await expect(prisma.claimItemLiabilitySet.create({ data: { ...base, version: 3, mode: 'JOINT_AND_SEVERAL' } })).rejects.toThrow();
    await expect(prisma.claimItemLiabilitySet.create({ data: { ...base, version: 3, mode: 'CAPPED', basis: 'CONTRACT' } })).rejects.toThrow();
    // Kapanmış sürüm yeniden açılamaz
    await expect(prisma.claimItemLiabilitySet.update({ where: { id: active.id }, data: { status: 'ACTIVE', supersededAt: null, supersededBySetId: null } })).rejects.toThrow();
  });
});
