'use strict';
/*
 * H5-URL ÖZ-TESTİ — CANLI DB'YE YAZMAZ. Disposable PostgreSQL + sahte API + gerçek TLS'li sahte dış sunucu.
 *
 * KULLANIM : node h5-url-selftest.js
 *   H5T_DB_URL (ya da %TEMP%\h5-test-pg.url) disposable DB'yi gösterir; loopback + port 5447 + db `ah_h5_test`
 *   DEĞİLSE test hiç başlamaz (canlıya yanlışlıkla bağlanmayı önler). H5T_PG_CONTAINER trigger senaryosu içindir.
 * ÇIKIŞ    : 0 hepsi PASS · 1 en az bir FAIL · 2 ölçülemedi (ön koşul yok)
 *
 * SINIR    : sahte API ürünün yanıt BİÇİMİNİ taklit eder; ürünün kendi yetki/iş kuralları burada ölçülmez. "Gönderim
 *            yok" iddiasının ürün tarafı kaynaktan doğrulanmıştır (createForClientWorkspace dispatch çağırmaz); bu test
 *            kabul betiğinin gönderim yapan uçları ÇAĞIRMADIĞINI ölçer.
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');

const HERE = __dirname; const GOV = path.resolve(HERE, '..', '..');
const RUN = process.env.H5T_RUN_OVERRIDE ? path.join(HERE, path.basename(process.env.H5T_RUN_OVERRIDE)) : path.join(HERE, 'h5-url-live-run.js'); const FAKE = path.join(HERE, 'h5-fake-api.js');
const WRAPPER = path.join(HERE, 'h5-owner-live-block.ps1');
const REL = 'C:\\Development\\HUKUK_YAZILIMI\\HY_W4_RELEASE23\\project';
const PRISMA_ROOT = path.join(REL, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '@prisma', 'client');
const BCRYPT = path.join(REL, 'node_modules', '.pnpm', 'bcrypt@5.1.1', 'node_modules', 'bcrypt');
const API_PORT = 8196; const EXT_PORT = 8453; const FOREIGN_PORT = 8454;
const API = `http://127.0.0.1:${API_PORT}/api`; const EXT = `https://localhost:${EXT_PORT}`;
const CONTAINER = process.env.H5T_PG_CONTAINER || 'h5-test-pg';

const rows = []; function check(id, desc, ok, obs) { rows.push({ id, sonuc: ok ? 'PASS' : 'FAIL', aciklama: desc, gozlem: obs }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex8 = () => crypto.randomBytes(4).toString('hex');

function dbUrl() {
  const u = process.env.H5T_DB_URL || (fs.existsSync(path.join(os.tmpdir(), 'h5-test-pg.url')) ? fs.readFileSync(path.join(os.tmpdir(), 'h5-test-pg.url'), 'utf8').trim() : '');
  let p; try { p = new URL(u); } catch (e) { return null; }
  if (p.hostname !== '127.0.0.1' || p.port !== '5447' || p.pathname !== '/ah_h5_test') return null;
  return u;
}
async function ctl(method, p, body) {
  const r = await fetch(`http://127.0.0.1:${API_PORT}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
function psql(sql) { return execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'ah_h5_test', '-tAc', sql], { encoding: 'utf8' }).trim(); }

function runScript(env) {
  return new Promise((resolve) => {
    const clean = Object.assign({}, process.env); for (const k of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED']) delete clean[k];
    const ch = spawn(process.execPath, [RUN], { env: Object.assign(clean, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; ch.stdout.on('data', (c) => { out += c; }); ch.stderr.on('data', (c) => { out += c; });
    ch.on('close', (code) => resolve({ code, log: out }));
  });
}

let certFile; let prisma; const allArtifacts = []; const allSecrets = new Set();
async function scenario(name, sc, over, dir) {
  await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', sc);
  const runId = (over && over.H5U_RUNID) || hex8(); const pw = 'H5T!' + crypto.randomBytes(12).toString('base64url'); const go = `OWNER-GO-CLIENT-H5URL-20260927-R${String(10 + Math.floor(Math.random() * 89))}`;
  const receipt = path.join(dir, `${name}-receipt.json`); const evid = path.join(dir, `${name}-evidence.json`);
  const env = Object.assign({
    AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
    H5U_MODE: 'run', H5U_LIVE_CONFIRM: '1', H5U_LIVE_GO_REF: go, H5U_RUNID: runId, H5U_EXPECT_DB: 'ah_h5_test',
    H5U_EXPECT_TENANT_SLUG: `ah-${runId}`, H5U_API_BASE: API, H5U_EXPECT_API: API, H5U_EXPECT_BASE_URL: EXT,
    H5U_LIVE_LOGIN_PW: pw, H5U_RECEIPT: receipt, H5U_EVID_FILE: evid,
    H5U_CREATE_TIMEOUT_MS: '3000', H5U_REVOKE_TIMEOUT_MS: '5000', H5U_LOCAL_TIMEOUT_MS: '5000', H5U_EXTERNAL_TIMEOUT_MS: '5000',
  }, over || {});
  const r = await runScript(env);
  fs.writeFileSync(path.join(dir, `${name}.log`), r.log, 'utf8');
  [pw, go, DBURL].forEach((s) => allSecrets.add(s));
  const sec = await ctl('GET', '/__secrets'); sec.rawTokens.concat(sec.jwts).forEach((s) => allSecrets.add(s));
  allArtifacts.push(path.join(dir, `${name}.log`), receipt, evid);
  const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
  const verdict = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).verdict : null);
  const obs = (id) => (ev && ev.results ? (ev.results.find((x) => x.id === id) || {}).observed || '' : '');
  const tenant = await prisma.tenant.findFirst({ where: { slug: `ah-${runId}` }, select: { id: true } });
  const links = tenant ? await prisma.clientIntakeLink.findMany({ where: { tenantId: tenant.id }, select: { status: true } }) : [];
  const activeUsers = tenant ? await prisma.user.count({ where: { tenantId: tenant.id, isActive: true } }) : null;
  const activeCases = tenant ? await prisma.case.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }) : null;
  return { runId, pw, code: r.code, log: r.log, ev, verdict, obs, tenant, links, activeUsers, activeCases, receipt, evid,
    calls: await ctl('GET', '/__calls'), ext: await ctl('GET', '/__ext'), foreign: await ctl('GET', '/__foreign') };
}
async function recover(prev, dir, name, evidOverride) {
  await ctl('POST', '/__reset'); await ctl('POST', '/__scenario', {});
  const pw = 'H5R!' + crypto.randomBytes(12).toString('base64url'); const evid = evidOverride || path.join(dir, `${name}-evidence.json`);
  const r = await runScript({ AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile,
    H5U_MODE: 'recover', H5U_RECOVER_CONFIRM: '1', H5U_RUNID: prev.runId, H5U_EXPECT_DB: 'ah_h5_test', H5U_API_BASE: API, H5U_EXPECT_API: API,
    H5U_EXPECT_BASE_URL: EXT, H5U_LIVE_LOGIN_PW: pw, H5U_RECEIPT: prev.receipt, H5U_EVID_FILE: evid });
  fs.writeFileSync(path.join(dir, `${name}.log`), r.log, 'utf8'); allSecrets.add(pw);
  const sec = await ctl('GET', '/__secrets'); sec.rawTokens.concat(sec.jwts).forEach((s) => allSecrets.add(s));
  allArtifacts.push(path.join(dir, `${name}.log`), evid);
  const links = await prisma.clientIntakeLink.findMany({ where: { tenantId: prev.tenant.id }, select: { status: true } });
  const activeUsers = await prisma.user.count({ where: { tenantId: prev.tenant.id, isActive: true } });
  const ev = fs.existsSync(evid) ? JSON.parse(fs.readFileSync(evid, 'utf8')) : null;
  return { code: r.code, links, activeUsers, ev, calls: await ctl('GET', '/__calls') };
}

let DBURL; let trig = null;
(async () => {
  DBURL = dbUrl();
  if (!DBURL) { console.log('OLCULEMEDI: disposable DB URL yok ya da loopback/5447/ah_h5_test değil — test BAŞLAMADI'); process.exit(2); }
  for (const p of [PRISMA_ROOT, BCRYPT]) if (!fs.existsSync(p)) { console.log(`OLCULEMEDI: ${p} yok`); process.exit(2); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h5-selftest-'));
  certFile = path.join(dir, 'cert.pem'); const keyFile = path.join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const { PrismaClient } = require(PRISMA_ROOT); prisma = new PrismaClient({ datasources: { db: { url: DBURL } } });
  const fake = spawn(process.execPath, [FAKE], { env: Object.assign({}, process.env, { H5F_DB_URL: DBURL, H5F_PRISMA_ROOT: PRISMA_ROOT, H5F_BCRYPT: BCRYPT,
    H5F_API_PORT: String(API_PORT), H5F_EXT_PORT: String(EXT_PORT), H5F_FOREIGN_PORT: String(FOREIGN_PORT), H5F_CERT: certFile, H5F_KEY: keyFile }), stdio: ['ignore', 'pipe', 'pipe'] });
  let fakeLog = ''; fake.stdout.on('data', (c) => { fakeLog += c; }); fake.stderr.on('data', (c) => { fakeLog += c; });
  for (let i = 0; i < 60 && !fakeLog.includes('hazır'); i++) await sleep(250);
  if (!fakeLog.includes('hazır')) { console.log('OLCULEMEDI: sahte API başlamadı\n' + fakeLog); fake.kill(); process.exit(2); }

  try {
    // ---- T1 NORMAL + GÖNDERİM YOK
    const t1 = await scenario('t1-normal', {}, {}, dir);
    const all = ['U-00', 'U-01', 'U-02', 'U-URL', 'U-03a', 'U-03b-L', 'U-03b-D', 'U-04', 'U-REV-DB', 'U-REV-PUB-L', 'U-REV-PUB-D', 'U-CLOSE', 'U-ISO'];
    check('T1-a', 'normal akış: çıkış 0 ve 13 ölçütün tamamı PASS', t1.code === 0 && all.every((id) => t1.verdict(id) === 'PASS'),
      `çıkış=${t1.code} · PASS olmayan=${all.filter((id) => t1.verdict(id) !== 'PASS').join(',') || 'yok'}`);
    const createCall = t1.calls.find((c) => c.method === 'POST' && /\/intake-links$/.test(c.path));
    check('T1-b', 'oluşturma GÖNDERİMSİZ uçtan: POST /clients/:clientId/cases/:caseId/intake-links, gövde yalnız `scope`',
      !!createCall && /^\/api\/clients\/[^/]+\/cases\/[^/]+\/intake-links$/.test(createCall.path) && JSON.stringify(createCall.bodyKeys) === '["scope"]',
      createCall ? `${createCall.path.replace(/[a-z0-9]{20,}/g, '<id>')} · gövde anahtarları=${JSON.stringify(createCall.bodyKeys)}` : 'çağrı YOK');
    const forbidden = t1.calls.filter((c) => c.forbidden);
    const posts = [...new Set(t1.calls.filter((c) => c.method === 'POST').map((c) => c.path.replace(/\/(clients|cases|client-intake-links)\/[^/]+/g, '/$1/<id>')))].sort();
    const allowed = ['/api/auth/login', '/api/client-intake-links/<id>/revoke', '/api/clients/<id>/cases/<id>/intake-links'];
    check('T2-a', 'GÖNDERİM YAPAN uç HİÇ çağrılmadı (/client-intake-links/case/* ve */create-and-deliver)', forbidden.length === 0, `yasak çağrı=${forbidden.length}`);
    check('T2-b', 'çağrılan POST uçları izinli kümenin ALT kümesi; public SUBMIT (POST) yok', posts.every((p) => allowed.includes(p)), `POST=${posts.join(' | ')}`);
    check('T2-c', 'kanıtta dispatchEndpointCalled=false', t1.ev && t1.ev.dispatchEndpointCalled === false, `değer=${t1.ev && t1.ev.dispatchEndpointCalled}`);
    check('T1-c', 'kapanış sırası: iptal DB\'de REVOKED, kullanıcılar pasif, dosya CLOSED',
      t1.links.length === 1 && t1.links[0].status === 'REVOKED' && t1.activeUsers === 0 && t1.activeCases === 0,
      `bağlantı=${JSON.stringify(t1.links)} · aktif kullanıcı=${t1.activeUsers} · aktif dosya=${t1.activeCases}`);
    const revokeIdx = t1.calls.findIndex((c) => /\/revoke$/.test(c.path)); const lastPub = t1.ext.filter((c) => /\/api\/public\/intake\//.test(c.path)).length;
    check('T1-d', 'dış zincir: sayfa + public API (geçerlilik) + public API (iptal sonrası 404) ölçüldü; yabancı origin 0 istek',
      revokeIdx >= 0 && lastPub === 2 && t1.ext.some((c) => /^\/intake\//.test(c.path)) && t1.foreign.length === 0,
      `dış istek=${t1.ext.length} (public=${lastPub}) · yabancı=${t1.foreign.length}`);

    // ---- T3 OLUŞTURMA ZAMAN AŞIMI — kayıt oluştu, yanıt gelmedi
    const t3 = await scenario('t3-create-timeout', { create: 'timeout' }, {}, dir);
    check('T3-a', 'oluşturma zaman aşımı: kabul ölçütleri ÖLÇÜLEMEYEN, "kayıt oluşmadı" VARSAYILMADI',
      t3.code === 3 && ['U-01', 'U-02', 'U-03a', 'U-04'].every((id) => t3.verdict(id) === 'UNMEASURED') && /OLUŞMUŞ OLABİLİR/.test(t3.obs('U-01')),
      `çıkış=${t3.code} · U-01="${t3.obs('U-01').slice(0, 80)}"`);
    check('T3-b', 'kapanış bu koşumun sentetik kimlikleriyle kaydı BULDU ve yetkili uçla İPTAL etti',
      t3.links.length === 1 && t3.links[0].status === 'REVOKED' && t3.verdict('U-REV-DB') === 'PASS' && t3.activeUsers === 0,
      `bağlantı=${JSON.stringify(t3.links)} · U-REV-DB=${t3.verdict('U-REV-DB')} · aktif kullanıcı=${t3.activeUsers}`);
    check('T3-c', 'ham token alınmadığı için public 404 ÖLÇÜLEMEYEN (uydurulmadı)', t3.verdict('U-REV-PUB-L') === 'UNMEASURED', t3.obs('U-REV-PUB-L').slice(0, 90));

    // ---- T4 BEKLENMEYEN URL — başka origin
    const t4 = await scenario('t4-unexpected-url', { create: 'badurl' }, {}, dir);
    const tokenGets = t4.calls.filter((c) => c.method === 'GET' && /\/public\/intake\//.test(c.path)).length;
    check('T4-a', 'beklenmeyen origin: U-02 ve U-URL FAIL, dış ölçütler ÖLÇÜLEMEYEN, çıkış 2',
      t4.code === 2 && t4.verdict('U-02') === 'FAIL' && t4.verdict('U-URL') === 'FAIL' && ['U-03a', 'U-03b-L', 'U-03b-D'].every((id) => t4.verdict(id) === 'UNMEASURED'),
      `çıkış=${t4.code} · U-02=${t4.verdict('U-02')} · U-URL=${t4.verdict('U-URL')}`);
    check('T4-b', 'token içeren HİÇBİR adrese istek gitmedi (yabancı origin 0, dış 0, yerel public 0)',
      t4.foreign.length === 0 && t4.ext.length === 0 && tokenGets === 0, `yabancı=${t4.foreign.length} · dış=${t4.ext.length} · yerel public=${tokenGets}`);
    check('T4-c', 'URL reddine rağmen bağlantı İPTAL edildi ve kapanış tamamlandı', t4.links.every((l) => l.status === 'REVOKED') && t4.activeUsers === 0,
      `bağlantı=${JSON.stringify(t4.links)} · aktif kullanıcı=${t4.activeUsers}`);

    // ---- T5 İPTAL HATASI → çıkış 6 → KURTARMA
    const t5 = await scenario('t5-revoke-fail', { revoke: 'fail' }, {}, dir);
    const revokeTries = t5.calls.filter((c) => /\/revoke$/.test(c.path)).length;
    check('T5-a', 'iptal hatası: çıkış 6, U-REV-DB FAIL, bağlantı DB\'de ACTIVE (yalan PASS yok)',
      t5.code === 6 && t5.verdict('U-REV-DB') === 'FAIL' && t5.links.length === 1 && t5.links[0].status === 'ACTIVE',
      `çıkış=${t5.code} · bağlantı=${JSON.stringify(t5.links)} · iptal denemesi=${revokeTries}`);
    check('T5-b', 'iptal başarısız olsa da kullanıcı/dosya kapanışı ÇALIŞTI (hata yolunda temizlik)', t5.activeUsers === 0 && t5.activeCases === 0,
      `aktif kullanıcı=${t5.activeUsers} · aktif dosya=${t5.activeCases}`);
    check('T5-c', 'kanıtta ve konsolda somut kurtarma talimatı + makbuz yolu', !!(t5.ev && t5.ev.recovery && t5.ev.recovery.gerekli && t5.ev.recovery.makbuz) && /KURTARMA GEREKLİ/.test(t5.log),
      `recovery.gerekli=${t5.ev && t5.ev.recovery && t5.ev.recovery.gerekli}`);
    const tvBefore = await prisma.user.findMany({ where: { tenantId: t5.tenant.id }, select: { tokenVersion: true } });
    const r5 = await recover(t5, dir, 't5-recover');
    const tvAfter = await prisma.user.findMany({ where: { tenantId: t5.tenant.id }, select: { tokenVersion: true } });
    check('T5-d', 'KURTARMA: bağlantı yetkili uçla REVOKED, kullanıcılar yeniden pasif, çıkış 0; kabul ölçütleri KOŞULMADI',
      r5.code === 0 && r5.links.every((l) => l.status === 'REVOKED') && r5.activeUsers === 0 && r5.calls.some((c) => /\/revoke$/.test(c.path))
        && !r5.calls.some((c) => /\/intake-links$/.test(c.path)),
      `çıkış=${r5.code} · bağlantı=${JSON.stringify(r5.links)} · aktif kullanıcı=${r5.activeUsers}`);
    check('T5-e', 'kurtarmanın geçici erişimi kapanışta geçersiz kılındı (tokenVersion arttı)',
      tvAfter.reduce((a, u) => a + u.tokenVersion, 0) > tvBefore.reduce((a, u) => a + u.tokenVersion, 0), `önce Σ=${tvBefore.reduce((a, u) => a + u.tokenVersion, 0)} · sonra Σ=${tvAfter.reduce((a, u) => a + u.tokenVersion, 0)}`);

    // ---- T6 TEMİZLİK HATASI — DB tetikleyicisi yalnız bu runId'nin kullanıcı güncellemesini reddeder
    const rid6 = hex8(); trig = rid6;
    psql(`CREATE OR REPLACE FUNCTION h5t_block_${rid6}() RETURNS trigger AS $$ BEGIN IF EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = NEW."tenantId" AND t.slug LIKE 'ah-${rid6}%') THEN RAISE EXCEPTION 'H5T enjekte temizlik hatasi'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;`);
    psql(`CREATE TRIGGER h5t_block_${rid6} BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION h5t_block_${rid6}();`);
    const t6 = await scenario('t6-cleanup-fail', {}, { H5U_RUNID: rid6, H5U_EXPECT_TENANT_SLUG: `ah-${rid6}` }, dir);
    check('T6-a', 'temizlik hatası: çıkış 5, iptal ÖNCE yapıldı (U-REV-DB PASS), U-CLOSE FAIL, bağlantı REVOKED',
      t6.code === 5 && t6.verdict('U-REV-DB') === 'PASS' && t6.verdict('U-CLOSE') === 'FAIL' && t6.links.every((l) => l.status === 'REVOKED'),
      `çıkış=${t6.code} · U-CLOSE=${t6.verdict('U-CLOSE')} · bağlantı=${JSON.stringify(t6.links)}`);
    check('T6-b', 'temizlik hatası kanıtta KAYITLI ve kurtarma talimatı üretildi', !!(t6.ev && t6.ev.recovery && t6.ev.recovery.gerekli) && /enjekte/.test(t6.obs('U-CLOSE')),
      t6.obs('U-CLOSE').slice(0, 100));
    psql(`DROP TRIGGER h5t_block_${rid6} ON "User"; DROP FUNCTION h5t_block_${rid6}();`);
    const r6 = await recover(t6, dir, 't6-recover');
    check('T6-c', 'KURTARMA: kullanıcılar pasif, çıkış 0', r6.code === 0 && r6.activeUsers === 0, `çıkış=${r6.code} · aktif kullanıcı=${r6.activeUsers}`);

    // ---- T7 503 — neden teşhis edilmez, PASS sayılmaz
    const t7 = await scenario('t7-503', { public: '503' }, {}, dir);
    const t7txt = JSON.stringify(t7.ev || {});
    check('T7-a', '503: geçerlilik ve iptal-sonrası ölçütleri ÖLÇÜLEMEYEN, çıkış 3', t7.code === 3 && ['U-03b-L', 'U-03b-D', 'U-REV-PUB-L', 'U-REV-PUB-D'].every((id) => t7.verdict(id) === 'UNMEASURED'),
      `çıkış=${t7.code}`);
    check('T7-b', '503 için kanıtsız neden teşhisi YOK ("Redis" geçmiyor)', !/redis/i.test(t7txt) && !/redis/i.test(t7.log), `kanıtta redis=${/redis/i.test(t7txt)} · logda=${/redis/i.test(t7.log)}`);
    check('T7-c', 'public ölçülemese de DB iptali doğrulandı', t7.verdict('U-REV-DB') === 'PASS' && t7.links.every((l) => l.status === 'REVOKED'), `U-REV-DB=${t7.verdict('U-REV-DB')}`);

    // ---- T8 YÖNLENDİRME — izlenmez
    const t8 = await scenario('t8-redirect', { page: 'redirect' }, {}, dir);
    check('T8', 'dış sayfa 302: U-03a FAIL, yönlendirme İZLENMEDİ (hedef origin 0 istek)', t8.verdict('U-03a') === 'FAIL' && t8.foreign.length === 0 && /yönlendirme/.test(t8.obs('U-03a')),
      `U-03a="${t8.obs('U-03a')}" · hedef=${t8.foreign.length}`);

    // ---- T12 GECİKMİŞ OLUŞTURMA (R03 F-1): kayıt, kabul betiğinin kapanış sorgularından SONRA oluşur
    const t12 = await scenario('t12-delayed-create', { create: 'hold' }, {}, dir);
    const t12rc = fs.existsSync(t12.receipt) ? JSON.parse(fs.readFileSync(t12.receipt, 'utf8')) : {};
    check('T12-a', 'oluşturma belirsiz + DB\'de kayıt YOK: iptal DOĞRULANMADI sayılır (çıkış 6), boş sorgu PASS sayılmaz',
      t12.code === 6 && t12.verdict('U-REV-DB') === 'FAIL' && /BELİRSİZ/.test(t12.obs('U-REV-DB')) && t12.links.length === 0,
      `çıkış=${t12.code} · U-REV-DB=${t12.verdict('U-REV-DB')} · koşum sonu DB bağlantı=${t12.links.length}`);
    check('T12-b', 'kurtarma gereksinimi korunur; kullanıcı/dosya kapanışı yine çalıştı; makbuzda oluşturma denemesi işaretli',
      !!(t12.ev && t12.ev.recovery && t12.ev.recovery.gerekli) && t12.activeUsers === 0 && t12.activeCases === 0 && !!t12rc.createAttemptedAt && t12rc.createOutcome === 'uncertain',
      `recovery=${t12.ev && t12.ev.recovery && t12.ev.recovery.gerekli} · aktif kullanıcı=${t12.activeUsers} · makbuz.createOutcome=${t12rc.createOutcome}`);
    const r12a = await recover(t12, dir, 't12-recover-before-release');
    check('T12-c', 'kayıt henüz yokken Recover da iptali KANITLANMIŞ saymaz (çıkış 6)', r12a.code === 6 && r12a.links.length === 0,
      `çıkış=${r12a.code} · bağlantı=${r12a.links.length}`);
    const rel = await ctl('POST', '/__release');
    const t12late = await prisma.clientIntakeLink.findMany({ where: { tenantId: t12.tenant.id }, select: { status: true } });
    check('T12-d', 'bekletilen istek serbest bırakıldı: kayıt kapanıştan SONRA ACTIVE olarak oluştu (senaryo gerçek)',
      rel.released === 1 && t12late.length === 1 && t12late[0].status === 'ACTIVE', `serbest=${rel.released} · bağlantı=${JSON.stringify(t12late)}`);
    const r12b = await recover(t12, dir, 't12-recover-after-release');
    check('T12-e', 'geç oluşan kayıt Recover ile yetkili uçtan İPTAL edildi, çıkış 0', r12b.code === 0 && r12b.links.length === 1 && r12b.links[0].status === 'REVOKED' && r12b.activeUsers === 0,
      `çıkış=${r12b.code} · bağlantı=${JSON.stringify(r12b.links)} · aktif kullanıcı=${r12b.activeUsers}`);

    // ---- T13 MAKBUZ YAZILAMIYOR (R03 F-2): oturum/oluşturma YOK, kurulum yine kapatılır
    const noDir = path.join(dir, 'yok-dizin', 'alt');
    const t13 = await scenario('t13-receipt-write-fail', {}, { H5U_RECEIPT: path.join(noDir, 'receipt.json') }, dir);
    const t13login = t13.calls.filter((c) => /\/auth\/login$/.test(c.path)).length; const t13create = t13.calls.filter((c) => /\/intake-links$/.test(c.path)).length;
    check('T13-a', 'makbuz yazılamazsa oturum açma ve bağlantı oluşturma isteği GÖNDERİLMEZ, çıkış 0 değil (1)',
      t13.code === 1 && t13login === 0 && t13create === 0 && t13.links.length === 0, `çıkış=${t13.code} · login=${t13login} · oluşturma=${t13create} · bağlantı=${t13.links.length}`);
    check('T13-b', 'o ana kadar kurulan sentetik veri kapatıldı; kimlikler kanıtta, hata kayıtlı',
      !!t13.tenant && t13.activeUsers === 0 && t13.activeCases === 0 && !!(t13.ev && t13.ev.receipt && t13.ev.receipt.tenantId) && !!(t13.ev && t13.ev.receiptWriteError),
      `aktif kullanıcı=${t13.activeUsers} · aktif dosya=${t13.activeCases} · kanıtta makbuz=${!!(t13.ev && t13.ev.receipt)}`);

    // ---- T14/T15/T16 SONUÇ KANITI YAZILAMIYOR (R03 F-2)
    const t14 = await scenario('t14-evidence-write-fail', {}, { H5U_EVID_FILE: path.join(noDir, 'evidence.json') }, dir);
    check('T14', 'Run: tüm ölçütler geçse de kanıt yazılamazsa çıkış 7 (0 DEĞİL); kapanış yine tamam',
      t14.code === 7 && !t14.ev && t14.links.every((l) => l.status === 'REVOKED') && t14.activeUsers === 0 && /SONUÇ KANITI YAZILAMADI/.test(t14.log),
      `çıkış=${t14.code} · bağlantı=${JSON.stringify(t14.links)} · aktif kullanıcı=${t14.activeUsers}`);
    const t15 = await scenario('t15-evidence-and-revoke-fail', { revoke: 'fail' }, { H5U_EVID_FILE: path.join(noDir, 'evidence.json') }, dir);
    check('T15-a', 'kanıt yazılamasa da iptal hatasının önceliği KORUNUR (çıkış 6, 7 değil)', t15.code === 6 && t15.links.length === 1 && t15.links[0].status === 'ACTIVE',
      `çıkış=${t15.code} · bağlantı=${JSON.stringify(t15.links)}`);
    const r15 = await recover(t15, dir, 't15-recover');
    check('T15-b', 'kurtarma: bağlantı REVOKED, çıkış 0', r15.code === 0 && r15.links.every((l) => l.status === 'REVOKED'), `çıkış=${r15.code} · bağlantı=${JSON.stringify(r15.links)}`);
    const r16 = await recover(t14, dir, 't16-recover-evidence-fail', path.join(noDir, 'recover-evidence.json'));
    check('T16', 'Recover: kapanış doğrulansa da kanıt yazılamazsa çıkış 7 (0 DEĞİL)', r16.code === 7 && !r16.ev, `çıkış=${r16.code}`);

    // ---- T9/T10 KAPILAR — yazma yok
    const t9 = await scenario('t9-tls-off', {}, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, dir);
    check('T9', 'TLS doğrulaması kapalıysa DURUR (çıkış 1) ve DB\'ye HİÇ yazmaz', t9.code === 1 && !t9.tenant, `çıkış=${t9.code} · tenant=${t9.tenant ? 'OLUŞTU' : 'yok'}`);
    const t10 = await scenario('t10-http-origin', {}, { H5U_EXPECT_BASE_URL: `http://localhost:${EXT_PORT}` }, dir);
    check('T10', 'beklenen taban https değilse DURUR (çıkış 4) ve DB\'ye HİÇ yazmaz', t10.code === 4 && !t10.tenant, `çıkış=${t10.code} · tenant=${t10.tenant ? 'OLUŞTU' : 'yok'}`);

    // ---- T11 SIR SIZINTISI — tüm log + makbuz + kanıt
    let scanned = 0; const leaks = [];
    for (const f of allArtifacts) {
      if (!fs.existsSync(f)) continue; const txt = fs.readFileSync(f, 'utf8'); scanned++;
      for (const s of allSecrets) if (s && txt.includes(s)) leaks.push(`${path.basename(f)}:${s.slice(0, 4)}…`);
      if (/authorization|bearer /i.test(txt)) leaks.push(`${path.basename(f)}:Authorization`);
    }
    check('T11', 'ham token · parola · JWT · DB URL · GO ref · Authorization hiçbir log/makbuz/kanıtta YOK', scanned > 0 && leaks.length === 0 && allSecrets.size > 10,
      `taranan dosya=${scanned} · aranan sır=${allSecrets.size} · sızıntı=${leaks.length ? leaks.join(',') : 'yok'}`);
  } finally {
    if (trig) { try { psql(`DROP TRIGGER IF EXISTS h5t_block_${trig} ON "User"; DROP FUNCTION IF EXISTS h5t_block_${trig}();`); } catch (e) { console.log('UYARI: test tetikleyicisi kaldırılamadı'); } }
    fake.kill(); await prisma.$disconnect().catch(() => {});
  }

  // ---- STATİK
  const tree = JSON.parse(execFileSync(process.execPath, [path.join(HERE, 'h5-url-selftest-reqtree.js'), RUN], { encoding: 'utf8' }));
  const wsrc = fs.readFileSync(WRAPPER, 'utf8');
  const pinned = [...wsrc.matchAll(/^\s*'([^']+\.js)'\s*=\s*'/gm)].map((m) => m[1].replace(/\\/g, '/')).sort();
  check('S-1', 'wrapper bütünlük listesi = koşumun GERÇEKTEN yüklediği governance dosyaları', JSON.stringify(tree) === JSON.stringify(pinned),
    `yüklenen=${tree.length} · pinli=${pinned.length} · eksik=${tree.filter((f) => !pinned.includes(f)).join(',') || 'yok'}`);
  const wbytes = fs.readFileSync(WRAPPER);
  check('S-2', 'wrapper UTF-8 BOM ile başlar (PS 5.1 aksi halde em-dash baytını tırnak sanıp ayrıştıramaz)', wbytes[0] === 0xef && wbytes[1] === 0xbb && wbytes[2] === 0xbf, `ilk bayt=${wbytes.slice(0, 3).toString('hex')}`);
  check('S-3', 'wrapper node çıkış kodunu dışarı taşır (`exit $rc`)', /\nexit \$rc\s*$/.test(wsrc), 'son satır');
  check('S-4', 'gizli ortam değişkenleri `finally` içinde silinir', (wsrc.match(/finally\s*\{[^}]*Clear-SecretEnv/g) || []).length >= 3, `finally+Clear-SecretEnv=${(wsrc.match(/finally\s*\{[^}]*Clear-SecretEnv/g) || []).length}`);
  const pre = wsrc.slice(wsrc.indexOf("if ($Mode -eq 'Preflight')"), wsrc.indexOf("elseif ($Mode -eq 'Run')"));
  check('S-5', 'Preflight dalı HİÇBİR şey yazmaz (Set-Content/Add-Content/New-Item/Read-Host yok)', pre.length > 0 && !/Set-Content|Add-Content|New-Item|Read-Host|Invoke-Node/.test(pre), `dal uzunluğu=${pre.length}`);
  const iLedger = wsrc.indexOf('Add-Content -LiteralPath $GoLedger'); const iRun = wsrc.indexOf("$env:H5U_MODE = 'run'");
  check('S-6', 'GO defterine kayıt koşumdan ÖNCE; tekrar kullanım defter + tüketim kaydı + repo literaliyle reddedilir',
    iLedger > 0 && iLedger < iRun && /DAHA ÖNCE KULLANILDI \(defter\)/.test(wsrc) && /DAHA ÖNCE KULLANILDI \(tüketim kaydı\)/.test(wsrc), `defter@${iLedger} < koşum@${iRun}`);
  check('S-7', 'NODE_OPTIONS / NODE_TLS_REJECT_UNAUTHORIZED / NODE_EXTRA_CA_CERTS varsa durur', /'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS'/.test(wsrc), 'kapı var');
  const rsrc = fs.readFileSync(RUN, 'utf8');
  const code = rsrc.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  check('S-8', 'koşum kaynağında gönderim yapan uca çağrı YOK', !/client-intake-links\/case\/\$\{/.test(code) && !/create-and-deliver`/.test(code), 'httpJson hedefleri');

  console.log('');
  for (const r of rows) console.log(`${r.sonuc === 'PASS' ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.aciklama}\n        ${r.gozlem}`);
  const fail = rows.filter((r) => r.sonuc === 'FAIL').length;
  console.log(`\nH5-URL ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
  console.log(`  kanıt dizini: ${dir}`);
  console.log('  (disposable DB + sahte API + gerçek TLS; canlı DB/API/DNS/tünel KULLANILMADI)');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); process.exit(2); });
