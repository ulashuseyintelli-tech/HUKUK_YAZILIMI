'use strict';
/*
 * EXTACC D-7 R01 ÖZ-TESTİ — CANLI DB'YE YAZMAZ, E-POSTA GÖNDERMEZ. Disposable PostgreSQL (127.0.0.1:5449/d67_test) + sahte portal
 * API (d7-fake-portal-api.js; 8200) + gerçek TLS'li sahte dış sunucu (8459). "Telefon" bir istemci taklididir: giriş bilgisini
 * koşucunun gösterimsiz test dosyasından (D7_TEST_DISPLAY_SINK; yalnız disposable DB'de) alır, dış uçtan giriş yapar, mesaj
 * sayfasını/listesini açar, mark-read çağırır (web sayfası gibi), bir mesaj gönderir ve 2. personel yanıtını bekler.
 *
 * KULLANIM: node d7-selftest.js   (D7T_DB_URL ya da %TEMP%\d67-test-pg.url → 127.0.0.1:5449/d67_test ŞART)
 *           D7T_LIB_ROOT = bağımlılıkları kurulu, canlı OLMAYAN bir checkout'un proje kökü (Prisma istemcisi + bcrypt buradan yüklenir).
 *           Verilmezse bu betiğin bulunduğu checkout'un proje kökü denenir. Canlı yayın ağacı REDDEDİLİR; modül yoksa test başlamaz (çıkış 2).
 * ÇIKIŞ   : 0 hepsi PASS · 1 FAIL var · 2 ölçülemedi
 * SINIR   : sahte API ürünün kendisi değildir; ürünün gerçek mesaj/bildirim/guard davranışı canlı koşumda ölçülür.
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');

const HERE = __dirname; const GOV = path.resolve(HERE, '..', '..');
const RUN = path.join(HERE, process.env.D7_T_RUN_OVERRIDE ? path.basename(process.env.D7_T_RUN_OVERRIDE) : 'd7-portal-messages-live-run.js');
const FAKE = path.join(HERE, 'd7-fake-portal-api.js');
const WRAPPER = path.join(HERE, 'd7-owner-live-block.ps1');
// KÜTÜPHANE KÖKÜ (Prisma istemcisi + bcrypt): canlı yayın ağacı VARSAYILMAZ. D7T_LIB_ROOT verilirse o; verilmezse bu betiğin bulunduğu
// checkout'un proje kökü (betik konumundan göreli). Kök canlı yayın ağacının altındaysa test KOŞMAZ — ret, kökte hiçbir dosya yoklanmadan /
// yüklenmeden ÖNCE, yalnız yol karşılaştırmasıyla yapılır; kök bağlantı (junction/symlink) üzerinden canlı ağaca çözülüyorsa da KOŞMAZ.
// Modül bulunamazsa açık hatayla DURUR; sessizce canlı ağaca DÜŞMEZ. Canlı ağaç yolu burada literal DEĞİLDİR: owner bloğunun `$Rel` sabitinden
// okunur (blok yalnız METİN olarak okunur, çalıştırılmaz); okunamazsa ret denetimi yapılamayacağı için test başlamaz.
const maskUser = (s) => { const u = process.env.USERNAME || ''; const t = String(s).replace(/([\\/]Users[\\/])[^\\/]+/gi, '$1<kullanici>'); return u.length >= 3 ? t.replace(new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<kullanici>') : t; };
const libStop = (msg) => { console.log(`OLCULEMEDI: ${msg} — test BAŞLAMADI`); process.exit(2); };
const LIVE_TREE = (() => {
  let m = null; try { m = fs.readFileSync(WRAPPER, 'utf8').match(/^\$Rel\s*=\s*'([A-Za-z]:\\[^'\r\n]+)'/m); } catch (e) { m = null; }
  if (!m) return null; const p = path.resolve(m[1]); return path.basename(p).toLowerCase() === 'project' ? path.dirname(p) : p;
})();
const underLive = (p) => (path.resolve(p).toLowerCase() + path.sep).startsWith(LIVE_TREE.toLowerCase() + path.sep);
const realOf = (p) => { try { return fs.realpathSync.native(p); } catch (e) { return null; } };
const LIB_SRC = process.env.D7T_LIB_ROOT ? 'D7T_LIB_ROOT' : 'betik konumu: checkout proje kökü';
const REL = path.resolve(process.env.D7T_LIB_ROOT || path.join(HERE, '..', '..', '..', '..'));
const PRISMA_ROOT = path.join(REL, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '@prisma', 'client');
const BCRYPT = path.join(REL, 'node_modules', '.pnpm', 'bcrypt@5.1.1', 'node_modules', 'bcrypt');
const LIB_HINT = 'D7T_LIB_ROOT ile bağımlılıkları kurulu, canlı OLMAYAN bir checkout proje kökü verin';
if (!LIVE_TREE) libStop('canlı yayın ağacı yolu owner bloğundan ($Rel) okunamadı; kütüphane kökü ret denetimi yapılamıyor');
if (underLive(REL)) libStop(`kütüphane kökü canlı yayın ağacının altında: ${maskUser(REL)} (${LIB_SRC}) — izole test canlı ağaçtan modül YÜKLEMEZ (kökte hiçbir dosya yoklanmadı/yüklenmedi); ${LIB_HINT}`);
if (!fs.existsSync(REL)) libStop(`kütüphane kökü yok: ${maskUser(REL)} (${LIB_SRC}); ${LIB_HINT} (canlı yayın ağacına DÜŞÜLMEZ)`);
const libMissing = [['@prisma/client', PRISMA_ROOT], ['bcrypt', BCRYPT]].filter(([, p]) => !fs.existsSync(path.join(p, 'package.json'))).map(([n]) => n);
if (libMissing.length) libStop(`kütüphane kökünde modül bulunamadı: ${libMissing.join(', ')} · kök=${maskUser(REL)} (${LIB_SRC}); ${LIB_HINT} (canlı yayın ağacına DÜŞÜLMEZ)`);
if ([REL, PRISMA_ROOT, BCRYPT].map(realOf).some((p) => !p || underLive(p))) libStop(`kütüphane kökü bağlantı üzerinden canlı yayın ağacına çözülüyor ya da gerçek yolu okunamadı: ${maskUser(REL)} (${LIB_SRC}) — modül YÜKLENMEDİ; ${LIB_HINT}`);
console.log(`kütüphane kökü: ${maskUser(REL)} (kaynak: ${LIB_SRC}; canlı yayın ağacı DEĞİL; Prisma istemcisi + bcrypt buradan yüklenir)`);
const API_PORT = 8200; const EXT_PORT = 8459;
const API = `http://127.0.0.1:${API_PORT}/api`; const EXT = `https://localhost:${EXT_PORT}`;
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36';
const R27_CAND_DIST = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'; // canlı ön koşul: R27 dist (D-5 ile aynı)
const DB_EXPECT = { host: '127.0.0.1', port: '5449', name: 'd67_test' };

const rows = []; const check = (id, desc, ok, obs) => rows.push({ id, sonuc: ok ? 'PASS' : 'FAIL', aciklama: desc, gozlem: obs });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const hex8 = () => crypto.randomBytes(4).toString('hex');

function dbUrl() {
  const f = path.join(os.tmpdir(), 'd67-test-pg.url');
  const u = process.env.D7T_DB_URL || (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '');
  let p; try { p = new URL(u); } catch (e) { return null; }
  return (p.hostname === DB_EXPECT.host && p.port === DB_EXPECT.port && p.pathname === `/${DB_EXPECT.name}`) ? u : null;
}
async function ctl(method, p, body) {
  const r = await fetch(`http://127.0.0.1:${API_PORT}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
let DBURL; let certFile; let prisma; const artifacts = []; const secretsSeen = new Set(); const sinks = new Set();

function httpsReq(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = require('https').request(url, { method, headers, ca: fs.readFileSync(certFile), timeout: 10000 }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { j = null; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('zaman aşımı'))); req.on('error', reject);
    if (body) req.write(body); req.end();
  });
}
const H = { 'user-agent': PHONE_UA, 'content-type': 'application/json' };
async function waitSinkCreds(sink, ms) {
  const t0 = Date.now();
  for (;;) {
    if (fs.existsSync(sink)) { const t = fs.readFileSync(sink, 'utf8'); const e = t.match(/E-posta : (\S+)/); const p = t.match(/Parola  : (D7p![A-Za-z0-9_-]+)/); if (e && p) return { email: e[1], password: p[1] }; }
    if (Date.now() - t0 > ms) return null; await sleep(200);
  }
}
/** Telefon taklidi: sayfa → giriş → liste → mark-read (web sayfası gibi) → (ops.) mesaj gönder → 2. personel yanıtını bekle. */
async function phoneFlow(runId, sink, opts = {}) {
  const out = {}; const creds = await waitSinkCreds(sink, 12000); out.creds = !!creds; if (!creds) return out;
  out.page = (await httpsReq('GET', `${EXT}/portal/messages`, H)).status;
  const login = await httpsReq('POST', `${EXT}/api/portal/login`, H, JSON.stringify({ email: creds.email, password: creds.password }));
  out.login = login.status; out.token = login.body && login.body.token; if (!out.token) return out;
  const A = Object.assign({ authorization: `Bearer ${out.token}` }, H);
  const l = await httpsReq('GET', `${EXT}/api/portal/messages`, A); out.list = l.status; out.count = Array.isArray(l.body) ? l.body.length : null;
  const want = [`D7-${runId}`, `D7-${runId}-CASE`, `D7-${runId}-OFFICE-1`];
  out.sawThree = Array.isArray(l.body) && want.every((c) => l.body.some((m) => m && m.content === c));
  out.markRead = (await httpsReq('POST', `${EXT}/api/portal/messages/mark-read`, A, '{}')).status;
  if (!opts.noSend) { const content = 'PHONE-' + crypto.randomBytes(8).toString('hex'); secretsSeen.add(content); out.sent = (await httpsReq('POST', `${EXT}/api/portal/messages`, A, JSON.stringify({ content }))).status; }
  const t0 = Date.now(); out.sawOffice2 = false;
  while (Date.now() - t0 < 12000) { const r = await httpsReq('GET', `${EXT}/api/portal/messages`, A); if (Array.isArray(r.body) && r.body.some((m) => m && m.content === `D7-${runId}-OFFICE-2`)) { out.sawOffice2 = true; break; } await sleep(300); }
  if (out.sawOffice2) { const u = await httpsReq('GET', `${EXT}/api/portal/messages/unread-count`, A); out.unreadAfterOffice2 = u.body && u.body.count; }
  return out;
}

function runScenario(name, dir, sc, over, hooks = {}) {
  return new Promise(async (resolve) => {
    await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
    const runId = (over && over.D7_RUNID) || hex8(); const pw = 'D7T!' + crypto.randomBytes(12).toString('base64url');
    const go = `OWNER-GO-CLIENT-EXTACC-D7-20000101-R${String(10 + Math.floor(Math.random() * 89))}`;
    const receipt = path.join(dir, `${name}-receipt.json`); const evid = path.join(dir, `${name}-evidence.json`); const sink = path.join(dir, `${name}-display.sink`); sinks.add(sink);
    const env = Object.assign({}, process.env, {
      AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      D7_MODE: 'run', D7_LIVE_CONFIRM: '1', D7_LIVE_GO_REF: go, D7_RUNID: runId, D7_EXPECT_DB: DB_EXPECT.name,
      D7_EXPECT_TENANT_SLUG: `ah-${runId}`, D7_API_BASE: API, D7_EXPECT_API: API, D7_EXPECT_BASE_URL: EXT,
      D7_LIVE_LOGIN_PW: pw, D7_RECEIPT: receipt, D7_EVID_FILE: evid, D7_DISPLAY: 'none', D7_TEST_DISPLAY_SINK: sink,
      D7_WAIT_MS: '15000', D7_POLL_MS: '300', D7_VIEW_MS: '1500', D7_HTTP_TIMEOUT_MS: '5000', D7_CALL_TIMEOUT_MS: '5000', D7_LATE_CREATE_MS: '6000',
    }, over || {});
    for (const k of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']) if (!(over && k in over)) delete env[k];
    [pw, go, DBURL].forEach((s) => secretsSeen.add(s));
    const ch = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; let fired = false; const phoneRes = []; let hookDone = Promise.resolve();
    const onData = (c) => {
      log += c;
      if (!fired && /OK\s+P7-DISP/.test(log) && hooks.onDisplay) { fired = true; hookDone = hooks.onDisplay(runId, sink).then((r) => phoneRes.push(r), (e) => phoneRes.push({ error: String(e.message || e) })); }
    };
    ch.stdout.on('data', onData); ch.stderr.on('data', onData);
    ch.on('close', async (code) => {
      await hookDone;
      fs.writeFileSync(path.join(dir, `${name}.log`), log, 'utf8'); artifacts.push(path.join(dir, `${name}.log`), receipt, evid);
      const sec = await ctl('GET', '/__secrets'); Object.values(sec).flat().forEach((s) => secretsSeen.add(s));
      const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
      const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
      const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
      const tenant = await prisma.tenant.findFirst({ where: { slug: `ah-${runId}` }, select: { id: true } });
      const rc = fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt, 'utf8')) : null;
      const pu = rc ? await prisma.clientPortalUser.findUnique({ where: { clientId: rc.clientId }, select: { isActive: true, tokenVersion: true, loginCount: true } }) : null;
      const cl = rc ? await prisma.client.findUnique({ where: { id: rc.clientId }, select: { hasPortalAccess: true } }) : null;
      const msgs = rc ? await prisma.portalMessage.findMany({ where: { clientId: rc.clientId }, select: { senderType: true, isRead: true, caseId: true, content: true } }) : [];
      const notes = rc ? await prisma.portalNotification.count({ where: { clientId: rc.clientId } }) : 0;
      const activeUsers = tenant ? await prisma.user.count({ where: { tenantId: tenant.id, isActive: true } }) : null;
      const activeCases = tenant ? await prisma.case.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }) : null;
      resolve({ runId, code, log, ev, v, o, tenant, receipt, rc, pu, cl, msgs, notes, activeUsers, activeCases, phone: phoneRes, calls: await ctl('GET', '/__calls'), ext: await ctl('GET', '/__ext') });
    });
  });
}
async function recover(prev, dir, name, sc, envOver) {
  await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
  const pw = 'D7R!' + crypto.randomBytes(12).toString('base64url'); const evid = path.join(dir, `${name}-evidence.json`); secretsSeen.add(pw);
  const env = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
    D7_MODE: 'recover', D7_RECOVER_CONFIRM: '1', D7_RUNID: prev.runId, D7_EXPECT_DB: DB_EXPECT.name, D7_API_BASE: API, D7_EXPECT_API: API,
    D7_EXPECT_BASE_URL: EXT, D7_LIVE_LOGIN_PW: pw, D7_RECEIPT: prev.receipt, D7_EVID_FILE: evid, D7_DISPLAY: 'none', D7_HTTP_TIMEOUT_MS: '5000', D7_CALL_TIMEOUT_MS: '5000',
    D7_POLL_MS: '300', D7_LATE_CREATE_MS: '6000' }, envOver || {});
  const code = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => { fs.writeFileSync(path.join(dir, `${name}.log`), l, 'utf8'); res(x); }); });
  artifacts.push(path.join(dir, `${name}.log`), evid);
  const pu = await prisma.clientPortalUser.findUnique({ where: { clientId: prev.rc.clientId }, select: { isActive: true, tokenVersion: true } });
  const cl = await prisma.client.findUnique({ where: { id: prev.rc.clientId }, select: { hasPortalAccess: true } });
  const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
  const sec = await ctl('GET', '/__secrets'); Object.values(sec).flat().forEach((x) => secretsSeen.add(x));
  const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
  const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
  const msgs = await prisma.portalMessage.count({ where: { clientId: prev.rc.clientId } });
  return { code, pu, cl, ev, v, o, msgs, calls: await ctl('GET', '/__calls'), activeUsers: await prisma.user.count({ where: { tenantId: prev.tenant.id, isActive: true } }) };
}
const FLOW = ['P7-00', 'P7-01', 'P7-02', 'P7-03L', 'P7-04D', 'D7-1', 'D7-2', 'D7-4N', 'D7-4S', 'D7-4U', 'D7-4P', 'D7-3', 'D7-3N', 'D7-3U', 'D7-3G', 'D7-3F', 'P7-DISP', 'P7-WAIT', 'D7-3B'];
const CLOSE = ['P7-C1', 'P7-C2', 'P7-C2V', 'P7-C3L', 'P7-C3D', 'P7-C4L', 'P7-C4D', 'P7-C5', 'U-CLOSE', 'P7-MSG-KEPT', 'P7-D9'];
const closedAll = (z) => CLOSE.every((id) => z.v(id) === 'PASS');
const adminExt = (z) => z.ext.filter((c) => /\/api\/portal\/admin/.test(c.path)).length;
const fullPhone = (runId, sink) => phoneFlow(runId, sink);

(async () => {
  DBURL = dbUrl();
  if (!DBURL) { console.log(`OLCULEMEDI: disposable DB (${DB_EXPECT.host}:${DB_EXPECT.port}/${DB_EXPECT.name}) yok — test BAŞLAMADI`); process.exit(2); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd7-selftest-'));
  certFile = path.join(dir, 'cert.pem'); const keyFile = path.join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const { PrismaClient } = require(PRISMA_ROOT); prisma = new PrismaClient({ datasources: { db: { url: DBURL } } });
  const fake = spawn(process.execPath, [FAKE], { env: Object.assign({}, process.env, { D7F_DB_URL: DBURL, D7F_PRISMA_ROOT: PRISMA_ROOT, D7F_BCRYPT: BCRYPT,
    D7F_API_PORT: String(API_PORT), D7F_EXT_PORT: String(EXT_PORT), D7F_CERT: certFile, D7F_KEY: keyFile }), stdio: ['ignore', 'pipe', 'pipe'] });
  let fl = ''; fake.stdout.on('data', (c) => { fl += c; }); fake.stderr.on('data', (c) => { fl += c; });
  for (let i = 0; i < 60 && !fl.includes('hazır'); i++) await sleep(250);
  if (!fl.includes('hazır')) { console.log('OLCULEMEDI: sahte API başlamadı'); fake.kill(); process.exit(2); }
  try {
    // ---- Z1 NORMAL: mesaj akışı + telefon (giriş, liste, mark-read, mesaj gönderimi, 2. yanıt) + kapanış + kalıntı
    const z1 = await runScenario('z1-normal', dir, {}, {}, { onDisplay: fullPhone });
    const all = [...FLOW, ...CLOSE, 'U-ISO'];
    check('Z1-a', 'normal akış: çıkış 0; D-7 + kapanış ölçütlerinin tamamı PASS', z1.code === 0 && all.every((id) => z1.v(id) === 'PASS'), `çıkış=${z1.code} · PASS olmayan=${all.filter((id) => z1.v(id) !== 'PASS').join(',') || 'yok'}`);
    const ph = z1.phone[0] || {};
    check('Z1-b', 'telefon: mesaj sayfası 200, giriş 201, liste 200 ve bu koşumun 3 mesajı görüldü, mark-read 2xx, mesaj gönderimi 201, 2. personel yanıtı listede görüldü',
      ph.page === 200 && ph.login === 201 && ph.list === 200 && ph.sawThree === true && ph.markRead >= 200 && ph.markRead < 300 && ph.sent === 201 && ph.sawOffice2 === true,
      `sayfa=${ph.page} giriş=${ph.login} liste=${ph.list}/${ph.count} üç=${ph.sawThree} mark=${ph.markRead} gönder=${ph.sent} yanıt2=${ph.sawOffice2} unread2=${ph.unreadAfterOffice2}`);
    const res = z1.ev && z1.ev.messageResidue;
    check('Z1-c', 'kalıntı: DB\'de 5 mesaj (koşucu 4: müvekkil ×2, personel ×2 · telefon 1) + 2 bildirim; kanıt "saklandı … SİLİNMEDİ" der, silindi DEMEZ; deleted=false',
      z1.msgs.length === 5 && z1.msgs.filter((m) => m.senderType === 'OFFICE').length === 2 && z1.notes === 2 && !!res && res.portalMessages === 5 && res.runnerWritten === 4 && res.phoneSent === 1 && res.portalNotifications === 2 && res.deleted === false
        && /saklandı: 5 mesaj/.test(z1.o('P7-MSG-KEPT')) && /SİLİNMEDİ/.test(z1.o('P7-MSG-KEPT')) && !/silindi/i.test(z1.o('P7-MSG-KEPT')),
      `mesaj=${z1.msgs.length} bildirim=${z1.notes} · kalıntı=${JSON.stringify(res)}`);
    check('Z1-d', 'koşucu: yasak uç 0; admin uçları YALNIZ yerel (dış sunucuda admin çağrısı 0; externalAdminCalled=false); personel POST ×3 (yanıt 1, yabancı, yanıt 2) + GET ×1 yerel; disable-user çağrıldı',
      !z1.calls.some((c) => c.forbidden) && z1.ev.forbiddenEndpointCalled === false && z1.ev.externalAdminCalled === false && adminExt(z1) === 0
        && z1.calls.filter((c) => c.method === 'POST' && /^\/api\/portal\/admin\/messages\//.test(c.path)).length === 3 && z1.calls.filter((c) => c.method === 'GET' && /^\/api\/portal\/admin\/messages\/[^/]+$/.test(c.path) && !/clients$/.test(c.path)).length === 1
        && z1.calls.some((c) => c.path === '/api/portal/admin/disable-user'), `yasak=${z1.calls.filter((c) => c.forbidden).length} dışAdmin=${adminExt(z1)}`);
    check('Z1-e', 'DB: portal pasif · sürüm ≥ 1 · erişim kapalı · personel pasif · dosya kapalı (aynı tenant 2. müvekkil dosyası dahil) · yabancı tenant müvekkilinde mesaj yok · yabancı/aynı-tenant-başka-müvekkil caseId satırı yok',
      !!z1.pu && z1.pu.isActive === false && z1.pu.tokenVersion >= 1 && z1.cl.hasPortalAccess === false && z1.activeUsers === 0 && z1.activeCases === 0
        && (await prisma.portalMessage.count({ where: { clientId: z1.rc.foreignClientId } })) === 0 && (await prisma.portalMessage.count({ where: { caseId: z1.rc.foreignCaseId } })) === 0
        && typeof z1.rc.sameTenantOtherCaseId === 'string' && (await prisma.portalMessage.count({ where: { caseId: z1.rc.sameTenantOtherCaseId } })) === 0,
      `portal=${JSON.stringify(z1.pu)} kullanıcı=${z1.activeUsers} dosya=${z1.activeCases}`);
    const after = ph.token ? await httpsReq('GET', `${EXT}/api/portal/messages`, { authorization: `Bearer ${ph.token}` }) : { status: null };
    check('Z1-f', 'kapanıştan sonra TELEFONUN oturumu mesaj ucunda dış 401; D7-4N gözlemi 400 + satır yok; telefon gözlemi (office2ReadByPhone) kanıtta yalnız boolean',
      after.status === 401 && /HTTP 400/.test(z1.o('D7-4N')) && /satırı=0/.test(z1.o('D7-4N')) && z1.ev.phoneObservation && typeof z1.ev.phoneObservation.office2ReadByPhone === 'boolean', `HTTP ${after.status} · D7-4N=${z1.o('D7-4N')} · tel=${JSON.stringify(z1.ev.phoneObservation)}`);
    // İnceleme düzeltmeleri: D7-3G gövde biçimi ürün sözleşmesi ({client,messages}) ve tüm koşum mesajları listede (3/3: müvekkil ×2 + personel 1);
    // D7-4S aynı tenant başka müvekkil dosyası 400 + satır yok; D7-3B DB satırı ölçütte; P7-MSG-KEPT gerçek sayım (yerinde=4/4); makbuzda runnerMessageIds (4).
    check('Z1-g', 'D7-3G gözlemi "gövde={client,messages} · listede=3/3"; D7-4S "HTTP 400 · satırı=0"; D7-3B "satır=true"; P7-MSG-KEPT "yerinde=4/4"; makbuz runnerMessageIds 4 id',
      /gövde=\{client,messages\} · listede=3\/3/.test(z1.o('D7-3G')) && z1.v('D7-4S') === 'PASS' && /HTTP 400 · başka müvekkil caseId satırı=0/.test(z1.o('D7-4S')) && /satır=true/.test(z1.o('D7-3B'))
        && /yerinde=4\/4 · saklandı: 5 mesaj \(koşucu 4 · telefon 1\)/.test(z1.o('P7-MSG-KEPT')) && Array.isArray(z1.rc.runnerMessageIds) && z1.rc.runnerMessageIds.length === 4,
      `3G=${z1.o('D7-3G')} · 4S=${z1.o('D7-4S')} · 3B=${z1.o('D7-3B')} · KEPT=${z1.o('P7-MSG-KEPT')} · ids=${(z1.rc.runnerMessageIds || []).length}`);

    // ---- Z2 KUSUR TAKLİDİ: liste başka müvekkilin mesajını da döndürüyor → D7-2 FAIL, çıkış 2; tuzak içerik kanıta girmez
    const z2 = await runScenario('z2-list-leak', dir, { list: 'leak' }, {});
    check('Z2', 'liste sızıntısı: D7-2 FAIL (yabancı≥1), gösterim YOK, kapanış PASS, çıkış 2', z2.code === 2 && z2.v('D7-2') === 'FAIL' && /yabancı=1/.test(z2.o('D7-2')) && z2.ev.displayed === false && closedAll(z2), `çıkış=${z2.code} · D7-2=${z2.o('D7-2')}`);

    // ---- Z3 KUSUR TAKLİDİ: kapsam dışı caseId kabul ediliyor → D7-4N/D7-4U FAIL (201 + satır), çıkış 2
    const z3 = await runScenario('z3-foreign-accept', dir, { send: 'foreignAccept' }, {}, { onDisplay: fullPhone });
    check('Z3', 'kapsam dışı caseId kabul: D7-4N, D7-4S ve D7-4U FAIL (HTTP 201, satır yazıldı), akış geri kalanı PASS (kabul edilen satırlar koşucunun sayılır; gösterim + telefon yapılır), çıkış 2; yabancı + aynı-tenant-başka-müvekkil caseId satırları DB\'de var; kalıntı 8 (koşucu 7 + telefon 1)',
      z3.code === 2 && z3.v('D7-4N') === 'FAIL' && /HTTP 201/.test(z3.o('D7-4N')) && z3.v('D7-4S') === 'FAIL' && /HTTP 201/.test(z3.o('D7-4S')) && z3.v('D7-4U') === 'FAIL' && z3.v('D7-1') === 'PASS' && z3.v('D7-3') === 'PASS' && z3.v('D7-3G') === 'PASS' && z3.v('P7-WAIT') === 'PASS' && closedAll(z3)
        && (await prisma.portalMessage.count({ where: { caseId: z3.rc.foreignCaseId } })) === 1 && (await prisma.portalMessage.count({ where: { caseId: z3.rc.sameTenantOtherCaseId } })) === 1
        && z3.ev.messageResidue.runnerWritten === 7 && z3.msgs.length === 8, `çıkış=${z3.code} · 4N=${z3.o('D7-4N')} · 4S=${z3.v('D7-4S')} · 4U=${z3.v('D7-4U')} · D7-3=${z3.v('D7-3')} · 3G=${z3.o('D7-3G')} · kalıntı=${z3.msgs.length}`);

    // ---- Z4 send 500 → 2/6 kuralı: kapanış PASS ise 2; kapanış doğrulanamazsa 6
    const z4a = await runScenario('z4a-send-500', dir, { send: 'fail' }, {});
    check('Z4-a', 'müvekkil mesajı 500: D7-1/D7-2 FAIL, gösterim YOK (kapı), telefon BEKLENMEDİ, kapanış PASS → çıkış 2',
      z4a.code === 2 && z4a.v('D7-1') === 'FAIL' && z4a.v('D7-2') === 'FAIL' && z4a.ev.displayed === false && z4a.v('P7-WAIT') === 'UNMEASURED' && closedAll(z4a), `çıkış=${z4a.code} · kapı=${(z4a.ev.displayGate || []).join(',')}`);
    const z4b = await runScenario('z4b-send-500-disable-fail', dir, { send: 'fail', disable: 'fail' }, {});
    check('Z4-b', 'müvekkil mesajı 500 + kapatma 500: portal kapanışı doğrulanamadı → çıkış 6 (2 değil), kurtarma notu', z4b.code === 6 && z4b.v('P7-C2') === 'FAIL' && z4b.ev.recovery.gerekli, `çıkış=${z4b.code}`);

    // ---- Z5 YARIM KALMA: kapatma 500 → 6; Recover (düzelmiş) → DB kapalı, C4 ÖLÇÜLEMEYEN → 3 (0 DEĞİL); kalıntı raporlanır
    const z5 = await runScenario('z5-half', dir, { disable: 'fail' }, {}, { onDisplay: fullPhone });
    check('Z5-a', 'kapatma 500: akış PASS ama P7-C2 FAIL, P7-D9 FAIL, çıkış 6, kurtarma notu; mesajlar yerinde (5)', z5.code === 6 && z5.v('D7-3B') === 'PASS' && z5.v('P7-C2') === 'FAIL' && z5.v('P7-D9') === 'FAIL' && z5.ev.recovery.gerekli && z5.msgs.length === 5, `çıkış=${z5.code}`);
    const r5 = await recover(z5, dir, 'z5-recover', {});
    check('Z5-b', 'Recover: disable çağrıldı, DB kapalı (pasif + erişim kapalı), yeni giriş 401, C4 ÖLÇÜLEMEYEN → çıkış 3 (0 değil); P7-MSG-KEPT makbuzdaki 4 koşucu id ile GERÇEK sayım PASS "yerinde=4/4 · saklandı: 5 mesaj (koşucu 4 · telefon 1)"; kabul ölçütleri koşulmadı',
      r5.code === 3 && r5.calls.some((c) => c.path === '/api/portal/admin/disable-user') && r5.pu.isActive === false && r5.cl.hasPortalAccess === false && r5.v('P7-C3L') === 'PASS' && r5.v('P7-C4L') === 'UNMEASURED'
        && r5.v('P7-MSG-KEPT') === 'PASS' && /yerinde=4\/4 · saklandı: 5 mesaj \(koşucu 4 · telefon 1\)/.test(r5.o('P7-MSG-KEPT')) && r5.v('D7-1') == null && r5.activeUsers === 0,
      `çıkış=${r5.code} · kalıntı=${r5.o('P7-MSG-KEPT')}`);

    // ---- Z6 KUSUR TAKLİDİ: mark-read okundu işaretlemiyor → D7-3U FAIL, gösterim yok, çıkış 2
    const z6 = await runScenario('z6-markread-noop', dir, { markRead: 'noop' }, {});
    check('Z6', 'mark-read etkisiz: D7-3U FAIL (unread 1 → 1, DB isRead=false), kapı → gösterim YOK, çıkış 2', z6.code === 2 && z6.v('D7-3U') === 'FAIL' && /unread 1 → mark-read HTTP 201 → unread 1/.test(z6.o('D7-3U')) && z6.ev.displayed === false, `çıkış=${z6.code} · 3U=${z6.o('D7-3U')}`);
    // ---- Z7 bildirim satırı üretilmiyor → D7-3N FAIL (kapı dışı: akış devam eder), çıkış 2
    const z7 = await runScenario('z7-no-notify', dir, { reply: 'noNotify' }, {}, { onDisplay: fullPhone });
    check('Z7', 'personel yanıtı bildirim üretmiyor: D7-3N FAIL (bildirim 0→0), gösterim yapıldı, telefon PASS, çıkış 2', z7.code === 2 && z7.v('D7-3N') === 'FAIL' && /bildirim 0→0/.test(z7.o('D7-3N')) && z7.v('P7-WAIT') === 'PASS' && z7.notes === 0, `çıkış=${z7.code} · 3N=${z7.o('D7-3N')}`);
    // ---- Z8 KUSUR TAKLİDİ: guard kapalı hesabın oturumunu geçiriyor → C4 200 → ÜRÜN BULGUSU, çıkış 6
    const z8 = await runScenario('z8-guard-stale', dir, { guard: 'stale' }, {}, { onDisplay: fullPhone });
    check('Z8', 'kapanış sonrası mevcut oturum mesaj ucunda 200: P7-C4L/C4D FAIL, productFinding, P7-D9 FAIL, çıkış 6', z8.code === 6 && z8.v('P7-C4L') === 'FAIL' && z8.v('P7-C4D') === 'FAIL' && /ÜRÜN BULGUSU/.test(z8.ev.productFinding || '') && z8.v('P7-D9') === 'FAIL', `çıkış=${z8.code} · bulgu=${z8.ev.productFinding}`);

    // ---- Z14 YANITSIZ ÇAĞRILAR: ÖLÇÜLEMEYEN, FAIL DEĞİL (inceleme düzeltmesi)
    // Z14-a personel yanıtı yanıtsız (zaman aşımı; satır yazılmaz) → D7-3/D7-3N/D7-3U/D7-3F ÖLÇÜLEMEYEN (bildirim 0→0 FAIL DEĞİL), gösterim yok, çıkış 3
    const z14a = await runScenario('z14a-reply-hang', dir, { reply: 'hang' }, { D7_CALL_TIMEOUT_MS: '1500', D7_HTTP_TIMEOUT_MS: '1500' }, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z14-a', 'personel yanıtı yanıtsız: D7-3, D7-3N (bildirim 0→0), D7-3U, D7-3F ÖLÇÜLEMEYEN (FAIL yok); D7-1/2/4N/4S/4U/4P/3G PASS; gösterim yok; kapanış PASS; çıkış 3',
      z14a.code === 3 && ['D7-3', 'D7-3N', 'D7-3U', 'D7-3F'].every((id) => z14a.v(id) === 'UNMEASURED') && /bildirim 0→0/.test(z14a.o('D7-3N')) && /personel yanıtı/.test(z14a.o('D7-3U'))
        && ['D7-1', 'D7-2', 'D7-4N', 'D7-4S', 'D7-4U', 'D7-4P', 'D7-3G'].every((id) => z14a.v(id) === 'PASS') && z14a.ev.fail === 0 && z14a.ev.displayed === false && z14a.phone.length === 0 && closedAll(z14a),
      `çıkış=${z14a.code} · 3N=${z14a.v('D7-3N')} · 3U=${z14a.v('D7-3U')} · FAIL=${z14a.ev.fail}`);
    // Z14-b unread-count yanıtsız → D7-3U ÖLÇÜLEMEYEN ("ilk unread-count"), D7-3/3N PASS, gösterim yok (kapı), çıkış 3
    const z14b = await runScenario('z14b-unread-hang', dir, { unread: 'hang' }, { D7_HTTP_TIMEOUT_MS: '1500' }, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z14-b', 'unread-count yanıtsız: D7-3U ÖLÇÜLEMEYEN (ilk unread-count; FAIL değil), D7-3/D7-3N/D7-3G PASS, gösterim yok, kapanış PASS, çıkış 3',
      z14b.code === 3 && z14b.v('D7-3U') === 'UNMEASURED' && /ilk unread-count/.test(z14b.o('D7-3U')) && ['D7-3', 'D7-3N', 'D7-3G'].every((id) => z14b.v(id) === 'PASS') && z14b.ev.fail === 0 && z14b.ev.displayed === false && closedAll(z14b),
      `çıkış=${z14b.code} · 3U=${z14b.o('D7-3U')}`);

    // ---- Z9 KAPILAR — yazma yok
    const gates = [
      ['Z9-a', 'D7_LIVE_CONFIRM yoksa çıkış 3', { D7_LIVE_CONFIRM: '' }, 3],
      ['Z9-b', 'D-5 GO biçimi D-7 için reddedilir çıkış 3', { D7_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R01' }, 3],
      ['Z9-c', 'D7_DISPLAY=none canlı DB adıyla çıkış 4', { D7_EXPECT_DB: 'hukuk_db' }, 4],
      ['Z9-d', 'TLS doğrulaması kapalıysa çıkış 1', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 1],
      ['Z9-e', 'slug beyanı runId ile eşleşmiyorsa çıkış 4', { D7_EXPECT_TENANT_SLUG: 'ah-deadbeef' }, 4],
      ['Z9-f', 'http origin reddedilir çıkış 4', { D7_EXPECT_BASE_URL: 'http://localhost:8459' }, 4],
    ];
    for (const [id, desc, over, exp] of gates) { const z = await runScenario(id.toLowerCase(), dir, {}, over); check(id, `${desc}; tenant YOK`, z.code === exp && !z.tenant, `çıkış=${z.code}`); }

    // ---- Z10 create-user 500 → hesap yok, gösterim yok, mesaj ölçümü yok, P7-C1 ÖLÇÜLEMEYEN, çıkış 6
    const z10 = await runScenario('z10-create-fail', dir, { create: 'fail' }, {}, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z10', 'create-user 500: gösterim yok, mesaj uçları çağrılmadı, P7-C1 ÖLÇÜLEMEYEN, P7-MSG-KEPT boş-doğrulama PASS DEĞİL → ÖLÇÜLEMEYEN "koşucu mesaj yazmadı … saklandı: 0 mesaj", çıkış 6, kurtarma notu',
      z10.code === 6 && z10.ev.displayed === false && z10.phone.length === 0 && !z10.calls.some((c) => /\/messages/.test(c.path)) && z10.v('P7-C1') === 'UNMEASURED'
        && z10.v('P7-MSG-KEPT') === 'UNMEASURED' && /koşucu mesaj yazmadı/.test(z10.o('P7-MSG-KEPT')) && /saklandı: 0 mesaj/.test(z10.o('P7-MSG-KEPT')) && z10.ev.recovery.gerekli, `çıkış=${z10.code} · KEPT=${z10.o('P7-MSG-KEPT')}`);
    // Z10-r: makbuzda koşucu mesaj id listesi YOK → Recover'da P7-MSG-KEPT sabit-koşullu PASS değil, ÖLÇÜLEMEYEN + rapor (oluşturma belirsiz → geç oluşma beklenir → 6)
    const r10 = await recover(z10, dir, 'z10-recover', {});
    check('Z10-r', 'Recover (makbuzda runnerMessageIds yok): P7-MSG-KEPT ÖLÇÜLEMEYEN "makbuzda koşucu mesaj id listesi yok … saklandı: 0 mesaj"; PASS değil; çıkış 0 DEĞİL',
      r10.v('P7-MSG-KEPT') === 'UNMEASURED' && /makbuzda koşucu mesaj id listesi yok/.test(r10.o('P7-MSG-KEPT')) && /saklandı: 0 mesaj/.test(r10.o('P7-MSG-KEPT')) && r10.code !== 0, `çıkış=${r10.code} · KEPT=${r10.o('P7-MSG-KEPT')}`);
    // ---- Z10-b geç oluşma: create yanıtsız (late) → hesap sonradan görülür ve kapatılır
    // create çağrısı zaman aşımı (1,5 sn) sahte API'nin geç yazımından (3 sn) ÖNCE dolar → hesap ilk sorguda yok, kapanış bekleyip görür.
    const z10b = await runScenario('z10b-create-late', dir, { create: 'late' }, { D7_CALL_TIMEOUT_MS: '1500' }, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z10-b', 'create-user yanıtsız (geç oluşma): P7-01 ÖLÇÜLEMEYEN, gösterim yok, kapanış geç hesabı görüp KAPATIR (P7-C1 PASS, "GÖRÜLDÜ"), portal pasif', z10b.v('P7-01') === 'UNMEASURED' && z10b.ev.displayed === false && z10b.v('P7-C1') === 'PASS' && /GÖRÜLDÜ/.test(z10b.o('P7-C1')) && !!z10b.pu && z10b.pu.isActive === false, `çıkış=${z10b.code} · C1=${z10b.o('P7-C1')}`);

    // ---- Z11 KONSOLSUZ conout → yazmadan 4
    const rid11 = hex8(); const pw11 = 'D7T!' + crypto.randomBytes(12).toString('base64url'); secretsSeen.add(pw11);
    const env11 = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      D7_MODE: 'run', D7_LIVE_CONFIRM: '1', D7_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D7-20000101-R99', D7_RUNID: rid11, D7_EXPECT_DB: DB_EXPECT.name,
      D7_EXPECT_TENANT_SLUG: `ah-${rid11}`, D7_API_BASE: API, D7_EXPECT_API: API, D7_EXPECT_BASE_URL: EXT, D7_LIVE_LOGIN_PW: pw11,
      D7_RECEIPT: path.join(dir, 'z11-receipt.json'), D7_EVID_FILE: path.join(dir, 'z11-evidence.json'), D7_DISPLAY: 'conout', D7_TEST_DISPLAY_SINK: path.join(dir, 'z11.sink') });
    const r11 = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env: env11, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => res({ code: x, log: l })); });
    fs.writeFileSync(path.join(dir, 'z11.log'), r11.log, 'utf8'); artifacts.push(path.join(dir, 'z11.log'));
    check('Z11', 'konsolsuz süreçte D7_DISPLAY=conout: çıkış 4, "yerel konsol yok", DB yazma YOK, makbuz YOK, sink YOK', r11.code === 4 && /yerel konsol yok/.test(r11.log) && !(await prisma.tenant.findFirst({ where: { slug: `ah-${rid11}` } })) && !fs.existsSync(path.join(dir, 'z11-receipt.json')) && !fs.existsSync(path.join(dir, 'z11.sink')), `çıkış=${r11.code}`);

    // ---- Z12 MAKBUZ YAZILAMIYOR → API çağrısı yok, çıkış 1
    const z12 = await runScenario('z12-receipt-fail', dir, {}, { D7_RECEIPT: path.join(dir, 'yok', 'alt', 'r.json') });
    check('Z12', 'makbuz yazılamazsa login/create-user/mesaj 0, kurulum kapatıldı, çıkış 1', z12.code === 1 && !z12.calls.some((c) => /auth\/login|create-user|messages/.test(c.path)) && z12.activeUsers === 0, `çıkış=${z12.code}`);

    // ---- Z13 TELEFON GİRİŞİ YOK: P7-WAIT + D7-3B ÖLÇÜLEMEYEN, kapanış PASS (koşucu oturumu var → C4 ölçülür), çıkış 3
    const z13 = await runScenario('z13-no-phone', dir, {}, { D7_WAIT_MS: '2000' });
    check('Z13', 'telefon girişi yok: P7-WAIT/D7-3B ÖLÇÜLEMEYEN, kapanış tamamı PASS (C4 koşucu oturumuyla), kalıntı 3 mesaj + 1 bildirim (yerinde=3/3), çıkış 3',
      z13.code === 3 && z13.v('P7-WAIT') === 'UNMEASURED' && z13.v('D7-3B') === 'UNMEASURED' && closedAll(z13) && z13.msgs.length === 3 && z13.notes === 1 && /yerinde=3\/3/.test(z13.o('P7-MSG-KEPT')), `çıkış=${z13.code} · PASS olmayan=${CLOSE.filter((id) => z13.v(id) !== 'PASS').join(',') || 'yok'}`);

    // ---- S-1 SIR SIZINTISI — parolalar, JWT'ler, DB URL, GO, telefon mesajı içeriği, tuzak (başka müvekkil) içeriği (sink dosyaları TARAMA DIŞI)
    let scanned = 0; const leaks = [];
    for (const f of artifacts) {
      if (!fs.existsSync(f) || sinks.has(f)) continue; const t = fs.readFileSync(f, 'utf8'); scanned++;
      for (const s of secretsSeen) if (s && t.includes(s)) leaks.push(`${path.basename(f)}:${String(s).slice(0, 5)}…`);
      if (/authorization|bearer /i.test(t)) leaks.push(`${path.basename(f)}:Authorization`);
    }
    const nPw = [...secretsSeen].filter((s) => /^D7p!/.test(String(s))).length; const nPhone = [...secretsSeen].filter((s) => /^PHONE-/.test(String(s))).length; const nLeak = [...secretsSeen].filter((s) => /^LEAK-/.test(String(s))).length;
    check('S-1', 'portal parolası · personel parolası · Recover ölçüm parolası · JWT · DB URL · GO · TELEFON MESAJI İÇERİĞİ · başka müvekkilin (tuzak) mesajı hiçbir log/makbuz/kanıtta YOK',
      scanned > 30 && leaks.length === 0 && nPw >= 10 && nPhone >= 4 && nLeak >= 1, `taranan=${scanned} · aranan=${secretsSeen.size} (portal parolası ${nPw} · telefon mesajı ${nPhone} · tuzak ${nLeak}) · sızıntı=${leaks.length ? leaks.join(',') : 'yok'}`);
  } finally { fake.kill(); await prisma.$disconnect().catch(() => {}); }

  // ---- STATİK
  const EX = require(RUN);
  const src = fs.readFileSync(RUN, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  const srcNoDecl = src.replace(/FORBIDDEN_PORTAL = \[[^\]]*\]/, '');
  const adminCalls = src.split('\n').filter((l) => /httpJson\(/.test(l) && /portal\/admin\//.test(l));
  check('T-1', 'koşucu kaynağında forgot/reset/change-password/documents çağrısı YOK; admin uçları (create/disable/messages) YALNIZ `${base}` ile (origin ile HİÇ); geçici portal parolası tam 6 kullanım',
    !EX.FORBIDDEN_PORTAL.some((re) => re.test(srcNoDecl)) && adminCalls.length === 6 && adminCalls.every((l) => /`\$\{base\}\/portal\/admin\//.test(l)) && !/\$\{origin\}\/api\/portal\/admin/.test(src) && (src.match(/\bportalPw\b/g) || []).length === 6,
    `admin çağrı satırı=${adminCalls.length} · portalPw=${(src.match(/\bportalPw\b/g) || []).length}`);
  const sinkLines = src.split('\n').filter((l) => /D7_TEST_DISPLAY_SINK/.test(l));
  check('T-2', 'gösterimsiz test dosyası (sink) kaynakta TEK yerde ve yalnız `display === \'none\'` koşuluyla (konsol varken asla)', sinkLines.length === 1 && /g\.display === 'none' && process\.env\.D7_TEST_DISPLAY_SINK/.test(sinkLines[0]) && /if \(con\) return DISPLAY\.show/.test(sinkLines[0]), `satır=${sinkLines.length}`);
  const liveEnv = { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/hukuk_db', D7_EXPECT_DB: 'hukuk_db', D7_WAIT_MS: '1', D7_POLL_MS: '1', D7_VIEW_MS: '1', D7_HTTP_TIMEOUT_MS: '1', D7_CALL_TIMEOUT_MS: '1', D7_LATE_CREATE_MS: '1' };
  const pl = EX.effectiveParams(liveEnv); const pt = EX.effectiveParams(Object.assign({}, liveEnv, { AH_DATABASE_URL: `postgresql://u:p@127.0.0.1:${DB_EXPECT.port}/${DB_EXPECT.name}`, D7_EXPECT_DB: DB_EXPECT.name }));
  check('P-1', 'canlı DB: devralınan 6 süre değişkeni YOK SAYILIR (20 dk bekleme, 5 sn yoklama, 120 sn inceleme, 120 sn geç oluşma); test kısa süreleri korur',
    pl.live && Object.keys(EX.LIVE_PARAMS).length === 6 && Object.keys(EX.LIVE_PARAMS).every((k) => pl[k] === EX.LIVE_PARAMS[k]) && pl.D7_WAIT_MS === 1200000 && pl.D7_LATE_CREATE_MS === 120000 && !pt.live && pt.D7_WAIT_MS === 1, `canlı=${pl.live}/${pl.D7_WAIT_MS} · test=${pt.live}/${pt.D7_WAIT_MS}`);
  const g = EX.runGates({ D7_DISPLAY: 'none', D7_EXPECT_DB: 'x', AH_DATABASE_URL: 'postgresql://u:p@h:1/x', D7_API_BASE: 'a', D7_EXPECT_API: 'a', D7_EXPECT_BASE_URL: 'https://ornek.invalid', D7_LIVE_CONFIRM: '1', D7_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D7-20000101-R01', D7_RUNID: 'abcdef12', D7_EXPECT_TENANT_SLUG: 'ah-abcdef12' });
  check('P-2', 'kapılar: doğru D-7 GO + runId + slug kabul; origin yolsuz https; FOREIGN_CASE_EXPECT=400 (kaynak); listOnlyOwn boş listeyi kabul etmez', g.code === 0 && g.origin === 'https://ornek.invalid' && EX.FOREIGN_CASE_EXPECT === 400 && EX.listOnlyOwn([], []).ok === false && EX.listOnlyOwn([{ id: 'a' }], ['a']).ok === true && EX.listOnlyOwn([{ id: 'a' }, { id: 'b' }], ['a']).ok === false, `kod=${g.code}`);
  if (fs.existsSync(WRAPPER)) {
    const tree = JSON.parse(execFileSync(process.execPath, [path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-url-selftest-reqtree.js'), RUN], { encoding: 'utf8' }));
    const w = fs.readFileSync(WRAPPER, 'utf8'); const wb = fs.readFileSync(WRAPPER);
    const pinned = [...w.matchAll(/^\s*'([^']+\.js)'\s*=\s*'/gm)].map((m) => m[1].replace(/\\/g, '/')).sort();
    const expectPinned = [...tree, 'client-extacc-portal-d7-r01/scripts/d7-qr-test.js'].sort();
    check('T-3', 'owner bloğunun pin listesi = koşucunun GERÇEKTEN yüklediği governance dosyaları + D-7 QR denemesi', JSON.stringify(expectPinned) === JSON.stringify(pinned),
      `yüklenen=${tree.length} (+qr-test) · pinli=${pinned.length} · eksik=${expectPinned.filter((f) => !pinned.includes(f)).join(',') || 'yok'} · fazla=${pinned.filter((f) => !expectPinned.includes(f)).join(',') || 'yok'}`);
    check('T-4', 'owner bloğu UTF-8 BOM, `exit $rc`, finally içinde gizli ortam temizliği', wb[0] === 0xef && wb[1] === 0xbb && wb[2] === 0xbf && /\nexit \$rc\s*$/.test(w) && (w.match(/finally\s*\{[^}]*Clear-SecretEnv/g) || []).length >= 2, 'BOM/exit/finally');
    const pre = w.slice(w.indexOf("if ($Mode -eq 'Preflight')"), w.indexOf("elseif ($Mode -eq 'QrTest')"));
    check('T-5', 'Preflight dalı yazmaz ve node/GO sormaz', pre.length > 0 && !/Set-Content|Add-Content|New-Item|Read-Host|Invoke-Node|Invoke-RunMode/.test(pre), `dal=${pre.length}`);
    check('T-6', 'Run: D7_DISPLAY=conout; GO deseni D-7; defter koşumdan ÖNCE; D7_DISPLAY=none ve D7_TEST_DISPLAY_SINK KURULMAZ; QrTest adresi /portal/messages ve d7-qr-test.js',
      /\$env:D7_DISPLAY = 'conout'/.test(w) && /OWNER-GO-CLIENT-EXTACC-D7-\\d\{8\}-R\\d\{2\}/.test(w) && !/D7_DISPLAY\s*=\s*'none'/.test(w) && !/\$env:D7_TEST_DISPLAY_SINK\s*=/.test(w)
        && w.indexOf('Add-Content -LiteralPath $GoLedger') > 0 && w.indexOf('Add-Content -LiteralPath $GoLedger') < w.indexOf("$env:D7_MODE = 'run'") && /\/portal\/messages"/.test(w) && /d7-qr-test\.js/.test(w) && !/extacc-qr-test\.js/.test(w), 'kapılar');
    const exw = fs.readFileSync(path.join(GOV, 'client-extacc-intake-chain-r01', 'scripts', 'extacc-owner-live-block.ps1'), 'utf8');
    const pinOf = (s, n) => ((s.match(new RegExp(`\\$${n}\\s*=\\s*'([0-9A-F]{64})'`)) || [])[1] || null);
    check('T-7', 'canlı dist pini = R27 dist (D-5 ile aynı ön koşul; R26 canlı dist ile blok DURUR) · .env pini EXTACC bloğuyla eşit', pinOf(w, 'ExpLiveDist') === R27_CAND_DIST && pinOf(w, 'ExpEnvSha') === pinOf(exw, 'ExpEnvSha'),
      `dist=${(pinOf(w, 'ExpLiveDist') || '').slice(0, 12)} env=${(pinOf(w, 'ExpEnvSha') || '').slice(0, 12)}`);
    const qsrc = fs.readFileSync(path.join(HERE, 'd7-qr-test.js'), 'utf8');
    check('T-8', 'd7-qr-test.js yalnız https://<host>/portal/messages kabul eder; canlı veri/token yok; extacc-display kullanır', /u\.pathname !== '\/portal\/messages'/.test(qsrc) && /extacc-display/.test(qsrc) && !/AH_DATABASE_URL|loadPrisma|token/i.test(qsrc.replace(/token YOK/g, '')), 'statik');
  } else check('T-3', 'owner bloğu mevcut', false, 'yok');

  console.log('');
  for (const r of rows) console.log(`${r.sonuc}  ${r.id.padEnd(6)} ${r.aciklama}\n        ${r.gozlem}`);
  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(`\nEXTACC D-7 R01 ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
  console.log(`  kanıt dizini: ${dir}`);
  console.log(`  (disposable DB ${DB_EXPECT.host}:${DB_EXPECT.port}/${DB_EXPECT.name} + sahte portal API ${API_PORT}/${EXT_PORT} + gerçek TLS; canlı DB/API/DNS/tünel/e-posta KULLANILMADI)`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); process.exit(2); });
