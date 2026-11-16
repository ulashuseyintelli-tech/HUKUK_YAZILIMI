import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { addExpenseRequest, addLedgerRow, addPayout, addPostedPayable, cleanupTenant, createCase,
  createClient, createTenantWithUser, linkClient, type TenantFixture } from '../../../../test/client-currency-fixture';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuditService } from '../../audit/audit.service';
import { AccountingJournalCutoverReadinessService } from '../../accounting-journal/accounting-journal-cutover-readiness.service';
import { CaseViewScopeService } from '../../case/case-view-scope.service';
import { WorkScopePermissionService } from '../../work-scope-permission/work-scope-permission.service';
import { ClientAccountingController } from '../client-accounting.controller';
import { ClientAccountingSummaryReadService } from '../client-accounting-summary-read.service';
import { ClientAccountingMovementsReadService } from '../client-accounting-movements-read.service';
import { ClientSettlementReadService } from '../client-settlement-read.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('G2 acceptance requires the approved disposable TEST_DATABASE_URL.');
const describeDb = url ? describe : describe.skip;
const at = new Date('2026-10-01T10:00:00Z');

describeDb('G2 native General Account (real HTTP and disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);
  let db: PrismaClient, app: INestApplication, t1: TenantFixture, t2: TenantFixture, otherUser: string;
  let read: ClientSettlementReadService;
  const suffix = randomUUID().slice(0, 9); let seq = 0;
  const key = () => `${suffix}-${++seq}`;
  const previousFlag = process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED;
  const readiness = jest.fn();

  beforeAll(async () => {
    process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect();
    t1 = await createTenantWithUser(db, suffix, 'g2a'); t2 = await createTenantWithUser(db, suffix, 'g2b');
    otherUser = (await db.user.create({ data: { tenantId: t1.tenantId, email: `g2-other-${suffix}@example.test`, name: 'Other', surname: 'G2', role: 'USER' } })).id;
    const module = await Test.createTestingModule({ controllers: [ClientAccountingController], providers: [
      ClientSettlementReadService, ClientAccountingSummaryReadService, CaseViewScopeService, WorkScopePermissionService,
      { provide: PrismaService, useValue: db }, { provide: ClientAccountingMovementsReadService, useValue: {} },
      { provide: AuditService, useValue: { logInTransaction: jest.fn(() => { throw new Error('Unexpected mutation audit'); }) } },
      { provide: AccountingJournalCutoverReadinessService, useValue: { getCutoverReadiness: readiness } },
    ] }).overrideGuard(JwtAuthGuard).useValue(new class implements CanActivate {
      async canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id'] ?? '') }, include: { tenant: true } });
        if (!user?.isActive) throw new UnauthorizedException();
        req.user = req.headers['x-test-missing-actor'] ? { tenantId: user.tenantId } : user;
        return true;
      }
    }()).compile();
    read = module.get(ClientSettlementReadService);
    app = module.createNestApplication(); await app.init();
  });
  afterEach(() => { jest.restoreAllMocks(); readiness.mockClear(); process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED = 'true'; });
  afterAll(async () => {
    await app?.close();
    if (db) {
      for (const t of [t1, t2]) if (t) {
        await db.collectionDispositionExpenseApplication.deleteMany({ where: { tenantId: t.tenantId } });
        await db.clientOffset.deleteMany({ where: { tenantId: t.tenantId } });
        await db.collectionAllocationHold.deleteMany({ where: { tenantId: t.tenantId } });
        await cleanupTenant(db, t.tenantId);
      }
      await db.$disconnect();
    }
    if (previousFlag === undefined) delete process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED;
    else process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED = previousFlag;
  });

  const get = (id: string, actor = t1.userId, legacy = false) => request(app.getHttpServer())
    .get(`/clients/${id}/accounting/summary${legacy ? '?currency=TRY' : '/by-currency'}`).set('x-test-user-id', actor);
  async function fixture(currency: 'TRY' | 'USD' | 'EUR' = 'TRY', tenant = t1, clientId?: string, creator = tenant.userId) {
    const client = clientId ?? await createClient(db, tenant.tenantId, `g2-${key()}`);
    const caseId = await createCase(db, { tenantId: tenant.tenantId, clientId: client, userId: creator, fileNumber: `G2-${key()}`, currency });
    const cc = await linkClient(db, caseId, client, tenant.userId);
    return { clientId: client, caseId, cc, tenant };
  }
  async function payable(f: Awaited<ReturnType<typeof fixture>>, amount: number, currency = 'TRY') {
    await addPostedPayable(db, { tenantId: f.tenant.tenantId, caseId: f.caseId, caseClientId: f.cc,
      userId: f.tenant.userId, amount, currency, postedAt: at, key: key() });
  }
  async function expense(f: Awaited<ReturnType<typeof fixture>>, amount = 200, paid = 20, currency = 'TRY') {
    const id = await addExpenseRequest(db, { tenantId: f.tenant.tenantId, clientId: f.clientId, caseId: f.caseId,
      userId: f.tenant.userId, amount, currency, createdAt: at });
    return db.expenseRequest.update({ where: { id }, data: { paidTotal: paid } });
  }
  function unavailable(res: request.Response) {
    expect(res.status).toBe(409); expect(res.body.code).toBe('CLIENT_ACCOUNTING_NATIVE_SUMMARY_UNAVAILABLE');
    expect(res.body.data).toBeUndefined(); expect(res.body.groups).toBeUndefined();
  }

  async function adjustedExpense() {
    const f = await fixture(); await payable(f, 600); const e = await expense(f);
    const disposition = await db.collectionDisposition.findFirstOrThrow({ where: { caseId: f.caseId } });
    await db.collection.update({ where: { id: disposition.collectionId }, data: { amount: 675 } });
    await db.collectionDisposition.update({ where: { id: disposition.id }, data: { totalAmount: 675 } });
    const offset = (amount: number, kind: 'APPLY' | 'REVERSAL', reversesOffsetId?: string) => db.clientOffset.create({ data: {
      tenantId: t1.tenantId, clientId: f.clientId, amount, currency: 'TRY', kind,
      payableCaseId: f.caseId, payableCaseClientId: f.cc, expenseCaseId: f.caseId, expenseRequestId: e.id,
      idempotencyKey: key(), createdById: t1.userId, reversesOffsetId,
    } });
    const off = await offset(40, 'APPLY'); await offset(40, 'REVERSAL', off.id); await offset(10, 'APPLY');
    const applications = [];
    for (const amount of [25, 50]) {
      const line = await db.collectionDispositionLine.create({ data: { dispositionId: disposition.id,
        type: 'CLIENT_EXPENSE_REIMBURSEMENT', expenseRequestId: e.id, amount } });
      applications.push(await db.collectionDispositionExpenseApplication.create({ data: { tenantId: t1.tenantId,
        caseId: f.caseId, expenseRequestId: e.id, collectionDispositionId: disposition.id, collectionDispositionLineId: line.id,
        kind: 'APPLY', amount, currency: 'TRY', reimbursementScope: 'CLIENT_FRONTED' } }));
    }
    await db.collectionDispositionExpenseApplication.create({ data: { ...applications[0], id: undefined, kind: 'REVERSAL',
      reversesApplicationId: applications[0].id } });
    return { f, e, applications };
  }

  it('reuses canonical remaining with offset and reimbursement APPLY/REVERSAL, without changing paidTotal', async () => {
    const { f, e } = await adjustedExpense(); const before = await db.expenseRequest.findUniqueOrThrow({ where: { id: e.id } });
    const res = await get(f.clientId); expect(res.status).toBe(200); const g = res.body.data.groups[0];
    expect(g.clientScoped).toMatchObject({ payableNet: '590', expenseRequested: '200', expensePaid: '20',
      expenseUnpaid: '120', offsetApplied: '10', offsettableNetPosition: '470' });
    expect(g.caseBreakdown[0]).toMatchObject({ payableNet: '590', expenseUnpaid: '120' });
    const canonical = await read.computeExpenseRemaining(db as any, t1.tenantId, e.id, e.totalAmount, e.paidTotal);
    expect(g.clientScoped.expenseUnpaid).toBe(canonical.toString());
    expect(await db.expenseRequest.findUniqueOrThrow({ where: { id: e.id } })).toEqual(before);
  });

  it.each(['offset', 'application'])('rejects a mixed-currency %s instead of computing a partial remaining', async kind => {
    const { f, e, applications } = await adjustedExpense();
    if (kind === 'offset') await db.clientOffset.updateMany({ where: { expenseRequestId: e.id }, data: { currency: 'USD' } });
    else await db.collectionDispositionExpenseApplication.update({ where: { id: applications[0].id }, data: { currency: 'USD' } });
    const before = await db.expenseRequest.findUniqueOrThrow({ where: { id: e.id } }); unavailable(await get(f.clientId));
    expect(await db.expenseRequest.findUniqueOrThrow({ where: { id: e.id } })).toEqual(before);
  });

  it('rejects a reimbursement application attached to the wrong real line parent', async () => {
    const { f, applications } = await adjustedExpense(); const other = await fixture(); await payable(other, 15);
    const foreignLine = await db.collectionDispositionLine.findFirstOrThrow({ where: { disposition: { caseId: other.caseId } } });
    await db.collectionDispositionExpenseApplication.update({ where: { id: applications[0].id }, data: { collectionDispositionLineId: foreignLine.id } });
    unavailable(await get(f.clientId));
  });

  it('returns 5000 TRY and 100 USD separately, without FX, common total or journal cutover', async () => {
    const a = await fixture(), b = await fixture('USD', t1, a.clientId);
    await payable(a, 5000); await payable(b, 100, 'USD');
    const res = await get(a.clientId); expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('LEGACY_PROJECTION'); expect(res.body.data.primarySwitchUnchanged).toBe(true);
    expect(Number.isFinite(Date.parse(res.body.data.asOf))).toBe(true);
    expect(res.body.data.groups.map((g: any) => [g.currency, g.clientScoped.payableNet])).toEqual([['TRY', '5000'], ['USD', '100']]);
    expect(res.body.data.total).toBeUndefined(); expect(readiness).not.toHaveBeenCalled();
    expect(res.body.data.groups[1].caseBreakdown.map((r: any) => r.caseId)).toEqual([b.caseId]);
  });

  it('keeps a TRY advance on a USD case separate and case-wide, not client-owned money', async () => {
    const f = await fixture('USD'); await payable(f, 100, 'USD');
    await addLedgerRow(db, { tenantId: t1.tenantId, caseId: f.caseId, amount: 5000, currency: 'TRY', balanceCurrency: 'TRY', createdAt: at });
    const res = await get(f.clientId); expect(res.status).toBe(200);
    const [tryGroup, usd] = res.body.data.groups;
    expect(tryGroup.currency).toBe('TRY'); expect(tryGroup.caseScopedContext.advanceBalance).toBe('5000');
    expect(tryGroup.clientScoped.payableNet).toBe('0'); expect(usd.clientScoped.payableNet).toBe('100');
    expect(tryGroup.caseBreakdown[0].currency).toBe('TRY'); expect(tryGroup.caseBreakdown[0].paraBirimiKapsami).toBeUndefined();
  });

  it('does not create a phantom zero-currency group from Case.currency alone', async () => {
    const f = await fixture('USD'); const res = await get(f.clientId);
    expect(res.status).toBe(200); expect(res.body.data.groups).toEqual([]);
  });

  it('distinguishes an actual zero balance from no records and from unavailable', async () => {
    const f = await fixture(); await db.caseBalance.create({ data: { tenantId: t1.tenantId, caseId: f.caseId, currency: 'TRY', balance: 0 } });
    const res = await get(f.clientId); expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1); expect(res.body.data.groups[0].caseScopedContext.advanceBalance).toBe('0');
  });

  it('counts a shared case once in B and only the target creditor in A', async () => {
    const f = await fixture(); const otherClient = await createClient(db, t1.tenantId, `other-${key()}`);
    const otherCc = await linkClient(db, f.caseId, otherClient, t1.userId);
    await payable(f, 500); await payable({ ...f, clientId: otherClient, cc: otherCc }, 700);
    const res = await get(f.clientId); expect(res.status).toBe(200);
    const g = res.body.data.groups[0]; expect(g.clientScoped.payableNet).toBe('500');
    expect(g.caseScopedContext.debtorCollection).toBe('1200'); expect(g.caseBreakdown).toHaveLength(1);
  });

  it.each(['', 'usd', 'not-a-currency'])('rejects source currency %j before returning any partial group', async currency => {
    const f = await fixture(); await expense(f, 50, 0, currency);
    const known = await fixture('USD', t1, f.clientId); await payable(known, 100, 'USD');
    const spy = jest.spyOn(read, 'getClientAccountingSummary'); unavailable(await get(f.clientId));
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a ledger/account currency mismatch instead of silently dropping its currency', async () => {
    const f = await fixture('USD');
    await addLedgerRow(db, { tenantId: t1.tenantId, caseId: f.caseId, amount: 100, currency: 'USD', balanceCurrency: 'TRY', createdAt: at });
    unavailable(await get(f.clientId));
  });

  it('rejects a recorded payout whose real CaseClient parent belongs to another case', async () => {
    const f = await fixture(), b = await fixture('TRY', t1, f.clientId); await payable(f, 100);
    await addPayout(db, { tenantId: t1.tenantId, caseId: b.caseId, caseClientId: f.cc, userId: t1.userId,
      amount: 10, currency: 'TRY', paidAt: at, key: key() }); unavailable(await get(f.clientId));
  });

  it('rejects a client expense without its canonical eligible case relation', async () => {
    const f = await fixture(), b = await fixture();
    await addExpenseRequest(db, { tenantId: t1.tenantId, clientId: f.clientId, caseId: b.caseId,
      userId: t1.userId, amount: 20, currency: 'TRY', createdAt: at });
    unavailable(await get(f.clientId));
  });

  it('rejects a posted disposition/collection currency mismatch', async () => {
    const f = await fixture(); await payable(f, 100);
    await db.collectionDisposition.updateMany({ where: { tenantId: t1.tenantId, caseId: f.caseId }, data: { currency: 'USD' } });
    unavailable(await get(f.clientId));
  });

  it('does not let cross-tenant CaseClient corruption become a client currency group', async () => {
    const f = await fixture(), foreign = await fixture('USD', t2);
    await linkClient(db, foreign.caseId, f.clientId, t1.userId);
    const res = await get(f.clientId); unavailable(res);
    expect(JSON.stringify(res.body)).not.toContain(foreign.caseId);
  });

  it('preserves negative pending distribution and needsReview instead of clamping to zero', async () => {
    const f = await fixture(); await payable(f, 100);
    await db.collectionDisposition.updateMany({ where: { tenantId: t1.tenantId, caseId: f.caseId }, data: { totalAmount: 150 } });
    const res = await get(f.clientId); expect(res.status).toBe(200);
    expect(res.body.data.groups[0].caseScopedContext.pendingDistribution).toBe('-50'); expect(res.body.data.groups[0].needsReview).toBe(true);
  });

  it('preserves HELD separately from distributable pending, without a new formula', async () => {
    const f = await fixture(); await payable(f, 100);
    const c = await db.collection.findFirstOrThrow({ where: { tenantId: t1.tenantId, caseId: f.caseId } });
    await db.collectionDisposition.updateMany({ where: { tenantId: t1.tenantId, caseId: f.caseId }, data: { manualReversalRequiredAt: at } });
    await db.collectionAllocationHold.create({ data: { tenantId: t1.tenantId, caseId: f.caseId, collectionId: c.id,
      amount: 100, currency: 'TRY', status: 'HELD', holdReason: 'ON_BEHALF_DEBTOR_NOT_LIABLE' } });
    const res = await get(f.clientId); expect(res.status).toBe(200);
    const g = res.body.data.groups[0]; expect(g.caseScopedContext.pendingDistribution).toBe('100');
    expect(g.caseScopedContext.allocationHeld).toBe('100'); expect(g.caseScopedContext.pendingDistributionExcludingHeld).toBe('0');
  });

  it('excludes cancelled expenses and manually reversed distributions from G2 inputs', async () => {
    const f = await fixture('USD'); const er = await expense(f, 50, 0, 'bad');
    await db.expenseRequest.update({ where: { id: er.id }, data: { status: 'CANCELLED' } });
    await payable(f, 100, 'USD');
    await db.collectionDisposition.updateMany({ where: { tenantId: t1.tenantId, caseId: f.caseId }, data: { currency: 'bad', manualReversalRequiredAt: at } });
    const res = await get(f.clientId); expect(res.status).toBe(200);
    expect(res.body.data.groups.map((g: any) => g.currency)).toEqual(['USD']);
    expect(res.body.data.groups[0].clientScoped.payableNet).toBe('0');
  });

  it('denies a partial-visible client total rather than returning only the visible currencies', async () => {
    const f = await fixture(); await payable(f, 100);
    const hidden = await fixture('USD', t1, f.clientId, otherUser); await payable(hidden, 100, 'USD');
    const spy = jest.spyOn(read, 'getClientAccountingNativeSummary');
    const res = await get(f.clientId); expect(res.status).toBe(403); expect(res.body.code).toBe('CASE_VIEW_SCOPE_CLIENT_TOTAL');
    expect(spy).not.toHaveBeenCalled(); expect(JSON.stringify(res.body)).not.toContain(hidden.caseId);
  });

  it('preserves the existing flag-OFF total-view behavior without changing the flag contract', async () => {
    process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED = 'false';
    const f = await fixture('USD', t1, undefined, otherUser); await payable(f, 100, 'USD');
    const res = await get(f.clientId); expect(res.status).toBe(200); expect(res.body.data.groups[0].currency).toBe('USD');
  });

  it('rejects a foreign tenant client and does not disclose its currencies', async () => {
    const f = await fixture('USD', t2); await payable(f, 100, 'USD'); const res = await get(f.clientId);
    expect(res.status).toBe(404); expect(res.body.data).toBeUndefined();
  });

  it('rejects an inactive authenticated user before reading the summary', async () => {
    const actor = await db.user.create({ data: { tenantId: t1.tenantId, email: `inactive-${key()}@example.test`, name: 'Inactive', surname: 'G2', role: 'ADMIN', isActive: false } });
    const f = await fixture(); const res = await get(f.clientId, actor.id); expect(res.status).toBe(401);
  });

  it('rejects missing actor identity even when the existing scope flag is OFF', async () => {
    process.env.OFFICE_CASE_VIEW_SCOPE_ENABLED = 'false'; const f = await fixture();
    const spy = jest.spyOn(read, 'getClientAccountingNativeSummary');
    const res = await get(f.clientId).set('x-test-missing-actor', '1'); expect(res.status).toBe(401); expect(spy).not.toHaveBeenCalled();
  });

  it('does not invent a new VIEWER read prohibition or grant it a write operation', async () => {
    const actor = await db.user.create({ data: { tenantId: t1.tenantId, email: `viewer-${key()}@example.test`, name: 'Viewer', surname: 'G2', role: 'VIEWER' } });
    const f = await fixture('TRY', t1, undefined, actor.id); await payable(f, 25);
    const res = await get(f.clientId, actor.id); expect(res.status).toBe(200); expect(res.body.data.groups[0].clientScoped.payableNet).toBe('25');
  });

  it('keeps source discovery and every currency amount in the same real RepeatableRead snapshot', async () => {
    const a = await fixture(), b = await fixture('USD', t1, a.clientId), later = await fixture('EUR', t1, a.clientId);
    await payable(a, 5000); await payable(b, 100, 'USD');
    const original = read.getClientAccountingSummary.bind(read); let injected = false;
    const spy = jest.spyOn(read, 'getClientAccountingSummary').mockImplementation(async (...args) => {
      if (!injected) { injected = true; await payable(b, 50, 'USD'); await payable(later, 45, 'EUR'); }
      return original(...args);
    });
    const first = await get(a.clientId); expect(first.status).toBe(200); expect(injected).toBe(true);
    expect(first.body.data.groups.map((g: any) => [g.currency, g.clientScoped.payableNet])).toEqual([['TRY', '5000'], ['USD', '100']]);
    expect(spy.mock.calls).toHaveLength(2); expect(spy.mock.calls[0][3]).toBe(spy.mock.calls[1][3]); expect(spy.mock.calls[0][3]).not.toBe(db);
    spy.mockRestore(); const next = await get(a.clientId); expect(next.status).toBe(200);
    expect(next.body.data.groups.map((g: any) => [g.currency, g.clientScoped.payableNet])).toEqual([['EUR', '45'], ['TRY', '5000'], ['USD', '150']]);
  });

  it('keeps HELD reads in the same snapshot as source discovery and other amounts', async () => {
    const f = await fixture(); await payable(f, 100);
    await db.collectionDisposition.updateMany({ where: { tenantId: t1.tenantId, caseId: f.caseId }, data: { manualReversalRequiredAt: at } });
    const collection = await db.collection.findFirstOrThrow({ where: { tenantId: t1.tenantId, caseId: f.caseId } });
    const original = read.getClientAccountingSummary.bind(read); let inserted = false;
    const spy = jest.spyOn(read, 'getClientAccountingSummary').mockImplementation(async (...args) => {
      if (!inserted) {
        inserted = true;
        await db.collectionAllocationHold.create({ data: { tenantId: t1.tenantId, caseId: f.caseId, collectionId: collection.id,
          amount: 100, currency: 'TRY', status: 'HELD', holdReason: 'ON_BEHALF_DEBTOR_NOT_LIABLE' } });
      }
      return original(...args);
    });
    const first = await get(f.clientId); expect(first.status).toBe(200); expect(inserted).toBe(true);
    expect(first.body.data.groups[0].caseScopedContext.allocationHeld).toBe('0');
    expect(first.body.data.groups[0].caseScopedContext.pendingDistributionExcludingHeld).toBe('100');
    spy.mockRestore(); const next = await get(f.clientId); expect(next.status).toBe(200);
    expect(next.body.data.groups[0].caseScopedContext.allocationHeld).toBe('100');
  });

  it('preserves legacy single-currency response and performs no financial write during G2 reads', async () => {
    const f = await fixture(); await payable(f, 100); await expense(f, 100, 30);
    const state = async () => Promise.all([db.collection.count({ where: { tenantId: t1.tenantId } }), db.collectionDisposition.count({ where: { tenantId: t1.tenantId } }),
      db.clientPayout.count({ where: { tenantId: t1.tenantId } }), db.clientOffset.count({ where: { tenantId: t1.tenantId } }), db.balanceLedger.count({ where: { tenantId: t1.tenantId } })]);
    const before = await state(); const old = await get(f.clientId, t1.userId, true), current = await get(f.clientId);
    expect(old.status).toBe(200); expect(current.status).toBe(200);
    expect(old.body.data.groups).toBeUndefined(); expect(old.body.data.currency).toBe('TRY');
    expect(old.body.data.paraBirimiDurumu).toBeDefined(); expect(current.body.data.groups[0].paraBirimiDurumu).toBeUndefined();
    expect(current.body.data.groups[0].clientScoped).toEqual(old.body.data.clientScoped); expect(await state()).toEqual(before);
  });
});
