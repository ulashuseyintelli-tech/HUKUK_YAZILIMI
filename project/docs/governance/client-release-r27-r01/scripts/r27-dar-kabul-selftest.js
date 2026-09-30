'use strict';
// r27-dar-kabul.js ÖZ-TESTİ — canlıya dokunmaz. Sahte API+WEB (tek süreç) R26 ve R27 davranışını taklit eder.
// Beklenen: R26 taklidi ile `before` 0 / `after` 2 (DK-7 FAIL); R27 taklidi ile `after` 0 / `before` 2; kapalı sunucu → 3; yazılamayan kanıt → 7.
const http = require('http'); const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const os = require('os');
const SCRIPT = path.join(__dirname, 'r27-dar-kabul.js'); let flavor = 'r26'; const BID = { r26: '5waeMoFGGMTLAYmn9oJvW', r27: 'W2UQpBPD_fp8pq4y7aFIe' };
function handler(req, res) {
  const p = req.url; const j = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (p === '/api/auth/me' || p === '/api/portal/cases' || p === '/api/portal/change-password') return j(401, { message: 'Unauthorized' });
  if (p === '/portal/login' || p === '/portal/profile') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>ok</html>'); }
  if (p === `/_next/static/${BID[flavor]}/_buildManifest.js`) { res.writeHead(200); return res.end('self.__BUILD_MANIFEST={}'); }
  if (p === '/api/portal/reset-password' && req.method === 'POST') { let b = ''; req.on('data', (c) => { b += c; }); return req.on('end', () => { const body = JSON.parse(b || '{}'); if (flavor === 'r27' && String(body.password || '').length < 8) return j(400, { message: 'Şifre en az 8 karakter olmalıdır' }); return j(400, { message: 'Geçersiz veya süresi dolmuş token' }); }); }
  j(404, { message: 'Not Found' });
}
const run = (phase, out, env) => new Promise((r) => { const c = spawn(process.execPath, [SCRIPT, phase, out], { env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (code) => r({ code, log: l })); });
(async () => {
  const srv = http.createServer(handler); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
  const env = { R27_API_BASE: base, R27_WEB_BASE: base, R27_HTTP_TIMEOUT_MS: '3000' }; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r27-dk-')); const rows = [];
  const ck = (id, ok, obs) => rows.push({ id, ok, obs }); const ev = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  flavor = 'r26'; let r = await run('before', path.join(dir, 'a.json'), env); ck('R26-before', r.code === 0 && ev(path.join(dir, 'a.json')).rows.every((x) => x.verdict === 'PASS'), `çıkış=${r.code}`);
  r = await run('after', path.join(dir, 'b.json'), env); ck('R26-after', r.code === 2 && ev(path.join(dir, 'b.json')).rows.find((x) => x.id === 'DK-7').verdict === 'FAIL' && ev(path.join(dir, 'b.json')).rows.find((x) => x.id === 'DK-4').verdict === 'FAIL', `çıkış=${r.code} (R26 tabanında "after" DK-4 ve DK-7 FAIL olmalı)`);
  flavor = 'r27'; r = await run('after', path.join(dir, 'c.json'), env); ck('R27-after', r.code === 0 && ev(path.join(dir, 'c.json')).rows.every((x) => x.verdict === 'PASS'), `çıkış=${r.code}`);
  r = await run('before', path.join(dir, 'd.json'), env); ck('R27-before', r.code === 2, `çıkış=${r.code} (R27'de "before" FAIL olmalı)`);
  r = await run('after', path.join(dir, 'yok', 'e.json'), env); ck('kanıt-yazılamaz', r.code === 7, `çıkış=${r.code}`);
  await new Promise((x) => srv.close(x)); r = await run('after', path.join(dir, 'f.json'), env); ck('kapalı', r.code === 3 && ev(path.join(dir, 'f.json')).summary.unmeasured === 8, `çıkış=${r.code}`);
  const src = fs.readFileSync(SCRIPT, 'utf8'); ck('statik', !/portal\/login`, \{|forgot-password|admin\//.test(src.split('\n').filter((l) => /req\(/.test(l)).join('\n')), 'giriş/forgot/admin çağrısı yok');
  for (const x of rows) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(16)} ${x.obs}`); const f = rows.filter((x) => !x.ok).length; console.log(`R27 DAR KABUL ÖZ-TESTİ: PASS ${rows.length - f} / ${rows.length}`); process.exit(f ? 1 : 0);
})();
