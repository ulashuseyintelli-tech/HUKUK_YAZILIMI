import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { CasePaymentPreviewService } from '../../case/case-payment-preview.service';
import { CaseService } from '../../case/case.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { CollectionService } from '../collection.service';
import { CollectionType, type CreateCollectionDto } from '../dto/collection.dto';
import { executeCollectionCancelInTransaction } from '../collection-cancel-executor';
import { createCollectionMutationTrace } from '../collection-audit';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';
import { paymentAllocationCompletedEventId } from '../collection-allocation-hold';
import { ReceiptObjectScopeAuthorizationService } from '../receipt-object-scope-authorization.service';

/**
 * K3-L Faz 1b (owner kararları 2026-09-28) — tahsilat yalnız ödeyen borçlunun sorumlu olduğu kalemlere mahsup edilir.
 * Yeniden üretilen kusur: ciranta adına 500 TL tahsilat keşideciye ait çek tazminatına düşüyordu.
 * Gerçek CollectionService + SummaryEngine (TBK100) + disposable PostgreSQL.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('K3-L payer scope DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

describeWithDisposableDb('K3-L ödeyen borçluya göre tahsilat mahsubu (disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);
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
  // Nakit girişi yevmiyesi gerçek yazıcıyla (iptal yürütücüsü orijinal RECORDED yevmiyeyi şart koşar).
  const journalWriter = () => new AccountingJournalWriterService(prisma as any);
  // Onay jetonu üretmeyen kapı: üyelik dayanağı yeterli (tx içi yeniden doğrulama yalnız prisma kullanır).
  const receiptAuthorization = () =>
    new ReceiptObjectScopeAuthorizationService(prisma as any, { isSecretConfigured: () => false } as any);
  const collections = () =>
    new CollectionService(
      prisma as any,
      domainEvents,
      new CaseDebtorLifecycleGuardService(prisma as any),
      engine,
      journalWriter(),
      undefined,
      new AuditService(prisma as any),
      receiptAuthorization(),
    );

  async function fixture(label: string, penaltyRestricted = true) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-k3l-pay-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `K3L ${label}`, slug: tenantId } });
    const client = await prisma.client.create({ data: { tenantId, displayName: 'Alacaklı', type: 'COMPANY' } as never });
    const legalCase = await prisma.case.create({
      data: {
        tenantId,
        clientId: client.id,
        fileNumber: `K3L-PAY-${suffix}`,
        type: 'CHECK',
        caseStatus: 'DERDEST',
        status: 'ACTIVE',
        currency: 'TRY',
      } as never,
    });
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
          interestAccrualStatus: 'NO_INTEREST',
          isAllDebtorsLiable: restrictedTo === null,
          liableDebtorIds: restrictedTo ?? [],
          sortOrder,
        },
      });
    const principal = await item('PRINCIPAL', 10000, 1, null);
    const penalty = await item('CHECK_PENALTY', 1000, 2, penaltyRestricted ? [kesideci.id] : null);
    return { tenantId, caseId: legalCase.id, kesideciCd, cirantaCd, principal, penalty };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  const pay = (f: Fixture, amount: number, caseDebtorId?: string) =>
    collections().create(
      f.tenantId,
      {
        caseId: f.caseId,
        idempotencyKey: `k3l-pay-${randomUUID()}`,
        amount,
        currency: 'TRY',
        type: CollectionType.BANK_TRANSFER,
        date: '2026-09-20T09:00:00.000Z',
        ...(caseDebtorId ? { caseDebtorId } : {}),
      } as CreateCollectionDto,
      `actor-${f.tenantId}`,
    );

  const collected = async (f: Fixture) => {
    const rows = await prisma.claimItem.findMany({ where: { caseId: f.caseId }, orderBy: { sortOrder: 'asc' } });
    return Object.fromEntries(rows.map((r) => [r.itemType, Number(r.collectedAmount)]));
  };

  /** Dosyadaki bütün mali yazımların sayımı: reddedilen işlem sonrası "hiçbir kayıt kalmadı" kanıtı için. */
  const snapshot = async (f: Fixture) => ({
    collections: await prisma.collection.count({ where: { tenantId: f.tenantId } }),
    ledgerEntries: await prisma.ledgerEntry.count({ where: { tenantId: f.tenantId } }),
    ledgerAllocations: await prisma.ledgerAllocation.count({ where: { ledgerEntry: { tenantId: f.tenantId } } }),
    collectionAllocations: await prisma.collectionAllocation.count({ where: { collection: { tenantId: f.tenantId } } }),
    overpayments: await prisma.collectionOverpayment.count({ where: { tenantId: f.tenantId } }),
    holds: await prisma.collectionAllocationHold.count({ where: { tenantId: f.tenantId } }),
    timeline: await prisma.icrabotTimelineEntry.count({ where: { tenantId: f.tenantId } }),
    outbox: await prisma.icrabotOutboxAction.count({ where: { tenantId: f.tenantId } }),
    journals: await prisma.accountingJournalEntry.count({ where: { tenantId: f.tenantId } }),
    audits: await prisma.auditLog.count({ where: { tenantId: f.tenantId } }),
    collected: await collected(f),
  });

  it('ciranta ödemesi keşideciye ait tazminata DEĞİL, bedele mahsup edilir (kusur tersine döndü)', async () => {
    const f = await fixture('ciranta');
    await pay(f, 500, f.cirantaCd.id);
    expect(await collected(f)).toEqual({ PRINCIPAL: 500, CHECK_PENALTY: 0 });
  });

  it('keşideci ödemesi TBK100 sırasıyla önce fer\'i tazminata, sonra bedele', async () => {
    const f = await fixture('kesideci');
    await pay(f, 1500, f.kesideciCd.id);
    expect(await collected(f)).toEqual({ PRINCIPAL: 500, CHECK_PENALTY: 1000 });
  });

  it('owner kararı 2026-09-29: borçlusu belirsiz tahsilat REDDEDİLMEZ — kaydedilir, mahsup bekletilir (HELD emanet)', async () => {
    const f = await fixture('no-payer');
    const created = await pay(f, 500);
    expect(created).toMatchObject({ status: 'CONFIRMED' });
    expect(await prisma.collection.count({ where: { caseId: f.caseId } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { caseId: f.caseId } })).toBe(0);
    expect(await prisma.collectionAllocation.count({ where: { collectionId: (created as any).id } })).toBe(0);
    expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 0 });
    // Bekletme AYRI tabloda; fazla ödeme (CollectionOverpayment) satırı YOK → iade/dağıtım konusu olamaz.
    const hold = await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (created as any).id } });
    expect(hold).toMatchObject({ status: 'HELD', holdReason: 'ON_BEHALF_DEBTOR_REQUIRED', releasedLedgerEntryId: null });
    expect(Number(hold.amount)).toBe(500);
    expect(await prisma.collectionOverpayment.count({ where: { caseId: f.caseId } })).toBe(0);
  });

  it('hesabına ödeme yapılan borçlunun sorumlu kalemi yoksa da kaydedilir, mahsup bekletilir', async () => {
    const f = await fixture('not-liable');
    await prisma.claimItem.update({ where: { id: f.principal.id }, data: { status: 'CANCELLED' } });
    const created = await pay(f, 300, f.cirantaCd.id);
    expect(await prisma.ledgerEntry.count({ where: { caseId: f.caseId } })).toBe(0);
    const hold = await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (created as any).id } });
    expect(hold).toMatchObject({ status: 'HELD', holdReason: 'ON_BEHALF_DEBTOR_NOT_LIABLE' });
    expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 0 });
  });

  it('tüm kalemleri tüm borçlulara açık dosyada davranış değişmez (ödeyensiz tahsilat bugünkü gibi)', async () => {
    const f = await fixture('unrestricted', false);
    await pay(f, 500);
    expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 500 });
  });

  it('cirantanın sorumlu olduğu tutarı aşan elle girilen ödemesi kesinleşmeden REDDEDİLİR: tazminata taşmaz; kısmi PAYMENT / mahsup / fazla ödeme / tanı olayı kalmaz', async () => {
    // Eski davranış (kusur): 10.000 mahsup + PAYMENT 12.000 yazılır, 2.000 yalnız OVERPAYMENT_BLOCKED tanısında kalırdı
    // (tahsilat ≠ mahsup + fazla ödeme + bekletilen). Şimdi: işlem geri alınır, hiçbir mali kayıt oluşmaz.
    const f = await fixture('overpay');
    const before = await snapshot(f);
    const error = await pay(f, 12000, f.cirantaCd.id).catch((e) => e);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      code: 'COLLECTION_DEBTOR_PAYMENT_EXCEEDS_ALLOCATABLE',
      collectionAmount: 12000,
      allocatableAmount: 10000,
      excessAmount: 2000,
      reasons: expect.arrayContaining(['NO_SHARE_OR_CAP_SELECTION']),
    });
    expect(await snapshot(f)).toEqual(before);
    expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 0 });
  });

  it('K3-L Faz 1c: borçlu bazlı bakiye kalıcı defterden — keşideci bedel + kendi tazminatı, ciranta yalnız bedel', async () => {
    const f = await fixture('ledger-balance');
    await pay(f, 500, f.cirantaCd.id);
    await pay(f, 300, f.kesideciCd.id);
    expect(await collected(f)).toEqual({ PRINCIPAL: 500, CHECK_PENALTY: 300 });

    const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
    const result = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(result).toMatchObject({ kaynak: 'KALICI_DEFTER', isleyenFaizDahil: false, sorumlusuBulunamayanKalemler: [] });
    const byCaseDebtor = Object.fromEntries(result.borclular.map((b) => [b.caseDebtorId, b]));
    expect(byCaseDebtor[f.kesideciCd.id].toplamlar).toEqual([{ paraBirimi: 'TRY', tutar: 11000, tahsilEdilen: 800, kalan: 10200 }]);
    expect(byCaseDebtor[f.cirantaCd.id].toplamlar).toEqual([{ paraBirimi: 'TRY', tutar: 10000, tahsilEdilen: 500, kalan: 9500 }]);
    expect(byCaseDebtor[f.cirantaCd.id].kalemler.map((l) => l.kalemTuru)).toEqual(['PRINCIPAL']);
    expect(result.mahsubuBekleyenTahsilatlar).toEqual([]);

    // Borçlusu belirsiz tahsilat kaydedilir; kimsenin kalanından düşülmez, ayrıca listelenir.
    const held = await pay(f, 250);
    const after = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
    expect(after.mahsubuBekleyenTahsilatlar).toEqual([
      { collectionId: (held as any).id, tutar: 250, paraBirimi: 'TRY', sebep: 'ON_BEHALF_DEBTOR_REQUIRED' },
    ]);
    const afterByCd = Object.fromEntries(after.borclular.map((b) => [b.caseDebtorId, b]));
    expect(afterByCd[f.kesideciCd.id].toplamlar[0].kalan).toBe(10200);
    expect(afterByCd[f.cirantaCd.id].toplamlar[0].kalan).toBe(9500);
  });

  it('önizleme: ödeyensiz → kabul edilmez; ciranta → yalnız bedel; keşideci → bedel + tazminat', async () => {
    const f = await fixture('preview');
    const preview = new CasePaymentPreviewService(prisma as any);
    const noPayer = await preview.preview({ tenantId: f.tenantId, caseId: f.caseId, input: { amount: 500 } as any });
    expect(noPayer.acceptance).toMatchObject({ wouldAccept: true, blockingReasons: [] });
    expect(noPayer.acceptance.warnings).toContain('ALLOCATION_HELD_ON_BEHALF_DEBTOR_REQUIRED');
    expect(noPayer.balanceImpact.appliedAmount).toBe(0);
    const cirantaPreview = await preview.preview({ tenantId: f.tenantId, caseId: f.caseId, input: { amount: 500, caseDebtorId: f.cirantaCd.id } as any });
    expect(cirantaPreview.balanceImpact.currentOutstandingAmount).toBe(10000);
    expect(cirantaPreview.acceptance.warnings).toContain('PAYER_SCOPED_OUTSTANDING_EXCLUDES_INTEREST');
    const kesideciPreview = await preview.preview({ tenantId: f.tenantId, caseId: f.caseId, input: { amount: 500, caseDebtorId: f.kesideciCd.id } as any });
    expect(kesideciPreview.balanceImpact.currentOutstandingAmount).toBe(11000);
  });

  /**
   * K3-L (owner GO 2026-09-29) — BEKLETİLEN MAHSUBUN TAMAMLANMASI. Gerçek servis + disposable PostgreSQL:
   * yetki tx içinde yeniden doğrulanır; tek transaction'da defter mahsubu + HELD→RELEASED; tekrar/yarış/iptal
   * yarışlarında ikinci mahsup, ikinci tahsilat, ikinci ödeme olayı üretilmez; kalan tutar kaybolmaz.
   */
  describe('bekletilen mahsubun tamamlanması', () => {
    async function actor(f: Fixture, member = true) {
      const suffix = randomUUID().slice(0, 8);
      const user = await prisma.user.create({
        data: { tenantId: f.tenantId, email: `k3l-${suffix}@example.test`, name: 'Mahsup', surname: 'Aktörü' },
      });
      const lawyer = await prisma.lawyer.create({ data: { tenantId: f.tenantId, userId: user.id, name: 'Mahsup', surname: 'Aktörü' } });
      if (member) await prisma.caseLawyer.create({ data: { caseId: f.caseId, lawyerId: lawyer.id } });
      return { userId: user.id, lawyerId: lawyer.id };
    }
    const complete = (f: Fixture, collectionId: string, caseDebtorId: string, actorUserId: string) =>
      collections().completeHeldAllocation(
        f.tenantId,
        { caseId: f.caseId, collectionId, caseDebtorId, authorizationBasis: 'MEMBERSHIP' },
        actorUserId,
      );
    const counts = async (f: Fixture, collectionId: string) => ({
      collections: await prisma.collection.count({ where: { caseId: f.caseId } }),
      ledgerPayments: await prisma.ledgerEntry.count({ where: { collectionId, entryType: 'PAYMENT', status: 'CONFIRMED' } }),
      paymentReceived: await prisma.icrabotTimelineEntry.count({
        where: { tenantId: f.tenantId, caseId: f.caseId, type: 'PAYMENT_RECEIVED', body: { path: ['payload', 'collectionId'], equals: collectionId } },
      }),
      allocationCompleted: await prisma.icrabotTimelineEntry.count({
        where: { tenantId: f.tenantId, caseId: f.caseId, type: 'PAYMENT_ALLOCATION_COMPLETED', body: { path: ['payload', 'collectionId'], equals: collectionId } },
      }),
      completionAudit: await prisma.auditLog.count({ where: { tenantId: f.tenantId, action: 'COLLECTION_ALLOCATION_COMPLETED', entityId: collectionId } }),
    });

    it('keşideci girilince aynı transaction\'da TBK100 mahsubu yapılır, bekletme RELEASED olur; tahsilat/ödeme olayı yeniden üretilmez', async () => {
      const f = await fixture('complete');
      const { userId } = await actor(f);
      const held = await pay(f, 1500);
      const before = await counts(f, (held as any).id);
      expect(before).toMatchObject({ collections: 1, ledgerPayments: 0, paymentReceived: 1, allocationCompleted: 0 });

      const result = await complete(f, (held as any).id, f.kesideciCd.id, userId);
      expect(result).toMatchObject({ status: 'RELEASED', replayed: false, onBehalfCaseDebtorId: f.kesideciCd.id, allocatedAmount: 1500, heldOverpaymentAmount: 0 });
      expect(await collected(f)).toEqual({ PRINCIPAL: 500, CHECK_PENALTY: 1000 });

      const hold = await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (held as any).id } });
      expect(hold).toMatchObject({ status: 'RELEASED', releasedOnBehalfCaseDebtorId: f.kesideciCd.id, releasedLedgerEntryId: result.ledgerEntryId, releasedById: userId });
      const ledger = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: result.ledgerEntryId! } });
      expect(ledger).toMatchObject({ entryType: 'PAYMENT', status: 'CONFIRMED', collectionId: (held as any).id });
      expect(ledger.entryDate.toISOString()).toBe('2026-09-20T09:00:00.000Z');
      expect(ledger.metadata).toMatchObject({ allocationHoldId: hold.id, onBehalfCaseDebtorId: f.kesideciCd.id });
      // Collection.caseDebtorId DEĞİŞMEZ (yevmiye kaynak hash'i); borçlu bekletme kaydında + defter metadata'sında.
      expect((await prisma.collection.findUniqueOrThrow({ where: { id: (held as any).id } })).caseDebtorId).toBeNull();

      const after = await counts(f, (held as any).id);
      expect(after).toEqual({ collections: 1, ledgerPayments: 1, paymentReceived: 1, allocationCompleted: 1, completionAudit: 1 });
      const completedEvent = await prisma.icrabotTimelineEntry.findFirst({
        where: { tenantId: f.tenantId, type: 'PAYMENT_ALLOCATION_COMPLETED' },
        select: { body: true },
      });
      const body = completedEvent?.body as any;
      expect(body.header.eventId).toBe(paymentAllocationCompletedEventId(f.tenantId, (held as any).id));
      expect(body.header.actor).toMatchObject({ type: 'HUMAN', userId });
      expect(body.header.causedBy).toBeTruthy();

      // Borçlu bazlı bakiye ve hesap özeti: bekletme listesi boşalır; keşidecinin kalanı düşer.
      const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
      const balances = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
      expect(balances.mahsubuBekleyenTahsilatlar).toEqual([]);
      const byCd = Object.fromEntries(balances.borclular.map((b) => [b.caseDebtorId, b]));
      expect(byCd[f.kesideciCd.id].toplamlar[0].kalan).toBe(9500);
      expect(byCd[f.cirantaCd.id].toplamlar[0].kalan).toBe(9500);
    });

    it('aynı borçluyla tekrar → replay (ikinci defter kaydı/olay yok); farklı borçluyla → 409', async () => {
      const f = await fixture('replay');
      const { userId } = await actor(f);
      const held = await pay(f, 500);
      const first = await complete(f, (held as any).id, f.cirantaCd.id, userId);
      const again = await complete(f, (held as any).id, f.cirantaCd.id, userId);
      expect(again).toMatchObject({ replayed: true, status: 'RELEASED', ledgerEntryId: first.ledgerEntryId, allocatedAmount: 500 });
      await expect(complete(f, (held as any).id, f.kesideciCd.id, userId)).rejects.toMatchObject({
        response: { code: 'ALLOCATION_HOLD_ALREADY_RELEASED' },
      });
      expect(await counts(f, (held as any).id)).toEqual({ collections: 1, ledgerPayments: 1, paymentReceived: 1, allocationCompleted: 1, completionAudit: 1 });
      expect(await collected(f)).toEqual({ PRINCIPAL: 500, CHECK_PENALTY: 0 });
    });

    it('eşzamanlı iki tamamlama → tek defter kaydı, tek RELEASED; kaybeden tekrar yanıtı alır ya da 409 ile düşer', async () => {
      const f = await fixture('race');
      const { userId } = await actor(f);
      const held = await pay(f, 700);
      const outcomes = await Promise.allSettled([
        complete(f, (held as any).id, f.kesideciCd.id, userId),
        complete(f, (held as any).id, f.kesideciCd.id, userId),
      ]);
      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      expect(fulfilled.filter((o) => o.value.replayed === false)).toHaveLength(1);
      for (const o of outcomes) {
        if (o.status === 'rejected') expect((o.reason as any).status ?? (o.reason as any).getStatus?.()).toBe(409);
      }
      expect(await counts(f, (held as any).id)).toEqual({ collections: 1, ledgerPayments: 1, paymentReceived: 1, allocationCompleted: 1, completionAudit: 1 });
      expect(await prisma.collectionAllocationHold.count({ where: { caseId: f.caseId, status: 'RELEASED' } })).toBe(1);
      expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 700 });
    });

    it('yetki işlem anında yeniden doğrulanır: dosya üyesi olmayan aktör tamamlayamaz; hiçbir yazma olmaz', async () => {
      const f = await fixture('unauthorized');
      const { userId } = await actor(f, false);
      const held = await pay(f, 500);
      await expect(complete(f, (held as any).id, f.kesideciCd.id, userId)).rejects.toMatchObject({
        response: { code: 'RECEIPT_CASE_MEMBERSHIP_REVOKED' },
      });
      expect(await counts(f, (held as any).id)).toMatchObject({ ledgerPayments: 0, allocationCompleted: 0, completionAudit: 0 });
      expect((await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (held as any).id } })).status).toBe('HELD');
    });

    it('borçlunun sorumlu kalemi hâlâ yoksa bekletme AYNEN korunur (409, yazma yok)', async () => {
      const f = await fixture('still-held');
      const { userId } = await actor(f);
      await prisma.claimItem.update({ where: { id: f.principal.id }, data: { status: 'CANCELLED' } });
      const held = await pay(f, 300, f.cirantaCd.id);
      await expect(complete(f, (held as any).id, f.cirantaCd.id, userId)).rejects.toMatchObject({
        response: { code: 'ON_BEHALF_DEBTOR_NOT_LIABLE' },
      });
      expect((await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (held as any).id } })).status).toBe('HELD');
      expect(await counts(f, (held as any).id)).toMatchObject({ ledgerPayments: 0, allocationCompleted: 0 });
    });

    it('kalan tutar kaybolmaz ve KISMİ YAZIM OLMAZ: sorumlu kalemleri aşan bekletme tamamlanmaz (409), bekletme AYNEN korunur; sorumlu kalemleri aşmayan bekletme tamamlanır', async () => {
      // Eski davranış (kusur): tamamlama 10.000 mahsup eder, 2.000'i yalnız OVERPAYMENT_BLOCKED tanısında bırakırdı. Şimdi
      // create() ile AYNI kural işlem anında yeniden denetlenir: aşan tutar kalıcı kayda alınamıyorsa hiçbir şey yazılmaz.
      const f = await fixture('remainder');
      const { userId } = await actor(f);
      const held = await pay(f, 12000);
      const before = await snapshot(f);
      const error = await complete(f, (held as any).id, f.cirantaCd.id, userId).catch((e) => e);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        code: 'UNRECONCILED_REMAINDER',
        unreconciled: { plannedAllocatedAmount: 10000, excessAmount: 2000 },
      });
      expect(await snapshot(f)).toEqual(before);
      expect((await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (held as any).id } })).status).toBe('HELD');
      expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 0 });
      expect(await prisma.icrabotTimelineEntry.count({ where: { tenantId: f.tenantId, type: 'OVERPAYMENT_BLOCKED' } })).toBe(0);

      // Sorumlu kalemlere TAM sığan bekletme (10.000 = cirantanın sorumlu olduğu bedel) tamamlanır: korunur.
      const f2 = await fixture('remainder-fits');
      const { userId: userId2 } = await actor(f2);
      const heldFits = await pay(f2, 10000);
      const result = await complete(f2, (heldFits as any).id, f2.cirantaCd.id, userId2);
      expect(result).toMatchObject({ status: 'RELEASED', allocatedAmount: 10000, heldOverpaymentAmount: 0 });
      expect(await collected(f2)).toEqual({ PRINCIPAL: 10000, CHECK_PENALTY: 0 });
    });

    it('iptal ↔ tamamlama: tamamlanmış tahsilat iptal edilince defter terslenir ve bekletme REVERSED olur; iptal edilmiş tahsilat tamamlanamaz', async () => {
      const f = await fixture('cancel');
      const { userId } = await actor(f);
      const audit = new AuditService(prisma as any);
      const cancel = (collectionId: string) =>
        prisma.$transaction((tx) =>
          executeCollectionCancelInTransaction(
            tx,
            { domainEventIngestService: domainEvents, journalWriter: journalWriter(), auditService: audit },
            {
              tenantId: f.tenantId,
              id: collectionId,
              dto: { cancelReason: 'k3l cancel race' },
              actorUserId: userId,
              expectedCaseId: f.caseId,
              approvalRequestId: `approval-${randomUUID()}`,
              trace: createCollectionMutationTrace(`corr-${randomUUID()}`, 'approval-k3l'),
            },
          ),
        );

      const completedThenCancelled = await pay(f, 400);
      await complete(f, (completedThenCancelled as any).id, f.kesideciCd.id, userId);
      expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 400 });
      await cancel((completedThenCancelled as any).id);
      expect(await collected(f)).toEqual({ PRINCIPAL: 0, CHECK_PENALTY: 0 });
      expect((await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (completedThenCancelled as any).id } })).status).toBe('REVERSED');
      expect(await prisma.ledgerEntry.count({ where: { collectionId: (completedThenCancelled as any).id, entryType: 'REVERSAL' } })).toBe(1);

      const cancelledThenCompleted = await pay(f, 250);
      await cancel((cancelledThenCompleted as any).id);
      await expect(complete(f, (cancelledThenCompleted as any).id, f.kesideciCd.id, userId)).rejects.toMatchObject({
        response: { code: 'COLLECTION_NOT_CONFIRMED' },
      });
      expect((await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (cancelledThenCompleted as any).id } })).status).toBe('REVERSED');
      expect(await prisma.ledgerEntry.count({ where: { collectionId: (cancelledThenCompleted as any).id } })).toBe(0);
    });
  });

  /**
   * RESTRICTED_PAYMENT_UNSUPPORTED yolundaki eksik uzlaştırma (owner 16.11.2026): seçim bağı (paylı / tutarla sınırlı)
   * olmayan dosyada borçlu belirtilmiş ya da haciz / icra dairesi kaynaklı ödeme mevcut kurallarla tamamen mahsup
   * edilemiyor ve aşan tutar kalıcı fazla ödeme / bekletme kaydına alınamıyor (PaymentDesignation, COL/OD-19 açık).
   * Yeniden üretilen kusur: PAYMENT 12.000 + mahsup 9.600 / 10.000, geri kalan yalnız OVERPAYMENT_BLOCKED tanısında.
   * Denklem her tahsilatta tutmalı: tahsilat = mahsup + fazla ödeme + bekletilen.
   */
  describe('seçim bağı olmayan dosyada kalıcı kaydı olmayan kalan tutar', () => {
    const receipt = (f: Fixture, over: Record<string, unknown>) =>
      ({
        caseId: f.caseId,
        idempotencyKey: `unrec-${randomUUID()}`,
        amount: 1,
        currency: 'TRY',
        type: CollectionType.BANK_TRANSFER,
        date: '2026-09-20T09:00:00.000Z',
        ...over,
      }) as unknown as CreateCollectionDto;
    const create = (f: Fixture, over: Record<string, unknown>) => collections().create(f.tenantId, receipt(f, over), `actor-${f.tenantId}`);
    /** Her ONAYLI tahsilat için: tahsilat − (mahsup + fazla ödeme + bekletilen). 0 değilse uzlaşmazlık. */
    const reconcile = async (f: Fixture) => {
      const rows = await prisma.collection.findMany({ where: { tenantId: f.tenantId, status: 'CONFIRMED' }, orderBy: { createdAt: 'asc' } });
      return Promise.all(
        rows.map(async (c) => {
          const mahsup = await prisma.ledgerAllocation.aggregate({ _sum: { amount: true }, where: { ledgerEntry: { collectionId: c.id, entryType: 'PAYMENT' } } });
          const fazla = await prisma.collectionOverpayment.aggregate({ _sum: { amount: true }, where: { collectionId: c.id } });
          const bekletilen = await prisma.collectionAllocationHold.aggregate({ _sum: { amount: true }, where: { collectionId: c.id } });
          const row = { tahsilat: Number(c.amount), mahsup: Number(mahsup._sum.amount ?? 0), fazla: Number(fazla._sum.amount ?? 0), bekletilen: Number(bekletilen._sum.amount ?? 0) };
          return { ...row, uzlasmayan: row.tahsilat - row.mahsup - row.fazla - row.bekletilen };
        }),
      );
    };
    async function actorUser(f: Fixture) {
      const user = await prisma.user.create({
        data: { tenantId: f.tenantId, email: `unrec-${randomUUID().slice(0, 8)}@example.test`, name: 'Mahsup', surname: 'Aktörü' },
      });
      const lawyer = await prisma.lawyer.create({ data: { tenantId: f.tenantId, userId: user.id, name: 'Mahsup', surname: 'Aktörü' } });
      await prisma.caseLawyer.create({ data: { caseId: f.caseId, lawyerId: lawyer.id } });
      return user.id;
    }

    it('borçlu belirtilmiş + alacağı aşan elle ödeme (kusurun yeniden üretimi): kesinleşmeden reddedilir, HİÇBİR mali kayıt kalmaz; reddedilen istek anahtarı tüketmez', async () => {
      const f = await fixture('rej', false); // bütün kalemler tüm borçlulara açık: kapasite 10.000 + 1.000 = 11.000
      const before = await snapshot(f);
      const key = `unrec-${randomUUID()}`;
      const error = await create(f, { idempotencyKey: key, amount: 12000, caseDebtorId: f.kesideciCd.id }).catch((e) => e);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        code: 'COLLECTION_DEBTOR_PAYMENT_EXCEEDS_ALLOCATABLE',
        collectionAmount: 12000,
        allocatableAmount: 11000,
        excessAmount: 1000,
        currency: 'TRY',
        onBehalfCaseDebtorId: f.kesideciCd.id,
      });
      expect(String(error.getResponse().message)).toContain('KAYDEDİLMEDİ');
      // Collection, PAYMENT, mahsup, kalem tahsil tutarı, yevmiye, ödeme olayı, çıkış kuyruğu, denetim, fazla ödeme, bekletme, tanı olayı: HEPSİ aynı.
      expect(await snapshot(f)).toEqual(before);
      expect(await reconcile(f)).toEqual([]);

      // Aynı anahtar düzeltilmiş tutarla kullanılabilir (reddedilen istek idempotency kaydı bırakmadı).
      const ok = await create(f, { idempotencyKey: key, amount: 11000, caseDebtorId: f.kesideciCd.id });
      expect(ok).toMatchObject({ status: 'CONFIRMED' });
      expect(await reconcile(f)).toEqual([{ tahsilat: 11000, mahsup: 11000, fazla: 0, bekletilen: 0, uzlasmayan: 0 }]);
    });

    it('tam sığan borçlu belirtilmiş ödeme KORUNUR (kısmi ve kalanı tam kapatan): tahsilat = mahsup; fazla ödeme / bekletme / tanı olayı yok', async () => {
      const f = await fixture('fits', false);
      await create(f, { amount: 4000, caseDebtorId: f.cirantaCd.id }); // kısmi ödeme sığar
      await create(f, { amount: 7000, caseDebtorId: f.kesideciCd.id }); // kalan 7.000'e TAM sığar
      expect(await collected(f)).toEqual({ PRINCIPAL: 10000, CHECK_PENALTY: 1000 });
      expect(await reconcile(f)).toEqual([
        { tahsilat: 4000, mahsup: 4000, fazla: 0, bekletilen: 0, uzlasmayan: 0 },
        { tahsilat: 7000, mahsup: 7000, fazla: 0, bekletilen: 0, uzlasmayan: 0 },
      ]);
      expect(await snapshot(f)).toMatchObject({ collections: 2, ledgerEntries: 2, overpayments: 0, holds: 0 });
      expect(await prisma.icrabotTimelineEntry.count({ where: { tenantId: f.tenantId, type: 'OVERPAYMENT_BLOCKED' } })).toBe(0);
    });

    it('haciz / icra dairesi kanallı elle ödeme de kısmi yazılmaz: kaynak/kanal sinyali "haricî gerçekleşmiş tahsilat" sayılır → TAMAMI bekletilir, deftere yazılmaz', async () => {
      const f = await fixture('seizure', false);
      const created = await create(f, { amount: 12000, channel: 'HACIZ', sourceType: 'BANK_SEIZURE', sourceId: `seizure-${randomUUID()}` });
      expect(created).toMatchObject({ status: 'CONFIRMED' });
      expect(await reconcile(f)).toEqual([{ tahsilat: 12000, mahsup: 0, fazla: 0, bekletilen: 12000, uzlasmayan: 0 }]);
      const hold = await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (created as any).id } });
      expect(hold).toMatchObject({ status: 'HELD', holdReason: 'ON_BEHALF_DEBTOR_NOT_LIABLE' });
      expect((hold.metadata as any).details).toMatchObject({ reasonCode: 'PAYMENT_EXCEEDS_ALLOCATABLE', basis: 'NO_SHARE_OR_CAP_SELECTION', allocatableAmount: 11000, excessAmount: 1000, restrictedSourceOrChannel: true });
      expect(await snapshot(f)).toMatchObject({ ledgerEntries: 0, ledgerAllocations: 0, overpayments: 0, collected: { PRINCIPAL: 0, CHECK_PENALTY: 0 } });
      // Alacağa SIĞAN haciz tahsilatı normal mahsup edilir (mevcut kural değişmedi).
      const fits = await fixture('seizure-fits', false);
      await create(fits, { amount: 5000, channel: 'HACIZ', sourceType: 'BANK_SEIZURE', sourceId: `seizure-${randomUUID()}` });
      expect(await reconcile(fits)).toEqual([{ tahsilat: 5000, mahsup: 5000, fazla: 0, bekletilen: 0, uzlasmayan: 0 }]);
      expect(await prisma.collectionAllocationHold.count({ where: { tenantId: fits.tenantId } })).toBe(0);
    });

    it('haricî kaynaklı gerçekleşmiş tahsilat (banka entegrasyonu, borçlu belirtilmiş) REDDEDİLMEZ: tamamı bekletilir; tamamlama 409 ile reddedilir, bekletme korunur; iptal bekletmeyi kapatır', async () => {
      const f = await fixture('bank', false);
      const userId = await actorUser(f);
      const created = await create(f, { amount: 12000, caseDebtorId: f.cirantaCd.id, sourceType: 'BANK_INTEGRATION', sourceId: `bank-${randomUUID()}` });
      expect(created).toMatchObject({ status: 'CONFIRMED' });
      expect(await reconcile(f)).toEqual([{ tahsilat: 12000, mahsup: 0, fazla: 0, bekletilen: 12000, uzlasmayan: 0 }]);
      expect(await prisma.icrabotTimelineEntry.count({ where: { tenantId: f.tenantId, type: 'PAYMENT_RECEIVED' } })).toBe(1);

      // Borçlu bakiyesi: bekleyen tahsilat nedeniyle ayrı listelenir (kimsenin kalanından düşmez).
      const caseService = Object.assign(Object.create(CaseService.prototype), { prisma }) as CaseService;
      const balances = await caseService.getDebtorLedgerBalances(f.tenantId, f.caseId);
      expect(balances.mahsubuBekleyenTahsilatlar).toEqual([{ collectionId: (created as any).id, tutar: 12000, paraBirimi: 'TRY', sebep: 'PAYMENT_EXCEEDS_ALLOCATABLE' }]);

      // Tamamlama aynı kuralı işlem anında yeniden denetler: aşan tutar hâlâ kalıcı kayda alınamıyor → 409, hiçbir yazma yok.
      const before = await snapshot(f);
      const error = await collections()
        .completeHeldAllocation(f.tenantId, { caseId: f.caseId, collectionId: (created as any).id, caseDebtorId: f.cirantaCd.id, authorizationBasis: 'MEMBERSHIP' }, userId)
        .catch((e) => e);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: 'UNRECONCILED_REMAINDER', unreconciled: { plannedAllocatedAmount: 11000, excessAmount: 1000 } });
      expect(await snapshot(f)).toEqual(before);
      expect((await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (created as any).id } })).status).toBe('HELD');

      // İptal (mevcut yürütücü): bekletme REVERSED; tahsilat yok sayıldı değil, iptal kaydıyla kapandı.
      await prisma.$transaction((tx) =>
        executeCollectionCancelInTransaction(
          tx,
          { domainEventIngestService: domainEvents, journalWriter: journalWriter(), auditService: new AuditService(prisma as any) },
          {
            tenantId: f.tenantId,
            id: (created as any).id,
            dto: { cancelReason: 'unrec bekletme iptali' },
            actorUserId: userId,
            expectedCaseId: f.caseId,
            approvalRequestId: `approval-${randomUUID()}`,
            trace: createCollectionMutationTrace(`corr-${randomUUID()}`, 'approval-unrec'),
          },
        ),
      );
      expect((await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (created as any).id } })).status).toBe('REVERSED');
      expect(await prisma.ledgerEntry.count({ where: { tenantId: f.tenantId } })).toBe(0);
    });

    it('dosya düzeyi (borçlu belirtilmemiş) aşan ödeme DEĞİŞMEDİ: aşan 1.000 dosya düzeyi fazla ödeme olarak ayrılır, denklem tutar', async () => {
      const f = await fixture('file-level', false);
      await create(f, { amount: 12000 });
      expect(await reconcile(f)).toEqual([{ tahsilat: 12000, mahsup: 11000, fazla: 1000, bekletilen: 0, uzlasmayan: 0 }]);
      const over = await prisma.collectionOverpayment.findFirstOrThrow({ where: { caseId: f.caseId } });
      expect(over).toMatchObject({ status: 'HELD', caseDebtorId: null });
      expect(Number(over.amount)).toBe(1000);
    });

    it('eşzamanlılık: ayrı ayrı sığan ama birlikte alacağı aşan iki borçlu belirtilmiş ödeme → biri kesinleşir, diğeri 409; toplam asla alacağı aşmaz, uzlaşmayan yok', async () => {
      const f = await fixture('race-pay', false); // kapasite 11.000
      const outcomes = await Promise.allSettled([
        create(f, { amount: 6000, caseDebtorId: f.kesideciCd.id }),
        create(f, { amount: 6000, caseDebtorId: f.cirantaCd.id }),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason.getStatus()).toBe(409);
      expect(rejected.reason.getResponse()).toMatchObject({ code: 'COLLECTION_DEBTOR_PAYMENT_EXCEEDS_ALLOCATABLE', allocatableAmount: 5000, excessAmount: 1000 });
      expect(await reconcile(f)).toEqual([{ tahsilat: 6000, mahsup: 6000, fazla: 0, bekletilen: 0, uzlasmayan: 0 }]);
      expect(await snapshot(f)).toMatchObject({ collections: 1, ledgerEntries: 1 });
      expect(await collected(f)).toEqual({ PRINCIPAL: 5000, CHECK_PENALTY: 1000 });
    });

    it('önizleme ve kayıt AYNI kararı verir: engel / bekletme uyarısı / uygun; dosya düzeyi ödemede kalan tutar engeli yok', async () => {
      const f = await fixture('preview-remainder', false);
      const preview = new CasePaymentPreviewService(prisma as any, undefined, engine);
      const run = (input: Record<string, unknown>) => preview.preview({ tenantId: f.tenantId, caseId: f.caseId, input: input as any });

      const rejected = await run({ amount: 12000, caseDebtorId: f.kesideciCd.id });
      expect(rejected.acceptance).toMatchObject({ wouldAccept: false, blockingReasons: ['DEBTOR_PAYMENT_EXCEEDS_ALLOCATABLE_NO_SELECTION'] });
      expect(rejected.remainder).toEqual({ allocatableAmount: 11000, excessAmount: 1000, handling: 'REJECTED' });
      // Sunucu aynı koşulu kayıt anında reddeder.
      await expect(create(f, { amount: 12000, caseDebtorId: f.kesideciCd.id })).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'COLLECTION_DEBTOR_PAYMENT_EXCEEDS_ALLOCATABLE' }),
      });

      const fits = await run({ amount: 11000, caseDebtorId: f.kesideciCd.id });
      expect(fits.acceptance.wouldAccept).toBe(true);
      expect(fits.remainder).toBeUndefined();

      const external = await run({ amount: 12000, caseDebtorId: f.kesideciCd.id, sourceType: 'BANK_INTEGRATION' });
      expect(external.acceptance).toMatchObject({ wouldAccept: true, blockingReasons: [] });
      expect(external.acceptance.warnings).toContain('ALLOCATION_HELD_PAYMENT_EXCEEDS_ALLOCATABLE');
      expect(external.remainder).toEqual({ allocatableAmount: 11000, excessAmount: 1000, handling: 'ALLOCATION_HELD' });
      expect(external.balanceImpact.appliedAmount).toBe(0);
      expect(external.distributionPreview.status).toBe('BLOCKED');

      const fileLevel = await run({ amount: 12000 });
      expect(fileLevel.remainder).toBeUndefined();
      expect(fileLevel.acceptance.blockingReasons).toEqual([]);
    });
  });

  /** K3-L kaynak kimlikleri (owner GO §3): gönderen / ileten / hesabına ödeme yapılan borçlu ayrı; tekrar güvenli. */
  describe('kaynak kimlikleri', () => {
    it('gönderen ve ileten icra dairesi kaydedilir, borçlu kimliğine dönüşmez; olay payload\'ında ayrı; aynı komut replay, farklı gönderen SEMANTIC_CONFLICT', async () => {
      const f = await fixture('identities');
      const dto = {
        caseId: f.caseId,
        idempotencyKey: `k3l-ident-${randomUUID()}`,
        amount: 400,
        currency: 'TRY',
        type: CollectionType.OTHER,
        channel: 'ICRA_DAIRESI',
        date: '2026-09-21T09:00:00.000Z',
        caseDebtorId: f.cirantaCd.id,
        payerName: 'Üçüncü Kişi Ltd.',
        forwardingOfficeName: 'Ankara 5. İcra Dairesi',
      } as unknown as CreateCollectionDto;
      const created = await collections().create(f.tenantId, dto, `actor-${f.tenantId}`);
      const row = await prisma.collection.findUniqueOrThrow({ where: { id: (created as any).id } });
      expect(row).toMatchObject({ caseDebtorId: f.cirantaCd.id, payerName: 'Üçüncü Kişi Ltd.', forwardingOfficeName: 'Ankara 5. İcra Dairesi' });
      // Mahsup hesabına ödeme yapılan borçluya (ciranta → yalnız bedel); gönderen adı mahsubu etkilemez
      expect(await collected(f)).toEqual({ PRINCIPAL: 400, CHECK_PENALTY: 0 });
      const event = await prisma.icrabotTimelineEntry.findFirst({
        where: { tenantId: f.tenantId, type: 'PAYMENT_RECEIVED', body: { path: ['payload', 'collectionId'], equals: (created as any).id } },
        select: { body: true },
      });
      expect((event?.body as any)?.payload).toMatchObject({ forDebtorId: f.cirantaCd.id, payerName: 'Üçüncü Kişi Ltd.', forwardingOfficeName: 'Ankara 5. İcra Dairesi' });
      expect(String(row.commandCanonicalPayload)).toContain('payerNameDigest');
      expect(String(row.commandCanonicalPayload)).not.toContain('Üçüncü Kişi');

      const replay = await collections().create(f.tenantId, dto, `actor-${f.tenantId}`);
      expect((replay as any).id).toBe((created as any).id);
      expect(await prisma.collection.count({ where: { caseId: f.caseId } })).toBe(1);
      await expect(
        collections().create(f.tenantId, { ...dto, payerName: 'Başka Gönderen' } as CreateCollectionDto, `actor-${f.tenantId}`),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: expect.stringContaining('SEMANTIC_CONFLICT') }) });
      expect(await prisma.collection.count({ where: { caseId: f.caseId } })).toBe(1);
    });
  });

});
