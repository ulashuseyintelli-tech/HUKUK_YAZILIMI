import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailProviderService } from '../../notification/email-provider.service';
import { ClientFinancialDisclosureApprovalService } from '../client-financial-disclosure-approval.service';
import { ClientFinancialDisclosurePublicationService } from '../client-financial-disclosure-publication.service';
import { ClientFinancialDisclosureWriterService } from '../client-financial-disclosure-writer.service';
import { ClientFinancialDisclosureModule } from '../client-financial-disclosure.module';
import { ClientFinancialDisclosureController } from '../client-financial-disclosure.controller';
import { ClientFinancialDisclosureOfficeService } from '../client-financial-disclosure-office-service';
import {
  DISCLOSURE_DISPATCHER_UNCONFIGURED_PROVIDER,
  DISCLOSURE_NOTIFICATION_DISPATCHER,
} from '../client-financial-disclosure.tokens';
import { CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS } from '../client-financial-disclosure-publication.contract';
import type { DisclosureNotificationDispatcher } from '../client-financial-disclosure-publication.contract';
import { UnconfiguredDisclosureNotificationDispatcher } from '../unconfigured-disclosure-dispatcher';

/**
 * CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01 / I02 — production composition suite.
 *
 * SAF (DB-siz): Nest DI grafiğini gerçek modülle çözer, PrismaService override edilir.
 * DB'ye HİÇ bağlanılmaz.
 */
const MODULE_DIR = join(__dirname, '..');
const prismaStub = { $transaction: jest.fn(), $executeRaw: jest.fn() } as unknown as PrismaService;

/**
 * CLIENT-FD-ACT-R01-I04: modul artik canonical `EmailProviderService`'i de saglar (dispatcher
 * secimi icin). Testte ConfigService bagimliligina girmemek adina override edilir; varsayilan
 * `mock` provider ile fail-closed dal aktif kalir.
 */
const emailStub = { providerName: 'mock', send: jest.fn() } as unknown as EmailProviderService;

const compile = () =>
  Test.createTestingModule({ imports: [ClientFinancialDisclosureModule] })
    .overrideProvider(PrismaService)
    .useValue(prismaStub)
    .overrideProvider(EmailProviderService)
    .useValue(emailStub)
    .compile();

describe('CLIENT-FD-ACT-R01-I02 — production composition binding', () => {
  it('[1] modül tüm provider’ları çözer; hiçbiri undefined değildir', async () => {
    const moduleRef = await compile();
    for (const token of [
      ClientFinancialDisclosureWriterService,
      ClientFinancialDisclosureApprovalService,
      ClientFinancialDisclosurePublicationService,
      ClientFinancialDisclosureOfficeService,
    ]) {
      const resolved = moduleRef.get(token);
      expect(resolved).toBeDefined();
      expect(resolved).toBeInstanceOf(token);
    }
    expect(moduleRef.get(DISCLOSURE_NOTIFICATION_DISPATCHER)).toBeDefined();
    await moduleRef.close();
  });

  it('[2] domain servisleri gerçek PrismaService ile kurulur (cast/sarmalayıcı YOK)', async () => {
    const moduleRef = await compile();
    const writer = moduleRef.get(ClientFinancialDisclosureWriterService);
    // Kurucuya gecen istemci ile modulun cozdugu PrismaService AYNI ornek olmalidir.
    expect((writer as unknown as { prisma: unknown }).prisma).toBe(prismaStub);
    const approval = moduleRef.get(ClientFinancialDisclosureApprovalService);
    expect((approval as unknown as { prisma: unknown }).prisma).toBe(prismaStub);
    const office = moduleRef.get(ClientFinancialDisclosureOfficeService);
    expect((office as unknown as { prisma: unknown }).prisma).toBe(prismaStub);
    await moduleRef.close();
  });

  it('[3] publication servisi dispatcher token’ı üzerinden bağlanır', async () => {
    const moduleRef = await compile();
    const publication = moduleRef.get(ClientFinancialDisclosurePublicationService);
    const dispatcher = moduleRef.get<DisclosureNotificationDispatcher>(
      DISCLOSURE_NOTIFICATION_DISPATCHER,
    );
    expect((publication as unknown as { dispatcher: unknown }).dispatcher).toBe(dispatcher);
    expect(dispatcher).toBeInstanceOf(UnconfiguredDisclosureNotificationDispatcher);
    await moduleRef.close();
  });

  // ── §35.10 FAIL-CLOSED VARSAYILAN ─────────────────────────────────────────────
  it('[4] varsayılan dispatcher onaylı provider listesinde DEĞİLDİR', async () => {
    const moduleRef = await compile();
    const dispatcher = moduleRef.get<DisclosureNotificationDispatcher>(
      DISCLOSURE_NOTIFICATION_DISPATCHER,
    );
    expect(dispatcher.providerName).toBe(DISCLOSURE_DISPATCHER_UNCONFIGURED_PROVIDER);
    expect([...CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS]).not.toContain(
      dispatcher.providerName,
    );
    await moduleRef.close();
  });

  it('[5] varsayılan dispatcher başarı TAKLİT ETMEZ ve message ID ÜRETMEZ', async () => {
    const dispatcher = new UnconfiguredDisclosureNotificationDispatcher();
    const result = await dispatcher.send({ to: 'x@example.test', subject: 's', text: 't' });
    expect(result.success).toBe(false);
    expect(result.messageId).toBeUndefined();
    expect(result.errorCode).toBe('DISCLOSURE_DISPATCHER_NOT_CONFIGURED');
    // §35.14: alici/konu/icerik geri DONDURULMEZ.
    const body = JSON.stringify(result);
    for (const secret of ['x@example.test', 's', 't'].slice(0, 1)) {
      expect(body).not.toContain(secret);
    }
  });

  // ── AKTIVASYON SINIRI ─────────────────────────────────────────────────────────
  it('[6] modül yalnız dedicated Financial Disclosure controller tanımlar; cron/worker yoktur', async () => {
    const source = readFileSync(join(MODULE_DIR, 'client-financial-disclosure.module.ts'), 'utf8');
    expect(source).toContain('controllers: [ClientFinancialDisclosureController]');
    for (const forbidden of ['@Cron', 'ScheduleModule', 'EventEmitter', 'OnModuleInit', 'onApplicationBootstrap']) {
      expect(source).not.toContain(forbidden);
    }
    const moduleRef = await compile();
    expect(moduleRef.get(ClientFinancialDisclosureController)).toBeInstanceOf(
      ClientFinancialDisclosureController,
    );
    await moduleRef.close();
  });

  it('[7] domain servisleri Nest’e bağımlı DEĞİLDİR (clean-architecture sınırı)', () => {
    for (const file of [
      'client-financial-disclosure-writer.service.ts',
      'client-financial-disclosure-approval.service.ts',
      'client-financial-disclosure-publication.service.ts',
    ]) {
      const source = readFileSync(join(MODULE_DIR, file), 'utf8');
      expect(source).not.toContain("from '@nestjs/common'");
      expect(source).not.toContain('@Injectable()');
    }
  });

  // MPB-028(a) PR-3 emsali: "kod var ama app.module'e HIC kayitli degil" regresyonu.
  // Kaynak metni okunur; Nest bootstrap veya DB baglantisi YOK.
  it('[9] modül app.module.ts’e GERÇEKTEN kayıtlıdır (DI container’da mevcut)', () => {
    const appModule = readFileSync(join(MODULE_DIR, '../../app.module.ts'), 'utf8');
    expect(appModule).toMatch(
      /import\s*\{\s*ClientFinancialDisclosureModule\s*\}\s*from\s*["']\.\/modules\/client-financial-disclosure\/client-financial-disclosure\.module["']/,
    );
    // Import satirindan ayirt etmek icin: imports array elemani olarak TEK BASINA satir.
    expect(appModule).toMatch(/^\s*ClientFinancialDisclosureModule,\s*$/m);
  });

  it('[8] provider’lar tembel kurulur — modül derlenirken yan etki YOKTUR', async () => {
    const spy = jest.spyOn(prismaStub, '$transaction' as never);
    const moduleRef = await compile();
    expect(spy).not.toHaveBeenCalled();
    await moduleRef.close();
    spy.mockRestore();
  });
});
