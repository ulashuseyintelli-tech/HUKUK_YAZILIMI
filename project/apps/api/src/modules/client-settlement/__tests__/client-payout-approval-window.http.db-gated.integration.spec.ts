import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { seedTm47dHappyPathFixture, cleanupTm47dHappyPathFixture, Tm47dHappyPathSeedResult } from '../../../scripts/tm47d-happy-path-seed';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../../auth/guards/viewer-write-deny.guard';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeApprovalController } from '../../office-approval/office-approval.controller';
import { PayoutApprovalPolicy } from '../../office-approval/client-payout-approval.policy';
import { ClientPayoutService } from '../client-payout.service';
import { ClientPayoutController } from '../client-payout.controller';
import { ClientSettlementReadService } from '../client-settlement-read.service';
import { payoutLockKey } from '../payout-lock';

const DB = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !DB) throw new Error('M4 payout HTTP/DB acceptance requires TEST_DATABASE_URL in CI; SKIP is not acceptance.');
const describeDb = DB ? describe : describe.skip;
const HOURS_168 = 168 * 60 * 60 * 1000;

function testTckn(index: number): string {
  const d = String(100000000 + index).split('').map(Number);
  d.push(((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - d[1] - d[3] - d[5] - d[7] + 100) % 10);
  d.push(d.reduce((sum, value) => sum + value, 0) % 10);
  return d.join('');
}

/** Real HTTP, JWT signature/strategy, DB-backed AuthService, policies and financial writers. No guard or financial service is mocked. */
describeDb('M-4/J-08 payout actor A, 168 hours and idempotency (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient;
  let app: INestApplication;
  let jwt: JwtService;
  let payout: ClientPayoutService;
  let audit: AuditService;
  let fixture: Tm47dHappyPathSeedResult;
  let seedKey: string;
  let otherTenant: string;
  let actors: Record<string, string>;

  const bearer = (id: string) => jwt.sign({ sub: id, tenantId: 'ignored-token-claim', role: 'ADMIN', tokenVersion: 0 });
  const post = (url: string, user: string, body: unknown) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${bearer(user)}`).send(body);
  const get = (url: string, user: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${bearer(user)}`);
  const dto = (over: Record<string, unknown> = {}) => ({ caseId: fixture.payableCaseId, caseClientId: fixture.payableCaseClientId,
    amount: '400', currency: 'TRY', note: 'M4 acceptance', idempotencyKey: seedKey + '-payout', ...over });
  const financialRows = async () => ({
    payouts: await prisma.clientPayout.findMany({ where: { tenantId: fixture.tenantId }, orderBy: { id: 'asc' } }),
    allocations: await prisma.clientPayoutAllocation.findMany({ where: { tenantId: fixture.tenantId }, orderBy: { id: 'asc' } }),
    journals: await prisma.accountingJournalEntry.findMany({ where: { tenantId: fixture.tenantId }, orderBy: { id: 'asc' } }),
    journalLines: await prisma.accountingJournalLine.findMany({ where: { tenantId: fixture.tenantId }, orderBy: { id: 'asc' } }),
    successAudit: await prisma.auditLog.findMany({ where: { tenantId: fixture.tenantId, action: 'CLIENT_PAYOUT_CREATED' }, orderBy: { id: 'asc' } }),
  });
  const approved = async (requester = fixture.plainUserId, approver = fixture.actorUserId) => {
    const opened = await post('/client-payouts/request', requester, dto()).expect(201);
    const id = opened.body.data.approvalRequestId as string;
    expect(opened.body.data.status).toBe('PENDING_APPROVAL');
    await post(`/office-approvals/${id}/approve`, approver, {}).expect(201);
    return id;
  };
  const setAge = (id: string, age: number | null) => prisma.officeApprovalRequest.update({ where: { id }, data: { decidedAt: age === null ? null : new Date(Date.now() - age) } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB } } });
    await prisma.$connect();
    const secret = 'm4-disposable-only-' + randomUUID();
    jwt = new JwtService({ secret, signOptions: { expiresIn: '10m' } });
    audit = new AuditService(prisma as any);
    const policy = new PayoutApprovalPolicy(prisma as any);
    const approvals = new OfficeApprovalService(prisma as any, audit, undefined, policy);
    const reads = new ClientSettlementReadService(prisma as any);
    payout = new ClientPayoutService(prisma as any, reads, audit, approvals, policy);
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret })],
      controllers: [ClientPayoutController, OfficeApprovalController],
      providers: [
        JwtAuthGuard, ViewerWriteDenyGuard, JwtStrategy,
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: AuthService, useValue: new AuthService(prisma as any, jwt) },
        { provide: PrismaService, useValue: prisma },
        { provide: ClientPayoutService, useValue: payout },
        { provide: ClientSettlementReadService, useValue: reads },
        { provide: OfficeApprovalService, useValue: approvals },
      ],
    }).compile();
    if (module.get(ConfigService).get('JWT_SECRET') !== secret) throw new Error('Isolated JWT secret mismatch');
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(async () => {
    seedKey = 'm4-' + randomUUID().slice(0, 12);
    fixture = await seedTm47dHappyPathFixture(prisma, { seedKey });
    await prisma.lawyer.update({ where: { userId: fixture.actorUserId }, data: { tckn: testTckn(1) } });
    await prisma.lawyer.update({ where: { userId: fixture.plainUserId }, data: { tckn: testTckn(2) } });
    otherTenant = seedKey + '-other';
    await prisma.tenant.create({ data: { id: otherTenant, name: 'M4 other test tenant', slug: otherTenant } });
    actors = {};
    const cases = [
      { name: 'manager', rank: 'MANAGER', flag: false, role: 'USER', active: true },
      { name: 'delegate', rank: 'LAWYER', flag: true, role: 'USER', active: true },
      { name: 'partner', rank: 'PARTNER', flag: false, role: 'USER', active: true },
      { name: 'viewer', rank: 'PARTNER', flag: false, role: 'VIEWER', active: true },
      { name: 'inactive', rank: 'PARTNER', flag: false, role: 'USER', active: false },
      { name: 'staff', rank: null, flag: false, role: 'USER', active: true },
      { name: 'admin', rank: null, flag: false, role: 'ADMIN', active: true },
      { name: 'foreign', rank: 'PARTNER', flag: false, role: 'USER', active: true },
    ] as const;
    for (const [index, value] of cases.entries()) {
      const tenantId = value.name === 'foreign' ? otherTenant : fixture.tenantId;
      const user = await prisma.user.create({ data: { tenantId, name: 'M4', surname: value.name, email: `${seedKey}-${value.name}@example.test`, role: value.role, isActive: value.active } });
      actors[value.name] = user.id;
      if (value.rank) await prisma.lawyer.create({ data: { tenantId, userId: user.id, name: 'M4', surname: value.name,
        lawyerRank: value.rank, canApproveOfficeActions: value.flag, tckn: testTckn(index + 3) } });
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (!fixture) return;
    await prisma.accountingJournalLine.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.accountingJournalEntry.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.officeApprovalRequest.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId: fixture.tenantId } });
    await cleanupTm47dHappyPathFixture(prisma, { seedKey });
    await prisma.lawyer.deleteMany({ where: { tenantId: otherTenant } });
    await prisma.user.deleteMany({ where: { tenantId: otherTenant } });
    await prisma.tenant.deleteMany({ where: { id: otherTenant } });
  });
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });

  it.each(['manager', 'delegate', 'partner'])('actor A: a different eligible %s can read and finalize the approved payout', async (name) => {
    const id = await approved();
    const detail = await get(`/office-approvals/${id}`, actors[name]).expect(200);
    expect(detail.body.data.payoutExecution.canFinalize).toBe(true);
    expect(detail.body.data.approverUserId).not.toBe(actors[name]);
    const response = await post(`/client-payouts/${id}/finalize`, actors[name], dto()).expect(201);
    expect(response.body.data.created).toBe(true);
    const rows = await financialRows();
    expect(rows.payouts).toHaveLength(1);
    expect(rows.payouts[0]).toMatchObject({ paidById: actors[name], currency: 'TRY' });
    expect(rows.payouts[0].amount.toString()).toBe('400');
    expect(rows.allocations.reduce((n, row) => n + Number(row.amount), 0)).toBe(400);
    expect(rows.successAudit).toHaveLength(1);
  });

  it.each([['staff', 403], ['admin', 403], ['viewer', 403], ['inactive', 401], ['foreign', 404]] as const)(
    'actor %s is denied before financial effects (%i)', async (name, status) => {
      const id = await approved();
      const before = await financialRows();
      await post(`/client-payouts/${id}/finalize`, actors[name], dto()).expect(status);
      expect(await financialRows()).toEqual(before);
    });

  it('MANAGER inbox exposes only payout and cannot read another action; summary remains a safe projection', async () => {
    const id = await approved();
    const other = await prisma.officeApprovalRequest.create({ data: { tenantId: fixture.tenantId, actionCode: 'CHANGE_STATUS',
      targetType: 'LegalCase', targetRef: fixture.payableCaseId, requesterUserId: fixture.plainUserId,
      status: 'APPROVED', savedIntent: { secret: 'not visible to payout-only manager' }, payloadHash: 'a'.repeat(64) } });
    const response = await get('/office-approvals/inbox?status=APPROVED', actors.manager).expect(200);
    expect(response.body.data.map((r: any) => r.id)).toEqual([id]);
    expect(response.body.data[0]).not.toHaveProperty('savedIntent');
    await get(`/office-approvals/${other.id}`, actors.manager).expect(404);
    await get(`/office-approvals/${id}`, actors.foreign).expect(404);
  });

  it('VER-36 self approve is retained but self reject and revision remain denied', async () => {
    const id = (await post('/client-payouts/request', fixture.actorUserId, dto()).expect(201)).body.data.approvalRequestId;
    await post(`/office-approvals/${id}/reject`, fixture.actorUserId, { note: 'self reject' }).expect(400);
    await post(`/office-approvals/${id}/request-revision`, fixture.actorUserId, { note: 'self revision' }).expect(400);
    await post(`/office-approvals/${id}/approve`, fixture.actorUserId, {}).expect(201);
    await post(`/client-payouts/${id}/finalize`, fixture.actorUserId, dto()).expect(201);
  });

  it.each([HOURS_168 + 1000, null])('expired or missing original decision date (%s) rejects 409 with unchanged financial rows', async (age) => {
    const id = await approved();
    await setAge(id, age);
    const before = await financialRows();
    const response = await post(`/client-payouts/${id}/finalize`, actors.manager, dto()).expect(409);
    expect(response.body.code).toBe('PAYOUT_APPROVAL_EXPIRED');
    expect(await financialRows()).toEqual(before);
    const stored = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } });
    expect(stored.executionStatus).toBe('NOT_RUN');
  });

  it('a still-valid old approval creates exactly one payout', async () => {
    const id = await approved();
    await setAge(id, HOURS_168 - 60_000);
    await post(`/client-payouts/${id}/finalize`, actors.manager, dto()).expect(201);
    expect((await financialRows()).payouts).toHaveLength(1);
  });

  it('later revocation of the historical approver does not revoke another currently eligible finalizer', async () => {
    const id = await approved();
    await prisma.user.update({ where: { id: fixture.actorUserId }, data: { isActive: false } });
    await post(`/client-payouts/${id}/finalize`, actors.manager, dto()).expect(201);
    expect((await financialRows()).payouts[0].paidById).toBe(actors.manager);
  });

  it('decision time is re-read after a real advisory lock wait; expired approval cannot write', async () => {
    const id = await approved();
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((r) => { locked = r; });
    const held = new Promise<void>((r) => { release = r; });
    const blocking = prisma.$transaction(async (tx) => {
      const key = payoutLockKey(fixture.tenantId, fixture.payableCaseId, fixture.payableCaseClientId, 'TRY');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      locked();
      await held;
    }, { timeout: 10_000 });
    await ready;
    const call = post(`/client-payouts/${id}/finalize`, actors.manager, dto()).then((res) => res);
    try {
      // Observe the real financial query waiting on the advisory lock, rather than assuming a delay reaches it.
      let waiting = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
            AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'
            AND query LIKE '%pg_advisory_xact_lock%'`;
        if (Number(rows[0].count) > 0) { waiting = true; break; }
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(waiting).toBe(true);
      await setAge(id, HOURS_168 + 1000);
    } finally { release(); await blocking; }
    const response = await call;
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PAYOUT_APPROVAL_EXPIRED');
    expect((await financialRows()).payouts).toHaveLength(0);
  });

  it('recorded same-key replay after expiry creates no duplicate payout/allocation/journal/success audit', async () => {
    const id = await approved();
    const first = await post(`/client-payouts/${id}/finalize`, actors.manager, dto()).expect(201);
    await setAge(id, HOURS_168 + 1000);
    await prisma.officeApprovalRequest.update({ where: { id }, data: { executionStatus: 'NOT_RUN' } });
    const before = await financialRows();
    const detail = await get(`/office-approvals/${id}`, actors.partner).expect(200);
    expect(detail.body.data.payoutExecution).toMatchObject({ approvalExpired: true, canFinalize: true, canRequestRenewal: false, recordedPayoutId: first.body.data.payoutId });
    const replay = await post(`/client-payouts/${id}/finalize`, actors.partner, dto()).expect(201);
    expect(replay.body.data).toEqual({ created: false, payoutId: first.body.data.payoutId, idempotentReplay: true });
    expect(await financialRows()).toEqual(before);
    await post('/client-payouts/request', actors.partner, dto({ renewApprovalRequestId: id })).expect(409);
    expect(await financialRows()).toEqual(before);
  });

  it('sequential and concurrent explicit renewals keep one pending approval and the same financial key; no automatic renewal', async () => {
    const id = await approved();
    await setAge(id, HOURS_168 + 1000);
    const retry = await post('/client-payouts/request', fixture.plainUserId, dto()).expect(201);
    expect(retry.body.data).toMatchObject({ approvalRequestId: id, status: 'APPROVED' });
    const results = await Promise.all([1, 2].map(() => post('/client-payouts/request', actors.manager, dto({ renewApprovalRequestId: id }))));
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const fresh = results[0].body.data.approvalRequestId;
    expect(fresh).not.toBe(id);
    expect(results[1].body.data.approvalRequestId).toBe(fresh);
    const rows = await prisma.officeApprovalRequest.findMany({ where: { tenantId: fixture.tenantId, actionCode: 'CLIENT_PAYOUT_POST' } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === id)?.status).toBe('APPROVED');
    expect(rows.find((r) => r.id === fresh)?.savedIntent).toEqual((await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } })).savedIntent);
    expect((await financialRows()).payouts).toHaveLength(0);
    await post(`/office-approvals/${fresh}/approve`, actors.manager, {}).expect(201);
    const staleRenewal = await post('/client-payouts/request', actors.partner, dto({ renewApprovalRequestId: id })).expect(201);
    expect(staleRenewal.body.data).toMatchObject({ approvalRequestId: fresh, status: 'APPROVED' });
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: fixture.tenantId, actionCode: 'CLIENT_PAYOUT_POST' } })).toBe(2);
    await post(`/client-payouts/${fresh}/finalize`, actors.partner, dto()).expect(201);
    expect((await financialRows()).payouts[0].idempotencyKey).toBe(dto().idempotencyKey);
  });

  it.each([{ amount: '401' }, { currency: 'USD' }, { caseId: 'wrong-parent' }, { caseClientId: 'wrong-creditor' }])(
    'wrong approved amount/currency/parent is denied without effects: %j', async (change) => {
      const id = await approved();
      const before = await financialRows();
      await post(`/client-payouts/${id}/finalize`, actors.manager, dto(change)).expect(409);
      expect(await financialRows()).toEqual(before);
    });

  it('a valid renewal cannot be requested early or with a different intent', async () => {
    const id = await approved();
    await post('/client-payouts/request', actors.manager, dto({ renewApprovalRequestId: id })).expect(409);
    await setAge(id, HOURS_168 + 1000);
    await post('/client-payouts/request', actors.manager, dto({ renewApprovalRequestId: id, amount: '401' })).expect(409);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: fixture.tenantId, actionCode: 'CLIENT_PAYOUT_POST' } })).toBe(1);
    expect((await financialRows()).payouts).toHaveLength(0);
  });

  it('transaction audit failure rolls back payout, allocations and journal; same-key retry can later succeed', async () => {
    const id = await approved();
    const before = await financialRows();
    const original = audit.logInTransaction.bind(audit);
    const failing = jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx, entry) => {
      if (entry.action === 'CLIENT_PAYOUT_CREATED') throw new Error('M4 isolated audit failure');
      return original(tx, entry);
    });
    await post(`/client-payouts/${id}/finalize`, actors.manager, dto()).expect(500);
    expect(await financialRows()).toEqual(before);
    failing.mockRestore();
    await post(`/client-payouts/${id}/finalize`, actors.manager, dto()).expect(201);
    expect((await financialRows()).payouts).toHaveLength(1);
  });
});
