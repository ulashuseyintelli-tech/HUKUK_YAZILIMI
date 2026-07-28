import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailProviderService } from '../../notification/email-provider.service';
import {
  buildDisclosureTelemetry,
  CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG,
  CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG,
  DISCLOSURE_TELEMETRY_EVENTS,
  DISCLOSURE_TELEMETRY_FORBIDDEN_FIELDS,
  isCanonicalActivationTrue,
  isDisclosurePublicationEnabled,
  isDisclosureWriteEnabled,
  resolveDisclosureActivationLevel,
} from '../client-financial-disclosure-activation';
import { ClientFinancialDisclosureEmailDispatcher } from '../client-financial-disclosure-email-dispatcher';
import { ClientFinancialDisclosureModule } from '../client-financial-disclosure.module';
import { DISCLOSURE_NOTIFICATION_DISPATCHER } from '../client-financial-disclosure.tokens';
import type { DisclosureNotificationDispatcher } from '../client-financial-disclosure-publication.contract';
import { UnconfiguredDisclosureNotificationDispatcher } from '../unconfigured-disclosure-dispatcher';

/**
 * CLIENT-FD-ACT-R01-I05 — aktivasyon kapıları ve telemetri sözleşmesi (SAF, DB-siz).
 */
const prismaStub = { $transaction: jest.fn(), $executeRaw: jest.fn() } as unknown as PrismaService;
const emailStub = (name: string) =>
  ({ providerName: name, send: jest.fn() }) as unknown as EmailProviderService;

const compile = (provider: string) =>
  Test.createTestingModule({ imports: [ClientFinancialDisclosureModule] })
    .overrideProvider(PrismaService)
    .useValue(prismaStub)
    .overrideProvider(EmailProviderService)
    .useValue(emailStub(provider))
    .compile();

/** §7.1 fail-closed olmasi ZORUNLU degerler. */
const FAIL_CLOSED = [
  undefined, '', ' ', '  ', '1', '0', 'yes', 'no', 'on', 'off', 'enabled', 'disabled',
  'false', 'TRUE', 'True', 'tRue', ' true', 'true ', ' true ', 'true\n', 'null', 'undefined',
];

describe('CLIENT-FD-ACT-R01-I05 — aktivasyon kapıları', () => {
  const saved = { ...process.env };
  afterEach(() => {
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];
    Object.assign(process.env, saved);
  });

  it('[1] canonical parser YALNIZ birebir "true" kabul eder', () => {
    expect(isCanonicalActivationTrue('true')).toBe(true);
    for (const v of FAIL_CLOSED) expect(isCanonicalActivationTrue(v)).toBe(false);
  });

  it('[2] her iki bayrak da VARSAYILAN KAPALI', () => {
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];
    expect(isDisclosureWriteEnabled()).toBe(false);
    expect(isDisclosurePublicationEnabled()).toBe(false);
    expect(resolveDisclosureActivationLevel()).toBe('LEVEL_0');
  });

  it('[3] yanıltıcı değerler HİÇBİR bayrağı açmaz', () => {
    for (const v of FAIL_CLOSED) {
      const env = {
        [CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG]: v,
        [CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG]: v,
      } as NodeJS.ProcessEnv;
      expect(isDisclosureWriteEnabled(env)).toBe(false);
      expect(isDisclosurePublicationEnabled(env)).toBe(false);
      expect(resolveDisclosureActivationLevel(env)).toBe('LEVEL_0');
    }
  });

  it('[4] iki bayrak BAĞIMSIZDIR — üç aktivasyon seviyesi ayrı ayrı çözülür', () => {
    const lvl = (w?: string, p?: string) =>
      resolveDisclosureActivationLevel({
        [CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG]: w,
        [CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG]: p,
      } as NodeJS.ProcessEnv);
    expect(lvl(undefined, undefined)).toBe('LEVEL_0');
    expect(lvl('true', undefined)).toBe('LEVEL_1');
    expect(lvl('true', 'true')).toBe('LEVEL_2');
    // Yayinlama ACIK fakat yazma KAPALI -> yine LEVEL_0 (yazma olmadan yayinlanacak sey yok).
    expect(lvl(undefined, 'true')).toBe('LEVEL_0');
  });

  // ── §7.3 canonical enforcement: composition seviyesi ──────────────────────────
  it('[5] yayınlama KAPALI iken onaylı provider bile FAIL-CLOSED dispatcher’a düşer', async () => {
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];
    for (const provider of ['smtp', 'sendgrid', 'ses']) {
      const m = await compile(provider);
      const d = m.get<DisclosureNotificationDispatcher>(DISCLOSURE_NOTIFICATION_DISPATCHER);
      expect(d).toBeInstanceOf(UnconfiguredDisclosureNotificationDispatcher);
      await m.close();
    }
  });

  it('[6] yayınlama AÇIK + onaylı provider → GERÇEK adapter bağlanır', async () => {
    process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = 'true';
    const m = await compile('smtp');
    const d = m.get<DisclosureNotificationDispatcher>(DISCLOSURE_NOTIFICATION_DISPATCHER);
    expect(d).toBeInstanceOf(ClientFinancialDisclosureEmailDispatcher);
    await m.close();
  });

  it('[7] yayınlama AÇIK fakat onaylı adapter YOK → no-op başarı ÜRETİLMEZ, fail-closed', async () => {
    process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = 'true';
    for (const provider of ['mock', '', 'console']) {
      const m = await compile(provider);
      const d = m.get<DisclosureNotificationDispatcher>(DISCLOSURE_NOTIFICATION_DISPATCHER);
      expect(d).toBeInstanceOf(UnconfiguredDisclosureNotificationDispatcher);
      const r = await d.send({ to: 'x@example.test', subject: 's', text: 't' });
      expect(r.success).toBe(false);
      expect(r.messageId).toBeUndefined();
      await m.close();
    }
  });

  it('[8] yayınlama bayrağının yanıltıcı değeri gerçek adapter’ı AÇMAZ', async () => {
    for (const v of ['TRUE', 'True', ' true ', '1', 'yes', 'on']) {
      process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = v;
      const m = await compile('smtp');
      expect(m.get<DisclosureNotificationDispatcher>(DISCLOSURE_NOTIFICATION_DISPATCHER))
        .toBeInstanceOf(UnconfiguredDisclosureNotificationDispatcher);
      await m.close();
    }
  });

  // ── §7.4 telemetri sozlesmesi ────────────────────────────────────────────────
  it('[9] canonical event adları eksiksizdir ve sürüklenmez', () => {
    expect(Object.values(DISCLOSURE_TELEMETRY_EVENTS).sort()).toEqual([
      'content_approval_completed', 'content_approval_requested', 'disclosure_create_requested',
      'disclosure_created', 'office_approval_completed', 'office_approval_requested',
      'publication_dispatched', 'publication_failed', 'publication_published',
      'publication_requested', 'publication_retried', 'publication_reversed',
    ]);
  });

  it('[10] telemetri yardımcısı YASAK alanları satıra YAZMAZ', () => {
    const line = buildDisclosureTelemetry(DISCLOSURE_TELEMETRY_EVENTS.PUBLICATION_PUBLISHED, {
      tenantId: 't1', disclosureId: 'd1', versionId: 'v1', actorId: 'u1', attempt: 2,
      // Asagidakilerin HICBIRI satira girmemeli:
      amount: '1750.50', totalCollected: '2500.75', recipientEmail: 'gizli@example.test',
      snapshotHash: 'a'.repeat(64), notificationContent: 'GIZLI', providerMessageId: 'MSG-1',
      secret: 'sk_live_x', authorization: 'Bearer y', password: 'p',
    } as never);
    expect(line.startsWith('publication_published ')).toBe(true);
    expect(line).toContain('tenantId=t1');
    expect(line).toContain('attempt=2');
    for (const forbidden of DISCLOSURE_TELEMETRY_FORBIDDEN_FIELDS) {
      expect(line).not.toContain(`${forbidden}=`);
    }
    for (const secret of ['1750.50', '2500.75', 'gizli@example.test', 'a'.repeat(64), 'GIZLI', 'MSG-1', 'sk_live_x', 'Bearer y']) {
      expect(line).not.toContain(secret);
    }
  });

  it('[11] undefined/null alanlar satıra yazılmaz (düşük kardinalite)', () => {
    const line = buildDisclosureTelemetry('x', { a: 1, b: undefined, c: null, d: false });
    expect(line).toBe('x a=1 d=false');
  });
});
