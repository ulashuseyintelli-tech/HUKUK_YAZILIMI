/**
 * RFA-005 — Lookup create reactivate-on-code.
 *
 * Soft-delete (delete → isActive=false) + @@unique([tenantId, code]) → silinen code yeniden
 * create edilince eskiden P2002 → ham 500. Fix: (tenantId, code) ile inactive dahil ara →
 * active=409, soft-deleted=AYNI id reactivate + editable alanları güncelle, yok=düz create.
 * Generic servis tek-kaynak (6 lookup modeli birden).
 */

import { ConflictException } from '@nestjs/common';
import { LookupService } from '../lookup.service';

function build(modelMock: any) {
  // getModel(type) → this.prisma.lookup<Type>. 'takipTuru' → lookupTakipTuru.
  const prisma = { lookupTakipTuru: modelMock } as any;
  return new LookupService(prisma);
}

describe('RFA-005 LookupService.create reactivate-on-code', () => {
  it('soft-deleted code tekrar create → AYNI id reactivate, editable alanlar güncellenir, create ÇAĞRILMAZ', async () => {
    const model = {
      findFirst: jest.fn().mockResolvedValue({ id: 'L1', code: 'TKP', isActive: false, name: 'Eski' }),
      update: jest.fn().mockResolvedValue({ id: 'L1', code: 'TKP', isActive: true, name: 'Yeni' }),
      create: jest.fn(),
    };
    const svc = build(model);

    const res: any = await svc.create('tenant-1', 'takipTuru', { code: 'TKP', name: 'Yeni', description: 'd', sortOrder: 3 });

    expect(model.create).not.toHaveBeenCalled();
    expect(model.update).toHaveBeenCalledTimes(1);
    const upd = model.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'L1' });        // AYNI id
    expect(upd.data.isActive).toBe(true);            // reactivate
    expect(upd.data.name).toBe('Yeni');              // editable güncellendi
    expect(upd.data.description).toBe('d');
    expect(upd.data.sortOrder).toBe(3);
    expect(upd.data.code).toBeUndefined();           // code DEĞİŞMEZ (update'e girmez)
    expect(upd.data.tenantId).toBeUndefined();       // tenantId DEĞİŞMEZ
    expect(res.id).toBe('L1');
  });

  it('active same code tekrar create → 409 ConflictException, create/update ÇAĞRILMAZ', async () => {
    const model = {
      findFirst: jest.fn().mockResolvedValue({ id: 'L2', code: 'TKP', isActive: true }),
      update: jest.fn(),
      create: jest.fn(),
    };
    const svc = build(model);

    await expect(svc.create('tenant-1', 'takipTuru', { code: 'TKP', name: 'X' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(model.create).not.toHaveBeenCalled();
    expect(model.update).not.toHaveBeenCalled();
  });

  it('hiç kayıt yoksa → düz create (mevcut davranış, tenantId eklenir)', async () => {
    const model = {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'L3', code: 'YENI' }),
    };
    const svc = build(model);

    await svc.create('tenant-1', 'takipTuru', { code: 'YENI', name: 'Z' });

    expect(model.create).toHaveBeenCalledTimes(1);
    expect(model.create.mock.calls[0][0].data).toMatchObject({ code: 'YENI', name: 'Z', tenantId: 'tenant-1' });
  });

  it('tenant izolasyonu: findFirst tenantId-scoped (where tenantId + code)', async () => {
    const model = { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'L4' }) };
    const svc = build(model);

    await svc.create('tenant-2', 'takipTuru', { code: 'ORTAK' });

    expect(model.findFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-2', code: 'ORTAK' } });
  });
});
