import { ClientNotificationService } from '../client-notification.service';
import { NotificationDispatcherService } from '../notification-dispatcher.service';

/**
 * CAD C3 — ATTACHMENT THREADING (owner-ratified bounded write).
 *
 * Kural seti: ek OPSİYONEL ve backward-compatible; PDF içeriği kalıcı kayda
 * YAZILMAZ; dedupeKey/status/persistence/audit otoritesi korunur; aynı teslim
 * için provider çağrısı TAM 1 kez; provider hatasında SENT kaydı ÜRETİLMEZ.
 * Gerçek SMTP çağrılmaz — nodemailer transport'u mock'lanır.
 */

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: (...args: any[]) => sendMail(...args) })),
}));

const TENANT = 'tenant-attach';
const CLIENT = 'client-attach';
const USER = 'user-attach';
const PDF = Buffer.from('%PDF-1.4 deneme icerik');

function makeService() {
  const created: any[] = [];
  const updated: any[] = [];
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue({
        id: CLIENT,
        tenantId: TENANT,
        email: null,
        contacts: [{ type: 'EMAIL', value: 'muvekkil@ornek.com', isPrimary: true }],
      }),
    },
    clientNotification: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `notif-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
      update: jest.fn(async (args: any) => {
        updated.push(args);
        return { id: args.where.id };
      }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const officeService: any = {
    getFullSmtpSettings: jest.fn().mockResolvedValue({
      smtpHost: 'smtp.example.test',
      smtpPort: 587,
      smtpUser: 'user',
      smtpPass: 'pass',
      smtpFromEmail: 'buro@ornek.com',
      smtpFromName: 'Deneme Hukuk',
    }),
  };

  const service = new ClientNotificationService(prisma, officeService);

  return { service, prisma, created, updated };
}

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue({ messageId: 'smtp-1' });
});

describe('CAD C3 — sendEmail attachment taşıma', () => {
  it('[ATT-1] ek VERİLMEZSE mevcut davranış birebir korunur (regresyon)', async () => {
    const { service, created } = makeService();

    await (service as any).sendEmail(TENANT, USER, {
      clientId: CLIENT,
      type: 'GENEL_BILGILENDIRME',
      subject: 'Konu',
      body: '<p>gövde</p>',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail).not.toHaveProperty('attachments');
    // metadata: templateId yoksa eskisi gibi undefined kalır.
    expect(created[0].metadata).toBeUndefined();
  });

  it('[ATT-2] PDF eki provider çağrısına BYTE-PARITY ile ulaşır', async () => {
    const { service } = makeService();

    await (service as any).sendEmail(TENANT, USER, {
      clientId: CLIENT,
      type: 'STATEMENT_READY',
      subject: 'Ekstre',
      body: '<p>özet</p>',
      attachments: [{ filename: 'ekstre-genel-20260201-20260228.pdf', content: PDF, contentType: 'application/pdf' }],
    });

    const mail = sendMail.mock.calls[0][0];
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe('ekstre-genel-20260201-20260228.pdf');
    expect(mail.attachments[0].contentType).toBe('application/pdf');
    expect(Buffer.compare(mail.attachments[0].content, PDF)).toBe(0);
  });

  it('[ATT-3] PDF içeriği kalıcı kayda YAZILMAZ; yalnız ek kimliği düşer', async () => {
    const { service, created } = makeService();

    await (service as any).sendEmail(TENANT, USER, {
      clientId: CLIENT,
      type: 'STATEMENT_READY',
      subject: 'Ekstre',
      body: '<p>özet</p>',
      dedupeKey: 'STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02',
      attachments: [{ filename: 'ekstre-genel-20260201-20260228.pdf', content: PDF, contentType: 'application/pdf' }],
    });

    const row = created[0];
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('%PDF-');
    expect(serialized).not.toContain(PDF.toString('base64').slice(0, 24));
    expect(row.metadata.attachments).toEqual([
      { filename: 'ekstre-genel-20260201-20260228.pdf', contentType: 'application/pdf' },
    ]);
    // dedupeKey ve persistence otoritesi korunur.
    expect(row.dedupeKey).toBe('STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02');
    expect(row.status).toBe('PENDING');
  });

  it('[ATT-4] provider hatasında SENT kaydı ÜRETİLMEZ (FAILED damgalanır)', async () => {
    const { service, updated } = makeService();
    sendMail.mockRejectedValue(new Error('smtp down'));

    await expect(
      (service as any).sendEmail(TENANT, USER, {
        clientId: CLIENT,
        type: 'STATEMENT_READY',
        subject: 'Ekstre',
        body: '<p>özet</p>',
        attachments: [{ filename: 'x.pdf', content: PDF, contentType: 'application/pdf' }],
      }),
    ).rejects.toThrow();

    expect(updated).toHaveLength(1);
    expect(updated[0].data.status).toBe('FAILED');
    expect(updated.some((u) => u.data.status === 'SENT')).toBe(false);
  });
});

describe('CAD C3 — dispatcher zincirinden ek geçişi', () => {
  function makeDispatcher(options: { alreadySent?: boolean } = {}) {
    const prisma: any = {
      clientNotification: {
        findFirst: jest.fn().mockResolvedValue(options.alreadySent ? { id: 'notif-existing' } : null),
      },
    };
    const clientNotification: any = {
      sendEmail: jest.fn().mockResolvedValue({ success: true, notificationId: 'notif-1' }),
    };
    const messageTemplate: any = {
      findByCode: jest.fn().mockResolvedValue({ id: 'tpl-1', subject: 'Ekstre {{periodEnd}}', body: 'Sayın {{clientName}}' }),
      renderTemplate: jest.fn(() => ({ subject: 'Ekstre 2026-02-28', body: 'Sayın Deneme Müvekkil' })),
    };
    return {
      dispatcher: new NotificationDispatcherService(prisma, clientNotification, messageTemplate),
      prisma,
      clientNotification,
    };
  }

  const attachment = { filename: 'ekstre-genel-20260201-20260228.pdf', content: PDF, contentType: 'application/pdf' };

  it('[ATT-5] dispatcher eki sendEmail zincirine değiştirmeden geçirir', async () => {
    const h = makeDispatcher();

    const result = await h.dispatcher.dispatch(TENANT, USER, {
      clientId: CLIENT,
      templateCode: 'STATEMENT_READY',
      type: 'STATEMENT_READY',
      tokens: { clientName: 'Deneme Müvekkil' },
      refType: 'ClientStatement',
      refId: 'stmt-1',
      dedupeKey: 'STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02',
      attachments: [attachment],
    });

    expect(result.status).toBe('sent');
    const dto = h.clientNotification.sendEmail.mock.calls[0][2];
    expect(dto.attachments).toHaveLength(1);
    expect(Buffer.compare(dto.attachments[0].content, PDF)).toBe(0);
    expect(dto.dedupeKey).toBe('STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02');
  });

  it('[ATT-6] ek verilmeyen mevcut çağrılarda dto attachments alanı OLUŞMAZ', async () => {
    const h = makeDispatcher();

    await h.dispatcher.dispatch(TENANT, USER, {
      clientId: CLIENT,
      templateCode: 'CLIENT_APPROVAL',
      type: 'CLIENT_APPROVAL',
      tokens: {},
      refType: 'ClientApprovalRequest',
      refId: 'req-1',
    });

    const dto = h.clientNotification.sendEmail.mock.calls[0][2];
    expect(dto).not.toHaveProperty('attachments');
  });

  it('[ATT-7] aynı dedupeKey için SENT varsa ek TAŞINMAZ ve ikinci gönderim yapılmaz', async () => {
    const h = makeDispatcher({ alreadySent: true });

    const result = await h.dispatcher.dispatch(TENANT, USER, {
      clientId: CLIENT,
      templateCode: 'STATEMENT_READY',
      type: 'STATEMENT_READY',
      tokens: {},
      refType: 'ClientStatement',
      refId: 'stmt-1',
      dedupeKey: 'STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02',
      attachments: [attachment],
    });

    expect(result.status).toBe('skipped');
    expect(h.clientNotification.sendEmail).not.toHaveBeenCalled();
  });
});
