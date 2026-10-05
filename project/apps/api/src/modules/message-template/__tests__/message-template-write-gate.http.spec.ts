/**
 * Bildirim şablonu YAZMA kapısı (owner kararı 4, 05.10.2026) — GERÇEK Nest HTTP pipeline (DB YOK).
 *
 * ÖLÇÜLEN (2026-10-01/02, disposable PG + derlenmiş API): şablon uçları yalnız JWT (+ tenant) taşıyordu; `VIEWER` rolü
 *   müvekkile giden `EXPENSE_REQUEST` metnini düzenleyebildi (PUT 200), `USER` `seed` ile şablon yazabildi,
 *   `PUT /client-notifications/templates/:id {isActive:false}` sistem şablonunu pasifleştirebiliyordu.
 * KURAL (owner): VIEWER yazma kapısı eklensin; düzenleme yetkisinde MEVCUT büro ayarları / F01 sözleşmesi yeniden
 *   kullanılsın; kullanıcıya yeni yetki verilmesin. Bu yüzden şablon YAZMA uçları büro ayarlarının yazma rotalarıyla AYNI
 *   `OfficeF01AuthorizationGuard`'ı taşır: VIEWER 403 `OFFICE_WRITE_DENIED_VIEWER` (bağlı avukatı PARTNER / MANAGER / delege
 *   olsa bile); ADMIN ya da aynı büroya bağlı, personel olmayan PARTNER / MANAGER / delege avukat yazar; F01 dışındakiler
 *   403 `OFFICE_F01_AUTHORIZATION_REQUIRED`. Yeni rol, yeni izin kodu, yeni politika YOKTUR.
 * DEĞİŞMEYENLER: OKUMA uçları; şablonu yazmayan önizleme (`POST /message-templates/:id/render`); aynı denetleyicideki şablon
 *   dışı POST'lar (gönderim / bağlantı testi) bu işin kapsamı DIŞINDADIR ve guard taşımaz.
 *
 * Kanıt sınıfı: TEST (kontrollü Nest app + gerçek guard + gerçek OfficeApprovalService yüklemi, sahte kullanıcı satırları).
 * PRODUCTION DAVRANIŞ KANITI DEĞİLDİR.
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
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ClientNotificationAuthorityAdapter } from '../../client-notification/client-notification-authority.adapter';
import { ClientNotificationController } from '../../client-notification/client-notification.controller';
import { ClientNotificationService } from '../../client-notification/client-notification.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { MessageTemplateController } from '../message-template.controller';
import { MessageTemplateModule } from '../message-template.module';
import { MessageTemplateService } from '../message-template.service';

const TENANT = 'tenant-A';
const OFFICE = 'office-A';

type ActorRow = {
  id: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  lawyer: { lawyerRank: string; canApproveOfficeActions: boolean } | null;
  staff?: boolean;
};

/** TEST-ONLY aktör tablosu — `isF01ActorAuthorized` select şekliyle birebir (DB rolü = istek rolü). */
const ACTORS: Record<string, ActorRow> = {
  // F01 yazma aktörleri — büro ayarlarını düzenleyen küme ile AYNI
  admin: { id: 'u-admin', role: 'ADMIN', lawyer: null },
  partner: { id: 'u-p', role: 'USER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  manager: { id: 'u-m', role: 'USER', lawyer: { lawyerRank: 'MANAGER', canApproveOfficeActions: false } },
  delegate: { id: 'u-d', role: 'USER', lawyer: { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true } },
  // VIEWER: bağlı avukatı PARTNER / MANAGER / delege olsa bile yazamaz
  'viewer-partner': { id: 'u-vp', role: 'VIEWER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  'viewer-manager': { id: 'u-vm', role: 'VIEWER', lawyer: { lawyerRank: 'MANAGER', canApproveOfficeActions: false } },
  'viewer-delegate': { id: 'u-vd', role: 'VIEWER', lawyer: { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true } },
  viewer: { id: 'u-v', role: 'VIEWER', lawyer: null },
  // F01 dışı: büro ayarlarını da düzenleyemeyenler
  'plain-lawyer': { id: 'u-pl', role: 'USER', lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: false } },
  'plain-user': { id: 'u-pu', role: 'USER', lawyer: null },
  // personel kimliği, yetki bayrağı yanlışlıkla doğru olsa bile Office aktörü olamaz
  staff: { id: 'u-s', role: 'USER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: true }, staff: true },
};
const WRITERS = ['admin', 'partner', 'manager', 'delegate'] as const;
const LINKED_VIEWERS = ['viewer-partner', 'viewer-manager', 'viewer-delegate'] as const;
const NOT_F01 = ['plain-lawyer', 'plain-user', 'staff'] as const;

/** TEST-ONLY JWT yerine geçen guard: `x-test-actor` başlığı → `request.user`. */
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

/** Sahte prisma: yalnız gerçek F01 yükleminin okuduğu `user.findUnique` ve `office.findUnique` şekli. */
const fakePrisma = {
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const a = Object.values(ACTORS).find((x) => x.id === where.id);
      if (!a) return null;
      return {
        role: a.role,
        isActive: true,
        tenantId: TENANT,
        staffMember: a.staff ? { id: 'staff-1', officeId: OFFICE } : null,
        lawyer: a.lawyer ? { officeId: OFFICE, ...a.lawyer } : null,
      };
    }),
  },
  office: { findUnique: jest.fn(async () => ({ id: OFFICE })) },
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
const templateSvc = autoMock();
const notificationSvc = autoMock();
const authorityAdapter = autoMock();
const allCalls = () => [...templateSvc.calls, ...notificationSvc.calls, ...authorityAdapter.calls];

type Route = {
  handler: string;
  method: 'post' | 'put' | 'delete';
  path: string;
  body?: object;
};
/** Şablonu DB'ye YAZAN yedi uç (iki denetleyici). */
const TEMPLATE_WRITE_ROUTES: Route[] = [
  {
    handler: 'MessageTemplateController.create',
    method: 'post',
    path: '/message-templates',
    body: { code: 'OLCUM', name: 'Olcum', category: 'OTHER', channel: 'EMAIL', body: 'metin' },
  },
  { handler: 'MessageTemplateController.update', method: 'put', path: '/message-templates/T1', body: { body: 'yeni metin' } },
  { handler: 'MessageTemplateController.delete', method: 'delete', path: '/message-templates/T1' },
  { handler: 'MessageTemplateController.seedDefaults', method: 'post', path: '/message-templates/seed' },
  {
    handler: 'ClientNotificationController.createEmailTemplate',
    method: 'post',
    path: '/client-notifications/templates',
    body: { name: 'Olcum', code: 'OLCUM', category: 'BILGILENDIRME', subject: 'Konu', body: 'Govde' },
  },
  {
    handler: 'ClientNotificationController.updateEmailTemplate',
    method: 'put',
    path: '/client-notifications/templates/T1',
    body: { isActive: false },
  },
  {
    handler: 'ClientNotificationController.createDefaultTemplates',
    method: 'post',
    path: '/client-notifications/templates/create-defaults',
  },
];
const READ_ROUTES = [
  '/message-templates',
  '/message-templates/by-code/EXPENSE_REQUEST',
  '/message-templates/T1',
  '/client-notifications/templates',
];

/** Kapsam sınıflaması — her yazma fiilli handler ikisinden TAM birinde olmak zorunda (yeni uç bilinçli karar ister). */
const SCOPE: Record<string, { templateWrite: string[]; outOfScopeWrite: string[] }> = {
  MessageTemplateController: {
    templateWrite: ['create', 'update', 'delete', 'seedDefaults'],
    // şablonu yazmayan önizleme POST'u: okuma davranışı DEĞİŞMEZ
    outOfScopeWrite: ['renderTemplate'],
  },
  ClientNotificationController: {
    templateWrite: ['createEmailTemplate', 'updateEmailTemplate', 'createDefaultTemplates'],
    // şablon dışı gönderim / bağlantı testi uçları: bu işin kapsamı DIŞINDA, değişmedi
    outOfScopeWrite: ['sendEmail', 'sendSms', 'sendBulkEmail', 'testSmtpConnection', 'testSmsConnection', 'testSend'],
  },
};
const WRITE_VERBS = new Set([RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE]);

describe('Şablon YAZMA kapısı — VIEWER reddedilir, düzenleme yetkisi büro ayarları / F01 sözleşmesiyle aynı (HTTP)', () => {
  let app: INestApplication;
  const approval = new OfficeApprovalService(fakePrisma as any, { log: jest.fn() } as any);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MessageTemplateController, ClientNotificationController],
      providers: [
        { provide: MessageTemplateService, useValue: templateSvc.proxy },
        { provide: ClientNotificationService, useValue: notificationSvc.proxy },
        { provide: ClientNotificationAuthorityAdapter, useValue: authorityAdapter.proxy },
        { provide: OfficeApprovalService, useValue: approval },
        OfficeF01AuthorizationGuard,
      ],
    })
      // MessageTemplateController `AuthGuard('jwt')`, ClientNotificationController `JwtAuthGuard` kullanır.
      .overrideGuard(JwtAuthGuard)
      .useClass(TestActorGuard)
      .overrideGuard(AuthGuard('jwt'))
      .useClass(TestActorGuard)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    templateSvc.calls.length = 0;
    notificationSvc.calls.length = 0;
    authorityAdapter.calls.length = 0;
  });

  const send = (r: Route, actor: string) => {
    const req = request(app.getHttpServer())[r.method](r.path).set('x-test-actor', actor);
    return r.body ? req.send(r.body) : req;
  };

  it("metadata: şablon YAZMA handler'larının TAMAMI OfficeF01AuthorizationGuard taşır; kapsam dışı olanlar ve okumalar TAŞIMAZ (kapsamın kanıtı)", () => {
    const seen: Record<string, string[]> = {};
    for (const ctrl of [MessageTemplateController, ClientNotificationController]) {
      const scope = SCOPE[ctrl.name];
      const templateWrite: string[] = [];
      let readHandlers = 0;
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = (ctrl.prototype as any)[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const verb = Reflect.getMetadata(METHOD_METADATA, handler);
        if (verb === undefined) continue;
        const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
        const hasF01 = guards.includes(OfficeF01AuthorizationGuard);
        if (!WRITE_VERBS.has(verb)) {
          readHandlers += 1;
          expect({ handler: `${ctrl.name}.${name}`, f01: hasF01 }).toEqual({ handler: `${ctrl.name}.${name}`, f01: false });
          continue;
        }
        const inTemplateWrite = scope.templateWrite.includes(name);
        const inOutOfScope = scope.outOfScopeWrite.includes(name);
        // her yazma fiilli handler tam bir sınıfta olmalı
        expect({ handler: `${ctrl.name}.${name}`, siniflandirildi: inTemplateWrite !== inOutOfScope }).toEqual({
          handler: `${ctrl.name}.${name}`,
          siniflandirildi: true,
        });
        expect({ handler: `${ctrl.name}.${name}`, f01: hasF01 }).toEqual({
          handler: `${ctrl.name}.${name}`,
          f01: inTemplateWrite,
        });
        if (inTemplateWrite) templateWrite.push(name);
      }
      seen[ctrl.name] = templateWrite.sort();
      // Bakıldığının kanıtı: okuma handler'ları da tarandı.
      expect(readHandlers).toBeGreaterThan(0);
    }
    expect(seen).toEqual({
      MessageTemplateController: [...SCOPE.MessageTemplateController.templateWrite].sort(),
      ClientNotificationController: [...SCOPE.ClientNotificationController.templateWrite].sort(),
    });
    expect(TEMPLATE_WRITE_ROUTES).toHaveLength(7);
  });

  describe.each(TEMPLATE_WRITE_ROUTES)('$method $path', (route) => {
    it.each([...LINKED_VIEWERS])('bağlı VIEWER (%s) → 403 OFFICE_WRITE_DENIED_VIEWER; servis HİÇ çağrılmaz', async (actor) => {
      const res = await send(route, actor);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('OFFICE_WRITE_DENIED_VIEWER');
      expect(allCalls()).toEqual([]);
    });

    it('bağsız VIEWER → 403 OFFICE_WRITE_DENIED_VIEWER; servis HİÇ çağrılmaz', async () => {
      const res = await send(route, 'viewer');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('OFFICE_WRITE_DENIED_VIEWER');
      expect(allCalls()).toEqual([]);
    });

    it.each([...NOT_F01])(
      'F01 dışı aktör (%s) → 403 OFFICE_F01_AUTHORIZATION_REQUIRED; servis HİÇ çağrılmaz (büro ayarlarıyla aynı kural)',
      async (actor) => {
        const res = await send(route, actor);
        expect(res.status).toBe(403);
        expect(res.body.message).toBe('OFFICE_F01_AUTHORIZATION_REQUIRED');
        expect(allCalls()).toEqual([]);
      },
    );

    it.each([...WRITERS])('F01 yazma aktörü %s → kapıdan geçer, servis çağrılır', async (actor) => {
      const res = await send(route, actor);
      expect(res.status).toBeLessThan(400);
      expect(allCalls().length).toBeGreaterThan(0);
    });
  });

  describe.each(READ_ROUTES)('GET %s — OKUMA değişmez', (path) => {
    it.each(['viewer', 'plain-user', 'plain-lawyer', 'admin'])('%s → 200, servis çağrılır', async (actor) => {
      const res = await request(app.getHttpServer()).get(path).set('x-test-actor', actor);
      expect(res.status).toBe(200);
      expect(allCalls().length).toBeGreaterThan(0);
    });
  });

  it('önizleme (POST /message-templates/:id/render) şablonu YAZMAZ → VIEWER için de DEĞİŞMEZ (201, servis çağrılır)', async () => {
    const res = await request(app.getHttpServer())
      .post('/message-templates/T1/render')
      .set('x-test-actor', 'viewer')
      .send({ clientName: 'Ada' });
    expect(res.status).toBe(201);
    expect(templateSvc.calls).toEqual(['findOne', 'renderTemplate']);
  });
});

describe('Şablon YAZMA kapısı — gerçek modül DI grafiği', () => {
  it('MessageTemplateModule derlenir: OfficeF01AuthorizationGuard bağımlılığı (OfficeApprovalService) modül bağlamında çözülür', async () => {
    // Production AppModule ErrorLogModule'ü global yükler; aynı boot bağımlılığı burada açıkça kurulur, DB provider'ı SAF stub olur.
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ErrorLogModule, MessageTemplateModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuditService)
      .useValue({ log: jest.fn() })
      .compile();

    expect(moduleRef.get(MessageTemplateController)).toBeInstanceOf(MessageTemplateController);
    expect(moduleRef.get(MessageTemplateService, { strict: false })).toBeInstanceOf(MessageTemplateService);
    await moduleRef.close();
  });
});
