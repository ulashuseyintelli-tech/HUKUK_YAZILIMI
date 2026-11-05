import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditModule } from '../../audit/audit.module';
import { AuthService } from '../../auth/auth.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { WorkScopePermissionService } from '../../work-scope-permission/work-scope-permission.service';
import { StaffModule } from '../staff.module';

/**
 * O-5b (owner 05.11.2026, A politikası) — yeniden etkinleştirilmiş personelin KAPALI giriş hesabını açma.
 * GERÇEK HTTP + GERÇEK JWT doğrulaması (JwtStrategy → AuthService.validateUser) + gerçek F01 kapısı + disposable PostgreSQL;
 * yarış ve kilit sırası GERÇEK ayrı transaction'larla.
 *
 * Kurallar:
 *  - GET /staff/:id/account-reopen-review ve POST /staff/:id/account-reopen: F01 kapısı + GÜNCEL DB rolü ADMIN.
 *  - Hesap açma, tokenVersion artışı, açık sıfırlama belirteçlerinin iptali, seçilmeyen F02 GLOBAL ALLOW kayıtlarının
 *    (ileri tarihliler dahil) sona ermesi ve denetimler TEK transaction'da; DENY, F02 dışı ve GLOBAL olmayan izinler korunur.
 *  - Onay incelemenin içerik parmak izine bağlı: kimlik listesi aynıyken süre değişse bile 409.
 *  - Pasifleştirmeden önce verilmiş JWT hesap açıldıktan sonra da 401; yeni giriş geçerli.
 *
 * Bu test düzeltmesiz kodla düşer: uçlar yoktur (404). Sentetik kişiler gerçek kişi değildir; parolalar sentetiktir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('STAFF-ACCOUNT-REOPEN-O5B DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
// ConfigService process.env'i önce okur: CI'da JWT_SECRET tanımlıysa imza ve doğrulama AYNI değeri kullansın.
const JWT_SECRET = process.env.JWT_SECRET || `o5b-test-${randomUUID()}`;
const PAROLA = 'Sentetik-O5b-Parola-1';
const TASKS = 'office.tasks.view_all';
const EXPENSES = 'office.expenses.view_all';
const DAY = 86_400_000;

/** O-5 yeniden etkinleştirmesinde yöneticinin seçtiği izinler (kart izinleri O-5b'de DEĞİŞMEZ). */
const SECIM = {
  staffType: 'SEKRETER',
  canCreateCase: false, canEditCase: false, canGenerateDocuments: true, canApproveDocuments: false,
  canSeeFinance: false, canApproveFinance: false, canPrepareCollectionDisposition: false, canSendNotifications: false,
  isDefaultForNewCases: false,
};

describeWithDisposableDb('O-5b kapalı giriş hesabını açma — yetki, tek transaction, eski JWT, yarış (HTTP + gerçek JWT + disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let jwt: JwtService;
  let auth: AuthService;
  let tenantId: string;
  let tenantSlug: string;
  let passwordHash: string;
  const suffix = randomUUID().slice(0, 8);
  const actors: Record<string, string> = {};
  let seq = 0;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tokenFor = async (userId: string) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return jwt.sign({ sub: u.id, tenantId: u.tenantId, email: u.email, role: u.role, tokenVersion: u.tokenVersion });
  };
  const as = async (key: string) => bearer(await tokenFor(actors[key]));
  const review = async (key: string, staffId: string) =>
    request(server()).get(`/staff/${staffId}/account-reopen-review`).set(await as(key));
  const reopen = async (key: string, staffId: string, body: Record<string, unknown>) =>
    request(server()).post(`/staff/${staffId}/account-reopen`).set(await as(key)).send(body);

  type Hedef = Awaited<ReturnType<typeof hedef>>;

  /**
   * Etkin hesaplı personel; büro geneli izinler (görev ALLOW, masraf ALLOW, ileri tarihli görev ALLOW, masraf DENY,
   * GLOBAL olmayan görev ALLOW, F02 dışı ALLOW), açık + tüketilmiş sıfırlama belirteci, dosya ataması.
   * GERÇEK girişle belirteç alınır; GERÇEK DELETE ile pasifleştirilir; GERÇEK O-5 ile kart yeniden etkinleştirilir (hesap kapalı).
   */
  const hedef = async (opts: { reactivate?: boolean } = {}) => {
    seq++;
    const email = `o5b-hedef-${seq}-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: { tenantId, email, name: 'Hedef', surname: `O5b-${seq}`, role: 'USER', passwordHash, isActive: true },
    });
    const staff = await prisma.staffMember.create({
      data: { tenantId, userId: user.id, firstName: 'Hedef', lastName: `O5b-${seq}`, email, staffType: 'MUHASEBE', canSeeFinance: true },
    });
    const g = (permissionKey: string, effect: 'ALLOW' | 'DENY', extra: Record<string, unknown> = {}) =>
      prisma.permissionGrant.create({
        data: { tenantId, subjectUserId: user.id, permissionKey, effect, scope: 'GLOBAL', grantedByUserId: actors.ADMIN, reason: 'O-5b sentetik', ...extra },
      });
    const gorev = await g(TASKS, 'ALLOW');
    const masraf = await g(EXPENSES, 'ALLOW');
    const ileri = await g(TASKS, 'ALLOW', { validFrom: new Date(Date.now() + 30 * DAY) });
    const ret = await g(EXPENSES, 'DENY');
    const takim = await g(TASKS, 'ALLOW', { scope: 'TEAM' });
    const f02Disi = await g('o5b.test.f02-disi', 'ALLOW');
    const acikBelirtec = await prisma.passwordResetToken.create({
      data: { tenantId, userId: user.id, tokenHash: `o5b-acik-${seq}-${suffix}`, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const tuketilmis = await prisma.passwordResetToken.create({
      data: { tenantId, userId: user.id, tokenHash: `o5b-tuketilmis-${seq}-${suffix}`, expiresAt: new Date(Date.now() + 3_600_000), consumedAt: new Date() },
    });
    const kase = await prisma.case.create({ data: { tenantId, fileNumber: `O5B-${seq}-${suffix}`, type: 'GENERAL_EXECUTION' } });
    await prisma.caseStaff.create({ data: { caseId: kase.id, staffMemberId: staff.id, roleOnCase: 'MUHASEBE', canEdit: true } });

    const login = await auth.login({ email, password: PAROLA, tenantSlug });
    const del = await request(server()).delete(`/staff/${staff.id}`).set(await as('ADMIN'));
    expect(del.status).toBe(200);
    if (opts.reactivate !== false) {
      const re = await request(server()).post(`/staff/${staff.id}/reactivate`).set(await as('ADMIN')).send(SECIM);
      expect(re.status).toBe(201);
      expect(re.body.data.linkedAccount).toEqual({ exists: true, isActive: false });
    }
    return {
      staffId: staff.id, userId: user.id, email, eskiToken: login.token,
      grant: { gorev: gorev.id, masraf: masraf.id, ileri: ileri.id, ret: ret.id, takim: takim.id, f02Disi: f02Disi.id },
      belirtec: { acik: acikBelirtec.id, tuketilmis: tuketilmis.id },
    };
  };

  /** Hesap + bütün izinler + belirteçler + kart + dosya ataması + denetim — karşılaştırılabilir anlık görüntü. */
  const snapshot = async (t: Hedef) => ({
    user: await prisma.user.findUniqueOrThrow({ where: { id: t.userId }, select: { isActive: true, tokenVersion: true, role: true, passwordHash: true, email: true } }),
    grants: await prisma.permissionGrant.findMany({ where: { subjectUserId: t.userId }, orderBy: { id: 'asc' } }),
    tokens: await prisma.passwordResetToken.findMany({ where: { userId: t.userId }, orderBy: { id: 'asc' }, select: { id: true, revokedAt: true, consumedAt: true } }),
    staff: await prisma.staffMember.findUniqueOrThrow({ where: { id: t.staffId } }),
    assignments: await prisma.caseStaff.findMany({ where: { staffMemberId: t.staffId }, orderBy: { id: 'asc' } }),
    reopenAudits: await prisma.auditLog.findMany({ where: { tenantId, entityId: t.userId, action: 'STAFF_ACCOUNT_REOPEN' } }),
    grantAudits: await prisma.auditLog.findMany({ where: { tenantId, entityId: t.userId, entityType: 'PERMISSION_GRANT' }, orderBy: { createdAt: 'asc' } }),
  });
  const grantOf = (s: Awaited<ReturnType<typeof snapshot>>, id: string) => s.grants.find((g) => g.id === id)!;
  const ended = (g: { validUntil: Date | null }, at = new Date()) => g.validUntil !== null && g.validUntil <= at;
  const fingerprint = async (t: Hedef) => {
    const r = await review('ADMIN', t.staffId);
    expect(r.status).toBe(200);
    expect(r.body.data.reopenable).toBe(true);
    return r.body.data.reviewFingerprint as string;
  };

  const waitForLockWaiters = async (min: number, filter: string) => {
    let n = 0;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND ${filter}`,
      );
      n = rows[0]?.n ?? 0;
      if (n >= min) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return n;
  };
  const holdInTx = (work: (tx: any) => Promise<void>) => {
    let release!: () => void;
    const released = new Promise<void>((r) => { release = r; });
    let ready!: () => void;
    const readyNow = new Promise<void>((r) => { ready = r; });
    const done = prisma.$transaction(async (tx) => {
      await work(tx);
      ready();
      await released;
    }, { timeout: 60_000, maxWait: 10_000 });
    return { readyNow, release, done };
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET })] }),
        PrismaModule,
        AuditModule,
        StaffModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '7d' } }),
      ],
      providers: [JwtStrategy, AuthService],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    // Uygulama kendi portunda dinler (supertest sunucuyu sahiplenmez): eşzamanlı istekte Linux ECONNRESET önlemi.
    await app.listen(0, '127.0.0.1');
    jwt = moduleRef.get(JwtService);
    auth = moduleRef.get(AuthService);
    passwordHash = await bcrypt.hash(PAROLA, 4);

    tenantId = `test-ci-o5b-${suffix}`;
    tenantSlug = tenantId;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI O5b', slug: tenantSlug } });
    const office = await prisma.office.create({ data: { tenantId, name: 'CI O5b Bürosu' } });
    const mk = async (key: string, role: 'ADMIN' | 'USER') =>
      (actors[key] = (await prisma.user.create({ data: { tenantId, email: `o5b-${key.toLowerCase()}-${suffix}@example.test`, name: key, surname: 'O5b', role } })).id);
    await mk('ADMIN', 'ADMIN');
    await mk('ADMIN_IKI', 'ADMIN');
    await mk('PARTNER', 'USER');
    await prisma.lawyer.create({ data: { tenantId, name: 'Ortak', surname: 'O5b', officeId: office.id, lawyerRank: 'PARTNER', userId: actors.PARTNER } });
    await mk('KARTLI_ADMIN', 'ADMIN');
    await prisma.staffMember.create({ data: { tenantId, userId: actors.KARTLI_ADMIN, firstName: 'Kartli', lastName: 'Admin', staffType: 'DIGER' } });
    await mk('YETKISIZ', 'USER');
    await prisma.staffMember.create({ data: { tenantId, userId: actors.YETKISIZ, firstName: 'Personel', lastName: 'O5b', staffType: 'SEKRETER' } });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('eski JWT: pasifken 401, hesap açıldıktan sonra da 401; yeni giriş geçerli (kontrol: yalnız isActive açılsaydı eski JWT geri dönerdi)', async () => {
    const t = await hedef();
    expect((await request(server()).get('/staff').set(bearer(t.eskiToken))).status).toBe(401);

    // Negatif kontrol — düzeltme olmasaydı: hesabı tokenVersion artırmadan açmak eski belirteci geri getirir.
    const kontrol = await hedef();
    await prisma.user.update({ where: { id: kontrol.userId }, data: { isActive: true } });
    expect((await request(server()).get('/staff').set(bearer(kontrol.eskiToken))).status).toBe(200);

    const res = await reopen('ADMIN', t.staffId, { reviewFingerprint: await fingerprint(t), keepGrantIds: [] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ account: { isActive: true, role: 'USER' }, sessionsInvalidated: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: t.userId } })).tokenVersion).toBe(1);
    expect((await request(server()).get('/staff').set(bearer(t.eskiToken))).status).toBe(401);
    const yeni = await auth.login({ email: t.email, password: PAROLA, tenantSlug });
    expect((await request(server()).get('/staff').set(bearer(yeni.token))).status).toBe(200);
  });

  it('inceleme: rol, ALLOW kayıtları (ileri tarihli dahil), DENY anahtarı ve parmak izi; parola / e-posta / TCKN dönmez; yazım yok', async () => {
    const t = await hedef();
    const before = await snapshot(t);
    const r = await review('ADMIN', t.staffId);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ staffId: t.staffId, reopenable: true, reason: null, account: { role: 'USER', isActive: false, hasPassword: true }, denyKeys: [EXPENSES] });
    expect(d.allowGrants.map((g: any) => g.id).sort()).toEqual([t.grant.gorev, t.grant.masraf, t.grant.ileri].sort());
    expect(d.allowGrants.find((g: any) => g.id === t.grant.ileri).startsInFuture).toBe(true);
    expect(d.reviewFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const raw = JSON.stringify(r.body);
    expect(raw).not.toContain(passwordHash);
    expect(raw).not.toContain(t.email);
    expect(await snapshot(t)).toEqual(before);
  });

  it('yetkili ADMIN: tek transaction sonucu — seçilmeyen ALLOW (ileri tarihli dahil) biter; DENY, GLOBAL olmayan ve F02 dışı izin, rol, parola, kart ve atama korunur', async () => {
    const t = await hedef();
    const before = await snapshot(t);
    const res = await reopen('ADMIN', t.staffId, { reviewFingerprint: await fingerprint(t), keepGrantIds: [t.grant.masraf] });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      staffId: t.staffId, account: { isActive: true, role: 'USER' }, keptGrantCount: 1, expiredGrantCount: 2,
      revokedResetTokenCount: 1, sessionsInvalidated: true,
    });
    const after = await snapshot(t);
    expect(after.user).toEqual({ ...before.user, isActive: true, tokenVersion: before.user.tokenVersion + 1 });
    expect(ended(grantOf(after, t.grant.gorev))).toBe(true);
    expect(ended(grantOf(after, t.grant.ileri))).toBe(true);
    for (const id of [t.grant.masraf, t.grant.ret, t.grant.takim, t.grant.f02Disi]) expect(grantOf(after, id)).toEqual(grantOf(before, id));
    expect(after.tokens).toEqual([
      ...before.tokens.map((x) => (x.id === t.belirtec.acik ? { ...x, revokedAt: expect.any(Date) } : x)),
    ]);
    expect(after.staff).toEqual(before.staff);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.reopenAudits).toHaveLength(1);
    expect(after.reopenAudits[0]).toMatchObject({
      userId: actors.ADMIN, entityType: 'USER', decisionResult: 'SUCCESS', reasonCode: 'OFFICE_F01_AND_CURRENT_ADMIN_AUTHORIZED',
      oldValues: { isActive: false, tokenVersion: 0 }, newValues: { isActive: true, tokenVersion: 1 },
      metadata: expect.objectContaining({ staffId: t.staffId, keptGrantIds: [t.grant.masraf], revokedResetTokenCount: 1, denyGrantsChanged: false }),
    });
    expect(after.grantAudits).toHaveLength(1);
    expect(after.grantAudits[0]).toMatchObject({
      action: 'UPDATE', newValues: expect.objectContaining({ permissionKey: TASKS, expiredCount: 2 }),
      metadata: expect.objectContaining({ source: 'STAFF_ACCOUNT_REOPEN', effectFilter: 'ALLOW' }),
    });
    // Etkin izin çözümlemesi: görev bugün ve ileri tarihli kaydın başlayacağı günden sonra da varsayılan; masrafta DENY korunur.
    const wsp = app.get(WorkScopePermissionService);
    expect(await wsp.resolve(prisma as never, tenantId, t.userId, TASKS)).toBe('NONE');
    expect(await wsp.resolve(prisma as never, tenantId, t.userId, TASKS, new Date(Date.now() + 60 * DAY))).toBe('NONE');
    expect(await wsp.resolve(prisma as never, tenantId, t.userId, EXPENSES)).toBe('DENY');

    const again = await reopen('ADMIN', t.staffId, { reviewFingerprint: 'a'.repeat(64), keepGrantIds: [] });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'STAFF_ACCOUNT_REOPEN_NOT_APPLICABLE', reason: 'ACCOUNT_ALREADY_ACTIVE' });
  });

  it('yetki: ADMIN olmayan PARTNER (F01 geçer) 403 ADMIN_REQUIRED; kartlı ADMIN ve yetkisiz personel F01 ile 403; hiçbir şey yazılmaz', async () => {
    const t = await hedef();
    const fp = await fingerprint(t);
    const before = await snapshot(t);
    for (const call of [() => review('PARTNER', t.staffId), () => reopen('PARTNER', t.staffId, { reviewFingerprint: fp, keepGrantIds: [] })]) {
      const r = await call();
      expect({ status: r.status, code: r.body.code }).toEqual({ status: 403, code: 'STAFF_ACCOUNT_REOPEN_ADMIN_REQUIRED' });
    }
    for (const key of ['KARTLI_ADMIN', 'YETKISIZ']) {
      const r = await reopen(key, t.staffId, { reviewFingerprint: fp, keepGrantIds: [] });
      expect(r.status).toBe(403);
      expect(String(r.body.message)).toContain('OFFICE_F01_AUTHORIZATION_REQUIRED');
    }
    expect(await snapshot(t)).toEqual(before);
  });

  it('uygulanamayan durumlar (pasif kart, açık hesap, parolasız davet, başka kiracı) → yazımsız ret', async () => {
    const pasif = await hedef({ reactivate: false });
    const before = await snapshot(pasif);
    const r1 = await review('ADMIN', pasif.staffId);
    expect(r1.body.data).toMatchObject({ reopenable: false, reason: 'STAFF_INACTIVE', reviewFingerprint: null });
    const p1 = await reopen('ADMIN', pasif.staffId, { reviewFingerprint: 'a'.repeat(64), keepGrantIds: [] });
    expect({ status: p1.status, code: p1.body.code, reason: p1.body.reason }).toEqual({ status: 409, code: 'STAFF_ACCOUNT_REOPEN_NOT_APPLICABLE', reason: 'STAFF_INACTIVE' });
    expect(await snapshot(pasif)).toEqual(before);

    const davet = await prisma.user.create({ data: { tenantId, email: `o5b-davet-${suffix}@example.test`, name: 'Davet', surname: 'O5b', role: 'USER', isActive: false, passwordHash: null } });
    const davetKart = await prisma.staffMember.create({ data: { tenantId, userId: davet.id, firstName: 'Davet', lastName: 'O5b', staffType: 'DIGER' } });
    expect((await review('ADMIN', davetKart.id)).body.data).toMatchObject({ reopenable: false, reason: 'ACCOUNT_PENDING_INVITE' });
    const p2 = await reopen('ADMIN', davetKart.id, { reviewFingerprint: 'a'.repeat(64), keepGrantIds: [] });
    expect(p2.body.reason).toBe('ACCOUNT_PENDING_INVITE');
    expect(await prisma.user.findUniqueOrThrow({ where: { id: davet.id }, select: { isActive: true, tokenVersion: true } })).toEqual({ isActive: false, tokenVersion: 0 });

    const baskaKiraci = `test-ci-o5b-diger-${suffix}`;
    await prisma.tenant.create({ data: { id: baskaKiraci, name: 'CI O5b diger', slug: baskaKiraci } });
    const yabanci = await prisma.staffMember.create({ data: { tenantId: baskaKiraci, firstName: 'Yabanci', lastName: 'O5b', staffType: 'DIGER' } });
    expect((await review('ADMIN', yabanci.id)).status).toBe(404);
    expect((await reopen('ADMIN', yabanci.id, { reviewFingerprint: 'a'.repeat(64), keepGrantIds: [] })).status).toBe(404);
  });

  it('bayat inceleme: kimlik listesi AYNIYKEN yalnız süre değişirse ya da bu arada izin yazılırsa 409 STALE; hiçbir şey yazılmaz', async () => {
    const t = await hedef();
    const fp = await fingerprint(t);
    const idsOnce = (await review('ADMIN', t.staffId)).body.data.allowGrants.map((g: any) => g.id).sort();
    await prisma.permissionGrant.update({ where: { id: t.grant.masraf }, data: { validUntil: new Date(Date.now() + 90 * DAY) } });
    const r2 = await review('ADMIN', t.staffId);
    expect(r2.body.data.allowGrants.map((g: any) => g.id).sort()).toEqual(idsOnce);
    expect(r2.body.data.reviewFingerprint).not.toBe(fp);
    const before = await snapshot(t);
    const res = await reopen('ADMIN', t.staffId, { reviewFingerprint: fp, keepGrantIds: [t.grant.masraf] });
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: 'STAFF_ACCOUNT_REVIEW_STALE' });
    expect(await snapshot(t)).toEqual(before);

    // Ürün yolundan izin değişikliği (grant ekranının "varsayılan kapsam" geri alması; kapalı hesapta da çalışır) da bayatlatır.
    const fp2 = r2.body.data.reviewFingerprint;
    await app.get(WorkScopePermissionService).revoke(tenantId, actors.ADMIN, { personType: 'staff', personId: t.staffId, key: TASKS });
    const mid = await snapshot(t);
    expect(ended(grantOf(mid, t.grant.gorev))).toBe(true);
    const res2 = await reopen('ADMIN', t.staffId, { reviewFingerprint: fp2, keepGrantIds: [] });
    expect(res2.body.code).toBe('STAFF_ACCOUNT_REVIEW_STALE');
    expect(await snapshot(t)).toEqual(mid);
  });

  it('gövde: incelemede olmayan korunacak kimlik 400; rol / parola / fazladan alan 400; hiçbir şey yazılmaz', async () => {
    const t = await hedef();
    const fp = await fingerprint(t);
    const before = await snapshot(t);
    const r1 = await reopen('ADMIN', t.staffId, { reviewFingerprint: fp, keepGrantIds: [t.grant.ret] }); // DENY korunacak listeye giremez
    expect({ status: r1.status, code: r1.body.code }).toEqual({ status: 400, code: 'STAFF_ACCOUNT_REOPEN_UNKNOWN_GRANT' });
    for (const extra of [{ role: 'ADMIN' }, { password: 'x' }, { isActive: true }, { tokenVersion: 0 }]) {
      expect((await reopen('ADMIN', t.staffId, { reviewFingerprint: fp, keepGrantIds: [], ...extra })).status).toBe(400);
    }
    expect((await reopen('ADMIN', t.staffId, { keepGrantIds: [] })).status).toBe(400);
    expect(await snapshot(t)).toEqual(before);
  });

  describe('eşzamanlılık ve kilit sırası — GERÇEK ayrı transaction\'lar', () => {
    const lockKey = (staffId: string) => `work-scope-permission:${tenantId}:staff:${staffId}`;

    it('iki yetkili aynı anda → TEK hesap açma, TEK tokenVersion artışı, TEK denetim; kaybeden 409 ve yazım üretmez', async () => {
      const t = await hedef();
      const fp = await fingerprint(t);
      const before = await snapshot(t);
      const holder = holdInTx(async (tx) => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(t.staffId)}, 0))`; });
      await holder.readyNow;
      const pa = reopen('ADMIN', t.staffId, { reviewFingerprint: fp, keepGrantIds: [t.grant.masraf] });
      const pb = reopen('ADMIN_IKI', t.staffId, { reviewFingerprint: fp, keepGrantIds: [t.grant.masraf] });
      const waiting = await waitForLockWaiters(2, `wait_event = 'advisory'`);
      holder.release();
      await holder.done;
      const [ra, rb] = await Promise.all([pa, pb]);
      expect(waiting).toBeGreaterThanOrEqual(2);
      expect([ra.status, rb.status].sort()).toEqual([201, 409]);
      const loser = ra.status === 201 ? rb : ra;
      // Kaybeden sırası gelince hesabı AÇIK bulur (kilit altında yeniden okuma) → uygulanamaz; hiçbir şey yazmaz.
      expect(loser.body).toMatchObject({ code: 'STAFF_ACCOUNT_REOPEN_NOT_APPLICABLE', reason: 'ACCOUNT_ALREADY_ACTIVE' });
      const after = await snapshot(t);
      expect(after.user.tokenVersion).toBe(before.user.tokenVersion + 1);
      expect(after.reopenAudits).toHaveLength(1);
      expect(after.reopenAudits[0].userId).toBe(ra.status === 201 ? actors.ADMIN : actors.ADMIN_IKI);
      expect(after.grantAudits).toHaveLength(1);
    });

    it('izin yazımıyla AYNI danışma kilidi: grant tarafı kilidi tutarken hesap açma bekler; grant değişikliği commit olunca 409 STALE, kilitlenme yok', async () => {
      const t = await hedef();
      const fp = await fingerprint(t);
      const holder = holdInTx(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(t.staffId)}, 0))`;
        await tx.permissionGrant.update({ where: { id: t.grant.gorev }, data: { validUntil: new Date() } }); // grant ekranının "varsayılan kapsam" yazımı
      });
      await holder.readyNow;
      const p = reopen('ADMIN', t.staffId, { reviewFingerprint: fp, keepGrantIds: [] });
      expect(await waitForLockWaiters(1, `wait_event = 'advisory'`)).toBeGreaterThanOrEqual(1);
      const mid = await snapshot(t);
      holder.release();
      await holder.done;
      const res = await p;
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: 'STAFF_ACCOUNT_REVIEW_STALE' });
      const after = await snapshot(t);
      expect(after.user).toEqual(mid.user);
      expect(after.reopenAudits).toHaveLength(0);
    });

    /**
     * Pasifleştirme (remove) önce User'ı, sonra kartı kilitler. Engel User satırını tutarken önce GERÇEK DELETE, sonra hesap
     * açma User kilidinde sıraya girer (sıra pg_stat_activity ile beklenir). Engel kalkınca DELETE User'ı alır ve kartı ister:
     * hesap açma kartı User'dan ÖNCE kilitleseydi burada kesin kilitlenme (40P01) olurdu. Doğru sırada DELETE biter, hesap
     * açma kartı pasif bulur → 409 NOT_APPLICABLE, hiçbir şey yazmaz.
     */
    it('pasifleştirmeyle aynı kilit sırası (User → kart): sırada önde olan gerçek DELETE ile kilitlenme yok; hesap açma yazımsız 409', async () => {
      const t = await hedef();
      const fp = await fingerprint(t);
      const holder = holdInTx(async (tx) => { await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${t.userId} FOR UPDATE`; });
      await holder.readyNow;
      const pDelete = (async () => request(server()).delete(`/staff/${t.staffId}`).set(await as('ADMIN_IKI')))();
      expect(await waitForLockWaiters(1, `query ILIKE '%"User"%'`)).toBeGreaterThanOrEqual(1);
      const pReopen = reopen('ADMIN', t.staffId, { reviewFingerprint: fp, keepGrantIds: [] });
      expect(await waitForLockWaiters(2, `query ILIKE '%"User"%'`)).toBeGreaterThanOrEqual(2);
      holder.release();
      await holder.done;
      const [rd, rr] = await Promise.all([pDelete, pReopen]);
      expect(rd.status).toBe(200); // pasifleştirme kilitlenmeden tamamlandı
      expect({ status: rr.status, code: rr.body.code, reason: rr.body.reason }).toEqual({
        status: 409, code: 'STAFF_ACCOUNT_REOPEN_NOT_APPLICABLE', reason: 'STAFF_INACTIVE',
      });
      const after = await snapshot(t);
      expect({ card: after.staff.isActive, account: after.user.isActive, tokenVersion: after.user.tokenVersion }).toEqual({ card: false, account: false, tokenVersion: 0 });
      expect(after.reopenAudits).toHaveLength(0);
      expect(after.grantAudits).toHaveLength(0);
    });

    /**
     * Aktör yetkisi yarışı: engel aktörün User satırını rolünü kaldıran / hesabını kapatan güncellemeyle tutar (henüz commit
     * yok). İstek JWT, F01 ve ön ADMIN kontrolünü COMMIT EDİLMİŞ (eski) değerle geçer, sonra User kilidinde bekler (ölçülür).
     * Engel commit edince kilit açılır; yazıma esas kilit sonrası kontrol 403 vermeli ve hiçbir şey yazılmamalıdır.
     */
    it.each([
      ['ADMIN rolü kaldırılır', { role: 'USER' as const }],
      ['hesabı pasifleştirilir', { isActive: false }],
    ])('istek User kilidinde beklerken aktörün %s → kilit açılınca 403; hesap, grant, belirteç ve denetimde sıfır değişiklik', async (_ad, demote) => {
      const t = await hedef();
      const fp = await fingerprint(t);
      const aktor = await prisma.user.create({
        data: { tenantId, email: `o5b-gecici-${randomUUID().slice(0, 6)}-${suffix}@example.test`, name: 'Gecici', surname: 'Admin', role: 'ADMIN' },
      });
      const token = await tokenFor(aktor.id);
      const before = await snapshot(t);
      const holder = holdInTx(async (tx) => { await tx.user.update({ where: { id: aktor.id }, data: demote }); });
      await holder.readyNow;
      // supertest isteği then() çağrılınca gönderir: engel commit etmeden ÖNCE başlat (ön kontroller eski değerle geçsin).
      const p = request(server()).post(`/staff/${t.staffId}/account-reopen`).set(bearer(token)).send({ reviewFingerprint: fp, keepGrantIds: [] })
        .then((r) => r);
      const waiting = await waitForLockWaiters(1, `query ILIKE '%"User"%' AND query ILIKE '%FOR UPDATE%'`);
      holder.release();
      await holder.done;
      const res = await p;
      expect(waiting).toBeGreaterThanOrEqual(1); // istek ön kontrolleri geçip User kilidinde gerçekten bekledi
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: 'STAFF_ACCOUNT_REOPEN_ADMIN_REQUIRED' });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: aktor.id }, select: { role: true, isActive: true } }))
        .toEqual({ role: demote.role ?? 'ADMIN', isActive: demote.isActive ?? true });
      const after = await snapshot(t);
      expect(after).toEqual(before); // hesap, tokenVersion, grant, belirteç, kart, atama, denetim aynı
      expect(after.reopenAudits).toHaveLength(0);
      expect(await prisma.auditLog.count({ where: { tenantId, userId: aktor.id } })).toBe(0);
    });
  });

  describe('atomiklik', () => {
    it('hesap açma denetimi yazılamazsa hesap, tokenVersion, izinler, belirteçler ve izin denetimi GERİ ALINIR', async () => {
      const t = await hedef();
      const fp = await fingerprint(t);
      const before = await snapshot(t);
      const service = app.get(PrismaService);
      const original = service.$transaction.bind(service) as (...args: unknown[]) => Promise<unknown>;
      let seenInside: { isActive: boolean; tokenVersion: number; grantEnded: boolean; tokenRevoked: boolean } | null = null;
      const spy = jest.spyOn(service, '$transaction').mockImplementation(((fn: unknown, opts?: unknown) => {
        if (typeof fn !== 'function') return original(fn, opts);
        return original(async (tx: Record<string, any>) => {
          const wrapped = new Proxy(tx, {
            get(target, prop) {
              const value = Reflect.get(target, prop, target);
              if (prop !== 'auditLog') return typeof value === 'function' ? value.bind(target) : value;
              const real = value as { create: (args: { data: { action: string } }) => Promise<unknown> };
              return {
                ...real,
                create: async (args: { data: { action: string } }) => {
                  if (args?.data?.action !== 'STAFF_ACCOUNT_REOPEN') return real.create(args);
                  const u = await target.user.findUniqueOrThrow({ where: { id: t.userId } });
                  const g = await target.permissionGrant.findUniqueOrThrow({ where: { id: t.grant.gorev } });
                  const k = await target.passwordResetToken.findUniqueOrThrow({ where: { id: t.belirtec.acik } });
                  seenInside = { isActive: u.isActive, tokenVersion: u.tokenVersion, grantEnded: g.validUntil !== null, tokenRevoked: k.revokedAt !== null };
                  throw new Error('O-5b benzetim: denetim yazımı başarısız');
                },
              };
            },
          });
          return (fn as (w: unknown) => Promise<unknown>)(wrapped);
        }, opts);
      }) as never);
      try {
        const res = await reopen('ADMIN', t.staffId, { reviewFingerprint: fp, keepGrantIds: [] });
        expect(res.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      // Yazımlar transaction içinde gerçekten yapıldı …
      expect(seenInside).toEqual({ isActive: true, tokenVersion: before.user.tokenVersion + 1, grantEnded: true, tokenRevoked: true });
      // … ve tamamı geri alındı (izin denetimi satırı dahil).
      expect(await snapshot(t)).toEqual(before);
      expect((await request(server()).get('/staff').set(bearer(t.eskiToken))).status).toBe(401);
      // Sonraki temiz istek çalışır.
      expect((await reopen('ADMIN', t.staffId, { reviewFingerprint: fp, keepGrantIds: [] })).status).toBe(201);
    });
  });
});
