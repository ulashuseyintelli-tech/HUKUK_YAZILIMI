jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('unused renderer'); } }));

import { CanActivate, ExecutionContext, INestApplication, Logger, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as net from 'node:net';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CpeRequiredGuard } from '../../policy-engine';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeApprovalController } from '../../office-approval/office-approval.controller';
import { ExpenseSendApprovalService } from '../../client-notification/expense-send-approval.service';
import { ClientNotificationService } from '../../client-notification/client-notification.service';
import { ClientNotificationModule } from '../../client-notification/client-notification.module';
import { OfficeService } from '../../office/office.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { StorageModule } from '../../../common/storage/storage.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { ClientNotificationController } from '../../client-notification/client-notification.controller';
import { ClientNotificationHistoryAccessService } from '../../client-notification/client-notification-history-access.service';
import { ClientNotificationAuthorityAdapter } from '../../client-notification/client-notification-authority.adapter';
import { NotificationDispatcherService } from '../../client-notification/notification-dispatcher.service';
import { NotificationDispatchController } from '../../client-notification/notification-dispatch.controller';
import { MessageTemplateService } from '../../message-template/message-template.service';
import { CaseService } from '../../case/case.service';
import { ExpenseRequestController } from '../expense-request.controller';
import { ExpenseRequestService } from '../expense-request.service';
import { ExpenseNotificationService } from '../expense-notification.service';
import { ExpenseGateService } from '../expense-gate.service';
import { ExpenseViewService } from '../expense-view.service';
import { ExpenseCalculatorService } from '../expense-calculator.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('EXPENSE-SEND-APPROVAL: disposable TEST_DATABASE_URL is required in CI');
const dbDescribe = url ? describe : describe.skip;

/** Real HTTP/controllers + Prisma transactions + loopback SMTP. No external delivery or live DB.
 * Unrelated CPE case-state evaluation is replaced; 3a actor, object, approval, transport and audit gates are real.
 */
dbDescribe('3a/T-3 expense pre-send approval (HTTP + disposable DB + isolated SMTP)', () => {
  jest.setTimeout(120_000);
  let db: PrismaClient, app: INestApplication, audit: AuditService, expenses: ExpenseRequestService;
  let tenantId: string, otherTenantId: string, caseId: string, clientId: string, port: number;
  const ids: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 8);
  const sockets = new Set<net.Socket>();
  let smtpMode: 'accept' | 'reject' | 'uncertain' = 'accept';
  let attempts = 0;
  const smtp = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => undefined);
    let buffer = '', data = false, auth = 0;
    const reply = (s: string) => socket.write(s + '\r\n');
    reply('220 localhost ESMTP');
    socket.on('data', chunk => {
      buffer += chunk.toString();
      let end: number;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2); const upper = line.toUpperCase();
        if (data) {
          if (line === '.') { data = false; attempts++; if (smtpMode === 'uncertain') socket.destroy(); else reply('250 accepted'); }
        } else if (auth) { if (auth === 1) { auth = 2; reply('334 UGFzc3dvcmQ6'); } else { auth = 0; reply('235 authenticated'); } }
        else if (upper.startsWith('EHLO')) { socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n'); }
        else if (upper.startsWith('AUTH PLAIN')) reply('235 authenticated');
        else if (upper.startsWith('AUTH LOGIN')) { auth = 1; reply('334 VXNlcm5hbWU6'); }
        else if (upper.startsWith('RCPT TO:') && smtpMode === 'reject') reply('550 rejected (isolated test)');
        else if (upper === 'DATA') { data = true; reply('354 send data'); }
        else if (upper === 'QUIT') { reply('221 bye'); socket.end(); }
        else reply('250 ok');
      }
    });
  });

  const post = (actor: string, path: string, body: object = {}) => request(app.getHttpServer()).post(path).set('x-test-user-id', ids[actor] ?? actor).send(body);
  const makeExpense = async () => (await db.expenseRequest.create({ data: {
    tenantId, caseId, clientId, createdById: ids.REQUESTER, totalAmount: 100, currency: 'TRY', gateType: 'NON_BLOCKING',
    requestItems: { create: { itemCode: 'TEBLIGAT', label: 'Tebligat gideri', suggestedAmount: 100, finalAmount: 100, sortOrder: 0 } },
  } })).id;
  const send = (id: string, actor = 'REQUESTER') => post(actor, `/expense-requests/${id}/send-email`);
  const requestApproval = async (id: string) => {
    const response = await send(id); expect(response.status).toBe(201); expect(response.body.approvalRequired).toBe(true);
    return response.body.approvalRequestId as string;
  };
  const approve = (id: string, actor = 'APPROVER') => post(actor, `/office-approvals/${id}/approve`);
  const approved = async (id: string) => { const approvalId = await requestApproval(id); expect((await approve(approvalId)).status).toBe(201); return approvalId; };
  const state = async (id: string) => ({
    expense: await db.expenseRequest.findUnique({ where: { id } }),
    audits: await db.expenseAuditLog.findMany({ where: { expenseRequestId: id }, orderBy: { id: 'asc' } }),
    notifications: await db.clientNotification.count({ where: { tenantId } }),
    approvals: await db.officeApprovalRequest.count({ where: { tenantId, targetRef: id } }),
    attempts,
  });

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } }); await db.$connect();
    port = await new Promise<number>(resolve => smtp.listen(0, '127.0.0.1', () => resolve((smtp.address() as net.AddressInfo).port)));
    tenantId = (await db.tenant.create({ data: { name: `3a-${suffix}`, slug: `3a-${suffix}` } })).id;
    otherTenantId = (await db.tenant.create({ data: { name: `3a-other-${suffix}`, slug: `3a-other-${suffix}` } })).id;
    const account = async (key: string, role: 'ADMIN' | 'USER' | 'VIEWER', tckn?: string, rank = 'LAWYER', tenant = tenantId, staff = false) => {
      const user = await db.user.create({ data: { tenantId: tenant, email: `${key}-${suffix}@example.test`, name: key, surname: '3a', role } }); ids[key] = user.id;
      if (staff) await db.staffMember.create({ data: { tenantId: tenant, userId: user.id, firstName: key, lastName: '3a', staffType: 'SEKRETER', tckn } });
      else if (tckn) await db.lawyer.create({ data: { tenantId: tenant, userId: user.id, name: key, surname: '3a', tckn, lawyerRank: rank as never } });
    };
    await account('REQUESTER', 'USER', '10000000146');
    await account('SAME_PERSON', 'USER', '10000000146', 'PARTNER');
    await account('APPROVER', 'USER', '20000000046', 'PARTNER');
    await account('VIEWER', 'VIEWER', '30000000014', 'PARTNER');
    await account('ADMIN', 'ADMIN');
    await account('UNRELATED', 'USER', '30000000014');
    await account('STAFF', 'USER', '30000000014', 'LAWYER', tenantId, true);
    await account('MANAGER', 'USER', '30000000014', 'MANAGER');
    await account('FOREIGN', 'USER', '30000000014', 'PARTNER', otherTenantId);
    clientId = (await db.client.create({ data: { tenantId, type: 'COMPANY', displayName: '3a client', email: 'recipient@example.test' } })).id;
    caseId = (await db.case.create({ data: { tenantId, fileNumber: `3a-${suffix}`, type: 'GENERAL_EXECUTION', clientId } })).id;
    await db.caseClient.create({ data: { caseId, clientId } });
    for (const key of ['REQUESTER', 'SAME_PERSON', 'APPROVER', 'VIEWER', 'MANAGER']) {
      const lawyer = await db.lawyer.findUniqueOrThrow({ where: { userId: ids[key] } });
      await db.caseLawyer.create({ data: { caseId, lawyerId: lawyer.id } });
    }
    const staff = await db.staffMember.findUniqueOrThrow({ where: { userId: ids.STAFF } });
    await db.caseStaff.create({ data: { caseId, staffMemberId: staff.id, roleOnCase: 'OPERATION', canView: true } });
    await db.office.create({ data: { tenantId, name: '3a Office', bankAccounts: { create: { bankName: 'Test', accountName: '3a Office', iban: 'TR000000000000000000000001', isDefault: true } } } });
    await db.messageTemplate.create({ data: { tenantId, code: 'EXPENSE_REQUEST', name: '3a', category: 'EXPENSE_REQUEST', subject: '{{caseFileNumber}} - Masraf', body: '{{items}}\n{{totalAmount}}\n{{dueDate}}\n{{officeIban}}' } });
    const prisma = db as unknown as PrismaService;
    audit = new AuditService(prisma);
    const approval = new OfficeApprovalService(prisma, audit);
    const gate = new ExpenseSendApprovalService(prisma, approval, audit);
    const office = { getFullSmtpSettings: async () => ({ smtpHost: '127.0.0.1', smtpPort: port, smtpUser: 'fixture@example.test', smtpPass: 'disposable-only', smtpSecure: false }) };
    const transport = new ClientNotificationService(prisma, office as never, gate);
    const dispatcher = new NotificationDispatcherService(prisma, transport, new MessageTemplateService(prisma), gate);
    const notification = new ExpenseNotificationService(prisma, {} as never, new ConfigService({
      BANK_IBAN: 'TR000000000000000000000001', BANK_ACCOUNT_HOLDER: '3a Office', BANK_NAME: 'Synthetic Bank', BANK_BRANCH: 'Test',
    }), dispatcher);
    expenses = new ExpenseRequestService(prisma, {} as never, {} as never, notification, dispatcher, office as never, undefined, undefined, undefined, approval, gate);
    const identity: CanActivate = { canActivate: async (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest(); const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
      if (!user?.isActive) throw new UnauthorizedException(); req.user = user; return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [ExpenseRequestController, OfficeApprovalController, ClientNotificationController, NotificationDispatchController],
      providers: [
        { provide: ExpenseRequestService, useValue: expenses }, { provide: ExpenseNotificationService, useValue: notification },
        { provide: ExpenseGateService, useValue: {} }, { provide: ExpenseViewService, useValue: {} }, { provide: ExpenseCalculatorService, useValue: {} },
        { provide: OfficeApprovalService, useValue: approval }, { provide: ClientNotificationService, useValue: transport },
        { provide: NotificationDispatcherService, useValue: dispatcher }, { provide: PrismaService, useValue: prisma },
        { provide: ClientNotificationHistoryAccessService, useValue: {} },
        { provide: ClientNotificationAuthorityAdapter, useValue: new ClientNotificationAuthorityAdapter(approval, audit) },
      ],
    }).overrideGuard(JwtAuthGuard).useValue(identity).overrideGuard(AuthGuard('jwt')).useValue(identity)
      .overrideGuard(CpeRequiredGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close(); sockets.forEach(socket => socket.destroy()); await new Promise<void>(resolve => smtp.close(() => resolve()));
    await db?.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId].filter(Boolean) } } });
    await db?.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId].filter(Boolean) } } }); await db?.$disconnect();
  });
  afterEach(() => { smtpMode = 'accept'; jest.restoreAllMocks(); });

  it('first send creates one pending OfficeApproval, no email/SENT/task; distribution axis remains pending', async () => {
    const id = await makeExpense(), before = attempts; const approvalId = await requestApproval(id);
    expect(await requestApproval(id)).toBe(approvalId); expect(attempts).toBe(before);
    const row = await db.expenseRequest.findUniqueOrThrow({ where: { id } }); expect(row.status).toBe('PENDING'); expect(row.expenseApprovalStatus).toBe('PENDING_APPROVAL');
    expect(await db.expenseAuditLog.count({ where: { expenseRequestId: id } })).toBe(0);
    expect(await db.officeApprovalRequest.count({ where: { tenantId, targetRef: id } })).toBe(1);
    const intent = (await db.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalId } })).savedIntent;
    expect(JSON.stringify(intent)).not.toContain('TR000000000000000000000001');
    expect(JSON.stringify(intent)).not.toContain('recipient@example.test');
  });
  it.each(['REQUESTER', 'SAME_PERSON', 'STAFF', 'VIEWER', 'ADMIN', 'MANAGER', 'FOREIGN'])('ineligible/self approver %s cannot consume the request', async actor => {
    const id = await makeExpense(), approvalId = await requestApproval(id), before = await state(id);
    const response = await approve(approvalId, actor); expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await db.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalId } })).status).toBe('PENDING_APPROVAL');
    expect(await state(id)).toEqual(before);
  });
  it.each(['UNRELATED', 'VIEWER', 'ADMIN', 'FOREIGN'])('send requester %s is rejected without data or transport side effects', async actor => {
    const id = await makeExpense(), before = await state(id); expect((await send(id, actor)).status).toBeGreaterThanOrEqual(400); expect(await state(id)).toEqual(before);
  });
  it('independent approval sends once; duplicate and concurrent transport calls have one SMTP delivery, audit and task', async () => {
    const id = await makeExpense(), approvalId = await approved(id), before = attempts;
    const responses = await Promise.all([send(id), send(id)]); expect(responses.every(r => r.status === 201)).toBe(true);
    expect(attempts - before).toBe(1); expect((await send(id)).body.success).toBe(true); expect(attempts - before).toBe(1);
    expect(await db.expenseAuditLog.count({ where: { expenseRequestId: id, action: 'EMAIL_SENT' } })).toBe(1);
    const row = await db.expenseRequest.findUniqueOrThrow({ where: { id } }); expect(row.status).toBe('SENT'); expect(row.expenseApprovalStatus).toBe('PENDING_APPROVAL');
    expect((await db.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalId } })).executionStatus).toBe('SUCCEEDED');
  });
  it.each(['amount', 'item', 'due', 'recipient', 'template'])('changed %s requires fresh approval and does not send with the previous decision', async change => {
    const id = await makeExpense(), old = await approved(id), before = attempts;
    if (change === 'amount') await db.expenseRequest.update({ where: { id }, data: { totalAmount: 101 } });
    if (change === 'item') await db.expenseRequestItem.updateMany({ where: { expenseRequestId: id }, data: { description: 'Changed description' } });
    if (change === 'due') await db.expenseRequest.update({ where: { id }, data: { dueDate: new Date('2027-01-01') } });
    if (change === 'recipient') await db.client.update({ where: { id: clientId }, data: { email: `changed-${id}@example.test` } });
    if (change === 'template') await db.messageTemplate.updateMany({ where: { tenantId, code: 'EXPENSE_REQUEST' }, data: { subject: `Changed ${id}` } });
    const next = await requestApproval(id); expect(next).not.toBe(old); expect(attempts).toBe(before);
  });
  it('inactive profile, revoked approver and wrong parent are refused without send', async () => {
    const id = await makeExpense(), approvalId = await approved(id), before = attempts;
    await db.lawyer.update({ where: { userId: ids.REQUESTER }, data: { isActive: false } });
    expect((await send(id)).status).toBe(404); await db.lawyer.update({ where: { userId: ids.REQUESTER }, data: { isActive: true } });
    await db.lawyer.update({ where: { userId: ids.APPROVER }, data: { lawyerRank: 'LAWYER' } });
    expect((await send(id)).status).toBe(403); await db.lawyer.update({ where: { userId: ids.APPROVER }, data: { lawyerRank: 'PARTNER' } });
    const wrong = await post('APPROVER', '/client-notifications/resend', { clientId: 'wrong', caseId, templateCode: 'EXPENSE_REQUEST', refType: 'ExpenseRequest', refId: id, type: 'MASRAF_ISTEK', tokens: {} });
    expect(wrong.status).toBeGreaterThanOrEqual(400); expect(attempts).toBe(before);
    expect((await db.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalId } })).executionStatus).toBe('NOT_RUN');
  });
  it('reminder cannot be a first-send bypass; raw expense email and legacy status-only calls cannot send or fabricate SENT', async () => {
    const id = await makeExpense(), before = attempts;
    const reminder = await post('REQUESTER', `/expense-requests/${id}/send-reminder`); expect(reminder.body.approvalRequired).toBe(true);
    const raw = await post('APPROVER', '/client-notifications/send-email', { clientId, caseId, type: 'MASRAF_ISTEK', subject: 'Expense', body: 'Pay' }); expect(raw.status).toBe(403);
    const sms = await post('APPROVER', '/client-notifications/send-sms', { clientId, caseId, type: 'MASRAF_ISTEK', body: 'Pay' }); expect(sms.status).toBe(403);
    expect((await post('REQUESTER', `/expense-requests/${id}/send`, { channel: 'EMAIL' })).status).toBe(409);
    expect((await post('REQUESTER', `/expense-requests/${id}/finalize`, { channel: 'EMAIL' })).status).toBe(409);
    expect(attempts).toBe(before); expect((await db.expenseRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
  });
  it('opening automation threads its real initiating actor and returns approval-pending rather than sent', async () => {
    const id = await makeExpense(), before = attempts;
    jest.spyOn(expenses, 'createOpeningExpenseSet').mockResolvedValue({ id } as never);
    const outcome = await (CaseService.prototype as any).runOpeningExpenseAutomation.call({ expenseRequestService: expenses, logger: new Logger('3a-fixture') }, tenantId, caseId, '3a', true, ids.REQUESTER);
    expect(outcome.approvalRequired).toBe(true); expect(attempts).toBe(before);
    const row = await db.officeApprovalRequest.findUniqueOrThrow({ where: { id: outcome.approvalRequestId } }); expect(row.requesterUserId).toBe(ids.REQUESTER);
  });
  it('definitive SMTP failure reuses the same approval and notification; no second business approval', async () => {
    const id = await makeExpense(), approvalId = await approved(id); smtpMode = 'reject';
    expect((await send(id)).body.success).toBe(false);
    expect((await db.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalId } })).executionStatus).toBe('FAILED');
    smtpMode = 'accept'; expect((await send(id)).body.success).toBe(true);
    expect(await db.officeApprovalRequest.count({ where: { tenantId, targetRef: id } })).toBe(1);
    expect(await db.clientNotification.count({ where: { tenantId, dedupeKey: { endsWith: `:${approvalId}` } } })).toBe(1);
  });
  it('uncertain SMTP outcome stays PENDING and is not blindly resent', async () => {
    const id = await makeExpense(), approvalId = await approved(id); smtpMode = 'uncertain';
    expect((await send(id)).body.success).toBe(false); const afterAttempt = attempts;
    smtpMode = 'accept'; expect((await send(id)).body.success).toBe(false); expect(attempts).toBe(afterAttempt);
    expect((await db.clientNotification.findFirstOrThrow({ where: { tenantId, dedupeKey: { endsWith: `:${approvalId}` } } })).status).toBe('PENDING');
  });
  it('audit failure rolls back the approval append and leaves no send/SENT/success audit', async () => {
    const id = await makeExpense(), before = await state(id);
    jest.spyOn(audit, 'logInTransaction').mockRejectedValueOnce(new Error('isolated audit failure'));
    const response = await send(id); expect(response.body.success).not.toBe(true); expect(await state(id)).toEqual(before);
  });
  it('a different send initiator does not let the expense creator approve their own expense', async () => {
    const id = await makeExpense(); await db.expenseRequest.update({ where: { id }, data: { createdById: ids.APPROVER } });
    const approvalId = await requestApproval(id); expect((await approve(approvalId)).status).toBe(400);
    expect((await db.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalId } })).status).toBe('PENDING_APPROVAL');
  });
  it('legacy SENT without a provable content/approval binding cannot be silently resent or backfilled', async () => {
    const id = await makeExpense(); await db.expenseRequest.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
    const before = await state(id); const response = await send(id); expect(response.status).toBe(409); expect(response.body.code).toBe('EXPENSE_SEND_LEGACY_UNBOUND');
    expect(await state(id)).toEqual(before);
  });
  it('public resend cannot supply new expense tokens or avoid the gate by changing the type/ref labels', async () => {
    const id = await makeExpense(), before = await state(id);
    const response = await post('APPROVER', '/client-notifications/resend', { clientId, caseId, templateCode: 'EXPENSE_REQUEST', refType: 'Other', refId: id, type: 'GENEL_BILGILENDIRME', tokens: { totalAmount: '1' } });
    expect(response.status).toBe(403); expect(await state(id)).toEqual(before);
  });
  it('a recipient change at the final transport boundary is refused before SMTP and cannot become SENT', async () => {
    const id = await makeExpense(); await approved(id); const before = attempts;
    const gate = (app.get(ExpenseRequestService) as any).sendApproval as ExpenseSendApprovalService;
    const begin = gate.begin.bind(gate);
    jest.spyOn(gate, 'begin').mockImplementationOnce(async (...args) => {
      await db.client.update({ where: { id: clientId }, data: { email: 'changed-at-boundary@example.test' } });
      return begin(...args);
    });
    expect((await send(id)).status).toBe(409); expect(attempts).toBe(before);
    expect((await db.expenseRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
    expect(await db.expenseAuditLog.count({ where: { expenseRequestId: id, action: 'EMAIL_SENT' } })).toBe(0);
  });
  it('changed content can receive a fresh independent approval and send, while each version dedupes and the follow-up task stays single', async () => {
    const id = await makeExpense(); await approved(id); const before = attempts;
    const tasksBefore = await db.task.count({ where: { tenantId, caseId } });
    expect((await send(id)).body.success).toBe(true);
    await db.expenseRequest.update({ where: { id }, data: { dueDate: new Date('2027-02-01') } });
    await approved(id); expect((await send(id)).body.success).toBe(true); expect((await send(id)).body.success).toBe(true);
    expect(attempts - before).toBe(2);
    expect(await db.expenseAuditLog.count({ where: { expenseRequestId: id, action: 'EMAIL_SENT' } })).toBe(2);
    expect(await db.task.count({ where: { tenantId, caseId } })).toBe(tasksBefore + 1);
  });
  it.each(['SENT', 'PENDING'])('legacy notification %s cannot create a new slot and duplicate a possibly delivered message', async status => {
    const id = await makeExpense();
    await db.clientNotification.create({ data: { tenantId, clientId, caseId, channel: 'EMAIL', type: 'MASRAF_ISTEK', status, body: 'Historical', sentById: ids.REQUESTER, dedupeKey: `EXPENSE_REQUEST:ExpenseRequest:${id}:1` } });
    const before = await state(id); expect((await send(id)).status).toBe(409); expect(await state(id)).toEqual(before);
  });
  it('SMTP acceptance followed by a business-audit DB failure can reconcile concurrently without resending or duplicating audit/task', async () => {
    const id = await makeExpense(); await approved(id);
    const before = attempts, tasksBefore = await db.task.count({ where: { tenantId, caseId } });
    const name = `test_3a_${suffix}`;
    if (!/^[a-z0-9_]+$/.test(name) || !/^[a-z0-9]+$/.test(id)) throw new Error('Invalid isolated SQL fixture identity');
    // Exact own request only; disposable DB. No shared/live table or data is accessed by this test harness.
    await db.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."expenseRequestId" = '${id}' AND NEW."action" = 'EMAIL_SENT' THEN RAISE EXCEPTION 'isolated-delivery-audit-failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "ExpenseAuditLog" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
      expect((await send(id)).status).toBe(500);
      expect(attempts - before).toBe(1);
      expect((await db.expenseRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
      expect(await db.expenseAuditLog.count({ where: { expenseRequestId: id, action: 'EMAIL_SENT' } })).toBe(0);
      expect(await db.task.count({ where: { tenantId, caseId } })).toBe(tasksBefore);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${name}" ON "ExpenseAuditLog"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${name}"()`);
    }
    const responses = await Promise.all([send(id), send(id)]);
    expect(responses.every(r => r.status === 201 && r.body.success === true)).toBe(true);
    expect(attempts - before).toBe(1);
    expect(await db.expenseAuditLog.count({ where: { expenseRequestId: id, action: 'EMAIL_SENT' } })).toBe(1);
    expect(await db.task.count({ where: { tenantId, caseId } })).toBe(tasksBefore + 1);
  });
  it('the real ClientNotificationModule wires the approval gate into both dispatcher and transport', async () => {
    // Match the application's global providers; do not replace the new approval gate.
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, ClientNotificationModule] })
      .overrideProvider(PrismaService).useValue(db).overrideProvider(OfficeService).useValue({}).compile();
    try {
      const gate = module.get(ExpenseSendApprovalService);
      expect(gate).toBeInstanceOf(ExpenseSendApprovalService);
      expect((module.get(NotificationDispatcherService) as any).expenseApproval).toBe(gate);
      expect((module.get(ClientNotificationService) as any).expenseApproval).toBe(gate);
      const id = await makeExpense(), before = attempts;
      const result = await module.get(NotificationDispatcherService).dispatch(tenantId, ids.REQUESTER, {
        clientId, caseId, templateCode: 'EXPENSE_REQUEST', type: 'MASRAF_ISTEK', refType: 'ExpenseRequest', refId: id,
        tokens: { items: 'Tebligat gideri: 100,00 TL', totalAmount: '100,00', dueDate: 'Belirtilmedi', officeIban: 'TR000000000000000000000001' },
      });
      expect(result.approval?.approvalRequired).toBe(true); expect(attempts).toBe(before);
    } finally { await module.close(); }
  });
});
