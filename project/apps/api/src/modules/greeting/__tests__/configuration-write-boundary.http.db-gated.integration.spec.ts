import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ClientNotificationService } from '../../client-notification/client-notification.service';
import { IntegrationErrorReporter } from '../../error-log/integration-error-reporter';
import { MessageTemplateController } from '../../message-template/message-template.controller';
import { MessageTemplateService } from '../../message-template/message-template.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { GreetingController } from '../greeting.controller';
import { GreetingService } from '../greeting.service';

const databaseUrl = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !databaseUrl) throw new Error('Configuration boundary requires TEST_DATABASE_URL in CI.');
const describeDb = databaseUrl ? describe : describe.skip;

/** Actual DB principal and F01 policy; replaces JWT cryptography only. No provider is called. */
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

describeDb('SpecialDay / MessageTemplate ORM boundary — real HTTP and disposable PostgreSQL', () => {
  jest.setTimeout(60_000);
  const suffix = randomUUID().slice(0, 8);
  const tenantA = 'test-config-a-' + suffix;
  const tenantB = 'test-config-b-' + suffix;
  const tenants = [tenantA, tenantB];
  let db: PrismaClient, app: INestApplication;
  let greeting: GreetingService, templates: MessageTemplateService;
  let userA: string, viewer: string, dayA: string, dayB: string, globalDay: string;
  let templateA: string, templateB: string, systemTemplate: string;
  const day = { name: 'Day', type: 'NATIONAL', month: 10, day: 29 };
  const http = (method: 'get' | 'post' | 'put', url: string, user?: string) =>
    request(app.getHttpServer())[method](url).set('x-test-user-id', user ?? userA);
  const snapshot = async () => JSON.parse(JSON.stringify({
    users: await db.user.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
    tenants: await db.tenant.findMany({ where: { id: { in: tenants } }, orderBy: { id: 'asc' } }),
    days: await db.specialDay.findMany({ where: { OR: [{ tenantId: { in: tenants } }, { id: globalDay }] }, orderBy: { id: 'asc' } }),
    templates: await db.messageTemplate.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
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
      controllers: [GreetingController, MessageTemplateController],
      providers: [
        GreetingService, MessageTemplateService, OfficeF01AuthorizationGuard,
        { provide: PrismaService, useValue: db },
        { provide: ClientNotificationService, useValue: {} },
        { provide: IntegrationErrorReporter, useValue: {} },
        { provide: OfficeApprovalService, useValue: new OfficeApprovalService(db as any, { log: jest.fn() } as any) },
      ],
    }).overrideGuard(JwtAuthGuard).useValue(new TestIdentityGuard(db))
      .overrideGuard(AuthGuard('jwt')).useValue(new TestIdentityGuard(db)).compile();
    greeting = module.get(GreetingService);
    templates = module.get(MessageTemplateService);
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await db.tenant.createMany({ data: tenants.map(id => ({ id, name: id, slug: id })) });
    userA = (await db.user.create({ data: { tenantId: tenantA, email: suffix + '-admin@example.test', name: 'A', surname: 'Test', role: 'ADMIN' } })).id;
    viewer = (await db.user.create({ data: { tenantId: tenantA, email: suffix + '-viewer@example.test', name: 'V', surname: 'Test', role: 'VIEWER' } })).id;
    dayA = (await db.specialDay.create({ data: { ...day, tenantId: tenantA } })).id;
    dayB = (await db.specialDay.create({ data: { ...day, tenantId: tenantB } })).id;
    globalDay = (await db.specialDay.create({ data: { ...day, tenantId: null } })).id;
    templateA = (await db.messageTemplate.create({ data: { tenantId: tenantA, code: 'LOCAL', name: 'Local', category: 'OTHER', channel: 'EMAIL', body: 'Initial' } })).id;
    templateB = (await db.messageTemplate.create({ data: { tenantId: tenantB, code: 'FOREIGN', name: 'Foreign', category: 'OTHER', channel: 'EMAIL', body: 'Foreign body' } })).id;
    systemTemplate = (await db.messageTemplate.create({ data: { tenantId: tenantA, code: 'SYSTEM', name: 'System', category: 'OTHER', channel: 'EMAIL', body: 'System body', isSystem: true } })).id;
  });

  afterAll(async () => {
    if (db) {
      await db.messageTemplate.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.specialDay.deleteMany({ where: { OR: [{ tenantId: { in: tenants } }, { id: globalDay }] } });
      await db.user.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.tenant.deleteMany({ where: { id: { in: tenants } } });
    }
    await app?.close();
    await db?.$disconnect();
  });

  it('anonymous caller cannot mutate either configuration', async () => {
    await unchanged(async () => {
      await request(app.getHttpServer()).post('/greetings/special-days').send(day).expect(401);
      await request(app.getHttpServer()).put('/message-templates/' + templateA).send({ body: 'Denied' }).expect(401);
    });
  });

  it.each(['tenantId', 'createdAt', 'updatedAt', 'daysBeforeReminder', 'tenant'])('SpecialDay rejects undeclared %s before any write', async key => {
    await unchanged(() => http('post', '/greetings/special-days').send({ ...day, [key]: key === 'tenantId' ? tenantB : { set: tenantB } }).expect(400));
  });

  it.each(['foreign', 'global', 'absent'])('SpecialDay rejects %s target with the same response and no mutation', async kind => {
    await unchanged(async () => {
      const response = await http('post', '/greetings/special-days').send({ ...day, id: kind === 'foreign' ? dayB : kind === 'global' ? globalDay : 'missing' }).expect(404);
      expect(response.body.message).toBe('Özel gün bulunamadı');
    });
  });

  it('SpecialDay rejects nested scalar operations and invalid numeric/boolean shapes', async () => {
    await unchanged(async () => {
      for (const patch of [{ name: { set: 'nested' } }, { month: 13 }, { day: '29' }, { isActive: { set: false } }, { id: null }]) {
        await http('post', '/greetings/special-days').send({ ...day, ...patch }).expect(400);
      }
    });
  });

  it('SpecialDay creates only in the authenticated tenant', async () => {
    const result = await http('post', '/greetings/special-days').send({ ...day, name: 'Created', isActive: true }).expect(201);
    expect(result.body).toMatchObject({ tenantId: tenantA, name: 'Created', isActive: true });
    expect(await db.specialDay.findUnique({ where: { id: result.body.id } })).toMatchObject({ tenantId: tenantA });
  });

  it('SpecialDay preserves partial edits, selector id and nullable messages', async () => {
    const result = await http('post', '/greetings/special-days').send({ id: dayA, name: 'Edited', isActive: false, greetingMessage: null }).expect(201);
    expect(result.body).toMatchObject({ id: dayA, tenantId: tenantA, name: 'Edited', month: 10, day: 29, isActive: false, greetingMessage: null });
    await http('post', '/greetings/special-days').send({ id: dayA, isActive: false }).expect(201);
  });

  it('SpecialDay still lists global and local days without foreign tenant data', async () => {
    const result = await http('get', '/greetings/special-days').expect(200);
    expect(result.body.some((entry: { id: string }) => entry.id === globalDay)).toBe(true);
    expect(result.body.some((entry: { id: string }) => entry.id === dayA)).toBe(true);
    expect(result.body.some((entry: { id: string }) => entry.id === dayB)).toBe(false);
  });

  it.each(['id', 'tenantId', 'isSystem', 'code', 'category', 'channel', 'createdAt', 'tenant'])('MessageTemplate rejects undeclared %s before any write', async key => {
    await unchanged(() => http('put', '/message-templates/' + templateA).send({ body: 'Denied', [key]: key === 'tenantId' ? tenantB : { set: 'injected' } }).expect(400));
  });

  it('MessageTemplate preserves the existing VIEWER write denial', async () => {
    await unchanged(() => http('put', '/message-templates/' + templateA, viewer).send({ body: 'Denied' }).expect(403));
  });

  it('MessageTemplate rejects a foreign target and missing target identically', async () => {
    await unchanged(async () => {
      const foreign = await http('put', '/message-templates/' + templateB).send({ body: 'Denied' }).expect(404);
      const absent = await http('put', '/message-templates/missing').send({ body: 'Denied' }).expect(404);
      expect(foreign.body).toEqual(absent.body);
    });
  });

  it('MessageTemplate allows declared normal fields and unchanged activation echo', async () => {
    const result = await http('put', '/message-templates/' + templateA).send({ name: 'Edited', body: 'Edited body', description: null, subject: null, isActive: true, sortOrder: 7 }).expect(200);
    expect(result.body).toMatchObject({ id: templateA, tenantId: tenantA, name: 'Edited', body: 'Edited body', description: null, subject: null, isActive: true, sortOrder: 7, isSystem: false, code: 'LOCAL' });
  });

  it('system templates still change only subject and body', async () => {
    const result = await http('put', '/message-templates/' + systemTemplate).send({ name: 'Ignored', isActive: false, sortOrder: 9, body: 'Allowed', subject: 'Allowed subject' }).expect(200);
    expect(result.body).toMatchObject({ name: 'System', isActive: true, sortOrder: 0, body: 'Allowed', subject: 'Allowed subject', isSystem: true });
  });

  it('MessageTemplate rejects Prisma scalar operations and malformed fields', async () => {
    await unchanged(async () => {
      for (const body of [{ body: { set: 'Nested' } }, { name: null }, { isActive: 'false' }, { sortOrder: 1.5 }]) {
        await http('put', '/message-templates/' + templateA).send(body).expect(400);
      }
    });
  });

  it('direct service consumers cannot bypass the runtime boundaries', async () => {
    await unchanged(async () => {
      await expect(greeting.upsertSpecialDay(tenantA, { ...day, tenantId: tenantB } as any)).rejects.toMatchObject({ status: 400 });
      await expect(templates.update(tenantA, templateA, { body: { set: 'Nested' } } as any)).rejects.toMatchObject({ status: 400 });
      await expect(templates.update(tenantA, templateA, JSON.parse('{"constructor":{}}'))).rejects.toMatchObject({ status: 400 });
    });
  });
});
