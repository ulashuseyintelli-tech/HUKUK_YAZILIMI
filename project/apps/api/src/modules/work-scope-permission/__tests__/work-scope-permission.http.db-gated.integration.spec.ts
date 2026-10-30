/**
 * F02-B-1 (owner kararı 2026-10-29/30) — görev / masraf "büro geneli görünüm" izinleri: gerçek HTTP + PostgreSQL.
 *
 * Kabul:
 *  1. GÜNCEL DB rolü ADMIN grant verir (ALLOW) → GET durum ALLOW; satır GLOBAL; audit CREATE PERMISSION_GRANT.
 *  2. Aynı anahtara DENY atanırsa eski ALLOW süresi geçer, çözümleme DENY (DENY > ALLOW).
 *  3. revoke → anahtarın bütün etkin grant'leri süresi geçer (silme YOK) → NONE (varsayılan kapsam).
 *  4. USER → 403 WORK_SCOPE_ADMIN_REQUIRED (GET ve POST); VIEWER → POST 403 VIEWER_WRITE_DENIED (guard; servis çağrılmaz), GET 403.
 *  5. Hesapsız kişi kartı → GET linked:false, POST 409 WORK_SCOPE_PERSON_NOT_LINKED; yabancı kiracı kartı → 404; hiçbir satır yazılmaz.
 *  6. Bu uçlar hiçbir listeyi genişletmez — yalnız grant kaydı (kapsam etkinleştirmesi ayrı dilim). Müvekkil kapsamı (K16) etkilenmez.
 * Değerler sentetiktir.
 */
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as http from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkScopePermissionController } from '../work-scope-permission.controller';
import { WorkScopePermissionService } from '../work-scope-permission.service';
import { WorkScopeViewController } from '../work-scope-view.controller';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('F02-B-1 work-scope permission acceptance requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('F02-B-1 — /office/view-all-permissions (gerçek HTTP + PostgreSQL)', () => {
  jest.setTimeout(90_000);
  let db: PrismaService;
  let app: INestApplication;
  let service: WorkScopePermissionService;
  let tenant: string; let foreign: string;
  let admin: string; let member: string; let viewer: string; let subjectUser: string;
  let linkedLawyer: string; let unlinkedLawyer: string; let foreignLawyer: string; let linkedStaff: string;

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } });
    await db.$connect();
    const module = await Test.createTestingModule({
      controllers: [WorkScopePermissionController, WorkScopeViewController],
      providers: [
        { provide: PrismaService, useValue: db },
        { provide: AuditService, useFactory: () => new AuditService(db) },
        WorkScopePermissionService,
      ],
    }).overrideGuard(JwtAuthGuard).useValue({
      async canActivate(context: any) {
        const req = context.switchToHttp().getRequest();
        const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
        if (!user) throw new UnauthorizedException();
        req.user = user; // rol DB satırından (token iddiası değil)
        return true;
      },
    }).compile();
    service = module.get(WorkScopePermissionService);
    app = module.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(async () => {
    tenant = `wsp-test-${randomUUID()}`; foreign = `wsp-foreign-test-${randomUUID()}`;
    for (const id of [tenant, foreign]) await db.tenant.create({ data: { id, slug: id, name: 'Sentetik izin kiracısı' } });
    const mk = async (role: 'ADMIN' | 'USER' | 'VIEWER', t = tenant) =>
      (await db.user.create({ data: { tenantId: t, role, email: `${randomUUID()}@example.test`, name: 'Sentetik', surname: role } })).id;
    admin = await mk('ADMIN'); member = await mk('USER'); viewer = await mk('VIEWER'); subjectUser = await mk('USER');
    linkedLawyer = (await db.lawyer.create({ data: { tenantId: tenant, userId: subjectUser, name: 'Bağlı', surname: 'Avukat', lawyerRank: 'LAWYER' } })).id;
    unlinkedLawyer = (await db.lawyer.create({ data: { tenantId: tenant, name: 'Hesapsız', surname: 'Avukat', lawyerRank: 'LAWYER' } })).id;
    const foreignUser = await mk('USER', foreign);
    foreignLawyer = (await db.lawyer.create({ data: { tenantId: foreign, userId: foreignUser, name: 'Yabancı', surname: 'Avukat', lawyerRank: 'LAWYER' } })).id;
    linkedStaff = (await db.staffMember.create({ data: { tenantId: tenant, userId: subjectUser, firstName: 'Bağlı', lastName: 'Personel', staffType: 'SEKRETER' } })).id;
  });
  afterEach(async () => { for (const id of [tenant, foreign]) await db.tenant.delete({ where: { id } }); });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });
  // F02-B görünürlük: bayraklar yalnız bu izole süreçte, test içinde açılır; her testten sonra geri alınır.
  const FLAGS = ['OFFICE_EXPENSE_VIEW_SCOPE_ENABLED', 'OFFICE_TASK_VIEW_SCOPE_ENABLED'] as const;
  const savedFlags: Record<string, string | undefined> = Object.fromEntries(FLAGS.map((k) => [k, process.env[k]]));
  afterEach(() => { for (const k of FLAGS) { if (savedFlags[k] === undefined) delete process.env[k]; else process.env[k] = savedFlags[k]; } });

  const get = (uid: string, personType: string, personId: string) =>
    http(app.getHttpServer()).get(`/office/view-all-permissions?personType=${personType}&personId=${personId}`).set('x-test-user-id', uid);
  const post = (uid: string, path: string, body: Record<string, unknown>) =>
    http(app.getHttpServer()).post(`/office/view-all-permissions${path}`).set('x-test-user-id', uid).send(body);
  const grants = () => db.permissionGrant.findMany({ where: { tenantId: tenant }, orderBy: { createdAt: 'asc' } });
  const TASKS = 'office.tasks.view_all'; const EXP = 'office.expenses.view_all';

  it('KABUL-1/2/3: ADMIN ALLOW → DENY (eski süresi geçer; DENY > ALLOW) → revoke (hepsi süresi geçer, silme yok) — GET ve resolve() tutarlı', async () => {
    const r1 = await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: TASKS, effect: 'ALLOW', reason: 'büro geneli' }).expect(201);
    expect(r1.body).toMatchObject({ key: TASKS, effect: 'ALLOW', supersededCount: 0, subjectUserId: subjectUser });
    let rows = await grants();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subjectUserId: subjectUser, permissionKey: TASKS, effect: 'ALLOW', scope: 'GLOBAL', grantedByUserId: admin, validUntil: null });
    expect(await db.auditLog.count({ where: { tenantId: tenant, entityType: 'PERMISSION_GRANT', action: 'CREATE', userId: admin } })).toBe(1);
    let state = (await get(admin, 'lawyer', linkedLawyer).expect(200)).body;
    expect(state).toMatchObject({ linked: true });
    expect(state.permissions).toEqual([{ key: TASKS, effect: 'ALLOW', validUntil: null }, { key: EXP, effect: 'NONE', validUntil: null }]);
    expect(await service.resolve(db, tenant, subjectUser, TASKS)).toBe('ALLOW');
    expect(await service.resolve(db, tenant, subjectUser, EXP)).toBe('NONE');

    const r2 = await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: TASKS, effect: 'DENY' }).expect(201);
    expect(r2.body).toMatchObject({ effect: 'DENY', supersededCount: 1 });
    rows = await grants();
    expect(rows).toHaveLength(2);
    expect(rows[0].validUntil).not.toBeNull(); // eski ALLOW süresi geçti
    expect(rows[1]).toMatchObject({ effect: 'DENY', validUntil: null });
    expect(await service.resolve(db, tenant, subjectUser, TASKS)).toBe('DENY');
    state = (await get(admin, 'lawyer', linkedLawyer).expect(200)).body;
    expect(state.permissions[0]).toEqual({ key: TASKS, effect: 'DENY', validUntil: null });

    const r3 = await post(admin, '/revoke', { personType: 'lawyer', personId: linkedLawyer, key: TASKS, reason: 'varsayılana dön' }).expect(201);
    expect(r3.body).toMatchObject({ key: TASKS, revoked: 1 });
    rows = await grants();
    expect(rows).toHaveLength(2); // silme YOK
    expect(rows.every((r) => r.validUntil !== null && r.validUntil <= new Date())).toBe(true);
    expect(await service.resolve(db, tenant, subjectUser, TASKS)).toBe('NONE');
    expect((await get(admin, 'lawyer', linkedLawyer).expect(200)).body.permissions[0].effect).toBe('NONE');
  });

  it('ayrı anahtarlar bağımsız: masraf ALLOW görevleri etkilemez; personel kartı da aynı hesabı çözer', async () => {
    await post(admin, '', { personType: 'staff', personId: linkedStaff, key: EXP, effect: 'ALLOW' }).expect(201);
    const state = (await get(admin, 'lawyer', linkedLawyer).expect(200)).body; // aynı subjectUser
    expect(state.permissions).toEqual([{ key: TASKS, effect: 'NONE', validUntil: null }, { key: EXP, effect: 'ALLOW', validUntil: null }]);
    expect(await service.resolve(db, tenant, subjectUser, TASKS)).toBe('NONE');
  });

  it('KABUL-4: USER GET/POST → 403 WORK_SCOPE_ADMIN_REQUIRED; VIEWER POST → 403 VIEWER_WRITE_DENIED (guard), GET → 403; satır yok', async () => {
    const u1 = await post(member, '', { personType: 'lawyer', personId: linkedLawyer, key: TASKS, effect: 'ALLOW' }).expect(403);
    expect(u1.body.code).toBe('WORK_SCOPE_ADMIN_REQUIRED');
    await get(member, 'lawyer', linkedLawyer).expect(403);
    const v1 = await post(viewer, '', { personType: 'lawyer', personId: linkedLawyer, key: TASKS, effect: 'ALLOW' }).expect(403);
    expect(v1.body.code).toBe('VIEWER_WRITE_DENIED');
    await get(viewer, 'lawyer', linkedLawyer).expect(403);
    expect(await grants()).toHaveLength(0);
    expect(await db.auditLog.count({ where: { tenantId: tenant, entityType: 'PERMISSION_GRANT' } })).toBe(0);
  });

  it('KABUL-5: hesapsız kart → GET linked:false + NONE, POST 409 WORK_SCOPE_PERSON_NOT_LINKED; yabancı kiracı kartı → 404; satır yok', async () => {
    const s = (await get(admin, 'lawyer', unlinkedLawyer).expect(200)).body;
    expect(s.linked).toBe(false);
    expect(s.permissions.map((p: { effect: string }) => p.effect)).toEqual(['NONE', 'NONE']);
    const c = await post(admin, '', { personType: 'lawyer', personId: unlinkedLawyer, key: TASKS, effect: 'ALLOW' }).expect(409);
    expect(c.body.code).toBe('WORK_SCOPE_PERSON_NOT_LINKED');
    await post(admin, '', { personType: 'lawyer', personId: foreignLawyer, key: TASKS, effect: 'ALLOW' }).expect(404);
    await get(admin, 'lawyer', foreignLawyer).expect(404);
    expect(await grants()).toHaveLength(0);
    expect(await db.permissionGrant.count({ where: { tenantId: foreign } })).toBe(0);
  });

  it('girdi sözleşmesi: bilinmeyen anahtar / etki / alan → 400; geçmiş validUntil → 400; süreli ALLOW kabul edilir ve GET bitişi gösterir', async () => {
    await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: 'office.clients.view_all', effect: 'ALLOW' }).expect(400);
    await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: TASKS, effect: 'MAYBE' }).expect(400);
    await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: TASKS, effect: 'ALLOW', scope: 'TEAM' }).expect(400);
    await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: TASKS, effect: 'ALLOW', validUntil: '2020-01-01T00:00:00Z' }).expect(400);
    expect(await grants()).toHaveLength(0);
    const until = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
    await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: EXP, effect: 'ALLOW', validUntil: until }).expect(201);
    const state = (await get(admin, 'lawyer', linkedLawyer).expect(200)).body;
    expect(state.permissions[1]).toMatchObject({ key: EXP, effect: 'ALLOW' });
    expect(new Date(state.permissions[1].validUntil).getTime()).toBe(new Date(until).getTime());
  });

  it('K16 müvekkil kapsamı ETKİLENMEZ: view_all ALLOW verilen hesap başka dosyanın müvekkilini göremez (izin müvekkil okuma yetkisi değildir)', async () => {
    await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: TASKS, effect: 'ALLOW' }).expect(201);
    await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: EXP, effect: 'ALLOW' }).expect(201);
    // Sentetik müvekkil + dosya: subjectUser hiçbir dosyada görevli değil → K16 kapsamı BOŞ olmalı.
    const client = await db.client.create({ data: { tenantId: tenant, type: 'INDIVIDUAL', name: 'K16 Müvekkil' } });
    const kase = await db.case.create({ data: { tenantId: tenant, clientId: client.id, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } });
    await db.caseClient.create({ data: { caseId: kase.id, clientId: client.id } });
    const inScope = await db.client.findFirst({ where: { id: client.id, tenantId: tenant, caseClients: { some: { case: { tenantId: tenant, OR: [
      { lawyers: { some: { lawyer: { tenantId: tenant, isActive: true, user: { id: subjectUser, tenantId: tenant, isActive: true, role: { in: ['USER', 'ADMIN'] } } } } } },
      { staff: { some: { canView: true, staffMember: { tenantId: tenant, isActive: true, user: { id: subjectUser, tenantId: tenant, isActive: true, role: { in: ['USER', 'ADMIN'] } } } } } },
    ] } } } }, select: { id: true } });
    expect(inScope).toBeNull();
  });

  it('F02-B görünürlük (madde 4): GET /office/view-scope — bayrak kapalı → OFF (izin olsa da; resolution görünür); açık → NONE/DENY → BOUND, ALLOW → TENANT; anahtarlar bağımsız; USER ve VIEWER kendi kapsamını okur', async () => {
    const scopeOf = (uid: string) => http(app.getHttpServer()).get('/office/view-scope').set('x-test-user-id', uid);
    delete process.env.OFFICE_EXPENSE_VIEW_SCOPE_ENABLED; delete process.env.OFFICE_TASK_VIEW_SCOPE_ENABLED;
    let r = await scopeOf(subjectUser);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ expenses: { flagEnabled: false, resolution: 'NONE', mode: 'OFF' }, tasks: { flagEnabled: false, resolution: 'NONE', mode: 'OFF' } });
    // Grant hazırlığı (G3 adım 1): bayrak KAPALIYKEN ALLOW verilir → mode OFF kalır, resolution ALLOW görünür (hazırlık doğrulanabilir)
    expect([200, 201]).toContain((await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: 'office.expenses.view_all', effect: 'ALLOW' })).status);
    r = await scopeOf(subjectUser);
    expect(r.body.expenses).toEqual({ flagEnabled: false, resolution: 'ALLOW', mode: 'OFF' });
    expect(r.body.tasks).toEqual({ flagEnabled: false, resolution: 'NONE', mode: 'OFF' });
    // Bayraklar açılır (yalnız bu süreçte): masraf ALLOW → TENANT; görev izinsiz → BOUND (anahtarlar bağımsız)
    process.env.OFFICE_EXPENSE_VIEW_SCOPE_ENABLED = 'true'; process.env.OFFICE_TASK_VIEW_SCOPE_ENABLED = 'true';
    r = await scopeOf(subjectUser);
    expect(r.body.expenses).toEqual({ flagEnabled: true, resolution: 'ALLOW', mode: 'TENANT' });
    expect(r.body.tasks).toEqual({ flagEnabled: true, resolution: 'NONE', mode: 'BOUND' });
    // DENY > ALLOW → BOUND
    expect([200, 201]).toContain((await post(admin, '', { personType: 'lawyer', personId: linkedLawyer, key: 'office.expenses.view_all', effect: 'DENY' })).status);
    r = await scopeOf(subjectUser);
    expect(r.body.expenses).toEqual({ flagEnabled: true, resolution: 'DENY', mode: 'BOUND' });
    // revoke → NONE → BOUND
    expect([200, 201]).toContain((await post(admin, '/revoke', { personType: 'lawyer', personId: linkedLawyer, key: 'office.expenses.view_all' })).status);
    r = await scopeOf(subjectUser);
    expect(r.body.expenses).toEqual({ flagEnabled: true, resolution: 'NONE', mode: 'BOUND' });
    // Her rol KENDİ kapsamını okur (salt okuma; 403 yok); yanıt kişisel veri / grant kimliği taşımaz
    const v = await scopeOf(viewer); expect(v.status).toBe(200); expect(v.body.tasks.mode).toBe('BOUND');
    const m = await scopeOf(member); expect(m.status).toBe(200); expect(Object.keys(m.body).sort()).toEqual(['expenses', 'tasks']);
  });
});
