'use strict';
// IZOLE ISTEMCI-IP ARKA UCU — urun zincirinin GERCEK parcalariyla kurulur:
//   express 4.21.2 + `trust proxy = 1` (canli `main.js:8` ile ayni ayar)
//   + CANLI dist'ten `resolvePublicIntakeClientIp` (derlenmis modul okunur, sunucu ACILMAZ)
//   + `PublicIntakeRateLimitGuard` ile AYNI anahtar: sha256(cozulen ip).
// Boylece "uygulamanin hangi IP'yi kullandigi" taklitle degil, urun koduyla olculur.
//
// argv: [2]=port  [3]=client-ip modul yolu  [4]=PUBLIC_INTAKE_TRUSTED_PROXY_IPS
const path = require('path');
const { createHash } = require('crypto');

const PORT = Number(process.argv[2] || 8191);
const MODULE_PATH = process.argv[3];
// '-' = allowlist BOS (PowerShell bos string argumani kabul etmez).
const TRUSTED = process.argv[4] === '-' ? '' : (process.argv[4] || '');

let express;
try {
  express = require('express');
} catch {
  console.error('OLCULEMEDI: express bulunamadi');
  process.exit(2);
}

let resolvePublicIntakeClientIp;
try {
  ({ resolvePublicIntakeClientIp } = require(path.resolve(MODULE_PATH)));
} catch (e) {
  console.error('OLCULEMEDI: client-ip modulu yuklenemedi: ' + e.message);
  process.exit(2);
}
if (typeof resolvePublicIntakeClientIp !== 'function') {
  console.error('OLCULEMEDI: resolvePublicIntakeClientIp fonksiyon degil');
  process.exit(2);
}

const app = express();
app.set('trust proxy', 1); // canli main.js ile AYNI

app.all('*', (req, res) => {
  const resolved = resolvePublicIntakeClientIp(req, TRUSTED);
  res.json({
    service: 'API',
    methodSeen: req.method,
    rawUrlSeen: req.url,
    xff: req.headers['x-forwarded-for'] || null,
    cfConnectingIp: req.headers['cf-connecting-ip'] || null,
    peer: req.socket.remoteAddress,
    expressReqIp: req.ip,
    // Urunun hiz siniri bu deger uzerinden anahtarlanir (public-intake-rate-limit.guard.ts).
    resolvedClientIp: resolved,
    rateLimitIpHash: createHash('sha256').update(resolved).digest('hex'),
  });
});

app.listen(PORT, '127.0.0.1', () => console.log(`API(client-ip) dinliyor 127.0.0.1:${PORT}`));
