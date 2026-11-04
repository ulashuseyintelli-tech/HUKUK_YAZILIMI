import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../test/test-db-env';
import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientIntakeReviewModule } from './client-intake-review.module';
import { ClientIntakeReviewPermissionController } from './client-intake-review-permission.controller';
import { ClientIntakeReviewPermissionService } from './client-intake-review-permission.service';
import { ClientIntakeReviewAuthorizationService, CLIENT_INTAKE_REVIEW_PERMISSION_KEY as KEY } from './client-intake-review-authorization.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('Intake permission acceptance requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('Intake review permission ADMIN API — real PostgreSQL and Nest wiring', () => {
  let a: PrismaService; let b: PrismaService; let app: INestApplication;
  let svc: ClientIntakeReviewPermissionService; let audit: AuditService; let authorization: ClientIntakeReviewAuthorizationService;
  let tenantId: string; let foreignTenant: string;
  let admin: string; let subject: string; let staff: string; let viewer: string; let foreign: string;
  const path = () => `/client-intake-review-permissions/${subject}`;
  const grant = (body: unknown = {}, actor = admin, target = subject) => svc.grant(tenantId, actor, target, body);
  const revoke = (actor = admin, target = subject) => svc.revoke(tenantId, actor, target, {});

  beforeAll(async () => {
    a = new PrismaService({ datasources: { db: { url } } });
    b = new PrismaService({ datasources: { db: { url } } });
    await Promise.all([a.$connect(), b.$connect()]);
    const module = await Test.createTestingModule({ imports: [AuditModule, ClientIntakeReviewModule] })
      .overrideProvider(PrismaService).useValue(a)
      .overrideGuard(JwtAuthGuard).useValue({ async canActivate(context: any) {
        const req = context.switchToHttp().getRequest();
        const user = await a.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
        if (!user?.isActive) throw new UnauthorizedException();
        req.user = user; return true;
      } }).compile();
    svc = module.get(ClientIntakeReviewPermissionService);
    audit = module.get(AuditService);
    authorization = module.get(ClientIntakeReviewAuthorizationService);
    app = module.createNestApplication(); await app.init(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenantId = `intake-test-${randomUUID()}`; foreignTenant = `intake-foreign-test-${randomUUID()}`;
    for (const id of [tenantId, foreignTenant]) await a.tenant.create({ data: { id, slug: id, name: 'Synthetic intake test' } });
    const user = async (role: 'ADMIN' | 'USER' | 'VIEWER', tenant = tenantId) => (await a.user.create({ data: {
      tenantId: tenant, role, email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: role,
    } })).id;
    admin = await user('ADMIN'); subject = await user('USER'); staff = await user('USER'); viewer = await user('VIEWER'); foreign = await user('ADMIN', foreignTenant);
    await a.lawyer.create({ data: { tenantId, userId: subject, name: 'Synthetic', surname: 'Lawyer' } });
    await a.lawyer.create({ data: { tenantId, userId: viewer, name: 'Synthetic', surname: 'Viewer', lawyerRank: 'PARTNER' } });
    await a.staffMember.create({ data: { tenantId, userId: staff, firstName: 'Synthetic', lastName: 'Staff', staffType: 'SEKRETER' } });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const tenant of [tenantId, foreignTenant]) {
      await a.auditLog.deleteMany({ where: { tenantId: tenant } });
      await a.permissionGrant.deleteMany({ where: { tenantId: tenant } });
      await a.lawyer.deleteMany({ where: { tenantId: tenant } });
      await a.staffMember.deleteMany({ where: { tenantId: tenant } });
      await a.user.deleteMany({ where: { tenantId: tenant } });
      await a.tenant.delete({ where: { id: tenant } });
    }
  });
  afterAll(async () => { await app?.close(); await Promise.all([a?.$disconnect(), b?.$disconnect()]); });

  async function snapshot() {
    const where = { tenantId: { in: [tenantId, foreignTenant] } };
    return {
      grants: await a.permissionGrant.findMany({ where, orderBy: { id: 'asc' } }),
      audits: await a.auditLog.findMany({ where, orderBy: { id: 'asc' } }),
      users: await a.user.findMany({ where, orderBy: { id: 'asc' } }),
      lawyers: await a.lawyer.findMany({ where, orderBy: { id: 'asc' } }),
      staff: await a.staffMember.findMany({ where, orderBy: { id: 'asc' } }),
    };
  }

  it('registers the real DI surface; ADMIN grants GLOBAL ALLOW consumed by the existing separate reviewer gate', async () => {
    expect(Reflect.getMetadata('controllers', ClientIntakeReviewModule)).toContain(ClientIntakeReviewPermissionController);
    expect(await authorization.isAuthorized(subject, tenantId)).toBe(false);
    const accepted = await http(app.getHttpServer()).post(path()).set('x-test-user-id', admin).send({}).expect(201);
    expect(accepted.body).toMatchObject({ permissionKey: KEY, scope: 'GLOBAL', effect: 'ALLOW', subjectUserId: subject });
    expect(await authorization.isAuthorized(subject, tenantId)).toBe(true);
    const state = await snapshot();
    expect(state.grants).toHaveLength(1); expect(state.audits).toHaveLength(1);
    expect(state.grants[0].grantedByUserId).toBe(admin);
    expect((await svc.getState(tenantId, admin, subject)).canReview).toBe(true);
    await http(app.getHttpServer()).post(`${path()}/revoke`).set('x-test-user-id', admin).send({}).expect(201);
    expect(await authorization.isAuthorized(subject, tenantId)).toBe(false);
    expect((await snapshot()).grants).toHaveLength(1);
  });

  it('allows an active Staff reviewer without granting promotion or modifying their profile', async () => {
    const before = await snapshot(); await grant({}, admin, staff);
    expect(await authorization.isAuthorized(staff, tenantId)).toBe(true);
    const after = await snapshot(); expect(after.staff).toEqual(before.staff); expect(after.users).toEqual(before.users);
  });

  it.each(['USER', 'VIEWER', 'INACTIVE_ADMIN', 'FOREIGN_ADMIN'])('%s cannot administer this permission; all related records remain unchanged', async role => {
    const actor = role === 'USER' ? subject : role === 'VIEWER' ? viewer : role === 'FOREIGN_ADMIN' ? foreign : admin;
    if (role === 'INACTIVE_ADMIN') await a.user.update({ where: { id: admin }, data: { isActive: false } });
    const before = await snapshot();
    await expect(grant({}, actor)).rejects.toMatchObject({ status: 403 });
    await expect(revoke(actor)).rejects.toMatchObject({ status: 403 });
    await expect(svc.getState(tenantId, actor, subject)).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
  });

  it.each(['role', 'tenantId', 'officeId', 'user', 'subjectUserId', 'permissionKey', 'effect', 'scope'])('rejects body-selected %s including nested ORM input without changing any related record', async key => {
    const before = await snapshot();
    await http(app.getHttpServer()).post(path()).set('x-test-user-id', admin).send({ [key]: { update: { role: 'ADMIN' } } }).expect(400);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['VIEWER', 'INACTIVE', 'NO_PROFILE', 'DUAL_PROFILE', 'INACTIVE_PROFILE'])('refuses an unusable %s grant and preserves all records', async kind => {
    let target = kind === 'VIEWER' ? viewer : kind === 'NO_PROFILE' ? admin : subject;
    if (kind === 'INACTIVE') await a.user.update({ where: { id: subject }, data: { isActive: false } });
    if (kind === 'INACTIVE_PROFILE') await a.lawyer.update({ where: { userId: subject }, data: { isActive: false } });
    if (kind === 'DUAL_PROFILE') await a.staffMember.create({ data: { tenantId, userId: subject, firstName: 'Synthetic', lastName: 'Duplicate', staffType: 'DIGER' } });
    const before = await snapshot(); await expect(grant({}, admin, target)).rejects.toMatchObject({ status: 400 });
    expect(await snapshot()).toEqual(before);
  });

  it.each([{ validFrom: 'tomorrow' }, { validFrom: '2030-01-01T12:00:00' }, { validUntil: '2020-01-01T00:00:00Z' }, { reason: {} }])('rejects malformed validity/reason without partial writes: %j', async body => {
    const before = await snapshot(); await expect(grant(body)).rejects.toMatchObject({ status: 400 }); expect(await snapshot()).toEqual(before);
  });

  it('enforces current DB ADMIN role even after a previously valid ADMIN changes role', async () => {
    await a.user.update({ where: { id: admin }, data: { role: 'USER' } });
    const before = await snapshot(); await expect(grant()).rejects.toMatchObject({ status: 403 }); expect(await snapshot()).toEqual(before);
  });

  it('rejects foreign targets; ADMIN-only subject projection is paginated and has no raw account/profile secrets', async () => {
    const before = await snapshot(); await expect(grant({}, admin, foreign)).rejects.toMatchObject({ status: 404 });
    await http(app.getHttpServer()).get('/client-intake-review-permissions/subjects').expect(401);
    for (const actor of [subject, viewer]) await http(app.getHttpServer()).get('/client-intake-review-permissions/subjects').set('x-test-user-id', actor).expect(403);
    const first = await svc.listSubjects(tenantId, admin, undefined, '2');
    expect(first.items).toHaveLength(2); expect(first.nextCursor).toBeTruthy();
    const next = await svc.listSubjects(tenantId, admin, first.nextCursor!, '2');
    expect(next.items.some(row => first.items.some(old => old.id === row.id))).toBe(false);
    const page = await svc.listSubjects(tenantId, admin);
    expect(page.items.some(row => row.id === foreign)).toBe(false);
    for (const row of page.items) expect(Object.keys(row).sort()).toEqual(['canReceiveGrant', 'displayName', 'id', 'isActive', 'profileActive']);
    expect(await snapshot()).toEqual(before);
  });

  it('preserves DENY precedence, pending/expired validity and VIEWER denial in its effective readback', async () => {
    await a.permissionGrant.create({ data: { tenantId, subjectUserId: subject, permissionKey: KEY, scope: 'GLOBAL', validFrom: new Date(Date.now() - 86_400_000), validUntil: new Date(Date.now() - 60_000) } });
    expect((await svc.getState(tenantId, admin, subject))).toMatchObject({ effectiveEffect: 'NONE', canReview: false, revocableAllowCount: 0 });
    await grant({ validFrom: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await svc.getState(tenantId, admin, subject))).toMatchObject({ effectiveEffect: 'NONE', canReview: false, scheduledAllowCount: 1 });
    await grant();
    await a.permissionGrant.create({ data: { tenantId, subjectUserId: subject, permissionKey: KEY, effect: 'DENY', scope: 'GLOBAL' } });
    expect((await svc.getState(tenantId, admin, subject))).toMatchObject({ effectiveEffect: 'DENY', canReview: false });
    await a.permissionGrant.create({ data: { tenantId, subjectUserId: viewer, permissionKey: KEY, scope: 'GLOBAL' } });
    expect((await svc.getState(tenantId, admin, viewer)).canReview).toBe(false);
  });

  it('expires every live/future GLOBAL ALLOW even for an inactive target; preserves DENY, other keys/scopes/tenants and reason privacy', async () => {
    await grant({ reason: 'private@example.test' }); await grant({ validFrom: new Date(Date.now() + 86_400_000).toISOString() });
    const protectedRows = await Promise.all([
      a.permissionGrant.create({ data: { tenantId, subjectUserId: subject, permissionKey: KEY, effect: 'DENY', scope: 'GLOBAL' } }),
      a.permissionGrant.create({ data: { tenantId, subjectUserId: subject, permissionKey: 'client.notification-history.audit', scope: 'GLOBAL' } }),
      a.permissionGrant.create({ data: { tenantId, subjectUserId: subject, permissionKey: KEY, scope: 'TEAM' } }),
      a.permissionGrant.create({ data: { tenantId: foreignTenant, subjectUserId: foreign, permissionKey: KEY, scope: 'GLOBAL' } }),
    ]);
    await a.user.update({ where: { id: subject }, data: { isActive: false } });
    expect((await revoke()).revoked).toBe(2);
    for (const row of protectedRows) expect(await a.permissionGrant.findUnique({ where: { id: row.id } })).toEqual(row);
    expect((await revoke()).revoked).toBe(0);
    expect(JSON.stringify((await snapshot()).audits)).not.toContain('private@example.test');
  });

  it.each(['grant', 'revoke'] as const)('%s and real audit insert both roll back if audit fails afterwards', async command => {
    if (command === 'revoke') await grant();
    const write = audit.logInTransaction.bind(audit);
    jest.spyOn(audit, 'logInTransaction').mockImplementation(async (...args) => { await write(...args); throw new Error('injected-audit'); });
    const before = await snapshot();
    await expect(command === 'grant' ? grant() : revoke()).rejects.toThrow('injected-audit');
    expect(await snapshot()).toEqual(before);
  });

  it.each(['grant', 'revoke'] as const)('serializes same-subject concurrent grant/revoke with %s first across two real DB pools', async first => {
    const other = new ClientIntakeReviewPermissionService(b, new AuditService(b), new ClientIntakeReviewAuthorizationService(b));
    let entered!: () => void; let release!: () => void;
    const held = new Promise<void>(r => { entered = r; }); const proceed = new Promise<void>(r => { release = r; });
    const lock = (svc as any).authorizeAndLock.bind(svc);
    jest.spyOn(svc as any, 'authorizeAndLock').mockImplementation(async (...args) => { const result = await lock(...args); entered(); await proceed; return result; });
    const one = first === 'grant' ? grant() : revoke(); await held;
    const two = first === 'grant' ? other.revoke(tenantId, admin, subject, {}) : other.grant(tenantId, admin, subject, {});
    release(); await Promise.all([one, two]);
    const state = await snapshot(); expect(state.grants).toHaveLength(1); expect(state.audits).toHaveLength(2);
    expect(state.grants[0].validUntil === null).toBe(first === 'revoke');
  });
});
