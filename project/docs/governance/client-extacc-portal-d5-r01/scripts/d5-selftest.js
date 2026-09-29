'use strict';
/*
 * EXTACC D-5 R01 ÖZ-TESTİ — CANLI DB'YE YAZMAZ, E-POSTA GÖNDERMEZ. Disposable PostgreSQL + sahte portal API + sahte posta kutusu
 * (d5-fake-portal-api.js) + gerçek TLS'li sahte dış sunucu. "Telefon" bir istemci taklididir: şifremi-unuttum talebini dış uçtan
 * gönderir, "e-postayı" sahte kutudan okur, yeni parolayı koşucunun gösterimsiz test dosyasından (D5_TEST_DISPLAY_SINK; yalnız
 * disposable DB'de) alır, dış uçtan sıfırlar ve giriş yapar.
 *
 * KULLANIM: node d5-selftest.js   (H5T_DB_URL ya da %TEMP%\h5-test-pg.url → 127.0.0.1:5447/ah_h5_test ŞART)
 * ÇIKIŞ   : 0 hepsi PASS · 1 FAIL var · 2 ölçülemedi
 * SINIR   : sahte API ürünün kendisi değildir; ürünün gerçek sıfırlama/hız sınırı/gönderim davranışı canlı koşumda ölçülür.
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');

const HERE = __dirname; const GOV = path.resolve(HERE, '..', '..');
const RUN = path.join(HERE, process.env.D5_T_RUN_OVERRIDE ? path.basename(process.env.D5_T_RUN_OVERRIDE) : 'd5-portal-reset-live-run.js');
const FAKE = path.join(HERE, 'd5-fake-portal-api.js');
const WRAPPER = path.join(HERE, 'd5-owner-live-block.ps1');
const REL = 'C:\\Development\\HUKUK_YAZILIMI\\HY_W4_RELEASE23\\project';
const PRISMA_ROOT = path.join(REL, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '@prisma', 'client');
const BCRYPT = path.join(REL, 'node_modules', '.pnpm', 'bcrypt@5.1.1', 'node_modules', 'bcrypt');
const API_PORT = 8198; const EXT_PORT = 8456;
const API = `http://127.0.0.1:${API_PORT}/api`; const EXT = `https://localhost:${EXT_PORT}`;
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36';
const R27_CAND_DIST = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'; // D-5 canlı ön koşulu: R27 (D5-SEC) dist

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
/** Telefon taklidi adımları (dış HTTPS). */
async function phoneForgot(email) { const page = await httpsReq('GET', `${EXT}/portal/forgot-password`, H); const r = await httpsReq('POST', `${EXT}/api/portal/forgot-password`, H, JSON.stringify({ email })); return { page: page.status, forgot: r.status }; }
async function waitMail(email, ms) { const t0 = Date.now(); for (;;) { const m = (await ctl('GET', '/__mail')).filter((x) => x.to === email); if (m.length) return m[m.length - 1]; if (Date.now() - t0 > ms) return null; await sleep(200); } }
async function waitSinkPw(sink, ms) { const t0 = Date.now(); for (;;) { if (fs.existsSync(sink)) { const m = fs.readFileSync(sink, 'utf8').match(/^\s+(D5n![A-Za-z0-9_-]+)\s*$/m); if (m) return m[1]; } if (Date.now() - t0 > ms) return null; await sleep(200); } }
const tokenOf = (m) => decodeURIComponent((new URL(m.url).hash.match(/#token=(.+)$/) || [])[1] || '');
async function phoneReset(token, password) { const page = await httpsReq('GET', `${EXT}/portal/reset-password`, H); const r = await httpsReq('POST', `${EXT}/api/portal/reset-password`, H, JSON.stringify({ token, password })); return { page: page.status, reset: r.status }; }
async function phoneLogin(email, password) {
  const login = await httpsReq('POST', `${EXT}/api/portal/login`, H, JSON.stringify({ email, password })); const token = login.body && login.body.token;
  const cases = token ? await httpsReq('GET', `${EXT}/api/portal/cases`, Object.assign({ authorization: `Bearer ${token}` }, H)) : null;
  return { login: login.status, token, cases: cases && cases.status, fileNumbers: cases && Array.isArray(cases.body) ? cases.body.map((c) => c.fileNumber) : null };
}
/** Tam telefon akışı: talep → posta → yeni parola (sink) → sıfırla → giriş → aynı bağlantı ikinci kez. */
async function fullPhone(email, sink, opts = {}) {
  const out = {}; Object.assign(out, await phoneForgot(email));
  const m = await waitMail(email, 8000); out.mail = !!m; if (!m) return out;
  const tok = tokenOf(m); secretsSeen.add(tok);
  if (opts.stopAfterForgot) return out;
  const pw = await waitSinkPw(sink, 12000); out.sinkPw = !!pw; if (!pw) return out;
  Object.assign(out, await phoneReset(tok, pw)); if (out.reset !== 201) return out;
  Object.assign(out, await phoneLogin(email, pw));
  const again = await phoneReset(tok, pw + 'z'); out.secondReset = again.reset;
  return out;
}

function runScenario(name, dir, sc, over, hooks = {}) {
  return new Promise(async (resolve) => {
    await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
    const runId = (over && over.D5_RUNID) || hex8(); const pw = 'D5T!' + crypto.randomBytes(12).toString('base64url');
    const go = `OWNER-GO-CLIENT-EXTACC-D5-20000101-R${String(10 + Math.floor(Math.random() * 89))}`;
    const recipient = (over && over.D5_RECIPIENT_EMAIL) || `d5-${runId}@example.com`; // sahte kutu; gerçek gönderim YOK
    const receipt = path.join(dir, `${name}-receipt.json`); const evid = path.join(dir, `${name}-evidence.json`); const sink = path.join(dir, `${name}-display.sink`); sinks.add(sink);
    const env = Object.assign({}, process.env, {
      AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      D5_MODE: 'run', D5_LIVE_CONFIRM: '1', D5_SEND_CONFIRM: '1', D5_LIVE_GO_REF: go, D5_RUNID: runId, D5_EXPECT_DB: 'ah_h5_test',
      D5_EXPECT_TENANT_SLUG: `ah-${runId}`, D5_API_BASE: API, D5_EXPECT_API: API, D5_EXPECT_BASE_URL: EXT, D5_RECIPIENT_EMAIL: recipient,
      D5_LIVE_LOGIN_PW: pw, D5_RECEIPT: receipt, D5_EVID_FILE: evid, D5_DISPLAY: 'none', D5_TEST_DISPLAY_SINK: sink,
      D5_WAIT_MS: '15000', D5_POLL_MS: '300', D5_VIEW_MS: '800', D5_HTTP_TIMEOUT_MS: '5000', D5_CALL_TIMEOUT_MS: '5000', D5_LATE_CREATE_MS: '6000', D5_TOKEN_TTL_MS: '3600000',
    }, over || {});
    for (const k of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']) if (!(over && k in over)) delete env[k];
    [pw, go, DBURL, recipient, recipient.toLowerCase()].forEach((s) => secretsSeen.add(s));
    const ch = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; let fired = false; const phoneRes = []; let hookDone = Promise.resolve();
    const onData = (c) => {
      log += c;
      if (!fired && /OK\s+P5-DISP1/.test(log) && hooks.onDisplay) { fired = true; hookDone = hooks.onDisplay(recipient, sink).then((r) => phoneRes.push(r), (e) => phoneRes.push({ error: String(e.message || e) })); }
    };
    ch.stdout.on('data', onData); ch.stderr.on('data', onData);
    ch.on('close', async (code) => {
      await hookDone; // telefon taklidi koşucudan sonra bitebilir (ör. gelmeyen postayı bekler)
      fs.writeFileSync(path.join(dir, `${name}.log`), log, 'utf8'); artifacts.push(path.join(dir, `${name}.log`), receipt, evid);
      const sec = await ctl('GET', '/__secrets'); Object.values(sec).flat().forEach((s) => secretsSeen.add(s));
      const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
      const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
      const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
      const tenant = await prisma.tenant.findFirst({ where: { slug: `ah-${runId}` }, select: { id: true } });
      const rc = fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt, 'utf8')) : null;
      const pu = rc ? await prisma.clientPortalUser.findUnique({ where: { clientId: rc.clientId }, select: { isActive: true, tokenVersion: true, loginCount: true, resetToken: true, resetTokenExp: true, email: true } }) : null;
      if (pu) { pu.hasToken = pu.resetToken !== null; pu.emailScrubbed = /\.invalid$/i.test(pu.email); delete pu.resetToken; pu.emailIsRecipient = pu.email.toLowerCase() === recipient.toLowerCase(); delete pu.email; }
      const cl = rc ? await prisma.client.findUnique({ where: { id: rc.clientId }, select: { hasPortalAccess: true } }) : null;
      const activeUsers = tenant ? await prisma.user.count({ where: { tenantId: tenant.id, isActive: true } }) : null;
      const activeCases = tenant ? await prisma.case.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }) : null;
      resolve({ runId, recipient, code, log, ev, v, o, tenant, receipt, rc, pu, cl, activeUsers, activeCases, phone: phoneRes, mail: await ctl('GET', '/__mail'), calls: await ctl('GET', '/__calls'), ext: await ctl('GET', '/__ext') });
    });
  });
}
async function recover(prev, dir, name, sc, envOver) {
  await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc || {});
  const pw = 'D5R!' + crypto.randomBytes(12).toString('base64url'); const evid = path.join(dir, `${name}-evidence.json`); secretsSeen.add(pw);
  const env = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
    D5_MODE: 'recover', D5_RECOVER_CONFIRM: '1', D5_RUNID: prev.runId, D5_EXPECT_DB: 'ah_h5_test', D5_API_BASE: API, D5_EXPECT_API: API,
    D5_EXPECT_BASE_URL: EXT, D5_LIVE_LOGIN_PW: pw, D5_RECEIPT: prev.receipt, D5_EVID_FILE: evid, D5_DISPLAY: 'none', D5_HTTP_TIMEOUT_MS: '5000', D5_CALL_TIMEOUT_MS: '5000',
    D5_POLL_MS: '300', D5_LATE_CREATE_MS: '6000' }, envOver || {});
  const code = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => { fs.writeFileSync(path.join(dir, `${name}.log`), l, 'utf8'); res(x); }); });
  artifacts.push(path.join(dir, `${name}.log`), evid);
  const pu = await prisma.clientPortalUser.findUnique({ where: { clientId: prev.rc.clientId }, select: { isActive: true, tokenVersion: true, resetToken: true, email: true } });
  if (pu) { pu.hasToken = pu.resetToken !== null; delete pu.resetToken; pu.emailScrubbed = /\.invalid$/i.test(pu.email); delete pu.email; }
  const cl = await prisma.client.findUnique({ where: { id: prev.rc.clientId }, select: { hasPortalAccess: true } });
  const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
  const sec = await ctl('GET', '/__secrets'); Object.values(sec).flat().forEach((x) => secretsSeen.add(x));
  const v = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
  const o = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
  return { code, pu, cl, ev, v, o, calls: await ctl('GET', '/__calls'), activeUsers: await prisma.user.count({ where: { tenantId: prev.tenant.id, isActive: true } }) };
}
const CLOSE = ['P5-C1', 'P5-C2', 'P5-C-TOKEN', 'P5-C2V', 'P5-C3L', 'P5-C3D', 'P5-C4L', 'P5-C4D', 'P5-C5', 'U-CLOSE', 'P5-D9'];
// Sıfırlama tamamlanmadıysa S1 oturumu yoktur: P5-C4L/C4D ÖLÇÜLEMEYEN kalır (PASS sayılmaz ama kapanışı düşürmez).
const CLOSE_NO_S1 = CLOSE.filter((id) => id !== 'P5-C4L' && id !== 'P5-C4D');
const closedNoS1 = (z) => CLOSE_NO_S1.every((id) => z.v(id) === 'PASS') && z.v('P5-C4L') === 'UNMEASURED' && z.v('P5-C4D') === 'UNMEASURED';
const FLOW = ['P5-GATE', 'P5-00', 'P5-01', 'P5-02', 'P5-03L', 'P5-04D', 'P5-DISP1', 'P5-TOKEN-ISSUED', 'P5-UNKNOWN', 'P5-DISP2', 'P5-CONSUMED', 'P5-WAIT', 'P5-S1-OPEN', 'P5-S1-EXT', 'P5-S0', 'P5-OLDPW', 'P5-SINGLE-USE'];
const fullFlow = (rcpt, sink) => fullPhone(rcpt, sink);

(async () => {
  DBURL = dbUrl();
  if (!DBURL) { console.log('OLCULEMEDI: disposable DB (127.0.0.1:5447/ah_h5_test) yok — test BAŞLAMADI'); process.exit(2); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd5-selftest-'));
  certFile = path.join(dir, 'cert.pem'); const keyFile = path.join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const { PrismaClient } = require(PRISMA_ROOT); prisma = new PrismaClient({ datasources: { db: { url: DBURL } } });
  const fake = spawn(process.execPath, [FAKE], { env: Object.assign({}, process.env, { D5F_DB_URL: DBURL, D5F_PRISMA_ROOT: PRISMA_ROOT, D5F_BCRYPT: BCRYPT,
    D5F_API_PORT: String(API_PORT), D5F_EXT_PORT: String(EXT_PORT), D5F_CERT: certFile, D5F_KEY: keyFile }), stdio: ['ignore', 'pipe', 'pipe'] });
  let fl = ''; fake.stdout.on('data', (c) => { fl += c; }); fake.stderr.on('data', (c) => { fl += c; });
  for (let i = 0; i < 60 && !fl.includes('hazır'); i++) await sleep(250);
  if (!fl.includes('hazır')) { console.log('OLCULEMEDI: sahte API başlamadı'); fake.kill(); process.exit(2); }
  try {
    // ---- Z1 NORMAL: talep → tek "e-posta" → yeni parola → sıfırlama → giriş → aynı bağlantı ikinci kez 400 → kapanış
    const z1 = await runScenario('z1-normal', dir, {}, {}, { onDisplay: fullFlow });
    const all = [...FLOW, ...CLOSE, 'U-ISO'];
    check('Z1-a', 'normal akış: çıkış 0; D-5 + kapanış ölçütlerinin tamamı PASS', z1.code === 0 && all.every((id) => z1.v(id) === 'PASS'), `çıkış=${z1.code} · PASS olmayan=${all.filter((id) => z1.v(id) !== 'PASS').join(',') || 'yok'}`);
    const ph = z1.phone[0] || {};
    check('Z1-b', 'telefon: talep 201, posta geldi, yeni parola alındı, sıfırlama 201, giriş 201, liste 200 YALNIZ I3-<runId>, aynı bağlantı ikinci kez 400',
      ph.forgot === 201 && ph.mail && ph.sinkPw && ph.reset === 201 && ph.login === 201 && ph.cases === 200 && JSON.stringify(ph.fileNumbers) === JSON.stringify([`I3-${z1.runId}`]) && ph.secondReset === 400,
      `talep=${ph.forgot} posta=${ph.mail} parola=${ph.sinkPw} sıfırla=${ph.reset} giriş=${ph.login} liste=${ph.cases} ikinci=${ph.secondReset}`);
    const toR = z1.mail.filter((m) => m.to === z1.recipient); const toInv = z1.mail.filter((m) => /\.invalid$/i.test(m.to));
    check('Z1-c', 'posta: alıcıya TAM 1; `.invalid` adrese 0; bağlantı dış origin + fragment token', toR.length === 1 && toInv.length === 0 && toR[0].url.startsWith(`${EXT}/portal/reset-password#token=`), `alıcı=${toR.length} invalid=${toInv.length} toplam=${z1.mail.length}`);
    const apiForgot = z1.calls.filter((c) => c.path === '/api/portal/forgot-password');
    check('Z1-d', 'koşucu API tarafında forgot-password\'ı YALNIZ .invalid adresle 1 kez çağırdı; yasak uç 0; disable-user çağrıldı; create-user gövdesi clientId/email/password',
      apiForgot.length === 1 && !z1.calls.some((c) => c.forbidden) && z1.calls.some((c) => c.path === '/api/portal/admin/disable-user') && z1.ev.forbiddenEndpointCalled === false
        && JSON.stringify((z1.calls.find((c) => c.path === '/api/portal/admin/create-user') || {}).bodyKeys) === '["clientId","email","password"]', `forgot=${apiForgot.length} yasak=${z1.calls.filter((c) => c.forbidden).length}`);
    check('Z1-e', 'DB: portal pasif · token YOK · sürüm ≥ 2 (sıfırlama +1, kapatma +1) · erişim kapalı · personel pasif · dosya kapalı · adres ezilmedi (owner kararı yok)',
      !!z1.pu && z1.pu.isActive === false && z1.pu.hasToken === false && z1.pu.tokenVersion >= 2 && z1.cl.hasPortalAccess === false && z1.activeUsers === 0 && z1.activeCases === 0 && z1.pu.emailIsRecipient === true,
      `portal=${JSON.stringify(z1.pu)} kullanıcı=${z1.activeUsers} dosya=${z1.activeCases}`);
    const after = ph.token ? await httpsReq('GET', `${EXT}/api/portal/cases`, { authorization: `Bearer ${ph.token}` }) : { status: null };
    check('Z1-f', 'kapanıştan sonra TELEFONUN (sıfırlama sonrası) oturumu dış uçta 401; makbuzda alıcı adresi YOK; kanıtta alıcı GİZLİ', after.status === 401 && z1.rc.portalEmail === '[GİZLİ]' && /GİZLİ/.test(z1.ev.recipient), `HTTP ${after.status} · makbuz=${z1.rc.portalEmail}`);

    // ---- Z2 ADRES KAPISI: aynı alıcı adresi (Z1'in pasif hesabında duruyor) → yazma YOK, çıkış 4, posta 0
    const z2 = await runScenario('z2-recipient-exists', dir, {}, { D5_RECIPIENT_EMAIL: z1.recipient.toUpperCase() }, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z2', 'alıcı adresi mevcut bir portal hesabında (büyük/küçük harf duyarsız): REDDEDİLDİ çıkış 4; tenant/makbuz/posta YOK', z2.code === 4 && !z2.tenant && !z2.rc && z2.mail.length === 0 && z2.phone.length === 0 && /mevcut bir portal hesabına/.test(z2.log), `çıkış=${z2.code}`);

    // ---- Z3 TALEP GELMEDİ + owner ezme kararı: token yok → 2. konsol yok, çıkış 3, posta 0, adres .invalid ile ezildi
    const z3 = await runScenario('z3-no-request-scrub', dir, {}, { D5_WAIT_MS: '2000', D5_SCRUB_RECIPIENT: '1' });
    check('Z3', 'talep gelmedi: P5-TOKEN-ISSUED ÖLÇÜLEMEYEN, 2. konsol GÖSTERİLMEDİ, kapanış PASS (S1 yok → C4 ÖLÇÜLEMEYEN), çıkış 3, posta 0; ezme kararıyla adres .invalid oldu (P5-SCRUB PASS)',
      z3.code === 3 && z3.v('P5-TOKEN-ISSUED') === 'UNMEASURED' && z3.v('P5-DISP2') === 'UNMEASURED' && closedNoS1(z3) && z3.mail.length === 0 && z3.v('P5-SCRUB') === 'PASS' && z3.pu.emailScrubbed === true && z3.pu.emailIsRecipient === false,
      `çıkış=${z3.code} · kapanış PASS olmayan=${CLOSE_NO_S1.filter((id) => z3.v(id) !== 'PASS').join(',') || 'yok'} · C4=${z3.v('P5-C4L')}/${z3.v('P5-C4D')} · ezildi=${z3.pu.emailScrubbed}`);

    // ---- Z4 TALEP VAR, SIFIRLAMA YAPILMADI: token kapanışta iptal (P5-C-TOKEN), çıkış 3
    const z4 = await runScenario('z4-forgot-only', dir, {}, { D5_WAIT_MS: '2500' }, { onDisplay: (r, s) => fullPhone(r, s, { stopAfterForgot: true }) });
    check('Z4', 'talep geldi (token + 1 posta) ama sıfırlama yapılmadı: P5-TOKEN-ISSUED PASS, P5-CONSUMED ÖLÇÜLEMEYEN, kapanış token\'ı SİLDİ (P5-C-TOKEN PASS), çıkış 3',
      z4.code === 3 && z4.v('P5-TOKEN-ISSUED') === 'PASS' && z4.v('P5-UNKNOWN') === 'PASS' && z4.v('P5-CONSUMED') === 'UNMEASURED' && z4.v('P5-C-TOKEN') === 'PASS' && closedNoS1(z4) && z4.pu.hasToken === false && z4.mail.length === 1,
      `çıkış=${z4.code} · token=${z4.pu.hasToken} · posta=${z4.mail.length}`);

    // ---- Z5 ÜRÜN KUSURU TAKLİDİ: sıfırlama token'ı TÜKETMİYOR → aynı bağlantı ikinci kez işe yarar → FAIL, çıkış 2
    const z5 = await runScenario('z5-token-reuse', dir, { reset: 'reuse' }, {}, { onDisplay: fullFlow });
    const p5 = z5.phone[0] || {};
    check('Z5', 'token tüketilmiyor: P5-CONSUMED FAIL (token kaldı) ve telefonun ikinci sıfırlaması 201 → P5-SINGLE-USE FAIL; kapanış yine PASS; çıkış 2',
      z5.code === 2 && z5.v('P5-CONSUMED') === 'FAIL' && /token kaldı=true/.test(z5.o('P5-CONSUMED')) && p5.secondReset === 201 && z5.v('P5-SINGLE-USE') === 'FAIL' && z5.v('P5-D9') === 'PASS',
      `çıkış=${z5.code} · CONSUMED=${z5.o('P5-CONSUMED')} · ikinci=${p5.secondReset} · SINGLE-USE=${z5.v('P5-SINGLE-USE')}`);
    // ---- Z6 KUSUR TAKLİDİ: sıfırlama sürümü ARTIRMIYOR → eski oturum S0 düşmez → P5-CONSUMED + P5-S0 FAIL
    const z6 = await runScenario('z6-no-version-bump', dir, { reset: 'noBump' }, {}, { onDisplay: fullFlow });
    check('Z6', 'sıfırlama tokenVersion artırmıyor: P5-CONSUMED FAIL, sıfırlama ÖNCESİ oturum S0 hâlâ 200 → P5-S0 FAIL, çıkış 2',
      z6.code === 2 && z6.v('P5-CONSUMED') === 'FAIL' && z6.v('P5-S0') === 'FAIL' && /HTTP 200/.test(z6.o('P5-S0')), `çıkış=${z6.code} · S0=${z6.o('P5-S0')}`);

    // ---- Z7 KUSUR TAKLİDİ: kapatma token'ı silmiyor (D5-SEC-R01 öncesi) → P5-C-TOKEN FAIL, DB kapanışı DOĞRULANMADI, çıkış 6 → Recover (düzelmiş üründe) kapatır
    const z7 = await runScenario('z7-disable-keeps-token', dir, { disable: 'keepToken' }, { D5_WAIT_MS: '2500' }, { onDisplay: (r, s) => fullPhone(r, s, { stopAfterForgot: true }) });
    check('Z7-a', 'kapatma token\'ı silmiyor: hesap pasif OLSA DA P5-C-TOKEN FAIL, P5-C5 FAIL, P5-D9 FAIL, çıkış 6, kurtarma notu; e-postadaki bağlantı hâlâ DB\'de',
      z7.code === 6 && z7.pu.isActive === false && z7.pu.hasToken === true && z7.v('P5-C-TOKEN') === 'FAIL' && z7.v('P5-C5') === 'FAIL' && z7.v('P5-D9') === 'FAIL' && z7.ev.recovery.gerekli, `çıkış=${z7.code} · token=${z7.pu.hasToken}`);
    const r7 = await recover(z7, dir, 'z7-recover', {});
    check('Z7-b', 'Recover (hesap zaten pasif): disable çağrılmaz; P5-C-TOKEN yine FAIL (token duruyor) → çıkış 6, 0 DEĞİL (kapanış iddia edilmez)',
      r7.code === 6 && r7.v('P5-C-TOKEN') === 'FAIL' && !r7.calls.some((c) => c.path === '/api/portal/admin/disable-user') && r7.pu.hasToken === true, `çıkış=${r7.code} · token=${r7.pu.hasToken}`);

    // ---- Z8 TALEP YAZILMADI (ürün token üretmedi/posta yok): pencere içinde token yok → çıkış 3
    const z8 = await runScenario('z8-forgot-nowrite', dir, { forgot: 'noWrite' }, { D5_WAIT_MS: '2500' }, { onDisplay: (r, s) => fullPhone(r, s, { stopAfterForgot: true }) });
    check('Z8', 'talep gönderildi ama ürün token yazmadı: telefon 201 aldı, posta 0, P5-TOKEN-ISSUED ÖLÇÜLEMEYEN ("DB\'den ayrılamaz"), çıkış 3',
      z8.code === 3 && (z8.phone[0] || {}).forgot === 201 && z8.mail.length === 0 && z8.v('P5-TOKEN-ISSUED') === 'UNMEASURED' && /ayrılamaz/.test(z8.o('P5-TOKEN-ISSUED')), `çıkış=${z8.code} · posta=${z8.mail.length}`);

    // ---- Z9 KAPILAR — yazma yok, posta yok
    const gates = [
      ['Z9-a', 'D5_SEND_CONFIRM yoksa çıkış 3', { D5_SEND_CONFIRM: '' }, 3],
      ['Z9-b', 'alıcı adresi .invalid ise çıkış 4', { D5_RECIPIENT_EMAIL: 'x@ah-harness.invalid' }, 4],
      ['Z9-c', 'alıcı adresi geçersizse çıkış 4', { D5_RECIPIENT_EMAIL: 'bu-bir-adres-degil' }, 4],
      ['Z9-d', 'D5_DISPLAY=none canlı DB adıyla çıkış 4', { D5_EXPECT_DB: 'hukuk_db' }, 4],
      ['Z9-e', 'D-4 GO biçimi D-5 için reddedilir çıkış 3', { D5_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D4-20000101-R01' }, 3],
      ['Z9-f', 'TLS doğrulaması kapalıysa çıkış 1', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 1],
    ];
    for (const [id, desc, over, exp] of gates) { const z = await runScenario(id.toLowerCase(), dir, {}, over); check(id, `${desc}; tenant/posta YOK`, z.code === exp && !z.tenant && z.mail.length === 0, `çıkış=${z.code}`); }

    // ---- Z10 create-user 500 → hesap yok, gösterim yok, posta yok, P5-C1 ÖLÇÜLEMEYEN, çıkış 6
    const z10 = await runScenario('z10-create-fail', dir, { create: 'fail' }, {}, { onDisplay: async () => ({ displayedButShouldNot: true }) });
    check('Z10', 'create-user 500: gösterim yok, posta 0, hesap görülmedi → P5-C1 ÖLÇÜLEMEYEN, çıkış 6, kurtarma notu', z10.code === 6 && z10.ev.displayed === false && z10.phone.length === 0 && z10.mail.length === 0 && z10.v('P5-C1') === 'UNMEASURED' && z10.ev.recovery.gerekli, `çıkış=${z10.code}`);

    // ---- Z11 KONSOLSUZ conout → yazmadan 4
    const rid11 = hex8(); const pw11 = 'D5T!' + crypto.randomBytes(12).toString('base64url'); secretsSeen.add(pw11);
    const env11 = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
      D5_MODE: 'run', D5_LIVE_CONFIRM: '1', D5_SEND_CONFIRM: '1', D5_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R99', D5_RUNID: rid11, D5_EXPECT_DB: 'ah_h5_test',
      D5_EXPECT_TENANT_SLUG: `ah-${rid11}`, D5_API_BASE: API, D5_EXPECT_API: API, D5_EXPECT_BASE_URL: EXT, D5_LIVE_LOGIN_PW: pw11, D5_RECIPIENT_EMAIL: `d5-${rid11}@example.com`,
      D5_RECEIPT: path.join(dir, 'z11-receipt.json'), D5_EVID_FILE: path.join(dir, 'z11-evidence.json'), D5_DISPLAY: 'conout', D5_TEST_DISPLAY_SINK: path.join(dir, 'z11.sink') });
    const r11 = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env: env11, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => res({ code: x, log: l })); });
    fs.writeFileSync(path.join(dir, 'z11.log'), r11.log, 'utf8'); artifacts.push(path.join(dir, 'z11.log'));
    check('Z11', 'konsolsuz süreçte D5_DISPLAY=conout: çıkış 4, "yerel konsol yok", DB yazma YOK, makbuz YOK, sink YOK', r11.code === 4 && /yerel konsol yok/.test(r11.log) && !(await prisma.tenant.findFirst({ where: { slug: `ah-${rid11}` } })) && !fs.existsSync(path.join(dir, 'z11-receipt.json')) && !fs.existsSync(path.join(dir, 'z11.sink')), `çıkış=${r11.code}`);

    // ---- Z12 MAKBUZ YAZILAMIYOR → API çağrısı yok, çıkış 1
    const z12 = await runScenario('z12-receipt-fail', dir, {}, { D5_RECEIPT: path.join(dir, 'yok', 'alt', 'r.json') });
    check('Z12', 'makbuz yazılamazsa login/create-user 0, posta 0, kurulum kapatıldı, çıkış 1', z12.code === 1 && !z12.calls.some((c) => /auth\/login|create-user/.test(c.path)) && z12.mail.length === 0 && z12.activeUsers === 0, `çıkış=${z12.code}`);

    // ---- S-1 SIR SIZINTISI — alıcı adresi, ham token'lar, yeni/ilk/ölçüm parolaları, JWT'ler, DB URL, GO (sink dosyaları TARAMA DIŞI: bilerek içerir)
    let scanned = 0; const leaks = [];
    for (const f of artifacts) {
      if (!fs.existsSync(f) || sinks.has(f)) continue; const t = fs.readFileSync(f, 'utf8'); scanned++;
      for (const s of secretsSeen) if (s && t.includes(s)) leaks.push(`${path.basename(f)}:${String(s).slice(0, 4)}…`);
      if (/authorization|bearer /i.test(t)) leaks.push(`${path.basename(f)}:Authorization`);
    }
    const nTok = [...secretsSeen].filter((s) => /^[0-9a-f]{64}$/.test(String(s))).length; const nNew = [...secretsSeen].filter((s) => /^D5n!/.test(String(s))).length; const nRcpt = [...secretsSeen].filter((s) => /@example\.com$/.test(String(s))).length;
    check('S-1', 'alıcı adresi · ham sıfırlama token\'ları · yeni parola · ilk parola · Recover ölçüm parolası · personel parolası · JWT · DB URL · GO hiçbir log/makbuz/kanıtta YOK',
      scanned > 25 && leaks.length === 0 && nTok >= 5 && nNew >= 3 && nRcpt >= 10, `taranan=${scanned} · aranan=${secretsSeen.size} (token ${nTok} · yeni parola ${nNew} · alıcı ${nRcpt}) · sızıntı=${leaks.length ? leaks.join(',') : 'yok'}`);
  } finally { fake.kill(); await prisma.$disconnect().catch(() => {}); }

  // ---- STATİK
  const EX = require(RUN);
  const src = fs.readFileSync(RUN, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  const forgotCalls = src.split('\n').filter((l) => /httpJson\(/.test(l) && /forgot-password/.test(l));
  check('T-1', 'koşucu kaynağında reset-password/change-password/documents/messages çağrısı YOK; forgot-password HTTP çağrısı TEK ve yalnız .invalid adresle',
    !EX.FORBIDDEN.some((re) => re.test(src.replace(/FORBIDDEN = \[[^\]]*\]/, ''))) && forgotCalls.length === 1 && /nobody-d5-\$\{runId\}@ah-harness\.invalid/.test(forgotCalls[0]), `forgot çağrı satırı=${forgotCalls.length}`);
  const sinkLines = src.split('\n').filter((l) => /D5_TEST_DISPLAY_SINK/.test(l));
  check('T-2', 'gösterimsiz test dosyası (sink) kaynakta TEK yerde ve yalnız `display === \'none\'` koşuluyla (konsol varken asla)', sinkLines.length === 1 && /g\.display === 'none' && process\.env\.D5_TEST_DISPLAY_SINK/.test(sinkLines[0]) && /if \(con\) return DISPLAY\.show/.test(sinkLines[0]), `satır=${sinkLines.length}`);
  const liveEnv = { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/hukuk_db', D5_EXPECT_DB: 'hukuk_db', D5_WAIT_MS: '1', D5_POLL_MS: '1', D5_VIEW_MS: '1', D5_HTTP_TIMEOUT_MS: '1', D5_CALL_TIMEOUT_MS: '1', D5_LATE_CREATE_MS: '1', D5_TOKEN_TTL_MS: '1' };
  const pl = EX.effectiveParams(liveEnv); const pt = EX.effectiveParams(Object.assign({}, liveEnv, { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5447/ah_h5_test', D5_EXPECT_DB: 'ah_h5_test' }));
  check('P-1', 'canlı DB: devralınan 7 süre değişkeni YOK SAYILIR (20 dk bekleme, 5 sn yoklama, 120 sn inceleme, 1 saat token süresi); test kısa süreleri korur',
    pl.live && Object.keys(EX.LIVE_PARAMS).length === 7 && Object.keys(EX.LIVE_PARAMS).every((k) => pl[k] === EX.LIVE_PARAMS[k]) && pl.D5_WAIT_MS === 1200000 && pl.D5_TOKEN_TTL_MS === 3600000 && !pt.live && pt.D5_WAIT_MS === 1, `canlı=${pl.live}/${pl.D5_WAIT_MS} · test=${pt.live}/${pt.D5_WAIT_MS}`);
  const g = EX.runGates({ D5_DISPLAY: 'none', D5_EXPECT_DB: 'x', AH_DATABASE_URL: 'postgresql://u:p@h:1/x', D5_API_BASE: 'a', D5_EXPECT_API: 'a', D5_EXPECT_BASE_URL: 'https://ornek.invalid', D5_LIVE_CONFIRM: '1', D5_SEND_CONFIRM: '1', D5_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R01', D5_RECIPIENT_EMAIL: 'kisi@example.com', D5_RUNID: 'abcdef12', D5_EXPECT_TENANT_SLUG: 'ah-abcdef12' });
  check('P-2', 'kapılar: doğru D-5 GO + gönderim onayı + geçerli alıcı + runId + slug kabul; origin yolsuz https', g.code === 0 && g.origin === 'https://ornek.invalid', `kod=${g.code}`);
  if (fs.existsSync(WRAPPER)) {
    const tree = JSON.parse(execFileSync(process.execPath, [path.join(GOV, 'client-h5-intake-url-r01', 'scripts', 'h5-url-selftest-reqtree.js'), RUN], { encoding: 'utf8' }));
    const w = fs.readFileSync(WRAPPER, 'utf8'); const wb = fs.readFileSync(WRAPPER);
    const pinned = [...w.matchAll(/^\s*'([^']+\.js)'\s*=\s*'/gm)].map((m) => m[1].replace(/\\/g, '/')).sort();
    const expectPinned = [...tree, 'client-extacc-intake-chain-r01/scripts/extacc-qr-test.js'].sort();
    check('T-3', 'owner bloğunun pin listesi = koşucunun GERÇEKTEN yüklediği governance dosyaları + QR denemesi', JSON.stringify(expectPinned) === JSON.stringify(pinned),
      `yüklenen=${tree.length} (+qr-test) · pinli=${pinned.length} · eksik=${expectPinned.filter((f) => !pinned.includes(f)).join(',') || 'yok'} · fazla=${pinned.filter((f) => !expectPinned.includes(f)).join(',') || 'yok'}`);
    check('T-4', 'owner bloğu UTF-8 BOM, `exit $rc`, finally içinde gizli ortam temizliği', wb[0] === 0xef && wb[1] === 0xbb && wb[2] === 0xbf && /\nexit \$rc\s*$/.test(w) && (w.match(/finally\s*\{[^}]*Clear-SecretEnv/g) || []).length >= 2, 'BOM/exit/finally');
    const pre = w.slice(w.indexOf("if ($Mode -eq 'Preflight')"), w.indexOf("elseif ($Mode -eq 'QrTest')"));
    check('T-5', 'Preflight dalı yazmaz ve node/GO/alıcı sormaz', pre.length > 0 && !/Set-Content|Add-Content|New-Item|Read-Host|Invoke-Node|Invoke-RunMode|Read-Recipient/.test(pre), `dal=${pre.length}`);
    check('T-6', 'Run: D5_DISPLAY=conout; GO deseni D-5; defter koşumdan ÖNCE; D5_DISPLAY=none ve D5_TEST_DISPLAY_SINK KURULMAZ; alıcı adresi hiçbir dosyaya yazılmaz (Set-Content/Add-Content satırlarında geçmez)',
      /\$env:D5_DISPLAY = 'conout'/.test(w) && /OWNER-GO-CLIENT-EXTACC-D5-\\d\{8\}-R\\d\{2\}/.test(w) && !/D5_DISPLAY\s*=\s*'none'/.test(w) && !/\$env:D5_TEST_DISPLAY_SINK\s*=/.test(w)
        && w.indexOf('Add-Content -LiteralPath $GoLedger') > 0 && w.indexOf('Add-Content -LiteralPath $GoLedger') < w.indexOf("$env:D5_MODE = 'run'")
        && !w.split('\n').some((l) => /Set-Content|Add-Content|ConvertTo-Json/.test(l) && /Recipient|D5_RECIPIENT_EMAIL/.test(l)), 'kapılar');
    const exw = fs.readFileSync(path.join(GOV, 'client-extacc-intake-chain-r01', 'scripts', 'extacc-owner-live-block.ps1'), 'utf8');
    const pinOf = (s, n) => ((s.match(new RegExp(`\\$${n}\\s*=\\s*'([0-9A-F]{64})'`)) || [])[1] || null);
    check('T-7', 'canlı dist pini = R27 ADAY dist (D5-SEC ön koşulu; R26 canlı dist ile blok DURUR) · .env pini EXTACC bloğuyla eşit', pinOf(w, 'ExpLiveDist') === R27_CAND_DIST && pinOf(w, 'ExpEnvSha') === pinOf(exw, 'ExpEnvSha'),
      `dist=${(pinOf(w, 'ExpLiveDist') || '').slice(0, 12)} env=${(pinOf(w, 'ExpEnvSha') || '').slice(0, 12)}`);
  } else check('T-3', 'owner bloğu mevcut', false, 'yok');

  console.log('');
  for (const r of rows) console.log(`${r.sonuc}  ${r.id.padEnd(6)} ${r.aciklama}\n        ${r.gozlem}`);
  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(`\nEXTACC D-5 R01 ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
  console.log(`  kanıt dizini: ${dir}`);
  console.log('  (disposable DB + sahte portal API + sahte posta kutusu + gerçek TLS; canlı DB/API/DNS/tünel/e-posta KULLANILMADI)');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); process.exit(2); });
