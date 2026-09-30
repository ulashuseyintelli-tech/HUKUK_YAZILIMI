'use strict';
/*
 * D-8 sondası ÖZ-TESTİ — canlıya dokunmaz. Gerçek TLS'li sahte kenar (Caddyfile şablonunun 4 izin regex'i + admin reddi) ile:
 *  S1   sağlıklı kenar (`Server: Caddy`, boş 403) → sonda çıkış 0, tüm retler 403 katman 'caddy', pozitifler beklendiği gibi;
 *  S1-p HAM YOL: her ret/pozitif vektörü için sondanın gönderdiği ham yol == kenarın gördüğü req.url (birebir, sırayla; /__seen);
 *  S1-c KİMLİK/GÖVDE ÖLÇÜMÜ: kenar hiçbir istekte authorization/cookie/x-api-key görmedi; gövde uzunluğu 0 (GET/DELETE) veya 2 ('{}');
 *       kanıt `measured` (credentialHeaderRequests=0, nonEmptyBodyRequests=0, requestCount=deny+allow) kenarın gördüğüyle uyumlu;
 *       `design` beyanı AYRI alanda;
 *  S2   bozuk kenar (personel oturumu ve DÜZ admin yolları geçiyor) → sonda çıkış 2; bulgu = /api/auth/me + 6 düz admin yolu (=7);
 *       kodlama varyantları (ADMIN, ./, %2F) sahte kenarda 403 kalır;
 *  S3   sağlayıcı reddi taklidi (403 + imzalı gövde + `Server: cloudflare` + cf-ray + cf-mitigated) → katman 'edge-provider', hints dolu;
 *  S3-b boş 403 gövdesi, Server başlığı YOK → katman 'unknown' (boş gövde tek başına 'caddy' DEMEZ), hints.bodyEmpty=true;
 *  S3-c boş 403 gövdesi, `Server: cloudflare`, imza YOK (kenar Caddy'yi arkasında gizliyor) → 'unknown'; serverHeaderValue='cloudflare';
 *  S3-d DOLU JSON gövdeli 403 + `Server: Caddy` (uygulama ForbiddenException taklidi) → çıkış 0 (PASS düşmez) ama
 *       suspectAppOrigin403 = ret sayısı; sağlıklı kenarda (S1) bu sayaç 0;
 *  S4   kenar kapalı → çıkış 3 (ölçülemeyen), kanıt yine yazılır;
 *  S5   kapılar: http origin → 4; TLS kapalı → 4; kanıt yazılamaz → 7;
 *  S6   --phone-list; T-1/T-2 statik: pozitif listede giriş/forgot/intake/upload yok; https.request seçenek nesnesiyle (URL string değil);
 *       her ret vektöründe ifPassed var; kanıtta kimlik/yazma bayrakları ÖLÇÜLEN `measured` alanından (sabit literal DEĞİL).
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
let mode = 'ok'; let seen = []; // seen: kenarın gördüğü HAM req.url listesi (sırayla) + kimlik başlığı varlığı + gövde uzunluğu
function edge(req, res) {
  const p = req.url; // Node req.url ham request-target'tır: './', '%2F', '?x=1' normalize edilmez
  if (req.method === 'GET' && p === '/__seen') { const s = seen; seen = []; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(s)); }
  let bodyLen = 0; req.on('data', (c) => { bodyLen += c.length; });
  req.on('end', () => {
    const h = req.headers; const cred = !!(h.authorization || h.cookie || h['x-api-key'] || h['proxy-authorization']);
    seen.push({ method: req.method, url: p, cred, bodyLen });
    const allowed = (req.method === 'GET' && (RX.web.test(p) || RX.aget.test(p))) || (req.method === 'POST' && RX.apost.test(p)) || (req.method === 'DELETE' && RX.adel.test(p));
    const admin = /^\/api\/portal\/admin(\/|$)/.test(p);
    if (mode === 'waf' && (admin || !allowed)) { res.writeHead(403, { 'content-type': 'text/html', server: 'cloudflare', 'cf-ray': 'test', 'cf-mitigated': 'challenge' }); return res.end('<html>Sorry, you have been blocked · cloudflare · error code: 1020</html>'); }
    if (mode === 'broken' && (p === '/api/auth/me' || admin)) { res.writeHead(200, { 'content-type': 'application/json', server: 'Caddy' }); return res.end('{"leak":true}'); }
    if (admin || !allowed) {
      if (mode === 'bare') { res.writeHead(403); return res.end(); }                                   // Server başlığı yok, boş gövde
      if (mode === 'behind') { res.writeHead(403, { server: 'cloudflare', 'cf-ray': 'test' }); return res.end(); } // sağlayıcı arkasında Caddy: boş gövde, imza yok
      if (mode === 'app403') { res.writeHead(403, { 'content-type': 'application/json', server: 'Caddy' }); return res.end('{"statusCode":403,"message":"Forbidden"}'); } // uygulama ForbiddenException taklidi (dolu gövde, imza yok)
      res.writeHead(403, { server: 'Caddy' }); return res.end();                                        // Caddy `respond 403` (Caddy Server başlığı yazar)
    }
    if (p.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json', server: 'Caddy' }); return res.end('{"message":"Unauthorized"}'); }
    res.writeHead(200, { 'content-type': 'text/html', server: 'Caddy' }); res.end('<!doctype html><title>portal</title>');
  });
}
const rows = []; const check = (id, d, ok, obs) => rows.push({ id, ok, d, obs });
function run(args, env) { return new Promise((res) => { const c = spawn(process.execPath, [PROBE, ...args], { env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (x) => { l += x; }); c.stderr.on('data', (x) => { l += x; }); c.on('close', (code) => res({ code, log: l })); }); }
function getSeen(origin, cert) { return new Promise((res, rej) => { const r = https.request(origin + '/__seen', { method: 'GET', ca: fs.readFileSync(cert) }, (x) => { let b = ''; x.on('data', (c) => { b += c; }); x.on('end', () => res(JSON.parse(b))); }); r.on('error', rej); r.end(); }); }
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd8-selftest-')); const cert = path.join(dir, 'cert.pem'); const key = path.join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const srv = https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, edge); await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  const ORIGIN = `https://localhost:${PORT}`; const env = { NODE_EXTRA_CA_CERTS: cert }; const ev = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
  const src = fs.readFileSync(PROBE, 'utf8');
  try {
    mode = 'ok'; seen = []; let r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's1.json')], env); let e = ev('s1.json');
    const s1seen = await getSeen(ORIGIN, cert);
    check('S1', 'sağlıklı kenar (Server: Caddy): çıkış 0; tüm retler 403 katman caddy; pozitifler beklendiği gibi; kanıtta başlık DEĞERİ yok (yalnız ad/varlık)', r.code === 0 && e.exitCode === 0 && e.findings.length === 0 && e.rows.filter((x) => x.group === 'deny').every((x) => x.status === 403 && x.layer === 'caddy' && x.hints && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'Caddy' && x.hints.providerSignature === false) && e.rows.filter((x) => x.group === 'allow').every((x) => x.ok) && !/"cf-ray"|test"/.test(JSON.stringify(e.rows.map((x) => x.hints))), `çıkış=${r.code} · katman=${JSON.stringify(e.denyLayers)}`);
    // S1-p: sondanın gönderdiği HAM yol == kenarın gördüğü yol (her satır, aynı sıra, yöntem dahil); vektör listesi kaynaktan DA okunur (kanıt satırıyla da eşleşmeli)
    const vecRx = /^\s*\['[^']*',\s*'(GET|POST|PUT|PATCH|DELETE)',\s*'([^']*)'/gm; const listSrc = src.slice(src.indexOf('const DENY = ['), src.indexOf('];', src.indexOf('const ALLOW = ['))); const vectors = []; let m; while ((m = vecRx.exec(listSrc))) vectors.push({ method: m[1], url: m[2] });
    const rowPaths = e.rows.map((x) => ({ method: x.method, url: x.path }));
    const same = (a, b) => a.length === b.length && a.every((x, i) => x.method === b[i].method && x.url === b[i].url);
    const raw = ['/api/portal/./admin/documents/pending', '/api/portal%2Fadmin/documents/pending', '/api/portal/admin/documents/pending?x=1', '/api/portal/ADMIN/documents/pending'];
    check('S1-p', `HAM YOL korunur: kaynak vektör (${vectors.length}) == kanıt satırı (${rowPaths.length}) == kenarın gördüğü req.url (${s1seen.length}); './', '%2F', '?x=1', büyük harf birebir`, vectors.length === e.deny + e.allow && same(vectors, rowPaths) && same(rowPaths, s1seen) && raw.every((p) => s1seen.some((s) => s.url === p)), `kenar gördü=${s1seen.length} · kaynak=${vectors.length} · ham örnek=${raw.filter((p) => s1seen.some((s) => s.url === p)).length}/4`);
    // S1-c: kimlik/gövde ÖLÇÜMÜ — kenarın gördüğü (bağımsız) ile sondanın `measured` alanı (istek döngüsünden türetilen) uyumlu; `design` ayrı beyan
    const credSeen = s1seen.filter((s) => s.cred).length; const badBody = s1seen.filter((s) => !((s.bodyLen === 0 && /^(GET|DELETE)$/.test(s.method)) || (s.bodyLen === 2 && /^(POST|PUT|PATCH)$/.test(s.method)))).length;
    const M = e.measured || {}; const nWrite = s1seen.filter((s) => /^(POST|PUT|PATCH)$/.test(s.method)).length; const nNoBody = s1seen.filter((s) => /^(GET|DELETE)$/.test(s.method)).length;
    // Not: Node istemcisi DELETE gövdesini çerçevesiz gönderir (chunked değil) → kenar bodyLen=0 görür ama sunucu 400 verir (S1 düşer);
    // bu yüzden sondanın kendi `measured.bodies` dağılımı da yöntem sayılarıyla eşlenir (DELETE gövdesiz = 'empty' sayısı GET+DELETE).
    check('S1-c', 'KİMLİK/GÖVDE ölçümü: kenar hiçbir istekte kimlik başlığı görmedi; gövde 0 (GET/DELETE) veya 2 (POST/PUT/PATCH "{}"); kanıt measured {credentialHeaderRequests=0, nonEmptyBodyRequests=0, requestCount=deny+allow, bodies.emptyJson=POST+PUT+PATCH sayısı, bodies.empty=GET+DELETE sayısı}; design beyanı AYRI alanda (credentialsSent/writesAttempted=false); her satırda sent.headerNames/body', credSeen === 0 && badBody === 0 && s1seen.length === e.deny + e.allow && M.credentialHeaderRequests === 0 && M.nonEmptyBodyRequests === 0 && M.requestCount === e.deny + e.allow && !M.bodies.other && M.bodies.emptyJson === nWrite && M.bodies.empty === nNoBody && (M.bodies.empty + M.bodies.emptyJson) === M.requestCount && e.design && e.design.credentialsSent === false && e.design.writesAttempted === false && e.credentialsSent === undefined && e.rows.every((x) => x.sent && Array.isArray(x.sent.headerNames) && (x.sent.body === '' || x.sent.body === '{}')), `kenar: kimlik=${credSeen} · gövde-uyumsuz=${badBody} · POST/PUT/PATCH=${nWrite} · GET/DELETE=${nNoBody} · sonda measured=${JSON.stringify(M)}`);
    mode = 'broken'; seen = []; r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's2.json')], env); e = ev('s2.json');
    const variantsStill403 = e.rows.filter((x) => x.group === 'deny' && /portal\/ADMIN|\.\/admin|%2Fadmin/.test(x.path));
    check('S2', 'bozuk kenar (personel oturumu + DÜZ admin yolları geçiyor): çıkış 2; bulgu = /api/auth/me + 6 düz admin yolu (=7); kodlama varyantları (ADMIN, ./, %2F) 403 kalır; ifPassed bulgu satırlarında dolu', r.code === 2 && e.findings.length === 7 && e.findings.some((f) => /GET \/api\/auth\/me → HTTP 200/.test(f)) && e.findings.filter((f) => /portal\/admin/.test(f)).length === 6 && variantsStill403.length === 3 && variantsStill403.every((x) => x.status === 403 && x.ok) && e.rows.filter((x) => x.group === 'deny' && !x.ok).every((x) => typeof x.ifPassed === 'string' && x.ifPassed.length > 10), `çıkış=${r.code} · bulgu=${e.findings.length} · varyant 403=${variantsStill403.filter((x) => x.status === 403).length}/3`);
    mode = 'waf'; seen = []; r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's3.json')], env); e = ev('s3.json');
    check('S3', 'sağlayıcı reddi taklidi (imza + Server: cloudflare): çıkış 0; katman edge-provider; hints providerSignature/edgeHeaderPresent/cfMitigatedPresent true, serverHeaderValue=cloudflare', r.code === 0 && e.denyLayers['edge-provider'] === e.deny && !e.denyLayers.caddy && !e.denyLayers.unknown && e.rows.filter((x) => x.group === 'deny').every((x) => x.hints.providerSignature && x.hints.edgeHeaderPresent && x.hints.cfMitigatedPresent && x.hints.serverHeaderValue === 'cloudflare' && x.hints.bodyEmpty === false), `katman=${JSON.stringify(e.denyLayers)}`);
    mode = 'bare'; seen = []; r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's3b.json')], env); e = ev('s3b.json');
    check('S3-b', 'boş 403 gövdesi, Server başlığı YOK: çıkış 0; katman unknown (boş gövde tek başına caddy DEMEZ); hints.bodyEmpty=true, serverHeaderValue=""', r.code === 0 && e.denyLayers.unknown === e.deny && !e.denyLayers.caddy && e.rows.filter((x) => x.group === 'deny').every((x) => x.hints.bodyEmpty === true && x.hints.serverHeaderValue === '' && x.hints.providerSignature === false), `katman=${JSON.stringify(e.denyLayers)}`);
    mode = 'behind'; seen = []; r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's3c.json')], env); e = ev('s3c.json');
    check('S3-c', 'boş 403 gövdesi, Server: cloudflare, imza YOK (sağlayıcı arkasındaki Caddy): çıkış 0; katman unknown; serverHeaderValue=cloudflare, edgeHeaderPresent=true', r.code === 0 && e.denyLayers.unknown === e.deny && !e.denyLayers.caddy && !e.denyLayers['edge-provider'] && e.rows.filter((x) => x.group === 'deny').every((x) => x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'cloudflare' && x.hints.edgeHeaderPresent === true && x.hints.cfMitigatedPresent === false), `katman=${JSON.stringify(e.denyLayers)}`);
    mode = 'app403'; seen = []; r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's3d.json')], env); e = ev('s3d.json');
    const s1ev = ev('s1.json');
    check('S3-d', 'DOLU JSON gövdeli 403 + Server: Caddy (uygulama ForbiddenException taklidi): çıkış 0 (PASS düşmez) ama suspectAppOrigin403 = ret sayısı, katman caddy, hints.bodyEmpty=false; sağlıklı kenarda (S1) sayaç 0', r.code === 0 && e.suspectAppOrigin403 === e.deny && e.denyLayers.caddy === e.deny && e.rows.filter((x) => x.group === 'deny').every((x) => x.hints.bodyEmpty === false && x.hints.providerSignature === false) && s1ev.suspectAppOrigin403 === 0, `çıkış=${r.code} · şüphe=${e.suspectAppOrigin403}/${e.deny} · S1 şüphe=${s1ev.suspectAppOrigin403}`);
    await new Promise((x) => srv.close(x));
    r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's4.json')], Object.assign({ D8_HTTP_TIMEOUT_MS: '1500' }, env)); e = ev('s4.json');
    check('S4', 'kenar kapalı: çıkış 3 (ölçülemeyen), kanıt yazıldı, bulgu yok', r.code === 3 && e.unmeasured === e.deny + e.allow && e.findings.length === 0, `çıkış=${r.code} · ölçülemeyen=${e.unmeasured}`);
    r = await run(['--origin', 'http://localhost:1', '--out', path.join(dir, 's5.json')], env); check('S5-a', 'http origin → 4', r.code === 4, `çıkış=${r.code}`);
    r = await run(['--origin', ORIGIN, '--out', path.join(dir, 's5.json')], Object.assign({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, env)); check('S5-b', 'TLS doğrulaması kapalı → 4', r.code === 4, `çıkış=${r.code}`);
    r = await run(['--origin', ORIGIN, '--out', path.join(dir, 'yok', 'x.json')], Object.assign({ D8_HTTP_TIMEOUT_MS: '1500' }, env)); check('S5-c', 'kanıt yazılamaz → 7', r.code === 7, `çıkış=${r.code}`);
    r = await run(['--origin', ORIGIN, '--phone-list'], env); check('S6', '--phone-list: 5 adres, telefon talimatı, ölçüm yok', r.code === 0 && (r.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /beyan/i.test(r.log), 'liste');
    const allowBlock = src.slice(src.indexOf('const ALLOW = ['), src.indexOf('];', src.indexOf('const ALLOW = [')));
    check('T-1', 'sonda pozitif listesinde giriş/forgot-password/intake POST/belge yükleme YOK (yalnız token olmadan guard pozitifleri)', !/api\/portal\/login'|api\/portal\/forgot-password'|public\/intake|documents\/upload/.test(allowBlock) && !allowBlock.split('\n').some((l) => /'POST'/.test(l) && !/token yok/.test(l)), 'statik');
    const denyBlock = src.slice(src.indexOf('const DENY = ['), src.indexOf('];', src.indexOf('const DENY = [')));
    const denyLines = denyBlock.split('\n').filter((l) => /^\s*\['/.test(l));
    const s1 = ev('s1.json');
    const srcNoDesign = src.replace(/design:\s*\{[^}]*\}/, ''); // tasarım beyanı bloğu dışında sabit literal olmamalı
    check('T-2', 'statik: https.request seçenek nesnesiyle (URL string DEĞİL); her ret vektöründe ifPassed (FX.*) var; boş gövdeli yazma yöntemleri adında "boş gövde"; kimlik/yazma bayrakları kanıtta yalnız design{} (beyan) + measured{} (türetilmiş) — kanıt kökünde sabit literal YOK; layerOf boş gövdeye bakmaz', /https\.request\(\{\s*host:\s*HOST,\s*port:\s*PORT,\s*path,\s*method,\s*servername:\s*HOST/.test(src) && !/https\.request\(ORIGIN/.test(src) && denyLines.length === s1.deny && denyLines.every((l) => /FX\.\w+\]/.test(l)) && denyLines.filter((l) => /'(POST|PUT|PATCH)'/.test(l)).every((l) => /boş gövde/.test(l)) && !/credentialsSent:\s*(true|false)|writesAttempted:\s*(true|false)/.test(srcNoDesign) && s1.credentialsSent === undefined && s1.writesAttempted === undefined && typeof s1.measured === 'object' && /credentialHeaderRequests:\s*rows\.filter/.test(src) && !/bodyEmpty[^\n]*return 'caddy'|body\.trim\(\) === ''\) return 'caddy'/.test(src), `ret satırı=${denyLines.length}`);
  } catch (e) { console.log('OLCULEMEDI: ' + String(e && e.stack || e).slice(0, 400)); process.exit(2); }
  for (const x of rows) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.d}\n        ${x.obs}`);
  const fail = rows.filter((x) => !x.ok).length; console.log(`\nD-8 SONDA ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}  (kanıt: ${dir})`); process.exit(fail ? 1 : 0);
})();
