import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TaskController } from '../../task/task.controller';
import { TaskService } from '../../task/task.service';
import { CaseGroupController, GroupController } from '../group.controller';
import { GroupService } from '../group.service';

const databaseUrl = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !databaseUrl) throw new Error('Group/Task boundary requires TEST_DATABASE_URL in CI.');
const describeDb = databaseUrl ? describe : describe.skip;

/** Gerçek DB principal; token doğrulamasını değil controller→tenant→servis→DB sınırını sınar. */
class TestIdentityGuard implements CanActivate {
  constructor(private readonly db: PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const user = await this.db.user.findFirst({ where: { id: String(req.headers['x-test-user-id']), isActive: true } });
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeDb('CaseGroup / Task tenant boundary — real HTTP and disposable PostgreSQL', () => {
  jest.setTimeout(60_000);
  const suffix = randomUUID().slice(0, 8);
  const tenantA = 'test-group-a-' + suffix;
  const tenantB = 'test-group-b-' + suffix;
  const tenants = [tenantA, tenantB];
  let db: PrismaClient;
  let app: INestApplication;
  let service: GroupService;
  let userA: string, userB: string, caseA: string, caseB: string;
  let clientA: string, clientB: string, groupA: string, groupB: string, taskA: string;

  const http = (method: 'get' | 'post' | 'put' | 'delete', url: string) =>
    request(app.getHttpServer())[method](url).set('x-test-user-id', userA);

  const snapshot = async () => JSON.parse(JSON.stringify({
    users: await db.user.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
    clients: await db.client.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
    cases: await db.case.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
    groups: await db.groupDefinition.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
    links: await db.caseGroup.findMany({ where: { case: { tenantId: { in: tenants } } }, orderBy: { id: 'asc' } }),
    tasks: await db.task.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
  }));
  const unchanged = async (operation: () => Promise<unknown>) => {
    const before = await snapshot();
    await operation();
    expect(await snapshot()).toEqual(before);
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const module = await Test.createTestingModule({
      controllers: [GroupController, CaseGroupController, TaskController],
      providers: [GroupService, TaskService, { provide: PrismaService, useValue: db }],
    }).overrideGuard(JwtAuthGuard).useValue(new TestIdentityGuard(db)).compile();
    service = module.get(GroupService);
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await db.tenant.createMany({ data: tenants.map(id => ({ id, name: id, slug: id })) });
    userA = (await db.user.create({ data: { tenantId: tenantA, email: suffix + '-a@example.test', name: 'A', surname: 'Test', role: 'USER' } })).id;
    userB = (await db.user.create({ data: { tenantId: tenantB, email: suffix + '-b@example.test', name: 'B', surname: 'Test', role: 'USER' } })).id;
    clientA = (await db.client.create({ data: { tenantId: tenantA, type: 'COMPANY', companyName: 'A', displayName: 'A' } })).id;
    clientB = (await db.client.create({ data: { tenantId: tenantB, type: 'COMPANY', companyName: 'B', displayName: 'B' } })).id;
    caseA = (await db.case.create({ data: { tenantId: tenantA, fileNumber: 'A-' + suffix, type: 'GENERAL_EXECUTION' } })).id;
    caseB = (await db.case.create({ data: { tenantId: tenantB, fileNumber: 'B-' + suffix, type: 'GENERAL_EXECUTION' } })).id;
    groupA = (await db.groupDefinition.create({ data: { tenantId: tenantA, name: 'A', clientId: clientA } })).id;
    groupB = (await db.groupDefinition.create({ data: { tenantId: tenantB, name: 'B', clientId: clientB } })).id;
  });

  beforeEach(async () => {
    await db.caseGroup.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
    await db.task.deleteMany({ where: { tenantId: { in: tenants } } });
    taskA = (await db.task.create({ data: { tenantId: tenantA, title: 'Own task', caseId: caseA, createdById: userA } })).id;
  });

  afterAll(async () => {
    if (db) {
      await db.task.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.caseGroup.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
      await db.groupDefinition.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.case.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.client.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.user.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.tenant.deleteMany({ where: { id: { in: tenants } } });
    }
    await app?.close();
    await db?.$disconnect();
  });

  it('anonymous caller cannot list case groups', async () => {
    await request(app.getHttpServer()).get('/cases/' + caseA + '/groups').expect(401);
  });

  it('foreign and absent case reads are indistinguishable and do not mutate', async () => {
    await unchanged(async () => {
      const foreign = await http('get', '/cases/' + caseB + '/groups').expect(404);
      const absent = await http('get', '/cases/missing/groups').expect(404);
      expect(foreign.body).toEqual(absent.body);
    });
  });

  it.each(['foreign-case', 'foreign-group'] as const)('assignment rejects %s before every write', async kind => {
    await unchanged(() => http('post', '/cases/' + (kind === 'foreign-case' ? caseB : caseA) + '/groups/' + (kind === 'foreign-group' ? groupB : groupA)).send({}).expect(404));
  });

  it.each(['foreign-case', 'foreign-group'] as const)('removal rejects %s and preserves a historical invalid link', async kind => {
    const targetCase = kind === 'foreign-case' ? caseB : caseA;
    const targetGroup = kind === 'foreign-group' ? groupB : groupA;
    await db.caseGroup.create({ data: { caseId: targetCase, groupId: targetGroup } });
    await unchanged(() => http('delete', '/cases/' + targetCase + '/groups/' + targetGroup).expect(404));
  });

  it('group creation rejects foreign client without changing related tables', async () => {
    await unchanged(() => http('post', '/groups').send({ name: 'Forbidden', clientId: clientB }).expect(404));
  });

  it('group update rejects foreign client without changing existing group', async () => {
    await unchanged(() => http('put', '/groups/' + groupA).send({ name: 'Forbidden', clientId: clientB }).expect(404));
  });

  it('normal group creation keeps tenant, creator and local client', async () => {
    const response = await http('post', '/groups').send({ name: 'Allowed', clientId: clientA, isGlobal: false }).expect(201);
    expect(response.body.data).toMatchObject({ tenantId: tenantA, createdById: userA, clientId: clientA, name: 'Allowed' });
  });

  it('normal group update accepts unchanged client echo', async () => {
    const response = await http('put', '/groups/' + groupA).send({ name: 'Updated', clientId: clientA }).expect(200);
    expect(response.body.data).toMatchObject({ id: groupA, tenantId: tenantA, clientId: clientA, name: 'Updated' });
  });

  it('normal assignment replay creates one link and normal removal still works', async () => {
    const url = '/cases/' + caseA + '/groups/' + groupA;
    const first = await http('post', url).send({}).expect(201);
    const second = await http('post', url).send({}).expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await db.caseGroup.count({ where: { caseId: caseA, groupId: groupA } })).toBe(1);
    await http('delete', url).expect(200);
    expect(await db.caseGroup.count({ where: { caseId: caseA, groupId: groupA } })).toBe(0);
  });

  it('batch with one foreign case is rejected atomically', async () => {
    await unchanged(async () => {
      await expect(service.assignGroupsToCases(tenantA, [caseA, caseB], groupA, userA)).rejects.toThrow('Dosya bulunamadı');
    });
  });

  it('local batch retains duplicate-input and replay behavior', async () => {
    expect(await service.assignGroupsToCases(tenantA, [caseA, caseA], groupA, userA)).toEqual({ count: 1 });
    expect(await service.assignGroupsToCases(tenantA, [caseA], groupA, userA)).toEqual({ count: 0 });
  });

  it('case group read excludes historical foreign-group relations', async () => {
    await db.caseGroup.createMany({ data: [{ caseId: caseA, groupId: groupA }, { caseId: caseA, groupId: groupB }] });
    const response = await http('get', '/cases/' + caseA + '/groups').expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].group.id).toBe(groupA);
    expect(JSON.stringify(response.body)).not.toContain(groupB);
  });

  it('group detail and count exclude historical foreign-case relations', async () => {
    await db.caseGroup.createMany({ data: [{ caseId: caseA, groupId: groupA }, { caseId: caseB, groupId: groupA }] });
    const response = await http('get', '/groups/' + groupA).expect(200);
    expect(response.body.data._count.caseGroups).toBe(1);
    expect(response.body.data.caseGroups).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain(caseB);
  });

  it('task creation rejects foreign case without any related mutation', async () => {
    await unchanged(() => http('post', '/tasks').send({ title: 'Forbidden', caseId: caseB }).expect(400));
  });

  it('task update rejects foreign case without changing title or closure attribution', async () => {
    await unchanged(() => http('put', '/tasks/' + taskA).send({ title: 'Forbidden', caseId: caseB, status: 'COMPLETED' }).expect(400));
  });

  it('normal task create and detach preserve existing behavior', async () => {
    const response = await http('post', '/tasks').send({ title: 'Allowed', caseId: caseA }).expect(201);
    expect(response.body).toMatchObject({ tenantId: tenantA, caseId: caseA, createdById: userA });
    await http('put', '/tasks/' + response.body.id).send({ caseId: null, status: 'COMPLETED' }).expect(200);
    expect(await db.task.findUnique({ where: { id: response.body.id } })).toMatchObject({ caseId: null, completedByUserId: userA, resolutionType: 'MANUAL' });
  });

  it('case-less task creation remains allowed', async () => {
    const response = await http('post', '/tasks').send({ title: 'Without case' }).expect(201);
    expect(response.body.caseId).toBeNull();
  });

  it('legacy task with foreign case is hidden from detail and paginated list', async () => {
    const bad = await db.task.create({ data: { tenantId: tenantA, title: 'Historical invalid', caseId: caseB } });
    await http('get', '/tasks/' + bad.id).expect(404);
    const response = await http('get', '/tasks').expect(200);
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data.map((entry: { id: string }) => entry.id)).toEqual([taskA]);
    expect(JSON.stringify(response.body)).not.toContain(caseB);
  });

  it.each(['tenantId', 'user', 'createdById', 'role'])('task runtime DTO rejects server-owned field %s', async field => {
    await unchanged(() => http('post', '/tasks').send({ title: 'Forbidden', [field]: field === 'user' ? { connect: { id: userB } } : tenantB }).expect(400));
  });
});
