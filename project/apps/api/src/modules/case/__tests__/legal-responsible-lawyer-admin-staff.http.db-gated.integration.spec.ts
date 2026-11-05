jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('Renderer is outside AK-1c acceptance'); } }));
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuditService } from '../../audit/audit.service';
import { PermissionHardGuardService } from '../../permission-diagnostics/permission-hard-guard.service';
import { GuidedOpenObserveService } from '../../permission-diagnostics/guided-open-observe.service';
import { WarnOnlyAuditService } from '../../permission-diagnostics/warn-only-audit.service';
import { OcrService } from '../../ocr/ocr.service';
import { CaseController } from '../case.controller';
import { CaseService } from '../case.service';
import { ResponsibleCandidatesService } from '../responsible-candidates.service';
import { TemporalResponsibilityService } from '../temporal-responsibility.service';
import { ResponsibilityHistoryService } from '../responsibility-history.service';
import { LegalResponsibleLawyerService } from '../legal-responsible-lawyer.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('AK-1c HTTP/DB acceptance requires TEST_DATABASE_URL; SKIP is not acceptance');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('AK-1c legal responsible change — real HTTP and disposable PostgreSQL', () => {
  jest.setTimeout(30_000);
  let db: PrismaService; let app: INestApplication; let service: LegalResponsibleLawyerService;
  let hardGuard: PermissionHardGuardService;
  let tenant: string; let foreign: string; let caseId: string; let nextLawyer: string;
  let admin: string; let staffAdmin: string; let inactiveStaffAdmin: string; let dualAdmin: string;
  let viewer: string; let user: string; let partner: string; let manager: string; let delegate: string;
  let inactiveAdmin: string; let foreignAdmin: string;
  const dto = () => ({ lawyerId: nextLawyer, reason: 'Synthetic authorized legal-responsibility correction' });

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } }); await db.$connect();
    hardGuard = new PermissionHardGuardService(new AuditService(db));
    service = new LegalResponsibleLawyerService(db, hardGuard);
    const identity = { async canActivate(ctx: any) {
      const req = ctx.switchToHttp().getRequest();
      const actor = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
      if (!actor) throw new UnauthorizedException();
      req.user = actor; return true; // Identity seam only; DB actor/staff policy and ViewerWriteDenyGuard are real.
    } };
    const module = await Test.createTestingModule({ controllers: [CaseController], providers: [
      { provide: LegalResponsibleLawyerService, useValue: service },
      { provide: PermissionHardGuardService, useValue: hardGuard },
      { provide: GuidedOpenObserveService, useValue: { observe: async () => undefined } },
      ...[CaseService, OcrService, ResponsibleCandidatesService, TemporalResponsibilityService,
        ResponsibilityHistoryService, WarnOnlyAuditService].map(provide => ({ provide, useValue: {} })),
    ] }).overrideGuard(JwtAuthGuard).useValue(identity).compile();
    app = module.createNestApplication(); app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init(); await app.listen(0, '127.0.0.1');
  });

  async function actor(role: 'ADMIN' | 'USER' | 'VIEWER', t = tenant, active = true) {
    return (await db.user.create({ data: { tenantId: t, role, isActive: active,
      email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: 'AK1c' } })).id;
  }
  async function staff(id: string, active = true) {
    return db.staffMember.create({ data: { tenantId: tenant, userId: id, firstName: 'Synthetic',
      lastName: 'Staff', staffType: 'SEKRETER', isActive: active } });
  }
  async function lawyer(id?: string, rank: 'PARTNER' | 'MANAGER' | 'LAWYER' = 'LAWYER', delegated = false) {
    return db.lawyer.create({ data: { tenantId: tenant, userId: id, name: 'Synthetic', surname: 'Lawyer',
      lawyerRank: rank, canApproveOfficeActions: delegated } });
  }
  beforeEach(async () => {
    tenant = `ak1c-test-${randomUUID()}`; foreign = `ak1c-foreign-test-${randomUUID()}`;
    for (const id of [tenant, foreign]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic AK1c test' } });
    admin = await actor('ADMIN'); staffAdmin = await actor('ADMIN'); await staff(staffAdmin);
    inactiveStaffAdmin = await actor('ADMIN'); await staff(inactiveStaffAdmin, false);
    dualAdmin = await actor('ADMIN'); await staff(dualAdmin); await lawyer(dualAdmin, 'PARTNER', true);
    viewer = await actor('VIEWER'); await lawyer(viewer, 'PARTNER', true);
    user = await actor('USER'); partner = await actor('USER'); await lawyer(partner, 'PARTNER');
    manager = await actor('USER'); await lawyer(manager, 'MANAGER');
    delegate = await actor('USER'); await lawyer(delegate, 'LAWYER', true);
    inactiveAdmin = await actor('ADMIN', tenant, false); foreignAdmin = await actor('ADMIN', foreign);
    const current = await lawyer(); const next = await lawyer(); nextLawyer = next.id;
    caseId = (await db.case.create({ data: { tenantId: tenant, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } })).id;
    await db.caseLawyer.createMany({ data: [
      { caseId, lawyerId: current.id, isResponsible: true, role: 'RESPONSIBLE' },
      { caseId, lawyerId: next.id, isResponsible: false, role: 'ASSIGNED' },
    ] });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (!tenant) return;
    const ids = [tenant, foreign];
    await db.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await db.caseLawyer.deleteMany({ where: { case: { tenantId: { in: ids } } } });
    await db.case.deleteMany({ where: { tenantId: { in: ids } } });
    await db.staffMember.deleteMany({ where: { tenantId: { in: ids } } });
    await db.lawyer.deleteMany({ where: { tenantId: { in: ids } } });
    await db.user.deleteMany({ where: { tenantId: { in: ids } } });
    await db.tenant.deleteMany({ where: { id: { in: ids } } });
  });
  afterAll(async () => { if (app) await app.close(); if (db) await db.$disconnect(); });

  const patch = (id: string, body = dto()) => request(app.getHttpServer())
    .patch(`/cases/${caseId}/legal-responsible-lawyer`).set('x-test-user-id', id).send(body);
  async function snapshot() {
    return { case: await db.case.findUnique({ where: { id: caseId } }),
      team: await db.caseLawyer.findMany({ where: { caseId }, orderBy: { id: 'asc' } }),
      successAudit: await db.auditLog.findMany({ where: { tenantId: tenant, action: 'UPDATE', entityType: 'CASE_LAWYER' } }) };
  }
  async function denied(id: string, status = 403, body = dto()) {
    const before = await snapshot(); await patch(id, body).expect(status); expect(await snapshot()).toEqual(before);
  }

  it.each(['staffAdmin', 'inactiveStaffAdmin', 'dualAdmin'])('rejects %s before the ADMIN bridge with no state/success audit', async name => {
    const bridge = jest.spyOn(hardGuard, 'assertBridgeAdmin');
    await denied({ staffAdmin, inactiveStaffAdmin, dualAdmin }[name]!);
    expect(bridge).not.toHaveBeenCalled();
    expect(await db.auditLog.count({ where: { tenantId: tenant, action: 'PERMISSION_DENIED' } })).toBe(1);
  });
  it.each(['user', 'partner', 'manager', 'delegate', 'viewer', 'inactiveAdmin'])('preserves denial for %s', async name => {
    await denied({ user, partner, manager, delegate, viewer, inactiveAdmin }[name]!);
  });
  it('preserves non-staff ADMIN success, exact-one responsible and the single atomic audit', async () => {
    const before = await db.case.findUnique({ where: { id: caseId } });
    const out = await patch(admin).expect(200);
    expect(out.body.data.newLawyerId).toBe(nextLawyer);
    const team = await db.caseLawyer.findMany({ where: { caseId } });
    expect(team.filter(x => x.isResponsible)).toHaveLength(1);
    expect(team.every(x => x.isResponsible === (x.role === 'RESPONSIBLE'))).toBe(true);
    expect(team.find(x => x.isResponsible)?.lawyerId).toBe(nextLawyer);
    expect(await db.case.findUnique({ where: { id: caseId } })).toEqual(before);
    const audit = await db.auditLog.findMany({ where: { tenantId: tenant, action: 'UPDATE', entityType: 'CASE_LAWYER' } });
    expect(audit).toHaveLength(1); expect(audit[0].userId).toBe(admin);
    expect(audit[0].metadata).toMatchObject({ caseId, changeType: 'LEGAL_RESPONSIBLE_LAWYER_CHANGED', reason: dto().reason });
  });
  it('preserves the unrelated cases.delete ADMIN bridge even for a staff-linked ADMIN', async () => {
    await expect(hardGuard.assertBridgeAdmin('cases.delete', { tenantId: tenant, actorUserId: staffAdmin,
      role: 'ADMIN', entityId: caseId, requestPath: '/unused-in-test' })).resolves.toBeUndefined();
  });
  it('denies a foreign-tenant case and a direct service tenant mismatch', async () => {
    await denied(foreignAdmin, 404);
    const before = await snapshot();
    await expect(service.changeLegalResponsibleLawyer(tenant, caseId, dto(), foreignAdmin, 'ADMIN')).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
  });
  it('denies a forged ADMIN role, missing actor and invalid actor scalar without effects', async () => {
    const before = await snapshot();
    for (const id of [user, `missing-${randomUUID()}`, undefined, { not: '' }]) {
      await expect(service.changeLegalResponsibleLawyer(tenant, caseId, dto(), id as any, 'ADMIN')).rejects.toMatchObject({ status: 403 });
    }
    expect(await snapshot()).toEqual(before);
  });
  it('keeps reason validation, target membership and already-current conflicts', async () => {
    await denied(admin, 400, { ...dto(), reason: '   ' });
    const unassigned = await lawyer(); await denied(admin, 404, { ...dto(), lawyerId: unassigned.id });
    const current = await db.caseLawyer.findFirstOrThrow({ where: { caseId, isResponsible: true } });
    await denied(admin, 409, { ...dto(), lawyerId: current.lawyerId });
  });
  it('rolls back both CaseLawyer writes when the success audit fails', async () => {
    const before = await snapshot(); const transact = db.$transaction.bind(db);
    jest.spyOn(db, '$transaction').mockImplementation(((callback: any) => transact(async (tx: any) => {
      const audit = new Proxy(tx.auditLog, { get(target, key) { if (key === 'create') return async () => { throw new Error('AK1c audit fault'); }; return Reflect.get(target, key); } });
      return callback(new Proxy(tx, { get(target, key) { return key === 'auditLog' ? audit : Reflect.get(target, key); } }));
    })) as any);
    await patch(admin).expect(500); expect(await snapshot()).toEqual(before);
  });
  it('denies a real staff link committed between preflight and the write transaction', async () => {
    const before = await snapshot(); const transact = db.$transaction.bind(db); let armed = true;
    jest.spyOn(db, '$transaction').mockImplementation((async (callback: any) => {
      if (armed) { armed = false; await staff(admin); }
      return transact(callback);
    }) as any);
    await patch(admin).expect(403); expect(await snapshot()).toEqual(before);
    expect(await db.staffMember.count({ where: { userId: admin } })).toBe(1);
  });
  it('orders a concurrent staff FK insertion behind the actual User UPDATE lock', async () => {
    const before = await snapshot(); const transact = db.$transaction.bind(db);
    let signal!: () => void; let resume!: () => void; let armed = true;
    const locked = new Promise<void>(r => { signal = r; });
    const release = new Promise<void>(r => { resume = r; });
    jest.spyOn(db, '$transaction').mockImplementation(((callback: any) => transact(async (tx: any) => callback(new Proxy(tx, {
      get(target, key) {
        if (key !== '$queryRaw') return Reflect.get(target, key);
        return async (...args: any[]) => {
          const result = await tx.$queryRaw(...args);
          if (armed) { armed = false; signal(); await release; }
          return result;
        };
      },
    })), { timeout: 10_000 })) as any);
    const pending = patch(admin).then(x => x);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([locked, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Actor lock gate not reached')), 5000); })]);
      await expect(transact(async (tx: any) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '150ms'");
        await tx.staffMember.create({ data: { tenantId: tenant, userId: admin, firstName: 'Synthetic', lastName: 'Concurrent', staffType: 'SEKRETER' } });
      })).rejects.toThrow(/lock timeout/i);
      expect((await snapshot()).team).toEqual(before.team);
    } finally { if (deadline) clearTimeout(deadline); resume(); }
    expect((await pending).status).toBe(200);
    expect(await db.staffMember.count({ where: { userId: admin } })).toBe(0);
    await staff(admin); // After mutation commit the same FK is available; no permanent lock or new profile policy.
    expect(await db.staffMember.count({ where: { userId: admin } })).toBe(1);
  });
});
