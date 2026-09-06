/**
 * F02 — MANUEL/GLOBAL CRON CAKISMASI: gercek PostgreSQL + gercek overlap guard (mock YOK).
 *
 * Kusur (duzeltme oncesi): manuel A calismasi `SchedulerService.processNafakaPeriods` jobId'sini
 * tutarken gelen global cron tick'i `SKIPPED_ALREADY_RUNNING` ile SESSIZCE atlaniyor; B'nin
 * donem borcu bir sonraki aylik tick'e kalıyordu. Ters sirada manuel cagri atlanip yine de
 * "tamamlandi" mesajiyla donuyordu.
 *
 * Bariyer: `prisma.case.findMany` GERCEK delegesi spy'lanir; hedef sorgu GERCEK sonucunu
 * dondurmeden once (guard zaten alinmisken) serbest birakilana kadar bekler. Sabit sleep YOK;
 * "guard alindi" kaniti `isJobCurrentlyRunning` ile, "ikinci cagri bekliyor mu" kaniti tek
 * event-loop yield'i sonrasi settle bayragiyla olculur.
 */
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { isJobCurrentlyRunning, resetOverlapGuardStateForTests } from '../../../common/scheduler-overlap-guard';
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

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (TEST_DATABASE_URL) {
  const target = new URL(TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('F02_OVERLAP_TEST_DATABASE_MUST_BE_LOCAL_POSTGRESQL');
  }
}
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('F02_OVERLAP_TEST_DATABASE_REQUIRED: CI requires TEST_DATABASE_URL');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;
const SECRET = 'f02-overlap-local-test-secret-at-least-32-bytes-long';
const JOB = 'SchedulerService.processNafakaPeriods';

interface Side { tenantId: string; caseId: string; partner: { id: string; email: string } }
type FindManyArgs = { where?: { subCategory?: string; tenantId?: string } };

describeWithDatabase('F02: manual/global cron overlap — real guard, real PostgreSQL, deterministic barriers', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaClient;
  let scheduler: SchedulerService;
  let errorReports: unknown[] = [];
  const createdTenants: string[] = [];

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
      { report: async (r: unknown) => { errorReports.push(r); } } as unknown as IntegrationErrorReporter,
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
  });

  afterAll(async () => {
    for (const tenantId of createdTenants) {
      await prisma.$executeRawUnsafe('DELETE FROM "Tenant" WHERE "id" = $1', tenantId).catch(() => undefined);
    }
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetOverlapGuardStateForTests();
    errorReports = [];
  });

  /** Her vaka KENDI A/B'sini kurar; vakalar birbirinin verisine DAYANMAZ. */
  async function seedSide(label: string): Promise<Side> {
    const sfx = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `F02O ${label} ${sfx}`, slug: `f02o-${label}-${sfx}` }, select: { id: true } });
    createdTenants.push(tenant.id);
    const partner = await prisma.user.create({
      data: { tenantId: tenant.id, email: `partner-${label}-${sfx}@example.test`, name: 'Partner', surname: label, role: 'USER' as UserRole, passwordHash: 'x'.repeat(20) },
      select: { id: true, email: true },
    });
    await prisma.lawyer.create({ data: { tenantId: tenant.id, userId: partner.id, name: 'Partner', surname: label, lawyerRank: 'PARTNER' } });
    const kase = await prisma.case.create({
      data: { tenantId: tenant.id, fileNumber: `F02O-${label}-${sfx}`, type: 'GENERAL_EXECUTION', subCategory: 'NAFAKA', metadata: { monthlyNafaka: 1000 } },
      select: { id: true },
    });
    return { tenantId: tenant.id, caseId: kase.id, partner };
  }

  const dueCount = (caseId: string) => prisma.due.count({ where: { caseId, type: 'NAFAKA' } });
  const logCount = (caseId: string) => prisma.decisionLog.count({ where: { caseId } });
  const yieldOnce = () => new Promise<void>((r) => setImmediate(r));

  /**
   * Kosul saglanana kadar event-loop'a yield eder ve saglaninca ANINDA doner (sabit sleep degil).
   * Sinir iterasyon sayisi DEGIL, guvenlik deadline'idir: kosul senkron oldugundan sabit sayida
   * yield mikrosaniyelerde tukenir, oysa aradaki gercek DB gidis-donusleri (ornegin yetki
   * kontrolunun user sorgusu) daha uzun surer. Deadline asilirsa canli durumla hata verir.
   */
  const seenWheres: unknown[] = [];
  async function waitUntil(cond: () => boolean, what: string, state?: () => string): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) { if (cond()) return; await yieldOnce(); }
    throw new Error(`BEKLENEN DURUM OLUSMADI: ${what} | state=${state?.() ?? '-'} | seenWheres=${JSON.stringify(seenWheres)}`);
  }

  /**
   * Bariyer: `select(where)` ile eslesen ILK nafaka sorgusu, GERCEK sonucunu aldiktan sonra
   * `release` cagrilana kadar donmez. Guard bu noktada zaten tutuluyor (findMany fn icinde).
   * `fail` verilirse hedef sorgu gercek sonuc yerine REDDEDER (hata yolu).
   */
  function armBarrier(select: (where: FindManyArgs['where']) => boolean, opts: { fail?: Error } = {}) {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    let hit = false;
    const delegate = prisma.case;
    const original = delegate.findMany.bind(delegate);
    // Cast: Prisma delegesinin PrismaPromise donus tipi ile jest mockImplementation imzasi uyusmaz;
    // davranis GERCEK delegeye (original) delege edildiginden tip daraltmasi guvenlidir.
    const spy = jest.spyOn(delegate, 'findMany').mockImplementation((async (args?: unknown) => {
      const a = (args ?? {}) as FindManyArgs;
      seenWheres.push(a.where);
      const isNafaka = a.where?.subCategory === 'NAFAKA';
      if (isNafaka && !hit && select(a.where)) {
        hit = true;
        if (opts.fail) { await held; throw opts.fail; }
        const rows = await original(args as never);
        await held;
        return rows;
      }
      return original(args as never);
    }) as never);
    return { release, spy, wasHit: () => hit };
  }

  const actor = (s: Side) => ({ userId: s.partner.id, tenantId: s.tenantId, role: 'USER' } as never);

  it('REG-1: manuel A guard\'i tutarken gelen GLOBAL cron tick\'i KAYBOLMAZ — bekler, A bitince B\'yi isler; cift etki yok', async () => {
    const A = await seedSide('a'); const B = await seedSide('b');
    const barrier = armBarrier((w) => w?.tenantId === A.tenantId); // manuel A'nin sorgusu
    try {
      const manual = scheduler.runManual('nafaka', actor(A));
      await waitUntil(() => barrier.wasHit() && isJobCurrentlyRunning(JOB), 'manuel A guard altinda bariyerde');

      let globalSettledWhileManualHeld = false;
      const global = scheduler.processNafakaPeriods().then((r) => { globalSettledWhileManualHeld = true; return r; }); // cron girisi, kapsamsiz
      await yieldOnce(); await yieldOnce();
      expect(await dueCount(B.caseId)).toBe(0); // manuel tutarken B'ye henuz dokunulmadi (her iki kodda)
      const settledWhileHeld = globalSettledWhileManualHeld; // bariyer ACIKKEN ornekle (sonra her zaman true olur)

      barrier.release();
      const [manualRes, globalRes] = await Promise.all([manual, global]);

      // ANA KANIT (owner sarti): manuel calisma bitince B ISLENMIS olmali. Duzeltme oncesi kodda
      // global tick SKIPPED ile atlandigi icin burada 0 kalir → "B'nin isi kayboldu".
      expect(await dueCount(B.caseId)).toBe(1);
      expect(await dueCount(A.caseId)).toBe(1);   // manuel A yazdi
      // Duzeltme oncesi: global manuel tutarken ANINDA settle olurdu (SKIPPED); duzeltmeyle BEKLEDI.
      expect(settledWhileHeld).toBe(false);
      expect((manualRes as { outcome?: string }).outcome).toBe('RAN');
      expect(globalRes).toBe('RAN_AFTER_WAIT'); // global is ATLANMADI, sirasi gelince calisti
    } finally { barrier.spy.mockRestore(); }

    expect(await logCount(A.caseId)).toBe(1);   // ayni donem icin CIFT etki YOK (global A'yi tekrar yazmadi)
    expect(await logCount(B.caseId)).toBe(1);
    expect(isJobCurrentlyRunning(JOB)).toBe(false); // kuyruk temiz
  });

  it('REG-2 (ters sira): GLOBAL guard\'i tutarken gelen manuel A ATLANMAZ ve "tamamlandi" diye yalan soylemez — bekler, sonra idempotent calisir', async () => {
    const A = await seedSide('a'); const B = await seedSide('b');
    const barrier = armBarrier((w) => w?.tenantId === undefined); // global (kapsamsiz) sorgu
    try {
      const global = scheduler.processNafakaPeriods();
      await waitUntil(() => barrier.wasHit() && isJobCurrentlyRunning(JOB), 'global guard altinda bariyerde');

      let manualSettled = false;
      const manual = scheduler.runManual('nafaka', actor(A)).then((r) => { manualSettled = true; return r; });
      await yieldOnce(); await yieldOnce();
      expect(manualSettled).toBe(false); // duzeltme oncesi: aninda "tamamlandi" (SKIPPED gizli)

      barrier.release();
      const [globalRes, manualRes] = await Promise.all([global, manual]);
      expect(globalRes).toBe('RAN');
      expect((manualRes as { outcome?: string }).outcome).toBe('RAN_AFTER_WAIT'); // atlanan is "tamamlandi" DEGIL
    } finally { barrier.spy.mockRestore(); }

    expect(await dueCount(A.caseId)).toBe(1); // global yazdi; manuel A sonra kostu ama TEKRAR YAZMADI
    expect(await dueCount(B.caseId)).toBe(1);
    expect(await logCount(A.caseId)).toBe(1);
    expect(isJobCurrentlyRunning(JOB)).toBe(false);
  });

  it('REG-3 (hata yolu): oncul manuel calisma HATA ile biterse bekleyen global yine calisir; kuyruk/guard temiz kalir', async () => {
    const A = await seedSide('a'); const B = await seedSide('b');
    const barrier = armBarrier((w) => w?.tenantId === A.tenantId, { fail: new Error('simule DB hatasi') });
    try {
      const manual = scheduler.runManual('nafaka', actor(A));
      let manualErr: unknown = null; manual.catch((e) => { manualErr = e; });
      await waitUntil(() => barrier.wasHit() && isJobCurrentlyRunning(JOB), 'manuel A guard altinda (hata enjekte)',
        () => `hit=${barrier.wasHit()} running=${isJobCurrentlyRunning(JOB)} manualErr=${String((manualErr as Error)?.message ?? manualErr)}`);
      const global = scheduler.processNafakaPeriods();
      barrier.release();
      const [manualRes, globalRes] = await Promise.all([manual, global]);
      // Job kendi hatasini raporlar (reportCronError) ve guard'i serbest birakir; bekleyen SIRASINI ALIR.
      expect((manualRes as { outcome?: string }).outcome).toBe('RAN');
      expect(globalRes).toBe('RAN_AFTER_WAIT');
    } finally { barrier.spy.mockRestore(); }

    expect(errorReports.length).toBeGreaterThanOrEqual(1); // hata GORUNUR, yutulmadi
    expect(await dueCount(A.caseId)).toBe(1); // global A'yi da isledi (manuel A basarisizdi)
    expect(await dueCount(B.caseId)).toBe(1);
    expect(isJobCurrentlyRunning(JOB)).toBe(false); // hata sonrasi stuck kuyruk YOK
  });
});
