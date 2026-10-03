'use strict';
/*
 * EXTACC D-7 R01 ÖZ-TESTİ — CANLI DB'YE YAZMAZ, E-POSTA GÖNDERMEZ. Disposable PostgreSQL (127.0.0.1:<5432 dışı port>/<ad>_test; R03) + sahte portal
 * API (d7-fake-portal-api.js; 8200) + gerçek TLS'li sahte dış sunucu (8459). "Telefon" bir istemci taklididir: giriş bilgisini
 * koşucunun gösterimsiz test dosyasından (D7_TEST_DISPLAY_SINK; yalnız disposable DB'de) alır, dış uçtan giriş yapar, mesaj
 * sayfasını/listesini açar, mark-read çağırır (web sayfası gibi), bir mesaj gönderir ve 2. personel yanıtını bekler.
 *
 * KULLANIM: node d7-selftest.js   (D7T_DB_URL → 127.0.0.1:<5432 DIŞI port>/<ad>_test ŞART — R03: port sabit değil, kendi tek kullanımlık
 *           konteyneriniz; `hukuk_db` ve 5432 REDDEDİLİR; %TEMP%\d67-test-pg.url artık OKUNMAZ)
 *           D7T_LIB_ROOT = bağımlılıkları kurulu, canlı OLMAYAN bir checkout'un proje kökü (Prisma istemcisi + bcrypt buradan yüklenir).
 *           Verilmezse bu betiğin bulunduğu checkout'un proje kökü denenir. Canlı yayın ağacı REDDEDİLİR; modül yoksa test başlamaz (çıkış 2).
 * ÇIKIŞ   : 0 hepsi PASS · 1 FAIL var · 2 ölçülemedi
 * SINIR   : sahte API ürünün kendisi değildir; ürünün gerçek mesaj/bildirim/guard davranışı canlı koşumda ölçülür.
 * R03     : Z15 (kurulum ile makbuz arası: ikinci / birinci ek dosya yazması ya da kurulumun kendisi hata verir — arıza disposable DB'ye
 *           senaryonun runId'sine bağlı geçici BEFORE INSERT tetikleyicisiyle verilir, koşucuda test kancası YOK; makbuz VAR → Run kendi kapanışını
 *           koşar, kullanıcılar pasif, dosyalar CLOSED; Recover makbuzu bulur; kanıtta `setup`) · Z16 (Run kapanışında personel oturumu reddi:
 *           401 → tek yeniden giriş + tek yeniden deneme → çıkış 0; 403 → döngü yok; 404 → yeniden giriş yok; yeniden giriş 429 → yeniden deneme
 *           yok; açık portal hesabında koşucu oturumunun 200'ü "ürün bulgusu" DEĞİL; gerçek ürün bulgusu korunur) · Z17/Z18 (Recover adımı ve
 *           kurtarma nedeni birim ölçümü) · C-1 (kanıttaki kurtarma/kapanış metinleri yalnız ölçüleni söyler) · T-9/T-10 (statik: yeniden giriş
 *           yalnız Run'da ve DB'ye yazmaz; makbuz ek dosya yazmalarından ÖNCE).
 * R03-c   : (owner talimatı: kapanış / Recover doğruluğu) Z19-a hesap HTTP ölçümleri sırasında yeniden açılırsa (P7-C2 PASS, P7-C5 FAIL; sahte API
 *           `reopen: afterDisable` + guard bayat) 200 "ürün bulgusu" YAZMAZ, portal satırı st2 değerleriyle "yeniden AÇILDI" der · Z19-b makbuz dosyası
 *           gösterimden sonra YAZILAMAZ hale gelir (yolu klasör olur; uçtan uca, kapatma 500 → çıkış 6): adım uygulanamayan Recover komutunu ÖNERMEZ,
 *           kanıttaki `receipt` yolunu yazar; o nesneden yazılan dosyayla Recover GERÇEKTEN koşar (kimlik bağı OK, kapanış → çıkış 3). Değişen: Z16-e
 *           (dayanak "P7-C2 PASS + P7-C5 PASS"), Z18 (ii) (P7-C5 FAIL'de ürün bulgusu satırı YOK) + (v) birim: setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI
 *           ve makbuz dosyası durumları; C-1 (ürün bulgusu yalnız P7-C2 + P7-C5 PASS iken). `runScenario` çıkış sonrası kanca (`afterExit`) alır.
 *           Z15-d (7c taraması): portal hesabı YOKKEN P7-C1 günlük satırı "kapatıldı" demez (Run + Recover günlükleri).
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

const rows = []; const check = (id, desc, ok, obs) => rows.push({ id, sonuc: ok ? 'PASS' : 'FAIL', aciklama: desc, gozlem: obs });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const hex8 = () => crypto.randomBytes(4).toString('hex');

// R03: disposable DB kendi tek kullanımlık konteynerinden gelir (port sabit DEĞİL). Kapı: yalnız 127.0.0.1 · port var ve 5432 DEĞİL · veritabanı
// adı `_test` ile biter ve `hukuk_db` DEĞİL. Koşucuya beklenen DB adı bu addan verilir (D7_EXPECT_DB).
let DB_NAME = null;
function dbUrl() {
  const u = process.env.D7T_DB_URL || ''; let p; try { p = new URL(u); } catch (e) { return null; }
  let name = ''; try { name = decodeURIComponent(p.pathname.replace(/^\//, '')); } catch (e) { return null; }
  if (p.hostname !== '127.0.0.1' || !p.port || p.port === '5432' || !/^[a-z0-9_]+_test$/.test(name) || name === 'hukuk_db') return null;
  DB_NAME = name; return u;
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
      D7_MODE: 'run', D7_LIVE_CONFIRM: '1', D7_LIVE_GO_REF: go, D7_RUNID: runId, D7_EXPECT_DB: DB_NAME,
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
      if (hooks.afterExit) await hooks.afterExit();   // R03-c: koşucu çıktıktan SONRA, makbuz okunmadan ÖNCE (ör. testin kurduğu klasörü kaldırmak)
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
    D7_MODE: 'recover', D7_RECOVER_CONFIRM: '1', D7_RUNID: prev.runId, D7_EXPECT_DB: DB_NAME, D7_API_BASE: API, D7_EXPECT_API: API,
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
const shouldNot = { onDisplay: async () => ({ displayedButShouldNot: true }) };
/**
 * R03 (a) — KURULUM ARIZASI: disposable DB'ye YALNIZ verilen değere (bu senaryonun runId'sinden türeyen dosya no / slug) bağlı geçici bir
 * BEFORE INSERT tetikleyicisi kurulur; koşucuya test kancası EKLENMEZ (koşucu canlıdakiyle aynı kodu koşar). Tetikleyici senaryodan sonra kaldırılır.
 */
async function withInsertFault(table, column, value, fn) {
  if (!/^[A-Za-z]+$/.test(table) || !/^[A-Za-z]+$/.test(column) || !/^[A-Za-z0-9-]+$/.test(value)) throw new Error('tetikleyici girdisi biçimsiz');
  const name = `d7t_fault_${crypto.randomBytes(4).toString('hex')}`;
  await prisma.$executeRawUnsafe('CREATE OR REPLACE FUNCTION d7t_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF to_jsonb(NEW)->>TG_ARGV[0] = TG_ARGV[1] THEN RAISE EXCEPTION \'D7T kasitli yazma hatasi (%)\', TG_ARGV[1]; END IF; RETURN NEW; END $f$');
  await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION d7t_fail_insert('${column}', '${value}')`);
  try { return await fn(); } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "${table}"`); }
}

(async () => {
  DBURL = dbUrl();
  if (!DBURL) { console.log('OLCULEMEDI: disposable DB (D7T_DB_URL → 127.0.0.1:<5432 dışı port>/<ad>_test; hukuk_db değil) yok — test BAŞLAMADI'); process.exit(2); }
  console.log(`disposable DB: 127.0.0.1:${new URL(DBURL).port}/${DB_NAME}`);
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
      D7_MODE: 'run', D7_LIVE_CONFIRM: '1', D7_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D7-20000101-R99', D7_RUNID: rid11, D7_EXPECT_DB: DB_NAME,
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

    // ==== R03 (a) — KURULUM İLE MAKBUZ ARASI: ek dosya yazması hata verir (disposable DB tetikleyicisi; koşucuda test kancası YOK)
    const EX0 = require(RUN);   // birim ölçümleri için (yalnız dışa açık saf fonksiyonlar; koşucu akışı require ile ÇALIŞMAZ)
    const tenantState = async (slug) => { const t = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } }); if (!t) return null;
      return { users: await prisma.user.count({ where: { tenantId: t.id } }), activeUsers: await prisma.user.count({ where: { tenantId: t.id, isActive: true } }),
        cases: await prisma.case.count({ where: { tenantId: t.id } }), activeCases: await prisma.case.count({ where: { tenantId: t.id, status: 'ACTIVE' } }) }; };
    const setupOf = (z) => ((z.ev || {}).setup || {});
    const rid15a = hex8();
    const z15a = await withInsertFault('Case', 'fileNumber', `I3-${rid15a}-s`, () => runScenario('z15a-setup-second-case-fail', dir, {}, { D7_RUNID: rid15a }, shouldNot));
    const t15a = await tenantState(`ah-${rid15a}`); const f15a = await tenantState(`ah-${rid15a}-x`); const s15a = setupOf(z15a);
    check('Z15-a', 'kurulum tamam + makbuz yazıldı + İKİNCİ ek dosya yazması (aynı tenant `-s`) hata verir: makbuz dosyası VAR (setupComplete=false, foreignCaseId var, sameTenantOtherCaseId yok); Run kendi kapanışını KOŞTU (closure.ok, nothingToClose YOK; P7-C1/U-CLOSE/P7-D9 PASS; portal hesabı yok); hedef tenantta kullanıcıların TAMAMI pasif, dosyalar CLOSED; yabancı tenanttaki ek dosya (`-xf`) CLOSED; API çağrısı 0; kanıtta setup.asama=ek-dosya-ayni-tenant, durum=YARIM_MAKBUZ_VAR, makbuzDosyasi=true, fatal arızayı adlandırır; P7-MSG-KEPT kapanışı ölçülenden yazar; çıkış 1 (önceki baytlarda makbuz yoktu → kapanış koşmadı → kullanıcılar AKTİF)',
      z15a.code === 1 && !!z15a.rc && z15a.rc.record === 'EXTACC-D7-SETUP-RECEIPT' && z15a.rc.setupComplete === false && typeof z15a.rc.foreignCaseId === 'string' && !z15a.rc.sameTenantOtherCaseId
        && !!z15a.ev && !!z15a.ev.closure && z15a.ev.closure.ok === true && !z15a.ev.closure.nothingToClose && !!z15a.ev.portalClose && z15a.ev.portalClose.ok === true && !z15a.ev.portalClose.nothingCreated
        && ['P7-C1', 'U-CLOSE', 'P7-D9'].every((id) => z15a.v(id) === 'PASS') && !!t15a && t15a.users > 0 && t15a.activeUsers === 0 && t15a.activeCases === 0 && !!f15a && f15a.cases === 1 && f15a.activeCases === 0
        && z15a.calls.length === 0 && s15a.asama === 'ek-dosya-ayni-tenant' && s15a.durum === 'YARIM_MAKBUZ_VAR' && s15a.makbuzDosyasi === true
        && JSON.stringify(s15a.tamamlanan) === JSON.stringify(['izolasyon-sayimi', 'kurulum', 'makbuz', 'ek-dosya-yabanci']) && /D7T kasitli yazma hatasi/.test(z15a.ev.fatal || '')
        && z15a.v('P7-MSG-KEPT') === 'UNMEASURED' && /kapanış, ölçülen: personel pasif \+ dosyalar CLOSED \(U-CLOSE PASS\); portal hesabı YOK/.test(z15a.o('P7-MSG-KEPT')) && z15a.ev.recovery && z15a.ev.recovery.gerekli === false,
      `çıkış=${z15a.code} · makbuz=${!!z15a.rc} setupComplete=${z15a.rc && z15a.rc.setupComplete} · closure=${JSON.stringify((z15a.ev || {}).closure || null).slice(0, 120)} · hedef=${JSON.stringify(t15a)} yabancı=${JSON.stringify(f15a)} · setup=${JSON.stringify(s15a)} · API=${z15a.calls.length}`);
    const r15 = z15a.rc ? await recover(z15a, dir, 'z15r-recover-half-setup', {}) : null;
    check('Z15-r', 'yarım kurulumun makbuzuyla Recover makbuzu BULUR ve koşar (çıkış 4 değil): kimlik bağı geçer, portal hesabı yok (P7-C1 PASS, disable-user çağrılmaz), U-CLOSE PASS, kullanıcılar pasif; kanıtta setupEvidence.setupComplete=false ("Run kurulumu YARIM"); mesaj id listesi yok → P7-MSG-KEPT ÖLÇÜLEMEYEN → çıkış 3',
      !!r15 && r15.code === 3 && r15.v('P7-C1') === 'PASS' && r15.v('U-CLOSE') === 'PASS' && r15.activeUsers === 0 && !r15.calls.some((c) => c.path === '/api/portal/admin/disable-user')
        && !!r15.ev && !!r15.ev.setupEvidence && r15.ev.setupEvidence.setupComplete === false && /YARIM/.test(r15.ev.setupEvidence.not || '') && r15.v('P7-MSG-KEPT') === 'UNMEASURED',
      r15 ? `çıkış=${r15.code} · C1=${r15.v('P7-C1')} · U-CLOSE=${r15.v('U-CLOSE')} · setupEvidence=${JSON.stringify((r15.ev || {}).setupEvidence || null)}` : 'makbuz YOK — Recover koşulamadı');
    const rid15b = hex8();
    const z15b = await withInsertFault('Case', 'fileNumber', `I3-${rid15b}-xf`, () => runScenario('z15b-setup-first-case-fail', dir, {}, { D7_RUNID: rid15b }, shouldNot));
    const t15b = await tenantState(`ah-${rid15b}`); const f15b = await tenantState(`ah-${rid15b}-x`); const s15b = setupOf(z15b);
    check('Z15-b', 'BİRİNCİ ek dosya yazması (yabancı tenant `-xf`) hata verir: makbuz VAR (foreignCaseId yok, setupComplete=false); Run kapanışı koştu (U-CLOSE PASS); hedef tenant kullanıcıları pasif, dosyalar CLOSED; yabancı tenantta dosya yok; setup.asama=ek-dosya-yabanci, durum=YARIM_MAKBUZ_VAR; API çağrısı 0; çıkış 1',
      z15b.code === 1 && !!z15b.rc && z15b.rc.setupComplete === false && !z15b.rc.foreignCaseId && z15b.v('U-CLOSE') === 'PASS' && !!t15b && t15b.activeUsers === 0 && t15b.activeCases === 0 && !!f15b && f15b.cases === 0
        && s15b.asama === 'ek-dosya-yabanci' && s15b.durum === 'YARIM_MAKBUZ_VAR' && z15b.calls.length === 0,
      `çıkış=${z15b.code} · makbuz=${!!z15b.rc} · hedef=${JSON.stringify(t15b)} yabancı=${JSON.stringify(f15b)} · setup=${JSON.stringify(s15b)}`);
    const rid15c = hex8();
    const z15c = await withInsertFault('Tenant', 'slug', `ah-${rid15c}-x`, () => runScenario('z15c-setup-tx-fail', dir, {}, { D7_RUNID: rid15c }, shouldNot));
    const s15c = setupOf(z15c);
    check('Z15-c', 'kurulumun KENDİSİ hata verir (tek işlem; yabancı tenant yazması reddedilir → geri alınır): makbuz YOK; setup.asama=kurulum, durum=KURULUM_HATASI, makbuzDosyasi=false; makbuzsuz durumda sentetik tenant slug sayısı DB\'den ÖLÇÜLDÜ = 0/0 (geri alındı) ve DB\'de tenant yok; kapanış "kapatılacak bir şey yok"; API çağrısı 0; kurtarma gerekmez; çıkış 1',
      z15c.code === 1 && !z15c.rc && !z15c.tenant && s15c.asama === 'kurulum' && s15c.durum === 'KURULUM_HATASI' && s15c.makbuzDosyasi === false
        && !!s15c.sentetikTenantDB && s15c.sentetikTenantDB.hedef === 0 && s15c.sentetikTenantDB.yabanci === 0 && !!z15c.ev && z15c.ev.closure && z15c.ev.closure.nothingToClose === true
        && z15c.calls.length === 0 && z15c.ev.recovery && z15c.ev.recovery.gerekli === false && /D7T kasitli yazma hatasi/.test(z15c.ev.fatal || ''),
      `çıkış=${z15c.code} · makbuz=${!!z15c.rc} · tenant=${!!z15c.tenant} · setup=${JSON.stringify(s15c)}`);
    // R03-c (7c): portal hesabı YOKKEN P7-C1 satırı kapatma İDDİA ETMEZ (Run ve Recover günlükleri; satır açıklaması kanıta değil günlüğe yazılır)
    const c1Line = (t) => (String(t || '').split(/\r?\n/).find((l) => /\bP7-C1\b/.test(l)) || '');
    const l15a = c1Line(z15a.log); let l15r = ''; try { l15r = c1Line(fs.readFileSync(path.join(dir, 'z15r-recover-half-setup.log'), 'utf8')); } catch (e) { l15r = ''; }
    check('Z15-d', 'portal hesabı YOKKEN (Z15-a Run ve Z15-r Recover günlükleri; P7-C1 PASS, disable-user çağrısı 0) satır açıklaması kapatma İDDİA ETMEZ: "portal hesabı YOK (DB\'de ölçüldü) — kapatılacak portal erişimi yok; kapatma çağrısı YAPILMADI"; "kapatıldı" YOK (önceki baytlar "portal erişimi yetkili uçla kapatıldı" yazıyordu)',
      /portal hesabı YOK \(DB'de ölçüldü\) — kapatılacak portal erişimi yok; kapatma çağrısı YAPILMADI/.test(l15a) && !/kapatıldı/.test(l15a) && /portal hesabı YOK \(DB'de ölçüldü\)/.test(l15r) && !/kapatıldı/.test(l15r)
        && z15a.v('P7-C1') === 'PASS' && z15a.calls.length === 0 && !!r15 && r15.v('P7-C1') === 'PASS' && !r15.calls.some((c) => c.path === '/api/portal/admin/disable-user'),
      `Run: ${l15a.trim().slice(0, 150)} · Recover: ${l15r.trim().slice(0, 150)}`);

    // ==== R03 (b) — Run'ın KENDİ kapanışında personel oturumu reddi: yalnız 401/403'te BİR KEZ yeniden giriş + TEK yeniden deneme
    const DIS = '/api/portal/admin/disable-user'; const LOGIN = '/api/auth/login';
    const nCalls = (cl, p) => cl.filter((c) => c.path === p).length;
    const nedenOf = (z) => ((z.ev && z.ev.recovery && z.ev.recovery.neden) || []);
    const pcOf = (z) => ((z.ev || {}).portalClose || {});
    const openLineOf = (z) => nedenOf(z).find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || '';
    const portalOpenLine = (z) => { const l = openLineOf(z); return /P7-C2=FAIL/.test(l) && /portal hesabı DB'de hâlâ AÇIK \(isActive=true hasPortalAccess=true\): kapatma YAPILMADI/.test(l); };
    const noFalseFinding = (z) => !!z.ev && !z.ev.productFinding && !pcOf(z).productFinding && !nedenOf(z).some((n) => /ÜRÜN BULGUSU|Recover düzeltemez/.test(n)) && !/ÜRÜN BULGUSU/.test(z.o('P7-D9'))
      && ['P7-C4L', 'P7-C4D'].every((id) => z.v(id) === 'FAIL' && /^HTTP 200 — portal hesabı DB'de hâlâ AÇIK \(P7-C2 FAIL/.test(z.o(id)) && !/\(ürün bulgusu\)/.test(z.o(id)));
    const sum16 = (z) => `çıkış=${z.code} · disable=${nCalls(z.calls, DIS)} · giriş=${nCalls(z.calls, LOGIN)} · staffReauth=${JSON.stringify(pcOf(z).staffReauth || null)} · C2=${z.v('P7-C2')} · bulgu=${JSON.stringify((z.ev || {}).productFinding || null)} · C4L=${z.o('P7-C4L').slice(0, 90)} · neden=${nedenOf(z).join(' | ').slice(0, 260)}`;
    const z16a = await runScenario('z16a-staff-token-expired-on-close', dir, { staffAuth: 'expireOnDisable' }, {}, { onDisplay: fullPhone });
    const sr16a = pcOf(z16a).staffReauth || {};
    check('Z16-a', 'personel token\'ı kapanış anında geçersiz (ilk disable-user 401): koşucu BİR KEZ yeniden giriş yapar (aynı sentetik personel), kapatmayı BİR KEZ yeniden dener (201) → portal kapandı, kapanış ölçütlerinin TAMAMI PASS, çıkış 0 (6 DEĞİL); disable-user 2 çağrı, personel girişi 2 (koşum başı + yenileme); kanıtta staffReauth 401 → giriş 201 → yeniden deneme 201; P7-C1 gözleminde "YENİLENDİ"; calledEndpoints\'te kapanış girişi; personel pasif (önceki baytlarda tek 401 → yeniden giriş yok → portal AÇIK → çıkış 6)',
      z16a.code === 0 && closedAll(z16a) && !!z16a.pu && z16a.pu.isActive === false && z16a.cl.hasPortalAccess === false && nCalls(z16a.calls, DIS) === 2 && nCalls(z16a.calls, LOGIN) === 2
        && sr16a.neden === 'disable-user HTTP 401' && sr16a.giris === 'HTTP 201' && sr16a.yenidenDeneme === 'HTTP 201' && /YENİLENDİ/.test(z16a.o('P7-C1'))
        && (z16a.ev.calledEndpoints || []).some((c) => /auth\/login \(kapanış/.test(c)) && z16a.activeUsers === 0, sum16(z16a));
    const z16b = await runScenario('z16b-staff-forbidden-on-close', dir, { disable: 'forbidden' }, {}, { onDisplay: fullPhone });
    const sr16b = pcOf(z16b).staffReauth || {};
    check('Z16-b', 'kapatma ucu her çağrıda 403: yeniden giriş BİR KEZ, yeniden deneme BİR KEZ, sonra DURUR (döngü yok) → disable-user tam 2, personel girişi tam 2; staffReauth 403 → 201 → 403; portal AÇIK kaldı (P7-C2 FAIL), çıkış 6; koşucu oturumunun 200\'ü "ürün bulgusu" YAZILMAZ, P7-C4L/D gözlemi "portal hesabı DB\'de hâlâ AÇIK (P7-C2 FAIL"; kurtarma nedeninde portal açık satırı + personel reddi satırı; U-CLOSE PASS',
      z16b.code === 6 && nCalls(z16b.calls, DIS) === 2 && nCalls(z16b.calls, LOGIN) === 2 && sr16b.neden === 'disable-user HTTP 403' && sr16b.giris === 'HTTP 201' && sr16b.yenidenDeneme === 'HTTP 403'
        && z16b.v('P7-C2') === 'FAIL' && z16b.v('U-CLOSE') === 'PASS' && !!z16b.pu && z16b.pu.isActive === true && noFalseFinding(z16b) && portalOpenLine(z16b)
        && nedenOf(z16b).some((n) => /PERSONEL OTURUMU kapanışta reddedildi \(disable-user HTTP 403\)/.test(n)), sum16(z16b));
    const z16c = await runScenario('z16c-disable-notfound', dir, { disable: 'notFound' }, {}, { onDisplay: fullPhone });
    check('Z16-c', 'kapatma ucu 404 (kimlik dışı 4xx): yeniden giriş YOK, yeniden deneme YOK → disable-user 1, personel girişi 1, staffReauth yok; P7-C2 FAIL, çıkış 6; "ürün bulgusu" YAZILMAZ; kurtarma nedeninde portal açık satırı',
      z16c.code === 6 && nCalls(z16c.calls, DIS) === 1 && nCalls(z16c.calls, LOGIN) === 1 && !pcOf(z16c).staffReauth && z16c.v('P7-C2') === 'FAIL' && noFalseFinding(z16c) && portalOpenLine(z16c), sum16(z16c));
    const z16d = await runScenario('z16d-relogin-ratelimited', dir, { staffAuth: 'expireOnDisable', relogin: 'rateLimit' }, {}, { onDisplay: fullPhone });
    const sr16d = pcOf(z16d).staffReauth || {};
    check('Z16-d', 'kapanışta token geçersiz (401) ve YENİDEN GİRİŞ hız sınırına takılıyor (429): yeniden deneme YAPILMAZ (disable-user 1, personel girişi 2), staffReauth 401 → 429 → yapılmadı; portal AÇIK (P7-C2 FAIL); "ürün bulgusu" YAZILMAZ; kurtarma nedeninde portal açık satırı + "tek yeniden giriş: HTTP 429; tek yeniden deneme: yapılmadı"; çıkış 6',
      z16d.code === 6 && nCalls(z16d.calls, DIS) === 1 && nCalls(z16d.calls, LOGIN) === 2 && sr16d.neden === 'disable-user HTTP 401' && sr16d.giris === 'HTTP 429' && !sr16d.yenidenDeneme && z16d.v('P7-C2') === 'FAIL'
        && !!z16d.pu && z16d.pu.isActive === true && noFalseFinding(z16d) && portalOpenLine(z16d)
        && nedenOf(z16d).some((n) => /PERSONEL OTURUMU kapanışta reddedildi \(disable-user HTTP 401\); tek yeniden giriş: HTTP 429; tek yeniden deneme: yapılmadı/.test(n)), sum16(z16d));
    const l8 = nedenOf(z8);
    check('Z16-e', 'GERÇEK ürün bulgusu korunur (Z8 koşumu, guard bayat): DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken (P7-C2/C2V/C5 PASS) koşucu oturumu 200 → productFinding YAZILIR ve dayanağını adlandırır (R03-c: "(P7-C2 PASS + P7-C5 PASS)"); P7-C4L/D gözlemi "… (P7-C2 PASS + P7-C5 PASS) MEVCUT OTURUM KAPANMADI (ürün bulgusu)"; kurtarma nedeni ÜRÜN BULGUSU satırını aynı dayanak + "Recover düzeltemez" ile yazar, "PORTAL ERİŞİMİ kapandığı doğrulanmadı" YAZMAZ; süre iddiası ("token 7 gün") YOK; çıkış 6',
      z8.code === 6 && ['P7-C2', 'P7-C2V', 'P7-C5'].every((id) => z8.v(id) === 'PASS') && /\(P7-C2 PASS \+ P7-C5 PASS\)/.test((z8.ev && z8.ev.productFinding) || '')
        && ['P7-C4L', 'P7-C4D'].every((id) => /HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P7-C2 PASS \+ P7-C5 PASS\) MEVCUT OTURUM KAPANMADI \(ürün bulgusu\)/.test(z8.o(id)))
        && l8.some((n) => /ÜRÜN BULGUSU — DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P7-C2 PASS \+ P7-C5 PASS\)/.test(n) && /Recover düzeltemez/.test(n)) && !l8.some((n) => /PORTAL ERİŞİMİ kapandığı doğrulanmadı/.test(n)) && !l8.some((n) => /7 gün/.test(n)),
      `çıkış=${z8.code} · bulgu=${JSON.stringify((z8.ev || {}).productFinding || null)} · neden=${l8.join(' | ').slice(0, 220)}`);
    check('Z16-f', 'kapatma ucu iki kez 500 (Z5 koşumu; en çok iki adım, yeniden giriş YOK): disable-user 2, personel girişi 1, staffReauth yok; portal AÇIK (P7-C2 FAIL); "ürün bulgusu" YAZILMAZ; kurtarma nedeninde portal açık satırı iki 500 çağrısıyla',
      z5.code === 6 && nCalls(z5.calls, DIS) === 2 && nCalls(z5.calls, LOGIN) === 1 && !pcOf(z5).staffReauth && z5.v('P7-C2') === 'FAIL' && noFalseFinding(z5) && portalOpenLine(z5) && /kapatma çağrıları: HTTP 500 · HTTP 500/.test(openLineOf(z5)), sum16(z5));

    // ==== R03 (c) — birim: Recover çıkış 3 adımı kanıttaki verdict'lerden · kurtarma nedeni ölçülenden · kapanış özeti ölçülenden
    const rsf = typeof EX0.recoverStepText === 'function' ? EX0.recoverStepText : null; const raf = typeof EX0.recoveryAdvice === 'function' ? EX0.recoveryAdvice : null;
    const tAbs = rsf ? String(rsf({ exitCode: 3, recovery: { gerekli: true }, portalClose: { ok: true, accountAbsent: true }, results: [{ id: 'P7-C1', verdict: 'PASS' }, { id: 'P7-MSG-KEPT', verdict: 'UNMEASURED' }, { id: 'U-CLOSE', verdict: 'PASS' }] })) : '';
    const tCl = rsf ? String(rsf({ exitCode: 3, recovery: { gerekli: true }, portalClose: { ok: false }, results: [{ id: 'P7-C2', verdict: 'PASS' }, { id: 'P7-C5', verdict: 'PASS' }, { id: 'P7-C4L', verdict: 'UNMEASURED' }, { id: 'P7-C4D', verdict: 'UNMEASURED' }] })) : '';
    const a5 = (r5.ev && r5.ev.recovery && r5.ev.recovery.adim) || '';
    const srcRun0 = fs.readFileSync(RUN, 'utf8');
    check('Z17', 'Recover çıkış 3 adımı kanıttaki verdict\'lerden kurulur: portal hesabı YOKKEN metin "PASS" İDDİA ETMEZ ("P7-C2=ÜRETİLMEDİ · P7-C5=ÜRETİLMEDİ (portal hesabı YOK …)"); DB kapalı ölçülmüşken "P7-C2=PASS · P7-C5=PASS" + ÖLÇÜLEMEYEN satırlar adıyla; Z5 Recover kanıtında (çıkış 3) adım "ÖNERİ (yetki DEĞİL): Recover TEKRARLANMAZ" ile başlar ve kanıttaki P7-C2/C5 verdict\'ini yazar; koşucu kaynağında sabit "TEKRARLANMAZ: DB kapalı" YOK',
      !!rsf && /P7-C2=ÜRETİLMEDİ · P7-C5=ÜRETİLMEDİ \(portal hesabı YOK/.test(tAbs) && !/PASS/.test(tAbs) && /^ÖNERİ \(yetki DEĞİL\)/.test(tAbs) && /P7-C2=PASS · P7-C5=PASS/.test(tCl) && /ÖLÇÜLEMEYEN satırlar \(P7-C4L,P7-C4D\)/.test(tCl)
        && r5.code === 3 && /^ÖNERİ \(yetki DEĞİL\): Recover TEKRARLANMAZ/.test(a5) && a5.includes(`P7-C2=${r5.v('P7-C2')} · P7-C5=${r5.v('P7-C5')}`) && !srcRun0.includes('TEKRARLANMAZ: DB kapalı'),
      `fonksiyon=${!!rsf} · hesap yok=${tAbs.slice(0, 150)} · Z5 Recover adımı=${a5.slice(0, 160)}`);
    const R7 = (pairs) => pairs.map(([id, verdict]) => ({ id, verdict }));
    const u1 = raf ? raf({ closure: { ok: true }, results: R7([['P7-C1', 'FAIL'], ['P7-C2', 'FAIL'], ['P7-C2V', 'FAIL'], ['P7-C5', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, sessionWhileOpen: true, after: { isActive: true, hasPortalAccess: true }, disableCalls: ['HTTP 404'] } }, 'r.json', 'run') : {};
    // R03-c: (ii) girdisine HTTP ölçümlerinden sonraki DB değeri (afterMeasure: AÇIK) eklendi; beklenti değişti — P7-C5 FAIL iken ürün bulgusu satırı YOK.
    const u2 = raf ? raf({ closure: { ok: true }, results: R7([['P7-C1', 'PASS'], ['P7-C2', 'PASS'], ['P7-C2V', 'PASS'], ['P7-C5', 'FAIL'], ['P7-C4L', 'FAIL'], ['P7-C4D', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, productFinding: 'ÜRÜN BULGUSU: x', after: { isActive: false, hasPortalAccess: false }, afterMeasure: { isActive: true, hasPortalAccess: true }, sessionDuringChange: true } }, 'r.json', 'run') : {};
    const u3 = raf ? raf({ closure: { ok: true, nothingToClose: true }, portalClose: { ok: true, nothingCreated: true }, results: [], setup: { asama: 'kurulum', sentetikTenantDB: { hedef: 1, yabanci: 0 } } }, null, 'run') : {};
    const u4 = raf ? raf({ closure: { ok: false }, results: R7([['P7-C1', 'FAIL'], ['P7-C2', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, after: { isActive: true, hasPortalAccess: true } } }, 'r.json', 'recover') : {};
    // R03-c (v): makbuz bellekte VAR ama dosyası yazılamadı (setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI; makbuzDiskte=false) → uygulanamayan komut ÖNERİLMEZ
    const rfs = typeof EX0.receiptFileState === 'function' ? EX0.receiptFileState : null;
    const memR7 = { record: EX0.RECEIPT_RECORD, runId: 'abcdef12', tenantId: 't', tenantSlug: 'ah-abcdef12', clientId: 'k', elevUserId: 'u', elevEmail: 'e@ornek.invalid', setupComplete: false };
    const r18 = path.join(dir, 'z18v'); fs.mkdirSync(r18); const okP7 = path.join(r18, 'var.json'); fs.writeFileSync(okP7, JSON.stringify(memR7, null, 1));
    const badP7 = path.join(r18, 'bozuk.json'); fs.writeFileSync(badP7, '{"record":"BASKA"}'); const dirP7 = path.join(r18, 'klasor.json'); fs.mkdirSync(dirP7); const goneP7 = path.join(r18, 'yok.json');
    const halfOut = (p) => ({ receipt: memR7, receiptWriteError: 'EACCES: izin yok', setup: { asama: 'makbuz', durum: 'YARIM_MAKBUZ_DOSYASI_YAZILAMADI', makbuzDosyasi: false }, closure: { ok: false }, portalClose: { ok: true, accountAbsent: true }, results: R7([['P7-C1', 'PASS'], ['U-CLOSE', 'FAIL']]), _p: p });
    const u5 = raf ? raf(halfOut(goneP7), goneP7, 'run') : {}; const u5d = raf ? raf(halfOut(dirP7), dirP7, 'run') : {}; const u6 = raf ? raf(Object.assign(halfOut(okP7), { receiptWriteError: undefined, setup: { durum: 'TAMAM' } }), okP7, 'run') : {};
    const st18 = rfs ? [rfs(okP7, memR7), rfs(goneP7, memR7), rfs(dirP7, memR7), rfs(badP7, memR7), rfs(null, memR7)] : [];
    const noCmd7 = (a) => !String(a.adim || '').includes('-ReceiptFile <makbuz>');
    const v5 = noCmd7(u5) && /— ama makbuz dosyası YOK \(dosya yok \(ENOENT\) · makbuz yazma hatası: EACCES: izin yok · setup\.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI\): bu makbuz yoluyla bloktan Recover BAŞLATILAMAZ/.test(u5.adim || '')
      && /Kullanılabilir yol: bu kanıttaki `receipt` nesnesi/.test(u5.adim || '') && /AYRI owner onayıyla `-ReceiptFile <o dosya>`/.test(u5.adim || '') && u5.makbuzDiskte === false && u5.makbuzDurumu === 'YOK'
      && noCmd7(u5d) && /— ama makbuz dosyası OKUNAMIYOR \(dosya okunamadı \(EISDIR\)/.test(u5d.adim || '') && u5d.makbuzDurumu === 'OKUNAMADI'
      && String(u6.adim || '').includes('-Mode Recover -ReceiptFile <makbuz>') && u6.makbuzDurumu === 'KULLANILABILIR'
      && st18.map((x) => x.durum).join(',') === 'KULLANILABILIR,YOK,OKUNAMADI,OKUNAMADI,YOL_YOK';
    const n1 = u1.neden || []; const n2 = u2.neden || []; const n3 = u3.neden || [];
    const tag = typeof EX0.closureTag === 'function' ? [EX0.closureTag({ closure: { ok: true }, portalClose: { portalDbClosed: true } }), EX0.closureTag({ closure: { ok: false }, portalClose: { portalDbClosed: false } })] : ['', ''];
    check('Z18', 'kurtarma nedeni ve adım (birim): (i) portal DB\'de AÇIK → "PORTAL ERİŞİMİ kapandığı doğrulanmadı (P7-C1=FAIL,P7-C2=FAIL,P7-C2V=FAIL,P7-C5=FAIL) — portal hesabı DB\'de hâlâ AÇIK … ürün bulgusu SAYILMADI"; Run adımı "ÖNERİ (yetki DEĞİL)" + "AYRI owner onayıyla"; (ii) R03-c: kanıtta ürün bulgusu metni olsa da P7-C5 FAIL (HTTP sonrası DB AÇIK) → ürün bulgusu / "Recover düzeltemez" satırı YOK; "PORTAL ERİŞİMİ kapandığı doğrulanmadı (P7-C5=FAIL)" satırı HTTP ölçümlerinden SONRAKİ değerlerle "yeniden AÇILDI … açık erişim kapatılmalıdır" ("hâlâ AÇIK" yok); (iii) makbuz yok + sentetik tenant DB\'de VAR → "KURULUM: makbuz YOK … VAR (hedef=1 · yabancı=0)" + adımda "makbuz YOK: Recover bu kanıtla başlatılamaz"; (iv) Recover adımı "İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR", "BİR KEZ" yok; kapanış özeti ölçülenden (U-CLOSE PASS ↔ DOĞRULANMADI); (v) R03-c: makbuz bellekte VAR ama dosyası yazılamadı (setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI, makbuzDiskte=false) → adım uygulanamayan `-Mode Recover -ReceiptFile <makbuz>` komutunu ÖNERMEZ; "makbuz dosyası YOK (… yazma hatası … setup.durum=…): bu makbuz yoluyla bloktan Recover BAŞLATILAMAZ" + kanıttaki `receipt` nesnesinden yeni dosya (AYRI owner onayıyla `-ReceiptFile <o dosya>`); yol klasörse "OKUNAMIYOR (EISDIR)"; makbuz okunabiliyorsa komut önerilir; receiptFileState var/yok/klasör/bozuk/yol yok',
      !!raf && n1.some((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(P7-C1=FAIL,P7-C2=FAIL,P7-C2V=FAIL,P7-C5=FAIL\) — portal hesabı DB'de hâlâ AÇIK/.test(n) && /ürün bulgusu SAYILMADI/.test(n)) && /^ÖNERİ \(yetki DEĞİL\)/.test(u1.adim || '') && /AYRI owner onayıyla/.test(u1.adim || '')
        && !n2.some((n) => /ÜRÜN BULGUSU|Recover düzeltemez/.test(n)) && n2.some((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(P7-C5=FAIL\) — kapatmadan sonra DB'de kapalı ölçüldü \(P7-C2=PASS\) ama hesap ölçüm sırasında yeniden AÇILDI \(P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true\): açık erişim kapatılmalıdır/.test(n) && !/hâlâ AÇIK/.test(n))
        && n3.some((n) => /^KURULUM: makbuz YOK \(kurulum aşaması=kurulum\) ama sentetik tenant slug'ı DB'de VAR \(hedef=1 · yabancı=0\)/.test(n)) && /makbuz YOK: Recover bu kanıtla başlatılamaz/.test(u3.adim || '')
        && /İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR/.test(u4.adim || '') && !/BİR KEZ/.test(u4.adim || '') && /U-CLOSE PASS\); portal DB'de pasif ölçüldü \(P7-C2 PASS\)$/.test(tag[0]) && /DOĞRULANMADI.*DOĞRULANMADI/.test(tag[1])
        && !!rfs && v5,
      `fonksiyon=${!!raf} · (i) ${n1.map((n) => n.slice(0, 60)).join(' | ')} · (ii) ${n2.map((n) => n.slice(0, 160)).join(' | ')} · (iii) ${n3.map((n) => n.slice(0, 60)).join(' | ')} · (iv) ${(u4.adim || '').slice(0, 80)} · özet=${tag.join(' / ')} · (v) durumlar=${st18.map((x) => x.durum).join(',')} yok=${String(u5.adim || '').slice(0, 260)} · klasör=${String(u5d.adim || '').slice(110, 220)} · var=${String(u6.adim || '').slice(0, 120)}`);

    // ==== R03-c — (a) ürün bulgusu yalnız P7-C2 PASS + P7-C5 PASS; (b) makbuz dosyası yazılamaz hale gelirse uygulanamayan Recover komutu önerilmez
    const z19a = await runScenario('z19a-reopen-during-measure', dir, { guard: 'stale', reopen: 'afterDisable' }, {}, { onDisplay: fullPhone });
    const n19a = nedenOf(z19a); const line19a = n19a.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || '';
    check('Z19-a', 'hesap HTTP ölçümleri SIRASINDA yeniden açıldı (sahte API reopen afterDisable + guard bayat; kapatma 201): P7-C2 PASS, P7-C5 FAIL; koşucu oturumu 200 → P7-C4L/D FAIL ama gözlem "ürün bulgusu adayı DEĞİL — hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL: isActive=true hasPortalAccess=true …)"; productFinding YOK; neden ve P7-D9\'da "ÜRÜN BULGUSU" / "Recover düzeltemez" YOK; kurtarma nedenindeki portal satırı P7-C5=FAIL + HTTP ölçümlerinden SONRAKİ değerlerle "yeniden AÇILDI … açık erişim kapatılmalıdır"; DB\'de hesap bağımsız ölçümde AÇIK; çıkış 6',
      z19a.code === 6 && z19a.v('P7-C2') === 'PASS' && z19a.v('P7-C5') === 'FAIL' && !!z19a.ev && !z19a.ev.productFinding && !pcOf(z19a).productFinding
        && ['P7-C4L', 'P7-C4D'].every((id) => z19a.v(id) === 'FAIL' && /^HTTP 200 — ürün bulgusu adayı DEĞİL — hesap ölçüm sırasında yeniden AÇILDI \(P7-C5 FAIL: isActive=true hasPortalAccess=true/.test(z19a.o(id)) && !/\(ürün bulgusu\)/.test(z19a.o(id)))
        && !n19a.some((n) => /ÜRÜN BULGUSU|Recover düzeltemez/.test(n)) && !/ÜRÜN BULGUSU/.test(z19a.o('P7-D9'))
        && /\(P7-C5=FAIL\)/.test(line19a) && /hesap ölçüm sırasında yeniden AÇILDI \(P7-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true\): açık erişim kapatılmalıdır/.test(line19a) && /ürün bulgusu SAYILMADI/.test(line19a)
        && !!z19a.pu && z19a.pu.isActive === true && !!z19a.cl && z19a.cl.hasPortalAccess === true,
      `çıkış=${z19a.code} · C2=${z19a.v('P7-C2')} C5=${z19a.v('P7-C5')} · bulgu=${JSON.stringify((z19a.ev || {}).productFinding || null)} · C4L=${z19a.o('P7-C4L').slice(0, 140)} · portal satırı=${line19a.slice(0, 260)} · DB sonra=${JSON.stringify(z19a.pu)}/${JSON.stringify(z19a.cl)}`);

    // Gösterimden sonra makbuz yolu KLASÖR olur (koşucunun sonraki makbuz yazımı — 2. personel yanıtındaki runnerMessageIds — EISDIR ile başarısız olur);
    // kapatma 500 → çıkış 6. Klasör, koşucu çıktıktan sonra (afterExit) kaldırılır.
    const rp19 = path.join(dir, 'z19b-receipt-unwritable-receipt.json');
    const z19b = await runScenario('z19b-receipt-unwritable', dir, { disable: 'fail' }, {}, {
      onDisplay: async (rid, sink) => { try { fs.unlinkSync(rp19); fs.mkdirSync(rp19); } catch (e) { /* ölçüm aşağıda */ } return fullPhone(rid, sink); },
      afterExit: async () => { try { fs.rmdirSync(rp19); } catch (e) { /* ölçüm aşağıda */ } } });
    const rec19 = (z19b.ev && z19b.ev.recovery) || {}; const ev19r = (z19b.ev && z19b.ev.receipt) || null;
    let r19 = null; const copy19 = path.join(dir, 'z19b-makbuz-kanittan.json');
    if (ev19r) { fs.writeFileSync(copy19, JSON.stringify(ev19r, null, 1)); artifacts.push(copy19); r19 = await recover({ runId: z19b.runId, receipt: copy19, rc: ev19r, tenant: z19b.tenant }, dir, 'z19b-recover-from-evidence-receipt', {}); }
    check('Z19-b', 'makbuz dosyası gösterimden sonra YAZILAMAZ hale geldi (uçtan uca; yol klasör; kapatma 500 → portal AÇIK, çıkış 6): kanıtta receiptWriteError (EISDIR), makbuzDurumu=OKUNAMADI; adım uygulanamayan `-Mode Recover -ReceiptFile <makbuz>` komutunu ÖNERMEZ, "makbuz dosyası OKUNAMIYOR … bloktan Recover BAŞLATILAMAZ" + kanıttaki `receipt` yolunu yazar; kanıttaki `receipt` nesnesi (kayıt türü D-7; runnerMessageIds dahil) değiştirilmeden dosyaya yazılıp Recover\'a verildiğinde Recover GERÇEKTEN koşar: kayıt EXTACC-D7-RECOVER, kimlik bağı OK, disable-user çağrıldı, portal pasif + erişim kapalı, yeni giriş 401, P7-MSG-KEPT makbuzdaki koşucu id\'leriyle PASS, personel pasif, çıkış 3',
      z19b.code === 6 && !!z19b.ev && z19b.ev.displayed === true && /EISDIR/.test(z19b.ev.receiptWriteError || '') && rec19.gerekli === true && rec19.makbuzDurumu === 'OKUNAMADI' && noCmd7(rec19)
        && /— ama makbuz dosyası OKUNAMIYOR \(/.test(rec19.adim || '') && /bloktan Recover BAŞLATILAMAZ/.test(rec19.adim || '') && /Kullanılabilir yol: bu kanıttaki `receipt` nesnesi/.test(rec19.adim || '') && /AYRI owner onayıyla `-ReceiptFile <o dosya>`/.test(rec19.adim || '')
        && !!ev19r && ev19r.record === EX0.RECEIPT_RECORD && Array.isArray(ev19r.runnerMessageIds) && ev19r.runnerMessageIds.length >= 1
        && !!r19 && r19.code === 3 && !!r19.ev && r19.ev.record === 'EXTACC-D7-RECOVER' && ((r19.ev.portalClose || {}).identity === 'OK') && r19.calls.some((c) => c.path === '/api/portal/admin/disable-user')
        && !!r19.pu && r19.pu.isActive === false && r19.cl.hasPortalAccess === false && r19.v('P7-C3L') === 'PASS' && r19.v('P7-MSG-KEPT') === 'PASS' && r19.activeUsers === 0,
      `çıkış=${z19b.code} · yazma hatası=${(z19b.ev || {}).receiptWriteError || '-'} · durum=${rec19.makbuzDurumu} · adım=${String(rec19.adim || '').slice(0, 240)} · kanıtta receipt=${!!ev19r} id=${ev19r && ev19r.runnerMessageIds ? ev19r.runnerMessageIds.length : '-'} · Recover(kanıttaki makbuz)=${r19 ? r19.code : '-'} kimlik=${r19 && r19.ev ? (r19.ev.portalClose || {}).identity : '-'} hesap=${r19 ? JSON.stringify(r19.pu) : '-'} KEPT=${r19 ? r19.v('P7-MSG-KEPT') : '-'}`);

    // ---- C-1 (R03 c) — kanıttaki kurtarma/kapanış metinleri YALNIZ ölçüleni söyler: bu öz-testin ürettiği TÜM Run/Recover kanıtları taranır
    let evScanned = 0; let evNeed = 0; const textBad = [];
    const fixedClaims = [/sentetik tenant CLOSED/, /sentetik tenant kapanışıyla/, /token 7 gün/, /birkaç dakika sonra Recover/, /Recover BİR KEZ/, /ile BİR KEZ/, /kapanışta yeniden kapatıldı/, /TEKRARLANMAZ: DB kapalı/];
    for (const f of new Set(artifacts)) {
      if (!/-evidence\.json$/.test(f) || !fs.existsSync(f)) continue; const nm = path.basename(f); let e;
      try { e = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (x) { textBad.push(`${nm}:okunamadı`); continue; }
      evScanned++;
      if (e.revision !== 'R03') textBad.push(`${nm}:revision=${e.revision}`);
      const kept = (e.results || []).find((r) => r.id === 'P7-MSG-KEPT'); const vOf = (id) => ((e.results || []).find((r) => r.id === id) || {}).verdict;
      const txt = JSON.stringify({ recovery: e.recovery || null, temporaryAccess: e.temporaryAccess || null, note: (e.messageResidue || {}).note || null, kept: kept ? kept.observed : null, finding: e.productFinding || null });
      for (const re of fixedClaims) if (re.test(txt)) textBad.push(`${nm}:${re.source}`);
      if (kept && !/kapanış, ölçülen: /.test(kept.observed || '')) textBad.push(`${nm}:kalıntı metninde ölçülen kapanış özeti yok`);
      if (kept && /\(U-CLOSE PASS\)/.test(kept.observed || '') && vOf('U-CLOSE') !== 'PASS') textBad.push(`${nm}:kalıntı metni U-CLOSE PASS diyor, verdict ${vOf('U-CLOSE')}`);
      if (kept && /P7-C2 PASS\)/.test(kept.observed || '') && vOf('P7-C2') !== 'PASS') textBad.push(`${nm}:kalıntı metni P7-C2 PASS diyor, verdict ${vOf('P7-C2')}`);
      if (e.recovery && e.recovery.gerekli) {
        evNeed++; const a = e.recovery.adim || '';
        if (!/^ÖNERİ \(yetki DEĞİL\)/.test(a)) textBad.push(`${nm}:adım ÖNERİ değil`);
        if (e.record === 'EXTACC-D7-RECOVER' && e.exitCode !== 3 && !/İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR/.test(a)) textBad.push(`${nm}:Recover adımı ikinci Recover kuralını yazmıyor`);
        if (e.record === 'EXTACC-D7-RECOVER' && e.exitCode === 3 && !a.includes(`P7-C2=${vOf('P7-C2') || 'ÜRETİLMEDİ'} · P7-C5=${vOf('P7-C5') || 'ÜRETİLMEDİ'}`)) textBad.push(`${nm}:Recover 3 adımı kanıttaki verdict'i yazmıyor`);
        if (e.record !== 'EXTACC-D7-RECOVER' && !/AYRI owner onayıyla/.test(a)) textBad.push(`${nm}:Run adımı AYRI owner onayını yazmıyor`);
      }
      // R03-c: ürün bulgusu yalnız P7-C2 PASS VE P7-C5 PASS iken (önceki ölçüt yalnız P7-C2'ye bakıyordu)
      if (e.productFinding && (vOf('P7-C2') !== 'PASS' || vOf('P7-C5') !== 'PASS')) textBad.push(`${nm}:ürün bulgusu P7-C2 + P7-C5 PASS olmadan yazıldı`);
      if (e.recovery && e.recovery.gerekli && e.record !== 'EXTACC-D7-RECOVER' && e.recovery.makbuzDurumu && e.recovery.makbuzDurumu !== 'KULLANILABILIR' && String(e.recovery.adim || '').includes('-ReceiptFile <makbuz>')) textBad.push(`${nm}:makbuz dosyası ${e.recovery.makbuzDurumu} iken Recover komutu önerildi`);
      if (e.temporaryAccess && typeof e.temporaryAccessClosed !== 'boolean') textBad.push(`${nm}:temporaryAccessClosed ölçülmedi`);
      if (e.record === 'EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN' && !(e.setup && typeof e.setup.durum === 'string')) textBad.push(`${nm}:setup.durum yok`);
    }
    check('C-1', 'kanıttaki kurtarma/kapanış metinleri yalnız ölçüleni söyler (bu öz-testin TÜM Run/Recover kanıtları): revision=R03; sabit iddia YOK ("sentetik tenant CLOSED", "… kapanışıyla erişilemez", "token 7 gün", "birkaç dakika sonra Recover", "Recover BİR KEZ", "ile BİR KEZ", "kapanışta yeniden kapatıldı", "TEKRARLANMAZ: DB kapalı"); P7-MSG-KEPT kapanış özeti ölçülenden ve U-CLOSE / P7-C2 verdict\'iyle tutarlı; kurtarma gerekliyse adım "ÖNERİ (yetki DEĞİL)" ile başlar — Run adımı AYRI owner onayını, Recover adımı (çıkış 3 dışı) "İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR" kuralını, Recover 3 adımı kanıttaki P7-C2/C5 verdict\'ini yazar; R03-c: ürün bulgusu yalnız P7-C2 PASS + P7-C5 PASS iken; makbuz dosyası kullanılamıyorken Run adımı Recover komutu önermez; Recover geçici erişimi verdiyse kapanışı ölçülmüş alanla (temporaryAccessClosed); her Run kanıtında setup.durum',
      evScanned >= 24 && evNeed >= 8 && textBad.length === 0, `taranan kanıt=${evScanned} · kurtarma gerekli=${evNeed} · sorun=${textBad.length ? textBad.slice(0, 10).join(', ') : 'yok'}`);

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
  // T-9 (R03 b): personel yeniden girişi YALNIZ Run'ın kendi kapanışında; Recover'ın oturum açma yolu değişmedi; yeniden giriş DB'ye yazmaz.
  const runSrc = src.slice(src.indexOf('async function runMode'), src.indexOf('async function recoverMode')); const recSrc = src.slice(src.indexOf('async function recoverMode'));
  const iRe = runSrc.indexOf('const staffReauth ='); const reauthFn = iRe >= 0 ? runSrc.slice(iRe, runSrc.indexOf('} : null;', iRe)) : '';
  check('T-9', 'personel yeniden girişi yalnız Run kapanışında: Run\'ın closePortal çağrısına `staffReauth` verilir, Recover vermez; yeniden giriş fonksiyonu yalnız makbuzdaki personelle L.AH.login çağırır ve DB\'ye yazmaz (prisma çağrısı yok); closePortal yeniden girişi yalnız 401/403\'te ve bir kez yapar',
    reauthFn.length > 0 && /L\.AH\.login\(base, receipt\.elevEmail, pw, receipt\.tenantSlug\)/.test(reauthFn) && !/prisma\./.test(reauthFn) && /closePortal\([^)]*\{\s*session, staffReauth,/.test(runSrc) && !/staffReauth/.test(recSrc)
      && /\(r\.status === 401 \|\| r\.status === 403\) && o\.staffReauth && !res\.staffReauth/.test(src), `fonksiyon=${reauthFn.length} karakter · Recover'da staffReauth=${/staffReauth/.test(recSrc)}`);
  // T-10 (R03 a): makbuz kurulumdan hemen sonra atanır ve dosyaya yazılır — iki ek dosya yazmasından ÖNCE (kaynak sırası).
  const iRcpt = runSrc.indexOf('receipt = { record: RECEIPT_RECORD'); const iSave = runSrc.indexOf("saveReceipt('makbuz yazılamadı"); const iSetup = runSrc.indexOf('L.setupI3(');
  const iCases = [...runSrc.matchAll(/prisma\.case\.create\(/g)].map((m) => m.index);
  check('T-10', 'koşucu kaynağında sıra: setupI3 → makbuz ataması → makbuz dosyası yazımı → iki ek dosya yazması (ikisi de makbuzdan SONRA); ek dosya kimlikleri makbuza yazıldıkça eklenir (foreignCaseId, sameTenantOtherCaseId + setupComplete)',
    iSetup >= 0 && iRcpt > iSetup && iSave > iRcpt && iCases.length === 2 && iCases.every((i) => i > iSave) && /receipt\.foreignCaseId = fcase\.id; saveReceipt\(null\)/.test(runSrc) && /receipt\.sameTenantOtherCaseId = scase\.id; receipt\.setupComplete = true; saveReceipt\(null\)/.test(runSrc),
    `setupI3@${iSetup} makbuz@${iRcpt} yazım@${iSave} ek dosyalar@${iCases.join(',')}`);
  const sinkLines = src.split('\n').filter((l) => /D7_TEST_DISPLAY_SINK/.test(l));
  check('T-2', 'gösterimsiz test dosyası (sink) kaynakta TEK yerde ve yalnız `display === \'none\'` koşuluyla (konsol varken asla)', sinkLines.length === 1 && /g\.display === 'none' && process\.env\.D7_TEST_DISPLAY_SINK/.test(sinkLines[0]) && /if \(con\) return DISPLAY\.show/.test(sinkLines[0]), `satır=${sinkLines.length}`);
  const liveEnv = { AH_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/hukuk_db', D7_EXPECT_DB: 'hukuk_db', D7_WAIT_MS: '1', D7_POLL_MS: '1', D7_VIEW_MS: '1', D7_HTTP_TIMEOUT_MS: '1', D7_CALL_TIMEOUT_MS: '1', D7_LATE_CREATE_MS: '1' };
  const pl = EX.effectiveParams(liveEnv); const pt = EX.effectiveParams(Object.assign({}, liveEnv, { AH_DATABASE_URL: `postgresql://u:p@127.0.0.1:${new URL(DBURL).port}/${DB_NAME}`, D7_EXPECT_DB: DB_NAME }));
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
  console.log(`\nEXTACC D-7 R03 ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
  console.log(`  kanıt dizini: ${dir}`);
  console.log(`  (disposable DB 127.0.0.1:${new URL(DBURL).port}/${DB_NAME} + sahte portal API ${API_PORT}/${EXT_PORT} + gerçek TLS; canlı DB/API/DNS/tünel/e-posta KULLANILMADI)`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); process.exit(2); });
