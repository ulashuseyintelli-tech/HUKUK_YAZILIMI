import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import {
  addExpenseRequest,
  addLedgerRow,
  addPayout,
  addPostedPayable,
  cleanupTenant,
  createCase,
  createClient,
  createTenantWithUser,
  linkClient,
  type TenantFixture,
} from '../../../../test/client-currency-fixture';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AccountingJournalCutoverReadinessService } from '../../accounting-journal/accounting-journal-cutover-readiness.service';
import { ClientAccountingController } from '../client-accounting.controller';
import { ClientAccountingMovementsReadService } from '../client-accounting-movements-read.service';
import { ClientAccountingSummaryReadService } from '../client-accounting-summary-read.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';

/**
 * G1 — Müvekkil Genel Cari para birimi kapsamı: GERÇEK HTTP + disposable PostgreSQL kabulü.
 *
 * Ölçülen kusur (main 81ab9466): Genel Cari özeti TL ile istenir; müvekkilin USD dosyası TL görünümünde sessizce dışarıda
 * kalıyor, dosya satırı "₺0,00" yazıyor ve hiçbir uyarı yok (700 USD alacaklı dosya sıfır borçlu görünüyor).
 *
 * Kural: sunucu, doğru büro + müvekkil kapsamından, istenen para biriminin DIŞINDA kalan kayıt / dosyayı bildirir
 * (`paraBirimiDurumu`, `caseBreakdown[].paraBirimiKapsami`). Kapsam dışı değer GERÇEK SIFIRDAN ayrılır. TL toplamına döviz
 * eklenmez, çevirme / birleşik bakiye yok. Mevcut alanlar değişmez (eklemeli).
 *
 * KAPSAM DIŞI (owner kararı): döviz özeti / para birimi başına ayrı blok (G2), kur ve çevirme.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CLIENT-ACCOUNTING-CURRENCY-SCOPE DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

const POSTED_AT = new Date('2026-06-10T10:00:00.000Z');
const PAID_AT = new Date('2026-06-20T10:00:00.000Z');

describeWithDisposableDb('Genel Cari para birimi kapsamı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(240_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let t1: TenantFixture;
  let t2: TenantFixture;
  const suffix = randomUUID().slice(0, 8);
  let seq = 0;
  const next = () => `${suffix}-${(seq += 1)}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      controllers: [ClientAccountingController],
      providers: [
        ClientSettlementReadService,
        ClientAccountingSummaryReadService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClientAccountingMovementsReadService, useValue: {} },
        { provide: AccountingJournalCutoverReadinessService, useValue: { getCutoverReadiness: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    t1 = await createTenantWithUser(prisma, suffix, 'g1a');
    t2 = await createTenantWithUser(prisma, suffix, 'g1b');
  });

  afterAll(async () => {
    await app?.close();
    for (const t of [t1, t2]) if (t) await cleanupTenant(prisma, t.tenantId);
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const summaryOf = async (clientId: string, currency?: string, user: TenantFixture = t1) => {
    const res = await http()
      .get(`/clients/${clientId}/accounting/summary${currency ? `?currency=${currency}` : ''}`)
      .set('x-test-user-id', user.userId);
    expect(res.status).toBe(200);
    return res.body.data as Record<string, any>;
  };

  async function newClient(label: string, tenant: TenantFixture = t1) {
    return createClient(prisma, tenant.tenantId, `${label}-${next()}`);
  }

  async function addCase(
    clientId: string,
    label: string,
    currency: 'TRY' | 'USD',
    tenant: TenantFixture = t1,
  ): Promise<{ caseId: string; caseClientId: string }> {
    const caseId = await createCase(prisma, {
      tenantId: tenant.tenantId,
      clientId,
      userId: tenant.userId,
      fileNumber: `CI-G1-${label}-${next()}`,
      currency,
    });
    return { caseId, caseClientId: await linkClient(prisma, caseId, clientId, tenant.userId) };
  }

  /** Dosyaya müvekkil alacağı (POSTED CLIENT_PAYABLE) + ödeme, dosyanın kendi para biriminde. */
  async function seedFileMoney(
    f: { caseId: string; caseClientId: string },
    currency: string,
    payable: number,
    paid: number,
    tenant: TenantFixture = t1,
  ) {
    await addPostedPayable(prisma, {
      tenantId: tenant.tenantId,
      caseId: f.caseId,
      caseClientId: f.caseClientId,
      userId: tenant.userId,
      amount: payable,
      currency,
      postedAt: POSTED_AT,
      key: next(),
    });
    await addPayout(prisma, {
      tenantId: tenant.tenantId,
      caseId: f.caseId,
      caseClientId: f.caseClientId,
      userId: tenant.userId,
      amount: paid,
      currency,
      paidAt: PAID_AT,
      key: next(),
    });
  }

  const row = (summary: Record<string, any>, caseId: string) =>
    (summary.caseBreakdown as any[]).find((r) => r.caseId === caseId);

  describe('yalnız TL kayıtlar', () => {
    it('kapsam dışı kayıt YOK: durum temiz, dosya TAM; gerçek sıfır gerçek sıfır olarak kalır', async () => {
      const clientId = await newClient('tl-only');
      const money = await addCase(clientId, 'tl-para', 'TRY');
      const empty = await addCase(clientId, 'tl-bos', 'TRY');
      await seedFileMoney(money, 'TRY', 700, 200);

      const s = await summaryOf(clientId);

      expect(s.paraBirimiDurumu).toEqual({
        istenenParaBirimi: 'TRY',
        kapsamDisiKayitVar: false,
        kapsamDisiParaBirimleri: [],
        kapsamDisiDosyaSayisi: 0,
        kismiKapsamDosyaSayisi: 0,
        belirsizParaBirimiKayitSayisi: 0,
        yalnizIstenenParaBirimi: true,
        mesaj: null,
      });
      expect(row(s, money.caseId).paraBirimiKapsami).toMatchObject({ kapsam: 'TAM', dosyaParaBirimi: 'TRY', mesaj: null });
      expect(row(s, empty.caseId).paraBirimiKapsami.kapsam).toBe('TAM');
      expect(row(s, empty.caseId).payableNet).toBe('0'); // gerçek sıfır
      expect(s.clientScoped.payableNet).toBe('500');
      expect(s.clientScoped.paidToClient).toBe('200');
      expect(s.caseScopedContext.debtorCollection).toBe('700');
    });
  });

  describe('USD dosya TL görünümünde (kapsam dışı ≠ sıfır)', () => {
    it('USD dosya DISI olarak bildirilir; TL toplamına USD eklenmez; TL dosya TAM kalır', async () => {
      const clientId = await newClient('karma');
      const tl = await addCase(clientId, 'tl', 'TRY');
      const usd = await addCase(clientId, 'usd', 'USD');
      await seedFileMoney(tl, 'TRY', 1500, 300);
      await seedFileMoney(usd, 'USD', 700, 200);

      const s = await summaryOf(clientId, 'TRY');

      // kapsam beyanı (sunucu): doğru müvekkil + büro kapsamından
      expect(s.paraBirimiDurumu).toMatchObject({
        istenenParaBirimi: 'TRY',
        kapsamDisiKayitVar: true,
        kapsamDisiParaBirimleri: ['USD'],
        kapsamDisiDosyaSayisi: 1,
        yalnizIstenenParaBirimi: true,
      });
      expect(s.paraBirimiDurumu.mesaj).toContain('yalnız TRY kayıtlarını kapsar');
      expect(s.paraBirimiDurumu.mesaj).toContain('USD');
      expect(s.paraBirimiDurumu.mesaj).toContain('çevrilmedi ve birleştirilmedi');
      expect(row(s, usd.caseId).paraBirimiKapsami).toMatchObject({
        kapsam: 'DISI',
        dosyaParaBirimi: 'USD',
        kapsamDisiParaBirimleri: ['USD'],
      });
      expect(row(s, usd.caseId).paraBirimiKapsami.mesaj).toContain('sıfır anlamına gelmez');
      expect(row(s, tl.caseId).paraBirimiKapsami.kapsam).toBe('TAM');

      // TL toplamına döviz eklenmedi, çevrilmedi
      expect(s.clientScoped.payableNet).toBe('1200'); // yalnız TL dosya: 1500 − 300 (700 USD DEĞİL)
      expect(s.clientScoped.paidToClient).toBe('300');
      expect(s.caseScopedContext.debtorCollection).toBe('1500');
      expect(s.clientScoped.offsettableNetPosition).toBe('1200');
    });

    it('USD dosya, hiç kaydı olmasa bile DISI (dosya para birimi TL değil) — sıfır borçlu gibi gösterilemez', async () => {
      const clientId = await newClient('usd-bos');
      const usd = await addCase(clientId, 'usd-bos', 'USD');

      const s = await summaryOf(clientId, 'TRY');

      expect(row(s, usd.caseId).paraBirimiKapsami.kapsam).toBe('DISI');
      expect(row(s, usd.caseId).payableNet).toBe('0'); // ham sunucu değeri sıfır; kapsam beyanı sıfırın GERÇEK olmadığını söyler
      expect(s.paraBirimiDurumu.kapsamDisiKayitVar).toBe(true);
    });

    it('istenen para birimi USD ise ölçüt tersine döner: USD dosya TAM (ödeme + alacak USD olarak), TL dosya DISI; TL masraf / avans USD toplamına girmez', async () => {
      const clientId = await newClient('usd-gorunum');
      const tl = await addCase(clientId, 'tl', 'TRY');
      const usd = await addCase(clientId, 'usd', 'USD');
      await seedFileMoney(tl, 'TRY', 1500, 300);
      await seedFileMoney(usd, 'USD', 700, 200);
      // TL masraf talebi + TL avans, USD dosyasında (bugünkü gerçek durum: masraf talepleri TL yazılır)
      await addExpenseRequest(prisma, {
        tenantId: t1.tenantId,
        caseId: usd.caseId,
        clientId,
        userId: t1.userId,
        amount: 250,
        currency: 'TRY',
        createdAt: POSTED_AT,
      });
      await addLedgerRow(prisma, { tenantId: t1.tenantId, caseId: usd.caseId, amount: 380, currency: 'TRY', createdAt: POSTED_AT });

      const s = await summaryOf(clientId, 'USD');

      expect(row(s, usd.caseId).paraBirimiKapsami.kapsam).toBe('KISMI'); // dosya USD ama TL masraf / avans kayıtları var
      expect(row(s, usd.caseId).paraBirimiKapsami.kapsamDisiParaBirimleri).toEqual(['TRY']);
      expect(row(s, tl.caseId).paraBirimiKapsami.kapsam).toBe('DISI');
      expect(s.clientScoped.payableNet).toBe('500'); // 700 − 200 USD
      expect(s.clientScoped.paidToClient).toBe('200');
      // TL masraf ve TL avans USD toplamına KARIŞMAZ (önceden 250 / 380 USD etiketiyle toplanıyordu)
      expect(s.clientScoped.expenseRequested).toBe('0');
      expect(s.caseScopedContext.advanceBalance).toBe('0');
      expect(s.clientScoped.offsettableNetPosition).toBe('500');
    });
  });

  describe('TL dosyada başka para biriminde kayıt (KISMI)', () => {
    it('USD ödeme + USD defter satırı + EUR masraf talebi: KISMI; TL değerler yalnız TL kayıtlar', async () => {
      const clientId = await newClient('kismi');
      const f = await addCase(clientId, 'kismi', 'TRY');
      await seedFileMoney(f, 'TRY', 400, 100);
      await addPayout(prisma, {
        tenantId: t1.tenantId,
        caseId: f.caseId,
        caseClientId: f.caseClientId,
        userId: t1.userId,
        amount: 50,
        currency: 'USD',
        paidAt: PAID_AT,
        key: next(),
      });
      await addLedgerRow(prisma, { tenantId: t1.tenantId, caseId: f.caseId, amount: 30, currency: 'USD', createdAt: POSTED_AT });
      await addExpenseRequest(prisma, {
        tenantId: t1.tenantId,
        caseId: f.caseId,
        clientId,
        userId: t1.userId,
        amount: 90,
        currency: 'EUR',
        createdAt: POSTED_AT,
      });

      const s = await summaryOf(clientId, 'TRY');

      expect(row(s, f.caseId).paraBirimiKapsami).toMatchObject({ kapsam: 'KISMI', kapsamDisiParaBirimleri: ['EUR', 'USD'] });
      expect(s.paraBirimiDurumu).toMatchObject({ kapsamDisiParaBirimleri: ['EUR', 'USD'], kismiKapsamDosyaSayisi: 1, kapsamDisiDosyaSayisi: 0 });
      expect(s.clientScoped.paidToClient).toBe('100'); // 50 USD eklenmedi
      expect(s.clientScoped.expenseRequested).toBe('0'); // 90 EUR eklenmedi
      expect(s.caseScopedContext.advanceBalance).toBe('0');
    });

    it('para birimi BOŞ kayıt: TL / sıfır sayılmaz; belirsiz kayıt olarak bildirilir', async () => {
      const clientId = await newClient('belirsiz');
      const f = await addCase(clientId, 'belirsiz', 'TRY');
      await addLedgerRow(prisma, { tenantId: t1.tenantId, caseId: f.caseId, amount: 12, currency: '', createdAt: POSTED_AT });

      const s = await summaryOf(clientId, 'TRY');

      expect(row(s, f.caseId).paraBirimiKapsami).toMatchObject({ kapsam: 'KISMI', belirsizParaBirimiKayitSayisi: 1, kapsamDisiParaBirimleri: [] });
      expect(s.paraBirimiDurumu).toMatchObject({ kapsamDisiKayitVar: true, belirsizParaBirimiKayitSayisi: 1 });
      expect(s.paraBirimiDurumu.mesaj).toContain('para birimi belirlenemeyen 1 kaydı');
      expect(s.caseScopedContext.advanceBalance).toBe('0'); // belirsiz satır TL bakiyeye eklenmedi
    });
  });

  describe('#2878 korunur: dosya listesi dosyanın para birimini döndürür', () => {
    it('GET /clients/:id/accounting/cases USD dosyada "USD", TL dosyada "TRY"', async () => {
      const clientId = await newClient('cases');
      const tl = await addCase(clientId, 'tl', 'TRY');
      const usd = await addCase(clientId, 'usd', 'USD');

      const res = await http().get(`/clients/${clientId}/accounting/cases`).set('x-test-user-id', t1.userId);

      expect(res.status).toBe(200);
      const items: { caseId: string; currency: string }[] = res.body.data.items;
      expect(items.find((i) => i.caseId === usd.caseId)!.currency).toBe('USD');
      expect(items.find((i) => i.caseId === tl.caseId)!.currency).toBe('TRY');
    });
  });

  describe('büro / müvekkil izolasyonu', () => {
    it('başka müvekkilin USD dosyası bu müvekkilin kapsam beyanında GÖRÜNMEZ', async () => {
      const a = await newClient('izo-a');
      const fa = await addCase(a, 'izo-a', 'TRY');
      await seedFileMoney(fa, 'TRY', 100, 0);
      const b = await newClient('izo-b');
      const fb = await addCase(b, 'izo-b', 'USD');
      await seedFileMoney(fb, 'USD', 900, 0);

      const s = await summaryOf(a, 'TRY');

      expect(s.paraBirimiDurumu.kapsamDisiKayitVar).toBe(false);
      expect(s.caseBreakdown).toHaveLength(1);
      expect(s.caseBreakdown[0].caseId).toBe(fa.caseId);
    });

    it('aynı dosyadaki ortak alacaklının USD ödemesi bu müvekkilin kapsam beyanına GİRMEZ (alacaklı bağı kapsamı)', async () => {
      const a = await newClient('ortak-a');
      const f = await addCase(a, 'ortak', 'TRY');
      const b = await newClient('ortak-b');
      const ccB = await linkClient(prisma, f.caseId, b, t1.userId, 'ORTAK_ALACAKLI');
      await addPayout(prisma, {
        tenantId: t1.tenantId,
        caseId: f.caseId,
        caseClientId: ccB,
        userId: t1.userId,
        amount: 40,
        currency: 'USD',
        paidAt: PAID_AT,
        key: next(),
      });

      const s = await summaryOf(a, 'TRY');

      expect(s.paraBirimiDurumu.kapsamDisiKayitVar).toBe(false);
      expect(row(s, f.caseId).paraBirimiKapsami.kapsam).toBe('TAM');
    });

    it('başka büro: kapsam beyanı ve dosya listesi sızmaz (başka büronun kullanıcısı boş görür)', async () => {
      const a = await newClient('buro-a');
      const f = await addCase(a, 'buro', 'USD');
      await seedFileMoney(f, 'USD', 500, 0);

      const foreign = await summaryOf(a, 'TRY', t2);

      expect(foreign.caseBreakdown).toEqual([]);
      expect(foreign.paraBirimiDurumu).toMatchObject({ kapsamDisiKayitVar: false, kapsamDisiParaBirimleri: [], kapsamDisiDosyaSayisi: 0 });
      const own = await summaryOf(a, 'TRY', t1);
      expect(own.paraBirimiDurumu.kapsamDisiParaBirimleri).toEqual(['USD']); // kontrol: kendi bürosu görüyor
    });
  });
});
