// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-due-currency.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ConflictException, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
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
import { CostPackageModule } from '../cost-package.module';
import { CostPackageService } from '../cost-package.service';

/**
 * Masraf paketi önerisi (POST /cost-packages/compute) — dövizli dosyada oranlı kalem. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main 8727e5d2): paket hesabı yüzde kuralını dosya anaparasının SAYISINA para birimine bakmadan uygular.
 * "UYAP Öncesi / Takip Açılış Masrafları" paketinde 1.000.000 USD / EUR anaparalı dosyanın peşin harç önerisi 5.000 TL,
 * paket toplamı 5.857,90 TL — 1.000.000 TL'lik dosyayla AYNI; USD + TRY anaparalı dosyada da aynı. Öneri masraf talebi
 * penceresine dolu gelir; kaydedilirse PENDING / BLOCKING talep ve muhasebe günlüğü olur.
 *
 * Kural (owner ara kararı 2026-10-01): kur / matrah sözleşmesi yokken yanlış tutarlı otomatik masraf tutarı kesinleşmiş
 * gibi oluşmaz / sunulmaz; eksik tutar 0 sayılmaz; sessizce atlanmaz — neden ve tamamlanması gereken bilgi döner. Sabit ve
 * adet bazlı kalemler, TL dosyanın yanıtı ve geçmiş talepler DEĞİŞMEZ. Eksik öneri yalnız onu işleyebildiğini beyan eden
 * çağırana döner; beyan etmeyen çağıran (eski istemci, iç çağıran) eksik toplamı paket toplamı gibi alamaz.
 *
 * KAPSAM DIŞI (owner kararı): dövizli takipte oranlı kalemin hangi tutar ve kur üzerinden hesaplanacağı.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('COST-PACKAGE-COMPUTE-FX-BASIS DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

const REASON = 'COST_PACKAGE_FX_BASIS_POLICY_MISSING';
const OPENING_PACKAGE_NAME = 'UYAP Öncesi / Takip Açılış Masrafları';
const PESIN_HARC_MISSING = { itemCode: 'PESIN_HARC', label: 'Peşin Harç', isEditable: true, sortOrder: 3 };

/** Matrahtan bağımsız (sabit / adet bazlı) açılış paketi kalemleri — her para biriminde AYNI. */
const fixedOpeningItems = (debtorCount = 1) => [
  { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', suggestedAmount: 615.4, finalAmount: 615.4, isEditable: false, sortOrder: 1 },
  { itemCode: 'VEKALET_HARCI', label: 'Vekalet Harcı', suggestedAmount: 87.5, finalAmount: 87.5, isEditable: false, sortOrder: 2 },
  { itemCode: 'DOSYA_GIDERI', label: 'Dosya Gideri', suggestedAmount: 2, finalAmount: 2, isEditable: false, sortOrder: 4 },
  {
    itemCode: 'TEBLIGAT_GIDERI',
    label: 'Tebligat Gideri',
    suggestedAmount: 15 * debtorCount,
    finalAmount: 15 * debtorCount,
    isEditable: true,
    calcParams: { unitAmount: 15, multiplier: 'debtorCount', multiplierValue: debtorCount },
    sortOrder: 5,
  },
  { itemCode: 'VEKALET_PULU', label: 'Vekalet Pulu', suggestedAmount: 138, finalAmount: 138, isEditable: false, sortOrder: 6 },
];

const pesinHarcItem = (baseValue: number, amount: number) => ({
  itemCode: 'PESIN_HARC',
  label: 'Peşin Harç',
  suggestedAmount: amount,
  finalAmount: amount,
  isEditable: true,
  calcParams: { rate: 0.005, base: 'principalAmount', baseValue },
  sortOrder: 3,
});

const bySortOrder = <T extends { sortOrder: number }>(items: T[]): T[] => [...items].sort((a, b) => a.sortOrder - b.sortOrder);

describeWithDisposableDb('Masraf paketi önerisi — dövizli dosyada oranlı kalem (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(240_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  let clientId: string;
  const suffix = randomUUID().slice(0, 8);
  // Kodlar koşuya özeldir: paket koda göre aranır (sistem paketi + büro paketi); ortak veritabanında ad çakışmasın
  const OPENING = `CPFX_UYAP_PRE_${suffix}`;
  const RE_NOTIFICATION = `CPFX_RE_TEBLIGAT_${suffix}`;
  const SEIZURE = `CPFX_HACIZ_${suffix}`;
  const SALE = `CPFX_SATIS_${suffix}`;
  const RULE_CLASSES = `CPFX_KURAL_${suffix}`;

  /** TL dosyada 1.000.000 anapara için bugünkü açılış paketi yanıtı (değişmemeli; fazladan alan da gelmemeli). */
  const tlOpeningResponse = (pesinBase = 1_000_000, pesinAmount = 5_000, debtorCount = 1) => ({
    packageCode: OPENING,
    packageName: OPENING_PACKAGE_NAME,
    items: bySortOrder([...fixedOpeningItems(debtorCount), pesinHarcItem(pesinBase, pesinAmount)]),
    totalSuggested: Math.round((842.9 + 15 * debtorCount + pesinAmount) * 100) / 100,
    messageTemplateCode: 'TPL_UYAP_PRE',
  });

  const incompleteOf = (caseCurrency: string, basisCurrencies: string[]) => ({
    reasonCode: REASON,
    message: expect.stringContaining(`${OPENING_PACKAGE_NAME} paketinin önerisi eksik: `),
    requiredInfo: ['Peşin Harç tutarı (TL)'],
    notCalculableItems: [PESIN_HARC_MISSING],
    caseCurrency,
    basisCurrencies,
    tariffCurrency: 'TRY',
  });

  /** Dövizli / karma dosyada eksik öneri: sabit ve adet bazlı kalemler aynen, peşin harç YOK, toplam yalnız listelenenler. */
  const incompleteOpeningResponse = (caseCurrency: string, basisCurrencies: string[], debtorCount = 1) => ({
    packageCode: OPENING,
    packageName: OPENING_PACKAGE_NAME,
    items: fixedOpeningItems(debtorCount),
    totalSuggested: Math.round((842.9 + 15 * debtorCount) * 100) / 100,
    messageTemplateCode: 'TPL_UYAP_PRE',
    incompleteSuggestion: incompleteOf(caseCurrency, basisCurrencies),
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule, CostPackageModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      // Paket denetleyicisi passport korumasını doğrudan kullanır (AuthGuard('jwt') aynı sınıfı döndürür)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    tenantId = `test-ci-cpfx-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI CPFX', slug: tenantId } });
    adminId = (await prisma.user.create({ data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'CPFX', role: 'ADMIN' } })).id;
    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'CPFX müvekkil', displayName: 'CPFX müvekkil' } })).id;

    // Depodaki sistem paketi tanımlarıyla (prisma/seed-cost-packages.ts) AYNI kalemler; büroya özel satır
    const packages: Array<{ code: string; name: string; messageTemplateCode?: string; items: Array<Record<string, unknown>> }> = [
      {
        code: OPENING,
        name: OPENING_PACKAGE_NAME,
        messageTemplateCode: 'TPL_UYAP_PRE',
        items: [
          { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', defaultAmount: 615.4, sortOrder: 1, isEditable: false },
          { itemCode: 'VEKALET_HARCI', label: 'Vekalet Harcı', defaultAmount: 87.5, sortOrder: 2, isEditable: false },
          { itemCode: 'PESIN_HARC', label: 'Peşin Harç', defaultAmount: 5722.19, sortOrder: 3, isEditable: true, calcRule: { type: 'percentage', rate: 0.005, base: 'principalAmount', min: 100 } },
          { itemCode: 'DOSYA_GIDERI', label: 'Dosya Gideri', defaultAmount: 2, sortOrder: 4, isEditable: false },
          { itemCode: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', defaultAmount: 15, sortOrder: 5, isEditable: true, calcRule: { type: 'per_unit', unitAmount: 15, multiplier: 'debtorCount' } },
          { itemCode: 'VEKALET_PULU', label: 'Vekalet Pulu', defaultAmount: 138, sortOrder: 6, isEditable: false },
        ],
      },
      {
        code: RE_NOTIFICATION,
        name: 'Yeniden Tebligat Masrafları',
        items: [
          { itemCode: 'YENIDEN_TEBLIGAT', label: 'Yeniden Tebligat Gideri', defaultAmount: 15, sortOrder: 1, isEditable: true, calcRule: { type: 'per_unit', unitAmount: 15, multiplier: 'tebligatCount' } },
          { itemCode: 'POSTA_GIDERI', label: 'Posta/Kargo Gideri', defaultAmount: 25, sortOrder: 2, isEditable: true },
        ],
      },
      {
        code: SEIZURE,
        name: 'Haciz İşlemi Masrafları',
        items: [
          { itemCode: 'HACIZ_HARCI', label: 'Haciz Harcı', defaultAmount: 500, sortOrder: 1, isEditable: true },
          { itemCode: 'HACIZ_YOLLUK', label: 'Haciz Yolluk Gideri', defaultAmount: 350, sortOrder: 2, isEditable: true },
          { itemCode: 'HACIZ_BILIRKISI', label: 'Bilirkişi Ücreti', defaultAmount: 1000, sortOrder: 3, isEditable: true },
          { itemCode: 'HACIZ_MUHAFAZA', label: 'Muhafaza Gideri', defaultAmount: 500, sortOrder: 4, isEditable: true },
        ],
      },
      {
        code: SALE,
        name: 'Satış İşlemi Masrafları',
        items: [
          { itemCode: 'SATIS_AVANSI', label: 'Satış Avansı', defaultAmount: 2000, sortOrder: 1, isEditable: true },
          { itemCode: 'ILAN_GIDERI', label: 'İlan Gideri', defaultAmount: 1500, sortOrder: 2, isEditable: true },
          { itemCode: 'KIYMET_TAKDIRI', label: 'Kıymet Takdiri Ücreti', defaultAmount: 1000, sortOrder: 3, isEditable: true },
        ],
      },
      {
        // Büroya özel paket POST /cost-packages ile herhangi bir hesap kuralı alabilir: kural sınıfları
        code: RULE_CLASSES,
        name: 'Kural sınıfları',
        items: [
          { itemCode: 'ORAN_UST_SINIR', label: 'Oran + üst sınır', defaultAmount: 1, sortOrder: 1, isEditable: true, calcRule: { type: 'percentage', rate: 0.01, base: 'principalAmount', max: 3000 } },
          { itemCode: 'ORAN_ADET_TABANI', label: 'Oran, adet tabanı', defaultAmount: 2, sortOrder: 2, isEditable: true, calcRule: { type: 'percentage', rate: 10, base: 'debtorCount' } },
          { itemCode: 'ORAN_BILINMEYEN_TABAN', label: 'Oran, bilinmeyen taban', defaultAmount: 3, sortOrder: 3, isEditable: true, calcRule: { type: 'percentage', rate: 0.02, base: 'totalDebt', min: 7 } },
          { itemCode: 'BILINMEYEN_KURAL', label: 'Bilinmeyen kural türü', defaultAmount: 4, sortOrder: 4, isEditable: true, calcRule: { type: 'tiered' } },
          { itemCode: 'ORAN_DUZENLENEMEZ', label: 'Oran, düzenlenemez', defaultAmount: 5, sortOrder: 5, isEditable: false, calcRule: { type: 'percentage', rate: 0.001, base: 'principalAmount' } },
        ],
      },
    ];
    for (const pkg of packages) {
      await prisma.costPackage.create({
        data: { tenantId, code: pkg.code, name: pkg.name, messageTemplateCode: pkg.messageTemplateCode, items: { create: pkg.items as never } },
      });
    }
  });

  afterAll(async () => {
    await app?.close();
    // Paket satırı büroya ilişkiyle bağlı değildir: büro silinince kendiliğinden gitmez
    await prisma.costPackage.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object = {}) => http().post(path).set('x-test-user-id', adminId).send(body);

  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });
  const withClient = () => ({ creditors: [{ id: clientId, type: 'COMPANY', name: 'CPFX müvekkil' }] });
  const inCurrency = (currency: string) => (currency === 'TRY' ? { currency } : { currency, subCategory: 'DOVIZ' });

  const openCase = async (label: string, body: Record<string, unknown>) => {
    const res = await post('/cases', {
      fileNumber: `CI-CPFX-${label}-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      ...body,
    });
    expect({ label, status: res.status, message: res.body?.message }).toEqual({ label, status: 201, message: undefined });
    return res.body.id as string;
  };

  /** Eksik öneriyi işleyebildiğini beyan eden istemci (masraf talebi penceresi). */
  const compute = (caseId: string, packageCode: string, extra: Record<string, unknown> = {}) =>
    post('/cost-packages/compute', { caseId, packageCode, acceptIncomplete: true, ...extra });
  /** Beyan etmeyen istemci (eski istemci / bugünkü gövde). */
  const computeLegacy = (caseId: string, packageCode: string, extra: Record<string, unknown> = {}) =>
    post('/cost-packages/compute', { caseId, packageCode, ...extra });

  /** Dosyanın masraf / muhasebe / bakiye yazma izi (satır içeriği ve değişme zamanıyla). */
  const footprintOf = async (caseId: string) => ({
    requests: (
      await prisma.expenseRequest.findMany({ where: { tenantId, caseId }, include: { requestItems: true }, orderBy: { createdAt: 'asc' } })
    ).map((row) => ({
      id: row.id,
      status: String(row.status),
      totalAmount: Number(row.totalAmount),
      legacyItems: row.items,
      requestItemCount: row.requestItems.length,
      updatedAt: row.updatedAt.toISOString(),
    })),
    journalEntries: await prisma.accountingJournalEntry.count({ where: { tenantId, caseId } }),
    caseBalances: await prisma.caseBalance.count({ where: { caseId } }),
    balanceLedgers: await prisma.balanceLedger.count({ where: { tenantId, caseBalance: { caseId } } }),
  });

  describe('TL dosya (kontrol): mevcut yanıt aynen', () => {
    let caseId: string;

    beforeAll(async () => {
      caseId = await openCase('try', { ...inCurrency('TRY'), dues: [principal(1_000_000)] });
    });

    it('açılış paketi: peşin harç anaparanın binde beşi, toplam 5.857,90 — eksik öneri alanı YOK (beyanlı ve beyansız istek aynı)', async () => {
      for (const send of [compute, computeLegacy]) {
        const res = await send(caseId, OPENING);
        expect(res.status).toBe(201);
        expect(res.body).toEqual(tlOpeningResponse());
      }
    });

    it('gövde parametreleri: istekle gelen anapara ve borçlu adedi bugünkü gibi uygulanır', async () => {
      expect((await computeLegacy(caseId, OPENING, { principalAmount: 200_000 })).body).toEqual(tlOpeningResponse(200_000, 1_000));
      expect((await computeLegacy(caseId, OPENING, { debtorCount: 3 })).body).toEqual(tlOpeningResponse(1_000_000, 5_000, 3));
    });

    it('anaparasız TL dosya: oranlı kalem bugünkü gibi alt sınırı alır', async () => {
      const noPrincipal = await openCase('try-anaparasiz', { ...inCurrency('TRY') });

      expect((await computeLegacy(noPrincipal, OPENING)).body).toEqual(tlOpeningResponse(0, 100));
    });

    it('anapara DIŞI kalemin para birimi matrahı etkilemez: dövizli masraf kalemi eklenen TL dosyada yanıt aynen', async () => {
      const withFxExpense = await openCase('try-doviz-masraf', { ...inCurrency('TRY'), dues: [principal(1_000_000)] });
      const added = await post(`/cases/${withFxExpense}/dues`, { type: 'EXPENSE', description: 'Yurt dışı tebligat gideri', amount: 500, dueDate: '2026-01-20', currency: 'USD' });
      expect(added.status).toBe(201);
      // Kurulum doğrulaması: dövizli kalem hem Due hem alacak kalemi (ClaimItem) olarak kayıtlı, ikisi de anapara DEĞİL
      const recorded = async () => ({
        dues: (await prisma.due.findMany({ where: { caseId: withFxExpense }, orderBy: { createdAt: 'asc' } })).map((row) => `${row.type}:${row.currency}`),
        claimItems: (await prisma.claimItem.findMany({ where: { caseId: withFxExpense }, orderBy: { createdAt: 'asc' } })).map((row) => `${row.itemType}:${row.currency}`),
      });
      expect(await recorded()).toEqual({ dues: ['PRINCIPAL:TRY', 'EXPENSE:USD'], claimItems: ['PRINCIPAL:TRY', 'EXPENSE:USD'] });

      expect((await computeLegacy(withFxExpense, OPENING)).body).toEqual(tlOpeningResponse());

      // Anapara türünde Due kalmazsa matrah anapara ALACAK kalemlerinden okunur: dövizli masraf alacak kalemi yine etkilemez
      await prisma.due.updateMany({ where: { caseId: withFxExpense, type: 'PRINCIPAL' }, data: { type: 'OTHER' } });
      expect((await recorded()).dues).toEqual(['OTHER:TRY', 'EXPENSE:USD']);
      expect((await computeLegacy(withFxExpense, OPENING)).body).toEqual(tlOpeningResponse());
    });

    it('anapara kalemi (Due) varsa matrah ondan okunur; alacak kalemindeki farklı para birimi dikkate alınmaz (açılış setiyle aynı kural)', async () => {
      const caseId = await openCase('try-due-oncelikli', { ...inCurrency('TRY'), dues: [principal(1_000_000)] });
      expect(await prisma.claimItem.updateMany({ where: { caseId, itemType: 'PRINCIPAL' }, data: { currency: 'USD' } })).toEqual({ count: 1 });

      expect((await computeLegacy(caseId, OPENING)).body).toEqual(tlOpeningResponse());
    });

    it('kural sınıfları: üst sınır, adet tabanı, bilinmeyen taban ve bilinmeyen kural türü bugünkü tutarları verir', async () => {
      const res = await computeLegacy(caseId, RULE_CLASSES, { debtorCount: 2 });

      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('incompleteSuggestion');
      expect(res.body.totalSuggested).toBe(4031);
      expect(res.body.items.map((item: any) => [item.itemCode, item.suggestedAmount, item.finalAmount])).toEqual([
        ['ORAN_UST_SINIR', 3000, 3000],
        ['ORAN_ADET_TABANI', 20, 20],
        ['ORAN_BILINMEYEN_TABAN', 7, 7],
        ['BILINMEYEN_KURAL', 4, 4],
        ['ORAN_DUZENLENEMEZ', 1000, 1000],
      ]);
    });
  });

  describe.each(['USD', 'EUR'])('%s dosya (1.000.000 anapara)', (currency) => {
    let caseId: string;

    beforeAll(async () => {
      caseId = await openCase(`fx-${currency}`, { ...inCurrency(currency), ...withClient(), dues: [principal(1_000_000)] });
    });

    it('ÖNERİ: oranlı kalem (peşin harç) için tutar ÜRETİLMEZ, 0 da yazılmaz; neden ve gereken bilgi döner', async () => {
      const res = await compute(caseId, OPENING);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(incompleteOpeningResponse(currency, [currency]));
      expect(res.body.incompleteSuggestion.message).toContain(`paketinin önerisi eksik: dosya para birimi ${currency}.`);
      // Peşin harç ne kalem listesinde ne de herhangi bir tutar alanında: yanlış öneri (5.000) ve yanlış toplam (5.857,90) yok
      expect(res.body.items.map((item: any) => item.itemCode)).not.toContain('PESIN_HARC');
      expect(JSON.stringify(res.body)).not.toMatch(/5000|5857/);
      expect(Object.keys(res.body.incompleteSuggestion.notCalculableItems[0]).sort()).toEqual(['isEditable', 'itemCode', 'label', 'sortOrder']);
    });

    it('SABİT ve ADET BAZLI kalemler değişmez: TL dosyadaki tutarlarla birebir aynı', async () => {
      const tryCase = await openCase(`fx-${currency}-tl`, { ...inCurrency('TRY'), dues: [principal(1_000_000)] });
      const tl = (await computeLegacy(tryCase, OPENING, { debtorCount: 3 })).body;

      const fx = (await compute(caseId, OPENING, { debtorCount: 3 })).body;

      expect(fx.items).toEqual(tl.items.filter((item: any) => item.itemCode !== 'PESIN_HARC'));
      expect(fx.items).toEqual(fixedOpeningItems(3));
      // Toplam yalnız listelenen kalemlerin toplamıdır (paket toplamı DEĞİL)
      expect(fx.totalSuggested).toBe(887.9);
      expect(fx.totalSuggested).toBe(Math.round(fx.items.reduce((sum: number, item: any) => sum + item.suggestedAmount, 0) * 100) / 100);
    });

    it('BEYANSIZ İSTEK (eski istemci): eksik öneri dönmez — gerekçesiyle reddedilir; kalem, tutar ya da toplam verilmez', async () => {
      const res = await computeLegacy(caseId, OPENING);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        code: REASON,
        message: expect.stringContaining(`dosya para birimi ${currency}`),
        requiredInfo: ['Peşin Harç tutarı (TL)'],
        notCalculableItems: [PESIN_HARC_MISSING],
        caseCurrency: currency,
        basisCurrencies: [currency],
        tariffCurrency: 'TRY',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/items"|totalSuggested|suggestedAmount|finalAmount/);
    });

    it.each([['"true" (metin)', 'true'], ['1 (sayı)', 1], ['false', false], ['null', null]])(
      'beyan yalnız boolean true ile yapılır: acceptIncomplete = %s → eksik öneri dönmez',
      async (_title, acceptIncomplete) => {
        const res = await computeLegacy(caseId, OPENING, { acceptIncomplete });

        expect({ status: res.status, code: res.body?.code }).toEqual({ status: 409, code: REASON });
      },
    );

    it('istekle gelen anapara sayısı: para birimi beyan edilmediği için TL matrah sayılmaz', async () => {
      const declared = await compute(caseId, OPENING, { principalAmount: 200_000 });
      expect(declared.status).toBe(201);
      expect(declared.body).toEqual(incompleteOpeningResponse(currency, [currency]));

      expect((await computeLegacy(caseId, OPENING, { principalAmount: 200_000 })).status).toBe(409);
    });

    it('oranlı kalemi OLMAYAN paketler etkilenmez: yanıt TL dosyayla birebir aynı, beyan gerekmez', async () => {
      const tryCase = await openCase(`fx-${currency}-diger`, { ...inCurrency('TRY'), dues: [principal(1_000_000)] });

      for (const packageCode of [RE_NOTIFICATION, SEIZURE, SALE]) {
        const fx = await computeLegacy(caseId, packageCode, { tebligatCount: 2 });
        expect({ packageCode, status: fx.status }).toEqual({ packageCode, status: 201 });
        expect(fx.body).not.toHaveProperty('incompleteSuggestion');
        expect(fx.body).toEqual((await computeLegacy(tryCase, packageCode, { tebligatCount: 2 })).body);
      }
    });

    it('kural sınıfları: parasal matraha bağlı oranlar hesaplanmaz; adet tabanlı oran ve tanınmayan kural türü aynen kalır', async () => {
      const res = await compute(caseId, RULE_CLASSES, { debtorCount: 2 });

      expect(res.status).toBe(201);
      expect(res.body.items.map((item: any) => [item.itemCode, item.suggestedAmount, item.finalAmount])).toEqual([
        ['ORAN_ADET_TABANI', 20, 20],
        ['BILINMEYEN_KURAL', 4, 4],
      ]);
      expect(res.body.totalSuggested).toBe(24);
      expect(res.body.incompleteSuggestion.notCalculableItems).toEqual([
        { itemCode: 'ORAN_UST_SINIR', label: 'Oran + üst sınır', isEditable: true, sortOrder: 1 },
        { itemCode: 'ORAN_BILINMEYEN_TABAN', label: 'Oran, bilinmeyen taban', isEditable: true, sortOrder: 3 },
        { itemCode: 'ORAN_DUZENLENEMEZ', label: 'Oran, düzenlenemez', isEditable: false, sortOrder: 5 },
      ]);
      expect(res.body.incompleteSuggestion.requiredInfo).toEqual([
        'Oran + üst sınır tutarı (TL)',
        'Oran, bilinmeyen taban tutarı (TL)',
        'Oran, düzenlenemez tutarı (TL)',
      ]);
    });
  });

  it.each([
    ['dosya USD + sonradan TRY anapara kalemi', 'karma-usd-try', 'USD', { currency: 'TRY', amount: 250_000 }],
    ['dosya TRY + sonradan USD anapara kalemi', 'karma-try-usd', 'TRY', { currency: 'USD', amount: 40_000 }],
  ])('karma — %s: oranlı kalem hesaplanmaz', async (_title, label, caseCurrency, added) => {
    const caseId = await openCase(label, { ...inCurrency(caseCurrency), dues: [principal(1_000_000)] });
    const due = await post(`/cases/${caseId}/dues`, { ...principal(added.amount), description: 'İkinci anapara', currency: added.currency });
    expect(due.status).toBe(201);

    const res = await compute(caseId, OPENING);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(incompleteOpeningResponse(caseCurrency, ['TRY', 'USD']));
    expect(res.body.incompleteSuggestion.message).toContain('dosyada birden fazla para birimi var (TRY, USD)');
    expect((await computeLegacy(caseId, OPENING)).status).toBe(409);
  });

  it('dosya USD, anapara kalemi TRY damgalı (eski kayıt): kalem TRY diye TL dosya sayılmaz', async () => {
    const caseId = await openCase('eski', { ...inCurrency('USD'), dues: [principal(1_000_000)] });
    // Dosya açılışı düzeltmesinden (#2871) önceki kaydın kurulumu: kalem para birimi TRY damgalı
    await prisma.due.updateMany({ where: { caseId }, data: { currency: 'TRY' } });
    await prisma.claimItem.updateMany({ where: { caseId }, data: { currency: 'TRY' } });

    const res = await compute(caseId, OPENING);

    expect(res.body).toEqual(incompleteOpeningResponse('USD', ['TRY', 'USD']));
  });

  it('anapara kalemi (Due) olmayan dosyada matrah anapara ALACAK kalemlerinden okunur (açılış masraf setiyle aynı kaynak)', async () => {
    const caseId = await openCase('alacak-kalemi', { ...inCurrency('TRY'), dues: [principal(1_000_000)] });
    // Kurulum: dosyada anapara türünde Due kalmaz; anapara alacak kalemi (ClaimItem) dövizlidir
    await prisma.due.updateMany({ where: { caseId }, data: { type: 'OTHER' } });
    expect(await prisma.claimItem.updateMany({ where: { caseId, itemType: 'PRINCIPAL' }, data: { currency: 'USD' } })).toEqual({ count: 1 });

    const res = await compute(caseId, OPENING);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(incompleteOpeningResponse('TRY', ['TRY', 'USD']));
  });

  it('SALT HESAP: öneri ucu dövizli dosyada da TL dosyada da kayıt yazmaz; önceden paketten oluşturulmuş talep değişmez', async () => {
    const usd = await openCase('yazma-usd', { ...inCurrency('USD'), dues: [principal(1_000_000)] });
    const tl = await openCase('yazma-try', { ...inCurrency('TRY'), dues: [principal(1_000_000)] });
    // Geçmiş kayıt: düzeltmeden önce pencerede dolu gelen (yanlış) öneriyle kaydedilmiş paket talebi. Dövizli dosyada
    // artık paket yolundan oluşturulamaz (409) → geçmiş kayıt doğrudan eklenir; TL dosyada aynı yoldan oluşur.
    const legacyItems = bySortOrder([...fixedOpeningItems(), pesinHarcItem(1_000_000, 5_000)]).map((item) => ({
      type: item.itemCode,
      description: item.label,
      amount: item.finalAmount,
    }));
    await prisma.expenseRequest.create({ data: { tenantId, caseId: usd, clientId, items: legacyItems, totalAmount: 5857.9, status: 'PENDING', createdById: adminId } });
    const savedTl = await post('/expense-requests/from-package', {
      caseId: tl,
      clientId,
      packageCode: OPENING,
      items: legacyItems.map((item) => ({ itemCode: item.type, label: item.description, suggestedAmount: item.amount, finalAmount: item.amount })),
    });
    expect({ status: savedTl.status, totalAmount: Number(savedTl.body?.totalAmount) }).toEqual({ status: 201, totalAmount: 5857.9 });
    const before = { usd: await footprintOf(usd), tl: await footprintOf(tl) };
    expect(before.usd.requests).toHaveLength(1);
    expect(before.usd.journalEntries).toBe(0);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await compute(usd, OPENING)).status).toBe(201);
      expect((await computeLegacy(usd, OPENING)).status).toBe(409);
      expect((await compute(tl, OPENING)).status).toBe(201);
    }

    expect({ usd: await footprintOf(usd), tl: await footprintOf(tl) }).toEqual(before);
  });

  describe('iç çağıran (eksik öneriyi kabul ettiğini beyan etmez: UYAP gönderim hazırlığının bakiye ↔ paket toplamı karşılaştırması)', () => {
    let service: CostPackageService;

    beforeAll(() => {
      service = app.get(CostPackageService, { strict: false });
    });

    it('TL dosya: paket toplamı bugünkü gibi döner', async () => {
      const caseId = await openCase('ic-try', { ...inCurrency('TRY'), dues: [principal(1_000_000)] });

      const computed = await service.computeExpenseRequest(tenantId, { caseId, packageCode: OPENING, debtorCount: 1, tebligatCount: 1 });

      expect(computed.totalSuggested).toBe(5857.9);
      expect(computed).not.toHaveProperty('incompleteSuggestion');
    });

    it('dövizli dosya: eksik toplam paket toplamı gibi DÖNMEZ — gerekçesiyle reddedilir', async () => {
      const caseId = await openCase('ic-usd', { ...inCurrency('USD'), dues: [principal(1_000_000)] });

      const attempt = service.computeExpenseRequest(tenantId, { caseId, packageCode: OPENING, debtorCount: 1, tebligatCount: 1 });

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({ response: { code: REASON, requiredInfo: ['Peşin Harç tutarı (TL)'], caseCurrency: 'USD' } });
    });
  });

  describe('POST /expense-requests/from-package — eksik paketten kayıt ve boş tutar reddi', () => {
    const NOTHING_WRITTEN = { requests: [], journalEntries: 0, caseBalances: 0, balanceLedgers: 0 };
    const packageItems = (withPesinHarc: boolean) =>
      bySortOrder([...fixedOpeningItems(), ...(withPesinHarc ? [pesinHarcItem(1_000_000, 5_000)] : [])]).map((item) => ({
        itemCode: item.itemCode,
        label: item.label,
        suggestedAmount: item.suggestedAmount,
        finalAmount: item.finalAmount,
      }));
    const fromPackage = (caseId: string, items: unknown, extra: Record<string, unknown> = {}, packageCode: string = OPENING) =>
      post('/expense-requests/from-package', { caseId, clientId, packageCode, items, ...extra });
    const stripFootprint = async (caseId: string) => {
      const { requests, journalEntries, caseBalances, balanceLedgers } = await footprintOf(caseId);
      return { requests, journalEntries, caseBalances, balanceLedgers };
    };

    it.each([
      ['USD', { ...inCurrency('USD') }, undefined],
      ['EUR', { ...inCurrency('EUR') }, undefined],
      ['karma (USD dosya + TRY anapara kalemi)', { ...inCurrency('USD') }, { currency: 'TRY', amount: 250_000 }],
    ])('%s dosya: eski pencerenin yüklediği (peşin harçlı) ya da peşin harçsız paket talebi 409 ile reddedilir; hiçbir kayıt yazılmaz', async (label, caseBody, added) => {
      const caseId = await openCase(`fp-${String(label).slice(0, 3)}`, { ...caseBody, ...withClient(), dues: [principal(1_000_000)] });
      if (added) {
        expect((await post(`/cases/${caseId}/dues`, { ...principal(added.amount), description: 'İkinci anapara', currency: added.currency })).status).toBe(201);
      }

      for (const [title, items, extra] of [
        ['peşin harçlı (5.000)', packageItems(true), {}],
        ['peşin harçsız', packageItems(false), {}],
        ['avukat karşıladı', packageItems(false), { paidByLawyer: true }],
      ] as const) {
        const res = await fromPackage(caseId, items, extra);
        expect({ title, status: res.status, code: res.body?.code }).toEqual({ title, status: 409, code: REASON });
        expect(res.body.requiredInfo).toEqual(['Peşin Harç tutarı (TL)']);
        expect(JSON.stringify(res.body)).not.toMatch(/items"|totalSuggested|suggestedAmount|finalAmount|5857/);
      }
      expect(await stripFootprint(caseId)).toEqual(NOTHING_WRITTEN);
    });

    it('TL dosya (kontrol): bugünkü gibi 201; altı kalem toplamı 5.857,90 kaydolur', async () => {
      const caseId = await openCase('fp-try', { ...inCurrency('TRY'), dues: [principal(1_000_000)] });
      await prisma.case.update({ where: { id: caseId }, data: { clientId } });

      const res = await fromPackage(caseId, packageItems(true));

      expect({ status: res.status, requestStatus: res.body?.status, totalAmount: Number(res.body?.totalAmount) }).toEqual({ status: 201, requestStatus: 'PENDING', totalAmount: 5857.9 });
    });

    it('PASİF paket kodu doğrudan gönderilse de denetlenir (kapalı-hata): dövizli dosyada 409, kayıt yok', async () => {
      const inactiveCode = `CPFX_PASIF_${suffix}`;
      await prisma.costPackage.create({
        data: {
          tenantId,
          code: inactiveCode,
          name: 'Pasif paket',
          isActive: false,
          items: { create: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', defaultAmount: 1, sortOrder: 1, calcRule: { type: 'percentage', rate: 0.005, base: 'principalAmount' } }] },
        },
      });
      const caseId = await openCase('fp-pasif', { ...inCurrency('USD'), ...withClient(), dues: [principal(1_000_000)] });

      const res = await fromPackage(caseId, [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 5000, finalAmount: 5000 }], {}, inactiveCode);

      expect({ status: res.status, code: res.body?.code }).toEqual({ status: 409, code: REASON });
      expect(await stripFootprint(caseId)).toEqual(NOTHING_WRITTEN);
    });

    it('paket kodu tanınmıyorsa eksik-öneri denetimi yapılamaz: bugünkü davranış (kayıt) DEĞİŞMEDİ — elle girişle aynı sonuç', async () => {
      const caseId = await openCase('fp-bilinmeyen', { ...inCurrency('USD'), ...withClient(), dues: [principal(1_000_000)] });

      const res = await fromPackage(caseId, packageItems(false), {}, `CPFX_YOK_${suffix}`);

      expect(res.status).toBe(201);
    });

    describe('boş / eksik tutar (TL dosyada da): 400, hiçbir kayıt yazılmaz', () => {
      let caseId: string;

      beforeAll(async () => {
        caseId = await openCase('fp-bos-tutar', { ...inCurrency('TRY'), dues: [principal(10_000)] });
      });

      it.each([
        ['finalAmount null', [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 100, finalAmount: null }]],
        ['finalAmount yok', [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }]],
        ['finalAmount metin', [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 100, finalAmount: '100' }]],
        ['kalemlerden biri tutarsız', [{ itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', suggestedAmount: 615.4, finalAmount: 615.4 }, { itemCode: 'PESIN_HARC', label: 'Peşin Harç' }]],
      ])('%s', async (_title, items) => {
        const res = await fromPackage(caseId, items);

        expect({ status: res.status, message: res.body?.message }).toEqual({ status: 400, message: expect.stringContaining('eksik tutar 0 sayılmaz') });
        expect(await stripFootprint(caseId)).toEqual(NOTHING_WRITTEN);
      });

      it.each([[null], [[]]])('kalem listesi boş (%p)', async (items) => {
        const res = await fromPackage(caseId, items);

        expect({ status: res.status, message: res.body?.message }).toEqual({ status: 400, message: 'En az bir masraf kalemi zorunludur' });
        expect(await stripFootprint(caseId)).toEqual(NOTHING_WRITTEN);
      });

      it('AÇIKÇA girilmiş 0 bugünkü kuralla işlenir: kalem 0 yazılır, toplam diğer kalemlerindir', async () => {
        const res = await fromPackage(caseId, [
          { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', suggestedAmount: 615.4, finalAmount: 615.4 },
          { itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 0, finalAmount: 0 },
        ]);

        expect({ status: res.status, totalAmount: Number(res.body?.totalAmount) }).toEqual({ status: 201, totalAmount: 615.4 });
      });
    });
  });

  describe('ELLE GİRİŞ yolu (Manuel Giriş → POST /expense-requests): dövizli dosyada peşin harç kullanıcının girdiği tutarla kaydolur', () => {
    let usdCaseId: string;
    const manualItems = [
      { type: 'BASVURMA_HARCI', description: 'Takip açılışı başvurma harcı', amount: 738.5 },
      { type: 'PESIN_HARC', description: 'Peşin harç — icra dairesi tahakkuku (elle girildi)', amount: 2150 },
    ];

    beforeAll(async () => {
      usdCaseId = await openCase('elle-usd', { ...inCurrency('USD'), ...withClient(), dues: [principal(1_000_000)] });
    });

    const asRole = async (role: 'USER' | 'VIEWER') => {
      const roleSuffix = `${role.toLowerCase()}-${suffix}`;
      return (await prisma.user.create({ data: { tenantId, email: `${roleSuffix}@example.test`, name: role, surname: 'CPFX', role } })).id;
    };

    it('pencerenin kaynağı olan katalog PESIN_HARC kalemini sunar', async () => {
      const res = await http().get('/expense-requests/catalog').set('x-test-user-id', adminId);

      expect(res.status).toBe(200);
      expect(res.body.map((entry: any) => entry.code)).toContain('PESIN_HARC');
    });

    it('ADMIN: talep, kanonik kalem satırları ve muhasebe günlüğü girilen tutarlarla yazılır; sistem peşin harcı hesaplamaz', async () => {
      const before = await footprintOf(usdCaseId);

      const res = await post('/expense-requests', { caseId: usdCaseId, clientId, items: manualItems });

      expect({ status: res.status, requestStatus: res.body?.status, totalAmount: Number(res.body?.totalAmount) }).toEqual({ status: 201, requestStatus: 'PENDING', totalAmount: 2888.5 });
      const row = await prisma.expenseRequest.findUniqueOrThrow({ where: { id: res.body.id }, include: { requestItems: { orderBy: { sortOrder: 'asc' } } } });
      expect({ gateType: String(row.gateType), currency: row.currency }).toEqual({ gateType: 'BLOCKING', currency: 'TRY' });
      expect(row.requestItems.map((item) => [item.itemCode, Number(item.finalAmount)])).toEqual([['BASVURMA_HARCI', 738.5], ['PESIN_HARC', 2150]]);
      expect(await prisma.accountingJournalEntry.count({ where: { tenantId, caseId: usdCaseId, sourceType: 'EXPENSE_REQUEST' } })).toBe(before.journalEntries + 1);
    });

    it('USER rolü de aynı yoldan kaydedebilir (ölçüldü)', async () => {
      const caseId = await openCase('elle-usd-user', { ...inCurrency('USD'), ...withClient(), dues: [principal(1_000_000)] });
      const userId = await asRole('USER');

      const res = await http().post('/expense-requests').set('x-test-user-id', userId).send({ caseId, clientId, items: manualItems });

      expect({ status: res.status, totalAmount: Number(res.body?.totalAmount) }).toEqual({ status: 201, totalAmount: 2888.5 });
    });

    it('VIEWER rolü yazamaz: 403 VIEWER_WRITE_DENIED, kayıt yok (ölçüldü)', async () => {
      const caseId = await openCase('elle-usd-viewer', { ...inCurrency('USD'), ...withClient(), dues: [principal(1_000_000)] });
      const viewerId = await asRole('VIEWER');

      const res = await http().post('/expense-requests').set('x-test-user-id', viewerId).send({ caseId, clientId, items: manualItems });

      expect({ status: res.status, code: res.body?.code }).toEqual({ status: 403, code: 'VIEWER_WRITE_DENIED' });
      expect((await footprintOf(caseId)).requests).toEqual([]);
    });

    it.each([
      ['tutar yok', { type: 'PESIN_HARC', description: 'Peşin harç' }],
      ['tutar null', { type: 'PESIN_HARC', description: 'Peşin harç', amount: null }],
      ['tutar 0', { type: 'PESIN_HARC', description: 'Peşin harç', amount: 0 }],
    ])('elle girişte de eksik tutar kabul edilmez (%s): 400, kayıt yok', async (title, item) => {
      const caseId = await openCase(`elle-usd-bos-${String(title).replace(/\s+/g, '-')}`, { ...inCurrency('USD'), ...withClient(), dues: [principal(1_000_000)] });

      const res = await post('/expense-requests', { caseId, clientId, items: [item] });

      expect({ status: res.status, message: res.body?.message }).toEqual({ status: 400, message: expect.stringContaining('tutarı pozitif olmalı') });
      expect((await footprintOf(caseId)).requests).toEqual([]);
    });
  });

  it('bilinmeyen paket ve bilinmeyen dosya: bugünkü "bulunamadı" yanıtları (para birimi kararından önce)', async () => {
    const usd = await openCase('yok', { ...inCurrency('USD'), dues: [principal(1_000_000)] });

    const unknownPackage = await compute(usd, `CPFX_YOK_${suffix}`);
    expect({ status: unknownPackage.status, message: unknownPackage.body?.message }).toEqual({
      status: 404,
      message: `Masraf paketi bulunamadı: CPFX_YOK_${suffix}`,
    });
    const unknownCase = await compute(`yok-${suffix}`, OPENING);
    expect({ status: unknownCase.status, message: unknownCase.body?.message }).toEqual({ status: 404, message: 'Takip bulunamadı' });
  });
});
