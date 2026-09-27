// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: adr014-representative-fixtures.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';

/**
 * K2 (owner kararı 2026-09-28) — dosya avukatı / personel YETKİ verme-değiştirme uçları F01 yönetim kuralına bağlı.
 *
 *   PATCH /cases/:id/lawyers/:caseLawyerId  (casePermissions / canSign / hasSignatureAuthority)
 *   PATCH /cases/:id/staff/:caseStaffId     (canEdit / canApprove / canView)
 *   POST  /cases/:id/lawyers                (istemcinin bildirdiği canSign)
 *
 * Önceki kusur: bu uçlar rol/yetki kontrolü OLMADAN yetki alanı yazıyordu → sıradan USER kendine
 * `casePermissions.canEditFinance` verip ClaimItem insan yazma kapısını açabiliyordu.
 *
 * Gerçek giriş yolu: HTTP + main.ts global ValidationPipe → CaseController (JwtAuthGuard + ViewerWriteDenyGuard)
 * → gerçek Nest DI (CaseModule → OfficeApprovalModule; ClaimItemModule aynı uygulamada) → disposable PostgreSQL.
 * Yalnız JWT imza doğrulaması DB'den okunan test kimliğiyle değiştirilir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-PERMISSION-GRANT DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({
      where: { id: String(req.headers['x-test-user-id']) },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeWithDisposableDb('K2 — dosya yetkisi verme/değiştirme F01 yönetim kuralına bağlı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(90_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function tenantWithOffice(label: string, suffix: string) {
    const tenantId = `test-ci-k2-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI K2 ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI K2 office ${label}` } });
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-K2-${label}-${suffix}`, type: 'GENERAL_EXECUTION' },
    });
    return { tenantId, officeId: office.id, caseId: legalCase.id };
  }

  async function lawyerUser(
    tenantId: string,
    officeId: string,
    key: string,
    role: 'USER' | 'ADMIN' | 'VIEWER',
    lawyerRank: 'PARTNER' | 'LAWYER',
  ) {
    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'K2', role },
    });
    const lawyer = await prisma.lawyer.create({
      data: { tenantId, officeId, userId: user.id, name: key, surname: 'K2', lawyerRank },
    });
    return { userId: user.id, lawyerId: lawyer.id };
  }

  /**
   * A tenantı (hedef) + B tenantı (yabancı). A'daki aktörler:
   *  partner (USER+PARTNER, A ofisine bağlı) · admin (ADMIN) · viewer (VIEWER+PARTNER)
   *  finance (USER+LAWYER, dosyada canEditFinance=true) · plain (USER+LAWYER, dosyada yetkisiz)
   *  crossOffice (USER+PARTNER ama officeId = B'nin ofisi) · outsider (USER+LAWYER, dosyada değil)
   *  staff (personel, canSeeFinance=true, dosyada canEdit=false)
   * B'de: foreignPartner (USER+PARTNER, B ofisine bağlı).
   */
  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const a = await tenantWithOffice(`${label}-a`, suffix);
    const b = await tenantWithOffice(`${label}-b`, suffix);

    const partner = await lawyerUser(a.tenantId, a.officeId, 'partner', 'USER', 'PARTNER');
    const admin = await prisma.user.create({
      data: { tenantId: a.tenantId, email: `admin-${suffix}@example.test`, name: 'Admin', surname: 'K2', role: 'ADMIN' },
    });
    const viewer = await lawyerUser(a.tenantId, a.officeId, 'viewer', 'VIEWER', 'PARTNER');
    const finance = await lawyerUser(a.tenantId, a.officeId, 'finance', 'USER', 'LAWYER');
    const plain = await lawyerUser(a.tenantId, a.officeId, 'plain', 'USER', 'LAWYER');
    const crossOffice = await lawyerUser(a.tenantId, b.officeId, 'crossoffice', 'USER', 'PARTNER');
    const outsider = await lawyerUser(a.tenantId, a.officeId, 'outsider', 'USER', 'LAWYER');
    const foreignPartner = await lawyerUser(b.tenantId, b.officeId, 'foreign', 'USER', 'PARTNER');

    const financeCl = await prisma.caseLawyer.create({
      data: { caseId: a.caseId, lawyerId: finance.lawyerId, casePermissions: { canEditFinance: true } },
    });
    const plainCl = await prisma.caseLawyer.create({
      data: { caseId: a.caseId, lawyerId: plain.lawyerId, casePermissions: { canViewFinance: true } },
    });

    const staffUser = await prisma.user.create({
      data: { tenantId: a.tenantId, email: `staff-${suffix}@example.test`, name: 'Staff', surname: 'K2', role: 'USER' },
    });
    const staffMember = await prisma.staffMember.create({
      data: {
        tenantId: a.tenantId,
        officeId: a.officeId,
        userId: staffUser.id,
        firstName: 'Staff',
        lastName: 'K2',
        staffType: 'SEKRETER',
        canSeeFinance: true,
      },
    });
    const staffCs = await prisma.caseStaff.create({
      data: { caseId: a.caseId, staffMemberId: staffMember.id, roleOnCase: 'SEKRETER' },
    });

    return {
      a,
      b,
      partner: partner.userId,
      admin: admin.id,
      viewer: viewer.userId,
      finance: finance.userId,
      plain: plain.userId,
      crossOffice: crossOffice.userId,
      outsider,
      foreignPartner: foreignPartner.userId,
      staff: staffUser.id,
      financeClId: financeCl.id,
      plainClId: plainCl.id,
      staffCsId: staffCs.id,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  const http = () => request(app.getHttpServer());
  const patchLawyer = (actor: string, caseId: string, clId: string, body: Record<string, unknown>) =>
    http().patch(`/cases/${caseId}/lawyers/${clId}`).set('x-test-user-id', actor).send(body);
  const patchStaff = (actor: string, caseId: string, csId: string, body: Record<string, unknown>) =>
    http().patch(`/cases/${caseId}/staff/${csId}`).set('x-test-user-id', actor).send(body);
  const addLawyer = (actor: string, caseId: string, body: Record<string, unknown>) =>
    http().post(`/cases/${caseId}/lawyers`).set('x-test-user-id', actor).send(body);
  /** ClaimItem insan yazma kapısı — dosyada mali yetki olmadan OBJECT_PERMISSION_DENIED; yetkiyle onay + oluşum bağlamı. */
  const createClaimItem = (actor: string, caseId: string) =>
    http().post('/claim-items').set('x-test-user-id', actor).send({ caseId, itemType: 'PRINCIPAL', amount: 1_000, currency: 'TRY' });

  async function snapshotCaseLawyer(id: string) {
    const row = await prisma.caseLawyer.findUniqueOrThrow({ where: { id } });
    return {
      casePermissions: row.casePermissions,
      permissionSource: row.permissionSource,
      canSign: row.canSign,
      hasSignatureAuthority: row.hasSignatureAuthority,
      receiveNotifications: row.receiveNotifications,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  async function snapshotCaseStaff(id: string) {
    const row = await prisma.caseStaff.findUniqueOrThrow({ where: { id } });
    return { canEdit: row.canEdit, canApprove: row.canApprove, canView: row.canView, notes: row.notes, roleOnCase: row.roleOnCase };
  }
  const auditCount = (f: Fixture, entityId: string) =>
    prisma.auditLog.count({ where: { tenantId: f.a.tenantId, entityId } });

  function expectGrantForbidden(res: request.Response) {
    expect(res.status).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({ code: 'CASE_PERMISSION_GRANT_FORBIDDEN' }));
  }

  describe('PATCH /cases/:id/lawyers/:caseLawyerId', () => {
    it('ret: sıradan USER kendine canEditFinance veremez; satır ve denetim değişmez; ClaimItem kapısı hâlâ kapalı', async () => {
      const f = await fixture('self');
      const before = await snapshotCaseLawyer(f.plainClId);
      const res = await patchLawyer(f.plain, f.a.caseId, f.plainClId, { casePermissions: { canEditFinance: true } });

      expectGrantForbidden(res);
      expect(await snapshotCaseLawyer(f.plainClId)).toEqual(before);
      expect(await auditCount(f, f.plainClId)).toBe(0);
      const claim = await createClaimItem(f.plain, f.a.caseId);
      expect(claim.status).toBe(403);
      expect(JSON.stringify(claim.body)).toContain('OBJECT_PERMISSION_DENIED');
    });

    it('ret: dosyada mali düzenleme izni olan USER, bu izinle başkasına yetki DAĞITAMAZ', async () => {
      const f = await fixture('finance-grants');
      const before = await snapshotCaseLawyer(f.plainClId);
      const res = await patchLawyer(f.finance, f.a.caseId, f.plainClId, { casePermissions: { canEditFinance: true } });

      expectGrantForbidden(res);
      expect(await snapshotCaseLawyer(f.plainClId)).toEqual(before);
    });

    it.each([['hasSignatureAuthority'], ['canSign']])('ret: USER kendine imza yetkisi (%s) veremez', async (field) => {
      const f = await fixture(`sign-${field}`);
      const before = await snapshotCaseLawyer(f.financeClId);
      const res = await patchLawyer(f.finance, f.a.caseId, f.financeClId, { [field]: true });

      expectGrantForbidden(res);
      expect(await snapshotCaseLawyer(f.financeClId)).toEqual(before);
    });

    it('ret (kısmi yazma yok): yetki + bildirim birlikte gönderilirse bildirim alanı da yazılmaz', async () => {
      const f = await fixture('mixed');
      const before = await snapshotCaseLawyer(f.plainClId);
      const res = await patchLawyer(f.plain, f.a.caseId, f.plainClId, {
        receiveNotifications: !before.receiveNotifications,
        casePermissions: { canEditFinance: true },
      });

      expectGrantForbidden(res);
      expect(await snapshotCaseLawyer(f.plainClId)).toEqual(before);
    });

    it('ret: nesne/ofis yetkili görünen VIEWER rota katmanında 403 VIEWER_WRITE_DENIED', async () => {
      const f = await fixture('viewer');
      const before = await snapshotCaseLawyer(f.plainClId);
      const res = await patchLawyer(f.viewer, f.a.caseId, f.plainClId, { casePermissions: { canEditFinance: true } });

      expect(res.status).toBe(403);
      expect(res.body).toEqual(expect.objectContaining({ code: 'VIEWER_WRITE_DENIED' }));
      expect(await snapshotCaseLawyer(f.plainClId)).toEqual(before);
    });

    it('ret (başka ofis): avukat kaydı başka tenantın ofisine bağlı PARTNER 403; yazma yok', async () => {
      const f = await fixture('cross-office');
      const before = await snapshotCaseLawyer(f.plainClId);
      const res = await patchLawyer(f.crossOffice, f.a.caseId, f.plainClId, { casePermissions: { canEditFinance: true } });

      expectGrantForbidden(res);
      expect(await snapshotCaseLawyer(f.plainClId)).toEqual(before);
    });

    it('ret (başka tenant): kendi tenantında F01 yetkili PARTNER, başka tenantın dosya atamasına 404; yazma yok', async () => {
      const f = await fixture('cross-tenant');
      const before = await snapshotCaseLawyer(f.plainClId);
      const res = await patchLawyer(f.foreignPartner, f.a.caseId, f.plainClId, { casePermissions: { canEditFinance: true } });

      expect(res.status).toBe(404);
      expect(await snapshotCaseLawyer(f.plainClId)).toEqual(before);
      expect(await auditCount(f, f.plainClId)).toBe(0);
    });

    it('ret (dosya-atama uyuşmazlığı): yetkili PARTNER, başka dosyanın atama kimliğini bu dosya yoluyla değiştiremez', async () => {
      const f = await fixture('wrong-case');
      const otherCase = await prisma.case.create({
        data: { tenantId: f.a.tenantId, fileNumber: `CI-K2-other-${randomUUID().slice(0, 8)}`, type: 'GENERAL_EXECUTION' },
      });
      const before = await snapshotCaseLawyer(f.plainClId);
      const res = await patchLawyer(f.partner, otherCase.id, f.plainClId, { casePermissions: { canEditFinance: true } });

      expect(res.status).toBe(404);
      expect(await snapshotCaseLawyer(f.plainClId)).toEqual(before);
    });

    it.each([['partner'], ['admin']] as const)('yetkili mevcut kullanım: %s yetki verir; satır CUSTOM, denetim kaydı aktörle; ClaimItem kapısı açılır', async (who) => {
      const f = await fixture(`grant-${who}`);
      const actor = f[who];
      const res = await patchLawyer(actor, f.a.caseId, f.plainClId, {
        casePermissions: { canViewFinance: true, canEditFinance: true },
        hasSignatureAuthority: true,
      });

      expect(res.status).toBe(200);
      const after = await prisma.caseLawyer.findUniqueOrThrow({ where: { id: f.plainClId } });
      expect(after.casePermissions).toEqual({ canViewFinance: true, canEditFinance: true });
      expect(after.permissionSource).toBe('CUSTOM');
      expect(after.hasSignatureAuthority).toBe(true);
      const audit = await prisma.auditLog.findMany({ where: { tenantId: f.a.tenantId, entityId: f.plainClId } });
      expect(audit).toHaveLength(1);
      expect(audit[0].userId).toBe(actor);

      // Uçtan uca: verilen yetki ClaimItem insan kapısını açar; insan CREATE politikası (onay + oluşum) korunur.
      const claim = await createClaimItem(f.plain, f.a.caseId);
      expect(claim.status).toBe(400);
      expect(claim.body).toEqual(expect.objectContaining({ code: 'FORMATION_CONTEXT_REQUIRED' }));
      expect(await prisma.claimItem.count({ where: { tenantId: f.a.tenantId } })).toBe(0);
    });

    it('yetki-dışı alan mevcut davranışta kalır: USER kendi bildirim ayarını değiştirir', async () => {
      const f = await fixture('notif');
      const before = await snapshotCaseLawyer(f.plainClId);
      const res = await patchLawyer(f.plain, f.a.caseId, f.plainClId, { receiveNotifications: !before.receiveNotifications });

      expect(res.status).toBe(200);
      const after = await snapshotCaseLawyer(f.plainClId);
      expect(after.receiveNotifications).toBe(!before.receiveNotifications);
      expect(after.casePermissions).toEqual(before.casePermissions);
    });
  });

  describe('PATCH /cases/:id/staff/:caseStaffId', () => {
    it('ret: personel kendine dosya düzenleme (canEdit) veremez; mali yazma kapısı kapalı kalır', async () => {
      const f = await fixture('staff-self');
      const before = await snapshotCaseStaff(f.staffCsId);
      const res = await patchStaff(f.staff, f.a.caseId, f.staffCsId, { canEdit: true });

      expectGrantForbidden(res);
      expect(await snapshotCaseStaff(f.staffCsId)).toEqual(before);
      const claim = await createClaimItem(f.staff, f.a.caseId);
      expect(claim.status).toBe(403);
      expect(JSON.stringify(claim.body)).toContain('OBJECT_PERMISSION_DENIED');
    });

    it.each([['canEdit'], ['canApprove'], ['canView']])('ret: mali izinli USER personele %s veremez', async (field) => {
      const f = await fixture(`staff-${field}`);
      const before = await snapshotCaseStaff(f.staffCsId);
      const res = await patchStaff(f.finance, f.a.caseId, f.staffCsId, { [field]: field !== 'canView' });

      expectGrantForbidden(res);
      expect(await snapshotCaseStaff(f.staffCsId)).toEqual(before);
    });

    it('ret: VIEWER 403 VIEWER_WRITE_DENIED', async () => {
      const f = await fixture('staff-viewer');
      const before = await snapshotCaseStaff(f.staffCsId);
      const res = await patchStaff(f.viewer, f.a.caseId, f.staffCsId, { canEdit: true });

      expect(res.status).toBe(403);
      expect(res.body).toEqual(expect.objectContaining({ code: 'VIEWER_WRITE_DENIED' }));
      expect(await snapshotCaseStaff(f.staffCsId)).toEqual(before);
    });

    it('yetkili mevcut kullanım: PARTNER personele canEdit verir → personelin ClaimItem kapısı açılır', async () => {
      const f = await fixture('staff-grant');
      const res = await patchStaff(f.partner, f.a.caseId, f.staffCsId, { canEdit: true, canApprove: false });

      expect(res.status).toBe(200);
      expect(await snapshotCaseStaff(f.staffCsId)).toEqual(expect.objectContaining({ canEdit: true, canApprove: false }));
      const claim = await createClaimItem(f.staff, f.a.caseId);
      expect(claim.status).toBe(400);
      expect(claim.body).toEqual(expect.objectContaining({ code: 'FORMATION_CONTEXT_REQUIRED' }));
    });

    it('yetki-dışı alanlar mevcut davranışta kalır: USER not/rol günceller', async () => {
      const f = await fixture('staff-notes');
      const res = await patchStaff(f.plain, f.a.caseId, f.staffCsId, { notes: 'K2 not', roleOnCase: 'ARSIV' });

      expect(res.status).toBe(200);
      expect(await snapshotCaseStaff(f.staffCsId)).toEqual(
        expect.objectContaining({ notes: 'K2 not', roleOnCase: 'ARSIV', canEdit: false }),
      );
    });
  });

  describe('POST /cases/:id/lawyers', () => {
    it('ret: USER istemci canSign bildirerek atama yapamaz; kayıt oluşmaz', async () => {
      const f = await fixture('add-sign');
      const res = await addLawyer(f.plain, f.a.caseId, { lawyerId: f.outsider.lawyerId, canSign: true });

      expectGrantForbidden(res);
      expect(await prisma.caseLawyer.count({ where: { caseId: f.a.caseId, lawyerId: f.outsider.lawyerId } })).toBe(0);
    });

    it('mevcut davranış: USER kendini canSign olmadan ekler → atama yetki TAŞIMAZ (casePermissions boş); ClaimItem kapısı kapalı', async () => {
      const f = await fixture('add-self');
      const res = await addLawyer(f.outsider.userId, f.a.caseId, { lawyerId: f.outsider.lawyerId });

      expect(res.status).toBe(201);
      const row = await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: f.a.caseId, lawyerId: f.outsider.lawyerId } });
      expect(row.casePermissions).toBeNull();
      expect(row.hasSignatureAuthority).toBe(false);
      const claim = await createClaimItem(f.outsider.userId, f.a.caseId);
      expect(claim.status).toBe(403);
      expect(JSON.stringify(claim.body)).toContain('OBJECT_PERMISSION_DENIED');
    });

    it('yetkili mevcut kullanım: PARTNER canSign ile atar', async () => {
      const f = await fixture('add-partner');
      const res = await addLawyer(f.partner, f.a.caseId, { lawyerId: f.outsider.lawyerId, canSign: false });

      expect(res.status).toBe(201);
      const row = await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: f.a.caseId, lawyerId: f.outsider.lawyerId } });
      expect(row.canSign).toBe(false);
    });
  });
});
