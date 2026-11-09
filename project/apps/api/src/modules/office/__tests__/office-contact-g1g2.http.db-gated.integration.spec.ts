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
import { AuditModule } from '../../audit/audit.module';
import { AuditService } from '../../audit/audit.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { AuthService } from '../../auth/auth.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { StaffModule } from '../../staff/staff.module';
import { OfficeModule } from '../office.module';
import { OFFICE_CONTACT_FIELDS, OFFICE_CONTACT_KEYS, STAFF_CONTACT_FIELDS } from '../office-contact.constants';

const URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !URL) throw new Error('G1/G2 requires disposable TEST_DATABASE_URL; integration must not skip in CI.');
const dbDescribe = URL ? describe : describe.skip;
const SECRET = process.env.JWT_SECRET || `contact-test-${randomUUID()}`;
const [G1, G2] = OFFICE_CONTACT_KEYS;
const F02 = ['office.tasks.view_all', 'office.expenses.view_all', 'office.cases.view_all'];
const REACTIVATE = { staffType: 'SEKRETER', canCreateCase: false, canEditCase: false, canGenerateDocuments: false,
  canApproveDocuments: false, canSeeFinance: false, canApproveFinance: false, canPrepareCollectionDisposition: false,
  canSendNotifications: false, isDefaultForNewCases: false };

dbDescribe('G1/G2 contacts and O-5 — real Nest DI, JWT, HTTP and disposable PostgreSQL', () => {
  jest.setTimeout(60_000);
  let db: PrismaClient, app: INestApplication, jwt: JwtService, audit: AuditService, auth: AuthService;
  let tenantId: string, officeId: string, adminId: string, actorId: string, staffId: string, targetId: string, passwordHash: string;
  const server = () => app.getHttpServer();
  const token = async (id = actorId) => {
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    return jwt.sign({ sub: u.id, tenantId: u.tenantId, email: u.email, role: u.role, tokenVersion: u.tokenVersion });
  };
  const headers = async (id = actorId) => ({ Authorization: `Bearer ${await token(id)}` });
  const makeUser = async (role: 'USER' | 'ADMIN' | 'VIEWER' = 'USER', tenant = tenantId) => db.user.create({
    data: { tenantId: tenant, name: 'Sentetik', surname: 'G1G2', email: `${randomUUID()}@example.test`, role, passwordHash },
  });
  const makeStaff = async (userId: string | null, extra: Record<string, unknown> = {}) => db.staffMember.create({
    data: { tenantId, officeId, userId, firstName: 'Sentetik', lastName: 'Personel', staffType: 'SEKRETER', ...extra },
  });
  const grant = async (key = G1, extra: Record<string, unknown> = {}) => db.permissionGrant.create({ data: {
    tenantId, subjectUserId: actorId, permissionKey: key, scope: 'GLOBAL', effect: 'ALLOW', grantedByUserId: adminId,
    validFrom: new Date(Date.now() - 60_000), validUntil: new Date(Date.now() + 3_600_000), ...extra,
  } });
  const state = async () => ({
    office: await db.office.findUnique({ where: { id: officeId } }),
    staff: await db.staffMember.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    users: await db.user.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    grants: await db.permissionGrant.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    resets: await db.passwordResetToken.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    audits: await db.auditLog.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
  });
  const patchOffice = async (body: unknown, id = actorId) => request(server()).patch('/office-contact/office').set(await headers(id)).send(body);
  const patchStaff = async (body: unknown, id = actorId, target = targetId) => request(server()).patch(`/office-contact/staff/${target}`).set(await headers(id)).send(body);
  const review = async () => request(server()).get(`/staff/${staffId}/account-reopen-review`).set(await headers(adminId));
  const reopen = async (body: unknown) => request(server()).post(`/staff/${staffId}/account-reopen`).set(await headers(adminId)).send(body);
  const waitForBlockedRequest = async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (rows[0].count > 0) return true;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return false;
  };
  const closeAccount = async () => {
    expect((await request(server()).delete(`/staff/${staffId}`).set(await headers(adminId))).status).toBe(200);
    const re = await request(server()).post(`/staff/${staffId}/reactivate`).set(await headers(adminId)).send(REACTIVATE);
    expect(re.status).toBe(201);
    expect(re.body.data.linkedAccount).toEqual({ exists: true, isActive: false });
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: URL } } }); await db.$connect();
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: SECRET })] }),
        PrismaModule, AuditModule, ErrorLogModule, OfficeModule, StaffModule, PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret: SECRET })],
      providers: [JwtStrategy, AuthService],
    }).compile();
    app = module.createNestApplication(); app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init(); await app.listen(0, '127.0.0.1');
    jwt = module.get(JwtService); audit = module.get(AuditService); auth = module.get(AuthService);
    passwordHash = await bcrypt.hash('Contact-Test-Only-1', 4);
  });
  beforeEach(async () => {
    tenantId = `test-g1g2-${randomUUID()}`;
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'G1G2 synthetic' } });
    officeId = (await db.office.create({ data: { tenantId, name: 'G1G2 synthetic', smtpPass: 'synthetic-not-returned' } })).id;
    adminId = (await makeUser('ADMIN')).id; actorId = (await makeUser()).id;
    staffId = (await makeStaff(actorId)).id; targetId = (await makeStaff(null)).id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  it('requires real JWT and missing permission cannot mutate any related row', async () => {
    expect((await request(server()).patch('/office-contact/office').send({ phone: 'synthetic' })).status).toBe(401);
    const before = await state(); expect((await patchOffice({ phone: 'synthetic' })).status).toBe(403); expect(await state()).toEqual(before);
  });
  it('G1 writes exactly eight contacts and never exposes nested/configuration fields', async () => {
    await grant();
    const payload = Object.fromEntries(OFFICE_CONTACT_FIELDS.map(k => [k, `synthetic-${k}`]));
    const r = await patchOffice(payload); expect(r.status).toBe(200); expect(r.body.data).toEqual(payload);
    const read = await request(server()).get('/office-contact/office').set(await headers()); expect(read.body.data).toEqual(payload);
    expect((await db.office.findUniqueOrThrow({ where: { id: officeId } })).smtpPass).toBe('synthetic-not-returned');
    const log = await db.auditLog.findFirstOrThrow({ where: { tenantId, entityType: 'OFFICE' } });
    expect(log.metadata).toMatchObject({ authoritySource: 'EXPLICIT_PERMISSION_GRANT', permissionKey: G1, actorRole: 'USER' });
  });
  it('G2 writes four target contacts without changing login email or account binding', async () => {
    await grant(G2); const userBefore = await db.user.findUnique({ where: { id: actorId } });
    const payload = Object.fromEntries(STAFF_CONTACT_FIELDS.map(k => [k, `synthetic-${k}`]));
    const r = await patchStaff(payload); expect(r.status).toBe(200); expect(r.body.data).toEqual(payload);
    expect(await db.user.findUnique({ where: { id: actorId } })).toEqual(userBefore);
  });
  it('G1 and G2 do not confer each other or the old F01 mutation/reading capability', async () => {
    await grant(); expect((await patchStaff({ phone: 'x' })).status).toBe(403);
    expect((await request(server()).put('/office').set(await headers()).send({ name: 'forbidden' })).status).toBe(403);
    expect((await request(server()).get('/office').set(await headers())).status).toBe(403);
    await grant(G2); expect((await patchStaff({ phone: 'synthetic' })).status).toBe(200);
  });
  it.each(['user', 'userId', 'tenantId', 'officeId', 'name', 'isActive', 'smtpPass', 'bankAccounts', 'canApproveFinance'])('rejects forbidden G1 field %s with zero writes, even alongside a valid field', async field => {
    await grant(); const before = await state();
    expect((await patchOffice({ phone: 'not-saved', [field]: field === 'user' ? { role: 'ADMIN' } : 'echo' })).status).toBe(400);
    expect(await state()).toEqual(before);
  });
  it.each(['firstName', 'lastName', 'tckn', 'user', 'userId', 'officeId', 'staffType', 'canSendNotifications', 'isActive'])('rejects forbidden G2 field %s without partial contact writes', async field => {
    await grant(G2); const before = await state(); expect((await patchStaff({ phone: 'not-saved', [field]: 'echo' })).status).toBe(400); expect(await state()).toEqual(before);
  });
  it.each(['expired', 'future', 'deny', 'team', 'unbounded'])('%s grant does not authorize G1', async mode => {
    await grant(G1, mode === 'expired' ? { validUntil: new Date(Date.now() - 1000) }
      : mode === 'future' ? { validFrom: new Date(Date.now() + 60_000) }
        : mode === 'team' ? { scope: 'TEAM' } : mode === 'unbounded' ? { validUntil: null } : {});
    if (mode === 'deny') await grant(G1, { effect: 'DENY', validUntil: null });
    const before = await state(); expect((await patchOffice({ phone: 'not-saved' })).status).toBe(403); expect(await state()).toEqual(before);
  });
  it.each(['inactive-profile', 'viewer', 'missing-office', 'foreign-office'])('%s actor binding is rejected', async mode => {
    await grant();
    if (mode === 'viewer') await db.user.update({ where: { id: actorId }, data: { role: 'VIEWER' } });
    else if (mode === 'foreign-office') {
      const tenant = await db.tenant.create({ data: { slug: randomUUID(), name: 'foreign synthetic' } });
      const office = await db.office.create({ data: { tenantId: tenant.id, name: 'foreign' } });
      await db.staffMember.update({ where: { id: staffId }, data: { officeId: office.id } });
    } else await db.staffMember.update({ where: { id: staffId }, data: mode === 'missing-office' ? { officeId: null } : { isActive: false } });
    const before = await state(); expect((await patchOffice({ phone: 'not-saved' })).status).toBe(403); expect(await state()).toEqual(before);
  });
  it('inactive User and the existing JWT cannot write', async () => {
    await grant(); const old = await headers(); await db.user.update({ where: { id: actorId }, data: { isActive: false } });
    const before = await state(); expect((await request(server()).patch('/office-contact/office').set(old).send({ phone: 'x' })).status).toBe(401); expect(await state()).toEqual(before);
  });
  it('G2 resolves the real target office and refuses inactive or foreign parent', async () => {
    await grant(G2); await db.staffMember.update({ where: { id: targetId }, data: { isActive: false } });
    let before = await state(); expect((await patchStaff({ phone: 'x' })).status).toBe(404); expect(await state()).toEqual(before);
    const foreign = await db.tenant.create({ data: { slug: randomUUID(), name: 'foreign' } });
    const target = await db.staffMember.create({ data: { tenantId: foreign.id, firstName: 'Foreign', lastName: 'Synthetic', staffType: 'DIGER' } });
    before = await state(); expect((await patchStaff({ phone: 'x' }, actorId, target.id)).status).toBe(404); expect(await state()).toEqual(before);
    expect((await db.staffMember.findUniqueOrThrow({ where: { id: target.id } })).phone).toBeNull();
  });
  it.each(['PARTNER', 'MANAGER', 'DELEGATE', 'ADMIN'])('preserves existing F01 %s without requiring a contact grant', async kind => {
    const user = await makeUser(kind === 'ADMIN' ? 'ADMIN' : 'USER');
    if (kind !== 'ADMIN') await db.lawyer.create({ data: { tenantId, officeId, userId: user.id, name: 'Synthetic', surname: kind,
      lawyerRank: kind === 'DELEGATE' ? 'LAWYER' : kind as 'PARTNER' | 'MANAGER', canApproveOfficeActions: kind === 'DELEGATE' } });
    expect((await patchOffice({ phone: 'synthetic' }, user.id)).status).toBe(200);
    expect((await request(server()).get('/office').set(await headers(user.id))).status).toBe(200);
  });
  it('staff ADMIN cannot use a title shortcut or issue grants', async () => {
    await db.user.update({ where: { id: actorId }, data: { role: 'ADMIN' } }); const before = await state();
    expect((await patchOffice({ phone: 'x' })).status).toBe(403);
    const r = await request(server()).post(`/office-contact/permissions/staff/${staffId}`).set(await headers()).send({ permissionKey: G1, validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 60_000).toISOString(), reason: 'synthetic' });
    expect(r.status).toBe(403); expect(await state()).toEqual(before);
  });
  it('F01 VIEWER keeps existing reads but cannot acquire contact write through its lawyer rank', async () => {
    const u = await makeUser('VIEWER');
    await db.lawyer.create({ data: { tenantId, officeId, userId: u.id, name: 'Synthetic', surname: 'Viewer', lawyerRank: 'PARTNER' } });
    const cap = await request(server()).get('/office-contact/capabilities').set(await headers(u.id));
    expect(cap.status).toBe(200); expect(cap.body.data).toMatchObject({ office: true, writeOffice: false, writeStaff: false });
    expect((await request(server()).get('/office').set(await headers(u.id))).status).toBe(200);
    const before = await state(); expect((await patchOffice({ phone: 'not-saved' }, u.id)).status).toBe(403); expect(await state()).toEqual(before);
  });
  it('non-staff ADMIN grants only an explicit finite key and revokes ALLOW including future grants of an inactive subject', async () => {
    const r = await request(server()).post(`/office-contact/permissions/staff/${staffId}`).set(await headers(adminId)).send({ permissionKey: G1, validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 60_000).toISOString(), reason: 'synthetic' });
    expect(r.status).toBe(201); expect((await patchOffice({ phone: 'synthetic' })).status).toBe(200);
    await grant(G1, { validFrom: new Date(Date.now() + 10_000) }); const deny = await grant(G1, { effect: 'DENY' });
    await db.user.update({ where: { id: actorId }, data: { isActive: false } });
    const revoked = await request(server()).post(`/office-contact/permissions/staff/${staffId}/revoke`).set(await headers(adminId)).send({ permissionKey: G1, reason: 'synthetic' });
    expect(revoked.status).toBe(201); expect(revoked.body.data.revoked).toBe(2);
    expect(await db.permissionGrant.findUnique({ where: { id: deny.id } })).toEqual(deny);
  });
  it.each([{ validUntil: null }, { scope: 'TEAM' }, { effect: 'DENY' }, { permissionKey: F02[0] }])('rejects invalid grant input %j without changes', async extra => {
    const before = await state(); const r = await request(server()).post(`/office-contact/permissions/staff/${staffId}`).set(await headers(adminId)).send({ permissionKey: G1, validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 60_000).toISOString(), reason: 'synthetic', ...extra });
    expect(r.status).toBe(400); expect(await state()).toEqual(before);
  });
  it('contact and grant writes roll back when the atomic audit fails', async () => {
    await grant(); const before = await state(); jest.spyOn(audit, 'logInTransaction').mockRejectedValue(new Error('synthetic audit failure'));
    expect((await patchOffice({ phone: 'not-saved' })).status).toBe(500); expect(await state()).toEqual(before);
    expect((await request(server()).post(`/office-contact/permissions/staff/${staffId}`).set(await headers(adminId)).send({ permissionKey: G2, validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 60_000).toISOString(), reason: 'synthetic' })).status).toBe(500);
    expect(await state()).toEqual(before);
  });

  it('O-5: missing explicit contact selection is 409; an empty selection expires contacts while preserving all three F02 keys and DENY', async () => {
    const contact = await grant(), deny = await grant(G2, { effect: 'DENY' });
    const views = await Promise.all(F02.map(permissionKey => grant(G1, { permissionKey })));
    const old = await headers(); await closeAccount();
    const r = await review(); expect(r.status).toBe(200);
    expect(r.body.data.allowGrants.map((g: any) => g.permissionKey).sort()).toEqual([...F02].sort());
    expect(r.body.data.contactAllowGrants.map((g: any) => g.id)).toEqual([contact.id]);
    const body = { reviewFingerprint: r.body.data.reviewFingerprint, keepGrantIds: views.map(g => g.id) };
    const before = await state(); expect((await reopen(body)).status).toBe(409); expect(await state()).toEqual(before);
    const done = await reopen({ ...body, keepContactGrantIds: [] }); expect(done.status).toBe(201); expect(done.body.data.expiredContactGrantCount).toBe(1);
    for (const v of views) expect(await db.permissionGrant.findUnique({ where: { id: v.id } })).toEqual(v);
    expect(await db.permissionGrant.findUnique({ where: { id: deny.id } })).toEqual(deny);
    expect((await request(server()).get('/office-contact/capabilities').set(old)).status).toBe(401);
    const user = await db.user.findUniqueOrThrow({ where: { id: actorId } });
    const login = await auth.login({ email: user.email, password: 'Contact-Test-Only-1', tenantSlug: tenantId });
    expect(login.token).toBeTruthy(); expect((await patchOffice({ phone: 'x' })).status).toBe(403);
  });
  it('O-5: explicitly retained future contact grants keep original dates and never become F02 view grants', async () => {
    const g = await grant(G2, { validFrom: new Date(Date.now() + 60_000) }); await closeAccount();
    const r = await review(); const done = await reopen({ reviewFingerprint: r.body.data.reviewFingerprint, keepGrantIds: [], keepContactGrantIds: [g.id] });
    expect(done.status).toBe(201); expect(done.body.data.keptContactGrantCount).toBe(1);
    expect(await db.permissionGrant.findUnique({ where: { id: g.id } })).toEqual(g); expect((await patchStaff({ phone: 'x' })).status).toBe(403);
  });
  it('O-5: wrong-group/duplicate IDs and stale contact validity are rejected without writes', async () => {
    const c = await grant(), f = await grant(G1, { permissionKey: F02[0] }); await closeAccount();
    const r = await review(), base = { reviewFingerprint: r.body.data.reviewFingerprint, keepGrantIds: [], keepContactGrantIds: [] };
    for (const extra of [{ keepGrantIds: [c.id] }, { keepContactGrantIds: [f.id] }, { keepContactGrantIds: [c.id, c.id] }]) {
      const before = await state(); expect((await reopen({ ...base, ...extra })).status).toBe(400); expect(await state()).toEqual(before);
    }
    await db.permissionGrant.update({ where: { id: c.id }, data: { validUntil: new Date(Date.now() + 9_000_000) } });
    const before = await state(); expect((await reopen(base)).status).toBe(409); expect(await state()).toEqual(before);
  });
  it('O-5: final audit failure rolls back account/token/reset and both permission groups', async () => {
    const c = await grant(); await grant(G1, { permissionKey: F02[2] }); await closeAccount();
    await db.passwordResetToken.create({ data: { tenantId, userId: actorId, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
    const r = await review(), before = await state(), original = audit.logInTransaction.bind(audit);
    jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx, input) => {
      if (input.action === 'STAFF_ACCOUNT_REOPEN') throw new Error('synthetic final audit failure');
      return original(tx, input);
    });
    const done = await reopen({ reviewFingerprint: r.body.data.reviewFingerprint, keepGrantIds: [], keepContactGrantIds: [] });
    expect(done.status).toBe(500); expect(await state()).toEqual(before); expect(c.id).toBeTruthy();
  });
  it('rechecks a revoked G1 after an observed real User-row lock wait', async () => {
    const g = await grant(); const h = await headers();
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>(r => { release = r; }), locked = new Promise<void>(r => { ready = r; });
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
      ready(); await gate;
      await tx.permissionGrant.update({ where: { id: g.id }, data: { validUntil: new Date() } });
    }, { timeout: 15_000 });
    await locked;
    const pending = request(server()).patch('/office-contact/office').set(h).send({ phone: 'must-not-write' }).then(r => r);
    try { expect(await waitForBlockedRequest()).toBe(true); } finally { release(); await holder; }
    expect((await pending).status).toBe(403);
    expect((await db.office.findUniqueOrThrow({ where: { id: officeId } })).phone).toBeNull();
    expect(await db.auditLog.count({ where: { tenantId } })).toBe(0);
  });
  it('O-5: contact revocation and account reopen serialize on the existing person lock and reject a stale review', async () => {
    const g = await grant(); await closeAccount(); const r = await review(); const h = await headers(adminId);
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), locked = new Promise<void>(resolve => { ready = resolve; });
    const holder = db.$transaction(async tx => {
      const key = `work-scope-permission:${tenantId}:staff:${staffId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      ready(); await gate;
      await tx.permissionGrant.update({ where: { id: g.id }, data: { validUntil: new Date() } });
    }, { timeout: 15_000 });
    await locked;
    const userBefore = await db.user.findUnique({ where: { id: actorId } });
    const pending = request(server()).post(`/staff/${staffId}/account-reopen`).set(h)
      .send({ reviewFingerprint: r.body.data.reviewFingerprint, keepGrantIds: [], keepContactGrantIds: [g.id] }).then(res => res);
    try { expect(await waitForBlockedRequest()).toBe(true); } finally { release(); await holder; }
    expect((await pending).status).toBe(409);
    expect(await db.user.findUnique({ where: { id: actorId } })).toEqual(userBefore);
    expect(await db.auditLog.count({ where: { tenantId, action: 'STAFF_ACCOUNT_REOPEN' } })).toBe(0);
  });
});
