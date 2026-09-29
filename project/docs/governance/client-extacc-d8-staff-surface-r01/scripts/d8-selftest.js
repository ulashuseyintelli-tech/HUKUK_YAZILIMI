'use strict';
/*
 * D-8 sondası ÖZ-TESTİ — canlıya dokunmaz. Gerçek TLS'li sahte kenar (Caddyfile şablonunun 4 izin regex'i + admin reddi) ile:
 *  S1 sağlıklı kenar → sonda çıkış 0, tüm retler 403 katman 'caddy', pozitifler beklendiği gibi;
 *  S2 bozuk kenar (personel API'si ve admin yolu geçiyor) → sonda çıkış 2, bulgular listede;
 *  S3 sağlayıcı reddi taklidi (403 + imzalı gövde) → katman 'edge-waf';
 *  S4 kenar kapalı → çıkış 3 (ölçülemeyen), kanıt yine yazılır;
 *  S5 kapılar: http origin → 4; TLS kapalı → 4; kanıt yazılamaz → 7.
 * KULLANIM: node d8-selftest.js   ÇIKIŞ: 0 PASS · 1 FAIL · 2 ölçülemedi
 */
const { spawn, execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path'); const os = require('os'); const https = require('https');
const PROBE = path.join(__dirname, 'd8-staff-surface-probe.js'); const PORT = 8457;
const RX = {
  web: /^\/(intake\/[^/]+|portal(\/(login|forgot-password|reset-password|cases|documents|financial-disclosures|messages|poas|profile))?|portal\/cases\/[^/]+|_next\/.+|favicon\.ico)$/,
  aget: /^\/api\/(public\/intake\/[^/]+|portal\/(cases|cases\/[^/]+|financial-disclosures|financial-disclosures\/history|financial-disclosures\/[^/]+|poas|notifications|notifications\/unread-count|documents|documents\/[^/]+\/download|messages|messages\/unread-count))$/,
  apost: /^\/api\/(public\/intake\/[^/]+|portal\/(login|forgot-password|reset-password|change-password|notifications\/[^/]+\/read|notifications\/read-all|messages|messages\/mark-read|documents\/upload))$/,
  adel: /^\/api\/portal\/documents\/[^/]+$/,
};
let mode = 'ok';
function edge(req, res) {
  const p = req.url; // Caddy path_regexp ham yola bakar (sorgu dahil değil; burada ham url — sorgu varyantı böylece reddedilir)
  const allowed = (req.method === 'GET' && (RX.web.test(p) || RX.aget.test(p))) || (req.method === 'POST' && RX.apost.test(p)) || (req.method === 'DELETE' && RX.adel.test(p));
  const admin = /^\/api\/portal\/admin(\/|$)/.test(p);
  if (mode === 'waf' && (admin || !allowed)) { res.writeHead(403, { 'content-type': 'text/html', 'cf-ray': 'test' }); return res.end('<html>Sorry, you have been blocked · cloudflare · error code: 1020</html>'); }
  if (mode === 'broken' && (p === '/api/auth/me' || admin)) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"leak":true}'); }
  if (admin || !allowed) { res.writeHead(403); return res.end(); }
  if (p.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"message":"Unauthorized"}'); }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>portal</title>');
}
const rows = []; const check = (id, d, ok, obs) => rows.push({ id, ok, d, obs });
function run(args, env) { return new Promise((res) => { const c = spawn(process.execPath, [PROBE, ...args], { env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (x) => { l += x; }); c.stderr.on('data', (x) => { l += x; }); c.on('close', (code) => res({ code, log: l })); }); }
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd8-selftest-')); const cert = path.join(dir, 'cert.pem'); const key = path.join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const srv = https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, edge); await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  const ORIGIN = `https://localhost:${PORT}`; const env = { NODE_EXTRA_CA_CERTS: cert }; const ev = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
  try {
    mode = 'ok'; let r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's1.json')], env); let e = ev('s1.json');
    check('S1', 'sağlıklı kenar: çıkış 0; tüm retler 403 katman caddy; pozitifler beklendiği gibi; kanıtta başlık DEĞERİ yok', r.code === 0 && e.exitCode === 0 && e.findings.length === 0 && e.rows.filter((x) => x.group === 'deny').every((x) => x.status === 403 && x.layer === 'caddy') && e.rows.filter((x) => x.group === 'allow').every((x) => x.ok) && !/cf-ray/.test(JSON.stringify(e.rows.map((x) => x.serverHeader))), `çıkış=${r.code} · katman=${JSON.stringify(e.denyLayers)}`);
    mode = 'broken'; r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's2.json')], env); e = ev('s2.json');
    check('S2', 'bozuk kenar (personel oturumu + admin geçiyor): çıkış 2; bulgular /api/auth/me ve admin yollarını sayar', r.code === 2 && e.findings.some((f) => /GET \/api\/auth\/me → HTTP 200/.test(f)) && e.findings.filter((f) => /portal\/admin|portal\/ADMIN|portal%2Fadmin|\.\/admin/.test(f)).length >= 4, `çıkış=${r.code} · bulgu=${e.findings.length}`);
    mode = 'waf'; r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's3.json')], env); e = ev('s3.json');
    check('S3', 'sağlayıcı reddi taklidi: çıkış 0; katman edge-waf', r.code === 0 && e.denyLayers['edge-waf'] === e.deny && !e.denyLayers.caddy, `katman=${JSON.stringify(e.denyLayers)}`);
    await new Promise((x) => srv.close(x));
    r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's4.json')], Object.assign({ D8_HTTP_TIMEOUT_MS: '1500' }, env)); e = ev('s4.json');
    check('S4', 'kenar kapalı: çıkış 3 (ölçülemeyen), kanıt yazıldı, bulgu yok', r.code === 3 && e.unmeasured === e.deny + e.allow && e.findings.length === 0, `çıkış=${r.code} · ölçülemeyen=${e.unmeasured}`);
    r = await run(['--origin', 'http://localhost:1', '--out', path.join(dir, 's5.json')], env); check('S5-a', 'http origin → 4', r.code === 4, `çıkış=${r.code}`);
    r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's5.json')], Object.assign({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, env)); check('S5-b', 'TLS doğrulaması kapalı → 4', r.code === 4, `çıkış=${r.code}`);
    r = await run(['--origin', ORIGIN, '--out', path.join(dir, 'yok', 'x.json')], Object.assign({ D8_HTTP_TIMEOUT_MS: '1500' }, env)); check('S5-c', 'kanıt yazılamaz → 7', r.code === 7, `çıkış=${r.code}`);
    r = await run(['--origin', ORIGIN, '--phone-list'], env); check('S6', '--phone-list: 5 adres, telefon talimatı, ölçüm yok', r.code === 0 && (r.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /beyan/i.test(r.log), 'liste');
    const src = fs.readFileSync(PROBE, 'utf8');
    const allowBlock = src.slice(src.indexOf('const ALLOW = ['), src.indexOf('];', src.indexOf('const ALLOW = [')));
    check('T-1', 'sonda pozitif listesinde giriş/forgot-password/intake POST/belge yükleme YOK (yalnız token olmadan guard pozitifleri)', !/api\/portal\/login'|api\/portal\/forgot-password'|public\/intake|documents\/upload/.test(allowBlock) && !allowBlock.split('\n').some((l) => /'POST'/.test(l) && !/token yok/.test(l)), 'statik');
  } catch (e) { console.log('OLCULEMEDI: ' + String(e && e.stack || e).slice(0, 400)); process.exit(2); }
  for (const x of rows) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.d}\n        ${x.obs}`);
  const fail = rows.filter((x) => !x.ok).length; console.log(`\nD-8 SONDA ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}  (kanıt: ${dir})`); process.exit(fail ? 1 : 0);
})();
