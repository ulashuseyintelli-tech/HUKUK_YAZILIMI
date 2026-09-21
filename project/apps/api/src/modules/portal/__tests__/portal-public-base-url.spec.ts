/**
 * PUBLIC_PORTAL_BASE_URL — müvekkil portalı bağlantısı personel yüzeyinden AYRILIR.
 *
 * Neden: portal bağlantısı müvekkilin KENDİ cihazından açılır; personel daveti ve personel
 * parola sıfırlama ise iç adreste kalır. Tek bir `WEB_BASE_URL` ikisini birden taşıyamaz.
 *
 * Bu dosya doğrular:
 *  - Anahtar YOKSA davranış BİREBİR eskisi gibidir (`WEB_BASE_URL`, sonra `APP_BASE_URL`).
 *  - Anahtar VARSA portal linki onu kullanır; `WEB_BASE_URL` değişmeden kalır.
 *  - Sondaki `/` kırpılır (mevcut davranışla aynı kural).
 *  - Ham token yine YALNIZ URL fragment'ında taşınır; `?token=` biçimi hiçbir yerde yoktur.
 *  - Personel yüzeyi (`user-invite`, `auth/password-reset`) bu anahtarı OKUMAZ — kaynak
 *    düzeyinde ölçülür; portal anahtarı personel bağlantılarını etkilemez.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PortalService } from '../portal.service';

function buildService(configMap: Record<string, string | undefined>) {
  const prisma = {
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue({ id: 'PU1', email: 'muvekkil@example.com', client: { tenant: { lifecycle: 'ACTIVE' } } }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const emailProvider = { send: jest.fn().mockResolvedValue({ success: true, provider: 'mock' }) };
  const config = { get: jest.fn((key: string) => configMap[key]) };
  const svc = new PortalService(prisma as any, {} as any, {} as any, {} as any, config as any, emailProvider as any);
  return { svc, emailProvider };
}

async function linkFor(configMap: Record<string, string | undefined>): Promise<URL> {
  const { svc, emailProvider } = buildService(configMap);
  await svc.createResetToken('muvekkil@example.com');
  expect(emailProvider.send).toHaveBeenCalledTimes(1);
  const body = String(emailProvider.send.mock.calls[0][0].text);
  const raw = body.match(/https?:\/\/\S+/);
  expect(raw).not.toBeNull();
  return new URL(raw![0]);
}

describe('portal sıfırlama bağlantısının temel adresi', () => {
  it('PUBLIC_PORTAL_BASE_URL YOKSA davranış değişmez: WEB_BASE_URL kullanılır', async () => {
    const url = await linkFor({ WEB_BASE_URL: 'https://ic-adres.example', APP_BASE_URL: 'https://eski.example' });
    expect(url.origin).toBe('https://ic-adres.example');
    expect(url.pathname).toBe('/portal/reset-password');
  });

  it('WEB_BASE_URL de yoksa APP_BASE_URL kullanılır (mevcut yedek zinciri korunur)', async () => {
    const url = await linkFor({ APP_BASE_URL: 'https://eski.example' });
    expect(url.origin).toBe('https://eski.example');
  });

  it('PUBLIC_PORTAL_BASE_URL VARSA portal linki onu kullanır ve WEB_BASE_URL göz ardı edilir', async () => {
    const url = await linkFor({ PUBLIC_PORTAL_BASE_URL: 'https://portal.disaridan.example', WEB_BASE_URL: 'https://ic-adres.example' });
    expect(url.origin).toBe('https://portal.disaridan.example');
    expect(url.pathname).toBe('/portal/reset-password');
  });

  it('sondaki eğik çizgiler kırpılır (çift eğik çizgi üretilmez)', async () => {
    const url = await linkFor({ PUBLIC_PORTAL_BASE_URL: 'https://portal.disaridan.example//', WEB_BASE_URL: 'https://ic-adres.example' });
    expect(url.toString()).toContain('https://portal.disaridan.example/portal/reset-password#token=');
    expect(url.toString()).not.toContain('example//portal');
  });

  it('ham token yalnız fragment\'ta taşınır; query biçimi üretilmez', async () => {
    const { svc, emailProvider } = buildService({ PUBLIC_PORTAL_BASE_URL: 'https://portal.disaridan.example' });
    await svc.createResetToken('muvekkil@example.com');
    const arg = emailProvider.send.mock.calls[0][0];
    for (const body of [String(arg.text), String(arg.html ?? '')]) {
      expect(body).toContain('/portal/reset-password#token=');
      expect(body).not.toContain('?token=');
    }
  });

  it('PERSONEL yüzeyi bu anahtarı OKUMAZ (kaynak düzeyinde ölçüm)', () => {
    const base = path.resolve(__dirname, '../../');
    for (const rel of ['auth/invite/user-invite.service.ts', 'auth/password-reset/password-reset.service.ts']) {
      const src = fs.readFileSync(path.join(base, rel), 'utf8');
      expect(src).not.toContain('PUBLIC_PORTAL_BASE_URL');
      expect(src).toContain('WEB_BASE_URL');
    }
  });
});
