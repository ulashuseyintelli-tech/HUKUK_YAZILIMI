import { randomUUID } from 'node:crypto';
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountingJournalWriterService } from '../../accounting-journal';
import { CaseBalanceService } from '../../case-balance/case-balance.service';
import { CpeRequiredGuard } from '../../policy-engine';
import { ExpenseRequestController } from '../expense-request.controller';
import { ExpenseRequestService } from '../expense-request.service';
import { ExpenseViewService } from '../expense-view.service';
import { ExpenseGateService } from '../expense-gate.service';
import { ExpenseNotificationService } from '../expense-notification.service';
import { ExpenseCalculatorService } from '../expense-calculator.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('3c unpaid cancellation requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

/** Real HTTP/controller/role guard/transactions. Test identity replaces JWT verification only.
 * All records are synthetic in a disposable database; transports are never connected.
 */
dbDescribe('3c unpaid cancellation and payment-history preservation (HTTP + disposable PostgreSQL)', () => {
  let db: PrismaService;
  let other: PrismaService;
  let app: INestApplication;
  let active: ExpenseRequestService;
  let tenantId: string, foreignTenant: string, caseId: string, clientId: string, actorId: string, viewerId: string, foreignActor: string, id: string;
  const dispatch = jest.fn().mockResolvedValue({ status: 'sent' });
  const reason = 'Synthetic unpaid request is no longer needed';

  function service(prisma = db) {
    const writer = new AccountingJournalWriterService(prisma);
    return new ExpenseRequestService(prisma, new CaseBalanceService(prisma, writer), {} as any,
      { sendExpenseRequest: jest.fn() } as any, { dispatch } as any,
      { getOfficeIdentity: jest.fn().mockResolvedValue({ name: 'Synthetic Office' }) } as any, writer);
  }
  const post = (body: unknown = { reason }, actor = actorId, requestId = id) => http(app.getHttpServer())
    .post(`/expense-requests/${requestId}/cancel`).set('x-test-user-id', actor).send(body as any);
  const remove = (requestId = id) => http(app.getHttpServer()).delete(`/expense-requests/${requestId}`).set('x-test-user-id', actorId);
  const pay = (s = active) => s.recordPayment(tenantId, id, {
    idempotencyKey: 'synthetic-payment', amount: 40, method: 'CASH', paymentDate: new Date('2026-10-01T10:00:00Z'),
  }, actorId);

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } });
    other = new PrismaService({ datasources: { db: { url } } });
    await Promise.all([db.$connect(), other.$connect()]);
    class Identity implements CanActivate {
      async canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id'] ?? '') } });
        if (!user?.isActive) throw new UnauthorizedException();
        req.user = user; return true;
      }
    }
    const commands = {
      cancel: (...args: Parameters<ExpenseRequestService['cancel']>) => active.cancel(...args),
      delete: (...args: Parameters<ExpenseRequestService['delete']>) => active.delete(...args),
      findOne: (...args: Parameters<ExpenseRequestService['findOne']>) => active.findOne(...args),
    };
    const module = await Test.createTestingModule({ controllers: [ExpenseRequestController], providers: [
      { provide: ExpenseRequestService, useValue: commands }, { provide: ExpenseViewService, useValue: new ExpenseViewService(db) },
      ...[ExpenseGateService, ExpenseNotificationService, ExpenseCalculatorService].map(provide => ({ provide, useValue: {} })),
    ] }).overrideGuard(AuthGuard('jwt')).useValue(new Identity())
      .overrideGuard(CpeRequiredGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenantId = `cancel-test-${randomUUID()}`; foreignTenant = `${tenantId}-foreign`;
    await db.tenant.createMany({ data: [tenantId, foreignTenant].map(t => ({ id: t, slug: t, name: 'Synthetic cancellation' })) });
    actorId = (await db.user.create({ data: { tenantId, email: `${tenantId}@example.test`, name: 'Synthetic', surname: 'Actor', role: 'ADMIN' } })).id;
    viewerId = (await db.user.create({ data: { tenantId, email: `${tenantId}-viewer@example.test`, name: 'Synthetic', surname: 'Viewer', role: 'VIEWER' } })).id;
    foreignActor = (await db.user.create({ data: { tenantId: foreignTenant, email: `${foreignTenant}@example.test`, name: 'Foreign', surname: 'Actor', role: 'ADMIN' } })).id;
    clientId = (await db.client.create({ data: { tenantId, type: 'INDIVIDUAL', firstName: 'Synthetic', lastName: 'Client' } })).id;
    caseId = (await db.case.create({ data: { tenantId, type: 'GENERAL_EXECUTION', fileNumber: tenantId, clientId, currency: 'TRY' } })).id;
    await db.caseClient.create({ data: { caseId, clientId, role: 'ALACAKLI' } });
    await db.caseBalance.create({ data: { tenantId, caseId, balance: 0, currency: 'TRY' } });
    id = (await db.expenseRequest.create({ data: { tenantId, caseId, clientId, createdById: actorId, totalAmount: 100, currency: 'TRY',
      requestItems: { create: { itemCode: 'SYNTHETIC', label: 'Synthetic existing item', suggestedAmount: 100, finalAmount: 100 } },
    } })).id;
    active = service(); dispatch.mockClear();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db.expensePaymentReversal.deleteMany({ where: { tenantId } });
    await db.accountingJournalLine.deleteMany({ where: { tenantId } });
    await db.accountingJournalEntry.deleteMany({ where: { tenantId } });
    await db.balanceLedger.deleteMany({ where: { tenantId } });
    await db.expenseRequest.deleteMany({ where: { tenantId } });
    await db.caseBalance.deleteMany({ where: { tenantId } });
    await db.task.deleteMany({ where: { tenantId } });
    await db.case.deleteMany({ where: { tenantId } });
    await db.client.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId: { in: [tenantId, foreignTenant] } } });
    await db.tenant.deleteMany({ where: { id: { in: [tenantId, foreignTenant] } } });
  });
  afterAll(async () => { await app?.close(); await Promise.all([db?.$disconnect(), other?.$disconnect()]); });

  async function snapshot() {
    return {
      requests: await db.expenseRequest.findMany({ where: { tenantId }, include: { requestItems: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } }),
      payments: await db.expensePayment.findMany({ where: { expenseRequest: { tenantId } }, orderBy: { id: 'asc' } }),
      reversals: await db.expensePaymentReversal.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      audits: await db.expenseAuditLog.findMany({ where: { expenseRequest: { tenantId } }, orderBy: { id: 'asc' } }),
      balances: await db.caseBalance.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      ledger: await db.balanceLedger.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      journals: await db.accountingJournalEntry.findMany({ where: { tenantId }, include: { lines: { orderBy: { lineNo: 'asc' } } }, orderBy: { id: 'asc' } }),
      tasks: await db.task.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    };
  }

  async function waitForBlockedCommand(lockingPid: number) {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
        AND ${lockingPid} = ANY(pg_blocking_pids(pid))
      ) AS blocked`;
      if (rows[0]?.blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Competing command never reached the actual parent-row lock');
  }

  it.each(['PENDING', 'SENT', 'REMINDED', 'OVERDUE'] as const)('cancels unpaid %s with trimmed reason, actor and one atomic audit', async status => {
    await db.expenseRequest.update({ where: { id }, data: { status } });
    const before = await snapshot(); const response = await post({ reason: `  ${reason}  ` });
    expect(response.status).toBe(201); expect(response.body).toMatchObject({ id, status: 'CANCELLED', responseNotes: reason });
    const after = await snapshot(); expect(after.audits).toHaveLength(1);
    expect(after.audits[0]).toMatchObject({ expenseRequestId: id, userId: actorId, action: 'CANCELLED', details: { statusBefore: status, statusAfter: 'CANCELLED', reason } });
    for (const key of ['payments', 'reversals', 'balances', 'ledger', 'journals', 'tasks'] as const) expect(after[key]).toEqual(before[key]);
    expect(after.requests[0].requestItems).toEqual(before.requests[0].requestItems); expect(dispatch).not.toHaveBeenCalled();
  });
  it.each([{}, { reason: '' }, { reason: '   ' }, { reason: null }, { reason: 42 }, { reason: {} }, []])('rejects invalid reason %j without any mutation', async body => {
    const before = await snapshot(); expect((await post(body)).status).toBe(400); expect(await snapshot()).toEqual(before);
  });
  it.each(['viewer', 'foreign', 'missing', 'inactive'] as const)('rejects %s identity without writes', async kind => {
    if (kind === 'inactive') await db.user.update({ where: { id: actorId }, data: { isActive: false } });
    const before = await snapshot(); const actor = kind === 'viewer' ? viewerId : kind === 'foreign' ? foreignActor : kind === 'missing' ? '' : actorId;
    expect((await post({ reason }, actor)).status).toBe(kind === 'viewer' ? 403 : kind === 'foreign' ? 404 : 401);
    expect(await snapshot()).toEqual(before);
  });
  it('does not admit actorless, VIEWER or foreign actor direct service calls', async () => {
    const before = await snapshot();
    for (const actor of [undefined, viewerId, foreignActor]) await expect(active.cancel(tenantId, id, reason, actor as any)).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
  });
  it('same concurrent command keeps the original reason and exactly one success audit', async () => {
    const results = await Promise.all([post(), post()]); expect(results.map(r => r.status)).toEqual([201, 201]);
    expect((await snapshot()).audits).toHaveLength(1);
    const before = await snapshot(); expect((await post({ reason: 'A different later reason' })).status).toBe(409); expect(await snapshot()).toEqual(before);
  });
  it('an audit failure after the real insert rolls back both cancellation and audit', async () => {
    const before = await snapshot();
    const access = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return (fn: any, options: any) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, model) {
        const delegate = (inner as any)[model];
        if (model !== 'expenseAuditLog') return typeof delegate === 'function' ? delegate.bind(inner) : delegate;
        return new Proxy(delegate, { get(obj, method) { if (method === 'create') return async (...args: any[]) => { await obj.create(...args); throw new Error('injected-cancellation-audit-failure'); }; return typeof obj[method] === 'function' ? obj[method].bind(obj) : obj[method]; } });
      } })), options);
      const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
    active = service(access); expect((await post()).status).toBe(500); expect(await snapshot()).toEqual(before); expect(dispatch).not.toHaveBeenCalled();
  });
  it('zero paidTotal with a real legacy payment row is not unpaid: cancel and delete both refuse', async () => {
    await db.expensePayment.create({ data: { expenseRequestId: id, amount: 40, paymentDate: new Date(), method: 'CASH' } });
    const before = await snapshot(); expect((await post()).status).toBe(400); expect((await remove()).status).toBe(400); expect(await snapshot()).toEqual(before);
  });
  it('a fully reversed historical payment remains protected even after paidTotal becomes zero', async () => {
    await pay(); const payment = await db.expensePayment.findFirstOrThrow({ where: { expenseRequestId: id } });
    await active.reversePayment(tenantId, payment.id, { reason: 'Synthetic historical payment correction' }, actorId);
    const before = await snapshot(); expect(before.requests[0].paidTotal.toString()).toBe('0'); expect(before.reversals).toHaveLength(1);
    expect((await post()).status).toBe(400); expect((await remove()).status).toBe(400); expect(await snapshot()).toEqual(before);
  });
  it('retains the existing deletion of an unpaid PENDING request, but refuses a SENT request', async () => {
    await db.expenseRequest.update({ where: { id }, data: { status: 'SENT' } });
    const before = await snapshot(); expect((await remove()).status).toBe(400); expect(await snapshot()).toEqual(before);
    await db.expenseRequest.update({ where: { id }, data: { status: 'PENDING' } });
    expect((await remove()).status).toBe(200); expect(await db.expenseRequest.count({ where: { id } })).toBe(0);
  });
  it('does not reverse an already-recorded actual expense or its balanced journal on cancellation', async () => {
    const balance = await db.caseBalance.findUniqueOrThrow({ where: { caseId } });
    await db.balanceLedger.create({ data: { tenantId, caseBalanceId: balance.id, type: 'DEBIT', amount: -20, currency: 'TRY', source: 'synthetic-existing-expense', sourceId: id, entryKind: 'EXPENSE_ACTUAL' } });
    await db.caseBalance.update({ where: { id: balance.id }, data: { balance: -20 } });
    await db.accountingJournalEntry.create({ data: { tenantId, caseId, currency: 'TRY', entryType: 'EXPENSE_REQUEST_RECORDED', sourceType: 'EXPENSE_REQUEST', sourceId: id, sourceAction: 'recorded', idempotencyKey: `synthetic-journal:${id}`, lines: { create: [
      { tenantId, lineNo: 1, accountCode: 'CLIENT_EXPENSE_RECEIVABLE', direction: 'DEBIT', amount: 20, currency: 'TRY', expenseRequestId: id },
      { tenantId, lineNo: 2, accountCode: 'FIRM_EXPENSE_REIMBURSEMENT', direction: 'CREDIT', amount: 20, currency: 'TRY', expenseRequestId: id },
    ] } } });
    const before = await snapshot(); expect((await post()).status).toBe(201); const after = await snapshot();
    expect(after.ledger).toEqual(before.ledger); expect(after.balances).toEqual(before.balances); expect(after.journals).toEqual(before.journals);
  });
  it('payment winning the parent lock makes cancellation read the committed payment and refuse', async () => {
    let held!: () => void, release!: () => void;
    let lockingPid = 0;
    const locked = new Promise<void>(r => { held = r; }), proceed = new Promise<void>(r => { release = r; });
    const paying = service(other); const find = (paying as any).findLockedRequest.bind(paying);
    jest.spyOn(paying as any, 'findLockedRequest').mockImplementation(async (...args: any[]) => { const row = await find(...args); lockingPid = (await args[0].$queryRaw`SELECT pg_backend_pid() AS pid` as Array<{ pid: number }>)[0].pid; held(); await proceed; return row; });
    const payment = pay(paying); await locked;
    const cancellation = post().then(r => r);
    try { await waitForBlockedCommand(lockingPid); } finally { release(); }
    await payment;
    expect((await cancellation).status).toBe(400); const after = await snapshot();
    expect(after.requests[0].status).toBe('PARTIAL'); expect(after.payments).toHaveLength(1); expect(after.audits.filter(x => x.action === 'CANCELLED')).toHaveLength(0);
  });
  it('cancellation winning the parent lock makes the waiting payment refuse without financial writes', async () => {
    let held!: () => void, release!: () => void;
    let lockingPid = 0;
    const locked = new Promise<void>(r => { held = r; }), proceed = new Promise<void>(r => { release = r; });
    const find = (active as any).findLockedRequest.bind(active);
    jest.spyOn(active as any, 'findLockedRequest').mockImplementation(async (...args: any[]) => { const row = await find(...args); lockingPid = (await args[0].$queryRaw`SELECT pg_backend_pid() AS pid` as Array<{ pid: number }>)[0].pid; held(); await proceed; return row; });
    const cancellation = post().then(r => r); await locked;
    const rejected = expect(pay(service(other))).rejects.toMatchObject({ status: 409 });
    try { await waitForBlockedCommand(lockingPid); } finally { release(); }
    expect((await cancellation).status).toBe(201); await rejected;
    const after = await snapshot(); expect(after.payments).toHaveLength(0); expect(after.journals).toHaveLength(0); expect(after.ledger).toHaveLength(0); expect(dispatch).not.toHaveBeenCalled();
  });
  it('three-view history hint uses actual payment rows rather than paidTotal', async () => {
    const get = () => http(app.getHttpServer()).get(`/expense-requests/${id}/three-view`).set('x-test-user-id', viewerId);
    expect((await get()).body.finance.hasPaymentHistory).toBe(false);
    await db.expensePayment.create({ data: { expenseRequestId: id, amount: 40, paymentDate: new Date(), method: 'CASH' } });
    expect((await get()).body.finance).toMatchObject({ paidAmount: 0, hasPaymentHistory: true });
  });
});
