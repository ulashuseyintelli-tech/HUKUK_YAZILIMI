import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request = require('supertest');
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ClientIntelStatementService } from '../client-intel-statement.service';
import { ClientIntelStatementController } from '../client-intel-statement.controller';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('Client intel lifecycle acceptance requires disposable TEST_DATABASE_URL; SKIP is not acceptance');
const dbDescribe = url ? describe : describe.skip;
type Action = 'supersede' | 'retract' | 'false-positive';

dbDescribe('Client intel terminal race — real Nest HTTP / PostgreSQL / audit', () => {
  jest.setTimeout(60_000);
  let db: PrismaService; let app: INestApplication; let audit: AuditService; let service: ClientIntelStatementService;
  let tenant: string; let foreignTenant: string; let caseId: string; let debtorId: string;
  let actor: string; let viewer: string; let ineligible: string; let foreignActor: string;

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } }); await db.$connect();
    audit = new AuditService(db); const approval = new OfficeApprovalService(db, audit);
    const identityOnlyAuth = { async canActivate(ctx: any) {
      const req = ctx.switchToHttp().getRequest();
      const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-actor']) } });
      if (!user?.isActive) throw new UnauthorizedException();
      req.user = user; return true; // JWT identity seam only; eligibility, VIEWER guard, transaction and audit are real.
    } };
    const module = await Test.createTestingModule({ controllers: [ClientIntelStatementController], providers: [
      ClientIntelStatementService, { provide: PrismaService, useValue: db },
      { provide: AuditService, useValue: audit }, { provide: OfficeApprovalService, useValue: approval },
    ] }).overrideGuard(AuthGuard('jwt')).useValue(identityOnlyAuth).compile();
    service = module.get(ClientIntelStatementService);
    app = module.createNestApplication(); app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); await app.listen(0, '127.0.0.1');
  });

  async function makeActor(t: string, role: 'USER' | 'VIEWER' = 'USER', rank: 'PARTNER' | 'LAWYER' = 'PARTNER') {
    const user = await db.user.create({ data: { tenantId: t, email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: 'Lifecycle actor', role } });
    await db.lawyer.create({ data: { tenantId: t, userId: user.id, name: 'Synthetic', surname: 'Lawyer', lawyerRank: rank, canApproveOfficeActions: false } });
    return user.id;
  }

  beforeEach(async () => {
    tenant = `intel-race-test-${randomUUID()}`; foreignTenant = `intel-race-foreign-test-${randomUUID()}`;
    for (const id of [tenant, foreignTenant]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic lifecycle acceptance' } });
    caseId = (await db.case.create({ data: { tenantId: tenant, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } })).id;
    debtorId = (await db.debtor.create({ data: { tenantId: tenant, type: 'INDIVIDUAL', name: 'Synthetic debtor' } })).id;
    actor = await makeActor(tenant); viewer = await makeActor(tenant, 'VIEWER');
    ineligible = await makeActor(tenant, 'USER', 'LAWYER'); foreignActor = await makeActor(foreignTenant);
  });
  afterEach(async () => {
    jest.restoreAllMocks(); const ids = [tenant, foreignTenant].filter(Boolean);
    await db.clientIntelStatement.deleteMany({ where: { tenantId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await db.tenant.deleteMany({ where: { id: { in: ids } } });
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  async function seed(value = 'Original declaration') {
    return db.clientIntelStatement.create({ data: { tenantId: tenant, caseId, debtorId, category: 'INCOME_SOURCE', label: 'Synthetic declaration', value, note: 'Original note', createdById: actor } });
  }
  function invoke(id: string, action: Action, who = actor, value = 'Replacement') {
    return request(app.getHttpServer()).post(`/client-intel-statements/${id}/${action}`)
      .set('x-test-actor', who).send(action === 'supersede' ? { value } : { note: 'Lifecycle reason' });
  }
  async function snapshot() {
    const where = { tenantId: { in: [tenant, foreignTenant] } };
    return { rows: await db.clientIntelStatement.findMany({ where, orderBy: { id: 'asc' } }), audits: await db.auditLog.findMany({ where, orderBy: { id: 'asc' } }) };
  }
  function alignPreflight(id: string) {
    const real = db.clientIntelStatement.findFirst.bind(db.clientIntelStatement);
    let reads = 0; let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const timer = setTimeout(release, 5_000);
    const spy = jest.spyOn(db.clientIntelStatement, 'findFirst').mockImplementation((async (args: any) => {
      const row = await real(args);
      if (row?.id === id && args.select?.status) { reads++; if (reads === 2) { clearTimeout(timer); release(); } await ready; }
      return row;
    }) as any);
    return { finish() { clearTimeout(timer); spy.mockRestore(); expect(reads).toBe(2); } };
  }

  it.each([
    ['supersede', 'supersede'], ['supersede', 'retract'], ['supersede', 'false-positive'], ['retract', 'false-positive'],
  ] as const)('%s versus %s: one terminal transition, one replacement at most and one audit', async (a, b) => {
    const original = await seed(); const barrier = alignPreflight(original.id);
    const responses = await Promise.all([invoke(original.id, a, actor, 'Replacement A'), invoke(original.id, b, actor, 'Replacement B')]);
    barrier.finish(); expect(responses.map(x => x.status).sort()).toEqual([201, 409]);
    const after = await snapshot(); const source = after.rows.find(x => x.id === original.id)!;
    const replacements = after.rows.filter(x => x.id !== original.id); const winner = responses.find(x => x.status === 201)!;
    expect(source).toMatchObject({ value: original.value, category: original.category, label: original.label, note: original.note, caseId: original.caseId, debtorId: original.debtorId });
    expect(source.status).not.toBe('ACTIVE'); expect(after.audits).toHaveLength(1);
    expect(after.audits[0]).toMatchObject({ tenantId: tenant, entityType: 'CLIENT_INTEL_STATEMENT', entityId: original.id, userId: actor });
    if (source.status === 'SUPERSEDED') {
      expect(replacements).toHaveLength(1);
      expect(replacements[0]).toMatchObject({ id: source.supersededById, status: 'ACTIVE', caseId, debtorId, category: original.category });
      expect(winner.body.id).toBe(replacements[0].id);
    } else { expect(replacements).toHaveLength(0); expect(source.supersededById).toBeNull(); expect(winner.body.id).toBe(original.id); }
  });

  it('audit insertion followed by failure rolls back transition, replacement and inserted audit', async () => {
    const original = await seed(); const before = await snapshot(); const real = audit.logInTransaction.bind(audit); let reached = false;
    const spy = jest.spyOn(audit, 'logInTransaction').mockImplementationOnce(async (tx, input) => { await real(tx, input); reached = true; throw new Error('Synthetic failure after actual audit insert'); });
    await invoke(original.id, 'supersede').expect(500);
    expect(reached).toBe(true); expect(spy).toHaveBeenCalledTimes(1); expect(await snapshot()).toEqual(before);
  });
  it('independent ACTIVE sources in the same subject/category remain independent', async () => {
    const a = await seed('Declaration A'); const b = await seed('Declaration B');
    const responses = await Promise.all([invoke(a.id, 'supersede', actor, 'Corrected A'), invoke(b.id, 'supersede', actor, 'Corrected B')]);
    expect(responses.map(x => x.status)).toEqual([201, 201]); const after = await snapshot();
    expect(after.rows.filter(x => x.status === 'ACTIVE')).toHaveLength(2);
    expect(after.rows.filter(x => x.status === 'SUPERSEDED')).toHaveLength(2); expect(after.audits).toHaveLength(2);
    expect(after.rows.find(x => x.id === a.id)!.supersededById).not.toBe(after.rows.find(x => x.id === b.id)!.supersededById);
  });
  it('sequential terminal retry stays 400 and adds no audit or replacement', async () => {
    const original = await seed(); await invoke(original.id, 'retract').expect(201); const before = await snapshot();
    await invoke(original.id, 'supersede').expect(400); expect(await snapshot()).toEqual(before);
  });
  it.each(['FOREIGN', 'VIEWER', 'INELIGIBLE'] as const)('%s cannot mutate or append an audit', async kind => {
    const original = await seed(); const before = await snapshot();
    const who = kind === 'FOREIGN' ? foreignActor : kind === 'VIEWER' ? viewer : ineligible;
    await invoke(original.id, 'supersede', who).expect(kind === 'FOREIGN' ? 404 : 403); expect(await snapshot()).toEqual(before);
  });
  it('missing actor cannot bypass a direct service lifecycle entry', async () => {
    const original = await seed(); const before = await snapshot();
    await expect(service.supersede(tenant, original.id, undefined as never, { value: 'Replacement' })).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
  });
});
