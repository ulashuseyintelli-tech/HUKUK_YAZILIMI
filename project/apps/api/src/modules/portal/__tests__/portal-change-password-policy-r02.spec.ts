/**
 * D5-SEC-R02 (owner kararı 2026-09-28) — portal profil parola değiştirme de sıfırlamayla AYNI kurala geçer (en az 8).
 *
 *  [1] Kural YALNIZ yeni parola belirlenirken uygulanır: kuraldan ÖNCE belirlenmiş kısa (6 karakter) mevcut parolayla
 *      giriş ETKİLENMEZ (zorunlu değişiklik yok) — login politika kontrolü yapmaz.
 *  [2] Kısa MEVCUT parolası olan kullanıcı, eski parolasını doğru girip 8 karakterlik yeni parolaya geçebilir
 *      (eski parolanın uzunluğu sorulmaz); 7 karakterlik yeni parola ise DB'ye gitmeden reddedilir.
 */
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PortalService } from '../portal.service';

async function build(currentPassword: string) {
  const passwordHash = await bcrypt.hash(currentPassword, 4);
  const user = { id: 'PU1', email: 'a@x.com', clientId: 'C1', passwordHash, tokenVersion: 3, isActive: true,
    client: { id: 'C1', displayName: 'M', tenantId: 'T1', type: 'PERSON', tenant: { lifecycle: 'ACTIVE' } } };
  const prisma = {
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue(user),
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed-token') };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new PortalService(prisma as any, jwt as any, audit as any, {} as any, { get: () => undefined } as any, { send: jest.fn() } as any);
  return { svc, prisma, jwt };
}

describe('D5-SEC-R02 — profil parola kuralı: mevcut parolalara zorunlu değişiklik YOK', () => {
  it('[1] kuraldan önce belirlenmiş 6 karakterlik mevcut parolayla giriş ETKİLENMEZ', async () => {
    const { svc, jwt } = await build('abc123');
    const res: any = await svc.login('a@x.com', 'abc123');
    expect(res.token).toBe('signed-token');
    expect(jwt.sign).toHaveBeenCalledTimes(1);
  });

  it('[2a] kısa mevcut parola + 8 karakterlik yeni parola → değişiklik yapılır (eski parola uzunluğu sorulmaz)', async () => {
    const { svc, prisma } = await build('abc123');
    await svc.changePassword('PU1', 'abc123', 'YeniSifre8');
    expect(prisma.clientPortalUser.update).toHaveBeenCalledTimes(1);
    const data = prisma.clientPortalUser.update.mock.calls[0][0].data;
    expect(await bcrypt.compare('YeniSifre8', data.passwordHash)).toBe(true);
    expect(data.tokenVersion).toEqual({ increment: 1 }); // mevcut oturum güvencesi korunur
  });

  it('[2b] 7 karakterlik yeni parola → 400, DB okunmaz/yazılmaz', async () => {
    const { svc, prisma } = await build('abc123');
    await expect(svc.changePassword('PU1', 'abc123', '1234567')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clientPortalUser.findUnique).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
  });
});
