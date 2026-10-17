import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { resolveTestDatabaseUrl } from '../../../../../test/test-db-env';
import { AuditService } from '../../../audit/audit.service';
import { UserInviteService } from '../user-invite.service';
import { hashInviteToken } from '../user-invite-token.util';

const databaseUrl = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !databaseUrl) throw new Error('Invite concurrency acceptance requires TEST_DATABASE_URL in CI.');
const describeDb = databaseUrl ? describe : describe.skip;
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const bounded = async (promise: Promise<void>) => {
  let timer: ReturnType<typeof setTimeout>;
  try { await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Barrier not reached')), 10_000); })]); }
  finally { clearTimeout(timer!); }
};

describeDb('UserInvite atomic consumption — independent pools and disposable PostgreSQL', () => {
  jest.setTimeout(60_000);
  let db: PrismaClient, other: PrismaClient;
  let tenantId: string, userId: string, inviteId: string, actor: { id: string; tenantId: string; role: string }, raw: string;
  let email: { send: jest.Mock };
  const config = { get: (key: string) => key === 'LOGIN_INVITE_PROVISIONING_ENABLED' ? 'true' : key === 'WEB_BASE_URL' ? 'https://isolated.example.test' : undefined };
  const service = (client: any = db, audit: any = new AuditService(client)) => new UserInviteService(client, audit, email as any, config as any);
  const snapshot = async () => JSON.parse(JSON.stringify({
    users: await db.user.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    invites: await db.userInvite.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    lawyers: await db.lawyer.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    staff: await db.staffMember.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    audit: await db.auditLog.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
  }));
  const pausedAccept = () => {
    const reached = deferred(), release = deferred();
    const client = other.$extends({ query: { userInvite: { async findUnique({ args, query }) {
      const result = await query(args); reached.resolve(); await bounded(release.promise); return result;
    } } } });
    const result = service(client).accept(raw, 'isolated-password-A').then(value => ({ value, error: undefined as unknown }), error => ({ value: undefined, error }));
    return { reached, release, result };
  };
  const rejectAfter = async (mutation: () => Promise<unknown>) => {
    const pending = pausedAccept();
    try {
      await bounded(pending.reached.promise);
      await mutation();
      const before = await snapshot();
      pending.release.resolve();
      const result = await pending.result;
      expect(result.error).toBeInstanceOf(BadRequestException);
      expect(await snapshot()).toEqual(before);
    } finally { pending.release.resolve(); await pending.result; }
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    other = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await Promise.all([db.$connect(), other.$connect()]);
  });
  beforeEach(async () => {
    tenantId = 'test-invite-' + randomUUID(); raw = randomUUID();
    await db.tenant.create({ data: { id: tenantId, name: tenantId, slug: tenantId, lifecycle: 'ACTIVE' } });
    const admin = await db.user.create({ data: { tenantId, email: 'admin@example.test', name: 'Admin', surname: 'Test', role: 'ADMIN' } });
    actor = { id: admin.id, tenantId, role: 'ADMIN' };
    userId = (await db.user.create({ data: { tenantId, email: 'pending@example.test', name: 'Pending', surname: 'Test', isActive: false, passwordHash: null } })).id;
    inviteId = (await db.userInvite.create({ data: { tenantId, userId, email: 'pending@example.test', tokenHash: hashInviteToken(raw), expiresAt: new Date(Date.now() + 3600_000), invitedById: actor.id } })).id;
    email = { send: jest.fn().mockResolvedValue({ success: true }) };
  });
  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { tenantId } });
    await db.userInvite.deleteMany({ where: { tenantId } });
    await db.lawyer.deleteMany({ where: { tenantId } });
    await db.staffMember.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
  });
  afterAll(async () => { await Promise.all([db?.$disconnect(), other?.$disconnect()]); });

  it('barrier: exactly one of two accept calls wins, with one password and one success audit', async () => {
    let arrived = 0; const release = deferred();
    const wrap = (client: PrismaClient) => client.$extends({ query: { userInvite: { async findUnique({ args, query }) {
      const result = await query(args); if (++arrived === 2) release.resolve(); await bounded(release.promise); return result;
    } } } });
    const results = await Promise.allSettled([service(wrap(db)).accept(raw, 'isolated-password-A'), service(wrap(other)).accept(raw, 'isolated-password-B')]);
    expect(arrived).toBe(2);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BadRequestException);
    const account = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(account.isActive).toBe(true);
    const password = results[0].status === 'fulfilled' ? 'isolated-password-A' : 'isolated-password-B';
    expect(await bcrypt.compare(password, account.passwordHash!)).toBe(true);
    expect((await db.userInvite.findUniqueOrThrow({ where: { id: inviteId } })).consumedAt).not.toBeNull();
    const logs = await db.auditLog.findMany({ where: { tenantId, action: 'USER_INVITE_ACCEPTED' } });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(raw);
    expect(JSON.stringify(logs)).not.toContain(account.passwordHash!);
  });

  it('revoke after accept read wins without stale activation or profile relinking', async () => {
    await db.lawyer.create({ data: { tenantId, userId, name: 'Pending', surname: 'Lawyer' } });
    await rejectAfter(() => service().revoke(actor, inviteId));
    expect((await db.userInvite.findUniqueOrThrow({ where: { id: inviteId } })).revokedAt).not.toBeNull();
    expect(await db.lawyer.count({ where: { tenantId, userId } })).toBe(0);
  });

  it('resend after accept read invalidates old token; new token alone can activate', async () => {
    await rejectAfter(() => service().resend(actor, inviteId));
    expect(email.send).toHaveBeenCalledTimes(1);
    const newRaw = decodeURIComponent(email.send.mock.calls[0][0].text.match(/token=([^\s&]+)/)[1]);
    expect(newRaw).not.toBe(raw);
    await expect(service().accept(newRaw, 'isolated-new-password')).resolves.toMatchObject({ ok: true, userId });
    expect(await db.auditLog.count({ where: { tenantId, action: 'USER_INVITE_ACCEPTED' } })).toBe(1);
  });

  it.each(['lawyer', 'staff'] as const)('%s deactivation after accept read is not undone', async kind => {
    if (kind === 'lawyer') await db.lawyer.create({ data: { tenantId, userId, name: 'Pending', surname: 'Lawyer' } });
    else await db.staffMember.create({ data: { tenantId, userId, firstName: 'Pending', lastName: 'Staff', staffType: 'DIGER' } });
    await rejectAfter(() => db.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: { isActive: false } });
      if (kind === 'lawyer') await tx.lawyer.updateMany({ where: { tenantId, userId }, data: { isActive: false } });
      else await tx.staffMember.updateMany({ where: { tenantId, userId }, data: { isActive: false } });
    }));
  });

  it('already inactive linked profile cannot be activated by a pending invite', async () => {
    await db.lawyer.create({ data: { tenantId, userId, name: 'Inactive', surname: 'Lawyer', isActive: false } });
    const before = await snapshot();
    await expect(service().accept(raw, 'isolated-password')).rejects.toBeInstanceOf(BadRequestException);
    expect(await snapshot()).toEqual(before);
  });

  it('tenant suspension after accept read prevents account activation', async () => {
    await rejectAfter(() => db.tenant.update({ where: { id: tenantId }, data: { lifecycle: 'SUSPENDED' } }));
  });

  it('account identity change after accept read cannot be overwritten', async () => {
    await rejectAfter(() => db.user.update({ where: { id: userId }, data: { email: 'changed@example.test' } }));
  });

  it('audit failure rolls back password, activation, consumption and audit together', async () => {
    const audit = new AuditService(db as any);
    const original = audit.logInTransaction.bind(audit);
    jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx, input) => { await original(tx, input); throw new Error('isolated audit failure'); });
    const before = await snapshot();
    await expect(service(db, audit).accept(raw, 'isolated-password')).rejects.toThrow('isolated audit failure');
    expect(await snapshot()).toEqual(before);
  });

  it('consumed invite cannot revoke/unlink the activated account', async () => {
    const lawyer = await db.lawyer.create({ data: { tenantId, userId, name: 'Pending', surname: 'Lawyer' } });
    await service().accept(raw, 'isolated-password');
    const before = await snapshot();
    await expect(service().revoke(actor, inviteId)).rejects.toMatchObject({ status: 409 });
    expect(await snapshot()).toEqual(before);
    expect((await db.lawyer.findUniqueOrThrow({ where: { id: lawyer.id } })).userId).toBe(userId);
  });

  it.each(['resend', 'revoke'] as const)('accept completes after %s read: stale mutation is rejected without delivery or unlink', async operation => {
    await db.lawyer.create({ data: { tenantId, userId, name: 'Pending', surname: 'Lawyer' } });
    const reached = deferred(), release = deferred();
    const client = other.$extends({ query: { userInvite: { async findFirst({ args, query }) {
      const result = await query(args); reached.resolve(); await bounded(release.promise); return result;
    } } } });
    const result = service(client)[operation](actor, inviteId).then(() => undefined, error => error);
    try {
      await bounded(reached.promise);
      await service().accept(raw, 'isolated-password');
      const before = await snapshot();
      release.resolve();
      expect(await result).toMatchObject({ status: 409 });
      expect(await snapshot()).toEqual(before);
      expect(email.send).not.toHaveBeenCalled();
    } finally { release.resolve(); await result; }
  });

  it('repeated revoke cannot unlink a later pending-user adoption/profile link', async () => {
    await service().revoke(actor, inviteId);
    const lawyer = await db.lawyer.create({ data: { tenantId, userId, name: 'Reinvited', surname: 'Lawyer' } });
    const before = await snapshot();
    await expect(service().revoke(actor, inviteId)).resolves.toEqual({ inviteId, revoked: true });
    expect(await snapshot()).toEqual(before);
    expect((await db.lawyer.findUniqueOrThrow({ where: { id: lawyer.id } })).userId).toBe(userId);
  });

  it('new unlinked pending invite remains accepted without a profile requirement', async () => {
    await expect(service().accept(raw, 'isolated-password')).resolves.toEqual({ ok: true, userId });
  });
});
