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
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';

/**
 * Hesap özeti (GET /cases/:id/calculation-summary) — para birimi bağlamı. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main 630184e2): legacy hesap özeti kalem tutarlarını para birimine bakmadan topluyor; harç / masraf /
 * vekalet ücreti ise TL tarifesinden. 10.000 USD anaparalı dosya ile 10.000 TL anaparalı dosya AYNI sayıları üretiyor
 * (peşin harç 120, vekalet ücreti 9.000, toplam borç 20.431,10); yanıtta tutarların para birimini bildiren alan yoktu
 * ve panel hepsini "₺" ile gösteriyordu. USD + EUR + TRY anapara tek sayıda (17.000) toplanıyordu.
 *
 * Kural (politika gerektirmeyen kısım): mevcut sayısal alanların DEĞERİ değişmez, tutar ÇEVRİLMEZ; eklemeli
 * `paraBirimiDurumu` bloğu her alanın para birimini ve geçerliliğini bildirir — dövizli alacağa TL tarifesi oranı
 * uygulanarak bulunan alanlar HESAPLANAMADI, farklı para birimlerini toplayan alanlar GOSTERILEMEZ.
 *
 * KAPSAM DIŞI (owner kararı): dövizli takipte harç ve vekalet ücretinin hangi tutar ve kur üzerinden hesaplanacağı.
 * Aşağıdaki "sayılar TL dosyayla aynı" iddiası bugünkü legacy davranışını SABİTLER (karakterizasyon); kural seçildiğinde
 * bilerek değişecektir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-CALCULATION-SUMMARY-CURRENCY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('Hesap özeti para birimi bağlamı (HTTP + disposable PostgreSQL)', () => {
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

    tenantId = `test-ci-hocur-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI HOCUR', slug: tenantId } });
    const admin = await prisma.user.create({
      data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'HOCUR', role: 'ADMIN' },
    });
    adminId = admin.id;
    const office = await prisma.office.create({ data: { tenantId, name: 'CI HOCUR ofis' } });
    const lawyerUser = await prisma.user.create({
      data: { tenantId, email: `avukat-${suffix}@example.test`, name: 'avukat', surname: 'HOCUR', role: 'USER' },
    });
    const lawyer = await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: lawyerUser.id, name: 'avukat', surname: 'HOCUR', lawyerRank: 'PARTNER' },
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

  const HESAP_TARIHI = '2026-03-01';
  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });
  const EXPENSE = { type: 'EXPENSE', description: 'Masraf', amount: 250, dueDate: '2026-01-15' };

  const openCase = async (label: string, body: Record<string, unknown>, userId?: string): Promise<string> => {
    const res = await post(
      '/cases',
      {
        fileNumber: `CI-HOCUR-${label}-${suffix}`,
        type: 'GENERAL_EXECUTION',
        interestType: 'YASAL',
        startDate: '2026-02-01',
        ...body,
      },
      userId,
    );
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  const summaryOf = async (caseId: string, userId: string = adminId) => {
    const res = await http().get(`/cases/${caseId}/calculation-summary?date=${HESAP_TARIHI}`).set('x-test-user-id', userId);
    expect(res.status).toBe(200);
    return res.body as Record<string, any>;
  };

  const NUMERIC_FIELDS = [
    'asilAlacak', 'tazminat', 'komisyon', 'takipOncesiFaiz', 'takipTutari',
    'basvurmaHarci', 'vekaletHarci', 'pesinHarc', 'dosyaGideri', 'tebligatGideri', 'vekaletPulu', 'icraMasraflari',
    'pesinHarcDahilTahsilHarci', 'pesinHarcHaricTahsilHarci', 'vekaletUcreti', 'takipSonrasiFaiz',
    'toplamBorc', 'sonBorc', 'toplamTahsilat', 'kalanBorc', 'kalanAnapara',
  ] as const;
  const numbersOf = (summary: Record<string, any>) => Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, summary[field]]));

  const CLAIM = ['asilAlacak', 'tazminat', 'komisyon', 'takipOncesiFaiz', 'takipTutari', 'takipSonrasiFaiz', 'kalanAnapara'];
  const TARIFF_FIXED = ['basvurmaHarci', 'vekaletHarci', 'dosyaGideri', 'tebligatGideri', 'vekaletPulu'];
  const TARIFF_RATE = ['pesinHarc', 'icraMasraflari', 'pesinHarcDahilTahsilHarci', 'pesinHarcHaricTahsilHarci', 'vekaletUcreti'];
  const TOTAL = ['toplamBorc', 'sonBorc', 'kalanBorc', 'tahsilOranlari'];
  const pick = (summary: Record<string, any>, fields: string[]) => fields.map((field) => summary.paraBirimiDurumu.alanlar[field]);

  it('TL dosya (kontrol): tek toplam gösterilebilir; bütün alanlar TRY ve geçerli', async () => {
    const summary = await summaryOf(await openCase('try', { currency: 'TRY', dues: [principal(10_000), EXPENSE] }));

    expect(numbersOf(summary)).toMatchObject({ asilAlacak: 10_000, pesinHarc: 120, vekaletUcreti: 9000, toplamBorc: 20_431.1, sonBorc: 20_945.76 });
    expect(summary.paraBirimiDurumu).toMatchObject({
      dosyaParaBirimi: 'TRY',
      tarifeParaBirimi: 'TRY',
      durum: 'TEK_PARA_BIRIMI_TL',
      toplamGosterilebilir: true,
      gerekce: null,
      mesaj: null,
      alacakParaBirimi: 'TRY',
      asilAlacakParaBirimiBazinda: [{ paraBirimi: 'TRY', tutar: 10_000 }],
      tahsilatParaBirimiBazinda: [],
    });
    const alanlar = Object.values(summary.paraBirimiDurumu.alanlar) as Array<{ paraBirimi: string | null; durum: string }>;
    expect(alanlar.length).toBeGreaterThanOrEqual(NUMERIC_FIELDS.length); // bakıldığının kanıtı: karar listesi boş değil
    expect(alanlar.every((alan) => alan.durum === 'GECERLI' && alan.paraBirimi === 'TRY')).toBe(true);
  });

  it.each(['USD', 'EUR'])(
    '%s dosya: sayılar TL dosyayla AYNI (legacy değişmedi, çevirme yok) ama oranlı kalemler HESAPLANAMADI, toplamlar GOSTERILEMEZ',
    async (currency) => {
      const tl = await summaryOf(await openCase(`cmp-try-${currency}`, { currency: 'TRY', dues: [principal(10_000), EXPENSE] }));
      const fx = await summaryOf(
        await openCase(`fx-${currency}`, { currency, subCategory: 'DOVIZ', dues: [principal(10_000), EXPENSE] }),
      );

      // Karakterizasyon: mevcut alanların anlamı sessizce değiştirilmedi — dövizli dosya TL dosyayla aynı sayıları üretir
      expect(numbersOf(fx)).toEqual(numbersOf(tl));
      expect(fx.tahsilOranlari).toEqual(tl.tahsilOranlari);

      expect(fx.paraBirimiDurumu).toMatchObject({
        dosyaParaBirimi: currency,
        tarifeParaBirimi: 'TRY',
        durum: 'TEK_PARA_BIRIMI_DOVIZ',
        toplamGosterilebilir: false,
        gerekce: 'DOVIZ_ALACAK_ILE_TL_TARIFE_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
        alacakParaBirimi: currency,
        asilAlacakParaBirimiBazinda: [{ paraBirimi: currency, tutar: 10_000 }],
        tahsilatParaBirimiBazinda: [],
      });
      expect(fx.paraBirimiDurumu.mesaj).toContain(currency);
      expect(pick(fx, CLAIM)).toEqual(CLAIM.map(() => ({ paraBirimi: currency, durum: 'GECERLI' })));
      expect(pick(fx, TARIFF_FIXED)).toEqual(TARIFF_FIXED.map(() => ({ paraBirimi: 'TRY', durum: 'GECERLI' })));
      expect(pick(fx, TARIFF_RATE)).toEqual(TARIFF_RATE.map(() => ({ paraBirimi: null, durum: 'HESAPLANAMADI' })));
      expect(pick(fx, TOTAL)).toEqual(TOTAL.map(() => ({ paraBirimi: null, durum: 'GOSTERILEMEZ' })));
    },
  );

  it('karma anapara (USD + EUR + TRY): legacy asilAlacak tek sayıdır (17.000, değişmedi); blok para birimi bazında ayırır', async () => {
    const caseId = await openCase('karma', { currency: 'USD', subCategory: 'DOVIZ', dues: [principal(10_000)] });
    for (const [amount, currency] of [[5_000, 'EUR'], [2_000, 'TRY']] as const) {
      const added = await post(`/cases/${caseId}/dues`, { ...principal(amount), description: `${currency} anapara`, currency });
      expect(added.status).toBe(201);
    }
    const summary = await summaryOf(caseId);

    expect(summary.asilAlacak).toBe(17_000);
    expect(summary.paraBirimiDurumu).toMatchObject({
      dosyaParaBirimi: 'USD',
      durum: 'KARMA_PARA_BIRIMI',
      toplamGosterilebilir: false,
      gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
      alacakParaBirimi: null,
      asilAlacakParaBirimiBazinda: [
        { paraBirimi: 'EUR', tutar: 5_000 },
        { paraBirimi: 'TRY', tutar: 2_000 },
        { paraBirimi: 'USD', tutar: 10_000 },
      ],
    });
    expect(pick(summary, CLAIM)).toEqual(CLAIM.map(() => ({ paraBirimi: null, durum: 'GOSTERILEMEZ' })));
    expect(pick(summary, TARIFF_FIXED)).toEqual(TARIFF_FIXED.map(() => ({ paraBirimi: 'TRY', durum: 'GECERLI' })));
    expect(pick(summary, TARIFF_RATE)).toEqual(TARIFF_RATE.map(() => ({ paraBirimi: null, durum: 'HESAPLANAMADI' })));
  });

  it('dosya dövizli, kalem kaydı TRY (eski kayıt): tutar kayıttaki para birimiyle kalır, uyuşmazlık bildirilir; kayıt DEĞİŞTİRİLMEZ', async () => {
    const caseId = await openCase('eski', { currency: 'USD', subCategory: 'DOVIZ', dues: [principal(10_000)] });
    // Eski dosyadaki durumun kurulumu: kalem para birimi TRY damgalı (dosya açılışı düzeltmesinden önceki kayıt)
    await prisma.due.updateMany({ where: { caseId }, data: { currency: 'TRY' } });
    const before = await prisma.due.findMany({ where: { caseId }, select: { id: true, amount: true, currency: true, updatedAt: true } });

    const summary = await summaryOf(caseId);

    expect(summary.paraBirimiDurumu).toMatchObject({
      dosyaParaBirimi: 'USD',
      durum: 'KARMA_PARA_BIRIMI',
      toplamGosterilebilir: false,
      gerekce: 'DOSYA_VE_KAYIT_PARA_BIRIMI_UYUSMUYOR',
      alacakParaBirimi: 'TRY',
      asilAlacakParaBirimiBazinda: [{ paraBirimi: 'TRY', tutar: 10_000 }],
    });
    expect(pick(summary, TARIFF_RATE)).toEqual(TARIFF_RATE.map(() => ({ paraBirimi: null, durum: 'HESAPLANAMADI' })));
    expect(pick(summary, TOTAL)).toEqual(TOTAL.map(() => ({ paraBirimi: null, durum: 'GOSTERILEMEZ' })));
    // Hesap özeti salt okumadır: geçmiş kayıt düzeltilmedi
    expect(await prisma.due.findMany({ where: { caseId }, select: { id: true, amount: true, currency: true, updatedAt: true } })).toEqual(before);
  });

  it('dövizli dosyada tahsilat: tahsilat kendi para biriminde ayrı durur; kalan borç tek sayı olarak GOSTERILEMEZ', async () => {
    const debtor = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: 'HOCUR borçlu' } as never });
    const caseId = await openCase(
      'tahsilat',
      {
        currency: 'USD',
        subCategory: 'DOVIZ',
        caseDebtors: [{ debtorId: debtor.id, role: 'ASIL_BORCLU' }],
        lawyers: [{ id: memberLawyer.lawyerId, name: 'avukat', surname: 'HOCUR' }],
        dues: [{ ...principal(10_000), interestStartDate: '2026-01-15' }],
      },
      memberLawyer.userId,
    );
    const caseDebtor = await prisma.caseDebtor.findFirstOrThrow({ where: { caseId } });
    const collection = await post(
      '/collections',
      {
        caseId,
        idempotencyKey: `hocur-${randomUUID()}`,
        caseDebtorId: caseDebtor.id,
        amount: 1_000,
        currency: 'USD',
        type: 'BANK_TRANSFER',
        date: '2026-02-15',
        sourceType: 'MANUAL',
      },
      memberLawyer.userId,
    );
    expect({ status: collection.status, code: collection.body?.code }).toEqual({ status: 201, code: undefined });

    const summary = await summaryOf(caseId, memberLawyer.userId);

    // Legacy: 1.000 USD tahsilat, USD + TL karışık "son borç"tan düşülüyor (değişmedi) — blok bunun geçerli olmadığını bildirir
    expect(summary.toplamTahsilat).toBe(1_000);
    expect(summary.kalanBorc).toBeCloseTo(summary.sonBorc - 1_000, 2);
    expect(summary.paraBirimiDurumu).toMatchObject({
      durum: 'TEK_PARA_BIRIMI_DOVIZ',
      tahsilatParaBirimiBazinda: [{ paraBirimi: 'USD', tutar: 1_000 }],
    });
    expect(summary.paraBirimiDurumu.alanlar.toplamTahsilat).toEqual({ paraBirimi: 'USD', durum: 'GECERLI' });
    expect(summary.paraBirimiDurumu.alanlar.kalanBorc).toEqual({ paraBirimi: null, durum: 'GOSTERILEMEZ' });
  });
});
