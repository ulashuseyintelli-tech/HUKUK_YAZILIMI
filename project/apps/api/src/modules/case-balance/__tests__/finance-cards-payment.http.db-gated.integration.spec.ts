import { randomUUID } from 'node:crypto';
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { CaseBalanceController } from '../case-balance.controller';
import { CaseBalanceService } from '../case-balance.service';
import { AccountingJournalWriterService } from '../../accounting-journal';
import { CaseViewScopeService } from '../../case/case-view-scope.service';
import { CaseViewScopeGuard } from '../../case/case-view-scope.guard';
import { ExpenseRequestService } from '../../expense-request/expense-request.service';
import { ExpenseRequestController } from '../../expense-request/expense-request.controller';
import { ExpenseGateService } from '../../expense-request/expense-gate.service';
import { ExpenseViewService } from '../../expense-request/expense-view.service';
import { ExpenseCalculatorService } from '../../expense-request/expense-calculator.service';
import { ExpenseNotificationService } from '../../expense-request/expense-notification.service';
import { CpeRequiredGuard } from '../../policy-engine';
import { CasePolicyEngine } from '../../policy-engine/case-policy-engine.service';
import { StateMachineService } from '../../policy-engine/state-machine';
import { GateCheckerService } from '../../policy-engine/gate-checker';
import { ActionCode, RiskLevel } from '../../policy-engine/types/action-code.enum';
import { ACTION_MATRIX } from '../../policy-engine/types/action-matrix.interface';
import { classifyAction } from '../../policy-engine/effective-permission-mapping';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('Finance card/payment HTTP acceptance requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;
const stages = ['INITIAL','PAYMENT_ORDER','WAITING_RESPONSE','OBJECTION','ENFORCEMENT','SEIZURE','SALE_REQUEST','AUCTION','COLLECTION','PARTIAL_PAYMENT','FULL_PAYMENT','CLOSED','SUSPENDED'];

dbDescribe('M3b/Y3 scoped reads and stage-independent payment (real HTTP/disposable PostgreSQL)', () => {
  let db: PrismaService, app: INestApplication, balances: CaseBalanceService, payments: ExpenseRequestService;
  let tenantId: string, actorId: string, clientId: string, caseId: string, requestId: string;
  const dispatch = jest.fn();
  const previousFlag = process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED;
  const resolver = { resolve: jest.fn(async () => 'NONE') };
  const decisionLog = jest.fn(async () => 'synthetic-decision');
  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } }); await db.$connect();
    const writer = new AccountingJournalWriterService(db);
    balances = new CaseBalanceService(db, writer);
    payments = new ExpenseRequestService(db, balances, {} as any, {} as any, { dispatch } as any, {} as any, writer);
    const facts: any = { getFacts: async (id: string) => {
      const row = await db.case.findUniqueOrThrow({ where: { id } });
      return new Map([['case.is_closed', row.caseStatus === 'HITAM'], ['case.is_archived', row.isArchived]]);
    } };
    const engine = new CasePolicyEngine(db, facts, { computeAll: async (_id: string, _c: unknown, f: unknown) => f } as any,
      { log: decisionLog } as any, {} as any, new StateMachineService(db), new GateCheckerService(), {} as any);
    class Identity implements CanActivate {
      async canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        const actor = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id'] ?? '') } });
        if (!actor?.isActive) throw new UnauthorizedException(); req.user = actor; return true;
      }
    }
    const module = await Test.createTestingModule({ controllers: [CaseBalanceController, ExpenseRequestController], providers: [
      CpeRequiredGuard, CaseViewScopeGuard, { provide: PrismaService, useValue: db }, { provide: CaseBalanceService, useValue: balances },
      { provide: CasePolicyEngine, useValue: engine }, { provide: ExpenseRequestService, useValue: payments },
      { provide: CaseViewScopeService, useValue: new CaseViewScopeService(db, resolver as any) },
      ...[ExpenseGateService, ExpenseViewService, ExpenseCalculatorService, ExpenseNotificationService].map(provide => ({ provide, useValue: {} })),
    ] }).overrideGuard(AuthGuard('jwt')).useValue(new Identity()).compile();
    app = module.createNestApplication(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenantId = `finance-test-${randomUUID()}`;
    await db.tenant.createMany({ data: [tenantId, `${tenantId}-foreign`].map(id => ({ id, slug: id, name: 'Synthetic finance' })) });
    actorId = (await db.user.create({ data: { tenantId, email: `${tenantId}@example.test`, name: 'Synthetic', surname: 'Actor', role: 'ADMIN' } })).id;
    const lawyer = await db.lawyer.create({ data: { tenantId, userId: actorId, name: 'Synthetic', surname: 'Partner', lawyerRank: 'PARTNER' } });
    clientId = (await db.client.create({ data: { tenantId, type: 'INDIVIDUAL', firstName: 'Synthetic', lastName: 'Client' } })).id;
    caseId = (await db.case.create({ data: { tenantId, type: 'GENERAL_EXECUTION', fileNumber: tenantId, currency: 'TRY', caseStatus: 'DERDEST' } })).id;
    await db.caseClient.create({ data: { caseId, clientId, role: 'ALACAKLI' } });
    await db.caseLawyer.create({ data: { caseId, lawyerId: lawyer.id } });
    await db.caseBalance.create({ data: { tenantId, caseId, balance: 0, currency: 'TRY' } });
    requestId = (await db.expenseRequest.create({ data: { tenantId, caseId, clientId, createdById: actorId, totalAmount: 2000, currency: 'TRY' } })).id;
    process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED = 'true'; resolver.resolve.mockClear(); decisionLog.mockClear(); dispatch.mockClear();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db.accountingJournalLine.deleteMany({ where: { tenantId } }); await db.accountingJournalEntry.deleteMany({ where: { tenantId } });
    await db.balanceLedger.deleteMany({ where: { tenantId } }); await db.expenseRequest.deleteMany({ where: { tenantId } });
    await db.caseBalance.deleteMany({ where: { tenantId } }); await db.case.deleteMany({ where: { tenantId } });
    await db.client.deleteMany({ where: { tenantId } }); await db.lawyer.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId: { in: [tenantId, `${tenantId}-foreign`] } } });
    await db.tenant.deleteMany({ where: { id: { in: [tenantId, `${tenantId}-foreign`] } } });
  });
  afterAll(async () => { if (previousFlag === undefined) delete process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED; else process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED = previousFlag; await app?.close(); await db?.$disconnect(); });
  const get = (actor = actorId, target = caseId) => http(app.getHttpServer()).get(`/cases/${target}/balance/expense-actual-summary`).set('x-test-user-id', actor);
  const post = (route = 'payment', key = 'one-receipt', amount = 600) => http(app.getHttpServer()).post(`/expense-requests/${requestId}/${route}`)
    .set('x-test-user-id', actorId).send({ idempotencyKey: key, ...(route === 'receive' ? { paidAmount: amount } : { amount }), paymentDate: '2026-11-01T12:00:00Z', method: 'CASH' });
  async function snapshot() {
    return { requests: await db.expenseRequest.findMany({ where: { tenantId } }), payments: await db.expensePayment.findMany({ where: { expenseRequest: { tenantId } } }),
      ledger: await db.balanceLedger.findMany({ where: { tenantId } }), balances: await db.caseBalance.findMany({ where: { tenantId } }),
      audits: await db.expenseAuditLog.findMany({ where: { expenseRequest: { tenantId } } }), journals: await db.accountingJournalEntry.findMany({ where: { tenantId } }) };
  }
  async function typed(amount: number, currency = 'TRY', key = randomUUID()) {
    const balance = await db.caseBalance.findUniqueOrThrow({ where: { caseId } });
    return db.balanceLedger.create({ data: { tenantId, caseBalanceId: balance.id, type: 'DEBIT', amount: -amount, currency, entryKind: 'EXPENSE_ACTUAL', postingKey: key, source: `expense_actual:${key}`, sourceId: key } });
  }
  it('sums ALL typed rows by currency, excludes generic debit/payment/reversal, and performs zero writes', async () => {
    await typed(350); await typed(0.1); await typed(0.2); await typed(17, 'USD');
    for (let i = 0; i < 7; i++) await typed(1);
    const balance = await db.caseBalance.findUniqueOrThrow({ where: { caseId } });
    await db.balanceLedger.createMany({ data: [{ tenantId, caseBalanceId: balance.id, type: 'DEBIT', amount: -500, source: 'generic' },
      { tenantId, caseBalanceId: balance.id, type: 'DEBIT', amount: -600, source: 'expense_payment_reversal:synthetic' },
      { tenantId, caseBalanceId: balance.id, type: 'CREDIT', amount: 2000, source: 'expense_payment:synthetic' }] });
    const before = await snapshot(), response = await get(); expect(response.status).toBe(200);
    expect(response.body).toEqual({ caseId, basis: 'TYPED_EXPENSE_ACTUAL', scope: 'CASE', exists: true,
      totals: [{ currency: 'TRY', amount: '357.30', count: 10 }, { currency: 'USD', amount: '17.00', count: 1 }] });
    expect(await snapshot()).toEqual(before); expect(dispatch).not.toHaveBeenCalled();
  });
  it('missing balance is explicit and is never created by GET', async () => {
    await db.caseBalance.delete({ where: { caseId } }); const before = await snapshot();
    expect((await get()).body).toMatchObject({ exists: false, totals: [] }); expect(await snapshot()).toEqual(before);
  });
  it('a complete empty typed read is a genuine zero in the stored account currency', async () => {
    expect((await get()).body.totals).toEqual([{ currency: 'TRY', amount: '0.00', count: 0 }]);
  });
  it.each(['source','sourceId','type','currency','amount'])('malformed typed %s is rejected rather than silently omitted or zeroed', async field => {
    const row = await typed(350); const bad: any = { source: 'not-authoritative', sourceId: 'wrong', type: 'CREDIT', currency: '???', amount: 350 };
    await db.balanceLedger.update({ where: { id: row.id }, data: { [field]: bad[field] } });
    const before = await snapshot(); expect((await get()).status).toBe(409); expect(await snapshot()).toEqual(before);
  });
  it('same-tenant unrelated actor and wrong parent are hidden by the existing case read scope', async () => {
    const other = await db.user.create({ data: { tenantId, email: `${tenantId}-other@example.test`, name: 'Other', surname: 'Actor', role: 'ADMIN' } });
    expect((await get(other.id)).status).toBe(404); expect((await get(actorId, 'missing-case')).status).toBe(404);
  });
  it('cross-tenant lookup is rejected without creating a balance', async () => {
    const foreign = await db.user.create({ data: { tenantId: `${tenantId}-foreign`, email: `${tenantId}-foreign@example.test`, name: 'Foreign', surname: 'Actor', role: 'ADMIN' } });
    const before = await snapshot(); expect((await get(foreign.id)).status).toBe(404); expect(await snapshot()).toEqual(before);
  });
  it('inactive identity is rejected before read', async () => { await db.user.update({ where: { id: actorId }, data: { isActive: false } }); expect((await get()).status).toBe(401); });
  it.each(stages.flatMap(stage => ['payment','receive'].map(route => [stage, route])))('%s /%s uses the real stage-independent engine and atomic command', async (stage, route) => {
    await db.case.update({ where: { id: caseId }, data: { workflowStage: stage } });
    const response = await post(route); expect(response.status).toBe(201); expect(response.body.paidTotal).toBe('600');
    expect(await db.expensePayment.count({ where: { expenseRequestId: requestId } })).toBe(1);
    expect((await db.caseBalance.findUniqueOrThrow({ where: { caseId } })).balance.toString()).toBe('600');
    expect(decisionLog.mock.calls[0][1]).toBe(ActionCode.RECORD_EXPENSE_PAYMENT);
    expect((await post(route)).body.idempotentReplay).toBe(true); expect(await db.expensePayment.count({ where: { expenseRequestId: requestId } })).toBe(1);
  });
  it.each(['payment','receive'])('/%s preserves VIEWER, CANCELLED, missing/mismatched advance and closed/archive refusal without financial writes', async route => {
    for (const mode of ['VIEWER','CANCELLED','NO_ACCOUNT','CURRENCY','CLOSED','ARCHIVED']) {
      await db.user.update({ where: { id: actorId }, data: { role: mode === 'VIEWER' ? 'VIEWER' : 'ADMIN' } });
      await db.expenseRequest.update({ where: { id: requestId }, data: { status: mode === 'CANCELLED' ? 'CANCELLED' : 'PENDING' } });
      await db.case.update({ where: { id: caseId }, data: { caseStatus: mode === 'CLOSED' ? 'HITAM' : 'DERDEST', isArchived: mode === 'ARCHIVED' } });
      await db.caseBalance.upsert({ where: { caseId }, create: { tenantId, caseId, balance: 0, currency: mode === 'CURRENCY' ? 'USD' : 'TRY' }, update: { currency: mode === 'CURRENCY' ? 'USD' : 'TRY' } });
      if (mode === 'NO_ACCOUNT') await db.caseBalance.delete({ where: { caseId } });
      const before = await snapshot(); expect((await post(route)).status).toBe(['VIEWER','CLOSED','ARCHIVED'].includes(mode) ? 403 : 409);
      expect(await snapshot()).toEqual(before);
    }
  });
  it('payment profile is fail-closed and retains the existing L2 action class', () => {
    expect(ACTION_MATRIX.find(row => row.actionCode === ActionCode.RECORD_EXPENSE_PAYMENT)).toMatchObject({ riskLevel: RiskLevel.MEDIUM, failMode: 'CLOSED', resolverFailureMode: 'FAIL_CLOSED', gateSeverity: 'HARD', cpeRequiredMandatory: true, stageIndependent: true });
    expect(classifyAction(ActionCode.RECORD_EXPENSE_PAYMENT)).toBe(classifyAction(ActionCode.RECORD_COLLECTION));
  });
});
