import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
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
  statementDocumentCounts,
  type TenantFixture,
} from '../../../../test/client-currency-fixture';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CaseBalanceService } from '@/modules/interest-engine/orchestration/case-balance.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ClientStatementController } from '../client-statement.controller';
import { ClientStatementService } from '../client-statement.service';
import { ClientStatementMonthlyDeliveryService } from '../client-statement-monthly-delivery.service';
import { ClientStatementPdfService } from '../client-statement-pdf.service';
import { resolvePreviousMonthPeriod } from '../client-statement-monthly-period';

/**
 * E1 — müvekkil ekstresi KAYNAK PARA BİRİMİ sınırı: GERÇEK HTTP + disposable PostgreSQL kabulü.
 *
 * Ölçülen kusur (main 81ab9466): ekstre üreticileri kaynak satırların para birimine bakmadan topluyor ve belgeyi sabit TL
 * damgalıyordu (380 TL avans + 700 USD alacak + 300 USD mahsup → "Kapanış ₺1.380,00"; genel ekstre 700 USD + 1.500 TL →
 * "₺2.200,00"). Ekstre değişmez belge olduğundan yanlış toplam sonradan düzeltilemez.
 *
 * Kural: ekstreye girecek kaynaklardan biri TL dışı / belirlenemeyen para birimindeyse üretim açık kodla reddedilir
 * (HTTP 400 CLIENT_STATEMENT_UNSUPPORTED_CURRENCY) ve hiçbir kalıcı belge (ekstre, satır, denetim günlüğü, bildirim)
 * yazılmaz. Denetlenen şey Case.currency / web düğmesi değil, ekstreye girecek satırların KENDİ para birimidir.
 * Geçerli TL ekstre davranışı değişmez. Geçmiş ekstreler yeniden yazılmaz / silinmez.
 *
 * KAPSAM DIŞI (owner kararı): döviz ekstresi, para birimi başına ayrı ekstre, kur ve çevirme.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CLIENT-STATEMENT-CURRENCY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

const PERIOD = { periodStart: '2026-06-01T00:00:00.000Z', periodEnd: '2026-06-30T23:59:59.000Z' };
const BEFORE_PERIOD = new Date('2026-05-10T10:00:00.000Z');
const IN_PERIOD = new Date('2026-06-10T10:00:00.000Z');
const IN_PERIOD_LATE = new Date('2026-06-20T10:00:00.000Z');

describeWithDisposableDb('Ekstre kaynak para birimi sınırı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(240_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let t1: TenantFixture; // asıl büro
  let t2: TenantFixture; // başka büro (izolasyon)
  const suffix = randomUUID().slice(0, 8);
  let seq = 0;
  const dispatcher = { dispatch: jest.fn().mockResolvedValue({ status: 'sent' }) };
  const savedMonthlyEnv = process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      controllers: [ClientStatementController],
      providers: [
        ClientStatementService,
        ClientStatementMonthlyDeliveryService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationDispatcherService, useValue: dispatcher },
        { provide: OfficeService, useValue: { getOfficeIdentity: jest.fn().mockResolvedValue({ name: 'CI Büro' }) } },
        { provide: AuditService, useValue: new AuditService(prisma as any) },
        { provide: CaseBalanceService, useValue: { computeCaseBalance: jest.fn().mockResolvedValue({ currencyResults: [] }) } },
        { provide: OfficeApprovalService, useValue: { isApproverEligible: jest.fn().mockResolvedValue(true) } },
        { provide: ClientStatementPdfService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    t1 = await createTenantWithUser(prisma, suffix, 'a');
    t2 = await createTenantWithUser(prisma, suffix, 'b');
  });

  afterAll(async () => {
    if (savedMonthlyEnv === undefined) delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    else process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = savedMonthlyEnv;
    await app?.close();
    for (const t of [t1, t2]) if (t) await cleanupTenant(prisma, t.tenantId);
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object, user: TenantFixture = t1) =>
    http().post(path).set('x-test-user-id', user.userId).send(body);

  const next = () => `${suffix}-${(seq += 1)}`;

  /** TL dosya + müvekkil + alacaklı bağı. */
  async function setup(
    label: string,
    caseCurrency: 'TRY' | 'USD' = 'TRY',
    tenant: TenantFixture = t1,
  ): Promise<{ tenant: TenantFixture; clientId: string; caseId: string; caseClientId: string }> {
    const clientId = await createClient(prisma, tenant.tenantId, `${label}-${next()}`);
    const caseId = await createCase(prisma, {
      tenantId: tenant.tenantId,
      clientId,
      userId: tenant.userId,
      fileNumber: `CI-CCY-${label}-${next()}`,
      currency: caseCurrency,
    });
    const caseClientId = await linkClient(prisma, caseId, clientId, tenant.userId);
    return { tenant, clientId, caseId, caseClientId };
  }

  /** Geçerli TL kaynaklar: açılış devri (100) + dönem içi +500 / −120 avans + 700 müvekkil alacağı − 200 ödeme. */
  async function seedTryRows(f: Awaited<ReturnType<typeof setup>>) {
    const base = { tenantId: f.tenant.tenantId, caseId: f.caseId };
    await addLedgerRow(prisma, { ...base, amount: 100, currency: 'TRY', createdAt: BEFORE_PERIOD });
    await addLedgerRow(prisma, { ...base, amount: 500, currency: 'TRY', createdAt: IN_PERIOD });
    await addLedgerRow(prisma, { ...base, amount: -120, currency: 'TRY', createdAt: IN_PERIOD_LATE });
    await addPostedPayable(prisma, {
      ...base,
      caseClientId: f.caseClientId,
      userId: f.tenant.userId,
      amount: 700,
      currency: 'TRY',
      postedAt: IN_PERIOD,
      key: next(),
    });
    await addPayout(prisma, {
      ...base,
      caseClientId: f.caseClientId,
      userId: f.tenant.userId,
      amount: 200,
      currency: 'TRY',
      paidAt: IN_PERIOD_LATE,
      key: next(),
    });
  }

  const caseStatement = (f: { caseId: string; clientId: string }, extra: object = {}, user?: TenantFixture) =>
    post(`/client-statements/case/${f.caseId}`, { clientId: f.clientId, ...PERIOD, ...extra }, user);
  const clientStatement = (clientId: string, user?: TenantFixture) =>
    post(`/client-statements/client/${clientId}`, PERIOD, user);

  /** Ret: HTTP 400 + açık kod; ardından büroda hiçbir ekstre belgesi yazılmamış olmalı. */
  async function expectRejectedWithoutDocuments(
    run: () => request.Test,
    tenant: TenantFixture,
    expected: { reasonCode: string; currencies?: string[]; sources?: string[]; messageIncludes?: string[] },
  ) {
    const before = await statementDocumentCounts(prisma, tenant.tenantId);
    const res = await run();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
    expect(res.body.reasonCode).toBe(expected.reasonCode);
    if (expected.currencies) expect(res.body.currencies).toEqual(expected.currencies);
    if (expected.sources) expect(res.body.sources).toEqual(expect.arrayContaining(expected.sources));
    for (const part of expected.messageIncludes ?? []) expect(res.body.message).toContain(part);
    expect(await statementDocumentCounts(prisma, tenant.tenantId)).toEqual(before);
  }

  describe('geçerli TL ekstre davranışı korunur', () => {
    it('dosya ekstresi: 201; başlık TRY; devir 100, kapanış 980; 4 satır; denetim günlüğü yazılır', async () => {
      const f = await setup('tl-dosya');
      await seedTryRows(f);

      const res = await caseStatement(f);

      expect(res.status).toBe(201);
      expect(res.body.currency).toBe('TRY');
      expect(res.body.status).toBe('ACTIVE');
      expect(Number(res.body.openingBalance)).toBe(100);
      expect(Number(res.body.closingBalance)).toBe(980); // 100 + 500 − 120 + 700 − 200
      expect(res.body.lines).toHaveLength(4); // 2 dönem içi defter satırı + müvekkil alacağı + ödeme (devir satır değildir)
      expect(await prisma.auditLog.count({ where: { tenantId: t1.tenantId, entityType: 'ClientStatement', entityId: res.body.id } })).toBe(1);
    });

    it('genel ekstre: 201; başlık TRY; kapanış = müvekkil alacağı − ödeme (500)', async () => {
      const f = await setup('tl-genel');
      await seedTryRows(f);

      const res = await clientStatement(f.clientId);

      expect(res.status).toBe(201);
      expect(res.body.currency).toBe('TRY');
      expect(res.body.caseId).toBeNull();
      expect(Number(res.body.closingBalance)).toBe(500); // 700 − 200 (masraf yok)
    });
  });

  describe('döviz / karma kaynak: açıklamalı ret + sıfır belge yazımı', () => {
    it('TL dosyada USD müvekkile ödeme → reddedilir (kontrol dosya para birimine değil kaynak satıra bağlı)', async () => {
      const f = await setup('tl-usd-odeme', 'TRY');
      await seedTryRows(f);
      await addPayout(prisma, {
        tenantId: f.tenant.tenantId,
        caseId: f.caseId,
        caseClientId: f.caseClientId,
        userId: f.tenant.userId,
        amount: 50,
        currency: 'USD',
        paidAt: IN_PERIOD_LATE,
        key: next(),
      });

      await expectRejectedWithoutDocuments(() => caseStatement(f), t1, {
        reasonCode: 'NON_TRY_SOURCE',
        currencies: ['USD'],
        sources: ['ClientPayout'],
        messageIncludes: ['USD', 'müvekkile ödeme', 'hiçbir ekstre kaydı oluşturulmadı'],
      });
    });

    it('USD dosya: USD müvekkil alacağı + USD ödeme + TL avans (karma) → reddedilir', async () => {
      const f = await setup('usd-karma', 'USD');
      const base = { tenantId: f.tenant.tenantId, caseId: f.caseId };
      await addLedgerRow(prisma, { ...base, amount: 500, currency: 'TRY', createdAt: IN_PERIOD });
      await addPostedPayable(prisma, {
        ...base,
        caseClientId: f.caseClientId,
        userId: f.tenant.userId,
        amount: 700,
        currency: 'USD',
        postedAt: IN_PERIOD,
        key: next(),
      });
      await addPayout(prisma, {
        ...base,
        caseClientId: f.caseClientId,
        userId: f.tenant.userId,
        amount: 200,
        currency: 'USD',
        paidAt: IN_PERIOD_LATE,
        key: next(),
      });

      await expectRejectedWithoutDocuments(() => caseStatement(f), t1, {
        reasonCode: 'NON_TRY_SOURCE',
        currencies: ['USD'],
        sources: ['CollectionDisposition', 'ClientPayout'],
      });
    });

    it('USD kaynak yalnız AÇILIŞ DEVRİNDE (dönem öncesi defter satırı) → yine reddedilir; devir yoksa ekstre üretilir', async () => {
      const f = await setup('devir');
      const base = { tenantId: f.tenant.tenantId, caseId: f.caseId };
      await addLedgerRow(prisma, { ...base, amount: 300, currency: 'USD', createdAt: BEFORE_PERIOD });
      await addLedgerRow(prisma, { ...base, amount: 40, currency: 'TRY', createdAt: IN_PERIOD });

      await expectRejectedWithoutDocuments(() => caseStatement(f), t1, {
        reasonCode: 'NON_TRY_SOURCE',
        currencies: ['USD'],
        sources: ['BalanceLedger'],
      });

      // kontrol: aynı dosyada USD satırı kaldırılınca ekstre üretilir (denetim yalnız gerçek kaynağa bakıyor)
      await prisma.balanceLedger.deleteMany({ where: { tenantId: f.tenant.tenantId, currency: 'USD', caseBalance: { caseId: f.caseId } } });
      const ok = await caseStatement(f);
      expect(ok.status).toBe(201);
      expect(Number(ok.body.closingBalance)).toBe(40);
    });

    it('para birimi BOŞ kayıt → reddedilir (TL ya da sıfır varsayılmaz); neden "belirlenemedi"', async () => {
      const f = await setup('belirsiz');
      await addLedgerRow(prisma, { tenantId: f.tenant.tenantId, caseId: f.caseId, amount: 90, currency: '', createdAt: IN_PERIOD });

      await expectRejectedWithoutDocuments(() => caseStatement(f), t1, {
        reasonCode: 'CURRENCY_UNDETERMINED',
        currencies: [],
        messageIncludes: ['para birimi belirlenemeyen kayıt var'],
      });
    });

    it('dosya USD olsa da ekstreye girecek tüm satırlar TL ise ekstre üretilir (Case.currency denetime girmez)', async () => {
      const f = await setup('usd-dosya-tl-satir', 'USD');
      await addLedgerRow(prisma, { tenantId: f.tenant.tenantId, caseId: f.caseId, amount: 250, currency: 'TRY', createdAt: IN_PERIOD });

      const res = await caseStatement(f);

      expect(res.status).toBe(201);
      expect(res.body.currency).toBe('TRY');
      expect(Number(res.body.closingBalance)).toBe(250);
    });

    it('masraf talebi USD → reddedilir; includeRequests=false ile talep ekstreye girmediği için üretilir', async () => {
      const f = await setup('masraf-talebi');
      await addLedgerRow(prisma, { tenantId: f.tenant.tenantId, caseId: f.caseId, amount: 60, currency: 'TRY', createdAt: IN_PERIOD });
      await addExpenseRequest(prisma, {
        tenantId: f.tenant.tenantId,
        caseId: f.caseId,
        clientId: f.clientId,
        userId: f.tenant.userId,
        amount: 80,
        currency: 'USD',
        createdAt: IN_PERIOD,
      });

      await expectRejectedWithoutDocuments(() => caseStatement(f), t1, {
        reasonCode: 'NON_TRY_SOURCE',
        sources: ['ExpenseRequest'],
      });

      const ok = await caseStatement(f, { includeRequests: false });
      expect(ok.status).toBe(201);
      expect(Number(ok.body.closingBalance)).toBe(60);
    });

    it('USD mahsup (ClientOffset) dönem içinde → reddedilir; dönem dışındaki USD mahsup ekstreye girmez (üretilir)', async () => {
      const f = await setup('mahsup');
      await addLedgerRow(prisma, { tenantId: f.tenant.tenantId, caseId: f.caseId, amount: 35, currency: 'TRY', createdAt: IN_PERIOD });
      const er = await addExpenseRequest(prisma, {
        tenantId: f.tenant.tenantId,
        caseId: f.caseId,
        clientId: f.clientId,
        userId: f.tenant.userId,
        amount: 20,
        currency: 'TRY',
        createdAt: BEFORE_PERIOD,
      });
      const offset = (createdAt: Date) =>
        prisma.clientOffset.create({
          data: {
            tenantId: f.tenant.tenantId,
            clientId: f.clientId,
            amount: new Prisma.Decimal(10),
            currency: 'USD',
            kind: 'APPLY',
            payableCaseId: f.caseId,
            payableCaseClientId: f.caseClientId,
            expenseCaseId: f.caseId,
            expenseRequestId: er,
            idempotencyKey: `test:ccy:offset:${next()}`,
            createdById: f.tenant.userId,
            createdAt,
          },
        });
      await offset(IN_PERIOD);

      await expectRejectedWithoutDocuments(() => caseStatement(f), t1, {
        reasonCode: 'NON_TRY_SOURCE',
        currencies: ['USD'],
        sources: ['ClientOffset'],
      });

      // kontrol: yalnız dönem DIŞI USD mahsup kalınca ekstre üretilir (dönem aralığı gerçekten denetleniyor)
      await prisma.clientOffset.deleteMany({ where: { tenantId: f.tenant.tenantId, clientId: f.clientId } });
      await offset(new Date('2026-08-15T10:00:00.000Z'));
      const ok = await caseStatement(f, { includeRequests: false });
      expect(ok.status).toBe(201);
      expect(Number(ok.body.closingBalance)).toBe(35);
    });

    it('genel ekstre: TL dosya + USD dosya (karma müvekkil) → reddedilir; yalnız TL dosyası olan müvekkil için üretilir', async () => {
      const karma = await setup('genel-karma');
      await seedTryRows(karma);
      const usdCase = await createCase(prisma, {
        tenantId: karma.tenant.tenantId,
        clientId: karma.clientId,
        userId: karma.tenant.userId,
        fileNumber: `CI-CCY-genel-usd-${next()}`,
        currency: 'USD',
      });
      const usdCaseClient = await linkClient(prisma, usdCase, karma.clientId, karma.tenant.userId);
      await addPostedPayable(prisma, {
        tenantId: karma.tenant.tenantId,
        caseId: usdCase,
        caseClientId: usdCaseClient,
        userId: karma.tenant.userId,
        amount: 700,
        currency: 'USD',
        postedAt: IN_PERIOD,
        key: next(),
      });

      await expectRejectedWithoutDocuments(() => clientStatement(karma.clientId), t1, {
        reasonCode: 'NON_TRY_SOURCE',
        currencies: ['USD'],
        sources: ['CollectionDisposition'],
      });

      const tlOnly = await setup('genel-tl');
      await seedTryRows(tlOnly);
      const ok = await clientStatement(tlOnly.clientId);
      expect(ok.status).toBe(201);
      expect(Number(ok.body.closingBalance)).toBe(500);
    });

    it('genel ekstre: USD masraf tahsilatı / USD mahsup da kaynak sayılır', async () => {
      const f = await setup('genel-masraf');
      const er = await addExpenseRequest(prisma, {
        tenantId: f.tenant.tenantId,
        caseId: f.caseId,
        clientId: f.clientId,
        userId: f.tenant.userId,
        amount: 90,
        currency: 'USD',
        createdAt: BEFORE_PERIOD,
      });
      await prisma.expensePayment.create({
        data: { expenseRequestId: er, amount: 30, paymentDate: IN_PERIOD, method: 'BANK_TRANSFER' },
      });

      await expectRejectedWithoutDocuments(() => clientStatement(f.clientId), t1, {
        reasonCode: 'NON_TRY_SOURCE',
        sources: ['ExpensePayment'],
      });
    });
  });

  describe('yenileme (supersede): ret eski ekstreyi değiştirmez', () => {
    it('dosya ekstresi: TL ekstre üretildi → sonradan USD ödeme → yenileme reddedilir; eski ekstre ACTIVE ve içeriği aynı', async () => {
      const f = await setup('yenile-dosya');
      await seedTryRows(f);
      const created = await caseStatement(f);
      expect(created.status).toBe(201);
      const stored = await prisma.clientStatement.findUniqueOrThrow({ where: { id: created.body.id }, include: { lines: true } });

      await addPayout(prisma, {
        tenantId: f.tenant.tenantId,
        caseId: f.caseId,
        caseClientId: f.caseClientId,
        userId: f.tenant.userId,
        amount: 10,
        currency: 'USD',
        paidAt: IN_PERIOD_LATE,
        key: next(),
      });

      await expectRejectedWithoutDocuments(
        () => post(`/client-statements/${created.body.id}/supersede`, PERIOD),
        t1,
        { reasonCode: 'NON_TRY_SOURCE', currencies: ['USD'] },
      );

      const after = await prisma.clientStatement.findUniqueOrThrow({ where: { id: created.body.id }, include: { lines: true } });
      expect(after.status).toBe('ACTIVE');
      expect(after.supersededById).toBeNull();
      expect(after.closingBalance.toString()).toBe(stored.closingBalance.toString());
      expect(after.lines.map((l) => l.id).sort()).toEqual(stored.lines.map((l) => l.id).sort());
    });

    it('genel ekstre: yenileme de aynı kuralla reddedilir; eski genel ekstre ACTIVE kalır', async () => {
      const f = await setup('yenile-genel');
      await seedTryRows(f);
      const created = await clientStatement(f.clientId);
      expect(created.status).toBe(201);
      await addExpenseRequest(prisma, {
        tenantId: f.tenant.tenantId,
        caseId: f.caseId,
        clientId: f.clientId,
        userId: f.tenant.userId,
        amount: 15,
        currency: 'USD',
        createdAt: IN_PERIOD,
      });

      await expectRejectedWithoutDocuments(
        () => post(`/client-statements/${created.body.id}/supersede`, PERIOD),
        t1,
        { reasonCode: 'NON_TRY_SOURCE', sources: ['ExpenseRequest'] },
      );

      const after = await prisma.clientStatement.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(after.status).toBe('ACTIVE');
    });
  });

  describe('büro / müvekkil izolasyonu', () => {
    it('başka bürodaki USD kayıt bu büronun ekstresini etkilemez; başka bürodan bu dosyaya erişim 404 (denetim sızdırmaz)', async () => {
      const f = await setup('izolasyon-a');
      await seedTryRows(f);
      const other = await setup('izolasyon-b', 'USD', t2);
      await addPayout(prisma, {
        tenantId: t2.tenantId,
        caseId: other.caseId,
        caseClientId: other.caseClientId,
        userId: t2.userId,
        amount: 77,
        currency: 'USD',
        paidAt: IN_PERIOD,
        key: next(),
      });

      const ok = await caseStatement(f);
      expect(ok.status).toBe(201);

      const before = await statementDocumentCounts(prisma, t2.tenantId);
      const foreign = await caseStatement(f, {}, t2);
      expect(foreign.status).toBe(404);
      expect(foreign.body.code).toBeUndefined();
      expect(await statementDocumentCounts(prisma, t2.tenantId)).toEqual(before);
    });

    it('aynı dosyadaki ortak alacaklının USD ödemesi diğer alacaklının dosya ekstresini ENGELLEMEZ (alacaklı bağı kapsamı)', async () => {
      const a = await setup('ortak-a');
      await seedTryRows(a);
      const clientB = await createClient(prisma, t1.tenantId, `ortak-b-${next()}`);
      const ccB = await linkClient(prisma, a.caseId, clientB, t1.userId, 'ORTAK_ALACAKLI');
      await addPayout(prisma, {
        tenantId: t1.tenantId,
        caseId: a.caseId,
        caseClientId: ccB,
        userId: t1.userId,
        amount: 55,
        currency: 'USD',
        paidAt: IN_PERIOD_LATE,
        key: next(),
      });

      const res = await caseStatement(a);

      expect(res.status).toBe(201);
      expect(Number(res.body.closingBalance)).toBe(980); // B'nin USD ödemesi A'nın ekstresine girmedi
    });

    it('başka müvekkilin USD kaydı bu müvekkilin GENEL ekstresini engellemez', async () => {
      const a = await setup('genel-izo-a');
      await seedTryRows(a);
      const b = await setup('genel-izo-b', 'USD');
      await addPayout(prisma, {
        tenantId: t1.tenantId,
        caseId: b.caseId,
        caseClientId: b.caseClientId,
        userId: t1.userId,
        amount: 66,
        currency: 'USD',
        paidAt: IN_PERIOD,
        key: next(),
      });

      const res = await clientStatement(a.clientId);

      expect(res.status).toBe(201);
      expect(Number(res.body.closingBalance)).toBe(500);
    });
  });

  describe('aylık koşu (manuel tetik): desteklenmeyen para birimi "başarısız" değil, nedeniyle atlanır', () => {
    it('USD kaynaklı müvekkil SKIPPED_UNSUPPORTED_CURRENCY, TL müvekkil ekstresi üretilir; USD müvekkil için belge yazılmaz', async () => {
      process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'true';
      const period = resolvePreviousMonthPeriod(new Date());
      const inPrevMonth = new Date(period.periodStart.getTime() + 5 * 24 * 3600 * 1000);

      const tl = await setup('aylik-tl');
      const usd = await setup('aylik-usd');
      for (const f of [tl, usd]) {
        await prisma.client.update({ where: { id: f.clientId }, data: { email: `aylik-${next()}@example.test` } });
        await addLedgerRow(prisma, { tenantId: f.tenant.tenantId, caseId: f.caseId, amount: 25, currency: 'TRY', createdAt: inPrevMonth });
      }
      await addPayout(prisma, {
        tenantId: usd.tenant.tenantId,
        caseId: usd.caseId,
        caseClientId: usd.caseClientId,
        userId: usd.tenant.userId,
        amount: 5,
        currency: 'USD',
        paidAt: inPrevMonth,
        key: next(),
      });

      const res = await http().post('/client-statements/monthly-delivery/run-now').set('x-test-user-id', t1.userId).send({});

      expect(res.status).toBe(201);
      const targets: { clientId: string; outcome: string; statementSource: string; reason?: string }[] = res.body.result.targets;
      const usdTarget = targets.find((x) => x.clientId === usd.clientId)!;
      const tlTarget = targets.find((x) => x.clientId === tl.clientId)!;
      expect(usdTarget).toMatchObject({ outcome: 'SKIPPED_UNSUPPORTED_CURRENCY', statementSource: 'NONE', reason: 'NON_TRY_SOURCE' });
      expect(tlTarget.statementSource).toBe('GENERATED');
      expect(tlTarget.outcome).not.toBe('FAILED');
      expect(await prisma.clientStatement.count({ where: { tenantId: t1.tenantId, clientId: usd.clientId } })).toBe(0);
      expect(await prisma.clientStatement.count({ where: { tenantId: t1.tenantId, clientId: tl.clientId } })).toBe(1);
      expect(res.body.result.failed).toBe(0);
    });
  });
});
