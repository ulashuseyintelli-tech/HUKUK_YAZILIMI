import { NotFoundException } from '@nestjs/common';
import { ClientNotificationService } from '../client-notification.service';

/**
 * CLIENT-SEC-H2B regression — client-notification template update tenant-scope.
 *
 * Kapsam:
 * - same-tenant update başarılı.
 * - cross-tenant update reddedilir (NotFoundException).
 * - nonexistent template AYNI sonucu verir (varlık ifşası yok).
 * - foreign kayıt hiç hedeflenmez (updateMany where'i tenantId taşır — TOCTOU'suz atomik desen).
 * - list/create davranışı DEĞİŞMEDİ (bu spec'in kapsamı dışı, dokunulmadı).
 */
describe('CLIENT-SEC-H2B — client-notification template tenant-scope', () => {
  const build = (updateManyCount: number, findFirstResult: any) => {
    const prisma: any = {
      messageTemplate: {
        updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
    };
    const service = new ClientNotificationService(prisma, {} as any);
    return { service, prisma };
  };

  it('same-tenant update başarılı: atomik updateMany({id,tenantId}) + tenant-scoped re-read', async () => {
    const updatedRow = { id: 'tpl-1', tenantId: 'tenant-A', name: 'Yeni Ad' };
    const { service, prisma } = build(1, updatedRow);

    const res = await service.updateEmailTemplate('tenant-A', 'tpl-1', { name: 'Yeni Ad' });

    expect(prisma.messageTemplate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tpl-1', tenantId: 'tenant-A' } }),
    );
    expect(prisma.messageTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'tpl-1', tenantId: 'tenant-A' },
    });
    expect(res).toEqual(updatedRow);
  });

  it('cross-tenant update reddedilir: updateMany count=0 → NotFoundException; re-read hiç çağrılmaz', async () => {
    const { service, prisma } = build(0, null);

    await expect(
      service.updateEmailTemplate('tenant-B', 'tpl-belongs-to-tenant-A', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.messageTemplate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tpl-belongs-to-tenant-A', tenantId: 'tenant-B' } }),
    );
    // Foreign kayıt hiç re-read edilmedi (varlık ifşası riski yok):
    expect(prisma.messageTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('nonexistent template AYNI sonucu verir (cross-tenant ile ayırt edilemez)', async () => {
    const { service } = build(0, null);

    await expect(
      service.updateEmailTemplate('tenant-A', 'nonexistent-id', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cross-tenant ve nonexistent AYNI exception mesajını taşır (existence oracle yok)', async () => {
    const { service: svcCrossTenant } = build(0, null);
    const { service: svcNonexistent } = build(0, null);

    let crossTenantMsg = '';
    let nonexistentMsg = '';
    try {
      await svcCrossTenant.updateEmailTemplate('tenant-B', 'foreign-id', {});
    } catch (e: any) {
      crossTenantMsg = e.message;
    }
    try {
      await svcNonexistent.updateEmailTemplate('tenant-A', 'never-existed-id', {});
    } catch (e: any) {
      nonexistentMsg = e.message;
    }
    expect(crossTenantMsg).toBe(nonexistentMsg);
    expect(crossTenantMsg).not.toContain('foreign-id');
    expect(crossTenantMsg).not.toContain('tenant-B');
  });
});
