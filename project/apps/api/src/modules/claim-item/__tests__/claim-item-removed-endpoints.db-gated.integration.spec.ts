import {
  CanActivate,
  Controller,
  ExecutionContext,
  INestApplication,
  Post,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { ClaimItemModule } from '../claim-item.module';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';

/**
 * Kaldırılmış ClaimItem uçlarının hata sözleşmesi + fer'i kalem uçlarının insan kapısı (owner GO 2026-09-28, seçenek B).
 *
 *   POST /claim-items/case/:caseId/add-interest          → 410 CLAIM_ITEM_ENDPOINT_REMOVED (yazma yok)
 *   POST /claim-items/case/:caseId/recalculate-interest  → 410 CLAIM_ITEM_ENDPOINT_REMOVED (yazma yok)
 *   POST /claim-items/case/:caseId/add-expense|add-fee|add-attorney-fee → mevcut insan kapısı (DEĞİŞMEDİ)
 *
 * Önceki davranış: iki kaldırılmış uç 2026-01-15'ten beri hiçbir şey YAZMIYOR, düz `Error` ile 500 dönüyor ve global
 * AllExceptionsFilter her çağrıyı ErrorLog'a sunucu hatası olarak yazıyordu. Bu bir yetki açığı DEĞİLDİ; düzeltme hata
 * sözleşmesi temizliğidir.
 *
 * Gerçek giriş yolu: HTTP + main.ts global ValidationPipe → ClaimItemController (JwtAuthGuard + ViewerWriteDenyGuard)
 * → gerçek Nest DI (ClaimItemModule + global ErrorLogModule/AllExceptionsFilter) → disposable PostgreSQL. Yalnız JWT imza
 * doğrulaması DB'den okunan test kimliğiyle değiştirilir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CLAIM-ITEM-REMOVED-ENDPOINTS DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
const PROBE_PATH = '/claim-items-errorlog-probe';

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif/bilinmeyen kullanıcı 401. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers['x-test-user-id'];
    if (!header) throw new UnauthorizedException();
    const user = await this.db().user.findUnique({ where: { id: String(header) }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

/**
 * ErrorLog ölçümünün KÖR olmadığının pozitif kontrolü: aynı kablolamada düz `Error` (500) gerçekten ErrorLog'a yazılır.
 * Kaldırılmış uçların eski davranışı bununla aynıydı.
 */
@Controller(PROBE_PATH.slice(1))
@UseGuards(JwtAuthGuard)
class ErrorLogProbeController {
  @Post()
  boom(): never {
    throw new Error('errorlog probe: duz Error (500)');
  }
}

describeWithDisposableDb('Kaldırılmış ClaimItem uçları 410 + fer\'i kalem insan kapısı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let humanGateSpy: jest.SpyInstance;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ErrorLogModule, ClaimItemModule],
      controllers: [ErrorLogProbeController],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    humanGateSpy = jest.spyOn(app.get(ClaimItemWriterRouterService), 'evaluateHuman');
  });

  beforeEach(() => {
    humanGateSpy.mockClear();
  });

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.errorLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  /**
   * Tenant + ofis + dosya. Aktörler (hepsi aynı tenant):
   *  - authorized: USER + LAWYER, dosyada casePermissions.canEditFinance=true
   *  - unauthorized: USER + LAWYER, dosyada yalnız canViewFinance
   *  - viewer: VIEWER + LAWYER, dosyada canEditFinance=true (nesne yetkisi olsa da rol yazamaz)
   */
  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-rmep-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI RMEP ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI RMEP office ${label}` } });
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-RMEP-${label}-${suffix}`, type: 'GENERAL_EXECUTION' },
    });

    async function lawyerActor(key: string, role: 'USER' | 'VIEWER', casePermissions: Record<string, boolean>) {
      const user = await prisma.user.create({
        data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'RMEP', role },
      });
      const lawyer = await prisma.lawyer.create({
        data: { tenantId, officeId: office.id, userId: user.id, name: key, surname: 'RMEP', lawyerRank: 'LAWYER' },
      });
      await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: lawyer.id, casePermissions } });
      return user.id;
    }

    return {
      tenantId,
      caseId: legalCase.id,
      authorized: await lawyerActor('auth', 'USER', { canEditFinance: true }),
      unauthorized: await lawyerActor('noauth', 'USER', { canViewFinance: true }),
      viewer: await lawyerActor('viewer', 'VIEWER', { canEditFinance: true }),
    };
  }

  function post(path: string, actorUserId: string | null, body: Record<string, unknown> = {}) {
    const req = request(app.getHttpServer()).post(path);
    return (actorUserId ? req.set('x-test-user-id', actorUserId) : req).send(body);
  }

  /** Yazmasızlık: kalem, onay talebi ve denetim kaydı oluşmaz. */
  async function expectNoWrites(tenantId: string) {
    expect(await prisma.claimItem.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { tenantId } })).toBe(0);
  }

  /** AllExceptionsFilter ErrorLog yazımı fire-and-forget → satır görünene kadar sınırlı bekleme. */
  async function waitForErrorLog(tenantId: string, endpoint: string): Promise<number> {
    for (let i = 0; i < 50; i++) {
      const count = await prisma.errorLog.count({ where: { tenantId, endpoint } });
      if (count > 0) return count;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return 0;
  }

  const removed = [
    ['add-interest', { interestType: 'YASAL', isPreInterest: true }],
    ['recalculate-interest', {}],
  ] as const;

  describe.each(removed)('POST /claim-items/case/:caseId/%s (kaldırılmış işlev)', (route, body) => {
    it('yetkili aktör: 410 CLAIM_ITEM_ENDPOINT_REMOVED; FORMATION_CONTEXT_REQUIRED değil; kapı sorulmaz, yazma yok', async () => {
      const f = await fixture(`${route}-auth`);
      const res = await post(`/claim-items/case/${f.caseId}/${route}`, f.authorized, body);

      expect(res.status).toBe(410);
      expect(res.body).toEqual(expect.objectContaining({ code: 'CLAIM_ITEM_ENDPOINT_REMOVED' }));
      expect(typeof res.body.message).toBe('string');
      expect(JSON.stringify(res.body)).not.toContain('FORMATION_CONTEXT_REQUIRED');
      expect(humanGateSpy).not.toHaveBeenCalled();
      await expectNoWrites(f.tenantId);
    });

    it('yetkisiz USER ve başka tenant dosyası da aynı 410 (dosya varlığı sızmaz); yazma yok', async () => {
      const own = await fixture(`${route}-own`);
      const foreign = await fixture(`${route}-foreign`);
      const unauthorized = await post(`/claim-items/case/${own.caseId}/${route}`, own.unauthorized, body);
      const crossTenant = await post(`/claim-items/case/${foreign.caseId}/${route}`, own.authorized, body);
      const missing = await post(`/claim-items/case/no-such-case-${randomUUID()}/${route}`, own.authorized, body);

      for (const res of [unauthorized, crossTenant, missing]) {
        expect(res.status).toBe(410);
        expect(res.body.code).toBe('CLAIM_ITEM_ENDPOINT_REMOVED');
      }
      await expectNoWrites(own.tenantId);
      await expectNoWrites(foreign.tenantId);
    });

    it('VIEWER rota katmanında 403 VIEWER_WRITE_DENIED (410\'dan önce); yazma yok', async () => {
      const f = await fixture(`${route}-viewer`);
      const res = await post(`/claim-items/case/${f.caseId}/${route}`, f.viewer, body);

      expect(res.status).toBe(403);
      expect(res.body).toEqual(expect.objectContaining({ code: 'VIEWER_WRITE_DENIED' }));
      await expectNoWrites(f.tenantId);
    });

    it('kimliksiz ve bilinmeyen kullanıcı 401 (410\'dan önce)', async () => {
      const f = await fixture(`${route}-anon`);
      const anonymous = await post(`/claim-items/case/${f.caseId}/${route}`, null, body);
      const unknown = await post(`/claim-items/case/${f.caseId}/${route}`, `no-such-user-${randomUUID()}`, body);

      expect(anonymous.status).toBe(401);
      expect(unknown.status).toBe(401);
      await expectNoWrites(f.tenantId);
    });
  });

  describe('ErrorLog davranışı (global AllExceptionsFilter, gerçek ErrorLogService → PostgreSQL)', () => {
    it('410 ErrorLog\'a YAZILMAZ; aynı kablolamada düz Error (500) YAZILIR (ölçüm kör değil)', async () => {
      const f = await fixture('errorlog');
      const addInterestPath = `/claim-items/case/${f.caseId}/add-interest`;
      const recalcPath = `/claim-items/case/${f.caseId}/recalculate-interest`;

      expect((await post(addInterestPath, f.authorized, { interestType: 'YASAL' })).status).toBe(410);
      expect((await post(recalcPath, f.authorized)).status).toBe(410);
      // Pozitif kontrol: kaldırılmış uçların ESKİ davranışı (düz Error → 500) bu kablolamada ErrorLog'a düşer.
      expect((await post(PROBE_PATH, f.authorized)).status).toBe(500);
      expect(await waitForErrorLog(f.tenantId, PROBE_PATH)).toBe(1);

      // Probe satırı yazıldıktan sonra (410'lar ondan ÖNCE işlendi) kaldırılmış uçlar için satır yok.
      expect(await prisma.errorLog.count({ where: { tenantId: f.tenantId, endpoint: addInterestPath } })).toBe(0);
      expect(await prisma.errorLog.count({ where: { tenantId: f.tenantId, endpoint: recalcPath } })).toBe(0);
      expect(await prisma.errorLog.count({ where: { tenantId: f.tenantId } })).toBe(1);
    });
  });

  describe('fer\'i kalem uçları: mevcut insan kapısı KORUNUR', () => {
    const feriRoutes = [
      ['add-expense', 'EXPENSE', { amount: 100, description: 'Masraf' }],
      ['add-fee', 'FEE', { amount: 50, description: 'Harç' }],
      ['add-attorney-fee', 'ATTORNEY_FEE', { amount: 1_000 }],
    ] as const;

    it.each(feriRoutes)('%s yetkisiz USER 403 OBJECT_PERMISSION_DENIED; yazma yok', async (route, _itemType, body) => {
      const f = await fixture(`${route}-noauth`);
      const res = await post(`/claim-items/case/${f.caseId}/${route}`, f.unauthorized, body);

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toContain('OBJECT_PERMISSION_DENIED');
      expect(humanGateSpy).toHaveBeenCalledTimes(1);
      await expectNoWrites(f.tenantId);
    });

    it.each(feriRoutes)('%s yetkili: kapıdan %s ile geçer → onay + FORMATION_CONTEXT_REQUIRED; kalem yazılmaz', async (route, itemType, body) => {
      const f = await fixture(`${route}-auth`);
      const res = await post(`/claim-items/case/${f.caseId}/${route}`, f.authorized, body);

      expect(res.status).toBe(400);
      expect(res.body).toEqual(expect.objectContaining({ code: 'FORMATION_CONTEXT_REQUIRED' }));
      expect(humanGateSpy).toHaveBeenCalledTimes(1);
      expect(humanGateSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ operation: 'CREATE', caseId: f.caseId }));
      expect(humanGateSpy.mock.calls[0][0].payload.itemType).toBe(itemType);
      const gate = await humanGateSpy.mock.results[0].value;
      expect(gate.outcome).toBe('OFFICE_APPROVAL_REQUIRED');
      await expectNoWrites(f.tenantId);
    });

    it.each(feriRoutes)('%s VIEWER 403 VIEWER_WRITE_DENIED; kapıya ulaşmaz', async (route, _itemType, body) => {
      const f = await fixture(`${route}-viewer`);
      const res = await post(`/claim-items/case/${f.caseId}/${route}`, f.viewer, body);

      expect(res.status).toBe(403);
      expect(res.body).toEqual(expect.objectContaining({ code: 'VIEWER_WRITE_DENIED' }));
      expect(humanGateSpy).not.toHaveBeenCalled();
      await expectNoWrites(f.tenantId);
    });
  });
});
