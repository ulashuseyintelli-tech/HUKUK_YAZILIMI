/**
 * CAN-P0-001 — icrabot email/SMS notification truth
 *
 * Doğrular: send_email / send_sms handler'ları gerçek bir provider çağrısı yapmadan
 * (bu handler'lar hiçbir zaman gerçek provider'a bağlı değildi) DB'ye 'sent' yazmaz;
 * NOT_SENT yazar. send_notification (IcrabotNotification'da status alanı yok) bu
 * patch'in kapsamı dışındadır — ayrıca dokunulmamıştır.
 */
import { ActionHandlerService } from '../action-handler.service';

describe('CAN-P0-001: icrabot email/SMS notification truth', () => {
  // ActionHandlerService constructor'ı startLockCleanupInterval() ile gerçek bir
  // setInterval kurar (mevcut kod, bu patch'te değiştirilmedi); fake timer olmadan
  // process event loop'u kapanmaz ve jest asılı kalır. outbox-tenancy.spec.ts'teki
  // pattern takip edilmiştir.
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  const makeService = () => {
    const icrabotEmailLogCreate = jest.fn().mockResolvedValue({ id: 'e1' });
    const icrabotSmsLogCreate = jest.fn().mockResolvedValue({ id: 's1' });
    const prisma = {
      icrabotEmailLog: { create: icrabotEmailLogCreate },
      icrabotSmsLog: { create: icrabotSmsLogCreate },
    };
    const outbox = { markSent: jest.fn(), markDone: jest.fn(), markFailed: jest.fn() };
    const timeline = { addEntry: jest.fn().mockResolvedValue('tid') };
    const factStore = { write: jest.fn().mockResolvedValue(undefined) };

    const svc = new ActionHandlerService(prisma as any, outbox as any, timeline as any, factStore as any);
    const handlers = (svc as any).handlers as Map<string, (...args: any[]) => any>;

    return { svc, handlers, icrabotEmailLogCreate, icrabotSmsLogCreate };
  };

  it("send_email provider success olmadan 'sent' yazmaz, NOT_SENT yazar", async () => {
    const { handlers, icrabotEmailLogCreate } = makeService();
    const sendEmail = handlers.get('send_email')!;

    await sendEmail({ to: 'test@example.com', subject: 'Konu', body: 'Metin' }, 'case-1');

    expect(icrabotEmailLogCreate).toHaveBeenCalledTimes(1);
    const data = icrabotEmailLogCreate.mock.calls[0][0].data;
    expect(data.status).toBe('NOT_SENT');
    expect(data.status).not.toBe('sent');
  });

  it("send_sms provider success olmadan 'sent' yazmaz, NOT_SENT yazar", async () => {
    const { handlers, icrabotSmsLogCreate } = makeService();
    const sendSms = handlers.get('send_sms')!;

    await sendSms({ phone: '+905551112233', message: 'Test mesajı' }, 'case-1');

    expect(icrabotSmsLogCreate).toHaveBeenCalledTimes(1);
    const data = icrabotSmsLogCreate.mock.calls[0][0].data;
    expect(data.status).toBe('NOT_SENT');
    expect(data.status).not.toBe('sent');
  });

  it('send_email zorunlu alan validasyonu korunur (to/subject)', async () => {
    const { handlers } = makeService();
    const sendEmail = handlers.get('send_email')!;

    await expect(sendEmail({ subject: 'Konu' }, 'case-1')).rejects.toThrow(
      'send_email requires to and subject',
    );
  });

  it('send_sms zorunlu alan validasyonu korunur (phone/message)', async () => {
    const { handlers } = makeService();
    const sendSms = handlers.get('send_sms')!;

    await expect(sendSms({ phone: '+905551112233' }, 'case-1')).rejects.toThrow(
      'send_sms requires phone and message',
    );
  });

  it('send_notification bu patch kapsamı dışındadır (IcrabotNotification şemasında status alanı yok)', () => {
    // Bilinçli olarak dokunulmadı: bkz. CAN-P0-001 kapsam notu.
    // Bu test yalnız kapsam dışı bırakma kararını belgeler; davranış assert etmez.
    expect(true).toBe(true);
  });
});
