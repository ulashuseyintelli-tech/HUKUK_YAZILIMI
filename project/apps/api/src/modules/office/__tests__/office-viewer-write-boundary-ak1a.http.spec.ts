/**
 * AK-1a — VIEWER için OFFICE SALT-OKUMA sınırı (owner GO 2026-09-10) — GERÇEK Nest HTTP pipeline (DB YOK).
 *
 * ÖLÇÜLEN (#2557 karakterizasyonu): F01 kapısı `UserRole`'u yalnız ADMIN kısa yolu olarak okur; VIEWER,
 *   bağlı avukatı PARTNER/MANAGER ya da delege (`canApproveOfficeActions`) ise F01 YAZMA rotalarından geçiyordu.
 * KURAL: VIEWER OFFICE yazma rotalarında (POST/PUT/PATCH/DELETE) 403 `OFFICE_WRITE_DENIED_VIEWER` alır ve servis
 *   HİÇ çağrılmaz (ret ilk kalıcı yazmadan önce). OKUMA davranışı DEĞİŞMEZ: bağlı VIEWER F01 GET'lerinden bugünkü
 *   gibi geçer. Diğer roller (ADMIN; PARTNER/MANAGER/delege avukata bağlı USER) aynen yazar.
 *
 * Kanıt sınıfı: TEST (kontrollü Nest app + gerçek guard + gerçek OfficeApprovalService yüklemi, sahte kullanıcı
 * satırları). PRODUCTION DAVRANIŞ KANITI DEĞİLDİR.
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  RequestMethod,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { OfficeController } from '../office.controller';
import { OfficeService } from '../office.service';
import { LawyerController } from '../../lawyer/lawyer.controller';
import { LawyerService } from '../../lawyer/lawyer.service';
import { StaffController } from '../../staff/staff.controller';
import { StaffService } from '../../staff/staff.service';
import { OfficeApprovalControlledExecutionController } from '../../office-approval/office-approval-controlled-execution.controller';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GuidedOpenObserveService } from '../../permission-diagnostics/guided-open-observe.service';

const TENANT = 'tenant-A';
const OFFICE = 'office-A';

type ActorRow = {
  id: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  lawyer: { lawyerRank: string; canApproveOfficeActions: boolean } | null;
};

/** TEST-ONLY aktör tablosu — `isF01ActorAuthorized` select şekliyle birebir. */
const ACTORS: Record<string, ActorRow> = {
  'viewer-partner': { id: 'u-vp', role: 'VIEWER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  'viewer-manager': { id: 'u-vm', role: 'VIEWER', lawyer: { lawyerRank: 'MANAGER', canApproveOfficeActions: false } },
  'viewer-delegate': { id: 'u-vd', role: 'VIEWER', lawyer: { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true } },
  viewer: { id: 'u-v', role: 'VIEWER', lawyer: null },
  admin: { id: 'u-admin', role: 'ADMIN', lawyer: null },
  partner: { id: 'u-p', role: 'USER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  manager: { id: 'u-m', role: 'USER', lawyer: { lawyerRank: 'MANAGER', canApproveOfficeActions: false } },
  delegate: { id: 'u-d', role: 'USER', lawyer: { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true } },
};
const LINKED_VIEWERS = ['viewer-partner', 'viewer-manager', 'viewer-delegate'] as const;
const WRITERS = ['admin', 'partner', 'manager', 'delegate'] as const;

/** TEST-ONLY JWT yerine geçen guard: `x-test-actor` başlığı → `request.user` (DB rolüyle aynı). */
@Injectable()
class TestActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-test-actor'] as string | undefined;
    if (!key || !ACTORS[key]) throw new UnauthorizedException();
    const a = ACTORS[key];
    req.user = { id: a.id, tenantId: TENANT, role: a.role };
    return true;
  }
}

/** Sahte prisma: yalnız gerçek F01 yükleminin okuduğu `user.findUnique` şekli. */
const fakePrisma = {
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const a = Object.values(ACTORS).find((x) => x.id === where.id);
      if (!a) return null;
      return {
        role: a.role,
        isActive: true,
        tenantId: TENANT,
        staffMember: null,
        lawyer: a.lawyer ? { officeId: OFFICE, ...a.lawyer } : null,
      };
    }),
  },
};

/** Her metodu çağrı sayan servis sahtesi — servisin HİÇ çağrılmadığını kanıtlamak için. */
const NOT_METHODS = new Set([
  'then', 'constructor', 'onModuleInit', 'onApplicationBootstrap', 'onModuleDestroy',
  'beforeApplicationShutdown', 'onApplicationShutdown', 'toJSON', 'inspect', 'asymmetricMatch', 'nodeType',
]);
const autoMock = () => {
  const calls: string[] = [];
  const fns: Record<string, jest.Mock> = {};
  const proxy = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      if (typeof prop !== 'string' || NOT_METHODS.has(prop)) return undefined;
      if (!fns[prop]) {
        fns[prop] = jest.fn(async () => {
          calls.push(prop);
          return { ok: true };
        });
      }
      return fns[prop];
    },
  });
  return { proxy, calls };
};
const officeSvc = autoMock();
const lawyerSvc = autoMock();
const staffSvc = autoMock();
const allCalls = () => [...officeSvc.calls, ...lawyerSvc.calls, ...staffSvc.calls];

type Route = { method: 'post' | 'put' | 'patch' | 'delete'; path: string; body?: object; adminOnly?: boolean };
const WRITE_ROUTES: Route[] = [
  { method: 'put', path: '/office', body: { name: 'Buro' } },
  { method: 'post', path: '/office/bank-accounts', body: { bankName: 'Banka', iban: 'TR000000000000000000000000' } },
  { method: 'delete', path: '/office/bank-accounts/BA1' },
  // SMTP/SMS güncellemesi handler içinde ayrıca ADMIN ister (WP-4c-hotfix-1) — yazan rol listesi ADMIN.
  { method: 'put', path: '/office/smtp-settings', body: { smtpHost: 'mail.ornek.test' }, adminOnly: true },
  { method: 'post', path: '/lawyers', body: { name: 'Ada', surname: 'Lovelace' } },
  { method: 'put', path: '/lawyers/L1', body: { phone: '05320000000' } },
  { method: 'patch', path: '/lawyers/L1', body: { phone: '05320000000' } },
  { method: 'delete', path: '/lawyers/L1' },
  { method: 'put', path: '/lawyers/order/update', body: { lawyerIds: ['L1'] } },
  { method: 'put', path: '/lawyers/defaults/set', body: { lawyerIds: ['L1'] } },
  { method: 'post', path: '/staff', body: { firstName: 'Ayse', lastName: 'Kaya', staffType: 'DIGER' } },
  { method: 'put', path: '/staff/S1', body: { phone: '05320000000' } },
  { method: 'delete', path: '/staff/S1' },
  { method: 'put', path: '/staff/order/update', body: { staffIds: ['S1'] } },
];
const READ_ROUTES = ['/office', '/office/smtp-settings', '/lawyers'];

describe('AK-1a — VIEWER OFFICE yazma rotalarında reddedilir, okuma değişmez (HTTP)', () => {
  let app: INestApplication;
  const approval = new OfficeApprovalService(fakePrisma as any, { log: jest.fn() } as any);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OfficeController, LawyerController, StaffController],
      providers: [
        { provide: OfficeService, useValue: officeSvc.proxy },
        { provide: LawyerService, useValue: lawyerSvc.proxy },
        { provide: StaffService, useValue: staffSvc.proxy },
        { provide: OfficeApprovalService, useValue: approval },
        { provide: GuidedOpenObserveService, useValue: { observe: jest.fn() } },
        OfficeF01AuthorizationGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestActorGuard)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    officeSvc.calls.length = 0;
    lawyerSvc.calls.length = 0;
    staffSvc.calls.length = 0;
  });

  const send = (r: Route, actor: string) => {
    const req = request(app.getHttpServer())[r.method](r.path).set('x-test-actor', actor);
    return r.body ? req.send(r.body) : req;
  };

  it('metadata: OFFICE yazma handler\'larının TAMAMI OfficeF01AuthorizationGuard taşır (kapsamın kanıtı)', () => {
    const WRITE = new Set([RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE]);
    const seen: string[] = [];
    for (const ctrl of [OfficeController, LawyerController, StaffController, OfficeApprovalControlledExecutionController]) {
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = (ctrl.prototype as any)[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const verb = Reflect.getMetadata(METHOD_METADATA, handler);
        if (verb === undefined || !WRITE.has(verb)) continue;
        const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
        seen.push(`${ctrl.name}.${name}`);
        expect({ handler: `${ctrl.name}.${name}`, f01: guards.includes(OfficeF01AuthorizationGuard) }).toEqual({
          handler: `${ctrl.name}.${name}`,
          f01: true,
        });
      }
    }
    // Bakıldığının kanıtı: office 10 · lawyers 6 · staff 4 · kontrollü yürütme 2.
    expect(seen).toHaveLength(22);
  });

  describe.each(WRITE_ROUTES)('$method $path', (route) => {
    it.each([...LINKED_VIEWERS])('bağlı VIEWER (%s) → 403 OFFICE_WRITE_DENIED_VIEWER; servis HİÇ çağrılmaz', async (actor) => {
      const res = await send(route, actor);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('OFFICE_WRITE_DENIED_VIEWER');
      expect(allCalls()).toEqual([]);
    });

    it('bağsız VIEWER → 403; servis HİÇ çağrılmaz (değişmedi)', async () => {
      const res = await send(route, 'viewer');
      expect(res.status).toBe(403);
      expect(allCalls()).toEqual([]);
    });

    it.each(route.adminOnly ? ['admin'] : [...WRITERS])('yazan rol %s → kapıdan geçer, servis çağrılır (değişmedi)', async (actor) => {
      const res = await send(route, actor);
      expect(res.status).toBeLessThan(400);
      expect(allCalls().length).toBeGreaterThan(0);
    });
  });

  describe.each(READ_ROUTES)('GET %s — OKUMA değişmez', (path) => {
    it.each([...LINKED_VIEWERS])('bağlı VIEWER (%s) → 200, servis çağrılır', async (actor) => {
      const res = await request(app.getHttpServer()).get(path).set('x-test-actor', actor);
      expect(res.status).toBe(200);
      expect(allCalls().length).toBeGreaterThan(0);
    });

    it('bağsız VIEWER → 403 (değişmedi)', async () => {
      const res = await request(app.getHttpServer()).get(path).set('x-test-actor', 'viewer');
      expect(res.status).toBe(403);
      expect(allCalls()).toEqual([]);
    });
  });
});
