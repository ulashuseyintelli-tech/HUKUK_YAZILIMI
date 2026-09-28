/**
 * D5-SEC-R01 — portal giriş/kurtarma hız sınırının istemci anahtarı, GERÇEK HTTP + üretimdeki trust proxy ayarıyla.
 *
 * Uygulama üretimle aynı platformdadır (`@nestjs/platform-express`) ve `applyTrustProxy` (main.ts'in çağırdığı tek
 * yapılandırma noktası; trust proxy=1) uygulanır. Test süreci yerelden bağlandığı için socket peer her zaman
 * 127.0.0.1'dir; güvenilir/güvenilmez eş ayrımı `PUBLIC_INTAKE_TRUSTED_PROXY_IPS` ile kurulur:
 *  - liste 127.0.0.1'i İÇERMEZ → eş güvenilmez
 *  - liste 127.0.0.1'i içerir → eş güvenilir kenar vekili (tek değerli X-Forwarded-For yazar)
 *
 *  [1] güvenilmez peer + HER İSTEKTE FARKLI sahte X-Forwarded-For → portal girişi 11. istekte 429 (sahte başlık yeni
 *      kova açamaz). Aynı senaryo portal kurtarma uçlarında da 429.
 *  [2] güvenilir peer (kenar) + Caddy'nin yazdığı tek değer → farklı istemciler AYRI kova; biri dolunca diğeri geçer.
 *  [3] güvenilir peer + istemcinin kendi eklediği değer + kenar değeri ("sahte, gerçek") → anahtar EN SAĞDAKİ (kenarın
 *      yazdığı) değerdir; soldaki sahte değer kova seçemez. (Canlı Caddy şablonu başlığı zaten tek değere ezer.)
 */
import { Controller, HttpCode, INestApplication, Module, Post, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as http from 'http';
import { applyTrustProxy } from '../../../../common/trust-proxy.config';
import { PortalLoginRateLimitGuard } from '../login-rate-limit.guard';
import { CredentialRecoveryRateLimitGuard } from '../credential-recovery-rate-limit.guard';

@Controller()
class ProbeController {
  @Post('portal-login') @HttpCode(200) @UseGuards(PortalLoginRateLimitGuard) portalLogin() { return { ok: true }; }
  @Post('portal-recovery') @HttpCode(200) @UseGuards(CredentialRecoveryRateLimitGuard) recovery() { return { ok: true }; }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('D5-SEC-R01 — portal hız sınırı istemci anahtarı (gerçek HTTP, trust proxy=1)', () => {
  let app: INestApplication; let port: number; const saved = process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS;
  beforeAll(async () => {
    app = await NestFactory.create(ProbeModule, new ExpressAdapter(), { logger: false });
    applyTrustProxy(app);
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as { port: number }).port;
  });
  afterAll(async () => { if (saved === undefined) delete process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS; else process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS = saved; await app.close(); });

  const post = (path: string, xff?: string) => new Promise<number>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: `/${path}`, method: 'POST', headers: xff ? { 'x-forwarded-for': xff } : {} },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode || 0)); });
    req.on('error', reject); req.end();
  });
  const burst = async (path: string, xffOf: (i: number) => string | undefined, n = 11) => { const s: number[] = []; for (let i = 0; i < n; i++) s.push(await post(path, xffOf(i))); return s; };

  it('[1] güvenilmez peer + rotasyonlu sahte XFF: portal girişi ve kurtarma 11. istekte 429 (sınır aşılamaz)', async () => {
    process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS = '10.255.255.254'; // 127.0.0.1 güvenilmez
    const login = await burst('portal-login', (i) => `198.51.100.${i + 1}`);
    expect(login.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(login[10]).toBe(429);
    const rec = await burst('portal-recovery', (i) => `203.0.113.${i + 1}`);
    expect(rec.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(rec[10]).toBe(429);
  });

  it('[2] güvenilir kenar + tek değerli XFF: farklı istemciler ayrı kova', async () => {
    process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS = '127.0.0.1';
    const a = await burst('portal-recovery', () => '192.0.2.10');
    expect(a[10]).toBe(429);
    expect(await post('portal-recovery', '192.0.2.11')).toBe(200); // B etkilenmez
    const la = await burst('portal-login', () => '192.0.2.20');
    expect(la[10]).toBe(429);
    expect(await post('portal-login', '192.0.2.21')).toBe(200);
  });

  it('[3] güvenilir kenar + "sahte, gerçek": anahtar en sağdaki (kenar) değer; soldaki sahte değer kova seçemez', async () => {
    process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS = '127.0.0.1';
    const s = await burst('portal-recovery', (i) => `9.9.${i}.9, 192.0.2.30`);
    expect(s[10]).toBe(429);
  });

});
