/**
 * C1-B05-B — TYPED EXPENSE_ACTUAL posting + durable delivery-intent: GERÇEK PostgreSQL kanıtı.
 * TEST_DATABASE_URL yoksa suite ATLANIR (describeDb); canlı hukuk_db'de ASLA koşmaz.
 * GERÇEK SMTP YOK — nodemailer mock'u local capture/test sink'tir (owner talimatı).
 *
 * Owner kabul kalemleri (bu dosyada):
 *  - commit → ledger 1 (typed) + intent 1 (QUEUED) + journal; rollback → hiçbiri yok
 *  - iki concurrent posting → ledger/intent EN FAZLA 1; replay → alreadyPosted
 *  - QUEUED concurrent claim → yalnız 1; PENDING/SENT tekrar gönderilmez; FAILED yalnız explicit reclaim
 *  - crash senaryosu: commit sonrası dispatch düşerse intent QUEUED kalır → drain güvenle işler
 *  - generic DEBIT/reversal → typed sınıflandırma + mail YOK
 *  - tenant izolasyonu: postingKey tenant-başına unique; içerik tr-TR + Office markası + raw ID yok
 *  - statement: aynı source TAM 1 EXPENSE_ACTUAL satırı (refId=ledgerId); retry satır üretmez
 */
const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: (...args: any[]) => sendMail(...args) })),
}));

import { PrismaClient, Prisma } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { CaseBalanceService } from '../case-balance.service';
import { ClientNotificationService } from '@/modules/client-notification/client-notification.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { MessageTemplateService } from '@/modules/message-template/message-template.service';
import { ClientStatementService } from '@/modules/client-statement/client-statement.service';

const SINK_SMTP = {
  smtpHost: 'smtp.local.test', smtpPort: 587, smtpSecure: false,
  smtpUser: 'sink', smtpPass: 'sink-pass', smtpFromName: 'Test Sink', smtpFromEmail: 'sink@local.test',
};

describeDb('C1-B05-B typed EXPENSE_ACTUAL posting (gerçek PostgreSQL + local mail sink)', () => {
  const prisma = new PrismaClient();
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenantId = `b05b-${suffix}`;
  const tenantBId = `b05b2-${suffix}`;
  let caseId = '';
  let clientId = '';
  let ambiguousCaseId = '';

  const officeStub: any = { getFullSmtpSettings: jest.fn().mockResolvedValue(SINK_SMTP) };
  const messageTemplate = new MessageTemplateService(prisma as any);
  const clientNotification = new ClientNotificationService(prisma as any, officeStub);
  const dispatcher = new NotificationDispatcherService(prisma as any, clientNotification, messageTemplate);
  const service = new CaseBalanceService(prisma as any, undefined as any, clientNotification, dispatcher);
  // "Crash" simülasyonu: commit BAŞARILI, dispatch hiç koşamadan süreç düşer → intent QUEUED kalır.
  const crashingDispatcher: any = { dispatchQueuedIntent: jest.fn().mockRejectedValue(new Error('simulated-crash')) };
  const serviceCrash = new CaseBalanceService(prisma as any, undefined as any, clientNotification, crashingDispatcher);

  beforeAll(async () => {
    for (const [tid, name] of [[tenantId, 'B05B Tenant'], [tenantBId, 'B05B Tenant 2']] as const) {
      await prisma.tenant.create({ data: { id: tid, name, slug: tid } });
      await prisma.office.create({ data: { tenantId: tid, name: 'Deneme Hukuk Bürosu', phone: '0212 000 00 00' } });
      await messageTemplateSeed(tid);
    }
    const client = await prisma.client.create({
      data: { tenantId, displayName: 'B05B Müvekkil', type: 'INDIVIDUAL', email: 'muvekkil@local.test' },
    });
    clientId = client.id;
    const caseRow = await prisma.case.create({
      data: {
        tenantId, clientId, fileNumber: `B05B-${suffix}`, executionFileNumber: '2026/900',
        type: 'GENERAL_EXECUTION', caseStatus: 'DERDEST', status: 'ACTIVE', currency: 'TRY', interestType: 'YASAL',
      },
    });
    caseId = caseRow.id;
    // Belirsiz-alıcı dosyası: iki FARKLI creditor CaseClient
    const clientB = await prisma.client.create({ data: { tenantId, displayName: 'B05B İkinci', type: 'INDIVIDUAL' } });
    const ambiguous = await prisma.case.create({
      data: {
        tenantId, clientId, fileNumber: `B05B-AMB-${suffix}`,
        type: 'GENERAL_EXECUTION', caseStatus: 'DERDEST', status: 'ACTIVE', currency: 'TRY', interestType: 'YASAL',
      },
    });
    ambiguousCaseId = ambiguous.id;
    await prisma.caseClient.create({ data: { caseId: ambiguousCaseId, clientId } });
    await prisma.caseClient.create({ data: { caseId: ambiguousCaseId, clientId: clientB.id } });
    // Avans bakiyesi (iki dosyaya da yüklü kredi)
    for (const cid of [caseId, ambiguousCaseId]) {
      await service.credit(tenantId, cid, { amount: 100000, source: 'manual', description: 'test avans' }, 'user-b05b');
    }
  });

  async function messageTemplateSeed(tid: string) {
    await messageTemplate.create(tid, {
      code: 'EXPENSE_ACTUAL_POSTED', name: 'Gerçekleşen Masraf', category: 'EXPENSE_ACTUAL' as any, channel: 'EMAIL' as any,
      subject: '{{caseFileNumber}} - Gerçekleşen Masraf Bildirimi',
      body: 'Sayın {{clientName}}, {{caseFileNumber}} dosyanızda {{expenseDate}} tarihinde masraf gerçekleşti: {{description}} — {{amount}} {{currency}}. {{officeName}} {{officePhone}}',
    } as any);
  }

  afterAll(async () => {
    for (const tid of [tenantId, tenantBId]) {
      await prisma.accountingJournalLine.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
      await prisma.accountingJournalEntry.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
      await prisma.clientNotification.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
      await prisma.balanceLedger.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
      await prisma.caseBalance.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
      await prisma.caseClient.deleteMany({ where: { case: { tenantId: tid } } }).catch(() => undefined);
      await prisma.case.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
      await prisma.client.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
      await prisma.messageTemplate.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
      await prisma.office.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id: tid } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({ messageId: 'sink-1' });
  });

  it('E2E: posting → typed ledger + intent + journal AYNI commit; dispatch → SENT; içerik tr-TR + marka + raw ID YOK', async () => {
    const pk = `e2e-${suffix}`;
    const result = await service.postExpenseActual(tenantId, caseId, { amount: 1250, postingKey: pk, description: 'Bilirkişi ücreti' }, 'user-b05b');

    expect(result.success).toBe(true);
    expect(result.notification).toEqual(expect.objectContaining({ outcome: 'QUEUED_AND_DISPATCHED', dispatchStatus: 'sent' }));

    // Ledger: typed + posting idempotency alanları
    const ledger = await prisma.balanceLedger.findFirst({ where: { tenantId, postingKey: pk } });
    expect(ledger).toMatchObject({ type: 'DEBIT', entryKind: 'EXPENSE_ACTUAL', source: `expense_actual:${pk}` });
    expect(Number(ledger!.amount)).toBe(-1250);

    // Intent: SENT + stable dedupe + tenant-scoped
    const intent = await prisma.clientNotification.findFirst({
      where: { tenantId, dedupeKey: `EXPENSE_ACTUAL_POSTED:BalanceLedger:${ledger!.id}:1` },
    });
    expect(intent?.status).toBe('SENT');
    expect(intent?.sentAt).toBeTruthy();

    // Journal aynı source identity ile yazıldı
    const journal = await prisma.accountingJournalEntry.findFirst({ where: { tenantId, sourceId: ledger!.id } });
    expect(journal).toBeTruthy();

    // İçerik kabulü (local sink): tr-TR tutar, Office markası, insan-okur dosya no; {{token}} ve raw ID YOK
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('muvekkil@local.test');
    const content = `${mail.subject} ${mail.html}`;
    expect(content).toContain('1.250,00');
    expect(content).toContain('Deneme Hukuk Bürosu');
    expect(content).toContain(`B05B-${suffix}`);
    expect(content).toContain('Bilirkişi ücreti');
    expect(content).not.toContain('{{');
    expect(content).not.toContain(ledger!.id);
    expect(content).not.toContain(caseId);
    expect(content).not.toContain(clientId);

    // Bakiye etkisi yalnız ledger hareketinden (decrement uygulandı)
    const bal = await prisma.caseBalance.findUnique({ where: { caseId } });
    expect(Number(bal!.balance)).toBe(100000 - 1250);
  });

  it('transaction rollback → ledger/intent/journal/mail HİÇBİRİ kalıcılaşmaz (atomiklik)', async () => {
    const pk = `rollback-${suffix}`;
    const failingCN: any = {
      enqueueEmailIntentInTransaction: jest.fn().mockRejectedValue(new Error('intent-write-failure')),
    };
    const failingService = new CaseBalanceService(prisma as any, undefined as any, failingCN, crashingDispatcher);
    const before = await prisma.caseBalance.findUnique({ where: { caseId } });

    await expect(
      failingService.postExpenseActual(tenantId, caseId, { amount: 500, postingKey: pk }, 'user-b05b'),
    ).rejects.toThrow('intent-write-failure');

    expect(await prisma.balanceLedger.count({ where: { tenantId, postingKey: pk } })).toBe(0);
    expect(await prisma.clientNotification.count({ where: { tenantId, type: 'MASRAF_GERCEKLESEN', dedupeKey: { contains: pk } } })).toBe(0);
    const after = await prisma.caseBalance.findUnique({ where: { caseId } });
    expect(Number(after!.balance)).toBe(Number(before!.balance)); // bakiye değişmedi
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('iki CONCURRENT posting (aynı postingKey) → ledger 1 + intent 1 + mail EN FAZLA 1', async () => {
    const pk = `conc-${suffix}`;
    const [a, b] = await Promise.all([
      service.postExpenseActual(tenantId, caseId, { amount: 300, postingKey: pk }, 'user-b05b'),
      service.postExpenseActual(tenantId, caseId, { amount: 300, postingKey: pk }, 'user-b05b'),
    ]);
    expect([a.alreadyPosted, b.alreadyPosted].sort()).toEqual([false, true]); // tam 1 kazanan
    expect(await prisma.balanceLedger.count({ where: { tenantId, postingKey: pk } })).toBe(1);
    const ledger = await prisma.balanceLedger.findFirst({ where: { tenantId, postingKey: pk }, select: { id: true } });
    expect(await prisma.clientNotification.count({ where: { tenantId, dedupeKey: `EXPENSE_ACTUAL_POSTED:BalanceLedger:${ledger!.id}:1` } })).toBe(1);
    expect(sendMail.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('replay (sonradan aynı postingKey) → alreadyPosted; yeni satır/intent/mail YOK', async () => {
    const pk = `replay-${suffix}`;
    await service.postExpenseActual(tenantId, caseId, { amount: 100, postingKey: pk }, 'user-b05b');
    sendMail.mockClear();
    const replay = await service.postExpenseActual(tenantId, caseId, { amount: 100, postingKey: pk }, 'user-b05b');
    expect(replay.alreadyPosted).toBe(true);
    expect(replay.notification).toEqual({ outcome: 'ALREADY_POSTED_NO_NEW_INTENT' });
    expect(await prisma.balanceLedger.count({ where: { tenantId, postingKey: pk } })).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('crash senaryosu: commit OK + dispatch düştü → intent QUEUED kalır → drain güvenle işler → SENT', async () => {
    const pk = `crash-${suffix}`;
    const result = await serviceCrash.postExpenseActual(tenantId, caseId, { amount: 200, postingKey: pk, description: 'Crash sonrası' }, 'user-b05b');
    expect(result.notification).toEqual(expect.objectContaining({ outcome: 'QUEUED' }));
    const intentId = (result.notification as any).notificationId as string;

    let intent = await prisma.clientNotification.findUnique({ where: { id: intentId } });
    expect(intent?.status).toBe('QUEUED'); // güvenle işlenebilir durum
    expect(sendMail).not.toHaveBeenCalled(); // provider HİÇ çağrılmadı

    const summary = await dispatcher.drainQueuedNotifications(tenantId, 'user-b05b', 10);
    expect(summary.sent).toBeGreaterThanOrEqual(1);
    intent = await prisma.clientNotification.findUnique({ where: { id: intentId } });
    expect(intent?.status).toBe('SENT');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('QUEUED concurrent claim → yalnız 1 CLAIMED; SENT/PENDING tekrar gönderilmez; FAILED yalnız explicit reclaim', async () => {
    const pk = `claim-${suffix}`;
    const posted = await serviceCrash.postExpenseActual(tenantId, caseId, { amount: 150, postingKey: pk }, 'user-b05b');
    const intentId = (posted.notification as any).notificationId as string;

    // İki eşzamanlı claim → tam 1 CLAIMED
    const [c1, c2] = await Promise.all([
      clientNotification.claimQueuedNotificationSlot(tenantId, intentId, { subject: 's', body: 'b' }),
      clientNotification.claimQueuedNotificationSlot(tenantId, intentId, { subject: 's', body: 'b' }),
    ]);
    expect([c1.kind, c2.kind].sort()).toEqual(['CLAIMED', 'NOT_QUEUED']);

    // Artık PENDING (in-flight/belirsiz): drain DOKUNMAZ (otomatik resend yok)
    sendMail.mockClear();
    const afterPending = await dispatcher.dispatchQueuedIntent(tenantId, 'user-b05b', intentId);
    expect(afterPending.status).toBe('skipped');
    expect(sendMail).not.toHaveBeenCalled();

    // FAILED'a explicit geçiş → yalnız explicit reclaim geri açar (mevcut kanıtlı primitive)
    await prisma.clientNotification.update({ where: { id: intentId }, data: { status: 'FAILED', errorMessage: 'test' } });
    expect((await dispatcher.dispatchQueuedIntent(tenantId, 'user-b05b', intentId)).status).toBe('skipped'); // drain FAILED'ı işlemez
    const intentRow = await prisma.clientNotification.findUnique({ where: { id: intentId }, select: { dedupeKey: true, clientId: true } });
    const reclaim = await clientNotification.reclaimFailedNotificationSlot(tenantId, 'user-b05b', {
      clientId: intentRow!.clientId, type: 'MASRAF_GERCEKLESEN', subject: 's', body: 'b', dedupeKey: intentRow!.dedupeKey!,
    } as any);
    expect(reclaim.kind).toBe('RECLAIMED');
  });

  it('alıcı belirsiz (2 creditor CaseClient) → posting POSTED ama intent/mail YOK (broadcast yasak)', async () => {
    const pk = `amb-${suffix}`;
    const result = await service.postExpenseActual(tenantId, ambiguousCaseId, { amount: 400, postingKey: pk }, 'user-b05b');
    expect(result.success).toBe(true);
    expect(result.notification).toEqual({ outcome: 'RECIPIENT_SCOPE_AMBIGUOUS' });
    expect(await prisma.balanceLedger.count({ where: { tenantId, postingKey: pk } })).toBe(1); // finansal kayıt POSTED
    expect(await prisma.clientNotification.count({ where: { tenantId, caseId: ambiguousCaseId } })).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('generic DEBIT + reversal → typed sınıflandırma YOK, intent/mail YOK (yanlış-pozitif kapalı)', async () => {
    const before = await prisma.clientNotification.count({ where: { tenantId } });
    const deb = await service.debit(tenantId, caseId, { amount: 50, source: 'operation:haciz', sourceId: 'op-x' }, 'user-b05b');
    const debRow = await prisma.balanceLedger.findFirst({ where: { id: deb.ledgerId } });
    expect(debRow?.entryKind).toBeNull();
    expect(debRow?.postingKey).toBeNull();

    const balanceRow = await prisma.caseBalance.findUnique({ where: { caseId } });
    await prisma.$transaction(async (tx) => {
      await service.reverseExpensePaymentCreditInTransaction(tx, tenantId, caseId, {
        expensePaymentId: `rev-${suffix}`, originalBalanceLedgerId: debRow!.id, caseBalanceId: balanceRow!.id, amount: new Prisma.Decimal(10),
      }, 'user-b05b');
    });
    const revRow = await prisma.balanceLedger.findFirst({ where: { tenantId, sourceId: `rev-${suffix}` } });
    expect(revRow?.type).toBe('DEBIT');
    expect(revRow?.entryKind).toBeNull(); // reversal DEBIT'i typed DEĞİL → ikinci gerçekleşen-masraf maili imkânsız

    expect(await prisma.clientNotification.count({ where: { tenantId } })).toBe(before);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('tenant izolasyonu: AYNI postingKey iki tenantta bağımsız POST edilir; intent/veri karışmaz', async () => {
    const pk = `xtenant-${suffix}`;
    // Tenant B kendi dosyası/müvekkili
    const clientB = await prisma.client.create({ data: { tenantId: tenantBId, displayName: 'T2 Müvekkil', type: 'INDIVIDUAL', email: 't2@local.test' } });
    const caseB = await prisma.case.create({
      data: { tenantId: tenantBId, clientId: clientB.id, fileNumber: `T2-${suffix}`, type: 'GENERAL_EXECUTION', caseStatus: 'DERDEST', status: 'ACTIVE', currency: 'TRY', interestType: 'YASAL' },
    });
    await service.credit(tenantBId, caseB.id, { amount: 5000, source: 'manual' }, 'user-t2');

    const r1 = await service.postExpenseActual(tenantId, caseId, { amount: 60, postingKey: pk }, 'user-b05b');
    const r2 = await service.postExpenseActual(tenantBId, caseB.id, { amount: 70, postingKey: pk }, 'user-t2');
    expect(r1.alreadyPosted).toBe(false);
    expect(r2.alreadyPosted).toBe(false); // unique (tenantId, postingKey) — tenant-başına bağımsız
    expect(await prisma.balanceLedger.count({ where: { postingKey: pk } })).toBe(2);
    expect(await prisma.clientNotification.count({ where: { tenantId: tenantBId, type: 'MASRAF_GERCEKLESEN' } })).toBe(1);
  });

  it('STATEMENT tutarlılığı: aynı source TAM 1 EXPENSE_ACTUAL satırı (refType/refId=BalanceLedger); notification retry satır ÜRETMEZ', async () => {
    const pk = `stmt-${suffix}`;
    const posted = await service.postExpenseActual(tenantId, caseId, { amount: 800, postingKey: pk, description: 'Ekspertiz' }, 'user-b05b');
    const ledgerId = posted.ledgerId;

    // DİKKAT: ClientStatementService'in caseBalance parametresi interest-engine orchestration
    // servisi (computeCaseBalance) — advance-ledger DEĞİL. Faiz projeksiyonunu boş döndüren stub
    // yeterli (bu test faiz değil EXPENSE_ACTUAL satır kimliğini sınar).
    const interestStub: any = { computeCaseBalance: jest.fn().mockResolvedValue({ currencyResults: [] }) };
    const stmtSvc = new ClientStatementService(prisma as any, dispatcher as any, {} as any, {} as any, interestStub);
    const period = { start: new Date(Date.now() - 60 * 60 * 1000), end: new Date(Date.now() + 60 * 60 * 1000) };
    const collect = () => (stmtSvc as any).collect(tenantId, caseId, period.start, period.end, false, null);

    const first = await collect();
    const mine = first.lines.filter((l: any) => l.refType === 'BalanceLedger' && l.refId === ledgerId);
    expect(mine).toHaveLength(1); // aynı source statement'ta TAM 1
    expect(mine[0].lineType).toBe('EXPENSE_ACTUAL');
    expect(Number(mine[0].debit)).toBe(800);

    // Notification retry (drain + explicit resend denemesi) statement satırı ÜRETMEZ
    await dispatcher.drainQueuedNotifications(tenantId, 'user-b05b', 10);
    const second = await collect();
    const mine2 = second.lines.filter((l: any) => l.refType === 'BalanceLedger' && l.refId === ledgerId);
    expect(mine2).toHaveLength(1);
    // email/statement source identity tutarlı: dedupeKey aynı ledgerId'yi işaret eder
    const intent = await prisma.clientNotification.findFirst({ where: { tenantId, dedupeKey: `EXPENSE_ACTUAL_POSTED:BalanceLedger:${ledgerId}:1` } });
    expect(intent).toBeTruthy();
  });

  it('kesin SMTP red (5xx) → intent FAILED (sanitize); belirsiz hata → PENDING kalır (provider-outcome korunur)', async () => {
    const pk1 = `rej-${suffix}`;
    sendMail.mockRejectedValue(Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 }));
    const rej = await service.postExpenseActual(tenantId, caseId, { amount: 90, postingKey: pk1 }, 'user-b05b');
    const rejLedger = await prisma.balanceLedger.findFirst({ where: { tenantId, postingKey: pk1 }, select: { id: true } });
    const rejIntent = await prisma.clientNotification.findFirst({ where: { tenantId, dedupeKey: `EXPENSE_ACTUAL_POSTED:BalanceLedger:${rejLedger!.id}:1` } });
    expect(rejIntent?.status).toBe('FAILED'); // kesin red → FAILED (yalnız explicit reclaim)
    expect(rej.success).toBe(true); // finansal POSTED kayıt mail sonucundan bağımsız (outcome-6)

    const pk2 = `timeout-${suffix}`;
    sendMail.mockRejectedValue(Object.assign(new Error('connection timeout'), { code: 'ETIMEDOUT' }));
    await service.postExpenseActual(tenantId, caseId, { amount: 95, postingKey: pk2 }, 'user-b05b');
    const toLedger = await prisma.balanceLedger.findFirst({ where: { tenantId, postingKey: pk2 }, select: { id: true } });
    const toIntent = await prisma.clientNotification.findFirst({ where: { tenantId, dedupeKey: `EXPENSE_ACTUAL_POSTED:BalanceLedger:${toLedger!.id}:1` } });
    expect(toIntent?.status).toBe('PENDING'); // belirsiz → PENDING; otomatik resend YOK
  });
});
