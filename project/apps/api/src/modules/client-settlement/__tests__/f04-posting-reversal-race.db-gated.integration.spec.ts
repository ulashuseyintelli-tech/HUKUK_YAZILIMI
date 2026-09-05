/**
 * F04 — posting / cancellation / reversal yarisi: GERCEK PostgreSQL regresyonu.
 *
 * Neyi kanitlar:
 *  1) Posting'in transaction DISI CONFIRMED okumasindan SONRA iptal commit ederse, reversal
 *     consumer hic kosmasa bile posting HIC finansal etki birakamaz (kilitli okuma reddeder).
 *  2) Posting once kazanirsa, bayat pre-post goruntusuyle gelen reversal POSTED'i EZEMEZ;
 *     CAS kaybeder, durumu yeniden degerlendirir ve POSTED tersleme yolu isler
 *     (journal storno + manualReversalRequiredAt + reimbursement REVERSAL).
 *  3) Tekrarlanan PAYMENT_REVERSED kalici cift finansal etki uretmez.
 *  4) computeExpenseRemaining her iki sirada da beklenen Decimal sonucu verir.
 *
 * Yontem: iki AYRI baglanti (ayri PrismaClient) + servis cagrisinin ICINDEN tetiklenen
 * bariyerler. Sleep YOK — sira, gercek servis adimlarina baglanan spy'larla kurulur.
 * Test icinde is mantigi KOPYALANMAZ: post() ve reverseFromPaymentReversed() gercek
 * servislerdir; spy yalniz ZAMANLAMA bariyeridir, dondurdugu deger gercek metodun kendi
 * sonucudur.
 */
import { BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AccountingJournalWriterService } from '../../accounting-journal';
import { executeCollectionCancelInTransaction } from '../../collection/collection-cancel-executor';
import { clientOffsetLockKey } from '../expense-remaining-lock';
import { payoutLockKey } from '../payout-lock';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest/domain-event-ingest.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';
import { CollectionReversalService } from '../collection-reversal.service';
import { DispositionPostingService } from '../disposition-posting.service';

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (TEST_DATABASE_URL) {
  const target = new URL(TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('F04_RACE_TEST_DATABASE_MUST_BE_LOCAL_POSTGRESQL');
  }
}
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('F04_RACE_TEST_DATABASE_REQUIRED: CI requires TEST_DATABASE_URL');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;

const D = (n: string | number) => new Prisma.Decimal(n);

interface Scenario {
  tenantId: string;
  caseId: string;
  clientId: string;
  caseClientId: string;
  userId: string;
  collectionId: string;
  dispositionId: string;
  lineId: string;
  /** CLIENT_PAYABLE satiri (yalniz withPayableLine ile kurulur) — allocation bu satira baglanir. */
  payableLineId: string | null;
  expenseRequestId: string;
  approvalRequestId: string;
}

describeWithDatabase('F04: posting / cancellation / reversal race on real PostgreSQL', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaService;      // servislerin kullandigi baglanti
  let sideChannel: PrismaClient;  // bariyerler icin AYRI baglanti
  let observer: PrismaClient;     // pg_locks gozlemi icin UCUNCU baglanti
  let posting: DispositionPostingService;
  let reversal: CollectionReversalService;
  let readService: ClientSettlementReadService;
  const createdTenants: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    sideChannel = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL as string } } });
    await sideChannel.$connect();
    observer = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL as string } } });
    await observer.$connect();

    const audit = new AuditService(prisma);
    const officeApproval = new OfficeApprovalService(prisma, audit);
    readService = new ClientSettlementReadService(prisma);
    posting = new DispositionPostingService(prisma, officeApproval, readService);
    reversal = new CollectionReversalService(prisma);
  });

  afterAll(async () => {
    // Fixture temizligi: yalniz bu spec'in urettigi tenant'lar.
    for (const tenantId of createdTenants) {
      await sideChannel.$executeRawUnsafe(
        'DELETE FROM "Tenant" WHERE "id" = $1', tenantId,
      ).catch(() => undefined);
    }
    await prisma.$disconnect();
    await sideChannel.$disconnect();
    await observer.$disconnect();
  });

  /**
   * Deadlock (40P01) veya transaction timeout izi. Bu hatalar F04 testlerinde ASLA
   * "normal is kurali reddi" sayilmaz: kilit tasarimi kusurunun isaretidir.
   */
  function lockFailureReason(error: unknown): string | null {
    if (!error) return null;
    const text = `${(error as { code?: string }).code ?? ''} ${(error as Error).message ?? ''}`;
    if (/40P01|deadlock detected/i.test(text)) return 'DEADLOCK';
    if (/Transaction API error|transaction .*(timeout|timed out)|P2028/i.test(text)) return 'TX_TIMEOUT';
    return null;
  }

  /** Verilen transaction'in backend PID'i. */
  async function backendPid(tx: { $queryRawUnsafe: <T>(q: string) => Promise<T> }): Promise<number> {
    const rows = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid()::int AS pid');
    return Number(rows[0].pid);
  }

  /** Hazir sinyalinden once biten/hata alan transaction, bariyeri sonsuza dek bekletemez. */
  async function waitForReady<T>(ready: Promise<T>, work: Promise<unknown>, label: string): Promise<T> {
    return Promise.race([
      ready,
      work.then(() => { throw new Error(`${label}: transaction hazir sinyalinden once sonuclandi`); }),
    ]);
  }

  /**
   * waiterPid'in TAM OLARAK blockerPid tarafindan bloke edildigini dogrular.
   * "Herhangi bir NOT granted kilit" YETERLI SAYILMAZ: iliski pg_blocking_pids ile kurulur.
   * Sabit sure beklemez; kosul saglanana kadar event-loop'a yield eder.
   */
  async function waitUntilBlockedBy(waiterPid: number, blockerPid: number): Promise<void> {
    for (let i = 0; i < 1000; i += 1) {
      const rows = await observer.$queryRawUnsafe<Array<{ blockers: number[] }>>(
        `SELECT COALESCE(pg_blocking_pids(${waiterPid}), '{}') AS blockers`,
      );
      const blockers = (rows[0]?.blockers ?? []).map((p) => Number(p));
      if (blockers.includes(blockerPid)) return;
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error(`BEKLEME ILISKISI YOK: pid ${waiterPid}, pid ${blockerPid} tarafindan bloke EDILMEDI`);
  }

  /**
   * Bir baglantinin GERCEKTEN kilit bekledigini pg_locks uzerinden dogrular.
   * Sabit sure beklemez: kosul saglanana kadar event-loop'a yield eder (setImmediate).
   */
  async function waitUntilSomeoneIsBlocked(): Promise<void> {
    for (let i = 0; i < 500; i += 1) {
      const rows = await observer.$queryRawUnsafe<Array<{ n: bigint }>>(
        'SELECT count(*)::bigint AS n FROM pg_locks WHERE NOT granted',
      );
      if (Number(rows[0].n) > 0) return;
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('BEKLEME OLUSMADI: pg_locks icinde granted=false satir yok');
  }

  /**
   * waiterPid'in blockerPid tarafindan bloke edilip edilmedigini SINIRLI denemede olcer.
   * waitUntilBlockedBy'dan farki: bloke DEGILSE hata atmaz, false doner (negatif kontrol icin).
   */
  async function isBlockedBy(waiterPid: number, blockerPid: number, attempts = 60): Promise<boolean> {
    for (let i = 0; i < attempts; i += 1) {
      const rows = await observer.$queryRawUnsafe<Array<{ blockers: number[] }>>(
        `SELECT COALESCE(pg_blocking_pids(${waiterPid}), '{}') AS blockers`,
      );
      if ((rows[0]?.blockers ?? []).map(Number).includes(blockerPid)) return true;
      await new Promise((resolve) => setImmediate(resolve));
    }
    return false;
  }

  /**
   * Verilen kilit ifadesi Collection uzerinde GERCEKTEN TUTULURKEN, ClientPayoutAllocation
   * INSERT'inin (Collection FK -> ortulu KEY SHARE) davranisini olcer.
   * Bariyer her iki cagride AYNIDIR; degisen TEK sey kilit ifadesidir.
   *
   * Doner: { blockedByHolder, insertedWhileHeld }
   *  - blockedByHolder: INSERT, holder PID'i tarafindan bloke edildi mi (pg_blocking_pids).
   *  - insertedWhileHeld: INSERT, holder kilidi BIRAKILMADAN tamamlandi mi.
   * "Belirli sayida sorguda bekleme gorulmedi" TEK BASINA basari olcutu DEGILDIR.
   */
  async function measureAllocationInsertUnderCollectionLock(
    s: Scenario,
    lockClause: 'FOR UPDATE' | 'FOR NO KEY UPDATE',
  ): Promise<{ blockedByHolder: boolean; insertedWhileHeld: boolean }> {
    const payout = await prisma.clientPayout.create({
      data: {
        tenantId: s.tenantId,
        caseId: s.caseId,
        caseClientId: s.caseClientId,
        amount: D('1.00'),
        currency: 'TRY',
        idempotencyKey: `f04-payout-${randomUUID()}`,
        paidById: s.userId,
      },
      select: { id: true },
    });

    let holderReleasedFlag = false;
    let releaseHolder: () => void = () => undefined;
    const holderReleased = new Promise<void>((resolve) => {
      releaseHolder = () => { holderReleasedFlag = true; resolve(); };
    });
    let holderPidResolve: (pid: number) => void = () => undefined;
    const holderPidReady = new Promise<number>((resolve) => { holderPidResolve = resolve; });

    // TUTAN: Collection satirini verilen modda kilitler ve serbest birakilana kadar tutar.
    // ONEMLI: hazir sinyali, kilit sorgusu TAMAMLANDIKTAN SONRA verilir.
    const holder = sideChannel.$transaction(async (tx) => {
      const pid = await backendPid(tx as never);
      await tx.$queryRawUnsafe(
        `SELECT "id" FROM "Collection" WHERE "id" = $1 ${lockClause}`,
        s.collectionId,
      );
      holderPidResolve(pid); // kilit ARTIK TUTULUYOR
      await holderReleased;
    }, { timeout: 60_000 });

    let waiter: Promise<void> = Promise.resolve();
    let inserted = false;
    let blockedByHolder = false;
    let insertedWhileHeld = false;
    let transactionResults: PromiseSettledResult<void>[] = [];
    try {
      const holderPid = await waitForReady(holderPidReady, holder, 'Collection holder');

      // BEKLEYEN: gercek allocation INSERT'i (FK kontrolu Collection'da KEY SHARE ister).
      let waiterPidResolve: (pid: number) => void = () => undefined;
      const waiterPidReady = new Promise<number>((resolve) => { waiterPidResolve = resolve; });
      waiter = observer.$transaction(async (tx) => {
        waiterPidResolve(await backendPid(tx as never));
        await tx.clientPayoutAllocation.create({
          data: {
            tenantId: s.tenantId,
            caseId: s.caseId,
            caseClientId: s.caseClientId,
            clientPayoutId: payout.id,
            collectionId: s.collectionId,
            collectionDispositionId: s.dispositionId,
            collectionDispositionLineId: s.payableLineId!,
            amount: D('1.00'),
          },
        });
        inserted = true;
      }, { timeout: 60_000 });

      const waiterPid = await waitForReady(waiterPidReady, waiter, 'Allocation waiter');
      if (lockClause === 'FOR UPDATE') {
        // Bu kolda bekleme ILISKISI kanitlanmali; kurulmazsa waitUntilBlockedBy HATA atar.
        await waitUntilBlockedBy(waiterPid, holderPid);
        blockedByHolder = true;
      } else {
        // Bu kolda INSERT, holder kilidi TUTULURKEN sure siniri icinde TAMAMLANMALI.
        const timer = new Promise<'timeout'>((resolve) => { setTimeout(() => resolve('timeout'), 15_000).unref?.(); });
        const outcome = await Promise.race([waiter.then(() => 'done' as const), timer]);
        if (outcome === 'timeout') {
          blockedByHolder = await isBlockedBy(waiterPid, holderPid, 1);
          throw new Error('INSERT holder kilidi tutulurken TAMAMLANMADI (sure siniri asildi)');
        }
        insertedWhileHeld = inserted && !holderReleasedFlag;
      }
    } finally {
      releaseHolder();
      transactionResults = await Promise.allSettled([holder, waiter]);
    }
    for (const result of transactionResults) {
      if (result.status === 'rejected') throw result.reason;
    }
    expect(inserted).toBe(true); // her iki modda da INSERT sonunda BASARILI olmali

    return { blockedByHolder, insertedWhileHeld };
  }

  /** Gercek sema uzerinde POSTED-oncesi (DISTRIBUTION_APPROVED) bir dagitim kurar. */
  async function seedScenario(opts: { withPayableLine?: boolean } = {}): Promise<Scenario> {
    const sfx = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({
      data: { name: `F04 ${sfx}`, slug: `f04-${sfx}` },
      select: { id: true },
    });
    createdTenants.push(tenant.id);

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `f04-${sfx}@example.test`,
        name: 'F04',
        surname: 'Approver',
        passwordHash: 'x'.repeat(20),
      },
      select: { id: true },
    });
    // isApproverEligible: aktif + ayni tenant + staffMember YOK + Lawyer PARTNER.
    await prisma.lawyer.create({
      data: {
        tenantId: tenant.id,
        name: 'F04',
        surname: 'Partner',
        lawyerRank: 'PARTNER',
        userId: user.id,
      },
    });

    const client = await prisma.client.create({
      data: { tenantId: tenant.id, type: 'PERSON', name: `F04 Client ${sfx}` },
      select: { id: true },
    });
    const kase = await prisma.case.create({
      data: {
        tenantId: tenant.id,
        fileNumber: `F04-${sfx}`,
        type: 'GENERAL_EXECUTION',
        clientId: client.id,
      },
      select: { id: true },
    });
    const caseClient = await prisma.caseClient.create({
      data: { caseId: kase.id, clientId: client.id, role: 'ALACAKLI' },
      select: { id: true },
    });

    const collection = await prisma.collection.create({
      data: {
        tenantId: tenant.id,
        caseId: kase.id,
        // Collection tutari, dagitim toplamiyla UYUMLU olmali (200 = 100 reimb + 100 payable).
        amount: opts.withPayableLine ? D('200.00') : D('100.00'),
        type: 'TAHSILAT',
        date: new Date(),
        idempotencyKey: `f04-col-${sfx}`,
        status: 'CONFIRMED',
      },
      select: { id: true },
    });

    const expenseRequest = await prisma.expenseRequest.create({
      data: {
        tenantId: tenant.id,
        caseId: kase.id,
        clientId: client.id,
        totalAmount: D('100.00'),
        paidTotal: D('0.00'),
        currency: 'TRY',
        status: 'SENT',
        expenseApprovalStatus: 'APPROVED',
        createdById: user.id,
      },
      select: { id: true },
    });

    const approval = await prisma.officeApprovalRequest.create({
      data: {
        tenantId: tenant.id,
        actionCode: 'COLLECTION_DISPOSITION_POST',
        targetType: 'COLLECTION_DISPOSITION',
        targetRef: 'pending',
        requesterUserId: user.id,
        approverUserId: user.id,
        status: 'APPROVED',
        decidedAt: new Date(),
        savedIntent: {},
        payloadHash: `f04-${sfx}`,
      },
      select: { id: true },
    });

    const disposition = await prisma.collectionDisposition.create({
      data: {
        tenantId: tenant.id,
        caseId: kase.id,
        collectionId: collection.id,
        beneficiaryScope: 'SINGLE_CASE_CLIENT',
        caseClientId: caseClient.id,
        status: 'DISTRIBUTION_APPROVED',
        totalAmount: opts.withPayableLine ? D('200.00') : D('100.00'),
        currency: 'TRY',
        approvalRequestId: approval.id,
        approvedById: user.id,
        lines: {
          create: [
            {
              type: 'CLIENT_EXPENSE_REIMBURSEMENT',
              amount: D('100.00'),
              expenseRequestId: expenseRequest.id,
              caseClientId: caseClient.id,
            },
            // Odeme yapilabilir bacak: payout/allocation senaryolari icin.
            ...(opts.withPayableLine
              ? [{ type: 'CLIENT_PAYABLE' as const, amount: D('100.00'), caseClientId: caseClient.id }]
              : []),
          ],
        },
      },
      select: { id: true, lines: { select: { id: true, type: true } } },
    });

    // GERCEK cancel executor'in ZORUNLU on-kosullari (sozlesme gevsetilmez):
    //  (a) PAYMENT_RECEIVED timeline event'i — header.eventId + payload.collectionId
    //  (b) COLLECTION_CASH_RECEIPT_RECORDED journal'i — metadata.sourceVersion
    const paymentEventId = randomUUID();
    await prisma.icrabotTimelineEntry.create({
      data: {
        tenantId: tenant.id,
        caseId: kase.id,
        type: 'PAYMENT_RECEIVED',
        title: 'F04 payment received',
        aggregateVersion: BigInt(1),
        body: {
          header: { eventId: paymentEventId, eventType: 'PAYMENT_RECEIVED' },
          payload: { collectionId: collection.id, tenantId: tenant.id, caseId: kase.id },
        },
      },
    });
    await prisma.accountingJournalEntry.create({
      data: {
        tenantId: tenant.id,
        entryType: 'COLLECTION_CASH_RECEIPT_RECORDED',
        sourceType: 'COLLECTION',
        sourceId: collection.id,
        sourceAction: 'recorded',
        idempotencyKey: `f04-journal-${sfx}`,
        metadata: { sourceVersion: `f04-source-version-${sfx}` },
      },
    });

    return {
      tenantId: tenant.id,
      caseId: kase.id,
      clientId: client.id,
      caseClientId: caseClient.id,
      userId: user.id,
      collectionId: collection.id,
      dispositionId: disposition.id,
      lineId: disposition.lines.find((l) => l.type === 'CLIENT_EXPENSE_REIMBURSEMENT')!.id,
      payableLineId: disposition.lines.find((l) => l.type === 'CLIENT_PAYABLE')?.id ?? null,
      expenseRequestId: expenseRequest.id,
      approvalRequestId: approval.id,
    };
  }

  /** Iptalin Collection uzerindeki etkisi: AYRI baglantida commit edilir. */
  async function commitCancellationOnSideChannel(s: Scenario): Promise<void> {
    await sideChannel.$executeRawUnsafe(
      'UPDATE "Collection" SET "status" = \'CANCELLED\', "cancelledAt" = now() WHERE "id" = $1',
      s.collectionId,
    );
  }

  async function financialFootprint(s: Scenario) {
    const [applications, ledger, journals, disp] = await Promise.all([
      sideChannel.collectionDispositionExpenseApplication.findMany({
        where: { tenantId: s.tenantId },
        select: { kind: true, amount: true },
      }),
      sideChannel.balanceLedger.findMany({ where: { tenantId: s.tenantId }, select: { id: true } }),
      // Fixture'in cancel-executor on-kosulu olarak yazdigi COLLECTION_CASH_RECEIPT_RECORDED
      // kanit journal'i HARIC: burada olculen sey, posting/reversal AKISLARININ urettigi journal'lardir.
      sideChannel.accountingJournalEntry.findMany({
        where: { tenantId: s.tenantId, NOT: { entryType: 'COLLECTION_CASH_RECEIPT_RECORDED' } },
        select: { id: true },
      }),
      sideChannel.collectionDisposition.findUnique({
        where: { id: s.dispositionId },
        select: { status: true, manualReversalRequiredAt: true, postedAt: true },
      }),
    ]);
    return {
      applyCount: applications.filter((a) => a.kind === 'APPLY').length,
      reversalCount: applications.filter((a) => a.kind === 'REVERSAL').length,
      ledgerCount: ledger.length,
      journalCount: journals.length,
      status: disp?.status,
      manualReversalRequiredAt: disp?.manualReversalRequiredAt ?? null,
      postedAt: disp?.postedAt ?? null,
    };
  }

  it('KABUL-1: posting eski CONFIRMED okumasindan SONRA iptal commit ederse, consumer hic kosmasa bile finansal etki BIRAKILMAZ', async () => {
    const s = await seedScenario();

    // Bariyer: gercek `assertCollectionConfirmed` (transaction DISI erken kontrol) calistiktan
    // HEMEN SONRA iptal AYRI baglantida commit edilir. Boylece posting, transaction'ina
    // "CONFIRMED gordum" bilgisiyle girer — F04'un tam on-kosulu.
    const proto = Object.getPrototypeOf(posting);
    const original = proto.assertCollectionConfirmed;
    let barrierFired = false;
    const spy = jest
      .spyOn(proto as any, 'assertCollectionConfirmed')
      .mockImplementation(async function (this: unknown, ...args: unknown[]) {
        const result = await original.apply(this, args); // GERCEK kontrol
        if (!barrierFired) {
          barrierFired = true;
          await commitCancellationOnSideChannel(s);
        }
        return result;
      });

    try {
      await expect(
        posting.post(s.tenantId, s.dispositionId, { userId: s.userId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      spy.mockRestore();
    }

    expect(barrierFired).toBe(true);

    const after = await financialFootprint(s);
    expect(after.applyCount).toBe(0);
    expect(after.reversalCount).toBe(0);
    expect(after.ledgerCount).toBe(0);
    expect(after.journalCount).toBe(0);
    expect(after.status).toBe('DISTRIBUTION_APPROVED'); // POSTED'a GECMEDI
    expect(after.postedAt).toBeNull();

    // Kalan masraf: hicbir APPLY yazilmadigi icin tam tutar acik kalir.
    const remaining = await readService.computeExpenseRemaining(
      prisma, s.tenantId, s.expenseRequestId, D('100.00'), D('0.00'),
    );
    expect(remaining.toString()).toBe('100');
  });

  it('KABUL-2: posting once kazanirsa, bayat pre-post goruntusuyle gelen reversal POSTED\'i EZEMEZ; POSTED yolu isler', async () => {
    const s = await seedScenario();

    // Bariyer: reversal'in GERCEK ilk okumasi (findUnique) DISTRIBUTION_APPROVED dondukten
    // sonra posting AYNI kayit uzerinde commit eder. Reversal boylece bayat goruntuyle
    // CAS'e gider — F04'un ezme senaryosunun tam kosulu.
    const dispDelegate = (prisma as unknown as { collectionDisposition: { findUnique: (...a: unknown[]) => Promise<unknown> } }).collectionDisposition;
    const originalFindUnique = dispDelegate.findUnique.bind(dispDelegate);
    let barrierFired = false;
    const spy = jest
      .spyOn(dispDelegate, 'findUnique')
      .mockImplementation(async (...args: unknown[]) => {
        const result = await originalFindUnique(...args); // GERCEK okuma
        if (!barrierFired) {
          barrierFired = true;
          await posting.post(s.tenantId, s.dispositionId, { userId: s.userId });
        }
        return result;
      });

    let outcome: Awaited<ReturnType<CollectionReversalService['reverseFromPaymentReversed']>>;
    try {
      outcome = await reversal.reverseFromPaymentReversed(
        { collectionId: s.collectionId }, s.caseId, { tenantId: s.tenantId, actionId: `f04-evt-${s.dispositionId}` } as never,
      );
    } finally {
      spy.mockRestore();
    }

    expect(barrierFired).toBe(true);
    // Bayat pre-post goruntusu POSTED'i EZMEDI.
    expect(outcome.outcome).toBe('posted-manual-reversal-required');
    expect(outcome.manualReversalRequired).toBe(true);
    // Cast: bu alan F04 duzeltmesiyle EKLENDI. Cast sayesinde spec, duzeltme ONCESI kaynakta da
    // DERLENIR ve kusuru DAVRANISSAL olarak yakalar (tip hatasiyla degil).
    expect((outcome as { revalidatedAfterConflict?: boolean }).revalidatedAfterConflict).toBe(true);

    const after = await financialFootprint(s);
    expect(after.status).toBe('POSTED');            // status KORUNDU
    expect(after.postedAt).not.toBeNull();
    expect(after.manualReversalRequiredAt).not.toBeNull(); // takip isareti KONDU
    expect(after.applyCount).toBe(1);
    expect(after.reversalCount).toBe(1);            // reimbursement REVERSAL YAZILDI

    // Kalan masraf: APPLY + REVERSAL birbirini goturur → tam tutar yeniden acik.
    const remaining = await readService.computeExpenseRemaining(
      prisma, s.tenantId, s.expenseRequestId, D('100.00'), D('0.00'),
    );
    expect(remaining.toString()).toBe('100');
  });

  it('KABUL-3: tekrarlanan PAYMENT_REVERSED kalici cift finansal etki URETMEZ', async () => {
    const s = await seedScenario();
    await posting.post(s.tenantId, s.dispositionId, { userId: s.userId });

    const ctx = { tenantId: s.tenantId, actionId: `f04-evt-a-${s.dispositionId}` } as never;
    const first = await reversal.reverseFromPaymentReversed({ collectionId: s.collectionId }, s.caseId, ctx);
    const afterFirst = await financialFootprint(s);

    const second = await reversal.reverseFromPaymentReversed(
      { collectionId: s.collectionId }, s.caseId,
      { tenantId: s.tenantId, actionId: `f04-evt-b-${s.dispositionId}` } as never,
    );
    const afterSecond = await financialFootprint(s);

    expect(first.outcome).toBe('posted-manual-reversal-required');
    expect(second.outcome).toBe('posted-manual-reversal-required');
    expect(second.alreadyMarked).toBe(true);
    // Ilk marker korunur, ikinci tur yeni finansal satir URETMEZ.
    expect(afterSecond.manualReversalRequiredAt?.toISOString())
      .toBe(afterFirst.manualReversalRequiredAt?.toISOString());
    expect(afterSecond.applyCount).toBe(afterFirst.applyCount);
    expect(afterSecond.reversalCount).toBe(afterFirst.reversalCount);
    expect(afterSecond.status).toBe('POSTED');

    const remaining = await readService.computeExpenseRemaining(
      prisma, s.tenantId, s.expenseRequestId, D('100.00'), D('0.00'),
    );
    expect(remaining.toString()).toBe('100');
  });

  it('KABUL-4: iptal ONCE kazanirsa reversal pre-post gecisini yapar ve posting artik POSTED yazamaz', async () => {
    const s = await seedScenario();
    await commitCancellationOnSideChannel(s);

    const outcome = await reversal.reverseFromPaymentReversed(
      { collectionId: s.collectionId }, s.caseId,
      { tenantId: s.tenantId, actionId: `f04-evt-c-${s.dispositionId}` } as never,
    );
    expect(outcome.outcome).toBe('reversed');

    // Iptal + reversal tamamlandiktan sonra posting HICBIR finansal etki birakamaz.
    await expect(
      posting.post(s.tenantId, s.dispositionId, { userId: s.userId }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const after = await financialFootprint(s);
    expect(after.status).toBe('REVERSED');
    expect(after.applyCount).toBe(0);
    expect(after.reversalCount).toBe(0);
    expect(after.ledgerCount).toBe(0);
    expect(after.journalCount).toBe(0);
  });

  it('KABUL-A: posting Collection kilidini ONCE alir; cancel bu kilitte BEKLER, posting commit edince devam eder; sonra POSTED tersleme yolu isler', async () => {
    const s = await seedScenario();

    let cancelStarted = false;
    let cancelSettled = false;
    let cancelError: unknown = null;
    let cancelPromise: Promise<unknown> = Promise.resolve();

    // Bariyer: posting Collection kilidini ALDIKTAN HEMEN SONRA (kilitli dogrulama gercek
    // metodla calisti), iptalin Collection satirina uyguladigi UPDATE ayri baglantida ACILIR.
    // NOT: burada calistirilan sey, gercek CollectionCancelExecutor'in Collection satirina
    // uyguladigi UPDATE'tir (executor'in tamami degil) — kilit davranisi bakimindan ayni satiri
    // ayni sekilde hedefler.
    const proto = Object.getPrototypeOf(posting);
    const original = proto.assertCollectionConfirmedForUpdate;
    const spy = jest
      .spyOn(proto as any, 'assertCollectionConfirmedForUpdate')
      .mockImplementation(async function (this: unknown, ...args: unknown[]) {
        const result = await original.apply(this, args); // GERCEK kilitli dogrulama
        if (!cancelStarted) {
          cancelStarted = true;
          cancelPromise = sideChannel
            .$executeRawUnsafe(
              'UPDATE "Collection" SET "status" = \'CANCELLED\', "cancelledAt" = now() WHERE "id" = $1',
              s.collectionId,
            )
            .then(() => { cancelSettled = true; })
            .catch((e) => { cancelError = e; });
          // Iptalin GERCEKTEN posting'in kilidinde bekledigini pg_locks ile kanitla.
          await waitUntilSomeoneIsBlocked();
          expect(cancelSettled).toBe(false); // posting commit etmeden iptal ILERLEYEMEDI
        }
        return result;
      });

    try {
      const posted = await posting.post(s.tenantId, s.dispositionId, { userId: s.userId });
      expect(posted.posted).toBe(true);
    } finally {
      await cancelPromise;
      spy.mockRestore();
    }

    // Posting commit etti -> kilit birakildi -> iptal devam edebildi.
    expect(cancelError).toBeNull();
    expect(cancelSettled).toBe(true);

    const afterPost = await financialFootprint(s);
    expect(afterPost.status).toBe('POSTED');
    expect(afterPost.applyCount).toBe(1);
    expect(afterPost.manualReversalRequiredAt).toBeNull();

    // Iptalin ardindan gelen PAYMENT_REVERSED: POSTED tersleme yolu isler.
    const outcome = await reversal.reverseFromPaymentReversed(
      { collectionId: s.collectionId }, s.caseId,
      { tenantId: s.tenantId, actionId: `f04-evt-A-${s.dispositionId}` } as never,
    );
    expect(outcome.outcome).toBe('posted-manual-reversal-required');

    const afterReversal = await financialFootprint(s);
    expect(afterReversal.status).toBe('POSTED');                 // status KORUNDU
    expect(afterReversal.manualReversalRequiredAt).not.toBeNull(); // takip isareti
    expect(afterReversal.reversalCount).toBe(1);                  // reimbursement REVERSAL
    expect(afterReversal.journalCount).toBeGreaterThan(afterPost.journalCount); // storno yazildi

    const remaining = await readService.computeExpenseRemaining(
      prisma, s.tenantId, s.expenseRequestId, D('100.00'), D('0.00'),
    );
    expect(remaining.toString()).toBe('100');
  });

  it('KABUL-A2: GERCEK cancel executor posting\'in Collection kilidinde BEKLER (pg_blocking_pids ile kanitli), sonra tamamlanir; ardindan POSTED tersleme yolu isler', async () => {
    const s = await seedScenario();

    const cancelDeps = {
      domainEventIngestService: new DomainEventIngestService(),
      journalWriter: new AccountingJournalWriterService(sideChannel as never),
    };

    let cancelSettled = false;
    let cancelError: unknown = null;
    let cancelPromise: Promise<unknown> = Promise.resolve();
    let cancelPidResolve: (pid: number) => void = () => undefined;
    const cancelPidReady = new Promise<number>((resolve) => { cancelPidResolve = resolve; });

    // Bariyer: posting Collection kilidini ALDIKTAN sonra, GERCEK cancel executor AYRI
    // baglantida kendi transaction'inda baslatilir. Executor Collection satirini UPDATE
    // ettiginde posting'in FOR NO KEY UPDATE kilidinde bloke olur.
    const proto = Object.getPrototypeOf(posting);
    const original = proto.assertCollectionConfirmedForUpdate;
    let barrierFired = false;
    const spy = jest
      .spyOn(proto as any, 'assertCollectionConfirmedForUpdate')
      .mockImplementation(async function (this: unknown, ...args: unknown[]) {
        const result = await original.apply(this, args); // GERCEK kilitli dogrulama
        if (!barrierFired) {
          barrierFired = true;
          const postingPid = await backendPid(args[0] as never); // kilidi TUTAN transaction

          cancelPromise = sideChannel
            .$transaction(async (tx) => {
              cancelPidResolve(await backendPid(tx as never)); // kilidi BEKLEYECEK transaction
              return executeCollectionCancelInTransaction(tx, cancelDeps as never, {
                tenantId: s.tenantId,
                id: s.collectionId,
                dto: { cancelReason: 'F04 gercek iptal' } as never,
                actorUserId: s.userId,
                expectedCaseId: s.caseId,
              });
            }, { timeout: 60_000 })
            .then(() => { cancelSettled = true; })
            .catch((e) => { cancelError = e; cancelSettled = true; });

          const cancelPid = await waitForReady(cancelPidReady, cancelPromise, 'Cancel PID');
          // Iliski KANITI: cancel'in PID'i, posting'in PID'i tarafindan bloke edilmis olmali.
          await waitUntilBlockedBy(cancelPid, postingPid);
          expect(cancelSettled).toBe(false); // posting commit etmeden iptal ILERLEYEMEDI
        }
        return result;
      });

    try {
      const posted = await posting.post(s.tenantId, s.dispositionId, { userId: s.userId });
      expect(posted.posted).toBe(true);
    } finally {
      await cancelPromise;
      spy.mockRestore();
    }

    expect(cancelError).toBeNull();
    expect(cancelSettled).toBe(true);

    // Gercek iptal kayitlari olustu mu?
    const cancelled = await sideChannel.collection.findUnique({
      where: { id: s.collectionId },
      select: { status: true, cancelledAt: true, cancelReason: true },
    });
    expect(cancelled?.status).toBe('CANCELLED');
    expect(cancelled?.cancelledAt).not.toBeNull();

    const reversedEvent = await sideChannel.icrabotTimelineEntry.findFirst({
      where: { tenantId: s.tenantId, caseId: s.caseId, type: 'PAYMENT_REVERSED' },
      select: { id: true, body: true },
    });
    expect(reversedEvent).not.toBeNull(); // PAYMENT_REVERSED URETILDI

    // Ardindan GERCEK reversal servisi: POSTED yolu isler.
    const outcome = await reversal.reverseFromPaymentReversed(
      { collectionId: s.collectionId }, s.caseId,
      { tenantId: s.tenantId, actionId: `f04-evt-A2-${s.dispositionId}` } as never,
    );
    expect(outcome.outcome).toBe('posted-manual-reversal-required');

    const after = await financialFootprint(s);
    expect(after.status).toBe('POSTED');                  // status KORUNDU
    expect(after.manualReversalRequiredAt).not.toBeNull();  // takip isareti
    expect(after.applyCount).toBe(1);
    expect(after.reversalCount).toBe(1);                    // reimbursement REVERSAL

    const remaining = await readService.computeExpenseRemaining(
      prisma, s.tenantId, s.expenseRequestId, D('100.00'), D('0.00'),
    );
    expect(remaining.toString()).toBe('100');
  });

  it('KABUL-B: posting transaction\'inda finansal yazim BASLADIKTAN sonra hata olursa hicbir yazim kalici kalmaz', async () => {
    const s = await seedScenario();

    // Hata enjeksiyonu TEST KATMANINDA: gercek journal writer'in ikinci write'i reddedilir.
    // Ilk write (expense application journal'i) ve CAS zaten calismistir -> finansal yazim
    // BASLAMIS durumdadir; hata bundan SONRA olusur.
    const writer = (posting as unknown as { journalWriter: { write: (...a: unknown[]) => Promise<unknown> } }).journalWriter;
    let writeCount = 0;
    const originalWrite = writer.write.bind(writer);
    const spy = jest.spyOn(writer, 'write').mockImplementation(async (...args: unknown[]) => {
      writeCount += 1;
      if (writeCount >= 2) throw new Error('INJECTED_JOURNAL_FAILURE');
      return originalWrite(...args);
    });

    try {
      await expect(
        posting.post(s.tenantId, s.dispositionId, { userId: s.userId }),
      ).rejects.toThrow(/INJECTED_JOURNAL_FAILURE/);
    } finally {
      spy.mockRestore();
    }

    expect(writeCount).toBeGreaterThanOrEqual(2); // yazim GERCEKTEN baslamisti

    // Transaction'in URETTIGI HICBIR SEY kalici degil.
    const after = await financialFootprint(s);
    expect(after.applyCount).toBe(0);
    expect(after.reversalCount).toBe(0);
    expect(after.ledgerCount).toBe(0);
    expect(after.journalCount).toBe(0);
    expect(after.status).toBe('DISTRIBUTION_APPROVED'); // CAS geri alindi
    expect(after.postedAt).toBeNull();

    const remaining = await readService.computeExpenseRemaining(
      prisma, s.tenantId, s.expenseRequestId, D('100.00'), D('0.00'),
    );
    expect(remaining.toString()).toBe('100');
  });

  it('KABUL-C: Collection kilidi, ClientPayoutAllocation FK kontrolunu (ortulu KEY SHARE) BLOKLAMAZ; FOR UPDATE ise bloklardi', async () => {
    // NEGATIF KONTROL — ayni bariyer, YALNIZ kilit modu farkli.
    // FOR UPDATE, FK'nin ihtiyac duydugu KEY SHARE ile CAKISIR: allocation INSERT'i bekler.
    // Bu, payout -> Collection FK kenarini yaratir ve
    // (gecikmis posting -> clientOffset -> payout -> Collection FK) dongusunu MUMKUN kilar.
    const negative = await seedScenario({ withPayableLine: true });
    const withForUpdate = await measureAllocationInsertUnderCollectionLock(negative, 'FOR UPDATE');
    expect(withForUpdate.blockedByHolder).toBe(true); // PID cifti beklemesi KANITLANDI

    // URETIM MODU: FOR NO KEY UPDATE, KEY SHARE ile CAKISMAZ -> FK kenari YOK.
    const positive = await seedScenario({ withPayableLine: true });
    const withNoKeyUpdate = await measureAllocationInsertUnderCollectionLock(positive, 'FOR NO KEY UPDATE');
    // Pozitif kanit: INSERT, holder kilidi BIRAKILMADAN tamamlandi (bekleme yoklugu degil).
    expect(withNoKeyUpdate.insertedWhileHeld).toBe(true);
    expect(withNoKeyUpdate.blockedByHolder).toBe(false);
  });

  it('KABUL-D: gecikmis ikinci posting + offset + payout zincirinde dongu KURULMAZ; gecikmis posting is kuraliyla reddedilir ve kalici cift etki OLUSMAZ', async () => {
    const s = await seedScenario({ withPayableLine: true });

    // Ilk posting tamamlanir -> disposition POSTED.
    const first = await posting.post(s.tenantId, s.dispositionId, { userId: s.userId });
    expect(first.posted).toBe(true);
    const afterFirst = await financialFootprint(s);
    expect(afterFirst.status).toBe('POSTED');

    // Ikinci posting AYNI disposition icin, APPROVED goruntusuyle transaction'a girer.
    // requireDisposition bariyeri: gercek okuma sonucunu bayat APPROVED'a cevirmek YERINE,
    // gercek metodun dondurdugu kayit uzerinde YALNIZ status alani bayat birakilir; boylece
    // post() kendi ic akisini gercek veriyle yurutur, yalnizca "gec kalmis okuma" modellenir.
    const proto = Object.getPrototypeOf(posting);
    const originalRequire = proto.requireDisposition;
    let releasePayout: () => void = () => undefined;
    const payoutHold = new Promise<void>((resolve) => { releasePayout = resolve; });
    let allocationInserted = false;
    let offsetDone = false;
    let payoutError: unknown = null;
    let offsetError: unknown = null;
    let secondError: unknown = null;
    let payoutLeg: Promise<unknown> = Promise.resolve();
    let offsetLeg: Promise<unknown> = Promise.resolve();
    let secondPosting: Promise<unknown> = Promise.resolve();
    let lockSpy: jest.SpyInstance | undefined;
    const requireSpy = jest
      .spyOn(proto as any, 'requireDisposition')
      .mockImplementation(async function (this: unknown, ...args: unknown[]) {
        const fresh = await originalRequire.apply(this, args);
        return { ...(fresh as Record<string, unknown>), status: 'DISTRIBUTION_APPROVED' };
      });

    try {
      // offset ve payout bacaklari: ilgili servislerin ALDIGI GERCEK advisory anahtarlari ve
      // GERCEK allocation INSERT'i kullanilir (servislerin tamami cagrilmaz; olculen sey kilit
      // iliskisidir). Zincir: offset -> clientOffset tutar, payout bekler;
      // payout -> payout tutar, allocation INSERT ile Collection FK kontrolune girer.
      const payout = await prisma.clientPayout.create({
        data: {
          tenantId: s.tenantId, caseId: s.caseId, caseClientId: s.caseClientId,
          amount: D('1.00'), currency: 'TRY',
          idempotencyKey: `f04-payout-D-${randomUUID()}`, paidById: s.userId,
        },
        select: { id: true },
      });

      // GERCEK anahtar ureticileri (string kopyalanmaz; format degisirse test de takip eder).
      const offsetKey = clientOffsetLockKey(s.tenantId, s.clientId, 'TRY');
      const payoutKey = payoutLockKey(s.tenantId, s.caseId, s.caseClientId, 'TRY');

      let payoutHasLock: () => void = () => undefined;
      const payoutLockReady = new Promise<void>((resolve) => { payoutHasLock = resolve; });

      // PAYOUT bacagi: payout advisory kilidini alir, sonra allocation INSERT yapar.
      payoutLeg = observer.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, payoutKey);
        payoutHasLock();
        await payoutHold; // offset'in clientOffset'i tuttugundan emin olana kadar bekle
        await tx.clientPayoutAllocation.create({
          data: {
            tenantId: s.tenantId, caseId: s.caseId, caseClientId: s.caseClientId,
            clientPayoutId: payout.id, collectionId: s.collectionId,
            collectionDispositionId: s.dispositionId,
            // Odeme tahsisi CLIENT_PAYABLE satirina baglanir (reimbursement satirina DEGIL).
            collectionDispositionLineId: s.payableLineId!,
            amount: D('1.00'),
          },
        });
        allocationInserted = true;
      }, { timeout: 60_000 });

      await waitForReady(payoutLockReady, payoutLeg, 'Payout lock');

      // OFFSET bacagi: clientOffset'i alir, sonra payout kilidini BEKLER (CBND-5 sirasi).
      let offsetPidResolve: (pid: number) => void = () => undefined;
      const offsetPidReady = new Promise<number>((resolve) => { offsetPidResolve = resolve; });
      offsetLeg = sideChannel.$transaction(async (tx) => {
        offsetPidResolve(await backendPid(tx as never));
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, offsetKey);
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, payoutKey); // BEKLER
        offsetDone = true;
      }, { timeout: 60_000 });

      const offsetPid = await waitForReady(offsetPidReady, offsetLeg, 'Offset PID');
      // offset gercekten payout kilidinde bekliyor olmali (clientOffset'i TUTARAK).
      await waitUntilSomeoneIsBlocked();

      // Gecikmis ikinci posting: Collection kilidini alir (CONFIRMED), clientOffset'i BEKLER.
      // Sira DETERMINISTIK kurulur: Collection kilidi alindiktan SONRA posting'in clientOffset
      // uzerinde offset bacagini bekledigi pg_blocking_pids ile DOGRULANIR; ancak ondan sonra
      // payout serbest birakilir. Aksi halde zincir kurulmadan cozulur ve test yanlis yesil verir.
      let postingPid = 0;
      let postingLockedResolve: () => void = () => undefined;
      const postingLocked = new Promise<void>((resolve) => { postingLockedResolve = resolve; });
      const lockProto = Object.getPrototypeOf(posting);
      const originalLock = lockProto.assertCollectionConfirmedForUpdate;
      lockSpy = jest
        .spyOn(lockProto as any, 'assertCollectionConfirmedForUpdate')
        .mockImplementation(async function (this: unknown, ...args: unknown[]) {
          const result = await originalLock.apply(this, args); // GERCEK kilitli dogrulama
          postingPid = await backendPid(args[0] as never);
          postingLockedResolve();
          return result;
        });

      secondPosting = posting
        .post(s.tenantId, s.dispositionId, { userId: s.userId })
        .catch((e) => { secondError = e; });

      await waitForReady(postingLocked, secondPosting, 'Posting Collection lock'); // Collection kilidi ALINDI
      await waitUntilBlockedBy(postingPid, offsetPid);        // posting clientOffset'te BEKLIYOR

      // Zincir TAM: posting(Collection tutar, clientOffset bekler) -> offset(clientOffset tutar,
      // payout bekler) -> payout(payout tutar, allocation INSERT -> Collection FK).
      // FK kenari VARSA (FOR UPDATE) burada dongu kapanir; YOKSA zincir cozulur.
      releasePayout();
    } finally {
      // Erken hazirlik/bekleme hatalarinda da TUM transaction'lar sonuclanir.
      releasePayout();
      const [payoutResult, offsetResult] = await Promise.allSettled([payoutLeg, offsetLeg, secondPosting]);
      if (payoutResult.status === 'rejected') payoutError = payoutResult.reason;
      if (offsetResult.status === 'rejected') offsetError = offsetResult.reason;
      lockSpy?.mockRestore();
      requireSpy.mockRestore();
    }

    // HICBIR bacakta deadlock/timeout OLMAMALI — bunlar normal ret sayilamaz.
    for (const [leg, err] of [['payout', payoutError], ['offset', offsetError], ['posting', secondError]] as const) {
      const reason = lockFailureReason(err);
      expect(reason === null ? 'OK' : `${leg}:${reason}`).toBe('OK');
    }

    // Odeme ve mahsup bacaklari GECERLI sonuclarla tamamlandi (dongu OLUSMADI).
    expect(payoutError).toBeNull();
    expect(offsetError).toBeNull();
    expect(allocationInserted).toBe(true);
    expect(offsetDone).toBe(true);

    // Gecikmis posting REDDEDILDI. Bu fixture'da ilk posting masrafin TAMAMINI kapattigi icin
    // ret, CAS'ten ONCE gelen masraf-kalani kontrolunden gelir (BadRequestException).
    expect(secondError).toBeInstanceOf(BadRequestException);
    expect((secondError as Error).message).toMatch(/masraf kalan[iı]n[iı].*a[sş]amaz/i);

    const afterSecond = await financialFootprint(s);
    expect(afterSecond.status).toBe('POSTED');
    expect(afterSecond.postedAt?.toISOString()).toBe(afterFirst.postedAt?.toISOString());
    expect(afterSecond.applyCount).toBe(afterFirst.applyCount); // ikinci APPLY YOK
    expect(afterSecond.ledgerCount).toBe(afterFirst.ledgerCount);
    expect(afterSecond.journalCount).toBe(afterFirst.journalCount);
  });

  it('KABUL-5: tenant/case sinirlari korunur — baska tenant\'in dispositioni post EDILEMEZ', async () => {
    const a = await seedScenario();
    const b = await seedScenario();

    await expect(
      posting.post(b.tenantId, a.dispositionId, { userId: b.userId }),
    ).rejects.toBeTruthy();

    const after = await financialFootprint(a);
    expect(after.status).toBe('DISTRIBUTION_APPROVED');
    expect(after.applyCount).toBe(0);
    expect(after.journalCount).toBe(0);
  });
});
