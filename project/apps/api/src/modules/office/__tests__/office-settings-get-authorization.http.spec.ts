// F-B01-03 — Office settings GET rotalarında F01 yetkilendirmesi (GERÇEK Nest HTTP pipeline; DB YOK).
//
// BULGU (canlı, 2026-09-05): staff hesapları `GET /office` için 403 alırken
// `GET /office/{smtp,sms,escalation}-settings` 200 dönüyordu (yalnız JwtAuthGuard). Kanonik politika
// (ADM01 OD-01/OD-08, FCM01 S1/S2) ve F01 aktör modeli (`isF01ActorAuthorized`) ile çelişki.
//
// DÜZELTME: altı settings GET rotası PUT karşılıkları gibi `OfficeF01AuthorizationGuard` taşır.
// Kasıtlı olarak ADMIN-only DEĞİL: ADMIN, PARTNER/MANAGER rank'li ve `canApproveOfficeActions=true`
// olan (personel olmayan) Lawyer aktörleri KORUNUR; staff, düz USER, yetkisiz rank REDDEDİLİR.
//
// Bu spec YETKİLENDİRMEYİ ölçer (401/403/200 + servis çağrısı sayacı). Alan projeksiyonu (S1/S2/
// HARD-DENY) AYRI spec'te ölçülür: office-settings-projection.spec.ts. Secret maskelemesi
// yetkilendirme SAYILMAZ: yetkisiz aktörlerde servis HİÇ çağrılmaz (maskeli gövde bile dönmez).
//
// Kanıt sınıfı: TEST (kontrollü Nest app + gerçek guard + gerçek OfficeApprovalService predicate'i
// sahte prisma satırlarıyla). PRODUCTION DAVRANIŞ KANITI DEĞİLDİR.
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { OfficeController } from '../office.controller';
import { OfficeService } from '../office.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GuidedOpenObserveService } from '../../permission-diagnostics/guided-open-observe.service';

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const OFFICE_A = 'office-A';
const OFFICE_B = 'office-B';

type ActorRow = {
  id: string;
  tenantId: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  isActive: boolean;
  staffMember: { id: string; officeId: string | null } | null;
  lawyer: { officeId: string | null; lawyerRank: string; canApproveOfficeActions: boolean } | null;
};

/** TEST-ONLY aktör tablosu — `isF01ActorAuthorized` select şekliyle birebir. */
const ACTORS: Record<string, ActorRow> = {
  staff: { id: 'u-staff', tenantId: TENANT_A, role: 'USER', isActive: true, staffMember: { id: 's-1', officeId: OFFICE_A }, lawyer: null },
  'staff-flag-true': { id: 'u-staff-flag', tenantId: TENANT_A, role: 'USER', isActive: true, staffMember: { id: 's-2', officeId: OFFICE_A }, lawyer: { officeId: OFFICE_A, lawyerRank: 'MANAGER', canApproveOfficeActions: true } },
  plain: { id: 'u-plain', tenantId: TENANT_A, role: 'USER', isActive: true, staffMember: null, lawyer: null },
  viewer: { id: 'u-viewer', tenantId: TENANT_A, role: 'VIEWER', isActive: true, staffMember: null, lawyer: null },
  'lawyer-authorized-noflag': { id: 'u-law-auth', tenantId: TENANT_A, role: 'USER', isActive: true, staffMember: null, lawyer: { officeId: OFFICE_A, lawyerRank: 'AUTHORIZED', canApproveOfficeActions: false } },
  'lawyer-intern': { id: 'u-law-intern', tenantId: TENANT_A, role: 'USER', isActive: true, staffMember: null, lawyer: { officeId: OFFICE_A, lawyerRank: 'INTERN', canApproveOfficeActions: false } },
  'inactive-admin': { id: 'u-inactive', tenantId: TENANT_A, role: 'ADMIN', isActive: false, staffMember: null, lawyer: null },
  admin: { id: 'u-admin', tenantId: TENANT_A, role: 'ADMIN', isActive: true, staffMember: null, lawyer: null },
  'admin-lawyer-partner': { id: 'u-admin-partner', tenantId: TENANT_A, role: 'ADMIN', isActive: true, staffMember: null, lawyer: { officeId: OFFICE_A, lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  partner: { id: 'u-partner', tenantId: TENANT_A, role: 'USER', isActive: true, staffMember: null, lawyer: { officeId: OFFICE_A, lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
  manager: { id: 'u-manager', tenantId: TENANT_A, role: 'USER', isActive: true, staffMember: null, lawyer: { officeId: OFFICE_A, lawyerRank: 'MANAGER', canApproveOfficeActions: false } },
  canapprove: { id: 'u-canapprove', tenantId: TENANT_A, role: 'USER', isActive: true, staffMember: null, lawyer: { officeId: OFFICE_A, lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true } },
  'admin-B': { id: 'u-admin-B', tenantId: TENANT_B, role: 'ADMIN', isActive: true, staffMember: null, lawyer: null },
  'partner-B': { id: 'u-partner-B', tenantId: TENANT_B, role: 'USER', isActive: true, staffMember: null, lawyer: { officeId: OFFICE_B, lawyerRank: 'PARTNER', canApproveOfficeActions: false } },
};

const AUTHORIZED = ['admin', 'admin-lawyer-partner', 'partner', 'manager', 'canapprove'] as const;
const DENIED = ['staff', 'staff-flag-true', 'plain', 'viewer', 'lawyer-authorized-noflag', 'lawyer-intern', 'inactive-admin'] as const;

/** TEST-ONLY JWT yerine geçen guard: `x-test-actor` başlığı → `request.user`. Başlık yoksa 401 (passport davranışı). */
@Injectable()
class TestActorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-test-actor'] as string | undefined;
    if (!key || !ACTORS[key]) throw new UnauthorizedException();
    const a = ACTORS[key];
    req.user = { id: a.id, tenantId: a.tenantId, role: a.role };
    return true;
  }
}

/** Sahte prisma: yalnız `user.findUnique({ where: { id } })` — gerçek predicate'in okuduğu şekil. */
const fakePrisma = {
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const a = Object.values(ACTORS).find((x) => x.id === where.id);
      if (!a) return null;
      return { role: a.role, isActive: a.isActive, tenantId: a.tenantId, staffMember: a.staffMember, lawyer: a.lawyer };
    }),
  },
};

const ROUTES: Array<{ path: string; getter: keyof OfficeService & string; updater: keyof OfficeService & string; keys: string[] }> = [
  { path: 'smtp-settings', getter: 'getSmtpSettings', updater: 'updateSmtpSettings', keys: ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPass', 'smtpSecure', 'smtpFromName', 'smtpFromEmail'] },
  { path: 'sms-settings', getter: 'getSmsSettings', updater: 'updateSmsSettings', keys: ['smsProvider', 'smsApiKey', 'smsApiSecret', 'smsSender'] },
  { path: 'greeting-settings', getter: 'getGreetingSettings', updater: 'updateGreetingSettings', keys: ['autoGreetingEnabled', 'autoGreetingTime'] },
  { path: 'iik78-settings', getter: 'getIik78Settings', updater: 'updateIik78Settings', keys: ['inactivityThresholdDays', 'inactivityWarningDays'] },
  // F-B01-03: S2 alıcı referansları (poaExpiryRecipientLawyerIds; escalation*LawyerIds) HTTP GET yanıtında YOK (controller omit).
  { path: 'poa-expiry-settings', getter: 'getPoaExpirySettings', updater: 'updatePoaExpirySettings', keys: ['poaExpiryNotificationEnabled', 'poaExpiryThresholdDays'] },
  { path: 'escalation-settings', getter: 'getEscalationSettings', updater: 'updateEscalationSettings', keys: ['opReminderDays', 'opFounderDays', 'opRepeatMonths', 'opEmailEnabled', 'opSmsEnabled', 'opStaffTypes', 'caseTaskOwnerDays', 'caseTaskTeamLeadDays', 'caseTaskManagerDays'] },
];

/** Servisin (iç tüketiciler için) döndürdüğü S2 listeleri — HTTP sınırında OMIT edilmeleri beklenir. */
const S2_BY_PATH: Record<string, string[]> = {
  'poa-expiry-settings': ['poaExpiryRecipientLawyerIds'],
  'escalation-settings': ['escalationManagerLawyerIds', 'escalationFounderLawyerIds', 'escalationTeamLeadLawyerIds'],
};

/** Sahte OfficeService: tenant'a göre ayrışan sabit gövdeler (cross-tenant izolasyon ölçümü için); S2 listelerini servis gibi DÖNDÜRÜR. */
function cannedFor(path: string, tenantId: string): Record<string, unknown> {
  const r = ROUTES.find((x) => x.path === path)!;
  const out: Record<string, unknown> = {};
  for (const k of r.keys) out[k] = `${k}@${tenantId}`;
  for (const k of S2_BY_PATH[path] ?? []) out[k] = [`${k}-lawyer@${tenantId}`];
  if (path === 'smtp-settings') out.smtpPass = '********';
  if (path === 'sms-settings') { out.smsApiKey = '********'; out.smsApiSecret = '********'; }
  return out;
}
const officeService: Record<string, jest.Mock> = {};
for (const r of ROUTES) {
  officeService[r.getter] = jest.fn(async (tenantId: string) => cannedFor(r.path, tenantId));
  officeService[r.updater] = jest.fn(async (tenantId: string) => ({ updated: true, tenantId }));
}

describe('F-B01-03 — settings GET rotaları: F01 yetkilendirmesi (HTTP)', () => {
  let app: INestApplication;
  const approval = new OfficeApprovalService(fakePrisma as any, { log: jest.fn() } as any);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OfficeController],
      providers: [
        { provide: OfficeService, useValue: officeService },
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
    for (const fn of Object.values(officeService)) fn.mockClear();
  });

  const http = () => request(app.getHttpServer());

  it('guard metadata: altı GET + altı PUT handler OfficeF01AuthorizationGuard taşır (12/12)', () => {
    const handlers = ['getSmtpSettings', 'updateSmtpSettings', 'getSmsSettings', 'updateSmsSettings', 'getGreetingSettings', 'updateGreetingSettings', 'getIik78Settings', 'updateIik78Settings', 'getPoaExpirySettings', 'updatePoaExpirySettings', 'getEscalationSettings', 'updateEscalationSettings'];
    for (const h of handlers) {
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, (OfficeController.prototype as any)[h]) ?? [];
      expect({ handler: h, hasGuard: guards.includes(OfficeF01AuthorizationGuard) }).toEqual({ handler: h, hasGuard: true });
    }
  });

  describe.each(ROUTES)('GET /office/$path', (route) => {
    it('anonim → 401; servis çağrılmaz', async () => {
      const res = await http().get(`/office/${route.path}`);
      expect(res.status).toBe(401);
      expect(officeService[route.getter]).not.toHaveBeenCalled();
    });

    it.each([...DENIED])('yetkisiz aktör %s → 403 OFFICE_F01_AUTHORIZATION_REQUIRED; servis çağrılmaz (maskeleme yetki değildir)', async (actor) => {
      const res = await http().get(`/office/${route.path}`).set('x-test-actor', actor);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('OFFICE_F01_AUTHORIZATION_REQUIRED');
      expect(officeService[route.getter]).not.toHaveBeenCalled();
    });

    it.each([...AUTHORIZED])('yetkili aktör %s → 200; servis yalnız kendi tenantId ile çağrılır; gövde anahtarları beklenen küme', async (actor) => {
      const res = await http().get(`/office/${route.path}`).set('x-test-actor', actor);
      expect(res.status).toBe(200);
      expect(officeService[route.getter]).toHaveBeenCalledTimes(1);
      expect(officeService[route.getter]).toHaveBeenCalledWith(TENANT_A);
      expect(Object.keys(res.body).sort()).toEqual([...route.keys].sort());
    });

    it('cross-tenant: tenant-B aktörleri yalnız tenant-B verisini alır; tenant-A ile servis çağrısı 0', async () => {
      for (const actor of ['admin-B', 'partner-B']) {
        const res = await http().get(`/office/${route.path}`).set('x-test-actor', actor);
        expect(res.status).toBe(200);
        expect(officeService[route.getter]).toHaveBeenLastCalledWith(TENANT_B);
        for (const k of route.keys) {
          if (k === 'smtpPass' || k === 'smsApiKey' || k === 'smsApiSecret') continue;
          expect(res.body[k]).toBe(`${k}@${TENANT_B}`);
        }
      }
      expect(officeService[route.getter].mock.calls.some((c: unknown[]) => c[0] === TENANT_A)).toBe(false);
    });
  });

  describe('F-B01-03 S2 omisyonu (HTTP sınırı) + PUT semantiği', () => {
    it.each(['escalation-settings', 'poa-expiry-settings'])('GET /office/%s: servis S2 listelerini döndürse bile HTTP yanıtı hiçbir aktöre S2 anahtarı vermez', async (path) => {
      for (const actor of ['admin', 'partner', 'canapprove', 'admin-B']) {
        const res = await http().get(`/office/${path}`).set('x-test-actor', actor);
        expect(res.status).toBe(200);
        for (const k of S2_BY_PATH[path]) expect(Object.prototype.hasOwnProperty.call(res.body, k)).toBe(false);
        // servis gerçekten S2 döndürdü (omisyon controller'da yapıldı, sahte servis tarafından değil)
        const route = ROUTES.find((r) => r.path === path)!;
        const served = await (officeService[route.getter].mock.results.at(-1)!.value as Promise<Record<string, unknown>>);
        for (const k of S2_BY_PATH[path]) expect(Object.prototype.hasOwnProperty.call(served, k)).toBe(true);
      }
    });

    it('PUT escalation-settings: yetkili aktör S2 alanı GÖNDERMEZSE servis gövdesinde S2 anahtarı yok (mevcut değer korunur)', async () => {
      const res = await http().put('/office/escalation-settings').set('x-test-actor', 'partner').send({ opReminderDays: 5 });
      expect(res.status).toBe(200);
      const data = officeService.updateEscalationSettings.mock.calls[0][1] as Record<string, unknown>;
      expect(data).toEqual({ opReminderDays: 5 });
    });

    it('PUT escalation-settings: yetkili aktör açıkça [] gönderirse [] iletilir (ayrı, yetkili yazma işlemi)', async () => {
      const res = await http().put('/office/escalation-settings').set('x-test-actor', 'partner').send({ escalationManagerLawyerIds: [] });
      expect(res.status).toBe(200);
      const data = officeService.updateEscalationSettings.mock.calls[0][1] as Record<string, unknown>;
      expect(data).toEqual({ escalationManagerLawyerIds: [] });
    });

    it('PUT escalation-settings / poa-expiry-settings: staff ve düz USER 403; servis çağrılmaz (yazma yetkisi korunur)', async () => {
      for (const actor of ['staff', 'plain']) {
        const r1 = await http().put('/office/escalation-settings').set('x-test-actor', actor).send({ escalationManagerLawyerIds: [] });
        const r2 = await http().put('/office/poa-expiry-settings').set('x-test-actor', actor).send({ poaExpiryRecipientLawyerIds: [] });
        expect([r1.status, r2.status]).toEqual([403, 403]);
      }
      expect(officeService.updateEscalationSettings).not.toHaveBeenCalled();
      expect(officeService.updatePoaExpirySettings).not.toHaveBeenCalled();
    });

    it('PUT poa-expiry-settings: tenant-B aktörü yalnız kendi tenantId ile yazar', async () => {
      const res = await http().put('/office/poa-expiry-settings').set('x-test-actor', 'admin-B').send({ poaExpiryThresholdDays: 12 });
      expect(res.status).toBe(200);
      expect(officeService.updatePoaExpirySettings.mock.calls[0][0]).toBe(TENANT_B);
    });
  });

  describe('PUT regresyonu (davranış değişmedi)', () => {
    it('staff PUT smtp-settings → 403 F01 (ADMIN kontrolünden ÖNCE); servis çağrılmaz', async () => {
      const res = await http().put('/office/smtp-settings').set('x-test-actor', 'staff').send({ smtpHost: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('OFFICE_F01_AUTHORIZATION_REQUIRED');
      expect(officeService.updateSmtpSettings).not.toHaveBeenCalled();
    });

    it('partner PUT smtp-settings → 403 (credential admin = yalnız ADMIN); partner PUT greeting-settings → 200', async () => {
      const res1 = await http().put('/office/smtp-settings').set('x-test-actor', 'partner').send({ smtpHost: 'x' });
      expect(res1.status).toBe(403);
      expect(officeService.updateSmtpSettings).not.toHaveBeenCalled();
      const res2 = await http().put('/office/greeting-settings').set('x-test-actor', 'partner').send({ autoGreetingEnabled: true });
      expect(res2.status).toBe(200);
      expect(officeService.updateGreetingSettings).toHaveBeenCalledTimes(1);
    });

    it('admin PUT smtp-settings → 200; servis tenant-A ile çağrılır', async () => {
      const res = await http().put('/office/smtp-settings').set('x-test-actor', 'admin').send({ smtpHost: 'x' });
      expect(res.status).toBe(200);
      expect(officeService.updateSmtpSettings).toHaveBeenCalledTimes(1);
      expect(officeService.updateSmtpSettings.mock.calls[0][0]).toBe(TENANT_A);
    });
  });
});
