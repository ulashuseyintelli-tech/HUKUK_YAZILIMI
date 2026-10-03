/**
 * C1-B05-A — ExpenseNotificationService.sendExpenseRequest KANONİK ZİNCİR migrasyonu.
 * Legacy hardcoded HTML + EmailProviderService KALDIRILDI → NotificationDispatcherService + EXPENSE_REQUEST
 * template + stable dedupeKey. Gerçek SMTP YOK (dispatcher mock). dispatch→business-state map + POL-4.
 */
import { ExpenseNotificationService } from '../expense-notification.service';
import { NotificationDispatcherService } from '../../client-notification/notification-dispatcher.service';
import { openingExpenseEmailReasonOfAuditDetails } from '../opening-expense-email-outcome';

const TENANT = 'tenant-x';
const USER = 'user-x';
const REQ = 'exp-req-1';

function makeRequest(overrides: any = {}) {
  return {
    id: REQ,
    clientId: 'client-1',
    caseId: 'case-1',
    totalAmount: { toNumber: () => 1250.5 },
    dueDate: new Date('2026-09-15T00:00:00Z'),
    requestItems: [
      { label: 'Harç', finalAmount: { toNumber: () => 750.5 } },
      { label: 'Tebligat', finalAmount: { toNumber: () => 500 } },
    ],
    client: { id: 'client-1', displayName: 'Av. Karşı Müvekkil', name: null, email: 'muvekkil@ornek.test', contacts: [] },
    case: {
      fileNumber: '2026/1234',
      executionFileNumber: '2026E-9999',
      executionOffice: { name: 'İcra Dairesi' },
      debtors: [],
    },
    status: 'PENDING',
    ...overrides,
  };
}

/**
 * `notificationStatus`: dağıtıcının `skipped` ile işaret ettiği MEVCUT ClientNotification satırının durumu.
 * Verilmezse satır bulunamaz (null) — `skipped` senaryosu satır durumunu AÇIKÇA vermek zorundadır.
 * `dispatcherOverride`: mock yerine gerçek NotificationDispatcherService bağlamak için.
 */
function makeService(
  dispatchResult: any,
  opts: { requestStatus?: string; notificationStatus?: string; notificationError?: string; dispatcherOverride?: (prisma: any) => any } = {},
) {
  const auditCreate = jest.fn().mockResolvedValue({});
  const taskCreate = jest.fn().mockResolvedValue({});
  // Talep SENT geçişi: atomik koşullu güncelleme (status != SENT). Durum bellekte tutulur → ikinci çağrı count=0 görür.
  const requestState = { status: opts.requestStatus ?? 'PENDING' };
  const reqUpdate = jest.fn(async () => {
    if (requestState.status === 'SENT') return { count: 0 };
    requestState.status = 'SENT';
    return { count: 1 };
  });
  const notificationFindFirst = jest
    .fn()
    .mockResolvedValue(opts.notificationStatus ? { status: opts.notificationStatus, errorMessage: opts.notificationError ?? null } : null);
  const tx = {
    expenseRequest: {
      updateMany: reqUpdate,
    },
    expenseAuditLog: { create: auditCreate },
    task: { create: taskCreate },
  };
  const prisma: any = {
    expenseRequest: { findFirst: jest.fn().mockResolvedValue(makeRequest()) },
    office: { findFirst: jest.fn().mockResolvedValue({ name: 'Telli Hukuk', phone: '0212', email: 'ofis@x', bankAccounts: [{ iban: 'TR11' }] }) },
    expenseAuditLog: { create: auditCreate },
    clientNotification: { findFirst: notificationFindFirst },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const dispatcher: any = opts.dispatcherOverride
    ? opts.dispatcherOverride(prisma)
    : { dispatch: jest.fn().mockResolvedValue(dispatchResult) };
  const configService: any = { get: jest.fn().mockReturnValue(undefined) };
  const emailProvider: any = { send: jest.fn() };
  const svc = new ExpenseNotificationService(prisma, emailProvider, configService, dispatcher);
  return { svc, prisma, dispatcher, emailProvider, auditCreate, taskCreate, reqUpdate, notificationFindFirst, tx };
}

describe('W4 içerik sözleşmesi — IBAN fail-closed + accountHolder/paymentReference + item description', () => {
  it('0 default hesap → PAYMENT_ACCOUNT_INVALID fail-closed (dispatch=0 + güvenli audit)', async () => {
    const { svc, prisma, dispatcher, auditCreate } = makeService({ status: 'sent', notificationId: 'n-1' });
    prisma.office.findFirst.mockResolvedValue({ name: 'Telli Hukuk', phone: '0212', email: 'ofis@x', bankAccounts: [] });
    const result = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, reason: 'PAYMENT_ACCOUNT_INVALID' });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'EMAIL_FAILED', details: expect.objectContaining({ outcome: 'default-account-missing' }) }),
    }));
  });

  it('>1 default hesap → keyfî seçim YOK; PAYMENT_ACCOUNT_INVALID fail-closed', async () => {
    const { svc, prisma, dispatcher } = makeService({ status: 'sent', notificationId: 'n-1' });
    prisma.office.findFirst.mockResolvedValue({ name: 'Telli Hukuk', phone: '0212', email: 'ofis@x', bankAccounts: [{ iban: 'TR11' }, { iban: 'TR22' }] });
    const result = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, reason: 'PAYMENT_ACCOUNT_INVALID' });
  });

  it('tek default hesap ama IBAN boş → IBAN_MISSING fail-closed', async () => {
    const { svc, prisma, dispatcher, auditCreate } = makeService({ status: 'sent', notificationId: 'n-1' });
    prisma.office.findFirst.mockResolvedValue({ name: 'Telli Hukuk', phone: '0212', email: 'ofis@x', bankAccounts: [{ iban: null }] });
    const result = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, reason: 'IBAN_MISSING' });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ details: expect.objectContaining({ outcome: 'iban-missing-fail-closed' }) }),
    }));
  });

  it('kalem yok / sıfır tutar → ITEMS_MISSING / AMOUNT_INVALID fail-closed', async () => {
    const a = makeService({ status: 'sent', notificationId: 'n-1' });
    a.prisma.expenseRequest.findFirst.mockResolvedValue(makeRequest({ requestItems: [] }));
    expect(await a.svc.sendExpenseRequest(TENANT, REQ, USER)).toEqual({ success: false, reason: 'ITEMS_MISSING' });
    const b = makeService({ status: 'sent', notificationId: 'n-1' });
    b.prisma.expenseRequest.findFirst.mockResolvedValue(makeRequest({
      requestItems: [{ label: 'Harç', finalAmount: { toNumber: () => 0 } }],
    }));
    expect(await b.svc.sendExpenseRequest(TENANT, REQ, USER)).toEqual({ success: false, reason: 'AMOUNT_INVALID' });
    expect(a.dispatcher.dispatch).not.toHaveBeenCalled();
    expect(b.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('tokens: accountHolder (default hesap/office unvanı) + paymentReference (client-safe) + IBAN', async () => {
    const { svc, dispatcher } = makeService({ status: 'sent', notificationId: 'n-1' });
    await svc.sendExpenseRequest(TENANT, REQ, USER);
    const tokens = dispatcher.dispatch.mock.calls[0][2].tokens;
    expect(tokens.officeIban).toBe('TR11');
    expect(tokens.accountHolder).toBe('Telli Hukuk'); // accountName yok → Office unvanı
    expect(tokens.paymentReference).toBe('2026/1234 - Masraf avansı'); // R02 client-safe biçim; raw iç-ID YOK
  });

  it('items token kalem AÇIKLAMASINI taşır; açıklama etikete eşitse tekrarlanmaz', async () => {
    const { svc, prisma, dispatcher } = makeService({ status: 'sent', notificationId: 'n-1' });
    prisma.expenseRequest.findFirst.mockResolvedValue(makeRequest({
      requestItems: [
        { itemCode: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', finalAmount: { toNumber: () => 500 }, description: 'İki adet tebligat gönderimi' },
        { itemCode: 'HARC', label: 'Harç', finalAmount: { toNumber: () => 750.5 }, description: 'Harç' }, // etiketle aynı → tekrar yok
      ],
    }));
    await svc.sendExpenseRequest(TENANT, REQ, USER);
    const items = dispatcher.dispatch.mock.calls[0][2].tokens.items as string;
    // R02: müvekkil yüzeyi SENTENCE-CASE clientLabel kullanır.
    expect(items).toContain('- Tebligat gideri: 500,00 TL — İki adet tebligat gönderimi');
    expect(items).toContain('- Harç: 750,50 TL');
    expect(items).not.toContain('Harç: 750,50 TL — Harç');
  });
});

describe('C1-B05-A ExpenseNotificationService migration', () => {
  it('EmailProviderService’e GİTMEZ; dispatcher EXPENSE_REQUEST + stable dedupeKey ile çağrılır', async () => {
    const { svc, dispatcher, emailProvider } = makeService({ status: 'sent', notificationId: 'n-1' });
    await svc.sendExpenseRequest(TENANT, REQ, USER);

    expect(emailProvider.send).not.toHaveBeenCalled(); // legacy bypass kaldırıldı
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    const [t, u, input] = dispatcher.dispatch.mock.calls[0];
    expect(t).toBe(TENANT);
    expect(u).toBe(USER);
    expect(input.templateCode).toBe('EXPENSE_REQUEST');
    expect(input.type).toBe('MASRAF_ISTEK');
    expect(input.dedupeKey).toBe('EXPENSE_REQUEST:ExpenseRequest:exp-req-1:1'); // stable domain key, timestamp YOK
    expect(input.refType).toBe('ExpenseRequest');
    expect(input.refId).toBe(REQ);
    expect(input.clientId).toBe('client-1');
  });

  it('POL-4 + tr-TR: token’lar insan-okur; raw iç-ID yok; tutar tr-TR', async () => {
    const { svc, dispatcher } = makeService({ status: 'sent', notificationId: 'n-1' });
    await svc.sendExpenseRequest(TENANT, REQ, USER);
    const tokens = dispatcher.dispatch.mock.calls[0][2].tokens;

    expect(tokens.caseFileNumber).toBe('2026/1234');
    expect(tokens.executionFileNumber).toBe('2026E-9999');
    expect(tokens.clientName).toBe('Av. Karşı Müvekkil');
    expect(tokens.totalAmount).toBe('1.250,50'); // tr-TR
    expect(tokens.items).toContain('Harç');
    expect(tokens.items).toContain('750,50');
    // POL-4: hiçbir token raw iç-ID (cuid / caseClientId / collectionDispositionId) taşımaz
    const serialized = JSON.stringify(tokens);
    expect(serialized).not.toMatch(/\b[a-z0-9]{20,}\b/);
    for (const k of ['caseClientId', 'collectionDispositionId', 'sourceCollectionId', 'clientId', 'caseId'])
      expect(serialized).not.toContain(k);
  });

  it('dispatch sent → ExpenseRequest SENT + audit + task (ilk geçiş)', async () => {
    const { svc, reqUpdate, auditCreate, taskCreate } = makeService({ status: 'sent', notificationId: 'n-1' }, { requestStatus: 'PENDING' });
    const res = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(res).toMatchObject({ success: true, notificationId: 'n-1' });
    expect(reqUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'EMAIL_SENT' }) }));
    // Geçiş TEK atomik koşullu güncelleme: kiracı + "zaten SENT değil" koşulu aynı sorguda
    expect(reqUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: REQ, tenantId: TENANT, status: { not: 'SENT' } } }));
    expect(taskCreate).toHaveBeenCalledTimes(1);
  });

  it('dispatch skipped + bildirim satırı SENT + talep zaten SENT → idempotent reconcile: duplicate audit/task ÜRETİLMEZ', async () => {
    const { svc, reqUpdate, auditCreate, taskCreate } = makeService(
      { status: 'skipped', notificationId: 'ex-1' },
      { requestStatus: 'SENT', notificationStatus: 'SENT' },
    );
    const res = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(res).toMatchObject({ success: true });
    await expect(reqUpdate.mock.results[0].value).resolves.toEqual({ count: 0 }); // zaten SENT: koşullu güncelleme hiçbir satırı değiştirmez
    expect(auditCreate).not.toHaveBeenCalled();
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('dispatch failed → ExpenseRequest SENT OLMAZ; güvenli EMAIL_FAILED audit (raw error yok)', async () => {
    const { svc, reqUpdate, taskCreate, auditCreate } = makeService({ status: 'failed', dedupeKey: 'k', error: 'SMTP timeout raw detail' });
    const res = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(res).toMatchObject({ success: false });
    expect(reqUpdate).not.toHaveBeenCalled();
    expect(taskCreate).not.toHaveBeenCalled();
    const failAudit = auditCreate.mock.calls.find((c: any[]) => c[0]?.data?.action === 'EMAIL_FAILED');
    expect(failAudit).toBeDefined();
    // Güvenli: raw provider error audit detayına yazılmaz
    expect(JSON.stringify(failAudit[0].data.details)).not.toContain('SMTP timeout raw detail');
  });
});

/**
 * `skipped` = dağıtıcı aynı dedupeKey için MEVCUT satır buldu ve ikinci gönderim yapmadı. Mevcut satır SENT de
 * olabilir, PENDING (sürüyor / belirsiz) ya da FAILED de (G4 Inv-1). ExpenseRequest SENT / EMAIL_SENT / görev
 * YALNIZ satır gerçekten SENT ise yazılır; aksi halde e-posta gönderilmeden talep "gönderildi" olmaz.
 */
describe('dispatch skipped — talep SENT yalnız mevcut bildirim satırı gerçekten SENT ise', () => {
  const DEDUPE_KEY = 'EXPENSE_REQUEST:ExpenseRequest:exp-req-1:1';
  const emailSentAudits = (auditCreate: jest.Mock) => auditCreate.mock.calls.filter((c: any[]) => c[0]?.data?.action === 'EMAIL_SENT');
  const emailFailedAudits = (auditCreate: jest.Mock) => auditCreate.mock.calls.filter((c: any[]) => c[0]?.data?.action === 'EMAIL_FAILED');

  it('bildirim satırı SENT + talep PENDING → reconcile: talep SENT + EMAIL_SENT (reconciled) + görev', async () => {
    const { svc, reqUpdate, auditCreate, taskCreate, notificationFindFirst } = makeService(
      { status: 'skipped', notificationId: 'ex-1' },
      { requestStatus: 'PENDING', notificationStatus: 'SENT' },
    );
    const res = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(res).toEqual({ success: true, notificationId: 'ex-1' });
    expect(reqUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', sentVia: 'EMAIL' }) }));
    expect(emailSentAudits(auditCreate)).toHaveLength(1);
    expect(emailSentAudits(auditCreate)[0][0].data.details).toEqual({ via: 'dispatcher', notificationId: 'ex-1', reconciled: true });
    expect(emailFailedAudits(auditCreate)).toHaveLength(0);
    expect(taskCreate).toHaveBeenCalledTimes(1);
    // Satır dağıtıcının verdiği kimlik + kiracı + dedupeKey ile yeniden doğrulanır; yalnız durum okunur.
    expect(notificationFindFirst).toHaveBeenCalledTimes(1);
    expect(notificationFindFirst).toHaveBeenCalledWith({
      where: { id: 'ex-1', tenantId: TENANT, dedupeKey: DEDUPE_KEY },
      select: { status: true },
    });
  });

  it.each([
    ['FAILED', 'existing-notification-failed', 'EXISTING_NOTIFICATION_FAILED', { reason: 'DELIVERY_REJECTED', retried: true }],
    ['PENDING', 'existing-notification-pending', 'EXISTING_NOTIFICATION_PENDING', { reason: 'DELIVERY_UNCERTAIN' }],
    // SENT / PENDING / FAILED dışındaki her durum doğrulanamadı sayılır (fail-closed); neden alanı yazılmaz
    ['QUEUED', 'existing-notification-unverified', 'EXISTING_NOTIFICATION_UNVERIFIED', {}],
  ])('bildirim satırı %s → talep durumu DEĞİŞMEZ, EMAIL_SENT / görev YOK; EMAIL_FAILED existingNotification=%s + yanıt nedeni %s', async (rowStatus, outcome, reason, auditReason) => {
    const { svc, prisma, reqUpdate, auditCreate, taskCreate } = makeService(
      { status: 'skipped', notificationId: 'ex-1' },
      { requestStatus: 'PENDING', notificationStatus: rowStatus },
    );
    const res = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(res).toEqual({ success: false, reason });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(reqUpdate).not.toHaveBeenCalled();
    expect(taskCreate).not.toHaveBeenCalled();
    expect(emailSentAudits(auditCreate)).toHaveLength(0);
    expect(emailFailedAudits(auditCreate)).toHaveLength(1);
    expect(emailFailedAudits(auditCreate)[0][0].data).toEqual({
      expenseRequestId: REQ,
      action: 'EMAIL_FAILED',
      details: { via: 'dispatcher', outcome: 'delivery-not-confirmed', ...auditReason, existingNotification: outcome, notificationId: 'ex-1' },
      userId: USER,
    });
  });

  /**
   * Birleşik davranış (#2889 ile): dosya sayfası ve açılış sonucu SON EMAIL_* kaydını okur. Tekrar çağrının kaydı, ilk
   * denemenin ÖZEL nedenini genel "doğrulanamadı"ya düşürmemeli.
   */
  it.each([
    ['FAILED', 'recipient-missing', 'RECIPIENT_MISSING'],
    ['FAILED', 'smtp-not-configured', 'SMTP_NOT_CONFIGURED'],
    ['PENDING', null, 'DELIVERY_UNCERTAIN'],
  ] as const)('tekrar çağrının EMAIL_FAILED kaydı satır nedenini korur: satır %s / %s → dosya sayfası nedeni %s', async (rowStatus, errorMessage, expected) => {
    const { svc, auditCreate } = makeService(
      { status: 'skipped', notificationId: 'ex-1' },
      { requestStatus: 'PENDING', notificationStatus: rowStatus, notificationError: errorMessage ?? undefined },
    );
    await svc.sendExpenseRequest(TENANT, REQ, USER);
    const details = emailFailedAudits(auditCreate)[0][0].data.details;
    expect(openingExpenseEmailReasonOfAuditDetails(details)).toBe(expected);
    expect(JSON.stringify(details)).not.toContain(String(errorMessage ?? 'yok-yok-yok-yok'));
  });

  it('doğrulanamayan satırda tekrar çağrının kaydı genel neden verir (tahmin yok)', async () => {
    const { svc, auditCreate } = makeService({ status: 'skipped', notificationId: 'ex-1' }, { requestStatus: 'PENDING', notificationStatus: 'QUEUED' });
    await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(openingExpenseEmailReasonOfAuditDetails(emailFailedAudits(auditCreate)[0][0].data.details)).toBe('DELIVERY_NOT_CONFIRMED');
  });

  it('bildirim satırı bulunamadı (başka kiracı / başka anahtar / silinmiş) → fail-closed: SENT yazılmaz', async () => {
    // notificationStatus verilmedi → findFirst null
    const { svc, reqUpdate, auditCreate, taskCreate, notificationFindFirst } = makeService({ status: 'skipped', notificationId: 'ex-1' });
    const res = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(res).toEqual({ success: false, reason: 'EXISTING_NOTIFICATION_UNVERIFIED' });
    expect(notificationFindFirst).toHaveBeenCalledTimes(1);
    expect(reqUpdate).not.toHaveBeenCalled();
    expect(taskCreate).not.toHaveBeenCalled();
    expect(emailSentAudits(auditCreate)).toHaveLength(0);
    expect(emailFailedAudits(auditCreate)[0][0].data.details).toEqual({ via: 'dispatcher', outcome: 'delivery-not-confirmed', existingNotification: 'existing-notification-unverified', notificationId: 'ex-1' });
  });

  it('skipped bildirim kimliği taşımıyorsa satır aranmaz → fail-closed: SENT yazılmaz', async () => {
    const { svc, reqUpdate, auditCreate, taskCreate, notificationFindFirst } = makeService({ status: 'skipped' }, { notificationStatus: 'SENT' });
    const res = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(res).toEqual({ success: false, reason: 'EXISTING_NOTIFICATION_UNVERIFIED' });
    expect(notificationFindFirst).not.toHaveBeenCalled();
    expect(reqUpdate).not.toHaveBeenCalled();
    expect(taskCreate).not.toHaveBeenCalled();
    expect(emailSentAudits(auditCreate)).toHaveLength(0);
    expect(emailFailedAudits(auditCreate)[0][0].data.details).toEqual({ via: 'dispatcher', outcome: 'delivery-not-confirmed', existingNotification: 'existing-notification-unverified', notificationId: null });
  });

  it('dispatch sent → bildirim satırı OKUNMAZ (normal gönderim yolunda ek sorgu yok)', async () => {
    const { svc, notificationFindFirst } = makeService({ status: 'sent', notificationId: 'n-1' }, { notificationStatus: 'FAILED' });
    const res = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(res).toEqual({ success: true, notificationId: 'n-1' });
    expect(notificationFindFirst).not.toHaveBeenCalled();
  });

  /**
   * Dikiş testi: dağıtıcı MOCK DEĞİL. Gerçek NotificationDispatcherService, claim `ACQUIRED` değilse üç durumda
   * da (EXISTING_SENT / EXISTING_PENDING / EXISTING_FAILED) `skipped` döner; masraf servisi bunları ayırt etmek
   * zorundadır. Dağıtıcının `skipped` sözleşmesi değişirse bu test görür.
   */
  describe('gerçek NotificationDispatcherService ile (claim sonucu → talep durumu)', () => {
    function wire(claimKind: 'EXISTING_SENT' | 'EXISTING_PENDING' | 'EXISTING_FAILED', rowStatus: string) {
      const clientNotification: any = {
        claimNotificationSlot: jest.fn().mockResolvedValue({ kind: claimKind, notificationId: 'ex-1' }),
        reclaimFailedNotificationSlot: jest.fn(),
        sendEmail: jest.fn(),
      };
      const messageTemplate: any = {
        findByCode: jest.fn().mockResolvedValue({ id: 'tpl-1', subject: 'Masraf Talebi', body: 'Gövde' }),
        renderTemplate: jest.fn().mockReturnValue({ subject: 'Masraf Talebi', body: 'Gövde' }),
      };
      const made = makeService(undefined, {
        requestStatus: 'PENDING',
        notificationStatus: rowStatus,
        dispatcherOverride: (prisma) => new NotificationDispatcherService(prisma, clientNotification, messageTemplate),
      });
      const dispatchSpy = jest.spyOn(made.dispatcher, 'dispatch');
      return { ...made, clientNotification, dispatchSpy };
    }

    it('claim EXISTING_PENDING → dağıtıcı skipped; e-posta gönderilmez, talep SENT OLMAZ, reclaim DENENMEZ', async () => {
      const { svc, clientNotification, dispatchSpy, reqUpdate, auditCreate, taskCreate } = wire('EXISTING_PENDING', 'PENDING');
      const res = await svc.sendExpenseRequest(TENANT, REQ, USER);

      await expect(dispatchSpy.mock.results[0].value).resolves.toEqual({ status: 'skipped', notificationId: 'ex-1', dedupeKey: DEDUPE_KEY });
      expect(dispatchSpy).toHaveBeenCalledTimes(1); // bekleyen / belirsiz satır: ikinci (force) çağrı YOK
      expect(clientNotification.sendEmail).not.toHaveBeenCalled();
      expect(clientNotification.reclaimFailedNotificationSlot).not.toHaveBeenCalled();
      expect(res).toEqual({ success: false, reason: 'EXISTING_NOTIFICATION_PENDING' });
      expect(reqUpdate).not.toHaveBeenCalled();
      expect(taskCreate).not.toHaveBeenCalled();
      expect(emailSentAudits(auditCreate)).toHaveLength(0);
    });

    /**
     * Bildirim satırı bir DURUM MAKİNESİ: claim mevcut durumu döner; reclaim yalnız FAILED→PENDING geçirir ve
     * kontrol-yaz arası await içermez (advisory lock altındaki atomik geçişin benzetimi); sendEmail SENT / FAILED yazar
     * ya da belirsiz sonuçta PENDING bırakır.
     */
    function machine(initial: 'FAILED' | 'PENDING' | 'SENT', send: 'ok' | 'uncertain' | 'rejected', errorMessage: string | null = 'recipient-missing') {
      const row = { status: initial as string, errorMessage: initial === 'FAILED' ? errorMessage : null };
      const clientNotification: any = {
        claimNotificationSlot: jest.fn(async () => ({ kind: `EXISTING_${row.status}`, notificationId: 'ex-1' })),
        reclaimFailedNotificationSlot: jest.fn(async () => {
          if (row.status === 'SENT') return { kind: 'EXISTING_SENT', notificationId: 'ex-1' };
          if (row.status === 'PENDING') return { kind: 'EXISTING_PENDING', notificationId: 'ex-1' };
          row.status = 'PENDING';
          row.errorMessage = null;
          return { kind: 'RECLAIMED', notificationId: 'ex-1' };
        }),
        sendEmail: jest.fn(async () => {
          await new Promise((r) => setTimeout(r, 40));
          if (send === 'ok') {
            row.status = 'SENT';
            return { success: true, notificationId: 'ex-1' };
          }
          if (send === 'rejected') {
            row.status = 'FAILED';
            row.errorMessage = '550 kesin red';
            throw new Error('E-posta gönderilemedi (kesin red)');
          }
          throw new Error('E-posta gönderim sonucu belirsiz'); // satır PENDING kalır (zaman aşımı)
        }),
      };
      const messageTemplate: any = {
        findByCode: jest.fn().mockResolvedValue({ id: 'tpl-1', subject: 'Masraf Talebi', body: 'Gövde' }),
        renderTemplate: jest.fn().mockReturnValue({ subject: 'Masraf Talebi', body: 'Gövde' }),
      };
      const made = makeService(undefined, {
        requestStatus: 'PENDING',
        dispatcherOverride: (prisma) => new NotificationDispatcherService(prisma, clientNotification, messageTemplate),
      });
      made.notificationFindFirst.mockImplementation(async () => ({ status: row.status, errorMessage: row.errorMessage }));
      return { ...made, row, clientNotification, dispatchSpy: jest.spyOn(made.dispatcher, 'dispatch') };
    }

    it('FAILED satır + gönderim başarılı → aynı uç TEK deneme yapar: reclaim, tek e-posta, talep SENT, EMAIL_SENT (retried), görev', async () => {
      const { svc, row, clientNotification, dispatchSpy, reqUpdate, auditCreate, taskCreate } = machine('FAILED', 'ok');
      const res = await svc.sendExpenseRequest(TENANT, REQ, USER);

      expect(res).toEqual({ success: true, notificationId: 'ex-1' });
      expect(dispatchSpy).toHaveBeenCalledTimes(2);
      expect(dispatchSpy.mock.calls[0][2]).not.toHaveProperty('force');
      expect(dispatchSpy.mock.calls[1][2]).toMatchObject({ force: true, dedupeKey: DEDUPE_KEY, templateCode: 'EXPENSE_REQUEST' });
      expect(clientNotification.reclaimFailedNotificationSlot).toHaveBeenCalledTimes(1);
      expect(clientNotification.sendEmail).toHaveBeenCalledTimes(1);
      expect(clientNotification.sendEmail.mock.calls[0][2]).toMatchObject({ reuseNotificationId: 'ex-1', dedupeKey: DEDUPE_KEY });
      expect(row.status).toBe('SENT');
      expect(reqUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', sentVia: 'EMAIL' }) }));
      expect(emailSentAudits(auditCreate)).toHaveLength(1);
      expect(emailSentAudits(auditCreate)[0][0].data.details).toEqual({ via: 'dispatcher', notificationId: 'ex-1', reconciled: false, retried: true });
      expect(emailFailedAudits(auditCreate)).toHaveLength(0);
      expect(taskCreate).toHaveBeenCalledTimes(1);
    });

    it('FAILED satır + yeniden denemede ZAMAN AŞIMI / belirsiz sonuç → satır PENDING kalır; talep SENT OLMAZ, "gönderilmedi" kesinliği iddia edilmez', async () => {
      const { svc, row, clientNotification, reqUpdate, auditCreate, taskCreate } = machine('FAILED', 'uncertain');
      const res = await svc.sendExpenseRequest(TENANT, REQ, USER);

      expect(clientNotification.sendEmail).toHaveBeenCalledTimes(1);
      expect(row.status).toBe('PENDING');
      expect(res).toEqual({ success: false, reason: 'DELIVERY_UNCERTAIN' });
      expect(reqUpdate).not.toHaveBeenCalled();
      expect(taskCreate).not.toHaveBeenCalled();
      expect(emailSentAudits(auditCreate)).toHaveLength(0);
      expect(emailFailedAudits(auditCreate)[0][0].data.details).toEqual({
        via: 'dispatcher',
        outcome: 'delivery-not-confirmed',
        reason: 'DELIVERY_UNCERTAIN',
        retried: true,
      });
    });

    it('FAILED satır + yeniden denemede KESİN RED → satır FAILED; talep SENT OLMAZ, neden korunur (ham metin yok)', async () => {
      const { svc, row, clientNotification, reqUpdate, auditCreate, taskCreate } = machine('FAILED', 'rejected');
      const res = await svc.sendExpenseRequest(TENANT, REQ, USER);

      expect(clientNotification.sendEmail).toHaveBeenCalledTimes(1);
      expect(row.status).toBe('FAILED');
      expect(res).toEqual({ success: false, reason: 'DELIVERY_REJECTED' });
      expect(reqUpdate).not.toHaveBeenCalled();
      expect(taskCreate).not.toHaveBeenCalled();
      expect(emailFailedAudits(auditCreate)[0][0].data.details).toEqual({
        via: 'dispatcher',
        outcome: 'delivery-not-confirmed',
        reason: 'DELIVERY_REJECTED',
        retried: true,
      });
      expect(JSON.stringify(auditCreate.mock.calls)).not.toContain('550 kesin red');
    });

    it('EŞZAMANLI iki tıklama (FAILED satır) → reclaim yarışını yalnız biri kazanır: TEK e-posta, tek EMAIL_SENT, tek görev; kaybeden PENDING görür ve denemez', async () => {
      const { svc, row, clientNotification, reqUpdate, auditCreate, taskCreate } = machine('FAILED', 'ok');
      const [a, b] = await Promise.all([
        svc.sendExpenseRequest(TENANT, REQ, USER),
        svc.sendExpenseRequest(TENANT, REQ, USER),
      ]);

      expect(clientNotification.sendEmail).toHaveBeenCalledTimes(1);
      expect(row.status).toBe('SENT');
      const sonuclar = [a, b];
      expect(sonuclar.filter((r) => r.success === true)).toHaveLength(1);
      expect(sonuclar.filter((r) => r.success === false)).toEqual([{ success: false, reason: 'EXISTING_NOTIFICATION_PENDING' }]);
      expect(reqUpdate).toHaveBeenCalledTimes(1);
      expect(emailSentAudits(auditCreate)).toHaveLength(1);
      expect(taskCreate).toHaveBeenCalledTimes(1);
    });

    it('EŞZAMANLI iki mutabakat (satır SENT, talep PENDING) → talep tek kez SENT olur: TEK EMAIL_SENT, TEK görev', async () => {
      const { svc, clientNotification, reqUpdate, auditCreate, taskCreate } = machine('SENT', 'ok');
      const [a, b] = await Promise.all([
        svc.sendExpenseRequest(TENANT, REQ, USER),
        svc.sendExpenseRequest(TENANT, REQ, USER),
      ]);

      expect(a).toEqual({ success: true, notificationId: 'ex-1' });
      expect(b).toEqual({ success: true, notificationId: 'ex-1' });
      expect(clientNotification.sendEmail).not.toHaveBeenCalled();
      expect(reqUpdate).toHaveBeenCalledTimes(2); // ikisi de geçişi dener
      expect(emailSentAudits(auditCreate)).toHaveLength(1); // yalnız count=1 olan yazar
      expect(taskCreate).toHaveBeenCalledTimes(1);
    });

    it.each(['PENDING', 'SENT'] as const)('%s satır → yeniden deneme YOK (reclaim ve e-posta gönderimi çağrılmaz)', async (initial) => {
      const { svc, clientNotification, dispatchSpy } = machine(initial, 'ok');
      await svc.sendExpenseRequest(TENANT, REQ, USER);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(clientNotification.reclaimFailedNotificationSlot).not.toHaveBeenCalled();
      expect(clientNotification.sendEmail).not.toHaveBeenCalled();
    });

    it('claim EXISTING_SENT → dağıtıcı skipped; mükerrer e-posta yok, talep SENT (reconcile)', async () => {
      const { svc, clientNotification, dispatchSpy, reqUpdate, auditCreate, taskCreate } = wire('EXISTING_SENT', 'SENT');
      const res = await svc.sendExpenseRequest(TENANT, REQ, USER);

      await expect(dispatchSpy.mock.results[0].value).resolves.toEqual({ status: 'skipped', notificationId: 'ex-1', dedupeKey: DEDUPE_KEY });
      expect(clientNotification.sendEmail).not.toHaveBeenCalled();
      expect(res).toEqual({ success: true, notificationId: 'ex-1' });
      expect(reqUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }));
      expect(emailSentAudits(auditCreate)).toHaveLength(1);
      expect(taskCreate).toHaveBeenCalledTimes(1);
    });
  });
});
