/**
 * C2-B03 (R5) — INTAKE-LINK MUTATION AUTHORITY PRIMITIVE sözleşme kanıtı.
 *
 * Bu spec, CODEX-CLIENT-X3'ün TÜKETECEĞİ primitive'in DONDURULMUŞ public shape'ini ve
 * eşik semantiğini kilitler. Buradaki bir kırılma = X3 sözleşmesinin kırılması demektir;
 * değişiklik yalnız C2 sayfası üzerinden yapılabilir (tek writer kuralı).
 *
 * Kapsam SINIRI: CR-1 (review ≠ promote) bu primitive'in DIŞINDA — owner kararı bekler;
 * promotion yetkisi bu testlerle DE kanıtlanmaz, türetilemez.
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

type AnyRecord = Record<string, any>;

describe('C2-B03 — dondurulmuş public shape (X3 sözleşmesi)', () => {
  it('INTAKE_LINK_* komut tipleri exact string değerleriyle mevcut', () => {
    expect(CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_CREATE).toBe('INTAKE_LINK_CREATE');
    expect(CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_CREATE_AND_DELIVER).toBe('INTAKE_LINK_CREATE_AND_DELIVER');
    expect(CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_REVOKE).toBe('INTAKE_LINK_REVOKE');
  });

  it('primitive fonksiyonları export edilmiş ve çağrılabilir', () => {
    expect(typeof decideClientWorkspaceCommand).toBe('function');
    expect(typeof runAuthorizedClientWorkspaceCommand).toBe('function');
  });

  it('ret kodları sözleşmesi stabil (X3 response mapping bu kodlara bağlanır)', () => {
    expect(CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED).toBe('CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND');
    expect(CLIENT_MUTATION_REASON.VIEWER_DENIED).toBe('CLIENT_MUTATION_DENIED_VIEWER');
    expect(CLIENT_MUTATION_REASON.UNKNOWN_ROLE).toBe('CLIENT_MUTATION_DENIED_UNKNOWN_ROLE');
    expect(CLIENT_MUTATION_REASON.TENANT_MISMATCH).toBe('CLIENT_MUTATION_DENIED_TENANT_MISMATCH');
    expect(CLIENT_MUTATION_REASON.NO_ACTOR).toBe('CLIENT_MUTATION_DENIED_NO_ACTOR');
  });
});

describe('C2-B03 — intake-link mutasyonlarında eşik semantiği (owner §13/11)', () => {
  const INTAKE_TYPES = [
    CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_CREATE,
    CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_CREATE_AND_DELIVER,
    CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_REVOKE,
  ] as const;

  function buildDeps(eligible = false) {
    return {
      isApproverEligible: jest.fn().mockResolvedValue(eligible),
      auditLog: jest.fn().mockResolvedValue(undefined),
    };
  }

  for (const commandType of INTAKE_TYPES) {
    describe(commandType, () => {
      const ctx = { tenantId: 'tenant-1', clientId: 'client-1', commandType };

      it('VIEWER -> 403 VIEWER_DENIED; yürütme ve audit OLMAZ, eligibility sorgusu YOK', async () => {
        const deps = buildDeps(true);
        const execute = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-1', role: 'VIEWER' },
            ctx,
            execute as any,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(execute).not.toHaveBeenCalled();
        expect(deps.auditLog).not.toHaveBeenCalled();
        expect(deps.isApproverEligible).not.toHaveBeenCalled();
      });

      it('USER (eligible değil) -> 403 WORKSPACE_COMMAND_DENIED; yürütme OLMAZ', async () => {
        const deps = buildDeps(false);
        const execute = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-1', role: 'USER' },
            ctx,
            execute as any,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            reasonCode: CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED,
          }),
        });
        expect(execute).not.toHaveBeenCalled();
      });

      it('cross-tenant -> TENANT_MISMATCH; hiçbir sorgu/yürütme olmaz', async () => {
        const deps = buildDeps(true);
        const execute = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-EVIL', role: 'ADMIN' },
            ctx,
            execute as any,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.TENANT_MISMATCH }),
        });
        expect(execute).not.toHaveBeenCalled();
        expect(deps.isApproverEligible).not.toHaveBeenCalled();
      });

      it('ADMIN -> izin (eligibility sorgusuz) + AuditLog commandType taşır', async () => {
        const deps = buildDeps(false);
        const execute = jest.fn().mockResolvedValue({ id: 'link-1' });
        await runAuthorizedClientWorkspaceCommand(
          deps as any,
          { userId: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN' },
          ctx,
          execute as any,
        );
        expect(execute).toHaveBeenCalledTimes(1);
        expect(deps.isApproverEligible).not.toHaveBeenCalled();
        expect(deps.auditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'CLIENT_WORKSPACE_COMMAND',
            entityType: 'Client',
            entityId: 'client-1',
            metadata: expect.objectContaining({ commandType }),
          }),
        );
      });

      it('elevated USER -> izin + audit (rol değil elevated karar verir)', async () => {
        const deps = buildDeps(true);
        const execute = jest.fn().mockResolvedValue({ id: 'link-1' });
        await runAuthorizedClientWorkspaceCommand(
          deps as any,
          { userId: 'user-1', tenantId: 'tenant-1', role: 'USER' },
          ctx,
          execute as any,
        );
        expect(execute).toHaveBeenCalledTimes(1);
        expect(deps.isApproverEligible).toHaveBeenCalledWith('user-1', 'tenant-1');
        expect(deps.auditLog).toHaveBeenCalledTimes(1);
      });
    });
  }

  it('X3 tüketim deseni: intake-side servis primitive üzerinden sarılır (simülasyon)', async () => {
    // X3'ün yapacağı wiring'in birebir simülasyonu — intake modülüne DOKUNMADAN:
    // kendi endpoint'inde primitive'i çağırır, kendi servis fonksiyonunu execute verir.
    const deps = buildDeps(false);
    const intakeService = { revoke: jest.fn().mockResolvedValue({ id: 'link-9', status: 'REVOKED' }) };

    const result = await runAuthorizedClientWorkspaceCommand(
      deps as any,
      { userId: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN' },
      { tenantId: 'tenant-1', clientId: 'client-7', commandType: CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_REVOKE },
      () => intakeService.revoke('tenant-1', 'link-9', 'admin-1'),
      (r: AnyRecord) => ({ status: r.status }),
    );

    expect(result).toEqual({ id: 'link-9', status: 'REVOKED' });
    expect(intakeService.revoke).toHaveBeenCalledWith('tenant-1', 'link-9', 'admin-1');
    expect(deps.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'client-7',
        metadata: expect.objectContaining({ commandType: 'INTAKE_LINK_REVOKE', status: 'REVOKED' }),
      }),
    );
  });
});
