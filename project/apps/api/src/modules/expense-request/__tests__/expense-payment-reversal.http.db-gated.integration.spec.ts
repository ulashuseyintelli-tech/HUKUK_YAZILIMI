import { randomUUID } from 'node:crypto';
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AccountingJournalWriterService, reverseAccountingJournalEntryInTransaction } from '../../accounting-journal';
import { CaseBalanceService } from '../../case-balance/case-balance.service';
import { CpeRequiredGuard } from '../../policy-engine';
import { CasePolicyEngine } from '../../policy-engine/case-policy-engine.service';
import { ExpenseRequestController } from '../expense-request.controller';
import { ExpenseRequestService } from '../expense-request.service';
import { ExpenseGateService } from '../expense-gate.service';
import { ExpenseViewService } from '../expense-view.service';
import { ExpenseCalculatorService } from '../expense-calculator.service';
import { ExpenseNotificationService } from '../expense-notification.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('3c full reversal requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('3c source-bound full reversal (real HTTP + disposable PostgreSQL)', () => {
  let db: PrismaService, other: PrismaService, app: INestApplication, active: ExpenseRequestService;
  let tenantId: string, foreignTenant: string, actorId: string, lawyerId: string, clientId: string, caseId: string;
  let requestId: string, paymentId: string, balanceId: string;
  let injectedWrite: string | null = null;
  const reason = 'Erroneous original payment correction';
  const dispatch = jest.fn(), policy = { canPerformAction: jest.fn() };
  let resolution: 'ALLOW' | 'DENY' | 'NONE' = 'NONE';
  const resolver = { resolve: jest.fn(async () => resolution) };
  const beforeFlag = process.env.OFFICE_EXPENSE_VIEW_SCOPE_ENABLED;

  function service(prisma = db, failAfter?: string) {
    const access: PrismaService = !failAfter ? prisma : new Proxy(prisma, { get(target, key) {
      if (key === '$transaction') return (fn: any, options: any) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, model) {
        const delegate = (inner as any)[model];
        if (model !== failAfter) return typeof delegate === 'function' ? delegate.bind(inner) : delegate;
        const action = model === 'expenseRequest' ? 'update' : 'create';
        return new Proxy(delegate, { get(obj, method) {
          const value = obj[method];
          if (method === action) return async (...args: any[]) => { await value.apply(obj, args); injectedWrite = String(model); throw new Error(`injected-after-${String(model)}`); };
          return typeof value === 'function' ? value.bind(obj) : value;
        } });
      } })), options);
      const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
    const writer = new AccountingJournalWriterService(access);
    return new ExpenseRequestService(access, new CaseBalanceService(access, writer), {} as any,
      {} as any, { dispatch } as any, {} as any, writer, undefined, resolver as any);
  }
  const post = (body: unknown = { reason }, actor = actorId, parent = requestId, payment = paymentId) => http(app.getHttpServer())
    .post(`/expense-requests/${parent}/payments/${payment}/reverse`).set('x-test-user-id', actor).send(body as any);
  const options = (actor = actorId, parent = requestId) => http(app.getHttpServer())
    .get(`/expense-requests/${parent}/payments/reversal-options`).set('x-test-user-id', actor);

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } }); other = new PrismaService({ datasources: { db: { url } } });
    await Promise.all([db.$connect(), other.$connect()]);
    class Identity implements CanActivate {
      async canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id'] ?? '') } });
        if (!user?.isActive) throw new UnauthorizedException(); req.user = user; return true;
      }
    }
    const module = await Test.createTestingModule({ controllers: [ExpenseRequestController], providers: [
      CpeRequiredGuard, { provide: PrismaService, useValue: db }, { provide: CasePolicyEngine, useValue: policy },
      { provide: ExpenseRequestService, useValue: {
        getPaymentReversalOptions: (...args: Parameters<ExpenseRequestService['getPaymentReversalOptions']>) => active.getPaymentReversalOptions(...args),
        reversePaymentForActor: (...args: Parameters<ExpenseRequestService['reversePaymentForActor']>) => active.reversePaymentForActor(...args),
      } }, ...[ExpenseGateService, ExpenseViewService, ExpenseCalculatorService, ExpenseNotificationService].map(provide => ({ provide, useValue: {} })),
    ] }).overrideGuard(AuthGuard('jwt')).useValue(new Identity()).compile();
    app = module.createNestApplication(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenantId = `reversal-test-${randomUUID()}`; foreignTenant = `${tenantId}-foreign`;
    await db.tenant.createMany({ data: [tenantId, foreignTenant].map(id => ({ id, slug: id, name: 'Synthetic reversal' })) });
    actorId = (await db.user.create({ data: { tenantId, email: `${tenantId}@example.test`, name: 'Synthetic', surname: 'Actor', role: 'USER' } })).id;
    lawyerId = (await db.lawyer.create({ data: { tenantId, userId: actorId, name: 'Synthetic', surname: 'Partner', lawyerRank: 'PARTNER' } })).id;
    clientId = (await db.client.create({ data: { tenantId, type: 'INDIVIDUAL', firstName: 'Synthetic', lastName: 'Client' } })).id;
    caseId = (await db.case.create({ data: { tenantId, type: 'GENERAL_EXECUTION', fileNumber: tenantId, clientId, currency: 'TRY' } })).id;
    await db.caseClient.create({ data: { caseId, clientId, role: 'ALACAKLI' } });
    await db.caseLawyer.create({ data: { caseId, lawyerId } });
    balanceId = (await db.caseBalance.create({ data: { tenantId, caseId, balance: 200, currency: 'TRY' } })).id;
    requestId = (await db.expenseRequest.create({ data: { tenantId, caseId, clientId, createdById: actorId, totalAmount: 1000, currency: 'TRY' } })).id;
    injectedWrite = null; resolution = 'NONE'; process.env.OFFICE_EXPENSE_VIEW_SCOPE_ENABLED = 'true'; active = service();
    await active.recordPayment(tenantId, requestId, { idempotencyKey: 'synthetic-original', amount: 600, method: 'CASH', paymentDate: new Date('2026-10-01T10:00:00Z') }, actorId);
    paymentId = (await db.expensePayment.findFirstOrThrow({ where: { expenseRequestId: requestId } })).id;
    dispatch.mockClear(); policy.canPerformAction.mockClear(); resolver.resolve.mockClear();
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
    await db.lawyer.deleteMany({ where: { tenantId: { in: [tenantId, foreignTenant] } } });
    await db.staffMember.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId: { in: [tenantId, foreignTenant] } } });
    await db.tenant.deleteMany({ where: { id: { in: [tenantId, foreignTenant] } } });
  });
  afterAll(async () => { if (beforeFlag === undefined) delete process.env.OFFICE_EXPENSE_VIEW_SCOPE_ENABLED; else process.env.OFFICE_EXPENSE_VIEW_SCOPE_ENABLED = beforeFlag;
    await app?.close(); await Promise.all([db?.$disconnect(), other?.$disconnect()]); });

  async function snapshot() {
    return {
      requests: await db.expenseRequest.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      payments: await db.expensePayment.findMany({ where: { expenseRequest: { tenantId } }, orderBy: { id: 'asc' } }),
      reversals: await db.expensePaymentReversal.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      audits: await db.expenseAuditLog.findMany({ where: { expenseRequest: { tenantId } }, orderBy: { id: 'asc' } }),
      balances: await db.caseBalance.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      ledger: await db.balanceLedger.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      journals: await db.accountingJournalEntry.findMany({ where: { tenantId }, include: { lines: { orderBy: { lineNo: 'asc' } } }, orderBy: { id: 'asc' } }),
      expenseApplications: await db.collectionDispositionExpenseApplication.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      legalLedger: await db.ledgerEntry.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      tasks: await db.task.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    };
  }
  async function unchangedReject(status: number, body: unknown = { reason }, actor = actorId, parent = requestId, payment = paymentId) {
    const before = await snapshot(); const response = await post(body, actor, parent, payment);
    expect(response.status).toBe(status); expect(await snapshot()).toEqual(before); expect(dispatch).not.toHaveBeenCalled(); return response;
  }
  async function blockedOn(pid: number) {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database() AND ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
      if (rows[0]?.blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Command did not reach the expected real row lock');
  }

  it('scoped reader is side-effect-free and exposes no internal journal/ledger identifiers', async () => {
    const before = await snapshot(), response = await options(); expect(response.status).toBe(200);
    expect(response.body).toEqual({ expenseRequestId: requestId, caseId, payments: [{ expensePaymentId: paymentId,
      originalAmount: '600.00', currency: 'TRY', paymentDate: '2026-10-01T10:00:00.000Z', eligible: true, completedAt: null, blockedReason: null }] });
    expect(await snapshot()).toEqual(before); expect(policy.canPerformAction).not.toHaveBeenCalled();
  });
  it.each(['TRY', 'USD'])('fully corrects the source amount in %s, retains history and unrelated financial facts', async currency => {
    await db.expenseRequest.update({ where: { id: requestId }, data: { currency } });
    await db.caseBalance.update({ where: { id: balanceId }, data: { currency } });
    await db.balanceLedger.updateMany({ where: { tenantId }, data: { currency } });
    await db.accountingJournalEntry.updateMany({ where: { tenantId }, data: { currency } });
    await db.accountingJournalLine.updateMany({ where: { tenantId }, data: { currency } });
    const before = await snapshot(), response = await post(); expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'CREATED', expenseRequestId: requestId, expensePaymentId: paymentId, originalAmount: '600.00', currency });
    expect(Object.keys(response.body).sort()).toEqual(['status', 'expensePaymentReversalId', 'expensePaymentId', 'expenseRequestId', 'originalAmount', 'currency', 'completedAt'].sort());
    const after = await snapshot(); expect(after.payments).toEqual(before.payments); expect(after.requests[0].paidTotal.toFixed(2)).toBe('0.00');
    expect(after.requests[0].totalAmount.minus(after.requests[0].paidTotal).toFixed(2)).toBe('1000.00');
    expect(after.balances[0].balance.toFixed(2)).toBe('200.00'); expect(after.reversals).toHaveLength(1);
    const credit = before.ledger.find(row => row.type === 'CREDIT')!, reversal = after.reversals[0];
    expect(reversal).toMatchObject({ status: 'COMPLETED', originalBalanceLedgerId: credit.id, currency, requestedById: actorId, reason });
    expect(after.ledger.find(row => row.id === reversal.reversalBalanceLedgerId)).toMatchObject({ type: 'DEBIT', caseBalanceId: balanceId, currency });
    expect(after.ledger.find(row => row.id === reversal.reversalBalanceLedgerId)!.amount.toFixed(2)).toBe('-600.00');
    const journal = after.journals.find(row => row.id === reversal.reversalJournalEntryId)!;
    expect(journal.reversalOfEntryId).toBe(reversal.originalJournalEntryId);
    expect(after.audits.filter(row => row.action === 'PAYMENT_REVERSED')).toHaveLength(1);
    for (const key of ['expenseApplications', 'legalLedger', 'tasks'] as const) expect(after[key]).toEqual(before[key]);
    expect(dispatch).not.toHaveBeenCalled();
    await expect(active.cancel(tenantId, requestId, reason, actorId)).rejects.toMatchObject({ status: 400 });
    await expect(active.delete(tenantId, requestId)).rejects.toMatchObject({ status: 400 });
    const done = await options(); expect(done.body.payments[0]).toMatchObject({ eligible: false, completedAt: response.body.completedAt });
  });
  it('negative result 300 - 600 returns 409 with every financial record and success audit unchanged', async () => {
    await db.caseBalance.update({ where: { id: balanceId }, data: { balance: 300 } });
    expect((await unchangedReject(409)).body.code).toBe('EXPENSE_PAYMENT_REVERSAL_INSUFFICIENT_BALANCE');
  });
  it.each([{}, { reason: 'short' }, { reason: null }, { reason, amount: 1 }, { reason, currency: 'USD' }, { reason, caseBalanceId: 'other' },
    { reason, kind: 'REFUND' }, { reason, actorUserId: 'other' }, { reason, tenantId: 'other' }, { reason, clientId: 'other' }])('rejects body override %j before writes', async body => { await unchangedReject(400, body); });
  it.each(['missing', 'viewer', 'admin-only', 'ordinary-lawyer', 'inactive-profile', 'inactive-account', 'foreign', 'delegate', 'staff'] as const)('denies %s actor without writes', async kind => {
    if (kind === 'viewer' || kind === 'admin-only') await db.user.update({ where: { id: actorId }, data: { role: kind === 'viewer' ? 'VIEWER' : 'ADMIN' } });
    if (kind === 'admin-only') await db.lawyer.delete({ where: { id: lawyerId } });
    if (kind === 'ordinary-lawyer' || kind === 'delegate') await db.lawyer.update({ where: { id: lawyerId }, data: { lawyerRank: 'LAWYER', canApproveOfficeActions: true } });
    if (kind === 'inactive-profile') await db.lawyer.update({ where: { id: lawyerId }, data: { isActive: false } });
    if (kind === 'inactive-account') await db.user.update({ where: { id: actorId }, data: { isActive: false } });
    if (kind === 'staff') { await db.lawyer.delete({ where: { id: lawyerId } }); await db.staffMember.create({ data: { tenantId, userId: actorId, firstName: 'Synthetic', lastName: 'Staff', staffType: 'OFIS_KATIBI' } }); }
    const actor = kind === 'foreign' ? (await db.user.create({ data: { tenantId: foreignTenant, email: `${foreignTenant}@example.test`, name: 'Foreign', surname: 'Actor' } })).id : kind === 'missing' ? '' : actorId;
    await unchangedReject(['missing', 'inactive-account'].includes(kind) ? 401 : 403, { reason }, actor);
  });
  it('admits the existing MANAGER subject capability with the canonical case relationship', async () => {
    await db.lawyer.update({ where: { id: lawyerId }, data: { lawyerRank: 'MANAGER' } }); expect((await post()).status).toBe(201);
  });
  it.each(['unrelated', 'legacy-only', 'wrong-parent'] as const)('rejects %s object even with view_all ALLOW', async kind => {
    resolution = 'ALLOW';
    if (kind === 'unrelated') await db.caseLawyer.deleteMany({ where: { caseId, lawyerId } });
    if (kind === 'legacy-only') await db.caseClient.deleteMany({ where: { caseId, clientId } });
    if (kind === 'wrong-parent') {
      const actualOtherParent = await db.expenseRequest.create({ data: { tenantId, caseId, clientId, createdById: actorId, totalAmount: 1000, currency: 'TRY' } });
      await unchangedReject(404, { reason }, actorId, actualOtherParent.id);
    } else {
      await unchangedReject(404); expect((await options()).status).toBe(404);
    }
  });
  it('an otherwise capable foreign-tenant PARTNER cannot read or reverse this real parent', async () => {
    const user = await db.user.create({ data: { tenantId: foreignTenant, email: `${foreignTenant}-partner@example.test`, name: 'Foreign', surname: 'Partner' } });
    await db.lawyer.create({ data: { tenantId: foreignTenant, userId: user.id, name: 'Foreign', surname: 'Partner', lawyerRank: 'PARTNER' } });
    await unchangedReject(404, { reason }, user.id); expect((await options(user.id)).status).toBe(404);
  });
  it('actorless and foreign-tenant direct service entries cannot bypass the gate', async () => {
    const before = await snapshot();
    const contexts: Array<[string, string | undefined]> = [[tenantId, undefined], [foreignTenant, actorId]];
    for (const [tenant, actor] of contexts) await expect(active.reversePaymentForActor(tenant, requestId, paymentId, reason, actor as any)).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
  });
  it.each(['credit-missing', 'credit-amount', 'credit-currency', 'account-currency', 'journal-missing', 'journal-currency', 'journal-line-client', 'journal-line-amount', 'blank-currency', 'cancelled'] as const)('rejects inconsistent %s without writes', async kind => {
    const credit = await db.balanceLedger.findFirstOrThrow({ where: { tenantId, type: 'CREDIT' } });
    const journal = await db.accountingJournalEntry.findFirstOrThrow({ where: { tenantId, entryType: 'EXPENSE_PAYMENT_RECORDED' } });
    if (kind === 'credit-missing') await db.balanceLedger.delete({ where: { id: credit.id } });
    if (kind === 'credit-amount') await db.balanceLedger.update({ where: { id: credit.id }, data: { amount: 1 } });
    if (kind === 'credit-currency') await db.balanceLedger.update({ where: { id: credit.id }, data: { currency: 'USD' } });
    if (kind === 'account-currency') await db.caseBalance.update({ where: { id: balanceId }, data: { currency: 'USD' } });
    if (kind === 'journal-missing') { await db.accountingJournalLine.deleteMany({ where: { journalEntryId: journal.id } }); await db.accountingJournalEntry.delete({ where: { id: journal.id } }); }
    if (kind === 'journal-currency') await db.accountingJournalEntry.update({ where: { id: journal.id }, data: { currency: 'USD' } });
    if (kind === 'journal-line-client') await db.accountingJournalLine.updateMany({ where: { journalEntryId: journal.id }, data: { clientId: null } });
    if (kind === 'journal-line-amount') await db.accountingJournalLine.updateMany({ where: { journalEntryId: journal.id }, data: { amount: 1 } });
    if (kind === 'blank-currency') await db.expenseRequest.update({ where: { id: requestId }, data: { currency: '' } });
    if (kind === 'cancelled') await db.expenseRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED' } });
    await unchangedReject(409);
  });
  it('concurrent identical requests complete once; authorized replay adds no financial or audit record', async () => {
    const results = await Promise.all([post(), post()]); expect(results.map(row => row.status)).toEqual([201, 201]);
    expect(results.map(row => row.body.status).sort()).toEqual(['CREATED', 'REPLAYED']);
    const before = await snapshot(); expect((await post()).body.status).toBe('REPLAYED'); expect(await snapshot()).toEqual(before);
    expect(before.reversals).toHaveLength(1); expect(before.audits.filter(row => row.action === 'PAYMENT_REVERSED')).toHaveLength(1);
    await db.lawyer.update({ where: { id: lawyerId }, data: { isActive: false } }); await unchangedReject(403);
  });
  it.each(['FAILED', 'PENDING'] as const)('does not report an incomplete %s row as replay success', async status => {
    expect((await post()).status).toBe(201); await db.expensePaymentReversal.updateMany({ where: { tenantId }, data: { status } }); await unchangedReject(409);
  });
  it('a standalone journal reversal cannot masquerade as a complete expense correction', async () => {
    const journal = await db.accountingJournalEntry.findFirstOrThrow({ where: { tenantId, entryType: 'EXPENSE_PAYMENT_RECORDED' } });
    await db.$transaction(tx => reverseAccountingJournalEntryInTransaction(tx, new AccountingJournalWriterService(db), tenantId, actorId, journal.id, { reason }));
    await unchangedReject(409);
  });
  it('a duplicate original CREDIT is ambiguous and cannot be silently selected', async () => {
    const original = await db.balanceLedger.findFirstOrThrow({ where: { tenantId, type: 'CREDIT' } });
    // Legacy bridge rows may have no postingKey; exercise the actual ambiguous-source gate, not the unique-key constraint.
    await db.balanceLedger.create({ data: { ...original, id: randomUUID(), postingKey: null } }); await unchangedReject(409);
  });
  it('the original CREDIT cannot redirect correction to another case account', async () => {
    const otherCase = await db.case.create({ data: { tenantId, type: 'GENERAL_EXECUTION', fileNumber: `${tenantId}-other`, currency: 'TRY' } });
    const balance = await db.caseBalance.create({ data: { tenantId, caseId: otherCase.id, currency: 'TRY', balance: 800 } });
    await db.balanceLedger.updateMany({ where: { tenantId, type: 'CREDIT' }, data: { caseBalanceId: balance.id } }); await unchangedReject(409);
  });
  it.each(['missing', 'wrong-link'])('a completed row with %s success audit is not replay success', async kind => {
    expect((await post()).status).toBe(201);
    if (kind === 'missing') await db.expenseAuditLog.deleteMany({ where: { expenseRequestId: requestId, action: 'PAYMENT_REVERSED' } });
    else {
      const audit = await db.expenseAuditLog.findFirstOrThrow({ where: { expenseRequestId: requestId, action: 'PAYMENT_REVERSED' } });
      await db.expenseAuditLog.update({ where: { id: audit.id }, data: { details: { ...(audit.details as any), expensePaymentId: 'wrong-payment' } } });
    }
    await unchangedReject(409);
  });
  it.each(['accountingJournalEntry', 'balanceLedger', 'expenseRequest', 'expenseAuditLog'])('failure after real %s write rolls the entire transaction back', async model => {
    active = service(db, model);
    // The existing journal writer translates persistence failure to ConflictException; other injected failures propagate.
    await unchangedReject(model === 'accountingJournalEntry' ? 409 : 500);
    expect(injectedWrite).toBe(model);
  });
  it('a balance changed while waiting on its real row lock is re-read and rejected', async () => {
    let release!: () => void, ready!: (pid: number) => void;
    const signal = new Promise<number>(resolve => { ready = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
    const locker = other.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "CaseBalance" WHERE "id" = ${balanceId} FOR UPDATE`;
      await tx.caseBalance.update({ where: { id: balanceId }, data: { balance: 300 } });
      const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`; ready(rows[0].pid); await hold;
    }, { timeout: 10000 });
    const pid = await signal; const pending = post().then(response => response);
    try { await blockedOn(pid); } finally { release(); }
    await locker; expect((await pending).status).toBe(409);
    expect(await db.expensePaymentReversal.count({ where: { tenantId } })).toBe(0);
    expect((await db.caseBalance.findUniqueOrThrow({ where: { id: balanceId } })).balance.toFixed(2)).toBe('300.00');
  });
  it('different payment parents sharing one account cannot both spend the same sufficient balance', async () => {
    const second = await db.expenseRequest.create({ data: { tenantId, caseId, clientId, createdById: actorId, totalAmount: 1000, currency: 'TRY' } });
    await active.recordPayment(tenantId, second.id, { idempotencyKey: 'second', amount: 600, method: 'CASH', paymentDate: new Date() }, actorId);
    const payment = await db.expensePayment.findFirstOrThrow({ where: { expenseRequestId: second.id } });
    await db.caseBalance.update({ where: { id: balanceId }, data: { balance: 900 } }); dispatch.mockClear();
    const replies = await Promise.all([post(), post({ reason }, actorId, second.id, payment.id)]);
    expect(replies.map(row => row.status).sort()).toEqual([201, 409]);
    expect((await db.caseBalance.findUniqueOrThrow({ where: { id: balanceId } })).balance.toFixed(2)).toBe('300.00');
    expect(await db.expensePaymentReversal.count({ where: { tenantId } })).toBe(1);
  });
});
