import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe, ConflictException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { CpeRequiredGuard } from '../../policy-engine';
import { ExpenseRequestController } from '../expense-request.controller';
import { ExpenseRequestService } from '../expense-request.service';
import { ExpenseCalculatorService } from '../expense-calculator.service';
import { ExpenseNotificationService } from '../expense-notification.service';
import { ExpenseGateService } from '../expense-gate.service';
import { ExpenseViewService } from '../expense-view.service';
import { resolveExpenseTarget } from '../expense-target';
import { stageExpenseRequestFingerprint } from '../stage-expense-idempotency';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('3B: disposable TEST_DATABASE_URL required in CI');
const dbDescribe = url ? describe : describe.skip;

/** Real HTTP + production controllers, role guard, Prisma transactions and journal.
 * No transport is connected. No live DB or fixture outside the disposable DB.
 */
dbDescribe('3b canonical expense target (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(90_000);
  let db: PrismaClient, app: INestApplication, service: ExpenseRequestService;
  let tenantId: string, foreignTenant: string, userId: string, viewerId: string, adminId: string, foreignId: string;
  let a: string, b: string, outsider: string, foreignClient: string;
  const suffix = randomUUID().slice(0, 8);
  const calculator = new ExpenseCalculatorService({ getActiveSharedTariff: () => undefined } as never);
  const transport = { dispatch: jest.fn(), sendEmail: jest.fn() };
  const send = (actor: string, path: string, body: object) => request(app.getHttpServer()).post(path).set('x-user', actor).send(body);
  const paths = ['manual', 'package', 'opening', 'stage'] as const;
  type Path = typeof paths[number];
  const create = (path: Path, caseId: string, target: unknown = undefined, actor = userId, key?: string) => {
    const body = { ...(target !== undefined ? { clientId: target } : {}), ...(key ? { idempotencyKey: key } : {}) };
    if (path === 'manual') return send(actor, '/expense-requests', { ...body, caseId, items: [{ type: 'TEBLIGAT_GIDERI', description: 'Tebligat gideri', amount: 100 }] });
    if (path === 'package') return send(actor, '/expense-requests/from-package', { ...body, caseId, packageCode: '3b-fixture', items: [{ itemCode: 'TEBLIGAT_GIDERI', label: 'Gider', suggestedAmount: 100, finalAmount: 100 }] });
    return send(actor, `/expense-requests/case/${caseId}/${path === 'opening' ? 'opening' : 'stage/RE_NOTIFICATION'}`, body);
  };
  const fixture = async (clients: string[], legacy: string | null = outsider) => {
    const c = await db.case.create({ data: { tenantId, fileNumber: `3b-${randomUUID()}`, type: 'GENERAL_EXECUTION', currency: 'TRY', clientId: legacy } });
    for (const clientId of clients) await db.caseClient.create({ data: { caseId: c.id, clientId } });
    return c.id;
  };
  const footprint = async (caseId: string) => ({
    requests: await db.expenseRequest.findMany({ where: { caseId }, include: { requestItems: true, auditLogs: true }, orderBy: { id: 'asc' } }),
    journals: await db.accountingJournalEntry.findMany({ where: { caseId }, include: { lines: true }, orderBy: { id: 'asc' } }),
    notifications: await db.clientNotification.count({ where: { tenantId } }),
    tasks: await db.task.count({ where: { tenantId } }),
    dispatches: transport.dispatch.mock.calls.length + transport.sendEmail.mock.calls.length,
  });
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url } } }); await db.$connect();
    tenantId = (await db.tenant.create({ data: { name: '3b test', slug: `3b-${suffix}` } })).id;
    foreignTenant = (await db.tenant.create({ data: { name: '3b other', slug: `3b-other-${suffix}` } })).id;
    const user = async (role: 'USER'|'ADMIN'|'VIEWER', tenant = tenantId) => (await db.user.create({ data: { tenantId: tenant, name: role, surname: '3b', email: `${randomUUID()}@example.test`, role } })).id;
    userId = await user('USER'); adminId = await user('ADMIN'); viewerId = await user('VIEWER'); foreignId = await user('USER', foreignTenant);
    const client = async (tenant = tenantId) => (await db.client.create({ data: { tenantId: tenant, type: 'COMPANY', displayName: `3b-${randomUUID()}` } })).id;
    a = await client(); b = await client(); outsider = await client(); foreignClient = await client(foreignTenant);
    service = new ExpenseRequestService(db as unknown as PrismaService, {} as never, calculator, {} as never, transport as never, {} as never);
    const identity: CanActivate = { canActivate: async (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest(); const u = await db.user.findUnique({ where: { id: String(req.headers['x-user']) } });
      if (!u?.isActive) throw new UnauthorizedException(); req.user = u; return true;
    } };
    const module = await Test.createTestingModule({ controllers: [ExpenseRequestController], providers: [
      { provide: ExpenseRequestService, useValue: service }, { provide: ExpenseGateService, useValue: {} },
      { provide: ExpenseNotificationService, useValue: {} }, { provide: ExpenseViewService, useValue: {} },
      { provide: ExpenseCalculatorService, useValue: calculator },
    ] }).overrideGuard(AuthGuard('jwt')).useValue(identity).overrideGuard(CpeRequiredGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => { await app?.close(); for (const id of [tenantId, foreignTenant]) if (id) await db.tenant.deleteMany({ where: { id } }); await db?.$disconnect(); });

  describe.each(paths)('%s writer', path => {
    it('zero canonical targets: rejects even with a legacy target, with no side effects', async () => {
      const id = await fixture([]); const before = await footprint(id);
      const result = await create(path, id); expect(result.status).toBe(409); expect(result.body.code).toBe('EXPENSE_TARGET_MISSING');
      expect(await footprint(id)).toEqual(before);
    });
    it('one canonical target works with no legacy link; target and journal agree', async () => {
      const id = await fixture([a], null); const result = await create(path, id);
      expect({ status: result.status, body: result.body }).toMatchObject({ status: 201, body: { caseId: id, clientId: a } });
      const state = await footprint(id); expect(state.requests).toHaveLength(1); expect(state.journals).toHaveLength(1);
      expect(state.journals[0].lines).toHaveLength(2);
      expect(state.journals[0].lines.every(line => line.clientId === a && line.expenseRequestId === result.body.id)).toBe(true);
      expect(state.dispatches).toBe(0);
    });
    it('multiple targets require an explicit choice; second creditor is preserved', async () => {
      const id = await fixture([a, b]); const before = await footprint(id);
      const missing = await create(path, id); expect(missing.status).toBe(409); expect(missing.body.code).toBe('EXPENSE_TARGET_REQUIRED'); expect(await footprint(id)).toEqual(before);
      const selected = await create(path, id, b); expect(selected.status).toBe(201); expect(selected.body.clientId).toBe(b);
    });
    it.each([null, '', 1, [], {}])('rejects malformed target %p without substituting sole candidate', async target => {
      const id = await fixture([a]); const before = await footprint(id);
      const result = await create(path, id, target); expect(result.status).toBe(400); expect(result.body.code).toBe('EXPENSE_TARGET_INVALID'); expect(await footprint(id)).toEqual(before);
    });
    it('rejects unrelated, foreign-tenant and non-creditor targets even for ADMIN', async () => {
      const id = await fixture([a, b, foreignClient]); await db.caseClient.update({ where: { caseId_clientId: { caseId: id, clientId: b } }, data: { role: 'VEKIL' } });
      const before = await footprint(id);
      for (const target of [outsider, b, foreignClient]) { const res = await create(path, id, target, adminId); expect(res.status).toBe(400); expect(res.body.code).toBe('EXPENSE_TARGET_INVALID'); }
      expect(await footprint(id)).toEqual(before);
    });
    it('tenant and VIEWER gates remain independent of membership', async () => {
      const id = await fixture([a]); const before = await footprint(id);
      expect((await create(path, id, a, foreignId)).status).toBe(404);
      expect((await create(path, id, a, viewerId)).status).toBe(403);
      expect(await footprint(id)).toEqual(before);
    });
  });
  it('selection made before removal cannot authorize a later write', async () => {
    const id = await fixture([a]); await db.caseClient.delete({ where: { caseId_clientId: { caseId: id, clientId: a } } });
    const before = await footprint(id); const result = await create('manual', id, a);
    expect(result.status).toBe(400); expect(await footprint(id)).toEqual(before);
  });
  it('stage key binds target; same intent replays, different target conflicts without writes', async () => {
    const id = await fixture([a, b]); const key = `3b-${randomUUID()}`;
    const first = await create('stage', id, b, userId, key); expect(first.status).toBe(201);
    const before = await footprint(id);
    const replay = await create('stage', id, b, userId, key); expect(replay.status).toBe(201); expect(replay.body).toMatchObject({ id: first.body.id, clientId: b, idempotentReplay: true });
    const changed = await create('stage', id, a, userId, key); expect(changed.status).toBe(409); expect(changed.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT'); expect(await footprint(id)).toEqual(before);
  });
  it('provable legacy replay is preserved byte-for-byte; legacy hash never authorizes another target', async () => {
    const id = await fixture([a, b]); const key = `3b-old-${randomUUID()}`;
    const old = await db.expenseRequest.create({ data: { tenantId, caseId: id, clientId: a, stageCode: 'RE_NOTIFICATION', createdById: userId, totalAmount: 100, idempotencyKey: key, requestFingerprint: stageExpenseRequestFingerprint({ caseId: id, stageCode: 'RE_NOTIFICATION' }) } });
    expect((await create('stage', id, a, userId, key)).body).toMatchObject({ id: old.id, idempotentReplay: true });
    const denied = await create('stage', id, b, userId, key); expect(denied.status).toBe(409); expect(denied.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    expect(await db.expenseRequest.findUnique({ where: { id: old.id } })).toEqual(old);
  });
  it.each(paths)('%s: journal failure rolls back request/items/CREATED audit and all effects', async path => {
    const id = await fixture([a]); const before = await footprint(id);
    const spy = jest.spyOn(service as any, 'writeExpenseRequestRecordedJournal').mockRejectedValueOnce(new ConflictException('injected journal failure'));
    try { expect((await create(path, id)).status).toBe(409); expect(await footprint(id)).toEqual(before); } finally { spy.mockRestore(); }
  });
  it('row locks exclude membership/role changes and a second target during the writing transaction', async () => {
    const id = await fixture([a]); let release!: () => void, entered!: () => void;
    const held = new Promise<void>(r => { release = r; }); const ready = new Promise<void>(r => { entered = r; });
    const writer = db.$transaction(async tx => { expect(await resolveExpenseTarget(tx, id, tenantId)).toBe(a); entered(); await held; }, { timeout: 10_000 });
    await ready;
    try {
      for (const change of [
        (tx: any) => tx.caseClient.update({ where: { caseId_clientId: { caseId: id, clientId: a } }, data: { role: 'VEKIL' } }),
        (tx: any) => tx.caseClient.delete({ where: { caseId_clientId: { caseId: id, clientId: a } } }),
        (tx: any) => tx.caseClient.create({ data: { caseId: id, clientId: b } }),
      ]) await expect(db.$transaction(async tx => { await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '150ms'"); await change(tx); })).rejects.toThrow(/lock timeout/);
    } finally { release(); await writer; }
    expect(await db.caseClient.count({ where: { caseId: id, role: 'ALACAKLI' } })).toBe(1);
  });
  it('opening status reports selection need without returning candidate identities', async () => {
    const id = await fixture([a,b]); const status = await service.getOpeningExpenseAutomationStatus(id, tenantId);
    expect(status.expenseTarget).toMatchObject({ available: true, selectionRequired: true }); expect(status.expenseTarget).not.toHaveProperty('candidates'); expect(status.openingRequestExists).toBe(false);
  });
});
