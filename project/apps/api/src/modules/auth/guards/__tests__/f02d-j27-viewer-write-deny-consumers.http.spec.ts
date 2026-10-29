/**
 * F02-D / J-27 — VIEWER (salt okuyucu) YAZMA REDDİ: ilgili consumer'larda uygulama (owner F02 talimatı 29.10.2026).
 *
 * Kapalı kural (yeniden sorulmaz): VIEWER yazamaz — OWN-13 §51 D01/D02 (CLIENT), AK-1a `isOfficeWriteDeniedForRole`
 * (OFFICE), B4/B6 `ViewerWriteDenyGuard` (owner GO 2026-09-27). Bu spec aynı yüklemi, bugüne kadar yalnız JWT ile
 * korunan Claude şeridi consumer'larına taşıyan uygulamayı KANITLAR.
 *
 * Yöntem: yazma rotaları controller META VERİSİNDEN keşfedilir (yeni rota eklenince otomatik kapsanır). Gerçek Nest
 * HTTP hattı: gerçek JWT + JwtStrategy + AuthService.validateUser (rol DB satırından; sahte PrismaService), gerçek
 * guard zinciri; servisler stub (yalnız "çağrıldı mı" kaydeder). DB YOK; dış sisteme çağrı YOK.
 *
 * Kanıtlanan sözleşme:
 *  1. VIEWER → her yazma rotasında 403 `VIEWER_WRITE_DENIED`; servis HİÇ çağrılmaz (yazma 0).
 *  2. USER → guard geçer (403 değil). GET rotaları VIEWER için 403 değil (okuma değişmez).
 *  3. `@AllowViewerReadOnlyPost` ile işaretli SAF POST'lar (şablon önizleme, kambiyo zinciri analizi) VIEWER'a açık.
 *  4. Portal yönetici belge kararı (approve/reject) metot düzeyinde JwtAuthGuard + ViewerWriteDenyGuard taşır (statik).
 *
 * Kapsam dışı (bu PR'da DEĞİŞMEZ): poa / client-notification (Codex şeridi), user `me/password` (öz-servis),
 * auth ve portal KULLANICI rotaları, office/lawyer/staff (zaten OfficeF01AuthorizationGuard), client.controller ve
 * client-address (zaten servis düzeyi VIEWER DENY).
 */
jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('pdf-poppler is stubbed in unit tests'); } }));

import 'reflect-metadata';
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { PrismaService } from '../../../../prisma/prisma.service';
import { AuthService } from '../../auth.service';
import { JwtStrategy } from '../../strategies/jwt.strategy';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { VIEWER_WRITE_DENIED, ViewerWriteDenyGuard } from '../viewer-write-deny.guard';

import { ClientApprovalController } from '../../../client-approval/client-approval.controller';
import { ClientApprovalService } from '../../../client-approval/client-approval.service';
import { ClientStatementController } from '../../../client-statement/client-statement.controller';
import { ClientStatementMonthlyDeliveryService } from '../../../client-statement/client-statement-monthly-delivery.service';
import { ClientStatementService } from '../../../client-statement/client-statement.service';
import { ClientIntelStatementController } from '../../../client-intel-statement/client-intel-statement.controller';
import { ClientIntelStatementService } from '../../../client-intel-statement/client-intel-statement.service';
import { DocumentController } from '../../../document/document.controller';
import { DocumentService } from '../../../document/document.service';
import { DocumentTemplateService } from '../../../document/document-template.service';
import { TaskController } from '../../../task/task.controller';
import { TaskService } from '../../../task/task.service';
import { CaseInstrumentController } from '../../../case-instrument/case-instrument.controller';
import { CaseInstrumentService } from '../../../case-instrument/case-instrument.service';
import { CaseLeaseController } from '../../../case-lease/case-lease.controller';
import { CaseLeaseService } from '../../../case-lease/case-lease.service';
import { CaseJudgmentController } from '../../../case-judgment/case-judgment.controller';
import { CaseJudgmentService } from '../../../case-judgment/case-judgment.service';
import { CaseCollateralController } from '../../../case-collateral/case-collateral.controller';
import { CaseCollateralService } from '../../../case-collateral/case-collateral.service';
import { CaseStatusController } from '../../../case-status/case-status.controller';
import { CaseStatusService } from '../../../case-status/case-status.service';
import { FinancialCaseCloseApprovalService } from '../../../case-status/financial-case-close-approval.service';
import { GuidedOpenObserveService } from '../../../permission-diagnostics/guided-open-observe.service';
import { GuidedEdgeGateService } from '../../../permission-diagnostics/guided-edge/guided-edge-gate.service';
import { OfficeApprovalShadowService } from '../../../office-approval/office-approval-shadow.service';
import { OfficeApprovalService } from '../../../office-approval/office-approval.service';
import { ClientLegalHoldController } from '../../../client/client-legal-hold.controller';
import { ClientLegalHoldService } from '../../../client/client-legal-hold.service';
import { ClientConsentController } from '../../../client/client-consent.controller';
import { ClientConsentService } from '../../../client/client-consent.service';
import { ClientSpecialCategoryController } from '../../../client/client-special-category.controller';
import { ClientSpecialCategoryService } from '../../../client/client-special-category.service';
import { ClientKvkkRightsController } from '../../../client/client-kvkk-rights.controller';
import { ClientDisclosureService } from '../../../client/client-disclosure.service';
import { ClientDataSubjectRequestService } from '../../../client/client-data-subject-request.service';
import { PortalController } from '../../../portal/portal.controller';

const SECRET = 'f02d-j27-viewer-write-deny-local-test-secret-at-least-32-bytes';
const TENANT = 'tenant-j27';
const ALLOW_VIEWER_READ_ONLY_POST = 'allowViewerReadOnlyPost'; // viewer-write-deny.guard.ts ile aynı anahtar

/** TEST-ONLY aktörler — rol, JwtStrategy → AuthService.validateUser üzerinden "DB" satırından okunur. */
const ACTORS = {
  // VIEWER'ın bağlı avukatı PARTNER olsa bile yazamaz: rol kapısı rütbeden ÖNCE gelir.
  viewer: { id: 'u-j27-viewer', email: 'viewer@example.test', role: 'VIEWER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  user: { id: 'u-j27-user', email: 'user@example.test', role: 'USER', lawyer: null },
} as const;
type ActorKey = keyof typeof ACTORS;

const dbRow = (a: (typeof ACTORS)[ActorKey]) => ({
  id: a.id, tenantId: TENANT, email: a.email, role: a.role, isActive: true, tokenVersion: 0,
  passwordHash: 'x'.repeat(20), name: 'Test', surname: a.role, lawyer: a.lawyer, staffMember: null,
  tenant: { id: TENANT, lifecycle: 'ACTIVE' },
});
const fakePrisma = {
  user: {
    findUnique: async (args: { where: { id: string } }) => {
      const a = Object.values(ACTORS).find((x) => x.id === args.where.id);
      return a ? dbRow(a) : null;
    },
  },
};

/** Stub servis: her metod çağrısını kaydeder, hiçbir şey yapmaz. */
const serviceCalls: string[] = [];
const NEST_LIFECYCLE = new Set(['onModuleInit', 'onApplicationBootstrap', 'onModuleDestroy', 'beforeApplicationShutdown', 'onApplicationShutdown']);
function stubService(name: string): object {
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (NEST_LIFECYCLE.has(String(prop))) return undefined;
      return (..._args: unknown[]) => { serviceCalls.push(`${name}.${String(prop)}`); return Promise.resolve({ stubbed: true }); };
    },
  });
}

/** J-27 kapsamındaki consumer controller'lar (sınıf düzeyi guard beklenir; CaseStatus: metot düzeyi). */
const CLASS_GUARDED = [
  ClientApprovalController, ClientStatementController, ClientIntelStatementController,
  DocumentController, TaskController,
  CaseInstrumentController, CaseLeaseController, CaseJudgmentController, CaseCollateralController,
  ClientLegalHoldController, ClientConsentController, ClientSpecialCategoryController, ClientKvkkRightsController,
];
const MOUNTED = [...CLASS_GUARDED, CaseStatusController];

interface Route { ctrl: string; handler: string; method: RequestMethod; url: string; readOnlyPost: boolean }
const WRITE_METHODS = new Set([RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE]);
const VERB: Record<number, 'get' | 'post' | 'put' | 'delete' | 'patch'> = {
  [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put', [RequestMethod.DELETE]: 'delete', [RequestMethod.PATCH]: 'patch',
};

function discoverRoutes(ctrl: Function): Route[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
  const proto = ctrl.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor' && typeof proto[n] === 'function')
    .flatMap((handler) => {
      const method = Reflect.getMetadata(METHOD_METADATA, proto[handler]) as RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, proto[handler]) as string | undefined;
      if (method === undefined || path === undefined || !(method in VERB)) return [];
      const url = ('/api/' + [base, path].join('/')).replace(/\/+/g, '/').replace(/\/$/, '').replace(/:[A-Za-z_]+/g, 'x');
      const readOnlyPost = Reflect.getMetadata(ALLOW_VIEWER_READ_ONLY_POST, proto[handler]) === true;
      return [{ ctrl: ctrl.name, handler, method, url, readOnlyPost }];
    });
}

const ROUTES = MOUNTED.flatMap(discoverRoutes);
const WRITE_ROUTES = ROUTES.filter((r) => WRITE_METHODS.has(r.method) && !r.readOnlyPost);
const READ_ONLY_POSTS = ROUTES.filter((r) => r.readOnlyPost);
const GET_ROUTES = ROUTES.filter((r) => r.method === RequestMethod.GET);

describe('F02-D / J-27: VIEWER yazma reddi — consumer uygulaması (gerçek JWT + Nest HTTP, stub servisler)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '5m' } }),
      ],
      controllers: MOUNTED,
      providers: [
        AuthService, JwtStrategy, JwtAuthGuard, ViewerWriteDenyGuard,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: ConfigService, useValue: { get: (key: string, fallback?: unknown) => (key === 'JWT_SECRET' ? SECRET : fallback) } },
        { provide: ClientApprovalService, useValue: stubService('ClientApprovalService') },
        { provide: ClientStatementService, useValue: stubService('ClientStatementService') },
        { provide: ClientStatementMonthlyDeliveryService, useValue: stubService('ClientStatementMonthlyDeliveryService') },
        { provide: OfficeApprovalService, useValue: stubService('OfficeApprovalService') },
        { provide: ClientIntelStatementService, useValue: stubService('ClientIntelStatementService') },
        { provide: DocumentService, useValue: stubService('DocumentService') },
        { provide: DocumentTemplateService, useValue: stubService('DocumentTemplateService') },
        { provide: TaskService, useValue: stubService('TaskService') },
        { provide: CaseInstrumentService, useValue: stubService('CaseInstrumentService') },
        { provide: CaseLeaseService, useValue: stubService('CaseLeaseService') },
        { provide: CaseJudgmentService, useValue: stubService('CaseJudgmentService') },
        { provide: CaseCollateralService, useValue: stubService('CaseCollateralService') },
        { provide: CaseStatusService, useValue: stubService('CaseStatusService') },
        { provide: FinancialCaseCloseApprovalService, useValue: stubService('FinancialCaseCloseApprovalService') },
        { provide: GuidedOpenObserveService, useValue: stubService('GuidedOpenObserveService') },
        { provide: GuidedEdgeGateService, useValue: stubService('GuidedEdgeGateService') },
        { provide: OfficeApprovalShadowService, useValue: stubService('OfficeApprovalShadowService') },
        { provide: ClientLegalHoldService, useValue: stubService('ClientLegalHoldService') },
        { provide: ClientConsentService, useValue: stubService('ClientConsentService') },
        { provide: ClientSpecialCategoryService, useValue: stubService('ClientSpecialCategoryService') },
        { provide: ClientDisclosureService, useValue: stubService('ClientDisclosureService') },
        { provide: ClientDataSubjectRequestService, useValue: stubService('ClientDataSubjectRequestService') },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => { await app?.close(); });
  beforeEach(() => { serviceCalls.length = 0; });

  const bearer = (key: ActorKey) => {
    const a = ACTORS[key];
    return `Bearer ${jwt.sign({ sub: a.id, tenantId: TENANT, email: a.email, role: a.role, tokenVersion: 0 })}`;
  };
  const call = (r: Route, key: ActorKey) =>
    request(app.getHttpServer())[VERB[r.method]](r.url).set('Authorization', bearer(key)).send({});

  it('keşif kör değil: yazma rotası ≥ 40, GET ≥ 10, saf POST = 2 (şablon önizleme + zincir analizi)', () => {
    expect(WRITE_ROUTES.length).toBeGreaterThanOrEqual(40);
    expect(GET_ROUTES.length).toBeGreaterThanOrEqual(10);
    expect(READ_ONLY_POSTS.map((r) => `${r.ctrl}.${r.handler}`).sort()).toEqual(
      ['CaseInstrumentController.analyzeChain', 'DocumentController.previewTemplate'],
    );
  });

  describe('statik: guard zinciri', () => {
    it.each(CLASS_GUARDED.map((c) => [c.name, c] as const))('%s sınıf düzeyinde ViewerWriteDenyGuard taşır', (_n, ctrl) => {
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? [];
      expect(guards).toContain(ViewerWriteDenyGuard);
    });
    it('CaseStatusController.changeStatus metot düzeyinde JwtAuthGuard + ViewerWriteDenyGuard taşır', () => {
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, CaseStatusController.prototype.changeStatus) ?? [];
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, ViewerWriteDenyGuard]));
    });
    it.each(['approveDocument', 'rejectDocument'])('PortalController.%s (yönetici belge kararı) JwtAuthGuard + ViewerWriteDenyGuard taşır', (h) => {
      const handler = (PortalController.prototype as unknown as Record<string, unknown>)[h];
      expect(typeof handler).toBe('function');
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler as object) ?? [];
      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, ViewerWriteDenyGuard]));
    });
  });

  describe('VIEWER → 403 VIEWER_WRITE_DENIED, servis çağrısı 0', () => {
    it.each(WRITE_ROUTES.map((r) => [`${RequestMethod[r.method]} ${r.url} (${r.ctrl}.${r.handler})`, r] as const))('%s', async (_n, r) => {
      const res = await call(r, 'viewer');
      expect(res.status).toBe(403);
      expect(res.body?.code).toBe(VIEWER_WRITE_DENIED);
      expect(serviceCalls).toEqual([]);
    });
  });

  describe('USER → guard geçer (403 değil); okuma ve saf POST VIEWER için açık', () => {
    // "VIEWER guard'ı tarafından engellenmedi" sözleşmesi: 401 değil ve VIEWER_WRITE_DENIED değil. Rotanın kendi
    // mevcut kapıları (ör. run-now'da elevated eşiği → USER için 403 ELEVATED_DENIED) bu spec'in konusu değildir.
    const notBlockedByViewerGuard = (res: request.Response) => {
      expect(res.status).not.toBe(401);
      expect(res.body?.code).not.toBe(VIEWER_WRITE_DENIED);
    };
    it.each(WRITE_ROUTES.map((r) => [`${RequestMethod[r.method]} ${r.url}`, r] as const))('USER %s', async (_n, r) => {
      notBlockedByViewerGuard(await call(r, 'user'));
    });
    it.each(GET_ROUTES.map((r) => [`GET ${r.url}`, r] as const))('VIEWER okuma %s → engellenmez', async (_n, r) => {
      notBlockedByViewerGuard(await call(r, 'viewer'));
    });
    it.each(READ_ONLY_POSTS.map((r) => [`POST ${r.url}`, r] as const))('VIEWER saf POST %s → engellenmez (AllowViewerReadOnlyPost)', async (_n, r) => {
      notBlockedByViewerGuard(await call(r, 'viewer'));
    });
    it('JWT yoksa 401 (guard zinciri gerçek)', async () => {
      const r = WRITE_ROUTES[0];
      const res = await request(app.getHttpServer())[VERB[r.method]](r.url).send({});
      expect(res.status).toBe(401);
    });
  });
});
