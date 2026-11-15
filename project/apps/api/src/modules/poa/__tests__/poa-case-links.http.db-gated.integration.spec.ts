import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuditService } from '../../audit/audit.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { PoaController } from '../poa.controller';
import { PoaService } from '../poa.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('POA Case-link acceptance requires disposable TEST_DATABASE_URL; SKIP is not acceptance');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('Explicit POA Case links — real Nest HTTP and disposable PostgreSQL', () => {
  jest.setTimeout(90_000);
  let db: PrismaService;
  let app: INestApplication;
  let audit: AuditService;
  let poa: PoaService;
  let tenant: string;
  let foreignTenant: string;
  let clientId: string;
  let otherClientId: string;
  let foreignClientId: string;
  let caseId: string;
  let closedCaseId: string;
  let otherCaseId: string;
  let legacyOnlyCaseId: string;
  let inaccessibleCaseId: string;
  let foreignCaseId: string;
  let poaId: string;
  let secondPoaId: string;
  let foreignPoaId: string;
  let admin: string;
  let partner: string;
  let standardLawyer: string;
  let staff: string;
  let viewer: string;
  let outsider: string;
  let adminLawyerId: string;
  let expectedPoaUpdatedAt: string;
  let search: string;
  const storage = { assertContained: jest.fn(() => { throw new Error('Case links must not access storage'); }) };

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } });
    await db.$connect();
    audit = new AuditService(db);
    const approval = new OfficeApprovalService(db, audit);
    poa = new PoaService(db, audit, approval, storage as any);
    const identity = { async canActivate(ctx: any) {
      const request = ctx.switchToHttp().getRequest();
      const actorId = request.headers['x-test-user-id'];
      if (typeof actorId !== 'string' || !actorId) throw new UnauthorizedException();
      const actor = await db.user.findUnique({ where: { id: actorId } });
      if (!actor) throw new UnauthorizedException();
      request.user = actor;
      return true; // Only JWT identity is substituted; role/profile/Case/Client checks use the real DB.
    } };
    const module = await Test.createTestingModule({
      controllers: [PoaController],
      providers: [
        { provide: PrismaService, useValue: db },
        { provide: AuditService, useValue: audit },
        { provide: OfficeApprovalService, useValue: approval },
        { provide: PoaService, useValue: poa },
      ],
    }).overrideGuard(JwtAuthGuard).useValue(identity).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  async function makeActor(
    kind: 'LAWYER' | 'STAFF' | 'NONE',
    role: 'ADMIN' | 'USER' | 'VIEWER',
    assignedCases: string[],
    options: { tenantId?: string; rank?: 'LAWYER' | 'PARTNER' } = {},
  ) {
    const tenantId = options.tenantId ?? tenant;
    const user = await db.user.create({ data: {
      tenantId, role, email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: 'Case-link actor',
    } });
    let lawyerId: string | undefined;
    if (kind === 'LAWYER') {
      const lawyer = await db.lawyer.create({ data: {
        tenantId, userId: user.id, name: 'Synthetic', surname: 'Lawyer', lawyerRank: options.rank ?? 'LAWYER',
      } });
      lawyerId = lawyer.id;
      if (assignedCases.length) await db.caseLawyer.createMany({ data: assignedCases.map(id => ({ caseId: id, lawyerId: lawyer.id })) });
    }
    if (kind === 'STAFF') {
      const profile = await db.staffMember.create({ data: {
        tenantId, userId: user.id, firstName: 'Synthetic', lastName: 'Staff', staffType: 'SEKRETER',
      } });
      if (assignedCases.length) await db.caseStaff.createMany({ data: assignedCases.map(id => ({
        caseId: id, staffMemberId: profile.id, roleOnCase: 'SEKRETER', canView: true,
      })) });
    }
    return { userId: user.id, lawyerId };
  }

  async function makeCase(id: string, number: string, tenantId = tenant, canonical = true, closed = false) {
    const row = await db.case.create({ data: {
      tenantId, clientId: id, type: 'GENERAL_EXECUTION', fileNumber: number,
      caseStatus: closed ? 'HITAM' : 'DERDEST',
    } });
    if (canonical) await db.caseClient.create({ data: { caseId: row.id, clientId: id } });
    return row.id;
  }

  beforeEach(async () => {
    tenant = `poa-case-test-${randomUUID()}`;
    foreignTenant = `poa-case-foreign-test-${randomUUID()}`;
    search = `POA-${randomUUID()}`;
    for (const id of [tenant, foreignTenant]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic POA Case acceptance' } });
    clientId = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Declared client' } })).id;
    otherClientId = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Other client' } })).id;
    foreignClientId = (await db.client.create({ data: { tenantId: foreignTenant, type: 'PERSON', name: 'Foreign client' } })).id;
    caseId = await makeCase(clientId, `${search}-OPEN`);
    closedCaseId = await makeCase(clientId, `${search}-CLOSED`, tenant, true, true);
    otherCaseId = await makeCase(otherClientId, `${search}-OTHER-CLIENT`);
    legacyOnlyCaseId = await makeCase(clientId, `${search}-LEGACY-ONLY`, tenant, false);
    inaccessibleCaseId = await makeCase(clientId, `${search}-NO-ASSIGNMENT`);
    foreignCaseId = await makeCase(foreignClientId, `${search}-FOREIGN`, foreignTenant);
    const allVisibleCases = [caseId, closedCaseId, otherCaseId, legacyOnlyCaseId];
    const assignedAdmin = await makeActor('LAWYER', 'ADMIN', allVisibleCases);
    admin = assignedAdmin.userId;
    adminLawyerId = assignedAdmin.lawyerId!;
    partner = (await makeActor('LAWYER', 'USER', allVisibleCases, { rank: 'PARTNER' })).userId;
    standardLawyer = (await makeActor('LAWYER', 'USER', [caseId])).userId;
    staff = (await makeActor('STAFF', 'USER', [caseId])).userId;
    viewer = (await makeActor('LAWYER', 'VIEWER', allVisibleCases, { rank: 'PARTNER' })).userId;
    outsider = (await makeActor('LAWYER', 'ADMIN', [], { rank: 'PARTNER' })).userId;
    const first = await db.clientPowerOfAttorney.create({ data: {
      tenantId: tenant, clientId, notaryName: 'Synthetic notary', scopeType: 'GENEL',
      status: 'ACTIVE', isActive: true, filePath: 'unread-synthetic-document.pdf',
    } });
    poaId = first.id;
    expectedPoaUpdatedAt = first.updatedAt.toISOString();
    secondPoaId = (await db.clientPowerOfAttorney.create({ data: { tenantId: tenant, clientId, notaryName: 'Separate document' } })).id;
    foreignPoaId = (await db.clientPowerOfAttorney.create({ data: { tenantId: foreignTenant, clientId: foreignClientId } })).id;
    await db.poaLawyer.create({ data: { tenantId: tenant, poaId, lawyerId: adminLawyerId } });
    storage.assertContained.mockClear();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // Restrictive links are removed first, only within this test's synthetic tenants.
    await db.poaCaseLink.deleteMany({ where: { tenantId: { in: [tenant, foreignTenant] } } });
    for (const id of [tenant, foreignTenant]) await db.tenant.delete({ where: { id } });
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  const request = (method: 'get' | 'put' | 'delete', path: string, who: string | null = admin, body?: object) => {
    let result = http(app.getHttpServer())[method](path);
    if (who !== null) result = result.set('x-test-user-id', who);
    return body === undefined ? result : result.send(body);
  };
  const link = (id = caseId, who = admin, source = expectedPoaUpdatedAt, document = poaId) =>
    request('put', `/poa/${document}/cases/${id}`, who, { expectedPoaUpdatedAt: source });
  const unlink = (id = caseId, who = admin, source = expectedPoaUpdatedAt, document = poaId) =>
    request('delete', `/poa/${document}/cases/${id}`, who, { expectedPoaUpdatedAt: source });
  const list = (who = admin, document = poaId) => request('get', `/poa/${document}/cases`, who);
  const candidates = (who = admin, document = poaId) => request('get', `/poa/${document}/case-candidates`, who);
  const directLink = (values: Partial<{ poaId: string; clientId: string; caseId: string; tenantId: string }> = {}) =>
    db.poaCaseLink.create({ data: {
      tenantId: tenant, poaId, clientId, caseId, sourcePoaUpdatedAt: new Date(expectedPoaUpdatedAt), ...values,
    } });

  async function snapshot(): Promise<Record<string, unknown>> {
    const where = { tenantId: { in: [tenant, foreignTenant] } };
    const models = ['poaCaseLink', 'clientPowerOfAttorney', 'poaLawyer', 'case', 'client', 'auditLog',
      'clientNotification', 'clientIntakeLink', 'task', 'uyapOperation', 'uyapQuery'] as const;
    const rows = await Promise.all(models.map(async name => [name, await (db[name] as any).findMany({ where, orderBy: { id: 'asc' } })]));
    const caseClients = await db.caseClient.findMany({ where: { case: where }, orderBy: { id: 'asc' } });
    return { ...Object.fromEntries(rows), caseClients };
  }

  async function commandAudits() {
    return (await db.auditLog.findMany({ where: { tenantId: tenant }, orderBy: { createdAt: 'asc' } }))
      .filter(row => (row.metadata as any)?.commandType === 'POA_UPDATE');
  }

  async function assertRejectedWithoutWrites(run: () => PromiseLike<{ status: number }>, allowed = [403, 404]) {
    const before = await snapshot();
    const result = await run();
    expect(allowed).toContain(result.status);
    expect(await snapshot()).toEqual(before);
    expect(storage.assertContained).not.toHaveBeenCalled();
  }

  it('starts empty: GENEL and legacy Client references do not infer any Case link', async () => {
    const before = await snapshot();
    const result = await list().expect(200);
    expect(result.body).toEqual({ data: [], poaUpdatedAt: expectedPoaUpdatedAt, visibility: 'AUTHORIZED_CASES_ONLY', canManageLinks: true });
    expect(await snapshot()).toEqual(before);
    expect(await db.poaCaseLink.count({ where: { tenantId: tenant } })).toBe(0);
  });

  it('links explicit open and closed Cases and keeps separate documents independent, with one audit per successful command', async () => {
    const before = await snapshot();
    const second = await db.clientPowerOfAttorney.findUniqueOrThrow({ where: { id: secondPoaId } });
    for (const id of [caseId, closedCaseId]) {
      expect((await link(id).expect(200)).body).toEqual({ caseId: id, linked: true, changed: true, sourcePoaUpdatedAt: expectedPoaUpdatedAt });
    }
    await link(caseId, partner, second.updatedAt.toISOString(), secondPoaId).expect(200);
    const result = await list().expect(200);
    expect(result.body.data).toEqual(expect.arrayContaining([caseId, closedCaseId].map(id => ({
      caseId: id, fileNumber: expect.any(String), sourcePoaUpdatedAt: expectedPoaUpdatedAt, sourceChanged: false,
    }))));
    expect(result.body.data).toHaveLength(2);
    expect((await list(admin, secondPoaId).expect(200)).body.data.map((row: any) => row.caseId)).toEqual([caseId]);
    expect(await db.poaCaseLink.count({ where: { tenantId: tenant } })).toBe(3);
    const audits = await commandAudits();
    expect(audits).toHaveLength(3);
    expect(audits.every(row => row.action === 'CLIENT_WORKSPACE_COMMAND' && row.userId && row.createdAt &&
      (row.metadata as any).scope === 'DECLARED_CASE_LINK_ONLY')).toBe(true);
    const after = await snapshot();
    for (const name of ['clientPowerOfAttorney', 'poaLawyer', 'case', 'caseClients', 'client',
      'clientNotification', 'clientIntakeLink', 'task', 'uyapOperation', 'uyapQuery']) expect(after[name]).toEqual(before[name]);
    expect(storage.assertContained).not.toHaveBeenCalled();
  });

  it('pages and searches only authorized canonical Cases of the real parent Client, including linked and closed Cases', async () => {
    await link().expect(200);
    const first = await candidates().query({ page: 1, limit: 1, q: search }).expect(200);
    const second = await candidates().query({ page: 2, limit: 1, q: search }).expect(200);
    expect(first.body.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(second.body.pagination).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect(new Set([...first.body.data, ...second.body.data].map((row: any) => row.caseId))).toEqual(new Set([caseId, closedCaseId]));
    for (const row of [...first.body.data, ...second.body.data]) expect(Object.keys(row).sort()).toEqual(['caseId', 'fileNumber']);
    const filtered = await candidates().query({ q: `${search}-CLOSED` }).expect(200);
    expect(filtered.body.data.map((row: any) => row.caseId)).toEqual([closedCaseId]);
    expect(JSON.stringify([first.body, second.body])).not.toContain('OTHER-CLIENT');
    expect(await commandAudits()).toHaveLength(1);
  });

  it.each(['LAWYER', 'STAFF'] as const)('%s can read only its authorized subset and cannot acquire POA_UPDATE authority from access alone', async kind => {
    await link().expect(200);
    await link(closedCaseId).expect(200);
    const who = kind === 'LAWYER' ? standardLawyer : staff;
    const before = await snapshot();
    const result = await list(who).expect(200);
    expect(result.body).toMatchObject({ visibility: 'AUTHORIZED_CASES_ONLY', canManageLinks: false });
    expect(result.body.data.map((row: any) => row.caseId)).toEqual([caseId]);
    expect((await candidates(who).expect(200)).body.data.map((row: any) => row.caseId)).toEqual([caseId]);
    expect(await snapshot()).toEqual(before);
    await assertRejectedWithoutWrites(() => link(caseId, who), [403]);
    await assertRejectedWithoutWrites(() => unlink(caseId, who), [403]);
  });

  it('repeated PUT and absent DELETE keep business state unchanged and produce one command audit for each successful request', async () => {
    await link().expect(200);
    const row = await db.poaCaseLink.findUniqueOrThrow({ where: { poaId_caseId: { poaId, caseId } } });
    expect((await link().expect(200)).body).toEqual({ caseId, linked: true, changed: false, sourcePoaUpdatedAt: expectedPoaUpdatedAt });
    expect(await db.poaCaseLink.findUniqueOrThrow({ where: { poaId_caseId: { poaId, caseId } } })).toEqual(row);
    expect((await unlink().expect(200)).body).toEqual({ caseId, linked: false, changed: true, sourcePoaUpdatedAt: expectedPoaUpdatedAt });
    expect((await unlink().expect(200)).body).toEqual({ caseId, linked: false, changed: false, sourcePoaUpdatedAt: expectedPoaUpdatedAt });
    expect(await db.poaCaseLink.count({ where: { tenantId: tenant } })).toBe(0);
    expect(await db.clientPowerOfAttorney.count({ where: { tenantId: tenant } })).toBe(2);
    expect(await db.caseClient.count({ where: { caseId, clientId } })).toBe(1);
    const audits = await commandAudits();
    expect(audits).toHaveLength(4);
    expect(audits.map(row => `${(row.metadata as any).linked}:${(row.metadata as any).changed}`).sort())
      .toEqual(['false:false', 'false:true', 'true:false', 'true:true']);
  });

  it.each(['OTHER_CLIENT', 'LEGACY_ONLY', 'NO_CASE_ASSIGNMENT', 'FOREIGN_CASE', 'MISSING_CASE', 'FOREIGN_POA', 'MISSING_POA'] as const)
  ('%s cannot link or unlink through parent-only access; rejected requests leave all observed state unchanged', async kind => {
    const target = kind === 'OTHER_CLIENT' ? otherCaseId : kind === 'LEGACY_ONLY' ? legacyOnlyCaseId :
      kind === 'NO_CASE_ASSIGNMENT' ? inaccessibleCaseId : kind === 'FOREIGN_CASE' ? foreignCaseId :
        kind === 'MISSING_CASE' ? `missing-${randomUUID()}` : caseId;
    const document = kind === 'FOREIGN_POA' ? foreignPoaId : kind === 'MISSING_POA' ? `missing-${randomUUID()}` : poaId;
    await assertRejectedWithoutWrites(() => link(target, admin, expectedPoaUpdatedAt, document));
    await assertRejectedWithoutWrites(() => unlink(target, admin, expectedPoaUpdatedAt, document));
  });

  it.each(['ADMIN_NO_CASE', 'NO_PROFILE', 'INACTIVE_ACTOR', 'INACTIVE_LAWYER', 'INACTIVE_STAFF', 'STAFF_CANNOT_VIEW', 'VIEWER', 'FOREIGN_ACTOR'] as const)
  ('%s fails closed for reads and writes without role or profile bypass', async kind => {
    let who = outsider;
    if (kind === 'NO_PROFILE') who = (await makeActor('NONE', 'ADMIN', [])).userId;
    if (kind === 'INACTIVE_ACTOR') { who = admin; await db.user.update({ where: { id: who }, data: { isActive: false } }); }
    if (kind === 'INACTIVE_LAWYER') { who = admin; await db.lawyer.update({ where: { id: adminLawyerId }, data: { isActive: false } }); }
    if (kind === 'INACTIVE_STAFF') { who = staff; await db.staffMember.updateMany({ where: { userId: who }, data: { isActive: false } }); }
    if (kind === 'STAFF_CANNOT_VIEW') { who = staff; await db.caseStaff.updateMany({ where: { caseId }, data: { canView: false } }); }
    if (kind === 'VIEWER') who = viewer;
    if (kind === 'FOREIGN_ACTOR') who = (await makeActor('LAWYER', 'ADMIN', [foreignCaseId], { tenantId: foreignTenant })).userId;
    await assertRejectedWithoutWrites(() => list(who));
    await assertRejectedWithoutWrites(() => candidates(who));
    await assertRejectedWithoutWrites(() => link(caseId, who));
    await assertRejectedWithoutWrites(() => unlink(caseId, who));
  });

  it('missing HTTP identity and direct-service actor cannot read or mutate', async () => {
    await assertRejectedWithoutWrites(() => request('get', `/poa/${poaId}/cases`, null), [401]);
    await assertRejectedWithoutWrites(() => request('put', `/poa/${poaId}/cases/${caseId}`, null, { expectedPoaUpdatedAt }), [401]);
    const before = await snapshot();
    await expect(poa.listCaseLinks(poaId, tenant, undefined as any)).rejects.toMatchObject({ status: 403 });
    await expect(poa.listCaseLinkCandidates(poaId, {}, tenant, undefined as any)).rejects.toMatchObject({ status: 403 });
    await expect(poa.linkCase(poaId, caseId, { expectedPoaUpdatedAt }, tenant, undefined as any)).rejects.toMatchObject({ status: 403 });
    await expect(poa.unlinkCase(poaId, caseId, { expectedPoaUpdatedAt }, tenant, undefined as any)).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['USER_AS_ADMIN', 'LINK'], ['USER_AS_ADMIN', 'LIST'],
    ['ADMIN_AS_USER', 'LINK'], ['ADMIN_AS_USER', 'LIST'],
  ] as const)('forged service role %s is rejected by %s without any link or audit write', async (kind, operation) => {
    const actor = {
      userId: kind === 'USER_AS_ADMIN' ? standardLawyer : admin,
      tenantId: tenant,
      role: kind === 'USER_AS_ADMIN' ? 'ADMIN' : 'USER',
    };
    const before = await snapshot();
    const action = operation === 'LINK'
      ? poa.linkCase(poaId, caseId, { expectedPoaUpdatedAt }, tenant, actor)
      : poa.listCaseLinks(poaId, tenant, actor);
    await expect(action).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
    expect(await db.poaCaseLink.count({ where: { tenantId: tenant } })).toBe(0);
    expect(await commandAudits()).toHaveLength(0);
  });

  it('forged service role defense preserves canonical elevation for a matching USER partner', async () => {
    const actor = { userId: partner, tenantId: tenant, role: 'USER' };
    expect(await poa.listCaseLinks(poaId, tenant, actor)).toMatchObject({ data: [], canManageLinks: true });
    expect(await commandAudits()).toHaveLength(0);
    expect(await poa.linkCase(poaId, caseId, { expectedPoaUpdatedAt }, tenant, actor))
      .toEqual({ caseId, linked: true, changed: true, sourcePoaUpdatedAt: expectedPoaUpdatedAt });
    expect(await db.poaCaseLink.count({ where: { tenantId: tenant } })).toBe(1);
    expect(await commandAudits()).toHaveLength(1);
  });

  it.each([{}, { expectedPoaUpdatedAt: 'invalid' }, { expectedPoaUpdatedAt: 123 },
    { expectedPoaUpdatedAt: '2026-11-15' }, { expectedPoaUpdatedAt: null }])
  ('rejects malformed source preconditions %j before any write', async body => {
    await assertRejectedWithoutWrites(() => request('put', `/poa/${poaId}/cases/${caseId}`, admin, body), [400]);
    await assertRejectedWithoutWrites(() => request('delete', `/poa/${poaId}/cases/${caseId}`, admin, body), [400]);
  });

  it('rejects body-selected parent, tenant, Case and authorization fields', async () => {
    for (const extra of [{ clientId: otherClientId }, { tenantId: foreignTenant }, { caseId: otherCaseId },
      { actor: { userId: outsider } }, { linked: true }]) {
      await assertRejectedWithoutWrites(() => request('put', `/poa/${poaId}/cases/${caseId}`, admin, { expectedPoaUpdatedAt, ...extra }), [400]);
      await assertRejectedWithoutWrites(() => request('delete', `/poa/${poaId}/cases/${caseId}`, admin, { expectedPoaUpdatedAt, ...extra }), [400]);
    }
  });

  it('exposes a technical source change without refreshing the old declaration or changing legacy validity', async () => {
    await link().expect(200);
    const linked = await db.poaCaseLink.findUniqueOrThrow({ where: { poaId_caseId: { poaId, caseId } } });
    const beforeValidity = await poa.checkValidPoa(clientId, adminLawyerId, tenant);
    const changedAt = new Date(new Date(expectedPoaUpdatedAt).getTime() + 1000);
    await db.clientPowerOfAttorney.update({ where: { id: poaId }, data: { updatedAt: changedAt, scopeDescription: 'Synthetic changed document metadata' } });
    const result = await list().expect(200);
    expect(result.body.poaUpdatedAt).toBe(changedAt.toISOString());
    expect(result.body.data).toEqual([{ caseId, fileNumber: expect.any(String), sourcePoaUpdatedAt: expectedPoaUpdatedAt, sourceChanged: true }]);
    await assertRejectedWithoutWrites(() => link(closedCaseId), [409]);
    await assertRejectedWithoutWrites(() => unlink(), [409]);
    expect(await db.poaCaseLink.findUniqueOrThrow({ where: { poaId_caseId: { poaId, caseId } } })).toEqual(linked);
    await link(closedCaseId, admin, changedAt.toISOString()).expect(200);
    const afterValidity = await poa.checkValidPoa(clientId, adminLawyerId, tenant);
    expect(afterValidity.isValid).toBe(beforeValidity.isValid);
    expect(afterValidity).toMatchObject({ scopeStatus: 'NOT_EVALUATED' });
    expect((await list().expect(200)).body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ caseId, sourcePoaUpdatedAt: expectedPoaUpdatedAt, sourceChanged: true }),
      expect.objectContaining({ caseId: closedCaseId, sourcePoaUpdatedAt: changedAt.toISOString(), sourceChanged: false }),
    ]));
  });

  it('concurrent identical PUTs create one row with one changed result, while distinct Cases are both preserved', async () => {
    const same = await Promise.all([link(), link()]);
    expect(same.map(result => result.status)).toEqual([200, 200]);
    expect(same.map(result => result.body.changed).sort()).toEqual([false, true]);
    expect(await db.poaCaseLink.count({ where: { poaId, caseId } })).toBe(1);
    const third = await makeCase(clientId, `${search}-THIRD`);
    await db.caseLawyer.create({ data: { caseId: third, lawyerId: adminLawyerId } });
    const separate = await Promise.all([link(closedCaseId), link(third)]);
    expect(separate.map(result => result.status)).toEqual([200, 200]);
    expect(separate.every(result => result.body.changed === true)).toBe(true);
    expect(await db.poaCaseLink.count({ where: { poaId } })).toBe(3);
    expect(await commandAudits()).toHaveLength(4);
  });

  it('concurrent PUT and DELETE on one Case admit only a serial outcome and audit both commands', async () => {
    const results = await Promise.all([link(), unlink()]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(results[0].body).toMatchObject({ caseId, linked: true, changed: true });
    const count = await db.poaCaseLink.count({ where: { poaId, caseId } });
    // DELETE before PUT is an absent-row no-op; PUT before DELETE removes the newly created row.
    expect(count).toBe(results[1].body.changed ? 0 : 1);
    expect(await commandAudits()).toHaveLength(2);
  });

  it.each(['LINK', 'UNLINK'] as const)('%s rolls back the link and audit together when transactional audit fails', async operation => {
    if (operation === 'UNLINK') await link().expect(200);
    const before = await snapshot();
    const original = audit.logInTransaction.bind(audit);
    jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx, input) => {
      await original(tx, input);
      throw new Error('Synthetic audit failure after insert');
    });
    await (operation === 'LINK' ? link() : unlink()).expect(500);
    expect(await snapshot()).toEqual(before);
    expect(storage.assertContained).not.toHaveBeenCalled();
  });

  it('has validated restrictive composite FKs for parent Client/tenant, Case tenant and canonical CaseClient', async () => {
    const constraints = await db.$queryRaw<Array<{ conname: string; convalidated: boolean; confdeltype: string; definition: string }>>`
      SELECT conname, convalidated, confdeltype::text,
             pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid = '"PoaCaseLink"'::regclass AND contype = 'f'
      ORDER BY conname
    `;
    expect(constraints).toHaveLength(3);
    expect(constraints.every(row => row.convalidated && row.confdeltype === 'r')).toBe(true);
    expect(constraints.map(row => row.definition)).toEqual(expect.arrayContaining([
      expect.stringContaining('FOREIGN KEY ("poaId", "clientId", "tenantId") REFERENCES "ClientPowerOfAttorney"(id, "clientId", "tenantId")'),
      expect.stringContaining('FOREIGN KEY ("caseId", "tenantId") REFERENCES "Case"(id, "tenantId")'),
      expect.stringContaining('FOREIGN KEY ("caseId", "clientId") REFERENCES "CaseClient"("caseId", "clientId")'),
    ]));
  });

  it.each(['POA_CLIENT', 'CASE_TENANT', 'CASE_CLIENT', 'MISSING_POA'] as const)('DB rejects %s mismatch without relying on the service', async kind => {
    // CaseClient itself has no tenant column. Isolate the new Case/tenant FK even if a
    // malformed cross-tenant pair was written directly through that pre-existing model.
    if (kind === 'CASE_TENANT') await db.caseClient.create({ data: { caseId: foreignCaseId, clientId } });
    const values = kind === 'POA_CLIENT' ? { clientId: otherClientId, caseId: otherCaseId } :
      kind === 'CASE_TENANT' ? { caseId: foreignCaseId } : kind === 'CASE_CLIENT' ? { caseId: legacyOnlyCaseId } :
        { poaId: `missing-${randomUUID()}` };
    await expect(directLink(values)).rejects.toMatchObject({ code: 'P2003' });
    expect(await db.poaCaseLink.count({ where: { tenantId: tenant } })).toBe(0);
  });

  it('DB uniqueness rejects duplicate pairs and restricts physical parent deletion until the explicit link is removed', async () => {
    await directLink();
    await expect(directLink()).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.clientPowerOfAttorney.delete({ where: { id: poaId } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.case.delete({ where: { id: caseId } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.caseClient.delete({ where: { caseId_clientId: { caseId, clientId } } })).rejects.toMatchObject({ code: 'P2003' });
    expect(await db.poaCaseLink.count({ where: { poaId, caseId } })).toBe(1);
    await unlink().expect(200);
    expect(await db.clientPowerOfAttorney.count({ where: { id: poaId } })).toBe(1);
    expect(await db.case.count({ where: { id: caseId } })).toBe(1);
    expect(await db.caseClient.count({ where: { caseId, clientId } })).toBe(1);
  });
});
