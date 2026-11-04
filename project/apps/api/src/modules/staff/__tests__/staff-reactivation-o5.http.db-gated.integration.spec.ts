import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditModule } from '../../audit/audit.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StaffModule } from '../staff.module';

/**
 * O-5 (owner 05.11.2026, C politikası) — pasif personelin yeniden etkinleştirilmesi.
 * GERÇEK HTTP + gerçek F01 kapısı + disposable PostgreSQL; yarış GERÇEK ayrı transaction'larla.
 *
 * Kurallar:
 *  - POST /staff aynı kimlikle PASİF karta denk gelirse YAZIM YOK: 409 STAFF_REACTIVATION_REVIEW (eski izinler + etki).
 *  - POST /staff/:id/reactivate: F01 kapısı; izinler yalnız gövdeden; koşullu güncelleme + STAFF_REACTIVATE aynı transaction.
 *  - Bağlı giriş hesabı, rolü, büro geneli grantler (PermissionGrant), dosya atamaları (CaseStaff) ve dosya sorumluluğu DEĞİŞMEZ.
 *  - Eşzamanlı iki istekte tek güncelleme / tek denetim; denetim yazılamazsa yeniden etkinleştirme geri alınır.
 *
 * Bu test düzeltmesiz kodla düşer: POST /staff pasif kartı 201 ile sessizce açar ve eski izinleri geri getirir;
 * /reactivate ucu yoktur (404). Sentetik kişiler gerçek kişi değildir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('STAFF-REACTIVATION-O5 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

/** Yöneticinin onay ekranında seçtiği DAR izin kümesi (eski kart geniş izinliydi). */
const SECIM = {
  staffType: 'SEKRETER',
  canCreateCase: false, canEditCase: false, canGenerateDocuments: true, canApproveDocuments: false,
  canSeeFinance: false, canApproveFinance: false, canPrepareCollectionDisposition: false, canSendNotifications: false,
  isDefaultForNewCases: false,
};
const IZIN_ALANLARI = Object.keys(SECIM) as Array<keyof typeof SECIM>;

describeWithDisposableDb('O-5 personel yeniden etkinleştirme — gözden geçirme, yetki, yarış (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  const suffix = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let seq = 0;

  const as = (key: string) => ({ 'x-test-user-id': ids[key] });
  const reactivate = (key: string, staffId: string, body: Record<string, unknown> = SECIM) =>
    request(app.getHttpServer()).post(`/staff/${staffId}/reactivate`).set(as(key)).send(body);

  /** Etkin hesaplı, geniş izinli, dosyaya atanmış ve büro geneli grant'i olan personel; GERÇEK DELETE ile pasifleştirilir. */
  const pasifPersonel = async () => {
    seq++;
    const email = `o5-hedef-${seq}-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: { tenantId, email, name: 'Hedef', surname: `O5-${seq}`, role: 'USER', passwordHash: 'sentetik-hash', isActive: true },
    });
    const staff = await prisma.staffMember.create({
      data: {
        tenantId, userId: user.id, firstName: 'Hedef', lastName: `O5-${seq}`, email, staffType: 'MUHASEBE',
        canCreateCase: true, canEditCase: true, canGenerateDocuments: true, canApproveDocuments: true, canSeeFinance: true,
        canApproveFinance: true, canPrepareCollectionDisposition: true, canSendNotifications: true, isDefaultForNewCases: true,
      },
    });
    const grant = await prisma.permissionGrant.create({
      data: { tenantId, subjectUserId: user.id, permissionKey: 'o5.test.buro-geneli', effect: 'ALLOW', scope: 'TEAM', reason: 'O-5 sentetik' },
    });
    const kase = await prisma.case.create({
      data: { tenantId, fileNumber: `O5-${seq}-${suffix}`, type: 'GENERAL_EXECUTION', responsibleStaffId: staff.id },
    });
    await prisma.caseStaff.create({ data: { caseId: kase.id, staffMemberId: staff.id, roleOnCase: 'MUHASEBE', canEdit: true, canApprove: true } });
    const del = await request(app.getHttpServer()).delete(`/staff/${staff.id}`).set(as('ADMIN'));
    expect(del.status).toBe(200);
    return { staffId: staff.id, userId: user.id, grantId: grant.id, caseId: kase.id, email };
  };

  /** Kart + bağlı hesap + grant + dosya ataması + sorumluluk + denetim — karşılaştırılabilir anlık görüntü. */
  const snapshot = async (t: { staffId: string; userId: string; caseId: string }) => {
    const staff = await prisma.staffMember.findUniqueOrThrow({ where: { id: t.staffId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: t.userId }, select: { isActive: true, role: true, passwordHash: true } });
    const grants = await prisma.permissionGrant.findMany({ where: { subjectUserId: t.userId }, orderBy: { id: 'asc' } });
    const assignments = await prisma.caseStaff.findMany({ where: { staffMemberId: t.staffId }, orderBy: { id: 'asc' } });
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: t.caseId }, select: { responsibleStaffId: true } });
    const audits = await prisma.auditLog.findMany({ where: { tenantId, entityId: t.staffId, action: 'STAFF_REACTIVATE' } });
    return { staff, user, grants, assignments, responsibleStaffId: kase.responsibleStaffId, audits };
  };
  const hesapGrantAtama = (s: Awaited<ReturnType<typeof snapshot>>) => ({
    user: s.user, grants: s.grants, assignments: s.assignments, responsibleStaffId: s.responsibleStaffId,
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PrismaModule, AuditModule, StaffModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    // Uygulama kendi portunda dinler (supertest sunucuyu sahiplenmez): eşzamanlı istekte Linux ECONNRESET önlemi.
    await app.listen(0, '127.0.0.1');

    tenantId = `test-ci-o5-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI O5', slug: tenantId } });
    await prisma.office.create({ data: { tenantId, name: 'CI O5 Bürosu' } });
    ids.ADMIN = (await prisma.user.create({ data: { tenantId, email: `o5-admin-${suffix}@example.test`, name: 'Yonetici', surname: 'O5', role: 'ADMIN' } })).id;
    ids.ADMIN_IKI = (await prisma.user.create({ data: { tenantId, email: `o5-admin2-${suffix}@example.test`, name: 'Yonetici2', surname: 'O5', role: 'ADMIN' } })).id;
    const yetkisiz = await prisma.user.create({ data: { tenantId, email: `o5-personel-${suffix}@example.test`, name: 'Personel', surname: 'O5', role: 'USER' } });
    await prisma.staffMember.create({ data: { tenantId, userId: yetkisiz.id, firstName: 'Personel', lastName: 'O5', staffType: 'SEKRETER' } });
    ids.YETKISIZ = yetkisiz.id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('aynı e-postayla POST /staff: YAZIMSIZ 409 STAFF_REACTIVATION_REVIEW; eski izinler ve gerçek etki gösterilir', async () => {
    const t = await pasifPersonel();
    const before = await snapshot(t);
    expect(before.user.isActive).toBe(false); // gerçek DELETE bağlı hesabı kapattı

    const res = await request(app.getHttpServer()).post('/staff').set(as('ADMIN'))
      .send({ firstName: 'Hedef', lastName: 'Yeni', email: t.email, staffType: 'DIGER', canSeeFinance: false, isDefaultForNewCases: false });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STAFF_REACTIVATION_REVIEW');
    expect(res.body.staff).toMatchObject({
      id: t.staffId, staffType: 'MUHASEBE', canSeeFinance: true, canPrepareCollectionDisposition: true, isDefaultForNewCases: true,
      linkedAccount: { exists: true, isActive: false }, caseAssignmentCount: 1, responsibleCaseCount: 1,
    });
    expect(res.body.staff).not.toHaveProperty('email');
    expect(res.body.staff).not.toHaveProperty('tckn');
    expect(await snapshot(t)).toEqual(before);
    expect(await prisma.staffMember.count({ where: { tenantId, email: t.email } })).toBe(1);
  });

  it('F01 yetkisi olmayan aktör 403; hiçbir şey yazılmaz', async () => {
    const t = await pasifPersonel();
    const before = await snapshot(t);
    const res = await reactivate('YETKISIZ', t.staffId);
    expect(res.status).toBe(403);
    expect(String(res.body.message)).toContain('OFFICE_F01_AUTHORIZATION_REQUIRED');
    expect(await snapshot(t)).toEqual(before);
  });

  it('eksik / fazladan alanlı gövde 400; hiçbir şey yazılmaz', async () => {
    const t = await pasifPersonel();
    const before = await snapshot(t);
    const { canSeeFinance: _drop, ...eksik } = SECIM;
    expect((await reactivate('ADMIN', t.staffId, eksik)).status).toBe(400);
    expect((await reactivate('ADMIN', t.staffId, { ...SECIM, isActive: true })).status).toBe(400);
    expect((await reactivate('ADMIN', t.staffId, { ...SECIM, userId: ids.ADMIN })).status).toBe(400);
    expect(await snapshot(t)).toEqual(before);
  });

  it('yetkili: SEÇİLEN izinler yazılır; hesap, rol, grant, dosya ataması ve sorumluluk DEĞİŞMEZ; TEK denetim', async () => {
    const t = await pasifPersonel();
    const before = await snapshot(t);

    const res = await reactivate('ADMIN', t.staffId);

    expect(res.status).toBe(201);
    expect(res.body.data.linkedAccount).toEqual({ exists: true, isActive: false });
    expect(res.body.data).toMatchObject({ caseAssignmentCount: 1, responsibleCaseCount: 1 });
    const after = await snapshot(t);
    expect(after.staff.isActive).toBe(true);
    for (const k of IZIN_ALANLARI) expect({ [k]: (after.staff as any)[k] }).toEqual({ [k]: (SECIM as any)[k] });
    expect({ ad: after.staff.firstName, email: after.staff.email, userId: after.staff.userId })
      .toEqual({ ad: before.staff.firstName, email: before.staff.email, userId: before.staff.userId });
    expect(hesapGrantAtama(after)).toEqual(hesapGrantAtama(before));
    expect(after.audits).toHaveLength(1);
    expect(after.audits[0]).toMatchObject({
      userId: ids.ADMIN, actorType: 'USER', decisionResult: 'SUCCESS', reasonCode: 'OFFICE_F01_AUTHORIZED',
      oldValues: expect.objectContaining({ isActive: false, canSeeFinance: true, isDefaultForNewCases: true }),
      newValues: expect.objectContaining({ isActive: true, canSeeFinance: false, isDefaultForNewCases: false, staffType: 'SEKRETER' }),
      metadata: expect.objectContaining({ linkedUserAccountChanged: false, linkedUserAccountActive: false }),
    });

    // Tekrar istek etkin karta yazmaz.
    const again = await reactivate('ADMIN', t.staffId);
    expect({ status: again.status, code: again.body?.code }).toEqual({ status: 409, code: 'STAFF_ALREADY_ACTIVE' });
    expect((await snapshot(t)).audits).toHaveLength(1);
  });

  describe('eşzamanlılık — GERÇEK ayrı transaction\'lar', () => {
    /**
     * Engel: test kendi transaction'ında personel satırını FOR UPDATE ile tutar; iki HTTP isteği bu sırada ön okumayı
     * bitirip koşullu güncellemede kilit bekler (pg_stat_activity ile ölçülür → çakışma gerçek). Engel kalkınca biri kazanır.
     */
    it('iki yetkili aynı anda → TEK güncelleme, TEK denetim; kaybeden 409 STAFF_REACTIVATION_CONFLICT ve yazım üretmez', async () => {
      const t = await pasifPersonel();
      const before = await snapshot(t);
      const SECIM_IKI = { ...SECIM, staffType: 'ARSIV', canSendNotifications: true };
      let release!: () => void;
      const released = new Promise<void>((r) => { release = r; });
      let locked!: () => void;
      const lockedNow = new Promise<void>((r) => { locked = r; });
      const holder = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "StaffMember" WHERE "id" = ${t.staffId} FOR UPDATE`;
        locked();
        await released;
      }, { timeout: 60_000, maxWait: 10_000 });
      await lockedNow;
      const pa = reactivate('ADMIN', t.staffId, SECIM).then((r) => r);
      const pb = reactivate('ADMIN_IKI', t.staffId, SECIM_IKI).then((r) => r);
      let waiting = 0;
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw<Array<{ n: number }>>`
          SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%"StaffMember"%'`;
        waiting = rows[0]?.n ?? 0;
        if (waiting >= 2) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      release();
      await holder;
      const [ra, rb] = await Promise.all([pa, pb]);

      expect(waiting).toBeGreaterThanOrEqual(2);
      expect([ra.status, rb.status].sort()).toEqual([201, 409]);
      const loser = ra.status === 201 ? rb : ra;
      expect(loser.body?.code).toBe('STAFF_REACTIVATION_CONFLICT');
      const winner = ra.status === 201 ? { by: ids.ADMIN, body: SECIM } : { by: ids.ADMIN_IKI, body: SECIM_IKI };
      const after = await snapshot(t);
      expect(after.audits).toHaveLength(1);
      expect(after.audits[0].userId).toBe(winner.by);
      for (const k of IZIN_ALANLARI) expect({ [k]: (after.staff as any)[k] }).toEqual({ [k]: (winner.body as any)[k] });
      expect(hesapGrantAtama(after)).toEqual(hesapGrantAtama(before));
    });
  });

  describe('atomiklik', () => {
    it('denetim yazımı başarısız olursa yeniden etkinleştirme GERİ ALINIR (güncelleme aynı transaction içindeydi)', async () => {
      const t = await pasifPersonel();
      const before = await snapshot(t);
      const service = app.get(PrismaService);
      const original = service.$transaction.bind(service) as (...args: unknown[]) => Promise<unknown>;
      let seenInsideTx: boolean | null = null;
      const spy = jest.spyOn(service, '$transaction').mockImplementation(((fn: unknown, opts?: unknown) => {
        if (typeof fn !== 'function') return original(fn, opts);
        return original(async (tx: Record<string, unknown>) => {
          const wrapped = new Proxy(tx, {
            get(target, prop) {
              // Yöntemler ASIL işlem istemcisine bağlanır; yalnız denetim yazımı değiştirilir.
              const value = Reflect.get(target, prop, target);
              if (prop !== 'auditLog') return typeof value === 'function' ? value.bind(target) : value;
              const real = value as { create: (args: { data: { action: string } }) => Promise<unknown> };
              return {
                ...real,
                create: async (args: { data: { action: string } }) => {
                  if (args?.data?.action !== 'STAFF_REACTIVATE') return real.create(args);
                  const inside = await (target.staffMember as { findUniqueOrThrow: (a: unknown) => Promise<{ isActive: boolean }> })
                    .findUniqueOrThrow({ where: { id: t.staffId } });
                  seenInsideTx = inside.isActive;
                  throw new Error('O-5 benzetim: denetim yazımı başarısız');
                },
              };
            },
          });
          return (fn as (w: unknown) => Promise<unknown>)(wrapped);
        }, opts);
      }) as never);
      try {
        const res = await reactivate('ADMIN', t.staffId);
        expect(res.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(seenInsideTx).toBe(true); // güncelleme transaction içinde gerçekten yapıldı …
      expect(await snapshot(t)).toEqual(before); // … ve geri alındı: kart, hesap, grant, atama, denetim aynı
      expect((await reactivate('ADMIN', t.staffId)).status).toBe(201); // sonraki temiz istek çalışır
    });
  });
});
