import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailProviderService } from '../../notification/email-provider.service';
import {
  ClientFinancialDisclosureEmailDispatcher,
  classifyDispatchFailure,
  isDispatchableRecipient,
} from '../client-financial-disclosure-email-dispatcher';
import { ClientFinancialDisclosureModule } from '../client-financial-disclosure.module';
import { DISCLOSURE_NOTIFICATION_DISPATCHER } from '../client-financial-disclosure.tokens';
import { CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS } from '../client-financial-disclosure-publication.contract';
import type { DisclosureNotificationDispatcher } from '../client-financial-disclosure-publication.contract';
import { UnconfiguredDisclosureNotificationDispatcher } from '../unconfigured-disclosure-dispatcher';

/**
 * CLIENT-FD-ACT-R01-I04 — dispatcher adapter suite.
 *
 * GERÇEK infrastructure sınıfı (`EmailProviderService`) ile çalışır; yalnız `ConfigService`
 * ve provider'ın ağ çağrısı yapan private dallarına GİRİLMEZ — `send` seviyesinde
 * deterministik sahte ile kesilir. GERÇEK E-POSTA GÖNDERİLMEZ.
 */
const makeProvider = (name: string) =>
  new EmailProviderService({
    get: (key: string) => (key === 'EMAIL_PROVIDER' ? name : undefined),
  } as unknown as ConfigService);

const prismaStub = { $transaction: jest.fn(), $executeRaw: jest.fn() } as unknown as PrismaService;

const compileWith = (providerName: string) =>
  Test.createTestingModule({ imports: [ClientFinancialDisclosureModule] })
    .overrideProvider(PrismaService)
    .useValue(prismaStub)
    .overrideProvider(EmailProviderService)
    .useValue(makeProvider(providerName))
    .compile();

describe('CLIENT-FD-ACT-R01-I04 — dispatcher adapter', () => {
  // ── provider adi ────────────────────────────────────────────────────────────
  it('[1] provider adı UYDURULMAZ — EmailProviderService’in kendi değeridir', () => {
    for (const name of ['smtp', 'sendgrid', 'ses', 'mock']) {
      const d = new ClientFinancialDisclosureEmailDispatcher(makeProvider(name));
      expect(d.providerName).toBe(name);
    }
    // EMAIL_PROVIDER tanimsizsa canonical varsayilan 'mock'tur (onayli DEGIL).
    expect(new ClientFinancialDisclosureEmailDispatcher(makeProvider(undefined as never)).providerName).toBe('mock');
  });

  // ── composition secimi ──────────────────────────────────────────────────────
  it('[2] onaylı provider yapılandırıldığında GERÇEK adapter bağlanır', async () => {
    for (const name of CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS) {
      const moduleRef = await compileWith(name);
      const d = moduleRef.get<DisclosureNotificationDispatcher>(DISCLOSURE_NOTIFICATION_DISPATCHER);
      expect(d).toBeInstanceOf(ClientFinancialDisclosureEmailDispatcher);
      expect(d.providerName).toBe(name);
      await moduleRef.close();
    }
  });

  it('[3] onaysız/mock provider’da FAIL-CLOSED varsayılan KORUNUR', async () => {
    for (const name of ['mock', '', 'console', 'fake-smtp']) {
      const moduleRef = await compileWith(name);
      const d = moduleRef.get<DisclosureNotificationDispatcher>(DISCLOSURE_NOTIFICATION_DISPATCHER);
      expect(d).toBeInstanceOf(UnconfiguredDisclosureNotificationDispatcher);
      expect([...CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS]).not.toContain(d.providerName);
      await moduleRef.close();
    }
  });

  it('[4] provider yapılandırılmamış olsa bile BOOT ÇÖKMEZ', async () => {
    await expect(compileWith('mock')).resolves.toBeDefined();
  });

  // ── gonderim semantigi ──────────────────────────────────────────────────────
  const dispatcherWith = (reply: unknown, spy = jest.fn()) => {
    const provider = makeProvider('smtp');
    jest.spyOn(provider, 'send').mockImplementation(async (o) => {
      spy(o);
      return reply as never;
    });
    return { dispatcher: new ClientFinancialDisclosureEmailDispatcher(provider), spy };
  };

  it('[5] başarılı gönderim provider message ID’sini taşır ve provider TAM BİR KEZ çağrılır', async () => {
    const { dispatcher, spy } = dispatcherWith({ success: true, messageId: '<abc@smtp>', provider: 'smtp' });
    const r = await dispatcher.send({ to: 'client@example.test', subject: 'Bildirim', text: 'icerik' });
    expect(r.success).toBe(true);
    expect(r.messageId).toBe('<abc@smtp>');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({ to: 'client@example.test', subject: 'Bildirim', text: 'icerik' });
  });

  it('[6] message ID’siz "başarı" REDDEDİLİR — adapter başarı TAKLİT ETMEZ', async () => {
    for (const reply of [
      { success: true, provider: 'smtp' },
      { success: true, messageId: '', provider: 'smtp' },
      { success: true, messageId: '   ', provider: 'smtp' },
    ]) {
      const { dispatcher } = dispatcherWith(reply);
      const r = await dispatcher.send({ to: 'client@example.test', subject: 's', text: 't' });
      expect(r.success).toBe(false);
      expect(r.messageId).toBeUndefined();
      expect(r.errorCode).toBe('PROVIDER_MESSAGE_ID_MISSING');
    }
  });

  it('[7] geçici hata RETRYABLE, kalıcı hata TERMINAL olarak sınıflanır', async () => {
    const cases: Array<[string, boolean]> = [
      ['NETWORK_ERROR', true], ['ETIMEDOUT', true], ['ECONNRESET', true], ['429', true], ['500', true], ['503', true],
      // Sayisal kodlar pratikte SendGrid'in HTTP status'undan gelir (`response.status.toString()`);
      // SMTP/SES hatalari string kod dondurur ('EAUTH', 'ETIMEDOUT'...). Bu yuzden sayisal 4xx
      // HTTP semantigiyle KALICI sayilir (429 haric), 5xx geciciDIR.
      ['421', false], ['550', true],
      ['INVALID_EMAIL', false], ['SDK_NOT_INSTALLED', false], ['EAUTH', false], ['EENVELOPE', false],
      ['400', false], ['401', false], ['403', false], ['', false],
    ];
    for (const [code, retryable] of cases) {
      expect(classifyDispatchFailure(code)).toBe(retryable);
      const { dispatcher } = dispatcherWith({ success: false, errorCode: code, provider: 'smtp' });
      const r = await dispatcher.send({ to: 'client@example.test', subject: 's', text: 't' });
      expect(r.success).toBe(false);
      expect(r.retryable).toBe(retryable);
      expect(r.errorCode).toBe(code === '' ? 'PROVIDER_ERROR' : code);
    }
  });

  it('[8] geçersiz alıcı provider ÇAĞRILMADAN reddedilir', async () => {
    for (const bad of ['', '   ', 'not-an-email', 'a@b', '@example.test', 'a b@example.test', 'x@@y.test']) {
      const { dispatcher, spy } = dispatcherWith({ success: true, messageId: 'X', provider: 'smtp' });
      const r = await dispatcher.send({ to: bad, subject: 's', text: 't' });
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe('DISCLOSURE_RECIPIENT_INVALID');
      expect(r.retryable).toBe(false);
      expect(spy).not.toHaveBeenCalled();
      expect(isDispatchableRecipient(bad)).toBe(false);
    }
    expect(isDispatchableRecipient('client@example.test')).toBe(true);
  });

  it('[9] dönüş değeri alıcı, konu, gövde veya provider hata METNİ SIZDIRMAZ', async () => {
    const { dispatcher } = dispatcherWith({
      success: false, errorCode: 'SMTP_550',
      errorMessage: 'mailbox unavailable for gizli-alici@example.test',
      provider: 'smtp',
    });
    const r = await dispatcher.send({
      to: 'gizli-alici@example.test', subject: 'GIZLI KONU', text: 'GIZLI GOVDE 1750.50 TRY',
    });
    const body = JSON.stringify(r);
    for (const secret of ['gizli-alici@example.test', 'GIZLI KONU', 'GIZLI GOVDE', '1750.50', 'mailbox unavailable']) {
      expect(body).not.toContain(secret);
    }
    expect(Object.keys(r).sort()).toEqual(['errorCode', 'provider', 'retryable', 'success']);
  });

  it('[10] adapter publication state machine sorumluluklarını TEKRARLAMAZ', () => {
    const source = readFileSync(
      join(__dirname, '..', 'client-financial-disclosure-email-dispatcher.ts'),
      'utf8',
    );
    for (const forbidden of [
      'prisma', '$transaction', 'PUBLISHED', 'SEND_PENDING', 'advisory', 'updateMany',
      'snapshotHash', 'tenantId', 'setTimeout', 'setInterval',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
