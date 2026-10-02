/**
 * OFFICE-PUT-BODY-BOUNDARY — yedi OFFICE yazma ucu için GERÇEK Nest HTTP zinciri (DB YOK).
 *
 * Zincir: gerçek `OfficeF01AuthorizationGuard` + gerçek `OfficeApprovalService` yüklemi + main.ts'in AYNI
 * global `ValidationPipe`ı (whitelist + forbidNonWhitelisted + transform) + gerçek `OfficeController` +
 * gerçek `OfficeService` (yalnız prisma / denetim / havuz primitive'i sahte). Ölçülen şey, persist katmanına
 * (`prisma.office.update` / havuz `applyTargetState`) GERÇEKTEN ne ulaştığıdır — yalnız DTO metadata'sı değil.
 *
 * Her uç için: geçerli istek yazar · yasak alan 400 ve HİÇ yazma/denetim yok · yetkisiz rol 403 ve HİÇ yazma
 * yok · kiracı JWT'den gelir (gövde `tenantId` 400) · gönderilmeyen alan yazılmaz · null davranışı korunur.
 *
 * Kanıt sınıfı: TEST. PRODUCTION DAVRANIŞ KANITI DEĞİLDİR (disposable DB + derlenmiş API ölçümü ayrıca yapıldı).
 */
import 'reflect-metadata';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { OfficeController } from '../office.controller';
import { OfficeService } from '../office.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GuidedOpenObserveService } from '../../permission-diagnostics/guided-open-observe.service';

const OFFICE = 'office-A';
/** Sahte kullanıcı satırının kiracısı: isteğin JWT kiracısıyla aynı (aktör kendi kiracısında). */
let requestTenant = 'tenant-A';

type ActorRow = {
  id: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  lawyer: { lawyerRank: string; canApproveOfficeActions: boolean } | null;
};
const ACTORS: Record<string, ActorRow> = {
  admin: { id: 'u-admin', role: 'ADMIN', lawyer: null },
  partner: { id: 'u-p', role: 'USER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  'plain-lawyer': { id: 'u-l', role: 'USER', lawyer: { lawyerRank: 'LAWYER', canApproveOfficeActions: false } },
  'viewer-partner': { id: 'u-vp', role: 'VIEWER', lawyer: { lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
};

/** TEST-ONLY JWT yerine geçen guard: `x-test-actor` / `x-test-tenant` başlıkları → `request.user`. */
@Injectable()
class TestActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-test-actor'] as string | undefined;
    if (!key || !ACTORS[key]) throw new UnauthorizedException();
    const a = ACTORS[key];
    req.user = { id: a.id, tenantId: (req.headers['x-test-tenant'] as string) || 'tenant-A', role: a.role };
    return true;
  }
}

const OFFICE_ROW = {
  id: OFFICE, tenantId: 'tenant-A', name: 'Büro', smtpPass: null, smsApiKey: null, smsApiSecret: null,
  escalationManagerLawyerIds: [], escalationFounderLawyerIds: [], opStaffTypes: [], bankAccounts: [], lawyers: [],
};

type Route = {
  ad: string;
  path: string;
  adminOnly?: boolean;
  /** persist katmanı: servis `prisma.office.update` mı yoksa havuz primitive'i mi çağırır */
  sink: 'update' | 'pool';
  valid: Record<string, unknown>;
  /** persist katmanına ulaşması BEKLENEN veri (geçerli gövde → harita) */
  persisted: Record<string, unknown>;
  hostile: Record<string, unknown>[];
};

const ROUTES: Route[] = [
  { ad: 'PUT /office', path: '/office', sink: 'update', valid: { name: 'Yeni Ad', city: 'Ankara' }, persisted: { name: 'Yeni Ad', city: 'Ankara' },
    hostile: [{ smtpHost: 'evil.test' }, { smtpPass: 'DUZ' }, { smsApiKey: 'DUZ' }, { tenantId: 'tenant-VICTIM' }, { id: 'x' }, { escalationManagerLawyerIds: [] }, { opStaffTypes: ['ARSIV'] }, { lastGreetingRunAt: '2099-01-01T00:00:00.000Z' }, { phone: { set: 'x' } }] },
  { ad: 'PUT /office/smtp-settings', path: '/office/smtp-settings', adminOnly: true, sink: 'update', valid: { smtpHost: 'mail.test', smtpPort: 25 }, persisted: { smtpHost: 'mail.test', smtpPort: 25 },
    hostile: [{ smsApiKey: 'DUZ' }, { tenantId: 'tenant-VICTIM' }, { name: 'x' }, { smtpPort: { increment: 1 } }] },
  { ad: 'PUT /office/sms-settings', path: '/office/sms-settings', adminOnly: true, sink: 'update', valid: { smsProvider: 'NETGSM', smsSender: 'S' }, persisted: { smsProvider: 'NETGSM', smsSender: 'S' },
    hostile: [{ smtpPass: 'DUZ' }, { tenantId: 'tenant-VICTIM' }, { smsApiKey: 123 }] },
  { ad: 'PUT /office/greeting-settings', path: '/office/greeting-settings', sink: 'update', valid: { autoGreetingEnabled: false }, persisted: { autoGreetingEnabled: false },
    hostile: [{ smtpHost: 'evil.test' }, { tenantId: 'tenant-VICTIM' }, { autoGreetingEnabled: 'evet' }] },
  { ad: 'PUT /office/iik78-settings', path: '/office/iik78-settings', sink: 'update', valid: { inactivityThresholdDays: 41 }, persisted: { inactivityThresholdDays: 41 },
    hostile: [{ smsApiKey: 'DUZ' }, { tenantId: 'tenant-VICTIM' }, { inactivityThresholdDays: { increment: 5 } }] },
  { ad: 'PUT /office/poa-expiry-settings', path: '/office/poa-expiry-settings', sink: 'update', valid: { poaExpiryThresholdDays: 33 }, persisted: { poaExpiryThresholdDays: 33 },
    hostile: [{ smtpUser: 'u' }, { tenantId: 'tenant-VICTIM' }, { poaExpiryRecipientLawyerIds: 'tek-dize' }] },
  { ad: 'PUT /office/escalation-settings', path: '/office/escalation-settings', sink: 'pool', valid: { opReminderDays: 7 }, persisted: { opReminderDays: 7 },
    hostile: [{ smtpHost: 'evil.test' }, { smtpPass: 'DUZ' }, { tenantId: 'tenant-VICTIM' }, { opStaffTypes: ['YOK'] }, { escalationManagerLawyerIds: { push: 'x' } }] },
];

describe('OFFICE yazma uçları — gerçek HTTP zincirinde gövde sınırı (7 uç)', () => {
  let app: INestApplication;
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const a = Object.values(ACTORS).find((x) => x.id === where.id);
        if (!a) return null;
        return { role: a.role, isActive: true, tenantId: requestTenant, staffMember: null, lawyer: a.lawyer ? { officeId: OFFICE, ...a.lawyer } : null };
      }),
    },
    office: {
      findUnique: jest.fn(async () => OFFICE_ROW),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...OFFICE_ROW, ...data })),
    },
  };
  const audit = { log: jest.fn() };
  const applyTargetState = jest.fn(async (p: { legacyPassthrough?: Record<string, unknown> }) => ({ office: { ...OFFICE_ROW, ...(p.legacyPassthrough ?? {}) } }));
  const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;

  const writes = () => prisma.office.update.mock.calls.length + applyTargetState.mock.calls.length;
  const persistedData = (sink: Route['sink']) =>
    sink === 'update'
      ? (prisma.office.update.mock.calls[0][0] as { data: Record<string, unknown> }).data
      : (applyTargetState.mock.calls[0][0] as { legacyPassthrough: Record<string, unknown> }).legacyPassthrough;

  beforeAll(async () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'office-write-body-boundary-http-test-key';
    const approval = new OfficeApprovalService(prisma as any, { log: jest.fn() } as any);
    const service = new OfficeService(prisma as any, audit as any, approval);
    (service as unknown as { workPoolMutation: unknown }).workPoolMutation = { applyTargetState };
    const moduleRef = await Test.createTestingModule({
      controllers: [OfficeController],
      providers: [
        { provide: OfficeService, useValue: service },
        { provide: OfficeApprovalService, useValue: approval },
        { provide: GuidedOpenObserveService, useValue: { observe: jest.fn() } },
        OfficeF01AuthorizationGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestActorGuard)
      .compile();
    app = moduleRef.createNestApplication();
    // main.ts:19-25 ile AYNI global pipe.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY; else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
  });

  beforeEach(() => {
    prisma.office.update.mockClear();
    prisma.office.findUnique.mockClear();
    applyTargetState.mockClear();
    audit.log.mockClear();
  });

  const put = (path: string, actor: string, body: unknown, tenant?: string) => {
    requestTenant = tenant ?? 'tenant-A';
    const req = request(app.getHttpServer()).put(path).set('x-test-actor', actor);
    return (tenant ? req.set('x-test-tenant', tenant) : req).send(body as object);
  };

  describe.each(ROUTES)('$ad', (route) => {
    const writer = route.adminOnly ? 'admin' : 'partner';

    it(`geçerli istek (${writer}) → 200; persist katmanına YALNIZ gövdedeki alanlar ulaşır, denetim kaydı yazılır`, async () => {
      const res = await put(route.path, writer, route.valid);
      expect(res.status).toBe(200);
      expect(writes()).toBe(1);
      expect(persistedData(route.sink)).toEqual(route.persisted);
      expect(audit.log).toHaveBeenCalledTimes(1);
      if (route.sink === 'update') {
        expect(prisma.office.update.mock.calls[0][0].where).toEqual({ id: OFFICE });
      }
    });

    it.each(route.hostile.map((b) => [JSON.stringify(b), b] as const))('yasak / tür dışı gövde %s → 400; HİÇ yazma, HİÇ denetim kaydı yok', async (_label, body) => {
      const res = await put(route.path, writer, body);
      expect(res.status).toBe(400);
      expect(writes()).toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('VIEWER (PARTNER avukatlı) → 403; yetki sınırı değişmedi, HİÇ yazma yok', async () => {
      const res = await put(route.path, 'viewer-partner', route.valid);
      expect(res.status).toBe(403);
      expect(writes()).toBe(0);
    });

    it('F01 yetkisiz avukat → 403; HİÇ yazma yok (geçersiz gövdeyle de aynı: guard pipe\'tan ÖNCE)', async () => {
      for (const body of [route.valid, route.hostile[0]]) {
        const res = await put(route.path, 'plain-lawyer', body);
        expect(res.status).toBe(403);
      }
      expect(writes()).toBe(0);
    });

    it('kiracı JWT\'den gelir: gövde `tenantId` 400; geçerli istekte büro `tenantId` = JWT kiracısı ile aranır', async () => {
      const bad = await put(route.path, writer, { ...route.valid, tenantId: 'tenant-VICTIM' }, 'tenant-B');
      expect(bad.status).toBe(400);
      expect(writes()).toBe(0);
      const ok = await put(route.path, writer, route.valid, 'tenant-B');
      expect(ok.status).toBe(200);
      const officeLookups = prisma.office.findUnique.mock.calls.map((c) => (c[0] as { where: { tenantId?: string } }).where.tenantId).filter(Boolean);
      expect(officeLookups).toContain('tenant-B');
      expect(officeLookups).not.toContain('tenant-VICTIM');
    });

    if (route.adminOnly) {
      it('ADMIN olmayan F01 yetkili (PARTNER) → 403 (WP-4c-hotfix-1 ADMIN kapısı korunur); HİÇ yazma yok', async () => {
        const res = await put(route.path, 'partner', route.valid);
        expect(res.status).toBe(403);
        expect(writes()).toBe(0);
      });
    }
  });

  describe('ortak sözleşme', () => {
    it('boş gövde PUT /office → 200 ve KİMSEYİ silmez: persist verisi boş (gönderilmeyen alan yazılmaz)', async () => {
      const res = await put('/office', 'partner', {});
      expect(res.status).toBe(200);
      expect(persistedData('update')).toEqual({});
    });

    it('nullable sütun null ile temizlenebilir (bugünkü sözleşme); null alamayan sütun null ile 400', async () => {
      const ok = await put('/office', 'partner', { phone: null });
      expect(ok.status).toBe(200);
      expect(persistedData('update')).toEqual({ phone: null });
      prisma.office.update.mockClear();
      const bad = await put('/office', 'partner', { name: null });
      expect(bad.status).toBe(400);
      expect(writes()).toBe(0);
      const smtpNull = await put('/office/smtp-settings', 'admin', { smtpPort: null });
      expect(smtpNull.status).toBe(200);
    });

    it('SMTP parolası haritada ve ŞİFRELİ yazılır (ACT-02 yolu bozulmadı); aynı istekte SMS anahtarı 400', async () => {
      const ok = await put('/office/smtp-settings', 'admin', { smtpPass: 'gizli-parola' });
      expect(ok.status).toBe(200);
      expect(String(persistedData('update').smtpPass).startsWith('enc:v1:')).toBe(true);
      prisma.office.update.mockClear();
      const bad = await put('/office/smtp-settings', 'admin', { smtpPass: 'gizli-parola', smsApiKey: 'k' });
      expect(bad.status).toBe(400);
      expect(writes()).toBe(0);
    });

    it('ekranın tam-form gövdeleri HTTP zincirinde reddedilmez (boş dizeler, port null, boş listeler)', async () => {
      const bodies: [string, string, Record<string, unknown>][] = [
        ['partner', '/office', { name: 'Büro', address: '', city: '', district: '', postalCode: '', phone: '', fax: '', email: '', website: '', barAssociation: '', vergiNo: '', vergiDairesi: '', mersisNo: '', kepAddress: '' }],
        ['admin', '/office/smtp-settings', { smtpHost: '', smtpPort: null, smtpUser: '', smtpSecure: false, smtpFromName: '', smtpFromEmail: '' }],
        ['admin', '/office/sms-settings', { smsProvider: '', smsSender: '' }],
        ['partner', '/office/greeting-settings', { autoGreetingEnabled: true, autoGreetingTime: '09:00' }],
        ['partner', '/office/escalation-settings', { opReminderDays: 3, opFounderDays: 6, opRepeatMonths: 3, opEmailEnabled: true, opSmsEnabled: true, opStaffTypes: ['MUHASEBE', 'ADLI_KATIP', 'SEKRETER'], caseTaskOwnerDays: 2, caseTaskTeamLeadDays: 2, caseTaskManagerDays: 3, escalationManagerLawyerIds: [], escalationFounderLawyerIds: [], escalationTeamLeadLawyerIds: [] }],
      ];
      for (const [actor, path, body] of bodies) {
        const res = await put(path, actor, body);
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
      }
    });
  });
});
