jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('No renderer in 4a acceptance'); } }));
// Rate limiting is outside 4a; prevent the real modules' process-global interval side effects.
jest.mock('../../auth/guards/login-rate-limit.guard', () => ({ PortalLoginRateLimitGuard: class { canActivate() { return true; } } }));
jest.mock('../../auth/guards/credential-recovery-rate-limit.guard', () => ({ CredentialRecoveryRateLimitGuard: class { canActivate() { return true; } } }));
import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as http from 'supertest';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PortalLoginRateLimitGuard } from '../../auth/guards/login-rate-limit.guard';
import { CredentialRecoveryRateLimitGuard } from '../../auth/guards/credential-recovery-rate-limit.guard';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { AuditService } from '../../audit/audit.service';
import { PortalService } from '../../portal/portal.service';
import { PortalController } from '../../portal/portal.controller';
import { PortalAuthGuard } from '../../portal/portal-auth.guard';
import { ClientFinancialDisclosurePortalService } from '../../portal/client-financial-disclosure-portal.service';
import { ClientController } from '../client.controller';
import { ClientService } from '../client.service';
import { ClientIntakeLinkService } from '../../client-intake-link/client-intake-link.service';
import { PoaService } from '../../poa/poa.service';
import * as portalState from '../client-portal-access-state';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('4a HTTP acceptance requires disposable TEST_DATABASE_URL; SKIP is not acceptance');
const dbDescribe = url ? describe : describe.skip;
const PASSWORD = 'Synthetic4aPassword123!';
const RESET = 'synthetic-4a-reset-link';

dbDescribe('4a Client deactivation / portal revocation — real HTTP, JWT and PostgreSQL', () => {
  jest.setTimeout(90_000);
  let db: PrismaService; let app: INestApplication; let audit: AuditService; let core: ClientService; let portal: PortalService;
  let tenant: string; let foreign: string; let clientId: string; let caseId: string; let portalId: string; let email: string;
  let partner: string; let ordinary: string; let viewer: string; let outsider: string; let foreignActor: string; let staff: string;
  const emails = { send: jest.fn(async () => ({ success: true, provider: '4a-test-capture' })) };

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } }, transactionOptions: { timeout: 20_000, maxWait: 20_000 } });
    await db.$connect(); audit = new AuditService(db);
    const approval = new OfficeApprovalService(db, audit);
    core = new ClientService(db, audit, approval);
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'synthetic-4a-test-signing-key', signOptions: { expiresIn: '1h' } })],
      controllers: [ClientController, PortalController],
      providers: [
        { provide: PrismaService, useValue: db }, { provide: AuditService, useValue: audit },
        { provide: OfficeApprovalService, useValue: approval }, { provide: ClientService, useValue: core },
        { provide: ClientIntakeLinkService, useValue: {} }, { provide: PoaService, useValue: {} },
        { provide: ClientFinancialDisclosurePortalService, useValue: {} },
        { provide: ConfigService, useValue: new ConfigService({ PUBLIC_PORTAL_BASE_URL: 'https://portal.test.invalid' }) },
        { provide: '4aEmailCapture', useValue: emails },
        { provide: PortalService, useFactory: (jwt: JwtService, config: ConfigService) => new PortalService(db, jwt, audit, approval, config, emails as any), inject: [JwtService, ConfigService] },
        PortalAuthGuard,
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: async (ctx: any) => {
      const req = ctx.switchToHttp().getRequest(); const id = req.headers['x-test-user-id'];
      if (typeof id !== 'string') throw new UnauthorizedException();
      const user = await db.user.findUnique({ where: { id } });
      if (!user?.isActive) throw new UnauthorizedException(); req.user = user; return true;
    } }).overrideGuard(PortalLoginRateLimitGuard).useValue({ canActivate: () => true })
      .overrideGuard(CredentialRecoveryRateLimitGuard).useValue({ canActivate: () => true }).compile();
    portal = module.get(PortalService);
    app = module.createNestApplication(); app.useLogger(false); await app.init(); await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  async function actor(role: 'USER' | 'ADMIN' | 'VIEWER', rank: 'PARTNER' | 'LAWYER', assigned: boolean, tid = tenant) {
    const u = await db.user.create({ data: { tenantId: tid, role, email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: '4a actor' } });
    const l = await db.lawyer.create({ data: { tenantId: tid, userId: u.id, name: 'Synthetic', surname: '4a Lawyer', lawyerRank: rank } });
    if (assigned) await db.caseLawyer.create({ data: { caseId, lawyerId: l.id } });
    return u.id;
  }
  beforeEach(async () => {
    jest.restoreAllMocks(); emails.send.mockClear();
    tenant = `portal-4a-test-${randomUUID()}`; foreign = `portal-4a-foreign-test-${randomUUID()}`;
    for (const id of [tenant, foreign]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic 4a acceptance' } });
    email = `${randomUUID()}@portal-4a.test`;
    clientId = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Synthetic 4a', displayName: 'Synthetic 4a', firstName: 'Synthetic', lastName: '4a', tckn: '10000000146', phone: '5551112233', email, hasPortalAccess: true } })).id;
    caseId = (await db.case.create({ data: { tenantId: tenant, clientId, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } })).id;
    await db.caseClient.create({ data: { caseId, clientId } });
    partner = await actor('USER', 'PARTNER', true); ordinary = await actor('ADMIN', 'LAWYER', true);
    viewer = await actor('VIEWER', 'PARTNER', true); outsider = await actor('ADMIN', 'PARTNER', false);
    foreignActor = await actor('ADMIN', 'PARTNER', false, foreign);
    const su = await db.user.create({ data: { tenantId: tenant, role: 'USER', email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: 'Staff' } }); staff = su.id;
    const s = await db.staffMember.create({ data: { tenantId: tenant, userId: staff, firstName: 'Synthetic', lastName: 'Staff', staffType: 'SEKRETER' } });
    await db.caseStaff.create({ data: { caseId, staffMemberId: s.id, roleOnCase: 'SEKRETER', canView: true } });
    portalId = (await db.clientPortalUser.create({ data: { clientId, email, passwordHash: await bcrypt.hash(PASSWORD, 4), resetToken: createHash('sha256').update(RESET).digest('hex'), resetTokenExp: new Date(Date.now() + 3_600_000) } })).id;
    await db.client.update({ where: { id: clientId }, data: { portalUserId: portalId } });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (!tenant || !foreign) return;
    const tids = [tenant, foreign];
    await db.auditLog.deleteMany({ where: { tenantId: { in: tids } } });
    await db.task.deleteMany({ where: { tenantId: { in: tids } } });
    await db.clientPortalUser.deleteMany({ where: { client: { tenantId: { in: tids } } } });
    await db.caseStaff.deleteMany({ where: { case: { tenantId: { in: tids } } } });
    await db.caseLawyer.deleteMany({ where: { case: { tenantId: { in: tids } } } });
    await db.caseClient.deleteMany({ where: { case: { tenantId: { in: tids } } } });
    await db.case.deleteMany({ where: { tenantId: { in: tids } } });
    await db.client.deleteMany({ where: { tenantId: { in: tids } } });
    await db.staffMember.deleteMany({ where: { tenantId: { in: tids } } });
    await db.lawyer.deleteMany({ where: { tenantId: { in: tids } } });
    await db.user.deleteMany({ where: { tenantId: { in: tids } } });
    for (const id of tids) await db.tenant.delete({ where: { id } });
  });
  const req = (method: 'post' | 'put' | 'delete', path: string, who = partner, body?: object) => {
    const r = http(app.getHttpServer())[method](path).set('x-test-user-id', who); return body === undefined ? r : r.send(body);
  };
  const login = () => http(app.getHttpServer()).post('/portal/login').send({ email, password: PASSWORD });
  const access = (token: string) => http(app.getHttpServer()).get('/portal/cases').set('authorization', `Bearer ${token}`);
  async function snapshot() {
    return {
      client: await db.client.findUnique({ where: { id: clientId }, select: { isActive: true, hasPortalAccess: true, portalUserId: true } }),
      account: await db.clientPortalUser.findUnique({ where: { clientId }, select: { id: true, isActive: true, tokenVersion: true, resetToken: true, resetTokenExp: true } }),
      audits: await db.auditLog.findMany({ where: { tenantId: tenant, entityId: clientId }, select: { action: true, userId: true, metadata: true }, orderBy: { id: 'asc' } }),
    };
  }
  const deactivate = (route: 'delete' | 'put', who = partner) => req(route, `/clients/${clientId}`, who, route === 'put' ? { isActive: false } : undefined);

  it.each(['delete', 'put'] as const)('%s atomically closes access, revokes old JWT and reset link, preserves rows', async (route) => {
    const signed = await login().expect(201); await access(signed.body.token).expect(200);
    await deactivate(route).expect(200);
    const state = await snapshot();
    expect(state.client).toEqual({ isActive: false, hasPortalAccess: false, portalUserId: portalId });
    expect(state.account).toEqual({ id: portalId, isActive: false, tokenVersion: 1, resetToken: null, resetTokenExp: null });
    expect(state.audits.map(a => a.action)).toEqual(expect.arrayContaining(['CLIENT_PORTAL_ACCESS_DISABLE', route === 'delete' ? 'CLIENT_DELETE' : 'CLIENT_UPDATE']));
    expect(state.audits.every(a => a.userId === partner)).toBe(true);
    const auditJson = JSON.stringify(state.audits);
    for (const secret of [PASSWORD, RESET, signed.body.token, email, createHash('sha256').update(RESET).digest('hex')]) expect(auditJson).not.toContain(secret);
    await access(signed.body.token).expect(401); await login().expect(401);
    await http(app.getHttpServer()).post('/portal/reset-password').send({ token: RESET, password: 'SyntheticNewPassword123!' }).expect(400);
    expect(await snapshot()).toEqual(state);
    expect(await db.case.findUnique({ where: { id: caseId } })).not.toBeNull();
    expect(await db.caseClient.count({ where: { clientId } })).toBe(1);
  });
  it('Client reactivation never opens the account; separate authorized portal enable is required', async () => {
    const signed = await login().expect(201); await deactivate('delete').expect(200);
    await req('put', `/clients/${clientId}`, partner, { isActive: true }).expect(200);
    expect((await snapshot()).account?.isActive).toBe(false); await login().expect(401); await access(signed.body.token).expect(401);
    await req('post', '/portal/admin/create-user', partner, { clientId, email, password: PASSWORD }).expect(201);
    const newLogin = await login().expect(201); await access(newLogin.body.token).expect(200); await access(signed.body.token).expect(401);
    expect((await snapshot()).account?.tokenVersion).toBe(2);
  });
  it('inactive Client cannot be reopened through the existing portal-enable route', async () => {
    await deactivate('delete').expect(200); const before = await snapshot();
    await req('post', '/portal/admin/create-user', partner, { clientId, email, password: PASSWORD }).expect(409);
    expect(await snapshot()).toEqual(before);
  });
  it('unchanged isActive echo preserves portal state and the existing empty CLIENT_UPDATE audit', async () => {
    const before = await snapshot(); await req('put', `/clients/${clientId}`, partner, { isActive: true }).expect(200);
    const after = await snapshot();
    expect(after.client).toEqual(before.client); expect(after.account).toEqual(before.account);
    expect(after.audits).toEqual([{ action: 'CLIENT_UPDATE', userId: partner, metadata: { fieldDiff: [], contactsDiff: { changed: false } } }]);
  });
  it('a Client without a portal account is deactivated without creating an account', async () => {
    await db.client.update({ where: { id: clientId }, data: { portalUserId: null, hasPortalAccess: false } });
    await db.clientPortalUser.delete({ where: { id: portalId } });
    await deactivate('delete').expect(200);
    expect((await snapshot()).account).toBeNull(); expect((await snapshot()).client?.isActive).toBe(false);
  });
  it('actual account is revoked even when hasPortalAccess was already false', async () => {
    await db.client.update({ where: { id: clientId }, data: { hasPortalAccess: false } });
    await deactivate('delete').expect(200); expect((await snapshot()).account?.isActive).toBe(false);
  });
  it.each([['ordinary', 403], ['viewer', 403], ['outsider', 404], ['foreignActor', 404], ['staff', 403]] as const)('%s has no new Client-deactivation authority', async (kind, status) => {
    const who = { ordinary, viewer, outsider, foreignActor, staff }[kind]; const before = await snapshot();
    for (const route of ['delete', 'put'] as const) { expect((await deactivate(route, who)).status).toBe(status); expect(await snapshot()).toEqual(before); }
  });
  it('missing and disabled staff identities cannot close access', async () => {
    const before = await snapshot(); await http(app.getHttpServer()).delete(`/clients/${clientId}`).expect(401);
    await db.user.update({ where: { id: partner }, data: { isActive: false } }); await deactivate('delete').expect(401);
    expect(await snapshot()).toEqual(before);
  });
  it('inactive lawyer profile cannot use an otherwise eligible lifecycle identity', async () => {
    const before = await snapshot();
    await db.lawyer.updateMany({ where: { userId: partner }, data: { isActive: false } });
    await deactivate('delete').expect(404); expect(await snapshot()).toEqual(before);
  });
  it('other Clients and tenants retain their account/version/reset state', async () => {
    const ids: string[] = [];
    for (const tid of [tenant, foreign]) {
      const c = await db.client.create({ data: { tenantId: tid, type: 'PERSON', name: 'Other synthetic Client', hasPortalAccess: true } });
      ids.push(c.id);
      await db.clientPortalUser.create({ data: { clientId: c.id, email: `${randomUUID()}@example.test`, passwordHash: 'unused-synthetic-hash', resetToken: randomUUID(), resetTokenExp: new Date(Date.now() + 60_000) } });
    }
    const before = await db.clientPortalUser.findMany({ where: { clientId: { in: ids } }, orderBy: { id: 'asc' } });
    await deactivate('delete').expect(200);
    expect(await db.clientPortalUser.findMany({ where: { clientId: { in: ids } }, orderBy: { id: 'asc' } })).toEqual(before);
    expect(await db.client.count({ where: { id: { in: ids }, isActive: true, hasPortalAccess: true } })).toBe(2);
  });
  it.each(['CLIENT_PORTAL_ACCESS_DISABLE', 'CLIENT_DELETE'])('real inserted %s audit failure rolls every record back', async (failAt) => {
    const before = await snapshot(); const original = audit.logInTransaction.bind(audit);
    const spy = jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx, input) => { await original(tx, input); if (input.action === failAt) throw new Error('4a injected post-insert audit failure'); });
    try { await deactivate('delete').expect(500); } finally { spy.mockRestore(); }
    expect(await snapshot()).toEqual(before); await login().expect(201);
  });
  it('explicit portal disable retains its own action and closes current JWT', async () => {
    const signed = await login().expect(201); await req('post', '/portal/admin/disable-user', partner, { clientId }).expect(201);
    expect((await snapshot()).client?.isActive).toBe(true); await access(signed.body.token).expect(401);
  });

  async function waitForBlock(pid: number) {
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
      if (rows[0]?.blocked) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('4a competitor never reached the actual PostgreSQL parent lock');
  }
  async function deadline<T>(promise: Promise<T>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('4a lock barrier not reached')), 5000); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  it.each(['absent', 'inactive'] as const)('deactivation wins against %s-account opening: opener reaches lock, then rejects without reopening', async (initial) => {
    await db.client.update({ where: { id: clientId }, data: { hasPortalAccess: false, portalUserId: initial === 'absent' ? null : portalId } });
    if (initial === 'absent') await db.clientPortalUser.delete({ where: { id: portalId } });
    else await db.clientPortalUser.update({ where: { id: portalId }, data: { isActive: false } });
    let entered!: (pid: number) => void; const locked = new Promise<number>(r => { entered = r; });
    let release!: () => void; const held = new Promise<void>(r => { release = r; });
    const original = portalState.disableClientPortalAccessInTx;
    const spy = jest.spyOn(portalState, 'disableClientPortalAccessInTx').mockImplementation(async (...args) => { await original(...args); const rows = await args[0].$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`; entered(rows[0].pid); await held; });
    const first = core.remove(clientId, tenant, { userId: partner }); first.catch(() => undefined);
    let second: Promise<unknown> | undefined;
    try { const pid = await deadline(locked); second = portal.createPortalUser(clientId, email, PASSWORD, tenant, { userId: partner }); second.catch(() => undefined); await waitForBlock(pid); release(); await first; await expect(second).rejects.toThrow('Pasif müvekkile portal erişimi açılamaz'); }
    finally { release(); await Promise.allSettled([first, ...(second ? [second] : [])]); spy.mockRestore(); }
    const state = await snapshot(); expect(state.client?.isActive).toBe(false); expect(state.client?.hasPortalAccess).toBe(false); expect(state.account?.isActive ?? false).toBe(false);
  });
  it.each(['absent', 'inactive'] as const)('%s-account opening wins first: following deactivation also closes the newly enabled account', async (initial) => {
    await db.client.update({ where: { id: clientId }, data: { hasPortalAccess: false, portalUserId: initial === 'absent' ? null : portalId } });
    if (initial === 'absent') await db.clientPortalUser.delete({ where: { id: portalId } });
    else await db.clientPortalUser.update({ where: { id: portalId }, data: { isActive: false } });
    let entered!: (pid: number) => void; const locked = new Promise<number>(r => { entered = r; });
    let release!: () => void; const held = new Promise<void>(r => { release = r; });
    const original = portalState.lockClientPortalState;
    const spy = jest.spyOn(portalState, 'lockClientPortalState').mockImplementation(async (...args) => { const state = await original(...args); const rows = await args[0].$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`; entered(rows[0].pid); await held; return state; });
    const first = portal.createPortalUser(clientId, email, PASSWORD, tenant, { userId: partner }); first.catch(() => undefined);
    let second: Promise<unknown> | undefined;
    try { const pid = await deadline(locked); second = core.remove(clientId, tenant, { userId: partner }); second.catch(() => undefined); await waitForBlock(pid); release(); await first; await second; }
    finally { release(); await Promise.allSettled([first, ...(second ? [second] : [])]); spy.mockRestore(); }
    const state = await snapshot(); expect(state.client?.isActive).toBe(false); expect(state.client?.hasPortalAccess).toBe(false); expect(state.account?.isActive).toBe(false); await login().expect(401);
  });
});
