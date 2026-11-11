// Rate-limit buckets are outside this identity-policy acceptance. Isolate their module timers;
// JWT authentication, portal session validation, authority, HTTP handlers, Prisma and audit are real.
jest.mock('../../auth/guards/login-rate-limit.guard', () => ({
  PortalLoginRateLimitGuard: class { canActivate() { return true; } },
}));
jest.mock('../../auth/guards/credential-recovery-rate-limit.guard', () => ({
  CredentialRecoveryRateLimitGuard: class { canActivate() { return true; } },
}));
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { OfficeApprovalModule } from '../../office-approval/office-approval.module';
import { EmailProviderService } from '../../notification/email-provider.service';
import { PortalController } from '../portal.controller';
import { PortalService } from '../portal.service';
import { ClientFinancialDisclosurePortalService } from '../client-financial-disclosure-portal.service';

const URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !URL) throw new Error('Portal email A requires disposable DB; SKIP is not acceptance.');
const dbDescribe = URL ? describe : describe.skip;
const SECRET = 'portal-email-a-synthetic-' + randomUUID();
const PASSWORD = 'SyntheticPortal123';
const OTHER_PASSWORD = 'OtherSynthetic123';

dbDescribe('Portal email A — real HTTP/JWT and disposable PostgreSQL', () => {
  jest.setTimeout(30_000);
  let app: INestApplication, db: PrismaClient, jwt: JwtService;
  let tenant: string, foreignTenant: string, partner: string, viewer: string;
  let client: string, otherClient: string, thirdClient: string, foreignClient: string;
  const send = jest.fn().mockResolvedValue({ success: true, provider: 'mock' });
  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer()).post('/api/portal/login').send({ email, password });
  const forgot = (email: string) =>
    request(app.getHttpServer()).post('/api/portal/forgot-password').send({ email });
  const staffToken = (sub = partner) => jwt.sign({ sub, tenantId: tenant, role: sub === viewer ? 'VIEWER' : 'USER', tokenVersion: 0 });
  const create = (id: string, email: string, sub = partner) =>
    request(app.getHttpServer()).post('/api/portal/admin/create-user')
      .auth(staffToken(sub), { type: 'bearer' }).send({ clientId: id, email, password: PASSWORD });
  const seed = async (id: string, email: string, isActive = true, password = PASSWORD) => {
    const row = await db.clientPortalUser.create({ data: {
      clientId: id, email, isActive, passwordHash: await bcrypt.hash(password, 4), tokenVersion: 7,
    } });
    await db.client.update({ where: { id }, data: { hasPortalAccess: isActive, portalUserId: row.id } });
    return row;
  };
  const snapshot = async () => ({
    accounts: await db.clientPortalUser.findMany({ where: { client: { tenantId: { in: [tenant, foreignTenant] } } }, orderBy: { id: 'asc' } }),
    clients: await db.client.findMany({ where: { tenantId: { in: [tenant, foreignTenant] } }, orderBy: { id: 'asc' } }),
    audits: await db.auditLog.findMany({ where: { tenantId: { in: [tenant, foreignTenant] } }, orderBy: { id: 'asc' } }),
  });
  const unchanged = async (action: () => PromiseLike<any>) => {
    const before = await snapshot(); const response = await action();
    expect(await snapshot()).toEqual(before); return response;
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: URL } } }); await db.$connect();
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true,
        load: [() => ({ JWT_SECRET: SECRET, PUBLIC_PORTAL_BASE_URL: 'https://portal.example.test' })] }),
        PrismaModule, ErrorLogModule, OfficeApprovalModule,
        PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret: SECRET })],
      controllers: [PortalController],
      providers: [AuthService, JwtStrategy, PortalService,
        { provide: EmailProviderService, useValue: { send } },
        // Financial-disclosure routes are not called by this bounded acceptance.
        { provide: ClientFinancialDisclosurePortalService, useValue: {} }],
    }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); app.useLogger(false); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init(); await app.listen(0, '127.0.0.1'); jwt = module.get(JwtService);
  });
  beforeEach(async () => {
    send.mockClear();
    const a = await db.tenant.create({ data: { name: 'Synthetic portal A', slug: 'portal-a-' + randomUUID() } });
    const b = await db.tenant.create({ data: { name: 'Synthetic portal B', slug: 'portal-b-' + randomUUID() } });
    tenant = a.id; foreignTenant = b.id;
    const office = await db.office.create({ data: { tenantId: tenant, name: 'Synthetic office' } });
    const user = await db.user.create({ data: { tenantId: tenant, role: 'USER', name: 'Synthetic', surname: 'Partner',
      email: randomUUID() + '@example.test', passwordHash: 'unused-no-staff-login' } });
    partner = user.id;
    await db.lawyer.create({ data: { tenantId: tenant, officeId: office.id, userId: partner,
      name: 'Synthetic', surname: 'Partner', lawyerRank: 'PARTNER' } });
    viewer = (await db.user.create({ data: { tenantId: tenant, role: 'VIEWER', name: 'Synthetic', surname: 'Viewer',
      email: randomUUID() + '@example.test', passwordHash: 'unused-no-staff-login' } })).id;
    const makeClient = async (tid: string) => (await db.client.create({ data: { tenantId: tid, type: 'PERSON', displayName: 'Synthetic client' } })).id;
    client = await makeClient(tenant); otherClient = await makeClient(tenant);
    thirdClient = await makeClient(tenant); foreignClient = await makeClient(foreignTenant);
  });
  afterEach(async () => {
    const ids = [tenant, foreignTenant];
    await db.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await db.clientPortalUser.deleteMany({ where: { client: { tenantId: { in: ids } } } });
    await db.client.deleteMany({ where: { tenantId: { in: ids } } });
    await db.lawyer.deleteMany({ where: { tenantId: { in: ids } } });
    await db.user.deleteMany({ where: { tenantId: { in: ids } } });
    await db.office.deleteMany({ where: { tenantId: { in: ids } } });
    await db.tenant.deleteMany({ where: { id: { in: ids } } });
  });
  afterAll(async () => { if (app) await app.close(); if (db) await db.$disconnect(); });

  it.each(['same tenant', 'different tenants'])('%s: all legacy normalized spellings reject both passwords without writes or email', async (scope) => {
    const email = 'Legacy.' + randomUUID() + '@Example.test';
    const a = await seed(client, email);
    const b = await seed(scope === 'same tenant' ? otherClient : foreignClient, email.toLowerCase(), true, OTHER_PASSWORD);
    const unknown = await login('unknown-' + randomUUID() + '@example.test');
    expect(unknown.status).toBe(401);
    const before = await snapshot();
    for (const typed of [a.email, b.email, ' ' + email.toUpperCase() + ' ', '\t' + email.toLowerCase() + '\u00a0']) {
      for (const password of [PASSWORD, OTHER_PASSWORD]) {
        const response = await login(typed, password);
        expect(response.status).toBe(401); expect(response.body).toEqual(unknown.body);
        expect(response.body).not.toHaveProperty('token');
      }
      const response = await forgot(typed);
      expect(response.status).toBe(201); expect(response.body).toEqual({ success: true });
    }
    expect(await snapshot()).toEqual(before); expect(send).not.toHaveBeenCalled();
  });

  it('a unique active account accepts exact/normalized spelling; inactive variants are not candidates', async () => {
    const email = 'Unique.' + randomUUID() + '@Example.test';
    const active = await seed(client, email); await seed(foreignClient, email.toLowerCase(), false, OTHER_PASSWORD);
    for (const typed of [email, ' ' + email.toUpperCase() + ' ']) {
      const response = await login(typed); expect(response.status).toBe(201);
      expect(jwt.verify(response.body.token)).toMatchObject({ sub: active.id, clientId: client, tenantId: tenant, tokenVersion: 7 });
    }
    const recovery = await forgot(email.toLowerCase());
    expect(recovery.status).toBe(201); expect(recovery.body).toEqual({ success: true });
    expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0].to).toBe(email);
    const row = await db.clientPortalUser.findUniqueOrThrow({ where: { id: active.id } });
    expect(row.loginCount).toBe(2); expect(row.resetToken).toMatch(/^[a-f0-9]{64}$/);
    expect(row.email).toBe(email); expect(row.tokenVersion).toBe(7);
  });

  it('create/reactivate collision returns only generic 409 and preserves every relevant record', async () => {
    const email = 'Reserved.' + randomUUID() + '@Example.test';
    const reserved = await seed(foreignClient, email);
    await seed(otherClient, 'old-' + randomUUID() + '@example.test', false);
    for (const id of [client, otherClient]) {
      const response = await unchanged(() => create(id, ' ' + email.toLowerCase() + ' '));
      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Bu e-posta başka bir aktif portal kullanıcısında kayıtlı');
      for (const secret of [foreignTenant, foreignClient, reserved.id, email]) expect(JSON.stringify(response.body)).not.toContain(secret);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('tenant suspension preserves active email reservation; explicit account inactivity releases it', async () => {
    const email = 'Suspended.' + randomUUID() + '@Example.test';
    const reserved = await seed(foreignClient, email);
    await db.tenant.update({ where: { id: foreignTenant }, data: { lifecycle: 'SUSPENDED' } });
    const conflict = await unchanged(() => create(client, email.toLowerCase())); expect(conflict.status).toBe(409);
    expect((await unchanged(() => login(email))).status).toBe(401);
    const reset = await unchanged(() => forgot(email)); expect(reset.body).toEqual({ success: true });
    expect(send).not.toHaveBeenCalled();
    await db.clientPortalUser.update({ where: { id: reserved.id }, data: { isActive: false } });
    expect((await create(client, email.toLowerCase())).status).toBe(201);
    expect(await db.clientPortalUser.count({ where: { isActive: true, client: { tenantId: { in: [tenant, foreignTenant] } } } })).toBe(1);
  });

  it('concurrent normalized account creation produces one account and one success audit; loser is 409', async () => {
    const email = 'Concurrent.' + randomUUID() + '@Example.test';
    const results = await Promise.all([create(client, email), create(otherClient, ' ' + email.toUpperCase() + ' ')]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await db.clientPortalUser.count({ where: { client: { tenantId: tenant } } })).toBe(1);
    expect(await db.auditLog.count({ where: { tenantId: tenant, action: 'CLIENT_PORTAL_ACCESS_ENABLE' } })).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('existing JWT policy stays unchanged: legacy collision blocks new login, not a valid existing session; rotation still revokes it', async () => {
    const email = 'Session.' + randomUUID() + '@Example.test'; const active = await seed(client, email);
    const signed = await login(email); expect(signed.status).toBe(201);
    const token = signed.body.token;
    await seed(foreignClient, email.toLowerCase());
    expect((await unchanged(() => login(email))).status).toBe(401);
    const poas = await request(app.getHttpServer()).get('/api/portal/poas').auth(token, { type: 'bearer' });
    expect(poas.status).toBe(200);
    const rotated = await request(app.getHttpServer()).post('/api/portal/change-password').auth(token, { type: 'bearer' })
      .send({ oldPassword: PASSWORD, newPassword: 'NewSyntheticPassword123' });
    expect(rotated.status).toBe(201);
    expect((await db.clientPortalUser.findUniqueOrThrow({ where: { id: active.id } })).tokenVersion).toBe(8);
    expect((await request(app.getHttpServer()).get('/api/portal/poas').auth(token, { type: 'bearer' })).status).toBe(401);
  });

  it('current unauthenticated/VIEWER/foreign-parent creation denials remain unchanged and write nothing', async () => {
    const email = 'Denied.' + randomUUID() + '@example.test';
    expect((await unchanged(() => request(app.getHttpServer()).post('/api/portal/admin/create-user')
      .send({ clientId: client, email, password: PASSWORD }))).status).toBe(401);
    expect((await unchanged(() => create(client, email, viewer))).status).toBe(403);
    expect((await unchanged(() => create(foreignClient, email))).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });
});
