'use strict';
/*
 * EXTACC R01 ÖZ-TESTİ — CANLI DB'YE YAZMAZ. Disposable PostgreSQL + sahte API (h5-fake-api.js; public POST ürün
 * mantığıyla) + gerçek TLS'li sahte dış sunucu. "Telefon" bu testte bir istemci taklididir: adresi sahte API'nin test
 * ucundan alır (koşum adresi hiçbir kanala yazmaz; EXA_DISPLAY=none yalnız disposable DB'de kabul edilir).
 *
 * KULLANIM: node extacc-selftest.js   (H5T_DB_URL ya da %TEMP%\h5-test-pg.url → 127.0.0.1:5447/ah_h5_test ŞART)
 * ÇIKIŞ   : 0 hepsi PASS · 1 FAIL var · 2 ölçülemedi
 * SINIR   : sahte API ürünün yanıt biçimini ve submit mantığını taklit eder (kaynak: client-intake-public.service.ts);
 *           ürünün kendisi burada koşmaz. Konsol davranışı ayrı ölçülür: extacc-console-selftest.ps1.
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');

const HERE = __dirname; const GOV = path.resolve(HERE, '..', '..');
const RUN = path.join(HERE, process.env.EXA_T_RUN_OVERRIDE ? path.basename(process.env.EXA_T_RUN_OVERRIDE) : 'extacc-intake-live-run.js');
const FAKE = path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-fake-api.js');
const WRAPPER = path.join(HERE, 'extacc-owner-live-block.ps1');
const REL = 'C:\\Development\\HUKUK_YAZILIMI\\HY_W4_RELEASE23\\project';
const PRISMA_ROOT = path.join(REL, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '@prisma', 'client');
const BCRYPT = path.join(REL, 'node_modules', '.pnpm', 'bcrypt@5.1.1', 'node_modules', 'bcrypt');
const API_PORT = 8196; const EXT_PORT = 8453; const FOREIGN_PORT = 8454;
const API = `http://127.0.0.1:${API_PORT}/api`; const EXT = `https://localhost:${EXT_PORT}`;
const PHONE_IP = '198.51.100.23'; const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36';

const rows = []; const check = (id, desc, ok, obs) => rows.push({ id, sonuc: ok ? 'PASS' : 'FAIL', aciklama: desc, gozlem: obs });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const hex8 = () => crypto.randomBytes(4).toString('hex');

function dbUrl() {
  const f = path.join(os.tmpdir(), 'h5-test-pg.url');
  const u = process.env.H5T_DB_URL || (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '');
  let p; try { p = new URL(u); } catch (e) { return null; }
  return (p.hostname === '127.0.0.1' && p.port === '5447' && p.pathname === '/ah_h5_test') ? u : null;
}
async function ctl(method, p, body) {
  const r = await fetch(`http://127.0.0.1:${API_PORT}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

let DBURL; let certFile; let prisma; const artifacts = []; const secretsSeen = new Set();

/** Dış HTTPS isteği — test sertifikası AÇIKÇA güvenilir (doğrulama kapatılmaz; test süreci NODE_EXTRA_CA_CERTS'i okumaz). */
function httpsReq(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = require('https').request(url, { method, headers, ca: fs.readFileSync(certFile), timeout: 10000 }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('timeout', () => req.destroy(new Error('zaman aşımı'))); req.on('error', reject);
    if (body) req.write(body); req.end();
  });
}
/** Telefon taklidi: sayfa GET + TEK public POST (dış HTTPS üzerinden). */
async function phone(token, value, opts = {}) {
  const h = { 'user-agent': PHONE_UA, 'x-fake-client-ip': PHONE_IP, 'content-type': 'application/json' };
  const page = await httpsReq('GET', `${EXT}/intake/${token}`, h);
  const body = { fields: [{ category: 'ADDRESS', value }] }; if (opts.hp) body.hp = opts.hp;
  const post = await httpsReq('POST', `${EXT}/api/public/intake/${token}`, h, JSON.stringify(body));
  return { page, post };
}

/**
 * Koşumu başlatır. `onDisplay(token, receipt)` koşum "E-DISP" satırını yazdığında çağrılır (telefonun adımı).
 * `onSpawn` koşum başlar başlamaz paralel iş (yarış testleri).
 */
function runScenario(name, dir, sc, over, hooks = {}) {
  return new Promise(async (resolve) => {
    await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
    const runId = (over && over.EXA_RUNID) || hex8(); const pw = 'EXT!' + crypto.randomBytes(12).toString('base64url');
    const go = `OWNER-GO-CLIENT-EXTACC-20260927-R${String(10 + Math.floor(Math.random() * 89))}`;
    const receipt = path.join(dir, `${name}-receipt.json`); const evid = path.join(dir, `${name}-evidence.json`);
    const env = Object.assign({}, process.env, {
      AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      EXA_MODE: 'run', EXA_LIVE_CONFIRM: '1', EXA_LIVE_GO_REF: go, EXA_RUNID: runId, EXA_EXPECT_DB: 'ah_h5_test',
      EXA_EXPECT_TENANT_SLUG: `ah-${runId}`, EXA_API_BASE: API, EXA_EXPECT_API: API, EXA_EXPECT_BASE_URL: EXT,
      EXA_LIVE_LOGIN_PW: pw, EXA_RECEIPT: receipt, EXA_EVID_FILE: evid, EXA_DISPLAY: 'none',
      EXA_WAIT_MS: '15000', EXA_POLL_MS: '300', H5U_REVOKE_TIMEOUT_MS: '8000', H5U_LOCAL_TIMEOUT_MS: '5000', H5U_EXTERNAL_TIMEOUT_MS: '5000',
    }, over || {});
    for (const k of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']) if (!(over && k in over)) delete env[k];
    [pw, go, DBURL].forEach((s) => secretsSeen.add(s));
    const ch = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; let fired = false; const phoneRes = [];
    const onData = async (c) => {
      log += c;
      if (!fired && /E-DISP/.test(log) && hooks.onDisplay) {
        fired = true;
        const sec = await ctl('GET', '/__secrets'); const token = sec.rawTokens[sec.rawTokens.length - 1];
        const rc = fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt, 'utf8')) : null;
        try { phoneRes.push(await hooks.onDisplay(token, rc)); } catch (e) { phoneRes.push({ error: String(e.message || e) }); }
      }
    };
    ch.stdout.on('data', onData); ch.stderr.on('data', onData);
    if (hooks.onSpawn) hooks.onSpawn({ receipt }).then((r) => phoneRes.push(r)).catch((e) => phoneRes.push({ error: String(e) }));
    ch.on('close', async (code) => {
      fs.writeFileSync(path.join(dir, `${name}.log`), log, 'utf8'); artifacts.push(path.join(dir, `${name}.log`), receipt, evid);
      const sec = await ctl('GET', '/__secrets'); sec.rawTokens.concat(sec.jwts).forEach((s) => secretsSeen.add(s));
      const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
      const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
      const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
      const tenant = await prisma.tenant.findFirst({ where: { slug: `ah-${runId}` }, select: { id: true } });
      const links = tenant ? await prisma.clientIntakeLink.findMany({ where: { tenantId: tenant.id }, select: { id: true, status: true, useCount: true, maxUses: true, expiresAt: true } }) : [];
      const subs = tenant ? await prisma.clientIntakeSubmission.count({ where: { tenantId: tenant.id } }) : 0;
      const activeUsers = tenant ? await prisma.user.count({ where: { tenantId: tenant.id, isActive: true } }) : null;
      const activeCases = tenant ? await prisma.case.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }) : null;
      resolve({ runId, code, log, ev, v, o, tenant, links, subs, activeUsers, activeCases, receipt, phone: phoneRes,
        calls: await ctl('GET', '/__calls'), ext: await ctl('GET', '/__ext'), honeypot: (await ctl('GET', '/__honeypot')).drops });
    });
  });
}
async function recover(prev, dir, name) {
  await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', {});
  const pw = 'EXR!' + crypto.randomBytes(12).toString('base64url'); const evid = path.join(dir, `${name}-evidence.json`); secretsSeen.add(pw);
  const env = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
    EXA_MODE: 'recover', EXA_RECOVER_CONFIRM: '1', EXA_RUNID: prev.runId, EXA_EXPECT_DB: 'ah_h5_test', EXA_API_BASE: API, EXA_EXPECT_API: API,
    EXA_EXPECT_BASE_URL: EXT, EXA_LIVE_LOGIN_PW: pw, EXA_RECEIPT: prev.receipt, EXA_EVID_FILE: evid, EXA_DISPLAY: 'none' });
  const code = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => { fs.writeFileSync(path.join(dir, `${name}.log`), l, 'utf8'); res(x); }); });
  artifacts.push(path.join(dir, `${name}.log`), evid);
  const links = await prisma.clientIntakeLink.findMany({ where: { tenantId: prev.tenant.id }, select: { status: true } });
  return { code, links, activeUsers: await prisma.user.count({ where: { tenantId: prev.tenant.id, isActive: true } }) };
}
const D3 = ['E-10', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16', 'E-17'];

(async () => {
  DBURL = dbUrl();
  if (!DBURL) { console.log('OLCULEMEDI: disposable DB (127.0.0.1:5447/ah_h5_test) yok — test BAŞLAMADI'); process.exit(2); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extacc-selftest-'));
  certFile = path.join(dir, 'cert.pem'); const keyFile = path.join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const { PrismaClient } = require(PRISMA_ROOT); prisma = new PrismaClient({ datasources: { db: { url: DBURL } } });
  const fake = spawn(process.execPath, [FAKE], { env: Object.assign({}, process.env, { H5F_DB_URL: DBURL, H5F_PRISMA_ROOT: PRISMA_ROOT, H5F_BCRYPT: BCRYPT,
    H5F_API_PORT: String(API_PORT), H5F_EXT_PORT: String(EXT_PORT), H5F_FOREIGN_PORT: String(FOREIGN_PORT), H5F_CERT: certFile, H5F_KEY: keyFile }), stdio: ['ignore', 'pipe', 'pipe'] });
  let fl = ''; fake.stdout.on('data', (c) => { fl += c; }); fake.stderr.on('data', (c) => { fl += c; });
  for (let i = 0; i < 60 && !fl.includes('hazır'); i++) await sleep(250);
  if (!fl.includes('hazır')) { console.log('OLCULEMEDI: sahte API başlamadı'); fake.kill(); process.exit(2); }
  try {
    // ---- X1 NORMAL: telefon bir kez gönderir → D-1/D-2/D-3/D-9 · X5: USED bağlantıya ikinci POST reddedilir (telefon)
    const x1 = await runScenario('x1-normal', dir, {}, {}, { onDisplay: async (tok, rc) => {
      const first = await phone(tok, `EXTACC-${rc.runId} sentetik adres`);
      const second = await phone(tok, `EXTACC-${rc.runId} ikinci deneme`);
      return { first, second };
    } });
    const all = ['E-00', 'E-01', 'E-02', 'E-URL', 'E-03L', 'E-03D', 'E-DISP', 'E-WAIT', ...D3, 'U-REV-DB', 'U-REV-PUB-L', 'U-REV-PUB-D', 'U-CLOSE', 'E-D9', 'U-ISO'];
    check('X1-a', 'normal zincir: çıkış 0; D-1..D-3 + D-9 ölçütlerinin tamamı PASS', x1.code === 0 && all.every((id) => x1.v(id) === 'PASS'),
      `çıkış=${x1.code} · PASS olmayan=${all.filter((id) => x1.v(id) !== 'PASS').join(',') || 'yok'}`);
    const ph = x1.phone[0] || {};
    check('X1-b', 'bağlantı DB\'de 30 dk ± geçerli, maxUses 1; gönderim sonrası USED/useCount 1; TEK gönderim satırı',
      x1.links.length === 1 && x1.links[0].status === 'USED' && x1.links[0].useCount === 1 && x1.links[0].maxUses === 1 && x1.subs === 1
        && Math.abs(new Date(x1.links[0].expiresAt).getTime() - Date.now() - 30 * 60000) < 5 * 60000,
      `bağlantı=${JSON.stringify(x1.links.map((l) => ({ s: l.status, u: l.useCount, m: l.maxUses })))} · gönderim=${x1.subs}`);
    check('X5', 'USED bağlantıya İKİNCİ public POST reddedilir (404) ve satır sayısı 1 kalır (telefon; betik göndermez)',
      !!ph.first && ph.first.post === 201 && ph.second && ph.second.post === 404 && x1.subs === 1, `ilk=${ph.first && ph.first.post} ikinci=${ph.second && ph.second.post} satır=${x1.subs}`);
    const createCall = x1.calls.find((c) => /\/intake-links$/.test(c.path));
    check('X1-c', 'oluşturma gövdesi yalnız scope/expiresAt/maxUses; gönderim yapan uç 0; betik public POST 0',
      !!createCall && JSON.stringify(createCall.bodyKeys) === '["expiresAt","maxUses","scope"]' && !x1.calls.some((c) => c.forbidden) && !x1.calls.some((c) => c.publicSubmit)
        && x1.ev && x1.ev.scriptPublicPostCount === 0 && x1.ev.dispatchEndpointCalled === false,
      `gövde=${createCall && JSON.stringify(createCall.bodyKeys)} · yasak=${x1.calls.filter((c) => c.forbidden).length} · betik POST=${x1.ev && x1.ev.scriptPublicPostCount}`);
    check('X1-d', 'kapanış: aktif kullanıcı 0, aktif dosya 0', x1.activeUsers === 0 && x1.activeCases === 0, `kullanıcı=${x1.activeUsers} dosya=${x1.activeCases}`);

    // ---- X2 GÖNDERİM YOK (owner göndermedi) → ÖLÇÜLEMEYEN; bağlantı REVOKED
    const x2 = await runScenario('x2-no-submit', dir, {}, { EXA_WAIT_MS: '2500' });
    check('X2', 'gönderim yok: E-WAIT ÖLÇÜLEMEYEN, D-3 ÖLÇÜLEMEYEN, bağlantı REVOKED, D-9 PASS, çıkış 3',
      x2.code === 3 && x2.v('E-WAIT') === 'UNMEASURED' && D3.every((id) => x2.v(id) === 'UNMEASURED') && x2.links.length === 1 && x2.links[0].status === 'REVOKED' && x2.v('E-D9') === 'PASS',
      `çıkış=${x2.code} · bağlantı=${x2.links.map((l) => l.status)} · E-D9=${x2.v('E-D9')}`);

    // ---- X3 HONEYPOT: sayfa başarı döner (201) ama satır YOK → koşum X2 ile AYNI sonucu verir (DB'den ayırt edilemez)
    const x3 = await runScenario('x3-honeypot', dir, {}, { EXA_WAIT_MS: '4000' }, { onDisplay: async (tok, rc) => phone(tok, `EXTACC-${rc.runId} sentetik adres`, { hp: 'otomatik-dolduruldu' }) });
    const p3 = x3.phone[0] || {};
    check('X3', 'honeypot: telefon 201 gördü, satır 0, sahte API honeypot düşümü 1; koşum ÖLÇÜLEMEYEN (owner beyanı ile ayrılır)',
      p3.post === 201 && x3.subs === 0 && x3.honeypot === 1 && x3.code === 3 && x3.v('E-WAIT') === 'UNMEASURED' && /AYIRT EDİLEMEZ/.test(x3.o('E-WAIT')),
      `telefon POST=${p3.post} · satır=${x3.subs} · honeypot=${x3.honeypot} · çıkış=${x3.code}`);

    // ---- X4 YANLIŞ METİN: owner işaret metnini yazmadı → E-13 FAIL
    const x4 = await runScenario('x4-wrong-marker', dir, {}, {}, { onDisplay: async (tok) => phone(tok, 'rastgele adres metni') });
    check('X4', 'işaret metni yoksa E-13 FAIL, çıkış 2; kapanış yine tamam', x4.code === 2 && x4.v('E-13') === 'FAIL' && x4.v('E-D9') === 'PASS', `çıkış=${x4.code} · E-13=${x4.v('E-13')}`);

    // ---- X6 GEÇ GÖNDERİM YARIŞI: pencere doldu, iptal isteği sunucuda beklerken telefon gönderir → USED; iptal 400
    const x6 = await runScenario('x6-late-race', dir, { revokeDelay: true }, { EXA_WAIT_MS: '1500' }, {
      onDisplay: async (tok, rc) => {
        for (let i = 0; i < 200; i++) { if ((await ctl('GET', '/__revoke-waiting')).waiting > 0) break; await sleep(50); }
        return phone(tok, `EXTACC-${rc.runId} sentetik adres`);
      } });
    check('X6-a', 'geç gönderim: E-WAIT ÖLÇÜLEMEYEN + E-LATE FAIL; D-3 geç satır üzerinde YİNE ölçüldü (E-10..E-16 PASS)',
      x6.v('E-WAIT') === 'UNMEASURED' && x6.v('E-LATE') === 'FAIL' && ['E-10', 'E-11', 'E-12', 'E-13', 'E-14', 'E-15', 'E-16'].every((id) => x6.v(id) === 'PASS') && x6.code === 2,
      `çıkış=${x6.code} · E-LATE=${x6.v('E-LATE')} · telefon=${JSON.stringify(x6.phone[0])}`);
    check('X6-b', 'yarışta iptal reddi (USED) ele alındı: DB\'de ACTIVE yok, D-9 PASS, kurtarma gerekmedi',
      x6.links.length === 1 && x6.links[0].status === 'USED' && x6.v('U-REV-DB') === 'PASS' && x6.v('E-D9') === 'PASS' && x6.ev && x6.ev.recovery && !x6.ev.recovery.gerekli,
      `bağlantı=${x6.links.map((l) => l.status)} · U-REV-DB=${x6.v('U-REV-DB')} · gözlem=${x6.o('U-REV-DB').slice(0, 90)}`);

    // ---- X7 503: gösterimden önce 503 → koşum DURUR, adres gösterilmez, neden UNKNOWN (Redis yazılmaz)
    const x7 = await runScenario('x7-503', dir, { public: '503' }, {});
    const t7 = JSON.stringify(x7.ev || {}) + x7.log;
    check('X7', '503: gösterim YOK, E-03L ÖLÇÜLEMEYEN "neden UNKNOWN", bağlantı REVOKED, "Redis" yazılmadı, çıkış 3',
      x7.code === 3 && x7.ev && x7.ev.displayed === false && /UNKNOWN/.test(x7.o('E-03L')) && !/redis/i.test(t7) && x7.links.every((l) => l.status === 'REVOKED'),
      `çıkış=${x7.code} · gösterildi=${x7.ev && x7.ev.displayed} · bağlantı=${x7.links.map((l) => l.status)}`);

    // ---- X8 OLUŞTURMA ZAMAN AŞIMI (R03 güvencesi): kayıt oluştu, yanıt yok → E-01 ÖLÇÜLEMEYEN, kayıt bulunup iptal
    const x8 = await runScenario('x8-create-timeout', dir, { create: 'timeout' }, { EXA_CREATE_TIMEOUT_MS: '2500' });
    check('X8', 'oluşturma zaman aşımı: E-01 ÖLÇÜLEMEYEN, gösterim yok, kayıt kapanışta bulundu ve REVOKED, çıkış 3',
      x8.code === 3 && x8.v('E-01') === 'UNMEASURED' && x8.ev && x8.ev.displayed === false && x8.links.length === 1 && x8.links[0].status === 'REVOKED' && x8.v('U-REV-DB') === 'PASS',
      `çıkış=${x8.code} · bağlantı=${x8.links.map((l) => l.status)}`);

    // ---- X9 MAKBUZ YAZILAMIYOR (R03): oturum/oluşturma yok, kurulum kapatılır, çıkış 1
    const nod = path.join(dir, 'yok', 'alt');
    const x9 = await runScenario('x9-receipt-fail', dir, {}, { EXA_RECEIPT: path.join(nod, 'r.json') });
    check('X9', 'makbuz yazılamazsa login 0, oluşturma 0, kurulum kapatıldı, çıkış 1',
      x9.code === 1 && !x9.calls.some((c) => /auth\/login|intake-links$/.test(c.path)) && x9.activeUsers === 0 && x9.activeCases === 0, `çıkış=${x9.code} · çağrı=${x9.calls.length}`);

    // ---- X10 KANIT YAZILAMIYOR (R03): 0/3 yerine 7
    const x10 = await runScenario('x10-evidence-fail', dir, {}, { EXA_WAIT_MS: '1500', EXA_EVID_FILE: path.join(nod, 'e.json') });
    check('X10', 'sonuç kanıtı yazılamazsa çıkış 7; kapanış yine tamam', x10.code === 7 && x10.links.every((l) => l.status === 'REVOKED') && x10.activeUsers === 0, `çıkış=${x10.code}`);

    // ---- X11 İPTAL HATASI + gönderim yok → 6 → Recover → 0
    const x11 = await runScenario('x11-revoke-fail', dir, { revoke: 'fail' }, { EXA_WAIT_MS: '1500' });
    check('X11-a', 'iptal başarısız: çıkış 6, bağlantı ACTIVE ölçüldü, D-9 FAIL, kurtarma talimatı var',
      x11.code === 6 && x11.links[0] && x11.links[0].status === 'ACTIVE' && x11.v('E-D9') === 'FAIL' && x11.ev && x11.ev.recovery && x11.ev.recovery.gerekli, `çıkış=${x11.code} · bağlantı=${x11.links.map((l) => l.status)}`);
    const r11 = await recover(x11, dir, 'x11-recover');
    check('X11-b', 'Recover: bağlantı REVOKED, kullanıcılar pasif, çıkış 0', r11.code === 0 && r11.links.every((l) => l.status === 'REVOKED') && r11.activeUsers === 0, `çıkış=${r11.code}`);

    // ---- X12 YANLIŞ BAĞLANTI: sunucu gönderimi başka müvekkile yazarsa E-11 FAIL
    const x12 = await runScenario('x12-misbind', dir, {}, {}, { onDisplay: async (tok, rc) => {
      const other = await prisma.client.findFirst({ where: { tenantId: rc.tenantId, id: { not: rc.clientId } }, select: { id: true } });
      await ctl('POST', '/__scenario', { submitClientOverride: other.id });
      return phone(tok, `EXTACC-${rc.runId} sentetik adres`);
    } });
    check('X12', 'gönderim başka müvekkile bağlanırsa E-11 FAIL, çıkış 2', x12.code === 2 && x12.v('E-11') === 'FAIL', `çıkış=${x12.code} · E-11=${x12.o('E-11')}`);

    // ---- X13/X14 KAPILAR — yazma yok
    const x13 = await runScenario('x13-display-none-live', dir, {}, { EXA_EXPECT_DB: 'hukuk_db' });
    check('X13', 'EXA_DISPLAY=none canlı DB adıyla reddedilir (çıkış 4) ve DB\'ye yazılmaz', x13.code === 4 && !x13.tenant, `çıkış=${x13.code} · tenant=${x13.tenant ? 'OLUŞTU' : 'yok'}`);
    const x14 = await runScenario('x14-tls-off', dir, {}, { NODE_TLS_REJECT_UNAUTHORIZED: '0' });
    check('X14', 'TLS doğrulaması kapalıysa durur (1) ve yazmaz', x14.code === 1 && !x14.tenant, `çıkış=${x14.code}`);

    // ---- X15 KONSOLSUZ KOŞUM: EXA_DISPLAY=conout ama konsol yok → HİÇBİR yazmadan çıkış 4 (adres başka kanala düşmez)
    const rid15 = hex8(); const pw15 = 'EXT!' + crypto.randomBytes(12).toString('base64url'); secretsSeen.add(pw15);
    const env15 = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      EXA_MODE: 'run', EXA_LIVE_CONFIRM: '1', EXA_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-20260927-R99', EXA_RUNID: rid15, EXA_EXPECT_DB: 'ah_h5_test',
      EXA_EXPECT_TENANT_SLUG: `ah-${rid15}`, EXA_API_BASE: API, EXA_EXPECT_API: API, EXA_EXPECT_BASE_URL: EXT, EXA_LIVE_LOGIN_PW: pw15,
      EXA_RECEIPT: path.join(dir, 'x15-receipt.json'), EXA_EVID_FILE: path.join(dir, 'x15-evidence.json'), EXA_DISPLAY: 'conout' });
    const r15 = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env: env15, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => res({ code: x, log: l })); });
    fs.writeFileSync(path.join(dir, 'x15.log'), r15.log, 'utf8'); artifacts.push(path.join(dir, 'x15.log'));
    const t15 = await prisma.tenant.findFirst({ where: { slug: `ah-${rid15}` }, select: { id: true } });
    check('X15', 'konsolsuz süreçte EXA_DISPLAY=conout: çıkış 4, "yerel konsol yok", DB\'ye yazma YOK, makbuz YOK',
      r15.code === 4 && /yerel konsol yok/.test(r15.log) && !t15 && !fs.existsSync(path.join(dir, 'x15-receipt.json')), `çıkış=${r15.code} · tenant=${t15 ? 'OLUŞTU' : 'yok'}`);

    // ---- S-1 SIR/IP SIZINTISI — tüm log + makbuz + kanıt
    const ipHash = crypto.createHash('sha256').update(PHONE_IP).digest('hex');
    [PHONE_IP, ipHash].forEach((s) => secretsSeen.add(s));
    let scanned = 0; const leaks = [];
    for (const f of artifacts) {
      if (!fs.existsSync(f)) continue; const t = fs.readFileSync(f, 'utf8'); scanned++;
      for (const s of secretsSeen) if (s && t.includes(s)) leaks.push(`${path.basename(f)}:${s === PHONE_IP ? 'HAM-IP' : s === ipHash ? 'ipHash' : s.slice(0, 4) + '…'}`);
      if (/authorization|bearer /i.test(t)) leaks.push(`${path.basename(f)}:Authorization`);
    }
    check('S-1', 'ham token · parola · JWT · DB URL · GO · ham IP · ipHash hiçbir log/makbuz/kanıtta YOK', scanned > 20 && leaks.length === 0 && secretsSeen.size > 15,
      `taranan=${scanned} · aranan=${secretsSeen.size} · sızıntı=${leaks.length ? leaks.join(',') : 'yok'}`);
  } finally { fake.kill(); await prisma.$disconnect().catch(() => {}); }

  // ---- STATİK
  const tree = JSON.parse(execFileSync(process.execPath, [path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-url-selftest-reqtree.js'), RUN], { encoding: 'utf8' }));
  if (fs.existsSync(WRAPPER)) {
    const w = fs.readFileSync(WRAPPER, 'utf8'); const wb = fs.readFileSync(WRAPPER);
    const pinned = [...w.matchAll(/^\s*'([^']+\.js)'\s*=\s*'/gm)].map((m) => m[1].replace(/\\/g, '/')).sort();
    const expectPinned = [...tree, 'client-extacc-intake-chain-r01/scripts/extacc-qr-test.js'].sort();
    check('T-1', 'owner bloğunun pin listesi = koşumun GERÇEKTEN yüklediği governance dosyaları + QR denemesi', JSON.stringify(expectPinned) === JSON.stringify(pinned),
      `yüklenen=${tree.length} (+qr-test) · pinli=${pinned.length} · eksik=${expectPinned.filter((f) => !pinned.includes(f)).join(',') || 'yok'}`);
    check('T-2', 'owner bloğu UTF-8 BOM, `exit $rc`, finally içinde gizli ortam temizliği', wb[0] === 0xef && wb[1] === 0xbb && wb[2] === 0xbf && /\nexit \$rc\s*$/.test(w) && (w.match(/finally\s*\{[^}]*Clear-SecretEnv/g) || []).length >= 3, 'BOM/exit/finally');
    const pre = w.slice(w.indexOf("if ($Mode -eq 'Preflight')"), w.indexOf("elseif ($Mode -eq 'QrTest')"));
    check('T-3', 'Preflight dalı yazmaz ve node/GO çağırmaz', pre.length > 0 && !/Set-Content|Add-Content|New-Item|Read-Host|Invoke-Node|Invoke-RunMode/.test(pre), `dal=${pre.length}`);
    check('T-4', 'Run: EXA_DISPLAY=conout; GO deseni EXTACC; defter koşumdan ÖNCE', /\$env:EXA_DISPLAY = 'conout'/.test(w) && /OWNER-GO-CLIENT-EXTACC-\\d\{8\}-R\\d\{2\}/.test(w)
      && w.indexOf('Add-Content -LiteralPath $GoLedger') > 0 && w.indexOf('Add-Content -LiteralPath $GoLedger') < w.indexOf("$env:EXA_MODE = 'run'"), 'kapılar');
    check('T-5', 'owner bloğu EXA_DISPLAY=none KURMAZ', !/EXA_DISPLAY\s*=\s*'none'/.test(w), 'yok');
    // Canlı dist / .env pinleri H5 bloğundakilerle AYNI olmalı (H5 pinleri h5-pin-selftest.ps1 ile canlıya karşı ölçülür).
    const h5w = fs.readFileSync(path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-owner-live-block.ps1'), 'utf8');
    const pinOf = (s, n) => ((s.match(new RegExp(`\\$${n}\\s*=\\s*'([0-9A-F]{64})'`)) || [])[1] || null);
    check('T-7', 'canlı dist ve .env pinleri H5 bloğuyla eşit (H5 pin testi canlıya karşı doğrular)',
      !!pinOf(w, 'ExpLiveDist') && pinOf(w, 'ExpLiveDist') === pinOf(h5w, 'ExpLiveDist') && pinOf(w, 'ExpEnvSha') === pinOf(h5w, 'ExpEnvSha'),
      `dist=${(pinOf(w, 'ExpLiveDist') || '').slice(0, 12)} env=${(pinOf(w, 'ExpEnvSha') || '').slice(0, 12)}`);
  } else check('T-1', 'owner bloğu mevcut', false, 'yok');
  const src = fs.readFileSync(path.join(HERE, 'extacc-intake-live-run.js'), 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  check('T-6', 'koşum kaynağında public POST ve gönderim yapan uç çağrısı YOK', !/httpJson\('POST',\s*`\$\{[^`]*public\/intake/.test(src) && !/method:\s*'POST'/.test(src) && !/client-intake-links\/case\/\$\{/.test(src), 'kaynak taraması');

  console.log('');
  for (const r of rows) console.log(`${r.sonuc === 'PASS' ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.aciklama}\n        ${r.gozlem}`);
  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(`\nEXTACC R01 ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
  console.log(`  kanıt dizini: ${dir}`);
  console.log('  (disposable DB + sahte API + gerçek TLS; canlı DB/API/DNS/tünel KULLANILMADI)');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); process.exit(2); });
