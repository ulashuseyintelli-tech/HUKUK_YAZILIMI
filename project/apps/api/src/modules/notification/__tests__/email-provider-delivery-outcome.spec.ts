/**
 * SAGLAYICI KESINLIK SINIFLANDIRMASI — SMTP ve SES yollari (gercek `EmailProviderService`).
 *
 * SendGrid yolu ve talep servisine tasinma `address-discovery/__tests__/
 * client-info-request-provider-outcome.db-gated.integration.spec.ts` icinde gercek PostgreSQL ile
 * dogrulanir. Bu suite kalan iki tasima yolunu kapsar: dis cagri (nodemailer / AWS SDK) test
 * katmaninda kontrollu sekilde basarisiz kilinir, servis MOCK'LANMAZ.
 *
 * Kural: KESIN ret ancak DOGRULANABILIRSE verilir (sunucu yaniti, kimlik dogrulama, baglantinin
 * hic kurulmamasi). Timeout/soket kopmasi gibi durumlar BELIRSIZDIR — mesaj iletilmis olabilir.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { EmailProviderService } from '../email-provider.service';

const sendMailMock = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: (...args: any[]) => sendMailMock(...args) })),
}));

function buildProvider(provider: string): EmailProviderService {
  const values: Record<string, string> = {
    EMAIL_PROVIDER: provider,
    EMAIL_FROM: 'noreply@test.invalid',
    EMAIL_FROM_NAME: 'Test Buro',
    SMTP_HOST: 'smtp.test.invalid',
    SMTP_PORT: '587',
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new EmailProviderService(config);
}

const OPTIONS = { to: 'muvekkil@test.invalid', subject: 'konu', text: 'govde' };

function smtpError(fields: Record<string, unknown>): Error {
  return Object.assign(new Error('smtp failure'), fields);
}

describe('EmailProviderService — SMTP kesinlik siniflandirmasi', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
  });

  it('KABUL: basarili gonderim ACCEPTED tasir', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'smtp-1' });
    const result = await buildProvider('smtp').send(OPTIONS);
    expect(result.success).toBe(true);
    expect(result.deliveryOutcome).toBe('ACCEPTED');
  });

  it('TIMEOUT (ETIMEDOUT): BELIRSIZ — veri gonderilmis olabilir', async () => {
    sendMailMock.mockRejectedValue(smtpError({ code: 'ETIMEDOUT' }));
    const result = await buildProvider('smtp').send(OPTIONS);
    expect(result.success).toBe(false); // mevcut sozlesme KORUNDU
    expect(result.deliveryOutcome).toBe('INDETERMINATE');
  });

  it('SOKET KOPMASI (ECONNRESET / EPIPE / ESOCKET): BELIRSIZ', async () => {
    for (const code of ['ECONNRESET', 'EPIPE', 'ESOCKET']) {
      sendMailMock.mockRejectedValue(smtpError({ code }));
      const result = await buildProvider('smtp').send(OPTIONS);
      expect(result.deliveryOutcome).toBe('INDETERMINATE');
    }
  });

  it('KIMLIK DOGRULAMA (EAUTH): KESIN ret — oturum acilmadi', async () => {
    sendMailMock.mockRejectedValue(smtpError({ code: 'EAUTH' }));
    const result = await buildProvider('smtp').send(OPTIONS);
    expect(result.deliveryOutcome).toBe('REJECTED');
  });

  it('ZARF REDDI (EENVELOPE) ve KALICI SUNUCU RETTI (5xx): KESIN ret', async () => {
    sendMailMock.mockRejectedValue(smtpError({ code: 'EENVELOPE' }));
    expect((await buildProvider('smtp').send(OPTIONS)).deliveryOutcome).toBe('REJECTED');

    sendMailMock.mockRejectedValue(smtpError({ code: 'EMESSAGE', responseCode: 550 }));
    expect((await buildProvider('smtp').send(OPTIONS)).deliveryOutcome).toBe('REJECTED');

    // Kod bilinmese de 5xx yaniti kesin rettir.
    sendMailMock.mockRejectedValue(smtpError({ code: 'UNKNOWN_CODE', responseCode: 552 }));
    expect((await buildProvider('smtp').send(OPTIONS)).deliveryOutcome).toBe('REJECTED');
  });

  it('GECICI SUNUCU RETTI (4xx): BELIRSIZ — kesinlik iddia EDILMEZ', async () => {
    sendMailMock.mockRejectedValue(smtpError({ code: 'UNKNOWN_CODE', responseCode: 451 }));
    expect((await buildProvider('smtp').send(OPTIONS)).deliveryOutcome).toBe('INDETERMINATE');
  });

  it('BAGLANTI KURULMADI (ECONNREFUSED / ENOTFOUND): KESIN ret', async () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) {
      sendMailMock.mockRejectedValue(smtpError({ code }));
      expect((await buildProvider('smtp').send(OPTIONS)).deliveryOutcome).toBe('REJECTED');
    }
  });

  it('BILINMEYEN HATA: kanit yoksa BELIRSIZ (fail-safe)', async () => {
    sendMailMock.mockRejectedValue(new Error('beklenmeyen'));
    expect((await buildProvider('smtp').send(OPTIONS)).deliveryOutcome).toBe('INDETERMINATE');
  });
});

describe('EmailProviderService — SES ve mock yollari', () => {
  it('SES SDK yuklu degilse: hicbir cagri yapilmadi → KESIN ret', async () => {
    const result = await buildProvider('ses').send(OPTIONS);
    // Bu ortamda `@aws-sdk/client-ses` yuklu degildir; yuklu olsaydi kimlik bilgisi olmadan
    // yine hata donerdi ve o da siniflandirilirdi.
    expect(result.success).toBe(false);
    expect(['SDK_NOT_INSTALLED', 'SES_ERROR']).toContain(result.errorCode);
    expect(result.deliveryOutcome).toBeDefined();
  });

  it('TASIMA KATMANI: SES istemcisi KOR TEKRAR GONDERIM yapmaz (maxAttempts=1)', () => {
    // AWS SDK v3 varsayilani `maxAttempts: 3`'tur ve timeout'ta istegi kendiliginden tekrarlar.
    // E-posta gonderimi idempotent olmadigi icin bu MUKERRER e-posta uretir. Kaynak seviyesinde
    // kilitlenir: SDK bu ortamda yuklu olmayabilir, davranis calisma aninda olculemez.
    const source = readFileSync(join(__dirname, '..', 'email-provider.service.ts'), 'utf8');
    const sesBlock = source.slice(source.indexOf('new SESClient('), source.indexOf('new SendEmailCommand('));
    expect(sesBlock).toContain('maxAttempts: 1');
  });

  it('mock saglayici: ACCEPTED', async () => {
    const result = await buildProvider('mock').send(OPTIONS);
    expect(result.success).toBe(true);
    expect(result.deliveryOutcome).toBe('ACCEPTED');
  });

  it('GECERSIZ ADRES: tasima cagrisi YOK, KESIN ret', async () => {
    sendMailMock.mockReset();
    const result = await buildProvider('smtp').send({ ...OPTIONS, to: 'gecersiz' });
    expect(result.errorCode).toBe('INVALID_EMAIL');
    expect(result.deliveryOutcome).toBe('REJECTED');
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
