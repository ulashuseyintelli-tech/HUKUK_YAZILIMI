/**
 * C1-B05-A Gate-1 — PROVIDER OUTCOME sınıflandırması GERÇEK sendEmail katmanında.
 * FAILED yalnız: pre-provider deterministik (no-recipient / missing-config) VEYA kesin red (SMTP 5xx).
 * PENDING (markFailed=0): provider çağrısı başladıktan sonra belirsiz (timeout/reset) VEYA accept+SENT-mark-fail.
 * Raw provider error / credential sonuç ve mesajlara ÇIKMAZ. nodemailer mock; gerçek SMTP YOK.
 */
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
import * as nodemailer from 'nodemailer';
import { ClientNotificationService } from './client-notification.service';

const createTransport = nodemailer.createTransport as unknown as jest.Mock;
const sendMailMock = jest.fn();

const VALID_SMTP = { smtpHost: 'smtp.x', smtpUser: 'u', smtpPass: 'SECRET_PASS', smtpPort: 465, smtpSecure: true, smtpFromName: 'Ofis', smtpFromEmail: 'ofis@x' };
const CLIENT_WITH_EMAIL = { id: 'c1', email: 'muvekkil@x', contacts: [{ type: 'EMAIL', isPrimary: true, value: 'muvekkil@x' }] };
const CLIENT_NO_EMAIL = { id: 'c1', email: null, contacts: [] };

const reuseDto: any = {
  clientId: 'c1', type: 'MASRAF_ISTEK', subject: 'Konu', body: 'Gövde',
  dedupeKey: 'EXPENSE_REQUEST:ExpenseRequest:r1:1', reuseNotificationId: 'claim-1',
};

function makeService(opts: { client: any; smtp: any }) {
  const update = jest.fn().mockResolvedValue({});
  const prisma: any = {
    clientNotification: {
      findFirst: jest.fn().mockResolvedValue({ id: 'claim-1' }), // reuse-verify: PENDING claim mevcut
      create: jest.fn().mockResolvedValue({ id: 'created-1' }),
      update,
    },
    client: { findFirst: jest.fn().mockResolvedValue(opts.client) },
  };
  const officeService: any = { getFullSmtpSettings: jest.fn().mockResolvedValue(opts.smtp) };
  const svc = new ClientNotificationService(prisma, officeService);
  return { svc, update };
}

const failedUpdates = (update: jest.Mock) =>
  update.mock.calls.filter((c) => c[0]?.data?.status === 'FAILED');
const sentUpdates = (update: jest.Mock) =>
  update.mock.calls.filter((c) => c[0]?.data?.status === 'SENT');

describe('C1-B05-A sendEmail provider-outcome (gerçek katman)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createTransport.mockReturnValue({ sendMail: sendMailMock });
  });

  it('no-recipient → provider çağrılmaz + claim FAILED', async () => {
    const { svc, update } = makeService({ client: CLIENT_NO_EMAIL, smtp: VALID_SMTP });
    await expect(svc.sendEmail('t', 'u', reuseDto)).rejects.toThrow();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(failedUpdates(update)).toHaveLength(1);
  });

  it('missing/invalid config → provider çağrılmaz + claim FAILED', async () => {
    const { svc, update } = makeService({ client: CLIENT_WITH_EMAIL, smtp: { smtpHost: null, smtpUser: null } });
    await expect(svc.sendEmail('t', 'u', reuseDto)).rejects.toThrow();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(failedUpdates(update)).toHaveLength(1);
  });

  it('kesin SMTP red (5xx) → FAILED', async () => {
    sendMailMock.mockRejectedValue(Object.assign(new Error('550 rejected pass=SECRET_PASS'), { responseCode: 550 }));
    const { svc, update } = makeService({ client: CLIENT_WITH_EMAIL, smtp: VALID_SMTP });
    await expect(svc.sendEmail('t', 'u', reuseDto)).rejects.toThrow();
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(failedUpdates(update)).toHaveLength(1);
  });

  it('timeout / belirsiz transport → PENDING (markFailed=0)', async () => {
    sendMailMock.mockRejectedValue(Object.assign(new Error('connection timeout'), { code: 'ETIMEDOUT' }));
    const { svc, update } = makeService({ client: CLIENT_WITH_EMAIL, smtp: VALID_SMTP });
    await expect(svc.sendEmail('t', 'u', reuseDto)).rejects.toThrow();
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(failedUpdates(update)).toHaveLength(0); // FAILED YAPILMAZ → PENDING kalır
  });

  it('geçici SMTP 4xx (5xx DEĞİL) → PENDING (FAILED yapılmaz, belirsiz)', async () => {
    // rc<500 kesin red değildir (greylisting/4xx) → sonuç belirsiz → PENDING (güvenli varsayılan).
    sendMailMock.mockRejectedValue(Object.assign(new Error('450 try again later'), { responseCode: 450 }));
    const { svc, update } = makeService({ client: CLIENT_WITH_EMAIL, smtp: VALID_SMTP });
    await expect(svc.sendEmail('t', 'u', reuseDto)).rejects.toThrow();
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(failedUpdates(update)).toHaveLength(0); // FAILED YAPILMAZ → PENDING kalır
  });

  it('provider accept + SENT-mark OK → success SENT (FAILED YAPILMAZ)', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'm-ok' });
    const { svc, update } = makeService({ client: CLIENT_WITH_EMAIL, smtp: VALID_SMTP });
    const res = await svc.sendEmail('t', 'u', reuseDto);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ success: true, notificationId: 'claim-1', recipient: 'muvekkil@x' });
    expect(sentUpdates(update)).toHaveLength(1); // SENT damgası kalıcılaştı
    expect(failedUpdates(update)).toHaveLength(0);
  });

  it('provider accept + SENT-mark DB fail → PENDING (FAILED yapılmaz)', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'm1' });
    const { svc, update } = makeService({ client: CLIENT_WITH_EMAIL, smtp: VALID_SMTP });
    update.mockRejectedValue(new Error('DB down')); // SENT-mark update başarısız
    await expect(svc.sendEmail('t', 'u', reuseDto)).rejects.toThrow();
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sentUpdates(update)).toHaveLength(1); // SENT denemesi yapıldı (reddedildi)
    expect(failedUpdates(update)).toHaveLength(0); // FAILED'a çevrilMEZ
  });

  it('raw provider error / credential fırlatılan mesaja çıkmaz', async () => {
    sendMailMock.mockRejectedValue(Object.assign(new Error('550 auth pass=SECRET_PASS token=abc'), { responseCode: 550 }));
    const { svc } = makeService({ client: CLIENT_WITH_EMAIL, smtp: VALID_SMTP });
    let msg = '';
    try { await svc.sendEmail('t', 'u', reuseDto); } catch (e: any) { msg = e?.message ?? ''; }
    expect(msg).not.toContain('SECRET_PASS');
    expect(msg).not.toContain('token=abc');
  });
});
