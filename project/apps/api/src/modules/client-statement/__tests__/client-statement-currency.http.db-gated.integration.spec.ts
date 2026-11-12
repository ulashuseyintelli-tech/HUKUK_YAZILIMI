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
import { buildMonthlyStatementSkipTask, resolveMonthlyStatementSkipTasks } from '../client-statement-monthly-skip-trace';

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

  describe('CL-R08 — dosya oluşturma, e-posta gönderimi değildir', () => {
    it.each([true, false])('özel hazır şablonu aktif=%s: HTTP 201 + snapshot/audit var; gönderim ve teslim kaydı yok', async (isActive) => {
      const f = await setup(`clr08-template-${isActive}`);
      await seedTryRows(f);
      const template = await prisma.messageTemplate.create({ data: {
        tenantId: t1.tenantId, code: 'STATEMENT_READY', name: 'CL-R08 test şablonu',
        category: 'STATEMENT_READY', channel: 'EMAIL', isActive,
        subject: 'Ekstreniz hazır', body: '{{clientName}}: {{closingBalance}}',
      } });
      try {
        const before = await statementDocumentCounts(prisma, t1.tenantId);
        const ledgerBefore = await prisma.clientStatementDeliveryLedger.count({ where: { tenantId: t1.tenantId } });
        dispatcher.dispatch.mockClear();

        const res = await caseStatement(f);

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ caseId: f.caseId, clientId: f.clientId, currency: 'TRY', status: 'ACTIVE' });
        expect(Number(res.body.openingBalance)).toBe(100);
        expect(Number(res.body.closingBalance)).toBe(980);
        expect(res.body.lines).toHaveLength(4);
        expect(await statementDocumentCounts(prisma, t1.tenantId)).toEqual({
          ...before, statements: before.statements + 1, lines: before.lines + 4, audits: before.audits + 1,
        });
        expect(await prisma.auditLog.count({ where: {
          tenantId: t1.tenantId, action: 'CLIENT_STATEMENT_GENERATED', entityId: res.body.id,
        } })).toBe(1);
        expect(await prisma.clientStatementDeliveryLedger.count({ where: { tenantId: t1.tenantId } })).toBe(ledgerBefore);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
        expect(await prisma.messageTemplate.findUnique({ where: { id: template.id } })).toEqual(template);

        const after = await statementDocumentCounts(prisma, t1.tenantId);
        expect((await caseStatement(f)).status).toBe(409);
        expect(await statementDocumentCounts(prisma, t1.tenantId)).toEqual(after);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
      } finally {
        await prisma.messageTemplate.delete({ where: { id: template.id } });
      }
    });

    it('oluşturma audit yazısından sonraki hata snapshot/satır/audit işlemini geri alır; gönderim yok', async () => {
      const f = await setup('clr08-audit-rollback');
      await seedTryRows(f);
      const before = await statementDocumentCounts(prisma, t1.tenantId);
      const ledgerBefore = await prisma.clientStatementDeliveryLedger.count({ where: { tenantId: t1.tenantId } });
      const audit = app.get(AuditService);
      const original = audit.logInTransaction.bind(audit);
      let reachedAudit = false;
      const injected = jest.spyOn(audit, 'logInTransaction').mockImplementationOnce(async (tx, input) => {
        await original(tx, input);
        reachedAudit = true;
        throw new Error('CL-R08-after-generated-audit');
      });
      dispatcher.dispatch.mockClear();
      try {
        expect((await caseStatement(f)).status).toBe(500);
        expect(reachedAudit).toBe(true);
        expect(await statementDocumentCounts(prisma, t1.tenantId)).toEqual(before);
        expect(await prisma.clientStatementDeliveryLedger.count({ where: { tenantId: t1.tenantId } })).toBe(ledgerBefore);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
      } finally {
        injected.mockRestore();
      }
    });
  });

  describe('geçerli TL ekstre davranışı korunur', () => {
    it('H07: 5000 TRY avans + 600 TRY payable kapanışı, sonraki boş dönemde aynen devreder; client-level avansı sahiplenmez', async () => {
      const f = await setup('h07-carry');
      await addLedgerRow(prisma, { tenantId: t1.tenantId, caseId: f.caseId, amount: 5000, currency: 'TRY', createdAt: IN_PERIOD });
      await addPostedPayable(prisma, { tenantId: t1.tenantId, caseId: f.caseId, caseClientId: f.caseClientId, userId: t1.userId, amount: 600, currency: 'TRY', postedAt: IN_PERIOD, key: next() });
      const first = await caseStatement(f);
      expect(first.status).toBe(201);
      expect(Number(first.body.closingBalance)).toBe(5600);
      const carried = await caseStatement(f, { periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-07-31T23:59:59.999Z' });
      expect(carried.status).toBe(201);
      expect([Number(carried.body.openingBalance), Number(carried.body.closingBalance)]).toEqual([5600, 5600]);
      expect(carried.body.lines).toHaveLength(0);
      const general = await clientStatement(f.clientId);
      expect(general.status).toBe(201);
      expect(Number(general.body.closingBalance)).toBe(600);
    });

    it('H07: devirde müvekkil ödeme eksi, reimbursement artı; ofis payı sıfır ve başka alacaklı dışarıda', async () => {
      const f = await setup('h07-signed');
      const base = { tenantId: t1.tenantId, caseId: f.caseId, userId: t1.userId, caseClientId: f.caseClientId };
      for (const [type, amount] of [['CLIENT_PAYABLE', 600], ['CLIENT_EXPENSE_REIMBURSEMENT', 80], ['CONTRACTUAL_FEE_WITHHELD', 40]] as const) {
        const key = next();
        await addPostedPayable(prisma, { ...base, amount, currency: 'TRY', postedAt: BEFORE_PERIOD, key });
        const collection = await prisma.collection.findFirstOrThrow({ where: { tenantId: t1.tenantId, idempotencyKey: `test:ccy:${key}` } });
        const d = await prisma.collectionDisposition.findUniqueOrThrow({ where: { collectionId: collection.id } });
        if (type !== 'CLIENT_PAYABLE') await prisma.collectionDispositionLine.updateMany({ where: { dispositionId: d.id }, data: { type } });
      }
      await addPayout(prisma, { ...base, amount: 200, currency: 'TRY', paidAt: BEFORE_PERIOD, key: next() });
      const stranger = await createClient(prisma, t1.tenantId, next());
      const otherCc = await linkClient(prisma, f.caseId, stranger, t1.userId);
      await addPostedPayable(prisma, { ...base, caseClientId: otherCc, amount: 900, currency: 'USD', postedAt: BEFORE_PERIOD, key: next() });
      const result = await caseStatement(f);
      expect(result.status).toBe(201);
      expect(Number(result.body.openingBalance)).toBe(480);
      expect(Number(result.body.closingBalance)).toBe(480);
    });

    it.each(['payable', 'payout'] as const)('H07: dönem öncesi %s USD kaynağı E1 ile yazmasız reddedilir', async source => {
      const f = await setup(`h07-old-${source}`);
      const base = { tenantId: t1.tenantId, caseId: f.caseId, userId: t1.userId, caseClientId: f.caseClientId, amount: 100, currency: 'USD', key: next() };
      if (source === 'payable') await addPostedPayable(prisma, { ...base, postedAt: BEFORE_PERIOD });
      else await addPayout(prisma, { ...base, paidAt: BEFORE_PERIOD });
      await expectRejectedWithoutDocuments(() => caseStatement(f), t1, { reasonCode: 'NON_TRY_SOURCE', currencies: ['USD'] });
    });

    it('H07: açılışta payable offset APPLY eksi / REVERSAL artı; masraf bacağı ve avans offseti çift sayılmaz', async () => {
      const f = await setup('h07-offset');
      const base = { tenantId: t1.tenantId, caseId: f.caseId };
      await addLedgerRow(prisma, { ...base, amount: 5000, currency: 'TRY', createdAt: BEFORE_PERIOD });
      await addPostedPayable(prisma, { ...base, caseClientId: f.caseClientId, userId: t1.userId, amount: 600, currency: 'TRY', postedAt: BEFORE_PERIOD, key: next() });
      let appliedId: string | null = null;
      for (const [kind, amount] of [['APPLY', 100], ['REVERSAL', 100], ['APPLY', 70]] as const) {
        const offset = await prisma.clientOffset.create({ data: { tenantId: t1.tenantId, clientId: f.clientId, payableCaseId: f.caseId, payableCaseClientId: f.caseClientId,
          expenseCaseId: f.caseId, expenseRequestId: `synthetic-${next()}`, amount, currency: 'TRY', kind,
          ...(kind === 'REVERSAL' ? { reversesOffsetId: appliedId, reason: 'Synthetic full reversal fixture' } : {}),
          idempotencyKey: next(), createdById: t1.userId, createdAt: BEFORE_PERIOD } });
        if (kind === 'APPLY') appliedId = offset.id;
      }
      const result = await caseStatement(f);
      expect(result.status).toBe(201);
      expect([Number(result.body.openingBalance), Number(result.body.closingBalance)]).toEqual([5530, 5530]);
      expect(result.body.lines).toHaveLength(0);
    });

    it('H07: aynı tam ay/client/tenant için yeni client-level üretim yalnız açık para birimi izini AUTO_SYSTEM kapatır', async () => {
      const f = await setup('h07-task');
      const month = resolvePreviousMonthPeriod(new Date('2026-07-01T00:00:00Z'));
      const addTask = async (clientId = f.clientId, periodKey = month.periodKey, reason = 'NON_TRY_SOURCE', status: any = 'PENDING') => prisma.task.create({ data: {
        ...buildMonthlyStatementSkipTask({ tenantId: t1.tenantId, clientId, clientName: 'Synthetic', periodKey, reasonCode: reason, currencies: ['USD'], sources: ['CollectionDisposition'] }),
        status, createdAt: new Date('2026-07-01T01:00:00Z'),
      } });
      const target = await addTask();
      const otherMonth = await addTask(f.clientId, '2026-05');
      const unknown = await addTask(f.clientId, month.periodKey, 'OTHER_REASON');
      const cancelled = await addTask(f.clientId, month.periodKey, 'CURRENCY_UNDETERMINED', 'CANCELLED');
      const caseOnly = await caseStatement(f, { periodStart: month.periodStart.toISOString(), periodEnd: month.periodEnd.toISOString() });
      expect(caseOnly.status).toBe(201);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('PENDING');
      const generated = await post(`/client-statements/client/${f.clientId}`, { periodStart: month.periodStart.toISOString(), periodEnd: month.periodEnd.toISOString() });
      expect(generated.status).toBe(201);
      expect(await prisma.task.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ status: 'COMPLETED', completedByUserId: null, resolutionType: 'AUTO_SYSTEM' });
      for (const task of [otherMonth, unknown, cancelled]) expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(task.status);
      await Promise.all(Array.from({ length: 3 }, () => resolveMonthlyStatementSkipTasks(prisma as any, t1.tenantId, generated.body.id)));
      expect(await prisma.auditLog.count({ where: { tenantId: t1.tenantId, action: 'MONTHLY_STATEMENT_SKIP_RESOLVED', entityId: target.id } })).toBe(1);
      expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: target.id, action: 'MONTHLY_STATEMENT_SKIP_RESOLVED' } })).metadata).toMatchObject({ deliveryProven: false });
    });

    it('H07: eski snapshot veya aynı ay adı fakat farklı exact sınırlar görevi kapatmaz', async () => {
      const f = await setup('h07-old-snapshot');
      const month = resolvePreviousMonthPeriod(new Date('2026-07-01T00:00:00Z'));
      const generated = await post(`/client-statements/client/${f.clientId}`, { periodStart: month.periodStart.toISOString(), periodEnd: month.periodEnd.toISOString() });
      expect(generated.status).toBe(201);
      const task = await prisma.task.create({ data: { ...buildMonthlyStatementSkipTask({ tenantId: t1.tenantId, clientId: f.clientId, clientName: 'Synthetic', periodKey: month.periodKey, reasonCode: 'NON_TRY_SOURCE', currencies: ['USD'], sources: [] }), createdAt: new Date(Date.now() + 1000) } });
      expect((await resolveMonthlyStatementSkipTasks(prisma as any, t1.tenantId, generated.body.id)).outcome).toBe('NO_MATCH');
      const inexact = await clientStatement(f.clientId);
      expect(inexact.status).toBe(201);
      expect((await resolveMonthlyStatementSkipTasks(prisma as any, t1.tenantId, inexact.body.id)).outcome).toBe('NO_MATCH');
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('PENDING');
    });

    it('H07: kapanış audit hatası gerçek task güncellemesini geri alır; commit edilmiş ekstre kalır ve repair yeniden üretmez', async () => {
      const f = await setup('h07-audit-rollback');
      const month = resolvePreviousMonthPeriod(new Date('2026-07-01T00:00:00Z'));
      const task = await prisma.task.create({ data: { ...buildMonthlyStatementSkipTask({ tenantId: t1.tenantId, clientId: f.clientId, clientName: 'Synthetic', periodKey: month.periodKey, reasonCode: 'NON_TRY_SOURCE', currencies: ['USD'], sources: [] }), createdAt: new Date('2026-07-01T01:00:00Z') } });
      const statementService = app.get(ClientStatementService);
      const hold = jest.spyOn(statementService, 'resolveCurrencySkipTasks').mockResolvedValueOnce({ outcome: 'FAILED', completed: 0 });
      const generated = await post(`/client-statements/client/${f.clientId}`, { periodStart: month.periodStart.toISOString(), periodEnd: month.periodEnd.toISOString() });
      hold.mockRestore();
      expect(generated.status).toBe(201);
      let reachedUpdate = false;
      let reachedAudit = false;
      const failing = { $transaction: (run: any) => prisma.$transaction(tx => run(new Proxy(tx, {
        get(target, key) {
          const value = (target as any)[key];
          if (key !== 'task' && key !== 'auditLog') return typeof value === 'function' ? value.bind(target) : value;
          return new Proxy(value, { get(delegate, method) {
            const original = delegate[method];
            if (key === 'task' && method === 'updateMany') return async (args: any) => { const result = await original.call(delegate, args); reachedUpdate = result.count === 1; return result; };
            if (key === 'auditLog' && method === 'create') return async (args: any) => { await original.call(delegate, args); reachedAudit = true; throw new Error('h07-after-resolution-audit'); };
            return typeof original === 'function' ? original.bind(delegate) : original;
          } });
        },
      }))) };
      await expect(resolveMonthlyStatementSkipTasks(failing, t1.tenantId, generated.body.id)).rejects.toThrow('h07-after-resolution-audit');
      expect({ reachedUpdate, reachedAudit }).toEqual({ reachedUpdate: true, reachedAudit: true });
      expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toEqual(task);
      expect(await prisma.auditLog.count({ where: { action: 'MONTHLY_STATEMENT_SKIP_RESOLVED', entityId: task.id } })).toBe(0);
      const beforeRepair = await statementDocumentCounts(prisma, t1.tenantId);
      await expect(statementService.resolveCurrencySkipTasks(t1.tenantId, generated.body.id)).resolves.toMatchObject({ outcome: 'RESOLVED', completed: 1 });
      expect(await statementDocumentCounts(prisma, t1.tenantId)).toEqual(beforeRepair);
      expect(await prisma.clientStatement.findUniqueOrThrow({ where: { id: generated.body.id } })).toMatchObject({ status: 'ACTIVE' });
    });
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

  /**
   * ATLANAN AYLIK EKSTRE — KALICI İZ (owner kararı 2026-10-03, "7 — B"): E1 atlaması müvekkil + dönem + neden başına TEK kalıcı
   * görev bırakır (`Task.dedupeKey` UNIQUE; yeni tablo yok). Yeniden koşu / eşzamanlı koşu mükerrer iz, başarı veya gönderim
   * üretmez; atlama "gönderildi" sayılmaz (teslim defterine kayıt yazılmaz).
   */
  describe('atlanan aylık ekstrenin kalıcı izi (görev; DB tekilliği)', () => {
    const runMonthly = (user: TenantFixture = t1) =>
      http().post('/client-statements/monthly-delivery/run-now').set('x-test-user-id', user.userId).send({});
    const target = (res: request.Response, clientId: string) =>
      (res.body.result.targets as { clientId: string; outcome: string; reason?: string; skipTrace?: string; statementSource: string }[]).find(
        (x) => x.clientId === clientId,
      )!;
    const skipTasks = (tenantId: string, clientId: string) =>
      prisma.task.findMany({ where: { tenantId, clientId, dedupeKey: { startsWith: 'MONTHLY_STATEMENT_SKIPPED:' } } });

    /** USD kaynaklı ve e-postası olan müvekkil (önceki ay içinde USD ödeme). */
    async function usdClient(label: string, tenant: TenantFixture = t1) {
      const f = await setup(label, 'TRY', tenant);
      const period = resolvePreviousMonthPeriod(new Date());
      const inPrevMonth = new Date(period.periodStart.getTime() + 6 * 24 * 3600 * 1000);
      await prisma.client.update({ where: { id: f.clientId }, data: { email: `iz-${next()}@example.test` } });
      await addPayout(prisma, {
        tenantId: tenant.tenantId,
        caseId: f.caseId,
        caseClientId: f.caseClientId,
        userId: tenant.userId,
        amount: 7,
        currency: 'USD',
        paidAt: inPrevMonth,
        key: next(),
      });
      return { ...f, periodKey: period.periodKey };
    }

    beforeAll(() => {
      process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'true';
    });

    it('atlama: müvekkil + dönem + neden başına TEK kalıcı görev; sonuç skipTrace CREATED; belge / defter / bildirim yazılmaz', async () => {
      const f = await usdClient('iz-ilk');
      const before = await statementDocumentCounts(prisma, t1.tenantId);

      const res = await runMonthly();

      expect(res.status).toBe(201);
      expect(target(res, f.clientId)).toMatchObject({
        outcome: 'SKIPPED_UNSUPPORTED_CURRENCY',
        statementSource: 'NONE',
        reason: 'NON_TRY_SOURCE',
        skipTrace: 'CREATED',
      });
      const tasks = await skipTasks(t1.tenantId, f.clientId);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        tenantId: t1.tenantId,
        clientId: f.clientId,
        caseId: null,
        status: 'PENDING',
        createdById: null,
        dedupeKey: `MONTHLY_STATEMENT_SKIPPED:${t1.tenantId}:${f.clientId}:${f.periodKey}:NON_TRY_SOURCE`,
      });
      expect(tasks[0].title).toContain(f.periodKey);
      expect(tasks[0].description).toContain('TL dışı para biriminde kayıt var (USD)');
      expect(tasks[0].description).toContain('müvekkile ödeme');
      expect(tasks[0].description).toContain('ÜRETİLMEDİ ve GÖNDERİLMEDİ');
      // atlama "gönderildi" sayılmaz: bu müvekkil için ekstre, teslim defteri kaydı ya da bildirim yok
      expect(await prisma.clientStatement.count({ where: { tenantId: t1.tenantId, clientId: f.clientId } })).toBe(0);
      expect(await prisma.clientStatementDeliveryLedger.count({ where: { tenantId: t1.tenantId, clientId: f.clientId } })).toBe(0);
      expect((await statementDocumentCounts(prisma, t1.tenantId)).notifications).toBe(before.notifications);
    });

    it('YENİDEN KOŞU: ikinci koşu mükerrer görev / ekstre / defter kaydı üretmez (ALREADY_RECORDED); tamamlanmış görev diriltilmez', async () => {
      const f = await usdClient('iz-tekrar');
      await runMonthly();
      expect(await skipTasks(t1.tenantId, f.clientId)).toHaveLength(1);

      const second = await runMonthly();

      expect(target(second, f.clientId)).toMatchObject({ outcome: 'SKIPPED_UNSUPPORTED_CURRENCY', skipTrace: 'ALREADY_RECORDED', statementSource: 'NONE' });
      expect(await skipTasks(t1.tenantId, f.clientId)).toHaveLength(1);
      expect(await prisma.clientStatement.count({ where: { tenantId: t1.tenantId, clientId: f.clientId } })).toBe(0);
      expect(await prisma.clientStatementDeliveryLedger.count({ where: { tenantId: t1.tenantId, clientId: f.clientId } })).toBe(0);

      // görev tamamlandı (personel ilgilendi) → yeniden koşu yine mükerrer görev açmaz, eskisini diriltmez
      await prisma.task.updateMany({
        where: { tenantId: t1.tenantId, clientId: f.clientId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      const third = await runMonthly();
      expect(target(third, f.clientId).skipTrace).toBe('ALREADY_RECORDED');
      const tasks = await skipTasks(t1.tenantId, f.clientId);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('COMPLETED');
    });

    it('EŞZAMANLI koşular: iki istek birlikte atlasa da DB tekilliği tek kalıcı iz bırakır', async () => {
      const f = await usdClient('iz-es');

      const [a, b] = await Promise.all([runMonthly(), runMonthly()]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(await skipTasks(t1.tenantId, f.clientId)).toHaveLength(1);
      const traces = [target(a, f.clientId).skipTrace, target(b, f.clientId).skipTrace].sort();
      expect(traces).toEqual(['ALREADY_RECORDED', 'CREATED']);
      expect(await prisma.clientStatement.count({ where: { tenantId: t1.tenantId, clientId: f.clientId } })).toBe(0);
    });

    it('TL kaynaklı müvekkil için atlama izi YAZILMAZ; başka büronun koşusu bu büronun izini etkilemez (büro izolasyonu)', async () => {
      const tl = await setup('iz-tl');
      const period = resolvePreviousMonthPeriod(new Date());
      await prisma.client.update({ where: { id: tl.clientId }, data: { email: `iz-${next()}@example.test` } });
      await addLedgerRow(prisma, {
        tenantId: t1.tenantId,
        caseId: tl.caseId,
        amount: 11,
        currency: 'TRY',
        createdAt: new Date(period.periodStart.getTime() + 3 * 24 * 3600 * 1000),
      });
      const own = await usdClient('iz-izo-a');
      const other = await usdClient('iz-izo-b', t2);
      await runMonthly(); // t1
      const t1TasksBefore = await skipTasks(t1.tenantId, own.clientId);

      const t2Run = await runMonthly(t2);

      expect(t2Run.status).toBe(201);
      expect((t2Run.body.result.targets as { clientId: string }[]).some((x) => x.clientId === own.clientId)).toBe(false);
      expect(target(t2Run, other.clientId)).toMatchObject({ outcome: 'SKIPPED_UNSUPPORTED_CURRENCY', skipTrace: 'CREATED' });
      expect(await skipTasks(t1.tenantId, tl.clientId)).toHaveLength(0);
      expect(await skipTasks(t1.tenantId, own.clientId)).toHaveLength(t1TasksBefore.length);
      const t2Tasks = await skipTasks(t2.tenantId, other.clientId);
      expect(t2Tasks).toHaveLength(1);
      expect(t2Tasks[0].tenantId).toBe(t2.tenantId);
      // büroya kapalı: t1'in görev sorgusu t2 müvekkilini göstermez
      expect(await skipTasks(t1.tenantId, other.clientId)).toHaveLength(0);
    });
  });
});
