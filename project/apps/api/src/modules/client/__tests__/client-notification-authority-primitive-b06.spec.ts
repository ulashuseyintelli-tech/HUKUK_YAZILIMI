/**
 * C2-B06 — NOTIFICATION/WORKSPACE AUTHORITY PRIMITIVE sözleşme kanıtı.
 *
 * CODEX-CLIENT-X1'in CN-1 WIRING'de TÜKETECEĞİ primitive'in dondurulmuş shape'ini ve
 * eşik semantiğini kilitler. X1 kendi rol politikasını ÜRETMEZ; bu testlerdeki davranış
 * X1 wiring'inin kabul zeminini tanımlar. Değişiklik yalnız C2 sayfası üzerinden.
 *
 * Owner §13/11 madde 6: gerçek mail/SMS gönderimi veya gönderim kuyruğuna yazma —
 * eşik ADMIN VEYA canonical elevated; yetki kontrolü queue-write/dispatch'ten ÖNCE.
 */
import { ForbiddenException } from '@nestjs/common';
import {
  CLIENT_MUTATION_REASON,
} from '../client-mutation-policy';
import {
  CLIENT_WORKSPACE_COMMAND,
  runAuthorizedClientWorkspaceCommand,
} from '../client-workspace-command-authority';

type AnyRecord = Record<string, any>;

describe('C2-B06 — dondurulmuş public shape (X1 CN-1 sözleşmesi)', () => {
  it('NOTIFICATION_* komut tipleri exact string değerleriyle mevcut', () => {
    expect(CLIENT_WORKSPACE_COMMAND.NOTIFICATION_SEND_EMAIL).toBe('NOTIFICATION_SEND_EMAIL');
    expect(CLIENT_WORKSPACE_COMMAND.NOTIFICATION_SEND_SMS).toBe('NOTIFICATION_SEND_SMS');
    expect(CLIENT_WORKSPACE_COMMAND.NOTIFICATION_BULK_EMAIL).toBe('NOTIFICATION_BULK_EMAIL');
    expect(CLIENT_WORKSPACE_COMMAND.NOTIFICATION_RESEND).toBe('NOTIFICATION_RESEND');
  });

  it('B03 freeze bozulmadı — önceki komut tipleri aynen duruyor (additive genişletme)', () => {
    expect(CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_CREATE).toBe('INTAKE_LINK_CREATE');
    expect(CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_CREATE_AND_DELIVER).toBe('INTAKE_LINK_CREATE_AND_DELIVER');
    expect(CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_REVOKE).toBe('INTAKE_LINK_REVOKE');
    expect(CLIENT_WORKSPACE_COMMAND.POA_REMINDER_SEND).toBe('POA_REMINDER_SEND');
    expect(CLIENT_WORKSPACE_COMMAND.TEMPLATE_NOTIFICATION_SEND).toBe('TEMPLATE_NOTIFICATION_SEND');
    expect(CLIENT_WORKSPACE_COMMAND.DOCUMENT_REQUEST_SEND).toBe('DOCUMENT_REQUEST_SEND');
    expect(CLIENT_WORKSPACE_COMMAND.POA_FILE_UPLOAD).toBe('POA_FILE_UPLOAD');
  });
});

describe('C2-B06 — CN-1 komutlarında eşik semantiği (owner §13/11 madde 6)', () => {
  const CN1_TYPES = [
    CLIENT_WORKSPACE_COMMAND.NOTIFICATION_SEND_EMAIL,
    CLIENT_WORKSPACE_COMMAND.NOTIFICATION_SEND_SMS,
    CLIENT_WORKSPACE_COMMAND.NOTIFICATION_BULK_EMAIL,
    CLIENT_WORKSPACE_COMMAND.NOTIFICATION_RESEND,
  ] as const;

  function buildDeps(eligible = false) {
    return {
      isApproverEligible: jest.fn().mockResolvedValue(eligible),
      auditLog: jest.fn().mockResolvedValue(undefined),
    };
  }

  for (const commandType of CN1_TYPES) {
    describe(commandType, () => {
      const ctx = { tenantId: 'tenant-1', clientId: 'client-1', commandType };

      it('VIEWER -> 403; dispatch/queue-write HİÇ başlamaz, audit yok', async () => {
        const deps = buildDeps(true);
        const dispatch = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-1', role: 'VIEWER' },
            ctx,
            dispatch as any,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(dispatch).not.toHaveBeenCalled();
        expect(deps.auditLog).not.toHaveBeenCalled();
        expect(deps.isApproverEligible).not.toHaveBeenCalled();
      });

      it('tanımsız rol -> 403 UNKNOWN_ROLE fail-closed; dispatch başlamaz', async () => {
        const deps = buildDeps(true);
        const dispatch = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-1', role: 'SISTEM_HESABI' },
            ctx,
            dispatch as any,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE }),
        });
        expect(dispatch).not.toHaveBeenCalled();
      });

      it('USER (eligible değil) -> 403 WORKSPACE_COMMAND_DENIED; mail/SMS/queue yan etkisi YOK', async () => {
        const deps = buildDeps(false);
        const dispatch = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-1', role: 'USER' },
            ctx,
            dispatch as any,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            reasonCode: CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED,
          }),
        });
        expect(dispatch).not.toHaveBeenCalled();
      });

      it('cross-tenant -> TENANT_MISMATCH; sorgusuz kesin ret', async () => {
        const deps = buildDeps(true);
        const dispatch = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-OTHER', role: 'ADMIN' },
            ctx,
            dispatch as any,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.TENANT_MISMATCH }),
        });
        expect(dispatch).not.toHaveBeenCalled();
        expect(deps.isApproverEligible).not.toHaveBeenCalled();
      });

      it('ADMIN -> dispatch çalışır + gönderim girişimi AuditLog üretir (commandType/result)', async () => {
        const deps = buildDeps(false);
        const dispatch = jest.fn().mockResolvedValue({ status: 'sent', notificationId: 'n-1' });
        const result = await runAuthorizedClientWorkspaceCommand(
          deps as any,
          { userId: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN' },
          ctx,
          dispatch as any,
          (r: AnyRecord) => ({ status: r.status }),
        );
        expect(result).toEqual({ status: 'sent', notificationId: 'n-1' });
        expect(deps.isApproverEligible).not.toHaveBeenCalled();
        expect(deps.auditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'CLIENT_WORKSPACE_COMMAND',
            tenantId: 'tenant-1',
            userId: 'admin-1',
            metadata: expect.objectContaining({ commandType, status: 'sent' }),
          }),
        );
      });

      it('elevated USER -> dispatch + audit; başarısız (failed) sonuç da girişim olarak audit edilir', async () => {
        const deps = buildDeps(true);
        const dispatch = jest.fn().mockResolvedValue({ status: 'failed' });
        await runAuthorizedClientWorkspaceCommand(
          deps as any,
          { userId: 'user-1', tenantId: 'tenant-1', role: 'USER' },
          ctx,
          dispatch as any,
          (r: AnyRecord) => ({ status: r.status }),
        );
        expect(deps.isApproverEligible).toHaveBeenCalledWith('user-1', 'tenant-1');
        expect(deps.auditLog).toHaveBeenCalledWith(
          expect.objectContaining({ metadata: expect.objectContaining({ status: 'failed' }) }),
        );
      });

      it('dispatch throw ederse audit ÜRETİLMEZ', async () => {
        const deps = buildDeps(false);
        const dispatch = jest.fn().mockRejectedValue(new Error('smtp down'));
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN' },
            ctx,
            dispatch as any,
          ),
        ).rejects.toThrow('smtp down');
        expect(deps.auditLog).not.toHaveBeenCalled();
      });
    });
  }

  it('X1 wiring deseni: notification servisi primitive üzerinden sarılır (simülasyon)', async () => {
    // X1'in CN-1 wiring'de yapacağının birebir simülasyonu — client-notification
    // modülüne DOKUNMADAN: endpoint kendi servis çağrısını execute olarak verir.
    const deps = buildDeps(false);
    const notificationService = { sendEmail: jest.fn().mockResolvedValue({ status: 'sent', id: 'mail-1' }) };

    const result = await runAuthorizedClientWorkspaceCommand(
      deps as any,
      { userId: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN' },
      {
        tenantId: 'tenant-1',
        clientId: 'client-3',
        commandType: CLIENT_WORKSPACE_COMMAND.NOTIFICATION_SEND_EMAIL,
      },
      () => notificationService.sendEmail('tenant-1', 'client-3', { subject: 'x' }),
      (r: AnyRecord) => ({ status: r.status }),
    );

    expect(result).toEqual({ status: 'sent', id: 'mail-1' });
    expect(deps.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'client-3',
        metadata: expect.objectContaining({ commandType: 'NOTIFICATION_SEND_EMAIL', status: 'sent' }),
      }),
    );
  });
});
