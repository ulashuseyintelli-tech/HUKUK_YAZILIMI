import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import * as nodemailer from 'nodemailer';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { createTenantWithUser, createClient, createCase, linkClient, cleanupTenant, type TenantFixture } from '../../../../test/client-currency-fixture';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OfficeService } from '../../office/office.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { CaseBalanceService } from '../../interest-engine/orchestration/case-balance.service';
import { ClientNotificationService } from '../../client-notification/client-notification.service';
import { NotificationDispatcherService } from '../../client-notification/notification-dispatcher.service';
import { MessageTemplateService } from '../../message-template/message-template.service';
import { ClientStatementController } from '../client-statement.controller';
import { ClientStatementService } from '../client-statement.service';
import { ClientStatementPdfService } from '../client-statement-pdf.service';
import { ClientStatementNotificationDeliveryAdapter } from '../client-statement-notification-delivery.adapter';
import { ClientStatementPrismaDeliveryLedgerAdapter } from '../client-statement-prisma-delivery-ledger.adapter';
import { ClientStatementMonthlyDeliveryService, CLIENT_STATEMENT_DELIVERY_PORT, CLIENT_STATEMENT_DELIVERY_LEDGER_PORT } from '../client-statement-monthly-delivery.service';
import { buildMonthlyStatementDedupeKey, resolvePreviousMonthPeriod } from '../client-statement-monthly-period';

// Only the external SMTP transport is substituted. HTTP, DB, both ledgers, actual
// action/relationship policies, template rendering and the PDF renderer are real.
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('CL-R07 requires disposable TEST_DATABASE_URL in CI; SKIP is not acceptance');
const describeDb = url ? describe : describe.skip;

class DbIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const actor = await this.db().user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
    if (!actor?.isActive) throw new UnauthorizedException();
    req.user = actor; return true;
  }
}

describeDb('CL-R07 monthly PDF safe retry and reconciliation (real HTTP / disposable DB)', () => {
  jest.setTimeout(120_000);
  let db: PrismaClient, app: INestApplication, tenant: TenantFixture, foreign: TenantFixture;
  let audit: AuditService, monthly: ClientStatementMonthlyDeliveryService;
  let lawyerId: string;
  const suffix = randomUUID().slice(0, 8);
  let seq = 0, configured = true;
  const mail = jest.fn();
  const office = { getFullSmtpSettings: jest.fn(async () => configured ? { smtpHost: 'smtp.example.test', smtpUser: 'disposable@example.test', smtpPass: 'test-only' } : {}),
    getOfficeIdentity: jest.fn(async () => ({ name: 'CI CL-R07' })), getSmtpSettings: async () => ({ smtpHost: 'smtp.example.test' }),
    getSmsSettings: async () => ({}), getGreetingSettings: async () => ({}), getEscalationSettings: async () => ({}) };
  const saved = process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;

  beforeAll(async () => {
    process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'false';
    db = new PrismaClient({ datasources: { db: { url } } }); await db.$connect();
    audit = new AuditService(db as any);
    const approval = new OfficeApprovalService(db as any, audit);
    const module = await Test.createTestingModule({ controllers: [ClientStatementController], providers: [
      ClientStatementService, ClientStatementMonthlyDeliveryService, ClientStatementPdfService,
      ClientStatementNotificationDeliveryAdapter, ClientStatementPrismaDeliveryLedgerAdapter,
      ClientNotificationService, NotificationDispatcherService, MessageTemplateService,
      { provide: PrismaService, useValue: db }, { provide: AuditService, useValue: audit },
      { provide: OfficeService, useValue: office }, { provide: OfficeApprovalService, useValue: approval },
      { provide: CaseBalanceService, useValue: {} },
      { provide: CLIENT_STATEMENT_DELIVERY_PORT, useExisting: ClientStatementNotificationDeliveryAdapter },
      { provide: CLIENT_STATEMENT_DELIVERY_LEDGER_PORT, useExisting: ClientStatementPrismaDeliveryLedgerAdapter },
    ] }).overrideGuard(AuthGuard('jwt')).useValue(new DbIdentityGuard(() => db)).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); monthly = module.get(ClientStatementMonthlyDeliveryService);
    tenant = await createTenantWithUser(db, suffix, 'clr07'); foreign = await createTenantWithUser(db, suffix, 'foreign');
    lawyerId = (await db.lawyer.create({ data: { tenantId: tenant.tenantId, userId: tenant.userId, name: 'CI', surname: 'Partner', lawyerRank: 'PARTNER' } })).id;
    await db.messageTemplate.create({ data: { tenantId: tenant.tenantId, code: 'STATEMENT_READY', name: 'CI monthly', category: 'STATEMENT_READY', channel: 'EMAIL',
      subject: '{{clientName}} — {{periodEnd}}', body: 'Ekstre {{closingBalance}} · {{lineCount}}' } });
  });
  beforeEach(() => {
    process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'true'; configured = true;
    mail.mockReset().mockResolvedValue({ messageId: 'test-only' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: mail });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (saved === undefined) delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY; else process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = saved;
    await app?.close();
    for (const t of [tenant, foreign]) if (t) await cleanupTenant(db, t.tenantId);
    await db?.$disconnect();
  });

  async function seed(options: { notification?: 'NONE' | 'FAILED' | 'PENDING' | 'SENT'; attempts?: number; status?: 'FAILED' | 'PENDING' | 'SENT'; old?: boolean } = {}) {
    const clientId = await createClient(db, tenant.tenantId, `retry-${suffix}-${++seq}`, `client-${seq}@example.test`);
    const caseId = await createCase(db, { tenantId: tenant.tenantId, clientId, userId: tenant.userId, fileNumber: `CLR07-${suffix}-${seq}`, currency: 'TRY' });
    await linkClient(db, caseId, clientId, tenant.userId); await db.caseLawyer.create({ data: { caseId, lawyerId } });
    const period = resolvePreviousMonthPeriod(options.old ? new Date('2026-04-15T12:00:00Z') : new Date());
    const statement = await db.clientStatement.create({ data: { tenantId: tenant.tenantId, clientId, ...periodFields(period), openingBalance: 100, closingBalance: 250,
      generatedById: tenant.userId, lines: { create: { caseId, lineDate: period.periodStart, lineType: 'CASE_COLLECTION_PAYABLE', debit: 0, credit: 150, runningBalance: 250 } } } });
    const key = buildMonthlyStatementDedupeKey(statement.id, period.periodKey);
    const ledger = await db.clientStatementDeliveryLedger.create({ data: { tenantId: tenant.tenantId, clientId, statementId: statement.id, periodKey: period.periodKey,
      recipientEmail: `client-${seq}@example.test`, dedupeKey: key, status: options.status ?? 'FAILED', attempts: options.attempts ?? 0,
      reservedAt: options.status === 'PENDING' ? new Date(0) : null, nextRetryAt: new Date(0), sentAt: options.status === 'SENT' ? new Date() : null } });
    const notification = options.notification && options.notification !== 'NONE' ? await db.clientNotification.create({ data: { tenantId: tenant.tenantId, clientId,
      channel: 'EMAIL', type: 'STATEMENT_READY', body: 'prior attempt', status: options.notification, dedupeKey: key, sentById: tenant.userId,
      sentAt: options.notification === 'SENT' ? new Date() : null } }) : null;
    return { statement, ledger, notification, clientId, caseId, key };
  }
  const periodFields = (p: ReturnType<typeof resolvePreviousMonthPeriod>) => ({ periodStart: p.periodStart, periodEnd: p.periodEnd });
  const post = (id: string, userId = tenant.userId, body: object = {}) => request(app.getHttpServer()).post(`/client-statements/${id}/monthly-delivery/retry`).set('x-test-user-id', userId).send(body);
  const state = async (f: Awaited<ReturnType<typeof seed>>) => ({ ledger: await db.clientStatementDeliveryLedger.findUnique({ where: { id: f.ledger.id } }),
    notifications: await db.clientNotification.findMany({ where: { tenantId: tenant.tenantId, dedupeKey: f.key }, orderBy: { id: 'asc' } }),
    audits: await db.auditLog.findMany({ where: { tenantId: tenant.tenantId, entityId: f.statement.id }, orderBy: { id: 'asc' } }) });
  async function noWrite(f: Awaited<ReturnType<typeof seed>>, run: () => PromiseLike<request.Response>, status: number) {
    const render = jest.spyOn(app.get(ClientStatementPdfService), 'render'), renderCount = render.mock.calls.length;
    const before = await state(f); const result = await run(); expect(result.status).toBe(status);
    expect(await state(f)).toEqual(before); expect(mail).not.toHaveBeenCalled(); expect(render).toHaveBeenCalledTimes(renderCount); return result;
  }

  it('SMTP missing → FAILED; after readiness and due time, SAME notification + key + real PDF succeed once', async () => {
    const f = await seed(); configured = false;
    const render = jest.spyOn(app.get(ClientStatementPdfService), 'render');
    const immutable = await db.clientStatement.findUnique({ where: { id: f.statement.id }, include: { lines: true } });
    const first = await post(f.statement.id); expect(first.status).toBe(201); expect(first.body.target.outcome).toBe('FAILED');
    const failed = await state(f); expect(failed.notifications).toHaveLength(1); expect(failed.notifications[0].status).toBe('FAILED'); expect(mail).not.toHaveBeenCalled();
    configured = true;
    expect((await post(f.statement.id)).body.target.reason).toBe('retry-not-due');
    // Advance only the disposable fixture's due timestamp; the production delay is separately asserted above.
    await db.clientStatementDeliveryLedger.update({ where: { id: f.ledger.id }, data: { nextRetryAt: new Date(0) } });
    const second = await post(f.statement.id, tenant.userId, { recipientEmail: 'attacker@example.test', tokens: { clientName: 'tamper' } });
    expect(second.body.target.outcome).toBe('DELIVERED'); expect(mail).toHaveBeenCalledTimes(1);
    const after = await state(f); expect(after.ledger?.status).toBe('SENT'); expect(after.ledger?.attempts).toBe(2);
    expect(after.notifications).toHaveLength(1); expect(after.notifications[0].id).toBe(failed.notifications[0].id); expect(after.notifications[0].dedupeKey).toBe(f.key);
    const delivered = mail.mock.calls[0][0]; expect(delivered.to).toBe(f.ledger.recipientEmail); expect(delivered.attachments).toHaveLength(1);
    expect(delivered.attachments[0].content.subarray(0, 4).toString()).toBe('%PDF'); expect(delivered.attachments[0].filename).not.toContain(f.statement.id);
    expect(Buffer.compare(delivered.attachments[0].content, await render.mock.results[render.mock.results.length - 1].value)).toBe(0);
    expect(await db.clientStatement.findUnique({ where: { id: f.statement.id }, include: { lines: true } })).toEqual(immutable);
    expect(JSON.stringify(after)).not.toContain('attacker@example.test'); expect(JSON.stringify(after)).not.toContain('test-only');
    expect((await post(f.statement.id)).body.target.outcome).toBe('RECONCILED'); expect(mail).toHaveBeenCalledTimes(1);
  });

  it('definitive SMTP 550 can retry the SAME failed row; no duplicate successful send', async () => {
    const f = await seed(); mail.mockRejectedValueOnce(Object.assign(new Error('private diagnostic'), { responseCode: 550 }));
    expect((await post(f.statement.id)).body.target.outcome).toBe('FAILED'); const first = await state(f); expect(first.notifications[0].status).toBe('FAILED');
    await db.clientStatementDeliveryLedger.update({ where: { id: f.ledger.id }, data: { nextRetryAt: new Date(0) } });
    expect((await post(f.statement.id)).body.target.outcome).toBe('DELIVERED'); expect(mail).toHaveBeenCalledTimes(2);
    expect((await state(f)).notifications[0].id).toBe(first.notifications[0].id);
  });

  it.each([undefined, 451])('ambiguous provider failure %s stays PENDING and never resends after lease expiry', async responseCode => {
    const f = await seed(); mail.mockRejectedValueOnce(Object.assign(new Error('ECONNRESET'), { responseCode }));
    expect((await post(f.statement.id)).body.target.outcome).toBe('RECONCILIATION_REQUIRED'); expect(mail).toHaveBeenCalledTimes(1);
    await db.clientStatementDeliveryLedger.update({ where: { id: f.ledger.id }, data: { reservedAt: new Date(0) } });
    const before = await state(f); expect(before.notifications[0].status).toBe('PENDING');
    expect((await post(f.statement.id)).body.target.outcome).toBe('RECONCILIATION_REQUIRED'); expect(await state(f)).toEqual(before); expect(mail).toHaveBeenCalledTimes(1);
  });

  it('notification SENT stamp failure after provider acceptance is uncertain, never a retryable FAILED', async () => {
    const f = await seed(); const update = db.clientNotification.update.bind(db.clientNotification);
    jest.spyOn(db.clientNotification, 'update').mockImplementation((args: any) => args.data.status === 'SENT' ? Promise.reject(new Error('stamp failure')) as any : update(args));
    expect((await post(f.statement.id)).body.target.outcome).toBe('RECONCILIATION_REQUIRED');
    expect((await state(f)).notifications[0].status).toBe('PENDING'); expect(mail).toHaveBeenCalledTimes(1);
    expect((await post(f.statement.id)).body.target.outcome).toBe('RECONCILIATION_REQUIRED'); expect(mail).toHaveBeenCalledTimes(1);
  });

  it('durable SENT reconciles even an exhausted ledger WITHOUT transport, PDF rendering or attempt reset', async () => {
    const f = await seed({ notification: 'SENT', attempts: 3 }); const before = await state(f);
    const render = jest.spyOn(app.get(ClientStatementPdfService), 'render');
    expect((await post(f.statement.id)).body.target.outcome).toBe('RECONCILED'); const after = await state(f);
    expect(after.ledger?.status).toBe('SENT'); expect(after.ledger?.attempts).toBe(3); expect(after.notifications).toEqual(before.notifications);
    expect(after.audits).toHaveLength(1); expect(render).not.toHaveBeenCalled(); expect(mail).not.toHaveBeenCalled();
    expect((await db.clientStatement.findUnique({ where: { id: f.statement.id } }))).toEqual(f.statement);
  });

  it.each(['CLAIMED', 'RECONCILED'])('audit failure rolls back %s and cannot start transport', async outcome => {
    const f = await seed({ notification: outcome === 'RECONCILED' ? 'SENT' : 'FAILED' });
    const log = audit.logInTransaction.bind(audit);
    jest.spyOn(audit, 'logInTransaction').mockImplementation((tx, input) => input.newValues?.deliveryOutcome === outcome ? Promise.reject(new Error('audit injection')) : log(tx, input));
    const before = await state(f); const result = await post(f.statement.id);
    expect(['FAILED', 'RECONCILIATION_REQUIRED']).toContain(result.body.target.outcome); expect(await state(f)).toEqual(before); expect(mail).not.toHaveBeenCalled();
  });

  it('two concurrent requests keep one notification and one successful provider call', async () => {
    const f = await seed({ notification: 'FAILED' }); const results = await Promise.all([post(f.statement.id), post(f.statement.id)]);
    expect(results.every(r => r.status === 201)).toBe(true); expect(mail).toHaveBeenCalledTimes(1);
    const after = await state(f); expect(after.notifications).toHaveLength(1); expect(after.ledger?.status).toBe('SENT'); expect(after.ledger?.attempts).toBe(1);
  });

  it('the existing monthly run reuses its snapshot and reclaims the exact FAILED notification', async () => {
    const f = await seed({ notification: 'FAILED' });
    const before = await db.clientStatement.count({ where: { tenantId: tenant.tenantId, clientId: f.clientId } });
    const result = await monthly.runMonthlyDelivery(new Date(), { tenantId: tenant.tenantId, clientId: f.clientId });
    expect(result.targets[0].outcome).toBe('DELIVERED'); expect(result.targets[0].statementSource).toBe('REUSED');
    expect(mail).toHaveBeenCalledTimes(1); expect((await state(f)).notifications[0].id).toBe(f.notification!.id);
    expect(await db.clientStatement.count({ where: { tenantId: tenant.tenantId, clientId: f.clientId } })).toBe(before);
  });

  it('post-send ledger audit failure leaves durable SENT proof for a later send-free reconciliation', async () => {
    const f = await seed({ notification: 'FAILED' }); const log = audit.logInTransaction.bind(audit);
    const spy = jest.spyOn(audit, 'logInTransaction').mockImplementation((tx, input) => input.newValues?.deliveryOutcome === 'SENT'
      ? Promise.reject(new Error('post-send audit injection')) : log(tx, input));
    expect((await post(f.statement.id)).body.target.outcome).toBe('RECONCILIATION_REQUIRED');
    const uncertain = await state(f); expect(uncertain.notifications[0].status).toBe('SENT'); expect(uncertain.ledger?.status).toBe('PENDING');
    expect(uncertain.audits.some(a => (a.newValues as any)?.deliveryOutcome === 'SENT')).toBe(false); expect(mail).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect((await post(f.statement.id)).body.target.outcome).toBe('RECONCILED');
    expect((await state(f)).ledger?.attempts).toBe(1); expect(mail).toHaveBeenCalledTimes(1);
  });

  it('old-month recovery uses the persisted period and immutable snapshot, not current previous month', async () => {
    const f = await seed({ notification: 'FAILED', old: true });
    expect((await post(f.statement.id)).body.target.outcome).toBe('DELIVERED'); expect(mail).toHaveBeenCalledTimes(1);
    expect((await state(f)).ledger?.periodKey).toBe('2026-03');
  });

  it.each(['due', 'exhausted', 'fresh-lease'])('%s guard performs no write and no provider call', async kind => {
    const f = await seed({ notification: 'NONE', status: kind === 'fresh-lease' ? 'PENDING' : 'FAILED', attempts: kind === 'exhausted' ? 3 : 1 });
    await db.clientStatementDeliveryLedger.update({ where: { id: f.ledger.id }, data: kind === 'due' ? { nextRetryAt: new Date(Date.now() + 3_600_000) } : kind === 'fresh-lease' ? { reservedAt: new Date() } : {} });
    const result = await noWrite(f, () => post(f.statement.id), 201); expect(result.body.target.outcome).toBe('SKIPPED_LEDGER_CLAIM_LOST');
  });

  it.each(['duplicate', 'wrong-client', 'wrong-channel', 'sent-without-stamp', 'ledger-disagrees'])('%s evidence blocks recovery without a latest-row guess', async kind => {
    const f = await seed({ notification: 'FAILED', status: kind === 'ledger-disagrees' ? 'SENT' : 'FAILED' });
    if (kind === 'duplicate') await db.clientNotification.create({ data: { tenantId: tenant.tenantId, clientId: f.clientId, type: 'STATEMENT_READY', channel: 'EMAIL', status: 'SENT', sentAt: new Date(), dedupeKey: f.key, body: 'duplicate', sentById: tenant.userId } });
    if (kind === 'wrong-client') { const other = await createClient(db, tenant.tenantId, `other-${++seq}`); await db.clientNotification.update({ where: { id: f.notification!.id }, data: { clientId: other } }); }
    if (kind === 'wrong-channel') await db.clientNotification.update({ where: { id: f.notification!.id }, data: { channel: 'SMS' } });
    if (kind === 'sent-without-stamp') await db.clientNotification.update({ where: { id: f.notification!.id }, data: { status: 'SENT', sentAt: null } });
    const result = await noWrite(f, () => post(f.statement.id), 201); expect(result.body.target.outcome).toBe('RECONCILIATION_REQUIRED');
  });

  it('recipient change is visible and cannot silently retarget the original delivery', async () => {
    const f = await seed({ notification: 'FAILED' }); await db.client.update({ where: { id: f.clientId }, data: { email: 'changed@example.test' } });
    const result = await noWrite(f, () => post(f.statement.id), 201); expect(result.body.target.reason).toBe('recipient-scope-changed');
  });
  it('multiple ledger identities for one statement cannot be resolved by an arbitrary first row', async () => {
    const f = await seed({ notification: 'FAILED' });
    await db.clientStatementDeliveryLedger.create({ data: { tenantId: tenant.tenantId, clientId: f.clientId, statementId: f.statement.id,
      periodKey: '2000-01', dedupeKey: `invalid-other-period:${f.statement.id}`, recipientEmail: f.ledger.recipientEmail, status: 'FAILED', attempts: 1 } });
    await noWrite(f, () => post(f.statement.id), 404);
  });
  it('recipient changing after claim but before transport is rejected by the shared sender', async () => {
    const f = await seed({ notification: 'FAILED' }); office.getOfficeIdentity.mockImplementationOnce(async () => {
      await db.client.update({ where: { id: f.clientId }, data: { email: 'late-change@example.test' } }); return { name: 'CI CL-R07' };
    });
    expect((await post(f.statement.id)).body.target.outcome).toBe('FAILED'); expect(mail).not.toHaveBeenCalled();
  });

  it.each(['foreign', 'viewer', 'admin-only', 'unrelated', 'inactive-profile', 'wrong-period', 'void', 'missing-ledger'])('%s cannot mutate or send', async kind => {
    const f = await seed({ notification: 'FAILED' }); let actorId = tenant.userId, expected = 404;
    if (kind === 'foreign') actorId = foreign.userId;
    if (kind === 'viewer') { await db.user.update({ where: { id: actorId }, data: { role: 'VIEWER' } }); expected = 403; }
    if (kind === 'admin-only' || kind === 'unrelated' || kind === 'foreign') {
      const t = kind === 'foreign' ? foreign : tenant;
      actorId = (await db.user.create({ data: { tenantId: t.tenantId, role: 'ADMIN', email: `actor-${suffix}-${++seq}@example.test`, name: 'CI', surname: 'Actor' } })).id;
      if (kind !== 'admin-only') await db.lawyer.create({ data: { tenantId: t.tenantId, userId: actorId, name: 'CI', surname: 'Other', lawyerRank: 'PARTNER' } }); else expected = 403;
    }
    if (kind === 'inactive-profile') await db.lawyer.update({ where: { id: lawyerId }, data: { isActive: false } });
    if (kind === 'wrong-period') await db.clientStatementDeliveryLedger.update({ where: { id: f.ledger.id }, data: { periodKey: '2000-01' } });
    if (kind === 'void') await db.clientStatement.update({ where: { id: f.statement.id }, data: { status: 'VOID' } });
    if (kind === 'missing-ledger') await db.clientStatementDeliveryLedger.delete({ where: { id: f.ledger.id } });
    try { await noWrite(f, () => post(f.statement.id, actorId), expected); }
    finally { await db.user.update({ where: { id: tenant.userId }, data: { role: 'ADMIN' } }); await db.lawyer.update({ where: { id: lawyerId }, data: { isActive: true } }); }
  });

  it('disabled monthly flag never writes or starts transport', async () => {
    const f = await seed({ notification: 'FAILED' }); process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'false';
    expect((await noWrite(f, () => post(f.statement.id), 201)).body).toEqual({ enabled: false, target: null });
  });

  it('operator projection distinguishes unknown from proven SENT and does not expose recipients or payloads', async () => {
    const pending = await seed({ notification: 'PENDING' }), sent = await seed({ notification: 'SENT' });
    const before = await state(pending), service = app.get(ClientNotificationService);
    const view = await service.getNotificationOverview(tenant.tenantId, undefined, tenant.userId);
    expect(view.monthlyDeliveries.find(r => r.statementId === pending.statement.id)).toMatchObject({ state: 'RECONCILIATION_REQUIRED', canRecover: false });
    expect(view.monthlyDeliveries.find(r => r.statementId === sent.statement.id)).toMatchObject({ state: 'RECONCILE_SENT', canRecover: true });
    expect(JSON.stringify(view.monthlyDeliveries)).not.toContain('@example.test'); expect(JSON.stringify(view.monthlyDeliveries)).not.toContain('prior attempt');
    expect(await state(pending)).toEqual(before); expect(mail).not.toHaveBeenCalled();
  });
});
