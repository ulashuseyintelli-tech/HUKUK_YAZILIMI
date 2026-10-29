// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: expense-tenant-boundary.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, ForbiddenException, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseModule } from '../../case/case.module';
import { CostPackageModule } from '../../cost-package/cost-package.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { StageTriggerModule } from '../../stage-trigger/stage-trigger.module';
import { ExpenseRequestService } from '../expense-request.service';
import { EXPENSE_VIEW_ALL_KEY, EXPENSE_VIEW_SCOPE_FLAG } from '../expense-view-scope';

/**
 * F02-B dilim 2 — masraf talebi LİSTE (GET /expense-requests) ve İSTATİSTİK (GET /expense-requests/stats) görünüm kapsamı.
 * GERÇEK HTTP (ExpenseRequestController + guard zinciri) + disposable PostgreSQL. Owner kararları (29–30.10.2026):
 *  - İki ayrı anahtar; masraf için `office.expenses.view_all` (F02-B-1 #3047). DENY > ALLOW > NONE.
 *  - Varsayılan kapsam = dosya bağı (CaseLawyer / CaseStaff canView) ∪ oluşturan ∪ onaylayan. Masraf talebi her zaman
 *    dosyaya bağlı (caseId zorunlu) → "dosyasız = atanan/oluşturan" kuralı burada oluşturan/onaylayan olarak görünür.
 *  - ADMIN rolü, rütbe, ReportingLine kapsam ÜRETMEZ; ADMIN/PARTNER'a otomatik grant YOK.
 *  - Geçiş G3: kapsam ETKİNLEŞTİRMESİ ayrı yayın yetkisi → env bayrağı `OFFICE_EXPENSE_VIEW_SCOPE_ENABLED`; KAPALI iken
 *    bugünkü davranış (büro geneli) KORUNUR ve burada karakterize edilir.
 * Kapsam dışı kaydın varlığı sızmaz: liste 200 + boş; istatistik sıfır. Filtreler (caseId/clientId/status) kapsamla KESİŞİR.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('EXPENSE-VIEW-SCOPE DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers['x-test-user-id']) }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeWithDisposableDb('F02-B dilim 2 — masraf liste/istatistik görünüm kapsamı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let service: ExpenseRequestService;
  const suffix = randomUUID().slice(0, 8);
  const tenantId = `test-ci-evs-${suffix}`;
  const originalFlag = process.env[EXPENSE_VIEW_SCOPE_FLAG];

  /** Aktörler — hepsi aynı büro. */
  const u = {
    admin: '', // ADMIN rolü, kartsız, hiçbir dosyada değil; E1/E2/E4'ü OLUŞTURAN
    lawyer: '', // USER + Lawyer kartı; C1'de CaseLawyer
    staff: '', // USER + StaffMember kartı; C2'de CaseStaff canView=true
    staffNoView: '', // USER + StaffMember kartı; C3'te CaseStaff canView=false
    creator: '', // USER kartsız; E3'ü OLUŞTURAN
    approver: '', // USER kartsız; E4'ü ONAYLAYAN
    allow: '', // USER kartsız; view_all ALLOW
    allowDeny: '', // USER kartsız; view_all ALLOW + DENY (DENY baskın)
    nobody: '', // USER kartsız; hiçbir bağ yok
  };
  const c = { c1: '', c2: '', c3: '' };
  const e = { e1: '', e2: '', e3: '', e4: '' };
  let clientId = '';

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
        CostPackageModule,
        StageTriggerModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    service = app.get(ExpenseRequestService);

    await prisma.tenant.create({ data: { id: tenantId, name: `CI EVS ${suffix}`, slug: tenantId } });
    const mkUser = async (label: string, role: 'ADMIN' | 'USER' = 'USER') =>
      (await prisma.user.create({ data: { tenantId, email: `${label}-${suffix}@example.test`, name: label, surname: 'EVS', role } })).id;
    u.admin = await mkUser('admin', 'ADMIN');
    for (const k of ['lawyer', 'staff', 'staffNoView', 'creator', 'approver', 'allow', 'allowDeny', 'nobody'] as const) u[k] = await mkUser(k);

    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'EVS müvekkil', displayName: 'EVS müvekkil' } })).id;
    for (const k of ['c1', 'c2', 'c3'] as const) {
      c[k] = (await prisma.case.create({ data: { tenantId, fileNumber: `CI-EVS-${k}-${suffix}`, type: 'GENERAL_EXECUTION' } })).id;
    }

    // Kartlar + dosya bağları
    const lawyer = await prisma.lawyer.create({ data: { tenantId, userId: u.lawyer, name: 'Av', surname: 'EVS' } });
    await prisma.caseLawyer.create({ data: { caseId: c.c1, lawyerId: lawyer.id } });
    const staff = await prisma.staffMember.create({ data: { tenantId, userId: u.staff, firstName: 'Per', lastName: 'EVS', staffType: 'DIGER' } });
    await prisma.caseStaff.create({ data: { caseId: c.c2, staffMemberId: staff.id, roleOnCase: 'KONTROL', canView: true } });
    const staffNoView = await prisma.staffMember.create({ data: { tenantId, userId: u.staffNoView, firstName: 'Per2', lastName: 'EVS', staffType: 'DIGER' } });
    await prisma.caseStaff.create({ data: { caseId: c.c3, staffMemberId: staffNoView.id, roleOnCase: 'ARSIV', canView: false } });

    // İzinler (F02-B-1 satırları doğrudan; GLOBAL, süresiz)
    const grant = (subjectUserId: string, effect: 'ALLOW' | 'DENY') =>
      prisma.permissionGrant.create({ data: { tenantId, subjectUserId, permissionKey: EXPENSE_VIEW_ALL_KEY, effect, scope: 'GLOBAL' } });
    await grant(u.allow, 'ALLOW');
    await grant(u.allowDeny, 'ALLOW');
    await grant(u.allowDeny, 'DENY');

    // Talepler
    const mkExpense = async (caseId: string, createdById: string, totalAmount: number, extra: Record<string, unknown> = {}) =>
      (await prisma.expenseRequest.create({
        data: { tenantId, caseId, clientId, createdById, totalAmount, currency: 'TRY', stageCode: 'SEIZURE', gateType: 'NON_BLOCKING', status: 'PENDING', ...extra } as never,
      })).id;
    e.e1 = await mkExpense(c.c1, u.admin, 100);
    e.e2 = await mkExpense(c.c2, u.admin, 200);
    e.e3 = await mkExpense(c.c3, u.creator, 300, { status: 'SENT' });
    e.e4 = await mkExpense(c.c3, u.admin, 400, { status: 'RECEIVED', paidAmount: 400, approvedById: u.approver });
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[EXPENSE_VIEW_SCOPE_FLAG];
    else process.env[EXPENSE_VIEW_SCOPE_FLAG] = originalFlag;
    await app?.close();
    await prisma.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.expenseRequest.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.staffMember.deleteMany({ where: { tenantId } }).catch(() => undefined); // Tenant FK yok
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const list = async (actor: string, query = '') => {
    const res = await http().get(`/expense-requests${query}`).set('x-test-user-id', actor);
    expect(res.status).toBe(200);
    return (res.body as Array<{ id: string }>).map((r) => r.id).sort();
  };
  const stats = async (actor: string, query = '') => {
    const res = await http().get(`/expense-requests/stats${query}`).set('x-test-user-id', actor);
    expect(res.status).toBe(200);
    return res.body as { pending: number; sent: number; received: number; totalReceived: number | string };
  };
  const ids = (...keys: Array<keyof typeof e>) => keys.map((k) => e[k]).sort();
  const ALL = () => ids('e1', 'e2', 'e3', 'e4');

  describe('bayrak KAPALI (varsayılan) — bugünkü davranış karakterize edilir', () => {
    beforeAll(() => {
      delete process.env[EXPENSE_VIEW_SCOPE_FLAG];
    });

    it('kartsız, bağsız USER büro genelini görür; istatistik büro geneli (etkinleştirme ayrı yayın kararı)', async () => {
      expect(await list(u.nobody)).toEqual(ALL());
      expect(await stats(u.nobody)).toMatchObject({ pending: 2, sent: 1, received: 1 });
      expect(Number((await stats(u.nobody)).totalReceived)).toBe(400);
    });

    it('izin servisi/aktör olmadan da bayrak kapalıyken servis büro genelini döner (mevcut çağıranlar kırılmaz)', async () => {
      const rows = await service.findAll(tenantId, {});
      expect(rows.map((r) => r.id).sort()).toEqual(ALL());
    });
  });

  describe('bayrak AÇIK — kapsam uygulanır', () => {
    beforeAll(() => {
      process.env[EXPENSE_VIEW_SCOPE_FLAG] = 'true';
    });

    it('ADMIN rolü kapsam üretmez: kartsız ADMIN yalnız OLUŞTURDUĞU talepleri görür (E3 görünmez)', async () => {
      expect(await list(u.admin)).toEqual(ids('e1', 'e2', 'e4'));
      expect(await stats(u.admin)).toMatchObject({ pending: 2, sent: 0, received: 1 });
    });

    it('avukat kartı + CaseLawyer → yalnız o dosyanın talepleri; istatistik aynı kapsamda', async () => {
      expect(await list(u.lawyer)).toEqual(ids('e1'));
      const s = await stats(u.lawyer);
      expect(s).toMatchObject({ pending: 1, sent: 0, received: 0 });
      expect(Number(s.totalReceived)).toBe(0);
    });

    it('personel kartı + CaseStaff(canView=true) → o dosya; canView=false → hiçbir şey (200 + boş liste, sıfır istatistik)', async () => {
      expect(await list(u.staff)).toEqual(ids('e2'));
      expect(await list(u.staffNoView)).toEqual([]);
      expect(await stats(u.staffNoView)).toMatchObject({ pending: 0, sent: 0, received: 0 });
    });

    it('oluşturan kendi talebini, onaylayan onayladığı talebi görür; bağsız USER hiçbir şey görmez', async () => {
      expect(await list(u.creator)).toEqual(ids('e3'));
      expect(await list(u.approver)).toEqual(ids('e4'));
      expect(Number((await stats(u.approver)).totalReceived)).toBe(400);
      expect(await list(u.nobody)).toEqual([]);
    });

    it('view_all ALLOW → büro geneli; ALLOW + DENY → DENY baskın → varsayılan kapsam (burada boş)', async () => {
      expect(await list(u.allow)).toEqual(ALL());
      expect(await stats(u.allow)).toMatchObject({ pending: 2, sent: 1, received: 1 });
      expect(await list(u.allowDeny)).toEqual([]);
      expect(await stats(u.allowDeny)).toMatchObject({ pending: 0, sent: 0, received: 0 });
    });

    it('filtreler kapsamla KESİŞİR: kapsam dışı dosya için caseId filtresi boş döner; ALLOW için aynı filtre dolu', async () => {
      expect(await list(u.lawyer, `?caseId=${c.c2}`)).toEqual([]);
      expect(await stats(u.lawyer, `?caseId=${c.c2}`)).toMatchObject({ pending: 0, sent: 0, received: 0 });
      expect(await list(u.allow, `?caseId=${c.c2}`)).toEqual(ids('e2'));
      expect(await list(u.admin, `?status=SENT`)).toEqual([]);
      expect(await list(u.creator, `?status=SENT`)).toEqual(ids('e3'));
      expect(await list(u.allow, `?clientId=${clientId}`)).toEqual(ALL());
    });

    it('FAIL-CLOSED: aktör kimliği olmadan servis çağrısı 403 EXPENSE_VIEW_SCOPE_UNRESOLVED (liste de istatistik de)', async () => {
      await expect(service.findAll(tenantId, {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getStats(tenantId)).rejects.toMatchObject({ response: { code: 'EXPENSE_VIEW_SCOPE_UNRESOLVED' } });
    });
  });
});
