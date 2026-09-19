/**
 * PR-2 / Görev 4.2: Trust Proxy Integration Test
 *
 * INV-7: Reverse proxy arkasında req.ip gerçek client IP'sini döner.
 * Senaryolar: 0 hop (direkt), 1 hop (nginx), 2 hop (CDN+nginx)
 *
 * Uygulama, üretimle aynı HTTP platformu (@nestjs/platform-express) üzerinde küçük bir Nest
 * uygulamasıdır; `trust proxy` ayarı üretimdeki TEK yapılandırma noktasından (`applyTrustProxy`,
 * main.ts bootstrap'ının da çağırdığı fonksiyon) uygulanır. Bu test ayarın DAVRANIŞINI doğrular;
 * main.ts'in fonksiyonu çağırdığı ayrıca (kaynak düzeyinde) doğrulanır.
 */
import { Controller, Get, INestApplication, Module, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request } from 'express';
import { applyTrustProxy } from '../common/trust-proxy.config';

@Controller()
class IpProbeController {
  @Get('ip')
  ip(@Req() req: Request) {
    return { ip: req.ip, ips: req.ips };
  }
}

@Module({ controllers: [IpProbeController] })
class TrustProxyTestModule {}

describe('Trust Proxy Integration', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(TrustProxyTestModule, new ExpressAdapter(), { logger: false });
    applyTrustProxy(app);
    await app.listen(0, '127.0.0.1');
    const addr = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('0 hop (direkt): req.ip === remoteAddress (XFF yok)', async () => {
    const res = await fetch(`${baseUrl}/ip`);
    const body = await res.json();
    // Direkt bağlantıda XFF yok → req.ip loopback olur
    expect(body.ip).toMatch(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/);
  });

  it('1 hop (nginx): XFF = client-ip → req.ip === client-ip', async () => {
    const res = await fetch(`${baseUrl}/ip`, {
      headers: { 'X-Forwarded-For': '203.0.113.50' },
    });
    const body = await res.json();
    expect(body.ip).toBe('203.0.113.50');
  });

  it('2 hop (CDN+nginx): XFF = client-ip, cdn-ip → req.ip === cdn-ip (trust proxy=1 tek hop güvenir)', async () => {
    const res = await fetch(`${baseUrl}/ip`, {
      headers: { 'X-Forwarded-For': '203.0.113.50, 198.51.100.10' },
    });
    const body = await res.json();
    // trust proxy=1 → en sağdaki (en yakın proxy) IP'ye güvenir
    // Bu durumda cdn-ip döner, client-ip DEĞİL — dokümante edilmiş beklenen davranış
    expect(body.ip).toBe('198.51.100.10');
  });
});
