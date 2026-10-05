'use strict';
/*
 * D-8 sondası ÖZ-TESTİ (R05) — canlıya dokunmaz. Gerçek TLS'li SAHTE KENAR + SAHTE API (istek kimliği ara katmanı modeli).
 *
 * MODEL
 *   Sahte kenar : Caddyfile şablonunun 4 izin regex'i + admin reddi; karar GERÇEK CADDY yol temizliği modeliyle (yüzde-çöz +
 *                 ./.. + // sadeleştir). Arka uca HAM yolu iletir (şablon: "YOL DÖNÜŞÜMÜ YOK").
 *   Sahte API   : istek kimliği ara katmanını ÜRÜN KAYNAĞINDAN okunan kurallarla BİREBİR uygular (bu dosya kaynağı çalışma anında
 *                 okur: request-id.middleware.ts → başlık adı + SAFE_REQUEST_ID + `normalizeRequestId(incoming) ?? randomUUID()`;
 *                 main.ts → genel önek + enableCors; app.module.ts → forRoutes('*')). Gelen kimlik kabul biçimindeyse yanıta AYNEN
 *                 yazılır; değilse ATILIR ve `randomUUID()` ile YENİSİ üretilir. Ara katman yalnız Express'in `/api$` ve `/api/*`
 *                 için ürettiği ifadelerle eşleşen HAM yolda çalışır (büyük/küçük harf duyarsız; yüzde dizisi çözülemezse çalışmaz
 *                 → 400, başlıksız); OPTIONS ön uçuşu ara katmandan ÖNCE 204 ile biter (başlıksız). Bu bir MODELDİR (kaynak
 *                 okuması); gerçek API ile izole prova DEĞİLDİR (çağıran koşar).
 *   Aracı katman kipleri: YANSITAN (isteğin kimliğini yanıta kopyalar) · DAMGALAYAN (kendi kimliğini yazar) · EZEN (API'nin başlığını
 *                 siler ya da üzerine yazar) — her biri "yalnız şu yanıtlarda" / "her yerde" girdileriyle.
 *   Zemin gerçeği: sahte uç her isteğe NE yanıt verdiğini (üreten katman, durum, kimlik, işaret) kaydeder. Kalemler sondanın sınıfını
 *                 bu kayıtla karşılaştırır: her kalem AYIRT EDİCİ GİRDİ → sondanın ÖLÇTÜĞÜ alan biçimindedir. Alan sırası her yerde
 *                 "HTTP / ret · kenar engelleme · katman doğrulaması · pozitif kontrol"dür (P = PASS · F = FAIL · O = OLCULEMEYEN).
 *
 * KALEMLER (kimlik: girdi → ölçülen alan)
 *   K-SRC  ürün kaynağındaki dayanaklar + sondanın iki deseni kaynakla aynı (kabul deseni metni; üretilen kimlik biçimi).
 *   K-PORT öz-test port kapısı (canlı / veritabanı / ayrılmış portlar reddedilir, dinleme başlamaz).
 *   S1     sağlıklı kenar → çıkış 0; P · P · O · P; üç alan + pozitif kontrol AYRI; birleşik PASS yok; kayıt eki; katman kapsam sayısı.
 *   K-1    kalibrasyon: API pozitiflerinde İKİ davranış (aynen geri yazma 3/3 · değiştirme 3/3), başlıksız bölge temiz → VAR.
 *   L-1    "API değil" çıkarımı yalnız uygun yollarda; ön uçuş / yolu belirsiz / web yolu → OLCULEMEYEN (neden sınıfıyla).
 *   S1-p   ham yol · S1-c kimlik / gövde · Y-1 istek kimliği planı (hangi istekte hangi biçim; kaynak deseniyle ölçülür) · Y-2 plan
 *          kapısı (iki biçim ayrışmıyorsa istek atılmaz) · S7 kapsam.
 *   S2     bozuk kenar (AD-2, tam kapsam yetkisi kaydıyla) → çıkış 2; F · F · F · P · N-5 bir süreç = bir ad = bir kanıt.
 *   S3 / S3-b / S3-c  ipuçları değişir, alanlar S1 ile aynı · S3-dN gövdesi dolu ama başlıksız 403 → S1 ile aynı.
 *   S3-ch / S3-chF / S3-az / S3-azP  sınama / tanınmayan azaltım işareti: durum kodu ölçütü PASS kalır, kenar engelleme OLCULEMEYEN
 *          (çıkış 3); işaretli 2xx bulgu kalır.
 *   A-1    API'nin ürettiği 403 (GECERSIZ-BICIM → yeni kimlik) → durum kodu ölçütü PASS ama kenar engelleme FAIL (çıkış 2).
 *   A-2    API'nin 403'ü yalnız yolu belirsiz vektörde → yine API kanıtı.
 *   A-3    kalibrasyon EKSİK / GEÇERSİZ iken API kanıtı → kenar engelleme yine FAIL (somut kanıt silinmez).
 *   A-4    sınama işaretli 403 + başka satırda API kanıtı → FAIL korunur (işaret FAIL'i düşürmez).
 *   R-1    yansıtan aracı YALNIZ API önekli retlerde (ön uçuş hariç) → API kanıtı YOK; O · R-2 yansıtan her yerde → API kanıtı YOK.
 *   R-3    yansıma tek bir yanıtta (ön uçuş · web ret · web pozitifi, iki biçimde) → kalibrasyon GECERSIZ; "API değil" çıkarımı yok.
 *   M-1    damgalayan aracı (bütün ret yanıtları) → API biçimindeki yeni kimlik API kanıtı SAYILMAZ · M-2 damga + gerçek sızıntı →
 *          kanıt kullanılamaz, durum kodu ölçütü FAIL · M-3 damga tek bölgede (web ret · ön uçuş · bir web pozitifi) → kanıt
 *          kullanılamaz · M-4 API biçiminde OLMAYAN damga yalnız API önekli retlerde → yabancı kimlik.
 *   E-1    ezen aracı (başlığı siler) → kalibrasyon YOK; sızıntıda kanıt yok ama durum kodu ölçütü FAIL · E-2 ezen aracı (üzerine
 *          yazar) / canlı API kaynaktaki gibi davranmıyor → kalibrasyon GECERSIZ.
 *   SINIR-1 / SINIR-2  sondanın ÖLÇEMEDİĞİ iki durumun kaydı (güvence DEĞİL): yalnız API önekli retlere API biçiminde kimlik yazan
 *          katman → FAIL sayılır · API'nin 403 yanıtından başlığı silen katman → PASS görünür (kayıt ekindeki varsayım).
 *   K-5    kısmi kalibrasyon (5/6 · 1/6 · yalnız değiştirme · yalnız aynen geri yazma) → YOK · K-10 web pozitifi ölçülemedi ·
 *   Z-1    başlıksız bölge hiç ölçülemedi → API kanıtı kullanılamaz.
 *   L-2 … L-9  403 dışı yanıtlar: durum kodu ölçütü HER birinde FAIL; kenar engelleme yalnız API kanıtı varsa FAIL.
 *   H-1    yanıt alınamayan ret vektörü → OLCULEMEYEN; doğrulanmış başka yanıt → FAIL (ayrı sınıflar).
 *   U-1 / U-2 / U-3  tekdüze 403 · sunulmayan ad (tekdüze 404 / 3xx / 401) · kardeş dallar.
 *   P-1 … P-5  pozitif kontrol ayrı kayıt: token'sız 200 · öncelik · tek pozitif 403 · kanıtsız 5xx · web pozitifinde 3xx / 404.
 *   G-1    kenar her şeyi geçirir (zemin gerçeği) · GT-1 bütün koşumlarda değişmezler (zemin gerçeğiyle kimlik anlamı · API olmayan
 *          yanıt API sayılmaz · API yanıtı "API değil" sayılmaz · alan değerleri kümesi) · X-1 çıkış kodu eşlemesi · X-2 tanınmayan
 *          alan değeri hiçbir koşulda çıkış 0 vermez.
 *   N-1 … N-4 · O-1 · O-1b · S5-a…e · S6  kapılar.
 *   SA-1 … SA-8  kapsam yetkisi kapısı: kayıt yok · yalnız tünel · özet tutmuyor · ana makine uyuşmuyor · ad kimliği uyuşmuyor ·
 *          tam kayıt · biçimsel hileler · AD-1 / telefon listesi.
 *   O-2 · O-3 · V-1 · V-2  adsız özet ve vektör kümesi kimliği · T-1 … T-4 statik · D-1 pinler · DOC-1 belge ↔ kod ↔ öz-test.
 *   B-0 · B-G · B-1 … B-T2  belgedeki owner blokları, test ikamesi KANITLANMADAN hiç koşmaz; iki kabukta.
 *   S4 · S4-b  taşıma hataları.
 *
 * ORTAM  : D8_SELFTEST_PORT  sahte kenar portu (varsayılan 8457; yasak portlar reddedilir → çıkış 4).
 *          D8_SELFTEST_PROBE başka bir sonda dosyası (negatif ayna / mutasyon provası). Verilirse D-1 pin kalemi DÜŞER (beklenen).
 *          D8_SELFTEST_WINPS_EXE / D8_SELFTEST_PWSH_EXE kabuk yürütülebilirinin adı (varsayılan powershell.exe / pwsh). Kabuk
 *          başlatılamazsa ya da sürümü tutmazsa o kabuğun B-* kalemleri ÖLÇÜLEMEDİ olur ve öz-test çıkışı 2'dir (0 DEĞİL).
 * KULLANIM: node d8-selftest.js   ÇIKIŞ: 0 hepsi PASS · 1 en az bir FAIL · 2 FAIL yok ama ÖLÇÜLEMEYEN var · 4 port kapısı
 */
const { spawn, execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path'); const os = require('os'); const https = require('https'); const crypto = require('crypto');

const FORBIDDEN_PORTS = [8080, 3002, 5432, 5447, 5448, 5449, 5591, 18095];
const PORT_RAW = process.env.D8_SELFTEST_PORT === undefined ? '8457' : String(process.env.D8_SELFTEST_PORT);
const PORT = /^\d{4,5}$/.test(PORT_RAW) ? Number(PORT_RAW) : NaN;
if (!(PORT >= 1024 && PORT <= 65535) || FORBIDDEN_PORTS.includes(PORT)) { console.error(`REDDEDİLDİ: D8_SELFTEST_PORT=${PORT_RAW} kullanılamaz (1024–65535; canlı / veritabanı / ayrılmış portlar ${FORBIDDEN_PORTS.join(', ')} yasak)`); process.exit(4); }
// K-PORT kaleminin alt süreçleri yalnız kapıyı ölçer: kapı geçilse bile dinleme / sonda koşumu / yeni alt süreç BAŞLAMAZ.
if (process.env.D8_SELFTEST_GATE_ONLY === '1') { console.log('KAPI GEÇİLDİ: port ' + PORT); process.exit(0); }

const PKG = path.join(__dirname, '..'); const REAL_PROBE = path.join(__dirname, 'd8-staff-surface-probe.js');
const PROBE = process.env.D8_SELFTEST_PROBE ? path.resolve(process.env.D8_SELFTEST_PROBE) : REAL_PROBE;
const DOC = path.join(PKG, 'EXTACC-D8-STAFF-SURFACE-PACKAGE-R01.md');
const API_SRC = path.join(PKG, '..', '..', '..', 'apps', 'api', 'src');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
/** `randomUUID()` çıktısının biçimi (RFC 4122 sürüm 4) — bu dosyada BAĞIMSIZ yazılıdır (sondanın ifadesinden türetilmez). */
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ─── Ürün kaynağından okunan dayanaklar (sahte API bu değerlerle çalışır) ─────────────────────────────────────────────────
function sourceFacts() {
  const mw = fs.readFileSync(path.join(API_SRC, 'common', 'request-id.middleware.ts'), 'utf8');
  const main = fs.readFileSync(path.join(API_SRC, 'main.ts'), 'utf8'); const mod = fs.readFileSync(path.join(API_SRC, 'app.module.ts'), 'utf8');
  const h = /REQUEST_ID_HEADER\s*=\s*"([^"]+)"/.exec(mw); const s = /SAFE_REQUEST_ID\s*=\s*\/(.+)\/;/.exec(mw); const p = /setGlobalPrefix\(\s*"([^"]+)"\s*\)/.exec(main);
  return { header: h && h[1], safeSrc: s && s[1], safe: s ? new RegExp(s[1]) : null, prefix: p && p[1],
    // İki davranış tek satırdadır: kabul edilen değer AYNEN, edilmeyen yerine randomUUID(); ikisi de yanıt başlığına yazılır.
    writesBackOrReplaces: /typeof value === "string" && SAFE_REQUEST_ID\.test\(value\) \? value : undefined/.test(mw) && /normalizeRequestId\(incoming\)\s*\?\?\s*randomUUID\(\)/.test(mw) && /res\.setHeader\(REQUEST_ID_HEADER,\s*requestId\)/.test(mw) && /import \{ randomUUID \} from "crypto"/.test(mw),
    wildcard: /consumer\.apply\(\s*RequestIdMiddleware[^)]*\)\.forRoutes\('\*'\)/.test(mod), cors: /app\.enableCors\(/.test(main) };
}
let F; try { F = sourceFacts(); } catch (e) { console.log('OLCULEMEDI: ürün kaynağı okunamadı (' + String(e.code || e.message).slice(0, 80) + ')'); process.exit(2); }
if (!F.header || !F.safe || !F.prefix) { console.log('OLCULEMEDI: ürün kaynağında başlık adı / kabul biçimi / genel önek bulunamadı'); process.exit(2); }
// Express 4 (path-to-regexp 0.1.x) `app.use('/<önek>$')` ve `app.use('/<önek>/*')` için şu ifadeleri üretir (2026-10-05, kurulu
// paketten ölçüldü: /^\/api$\/?(?=\/|$)/i ve /^\/api\/(.*)\/?(?=\/|$)/i). Nest 10.4.20 forRoutes('*') + genel önek bu iki yolu kaydeder.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const MW_RX = [new RegExp('^\\/' + esc(F.prefix) + '$\\/?(?=\\/|$)', 'i'), new RegExp('^\\/' + esc(F.prefix) + '\\/(.*)\\/?(?=\\/|$)', 'i')];
/** Ürün kaynağı modeli: API bu isteği işleseydi istek kimliği ara katmanı çalışır mıydı? */
function apiMw(method, rawUrl) {
  if (method === 'OPTIONS') return 'CORS';                       // enableCors ön uçuşu ara katmandan ÖNCE yanıtlar
  const pn = String(rawUrl).split('?')[0];
  for (const rx of MW_RX) { const m = rx.exec(pn); if (!m) continue; try { if (m[1] !== undefined) decodeURIComponent(m[1]); } catch (e) { return 'COZME-HATASI'; } return 'CALISIR'; }
  return 'ESLESMEZ';
}
/** Express rota eşleşmesi HAM yolda yapılır (sabit segmentlerde yüzde-çözme / nokta-segment sadeleştirme yok); harf duyarsız; sondaki '/' serbest. */
function apiNatural(rawUrl) {
  const pn = String(rawUrl).split('?')[0].toLowerCase().replace(/\/$/, '');
  return /^\/api\/(auth\/me|cases|users|portal\/admin\/(create-user|disable-user|documents\/pending|messages\/clients)|portal\/(cases|documents|messages|change-password)|portal\/documents\/[^/]+)$/.test(pn) ? 401 : 404;
}

const RX = {
  web: /^\/(intake\/[^/]+|portal(\/(login|forgot-password|reset-password|cases|documents|financial-disclosures|messages|poas|profile))?|portal\/cases\/[^/]+|_next\/.+|favicon\.ico)$/,
  aget: /^\/api\/(public\/intake\/[^/]+|portal\/(cases|cases\/[^/]+|financial-disclosures|financial-disclosures\/history|financial-disclosures\/[^/]+|poas|notifications|notifications\/unread-count|documents|documents\/[^/]+\/download|messages|messages\/unread-count))$/,
  apost: /^\/api\/(public\/intake\/[^/]+|portal\/(login|forgot-password|reset-password|change-password|notifications\/[^/]+\/read|notifications\/read-all|messages|messages\/mark-read|documents\/upload))$/,
  adel: /^\/api\/portal\/documents\/[^/]+$/,
};
const ADMIN_RX = /^\/api\/portal\/admin(\/|$)/;
// Gerçek Caddy yol temizliği modeli (D8-E2): `{http.request.uri.path}` yüzde-çözülmüş yoldur ve `.`/`..`/`//` sadeleştirilir;
// sorgu atılır, tek sondaki slash korunur, geçersiz yüzde dizisi (örn. %c0%af) çözülemez → olduğu gibi kalır. İzin/admin kararı
// bu TEMİZLENMİŞ yola göre verilir; kenarın gördüğü ve arka uca ilettiği yol HAM yoldur.
function cleanPath(raw) {
  let p = String(raw).split('?')[0];
  for (let i = 0; i < 3; i++) { let d; try { d = decodeURIComponent(p); } catch (e) { break; } if (d === p) break; p = d; }
  const trailing = p.length > 1 && p.endsWith('/');
  const out = []; for (const s of p.split('/')) { if (s === '' || s === '.') continue; if (s === '..') { out.pop(); continue; } out.push(s); }
  let np = '/' + out.join('/'); if (trailing && np !== '/') np += '/'; return np;
}

// ─── Sahte kenar + sahte API ──────────────────────────────────────────────────────────────────────────────────────────────
let mode = 'ok'; let seen = []; // seen: zemin gerçeği — kenarın gördüğü HAM istek + verdiği yanıt (üreten, durum, kimlik, işaret)
const JSONH = { 'content-type': 'application/json', server: 'Caddy' };
const REDIRECT_TARGET = 'https://yonlendirme-hedefi.invalid/giris?next=gizli';
const STRICT_RX = UUID4; // "canlı API kaynaktaki gibi davranmıyor" girdisi: API yalnız bu biçimi kabul eder
const MIT_HEADER = 'cf-mitigated'; // sağlayıcının azaltım işareti (sahte kenar bu başlığı yalnız aşağıdaki girdilerle gönderir)
/** AZALTIM İŞARETİ GİRDİLERİ — [kimlik, gönderilen değer (dizi = iki AYRI başlık satırı), beklenen işaret sınıfı]. Beklenen sınıf burada
 *  DEĞİŞMEZ olarak yazılıdır (sondanın ifadesinden türetilmez): tanınan sınama değeri bir listenin ÖGESİ olarak ve harf duyarsız
 *  geçiyorsa SINAMA; başlık var ama değer başka bir şeyse (içinde "challenge" geçen başka bir değer ve BOŞ değer dahil) TANINMAYAN. */
const MARKS = [
  ['tam', 'challenge', 'SINAMA'], ['bas-harf-buyuk', 'Challenge', 'SINAMA'], ['tumu-buyuk', 'CHALLENGE', 'SINAMA'], ['liste-sonda', 'block, challenge', 'SINAMA'], ['liste-basta', 'challenge,block', 'SINAMA'], ['iki-satir', ['block', 'challenge'], 'SINAMA'],
  ['baska-deger', 'block', 'TANINMAYAN'], ['alt-cizgili', 'managed_challenge', 'TANINMAYAN'], ['ekli', 'challenged', 'TANINMAYAN'], ['tireli', 'non-challenge', 'TANINMAYAN'], ['bos', '', 'TANINMAYAN'],
];
/** `markmix` kipinde işaret taşıyan ret vektörleri (sıra MARKS ile birebir; hepsi sağlıklı kenarda 403 alan düz GET'ler). */
const MARK_KEYS = ['GET /', 'GET /auth/login', 'GET /dashboard', 'GET /auth/reset-password', 'GET /api/auth/me', 'GET /api/cases', 'GET /api/users', 'GET /api/health', 'GET /robots.txt', 'GET /api', 'GET /api/'];
function send(res, s, status, headers, body, producer) {
  const h = {}; for (const k of Object.keys(headers)) if (headers[k] !== undefined) h[k] = headers[k]; // gelen istekte kimlik yoksa yansıtılacak değer de yoktur
  const v = h[F.header]; s.status = status; s.producer = producer; s.respId = v === undefined ? null : v; s.echoed = v === undefined ? 'none' : (v === s.rid ? 'same' : 'other'); s.respUuid = typeof v === 'string' && UUID4.test(v);
  // Zemin gerçeği — azaltım işareti: başlık gönderilmediyse YOK; gönderildiyse girdinin BEYAN ettiği sınıf (beyansız başlık = düzenek hatası).
  s.mark = h[MIT_HEADER] === undefined ? 'YOK' : (s.markDecl || 'BEYANSIZ'); s.challenge = s.mark === 'SINAMA';
  res.writeHead(status, h); res.end(body || '');
}
/** Taşıma hatası üretir (yanıt YOK): 'drop' bağlantıyı koparır; 'hang' hiç yanıtlamaz (sonda zaman aşımına düşer). */
function noResponse(req, s, kind) { s.status = 0; s.producer = kind; s.echoed = 'none'; s.respId = null; s.respUuid = false; s.challenge = false; s.mark = null; if (kind === 'drop') req.socket.destroy(); }
/** SAHTE API — ürün ara katmanının birebir modeli. `o.strip`: zincirde API yanıtından başlığı SİLEN katman · `o.overwrite`: API'nin
 *  başlığının ÜZERİNE YAZAN katman · `o.strict`: API kaynaktakinden farklı bir kabul deseniyle çalışıyor · `o.extra`: eklenen başlık. */
function apiSend(req, res, s, status, o) {
  o = o || {}; const mw = apiMw(req.method, req.url); s.apiMw = mw;
  if (mw === 'CORS') return send(res, s, 204, { 'content-length': '0', vary: 'Origin, Access-Control-Request-Headers', server: 'Caddy' }, '', 'api');
  if (mw === 'COZME-HATASI') return send(res, s, 400, Object.assign({}, JSONH), '{"statusCode":400,"message":"Bad Request"}', 'api');
  if (mw === 'ESLESMEZ') return send(res, s, 404, Object.assign({}, JSONH), '{"statusCode":404,"message":"Not Found"}', 'api');
  const inc = req.headers[F.header]; const accept = o.strict ? STRICT_RX : F.safe;
  const h = Object.assign({ 'x-powered-by': 'Express' }, JSONH);
  h[F.header] = (typeof inc === 'string' && accept.test(inc)) ? inc : crypto.randomUUID(); // normalizeRequestId(incoming) ?? randomUUID()
  s.apiWrote = h[F.header] === inc ? 'AYNEN' : 'YENI';
  if (o.strip) delete h[F.header];
  if (o.overwrite !== undefined) h[F.header] = o.overwrite;
  if (o.extra) Object.assign(h, o.extra); // zincirde API yanıtına eklenen başlık (ör. azaltım işareti girdisi)
  return send(res, s, status, h, JSON.stringify({ statusCode: status, message: 'model' }), 'api');
}
function edge(req, res) {
  let bodyLen = 0; req.on('data', (c) => { bodyLen += c.length; });
  req.on('end', () => {
    const p = req.url; const h = req.headers; // Node req.url ham request-target'tır: './', '%2F', '?x=1' normalize edilmez
    const s = { method: req.method, url: p, cred: !!(h.authorization || h.cookie || h['x-api-key'] || h['proxy-authorization']), bodyLen, rid: h[F.header], hasRid: typeof h[F.header] === 'string' };
    s.ridOk = s.hasRid && F.safe.test(s.rid); // ürün kaynağındaki desen bu değeri KABUL eder mi (zemin gerçeği)
    seen.push(s);
    const np = cleanPath(p); // Caddy'nin karar verdiği temizlenmiş yol
    const allowed = (req.method === 'GET' && (RX.web.test(np) || RX.aget.test(np))) || (req.method === 'POST' && RX.apost.test(np)) || (req.method === 'DELETE' && RX.adel.test(np));
    const admin = ADMIN_RX.test(np); const deny = admin || !allowed; const apiish = np === '/api' || np.startsWith('/api/');
    const authLeak = deny && req.method !== 'OPTIONS' && np.startsWith('/api/auth/'); // bazı senaryolarda kenarın farklı davrandığı ret vektörleri
    const edgeSend = (status, headers, body) => send(res, s, status, headers, body, 'edge');
    const edge403 = (headers, body) => edgeSend(403, headers || { server: 'Caddy' }, body || '');
    const web200 = (extra) => send(res, s, 200, Object.assign({ 'content-type': 'text/html', server: 'Caddy' }, extra || {}), '<!doctype html><title>portal</title>', 'web');
    const upstream = (o) => (apiish ? apiSend(req, res, s, 401, o) : web200());
    const healthy = () => (deny ? edge403() : upstream());
    const k = req.method + ' ' + p; // tek bir vektörü ayırt eden girdi (yöntem + HAM yol)
    const ME = 'GET /api/auth/me'; // tek bir ret vektörü (düz /api yolu) — "bu istek API'ye ulaştı" girdilerinde kullanılır
    /** Azaltım işareti taşıyan 403: `value` gönderilen başlık değeri (dizi = iki ayrı satır), `cls` girdinin BEYAN ettiği sınıf (zemin gerçeği). */
    const mit403 = (value, cls) => { s.markDecl = cls; return edge403({ 'content-type': 'text/html', server: 'cloudflare', 'cf-ray': 'test', [MIT_HEADER]: value }, '<html><title>Just a moment...</title></html>'); };
    const challenge403 = () => mit403('challenge', 'SINAMA');
    const stamp = () => crypto.randomUUID(); // DAMGA: katmanın kendi kimlik değeri — API'nin ürettiği biçimle AYNI biçimde (en zor girdi)
    const reflect = { server: 'Caddy', [F.header]: s.rid }; // YANSIMA: isteğin kimliği yanıta kopyalanır
    const apiPrefixedNoPreflight = deny && apiish && req.method !== 'OPTIONS';
    switch (mode) {
      case 'ok': return healthy();
      case 'waf': return deny ? edge403({ 'content-type': 'text/html', server: 'cloudflare', 'cf-ray': 'test' }, '<html>Sorry, you have been blocked · cloudflare · error code: 1020</html>') : upstream(); // ENGELLEME imzası (sınama işareti YOK)
      case 'bare': return deny ? edge403({}) : upstream();                                             // Server başlığı yok, boş gövde
      case 'behind': return deny ? edge403({ server: 'cloudflare', 'cf-ray': 'test' }) : upstream();    // sağlayıcı arkasında Caddy: boş gövde, imza yok
      case 'body403': return deny ? edge403(Object.assign({}, JSONH), '{"statusCode":403,"message":"Forbidden"}') : upstream(); // DOLU gövde, BAŞLIKSIZ (kenar üretir)
      // ── azaltım işareti ──
      case 'challenge': return deny ? challenge403() : upstream();                                      // SINAMA işaretli 403, bütün ret vektörlerinde
      case 'challenge1': return authLeak ? challenge403() : healthy();                                  // sınama işareti yalnız birkaç ret vektöründe
      case 'markmix': { const i = MARK_KEYS.indexOf(k); if (i < 0) return healthy(); s.markId = MARKS[i][0]; return mit403(MARKS[i][1], MARKS[i][2]); } // on bir ret vektöründe on bir ayrı işaret değeri
      case 'mitunk': return deny ? mit403('managed_challenge', 'TANINMAYAN') : upstream();              // TANINMAYAN değerli işaret, bütün ret vektörlerinde (durum kodları `waf` ile aynı)
      case 'mitempty1': return k === 'GET /dashboard' ? mit403('', 'TANINMAYAN') : healthy();           // BOŞ değerli işaret, tek bir ret vektöründe
      case 'markpos': {                                                                                 // işaret POZİTİFLERİN beklenen yanıtında (bir web 200 · bir API 401); ret vektörleri sağlıklı
        if (k === 'GET /portal/login') { s.markDecl = 'SINAMA'; return web200({ [MIT_HEADER]: 'challenge' }); }
        if (k === 'GET /api/portal/cases') { s.markDecl = 'TANINMAYAN'; return apiSend(req, res, s, 401, { extra: { [MIT_HEADER]: 'managed_challenge' } }); }
        return healthy();
      }
      case 'challengeapp403': return k === ME ? apiSend(req, res, s, 403) : (deny ? challenge403() : upstream()); // sınama işareti bütün ret vektörlerinde + BİR ret vektörünü API 403 ile yanıtlamış
      case 'markdeny200': if (k === 'GET /api/auth/capabilities') { s.markDecl = 'SINAMA'; return apiSend(req, res, s, 200, { extra: { [MIT_HEADER]: 'challenge' } }); } return healthy(); // işaretli 2xx ret vektörü
      // ── GERÇEK API DAVRANIŞI: engellenmesi gereken istek API'ye ulaşmış (API geçersiz biçimli kimliği atar, yenisini üretir) ──
      case 'app403': return authLeak ? apiSend(req, res, s, 403) : healthy();                           // API'nin ürettiği 403 (beş ret vektörü)
      case 'app403var': return k === 'GET /api/portal/%61dmin/documents/pending' ? apiSend(req, res, s, 403) : healthy(); // API'nin 403'ü yalnız yolu belirsiz (kodlama varyantı) vektörde
      case 'api5xx': return authLeak ? apiSend(req, res, s, 503) : healthy();
      case 'api429': return authLeak ? apiSend(req, res, s, 429) : healthy();
      case 'api302': return authLeak ? apiSend(req, res, s, 302) : healthy();
      case 'broken': return (deny && (np === '/api/auth/me' || admin)) ? apiSend(req, res, s, apiNatural(p)) : healthy(); // temizlenmiş yola göre sızdırır, HAM yolu iletir
      // ── YANSITAN aracı ──
      case 'reflectapinopt': return apiPrefixedNoPreflight ? edge403(reflect) : healthy();              // YALNIZ API önekli, ön uçuş OLMAYAN retlerde (başlıksız bölge temiz)
      case 'reflectapi': return (deny && apiish) ? edge403(reflect) : healthy();                        // API önekli bütün retlerde (ön uçuş dahil)
      case 'webecho': return deny ? edge403(reflect) : (apiish ? apiSend(req, res, s, 401) : web200({ [F.header]: s.rid })); // kenar ve web yanıtlarında (API yanıtları değişmeden geçer)
      case 'reflectall': return deny ? edge403(reflect) : (apiish ? apiSend(req, res, s, 401, { overwrite: s.rid }) : web200({ [F.header]: s.rid })); // HER yanıtta (API'nin başlığının üzerine de yazar)
      case 'reflectweb1': return k === 'GET /dashboard' ? edge403(reflect) : healthy();                 // tek bir web ret yanıtında (ön uçuş değil)
      case 'reflectpos1': return k === 'GET /portal/login' ? web200({ [F.header]: s.rid }) : healthy(); // tek bir web POZİTİFİNDE (GECERLI-BICIM gönderilen)
      case 'reflectpos2': return k === 'GET /portal/forgot-password' ? web200({ [F.header]: s.rid }) : healthy(); // tek bir web POZİTİFİNDE (GECERSIZ-BICIM gönderilen)
      case 'reflectapp403': return k === ME ? apiSend(req, res, s, 403) : (deny ? edge403(reflect) : (apiish ? apiSend(req, res, s, 401) : web200({ [F.header]: s.rid }))); // yansıtan katman + API'ye ulaşan bir ret vektörü (API 403)
      // ── DAMGALAYAN aracı (kendi kimliğini yazar; yansıtmaz) ──
      case 'fark403': return deny ? edge403({ server: 'Caddy', [F.header]: stamp() }) : upstream();     // bütün ret yanıtlarında (web ve ön uçuş dahil)
      case 'stampleak': {                                                                               // başlıksız HER yanıta damga + API'ye ulaşan bir ret vektörü (API 401, değişmeden geçer)
        if (k === ME) return apiSend(req, res, s, 401);
        if (deny) return edge403({ server: 'Caddy', [F.header]: stamp() });
        return apiish ? apiSend(req, res, s, 401) : web200({ [F.header]: stamp() });
      }
      case 'fark403web': return (deny && !/^\/api(\/|$)/i.test(np)) ? edge403({ server: 'Caddy', [F.header]: stamp() }) : healthy(); // yalnız önek DIŞI (web) ret yanıtlarında (büyük harfli önek API sayılır)
      case 'fark403opt': return (deny && apiish && req.method === 'OPTIONS') ? edge403({ server: 'Caddy', [F.header]: stamp() }) : healthy(); // yalnız API önekli ön uçuş yanıtında
      case 'stamppos1app403': return k === 'GET /portal/login' ? web200({ [F.header]: stamp() }) : (k === ME ? apiSend(req, res, s, 403) : healthy()); // damga tek bir web pozitifinde + API'nin 403'ü
      case 'fark403api': return apiPrefixedNoPreflight ? edge403({ server: 'Caddy', [F.header]: stamp() }) : healthy(); // SINIR-1: API biçiminde damga YALNIZ API önekli, ön uçuş olmayan retlerde
      case 'fark403apifix': return apiPrefixedNoPreflight ? edge403({ server: 'Caddy', [F.header]: 'kenar-0001' }) : healthy(); // aynı yerde ama API biçiminde OLMAYAN değer
      // ── EZEN aracı (API'nin başlığını siler / üzerine yazar) ──
      case 'apinoecho': return deny ? edge403() : upstream({ strip: true });                            // başlık bütün API yanıtlarından silinir
      case 'stripleak': return k === ME ? apiSend(req, res, s, 401, { strip: true }) : (deny ? edge403() : upstream({ strip: true })); // başlık silinir + API'ye ulaşan bir ret vektörü
      case 'striponly403': return k === ME ? apiSend(req, res, s, 403, { strip: true }) : healthy();    // SINIR-2: başlık YALNIZ API'nin 403 yanıtından silinir
      case 'crushapi': return k === ME ? apiSend(req, res, s, 403, { overwrite: stamp() }) : (deny ? edge403() : upstream({ overwrite: stamp() })); // API yanıtlarının başlığı üzerine katmanın kendi değeri yazılır
      case 'strictfmt': return k === ME ? apiSend(req, res, s, 403, { strict: true }) : (deny ? edge403() : upstream({ strict: true })); // API kaynaktakinden farklı kabul deseniyle çalışıyor
      // ── kısmi kalibrasyon ──
      case 'partial5': return k === 'GET /api/portal/documents' ? upstream({ strip: true }) : healthy();                         // 6 API pozitifinden biri başlıksız
      case 'partial1': return (!deny && apiish && k !== 'GET /api/portal/cases') ? upstream({ strip: true }) : healthy();          // yalnız biri başlıklı
      case 'partialvalid': return (!deny && apiish && s.ridOk) ? upstream({ strip: true }) : healthy();                          // GECERLI-BICIM gönderilen API pozitifleri başlıksız (yalnız "değiştirme" görülür)
      case 'partialinvalid': return (!deny && apiish && !s.ridOk) ? upstream({ strip: true }) : healthy();                       // GECERSIZ-BICIM gönderilen API pozitifleri başlıksız (yalnız "aynen geri yazma" görülür)
      case 'partial5leak': return k === 'GET /api/portal/documents' ? upstream({ strip: true }) : (k === ME ? apiSend(req, res, s, 401) : healthy());
      case 'partial5app403': return k === 'GET /api/portal/documents' ? upstream({ strip: true }) : (k === ME ? apiSend(req, res, s, 403) : healthy());
      case 'pos403leak': return k === 'POST /api/portal/messages' ? edge403() : (k === ME ? apiSend(req, res, s, 401) : healthy());
      case 'posdropweb': return k === 'GET /portal/login' ? noResponse(req, s, 'drop') : healthy();                              // bir web pozitifi ölçülemedi
      case 'zonedropapp403': return (!/^\/+api(\/|$)/i.test(np) || req.method === 'OPTIONS') ? noResponse(req, s, 'drop') : (k === ME ? apiSend(req, res, s, 403) : healthy()); // web yolları ve ön uçuş YANITSIZ + API'nin 403'ü
      // ── 403 dışı, API'den geldiği kanıtsız yanıtlar ──
      case 'edge5xx': return authLeak ? edgeSend(502, { server: 'Caddy' }, '') : healthy();
      case 'edge404': return authLeak ? edgeSend(404, { server: 'cloudflare' }, '') : healthy();
      case 'rate429': return authLeak ? edgeSend(429, { server: 'cloudflare', 'retry-after': '1' }, '') : healthy();
      case 'redirect': return authLeak ? edgeSend(302, { server: 'Caddy', location: REDIRECT_TARGET }, '') : healthy();
      case 'edge600': return authLeak ? edgeSend(600, { server: 'Caddy' }, '') : healthy();                                       // hiçbir sınıfa girmeyen durum kodu
      case 'denydrop1': return k === 'GET /api/users' ? noResponse(req, s, 'drop') : healthy();                                  // TEK bir ret vektörü yanıtsız
      // ── tekdüze yanıtlar (sunulmayan ad) ve kardeşleri ──
      case 'uniform': return edge403();
      case 'uni404': return edgeSend(404, {}, '');                                                      // 68/68 başlıksız 404
      case 'uni301': return edgeSend(301, { location: REDIRECT_TARGET }, '');                           // 68/68 yönlendirme
      case 'uni401': return edgeSend(401, {}, '');                                                      // 68/68 başlıksız 401 (API pozitiflerinin beklenen kodu)
      case 'uni404stamp': return edgeSend(404, { [F.header]: stamp() }, '');                            // 68/68 404, her yanıtta katmanın KENDİ kimlik değeri
      case 'uni404reflect': return edgeSend(404, { [F.header]: s.rid }, '');                            // 68/68 404, her yanıtta isteğin kimliği YANSITILMIŞ
      case 'uni404drop': return k === 'GET /api/users' ? noResponse(req, s, 'drop') : edgeSend(404, {}, ''); // 67 × 404 + bir taşıma hatası
      case 'uni200': return edgeSend(200, {}, 'ok');                                                    // 68/68 200 (ret vektörleri REDDEDİLMEDİ)
      case 'pos404web': return (!deny && !apiish) ? edgeSend(404, {}, '') : healthy();                  // yalnız üç web pozitifi 404
      case 'pos404all': return !deny ? edgeSend(404, {}, '') : healthy();                               // dokuz pozitifin hepsi 404; ret vektörleri 403
      case 'uni404echo1': return k === ME ? apiSend(req, res, s, 404) : edgeSend(404, {}, '');          // 68/68 404 ama bir ret yanıtını API üretti
      case 'uni404one403': return k === 'GET /dashboard' ? edge403() : edgeSend(404, {}, '');           // 67 × 404 + bir ret vektörü 403 (tekdüze DEĞİL)
      // ── pozitif kontrol ──
      case 'pos200': return (!deny && req.method === 'GET' && np === '/api/portal/cases') ? apiSend(req, res, s, 200) : healthy();
      case 'pos302web': return k === 'GET /portal/login' ? edgeSend(302, { server: 'Caddy', location: REDIRECT_TARGET }, '') : healthy();
      case 'pos403web': return k === 'GET /portal/reset-password' ? edge403() : healthy();
      case 'pos403api': return k === 'POST /api/portal/messages' ? edge403() : healthy();
      case 'pos5xxweb': return k === 'GET /portal/login' ? edgeSend(502, { server: 'Caddy' }, '') : healthy();
      case 'pos5xxapi': return k === 'GET /api/portal/cases' ? edgeSend(502, { server: 'Caddy' }, '') : healthy();
      // ── bulgu + ölçülemeyen birlikte (öncelik) ──
      case 'mix2xxdrop': return k === 'GET /api/auth/capabilities' ? apiSend(req, res, s, 200) : (k === 'GET /api/users' ? noResponse(req, s, 'drop') : healthy());
      case 'mix401hang': return k === ME ? apiSend(req, res, s, 401) : (k === 'GET /api/users' ? noResponse(req, s, 'hang') : healthy());
      case 'mixpos200drop': return k === 'GET /api/portal/cases' ? apiSend(req, res, s, 200) : (k === 'GET /api/users' ? noResponse(req, s, 'drop') : healthy());
      case 'passall': {                                                                                 // kenar HER ŞEYİ geçirir (zemin gerçeği senaryosu)
        if (/^\/+api(\/|$)/i.test(p.split('?')[0]) || apiish) return apiSend(req, res, s, apiNatural(p));
        return /^\/portal\/(login|forgot-password|reset-password)$/.test(np) ? web200() : send(res, s, 404, { 'content-type': 'text/html', server: 'Caddy' }, '<!doctype html><title>404</title>', 'web');
      }
      default: return edgeSend(500, {}, '');
    }
  });
}

// ─── Kalem kaydı ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const results = [];
/** fn → { ok, obs } ya da { skip: true, obs }. İstisna = FAIL (sonda beklenen yapıyı üretmedi), ölçülemedi DEĞİL. */
function item(id, d, fn) {
  let r; try { r = fn(); } catch (e) { r = { ok: false, obs: 'KALEM DEĞERLENDİRİLEMEDİ: ' + String((e && e.message) || e).slice(0, 200) }; }
  results.push({ id, d, state: r.skip ? 'OLCULEMEDI' : (r.ok ? 'PASS' : 'FAIL'), obs: r.obs || '' });
}
function spawnP(exe, args, env) {
  return new Promise((res) => {
    let c; try { c = spawn(exe, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return res({ code: null, log: '', spawnError: String(e.code || e.message) }); }
    let l = ''; c.stdout.on('data', (x) => { l += x; }); c.stderr.on('data', (x) => { l += x; });
    c.on('error', (e) => res({ code: null, log: l, spawnError: String(e.code || e.message) })); c.on('close', (code) => res({ code, log: l }));
  });
}
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const readBytes = (f) => { try { return fs.readFileSync(f); } catch (e) { return null; } };
// Alan sırası HER yerde: HTTP / ret · kenar engelleme · katman doğrulaması · pozitif kontrol.
const FIELDS = ['httpReject', 'edgeBlocking', 'layerVerification', 'positiveControl']; const FIELD_VALUES = ['PASS', 'FAIL', 'OLCULEMEYEN'];
const ABBR = { P: 'PASS', F: 'FAIL', O: 'OLCULEMEYEN' };
const V = (S) => S.ev.nameVerdict; const rowsOf = (S, g) => S.ev.rows.filter((x) => x.group === g);
const vals = (S) => FIELDS.map((f) => V(S)[f].value);
/** Koşumun çıkış kodu ve dört alanı beklenenle aynı mı — `want` "P/O/O/P" biçimindedir (alan sırasıyla). */
const is = (S, code, want) => !!S.ev && S.code === code && S.ev.exitCode === code && vals(S).join('/') === want.split('/').map((a) => ABBR[a]).join('/');
/** Bir alandaki bir nedenin sayısı. */
const rc = (S, field, name) => V(S)[field].reasons.filter((r) => r.reason === name).reduce((a, r) => a + r.count, 0);
const reasonNames = (S, field) => V(S)[field].reasons.map((r) => `${r.reason}×${r.count}`).join(',') || '-';
/** Sonda satırı ↔ zemin gerçeği (aynı sıra; uzunluk tutmuyorsa istisna → FAIL). */
const J = (S) => { if (!S.ev || S.gt.length !== S.ev.rows.length) throw new Error(`satır ${S.ev ? S.ev.rows.length : 'yok'} ≠ kenarın gördüğü ${S.gt.length}`); return S.ev.rows.map((row, i) => ({ row, gt: S.gt[i] })); };
const layerVec = (S) => S.ev.rows.map((x) => x.layerId + '/' + x.layerWhy).join(',');
const brief = (S) => { if (!S.ev || !S.ev.nameVerdict || !S.ev.nameVerdict.httpReject) return `çıkış=${S.code} · kanıt beklenen yapıda değil`; const v = vals(S); return `çıkış=${S.code} · http=${v[0]} · kenar=${v[1]} [${reasonNames(S, 'edgeBlocking')}] · katman=${v[2]} · pozitif=${v[3]} · kalibrasyon=${S.ev.calibration ? S.ev.calibration.result : '?'}`; };
/** Zemin gerçeğinden BAĞIMSIZ türetilen kimlik anlamı: kenarın gördüğü kimlik (kaynak deseni kabul eder mi) × kenarın yazdığı yanıt değeri. */
const gtSignal = (s) => (s.status === 0 ? 'SONUC-YOK' : (s.echoed === 'none' ? 'YOK' : (s.echoed === 'same' ? (s.ridOk ? 'AYNEN-GERI-YAZMA' : 'YANSIMA') : ((!s.ridOk && s.respUuid) ? 'DEGISTIRME' : 'YABANCI-KIMLIK'))));
/** Çıkış kodu eşlemesi — bu dosyada BAĞIMSIZ yazılıdır. */
const exitOf = (v) => (v.includes('FAIL') ? 2 : ((v[1] === 'PASS' && v.every((x) => FIELD_VALUES.includes(x))) ? 0 : 3));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd8-selftest-')); const cert = path.join(dir, 'cert.pem'); const key = path.join(dir, 'key.pem');
  let srv = null; let shellVersions = 'ölçülmedi';
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
    srv = https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, edge);
    try { fs.unlinkSync(key); } catch (e) { /* özel anahtar bellekte; dosyası kanıt dizininde bırakılmaz */ }
    await new Promise((r, j) => { srv.once('error', j); srv.listen(PORT, '127.0.0.1', r); });
  } catch (e) { console.log('OLCULEMEDI: sahte kenar kurulamadı (' + String((e && (e.code || e.message)) || e).slice(0, 120) + ')'); process.exit(2); }
  const ORIGIN = `https://localhost:${PORT}`;
  const baseEnv = {}; for (const k of Object.keys(process.env)) if (!/^(NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|D8_HTTP_TIMEOUT_MS|D8_SELFTEST_PORT|D8_SELFTEST_PROBE)$/i.test(k)) baseEnv[k] = process.env[k];
  const env = Object.assign({}, baseEnv, { NODE_EXTRA_CA_CERTS: cert });
  const run = (args, e, probe) => spawnP(process.execPath, [probe || PROBE].concat(args), e || env);

  // ── Kapsam yetkisi kaydı düzeneği (SENTETİK kayıt ve kanıt dosyaları; öz-testin geçici dizininde) ──
  const scopeDir = path.join(dir, 'kapsam'); fs.mkdirSync(scopeDir);
  const today = new Date().toISOString().slice(0, 10); const P_T = 'SAGLAYICI-HESABI-KAYDI'; const D_T = 'DNS-ZINCIRI'; const T_T = 'TUNEL-KAYDI';
  const REFUSAL = 'KOŞULMADI — kapsam yetkisi doğrulanmadı'; // bu dosyada BAĞIMSIZ yazılıdır: sondanın iletisi ve belge §1b satırı bununla karşılaştırılır
  const mkEv = (name, content) => { const f = path.join(scopeDir, name); fs.writeFileSync(f, content); return { file: f, sha256: sha(fs.readFileSync(f)) }; };
  const evP = mkEv('saglayici-hesabi-kaydi.txt', 'SENTETIK (oz-test): yetkili saglayici hesabindaki bolge / ozel ad kaydi\n');
  const evD = mkEv('dns-zinciri.txt', 'SENTETIK (oz-test): DNS zinciri\n'); const evT = mkEv('tunel-kaydi.txt', 'SENTETIK (oz-test): tunel kaydi\n');
  const itm = (type, ev, o) => Object.assign({ type, file: ev.file, sha256: ev.sha256, date: today }, o || {});
  let recSeq = 0; const mkRec = (o) => { const f = path.join(scopeDir, `kayit-${++recSeq}.json`); fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o)); return f; };
  const fullRec = (alias, o) => Object.assign({ record: 'EXTACC-D8-SCOPE-AUTHORIZATION', nameAlias: alias, originHost: 'localhost', items: [itm(P_T, evP), itm(D_T, evD)] }, o || {});
  const recFor = {}; const scopeArgs = (alias) => (alias === 'AD-1' ? [] : ['--scope-record', recFor[alias] || (recFor[alias] = mkRec(fullRec(alias)))]);

  const ALL = []; // değişmez kalemlerinin (GT-1, X-1) taradığı koşumlar: paket sondasının sahte kenara karşı bütün koşumları
  /** Bir senaryo koşumu: sahte ucu kipe alır, sondayı koşturur, ham kanıtı + adsız özeti + zemin gerçeğini döndürür (hiç atmaz).
   *  AD-1 dışındaki ad kimliği için tam bir (sentetik) kapsam yetkisi kaydı verilir. `limit`: sondanın ölçemediği sınırın kaydı. */
  async function scenario(m, o) {
    o = o || {}; mode = m; seen = []; const tag = o.tag || m; const out = path.join(dir, tag + '.json'); const alias = o.alias || 'AD-1';
    const args = ['--alias', alias, '--vantage', o.vantage || 'oz-test-yerel', '--origin', ORIGIN, '--out', out].concat(scopeArgs(alias));
    const r = await run(args, o.env, o.probe); const gt = seen; seen = [];
    const sumPath = out.replace(/\.json$/, '.ozet.json'); const sumBytes = readBytes(sumPath);
    let sum = null; try { sum = sumBytes ? JSON.parse(sumBytes.toString('utf8')) : null; } catch (e) { sum = null; }
    const S = { mode: m, tag, limit: o.limit || null, probe: o.probe || PROBE, code: r.code, log: r.log, out, ev: readJson(out), evBytes: readBytes(out), sumPath, sumBytes, sum, gt };
    if (!o.noInv) ALL.push(S);
    return S;
  }
  let gateSeq = 0;
  /** Kapı denemesi: verilen argümanlarla koşar; kenarın gördüğü istek sayısını da döndürür. */
  async function gate(args, e) { mode = 'ok'; seen = []; const r = await run(args, e); const n = seen.length; seen = []; return { code: r.code, log: r.log, seen: n }; }
  const gateOut = () => path.join(dir, `gate-${++gateSeq}.json`);

  const src = fs.readFileSync(PROBE, 'utf8');
  const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\n}', i); return j < 0 ? '' : src.slice(i, j + 2); };
  /** Vektör listesi sondanın KAYNAK METNİNDEN (sondayı çalıştırmadan) okunur. */
  function parseVectors(text) {
    const d0 = text.indexOf('const DENY = ['); const a0 = text.indexOf('const ALLOW = [');
    const denyBlock = text.slice(d0, text.indexOf('];', d0)); const allowBlock = text.slice(a0, text.indexOf('];', a0));
    const deny = []; const allow = []; let m;
    const rxD = /^\s*\['[^']*',\s*'(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)',\s*'([^']*)'/gm; while ((m = rxD.exec(denyBlock))) deny.push({ group: 'deny', method: m[1], url: m[2], expect: [403] });
    const rxA = /^\s*\['[^']*',\s*'(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)',\s*'([^']*)',\s*\[([0-9,\s]+)\]\]/gm; while ((m = rxA.exec(allowBlock))) allow.push({ group: 'allow', method: m[1], url: m[2], expect: m[3].split(',').map((x) => Number(x.trim())) });
    return { deny, allow, all: deny.concat(allow), denyBlock, allowBlock };
  }
  const vectorSetIdOf = (vec) => sha(Buffer.from(vec.all.map((v) => `${v.group} ${v.method} ${v.url} ${v.expect.join(',')}`).join('\n'), 'utf8'));
  const VEC = parseVectors(src);
  // D8-E2 — izole provadan taşınan 18 kodlama/normalizasyon ham yolu (edge-allowlist-probe.js EVASION ile birebir).
  const evasionPaths = [
    '/api/portal/%61dmin/documents/pending', '/api/portal/%61dmin/create-user', '/api/portal/admin%2Fdocuments%2Fpending',
    '/api/portal/documents/x%2F..%2Fadmin%2Fdocuments%2Fpending', '/api/portal/cases/../admin/documents/pending',
    '/api/portal/documents/..%2Fadmin/documents/pending', '//api/portal/admin/documents/pending',
    '/api/portal/./admin/documents/pending', '/API/portal/cases', '/api/portal/ADMIN/documents/pending',
    '/api/portal/cases/', '/api/portal/cases;x=1', '/intake/abc/../../auth/login', '/_next/../auth/login',
    '/_next/%2e%2e/auth/login', '/api/portal/cases%00/admin', '/api/portal/documents/%252e%252e/admin',
    '/api/portal/admin%c0%afdocuments/pending',
  ];
  try {
    item('K-SRC', 'ürün kaynağı okundu (kimlik protokolünün dayanağı): başlık adı x-request-id · SAFE_REQUEST_ID biçimi · gelen değer kabul biçimindeyse AYNEN yanıta yazılır, değilse atılıp randomUUID() ile yenisi üretilir · ara katman forRoutes(\'*\') · genel önek "api" · enableCors — VE sondanın iki deseni kaynakla aynı: kabul deseninin METNİ kaynaktakiyle birebir; "üretilen kimlik" deseni randomUUID() çıktılarını (200 örnek) tanır; sondanın iki gönderim biçimi kaynak deseniyle ölçüldüğünde biri kabul edilir, diğeri edilmez — biri değişirse sondanın kuralı yeniden türetilmelidir', () => {
      const acc = (/^const RID_ACCEPTED_RX = \/(.+)\/;$/m.exec(src) || [])[1]; const gen = (/^const RID_GENERATED_RX = \/(.+)\/;$/m.exec(src) || [])[1]; const genRx = gen ? new RegExp(gen) : /$^/;
      const uu = Array.from({ length: 200 }, () => crypto.randomUUID());
      const ok = F.header === 'x-request-id' && F.prefix === 'api' && F.wildcard && F.cors && F.writesBackOrReplaces && F.safe.test('d8r' + 'a'.repeat(32)) && !F.safe.test('d8r~' + 'a'.repeat(32)) && !F.safe.test('-x') && !F.safe.test('a b') && !F.safe.test('a'.repeat(129))
        && acc === F.safeSrc && uu.every((u) => genRx.test(u) && UUID4.test(u)) && !genRx.test('d8r' + 'a'.repeat(32)) && !genRx.test('kenar-0001') && !genRx.test(uu[0].toUpperCase());
      return { ok, obs: `başlık=${F.header} · biçim=/${F.safeSrc}/ · sondadaki kabul deseni kaynakla aynı=${acc === F.safeSrc} · aynen-ya-da-yeni satırları=${F.writesBackOrReplaces} · üretilen kimlik deseni 200/200=${uu.every((u) => genRx.test(u))} · forRoutes('*')=${F.wildcard} · önek=${F.prefix} · enableCors=${F.cors}` };
    });

    // K-PORT — port kapısı: bu dosya yasak portla başlatılır; kapı, sertifika / dinleme / sonda koşumundan ÖNCE durur.
    const portRuns = []; const portChild = (p) => spawnP(process.execPath, [__filename], Object.assign({}, baseEnv, { D8_SELFTEST_PORT: String(p), D8_SELFTEST_GATE_ONLY: '1' }));
    for (const p of FORBIDDEN_PORTS.concat(['80', 'abc'])) { const r = await portChild(p); portRuns.push({ p, code: r.code, rej: /REDDEDİLDİ/.test(r.log), passed: /KAPI GEÇİLDİ/.test(r.log) }); }
    const portOk = await portChild(PORT); // karşı girdi: izinli port kapıdan geçer (alt süreç yalnız kapıyı ölçer; dinlemez)
    item('K-PORT', 'öz-test port kapısı: D8_SELFTEST_PORT canlı / veritabanı / ayrılmış port (8080, 3002, 5432, 5447, 5448, 5449, 5591, 18095) ya da geçersiz (80, abc) ise çıkış 4 ve kapı geçilmez; izinli port (bu koşumun portu) kapıdan geçer; bu koşum verilen portta dinliyor',
      () => ({ ok: FORBIDDEN_PORTS.length === 8 && portRuns.length === 10 && portRuns.every((x) => x.code === 4 && x.rej && !x.passed) && portOk.code === 0 && /KAPI GEÇİLDİ/.test(portOk.log) && srv.address().port === PORT, obs: portRuns.map((x) => `${x.p}→${x.code}`).join(' · ') + ` · ${PORT}→${portOk.code} (geçti) · dinlenen=${srv.address().port}` }));

    // ── Sağlıklı kenar ──
    const S1 = await scenario('ok', { tag: 's1' });
    item('S1', 'sağlıklı kenar (Server: Caddy, boş 403): çıkış 0; bütün ret vektörleri 403 + kimlik başlığı yok; pozitifler beklendiği gibi; ÜÇ AYRI ALAN + pozitif kontrol: HTTP / ret PASS · kenar engelleme PASS · katman doğrulaması OLCULEMEYEN (PASS DEĞİL — doğrulanamayan satırlar var; kapsam sayısı: "API değil" gösterilen + ölçülemeyen = ret satırı) · pozitif kontrol PASS; alan kümesi tam dört; birleşik PASS alanı ya da satırı yok; kenar engelleme PASS kaydında kapsam eki (istek profili · konum · vektör kümesi) ve varsayımlar — ham kanıtta ve adsız özette aynı; ipucu caddy yalnız ipucu alanında; kanıtta yanıt başlığı DEĞERİ yok', () => {
      const d = rowsOf(S1, 'deny'); const a = rowsOf(S1, 'allow'); const v = V(S1); const cov = v.layerVerification.coverage; const sc = v.edgeBlocking.scope;
      const ok = is(S1, 0, 'P/P/O/P') && d.length === VEC.deny.length && a.length === VEC.allow.length && d.length > 0 && a.length > 0
        && d.every((x) => x.status === 403 && x.statusExpected === true && x.outcome === 'RET-403' && x.idObs === 'YOK' && x.idSignal === 'YOK' && x.layerId !== 'UYGULAMA-API' && x.layerHint === 'caddy' && x.hints && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'Caddy' && x.hints.providerSignature === false)
        && a.every((x) => x.statusExpected === true) && Object.keys(v).sort().join() === FIELDS.slice().sort().join() && FIELDS.every((f) => FIELD_VALUES.includes(v[f].value))
        && v.httpReject.reasons.length === 0 && v.edgeBlocking.reasons.length === 0 && v.positiveControl.reasons.length === 0
        && v.layerVerification.reasons.length === 1 && v.layerVerification.reasons[0].reason === 'KATMANI-DOGRULANAMAYAN-RET-SATIRI' && v.layerVerification.reasons[0].value === 'OLCULEMEYEN' && v.layerVerification.reasons[0].count === cov.unverifiable
        && cov.denyRows === d.length && cov.shownNotApi === d.filter((x) => x.layerId === 'API-DEGIL-CIKARIM').length && cov.shownNotApi > 0 && cov.provenApi === 0 && cov.unverifiable > 0 && cov.shownNotApi + cov.unverifiable === d.length
        && /istek profili/.test(sc) && /konum/.test(sc) && /vektör kümesi/.test(sc) && /VARSAYIMLAR/.test(sc) && /kimlik başlığı zincirde düşürülmüyor/.test(sc) && /katman doğrulamasındadır/.test(sc) && S1.sum.nameVerdict.edgeBlocking.scope === sc
        && /^D8-HTTP-RET=PASS$/m.test(S1.log) && /^D8-KENAR-ENGELLEME=PASS$/m.test(S1.log) && /^D8-KATMAN-DOGRULAMA=OLCULEMEYEN$/m.test(S1.log) && /^D8-POZITIF-KONTROL=PASS$/m.test(S1.log) && /^D8-KAPSAM-YETKISI=KAPI-YOK-BIRINCIL-AD$/m.test(S1.log) && /^D8-CIKIS=0$/m.test(S1.log)
        && !/D-?8\s+PASS/i.test(S1.log) && !['pass', 'ok', 'verdict', 'layer', 'result', 'value'].some((k) => k in S1.ev) && !('value' in v) && S1.ev.rows.every((x) => !('ok' in x) && !('layer' in x) && !('echo' in x))
        && (S1.ev.hintsOnly.denyLayerHints || {}).caddy === d.length && !/"cf-ray"|test"/.test(JSON.stringify(S1.ev.rows.map((x) => x.hints)));
      return { ok, obs: brief(S1) + ` · ret 403=${d.filter((x) => x.status === 403).length}/${d.length} · katman kapsamı=${JSON.stringify(cov)} · ipucu=${JSON.stringify(S1.ev.hintsOnly.denyLayerHints)}` };
    });
    item('K-1', 'kalibrasyon (sağlıklı kenar) — API pozitiflerinde İKİ davranış da görülür: GECERLI-BICIM gönderilen 3 API pozitifinde kimlik AYNEN döndü (aynen geri yazma 3/3), GECERSIZ-BICIM gönderilen 3 API pozitifinde API değeri atıp YENİ kimlik üretti (değiştirme 3/3; zemin gerçeği: sahte API\'nin yazdığı değer); 3 web pozitifinde ve başlıksız bölgenin tamamında başlık yok → kalibrasyon VAR, API kanıtı kullanılabilir; "değiştirme" görülen API pozitifi UYGULAMA-API, "aynen geri yazma" görülen API pozitifi OLCULEMEYEN (yansıtan katman da aynısını üretir — tek başına API kanıtı değil)', () => {
      const c = S1.ev.calibration; const j = J(S1).filter((p) => p.row.group === 'allow'); const api = j.filter((p) => p.gt.producer === 'api'); const web = j.filter((p) => p.gt.producer === 'web');
      const g = api.filter((p) => p.gt.ridOk); const x = api.filter((p) => !p.gt.ridOk); const zone = S1.ev.rows.filter((r) => r.pathClass === 'ONEK-DISI' || r.method === 'OPTIONS').length;
      const ok = c.result === 'VAR' && c.apiEvidenceUsable === true && api.length === 6 && web.length === 3 && g.length === 3 && x.length === 3 && c.apiPositives === 6 && c.apiWriteBackOf === 3 && c.apiWriteBack === 3 && c.apiReplaceOf === 3 && c.apiReplace === 3
        && c.webPositives === 3 && c.webMeasured === 3 && c.zoneRows === zone && zone === 18 && c.zoneMeasured === zone && c.zoneHeaderRows === 0 && c.reflectionRows === 0 && c.foreignIdRows === 0
        && g.every((p) => p.gt.apiWrote === 'AYNEN' && p.gt.echoed === 'same' && p.row.idObs === 'AYNEN' && p.row.idSignal === 'AYNEN-GERI-YAZMA' && p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'AYIRT-ETMEYEN-GOZLEM')
        && x.every((p) => p.gt.apiWrote === 'YENI' && p.gt.echoed === 'other' && p.gt.respUuid === true && p.row.idObs === 'YENI-KIMLIK' && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API' && p.row.layerWhy === 'DEGISTIRME-KANITI')
        && web.every((p) => p.gt.echoed === 'none' && p.row.idObs === 'YOK' && p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'WEB-YOLU')
        && S1.sum.idSignalCounts.allow['AYNEN-GERI-YAZMA'] === 3 && S1.sum.idSignalCounts.allow.DEGISTIRME === 3 && S1.sum.idSignalCounts.deny.YOK === rowsOf(S1, 'deny').length;
      return { ok, obs: `aynen geri yazma ${c.apiWriteBack}/${c.apiWriteBackOf} · değiştirme ${c.apiReplace}/${c.apiReplaceOf} · web ölçülen ${c.webMeasured}/${c.webPositives} · başlıksız bölge ${c.zoneMeasured}/${c.zoneRows}, başlıklı ${c.zoneHeaderRows} · yansıma ${c.reflectionRows} · yabancı kimlik ${c.foreignIdRows} → ${c.result} (API kanıtı kullanılabilir=${c.apiEvidenceUsable})` };
    });
    item('L-1', '"API değil" çıkarımı YALNIZ uygun yollarda (sağlıklı kenar, hepsi başlıksız 403): düz /api yolu (GET/POST/HEAD, sorgulu, sondaki eğik çizgili) → API-DEGIL-CIKARIM; ön uçuş (OPTIONS /api) → OLCULEMEYEN (ON-UCUS: ara katmandan önce biter); çift eğik çizgi, çözülemeyen yüzde dizisi, nokta segmenti, noktalı virgül, büyük harfli önek, yüzde kodlu segment, traversal → OLCULEMEYEN (YOL-BELIRSIZ); web yolları ve OPTIONS / → OLCULEMEYEN (WEB-YOLU); çıkarım yapılan HER satırda model ham ve temizlenmiş yolda "ara katman çalışırdı" der; kapsam: 59 ret satırının 30\'unda çıkarım, 29\'unda ölçülemez (13 web yolu · 2 ön uçuş · 14 yolu belirsiz)', () => {
      const d = rowsOf(S1, 'deny'); const inf = d.filter((x) => x.layerId === 'API-DEGIL-CIKARIM'); const cov = V(S1).layerVerification.coverage;
      const sound = inf.every((x) => x.pathClass === 'API-KESIN' && x.layerWhy === 'BASLIK-YOK-KALIBRASYON-VAR' && apiMw(x.method, x.path) === 'CALISIR' && apiMw(x.method, cleanPath(x.path)) === 'CALISIR');
      const A = 'API-DEGIL-CIKARIM/BASLIK-YOK-KALIBRASYON-VAR'; const O = 'OLCULEMEYEN/';
      const ex = [['GET', '/api/auth/me', A], ['POST', '/api/auth/login', A], ['HEAD', '/api/auth/me', A], ['GET', '/api/portal/admin/documents/pending?x=1', A], ['GET', '/api/portal/cases/', A],
        ['OPTIONS', '/api/auth/me', O + 'ON-UCUS'], ['GET', '//api/portal/admin/documents/pending', O + 'YOL-BELIRSIZ'], ['GET', '/api/portal/admin%c0%afdocuments/pending', O + 'YOL-BELIRSIZ'],
        ['GET', '/api/portal/./admin/documents/pending', O + 'YOL-BELIRSIZ'], ['GET', '/api/portal/cases;x=1', O + 'YOL-BELIRSIZ'], ['GET', '/API/portal/cases', O + 'YOL-BELIRSIZ'], ['GET', '/api/portal/%61dmin/documents/pending', O + 'YOL-BELIRSIZ'], ['GET', '/api/portal/cases/../admin/documents/pending', O + 'YOL-BELIRSIZ'],
        ['OPTIONS', '/', O + 'WEB-YOLU'], ['GET', '/', O + 'WEB-YOLU'], ['GET', '/robots.txt', O + 'WEB-YOLU'], ['GET', '/_next/../auth/login', O + 'WEB-YOLU']];
      const got = ex.map(([m, p, l]) => { const x = d.find((y) => y.method === m && y.path === p); return { m, p, l, g: x ? x.layerId + '/' + x.layerWhy : 'SATIR-YOK' }; });
      const model = apiMw('OPTIONS', '/api/auth/me') === 'CORS' && apiMw('GET', '//api/portal/admin/documents/pending') === 'ESLESMEZ' && apiMw('GET', '/api/portal/admin%c0%afdocuments/pending') === 'COZME-HATASI' && apiMw('GET', '/api/auth/me') === 'CALISIR';
      const by = cov.unverifiableByReason || {};
      return { ok: inf.length === 30 && sound && model && got.every((x) => x.g === x.l) && d.length === 59 && cov.shownNotApi === 30 && cov.unverifiable === 29 && by['WEB-YOLU'] === 13 && by['ON-UCUS'] === 2 && by['YOL-BELIRSIZ'] === 14 && Object.keys(by).length === 3,
        obs: `çıkarım satırı=${inf.length} (model uyumlu=${sound}) · ölçülemeyen=${JSON.stringify(by)} · örnek=${got.filter((x) => x.g === x.l).length}/${got.length}${got.filter((x) => x.g !== x.l).map((x) => ` [${x.m} ${x.p}: ${x.g}≠${x.l}]`).join('')}` };
    });
    item('S1-p', `HAM YOL korunur: kaynak vektör == kanıt satırı == kenarın gördüğü req.url (yöntem dahil, aynı sıra); './', '%2F', '?x=1', büyük harf, %00, çift kodlama, çift slash, unicode slash birebir`, () => {
      const rowPaths = S1.ev.rows.map((x) => ({ method: x.method, url: x.path })); const same = (a, b) => a.length === b.length && a.every((x, i) => x.method === b[i].method && x.url === b[i].url);
      const raw = ['/api/portal/./admin/documents/pending', '/api/portal%2Fadmin/documents/pending', '/api/portal/admin/documents/pending?x=1', '/api/portal/ADMIN/documents/pending', '/api/portal/cases%00/admin', '/api/portal/documents/%252e%252e/admin', '//api/portal/admin/documents/pending', '/api/portal/admin%c0%afdocuments/pending'];
      return { ok: VEC.all.length === S1.ev.deny + S1.ev.allow && VEC.all.length > 0 && same(VEC.all, rowPaths) && same(rowPaths, S1.gt) && raw.every((p) => S1.gt.some((s) => s.url === p)), obs: `kenar gördü=${S1.gt.length} · kaynak=${VEC.all.length} · kanıt satırı=${rowPaths.length} · ham örnek=${raw.filter((p) => S1.gt.some((s) => s.url === p)).length}/${raw.length}` };
    });
    item('S1-c', 'KİMLİK/GÖVDE ölçümü: kenar hiçbir istekte kimlik başlığı görmedi; gövde 0 (GET/DELETE/HEAD/OPTIONS) veya 2 (POST/PUT/PATCH "{}"); kanıt measured {credentialHeaderRequests=0, nonEmptyBodyRequests=0, requestCount=deny+allow, bodies.emptyJson=POST+PUT+PATCH sayısı, bodies.empty=GET+DELETE+HEAD+OPTIONS sayısı}; design beyanı AYRI alanda; her satırda sent.headerNames/body; gönderilen başlık adları arasında yalnız istek kimliği var (kimlik bilgisi başlığı yok)', () => {
      const g = S1.gt; const credSeen = g.filter((s) => s.cred).length; const badBody = g.filter((s) => !((s.bodyLen === 0 && /^(GET|DELETE|HEAD|OPTIONS)$/.test(s.method)) || (s.bodyLen === 2 && /^(POST|PUT|PATCH)$/.test(s.method)))).length;
      const M = S1.ev.measured; const nWrite = g.filter((s) => /^(POST|PUT|PATCH)$/.test(s.method)).length; const nNoBody = g.filter((s) => /^(GET|DELETE|HEAD|OPTIONS)$/.test(s.method)).length; const e = S1.ev;
      const names = ['host', 'user-agent', 'content-type', 'accept', F.header].sort().join();
      const ok = credSeen === 0 && badBody === 0 && g.length === e.deny + e.allow && M.credentialHeaderRequests === 0 && M.nonEmptyBodyRequests === 0 && M.requestCount === e.deny + e.allow && !M.bodies.other && M.bodies.emptyJson === nWrite && M.bodies.empty === nNoBody && (M.bodies.empty + M.bodies.emptyJson) === M.requestCount
        && e.design && e.design.credentialsSent === false && e.design.writesAttempted === false && e.credentialsSent === undefined && e.rows.every((x) => x.sent && Array.isArray(x.sent.headerNames) && x.sent.headerNames.slice().sort().join() === names && (x.sent.body === '' || x.sent.body === '{}'))
        && e.requestProfile.headerNames.slice().sort().join() === names && S1.sum.requestProfile.headerNames.slice().sort().join() === names && S1.sum.requestProfile.credentialHeaderRequests === 0 && S1.sum.requestProfile.nonEmptyBodyRequests === 0;
      return { ok, obs: `kenar: kimlik=${credSeen} · gövde-uyumsuz=${badBody} · POST/PUT/PATCH=${nWrite} · GET/DELETE/HEAD/OPTIONS=${nNoBody} · sonda measured=${JSON.stringify(M)} · başlık adları=${e.requestProfile.headerNames.join(',')}` };
    });
    const S1b = await scenario('ok', { tag: 's1b', alias: 'AD-27' });
    item('Y-1', 'istek kimliği PLANI — hangi istekte hangi biçim (kenarın gördüğü değerler ÜRÜN KAYNAĞINDAKİ desenle ölçülür): 68 isteğin hepsinde başlık var; 59 ret vektörünün HEPSİNDE gönderilen kimlik kaynak deseniyle KABUL EDİLMEZ (GECERSIZ-BICIM); 6 API pozitifi sırayla kabul edilir / edilmez / … (3 + 3); 3 web pozitifi sırayla kabul edilir / edilmez / edilir (2 + 1); kanıttaki sent.requestIdForm kenarın gördüğü değerin kaynak deseniyle sınıfına eşit; hiçbir gönderilen değer API\'nin ürettiği biçimde değil; koşum içinde ve iki koşum arasında tekrar yok (tek kullanımlık); gönderilen değerler adsız özete girmez', () => {
      const g = S1.gt; const ids = g.map((s) => s.rid); const ids2 = S1b.gt.map((s) => s.rid); const j = J(S1);
      const deny = j.filter((p) => p.row.group === 'deny'); const api = j.filter((p) => p.row.vectorClass === 'POZITIF-API'); const web = j.filter((p) => p.row.vectorClass === 'POZITIF-WEB');
      const alt = (list) => list.every((p, i) => p.gt.ridOk === (i % 2 === 0)); const rf = S1.sum.requestProfile.requestIdForms || {};
      const ok = g.length === VEC.all.length && g.every((s) => s.hasRid) && deny.length === 59 && deny.every((p) => p.gt.ridOk === false) && api.length === 6 && alt(api) && web.length === 3 && alt(web)
        && j.every((p) => p.row.sent.requestId === p.gt.rid && p.row.sent.requestIdForm === (p.gt.ridOk ? 'GECERLI-BICIM' : 'GECERSIZ-BICIM')) && ids.every((id) => !UUID4.test(id))
        && new Set(ids).size === ids.length && ids2.length === ids.length && ids.every((id) => !ids2.includes(id)) && S1.sum.requestProfile.distinctRequestIds === new Set(ids).size && S1.sum.requestProfile.requestCount === g.length
        && JSON.stringify(rf.deny) === JSON.stringify({ 'GECERLI-BICIM': 0, 'GECERSIZ-BICIM': 59 }) && JSON.stringify(rf.allowApi) === JSON.stringify({ 'GECERLI-BICIM': 3, 'GECERSIZ-BICIM': 3 }) && JSON.stringify(rf.allowWeb) === JSON.stringify({ 'GECERLI-BICIM': 2, 'GECERSIZ-BICIM': 1 })
        && !ids.some((id) => S1.sumBytes.toString('utf8').includes(id));
      return { ok, obs: `başlıklı=${g.filter((s) => s.hasRid).length}/${g.length} · ret: kaynak deseni kabul ETMEZ=${deny.filter((p) => !p.gt.ridOk).length}/${deny.length} · API pozitifi kabul eder=${api.filter((p) => p.gt.ridOk).length}/${api.length} · web pozitifi kabul eder=${web.filter((p) => p.gt.ridOk).length}/${web.length} · tekil=${new Set(ids).size} · ikinci koşumla ortak=${ids.filter((id) => ids2.includes(id)).length}` };
    });
    // Y-2 — plan kapısı: GECERSIZ-BICIM üretimi bozulmuş sonda KOPYASI (yalnız üretim ifadesi değişti; `~` düştü → iki biçim de kabul desenine uyar).
    const y2probe = path.join(dir, 'd8-staff-surface-probe.plan.js'); const y2src = src.replace("'d8r~' + hex", () => "'d8r' + hex"); fs.writeFileSync(y2probe, y2src);
    mode = 'ok'; seen = []; const y2 = await run(['--alias', 'AD-1', '--vantage', 'oz-test-yerel', '--origin', ORIGIN, '--out', path.join(dir, 'y2.json')], env, y2probe); const y2seen = seen.length; seen = [];
    item('Y-2', 'istek kimliği PLAN KAPISI: "geçersiz biçim" üretimi bozulmuş bir sonda kopyasında (iki biçim de kaynak desenince kabul edilir → API iki değeri de aynen geri yazar; yansıtan katmanla API ayırt edilemez, kanıt kuralı anlamsızlaşır) sonda istek ATMADAN durur → çıkış 4, kenara istek yok, kanıt / özet yazılmaz; asıl sondada kapı geçilir (S1)', () => ({
      ok: y2src !== src && y2.code === 4 && y2seen === 0 && /REDDEDİLDİ: istek kimliği planı tutarsız/.test(y2.log) && !fs.existsSync(path.join(dir, 'y2.json')) && !fs.existsSync(path.join(dir, 'y2.ozet.json')) && S1.code === 0, obs: `kopya değişti=${y2src !== src} · çıkış=${y2.code} · istek=${y2seen} · S1 çıkış=${S1.code}` }));
    item('S7', 'D8-E1/E2 kapsamı: deny kümesinde 3 HEAD + 3 OPTIONS (üç yüzey: sayfa /, personel API /api/auth/me, admin /api/portal/admin/documents/pending) ve 18 kodlama/normalizasyon varyantı; hepsi sağlıklı kenarda 403; HEAD/OPTIONS gövdesiz; adsız özette yöntem kapsamı sayıları (beş yöntem · HEAD n/3 · OPTIONS n/3 · varyant n/18) satırlarla uyumlu', () => {
      const d = rowsOf(S1, 'deny'); const headRows = d.filter((x) => x.method === 'HEAD'); const optRows = d.filter((x) => x.method === 'OPTIONS');
      const evRows = evasionPaths.map((p) => d.find((x) => x.path === p)); const evAll403 = evRows.every((x) => x && x.status === 403 && x.statusExpected === true && x.vectorClass === 'VARYANT');
      const hoAll403 = headRows.concat(optRows).every((x) => x.status === 403 && x.statusExpected === true); const hoNoBody = S1.gt.filter((s) => /^(HEAD|OPTIONS)$/.test(s.method)).every((s) => s.bodyLen === 0);
      const hoSurfaces = ['/', '/api/auth/me', '/api/portal/admin/documents/pending'].every((p) => headRows.some((x) => x.path === p) && optRows.some((x) => x.path === p));
      const c = S1.sum.coverage; const five = d.length - 3 - 3 - 18;
      const covOk = c.HEAD.of === 3 && c.HEAD.measured === 3 && c.HEAD.rejected403 === 3 && c.OPTIONS.of === 3 && c.OPTIONS.measured === 3 && c.OPTIONS.rejected403 === 3 && c.VARYANT.of === 18 && c.VARYANT.measured === 18 && c.VARYANT.rejected403 === 18 && c['BES-YONTEM'].of === five && c['BES-YONTEM'].rejected403 === five && five > 0 && JSON.stringify(c) === JSON.stringify(S1.ev.coverage);
      return { ok: headRows.length === 3 && optRows.length === 3 && hoSurfaces && hoAll403 && hoNoBody && evRows.filter(Boolean).length === 18 && evAll403 && covOk, obs: `HEAD=${headRows.length} · OPTIONS=${optRows.length} · varyant=${evRows.filter(Boolean).length}/18 · hepsi 403=${hoAll403 && evAll403} · HEAD/OPTIONS gövdesiz=${hoNoBody} · özet kapsamı=${JSON.stringify(c)}` };
    });

    // ── Bozuk kenar (ikinci ad: AD-2 — tam kapsam yetkisi kaydıyla) ──
    const s1Before = { ev: S1.evBytes ? sha(S1.evBytes) : null, sum: S1.sumBytes ? sha(S1.sumBytes) : null };
    const S2 = await scenario('broken', { tag: 's2', alias: 'AD-2' });
    item('S2', 'bozuk kenar TEMİZLENMİŞ yola göre sızdırır, HAM yolu API\'ye iletir (AD-2): çıkış 2; HTTP / ret FAIL (20 ret vektörü 403 dışı yanıt aldı) · kenar engelleme FAIL · katman doğrulaması FAIL · pozitif kontrol PASS; sızan istek = /api/auth/me (GET+HEAD+OPTIONS=3) + admin\'e normalize olan 17 = 20; API\'nin işlediği 17 yanıtta gönderilen GECERSIZ-BICIM kimlik atılıp YENİSİ üretilmiş → DEGISTIRME → UYGULAMA-API; OPTIONS 204 reddedilmedi = kenar engelleme FAIL nedeni; çift eğik çizgili istek API\'de önek dışına düşer → başlıksız 404 → API kanıtı YOK (durum kodu ölçütünde yine FAIL); başka yere normalize olanlar 403 kalır; ifPassed bulgu satırlarında dolu', () => {
      const j = J(S2).filter((p) => p.row.group === 'deny'); const leaked = j.filter((p) => p.gt.producer === 'api');
      const expectLeak = VEC.deny.filter((v) => { const np = cleanPath(v.url); return np === '/api/auth/me' || ADMIN_RX.test(np); }).length;
      const me = leaked.filter((p) => cleanPath(p.row.path) === '/api/auth/me').length; const two = (p) => p.gt.status >= 200 && p.gt.status < 300;
      const n2xx = leaked.filter(two).length; const nProven = leaked.filter((p) => !two(p) && p.gt.apiWrote === 'YENI' && p.gt.echoed === 'other').length; const nNoHeader = leaked.filter((p) => !two(p) && p.gt.echoed === 'none').length;
      const leakedAdminForms = ['/api/portal/%61dmin/documents/pending', '/api/portal/%61dmin/create-user', '/api/portal/admin%2Fdocuments%2Fpending', '//api/portal/admin/documents/pending', '/api/portal/cases/../admin/documents/pending', '/api/portal/documents/..%2Fadmin/documents/pending', '/api/portal/documents/%252e%252e/admin', '/api/portal/./admin/documents/pending'];
      const still403Forms = ['/api/portal/ADMIN/documents/pending', '/api/portal/cases%00/admin', '/api/portal/admin%c0%afdocuments/pending', '/API/portal/cases', '/api/portal/cases/', '/api/portal/cases;x=1', '/_next/../auth/login', '/_next/%2e%2e/auth/login', '/intake/abc/../../auth/login'];
      const leakedOk = leakedAdminForms.every((p) => leaked.some((q) => q.row.path === p && q.row.status !== 403)); const still403Ok = still403Forms.every((p) => { const x = j.find((q) => q.row.path === p); return x && x.row.status === 403 && x.gt.producer === 'edge'; });
      const dbl = leaked.find((p) => p.row.path === '//api/portal/admin/documents/pending');
      const ok = is(S2, 2, 'F/F/F/P') && leaked.length === 20 && expectLeak === 20 && me === 3 && leakedOk && still403Ok
        && leaked.every((p) => p.row.status === p.gt.status && p.row.status !== 403 && p.row.statusExpected === false && typeof p.row.ifPassed === 'string' && p.row.ifPassed.length > 10)
        && leaked.filter((p) => p.gt.echoed === 'other').every((p) => p.gt.ridOk === false && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API') && leaked.filter((p) => p.gt.echoed === 'none').every((p) => p.row.idObs === 'YOK' && p.row.layerId === 'OLCULEMEYEN')
        && n2xx === 2 && nNoHeader === 1 && nProven === 17 && rc(S2, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === 20 && rc(S2, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === nProven && rc(S2, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === n2xx
        && rc(S2, 'layerVerification', 'RET-SATIRINI-API-YANITLADI-KANITLI') === nProven && V(S2).layerVerification.coverage.provenApi === nProven
        && dbl && dbl.gt.apiMw === 'ESLESMEZ' && dbl.row.status === 404 && S2.ev.findings.length === 20 && S2.ev.nameAlias === 'AD-2' && S2.sum.nameAlias === 'AD-2' && S2.ev.scopeAuthorization.status === 'DOGRULANDI';
      return { ok, obs: brief(S2) + ` · sızan=${leaked.length} (beklenen ${expectLeak}) · me=${me} · 2xx=${n2xx} · API kanıtlı=${nProven} · başlıksız 403 dışı=${nNoHeader} · admin'e sızan varyant=${leakedAdminForms.filter((p) => leaked.some((q) => q.row.path === p)).length}/${leakedAdminForms.length} · 403 kalan=${still403Forms.filter((p) => { const x = j.find((q) => q.row.path === p); return x && x.row.status === 403; }).length}/${still403Forms.length}` };
    });
    item('N-5', 'BİR SÜREÇ = BİR AD = BİR KANIT: AD-2 koşumu (bozuk kenar) AD-1\'in ham kanıtını ve özetini DEĞİŞTİRMEDİ (bayt özeti aynı); iki adın alanları ayrı dosyalarda ayrı (AD-1 kenar engelleme PASS · AD-2 FAIL); sonda kaynağında dosya okuma yalnız üç yerde: kendi kaynağı (SHA-256) ve — yalnız kapsam yetkisi işlevinde — kayıt ile kaydın gösterdiği kanıt dosyası; dizin tarama / başka dosya okuma yok', () => {
      const after = { ev: sha(fs.readFileSync(S1.out)), sum: sha(fs.readFileSync(S1.sumPath)) }; const scopeFn = fnSrc('verifyScopeAuthorization');
      const reads = (src.match(/readFileSync\(/g) || []).length; const staticOk = reads === 3 && /readFileSync\(__filename\)/.test(src) && scopeFn.split('readFileSync(').length - 1 === 2 && /readFileSync\(SCOPE_RECORD, 'utf8'\)/.test(scopeFn)
        && (src.match(/statSync\(/g) || []).length === 1 && scopeFn.split('statSync(').length - 1 === 1 && !/readdir|readFile\(|createReadStream|opendir|existsSync\((?!OUT\)|SUMMARY_OUT\))/.test(src);
      const ok = s1Before.ev !== null && s1Before.sum !== null && after.ev === s1Before.ev && after.sum === s1Before.sum && S1.ev.nameAlias === 'AD-1' && S1.sum.nameAlias === 'AD-1' && V(S1).edgeBlocking.value === 'PASS' && S2.ev.nameAlias === 'AD-2' && V(S2).edgeBlocking.value === 'FAIL' && S1.out !== S2.out && staticOk;
      return { ok, obs: `AD-1 dosyaları değişmedi=${after.ev === s1Before.ev && after.sum === s1Before.sum} · AD-1 kenar=${V(S1).edgeBlocking.value} · AD-2 kenar=${V(S2).edgeBlocking.value} · readFileSync sayısı=${reads} · statik=${staticOk}` };
    });

    // ── İpucu senaryoları: ipuçları değişir, katman kimliği ve alanlar DEĞİŞMEZ ──
    const sameAsS1 = (S) => is(S, 0, 'P/P/O/P') && layerVec(S1).length > 0 && layerVec(S) === layerVec(S1) && JSON.stringify(S.ev.layerCounts) === JSON.stringify(S1.ev.layerCounts) && JSON.stringify(V(S).layerVerification.coverage) === JSON.stringify(V(S1).layerVerification.coverage);
    const S3 = await scenario('waf', { tag: 's3' });
    item('S3', 'sağlayıcı ENGELLEME taklidi (imzalı gövde + Server: cloudflare + cf-ray; azaltım işareti YOK), kimlik başlığı yok: ipucu edge-provider (gövdeli retlerde; HEAD gövdesiz → none) YALNIZ ipucu alanında; durum sınıfı RET-403; katman kimliği satır satır S1 ile AYNI, dört alan S1 ile AYNI (imza / başlık hiçbir alana girmez; sağlayıcı adlandırılmaz); adsız özette sağlayıcı adı yok', () => {
      const d = rowsOf(S3, 'deny'); const head = d.filter((x) => x.method === 'HEAD'); const body = d.filter((x) => x.method !== 'HEAD'); const h = S3.ev.hintsOnly.denyLayerHints || {};
      const ok = sameAsS1(S3) && h['edge-provider'] === body.length && h.none === head.length && body.length > 0 && head.length > 0 && d.every((x) => x.outcome === 'RET-403') && S3.gt.every((s) => s.challenge === false)
        && body.every((x) => x.layerHint === 'edge-provider' && x.hints.providerSignature && x.hints.edgeHeaderPresent && x.hints.cfMitigatedPresent === false && x.hints.serverHeaderValue === 'cloudflare' && x.hints.bodyEmpty === false)
        && head.every((x) => x.layerHint === null && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'cloudflare' && x.hints.edgeHeaderPresent === true)
        && !/cloudflare|caddy|edge-provider/i.test(S3.sumBytes.toString('utf8')) && !Object.keys(S3.ev.layerCounts.deny).some((k) => /caddy|provider|cloudflare|kenar|tunel/i.test(k));
      return { ok, obs: brief(S3) + ` · ipucu=${JSON.stringify(h)} · katman kimliği S1 ile aynı=${layerVec(S3) === layerVec(S1)}` };
    });
    const S3b = await scenario('bare', { tag: 's3b' });
    item('S3-b', 'boş 403 gövdesi, Server başlığı YOK: ipucu YOK (boş gövde tek başına ipucu da üretmez); katman kimliği ve dört alan S1 ile AYNI', () => {
      const d = rowsOf(S3b, 'deny'); const h = S3b.ev.hintsOnly.denyLayerHints || {};
      return { ok: sameAsS1(S3b) && h.none === d.length && d.every((x) => x.layerHint === null && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === '' && x.hints.providerSignature === false), obs: brief(S3b) + ` · ipucu=${JSON.stringify(h)}` };
    });
    const S3c = await scenario('behind', { tag: 's3c' });
    item('S3-c', 'boş 403 gövdesi, Server: cloudflare, imza YOK: ipucu YOK; serverHeaderValue=cloudflare yalnız ipucu alanında; katman kimliği ve dört alan S1 ile AYNI', () => {
      const d = rowsOf(S3c, 'deny'); const h = S3c.ev.hintsOnly.denyLayerHints || {};
      return { ok: sameAsS1(S3c) && h.none === d.length && d.every((x) => x.layerHint === null && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'cloudflare' && x.hints.edgeHeaderPresent === true && x.hints.cfMitigatedPresent === false), obs: brief(S3c) + ` · ipucu=${JSON.stringify(h)}` };
    });
    const S3dN = await scenario('body403', { tag: 's3dn' });
    item('S3-dN', 'gövdesi DOLU JSON ama kimlik BAŞLIKSIZ 403 (uygulama hata gövdesine benzeyen yanıtı KENAR üretir): çıkış 0; dört alan ve katman kimliği S1 ile AYNI (dolu gövde hiçbir alana girmez; düz /api yolunda "API değil" çıkarımı); dolu gövde sayısı yalnız ipucu alanında (HEAD gövdesiz → sayılmaz; S1\'de 0)', () => {
      const d = rowsOf(S3dN, 'deny'); const body = d.filter((x) => x.method !== 'HEAD'); const head = d.filter((x) => x.method === 'HEAD'); const j = J(S3dN).filter((p) => p.row.group === 'deny');
      const ok = sameAsS1(S3dN) && j.every((p) => p.gt.producer === 'edge' && p.gt.echoed === 'none') && S3dN.ev.hintsOnly.fullBody403WithoutProviderSignature === body.length && body.length > 0 && body.every((x) => x.hints.bodyEmpty === false && x.hints.providerSignature === false) && head.every((x) => x.hints.bodyEmpty === true)
        && S1.ev.hintsOnly.fullBody403WithoutProviderSignature === 0 && d.find((x) => x.method === 'GET' && x.path === '/api/auth/me').layerId === 'API-DEGIL-CIKARIM';
      return { ok, obs: brief(S3dN) + ` · dolu gövdeli 403 (ipucu)=${S3dN.ev.hintsOnly.fullBody403WithoutProviderSignature}/${body.length} · S1=${S1.ev.hintsOnly.fullBody403WithoutProviderSignature}` };
    });

    // ── Azaltım işareti: durum kodu eşleşir (HTTP / ret PASS) ama hedeflenen kuralın uygulandığını kanıtlamaz (kenar engelleme OLCULEMEYEN) ──
    const S3ch = await scenario('challenge', { tag: 's3ch' }); const S3ch1 = await scenario('challenge1', { tag: 's3ch1' });
    item('S3-ch', 'sınama (challenge) işaretli 403: (a) bütün ret vektörlerinde → durum kodu ölçütü ayrı kaydedilir: HTTP / ret PASS (59/59 durum 403); ama kenar engelleme OLCULEMEYEN (neden SINAMA-ISARETLI-403×59) — PASS DEĞİL, FAIL de DEĞİL; çıkış 3; durum kodları S3 (engelleme, işaretsiz → çıkış 0) ile AYNI; işaret katmana GİRMEZ (katman kimliği satır satır S1 ile aynı); adsız özette sağlayıcı / başlık adı yok · (b) işaret yalnız birkaç ret vektöründe → yine kenar engelleme OLCULEMEYEN, çıkış 3; yalnız işaretli satırlar ayrı sınıf', () => {
      const d = rowsOf(S3ch, 'deny'); const j1 = J(S3ch1).filter((p) => p.row.group === 'deny'); const m1 = j1.filter((p) => p.gt.challenge); const u1 = j1.filter((p) => !p.gt.challenge); const sumTxt = S3ch.sumBytes.toString('utf8');
      const ok = is(S3ch, 3, 'P/O/O/P') && d.length > 0 && S3ch.gt.filter((s, i) => S3ch.ev.rows[i].group === 'deny').every((s) => s.challenge === true && s.status === 403)
        && d.every((x) => x.status === 403 && x.outcome === 'SINAMA-ISARETLI-403' && x.statusExpected === true && x.mitigationMark === 'SINAMA') && rc(S3ch, 'edgeBlocking', 'SINAMA-ISARETLI-403') === d.length && V(S3ch).edgeBlocking.reasons.length === 1 && V(S3ch).httpReject.reasons.length === 0
        && layerVec(S3ch) === layerVec(S1) && S3ch.sum.outcomeCounts.deny['SINAMA-ISARETLI-403'] === d.length && S3ch.sum.outcomeCounts.deny['RET-403'] === 0 && S3ch.sum.coverage.HEAD.rejected403 === 0 && S3ch.sum.coverage.VARYANT.rejected403 === 0
        && !/cloudflare|cf-mitigated|cf-ray|challenge/i.test(sumTxt) && S3ch.ev.findings.length === 0 && S3.code === 0 && S3ch.ev.rows.map((x) => x.status).join() === S3.ev.rows.map((x) => x.status).join()
        && is(S3ch1, 3, 'P/O/O/P') && m1.length > 0 && u1.length > 0 && m1.every((p) => p.row.outcome === 'SINAMA-ISARETLI-403') && u1.every((p) => p.row.outcome === 'RET-403') && rc(S3ch1, 'edgeBlocking', 'SINAMA-ISARETLI-403') === m1.length;
      return { ok, obs: brief(S3ch) + ` · işaretli ret satırı=${d.filter((x) => x.outcome === 'SINAMA-ISARETLI-403').length}/${d.length} · durum kodları S3 ile aynı=${S3ch.ev.rows.map((x) => x.status).join() === S3.ev.rows.map((x) => x.status).join()} (S3 çıkış ${S3.code}) · katman kimliği S1 ile aynı=${layerVec(S3ch) === layerVec(S1)} · kısmi: çıkış=${S3ch1.code}, işaretli=${m1.length}/${j1.length}` };
    });
    const SMk = await scenario('markmix', { tag: 'smk' }); const SMu = await scenario('mitunk', { tag: 'smu' }); const SMe = await scenario('mitempty1', { tag: 'sme' });
    const markOf = (S, id) => J(S).find((p) => p.gt.markId === id);
    item('S3-chF', 'sınama işaretinin BİÇİMİ (aynı koşumda altı ayrı ret vektöründe altı ayrı yazım; değerler girdi tablosunda değişmez): tam değer · baş harfi büyük · tümü büyük · tek satırda liste, değer sonda · tek satırda liste, değer başta (boşluksuz) · iki AYRI başlık satırı → altısı da durum sınıfı SINAMA-ISARETLI-403 ve işaret sınıfı SINAMA (RET-403 değil); neden sayısı 6', () => {
      const want = MARKS.filter((m) => m[2] === 'SINAMA'); const got = want.map((m) => { const p = markOf(SMk, m[0]); return { id: m[0], out: p ? p.row.outcome : 'SATIR-YOK', mk: p ? p.row.mitigationMark : null, st: p ? p.row.status : null, gt: p ? p.gt.mark : null }; });
      const ok = want.length === 6 && got.every((x) => x.st === 403 && x.gt === 'SINAMA' && x.out === 'SINAMA-ISARETLI-403' && x.mk === 'SINAMA') && rc(SMk, 'edgeBlocking', 'SINAMA-ISARETLI-403') === want.length && is(SMk, 3, 'P/O/O/P') && SMk.gt.every((s) => s.mark !== 'BEYANSIZ');
      return { ok, obs: brief(SMk) + ' · ' + got.map((x) => `${x.id}→${x.out === 'SINAMA-ISARETLI-403' ? 'SINAMA' : x.out}`).join(' · ') };
    });
    item('S3-az', 'TANINMAYAN değerli azaltım işareti (başlık VAR, değer tanınan sınama değeri DEĞİL): (a) aynı koşumda beş ayrı ret vektöründe beş ayrı değer — başka bir değer · alt çizgili · ekli · tireli (üçünün içinde sınama sözcüğü geçer ama ögesi değildir) · BOŞ değer → beşi de durum sınıfı TANINMAYAN-AZALTIM-ISARETLI-403 (RET-403 değil, SINAMA da değil); işaretsiz ret satırları RET-403; işaret katmana girmez; başlığın DEĞERİ ham kanıtta / özette / çıktıda yok · (b) bütün ret vektörlerinde tanınmayan değer: durum kodları S3 (işaretsiz engelleme → çıkış 0) ile AYNI, HTTP / ret PASS ama kenar engelleme OLCULEMEYEN, çıkış 3 — PASS değil; yöntem kapsamında "reddedildi" sayılmaz · (c) TEK bir ret vektöründe BOŞ değerli işaret → yine kenar engelleme OLCULEMEYEN, çıkış 3 (ipucu alanı başlığın VAR olduğunu gösterir)', () => {
      const want = MARKS.filter((m) => m[2] === 'TANINMAYAN'); const got = want.map((m) => { const p = markOf(SMk, m[0]); return { id: m[0], out: p ? p.row.outcome : 'SATIR-YOK', mk: p ? p.row.mitigationMark : null, st: p ? p.row.status : null, exp: p ? p.row.statusExpected : null }; });
      const plain = J(SMk).filter((p) => p.row.group === 'deny' && !p.gt.markId); const txt = SMk.evBytes.toString('utf8') + SMk.sumBytes.toString('utf8') + SMk.log;
      const d = rowsOf(SMu, 'deny'); const e1 = J(SMe).filter((p) => p.gt.mark !== 'YOK'); const U = 'TANINMAYAN-AZALTIM-ISARETLI-403';
      const ok = want.length === 5 && got.every((x) => x.st === 403 && x.exp === true && x.out === U && x.mk === 'TANINMAYAN') && plain.length > 0 && plain.every((p) => p.gt.mark === 'YOK' && p.row.outcome === 'RET-403' && p.row.mitigationMark === 'YOK')
        && rc(SMk, 'edgeBlocking', U) === want.length && layerVec(SMk) === layerVec(S1) && SMk.ev.calibration.result === 'VAR'
        && !/managed_challenge|non-challenge|challenged/i.test(txt) && !/cloudflare|cf-mitigated|cf-ray|challenge/i.test(SMk.sumBytes.toString('utf8'))
        && is(SMu, 3, 'P/O/O/P') && d.length > 0 && d.every((x) => x.status === 403 && x.statusExpected === true && x.outcome === U) && rc(SMu, 'edgeBlocking', U) === d.length && V(SMu).edgeBlocking.reasons.length === 1 && V(SMu).httpReject.reasons.length === 0
        && SMu.sum.outcomeCounts.deny['RET-403'] === 0 && SMu.sum.outcomeCounts.deny['SINAMA-ISARETLI-403'] === 0 && SMu.sum.outcomeCounts.deny[U] === d.length && SMu.sum.coverage.HEAD.rejected403 === 0 && SMu.sum.coverage.VARYANT.rejected403 === 0 && SMu.ev.findings.length === 0
        && S3.code === 0 && SMu.ev.rows.map((x) => x.status).join() === S3.ev.rows.map((x) => x.status).join() && layerVec(SMu) === layerVec(S1) && SMu.gt.filter((s, i) => SMu.ev.rows[i].group === 'deny').every((s) => s.mark === 'TANINMAYAN')
        && is(SMe, 3, 'P/O/O/P') && e1.length === 1 && e1[0].row.group === 'deny' && e1[0].row.outcome === U && e1[0].row.hints.cfMitigatedPresent === true && rc(SMe, 'edgeBlocking', U) === 1 && V(SMe).edgeBlocking.reasons.length === 1;
      return { ok, obs: `karışık: ${brief(SMk)} · ` + got.map((x) => `${x.id}→${x.out === U ? 'TANINMAYAN' : x.out}`).join(' · ') + ` || hepsi: ${brief(SMu)} · durum kodları S3 ile aynı=${SMu.ev.rows.map((x) => x.status).join() === S3.ev.rows.map((x) => x.status).join()} (S3 çıkış ${S3.code}) || tek boş değer: çıkış=${SMe.code}, işaretli=${e1.length}` };
    });
    const SMp = await scenario('markpos', { tag: 'smp' }); const SMd = await scenario('markdeny200', { tag: 'smd' });
    item('S3-azP', 'azaltım işareti ret-403 DIŞINDAKİ bir yanıtta — işaret yalnız kenar engelleme hükmünü DÜŞÜRÜR, bulguyu kaldırmaz: (a) POZİTİFLERİN beklenen yanıtında (bir web pozitifi 200 + sınama değeri · bir API pozitifi 401 + tanınmayan değer; ret vektörlerinin hepsi işaretsiz 403, kalibrasyon VAR, durum sayıları S1 ile AYNI) → kenar engelleme OLCULEMEYEN (neden AZALTIM-ISARETI-RET-403-DISINDA×2), çıkış 3 — PASS değil; pozitif kontrol PASS kalır (durum kodları beklenen) · (b) reddedilmeyen (200) bir ret vektörünün yanıtında sınama değeri → bulgu KALIR: çıkış 2, HTTP / ret FAIL ve kenar engelleme FAIL; işaret nedeni de kayıtta', () => {
      const jp = J(SMp).filter((p) => p.gt.mark !== 'YOK'); const jd = J(SMd).filter((p) => p.gt.mark !== 'YOK'); const R = 'AZALTIM-ISARETI-RET-403-DISINDA';
      const ok = is(SMp, 3, 'P/O/O/P') && jp.length === 2 && jp.every((p) => p.row.group === 'allow' && p.row.statusExpected === true && p.row.mitigationMark === p.gt.mark) && jp.map((p) => p.gt.mark).sort().join() === 'SINAMA,TANINMAYAN'
        && rc(SMp, 'edgeBlocking', R) === 2 && V(SMp).edgeBlocking.reasons.length === 1 && SMp.ev.calibration.result === 'VAR' && rowsOf(SMp, 'deny').every((x) => x.outcome === 'RET-403')
        && layerVec(SMp) === layerVec(S1) && JSON.stringify(SMp.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts) && S1.code === 0 && SMp.ev.findings.length === 0
        && is(SMd, 2, 'F/F/F/P') && jd.length === 1 && jd[0].row.group === 'deny' && jd[0].row.status === 200 && jd[0].row.outcome === 'REDDEDILMEDI-2XX' && jd[0].row.mitigationMark === 'SINAMA' && rc(SMd, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === 1 && rc(SMd, 'edgeBlocking', R) === 1 && SMd.ev.findings.length === 1;
      return { ok, obs: `pozitifte: ${brief(SMp)} · işaretli pozitif=${jp.length} · durum sayıları S1 ile aynı=${JSON.stringify(SMp.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts)} (S1 çıkış ${S1.code}) || işaretli 2xx ret: ${brief(SMd)}` };
    });

    // ── API'YE ÖZGÜ KANIT: gerçek API davranışı (geçersiz biçim → yeni kimlik) ──
    const A1 = await scenario('app403', { tag: 'a1' });
    item('A-1', 'API\'nin ürettiği 403 (kenar geçirmiş, uygulama reddetmiş; S3-dN ile AYNI dolu gövde ve AYNI durum kodları): API gönderilen GECERSIZ-BICIM kimliği atıp YENİSİNİ üretir → o satırlar durum sınıfı RET-403 + DEGISTIRME + UYGULAMA-API; durum kodu ölçütü ayrı: HTTP / ret PASS (59/59 durum 403) — ama kenar engelleme FAIL (API\'nin 403 vermesi bunu kapatmaz: engellenmesi gereken istek API\'ye ulaşmıştır) ve katman doğrulaması FAIL; çıkış 2; "karar bekliyor" / değerlendirme çıkışı YOK; sızmayan satırların katman kimliği S1 ile aynı', () => {
      const j = J(A1).filter((p) => p.row.group === 'deny'); const api = j.filter((p) => p.gt.producer === 'api'); const rest = j.filter((p) => p.gt.producer !== 'api'); const s1d = rowsOf(S1, 'deny');
      const ok = is(A1, 2, 'P/F/F/P') && api.length === 5 && api.every((p) => p.gt.status === 403 && p.gt.apiWrote === 'YENI' && p.gt.ridOk === false && p.row.status === 403 && p.row.outcome === 'RET-403' && p.row.statusExpected === true && p.row.idObs === 'YENI-KIMLIK' && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API')
        && rc(A1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === api.length && rc(A1, 'layerVerification', 'RET-SATIRINI-API-YANITLADI-KANITLI') === api.length && V(A1).httpReject.reasons.length === 0 && V(A1).edgeBlocking.reasons.length === 1
        && rest.length > 0 && rest.every((p) => p.row.layerId === s1d[j.indexOf(p)].layerId) && A1.ev.findings.length === api.length && A1.ev.calibration.result === 'VAR'
        && /^D8-HTTP-RET=PASS$/m.test(A1.log) && /^D8-KENAR-ENGELLEME=FAIL$/m.test(A1.log) && /^D8-KATMAN-DOGRULAMA=FAIL$/m.test(A1.log) && /^D8-CIKIS=2$/m.test(A1.log) && !/KARAR|DEGERLENDIRME/.test(A1.log + A1.evBytes.toString('utf8'))
        && JSON.stringify(A1.ev.outcomeCounts.deny) === JSON.stringify(S3dN.ev.outcomeCounts.deny) && S3dN.code === 0 && api.every((p) => !(A1.evBytes.toString('utf8') + A1.sumBytes.toString('utf8')).includes(p.gt.respId));
      return { ok, obs: brief(A1) + ` · API'nin ürettiği 403=${api.length} · durum sayıları S3-dN ile aynı=${JSON.stringify(A1.ev.outcomeCounts.deny) === JSON.stringify(S3dN.ev.outcomeCounts.deny)} (S3-dN çıkış ${S3dN.code})` };
    });
    const A2 = await scenario('app403var', { tag: 'a2' });
    item('A-2', 'API\'nin 403\'ü yalnız yolu BELİRSİZ bir vektörde (kodlama varyantı kenarı aşmış, 403\'ü API üretmiş; ön uçuş değil): yol sınıfı API-BELIRSIZ olduğu halde satır UYGULAMA-API (değiştirme kanıtı yol sınıfından bağımsızdır); HTTP / ret PASS · kenar engelleme FAIL · katman doğrulaması FAIL; çıkış 2; durum sayıları S1 ile AYNI', () => {
      const j = J(A2).filter((p) => p.row.group === 'deny'); const api = j.filter((p) => p.gt.producer === 'api');
      const ok = is(A2, 2, 'P/F/F/P') && api.length === 1 && api[0].gt.status === 403 && api[0].gt.apiWrote === 'YENI' && api[0].row.pathClass === 'API-BELIRSIZ' && api[0].row.method !== 'OPTIONS' && api[0].row.outcome === 'RET-403' && api[0].row.layerId === 'UYGULAMA-API'
        && A2.ev.calibration.result === 'VAR' && rc(A2, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && V(A2).edgeBlocking.reasons.length === 1 && JSON.stringify(A2.ev.outcomeCounts.deny) === JSON.stringify(S1.ev.outcomeCounts.deny) && S1.code === 0;
      return { ok, obs: brief(A2) + ` · API'nin ürettiği 403=${api.length} · yol sınıfı=${api[0] && api[0].row.pathClass} · katman=${api[0] && api[0].row.layerId}` };
    });
    const K5a = await scenario('partial5', { tag: 'k5a' }); const A3a = await scenario('partial5app403', { tag: 'a3a' }); const A3b = await scenario('partial5leak', { tag: 'a3b' }); const A3c = await scenario('reflectapp403', { tag: 'a3c' }); const R2a = await scenario('webecho', { tag: 'r2a' });
    item('A-3', 'kalibrasyon EKSİK ya da GEÇERSİZ iken API\'ye özgü kanıt — somut olumsuz kanıt SİLİNMEZ: (a) kalibrasyon YOK (bir API pozitifi başlıksız) + bir ret vektörünü API 403 ile yanıtlamış → kenar engelleme FAIL, çıkış 2 (aynı kalibrasyon, kanıtsız: K-5a → OLCULEMEYEN, çıkış 3) · (b) kalibrasyon YOK + API\'nin 401\'i → HTTP / ret de FAIL · (c) yansıtan katman GÖRÜLMÜŞ (kalibrasyon GECERSIZ: kenar ve web yanıtları isteğin kimliğini yansıtıyor) + bir ret vektörünü API 403 ile yanıtlamış → o satır yine UYGULAMA-API (yansıtan katman "yeni kimlik" üretemez), kenar engelleme FAIL (aynı yansıtan katman, kanıtsız: R-2a → OLCULEMEYEN); üçünde de kalibrasyon nedeni kayıtta kalır ve "kapalı" (PASS) verilmez', () => {
      const one = (S) => J(S).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
      const a = one(A3a); const b = one(A3b); const c = one(A3c);
      const ok = is(A3a, 2, 'P/F/F/P') && A3a.ev.calibration.result === 'YOK' && A3a.ev.calibration.apiReplace === 2 && A3a.ev.calibration.apiEvidenceUsable === true && a.length === 1 && a[0].gt.status === 403 && a[0].row.layerId === 'UYGULAMA-API' && rc(A3a, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && rc(A3a, 'edgeBlocking', 'KALIBRASYON-YOK') === 1
        && is(K5a, 3, 'P/O/O/P') && K5a.ev.calibration.result === 'YOK'
        && is(A3b, 2, 'F/F/F/P') && A3b.ev.calibration.result === 'YOK' && b.length === 1 && b[0].gt.status === 401 && b[0].row.layerId === 'UYGULAMA-API' && rc(A3b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && A3b.ev.rows.every((x) => x.layerId !== 'API-DEGIL-CIKARIM')
        && is(A3c, 2, 'P/F/F/P') && A3c.ev.calibration.result === 'GECERSIZ' && A3c.ev.calibration.reflectionRows > 3 && A3c.ev.calibration.foreignIdRows === 0 && A3c.ev.calibration.apiEvidenceUsable === true && c.length === 1 && c[0].gt.status === 403 && c[0].row.idSignal === 'DEGISTIRME' && c[0].row.layerId === 'UYGULAMA-API'
        && rc(A3c, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && rc(A3c, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1 && rowsOf(A3c, 'deny').filter((x) => x.layerId === 'UYGULAMA-API').length === 1 && is(R2a, 3, 'P/O/O/P');
      return { ok, obs: `kalibrasyon YOK + API 403: ${brief(A3a)} || YOK + API 401: ${brief(A3b)} || yansıtan katman + API 403: ${brief(A3c)} · K-5a çıkış=${K5a.code} · R-2a çıkış=${R2a.code}` };
    });

    const A4 = await scenario('challengeapp403', { tag: 'a4' });
    item('A-4', 'sınama (challenge) işaretli 403 + BAŞKA bir satırda API\'ye özgü kanıt (bütün ret vektörleri sınama işaretli 403; yalnız bir ret vektörünü API 403 ile yanıtlamış — işaretsiz, değiştirme kanıtlı): işaret kenar engelleme hükmünü yalnız DÜŞÜRÜR, bağımsız kanıtlanan ihlali SİLMEZ → kenar engelleme FAIL korunur (iki neden de kayıtta: API\'ye ulaştı ×1 · sınama işaretli ×58); HTTP / ret PASS; çıkış 2 (S3-ch: yalnız işaret → OLCULEMEYEN, çıkış 3)', () => {
      const j = J(A4).filter((p) => p.row.group === 'deny'); const api = j.filter((p) => p.gt.producer === 'api'); const marked = j.filter((p) => p.gt.challenge);
      const ok = is(A4, 2, 'P/F/F/P') && api.length === 1 && api[0].gt.status === 403 && api[0].gt.mark === 'YOK' && api[0].row.mitigationMark === 'YOK' && api[0].row.layerId === 'UYGULAMA-API' && marked.length === j.length - 1 && marked.length > 0
        && rc(A4, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && rc(A4, 'edgeBlocking', 'SINAMA-ISARETLI-403') === marked.length && V(A4).httpReject.reasons.length === 0 && A4.ev.findings.length === 1 && S3ch.code === 3 && V(S3ch).edgeBlocking.value === 'OLCULEMEYEN';
      return { ok, obs: brief(A4) + ` · API'nin ürettiği 403=${api.length} · sınama işaretli=${marked.length} · S3-ch çıkış=${S3ch.code}` };
    });

    // ── YANSITAN aracı: gönderilen değerin AYNEN dönmesi API kanıtı DEĞİLDİR ──
    const R1 = await scenario('reflectapinopt', { tag: 'r1' });
    item('R-1', 'YANSITAN aracı YALNIZ API önekli, ön uçuş OLMAYAN retlerde (kenar kendi 403\'lerine isteğin kimliğini kopyalıyor; web yanıtlarında ve ön uçuşta başlık YOK — başlıksız bölge temiz; API pozitifleri iki davranışı da gösteriyor): ret vektörleri GECERSIZ-BICIM taşıdığı için "aynı değer geri döndü" gözlemi YANSIMA\'dır (API o değeri atıp yenisini üretirdi) → API kanıtı YOK: UYGULAMA-API 0, kenar engelleme FAIL DEĞİL; kalibrasyon GECERSIZ; kenar engelleme OLCULEMEYEN, katman doğrulaması OLCULEMEYEN, "API değil" çıkarımı 0; çıkış 3 (aynı durum kodlarında API üretseydi A-1: çıkış 2)', () => {
      const j = J(R1); const refl = j.filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'same'); const c = R1.ev.calibration;
      const ok = is(R1, 3, 'P/O/O/P') && refl.length > 20 && refl.every((p) => p.row.group === 'deny' && p.gt.ridOk === false && p.row.method !== 'OPTIONS' && p.row.pathClass !== 'ONEK-DISI' && p.row.status === 403 && p.row.idObs === 'AYNEN' && p.row.idSignal === 'YANSIMA' && p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'YANSIMA')
        && c.result === 'GECERSIZ' && c.zoneHeaderRows === 0 && c.reflectionRows === refl.length && c.foreignIdRows === 0 && c.apiWriteBack === 3 && c.apiReplace === 3 && rowsOf(R1, 'deny').every((x) => x.layerId !== 'UYGULAMA-API' && x.layerId !== 'API-DEGIL-CIKARIM')
        && rc(R1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(R1, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1 && rc(R1, 'edgeBlocking', 'RET-YANITINDA-KATMANI-BELIRSIZ-KIMLIK-BASLIGI') === refl.length && V(R1).layerVerification.coverage.provenApi === 0 && V(R1).layerVerification.coverage.shownNotApi === 0
        && R1.ev.findings.length === 0 && R1.ev.rows.map((x) => x.status).join() === S1.ev.rows.map((x) => x.status).join() && A1.code === 2 && JSON.stringify(R1.ev.outcomeCounts.deny) === JSON.stringify(A1.ev.outcomeCounts.deny);
      return { ok, obs: brief(R1) + ` · kenarın yansıttığı ret yanıtı=${refl.length} · başlıksız bölgede başlık=${c.zoneHeaderRows} · yansıma göstergesi=${c.reflectionRows} · UYGULAMA-API (ret)=${rowsOf(R1, 'deny').filter((x) => x.layerId === 'UYGULAMA-API').length} · A-1 çıkış=${A1.code}` };
    });
    const R2b = await scenario('reflectall', { tag: 'r2b' });
    item('R-2', 'YANSITAN aracı HER YERDE: (a) kenar 403\'lerinde ve web yanıtlarında (API yanıtları değişmeden geçer) → başlıksız bölgede ve ret satırlarında yansıma; kalibrasyon GECERSIZ; ret satırlarında UYGULAMA-API 0; kenar engelleme OLCULEMEYEN; çıkış 3 · (b) API yanıtlarının başlığının ÜZERİNE de yazıyor (68 yanıtın hepsinde gönderilen değer) → GECERSIZ-BICIM gönderilen API pozitiflerinde bile AYNEN döner (YANSIMA: API\'nin "değiştirme" davranışı görülmez) → hiçbir satır UYGULAMA-API değil; çıkış 3', () => {
      const ca = R2a.ev.calibration; const cb = R2b.ev.calibration; const zone = (S) => S.ev.rows.filter((x) => x.pathClass === 'ONEK-DISI' || x.method === 'OPTIONS').length;
      const ok = is(R2a, 3, 'P/O/O/P') && ca.result === 'GECERSIZ' && ca.zoneHeaderRows === zone(R2a) && ca.reflectionRows > ca.zoneHeaderRows && ca.foreignIdRows === 0 && rowsOf(R2a, 'deny').every((x) => x.idObs === 'AYNEN' && x.idSignal === 'YANSIMA' && x.layerId === 'OLCULEMEYEN') && rc(R2a, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && R2a.gt.filter((s) => s.producer !== 'api').every((s) => s.echoed === 'same')
        && is(R2b, 3, 'P/O/O/P') && cb.result === 'GECERSIZ' && cb.apiReplace === 0 && cb.apiWriteBack === 3 && R2b.gt.every((s) => s.echoed === 'same') && R2b.ev.rows.length === VEC.all.length && R2b.ev.rows.every((x) => x.idObs === 'AYNEN' && x.layerId === 'OLCULEMEYEN')
        && rowsOf(R2b, 'allow').filter((x) => x.sent.requestIdForm === 'GECERSIZ-BICIM').every((x) => x.idSignal === 'YANSIMA') && rc(R2b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0;
      return { ok, obs: `kenar + web: ${brief(R2a)} · yansıma göstergesi=${ca.reflectionRows} || her yanıt: ${brief(R2b)} · değiştirme ${cb.apiReplace}/${cb.apiReplaceOf} · UYGULAMA-API=${R2b.ev.rows.filter((x) => x.layerId === 'UYGULAMA-API').length}` };
    });
    const R3a = await scenario('reflectapi', { tag: 'r3a' }); const R3b = await scenario('reflectweb1', { tag: 'r3b' }); const R3c = await scenario('reflectpos1', { tag: 'r3c' }); const R3d = await scenario('reflectpos2', { tag: 'r3d' });
    item('R-3', 'yansıma göstergesi TEK bir bölgede de kalibrasyonu geçersiz kılar (durum sayıları dördünde de S1 ile AYNI; hiçbirinde "API değil" çıkarımı ve kenar engelleme PASS yok; çıkış 3): (a) API önekli retlerde, ÖN UÇUŞ dahil (API ön uçuşta başlık yazamaz) · (b) tek bir WEB ret yanıtında · (c) yalnız bir web POZİTİFİNDE, GECERLI-BICIM gönderilmiş (ret yanıtlarında başlık yok) · (d) yalnız bir web pozitifinde, GECERSIZ-BICIM gönderilmiş → dördünde de kalibrasyon GECERSIZ, yabancı kimlik göstergesi 0', () => {
      const one = (S, n) => { const c = S.ev.calibration; return is(S, 3, 'P/O/O/P') && c.result === 'GECERSIZ' && c.foreignIdRows === 0 && (n === null ? c.reflectionRows > 2 : c.reflectionRows === n) && S.ev.rows.every((x) => x.layerId !== 'API-DEGIL-CIKARIM') && rowsOf(S, 'deny').every((x) => x.layerId !== 'UYGULAMA-API')
        && rc(S, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1 && JSON.stringify(S.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts); };
      const pre = J(R3a).filter((p) => p.row.method === 'OPTIONS' && p.gt.echoed === 'same'); const w = J(R3b).filter((p) => p.gt.echoed === 'same' && p.gt.producer === 'edge'); const p1 = J(R3c).filter((p) => p.gt.producer === 'web' && p.gt.echoed === 'same'); const p2 = J(R3d).filter((p) => p.gt.producer === 'web' && p.gt.echoed === 'same');
      const ok = one(R3a, null) && pre.length === 2 && pre.every((p) => p.row.layerWhy === 'YANSIMA') && R3a.ev.calibration.zoneHeaderRows === 2
        && one(R3b, 1) && w.length === 1 && w[0].row.pathClass === 'ONEK-DISI' && w[0].row.method !== 'OPTIONS' && w[0].row.group === 'deny'
        && one(R3c, 1) && p1.length === 1 && p1[0].row.group === 'allow' && p1[0].gt.ridOk === true && p1[0].row.idObs === 'AYNEN' && p1[0].row.layerWhy === 'YANSIMA' && rowsOf(R3c, 'deny').every((x) => x.idObs === 'YOK') && R3c.ev.calibration.apiWriteBack === 3 && R3c.ev.calibration.apiReplace === 3
        && one(R3d, 1) && p2.length === 1 && p2[0].row.group === 'allow' && p2[0].gt.ridOk === false && p2[0].row.idSignal === 'YANSIMA' && S1.code === 0;
      return { ok, obs: `ön uçuş dahil: ${brief(R3a)} · ön uçuşta aynı değer=${pre.length} || tek web ret: çıkış=${R3b.code}, kalibrasyon=${R3b.ev.calibration.result} || web pozitifi (geçerli biçim): çıkış=${R3c.code}, kalibrasyon=${R3c.ev.calibration.result} || web pozitifi (geçersiz biçim): çıkış=${R3d.code}, kalibrasyon=${R3d.ev.calibration.result}` };
    });

    // ── DAMGALAYAN aracı: API biçiminde "yeni kimlik" gözlemi, damga göstergesi varken API kanıtı DEĞİLDİR ──
    const M1 = await scenario('fark403', { tag: 'm1' });
    item('M-1', 'DAMGALAYAN aracı bütün ret yanıtlarına KENDİ kimliğini yazıyor (API\'nin ürettiği biçimle AYNI biçimde; web ve ön uçuş retleri dahil): API önekli ret satırlarında gözlem API\'nin "değiştirme" davranışıyla AYNI görünür (GECERSIZ-BICIM gönderildi, API biçiminde yeni kimlik döndü) — ama başlıksız bölgede de kimlik başlığı var → yabancı kimlik göstergesi → API kanıtı KULLANILAMAZ: hiçbir satır UYGULAMA-API değil (gerçekten API\'nin ürettiği pozitif yanıtlar dahil); kalibrasyon GECERSIZ; kenar engelleme OLCULEMEYEN (FAIL değil, PASS değil); çıkış 3; yanıt başlığı DEĞERLERİ ham kanıta ve özete yazılmaz', () => {
      const j = J(M1).filter((p) => p.row.group === 'deny'); const txt = M1.evBytes.toString('utf8') + M1.sumBytes.toString('utf8'); const c = M1.ev.calibration; const zone = j.filter((p) => p.row.pathClass === 'ONEK-DISI' || p.row.method === 'OPTIONS'); const non = j.filter((p) => !zone.includes(p));
      const ok = is(M1, 3, 'P/O/O/P') && j.length > 0 && j.every((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other' && p.gt.respUuid === true && p.row.idObs === 'YENI-KIMLIK' && p.row.status === 403 && p.row.layerId === 'OLCULEMEYEN')
        && zone.length === 15 && zone.every((p) => p.row.layerWhy === 'YABANCI-KIMLIK') && non.length === 44 && non.every((p) => p.row.idSignal === 'DEGISTIRME' && p.row.layerWhy === 'KANIT-KULLANILAMAZ')
        && c.result === 'GECERSIZ' && c.foreignIdRows === zone.length && c.reflectionRows === 0 && c.apiEvidenceUsable === false && c.apiWriteBack === 3 && c.apiReplace === 3 && M1.ev.rows.every((x) => x.layerId !== 'UYGULAMA-API' && x.layerId !== 'API-DEGIL-CIKARIM')
        && rc(M1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(M1, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1 && rc(M1, 'edgeBlocking', 'RET-YANITINDA-KATMANI-BELIRSIZ-KIMLIK-BASLIGI') === j.length && M1.ev.findings.length === 0 && j.every((p) => p.gt.respId && !txt.includes(p.gt.respId));
      return { ok, obs: brief(M1) + ` · damgalı ret yanıtı=${j.filter((p) => p.gt.echoed === 'other').length}/${j.length} · başlıksız bölgede yabancı kimlik=${c.foreignIdRows} · API kanıtı kullanılabilir=${c.apiEvidenceUsable} · UYGULAMA-API=${M1.ev.rows.filter((x) => x.layerId === 'UYGULAMA-API').length}` };
    });
    const M2 = await scenario('stampleak', { tag: 'm2' });
    item('M-2', 'damgalayan aracı + GERÇEK sızıntı (bir ret vektörünü API 401 ile yanıtlamış; damga başlıksız her yanıtta): sızan satırın gözlemi damgalı satırlarla AYNI sınıftadır (API biçiminde yeni kimlik) → API\'ye özgü DEĞİL → o satır UYGULAMA-API sayılmaz, kenar engelleme FAIL verilmez (OLCULEMEYEN); ama durum kodu ölçütü bağımsızdır: HTTP / ret FAIL (403 yerine doğrulanmış 401) → çıkış 2', () => {
      const j = J(M2); const api = j.filter((p) => p.row.group === 'deny' && p.gt.producer === 'api'); const c = M2.ev.calibration;
      const ok = is(M2, 2, 'F/O/O/P') && api.length === 1 && api[0].gt.status === 401 && api[0].gt.apiWrote === 'YENI' && api[0].row.idSignal === 'DEGISTIRME' && api[0].row.layerId === 'OLCULEMEYEN' && api[0].row.layerWhy === 'KANIT-KULLANILAMAZ'
        && c.result === 'GECERSIZ' && c.foreignIdRows > 0 && c.apiEvidenceUsable === false && rc(M2, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === 1 && rc(M2, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(M2, 'edgeBlocking', 'DURUM-KODU-OLCUTU-PASS-DEGIL') === 1
        && M2.ev.rows.every((x) => x.layerId !== 'UYGULAMA-API') && M2.ev.findings.length === 1;
      return { ok, obs: brief(M2) + ` · API'nin ürettiği ret yanıtı=${api.length} (katman=${api[0] && api[0].row.layerId}/${api[0] && api[0].row.layerWhy}) · yabancı kimlik göstergesi=${c.foreignIdRows}` };
    });
    const M3a = await scenario('fark403web', { tag: 'm3a' }); const M3b = await scenario('fark403opt', { tag: 'm3b' }); const M3c = await scenario('stamppos1app403', { tag: 'm3c' });
    item('M-3', 'damga göstergesi TEK bir bölgede de yeter: (a) yalnız önek dışı (web) ret yanıtlarında · (b) yalnız API önekli ön uçuş yanıtında → kalibrasyon GECERSIZ, API kanıtı kullanılamaz, başlıksız API önekli satırlarda da "API değil" çıkarımı YAPILMAZ; çıkış 3 · (c) damga yalnız bir web POZİTİFİNDE + bir ret vektörünü API 403 ile yanıtlamış (A-1\'in girdisi) → API\'nin "yeni kimlik" yanıtı API\'ye özgü sayılamaz: o satır UYGULAMA-API DEĞİL, kenar engelleme FAIL DEĞİL (OLCULEMEYEN), çıkış 3 — kanıtın desteklemediği kesinlik reddedilir (A-1: gösterge yokken aynı girdi çıkış 2)', () => {
      const one = (S, n) => { const c = S.ev.calibration; return is(S, 3, 'P/O/O/P') && c.result === 'GECERSIZ' && c.foreignIdRows === n && c.reflectionRows === 0 && c.apiEvidenceUsable === false && S.ev.rows.every((x) => x.layerId !== 'API-DEGIL-CIKARIM' && x.layerId !== 'UYGULAMA-API') && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(S, 'edgeBlocking', 'KALIBRASYON-GECERSIZ') === 1; };
      const wa = J(M3a).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other'); const wb = J(M3b).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other'); const apiC = J(M3c).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
      const ok = one(M3a, wa.length) && wa.length > 5 && wa.every((p) => p.row.group === 'deny' && p.row.pathClass === 'ONEK-DISI') && rowsOf(M3a, 'deny').filter((x) => x.pathClass === 'API-KESIN' && x.method !== 'OPTIONS').every((x) => x.idObs === 'YOK' && x.layerWhy === 'KALIBRASYON-GECERSIZ')
        && one(M3b, 2) && wb.length === 2 && wb.every((p) => p.row.method === 'OPTIONS')
        && one(M3c, 1) && apiC.length === 1 && apiC[0].gt.status === 403 && apiC[0].gt.apiWrote === 'YENI' && apiC[0].row.idSignal === 'DEGISTIRME' && apiC[0].row.layerWhy === 'KANIT-KULLANILAMAZ' && A1.code === 2;
      return { ok, obs: `web ret: ${brief(M3a)} · damgalı=${wa.length} || ön uçuş: çıkış=${M3b.code}, damgalı=${wb.length} || web pozitifinde damga + API 403: ${brief(M3c)} · A-1 çıkış=${A1.code}` };
    });
    const M4 = await scenario('fark403apifix', { tag: 'm4' });
    item('M-4', 'API biçiminde OLMAYAN kimlik değeri YALNIZ API önekli, ön uçuş olmayan ret yanıtlarında (başlıksız bölge temiz): API böyle bir değer üretemez → YABANCI-KIMLIK → kalibrasyon GECERSIZ, API kanıtı kullanılamaz; o satırlar UYGULAMA-API değil; kenar engelleme OLCULEMEYEN; çıkış 3 (aynı yerde API biçiminde değer: SINIR-1)', () => {
      const j = J(M4).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other'); const c = M4.ev.calibration; const txt = M4.evBytes.toString('utf8') + M4.sumBytes.toString('utf8') + M4.log;
      const ok = is(M4, 3, 'P/O/O/P') && j.length > 20 && j.every((p) => p.gt.respUuid === false && p.row.idObs === 'BASKA-DEGER' && p.row.idSignal === 'YABANCI-KIMLIK' && p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'YABANCI-KIMLIK' && p.row.pathClass !== 'ONEK-DISI' && p.row.method !== 'OPTIONS')
        && c.result === 'GECERSIZ' && c.zoneHeaderRows === 0 && c.foreignIdRows === j.length && c.apiEvidenceUsable === false && rc(M4, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && !txt.includes('kenar-0001');
      return { ok, obs: brief(M4) + ` · yabancı değerli ret yanıtı=${j.length} · başlıksız bölgede başlık=${c.zoneHeaderRows} · yabancı kimlik göstergesi=${c.foreignIdRows}` };
    });

    // ── EZEN aracı (API'nin başlığını siler / üzerine yazar) · canlı API kaynaktaki gibi davranmıyor ──
    const E1a = await scenario('apinoecho', { tag: 'e1a' }); const E1b = await scenario('stripleak', { tag: 'e1b' });
    item('E-1', 'EZEN aracı API yanıtlarından kimlik başlığını SİLİYOR: (a) API pozitifleri beklenen kodu (401) verdi ama başlıksız → kalibrasyon YOK (iki davranış da görülmedi: 0/3 · 0/3); hiçbir satırda "API değil" çıkarımı ve UYGULAMA-API yok; durum sayıları S1 ile AYNI olduğu halde kenar engelleme OLCULEMEYEN — PASS değil; çıkış 3 · (b) aynı aracı + bir ret vektörünü API 401 ile yanıtlamış (başlık silinmiş) → API kanıtı YOK (kenar engelleme FAIL verilmez, OLCULEMEYEN); durum kodu ölçütü bağımsız: HTTP / ret FAIL → çıkış 2', () => {
      const c = E1a.ev.calibration; const api = J(E1b).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
      const ok = is(E1a, 3, 'P/O/O/P') && c.result === 'YOK' && c.apiWriteBack === 0 && c.apiReplace === 0 && c.reflectionRows === 0 && c.foreignIdRows === 0 && E1a.ev.rows.every((x) => x.idObs === 'YOK' && x.layerId === 'OLCULEMEYEN') && rc(E1a, 'edgeBlocking', 'KALIBRASYON-YOK') === 1 && V(E1a).edgeBlocking.reasons.length === 1
        && V(E1a).layerVerification.coverage.shownNotApi === 0 && JSON.stringify(E1a.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts) && S1.code === 0
        && is(E1b, 2, 'F/O/O/P') && api.length === 1 && api[0].gt.status === 401 && api[0].gt.echoed === 'none' && api[0].row.idObs === 'YOK' && api[0].row.layerId === 'OLCULEMEYEN' && rc(E1b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(E1b, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === 1 && E1b.ev.rows.every((x) => x.layerId !== 'API-DEGIL-CIKARIM');
      return { ok, obs: `silen: ${brief(E1a)} · aynen geri yazma ${c.apiWriteBack}/${c.apiWriteBackOf} · değiştirme ${c.apiReplace}/${c.apiReplaceOf} || silen + sızıntı: ${brief(E1b)}` };
    });
    const E2a = await scenario('crushapi', { tag: 'e2a' }); const E2b = await scenario('strictfmt', { tag: 'e2b' });
    item('E-2', 'API yanıtındaki kimlik kaynak okumasıyla AÇIKLANAMIYOR: (a) EZEN aracı API yanıtlarının başlığının ÜZERİNE kendi değerini yazıyor · (b) canlı API kaynaktakinden FARKLI bir kabul deseniyle çalışıyor (sondanın GECERLI-BICIM değerini de atıp yenisini üretiyor) → ikisinde de GECERLI-BICIM gönderilen 3 API pozitifinde değer AYNEN dönmedi (YABANCI-KIMLIK ×3) → kalibrasyon GECERSIZ, API kanıtı KULLANILAMAZ; API\'nin 403 ile yanıtladığı ret vektörü ("yeni kimlik" görünür) UYGULAMA-API sayılmaz; kenar engelleme OLCULEMEYEN; çıkış 3', () => {
      const one = (S) => { const c = S.ev.calibration; const g = rowsOf(S, 'allow').filter((x) => x.vectorClass === 'POZITIF-API' && x.sent.requestIdForm === 'GECERLI-BICIM'); const me = J(S).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
        return is(S, 3, 'P/O/O/P') && c.result === 'GECERSIZ' && c.foreignIdRows === 3 && c.apiWriteBack === 0 && c.apiEvidenceUsable === false && g.length === 3 && g.every((x) => x.idObs === 'YENI-KIMLIK' && x.idSignal === 'YABANCI-KIMLIK')
          && me.length === 1 && me[0].gt.status === 403 && me[0].row.idSignal === 'DEGISTIRME' && me[0].row.layerId === 'OLCULEMEYEN' && me[0].row.layerWhy === 'KANIT-KULLANILAMAZ' && S.ev.rows.every((x) => x.layerId !== 'UYGULAMA-API') && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0; };
      return { ok: one(E2a) && one(E2b), obs: `üzerine yazan: ${brief(E2a)} || farklı kabul deseni: ${brief(E2b)}` };
    });
    const X1 = await scenario('fark403api', { tag: 'sinir1', limit: 'SINIR-1' });
    item('SINIR-1', 'SINIRIN KAYDI (güvence DEĞİL — sondanın ayırt EDEMEDİĞİ durum; FAIL yönündeki sınır, belge §1.1): YALNIZ API önekli, ön uçuş olmayan ret yanıtlarına API\'nin ürettiği biçimde KENDİ kimliğini yazan ve başka hiçbir yanıtta görünmeyen bir katman (zemin gerçeği: bu yanıtları KENAR üretti) → başlıksız bölge temiz, API pozitifleri tam; gözlem API\'nin "değiştirme" davranışından ayırt edilemez → sonda o satırları UYGULAMA-API sayar: kenar engelleme FAIL, çıkış 2. Hata yönü FAIL\'dir (bulgu adayı); PASS yönünde değildir. (Aynı yerde API biçiminde olmayan değer: M-4 → OLCULEMEYEN)', () => {
      const j = J(X1).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other'); const c = X1.ev.calibration;
      const ok = is(X1, 2, 'P/F/F/P') && j.length > 20 && j.length === J(M4).filter((p) => p.gt.producer === 'edge' && p.gt.echoed === 'other').length && j.every((p) => p.gt.respUuid === true && p.row.group === 'deny' && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API') && c.result === 'VAR' && c.zoneHeaderRows === 0 && c.foreignIdRows === 0 && rc(X1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === j.length && M4.code === 3;
      return { ok, obs: brief(X1) + ` · kenarın ürettiği ama API sayılan ret yanıtı=${j.length} · kalibrasyon=${c.result} · M-4 çıkış=${M4.code}` };
    });
    const X2 = await scenario('striponly403', { tag: 'sinir2', limit: 'SINIR-2' });
    item('SINIR-2', 'SINIRIN KAYDI (güvence DEĞİL — PASS yönündeki sınır: kenar engelleme PASS kaydının dayandığı varsayım 1): zincirde, YALNIZ API\'nin ürettiği 403 yanıtından kimlik başlığını silen bir katman (zemin gerçeği: bir ret vektörünü API yanıtladı; pozitiflerin yanıtında başlık düşmüyor) → o yanıt kenarın 403\'ünden ayırt edilemez: sonda "API değil" çıkarımı yapar, kenar engelleme PASS, çıkış 0. Bu yüzden PASS kaydı varsayımı AÇIKÇA taşır ve katman doğrulaması PASS değil OLCULEMEYEN kalır', () => {
      const api = J(X2).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api'); const sc = V(X2).edgeBlocking.scope;
      const ok = is(X2, 0, 'P/P/O/P') && api.length === 1 && api[0].gt.status === 403 && api[0].gt.apiWrote === 'YENI' && api[0].gt.echoed === 'none' && api[0].row.idObs === 'YOK' && api[0].row.layerId === 'API-DEGIL-CIKARIM' && X2.ev.calibration.result === 'VAR'
        && /VARSAYIMLAR: \(1\) API'nin ürettiği yanıtta kimlik başlığı zincirde düşürülmüyor/.test(sc) && V(X2).layerVerification.value === 'OLCULEMEYEN';
      return { ok, obs: brief(X2) + ` · API'nin yanıtladığı ama "API değil" sayılan ret satırı=${api.length} · kayıt ekinde varsayım=${/VARSAYIMLAR: \(1\)/.test(sc)}` };
    });

    // ── Kısmi kalibrasyon · başlıksız bölge ölçülemedi ──
    const K5b = await scenario('partial1', { tag: 'k5b' }); const K5c = await scenario('partialvalid', { tag: 'k5c' }); const K5d = await scenario('partialinvalid', { tag: 'k5d' });
    item('K-5', 'KISMİ kalibrasyon (ret vektörlerinin hepsi başlıksız 403; durum sayıları S1 ile AYNI): (a) 6 API pozitifinden BİRİ başlıksız · (b) yalnız BİRİ başlıklı · (c) GECERLI-BICIM gönderilen üçü başlıksız — yalnız "değiştirme" görüldü (0/3 · 3/3) · (d) GECERSIZ-BICIM gönderilen üçü başlıksız — yalnız "aynen geri yazma" görüldü (3/3 · 0/3) → dördünde de kalibrasyon YOK (iki davranışın İKİSİ de TAM olmalı); hiçbir satırda "API değil" çıkarımı yok; kenar engelleme OLCULEMEYEN — PASS değil; çıkış 3 (S1: 3/3 · 3/3 → çıkış 0)', () => {
      const one = (S, w, r) => { const c = S.ev.calibration; return is(S, 3, 'P/O/O/P') && c.result === 'YOK' && c.apiWriteBack === w && c.apiReplace === r && c.reflectionRows === 0 && c.foreignIdRows === 0 && rowsOf(S, 'allow').every((x) => x.statusExpected === true)
        && S.ev.rows.every((x) => x.layerId !== 'API-DEGIL-CIKARIM') && rowsOf(S, 'deny').every((x) => x.status === 403 && x.layerId === 'OLCULEMEYEN') && rc(S, 'edgeBlocking', 'KALIBRASYON-YOK') === 1 && V(S).edgeBlocking.reasons.length === 1 && JSON.stringify(S.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts); };
      return { ok: one(K5a, 3, 2) && one(K5b, 1, 0) && one(K5c, 0, 3) && one(K5d, 3, 0) && S1.code === 0 && S1.ev.calibration.apiWriteBack === 3 && S1.ev.calibration.apiReplace === 3, obs: `5/6: ${brief(K5a)} · 1/6: çıkış=${K5b.code} · yalnız değiştirme: çıkış=${K5c.code}, ${K5c.ev.calibration.apiWriteBack}/3·${K5c.ev.calibration.apiReplace}/3 · yalnız aynen: çıkış=${K5d.code}, ${K5d.ev.calibration.apiWriteBack}/3·${K5d.ev.calibration.apiReplace}/3 · S1 çıkış=${S1.code}` };
    });
    const K10 = await scenario('posdropweb', { tag: 'k10' });
    item('K-10', 'bir web pozitifi ÖLÇÜLEMEDİ (bağlantı koptu; API pozitifleri tam, ret vektörlerinin hepsi başlıksız 403): başlıksız bölgenin pozitif ayağı eksik → kalibrasyon YOK (VAR değil); hiçbir satırda "API değil" çıkarımı yok; kenar engelleme OLCULEMEYEN, pozitif kontrol OLCULEMEYEN; çıkış 3', () => {
      const c = K10.ev.calibration; const ok = is(K10, 3, 'P/O/O/O') && c.result === 'YOK' && c.apiWriteBack === 3 && c.apiReplace === 3 && c.webPositives === 3 && c.webMeasured === 2 && c.reflectionRows === 0 && c.foreignIdRows === 0 && K10.ev.rows.every((x) => x.layerId !== 'API-DEGIL-CIKARIM')
        && rowsOf(K10, 'deny').every((x) => x.status === 403 && x.layerId === 'OLCULEMEYEN') && rc(K10, 'positiveControl', 'POZITIF-YANITSIZ') === 1 && rc(K10, 'edgeBlocking', 'YANITSIZ-VEKTOR') === 1;
      return { ok, obs: brief(K10) + ` · web ölçülen ${c.webMeasured}/${c.webPositives} · "API değil" çıkarımı=${K10.ev.rows.filter((x) => x.layerId === 'API-DEGIL-CIKARIM').length}` };
    });
    const Z1 = await scenario('zonedropapp403', { tag: 'z1' });
    item('Z-1', 'başlıksız bölge HİÇ ölçülemedi (web yolları ve ön uçuş istekleri yanıtsız; damgalayan katmanın arandığı yer boş) + bir ret vektörünü API 403 ile yanıtlamış: "yeni kimlik" gözlemi var ama karşı denetimi yapılamadı → API kanıtı KULLANILAMAZ: o satır UYGULAMA-API değil, kenar engelleme FAIL değil; yanıtsız ret vektörleri → HTTP / ret OLCULEMEYEN; çıkış 3', () => {
      const c = Z1.ev.calibration; const api = J(Z1).filter((p) => p.row.group === 'deny' && p.gt.producer === 'api');
      const ok = is(Z1, 3, 'O/O/O/O') && c.zoneMeasured === 0 && c.zoneRows === 18 && c.foreignIdRows === 0 && c.apiEvidenceUsable === false && c.result === 'YOK' && api.length === 1 && api[0].gt.status === 403 && api[0].row.idSignal === 'DEGISTIRME' && api[0].row.layerId === 'OLCULEMEYEN' && api[0].row.layerWhy === 'KANIT-KULLANILAMAZ'
        && rc(Z1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(Z1, 'httpReject', 'RET-VEKTORU-YANITSIZ') === 15 && Z1.ev.rows.every((x) => x.layerId !== 'UYGULAMA-API' || x.group === 'allow') && rowsOf(Z1, 'deny').every((x) => x.layerId !== 'UYGULAMA-API');
      return { ok, obs: brief(Z1) + ` · başlıksız bölgede ölçülen ${c.zoneMeasured}/${c.zoneRows} · API kanıtı kullanılabilir=${c.apiEvidenceUsable}` };
    });

    // ── 403 dışı yanıtlar: durum kodu ölçütü HER birinde FAIL; kenar engelleme yalnız API kanıtı varsa FAIL ──
    const aff = (S, st) => J(S).filter((p) => p.row.group === 'deny' && p.gt.status === st);
    const provenNon403 = (S, st, out) => { const a = aff(S, st); return is(S, 2, 'F/F/F/P') && a.length > 0 && a.every((p) => p.gt.producer === 'api' && p.gt.apiWrote === 'YENI' && p.row.outcome === out && p.row.idSignal === 'DEGISTIRME' && p.row.layerId === 'UYGULAMA-API') && rc(S, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === a.length && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === a.length && S.ev.findings.length === a.length; };
    const unprovenNon403 = (S, st, out) => { const a = aff(S, st); return is(S, 2, 'F/O/O/P') && a.length > 0 && a.every((p) => p.gt.producer === 'edge' && p.row.outcome === out && p.row.idObs === 'YOK' && p.row.layerId !== 'UYGULAMA-API' && p.row.statusExpected === false) && rc(S, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === a.length && V(S).httpReject.reasons.length === 1 && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(S, 'edgeBlocking', 'DURUM-KODU-OLCUTU-PASS-DEGIL') === 1 && V(S).edgeBlocking.reasons.length === 1 && S.ev.findings.length === a.length; };
    const L2 = await scenario('api5xx', { tag: 'l2' });
    item('L-2', 'API\'nin ürettiği 5xx (ret vektöründe 503; değiştirme kanıtı var): HTTP / ret FAIL · kenar engelleme FAIL · katman doğrulaması FAIL; çıkış 2', () => ({ ok: provenNon403(L2, 503, 'SUNUCU-HATASI-5XX'), obs: brief(L2) + ` · API kanıtlı 503=${aff(L2, 503).length}` }));
    const L2b = await scenario('api429', { tag: 'l2b' });
    item('L-2b', 'API\'nin ürettiği 429 (hız sınırı yanıtı; değiştirme kanıtı var): HTTP / ret FAIL · kenar engelleme FAIL; çıkış 2', () => ({ ok: provenNon403(L2b, 429, 'HIZ-SINIRI-429'), obs: brief(L2b) + ` · API kanıtlı 429=${aff(L2b, 429).length}` }));
    const L9 = await scenario('api302', { tag: 'l9' });
    item('L-9', 'API\'nin ürettiği 3xx (ret vektöründe 302; değiştirme kanıtı var): HTTP / ret FAIL · kenar engelleme FAIL; çıkış 2 (L-5: aynı kod, kanıtsız → kenar engelleme OLCULEMEYEN)', () => ({ ok: provenNon403(L9, 302, 'YONLENDIRME-3XX'), obs: brief(L9) + ` · API kanıtlı 302=${aff(L9, 302).length}` }));
    const L3 = await scenario('edge5xx', { tag: 'l3' });
    item('L-3', 'API\'den geldiği KANITSIZ 5xx (aynı vektörlerde 502\'yi kenar üretir): beklenen 403 yerine DOĞRULANMIŞ başka bir HTTP yanıtı → durum kodu ölçütü FAIL (ölçülemeyen DEĞİL); API\'ye ulaşma kanıtı yok → kenar engelleme OLCULEMEYEN (FAIL değil); çıkış 2', () => ({ ok: unprovenNon403(L3, 502, 'SUNUCU-HATASI-5XX') && aff(L3, 502).length === aff(L2, 503).length, obs: brief(L3) + ` · kanıtsız 502=${aff(L3, 502).length}` }));
    const L4 = await scenario('edge404', { tag: 'l4' });
    item('L-4', 'kanıtsız 403 dışı 4xx (aynı vektörlerde başlıksız 404; tünel varsayılanı da, kenarı geçen istek de bu kodu verebilir): durum kodu ölçütü FAIL; kenar engelleme OLCULEMEYEN — PASS sayılmaz, API sızıntısı da yazılmaz; çıkış 2', () => ({ ok: unprovenNon403(L4, 404, 'DORTYUZ-403-DISI'), obs: brief(L4) + ` · kanıtsız 404=${aff(L4, 404).length}` }));
    const L5 = await scenario('redirect', { tag: 'l5' });
    item('L-5', 'yönlendirme (aynı vektörlerde 302 + Location): durum kodu ölçütü FAIL; kenar engelleme OLCULEMEYEN; sonda yönlendirmeyi İZLEMEZ (kenar yalnız 68 istek gördü); çıkış 2; yönlendirme HEDEFİ ham kanıta, özete ve çıktıya yazılmaz', () => {
      const txt = L5.evBytes.toString('utf8') + L5.sumBytes.toString('utf8') + L5.log;
      return { ok: unprovenNon403(L5, 302, 'YONLENDIRME-3XX') && L5.gt.length === VEC.all.length && !txt.includes('yonlendirme-hedefi') && !txt.includes('gizli') && !/location/i.test(L5.evBytes.toString('utf8')), obs: brief(L5) + ` · 302=${aff(L5, 302).length} · hedef kanıtta=${txt.includes('yonlendirme-hedefi')} · kenarın gördüğü istek=${L5.gt.length}` };
    });
    const L6 = await scenario('rate429', { tag: 'l6' });
    item('L-6', 'kanıtsız 429 (hız sınırı; erişim kararı gözlenmedi): durum kodu ölçütü FAIL; kenar engelleme OLCULEMEYEN; çıkış 2 (L-2b: aynı kod, API kanıtlı → kenar engelleme FAIL)', () => ({ ok: unprovenNon403(L6, 429, 'HIZ-SINIRI-429') && L2b.code === 2 && V(L2b).edgeBlocking.value === 'FAIL', obs: brief(L6) + ` · kanıtsız 429=${aff(L6, 429).length} · L-2b kenar=${V(L2b).edgeBlocking.value}` }));
    const L8 = await scenario('edge600', { tag: 'l8' });
    item('L-8', 'hiçbir sınıfa girmeyen durum kodu (aynı vektörlerde 600): durum sınıfı SINIFLANAMADI; yine doğrulanmış 403 dışı yanıt → durum kodu ölçütü FAIL; kenar engelleme OLCULEMEYEN; çıkış 2 — PASS değil', () => ({ ok: unprovenNon403(L8, 600, 'SINIFLANAMADI') && aff(L8, 600).length === aff(L3, 502).length, obs: brief(L8) + ` · 600=${aff(L8, 600).length}` }));
    const H1 = await scenario('denydrop1', { tag: 'h1' });
    item('H-1', 'yanıt ALINAMAYAN ret vektörü ayrı sınıftır (TEK bir ret vektöründe bağlantı koptu; diğer 58\'i başlıksız 403, pozitifler tam): HTTP / ret OLCULEMEYEN (neden RET-VEKTORU-YANITSIZ×1) — FAIL DEĞİL, PASS DEĞİL; kenar engelleme OLCULEMEYEN; çıkış 3. Aynı vektörlerde doğrulanmış başka yanıt (L-4: 404) → FAIL, çıkış 2: iki durum tek etikette birleşmez', () => {
      const lost = J(H1).filter((p) => p.gt.producer === 'drop');
      const ok = is(H1, 3, 'O/O/O/P') && lost.length === 1 && lost[0].row.group === 'deny' && lost[0].row.status === 0 && lost[0].row.outcome === 'SONUC-YOK' && lost[0].row.errorClass === 'BAGLANTI' && lost[0].row.layerId === 'SONUC-YOK' && rc(H1, 'httpReject', 'RET-VEKTORU-YANITSIZ') === 1 && V(H1).httpReject.reasons.length === 1
        && rc(H1, 'edgeBlocking', 'YANITSIZ-VEKTOR') === 1 && rc(H1, 'edgeBlocking', 'DURUM-KODU-OLCUTU-PASS-DEGIL') === 1 && H1.ev.calibration.result === 'VAR' && H1.ev.findings.length === 0 && L4.code === 2 && V(L4).httpReject.value === 'FAIL';
      return { ok, obs: brief(H1) + ` · yanıtsız ret vektörü=${lost.length} · L-4 http=${V(L4).httpReject.value} (çıkış ${L4.code})` };
    });

    // ── Tekdüze yanıtlar ──
    const U1 = await scenario('uniform', { tag: 'u1' });
    item('U-1', 'tekdüze 403 (pozitifler dahil 68/68 istek 403): durum kodu ölçütü PASS (ret vektörlerinin hepsi 403; sayılar S1 ile AYNI) — ama kenar engelleme OLCULEMEYEN ("personel kapalı, portal açık" gözlemi DEĞİL: nedenler TEKDUZE-403 · pozitifler beklendiği gibi değil ×9 · kalibrasyon YOK) ve pozitif kontrol OLCULEMEYEN (reddedildi ×9); çıkış 3', () => {
      const r = U1.ev.rows; const ok = is(U1, 3, 'P/O/O/O') && r.length === VEC.all.length && r.every((x) => x.status === 403) && rc(U1, 'edgeBlocking', 'TEKDUZE-403') === 1 && rc(U1, 'edgeBlocking', 'POZITIF-BEKLENDIGI-GIBI-DEGIL') === VEC.allow.length && rc(U1, 'edgeBlocking', 'KALIBRASYON-YOK') === 1
        && rc(U1, 'positiveControl', 'POZITIF-REDDEDILDI-403') === VEC.allow.length && V(U1).httpReject.reasons.length === 0 && JSON.stringify(U1.ev.outcomeCounts.deny) === JSON.stringify(S1.ev.outcomeCounts.deny) && S1.code === 0 && /^D8-HTTP-RET=PASS$/m.test(U1.log) && /^D8-KENAR-ENGELLEME=OLCULEMEYEN$/m.test(U1.log);
      return { ok, obs: brief(U1) + ` · 403=${r.filter((x) => x.status === 403).length}/${r.length} · ret vektörü sayıları S1 ile aynı=${JSON.stringify(U1.ev.outcomeCounts.deny) === JSON.stringify(S1.ev.outcomeCounts.deny)}` };
    });
    const U2a = await scenario('uni404', { tag: 'u2a' }); const U2b = await scenario('uni301', { tag: 'u2b' }); const U2c = await scenario('uni401', { tag: 'u2c' });
    const U2d = await scenario('uni404stamp', { tag: 'u2d' }); const U2e = await scenario('uni404reflect', { tag: 'u2e' }); const U2f = await scenario('uni404drop', { tag: 'u2f' });
    item('U-2', 'SUNULMAYAN AD (pozitifler dahil bütün istekler aynı 403 dışı kodu aldı): (a) 68/68 başlıksız 404 · (b) 68/68 301 (hedef kanıta yazılmaz) · (c) 68/68 başlıksız 401 · (d) 68/68 404, her yanıtta katmanın kendi kimliği (damga) · (e) 68/68 404, her yanıtta isteğin kimliği yansıtılmış · (f) 67 × 404 + bir taşıma hatası → altısında da durum kodu ölçütü FAIL (59 ret vektörüne doğrulanmış 403 dışı yanıt; "ölçülemedi" DEĞİL), kenar engelleme OLCULEMEYEN (FAIL değil — API\'ye ulaşma kanıtı yok; PASS değil), katman doğrulaması OLCULEMEYEN, hiçbir satır UYGULAMA-API değil; çıkış 2. Pozitif kontrol ayrı kayıttır (beklenmeyen ve 403 olmayan pozitif yanıt bulgudur)', () => {
      const uni = (S, st, cal, nPos) => is(S, 2, 'F/O/O/F') && rc(S, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === rowsOf(S, 'deny').filter((x) => x.status !== 0).length && rc(S, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(S, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === 0 && rc(S, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === nPos
        && S.ev.calibration.result === cal && S.ev.rows.length === VEC.all.length && S.ev.rows.filter((x) => x.status !== 0).every((x) => x.status === st && x.layerId !== 'UYGULAMA-API') && S.gt.filter((s) => s.status !== 0).every((s) => s.producer === 'edge' && s.status === st) && /^D8-HTTP-RET=FAIL$/m.test(S.log) && /^D8-KENAR-ENGELLEME=OLCULEMEYEN$/m.test(S.log) && /^D8-CIKIS=2$/m.test(S.log);
      const txt = U2b.evBytes.toString('utf8') + U2b.sumBytes.toString('utf8') + U2b.log; const NA = VEC.allow.length;
      const ok = uni(U2a, 404, 'YOK', NA) && U2a.ev.rows.every((x) => x.idObs === 'YOK') && rc(U2a, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === VEC.deny.length
        && uni(U2b, 301, 'YOK', NA) && rowsOf(U2b, 'deny').every((x) => x.outcome === 'YONLENDIRME-3XX') && !txt.includes('yonlendirme-hedefi') && !txt.includes('gizli')
        && uni(U2c, 401, 'YOK', 3) && rowsOf(U2c, 'allow').filter((x) => x.statusExpected).length === 6 && U2c.ev.calibration.apiWriteBack === 0 && U2c.ev.calibration.apiReplace === 0
        && uni(U2d, 404, 'GECERSIZ', NA) && U2d.gt.every((s) => s.echoed === 'other') && U2d.ev.calibration.apiEvidenceUsable === false && rowsOf(U2d, 'deny').every((x) => x.idSignal === 'DEGISTIRME' && x.layerId === 'OLCULEMEYEN')
        && uni(U2e, 404, 'GECERSIZ', NA) && U2e.ev.rows.every((x) => x.idObs === 'AYNEN' && x.layerId === 'OLCULEMEYEN') && U2e.gt.every((s) => s.echoed === 'same')
        && uni(U2f, 404, 'YOK', NA) && rc(U2f, 'httpReject', 'RET-VEKTORU-YANITSIZ') === 1 && U2f.ev.rows.filter((x) => x.status === 0).length === 1 && U2f.gt.filter((s) => s.producer === 'drop').length === 1
        && U1.code === 3 && V(U1).httpReject.value === 'PASS';
      return { ok, obs: `404: ${brief(U2a)} || 301: çıkış=${U2b.code} || 401: çıkış=${U2c.code}, pozitif=${V(U2c).positiveControl.value} [${reasonNames(U2c, 'positiveControl')}] || damgalı 404: çıkış=${U2d.code}, kalibrasyon=${U2d.ev.calibration.result} || yansıtılmış 404: çıkış=${U2e.code}, kalibrasyon=${U2e.ev.calibration.result} || 404 + taşıma hatası: çıkış=${U2f.code} [${reasonNames(U2f, 'httpReject')}]` };
    });
    const U3a = await scenario('uni200', { tag: 'u3a' }); const U3b = await scenario('pos404web', { tag: 'u3b' }); const U3c = await scenario('pos404all', { tag: 'u3c' }); const U3d = await scenario('uni404echo1', { tag: 'u3d' }); const U3e = await scenario('uni404one403', { tag: 'u3e' });
    item('U-3', 'tekdüze yanıtın KARDEŞ dalları: (a) 68/68 200 → ret vektörleri hiç reddedilmedi: HTTP / ret FAIL ve kenar engelleme FAIL (2xx ×59; API kanıtı aranmaz) + pozitif kontrol FAIL (token\'sız 200 ×6) · (b) yalnız üç web pozitifi 404, ret vektörleri 403 → HTTP / ret PASS, pozitif kontrol FAIL ×3, kenar engelleme OLCULEMEYEN · (c) dokuz pozitifin hepsi 404, ret vektörleri 403 → pozitif kontrol FAIL ×9 · (d) 68/68 404 ama bir ret yanıtını API üretmiş (değiştirme kanıtı; kalibrasyon YOK) → kenar engelleme FAIL (eksik kalibrasyon kanıtı silmez) · (e) 67 × 404 + bir ret vektörü 403 → HTTP / ret FAIL ×58; beşinde de çıkış 2', () => {
      const NA = VEC.allow.length; const ND = VEC.deny.length; const apiD = J(U3d).filter((p) => p.gt.producer === 'api');
      const ok = is(U3a, 2, 'F/F/O/F') && U3a.ev.rows.every((x) => x.status === 200) && rc(U3a, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === ND && rc(U3a, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && rc(U3a, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 6
        && is(U3b, 2, 'P/O/O/F') && rc(U3b, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 3 && V(U3b).positiveControl.reasons.length === 1 && rowsOf(U3b, 'deny').every((x) => x.outcome === 'RET-403') && U3b.ev.calibration.result === 'VAR' && U3b.ev.findings.length === 3 && rc(U3b, 'edgeBlocking', 'POZITIF-BEKLENDIGI-GIBI-DEGIL') === 3
        && is(U3c, 2, 'P/O/O/F') && rc(U3c, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === NA && rowsOf(U3c, 'deny').every((x) => x.status === 403) && rowsOf(U3c, 'allow').every((x) => x.status === 404 && x.idObs === 'YOK')
        && is(U3d, 2, 'F/F/F/F') && U3d.ev.rows.every((x) => x.status === 404) && apiD.length === 1 && apiD[0].gt.apiWrote === 'YENI' && apiD[0].row.layerId === 'UYGULAMA-API' && rc(U3d, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && U3d.ev.calibration.result === 'YOK' && rc(U3d, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === NA
        && is(U3e, 2, 'F/O/O/F') && rc(U3e, 'httpReject', 'RET-VEKTORUNE-403-DISI-YANIT') === ND - 1 && U3e.ev.rows.filter((x) => x.status === 403).length === 1 && U2a.code === 2;
      return { ok, obs: `200: ${brief(U3a)} || web pozitifleri 404: ${brief(U3b)} || bütün pozitifler 404: çıkış=${U3c.code} || 404 + bir API kanıtlı yanıt: ${brief(U3d)} || 404 + bir 403: çıkış=${U3e.code}` };
    });

    // ── Pozitif kontrol — API'ye geçmesine izin verilen yollar ayrı kayıttır ──
    const P1 = await scenario('pos200', { tag: 'p1' });
    item('P-1', 'pozitif vektörde beklenmeyen ve 403 olmayan yanıt (token\'sız GET → 200): pozitif kontrol FAIL (bulgu), çıkış 2; ret vektörlerinin hepsi 403 olduğu için HTTP / ret PASS kalır — pozitif bulgu ret alanlarına KARIŞMAZ (kenar engelleme FAIL değil; pozitifler beklendiği gibi olmadığından OLCULEMEYEN)', () => {
      const bad = rowsOf(P1, 'allow').filter((x) => !x.statusExpected); const ok = is(P1, 2, 'P/O/O/F') && bad.length === 1 && bad[0].status === 200 && rc(P1, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 1 && rowsOf(P1, 'deny').every((x) => x.status === 403) && P1.ev.findings.length === 1 && rc(P1, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === 0 && rc(P1, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 0 && V(P1).httpReject.reasons.length === 0;
      return { ok, obs: brief(P1) + ` · beklenmeyen pozitif=${bad.length}` };
    });
    const tmoEnv = Object.assign({ D8_HTTP_TIMEOUT_MS: '1500' }, env);
    const P2a = await scenario('mix2xxdrop', { tag: 'p2a' }); const P2b = await scenario('mix401hang', { tag: 'p2b', env: tmoEnv }); const P2c = await scenario('mixpos200drop', { tag: 'p2c' });
    item('P-2', 'ÖNCELİK — FAIL, ölçülemeyenin önündedir (çıkış 2); ölçülemeyen nedenler kayıtta kalır: (a) bir ret vektörü 200 (API üretti) + başka bir ret vektöründe bağlantı koptu → HTTP / ret FAIL ve kenar engelleme FAIL · (b) ret vektöründe API\'nin 401\'i + başka bir istek yanıtsız kaldı (zaman aşımı) → aynı · (c) pozitifte token\'sız 200 + bir ret vektöründe bağlantı koptu → pozitif kontrol FAIL, HTTP / ret OLCULEMEYEN (FAIL değil: doğrulanmış 403 dışı ret yanıtı yok); hata sınıfı (a, c) BAGLANTI · (b) ZAMAN-ASIMI; hata iletisi kanıtta yok', () => {
      const lost = (S, kind, cls) => { const j = J(S).filter((p) => p.gt.producer === kind); return j.length === 1 && j[0].row.status === 0 && j[0].row.outcome === 'SONUC-YOK' && j[0].row.errorClass === cls && j[0].row.layerId === 'SONUC-YOK' && rc(S, 'httpReject', 'RET-VEKTORU-YANITSIZ') === 1 && rc(S, 'edgeBlocking', 'YANITSIZ-VEKTOR') === 1 && S.sum.errorClassCounts[cls] === 1 && !('error' in j[0].row); };
      const txt = [P2a, P2b, P2c].map((S) => S.evBytes.toString('utf8').replace(/"originHost":\s*"[^"]*"/, '') + S.sumBytes.toString('utf8')).join('');
      const ok = is(P2a, 2, 'F/F/F/P') && rc(P2a, 'edgeBlocking', 'RET-VEKTORU-REDDEDILMEDI-2XX') === 1 && rc(P2a, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && lost(P2a, 'drop', 'BAGLANTI')
        && is(P2b, 2, 'F/F/F/P') && rc(P2b, 'edgeBlocking', 'API-YE-ULASTI-KANITLI') === 1 && lost(P2b, 'hang', 'ZAMAN-ASIMI')
        && is(P2c, 2, 'O/O/O/F') && rc(P2c, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 1 && lost(P2c, 'drop', 'BAGLANTI') && !/ECONNRESET|socket hang up|zaman aşımı|localhost|127\.0\.0\.1/i.test(txt);
      return { ok, obs: `2xx+kopma: ${brief(P2a)} || API 401+zaman aşımı: ${brief(P2b)} || pozitif 200+kopma: ${brief(P2c)}` };
    });
    const P3a = await scenario('pos403web', { tag: 'p3a' }); const P3b = await scenario('pos403api', { tag: 'p3b' });
    item('P-3', 'TEK bir pozitif vektör 403 aldı (tekdüze değil; ret vektörlerinin hepsi 403): (a) bir web pozitifi · (b) bir API pozitifi → ikisinde de pozitif kontrol OLCULEMEYEN (neden POZITIF-REDDEDILDI-403×1; bulgu değil), kenar engelleme OLCULEMEYEN (TEKDUZE-403 nedeni yok), HTTP / ret PASS; çıkış 3; (a)\'da kalibrasyon VAR kalır, (b)\'de o pozitif başlıksız olduğundan YOK', () => {
      const one = (S) => is(S, 3, 'P/O/O/O') && rc(S, 'positiveControl', 'POZITIF-REDDEDILDI-403') === 1 && V(S).positiveControl.reasons.length === 1 && rc(S, 'edgeBlocking', 'TEKDUZE-403') === 0 && rc(S, 'edgeBlocking', 'POZITIF-BEKLENDIGI-GIBI-DEGIL') === 1 && rowsOf(S, 'deny').every((x) => x.status === 403) && rowsOf(S, 'allow').filter((x) => x.status === 403).length === 1 && S.ev.findings.length === 0;
      return { ok: one(P3a) && one(P3b) && P3a.ev.calibration.result === 'VAR' && V(P3a).edgeBlocking.reasons.length === 1 && P3b.ev.calibration.result === 'YOK' && P3b.ev.calibration.apiReplace === 2, obs: `web: ${brief(P3a)} || API: ${brief(P3b)}` };
    });
    const P4a = await scenario('pos5xxweb', { tag: 'p4a' }); const P4b = await scenario('pos5xxapi', { tag: 'p4b' });
    item('P-4', 'pozitif vektörde API\'den geldiği KANITSIZ 5xx (kenar 502; ret vektörlerinin hepsi 403): (a) web pozitifinde · (b) API pozitifinde → pozitif kontrol OLCULEMEYEN (neden POZITIF-KANITSIZ-5XX-429×1) — bulgu değil, PASS değil; çıkış 3 (P-1: token\'sız 200 → FAIL)', () => {
      const one = (S) => { const bad = rowsOf(S, 'allow').filter((x) => !x.statusExpected); return is(S, 3, 'P/O/O/O') && bad.length === 1 && bad[0].status === 502 && bad[0].idObs === 'YOK' && rc(S, 'positiveControl', 'POZITIF-KANITSIZ-5XX-429') === 1 && rc(S, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 0 && rowsOf(S, 'deny').every((x) => x.status === 403) && S.ev.findings.length === 0; };
      return { ok: one(P4a) && one(P4b) && P4a.ev.calibration.result === 'VAR' && P1.code === 2, obs: `web: ${brief(P4a)} || API: ${brief(P4b)} · P-1 çıkış=${P1.code}` };
    });
    const P5a = await scenario('pos302web', { tag: 'p5a' });
    item('P-5', 'WEB pozitifinde beklenmeyen ve 403 olmayan yanıt (tekdüze değil; ret vektörlerinin hepsi 403, kalibrasyon VAR): (a) bir web pozitifi 302 + Location · (b) üç web pozitifi 404 (U-3b girdisi) → ikisinde de pozitif kontrol FAIL, çıkış 2 — pozitif bulgu yalnız API pozitifine özgü değildir; yönlendirme hedefi kanıta yazılmaz (P-1: API pozitifinde token\'sız 200)', () => {
      const bad = rowsOf(P5a, 'allow').filter((x) => !x.statusExpected); const bad404 = rowsOf(U3b, 'allow').filter((x) => !x.statusExpected); const txt = P5a.evBytes.toString('utf8') + P5a.sumBytes.toString('utf8') + P5a.log;
      const ok = is(P5a, 2, 'P/O/O/F') && bad.length === 1 && bad[0].status === 302 && bad[0].vectorClass === 'POZITIF-WEB' && bad[0].outcome === 'YONLENDIRME-3XX' && bad[0].idObs === 'YOK' && rc(P5a, 'positiveControl', 'POZITIF-BEKLENMEYEN-YANIT') === 1 && V(P5a).positiveControl.reasons.length === 1
        && rowsOf(P5a, 'deny').every((x) => x.outcome === 'RET-403') && P5a.ev.calibration.result === 'VAR' && P5a.ev.findings.length === 1 && P5a.gt.length === VEC.all.length && !txt.includes('yonlendirme-hedefi') && !txt.includes('gizli')
        && U3b.code === 2 && bad404.length === 3 && bad404.every((x) => x.status === 404 && x.vectorClass === 'POZITIF-WEB' && x.outcome === 'DORTYUZ-403-DISI') && P1.code === 2;
      return { ok, obs: `302: ${brief(P5a)} · beklenmeyen web pozitifi=${bad.length} || 404: çıkış=${U3b.code}, beklenmeyen web pozitifi=${bad404.length}` };
    });
    const G1 = await scenario('passall', { tag: 'g1' });
    item('G-1', 'zemin gerçeği (kenar HER isteği arka uca geçirir): API\'nin ara katmanıyla işlediği HER ret yanıtı (GECERSIZ-BICIM → yeni kimlik) UYGULAMA-API — yol sınıfından bağımsız (ör. büyük harfli önek); API\'nin BAŞLIKSIZ ürettiği yanıtlar (ön uçuş, çift eğik çizgi, çözülemeyen yüzde dizisi) OLCULEMEYEN — hiçbiri "API değil" diye sınıflanmaz; web\'in ürettiği yanıtlar OLCULEMEYEN (WEB-YOLU); API pozitiflerinde GECERLI-BICIM → OLCULEMEYEN (ayırt etmeyen gözlem), GECERSIZ-BICIM → UYGULAMA-API', () => {
      const j = J(G1); const apiH = j.filter((p) => p.gt.producer === 'api' && p.gt.apiWrote); const apiN = j.filter((p) => p.gt.producer === 'api' && !p.gt.apiWrote); const web = j.filter((p) => p.gt.producer === 'web');
      const wrong = j.filter((p) => p.row.layerId === 'API-DEGIL-CIKARIM' && p.gt.producer === 'api');
      const ok = is(G1, 2, 'F/F/F/P') && G1.ev.calibration.result === 'VAR' && apiH.length > 0 && apiH.filter((p) => p.row.group === 'deny').every((p) => p.gt.apiWrote === 'YENI' && p.row.layerId === 'UYGULAMA-API') && apiH.some((p) => p.row.group === 'deny' && p.row.pathClass !== 'API-KESIN')
        && apiH.filter((p) => p.row.group === 'allow').every((p) => (p.gt.apiWrote === 'AYNEN' ? p.row.layerWhy === 'AYIRT-ETMEYEN-GOZLEM' : p.row.layerId === 'UYGULAMA-API'))
        && apiN.length > 0 && apiN.some((p) => p.row.method !== 'OPTIONS' && p.gt.apiMw === 'ESLESMEZ') && apiN.some((p) => p.gt.apiMw === 'COZME-HATASI') && apiN.some((p) => p.gt.apiMw === 'CORS')
        && apiN.every((p) => p.row.layerId === 'OLCULEMEYEN') && web.length > 0 && web.every((p) => p.row.layerId === 'OLCULEMEYEN' && p.row.layerWhy === 'WEB-YOLU') && wrong.length === 0 && apiH.length + apiN.length + web.length === j.length;
      return { ok, obs: brief(G1) + ` · API başlıklı=${apiH.length} (kesin olmayan yolda ${apiH.filter((p) => p.row.pathClass !== 'API-KESIN').length}) · API başlıksız=${apiN.length} [${apiN.map((p) => p.gt.apiMw).join(',')}] · web=${web.length} · API yanıtına "API değil" denen=${wrong.length}` };
    });

    // ── Kapılar ──
    const mk = (o) => { const a = []; if (o.alias !== null) a.push('--alias', o.alias === undefined ? 'AD-1' : o.alias); if (o.vantage !== null) a.push('--vantage', o.vantage === undefined ? 'oz-test-yerel' : o.vantage); a.push('--origin', o.origin || ORIGIN); if (o.out !== null) a.push('--out', o.out || gateOut()); return a.concat(o.extra || []); };
    const badAliases = [null, 'AD-0', 'ad-1', 'AD-01', 'AD-1x', 'AD1', 'AD-1000', 'localhost']; const n1 = [];
    for (const al of badAliases) { const out = gateOut(); const g = await gate(mk({ alias: al, out })); n1.push({ al, code: g.code, seen: g.seen, wrote: fs.existsSync(out) }); }
    item('N-1', 'ad kimliği kapısı: --alias yok ya da AD-<n> biçiminde değil (AD-0, ad-1, AD-01, AD-1x, AD1, AD-1000, ana makine adı) → çıkış 4, kenara HİÇ istek gitmez, kanıt yazılmaz; geçerli ad kimliği (AD-27, tam kapsam yetkisi kaydıyla) ham kanıta ve adsız özete AYNEN yazılır', () => ({
      ok: n1.length === 8 && n1.every((x) => x.code === 4 && x.seen === 0 && !x.wrote) && S1b.code === 0 && S1b.ev.nameAlias === 'AD-27' && S1b.sum.nameAlias === 'AD-27' && /^D8-AD=AD-27$/m.test(S1b.log) && S1.ev.nameAlias === 'AD-1',
      obs: n1.map((x) => `${x.al === null ? '(yok)' : x.al}→${x.code}/${x.seen}`).join(' · ') + ` · AD-27 koşumu çıkış=${S1b.code}, kanıt=${S1b.ev && S1b.ev.nameAlias}` }));
    const n2a = await gate(mk({ extra: ['--origin', ORIGIN] })); const n2b = await gate(mk({ extra: ['--alias', 'AD-2'] })); const n2c = await gate(mk({ origin: 'https://' + ['sahte-ad', 'sahte-deger'].join(':') + `@localhost:${PORT}` })); // gerçek kimlik değil; "origin içinde kimlik bölümü" girdisi
    const n2d = await gate(mk({ alias: 'AD-2', extra: scopeArgs('AD-2').concat(scopeArgs('AD-2')) }));
    item('N-2', 'tek süreç = tek ad: ikinci --origin, ikinci --alias ya da ikinci --scope-record → çıkış 4, istek yok (çok adlı koşum parametresi yok); origin içinde kimlik bilgisi → çıkış 4', () => ({ ok: [n2a, n2b, n2c, n2d].every((g) => g.code === 4 && g.seen === 0), obs: `iki origin→${n2a.code}/${n2a.seen} · iki alias→${n2b.code}/${n2b.seen} · kimlikli origin→${n2c.code}/${n2c.seen} · iki kapsam kaydı→${n2d.code}/${n2d.seen}` }));
    const n3 = []; for (const va of [null, 'Canli Makine', 'x', 'a_b', `localhost:${PORT}`, 'a'.repeat(41)]) { const g = await gate(mk({ vantage: va })); n3.push({ va, code: g.code, seen: g.seen }); }
    item('N-3', 'konum etiketi kapısı: --vantage yok ya da biçime uymuyor (boşluk / büyük harf, tek karakter, alt çizgi, iki nokta, 41 karakter) → çıkış 4, istek yok; geçerli etiket ham kanıta ve özete beyan olarak yazılır', () => ({ ok: n3.length === 6 && n3.every((x) => x.code === 4 && x.seen === 0) && S1.ev.vantage === 'oz-test-yerel' && S1.sum.vantage === 'oz-test-yerel', obs: n3.map((x) => `${x.va === null ? '(yok)' : (x.va.length > 20 ? x.va.length + ' karakter' : x.va)}→${x.code}/${x.seen}`).join(' · ') }));
    const exOut = gateOut(); fs.writeFileSync(exOut, 'BASKA-ADIN-KANITI'); const n4a = await gate(mk({ out: exOut }));
    const exOut2 = gateOut(); fs.writeFileSync(exOut2.replace(/\.json$/, '.ozet.json'), 'BASKA-ADIN-OZETI'); const n4b = await gate(mk({ out: exOut2 }));
    item('N-4', 'var olan kanıt ya da özet dosyasının ÜZERİNE YAZMAZ (bir adın sonucu başka bir adın dosyasına taşınmaz): --out mevcut dosya → çıkış 4, istek yok, dosya içeriği aynı; özet yolu mevcut → çıkış 4, istek yok, ham kanıt da yazılmaz', () => ({
      ok: n4a.code === 4 && n4a.seen === 0 && fs.readFileSync(exOut, 'utf8') === 'BASKA-ADIN-KANITI' && n4b.code === 4 && n4b.seen === 0 && !fs.existsSync(exOut2) && fs.readFileSync(exOut2.replace(/\.json$/, '.ozet.json'), 'utf8') === 'BASKA-ADIN-OZETI',
      obs: `kanıt var→${n4a.code}/${n4a.seen} · özet var→${n4b.code}/${n4b.seen}` }));
    const o1out = gateOut(); const o1 = await gate(mk({ vantage: 'localhost-cikisi', out: o1out }));
    item('O-1', 'adsız özet kapısı: owner etiketi ana makine adını içeriyorsa (konum etiketi "localhost-cikisi", ad "localhost") sonda kapalı biçimde durur → çıkış 4, kenara HİÇ istek gitmez, kanıt ve özet yazılmaz', () => ({ ok: o1.code === 4 && o1.seen === 0 && !fs.existsSync(o1out) && !fs.existsSync(o1out.replace(/\.json$/, '.ozet.json')), obs: `çıkış=${o1.code} · istek=${o1.seen}` }));
    // O-1b — çok etiketli (çözülmeyen, ayrılmış .invalid) ad: ön denetim ağdan ÖNCEDİR; ağ gerektirmemesi için telefon listesi kipinde
    // ölçülür (ön denetim iki kipte de AYNI satırdır). Karşı girdi: adın hiçbir etiketini içermeyen etiket kapıdan geçer.
    const mlOrigin = 'https://portal.ornek-buro.invalid'; const o1b = [];
    for (const va of ['ornek-buro-cikisi', 'ornekburo-cikis', 'portal-ornek-buro-invalid-cikisi', 'x-portal-y', 'PORTAL.ORNEK-BURO.INVALID', 'oz-test-yerel']) { const g = await gate(['--alias', 'AD-1', '--origin', mlOrigin, '--vantage', va, '--phone-list']); o1b.push({ va, code: g.code, rej: /REDDEDİLDİ: konum etiketi/.test(g.log), list: (g.log.match(/^\s+\d\. https:\/\//gm) || []).length }); }
    item('O-1b', 'konum etiketinde adın PARÇASI (çok etiketli ad portal.ornek-buro.invalid; istek atılmaz): etiket adın bir etiketini (ornek-buro), tiresiz türevini (ornekburo), noktası tireye çevrilmiş tam adı, tek bir etiketini (portal) ya da tam adı içeriyorsa sonda durur → çıkış 4; adın hiçbir etiketini içermeyen etiket (oz-test-yerel) kapıdan geçer (çıkış 0, liste yazılır) — denetim yalnız tam dizgiyi değil etiketleri de arar', () => {
      const bad = o1b.slice(0, 5); const good = o1b[5];
      return { ok: o1b.length === 6 && bad.every((x) => x.code === 4 && x.rej && x.list === 0) && good.code === 0 && !good.rej && good.list === 5, obs: o1b.map((x) => `${x.va}→${x.code}`).join(' · ') };
    });
    const s5a = await gate(['--alias', 'AD-1', '--vantage', 'oz-test-yerel', '--origin', 'http://localhost:1', '--out', gateOut()]);
    item('S5-a', 'http origin → 4', () => ({ ok: s5a.code === 4 && s5a.seen === 0, obs: `çıkış=${s5a.code}` }));
    const s5b = await gate(mk({}), Object.assign({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, env));
    item('S5-b', 'TLS doğrulaması kapalı → 4', () => ({ ok: s5b.code === 4 && s5b.seen === 0, obs: `çıkış=${s5b.code}` }));
    const s5c = await gate(mk({ out: path.join(dir, 'yok', 'x.json') }));
    item('S5-c', 'kanıt yazılamaz (dizin yok) → 7 (ölçüm yapıldı, kanıt yazılamadı)', () => ({ ok: s5c.code === 7 && s5c.seen === VEC.all.length && !fs.existsSync(path.join(dir, 'yok')), obs: `çıkış=${s5c.code} · istek=${s5c.seen}` }));
    const s5d = await gate(mk({ out: null }));
    item('S5-d', '--out yok (ve --phone-list yok) → 4, istek yok', () => ({ ok: s5d.code === 4 && s5d.seen === 0, obs: `çıkış=${s5d.code} · istek=${s5d.seen}` }));
    const s5e = []; for (const t of ['abc', '0', '999999999', '1.5']) { const o = gateOut(); const g = await gate(mk({ out: o }), Object.assign({}, env, { D8_HTTP_TIMEOUT_MS: t })); s5e.push({ t, code: g.code, seen: g.seen, wrote: fs.existsSync(o) }); }
    item('S5-e', 'zaman aşımı ortam değeri (D8_HTTP_TIMEOUT_MS) geçersiz (sayı değil · 0 · sınır dışı · ondalık) → kapı çıkışı 4, istek yok, kanıt yok — sonda beklenmeyen biçimde (çıkış 1) durmaz; geçerli değer (1500) ile koşumlar ölçüm yapar (P-2b, S4)', () => ({
      ok: s5e.length === 4 && s5e.every((x) => x.code === 4 && x.seen === 0 && !x.wrote) && P2b.ev !== null && P2b.ev.rows.length === VEC.all.length, obs: s5e.map((x) => `${x.t}→${x.code}/${x.seen}`).join(' · ') }));
    const s6 = await gate(['--alias', 'AD-1', '--origin', ORIGIN, '--phone-list']); const s6b = await gate(mk({ extra: ['--phone-list'] }));
    item('S6', '--phone-list AYRI çağrıdır: 5 adres + telefon talimatı + "beyan" notu, ad kimliği başlıkta; kenara İSTEK ATMAZ, kanıt yazmaz; --out ile birlikte → çıkış 4; ölçüm koşumu (S1) telefon listesi YAZMAZ', () => ({
      ok: s6.code === 0 && (s6.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /beyan/i.test(s6.log) && /TELEFON — AD-1/.test(s6.log) && s6.seen === 0 && s6b.code === 4 && s6b.seen === 0 && !/TELEFON/.test(S1.log) && !/^\s+\d\. https:\/\//m.test(S1.log),
      obs: `liste çıkış=${s6.code} · adres=${(s6.log.match(/^\s+\d\. https:\/\//gm) || []).length} · istek=${s6.seen} · --out ile→${s6b.code} · S1 çıktısında liste=${/TELEFON/.test(S1.log)}` }));

    // ── KAPSAM YETKİSİ KAPISI (AD-1 dışındaki her ad kimliği) — sentetik kayıt / kanıt dosyalarıyla ──
    /** Kapsam yetkisi denemesi: AD-2 (ya da verilen ad) + verilen kayıt; dönen: çıkış, istek sayısı, ileti satırları, neden sınıfı, kanıt yazıldı mı. */
    const sa = async (rec, o) => { o = o || {}; const out = gateOut(); const extra = o.recordPath ? ['--scope-record', o.recordPath] : (rec === null ? [] : ['--scope-record', (typeof rec === 'string' && fs.existsSync(rec)) ? rec : mkRec(rec)]);
      const g = await gate(mk({ alias: o.alias || 'AD-2', out, extra })); const lines = g.log.split(/\r?\n/).filter(Boolean);
      return { code: g.code, seen: g.seen, first: lines[0] || '', why: (/^D8-KAPSAM-YETKISI=RET neden=([A-Z-]+)$/m.exec(g.log) || [])[1] || null, wrote: fs.existsSync(out) || fs.existsSync(out.replace(/\.json$/, '.ozet.json')), log: g.log, out }; };
    /** RET ölçütü: istek YOK, kanıt YOK, çıkış 4, ilk satır TAM olarak sabit metin, neden sınıfı beklenen; iletide ad / yol / özet değeri yok. */
    const refused = (r, why) => r.code === 4 && r.seen === 0 && !r.wrote && r.first === REFUSAL && r.why === why && !/localhost|kapsam[\\/]|\.txt|[0-9A-Fa-f]{64}/.test(r.log);
    const flip = (h) => (h[0] === '0' ? '1' : '0') + h.slice(1);
    const sa1 = await sa(null);
    item('SA-1', 'kapsam yetkisi kaydı YOK (AD-2, --scope-record verilmedi; origin ve diğer bütün parametreler geçerli): sonda KOŞMAZ — çıkış 4, kenara HİÇ istek gitmez, kanıt / özet yazılmaz; ileti tam olarak "KOŞULMADI — kapsam yetkisi doğrulanmadı" (+ neden sınıfı KAYIT-YOK); aynı parametrelerle AD-1 kapıya takılmaz (S1 koştu)', () => ({ ok: refused(sa1, 'KAYIT-YOK') && S1.code === 0 && S1.gt.length === VEC.all.length, obs: `çıkış=${sa1.code} · istek=${sa1.seen} · ileti="${sa1.first}" · neden=${sa1.why} · AD-1 (kayıtsız) çıkış=${S1.code}` }));
    const sa2a = await sa(fullRec('AD-2', { items: [itm(T_T, evT)] })); const sa2b = await sa(fullRec('AD-2', { items: [itm(T_T, evT), itm(P_T, evP)] })); const sa2c = await sa(fullRec('AD-2', { items: [itm(T_T, evT), itm(D_T, evD)] })); const sa2d = await sa(fullRec('AD-2', { items: [itm(P_T, evP)] }));
    item('SA-2', 'YALNIZ TÜNEL KAYDI sunulmuş (kanıt dosyası var, özeti tutuyor, ad kimliği ve ana makine doğru) → RET (neden YALNIZ-TUNEL-KAYDI); tünel kaydı + iki zorunlu kalemden yalnız biri (sağlayıcı hesabı kaydı VAR, DNS zinciri yok · DNS zinciri VAR, sağlayıcı hesabı kaydı yok) ve tek başına sağlayıcı hesabı kaydı → RET (KALEM-EKSIK): tünel kaydı eksik kalemin yerine geçmez; dördünde de istek yok', () => ({
      ok: refused(sa2a, 'YALNIZ-TUNEL-KAYDI') && refused(sa2b, 'KALEM-EKSIK') && refused(sa2c, 'KALEM-EKSIK') && refused(sa2d, 'KALEM-EKSIK'), obs: `yalnız tünel→${sa2a.code}/${sa2a.seen} ${sa2a.why} · tünel+sağlayıcı→${sa2b.why} · tünel+DNS→${sa2c.why} · yalnız sağlayıcı→${sa2d.why}` }));
    const evChanged = mkEv('dns-zinciri-sonradan-degisti.txt', 'SENTETIK (oz-test): DNS zinciri — ilk hali\n'); const recChanged = fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evChanged)] }); fs.writeFileSync(evChanged.file, 'SENTETIK (oz-test): DNS zinciri — kayittan SONRA degistirildi\n');
    const evEmpty = { file: path.join(scopeDir, 'bos-kanit.txt'), sha256: sha(Buffer.alloc(0)) }; fs.writeFileSync(evEmpty.file, '');
    const sa3a = await sa(fullRec('AD-2', { items: [itm(P_T, evP, { sha256: flip(evP.sha256) }), itm(D_T, evD)] })); const sa3b = await sa(recChanged); const sa3c = await sa(fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, { file: path.join(scopeDir, 'olmayan-dosya.txt'), sha256: evD.sha256 })] }));
    const sa3d = await sa(fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evEmpty)] })); const sa3e = await sa(fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evD), itm(T_T, evT, { sha256: flip(evT.sha256) })] }));
    item('SA-3', 'kanıt dosyası ÖLÇÜLÜR ("alan dolu mu" değil): (a) kayıttaki SHA-256 dosyanın özetini tutmuyor (tek onaltılık hane farklı) → RET (OZET-TUTMUYOR) · (b) dosya kayıttan SONRA değiştirilmiş → RET (OZET-TUTMUYOR) · (c) kanıt dosyası yok → RET (KANIT-DOSYASI-YOK) · (d) kanıt dosyası boş (özeti "tutuyor") → RET (KANIT-DOSYASI-BOS) · (e) iki zorunlu kalem tam ama ek tünel kaleminin özeti tutmuyor → yine RET: listelenen HER kalem ölçülür; beşinde de istek yok', () => ({
      ok: refused(sa3a, 'OZET-TUTMUYOR') && refused(sa3b, 'OZET-TUTMUYOR') && refused(sa3c, 'KANIT-DOSYASI-YOK') && refused(sa3d, 'KANIT-DOSYASI-BOS') && refused(sa3e, 'OZET-TUTMUYOR'), obs: `özet farklı→${sa3a.code}/${sa3a.seen} ${sa3a.why} · sonradan değişti→${sa3b.why} · dosya yok→${sa3c.why} · boş dosya→${sa3d.why} · ek kalem özeti→${sa3e.why}` }));
    const sa4 = []; for (const h of ['baska-ad.invalid', 'alt.localhost', 'localhost.', `localhost:${PORT}`, 'xlocalhost', '', null]) sa4.push({ h, r: await sa(fullRec('AD-2', { originHost: h })) });
    item('SA-4', 'ANA MAKİNE BAĞI: kayıttaki ana makine sondanın origin ana makinesiyle BİREBİR aynı değil (başka ad · alt alan · sondaki nokta · port ekli · önek ekli · boş · yok) → yedisinde de RET (ANA-MAKINE-UYUSMUYOR), istek yok — bir adın kaydı başka bir ada (alt alanına bile) taşınamaz', () => ({
      ok: sa4.length === 7 && sa4.every((x) => refused(x.r, 'ANA-MAKINE-UYUSMUYOR')), obs: sa4.map((x) => `${x.h === null ? '(yok)' : (x.h === '' ? '(boş)' : x.h.replace(/localhost/g, '<ad>').replace(String(PORT), '<port>'))}→${x.r.code}/${x.r.seen} ${x.r.why}`).join(' · ') }));
    const sa5a = await sa(fullRec('AD-3')); const sa5b = await sa(recFor['AD-27'] || mkRec(fullRec('AD-27'))); const sa5c = await sa(fullRec('AD-1'));
    item('SA-5', 'AD KİMLİĞİ BAĞI: kayıt başka bir ad kimliği için düzenlenmiş (AD-3 kaydı · AD-27\'nin geçerli kaydı · AD-1 yazan kayıt), sonda AD-2 ile çağrılıyor → üçünde de RET (AD-KIMLIGI-UYUSMUYOR), istek yok — bir ad kimliğinin kaydı başka bir kimlikle kullanılamaz', () => ({
      ok: refused(sa5a, 'AD-KIMLIGI-UYUSMUYOR') && refused(sa5b, 'AD-KIMLIGI-UYUSMUYOR') && refused(sa5c, 'AD-KIMLIGI-UYUSMUYOR'), obs: `AD-3 kaydı→${sa5a.code}/${sa5a.seen} ${sa5a.why} · AD-27 kaydı→${sa5b.why} · AD-1 yazan kayıt→${sa5c.why}` }));
    const SA6 = await scenario('ok', { tag: 'sa6', alias: 'AD-4' }); const recUpper = mkRec(fullRec('AD-5', { originHost: 'LOCALHOST', items: [itm(P_T, evP, { file: path.basename(evP.file) }), itm(D_T, evD, { sha256: evD.sha256.toLowerCase() }), itm(T_T, evT)] })); recFor['AD-5'] = recUpper; const SA6b = await scenario('ok', { tag: 'sa6b', alias: 'AD-5' });
    item('SA-6', 'TAM KAYIT (ad kimliği aynı · ana makine birebir · iki zorunlu kalem: sağlayıcı hesabı kaydı + DNS zinciri; her birinin dosyası var ve özeti tutuyor · tarih geçerli): sonda KOŞAR — 68 istek, sağlıklı kenarda çıkış 0; ham kanıtta ve adsız özette kapsam yetkisi YALNIZ durum (DOGRULANDI) + kalem türleri; kayıt yolu, kanıt dosyası yolu / adı, özet değeri, tarih ve ana makine adı ne ham kanıtın kapsam alanında ne adsız özette ne çıktıda; çıktıda D8-KAPSAM-YETKISI=DOGRULANDI. Karşı biçimler de geçer: ana makine büyük harfle, kayıt dizinine göreli dosya yolu, küçük harfli özet, ek tünel kalemi (türü listeye girer)', () => {
      const noTime = (t) => t.replace(/"(startedAt|finishedAt)":\s*"[^"]*"/g, ''); // zaman alanları bugünün tarihini taşır (kanıt tarihiyle aynı gün) — ayıklanır
      const sc = SA6.ev.scopeAuthorization; const txtSum = noTime(SA6.sumBytes.toString('utf8')); const scRaw = JSON.stringify(sc); const leak = (t) => t.includes(evP.sha256) || t.toLowerCase().includes(evD.sha256.toLowerCase()) || /saglayici-hesabi-kaydi|dns-zinciri\.txt|kayit-\d+\.json|kapsam[\\/]/.test(t) || t.includes(today);
      const ok = is(SA6, 0, 'P/P/O/P') && SA6.gt.length === VEC.all.length && sc && Object.keys(sc).sort().join() === 'itemTypes,required,status' && sc.required === true && sc.status === 'DOGRULANDI' && JSON.stringify(sc.itemTypes) === JSON.stringify([D_T, P_T])
        && JSON.stringify(SA6.sum.scopeAuthorization) === scRaw && !leak(txtSum) && !leak(scRaw) && !leak(SA6.log) && !leak(noTime(SA6.evBytes.toString('utf8')))
        && /^D8-KAPSAM-YETKISI=DOGRULANDI$/m.test(SA6.log) && /^D8-AD=AD-4$/m.test(SA6.log) && !txtSum.toLowerCase().includes('localhost')
        && is(SA6b, 0, 'P/P/O/P') && SA6b.gt.length === VEC.all.length && JSON.stringify(SA6b.ev.scopeAuthorization.itemTypes) === JSON.stringify([D_T, P_T, T_T]) && S1.ev.scopeAuthorization.status === 'KAPI-YOK-BIRINCIL-AD' && S1.ev.scopeAuthorization.required === false;
      return { ok, obs: `tam kayıt: çıkış=${SA6.code} · istek=${SA6.gt.length} · kapsam alanı=${scRaw} · özette sızıntı=${leak(txtSum)} || karşı biçimler: çıkış=${SA6b.code} · türler=${SA6b.ev && JSON.stringify(SA6b.ev.scopeAuthorization.itemTypes)} · AD-1=${S1.ev.scopeAuthorization.status}` };
    });
    const evPcopy = mkEv('saglayici-kaydinin-kopyasi.txt', fs.readFileSync(evP.file)); const tomorrow2 = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const sa7 = [['aynı dosya iki kalemde', fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evP)] }), 'AYNI-KANIT-IKI-KALEMDE'], ['aynı içerik iki ayrı dosyada', fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evPcopy)] }), 'AYNI-KANIT-IKI-KALEMDE'],
      ['gelecekteki tarih', fullRec('AD-2', { items: [itm(P_T, evP, { date: tomorrow2 }), itm(D_T, evD)] }), 'KALEM-BICIMI-GECERSIZ'], ['geçersiz tarih', fullRec('AD-2', { items: [itm(P_T, evP, { date: '2026-13-40' }), itm(D_T, evD)] }), 'KALEM-BICIMI-GECERSIZ'], ['tarih yok', fullRec('AD-2', { items: [itm(P_T, evP, { date: undefined }), itm(D_T, evD)] }), 'KALEM-BICIMI-GECERSIZ'],
      ['özet 64 hane değil', fullRec('AD-2', { items: [itm(P_T, evP, { sha256: evP.sha256.slice(0, 40) }), itm(D_T, evD)] }), 'KALEM-BICIMI-GECERSIZ'], ['tanınmayan kalem türü', fullRec('AD-2', { items: [itm(P_T, evP), itm(D_T, evD), itm('BEYAN', evT)] }), 'KALEM-BICIMI-GECERSIZ'], ['kalem listesi boş', fullRec('AD-2', { items: [] }), 'KALEM-BICIMI-GECERSIZ'],
      ['kayıt türü yanlış', fullRec('AD-2', { record: 'BASKA-KAYIT' }), 'KAYIT-BICIMI-GECERSIZ'], ['kayıt JSON değil', 'bu bir JSON degil', 'KAYIT-OKUNAMADI']];
    const sa7r = []; for (const [name, rec, why] of sa7) sa7r.push({ name, why, r: await sa(rec) });
    const sa7x = await sa(null, { recordPath: path.join(scopeDir, 'olmayan-kayit.json') });
    item('SA-7', 'BİÇİMSEL HİLELER kapıdan geçmez (hepsinde ad kimliği ve ana makine DOĞRU; istek yok): aynı dosya iki zorunlu kalemde · aynı içerik iki ayrı dosyada (tek kanıtın iki ada bölünmesi) → AYNI-KANIT-IKI-KALEMDE · gelecekteki tarih · geçersiz tarih · tarih yok · özet 64 hane değil · tanınmayan kalem türü · boş kalem listesi → KALEM-BICIMI-GECERSIZ · kayıt türü yanlış → KAYIT-BICIMI-GECERSIZ · kayıt JSON değil / kayıt dosyası yok → KAYIT-OKUNAMADI', () => ({
      ok: sa7r.length === 10 && sa7r.every((x) => refused(x.r, x.why)) && refused(sa7x, 'KAYIT-OKUNAMADI'), obs: sa7r.map((x) => `${x.name}→${x.r.code}/${x.r.seen} ${x.r.why}`).join(' · ') + ` · kayıt dosyası yok→${sa7x.why}` }));
    const sa8a = await gate(mk({ alias: 'AD-1', extra: ['--scope-record', recFor['AD-2']] })); const sa8b = await gate(['--alias', 'AD-2', '--origin', ORIGIN, '--phone-list']); const sa8c = await gate(['--alias', 'AD-2', '--origin', ORIGIN, '--phone-list'].concat(scopeArgs('AD-2')));
    item('SA-8', 'kapının sınırları: (a) AD-1 için kapı yoktur ve kayıt VERİLMEZ — AD-1 ile --scope-record birlikte → çıkış 4, istek yok (kayıt sessizce yok sayılmaz) · (b) telefon listesi çağrısında da kapı geçerlidir: AD-2 kayıtsız → çıkış 4, ileti aynı sabit metin, adres listesi YAZILMAZ · (c) AD-2 tam kayıtla → liste yazılır (5 adres), istek yok', () => ({
      ok: sa8a.code === 4 && sa8a.seen === 0 && /REDDEDİLDİ: --scope-record yalnız AD-1 dışındaki/.test(sa8a.log) && sa8b.code === 4 && sa8b.seen === 0 && sa8b.log.split(/\r?\n/)[0] === REFUSAL && !/^\s+\d\. https:\/\//m.test(sa8b.log) && sa8c.code === 0 && sa8c.seen === 0 && (sa8c.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /TELEFON — AD-2/.test(sa8c.log),
      obs: `AD-1 + kayıt→${sa8a.code}/${sa8a.seen} · telefon listesi AD-2 kayıtsız→${sa8b.code} · AD-2 tam kayıtla→${sa8c.code}, adres=${(sa8c.log.match(/^\s+\d\. https:\/\//gm) || []).length}` }));

    // ── Bütün koşumlarda değişmezler (zemin gerçeğiyle) ve çıkış kodu eşlemesi ──
    item('GT-1', 'DEĞİŞMEZLER — paket sondasının sahte kenara karşı BÜTÜN koşumlarında (zemin gerçeğiyle): (1) dört alanın her biri yalnız PASS / FAIL / OLCULEMEYEN · (2) her satırın kimlik anlamı, kenarın gördüğü kimlik (kaynak deseni kabul eder mi) × kenarın yazdığı yanıt değerinden BAĞIMSIZ türetilenle aynı · (3) API\'nin "değiştirme" ile üretmediği HİÇBİR yanıt UYGULAMA-API sayılmaz (SINIR-1 kaydı hariç) · (4) API\'nin ürettiği HİÇBİR yanıt "API değil" sayılmaz (SINIR-2 kaydı hariç) · (5) katman doğrulaması hiçbir koşumda PASS değil (bu vektör kümesinde doğrulanamayan satırlar var) · (6) kenar engelleme PASS ise: HTTP / ret PASS, pozitif kontrol PASS, kalibrasyon VAR, neden yok, hiçbir yanıtta azaltım işareti yok, bütün ret yanıtlarını kenar üretmiş (SINIR-2 hariç), hiçbir ret yanıtında ve modelin "API yazamaz" dediği hiçbir yanıtta kimlik başlığı yok · (7) HTTP / ret değeri ret vektörlerinin durum kodlarından bağımsız türetilenle aynı · (8) bir ret vektörü 2xx aldıysa kenar engelleme FAIL · (9) kanıtta / çıktıda "karar bekliyor" ya da "değerlendirme gerekir" yok', () => {
      const bad = [];
      for (const S of ALL) {
        try {
          const j = J(S); const v = vals(S); const d = j.filter((p) => p.row.group === 'deny'); const st = d.map((p) => p.gt.status);
          if (!v.every((x) => FIELD_VALUES.includes(x))) bad.push(S.tag + ':alan-degeri');
          if (!j.every((p) => p.row.idSignal === gtSignal(p.gt))) bad.push(S.tag + ':kimlik-anlami');
          if (S.limit !== 'SINIR-1' && j.some((p) => p.row.layerId === 'UYGULAMA-API' && !(p.gt.producer === 'api' && p.gt.apiWrote === 'YENI' && p.gt.echoed === 'other'))) bad.push(S.tag + ':API-olmayan-API-sayildi');
          if (S.limit !== 'SINIR-2' && j.some((p) => p.row.layerId === 'API-DEGIL-CIKARIM' && p.gt.producer === 'api')) bad.push(S.tag + ':API-yaniti-API-degil-sayildi');
          if (v[2] === 'PASS') bad.push(S.tag + ':katman-PASS');
          if (v[1] === 'PASS' && !(v[0] === 'PASS' && v[3] === 'PASS' && S.ev.calibration.result === 'VAR' && V(S).edgeBlocking.reasons.length === 0 && j.every((p) => p.gt.mark === 'YOK') && (S.limit === 'SINIR-2' || d.every((p) => p.gt.producer === 'edge')))) bad.push(S.tag + ':kenar-PASS-kosulsuz');
          // Kenar engelleme PASS ise zemin gerçeğinde: hiçbir ret yanıtı kimlik başlığı taşımıyor ve modelin "API yazamaz" dediği hiçbir yanıtta (ön uçuş · ara katmanla eşleşmeyen / çözülemeyen yol) kimlik başlığı yok.
          if (v[1] === 'PASS' && !(d.every((p) => p.gt.echoed === 'none') && j.every((p) => apiMw(p.gt.method, p.gt.url) === 'CALISIR' || p.gt.echoed === 'none'))) bad.push(S.tag + ':kenar-PASS-ama-yabanci-kimlik-basligi');
          const wantH = st.some((s) => s !== 0 && s !== 403) ? 'FAIL' : (st.some((s) => s === 0) ? 'OLCULEMEYEN' : 'PASS'); if (v[0] !== wantH) bad.push(S.tag + ':http-ret');
          if (st.some((s) => s >= 200 && s < 300) && v[1] !== 'FAIL') bad.push(S.tag + ':2xx-kenar-FAIL-degil');
          if (/KARAR-BEKLIYOR|pendingOwnerDecision|DEGERLENDIRME|OWNER KARARI BEKL/i.test(S.log + S.evBytes.toString('utf8') + S.sumBytes.toString('utf8'))) bad.push(S.tag + ':karar-bekliyor');
        } catch (e) { bad.push(S.tag + ':DEGERLENDIRILEMEDI'); }
      }
      return { ok: ALL.length >= 78 && bad.length === 0 && ALL.filter((S) => S.limit).length === 2, obs: `taranan koşum=${ALL.length} · ihlal=${bad.length}${bad.length ? ' [' + bad.slice(0, 8).join(' ') + ']' : ''} · sınır kaydı=${ALL.filter((S) => S.limit).length}` };
    });
    item('X-1', 'ÇIKIŞ KODU EŞLEMESİ (bütün koşumlarda; eşleme bu dosyada bağımsız yazılıdır): herhangi bir alan FAIL (pozitif kontrol dahil) → 2 · FAIL yok ve kenar engelleme PASS → 0 · diğer her durum → 3; sürecin çıkış kodu = ham kanıt = adsız özet = D8-CIKIS satırı; çıktıdaki dört alan satırı kanıttaki değerlerle aynı; üç kod da (0, 2, 3) gözlendi; 5 (ya da başka bir kod) HİÇ üretilmedi; çıkış 2 veren koşumlar arasında yalnız durum kodu ölçütü FAIL olan, yalnız kenar engelleme + katman FAIL olan ve yalnız pozitif kontrol FAIL olan ayrı ayrı var', () => {
      const bad = []; const codes = new Set(); const shapes = new Set();
      for (const S of ALL) {
        try {
          const v = vals(S); codes.add(S.code); if (S.code === 2) shapes.add(v.map((x) => (x === 'FAIL' ? 'F' : '-')).join(''));
          const line = (k) => (new RegExp('^' + k + '=(.*)$', 'm').exec(S.log) || [])[1];
          if (S.code !== exitOf(v) || S.ev.exitCode !== S.code || S.sum.exitCode !== S.code || line('D8-CIKIS') !== String(S.code)) bad.push(S.tag + ':kod');
          if (line('D8-HTTP-RET') !== v[0] || line('D8-KENAR-ENGELLEME') !== v[1] || line('D8-KATMAN-DOGRULAMA') !== v[2] || line('D8-POZITIF-KONTROL') !== v[3]) bad.push(S.tag + ':satir');
          if (JSON.stringify(FIELDS.map((f) => S.sum.nameVerdict[f].value)) !== JSON.stringify(v)) bad.push(S.tag + ':ozet');
        } catch (e) { bad.push(S.tag + ':DEGERLENDIRILEMEDI'); }
      }
      const ok = bad.length === 0 && [...codes].sort().join() === '0,2,3' && shapes.has('F---') && shapes.has('-FF-') && shapes.has('---F') && shapes.has('FFF-');
      return { ok, obs: `taranan koşum=${ALL.length} · ihlal=${bad.length}${bad.length ? ' [' + bad.slice(0, 8).join(' ') + ']' : ''} · görülen çıkış kodları=${[...codes].sort().join(',')} · çıkış 2 biçimleri (http·kenar·katman·pozitif)=${[...shapes].sort().join(' ')}` };
    });

    // X-2 — katman doğrulaması alanına tanınmayan bir değer yazan sonda KOPYASI (yalnız o ifade değişti); sağlıklı kenar.
    const x2probe = path.join(dir, 'd8-staff-surface-probe.deger.js'); const x2src = src.replace('const layerVerification = { value: L.close(complete && notApi.length === deny.length),', () => "const layerVerification = { value: 'BILINMIYOR',"); fs.writeFileSync(x2probe, x2src);
    const X2r = await scenario('ok', { tag: 'x2', probe: x2probe, noInv: true });
    item('X-2', 'TANINMAYAN alan değeri hiçbir koşulda çıkış 0 vermez: bir alana (katman doğrulaması) tanınmayan bir değer yazan sonda kopyası, sağlıklı kenarda — HTTP / ret PASS, kenar engelleme PASS, pozitif kontrol PASS (asıl sonda aynı girdide çıkış 0) → çıkış 3, 0 DEĞİL: çıkış kodu işlevi dört alanın hepsi PASS / FAIL / OLCULEMEYEN kümesinde değilse "kapalı" saymaz', () => {
      const v = X2r.ev ? X2r.ev.nameVerdict : null;
      const ok = x2src !== src && X2r.code === 3 && !!v && X2r.ev.exitCode === 3 && v.httpReject.value === 'PASS' && v.edgeBlocking.value === 'PASS' && v.positiveControl.value === 'PASS' && v.layerVerification.value === 'BILINMIYOR' && X2r.gt.length === VEC.all.length && /^D8-CIKIS=3$/m.test(X2r.log) && S1.code === 0;
      return { ok, obs: `kopya değişti=${x2src !== src} · çıkış=${X2r.code} · alanlar=${v ? FIELDS.map((f) => v[f].value).join('/') : '?'} · S1 çıkış=${S1.code}` };
    });

    // ── Adsız özet ve vektör kümesi kimliği ──
    const SUMMARY_KEYS = ['record', 'revision', 'nameAlias', 'vantage', 'probeSha256', 'vectorSetId', 'scopeAuthorization', 'vectorCounts', 'requestProfile', 'coverage', 'outcomeCounts', 'errorClassCounts', 'idSignalCounts', 'layerCounts', 'calibration', 'nameVerdict', 'exitCodeMap', 'startedAt', 'finishedAt', 'exitCode'].sort().join();
    const longPaths = Array.from(new Set(VEC.all.map((v) => v.url.split('?')[0]).filter((p) => p.length >= 4)));
    const summaryClean = (S) => {
      const t = S.sumBytes.toString('utf8'); const low = t.toLowerCase(); const keys = []; (function walk(o) { if (o && typeof o === 'object') for (const k of Object.keys(o)) { keys.push(k); walk(o[k]); } })(S.sum);
      const d = rowsOf(S, 'deny'); const oc = S.sum.outcomeCounts.deny; const lc = S.sum.layerCounts.deny; const ic = S.sum.idSignalCounts.deny; const sum = (m) => Object.keys(m).reduce((a, k) => a + m[k], 0);
      return !low.includes('localhost') && !low.includes('127.0.0.1') && !/https?:\/\//.test(low) && longPaths.every((p) => !t.includes(p)) && !/d8probe|x=1|%2f|%61/i.test(t) && !/cloudflare|caddy|cf-ray|cf-mitigated/i.test(t)
        && sum(ic) === d.length && ic.DEGISTIRME === d.filter((x) => x.idSignal === 'DEGISTIRME').length && ic.YANSIMA === d.filter((x) => x.idSignal === 'YANSIMA').length && ic['YABANCI-KIMLIK'] === d.filter((x) => x.idSignal === 'YABANCI-KIMLIK').length
        && ic.DEGISTIRME === S.gt.filter((s, i) => S.ev.rows[i].group === 'deny' && gtSignal(s) === 'DEGISTIRME').length
        && Object.keys(S.sum).sort().join() === SUMMARY_KEYS && !keys.some((k) => /^(rows|findings|path|method|name|originHost|ifPassed|hints|layerHint|hintsOnly|error|message|location|requestId|sent|file|sha256|date)$/i.test(k))
        && !/ECONN|ENOTFOUND|getaddrinfo|connect |certificate|self.signed/i.test(t) && S.sum.probeSha256 === sha(fs.readFileSync(S.probe || PROBE)) && S.sum.revision === 'R05' && S.sum.exitCode === S.code
        && Object.keys(S.sum.nameVerdict).sort().join() === FIELDS.slice().sort().join() && FIELDS.every((f) => S.sum.nameVerdict[f].value === V(S)[f].value && S.sum.nameVerdict[f].reasons.length === V(S)[f].reasons.length && S.sum.nameVerdict[f].reasons.every((r) => Object.keys(r).sort().join() === 'count,reason,value'))
        && JSON.stringify(S.sum.nameVerdict.layerVerification.coverage) === JSON.stringify(V(S).layerVerification.coverage) && Object.keys(S.sum.scopeAuthorization).sort().join() === 'itemTypes,required,status'
        && oc['RET-403'] + oc['SINAMA-ISARETLI-403'] + oc['TANINMAYAN-AZALTIM-ISARETLI-403'] === d.filter((x) => x.status === 403).length && oc['SINAMA-ISARETLI-403'] === S.gt.filter((s, i) => S.ev.rows[i].group === 'deny' && s.challenge).length
        && sum(oc) === d.length && sum(lc) === d.length && lc['UYGULAMA-API'] === d.filter((x) => x.layerId === 'UYGULAMA-API').length && S.sum.vectorCounts.total === S.ev.rows.length && JSON.stringify(S.sum.calibration) === JSON.stringify(S.ev.calibration);
    };
    item('O-2', 'adsız özet (sağlıklı · sızıntılı [AD-2] · yönlendirmeli · API\'nin 403\'ü · tekdüze 403 · yansıtan katman · sınama işaretli · damgalayan katman + sızıntı · taşıma hatalı · kapsam yetkisi kayıtlı koşumlarda): ana makine adı / adres / URL yok; vektör yollarının hiçbiri yok; satır, bulgu listesi, hata metni, yönlendirme hedefi, ipucu, sağlayıcı / kenar adı, gönderilen kimlik, kanıt dosyası yolu / özeti / tarihi alanı yok; üst düzey alan kümesi sabit; sondanın SHA-256\'sı, ad kimliği, dört alan (nedenleri yalnız değer + neden + sayı), katman kapsam sayısı, çıkış kodu, durum / kimlik anlamı / katman sayıları ham kanıtla ve zemin gerçeğiyle uyumlu', () => {
      const list = [S1, S2, L5, A1, U1, R2a, S3ch, M2, P2a, P2b, SA6]; const res = list.map((S) => { try { return summaryClean(S); } catch (e) { return false; } });
      return { ok: res.every(Boolean) && list.length === 11, obs: list.map((S, i) => `${S.tag}=${res[i]}`).join(' · ') };
    });
    item('O-3', 'adsız özetin SHA-256\'sı: sondanın yazdırdığı D8-OZET-SHA256 = özet dosyasının bağımsız hesaplanan SHA-256\'sı = ham kanıttaki summary.sha256; içerik değişince (S1 ↔ S2) özet de değişir; ham kanıtın özeti hiçbir yere yazılmaz', () => {
      const line = (S) => (/^D8-OZET-SHA256=([0-9A-F]{64})$/m.exec(S.log) || [])[1]; const a = sha(S1.sumBytes); const b = sha(S2.sumBytes);
      const rawHashes = [sha(S1.evBytes), sha(S2.evBytes)]; const txt = S1.log + S2.log + S1.sumBytes.toString('utf8') + S2.sumBytes.toString('utf8');
      return { ok: line(S1) === a && line(S2) === b && a !== b && S1.ev.summary.sha256 === a && S1.ev.summary.written === true && S2.ev.summary.sha256 === b && rawHashes.every((h) => !txt.toUpperCase().includes(h)), obs: `S1 satır=bağımsız: ${line(S1) === a} · S2: ${line(S2) === b} · farklı=${a !== b}` };
    });
    item('V-1', 'vektör kümesi kimliği kaynaktan BAĞIMSIZ hesapla eşleşir: sondanın kaynak metnindeki 59 + 9 vektörden ("grup yöntem hamYol beklenenKodlar" satırlarının SHA-256\'sı) bu dosyada hesaplanan değer = ham kanıt = adsız özet; kenarın gördüğü (yöntem, yol) dizisi de aynı listeyi verir; iki ad (AD-1, AD-2) aynı kimliği taşır', () => {
      const indep = vectorSetIdOf(VEC); const fromSeen = sha(Buffer.from(S1.gt.map((s, i) => `${VEC.all[i].group} ${s.method} ${s.url} ${VEC.all[i].expect.join(',')}`).join('\n'), 'utf8'));
      return { ok: VEC.deny.length === 59 && VEC.allow.length === 9 && /^[0-9A-F]{64}$/.test(indep) && S1.ev.vectorSetId === indep && S1.sum.vectorSetId === indep && fromSeen === indep && S2.sum.vectorSetId === indep && S1.sum.vectorCounts.deny === 59 && S1.sum.vectorCounts.allow === 9, obs: `bağımsız=${indep.slice(0, 16)}… · kanıt=${String(S1.ev.vectorSetId).slice(0, 16)}… · kenar dizisinden=${fromSeen.slice(0, 16)}… · ret ${VEC.deny.length} + pozitif ${VEC.allow.length}` };
    });
    const v2probe = path.join(dir, 'd8-staff-surface-probe.v2.js'); const v2src = src.replace("'/dashboard',", "'/dashboard-x',"); fs.writeFileSync(v2probe, v2src);
    const V2 = await scenario('ok', { tag: 'v2', probe: v2probe, noInv: true });
    item('V-2', 'vektör kümesi kimliği listeden TÜRER (sabit değil): tek bir ret vektörünün yolu değişen sonda kopyasında kimlik değişir ve kopyanın kaynağından bağımsız hesapla eşleşir; sondanın SHA-256 alanı da kopyanın kendi baytlarını gösterir', () => {
      const vec2 = parseVectors(v2src); const indep2 = vectorSetIdOf(vec2);
      return { ok: v2src !== src && V2.ev.vectorSetId === indep2 && V2.sum.vectorSetId === indep2 && indep2 !== vectorSetIdOf(VEC) && V2.sum.probeSha256 === sha(fs.readFileSync(v2probe)) && V2.sum.probeSha256 !== S1.sum.probeSha256, obs: `kopya=${String(V2.ev && V2.ev.vectorSetId).slice(0, 16)}… · asıl=${vectorSetIdOf(VEC).slice(0, 16)}… · farklı=${indep2 !== vectorSetIdOf(VEC)}` };
    });

    // ── Statik kalemler ──
    item('T-1', 'sonda pozitif listesinde giriş/forgot-password/intake POST/belge yükleme YOK (yalnız token olmadan guard pozitifleri)', () => ({ ok: VEC.allowBlock.length > 0 && !/api\/portal\/login'|api\/portal\/forgot-password'|public\/intake|documents\/upload/.test(VEC.allowBlock) && !VEC.allowBlock.split('\n').some((l) => /'POST'/.test(l) && !/token yok/.test(l)), obs: 'statik' }));
    const denyLines = VEC.denyBlock.split('\n').filter((l) => /^\s*\['/.test(l));
    item('T-2', 'statik: https.request seçenek nesnesiyle (URL string DEĞİL); her ret vektöründe ifPassed (FX.*) var; boş gövdeli yazma yöntemleri adında "boş gövde"; kimlik/yazma bayrakları kanıtta yalnız design{} (beyan) + measured{} (türetilmiş); kimlik gözlemi / anlamı, kalibrasyon, katman kimliği, dört alan ve çıkış kodu işlevleri ipucu alanlarını (Server başlığı, gövde, imza, layerHint) OKUMAZ; alan işlevi API kanıtını yalnız layerId üzerinden okur', () => {
      const fns = ['idObsOf', 'idSignalOf', 'inHeaderlessZone', 'calibrationOf', 'layerIdOf', 'verdictsOf', 'exitCodeOf']; const bodies = fns.map(fnSrc); const all = bodies.join('\n'); const srcNoDesign = src.replace(/design:\s*\{[^}]*\}/, '');
      const pure = bodies.every((b) => b !== '') && !/hints|serverHeader|bodyEmpty|layerHint|providerSignature|caddy|cloudflare|\.body|\.headers|server/i.test(all) && /const proven = \(x\) => x\.layerId === 'UYGULAMA-API';/.test(fnSrc('verdictsOf'));
      const ok = /https\.request\(\{\s*host:\s*HOST,\s*port:\s*PORT,\s*path,\s*method,\s*servername:\s*HOST/.test(src) && !/https\.request\(ORIGIN/.test(src) && denyLines.length === S1.ev.deny && denyLines.every((l) => /FX\.\w+\]/.test(l)) && denyLines.filter((l) => /'(POST|PUT|PATCH)'/.test(l)).every((l) => /boş gövde/.test(l))
        && !/credentialsSent:\s*(true|false)|writesAttempted:\s*(true|false)/.test(srcNoDesign) && S1.ev.credentialsSent === undefined && S1.ev.writesAttempted === undefined && typeof S1.ev.measured === 'object' && /credentialHeaderRequests:\s*rows\.filter/.test(src) && pure;
      return { ok, obs: `ret satırı=${denyLines.length} · işlev=${bodies.filter((b) => b !== '').length}/${fns.length} · işlevler ipucu okumaz=${pure}` };
    });
    item('T-3', 'statik (D8-E1/E2): deny kaynağında 3 HEAD + 3 OPTIONS yöntemi üç yüzeyde (sayfa /, personel API /api/auth/me, admin /api/portal/admin/documents/pending) ve 18 kodlama/normalizasyon ham yolu birebir; HEAD/OPTIONS/evasion FX etiketleri bağlı', () => {
      const headLines = denyLines.filter((l) => /,\s*'HEAD',/.test(l)); const optLines = denyLines.filter((l) => /,\s*'OPTIONS',/.test(l));
      const hoSurfSrc = ['/', '/api/auth/me', '/api/portal/admin/documents/pending'].every((p) => headLines.some((l) => l.includes(`'${p}'`)) && optLines.some((l) => l.includes(`'${p}'`)));
      const evInSrc = evasionPaths.filter((p) => VEC.denyBlock.includes(`'${p}'`)).length;
      const fxRefs = /FX\.headPage/.test(src) && /FX\.headApi/.test(src) && /FX\.headAdmin/.test(src) && /FX\.optionsPage/.test(src) && /FX\.optionsApi/.test(src) && /FX\.optionsAdmin/.test(src) && /FX\.evasion/.test(src);
      return { ok: headLines.length === 3 && optLines.length === 3 && hoSurfSrc && evInSrc === 18 && fxRefs, obs: `HEAD=${headLines.length} · OPTIONS=${optLines.length} · varyant kaynakta=${evInSrc}/18 · yüzeyler=${hoSurfSrc} · FX=${fxRefs}` };
    });
    item('T-4', 'statik: kararlar VERİLDİ — sondada "karar bekliyor" eşlemesi / işareti, "değerlendirme gerekir" sınıfı ve çıkış 5 KALMADI (kod satırlarında API_KAYNAKLI_403, kararBekliyor, pendingOwnerDecision, DEGERLENDIRME-GEREKIR, RET_CIKIS, D8-KARAR-BEKLIYOR yok; process.exit(5) yok); çıkış kodu TEK işlevden (exitCodeOf) türer ve tek yerde çağrılır; ölçüm sonrası süreç çıkışı yalnız o değerle ya da 7 ile verilir; alan değerleri kümesi tek tanım (PASS / FAIL / OLCULEMEYEN)', () => {
      const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); const gone = ['API_KAYNAKLI_403', 'kararBekliyor', 'pendingOwnerDecision', 'DEGERLENDIRME-GEREKIR', 'RET_CIKIS', 'D8-KARAR-BEKLIYOR', 'KARAR BEKL'].filter((w) => code.includes(w));
      const calls = (code.match(/exitCodeOf\(/g) || []).length; const exits = (code.match(/process\.exit\(([^)]*)\)/g) || []); const fv = code.split('\n').filter((l) => /^const FIELD_VALUES\s*=/.test(l));
      const ok = gone.length === 0 && calls === 2 && fnSrc('exitCodeOf') !== '' && exits.length > 0 && exits.every((e) => /process\.exit\((4|7|exitCode)\)/.test(e)) && !/exitCode\s*=\s*5|:\s*5\s*[,}]/.test(fnSrc('exitCodeOf')) && fv.length === 1 && /\['PASS', 'FAIL', 'OLCULEMEYEN'\]/.test(fv[0]);
      return { ok, obs: `kalan eski ad=${gone.length}${gone.length ? ' [' + gone.join(',') + ']' : ''} · exitCodeOf geçişi=${calls} (tanım + tek çağrı) · process.exit biçimleri=${Array.from(new Set(exits)).join(' ')}` };
    });

    // ── Belge: pinler, belge ↔ kod ↔ öz-test tutarlılığı ve owner blokları ──
    const doc = fs.readFileSync(DOC, 'utf8'); const probeSha = sha(fs.readFileSync(PROBE)); const selfSha = sha(fs.readFileSync(__filename));
    const fences = []; { const rx = /```powershell\r?\n([\s\S]*?)\r?\n```/g; let m; while ((m = rx.exec(doc))) fences.push(m[1]); }
    const ENV_LIT = "'C:\\Development\\HUKUK_YAZILIMI\\HY_W4_RELEASE23\\project\\apps\\api\\.env'";
    const PROBE_LIT = "'D:\\Development\\HUKUK_YAZILIMI\\project\\project\\docs\\governance\\client-extacc-d8-staff-surface-r01\\scripts\\d8-staff-surface-probe.js'";
    const measureBlocks = fences.filter((t) => /d8-staff-surface-probe\.js/.test(t) && /--out /.test(t)); const phoneBlocks = fences.filter((t) => /d8-staff-surface-probe\.js/.test(t) && /--phone-list/.test(t));
    const blockPins = fences.map((t) => (/-cne '([0-9A-F]{64})'/.exec(t) || [])[1]); const cnt = (t, lit) => t.split(lit).length - 1;
    item('D-1', 'pinler: belge §7 sonda pini = iki owner bloğundaki pin = sondanın gerçek SHA-256\'sı (büyük harf); belge §7 öz-test pini = bu dosyanın gerçek SHA-256\'sı', () => {
      const p7 = (/`d8-staff-surface-probe\.js` `([0-9A-F]{64})`/.exec(doc) || [])[1]; const s7 = (/`d8-selftest\.js` `([0-9A-F]{64})`/.exec(doc) || [])[1];
      return { ok: p7 === probeSha && s7 === selfSha && blockPins.length === 2 && blockPins.every((p) => p === probeSha), obs: `sonda: belge ${String(p7).slice(0, 8)}… gerçek ${probeSha.slice(0, 8)}… · öz-test: belge ${String(s7).slice(0, 8)}… gerçek ${selfSha.slice(0, 8)}… · blok pinleri=${blockPins.map((p) => String(p).slice(0, 8)).join(',')}` };
    });
    item('DOC-1', 'belge ↔ kod ↔ öz-test AYNI eşlemeyi taşır: (a) belge, sondanın kanıta yazdığı çıkış kodu eşlemesi metnini AYNEN içerir · (b) §1b ad başına tablonun başlığı sırasıyla şu sütunlardır: ad kimliği · kapsam yetkisi · HTTP / ret sonucu · kenar engelleme sonucu · katman doğrulaması · pozitif kontrol · koşum · dış ağ beyanı · (c) her satırın ilk hücresi bir ad kimliği ya da "diğer yayın adları"dır (ortak / toplam / "D-8" satırı yok); dört sonuç hücresi YALNIZ şu değerlerden biridir: PASS · FAIL · OLCULEMEYEN · "KOŞULMADI — canlı sonda GO\'su yok" · "KOŞULMADI — kapsam yetkisi doğrulanmadı" (sayı, neden, özet değeri yok) · (d) bugün: AD-1 satırının dört sonuç hücresi "KOŞULMADI — canlı sonda GO\'su yok"; "diğer yayın adları" satırının kapsam yetkisi ve dört sonuç hücresi sondanın kapsam yetkisi kapısının yazdığı sabit metinle BİREBİR aynı; o satırda ad kimliği / sayı yok · (e) §1b\'de 64 haneli özet değeri yok · (f) belgede "OWNER KARARLARI (2026-10-05)" bölümü var, "BEKLEYEN OWNER KARARLARI" başlığı yok', () => {
      const cut = (x, y) => { const i = doc.indexOf(x); if (i < 0) return ''; const j = doc.indexOf(y, i + x.length); return doc.slice(i, j < 0 ? undefined : j); };
      const s1b = cut('### 1b.', '### 1c.'); const lines = s1b.split(/\r?\n/); const head = lines.find((l) => /^\| Ad kimliği \|/.test(l)) || ''; const cells = (l) => l.split('|').slice(1, -1).map((x) => x.trim());
      const cols = ['Ad kimliği', 'Kapsam yetkisi', 'HTTP / ret sonucu', 'Kenar engelleme sonucu', 'Katman doğrulaması', 'Pozitif kontrol', 'Koşum', 'Dış ağ beyanı']; const hc = cells(head);
      const GO = "KOŞULMADI — canlı sonda GO'su yok"; const allowed = ['PASS', 'FAIL', 'OLCULEMEYEN', GO, REFUSAL];
      const hi = lines.indexOf(head); const rows = hi < 0 ? [] : lines.slice(hi + 2).filter((l) => /^\|/.test(l)).map(cells);
      // Satır biçimi koşumdan SONRA doldurulduğunda da geçerli kalır: sonuç hücreleri yalnız alan değeri ya da iki "KOŞULMADI" metninden biridir.
      const shape = rows.length >= 2 && rows.every((c) => c.length === cols.length && /^(\*\*AD-[1-9][0-9]{0,2}\*\*|diğer yayın adları)/.test(c[0]) && c.slice(2, 6).every((x) => allowed.includes(x)) && (/^birincil ad/.test(c[1]) || c[1] === 'DOGRULANDI' || c[1] === REFUSAL));
      const r1 = rows.find((c) => /^\*\*AD-1\*\*/.test(c[0])) || []; const r2 = rows.find((c) => /^diğer yayın adları/.test(c[0])) || [];
      const map = S1.ev.exitCodeMap; const gateText = sa1.first;
      const ok = typeof map === 'string' && map.length > 40 && doc.includes(map) && S1.sum.exitCodeMap === map && hc.length === cols.length && cols.every((c, i) => hc[i].startsWith(c)) && shape
        && r1.length === cols.length && /^birincil ad/.test(r1[1]) && r1.slice(2, 6).every((x) => x === GO) && gateText === REFUSAL && r2.length === cols.length && r2.slice(1, 6).every((x) => x === REFUSAL) && !/\d/.test(r2.join('|'))
        && !/[0-9A-Fa-f]{64}/.test(s1b) && /### 3b\. OWNER KARARLARI \(2026-10-05\)/.test(doc) && !/BEKLEYEN OWNER KARARLARI/.test(doc);
      return { ok, obs: `eşleme metni belgede=${typeof map === 'string' && doc.includes(map)} · §1b sütun=${hc.length}/${cols.length} · satır=${rows.length} (biçim=${shape}) · AD-1 satırı=${r1.length === cols.length && r1.slice(2, 6).every((x) => x === GO)} · diğer adlar satırı = kapı metni: ${r2.length === cols.length && r2.slice(1, 6).every((x) => x === REFUSAL) && gateText === REFUSAL}` };
    });
    const blocksOk = fences.length === 2 && measureBlocks.length === 1 && phoneBlocks.length === 1 && measureBlocks[0] !== phoneBlocks[0];
    item('B-0', 'belgedeki owner blokları: tam İKİ powershell bloğu (bir ölçüm, bir telefon listesi); her biri tek satır ve yalnız ASCII; canlı .env yolu, sonda yolu ve pin birer kez; yalnız --alias AD-1 (başka ad için blok yok); ölçüm bloğu --vantage verir, --phone-list VERMEZ, özetin SHA-256\'sını gösterir; telefon bloğu --out VERMEZ', () => {
      const all = fences.every((t) => !/\r|\n/.test(t) && /^[\x20-\x7E]+$/.test(t) && cnt(t, ENV_LIT) === 1 && cnt(t, PROBE_LIT) === 1 && (t.match(/-cne '[0-9A-F]{64}'/g) || []).length === 1 && (t.match(/--alias AD-1(?![0-9])/g) || []).length === 1 && (t.match(/--alias/g) || []).length === 1 && !/AD-[2-9]|AD-1[0-9]/.test(t) && cnt(t, 'ReadAllLines') === 1);
      const m = measureBlocks[0] || ''; const t = phoneBlocks[0] || '';
      return { ok: blocksOk && all && /--vantage [a-z0-9-]+ /.test(m) && !/--phone-list/.test(m) && /ozet\.json/.test(m) && /Get-FileHash -Algorithm SHA256 -LiteralPath \$s/.test(m) && !/--out/.test(t) && !/--vantage/.test(t), obs: `powershell bloğu=${fences.length} · ölçüm=${measureBlocks.length} · telefon=${phoneBlocks.length} · biçim=${all}` };
    });

    // ── Owner blokları İKİ KABUKTA ──
    const shells = [{ id: 'winps51', label: 'Windows PowerShell 5.1', exe: process.env.D8_SELFTEST_WINPS_EXE || 'powershell.exe', min: 5, max: 5 }, { id: 'pwsh7', label: 'pwsh 7', exe: process.env.D8_SELFTEST_PWSH_EXE || 'pwsh', min: 7, max: 99 }];
    let psSeq = 0;
    /** Kabukta betik metni koşturur: PSModulePath (5.1'de boş), sahte kullanıcı kökü, gerçek node.exe PATH'in başında. */
    async function runPs(sh, text, userRoot) {
      const f = path.join(dir, `blk-${sh.id}-${++psSeq}.ps1`); fs.writeFileSync(f, text + '\r\n', 'ascii');
      const e = {}; for (const k of Object.keys(baseEnv)) if (!/^(PSModulePath|USERPROFILE)$/i.test(k)) e[k] = baseEnv[k];
      e.NODE_EXTRA_CA_CERTS = cert; if (userRoot) e.USERPROFILE = userRoot; if (sh.id === 'winps51') e.PSModulePath = '';
      const pk = Object.keys(e).find((k) => /^path$/i.test(k)) || 'Path'; e[pk] = path.dirname(process.execPath) + path.delimiter + (e[pk] || '');
      return spawnP(sh.exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', f], e);
    }
    /** Blok metnini test için hazırlar — KAPALI BİÇİMDE: `.env` yolu (`$e='…'`), sonda yolu (`$f='…'`) ve pin YAPISAL olarak (belgedeki
     *  değer ne olursa olsun) tam birer kez bulunup değiştirilir; biri bulunamazsa ya da hazırlanan metinde sahte `.env` dosyası ve
     *  verilen sonda dışında TEK BİR mutlak yol, `.env` uzantılı bir değer ya da canlı kök adı kalırsa İSTİSNA atar ve blok HİÇ
     *  koşturulmaz. (Bu makine canlı ana makine olabilir: ikamesi yapılmamış bir blok canlı `.env` satırını okur ve canlı origin'e
     *  sonda koşturur — bu yüzden ikame "yapıldı" varsayılmaz, kanıtlanır.) */
    const prep = (text, envFile, probeFile, pin) => {
      const e = text.match(/\$e='[^']*'/g) || []; const f = text.match(/\$f='[^']*'/g) || []; const p = text.match(/-cne '[0-9A-F]{64}'/g) || [];
      if (e.length !== 1 || f.length !== 1 || p.length !== 1) throw new Error(`blok ikamesi yapılamadı ($e=${e.length} · $f=${f.length} · pin=${p.length}; her biri tam 1 olmalı)`);
      if (!path.resolve(envFile).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep)) throw new Error('sahte .env dosyası öz-testin geçici dizininde değil');
      const out = text.replace(e[0], () => "$e='" + envFile + "'").replace(f[0], () => "$f='" + probeFile + "'").replace(p[0], () => "-cne '" + pin + "'");
      const abs = out.match(/(?<![A-Za-z])[A-Za-z]:[\\/][^']*/g) || []; const stray = abs.filter((a) => a !== envFile && a !== probeFile); // sürücü harfli her yol (https:// değil)
      if (stray.length || /\.env\b/i.test(out) || /HY_W4_RELEASE23/i.test(out) || !out.includes("$e='" + envFile + "'") || !out.includes("$f='" + probeFile + "'")) throw new Error(`hazırlanan blokta ikame dışı yol kaldı (mutlak yol ${stray.length} · .env ${/\.env\b/i.test(out)} · canlı kök ${/HY_W4_RELEASE23/i.test(out)})`);
      return out;
    };
    const envFile = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'ascii'); return f; };
    const envOk = envFile('env-ok.txt', ['PORT=8080', `PUBLIC_PORTAL_BASE_URL=${ORIGIN}`, 'BASKA_ANAHTAR=deger']);
    const envQuoted = envFile('env-quoted.txt', ['# sahte', `  PUBLIC_PORTAL_BASE_URL = "${ORIGIN}"`]);
    const envNone = envFile('env-none.txt', ['PORT=8080', `PUBLIC_PORTAL_BASE_URL_ESKI=${ORIGIN}`]);
    const envTwo = envFile('env-two.txt', [`PUBLIC_PORTAL_BASE_URL=${ORIGIN}`, `PUBLIC_PORTAL_BASE_URL=${ORIGIN}`]);
    const envHttp = envFile('env-http.txt', [`PUBLIC_PORTAL_BASE_URL=http://localhost:${PORT}`]);
    const envPath = envFile('env-path.txt', [`PUBLIC_PORTAL_BASE_URL=${ORIGIN}/portal`]);
    const tampered = path.join(dir, 'd8-staff-surface-probe.degisti.js'); fs.writeFileSync(tampered, Buffer.concat([fs.readFileSync(PROBE), Buffer.from('\n// bir bayt degisti\n')]));
    /** Dokuz blok denemesinin metinlerini hazırlar. İkamenin KANITI yoksa (prep istisnası) HİÇBİR metin döndürmez → hiçbir blok koşmaz. */
    const prepAll = (mText, pText) => {
      try {
        return { err: null, P: { b1: [prep(mText, envOk, PROBE, probeSha), 'ok'], b2a: [prep(mText, envNone, PROBE, probeSha), 'ok'], b2b: [prep(mText, envTwo, PROBE, probeSha), 'ok'], b3a: [prep(mText, envHttp, PROBE, probeSha), 'ok'],
          b3b: [prep(mText, envPath, PROBE, probeSha), 'ok'], b4: [prep(mText, envOk, tampered, probeSha), 'ok'], b5: [prep(mText, envQuoted, PROBE, probeSha), 'broken'], bt: [prep(pText, envOk, PROBE, probeSha), 'ok'], bt2: [prep(pText, envOk, tampered, probeSha), 'ok'] } };
      } catch (e) { return { P: null, err: String((e && e.message) || e).slice(0, 200) }; }
    };
    let uSeq = 0; let blockRuns = 0;
    /** Bir blok denemesi: sahte kullanıcı kökü + kip; dönen: kabuk çıkışı, çıktı, kenarın gördüğü istek sayısı, yazılan kanıt dizinleri. */
    const blk = async (sh, text, m) => { blockRuns++; const u = path.join(dir, `u-${sh.id}-${++uSeq}`); fs.mkdirSync(u); mode = m; seen = []; const r = await runPs(sh, text, u); const n = seen.length; seen = [];
      const root = path.join(u, 'Documents', 'CLIENT-EVIDENCE-20260911'); const dirs = fs.existsSync(root) ? fs.readdirSync(root) : []; return { code: r.code, log: r.log, seen: n, root, dirs, docs: fs.existsSync(path.join(u, 'Documents')) }; };
    /** Blok serisini koşturur — YALNIZ hazırlanmış (ikamesi kanıtlanmış) metin kümesi varsa. */
    const runSeries = async (sh, PA) => { const B = {}; if (!PA || !PA.P) return B; for (const key of Object.keys(PA.P)) B[key] = await blk(sh, PA.P[key][0], PA.P[key][1]); return B; };
    const PA = blocksOk ? prepAll(measureBlocks[0], phoneBlocks[0]) : { P: null, err: 'belgeden blok çıkarılamadı (B-0)' };

    // B-G — düzeneğin kendi kapısı: ikamesi YAPILAMAYAN (belgedeki biçimden kaymış) blok metni HİÇ koşturulmaz. Kaymış metinler canlı
    // `.env` yolunu İÇERMEZ (önce var olmayan bir yola çevrilir); kapı tutmasa bile canlıya dokunacak bir metin üretilmez.
    const NOPE = 'C:\\D8-OZTEST-OLMAYAN-DIZIN'; const eLit = (t) => ((t || '').match(/\$e='[^']*'/) || [''])[0]; const fLit = (t) => ((t || '').match(/\$f='[^']*'/) || [''])[0];
    const neutral = (t) => t.replace(eLit(t), () => "$e='" + NOPE + "\\apps\\api\\x.env'"); const drift = [];
    if (blocksOk && eLit(measureBlocks[0]) && fLit(measureBlocks[0]) && eLit(phoneBlocks[0])) {
      const mB = neutral(measureBlocks[0]); const pB = neutral(phoneBlocks[0]);
      drift.push(['.env yolu tek tırnak yerine çift tırnakla', mB.replace(eLit(mB), () => '$e="' + NOPE + '\\apps\\api\\x.env"'), pB]);
      drift.push(['.env yolu değişmez dize değil (Join-Path)', mB.replace(eLit(mB), () => "$e=(Join-Path '" + NOPE + "\\apps\\api' 'x.env')"), pB]);
      drift.push(['iki $e ataması', mB.replace(eLit(mB), () => eLit(mB) + '; ' + eLit(mB)), pB]);
      drift.push(['blokta ikinci bir mutlak .env yolu', mB.replace(eLit(mB), () => eLit(mB) + "; $e2='" + NOPE + "\\baska\\y.env'"), pB]);
      drift.push(['sonda yolu çift tırnakla', mB.replace(fLit(mB), () => '$f="' + NOPE + '\\d8-staff-surface-probe.js"'), pB]);
      drift.push(['kayma yalnız telefon listesi bloğunda', mB, pB.replace(eLit(pB), () => '$e="' + NOPE + '\\apps\\api\\x.env"')]);
    }
    const bg = []; for (const [name, mT, pT] of drift) { const before = { runs: blockRuns, ps: psSeq }; mode = 'ok'; seen = []; const pa = prepAll(mT, pT); const Bx = await runSeries(shells[0], pa); bg.push({ name, refused: pa.P === null && !!pa.err, ran: blockRuns - before.runs, ps: psSeq - before.ps, seen: seen.length, keys: Object.keys(Bx).length }); seen = []; }
    item('B-G', 'blok düzeneğinin KAPISI (canlı ana makinede güvenlik): belgedeki bloğun .env yolu / sonda yolu test ikamesinin tanıdığı biçimden kayarsa (çift tırnak · değişmez dize değil · iki atama · ikinci mutlak .env yolu · sonda yolu kaymış · yalnız telefon bloğunda kayma) düzenek o blok kümesini HİÇ koşturmaz: kabuk başlatılmaz, betik dosyası yazılmaz, kenara istek gitmez; belgedeki gerçek bloklarda ise ikame KANITLIDIR — hazırlanan dokuz metnin hiçbirinde canlı kök adı, `.env` uzantılı değer ya da sahte dosyalar dışında mutlak yol yok', () => {
      const texts = PA.P ? Object.keys(PA.P).map((k) => PA.P[k][0]) : []; const absOf = (t) => t.match(/(?<![A-Za-z])[A-Za-z]:[\\/][^']*/g) || [];
      const clean = texts.length === 9 && texts.every((t) => !/HY_W4_RELEASE23/i.test(t) && !/\.env\b/i.test(t) && absOf(t).length === 2 && absOf(t).every((a) => a === PROBE || a === tampered || a.toLowerCase().startsWith(dir.toLowerCase() + path.sep)));
      const ok = blocksOk && drift.length === 6 && bg.length === 6 && bg.every((x) => x.refused && x.ran === 0 && x.ps === 0 && x.seen === 0 && x.keys === 0) && PA.P !== null && clean && drift.every((d) => !/HY_W4_RELEASE23/i.test(d[1] + d[2]));
      return { ok, obs: `kaymış blok kümesi=${bg.length} · koşturulmayan=${bg.filter((x) => x.refused && x.ran === 0 && x.ps === 0).length} · kenara giden istek=${bg.reduce((a, x) => a + x.seen, 0)} · gerçek bloklarda ikame kanıtlı=${PA.P !== null && clean}${PA.err ? ' · ' + PA.err : ''}` };
    });

    for (const sh of shells) {
      const ver = await runPs(sh, "'PSMAJOR=' + $PSVersionTable.PSVersion.Major + ' PSVER=' + $PSVersionTable.PSVersion.ToString() + ' PSEDITION=' + $PSVersionTable.PSEdition", null); const major = Number((/PSMAJOR=(\d+)/.exec(ver.log) || [])[1]);
      sh.version = `${(/PSVER=(\S+)/.exec(ver.log) || [])[1] || '?'} (${(/PSEDITION=(\S+)/.exec(ver.log) || [])[1] || '?'})`;
      const avail = !ver.spawnError && major >= sh.min && major <= sh.max; const why = `${sh.label} başlatılamadı (${ver.spawnError || 'sürüm=' + (major || '?')}) — kalem ÖLÇÜLEMEDİ, geçti sayılmaz`;
      if (!avail) sh.version = 'ÖLÇÜLEMEDİ';
      const notRun = (b) => b.seen === 0 && !b.docs && !/cikis=\d/.test(b.log) && !/D8-CIKIS=\d/.test(b.log) && b.code !== 0;
      const B = avail ? await runSeries(sh, PA) : {};
      const skipOr = (fn) => () => (!blocksOk ? { ok: false, obs: 'belgeden blok çıkarılamadı (B-0)' } : (!PA.P ? { ok: false, obs: 'blok KOŞTURULMADI — ikame kanıtlanamadı: ' + PA.err } : (!avail ? { skip: true, obs: why } : fn())));
      /** Olağan akışın ölçümü: blok çıktısındaki çıkış kodu, kanıt dizini, özet SHA'sı (bağımsız hesapla), takma ad, konum etiketi. */
      const flow = (b, expectCode) => {
        const one = b.dirs.length === 1 && /^extacc-d8-AD-1-\d{8}-\d{6}Z$/.test(b.dirs[0]); const d = one ? path.join(b.root, b.dirs[0]) : null;
        const ev = d ? readJson(path.join(d, 'd8-probe.json')) : null; const sb = d ? readBytes(path.join(d, 'd8-probe.ozet.json')) : null; const shown = (/D8 AD-1 adsiz ozet SHA256=([0-9A-F]{64})/.exec(b.log) || [])[1]; const probeLine = (/^D8-OZET-SHA256=([0-9A-F]{64})/m.exec(b.log) || [])[1];
        const vantage = (/--vantage ([a-z0-9-]+) /.exec(measureBlocks[0]) || [])[1];
        const ok = b.code === 0 && new RegExp('D8 AD-1 cikis=' + expectCode + '(\\r?\\n|$)').test(b.log) && b.seen === VEC.all.length && one && ev && sb && shown === sha(sb) && probeLine === shown && ev.nameAlias === 'AD-1' && ev.vantage === vantage && ev.exitCode === expectCode && !/TELEFON/.test(b.log) && fs.readdirSync(d).sort().join() === 'd8-probe.json,d8-probe.ozet.json';
        return { ok, obs: `kabuk sürümü (ölçülen)=${sh.version} · kabuk çıkış=${b.code} · blok "cikis=${(/D8 AD-1 cikis=(\d+)/.exec(b.log) || [])[1]}" · istek=${b.seen} · kanıt dizini=${b.dirs.length} · özet SHA blok=bağımsız: ${!!sb && shown === sha(sb)} · takma ad=${ev && ev.nameAlias} · konum=${ev && ev.vantage}` };
      };
      item(`B-1/${sh.id}`, `${sh.label} · ölçüm bloğu olağan akış (sahte .env tek satır https origin, sağlıklı sahte kenar): blok sondayı AD-1 ve konum etiketiyle koşturur; "D8 AD-1 cikis=0"; kullanıcı kökü altında tek kanıt dizini (ham kanıt + adsız özet); blokta gösterilen özet SHA-256'sı = dosyanın bağımsız hesaplanan SHA-256'sı = sondanın yazdırdığı; telefon listesi YAZDIRILMAZ`, skipOr(() => flow(B.b1, 0)));
      item(`B-2/${sh.id}`, `${sh.label} · kapı: .env'de PUBLIC_PORTAL_BASE_URL satırı 0 ya da 2 → blok DURUR; sonda HİÇ koşmaz (kenara istek yok, kanıt dizini oluşmaz, "cikis=" satırı yok)`, skipOr(() => ({ ok: notRun(B.b2a) && notRun(B.b2b) && /satiri 1 degil/.test(B.b2a.log) && /satiri 1 degil/.test(B.b2b.log), obs: `0 satır: kabuk=${B.b2a.code} istek=${B.b2a.seen} · 2 satır: kabuk=${B.b2b.code} istek=${B.b2b.seen}` })));
      item(`B-3/${sh.id}`, `${sh.label} · kapı: değer https değil (http://…) ya da yol içeriyor (https://…/portal) → blok DURUR; sonda HİÇ koşmaz`, skipOr(() => ({ ok: notRun(B.b3a) && notRun(B.b3b) && /https\/yolsuz origin degil/.test(B.b3a.log) && /https\/yolsuz origin degil/.test(B.b3b.log), obs: `http: kabuk=${B.b3a.code} istek=${B.b3a.seen} · yollu: kabuk=${B.b3b.code} istek=${B.b3b.seen}` })));
      item(`B-4/${sh.id}`, `${sh.label} · kapı: sonda dosyası pinle uyuşmuyor (bir baytı değişmiş kopya) → blok DURUR; sonda HİÇ koşmaz`, skipOr(() => ({ ok: notRun(B.b4) && /SHA UYUSMUYOR/.test(B.b4.log), obs: `kabuk=${B.b4.code} istek=${B.b4.seen} · kanıt dizini=${B.b4.docs}` })));
      item(`B-5/${sh.id}`, `${sh.label} · blok sondanın çıkış kodunu AKTARIR (sabit yazmaz): tırnaklı ve boşluklu .env değeri + bozuk sahte kenar → "D8 AD-1 cikis=2"; özet yine yazılır ve SHA'sı gösterilir`, skipOr(() => flow(B.b5, 2)));
      item(`B-T/${sh.id}`, `${sh.label} · telefon listesi bloğu (AYRI çağrı): 5 adres yazdırır; kenara İSTEK ATMAZ; kanıt dizini oluşturmaz`, skipOr(() => ({ ok: B.bt.code === 0 && (B.bt.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /D8 AD-1 telefon listesi cikis=0/.test(B.bt.log) && B.bt.seen === 0 && !B.bt.docs, obs: `kabuk=${B.bt.code} · adres=${(B.bt.log.match(/^\s+\d\. https:\/\//gm) || []).length} · istek=${B.bt.seen} · kanıt dizini=${B.bt.docs}` })));
      item(`B-T2/${sh.id}`, `${sh.label} · telefon listesi bloğunda pin uyuşmazlığı → blok DURUR; liste yazdırılmaz`, skipOr(() => ({ ok: B.bt2.code !== 0 && /SHA UYUSMUYOR/.test(B.bt2.log) && !/^\s+\d\. https:\/\//m.test(B.bt2.log) && B.bt2.seen === 0, obs: `kabuk=${B.bt2.code} · istek=${B.bt2.seen}` })));
    }
    shellVersions = shells.map((s) => `${s.label} = ${s.version}`).join(' · ');

    // ── Taşıma hataları (son: sunucu kapatılır) ──
    const noCa = Object.assign({}, baseEnv); const S4b = await scenario('ok', { tag: 's4b', env: noCa, noInv: true });
    item('S4-b', 'doğrulanamayan sertifika (sonda sahte kenarın sertifikasına güvenmiyor): 68/68 SONUC-YOK, hata sınıfı TLS; dört alanın hepsi OLCULEMEYEN (HTTP / ret: yanıtsız ret vektörü ×59 — FAIL değil); çıkış 3; kenar hiçbir isteği işlemedi; hata İLETİSİ kanıta / özete yazılmaz', () => {
      const r = S4b.ev.rows; const txt = S4b.evBytes.toString('utf8').replace(/"originHost":\s*"[^"]*"/, '') + S4b.sumBytes.toString('utf8');
      const ok = is(S4b, 3, 'O/O/O/O') && r.length === VEC.all.length && r.every((x) => x.status === 0 && x.outcome === 'SONUC-YOK' && x.errorClass === 'TLS' && x.layerId === 'SONUC-YOK' && !('error' in x)) && S4b.gt.length === 0 && rc(S4b, 'httpReject', 'RET-VEKTORU-YANITSIZ') === VEC.deny.length && rc(S4b, 'positiveControl', 'POZITIF-YANITSIZ') === VEC.allow.length
        && S4b.ev.calibration.zoneMeasured === 0 && S4b.ev.calibration.apiEvidenceUsable === false && S4b.sum.errorClassCounts.TLS === r.length && !/self.signed|certificate|SELF_SIGNED|localhost/i.test(txt);
      return { ok, obs: brief(S4b) + ` · hata sınıfı=${JSON.stringify(S4b.sum && S4b.sum.errorClassCounts)}` };
    });
    if (srv.closeAllConnections) srv.closeAllConnections(); await new Promise((x) => srv.close(x)); srv = null;
    const S4 = await scenario('ok', { tag: 's4', env: Object.assign({ D8_HTTP_TIMEOUT_MS: '1500' }, env), noInv: true });
    item('S4', 'kenar kapalı: 68/68 SONUC-YOK, hata sınıfı BAGLANTI (S4-b ile ayrı sınıf); dört alanın hepsi OLCULEMEYEN; çıkış 3, bulgu yok; kanıt ve özet yine yazılır; hata iletisi yok', () => {
      const r = S4.ev.rows; const txt = S4.evBytes.toString('utf8').replace(/"originHost":\s*"[^"]*"/, '') + S4.sumBytes.toString('utf8');
      const ok = is(S4, 3, 'O/O/O/O') && S4.ev.unmeasured === S4.ev.deny + S4.ev.allow && r.every((x) => x.status === 0 && x.errorClass === 'BAGLANTI' && x.idObs === 'SONUC-YOK') && S4.ev.findings.length === 0 && S4.sum.errorClassCounts.BAGLANTI === r.length && S4.sum.errorClassCounts.TLS === 0 && !/ECONNREFUSED|connect |127\.0\.0\.1|localhost/i.test(txt);
      return { ok, obs: brief(S4) + ` · sonuç yok=${S4.ev.unmeasured} · hata sınıfı=${JSON.stringify(S4.sum && S4.sum.errorClassCounts)}` };
    });
  } catch (e) { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); if (srv) { try { srv.close(); } catch (x) { /* yok */ } } process.exit(2); }
  for (const x of results) console.log(`${x.state.padEnd(10)} ${x.id.padEnd(13)} ${x.d}\n        ${x.obs}`);
  const fail = results.filter((x) => x.state === 'FAIL'); const skip = results.filter((x) => x.state === 'OLCULEMEDI'); const pass = results.filter((x) => x.state === 'PASS');
  console.log(`\nsonda: ${process.env.D8_SELFTEST_PROBE ? 'ALTERNATİF (D8_SELFTEST_PROBE)' : 'paket'} · sonda SHA-256 ${sha(fs.readFileSync(PROBE))} · port ${PORT} · node ${process.version} · kabuk sürümleri (ölçülen): ${shellVersions}`);
  if (fail.length) console.log('FAIL: ' + fail.map((x) => x.id).join(', '));
  if (skip.length) console.log('ÖLÇÜLEMEDİ (geçti SAYILMAZ): ' + skip.map((x) => x.id).join(', '));
  console.log(`D-8 SONDA ÖZ-TESTİ: PASS ${pass.length} / ${results.length} · FAIL ${fail.length} · ÖLÇÜLEMEDİ ${skip.length}  (kanıt: ${dir})`);
  process.exit(fail.length ? 1 : (skip.length ? 2 : 0));
})();
