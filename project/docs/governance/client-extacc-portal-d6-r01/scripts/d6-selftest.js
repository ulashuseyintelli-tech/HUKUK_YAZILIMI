'use strict';
/*
 * EXTACC D-6 R01 ÖZ-TESTİ — CANLI DB'YE YAZMAZ, CANLI API/DNS/TÜNELE DOKUNMAZ. Disposable PostgreSQL + sahte portal API
 * (d6-fake-portal-api.js) + gerçek TLS'li sahte dış sunucu. "Telefon" bir istemci taklididir: giriş bilgisini koşucunun gösterimsiz
 * test dosyasından (D6_TEST_DISPLAY_SINK; yalnız disposable DB'de) alır, dış uçtan girer, listeyi/indirmeyi görür, isteğe bağlı
 * kendi belgesini yükler ve siler, koşucu silmesinden sonra listeyi yeniden okur.
 *
 * KULLANIM: node d6-selftest.js   (D6T_DB_URL → 127.0.0.1:<5432 DIŞI port>/<ad>_test ŞART — R03: port sabit değil, kendi tek kullanımlık
 *           konteyneriniz; `hukuk_db` ve 5432 REDDEDİLİR; sahte API 8199 / dış 8458)
 *           D6T_LIB_ROOT → Prisma istemcisi + bcrypt kurulu, CANLI OLMAYAN bir proje kökü (verilmezse bu betiğin checkout'unun proje kökü)
 * ÇIKIŞ   : 0 hepsi PASS · 1 FAIL var · 2 ölçülemedi (kütüphane kökü / modül yok dahil) · 4 kütüphane kökü canlı yayın ağacına çözülüyor (RED)
 * SINIR   : sahte API ürünün kendisi değildir; ürünün gerçek multipart/kova/hız sınırı davranışı canlı koşumda ölçülür.
 * R03     : Z17 (D6-1D erişim reddi ≠ doğrulanmış yokluk) · Z18 (kapanışta doğrulanmış kalıntı ≠ depolama erişim hatası; ikisi birlikte; aynı ret
 *           altında Recover adımı) · Z19 (kapanışta personel oturumu reddi: 401 → tek yeniden giriş + tek yeniden deneme; 403 → döngü yok;
 *           404 → yeniden giriş yok) · C-1 (kanıttaki kurtarma/kapanış metinleri yalnız ölçüleni söyler) · T-8 (yeniden giriş yalnız Run'da,
 *           DB'ye yazmaz). ACL reddi gerçek `icacls` ile (Windows).
 * R03-b   : Z20 (bağımsız doğrulama bulguları) — kapatma yapılmadığında (403 / 404 / yeniden giriş 429 / iki kez 5xx) koşucu oturumunun 200 dönmesi
 *           "ürün bulgusu" YAZMAZ ve kurtarma nedeninde portal açık satırı VAR (Z20-a..d); gerçek ürün bulgusu (DB kapalı ölçülmüşken 200) yine yazılır
 *           (Z20-e); kalıntı + portal açık birlikte → iki satır (Z20-f); Recover çıkış 3 adımı kanıttaki verdict'lerden (portal hesabı yokken P6-C2/C5
 *           PASS iddiası yok) (Z20-g); kurtarma nedeni birim ölçümü — portal satırı kalıntı / erişim hatası / ürün bulgusundan bağımsız (Z20-h).
 * R03-c   : (owner talimatı: kapanış / Recover doğruluğu) Z21-a hesap HTTP ölçümleri sırasında yeniden açılırsa (P6-C2 PASS, P6-C5 FAIL; sahte API
 *           `reopen: afterDisable` + guard bayat) 200 "ürün bulgusu" YAZMAZ, portal satırı st2 değerleriyle "yeniden AÇILDI" der · Z21-b makbuz dosyası
 *           durumu (birim: var / eski / yok / klasör / bozuk / kanıtta makbuz yok) → Run adımı uygulanamayan Recover komutunu önermez · Z21-c makbuz
 *           koşum ortasında kaybolur (uçtan uca): adım "makbuz dosyası YOK" + kanıttaki `receipt` yolu; o nesneden yazılan dosyayla Recover GERÇEKTEN
 *           koşar (kimlik bağı OK). Değişen: Z20-e (ürün bulgusu dayanağı "P6-C2 PASS + P6-C5 PASS"), Z20-h (iii) (P6-C5 FAIL'de ürün bulgusu satırı YOK).
 *           Z21-d (D-7 7c taramasının ikizi): portal hesabı YOKKEN P6-C1 günlük satırı "kapatıldı" demez (Z14 Run günlüğü).
 * R03-d   : (R03-c bağımsız doğrulaması) Z21-a DEĞİŞTİ — R03-c'nin "adayı DEĞİL" beklentisi YANLIŞTI: sahte API yeniden açmada sürümü ürün gibi artırır;
 *           guard kusur taklidi + yeniden açma → 200 "ÜRÜN BULGUSU ADAYI — eski oturum sürüm reddine rağmen erişti" + AYRI "yeniden AÇILDI … (Recover
 *           kapatabilir)" satırı · Z22-a guard NORMAL + yeniden açma → eski oturum 401 (P6-C4 PASS), bulgu yok, portal açık satırı var · Z22-b sürüm
 *           verilme değerine GERİ döner (sahte API afterDisableRevert) → 200 "adayı DEĞİL" · Z22-c sınıflama + kurtarma nedeni birim · Z22-d
 *           P6-FOREIGN-CLEAN açıklaması ölçülene bağlı (m5) · Z22-e BAYAT makbuz önerilmez (m7) + makbuzDiskte klasörde false (m6) + BOM'lu makbuz
 *           kullanılabilir · Z21-b / Z21-c DEĞİŞTİ — kanıttaki recovery.makbuzJson'dan yeni dosya yazan TEK komut Windows PowerShell 5.1 VE PowerShell 7
 *           ile GERÇEKTEN koşulur; iki dosya (5.1 BOM'lu) koşucunun Recover kapısından geçer ve Recover kimlik bağı OK ile koşar (m4) · Z16-a yabancı
 *           satır metni ("hiç yazılmadı"). `recover` yardımcısı makbuzu BOM'u atarak okur.
 * R03-e   : (R03-d iki bağımsız doğrulaması, B1) koşucu oturumunun HER 200'ü tek sınıflamadan (sessionClass200): Z23-a karar tablosunun tüm hücreleri (birim;
 *           sınıf + hücre + metin; "ürün bulgusu değil" yalnız T5, "DEĞİL" sınıfı yok) · Z23-b token claim'i (birim) · Z23-c..j uçtan uca tablo varyantları,
 *           her biri guard kusur taklidi (bayat → beklenen sınıf ve metin) ve guard normal (401 → P6-C4 PASS, productFinding YOK) ikizleriyle: T2 açıkken
 *           "Şifre Değiştir" (sürüm +1) + kapatma 403 · T1 satır silme · T3 ürün dışı kapatma (sürüm artmadan pasif) · TI ürün dışı yeniden açma · Z23-k claim ≠
 *           s1 (ikisi kanıtta, claim esas) · Z23-l claim okunamaz → s1 · T-9 statik (tek sınıflama çağrısı; "hâlâ AÇIK" / koşulsuz SAYILMADI yok).
 *           DEĞİŞEN: Z20-a..d, Z20-f (T5: "ürün bulgusu SAYILMADI (T5)" + ölçülen kapatma metni "kapatma YAPILMADI (2xx kapatma çağrısı yok)"; "hâlâ" yok) ·
 *           Z20-h (i) · Z21-a (T2 ADAY + hücre; ürün bulgusu metni açık-erişim satırını içermez) · Z22-b (sürüm geri dönüşü → TA AYRISTIRILAMADI; "DEĞİL" yok)
 *           · Z22-c (kurtarma nedeni birimi sınıflara göre; Recover modunda "(Recover kapatabilir)" yazılmaz). Sahte API portal token'ı JWT biçiminde.
 */
const { spawn, spawnSync, execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');

const HERE = __dirname; const GOV = path.resolve(HERE, '..', '..');
const RUN = path.join(HERE, 'd6-portal-documents-live-run.js');
const FAKE = path.join(HERE, 'd6-fake-portal-api.js');
const WRAPPER = path.join(HERE, 'd6-owner-live-block.ps1');
// KÜTÜPHANE KÖKÜ (Prisma istemcisi + bcrypt) — izole test canlı yayın ağacından modül YÜKLEMEZ. Kök D6T_LIB_ROOT ile verilir; verilmezse bu
// betiğin checkout'unun proje kökü denenir; modül yoksa test DURUR (canlı ağaca DÜŞÜLMEZ). Canlı ağaç = owner bloğunun `$Rel` sabiti (tek
// kaynak; bu dosyada canlı yol literali yoktur). Yol bileşen bileşen çözülür: yolun kendisi ya da bir bağlantının (junction/symlink) hedefi
// canlı ağaca çıkıyorsa o ağaca DOKUNULMADAN (stat/readlink/require yok) çıkış 4. Bu bölüm ilk yerel `require`dan ÖNCE çalışır.
const LIB_SUB = { 'Prisma istemcisi': ['node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '@prisma', 'client'], bcrypt: ['node_modules', '.pnpm', 'bcrypt@5.1.1', 'node_modules', 'bcrypt'] };
const maskUser = (s) => { let t = String(s).replace(/([A-Za-z]:[\\/]Users[\\/])[^\\/\s"']+/gi, '$1<kullanici>'); const u = process.env.USERNAME || ''; if (u.length >= 3) t = t.replace(new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<kullanici>'); return t; };
const libStop = (code, msg) => { console.log(msg); process.exit(code); };
const underDir = (p, base) => { const a = path.resolve(p).toLowerCase(); const b = path.resolve(base).toLowerCase().replace(/[\\/]+$/, ''); return a === b || a.startsWith(b + path.sep); };
function liveTree() { // owner bloğunun `$Rel` sabiti; `…\project` ise bir üstü (yayın ağacının tamamı). Okunamazsa null → test DURUR
  let w; try { w = fs.readFileSync(WRAPPER, 'utf8'); } catch (e) { return null; }
  const m = [...w.matchAll(/^\$Rel\s*=\s*'([A-Za-z]:\\[^'\r\n]+)'/gm)]; if (m.length !== 1) return null;
  const rel = path.resolve(m[0][1]); return path.basename(rel).toLowerCase() === 'project' ? path.dirname(rel) : rel;
}
function resolveLib(p, live, depth = 0) { // → { real } | { live } | { missing }; canlı ağaç denetimi her adımda dosya sistemi çağrısından ÖNCE
  const abs = path.resolve(p); if (underDir(abs, live)) return { live: abs }; if (depth > 16) return { missing: abs };
  const root = path.parse(abs).root; const parts = abs.slice(root.length).split(path.sep).filter(Boolean); let cur = root;
  for (let i = 0; i < parts.length; i++) {
    const next = path.join(cur, parts[i]); let st; try { st = fs.lstatSync(next); } catch (e) { return { missing: next }; }
    if (st.isSymbolicLink()) return resolveLib(path.join(path.resolve(cur, fs.readlinkSync(next)), ...parts.slice(i + 1)), live, depth + 1);
    cur = next;
  }
  return { real: cur };
}
const LIVE_TREE = liveTree();
if (!LIVE_TREE) libStop(2, 'OLCULEMEDI: canlı yayın ağacının kökü owner bloğundan (`$Rel`) okunamadı — canlı ağaç ret denetimi yapılamıyor; test BAŞLAMADI');
const LIB_SRC = process.env.D6T_LIB_ROOT ? 'D6T_LIB_ROOT' : 'bu checkout\'un proje kökü — D6T_LIB_ROOT verilmedi';
const LIB_GIVEN = path.resolve(process.env.D6T_LIB_ROOT || path.join(GOV, '..', '..'));
const LIB_HINT = 'D6T_LIB_ROOT ile Prisma istemcisi + bcrypt kurulu, CANLI OLMAYAN bir proje kökü verin';
const libRed = () => libStop(4, `RED: kütüphane kökü canlı yayın ağacına çözülüyor (${LIB_SRC}: ${maskUser(LIB_GIVEN)}) — izole test canlı ağaçtan modül YÜKLEMEZ; test BAŞLAMADI. ${LIB_HINT}.`);
const libRoot = resolveLib(LIB_GIVEN, LIVE_TREE);
if (libRoot.live) libRed();
if (libRoot.missing) libStop(2, `OLCULEMEDI: kütüphane kökü dizini yok ya da erişilemiyor (${LIB_SRC}: ${maskUser(LIB_GIVEN)} · ilk eksik bileşen: ${maskUser(libRoot.missing)}) — test BAŞLAMADI; canlı yayın ağacına DÜŞÜLMEZ. ${LIB_HINT}.`);
const LIB_ROOT = libRoot.real; const libDir = {};
for (const [name, sub] of Object.entries(LIB_SUB)) {
  const r = resolveLib(path.join(LIB_ROOT, ...sub), LIVE_TREE); if (r.live) libRed();
  let found = !r.missing; if (found) { try { require.resolve(r.real); } catch (e) { found = false; } }
  if (!found) libStop(2, `OLCULEMEDI: ${name} modülü kütüphane kökünde yok (${LIB_SRC}: ${maskUser(LIB_ROOT)} · aranan: ${sub.join('/')}) — test BAŞLAMADI; canlı yayın ağacına DÜŞÜLMEZ. ${LIB_HINT}.`);
  libDir[name] = r.real;
}
const PRISMA_ROOT = libDir['Prisma istemcisi']; const BCRYPT = libDir.bcrypt;
console.log(`kütüphane kökü: ${maskUser(LIB_ROOT)} (kaynak: ${LIB_SRC}; canlı yayın ağacı DEĞİL — Prisma istemcisi + bcrypt buradan yüklenir)`);
const API_PORT = 8199; const EXT_PORT = 8458;
const API = `http://127.0.0.1:${API_PORT}/api`; const EXT = `https://localhost:${EXT_PORT}`;
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36';
const R27_CAND_DIST = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'; // canlı ön koşul: R27 dist
const EX = require(RUN);

const rows = []; const check = (id, desc, ok, obs) => rows.push({ id, sonuc: ok ? 'PASS' : 'FAIL', aciklama: desc, gozlem: obs });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const hex8 = () => crypto.randomBytes(4).toString('hex');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// R03: disposable DB kendi tek kullanımlık konteynerinden gelir (port sabit DEĞİL). Kapı: yalnız 127.0.0.1 · port var ve 5432 DEĞİL · veritabanı
// adı `_test` ile biter ve `hukuk_db` DEĞİL. Koşucuya beklenen DB adı bu addan verilir (D6_EXPECT_DB).
let DB_NAME = null;
function dbUrl() {
  const u = process.env.D6T_DB_URL || ''; let p; try { p = new URL(u); } catch (e) { return null; }
  let name = ''; try { name = decodeURIComponent(p.pathname.replace(/^\//, '')); } catch (e) { return null; }
  if (p.hostname !== '127.0.0.1' || !p.port || p.port === '5432' || !/^[a-z0-9_]+_test$/.test(name) || name === 'hukuk_db') return null;
  DB_NAME = name; return u;
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
      D6_MODE: 'run', D6_LIVE_CONFIRM: '1', D6_LIVE_GO_REF: go, D6_RUNID: runId, D6_EXPECT_DB: DB_NAME,
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
    D6_MODE: 'recover', D6_RECOVER_CONFIRM: '1', D6_RUNID: prev.runId, D6_EXPECT_DB: DB_NAME, D6_API_BASE: API, D6_EXPECT_API: API,
    D6_EXPECT_BASE_URL: EXT, D6_LIVE_LOGIN_PW: pw, D6_RECEIPT: prev.receipt, D6_EVID_FILE: evid, D6_DISPLAY: 'none', D6_HTTP_TIMEOUT_MS: '5000', D6_CALL_TIMEOUT_MS: '8000',
    D6_POLL_MS: '300', D6_LATE_CREATE_MS: '6000' }, envOver || {});
  // `during`: Recover süreci ÇALIŞIRKEN paralel iş (ör. askıdaki hesap oluşturmayı serbest bırakmak) — D-4 kalıbı
  const started = Date.now(); let duringRes = null;
  const code = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; });
    if (during) during().then((r) => { duringRes = Object.assign({ atMs: Date.now() - started }, r); }).catch((e) => { duringRes = { error: String(e) }; });
    c.on('close', (x) => { fs.writeFileSync(path.join(dir, `${name}.log`), l, 'utf8'); res(x); }); });
  artifacts.push(path.join(dir, `${name}.log`), evid);
  const rc = JSON.parse(fs.readFileSync(prev.receipt, 'utf8').replace(/^﻿/, ''));   // R03-d: WinPS 5.1 ile yazılan makbuz BOM'lu olabilir
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
  if (!DBURL) { console.log('OLCULEMEDI: disposable DB (D6T_DB_URL → 127.0.0.1:<5432 dışı port>/<ad>_test; hukuk_db değil) yok — test BAŞLAMADI'); process.exit(2); }
  console.log(`disposable DB: 127.0.0.1:${new URL(DBURL).port}/${DB_NAME}`);
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
        && z16a.v('P6-C-DOC') === 'PASS' && /satır=0/.test(z16a.o('P6-C-DOC')) && /^yabancı satır hiç yazılmadı — silinen=0 kalan=0 \(ölçüldü\)$/.test(z16a.o('P6-FOREIGN-CLEAN')) && z16a.code === 2,
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

    // ==== R03 (b) — DEPOLAMA ERİŞİM HATASI ≠ DOĞRULANMIŞ YOKLUK / KALINTI (gerçek ACL reddi: dosya F + dizin RD; sahte API kendi kullanıcısına yazar)
    const nCalls = (cl, p) => cl.filter((c) => c.path === p).length;
    const nedenOf = (z) => ((z.ev && z.ev.recovery && z.ev.recovery.neden) || []);
    const z17a = await runScenario('z17a-d1d-storage-denied', dir, { upload: 'denyUntilNext' }, {}, shouldNot);
    const lift17a = await ctl('POST', '/__lift');
    check('Z17-a', '(ii) yükleme sonrası dosya/dizin erişimi REDDEDİLİYOR (bir sonraki belge isteğinde kalkar): D6-1D ÖLÇÜLEMEYEN (FAIL DEĞİL) + ayrı neden "depolama erişimi ÖLÇÜLEMEDİ (EPERM|EACCES)", kanıtta upload.disk.state=olculemez; gösterim kapısı KAPALI kaldı (giriş bilgisi gösterilmedi); koşucu kendi belgesini sildi, kapanış doğrulandı (D6-5D, P6-C-DOC, P6-D9 PASS); FAIL yok; çıkış 3 (önceki baytlarda D6-1D FAIL → 2)',
      z17a.code === 3 && z17a.v('D6-1D') === 'UNMEASURED' && /depolama erişimi ÖLÇÜLEMEDİ \((EPERM|EACCES)\)/.test(z17a.o('D6-1D')) && !!(z17a.ev && z17a.ev.upload && z17a.ev.upload.disk) && z17a.ev.upload.disk.state === 'olculemez'
        && z17a.ev.displayed === false && z17a.phone.length === 0 && z17a.v('D6-1') === 'PASS' && z17a.v('D6-3') === 'PASS' && z17a.v('D6-5D') === 'PASS' && z17a.v('P6-C-DOC') === 'PASS' && z17a.v('P6-D9') === 'PASS' && z17a.ev.fail === 0 && z17a.docs.length === 0,
      `çıkış=${z17a.code} · D6-1D=${z17a.v('D6-1D')} ${z17a.o('D6-1D').slice(-160)} · disk=${JSON.stringify(((z17a.ev || {}).upload || {}).disk)} · FAIL=${(z17a.ev || {}).fail} · kalkan ret=${lift17a.lifted}`);
    const z17b = await runScenario('z17b-d1d-file-missing', dir, { upload: 'noFile' }, {}, shouldNot);
    check('Z17-b', '(karşı durum) yükleme 201 + satır var ama dosya diskte DOĞRULANMIŞ olarak YOK (ENOENT): D6-1D FAIL ("diskte=yok(ENOENT)", erişim nedeni YOK), gösterim YOK, çıkış 2 — erişim reddi (Z17-a: ÖLÇÜLEMEYEN, çıkış 3) ile çıkış kodu ve kanıt AYRIDIR',
      z17b.code === 2 && z17b.v('D6-1D') === 'FAIL' && /diskte=yok\(ENOENT\)/.test(z17b.o('D6-1D')) && !/erişimi ÖLÇÜLEMEDİ/.test(z17b.o('D6-1D')) && z17b.ev.displayed === false && z17a.code !== z17b.code,
      `çıkış=${z17b.code} (Z17-a=${z17a.code}) · D6-1D=${z17b.v('D6-1D')} ${z17b.o('D6-1D').slice(-80)}`);

    const z18a = await runScenario('z18a-residue-file-stays', dir, { delete: 'noUnlink' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const dr18a = ((z18a.ev || {}).portalClose || {}).docResidue || {};
    check('Z18-a', '(i) kapanışta dosya GERÇEKTEN duruyor (stat var; erişim hatası yok): P6-C-DOC FAIL + "DOĞRULANMIŞ KALINTI", docResidue.durum=DOGRULANMIS_KALINTI, diskte kalan=1, erişim hatası=0; D6-5D FAIL; kurtarma nedeni kalıntıyı yazar, "depolama erişimi" YAZMAZ; çıkış 6',
      z18a.code === 6 && z18a.v('P6-C-DOC') === 'FAIL' && /DOĞRULANMIŞ KALINTI/.test(z18a.o('P6-C-DOC')) && dr18a.durum === 'DOGRULANMIS_KALINTI' && (dr18a.filesLeftOnDisk || []).length === 1 && (dr18a.filesAccessError || []).length === 0
        && z18a.v('D6-5D') === 'FAIL' && nedenOf(z18a).some((n) => /BELGE: sentetik belge KALDI — DOĞRULANMIŞ KALINTI/.test(n)) && !nedenOf(z18a).some((n) => /depolama erişimi/.test(n)),
      `çıkış=${z18a.code} · C-DOC=${z18a.v('P6-C-DOC')} · durum=${dr18a.durum} · neden=${nedenOf(z18a).join(' | ').slice(0, 200)}`);
    try { fs.unlinkSync(z18a.rc.documentFile); } catch (e) { /* test temizliği */ }
    const z18b = await runScenario('z18b-residue-dir-denied', dir, { delete: 'noUnlinkDeny' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const st18b = z18b.rc && z18b.rc.documentFile ? EX.fileState(z18b.rc.documentFile) : { state: 'yok' };   // ret hâlâ yerinde: bağımsız ölçüm
    const lift18b = await ctl('POST', '/__lift');
    const dr18b = ((z18b.ev || {}).portalClose || {}).docResidue || {};
    check('Z18-b', '(ii) kapanışta dizin/dosya erişimi REDDEDİLİYOR (satır 0; dosyanın durumu bilinemiyor): P6-C-DOC ÖLÇÜLEMEYEN (FAIL DEĞİL) + "depolama erişimi ÖLÇÜLEMEDİ", durum=ERISIM_OLCULEMEDI, erişim hatası=1, diskte kalan=0; D6-5D ÖLÇÜLEMEYEN; kurtarma nedeni erişimi yazar, "sentetik belge KALDI" YAZMAZ; çıkış 6 — (i) ile kanıt AYRI (çıkış kodu ikisinde de 6: kapanış ikisinde de doğrulanmadı)',
      st18b.state === 'olculemez' && lift18b.lifted === 1 && z18b.code === 6 && z18b.v('P6-C-DOC') === 'UNMEASURED' && /depolama erişimi ÖLÇÜLEMEDİ/.test(z18b.o('P6-C-DOC')) && dr18b.durum === 'ERISIM_OLCULEMEDI'
        && (dr18b.filesAccessError || []).length === 1 && (dr18b.filesLeftOnDisk || []).length === 0 && z18b.v('D6-5D') === 'UNMEASURED' && nedenOf(z18b).some((n) => /BELGE: depolama erişimi ÖLÇÜLEMEDİ/.test(n)) && !nedenOf(z18b).some((n) => /sentetik belge KALDI/.test(n)),
      `ret=${st18b.state} kalkan=${lift18b.lifted} · çıkış=${z18b.code} · C-DOC=${z18b.v('P6-C-DOC')} · durum=${dr18b.durum} · neden=${nedenOf(z18b).join(' | ').slice(0, 200)}`);
    try { fs.unlinkSync(z18b.rc.documentFile); } catch (e) { /* test temizliği */ }
    const z18c = await runScenario('z18c-residue-row-and-denied', dir, { delete: 'failDeny' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const dr18c = ((z18c.ev || {}).portalClose || {}).docResidue || {};
    check('Z18-c', '(i)+(ii) BİRLİKTE: satır KALDI (doğrulanmış) + dosya erişimi reddediliyor → D6-5D FAIL ("DOĞRULANMIŞ KALINTI (satır)" + ayrıca erişim) ve P6-C-DOC FAIL (ÖLÇÜLEMEYEN\'e İNMEDİ), durum=DOGRULANMIS_KALINTI, satır=1, erişim hatası=1 ayrıca listelendi; kurtarma nedeni İKİ AYRI satır (kalıntı + depolama erişimi); çıkış 6',
      z18c.code === 6 && z18c.v('D6-5') === 'FAIL' && z18c.v('D6-5D') === 'FAIL' && /DOĞRULANMIŞ KALINTI \(satır\)/.test(z18c.o('D6-5D')) && /depolama erişimi ÖLÇÜLEMEDİ/.test(z18c.o('D6-5D'))
        && z18c.v('P6-C-DOC') === 'FAIL' && /depolama erişimi ÖLÇÜLEMEDİ/.test(z18c.o('P6-C-DOC')) && dr18c.durum === 'DOGRULANMIS_KALINTI' && dr18c.rows === 1 && (dr18c.filesAccessError || []).length === 1
        && nedenOf(z18c).some((n) => /BELGE: sentetik belge KALDI — DOĞRULANMIŞ KALINTI/.test(n)) && nedenOf(z18c).some((n) => /BELGE: depolama erişimi ÖLÇÜLEMEDİ/.test(n)),
      `çıkış=${z18c.code} · D6-5D=${z18c.v('D6-5D')} · C-DOC=${z18c.v('P6-C-DOC')} · durum=${dr18c.durum} satır=${dr18c.rows} erişim=${(dr18c.filesAccessError || []).length} · neden=${nedenOf(z18c).length}`);
    const r18d = await recover(z18c, dir, 'z18d-recover-row-and-denied', {});   // ret HÂLÂ yerinde (/__lift çağrılmadı); kalıntı kararı H
    const lift18d = await ctl('POST', '/__lift');
    const adim18d = (r18d.ev && r18d.ev.recovery && r18d.ev.recovery.adim) || '';
    check('Z18-d', 'aynı ret altında Recover (kalıntı kararı H): P6-C-DOC FAIL (satır=1 doğrulanmış; ÖLÇÜLEMEYEN\'e inmedi) + erişim hatası ayrıca; adım ÖNERİDİR ve kalan satırı VE kova okunabilirliğini AYRI yazar; "Recover BİR KEZ daha" YOK, "İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR" VAR; çıkış 6',
      r18d.code === 6 && r18d.v('P6-C-DOC') === 'FAIL' && /^ÖNERİ \(yetki DEĞİL\)/.test(adim18d) && /kalan belge satırı=1/.test(adim18d) && /okunabilirliği/.test(adim18d) && !/BİR KEZ daha/.test(adim18d) && /İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR/.test(adim18d) && lift18d.lifted >= 1,
      `çıkış=${r18d.code} · C-DOC=${r18d.v('P6-C-DOC')} · kalkan ret=${lift18d.lifted} · adım=${adim18d.slice(0, 220)}`);
    await prisma.portalDocument.deleteMany({ where: { clientId: z18c.rc.clientId } }); try { fs.unlinkSync(z18c.rc.documentFile); } catch (e) { /* test temizliği */ }

    // ==== R03 (a) — Run'ın KENDİ kapanışında personel oturumu reddi: yalnız 401/403'te BİR KEZ yeniden giriş + TEK yeniden deneme
    const DIS = '/api/portal/admin/disable-user'; const LOGIN = '/api/auth/login';
    const z19a = await runScenario('z19a-staff-token-expired-on-close', dir, { staffAuth: 'expireOnDisable' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const sr19a = ((z19a.ev || {}).portalClose || {}).staffReauth || {};
    check('Z19-a', 'personel token\'ı kapanış anında geçersiz (ilk disable-user 401): koşucu BİR KEZ yeniden giriş yapar (aynı sentetik personel), kapatmayı BİR KEZ yeniden dener (201) → portal kapandı (P6-C1/C2/C2V/C5 PASS), P6-D9 PASS, çıkış 0 (6 DEĞİL); disable-user 2 çağrı, personel girişi 2 (koşum başı + yenileme); kanıtta staffReauth 401 → giriş 201 → yeniden deneme 201; personel yine pasif',
      z19a.code === 0 && ['P6-C1', 'P6-C2', 'P6-C2V', 'P6-C5', 'P6-D9', 'U-CLOSE'].every((id) => z19a.v(id) === 'PASS') && !!z19a.pu && z19a.pu.isActive === false && z19a.cl.hasPortalAccess === false
        && nCalls(z19a.calls, DIS) === 2 && nCalls(z19a.calls, LOGIN) === 2 && sr19a.neden === 'disable-user HTTP 401' && sr19a.giris === 'HTTP 201' && sr19a.yenidenDeneme === 'HTTP 201'
        && /YENİLENDİ/.test(z19a.o('P6-C1')) && (z19a.ev.calledEndpoints || []).some((c) => /auth\/login \(kapanış/.test(c)) && z19a.activeUsers === 0,
      `çıkış=${z19a.code} · disable=${nCalls(z19a.calls, DIS)} · giriş=${nCalls(z19a.calls, LOGIN)} · staffReauth=${JSON.stringify(sr19a)} · C1=${z19a.o('P6-C1').slice(-120)}`);
    const z19b = await runScenario('z19b-staff-forbidden-on-close', dir, { disable: 'forbidden' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const sr19b = ((z19b.ev || {}).portalClose || {}).staffReauth || {};
    check('Z19-b', 'kapatma ucu her çağrıda 403 (yetki reddi): yeniden giriş BİR KEZ, yeniden deneme BİR KEZ, sonra DURUR (döngü yok) → disable-user tam 2, personel girişi tam 2; portal AÇIK kaldı (P6-C2 FAIL), çıkış 6; staffReauth 403 → 201 → 403; kurtarma nedeni personel oturumu reddini yazar; personel/dosya kapanışı yine yapıldı (U-CLOSE PASS)',
      z19b.code === 6 && nCalls(z19b.calls, DIS) === 2 && nCalls(z19b.calls, LOGIN) === 2 && sr19b.neden === 'disable-user HTTP 403' && sr19b.giris === 'HTTP 201' && sr19b.yenidenDeneme === 'HTTP 403'
        && z19b.v('P6-C2') === 'FAIL' && z19b.v('U-CLOSE') === 'PASS' && !!z19b.pu && z19b.pu.isActive === true && nedenOf(z19b).some((n) => /PERSONEL OTURUMU kapanışta reddedildi \(disable-user HTTP 403\)/.test(n)),
      `çıkış=${z19b.code} · disable=${nCalls(z19b.calls, DIS)} · giriş=${nCalls(z19b.calls, LOGIN)} · staffReauth=${JSON.stringify(sr19b)}`);
    const z19c = await runScenario('z19c-disable-notfound', dir, { disable: 'notFound' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z19-c', 'kapatma ucu 404 (kimlik dışı 4xx): yeniden giriş YOK, yeniden deneme YOK → disable-user 1, personel girişi 1, staffReauth yok, P6-C2 FAIL, çıkış 6',
      z19c.code === 6 && nCalls(z19c.calls, DIS) === 1 && nCalls(z19c.calls, LOGIN) === 1 && !((z19c.ev || {}).portalClose || {}).staffReauth && z19c.v('P6-C2') === 'FAIL',
      `çıkış=${z19c.code} · disable=${nCalls(z19c.calls, DIS)} · giriş=${nCalls(z19c.calls, LOGIN)}`);

    // ==== R03-b — "ürün bulgusu" YALNIZ DB kapanışı ölçülmüşken (P6-C2 PASS); portal açık satırı ürün bulgusu / kalıntı / erişim hatası satırlarından
    // BAĞIMSIZ (bağımsız doğrulama MAJOR + MINOR 1). Önceki baytlarda kapatma yapılmadığında koşucu oturumunun 200 dönmesi "ÜRÜN BULGUSU … Recover
    // düzeltemez" yazıyor ve else-if zinciri "PORTAL ERİŞİMİ kapandığı doğrulanmadı" satırını bastırıyordu.
    const pcOf = (z) => ((z.ev || {}).portalClose || {});
    const openLineOf = (z) => nedenOf(z).find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || '';
    // R03-e: DEĞİŞTİ — kapatma yapılmadı + sürüm verilme sürümüne eşit = tablo T5: 200 "ürün bulgusu SAYILMADI (T5) — kapatma DB'ye yansımadı …"; kapatma metni
    // ölçülenle ("kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB'de AÇIK (… sürüm a→a)"; "hâlâ" YOK); portal satırı "…: açık erişim kapatılmalıdır (Recover
    // kapatabilir)" + oturum satırına atıf; oturum satırı AYRI ("PORTAL: mevcut oturum HTTP 200 — ürün bulgusu SAYILMADI (T5: …)").
    const portalOpenLine = (z) => { const l = openLineOf(z); return /P6-C2=FAIL/.test(l) && /— kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de AÇIK \(isActive=true hasPortalAccess=true sürüm (\d+)→\1\): açık erişim kapatılmalıdır \(Recover kapatabilir\)/.test(l)
      && /; koşucu oturumunun erişmesi AYRI satırdadır \(ürün bulgusu SAYILMADI\)/.test(l) && !/hâlâ/.test(l); };
    const noFalseFinding = (z) => !!z.ev && !z.ev.productFinding && !pcOf(z).productFinding && !nedenOf(z).some((n) => /ÜRÜN BULGUSU|Recover düzeltemez/.test(n)) && !/ÜRÜN BULGUSU/.test(z.o('P6-D9'))
      && (pcOf(z).sessionVersion || {}).sinif === 'SAYILMADI' && (pcOf(z).sessionVersion || {}).hucre === 'T5'
      && ['P6-C4L', 'P6-C4D'].every((id) => z.v(id) === 'FAIL' && /^HTTP 200 — ürün bulgusu SAYILMADI \(T5\) — kapatma DB'ye yansımadı — hesap HTTP ölçümlerinden önce ve sonra açık \(isActive=true\) ve sürüm verilme sürümüyle aynı \(\d+\); guard bu durumda oturumu kabul eder → 200 beklenir; ürün bulgusu değil/.test(z.o(id))
        && /· kapatma: kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de AÇIK \(isActive=true hasPortalAccess=true sürüm (\d+)→\1\)/.test(z.o(id)) && !/\(ürün bulgusu\)|hâlâ/.test(z.o(id)))
      && nedenOf(z).some((n) => /^PORTAL: mevcut oturum HTTP 200 — ürün bulgusu SAYILMADI \(T5: kapatma DB'ye yansımadı/.test(n));
    const sum20 = (z) => `çıkış=${z.code} · C2=${z.v('P6-C2')} · bulgu=${JSON.stringify((z.ev || {}).productFinding || null)} · C4L=${z.o('P6-C4L').slice(0, 120)} · neden=${nedenOf(z).join(' | ').slice(0, 300)}`;
    check('Z20-a', 'kapatma ucu 403 (Z19-b koşumu; portal AÇIK kaldı, sürüm değişmedi): R03-e — 200 tablo T5: "ürün bulgusu SAYILMADI (T5) — kapatma DB\'ye yansımadı … 200 beklenir; ürün bulgusu değil" + "· kapatma: kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de AÇIK (isActive=true hasPortalAccess=true sürüm a→a)" ("hâlâ" YOK); productFinding yok; neden ve P6-D9\'da "ÜRÜN BULGUSU" / "Recover düzeltemez" yok; kurtarma nedeninde portal satırı (P6-C2=FAIL + ölçülen kapatma metni + "(Recover kapatabilir)") ve AYRI oturum satırı ("ürün bulgusu SAYILMADI (T5: …)"); personel reddi satırı da var',
      z19b.code === 6 && z19b.v('P6-C2') === 'FAIL' && noFalseFinding(z19b) && portalOpenLine(z19b) && nedenOf(z19b).some((n) => /PERSONEL OTURUMU kapanışta reddedildi/.test(n)), sum20(z19b));
    check('Z20-b', 'kapatma ucu 404 (Z19-c koşumu; portal AÇIK kaldı): "ürün bulgusu" YAZILMAZ; P6-C4L/D gözlemi portalın DB\'de açık olduğunu söyler; kurtarma nedeninde portal açık satırı VAR',
      z19c.code === 6 && z19c.v('P6-C2') === 'FAIL' && noFalseFinding(z19c) && portalOpenLine(z19c), sum20(z19c));
    const z20c = await runScenario('z20c-relogin-ratelimited', dir, { staffAuth: 'expireOnDisable', relogin: 'rateLimit' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const sr20c = pcOf(z20c).staffReauth || {};
    check('Z20-c', 'kapanışta personel token\'ı geçersiz (401) ve YENİDEN GİRİŞ hız sınırına takılıyor (429): yeniden deneme YAPILMAZ (disable-user 1, personel girişi 2), staffReauth 401 → 429 → yapılmadı; portal AÇIK kaldı (P6-C2 FAIL); "ürün bulgusu" YAZILMAZ; kurtarma nedeninde portal açık satırı + personel reddi satırı VAR; çıkış 6',
      z20c.code === 6 && nCalls(z20c.calls, DIS) === 1 && nCalls(z20c.calls, LOGIN) === 2 && sr20c.neden === 'disable-user HTTP 401' && sr20c.giris === 'HTTP 429' && !sr20c.yenidenDeneme && z20c.v('P6-C2') === 'FAIL' && !!z20c.pu && z20c.pu.isActive === true
        && noFalseFinding(z20c) && portalOpenLine(z20c) && nedenOf(z20c).some((n) => /PERSONEL OTURUMU kapanışta reddedildi \(disable-user HTTP 401\); tek yeniden giriş: HTTP 429; tek yeniden deneme: yapılmadı/.test(n)),
      `disable=${nCalls(z20c.calls, DIS)} · giriş=${nCalls(z20c.calls, LOGIN)} · staffReauth=${JSON.stringify(sr20c)} · ${sum20(z20c)}`);
    const z20d = await runScenario('z20d-disable-5xx-twice', dir, { disable: 'fail' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z20-d', 'kapatma ucu iki kez 500 (en çok iki adım; yeniden giriş YOK): disable-user 2, personel girişi 1, staffReauth yok; portal AÇIK kaldı (P6-C2 FAIL); "ürün bulgusu" YAZILMAZ; kurtarma nedeninde portal açık satırı iki 500 çağrısıyla VAR; çıkış 6',
      z20d.code === 6 && nCalls(z20d.calls, DIS) === 2 && nCalls(z20d.calls, LOGIN) === 1 && !pcOf(z20d).staffReauth && JSON.stringify(pcOf(z20d).disableCalls) === JSON.stringify(['HTTP 500', 'HTTP 500']) && z20d.v('P6-C2') === 'FAIL'
        && noFalseFinding(z20d) && portalOpenLine(z20d) && /kapatma çağrıları: HTTP 500 · HTTP 500/.test(openLineOf(z20d)),
      `disable=${nCalls(z20d.calls, DIS)} · çağrılar=${JSON.stringify(pcOf(z20d).disableCalls || null)} · ${sum20(z20d)}`);
    const l12 = nedenOf(z12);
    check('Z20-e', 'GERÇEK ürün bulgusu korunur (Z12 koşumu, guard bayat): DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken (P6-C2/C2V/C5 PASS) koşucu oturumu 200 → productFinding YAZILIR ve ölçülen dayanağını adlandırır (R03-c: "(P6-C2 PASS + P6-C5 PASS)"); P6-C4L/D FAIL "… (P6-C2 PASS + P6-C5 PASS) MEVCUT OTURUM KAPANMADI (ürün bulgusu)"; kurtarma nedeni ÜRÜN BULGUSU satırını aynı dayanak + "Recover düzeltemez" ile yazar, "PORTAL ERİŞİMİ kapandığı doğrulanmadı" YAZMAZ; çıkış 6',
      z12.code === 6 && ['P6-C2', 'P6-C2V', 'P6-C5'].every((id) => z12.v(id) === 'PASS') && /\(P6-C2 PASS \+ P6-C5 PASS\)/.test((z12.ev && z12.ev.productFinding) || '')
        && ['P6-C4L', 'P6-C4D'].every((id) => /HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P6-C2 PASS \+ P6-C5 PASS\) MEVCUT OTURUM KAPANMADI \(ürün bulgusu\)/.test(z12.o(id)))
        && l12.some((n) => /ÜRÜN BULGUSU — DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P6-C2 PASS \+ P6-C5 PASS\)/.test(n) && /Recover düzeltemez/.test(n)) && !l12.some((n) => /PORTAL ERİŞİMİ kapandığı doğrulanmadı/.test(n)),
      `çıkış=${z12.code} · bulgu=${JSON.stringify((z12.ev || {}).productFinding || null)} · C4L=${z12.o('P6-C4L').slice(0, 110)} · neden=${l12.join(' | ').slice(0, 220)}`);
    const z20f = await runScenario('z20f-residue-and-portal-open', dir, { delete: 'fail', disable: 'notFound' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const dr20f = pcOf(z20f).docResidue || {};
    check('Z20-f', 'doğrulanmış kalıntı + portal AÇIK BİRLİKTE (ürün DELETE\'i 500 + kapatma ucu 404): P6-C-DOC FAIL (durum=DOGRULANMIS_KALINTI, satır=1) VE P6-C2 FAIL; kurtarma nedeninde İKİ satır da VAR ("BELGE: sentetik belge KALDI — DOĞRULANMIŞ KALINTI" + portal açık satırı; kalıntı satırı portal satırını BASTIRMAZ); "ürün bulgusu" YAZILMAZ; çıkış 6',
      z20f.code === 6 && z20f.v('P6-C-DOC') === 'FAIL' && dr20f.durum === 'DOGRULANMIS_KALINTI' && dr20f.rows === 1 && z20f.v('P6-C2') === 'FAIL' && portalOpenLine(z20f)
        && nedenOf(z20f).some((n) => /^BELGE: sentetik belge KALDI — DOĞRULANMIŞ KALINTI/.test(n)) && noFalseFinding(z20f),
      `C-DOC=${z20f.v('P6-C-DOC')} durum=${dr20f.durum} satır=${dr20f.rows} · ${sum20(z20f)}`);
    if (z20f.rc) { for (const d of z20f.docs) { try { fs.unlinkSync(d.filePath); } catch (e) { /* test temizliği */ } } await prisma.portalDocument.deleteMany({ where: { clientId: z20f.rc.clientId } }); }
    // MINOR 2 — Recover çıkış 3 adımı kanıttaki verdict'lerden: birim (portal hesabı YOK / DB kapalı) + bu öz-testin gerçek Recover çıkış 3 kanıtları + statik
    const rsf = typeof EX.recoverStepText === 'function' ? EX.recoverStepText : null;
    const doc0 = { durum: 'YOK', rows: 0, filesLeftOnDisk: [], filesAccessError: [] };
    const tAbs = rsf ? String(rsf({ exitCode: 3, recovery: { gerekli: true }, portalClose: { ok: true, accountAbsent: true, docResidue: doc0 }, results: [{ id: 'P6-C1', verdict: 'PASS' }, { id: 'P6-C-DOC', verdict: 'PASS' }, { id: 'P6-FOREIGN-CLEAN', verdict: 'UNMEASURED' }, { id: 'U-CLOSE', verdict: 'PASS' }] })) : '';
    const tCl = rsf ? String(rsf({ exitCode: 3, recovery: { gerekli: true }, portalClose: { ok: false, docResidue: doc0 }, results: [{ id: 'P6-C2', verdict: 'PASS' }, { id: 'P6-C5', verdict: 'PASS' }, { id: 'P6-C4L', verdict: 'UNMEASURED' }, { id: 'P6-C4D', verdict: 'UNMEASURED' }] })) : '';
    const rec3 = [r5c, r6c, r8c, r16b, r16d, r16e2].filter((r) => r && r.code === 3 && r.ev && r.ev.recovery && r.ev.recovery.gerekli);
    const rec3Bad = rec3.filter((r) => { const a = r.ev.recovery.adim || ''; return !/^ÖNERİ \(yetki DEĞİL\): Recover TEKRARLANMAZ/.test(a) || !a.includes(`P6-C2=${r.v('P6-C2')} · P6-C5=${r.v('P6-C5')}`) || /DB kapalı \(P6-C2\/C5 PASS\)/.test(a); });
    const srcRun = fs.readFileSync(RUN, 'utf8');
    check('Z20-g', 'Recover çıkış 3 adımı kanıttaki verdict\'lerden kurulur: portal hesabı YOKKEN (P6-C2/C5 üretilmez) metin "PASS" İDDİA ETMEZ ("P6-C2=ÜRETİLMEDİ · P6-C5=ÜRETİLMEDİ (portal hesabı YOK …)"); DB kapalı ölçülmüşken "P6-C2=PASS · P6-C5=PASS" + ÖLÇÜLEMEYEN satırları adıyla; bu öz-testin gerçek Recover çıkış 3 kanıtlarında (≥ 4) adım kanıttaki P6-C2/C5 verdict\'ini yazar; koşucu kaynağında sabit "DB kapalı (P6-C2/C5 PASS)" YOK',
      !!rsf && /P6-C2=ÜRETİLMEDİ · P6-C5=ÜRETİLMEDİ \(portal hesabı YOK/.test(tAbs) && !/PASS/.test(tAbs) && /^ÖNERİ \(yetki DEĞİL\)/.test(tAbs) && /P6-C2=PASS · P6-C5=PASS/.test(tCl) && /ÖLÇÜLEMEYEN satırlar \(P6-C4L,P6-C4D\)/.test(tCl)
        && rec3.length >= 4 && rec3Bad.length === 0 && !srcRun.includes('DB kapalı (P6-C2/C5 PASS)'),
      `fonksiyon=${!!rsf} · hesap yok=${tAbs.slice(0, 160)} · gerçek çıkış 3 kanıtı=${rec3.length} sorunlu=${rec3Bad.length} · kaynakta sabit iddia=${srcRun.includes('DB kapalı (P6-C2/C5 PASS)')}`);
    // MINOR 1 — kurtarma nedeni birim ölçümü (gerçek senaryosu zor üretilen dallar): portal satırı erişim hatası / DB okuma hatası / ürün bulgusundan bağımsız
    const raf = typeof EX.recoveryAdvice === 'function' ? EX.recoveryAdvice : null;
    const R6 = (pairs) => pairs.map(([id, verdict]) => ({ id, verdict }));
    const u1 = raf ? raf({ closure: { ok: true }, results: R6([['P6-C1', 'FAIL'], ['P6-C2', 'FAIL'], ['P6-C2V', 'FAIL'], ['P6-C5', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, after: { isActive: true, hasPortalAccess: true }, docResidue: { durum: 'ERISIM_OLCULEMEDI', rows: 0, filesLeftOnDisk: [], filesAccessError: ['a.pdf:EPERM'] } } }, null, 'run') : {};
    const u2 = raf ? raf({ closure: { ok: true }, results: R6([['P6-C1', 'PASS'], ['P6-C2', 'PASS'], ['P6-C2V', 'PASS'], ['P6-C5', 'PASS'], ['P6-C3L', 'PASS'], ['P6-C3D', 'PASS'], ['P6-C4L', 'PASS'], ['P6-C4D', 'PASS'], ['P6-C-DOC', 'UNMEASURED']]), portalClose: { ok: false, portalDbClosed: true, docResidue: { durum: 'OLCULEMEDI_DB', rows: null, filesLeftOnDisk: [], filesAccessError: [], error: 'okuma hatası' } } }, null, 'run') : {};
    // R03-c: (iii) girdisine HTTP ölçümlerinden sonraki DB değeri (afterMeasure: AÇIK) eklendi; beklenti değişti — P6-C5 FAIL iken ürün bulgusu satırı YOK.
    const u3 = raf ? raf({ closure: { ok: true }, results: R6([['P6-C1', 'PASS'], ['P6-C2', 'PASS'], ['P6-C2V', 'PASS'], ['P6-C5', 'FAIL'], ['P6-C4L', 'FAIL'], ['P6-C4D', 'FAIL']]), portalClose: { ok: false, portalDbClosed: false, productFinding: 'ÜRÜN BULGUSU: x', after: { isActive: false, hasPortalAccess: false }, afterMeasure: { isActive: true, hasPortalAccess: true }, sessionDuringChange: true, docResidue: doc0 } }, null, 'run') : {};
    const n1 = u1.neden || []; const n2 = u2.neden || []; const n3 = u3.neden || [];
    check('Z20-h', 'kurtarma nedeni (birim): (i) portal DB\'de AÇIK + depolama erişim hatası → portal açık satırı ("P6-C1=FAIL,P6-C2=FAIL,P6-C2V=FAIL,P6-C5=FAIL) — DB\'de AÇIK (isActive=true hasPortalAccess=true)"; R03-e: "hâlâ" YOK) VE "BELGE: depolama erişimi ÖLÇÜLEMEDİ" ikisi de; (ii) portal DB\'de kapalı + belge satırları DB\'den okunamadı → "BELGE: belge kalıntısı ÖLÇÜLEMEDİ …" satırı, "PORTAL ERİŞİMİ" satırı YOK (önceki baytlar bu durumda portal kapanmadı derdi); (iii) R03-c: kanıtta ürün bulgusu metni olsa da P6-C5 FAIL (HTTP sonrası DB AÇIK) → ürün bulgusu / "Recover düzeltemez" satırı YOK; "PORTAL ERİŞİMİ kapandığı doğrulanmadı (P6-C5=FAIL)" satırı HTTP ölçümlerinden SONRAKİ değerlerle "yeniden AÇILDI … açık erişim kapatılmalıdır" der ("hâlâ AÇIK" YOK: kapanış anındaki DB kapalıydı)',
      !!raf && n1.some((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(P6-C1=FAIL,P6-C2=FAIL,P6-C2V=FAIL,P6-C5=FAIL\) — DB'de AÇIK \(isActive=true hasPortalAccess=true\)/.test(n) && !/hâlâ/.test(n)) && n1.some((n) => /^BELGE: depolama erişimi ÖLÇÜLEMEDİ/.test(n))
        && n2.some((n) => /^BELGE: belge kalıntısı ÖLÇÜLEMEDİ — bu müvekkilin belge satırları DB'den okunamadı \(okuma hatası\)/.test(n)) && !n2.some((n) => /PORTAL ERİŞİMİ|^PORTAL:/.test(n))
        && !n3.some((n) => /ÜRÜN BULGUSU|Recover düzeltemez/.test(n)) && n3.some((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(P6-C5=FAIL\) — kapatmadan sonra DB'de kapalı ölçüldü \(P6-C2=PASS\) ama hesap ölçüm sırasında yeniden AÇILDI \(P6-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true\): açık erişim kapatılmalıdır/.test(n) && !/hâlâ AÇIK/.test(n)),
      `fonksiyon=${!!raf} · (i) ${n1.map((n) => n.slice(0, 70)).join(' | ')} · (ii) ${n2.map((n) => n.slice(0, 70)).join(' | ')} · (iii) ${n3.map((n) => n.slice(0, 160)).join(' | ')}`);

    // ==== R03-c — (a) ürün bulgusu yalnız P6-C2 PASS + P6-C5 PASS; (b) makbuz dosyası yazılamaz / bulunamazsa uygulanamayan Recover komutu önerilmez
    // R03-d (M1): Z21-a DEĞİŞTİ — R03-c beklentisi ("ürün bulgusu adayı DEĞİL") YANLIŞTI. Ürün (HY_WT_R27): guard eski oturumu sürüm farkıyla isActive'ten
    // BAĞIMSIZ reddeder; yeniden açma sürümü ARTIRIR. Sahte API artık yeniden açmada sürümü ürün gibi artırır (verilen + 2: kapatma +1, yeniden açma +1).
    const z21a = await runScenario('z21a-reopen-during-measure', dir, { guard: 'stale', reopen: 'afterDisable' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const n21a = nedenOf(z21a); const line21a = n21a.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || '';
    const cand21a = n21a.find((n) => /^PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI/.test(n)) || ''; const sv21a = pcOf(z21a).sessionVersion || {};
    // R03-e: Z21-a DEĞİŞTİ — aynı koşum artık tablo T2 (verilme b < HTTP öncesi a = b+1 < sonrası c = b+2): "ÜRÜN BULGUSU ADAYI (T2)"; ürün bulgusu metni
    // açık-erişim / yeniden açılma metnini İÇERMEZ (o AYRI satırda ve portalClose.acikErisim'de); P6-C4 gözlemi iki DB ölçümünü yazar.
    check('Z21-a', 'R03-e (R03-d\'den değişti): guard KUSUR taklidi + hesap HTTP ölçümleri SIRASINDA yeniden açıldı (sahte API reopen afterDisable; yeniden açma sürümü ürün gibi ARTIRIR): P6-C2 PASS, P6-C5 FAIL; koşucu oturumu 200 → tablo T2: P6-C4L/D FAIL + "ÜRÜN BULGUSU ADAYI (T2) — eski oturum sürüm reddine rağmen erişti (oturumun verildiği sürüm b, HTTP öncesi DB sürümü b+1, sonrası b+2 …)" + "· DB: HTTP öncesi isActive=false hasPortalAccess=false … → sonrası isActive=true hasPortalAccess=true …"; productFinding "ÜRÜN BULGUSU ADAYI (T2): … oturum reddi ürün tarafıdır, Recover düzeltemez" ("yeniden AÇILDI" / "(Recover kapatabilir)" İÇERMEZ); sessionVersion ADAY/T2 (httpOncesi=b+1, olcumSonrasi=b+2, kaynak claim); acikErisim AYRI: "portal hesabı açık (…) — açık erişim kapatılmalıdır (Recover kapatabilir)"; kurtarma nedeninde AYRI aday satırı ("Recover düzeltemez") VE portal satırı "yeniden AÇILDI (P6-C5 FAIL …): açık erişim kapatılmalıdır (Recover kapatabilir); … AYRI satırdadır (ÜRÜN BULGUSU ADAYI)" ("Recover düzeltemez" YOK); "adayı DEĞİL" / "SAYILMADI" HİÇBİR yerde YOK; DB\'de hesap AÇIK ve sürüm = ölçüm sonrası; çıkış 6',
      z21a.code === 6 && z21a.v('P6-C2') === 'PASS' && z21a.v('P6-C5') === 'FAIL' && !!z21a.ev && sv21a.sinif === 'ADAY' && sv21a.hucre === 'T2' && Number.isInteger(sv21a.verilen) && sv21a.httpOncesi === sv21a.verilen + 1 && sv21a.olcumSonrasi === sv21a.verilen + 2 && sv21a.verilenKaynak === 'claim'
        && /^ÜRÜN BULGUSU ADAYI \(T2\): eski portal oturumu sürüm reddine rağmen belge listesine erişti \(oturumun verildiği sürüm \d+, HTTP öncesi DB sürümü \d+, sonrası \d+ — ürün yazıcıları yalnız artırdığından istek anında da farklıydı/.test(z21a.ev.productFinding || '') && /oturum reddi ürün tarafıdır, Recover düzeltemez$/.test(z21a.ev.productFinding || '') && !/yeniden AÇILDI|Recover kapatabilir|açık erişim/.test(z21a.ev.productFinding || '')
        && ['P6-C4L', 'P6-C4D'].every((id) => z21a.v(id) === 'FAIL' && /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(oturumun verildiği sürüm \d+, HTTP öncesi DB sürümü \d+, sonrası \d+/.test(z21a.o(id)) && /· DB: HTTP öncesi isActive=false hasPortalAccess=false sürüm=\d+ → sonrası isActive=true hasPortalAccess=true sürüm=\d+$/.test(z21a.o(id)))
        && /^portal hesabı açık \(HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true sürüm=\d+\) — açık erişim kapatılmalıdır \(Recover kapatabilir\)$/.test(pcOf(z21a).acikErisim || '')
        && /^PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI \(T2\)/.test(cand21a) && /oturum reddi ürün tarafıdır, Recover düzeltemez/.test(cand21a) && !/Recover kapatabilir/.test(cand21a) && cand21a !== line21a && /AYRI satırdadır \(ÜRÜN BULGUSU ADAYI\)/.test(line21a)
        && /\(P6-C5=FAIL\)/.test(line21a) && /hesap ölçüm sırasında yeniden AÇILDI \(P6-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true\): açık erişim kapatılmalıdır \(Recover kapatabilir\)/.test(line21a) && !/Recover düzeltemez/.test(line21a)
        && /ÜRÜN BULGUSU ADAYI/.test(z21a.o('P6-D9')) && ![...n21a, z21a.o('P6-C4L'), z21a.o('P6-C4D'), z21a.ev.productFinding || ''].some((t) => /adayı DEĞİL|SAYILMADI/.test(t))
        && !!z21a.pu && z21a.pu.isActive === true && !!z21a.cl && z21a.cl.hasPortalAccess === true && z21a.pu.tokenVersion === sv21a.olcumSonrasi,
      `çıkış=${z21a.code} · C2=${z21a.v('P6-C2')} C5=${z21a.v('P6-C5')} · sınıf=${JSON.stringify(sv21a)} · bulgu=${String((z21a.ev || {}).productFinding || '').slice(0, 160)} · C4L=${z21a.o('P6-C4L').slice(0, 200)} · aday satırı=${cand21a.slice(0, 160)} · portal satırı=${line21a.slice(0, 260)} · DB sonra=${JSON.stringify(z21a.pu)}/${JSON.stringify(z21a.cl)}`);

    const rfs = typeof EX.receiptFileState === 'function' ? EX.receiptFileState : null;
    const memR = { record: EX.RECEIPT_RECORD, runId: 'abcdef12', tenantId: 't', tenantSlug: 'ah-abcdef12', clientId: 'k', elevUserId: 'u', elevEmail: 'e@ornek.invalid' };
    const rDir = path.join(dir, 'z21b'); fs.mkdirSync(rDir);
    const okP = path.join(rDir, 'var.json'); fs.writeFileSync(okP, JSON.stringify(memR, null, 1));
    const badP = path.join(rDir, 'bozuk.json'); fs.writeFileSync(badP, '{"record":"BASKA"}');
    const dirP = path.join(rDir, 'klasor.json'); fs.mkdirSync(dirP); const goneP = path.join(rDir, 'yok.json');
    const out21 = (extra) => Object.assign({ closure: { ok: false }, results: [], portalClose: { ok: true } }, extra || {});
    const adimOf = (o, p, m, e) => { try { return raf ? (raf(o, p, m, e) || {}) : {}; } catch (x) { return { adim: `HATA ${x.message}` }; } };
    const aOk = adimOf(out21({ receipt: memR }), okP, 'run');
    const aGone = adimOf(out21({ receipt: memR, receiptWriteError: 'ENOENT: yazılamadı' }), goneP, 'run'); const aDir = adimOf(out21({ receipt: memR }), dirP, 'run'); const aBad = adimOf(out21({ receipt: memR }), badP, 'run');
    const aNone = adimOf(out21({}), null, 'run'); const aRec = adimOf(out21({}), goneP, 'recover');
    const noCmd = (a) => !String(a.adim || '').includes('-ReceiptFile <makbuz>');
    // R03-d (m4): "kullanılabilir yol" artık kanıttaki recovery.makbuzJson'dan yeni dosya yazan TEK komut + AYRI owner onayıyla -ReceiptFile '<yeni makbuz>'
    const altPath = (a) => /— ama makbuz dosyası (YOK|OKUNAMIYOR|BAYAT) \(/.test(a.adim || '') && /bu makbuz dosyasıyla Recover ÖNERİLMEZ/.test(a.adim || '') && /Kullanılabilir yol: makbuzun son hâli bu kanıttaki `recovery\.makbuzJson` alanıdır/.test(a.adim || '')
      && String(a.adim || '').includes('`(Get-Content -Raw -Encoding UTF8 -LiteralPath ') && String(a.adim || '').includes(').recovery.makbuzJson | Set-Content -Encoding UTF8 -NoNewline -LiteralPath ')
      && /AYRI owner onayıyla `-Mode Recover -ReceiptFile '/.test(a.adim || '') && /^ÖNERİ \(yetki DEĞİL\)/.test(a.adim || '') && typeof a.makbuzJson === 'string';
    const st21 = rfs ? [rfs(okP, memR), rfs(goneP, memR), rfs(dirP, memR), rfs(badP, memR), rfs(null, memR), rfs(okP, Object.assign({}, memR, { runId: '00000000' }))] : [];
    check('Z21-b', 'makbuz dosyası durumu (birim): receiptFileState var → KULLANILABILIR (güncel) · yok → YOK · klasör → OKUNAMADI · bozuk / kayıt türü yanlış → OKUNAMADI · yol yok → YOL_YOK · başka runId → OKUNAMADI; Run adımı: makbuz kullanılabilir ve güncel → `-Mode Recover -ReceiptFile <makbuz>` önerilir (kanıtta makbuzJson); R03-d: makbuz YOK / klasör / bozuk → uygulanamayan komut ÖNERİLMEZ, "makbuz dosyası YOK|OKUNAMIYOR … bu makbuz dosyasıyla Recover ÖNERİLMEZ … bloktan Recover BAŞLATILAMAZ" + kanıttaki `recovery.makbuzJson`dan yeni dosya yazan TEK komut + AYRI owner onayıyla `-Mode Recover -ReceiptFile \'<yeni makbuz>\'` + yazma hatası metni; kanıtta makbuz da yoksa "SOMUT ENGEL" (komut yok); Recover adımı komut önermez',
      !!rfs && st21.map((x) => x.durum).join(',') === 'KULLANILABILIR,YOK,OKUNAMADI,OKUNAMADI,YOL_YOK,OKUNAMADI' && st21[0].guncel === true
        && String(aOk.adim || '').includes('-Mode Recover -ReceiptFile <makbuz>') && aOk.makbuzDurumu === 'KULLANILABILIR' && !/BAYAT|FARKLI/.test(aOk.adim || '') && aOk.makbuzJson === JSON.stringify(memR, null, 1)
        && [aGone, aDir, aBad].every((a) => noCmd(a) && altPath(a) && /bloktan Recover BAŞLATILAMAZ/.test(a.adim || '')) && /ENOENT: yazılamadı/.test(aGone.adim || '') && aGone.makbuzDurumu === 'YOK' && aDir.makbuzDurumu === 'OKUNAMADI' && aGone.makbuzDiskte === false
        && noCmd(aNone) && !/-ReceiptFile/.test(aNone.adim || '') && /SOMUT ENGEL/.test(aNone.adim || '') && noCmd(aRec) && /İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR/.test(aRec.adim || '') && aRec.makbuzJson === undefined,
      `fonksiyon=${!!rfs} · durumlar=${st21.map((x) => x.durum).join(',')} · var=${String(aOk.adim || '').slice(0, 90)} · yok=${String(aGone.adim || '').slice(0, 260)} · makbuzsuz=${String(aNone.adim || '').slice(0, 140)}`);

    // Gösterimden sonra makbuz dosyası silinir (koşucu gösterimden sonra makbuza yazmaz); ürün DELETE'i dosyayı bırakır (noUnlink) → kapanış kalıntı → çıkış 6.
    // R03-d (m4): kanıttaki adımın verdiği TEK komut Windows PowerShell 5.1 VE PowerShell 7 ile GERÇEKTEN koşulur; iki dosyanın her biriyle Recover koşar.
    const runShell = (sh, cmd) => {
      const exe = sh === 'ps51' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'pwsh';
      const env = Object.assign({}, process.env); for (const k of Object.keys(env)) if (k.toLowerCase() === 'psmodulepath') delete env[k];   // WinPS 5.1: devralınan PS 7 modül yolu yerleşik cmdlet'leri bozabilir
      const r = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(cmd, 'utf16le').toString('base64')], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
      return { rc: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.replace(/\s+/g, ' ').trim().slice(0, 300), err: r.error ? String(r.error.message).slice(0, 120) : null };
    };
    const z21c = await runScenario('z21c-receipt-lost-mid-run', dir, { delete: 'noUnlink' }, {}, { onDisplay: async (s) => { try { fs.unlinkSync(path.join(dir, 'z21c-receipt-lost-mid-run-receipt.json')); } catch (e) { /* ölçüm aşağıda */ } return phoneFlow(s); } });
    const rec21 = (z21c.ev && z21c.ev.recovery) || {}; const ev21r = (z21c.ev && z21c.ev.receipt) || null;
    const cmd21 = (String(rec21.adim || '').match(/`(\(Get-Content -Raw -Encoding UTF8 -LiteralPath [^`]+)`/) || [])[1] || null;
    const newP21 = path.join(dir, 'd6-setup-receipt-kanittan.json'); const sh21 = {}; const r21 = {};
    for (const sh of ['ps51', 'ps7']) {
      try { fs.unlinkSync(newP21); } catch (e) { /* yok */ }
      const x = cmd21 ? runShell(sh, cmd21) : { rc: -2, out: 'komut yok' }; const dst = path.join(dir, `z21c-makbuz-kanittan-${sh}.json`); let buf = null;
      if (fs.existsSync(newP21)) { fs.renameSync(newP21, dst); buf = fs.readFileSync(dst); artifacts.push(dst); }
      const txt = buf ? buf.toString('utf8').replace(/^\uFEFF/, '') : null; const g = buf && typeof EX.readReceiptForRecover === 'function' ? EX.readReceiptForRecover(dst) : null;
      sh21[sh] = { rc: x.rc, out: x.out, err: x.err, bom: !!buf && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, same: txt !== null && txt === rec21.makbuzJson, gate: !!g && g.ok, dst };
      if (buf) r21[sh] = await recover({ runId: z21c.runId, receipt: dst, tenant: z21c.tenant }, dir, `z21c-recover-${sh}`, {});
    }
    const recOk = (r) => !!r && r.code === 6 && !!r.ev && r.ev.record === 'EXTACC-D6-RECOVER' && ((r.ev.portalClose || {}).identity === 'OK') && r.v('P6-C2') === 'PASS' && r.v('P6-C3L') === 'PASS' && r.v('P6-C-DOC') === 'FAIL' && r.activeUsers === 0;
    check('Z21-c', 'makbuz dosyası koşum ORTASINDA (gösterimden sonra) kayboldu (uçtan uca; ürün DELETE\'i dosyayı bırakıyor → kalıntı, çıkış 6): gösterim yapıldı; kanıtta makbuzDurumu=YOK, makbuzDiskte=false; adım uygulanamayan `-Mode Recover -ReceiptFile <makbuz>` komutunu ÖNERMEZ; R03-d: kanıttaki `recovery.makbuzJson` = JSON.stringify(receipt, null, 1) ve adımın verdiği TEK komut (somut kanıt yolu → <kanıt dizini>\\d6-setup-receipt-kanittan.json) Windows PowerShell 5.1 ve PowerShell 7 ile koşuldu (çıkış 0): 5.1 dosyası UTF-8 BOM\'lu, 7 dosyası BOM\'suz, ikisinin metni (BOM hariç) makbuzJson\'a BİREBİR eşit; koşucunun Recover okuma kapısı (readReceiptForRecover) ikisinde ok; her dosyayla Recover GERÇEKTEN koşar: kimlik bağı OK (çıkış 4 DEĞİL), kayıt EXTACC-D6-RECOVER, P6-C2/C3L PASS, kalan dosya P6-C-DOC FAIL (çıkış 6), personel pasif',
      z21c.code === 6 && !!z21c.ev && z21c.ev.displayed === true && !z21c.rc && rec21.gerekli === true && rec21.makbuzDurumu === 'YOK' && rec21.makbuzDiskte === false && noCmd(rec21) && altPath(rec21)
        && !!ev21r && ev21r.record === EX.RECEIPT_RECORD && rec21.makbuzJson === JSON.stringify(ev21r, null, 1) && !!cmd21 && cmd21.includes(z21c.ev ? path.join(dir, 'z21c-receipt-lost-mid-run-evidence.json') : '#') && cmd21.includes(newP21)
        && sh21.ps51 && sh21.ps51.rc === 0 && sh21.ps51.bom && sh21.ps51.same && sh21.ps51.gate && recOk(r21.ps51)
        && sh21.ps7 && sh21.ps7.rc === 0 && !sh21.ps7.bom && sh21.ps7.same && sh21.ps7.gate && recOk(r21.ps7),
      `çıkış=${z21c.code} · makbuz dosyası=${z21c.rc ? 'VAR' : 'YOK'} · durum=${rec21.makbuzDurumu} diskte=${rec21.makbuzDiskte} · komut=${cmd21 ? 'var' : 'YOK'} · ps51: rc=${(sh21.ps51 || {}).rc} BOM=${(sh21.ps51 || {}).bom} birebir=${(sh21.ps51 || {}).same} kapı=${(sh21.ps51 || {}).gate} Recover=${r21.ps51 ? r21.ps51.code : '-'} kimlik=${r21.ps51 && r21.ps51.ev ? (r21.ps51.ev.portalClose || {}).identity : '-'} [${(sh21.ps51 || {}).out || ''}${(sh21.ps51 || {}).err || ''}] · ps7: rc=${(sh21.ps7 || {}).rc} BOM=${(sh21.ps7 || {}).bom} birebir=${(sh21.ps7 || {}).same} kapı=${(sh21.ps7 || {}).gate} Recover=${r21.ps7 ? r21.ps7.code : '-'} kimlik=${r21.ps7 && r21.ps7.ev ? (r21.ps7.ev.portalClose || {}).identity : '-'} [${(sh21.ps7 || {}).out || ''}${(sh21.ps7 || {}).err || ''}]`);
    if (z21c.tenant && ev21r) { const left = await prisma.portalDocument.findMany({ where: { clientId: ev21r.clientId }, select: { filePath: true } }); for (const f of [ev21r.documentFile, ...left.map((d) => d.filePath)].filter(Boolean)) { try { fs.unlinkSync(f); } catch (e) { /* test temizliği */ } } await prisma.portalDocument.deleteMany({ where: { clientId: ev21r.clientId } }); }

    // ==== R03-d (M1) — guard NORMAL + yeniden açma (ürün gibi sürüm artışı): eski oturum 401 → P6-C4 PASS; bulgu yok; portal açık satırı var
    const z22a = await runScenario('z22a-reopen-guard-normal', dir, { reopen: 'afterDisable' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const n22a = nedenOf(z22a); const line22a = n22a.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || '';
    check('Z22-a', 'R03-d: guard NORMAL + hesap HTTP ölçümleri SIRASINDA yeniden açıldı (sahte API reopen afterDisable; sürüm ürün gibi ARTAR): eski oturum sürüm farkıyla REDDEDİLİR → P6-C4L/D PASS (HTTP 401); productFinding YOK, sessionVersion YOK; P6-C2 PASS, P6-C5 FAIL; kurtarma nedeninde portal satırı "yeniden AÇILDI (P6-C5 FAIL …): açık erişim kapatılmalıdır (Recover kapatabilir)"; "ÜRÜN BULGUSU" / "Recover düzeltemez" satırı YOK; DB\'de hesap AÇIK; çıkış 6',
      z22a.code === 6 && ['P6-C4L', 'P6-C4D'].every((id) => z22a.v(id) === 'PASS' && z22a.o(id) === 'HTTP 401') && z22a.v('P6-C2') === 'PASS' && z22a.v('P6-C5') === 'FAIL' && !!z22a.ev && !z22a.ev.productFinding && !pcOf(z22a).sessionVersion
        && /hesap ölçüm sırasında yeniden AÇILDI \(P6-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true\): açık erişim kapatılmalıdır \(Recover kapatabilir\)/.test(line22a) && !n22a.some((n) => /ÜRÜN BULGUSU|Recover düzeltemez/.test(n))
        && !!z22a.pu && z22a.pu.isActive === true,
      `çıkış=${z22a.code} · C4L=${z22a.o('P6-C4L')} C4D=${z22a.o('P6-C4D')} · C2=${z22a.v('P6-C2')} C5=${z22a.v('P6-C5')} · bulgu=${JSON.stringify((z22a.ev || {}).productFinding || null)} · portal satırı=${line22a.slice(0, 240)}`);
    // ==== R03-e: Z22-b DEĞİŞTİ — sürüm verilme değerine GERİ döner (sahte API afterDisableRevert; guard normal → eski oturum 200). R03-d bu durumda "adayı DEĞİL"
    //      yazıyordu; tablo TA: sürüm ölçüm aralığında AZALDI (ürün yazıcıları yalnız artırır → ürün dışı yazım; istek anındaki sürüm ölçülmedi) → AYRISTIRILAMADI.
    const z22b = await runScenario('z22b-reopen-version-revert', dir, { reopen: 'afterDisableRevert' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const n22b = nedenOf(z22b); const line22b = n22b.find((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(/.test(n)) || ''; const sv22b = pcOf(z22b).sessionVersion || {};
    check('Z22-b', 'R03-e (R03-d\'den değişti): yeniden açmada sürüm oturumun verildiği değere GERİ döner (sahte API afterDisableRevert; guard normal → eski oturum 200): tablo TA — P6-C4L/D FAIL + "ürün bulgusu AYRIŞTIRILAMADI (TA; ÖLÇÜLEMEDİ: sürüm ölçüm aralığında AZALDI (HTTP öncesi b+1 → sonrası b; verilme b) — ürün yazıcıları yalnız artırır …)"; sessionVersion AYRISTIRILAMADI/TA (httpOncesi=b+1, olcumSonrasi=b); productFinding YOK; kurtarma nedeninde AYRI oturum satırı "ürün bulgusu olup olmadığı AYRIŞTIRILAMADI (TA; …)" + portal satırı "yeniden AÇILDI (…): açık erişim kapatılmalıdır (Recover kapatabilir); … AYRI satırdadır (ürün bulgusu AYRIŞTIRILAMADI)"; "DEĞİL" / "ürün bulgusu değil" / "ÜRÜN BULGUSU" / "Recover düzeltemez" HİÇBİR yerde YOK; DB\'de hesap açık, sürüm = verilen; çıkış 6',
      z22b.code === 6 && z22b.v('P6-C2') === 'PASS' && z22b.v('P6-C5') === 'FAIL' && sv22b.sinif === 'AYRISTIRILAMADI' && sv22b.hucre === 'TA' && Number.isInteger(sv22b.verilen) && sv22b.olcumSonrasi === sv22b.verilen && sv22b.httpOncesi === sv22b.verilen + 1 && !!z22b.ev && !z22b.ev.productFinding
        && ['P6-C4L', 'P6-C4D'].every((id) => z22b.v(id) === 'FAIL' && /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(TA; ÖLÇÜLEMEDİ: sürüm ölçüm aralığında AZALDI \(HTTP öncesi (\d+) → sonrası (\d+); verilme \2\) — ürün yazıcıları yalnız artırır/.test(z22b.o(id)))
        && n22b.some((n) => /^PORTAL: mevcut oturum HTTP 200 — ürün bulgusu olup olmadığı AYRIŞTIRILAMADI \(TA; ÖLÇÜLEMEDİ: sürüm ölçüm aralığında AZALDI/.test(n))
        && /yeniden AÇILDI \(P6-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true\): açık erişim kapatılmalıdır \(Recover kapatabilir\); koşucu oturumunun erişmesi AYRI satırdadır \(ürün bulgusu AYRIŞTIRILAMADI\)/.test(line22b)
        && ![...n22b, z22b.o('P6-C4L'), z22b.o('P6-C4D'), z22b.o('P6-D9')].some((t) => /DEĞİL|ürün bulgusu değil|ÜRÜN BULGUSU|Recover düzeltemez/.test(t))
        && !!z22b.pu && z22b.pu.isActive === true && z22b.pu.tokenVersion === sv22b.verilen,
      `çıkış=${z22b.code} · sınıf=${JSON.stringify(sv22b)} · C4L=${z22b.o('P6-C4L').slice(0, 220)} · portal satırı=${line22b.slice(0, 300)} · DB sonra=${JSON.stringify(z22b.pu)}`);
    // ==== R03-e: Z22-c DEĞİŞTİ — kurtarma nedeni (birim) sessionClass200 sınıflarına göre: oturum satırı portal ERİŞİM satırından AYRI; ADAY P6-C2 FAIL dalında da
    //      (R03-d bu dalda ADAY yazmazdı); SAYILMADI yalnız T5; AYRISTIRILAMADI'da "DEĞİL" yok; Recover modunda "(Recover kapatabilir)" YAZILMAZ.
    const sc2 = typeof EX.sessionClass200 === 'function' ? EX.sessionClass200 : null; const S = (exists, isActive, hasPortalAccess, tokenVersion) => ({ exists, isActive, hasPortalAccess, tokenVersion });
    const R6c = (pairs) => pairs.map(([id, verdict]) => ({ id, verdict })); const vOpen = R6c([['P6-C1', 'FAIL'], ['P6-C2', 'FAIL'], ['P6-C2V', 'FAIL'], ['P6-C5', 'FAIL'], ['P6-C4L', 'FAIL'], ['P6-C4D', 'FAIL']]);
    const pcOpen = (k, s1, s2, closeText) => ({ ok: false, portalDbClosed: false, productFinding: (k && k.bulgu) || null, sessionVersion: k ? { sinif: k.sinif, hucre: k.hucre, ifade: k.ifade, neden: k.neden } : null, after: s1, afterMeasure: s2, closeText,
      disableCalls: ['HTTP 403', 'HTTP 403'], docResidue: { durum: 'YOK', rows: 0, filesLeftOnDisk: [], filesAccessError: [] } });
    const stA = S(true, true, true, 2); const stS = S(true, true, true, 1); const ctA = 'kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de AÇIK (isActive=true hasPortalAccess=true sürüm 1→2)'; const ctS = 'kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de AÇIK (isActive=true hasPortalAccess=true sürüm 1→1)';
    const kA = sc2 ? sc2(1, stA, stA) : {}; const kS = sc2 ? sc2(1, stS, stS) : {}; const kU = sc2 ? sc2(null, stS, stS) : {};
    const nA = raf && sc2 ? (raf({ closure: { ok: true }, results: vOpen, portalClose: pcOpen(kA, stA, stA, ctA) }, null, 'run').neden || []) : [];
    const nS = raf && sc2 ? (raf({ closure: { ok: true }, results: vOpen, portalClose: pcOpen(kS, stS, stS, ctS) }, null, 'run').neden || []) : [];
    const nU = raf && sc2 ? (raf({ closure: { ok: true }, results: vOpen, portalClose: pcOpen(kU, stS, stS, ctS) }, null, 'run').neden || []) : [];
    const nR = raf ? (raf({ closure: { ok: true }, results: vOpen, portalClose: pcOpen(null, stS, stS, ctS) }, null, 'recover').neden || []) : [];
    const candA = nA.filter((n) => /^PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI \(T2\) — eski portal oturumu sürüm reddine rağmen erişti \(oturumun verildiği sürüm 1, HTTP öncesi DB sürümü 2, sonrası 2 — /.test(n) && /oturum reddi ürün tarafıdır, Recover düzeltemez/.test(n) && !/Recover kapatabilir/.test(n));
    const openA = nA.filter((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı \(P6-C1=FAIL,P6-C2=FAIL,P6-C2V=FAIL,P6-C5=FAIL\) — kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de AÇIK \(isActive=true hasPortalAccess=true sürüm 1→2\): açık erişim kapatılmalıdır \(Recover kapatabilir\); koşucu oturumunun erişmesi AYRI satırdadır \(ÜRÜN BULGUSU ADAYI\)/.test(n) && !/Recover düzeltemez|SAYILMADI/.test(n));
    check('Z22-c', 'R03-e (R03-d\'den değişti) kurtarma nedeni (birim, sessionClass200 çıktılarıyla): P6-C2 FAIL (hesap açık) + sürüm verilmeden büyük (T2) → ADAY: AYRI iki satır — oturum satırı "PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI (T2) — … Recover düzeltemez" ("(Recover kapatabilir)" YOK) + portal satırı "… — kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de AÇIK (… sürüm 1→2): açık erişim kapatılmalıdır (Recover kapatabilir); … AYRI satırdadır (ÜRÜN BULGUSU ADAYI)" ("Recover düzeltemez" / "SAYILMADI" YOK) · T5 → oturum satırı "ürün bulgusu SAYILMADI (T5: kapatma DB\'ye yansımadı …)", "ÜRÜN BULGUSU" YOK · T0 → "ürün bulgusu olup olmadığı AYRIŞTIRILAMADI (T0; ÖLÇÜLEMEDİ: oturumun verildiği sürüm bilinmiyor)", "DEĞİL" / "SAYILMADI" YOK · Recover modunda açık hesap → "açık erişim KAPANMADI (bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı)", "(Recover kapatabilir)" YOK',
      !!sc2 && !!raf && kA.sinif === 'ADAY' && kA.hucre === 'T2' && candA.length === 1 && openA.length === 1 && candA[0] !== openA[0] && !nA.some((n) => /SAYILMADI/.test(n))
        && kS.sinif === 'SAYILMADI' && nS.some((n) => /^PORTAL: mevcut oturum HTTP 200 — ürün bulgusu SAYILMADI \(T5: kapatma DB'ye yansımadı/.test(n)) && nS.some((n) => /AYRI satırdadır \(ürün bulgusu SAYILMADI\)/.test(n)) && !nS.some((n) => /ÜRÜN BULGUSU|Recover düzeltemez/.test(n))
        && kU.sinif === 'AYRISTIRILAMADI' && nU.some((n) => /^PORTAL: mevcut oturum HTTP 200 — ürün bulgusu olup olmadığı AYRIŞTIRILAMADI \(T0; ÖLÇÜLEMEDİ: oturumun verildiği sürüm bilinmiyor\)$/.test(n)) && !nU.some((n) => /DEĞİL|ÜRÜN BULGUSU|SAYILMADI/.test(n))
        && nR.some((n) => /^PORTAL ERİŞİMİ kapandığı doğrulanmadı/.test(n) && /: açık erişim KAPANMADI \(bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı\)/.test(n)) && !nR.some((n) => /Recover kapatabilir/.test(n)),
      `fonksiyon=${!!sc2} · ADAY=${nA.map((n) => n.slice(0, 120)).join(' | ')} · T5=${nS.map((n) => n.slice(0, 100)).join(' | ')} · T0=${nU.map((n) => n.slice(0, 100)).join(' | ')} · Recover=${nR.map((n) => n.slice(-120)).join(' | ')}`);
    // ==== R03-e: Z23-a — KARAR TABLOSU (birim, sessionClass200): her hücre sınıf + hücre + gözlem metni; ADAY'da ürün bulgusu metni "Recover düzeltemez" ile biter ve
    //      açık-erişim metnini içermez; "ürün bulgusu değil" / "SAYILMADI" YALNIZ T5'te; "DEĞİL" sınıfı ve metni YOK; satır yokken metin "sürüm null" DEMEZ.
    const T23 = [
      ['B', 1, S(true, false, false, 2), S(true, false, false, 2), 'BULGU', 'B', /^HTTP 200 — DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken \(P6-C2 PASS \+ P6-C5 PASS\) MEVCUT OTURUM KAPANMADI \(ürün bulgusu\)$/],
      ['T0', null, S(true, true, true, 1), S(true, true, true, 1), 'AYRISTIRILAMADI', 'T0', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T0; ÖLÇÜLEMEDİ: oturumun verildiği sürüm bilinmiyor\)$/],
      ['T1', 1, S(false, null, false, null), S(false, null, false, null), 'ADAY', 'T1', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T1\) — eski oturum hesap satırı yokken erişti \(hesap satırı HTTP ölçümlerinden ÖNCE DB'de YOK — guard satır yokken reddeder/],
      ['T1s-sürüm', 1, S(true, false, false, 2), S(false, null, false, null), 'ADAY', 'T1s', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T1s\) — eski oturum sürüm \/ satır yokluğu reddine rağmen erişti \(hesap satırı HTTP ölçümlerinden SONRA DB'de YOK; HTTP öncesi sürüm 2, verilme 1/],
      ['T1s-pasif', 1, S(true, false, true, 1), S(false, null, false, null), 'ADAY', 'T1s', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T1s\) — eski oturum pasif hesap \/ satır yokluğu reddine rağmen erişti \(hesap satırı HTTP ölçümlerinden SONRA DB'de YOK; HTTP öncesi pasif \(isActive=false\)/],
      ['T1s-açık', 1, S(true, true, true, 1), S(false, null, false, null), 'AYRISTIRILAMADI', 'T1s', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T1s; ÖLÇÜLEMEDİ: hesap satırı HTTP ölçümlerinden SONRA DB'de YOK; HTTP öncesi açık \(isActive=true\) ve sürüm verilme sürümüne eşit \(1\) — istek anında satır açık ve aynı sürümdeyse 200 beklenir/],
      ['T1s-alt', 3, S(true, true, true, 1), S(false, null, false, null), 'AYRISTIRILAMADI', 'T1s', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T1s; ÖLÇÜLEMEDİ: hesap satırı HTTP ölçümlerinden SONRA DB'de YOK; HTTP öncesi sürüm 1 verilme sürümünün \(3\) ALTINDA/],
      ['TA', 1, S(true, false, false, 2), S(true, true, true, 1), 'AYRISTIRILAMADI', 'TA', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(TA; ÖLÇÜLEMEDİ: sürüm ölçüm aralığında AZALDI \(HTTP öncesi 2 → sonrası 1; verilme 1\) — ürün yazıcıları yalnız artırır/],
      ['TI-açma', 1, S(true, false, false, 2), S(true, true, true, 2), 'AYRISTIRILAMADI', 'TI', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(TI; ÖLÇÜLEMEDİ: sürüm aralıkta değişmeden \(2\) isActive false→true — .*ürün dışı yeniden açma ölçüldü/],
      ['TI-kapama', 1, S(true, true, true, 1), S(true, false, true, 1), 'AYRISTIRILAMADI', 'TI', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(TI; ÖLÇÜLEMEDİ: sürüm aralıkta değişmeden \(1\) isActive true→false — .*ürün dışı kapatma ölçüldü/],
      ['T2-üst', 1, S(true, true, true, 2), S(true, true, true, 2), 'ADAY', 'T2', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(oturumun verildiği sürüm 1, HTTP öncesi DB sürümü 2, sonrası 2 — ürün yazıcıları yalnız artırdığından istek anında da farklıydı/],
      ['T2-alt', 3, S(true, true, true, 1), S(true, true, true, 1), 'ADAY', 'T2', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(oturumun verildiği sürüm 3, HTTP öncesi DB sürümü 1, sonrası 1 \(DB sürümü verilme sürümünün ALTINDA — ürün dışı azaltma\)/],
      ['T2a', 2, S(true, true, true, 1), S(true, true, true, 3), 'AYRISTIRILAMADI', 'T2a', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T2a; ÖLÇÜLEMEDİ: HTTP öncesi DB sürümü 1 verilme sürümünün \(2\) ALTINDA, sonrası 3/],
      ['T3', 1, S(true, false, true, 1), S(true, false, true, 1), 'ADAY', 'T3', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T3\) — eski oturum pasif hesap reddine rağmen erişti \(HTTP öncesi ve sonrası hesap pasif/],
      ['T4', 1, S(true, false, true, 1), S(true, true, true, 2), 'ADAY', 'T4', /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T4\) — eski oturum pasif hesap \/ sürüm reddine rağmen erişti \(.*istek anındaki ret nedeni ayrıştırılamadı \(pasiflik ya da sürüm\)/],
      ['T5', 1, S(true, true, true, 1), S(true, true, true, 1), 'SAYILMADI', 'T5', /^HTTP 200 — ürün bulgusu SAYILMADI \(T5\) — kapatma DB'ye yansımadı — hesap HTTP ölçümlerinden önce ve sonra açık \(isActive=true\) ve sürüm verilme sürümüyle aynı \(1\); guard bu durumda oturumu kabul eder → 200 beklenir; ürün bulgusu değil \(guard'ın satır kimliği ve tenant yaşam döngüsü koşulları ÖLÇÜLMEDİ/],
      ['T5-erişimKapalı', 1, S(true, true, false, 1), S(true, true, false, 1), 'SAYILMADI', 'T5', /^HTTP 200 — ürün bulgusu SAYILMADI \(T5\) — /],
      ['T6', 1, S(true, true, true, 1), S(true, true, true, 2), 'AYRISTIRILAMADI', 'T6', /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(T6; ÖLÇÜLEMEDİ: HTTP öncesi hesap açık ve sürüm verilme sürümüne eşit \(1\), HTTP sonrası sürüm 2 — sürüm istek sırasında değişti/],
    ];
    const r23 = T23.map(([n, b, s1, s2, sinif, hucre, re]) => { const k = sc2 ? sc2(b, s1, s2) : {}; const txt = `${k.gozlem || ''} ${k.bulgu || ''}`;
      const bulguOk = k.sinif === 'ADAY' ? (/^ÜRÜN BULGUSU ADAYI \(/.test(k.bulgu || '') && /oturum reddi ürün tarafıdır, Recover düzeltemez$/.test(k.bulgu || '') && !/Recover kapatabilir|açık erişim/.test(k.bulgu || '')) : (k.sinif === 'BULGU' ? /^ÜRÜN BULGUSU: /.test(k.bulgu || '') : k.bulgu === null);
      return { n, k, ok: k.sinif === sinif && k.hucre === hucre && re.test(k.gozlem || '') && bulguOk && !/sürüm null|sürümü null|DEĞİL/.test(txt) }; });
    const notT5 = r23.filter((x) => x.k.hucre !== 'T5' && /ürün bulgusu değil|SAYILMADI/.test(`${x.k.gozlem || ''} ${x.k.bulgu || ''}`)).map((x) => x.n);
    check('Z23-a', 'R03-e karar tablosu (birim, sessionClass200; 18 girdi, 12 hücre): B (kapalı + sürüm aynı) → BULGU · T0 (verilme bilinmiyor) → AYRISTIRILAMADI · T1 (st1 satırı yok) → ADAY · T1s (st2 satırı yok: sürüm > verilme / pasif → ADAY; açık + eşit / sürüm altında → AYRISTIRILAMADI; "sürüm null" YOK) · TA (sürüm aralıkta azaldı) → AYRISTIRILAMADI · TI (sürüm değişmeden isActive değişti: ürün dışı açma / kapama) → AYRISTIRILAMADI · T2 (verilme aralık dışında, üst ve alt) → ADAY · T2a → AYRISTIRILAMADI · T3 (pasif + eşit) → ADAY · T4 (pasif + sonra artış) → ADAY · T5 (açık + eşit; hasPortalAccess=false dahil — guard okumaz) → SAYILMADI · T6 (açık + istek sırasında artış) → AYRISTIRILAMADI; ADAY bulgu metni "Recover düzeltemez" ile biter, açık-erişim metni İÇERMEZ; "ürün bulgusu değil" / "SAYILMADI" yalnız T5\'te; "DEĞİL" YOK',
      !!sc2 && r23.every((x) => x.ok) && notT5.length === 0 && new Set(r23.map((x) => x.k.hucre)).size === 12,
      `fonksiyon=${!!sc2} · hatalı=${r23.filter((x) => !x.ok).map((x) => `${x.n}:${x.k.sinif}/${x.k.hucre} ${String(x.k.gozlem || '').slice(0, 90)}`).join(' || ') || 'yok'} · T5 dışı "değil/SAYILMADI"=${notT5.join(',') || 'yok'} · hücreler=${[...new Set(r23.map((x) => x.k.hucre))].join(',')}`);
    // ==== R03-e: Z23-b — verilme sürümü (birim): token claim'i İMZASIZ okunur; claim esas, s1 farklıysa ikisi de; okunamazsa s1; geçersizse bilinmiyor; kanıtta token YOK
    const ivF = typeof EX.issuedVersionOf === 'function' ? EX.issuedVersionOf : null; const tokOf = (p) => ['h', Buffer.from(JSON.stringify(p)).toString('base64url'), crypto.randomBytes(6).toString('hex')].join('.');
    const toks = [tokOf({ tokenVersion: 4 }), tokOf({ sub: 'x' }), tokOf({ tokenVersion: -1 }), 'pfake.' + Buffer.from('{"tv":4}').toString('base64url'), tokOf({ tokenVersion: 3 })];
    const ivs = ivF ? toks.map((t) => ivF(t, 3)) : [];
    check('Z23-b', 'R03-e verilme sürümü (birim, issuedVersionOf / portalTokenClaimVersion — İMZASIZ decode): claim 4 + s1 3 → esas 4, kaynak claim, claim=4 s1=3 fark=true · claim YOK → 0 (guard kuralı :98-101) · claim geçersiz (-1) → esas bilinmiyor (kaynak "yok (claim geçersiz)" → T0) · JWT değil → esas s1 (kaynak s1, OKUNAMADI) · claim = s1 → fark=false; kanıt nesnesinde token YOK',
      !!ivF && ivs[0].value === 4 && ivs[0].kanit.kaynak === 'claim' && ivs[0].kanit.claim === 4 && ivs[0].kanit.s1 === 3 && ivs[0].kanit.fark === true
        && ivs[1].value === 0 && ivs[1].kanit.kaynak === 'claim' && /guard kuralı/.test(ivs[1].kanit.claimNeden || '') && ivs[2].value === null && ivs[2].kanit.claimDurum === 'GECERSIZ' && ivs[2].kanit.kaynak === 'yok (claim geçersiz)'
        && ivs[3].value === 3 && ivs[3].kanit.kaynak === 's1' && ivs[3].kanit.claimDurum === 'OKUNAMADI' && ivs[4].kanit.fark === false && !ivs.some((x, i) => JSON.stringify(x.kanit).includes(toks[i]) || JSON.stringify(x.kanit).includes(toks[i].split('.')[1])),
      `fonksiyon=${!!ivF} · ${ivs.map((x) => `${x.value}/${x.kanit.kaynak}/${x.kanit.claimDurum}/fark=${x.kanit.fark}`).join(' · ')}`);
    // ==== R03-e: Z23-c..j — uçtan uca tablo varyantları: guard KUSUR taklidi (bayat) → beklenen sınıf ve metin · guard NORMAL → 401, P6-C4 PASS, productFinding YOK
    const candLine = (z) => nedenOf(z).find((n) => /^PORTAL: mevcut oturum ÜRÜN BULGUSU ADAYI/.test(n)) || '';
    const sessLine = (z) => nedenOf(z).find((n) => /^PORTAL: mevcut oturum HTTP 200/.test(n)) || '';
    const adayE2E = (z, hucre, bulguRe, c4Re) => { const sv = pcOf(z).sessionVersion || {}; const pf = (z.ev && z.ev.productFinding) || ''; const cand = candLine(z); const line = openLineOf(z);
      return z.code === 6 && sv.sinif === 'ADAY' && sv.hucre === hucre && bulguRe.test(pf) && /oturum reddi ürün tarafıdır, Recover düzeltemez$/.test(pf) && !/Recover kapatabilir|açık erişim/.test(pf)
        && ['P6-C4L', 'P6-C4D'].every((id) => z.v(id) === 'FAIL' && c4Re.test(z.o(id)) && !/SAYILMADI|hâlâ|DEĞİL/.test(z.o(id)))
        && !!cand && /Recover düzeltemez/.test(cand) && !/Recover kapatabilir/.test(cand) && !!line && line !== cand && !/Recover düzeltemez/.test(line) && /AYRI satırdadır \(ÜRÜN BULGUSU ADAYI\)/.test(line)
        && !nedenOf(z).some((n) => /SAYILMADI|DEĞİL|hâlâ/.test(n)) && z.o('P6-D9').includes(`ÜRÜN BULGUSU ADAYI (${hucre})`); };
    const normalE2E = (z) => z.code === 6 && ['P6-C4L', 'P6-C4D'].every((id) => z.v(id) === 'PASS' && z.o(id) === 'HTTP 401') && !!z.ev && !z.ev.productFinding && !pcOf(z).productFinding && !pcOf(z).sessionVersion
      && !nedenOf(z).some((n) => /^PORTAL: mevcut oturum|ÜRÜN BULGUSU|Recover düzeltemez|SAYILMADI|hâlâ/.test(n));
    const sumE = (z) => `çıkış=${z.code} · sınıf=${JSON.stringify(pcOf(z).sessionVersion || null)} · bulgu=${String((z.ev || {}).productFinding || '').slice(0, 140)} · C4L=${z.o('P6-C4L').slice(0, 260)} · açıkErişim=${pcOf(z).acikErisim || '-'} · neden=${nedenOf(z).map((n) => n.slice(0, 170)).join(' | ')}`;
    const ver2 = (s) => { const m = /sürüm (\d+)→(\d+)\)/.exec(s || ''); return m ? [Number(m[1]), Number(m[2])] : null; };
    // T2 — açıkken "Şifre Değiştir" (sürüm +1, isActive değişmez) + kapatma ucu 403 → P6-C2 FAIL; guard sürümle reddetmeliydi → ADAY (R03-d bu dalda "SAYILMADI" yazıyordu)
    const z23c = await runScenario('z23c-t2-pwchange-forbidden-stale', dir, { guard: 'stale', pwChange: 'onDisable', disable: 'forbidden' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const sv23c = pcOf(z23c).sessionVersion || {}; const v23c = ver2(z23c.o('P6-C4L'));
    check('Z23-c', 'R03-e T2 uçtan uca (guard KUSUR taklidi): açıkken sürüm +1 ("Şifre Değiştir" taklidi; isActive değişmez) + kapatma ucu 403 (P6-C1 FAIL, P6-C2 FAIL: hesap AÇIK) → 200 "ÜRÜN BULGUSU ADAYI (T2) — eski oturum sürüm reddine rağmen erişti (oturumun verildiği sürüm b, HTTP öncesi DB sürümü b+1, sonrası b+1 …)" + "· DB: HTTP öncesi … → sonrası …" + "· kapatma: kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de AÇIK (isActive=true hasPortalAccess=true sürüm b→b+1)" ("hâlâ" / "SAYILMADI" YOK); productFinding "… Recover düzeltemez" (açık-erişim metni İÇERMEZ); sessionVersion ADAY/T2 kaynak claim; acikErisim AYRI "(Recover kapatabilir)"; kurtarma nedeninde AYRI oturum satırı + portal satırı (ölçülen kapatma metni + "(Recover kapatabilir)"); kanıtta issuedVersion kaynak=claim fark=false; DB\'de hesap açık, sürüm b+1; çıkış 6',
      adayE2E(z23c, 'T2', /^ÜRÜN BULGUSU ADAYI \(T2\): eski portal oturumu sürüm reddine rağmen belge listesine erişti \(oturumun verildiği sürüm (\d+), HTTP öncesi DB sürümü (\d+), sonrası \2 — ürün yazıcıları yalnız artırdığından/,
        /^HTTP 200 — ÜRÜN BULGUSU ADAYI \(T2\) — eski oturum sürüm reddine rağmen erişti \(.* · DB: HTTP öncesi isActive=true hasPortalAccess=true sürüm=(\d+) → sonrası isActive=true hasPortalAccess=true sürüm=\1 · kapatma: kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de AÇIK \(isActive=true hasPortalAccess=true sürüm \d+→\1\)$/)
        && sv23c.httpOncesi === sv23c.verilen + 1 && sv23c.olcumSonrasi === sv23c.verilen + 1 && sv23c.verilenKaynak === 'claim' && !!v23c && v23c[0] === sv23c.verilen && v23c[1] === sv23c.verilen + 1 && z23c.v('P6-C1') === 'FAIL' && z23c.v('P6-C2') === 'FAIL'
        && /^portal hesabı açık \(HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true sürüm=\d+\) — açık erişim kapatılmalıdır \(Recover kapatabilir\)$/.test(pcOf(z23c).acikErisim || '')
        && /— kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de AÇIK \(isActive=true hasPortalAccess=true sürüm \d+→\d+\): açık erişim kapatılmalıdır \(Recover kapatabilir\)/.test(openLineOf(z23c))
        && (z23c.ev.issuedVersion || {}).kaynak === 'claim' && z23c.ev.issuedVersion.fark === false && z23c.ev.issuedVersion.esas === sv23c.verilen && !!z23c.pu && z23c.pu.isActive === true && z23c.pu.tokenVersion === sv23c.verilen + 1,
      sumE(z23c));
    const z23d = await runScenario('z23d-t2-pwchange-forbidden-normal', dir, { pwChange: 'onDisable', disable: 'forbidden' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z23-d', 'R03-e T2 ikizi (guard NORMAL): aynı varyant → eski oturum sürüm farkıyla REDDEDİLİR → P6-C4L/D PASS (HTTP 401); productFinding / sessionVersion / oturum satırı YOK; portal satırı ölçülen kapatma metni "kapatma YAPILMADI (2xx kapatma çağrısı yok) — DB\'de AÇIK (…)" + "(Recover kapatabilir)"; acikErisim var; çıkış 6',
      normalE2E(z23d) && /— kapatma YAPILMADI \(2xx kapatma çağrısı yok\) — DB'de AÇIK \(isActive=true hasPortalAccess=true sürüm \d+→\d+\): açık erişim kapatılmalıdır \(Recover kapatabilir\)/.test(openLineOf(z23d)) && !/AYRI satırdadır/.test(openLineOf(z23d)) && /\(Recover kapatabilir\)$/.test(pcOf(z23d).acikErisim || ''),
      sumE(z23d));
    // T1 — kapatma çağrısı 2xx ama portal kullanıcı SATIRI silindi (ürün dışı) → guard satır yokken reddetmeliydi → ADAY; metin "sürüm null" DEMEZ
    const z23e = await runScenario('z23e-t1-row-deleted-stale', dir, { guard: 'stale', rowDelete: 'onDisable' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z23-e', 'R03-e T1 uçtan uca (guard KUSUR taklidi): kapatma çağrısı 201 ama portal kullanıcı satırı silindi (sahte API rowDelete; ürün dışı) → P6-C1 PASS, P6-C2 FAIL; 200 "ÜRÜN BULGUSU ADAYI (T1) — eski oturum hesap satırı yokken erişti (hesap satırı HTTP ölçümlerinden ÖNCE DB\'de YOK — guard satır yokken reddeder …)" + "· DB: HTTP öncesi hesap satırı DB\'de YOK (hasPortalAccess=false) → sonrası hesap satırı DB\'de YOK (hasPortalAccess=false) · kapatma: kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB\'de YOK (hasPortalAccess=false)"; "sürüm null" / "null→" YOK; acikErisim YOK (açık erişim yok); portal satırında "(Recover kapatabilir)" YOK; DB\'de satır yok; çıkış 6',
      adayE2E(z23e, 'T1', /^ÜRÜN BULGUSU ADAYI \(T1\): eski portal oturumu hesap satırı yokken belge listesine erişti \(hesap satırı HTTP ölçümlerinden ÖNCE DB'de YOK — guard satır yokken reddeder/,
        /· DB: HTTP öncesi hesap satırı DB'de YOK \(hasPortalAccess=false\) → sonrası hesap satırı DB'de YOK \(hasPortalAccess=false\) · kapatma: kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB'de YOK \(hasPortalAccess=false\)$/)
        && ['P6-C4L', 'P6-C4D'].every((id) => !/sürüm=null|sürüm null|null→/.test(z23e.o(id))) && z23e.v('P6-C1') === 'PASS' && z23e.v('P6-C2') === 'FAIL' && pcOf(z23e).acikErisim === null
        && /— kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB'de YOK \(hasPortalAccess=false\)/.test(openLineOf(z23e)) && !nedenOf(z23e).some((n) => /Recover kapatabilir/.test(n)) && z23e.pu === null,
      sumE(z23e));
    const z23f = await runScenario('z23f-t1-row-deleted-normal', dir, { rowDelete: 'onDisable' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z23-f', 'R03-e T1 ikizi (guard NORMAL): satır silinmiş → eski oturum REDDEDİLİR → P6-C4L/D PASS (HTTP 401); productFinding / sessionVersion / oturum satırı YOK; portal satırı "kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB\'de YOK"; acikErisim null (açık erişim yok); DB\'de satır yok; çıkış 6',
      normalE2E(z23f) && /— kapatma çağrısı 2xx döndü ama kapatmadan sonra hesap satırı DB'de YOK/.test(openLineOf(z23f)) && pcOf(z23f).acikErisim === null && z23f.pu === null, sumE(z23f));
    // T3 — ürün dışı kapatma: kapatma çağrısı 2xx ama yalnız isActive=false (sürüm ARTMADI, hasPortalAccess açık kaldı) → guard pasif hesabı reddetmeliydi → ADAY
    const z23g = await runScenario('z23g-t3-passive-nobump-stale', dir, { guard: 'stale', disable: 'passiveOnly' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z23-g', 'R03-e T3 uçtan uca (guard KUSUR taklidi): kapatma çağrısı 201 ama yalnız isActive=false (sürüm ARTMADI, hasPortalAccess=true; ürün dışı kapatma) → P6-C1 PASS, P6-C2 FAIL, P6-C2V FAIL; 200 "ÜRÜN BULGUSU ADAYI (T3) — eski oturum pasif hesap reddine rağmen erişti" + "· kapatma: kapatma çağrısı 2xx döndü ama DB\'de kapanış TAMAMLANMADI (isActive=false hasPortalAccess=true sürüm b→b)" ("kapatma YAPILMADI" YOK: 2xx vardı); acikErisim "(isActive=false hasPortalAccess=true …) — … (Recover kapatabilir)"; portal satırı aynı ölçülen metin + "(Recover kapatabilir)"; çıkış 6',
      adayE2E(z23g, 'T3', /^ÜRÜN BULGUSU ADAYI \(T3\): eski portal oturumu pasif hesap reddine rağmen belge listesine erişti/,
        /· kapatma: kapatma çağrısı 2xx döndü ama DB'de kapanış TAMAMLANMADI \(isActive=false hasPortalAccess=true sürüm (\d+)→\1\)$/)
        && z23g.v('P6-C1') === 'PASS' && z23g.v('P6-C2') === 'FAIL' && z23g.v('P6-C2V') === 'FAIL' && /isActive=false hasPortalAccess=true sürüm=\d+\) — açık erişim kapatılmalıdır \(Recover kapatabilir\)$/.test(pcOf(z23g).acikErisim || '')
        && /— kapatma çağrısı 2xx döndü ama DB'de kapanış TAMAMLANMADI \(isActive=false hasPortalAccess=true sürüm (\d+)→\1\): açık erişim kapatılmalıdır \(Recover kapatabilir\)/.test(openLineOf(z23g)) && ![openLineOf(z23g), z23g.o('P6-C4L')].some((t) => /kapatma YAPILMADI/.test(t)),
      sumE(z23g));
    const z23h = await runScenario('z23h-t3-passive-nobump-normal', dir, { disable: 'passiveOnly' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z23-h', 'R03-e T3 ikizi (guard NORMAL): pasif hesap → eski oturum REDDEDİLİR → P6-C4L/D PASS (HTTP 401); productFinding / sessionVersion / oturum satırı YOK; portal satırı "kapatma çağrısı 2xx döndü ama DB\'de kapanış TAMAMLANMADI …" + "(Recover kapatabilir)"; acikErisim AYRI ("isActive=false hasPortalAccess=true …"); çıkış 6',
      normalE2E(z23h) && /— kapatma çağrısı 2xx döndü ama DB'de kapanış TAMAMLANMADI \(isActive=false hasPortalAccess=true sürüm (\d+)→\1\): açık erişim kapatılmalıdır \(Recover kapatabilir\)/.test(openLineOf(z23h)) && /isActive=false hasPortalAccess=true sürüm=\d+\) — açık erişim kapatılmalıdır \(Recover kapatabilir\)$/.test(pcOf(z23h).acikErisim || ''), sumE(z23h));
    // TI — ürün dışı yeniden açma (sürüm DEĞİŞMEDEN isActive=true) → varsayım (A) aralıkta çiğnendi → AYRISTIRILAMADI (ADAY da "değil" de yazılmaz)
    const z23i = await runScenario('z23i-ti-reopen-nobump-stale', dir, { guard: 'stale', reopen: 'afterDisableNoBump' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const sv23i = pcOf(z23i).sessionVersion || {};
    check('Z23-i', 'R03-e TI uçtan uca (guard KUSUR taklidi): kapatma 201 (P6-C2 PASS) sonra HTTP ölçümleri sırasında sürüm DEĞİŞMEDEN yeniden açma (sahte API afterDisableNoBump; ürün dışı) → P6-C5 FAIL; 200 "ürün bulgusu AYRIŞTIRILAMADI (TI; ÖLÇÜLEMEDİ: sürüm aralıkta değişmeden (v) isActive false→true — … ürün dışı yeniden açma ölçüldü …)"; sessionVersion AYRISTIRILAMADI/TI; productFinding YOK; AYRI oturum satırı "ürün bulgusu olup olmadığı AYRIŞTIRILAMADI (TI; …)" + portal satırı "yeniden AÇILDI …: açık erişim kapatılmalıdır (Recover kapatabilir); … AYRI satırdadır (ürün bulgusu AYRIŞTIRILAMADI)"; "ÜRÜN BULGUSU" / "Recover düzeltemez" / "DEĞİL" / "SAYILMADI" YOK; acikErisim var; çıkış 6',
      z23i.code === 6 && z23i.v('P6-C2') === 'PASS' && z23i.v('P6-C5') === 'FAIL' && sv23i.sinif === 'AYRISTIRILAMADI' && sv23i.hucre === 'TI' && sv23i.httpOncesi === sv23i.olcumSonrasi && !!z23i.ev && !z23i.ev.productFinding
        && ['P6-C4L', 'P6-C4D'].every((id) => z23i.v(id) === 'FAIL' && /^HTTP 200 — ürün bulgusu AYRIŞTIRILAMADI \(TI; ÖLÇÜLEMEDİ: sürüm aralıkta değişmeden \(\d+\) isActive false→true — .*ürün dışı yeniden açma ölçüldü/.test(z23i.o(id)))
        && /^PORTAL: mevcut oturum HTTP 200 — ürün bulgusu olup olmadığı AYRIŞTIRILAMADI \(TI; /.test(sessLine(z23i)) && /yeniden AÇILDI \(P6-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true\): açık erişim kapatılmalıdır \(Recover kapatabilir\); koşucu oturumunun erişmesi AYRI satırdadır \(ürün bulgusu AYRIŞTIRILAMADI\)/.test(openLineOf(z23i))
        && ![...nedenOf(z23i), z23i.o('P6-C4L'), z23i.o('P6-C4D'), z23i.o('P6-D9')].some((t) => /ÜRÜN BULGUSU|Recover düzeltemez|DEĞİL|SAYILMADI|ürün bulgusu değil/.test(t)) && /\(Recover kapatabilir\)$/.test(pcOf(z23i).acikErisim || ''),
      sumE(z23i));
    const z23j = await runScenario('z23j-ti-reopen-nobump-normal', dir, { reopen: 'afterDisableNoBump' }, {}, { onDisplay: (s) => phoneFlow(s) });
    check('Z23-j', 'R03-e TI ikizi (guard NORMAL): yeniden açılan hesapta sürüm verilme sürümünden büyük (kapatma +1) → eski oturum REDDEDİLİR → P6-C4L/D PASS (HTTP 401); productFinding / sessionVersion / oturum satırı YOK; portal satırı "yeniden AÇILDI …: açık erişim kapatılmalıdır (Recover kapatabilir)"; acikErisim AYRI; çıkış 6',
      normalE2E(z23j) && /yeniden AÇILDI \(P6-C5 FAIL: HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true\): açık erişim kapatılmalıdır \(Recover kapatabilir\)/.test(openLineOf(z23j)) && /^portal hesabı açık \(HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true sürüm=\d+\) — açık erişim kapatılmalıdır \(Recover kapatabilir\)$/.test(pcOf(z23j).acikErisim || ''), sumE(z23j));
    // claim ≠ s1 — token imzalanmadan önce sürüm +1 (sahte API login bumpBeforeSign): kanıtta ikisi de, esas claim; makbuz verilme sürümü = claim; normal akış çıkış 0
    const z23k = await runScenario('z23k-claim-differs-from-s1', dir, { login: 'bumpBeforeSign' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const iv23k = (z23k.ev || {}).issuedVersion || {}; const evTxt23k = z23k.ev ? JSON.stringify(z23k.ev) : '';
    check('Z23-k', 'R03-e claim ≠ s1 (sahte API login bumpBeforeSign: token imzalanmadan önce sürüm +1): normal akış çıkış 0; kanıtta issuedVersion {kaynak=claim, claim = s1 + 1, esas = claim, fark=true} (İKİSİ de yazılır, claim esas); makbuzda portalIssuedTokenVersion = claim + kaynak "claim"; P6-C2V referansı claim ("oturumların verildiği sürüm=claim → şimdiki=claim+1"); kanıt JSON\'unda portal token YOK ("pfake." yok)',
      z23k.code === 0 && iv23k.kaynak === 'claim' && Number.isInteger(iv23k.s1) && iv23k.claim === iv23k.s1 + 1 && iv23k.esas === iv23k.claim && iv23k.fark === true && !!z23k.rc && z23k.rc.portalIssuedTokenVersion === iv23k.claim && z23k.rc.portalIssuedTokenVersionKaynak === 'claim'
        && z23k.v('P6-C2V') === 'PASS' && z23k.o('P6-C2V') === `oturumların verildiği sürüm=${iv23k.claim} → şimdiki=${iv23k.claim + 1}` && !!evTxt23k && !evTxt23k.includes('pfake.'),
      `çıkış=${z23k.code} · issuedVersion=${JSON.stringify(iv23k)} · makbuz=${z23k.rc ? `${z23k.rc.portalIssuedTokenVersion}/${z23k.rc.portalIssuedTokenVersionKaynak}` : '-'} · C2V=${z23k.o('P6-C2V')}`);
    // claim okunamaz (iki parçalı opaque token) → s1; T2 sınıfı yine üretilir (kaynak s1)
    const z23l = await runScenario('z23l-claim-unreadable-s1', dir, { guard: 'stale', pwChange: 'onDisable', disable: 'forbidden', portalToken: 'opaque' }, {}, { onDisplay: (s) => phoneFlow(s) });
    const iv23l = (z23l.ev || {}).issuedVersion || {}; const sv23l = pcOf(z23l).sessionVersion || {};
    check('Z23-l', 'R03-e claim OKUNAMAZ (sahte API portalToken opaque: iki parçalı token) → verilme sürümü s1 (kanıtta kaynak=s1, claimDurum=OKUNAMADI, claim=null); T2 varyantında sınıf yine ADAY/T2 (sessionVersion.verilenKaynak=s1); makbuzda kaynak "s1"; çıkış 6',
      z23l.code === 6 && iv23l.kaynak === 's1' && iv23l.claimDurum === 'OKUNAMADI' && iv23l.claim === null && Number.isInteger(iv23l.esas) && iv23l.esas === iv23l.s1 && sv23l.sinif === 'ADAY' && sv23l.hucre === 'T2' && sv23l.verilenKaynak === 's1' && sv23l.verilen === iv23l.s1
        && !!z23l.rc && z23l.rc.portalIssuedTokenVersionKaynak === 's1',
      `çıkış=${z23l.code} · issuedVersion=${JSON.stringify(iv23l)} · sınıf=${JSON.stringify(sv23l)}`);
    // ==== R03-d (m5) — P6-FOREIGN-CLEAN açıklaması ölçülene bağlı (Z1: silinen 1 · Z3: satır ürün sızıntısıyla zaten silinmiş · Z7: yabancı satır hiç yazılmadı)
    const fcLine = (z) => (String(z.log || '').split(/\r?\n/).find((l) => /\bP6-FOREIGN-CLEAN\b/.test(l)) || '');
    check('Z22-d', 'R03-d: P6-FOREIGN-CLEAN açıklaması ve gözlemi ÖLÇÜLENE bağlı — silinen > 0 (Z1) → "Prisma ile temizlendi" (gözlem "Prisma ile temizlendi — silinen=1 kalan=0 (ölçüldü)"); satır zaten yoktu (Z3: ürün sızıntısı silmiş, silinen 0) → "zaten yoktu — temizleme YAPILMADI" (gözlem "satır zaten yoktu — silinen=0 kalan=0 (ölçüldü)"), "Prisma ile temizlendi" YOK; yabancı satır hiç yazılmadı (Z7: yükleme 500, akış yabancı satırdan önce durdu) → "hiç yazılmadı — temizleme YAPILMADI" (gözlem "yabancı satır hiç yazılmadı — silinen=0 kalan=0 (ölçüldü)"), "Prisma ile temizlendi" YOK; üçünde de PASS',
      z1.v('P6-FOREIGN-CLEAN') === 'PASS' && z1.o('P6-FOREIGN-CLEAN') === 'Prisma ile temizlendi — silinen=1 kalan=0 (ölçüldü)' && /Prisma ile temizlendi/.test(fcLine(z1))
        && z3.v('P6-FOREIGN-CLEAN') === 'PASS' && z3.o('P6-FOREIGN-CLEAN') === 'satır zaten yoktu — silinen=0 kalan=0 (ölçüldü)' && /zaten yoktu — temizleme YAPILMADI/.test(fcLine(z3)) && !/temizlendi/.test(fcLine(z3))
        && z7.v('P6-FOREIGN-CLEAN') === 'PASS' && z7.o('P6-FOREIGN-CLEAN') === 'yabancı satır hiç yazılmadı — silinen=0 kalan=0 (ölçüldü)' && /hiç yazılmadı — temizleme YAPILMADI/.test(fcLine(z7)) && !/temizlendi/.test(fcLine(z7)),
      `Z1=${z1.o('P6-FOREIGN-CLEAN')} · Z3=${z3.o('P6-FOREIGN-CLEAN')} [${fcLine(z3).trim().slice(0, 120)}] · Z7=${z7.o('P6-FOREIGN-CLEAN')} [${fcLine(z7).trim().slice(0, 120)}]`);
    // ==== R03-d (m7 + m6 + BOM) — BAYAT makbuz önerilmez; makbuzDiskte klasörde false; BOM'lu makbuz KULLANILABILIR
    const aStale = adimOf(out21({ receipt: Object.assign({}, memR, { createOutcome: 'ok' }), receiptWriteError: 'EACCES: izin yok' }), okP, 'run', path.join(rDir, 'kanit.json'));
    const bomP = path.join(rDir, 'bom.json'); fs.writeFileSync(bomP, '\uFEFF' + JSON.stringify(memR, null, 1), 'utf8'); const stBom = rfs ? rfs(bomP, memR) : {};
    const gBom = typeof EX.readReceiptForRecover === 'function' ? EX.readReceiptForRecover(bomP) : {};
    check('Z22-e', 'R03-d: (m7) diskteki makbuz BAYAT (bellekteki son makbuzla eşit değil: createOutcome eklenmiş, yazma hatası EACCES) → Run adımı diskteki dosyayı ÖNERMEZ ("-ReceiptFile <makbuz>" YOK): "makbuz dosyası BAYAT (… farklı alan(lar): createOutcome; … EACCES: izin yok): … sonradan eklenen kimlikleri içermeyebilir → eksik kapanış: bu makbuz dosyasıyla Recover ÖNERİLMEZ" + kanıttaki makbuzJson\'dan TEK komut SOMUT kanıt yoluyla (<kanıt dizini>\\d6-setup-receipt-kanittan.json); makbuzGuncel=false · (m6) makbuz yolu KLASÖR → makbuzDiskte=false (önceki existsSync true) · BOM\'lu makbuz → receiptFileState KULLANILABILIR (güncel) ve readReceiptForRecover ok',
      noCmd(aStale) && /— ama makbuz dosyası BAYAT \(diskteki makbuz koşucunun bellekteki son makbuzuyla EŞİT DEĞİL — farklı alan\(lar\): createOutcome; makbuzun sonraki bir yazımı başarısız · makbuz yazma hatası: EACCES: izin yok\)/.test(aStale.adim || '') && /eksik kapanış: bu makbuz dosyasıyla Recover ÖNERİLMEZ/.test(aStale.adim || '')
        && altPath(aStale) && String(aStale.adim || '').includes(path.join(rDir, 'd6-setup-receipt-kanittan.json')) && aStale.makbuzGuncel === false && aStale.makbuzDurumu === 'KULLANILABILIR'
        && aDir.makbuzDiskte === false && fs.statSync(dirP).isDirectory() && aGone.makbuzDiskte === false
        && stBom.durum === 'KULLANILABILIR' && stBom.guncel === true && gBom.ok === true,
      `bayat=${String(aStale.adim || '').slice(0, 300)} · klasör makbuzDiskte=${aDir.makbuzDiskte} · BOM durum=${stBom.durum}/${stBom.guncel} okuma=${gBom.ok}`);

    // ---- Z13 KONSOLSUZ conout → yazmadan 4
    const rid13 = hex8(); const pw13 = 'D6T!' + crypto.randomBytes(12).toString('base64url'); secretsSeen.add(pw13);
    const env13 = Object.assign({}, process.env, { AH_DATABASE_URL: DBURL, AH_PRISMA_ROOT: PRISMA_ROOT, AH_BCRYPT_PATH: BCRYPT, NODE_EXTRA_CA_CERTS: certFile, D6_MODE: 'run', D6_LIVE_CONFIRM: '1', D6_LIVE_GO_REF: 'OWNER-GO-CLIENT-EXTACC-D6-20000101-R99', D6_RUNID: rid13, D6_EXPECT_DB: DB_NAME,
      D6_EXPECT_TENANT_SLUG: `ah-${rid13}`, D6_API_BASE: API, D6_EXPECT_API: API, D6_EXPECT_BASE_URL: EXT, D6_LIVE_LOGIN_PW: pw13, D6_RECEIPT: path.join(dir, 'z13-receipt.json'), D6_EVID_FILE: path.join(dir, 'z13-evidence.json'), D6_DISPLAY: 'conout', D6_TEST_DISPLAY_SINK: path.join(dir, 'z13.sink') });
    const r13 = await new Promise((res) => { const c = spawn(process.execPath, [RUN], { env: env13, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let l = ''; c.stdout.on('data', (d) => { l += d; }); c.stderr.on('data', (d) => { l += d; }); c.on('close', (x) => res({ code: x, log: l })); });
    fs.writeFileSync(path.join(dir, 'z13.log'), r13.log, 'utf8'); artifacts.push(path.join(dir, 'z13.log'));
    check('Z13', 'konsolsuz süreçte D6_DISPLAY=conout: çıkış 4, "yerel konsol yok", DB yazma YOK, makbuz YOK, sink YOK', r13.code === 4 && /yerel konsol yok/.test(r13.log) && !(await prisma.tenant.findFirst({ where: { slug: `ah-${rid13}` } })) && !fs.existsSync(path.join(dir, 'z13-receipt.json')) && !fs.existsSync(path.join(dir, 'z13.sink')), `çıkış=${r13.code}`);
    // ---- Z14 MAKBUZ YAZILAMIYOR → API çağrısı yok, çıkış 1
    const z14 = await runScenario('z14-receipt-fail', dir, {}, { D6_RECEIPT: path.join(dir, 'yok', 'alt', 'r.json') });
    check('Z14', 'makbuz yazılamazsa login/create-user/yükleme 0, kurulum kapatıldı, çıkış 1', z14.code === 1 && !z14.calls.some((c) => /auth\/login|create-user/.test(c.path)) && z14.ext.length === 0 && z14.activeUsers === 0, `çıkış=${z14.code}`);
    // R03-c (c): portal hesabı YOKKEN (Z14: makbuz yazılamadı → hesap hiç istenmedi) P6-C1 günlük satırı kapatma İDDİA ETMEZ (açıklama kanıta değil günlüğe yazılır)
    const c1Line6 = (String(z14.log || '').split(/\r?\n/).find((l) => /\bP6-C1\b/.test(l)) || '');
    check('Z21-d', 'portal hesabı YOKKEN (Z14 Run günlüğü: makbuz yazılamadı, hesap istenmedi; P6-C1 PASS, disable-user çağrısı 0) P6-C1 satır açıklaması kapatma İDDİA ETMEZ: "portal hesabı YOK (DB\'de ölçüldü) — kapatılacak portal erişimi yok; kapatma çağrısı YAPILMADI"; "kapatıldı" YOK (önceki baytlar "portal erişimi yetkili uçla kapatıldı" yazıyordu)',
      /portal hesabı YOK \(DB'de ölçüldü\) — kapatılacak portal erişimi yok; kapatma çağrısı YAPILMADI/.test(c1Line6) && !/kapatıldı/.test(c1Line6) && z14.v('P6-C1') === 'PASS' && !z14.calls.some((c) => c.path === '/api/portal/admin/disable-user'),
      `Run: ${c1Line6.trim().slice(0, 160)}`);

    // ---- C-1 (R03 c) — kanıttaki kurtarma/kapanış metinleri YALNIZ ölçüleni söyler: bu öz-testin ürettiği TÜM Run/Recover kanıtları taranır
    let evScanned = 0; let evNeed = 0; const textBad = [];
    const fixedClaims = [/BİR KEZ daha/, /token 7 gün/, /birkaç dakika sonra Recover/, /Recover BİR KEZ/, /kapanışta yeniden kapatıldı/, /fark portal hesabı aç\/kapa kaynaklıdır/];
    for (const f of new Set(artifacts)) {
      if (!/-evidence\.json$/.test(f) || !fs.existsSync(f)) continue; const nm = path.basename(f); let e;
      try { e = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (x) { textBad.push(`${nm}:okunamadı`); continue; }
      evScanned++;
      if (e.revision !== 'R03') textBad.push(`${nm}:revision=${e.revision}`);
      const txt = JSON.stringify({ recovery: e.recovery || null, temporaryAccess: e.temporaryAccess || null, audit: e.auditRetained || null, note: ((e.portalClose || {}).docResidue || {}).note || null });
      for (const re of fixedClaims) if (re.test(txt)) textBad.push(`${nm}:${re.source}`);
      if (e.recovery && e.recovery.gerekli) {
        evNeed++; const a = e.recovery.adim || '';
        if (!/^ÖNERİ \(yetki DEĞİL\)/.test(a)) textBad.push(`${nm}:adım ÖNERİ değil`);
        if (e.record === 'EXTACC-D6-RECOVER' && e.exitCode !== 3 && !/İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR/.test(a)) textBad.push(`${nm}:Recover adımı ikinci Recover kuralını yazmıyor`);
        if (e.record !== 'EXTACC-D6-RECOVER' && !/AYRI owner onayıyla/.test(a)) textBad.push(`${nm}:Run adımı AYRI owner onayını yazmıyor`);
      }
      if (e.temporaryAccess && typeof e.temporaryAccessClosed !== 'boolean') textBad.push(`${nm}:temporaryAccessClosed ölçülmedi`);
      if (e.record === 'EXTACC-D6-PORTAL-DOCUMENTS-LIVE-RUN' && e.auditRetained && e.auditRetained.before !== null && e.auditRetained.before !== undefined && typeof e.auditRetained.delta !== 'number') textBad.push(`${nm}:audit farkı ölçülmedi`);
    }
    check('C-1', 'kanıttaki kurtarma/kapanış metinleri yalnız ölçüleni söyler (tüm Run/Recover kanıtları): revision=R03; sabit iddia YOK ("BİR KEZ daha", "token 7 gün", "birkaç dakika sonra Recover", "Recover BİR KEZ", "kapanışta yeniden kapatıldı", "fark … kaynaklıdır"); kurtarma gerekliyse adım "ÖNERİ (yetki DEĞİL)" ile başlar — Run adımı AYRI owner onayını, Recover adımı (çıkış 3 dışı) "İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR" kuralını yazar; Recover geçici erişimi verdiyse kapanışı ölçülmüş alanla (temporaryAccessClosed) yazılır; Run audit farkı sayı olarak ölçülür',
      evScanned >= 30 && evNeed >= 15 && textBad.length === 0, `taranan kanıt=${evScanned} · kurtarma gerekli=${evNeed} · sorun=${textBad.length ? textBad.slice(0, 10).join(', ') : 'yok'}`);

    // ---- S-1 SIR SIZINTISI — portal parolaları, ölçüm parolaları, personel parolası, JWT'ler, DB URL, GO (sink dosyaları TARAMA DIŞI)
    let scanned = 0; const leaks = [];
    for (const f of artifacts) {
      if (!fs.existsSync(f) || sinks.has(f)) continue; const t = fs.readFileSync(f, 'utf8'); scanned++;
      for (const s of secretsSeen) if (s && t.includes(s)) leaks.push(`${path.basename(f)}:${String(s).slice(0, 4)}…`);
      if (/authorization|bearer /i.test(t)) leaks.push(`${path.basename(f)}:Authorization`);
    }
    const nPw = [...secretsSeen].filter((s) => /^D6p!/.test(String(s))).length; const nJwt = [...secretsSeen].filter((s) => /^p?fake\./.test(String(s))).length;
    check('S-1', 'portal parolası · Recover ölçüm parolası · personel parolası · JWT · DB URL · GO hiçbir log/makbuz/kanıtta YOK', scanned > 40 && leaks.length === 0 && nPw >= 8 && nJwt >= 10, `taranan=${scanned} · aranan=${secretsSeen.size} (portal parola ${nPw} · jwt ${nJwt}) · sızıntı=${leaks.length ? leaks.join(',') : 'yok'}`);
  } finally { try { await ctl('POST', '/__lift'); } catch (e) { /* sahte API kapanmış olabilir */ } fake.kill(); await prisma.$disconnect().catch(() => {}); }

  // ---- STATİK
  const src = fs.readFileSync(RUN, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  const srcNoList = src.replace(/FORBIDDEN = \[[^\]]*\]/, '');
  check('T-1', 'koşucu kaynağında forgot/reset/change-password, messages, admin approve/reject çağrısı YOK; koşucu dosya silmez (unlink/rm yok); Prisma delete yalnız PortalDocument (yabancı/kalıntı temizliği)',
    !EX.FORBIDDEN.some((re) => re.test(srcNoList)) && !/unlinkSync|rmSync|\.unlink\(|\.rm\(/.test(src) && (src.match(/prisma\.\w+\.delete(Many)?\(/g) || []).every((m) => /portalDocument/.test(m)), `delete çağrıları=${(src.match(/prisma\.\w+\.delete(Many)?\(/g) || []).join(',')}`);
  // T-8 (R03 a): personel yeniden girişi YALNIZ Run'ın kendi kapanışında; Recover'ın oturum açma yolu değişmedi; yeniden giriş DB'ye yazmaz.
  const runSrc = src.slice(src.indexOf('async function runMode'), src.indexOf('async function recoverMode')); const recSrc = src.slice(src.indexOf('async function recoverMode'));
  const iRe = runSrc.indexOf('const staffReauth ='); const reauthFn = iRe >= 0 ? runSrc.slice(iRe, runSrc.indexOf('} : null;', iRe)) : '';
  check('T-8', 'personel yeniden girişi yalnız Run kapanışında: Run\'ın closePortal çağrısına `staffReauth` verilir, Recover vermez; yeniden giriş fonksiyonu yalnız makbuzdaki personelle L.AH.login çağırır ve DB\'ye yazmaz (prisma çağrısı yok); closePortal yeniden girişi yalnız 401/403\'te ve bir kez yapar',
    reauthFn.length > 0 && /L\.AH\.login\(base, receipt\.elevEmail, pw, receipt\.tenantSlug\)/.test(reauthFn) && !/prisma\./.test(reauthFn) && /closePortal\([^)]*\{ session, staffReauth,/.test(runSrc) && !/staffReauth/.test(recSrc)
      && /\(r\.status === 401 \|\| r\.status === 403\) && o\.staffReauth && !res\.staffReauth/.test(src), `fonksiyon=${reauthFn.length} karakter · Recover'da staffReauth=${/staffReauth/.test(recSrc)}`);
  // T-9 (R03-e): koşucu oturumunun HER 200'ü TEK sınıflamadan (judgeSession → sessionClass200; P6-C2 PASS / FAIL dalı ayrımı yok); yorum dışı kaynakta "hâlâ AÇIK",
  // koşulsuz P6-C2 FAIL "SAYILMADI" metni (sessionWhileOpen / dbOpenTxt), eski sınıflama (sessionClassDuringChange) ve "adayı DEĞİL" YOK; "ürün bulgusu değil" tek yerde (T5).
  const nCls = (src.match(/sessionClass200\(/g) || []).length; const nDegil = (src.match(/ürün bulgusu değil/g) || []).length;
  check('T-9', 'R03-e: koşucu kaynağında (yorum dışı) oturum 200\'ü TEK sınıflamadan geçer — sessionClass200 tanım + judgeSession\'da TEK çağrı ("if (r.status === 200) { const sc = sessionClass200(issued, st1, st2);"); "hâlâ AÇIK", sessionWhileOpen, dbOpenTxt, sessionClassDuringChange, "adayı DEĞİL" YOK; "ürün bulgusu değil" yalnız bir kez (T5 hücresi)',
    nCls === 2 && /if \(r\.status === 200\) \{\s*const sc = sessionClass200\(issued, st1, st2\);/.test(src) && !/hâlâ AÇIK|sessionWhileOpen|dbOpenTxt|sessionClassDuringChange|adayı DEĞİL/.test(src) && nDegil === 1,
    `sessionClass200( geçişi=${nCls} · "ürün bulgusu değil"=${nDegil} · yasak dize=${(src.match(/hâlâ AÇIK|sessionWhileOpen|dbOpenTxt|sessionClassDuringChange|adayı DEĞİL/g) || []).join(',') || 'yok'}`);
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
