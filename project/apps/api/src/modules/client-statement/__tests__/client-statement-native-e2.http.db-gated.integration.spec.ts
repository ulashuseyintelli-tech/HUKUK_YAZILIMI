import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import * as nodemailer from 'nodemailer';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { addExpenseRequest, addLedgerRow, addPayout, addPostedPayable, createCase, createClient, createTenantWithUser, linkClient, type TenantFixture } from '../../../../test/client-currency-fixture';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OfficeService } from '../../office/office.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ClientNotificationService } from '../../client-notification/client-notification.service';
import { NotificationDispatcherService } from '../../client-notification/notification-dispatcher.service';
import { MessageTemplateService } from '../../message-template/message-template.service';
import { CaseBalanceService } from '../../interest-engine/orchestration/case-balance.service';
import { InterestEngineService } from '../../interest-engine/interest-engine.service';
import { PolicyGateV2Service } from '../../interest-engine/policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../../interest-engine/segments/segment-builder.service';
import { AllocationEngineService } from '../../interest-engine/allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../../interest-engine/allocation/claim-priority.service';
import { LegalReportRendererService } from '../../interest-engine/reporter/legal-report-renderer.service';
import { SegmentReporterService } from '../../interest-engine/reporter/segment-reporter.service';
import { AuditWriterService } from '../../interest-engine/audit/audit-writer.service';
import { VersionPinningService } from '../../interest-engine/version/version-pinning.service';
import { RateProviderService } from '../../interest-engine/rates/rate-provider.service';
import { ClientStatementService } from '../client-statement.service';
import { ClientStatementController } from '../client-statement.controller';
import { ClientStatementNativeController } from '../client-statement-native.controller';
import { ClientStatementNativeService } from '../client-statement-native.service';
import { ClientStatementNativeMonthlyService } from '../client-statement-native-monthly.service';
import { ClientStatementMonthlyDeliveryService, CLIENT_STATEMENT_DELIVERY_LEDGER_PORT, CLIENT_STATEMENT_DELIVERY_PORT } from '../client-statement-monthly-delivery.service';
import { ClientStatementPrismaDeliveryLedgerAdapter } from '../client-statement-prisma-delivery-ledger.adapter';
import { ClientStatementNotificationDeliveryAdapter } from '../client-statement-notification-delivery.adapter';
import { ClientStatementPdfService } from '../client-statement-pdf.service';
import { buildMonthlyStatementDedupeKey, resolvePreviousMonthPeriod } from '../client-statement-monthly-period';
import { buildMonthlyStatementSkipTask } from '../client-statement-monthly-skip-trace';
import { nativeMonthlyDedupeKey } from '../client-statement-native.contract';

// Only SMTP is substituted. Real HTTP/DTO guards, source queries, canonical engine,
// PDF renderer, template, both paired ledgers and transaction/audit rollback run against disposable PostgreSQL.
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('E2 requires disposable TEST_DATABASE_URL; SKIP is not acceptance');
const describeDb = url ? describe : describe.skip;
const RUN_AT = new Date('2026-11-15T12:00:00Z');
const period = resolvePreviousMonthPeriod(RUN_AT);
const body = { periodStart: period.periodStart.toISOString(), periodEnd: period.periodEnd.toISOString() };
const inside = new Date(period.periodStart.getTime() + 10 * 86_400_000);
const before = new Date(period.periodStart.getTime() - 10 * 86_400_000);

class DbIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
    if (!user?.isActive) throw new UnauthorizedException();
    req.user = user; return true;
  }
}

describeDb('E2 complete native-currency statements (real HTTP / disposable DB)', () => {
  jest.setTimeout(120_000);
  let db: PrismaClient, app: INestApplication, tenant: TenantFixture, foreign: TenantFixture;
  let native: ClientStatementNativeService, monthly: ClientStatementMonthlyDeliveryService, nativeMonthly: ClientStatementNativeMonthlyService;
  let pdf: ClientStatementPdfService, audit: AuditService, lawyerId: string, seq = 0;
  const suffix = randomUUID().slice(0, 8), mail = jest.fn();
  const saved = [process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY, process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY];
  const office = { getFullSmtpSettings: async () => ({ smtpHost: 'smtp.example.test', smtpUser: 'e2@example.test', smtpPass: 'test-only' }),
    getOfficeIdentity: async () => ({ name: 'CI E2' }), getSmtpSettings: async () => ({}), getSmsSettings: async () => ({}),
    getGreetingSettings: async () => ({}), getEscalationSettings: async () => ({}), getPoaExpirySettings: async () => ({ poaExpiryNotificationEnabled: false }) };

  beforeAll(async () => {
    process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'false';
    process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'false';
    db = new PrismaClient({ datasources: { db: { url } } }); await db.$connect();
    audit = new AuditService(db as any);
    const engine = new InterestEngineService(new PolicyGateV2Service(), new SegmentBuilderService(),
      new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
      new LegalReportRendererService(new SegmentReporterService()), new AuditWriterService(), new VersionPinningService());
    const balance = new CaseBalanceService(db as any, new RateProviderService(db as any), engine);
    const module = await Test.createTestingModule({ controllers: [ClientStatementController, ClientStatementNativeController], providers: [
      ClientStatementService, ClientStatementNativeService, ClientStatementNativeMonthlyService, ClientStatementMonthlyDeliveryService, ClientStatementPdfService,
      ClientStatementNotificationDeliveryAdapter, ClientStatementPrismaDeliveryLedgerAdapter, ClientNotificationService, NotificationDispatcherService, MessageTemplateService,
      { provide: PrismaService, useValue: db }, { provide: AuditService, useValue: audit }, { provide: OfficeService, useValue: office },
      { provide: OfficeApprovalService, useValue: new OfficeApprovalService(db as any, audit) }, { provide: CaseBalanceService, useValue: balance },
      { provide: CLIENT_STATEMENT_DELIVERY_PORT, useExisting: ClientStatementNotificationDeliveryAdapter },
      { provide: CLIENT_STATEMENT_DELIVERY_LEDGER_PORT, useExisting: ClientStatementPrismaDeliveryLedgerAdapter },
    ] }).overrideGuard(AuthGuard('jwt')).useValue(new DbIdentityGuard(() => db)).compile();
    app = module.createNestApplication(); app.useLogger(['error']);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    native = module.get(ClientStatementNativeService); monthly = module.get(ClientStatementMonthlyDeliveryService);
    nativeMonthly = module.get(ClientStatementNativeMonthlyService); pdf = module.get(ClientStatementPdfService);
    tenant = await createTenantWithUser(db, suffix, 'e2'); foreign = await createTenantWithUser(db, suffix, 'e2foreign');
    lawyerId = (await db.lawyer.create({ data: { tenantId: tenant.tenantId, userId: tenant.userId, name: 'CI', surname: 'E2', lawyerRank: 'PARTNER' } })).id;
    await db.messageTemplate.create({ data: { tenantId: tenant.tenantId, code: 'STATEMENT_READY', name: 'E2 CI', channel: 'EMAIL', category: 'STATEMENT_READY',
      subject: '{{clientName}} — {{periodStart}}', body: '{{closingBalanceLine}} · {{openingBalance}} · {{currency}}' } });
  });
  beforeEach(() => {
    process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'true'; process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'false';
    mail.mockReset().mockResolvedValue({ messageId: 'e2-test-only' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: mail });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    for (const [key, value] of [['CLIENT_STATEMENT_MONTHLY_DELIVERY', saved[0]], ['CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY', saved[1]]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
    await app?.close();
    // Immutable fixtures deliberately retain history until the disposable database is destroyed.
    // Deactivate only this suite's principals/clients, so a later shared-CI worker cannot select them.
    const ids = [tenant?.tenantId, foreign?.tenantId].filter(Boolean);
    if (db && ids.length) { await db.client.updateMany({ where: { tenantId: { in: ids } }, data: { isActive: false } }); await db.user.updateMany({ where: { tenantId: { in: ids } }, data: { isActive: false } }); }
    await db?.$disconnect();
  });
  const actor = () => ({ userId: tenant.userId, role: 'ADMIN' });
  const post = (path: string, data: object = {}, userId = tenant.userId) => request(app.getHttpServer()).post(path).set('x-test-user-id', userId).send(data);
  const get = (path: string, userId = tenant.userId) => request(app.getHttpServer()).get(path).set('x-test-user-id', userId);
  const counts = async () => ({ sets: await db.clientStatementNativeSet.count({ where: { tenantId: tenant.tenantId } }), docs: await db.clientStatementNativeDocument.count({ where: { tenantId: tenant.tenantId } }),
    artifacts: await db.clientStatementNativeArtifact.count({ where: { tenantId: tenant.tenantId } }), audit: await db.auditLog.count({ where: { tenantId: tenant.tenantId, entityType: 'ClientStatementNativeSet' } }), notifications: await db.clientNotification.count({ where: { tenantId: tenant.tenantId } }) });
  async function seed(options: { linked?: boolean; amounts?: boolean } = {}) {
    const clientId = await createClient(db, tenant.tenantId, `e2-${suffix}-${++seq}`, `client-${seq}@example.test`);
    const caseId = await createCase(db, { tenantId: tenant.tenantId, clientId, userId: tenant.userId, fileNumber: `E2-${suffix}-${seq}`, currency: 'TRY' });
    const caseClientId = await linkClient(db, caseId, clientId, tenant.userId);
    if (options.linked !== false) await db.caseLawyer.create({ data: { caseId, lawyerId } });
    const f = { tenantId: tenant.tenantId, clientId, caseId, caseClientId, userId: tenant.userId };
    if (options.amounts !== false) {
      await addPostedPayable(db, { ...f, amount: 5000, currency: 'TRY', postedAt: before, key: `e2-try-${suffix}-${seq}` });
      await addPostedPayable(db, { ...f, amount: 100, currency: 'USD', postedAt: before, key: `e2-usd-${suffix}-${seq}` });
    }
    return f;
  }
  const create = (f: { clientId: string }, userId = tenant.userId) => post(`/client-statement-sets/client/${f.clientId}`, body, userId);

  it('5000 TRY + 100 USD are two immutable documents with separate opening/closing amounts and real PDFs', async () => {
    const f = await seed(); const r = await create(f); expect(r.status).toBe(201); expect(r.body.artifactOutcome).toBe('COMPLETE');
    expect(r.body.documents.map((d: any) => [d.currency, d.render.openingBalance, d.render.closingBalance])).toEqual([['TRY', '5000', '5000'], ['USD', '100', '100']]);
    expect(r.body.memberCount).toBe(2); expect(r.body.closingBalance).toBeUndefined();
    const docs = await db.clientStatementNativeDocument.findMany({ where: { setId: r.body.id } });
    expect(docs).toHaveLength(2); expect(await db.clientStatementNativeArtifact.count({ where: { documentId: { in: docs.map(d => d.id) } } })).toBe(2);
    const download = await get(`/client-statement-sets/${r.body.id}/pdf/USD`); expect(download.status).toBe(200); expect(download.headers['x-content-sha256']).toMatch(/^[a-f0-9]{64}$/);
    expect(mail).not.toHaveBeenCalled(); expect(await db.clientStatement.count({ where: { tenantId: tenant.tenantId, clientId: f.clientId } })).toBe(0);
    expect(JSON.stringify(r.body.documents.map((d: any) => d.render))).not.toContain(f.caseId);
  });

  it('native period sources keep existing signs, informational requests, noncash offset neutrality and case-global advance exclusion', async () => {
    const f = await seed();
    await addPayout(db, { ...f, amount: 20, currency: 'USD', paidAt: inside, key: `e2-payout-${seq}` });
    const er = await addExpenseRequest(db, { ...f, amount: 30, currency: 'USD', createdAt: inside });
    await db.expensePayment.create({ data: { expenseRequestId: er, amount: 5, paymentDate: inside, method: 'BANK_TRANSFER', matchedById: tenant.userId } });
    await db.clientOffset.create({ data: { tenantId: tenant.tenantId, clientId: f.clientId, amount: 10, currency: 'USD', kind: 'APPLY', payableCaseId: f.caseId,
      payableCaseClientId: f.caseClientId, expenseCaseId: f.caseId, expenseRequestId: er, createdById: tenant.userId, createdAt: inside, idempotencyKey: `e2-offset-${suffix}-${seq}` } });
    await addLedgerRow(db, { ...f, amount: 9000, currency: 'TRY', createdAt: inside });
    const r = await create(f); expect(r.status).toBe(201); const usd = r.body.documents.find((d: any) => d.currency === 'USD').render;
    expect(usd.closingBalance).toBe('85'); expect(r.body.documents.find((d: any) => d.currency === 'TRY').render.closingBalance).toBe('5000');
    const info = usd.lines.find((l: any) => l.note?.includes('30,00 USD')); expect(info).toMatchObject({ debit: '0', credit: '0', isInformational: true });
    expect(usd.lines.filter((l: any) => l.note?.includes('Mahsup'))).toHaveLength(2);
  });

  it('legacy E1 still refuses mixed sources with zero legacy statement writes', async () => {
    const f = await seed(); const r = await post(`/client-statements/client/${f.clientId}`, body);
    expect(r.status).toBe(400); expect(r.body.code).toBe('CLIENT_STATEMENT_UNSUPPORTED_CURRENCY');
    expect(await db.clientStatement.count({ where: { tenantId: tenant.tenantId, clientId: f.clientId } })).toBe(0);
  });

  it.each(['', 'usd', 'UNKNOWN'])('invalid source currency %p rejects the complete set with zero writes', async currency => {
    const f = await seed(); await addExpenseRequest(db, { ...f, amount: 1, currency, createdAt: inside });
    const old = await counts(); const r = await create(f); expect(r.status).toBe(400); expect(r.body.code).toBe('E2_CURRENCY_UNDETERMINED'); expect(await counts()).toEqual(old); expect(mail).not.toHaveBeenCalled();
  });

  it('source parent outside canonical CaseClient is refused before generation/audit', async () => {
    const f = await seed(), other = await seed();
    await addExpenseRequest(db, { ...f, caseId: other.caseId, amount: 1, currency: 'USD', createdAt: before }).then(async id => db.expensePayment.create({ data: { expenseRequestId: id, amount: 1, paymentDate: before, method: 'BANK_TRANSFER', matchedById: tenant.userId } }));
    const old = await counts(); const r = await create(f); expect(r.status).toBe(409); expect(await counts()).toEqual(old);
  });

  it('ADMIN without a canonical active profile relation has no shortcut', async () => {
    const f = await seed({ linked: false }); const old = await counts(); expect((await create(f)).status).toBe(404); expect(await counts()).toEqual(old);
  });

  it('a single hidden case denies the complete client document; no clipped financial snapshot', async () => {
    const f = await seed(); const caseId = await createCase(db, { ...f, fileNumber: `E2-hidden-${suffix}-${++seq}`, currency: 'USD' }); await linkClient(db, caseId, f.clientId, tenant.userId);
    const old = await counts(); expect((await create(f)).status).toBe(403); expect(await counts()).toEqual(old);
    expect((await get(`/client-statement-sets/client/${f.clientId}`)).status).toBe(403);
  });

  it('VIEWER and wrong tenant cannot generate or read the set', async () => {
    const f = await seed(); const viewer = await db.user.create({ data: { tenantId: tenant.tenantId, email: `viewer-${suffix}@example.test`, name: 'CI', surname: 'Viewer', role: 'VIEWER' } });
    const old = await counts(); expect((await create(f, viewer.id)).status).toBe(403); expect((await create(f, foreign.userId)).status).toBe(404); expect(await counts()).toEqual(old);
    const made = await create(f); expect(made.status).toBe(201);
    expect((await get(`/client-statement-sets/${made.body.id}`, foreign.userId)).status).toBe(404);
    expect((await get(`/client-statement-sets/${made.body.id}`, viewer.id)).status).toBe(403);
  });

  it('inactive profile, absent/stale actor context and detached historical parent fail closed', async () => {
    const f = await seed(); await db.lawyer.update({ where: { id: lawyerId }, data: { isActive: false } });
    try { expect((await create(f)).status).toBe(404); } finally { await db.lawyer.update({ where: { id: lawyerId }, data: { isActive: true } }); }
    await expect(native.create(tenant.tenantId, f.clientId, undefined as any, body)).rejects.toThrow();
    await expect(native.create(tenant.tenantId, f.clientId, { userId: tenant.userId, role: 'USER' }, body)).rejects.toThrow('E2_ACTOR_REQUIRED');
    const made = await create(f); expect(made.status).toBe(201); await db.caseClient.delete({ where: { id: f.caseClientId } });
    expect((await get(`/client-statement-sets/${made.body.id}`)).status).toBeGreaterThanOrEqual(400);
    expect((await get(`/client-statement-sets/${made.body.id}/pdf/USD`)).status).toBeGreaterThanOrEqual(400);
  });

  it('generation audit failure rolls back both documents and header, and never reaches PDF/send', async () => {
    const f = await seed(); const old = await counts(), render = jest.spyOn(pdf, 'render');
    const rejected = jest.spyOn(audit, 'logInTransaction').mockRejectedValueOnce(new Error('e2-audit-test'));
    expect((await create(f)).status).toBe(500);
    expect(rejected).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'ClientStatementNativeSet', action: 'CREATE' }));
    expect(await counts()).toEqual(old); expect(render).not.toHaveBeenCalled(); expect(mail).not.toHaveBeenCalled();
  });

  it('concurrent generation has one complete ACTIVE group, never two partial winners', async () => {
    const f = await seed(); const results = await Promise.all([create(f), create(f)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await db.clientStatementNativeSet.count({ where: { clientId: f.clientId, status: 'ACTIVE' } })).toBe(1);
    expect(await db.clientStatementNativeDocument.count({ where: { statementSet: { clientId: f.clientId } } })).toBe(2);
  });

  it('second PDF failure preserves the committed financial set but exposes zero partial artifacts and sends nothing', async () => {
    const f = await seed(), real = pdf.render.bind(pdf);
    jest.spyOn(pdf, 'render').mockImplementationOnce(real).mockRejectedValue(new Error('second-pdf-test'));
    const r = await create(f); expect(r.status).toBe(201); expect(r.body.artifactOutcome).toBe('FAILED');
    expect(await db.clientStatementNativeArtifact.count({ where: { document: { setId: r.body.id } } })).toBe(0);
    process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'true';
    const result = await nativeMonthly.process(tenant.tenantId, f.clientId, period, RUN_AT);
    expect(result.outcome).toBe('FAILED'); expect(await db.clientStatementNativeDelivery.count({ where: { clientId: f.clientId } })).toBe(0); expect(mail).not.toHaveBeenCalled();
  });

  it('whole-set supersession/void retains old hashes and database rejects financial document mutation', async () => {
    const f = await seed(); const old = await create(f); expect(old.status).toBe(201);
    await expect(db.clientStatementNativeDocument.update({ where: { id: old.body.documents[0].id }, data: { currency: 'EUR' } })).rejects.toThrow();
    const newer = await post(`/client-statement-sets/${old.body.id}/supersede`); expect(newer.status).toBe(201);
    const history = await get(`/client-statement-sets/${old.body.id}`); expect(history.body.status).toBe('SUPERSEDED'); expect(history.body.memberHash).toBe(old.body.memberHash);
    const voided = await post(`/client-statement-sets/${newer.body.id}/void`, { note: 'CI correction' }); expect(voided.status).toBe(201);
    expect((await get(`/client-statement-sets/${newer.body.id}/pdf/USD`)).status).toBe(409);
  });

  it('currency skip task resolves only on full generation+audit commit; it never asserts delivery', async () => {
    const f = await seed(); const task = await db.task.create({ data: buildMonthlyStatementSkipTask({ tenantId: tenant.tenantId, clientId: f.clientId, clientName: 'CI', periodKey: period.periodKey, reasonCode: 'NON_TRY_SOURCE', currencies: ['USD'], sources: ['CollectionDisposition'] }) });
    const real = pdf.render.bind(pdf); jest.spyOn(pdf, 'render').mockImplementationOnce(real).mockRejectedValueOnce(new Error('pdf-test'));
    const r = await create(f); expect(r.status).toBe(201); expect(r.body.artifactOutcome).toBe('FAILED');
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('COMPLETED');
    const resolved = await db.auditLog.findFirstOrThrow({ where: { entityId: task.id, action: 'MONTHLY_STATEMENT_SKIP_RESOLVED' } });
    expect(resolved.metadata).toMatchObject({ nativeSetId: r.body.id, deliveryProven: false }); expect(mail).not.toHaveBeenCalled();
  });

  it('default-off keeps E1 skip behavior and creates no native delivery', async () => {
    const f = await seed(); const result = await monthly.runMonthlyDelivery(RUN_AT, { tenantId: tenant.tenantId, clientId: f.clientId });
    expect(result.targets[0].outcome).toBe('SKIPPED_UNSUPPORTED_CURRENCY'); expect(await db.clientStatementNativeSet.count({ where: { clientId: f.clientId } })).toBe(0); expect(mail).not.toHaveBeenCalled();
  });

  it('enabled H6 fallback sends all native PDFs in one dispatcher message and repeat runs do not resend', async () => {
    const f = await seed(); process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'true';
    const result = await monthly.runMonthlyDelivery(RUN_AT, { tenantId: tenant.tenantId, clientId: f.clientId });
    expect(result.targets[0].outcome).toBe('DELIVERED'); expect(mail).toHaveBeenCalledTimes(1);
    const message = mail.mock.calls[0][0]; expect(message.attachments).toHaveLength(2);
    expect(message.attachments.map((a: any) => a.filename).sort()).toEqual([expect.stringContaining('-TRY.pdf'), expect.stringContaining('-USD.pdf')]);
    const set = await db.clientStatementNativeSet.findFirstOrThrow({ where: { clientId: f.clientId } });
    expect((await db.clientStatementNativeDelivery.findFirstOrThrow({ where: { setId: set.id } })).status).toBe('SENT');
    const again = await monthly.runMonthlyDelivery(RUN_AT, { tenantId: tenant.tenantId, clientId: f.clientId }); expect(again.targets[0].outcome).toBe('RECONCILED'); expect(mail).toHaveBeenCalledTimes(1);
    process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'false';
    const disabled = await monthly.runMonthlyDelivery(RUN_AT, { tenantId: tenant.tenantId, clientId: f.clientId }); expect(disabled.targets[0].outcome).toBe('RECONCILIATION_REQUIRED'); expect(mail).toHaveBeenCalledTimes(1);
  });

  it.each(['SENT', 'PENDING', 'FAILED'])('legacy %s period evidence cannot be bypassed by a new set key', async status => {
    const f = await seed(); const legacy = await db.clientStatement.create({ data: { tenantId: tenant.tenantId, clientId: f.clientId, periodStart: period.periodStart, periodEnd: period.periodEnd, currency: 'TRY', openingBalance: 1, closingBalance: 1, generatedById: tenant.userId } });
    await db.clientStatementDeliveryLedger.create({ data: { tenantId: tenant.tenantId, clientId: f.clientId, statementId: legacy.id, periodKey: period.periodKey,
      recipientEmail: `client-${seq}@example.test`, dedupeKey: buildMonthlyStatementDedupeKey(legacy.id, period.periodKey), status: status as any, sentAt: status === 'SENT' ? new Date() : null } });
    process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'true';
    const result = await nativeMonthly.process(tenant.tenantId, f.clientId, period, RUN_AT); expect(result.outcome).toBe('RECONCILIATION_REQUIRED'); expect(mail).not.toHaveBeenCalled();
  });

  it('FAILED pair retries the identical complete set; PENDING evidence and changed recipient cannot resend', async () => {
    const f = await seed(); process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'true';
    mail.mockRejectedValueOnce(Object.assign(new Error('test-smtp-definite-rejection'), { responseCode: 550 }));
    const fail = await nativeMonthly.process(tenant.tenantId, f.clientId, period, RUN_AT); expect(fail.outcome).toBe('FAILED');
    const row = await db.clientStatementNativeDelivery.findFirstOrThrow({ where: { clientId: f.clientId } });
    const retry = await post(`/client-statement-sets/${row.setId}/monthly-delivery/retry`); expect(retry.status).toBe(201); expect(retry.body.target.outcome).toBe('DELIVERED'); expect(mail).toHaveBeenCalledTimes(2);
    expect((await db.clientStatementNativeDelivery.findUniqueOrThrow({ where: { id: row.id } })).setId).toBe(row.setId);
    expect((await post(`/client-statement-sets/${row.setId}/supersede`)).status).toBe(409);
    await db.client.update({ where: { id: f.clientId }, data: { email: 'changed@example.test' } });
    const changed = await post(`/client-statement-sets/${row.setId}/monthly-delivery/retry`); expect(changed.body.target.outcome).toBe('RECONCILIATION_REQUIRED'); expect(mail).toHaveBeenCalledTimes(2);
    const pending = await seed(); const set = await create(pending); expect(set.status).toBe(201);
    const key = nativeMonthlyDedupeKey(tenant.tenantId, pending.clientId, period.periodKey);
    await db.clientNotification.create({ data: { tenantId: tenant.tenantId, clientId: pending.clientId, channel: 'EMAIL', type: 'STATEMENT_READY', status: 'PENDING', body: 'in flight', sentById: tenant.userId, dedupeKey: key } });
    expect((await nativeMonthly.process(tenant.tenantId, pending.clientId, period, new Date(RUN_AT.getTime() + 86_400_000))).outcome).toBe('RECONCILIATION_REQUIRED'); expect(mail).toHaveBeenCalledTimes(2);
  });

  it('an SMTP exception without definite non-delivery leaves PENDING and cannot be retried as FAILED', async () => {
    const f = await seed(); process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'true';
    mail.mockRejectedValueOnce(new Error('test-unknown-smtp-outcome'));
    const uncertain = await nativeMonthly.process(tenant.tenantId, f.clientId, period, RUN_AT); expect(uncertain.outcome).toBe('RECONCILIATION_REQUIRED');
    const row = await db.clientStatementNativeDelivery.findFirstOrThrow({ where: { clientId: f.clientId } }); expect(row.status).toBe('PENDING');
    const again = await post(`/client-statement-sets/${row.setId}/monthly-delivery/retry`); expect(again.status).toBe(201); expect(again.body.target.outcome).toBe('RECONCILIATION_REQUIRED'); expect(mail).toHaveBeenCalledTimes(1);
  });

  it('a concurrent source change cannot split the currencies across source cuts', async () => {
    const f = await seed(), balance = app.get(CaseBalanceService), real = balance.computeCaseBalance.bind(balance);
    jest.spyOn(balance, 'computeCaseBalance').mockImplementationOnce(async (...args) => {
      const value = await real(...args);
      await addPostedPayable(db, { ...f, amount: 50, currency: 'USD', postedAt: inside, key: `e2-cut-${suffix}-${seq}` });
      return value;
    });
    const first = await create(f); expect(first.status).toBe(201); expect(first.body.documents.find((d: any) => d.currency === 'USD').render.closingBalance).toBe('100');
    const next = await post(`/client-statement-sets/${first.body.id}/supersede`); expect(next.status).toBe(201); expect(next.body.documents.find((d: any) => d.currency === 'USD').render.closingBalance).toBe('150');
    expect((await get(`/client-statement-sets/${first.body.id}`)).body.memberHash).toBe(first.body.memberHash);
  });

  it('canonical engine accrued interest stays informational in its own currency, never an added balance', async () => {
    const f = await seed({ amounts: false });
    for (const currency of ['TRY', 'USD']) await db.claimItem.create({ data: { tenantId: tenant.tenantId, caseId: f.caseId, itemType: 'PRINCIPAL',
      originalAmount: 1000, demandedAmount: 1000, amount: 1000, currency, interestTypeCode: 'CONTRACTUAL', interestRate: 10,
      interestStartDate: new Date('2026-10-01T00:00:00Z'), interestAccrualStatus: 'ACCRUES', createdById: tenant.userId } });
    const r = await create(f); expect(r.status).toBe(201); expect(r.body.documents.map((d: any) => d.currency)).toEqual(['TRY', 'USD']);
    const balance = await app.get(CaseBalanceService).computeCaseBalance(tenant.tenantId, f.caseId, period.periodEnd.toISOString().slice(0, 10));
    for (const doc of r.body.documents) {
      expect(doc.render.openingBalance).toBe('0'); expect(doc.render.closingBalance).toBe('0');
      const line = doc.render.lines.find((l: any) => l.informationalAmount !== null);
      expect(line).toMatchObject({ isInformational: true, debit: '0', credit: '0' });
      expect(Number(line.informationalAmount)).toBeGreaterThan(0);
      const result = balance.currencyResults.find(c => c.currency === doc.currency)!.result!;
      expect(Number(line.informationalAmount)).toBeCloseTo(result.finalDebtStates.reduce((n, d) => n + d.accruedInterest, 0), 2);
    }
  });

  it('unproven canonical interest is a visible whole-set refusal, never a silently omitted currency', async () => {
    const f = await seed({ amounts: false });
    await db.claimItem.create({ data: { tenantId: tenant.tenantId, caseId: f.caseId, itemType: 'PRINCIPAL', originalAmount: 1000, demandedAmount: 1000, amount: 1000, currency: 'USD', interestAccrualStatus: 'UNKNOWN', createdById: tenant.userId } });
    const old = await counts(); const r = await create(f); expect(r.status).toBe(409); expect(r.body.code).toBe('E2_INTEREST_NOT_PROVEN'); expect(await counts()).toEqual(old);
  });

  it('transaction rate reads bypass a populated shared cache and preserve the existing rate mapping', async () => {
    const rootDb = { office: { findUnique: jest.fn().mockResolvedValue(null) } };
    const rates = new RateProviderService(rootDb as any);
    const options = { tenantId: tenant.tenantId, interestType: 'LEGAL_3095' as any, startDate: '2026-01-01', endDate: '2026-10-31', currency: 'TRY' };
    expect(await rates.getRatesForPeriod(options)).toEqual([]); // primes the legacy cache
    const context = { office: { findUnique: jest.fn().mockResolvedValue({ id: 'office-test' }) }, rateSchedule: { findMany: jest.fn().mockResolvedValue([
      { id: 'rate-test', interestType: 'LEGAL_3095', annualRate: { toNumber: () => 0.24 }, validFrom: new Date('2026-01-01'), validTo: null, versionHash: 'test', source: 'test', createdAt: new Date('2026-01-01') },
    ]) } };
    const result = await rates.getRatesForPeriodInTransaction(options, context as any);
    expect(rootDb.office.findUnique).toHaveBeenCalledTimes(1); expect(context.office.findUnique).toHaveBeenCalledTimes(1); expect(context.rateSchedule.findMany).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({ annualRate: 0.24, currency: 'TRY', interestType: 'LEGAL_3095' });
  });

  it('delivery claim audit failure rolls back its reservation before SMTP', async () => {
    const f = await seed(); expect((await create(f)).status).toBe(201); process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'true';
    const real = audit.logInTransaction.bind(audit);
    const spy = jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx, event) => {
      if ((event.metadata as any)?.outcome === 'CLAIMED') throw new Error('claim-audit-test');
      return real(tx, event);
    });
    const result = await nativeMonthly.process(tenant.tenantId, f.clientId, period, RUN_AT); expect(result.outcome).toBe('FAILED');
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'CLAIMED' }) }));
    expect(await db.clientStatementNativeDelivery.count({ where: { clientId: f.clientId } })).toBe(0); expect(mail).not.toHaveBeenCalled();
  });

  it('SENT audit failure leaves paired evidence for reconciliation, never a second SMTP call', async () => {
    const f = await seed(); expect((await create(f)).status).toBe(201); process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY = 'true';
    const real = audit.logInTransaction.bind(audit);
    const spy = jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx, event) => {
      if ((event.metadata as any)?.outcome === 'SENT') throw new Error('finish-audit-test');
      return real(tx, event);
    });
    const first = await nativeMonthly.process(tenant.tenantId, f.clientId, period, RUN_AT); expect(first.outcome).toBe('RECONCILIATION_REQUIRED');
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'SENT' }) }));
    const row = await db.clientStatementNativeDelivery.findFirstOrThrow({ where: { clientId: f.clientId } }); expect(row.status).toBe('PENDING');
    expect(await db.clientNotification.count({ where: { tenantId: tenant.tenantId, dedupeKey: row.dedupeKey, status: 'SENT' } })).toBe(1);
    spy.mockRestore(); const next = await post(`/client-statement-sets/${row.setId}/monthly-delivery/retry`); expect(next.status).toBe(201); expect(next.body.target.outcome).toBe('RECONCILED'); expect(mail).toHaveBeenCalledTimes(1);
  });

  it('collected USD interest is split from the same POSTED payable credit without changing its total or TRY', async () => {
    const f = await seed({ amounts: false });
    await db.claimItem.create({ data: { tenantId: tenant.tenantId, caseId: f.caseId, itemType: 'PRINCIPAL', originalAmount: 10000, demandedAmount: 10000, amount: 10000,
      currency: 'USD', interestTypeCode: 'CONTRACTUAL', interestRate: 10, interestStartDate: new Date('2026-10-01'), interestAccrualStatus: 'ACCRUES', createdById: tenant.userId } });
    const interest = await db.claimItem.create({ data: { tenantId: tenant.tenantId, caseId: f.caseId, itemType: 'INTEREST', originalAmount: 50, demandedAmount: 50, amount: 50, currency: 'USD', createdById: tenant.userId } });
    await addPostedPayable(db, { ...f, amount: 1000, currency: 'USD', postedAt: inside, key: `e2-collected-${suffix}-${seq}` });
    await addExpenseRequest(db, { ...f, amount: 1, currency: 'TRY', createdAt: inside });
    const collection = await db.collection.findFirstOrThrow({ where: { tenantId: tenant.tenantId, caseId: f.caseId } });
    await db.ledgerEntry.create({ data: { tenantId: tenant.tenantId, caseId: f.caseId, collectionId: collection.id, entryType: 'PAYMENT', status: 'CONFIRMED', amount: 1000, currency: 'USD',
      entryDate: inside, effectiveDate: inside, allocations: { create: { claimItemId: interest.id, amount: 50, allocationOrder: 0 } } } });
    const r = await create(f); expect(r.status).toBe(201);
    const usd = r.body.documents.find((d: any) => d.currency === 'USD').render, tl = r.body.documents.find((d: any) => d.currency === 'TRY').render;
    expect(usd.closingBalance).toBe('1000'); expect(tl.closingBalance).toBe('0');
    const credit = usd.lines.filter((l: any) => l.credit !== '0'); expect(credit.map((l: any) => l.credit).sort()).toEqual(['50', '950']);
    expect(credit.find((l: any) => l.credit === '50').label).toContain('faiz'); expect(tl.lines.every((l: any) => l.credit === '0')).toBe(true);
  });

  it('trusted monthly generation rejects a cross-tenant CaseClient edge before projecting any currency', async () => {
    const f = await seed(); const foreignClient = await createClient(db, foreign.tenantId, `foreign-${suffix}-${++seq}`);
    const foreignCase = await createCase(db, { tenantId: foreign.tenantId, clientId: foreignClient, userId: foreign.userId, fileNumber: `E2-foreign-${suffix}-${seq}`, currency: 'USD' });
    await linkClient(db, foreignCase, f.clientId, tenant.userId);
    const old = await counts();
    await expect(native.ensureMonthly(tenant.tenantId, f.clientId, period.periodStart, period.periodEnd)).rejects.toThrow('E2_SOURCE_PARENT_NOT_PROVEN');
    expect(await counts()).toEqual(old); expect(mail).not.toHaveBeenCalled();
  });

  it('a manual native TRY set with E2 off does not activate E2 or suppress the accepted legacy H6 delivery', async () => {
    const f = await seed({ amounts: false }); await addExpenseRequest(db, { ...f, amount: 20, currency: 'TRY', createdAt: inside });
    const made = await create(f); expect(made.status).toBe(201); expect(made.body.documents.map((d: any) => d.currency)).toEqual(['TRY']);
    expect(mail).not.toHaveBeenCalled(); expect(nativeMonthly.isEnabled()).toBe(false);
    const result = await monthly.runMonthlyDelivery(RUN_AT, { tenantId: tenant.tenantId, clientId: f.clientId }); expect(result.targets[0].outcome).toBe('DELIVERED');
    expect(await db.clientStatementNativeDelivery.count({ where: { clientId: f.clientId } })).toBe(0);
    expect(await db.clientStatementDeliveryLedger.count({ where: { clientId: f.clientId, status: 'SENT' } })).toBe(1); expect(mail).toHaveBeenCalledTimes(1);
  });
});
