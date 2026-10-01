// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-due-currency.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { ExpenseRequestService } from '../expense-request.service';

/**
 * Otomatik açılış masraf talebi — dövizli dosyada peşin harç matrahı. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main 6917e8aa): müvekkilli dosya açılınca arka planda oluşan açılış masraf seti peşin harcı (TL tarifesi
 * oranı) anapara kalemlerinin SAYISINA uygular. 10.000 USD anaparalı dosyada talep 10.000 TL'lik dosyayla AYNI
 * (peşin harç 120,00 / toplam 1.431,10 TL) ve PENDING / BLOCKING kayıt olarak, muhasebe günlüğüyle birlikte yazılıyordu.
 *
 * Kural (owner ara kararı 2026-10-01): kur / matrah sözleşmesi yokken yanlış tutarlı otomatik talep KAYDA GEÇMEZ; dosya
 * açılır; neden ve tamamlanması gereken bilgi yanıtta ve salt-okuma ucunda görünür; tekrar deneme mükerrer talep
 * üretmez. TL dosyanın mevcut davranışı ve geçmiş talepler DEĞİŞMEZ.
 *
 * KAPSAM DIŞI (owner kararı): dövizli takipte peşin harcın hangi tutar ve kur üzerinden hesaplanacağı.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('OPENING-EXPENSE-FX-BASIS DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({
      where: { id: String(req.headers['x-test-user-id']) },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

const REASON = 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING';
const ALREADY_CREATED = 'Bu takip için açılış masrafları zaten oluşturulmuş';

/** TL dosyada 10.000 anapara + tek borçlu için bugünkü açılış seti (2026 tarifesi; değişmemeli). */
const TL_OPENING_ITEMS = [
  { itemCode: 'BASVURMA_HARCI', amount: 738.5 },
  { itemCode: 'DOSYA_GIDERI', amount: 50 },
  { itemCode: 'PESIN_HARC', amount: 120 },
  { itemCode: 'TEBLIGAT_GIDERI', amount: 252 },
  { itemCode: 'VEKALET_HARCI', amount: 105 },
  { itemCode: 'VEKALET_PULU', amount: 165.6 },
];

describeWithDisposableDb('Açılış masraf talebi — dövizli dosyada peşin harç matrahı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  let clientId: string;
  /** Yazma yolunun gerçek çağrıları (gözlem; davranış değişmez): hangi dosya için açılış seti DENENDİ? */
  let createOpeningSpy: jest.SpyInstance;
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      // Masraf talebi denetleyicisi passport korumasını doğrudan kullanır (AuthGuard('jwt') aynı sınıfı döndürür)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    createOpeningSpy = jest.spyOn(app.get(ExpenseRequestService, { strict: false }), 'createOpeningExpenseSet');

    tenantId = `test-ci-oefx-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI OEFX', slug: tenantId } });
    const admin = await prisma.user.create({
      data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'OEFX', role: 'ADMIN' },
    });
    adminId = admin.id;
    const client = await prisma.client.create({
      data: { tenantId, type: 'COMPANY', companyName: 'OEFX müvekkil', displayName: 'OEFX müvekkil' },
    });
    clientId = client.id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object = {}) => http().post(path).set('x-test-user-id', adminId).send(body);
  const get = (path: string) => http().get(path).set('x-test-user-id', adminId);

  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });
  const withClient = () => ({ creditors: [{ id: clientId, type: 'COMPANY', name: 'OEFX müvekkil' }] });

  const openCase = async (label: string, body: Record<string, unknown>) => {
    const res = await post('/cases', {
      fileNumber: `CI-OEFX-${label}-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body as Record<string, any>;
  };

  /** Açılış setinin bu dosya için kimin adına denendiği (otomatik yol 'system'; açık istek kullanıcı kimliğiyle). */
  const openingAttemptsOf = (caseId: string) =>
    createOpeningSpy.mock.calls.filter(([attemptedCaseId]) => attemptedCaseId === caseId).map(([, , userId]) => userId as string);

  /** Dosyanın masraf talebi yazma izi: talep + kalem + denetim kaydı + muhasebe günlüğü. */
  const expenseFootprint = async (caseId: string) => {
    const requests = await prisma.expenseRequest.findMany({
      where: { tenantId, caseId },
      include: { requestItems: true, auditLogs: true },
      orderBy: { createdAt: 'asc' },
    });
    const journalEntries = await prisma.accountingJournalEntry.count({ where: { tenantId, caseId, sourceType: 'EXPENSE_REQUEST' } });
    return {
      requests: requests.map((row) => ({
        id: row.id,
        stageCode: row.stageCode,
        status: String(row.status),
        gateType: String(row.gateType),
        currency: row.currency,
        totalAmount: Number(row.totalAmount),
        createdById: row.createdById,
        updatedAt: row.updatedAt.toISOString(),
        items: row.requestItems
          .map((item) => ({ itemCode: item.itemCode, amount: Number(item.finalAmount) }))
          .sort((a, b) => a.itemCode.localeCompare(b.itemCode)),
        auditLogCount: row.auditLogs.length,
      })),
      journalEntries,
    };
  };

  /** Arka plan işi için sınırlı bekleme (en çok ~8 sn); talep görünür görünmez döner. */
  const waitForOpeningRequest = async (caseId: string) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const footprint = await expenseFootprint(caseId);
      if (footprint.requests.length > 0 && footprint.journalEntries > 0) return footprint;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return expenseFootprint(caseId);
  };

  /**
   * "Yazılmadı" iddiasının boş olmaması için POZİTİF KONTROL: dövizli dosyadan SONRA açılan TL dosyanın arka plan talebi
   * görünene kadar beklenir. Dövizli dosya için bir arka plan yazması olsaydı ondan önce tetiklenmiş olurdu.
   */
  const waitForLaterControlCase = async (label: string) => {
    const control = await openCase(`${label}-kontrol`, { currency: 'TRY', ...withClient(), dues: [principal(10_000)] });
    const footprint = await waitForOpeningRequest(control.id);
    expect(footprint.requests).toHaveLength(1);
  };

  describe('TL dosya (kontrol): mevcut davranış korunur', () => {
    let opened: Record<string, any>;
    let created: Awaited<ReturnType<typeof expenseFootprint>>;

    beforeAll(async () => {
      opened = await openCase('try', { currency: 'TRY', ...withClient(), dues: [principal(10_000)] });
      created = await waitForOpeningRequest(opened.id);
    });

    it('YAZMA: açılış talebi bugünkü tutarlarla, PENDING / BLOCKING ve muhasebe günlüğüyle oluşur', () => {
      expect(openingAttemptsOf(opened.id)).toEqual(['system']);
      expect(created.journalEntries).toBe(1);
      expect(created.requests).toHaveLength(1);
      expect(created.requests[0]).toMatchObject({
        stageCode: 'OPENING',
        status: 'PENDING',
        gateType: 'BLOCKING',
        currency: 'TRY',
        totalAmount: 1431.1,
        createdById: 'system',
        items: TL_OPENING_ITEMS,
        auditLogCount: 1,
      });
    });

    it('TEKRAR DENEME: açık istek ikinci talep üretmez; mevcut kayıt değişmez', async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const retry = await post(`/expense-requests/case/${opened.id}/opening`);
        expect({ status: retry.status, message: retry.body?.message }).toEqual({ status: 400, message: ALREADY_CREATED });
      }
      expect(await expenseFootprint(opened.id)).toEqual(created);
    });

    it('GÖRÜNÜRLÜK: açılış yanıtında "oluşturulmadı" sonucu yoktur; durum ucu talebin var olduğunu bildirir', async () => {
      expect(opened.openingExpenseRequest).toBeUndefined();
      const status = await get(`/expense-requests/case/${opened.id}/opening-status`);
      expect(status.status).toBe(200);
      expect(status.body).toEqual({
        caseId: opened.id,
        clientAssigned: true,
        openingRequestExists: true,
        activeExpenseRequestCount: 1,
        automaticCalculation: { calculable: true },
      });
    });
  });

  describe.each(['USD', 'EUR'])('%s dosya (10.000 anapara, müvekkilli)', (currency) => {
    let opened: Record<string, any>;

    beforeAll(async () => {
      opened = await openCase(`fx-${currency}`, { currency, subCategory: 'DOVIZ', ...withClient(), dues: [principal(10_000)] });
      await waitForLaterControlCase(`fx-${currency}`);
    });

    it('YAZMA: dosya açılır; yanlış tutarlı otomatik talep, kalem, denetim kaydı ve muhasebe günlüğü YAZILMAZ', async () => {
      expect(await prisma.case.findUniqueOrThrow({ where: { id: opened.id }, select: { currency: true, clientId: true } })).toEqual({
        currency,
        clientId,
      });
      expect(await expenseFootprint(opened.id)).toEqual({ requests: [], journalEntries: 0 });
      // Otomatik yol talebi hiç DENEMEDİ (yazma koruması ayrıca servistedir: aşağıdaki açık istek testi)
      expect(openingAttemptsOf(opened.id)).toEqual([]);
    });

    it('TEKRAR DENEME: açık istek aynı gerekçeyle reddedilir; kayıt oluşmaz', async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const retry = await post(`/expense-requests/case/${opened.id}/opening`);
        expect({ status: retry.status, code: retry.body?.code }).toEqual({ status: 409, code: REASON });
        expect(retry.body).toMatchObject({ requiredInfo: ['Peşin harç tutarı (TL)'], caseCurrency: currency, tariffCurrency: 'TRY' });
      }
      expect(await expenseFootprint(opened.id)).toEqual({ requests: [], journalEntries: 0 });
    });

    it('GÖRÜNÜRLÜK: eksik hesap durumu açılış yanıtında ve durum ucunda — tutar yok, 0 yok, toplam yok', async () => {
      expect(opened.openingExpenseRequest).toEqual({
        status: 'NOT_CREATED',
        reasonCode: REASON,
        message: expect.stringContaining(`dosya para birimi ${currency}`),
        requiredInfo: ['Peşin harç tutarı (TL)'],
        notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }],
        caseCurrency: currency,
        basisCurrencies: [currency],
        tariffCurrency: 'TRY',
        expenseEmailRequested: false,
        expenseEmailSent: false,
      });

      const status = await get(`/expense-requests/case/${opened.id}/opening-status`);
      expect(status.status).toBe(200);
      expect(status.body).toEqual({
        caseId: opened.id,
        clientAssigned: true,
        openingRequestExists: false,
        activeExpenseRequestCount: 0,
        automaticCalculation: {
          calculable: false,
          reasonCode: REASON,
          message: opened.openingExpenseRequest.message,
          requiredInfo: ['Peşin harç tutarı (TL)'],
          notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }],
          caseCurrency: currency,
          basisCurrencies: [currency],
          tariffCurrency: 'TRY',
        },
      });
    });
  });

  it('dövizli dosyada masraf e-postası istenirse: talep oluşmadığı için e-posta gönderilmediği yanıtta bildirilir', async () => {
    const opened = await openCase('fx-mail', {
      currency: 'USD',
      subCategory: 'DOVIZ',
      ...withClient(),
      dues: [principal(10_000)],
      sendExpenseEmail: true,
    });

    await waitForLaterControlCase('fx-mail');
    // YAZMA: talep de masraf bildirimi de oluşmaz
    expect(await expenseFootprint(opened.id)).toEqual({ requests: [], journalEntries: 0 });
    expect(await prisma.clientNotification.count({ where: { tenantId, caseId: opened.id, type: 'MASRAF_ISTEK' } })).toBe(0);
    // GÖRÜNÜRLÜK: e-postanın gönderilmediği sessiz kalmaz
    expect(opened.openingExpenseRequest).toMatchObject({
      status: 'NOT_CREATED',
      reasonCode: REASON,
      expenseEmailRequested: true,
      expenseEmailSent: false,
    });
  });

  it.each([
    ['dosya USD + TRY anapara kalemi eklendi (birden fazla para birimi)', 'karma', ['TRY', 'USD'], 'birden fazla para biriminde (TRY, USD)'],
    ['dosya USD, anapara kalemi TRY damgalı (eski kayıt)', 'eski', ['TRY', 'USD'], 'dosya para birimi (USD) ile anapara kalemlerinin para birimi (TRY) uyuşmuyor'],
  ])('%s: açık istek de yazmaz', async (_title, label, basisCurrencies, context) => {
    const opened = await openCase(label, { currency: 'USD', subCategory: 'DOVIZ', ...withClient(), dues: [principal(10_000)] });
    if (label === 'karma') {
      const added = await post(`/cases/${opened.id}/dues`, { ...principal(2_000), description: 'TRY anapara', currency: 'TRY' });
      expect(added.status).toBe(201);
    } else {
      // Dosya açılışı düzeltmesinden önceki kaydın kurulumu: kalem para birimi TRY damgalı
      await prisma.due.updateMany({ where: { caseId: opened.id }, data: { currency: 'TRY' } });
    }

    const retry = await post(`/expense-requests/case/${opened.id}/opening`);
    // YAZMA önce ölçülür: açık istek kayıt üretmedi
    expect(await expenseFootprint(opened.id)).toEqual({ requests: [], journalEntries: 0 });
    expect({ status: retry.status, code: retry.body?.code }).toEqual({ status: 409, code: REASON });
    expect(retry.body).toMatchObject({ caseCurrency: 'USD', basisCurrencies });
    expect(retry.body.message).toContain(context);
  });

  it('müvekkilsiz dövizli dosya: otomatik talep zaten denenmez (mevcut davranış); yanıtta sonuç alanı yoktur', async () => {
    const opened = await openCase('fx-muvekkilsiz', { currency: 'USD', subCategory: 'DOVIZ', dues: [principal(10_000)] });

    await waitForLaterControlCase('fx-muvekkilsiz');
    expect(await expenseFootprint(opened.id)).toEqual({ requests: [], journalEntries: 0 });
    expect(opened.openingExpenseRequest).toBeUndefined();
    const status = await get(`/expense-requests/case/${opened.id}/opening-status`);
    expect(status.body).toMatchObject({ clientAssigned: false, openingRequestExists: false, activeExpenseRequestCount: 0 });
  });

  it('geçmiş kayıt: dövizli dosyada ÖNCEDEN oluşmuş açılış talebi değiştirilmez, iptal edilmez, yeniden hesaplanmaz', async () => {
    const opened = await openCase('fx-gecmis', { currency: 'USD', subCategory: 'DOVIZ', ...withClient(), dues: [principal(10_000)] });
    // Düzeltmeden önce oluşmuş talebin kurulumu (yazma yolu artık üretmediği için doğrudan eklenir)
    const legacy = await prisma.expenseRequest.create({
      data: {
        tenantId,
        caseId: opened.id,
        clientId,
        packageCode: 'OPENING',
        stageCode: 'OPENING',
        gateType: 'BLOCKING',
        totalSuggested: 1431.1,
        totalAmount: 1431.1,
        status: 'PENDING',
        createdById: 'system',
        requestItems: {
          create: TL_OPENING_ITEMS.map((item, sortOrder) => ({
            itemCode: item.itemCode,
            label: item.itemCode,
            suggestedAmount: item.amount,
            finalAmount: item.amount,
            sortOrder,
          })),
        },
      },
    });
    const before = await expenseFootprint(opened.id);
    expect(before.requests).toHaveLength(1);

    const status = await get(`/expense-requests/case/${opened.id}/opening-status`);
    expect(status.body).toMatchObject({ openingRequestExists: true, activeExpenseRequestCount: 1, automaticCalculation: { calculable: false } });

    const retry = await post(`/expense-requests/case/${opened.id}/opening`);
    expect({ status: retry.status, message: retry.body?.message }).toEqual({ status: 400, message: ALREADY_CREATED });

    expect(await expenseFootprint(opened.id)).toEqual(before);
    expect((await prisma.expenseRequest.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe('PENDING');
  });
});
