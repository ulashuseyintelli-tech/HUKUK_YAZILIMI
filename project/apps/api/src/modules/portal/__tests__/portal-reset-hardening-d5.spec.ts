/**
 * D5-SEC-R01 — portal parola politikası (API tarafı) + sıfırlama/kapatma sözleşmesi (birim).
 *
 *  [1] DTO: global ValidationPipe ile AYNI seçenekler (whitelist + forbidNonWhitelisted + transform) altında
 *      kısa/eksik/string olmayan parola ve eksik token REDDEDİLİR; fazladan alan reddedilir; geçerli gövde geçer.
 *  [2] Servis: politika dışı parola token TÜKETİLMEDEN reddedilir (bcrypt/updateMany çağrılmaz).
 *  [3] Servis: sıfırlama atomik WHERE'i isActive:true + tenant ACTIVE + süre + token hash içerir.
 *  [4] KAPSAM SINIRI: change-password DEĞİŞMEDİ (profil sayfası 6 karakter kabul eder; kural owner kararı) — 7 karakter
 *      yeni parola servis düzeyinde reddedilmez.
 *  [5] Controller: reset-password gövdesi DTO sınıfıdır (satır içi tip DEĞİL → pipe doğrular); change-password değişmedi.
 */
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PortalService } from '../portal.service';
import { PortalController } from '../portal.controller';
import { PortalResetPasswordDto, PORTAL_PASSWORD_MIN_LENGTH } from '../dto/portal-password.dto';

// main.ts ile AYNI seçenekler.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const run = (metatype: any, value: any) => pipe.transform(value, { type: 'body', metatype });

describe('D5-SEC-R01 [1] DTO doğrulaması (global pipe seçenekleriyle)', () => {
  it('politika sabiti mevcut politikayla aynı: 8', () => expect(PORTAL_PASSWORD_MIN_LENGTH).toBe(8));
  it.each([
    ['7 karakter parola', { token: 't'.repeat(43), password: '1234567' }],
    ['boş parola', { token: 't'.repeat(43), password: '' }],
    ['string olmayan parola', { token: 't'.repeat(43), password: 12345678 }],
    ['eksik parola', { token: 't'.repeat(43) }],
    ['eksik token', { password: 'Uygun12345' }],
    ['boş token', { token: '', password: 'Uygun12345' }],
    ['fazladan alan', { token: 't'.repeat(43), password: 'Uygun12345', isActive: true }],
  ])('reset-password reddi: %s', async (_d, body) => {
    await expect(run(PortalResetPasswordDto, body)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('reset-password geçerli gövde geçer (8 karakter sınırı dahil)', async () => {
    await expect(run(PortalResetPasswordDto, { token: 't'.repeat(43), password: '12345678' })).resolves.toBeInstanceOf(PortalResetPasswordDto);
  });
  it('kısa parolanın hata mesajı Türkçe ve politikayı söyler (web sayfası mesajı gösterir)', async () => {
    const e = await run(PortalResetPasswordDto, { token: 't'.repeat(43), password: '1234567' }).catch((x) => x);
    expect(JSON.stringify(e.getResponse())).toContain('Şifre en az 8 karakter olmalıdır');
  });
});

function buildService(over: any = {}) {
  const prisma = {
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(over.portalUser ?? null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue(over.updateManyResult ?? { count: 0 }),
    },
  };
  const config = { get: jest.fn(() => undefined) };
  const audit = { log: jest.fn() };
  const svc = new PortalService(prisma as any, {} as any, audit as any, {} as any, config as any, { send: jest.fn() } as any);
  return { svc, prisma };
}

describe('D5-SEC-R01 [2]-[4] servis', () => {
  it.each([['7 karakter', '1234567'], ['boş', ''], ['string değil', 12345678 as any], ['undefined', undefined as any]])(
    '[2] resetPassword politika dışı parola (%s) → 400, token TÜKETİLMEZ (updateMany çağrılmaz)', async (_d, pw) => {
      const { svc, prisma } = buildService({ updateManyResult: { count: 1 } });
      await expect(svc.resetPassword('raw-token', pw)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.clientPortalUser.updateMany).not.toHaveBeenCalled();
    });

  it('[3] resetPassword atomik WHERE: isActive:true + tenant ACTIVE + süre + token hash; data tokenVersion++ ve token temizliği korunur', async () => {
    const { svc, prisma } = buildService({ updateManyResult: { count: 1 } });
    await expect(svc.resetPassword('raw-token', 'Uygun12345')).resolves.toEqual({ success: true });
    expect(prisma.clientPortalUser.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = prisma.clientPortalUser.updateMany.mock.calls[0][0];
    expect(where.isActive).toBe(true);
    expect(where.resetTokenExp).toEqual({ gt: expect.any(Date) });
    expect(where.client).toEqual({ tenant: { lifecycle: expect.anything() } });
    expect(typeof where.resetToken).toBe('string');
    expect(data).toEqual(expect.objectContaining({ resetToken: null, resetTokenExp: null, tokenVersion: { increment: 1 } }));
    expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled(); // ayrı ön-okuma YOK
  });

  it('[3b] pasif hesap (eşleşme 0) → geçersiz token ile AYNI mesaj', async () => {
    const { svc } = buildService({ updateManyResult: { count: 0 } });
    const e1 = await svc.resetPassword('raw-token', 'Uygun12345').catch((e) => e);
    expect(e1).toBeInstanceOf(BadRequestException);
    expect(e1.message).toBe('Geçersiz veya süresi dolmuş token');
  });

  it('[4] KAPSAM SINIRI: changePassword DEĞİŞMEDİ — 7 karakter yeni parola servis düzeyinde reddedilmez (kullanıcı arama yapılır)', async () => {
    const { svc, prisma } = buildService({ portalUser: null });
    const e = await svc.changePassword('PU', 'EskiSifre1', '1234567').catch((x) => x);
    expect(e && e.constructor && e.constructor.name).toBe('NotFoundException'); // politika reddi DEĞİL
    expect(prisma.clientPortalUser.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('D5-SEC-R01 [5] controller gövde tipleri', () => {
  const types = (m: string) => Reflect.getMetadata('design:paramtypes', PortalController.prototype, m) as any[];
  it('resetPassword gövdesi PortalResetPasswordDto (Object DEĞİL)', () => expect(types('resetPassword')).toContain(PortalResetPasswordDto));
  it('changePassword gövdesi DEĞİŞMEDİ (satır içi tip → Object; kapsam dışı)', () => expect(types('changePassword')).toContain(Object));
});
