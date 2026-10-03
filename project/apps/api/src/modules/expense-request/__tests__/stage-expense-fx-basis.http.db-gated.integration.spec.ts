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
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AutomationModule } from '../../automation/automation.module';
import { WorkflowEngine } from '../../automation/workflow-engine.service';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { ExpenseRequestService } from '../expense-request.service';

/**
 * Aşama masraf seti — dövizli dosyada oranlı kalem matrahı, /stage/OPENING yan kapısı ve eşzamanlı açılış isteği.
 * GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusurlar (main ef16f07f):
 *  1. Aşama seti haciz harcını (anapara × 0,0044) ve satış harcını (anapara × 0,0113) anapara alacak kalemlerinin SAYISINA
 *     uygular. 1.000.000 USD / EUR dosyada haciz seti 4.750 TL, satış seti 13.800 TL — 1.000.000 TL'lik dosyayla AYNI;
 *     1.000.000 USD + 250.000 TRY anaparalı dosyada iki para birimi tek sayıda toplanıyor (haciz harcı 5.500). Talep
 *     PENDING / BLOCKING kayıt olarak, muhasebe günlüğüyle birlikte yazılıyordu. Aşama değişiminde iş akışı aynı işlevi
 *     arka planda 'system' adına çağırır.
 *  2. POST .../stage/OPENING açılış kalemlerinin beşini 0 yazıyor (toplam 252 TL); TL dosyada otomatik talebin yanına
 *     ikinci OPENING talebi, talebi olmayan dosyada gerçek açılış setini engelleyen kayıt, dövizli dosyada açılış
 *     korumasının yan kapısı.
 *  3. İki EŞZAMANLI POST .../opening iki talep ve iki günlük kaydı yazıyor (sıralı tekrar 400).
 *
 * Kural: açılıştaki owner ara kararıyla (2026-10-01) aynı sınıf — kur / matrah sözleşmesi yokken yanlış tutarlı otomatik
 * talep KAYDA GEÇMEZ, eksik tutar 0 sayılmaz; neden ve tamamlanması gereken bilgi yanıtta bildirilir. Açılış setinin tek
 * üreticisi açılış işlevidir ve "takip başına tek açılış talebi" kuralı eşzamanlı isteklerde de geçerlidir. TL dosyanın
 * mevcut davranışı ve geçmiş talepler DEĞİŞMEZ.
 *
 * KAPSAM DIŞI (owner kararı): dövizli takipte oranlı kalemin hangi tutar ve kur üzerinden hesaplanacağı; aşama setlerinde
 * mükerrer kuralı (bugün yoktur — aşağıda "bugünkü davranış" olarak sabitlenir); iş akışı yolunda oluşturulmayan setin
 * kullanıcıya nasıl gösterileceği (bugün yalnız sunucu günlüğü).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('STAGE-EXPENSE-FX-BASIS DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

const STAGE_REASON = 'STAGE_EXPENSE_FX_BASIS_POLICY_MISSING';
const OPENING_REASON = 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING';
const ALREADY_CREATED = 'Bu takip için açılış masrafları zaten oluşturulmuş';

/** TL dosyada 1.000.000 anapara için bugünkü aşama setleri (değişmemeli). */
const TL_SEIZURE = { stageCode: 'SEIZURE', totalAmount: 4750, items: [{ itemCode: 'HACIZ_HARCI', amount: 4400 }, { itemCode: 'HACIZ_YOLLUK', amount: 350 }] };
const TL_SALE = { stageCode: 'SALE', totalAmount: 13800, items: [{ itemCode: 'ILAN_GIDERI', amount: 2500 }, { itemCode: 'SATIS_HARCI', amount: 11300 }] };
const RE_NOTIFICATION = { stageCode: 'RE_NOTIFICATION', totalAmount: 252, items: [{ itemCode: 'YENIDEN_TEBLIGAT', amount: 252 }] };

/** TL dosyada 10.000 anapara + tek borçlu için bugünkü açılış seti (2026 tarifesi; değişmemeli). */
const TL_OPENING_ITEMS = [
  { itemCode: 'BASVURMA_HARCI', amount: 738.5 },
  { itemCode: 'DOSYA_GIDERI', amount: 50 },
  { itemCode: 'PESIN_HARC', amount: 120 },
  { itemCode: 'TEBLIGAT_GIDERI', amount: 252 },
  { itemCode: 'VEKALET_HARCI', amount: 105 },
  { itemCode: 'VEKALET_PULU', amount: 165.6 },
];

describeWithDisposableDb('Aşama masraf seti — dövizli dosyada oranlı kalem matrahı, açılış yan kapısı, eşzamanlı açılış isteği (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(240_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let engine: WorkflowEngine;
  let tenantId: string;
  let adminId: string;
  let clientId: string;
  /** İş akışının arka planda yaptığı gerçek çağrılar (gözlem; davranış değişmez). */
  let createStageSpy: jest.SpyInstance;
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
        AutomationModule,
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
    // Bu testler zamanlayıcıya bağlı değildir: dönemsel taramalar (otomasyon döngüsü dahil) ölçümü ve paylaşılan test
    // veritabanındaki başka alanları etkilemesin diye bu süreçte durdurulur. İş akışı adımı doğrudan çağrılır.
    for (const job of app.get(SchedulerRegistry, { strict: false }).getCronJobs().values()) job.stop();
    engine = app.get(WorkflowEngine, { strict: false });
    createStageSpy = jest.spyOn(app.get(ExpenseRequestService, { strict: false }), 'createStageExpenseSet');

    tenantId = `test-ci-sefx-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI SEFX', slug: tenantId } });
    const admin = await prisma.user.create({
      data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'SEFX', role: 'ADMIN' },
    });
    adminId = admin.id;
    const client = await prisma.client.create({
      data: { tenantId, type: 'COMPANY', companyName: 'SEFX müvekkil', displayName: 'SEFX müvekkil' },
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
  const stage = (caseId: string, stageCode: string) => post(`/expense-requests/case/${caseId}/stage/${stageCode}`);
  const opening = (caseId: string) => post(`/expense-requests/case/${caseId}/opening`);
  const brief = (res: request.Response) => ({ status: res.status, code: res.body?.code, message: res.body?.message });

  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });
  const withClient = () => ({ creditors: [{ id: clientId, type: 'COMPANY', name: 'SEFX müvekkil' }] });

  const openCase = async (label: string, body: Record<string, unknown>) => {
    const res = await post('/cases', {
      fileNumber: `CI-SEFX-${label}-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      ...body,
    });
    expect({ label, status: res.status }).toEqual({ label, status: 201 });
    return res.body.id as string;
  };

  /** Dosyanın masraf talebi yazma izi: talep + kalem + denetim kaydı + muhasebe günlüğü. */
  const expenseFootprint = async (caseId: string) => {
    const requests = await prisma.expenseRequest.findMany({
      where: { tenantId, caseId },
      include: { requestItems: true, auditLogs: true },
      orderBy: { createdAt: 'asc' },
    });
    const journal = await prisma.accountingJournalEntry.findMany({
      where: { tenantId, caseId, sourceType: 'EXPENSE_REQUEST' },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
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
      journal: journal.map((entry) => ({
        currency: entry.currency,
        amounts: entry.lines.map((line) => `${line.accountCode}:${line.direction}:${Number(line.amount)}`).sort(),
      })),
    };
  };
  const EMPTY_FOOTPRINT = { requests: [], journal: [] };

  /** Talebin sabit kısmı: beklenen satır biçimi (kimlik ve zaman alanları hariç). */
  const requestRow = (expected: { stageCode: string; totalAmount: number; items: { itemCode: string; amount: number }[] }, createdById: string) => ({
    stageCode: expected.stageCode,
    status: 'PENDING',
    gateType: 'BLOCKING',
    currency: 'TRY',
    totalAmount: expected.totalAmount,
    createdById,
    items: expected.items,
    auditLogCount: 1,
  });
  const journalRow = (amount: number) => ({
    currency: 'TRY',
    amounts: [`CLIENT_EXPENSE_RECEIVABLE:DEBIT:${amount}`, `FIRM_EXPENSE_REIMBURSEMENT:CREDIT:${amount}`],
  });

  /** Dosya açılışındaki arka plan açılış talebi için sınırlı bekleme (en çok ~8 sn); talep görünür görünmez döner. */
  const waitForOpeningRequest = async (caseId: string) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const footprint = await expenseFootprint(caseId);
      if (footprint.requests.length > 0 && footprint.journal.length > 0) return footprint;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return expenseFootprint(caseId);
  };

  /** Müvekkilsiz açılır (otomatik açılış talebi denenmez), sonra müvekkil atanır → açılış seti ilk kez istekle oluşur. */
  const openTryCaseWithoutOpeningRequest = async (label: string) => {
    const caseId = await openCase(label, { currency: 'TRY', dues: [principal(10_000)] });
    await prisma.case.update({ where: { id: caseId }, data: { clientId } });
    expect(await expenseFootprint(caseId)).toEqual(EMPTY_FOOTPRINT);
    return caseId;
  };

  const expectStageRejection = (res: request.Response, expected: { stageCode: string; item: { itemCode: string; label: string }; caseCurrency: string; basisCurrencies: string[] }) => {
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: STAGE_REASON,
      message: expect.stringContaining('talebi otomatik oluşturulmadı'),
      stageCode: expected.stageCode,
      requiredInfo: [`${expected.item.label} tutarı (TL)`],
      notCalculableItems: [expected.item],
      caseCurrency: expected.caseCurrency,
      basisCurrencies: expected.basisCurrencies,
      tariffCurrency: 'TRY',
    });
  };
  const HACIZ_HARCI = { itemCode: 'HACIZ_HARCI', label: 'Haciz Harcı' };
  const SATIS_HARCI = { itemCode: 'SATIS_HARCI', label: 'Satış Harcı' };

  describe('TL dosya (kontrol): aşama setlerinin mevcut davranışı korunur', () => {
    let caseId: string;
    let afterOpen: Awaited<ReturnType<typeof expenseFootprint>>;

    beforeAll(async () => {
      caseId = await openCase('try', { currency: 'TRY', ...withClient(), dues: [principal(1_000_000)] });
      afterOpen = await waitForOpeningRequest(caseId);
      expect(afterOpen.requests.map((row) => row.stageCode)).toEqual(['OPENING']);
    });

    it('YAZMA: haciz, satış ve yeniden tebligat setleri bugünkü tutarlarla, PENDING / BLOCKING ve muhasebe günlüğüyle oluşur', async () => {
      for (const [stageCode, total] of [['SEIZURE', '4750'], ['SALE', '13800'], ['RE_NOTIFICATION', '252']]) {
        const res = await stage(caseId, stageCode);
        expect({ stageCode, status: res.status, totalAmount: res.body?.totalAmount }).toEqual({ stageCode, status: 201, totalAmount: total });
      }

      const footprint = await expenseFootprint(caseId);
      expect(footprint.requests.slice(1)).toEqual(
        [TL_SEIZURE, TL_SALE, RE_NOTIFICATION].map((expected) => expect.objectContaining(requestRow(expected, adminId))),
      );
      expect(footprint.journal.slice(1)).toEqual([journalRow(4750), journalRow(13800), journalRow(252)]);
      // Açılışta oluşan talep değişmedi
      expect(footprint.requests[0]).toEqual(afterOpen.requests[0]);
    });

    it('MÜKERRER (bugünkü davranış; aşama setinde mükerrer kuralı yoktur — owner kararı): aynı aşama için ikinci istek yine talep yazar', async () => {
      const before = await expenseFootprint(caseId);

      const res = await stage(caseId, 'SEIZURE');

      expect(res.status).toBe(201);
      const after = await expenseFootprint(caseId);
      expect(after.requests).toHaveLength(before.requests.length + 1);
      expect(after.requests.filter((row) => row.stageCode === 'SEIZURE')).toHaveLength(2);
    });
  });

  describe.each(['USD', 'EUR'])('%s dosya (1.000.000 anapara, müvekkilli)', (currency) => {
    let caseId: string;

    beforeAll(async () => {
      caseId = await openCase(`fx-${currency}`, { currency, subCategory: 'DOVIZ', ...withClient(), dues: [principal(1_000_000)] });
    });

    it('YAZMA: haciz ve satış seti gerekçesiyle reddedilir; talep, kalem, denetim kaydı ve muhasebe günlüğü YAZILMAZ', async () => {
      const seizure = await stage(caseId, 'SEIZURE');
      const sale = await stage(caseId, 'SALE');

      // YAZMA önce ölçülür
      expect(await expenseFootprint(caseId)).toEqual(EMPTY_FOOTPRINT);
      expectStageRejection(seizure, { stageCode: 'SEIZURE', item: HACIZ_HARCI, caseCurrency: currency, basisCurrencies: [currency] });
      expectStageRejection(sale, { stageCode: 'SALE', item: SATIS_HARCI, caseCurrency: currency, basisCurrencies: [currency] });
      // GÖRÜNÜRLÜK: neden + gereken bilgi yanıtta; tutar, kur ya da toplam yok
      expect(seizure.body.message).toContain(`Haciz Masrafları talebi otomatik oluşturulmadı: dosya para birimi ${currency}`);
      expect(sale.body.message).toContain(`Satış Masrafları talebi otomatik oluşturulmadı: dosya para birimi ${currency}`);
      expect(`${seizure.body.message} ${sale.body.message}`).not.toMatch(/\d/);
    });

    it('TEKRAR DENEME: aynı gerekçeyle reddedilir; kayıt oluşmaz', async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        expect(brief(await stage(caseId, 'SEIZURE'))).toMatchObject({ status: 409, code: STAGE_REASON });
        expect(brief(await stage(caseId, 'SALE'))).toMatchObject({ status: 409, code: STAGE_REASON });
      }
      expect(await expenseFootprint(caseId)).toEqual(EMPTY_FOOTPRINT);
    });

    it('POZİTİF KONTROL: oranlı kalemi olmayan yeniden tebligat seti aynı dosyada yazılır (sabit TL gider; davranış değişmez)', async () => {
      const res = await stage(caseId, 'RE_NOTIFICATION');

      expect(res.status).toBe(201);
      const footprint = await expenseFootprint(caseId);
      expect(footprint.requests).toEqual([expect.objectContaining(requestRow(RE_NOTIFICATION, adminId))]);
      expect(footprint.journal).toEqual([journalRow(252)]);
    });
  });

  it.each([
    ['dosya USD + sonradan TRY anapara kalemi (birden fazla para birimi)', 'karma', ['TRY', 'USD'], 'anapara kalemleri birden fazla para biriminde (TRY, USD)'],
    ['dosya USD, anapara alacak kalemi TRY damgalı (eski kayıt)', 'eski', ['TRY', 'USD'], 'dosya para birimi (USD) ile anapara kalemlerinin para birimi (TRY) uyuşmuyor'],
  ])('%s: iki para birimi tek sayıda toplanıp oran uygulanmaz; kayıt yazılmaz', async (_title, label, basisCurrencies, context) => {
    const caseId = await openCase(label, { currency: 'USD', subCategory: 'DOVIZ', ...withClient(), dues: [principal(1_000_000)] });
    if (label === 'karma') {
      const added = await post(`/cases/${caseId}/dues`, { ...principal(250_000), description: 'TRY anapara', currency: 'TRY' });
      expect(added.status).toBe(201);
    } else {
      // Dosya açılışı düzeltmesinden önceki kaydın kurulumu: alacak kalemi para birimi TRY damgalı
      await prisma.claimItem.updateMany({ where: { tenantId, caseId, itemType: 'PRINCIPAL' }, data: { currency: 'TRY' } });
    }
    expect(
      (await prisma.claimItem.findMany({ where: { tenantId, caseId, itemType: 'PRINCIPAL' }, select: { currency: true } })).map((item) => String(item.currency)).sort(),
    ).toEqual(label === 'karma' ? ['TRY', 'USD'] : ['TRY']);

    const seizure = await stage(caseId, 'SEIZURE');
    const sale = await stage(caseId, 'SALE');

    expect(await expenseFootprint(caseId)).toEqual(EMPTY_FOOTPRINT);
    expectStageRejection(seizure, { stageCode: 'SEIZURE', item: HACIZ_HARCI, caseCurrency: 'USD', basisCurrencies });
    expectStageRejection(sale, { stageCode: 'SALE', item: SATIS_HARCI, caseCurrency: 'USD', basisCurrencies });
    expect(seizure.body.message).toContain(context);
  });

  it('geçmiş kayıt: dövizli dosyada ÖNCEDEN oluşmuş aşama talebi değiştirilmez, iptal edilmez, yeniden hesaplanmaz', async () => {
    const caseId = await openCase('fx-gecmis', { currency: 'USD', subCategory: 'DOVIZ', ...withClient(), dues: [principal(1_000_000)] });
    // Düzeltmeden önce oluşmuş talebin kurulumu (yazma yolu artık üretmediği için doğrudan eklenir)
    const legacy = await prisma.expenseRequest.create({
      data: {
        tenantId,
        caseId,
        clientId,
        packageCode: 'SEIZURE',
        stageCode: 'SEIZURE',
        gateType: 'BLOCKING',
        totalSuggested: 4750,
        totalAmount: 4750,
        status: 'PENDING',
        createdById: 'system',
        requestItems: {
          create: TL_SEIZURE.items.map((item, sortOrder) => ({ itemCode: item.itemCode, label: item.itemCode, suggestedAmount: item.amount, finalAmount: item.amount, sortOrder })),
        },
      },
    });
    const before = await expenseFootprint(caseId);
    expect(before.requests).toHaveLength(1);

    expect(brief(await stage(caseId, 'SEIZURE'))).toMatchObject({ status: 409, code: STAGE_REASON });

    expect(await expenseFootprint(caseId)).toEqual(before);
    expect((await prisma.expenseRequest.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe('PENDING');
  });

  describe('POST .../stage/OPENING: açılış setinin tek üreticisi açılış işlevidir', () => {
    it('TL dosyada açılış talebi varken: "zaten oluşturulmuş" — sıfır tutarlı ikinci OPENING talebi yazılmaz', async () => {
      const caseId = await openCase('so-var', { currency: 'TRY', ...withClient(), dues: [principal(10_000)] });
      const created = await waitForOpeningRequest(caseId);
      expect(created.requests).toHaveLength(1);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        expect(brief(await stage(caseId, 'OPENING'))).toEqual({ status: 400, code: undefined, message: ALREADY_CREATED });
      }

      expect(await expenseFootprint(caseId)).toEqual(created);
    });

    it('TL dosyada açılış talebi yokken: gerçek açılış seti oluşur (POST .../opening ile aynı); hiçbir kalem 0 yazılmaz', async () => {
      const caseId = await openTryCaseWithoutOpeningRequest('so-yok');

      const res = await stage(caseId, 'OPENING');

      expect({ status: res.status, stageCode: res.body?.stageCode, totalAmount: res.body?.totalAmount }).toEqual({ status: 201, stageCode: 'OPENING', totalAmount: '1431.1' });
      const footprint = await expenseFootprint(caseId);
      expect(footprint.requests).toEqual([expect.objectContaining(requestRow({ stageCode: 'OPENING', totalAmount: 1431.1, items: TL_OPENING_ITEMS }, adminId))]);
      expect(footprint.requests[0].items.every((item) => item.amount > 0)).toBe(true);
      expect(footprint.journal).toEqual([journalRow(1431.1)]);
      // Açılış kuralı her iki uçta da aynıdır: tekrar deneme mükerrer talep üretmez
      expect(brief(await opening(caseId))).toEqual({ status: 400, code: undefined, message: ALREADY_CREATED });
      expect(brief(await stage(caseId, 'OPENING'))).toEqual({ status: 400, code: undefined, message: ALREADY_CREATED });
      expect(await expenseFootprint(caseId)).toEqual(footprint);
    });

    it('dövizli dosyada: açılışın peşin harç gerekçesiyle reddedilir; kayıt yazılmaz ve açılış durumu "talep yok" kalır', async () => {
      const caseId = await openCase('so-fx', { currency: 'USD', subCategory: 'DOVIZ', ...withClient(), dues: [principal(10_000)] });

      const res = await stage(caseId, 'OPENING');

      expect(await expenseFootprint(caseId)).toEqual(EMPTY_FOOTPRINT);
      expect(brief(res)).toMatchObject({ status: 409, code: OPENING_REASON });
      expect(res.body).toMatchObject({ requiredInfo: ['Peşin harç tutarı (TL)'], notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }], caseCurrency: 'USD' });
      // Yan kapı kapalı: sahte açılış talebi oluşmadığı için açık istek de gerekçeyi bildirir, durum ucu nedeni göstermeyi sürdürür
      expect(brief(await opening(caseId))).toMatchObject({ status: 409, code: OPENING_REASON });
      const status = await get(`/expense-requests/case/${caseId}/opening-status`);
      expect(status.body).toMatchObject({ openingRequestExists: false, activeExpenseRequestCount: 0, automaticCalculation: { calculable: false, reasonCode: OPENING_REASON } });
    });
  });

  describe('EŞZAMANLI açılış isteği: takip başına tek açılış talebi', () => {
    const ROUNDS = 5;

    it('mevcut kural korunur (kilit altındaki denetim aynı ölçütü kullanır): iptal edilmiş açılış talebi ve başka aşamanın talebi yeni açılış setine engel değildir', async () => {
      const caseId = await openCase('es-kural', { currency: 'TRY', ...withClient(), dues: [principal(10_000)] });
      const created = await waitForOpeningRequest(caseId);
      expect(created.requests).toHaveLength(1);
      expect((await stage(caseId, 'RE_NOTIFICATION')).status).toBe(201);
      // İptal edilmemiş açılış talebi varken yenisi oluşmaz
      expect(brief(await opening(caseId))).toEqual({ status: 400, code: undefined, message: ALREADY_CREATED });
      const cancelled = await post(`/expense-requests/${created.requests[0].id}/cancel`, { reason: 'test: açılış seti yeniden oluşturulacak' });
      expect({ status: cancelled.status, newStatus: cancelled.body?.status }).toEqual({ status: 201, newStatus: 'CANCELLED' });

      const res = await opening(caseId);

      expect(res.status).toBe(201);
      const footprint = await expenseFootprint(caseId);
      expect(footprint.requests.map((row) => `${row.stageCode}:${row.status}`)).toEqual(['OPENING:CANCELLED', 'RE_NOTIFICATION:PENDING', 'OPENING:PENDING']);
      expect(footprint.requests[2].items).toEqual(TL_OPENING_ITEMS);
    });

    it(`iki eşzamanlı POST .../opening (${ROUNDS} tur): biri oluşturur, diğeri "zaten oluşturulmuş"; tek talep ve tek günlük kaydı`, async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        const caseId = await openTryCaseWithoutOpeningRequest(`es-${round}`);

        const responses = await Promise.all([opening(caseId), opening(caseId)]);

        const footprint = await expenseFootprint(caseId);
        expect({ round, requests: footprint.requests.length, journal: footprint.journal.length }).toEqual({ round, requests: 1, journal: 1 });
        expect(responses.map((res) => res.status).sort()).toEqual([201, 400]);
        expect(responses.find((res) => res.status === 400)?.body?.message).toBe(ALREADY_CREATED);
        expect(footprint.requests[0]).toEqual(expect.objectContaining(requestRow({ stageCode: 'OPENING', totalAmount: 1431.1, items: TL_OPENING_ITEMS }, adminId)));
        expect(footprint.journal).toEqual([journalRow(1431.1)]);
        // Sıralı tekrar (mevcut davranış)
        expect(brief(await opening(caseId))).toEqual({ status: 400, code: undefined, message: ALREADY_CREATED });
        expect(await expenseFootprint(caseId)).toEqual(footprint);
      }
    });

    it('eşzamanlı POST .../opening ve POST .../stage/OPENING: iki uç aynı kilidi paylaşır; tek talep', async () => {
      for (let round = 0; round < 3; round += 1) {
        const caseId = await openTryCaseWithoutOpeningRequest(`es-karma-${round}`);

        const responses = await Promise.all([opening(caseId), stage(caseId, 'OPENING')]);

        const footprint = await expenseFootprint(caseId);
        expect({ round, requests: footprint.requests.length, journal: footprint.journal.length }).toEqual({ round, requests: 1, journal: 1 });
        expect(responses.map((res) => res.status).sort()).toEqual([201, 400]);
        expect(footprint.requests[0].items).toEqual(TL_OPENING_ITEMS);
      }
    });
  });

  describe('iş akışı yolu: aşama değişimi → arka planda aşama masraf seti (WorkflowEngine.updateCaseStage)', () => {
    /** Bu dosya için iş akışının yaptığı arka plan çağrıları ve sonuçları (çağrı bitene kadar beklenir). */
    const settledStageAttempts = async (caseId: string) => {
      const attempts = createStageSpy.mock.calls
        .map((args, index) => ({ args, result: createStageSpy.mock.results[index] }))
        .filter(({ args }) => args[0] === caseId);
      const settled = await Promise.allSettled(attempts.map(({ result }) => result.value as Promise<unknown>));
      return attempts.map(({ args }, index) => {
        const outcome = settled[index];
        return {
          stageCode: args[1] as string,
          userId: args[3] as string,
          outcome: outcome.status === 'fulfilled' ? 'CREATED' : ((outcome.reason?.getResponse?.()?.code ?? outcome.reason?.message) as string),
        };
      });
    };
    const stagesOf = async (caseId: string) =>
      (await prisma.caseLifecycle.findMany({ where: { caseId, triggeredBy: 'AUTO' }, orderBy: { createdAt: 'asc' } })).map((row) => String(row.stage));

    it('TL dosya (kontrol): haciz ve satış aşamasına geçişte setler bugünkü tutarlarla "system" adına yazılır', async () => {
      const caseId = await openCase('wf-try', { currency: 'TRY', ...withClient(), dues: [principal(1_000_000)] });
      await waitForOpeningRequest(caseId);

      await engine.updateCaseStage(caseId, tenantId, 'SEIZURE', 'test: haciz aşaması');
      await engine.updateCaseStage(caseId, tenantId, 'SALE_REQUEST', 'test: satış aşaması');

      expect(await settledStageAttempts(caseId)).toEqual([
        { stageCode: 'SEIZURE', userId: 'system', outcome: 'CREATED' },
        { stageCode: 'SALE', userId: 'system', outcome: 'CREATED' },
      ]);
      const footprint = await expenseFootprint(caseId);
      expect(footprint.requests.slice(1)).toEqual([TL_SEIZURE, TL_SALE].map((expected) => expect.objectContaining(requestRow(expected, 'system'))));
      expect(footprint.journal.slice(1)).toEqual([journalRow(4750), journalRow(13800)]);
    });

    it('dövizli dosya: aşama değişir; haciz ve satış seti DENENİR ama yanlış tutarla kayda yazılmaz', async () => {
      const caseId = await openCase('wf-usd', { currency: 'USD', subCategory: 'DOVIZ', ...withClient(), dues: [principal(1_000_000)] });

      await engine.updateCaseStage(caseId, tenantId, 'SEIZURE', 'test: haciz aşaması');
      await engine.updateCaseStage(caseId, tenantId, 'SALE_REQUEST', 'test: satış aşaması');

      // Çağrılar gerçekten yapıldı ve gerekçesiyle reddedildi ("yazılmadı" iddiası boş değil)
      expect(await settledStageAttempts(caseId)).toEqual([
        { stageCode: 'SEIZURE', userId: 'system', outcome: STAGE_REASON },
        { stageCode: 'SALE', userId: 'system', outcome: STAGE_REASON },
      ]);
      expect(await expenseFootprint(caseId)).toEqual(EMPTY_FOOTPRINT);
      // Aşama değişimi engellenmez
      expect(await stagesOf(caseId)).toEqual(['SEIZURE', 'SALE_REQUEST']);
      expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { workflowStage: true } })).workflowStage).toBe('SALE_REQUEST');
    });

    it('dövizli dosya: kesinleşme aşamasındaki yeniden tebligat seti (sabit TL gider) yazılmaya devam eder', async () => {
      const caseId = await openCase('wf-usd-renotif', { currency: 'USD', subCategory: 'DOVIZ', ...withClient(), dues: [principal(1_000_000)] });

      await engine.updateCaseStage(caseId, tenantId, 'ENFORCEMENT', 'test: kesinleşme');

      expect(await settledStageAttempts(caseId)).toEqual([{ stageCode: 'RE_NOTIFICATION', userId: 'system', outcome: 'CREATED' }]);
      const footprint = await expenseFootprint(caseId);
      expect(footprint.requests).toEqual([expect.objectContaining(requestRow(RE_NOTIFICATION, 'system'))]);
      expect(footprint.journal).toEqual([journalRow(252)]);
    });
  });
});
