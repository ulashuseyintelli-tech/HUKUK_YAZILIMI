/**
 * PR-2 / Görev 4.2: Trust Proxy Integration Test
 *
 * INV-7: Reverse proxy arkasında req.ip gerçek client IP'sini döner.
 * Senaryolar: 0 hop (direkt), 1 hop (nginx), 2 hop (CDN+nginx)
 */
import * as express from 'express';
import * as http from 'http';

describe('Trust Proxy Integration', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  beforeAll((done) => {
    app = express();
    app.set('trust proxy', 1);
    app.get('/ip', (req, res) => {
      res.json({ ip: req.ip, ips: req.ips });
    });
    server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
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
