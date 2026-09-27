import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ClaimEngineService } from '../../claim-engine/claim-engine.service';
import { ClaimItemModule } from '../claim-item.module';
import { ClaimItemService } from '../claim-item.service';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';

/**
 * K3 (owner kararı 2026-09-28) — insan tarafından çağrılan üretim uçları ClaimItem insan yazma politikasından geçer.
 *
 *   POST /claim-items/auto-generate                      → ClaimItemService.autoGenerateFromUser
 *   POST /claim-items/case/:caseId/generate-from-rules   → ClaimItemService.generateFromRuleEngineForUser
 *
 * Önceki kusur: iki uç doğrudan sistem yazıcısını (DOCUMENT_AUTO_GENERATOR / RULE_ENGINE_GENERATOR SYSTEM_ROUTE)
 * çağırıyordu → insan isteği aktör profili, dosya nesne yetkisi ve onay (dört-göz) kontrolü OLMADAN kalem yazıyordu.
 *
 * Gerçek giriş yolu: HTTP + main.ts global ValidationPipe → ClaimItemController (JwtAuthGuard + ViewerWriteDenyGuard)
 * → gerçek Nest DI (ClaimItemModule → OfficeApprovalModule) → disposable PostgreSQL. Yalnız JWT imza doğrulaması
 * DB'den okunan test kimliğiyle değiştirilir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CLAIM-ITEM-HUMAN-GENERATION DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('K3 — insan üretim uçları ClaimItem yazma politikasından geçer (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let claimItems: ClaimItemService;
  let router: ClaimItemWriterRouterService;
  let engine: ClaimEngineService;
  let systemWriteSpy: jest.SpyInstance;
  let humanGateSpy: jest.SpyInstance;
  /** createSystemClaimItem kendi transaction'ında kendini (tx argümanıyla) yeniden çağırır → yalnız dış çağrılar. */
  const outerSystemWrites = () => systemWriteSpy.mock.calls.filter((c) => c.length === 1);
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ClaimItemModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    claimItems = app.get(ClaimItemService);
    router = app.get(ClaimItemWriterRouterService);
    engine = app.get(ClaimEngineService, { strict: false });
    systemWriteSpy = jest.spyOn(router, 'createSystemClaimItem');
    humanGateSpy = jest.spyOn(router, 'evaluateHuman');
  });

  beforeEach(() => {
    systemWriteSpy.mockClear();
    humanGateSpy.mockClear();
  });

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  type Fixture = Awaited<ReturnType<typeof fixture>>;

  /**
   * Tenant + ofis + dosya. Aktörler (hepsi aynı tenant):
   *  - authorized: USER + LAWYER, dosyada casePermissions.canEditFinance=true (mevcut yetkili kullanım)
   *  - unauthorized: USER + LAWYER, dosyada yetkisiz atama
   *  - viewer: VIEWER + LAWYER, dosyada canEditFinance=true (nesne yetkisi olsa da rol yazamaz)
   *  - staffNoFinance: personel, dosyada canEdit=true ama StaffMember.canSeeFinance=false
   */
  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-k3-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI K3 ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI K3 office ${label}` } });
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-K3-${label}-${suffix}`, type: 'GENERAL_EXECUTION' },
    });

    async function lawyerActor(key: string, role: 'USER' | 'VIEWER', casePermissions: Record<string, boolean>) {
      const user = await prisma.user.create({
        data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'K3', role },
      });
      const lawyer = await prisma.lawyer.create({
        data: { tenantId, officeId: office.id, userId: user.id, name: key, surname: 'K3', lawyerRank: 'LAWYER' },
      });
      await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: lawyer.id, casePermissions } });
      return user.id;
    }

    const authorized = await lawyerActor('auth', 'USER', { canEditFinance: true });
    const unauthorized = await lawyerActor('noauth', 'USER', { canViewFinance: true });
    const viewer = await lawyerActor('viewer', 'VIEWER', { canEditFinance: true });

    const staffUser = await prisma.user.create({
      data: { tenantId, email: `staff-${suffix}@example.test`, name: 'Staff', surname: 'K3', role: 'USER' },
    });
    const staffMember = await prisma.staffMember.create({
      data: {
        tenantId,
        officeId: office.id,
        userId: staffUser.id,
        firstName: 'Staff',
        lastName: 'K3',
        staffType: 'SEKRETER',
        canSeeFinance: false,
      },
    });
    await prisma.caseStaff.create({ data: { caseId: legalCase.id, staffMemberId: staffMember.id, roleOnCase: 'SEKRETER', canEdit: true } });

    return { tenantId, caseId: legalCase.id, authorized, unauthorized, viewer, staffNoFinance: staffUser.id };
  }

  function autoGenerate(actorUserId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/claim-items/auto-generate').set('x-test-user-id', actorUserId).send(body);
  }

  function generateFromRules(actorUserId: string, caseId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/claim-items/case/${caseId}/generate-from-rules`)
      .set('x-test-user-id', actorUserId)
      .send(body);
  }

  const cekBody = (f: Fixture) => ({
    caseId: f.caseId,
    documentId: `doc-${randomUUID().slice(0, 8)}`,
    documentType: 'CEK',
    totalAmount: 10_000,
    currency: 'TRY',
    dueDate: '2026-01-15T00:00:00.000Z',
  });

  /** Yazmasızlık: kalem, onay talebi ve denetim kaydı oluşmaz; sistem yazıcısı hiç çağrılmaz. */
  async function expectNoWrites(tenantId: string) {
    expect(await prisma.claimItem.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { tenantId } })).toBe(0);
    expect(systemWriteSpy).not.toHaveBeenCalled();
  }

  describe('POST /claim-items/auto-generate (CEK → 2 kalem: PRINCIPAL + CHECK_PENALTY)', () => {
    it('ret: dosyada mali düzenleme yetkisi olmayan USER 403 OBJECT_PERMISSION_DENIED; hiçbir kalem yazılmaz', async () => {
      const f = await fixture('ag-noauth');
      const res = await autoGenerate(f.unauthorized, cekBody(f));

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toContain('OBJECT_PERMISSION_DENIED');
      expect(humanGateSpy).toHaveBeenCalledTimes(1); // ilk kalemde durur
      await expectNoWrites(f.tenantId);
    });

    it('ret: canSeeFinance=false personel (dosyada canEdit=true) 403; hiçbir kalem yazılmaz', async () => {
      const f = await fixture('ag-staff');
      const res = await autoGenerate(f.staffNoFinance, cekBody(f));

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toContain('OBJECT_PERMISSION_DENIED');
      await expectNoWrites(f.tenantId);
    });

    it('ret: nesne yetkili VIEWER rota katmanında 403 VIEWER_WRITE_DENIED; kapıya ulaşmaz', async () => {
      const f = await fixture('ag-viewer');
      const res = await autoGenerate(f.viewer, cekBody(f));

      expect(res.status).toBe(403);
      expect(res.body).toEqual(expect.objectContaining({ code: 'VIEWER_WRITE_DENIED' }));
      expect(humanGateSpy).not.toHaveBeenCalled();
      await expectNoWrites(f.tenantId);
    });

    it('ret: başka tenant dosyası — kendi tenantında yetkili aktör 403 TENANT_CASE_SCOPE_MISMATCH; hedef tenantta yazma yok', async () => {
      const own = await fixture('ag-own');
      const foreign = await fixture('ag-foreign');
      const res = await autoGenerate(own.authorized, { ...cekBody(own), caseId: foreign.caseId });

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toContain('TENANT_CASE_SCOPE_MISMATCH');
      await expectNoWrites(foreign.tenantId);
      await expectNoWrites(own.tenantId);
    });

    it('yetkili mevcut kullanım: her iki kalem kapıdan geçer → insan CREATE politikası (onay + oluşum bağlamı) FORMATION_CONTEXT_REQUIRED; doğrudan yazma yok', async () => {
      const f = await fixture('ag-auth');
      const res = await autoGenerate(f.authorized, cekBody(f));

      expect(res.status).toBe(400);
      expect(res.body).toEqual(expect.objectContaining({ code: 'FORMATION_CONTEXT_REQUIRED' }));
      // İki kalem de insan kapısından geçti (SYSTEM_ROUTE atlaması yok) ve kapı onay istedi.
      expect(humanGateSpy).toHaveBeenCalledTimes(2);
      const gateResults = await Promise.all(humanGateSpy.mock.results.map((r) => r.value));
      expect(gateResults.map((r: any) => r.outcome)).toEqual(['OFFICE_APPROVAL_REQUIRED', 'OFFICE_APPROVAL_REQUIRED']);
      expect(humanGateSpy.mock.calls.map((c) => c[0].payload.itemType)).toEqual(['PRINCIPAL', 'CHECK_PENALTY']);
      await expectNoWrites(f.tenantId);
    });

    it('davranış eşitliği: yetkili aktörde sonuç POST /claim-items (createFromUser) ile aynıdır', async () => {
      const f = await fixture('ag-parity');
      const direct = await request(app.getHttpServer())
        .post('/claim-items')
        .set('x-test-user-id', f.authorized)
        .send({ caseId: f.caseId, itemType: 'PRINCIPAL', amount: 10_000, currency: 'TRY' });
      const generated = await autoGenerate(f.authorized, cekBody(f));

      expect(generated.status).toBe(direct.status);
      expect(generated.body.code).toBe(direct.body.code);
      await expectNoWrites(f.tenantId);
    });

    it('ret: istemci sistem rotası/aktör alanı enjekte edemez (forbidNonWhitelisted 400); kapı ve yazma yok', async () => {
      const f = await fixture('ag-inject');
      const res = await autoGenerate(f.unauthorized, { ...cekBody(f), route: 'DOCUMENT_AUTO_GENERATOR' });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('property route should not exist');
      expect(humanGateSpy).not.toHaveBeenCalled();
      await expectNoWrites(f.tenantId);
    });

    it('sistem yazıcısı ayrık ve çalışır: iç çağrı autoGenerateFromDocument DOCUMENT_AUTO_GENERATOR ile 2 kalem yazar (insan kapısı sorulmaz)', async () => {
      const f = await fixture('ag-system');
      // Sistem rotası kaynak bütünlüğü: belge aynı dosyada gerçek bir CaseDocument olmalıdır (mevcut kural).
      const document = await prisma.caseDocument.create({ data: { caseId: f.caseId, documentType: 'OTHER', title: 'CI K3 çek' } });
      const created = await claimItems.autoGenerateFromDocument(f.tenantId, f.authorized, { ...cekBody(f), documentId: document.id } as any);

      expect(created).toHaveLength(2);
      expect(outerSystemWrites().map((c) => c[0].route)).toEqual(['DOCUMENT_AUTO_GENERATOR', 'DOCUMENT_AUTO_GENERATOR']);
      expect(humanGateSpy).not.toHaveBeenCalled();
      const rows = await prisma.claimItem.findMany({ where: { tenantId: f.tenantId }, orderBy: { sortOrder: 'asc' } });
      expect(rows.map((r) => r.itemType)).toEqual(['PRINCIPAL', 'CHECK_PENALTY']);
    });
  });

  describe('POST /claim-items/case/:caseId/generate-from-rules', () => {
    /** Motor çıktısı: iki desteklenen kalem (gerçek YAML şablonlarının hepsi POST_INTEREST_RULE/OTHER içerir → UNSUPPORTED). */
    const TWO_SUPPORTED = [
      { type: 'PRINCIPAL', label: 'Asıl alacak', required: true, isCalculated: false, amount: 5_000, currency: 'TRY' },
      { type: 'FEE', label: 'Harç', required: true, isCalculated: false, amount: 250, currency: 'TRY' },
    ];

    it('ret: yetkisiz USER çoklu kalem üretiminde 403; hiçbir kalem yazılmaz', async () => {
      const f = await fixture('rr-noauth');
      jest.spyOn(engine, 'generateClaimItems').mockReturnValueOnce(TWO_SUPPORTED as any);
      const res = await generateFromRules(f.unauthorized, f.caseId, { subCategory: 'TEST_SUB', extractedData: {} });

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toContain('OBJECT_PERMISSION_DENIED');
      await expectNoWrites(f.tenantId);
    });

    it('ret: şablon kalem üretmese de (boş) yetkisiz aktör dosya düzeyinde reddedilir', async () => {
      const f = await fixture('rr-empty-noauth');
      const res = await generateFromRules(f.unauthorized, f.caseId, { subCategory: 'NO_SUCH_TEMPLATE', extractedData: {} });

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toContain('OBJECT_PERMISSION_DENIED');
      await expectNoWrites(f.tenantId);
    });

    it('yetkili: boş şablon → yazmasız boş sonuç (applied=false)', async () => {
      const f = await fixture('rr-empty-auth');
      const res = await generateFromRules(f.authorized, f.caseId, { subCategory: 'NO_SUCH_TEMPLATE', extractedData: {} });

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ applied: false, approvalRequired: false, data: [] });
      await expectNoWrites(f.tenantId);
    });

    it('yetkili mevcut kullanım: iki kalem de kapıdan geçer → FORMATION_CONTEXT_REQUIRED; doğrudan yazma yok', async () => {
      const f = await fixture('rr-auth');
      jest.spyOn(engine, 'generateClaimItems').mockReturnValueOnce(TWO_SUPPORTED as any);
      const res = await generateFromRules(f.authorized, f.caseId, { subCategory: 'TEST_SUB', extractedData: {} });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(expect.objectContaining({ code: 'FORMATION_CONTEXT_REQUIRED' }));
      expect(humanGateSpy).toHaveBeenCalledTimes(2);
      expect(humanGateSpy.mock.calls.map((c) => c[0].payload.itemType)).toEqual(['PRINCIPAL', 'FEE']);
      await expectNoWrites(f.tenantId);
    });

    it('atomiklik: gerçek şablon (KAMBIYO_CEK, POST_INTEREST_RULE içerir) kapıdan ve yazmadan ÖNCE UNSUPPORTED_COMPONENT; kısmi kalem yok', async () => {
      const f = await fixture('rr-real');
      const res = await generateFromRules(f.authorized, f.caseId, {
        subCategory: 'KAMBIYO_CEK',
        extractedData: { instrument_amount: 10_000, currency: 'TRY' },
      });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(expect.objectContaining({ code: 'UNSUPPORTED_COMPONENT' }));
      expect(humanGateSpy).not.toHaveBeenCalled();
      await expectNoWrites(f.tenantId);
    });

    it('ret: nesne yetkili VIEWER 403 VIEWER_WRITE_DENIED', async () => {
      const f = await fixture('rr-viewer');
      const res = await generateFromRules(f.viewer, f.caseId, { subCategory: 'NO_SUCH_TEMPLATE', extractedData: {} });

      expect(res.status).toBe(403);
      expect(res.body).toEqual(expect.objectContaining({ code: 'VIEWER_WRITE_DENIED' }));
      await expectNoWrites(f.tenantId);
    });

    it('ret: başka tenant dosyası 404; hedef tenantta yazma yok', async () => {
      const own = await fixture('rr-own');
      const foreign = await fixture('rr-foreign');
      const res = await generateFromRules(own.authorized, foreign.caseId, { subCategory: 'NO_SUCH_TEMPLATE', extractedData: {} });

      expect(res.status).toBe(404);
      await expectNoWrites(foreign.tenantId);
    });

    it('sistem yazıcısı ayrık ve çalışır: iç çağrı generateFromRuleEngine RULE_ENGINE_GENERATOR ile yazar', async () => {
      const f = await fixture('rr-system');
      jest.spyOn(engine, 'generateClaimItems').mockReturnValueOnce(TWO_SUPPORTED as any);
      const created = await claimItems.generateFromRuleEngine(f.tenantId, f.authorized, f.caseId, 'TEST_SUB', {}, {});

      expect(created).toHaveLength(2);
      expect(outerSystemWrites().map((c) => c[0].route)).toEqual(['RULE_ENGINE_GENERATOR', 'RULE_ENGINE_GENERATOR']);
      expect(humanGateSpy).not.toHaveBeenCalled();
      expect(await prisma.claimItem.count({ where: { tenantId: f.tenantId } })).toBe(2);
    });
  });
});
