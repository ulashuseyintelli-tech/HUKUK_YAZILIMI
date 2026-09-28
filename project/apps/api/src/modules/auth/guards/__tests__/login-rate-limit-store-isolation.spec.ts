/**
 * D5-SEC-R03 — giriş hız sınırı sayaçları yüzey başına AYRI (gerçek HTTP, üretimdeki trust proxy ayarı).
 *
 * Ölçülen çapraz etki (düzeltme öncesi): PortalLoginRateLimitGuard, LoginRateLimitGuard'ın modül düzeyi Map'ini
 * paylaşıyordu; aynı anahtara düşen personel girişi istekleri portal kullanıcısını 429'a düşürüyordu (ve tersi).
 * Beklenen: her yüzeyin KENDİ sayacı ve KENDİ limiti; kurtarma sayacı da ayrı kalır (mevcut davranış korunur).
 *
 * Anahtar eşitliği güvenilir kenar modunda kurulur (peer 127.0.0.1 listede → her iki guard da XFF'in en sağ
 * değerini anahtar alır); böylece yalnız STORE paylaşımı ölçülür, anahtar çözümü değil.
 */
import { Controller, HttpCode, INestApplication, Module, Post, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as http from 'http';
import { applyTrustProxy } from '../../../../common/trust-proxy.config';
import { LoginRateLimitGuard, PortalLoginRateLimitGuard } from '../login-rate-limit.guard';
import { CredentialRecoveryRateLimitGuard } from '../credential-recovery-rate-limit.guard';

@Controller()
class ProbeController {
  @Post('staff-login') @HttpCode(200) @UseGuards(LoginRateLimitGuard) staff() { return { ok: true }; }
  @Post('portal-login') @HttpCode(200) @UseGuards(PortalLoginRateLimitGuard) portal() { return { ok: true }; }
  @Post('portal-recovery') @HttpCode(200) @UseGuards(CredentialRecoveryRateLimitGuard) recovery() { return { ok: true }; }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('D5-SEC-R03 — hız sınırı sayaçları yüzey başına ayrı', () => {
  let app: INestApplication; let port: number; const saved = process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS;
  beforeAll(async () => {
    process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS = '127.0.0.1'; // güvenilir kenar: iki guard da aynı anahtarı türetir
    app = await NestFactory.create(ProbeModule, new ExpressAdapter(), { logger: false });
    applyTrustProxy(app);
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as { port: number }).port;
  });
  afterAll(async () => { if (saved === undefined) delete process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS; else process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS = saved; await app.close(); });

  const post = (path: string, xff: string) => new Promise<number>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: `/${path}`, method: 'POST', headers: { 'x-forwarded-for': xff } },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode || 0)); });
    req.on('error', reject); req.end();
  });
  const flood = async (path: string, xff: string, n = 10) => { const s: number[] = []; for (let i = 0; i < n; i++) s.push(await post(path, xff)); return s; };

  it('[1] personel girişi 10 istekle dolar → AYNI anahtardaki portal girişi 200 (personel sayacı portalı ETKİLEMEZ)', async () => {
    const key = '192.0.2.101';
    expect((await flood('staff-login', key)).every((c) => c === 200)).toBe(true);
    expect(await post('staff-login', key)).toBe(429);   // personel kendi limitinde
    expect(await post('portal-login', key)).toBe(200);  // portal etkilenmedi
    expect(await post('portal-recovery', key)).toBe(200); // kurtarma etkilenmedi
  });

  it('[2] portal girişi 10 istekle dolar → AYNI anahtardaki personel girişi ve kurtarma 200 (tersi de ayrı)', async () => {
    const key = '192.0.2.102';
    expect((await flood('portal-login', key)).every((c) => c === 200)).toBe(true);
    expect(await post('portal-login', key)).toBe(429);
    expect(await post('staff-login', key)).toBe(200);
    expect(await post('portal-recovery', key)).toBe(200);
  });

  it('[3] kurtarma 10 istekle dolar → AYNI anahtardaki portal ve personel girişi 200 (kurtarma sayacı kendi kapsamında)', async () => {
    const key = '192.0.2.103';
    expect((await flood('portal-recovery', key)).every((c) => c === 200)).toBe(true);
    expect(await post('portal-recovery', key)).toBe(429);
    expect(await post('portal-login', key)).toBe(200);
    expect(await post('staff-login', key)).toBe(200);
  });

  it('[4] her yüzeyin kendi limiti korunur: 10/dk, 11. istek 429', async () => {
    for (const p of ['staff-login', 'portal-login', 'portal-recovery']) {
      const key = `192.0.2.${110 + ['staff-login', 'portal-login', 'portal-recovery'].indexOf(p)}`;
      const s = await flood(p, key, 11);
      expect(s.slice(0, 10).every((c) => c === 200)).toBe(true);
      expect(s[10]).toBe(429);
    }
  });
});
