'use strict';
/*
 * EXTACC D-6 R01 ÖZ-TESTİ — CANLI DB'YE YAZMAZ, CANLI API/DNS/TÜNELE DOKUNMAZ. Disposable PostgreSQL + sahte portal API
 * (d6-fake-portal-api.js) + gerçek TLS'li sahte dış sunucu. "Telefon" bir istemci taklididir: giriş bilgisini koşucunun gösterimsiz
 * test dosyasından (D6_TEST_DISPLAY_SINK; yalnız disposable DB'de) alır, dış uçtan girer, listeyi/indirmeyi görür, isteğe bağlı
 * kendi belgesini yükler ve siler, koşucu silmesinden sonra listeyi yeniden okur.
 *
 * KULLANIM: node d6-selftest.js   (D6T_DB_URL → 127.0.0.1:5448/d5_reset_test ŞART; sahte API 8199 / dış 8458)
 * ÇIKIŞ   : 0 hepsi PASS · 1 FAIL var · 2 ölçülemedi
 * SINIR   : sahte API ürünün kendisi değildir; ürünün gerçek multipart/kova/hız sınırı davranışı canlı koşumda ölçülür.
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');

const HERE = __dirname; const GOV = path.resolve(HERE, '..', '..');
const RUN = path.join(HERE, 'd6-portal-documents-live-run.js');
const FAKE = path.join(HERE, 'd6-fake-portal-api.js');
const WRAPPER = path.join(HERE, 'd6-owner-live-block.ps1');
const REL = 'C:\\Development\\HUKUK_YAZILIMI\\HY_W4_RELEASE23\\project';
const PRISMA_ROOT = path.join(REL, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '@prisma', 'client');
const BCRYPT = path.join(REL, 'node_modules', '.pnpm', 'bcrypt@5.1.1', 'node_modules', 'bcrypt');
const API_PORT = 8199; const EXT_PORT = 8458;
const API = `http://127.0.0.1:${API_PORT}/api`; const EXT = `https://localhost:${EXT_PORT}`;
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36';
const R27_CAND_DIST = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'; // canlı ön koşul: R27 dist
const EX = require(RUN);

const rows = []; const check = (id, desc, ok, obs) => rows.push({ id, sonuc: ok ? 'PASS' : 'FAIL', aciklama: desc, gozlem: obs });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const hex8 = () => crypto.randomBytes(4).toString('hex');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function dbUrl() {
  const u = process.env.D6T_DB_URL || ''; let p; try { p = new URL(u); } catch (e) { return null; }
  return (p.hostname === '127.0.0.1' && p.port === '5448' && p.pathname === '/d5_reset_test') ? u : null;
}
async function ctl(method, p, body) { const r = await fetch(`http://127.0.0.1:${API_PORT}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json(); }
let DBURL; let certFile; let prisma; let dataRoot; const artifacts = []; const secretsSeen = new Set(); const sinks = new Set();

function httpsReq(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = require('https').request(url, { method, headers, ca: fs.readFileSync(certFile), timeout: 10000 }, (res) => {
      const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => { const buf = Buffer.concat(c); let j = null; try { j = JSON.parse(buf.toString('utf8')); } catch (e) { j = null; } resolve({ status: res.statusCode, body: j, buf }); });
    });
    req.on('timeout', () => req.destroy(new Error('zaman aşımı'))); req.on('error', reject);
    if (body) req.write(body); req.end();
  });
}
const H = { 'user-agent': PHONE_UA, 'content-type': 'application/json' };
async function waitSink(sink, re, ms) { const t0 = Date.now(); for (;;) { if (fs.existsSync(sink)) { const t = fs.readFileSync(sink, 'utf8'); const m = t.match(re); if (m) return m; } if (Date.now() - t0 > ms) return null; await sleep(200); } }
/** Telefon taklidi: giriş → liste → indirme → (opsiyonel yükleme [+silme]) → koşucu silmesinden sonra liste. */
async function phoneFlow(sink, opts = {}) {
  const out = {};
  const cm = await waitSink(sink, /E-posta : (\S+)\n\s+Parola  : (\S+)/, 12000); if (!cm) { out.creds = false; return out; } out.creds = true;
  const email = cm[1]; const pw = cm[2]; secretsSeen.add(pw);
  const page = await httpsReq('GET', `${EXT}/portal/documents`, H); out.page = page.status;
  const login = await httpsReq('POST', `${EXT}/api/portal/login`, H, JSON.stringify({ email, password: pw })); out.login = login.status; const token = login.body && login.body.token; if (!token) return out; out.token = token;
  const A = Object.assign({ authorization: `Bearer ${token}` }, H);
  const list = await httpsReq('GET', `${EXT}/api/portal/documents`, A); out.list = list.status; out.titles = Array.isArray(list.body) ? list.body.map((d) => d.title) : null;
  const first = Array.isArray(list.body) && list.body[0]; if (first) { const dl = await httpsReq('GET', `${EXT}/api/portal/documents/${first.id}/download`, A); out.download = dl.status; out.downloadSha = dl.buf ? sha256(dl.buf) : null; }
  if (opts.upload) {
    const pdf = EX.buildPdf('telefon'); const mp = EX.multipart({ type: 'DIGER', title: 'D6-TELEFON' }, { name: 'telefon.pdf', type: 'application/pdf', data: pdf });
    const up = await httpsReq('POST', `${EXT}/api/portal/documents/upload`, Object.assign({}, A, { 'content-type': mp.contentType }), mp.body); out.upload = up.status; out.uploadId = up.body && up.body.id;
    if (opts.deleteOwn && out.uploadId) { const w = await waitSink(sink, /D6-RESIDUE-WAIT/, 15000); out.residueWaitSeen = !!w; const del = await httpsReq('DELETE', `${EXT}/api/portal/documents/${out.uploadId}`, A); out.deleteOwn = del.status; }
  }
  const done = await waitSink(sink, /\(2\/2\)/, 20000); out.secondScreen = !!done;
  if (done) { const l2 = await httpsReq('GET', `${EXT}/api/portal/documents`, A); out.listAfter = l2.status; out.countAfter = Array.isArray(l2.body) ? l2.body.length : null; }
  return out;
}
function runScenario(name, dir, sc, over, hooks = {}) {
  return new Promise(async (resolve) => {
    await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
    const runId = (over && over.D6_RUNID) || hex8(); const pw = 'D6T!' + crypto.randomBytes(12).toString('base64url');
    const go = `OWNER-GO-CLIENT-EXTACC-D6-20000101-R${String(10 + Math.floor(Math.random() * 89))}`;
    const receipt = path.join(dir, `${name}-receipt.json`); const evid = path.join(dir, `${name}-evidence.json`); const sink = path.join(dir, `${name}-display.sink`); sinks.add(sink);
    const env = Object.assign({}, process.env, {
      AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      D6_MODE: 'run', D6_LIVE_CONFIRM: '1', D6_LIVE_GO_REF: go, D6_RUNID: runId, D6_EXPECT_DB: 'd5_reset_test',
      D6_EXPECT_TENANT_SLUG: `ah-${runId}`, D6_API_BASE: API, D6_EXPECT_API: API, D6_EXPECT_BASE_URL: EXT,
      D6_LIVE_LOGIN_PW: pw, D6_RECEIPT: receipt, D6_EVID_FILE: evid, D6_DISPLAY: 'none', D6_TEST_DISPLAY_SINK: sink,
      D6_WAIT_MS: '15000', D6_POLL_MS: '300', D6_VIEW_MS: '800', D6_HTTP_TIMEOUT_MS: '5000', D6_CALL_TIMEOUT_MS: '8000', D6_LATE_CREATE_MS: '6000', D6_RESIDUE_WAIT_MS: '5000',
    }, over || {});
    for (const k of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']) if (!(over && k in over)) delete env[k];
    [pw, go, DBURL].forEach((s) => secretsSeen.add(s));
    const ch = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; let fired = false; let killed = false; const phoneRes = []; let hookDone = Promise.resolve();
    const onData = (c) => {
      log += c;
      if (!fired && /OK\s+P6-DISP/.test(log) && hooks.onDisplay) { fired = true; hookDone = hooks.onDisplay(sink, runId).then((r) => phoneRes.push(r), (e) => phoneRes.push({ error: String(e.message || e) })); }
      if (!killed && hooks.killAfter && hooks.killAfter.test(log)) { killed = true; ch.kill('SIGKILL'); }
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
      const docs = rc ? await prisma.portalDocument.findMany({ where: { clientId: rc.clientId }, select: { id: true, filePath: true } }) : [];
      const fdocs = rc ? await prisma.portalDocument.count({ where: { clientId: rc.foreignClientId } }) : null;
      const activeUsers = tenant ? await prisma.user.count({ where: { tenantId: tenant.id, isActive: true } }) : null;
      const activeCases = tenant ? await prisma.case.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }) : null;
      const fileOnDisk = rc && rc.documentFile ? fs.existsSync(rc.documentFile) : null;
      resolve({ runId, code, killed, log, ev, v, o, tenant, receipt, rc, pu, cl, docs, fdocs, fileOnDisk, activeUsers, activeCases, phone: phoneRes, calls: await ctl('GET', '/__calls'), ext: await ctl('GET', '/__ext') });
    });
  });
}
async function recover(prev, dir, name, sc, envOver, during) {
  await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
  const pw = 'D6R!' + crypto.randomBytes(12).toString('base64url'); const evid = path.join(dir, `${name}-evidence.json`); secretsSeen.add(pw);
  const env = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
    D6_MODE: 'recover', D6_RECOVER_CONFIRM: '1', D6_RUNID: prev.runId, D6_EXPECT_DB: 'd5_reset_test', D6_API_BASE: API, D6_EXPECT_API: API,
    D6_EXPECT_BASE_URL: EXT, D6_LIVE_LOGIN_PW: pw, D6_RECEIPT: prev.receipt, D6_EVID_FILE: evid, D6_DISPLAY: 'none', D6_HTTP_TIMEOUT_MS: '5000', D6_CALL_TIMEOUT_MS: '8000',
    D6_POLL_MS: '300', D6_LATE_CREATE_MS: '6000' }, envOver || {});
  // `during`: Recover süreci ÇALIŞIRKEN paralel iş (ör. askıdaki hesap oluşturmayı serbest bırakmak) — D-4 kalıbı
  const started = Date.now(); let duringRes = null;
  const code = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; });
    if (during) during().then((r) => { duringRes = Object.assign({ atMs: Date.now() - started }, r); }).catch((e) => { duringRes = { error: String(e) }; });
    c.on('close', (x) => { fs.writeFileSync(path.join(dir, `${name}.log`), l, 'utf8'); res(x); }); });
  artifacts.push(path.join(dir, `${name}.log`), evid);
  const rc = JSON.parse(fs.readFileSync(prev.receipt, 'utf8'));
  const pu = await prisma.clientPortalUser.findUnique({ where: { clientId: rc.clientId }, select: { isActive: true, tokenVersion: true } });
  const cl = await prisma.client.findUnique({ where: { id: rc.clientId }, select: { hasPortalAccess: true } });
  const docs = await prisma.portalDocument.findMany({ where: { clientId: rc.clientId }, select: { id: true, filePath: true } });
  const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
  const sec = await ctl('GET', '/__secrets'); Object.values(sec).flat().forEach((x) => secretsSeen.add(x));
  const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
  const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
  return { code, pu, cl, docs, rc, ev, v, o, duringRes, calls: await ctl('GET', '/__calls'), activeUsers: await prisma.user.count({ where: { tenantId: prev.tenant.id, isActive: true } }) };
}
const FLOW = ['P6-00', 'P6-01', 'P6-02', 'P6-03L', 'P6-04D', 'D6-1', 'D6-1D', 'D6-2L', 'D6-2D', 'D6-3', 'D6-6', 'D6-4A', 'D6-4B', 'D6-4C', 'P6-DISP', 'P6-WAIT', 'P6-PHONE-DOC', 'D6-5', 'D6-5D', 'D6-5L'];
const CLOSE = ['P6-C1', 'P6-C2', 'P6-C2V', 'P6-C3L', 'P6-C3D', 'P6-C4L', 'P6-C4D', 'P6-C5', 'P6-C-DOC', 'P6-FOREIGN-CLEAN', 'U-CLOSE', 'P6-D9'];
// Recover: koşumun oturumu saklanmaz → C4 ÖLÇÜLEMEYEN; P6-D9 birleşik satırı yalnız Run'da üretilir (D-4/D-5 ile aynı).
const CLOSE_NO_S = CLOSE.filter((id) => id !== 'P6-C4L' && id !== 'P6-C4D' && id !== 'P6-D9');

(async () => {
  DBURL = dbUrl();
  if (!DBURL) { console.log('OLCULEMEDI: disposable DB (D6T_DB_URL → 127.0.0.1:5448/d5_reset_test) yok — test BAŞLAMADI'); process.exit(2); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd6-selftest-')); dataRoot = path.join(dir, 'data'); fs.mkdirSync(dataRoot);
  certFile = path.join(dir, 'cert.pem'); const keyFile = path.join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const { PrismaClient } = require(PRISMA_ROOT); prisma = new PrismaClient({ datasources: { db: { url: DBURL } } });
  const fake = spawn(process.execPath, [FAKE], { env: Object.assign({}, process.env, { D6F_DB_URL: DBURL, D6F_PRISMA_ROOT: PRISMA_ROOT, D6F_BCRYPT: BCRYPT, D6F_API_PORT: String(API_PORT), D6F_EXT_PORT: String(EXT_PORT), D6F_CERT: certFile, D6F_KEY: keyFile, D6F_DATA_ROOT: dataRoot }), stdio: ['ignore', 'pipe', 'pipe'] });
  let fl = ''; fake.stdout.on('data', (c) => { fl += c; }); fake.stderr.on('data', (c) => { fl += c; });
  for (let i = 0; i < 60 && !fl.includes('hazır'); i++) await sleep(250);
  if (!fl.includes('hazır')) { console.log('OLCULEMEDI: sahte API başlamadı: ' + fl.slice(0, 300)); fake.kill(); process.exit(2); }
  const filesUnder = () => { const out = []; const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(p); } }; walk(path.join(dataRoot, 'portal-documents')); return out; };
  try {
    // ---- Z1 NORMAL
    const z1 = await runScenario('z1-normal', dir, {}, {}, { onDisplay: (s) => phoneFlow(s) });
    const all = [...FLOW, ...CLOSE, 'U-ISO'];
    check('Z1-a', 'normal akış: çıkış 0; D-6 + kapanış ölçütlerinin tamamı PASS', z1.code === 0 && all.every((id) => z1.v(id) === 'PASS'), `çıkış=${z1.code} · PASS olmayan=${all.filter((id) => z1.v(id) !== 'PASS').join(',') || 'yok'}`);
    const ph = z1.phone[0] || {};
    check('Z1-b', 'telefon: belgeler sayfası 200, giriş 201, liste 200 YALNIZ D6-<runId>, indirme 200 sha = koşucunun yüklediği, koşucu silmesinden sonra liste BOŞ',
      ph.page === 200 && ph.login === 201 && ph.list === 200 && JSON.stringify(ph.titles) === JSON.stringify([`D6-${z1.runId}`]) && ph.download === 200 && ph.downloadSha === z1.ev.upload.sha256 && ph.secondScreen && ph.listAfter === 200 && ph.countAfter === 0,
      `sayfa=${ph.page} giriş=${ph.login} liste=${ph.list} başlık=${JSON.stringify(ph.titles)} indirme=${ph.download} sha=${ph.downloadSha === (z1.ev.upload || {}).sha256} sonra=${ph.countAfter}`);
    check('Z1-c', 'DB/disk: belge satırı 0 · yabancı satır 0 · kova altında dosya 0 · portal pasif · erişim kapalı · personel pasif · dosya kapalı · sürüm ≥ 1',
      z1.docs.length === 0 && z1.fdocs === 0 && filesUnder().length === 0 && z1.pu && z1.pu.isActive === false && z1.cl.hasPortalAccess === false && z1.activeUsers === 0 && z1.activeCases === 0 && z1.pu.tokenVersion >= 1 && z1.fileOnDisk === false,
      `belge=${z1.docs.length} yabancı=${z1.fdocs} dosya=${filesUnder().length} portal=${JSON.stringify(z1.pu)}`);
    const upl = z1.ext.filter((c) => c.path === '/api/portal/documents/upload'); const del = z1.ext.filter((c) => c.method === 'DELETE');
    check('Z1-d', 'çağrılar: yükleme DIŞ uçtan 1 kez; DELETE dış 2 (yabancı 404 + kendi); yasak uç 0; onay/ret çağrısı 0; bekleyen liste yerel personel oturumuyla; disable-user çağrıldı; kanıtta forbiddenEndpointCalled=false',
      upl.length === 1 && del.length === 2 && !z1.calls.some((c) => c.forbidden) && !z1.calls.some((c) => /approve|reject/.test(c.path)) && z1.calls.some((c) => c.path === '/api/portal/admin/documents/pending') && z1.calls.some((c) => c.path === '/api/portal/admin/disable-user') && z1.ev.forbiddenEndpointCalled === false,
      `yükleme=${upl.length} delete=${del.length} yasak=${z1.calls.filter((c) => c.forbidden).length}`);
    const after = ph.token ? await httpsReq('GET', `${EXT}/api/portal/documents`, { authorization: `Bearer ${ph.token}` }) : { status: null };
    check('Z1-e', 'kapanıştan sonra TELEFONUN oturumu dış belge listesinde 401; kanıtta yükleme sha/bayt ≤ 50 KB; audit "saklandı" notu; yabancı temizlik açıkça raporlandı',
      after.status === 401 && z1.ev.upload.bytes <= EX.MAX_PDF_BYTES && /SAKLANDI/.test((z1.ev.auditRetained || {}).note || '') && z1.ev.foreignCleanup && z1.ev.foreignCleanup.deleted === 1 && z1.v('P6-FOREIGN-CLEAN') === 'PASS' && /silinen=1 kalan=0/.test(z1.o('P6-FOREIGN-CLEAN')), `HTTP ${after.status} · bayt=${z1.ev.upload.bytes} · yabancı silinen=${(z1.ev.foreignCleanup || {}).deleted}`);

    // ---- Z2 İNDİRME SIZINTISI (kapsam yok): yabancı belge 200 + içerikle SIZAR → D6-4A FAIL ("KAPSAM DIŞI BELGEYE ERİŞİLDİ" ürün bulgusu metni), çıkış 2
    const z2 = await runScenario('z2-download-leak', dir, { download: 'leak' }, {}, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z2', 'indirme kapsamı yok: D6-4A FAIL (HTTP 200 — "KAPSAM DIŞI BELGEYE ERİŞİLDİ (ürün bulgusu)" metniyle), D6-4B/4C PASS, gösterim YOK (kapsam dışı 404 gösterim kapısında), kendi belgesi yine silindi, kapanış PASS, çıkış 2',
      z2.code === 2 && z2.v('D6-4A') === 'FAIL' && /HTTP 200 — KAPSAM DIŞI BELGEYE ERİŞİLDİ \(ürün bulgusu\)/.test(z2.o('D6-4A')) && z2.v('D6-4B') === 'PASS' && z2.v('D6-4C') === 'PASS' && z2.ev.displayed === false && z2.phone.length === 0 && z2.v('D6-5') === 'PASS' && z2.docs.length === 0 && z2.v('P6-D9') === 'PASS', `çıkış=${z2.code} · 4A=${z2.o('D6-4A')}`);
    // ---- Z3 SİLME SIZINTISI: yabancı belge silinir → D6-4B FAIL + D6-4C FAIL; yabancı temizlik "kalan 0" (zaten silinmiş) → çıkış 2
    const z3 = await runScenario('z3-delete-leak', dir, { delete: 'leak' }, {}, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z3', 'silme kapsamı yok: D6-4B FAIL (200), D6-4C FAIL (yabancı satır gitti), gösterim YOK, P6-FOREIGN-CLEAN silinen=0 kalan=0, çıkış 2',
      z3.code === 2 && z3.ev.displayed === false && z3.v('D6-4B') === 'FAIL' && z3.v('D6-4C') === 'FAIL' && z3.v('P6-FOREIGN-CLEAN') === 'PASS' && z3.ev.foreignCleanup.deleted === 0 && z3.fdocs === 0, `çıkış=${z3.code} · 4B=${z3.o('D6-4B')} · 4C=${z3.o('D6-4C')}`);
    // ---- Z4 LİSTE SIZINTISI: liste yabancı tenant'ın belgesini de döner → D6-2L/2D FAIL, çıkış 2
    const z4 = await runScenario('z4-list-leak', dir, { list: 'leak' }, {}, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z4', 'liste kapsamı yok: D6-2L ve D6-2D FAIL (2 kayıt), gösterim YOK, çıkış 2', z4.code === 2 && z4.v('D6-2L') === 'FAIL' && z4.v('D6-2D') === 'FAIL' && /kayıt=([2-9]|\d{2,})/.test(z4.o('D6-2D')) && z4.ev.displayed === false, `çıkış=${z4.code} · 2D=${z4.o('D6-2D')}`);

    // ---- Z5 SİLME 500: satır + dosya kalır → D6-5 FAIL, P6-C-DOC FAIL → çıkış 6; Recover → belge kaldı 6; cleanup=1 → satır silinir dosya kalır 6; dosya elle silinir → Recover 3
    const z5 = await runScenario('z5-delete-fail', dir, { delete: 'fail' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z5-a', 'delete 500: D6-5 FAIL, D6-5D FAIL, P6-C-DOC FAIL ("SENTETİK BELGE KALDI"), P6-D9 FAIL, çıkış 6, kurtarma notu belge kalıntısını söyler; erişim yine kapalı',
      z5.code === 6 && z5.v('D6-5') === 'FAIL' && z5.v('D6-5D') === 'FAIL' && z5.v('P6-C-DOC') === 'FAIL' && /SENTETİK BELGE KALDI/.test(z5.o('P6-C-DOC')) && z5.v('P6-D9') === 'FAIL' && z5.ev.recovery.gerekli && z5.ev.recovery.neden.some((n) => /BELGE: sentetik belge KALDI/.test(n)) && z5.docs.length === 1 && z5.fileOnDisk === true && z5.pu.isActive === false && z5.v('P6-C2') === 'PASS',
      `çıkış=${z5.code} · C-DOC=${z5.o('P6-C-DOC')} · neden=${(z5.ev.recovery.neden || []).join('|')}`);
    const r5a = await recover(z5, dir, 'z5-recover-a', {});
    check('Z5-b', 'Recover (temizlik kararı YOK): hesap zaten pasif, disable çağrılmaz; belge kaldı → P6-C-DOC FAIL → çıkış 6 (0 DEĞİL); satır ve dosya duruyor; makbuza residueFiles yazıldı',
      r5a.code === 6 && r5a.v('P6-C-DOC') === 'FAIL' && !r5a.calls.some((c) => c.path === '/api/portal/admin/disable-user') && r5a.docs.length === 1 && fs.existsSync(r5a.docs[0].filePath) && Array.isArray(r5a.rc.residueFiles) && r5a.rc.residueFiles.length === 1, `çıkış=${r5a.code} · satır=${r5a.docs.length}`);
    const r5b = await recover(z5, dir, 'z5-recover-b', {}, { D6_RESIDUE_CLEANUP: '1' });
    const leftFile = z5.rc.documentFile;
    check('Z5-c', 'Recover + D6_RESIDUE_CLEANUP=1 (owner kararı): satır Prisma ile silindi (raporlandı), dosya SİLİNMEDİ ve listelendi → P6-C-DOC yine FAIL → çıkış 6; adım "elle silindikten sonra Recover"',
      r5b.code === 6 && r5b.docs.length === 0 && fs.existsSync(leftFile) && r5b.ev.portalClose.docResidue.rowsDeletedByPrisma === 1 && r5b.ev.portalClose.docResidue.filesLeftOnDisk.length === 1 && /Prisma ile silinen 1/.test(r5b.o('P6-C-DOC')) && /elle silindikten sonra/.test(r5b.ev.recovery.adim || ''), `çıkış=${r5b.code} · dosya=${fs.existsSync(leftFile)} · adım=${r5b.ev.recovery.adim}`);
    fs.unlinkSync(leftFile); // OWNER ADIMI TAKLİDİ: dosya elle silindi
    const r5c = await recover(z5, dir, 'z5-recover-c', {});
    check('Z5-d', 'dosya elle silindikten sonra Recover: P6-C-DOC PASS (makbuzdaki residueFiles ölçüldü), DB kapalı, C4 ÖLÇÜLEMEYEN → çıkış 3 (0 DEĞİL)',
      r5c.code === 3 && r5c.v('P6-C-DOC') === 'PASS' && CLOSE_NO_S.every((id) => r5c.v(id) === 'PASS') && r5c.v('P6-C4L') === 'UNMEASURED', `çıkış=${r5c.code} · PASS olmayan=${CLOSE_NO_S.filter((id) => r5c.v(id) !== 'PASS').join(',') || 'yok'}`);

    // ---- Z6 SİLME DOSYAYI BIRAKIYOR: satır silinir, dosya kalır → D6-5D FAIL, P6-C-DOC FAIL (dosya) → 6
    const z6 = await runScenario('z6-delete-nounlink', dir, { delete: 'noUnlink' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z6', 'delete dosyayı silmiyor: D6-5 PASS ama D6-5D FAIL (diskte=true), P6-C-DOC FAIL (satır 0, diskte kalan 1), çıkış 6', z6.code === 6 && z6.v('D6-5') === 'PASS' && z6.v('D6-5D') === 'FAIL' && z6.v('P6-C-DOC') === 'FAIL' && /diskte kalan=1/.test(z6.o('P6-C-DOC')) && z6.docs.length === 0 && z6.fileOnDisk === true, `çıkış=${z6.code} · C-DOC=${z6.o('P6-C-DOC')}`);
    // ---- Z6-ACL (inceleme R01, bulgu 2): kalan dosya ACL ile OKUNAMAZ yapılır (dosya F + üst dizin RD reddi; Windows'ta ölçüldü: statSync EPERM,
    // existsSync false) → Recover P6-C-DOC ÖLÇÜLEMEYEN ("yok" sahte PASS DEĞİL), çıkış 6; ACL geri → FAIL (diskte kalan=1) 6; dosya elle → PASS 3
    const aclFile = z6.rc.documentFile; const aclDir = path.dirname(aclFile); const aclUser = process.env.USERNAME; let r6a = null; let st6 = null; let denied = false;
    const icacls = (args) => { try { execFileSync('icacls', args, { stdio: 'ignore' }); return true; } catch (e) { return false; } };
    try {
      denied = icacls([aclFile, '/deny', `${aclUser}:(F)`]) && icacls([aclDir, '/deny', `${aclUser}:(RD)`]);
      st6 = EX.fileState(aclFile);
      r6a = await recover(z6, dir, 'z6-recover-acl', {});
    } finally { icacls([aclDir, '/remove:d', aclUser]); icacls([aclFile, '/remove:d', aclUser]); }
    check('Z6-b', 'ACL reddi altında Recover: dosya yoklaması "olculemez" (EPERM/EACCES), P6-C-DOC ÖLÇÜLEMEYEN ("yok" SAYILMADI), filesAccessError=1, çıkış 6 (0/3 DEĞİL), kurtarma notu + adımı kova okunabilirliğini söyler',
      denied && st6 && st6.state === 'olculemez' && r6a.code === 6 && r6a.v('P6-C-DOC') === 'UNMEASURED' && /erişimi ÖLÇÜLEMEDİ/.test(r6a.o('P6-C-DOC')) && r6a.ev.portalClose.docResidue.filesAccessError.length === 1
        && r6a.ev.recovery.neden.some((n) => /erişimi ÖLÇÜLEMEDİ/.test(n)) && /okunabilirliği/.test(r6a.ev.recovery.adim || ''),
      `deny=${denied} · durum=${st6 && st6.state}(${st6 && st6.code}) · çıkış=${r6a && r6a.code} · C-DOC=${r6a && r6a.o('P6-C-DOC')}`);
    const r6b = await recover(z6, dir, 'z6-recover-acl-restored', {});
    check('Z6-c', 'ACL geri alınınca Recover: dosya yine diskte → P6-C-DOC FAIL (diskte kalan=1), çıkış 6', r6b.code === 6 && r6b.v('P6-C-DOC') === 'FAIL' && /diskte kalan=1/.test(r6b.o('P6-C-DOC')) && EX.fileState(aclFile).state === 'var', `çıkış=${r6b.code} · C-DOC=${r6b.o('P6-C-DOC')}`);
    fs.unlinkSync(aclFile); // OWNER ADIMI TAKLİDİ: dosya elle silindi
    const r6c = await recover(z6, dir, 'z6-recover-acl-clean', {});
    check('Z6-d', 'dosya elle silindikten sonra Recover: P6-C-DOC PASS (residueFiles ölçüldü), çıkış 3', r6c.code === 3 && r6c.v('P6-C-DOC') === 'PASS', `çıkış=${r6c.code}`);

    // ---- Z7 YÜKLEME 500: belge yok → D6-1 FAIL, akış durur, gösterim yok, kapanış PASS → çıkış 2
    const z7 = await runScenario('z7-upload-fail', dir, { upload: 'fail' }, {}, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z7', 'upload 500: D6-1 FAIL, D6-1D FAIL (satır yok), D6-2..D6-5 ÖLÇÜLEMEYEN, gösterim YOK, P6-C-DOC PASS, kapanış PASS, çıkış 2', z7.code === 2 && z7.v('D6-1') === 'FAIL' && z7.v('D6-1D') === 'FAIL' && ['D6-2D', 'D6-3', 'D6-5', 'P6-DISP'].every((id) => z7.v(id) === 'UNMEASURED') && z7.ev.displayed === false && z7.v('P6-C-DOC') === 'PASS' && z7.v('P6-C2') === 'PASS' && z7.rc.uploadOutcome === 'uncertain', `çıkış=${z7.code} · D6-1=${z7.o('D6-1')}`);

    // ---- Z8 YARIM KALMA: indirmeden sonra koşucu ÖLDÜRÜLÜR → Recover: hesap açık → kapatır; belge kaldı → 6; cleanup + dosya elle → 3
    const z8 = await runScenario('z8-half', dir, {}, {}, { killAfter: /OK\s+D6-3/ });
    check('Z8-a', 'yarım kalma: koşucu D6-3 sonrası öldürüldü; kanıt YOK; portal hesabı AÇIK; belge satırı + dosya duruyor; makbuzda documentId/uploadOutcome=ok', z8.killed && !z8.ev && z8.pu && z8.pu.isActive === true && z8.docs.length === 1 && z8.fileOnDisk === true && z8.rc.documentId && z8.rc.uploadOutcome === 'ok', `öldürüldü=${z8.killed} · hesap=${JSON.stringify(z8.pu)} · belge=${z8.docs.length}`);
    const r8 = await recover(z8, dir, 'z8-recover', {});
    check('Z8-b', 'Recover: personel oturumu açılıp disable-user çağrıldı, DB kapalı + yeni giriş 401 (ölçüm parolası), yabancı satır temizlendi, ama belge KALDI → P6-C-DOC FAIL → çıkış 6',
      r8.code === 6 && r8.calls.some((c) => c.path === '/api/portal/admin/disable-user') && r8.pu.isActive === false && r8.cl.hasPortalAccess === false && r8.v('P6-C3D') === 'PASS' && r8.v('P6-FOREIGN-CLEAN') === 'PASS' && r8.v('P6-C-DOC') === 'FAIL' && r8.docs.length === 1 && r8.activeUsers === 0, `çıkış=${r8.code} · C-DOC=${r8.o('P6-C-DOC')}`);
    const r8b = await recover(z8, dir, 'z8-recover-b', {}, { D6_RESIDUE_CLEANUP: '1' }); try { fs.unlinkSync(z8.rc.documentFile); } catch (e) { /* owner adımı taklidi */ }
    const r8c = await recover(z8, dir, 'z8-recover-c', {});
    check('Z8-c', 'Recover cleanup=1 → satır silindi, dosya listelendi (6); dosya elle silindi → Recover → P6-C-DOC PASS, çıkış 3', r8b.code === 6 && r8b.docs.length === 0 && r8c.code === 3 && r8c.v('P6-C-DOC') === 'PASS', `b=${r8b.code} c=${r8c.code}`);

    // ---- Z9 TELEFON YÜKLEMESİ: (a) telefon koşucu beklerken siler → 0; (b) silmez → P6-PHONE-DOC FAIL + P6-C-DOC FAIL → 6
    const z9a = await runScenario('z9a-phone-upload-deleted', dir, {}, {}, { onDisplay: (s) => phoneFlow(s, { upload: true, deleteOwn: true }) });
    const p9a = z9a.phone[0] || {};
    check('Z9-a', 'telefon kendi belgesini yükledi (201), koşucu D6-RESIDUE-WAIT gösterdi, telefon sildi (200) → P6-PHONE-DOC PASS, phoneUploadsSeen=1, kalıntı 0, çıkış 0', z9a.code === 0 && p9a.upload === 201 && p9a.residueWaitSeen && p9a.deleteOwn === 200 && z9a.v('P6-PHONE-DOC') === 'PASS' && z9a.ev.phoneUploadsSeen === 1 && z9a.v('P6-C-DOC') === 'PASS' && p9a.countAfter === 0, `çıkış=${z9a.code} · yükleme=${p9a.upload} · bekleme=${p9a.residueWaitSeen} · silme=${p9a.deleteOwn}`);
    const z9b = await runScenario('z9b-phone-upload-kept', dir, {}, {}, { onDisplay: (s) => phoneFlow(s, { upload: true }) });
    check('Z9-b', 'telefon belgesi silinmedi: koşucu bekledi, P6-PHONE-DOC FAIL (kalan=1), kendi belgesini sildi (D6-5 PASS), P6-C-DOC FAIL (telefon belgesi kaldı) → çıkış 6', z9b.code === 6 && z9b.v('P6-PHONE-DOC') === 'FAIL' && z9b.v('D6-5') === 'PASS' && z9b.v('P6-C-DOC') === 'FAIL' && z9b.docs.length === 1, `çıkış=${z9b.code} · PHONE-DOC=${z9b.o('P6-PHONE-DOC')}`);
    for (const d of z9b.docs) { try { fs.unlinkSync(d.filePath); } catch (e) { /* test temizliği */ } } await prisma.portalDocument.deleteMany({ where: { clientId: z9b.rc.clientId } });

    // ---- Z10 KAPILAR — yazma yok
    const gates = [
      ['Z10-a', 'D-5 GO biçimi D-6 için reddedilir çıkış 3', { D6_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R01' }, 3],
      ['Z10-b', 'D6_LIVE_CONFIRM yoksa çıkış 3', { D6_LIVE_CONFIRM: '' }, 3],
      ['Z10-c', 'D6_DISPLAY=none canlı DB adıyla çıkış 4', { D6_EXPECT_DB: 'hukuk_db' }, 4],
      ['Z10-d', 'slug beyanı runId ile eşleşmiyorsa çıkış 4', { D6_EXPECT_TENANT_SLUG: 'ah-deadbeef' }, 4],
      ['Z10-e', 'TLS doğrulaması kapalıysa çıkış 1', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 1],
      ['Z10-f', 'dış origin yol taşıyorsa çıkış 4', { D6_EXPECT_BASE_URL: `${EXT}/portal` }, 4],
      ['Z10-g', 'izole modda (canlı olmayan DB) API adresi 8080 ise çıkış 4 — canlı API\'ye izole koşumdan tek çağrı bile gitmez (inceleme R01)', { D6_API_BASE: 'http://127.0.0.1:8080/api', D6_EXPECT_API: 'http://127.0.0.1:8080/api' }, 4],
      ['Z10-h', 'izole modda API adresi loopback değilse çıkış 4', { D6_API_BASE: 'http://api.example.invalid:8199/api', D6_EXPECT_API: 'http://api.example.invalid:8199/api' }, 4],
    ];
    for (const [id, desc, over, exp] of gates) { const z = await runScenario(id.toLowerCase(), dir, {}, over); check(id, `${desc}; tenant YOK`, z.code === exp && !z.tenant && z.calls.length === 0, `çıkış=${z.code} · çağrı=${z.calls.length}`); }

    // ---- Z11 create-user 500 → hesap yok, yükleme YOK, P6-C1 ÖLÇÜLEMEYEN, çıkış 6
    const z11 = await runScenario('z11-create-fail', dir, { create: 'fail' }, {}, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z11', 'create-user 500: yükleme yapılmadı, gösterim yok, P6-C1 ÖLÇÜLEMEYEN, çıkış 6', z11.code === 6 && !z11.ext.some((c) => c.path === '/api/portal/documents/upload') && z11.ev.displayed === false && z11.v('P6-C1') === 'UNMEASURED' && !z11.rc.uploadAttemptedAt, `çıkış=${z11.code}`);
    // ---- Z12 GUARD BAYAT: kapanış sonrası mevcut oturum 200 → ÜRÜN BULGUSU, çıkış 6; belge yine silindi
    const z12 = await runScenario('z12-guard-stale', dir, { guard: 'stale' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z12', 'guard bayat: P6-C4L/C4D FAIL (200), productFinding, çıkış 6; belge kalıntısı yok', z12.code === 6 && z12.v('P6-C4L') === 'FAIL' && z12.v('P6-C4D') === 'FAIL' && !!z12.ev.productFinding && z12.v('P6-C-DOC') === 'PASS', `çıkış=${z12.code}`);
    // ---- Z16 GEÇ OLUŞMA (inceleme R01, bulgu 1; D-4 y17–y20 kalıbı): create-user yanıtı gecikir (late: kayıt 3 sn sonra) ya da askıda kalır (hold: /__release'e kadar)
    const shouldNot = { onDisplay: async () => ({ displayedButShouldNot: true }) };
    const z16a = await runScenario('z16a-late-create', dir, { create: 'late' }, { D6_CALL_TIMEOUT_MS: '1500' }, shouldNot);
    check('Z16-a', 'create-user zaman aşımı + kayıt sonradan: P6-01 ÖLÇÜLEMEYEN, P6-02 FAIL (var=false), yükleme YAPILMADI, gösterim YOK, kapanış geç hesabı GÖRDÜ ve kapattı (P6-C1 PASS, DB pasif, yeni giriş 401), P6-C-DOC PASS satır=0, yabancı satır hiç yazılmadı, çıkış 2',
      z16a.v('P6-01') === 'UNMEASURED' && z16a.v('P6-02') === 'FAIL' && /var=false/.test(z16a.o('P6-02')) && !z16a.ext.some((c) => c.path === '/api/portal/documents/upload') && !z16a.rc.uploadAttemptedAt && z16a.ev.displayed === false && z16a.phone.length === 0
        && z16a.v('P6-C1') === 'PASS' && /GÖRÜLDÜ/.test(z16a.o('P6-C1')) && z16a.pu && z16a.pu.isActive === false && z16a.cl.hasPortalAccess === false && z16a.v('P6-C3L') === 'PASS'
        && z16a.v('P6-C-DOC') === 'PASS' && /satır=0/.test(z16a.o('P6-C-DOC')) && /hiç yazılmamıştı/.test(z16a.o('P6-FOREIGN-CLEAN')) && z16a.code === 2,
      `çıkış=${z16a.code} · P6-C1=${z16a.o('P6-C1').slice(0, 90)} · hesap=${JSON.stringify(z16a.pu)}`);
    const z16b = await runScenario('z16b-held-create', dir, { create: 'hold' }, { D6_CALL_TIMEOUT_MS: '1500' }, shouldNot);
    const rel16 = await ctl('POST', '/__release');
    const leaked16 = z16b.rc ? await prisma.clientPortalUser.findUnique({ where: { clientId: z16b.rc.clientId }, select: { isActive: true } }) : null;
    check('Z16-b', 'hesap koşum boyunca görünmedi: P6-C1 ÖLÇÜLEMEYEN, P6-C-DOC yine ölçüldü (satır=0), yükleme yok, çıkış 6, kurtarma "geç oluşma"; koşumdan sonra hesap AKTİF oluştu (koşum kapanış iddia ETMEDİ)',
      z16b.code === 6 && z16b.v('P6-C1') === 'UNMEASURED' && /geç oluşma DIŞLANAMADI/.test(z16b.o('P6-C1')) && z16b.v('P6-C-DOC') === 'PASS' && /satır=0/.test(z16b.o('P6-C-DOC')) && !z16b.ext.some((c) => c.path === '/api/portal/documents/upload') && z16b.ev.recovery.gerekli && /geç oluşma DIŞLANAMADI/.test(z16b.ev.recovery.neden.join(' ')) && rel16.released === 1 && leaked16 && leaked16.isActive === true,
      `çıkış=${z16b.code} · serbest=${rel16.released} · sonradan aktif=${leaked16 && leaked16.isActive}`);
    const r16b = await recover(z16b, dir, 'z16b-recover', {});
    check('Z16-c', 'Recover: geç oluşan AKTİF hesap yetkili uçla kapatıldı (disable çağrıldı), sürüm kapanış öncesinden büyük, yeni giriş 401, P6-C-DOC PASS; mevcut oturum ÖLÇÜLEMEYEN → çıkış 3 (0 DEĞİL)',
      r16b.code === 3 && r16b.calls.some((c) => c.path === '/api/portal/admin/disable-user') && r16b.pu.isActive === false && r16b.cl.hasPortalAccess === false && r16b.v('P6-C2V') === 'PASS' && /kapanıştan hemen önceki/.test(r16b.o('P6-C2V')) && r16b.v('P6-C3L') === 'PASS' && r16b.v('P6-C-DOC') === 'PASS' && r16b.activeUsers === 0,
      `çıkış=${r16b.code} · hesap=${JSON.stringify(r16b.pu)} · C2V=${r16b.o('P6-C2V')}`);
    const z16d = await runScenario('z16d-create-during-recover', dir, { create: 'hold' }, { D6_CALL_TIMEOUT_MS: '1500', D6_LATE_CREATE_MS: '1500' }, shouldNot);
    const r16d = await recover(z16d, dir, 'z16d-recover', {}, { D6_LATE_CREATE_MS: '15000' }, async () => { await sleep(5000); return ctl('POST', '/__release'); });
    check('Z16-d', 'Recover başında hesap YOK, bekleme sırasında oluştu → bulundu ("ilk sorguda YOKTU"), personel oturumu o anda açıldı, disable çağrıldı, hesap pasif, personel yeniden pasif, yeni giriş 401; çıkış 3',
      z16d.code === 6 && (z16d.rc || {}).createOutcome === 'uncertain' && r16d.duringRes && r16d.duringRes.released === 1 && /ilk sorguda YOKTU/.test(r16d.o('P6-C1')) && r16d.ev.createEvidence.uncertain === true
        && r16d.calls.some((c) => c.path === '/api/auth/login') && r16d.calls.some((c) => c.path === '/api/portal/admin/disable-user') && /kapatma için açıldı/.test(r16d.o('P6-C1')) && r16d.pu.isActive === false && r16d.cl.hasPortalAccess === false && r16d.activeUsers === 0 && r16d.v('P6-C3L') === 'PASS' && r16d.code === 3,
      `koşum=${z16d.code} · serbest@${r16d.duringRes && r16d.duringRes.atMs} ms · Recover=${r16d.code} · C1=${r16d.o('P6-C1').slice(0, 120)}`);
    const z16e = await runScenario('z16e-create-after-recover', dir, { create: 'hold' }, { D6_CALL_TIMEOUT_MS: '1500', D6_LATE_CREATE_MS: '1500' }, shouldNot);
    const r16e = await recover(z16e, dir, 'z16e-recover', {}, { D6_LATE_CREATE_MS: '3000' });
    const rel16e = await ctl('POST', '/__release');
    const acct16e = z16e.rc ? await prisma.clientPortalUser.findUnique({ where: { clientId: z16e.rc.clientId }, select: { isActive: true } }) : null;
    const r16e2 = await recover(z16e, dir, 'z16e-recover-b', {});
    check('Z16-e', 'hesap Recover bitene kadar YOK: Recover P6-C1 ÖLÇÜLEMEYEN, çıkış 6 (0 DEĞİL), "geç oluşma", portalClose.ok≠true; sonra hesap AKTİF oluştu (Recover kapanış iddia ETMEMİŞTİ); ikinci Recover kapatır → 3, personel pasif',
      r16e.code === 6 && r16e.v('P6-C1') === 'UNMEASURED' && r16e.v('P6-C-DOC') === 'PASS' && r16e.ev.recovery && r16e.ev.recovery.gerekli === true && /geç oluşma DIŞLANAMADI/.test(r16e.ev.recovery.neden.join(' ')) && r16e.ev.portalClose && r16e.ev.portalClose.ok !== true
        && rel16e.released === 1 && acct16e && acct16e.isActive === true && r16e2.code === 3 && r16e2.pu.isActive === false && r16e2.cl.hasPortalAccess === false && r16e2.activeUsers === 0,
      `Recover1=${r16e.code} · sonradan aktif=${acct16e && acct16e.isActive} · Recover2=${r16e2.code} · hesap=${JSON.stringify(r16e2.pu)}`);

    // ---- Z13 KONSOLSUZ conout → yazmadan 4
    const rid13 = hex8(); const pw13 = 'D6T!' + crypto.randomBytes(12).toString('base64url'); secretsSeen.add(pw13);
    const env13 = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile, D6_MODE: 'run', D6_LIVE_CONFIRM: '1', D6_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D6-20000101-R99', D6_RUNID: rid13, D6_EXPECT_DB: 'd5_reset_test',
      D6_EXPECT_TENANT_SLUG: `ah-${rid13}`, D6_API_BASE: API, D6_EXPECT_API: API, D6_EXPECT_BASE_URL: EXT, D6_LIVE_LOGIN_PW: pw13, D6_RECEIPT: path.join(dir, 'z13-receipt.json'), D6_EVID_FILE: path.join(dir, 'z13-evidence.json'), D6_DISPLAY: 'conout', D6_TEST_DISPLAY_SINK: path.join(dir, 'z13.sink') });
    const r13 = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env: env13, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => res({ code: x, log: l })); });
    fs.writeFileSync(path.join(dir, 'z13.log'), r13.log, 'utf8'); artifacts.push(path.join(dir, 'z13.log'));
    check('Z13', 'konsolsuz süreçte D6_DISPLAY=conout: çıkış 4, "yerel konsol yok", DB yazma YOK, makbuz YOK, sink YOK', r13.code === 4 && /yerel konsol yok/.test(r13.log) && !(await prisma.tenant.findFirst({ where: { slug: `ah-${rid13}` } })) && !fs.existsSync(path.join(dir, 'z13-receipt.json')) && !fs.existsSync(path.join(dir, 'z13.sink')), `çıkış=${r13.code}`);
    // ---- Z14 MAKBUZ YAZILAMIYOR → API çağrısı yok, çıkış 1
    const z14 = await runScenario('z14-receipt-fail', dir, {}, { D6_RECEIPT: path.join(dir, 'yok', 'alt', 'r.json') });
    check('Z14', 'makbuz yazılamazsa login/create-user/yükleme 0, kurulum kapatıldı, çıkış 1', z14.code === 1 && !z14.calls.some((c) => /auth\/login|create-user/.test(c.path)) && z14.ext.length === 0 && z14.activeUsers === 0, `çıkış=${z14.code}`);

    // ---- S-1 SIR SIZINTISI — portal parolaları, ölçüm parolaları, personel parolası, JWT'ler, DB URL, GO (sink dosyaları TARAMA DIŞI)
    let scanned = 0; const leaks = [];
    for (const f of artifacts) {
      if (!fs.existsSync(f) || sinks.has(f)) continue; const t = fs.readFileSync(f, 'utf8'); scanned++;
      for (const s of secretsSeen) if (s && t.includes(s)) leaks.push(`${path.basename(f)}:${String(s).slice(0, 4)}…`);
      if (/authorization|bearer /i.test(t)) leaks.push(`${path.basename(f)}:Authorization`);
    }
    const nPw = [...secretsSeen].filter((s) => /^D6p!/.test(String(s))).length; const nJwt = [...secretsSeen].filter((s) => /^p?fake\./.test(String(s))).length;
    check('S-1', 'portal parolası · Recover ölçüm parolası · personel parolası · JWT · DB URL · GO hiçbir log/makbuz/kanıtta YOK', scanned > 40 && leaks.length === 0 && nPw >= 8 && nJwt >= 10, `taranan=${scanned} · aranan=${secretsSeen.size} (portal parola ${nPw} · jwt ${nJwt}) · sızıntı=${leaks.length ? leaks.join(',') : 'yok'}`);
  } finally { fake.kill(); await prisma.$disconnect().catch(() => {}); }

  // ---- STATİK
  const src = fs.readFileSync(RUN, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  const srcNoList = src.replace(/FORBIDDEN = \[[^\]]*\]/, '');
  check('T-1', 'koşucu kaynağında forgot/reset/change-password, messages, admin approve/reject çağrısı YOK; koşucu dosya silmez (unlink/rm yok); Prisma delete yalnız PortalDocument (yabancı/kalıntı temizliği)',
    !EX.FORBIDDEN.some((re) => re.test(srcNoList)) && !/unlinkSync|rmSync|\.unlink\(|\.rm\(/.test(src) && (src.match(/prisma\.\w+\.delete(Many)?\(/g) || []).every((m) => /portalDocument/.test(m)), `delete çağrıları=${(src.match(/prisma\.\w+\.delete(Many)?\(/g) || []).join(',')}`);
  const sinkLines = src.split('\n').filter((l) => /D6_TEST_DISPLAY_SINK/.test(l));
  check('T-2', 'gösterimsiz test dosyası (sink) kaynakta TEK yerde ve yalnız `display === \'none\'` koşuluyla (konsol varken asla)', sinkLines.length === 1 && /g\.display === 'none' && process\.env\.D6_TEST_DISPLAY_SINK/.test(sinkLines[0]) && /if \(con\) return DISPLAY\.show/.test(sinkLines[0]), `satır=${sinkLines.length}`);
  const liveEnv = { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/hukuk_db', D6_EXPECT_DB: 'hukuk_db', D6_WAIT_MS: '1', D6_POLL_MS: '1', D6_VIEW_MS: '1', D6_HTTP_TIMEOUT_MS: '1', D6_CALL_TIMEOUT_MS: '1', D6_LATE_CREATE_MS: '1', D6_RESIDUE_WAIT_MS: '1' };
  const pl = EX.effectiveParams(liveEnv); const pt = EX.effectiveParams(Object.assign({}, liveEnv, { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5448/d5_reset_test', D6_EXPECT_DB: 'd5_reset_test' }));
  check('P-1', 'canlı DB: devralınan 7 süre değişkeni YOK SAYILIR (20 dk bekleme, 5 sn yoklama, 120 sn inceleme, 5 dk kalıntı bekleme); test kısa süreleri korur', pl.live && Object.keys(EX.LIVE_PARAMS).length === 7 && Object.keys(EX.LIVE_PARAMS).every((k) => pl[k] === EX.LIVE_PARAMS[k]) && pl.D6_WAIT_MS === 1200000 && pl.D6_RESIDUE_WAIT_MS === 300000 && !pt.live && pt.D6_WAIT_MS === 1, `canlı=${pl.live}/${pl.D6_WAIT_MS} · test=${pt.live}/${pt.D6_WAIT_MS}`);
  const g = EX.runGates({ D6_DISPLAY: 'none', D6_EXPECT_DB: 'x', AH_DATABASE_URL: 'postgresql://u:p@h:1/x', D6_API_BASE: API, D6_EXPECT_API: API, D6_EXPECT_BASE_URL: 'https://ornek.invalid', D6_LIVE_CONFIRM: '1', D6_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D6-20000101-R01', D6_RUNID: 'abcdef12', D6_EXPECT_TENANT_SLUG: 'ah-abcdef12' });
  const pdf = EX.buildPdf('abcdef12');
  check('P-2', 'kapılar: doğru D-6 GO + runId + slug kabul; origin yolsuz https; sentetik PDF %PDF ile başlar, runId içerir, ≤ 50 KB', g.code === 0 && g.origin === 'https://ornek.invalid' && pdf.subarray(0, 5).toString() === '%PDF-' && pdf.includes('D6-abcdef12') && pdf.length <= EX.MAX_PDF_BYTES, `kod=${g.code} · pdf=${pdf.length} B`);
  const thrower = (code) => () => { const e = new Error('enjekte'); e.code = code; throw e; };
  const fsv = EX.fileState(RUN); const fsn = EX.fileState(path.join(dir, `yok-${hex8()}.pdf`)); const fsu = EX.fileState(path.join(RUN, 'alt.pdf'));
  check('P-3', 'üç durumlu dosya yoklaması: var dosya → var · olmayan → yok · dosya altı yol → yok (ENOENT/ENOTDIR) · EPERM/EACCES → olculemez ("yok" DEĞİL, kod taşınır) · boş yol → yok',
    fsv.state === 'var' && fsn.state === 'yok' && fsu.state === 'yok' && EX.fileState('x', thrower('EPERM')).state === 'olculemez' && EX.fileState('x', thrower('EPERM')).code === 'EPERM' && EX.fileState('x', thrower('EACCES')).state === 'olculemez'
      && EX.fileState('x', thrower('ENOENT')).state === 'yok' && EX.fileState('x', thrower('ENOTDIR')).state === 'yok' && EX.fileState('').state === 'yok', `${fsv.state}/${fsn.state}(${fsn.code})/${fsu.state}(${fsu.code})`);
  const gl = (over) => EX.commonGates(Object.assign({ D6_DISPLAY: 'none', D6_EXPECT_DB: 'd5_reset_test', AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5448/d5_reset_test', D6_API_BASE: API, D6_EXPECT_API: API, D6_EXPECT_BASE_URL: 'https://ornek.invalid' }, over || {}));
  const liveOk = EX.commonGates({ D6_DISPLAY: 'conout', D6_EXPECT_DB: 'hukuk_db', AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/hukuk_db', D6_API_BASE: 'http://127.0.0.1:8080/api', D6_EXPECT_API: 'http://127.0.0.1:8080/api', D6_EXPECT_BASE_URL: 'https://ornek.invalid' });
  check('P-4', 'izole mod API kapısı: loopback + 8080 dışı port kabul; 8080 → 4; portsuz → 4; loopback dışı → 4; canlı DB beyanıyla 8080 kabul (kapı yalnız izole modda)',
    gl() === null && (gl({ D6_API_BASE: 'http://127.0.0.1:8080/api', D6_EXPECT_API: 'http://127.0.0.1:8080/api' }) || {}).code === 4 && (gl({ D6_API_BASE: 'http://localhost/api', D6_EXPECT_API: 'http://localhost/api' }) || {}).code === 4
      && (gl({ D6_API_BASE: 'http://10.0.0.1:8199/api', D6_EXPECT_API: 'http://10.0.0.1:8199/api' }) || {}).code === 4 && liveOk === null, 'kapı');
  if (fs.existsSync(WRAPPER)) {
    const tree = JSON.parse(execFileSync(process.execPath, [path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-url-selftest-reqtree.js'), RUN], { encoding: 'utf8' }));
    const w = fs.readFileSync(WRAPPER, 'utf8'); const wb = fs.readFileSync(WRAPPER);
    const pinned = [...w.matchAll(/^\s*'([^']+\.js)'\s*=\s*'/gm)].map((m) => m[1].replace(/\\/g, '/')).sort();
    const expectPinned = [...tree, 'client-extacc-portal-d6-r01/scripts/d6-qr-test.js'].sort();
    check('T-3', 'owner bloğunun pin listesi = koşucunun GERÇEKTEN yüklediği governance dosyaları + D-6 QR denemesi', JSON.stringify(expectPinned) === JSON.stringify(pinned), `yüklenen=${tree.length} (+qr-test) · pinli=${pinned.length} · eksik=${expectPinned.filter((f) => !pinned.includes(f)).join(',') || 'yok'} · fazla=${pinned.filter((f) => !expectPinned.includes(f)).join(',') || 'yok'}`);
    check('T-4', 'owner bloğu UTF-8 BOM, `exit $rc`, finally içinde gizli ortam temizliği', wb[0] === 0xef && wb[1] === 0xbb && wb[2] === 0xbf && /\nexit \$rc\s*$/.test(w) && (w.match(/finally\s*\{[^}]*Clear-SecretEnv/g) || []).length >= 2, 'BOM/exit/finally');
    const pre = w.slice(w.indexOf("if ($Mode -eq 'Preflight')"), w.indexOf("elseif ($Mode -eq 'QrTest')"));
    check('T-5', 'Preflight dalı yazmaz ve node/GO sormaz', pre.length > 0 && !/Set-Content|Add-Content|New-Item|Read-Host|Invoke-Node|Invoke-RunMode/.test(pre), `dal=${pre.length}`);
    check('T-6', 'Run: D6_DISPLAY=conout; GO deseni D-6; defter koşumdan ÖNCE; D6_DISPLAY=none ve D6_TEST_DISPLAY_SINK KURULMAZ; alıcı/gönderim soruları YOK; QR URL /portal/documents; D6_RESIDUE_CLEANUP yalnız Recover',
      /\$env:D6_DISPLAY = 'conout'/.test(w) && /OWNER-GO-CLIENT-EXTACC-D6-\\d\{8\}-R\\d\{2\}/.test(w) && !/D6_DISPLAY\s*=\s*'none'/.test(w) && !/\$env:D6_TEST_DISPLAY_SINK\s*=/.test(w) && !/Read-Recipient|Confirm-SingleSend|RECIPIENT/.test(w)
        && w.indexOf('Add-Content -LiteralPath $GoLedger') > 0 && w.indexOf('Add-Content -LiteralPath $GoLedger') < w.indexOf("$env:D6_MODE = 'run'") && /\/portal\/documents"/.test(w)
        && (w.match(/\$env:D6_RESIDUE_CLEANUP\s*=/g) || []).length === 1 && w.indexOf('$env:D6_RESIDUE_CLEANUP =') > w.indexOf('function Invoke-RecoverMode'), 'kapılar');
    const exw = fs.readFileSync(path.join(GOV, 'client-extacc-intake-chain-r01', 'scripts', 'extacc-owner-live-block.ps1'), 'utf8');
    const pinOf = (s, n) => ((s.match(new RegExp(`\\$${n}\\s*=\\s*'([0-9A-F]{64})'`)) || [])[1] || null);
    check('T-7', 'canlı dist pini = R27 dist (uygulama sırası yayından sonra) · .env pini EXTACC bloğuyla eşit', pinOf(w, 'ExpLiveDist') === R27_CAND_DIST && pinOf(w, 'ExpEnvSha') === pinOf(exw, 'ExpEnvSha'), `dist=${(pinOf(w, 'ExpLiveDist') || '').slice(0, 12)} env=${(pinOf(w, 'ExpEnvSha') || '').slice(0, 12)}`);
  } else check('T-3', 'owner bloğu mevcut', false, 'yok');

  console.log('');
  for (const r of rows) console.log(`${r.sonuc}  ${r.id.padEnd(6)} ${r.aciklama}\n        ${r.gozlem}`);
  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(`\nEXTACC D-6 R01 ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
  console.log(`  kanıt dizini: ${dir}`);
  console.log('  (disposable DB + sahte portal API + gerçek TLS; canlı DB/API/DNS/tünel KULLANILMADI)');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); process.exit(2); });
