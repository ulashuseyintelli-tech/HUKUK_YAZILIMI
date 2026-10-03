import { Prisma } from '@prisma/client';
import { ExpenseNotificationService } from '../expense-notification.service';
import { ExpenseRequestService } from '../expense-request.service';
import {
  buildOpeningExpenseEmailNotSentOutcome,
  buildOpeningExpenseEmailNotSentStatus,
  buildOpeningExpenseEmailResultPendingOutcome,
  describeOpeningExpenseEmailFailure,
  EXPENSE_EMAIL_DISPATCH_FAILURE_REASONS,
  OPENING_EXPENSE_EMAIL_REASON_CODES,
  OPENING_EXPENSE_EMAIL_WAIT_MS,
  openingExpenseEmailReasonOfAuditDetails,
} from '../opening-expense-email-outcome';

/**
 * Açılış masraf talebi — masraf e-postası GÖNDERİLEMEDİ sonucu (saf karar + servis; veritabanı ve SMTP yok).
 *
 * Ölçülen kusur (main 6681b1d5): e-posta gönderilemediğinde talep PENDING kalıyor, kullanıcıya hiçbir şey gösterilmiyor,
 * günlük "Masraf talebi maili gönderildi" yazıyordu. Owner kararı (2026-10-01): neden kullanıcıya gösterilir (dosya açılış
 * yanıtı, dosya sayfası, görev). Bu testler nedenin NASIL adlandırıldığını ve kaydedildiğini sabitler; e-postanın
 * gönderilme kuralları (owner sözleşmesi W4) burada değişmez.
 */
describe('açılış masraf e-postası sonucu — saf karar', () => {
  it('yanıt bekleme süresi owner kararıyla 10 saniyedir', () => {
    expect(OPENING_EXPENSE_EMAIL_WAIT_MS).toBe(10_000);
  });

  it.each([
    ['default-account-missing', 'PAYMENT_ACCOUNT_MISSING'],
    ['default-account-ambiguous', 'PAYMENT_ACCOUNT_AMBIGUOUS'],
    ['iban-missing-fail-closed', 'PAYMENT_IBAN_MISSING'],
    ['account-holder-missing', 'PAYMENT_ACCOUNT_HOLDER_MISSING'],
    ['items-missing', 'REQUEST_ITEMS_INVALID'],
    ['non-positive-amount', 'REQUEST_ITEMS_INVALID'],
  ])('kapalı kapı kaydı %s → %s', (outcome, reasonCode) => {
    expect(openingExpenseEmailReasonOfAuditDetails({ via: 'dispatcher', outcome })).toBe(reasonCode);
  });

  it.each([...EXPENSE_EMAIL_DISPATCH_FAILURE_REASONS])('dağıtım başarısız kaydındaki güvenli neden %s aynen okunur', (reason) => {
    expect(openingExpenseEmailReasonOfAuditDetails({ via: 'dispatcher', outcome: 'delivery-not-confirmed', reason })).toBe(reason);
  });

  it.each([
    ['eski kayıt (neden alanı yok)', { via: 'dispatcher', outcome: 'delivery-not-confirmed' }],
    ['tanınmayan neden', { outcome: 'delivery-not-confirmed', reason: 'SMTP 550 5.1.1 user unknown' }],
    ['dağıtıcıya ait olmayan neden kodu', { outcome: 'delivery-not-confirmed', reason: 'PAYMENT_ACCOUNT_MISSING' }],
    ['tanınmayan sonuç kodu', { outcome: 'something-new' }],
    ['ayrıntı yok', null],
    ['dizi', ['default-account-missing']],
    ['metin', 'default-account-missing'],
  ])('%s → tahmin edilmez: DELIVERY_NOT_CONFIRMED', (_title, details) => {
    expect(openingExpenseEmailReasonOfAuditDetails(details)).toBe('DELIVERY_NOT_CONFIRMED');
  });

  it('kapalı kapı kaydındaki neden alanı kapı kodunun önüne geçmez', () => {
    expect(openingExpenseEmailReasonOfAuditDetails({ outcome: 'iban-missing-fail-closed', reason: 'RECIPIENT_MISSING' })).toBe('PAYMENT_IBAN_MISSING');
  });

  it.each([...OPENING_EXPENSE_EMAIL_REASON_CODES])('%s: neden cümlesi, gereken bilgi ve görev başlığı tanımlıdır; tutar / kimlik içermez', (reasonCode) => {
    const failure = describeOpeningExpenseEmailFailure(reasonCode);

    expect(failure.reasonCode).toBe(reasonCode);
    expect(failure.message.trim().length).toBeGreaterThan(20);
    expect(failure.message).toMatch(/\.$/);
    expect(failure.message).not.toMatch(/\d/);
    expect(Array.isArray(failure.requiredInfo)).toBe(true);
    expect(['Masraf e-postası gönderilemedi', 'Masraf e-postası doğrulanamadı']).toContain(failure.taskTitle);
  });

  it('teslimi belirsiz nedenler "gönderilmedi" demez; kesin nedenler der', () => {
    for (const reasonCode of ['DELIVERY_UNCERTAIN', 'DELIVERY_NOT_CONFIRMED'] as const) {
      const failure = describeOpeningExpenseEmailFailure(reasonCode);
      expect(failure.message).toContain('doğrulanamadı');
      expect(failure.message).not.toContain('gönderilmedi.');
      expect(failure.taskTitle).toBe('Masraf e-postası doğrulanamadı');
    }
    for (const reasonCode of ['PAYMENT_ACCOUNT_MISSING', 'PAYMENT_ACCOUNT_AMBIGUOUS', 'PAYMENT_IBAN_MISSING', 'RECIPIENT_MISSING', 'SMTP_NOT_CONFIGURED', 'TEMPLATE_MISSING', 'DELIVERY_REJECTED'] as const) {
      const failure = describeOpeningExpenseEmailFailure(reasonCode);
      expect(failure.message).toContain('masraf e-postası gönderilmedi');
      expect(failure.taskTitle).toBe('Masraf e-postası gönderilemedi');
      expect(failure.requiredInfo.length).toBeGreaterThan(0);
    }
  });

  it('talep oluşmuş nedenlerde e-postanın kendiliğinden yeniden gönderilmeyeceği söylenir', () => {
    const withoutRequest = new Set(['OPENING_REQUEST_NOT_CREATED']);
    for (const reasonCode of OPENING_EXPENSE_EMAIL_REASON_CODES) {
      const { message } = describeOpeningExpenseEmailFailure(reasonCode);
      expect(message.includes('Bu e-posta kendiliğinden yeniden gönderilmez.')).toBe(!withoutRequest.has(reasonCode));
    }
  });

  it('dosya açılış yanıtı: gönderilemedi sonucu neden ve gereken bilgiyi taşır; e-posta istenmiş ve gönderilmemiştir', () => {
    expect(buildOpeningExpenseEmailNotSentOutcome(describeOpeningExpenseEmailFailure('PAYMENT_ACCOUNT_MISSING'))).toEqual({
      status: 'EMAIL_NOT_SENT',
      reasonCode: 'PAYMENT_ACCOUNT_MISSING',
      message: expect.stringContaining('Büroda varsayılan banka hesabı tanımlı değil'),
      requiredInfo: ['Büro Ayarları → Banka Hesapları: tek bir varsayılan hesap'],
      expenseEmailRequested: true,
      expenseEmailSent: false,
    });
  });

  it('dosya açılış yanıtı: süre dolduysa sonuç "henüz belli değil" — gönderildi ya da gönderilmedi demez', () => {
    const pending = buildOpeningExpenseEmailResultPendingOutcome();

    expect(pending).toMatchObject({ status: 'EMAIL_RESULT_PENDING', reasonCode: 'RESULT_PENDING', requiredInfo: [], expenseEmailRequested: true, expenseEmailSent: false });
    expect(pending.message).toContain('henüz belli değil');
    expect(pending.message).not.toMatch(/gönderilmedi|gönderildi\b/);
  });

  it('dosya sayfası durumu: neden + son denemenin anı', () => {
    const attemptedAt = new Date('2026-10-01T20:07:55.000Z');

    expect(buildOpeningExpenseEmailNotSentStatus(describeOpeningExpenseEmailFailure('RECIPIENT_MISSING'), attemptedAt)).toEqual({
      status: 'NOT_SENT',
      reasonCode: 'RECIPIENT_MISSING',
      message: expect.stringContaining('Müvekkilin e-posta adresi kayıtlı değil'),
      requiredInfo: ['Müvekkilin e-posta adresi'],
      attemptedAt: '2026-10-01T20:07:55.000Z',
    });
  });
});

describe('ExpenseNotificationService.sendExpenseRequest — dağıtım başarısızlığının güvenli nedeni', () => {
  const TENANT = 'tenant-x';
  const REQ = 'exp-req-1';
  const DEDUPE = `EXPENSE_REQUEST:ExpenseRequest:${REQ}:1`;

  function makeService(options: {
    dispatch: Record<string, unknown>;
    notification?: { status: string; errorMessage: string | null } | null | Error;
    template?: { id: string } | null;
  }) {
    const auditCreate = jest.fn().mockResolvedValue({});
    const tx = {
      expenseRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, // SENT geçişi: atomik koşullu güncelleme
      expenseAuditLog: { create: auditCreate },
      task: { create: jest.fn().mockResolvedValue({}) },
    };
    const notificationFindFirst =
      options.notification instanceof Error ? jest.fn().mockRejectedValue(options.notification) : jest.fn().mockResolvedValue(options.notification ?? null);
    const templateFindFirst = jest.fn().mockResolvedValue(options.template ?? null);
    const prisma: any = {
      expenseRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: REQ,
          clientId: 'client-1',
          caseId: 'case-1',
          totalAmount: { toNumber: () => 1431.1 },
          dueDate: new Date('2026-10-08T00:00:00Z'),
          requestItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', finalAmount: { toNumber: () => 1431.1 } }],
          client: { id: 'client-1', displayName: 'Müvekkil A.Ş.', name: null, email: 'muvekkil@ornek.test', contacts: [] },
          case: { fileNumber: '2026/77', executionFileNumber: null, executionOffice: null, debtors: [] },
        }),
      },
      office: { findFirst: jest.fn().mockResolvedValue({ name: 'Büro', phone: null, email: null, bankAccounts: [{ iban: 'TR11', accountName: 'Büro' }] }) },
      expenseAuditLog: { create: auditCreate },
      clientNotification: { findFirst: notificationFindFirst },
      messageTemplate: { findFirst: templateFindFirst },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const dispatcher: any = { dispatch: jest.fn().mockResolvedValue(options.dispatch) };
    const configService: any = { get: jest.fn().mockReturnValue(undefined) };
    const svc = new ExpenseNotificationService(prisma, { send: jest.fn() } as any, configService, dispatcher);
    const failedAudit = () => auditCreate.mock.calls.map(([arg]) => arg.data).find((data: any) => data.action === 'EMAIL_FAILED');
    return { svc, prisma, tx, auditCreate, notificationFindFirst, templateFindFirst, failedAudit };
  }

  const RAW = 'Can\'t send mail - all recipients were rejected: 550 5.1.1 <gizli@ornek.test> user unknown';
  const failedDispatch = { status: 'failed', dedupeKey: DEDUPE, error: RAW };

  it.each([
    ['bildirim satırı FAILED recipient-missing', { status: 'FAILED', errorMessage: 'recipient-missing' }, 'RECIPIENT_MISSING'],
    ['bildirim satırı FAILED smtp-not-configured', { status: 'FAILED', errorMessage: 'smtp-not-configured' }, 'SMTP_NOT_CONFIGURED'],
    ['bildirim satırı FAILED (SMTP kalıcı reddi)', { status: 'FAILED', errorMessage: RAW }, 'DELIVERY_REJECTED'],
    ['bildirim satırı PENDING (sonuç belirsiz)', { status: 'PENDING', errorMessage: null }, 'DELIVERY_UNCERTAIN'],
  ])('%s → neden %s; talep SENT olmaz, ham sağlayıcı metni yazılmaz', async (_title, notification, reason) => {
    const { svc, tx, failedAudit, notificationFindFirst } = makeService({ dispatch: failedDispatch, notification });

    const result = await svc.sendExpenseRequest(TENANT, REQ, 'system');

    expect(result).toEqual({ success: false, reason });
    expect(failedAudit()).toMatchObject({ expenseRequestId: REQ, userId: 'system', details: { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason } });
    expect(JSON.stringify(failedAudit())).not.toContain('550');
    expect(JSON.stringify(failedAudit())).not.toContain('gizli@ornek.test');
    // Bu gönderimin bildirim satırı büro kapsamında ve aynı anahtarla okunur
    expect(notificationFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: TENANT, dedupeKey: DEDUPE } }));
    expect(tx.expenseRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it('bildirim satırı hiç oluşmadı ve etkin EXPENSE_REQUEST şablonu yok → TEMPLATE_MISSING', async () => {
    const { svc, failedAudit, templateFindFirst } = makeService({ dispatch: failedDispatch, notification: null, template: null });

    expect(await svc.sendExpenseRequest(TENANT, REQ, 'system')).toEqual({ success: false, reason: 'TEMPLATE_MISSING' });
    expect(failedAudit().details).toEqual({ via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'TEMPLATE_MISSING' });
    expect(templateFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: TENANT, code: 'EXPENSE_REQUEST', isActive: true } }));
  });

  it.each([
    ['bildirim satırı yok ama şablon var', { notification: null, template: { id: 'tpl-1' } }],
    ['bildirim satırı FAILED client-not-found', { notification: { status: 'FAILED', errorMessage: 'client-not-found' } }],
    ['bildirim satırı SENT (beklenmeyen)', { notification: { status: 'SENT', errorMessage: null } }],
    ['sınıflandırma okunamadı', { notification: new Error('db down') }],
  ])('%s → neden TAHMİN EDİLMEZ: kayıt önceki biçimiyle yazılır', async (_title, state) => {
    const { svc, failedAudit } = makeService({ dispatch: failedDispatch, ...(state as object) });

    expect(await svc.sendExpenseRequest(TENANT, REQ, 'system')).toEqual({ success: false });
    expect(failedAudit().details).toEqual({ via: 'dispatcher', outcome: 'delivery-not-confirmed' });
  });

  it('başarılı gönderimde sınıflandırma okuması YAPILMAZ; talep SENT + EMAIL_SENT + takip görevi aynen', async () => {
    const { svc, tx, notificationFindFirst, templateFindFirst, failedAudit } = makeService({ dispatch: { status: 'sent', notificationId: 'n-1', dedupeKey: DEDUPE } });

    expect(await svc.sendExpenseRequest(TENANT, REQ, 'system')).toEqual({ success: true, notificationId: 'n-1' });
    expect(notificationFindFirst).not.toHaveBeenCalled();
    expect(templateFindFirst).not.toHaveBeenCalled();
    expect(failedAudit()).toBeUndefined();
    expect(tx.expenseRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', sentVia: 'EMAIL' }) }));
    expect(tx.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Masraf Takibi - 2026/77', description: expect.stringContaining('masraf talebi müvekkile gönderildi') }) }),
    );
  });

  it('kapalı kapı (varsayılan hesap yok) dönüşü ve kaydı DEĞİŞMEZ; dağıtıcı çağrılmaz', async () => {
    const { svc, prisma, failedAudit, notificationFindFirst } = makeService({ dispatch: failedDispatch });
    prisma.office.findFirst.mockResolvedValue({ name: 'Büro', phone: null, email: null, bankAccounts: [] });

    expect(await svc.sendExpenseRequest(TENANT, REQ, 'system')).toEqual({ success: false, reason: 'PAYMENT_ACCOUNT_INVALID' });
    expect(failedAudit().details).toEqual({ via: 'dispatcher', outcome: 'default-account-missing' });
    expect(notificationFindFirst).not.toHaveBeenCalled();
  });
});

describe('ExpenseRequestService — açılış talebinin e-posta durumu ve takip görevi', () => {
  const TENANT = 'tenant-x';
  const CASE = 'case-1';

  function makeService() {
    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue({ clientId: 'client-1', currency: 'TRY', dues: [{ currency: 'TRY' }], claimItems: [] }) },
      expenseRequest: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(1) },
      task: { create: jest.fn().mockResolvedValue({ id: 'task-1' }) },
    };
    const service = new ExpenseRequestService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { service, prisma };
  }

  /** Durum ucunun iki `findFirst` sorgusu: (1) iptal edilmemiş açılış talebi var mı, (2) gönderilmemiş talebin son denemesi. */
  const statusQueries = (prisma: any, unsent: unknown) =>
    prisma.expenseRequest.findFirst.mockImplementation(async (args: any) => (args.where.status === 'PENDING' ? unsent : { id: 'exp-1' }));

  const attempt = (action: string, details: unknown) => ({ action, details, createdAt: new Date('2026-10-01T20:09:04.000Z') });

  describe('getOpeningExpenseAutomationStatus (salt okuma)', () => {
    it('gönderilmemiş talebin son e-posta denemesi başarısızsa neden bildirilir', async () => {
      const { service, prisma } = makeService();
      statusQueries(prisma, { auditLogs: [attempt('EMAIL_FAILED', { via: 'dispatcher', outcome: 'default-account-missing' })] });

      const status = await service.getOpeningExpenseAutomationStatus(CASE, TENANT);

      expect(status).toEqual({
        caseId: CASE,
        clientAssigned: true,
        openingRequestExists: true,
        activeExpenseRequestCount: 1,
        automaticCalculation: { calculable: true },
        openingRequestEmail: {
          status: 'NOT_SENT',
          reasonCode: 'PAYMENT_ACCOUNT_MISSING',
          message: expect.stringContaining('Büroda varsayılan banka hesabı tanımlı değil'),
          requiredInfo: ['Büro Ayarları → Banka Hesapları: tek bir varsayılan hesap'],
          attemptedAt: '2026-10-01T20:09:04.000Z',
        },
      });
      // Büro + dosya kapsamı, yalnız gönderilmemiş açılış talebi, yalnız SON e-posta denemesi
      expect(prisma.expenseRequest.findFirst).toHaveBeenCalledWith({
        where: { caseId: CASE, tenantId: TENANT, stageCode: 'OPENING', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: {
          auditLogs: {
            where: { action: { in: ['EMAIL_SENT', 'EMAIL_FAILED'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { action: true, details: true, createdAt: true },
          },
        },
      });
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it.each([
      ['e-posta hiç istenmedi (deneme kaydı yok)', { auditLogs: [] }],
      ['son deneme başarılı', { auditLogs: [attempt('EMAIL_SENT', { via: 'dispatcher' })] }],
      ['gönderilmemiş açılış talebi yok (gönderildi / ödendi / iptal / hiç yok)', null],
    ])('%s → alan yanıtta YER ALMAZ', async (_title, unsent) => {
      const { service, prisma } = makeService();
      statusQueries(prisma, unsent);

      const status = await service.getOpeningExpenseAutomationStatus(CASE, TENANT);

      expect(status).toEqual({ caseId: CASE, clientAssigned: true, openingRequestExists: true, activeExpenseRequestCount: 1, automaticCalculation: { calculable: true } });
      expect('openingRequestEmail' in status).toBe(false);
    });
  });

  describe('recordOpeningExpenseEmailNotSent (dosya açılışı)', () => {
    const request = (auditLogs: unknown[]) => ({
      id: 'exp-1',
      caseId: CASE,
      totalAmount: { toNumber: () => 1431.1 },
      case: { fileNumber: '2026/77' },
      auditLogs,
    });

    it('nedeni son deneme kaydından çözer ve talep başına tek takip görevi yazar', async () => {
      const { service, prisma } = makeService();
      prisma.expenseRequest.findFirst.mockResolvedValue(request([attempt('EMAIL_FAILED', { outcome: 'delivery-not-confirmed', reason: 'RECIPIENT_MISSING' })]));

      const failure = await service.recordOpeningExpenseEmailNotSent(TENANT, 'exp-1');

      expect(failure).toMatchObject({ reasonCode: 'RECIPIENT_MISSING', requiredInfo: ['Müvekkilin e-posta adresi'] });
      expect(prisma.expenseRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'exp-1', tenantId: TENANT } }));
      expect(prisma.task.create).toHaveBeenCalledTimes(1);
      expect(prisma.task.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT,
          caseId: CASE,
          title: 'Masraf e-postası gönderilemedi - 2026/77',
          description:
            '1.431,10 TL tutarındaki açılış masraf talebi için müvekkile masraf e-postası istenmişti.\n\n' +
            `${failure.message}\n\nGereken bilgi: Müvekkilin e-posta adresi`,
          status: 'PENDING',
          priority: 'MEDIUM',
          dedupeKey: 'EXPENSE_EMAIL_NOT_SENT:exp-1',
          createdById: null,
        },
      });
    });

    it('teslimi belirsiz nedenlerde görev başlığı "doğrulanamadı" der; gereken bilgi yoksa satır yazılmaz', async () => {
      const { service, prisma } = makeService();
      prisma.expenseRequest.findFirst.mockResolvedValue(request([attempt('EMAIL_FAILED', { outcome: 'delivery-not-confirmed' })]));

      const failure = await service.recordOpeningExpenseEmailNotSent(TENANT, 'exp-1');

      expect(failure.reasonCode).toBe('DELIVERY_NOT_CONFIRMED');
      const { data } = prisma.task.create.mock.calls[0][0];
      expect(data.title).toBe('Masraf e-postası doğrulanamadı - 2026/77');
      expect(data.description).not.toContain('Gereken bilgi');
    });

    it.each([
      ['deneme kaydı yok (gönderim istisna ile kesildi)', [], 'SEND_ERROR'],
      ['son kayıt başarılı görünüyor (beklenmeyen)', [attempt('EMAIL_SENT', {})], 'SEND_ERROR'],
    ])('%s → çağıranın verdiği genel neden kullanılır', async (_title, auditLogs, fallback) => {
      const { service, prisma } = makeService();
      prisma.expenseRequest.findFirst.mockResolvedValue(request(auditLogs));

      expect((await service.recordOpeningExpenseEmailNotSent(TENANT, 'exp-1', fallback as any)).reasonCode).toBe(fallback);
      expect(prisma.task.create).toHaveBeenCalledTimes(1);
    });

    it('aynı talep için görev zaten varsa (benzersizlik) mükerrer görev yazılmaz ve hata fırlatılmaz', async () => {
      const { service, prisma } = makeService();
      prisma.expenseRequest.findFirst.mockResolvedValue(request([attempt('EMAIL_FAILED', { outcome: 'default-account-missing' })]));
      prisma.task.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));

      await expect(service.recordOpeningExpenseEmailNotSent(TENANT, 'exp-1')).resolves.toMatchObject({ reasonCode: 'PAYMENT_ACCOUNT_MISSING' });
    });

    it('görev yazılamazsa neden yine döner (akış bozulmaz)', async () => {
      const { service, prisma } = makeService();
      prisma.expenseRequest.findFirst.mockResolvedValue(request([attempt('EMAIL_FAILED', { outcome: 'iban-missing-fail-closed' })]));
      prisma.task.create.mockRejectedValue(new Error('db down'));

      await expect(service.recordOpeningExpenseEmailNotSent(TENANT, 'exp-1')).resolves.toMatchObject({ reasonCode: 'PAYMENT_IBAN_MISSING' });
    });

    it('talep bu büroda bulunamazsa görev yazılmaz; genel neden döner', async () => {
      const { service, prisma } = makeService();
      prisma.expenseRequest.findFirst.mockResolvedValue(null);

      expect((await service.recordOpeningExpenseEmailNotSent(TENANT, 'exp-baska-buro')).reasonCode).toBe('DELIVERY_NOT_CONFIRMED');
      expect(prisma.task.create).not.toHaveBeenCalled();
    });
  });
});
