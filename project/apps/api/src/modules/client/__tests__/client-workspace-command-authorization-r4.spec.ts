/**
 * C2-B02 (R4 / FIND-C2) — WORKSPACE KOMUT YETKİLENDİRMESİ (owner §13/11 RATIFIED 2026-08-03).
 *
 * Bu dosya B02 characterization spec'inin karar-sonrası halefidir: characterization'ın
 * sabitlediği açık (rol kontrolsüz, audit'siz dispatch) owner kararıyla KAPANDI.
 *
 * Ratifiye davranış:
 *   - Eşik: ADMIN VEYA canonical elevated (`officeApproval.isApproverEligible`).
 *   - VIEWER ve tanımsız/null rol fail-closed reddedilir (403 + stabil reasonCode).
 *   - Yetki kontrolü dış yan etkiden ÖNCE: yetkisiz aktörde servis HİÇ çağrılmaz →
 *     mail/SMS, queue, artefakt, dosya, client-state yazımı OLUŞMAZ.
 *   - Cross-tenant kesin ret (TENANT_MISMATCH, eligibility sorgusuz).
 *   - Başarılı komut AuditLog üretir (actor/tenant/client/commandType/result;
 *     timestamp AuditLog.createdAt) — ham PII metadata'ya YAZILMAZ.
 *   - Başarısız (throw eden) komut audit ÜRETMEZ.
 *   - `isApproverEligible` yalnız gerektiğinde sorgulanır (ADMIN/VIEWER/tanımsız: HİÇ).
 */
import { ForbiddenException } from '@nestjs/common';
import {
  CLIENT_MUTATION_REASON,
  decideClientWorkspaceCommand,
} from '../client-mutation-policy';
import {
  CLIENT_WORKSPACE_COMMAND,
  runAuthorizedClientWorkspaceCommand,
} from '../client-workspace-command-authority';
import { ClientController } from '../client.controller';

type AnyRecord = Record<string, any>;

describe('decideClientWorkspaceCommand (SAF politika, owner §13/11)', () => {
  it('actor yok -> NO_ACTOR', () => {
    expect(decideClientWorkspaceCommand({ userId: undefined, role: 'ADMIN' })).toEqual({
      allowed: false,
      reasonCode: CLIENT_MUTATION_REASON.NO_ACTOR,
    });
  });

  it('tanınmayan rol -> UNKNOWN_ROLE (fail-closed)', () => {
    expect(
      decideClientWorkspaceCommand({ userId: 'u1', role: 'STAJYER', elevatedAuthority: true }),
    ).toEqual({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE });
  });

  it('VIEWER -> VIEWER_DENIED (elevatedAuthority=true olsa BİLE)', () => {
    expect(
      decideClientWorkspaceCommand({ userId: 'u1', role: 'VIEWER', elevatedAuthority: true }),
    ).toEqual({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED });
  });

  it('USER + elevated=false -> WORKSPACE_COMMAND_DENIED', () => {
    expect(
      decideClientWorkspaceCommand({ userId: 'u1', role: 'USER', elevatedAuthority: false }),
    ).toEqual({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED });
  });

  it('USER + elevated=true -> ALLOWED (rol değil elevated karar verir)', () => {
    expect(
      decideClientWorkspaceCommand({ userId: 'u1', role: 'USER', elevatedAuthority: true }),
    ).toEqual({ allowed: true, reasonCode: CLIENT_MUTATION_REASON.ALLOWED });
  });

  it('ADMIN + elevated=false -> ALLOWED (bulk/adres eşiğinden BİLİNÇLİ fark — owner §13/11)', () => {
    expect(
      decideClientWorkspaceCommand({ userId: 'u1', role: 'ADMIN', elevatedAuthority: false }),
    ).toEqual({ allowed: true, reasonCode: CLIENT_MUTATION_REASON.ALLOWED });
  });
});

describe('runAuthorizedClientWorkspaceCommand (yetki → yürütme → audit zinciri)', () => {
  function buildDeps() {
    return {
      isApproverEligible: jest.fn().mockResolvedValue(false),
      auditLog: jest.fn().mockResolvedValue(undefined),
    };
  }
  const ctx = {
    tenantId: 'tenant-1',
    clientId: 'client-1',
    commandType: CLIENT_WORKSPACE_COMMAND.POA_REMINDER_SEND,
  };

  async function expectDenied(
    deps: AnyRecord,
    actor: AnyRecord,
    reasonCode: string,
    context: AnyRecord = ctx,
  ) {
    const execute = jest.fn().mockResolvedValue('never');
    await expect(
      runAuthorizedClientWorkspaceCommand(deps as any, actor, context as any, execute),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: expect.objectContaining({ reasonCode }),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(deps.auditLog).not.toHaveBeenCalled();
  }

  it('userId boş -> NO_ACTOR; execute/audit/eligibility HİÇ çağrılmaz', async () => {
    const deps = buildDeps();
    await expectDenied(deps, { userId: '', tenantId: 'tenant-1', role: 'ADMIN' }, CLIENT_MUTATION_REASON.NO_ACTOR);
    expect(deps.isApproverEligible).not.toHaveBeenCalled();
  });

  it('cross-tenant -> TENANT_MISMATCH; eligibility sorgusu ve yazma HİÇ olmaz', async () => {
    const deps = buildDeps();
    await expectDenied(
      deps,
      { userId: 'u1', tenantId: 'tenant-OTHER', role: 'ADMIN' },
      CLIENT_MUTATION_REASON.TENANT_MISMATCH,
    );
    expect(deps.isApproverEligible).not.toHaveBeenCalled();
  });

  it('VIEWER -> VIEWER_DENIED; eligibility HİÇ sorgulanmaz (coarse ret DB’ye gitmez)', async () => {
    const deps = buildDeps();
    await expectDenied(deps, { userId: 'u1', tenantId: 'tenant-1', role: 'VIEWER' }, CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expect(deps.isApproverEligible).not.toHaveBeenCalled();
  });

  it('tanımsız rol -> UNKNOWN_ROLE; eligibility HİÇ sorgulanmaz', async () => {
    const deps = buildDeps();
    await expectDenied(deps, { userId: 'u1', tenantId: 'tenant-1', role: 'BILINMEYEN' }, CLIENT_MUTATION_REASON.UNKNOWN_ROLE);
    expect(deps.isApproverEligible).not.toHaveBeenCalled();
  });

  it('USER + eligible=false -> WORKSPACE_COMMAND_DENIED (eligibility BİR kez sorgulanır)', async () => {
    const deps = buildDeps();
    await expectDenied(deps, { userId: 'u1', tenantId: 'tenant-1', role: 'USER' }, CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED);
    expect(deps.isApproverEligible).toHaveBeenCalledTimes(1);
    expect(deps.isApproverEligible).toHaveBeenCalledWith('u1', 'tenant-1');
  });

  it('ADMIN -> izin; eligibility HİÇ sorgulanmaz; audit actor/tenant/client/commandType/result taşır', async () => {
    const deps = buildDeps();
    const execute = jest.fn().mockResolvedValue({ status: 'sent' });

    const result = await runAuthorizedClientWorkspaceCommand(
      deps as any,
      { userId: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN' },
      ctx,
      execute,
      (r: AnyRecord) => ({ status: r.status }),
    );

    expect(result).toEqual({ status: 'sent' });
    expect(deps.isApproverEligible).not.toHaveBeenCalled();
    expect(deps.auditLog).toHaveBeenCalledTimes(1);
    expect(deps.auditLog).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'admin-1',
      action: 'CLIENT_WORKSPACE_COMMAND',
      entityType: 'Client',
      entityId: 'client-1',
      metadata: { commandType: 'POA_REMINDER_SEND', actorRole: 'ADMIN', status: 'sent' },
    });
  });

  it('USER + eligible=true -> izin + audit (rol değil elevated karar verir)', async () => {
    const deps = buildDeps();
    deps.isApproverEligible.mockResolvedValue(true);
    const execute = jest.fn().mockResolvedValue({ status: 'sent' });

    await runAuthorizedClientWorkspaceCommand(
      deps as any,
      { userId: 'user-1', tenantId: 'tenant-1', role: 'USER' },
      ctx,
      execute,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(deps.auditLog).toHaveBeenCalledTimes(1);
  });

  it('execute throw ederse audit ÜRETİLMEZ (başarısız komut audit üretmez)', async () => {
    const deps = buildDeps();
    const execute = jest.fn().mockRejectedValue(new Error('dispatch failed'));

    await expect(
      runAuthorizedClientWorkspaceCommand(
        deps as any,
        { userId: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN' },
        ctx,
        execute,
      ),
    ).rejects.toThrow('dispatch failed');
    expect(deps.auditLog).not.toHaveBeenCalled();
  });
});

describe('ClientController — 6 workspace endpoint\'i R4 kapısından geçer', () => {
  function buildControllerHarness(role: string | undefined, eligible = false) {
    const clientService: AnyRecord = {
      sendPoaReminder: jest.fn().mockResolvedValue({ clientId: 'client-1', status: 'sent', sent: 1, failed: 0, skipped: 0 }),
      sendTemplateNotification: jest.fn().mockResolvedValue({ status: 'sent' }),
      sendDocumentRequest: jest.fn().mockResolvedValue({ status: 'sent' }),
    };
    const intakeLinkService: AnyRecord = {
      createForClientWorkspace: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      createAndDeliverForClientWorkspace: jest.fn().mockResolvedValue({ id: 'intake-1', status: 'sent' }),
    };
    const poaService: AnyRecord = {
      uploadFileForClientWorkspace: jest.fn().mockResolvedValue({ status: 'uploaded' }),
    };
    const officeApproval: AnyRecord = { isApproverEligible: jest.fn().mockResolvedValue(eligible) };
    const audit: AnyRecord = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new ClientController(
      clientService as any,
      intakeLinkService as any,
      poaService as any,
      officeApproval as any,
      audit as any,
    );
    for (const pipeName of ['templateNotificationBodyPipe', 'documentRequestBodyPipe', 'intakeLinkBodyPipe']) {
      const pipe = (controller as AnyRecord)[pipeName];
      if (pipe && typeof pipe.transform === 'function') {
        jest.spyOn(pipe, 'transform').mockImplementation(async (value: any) => value);
      }
    }
    const req = { user: { id: 'user-1', tenantId: 'tenant-1', role } } as any;
    return { controller, clientService, intakeLinkService, poaService, officeApproval, audit, req };
  }

  const pdfFile = {
    fieldname: 'file',
    originalname: 'poa.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('pdf'),
  } as any;

  type EndpointCase = {
    name: string;
    invoke: (h: ReturnType<typeof buildControllerHarness>) => Promise<unknown>;
    serviceCall: (h: ReturnType<typeof buildControllerHarness>) => jest.Mock;
    commandType: string;
  };

  const endpoints: EndpointCase[] = [
    {
      name: 'POST :clientId/poa-reminders/send',
      invoke: (h) => h.controller.sendPoaReminder(h.req, 'client-1'),
      serviceCall: (h) => h.clientService.sendPoaReminder,
      commandType: 'POA_REMINDER_SEND',
    },
    {
      name: 'POST :clientId/template-notifications/send',
      invoke: (h) =>
        h.controller.sendTemplateNotification(h.req, 'client-1', 'idem-1', {
          templateCode: 'DOSYA_DURUMU',
          caseId: 'case-1',
        }),
      serviceCall: (h) => h.clientService.sendTemplateNotification,
      commandType: 'TEMPLATE_NOTIFICATION_SEND',
    },
    {
      name: 'POST :clientId/document-requests/send',
      invoke: (h) =>
        h.controller.sendDocumentRequest(h.req, 'client-1', 'idem-1', {
          documentCodes: ['GENEL_BELGE'],
          caseId: 'case-1',
        }),
      serviceCall: (h) => h.clientService.sendDocumentRequest,
      commandType: 'DOCUMENT_REQUEST_SEND',
    },
    {
      name: 'POST :clientId/cases/:caseId/intake-links',
      invoke: (h) => h.controller.createIntakeLink(h.req, 'client-1', 'case-1', { channel: 'EMAIL' }),
      serviceCall: (h) => h.intakeLinkService.createForClientWorkspace,
      commandType: 'INTAKE_LINK_CREATE',
    },
    {
      name: 'POST :clientId/cases/:caseId/intake-links/create-and-deliver',
      invoke: (h) =>
        h.controller.createAndDeliverIntakeLink(h.req, 'client-1', 'case-1', 'idem-1', { channel: 'EMAIL' }),
      serviceCall: (h) => h.intakeLinkService.createAndDeliverForClientWorkspace,
      commandType: 'INTAKE_LINK_CREATE_AND_DELIVER',
    },
    {
      name: 'POST :clientId/poas/:poaId/file',
      invoke: (h) => h.controller.uploadPoaFile(h.req, 'client-1', 'poa-1', pdfFile),
      serviceCall: (h) => h.poaService.uploadFileForClientWorkspace,
      commandType: 'POA_FILE_UPLOAD',
    },
  ];

  for (const endpoint of endpoints) {
    describe(endpoint.name, () => {
      it('VIEWER -> 403 VIEWER_DENIED; servis HİÇ çağrılmaz, audit yok, eligibility sorgusu yok', async () => {
        const h = buildControllerHarness('VIEWER');
        await expect(endpoint.invoke(h)).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED }),
        });
        expect(endpoint.serviceCall(h)).not.toHaveBeenCalled();
        expect(h.audit.log).not.toHaveBeenCalled();
        expect(h.officeApproval.isApproverEligible).not.toHaveBeenCalled();
      });

      it('tanımsız rol -> 403 UNKNOWN_ROLE; servis HİÇ çağrılmaz', async () => {
        const h = buildControllerHarness('BILINMEYEN_ROL');
        await expect(endpoint.invoke(h)).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE }),
        });
        expect(endpoint.serviceCall(h)).not.toHaveBeenCalled();
        expect(h.audit.log).not.toHaveBeenCalled();
      });

      it('USER (eligible değil) -> 403 WORKSPACE_COMMAND_DENIED; servis HİÇ çağrılmaz', async () => {
        const h = buildControllerHarness('USER', false);
        await expect(endpoint.invoke(h)).rejects.toMatchObject({
          response: expect.objectContaining({
            reasonCode: CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED,
          }),
        });
        expect(endpoint.serviceCall(h)).not.toHaveBeenCalled();
        expect(h.audit.log).not.toHaveBeenCalled();
      });

      it('ADMIN -> servis çağrılır + AuditLog üretilir (commandType doğru)', async () => {
        const h = buildControllerHarness('ADMIN');
        await endpoint.invoke(h);
        expect(endpoint.serviceCall(h)).toHaveBeenCalledTimes(1);
        expect(h.audit.log).toHaveBeenCalledTimes(1);
        expect(h.audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'CLIENT_WORKSPACE_COMMAND',
            tenantId: 'tenant-1',
            userId: 'user-1',
            entityType: 'Client',
            entityId: 'client-1',
            metadata: expect.objectContaining({ commandType: endpoint.commandType }),
          }),
        );
      });

      it('elevated USER (isApproverEligible=true) -> servis çağrılır + audit', async () => {
        const h = buildControllerHarness('USER', true);
        await endpoint.invoke(h);
        expect(endpoint.serviceCall(h)).toHaveBeenCalledTimes(1);
        expect(h.officeApproval.isApproverEligible).toHaveBeenCalledWith('user-1', 'tenant-1');
        expect(h.audit.log).toHaveBeenCalledTimes(1);
      });
    });
  }

  it('audit metadata ham PII taşımaz (yalnız commandType/actorRole/status sınıfı alanlar)', async () => {
    const h = buildControllerHarness('ADMIN');
    await h.controller.sendPoaReminder(h.req, 'client-1');
    const metadata = h.audit.log.mock.calls[0][0].metadata;
    expect(Object.keys(metadata).sort()).toEqual(['actorRole', 'commandType', 'failed', 'sent', 'skipped', 'status']);
  });
});
