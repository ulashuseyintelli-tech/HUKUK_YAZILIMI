/**
 * RFA-013 — ClientPortalUser reactivate-on-recreate.
 *
 * clientId @unique → disable (isActive=false) sonra tekrar createPortalUser eskiden 400 veriyordu
 * (inaktif satır clientId'yi tutuyordu). Fix: aktif=409, inaktif=AYNI id reactivate (yeni şifre →
 * eski geçersiz, resetToken temizle), email collision GLOBAL guard (login email-global).
 *
 * NOT (C0 bypass fix): createPortalUser artık clientPortalUser + client.update + audit'i AYNI
 * $transaction içinde yapar. Harness tx mock'u üzerinden bu yazımları doğrular.
 */

import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PortalService } from '../portal.service';

function build(over: any = {}) {
  const tx = {
    client: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'c1', hasPortalAccess: false, portalUserId: null }),
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
    },
    clientPortalUser: {
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
      create: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: 'NEWPU', ...a.data })),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', tenantId: 't1', hasPortalAccess: false, portalUserId: null }) },
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue(null), // email collision check
      findUnique: jest.fn().mockResolvedValue(null), // by clientId
      ...over.clientPortalUser,
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  if (over.client) Object.assign(prisma.client, over.client);
  const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  // Task 10-S: bu dosya createPortalUser'ı gerçekten çağırıyor → officeApproval eligible:true olmalı
  // (bu testler dup/reactivate/conflict mantığını doğruluyor, capability'yi DEĞİL).
  const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  const svc = new PortalService(prisma as any, {} as any, audit as any, officeApproval as any);
  return { svc, prisma, tx, audit };
}

describe('RFA-013 createPortalUser reactivate', () => {
  it('inaktif mevcut → AYNI id reactivate (yeni şifre, resetToken null), create ÇAĞRILMAZ', async () => {
    const { svc, tx } = build({
      clientPortalUser: { findUnique: jest.fn().mockResolvedValue({ id: 'PU1', isActive: false, email: 'old@x.com' }) },
    });
    const res: any = await svc.createPortalUser('c1', 'new@x.com', 'YeniSifre123', 't1', { userId: 'u-test' });

    expect(res._reactivated).toBe(true);
    expect(res.portalUserId).toBe('PU1');
    expect(tx.clientPortalUser.create).not.toHaveBeenCalled();
    const upd = tx.clientPortalUser.update.mock.calls[0][0];
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
    const { svc, tx } = build({
      clientPortalUser: { findUnique: jest.fn().mockResolvedValue({ id: 'PU2', isActive: true }) },
    });
    await expect(svc.createPortalUser('c1', 'a@x.com', 'pw', 't1', { userId: 'u-test' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.clientPortalUser.create).not.toHaveBeenCalled();
    expect(tx.clientPortalUser.update).not.toHaveBeenCalled();
  });

  it('başka AKTİF user aynı email (GLOBAL) → 409', async () => {
    const { svc, prisma, tx } = build({
      clientPortalUser: { findFirst: jest.fn().mockResolvedValue({ id: 'OTHER', email: 'dup@x.com' }) },
    });
    await expect(svc.createPortalUser('c1', 'dup@x.com', 'pw', 't1', { userId: 'u-test' })).rejects.toBeInstanceOf(ConflictException);
    // email guard findUnique'ten ÖNCE → clientId create/update yok
    expect(tx.clientPortalUser.create).not.toHaveBeenCalled();
    // guard global + self hariç (clientId not c1)
    expect(prisma.clientPortalUser.findFirst.mock.calls[0][0].where).toMatchObject({ email: 'dup@x.com', isActive: true, clientId: { not: 'c1' } });
  });

  it('hiç mevcut yok → düz create', async () => {
    const { svc, tx } = build();
    const res: any = await svc.createPortalUser('c1', 'fresh@x.com', 'pw', 't1', { userId: 'u-test' });
    expect(tx.clientPortalUser.create).toHaveBeenCalledTimes(1);
    expect(res.portalUserId).toBe('NEWPU');
  });
});
