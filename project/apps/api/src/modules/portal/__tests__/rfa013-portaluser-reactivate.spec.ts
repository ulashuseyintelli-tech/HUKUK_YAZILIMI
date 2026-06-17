/**
 * RFA-013 — ClientPortalUser reactivate-on-recreate.
 *
 * clientId @unique → disable (isActive=false) sonra tekrar createPortalUser eskiden 400 veriyordu
 * (inaktif satır clientId'yi tutuyordu). Fix: aktif=409, inaktif=AYNI id reactivate (yeni şifre →
 * eski geçersiz, resetToken temizle), email collision GLOBAL guard (login email-global).
 */

import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PortalService } from '../portal.service';

function build(over: any = {}) {
  const prisma = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', tenantId: 't1' }), update: jest.fn().mockResolvedValue({}) },
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue(null), // email collision check
      findUnique: jest.fn().mockResolvedValue(null), // by clientId
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
      create: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: 'NEWPU', ...a.data })),
      ...over.clientPortalUser,
    },
  };
  if (over.client) Object.assign(prisma.client, over.client);
  const svc = new PortalService(prisma as any, {} as any);
  return { svc, prisma };
}

describe('RFA-013 createPortalUser reactivate', () => {
  it('inaktif mevcut → AYNI id reactivate (yeni şifre, resetToken null), create ÇAĞRILMAZ', async () => {
    const { svc, prisma } = build({
      clientPortalUser: { findUnique: jest.fn().mockResolvedValue({ id: 'PU1', isActive: false, email: 'old@x.com' }) },
    });
    const res: any = await svc.createPortalUser('c1', 'new@x.com', 'YeniSifre123', 't1');

    expect(res._reactivated).toBe(true);
    expect(res.portalUserId).toBe('PU1');
    expect(prisma.clientPortalUser.create).not.toHaveBeenCalled();
    const upd = prisma.clientPortalUser.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'PU1' });
    expect(upd.data.isActive).toBe(true);
    expect(upd.data.email).toBe('new@x.com');
    expect(upd.data.resetToken).toBeNull();
    expect(upd.data.resetTokenExp).toBeNull();
    // güvenlik: yeni şifre geçerli, eski şifre geçersiz
    expect(await bcrypt.compare('YeniSifre123', upd.data.passwordHash)).toBe(true);
    expect(await bcrypt.compare('EskiSifre', upd.data.passwordHash)).toBe(false);
  });

  it('aktif mevcut (aynı clientId) → 409, create/update ÇAĞRILMAZ', async () => {
    const { svc, prisma } = build({
      clientPortalUser: { findUnique: jest.fn().mockResolvedValue({ id: 'PU2', isActive: true }) },
    });
    await expect(svc.createPortalUser('c1', 'a@x.com', 'pw', 't1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.clientPortalUser.create).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
  });

  it('başka AKTİF user aynı email (GLOBAL) → 409', async () => {
    const { svc, prisma } = build({
      clientPortalUser: { findFirst: jest.fn().mockResolvedValue({ id: 'OTHER', email: 'dup@x.com' }) },
    });
    await expect(svc.createPortalUser('c1', 'dup@x.com', 'pw', 't1')).rejects.toBeInstanceOf(ConflictException);
    // email guard findUnique'ten ÖNCE → clientId create/update yok
    expect(prisma.clientPortalUser.create).not.toHaveBeenCalled();
    // guard global + self hariç (clientId not c1)
    expect(prisma.clientPortalUser.findFirst.mock.calls[0][0].where).toMatchObject({ email: 'dup@x.com', isActive: true, clientId: { not: 'c1' } });
  });

  it('hiç mevcut yok → düz create', async () => {
    const { svc, prisma } = build();
    const res: any = await svc.createPortalUser('c1', 'fresh@x.com', 'pw', 't1');
    expect(prisma.clientPortalUser.create).toHaveBeenCalledTimes(1);
    expect(res.portalUserId).toBe('NEWPU');
  });
});
