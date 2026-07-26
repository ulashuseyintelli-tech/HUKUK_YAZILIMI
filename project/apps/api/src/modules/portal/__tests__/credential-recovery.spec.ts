/**
 * CLIENT-P2-CREDENTIAL-RECOVERY-P01 — createResetToken/resetPassword.
 *
 * Kapatılan residual: CLIENT-GOVERNANCE-CHARTER.md §18.7 "Credential recovery delivery"
 * + §25.6 R3 "plaintext reset-token gap". Bu dosya doğrular:
 *  - kullanıcı bulunursa: hash DB'ye yazılır, ham token DB'ye YAZILMAZ, tek e-posta
 *    doğru (allowlisted base URL'li) reset linkiyle gönderilir
 *  - kullanıcı bulunamazsa: aynı {success:true}, e-posta YOK, DB yazımı YOK (enumeration-safe)
 *  - e-posta sağlayıcısı hata verse/throw etse de dış cevap DEĞİŞMEZ
 *  - resetPassword tek bir atomik `updateMany` ile tüketir (findFirst+update AYRI DEĞİL)
 *  - aynı token'la eşzamanlı iki istek → en fazla biri başarılı (atomik updateMany simülasyonu)
 *  - geçersiz/süresi geçmiş/tüketilmiş token → BadRequestException
 *
 * CLIENT-SEC-P01 (reset-token transport hardening) ek olarak doğrular:
 *  - reset linki ham token'ı URL FRAGMENT'ında taşır; `?token=` query parametresi YOKTUR
 *  - e-posta gövdesinin (text + html) hiçbir yerinde `?token=` biçimi geçmez
 *  - üretim → fragment'tan çıkarım → backend doğrulama zinciri uçtan uca tutarlıdır
 */
import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { PortalService } from '../portal.service';
import { hashInviteToken } from '../../auth/invite/user-invite-token.util';

/**
 * CLIENT-SEC-P01: frontend'in (app/portal/reset-password/page.tsx) ham token'ı URL
 * fragment'ından çıkarma mantığının birebir aynısı. Kasıtlı olarak burada tekrar edilir:
 * bu sayede backend'in ÜRETTİĞİ link ile frontend'in OKUDUĞU biçim arasındaki sözleşme
 * API testinde de kilitlenir (biri değişip diğeri değişmezse bu test kırılır).
 */
function extractTokenFromFragment(url: URL): string | null {
  const rawHash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  return new URLSearchParams(rawHash).get('token');
}

function buildService(over: any = {}) {
  const prisma = {
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue(over.foundUser ?? null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue(over.updateManyResult ?? { count: 0 }),
    },
  };
  const emailProvider = {
    send: jest.fn().mockResolvedValue({ success: true, provider: 'mock' }),
    ...over.emailProvider,
  };
  const config = {
    get: jest.fn((key: string) => {
      if (over.config && key in over.config) return over.config[key];
      if (key === 'WEB_BASE_URL') return 'https://portal.example.com';
      return undefined;
    }),
  };
  const svc = new PortalService(prisma as any, {} as any, {} as any, {} as any, config as any, emailProvider as any);
  return { svc, prisma, emailProvider, config };
}

describe('createResetToken', () => {
  it('[1] kullanıcı mevcut → hash DB\'ye yazılır, ham token DB\'ye YAZILMAZ, tek e-posta allowlisted URL ile gönderilir', async () => {
    const { svc, prisma, emailProvider } = buildService({ foundUser: { id: 'PU1', email: 'a@x.com' } });

    const res = await svc.createResetToken('a@x.com');
    expect(res).toEqual({ success: true });

    expect(prisma.clientPortalUser.update).toHaveBeenCalledTimes(1);
    const updateData = prisma.clientPortalUser.update.mock.calls[0][0].data;
    expect(updateData.resetToken).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(updateData.resetTokenExp).toBeInstanceOf(Date);

    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    const emailArg = emailProvider.send.mock.calls[0][0];
    expect(emailArg.to).toBe('a@x.com');

    const urlMatch = String(emailArg.text).match(/https?:\/\/\S+/);
    expect(urlMatch).toBeTruthy();
    const url = new URL(urlMatch![0]);
    expect(url.origin).toBe('https://portal.example.com'); // yalnız allowlisted WEB_BASE_URL, request-host DEĞİL
    expect(url.pathname).toBe('/portal/reset-password');

    // CLIENT-SEC-P01: ham token FRAGMENT'ta taşınır (query string DEĞİL).
    const rawTokenInUrl = extractTokenFromFragment(url);
    expect(rawTokenInUrl).toBeTruthy();
    // DB'ye yazılan değer ham token DEĞİL — ham token'ın sha256 hash'i
    expect(updateData.resetToken).not.toBe(rawTokenInUrl);
    expect(updateData.resetToken).toBe(crypto.createHash('sha256').update(rawTokenInUrl!, 'utf8').digest('hex'));
    expect(updateData.resetToken).toBe(hashInviteToken(rawTokenInUrl!));
  });

  it('[1a] CLIENT-SEC-P01: reset linkinde `?token=` query parametresi YOK, token yalnız fragment\'ta', async () => {
    const { svc, emailProvider } = buildService({ foundUser: { id: 'PU1', email: 'a@x.com' } });
    await svc.createResetToken('a@x.com');

    const emailArg = emailProvider.send.mock.calls[0][0];
    const url = new URL(String(emailArg.text).match(/https?:\/\/\S+/)![0]);

    // Query yüzeyi tamamen boş: access log / Referer / analytics token'ı GÖREMEZ.
    expect(url.search).toBe('');
    expect(url.searchParams.get('token')).toBeNull();
    // Fragment gerçekten token taşıyor.
    expect(url.hash.startsWith('#token=')).toBe(true);

    // E-postanın HER İKİ gövdesinde de query-string biçimi hiç geçmemeli (html linki dahil).
    for (const body of [String(emailArg.text), String(emailArg.html)]) {
      expect(body).not.toMatch(/reset-password\?/);
      expect(body).not.toMatch(/[?&]token=/);
      expect(body).toContain('/portal/reset-password#token=');
    }
  });

  it('[1b] CLIENT-SEC-P01 chain: link üretimi → fragment\'tan çıkarım → backend doğrulama uçtan uca tutarlı', async () => {
    // Bu test üç halkayı TEK akışta bağlar: (1) servis linki üretir, (2) frontend'in
    // yaptığı fragment-parse işlemi birebir tekrarlanır, (3) çıkarılan ham token
    // resetPassword()'a verilir ve backend'in beklediği hash ile eşleşir.
    const { svc, prisma, emailProvider } = buildService({
      foundUser: { id: 'PU1', email: 'a@x.com' },
      updateManyResult: { count: 1 },
    });

    await svc.createResetToken('a@x.com');
    const persistedHash = prisma.clientPortalUser.update.mock.calls[0][0].data.resetToken;

    const url = new URL(String(emailProvider.send.mock.calls[0][0].text).match(/https?:\/\/\S+/)![0]);
    const tokenFromFragment = extractTokenFromFragment(url);
    expect(tokenFromFragment).toBeTruthy();

    const res = await svc.resetPassword(tokenFromFragment!, 'YeniSifre123');
    expect(res).toEqual({ success: true });

    // Backend'in aradığı hash, üretim anında DB'ye yazılan hash ile AYNI olmalı.
    const consumeWhere = prisma.clientPortalUser.updateMany.mock.calls[0][0].where;
    expect(consumeWhere.resetToken).toBe(persistedHash);
    expect(consumeWhere.resetTokenExp).toEqual({ gt: expect.any(Date) });
  });

  it('[2] kullanıcı yok → aynı başarı cevabı, e-posta YOK, DB yazımı YOK (enumeration-safe)', async () => {
    const { svc, prisma, emailProvider } = buildService({ foundUser: null });

    const res = await svc.createResetToken('yok@x.com');
    expect(res).toEqual({ success: true });
    expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('[3] e-posta sağlayıcısı {success:false} döner → yine {success:true}, dış cevap DEĞİŞMEZ', async () => {
    const { svc } = buildService({
      foundUser: { id: 'PU1', email: 'a@x.com' },
      emailProvider: { send: jest.fn().mockResolvedValue({ success: false, errorCode: 'SMTP_ERROR', provider: 'smtp' }) },
    });
    const res = await svc.createResetToken('a@x.com');
    expect(res).toEqual({ success: true });
  });

  it('[3b] e-posta gönderimi THROW eder → yine {success:true}, throw dışa YANSIMAZ', async () => {
    const { svc } = buildService({
      foundUser: { id: 'PU1', email: 'a@x.com' },
      emailProvider: { send: jest.fn().mockRejectedValue(new Error('network down')) },
    });
    const res = await svc.createResetToken('a@x.com');
    expect(res).toEqual({ success: true });
  });
});

describe('resetPassword', () => {
  it('[4] geçerli token → tek atomik updateMany (findFirst+update AYRI DEĞİL), şifre güncellenir, token temizlenir', async () => {
    const { svc, prisma } = buildService({ updateManyResult: { count: 1 } });

    const res = await svc.resetPassword('raw-token-abc', 'YeniSifre123');
    expect(res).toEqual({ success: true });

    expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientPortalUser.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.clientPortalUser.updateMany.mock.calls[0][0];
    expect(call.where.resetToken).toBe(hashInviteToken('raw-token-abc'));
    expect(call.where.resetTokenExp).toEqual({ gt: expect.any(Date) });
    expect(call.data.resetToken).toBeNull();
    expect(call.data.resetTokenExp).toBeNull();
    expect(typeof call.data.passwordHash).toBe('string');
  });

  it('[5] geçersiz/süresi geçmiş/tüketilmiş token → BadRequestException (count:0)', async () => {
    const { svc } = buildService({ updateManyResult: { count: 0 } });
    await expect(svc.resetPassword('bad-token', 'YeniSifre123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('[6] aynı token ile eşzamanlı iki istek → en fazla biri başarılı (atomik conditional-update simülasyonu)', async () => {
    // Gerçek Postgres'te tek UPDATE...WHERE atomiktir: ilk update resetToken'ı null'a
    // çektiği an ikinci update'in WHERE'i artık eşleşmez. Burada bu davranışı, updateMany'yi
    // "consumed" durumuna göre count:1/count:0 döndüren stateful bir mock ile simüle ederiz.
    let consumed = false;
    const prisma = {
      clientPortalUser: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockImplementation(async () => {
          if (consumed) return { count: 0 };
          consumed = true;
          return { count: 1 };
        }),
      },
    };
    const svc = new PortalService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const results = await Promise.allSettled([
      svc.resetPassword('same-token', 'Sifre1234A'),
      svc.resetPassword('same-token', 'Sifre1234B'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
    expect(prisma.clientPortalUser.findFirst).not.toHaveBeenCalled();
  });
});
