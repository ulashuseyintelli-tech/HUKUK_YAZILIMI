import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../test/test-db-env';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingJournalWriterService } from '../accounting-journal';
import { CaseBalanceService } from '../case-balance/case-balance.service';
import { ExpenseRequestService } from './expense-request.service';
import { PaymentInput } from './expense-payment-command';
import { lockExpenseRequest } from './expense-request-lock';
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import * as http from 'supertest';
import { ExpenseRequestController } from './expense-request.controller';
import { ExpenseGateService } from './expense-gate.service';
import { ExpenseViewService } from './expense-view.service';
import { ExpenseCalculatorService } from './expense-calculator.service';
import { ExpenseNotificationService } from './expense-notification.service';
import { CpeRequiredGuard } from '../policy-engine/decorators/cpe-required.guard';
import { CasePolicyEngine } from '../policy-engine/case-policy-engine.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('Expense payment acceptance requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('Expense payment command — atomicity and durable identity (disposable PostgreSQL)', () => {
  let a: PrismaService;
  let b: PrismaService;
  let tenantId: string;
  let clientId: string;
  let caseId: string;
  let requestId: string;
  let userId: string;
  let dispatch: jest.Mock;
  let app: INestApplication;
  // CPE decision fixture: exercises the real HTTP guard, not the complete domain policy engine.
  const cpe = { canPerformAction: jest.fn() };
  const input = (overrides: Partial<PaymentInput> = {}): PaymentInput => ({
    idempotencyKey: 'one-command', amount: 60,
    paymentDate: new Date('2026-10-01T10:30:00Z'), method: 'BANK_TRANSFER', ...overrides,
  });

  beforeAll(async () => {
    a = new PrismaService({ datasources: { db: { url } } });
    b = new PrismaService({ datasources: { db: { url } } });
    await Promise.all([a.$connect(), b.$connect()]);
    class Identity implements CanActivate {
      async canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        const user = await a.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
        if (!user?.isActive) throw new UnauthorizedException(); req.user = user; return true;
      }
    }
    const commands = {
      recordPayment: (...args: Parameters<ExpenseRequestService['recordPayment']>) => service().recordPayment(...args),
      markAsReceived: (...args: Parameters<ExpenseRequestService['markAsReceived']>) => service().markAsReceived(...args),
    };
    const module = await Test.createTestingModule({ controllers: [ExpenseRequestController], providers: [
      CpeRequiredGuard, { provide: CasePolicyEngine, useValue: cpe }, { provide: PrismaService, useValue: a },
      { provide: ExpenseRequestService, useValue: commands },
      ...[ExpenseGateService, ExpenseViewService, ExpenseCalculatorService, ExpenseNotificationService].map(provide => ({ provide, useValue: {} })),
    ] }).overrideGuard(AuthGuard('jwt')).useValue(new Identity()).compile();
    app = module.createNestApplication(); await app.init(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenantId = `payment-test-${randomUUID()}`;
    await a.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic payment' } });
    userId = (await a.user.create({ data: { tenantId, email: `${tenantId}@example.test`, name: 'Synthetic', surname: 'Actor', role: 'ADMIN' } })).id;
    clientId = (await a.client.create({ data: { tenantId, type: 'INDIVIDUAL', firstName: 'Synthetic', lastName: 'Client' } })).id;
    caseId = (await a.case.create({ data: { tenantId, type: 'GENERAL_EXECUTION', fileNumber: tenantId, clientId, currency: 'TRY' } })).id;
    await a.caseBalance.create({ data: { tenantId, caseId, balance: 0, currency: 'TRY' } });
    requestId = (await a.expenseRequest.create({ data: { tenantId, caseId, clientId, createdById: userId, totalAmount: 100, currency: 'TRY' } })).id;
    dispatch = jest.fn().mockResolvedValue({ status: 'sent' });
    cpe.canPerformAction.mockReset().mockResolvedValue({ allowed: true, code: 'OK' });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await a.expensePaymentReversal.deleteMany({ where: { tenantId } });
    await a.accountingJournalLine.deleteMany({ where: { tenantId } });
    await a.accountingJournalEntry.deleteMany({ where: { tenantId } });
    await a.balanceLedger.deleteMany({ where: { tenantId } });
    await a.expenseRequest.deleteMany({ where: { tenantId } });
    await a.caseBalance.deleteMany({ where: { tenantId } });
    await a.task.deleteMany({ where: { tenantId } });
    await a.case.deleteMany({ where: { tenantId } });
    await a.client.deleteMany({ where: { tenantId } });
    await a.user.deleteMany({ where: { tenantId } });
    await a.tenant.delete({ where: { id: tenantId } });
  });
  afterAll(async () => { await app?.close(); await Promise.all([a.$disconnect(), b.$disconnect()]); });

  function service(db = a, failAfter?: 'journal' | 'credit' | 'audit' | 'task') {
    // Faults occur AFTER the selected real DB write, inside the real transaction.
    const access: any = failAfter === 'audit' || failAfter === 'task' ? new Proxy(db, {
      get(target, key) {
        if (key === '$transaction') return (fn: any, options: any) => target.$transaction(async tx => fn(new Proxy(tx, {
          get(inner, model) {
            const delegate: any = (inner as any)[model];
            if (model !== (failAfter === 'audit' ? 'expenseAuditLog' : 'task')) return typeof delegate === 'function' ? delegate.bind(inner) : delegate;
            return new Proxy(delegate, { get(obj, action) {
              const method = obj[action];
              if (action !== (failAfter === 'audit' ? 'create' : 'updateMany')) return typeof method === 'function' ? method.bind(obj) : method;
              return async (...args: any[]) => { await method.apply(obj, args); throw new Error(`injected-${failAfter}`); };
            } });
          },
        })), options);
        const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
      },
    }) : db;
    const writer = new AccountingJournalWriterService(access);
    const balance = new CaseBalanceService(access, writer);
    if (failAfter === 'journal') {
      const write = writer.write.bind(writer);
      jest.spyOn(writer, 'write').mockImplementation(async (...args) => { await write(...args); throw new Error('injected-journal'); });
    }
    if (failAfter === 'credit') {
      const credit = balance.credit.bind(balance);
      jest.spyOn(balance, 'credit').mockImplementation(async (...args) => { await credit(...args); throw new Error('injected-credit'); });
    }
    return new ExpenseRequestService(access, balance, {} as any, { sendExpenseRequest: jest.fn() } as any,
      { dispatch } as any, { getOfficeIdentity: jest.fn().mockResolvedValue({ name: 'Synthetic Office' }) } as any, writer);
  }
  const pay = (s = service(), body = input(), actor = userId, request = requestId, tenant = tenantId) => s.recordPayment(tenant, request, body, actor);
  async function snapshot() {
    return {
      requests: await a.expenseRequest.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      payments: await a.expensePayment.findMany({ where: { expenseRequest: { tenantId } }, orderBy: { id: 'asc' } }),
      ledger: await a.balanceLedger.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      balances: await a.caseBalance.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      journals: await a.accountingJournalEntry.findMany({ where: { tenantId }, include: { lines: { orderBy: { lineNo: 'asc' } } }, orderBy: { id: 'asc' } }),
      audits: await a.expenseAuditLog.findMany({ where: { expenseRequest: { tenantId } }, orderBy: { id: 'asc' } }),
      tasks: await a.task.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    };
  }

  it('60 + 60 against 100: two independent pools admit one command, never 120 or partial writes', async () => {
    const results = await Promise.allSettled([pay(service(a)), pay(service(b), input({ idempotencyKey: 'another-command' }))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 400 });
    const s = await snapshot();
    expect(s.requests[0].paidTotal.toFixed(2)).toBe('60.00'); expect(s.requests[0].status).toBe('PARTIAL');
    expect(s.payments).toHaveLength(1); expect(s.ledger).toHaveLength(1); expect(s.audits).toHaveLength(1);
    expect(s.journals).toHaveLength(1); expect(s.journals[0].lines).toHaveLength(2);
    expect(s.balances[0].balance.toFixed(2)).toBe('60.00'); expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('same key concurrent and after service recreation replays persisted state, one credit/journal/mail', async () => {
    const r = await Promise.all([pay(service(a)), pay(service(b))]);
    expect(r.map(x => x.idempotentReplay).sort()).toEqual([false, true]);
    const before = await snapshot(); const replay = await pay(service(b));
    expect(replay.idempotentReplay).toBe(true); expect(await snapshot()).toEqual(before);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it.each(['amount', 'paymentDate', 'method', 'reference', 'notes', 'receiptDocId', 'actor', 'request'] as const)('same key changed %s conflicts without writes', async change => {
    await pay(); const next = input();
    if (change === 'amount') next.amount = 40;
    if (change === 'paymentDate') next.paymentDate = new Date('2026-10-02T10:30:00Z');
    if (change === 'method') next.method = 'CASH';
    if (change === 'reference') next.reference = 'different';
    if (change === 'notes') next.notes = 'different';
    if (change === 'receiptDocId') next.receiptDocId = 'opaque-other';
    let target = requestId;
    if (change === 'request') target = (await a.expenseRequest.create({ data: { tenantId, caseId, clientId, createdById: userId, totalAmount: 100 } })).id;
    const before = await snapshot();
    await expect(pay(service(b), next, change === 'actor' ? 'other-actor' : userId, target)).rejects.toMatchObject({ status: 409 });
    expect(await snapshot()).toEqual(before); expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { idempotencyKey: undefined }, { idempotencyKey: 1 }, { amount: 0 }, { amount: -1 },
    { amount: NaN }, { amount: Infinity }, { amount: 0.001 }, { amount: '60' },
    { paymentDate: new Date('invalid') }, { method: {} }, { notes: [] },
  ])('invalid command %p rejects with no financial writes', async bad => {
    const before = await snapshot();
    await expect(pay(service(), input(bad as any))).rejects.toMatchObject({ status: 400 });
    expect(await snapshot()).toEqual(before); expect(dispatch).not.toHaveBeenCalled();
  });

  it('CANCELLED rejects; distribution REJECTED remains an independent axis', async () => {
    await a.expenseRequest.update({ where: { id: requestId }, data: { expenseApprovalStatus: 'REJECTED', status: 'CANCELLED' } });
    const before = await snapshot(); await expect(pay()).rejects.toMatchObject({ status: 409 }); expect(await snapshot()).toEqual(before);
    await a.expenseRequest.update({ where: { id: requestId }, data: { status: 'PENDING' } });
    const accepted = await pay(); expect(accepted.status).toBe('PARTIAL');
    expect((await a.expenseRequest.findUniqueOrThrow({ where: { id: requestId } })).expenseApprovalStatus).toBe('REJECTED');
  });

  it.each(['request-missing', 'advance-missing', 'mismatch', 'advance-empty'] as const)('currency precondition %s rejects every related mutation', async kind => {
    if (kind === 'request-missing') await a.expenseRequest.update({ where: { id: requestId }, data: { currency: '' } });
    if (kind === 'advance-missing') await a.caseBalance.deleteMany({ where: { caseId } });
    if (kind === 'mismatch' || kind === 'advance-empty') await a.caseBalance.update({ where: { caseId }, data: { currency: kind === 'mismatch' ? 'USD' : '' } });
    const before = await snapshot(); await expect(pay()).rejects.toMatchObject({ status: 409 });
    expect(await snapshot()).toEqual(before); expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['journal', 'credit', 'audit', 'task'] as const)('failure after real %s write rolls back payment, journal, advance, parent, audit and task', async fault => {
    const task = await a.task.create({ data: { tenantId, caseId, title: 'Synthetic payment task', createdById: userId, status: 'PENDING' } });
    await a.expenseRequest.update({ where: { id: requestId }, data: { taskId: task.id } });
    const before = await snapshot();
    await expect(pay(service(a, fault), input({ amount: 100 }))).rejects.toThrow(`injected-${fault}`);
    expect(await snapshot()).toEqual(before); expect(dispatch).not.toHaveBeenCalled();
  });

  it('full payment completes only the bound tenant/case task; corrupted pointer rolls everything back', async () => {
    const otherCase = await a.case.create({ data: { tenantId, type: 'GENERAL_EXECUTION', fileNumber: `${tenantId}-other` } });
    const task = await a.task.create({ data: { tenantId, caseId: otherCase.id, title: 'Other case task', createdById: userId } });
    await a.expenseRequest.update({ where: { id: requestId }, data: { taskId: task.id } });
    const before = await snapshot(); await expect(pay(service(), input({ amount: 100 }))).rejects.toMatchObject({ status: 409 }); expect(await snapshot()).toEqual(before);
    await a.task.update({ where: { id: task.id }, data: { caseId } });
    await pay(service(), input({ amount: 100 }));
    expect((await a.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('COMPLETED');
  });

  it('metadata update accepts unchanged financial echoes; status/items changes cannot bypass payment', async () => {
    const s = service(); const items = [{ type: 'TEST', description: 'Synthetic', amount: 100 }];
    await a.expenseRequest.update({ where: { id: requestId }, data: { items } });
    await s.update(tenantId, requestId, { notes: 'metadata', status: 'PENDING', items });
    expect((await a.expenseRequest.findUniqueOrThrow({ where: { id: requestId } })).notes).toBe('metadata');
    const before = await snapshot();
    await expect(s.update(tenantId, requestId, { status: 'PAID' })).rejects.toMatchObject({ status: 409 });
    await expect(s.update(tenantId, requestId, { items: [{ ...items[0], amount: 1 }] })).rejects.toMatchObject({ status: 409 });
    expect(await snapshot()).toEqual(before);
  });

  it.each(['cancel', 'delete', 'send', 'remind'] as const)('payment winning the parent lock prevents stale %s from overwriting PARTIAL', async action => {
    const s = service(a); const other = service(b);
    let held!: () => void; let release!: () => void;
    const locked = new Promise<void>(r => { held = r; }); const proceed = new Promise<void>(r => { release = r; });
    const find = (s as any).findLockedRequest.bind(s);
    jest.spyOn(s as any, 'findLockedRequest').mockImplementation(async (...args) => { const row = await find(...args); held(); await proceed; return row; });
    const paying = pay(s); await locked;
    const writing = (action === 'cancel' ? other.cancel(tenantId, requestId) : action === 'delete' ? other.delete(tenantId, requestId)
      : action === 'send' ? other.markAsSent(tenantId, requestId, 'EMAIL') : other.markAsReminded(tenantId, requestId));
    // Attach rejection before releasing the lock to avoid an unhandled rejection in the harness.
    const rejected = expect(writing).rejects.toMatchObject({ status: 400 }); release();
    await paying; await rejected;
    expect((await a.expenseRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('PARTIAL');
  });

  it('a cancellation holding the row first makes the waiting payment reject without a credit', async () => {
    let held!: () => void; let release!: () => void;
    const locked = new Promise<void>(r => { held = r; }); const proceed = new Promise<void>(r => { release = r; });
    const cancelling = a.$transaction(async tx => { await lockExpenseRequest(tx, tenantId, requestId); held(); await proceed; await tx.expenseRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED' } }); });
    await locked; const denied = expect(pay(service(b))).rejects.toMatchObject({ status: 409 }); release(); await cancelling; await denied;
    const s = await snapshot(); expect(s.payments).toHaveLength(0); expect(s.ledger).toHaveLength(0); expect(s.journals).toHaveLength(0);
  });

  it('reversal that read the old payment parent waits and recomputes against the newly committed paidTotal', async () => {
    await pay(); const original = await a.expensePayment.findFirstOrThrow({ where: { expenseRequestId: requestId } });
    let held!: () => void; let release!: () => void; let staleRead!: () => void;
    const locked = new Promise<void>(r => { held = r; }); const proceed = new Promise<void>(r => { release = r; });
    const readBeforeCommit = new Promise<void>(r => { staleRead = r; });
    const payingService = service(a); const find = (payingService as any).findLockedRequest.bind(payingService);
    jest.spyOn(payingService as any, 'findLockedRequest').mockImplementation(async (...args) => { const row = await find(...args); held(); await proceed; return row; });
    const observed: any = new Proxy(b, { get(target, key) {
      if (key === '$transaction') return (fn: any, options: any) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, model) {
        const delegate = (inner as any)[model];
        if (model !== 'expensePayment') return typeof delegate === 'function' ? delegate.bind(inner) : delegate;
        return new Proxy(delegate, { get(obj, action) {
          if (action === 'findFirst') return async (...args: any[]) => { const payment = await obj.findFirst(...args); expect(payment.expenseRequest.paidTotal.toString()).toBe('60'); staleRead(); return payment; };
          const method = obj[action]; return typeof method === 'function' ? method.bind(obj) : method;
        } });
      } })), options);
      const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
    const paying = pay(payingService, input({ idempotencyKey: 'second-command', amount: 40 })); await locked;
    const reversing = service(observed).reversePayment(tenantId, original.id, { reason: 'Synthetic duplicate payment correction' }, userId);
    try { await readBeforeCommit; } finally { release(); }
    await paying; expect((await reversing).paidTotal).toBe('40.00');
    const s = await snapshot(); expect(s.requests[0].paidTotal.toString()).toBe('40'); expect(s.requests[0].status).toBe('PARTIAL');
    expect(s.balances[0].balance.toString()).toBe('40'); expect(s.payments).toHaveLength(2);
    expect(await a.expensePaymentReversal.count({ where: { tenantId, status: 'COMPLETED' } })).toBe(1);
  });

  it('legacy receive executes the same durable command and preserves its opaque receipt field', async () => {
    const body = input({ amount: 100, receiptDocId: 'legacy-opaque-receipt' });
    const s = service(); const result = await s.markAsReceived(tenantId, requestId, body, userId);
    expect(result.status).toBe('PAID'); expect(result.receiptDocId).toBe(body.receiptDocId); expect(result.paidAmount?.toString()).toBe('100');
    expect((await s.markAsReceived(tenantId, requestId, body, userId)).idempotentReplay).toBe(true);
    expect((await snapshot()).payments).toHaveLength(1); expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('USD payment remains USD and does not dispatch the existing TRY-only payment template', async () => {
    await a.expenseRequest.update({ where: { id: requestId }, data: { currency: 'USD' } });
    await a.caseBalance.update({ where: { caseId }, data: { currency: 'USD' } });
    await pay(); const s = await snapshot();
    expect(s.ledger[0].currency).toBe('USD'); expect(s.journals[0].currency).toBe('USD'); expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['payment', 'receive'])('HTTP %s preserves VIEWER denial and CPE denial, then executes the same atomic command', async endpoint => {
    const { amount, ...rest } = input();
    const body = { ...rest, paymentDate: rest.paymentDate.toISOString(), [endpoint === 'payment' ? 'amount' : 'paidAmount']: amount };
    const send = (payload: any = body) => http(app.getHttpServer()).post(`/expense-requests/${requestId}/${endpoint}`).set('x-test-user-id', userId).send(payload);
    await a.user.update({ where: { id: userId }, data: { role: 'VIEWER' } }); const before = await snapshot();
    const viewer = await send(); expect(viewer.status).toBe(403); expect(viewer.body.code).toBe('VIEWER_WRITE_DENIED');
    expect(cpe.canPerformAction).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before);
    await a.user.update({ where: { id: userId }, data: { role: 'USER' } });
    cpe.canPerformAction.mockResolvedValue({ allowed: false, code: 'SYNTHETIC_CPE_DENIED' });
    expect((await send()).status).toBe(403); expect(await snapshot()).toEqual(before);
    cpe.canPerformAction.mockResolvedValue({ allowed: true, code: 'OK' });
    const accepted = await send(); expect(accepted.status).toBe(201); expect(accepted.body.status).toBe('PARTIAL');
    const persisted = await snapshot(); expect(persisted.payments).toHaveLength(1); expect(persisted.ledger).toHaveLength(1);
    expect((await send()).body.idempotentReplay).toBe(true); expect(await snapshot()).toEqual(persisted);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it.each(['payment', 'receive'])('HTTP %s rejects missing key and invalid date/amount before any financial write', async endpoint => {
    const body = { amount: 1, paidAmount: 1, paymentDate: '2026-10-01', method: 'CASH' };
    const before = await snapshot();
    for (const payload of [body, { ...body, idempotencyKey: 'key', paymentDate: {} }, { ...body, idempotencyKey: 'key', amount: '1', paidAmount: '1' }]) {
      expect((await http(app.getHttpServer()).post(`/expense-requests/${requestId}/${endpoint}`).set('x-test-user-id', userId).send(payload)).status).toBe(400);
      expect(await snapshot()).toEqual(before);
    }
  });

  it('tenant mismatch is denied by the real HTTP expense resolver with no financial writes or CPE call', async () => {
    const before = await snapshot();
    await http(app.getHttpServer()).post('/expense-requests/not-in-this-tenant/payment').set('x-test-user-id', userId)
      .send({ ...input(), paymentDate: input().paymentDate.toISOString() }).expect(403);
    expect(cpe.canPerformAction).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before);
  });
});
