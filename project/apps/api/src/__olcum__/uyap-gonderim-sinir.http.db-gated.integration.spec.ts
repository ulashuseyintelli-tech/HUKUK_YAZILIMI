// GEÇİCİ ÖLÇÜM (depoya GİRMEZ): UYAP evrak / dava gönderim uçlarının bugünkü sınırı — HTTP + disposable PG.
jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('stub'); } }));
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../test/test-db-env';
import { StorageModule } from '../common/storage/storage.module';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { CaseModule } from '../modules/case/case.module';
import { ErrorLogModule } from '../modules/error-log/error-log.module';
import { MetricsRegistryModule } from '../modules/metrics-registry/metrics-registry.module';
import { UyapModule } from '../modules/uyap/uyap.module';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
const describeDb = TEST_DB_URL ? describe : describe.skip;

class Ident implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}
  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers['x-test-user-id']) }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeDb('ÖLÇÜM — UYAP gönderim uçları bugünkü sınır', () => {
  jest.setTimeout(300_000);
  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  let viewerId: string;
  let clientId: string;
  let lawyerA: string;
  const suffix = randomUUID().slice(0, 8);
  const report: Record<string, unknown> = {};

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const id = new Ident(() => prisma);
    const mod = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule, UyapModule],
    })
      .overrideGuard(JwtAuthGuard).useValue(id)
      .overrideGuard(AuthGuard('jwt')).useValue(id)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    tenantId = `test-ci-ugs-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI UGS', slug: tenantId } });
    adminId = (await prisma.user.create({ data: { tenantId, email: `a-${suffix}@example.test`, name: 'a', surname: 'U', role: 'ADMIN' } })).id;
    viewerId = (await prisma.user.create({ data: { tenantId, email: `v-${suffix}@example.test`, name: 'v', surname: 'U', role: 'VIEWER' } })).id;
    const office = await prisma.office.create({ data: { tenantId, name: 'UGS' } });
    const lawyerUser = (await prisma.user.create({ data: { tenantId, email: `l-${suffix}@example.test`, name: 'l', surname: 'U', role: 'USER' } })).id;
    lawyerA = (await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: lawyerUser, name: 'l', surname: 'U', lawyerRank: 'LAWYER' } })).id;
    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'UGS m', displayName: 'UGS m' } })).id;
  });

  afterAll(async () => {
    fs.writeFileSync(process.env.OLCUM_CIKTI || 'uyap-sinir.json', JSON.stringify(report, null, 1));
    await app?.close();
    await prisma.uyapRequestLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const as = (u: string) => ({
    post: (p: string, b: object = {}) => request(app.getHttpServer()).post(p).set('x-test-user-id', u).send(b),
    get: (p: string) => request(app.getHttpServer()).get(p).set('x-test-user-id', u),
  });
  const open = async (label: string, withLawyer: boolean) => {
    const res = await as(adminId).post('/cases', {
      fileNumber: `CI-UGS-${label}-${suffix}`, type: 'GENERAL_EXECUTION', interestType: 'YASAL', startDate: '2026-02-01', currency: 'TRY',
      creditors: [{ id: clientId, type: 'COMPANY', name: 'UGS m' }],
      ...(withLawyer ? { lawyers: [{ id: lawyerA, name: 'l', surname: 'U' }] } : {}),
      dues: [{ type: 'PRINCIPAL', description: 'A', amount: 1000, dueDate: '2026-01-15' }],
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  const doc = (caseId: string) => ({ caseId, documentType: 'DILEKCE', documentContent: 'QQ==', documentName: 'x.pdf' });
  const civil = (caseId: string) => ({ caseId, lawsuitType: 'ITIRAZIN_IPTALI', uyapDavaTuru: 'x', courtType: 'x', documentContent: 'QQ==', documentName: 'x.pdf', plaintiff: { name: 'a' }, defendant: { name: 'b' }, claimAmount: 1, currency: 'TRY' });
  const criminal = (caseId: string) => ({ caseId, lawsuitType: 'KARSILIKSIZ_CEK', uyapDavaTuru: 'x', courtType: 'x', documentContent: 'QQ==', documentName: 'x.pdf', complainant: { name: 'a' }, suspect: { name: 'b' } });
  const brief = (r: request.Response) => ({
    http: r.status,
    success: r.body?.success ?? null,
    code: r.body?.code ?? r.body?.error ?? null,
    flags: r.body?.data ? { simulated: r.body.data.simulated, dispatched: r.body.data.dispatched, providerAccepted: r.body.data.providerAccepted, legalEffectConfirmed: r.body.data.legalEffectConfirmed } : null,
    message: String(r.body?.message ?? '').slice(0, 90),
  });
  const counts = async (caseId: string) => ({
    cpe: await prisma.cpeDecisionLog.count({ where: { caseId } }),
    requestLogs: await prisma.uyapRequestLog.count({ where: { caseId } }),
  });

  it('S1 avukatsız dosya (vekalet kontrolü çalışmaz) ve S2 avukatlı ama vekaletsiz dosya', async () => {
    const noLawyer = await open('avukatsiz', false);
    const withLawyer = await open('avukatli', true);
    const out: Record<string, unknown> = {};
    for (const [label, caseId] of [['avukatsiz', noLawyer], ['avukatli_vekaletsiz', withLawyer]] as const) {
      out[label] = {
        document: brief(await as(adminId).post('/uyap/document/submit', doc(caseId))),
        civil: brief(await as(adminId).post('/uyap/lawsuit/civil', civil(caseId))),
        criminal: brief(await as(adminId).post('/uyap/lawsuit/criminal', criminal(caseId))),
        xmlSubmit: brief(await as(adminId).post(`/uyap/xml/submit/${caseId}`)),
        poaValidate: (await as(adminId).get(`/uyap/poa/validate/case/${caseId}`)).body,
        sayimlar: await counts(caseId),
      };
    }
    report.S1_S2 = out;
  });

  it('S3 VIEWER aynı ucu çağırabilir mi (avukatsız dosya)', async () => {
    const c = await open('viewer', false);
    report.S3_viewer = { document: brief(await as(viewerId).post('/uyap/document/submit', doc(c))), sayimlar: await counts(c) };
  });
});
