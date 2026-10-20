jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('No PDF/provider transport in history acceptance'); } }));

import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { ClientNotificationController } from '../client-notification.controller';
import { ClientNotificationService } from '../client-notification.service';
import { ClientNotificationAuthorityAdapter } from '../client-notification-authority.adapter';
import { ClientNotificationHistoryAccessService } from '../client-notification-history-access.service';
import { ClientNotificationModule } from '../client-notification.module';
import { NotificationHistoryPermissionService, NOTIFICATION_HISTORY_AUDIT_PERMISSION as KEY } from '../notification-history-permission.service';
import { AuditService } from '../../audit/audit.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('History HTTP acceptance requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('K17 notification history — real HTTP, authorization, projection and cursor on PostgreSQL', () => {
  let db: PrismaService; let app: INestApplication; let history: ClientNotificationHistoryAccessService;
  let tenant: string; let foreign: string; let client: string; let otherClient: string;
  let caseId: string; let otherCase: string; let foreignCase: string; let admin: string;
  const stamp = new Date('2026-01-01T12:00:00.000Z');
  const statuses = ['caseId', 'channel', 'createdAt', 'deliveredAt', 'id', 'sentAt', 'status', 'type'];

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } }); await db.$connect();
    const module = await Test.createTestingModule({ controllers: [ClientNotificationController], providers: [
      { provide: PrismaService, useValue: db }, ClientNotificationHistoryAccessService,
      { provide: ClientNotificationService, useValue: {} },
      { provide: ClientNotificationAuthorityAdapter, useValue: {} },
    ] }).overrideGuard(OfficeF01AuthorizationGuard).useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard).useValue({ async canActivate(context: any) {
        const req = context.switchToHttp().getRequest();
        const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
        if (!user?.isActive) throw new UnauthorizedException();
        req.user = { ...user, role: 'ADMIN' }; // Stale elevated claim must not authorize history.
        return true;
      } }).compile();
    history = module.get(ClientNotificationHistoryAccessService);
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    tenant = `k17-history-test-${randomUUID()}`; foreign = `k17-foreign-test-${randomUUID()}`;
    for (const id of [tenant, foreign]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic history tenant' } });
    const makeClient = async (t = tenant) => (await db.client.create({ data: { tenantId: t, type: 'INDIVIDUAL', firstName: 'Synthetic', lastName: 'Client' } })).id;
    client = await makeClient(); otherClient = await makeClient(); const foreignClient = await makeClient(foreign);
    const makeCase = async (cid: string, t = tenant) => (await db.case.create({ data: { tenantId: t, clientId: cid, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } })).id;
    caseId = await makeCase(client); otherCase = await makeCase(client); foreignCase = await makeCase(foreignClient, foreign);
    admin = (await actor('none', 'ADMIN')).userId;
    await notification('expense', caseId, 'MASRAF_ISTEK'); await notification('general', caseId);
    await notification('other-case', otherCase); await notification('no-case', null);
    await notification('wrong-client', caseId, 'MASRAF_ISTEK', otherClient);
    await notification('foreign-case', foreignCase, 'MASRAF_ISTEK');
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const t of [tenant, foreign]) {
      await db.permissionGrant.deleteMany({ where: { tenantId: t } });
      await db.auditLog.deleteMany({ where: { tenantId: t } });
      await db.tenant.delete({ where: { id: t } });
    }
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  async function actor(kind: 'lawyer' | 'staff' | 'none', role: 'ADMIN' | 'USER' | 'VIEWER' = 'USER', rank: any = 'LAWYER', t = tenant) {
    const user = await db.user.create({ data: { tenantId: t, role, email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: 'Actor' } });
    const lawyer = kind === 'lawyer' ? await db.lawyer.create({ data: { tenantId: t, userId: user.id, name: 'Synthetic', surname: 'Lawyer', lawyerRank: rank } }) : null;
    const staff = kind === 'staff' ? await db.staffMember.create({ data: { tenantId: t, userId: user.id, firstName: 'Synthetic', lastName: 'Staff', staffType: 'MUHASEBE', canSeeFinance: true } }) : null;
    return { userId: user.id, lawyerId: lawyer?.id, staffId: staff?.id };
  }
  async function notification(id: string, cid: string | null, type = 'GENEL_BILGILENDIRME', clientId = client) {
    return db.clientNotification.create({ data: { id: `${tenant}:${id}`, tenantId: tenant, clientId, caseId: cid, type,
      channel: 'EMAIL', status: 'SENT', sentAt: stamp, createdAt: stamp, body: 'private body', subject: 'private subject',
      errorMessage: 'private provider error', metadata: { secret: true }, dedupeKey: 'private-dedupe', sentById: admin } });
  }
  const ids = (rows: any[]) => rows.map(r => r.id.slice(tenant.length + 1)).sort();
  const get = (who: string, kind = 'client', id = client, query = '') => http(app.getHttpServer())
    .get(`/client-notifications/${kind}/${id}${query}`).set('x-test-user-id', who);
  const grant = (subjectUserId: string, data: any = {}) => db.permissionGrant.create({ data: {
    tenantId: tenant, subjectUserId, permissionKey: KEY, scope: 'GLOBAL', effect: 'ALLOW', ...data,
  } });
  const assignLawyer = (a: Awaited<ReturnType<typeof actor>>, role: any = 'ASSIGNED', cid = caseId) => db.caseLawyer.create({ data: { caseId: cid, lawyerId: a.lawyerId!, role } });
  const assignStaff = (a: Awaited<ReturnType<typeof actor>>, role = 'MUHASEBE') => db.caseStaff.create({ data: { caseId, staffMemberId: a.staffId!, roleOnCase: role } });

  describe('O-4 response-only IBAN masking', () => {
    const raw = 'TR120001000000000000001234';
    const spaced = 'TR12 0001 0000 0000 0000 0012 34';
    const masked = 'TR12****1234';
    it.each(['client', 'case'])('%s endpoint masks every compact/spaced TR IBAN and token without changing persisted content', async kind => {
      const body = 'Payment: ' + raw + '; second: ' + spaced + '; sum 250 TRY.';
      const metadata = { tokens: { officeIban: spaced, amount: '250', note: 'keep' }, other: { keep: true } };
      const id = tenant + ':expense';
      await db.clientNotification.update({ where: { id }, data: { body, metadata, createdAt: new Date(stamp.getTime() + 1000) } });
      const before = await db.clientNotification.findUniqueOrThrow({ where: { id } });
      const result = await get(admin, kind, kind === 'case' ? caseId : client, '?limit=1').expect(200);
      expect(Array.isArray(result.body)).toBe(true);
      expect(result.body).toHaveLength(1);
      expect(result.body[0]).toMatchObject({ id, body: 'Payment: ' + masked + '; second: ' + masked + '; sum 250 TRY.',
        metadata: { ...metadata, tokens: { ...metadata.tokens, officeIban: masked } } });
      expect(result.headers['x-next-cursor']).toBeTruthy();
      expect(Object.keys(result.body[0]).sort()).toEqual([...Object.keys(before), ...(kind === 'case' ? ['client'] : [])].sort());
      expect(JSON.stringify(result.body)).not.toContain(raw);
      expect(JSON.stringify(result.body)).not.toContain(spaced);
      expect(await db.clientNotification.findUniqueOrThrow({ where: { id } })).toEqual(before);
    });
    it.each(['lawyer', 'grant'] as const)('%s content reader receives the same masked projection', async mode => {
      const a = await actor('lawyer');
      if (mode === 'lawyer') await assignLawyer(a); else await grant(a.userId);
      await db.clientNotification.update({ where: { id: tenant + ':expense' }, data: {
        body: raw, metadata: { tokens: { officeIban: raw } },
      } });
      for (const kind of ['client', 'case']) {
        const response = await get(a.userId, kind, kind === 'case' ? caseId : client).expect(200);
        expect(response.body.find((row: any) => row.id === tenant + ':expense')).toMatchObject({
          body: masked, metadata: { tokens: { officeIban: masked } },
        });
      }
    });
    it.each([
      ['lowercase', 'tr120001000000000000001234', 'tr12****1234'],
      ['non-breaking spaces', 'TR12\u00a00001\u00a00000\u00a00000\u00a00000\u00a00012\u00a034', masked],
      ['line breaks', 'TR12\n0001\n0000\n0000\n0000\n0012\n34', masked],
      ['no IBAN', 'ordinary text: 1234567890 / reference TR123', 'ordinary text: 1234567890 / reference TR123'],
      ['already masked', masked, masked],
    ])('%s body keeps the existing mask format and unrelated text', async (_name, body, expected) => {
      await db.clientNotification.update({ where: { id: tenant + ':expense' }, data: { body } });
      const response = await get(admin, 'case', caseId).expect(200);
      expect(response.body.find((row: any) => row.id === tenant + ':expense').body).toBe(expected);
    });
    it.each([{}, { tokens: null }, { tokens: [] }, { tokens: { officeIban: null, amount: 50 } },
      { tokens: { officeIban: 1234 } }, { tokens: { officeIban: '' } }])('preserves absent/non-string metadata shape %p', async metadata => {
      await db.clientNotification.update({ where: { id: tenant + ':expense' }, data: { metadata: metadata as any } });
      const response = await get(admin).expect(200);
      const item = response.body.find((row: any) => row.id === tenant + ':expense');
      expect(item.metadata).toEqual(metadata);
    });
  });

  it('production module wires the reader; ADMIN needs no personnel profile and retains full fields and case client include', async () => {
    expect(Reflect.getMetadata('providers', ClientNotificationModule)).toContain(ClientNotificationHistoryAccessService);
    const c = await get(admin).expect(200); expect(Array.isArray(c.body)).toBe(true);
    expect(ids(c.body)).toEqual(['expense', 'general', 'no-case', 'other-case']);
    expect(c.body[0]).toMatchObject({ body: 'private body', metadata: { secret: true } });
    const f = await get(admin, 'case', caseId).expect(200); expect(ids(f.body)).toEqual(['expense', 'general']);
    expect(f.body[0].client).toMatchObject({ id: client, firstName: 'Synthetic' });
  });
  it.each(['PARTNER', 'MANAGER', 'AUTHORIZED', 'LAWYER'])('%s alone grants no tenant-wide access despite stale ADMIN claim', async rank => {
    const a = await actor('lawyer', 'USER', rank);
    for (const [kind, id] of [['client', client], ['case', caseId]]) expect((await get(a.userId, kind, id).expect(200)).body).toEqual([]);
  });
  it.each(['lawyer', 'staff'] as const)('explicit GLOBAL personal grant gives %s full access including caseless records; revocation takes effect on next read', async kind => {
    const a = await actor(kind); const commands = new NotificationHistoryPermissionService(db, new AuditService(db));
    await commands.grant(tenant, admin, a.userId, {});
    expect(ids((await get(a.userId).expect(200)).body)).toEqual(['expense', 'general', 'no-case', 'other-case']);
    await commands.revoke(tenant, admin, a.userId, {});
    expect((await get(a.userId).expect(200)).body).toEqual([]);
  });
  it.each(['expired', 'future', 'deny', 'TEAM', 'DIRECT_REPORTS', 'foreign', 'wrong-key'])('%s permission cannot open history', async scenario => {
    const a = await actor('staff');
    const data: any = scenario === 'expired' ? { validUntil: new Date('2000-01-01') }
      : scenario === 'future' ? { validFrom: new Date('2100-01-01') }
      : ['TEAM', 'DIRECT_REPORTS'].includes(scenario) ? { scope: scenario }
      : scenario === 'foreign' ? { tenantId: foreign }
      : scenario === 'wrong-key' ? { permissionKey: 'bank.settlement.verify' } : {};
    await grant(a.userId, data); if (scenario === 'deny') await grant(a.userId, { effect: 'DENY' });
    expect((await get(a.userId).expect(200)).body).toEqual([]);
  });
  it.each(['none', 'lawyer', 'staff'] as const)('VIEWER with %s profile remains denied even with explicit permission and assignment', async kind => {
    const a = await actor(kind, 'VIEWER'); await grant(a.userId);
    if (a.lawyerId) await assignLawyer(a); if (a.staffId) await assignStaff(a);
    expect((await get(a.userId).expect(200)).body).toEqual([]);
    expect((await get(a.userId, 'case', caseId).expect(200)).body).toEqual([]);
  });
  it('permission does not survive inactive profile/account or tenant change; reads create no grant/audit/history rows', async () => {
    const a = await actor('staff'); await grant(a.userId);
    const before = { notifications: await db.clientNotification.count(), grants: await db.permissionGrant.count(), audits: await db.auditLog.count() };
    expect((await get(a.userId).expect(200)).body).toHaveLength(4);
    await db.staffMember.update({ where: { id: a.staffId }, data: { isActive: false } });
    expect((await get(a.userId).expect(200)).body).toEqual([]);
    await db.staffMember.update({ where: { id: a.staffId }, data: { isActive: true } });
    await db.user.update({ where: { id: a.userId }, data: { isActive: false } });
    expect((await history.read(tenant, a.userId, { kind: 'client', id: client })).items).toEqual([]);
    await db.user.update({ where: { id: a.userId }, data: { isActive: true, tenantId: foreign } });
    expect((await history.read(tenant, a.userId, { kind: 'client', id: client })).items).toEqual([]);
    expect((await get(a.userId).expect(200)).body).toEqual([]);
    expect({ notifications: await db.clientNotification.count(), grants: await db.permissionGrant.count(), audits: await db.auditLog.count() }).toEqual(before);
  });
  it.each(['RESPONSIBLE', 'ASSIGNED', 'ASSISTANT', 'INTERN'])('case-lawyer role %s follows the current canonical assignment allowlist', async role => {
    const a = await actor('lawyer'); await assignLawyer(a, role);
    const expected = ['RESPONSIBLE', 'ASSIGNED'].includes(role) ? ['expense', 'general'] : [];
    expect(ids((await get(a.userId).expect(200)).body)).toEqual(expected);
    expect(ids((await get(a.userId, 'case', caseId).expect(200)).body)).toEqual(expected);
  });
  it.each(['lawyer', 'staff'] as const)('removing %s assignment or deactivating profile/user removes access without deleting history', async kind => {
    const a = await actor(kind); const assignment = kind === 'lawyer' ? await assignLawyer(a) : await assignStaff(a);
    const expected = kind === 'lawyer' ? ['expense', 'general'] : ['expense'];
    expect(ids((await get(a.userId).expect(200)).body)).toEqual(expected);
    if (kind === 'lawyer') await db.lawyer.update({ where: { id: a.lawyerId }, data: { isActive: false } });
    else await db.staffMember.update({ where: { id: a.staffId }, data: { isActive: false } });
    expect((await get(a.userId).expect(200)).body).toEqual([]);
    if (kind === 'lawyer') { await db.lawyer.update({ where: { id: a.lawyerId }, data: { isActive: true } }); await db.caseLawyer.delete({ where: { id: assignment.id } }); }
    else { await db.staffMember.update({ where: { id: a.staffId }, data: { isActive: true } }); await db.caseStaff.delete({ where: { id: assignment.id } }); }
    expect((await get(a.userId).expect(200)).body).toEqual([]);
    await db.user.update({ where: { id: a.userId }, data: { isActive: false } });
    expect((await history.read(tenant, a.userId, { kind: 'client', id: client })).items).toEqual([]);
    expect(await db.clientNotification.count({ where: { tenantId: tenant } })).toBe(6);
  });
  it.each(['muhasebe', 'Muhasebe', ' MUHASEBE', 'MUHASEBE ', 'MUHASEBECI', 'MALI_MUHASEBE', 'SEKRETER'])('non-exact accounting role %j and finance flag cannot authorize history', async role => {
    const a = await actor('staff'); await assignStaff(a, role);
    expect((await get(a.userId).expect(200)).body).toEqual([]);
  });
  it('accounting selects status/time only in SQL-backed projection, including case endpoint; excludes caseless expenses', async () => {
    const a = await actor('staff'); await assignStaff(a); await notification('caseless-expense', null, 'MASRAF_ISTEK');
    for (const [kind, id] of [['client', client], ['case', caseId]]) {
      const r = await get(a.userId, kind, id).expect(200); expect(ids(r.body)).toEqual(['expense']);
      expect(Object.keys(r.body[0]).sort()).toEqual(statuses);
    }
  });
  it.each(['INTERN_RANK', 'INTERN_ROLE', 'AMBIGUOUS_PROFILE', 'FOREIGN_PROFILE', 'NO_PROFILE'])('%s fails closed', async scenario => {
    const a = await actor(scenario === 'NO_PROFILE' ? 'none' : 'lawyer', 'USER', scenario === 'INTERN_RANK' ? 'INTERN' : 'LAWYER');
    if (a.lawyerId) await assignLawyer(a);
    if (scenario === 'INTERN_ROLE') await db.lawyer.update({ where: { id: a.lawyerId }, data: { role: 'INTERN' } });
    if (scenario === 'FOREIGN_PROFILE') await db.lawyer.update({ where: { id: a.lawyerId }, data: { tenantId: foreign } });
    if (scenario === 'AMBIGUOUS_PROFILE') await db.staffMember.create({ data: { tenantId: tenant, userId: a.userId, firstName: 'Duplicate', lastName: 'Profile', staffType: 'MUHASEBE' } });
    if (!scenario.startsWith('INTERN')) await grant(a.userId);
    expect((await get(a.userId).expect(200)).body).toEqual([]);
  });
  it('foreign actor, wrong tenant context, unknown and foreign objects give the same empty list and no cursor', async () => {
    const a = await actor('staff'); const outsider = await actor('none', 'ADMIN', 'LAWYER', foreign);
    for (const [who, kind, id] of [[a.userId, 'client', client], [a.userId, 'case', caseId], [admin, 'case', 'missing'], [admin, 'case', foreignCase], [outsider.userId, 'client', client]]) {
      const r = await get(who, kind, id).expect(200); expect(r.body).toEqual([]); expect(r.headers['x-next-cursor']).toBeUndefined();
    }
    expect((await history.read(foreign, admin, { kind: 'client', id: client })).items).toEqual([]);
  });
  it('secondary CaseClient relationship is valid; wrong-client and dangling/cross-tenant case references remain hidden', async () => {
    await db.caseClient.create({ data: { caseId, clientId: otherClient } });
    expect(ids((await get(admin, 'client', otherClient).expect(200)).body)).toEqual(['wrong-client']);
    await notification('dangling', 'missing');
    expect(ids((await get(admin).expect(200)).body)).toEqual(['expense', 'general', 'no-case', 'other-case']);
  });
  it('51+ equal timestamps use descending id, preserve array body, expose X-Next-Cursor, exhaust without duplicate/loss', async () => {
    await db.clientNotification.deleteMany({ where: { tenantId: tenant } });
    for (let i = 0; i < 55; i++) await notification(`page-${String(i).padStart(3, '0')}`, caseId);
    const first = await get(admin).expect(200); expect(first.body).toHaveLength(50);
    expect(first.headers['access-control-expose-headers']).toBe('X-Next-Cursor');
    const token = first.headers['x-next-cursor']; expect(token).toEqual(expect.any(String));
    const second = await get(admin, 'client', client, `?cursor=${token}`).expect(200); expect(second.body).toHaveLength(5);
    expect(second.headers['x-next-cursor']).toBeUndefined();
    const actual = [...first.body, ...second.body].map(x => x.id);
    expect(actual).toEqual([...actual].sort().reverse()); expect(new Set(actual).size).toBe(55);
    await get(admin, 'case', caseId, `?cursor=${token}`).expect(400);
    const casePage = await get(admin, 'case', caseId, '?limit=2').expect(200); expect(casePage.body).toHaveLength(2);
    expect(casePage.headers['x-next-cursor']).toEqual(expect.any(String));
  });
  it('inaccessible records do not consume page size or create a continuation signal', async () => {
    const a = await actor('lawyer'); await assignLawyer(a);
    for (let i = 0; i < 55; i++) await notification(`hidden-${i}`, otherCase);
    const first = await get(a.userId, 'client', client, '?limit=1').expect(200);
    const next = await get(a.userId, 'client', client, `?limit=1&cursor=${first.headers['x-next-cursor']}`).expect(200);
    expect(ids([...first.body, ...next.body])).toEqual(['expense', 'general']); expect(next.headers['x-next-cursor']).toBeUndefined();
  });
  it.each(['?limit=0', '?limit=51', '?limit=1.5', '?limit=1&limit=2', '?cursor=invalid', '?cursor=x&cursor=y'])('invalid/repeated query %s is rejected at runtime', async query => {
    await get(admin, 'client', client, query).expect(400);
  });
});
