/**
 * D-3a (owner GO 2026-09-06) — MUVEKKIL BILGI TALEBI: GONDERIM YETKISI + DURUM KAPISI + AUDIT.
 *
 * Kapatilan bosluk: `POST /address-discovery/client-info-request` ve `.../:id/reminder` muvekkile
 * GERCEK e-posta gonderiyordu; dort ucta yalniz `JwtAuthGuard` vardi → VIEWER dahil her kimlikli
 * kullanici gonderim yapabiliyordu ve hicbir AuditLog uretilmiyordu.
 *
 * Ratifiye davranis:
 *   - Gonderim (create / reminder): C2 frozen primitive, `INFO_REQUEST_SEND` /
 *     `INFO_REQUEST_REMINDER_SEND`; esik §13/11 madde 6 = ADMIN VEYA canonical elevated;
 *     VIEWER ve tanimsiz rol fail-closed; cross-tenant TENANT_MISMATCH. Yetkisiz aktorde
 *     SAGLAYICI CAGRISI ve DB mutasyonu OLUSMAZ.
 *   - Durum isaretleri (respond / no-response): D01 coarse — VIEWER DENY, USER/ADMIN ALLOW
 *     (elevated SART DEGIL); basarili mutasyon ortak aktorlu audit uretir.
 *   - Saglayici basarisizligi BASARILI GONDERIM olarak KAYDEDILMEZ (kayit geri alinir / sayac artmaz).
 *   - Mevcut ClientNotification ve AddressAuditLog kayitlari KORUNUR; aktor alanlari doldurulur.
 *   - Otomatik dosya-olusturma yolu korunur ve istemci "SYSTEM"/"skip-authority" secerek manuel
 *     kapiyi ASAMAZ (HTTP yuzeyi yalniz gated metodu cagirir).
 *
 * Kanit sinifi: controller–servis birim testleri (Prisma, e-posta saglayicisi ve audit mock'lu;
 * gercek HTTP/DB/SMTP E2E DEGILDIR — gercek aliciya e-posta GONDERILMEZ).
 */
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CLIENT_MUTATION_REASON } from '../../client/client-mutation-policy';
import { CLIENT_WORKSPACE_COMMAND } from '../../client/client-workspace-command-authority';
import { AddressDiscoveryController } from '../address-discovery.controller';
import { ClientInfoRequestService } from '../client-info-request.service';

type AnyRecord = Record<string, any>;

const TENANT = 'tenant-1';
const CLIENT_ID = 'client-1';
const CASE_ID = 'case-1';
const REQUEST_ID = 'req-1';

const actor = (role: string | undefined, tenantId: string = TENANT) => ({ userId: 'user-1', tenantId, role });

const DTO = { caseId: CASE_ID, clientId: CLIENT_ID, emailTo: 'muvekkil@example.test' } as any;

function buildHarness(opts: { eligible?: boolean; emailOk?: boolean; requestFound?: boolean } = {}) {
  const { eligible = false, emailOk = true, requestFound = true } = opts;
  const prisma: AnyRecord = {
    case: {
      findFirst: jest.fn().mockResolvedValue({
        id: CASE_ID,
        fileNumber: '2026/1',
        client: { id: CLIENT_ID, displayName: 'Muvekkil' },
        lawyers: [],
        debtors: [{ debtor: { id: 'debtor-1', name: 'Borclu', identityNo: '11111111111' } }],
      }),
    },
    client: { findFirst: jest.fn().mockResolvedValue({ id: CLIENT_ID, displayName: 'Muvekkil', email: 'muvekkil@example.test' }) },
    office: { findFirst: jest.fn().mockResolvedValue({ name: 'Buro', phone: null, email: null }) },
    clientInfoRequest: {
      create: jest.fn().mockResolvedValue({ id: REQUEST_ID, clientId: CLIENT_ID, caseId: CASE_ID }),
      delete: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({ id: REQUEST_ID, reminderCount: 1, clientId: CLIENT_ID }),
      findFirst: jest.fn().mockResolvedValue(
        requestFound
          ? {
              id: REQUEST_ID,
              clientId: CLIENT_ID,
              tenantId: TENANT,
              emailTo: 'muvekkil@example.test',
              status: 'SENT',
              reminderCount: 0,
              client: { displayName: 'Muvekkil' },
              debtor: { name: 'Borclu', identityNo: '1' },
              case: { fileNumber: '2026/1', lawyers: [] },
            }
          : null,
      ),
    },
    clientNotification: { create: jest.fn().mockResolvedValue({}) },
    addressAuditLog: { create: jest.fn().mockResolvedValue({}) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ settings: {} }) },
  };
  const emailProvider: AnyRecord = {
    send: jest.fn().mockResolvedValue(emailOk ? { success: true } : { success: false, errorMessage: 'smtp down' }),
  };
  const audit: AnyRecord = { log: jest.fn().mockResolvedValue(undefined) };
  const officeApproval: AnyRecord = { isApproverEligible: jest.fn().mockResolvedValue(eligible) };
  // D-3b: intake link servisi (Yol1) — bu suite baglantiyi ISTEMEZ; cagrilmadigi dogrulanir.
  const intakeLink: AnyRecord = {
    createForClientWorkspace: jest.fn().mockResolvedValue({
      link: { id: 'link-1', expiresAt: null },
      rawToken: 'raw',
      intakeUrl: 'https://portal.test/intake/raw',
    }),
  };
  const service = new ClientInfoRequestService(prisma as any, emailProvider as any, audit as any, officeApproval as any, intakeLink as any);
  return { service, prisma, emailProvider, audit, officeApproval, intakeLink };
}

type Harness = ReturnType<typeof buildHarness>;

function expectNoSend(h: Harness) {
  expect(h.emailProvider.send).not.toHaveBeenCalled();
  expect(h.prisma.clientInfoRequest.create).not.toHaveBeenCalled();
  expect(h.prisma.clientInfoRequest.update).not.toHaveBeenCalled();
  expect(h.prisma.clientNotification.create).not.toHaveBeenCalled();
  expect(h.audit.log).not.toHaveBeenCalled();
}

const SEND_OPS = [
  {
    name: 'createRequest (POST /client-info-request)',
    commandType: CLIENT_WORKSPACE_COMMAND.INFO_REQUEST_SEND,
    invoke: (h: Harness, role: string | undefined, tenantId?: string) => h.service.createRequest(TENANT, DTO, actor(role, tenantId)),
  },
  {
    name: 'sendReminder (POST /client-info-request/:id/reminder)',
    commandType: CLIENT_WORKSPACE_COMMAND.INFO_REQUEST_REMINDER_SEND,
    invoke: (h: Harness, role: string | undefined, tenantId?: string) => h.service.sendReminder(TENANT, REQUEST_ID, actor(role, tenantId)),
  },
];

describe('D-3a — gonderim komutlari WORKSPACE esiginde (ADMIN VEYA elevated)', () => {
  for (const op of SEND_OPS) {
    describe(op.name, () => {
      it('VIEWER -> 403 VIEWER_DENIED; e-posta GONDERILMEZ, kayit ve audit YOK', async () => {
        const h = buildHarness();
        await expect(op.invoke(h, 'VIEWER')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED }),
        });
        expectNoSend(h);
        expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
      });

      it('tanimsiz rol -> 403 UNKNOWN_ROLE (fail-closed); gonderim YOK', async () => {
        const h = buildHarness();
        await expect(op.invoke(h, 'BILINMEYEN_ROL')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE }),
        });
        expectNoSend(h);
      });

      it('USER (elevated degil) -> 403 WORKSPACE_COMMAND_DENIED; eligibility BIR kez, gonderim YOK', async () => {
        const h = buildHarness({ eligible: false });
        await expect(op.invoke(h, 'USER')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED }),
        });
        expectNoSend(h);
        expect(h.officeApproval.isApproverEligible).toHaveBeenCalledTimes(1);
        expect(h.officeApproval.isApproverEligible).toHaveBeenCalledWith('user-1', TENANT);
      });

      it('cross-tenant aktor -> 403 TENANT_MISMATCH (ADMIN olsa bile); gonderim YOK', async () => {
        const h = buildHarness();
        await expect(op.invoke(h, 'ADMIN', 'tenant-2')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.TENANT_MISMATCH }),
        });
        expectNoSend(h);
      });

      it('ADMIN -> gonderim calisir, eligibility HIC sorgulanmaz, TEK CLIENT_WORKSPACE_COMMAND audit', async () => {
        const h = buildHarness();
        await op.invoke(h, 'ADMIN');
        expect(h.emailProvider.send).toHaveBeenCalledTimes(1);
        expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
        expect(h.audit.log).toHaveBeenCalledTimes(1);
        expect(h.audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TENANT,
            userId: 'user-1',
            action: 'CLIENT_WORKSPACE_COMMAND',
            entityType: 'Client',
            entityId: CLIENT_ID,
            metadata: expect.objectContaining({ commandType: op.commandType }),
          }),
        );
      });

      it('elevated USER -> gonderim calisir + TEK audit', async () => {
        const h = buildHarness({ eligible: true });
        await op.invoke(h, 'USER');
        expect(h.emailProvider.send).toHaveBeenCalledTimes(1);
        expect(h.officeApproval.isApproverEligible).toHaveBeenCalledTimes(1);
        expect(h.audit.log).toHaveBeenCalledTimes(1);
      });
    });
  }
});

describe('D-3a — saglayici basarisizligi BASARILI GONDERIM olarak kaydedilmez', () => {
  it('createRequest: e-posta basarisiz -> "SENT" kaydi geri alinir, 503, audit YOK', async () => {
    const h = buildHarness({ emailOk: false });
    await expect(h.service.createRequest(TENANT, DTO, actor('ADMIN'))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(h.prisma.clientInfoRequest.delete).toHaveBeenCalledWith({ where: { id: REQUEST_ID } });
    expect(h.prisma.clientNotification.create).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled(); // basarisiz komut audit uretmez
  });

  it('sendReminder: e-posta basarisiz -> sayac ARTMAZ, reminderSentAt yazilmaz, audit YOK', async () => {
    const h = buildHarness({ emailOk: false });
    await expect(h.service.sendReminder(TENANT, REQUEST_ID, actor('ADMIN'))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(h.prisma.clientInfoRequest.update).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('basarili gonderim: mevcut ClientNotification ve AddressAuditLog kayitlari KORUNUR + aktor alanlari dolar', async () => {
    const h = buildHarness();
    await h.service.createRequest(TENANT, DTO, actor('ADMIN'));
    expect(h.prisma.clientNotification.create).toHaveBeenCalledTimes(1);
    expect(h.prisma.clientNotification.create.mock.calls[0][0].data.sentById).toBe('user-1');
    expect(h.prisma.addressAuditLog.create).toHaveBeenCalledTimes(1);
    expect(h.prisma.addressAuditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'CLIENT_NOTIFICATION_SENT',
      userId: 'user-1',
    });
  });

  it('audit metadata e-posta icerigi/adresi TASIMAZ', async () => {
    const h = buildHarness();
    await h.service.createRequest(TENANT, DTO, actor('ADMIN'));
    const serialized = JSON.stringify(h.audit.log.mock.calls[0][0]);
    expect(serialized).not.toContain('muvekkil@example.test');
    // D-3b: 'intakeLinkId' additive alan (baglanti yoksa null); ham token/URL yine YOK.
    expect(Object.keys(h.audit.log.mock.calls[0][0].metadata).sort()).toEqual(['actorRole', 'caseId', 'commandType', 'intakeLinkId', 'requestId', 'status']);
  });
});

describe('D-3a — durum isaretleri: VIEWER kapali, USER/ADMIN acik (elevated SART DEGIL)', () => {
  const STATUS_OPS = [
    {
      name: 'markAsResponded',
      invoke: (h: Harness, role: string | undefined, tenantId?: string) => h.service.markAsResponded(TENANT, REQUEST_ID, actor(role, tenantId), 'not'),
      status: 'RESPONDED',
    },
    {
      name: 'markAsNoResponse',
      invoke: (h: Harness, role: string | undefined, tenantId?: string) => h.service.markAsNoResponse(TENANT, REQUEST_ID, actor(role, tenantId)),
      status: 'NO_RESPONSE',
    },
  ];

  for (const op of STATUS_OPS) {
    describe(op.name, () => {
      it('VIEWER -> 403 VIEWER_DENIED; yazma ve audit YOK', async () => {
        const h = buildHarness();
        await expect(op.invoke(h, 'VIEWER')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED }),
        });
        expect(h.prisma.clientInfoRequest.update).not.toHaveBeenCalled();
        expect(h.audit.log).not.toHaveBeenCalled();
      });

      it('cross-tenant -> 403 TENANT_MISMATCH; yazma YOK', async () => {
        const h = buildHarness();
        await expect(op.invoke(h, 'ADMIN', 'tenant-2')).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: 'CLIENT_MUTATION_DENIED_TENANT_MISMATCH' }),
        });
        expect(h.prisma.clientInfoRequest.update).not.toHaveBeenCalled();
      });

      it('USER (elevated DEGIL) -> izin verilir; eligibility HIC sorgulanmaz (gonderim esigi degil)', async () => {
        const h = buildHarness({ eligible: false });
        await op.invoke(h, 'USER');
        expect(h.prisma.clientInfoRequest.update).toHaveBeenCalledTimes(1);
        expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
      });

      it('ADMIN -> izin + ortak aktorlu audit (CLIENT_INFO_REQUEST_STATUS)', async () => {
        const h = buildHarness();
        await op.invoke(h, 'ADMIN');
        expect(h.audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'CLIENT_INFO_REQUEST_STATUS',
            entityType: 'Client',
            entityId: CLIENT_ID,
            userId: 'user-1',
            metadata: expect.objectContaining({ requestId: REQUEST_ID, status: op.status }),
          }),
        );
      });

      it('talep yoksa 404; yazma ve audit YOK', async () => {
        const h = buildHarness({ requestFound: false });
        await expect(op.invoke(h, 'ADMIN')).rejects.toBeInstanceOf(NotFoundException);
        expect(h.prisma.clientInfoRequest.update).not.toHaveBeenCalled();
        expect(h.audit.log).not.toHaveBeenCalled();
      });
    });
  }
});

describe('D-3a — otomatik dosya-olusturma yolu korunur ve istemciden ASILAMAZ', () => {
  it('sendAutoRequestOnCaseCreate aktor ISTEMEZ; gonderim yapar, audit "system" aktoru ile ClientNotification yazar', async () => {
    const h = buildHarness();
    h.prisma.case.findUnique = jest.fn().mockResolvedValue({
      caseClients: [{ client: { id: CLIENT_ID, displayName: 'Muvekkil', email: 'muvekkil@example.test', contacts: [] } }],
      debtors: [{ debtor: { id: 'debtor-1', name: 'Borclu' } }],
    });
    await h.service.sendAutoRequestOnCaseCreate(TENANT, CASE_ID);
    expect(h.emailProvider.send).toHaveBeenCalledTimes(1);
    expect(h.prisma.clientNotification.create.mock.calls[0][0].data.sentById).toBe('system');
    // Sistem yolu WORKSPACE komutu DEGILDIR → primitive audit'i uretilmez (gated yol degil).
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it('HTTP yuzeyinde SYSTEM/skip-authority girisi YOKTUR: controller govdeden aktor/tenant okumaz', async () => {
    const svc: AnyRecord = {
      createRequest: jest.fn().mockResolvedValue({ id: REQUEST_ID }),
      sendReminder: jest.fn().mockResolvedValue({ id: REQUEST_ID }),
      markAsResponded: jest.fn().mockResolvedValue({ id: REQUEST_ID }),
      markAsNoResponse: jest.fn().mockResolvedValue({ id: REQUEST_ID }),
    };
    const controller = new AddressDiscoveryController({} as any, svc as any, {} as any, {} as any, {} as any, {} as any);
    const req = { user: { id: 'user-1', tenantId: TENANT, role: 'ADMIN' } };
    const expectedActor = { userId: 'user-1', tenantId: TENANT, role: 'ADMIN' };

    // Govdede sahte aktor/tenant/system alanlari: YOK SAYILIR.
    await controller.createClientInfoRequest(req, { ...DTO, tenantId: 'tenant-2', userId: 'system', actor: 'SYSTEM' } as any);
    await controller.sendClientInfoRequestReminder(req, REQUEST_ID);
    await controller.markClientInfoRequestAsResponded(req, REQUEST_ID, { notes: 'x' });
    await controller.markClientInfoRequestAsNoResponse(req, REQUEST_ID);

    expect(svc.createRequest.mock.calls[0][0]).toBe(TENANT);
    expect(svc.createRequest.mock.calls[0][2]).toEqual(expectedActor);
    expect(svc.sendReminder.mock.calls[0][2]).toEqual(expectedActor);
    expect(svc.markAsResponded.mock.calls[0][2]).toEqual(expectedActor);
    expect(svc.markAsNoResponse.mock.calls[0][2]).toEqual(expectedActor);
  });

  it('uctan uca (controller -> servis): VIEWER JWT ile gonderim 403, saglayici cagrilmaz', async () => {
    const h = buildHarness();
    const controller = new AddressDiscoveryController({} as any, h.service as any, {} as any, {} as any, {} as any, {} as any);
    await expect(
      controller.createClientInfoRequest({ user: { id: 'user-1', tenantId: TENANT, role: 'VIEWER' } }, DTO),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expectNoSend(h);
  });
});
