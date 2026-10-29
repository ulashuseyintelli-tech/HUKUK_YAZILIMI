/**
 * KI-019 / KI-049 — F02-D (owner F02 uygulama talimatı 2026-10-29; OFP-18 / KÖK-11): KİRACI SINIRI.
 * Gerçek HTTP + JWT + yetki zinciri + PostgreSQL; sentetik İKİ kiracı.
 *
 * Kabul (OFP-18): bir kiracının kullanıcısı diğerinin eskalasyonunu TETİKLEYEMEZ ve sayımını GÖREMEZ.
 *  1) POST /escalation/run (A'nın ELEVATED aktörü: PARTNER kartlı USER) → yalnız A'nın görevi işlenir; B DOKUNULMAZ (yazma 0).
 *  2) VIEWER → 403 VIEWER_WRITE_DENIED; hiçbir kiracıda yazma yok. JWT yok → 401.
 *  3) GET /scheduler/status (A) → yalnız A'nın sayımı; (B) → yalnız B'nin sayımı; VIEWER okuyabilir.
 *  4) Cron giriş noktası (parametresiz processEscalations) GLOBAL kapsamı KORUR: tüm aktif kiracılar işlenir.
 *  5) Dış gönderim 0: TenantNotifier stub'ı HİÇ çağrılmaz (alıcı yok → SKIPPED; e-posta/SMS üretilmez).
 *
 * Gerçek olanlar: JwtStrategy/JwtAuthGuard/AuthService, ViewerWriteDenyGuard, EscalationController,
 * OperationalEscalationService, SchedulerController, SchedulerService, PostgreSQL. Stub: TenantNotifier (gönderim
 * kaydedici), IntegrationErrorReporter, SchedulerMetricsService, TebligatService. Dış sisteme çağrı yok.
 *  6) J-26 (owner kararı 2026-10-29, ELEVATED): kartsız USER ve kartsız ADMIN → 403 ESCALATION_MANUAL_RUN_DENIED_NOT_ELEVATED,
 *     hiçbir kiracıda yazma yok (KABUL-5). Eşik bu spec'te PİNLENİR.
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
import { SchedulerMetricsService } from '../../scheduler/scheduler-metrics.service';
import { SchedulerController } from '../../scheduler/scheduler.controller';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { TebligatService } from '../../tebligat/tebligat.service';
import { EscalationController } from '../escalation.controller';
import { OperationalEscalationService } from '../operational-escalation.service';
import { TenantNotifier } from '../tenant-notifier.service';

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (TEST_DATABASE_URL) {
  const target = new URL(TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('KI019_TEST_DATABASE_MUST_BE_LOCAL_POSTGRESQL');
  }
}
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('KI019_TEST_DATABASE_REQUIRED: CI requires TEST_DATABASE_URL');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;
const SECRET = 'ki019-ki049-tenant-scope-local-test-secret-at-least-32-bytes';
const DAY = 24 * 60 * 60 * 1000;

describeWithDatabase('KI-019 / KI-049: eskalasyon tetiği ve scheduler durumu — kiracı sınırı (gerçek HTTP, JWT, PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let escalation: OperationalEscalationService;
  const sendEmail = jest.fn().mockResolvedValue('SKIPPED');
  const sendSms = jest.fn().mockResolvedValue('SKIPPED');
  const createdTenants: string[] = [];

  interface Side {
    tenantId: string;
    /** OPERATIONAL_COMPLETENESS, STAFF kademesinde, takip tarihi geçmiş → işlenince MANAGER'a ilerler. */
    escalationTaskId: string;
    /** 12 saat içinde vadesi gelen PENDING görev → status.upcomingTasks sayımına girer. */
    upcomingTaskId: string;
    user: { id: string; email: string };
    admin: { id: string; email: string };
    viewer: { id: string; email: string };
    /** J-26: ELEVATED aktör — USER rolü + PARTNER avukat kartı (isApproverEligible=true). */
    partner: { id: string; email: string };
  }
  let A: Side;
  let B: Side;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL as string } } });
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    const audit = new AuditService(prismaService);
    const officeApproval = new OfficeApprovalService(prismaService, audit);
    const notifier = { sendEmail, sendSms } as unknown as TenantNotifier;
    const reporter = { report: async () => undefined } as unknown as IntegrationErrorReporter;
    escalation = new OperationalEscalationService(prismaService, notifier, reporter, officeApproval); // J-26: gerçek eşik
    const scheduler = new SchedulerService(
      prismaService,
      { record: () => undefined } as unknown as SchedulerMetricsService,
      {} as unknown as TebligatService,
      reporter,
      new CaseDebtorLifecycleGuardService(prismaService),
      officeApproval,
    );

    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [EscalationController, SchedulerController],
      providers: [
        AuthService, JwtStrategy, JwtAuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OperationalEscalationService, useValue: escalation },
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

  beforeEach(() => {
    sendEmail.mockClear();
    sendSms.mockClear();
  });

  async function seedSide(label: string): Promise<Side> {
    const sfx = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `KI019 ${label} ${sfx}`, slug: `ki019-${label}-${sfx}` }, select: { id: true } });
    createdTenants.push(tenant.id);
    await prisma.office.create({ data: { tenantId: tenant.id, name: `Ofis ${label} ${sfx}` } });
    const mk = async (name: string, role: UserRole = 'USER') => prisma.user.create({
      data: { tenantId: tenant.id, email: `${name}-${sfx}@example.test`, name, surname: label, role, passwordHash: 'x'.repeat(20) },
      select: { id: true, email: true },
    });
    const user = await mk('user');
    const admin = await mk('admin', 'ADMIN');
    const viewer = await mk('viewer', 'VIEWER');
    // J-26 (ELEVATED): manuel tetik için PARTNER kartlı USER; kartsız USER/ADMIN artık tetikleyemez (KABUL-5).
    const partner = await mk('partner');
    await prisma.lawyer.create({ data: { tenantId: tenant.id, userId: partner.id, name: 'Partner', surname: label, lawyerRank: 'PARTNER' } });
    const escalationTask = await prisma.task.create({
      data: {
        tenantId: tenant.id,
        title: `Eskalasyon görevi ${label}`,
        taskCategory: 'OPERATIONAL_COMPLETENESS',
        status: 'PENDING',
        escalationLevel: 'STAFF',
        createdAt: new Date(Date.now() - 10 * DAY),
        nextFollowUpAt: new Date(Date.now() - 1 * DAY),
      },
      select: { id: true },
    });
    const upcomingTask = await prisma.task.create({
      data: {
        tenantId: tenant.id,
        title: `Yaklaşan görev ${label}`,
        status: 'PENDING',
        dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    return { tenantId: tenant.id, escalationTaskId: escalationTask.id, upcomingTaskId: upcomingTask.id, user, admin, viewer, partner };
  }

  function bearer(user: { id: string; email: string }, tenantId: string, role: string): string {
    return `Bearer ${jwt.sign({ sub: user.id, tenantId, email: user.email, role, tokenVersion: 0 })}`;
  }

  const taskState = async (id: string) =>
    (await prisma.task.findUniqueOrThrow({ where: { id }, select: { escalationLevel: true, updatedAt: true } }));
  const eventCount = (tenantId: string, taskId: string) => prisma.escalationEvent.count({ where: { tenantId, taskId } });

  async function fresh(): Promise<void> { A = await seedSide('a'); B = await seedSide('b'); }

  it('KABUL-1: A\'nın ELEVATED aktörünün (PARTNER kartlı USER) POST /escalation/run çağrısı YALNIZ A görevini işler; B DOKUNULMAZ; gönderim 0', async () => {
    await fresh();
    const bBefore = await taskState(B.escalationTaskId);
    const res = await request(app.getHttpServer())
      .post('/api/escalation/run')
      .set('Authorization', bearer(A.partner, A.tenantId, 'USER'));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ processed: 1, notified: 0, skipped: 1, failed: 0 }); // B sayılmadı
    // A: STAFF → MANAGER ilerledi, append-only iz yazıldı
    expect((await taskState(A.escalationTaskId)).escalationLevel).toBe('MANAGER');
    expect(await eventCount(A.tenantId, A.escalationTaskId)).toBeGreaterThanOrEqual(1);
    // B: hiçbir yazma yok
    const bAfter = await taskState(B.escalationTaskId);
    expect(bAfter.escalationLevel).toBe('STAFF');
    expect(bAfter.updatedAt.getTime()).toBe(bBefore.updatedAt.getTime());
    expect(await eventCount(B.tenantId, B.escalationTaskId)).toBe(0);
    // Dış gönderim yok
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('KABUL-1 (simetri): B\'nin ELEVATED aktörü yalnız B\'yi işler; A DOKUNULMAZ', async () => {
    await fresh();
    const res = await request(app.getHttpServer())
      .post('/api/escalation/run')
      .set('Authorization', bearer(B.partner, B.tenantId, 'USER'));
    expect(res.status).toBe(201);
    expect(res.body.processed).toBe(1);
    expect((await taskState(B.escalationTaskId)).escalationLevel).toBe('MANAGER');
    expect((await taskState(A.escalationTaskId)).escalationLevel).toBe('STAFF');
    expect(await eventCount(A.tenantId, A.escalationTaskId)).toBe(0);
  });

  it('KABUL-5 (J-26 ELEVATED): kartsız USER ve kartsız ADMIN → 403 ESCALATION_MANUAL_RUN_DENIED_NOT_ELEVATED; hiçbir kiracıda yazma yok, gönderim 0', async () => {
    await fresh();
    for (const [actor, role] of [[A.user, 'USER'], [A.admin, 'ADMIN']] as const) {
      const res = await request(app.getHttpServer())
        .post('/api/escalation/run')
        .set('Authorization', bearer(actor, A.tenantId, role));
      expect(res.status).toBe(403);
      expect(res.body?.reasonCode ?? res.body?.message?.reasonCode).toBe('ESCALATION_MANUAL_RUN_DENIED_NOT_ELEVATED');
    }
    expect((await taskState(A.escalationTaskId)).escalationLevel).toBe('STAFF');
    expect((await taskState(B.escalationTaskId)).escalationLevel).toBe('STAFF');
    expect(await eventCount(A.tenantId, A.escalationTaskId)).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('KABUL-2: VIEWER → 403 VIEWER_WRITE_DENIED; hiçbir kiracıda yazma yok. JWT yok → 401', async () => {
    await fresh();
    const denied = await request(app.getHttpServer())
      .post('/api/escalation/run')
      .set('Authorization', bearer(A.viewer, A.tenantId, 'VIEWER'));
    expect(denied.status).toBe(403);
    expect(denied.body?.code ?? denied.body?.message?.code).toBe('VIEWER_WRITE_DENIED');
    expect((await taskState(A.escalationTaskId)).escalationLevel).toBe('STAFF');
    expect((await taskState(B.escalationTaskId)).escalationLevel).toBe('STAFF');
    expect(await eventCount(A.tenantId, A.escalationTaskId)).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();

    const anon = await request(app.getHttpServer()).post('/api/escalation/run');
    expect(anon.status).toBe(401);
  });

  it('KABUL-3: GET /scheduler/status yalnız aktörün kiracısını sayar (A→1, B→1; global 2 DEĞİL); VIEWER okuyabilir', async () => {
    await fresh();
    const a = await request(app.getHttpServer())
      .get('/api/scheduler/status')
      .set('Authorization', bearer(A.user, A.tenantId, 'USER'));
    expect(a.status).toBe(200);
    expect(a.body.upcomingTasks).toBe(1);
    const b = await request(app.getHttpServer())
      .get('/api/scheduler/status')
      .set('Authorization', bearer(B.viewer, B.tenantId, 'VIEWER'));
    expect(b.status).toBe(200);
    expect(b.body.upcomingTasks).toBe(1);
    // A'da ikinci yaklaşan görev → yalnız A'nın sayımı değişir
    await prisma.task.create({ data: { tenantId: A.tenantId, title: 'İkinci yaklaşan', status: 'PENDING', dueDate: new Date(Date.now() + 6 * 60 * 60 * 1000) } });
    const a2 = await request(app.getHttpServer()).get('/api/scheduler/status').set('Authorization', bearer(A.admin, A.tenantId, 'ADMIN'));
    const b2 = await request(app.getHttpServer()).get('/api/scheduler/status').set('Authorization', bearer(B.user, B.tenantId, 'USER'));
    expect(a2.body.upcomingTasks).toBe(2);
    expect(b2.body.upcomingTasks).toBe(1);
    const anon = await request(app.getHttpServer()).get('/api/scheduler/status');
    expect(anon.status).toBe(401);
  });

  it('KABUL-4: cron giriş noktası (parametresiz processEscalations) GLOBAL kapsamı KORUR: A ve B birlikte işlenir', async () => {
    await fresh();
    const res = await escalation.processEscalations();
    expect(res.processed).toBeGreaterThanOrEqual(2); // bu testin A+B görevleri (önceki testlerin artıkları da dahil olabilir)
    expect((await taskState(A.escalationTaskId)).escalationLevel).toBe('MANAGER');
    expect((await taskState(B.escalationTaskId)).escalationLevel).toBe('MANAGER');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });
});
