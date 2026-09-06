/**
 * F02 — Manuel scheduler tetikleme: GERCEK HTTP + JWT + yetki zinciri + PostgreSQL siniri.
 *
 * Kabul olcutleri:
 *  1) Yetkisiz manuel cagri (USER/lawyer'siz, ADMIN-alone, VIEWER) → 403, SIFIR yan etki.
 *  2) A tenant'inin yetkili (PARTNER) cagrisi B tenant'inda islem URETMEZ.
 *  3) Mesru A islemi calisir (NAFAKA Due yazilir).
 *  4) Zamanlanmis GLOBAL akis (cron giris noktasi, parametresiz) yetkili kapsamini korur:
 *     tum ACTIVE tenant'lar islenir.
 *
 * Gercek olanlar: JwtStrategy/JwtAuthGuard/AuthService, OfficeApprovalService.isApproverEligible,
 * SchedulerController, SchedulerService, PostgreSQL. Stub olanlar (yetki/tenant siniriyla
 * ilgisiz, nafaka yolunda kullanilmaz): SchedulerMetricsService, TebligatService,
 * IntegrationErrorReporter. Dis sisteme (UYAP/PTT/SMTP) hicbir cagri yapilmaz.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { IntegrationErrorReporter } from '../../error-log/integration-error-reporter';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { TebligatService } from '../../tebligat/tebligat.service';
import { SchedulerMetricsService } from '../scheduler-metrics.service';
import { SchedulerController } from '../scheduler.controller';
import { SchedulerService } from '../scheduler.service';
import { SCHEDULER_MANUAL_RUN_REASON } from '../scheduler-manual-run-policy';

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (TEST_DATABASE_URL) {
  const target = new URL(TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('F02_SCHEDULER_TEST_DATABASE_MUST_BE_LOCAL_POSTGRESQL');
  }
}
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('F02_SCHEDULER_TEST_DATABASE_REQUIRED: CI requires TEST_DATABASE_URL');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;
const SECRET = 'f02-scheduler-boundary-local-test-secret-at-least-32-bytes';

describeWithDatabase('F02: manual scheduler trigger — real HTTP, JWT, policy and PostgreSQL boundary', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let scheduler: SchedulerService;
  const createdTenants: string[] = [];

  interface Side {
    tenantId: string;
    caseId: string;
    partner: { id: string; email: string };
    plainUser: { id: string; email: string };
    adminAlone: { id: string; email: string };
    viewer: { id: string; email: string };
  }
  let A: Side;
  let B: Side;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL as string } } });
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    const audit = new AuditService(prismaService);
    const officeApproval = new OfficeApprovalService(prismaService, audit);
    scheduler = new SchedulerService(
      prismaService,
      { record: () => undefined } as unknown as SchedulerMetricsService,
      {} as unknown as TebligatService,
      { report: async () => undefined } as unknown as IntegrationErrorReporter,
      new CaseDebtorLifecycleGuardService(prismaService),
      officeApproval,
    );

    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [SchedulerController],
      providers: [
        AuthService, JwtStrategy, JwtAuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OfficeApprovalService, useValue: officeApproval },
        { provide: SchedulerService, useValue: scheduler },
        { provide: ConfigService, useValue: { get: (key: string, fallback?: unknown) => (key === 'JWT_SECRET' ? SECRET : fallback) } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    for (const tenantId of createdTenants) {
      await prisma.$executeRawUnsafe('DELETE FROM "Tenant" WHERE "id" = $1', tenantId).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function seedSide(label: string): Promise<Side> {
    const sfx = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `F02 ${label} ${sfx}`, slug: `f02-${label}-${sfx}` }, select: { id: true } });
    createdTenants.push(tenant.id);
    const mk = async (name: string, role: UserRole = 'USER') => prisma.user.create({
      data: { tenantId: tenant.id, email: `${name}-${sfx}@example.test`, name, surname: label, role, passwordHash: 'x'.repeat(20) },
      select: { id: true, email: true },
    });
    const partner = await mk('partner');
    await prisma.lawyer.create({ data: { tenantId: tenant.id, userId: partner.id, name: 'Partner', surname: label, lawyerRank: 'PARTNER' } });
    const plainUser = await mk('plain');           // USER, lawyer YOK → elevated DEGIL
    const adminAlone = await mk('admin', 'ADMIN'); // ADMIN, lawyer YOK → I02-R3: TEK BASINA YETMEZ
    const viewer = await mk('viewer', 'VIEWER');
    const kase = await prisma.case.create({
      data: {
        tenantId: tenant.id,
        fileNumber: `F02-${label}-${sfx}`,
        type: 'GENERAL_EXECUTION',
        subCategory: 'NAFAKA',
        metadata: { monthlyNafaka: 1000 },
      },
      select: { id: true },
    });
    return { tenantId: tenant.id, caseId: kase.id, partner, plainUser, adminAlone, viewer };
  }

  function bearer(user: { id: string; email: string }, tenantId: string, role: string): string {
    return `Bearer ${jwt.sign({ sub: user.id, tenantId, email: user.email, role, tokenVersion: 0 })}`;
  }

  async function nafakaDueCount(caseId: string): Promise<number> {
    return prisma.due.count({ where: { caseId, type: 'NAFAKA' } });
  }
  async function decisionLogCount(caseId: string): Promise<number> {
    return prisma.decisionLog.count({ where: { caseId } });
  }

  beforeAll(async () => {
    A = await seedSide('a');
    B = await seedSide('b');
  });

  it('KABUL-1a: lawyer\'siz USER → 403 ELEVATED_DENIED, hicbir tenant\'ta yan etki YOK', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/scheduler/check/nafaka')
      .set('Authorization', bearer(A.plainUser, A.tenantId, 'USER'));
    expect(res.status).toBe(403);
    expect(res.body?.message?.reasonCode ?? res.body?.reasonCode).toBe(SCHEDULER_MANUAL_RUN_REASON.ELEVATED_DENIED);
    expect(await nafakaDueCount(A.caseId)).toBe(0);
    expect(await nafakaDueCount(B.caseId)).toBe(0);
    expect(await decisionLogCount(A.caseId)).toBe(0);
  });

  it('KABUL-1b: ADMIN tek basina (lawyer yok) → 403 ELEVATED_DENIED (I02-R3 ilkesi)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/scheduler/run-all')
      .set('Authorization', bearer(A.adminAlone, A.tenantId, 'ADMIN'));
    expect(res.status).toBe(403);
    expect(res.body?.message?.reasonCode ?? res.body?.reasonCode).toBe(SCHEDULER_MANUAL_RUN_REASON.ELEVATED_DENIED);
    expect(await nafakaDueCount(A.caseId)).toBe(0);
  });

  it('KABUL-1c: VIEWER → 403 VIEWER_DENIED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/scheduler/check/mts')
      .set('Authorization', bearer(A.viewer, A.tenantId, 'VIEWER'));
    expect(res.status).toBe(403);
    expect(res.body?.message?.reasonCode ?? res.body?.reasonCode).toBe(SCHEDULER_MANUAL_RUN_REASON.VIEWER_DENIED);
  });

  it('KABUL-1d: JWT yoksa 401 (guard zinciri gercek)', async () => {
    const res = await request(app.getHttpServer()).post('/api/scheduler/check/nafaka');
    expect(res.status).toBe(401);
    expect(await nafakaDueCount(A.caseId)).toBe(0);
  });

  it('KABUL-2+3: A PARTNER\'inin yetkili nafaka cagrisi YALNIZ A\'da Due uretir; B\'de SIFIR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/scheduler/check/nafaka')
      .set('Authorization', bearer(A.partner, A.tenantId, 'USER'));
    expect(res.status).toBe(201);
    expect(await nafakaDueCount(A.caseId)).toBe(1);   // mesru A islemi CALISTI
    expect(await decisionLogCount(A.caseId)).toBe(1);
    expect(await nafakaDueCount(B.caseId)).toBe(0);   // B DOKUNULMADI
    expect(await decisionLogCount(B.caseId)).toBe(0);
  });

  it('KABUL-2 (run-all): A PARTNER run-all → 201, B yine DOKUNULMAZ', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/scheduler/run-all')
      .set('Authorization', bearer(A.partner, A.tenantId, 'USER'));
    expect(res.status).toBe(201);
    expect(await nafakaDueCount(B.caseId)).toBe(0);
    expect(await decisionLogCount(B.caseId)).toBe(0);
  });

  it('KABUL-4: zamanlanmis GLOBAL akis (cron giris noktasi, parametresiz) TUM aktif tenant\'lari isler', async () => {
    // Manuel yol A'yi zaten isledi (idempotent: ayni donem tekrar yazilmaz). Cron yolu B'yi de islemeli.
    await scheduler.processNafakaPeriods();
    expect(await nafakaDueCount(A.caseId)).toBe(1); // tekrar YAZILMADI (mevcut idempotency)
    expect(await nafakaDueCount(B.caseId)).toBe(1); // GLOBAL kapsam KORUNDU
  });

  it('KABUL-5: B PARTNER\'i kendi tenant\'inda calisir, A\'ya dokunmaz (simetri)', async () => {
    const before = await decisionLogCount(A.caseId);
    const res = await request(app.getHttpServer())
      .post('/api/scheduler/check/payment-orders')
      .set('Authorization', bearer(B.partner, B.tenantId, 'USER'));
    expect(res.status).toBe(201);
    expect(await decisionLogCount(A.caseId)).toBe(before);
  });
});
