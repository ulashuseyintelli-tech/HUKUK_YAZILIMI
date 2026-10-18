jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('PDF transport is not exercised by permission acceptance'); } }));

import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationHistoryPermissionController } from '../notification-history-permission.controller';
import { NotificationHistoryPermissionService, NOTIFICATION_HISTORY_AUDIT_PERMISSION as KEY } from '../notification-history-permission.service';
import { ClientNotificationModule } from '../client-notification.module';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('Notification history permission acceptance requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('Notification history permission management — ADMIN-only, exact key, audited PostgreSQL', () => {
  let a: PrismaService; let b: PrismaService; let app: INestApplication;
  let tenantId: string; let foreignTenant: string;
  let admin: string; let member: string; let viewer: string; let subject: string; let foreignUser: string;
  const service = (db = a, audit = new AuditService(db)) => new NotificationHistoryPermissionService(db, audit);
  const grant = (s = service(), body: any = {}, actor = admin, target = subject, tenant = tenantId) => s.grant(tenant, actor, target, body);
  const revoke = (s = service(), actor = admin, target = subject, tenant = tenantId) => s.revoke(tenant, actor, target, {});

  beforeAll(async () => {
    a = new PrismaService({ datasources: { db: { url } } }); b = new PrismaService({ datasources: { db: { url } } });
    await Promise.all([a.$connect(), b.$connect()]);
    const module = await Test.createTestingModule({ controllers: [NotificationHistoryPermissionController], providers: [
      { provide: NotificationHistoryPermissionService, useValue: {
        grant: (...args: Parameters<NotificationHistoryPermissionService['grant']>) => service().grant(...args),
        revoke: (...args: Parameters<NotificationHistoryPermissionService['revoke']>) => service().revoke(...args),
      } },
    ] }).overrideGuard(JwtAuthGuard).useValue({ async canActivate(context: any) {
      const req = context.switchToHttp().getRequest(); const user = await a.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
      if (!user?.isActive) throw new UnauthorizedException();
      // Deliberately stale role claim; the service must authorize the current DB role instead.
      req.user = { ...user, role: 'ADMIN' }; return true;
    } }).compile();
    app = module.createNestApplication(); await app.init(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenantId = `history-grant-test-${randomUUID()}`; foreignTenant = `history-foreign-test-${randomUUID()}`;
    for (const id of [tenantId, foreignTenant]) await a.tenant.create({ data: { id, slug: id, name: 'Synthetic permission tenant' } });
    const user = async (role: 'ADMIN' | 'USER' | 'VIEWER', tenant = tenantId) => (await a.user.create({ data: { tenantId: tenant, role, email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: 'Permission' } })).id;
    admin = await user('ADMIN'); member = await user('USER'); viewer = await user('VIEWER'); subject = await user('USER'); foreignUser = await user('ADMIN', foreignTenant);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const tenant of [tenantId, foreignTenant]) {
      await a.auditLog.deleteMany({ where: { tenantId: tenant } }); await a.permissionGrant.deleteMany({ where: { tenantId: tenant } });
      await a.user.deleteMany({ where: { tenantId: tenant } }); await a.tenant.delete({ where: { id: tenant } });
    }
  });
  afterAll(async () => { await app?.close(); await Promise.all([a.$disconnect(), b.$disconnect()]); });
  async function snapshot() {
    return { grants: await a.permissionGrant.findMany({ where: { tenantId: { in: [tenantId, foreignTenant] } }, orderBy: { id: 'asc' } }), audits: await a.auditLog.findMany({ where: { tenantId: { in: [tenantId, foreignTenant] } }, orderBy: { id: 'asc' } }) };
  }

  it('production module registers the separate controller/service; only the exact key and explicit GLOBAL ALLOW are written', async () => {
    expect(Reflect.getMetadata('controllers', ClientNotificationModule)).toContain(NotificationHistoryPermissionController);
    expect(Reflect.getMetadata('providers', ClientNotificationModule)).toContain(NotificationHistoryPermissionService);
    const result = await grant(); const state = await snapshot();
    expect(result).toMatchObject({ subjectUserId: subject, permissionKey: KEY, effect: 'ALLOW', scope: 'GLOBAL', validUntil: null });
    expect(state.grants).toHaveLength(1); expect(state.grants[0]).toMatchObject({ tenantId, subjectUserId: subject, permissionKey: KEY, scope: 'GLOBAL', grantedByUserId: admin });
    expect(state.audits).toHaveLength(1); expect(state.audits[0]).toMatchObject({ tenantId, userId: admin, entityType: 'PERMISSION_GRANT', entityId: result.id, action: 'CREATE' });
  });

  it.each(['USER', 'VIEWER', 'INACTIVE_ADMIN', 'FOREIGN_ADMIN'])('%s cannot create or revoke permission records', async role => {
    const actor = role === 'USER' ? member : role === 'VIEWER' ? viewer : role === 'FOREIGN_ADMIN' ? foreignUser : admin;
    if (role === 'INACTIVE_ADMIN') await a.user.update({ where: { id: admin }, data: { isActive: false } });
    const before = await snapshot();
    await expect(grant(service(), {}, actor)).rejects.toMatchObject({ status: 403 });
    await expect(revoke(service(), actor)).rejects.toMatchObject({ status: 403 }); expect(await snapshot()).toEqual(before);
  });

  it('same-tenant ADMIN cannot grant/revoke a foreign target; invalid context cannot manufacture tenant authority', async () => {
    const before = await snapshot();
    await expect(grant(service(), {}, admin, foreignUser)).rejects.toMatchObject({ status: 404 });
    await expect(revoke(service(), admin, foreignUser)).rejects.toMatchObject({ status: 404 });
    await expect(grant(service(), {}, admin, subject, foreignTenant)).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
  });

  it.each(['permissionKey', 'effect', 'scope', 'tenantId', 'subjectUserId', 'grantedByUserId', 'user'])('body cannot choose %s or request a nested ORM write', async field => {
    const before = await snapshot(); await expect(grant(service(), { [field]: { update: { role: 'ADMIN' } } })).rejects.toMatchObject({ status: 400 }); expect(await snapshot()).toEqual(before);
  });

  it.each([
    { validFrom: '2026-02-30T00:00:00Z' }, { validFrom: '2030-01-01' }, { validFrom: {} },
    { validFrom: '2030-01-02T00:00:00Z', validUntil: '2030-01-01T00:00:00Z' },
    { validUntil: '2000-01-01T00:00:00Z' }, { reason: [] },
  ])('invalid validity/reason %p cannot leave a grant or audit', async body => {
    const before = await snapshot(); await expect(grant(service(), body)).rejects.toMatchObject({ status: 400 }); expect(await snapshot()).toEqual(before);
  });

  it('future validity is recorded exactly and revoke expires active/future GLOBAL ALLOW without touching DENY or other permissions/scopes/tenants', async () => {
    const future = await grant(service(), { validFrom: '2030-01-01T00:00:00Z', validUntil: '2031-01-01T00:00:00Z' });
    const active = await grant();
    await a.permissionGrant.createMany({ data: [
      { tenantId, subjectUserId: subject, permissionKey: KEY, effect: 'DENY', scope: 'GLOBAL' },
      { tenantId, subjectUserId: subject, permissionKey: 'client.intake.review', scope: 'GLOBAL' },
      { tenantId, subjectUserId: subject, permissionKey: KEY, scope: 'TEAM' },
      { tenantId: foreignTenant, subjectUserId: foreignUser, permissionKey: KEY, scope: 'GLOBAL' },
    ] });
    const before = await snapshot(); const result = await revoke(); const after = await snapshot();
    expect(result.revoked).toBe(2); expect(after.grants).toHaveLength(before.grants.length);
    for (const row of before.grants) {
      const next = after.grants.find(x => x.id === row.id)!;
      if ([future.id, active.id].includes(row.id)) { expect(next.validUntil!.getTime()).toBeLessThanOrEqual(Date.now()); expect(next.effect).toBe('ALLOW'); }
      else expect(next).toEqual(row);
    }
    expect(after.audits).toHaveLength(before.audits.length + 1);
    expect((after.audits.find(row => row.action === 'UPDATE')!.newValues as any).expiredCount).toBe(2);
  });

  it('inactive subject cannot receive a new grant, but existing ALLOW can still be revoked', async () => {
    await grant(); await a.user.update({ where: { id: subject }, data: { isActive: false } }); const before = await snapshot();
    await expect(grant()).rejects.toMatchObject({ status: 404 }); expect(await snapshot()).toEqual(before);
    expect((await revoke()).revoked).toBe(1);
  });

  it.each(['grant', 'revoke'] as const)('%s rolls back every permission change when the real audit insert is followed by an error', async command => {
    if (command === 'revoke') await grant();
    const audit = new AuditService(a); const write = audit.logInTransaction.bind(audit);
    jest.spyOn(audit, 'logInTransaction').mockImplementation(async (...args) => { await write(...args); throw new Error('injected-audit'); });
    const before = await snapshot();
    await expect(command === 'grant' ? grant(service(a, audit)) : revoke(service(a, audit))).rejects.toThrow('injected-audit');
    expect(await snapshot()).toEqual(before);
  });

  it.each(['grant', 'revoke'] as const)('concurrent grant/revoke with %s first preserves the serialized outcome across two pools', async first => {
    const winner = service(a); const waiter = service(b);
    let held!: () => void; let release!: () => void;
    const locked = new Promise<void>(r => { held = r; }); const proceed = new Promise<void>(r => { release = r; });
    const authorize = (winner as any).authorizeAndLock.bind(winner);
    jest.spyOn(winner as any, 'authorizeAndLock').mockImplementation(async (...args) => { await authorize(...args); held(); await proceed; });
    const one = first === 'grant' ? grant(winner) : revoke(winner); await locked;
    const two = first === 'grant' ? revoke(waiter) : grant(waiter); release(); await Promise.all([one, two]);
    const state = await snapshot(); expect(state.grants).toHaveLength(1); expect(state.audits).toHaveLength(2);
    expect(state.grants[0].validUntil === null).toBe(first === 'revoke');
  });

  it('HTTP rejects stale ADMIN claims for USER/VIEWER; authenticated current ADMIN can grant and revoke', async () => {
    const path = `/client-notifications/history-audit-permissions/${subject}`; const before = await snapshot();
    await http(app.getHttpServer()).post(path).send({}).expect(401);
    for (const actor of [member, viewer]) await http(app.getHttpServer()).post(path).set('x-test-user-id', actor).send({}).expect(403);
    expect(await snapshot()).toEqual(before);
    const accepted = await http(app.getHttpServer()).post(path).set('x-test-user-id', admin).send({}).expect(201);
    expect(accepted.body).toMatchObject({ permissionKey: KEY, scope: 'GLOBAL', subjectUserId: subject });
    const revoked = await http(app.getHttpServer()).post(`${path}/revoke`).set('x-test-user-id', admin).send({}).expect(201);
    expect(revoked.body.revoked).toBe(1); expect((await snapshot()).audits).toHaveLength(2);
  });
});
