// F02 K-A1 B-1 (owner kararı 31.10.2026): POST /auth/account-card-links + GET unlinked-users — gerçek HTTP + PostgreSQL (TEST_DATABASE_URL; CI'da zorunlu).
// Kabul: ADMIN bağlar (DB: Lawyer.userId / StaffMember.userId; audit 1; hesabın ad/soyad/rol/parola DEĞİŞMEZ); USER / VIEWER 403 ve yan etki 0;
// kiracı dışı kart 404 + yan etki 0; bağlı kart / bağlı hesap / pasif hesap 409; iki kart / kartsız 400; EŞZAMANLI iki bağlama → TAM BİRİ kazanır.
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as http from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../../test/test-db-env';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { VIEWER_WRITE_DENIED } from '../../guards/viewer-write-deny.guard';
import { AccountCardLinkController } from '../account-card-link.controller';
import { AccountCardLinkService, ACCOUNT_CARD_LINK_AUDIT_ACTION } from '../account-card-link.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('F02 K-A1 account-card-link acceptance requires disposable TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;
const VALID_TCKN = '10000000146';

dbDescribe('F02 K-A1 B-1 — /auth/account-card-links (gerçek HTTP + PostgreSQL)', () => {
  jest.setTimeout(90_000);
  let db: PrismaService; let app: INestApplication;
  let tenant: string; let foreign: string;
  let admin: string; let member: string; let viewer: string; let target: string; let inactive: string; let linkedUser: string;
  let freeLawyer: string; let freeLawyerNoTckn: string; let freeStaff: string; let foreignLawyer: string; let usedLawyer: string;

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } });
    await db.$connect();
    const module = await Test.createTestingModule({
      controllers: [AccountCardLinkController],
      providers: [{ provide: PrismaService, useValue: db }, { provide: AuditService, useFactory: () => new AuditService(db) }, AccountCardLinkService],
    }).overrideGuard(JwtAuthGuard).useValue({
      async canActivate(context: any) {
        const req = context.switchToHttp().getRequest();
        const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
        if (!user) throw new UnauthorizedException();
        req.user = user; // rol DB satırından
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1'); // supertest + eşzamanlı istek: dinleyen sunucu (ECONNRESET tuzağı)
  });

  beforeEach(async () => {
    tenant = `acl-test-${randomUUID()}`; foreign = `acl-foreign-test-${randomUUID()}`;
    for (const id of [tenant, foreign]) await db.tenant.create({ data: { id, slug: id, name: 'Sentetik kiracı' } });
    const mk = async (role: 'ADMIN' | 'USER' | 'VIEWER', t = tenant, extra: Record<string, unknown> = {}) =>
      (await db.user.create({ data: { tenantId: t, role, email: `${randomUUID()}@example.test`, name: 'Sentetik', surname: role, passwordHash: 'x', ...extra } })).id;
    admin = await mk('ADMIN'); member = await mk('USER'); viewer = await mk('VIEWER'); target = await mk('USER'); inactive = await mk('USER', tenant, { isActive: false }); linkedUser = await mk('USER');
    freeLawyer = (await db.lawyer.create({ data: { tenantId: tenant, name: 'Bağsız', surname: 'Avukat', tckn: VALID_TCKN, lawyerRank: 'LAWYER' } })).id;
    freeLawyerNoTckn = (await db.lawyer.create({ data: { tenantId: tenant, name: 'Bağsız', surname: 'TCKNsiz', lawyerRank: 'LAWYER' } })).id;
    freeStaff = (await db.staffMember.create({ data: { tenantId: tenant, firstName: 'Bağsız', lastName: 'Personel', staffType: 'SEKRETER', tckn: VALID_TCKN } })).id;
    usedLawyer = (await db.lawyer.create({ data: { tenantId: tenant, userId: linkedUser, name: 'Bağlı', surname: 'Avukat', lawyerRank: 'LAWYER' } })).id;
    foreignLawyer = (await db.lawyer.create({ data: { tenantId: foreign, name: 'Yabancı', surname: 'Avukat', tckn: VALID_TCKN, lawyerRank: 'LAWYER' } })).id;
  });
  afterEach(async () => { for (const id of [tenant, foreign]) await db.tenant.delete({ where: { id } }); });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  const post = (uid: string, body: unknown) => http(app.getHttpServer()).post('/auth/account-card-links').set('x-test-user-id', uid).send(body as object);
  const get = (uid: string) => http(app.getHttpServer()).get('/auth/account-card-links/unlinked-users').set('x-test-user-id', uid);
  const snapshot = async () => JSON.parse(JSON.stringify({
    lawyers: await db.lawyer.findMany({ where: { tenantId: { in: [tenant, foreign] } }, orderBy: { id: 'asc' }, select: { id: true, userId: true } }),
    staff: await db.staffMember.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' }, select: { id: true, userId: true } }),
    users: await db.user.findMany({ where: { tenantId: tenant }, orderBy: { id: 'asc' }, select: { id: true, name: true, surname: true, role: true, isActive: true, passwordHash: true } }),
    audit: await db.auditLog.count({ where: { tenantId: tenant, action: ACCOUNT_CARD_LINK_AUDIT_ACTION } }),
  }));

  it('KABUL-1: ADMIN kartsız hesabı avukat kartına bağlar → 201; DB: Lawyer.userId = hesap; audit 1 (kişisel verisiz); hesabın ad/soyad/rol/parola DEĞİŞMEZ', async () => {
    const before = await snapshot();
    const r = await post(admin, { userId: target, lawyerId: freeLawyer });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ userId: target, cardType: 'LAWYER', cardId: freeLawyer, identityProofReady: true });
    const after = await snapshot();
    expect((await db.lawyer.findUniqueOrThrow({ where: { id: freeLawyer } })).userId).toBe(target);
    expect(after.users).toEqual(before.users); // hesap satırı DEĞİŞMEDİ
    expect(after.audit).toBe(before.audit + 1);
    const log = await db.auditLog.findFirstOrThrow({ where: { tenantId: tenant, action: ACCOUNT_CARD_LINK_AUDIT_ACTION } });
    expect(log.entityType).toBe('USER'); expect(log.entityId).toBe(target); expect(log.userId).toBe(admin);
    expect(JSON.stringify(log.metadata)).not.toMatch(/@example|10000000146|Sentetik/);
  });

  it('KABUL-2: personel kartı (TCKN yok) → 201 identityProofReady false; StaffMember.userId = hesap', async () => {
    const r = await post(admin, { userId: target, staffMemberId: freeStaff });
    expect(r.status).toBe(201); expect(r.body.cardType).toBe('STAFF'); expect(r.body.identityProofReady).toBe(true);
    const r2 = await post(admin, { userId: member, lawyerId: freeLawyerNoTckn });
    expect(r2.status).toBe(201); expect(r2.body.identityProofReady).toBe(false);
    expect((await db.staffMember.findUniqueOrThrow({ where: { id: freeStaff } })).userId).toBe(target);
  });

  it('KABUL-3: USER → 403 (ADMIN gerekir); VIEWER → 403 VIEWER_WRITE_DENIED; yan etki 0', async () => {
    const before = await snapshot();
    const u = await post(member, { userId: target, lawyerId: freeLawyer }); expect(u.status).toBe(403); expect(String(u.body.message)).toContain('ADMIN');
    const v = await post(viewer, { userId: target, lawyerId: freeLawyer }); expect(v.status).toBe(403); expect(v.body.code).toBe(VIEWER_WRITE_DENIED);
    expect(await snapshot()).toEqual(before);
  });

  it('KABUL-4: kiracı dışı kart → 404; bağlı kart → 409; bağlı hesap → 409; pasif hesap → 409; iki kart / kartsız → 400; hepsinde yan etki 0', async () => {
    const before = await snapshot();
    expect((await post(admin, { userId: target, lawyerId: foreignLawyer })).status).toBe(404);
    expect((await post(admin, { userId: target, lawyerId: usedLawyer })).status).toBe(409);
    expect((await post(admin, { userId: linkedUser, lawyerId: freeLawyer })).status).toBe(409);
    expect((await post(admin, { userId: inactive, lawyerId: freeLawyer })).status).toBe(409);
    expect((await post(admin, { userId: target, lawyerId: freeLawyer, staffMemberId: freeStaff })).status).toBe(400);
    expect((await post(admin, { userId: target })).status).toBe(400);
    expect(await snapshot()).toEqual(before);
    // yabancı kart DOKUNULMADI
    expect((await db.lawyer.findUniqueOrThrow({ where: { id: foreignLawyer } })).userId).toBeNull();
  });

  it('KABUL-5: EŞZAMANLI iki bağlama (aynı hesap → avukat + personel) → TAM BİRİ 201, öteki 409; hesabın kart sayısı 1; audit 1', async () => {
    const [a, b] = await Promise.all([post(admin, { userId: target, lawyerId: freeLawyer }), post(admin, { userId: target, staffMemberId: freeStaff })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const cards = (await db.lawyer.count({ where: { userId: target } })) + (await db.staffMember.count({ where: { userId: target } }));
    expect(cards).toBe(1);
    expect(await db.auditLog.count({ where: { tenantId: tenant, action: ACCOUNT_CARD_LINK_AUDIT_ACTION } })).toBe(1);
  });

  it('KABUL-6: GET unlinked-users — ADMIN: yalnız aynı kiracıda aktif + kartsız (bağlı / pasif / yabancı yok; parola hash yok); USER → 403; VIEWER → 403', async () => {
    const r = await get(admin); expect(r.status).toBe(200);
    const ids = r.body.map((x: { id: string }) => x.id);
    expect(ids).toEqual(expect.arrayContaining([admin, member, viewer, target]));
    expect(ids).not.toContain(linkedUser); expect(ids).not.toContain(inactive);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash/);
    expect(r.body.find((x: { id: string }) => x.id === target).pendingInvite).toBe(false);
    expect((await get(member)).status).toBe(403);
    expect((await get(viewer)).status).toBe(403);
  });
});
