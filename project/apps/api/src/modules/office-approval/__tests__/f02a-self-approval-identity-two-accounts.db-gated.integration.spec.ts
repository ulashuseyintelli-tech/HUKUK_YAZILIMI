/**
 * F02-A / J-37 — ÖZ-ONAY KİMLİK DÜZEYİ: AYNI KİŞİNİN İKİ HESABI (OFP-07 yalıtılmış doğrulama).
 *
 * Owner hükümleri (korunur, yeniden sorulmaz):
 *  - OFF/OD-11 (decision-log 2026-07-13): öz-onay KİŞİ (Person) kimliği düzeyinde engellenir.
 *  - OWN-29-B / OWN-29-C (dbind §5): COLLECTION_VOID ve FINANCIAL_CASE_CLOSE payout değildir, self-approval
 *    istisnasını miras almaz; talep eden kendi talebini onaylayamaz.
 *  - FD §41.2 KARAR 2/4: talep eden hiçbir aşamayı onaylayamaz; ofis onaylayıcısı içerik onaylayıcısı olamaz.
 *
 * Bugünkü mekanizma (kod): kişi kimliği = bağlı Lawyer/StaffMember kartındaki GEÇERLİ TCKN
 * (OfficeApprovalService.resolveSelfApprovalIdentityCandidates). Kartsız hesabın aday kümesi BOŞTUR.
 * Kayıt yolu (AuthService.register) K-A1 a′ (#3046) ÖNCESİ ilk ADMIN'i KARTSIZ yaratırdı; SONRASI personType'a göre
 * Lawyer/StaffMember kartı aynı transaction'da açılır (R1–R4). FD'nin üç ayrılık kontrolü yalnız userId okurdu.
 *
 * Bu dosya DOĞRULAMA kanıtıdır: her vaka KURALIN beklediğini ister. İlk koşum (değişmemiş kod, main 48cd614f):
 * A1/A2/F1/F2 KIRMIZI → bulgu DOĞRULANDI. Dar düzeltme (common/approval-identity; FD üç kontrolü kişi düzeyine
 * çıkarıldı) F2/F5/F6'yı kapatır. `it.failing` ile işaretli A1/A2/F1 BİLİNEN AÇIKTIR: GEÇİŞ ÖNCESİ kartsız hesabın kimlik
 * kanıtı yoktur; owner kararı K-A1 a′+sınır (29–30.10): yeni hesaplar için kayıt yolu kapandı (#3046, R1–R4); mevcut kartsız
 * hesaplar için sınır dilimi (APPROVAL_IDENTITY_UNPROVEN) ayrı PR. Düzeltme gelince bu testler
 * "beklenmedik geçti" ile KIRMIZI olur ve güncellenmeleri zorunlu olur. Gerçek olanlar: AuthService.register, JwtStrategy/JwtAuthGuard, OfficeApprovalController/Service
 * (genel motor), ClientFinancialDisclosureApprovalService + Writer, PostgreSQL. Stub: OfficeApprovalDomainSync
 * (verilmedi → karar sonrası domain senkronu YOK; kimlik kapısı karardan ÖNCE çalışır). Dış sisteme çağrı yok;
 * e-posta/SMS/para hareketi yok.
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
import { APPROVAL_IDENTITY_PROOF_FLAG } from '../../../common/approval-identity';
import { isValidTckn } from '../../../common/identity-validation.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { FINANCIAL_CASE_CLOSE_TARGET_TYPE } from '../../case-status/financial-case-close.constants';
import {
  ClientFinancialDisclosureApprovalAuthorizationError,
  ClientFinancialDisclosureApprovalError,
} from '../../client-financial-disclosure/client-financial-disclosure-approval.contract';
import { ClientFinancialDisclosureApprovalService } from '../../client-financial-disclosure/client-financial-disclosure-approval.service';
import { ClientFinancialDisclosureWriterService } from '../../client-financial-disclosure/client-financial-disclosure-writer.service';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import { OfficeApprovalController } from '../office-approval.controller';
import { OfficeApprovalService } from '../office-approval.service';

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (TEST_DATABASE_URL) {
  const target = new URL(TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('F02A_TEST_DATABASE_MUST_BE_LOCAL_POSTGRESQL');
  }
}
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('F02A_TEST_DATABASE_REQUIRED: CI requires TEST_DATABASE_URL');
}
const describeWithDatabase = TEST_DATABASE_URL ? describe : describe.skip;
const SECRET = 'f02a-self-approval-identity-local-test-secret-at-least-32-bytes';

// collection-cancel-executor.ts: COLLECTION_VOID_ACTION_CODE / COLLECTION_VOID_TARGET_TYPE (literal; o modülün
// DomainEventIngest bağımlılığını bu teste taşımamak için).
const COLLECTION_VOID = 'COLLECTION_VOID';
const COLLECTION_TARGET = 'COLLECTION';

/** Sentetik TCKN'ler — gerçek kişi değil. P1 kanonik sentetik (identity-validation.util.spec), P2 türetilmiş. */
const TCKN_P1 = '10000000146';
const TCKN_P2 = '20000000046';
/** Kişi P3 — kayıt yolundan (K-A1 a′) doğan kurucu; sentetik, P1/P2 ile kesişmez. */
const TCKN_P3 = '30000000014';

describeWithDatabase('F02-A: öz-onay kimlik düzeyi — aynı kişinin iki hesabı (gerçek HTTP + JWT + PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let auth: AuthService;
  let officeApproval: OfficeApprovalService;
  let fdSvc: ClientFinancialDisclosureApprovalService;
  let fdWriter: ClientFinancialDisclosureWriterService;
  const createdTenants: string[] = [];

  interface Acct { id: string; email: string }
  interface Fixture {
    tenantId: string;
    /** Kişi P3 — GERÇEK kayıt yolundan (K-A1 a′) doğan AVUKAT KARTLI kurucu ADMIN. */
    F: Acct;
    /** Kişi P1 — KARTSIZ ADMIN (K-A1 geçiş öncesi popülasyon; doğrudan DB). */
    X: Acct;
    /** Kişi P1 — avukat kartlı (PARTNER, TCKN_P1) ikinci hesap. */
    Y: Acct;
    /** Kişi P1 — avukat kartlı (PARTNER, TCKN_P1) üçüncü hesap (kart↔kart kontrolü). */
    Y2: Acct;
    /** Kişi P2 — avukat kartlı (PARTNER, TCKN_P2) farklı kişi. */
    Z: Acct;
    /** Kartsız USER (sekreter benzeri) — tek hesaplı mevcut akış kontrolü. */
    W: Acct;
  }

  beforeAll(async () => {
    expect(isValidTckn(TCKN_P1)).toBe(true);
    expect(isValidTckn(TCKN_P2)).toBe(true);
    expect(isValidTckn(TCKN_P3)).toBe(true);
    expect(new Set([TCKN_P1, TCKN_P2, TCKN_P3]).size).toBe(3);
    expect(TCKN_P1).not.toBe(TCKN_P2);

    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL as string } } });
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    const audit = new AuditService(prismaService);
    officeApproval = new OfficeApprovalService(prismaService, audit);
    fdSvc = new ClientFinancialDisclosureApprovalService(prisma);
    fdWriter = new ClientFinancialDisclosureWriterService(prisma);

    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [OfficeApprovalController],
      providers: [
        AuthService, JwtStrategy, JwtAuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OfficeApprovalService, useValue: officeApproval },
        { provide: ConfigService, useValue: { get: (key: string, fallback?: unknown) => (key === 'JWT_SECRET' ? SECRET : fallback) } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    jwt = module.get(JwtService);
    auth = module.get(AuthService);
  });

  afterAll(async () => {
    await app?.close();
    const sql = (q: string, ...params: unknown[]) => prisma.$executeRawUnsafe(q, ...params).catch(() => undefined);
    for (const tenantId of createdTenants) {
      await sql('DELETE FROM "AuditLog" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "OfficeApprovalRequest" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "ClientFinancialDisclosureLine" WHERE "tenantId" = $1', tenantId);
      await sql('UPDATE "ClientFinancialDisclosure" SET "currentVersionId" = NULL WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "ClientFinancialDisclosureVersion" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "ClientFinancialDisclosure" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "CollectionDispositionLine" WHERE "dispositionId" IN (SELECT id FROM "CollectionDisposition" WHERE "tenantId" = $1)', tenantId);
      await sql('DELETE FROM "CollectionDisposition" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "Collection" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "CaseClient" WHERE "caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = $1)', tenantId);
      await sql('DELETE FROM "Case" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "Client" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "Lawyer" WHERE "tenantId" = $1', tenantId);
    await sql('DELETE FROM "StaffMember" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "User" WHERE "tenantId" = $1', tenantId);
      await sql('DELETE FROM "Tenant" WHERE "id" = $1', tenantId);
    }
    await prisma.$disconnect();
  });

  // ── Fixture ────────────────────────────────────────────────────────────────────────────────────
  async function seed(): Promise<Fixture> {
    const sfx = randomUUID().slice(0, 8);
    // Kiracı: GERÇEK kayıt yolu (AuthService.register). K-A1 a′ (#3046) sonrası ilk ADMIN (kurucu F, kişi P3) KARTLI doğar (R1).
    const reg = await auth.register({
      firmName: `F02A Buro ${sfx}`, name: 'Kurucu', surname: 'Kaya', email: `kurucu-${sfx}@example.test`,
      password: 'F02a-Sifre-12345678', personType: 'LAWYER', tckn: TCKN_P3,
    });
    const tenantId = reg.tenant.id as string;
    createdTenants.push(tenantId);
    const F: Acct = { id: reg.user.id as string, email: reg.user.email as string };
    // X: KARTSIZ ADMIN (kişi P1) — kayıt yolu artık kartsız hesap üretmediği için doğrudan DB'de yaratılır; K-A1 GEÇİŞ ÖNCESİ
    // mevcut hesap popülasyonunu temsil eder (sayım/eşleme ayrı canlı paket; sınır dilimi ayrı PR). A1/A2/F1 bu popülasyon içindir.
    const X: Acct = await prisma.user.create({
      data: { tenantId, email: `x-${sfx}@example.test`, name: 'Ayse', surname: 'Kaya', role: 'ADMIN', passwordHash: 'x'.repeat(20) },
      select: { id: true, email: true },
    });

    const mk = async (name: string, role: UserRole = 'USER'): Promise<Acct> => prisma.user.create({
      data: { tenantId, email: `${name}-${sfx}@example.test`, name, surname: 'Kaya', role, passwordHash: 'x'.repeat(20) },
      select: { id: true, email: true },
    });
    const card = async (userId: string, tckn: string) => prisma.lawyer.create({
      data: { tenantId, userId, name: 'Av', surname: 'Kaya', lawyerRank: 'PARTNER', tckn },
    });

    const Y = await mk('y-partner-p1'); await card(Y.id, TCKN_P1);
    const Y2 = await mk('y2-partner-p1'); await card(Y2.id, TCKN_P1);
    const Z = await mk('z-partner-p2'); await card(Z.id, TCKN_P2);
    const W = await mk('w-kartsiz-user');
    return { tenantId, F, X, Y, Y2, Z, W };
  }

  function bearer(user: Acct, tenantId: string, role: string): string {
    return `Bearer ${jwt.sign({ sub: user.id, tenantId, email: user.email, role, tokenVersion: 0 })}`;
  }

  async function pendingRequest(tenantId: string, actionCode: string, targetType: string, requesterUserId: string) {
    return officeApproval.createPendingRequest({
      tenantId,
      actionCode,
      targetType,
      targetRef: `f02a-${randomUUID()}`,
      requesterUserId,
      savedIntent: { f02a: true, actionCode },
      reason: 'F02-A yalıtılmış doğrulama',
    });
  }

  const approveHttp = (requestId: string, actor: Acct, tenantId: string, role = 'USER') =>
    request(app.getHttpServer())
      .post(`/api/office-approvals/${requestId}/approve`)
      .set('Authorization', bearer(actor, tenantId, role))
      .send({});

  const requestRow = (id: string) =>
    prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id }, select: { status: true, approverUserId: true, decidedAt: true } });

  const approvedAuditCount = (tenantId: string, requestId: string) =>
    prisma.auditLog.count({ where: { tenantId, entityType: 'OFFICE_APPROVAL', entityId: requestId, action: 'OFFICE_APPROVAL_APPROVED' } });

  /** Kuralın beklediği RET: 400 SELF_APPROVAL_FORBIDDEN, durum PENDING kalır, onay audit'i 0. */
  async function expectSelfApprovalDenied(res: request.Response, tenantId: string, requestId: string) {
    expect(res.status).toBe(400);
    expect(String(res.body?.message ?? '')).toContain('SELF_APPROVAL_FORBIDDEN');
    const row = await requestRow(requestId);
    expect(row.status).toBe('PENDING_APPROVAL');
    expect(row.approverUserId).toBeNull();
    expect(await approvedAuditCount(tenantId, requestId)).toBe(0);
  }

  // ── R: Kayıt yolu (K-A1 a′, #3046) ─────────────────────────────────────────────────────────────
  it('R1 (K-A1): kayıt yolu (AuthService.register, personType=LAWYER) ilk ADMIN hesabını AVUKAT KARTLI yaratır — Lawyer.userId = hesap, TCKN kayıtlı, StaffMember YOK', async () => {
    const f = await seed();
    const founder = await prisma.user.findUniqueOrThrow({
      where: { id: f.F.id },
      select: { role: true, tenantId: true, lawyer: { select: { tenantId: true, tckn: true } }, staffMember: { select: { id: true } } },
    });
    expect(founder.role).toBe('ADMIN');
    expect(founder.tenantId).toBe(f.tenantId);
    expect(founder.lawyer).toEqual({ tenantId: f.tenantId, tckn: TCKN_P3 });
    expect(founder.staffMember).toBeNull();
  });

  it('R2 (K-A1): kayıt yolu personType=STAFF → StaffMember kartı (TCKN + staffType), Lawyer YOK — avukat olmayana avukat kartı dayatılmaz', async () => {
    const sfx = randomUUID().slice(0, 8);
    const reg = await auth.register({
      firmName: `F02A Sekreter ${sfx}`, name: 'Sekreter', surname: 'Kaya', email: `sek-${sfx}@example.test`,
      password: 'F02a-Sifre-12345678', personType: 'STAFF', staffType: 'SEKRETER', tckn: TCKN_P3,
    });
    const tenantId = reg.tenant.id as string;
    createdTenants.push(tenantId);
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: reg.user.id as string },
      select: { role: true, lawyer: { select: { id: true } }, staffMember: { select: { tenantId: true, tckn: true, staffType: true } } },
    });
    expect(u.role).toBe('ADMIN');
    expect(u.lawyer).toBeNull();
    expect(u.staffMember).toEqual({ tenantId, tckn: TCKN_P3, staffType: 'SEKRETER' });
  });

  it('R3 (K-A1 KAPANIŞ KANITI, yeni hesap): kayıt yolundan doğan avukat kartlı ADMIN (P3) talep eder, aynı kişinin ikinci avukat kartlı hesabı (P3) onaylar → 400 SELF_APPROVAL_FORBIDDEN; farklı kişi (P2) → 201', async () => {
    const f = await seed();
    const second = await prisma.user.create({
      data: { tenantId: f.tenantId, email: `p3-ikinci-${randomUUID().slice(0, 8)}@example.test`, name: 'Kurucu', surname: 'Kaya', role: 'USER', passwordHash: 'x'.repeat(20) },
      select: { id: true, email: true },
    });
    await prisma.lawyer.create({ data: { tenantId: f.tenantId, userId: second.id, name: 'Av', surname: 'Kaya', lawyerRank: 'PARTNER', tckn: TCKN_P3 } });
    const req = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.F.id);
    await expectSelfApprovalDenied(await approveHttp(req.id, second, f.tenantId), f.tenantId, req.id);
    const res = await approveHttp(req.id, f.Z, f.tenantId);
    expect(res.status).toBe(201);
    expect((await requestRow(req.id)).status).toBe('APPROVED');
  });

  it('R4 (K-A1 KAPANIŞ KANITI, personel kartı): kayıt yolundan doğan personel kartlı ADMIN (P3) talep eder, aynı kişinin avukat kartlı hesabı (P3) onaylar → 400 SELF_APPROVAL_FORBIDDEN (personel TCKN de kimlik adayı)', async () => {
    const sfx = randomUUID().slice(0, 8);
    const reg = await auth.register({
      firmName: `F02A Personel ${sfx}`, name: 'Personel', surname: 'Kaya', email: `per-${sfx}@example.test`,
      password: 'F02a-Sifre-12345678', personType: 'STAFF', staffType: 'MUHASEBE', tckn: TCKN_P3,
    });
    const tenantId = reg.tenant.id as string;
    createdTenants.push(tenantId);
    const founder: Acct = { id: reg.user.id as string, email: reg.user.email as string };
    const lawyerAcct = await prisma.user.create({
      data: { tenantId, email: `p3-avukat-${sfx}@example.test`, name: 'Personel', surname: 'Kaya', role: 'USER', passwordHash: 'x'.repeat(20) },
      select: { id: true, email: true },
    });
    await prisma.lawyer.create({ data: { tenantId, userId: lawyerAcct.id, name: 'Av', surname: 'Kaya', lawyerRank: 'PARTNER', tckn: TCKN_P3 } });
    const req = await pendingRequest(tenantId, ActionCode.FINANCIAL_CASE_CLOSE, FINANCIAL_CASE_CLOSE_TARGET_TYPE, founder.id);
    await expectSelfApprovalDenied(await approveHttp(req.id, lawyerAcct, tenantId), tenantId, req.id);
  });

  // ── A: Genel motor (COLLECTION_VOID / FINANCIAL_CASE_CLOSE) ─────────────────────────────────────
  it.failing('A1 — BİLİNEN AÇIK (K-A1 geçiş öncesi KARTSIZ hesap; sınır dilimi ayrı PR): COLLECTION_VOID — kartsız ADMIN (P1) talep eder, aynı kişinin avukat kartlı PARTNER hesabı (P1) onaylar → KURAL: 400 SELF_APPROVAL_FORBIDDEN (bugün: 201)', async () => {
    const f = await seed();
    const req = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.X.id);
    const res = await approveHttp(req.id, f.Y, f.tenantId);
    await expectSelfApprovalDenied(res, f.tenantId, req.id);
  });

  it.failing('A2 — BİLİNEN AÇIK (K-A1 geçiş öncesi KARTSIZ hesap; sınır dilimi ayrı PR): FINANCIAL_CASE_CLOSE — kartsız ADMIN (P1) talep eder, aynı kişinin PARTNER hesabı (P1) onaylar → KURAL: 400 SELF_APPROVAL_FORBIDDEN (bugün: 201)', async () => {
    const f = await seed();
    const req = await pendingRequest(f.tenantId, ActionCode.FINANCIAL_CASE_CLOSE, FINANCIAL_CASE_CLOSE_TARGET_TYPE, f.X.id);
    const res = await approveHttp(req.id, f.Y, f.tenantId);
    await expectSelfApprovalDenied(res, f.tenantId, req.id);
  });

  it('A3 (kontrol, farklı kişi): kartsız ADMIN (P1) talep eder, farklı kişinin PARTNER hesabı (P2) onaylar → 201 APPROVED', async () => {
    const f = await seed();
    const req = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.X.id);
    const res = await approveHttp(req.id, f.Z, f.tenantId);
    expect(res.status).toBe(201);
    const row = await requestRow(req.id);
    expect(row.status).toBe('APPROVED');
    expect(row.approverUserId).toBe(f.Z.id);
    expect(await approvedAuditCount(f.tenantId, req.id)).toBe(1);
  });

  it('A4 (kontrol, mevcut mekanizma): kartlı hesap (P1) talep eder, aynı kişinin İKİNCİ kartlı hesabı (P1) onaylar → 400 SELF_APPROVAL_FORBIDDEN (TCKN kesişimi)', async () => {
    const f = await seed();
    const req = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.Y.id);
    const res = await approveHttp(req.id, f.Y2, f.tenantId);
    await expectSelfApprovalDenied(res, f.tenantId, req.id);
  });

  it('A5 (kontrol, tek hesaplı mevcut akış): kartsız USER talep eder, farklı kişinin PARTNER hesabı onaylar → 201 APPROVED (değişmez)', async () => {
    const f = await seed();
    const req = await pendingRequest(f.tenantId, ActionCode.FINANCIAL_CASE_CLOSE, FINANCIAL_CASE_CLOSE_TARGET_TYPE, f.W.id);
    const res = await approveHttp(req.id, f.Z, f.tenantId);
    expect(res.status).toBe(201);
    expect((await requestRow(req.id)).status).toBe('APPROVED');
  });

  it('A6 (kontrol, aynı hesap): talep eden kendi hesabıyla onaylar → 400 SELF_APPROVAL_FORBIDDEN', async () => {
    const f = await seed();
    const req = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.Y.id);
    const res = await approveHttp(req.id, f.Y, f.tenantId);
    await expectSelfApprovalDenied(res, f.tenantId, req.id);
  });

  // ── F: FD (Client Financial Disclosure) ayrılık kontrolleri ────────────────────────────────────
  const sqlx = (q: string) => prisma.$executeRawUnsafe(q);

  /** FD gerçek yazıcısıyla DRAFT sürüm: Client/Case/CaseClient + POSTED CollectionDisposition (FD spec emsali). */
  async function fdDraft(tenantId: string): Promise<string> {
    const k = randomUUID().slice(0, 8);
    const clId = `f02a-cl-${k}`; const caseId = `f02a-case-${k}`; const ccId = `f02a-cc-${k}`;
    const colId = `f02a-col-${k}`; const dispId = `f02a-disp-${k}`;
    await sqlx(`INSERT INTO "Client"("id","tenantId","type","updatedAt") VALUES ('${clId}','${tenantId}','PERSON'::"ClientType",now())`);
    await sqlx(`INSERT INTO "Case"("id","tenantId","fileNumber","type","updatedAt") VALUES ('${caseId}','${tenantId}','2026/F02A-${k}','GENERAL_EXECUTION'::"CaseType",now())`);
    await sqlx(`INSERT INTO "CaseClient"("id","caseId","clientId","updatedAt") VALUES ('${ccId}','${caseId}','${clId}',now())`);
    await sqlx(`INSERT INTO "Collection"("id","tenantId","caseId","amount","currency","type","date","status","idempotencyKey","updatedAt")
      VALUES ('${colId}','${tenantId}','${caseId}',2500.75,'TRY','TAHSILAT'::"CollectionType",'2026-07-01T09:30:00Z','CONFIRMED'::"CollectionStatus",'f02a-idem-${k}',now())`);
    await sqlx(`INSERT INTO "CollectionDisposition"("id","tenantId","caseId","collectionId","beneficiaryScope","caseClientId","status","totalAmount","currency","postedAt","createdAt","updatedAt")
      VALUES ('${dispId}','${tenantId}','${caseId}','${colId}','SINGLE_CASE_CLIENT'::"CollectionDispositionBeneficiaryScope",
        '${ccId}','POSTED'::"CollectionDispositionStatus",2500.75,'TRY','2026-07-02T10:00:00Z',now(),now())`);
    await sqlx(`INSERT INTO "CollectionDispositionLine"("id","dispositionId","type","amount","createdAt") VALUES
      ('f02a-dl-${k}-a','${dispId}','CLIENT_PAYABLE'::"CollectionDispositionLineType",1750.50,now()),
      ('f02a-dl-${k}-b','${dispId}','CONTRACTUAL_FEE_WITHHELD'::"CollectionDispositionLineType",750.25,now())`);
    const r = await fdWriter.createDisclosureVersion({
      tenantId, caseId, caseClientId: ccId, collectionDispositionId: dispId, sendIdempotencyKey: `f02a-send-${k}`,
    });
    return r.versionId;
  }

  const fdCode = async (p: Promise<unknown>): Promise<string> => {
    try { await p; return 'NO_ERROR'; } catch (e) {
      if (e instanceof ClientFinancialDisclosureApprovalError || e instanceof ClientFinancialDisclosureApprovalAuthorizationError) return e.code;
      throw e;
    }
  };

  const fdStatus = async (versionId: string) =>
    (await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } })).status;

  it.failing('F1 — BİLİNEN AÇIK (K-A1 geçiş öncesi KARTSIZ hesap; sınır dilimi ayrı PR): FD ofis onayı — kartsız ADMIN (P1) talep eder, aynı kişinin PARTNER hesabı (P1) onaylar → KURAL: DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN (bugün: onaylanır)', async () => {
    const f = await seed();
    const versionId = await fdDraft(f.tenantId);
    const r = await fdSvc.requestOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.X.id });
    const code = await fdCode(fdSvc.completeOfficeApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, approvalRequestId: r.approvalRequestId as string, approverUserId: f.Y.id,
    }));
    expect(code).toBe('DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN');
    expect(await fdStatus(versionId)).toBe('OFFICE_APPROVAL_PENDING');
  });

  it('F2: FD four-eyes — ofis onayı kartlı hesap (P1), içerik onayı aynı kişinin İKİNCİ kartlı hesabı (P1) → KURAL: DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION', async () => {
    const f = await seed();
    const versionId = await fdDraft(f.tenantId);
    const r = await fdSvc.requestOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.W.id });
    await fdSvc.completeOfficeApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, approvalRequestId: r.approvalRequestId as string, approverUserId: f.Y.id,
    });
    await fdSvc.requestContentApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.W.id, approvedRecipientEmail: `client-${randomUUID().slice(0, 6)}@example.test`,
    });
    const code = await fdCode(fdSvc.completeContentApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, contentApproverUserId: f.Y2.id,
    }));
    expect(code).toBe('DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION');
    expect(await fdStatus(versionId)).toBe('CONTENT_APPROVAL_PENDING');
  });

  it('F3 (kontrol, farklı kişi): ofis onayı P1, içerik onayı P2 → CONTENT_APPROVED', async () => {
    const f = await seed();
    const versionId = await fdDraft(f.tenantId);
    const r = await fdSvc.requestOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.W.id });
    await fdSvc.completeOfficeApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, approvalRequestId: r.approvalRequestId as string, approverUserId: f.Y.id,
    });
    await fdSvc.requestContentApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.W.id, approvedRecipientEmail: `client-${randomUUID().slice(0, 6)}@example.test`,
    });
    const code = await fdCode(fdSvc.completeContentApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, contentApproverUserId: f.Z.id,
    }));
    expect(code).toBe('NO_ERROR');
    expect(await fdStatus(versionId)).toBe('CONTENT_APPROVED');
  });

  it('F4 (kontrol, mevcut userId kuralı): ofis ve içerik onayı AYNI hesap → DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION', async () => {
    const f = await seed();
    const versionId = await fdDraft(f.tenantId);
    const r = await fdSvc.requestOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.W.id });
    await fdSvc.completeOfficeApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, approvalRequestId: r.approvalRequestId as string, approverUserId: f.Y.id,
    });
    await fdSvc.requestContentApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.W.id, approvedRecipientEmail: `client-${randomUUID().slice(0, 6)}@example.test`,
    });
    const code = await fdCode(fdSvc.completeContentApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, contentApproverUserId: f.Y.id,
    }));
    expect(code).toBe('DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION');
  });

  it('F5: FD ofis onayı — kartlı hesap (P1) talep eder, aynı kişinin İKİNCİ kartlı hesabı (P1) ofis onayı verir → DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN; sürüm PENDING kalır', async () => {
    const f = await seed();
    const versionId = await fdDraft(f.tenantId);
    const r = await fdSvc.requestOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.Y.id });
    const code = await fdCode(fdSvc.completeOfficeApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, approvalRequestId: r.approvalRequestId as string, approverUserId: f.Y2.id,
    }));
    expect(code).toBe('DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN');
    expect(await fdStatus(versionId)).toBe('OFFICE_APPROVAL_PENDING');
    const req = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: r.approvalRequestId as string }, select: { status: true, approverUserId: true } });
    expect(req).toEqual({ status: 'PENDING_APPROVAL', approverUserId: null });
  });

  it('F6: FD içerik onayı — kartlı hesap (P1) talep eder, ofis onayı P2, içerik onayı aynı kişinin İKİNCİ kartlı hesabı (P1) → DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN', async () => {
    const f = await seed();
    const versionId = await fdDraft(f.tenantId);
    const r = await fdSvc.requestOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.Y.id });
    await fdSvc.completeOfficeApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, approvalRequestId: r.approvalRequestId as string, approverUserId: f.Z.id,
    });
    await fdSvc.requestContentApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.Y.id, approvedRecipientEmail: `client-${randomUUID().slice(0, 6)}@example.test`,
    });
    const code = await fdCode(fdSvc.completeContentApproval({
      tenantId: f.tenantId, disclosureVersionId: versionId, contentApproverUserId: f.Y2.id,
    }));
    expect(code).toBe('DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN');
    expect(await fdStatus(versionId)).toBe('CONTENT_APPROVAL_PENDING');
  });
  // ── G: K-A1 SINIR DİLİMİ — kimlik kanıtı zorunlu (bayrak OFFICE_APPROVAL_IDENTITY_PROOF_REQUIRED=true; yalıtılmış) ──
  // Owner (29–30.10.2026): "Sınır kodunu şimdi geliştirip yalıtılmış ortamda doğrulayın … canlı etkinleştirme, sayım ve
  // eşleme sonrasında ayrı yayın onayıyla." Bayrak KAPALI iken (yukarıdaki A/F blokları) davranış DEĞİŞMEZ.
  describe('G: K-A1 sınır — kişi kimliği kanıtı zorunlu (bayrak AÇIK)', () => {
    const original = process.env[APPROVAL_IDENTITY_PROOF_FLAG];
    beforeAll(() => { process.env[APPROVAL_IDENTITY_PROOF_FLAG] = 'true'; });
    afterAll(() => {
      if (original === undefined) delete process.env[APPROVAL_IDENTITY_PROOF_FLAG];
      else process.env[APPROVAL_IDENTITY_PROOF_FLAG] = original;
    });

    /** Sınırın beklediği RET: 403 APPROVAL_IDENTITY_UNPROVEN + kanıtsız taraf(lar); durum PENDING, onay audit'i 0. */
    async function expectIdentityUnproven(res: request.Response, tenantId: string, requestId: string, unproven: string[]) {
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'APPROVAL_IDENTITY_UNPROVEN', unproven });
      expect(String(res.body?.message ?? '')).toContain('kart bağlayın');
      const row = await requestRow(requestId);
      expect(row.status).toBe('PENDING_APPROVAL');
      expect(row.approverUserId).toBeNull();
      expect(await approvedAuditCount(tenantId, requestId)).toBe(0);
    }

    it('G1 (A1 senaryosu): COLLECTION_VOID — kartsız ADMIN (P1) talep eder, aynı kişinin PARTNER hesabı (P1) onaylar → 403 APPROVAL_IDENTITY_UNPROVEN [REQUESTER]; PENDING, audit 0', async () => {
      const f = await seed();
      const req = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.X.id);
      await expectIdentityUnproven(await approveHttp(req.id, f.Y, f.tenantId), f.tenantId, req.id, ['REQUESTER']);
    });

    it('G2 (A3 senaryosunun sınır altı sonucu): FINANCIAL_CASE_CLOSE — kartsız ADMIN talep eder, FARKLI kişinin PARTNER hesabı onaylar → 403 [REQUESTER] (kartsız sekreter akışı: talep açılır, kart bağlanana dek onaylanamaz — owner kararı)', async () => {
      const f = await seed();
      const req = await pendingRequest(f.tenantId, ActionCode.FINANCIAL_CASE_CLOSE, FINANCIAL_CASE_CLOSE_TARGET_TYPE, f.X.id);
      await expectIdentityUnproven(await approveHttp(req.id, f.Z, f.tenantId), f.tenantId, req.id, ['REQUESTER']);
      const reject = await request(app.getHttpServer()).post(`/api/office-approvals/${req.id}/reject`).set('Authorization', bearer(f.Z, f.tenantId, 'USER')).send({ note: 'G2' });
      await expectIdentityUnproven(reject, f.tenantId, req.id, ['REQUESTER']);
    });

    it('G3 (değişmez): kartlı talep eden (P1) + kartlı farklı kişi (P2) → 201 APPROVED; kartlı aynı kişi (P1/P1) → 400 SELF_APPROVAL_FORBIDDEN; aynı hesap → 400', async () => {
      const f = await seed();
      const ok = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.Y.id);
      expect((await approveHttp(ok.id, f.Z, f.tenantId)).status).toBe(201);
      expect((await requestRow(ok.id)).status).toBe('APPROVED');
      const same = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.Y.id);
      await expectSelfApprovalDenied(await approveHttp(same.id, f.Y2, f.tenantId), f.tenantId, same.id);
      const own = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.Y.id);
      await expectSelfApprovalDenied(await approveHttp(own.id, f.Y, f.tenantId), f.tenantId, own.id);
    });

    it('G4 (kapsam): duyarlı OLMAYAN tür (CHANGE_STATUS) — kartsız talep eden + kartlı farklı kişi → 201 (sınır yalnız duyarlı türlerde)', async () => {
      const f = await seed();
      const req = await pendingRequest(f.tenantId, ActionCode.CHANGE_STATUS, 'CASE', f.X.id);
      const res = await approveHttp(req.id, f.Z, f.tenantId);
      expect(res.status).toBe(201);
      expect((await requestRow(req.id)).status).toBe('APPROVED');
    });

    it('G5 (F1 senaryosu): FD ofis onayı — kartsız ADMIN (P1) talep eder, PARTNER (P1) onaylar → DISCLOSURE_APPROVAL_IDENTITY_UNPROVEN; sürüm OFFICE_APPROVAL_PENDING; talep PENDING', async () => {
      const f = await seed();
      const versionId = await fdDraft(f.tenantId);
      const r = await fdSvc.requestOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: versionId, requesterUserId: f.X.id });
      const code = await fdCode(fdSvc.completeOfficeApproval({
        tenantId: f.tenantId, disclosureVersionId: versionId, approvalRequestId: r.approvalRequestId as string, approverUserId: f.Y.id,
      }));
      expect(code).toBe('DISCLOSURE_APPROVAL_IDENTITY_UNPROVEN');
      expect(await fdStatus(versionId)).toBe('OFFICE_APPROVAL_PENDING');
      expect((await requestRow(r.approvalRequestId as string)).status).toBe('PENDING_APPROVAL');
    });

    it('G6: FD — kartsız USER (sekreter) talep eder, farklı kişi onaylar → ofis aşamasında DISCLOSURE_APPROVAL_IDENTITY_UNPROVEN; kartlı akış (P1 talep, P2 ofis, P1 ikinci hesap içerik) → SELF_APPROVAL_FORBIDDEN (değişmez)', async () => {
      const f = await seed();
      const v1 = await fdDraft(f.tenantId);
      const r1 = await fdSvc.requestOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: v1, requesterUserId: f.W.id });
      expect(await fdCode(fdSvc.completeOfficeApproval({
        tenantId: f.tenantId, disclosureVersionId: v1, approvalRequestId: r1.approvalRequestId as string, approverUserId: f.Z.id,
      }))).toBe('DISCLOSURE_APPROVAL_IDENTITY_UNPROVEN');
      const v2 = await fdDraft(f.tenantId);
      const r2 = await fdSvc.requestOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: v2, requesterUserId: f.Y.id });
      await fdSvc.completeOfficeApproval({ tenantId: f.tenantId, disclosureVersionId: v2, approvalRequestId: r2.approvalRequestId as string, approverUserId: f.Z.id });
      await fdSvc.requestContentApproval({ tenantId: f.tenantId, disclosureVersionId: v2, requesterUserId: f.Y.id, approvedRecipientEmail: `client-${randomUUID().slice(0, 6)}@example.test` });
      expect(await fdCode(fdSvc.completeContentApproval({ tenantId: f.tenantId, disclosureVersionId: v2, contentApproverUserId: f.Y2.id }))).toBe('DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN');
    });

    it('G7 (bayrak KAPALI → sınır devre dışı): kartsız talep eden + farklı kişi onay → 201 (A3 davranışı korunur; etkinleştirme ayrı yayın kararı)', async () => {
      delete process.env[APPROVAL_IDENTITY_PROOF_FLAG];
      try {
        const f = await seed();
        const req = await pendingRequest(f.tenantId, COLLECTION_VOID, COLLECTION_TARGET, f.X.id);
        expect((await approveHttp(req.id, f.Z, f.tenantId)).status).toBe(201);
      } finally {
        process.env[APPROVAL_IDENTITY_PROOF_FLAG] = 'true';
      }
    });
  });
});
