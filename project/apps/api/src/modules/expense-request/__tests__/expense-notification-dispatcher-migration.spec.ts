/**
 * C1-B05-A — ExpenseNotificationService.sendExpenseRequest KANONİK ZİNCİR migrasyonu.
 * Legacy hardcoded HTML + EmailProviderService KALDIRILDI → NotificationDispatcherService + EXPENSE_REQUEST
 * template + stable dedupeKey. Gerçek SMTP YOK (dispatcher mock). dispatch→business-state map + POL-4.
 */
import { ExpenseNotificationService } from '../expense-notification.service';

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

function makeService(dispatchResult: any, opts: { requestStatus?: string } = {}) {
  const auditCreate = jest.fn().mockResolvedValue({});
  const taskCreate = jest.fn().mockResolvedValue({});
  const reqUpdate = jest.fn().mockResolvedValue({});
  const tx = {
    expenseRequest: {
      findUnique: jest.fn().mockResolvedValue({ status: opts.requestStatus ?? 'PENDING' }),
      update: reqUpdate,
    },
    expenseAuditLog: { create: auditCreate },
    task: { create: taskCreate },
  };
  const prisma: any = {
    expenseRequest: { findFirst: jest.fn().mockResolvedValue(makeRequest()) },
    office: { findFirst: jest.fn().mockResolvedValue({ name: 'Telli Hukuk', phone: '0212', email: 'ofis@x', bankAccounts: [{ iban: 'TR11' }] }) },
    expenseAuditLog: { create: auditCreate },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const dispatcher: any = { dispatch: jest.fn().mockResolvedValue(dispatchResult) };
  const configService: any = { get: jest.fn().mockReturnValue(undefined) };
  const emailProvider: any = { send: jest.fn() };
  const svc = new ExpenseNotificationService(prisma, emailProvider, configService, dispatcher);
  return { svc, prisma, dispatcher, emailProvider, auditCreate, taskCreate, reqUpdate, tx };
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
    expect(taskCreate).toHaveBeenCalledTimes(1);
  });

  it('dispatch skipped + zaten SENT → idempotent reconcile: duplicate audit/task ÜRETİLMEZ', async () => {
    const { svc, reqUpdate, auditCreate, taskCreate } = makeService({ status: 'skipped', notificationId: 'ex-1' }, { requestStatus: 'SENT' });
    const res = await svc.sendExpenseRequest(TENANT, REQ, USER);
    expect(res).toMatchObject({ success: true });
    expect(reqUpdate).not.toHaveBeenCalled();
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
