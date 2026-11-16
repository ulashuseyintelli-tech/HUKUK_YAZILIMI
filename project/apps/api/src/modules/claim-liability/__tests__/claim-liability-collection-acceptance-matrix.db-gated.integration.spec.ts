import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';
import { AuditService } from '../../audit/audit.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { CasePaymentPreviewService } from '../../case/case-payment-preview.service';
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
 * SEÇİMLİK BORÇLU SORUMLULUĞU — TAHSİLAT / MAHSUP KABUL MATRİSİ (F02 GO-COMPLETE 16.11.2026, madde 3).
 * Gerçek CollectionService + SummaryEngine (TBK100) + ödeme önizlemesi + iptal yürütücüsü + disposable PostgreSQL. Tutarlar SENTETİKTİR.
 *
 * Her ödemede ortak kurallar (yardımcılar):
 *  - ÖNİZLEME ↔ KESİNLEŞTİRME: önizlemenin uygulanan / fazla ödeme / bekletme sonucu, kayıtta oluşan sonuçla kuruşu kuruşuna aynı; önizleme
 *    elle girilen ödemeyi reddediyorsa kayıt da reddedilir ve hiçbir satır kalmaz.
 *  - UZLAŞMA: tahsilat = mahsup (defter dağıtımı) + kalıcı fazla ödeme (HELD) + bekletilen (HELD); aynı tutar iki kategoride sayılmaz.
 *  - Kalem sayacı = borçlu atıfları + atıfsız (okuma modeli); borçlu atfı kapasiteyi (pay / tavan) aşmaz.
 * Her iptalde: tahsilat CANCELLED; özgün defter kaydı varsa tutarı ve dağıtımları ters işaretli TERS kayıt; kalem sayaçları ödeme
 * öncesine döner; fazla ödeme ve bekletme REVERSED; yevmiye: kayıt + iptal girişleri hesap bazında net sıfır.
 *
 * Kapsam: belirlenmedi, müteselsil (tek / iki borçlu), paylı, tutarla sınırlı (tek / iki borçlu); kısmi, kapatan ve sınırı aşan ödeme;
 * borçlu belirtilen ve dosya düzeyindeki ödeme; haricî kaynak (haciz) bekletmesi; iptal; eşzamanlılık ve tekrar istek; bayrak kapalıyken
 * mevcut seçimin korunması. COL/OD-19 dar istisnası GENİŞLETİLMEZ (seçimsiz / müteselsil dosyada aşan elle ödeme reddedilir).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('Claim liability collection acceptance matrix requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const FLAG = 'CLAIM_LIABILITY_SELECTION_ENABLED';
/** İsteğe bağlı kanıt dökümü: yalnız bu ortam değişkeni verilirse matris satırları JSON olarak yazılır (CI'da yazılmaz). */
const MATRIX_OUT = process.env.LIAB_MATRIX_OUT;

type Breakdown = { mahsup: number; fazla: number; bekletilen: number };
type MatrixRow = { senaryo: string; adim: string; tutar: number; borclu: string; sonuc: string } & Partial<Breakdown>;

describeWithDisposableDb('Seçimlik borçlu sorumluluğu — tahsilat / mahsup kabul matrisi (disposable PostgreSQL)', () => {
  jest.setTimeout(240_000);
  let prisma: PrismaClient;
  let engine: SummaryEngineService;
  const matrix: MatrixRow[] = [];
  const previousFlag = process.env[FLAG];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    engine = new SummaryEngineService(prisma as never, new TBK100AllocatorService());
    await engine.onModuleInit();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (previousFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previousFlag;
    if (MATRIX_OUT) fs.writeFileSync(MATRIX_OUT, JSON.stringify(matrix, null, 2));
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
  const previewService = () => new CasePaymentPreviewService(prisma as any, undefined, engine);

  async function fixture(label: string, amount: number, debtorCount: number) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-liab-mtx-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `LIAB MTX ${label}`, slug: tenantId } });
    const client = await prisma.client.create({ data: { tenantId, displayName: 'Alacaklı', type: 'COMPANY' } as never });
    const legalCase = await prisma.case.create({
      data: { tenantId, clientId: client.id, fileNumber: `MTX-${suffix}`, type: 'GENERAL_EXECUTION', caseStatus: 'DERDEST', status: 'ACTIVE', currency: 'TRY' } as never,
    });
    const debtors: Array<{ caseDebtorId: string; debtorId: string }> = [];
    for (let index = 1; index <= debtorCount; index += 1) {
      const debtor = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: `Sentetik Borçlu ${index}` } as never });
      const caseDebtor = await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: debtor.id, role: 'ASIL_BORCLU' } });
      debtors.push({ caseDebtorId: caseDebtor.id, debtorId: debtor.id });
    }
    const item = await prisma.claimItem.create({
      data: {
        tenantId,
        caseId: legalCase.id,
        itemType: 'PRINCIPAL',
        originalAmount: amount,
        demandedAmount: amount,
        amount,
        currency: 'TRY',
        interestAccrualStatus: 'NO_INTEREST',
        liableDebtorIds: [],
        sortOrder: 1,
      },
    });
    return { label, tenantId, caseId: legalCase.id, itemId: item.id, debtors, b1: debtors[0], b2: debtors[1] };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  /** Onaylanmış seçimin bıraktığı kayıtlar (seçim komutları ayrı testte): etkin sürüm + kalemdeki izdüşüm. */
  async function select(
    f: Fixture,
    mode: ClaimLiabilityModeValue,
    parties: Array<{ caseDebtorId: string; debtorId: string; shareWeight?: number; limitAmount?: number; unlimited?: boolean }>,
  ) {
    await prisma.claimItemLiabilitySet.create({
      data: {
        tenantId: f.tenantId,
        caseId: f.caseId,
        claimItemId: f.itemId,
        version: 1,
        mode,
        limitScope: mode === 'CAPPED' ? 'ITEM_AMOUNT' : null,
        basis: 'COURT_JUDGMENT',
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
    await prisma.claimItem.update({ where: { id: f.itemId }, data: legacyProjection(mode, parties.map((party) => party.debtorId)) });
  }

  const debtorLabel = (f: Fixture, caseDebtorId?: string) =>
    caseDebtorId ? `B${f.debtors.findIndex((debtor) => debtor.caseDebtorId === caseDebtorId) + 1}` : 'dosya düzeyi';

  async function breakdownOf(collectionId: string): Promise<Breakdown> {
    const row = await prisma.collection.findUniqueOrThrow({
      where: { id: collectionId },
      include: { overpayment: true, allocationHold: true, ledgerEntries: { where: { entryType: 'PAYMENT', status: 'CONFIRMED' }, include: { allocations: true } } },
    });
    const mahsup = row.ledgerEntries.flatMap((entry) => entry.allocations).reduce((sum, allocation) => sum + toKurus(allocation.amount), 0n);
    const fazla = row.overpayment && row.overpayment.status === 'HELD' ? toKurus(row.overpayment.amount) : 0n;
    const bekletilen = row.allocationHold && row.allocationHold.status === 'HELD' ? toKurus(row.allocationHold.amount) : 0n;
    // UZLAŞMA: kuruşu kuruşuna; aynı tutar iki kategoride sayılırsa toplam tutarı aşar.
    expect({ id: row.id, toplam: mahsup + fazla + bekletilen }).toEqual({ id: row.id, toplam: toKurus(row.amount) });
    return { mahsup: fromKurus(mahsup), fazla: fromKurus(fazla), bekletilen: fromKurus(bekletilen) };
  }

  /** Kalem görünümü: tek sayaç (C), ortak kalan (R), borçlu kalanları ve atıflar; okuma modeli uzlaşmasını da denetler. */
  async function view(f: Fixture) {
    const items = await prisma.claimItem.findMany({ where: { caseId: f.caseId } });
    const context = await loadCaseLiabilityContext(prisma, { tenantId: f.tenantId, caseId: f.caseId, items, always: true });
    const evaluation = context.evaluations.get(f.itemId)!;
    expect(evaluation.attribution.totalKurus).toBe(evaluation.collectedKurus);
    const label = new Map(f.debtors.map((debtor, index) => [debtor.debtorId, `B${index + 1}`]));
    return {
      C: fromKurus(evaluation.collectedKurus),
      R: fromKurus(evaluation.remainingKurus),
      kalan: Object.fromEntries(evaluation.parties.map((party) => [label.get(party.debtorId)!, party.remainingLiabilityKurus === null ? null : fromKurus(party.remainingLiabilityKurus)])),
      A: Object.fromEntries([...evaluation.attribution.byDebtor].filter(([, kurus]) => kurus !== 0n).map(([debtorId, kurus]) => [label.get(debtorId) ?? debtorId, fromKurus(kurus)])),
      uzlasiyor: evaluation.reconciled,
    };
  }

  const dto = (f: Fixture, amount: number, caseDebtorId?: string, extra: Partial<CreateCollectionDto> = {}) =>
    ({
      caseId: f.caseId,
      idempotencyKey: `liab-mtx-${randomUUID()}`,
      amount,
      currency: 'TRY',
      type: CollectionType.BANK_TRANSFER,
      date: '2026-09-20T09:00:00.000Z',
      ...(caseDebtorId ? { caseDebtorId } : {}),
      ...extra,
    }) as CreateCollectionDto;

  /**
   * Önizle → kaydet → karşılaştır. Dönüş: kayıt kimliği (reddedildiyse null) ve kategori dağılımı.
   * Önizleme kuralı (CasePaymentPreviewService): bekletme durumunda uygulanan 0 ve tamamı bekletilir; aksi hâlde uygulanan + fazla ödeme.
   */
  async function step(f: Fixture, adim: string, amount: number, caseDebtorId?: string, extra: Partial<CreateCollectionDto> = {}) {
    const previewed = await previewService().preview({
      tenantId: f.tenantId,
      caseId: f.caseId,
      input: { amount, ...(caseDebtorId ? { caseDebtorId } : {}), ...(extra.channel ? { channel: extra.channel } : {}) } as any,
    });
    const warnings = previewed.acceptance.warnings;
    const held = warnings.some((code) => code.startsWith('ALLOCATION_HELD'));
    const restrictedBlock = previewed.acceptance.blockingReasons.includes('LIABILITY_LIMIT_EXCEEDED_RESTRICTED_SOURCE');
    const before = await prisma.collection.count({ where: { caseId: f.caseId } });
    let created: any;
    try {
      created = await collections().create(f.tenantId, dto(f, amount, caseDebtorId, extra), `actor-${f.tenantId}`);
    } catch (error: any) {
      // Önizleme reddettiyse kayıt da reddedilir; hiçbir satır kalmaz.
      expect(previewed.acceptance.wouldAccept).toBe(false);
      expect(await prisma.collection.count({ where: { caseId: f.caseId } })).toBe(before);
      const code = (error?.getResponse?.() as any)?.code ?? error?.message;
      matrix.push({ senaryo: f.label, adim, tutar: amount, borclu: debtorLabel(f, caseDebtorId), sonuc: `REDDEDİLDİ (${code})` });
      return { id: null as string | null, code, breakdown: null as Breakdown | null, preview: previewed };
    }
    const breakdown = await breakdownOf(created.id);
    if (held || restrictedBlock) {
      // Haricî kaynak sınır aşımı ya da borçlu atfı gerekli: kayıt yapılır, TAMAMI bekletilir.
      expect(breakdown).toEqual({ mahsup: 0, fazla: 0, bekletilen: amount });
    } else {
      expect(previewed.acceptance.wouldAccept).toBe(true);
      expect(breakdown).toEqual({ mahsup: previewed.balanceImpact.appliedAmount, fazla: previewed.balanceImpact.overpaymentAmount, bekletilen: 0 });
    }
    matrix.push({ senaryo: f.label, adim, tutar: amount, borclu: debtorLabel(f, caseDebtorId), sonuc: 'KAYIT', ...breakdown });
    return { id: created.id as string, code: null, breakdown, preview: previewed };
  }

  async function cancelAndVerify(f: Fixture, collectionId: string, adim: string) {
    const original = await prisma.collection.findUniqueOrThrow({
      where: { id: collectionId },
      include: { ledgerEntries: { where: { entryType: 'PAYMENT' }, include: { allocations: true } } },
    });
    const itemBefore = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.itemId } });
    const allocatedToItem = original.ledgerEntries
      .flatMap((entry) => entry.allocations)
      .filter((allocation) => allocation.claimItemId === f.itemId)
      .reduce((sum, allocation) => sum + toKurus(allocation.amount), 0n);

    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({ data: { tenantId: f.tenantId, email: `mtx-${suffix}@example.test`, name: 'İptal', surname: 'Aktörü' } });
    const lawyer = await prisma.lawyer.create({ data: { tenantId: f.tenantId, userId: user.id, name: 'İptal', surname: 'Aktörü' } });
    await prisma.caseLawyer.create({ data: { caseId: f.caseId, lawyerId: lawyer.id } });
    await prisma.$transaction((tx) =>
      executeCollectionCancelInTransaction(
        tx,
        { domainEventIngestService: domainEvents, journalWriter: journalWriter(), auditService: new AuditService(prisma as any) },
        {
          tenantId: f.tenantId,
          id: collectionId,
          dto: { cancelReason: 'sentetik iptal' },
          actorUserId: user.id,
          expectedCaseId: f.caseId,
          approvalRequestId: `approval-${randomUUID()}`,
          trace: createCollectionMutationTrace(`corr-${randomUUID()}`, 'approval-liab-mtx'),
        },
      ),
    );

    const after = await prisma.collection.findUniqueOrThrow({
      where: { id: collectionId },
      include: { overpayment: true, allocationHold: true, ledgerEntries: { include: { allocations: true } } },
    });
    expect(after.status).toBe('CANCELLED');
    const payment = after.ledgerEntries.find((entry) => entry.entryType === 'PAYMENT');
    const reversal = after.ledgerEntries.find((entry) => entry.entryType === 'REVERSAL');
    if (payment) {
      // Ters kayıt: özgün tutarın ve her dağıtımın tam tersi.
      expect(reversal).toBeDefined();
      expect(reversal!.reversesLedgerEntryId).toBe(payment.id);
      expect(toKurus(reversal!.amount)).toBe(-toKurus(payment.amount));
      const net = new Map<string, bigint>();
      for (const allocation of [...payment.allocations, ...reversal!.allocations]) {
        net.set(allocation.claimItemId, (net.get(allocation.claimItemId) ?? 0n) + toKurus(allocation.amount));
      }
      expect([...net.values()].every((value) => value === 0n)).toBe(true);
    } else {
      expect(reversal).toBeUndefined();
    }
    if (after.overpayment) expect(after.overpayment).toMatchObject({ status: 'REVERSED' });
    if (after.allocationHold) expect(after.allocationHold).toMatchObject({ status: 'REVERSED' });
    // Kalem sayacı yalnız bu tahsilatın dağıtımı kadar geri döner.
    const itemAfter = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.itemId } });
    expect(toKurus(itemAfter.collectedAmount ?? 0)).toBe(toKurus(itemBefore.collectedAmount ?? 0) - allocatedToItem);
    // Yevmiye: kayıt + iptal girişleri hesap bazında net sıfır ve iptal girişi özgün girişin tersi olarak bağlı.
    const journals = await prisma.accountingJournalEntry.findMany({
      where: { tenantId: f.tenantId, sourceType: 'COLLECTION', sourceId: collectionId },
      include: { lines: true },
    });
    expect(journals.length).toBeGreaterThanOrEqual(2);
    const byAccount = new Map<string, bigint>();
    for (const line of journals.flatMap((entry) => entry.lines)) {
      const signed = (line.direction === 'DEBIT' ? 1n : -1n) * toKurus(line.amount);
      byAccount.set(line.accountCode, (byAccount.get(line.accountCode) ?? 0n) + signed);
    }
    expect([...byAccount.entries()].filter(([, value]) => value !== 0n)).toEqual([]);
    matrix.push({ senaryo: f.label, adim, tutar: Number(original.amount), borclu: '—', sonuc: 'İPTAL: ters kayıtlar doğrulandı' });
  }

  it('M1 belirlenmedi (seçim yok, iki borçlu): kısmi + dosya düzeyi + kapatan ödeme; aşan elle ödeme reddedilir; iptal', async () => {
    const f = await fixture('M1-belirlenmedi', 5000, 2);
    expect((await step(f, 'kısmi', 1200, f.b1.caseDebtorId)).breakdown).toEqual({ mahsup: 1200, fazla: 0, bekletilen: 0 });
    expect((await step(f, 'dosya düzeyi', 800)).breakdown).toEqual({ mahsup: 800, fazla: 0, bekletilen: 0 });
    const rejected = await step(f, 'aşan (borçlu belirtilmiş)', 3500, f.b2.caseDebtorId);
    expect(rejected.id).toBeNull();
    expect(rejected.code).toBe('COLLECTION_DEBTOR_PAYMENT_EXCEEDS_ALLOCATABLE');
    const closing = await step(f, 'kapatan', 3000, f.b2.caseDebtorId);
    expect(closing.breakdown).toEqual({ mahsup: 3000, fazla: 0, bekletilen: 0 });
    expect((await view(f))).toMatchObject({ C: 5000, R: 0, kalan: {} });
    await cancelAndVerify(f, closing.id!, 'kapatanı iptal');
    expect((await view(f))).toMatchObject({ C: 2000, R: 3000 });
  });

  it('M2 müteselsil tek borçlu: kısmi + dosya düzeyi + kapatan; kapandıktan sonra ödeme reddedilir (istisna genişletilmez); iptal', async () => {
    const f = await fixture('M2-muteselsil-tek', 4000, 1);
    await select(f, 'JOINT_AND_SEVERAL', [f.b1]);
    expect((await step(f, 'kısmi', 1000, f.b1.caseDebtorId)).breakdown).toEqual({ mahsup: 1000, fazla: 0, bekletilen: 0 });
    expect((await step(f, 'dosya düzeyi', 500)).breakdown).toEqual({ mahsup: 500, fazla: 0, bekletilen: 0 });
    const closing = await step(f, 'kapatan', 2500, f.b1.caseDebtorId);
    expect(closing.breakdown).toEqual({ mahsup: 2500, fazla: 0, bekletilen: 0 });
    expect(await view(f)).toMatchObject({ C: 4000, R: 0, kalan: { B1: 0 } });
    const after = await step(f, 'kapandıktan sonra', 100, f.b1.caseDebtorId);
    expect(after.id).toBeNull();
    await cancelAndVerify(f, closing.id!, 'kapatanı iptal');
    expect(await view(f)).toMatchObject({ C: 1500, R: 2500, kalan: { B1: 2500 } });
  });

  it('M3 müteselsil iki borçlu: her biri ortak kalandan sorumlu; kapatan ödeme; aşan elle ödeme reddedilir; iptal', async () => {
    const f = await fixture('M3-muteselsil-iki', 10000, 2);
    await select(f, 'JOINT_AND_SEVERAL', [f.b1, f.b2]);
    await step(f, 'B1 kısmi', 4000, f.b1.caseDebtorId);
    expect(await view(f)).toMatchObject({ C: 4000, R: 6000, kalan: { B1: 6000, B2: 6000 } });
    const closing = await step(f, 'B2 kapatan', 6000, f.b2.caseDebtorId);
    expect(closing.breakdown).toEqual({ mahsup: 6000, fazla: 0, bekletilen: 0 });
    expect(await view(f)).toMatchObject({ C: 10000, R: 0, kalan: { B1: 0, B2: 0 }, A: { B1: 4000, B2: 6000 } });
    expect((await step(f, 'B1 aşan', 1, f.b1.caseDebtorId)).id).toBeNull();
    await cancelAndVerify(f, closing.id!, 'B2 kapatanı iptal');
    expect(await view(f)).toMatchObject({ C: 4000, R: 6000, kalan: { B1: 6000, B2: 6000 }, A: { B1: 4000 } });
  });

  it('M4 paylı 1/1: pay içi kısmi + payı kapatan + payı aşan (fazla ödeme) + dosya düzeyi (bekletme); iptaller', async () => {
    const f = await fixture('M4-payli', 8000, 2);
    await select(f, 'PROPORTIONAL', [{ ...f.b1, shareWeight: 1 }, { ...f.b2, shareWeight: 1 }]);
    await step(f, 'B1 kısmi', 1500, f.b1.caseDebtorId);
    const shareClosing = await step(f, 'B1 payı kapatan', 2500, f.b1.caseDebtorId);
    expect(shareClosing.breakdown).toEqual({ mahsup: 2500, fazla: 0, bekletilen: 0 });
    expect(await view(f)).toMatchObject({ C: 4000, R: 4000, kalan: { B1: 0, B2: 4000 } });
    const over = await step(f, 'B2 payı aşan', 5000, f.b2.caseDebtorId);
    expect(over.breakdown).toEqual({ mahsup: 4000, fazla: 1000, bekletilen: 0 });
    expect(await prisma.collectionOverpayment.findUniqueOrThrow({ where: { collectionId: over.id! } })).toMatchObject({ caseDebtorId: f.b2.caseDebtorId, status: 'HELD' });
    const fileLevel = await step(f, 'dosya düzeyi', 300);
    expect(fileLevel.breakdown).toEqual({ mahsup: 0, fazla: 0, bekletilen: 300 });
    expect(await view(f)).toMatchObject({ C: 8000, R: 0, kalan: { B1: 0, B2: 0 } });
    await cancelAndVerify(f, over.id!, 'B2 aşanı iptal');
    expect(await view(f)).toMatchObject({ C: 4000, R: 4000, kalan: { B1: 0, B2: 4000 } });
    await cancelAndVerify(f, fileLevel.id!, 'dosya düzeyini iptal');
    expect(await prisma.collectionAllocationHold.count({ where: { caseId: f.caseId, status: 'HELD' } })).toBe(0);
  });

  it('M5 tutarla sınırlı tek borçlu (tavan 3.000 / kalem 9.000): kısmi + tavanı kapatan + aşan + dosya düzeyi + haciz bekletmesi; iptaller', async () => {
    const f = await fixture('M5-tavan-tek', 9000, 1);
    await select(f, 'CAPPED', [{ ...f.b1, limitAmount: 3000 }]);
    await step(f, 'kısmi', 1000, f.b1.caseDebtorId);
    const capClosing = await step(f, 'tavanı kapatan', 2000, f.b1.caseDebtorId);
    expect(capClosing.breakdown).toEqual({ mahsup: 2000, fazla: 0, bekletilen: 0 });
    expect(await view(f)).toMatchObject({ C: 3000, R: 6000, kalan: { B1: 0 } });
    const over = await step(f, 'tavanı aşan', 500, f.b1.caseDebtorId);
    expect(over.breakdown).toEqual({ mahsup: 0, fazla: 500, bekletilen: 0 });
    const fileLevel = await step(f, 'dosya düzeyi', 400);
    expect(fileLevel.breakdown).toEqual({ mahsup: 0, fazla: 0, bekletilen: 400 });
    const seizure = await step(f, 'haciz (tavan dolu)', 700, f.b1.caseDebtorId, { channel: 'HACIZ' as never });
    expect(seizure.breakdown).toEqual({ mahsup: 0, fazla: 0, bekletilen: 700 });
    expect(await view(f)).toMatchObject({ C: 3000, R: 6000, kalan: { B1: 0 }, A: { B1: 3000 } });
    await cancelAndVerify(f, over.id!, 'aşanı iptal');
    await cancelAndVerify(f, seizure.id!, 'haciz bekletmesini iptal');
    await cancelAndVerify(f, capClosing.id!, 'tavanı kapatanı iptal');
    expect(await view(f)).toMatchObject({ C: 1000, R: 8000, kalan: { B1: 2000 }, A: { B1: 1000 } });
  });

  it('M6 tutarla sınırlı iki borçlu (B1 tavansız, B2 tavan 2.000 / kalem 6.000): aşan ödeme yalnız ödeyen borçluda; kapatan; iptal', async () => {
    const f = await fixture('M6-tavan-iki', 6000, 2);
    await select(f, 'CAPPED', [{ ...f.b1, unlimited: true }, { ...f.b2, limitAmount: 2000 }]);
    const over = await step(f, 'B2 tavanı aşan', 2500, f.b2.caseDebtorId);
    expect(over.breakdown).toEqual({ mahsup: 2000, fazla: 500, bekletilen: 0 });
    expect(await view(f)).toMatchObject({ C: 2000, R: 4000, kalan: { B1: 4000, B2: 0 } });
    const closing = await step(f, 'B1 kapatan', 4000, f.b1.caseDebtorId);
    expect(closing.breakdown).toEqual({ mahsup: 4000, fazla: 0, bekletilen: 0 });
    expect(await view(f)).toMatchObject({ C: 6000, R: 0, kalan: { B1: 0, B2: 0 } });
    await cancelAndVerify(f, over.id!, 'B2 aşanı iptal');
    expect(await view(f)).toMatchObject({ C: 4000, R: 2000, kalan: { B1: 2000, B2: 2000 }, A: { B1: 4000 } });
  });

  it('M7 eşzamanlılık (tavan 3.000): iki eşzamanlı 2.000 → toplam mahsup 3.000 + fazla 1.000; aynı anahtarla eşzamanlı tekrar → tek kayıt', async () => {
    const f = await fixture('M7-eszamanli', 9000, 1);
    await select(f, 'CAPPED', [{ ...f.b1, limitAmount: 3000 }]);
    const results = await Promise.all([
      collections().create(f.tenantId, dto(f, 2000, f.b1.caseDebtorId), `actor-${f.tenantId}`),
      collections().create(f.tenantId, dto(f, 2000, f.b1.caseDebtorId), `actor-${f.tenantId}`),
    ]);
    const breakdowns = await Promise.all(results.map((row: any) => breakdownOf(row.id)));
    expect(breakdowns.reduce((sum, row) => sum + row.mahsup, 0)).toBe(3000);
    expect(breakdowns.reduce((sum, row) => sum + row.fazla, 0)).toBe(1000);
    expect(await view(f)).toMatchObject({ C: 3000, kalan: { B1: 0 }, A: { B1: 3000 }, uzlasiyor: true });
    matrix.push({ senaryo: f.label, adim: 'eşzamanlı 2 × 2.000', tutar: 4000, borclu: 'B1', sonuc: 'KAYIT ×2', mahsup: 3000, fazla: 1000, bekletilen: 0 });

    const key = `liab-mtx-replay-${randomUUID()}`;
    const replay = await Promise.allSettled([
      collections().create(f.tenantId, dto(f, 700, f.b1.caseDebtorId, { idempotencyKey: key }), `actor-${f.tenantId}`),
      collections().create(f.tenantId, dto(f, 700, f.b1.caseDebtorId, { idempotencyKey: key }), `actor-${f.tenantId}`),
    ]);
    const ids = new Set(replay.filter((r) => r.status === 'fulfilled').map((r: any) => r.value.id));
    expect(ids.size).toBe(1);
    expect(await prisma.collection.count({ where: { caseId: f.caseId, idempotencyKey: key } })).toBe(1);
    const sequential = await collections().create(f.tenantId, dto(f, 700, f.b1.caseDebtorId, { idempotencyKey: key }), `actor-${f.tenantId}`);
    expect(ids.has((sequential as any).id)).toBe(true);
    expect(await breakdownOf((sequential as any).id)).toEqual({ mahsup: 0, fazla: 700, bekletilen: 0 });
    expect(await prisma.collectionOverpayment.count({ where: { caseId: f.caseId } })).toBe(2);
    matrix.push({ senaryo: f.label, adim: 'aynı anahtarla eşzamanlı + sıralı tekrar', tutar: 700, borclu: 'B1', sonuc: 'TEK KAYIT', mahsup: 0, fazla: 700, bekletilen: 0 });
  });

  it('M8 bayrak KAPALI: mevcut onaylı paylı seçim ve sınırları korunur (aşan tutar yine fazla ödeme; başka borçluya geçmez); iptal', async () => {
    const f = await fixture('M8-bayrak-kapali', 6000, 2);
    await select(f, 'PROPORTIONAL', [{ ...f.b1, shareWeight: 1 }, { ...f.b2, shareWeight: 1 }]);
    process.env[FLAG] = 'false';
    try {
      const over = await step(f, 'B1 payı aşan (bayrak kapalı)', 4000, f.b1.caseDebtorId);
      expect(over.breakdown).toEqual({ mahsup: 3000, fazla: 1000, bekletilen: 0 });
      expect(await view(f)).toMatchObject({ C: 3000, R: 3000, kalan: { B1: 0, B2: 3000 } });
      expect(await prisma.claimItemLiabilitySet.count({ where: { claimItemId: f.itemId, status: 'ACTIVE' } })).toBe(1);
      await cancelAndVerify(f, over.id!, 'iptal (bayrak kapalı)');
      expect(await view(f)).toMatchObject({ C: 0, R: 6000, kalan: { B1: 3000, B2: 3000 } });
    } finally {
      process.env[FLAG] = 'true';
    }
  });
});
