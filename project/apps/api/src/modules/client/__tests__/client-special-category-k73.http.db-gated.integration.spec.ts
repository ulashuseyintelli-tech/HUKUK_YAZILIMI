jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('Renderer not used in K7.3 acceptance'); } }));
import 'reflect-metadata';
import { ConflictException, ForbiddenException, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { AuthService } from '../../auth/auth.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeApprovalModule } from '../../office-approval/office-approval.module';
import { StaffService } from '../../staff/staff.service';
import { LawyerService } from '../../lawyer/lawyer.service';
import { CaseService } from '../../case/case.service';
import { ClientSpecialCategoryController } from '../client-special-category.controller';
import { ClientSpecialCategoryService, encryptSpecialContent } from '../client-special-category.service';
import { ClientSpecialCategoryAccessController } from '../client-special-category-access.controller';
import { ClientSpecialCategoryAccessService } from '../client-special-category-access.service';
import { K73_KEYS, K73Operation, lockK73CaseSubjectsInTx, revokeLostK73ScopesInTx } from '../client-special-category-access';

const URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !URL) throw new Error('K7.3 requires disposable TEST_DATABASE_URL; SKIP is not acceptance.');
const dbDescribe = URL ? describe : describe.skip;
const SECRET = 'k73-disposable-jwt-' + randomUUID();
const KEY = randomBytes(32).toString('base64');
const PASSWORD = 'K73-Only-Synthetic-Password';
const REACTIVATE = { staffType: 'SEKRETER', canCreateCase: false, canEditCase: false, canGenerateDocuments: false,
  canApproveDocuments: false, canSeeFinance: false, canApproveFinance: false, canPrepareCollectionDisposition: false,
  canSendNotifications: false, isDefaultForNewCases: false };

dbDescribe('K7.3 — real JWT/HTTP, bounded grants and atomic lifecycle on disposable PostgreSQL', () => {
  jest.setTimeout(60_000);
  let db: PrismaClient, app: INestApplication, jwt: JwtService, audit: AuditService, auth: AuthService;
  let access: ClientSpecialCategoryAccessService, records: ClientSpecialCategoryService, office: OfficeApprovalService;
  let staff: StaffService, lawyers: LawyerService, cases: CaseService, passwordHash: string;
  let tenant: string, foreignTenant: string, client: string, otherClient: string, caseId: string, otherCase: string;
  let issuer: string, reader: string, readerLawyer: string, outsider: string, viewer: string, staffAdmin: string, staffId: string, record: string;
  const server = () => app.getHttpServer();
  const data = (response: any) => response.body.data ?? response.body;
  const actor = () => ({ userId: issuer, role: 'ADMIN', requestId: randomUUID() });
  const scopes = () => (db as any).clientSpecialCategoryGrantScope;
  const user = async (role: 'USER' | 'ADMIN' | 'VIEWER', t = tenant) => db.user.create({ data: {
    tenantId: t, role, name: 'Synthetic', surname: 'K73', email: randomUUID() + '@example.test', passwordHash,
  } });
  const headers = async (id = reader) => {
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    return { Authorization: 'Bearer ' + jwt.sign({ sub: id, tenantId: u.tenantId, role: u.role, email: u.email, tokenVersion: u.tokenVersion }) };
  };
  const grant = async (operation: K73Operation = 'READ', extra: Record<string, unknown> = {}, by = issuer) =>
    request(server()).post('/client-special-category-access/grants').set(await headers(by)).send({
      clientId: client, subjectUserId: reader, operation,
      validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 60_000).toISOString(),
      reason: 'Synthetic scoped duty', ...extra,
    });
  const read = async (id = reader, query = '', recordId = record, tokenHeaders?: Record<string, string>) =>
    request(server()).get('/clients/special-category-records/' + recordId + query).set(tokenHeaders ?? await headers(id));
  const snapshot = async () => ({
    grants: await db.permissionGrant.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' } }),
    scopes: await scopes().findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' } }),
    records: await db.clientSpecialCategoryRecord.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' } }),
    audits: await db.auditLog.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' } }),
    users: await db.user.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' } }),
    staff: await db.staffMember.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' } }),
    lawyers: await db.lawyer.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' } }),
  });
  const deniedUnchanged = async (run: () => Promise<any>, statuses = [403]) => {
    const before = await snapshot(); const response = await run();
    expect(statuses).toContain(response.status); expect(JSON.stringify(response.body)).not.toContain('synthetic protected content');
    expect(await snapshot()).toEqual(before); return response;
  };
  const waitForLock = async () => {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      const rows = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;
      if (rows[0].count) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Expected request did not reach the database lock gate');
  };
  async function failingRevokeAudit(enable: boolean) {
    if (enable) {
      await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION k73_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${tenant}' AND NEW.action = 'CLIENT_SPECIAL_DATA_GRANTS_REVOKE' THEN RAISE EXCEPTION 'K73 synthetic audit failure'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER k73_fail_audit_trigger BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION k73_fail_audit()');
    } else {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS k73_fail_audit_trigger ON "AuditLog"');
      await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS k73_fail_audit()');
    }
  }

  beforeAll(async () => {
    process.env.CLIENT_SPECIAL_CATEGORY_DATA_KEY = KEY;
    db = new PrismaClient({ datasources: { db: { url: URL } } }); await db.$connect();
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: SECRET })] }),
        PrismaModule, ErrorLogModule, OfficeApprovalModule, PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret: SECRET })],
      controllers: [ClientSpecialCategoryController, ClientSpecialCategoryAccessController],
      providers: [AuthService, JwtStrategy, ClientSpecialCategoryService, ClientSpecialCategoryAccessService],
    }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication(); app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init(); await app.listen(0, '127.0.0.1');
    jwt = module.get(JwtService); audit = module.get(AuditService); auth = module.get(AuthService);
    office = module.get(OfficeApprovalService); access = module.get(ClientSpecialCategoryAccessService); records = module.get(ClientSpecialCategoryService);
    staff = new StaffService(db as any, audit, undefined, office); lawyers = new LawyerService(db as any, audit, office);
    // Real production relation methods, with their actual Prisma/audit/F01 consumers. No authority mock.
    cases = Object.assign(Object.create(CaseService.prototype), { prisma: db, auditService: audit, officeApproval: office });
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });
  beforeEach(async () => {
    tenant = 'k73-test-' + randomUUID(); foreignTenant = 'k73-foreign-test-' + randomUUID();
    for (const id of [tenant, foreignTenant]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic K73' } });
    const officeId = (await db.office.create({ data: { tenantId: tenant, name: 'Synthetic K73 office' } })).id;
    client = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Synthetic protected client' } })).id;
    otherClient = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Other synthetic client' } })).id;
    caseId = (await db.case.create({ data: { tenantId: tenant, fileNumber: randomUUID(), type: 'GENERAL_EXECUTION', clientId: client } })).id;
    otherCase = (await db.case.create({ data: { tenantId: tenant, fileNumber: randomUUID(), type: 'GENERAL_EXECUTION', clientId: otherClient } })).id;
    await db.caseClient.createMany({ data: [{ caseId, clientId: client }, { caseId: otherCase, clientId: otherClient }] });
    issuer = (await user('ADMIN')).id;
    const issuerLawyer = await db.lawyer.create({ data: { tenantId: tenant, userId: issuer, name: 'Issuer', surname: 'Synthetic', lawyerRank: 'PARTNER', officeId } });
    await db.caseLawyer.create({ data: { caseId, lawyerId: issuerLawyer.id } });
    reader = (await user('USER')).id;
    readerLawyer = (await db.lawyer.create({ data: { tenantId: tenant, userId: reader, name: 'Reader', surname: 'Synthetic', lawyerRank: 'PARTNER', officeId } })).id;
    await db.caseLawyer.create({ data: { caseId, lawyerId: readerLawyer } });
    outsider = (await user('ADMIN')).id;
    await db.lawyer.create({ data: { tenantId: tenant, userId: outsider, name: 'Outsider', surname: 'Synthetic', lawyerRank: 'PARTNER', officeId } });
    viewer = (await user('VIEWER')).id;
    const vl = await db.lawyer.create({ data: { tenantId: tenant, userId: viewer, name: 'Viewer', surname: 'Synthetic', lawyerRank: 'PARTNER', officeId } });
    await db.caseLawyer.create({ data: { caseId, lawyerId: vl.id } });
    staffAdmin = (await user('ADMIN')).id;
    staffId = (await db.staffMember.create({ data: { tenantId: tenant, officeId, userId: staffAdmin, firstName: 'Staff', lastName: 'Synthetic', staffType: 'SEKRETER' } })).id;
    await db.caseStaff.create({ data: { caseId, staffMemberId: staffId, roleOnCase: 'SEKRETER', canView: true } });
    record = (await db.clientSpecialCategoryRecord.create({ data: {
      tenantId: tenant, clientId: client, category: 'HEALTH', contentEncrypted: encryptSpecialContent(KEY, 'synthetic protected content'), createdByUserId: issuer,
    } })).id;
  });
  afterEach(async () => { jest.restoreAllMocks(); await failingRevokeAudit(false); });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); delete process.env.CLIENT_SPECIAL_CATEGORY_DATA_KEY; });

  it('real JWT is mandatory; ADMIN and elevated rank alone confer no timed access', async () => {
    expect((await request(server()).get('/clients/' + client + '/special-category-records')).status).toBe(401);
    await deniedUnchanged(() => read()); await deniedUnchanged(() => read(issuer));
  });
  it('READ grant allows content with minimized atomic audit, but grants no LIST or CREATE', async () => {
    const g = await grant(); expect(g.status).toBe(201);
    const r = await read(); expect(r.status).toBe(200); expect(data(r).content).toBe('synthetic protected content');
    expect(data(r).accessExpiresAt).toBe(data(g).validUntil);
    const log = await db.auditLog.findFirstOrThrow({ where: { tenantId: tenant, action: 'CLIENT_SPECIAL_DATA_ACCESS' } });
    expect(JSON.stringify(log)).not.toContain('synthetic protected content');
    await deniedUnchanged(async () => request(server()).get('/clients/' + client + '/special-category-records').set(await headers()));
    await deniedUnchanged(async () => request(server()).post('/clients/' + client + '/special-category-records').set(await headers()).send({ category: 'HEALTH', content: 'forbidden' }));
  });
  it('LIST never returns plaintext or ciphertext and does not confer READ', async () => {
    expect((await grant('LIST')).status).toBe(201);
    const r = await request(server()).get('/clients/' + client + '/special-category-records').set(await headers());
    expect(r.status).toBe(200); expect(data(r)[0]).toMatchObject({ id: record, category: 'HEALTH' });
    expect(JSON.stringify(r.body)).not.toMatch(/synthetic protected content|contentEncrypted/);
    await deniedUnchanged(() => read());
  });
  it('CREATE encrypts the payload and audit; it does not confer READ', async () => {
    expect((await grant('CREATE')).status).toBe(201);
    const r = await request(server()).post('/clients/' + client + '/special-category-records').set(await headers()).send({ category: 'HEALTH', content: 'new synthetic secret' });
    expect(r.status).toBe(201); expect(JSON.stringify(r.body)).not.toContain('new synthetic secret');
    const stored = await db.clientSpecialCategoryRecord.findUniqueOrThrow({ where: { id: data(r).id } });
    expect(stored.contentEncrypted).not.toContain('new synthetic secret');
    expect(JSON.stringify(await db.auditLog.findMany({ where: { tenantId: tenant } }))).not.toContain('new synthetic secret');
    await deniedUnchanged(() => read(reader, '', data(r).id));
  });
  it('manager cannot self-grant; staff-linked ADMIN, VIEWER and eligible USER cannot issue grants', async () => {
    await deniedUnchanged(() => grant('READ', { subjectUserId: issuer }));
    await deniedUnchanged(() => grant('READ', {}, staffAdmin));
    await deniedUnchanged(() => grant('READ', {}, viewer));
    await deniedUnchanged(() => grant('READ', {}, reader));
  });
  it('grant cannot create existing action authority or bypass tenant/profile/canonical object scope', async () => {
    await deniedUnchanged(() => grant('READ', { subjectUserId: outsider }), [404]);
    const ordinary = await user('USER');
    const s = await db.staffMember.create({ data: { tenantId: tenant, userId: ordinary.id, firstName: 'Ordinary', lastName: 'Staff', staffType: 'SEKRETER' } });
    await db.caseStaff.create({ data: { caseId, staffMemberId: s.id, roleOnCase: 'SEKRETER', canView: true } });
    await deniedUnchanged(() => grant('READ', { subjectUserId: ordinary.id }));
    await db.lawyer.update({ where: { id: readerLawyer }, data: { isActive: false } });
    await deniedUnchanged(() => grant(), [404]);
    const foreign = await user('ADMIN', foreignTenant);
    await deniedUnchanged(() => grant('READ', {}, foreign.id), [404]);
  });
  it('invalid dates, unknown operations, nested fields and wrong case/client are rejected without writes', async () => {
    await deniedUnchanged(() => grant('READ', { validUntil: null }), [400]);
    await deniedUnchanged(() => grant('READ', { validUntil: new Date(Date.now() - 100_000).toISOString() }), [400]);
    await deniedUnchanged(() => grant('READ', { operation: 'EXPORT' }), [400]);
    await deniedUnchanged(() => grant('READ', { user: { role: 'ADMIN' } }), [400]);
    await deniedUnchanged(() => grant('READ', { reason: 'TCKN 12345678901' }), [400]);
    await deniedUnchanged(() => grant('READ', { caseId: otherCase }), [404]);
  });
  it('unbound GLOBAL ALLOW is insufficient and existing explicit DENY prevails', async () => {
    await db.permissionGrant.create({ data: { tenantId: tenant, subjectUserId: reader, permissionKey: K73_KEYS.READ, effect: 'ALLOW', scope: 'GLOBAL', validUntil: new Date(Date.now() + 60_000) } });
    await deniedUnchanged(() => read());
    expect((await grant()).status).toBe(201);
    await db.permissionGrant.create({ data: { tenantId: tenant, subjectUserId: reader, permissionKey: K73_KEYS.READ, effect: 'DENY', scope: 'GLOBAL' } });
    await deniedUnchanged(() => read());
  });
  it('record parent is resolved by server; a different client scope cannot open it', async () => {
    const g = await grant('READ', { clientId: otherClient, subjectUserId: issuer }); expect(g.status).toBe(403);
    expect((await grant('READ', { caseId })).status).toBe(201);
    await deniedUnchanged(() => read(), [403]);
    await deniedUnchanged(() => read(reader, '?caseId=' + otherCase), [404]);
    expect((await read(reader, '?caseId=' + caseId)).status).toBe(200);
  });
  it('same JWT is rejected after explicit revoke; history and unrelated permissions remain', async () => {
    const g = data(await grant()); const token = await headers();
    expect((await read(reader, '', record, token)).status).toBe(200);
    const unrelated = await db.permissionGrant.create({ data: { tenantId: tenant, subjectUserId: reader, permissionKey: 'office.contact.manage', scope: 'GLOBAL', validUntil: new Date(Date.now() + 60_000) } });
    const r = await request(server()).post('/client-special-category-access/grants/' + g.id + '/revoke').set(await headers(issuer)).send({ reason: 'Duty ended' });
    expect(r.status).toBe(201); await deniedUnchanged(() => read(reader, '', record, token));
    expect((await scopes().findUniqueOrThrow({ where: { id: g.id } })).revokedAt).not.toBeNull();
    expect(await db.permissionGrant.findUnique({ where: { id: unrelated.id } })).toEqual(unrelated);
  });
  it('future and expired grants deny access; duty change closes future grants without rewriting their dates', async () => {
    const future = data(await grant('READ', { validFrom: new Date(Date.now() + 30_000).toISOString() }));
    await deniedUnchanged(() => read());
    const original = await scopes().findUniqueOrThrow({ where: { id: future.id }, include: { permissionGrant: true } });
    const r = await request(server()).post('/client-special-category-access/subjects/' + reader + '/duty-change').set(await headers(issuer)).send({ reason: 'Explicit duty change' });
    expect(r.status).toBe(201); expect(data(r).revokedGrantCount).toBe(1);
    const after = await scopes().findUniqueOrThrow({ where: { id: future.id }, include: { permissionGrant: true } });
    expect(after.permissionGrant).toEqual(original.permissionGrant); expect(after.revokedAt).not.toBeNull();
  });
  it('case-bound grants do not fall back; client-wide access survives one remaining canonical case, but never revives after the last removal', async () => {
    const extra = await db.case.create({ data: { tenantId: tenant, fileNumber: randomUUID(), type: 'GENERAL_EXECUTION', clientId: client } });
    await db.caseClient.create({ data: { caseId: extra.id, clientId: client } });
    const extraAssignment = await db.caseLawyer.create({ data: { caseId: extra.id, lawyerId: readerLawyer } });
    const clientGrant = data(await grant()), caseGrant = data(await grant('READ', { caseId }));
    const original = await db.caseLawyer.findUniqueOrThrow({ where: { caseId_lawyerId: { caseId, lawyerId: readerLawyer } } });
    await cases.removeCaseLawyer(tenant, caseId, original.id, issuer);
    expect((await scopes().findUniqueOrThrow({ where: { id: caseGrant.id } })).revokedAt).not.toBeNull();
    expect((await scopes().findUniqueOrThrow({ where: { id: clientGrant.id } })).revokedAt).toBeNull();
    expect((await read()).status).toBe(200);
    await cases.removeCaseLawyer(tenant, extra.id, extraAssignment.id, issuer);
    expect((await scopes().findUniqueOrThrow({ where: { id: clientGrant.id } })).revokedAt).not.toBeNull();
    await db.caseLawyer.create({ data: { caseId, lawyerId: readerLawyer } });
    await deniedUnchanged(() => read());
  });
  it('staff canView removal and re-addition never revive old scoped access', async () => {
    const g = data(await grant('READ', { subjectUserId: staffAdmin }));
    const assignment = await db.caseStaff.findUniqueOrThrow({ where: { caseId_staffMemberId: { caseId, staffMemberId: staffId } } });
    await cases.updateCaseStaff(tenant, caseId, assignment.id, { canView: false }, issuer);
    expect((await scopes().findUniqueOrThrow({ where: { id: g.id } })).revokedAt).not.toBeNull();
    await cases.updateCaseStaff(tenant, caseId, assignment.id, { canView: true }, issuer);
    await deniedUnchanged(() => read(staffAdmin));
  });
  it('staff deactivation blocks old JWT and new login; O-5 profile/account reopening does not restore K7.3', async () => {
    expect((await grant('READ', { subjectUserId: staffAdmin })).status).toBe(201);
    const token = await headers(staffAdmin), u = await db.user.findUniqueOrThrow({ where: { id: staffAdmin } });
    await staff.remove(staffId, tenant, actor());
    await deniedUnchanged(() => read(staffAdmin, '', record, token), [401]);
    await expect(auth.login({ email: u.email, password: PASSWORD, tenantSlug: tenant } as any)).rejects.toThrow();
    await staff.reactivate(staffId, tenant, REACTIVATE as any, actor());
    const review = await staff.reviewAccountReopen(staffId, tenant, issuer);
    await staff.reopenAccount(staffId, tenant, { reviewFingerprint: review.reviewFingerprint, keepGrantIds: [] } as any, actor());
    await deniedUnchanged(() => read(staffAdmin));
  });
  it('lawyer deactivation revokes K7.3 and does not delete permission history', async () => {
    const g = data(await grant()); await lawyers.delete(tenant, readerLawyer, actor());
    expect((await scopes().findUniqueOrThrow({ where: { id: g.id } })).revokedAt).not.toBeNull();
    expect(await db.permissionGrant.count({ where: { tenantId: tenant, subjectUserId: reader, permissionKey: K73_KEYS.READ } })).toBe(1);
  });
  it('corrupt linked accounts retain 409 and roll back profiles, existing grants and all audit writes', async () => {
    expect((await grant()).status).toBe(201);
    expect((await grant('READ', { subjectUserId: staffAdmin })).status).toBe(201);
    const foreignLawyer = await user('USER', foreignTenant), foreignStaff = await user('USER', foreignTenant);
    await db.lawyer.update({ where: { id: readerLawyer }, data: { userId: foreignLawyer.id } });
    await db.staffMember.update({ where: { id: staffId }, data: { userId: foreignStaff.id } });
    const before = await snapshot();
    await expect(lawyers.delete(tenant, readerLawyer, actor())).rejects.toBeInstanceOf(ConflictException);
    expect(await snapshot()).toEqual(before);
    await expect(staff.remove(staffId, tenant, actor())).rejects.toBeInstanceOf(ConflictException);
    expect(await snapshot()).toEqual(before);
    expect(await db.user.findUniqueOrThrow({ where: { id: foreignLawyer.id } })).toMatchObject({ isActive: true });
    expect(await db.user.findUniqueOrThrow({ where: { id: foreignStaff.id } })).toMatchObject({ isActive: true });
  });
  it('grant audit failure rolls back both permission and scope records', async () => {
    jest.spyOn(audit, 'logInTransaction').mockRejectedValueOnce(new Error('Synthetic grant audit failure'));
    await deniedUnchanged(() => grant(), [500]);
  });
  it('content is not returned when its required access audit cannot commit', async () => {
    expect((await grant()).status).toBe(201);
    jest.spyOn(audit, 'logInTransaction').mockRejectedValueOnce(new Error('Synthetic read audit failure'));
    await deniedUnchanged(() => read(), [500]);
  });
  it('real DB audit error rolls back revocation and linked staff/account deactivation', async () => {
    expect((await grant('READ', { subjectUserId: staffAdmin })).status).toBe(201);
    const before = await snapshot(); await failingRevokeAudit(true);
    await expect(staff.remove(staffId, tenant, actor())).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
  it.each(['expiry', 'revocation'])('waits at the real gate and rejects %s committed during the wait', async kind => {
    const g = data(await grant());
    let release!: () => void, ready!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; }), locked = new Promise<void>(resolve => { ready = resolve; });
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ClientSpecialCategoryGrantScope" WHERE "id"=${g.id} FOR UPDATE`;
      ready(); await blocked;
      if (kind === 'revocation') await (tx as any).clientSpecialCategoryGrantScope.update({ where: { id: g.id }, data: { revokedAt: new Date(), revokedByUserId: issuer, revokeReason: 'Concurrent revoke' } });
      else await tx.permissionGrant.updateMany({ where: { id: (await scopes().findUniqueOrThrow({ where: { id: g.id } })).permissionGrantId }, data: { validUntil: new Date(Date.now() - 1) } });
    }, { timeout: 15_000 });
    await locked; const pending = read().then(r => r);
    try { await waitForLock(); } finally { release(); }
    await holder; const r = await pending;
    expect(r.status).toBe(403); expect(JSON.stringify(r.body)).not.toContain('synthetic protected content');
    expect(await db.auditLog.count({ where: { tenantId: tenant, action: 'CLIENT_SPECIAL_DATA_ACCESS' } })).toBe(0);
  });
  it('grant creation rechecks target activity after an observed subject-lock wait', async () => {
    let release!: () => void, ready!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; }), locked = new Promise<void>(resolve => { ready = resolve; });
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${reader} FOR UPDATE`;
      ready(); await blocked; await tx.user.update({ where: { id: reader }, data: { isActive: false } });
    }, { timeout: 15_000 });
    await locked; const pending = grant().then(r => r);
    try { await waitForLock(); } finally { release(); }
    await holder; const response = await pending; expect(response.status).toBe(403);
    expect(await scopes().count({ where: { tenantId: tenant } })).toBe(0);
    expect(await db.permissionGrant.count({ where: { tenantId: tenant } })).toBe(0);
  });
  it('direct actor-facing entries reject absent/filter-shaped identity and object ids without wildcard reads or writes', async () => {
    expect((await grant()).status).toBe(201);
    const before = await snapshot();
    await expect(access.listGrants(tenant, issuer, { clientId: undefined as any })).rejects.toBeInstanceOf(NotFoundException);
    await expect(access.listGrants(tenant, issuer, { clientId: { not: '' } as any })).rejects.toBeInstanceOf(NotFoundException);
    await expect(access.capabilities(tenant, { not: '' } as any, { clientId: client })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(access.revoke(tenant, issuer, undefined as any, 'Synthetic reason')).rejects.toBeInstanceOf(NotFoundException);
    await expect(access.revoke(tenant, issuer, { not: '' } as any, 'Synthetic reason')).rejects.toBeInstanceOf(NotFoundException);
    await expect(records.readRecord({ tenantId: tenant, recordId: { not: '' } as any, actor: { userId: reader, role: 'USER' } })).rejects.toBeInstanceOf(NotFoundException);
    expect(await snapshot()).toEqual(before);
  });
  it('case deletion locks canonical subjects even without prior grants and rejects a concurrent first grant', async () => {
    let release!: () => void, ready!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; }), locked = new Promise<void>(resolve => { ready = resolve; });
    const holder = db.$transaction(async tx => {
      const subjects = await lockK73CaseSubjectsInTx(tx, tenant, caseId);
      expect(subjects).toContain(reader); ready(); await blocked;
      await tx.case.delete({ where: { id: caseId } });
      for (const subject of subjects) await revokeLostK73ScopesInTx(tx, tenant, subject, issuer, audit);
    }, { timeout: 15_000 });
    await locked; const pending = grant().then(r => r);
    try { await waitForLock(); } finally { release(); }
    await holder; expect((await pending).status).toBe(404);
    expect(await scopes().count({ where: { tenantId: tenant } })).toBe(0);
    expect(await db.permissionGrant.count({ where: { tenantId: tenant } })).toBe(0);
  });
  it('removing Staff assignment closes affected grants; re-adding the assignment does not revive them', async () => {
    const g = data(await grant('READ', { subjectUserId: staffAdmin }));
    const assignment = await db.caseStaff.findUniqueOrThrow({ where: { caseId_staffMemberId: { caseId, staffMemberId: staffId } } });
    await cases.removeCaseStaff(tenant, caseId, assignment.id, issuer);
    expect((await scopes().findUniqueOrThrow({ where: { id: g.id } })).revokedAt).not.toBeNull();
    await db.caseStaff.create({ data: { caseId, staffMemberId: staffId, roleOnCase: 'SEKRETER', canView: true } });
    await deniedUnchanged(() => read(staffAdmin));
  });
  it('case deletion preserves grant history and closes its case and last-client relation scopes', async () => {
    const a = data(await grant()), b = data(await grant('READ', { caseId }));
    await db.$transaction(async tx => {
      const subjects = await lockK73CaseSubjectsInTx(tx, tenant, caseId);
      await tx.case.delete({ where: { id: caseId } });
      for (const subject of subjects) await revokeLostK73ScopesInTx(tx, tenant, subject, issuer, audit);
    });
    const rows = await scopes().findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows).toHaveLength(2); expect(rows.every((r: any) => r.revokedAt)).toBe(true);
    expect(rows.find((r: any) => r.id === b.id).caseId).toBe(caseId);
    expect(await db.permissionGrant.count({ where: { tenantId: tenant } })).toBe(2);
  });
  it.each(['role', 'account'])('grant rechecks issuer %s after an observed subject-lock wait', async change => {
    let release!: () => void, ready!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; }), locked = new Promise<void>(resolve => { ready = resolve; });
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${reader} FOR UPDATE`;
      ready(); await blocked;
      await tx.user.update({ where: { id: issuer }, data: change === 'role' ? { role: 'USER' } : { isActive: false } });
    }, { timeout: 15_000 });
    await locked; const pending = grant().then(r => r);
    try { await waitForLock(); } finally { release(); }
    await holder; expect((await pending).status).toBe(403);
    expect(await scopes().count({ where: { tenantId: tenant } })).toBe(0);
    expect(await db.permissionGrant.count({ where: { tenantId: tenant } })).toBe(0);
  });
});
