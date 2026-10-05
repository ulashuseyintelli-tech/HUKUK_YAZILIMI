// GEÇİCİ ÖLÇÜM (depoya GİRMEZ): UYAP gönderim hazırlığı (POST /cases/:id/uyap/prepare) — durum ucu ↔ hazırlık yanıtı ayrışması.
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
import { StageTriggerModule } from '../modules/stage-trigger/stage-trigger.module';
import { UyapModule } from '../modules/uyap/uyap.module';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
const describeDb = TEST_DB_URL ? describe : describe.skip;

class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers['x-test-user-id']) }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeDb('ÖLÇÜM — UYAP hazırlığı: durum ucu ↔ hazırlık yanıtı', () => {
  jest.setTimeout(300_000);
  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  let lawyerUserId: string;
  let lawyerId: string;
  let clientId: string;
  const suffix = randomUUID().slice(0, 8);
  const report: Record<string, unknown> = { meta: { head: process.env.OLCUM_HEAD ?? null, uyapAvailable: 'true' } };

  beforeAll(async () => {
    process.env.UYAP_AVAILABLE = 'true';
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule, StageTriggerModule, UyapModule],
    })
      .overrideGuard(JwtAuthGuard).useValue(identity)
      .overrideGuard(AuthGuard('jwt')).useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    tenantId = `test-ci-hzr-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI HZR', slug: tenantId } });
    adminId = (await prisma.user.create({ data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'HZR', role: 'ADMIN' } })).id;
    const office = await prisma.office.create({ data: { tenantId, name: 'HZR Bürosu' } });
    lawyerUserId = (await prisma.user.create({ data: { tenantId, email: `av-${suffix}@example.test`, name: 'av', surname: 'HZR', role: 'USER' } })).id;
    lawyerId = (await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: lawyerUserId, name: 'av', surname: 'HZR', lawyerRank: 'LAWYER' } })).id;
    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'HZR müvekkil', displayName: 'HZR müvekkil' } })).id;
    const poa = await prisma.clientPowerOfAttorney.create({ data: { tenantId, clientId, dateIssued: new Date('2026-01-10'), status: 'ACTIVE', isActive: true, isLimited: false, scopeType: 'GENEL' } });
    await prisma.poaLawyer.create({ data: { tenantId, poaId: poa.id, lawyerId, isPrimary: true } });
  });

  afterAll(async () => {
    fs.writeFileSync(process.env.OLCUM_CIKTI || 'hazirlik-olcum.json', JSON.stringify(report, null, 1));
    await app?.close();
    await prisma.uyapRequestLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const as = (userId: string) => ({
    post: (path: string, body?: object) => { const r = request(app.getHttpServer()).post(path).set('x-test-user-id', userId); return body === undefined ? r : r.send(body); },
    get: (path: string) => request(app.getHttpServer()).get(path).set('x-test-user-id', userId),
  });

  const openCase = async (label: string) => {
    const res = await as(adminId).post('/cases', {
      fileNumber: `CI-HZR-${label}-${suffix}`, type: 'GENERAL_EXECUTION', interestType: 'YASAL', startDate: '2026-02-01', currency: 'TRY',
      creditors: [{ id: clientId, type: 'COMPANY', name: 'HZR müvekkil' }], dues: [{ type: 'PRINCIPAL', description: 'Asıl', amount: 10000, dueDate: '2026-01-15' }],
    });
    expect(res.status).toBe(201);
    const caseId = res.body.id as string;
    for (let i = 0; i < 40; i += 1) {
      if ((await prisma.expenseRequest.count({ where: { caseId } })) > 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return caseId;
  };

  const probe = async (caseId: string, userId: string) => {
    const gate = await as(adminId).get(`/expense-requests/case/${caseId}/gate-status`);
    const since = new Date();
    const prep = await as(userId).post(`/cases/${caseId}/uyap/prepare`);
    const dec = await prisma.cpeDecisionLog.findFirst({ where: { caseId, actionCode: 'UYAP_SEND', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
    return {
      statusEndpoint: { isBlocked: gate.body?.isBlocked, message: gate.body?.message ?? null },
      prepare: { http: prep.status, action: prep.body?.action, blockReason: prep.body?.blockReason ?? null, title: prep.body?.suggestion?.title ?? null },
      cpe: dec ? { allowed: dec.allowed, code: dec.code, gate: dec.gateCode, reason: dec.reason } : null,
    };
  };

  it('R1..R5: TL dosya — ödenmemiş / ödenmiş / talepsiz / NON_BLOCKING; yönetici ve vekaletli avukat', async () => {
    const unpaid = await openCase('odenmemis');
    report.R1_odenmemis_BLOCKING_yonetici = await probe(unpaid, adminId);
    report.R1b_odenmemis_BLOCKING_avukat = await probe(unpaid, lawyerUserId);

    const paid = await openCase('odenmis');
    await prisma.expenseRequest.updateMany({ where: { caseId: paid }, data: { status: 'PAID', paidTotal: 1431.1 } });
    report.R2_odenmis_yonetici = await probe(paid, adminId);
    report.R2b_odenmis_avukat = await probe(paid, lawyerUserId);

    const none = await openCase('talepsiz');
    await prisma.expenseRequest.deleteMany({ where: { caseId: none } });
    report.R3_talepsiz_yonetici = await probe(none, adminId);
    report.R3b_talepsiz_avukat = await probe(none, lawyerUserId);

    const nonBlocking = await openCase('nonblocking');
    await prisma.expenseRequest.updateMany({ where: { caseId: nonBlocking }, data: { gateType: 'NON_BLOCKING' } });
    report.R4_NONBLOCKING_odenmemis_avukat = await probe(nonBlocking, lawyerUserId);

    // Kontrol: aynı dosya, doğru bağlamlı gerçek uç (UYAP_SEND politika kararı) — ödenmiş dosyada izin veriyor mu
    const since = new Date();
    const send = await as(lawyerUserId).post('/uyap/test/payment-order', { caseId: paid, debtor: { name: 'B', identityNo: '1' } });
    const dec = await prisma.cpeDecisionLog.findFirst({ where: { caseId: paid, actionCode: 'UYAP_SEND', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
    report.K1_dogru_baglamli_uc_odenmis_avukat = { http: send.status, success: send.body?.success ?? null, cpe: dec ? { allowed: dec.allowed, code: dec.code, gate: dec.gateCode, reason: dec.reason } : null };
  });
});
