// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-due-currency.http.db-gated.integration.spec.ts).
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
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';

/**
 * Alacak özeti (GET /claim-items/case/:caseId/summary) — para birimi bağlamı. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main 6917e8aa): özet etkin kalem tutarlarını para birimine bakmadan topluyor ve yanıtı SON kalemin para
 * birimiyle etiketliyordu. 10.000 USD + 5.000 EUR + 2.000 TRY anaparalı dosyada `totals.principal` / `grandTotal` 17.000,
 * `currency` ise kalem sırasına göre "TRY" ya da "EUR"; "Alacak Kalemleri (Kanonik)" paneli bunu "₺17.000,00" yazıyordu.
 *
 * Kural (politika gerektirmeyen kısım): yanıtın mevcut alanlarının DEĞERİ değişmez, tutar ÇEVRİLMEZ; eklemeli
 * `paraBirimiDurumu` bloğu tek toplamın geçerli olup olmadığını ve para birimi bazında toplamları bildirir. Tek para
 * birimli (TL ve dövizli) dosyada bloktaki tek satır `totals` ile aynıdır.
 *
 * KAPSAM DIŞI (owner kararı): bir dosyada kalem başına farklı para birimine izin verilip verilmeyeceği ve dövizli
 * takipte kur. Aşağıdaki karma dosyalar bugün `POST /cases/:id/dues` ile açıkça para birimi verilerek oluşabiliyor;
 * bu yol kısıtlanırsa kurulum eski kayıt fikstürüne çevrilir, özetin sözleşmesi değişmez. "Mevcut alanlar 17.000
 * döndürmeyi sürdürür" iddiası bugünkü davranışı SABİTLER (karakterizasyon).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CLAIM-SUMMARY-CURRENCY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('Alacak özeti para birimi bağlamı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  let otherTenantId: string;
  let otherAdminId: string;
  const suffix = randomUUID().slice(0, 8);

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

    tenantId = `test-ci-clsum-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI CLSUM', slug: tenantId } });
    const admin = await prisma.user.create({
      data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'CLSUM', role: 'ADMIN' },
    });
    adminId = admin.id;

    otherTenantId = `test-ci-clsum-diger-${suffix}`;
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'CI CLSUM DIGER', slug: otherTenantId } });
    const otherAdmin = await prisma.user.create({
      data: { tenantId: otherTenantId, email: `diger-${suffix}@example.test`, name: 'diger', surname: 'CLSUM', role: 'ADMIN' },
    });
    otherAdminId = otherAdmin.id;
  });

  afterAll(async () => {
    await app?.close();
    for (const id of [tenantId, otherTenantId]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object, userId: string = adminId) =>
    http().post(path).set('x-test-user-id', userId).send(body);

  const HESAP_TARIHI = '2026-03-01';
  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });
  const expense = (amount: number) => ({ type: 'EXPENSE', description: 'Masraf', amount, dueDate: '2026-01-15' });

  const openCase = async (label: string, body: Record<string, unknown>): Promise<string> => {
    const res = await post('/cases', {
      fileNumber: `CI-CLSUM-${label}-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  /** Sonradan kalem ekleme: para birimi açıkça verilir (bugün kabul edilen yol). */
  const addDue = async (caseId: string, due: Record<string, unknown>, currency: string) => {
    const res = await post(`/cases/${caseId}/dues`, { ...due, description: `${currency} kalem`, currency });
    expect(res.status).toBe(201);
  };

  const summaryOf = async (caseId: string, userId: string = adminId) => {
    const res = await http()
      .get(`/claim-items/case/${caseId}/summary?calculationDate=${HESAP_TARIHI}`)
      .set('x-test-user-id', userId);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    return res.body.data as Record<string, any>;
  };

  /** Yanıtın düzeltmeden önce de var olan alanları. */
  const existingFieldsOf = (summary: Record<string, any>) => ({
    caseId: summary.caseId,
    currency: summary.currency,
    items: summary.items,
    totals: summary.totals,
    calculationDate: summary.calculationDate,
  });

  const totals = (overrides: Record<string, number>) => ({
    principal: 0,
    preInterest: 0,
    postInterest: 0,
    totalInterest: 0,
    expense: 0,
    fee: 0,
    attorneyFee: 0,
    penalty: 0,
    tax: 0,
    other: 0,
    grandTotal: 0,
    ...overrides,
  });

  const storedItems = (caseId: string) =>
    prisma.claimItem.findMany({
      where: { tenantId, caseId },
      select: { id: true, itemType: true, amount: true, currency: true, status: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });

  describe('tek para birimli dosya — mevcut alanlar ve gösterim dayanağı AYNEN', () => {
    it.each(['TRY', 'USD', 'EUR'])(
      '%s dosya (10.000 anapara + 250 masraf): mevcut alanlar değişmedi; tek toplam gösterilebilir ve bloktaki tek satır `totals` ile aynı',
      async (currency) => {
        const caseId = await openCase(`tek-${currency}`, { currency, dues: [principal(10_000), expense(250)] });

        const summary = await summaryOf(caseId);

        // Düzeltmeden önceki yanıtın tamamı (ölçüm: main 6917e8aa)
        expect(existingFieldsOf(summary)).toEqual({
          caseId,
          currency,
          items: [
            { type: 'PRINCIPAL', label: 'Asıl Alacak', amount: 10_000, count: 1 },
            { type: 'EXPENSE', label: 'Masraf', amount: 250, count: 1 },
          ],
          totals: totals({ principal: 10_000, expense: 250, grandTotal: 10_250 }),
          calculationDate: '2026-03-01T00:00:00.000Z',
        });
        expect(Object.keys(summary)).toEqual(['caseId', 'currency', 'items', 'totals', 'calculationDate', 'paraBirimiDurumu']);

        expect(summary.paraBirimiDurumu).toEqual({
          durum: 'TEK_PARA_BIRIMI',
          toplamGosterilebilir: true,
          gerekce: null,
          mesaj: null,
          alacakParaBirimi: currency,
          paraBirimleri: [currency],
          paraBirimiEksikKalemSayisi: 0,
          toplamlarParaBirimiBazinda: [{ paraBirimi: currency, kalemSayisi: 2, totals: summary.totals }],
        });
      },
    );

    it('kalemsiz dövizli dosya: mevcut alanlar değişmedi (currency "TRY", toplamlar 0); blok KALEM_YOK', async () => {
      const caseId = await openCase('kalemsiz', { currency: 'USD' });
      expect(await prisma.claimItem.count({ where: { tenantId, caseId } })).toBe(0);

      const summary = await summaryOf(caseId);

      expect(existingFieldsOf(summary)).toEqual({
        caseId,
        currency: 'TRY',
        items: [],
        totals: totals({}),
        calculationDate: '2026-03-01T00:00:00.000Z',
      });
      expect(summary.paraBirimiDurumu).toEqual({
        durum: 'KALEM_YOK',
        toplamGosterilebilir: true,
        gerekce: null,
        mesaj: null,
        alacakParaBirimi: null,
        paraBirimleri: [],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [],
      });
    });

    it('dosya dövizli, kalem kaydı TRY (eski kayıt): kalemler tek para biriminde → kayıttaki para birimiyle gösterilebilir; kayıt DEĞİŞTİRİLMEZ', async () => {
      const caseId = await openCase('eski', { currency: 'USD', dues: [principal(10_000), expense(250)] });
      // Eski dosyadaki durumun kurulumu: kalem para birimi TRY damgalı (dosya açılışı düzeltmesinden önceki kayıt)
      await prisma.claimItem.updateMany({ where: { tenantId, caseId }, data: { currency: 'TRY' } });
      const before = await storedItems(caseId);
      expect(before).toHaveLength(2);

      const summary = await summaryOf(caseId);

      expect(summary.currency).toBe('TRY');
      expect(summary.totals).toEqual(totals({ principal: 10_000, expense: 250, grandTotal: 10_250 }));
      expect(summary.paraBirimiDurumu).toMatchObject({
        durum: 'TEK_PARA_BIRIMI',
        toplamGosterilebilir: true,
        alacakParaBirimi: 'TRY',
        toplamlarParaBirimiBazinda: [{ paraBirimi: 'TRY', kalemSayisi: 2, totals: summary.totals }],
      });
      // Özet salt okumadır: geçmiş kayıt düzeltilmedi
      expect(await storedItems(caseId)).toEqual(before);
    });
  });

  describe('karma dosya — tek toplam geçerli tutar gibi sunulmaz', () => {
    it('karma anapara (USD 10.000 + EUR 5.000 + TRY 2.000): tek toplam GÖSTERİLEMEZ; toplamlar para birimi bazında, çevrilmeden', async () => {
      const caseId = await openCase('karma', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(caseId, principal(5_000), 'EUR');
      await addDue(caseId, principal(2_000), 'TRY');

      const summary = await summaryOf(caseId);

      // Karakterizasyon: mevcut alanlar sessizce değiştirilmedi (17.000 = USD + EUR + TRY; etiket son kalemin para birimi)
      expect(existingFieldsOf(summary)).toEqual({
        caseId,
        currency: 'TRY',
        items: [{ type: 'PRINCIPAL', label: 'Asıl Alacak', amount: 17_000, count: 3 }],
        totals: totals({ principal: 17_000, grandTotal: 17_000 }),
        calculationDate: '2026-03-01T00:00:00.000Z',
      });

      expect(summary.paraBirimiDurumu).toEqual({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
        mesaj:
          'Dosyada birden fazla para biriminde alacak kalemi var (EUR, TRY, USD). Tutarlar çevrilmedi ve tek toplamda ' +
          'birleştirilmedi; toplamlar para birimi bazında gösterilir.',
        alacakParaBirimi: null,
        paraBirimleri: ['EUR', 'TRY', 'USD'],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [
          { paraBirimi: 'EUR', kalemSayisi: 1, totals: totals({ principal: 5_000, grandTotal: 5_000 }) },
          { paraBirimi: 'TRY', kalemSayisi: 1, totals: totals({ principal: 2_000, grandTotal: 2_000 }) },
          { paraBirimi: 'USD', kalemSayisi: 1, totals: totals({ principal: 10_000, grandTotal: 10_000 }) },
        ],
      });
      // Blokta çapraz para birimi toplamı yok
      expect(JSON.stringify(summary.paraBirimiDurumu)).not.toContain('17000');
    });

    it('aynı kalemler, ekleme sırası ters (EUR son): mevcut `currency` etiketi değişir ("EUR"), blok AYNI kalır', async () => {
      const trySon = await openCase('sira-try', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(trySon, principal(5_000), 'EUR');
      await addDue(trySon, principal(2_000), 'TRY');
      const eurSon = await openCase('sira-eur', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(eurSon, principal(2_000), 'TRY');
      await addDue(eurSon, principal(5_000), 'EUR');

      const a = await summaryOf(trySon);
      const b = await summaryOf(eurSon);

      // Bilinen kusurun kaydı: tek etiket kalem sırasına bağlıdır ve aynı 17.000'i iki farklı para birimiyle adlandırır
      expect([a.currency, b.currency]).toEqual(['TRY', 'EUR']);
      expect([a.totals.grandTotal, b.totals.grandTotal]).toEqual([17_000, 17_000]);
      expect(b.paraBirimiDurumu).toEqual(a.paraBirimiDurumu);
      expect(a.paraBirimiDurumu.toplamGosterilebilir).toBe(false);
    });

    it('aynı kategoride farklı para birimi (USD anapara + USD 250 masraf + EUR 300 masraf): kategori toplamı da ayrılır', async () => {
      const caseId = await openCase('masraf', { currency: 'USD', dues: [principal(10_000), expense(250)] });
      await addDue(caseId, expense(300), 'EUR');

      const summary = await summaryOf(caseId);

      // Karakterizasyon: mevcut alanlarda masraf 550 (250 USD + 300 EUR), toplam 10.550
      expect(summary.totals).toEqual(totals({ principal: 10_000, expense: 550, grandTotal: 10_550 }));
      expect(summary.paraBirimiDurumu).toMatchObject({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        paraBirimleri: ['EUR', 'USD'],
        toplamlarParaBirimiBazinda: [
          { paraBirimi: 'EUR', kalemSayisi: 1, totals: totals({ expense: 300, grandTotal: 300 }) },
          { paraBirimi: 'USD', kalemSayisi: 2, totals: totals({ principal: 10_000, expense: 250, grandTotal: 10_250 }) },
        ],
      });
    });

    it('yalnız ETKİN kalemler sayılır: iptal edilmiş başka para birimindeki kalem dosyayı karma yapmaz', async () => {
      const caseId = await openCase('iptal', { currency: 'USD', dues: [principal(10_000)] });
      await addDue(caseId, expense(300), 'EUR');
      expect((await summaryOf(caseId)).paraBirimiDurumu.durum).toBe('KARMA_PARA_BIRIMI'); // kontrol: iptalden önce karma

      const cancelled = await prisma.claimItem.updateMany({
        where: { tenantId, caseId, currency: 'EUR' },
        data: { status: 'CANCELLED' },
      });
      expect(cancelled.count).toBe(1);

      const summary = await summaryOf(caseId);

      expect(summary.currency).toBe('USD');
      expect(summary.totals).toEqual(totals({ principal: 10_000, grandTotal: 10_000 }));
      expect(summary.paraBirimiDurumu).toMatchObject({
        durum: 'TEK_PARA_BIRIMI',
        toplamGosterilebilir: true,
        alacakParaBirimi: 'USD',
        toplamlarParaBirimiBazinda: [{ paraBirimi: 'USD', kalemSayisi: 1, totals: summary.totals }],
      });
    });
  });

  describe('kalem sırası BELİRLEYİCİ — sortOrder, ardından oluşturulma zamanı, ardından kimlik', () => {
    // Dosya açılışında kalemlerin hepsi sortOrder=0 taşır; tek anahtarlı sıralama eşitlikte plana / yığın yerleşimine
    // bağlıydı (aynı sorgu + aynı veri, farklı plan → farklı sıra). `items` ve `currency` bu sırayı izler.
    const setKeys = (caseId: string, itemType: string, data: { sortOrder?: number; createdAt?: Date }) =>
      prisma.claimItem.updateMany({ where: { tenantId, caseId, itemType: itemType as never }, data });
    const typesOf = (summary: Record<string, any>) => (summary.items as Array<{ type: string }>).map((item) => item.type);

    it('açılışta kalemlerin sortOrder değeri eşittir (sıralamanın dayandığı koşul)', async () => {
      const caseId = await openCase('sira-esit', { currency: 'TRY', dues: [principal(10_000), expense(250)] });

      const sortOrders = (await prisma.claimItem.findMany({ where: { tenantId, caseId }, select: { sortOrder: true } })).map(
        (row) => row.sortOrder,
      );

      expect(sortOrders).toEqual([0, 0]);
    });

    it('eşit sortOrder: oluşturulma zamanı sıralar — EXPENSE daha eski ise önce gelir', async () => {
      const caseId = await openCase('sira-zaman', { currency: 'TRY', dues: [principal(10_000), expense(250)] });
      await setKeys(caseId, 'EXPENSE', { createdAt: new Date('2026-01-01T00:00:00.000Z') });
      await setKeys(caseId, 'PRINCIPAL', { createdAt: new Date('2026-01-02T00:00:00.000Z') });

      const summary = await summaryOf(caseId);

      expect(typesOf(summary)).toEqual(['EXPENSE', 'PRINCIPAL']);
    });

    it('sortOrder önce gelir: daha küçük sortOrder daha geç oluşturulmuş olsa da öne geçer', async () => {
      const caseId = await openCase('sira-sortorder', { currency: 'TRY', dues: [principal(10_000), expense(250)] });
      await setKeys(caseId, 'PRINCIPAL', { sortOrder: 2, createdAt: new Date('2026-01-01T00:00:00.000Z') });
      await setKeys(caseId, 'EXPENSE', { sortOrder: 1, createdAt: new Date('2026-01-02T00:00:00.000Z') });

      const summary = await summaryOf(caseId);

      expect(typesOf(summary)).toEqual(['EXPENSE', 'PRINCIPAL']);
    });

    it('eşit sortOrder ve eşit oluşturulma zamanı: kimlik sıralar ve tekrarlı isteklerde sıra değişmez', async () => {
      const caseId = await openCase('sira-kimlik', { currency: 'TRY', dues: [principal(10_000), expense(250)] });
      const sameInstant = new Date('2026-01-01T00:00:00.000Z');
      await setKeys(caseId, 'PRINCIPAL', { createdAt: sameInstant });
      await setKeys(caseId, 'EXPENSE', { createdAt: sameInstant });
      const byId = await prisma.claimItem.findMany({
        where: { tenantId, caseId },
        select: { itemType: true },
        orderBy: { id: 'asc' },
      });

      for (let call = 0; call < 3; call++) {
        expect(typesOf(await summaryOf(caseId))).toEqual(byId.map((row) => row.itemType));
      }
    });
  });

  it('özet salt okumadır ve büro sınırını korur: kalem kayıtları değişmez; başka büro bu dosyanın tutarını ve para birimini görmez', async () => {
    const caseId = await openCase('sinir', { currency: 'USD', dues: [principal(10_000)] });
    await addDue(caseId, principal(5_000), 'EUR');
    const before = await storedItems(caseId);
    expect(before).toHaveLength(2);

    const own = await summaryOf(caseId);
    const foreign = await summaryOf(caseId, otherAdminId);

    expect(own.paraBirimiDurumu.paraBirimleri).toEqual(['EUR', 'USD']); // kontrol: kendi bürosu görüyor
    expect(foreign.totals).toEqual(totals({}));
    expect(foreign.items).toEqual([]);
    expect(foreign.paraBirimiDurumu).toMatchObject({ durum: 'KALEM_YOK', paraBirimleri: [], toplamlarParaBirimiBazinda: [] });
    expect(await storedItems(caseId)).toEqual(before);
  });
});
