'use strict';
/*
 * EXTACC D-4 R01 ÖZ-TESTİ — CANLI DB'YE YAZMAZ. Disposable PostgreSQL + sahte portal API (d4-fake-portal-api.js; portal
 * mantığı ürün kaynağından taklit) + gerçek TLS'li sahte dış sunucu. "Telefon" bu testte bir istemci taklididir: geçici
 * parolayı sahte API'nin test ucundan alır (koşucu parolayı hiçbir kanala yazmaz; D4_DISPLAY=none yalnız disposable DB'de).
 *
 * KULLANIM: node d4-selftest.js   (H5T_DB_URL ya da %TEMP%\h5-test-pg.url → 127.0.0.1:5447/ah_h5_test ŞART)
 * ÇIKIŞ   : 0 hepsi PASS · 1 FAIL var · 2 ölçülemedi
 * SINIR   : sahte API ürünün kendisi değildir; ürün guard'ının gerçek davranışı canlı koşumda ölçülür. Konsol davranışı
 *           EXTACC konsol öz-testiyle ölçülür (aynı extacc-display.js).
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');

const HERE = __dirname; const GOV = path.resolve(HERE, '..', '..');
const RUN = path.join(HERE, process.env.D4_T_RUN_OVERRIDE ? path.basename(process.env.D4_T_RUN_OVERRIDE) : 'd4-portal-live-run.js'); // mutant denemesi için
const FAKE = path.join(HERE, 'd4-fake-portal-api.js');
const WRAPPER = path.join(HERE, 'd4-owner-live-block.ps1');
const REL = 'C:\\Development\\HUKUK_YAZILIMI\\HY_W4_RELEASE23\\project';
const PRISMA_ROOT = path.join(REL, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '@prisma', 'client');
const BCRYPT = path.join(REL, 'node_modules', '.pnpm', 'bcrypt@5.1.1', 'node_modules', 'bcrypt');
const API_PORT = 8197; const EXT_PORT = 8455;
const API = `http://127.0.0.1:${API_PORT}/api`; const EXT = `https://localhost:${EXT_PORT}`;
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36';

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

/** Dış HTTPS isteği — test sertifikası AÇIKÇA güvenilir (doğrulama kapatılmaz). */
function httpsReq(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = require('https').request(url, { method, headers, ca: fs.readFileSync(certFile), timeout: 10000 }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { j = null; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('zaman aşımı'))); req.on('error', reject);
    if (body) req.write(body); req.end();
  });
}
/** Telefon taklidi: giriş sayfası GET + portal girişi + dosya listesi (dış HTTPS). */
async function phone(email, password) {
  const h = { 'user-agent': PHONE_UA, 'content-type': 'application/json' };
  const page = await httpsReq('GET', `${EXT}/portal/login`, h);
  const login = await httpsReq('POST', `${EXT}/api/portal/login`, h, JSON.stringify({ email, password }));
  const token = login.body && login.body.token;
  const cases = token ? await httpsReq('GET', `${EXT}/api/portal/cases`, Object.assign({ authorization: `Bearer ${token}` }, h)) : null;
  return { page: page.status, login: login.status, token, cases: cases && cases.status, fileNumbers: cases && Array.isArray(cases.body) ? cases.body.map((c) => c.fileNumber) : null };
}

function runScenario(name, dir, sc, over, hooks = {}) {
  return new Promise(async (resolve) => {
    await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
    const runId = (over && over.D4_RUNID) || hex8(); const pw = 'D4T!' + crypto.randomBytes(12).toString('base64url');
    const go = `OWNER-GO-CLIENT-EXTACC-D4-20000101-R${String(10 + Math.floor(Math.random() * 89))}`;
    const receipt = path.join(dir, `${name}-receipt.json`); const evid = path.join(dir, `${name}-evidence.json`);
    const env = Object.assign({}, process.env, {
      AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      D4_MODE: 'run', D4_LIVE_CONFIRM: '1', D4_LIVE_GO_REF: go, D4_RUNID: runId, D4_EXPECT_DB: 'ah_h5_test',
      D4_EXPECT_TENANT_SLUG: `ah-${runId}`, D4_API_BASE: API, D4_EXPECT_API: API, D4_EXPECT_BASE_URL: EXT,
      D4_LIVE_LOGIN_PW: pw, D4_RECEIPT: receipt, D4_EVID_FILE: evid, D4_DISPLAY: 'none',
      D4_WAIT_MS: '15000', D4_POLL_MS: '300', D4_VIEW_MS: '500', D4_HTTP_TIMEOUT_MS: '5000', D4_CALL_TIMEOUT_MS: '5000', D4_LATE_CREATE_MS: '6000',
    }, over || {});
    for (const k of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']) if (!(over && k in over)) delete env[k];
    [pw, go, DBURL].forEach((s) => secretsSeen.add(s));
    const ch = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; let fired = false; const phoneRes = [];
    const onData = async (c) => {
      log += c;
      if (!fired && /OK\s+P-DISP/.test(log) && hooks.onDisplay) { // yalnız GERÇEK gösterimde (PASS satırı)
        fired = true;
        const sec = await ctl('GET', '/__secrets'); const pp = sec.portalPasswords[sec.portalPasswords.length - 1];
        const rc = fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt, 'utf8')) : null;
        try { phoneRes.push(await hooks.onDisplay(rc, pp)); } catch (e) { phoneRes.push({ error: String(e.message || e) }); }
      }
    };
    ch.stdout.on('data', onData); ch.stderr.on('data', onData);
    ch.on('close', async (code) => {
      fs.writeFileSync(path.join(dir, `${name}.log`), log, 'utf8'); artifacts.push(path.join(dir, `${name}.log`), receipt, evid);
      const sec = await ctl('GET', '/__secrets'); sec.jwts.concat(sec.portalJwts, sec.portalPasswords, sec.loginPasswords).forEach((s) => secretsSeen.add(s));
      const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
      const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
      const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
      const tenant = await prisma.tenant.findFirst({ where: { slug: `ah-${runId}` }, select: { id: true } });
      const rc = fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt, 'utf8')) : null;
      const pu = rc ? await prisma.clientPortalUser.findUnique({ where: { clientId: rc.clientId }, select: { isActive: true, tokenVersion: true, loginCount: true } }) : null;
      const cl = rc ? await prisma.client.findUnique({ where: { id: rc.clientId }, select: { hasPortalAccess: true } }) : null;
      const activeUsers = tenant ? await prisma.user.count({ where: { tenantId: tenant.id, isActive: true } }) : null;
      const activeCases = tenant ? await prisma.case.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }) : null;
      resolve({ runId, code, log, ev, v, o, tenant, receipt, rc, pu, cl, activeUsers, activeCases, phone: phoneRes,
        calls: await ctl('GET', '/__calls'), ext: await ctl('GET', '/__ext') });
    });
  });
}
async function recover(prev, dir, name, sc, receiptOverride, envOver, during) {
  await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
  const pw = 'D4R!' + crypto.randomBytes(12).toString('base64url'); const evid = path.join(dir, `${name}-evidence.json`); secretsSeen.add(pw);
  const env = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
    D4_MODE: 'recover', D4_RECOVER_CONFIRM: '1', D4_RUNID: prev.runId, D4_EXPECT_DB: 'ah_h5_test', D4_API_BASE: API, D4_EXPECT_API: API,
    D4_EXPECT_BASE_URL: EXT, D4_LIVE_LOGIN_PW: pw, D4_RECEIPT: receiptOverride || prev.receipt, D4_EVID_FILE: evid, D4_DISPLAY: 'none', D4_HTTP_TIMEOUT_MS: '5000', D4_CALL_TIMEOUT_MS: '5000',
    D4_POLL_MS: '300', D4_LATE_CREATE_MS: '6000' }, envOver || {});
  // `during`: Recover süreci ÇALIŞIRKEN paralel iş (ör. bekleyen hesap oluşturmayı serbest bırakmak)
  const started = Date.now(); let duringRes = null;
  const code = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; });
    if (during) during().then((r) => { duringRes = Object.assign({ atMs: Date.now() - started }, r); }).catch((e) => { duringRes = { error: String(e) }; });
    c.on('close', (x) => { fs.writeFileSync(path.join(dir, `${name}.log`), l, 'utf8'); res(x); }); });
  artifacts.push(path.join(dir, `${name}.log`), evid);
  const pu = await prisma.clientPortalUser.findUnique({ where: { clientId: prev.rc.clientId }, select: { isActive: true, tokenVersion: true } });
  const cl = await prisma.client.findUnique({ where: { id: prev.rc.clientId }, select: { hasPortalAccess: true } });
  const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
  const sec = await ctl('GET', '/__secrets'); sec.jwts.concat(sec.portalJwts, sec.loginPasswords).forEach((x) => secretsSeen.add(x));
  const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
  const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
  return { code, pu, cl, ev, v, o, duringRes, elapsedMs: Date.now() - started, calls: await ctl('GET', '/__calls'), activeUsers: await prisma.user.count({ where: { tenantId: prev.tenant.id, isActive: true } }) };
}
const phoneFlow = async (rc, pp) => phone(rc.portalEmail, pp);
const CLOSE = ['P-C1', 'P-C2', 'P-C2V', 'P-C3L', 'P-C3D', 'P-C4L', 'P-C4D', 'P-C5', 'U-CLOSE', 'P-D9'];

(async () => {
  DBURL = dbUrl();
  if (!DBURL) { console.log('OLCULEMEDI: disposable DB (127.0.0.1:5447/ah_h5_test) yok — test BAŞLAMADI'); process.exit(2); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd4-selftest-'));
  certFile = path.join(dir, 'cert.pem'); const keyFile = path.join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const { PrismaClient } = require(PRISMA_ROOT); prisma = new PrismaClient({ datasources: { db: { url: DBURL } } });
  const fake = spawn(process.execPath, [FAKE], { env: Object.assign({}, process.env, { D4F_DB_URL: DBURL, D4F_PRISMA_ROOT: PRISMA_ROOT, D4F_BCRYPT: BCRYPT,
    D4F_API_PORT: String(API_PORT), D4F_EXT_PORT: String(EXT_PORT), D4F_CERT: certFile, D4F_KEY: keyFile }), stdio: ['ignore', 'pipe', 'pipe'] });
  let fl = ''; fake.stdout.on('data', (c) => { fl += c; }); fake.stderr.on('data', (c) => { fl += c; });
  for (let i = 0; i < 60 && !fl.includes('hazır'); i++) await sleep(250);
  if (!fl.includes('hazır')) { console.log('OLCULEMEDI: sahte API başlamadı'); fake.kill(); process.exit(2); }
  try {
    // ---- Y1 NORMAL: telefon bir kez girer, yalnız bu koşumun dosyasını görür → kapanışta yeni giriş + MEVCUT oturum reddi
    const y1 = await runScenario('y1-normal', dir, {}, {}, { onDisplay: phoneFlow });
    const all = ['P-00', 'P-01', 'P-02', 'P-03L', 'P-04L', 'P-04D', 'P-05L', 'P-05D', 'P-DISP', 'P-WAIT', ...CLOSE, 'U-ISO'];
    check('Y1-a', 'normal akış: çıkış 0; D-4 + portal kapanış ölçütlerinin tamamı PASS', y1.code === 0 && all.every((id) => y1.v(id) === 'PASS'),
      `çıkış=${y1.code} · PASS olmayan=${all.filter((id) => y1.v(id) !== 'PASS').join(',') || 'yok'}`);
    const ph = y1.phone[0] || {};
    check('Y1-b', 'telefon: giriş sayfası 200, giriş 201, liste 200 ve YALNIZ I3-<runId>', ph.page === 200 && ph.login === 201 && ph.cases === 200 && JSON.stringify(ph.fileNumbers) === JSON.stringify([`I3-${y1.runId}`]),
      `sayfa=${ph.page} giriş=${ph.login} liste=${ph.cases} kayıt=${ph.fileNumbers ? ph.fileNumbers.length : '-'}`);
    const after = ph.token ? await httpsReq('GET', `${EXT}/api/portal/cases`, { authorization: `Bearer ${ph.token}` }) : { status: null };
    check('Y1-c', 'kapanıştan sonra TELEFONUN oturumu da dış uçta 401 (test tarafı bağımsız ölçüm)', after.status === 401, `HTTP ${after.status}`);
    check('Y1-d', 'DB: portal pasif · tokenVersion arttı · erişim bayrağı kapalı · personel pasif · dosya kapalı',
      !!y1.pu && y1.pu.isActive === false && y1.pu.tokenVersion >= 1 && y1.cl.hasPortalAccess === false && y1.activeUsers === 0 && y1.activeCases === 0,
      `portal=${JSON.stringify(y1.pu)} erişim=${y1.cl && y1.cl.hasPortalAccess} kullanıcı=${y1.activeUsers} dosya=${y1.activeCases}`);
    const cu = y1.calls.find((c) => c.path === '/api/portal/admin/create-user');
    check('Y1-e', 'create-user gövdesi yalnız clientId/email/password; yasak portal ucu 0; disable-user çağrıldı; e-posta .invalid',
      !!cu && JSON.stringify(cu.bodyKeys) === '["clientId","email","password"]' && !y1.calls.some((c) => c.forbidden) && y1.calls.some((c) => c.path === '/api/portal/admin/disable-user')
        && y1.ev && y1.ev.forbiddenEndpointCalled === false && /@ah-harness\.invalid$/.test(y1.rc.portalEmail),
      `gövde=${cu && JSON.stringify(cu.bodyKeys)} · yasak=${y1.calls.filter((c) => c.forbidden).length}`);
    check('Y1-f', 'mevcut oturum ölçümü GİRİŞ reddinden AYRI satır; ürün bulgusu yok', y1.v('P-C4L') === 'PASS' && y1.v('P-C3L') === 'PASS' && y1.ev.productFinding === null, `P-C3L=${y1.v('P-C3L')} P-C4L=${y1.v('P-C4L')}`);

    // ---- Y2 TELEFON GİRİŞİ YOK → P-WAIT ÖLÇÜLEMEYEN, kapanış yine tam, çıkış 3
    const y2 = await runScenario('y2-no-login', dir, {}, { D4_WAIT_MS: '2000' });
    check('Y2', 'telefon girişi yok: P-WAIT ÖLÇÜLEMEYEN, kapanış satırları PASS, çıkış 3', y2.code === 3 && y2.v('P-WAIT') === 'UNMEASURED' && CLOSE.every((id) => y2.v(id) === 'PASS'),
      `çıkış=${y2.code} · kapanış PASS olmayan=${CLOSE.filter((id) => y2.v(id) !== 'PASS').join(',') || 'yok'}`);

    // ---- Y3 ÜRÜN KUSURU TAKLİDİ: guard DB'ye bakmıyor → yeni giriş 401 ama MEVCUT oturum 200 → ürün bulgusu, çıkış 6, PASS DEĞİL
    const y3 = await runScenario('y3-stale-session', dir, { guard: 'stale' }, {}, { onDisplay: phoneFlow });
    check('Y3-a', 'mevcut oturum kapanmıyor: yeni giriş 401 (P-C3 PASS) OLSA DA P-C4 FAIL, P-D9 FAIL, çıkış 6',
      y3.code === 6 && y3.v('P-C3L') === 'PASS' && y3.v('P-C3D') === 'PASS' && y3.v('P-C4L') === 'FAIL' && y3.v('P-C4D') === 'FAIL' && y3.v('P-D9') === 'FAIL',
      `çıkış=${y3.code} · P-C3L=${y3.v('P-C3L')} P-C4L=${y3.v('P-C4L')} P-D9=${y3.v('P-D9')}`);
    check('Y3-b', 'kanıtta ÜRÜN BULGUSU metni ve kurtarma notu (Recover bunu düzeltemez)', !!y3.ev && /ÜRÜN BULGUSU/.test(y3.ev.productFinding || '') && y3.ev.recovery.gerekli && /ÜRÜN BULGUSU/.test(y3.ev.recovery.neden.join(' ')),
      `bulgu=${y3.ev && (y3.ev.productFinding || '').slice(0, 60)}`);

    // ---- Y4 DEVRE DIŞI BIRAKMA HATASI → çıkış 6, DB açık → Recover → 0
    const y4 = await runScenario('y4-disable-fail', dir, { disable: 'fail' }, { D4_WAIT_MS: '1500' });
    check('Y4-a', 'disable-user 500: çıkış 6, portal hesabı AKTİF ölçüldü, P-C2 FAIL, kurtarma talimatı',
      y4.code === 6 && y4.pu && y4.pu.isActive === true && y4.v('P-C2') === 'FAIL' && y4.ev && y4.ev.recovery.gerekli, `çıkış=${y4.code} · aktif=${y4.pu && y4.pu.isActive}`);
    const r4 = await recover(y4, dir, 'y4-recover', {});
    check('Y4-b', 'Recover: portal pasif, erişim kapalı, sürüm arttı, yeni giriş 401; mevcut oturum ÖLÇÜLEMEYEN → çıkış 3 (0 DEĞİL); kabul ölçütü koşulmadı',
      r4.code === 3 && r4.pu.isActive === false && r4.cl.hasPortalAccess === false && r4.activeUsers === 0 && r4.v('P-C2V') === 'PASS' && r4.v('P-C3L') === 'PASS' && r4.v('P-C3D') === 'PASS'
        && r4.v('P-C4L') === 'UNMEASURED' && r4.v('P-C4D') === 'UNMEASURED' && r4.ev && !r4.ev.results.some((r) => /^P-0|P-WAIT|P-DISP/.test(r.id)),
      `çıkış=${r4.code} · portal=${JSON.stringify(r4.pu)} · P-C2V=${r4.v('P-C2V')} P-C3L=${r4.v('P-C3L')} P-C4L=${r4.v('P-C4L')}`);

    // ---- Y5 disable ilk denemede 500 → tek yeniden deneme başarılı
    const y5 = await runScenario('y5-disable-once', dir, { disable: 'failOnce' }, { D4_WAIT_MS: '1500' });
    check('Y5', 'disable-user bir kez 500 → yeniden deneme 201; kapanış PASS, çıkış 3 (telefon yok)',
      y5.code === 3 && y5.v('P-C1') === 'PASS' && /HTTP 500.*HTTP 201/.test(y5.o('P-C1')) && y5.v('P-D9') === 'PASS', `çıkış=${y5.code} · ${y5.o('P-C1')}`);

    // ---- Y6 KAPSAM SIZINTISI: liste başka dosyaları da döndürürse gösterim YOK, çıkış 2
    const y6 = await runScenario('y6-case-leak', dir, { cases: 'leak' }, {}, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Y6', 'dosya listesi yalnız bu koşumun dosyası değilse P-04L FAIL, gösterim YOK, kapanış PASS, çıkış 2',
      y6.code === 2 && y6.v('P-04L') === 'FAIL' && y6.ev.displayed === false && y6.phone.length === 0 && y6.v('P-D9') === 'PASS', `çıkış=${y6.code} · ${y6.o('P-04L')}`);

    // ---- Y7 DIŞ 503: neden UNKNOWN, gösterim YOK, çıkış 3
    const y7 = await runScenario('y7-ext-503', dir, { ext: '503' }, {});
    check('Y7', 'dış uç 503: P-04D ÖLÇÜLEMEYEN "UNKNOWN", gösterim yok, DB kapanışı PASS ama dış kapanış ÖLÇÜLEMEDİ → çıkış 6',
      y7.ev && y7.ev.displayed === false && y7.v('P-04D') === 'UNMEASURED' && /UNKNOWN/.test(y7.o('P-04D')) && y7.v('P-C2') === 'PASS' && y7.v('P-C3D') === 'UNMEASURED' && y7.code === 6,
      `çıkış=${y7.code} · P-04D=${y7.v('P-04D')} · P-C3D=${y7.v('P-C3D')}`);

    // ---- Y8 create-user 500 → hesap yok, gösterim yok, çıkış 2
    const y8 = await runScenario('y8-create-fail', dir, { create: 'fail' }, {});
    check('Y8', 'create-user 500 (sonuç belirsiz): gösterim yok; hesap bekleme süresince görülmedi → "hiç açılmadı" DENMEZ, P-C1 ÖLÇÜLEMEYEN, çıkış 6, kurtarma notu',
      y8.code === 6 && y8.v('P-01') === 'FAIL' && y8.ev.displayed === false && !y8.pu && y8.v('P-C1') === 'UNMEASURED' && /DIŞLANAMADI/.test(y8.o('P-C1'))
        && y8.ev.recovery.gerekli && /geç oluşma/.test(y8.ev.recovery.neden.join(' ')) && y8.v('U-CLOSE') === 'PASS', `çıkış=${y8.code} · P-C1=${y8.o('P-C1').slice(0, 80)}`);

    // ---- Y9 MAKBUZ YAZILAMIYOR → hiçbir API çağrısı yok, çıkış 1
    const nod = path.join(dir, 'yok', 'alt');
    const y9 = await runScenario('y9-receipt-fail', dir, {}, { D4_RECEIPT: path.join(nod, 'r.json') });
    check('Y9', 'makbuz yazılamazsa login/create-user 0, kurulum kapatıldı, çıkış 1',
      y9.code === 1 && !y9.calls.some((c) => /auth\/login|create-user/.test(c.path)) && y9.activeUsers === 0 && y9.activeCases === 0, `çıkış=${y9.code} · çağrı=${y9.calls.length}`);
    // ---- Y10 KANIT YAZILAMIYOR → 7
    const y10 = await runScenario('y10-evidence-fail', dir, {}, { D4_WAIT_MS: '1500', D4_EVID_FILE: path.join(nod, 'e.json') });
    check('Y10', 'sonuç kanıtı yazılamazsa çıkış 7; portal kapanışı yine tamam', y10.code === 7 && y10.pu && y10.pu.isActive === false && y10.activeUsers === 0, `çıkış=${y10.code}`);

    // ---- Y11/Y12 KAPILAR — yazma yok
    const y11 = await runScenario('y11-display-none-live', dir, {}, { D4_EXPECT_DB: 'hukuk_db' });
    check('Y11', 'D4_DISPLAY=none canlı DB adıyla reddedilir (çıkış 4), DB\'ye yazılmaz', y11.code === 4 && !y11.tenant, `çıkış=${y11.code}`);
    const y12 = await runScenario('y12-tls-off', dir, {}, { NODE_TLS_REJECT_UNAUTHORIZED: '0' });
    check('Y12', 'TLS doğrulaması kapalıysa durur (1) ve yazmaz', y12.code === 1 && !y12.tenant, `çıkış=${y12.code}`);
    const y12b = await runScenario('y12b-bad-go', dir, {}, { D4_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-20000101-R01' });
    check('Y12b', 'EXTACC (intake) GO\'su D-4 için kabul edilmez (çıkış 3), yazma yok', y12b.code === 3 && !y12b.tenant, `çıkış=${y12b.code}`);

    // ---- Y13 KONSOLSUZ: D4_DISPLAY=conout ama konsol yok → yazmadan 4
    const rid13 = hex8(); const pw13 = 'D4T!' + crypto.randomBytes(12).toString('base64url'); secretsSeen.add(pw13);
    const env13 = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      D4_MODE: 'run', D4_LIVE_CONFIRM: '1', D4_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D4-20000101-R99', D4_RUNID: rid13, D4_EXPECT_DB: 'ah_h5_test',
      D4_EXPECT_TENANT_SLUG: `ah-${rid13}`, D4_API_BASE: API, D4_EXPECT_API: API, D4_EXPECT_BASE_URL: EXT, D4_LIVE_LOGIN_PW: pw13,
      D4_RECEIPT: path.join(dir, 'y13-receipt.json'), D4_EVID_FILE: path.join(dir, 'y13-evidence.json'), D4_DISPLAY: 'conout' });
    const r13 = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env: env13, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => res({ code: x, log: l })); });
    fs.writeFileSync(path.join(dir, 'y13.log'), r13.log, 'utf8'); artifacts.push(path.join(dir, 'y13.log'));
    const t13 = await prisma.tenant.findFirst({ where: { slug: `ah-${rid13}` }, select: { id: true } });
    check('Y13', 'konsolsuz süreçte D4_DISPLAY=conout: çıkış 4, "yerel konsol yok", DB yazma YOK, makbuz YOK',
      r13.code === 4 && /yerel konsol yok/.test(r13.log) && !t13 && !fs.existsSync(path.join(dir, 'y13-receipt.json')), `çıkış=${r13.code}`);


    // ---- Y14 DB KAPANDI, DIŞ KONTROL BAŞARISIZ → Recover: sürüm KENDİSİYLE karşılaştırılmaz, ölçülmeyen HTTP PASS olmaz
    const y14 = await runScenario('y14-db-closed-ext-fail', dir, {}, {}, { onDisplay: async (rc, pp) => { const r = await phone(rc.portalEmail, pp); await ctl('POST', '/__scenario', { ext: '503' }); return r; } });
    const rc14 = y14.rc || {};
    check('Y14-a', 'Run: DB kapandı (P-C2/P-C2V PASS) ama dış kontroller 503 → P-C3D/P-C4D ÖLÇÜLEMEYEN, P-D9 PASS DEĞİL, çıkış 6, kurtarma "DB kapalı ama HTTP reddi doğrulanmadı"',
      y14.code === 6 && y14.v('P-C2') === 'PASS' && y14.v('P-C2V') === 'PASS' && y14.v('P-C3D') === 'UNMEASURED' && y14.v('P-C4D') === 'UNMEASURED' && y14.v('P-D9') === 'FAIL'
        && y14.ev.portalClose.dbClosed === true && y14.ev.portalClose.httpVerified === false && /DB kapalı ama HTTP/.test(y14.ev.recovery.neden.join(' ')) && Number.isInteger(rc14.portalIssuedTokenVersion),
      `çıkış=${y14.code} · P-C3D=${y14.v('P-C3D')} P-C4D=${y14.v('P-C4D')} · makbuz sürümü=${rc14.portalIssuedTokenVersion}`);
    const tv14 = y14.pu ? y14.pu.tokenVersion : null;
    const r14 = await recover(y14, dir, 'y14-recover', {});
    check('Y14-b', 'Recover (zaten kapalı): disable ÇAĞRILMAZ, sürüm ARTMAZ ve makbuzdaki verilme sürümüyle karşılaştırılır (PASS), yeni giriş yerel/dış 401, hesap pasif kalır; mevcut oturum ÖLÇÜLEMEYEN → çıkış 3',
      r14.code === 3 && !r14.calls.some((c) => c.path === '/api/portal/admin/disable-user') && r14.pu.tokenVersion === tv14 && r14.v('P-C2V') === 'PASS' && /verildiği sürüm=/.test(r14.o('P-C2V'))
        && r14.v('P-C3L') === 'PASS' && r14.v('P-C3D') === 'PASS' && r14.v('P-C4L') === 'UNMEASURED' && r14.v('P-C5') === 'PASS' && r14.pu.isActive === false && r14.cl.hasPortalAccess === false
        && r14.ev.versionEvidence && r14.ev.versionEvidence.issuedFromReceipt === rc14.portalIssuedTokenVersion,
      `çıkış=${r14.code} · sürüm ${tv14}→${r14.pu.tokenVersion} · P-C2V=${r14.o('P-C2V')} · P-C4L=${r14.v('P-C4L')}`);
    const noVer = path.join(dir, 'y14-receipt-surumsuz.json'); const rj = Object.assign({}, rc14); delete rj.portalIssuedTokenVersion; fs.writeFileSync(noVer, JSON.stringify(rj), 'utf8'); artifacts.push(noVer);
    const r14b = await recover(y14, dir, 'y14b-recover-surumsuz', {}, noVer);
    check('Y14-c', 'Recover, makbuzda verilme sürümü YOKSA ve hesap zaten kapalıysa: P-C2V ÖLÇÜLEMEYEN (kendisiyle karşılaştırmaz; FAIL/PASS değil), çıkış 3',
      r14b.code === 3 && r14b.v('P-C2V') === 'UNMEASURED' && /kendisiyle karşılaştırılmaz/.test(r14b.o('P-C2V')) && r14b.v('P-C2') === 'PASS', `çıkış=${r14b.code} · P-C2V=${r14b.v('P-C2V')}`);

    // ---- Y15 YANLIŞ PAROLA 201 (sunucu kusuru taklidi) → gösterim YOK, bekleme YOK, kapanış yine çalışır
    const t15 = Date.now();
    const y15 = await runScenario('y15-wrongpw-accepted', dir, { wrongPw: 'acceptAny' }, { D4_WAIT_MS: '60000' }, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Y15', 'yanlış parola 201: P-05L/P-05D FAIL → QR/parola GÖSTERİLMEDİ, telefon BEKLENMEDİ; kapanış PASS; çıkış 2',
      y15.code === 2 && y15.v('P-05L') === 'FAIL' && y15.v('P-05D') === 'FAIL' && y15.ev.displayed === false && y15.phone.length === 0 && y15.v('P-DISP') === 'UNMEASURED'
        && /P-05L/.test(y15.ev.stopped || '') && Date.now() - t15 < 40000 && y15.v('P-D9') === 'PASS' && y15.pu && y15.pu.isActive === false,
      `çıkış=${y15.code} · P-05L=${y15.o('P-05L')} · süre=${Math.round((Date.now() - t15) / 1000)} sn · durdu=${(y15.ev.stopped || '').slice(0, 60)}`);
    // ---- Y16 DIŞ YANLIŞ-PAROLA ÖLÇÜLEMEDİ (dış giriş ucu 503) → gösterim YOK; kapanış dış satırı ÖLÇÜLEMEYEN → PASS değil
    const y16 = await runScenario('y16-ext-login-503', dir, { extLogin: '503' }, { D4_WAIT_MS: '60000' }, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Y16', 'dış yanlış parola ölçülemedi (503): P-05D ÖLÇÜLEMEYEN → gösterim YOK; DB kapandı ama P-C3D ÖLÇÜLEMEYEN → P-D9 PASS değil, çıkış 6',
      y16.code === 6 && y16.v('P-05D') === 'UNMEASURED' && y16.ev.displayed === false && y16.phone.length === 0 && y16.v('P-C2') === 'PASS' && y16.v('P-C3D') === 'UNMEASURED' && y16.v('P-D9') === 'FAIL',
      `çıkış=${y16.code} · P-05D=${y16.o('P-05D')} · P-C3D=${y16.v('P-C3D')}`);

    // ---- Y17 GEÇ OLUŞAN HESAP (yanıt yok, kayıt 3 sn sonra): ilk sorguda YOK → kapanış bekler, görür ve KAPATIR
    const y17 = await runScenario('y17-late-create', dir, { create: 'late' }, { D4_CALL_TIMEOUT_MS: '1500' });
    check('Y17', 'create-user zaman aşımı + kayıt sonradan: P-01 ÖLÇÜLEMEYEN, ilk DB sorgusunda hesap YOK (P-02 FAIL), kapanış geç hesabı GÖRDÜ ve kapattı (DB pasif, yeni giriş 401)',
      y17.v('P-01') === 'UNMEASURED' && y17.v('P-02') === 'FAIL' && /var=false/.test(y17.o('P-02')) && y17.v('P-C1') === 'PASS' && /GÖRÜLDÜ/.test(y17.o('P-C1'))
        && y17.pu && y17.pu.isActive === false && y17.cl.hasPortalAccess === false && y17.v('P-C3L') === 'PASS' && y17.ev.displayed === false && y17.code !== 0,
      `çıkış=${y17.code} · P-02=${y17.o('P-02')} · P-C1=${y17.o('P-C1').slice(0, 90)} · hesap=${JSON.stringify(y17.pu)}`);
    // ---- Y18 KOŞUMDAN SONRA OLUŞAN HESAP: koşum kapanışı "tamam" DEMEZ (6); hesap sonra açılır; Recover kapatır
    const y18 = await runScenario('y18-held-create', dir, { create: 'hold' }, { D4_CALL_TIMEOUT_MS: '1500' });
    const rel = await ctl('POST', '/__release');
    const leaked = y18.rc ? await prisma.clientPortalUser.findUnique({ where: { clientId: y18.rc.clientId }, select: { isActive: true } }) : null;
    check('Y18-a', 'hesap koşum boyunca görünmedi: P-C1 ÖLÇÜLEMEYEN, çıkış 6, kurtarma "geç oluşma"; koşumdan sonra hesap AKTİF oluştu (koşum kapanış iddia ETMEDİ)',
      y18.code === 6 && y18.v('P-C1') === 'UNMEASURED' && y18.ev.recovery.gerekli && /geç oluşma/.test(y18.ev.recovery.neden.join(' ')) && rel.released === 1 && leaked && leaked.isActive === true,
      `çıkış=${y18.code} · serbest=${rel.released} · sonradan hesap aktif=${leaked && leaked.isActive}`);
    const r18 = await recover(y18, dir, 'y18-recover', {});
    check('Y18-b', 'Recover: geç oluşan AKTİF hesap yetkili uçla kapatıldı (disable çağrıldı), sürüm kapanış öncesinden büyük, yeni giriş 401; mevcut oturum ÖLÇÜLEMEYEN → çıkış 3',
      r18.code === 3 && r18.calls.some((c) => c.path === '/api/portal/admin/disable-user') && r18.pu.isActive === false && r18.cl.hasPortalAccess === false && r18.v('P-C2V') === 'PASS'
        && /kapanıştan hemen önceki/.test(r18.o('P-C2V')) && r18.v('P-C3L') === 'PASS' && r18.activeUsers === 0,
      `çıkış=${r18.code} · hesap=${JSON.stringify(r18.pu)} · P-C2V=${r18.o('P-C2V')}`);


    // ---- Y19 HESAP RECOVER BEKLERKEN OLUŞUR: koşum belirsiz (6); Recover başladığında hesap YOK, bekleme sırasında
    // oluşur → Recover bulur, personel oturumunu O AN açar, yetkili uçla kapatır, personeli yeniden kapatır.
    const y19 = await runScenario('y19-create-during-recover', dir, { create: 'hold' }, { D4_CALL_TIMEOUT_MS: '1500', D4_LATE_CREATE_MS: '1500' });
    const rc19 = y19.rc || {};
    const r19 = await recover(y19, dir, 'y19-recover', {}, null, { D4_LATE_CREATE_MS: '15000' }, async () => { await sleep(5000); return ctl('POST', '/__release'); });
    check('Y19', 'Recover başında hesap YOK, bekleme sırasında oluştu → bulundu, personel oturumu o anda açıldı, disable çağrıldı, hesap pasif, personel yeniden pasif; mevcut oturum ÖLÇÜLEMEYEN → çıkış 3',
      y19.code === 6 && rc19.createOutcome === 'uncertain' && r19.duringRes && r19.duringRes.released === 1 && /ilk sorguda YOKTU/.test(r19.o('P-C1'))
        && r19.ev.createEvidence && r19.ev.createEvidence.uncertain === true && r19.calls.some((c) => c.path === '/api/auth/login') && r19.calls.some((c) => c.path === '/api/portal/admin/disable-user')
        && /kapatma için açıldı/.test(r19.o('P-C1')) && r19.pu && r19.pu.isActive === false && r19.cl.hasPortalAccess === false && r19.activeUsers === 0 && r19.v('P-C3L') === 'PASS' && r19.code === 3,
      `koşum=${y19.code} makbuz=${rc19.createOutcome} · serbest@${r19.duringRes && r19.duringRes.atMs} ms · Recover çıkış=${r19.code} · P-C1=${r19.o('P-C1').slice(0, 120)} · hesap=${JSON.stringify(r19.pu)} · personel aktif=${r19.activeUsers}`);

    // ---- Y20 HESAP RECOVER BİTTİKTEN SONRA OLUŞUR: Recover süre dolduğunda kapanış PASS/0 VERMEMİŞ olmalı
    const y20 = await runScenario('y20-create-after-recover', dir, { create: 'hold' }, { D4_CALL_TIMEOUT_MS: '1500', D4_LATE_CREATE_MS: '1500' });
    const r20 = await recover(y20, dir, 'y20-recover', {}, null, { D4_LATE_CREATE_MS: '3000' });
    const rel20 = await ctl('POST', '/__release');
    const acct20 = y20.rc ? await prisma.clientPortalUser.findUnique({ where: { clientId: y20.rc.clientId }, select: { isActive: true } }) : null;
    check('Y20-a', 'hesap Recover bitene kadar YOK: Recover P-C1 ÖLÇÜLEMEYEN, çıkış 6 (0 DEĞİL), recovery.gerekli, "geç oluşma"; sonra hesap AKTİF oluştu (Recover kapanış iddia ETMEMİŞTİ)',
      r20.code === 6 && r20.code !== 0 && r20.v('P-C1') === 'UNMEASURED' && r20.v('P-D9') !== 'PASS' && r20.ev.recovery && r20.ev.recovery.gerekli === true
        && /geç oluşma/.test(r20.ev.recovery.neden.join(' ')) && r20.ev.portalClose && r20.ev.portalClose.ok !== true && rel20.released === 1 && acct20 && acct20.isActive === true,
      `Recover çıkış=${r20.code} · P-C1=${r20.o('P-C1').slice(0, 90)} · gerekli=${r20.ev.recovery && r20.ev.recovery.gerekli} · sonradan hesap aktif=${acct20 && acct20.isActive}`);
    const r20b = await recover(y20, dir, 'y20b-recover', {});
    check('Y20-b', 'ikinci Recover sonradan oluşan aktif hesabı kapatır (çıkış 3; mevcut oturum ölçülemez), personel pasif',
      r20b.code === 3 && r20b.pu.isActive === false && r20b.cl.hasPortalAccess === false && r20b.activeUsers === 0, `çıkış=${r20b.code} · hesap=${JSON.stringify(r20b.pu)}`);

    // ---- S-1 SIR SIZINTISI — geçici portal parolası, personel parolası, JWT'ler, DB URL, GO
    let scanned = 0; const leaks = [];
    for (const f of artifacts) {
      if (!fs.existsSync(f)) continue; const t = fs.readFileSync(f, 'utf8'); scanned++;
      for (const s of secretsSeen) if (s && t.includes(s)) leaks.push(`${path.basename(f)}:${s.slice(0, 4)}…`);
      if (/authorization|bearer /i.test(t)) leaks.push(`${path.basename(f)}:Authorization`);
    }
    const portalPwCount = [...secretsSeen].filter((s) => /^D4p!/.test(String(s))).length;
    const measurePwCount = [...secretsSeen].filter((s) => /^D4r!/.test(String(s))).length;
    check('S-1', 'geçici portal parolası · Recover ölçüm parolası · personel parolası · personel/portal JWT · DB URL · GO hiçbir log/makbuz/kanıtta YOK',
      scanned > 25 && leaks.length === 0 && portalPwCount >= 5 && measurePwCount >= 3, `taranan=${scanned} · aranan=${secretsSeen.size} (portal parolası ${portalPwCount} · Recover ölçüm parolası ${measurePwCount}) · sızıntı=${leaks.length ? leaks.join(',') : 'yok'}`);
  } finally { fake.kill(); await prisma.$disconnect().catch(() => {}); }

  // ---- STATİK
  const EX = require(RUN);
  const src = fs.readFileSync(RUN, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  const pwLines = src.split('\n').filter((l) => /portalPw/.test(l));
  // İzinli kullanım biçimleri (satır başına biri): üretim+addSecret · create-user gövdesi · koşucu girişi gövdesi · yanlış parola
  // türetimi · konsol gösterim satırı · kapanışa kimlik bilgisi aktarımı. Başka her kullanım (log/kanıt/makbuz) FAIL.
  const ALLOWED_PW = [/const portalPw = 'D4p!' \+ crypto\.randomBytes\(12\)\.toString\('base64url'\); addSecret\(portalPw\);/, /\/portal\/admin\/create-user`, \{ token: session\.token, body: \{ clientId: st\.clientId, email: portalEmail, password: portalPw \}/,
    /\/portal\/login`, \{ body: \{ email: portalEmail, password: portalPw \}/, /const wrong = portalPw \+ 'x';/, /`    Parola  : \$\{portalPw\}`/, /creds: createOutcome \? \{ email: portalEmail, password: portalPw \} : null/];
  const badPw = pwLines.filter((l) => !ALLOWED_PW.some((re) => re.test(l)) || /console\.|writeJson|receipt\s*=/.test(l));
  check('T-1', 'geçici parola yalnız: üretim+addSecret, create-user/giriş gövdeleri, yanlış parola türetimi, konsol gösterimi, kapanış kimlik bilgisi — log/kanıt/makbuz yazımında YOK',
    pwLines.length === 6 && badPw.length === 0 && /Parola  : \$\{portalPw\}/.test(src.slice(src.indexOf('DISPLAY.show'), src.indexOf('displayed = true'))),
    `satır=${pwLines.length} · izinsiz=${badPw.length}`);
  check('T-2', 'koşucu kaynağında gönderim yapabilecek portal uçları (forgot/reset/change-password, documents, messages) YOK',
    !EX.FORBIDDEN_PORTAL.some((re) => re.test(src.replace(/FORBIDDEN_PORTAL = \[[^\]]*\]/, ''))), 'kaynak taraması');
  const liveEnv = { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/hukuk_db', D4_EXPECT_DB: 'hukuk_db', D4_WAIT_MS: '1', D4_POLL_MS: '1', D4_VIEW_MS: '1', D4_HTTP_TIMEOUT_MS: '1', D4_CALL_TIMEOUT_MS: '1', D4_LATE_CREATE_MS: '1' };
  const pl = EX.effectiveParams(liveEnv); const pu = EX.effectiveParams(Object.assign({}, liveEnv, { D4_EXPECT_DB: 'baska' }));
  const pt = EX.effectiveParams(Object.assign({}, liveEnv, { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5447/ah_h5_test', D4_EXPECT_DB: 'ah_h5_test' }));
  check('P-1', 'canlı DB: devralınan süre değişkenleri YOK SAYILIR (20 dk bekleme, 5 sn yoklama, 120 sn inceleme, 120 sn geç oluşma bekleme); URL\'den de canlı; test kısa süreleri korur',
    pl.live && Object.keys(EX.LIVE_PARAMS).every((k) => pl[k] === EX.LIVE_PARAMS[k]) && pl.D4_WAIT_MS === 1200000 && pl.D4_VIEW_MS === 120000 && pl.D4_LATE_CREATE_MS === 120000 && pu.live && pu.D4_WAIT_MS === 1200000 && !pt.live && pt.D4_WAIT_MS === 1,
    `canlı=${pl.live}/${pl.D4_WAIT_MS}/${pl.D4_VIEW_MS} · url=${pu.live} · test=${pt.live}/${pt.D4_WAIT_MS}`);
  const g = EX.runGates({ D4_DISPLAY: 'none', D4_EXPECT_DB: 'x', AH_DATABASE_URL: 'postgresql://u:p@h:1/x', D4_API_BASE: 'a', D4_EXPECT_API: 'a', D4_EXPECT_BASE_URL: 'https://ornek.invalid', D4_LIVE_CONFIRM: '1', D4_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D4-20000101-R01', D4_RUNID: 'abcdef12', D4_EXPECT_TENANT_SLUG: 'ah-abcdef12' });
  check('P-2', 'kapılar: doğru D-4 GO + runId + slug kabul; origin yolsuz https', g.code === 0 && g.origin === 'https://ornek.invalid', `kod=${g.code}`);
  if (fs.existsSync(WRAPPER)) {
    const tree = JSON.parse(execFileSync(process.execPath, [path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-url-selftest-reqtree.js'), RUN], { encoding: 'utf8' }));
    const w = fs.readFileSync(WRAPPER, 'utf8'); const wb = fs.readFileSync(WRAPPER);
    const pinned = [...w.matchAll(/^\s*'([^']+\.js)'\s*=\s*'/gm)].map((m) => m[1].replace(/\\/g, '/')).sort();
    const expectPinned = [...tree, 'client-extacc-intake-chain-r01/scripts/extacc-qr-test.js'].sort();
    check('T-3', 'owner bloğunun pin listesi = koşucunun GERÇEKTEN yüklediği governance dosyaları + QR denemesi', JSON.stringify(expectPinned) === JSON.stringify(pinned),
      `yüklenen=${tree.length} (+qr-test) · pinli=${pinned.length} · eksik=${expectPinned.filter((f) => !pinned.includes(f)).join(',') || 'yok'} · fazla=${pinned.filter((f) => !expectPinned.includes(f)).join(',') || 'yok'}`);
    check('T-4', 'owner bloğu UTF-8 BOM, `exit $rc`, finally içinde gizli ortam temizliği', wb[0] === 0xef && wb[1] === 0xbb && wb[2] === 0xbf && /\nexit \$rc\s*$/.test(w) && (w.match(/finally\s*\{[^}]*Clear-SecretEnv/g) || []).length >= 2, 'BOM/exit/finally');
    const pre = w.slice(w.indexOf("if ($Mode -eq 'Preflight')"), w.indexOf("elseif ($Mode -eq 'QrTest')"));
    check('T-5', 'Preflight dalı yazmaz ve node/GO çağırmaz', pre.length > 0 && !/Set-Content|Add-Content|New-Item|Read-Host|Invoke-Node|Invoke-RunMode/.test(pre), `dal=${pre.length}`);
    check('T-6', 'Run: D4_DISPLAY=conout; GO deseni D-4; defter koşumdan ÖNCE; owner bloğu D4_DISPLAY=none KURMAZ',
      /\$env:D4_DISPLAY = 'conout'/.test(w) && /OWNER-GO-CLIENT-EXTACC-D4-\\d\{8\}-R\\d\{2\}/.test(w) && !/D4_DISPLAY\s*=\s*'none'/.test(w)
        && w.indexOf('Add-Content -LiteralPath $GoLedger') > 0 && w.indexOf('Add-Content -LiteralPath $GoLedger') < w.indexOf("$env:D4_MODE = 'run'"), 'kapılar');
    const exw = fs.readFileSync(path.join(GOV, 'client-extacc-intake-chain-r01', 'scripts', 'extacc-owner-live-block.ps1'), 'utf8');
    const pinOf = (s, n) => ((s.match(new RegExp(`\\$${n}\\s*=\\s*'([0-9A-F]{64})'`)) || [])[1] || null);
    check('T-7', 'canlı dist ve .env pinleri EXTACC bloğuyla eşit', !!pinOf(w, 'ExpLiveDist') && pinOf(w, 'ExpLiveDist') === pinOf(exw, 'ExpLiveDist') && pinOf(w, 'ExpEnvSha') === pinOf(exw, 'ExpEnvSha'),
      `dist=${(pinOf(w, 'ExpLiveDist') || '').slice(0, 12)} env=${(pinOf(w, 'ExpEnvSha') || '').slice(0, 12)}`);
  } else check('T-3', 'owner bloğu mevcut', false, 'yok');

  console.log('');
  for (const r of rows) console.log(`${r.sonuc === 'PASS' ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.aciklama}\n        ${r.gozlem}`);
  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(`\nEXTACC D-4 R01 ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
  console.log(`  kanıt dizini: ${dir}`);
  console.log('  (disposable DB + sahte portal API + gerçek TLS; canlı DB/API/DNS/tünel KULLANILMADI)');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); process.exit(2); });
