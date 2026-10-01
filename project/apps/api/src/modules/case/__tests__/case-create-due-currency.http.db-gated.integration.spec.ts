// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-instrument-admission.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';

/**
 * Dosya açılışında alacak kalemi para birimi — GERÇEK HTTP + disposable PostgreSQL.
 *
 * Kusur (ölçüldü, main b0e35bf5): POST /cases `dues[]` kalemleri para birimi yazılmadan oluşturuluyordu; şema varsayılanı
 * nedeniyle USD/EUR dosyanın kalemi (Due) ve ondan türeyen ClaimItem "TRY" damgalanıyor, kanonik bakiye tutarı TRY
 * kovasında hesaplıyordu. Alt kategori DOVIZ olsa da sonradan düzelten bir yol yoktu.
 *
 * Kural (politika gerektirmeyen kısım): kalem bazında para birimi verilmediğinde kalem DOSYA para birimini alır;
 * tutar ÇEVRİLMEZ. Aynı kural sonradan kalem eklemede (POST /cases/:id/dues) de geçerlidir.
 *
 * İşlevsel sonuç (ölçüldü): tahsilat para birimi sınırı (RCV-COL-CURRENCY-BOUNDARY-01) etkin kalemlerin dosya para
 * biriminde olmasını ister. Kalemler TRY damgalıyken dövizli dosyaya HİÇBİR para biriminde tahsilat kaydedilemiyordu
 * (400 COLLECTION_CURRENCY_MISMATCH); son test bu uçtan uca sonucu sabitler.
 *
 * KAPSAM DIŞI (owner kararı): açılışta kalem bazında para birimi. `dues[].currency` bugün sözleşmede yoktur; aşağıdaki
 * 400 iddiası bu sözleşmeyi sabitler — alan DTO'ya eklenip yazma yoluna bağlanmazsa sessizce yok sayılmasın diye.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-CREATE-DUE-CURRENCY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('Dosya açılışında alacak kalemi para birimi (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  /** Dosya üyesi avukat: tahsilat kaydı yetkisi dosya üyeliğine bağlıdır (ADMIN rolü tek başına yetmez). */
  let memberLawyer: { userId: string; lawyerId: string };
  const suffix = randomUUID().slice(0, 8);
  const savedManualFlag = process.env.MANUAL_CASE_INSTRUMENTS;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
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
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    tenantId = `test-ci-duecur-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI DUECUR', slug: tenantId } });
    const admin = await prisma.user.create({
      data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'DUECUR', role: 'ADMIN' },
    });
    adminId = admin.id;
    const office = await prisma.office.create({ data: { tenantId, name: 'CI DUECUR ofis' } });
    const lawyerUser = await prisma.user.create({
      data: { tenantId, email: `avukat-${suffix}@example.test`, name: 'avukat', surname: 'DUECUR', role: 'USER' },
    });
    const lawyer = await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: lawyerUser.id, name: 'avukat', surname: 'DUECUR', lawyerRank: 'PARTNER' },
    });
    memberLawyer = { userId: lawyerUser.id, lawyerId: lawyer.id };
  });

  beforeEach(() => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
  });

  afterAll(async () => {
    await app?.close();
    if (savedManualFlag === undefined) delete process.env.MANUAL_CASE_INSTRUMENTS;
    else process.env.MANUAL_CASE_INSTRUMENTS = savedManualFlag;
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object, userId: string = adminId) =>
    http().post(path).set('x-test-user-id', userId).send(body);

  const PRINCIPAL = { type: 'PRINCIPAL', description: 'Asıl alacak', amount: 10_000, dueDate: '2026-01-15' };
  const EXPENSE = { type: 'EXPENSE', description: 'Masraf', amount: 250.5, dueDate: '2026-01-15' };

  const openCase = (label: string, body: Record<string, unknown>, userId?: string) =>
    post(
      '/cases',
      {
        fileNumber: `CI-DUECUR-${label}-${suffix}`,
        type: 'GENERAL_EXECUTION',
        interestType: 'YASAL',
        startDate: '2026-02-01',
        ...body,
      },
      userId,
    );

  // Aynı transaction'da yazılan satırların oluşturulma zamanı eşit olabilir → sıra tür / tutar / para birimi ile sabitlenir.
  const byKey = <T>(key: (row: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));

  /** Kalıcı kayıt: dosya, kalemler (Due) ve kanonik kalemler (ClaimItem). */
  async function stored(caseId: string) {
    const [caseRow, dues, claimItems] = await Promise.all([
      prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { currency: true, subCategory: true } }),
      prisma.due.findMany({ where: { caseId } }),
      prisma.claimItem.findMany({ where: { tenantId, caseId } }),
    ]);
    return {
      case: caseRow,
      dues: dues
        .map((d) => ({ type: String(d.type), amount: Number(d.amount), currency: d.currency }))
        .sort(byKey((d) => `${d.type}|${d.amount}|${d.currency}`)),
      claimItems: claimItems
        .map((ci) => ({
          itemType: String(ci.itemType),
          amount: Number(ci.amount),
          currency: ci.currency,
          fromInstrument: ci.instrumentId !== null,
        }))
        .sort(byKey((ci) => `${ci.itemType}|${ci.amount}|${ci.currency}`)),
    };
  }

  const tenantCounts = async () => ({
    cases: await prisma.case.count({ where: { tenantId } }),
    dues: await prisma.due.count({ where: { case: { tenantId } } }),
    claimItems: await prisma.claimItem.count({ where: { tenantId } }),
  });

  it.each(['USD', 'EUR', 'GBP', 'CHF'])(
    '%s dosya: açılıştaki her kalem ve ondan türeyen ClaimItem DOSYA para birimini taşır; tutar çevrilmez',
    async (currency) => {
      const res = await openCase(`fx-${currency}`, { currency, dues: [PRINCIPAL, EXPENSE] });
      expect(res.status).toBe(201);

      expect(await stored(res.body.id)).toEqual({
        case: { currency, subCategory: 'GENEL' },
        dues: [
          { type: 'EXPENSE', amount: 250.5, currency },
          { type: 'PRINCIPAL', amount: 10_000, currency },
        ],
        claimItems: [
          { itemType: 'EXPENSE', amount: 250.5, currency, fromInstrument: false },
          { itemType: 'PRINCIPAL', amount: 10_000, currency, fromInstrument: false },
        ],
      });
      // Yanıt da aynı para birimini döndürür (istemci ayrıca okumak zorunda kalmaz)
      expect((res.body.dues as Array<{ currency: string }>).map((d) => d.currency)).toEqual([currency, currency]);
    },
  );

  it('DÖVİZ alt kategorisi (kur tarihiyle) aynı kuralı izler: kalemler dosya para biriminde', async () => {
    const res = await openCase('doviz', {
      currency: 'USD',
      subCategory: 'DOVIZ',
      exchangeDate: '2026-02-01',
      dues: [PRINCIPAL],
    });
    expect(res.status).toBe(201);
    expect(await stored(res.body.id)).toEqual({
      case: { currency: 'USD', subCategory: 'DOVIZ' },
      dues: [{ type: 'PRINCIPAL', amount: 10_000, currency: 'USD' }],
      claimItems: [{ itemType: 'PRINCIPAL', amount: 10_000, currency: 'USD', fromInstrument: false }],
    });
  });

  it.each([
    ['para birimi gönderilmemiş', 'omitted', {}],
    ['açıkça TRY', 'explicit', { currency: 'TRY' }],
  ])('TRY dosya (%s): kalemler TRY kalır', async (_title, label, currencyField) => {
    const res = await openCase(`try-${label}`, { ...currencyField, dues: [PRINCIPAL, EXPENSE] });
    expect(res.status).toBe(201);
    const row = await stored(res.body.id);
    expect(row.case.currency).toBe('TRY');
    expect(row.dues.map((d) => d.currency)).toEqual(['TRY', 'TRY']);
    expect(row.claimItems.map((ci) => ci.currency)).toEqual(['TRY', 'TRY']);
  });

  it('evrak + kalem birlikte: USD dosyada senet anaparası ile masraf kalemi AYNI para birimindedir (istenmeden karma dosya oluşmaz)', async () => {
    const res = await openCase('evrak', {
      type: 'BOND',
      currency: 'USD',
      instruments: [
        {
          type: 'SENET',
          amount: 5_000,
          issueDate: '2026-01-01',
          documentNo: `SN-${suffix}`,
          currency: 'USD',
          source: 'MANUAL',
          dueDate: '2026-01-31',
        },
      ],
      dues: [EXPENSE],
    });
    expect(res.status).toBe(201);
    const row = await stored(res.body.id);
    expect(row.dues).toEqual([{ type: 'EXPENSE', amount: 250.5, currency: 'USD' }]);
    expect(row.claimItems).toEqual([
      { itemType: 'EXPENSE', amount: 250.5, currency: 'USD', fromInstrument: false },
      { itemType: 'PRINCIPAL', amount: 5_000, currency: 'USD', fromInstrument: true },
    ]);
  });

  it('açılışta kalem bazında para birimi KABUL EDİLMEZ: 400 ve hiçbir kayıt yazılmaz (kalem bazı owner kararı)', async () => {
    const before = await tenantCounts();
    expect(before.cases).toBeGreaterThan(0); // bakıldığının kanıtı: sayaçlar bu büronun kayıtlarını görüyor

    const res = await openCase('kalem-bazli', { currency: 'USD', dues: [{ ...PRINCIPAL, currency: 'EUR' }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(['dues.0.property currency should not exist']);
    expect(await tenantCounts()).toEqual(before);
  });

  it('sonradan kalem ekleme (POST /cases/:id/dues): para birimi verilmezse DOSYA para birimi; açıkça verilen değer aynen korunur', async () => {
    const opened = await openCase('sonradan', { currency: 'USD', dues: [PRINCIPAL] });
    expect(opened.status).toBe(201);
    const caseId = opened.body.id as string;

    const omitted = await post(`/cases/${caseId}/dues`, { ...EXPENSE, amount: 100, description: 'para birimi verilmedi' });
    expect(omitted.status).toBe(201);
    expect(omitted.body.currency).toBe('USD');

    // Açık değer yolu bu değişiklikle DEĞİŞMEDİ (karma para birimine izin verilip verilmeyeceği ayrı owner kararı)
    const explicit = await post(`/cases/${caseId}/dues`, { ...EXPENSE, amount: 200, description: 'açıkça EUR', currency: 'EUR' });
    expect(explicit.status).toBe(201);
    expect(explicit.body.currency).toBe('EUR');

    const row = await stored(caseId);
    expect(row.dues).toEqual([
      { type: 'EXPENSE', amount: 100, currency: 'USD' },
      { type: 'EXPENSE', amount: 200, currency: 'EUR' },
      { type: 'PRINCIPAL', amount: 10_000, currency: 'USD' },
    ]);
    expect(row.claimItems).toEqual([
      { itemType: 'EXPENSE', amount: 100, currency: 'USD', fromInstrument: false },
      { itemType: 'EXPENSE', amount: 200, currency: 'EUR', fromInstrument: false },
      { itemType: 'PRINCIPAL', amount: 10_000, currency: 'USD', fromInstrument: false },
    ]);
  });

  it('uçtan uca sonuç: USD dosyaya dosya para birimindeki tahsilat KAYDEDİLİR (kalemler TRY damgalıyken para birimi sınırı her tahsilatı reddediyordu)', async () => {
    const debtor = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: 'DUECUR borçlu' } as never });
    const opened = await openCase(
      'tahsilat',
      {
        currency: 'USD',
        caseDebtors: [{ debtorId: debtor.id, role: 'ASIL_BORCLU' }],
        lawyers: [{ id: memberLawyer.lawyerId, name: 'avukat', surname: 'DUECUR' }],
        dues: [{ ...PRINCIPAL, interestStartDate: '2026-01-15' }],
      },
      memberLawyer.userId,
    );
    expect(opened.status).toBe(201);
    const caseId = opened.body.id as string;
    const caseDebtor = await prisma.caseDebtor.findFirstOrThrow({ where: { caseId } });

    const collection = await post(
      '/collections',
      {
        caseId,
        idempotencyKey: `duecur-${randomUUID()}`,
        caseDebtorId: caseDebtor.id,
        amount: 1_000,
        currency: 'USD',
        type: 'BANK_TRANSFER',
        date: '2026-03-01',
        sourceType: 'MANUAL',
      },
      memberLawyer.userId,
    );

    expect({ status: collection.status, code: collection.body?.code }).toEqual({ status: 201, code: undefined });
    expect(collection.body.currency).toBe('USD');
    expect(await prisma.collection.count({ where: { tenantId, caseId } })).toBe(1);
  });
});
