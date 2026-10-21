jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('No external renderer in client read acceptance'); } }));
import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ClientController } from '../client.controller';
import { ClientService } from '../client.service';
import { AuditService } from '../../audit/audit.service';
import { ClientIntakeLinkService } from '../../client-intake-link/client-intake-link.service';
import { presentInternalClient } from '../client-internal-read.presenter';
import { seedClientWorkspaceLiveSmokeFixture, cleanupClientWorkspaceLiveSmokeFixture } from '../../../scripts/client-workspace-live-smoke-seed';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('K16 internal read requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('K16 internal client read — real HTTP/PostgreSQL scope and field projection', () => {
  let db: PrismaService, app: INestApplication, service: ClientService;
  let tenant: string, foreign: string, clientId: string, unlinked: string, caseId: string;
  const identity = '10000000146', iban = 'TR120001000000000000001234';
  const email = 'synthetic@example.test', phone = '+905551112233', address = 'Synthetic full street';
  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } }); await db.$connect();
    const module = await Test.createTestingModule({ controllers: [ClientController], providers: [
      { provide: ClientService, useFactory: () => new ClientService(db, new AuditService(db), {} as any) },
      { provide: ClientIntakeLinkService, useValue: {} },
    ] }).overrideGuard(JwtAuthGuard).useValue({ async canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
      if (!user) throw new UnauthorizedException();
      // Stale role/elevated claim must not replace the current DB decision.
      req.user = { ...user, role: 'ADMIN' }; return true;
    } }).compile();
    service = module.get(ClientService); app = module.createNestApplication();
    await app.init(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenant = `k16-client-test-${randomUUID()}`; foreign = `k16-foreign-test-${randomUUID()}`;
    for (const id of [tenant, foreign]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic client read tenant' } });
    clientId = (await db.client.create({ data: { tenantId: tenant, type: 'INDIVIDUAL', name: 'Synthetic Client',
      firstName: 'Synthetic', lastName: 'Client', tckn: identity, identityNo: identity, vkn: '1234567890',
      email, phone, address, notes: 'private note',
      contacts: { create: [{ type: 'EMAIL', value: email }, { type: 'MOBILE', value: phone }] },
      bankAccounts: { create: { bankName: 'Synthetic bank', iban } },
      addresses: { create: { street: address, city: 'Synthetic city', isPrimary: true } },
    } })).id;
    unlinked = (await db.client.create({ data: { tenantId: tenant, type: 'INDIVIDUAL', name: 'No linked case' } })).id;
    caseId = (await db.case.create({ data: { tenantId: tenant, clientId, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } })).id;
    await db.caseClient.create({ data: { caseId, clientId } });
  });
  afterEach(async () => { jest.restoreAllMocks(); for (const id of [tenant, foreign]) await db.tenant.delete({ where: { id } }); });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });
  async function actor(kind: 'lawyer' | 'staff' | 'none', role: 'USER' | 'ADMIN' | 'VIEWER' = 'USER', t = tenant) {
    const user = await db.user.create({ data: { tenantId: t, role, email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: 'Actor' } });
    const lawyer = kind === 'lawyer' ? await db.lawyer.create({ data: { tenantId: t, userId: user.id, name: 'Synthetic', surname: 'Lawyer', lawyerRank: 'LAWYER' } }) : null;
    const staff = kind === 'staff' ? await db.staffMember.create({ data: { tenantId: t, userId: user.id, firstName: 'Synthetic', lastName: 'Staff', staffType: 'MUHASEBE' } }) : null;
    return { user, lawyer, staff };
  }
  async function assign(a: Awaited<ReturnType<typeof actor>>, target = caseId, canView = true) {
    if (a.lawyer) await db.caseLawyer.create({ data: { caseId: target, lawyerId: a.lawyer.id } });
    if (a.staff) await db.caseStaff.create({ data: { caseId: target, staffMemberId: a.staff.id, roleOnCase: 'MUHASEBE', canView } });
  }
  const get = (id: string, path = '/clients') => http(app.getHttpServer()).get(path).set('x-test-user-id', id);
  async function assertNoScope(a: Awaited<ReturnType<typeof actor>>) {
    expect((await get(a.user.id).expect(200)).body.data).toEqual([]);
    expect((await get(a.user.id, '/clients?search=Synthetic').expect(200)).body.data).toEqual([]);
    await get(a.user.id, '/clients/' + clientId).expect(404);
  }
  it.each(['lawyer', 'staff'] as const)('%s explicit canonical relationship authorizes list/search and communication detail', async kind => {
    const a = await actor(kind); await assign(a);
    const before = await service.findOne(clientId, tenant);
    for (const path of ['/clients', '/clients?search=Synthetic']) {
      const rows = (await get(a.user.id, path).expect(200)).body.data;
      expect(rows).toHaveLength(1); expect(rows[0].id).toBe(clientId);
      expect(rows[0]).toMatchObject({ tckn: '100****46', vkn: '123****90', identityNo: '100****46', phone: '+905****33', email: 'sy****@example.test' });
      expect(rows[0]).not.toHaveProperty('address'); expect(rows[0]).not.toHaveProperty('notes');
      if (path === '/clients') expect(rows[0].contacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: 'sy****@example.test' }), expect.objectContaining({ value: '+905****33' }),
      ]));
      for (const raw of [identity, iban, phone, email, address, 'private note']) expect(JSON.stringify(rows)).not.toContain(raw);
    }
    const detail = (await get(a.user.id, '/clients/' + clientId).expect(200)).body.data;
    expect(detail).toMatchObject({ id: clientId, tckn: '100****46', vkn: '123****90', identityNo: '100****46', email, phone, address });
    expect(detail.bankAccounts[0].iban).toBe('TR12****1234'); expect(detail.addresses[0].street).toBe(address);
    expect(detail.contacts).toEqual(expect.arrayContaining([expect.objectContaining({ value: email })]));
    expect(detail).not.toHaveProperty('notes');
    expect(await service.findOne(clientId, tenant)).toEqual(before); // No persistence/mutation/internal reader masking.
  });
  it.each(['USER', 'ADMIN'] as const)('%s alone grants no client access', async role => assertNoScope(await actor('none', role)));
  it('ADMIN still needs the same object relation and remains masked', async () => {
    const a = await actor('lawyer', 'ADMIN'); await assign(a);
    expect((await get(a.user.id, '/clients/' + clientId).expect(200)).body.data.tckn).toBe('100****46');
  });
  it.each(['PARTNER', 'MANAGER'] as const)('%s title alone grants nothing', async rank => {
    const a = await actor('lawyer'); await db.lawyer.update({ where: { id: a.lawyer!.id }, data: { lawyerRank: rank } }); await assertNoScope(a);
  });
  it('VIEWER is denied even with assignment and forged elevated claim', async () => {
    const a = await actor('lawyer', 'VIEWER'); await assign(a);
    await get(a.user.id).expect(403); await get(a.user.id, '/clients/' + clientId).expect(403);
  });
  it.each(['lawyer', 'staff'] as const)('inactive %s profile cannot authorize', async kind => {
    const a = await actor(kind); await assign(a);
    if (a.lawyer) await db.lawyer.update({ where: { id: a.lawyer.id }, data: { isActive: false } });
    if (a.staff) await db.staffMember.update({ where: { id: a.staff.id }, data: { isActive: false } });
    await assertNoScope(a);
  });
  it('inactive account fails closed even when its HTTP identity was supplied', async () => {
    const a = await actor('lawyer'); await assign(a); await db.user.update({ where: { id: a.user.id }, data: { isActive: false } });
    await get(a.user.id).expect(403);
  });
  it('canView=false is not replaced by canEdit/canApprove', async () => {
    const a = await actor('staff'); await assign(a, caseId, false);
    await db.caseStaff.updateMany({ where: { staffMemberId: a.staff!.id }, data: { canEdit: true, canApprove: true } });
    await assertNoScope(a);
  });
  it('legacy Case.clientId without canonical CaseClient does not grant access', async () => {
    const a = await actor('lawyer'); await assign(a); await db.caseClient.deleteMany({ where: { caseId } }); await assertNoScope(a);
  });
  it('another case assignment cannot authorize this client', async () => {
    const a = await actor('lawyer'); const c = await db.case.create({ data: { tenantId: tenant, clientId: unlinked, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } });
    await assign(a, c.id); await assertNoScope(a);
  });
  it('no-case client is excluded and detail denied', async () => {
    const a = await actor('lawyer'); await assign(a); await get(a.user.id, '/clients/' + unlinked).expect(404);
    expect((await get(a.user.id).expect(200)).body.data.map((r: any) => r.id)).toEqual([clientId]);
  });
  it.each(['USER', 'ADMIN'] as const)('14a: %s can create a client for selection from POST without granting list/detail access', async role => {
    const a = await actor('none', role);
    const payload = { type: 'PERSON', firstName: 'New', lastName: 'Synthetic', tckn: '10000000214',
      phone: '+905551110000', email: 'new-client@example.test' };
    expect((await get(a.user.id).expect(200)).body.data).toEqual([]);
    const created = (await http(app.getHttpServer()).post('/clients')
      .set('x-test-user-id', a.user.id).send(payload).expect(201)).body.data;
    expect(created).toMatchObject({ id: expect.any(String), tenantId: tenant, displayName: 'New Synthetic' });
    expect(created.id).not.toBe(clientId);
    expect(await db.client.count({ where: { tenantId: tenant, tckn: payload.tckn } })).toBe(1);
    expect(await db.caseClient.count({ where: { clientId: created.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { tenantId: tenant, entityId: created.id, action: 'CLIENT_CREATE', userId: a.user.id } })).toBe(1);
    const persisted = await db.client.findUniqueOrThrow({ where: { id: created.id } });
    expect((await get(a.user.id).expect(200)).body.data).toEqual([]);
    expect((await get(a.user.id, '/clients?search=' + payload.tckn).expect(200)).body.data).toEqual([]);
    await get(a.user.id, '/clients/' + created.id).expect(404);
    expect(await db.client.findUniqueOrThrow({ where: { id: created.id } })).toEqual(persisted);
  });
  it('raw identity search is performed inside object scope but returns only masked values', async () => {
    const a = await actor('lawyer'); await assign(a);
    const rows = (await get(a.user.id, '/clients?search=' + identity).expect(200)).body.data;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ id: clientId, tckn: '100****46' });
    expect(JSON.stringify(rows)).not.toContain(identity);
    const unrelated = await actor('lawyer');
    expect((await get(unrelated.user.id, '/clients?search=' + identity).expect(200)).body.data).toEqual([]);
  });
  it('cross-tenant actor/case/profile linkage cannot authorize', async () => {
    const a = await actor('lawyer', 'USER', foreign); await assign(a);
    await get(a.user.id, '/clients/' + clientId).expect(404); expect((await get(a.user.id).expect(200)).body.data).toEqual([]);
  });
  it('cross-tenant case joined to the client cannot authorize a local actor', async () => {
    const a = await actor('lawyer'); const foreignClient = await db.client.create({ data: { tenantId: foreign, type: 'INDIVIDUAL' } });
    const c = await db.case.create({ data: { tenantId: foreign, clientId: foreignClient.id, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } });
    await db.caseClient.create({ data: { caseId: c.id, clientId } }); await assign(a, c.id); await assertNoScope(a);
  });
  it('revoked assignment takes effect on the next read', async () => {
    const a = await actor('lawyer'); await assign(a); await get(a.user.id, '/clients/' + clientId).expect(200);
    await db.caseLawyer.deleteMany({ where: { caseId } }); await assertNoScope(a);
  });
  it('inactive target remains unavailable and cannot be requested via includeInactive query', async () => {
    const a = await actor('lawyer'); await assign(a); await db.client.update({ where: { id: clientId }, data: { isActive: false } });
    await get(a.user.id, '/clients/' + clientId + '?includeInactive=true').expect(404);
    expect((await get(a.user.id).expect(200)).body.data).toEqual([]);
  });
  it('missing internal actor is rejected before client query', async () => {
    const spy = jest.spyOn(db.client, 'findMany'); await expect(service.readInternalClients(tenant, '')).rejects.toMatchObject({ status: 403 }); expect(spy).not.toHaveBeenCalled();
  });
  it('list presenter handles nested IBAN/address/notes without mutating its input', () => {
    const source = { tckn: identity, bankAccounts: [{ iban }], addresses: [{ street: address, postalCode: '12345', city: 'City' }],
      powerOfAttorneys: [{ id: 'p', notes: 'private note' }], portalUser: { email }, notes: 'private note' };
    const before = JSON.stringify(source); const result = presentInternalClient(source, 'LIST');
    expect(result.bankAccounts[0].iban).toBe('TR12****1234'); expect(result.addresses[0]).toEqual({ city: 'City' });
    expect(result.powerOfAttorneys[0]).toEqual({ id: 'p' }); expect(result.portalUser.email).toBe('sy****@example.test'); expect(JSON.stringify(source)).toBe(before);
  });
  it('CI smoke fixture supplies explicit read membership idempotently and cleans only its own profile', async () => {
    await db.tenant.update({ where: { id: tenant }, data: { slug: 'demo-firma' } });
    const user = await db.user.create({ data: { tenantId: tenant, email: 'admin@hukuk.com', role: 'ADMIN', name: 'Synthetic', surname: 'Smoke' } });
    const key = 'k16-smoke-fixture-test';
    const seeded = await seedClientWorkspaceLiveSmokeFixture(db, key);
    await get(user.id, '/clients/' + seeded.clientId).expect(200);
    await seedClientWorkspaceLiveSmokeFixture(db, key);
    expect(await db.caseLawyer.count({ where: { caseId: seeded.caseId } })).toBe(1);
    await cleanupClientWorkspaceLiveSmokeFixture(db, key);
    expect(await db.lawyer.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.user.count({ where: { id: user.id } })).toBe(1);
    const existing = await db.lawyer.create({ data: { tenantId: tenant, userId: user.id, name: 'Existing', surname: 'Actor' } });
    const before = await db.lawyer.findUniqueOrThrow({ where: { id: existing.id } });
    await seedClientWorkspaceLiveSmokeFixture(db, key);
    await get(user.id, '/clients/' + seeded.clientId).expect(200);
    await cleanupClientWorkspaceLiveSmokeFixture(db, key);
    expect(await db.lawyer.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(before);
  });
});
