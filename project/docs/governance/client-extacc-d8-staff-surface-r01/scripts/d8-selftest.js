'use strict';
/*
 * D-8 sondası ÖZ-TESTİ (R05) — canlıya dokunmaz. Gerçek TLS'li SAHTE KENAR + SAHTE API YANKISI modeli.
 *
 * MODEL
 *   Sahte kenar : Caddyfile şablonunun 4 izin regex'i + admin reddi; karar GERÇEK CADDY yol temizliği modeliyle (yüzde-çöz +
 *                 ./.. + // sadeleştir). Arka uca HAM yolu iletir (şablon: "YOL DÖNÜŞÜMÜ YOK").
 *   Sahte API   : istek kimliği yankısını ÜRÜN KAYNAĞINDAN okunan kurallarla üretir (bu dosya kaynağı çalışma anında okur:
 *                 request-id.middleware.ts → başlık adı + SAFE_REQUEST_ID; main.ts → genel önek + enableCors; app.module.ts →
 *                 forRoutes('*')). Ara katman yalnız Express'in `/api$` ve `/api/*` için ürettiği ifadelerle eşleşen HAM yolda
 *                 çalışır (büyük/küçük harf duyarsız; yüzde dizisi çözülemezse çalışmaz → 400, yankısız); OPTIONS ön uçuşu ara
 *                 katmandan ÖNCE 204 ile biter (yankısız); gelen kimlik biçime uyuyorsa AYNEN yanıta yazılır, uymuyorsa yenisi
 *                 üretilir. Bu bir MODELDİR (kaynak okuması); gerçek API ile izole prova DEĞİLDİR.
 *   Zemin gerçeği: sahte uç her isteğe NE yanıt verdiğini (üreten katman, durum, yankı) kaydeder. Kalemler sondanın sınıfını
 *                 bu kayıtla karşılaştırır: her kalem AYIRT EDİCİ GİRDİ → sondanın ÖLÇTÜĞÜ sınıf biçimindedir.
 *
 * KALEMLER (kimlik: girdi → ölçülen sınıf)
 *   K-SRC  ürün kaynağındaki dayanaklar okunabildi (başlık adı, kabul biçimi, yankı satırı, forRoutes('*'), önek, enableCors).
 *   K-PORT öz-test port kapısı: canlı / veritabanı portları (8080, 3002, 5432, 5447–5449) reddedilir, dinleme başlamaz.
 *   S1     sağlıklı kenar → çıkış 0; RET KAPALI + KATMAN ADLANDIRILAMADI iki AYRI satır; birleşik PASS yok; kayıt eki var.
 *   K-1    yankılı kalibrasyon: 6 API pozitifi yankılı, 3 web pozitifi başlıksız → VAR; API pozitifleri UYGULAMA-API.
 *   L-1    "API değil" çıkarımı YALNIZ uygun yollarda: düz /api yolu → çıkarım; OPTIONS, çift eğik çizgi, çözülemeyen yüzde
 *          dizisi → OLCULEMEDI; web yolu → UYGULANAMAZ; çıkarım yapılan her satırda model "API işleseydi yankı olurdu" der.
 *   S1-p   HAM YOL: sondanın gönderdiği ham yol == kenarın gördüğü req.url (68/68, sırayla).
 *   S1-c   KİMLİK/GÖVDE ölçümü: kimlik başlığı yok; gövde 0 ya da 2 bayt; `measured` kenarla uyumlu; `design` ayrı.
 *   Y-1    istek kimliği: 68 istekte var, ürün kaynağındaki biçime uyar, tek kullanımlık (koşum içinde ve koşumlar arasında).
 *   S7     D8-E1/E2 kapsamı: 3 HEAD + 3 OPTIONS + 18 varyant; yöntem kapsamı sayıları adsız özette.
 *   S2     bozuk kenar (sızıntı, ad AD-2) → çıkış 2 KAPALI-DEGIL; 20 sızan istek; yankılı 401/404 → UYGULAMA-API (bulgu), OPTIONS
 *          204 → reddedilmedi (bulgu), çift eğik çizgili yankısız 404 → API'den geldiği kanıtsız.
 *   N-5    bir süreç = bir ad = bir kanıt: AD-2 koşumu AD-1'in dosyalarını değiştirmez; sonda kendi kaynağından başka dosya okumaz.
 *   S3 / S3-b / S3-c  sağlayıcı imzası · başlıksız boş 403 · sağlayıcı Server + boş gövde → ipuçları değişir, katman kimliği ve
 *          iki hüküm S1 ile AYNI kalır (ipucu katman kimliğine girmez).
 *   S3-dN  gövdesi DOLU ama YANKISIZ 403 (kenar üretir) → çıkış 0; "API değil" çıkarımı; gövde katman kimliğine girmez.
 *   S3-dY  YANKILI 403 (API üretir) → çıkış 5 DEGERLENDIRME-GEREKIR + owner kararı BEKLİYOR; KAPALI de KAPALI-DEGIL de değil.
 *   K-2    ters kalibrasyon: web yanıtında yankı → GECERSIZ; 68 satırın hepsi OLCULEMEDI (yankı eşleşse de); çıkış 5.
 *   K-3    API pozitifleri yankısız → kalibrasyon YOK; hiçbir satırda "API değil" çıkarımı yok; çıkış 5.
 *   K-4    biçime uymayan kimlik (API gelen değeri kabul etmez, kendi değerini üretir) → FARKLI-DEGER; kalibrasyon YOK; çıkış 5.
 *   F-1    farklı değerli başlık bütün ret yanıtlarında → yankı sayılmaz; önek dışı yolda başlık → GECERSIZ; çıkış 5;
 *          yanıt başlığı DEĞERİ kanıta yazılmaz.
 *   F-2    farklı değerli başlık yalnız API önekli ret yanıtlarında → kalibrasyon VAR ama o satırlar OLCULEMEDI; çıkış 5.
 *   L-2    yankılı 5xx → çıkış 2 · L-2b yankılı 429 → çıkış 2 · L-3 yankısız 5xx → çıkış 3 · L-4 yankısız 404 → çıkış 5 ·
 *   L-5    yönlendirme 3xx → çıkış 5; hedef kanıta / özete yazılmaz · L-6 yankısız 429 → çıkış 3.
 *   U-1    tekdüze 403 (68/68) → çıkış 3 OLCULEMEDI; ret vektörü sayıları S1 ile AYNI ama hüküm KAPALI DEĞİL.
 *   P-1    pozitif vektörde token'sız 200 → çıkış 2 POZITIF-BULGU.
 *   G-1    kenar her şeyi geçirir (zemin gerçeği): API'nin ürettiği hiçbir yanıt "API değil" diye sınıflanmaz; yankısız API
 *          yanıtları (OPTIONS, çift eğik çizgi, çözülemeyen yüzde dizisi) OLCULEMEDI; önek dışı / belirsiz yolda yankı varsa
 *          UYGULAMA-API; web yanıtları UYGULANAMAZ.
 *   N-1    takma ad kapısı (yok / geçersiz → 4, istek yok; geçerli AD-27 kanıta ve özete yazılır) · N-2 yinelenen --origin /
 *          --alias → 4 · N-3 konum etiketi kapısı → 4 · N-4 var olan kanıt / özet dosyasının üzerine yazmaz → 4.
 *   O-1    etiket ana makine adını içeriyorsa sonda koşmaz (4, istek yok) · O-2 adsız özette ad / yol / hata metni /
 *          yönlendirme hedefi / satır düzeyi bulgu yok; alan kümesi sabit; sayılar ham kanıtla uyumlu · O-3 özet SHA-256'sı.
 *   V-1    vektör kümesi kimliği kaynaktan bağımsız hesapla eşleşir · V-2 bir vektörü değişen kopyada kimlik değişir.
 *   S4     kenar kapalı → çıkış 3, hata sınıfı BAGLANTI · S4-b doğrulanamayan sertifika → çıkış 3, hata sınıfı TLS; ileti metni yok.
 *   S5-a…d kapılar: http origin → 4 · TLS kapalı → 4 · kanıt yazılamaz → 7 · --out yok → 4.
 *   S6     --phone-list AYRI çağrı: 5 adres, istek yok; --out ile birlikte → 4; ölçüm koşumu telefon listesi yazmaz.
 *   T-1…T-4 statik: pozitif liste · seçenek nesnesi / ifPassed / ölçülen bayraklar / katman ve hüküm işlevleri ipucu okumaz ·
 *          D8-E1/E2 kaynak kapsamı · "karar bekliyor" eşlemesi TEK satırda.
 *   D-1    pinler: belge §7 sonda pini = blok pinleri = sondanın gerçek SHA-256'sı; öz-test pini = bu dosyanın SHA-256'sı.
 *   B-0    belgedeki owner blokları: tam bir ölçüm + bir telefon listesi bloğu, tek satır, yalnız ASCII, yalnız AD-1.
 *   B-1…B-T2 (her biri İKİ KABUKTA: Windows PowerShell 5.1 ve pwsh 7; kabuk yoksa kalem ÖLÇÜLEMEDİ'dir — geçti DEĞİL):
 *          belgeden çıkarılan blok metni, yalnız test için .env yolu / sonda yolu / pin ikamesi ve sahte kullanıcı köküyle,
 *          sahte .env ve sahte kenara karşı koşar. B-1 olağan akış (çıkış 0, özet SHA'sı) · B-2 satır sayısı 0 ve 2 → sonda
 *          koşmaz · B-3 https olmayan / yollu değer → sonda koşmaz · B-4 pin uyuşmazlığı → sonda koşmaz · B-5 bozuk kenar →
 *          blok çıkış 2'yi aktarır · B-T telefon listesi bloğu (istek yok) · B-T2 telefon bloğunda pin uyuşmazlığı.
 *
 * ORTAM  : D8_SELFTEST_PORT  sahte kenar portu (varsayılan 8457; 8080 / 3002 / 5432 / 5447–5449 reddedilir → çıkış 4).
 *          D8_SELFTEST_PROBE başka bir sonda dosyası (negatif ayna / mutasyon provası). Verilirse D-1 pin kalemi DÜŞER (beklenen).
 *          D8_SELFTEST_WINPS_EXE / D8_SELFTEST_PWSH_EXE kabuk yürütülebilirinin adı (varsayılan powershell.exe / pwsh). Kabuk
 *          başlatılamazsa ya da sürümü tutmazsa o kabuğun B-* kalemleri ÖLÇÜLEMEDİ olur ve öz-test çıkışı 2'dir (0 DEĞİL).
 * KULLANIM: node d8-selftest.js   ÇIKIŞ: 0 hepsi PASS · 1 en az bir FAIL · 2 FAIL yok ama ÖLÇÜLEMEYEN var · 4 port kapısı
 */
const { spawn, execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path'); const os = require('os'); const https = require('https'); const crypto = require('crypto');

const FORBIDDEN_PORTS = [8080, 3002, 5432, 5447, 5448, 5449];
const PORT_RAW = process.env.D8_SELFTEST_PORT === undefined ? '8457' : String(process.env.D8_SELFTEST_PORT);
const PORT = /^\d{4,5}$/.test(PORT_RAW) ? Number(PORT_RAW) : NaN;
if (!(PORT >= 1024 && PORT <= 65535) || FORBIDDEN_PORTS.includes(PORT)) { console.error(`REDDEDİLDİ: D8_SELFTEST_PORT=${PORT_RAW} kullanılamaz (1024–65535; canlı / veritabanı portları ${FORBIDDEN_PORTS.join(', ')} yasak)`); process.exit(4); }
// K-PORT kaleminin alt süreçleri yalnız kapıyı ölçer: kapı geçilse bile dinleme / sonda koşumu / yeni alt süreç BAŞLAMAZ.
if (process.env.D8_SELFTEST_GATE_ONLY === '1') { console.log('KAPI GEÇİLDİ: port ' + PORT); process.exit(0); }

const PKG = path.join(__dirname, '..'); const REAL_PROBE = path.join(__dirname, 'd8-staff-surface-probe.js');
const PROBE = process.env.D8_SELFTEST_PROBE ? path.resolve(process.env.D8_SELFTEST_PROBE) : REAL_PROBE;
const DOC = path.join(PKG, 'EXTACC-D8-STAFF-SURFACE-PACKAGE-R01.md');
const API_SRC = path.join(PKG, '..', '..', '..', 'apps', 'api', 'src');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();

// ─── Ürün kaynağından okunan dayanaklar (sahte API bu değerlerle çalışır) ─────────────────────────────────────────────────
function sourceFacts() {
  const mw = fs.readFileSync(path.join(API_SRC, 'common', 'request-id.middleware.ts'), 'utf8');
  const main = fs.readFileSync(path.join(API_SRC, 'main.ts'), 'utf8'); const mod = fs.readFileSync(path.join(API_SRC, 'app.module.ts'), 'utf8');
  const h = /REQUEST_ID_HEADER\s*=\s*"([^"]+)"/.exec(mw); const s = /SAFE_REQUEST_ID\s*=\s*\/(.+)\/;/.exec(mw); const p = /setGlobalPrefix\(\s*"([^"]+)"\s*\)/.exec(main);
  return { header: h && h[1], safeSrc: s && s[1], safe: s ? new RegExp(s[1]) : null, prefix: p && p[1],
    echoes: /normalizeRequestId\(incoming\)\s*\?\?\s*randomUUID\(\)/.test(mw) && /res\.setHeader\(REQUEST_ID_HEADER,\s*requestId\)/.test(mw),
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
let mode = 'ok'; let seen = []; // seen: zemin gerçeği — kenarın gördüğü HAM istek + verdiği yanıt (üreten, durum, yankı)
const JSONH = { 'content-type': 'application/json', server: 'Caddy' };
const REDIRECT_TARGET = 'https://yonlendirme-hedefi.invalid/giris?next=gizli';
const STRICT_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/; // "biçime uymayan kimlik" senaryosu: API yalnız bu biçimi kabul eder
function send(res, s, status, headers, body, producer) {
  const h = {}; for (const k of Object.keys(headers)) if (headers[k] !== undefined) h[k] = headers[k]; // gelen istekte kimlik yoksa yansıtılacak değer de yoktur
  const v = h[F.header]; s.status = status; s.producer = producer; s.respId = v === undefined ? null : v; s.echoed = v === undefined ? 'none' : (v === s.rid ? 'same' : 'other');
  res.writeHead(status, h); res.end(body || '');
}
function apiSend(req, res, s, status, o) {
  o = o || {}; const mw = apiMw(req.method, req.url); s.apiMw = mw;
  if (mw === 'CORS') return send(res, s, 204, { 'content-length': '0', vary: 'Origin, Access-Control-Request-Headers', server: 'Caddy' }, '', 'api');
  if (mw === 'COZME-HATASI') return send(res, s, 400, Object.assign({}, JSONH), '{"statusCode":400,"message":"Bad Request"}', 'api');
  if (mw === 'ESLESMEZ') return send(res, s, 404, Object.assign({}, JSONH), '{"statusCode":404,"message":"Not Found"}', 'api');
  const inc = req.headers[F.header]; const accept = o.strict ? STRICT_RX : F.safe;
  const h = Object.assign({ 'x-powered-by': 'Express' }, JSONH);
  if (!o.strip) h[F.header] = (typeof inc === 'string' && accept.test(inc)) ? inc : crypto.randomUUID();
  return send(res, s, status, h, JSON.stringify({ statusCode: status, message: 'model' }), 'api');
}
function edge(req, res) {
  let bodyLen = 0; req.on('data', (c) => { bodyLen += c.length; });
  req.on('end', () => {
    const p = req.url; const h = req.headers; // Node req.url ham request-target'tır: './', '%2F', '?x=1' normalize edilmez
    const s = { method: req.method, url: p, cred: !!(h.authorization || h.cookie || h['x-api-key'] || h['proxy-authorization']), bodyLen, rid: h[F.header], hasRid: typeof h[F.header] === 'string' };
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
    switch (mode) {
      case 'ok': return healthy();
      case 'waf': return deny ? edge403({ 'content-type': 'text/html', server: 'cloudflare', 'cf-ray': 'test', 'cf-mitigated': 'challenge' }, '<html>Sorry, you have been blocked · cloudflare · error code: 1020</html>') : upstream();
      case 'bare': return deny ? edge403({}) : upstream();                                             // Server başlığı yok, boş gövde
      case 'behind': return deny ? edge403({ server: 'cloudflare', 'cf-ray': 'test' }) : upstream();    // sağlayıcı arkasında Caddy: boş gövde, imza yok
      case 'body403': return deny ? edge403(Object.assign({}, JSONH), '{"statusCode":403,"message":"Forbidden"}') : upstream(); // DOLU gövde, YANKISIZ (kenar üretir)
      case 'app403': return authLeak ? apiSend(req, res, s, 403) : healthy();                           // YANKILI 403 (API üretir)
      case 'api5xx': return authLeak ? apiSend(req, res, s, 503) : healthy();
      case 'api429': return authLeak ? apiSend(req, res, s, 429) : healthy();
      case 'edge5xx': return authLeak ? edgeSend(502, { server: 'Caddy' }, '') : healthy();
      case 'edge404': return authLeak ? edgeSend(404, { server: 'cloudflare' }, '') : healthy();
      case 'rate429': return authLeak ? edgeSend(429, { server: 'cloudflare', 'retry-after': '1' }, '') : healthy();
      case 'redirect': return authLeak ? edgeSend(302, { server: 'Caddy', location: REDIRECT_TARGET }, '') : healthy();
      case 'broken': return (deny && (np === '/api/auth/me' || admin)) ? apiSend(req, res, s, apiNatural(p)) : healthy(); // temizlenmiş yola göre sızdırır, HAM yolu iletir
      case 'webecho': {                                                                                 // zincirde başlığı yansıtan başka bir katman
        if (deny) return edge403({ server: 'Caddy', [F.header]: s.rid });
        return apiish ? apiSend(req, res, s, 401) : web200({ [F.header]: s.rid });
      }
      case 'apinoecho': return deny ? edge403() : upstream({ strip: true });
      case 'strictfmt': return deny ? edge403() : upstream({ strict: true });
      case 'uniform': return edge403();
      case 'fark403': return deny ? edge403({ server: 'Caddy', [F.header]: crypto.randomUUID() }) : upstream();
      case 'fark403api': return deny ? (apiish ? edge403({ server: 'Caddy', [F.header]: crypto.randomUUID() }) : edge403()) : upstream();
      case 'pos200': return (!deny && req.method === 'GET' && np === '/api/portal/cases') ? apiSend(req, res, s, 200) : healthy();
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
const V = (S) => S.ev.nameVerdict; const rowsOf = (S, g) => S.ev.rows.filter((x) => x.group === g);
const reasonCount = (S, name) => V(S).ret.reasons.filter((r) => r.reason === name).reduce((a, r) => a + r.count, 0);
const reasonNames = (S) => V(S).ret.reasons.map((r) => `${r.reason}×${r.count}`).join(',') || '-';
/** Sonda satırı ↔ zemin gerçeği (aynı sıra; uzunluk tutmuyorsa istisna → FAIL). */
const J = (S) => { if (!S.ev || S.gt.length !== S.ev.rows.length) throw new Error(`satır ${S.ev ? S.ev.rows.length : 'yok'} ≠ kenarın gördüğü ${S.gt.length}`); return S.ev.rows.map((row, i) => ({ row, gt: S.gt[i] })); };
const layerVec = (S) => S.ev.rows.map((x) => x.layerId).join(',');
const brief = (S) => `çıkış=${S.code} · ret=${S.ev ? V(S).ret.value : '?'} [${S.ev ? reasonNames(S) : '?'}] · katman=${S.ev ? V(S).layer.value : '?'} · kalibrasyon=${S.ev && S.ev.calibration ? S.ev.calibration.result : '?'}`;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd8-selftest-')); const cert = path.join(dir, 'cert.pem'); const key = path.join(dir, 'key.pem');
  let srv = null;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
    srv = https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, edge);
    await new Promise((r, j) => { srv.once('error', j); srv.listen(PORT, '127.0.0.1', r); });
  } catch (e) { console.log('OLCULEMEDI: sahte kenar kurulamadı (' + String((e && (e.code || e.message)) || e).slice(0, 120) + ')'); process.exit(2); }
  const ORIGIN = `https://localhost:${PORT}`;
  const baseEnv = {}; for (const k of Object.keys(process.env)) if (!/^(NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|D8_HTTP_TIMEOUT_MS|D8_SELFTEST_PORT|D8_SELFTEST_PROBE)$/i.test(k)) baseEnv[k] = process.env[k];
  const env = Object.assign({}, baseEnv, { NODE_EXTRA_CA_CERTS: cert });
  const run = (args, e, probe) => spawnP(process.execPath, [probe || PROBE].concat(args), e || env);
  /** Bir senaryo koşumu: sahte ucu kipe alır, sondayı koşturur, ham kanıtı + adsız özeti + zemin gerçeğini döndürür (hiç atmaz). */
  async function scenario(m, o) {
    o = o || {}; mode = m; seen = []; const out = path.join(dir, (o.tag || m) + '.json');
    const args = ['--alias', o.alias || 'AD-1', '--vantage', o.vantage || 'oz-test-yerel', '--origin', ORIGIN, '--out', out];
    const r = await run(args, o.env, o.probe); const gt = seen; seen = [];
    const sumPath = out.replace(/\.json$/, '.ozet.json'); const sumBytes = readBytes(sumPath);
    let sum = null; try { sum = sumBytes ? JSON.parse(sumBytes.toString('utf8')) : null; } catch (e) { sum = null; }
    return { mode: m, probe: o.probe || PROBE, code: r.code, log: r.log, out, ev: readJson(out), evBytes: readBytes(out), sumPath, sumBytes, sum, gt };
  }
  let gateSeq = 0;
  /** Kapı denemesi: verilen argümanlarla koşar; kenarın gördüğü istek sayısını da döndürür. */
  async function gate(args, e) { mode = 'ok'; seen = []; const r = await run(args, e); const n = seen.length; seen = []; return { code: r.code, log: r.log, seen: n }; }
  const gateOut = () => path.join(dir, `gate-${++gateSeq}.json`);

  const src = fs.readFileSync(PROBE, 'utf8');
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
    item('K-SRC', 'ürün kaynağı okundu (yankı kuralının dayanağı): başlık adı x-request-id · SAFE_REQUEST_ID biçimi · gelen değer geçerliyse AYNEN yanıta yazılır, değilse yenisi üretilir · ara katman forRoutes(\'*\') · genel önek "api" · enableCors — biri değişirse sondanın kuralı yeniden türetilmelidir',
      () => ({ ok: F.header === 'x-request-id' && F.prefix === 'api' && F.wildcard && F.cors && F.echoes && F.safe.test('d8r' + 'a'.repeat(32)) && !F.safe.test('-x') && !F.safe.test('a b') && !F.safe.test('a'.repeat(129)),
        obs: `başlık=${F.header} · biçim=/${F.safeSrc}/ · yankı satırı=${F.echoes} · forRoutes('*')=${F.wildcard} · önek=${F.prefix} · enableCors=${F.cors}` }));

    // K-PORT — port kapısı: bu dosya yasak portla başlatılır; kapı, sertifika / dinleme / sonda koşumundan ÖNCE durur.
    const portRuns = []; const portChild = (p) => spawnP(process.execPath, [__filename], Object.assign({}, baseEnv, { D8_SELFTEST_PORT: String(p), D8_SELFTEST_GATE_ONLY: '1' }));
    for (const p of FORBIDDEN_PORTS.concat(['80', 'abc'])) { const r = await portChild(p); portRuns.push({ p, code: r.code, rej: /REDDEDİLDİ/.test(r.log), passed: /KAPI GEÇİLDİ/.test(r.log) }); }
    const portOk = await portChild(PORT); // karşı girdi: izinli port kapıdan geçer (alt süreç yalnız kapıyı ölçer; dinlemez)
    item('K-PORT', 'öz-test port kapısı: D8_SELFTEST_PORT canlı / veritabanı portu (8080, 3002, 5432, 5447, 5448, 5449) ya da geçersiz (80, abc) ise çıkış 4 ve kapı geçilmez; izinli port (bu koşumun portu) kapıdan geçer; bu koşum verilen portta dinliyor',
      () => ({ ok: portRuns.length === 8 && portRuns.every((x) => x.code === 4 && x.rej && !x.passed) && portOk.code === 0 && /KAPI GEÇİLDİ/.test(portOk.log) && srv.address().port === PORT, obs: portRuns.map((x) => `${x.p}→${x.code}`).join(' · ') + ` · ${PORT}→${portOk.code} (geçti) · dinlenen=${srv.address().port}` }));

    // ── Sağlıklı kenar ──
    const S1 = await scenario('ok', { tag: 's1' });
    item('S1', 'sağlıklı kenar (Server: Caddy, boş 403): çıkış 0; bütün ret vektörleri 403 + yankısız; pozitifler beklendiği gibi; RET HÜKMÜ KAPALI ve KATMAN HÜKMÜ ADLANDIRILAMADI iki AYRI alan / iki ayrı satır; birleşik PASS alanı ya da satırı yok; KAPALI kaydında kapsam eki (istek profili · konum · vektör kümesi); ipucu caddy yalnız ipucu alanında; kanıtta yanıt başlığı DEĞERİ yok', () => {
      const d = rowsOf(S1, 'deny'); const a = rowsOf(S1, 'allow'); const v = V(S1);
      const ok = S1.code === 0 && S1.ev.exitCode === 0 && d.length === VEC.deny.length && a.length === VEC.allow.length && d.length > 0 && a.length > 0
        && d.every((x) => x.status === 403 && x.statusExpected === true && x.outcome === 'RET-403' && x.echo === 'YOK' && x.layerId !== 'UYGULAMA-API' && x.layerHint === 'caddy' && x.hints && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'Caddy' && x.hints.providerSignature === false)
        && a.every((x) => x.statusExpected === true)
        && v.ret.value === 'KAPALI' && v.ret.exitCode === 0 && v.ret.reasons.length === 0 && v.ret.pendingOwnerDecision === false
        && /istek profili/.test(v.ret.scope) && /konum/.test(v.ret.scope) && /vektör kümesi/.test(v.ret.scope)
        && v.layer.value === 'ADLANDIRILAMADI' && Object.keys(v).sort().join() === 'layer,ret' && Object.keys(v.layer).join() === 'value'
        && /^D8-RET-HUKMU=KAPALI$/m.test(S1.log) && /^D8-KATMAN-HUKMU=ADLANDIRILAMADI$/m.test(S1.log) && /^D8-KARAR-BEKLIYOR=HAYIR$/m.test(S1.log) && /^D8-CIKIS=0$/m.test(S1.log)
        && !/D-?8\s+PASS/i.test(S1.log) && !['pass', 'ok', 'verdict', 'layer'].some((k) => k in S1.ev) && S1.ev.rows.every((x) => !('ok' in x) && !('layer' in x))
        && (S1.ev.hintsOnly.denyLayerHints || {}).caddy === d.length && !/"cf-ray"|test"/.test(JSON.stringify(S1.ev.rows.map((x) => x.hints)));
      return { ok, obs: brief(S1) + ` · ret 403=${d.filter((x) => x.status === 403).length}/${d.length} · ipucu=${JSON.stringify(S1.ev.hintsOnly.denyLayerHints)}` };
    });
    item('K-1', 'yankılı kalibrasyon (sağlıklı kenar): 6 API pozitifini API üretti ve hepsinde gönderilen kimlik AYNEN döndü; 3 web pozitifinde başlık yok → kalibrasyon VAR; API pozitifleri UYGULAMA-API, web pozitifleri UYGULANAMAZ', () => {
      const c = S1.ev.calibration; const j = J(S1).filter((p) => p.row.group === 'allow'); const api = j.filter((p) => p.gt.producer === 'api'); const web = j.filter((p) => p.gt.producer === 'web');
      const ok = c.result === 'VAR' && api.length === 6 && web.length === 3 && c.apiPositives === 6 && c.apiEcho === 6 && c.webPositives === 3 && c.webMeasured === 3 && c.webEcho === 0 && c.outsidePrefixHeaderRows === 0
        && api.every((p) => p.gt.echoed === 'same' && p.row.echo === 'ESLESTI' && p.row.layerId === 'UYGULAMA-API') && web.every((p) => p.gt.echoed === 'none' && p.row.echo === 'YOK' && p.row.layerId === 'UYGULANAMAZ');
      return { ok, obs: `API yankı ${c.apiEcho}/${c.apiPositives} · web yankı ${c.webEcho}/${c.webPositives} · önek dışı başlık ${c.outsidePrefixHeaderRows} → ${c.result}` };
    });
    item('L-1', '"API değil" çıkarımı YALNIZ uygun yollarda (sağlıklı kenar, hepsi yankısız 403): düz /api yolu (GET/POST/HEAD, sorgulu) → API-DEGIL-CIKARIM; OPTIONS /api → OLCULEMEDI (ön uçuş ara katmandan önce biter); çift eğik çizgi ve çözülemeyen yüzde dizisi → OLCULEMEDI (model: API işleseydi de yankı OLMAZDI); web yolları ve OPTIONS / → UYGULANAMAZ; çıkarım yapılan HER satırda model ham ve temizlenmiş yolda "ara katman çalışırdı" der', () => {
      const d = rowsOf(S1, 'deny'); const inf = d.filter((x) => x.layerId === 'API-DEGIL-CIKARIM');
      const sound = inf.every((x) => apiMw(x.method, x.path) === 'CALISIR' && apiMw(x.method, cleanPath(x.path)) === 'CALISIR');
      const ex = [['GET', '/api/auth/me', 'API-DEGIL-CIKARIM'], ['POST', '/api/auth/login', 'API-DEGIL-CIKARIM'], ['HEAD', '/api/auth/me', 'API-DEGIL-CIKARIM'], ['GET', '/api/portal/admin/documents/pending?x=1', 'API-DEGIL-CIKARIM'],
        ['OPTIONS', '/api/auth/me', 'OLCULEMEDI'], ['GET', '//api/portal/admin/documents/pending', 'OLCULEMEDI'], ['GET', '/api/portal/admin%c0%afdocuments/pending', 'OLCULEMEDI'],
        ['OPTIONS', '/', 'UYGULANAMAZ'], ['GET', '/', 'UYGULANAMAZ'], ['GET', '/robots.txt', 'UYGULANAMAZ'], ['GET', '/_next/../auth/login', 'UYGULANAMAZ']];
      const got = ex.map(([m, p, l]) => { const x = d.find((y) => y.method === m && y.path === p); return { m, p, l, g: x ? x.layerId : 'SATIR-YOK' }; });
      const model = apiMw('OPTIONS', '/api/auth/me') === 'CORS' && apiMw('GET', '//api/portal/admin/documents/pending') === 'ESLESMEZ' && apiMw('GET', '/api/portal/admin%c0%afdocuments/pending') === 'COZME-HATASI' && apiMw('GET', '/api/auth/me') === 'CALISIR';
      const cnt = d.reduce((m, x) => { m[x.layerId] = (m[x.layerId] || 0) + 1; return m; }, {});
      return { ok: inf.length > 0 && sound && model && got.every((x) => x.g === x.l), obs: `ret satırı katman dağılımı=${JSON.stringify(cnt)} · çıkarım satırı=${inf.length} (model uyumlu=${sound}) · örnek=${got.filter((x) => x.g === x.l).length}/${got.length}${got.filter((x) => x.g !== x.l).map((x) => ` [${x.m} ${x.p}: ${x.g}≠${x.l}]`).join('')}` };
    });
    item('S1-p', `HAM YOL korunur: kaynak vektör == kanıt satırı == kenarın gördüğü req.url (yöntem dahil, aynı sıra); './', '%2F', '?x=1', büyük harf, %00, çift kodlama, çift slash, unicode slash birebir`, () => {
      const rowPaths = S1.ev.rows.map((x) => ({ method: x.method, url: x.path })); const same = (a, b) => a.length === b.length && a.every((x, i) => x.method === b[i].method && x.url === b[i].url);
      const raw = ['/api/portal/./admin/documents/pending', '/api/portal%2Fadmin/documents/pending', '/api/portal/admin/documents/pending?x=1', '/api/portal/ADMIN/documents/pending', '/api/portal/cases%00/admin', '/api/portal/documents/%252e%252e/admin', '//api/portal/admin/documents/pending', '/api/portal/admin%c0%afdocuments/pending'];
      return { ok: VEC.all.length === S1.ev.deny + S1.ev.allow && VEC.all.length > 0 && same(VEC.all, rowPaths) && same(rowPaths, S1.gt) && raw.every((p) => S1.gt.some((s) => s.url === p)), obs: `kenar gördü=${S1.gt.length} · kaynak=${VEC.all.length} · kanıt satırı=${rowPaths.length} · ham örnek=${raw.filter((p) => S1.gt.some((s) => s.url === p)).length}/${raw.length}` };
    });
    item('S1-c', 'KİMLİK/GÖVDE ölçümü: kenar hiçbir istekte kimlik başlığı görmedi; gövde 0 (GET/DELETE/HEAD/OPTIONS) veya 2 (POST/PUT/PATCH "{}"); kanıt measured {credentialHeaderRequests=0, nonEmptyBodyRequests=0, requestCount=deny+allow, bodies.emptyJson=POST+PUT+PATCH sayısı, bodies.empty=GET+DELETE+HEAD+OPTIONS sayısı}; design beyanı AYRI alanda; her satırda sent.headerNames/body; gönderilen başlık adları arasında yalnız istek kimliği eklendi', () => {
      const g = S1.gt; const credSeen = g.filter((s) => s.cred).length; const badBody = g.filter((s) => !((s.bodyLen === 0 && /^(GET|DELETE|HEAD|OPTIONS)$/.test(s.method)) || (s.bodyLen === 2 && /^(POST|PUT|PATCH)$/.test(s.method)))).length;
      const M = S1.ev.measured; const nWrite = g.filter((s) => /^(POST|PUT|PATCH)$/.test(s.method)).length; const nNoBody = g.filter((s) => /^(GET|DELETE|HEAD|OPTIONS)$/.test(s.method)).length; const e = S1.ev;
      const names = ['host', 'user-agent', 'content-type', 'accept', F.header].sort().join();
      const ok = credSeen === 0 && badBody === 0 && g.length === e.deny + e.allow && M.credentialHeaderRequests === 0 && M.nonEmptyBodyRequests === 0 && M.requestCount === e.deny + e.allow && !M.bodies.other && M.bodies.emptyJson === nWrite && M.bodies.empty === nNoBody && (M.bodies.empty + M.bodies.emptyJson) === M.requestCount
        && e.design && e.design.credentialsSent === false && e.design.writesAttempted === false && e.credentialsSent === undefined && e.rows.every((x) => x.sent && Array.isArray(x.sent.headerNames) && x.sent.headerNames.slice().sort().join() === names && (x.sent.body === '' || x.sent.body === '{}'))
        && e.requestProfile.headerNames.slice().sort().join() === names && S1.sum.requestProfile.headerNames.slice().sort().join() === names && S1.sum.requestProfile.credentialHeaderRequests === 0 && S1.sum.requestProfile.nonEmptyBodyRequests === 0;
      return { ok, obs: `kenar: kimlik=${credSeen} · gövde-uyumsuz=${badBody} · POST/PUT/PATCH=${nWrite} · GET/DELETE/HEAD/OPTIONS=${nNoBody} · sonda measured=${JSON.stringify(M)} · başlık adları=${e.requestProfile.headerNames.join(',')}` };
    });
    const S1b = await scenario('ok', { tag: 's1b', alias: 'AD-27' });
    item('Y-1', 'istek kimliği: kenar 68 isteğin hepsinde başlığı gördü; her değer ürün kaynağındaki SAFE_REQUEST_ID biçimine uyar (uymasaydı API kendi değerini üretirdi → K-4); koşum içinde ve iki koşum arasında tekrar yok (tek kullanımlık); kanıttaki sent.requestId kenarın gördüğü değerle aynı', () => {
      const g = S1.gt; const ids = g.map((s) => s.rid); const ids2 = S1b.gt.map((s) => s.rid);
      const ok = g.length === VEC.all.length && g.every((s) => s.hasRid && F.safe.test(s.rid)) && new Set(ids).size === ids.length && ids2.length === ids.length && ids.every((id) => !ids2.includes(id)) && S1.ev.rows.every((x, i) => x.sent.requestId === g[i].rid)
        && S1.sum.requestProfile.distinctRequestIds === new Set(ids).size && S1.sum.requestProfile.requestCount === g.length && !ids.some((id) => S1.sumBytes.toString('utf8').includes(id));
      return { ok, obs: `başlıklı=${g.filter((s) => s.hasRid).length}/${g.length} · biçime uyan=${g.filter((s) => s.hasRid && F.safe.test(s.rid)).length} · tekil=${new Set(ids).size} · ikinci koşumla ortak=${ids.filter((id) => ids2.includes(id)).length}` };
    });
    item('S7', 'D8-E1/E2 kapsamı: deny kümesinde 3 HEAD + 3 OPTIONS (üç yüzey: sayfa /, personel API /api/auth/me, admin /api/portal/admin/documents/pending) ve 18 kodlama/normalizasyon varyantı; hepsi sağlıklı kenarda 403; HEAD/OPTIONS gövdesiz; adsız özette yöntem kapsamı sayıları (beş yöntem · HEAD n/3 · OPTIONS n/3 · varyant n/18) satırlarla uyumlu', () => {
      const d = rowsOf(S1, 'deny'); const headRows = d.filter((x) => x.method === 'HEAD'); const optRows = d.filter((x) => x.method === 'OPTIONS');
      const evRows = evasionPaths.map((p) => d.find((x) => x.path === p)); const evAll403 = evRows.every((x) => x && x.status === 403 && x.statusExpected === true && x.vectorClass === 'VARYANT');
      const hoAll403 = headRows.concat(optRows).every((x) => x.status === 403 && x.statusExpected === true); const hoNoBody = S1.gt.filter((s) => /^(HEAD|OPTIONS)$/.test(s.method)).every((s) => s.bodyLen === 0);
      const hoSurfaces = ['/', '/api/auth/me', '/api/portal/admin/documents/pending'].every((p) => headRows.some((x) => x.path === p) && optRows.some((x) => x.path === p));
      const c = S1.sum.coverage; const five = d.length - 3 - 3 - 18;
      const covOk = c.HEAD.of === 3 && c.HEAD.measured === 3 && c.HEAD.rejected403 === 3 && c.OPTIONS.of === 3 && c.OPTIONS.measured === 3 && c.OPTIONS.rejected403 === 3 && c.VARYANT.of === 18 && c.VARYANT.measured === 18 && c.VARYANT.rejected403 === 18 && c['BES-YONTEM'].of === five && c['BES-YONTEM'].rejected403 === five && five > 0 && JSON.stringify(c) === JSON.stringify(S1.ev.coverage);
      return { ok: headRows.length === 3 && optRows.length === 3 && hoSurfaces && hoAll403 && hoNoBody && evRows.filter(Boolean).length === 18 && evAll403 && covOk, obs: `HEAD=${headRows.length} · OPTIONS=${optRows.length} · varyant=${evRows.filter(Boolean).length}/18 · hepsi 403=${hoAll403 && evAll403} · HEAD/OPTIONS gövdesiz=${hoNoBody} · özet kapsamı=${JSON.stringify(c)}` };
    });

    // ── Bozuk kenar (ikinci ad: AD-2) ──
    const s1Before = { ev: S1.evBytes ? sha(S1.evBytes) : null, sum: S1.sumBytes ? sha(S1.sumBytes) : null };
    const S2 = await scenario('broken', { tag: 's2', alias: 'AD-2' });
    item('S2', 'bozuk kenar TEMİZLENMİŞ yola göre sızdırır, HAM yolu API\'ye iletir: çıkış 2, RET KAPALI-DEGIL; sızan istek = /api/auth/me (GET+HEAD+OPTIONS=3) + admin\'e normalize olan 17 = 20; API\'nin yankılı yanıtları (401/404) UYGULAMA-API ve bulgu; OPTIONS 204 reddedilmedi = bulgu; çift eğik çizgili istek API\'de önek dışına düşer → yankısız 404 → API\'den geldiği KANITSIZ (ayrı neden); başka yere normalize olanlar (büyük harf ADMIN, %00, geçersiz unicode, /API/, cases/, cases;x=1, traversal→/auth/login) 403 kalır; ifPassed bulgu satırlarında dolu', () => {
      const j = J(S2).filter((p) => p.row.group === 'deny'); const leaked = j.filter((p) => p.gt.producer === 'api');
      const expectLeak = VEC.deny.filter((v) => { const np = cleanPath(v.url); return np === '/api/auth/me' || ADMIN_RX.test(np); }).length;
      const me = leaked.filter((p) => cleanPath(p.row.path) === '/api/auth/me').length;
      const n2xx = leaked.filter((p) => p.gt.status >= 200 && p.gt.status < 300).length; const nProven = leaked.filter((p) => !(p.gt.status >= 200 && p.gt.status < 300) && p.gt.echoed === 'same').length; const nUnproven = leaked.filter((p) => !(p.gt.status >= 200 && p.gt.status < 300) && p.gt.echoed === 'none').length;
      const leakedAdminForms = ['/api/portal/%61dmin/documents/pending', '/api/portal/%61dmin/create-user', '/api/portal/admin%2Fdocuments%2Fpending', '//api/portal/admin/documents/pending', '/api/portal/cases/../admin/documents/pending', '/api/portal/documents/..%2Fadmin/documents/pending', '/api/portal/documents/%252e%252e/admin', '/api/portal/./admin/documents/pending'];
      const still403Forms = ['/api/portal/ADMIN/documents/pending', '/api/portal/cases%00/admin', '/api/portal/admin%c0%afdocuments/pending', '/API/portal/cases', '/api/portal/cases/', '/api/portal/cases;x=1', '/_next/../auth/login', '/_next/%2e%2e/auth/login', '/intake/abc/../../auth/login'];
      const leakedOk = leakedAdminForms.every((p) => leaked.some((q) => q.row.path === p && q.row.status !== 403)); const still403Ok = still403Forms.every((p) => { const x = j.find((q) => q.row.path === p); return x && x.row.status === 403 && x.gt.producer === 'edge'; });
      const dbl = leaked.find((p) => p.row.path === '//api/portal/admin/documents/pending');
      const ok = S2.code === 2 && V(S2).ret.value === 'KAPALI-DEGIL' && leaked.length === 20 && expectLeak === 20 && me === 3 && leakedOk && still403Ok
        && leaked.every((p) => p.row.status === p.gt.status && p.row.status !== 403 && p.row.statusExpected === false && typeof p.row.ifPassed === 'string' && p.row.ifPassed.length > 10)
        && leaked.filter((p) => p.gt.echoed === 'same').every((p) => p.row.echo === 'ESLESTI' && p.row.layerId === 'UYGULAMA-API') && leaked.filter((p) => p.gt.echoed === 'none').every((p) => p.row.echo === 'YOK' && p.row.layerId === 'OLCULEMEDI')
        && n2xx === 2 && nUnproven === 1 && nProven === 17 && reasonCount(S2, 'RET-VEKTORU-REDDEDILMEDI-2XX') === n2xx && reasonCount(S2, 'API-KANITLI-403-DISI') === nProven && reasonCount(S2, 'API-KANITSIZ-403-DISI') === nUnproven
        && dbl && dbl.gt.apiMw === 'ESLESMEZ' && dbl.row.status === 404 && S2.ev.findings.length === n2xx + nProven && V(S2).layer.value === 'ADLANDIRILDI-API' && S2.ev.nameAlias === 'AD-2' && S2.sum.nameAlias === 'AD-2';
      return { ok, obs: brief(S2) + ` · sızan=${leaked.length} (beklenen ${expectLeak}) · me=${me} · 2xx=${n2xx} · yankılı 403 dışı=${nProven} · yankısız 403 dışı=${nUnproven} · admin'e sızan varyant=${leakedAdminForms.filter((p) => leaked.some((q) => q.row.path === p)).length}/${leakedAdminForms.length} · 403 kalan=${still403Forms.filter((p) => { const x = j.find((q) => q.row.path === p); return x && x.row.status === 403; }).length}/${still403Forms.length}` };
    });
    item('N-5', 'BİR SÜREÇ = BİR AD = BİR KANIT: AD-2 koşumu (bozuk kenar) AD-1\'in ham kanıtını ve özetini DEĞİŞTİRMEDİ (bayt özeti aynı); iki adın hükmü ayrı dosyalarda ayrı (AD-1 KAPALI · AD-2 KAPALI-DEGIL); sonda kaynağında kendi dosyası dışında okuma yok (tek readFileSync, __filename; dizin tarama / başka dosya okuma yok)', () => {
      const after = { ev: sha(fs.readFileSync(S1.out)), sum: sha(fs.readFileSync(S1.sumPath)) };
      const reads = (src.match(/readFileSync\(/g) || []).length; const staticOk = reads === 1 && /readFileSync\(__filename\)/.test(src) && !/readdir|readFile\(|createReadStream|opendir|existsSync\((?!OUT\)|SUMMARY_OUT\))/.test(src);
      const ok = s1Before.ev !== null && s1Before.sum !== null && after.ev === s1Before.ev && after.sum === s1Before.sum && S1.ev.nameAlias === 'AD-1' && S1.sum.nameAlias === 'AD-1' && V(S1).ret.value === 'KAPALI' && S2.ev.nameAlias === 'AD-2' && V(S2).ret.value === 'KAPALI-DEGIL' && S1.out !== S2.out && staticOk;
      return { ok, obs: `AD-1 dosyaları değişmedi=${after.ev === s1Before.ev && after.sum === s1Before.sum} · AD-1=${V(S1).ret.value} · AD-2=${V(S2).ret.value} · readFileSync sayısı=${reads} · statik=${staticOk}` };
    });

    // ── İpucu senaryoları: ipuçları değişir, katman kimliği ve hükümler DEĞİŞMEZ ──
    const sameAsS1 = (S) => S.code === 0 && V(S).ret.value === 'KAPALI' && V(S).layer.value === 'ADLANDIRILAMADI' && layerVec(S1).length > 0 && layerVec(S) === layerVec(S1) && JSON.stringify(S.ev.layerCounts) === JSON.stringify(S1.ev.layerCounts);
    const S3 = await scenario('waf', { tag: 's3' });
    item('S3', 'sağlayıcı reddi taklidi (imzalı gövde + Server: cloudflare + cf-ray + cf-mitigated), yankısız: ipucu edge-provider (gövdeli retlerde; HEAD gövdesiz → none) YALNIZ ipucu alanında; katman kimliği satır satır S1 ile AYNI, iki hüküm S1 ile AYNI (imza / başlık katman kimliğine girmez; sağlayıcı adlandırılmaz); adsız özette sağlayıcı adı yok', () => {
      const d = rowsOf(S3, 'deny'); const head = d.filter((x) => x.method === 'HEAD'); const body = d.filter((x) => x.method !== 'HEAD'); const h = S3.ev.hintsOnly.denyLayerHints || {};
      const ok = sameAsS1(S3) && h['edge-provider'] === body.length && h.none === head.length && body.length > 0 && head.length > 0
        && body.every((x) => x.layerHint === 'edge-provider' && x.hints.providerSignature && x.hints.edgeHeaderPresent && x.hints.cfMitigatedPresent && x.hints.serverHeaderValue === 'cloudflare' && x.hints.bodyEmpty === false)
        && head.every((x) => x.layerHint === null && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'cloudflare' && x.hints.edgeHeaderPresent === true)
        && !/cloudflare|caddy|edge-provider/i.test(S3.sumBytes.toString('utf8')) && !Object.keys(S3.ev.layerCounts.deny).some((k) => /caddy|provider|cloudflare|kenar|tunel/i.test(k));
      return { ok, obs: brief(S3) + ` · ipucu=${JSON.stringify(h)} · katman kimliği S1 ile aynı=${layerVec(S3) === layerVec(S1)}` };
    });
    const S3b = await scenario('bare', { tag: 's3b' });
    item('S3-b', 'boş 403 gövdesi, Server başlığı YOK: ipucu YOK (boş gövde tek başına ipucu da üretmez); katman kimliği ve iki hüküm S1 ile AYNI', () => {
      const d = rowsOf(S3b, 'deny'); const h = S3b.ev.hintsOnly.denyLayerHints || {};
      return { ok: sameAsS1(S3b) && h.none === d.length && d.every((x) => x.layerHint === null && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === '' && x.hints.providerSignature === false), obs: brief(S3b) + ` · ipucu=${JSON.stringify(h)}` };
    });
    const S3c = await scenario('behind', { tag: 's3c' });
    item('S3-c', 'boş 403 gövdesi, Server: cloudflare, imza YOK: ipucu YOK; serverHeaderValue=cloudflare yalnız ipucu alanında; katman kimliği ve iki hüküm S1 ile AYNI', () => {
      const d = rowsOf(S3c, 'deny'); const h = S3c.ev.hintsOnly.denyLayerHints || {};
      return { ok: sameAsS1(S3c) && h.none === d.length && d.every((x) => x.layerHint === null && x.hints.bodyEmpty === true && x.hints.serverHeaderValue === 'cloudflare' && x.hints.edgeHeaderPresent === true && x.hints.cfMitigatedPresent === false), obs: brief(S3c) + ` · ipucu=${JSON.stringify(h)}` };
    });
    // ── Aynı görünen iki 403: gövdesi dolu ama YANKISIZ (kenar) ↔ YANKILI (API) ──
    const S3dN = await scenario('body403', { tag: 's3dn' });
    item('S3-dN', 'gövdesi DOLU JSON ama YANKISIZ 403 (uygulama hata gövdesine benzeyen yanıtı KENAR üretir): çıkış 0, RET KAPALI; katman kimliği S1 ile AYNI (dolu gövde katman kimliğine girmez; düz /api yolunda "API değil" çıkarımı); dolu gövde sayısı yalnız ipucu alanında (HEAD gövdesiz → sayılmaz; S1\'de 0)', () => {
      const d = rowsOf(S3dN, 'deny'); const body = d.filter((x) => x.method !== 'HEAD'); const head = d.filter((x) => x.method === 'HEAD'); const j = J(S3dN).filter((p) => p.row.group === 'deny');
      const ok = sameAsS1(S3dN) && j.every((p) => p.gt.producer === 'edge' && p.gt.echoed === 'none') && S3dN.ev.hintsOnly.fullBody403WithoutProviderSignature === body.length && body.length > 0 && body.every((x) => x.hints.bodyEmpty === false && x.hints.providerSignature === false) && head.every((x) => x.hints.bodyEmpty === true)
        && S1.ev.hintsOnly.fullBody403WithoutProviderSignature === 0 && d.find((x) => x.method === 'GET' && x.path === '/api/auth/me').layerId === 'API-DEGIL-CIKARIM';
      return { ok, obs: brief(S3dN) + ` · dolu gövdeli 403 (ipucu)=${S3dN.ev.hintsOnly.fullBody403WithoutProviderSignature}/${body.length} · S1=${S1.ev.hintsOnly.fullBody403WithoutProviderSignature}` };
    });
    const S3dY = await scenario('app403', { tag: 's3dy' });
    item('S3-dY', 'YANKILI 403 (aynı dolu gövde, bu kez API üretir: kenar geçirmiş, uygulama reddetmiş): o satırlar RET-403 + yankı ESLESTI + UYGULAMA-API; çıkış 5, RET DEGERLENDIRME-GEREKIR, owner kararı BEKLİYOR işareti; hüküm ne KAPALI (0) ne KAPALI-DEGIL (2); katman hükmü ADLANDIRILDI-API; sızmayan satırların katman kimliği S1 ile aynı', () => {
      const j = J(S3dY).filter((p) => p.row.group === 'deny'); const api = j.filter((p) => p.gt.producer === 'api'); const rest = j.filter((p) => p.gt.producer !== 'api'); const s1d = rowsOf(S1, 'deny');
      const ok = S3dY.code === 5 && V(S3dY).ret.value === 'DEGERLENDIRME-GEREKIR' && V(S3dY).ret.exitCode === 5 && V(S3dY).ret.pendingOwnerDecision === true && api.length > 0 && reasonCount(S3dY, 'API-KANITLI-403') === api.length
        && V(S3dY).ret.reasons.length === 1 && V(S3dY).ret.reasons[0].pending === true && api.every((p) => p.gt.status === 403 && p.gt.echoed === 'same' && p.row.status === 403 && p.row.outcome === 'RET-403' && p.row.statusExpected === true && p.row.echo === 'ESLESTI' && p.row.layerId === 'UYGULAMA-API')
        && rest.length > 0 && rest.every((p) => p.row.layerId === s1d[j.indexOf(p)].layerId) && V(S3dY).layer.value === 'ADLANDIRILDI-API' && S3dY.ev.findings.length === 0
        && /^D8-KARAR-BEKLIYOR=EVET$/m.test(S3dY.log) && /^D8-RET-HUKMU=DEGERLENDIRME-GEREKIR$/m.test(S3dY.log) && S3dY.sum.nameVerdict.ret.pendingOwnerDecision === true && S3dY.sum.exitCode === 5
        && JSON.stringify(S3dY.ev.outcomeCounts.deny) === JSON.stringify(S3dN.ev.outcomeCounts.deny) && S3dN.code === 0;
      return { ok, obs: brief(S3dY) + ` · API'nin ürettiği 403=${api.length} · karar bekliyor=${V(S3dY).ret.pendingOwnerDecision} · ret sonucu sayıları S3-dN ile aynı=${JSON.stringify(S3dY.ev.outcomeCounts.deny) === JSON.stringify(S3dN.ev.outcomeCounts.deny)} (S3-dN çıkış ${S3dN.code})` };
    });

    // ── Kalibrasyon senaryoları ──
    const K2 = await scenario('webecho', { tag: 'k2' });
    item('K-2', 'ters kalibrasyon: zincirde başlığı yansıtan başka bir katman var (web yanıtlarında ve kenar 403\'lerinde de yankı) → kalibrasyon GECERSIZ; 68 satırın hepsinde yankı ESLESTI olduğu halde hepsi OLCULEMEDI (UYGULAMA-API 0, "API değil" 0); katman hükmü OLCULEMEDI; çıkış 5 (API kaynaklı 403 denetimi yapılamadı) — KAPALI değil; "karar bekliyor" işareti YOK (API\'nin ürettiği kanıtlı 403 yok)', () => {
      const c = K2.ev.calibration; const r = K2.ev.rows;
      const ok = K2.code === 5 && c.result === 'GECERSIZ' && c.webEcho === 3 && c.outsidePrefixHeaderRows > 3 && r.length === VEC.all.length && r.every((x) => x.echo === 'ESLESTI' && x.layerId === 'OLCULEMEDI') && V(K2).layer.value === 'OLCULEMEDI'
        && V(K2).ret.value === 'DEGERLENDIRME-GEREKIR' && reasonCount(K2, 'KALIBRASYON-GECERSIZ') === 1 && reasonCount(K2, 'API-KANITLI-403') === 0 && V(K2).ret.pendingOwnerDecision === false && K2.gt.every((s) => s.echoed === 'same');
      return { ok, obs: brief(K2) + ` · web yankı ${c.webEcho}/${c.webPositives} · önek dışı başlıklı yanıt=${c.outsidePrefixHeaderRows} · UYGULAMA-API=${r.filter((x) => x.layerId === 'UYGULAMA-API').length}` };
    });
    const K3 = await scenario('apinoecho', { tag: 'k3' });
    item('K-3', 'API pozitifleri beklenen kodu (401) verdi ama YANKISIZ (kimlik zincirde düşüyor): kalibrasyon YOK; hiçbir satırda "API değil" çıkarımı ve UYGULAMA-API yok (hepsi OLCULEMEDI); ret vektörü sayıları S1 ile AYNI olduğu halde çıkış 5 — KAPALI değil; katman hükmü OLCULEMEDI', () => {
      const c = K3.ev.calibration; const r = K3.ev.rows;
      const ok = K3.code === 5 && c.result === 'YOK' && c.apiEcho === 0 && rowsOf(K3, 'allow').every((x) => x.statusExpected === true) && r.every((x) => x.layerId === 'OLCULEMEDI') && V(K3).layer.value === 'OLCULEMEDI' && V(K3).ret.value === 'DEGERLENDIRME-GEREKIR'
        && reasonCount(K3, 'KALIBRASYON-YOK') === 1 && V(K3).ret.reasons.length === 1 && JSON.stringify(K3.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts) && S1.code === 0;
      return { ok, obs: brief(K3) + ` · API yankı ${c.apiEcho}/${c.apiPositives} · "API değil" çıkarımı=${r.filter((x) => x.layerId === 'API-DEGIL-CIKARIM').length} · ret sonucu sayıları S1 ile aynı=${JSON.stringify(K3.ev.outcomeCounts) === JSON.stringify(S1.ev.outcomeCounts)}` };
    });
    const K4 = await scenario('strictfmt', { tag: 'k4' });
    item('K-4', 'biçime uymayan kimlik: API gelen değeri kabul etmiyor ve KENDİ değerini üretiyor → API pozitiflerinde başlık VAR ama FARKLI-DEGER (yankı sayılmaz); kalibrasyon YOK; UYGULAMA-API 0; çıkış 5; API\'nin ürettiği değerler kanıta yazılmaz', () => {
      const j = J(K4); const other = j.filter((p) => p.gt.echoed === 'other'); const txt = K4.evBytes.toString('utf8') + K4.sumBytes.toString('utf8');
      const ok = K4.code === 5 && other.length === 6 && other.every((p) => p.gt.producer === 'api' && p.row.echo === 'FARKLI-DEGER' && p.row.layerId === 'OLCULEMEDI' && p.row.statusExpected === true) && K4.ev.calibration.result === 'YOK' && K4.ev.calibration.apiEcho === 0
        && K4.ev.rows.every((x) => x.layerId !== 'UYGULAMA-API' && x.layerId !== 'API-DEGIL-CIKARIM') && reasonCount(K4, 'FARKLI-DEGERLI-KIMLIK-BASLIGI') === 6 && reasonCount(K4, 'KALIBRASYON-YOK') === 1 && V(K4).ret.value === 'DEGERLENDIRME-GEREKIR' && other.every((p) => p.gt.respId && !txt.includes(p.gt.respId));
      return { ok, obs: brief(K4) + ` · farklı değerli API yanıtı=${other.length} · API yankı ${K4.ev.calibration.apiEcho}/${K4.ev.calibration.apiPositives}` };
    });
    const F1 = await scenario('fark403', { tag: 'f1' });
    item('F-1', 'farklı değerli başlık (kenar bütün ret 403\'lerine KENDİ kimlik değerini yazıyor): başlık VAR ama yankı DEĞİL → ret satırlarında yankı FARKLI-DEGER, UYGULAMA-API 0; önek dışı yolda başlık görüldüğü için kalibrasyon GECERSIZ; çıkış 5; yanıt başlığı DEĞERLERİ ham kanıta ve özete yazılmaz', () => {
      const j = J(F1).filter((p) => p.row.group === 'deny'); const txt = F1.evBytes.toString('utf8') + F1.sumBytes.toString('utf8');
      const ok = F1.code === 5 && j.length > 0 && j.every((p) => p.gt.echoed === 'other' && p.row.echo === 'FARKLI-DEGER' && p.row.layerId === 'OLCULEMEDI' && p.row.status === 403) && F1.ev.calibration.result === 'GECERSIZ' && F1.ev.calibration.webEcho === 0 && F1.ev.calibration.apiEcho === 6
        && V(F1).layer.value === 'OLCULEMEDI' && V(F1).ret.value === 'DEGERLENDIRME-GEREKIR' && reasonCount(F1, 'FARKLI-DEGERLI-KIMLIK-BASLIGI') === j.length && reasonCount(F1, 'API-KANITLI-403') === 0 && j.every((p) => p.gt.respId && !txt.includes(p.gt.respId));
      return { ok, obs: brief(F1) + ` · farklı değerli ret yanıtı=${j.filter((p) => p.row.echo === 'FARKLI-DEGER').length}/${j.length} · yanıt değeri kanıtta=${j.filter((p) => txt.includes(String(p.gt.respId))).length}` };
    });
    const F2 = await scenario('fark403api', { tag: 'f2' });
    item('F-2', 'farklı değerli başlık YALNIZ API önekli ret yanıtlarında: kalibrasyon VAR kalır; o satırlar OLCULEMEDI (ne UYGULAMA-API ne "API değil" çıkarımı); başlıksız web satırları UYGULANAMAZ; kaynak okumasıyla açıklanamayan gözlem → çıkış 5; katman hükmü OLCULEMEDI', () => {
      const j = J(F2).filter((p) => p.row.group === 'deny'); const other = j.filter((p) => p.gt.echoed === 'other'); const none = j.filter((p) => p.gt.echoed === 'none');
      const ok = F2.code === 5 && F2.ev.calibration.result === 'VAR' && other.length > 0 && none.length > 0 && other.every((p) => p.row.echo === 'FARKLI-DEGER' && p.row.layerId === 'OLCULEMEDI') && none.every((p) => p.row.echo === 'YOK' && p.row.layerId !== 'UYGULAMA-API')
        && reasonCount(F2, 'FARKLI-DEGERLI-KIMLIK-BASLIGI') === other.length && V(F2).ret.reasons.length === 1 && V(F2).ret.value === 'DEGERLENDIRME-GEREKIR' && V(F2).layer.value === 'OLCULEMEDI' && rowsOf(F2, 'deny').every((x) => x.layerId !== 'UYGULAMA-API');
      return { ok, obs: brief(F2) + ` · farklı değerli=${other.length} · başlıksız=${none.length}` };
    });

    // ── 403 dışı yanıtlar: aynı durum sınıfı, yankıya göre ayrı hüküm ──
    const aff = (S, st) => J(S).filter((p) => p.row.group === 'deny' && p.gt.status === st);
    const L2 = await scenario('api5xx', { tag: 'l2' });
    item('L-2', 'yankılı 5xx (ret vektöründe 503\'ü API üretir): SUNUCU-HATASI-5XX + UYGULAMA-API → uygulamaya ulaştı; çıkış 2, RET KAPALI-DEGIL', () => {
      const a = aff(L2, 503); const ok = L2.code === 2 && a.length > 0 && a.every((p) => p.gt.producer === 'api' && p.gt.echoed === 'same' && p.row.outcome === 'SUNUCU-HATASI-5XX' && p.row.layerId === 'UYGULAMA-API') && V(L2).ret.value === 'KAPALI-DEGIL' && reasonCount(L2, 'API-KANITLI-403-DISI') === a.length && reasonCount(L2, 'API-KANITSIZ-5XX') === 0;
      return { ok, obs: brief(L2) + ` · yankılı 503=${a.length}` };
    });
    const L2b = await scenario('api429', { tag: 'l2b' });
    item('L-2b', 'yankılı 429 (API\'nin hız sınırı yanıtı): HIZ-SINIRI-429 + UYGULAMA-API → uygulamaya ulaştı; çıkış 2, RET KAPALI-DEGIL', () => {
      const a = aff(L2b, 429); const ok = L2b.code === 2 && a.length > 0 && a.every((p) => p.gt.producer === 'api' && p.row.outcome === 'HIZ-SINIRI-429' && p.row.layerId === 'UYGULAMA-API') && V(L2b).ret.value === 'KAPALI-DEGIL' && reasonCount(L2b, 'API-KANITLI-403-DISI') === a.length;
      return { ok, obs: brief(L2b) + ` · yankılı 429=${a.length}` };
    });
    const L3 = await scenario('edge5xx', { tag: 'l3' });
    item('L-3', 'yankısız 5xx (aynı vektörlerde 502\'yi kenar üretir): ret sayılmaz, bulgu da sayılmaz → çıkış 3, RET OLCULEMEDI; "karar bekliyor" yok', () => {
      const a = aff(L3, 502); const ok = L3.code === 3 && a.length > 0 && a.length === aff(L2, 503).length && a.every((p) => p.gt.producer === 'edge' && p.row.outcome === 'SUNUCU-HATASI-5XX' && p.row.echo === 'YOK' && p.row.layerId !== 'UYGULAMA-API') && V(L3).ret.value === 'OLCULEMEDI' && reasonCount(L3, 'API-KANITSIZ-5XX') === a.length && V(L3).ret.pendingOwnerDecision === false && L3.ev.findings.length === 0;
      return { ok, obs: brief(L3) + ` · yankısız 502=${a.length}` };
    });
    const L4 = await scenario('edge404', { tag: 'l4' });
    item('L-4', 'yankısız 403 dışı 4xx (aynı vektörlerde 404; tünel varsayılanı da, kenarı geçen istek de bu kodu verebilir): API\'den geldiği kanıtsız → çıkış 5, RET DEGERLENDIRME-GEREKIR; KAPALI sayılmaz, otomatik bulgu da sayılmaz; "karar bekliyor" işareti YOK', () => {
      const a = aff(L4, 404); const ok = L4.code === 5 && a.length > 0 && a.every((p) => p.row.outcome === 'DORTYUZ-403-DISI' && p.row.echo === 'YOK' && p.row.layerId !== 'UYGULAMA-API' && p.row.statusExpected === false) && V(L4).ret.value === 'DEGERLENDIRME-GEREKIR' && reasonCount(L4, 'API-KANITSIZ-403-DISI') === a.length && V(L4).ret.reasons.length === 1 && V(L4).ret.pendingOwnerDecision === false && L4.ev.findings.length === 0;
      return { ok, obs: brief(L4) + ` · yankısız 404=${a.length}` };
    });
    const L5 = await scenario('redirect', { tag: 'l5' });
    item('L-5', 'yönlendirme (aynı vektörlerde 302 + Location): YONLENDIRME-3XX; sonda yönlendirmeyi İZLEMEZ (kenar yalnız 68 istek gördü); çıkış 5; yönlendirme HEDEFİ ham kanıta, özete ve çıktıya yazılmaz', () => {
      const a = aff(L5, 302); const txt = L5.evBytes.toString('utf8') + L5.sumBytes.toString('utf8') + L5.log;
      const ok = L5.code === 5 && a.length > 0 && a.every((p) => p.row.outcome === 'YONLENDIRME-3XX') && V(L5).ret.value === 'DEGERLENDIRME-GEREKIR' && reasonCount(L5, 'API-KANITSIZ-403-DISI') === a.length && L5.gt.length === VEC.all.length && !txt.includes('yonlendirme-hedefi') && !txt.includes('gizli') && !/location/i.test(L5.evBytes.toString('utf8'));
      return { ok, obs: brief(L5) + ` · 302=${a.length} · hedef kanıtta=${txt.includes('yonlendirme-hedefi')} · kenarın gördüğü istek=${L5.gt.length}` };
    });
    const L6 = await scenario('rate429', { tag: 'l6' });
    item('L-6', 'yankısız 429 (hız sınırı; erişim kararı gözlenmedi): HIZ-SINIRI-429, API\'den geldiği kanıtsız → çıkış 3, RET OLCULEMEDI (L-2b ile aynı kod, yankıya göre ayrı hüküm)', () => {
      const a = aff(L6, 429); const ok = L6.code === 3 && a.length > 0 && a.every((p) => p.gt.producer === 'edge' && p.row.outcome === 'HIZ-SINIRI-429' && p.row.layerId !== 'UYGULAMA-API') && V(L6).ret.value === 'OLCULEMEDI' && reasonCount(L6, 'API-KANITSIZ-429') === a.length && L2b.code === 2;
      return { ok, obs: brief(L6) + ` · yankısız 429=${a.length} · L-2b çıkış=${L2b.code}` };
    });
    const U1 = await scenario('uniform', { tag: 'u1' });
    item('U-1', 'tekdüze 403 (pozitifler dahil 68/68 istek 403): ret vektörü sonuç sayıları S1 ile AYNI olduğu halde RET OLCULEMEDI, çıkış 3 — "personel kapalı, portal açık" gözlemi DEĞİL; kalibrasyon YOK; katman hükmü OLCULEMEDI', () => {
      const r = U1.ev.rows; const ok = U1.code === 3 && r.length === VEC.all.length && r.every((x) => x.status === 403) && V(U1).ret.value === 'OLCULEMEDI' && reasonCount(U1, 'TEKDUZE-403') === 1 && reasonCount(U1, 'POZITIF-REDDEDILDI-403') === VEC.allow.length
        && JSON.stringify(U1.ev.outcomeCounts.deny) === JSON.stringify(S1.ev.outcomeCounts.deny) && S1.code === 0 && U1.ev.calibration.result === 'YOK' && V(U1).layer.value === 'OLCULEMEDI' && rowsOf(U1, 'allow').every((x) => x.statusExpected === false) && /^D8-RET-HUKMU=OLCULEMEDI$/m.test(U1.log);
      return { ok, obs: brief(U1) + ` · 403=${r.filter((x) => x.status === 403).length}/${r.length} · ret vektörü sayıları S1 ile aynı=${JSON.stringify(U1.ev.outcomeCounts.deny) === JSON.stringify(S1.ev.outcomeCounts.deny)}` };
    });
    const P1 = await scenario('pos200', { tag: 'p1' });
    item('P-1', 'pozitif vektörde beklenmeyen ve 403 olmayan yanıt (token\'sız GET → 200): çıkış 2, RET POZITIF-BULGU (ret vektörlerinin hepsi 403 — KAPALI-DEGIL diye sınıflanmaz, KAPALI da sayılmaz)', () => {
      const bad = rowsOf(P1, 'allow').filter((x) => !x.statusExpected); const ok = P1.code === 2 && V(P1).ret.value === 'POZITIF-BULGU' && bad.length === 1 && bad[0].status === 200 && reasonCount(P1, 'POZITIF-BEKLENMEYEN-YANIT') === 1 && rowsOf(P1, 'deny').every((x) => x.status === 403) && P1.ev.findings.length === 1 && reasonCount(P1, 'RET-VEKTORU-REDDEDILMEDI-2XX') === 0;
      return { ok, obs: brief(P1) + ` · beklenmeyen pozitif=${bad.length}` };
    });
    const G1 = await scenario('passall', { tag: 'g1' });
    item('G-1', 'zemin gerçeği (kenar HER isteği arka uca geçirir): API\'nin yankıyla ürettiği her yanıt UYGULAMA-API — yol sınıfından bağımsız (ör. büyük harfli önek); API\'nin YANKISIZ ürettiği yanıtlar (OPTIONS ön uçuşu, çift eğik çizgi, çözülemeyen yüzde dizisi) OLCULEMEDI — hiçbiri "API değil" diye sınıflanmaz; web\'in ürettiği yanıtlar UYGULANAMAZ', () => {
      const j = J(G1); const apiE = j.filter((p) => p.gt.producer === 'api' && p.gt.echoed === 'same'); const apiN = j.filter((p) => p.gt.producer === 'api' && p.gt.echoed === 'none'); const web = j.filter((p) => p.gt.producer === 'web');
      const wrong = j.filter((p) => p.row.layerId === 'API-DEGIL-CIKARIM' && p.gt.producer === 'api');
      const ok = G1.ev.calibration.result === 'VAR' && apiE.length > 0 && apiE.every((p) => p.row.layerId === 'UYGULAMA-API') && apiE.some((p) => p.row.pathClass !== 'API-KESIN') && apiN.length > 0 && apiN.some((p) => p.row.method !== 'OPTIONS' && p.gt.apiMw === 'ESLESMEZ') && apiN.some((p) => p.gt.apiMw === 'COZME-HATASI') && apiN.some((p) => p.gt.apiMw === 'CORS')
        && apiN.every((p) => p.row.layerId === 'OLCULEMEDI') && web.length > 0 && web.every((p) => p.row.layerId === 'UYGULANAMAZ') && wrong.length === 0 && apiE.length + apiN.length + web.length === j.length && G1.code === 2;
      return { ok, obs: brief(G1) + ` · API yankılı=${apiE.length} (kesin olmayan yolda ${apiE.filter((p) => p.row.pathClass !== 'API-KESIN').length}) · API yankısız=${apiN.length} [${apiN.map((p) => p.gt.apiMw).join(',')}] · web=${web.length} · API yanıtına "API değil" denen=${wrong.length}` };
    });

    // ── Kapılar ──
    const mk = (o) => { const a = []; if (o.alias !== null) a.push('--alias', o.alias === undefined ? 'AD-1' : o.alias); if (o.vantage !== null) a.push('--vantage', o.vantage === undefined ? 'oz-test-yerel' : o.vantage); a.push('--origin', o.origin || ORIGIN); if (o.out !== null) a.push('--out', o.out || gateOut()); return a.concat(o.extra || []); };
    const badAliases = [null, 'AD-0', 'ad-1', 'AD-01', 'AD-1x', 'AD1', 'AD-1000', 'localhost']; const n1 = [];
    for (const al of badAliases) { const out = gateOut(); const g = await gate(mk({ alias: al, out })); n1.push({ al, code: g.code, seen: g.seen, wrote: fs.existsSync(out) }); }
    item('N-1', 'takma ad kapısı: --alias yok ya da AD-<n> biçiminde değil (AD-0, ad-1, AD-01, AD-1x, AD1, AD-1000, ana makine adı) → çıkış 4, kenara HİÇ istek gitmez, kanıt yazılmaz; geçerli takma ad (AD-27) ham kanıta ve adsız özete AYNEN yazılır', () => ({
      ok: n1.length === 8 && n1.every((x) => x.code === 4 && x.seen === 0 && !x.wrote) && S1b.code === 0 && S1b.ev.nameAlias === 'AD-27' && S1b.sum.nameAlias === 'AD-27' && /^D8-AD=AD-27$/m.test(S1b.log) && S1.ev.nameAlias === 'AD-1',
      obs: n1.map((x) => `${x.al === null ? '(yok)' : x.al}→${x.code}/${x.seen}`).join(' · ') + ` · AD-27 koşumu çıkış=${S1b.code}, kanıt=${S1b.ev && S1b.ev.nameAlias}` }));
    const n2a = await gate(mk({ extra: ['--origin', ORIGIN] })); const n2b = await gate(mk({ extra: ['--alias', 'AD-2'] })); const n2c = await gate(mk({ origin: 'https://' + ['sahte-ad', 'sahte-deger'].join(':') + `@localhost:${PORT}` })); // gerçek kimlik değil; "origin içinde kimlik bölümü" girdisi
    item('N-2', 'tek süreç = tek ad: ikinci --origin ya da ikinci --alias → çıkış 4, istek yok (çok adlı koşum parametresi yok); origin içinde kimlik bilgisi → çıkış 4', () => ({ ok: [n2a, n2b, n2c].every((g) => g.code === 4 && g.seen === 0), obs: `iki origin→${n2a.code}/${n2a.seen} · iki alias→${n2b.code}/${n2b.seen} · kimlikli origin→${n2c.code}/${n2c.seen}` }));
    const n3 = []; for (const va of [null, 'Canli Makine', 'x', 'a_b', `localhost:${PORT}`, 'a'.repeat(41)]) { const g = await gate(mk({ vantage: va })); n3.push({ va, code: g.code, seen: g.seen }); }
    item('N-3', 'konum etiketi kapısı: --vantage yok ya da biçime uymuyor (boşluk / büyük harf, tek karakter, alt çizgi, iki nokta, 41 karakter) → çıkış 4, istek yok; geçerli etiket ham kanıta ve özete beyan olarak yazılır', () => ({ ok: n3.length === 6 && n3.every((x) => x.code === 4 && x.seen === 0) && S1.ev.vantage === 'oz-test-yerel' && S1.sum.vantage === 'oz-test-yerel', obs: n3.map((x) => `${x.va === null ? '(yok)' : (x.va.length > 20 ? x.va.length + ' karakter' : x.va)}→${x.code}/${x.seen}`).join(' · ') }));
    const exOut = gateOut(); fs.writeFileSync(exOut, 'BASKA-ADIN-KANITI'); const n4a = await gate(mk({ out: exOut }));
    const exOut2 = gateOut(); fs.writeFileSync(exOut2.replace(/\.json$/, '.ozet.json'), 'BASKA-ADIN-OZETI'); const n4b = await gate(mk({ out: exOut2 }));
    item('N-4', 'var olan kanıt ya da özet dosyasının ÜZERİNE YAZMAZ (bir adın sonucu başka bir adın dosyasına taşınmaz): --out mevcut dosya → çıkış 4, istek yok, dosya içeriği aynı; özet yolu mevcut → çıkış 4, istek yok, ham kanıt da yazılmaz', () => ({
      ok: n4a.code === 4 && n4a.seen === 0 && fs.readFileSync(exOut, 'utf8') === 'BASKA-ADIN-KANITI' && n4b.code === 4 && n4b.seen === 0 && !fs.existsSync(exOut2) && fs.readFileSync(exOut2.replace(/\.json$/, '.ozet.json'), 'utf8') === 'BASKA-ADIN-OZETI',
      obs: `kanıt var→${n4a.code}/${n4a.seen} · özet var→${n4b.code}/${n4b.seen}` }));
    const o1out = gateOut(); const o1 = await gate(mk({ vantage: 'localhost-cikisi', out: o1out }));
    item('O-1', 'adsız özet kapısı: owner etiketi ana makine adını içeriyorsa (konum etiketi "localhost-cikisi", ad "localhost") sonda kapalı biçimde durur → çıkış 4, kenara HİÇ istek gitmez, kanıt ve özet yazılmaz', () => ({ ok: o1.code === 4 && o1.seen === 0 && !fs.existsSync(o1out) && !fs.existsSync(o1out.replace(/\.json$/, '.ozet.json')), obs: `çıkış=${o1.code} · istek=${o1.seen}` }));
    const s5a = await gate(['--alias', 'AD-1', '--vantage', 'oz-test-yerel', '--origin', 'http://localhost:1', '--out', gateOut()]);
    item('S5-a', 'http origin → 4', () => ({ ok: s5a.code === 4 && s5a.seen === 0, obs: `çıkış=${s5a.code}` }));
    const s5b = await gate(mk({}), Object.assign({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, env));
    item('S5-b', 'TLS doğrulaması kapalı → 4', () => ({ ok: s5b.code === 4 && s5b.seen === 0, obs: `çıkış=${s5b.code}` }));
    const s5c = await gate(mk({ out: path.join(dir, 'yok', 'x.json') }));
    item('S5-c', 'kanıt yazılamaz (dizin yok) → 7 (ölçüm yapıldı, kanıt yazılamadı)', () => ({ ok: s5c.code === 7 && s5c.seen === VEC.all.length && !fs.existsSync(path.join(dir, 'yok')), obs: `çıkış=${s5c.code} · istek=${s5c.seen}` }));
    const s5d = await gate(mk({ out: null }));
    item('S5-d', '--out yok (ve --phone-list yok) → 4, istek yok', () => ({ ok: s5d.code === 4 && s5d.seen === 0, obs: `çıkış=${s5d.code} · istek=${s5d.seen}` }));
    const s6 = await gate(['--alias', 'AD-1', '--origin', ORIGIN, '--phone-list']); const s6b = await gate(mk({ extra: ['--phone-list'] }));
    item('S6', '--phone-list AYRI çağrıdır: 5 adres + telefon talimatı + "beyan" notu, takma ad başlıkta; kenara İSTEK ATMAZ, kanıt yazmaz; --out ile birlikte → çıkış 4; ölçüm koşumu (S1) telefon listesi YAZMAZ', () => ({
      ok: s6.code === 0 && (s6.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /beyan/i.test(s6.log) && /TELEFON — AD-1/.test(s6.log) && s6.seen === 0 && s6b.code === 4 && s6b.seen === 0 && !/TELEFON/.test(S1.log) && !/^\s+\d\. https:\/\//m.test(S1.log),
      obs: `liste çıkış=${s6.code} · adres=${(s6.log.match(/^\s+\d\. https:\/\//gm) || []).length} · istek=${s6.seen} · --out ile→${s6b.code} · S1 çıktısında liste=${/TELEFON/.test(S1.log)}` }));

    // ── Adsız özet ve vektör kümesi kimliği ──
    const SUMMARY_KEYS = ['record', 'revision', 'nameAlias', 'vantage', 'probeSha256', 'vectorSetId', 'vectorCounts', 'requestProfile', 'coverage', 'outcomeCounts', 'errorClassCounts', 'layerCounts', 'calibration', 'nameVerdict', 'startedAt', 'finishedAt', 'exitCode'].sort().join();
    const longPaths = Array.from(new Set(VEC.all.map((v) => v.url.split('?')[0]).filter((p) => p.length >= 4)));
    const summaryClean = (S) => {
      const t = S.sumBytes.toString('utf8'); const low = t.toLowerCase(); const keys = []; (function walk(o) { if (o && typeof o === 'object') for (const k of Object.keys(o)) { keys.push(k); walk(o[k]); } })(S.sum);
      const d = rowsOf(S, 'deny'); const oc = S.sum.outcomeCounts.deny; const lc = S.sum.layerCounts.deny;
      return !low.includes('localhost') && !low.includes('127.0.0.1') && !/https?:\/\//.test(low) && longPaths.every((p) => !t.includes(p)) && !/d8probe|x=1|%2f|%61/i.test(t)
        && Object.keys(S.sum).sort().join() === SUMMARY_KEYS && !keys.some((k) => /^(rows|findings|path|method|name|originHost|ifPassed|hints|layerHint|hintsOnly|error|message|location|requestId|sent)$/i.test(k))
        && !/ECONN|ENOTFOUND|getaddrinfo|connect |certificate|self.signed/i.test(t) && S.sum.probeSha256 === sha(fs.readFileSync(S.probe || PROBE)) && S.sum.revision === 'R05' && S.sum.exitCode === S.code && S.sum.nameVerdict.ret.value === V(S).ret.value && S.sum.nameVerdict.layer.value === V(S).layer.value
        && S.sum.nameVerdict.ret.reasons.every((r) => Object.keys(r).sort().join() === 'count,pending,reason,verdict') && oc['RET-403'] === d.filter((x) => x.status === 403).length && Object.keys(oc).reduce((a, k) => a + oc[k], 0) === d.length && Object.keys(lc).reduce((a, k) => a + lc[k], 0) === d.length
        && lc['UYGULAMA-API'] === d.filter((x) => x.layerId === 'UYGULAMA-API').length && S.sum.vectorCounts.total === S.ev.rows.length && JSON.stringify(S.sum.calibration) === JSON.stringify(S.ev.calibration);
    };
    item('O-2', 'adsız özet (sağlıklı · sızıntılı · yönlendirmeli · yankılı 403 · tekdüze 403 koşumlarında): ana makine adı / adres / URL yok; vektör yollarının hiçbiri yok; satır, bulgu listesi, hata metni, yönlendirme hedefi, ipucu, gönderilen kimlik alanı yok; üst düzey alan kümesi sabit; sondanın SHA-256\'sı, takma ad, iki hüküm, çıkış kodu, sayılar ham kanıtla uyumlu', () => {
      const list = [S1, S2, L5, S3dY, U1, K2]; const res = list.map((S) => { try { return summaryClean(S); } catch (e) { return false; } });
      return { ok: res.every(Boolean) && list.length === 6, obs: list.map((S, i) => `${S.mode}=${res[i]}`).join(' · ') };
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
    const V2 = await scenario('ok', { tag: 'v2', probe: v2probe });
    item('V-2', 'vektör kümesi kimliği listeden TÜRER (sabit değil): tek bir ret vektörünün yolu değişen sonda kopyasında kimlik değişir ve kopyanın kaynağından bağımsız hesapla eşleşir; sondanın SHA-256 alanı da kopyanın kendi baytlarını gösterir', () => {
      const vec2 = parseVectors(v2src); const indep2 = vectorSetIdOf(vec2);
      return { ok: v2src !== src && V2.ev.vectorSetId === indep2 && V2.sum.vectorSetId === indep2 && indep2 !== vectorSetIdOf(VEC) && V2.sum.probeSha256 === sha(fs.readFileSync(v2probe)) && V2.sum.probeSha256 !== S1.sum.probeSha256, obs: `kopya=${String(V2.ev && V2.ev.vectorSetId).slice(0, 16)}… · asıl=${vectorSetIdOf(VEC).slice(0, 16)}… · farklı=${indep2 !== vectorSetIdOf(VEC)}` };
    });

    // ── Statik kalemler ──
    item('T-1', 'sonda pozitif listesinde giriş/forgot-password/intake POST/belge yükleme YOK (yalnız token olmadan guard pozitifleri)', () => ({ ok: VEC.allowBlock.length > 0 && !/api\/portal\/login'|api\/portal\/forgot-password'|public\/intake|documents\/upload/.test(VEC.allowBlock) && !VEC.allowBlock.split('\n').some((l) => /'POST'/.test(l) && !/token yok/.test(l)), obs: 'statik' }));
    const denyLines = VEC.denyBlock.split('\n').filter((l) => /^\s*\['/.test(l));
    const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\n}', i); return j < 0 ? '' : src.slice(i, j + 2); };
    item('T-2', 'statik: https.request seçenek nesnesiyle (URL string DEĞİL); her ret vektöründe ifPassed (FX.*) var; boş gövdeli yazma yöntemleri adında "boş gövde"; kimlik/yazma bayrakları kanıtta yalnız design{} (beyan) + measured{} (türetilmiş); katman kimliği, kalibrasyon ve iki hüküm işlevi ipucu alanlarını (Server başlığı, gövde, imza, layerHint) OKUMAZ; hüküm işlevleri kanıtlılığı yalnız layerId üzerinden okur', () => {
      const lid = fnSrc('layerIdOf'); const others = fnSrc('calibrationOf') + fnSrc('retVerdictOf') + fnSrc('layerVerdictOf'); const srcNoDesign = src.replace(/design:\s*\{[^}]*\}/, '');
      const pure = lid !== '' && fnSrc('calibrationOf') !== '' && fnSrc('retVerdictOf') !== '' && fnSrc('layerVerdictOf') !== '' && !/hints|server|header|caddy|edge-provider|body|layerHint|provider/i.test(lid) && !/hints|serverHeader|bodyEmpty|layerHint|providerSignature|caddy|cloudflare/i.test(others);
      const ok = /https\.request\(\{\s*host:\s*HOST,\s*port:\s*PORT,\s*path,\s*method,\s*servername:\s*HOST/.test(src) && !/https\.request\(ORIGIN/.test(src) && denyLines.length === S1.ev.deny && denyLines.every((l) => /FX\.\w+\]/.test(l)) && denyLines.filter((l) => /'(POST|PUT|PATCH)'/.test(l)).every((l) => /boş gövde/.test(l))
        && !/credentialsSent:\s*(true|false)|writesAttempted:\s*(true|false)/.test(srcNoDesign) && S1.ev.credentialsSent === undefined && S1.ev.writesAttempted === undefined && typeof S1.ev.measured === 'object' && /credentialHeaderRequests:\s*rows\.filter/.test(src) && pure;
      return { ok, obs: `ret satırı=${denyLines.length} · işlevler ipucu okumaz=${pure} · layerIdOf=${lid.replace(/\s+/g, ' ').slice(0, 80)}…` };
    });
    item('T-3', 'statik (D8-E1/E2): deny kaynağında 3 HEAD + 3 OPTIONS yöntemi üç yüzeyde (sayfa /, personel API /api/auth/me, admin /api/portal/admin/documents/pending) ve 18 kodlama/normalizasyon ham yolu birebir; HEAD/OPTIONS/evasion FX etiketleri bağlı', () => {
      const headLines = denyLines.filter((l) => /,\s*'HEAD',/.test(l)); const optLines = denyLines.filter((l) => /,\s*'OPTIONS',/.test(l));
      const hoSurfSrc = ['/', '/api/auth/me', '/api/portal/admin/documents/pending'].every((p) => headLines.some((l) => l.includes(`'${p}'`)) && optLines.some((l) => l.includes(`'${p}'`)));
      const evInSrc = evasionPaths.filter((p) => VEC.denyBlock.includes(`'${p}'`)).length;
      const fxRefs = /FX\.headPage/.test(src) && /FX\.headApi/.test(src) && /FX\.headAdmin/.test(src) && /FX\.optionsPage/.test(src) && /FX\.optionsApi/.test(src) && /FX\.optionsAdmin/.test(src) && /FX\.evasion/.test(src);
      return { ok: headLines.length === 3 && optLines.length === 3 && hoSurfSrc && evInSrc === 18 && fxRefs, obs: `HEAD=${headLines.length} · OPTIONS=${optLines.length} · varyant kaynakta=${evInSrc}/18 · yüzeyler=${hoSurfSrc} · FX=${fxRefs}` };
    });
    item('T-4', 'statik: "karar bekliyor" eşlemesi TEK yerde — API_KAYNAKLI_403_HUKMU tek satırda tanımlı, o satır KARAR BEKLİYOR işaretini taşır ve değeri DEGERLENDIRME-GEREKIR (ne KAPALI ne KAPALI-DEGIL); kullanıldığı tek yer ret hükmü işlevindeki tek satır; çıkış kodu tablosu (RET_CIKIS) tek tanım ve 5 = DEGERLENDIRME-GEREKIR', () => {
      const lines = src.split('\n'); const idx = lines.map((l, i) => (/API_KAYNAKLI_403_HUKMU/.test(l) ? i + 1 : 0)).filter(Boolean); const decl = lines.filter((l) => /^const API_KAYNAKLI_403_HUKMU\s*=/.test(l));
      const use = lines.filter((l) => /API_KAYNAKLI_403_HUKMU/.test(l) && !/^const API_KAYNAKLI_403_HUKMU\s*=/.test(l)); const cikis = lines.filter((l) => /^const RET_CIKIS\s*=/.test(l));
      const ok = decl.length === 1 && /KARAR BEKLİYOR/.test(decl[0]) && /=\s*'DEGERLENDIRME-GEREKIR';/.test(decl[0]) && use.length === 1 && /'API-KANITLI-403'/.test(use[0]) && fnSrc('retVerdictOf').includes(use[0].trim()) && cikis.length === 1 && /'DEGERLENDIRME-GEREKIR':\s*5/.test(cikis[0]) && /'KAPALI':\s*0/.test(cikis[0]);
      return { ok, obs: `tanım satırı=${idx[0] || '-'} · kullanım satırı=${idx.slice(1).join(',') || '-'} · tanım sayısı=${decl.length} · kullanım sayısı=${use.length}` };
    });

    // ── Belge: pinler ve owner blokları ──
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
    const prep = (text, envFile, probeFile, pin) => text.split(ENV_LIT).join("'" + envFile + "'").split(PROBE_LIT).join("'" + probeFile + "'").replace(/-cne '[0-9A-F]{64}'/, "-cne '" + pin + "'");
    const envFile = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'ascii'); return f; };
    const envOk = envFile('env-ok.txt', ['PORT=8080', `PUBLIC_PORTAL_BASE_URL=${ORIGIN}`, 'BASKA_ANAHTAR=deger']);
    const envQuoted = envFile('env-quoted.txt', ['# sahte', `  PUBLIC_PORTAL_BASE_URL = "${ORIGIN}"`]);
    const envNone = envFile('env-none.txt', ['PORT=8080', `PUBLIC_PORTAL_BASE_URL_ESKI=${ORIGIN}`]);
    const envTwo = envFile('env-two.txt', [`PUBLIC_PORTAL_BASE_URL=${ORIGIN}`, `PUBLIC_PORTAL_BASE_URL=${ORIGIN}`]);
    const envHttp = envFile('env-http.txt', [`PUBLIC_PORTAL_BASE_URL=http://localhost:${PORT}`]);
    const envPath = envFile('env-path.txt', [`PUBLIC_PORTAL_BASE_URL=${ORIGIN}/portal`]);
    const tampered = path.join(dir, 'd8-staff-surface-probe.degisti.js'); fs.writeFileSync(tampered, Buffer.concat([fs.readFileSync(PROBE), Buffer.from('\n// bir bayt degisti\n')]));
    for (const sh of shells) {
      const ver = await runPs(sh, "'PSMAJOR=' + $PSVersionTable.PSVersion.Major", null); const major = Number((/PSMAJOR=(\d+)/.exec(ver.log) || [])[1]);
      const avail = !ver.spawnError && major >= sh.min && major <= sh.max; const why = `${sh.label} başlatılamadı (${ver.spawnError || 'sürüm=' + (major || '?')}) — kalem ÖLÇÜLEMEDİ, geçti sayılmaz`;
      let uSeq = 0;
      /** Bir blok denemesi: sahte kullanıcı kökü + kip; dönen: kabuk çıkışı, çıktı, kenarın gördüğü istek sayısı, yazılan kanıt dizinleri. */
      const blk = async (text, m) => { const u = path.join(dir, `u-${sh.id}-${++uSeq}`); fs.mkdirSync(u); mode = m; seen = []; const r = await runPs(sh, text, u); const n = seen.length; seen = [];
        const root = path.join(u, 'Documents', 'CLIENT-EVIDENCE-20260911'); const dirs = fs.existsSync(root) ? fs.readdirSync(root) : []; return { code: r.code, log: r.log, seen: n, root, dirs, docs: fs.existsSync(path.join(u, 'Documents')) }; };
      const notRun = (b) => b.seen === 0 && !b.docs && !/cikis=\d/.test(b.log) && !/D8-CIKIS=\d/.test(b.log) && b.code !== 0;
      const B = {};
      if (avail && blocksOk) {
        B.b1 = await blk(prep(measureBlocks[0], envOk, PROBE, probeSha), 'ok');
        B.b2a = await blk(prep(measureBlocks[0], envNone, PROBE, probeSha), 'ok'); B.b2b = await blk(prep(measureBlocks[0], envTwo, PROBE, probeSha), 'ok');
        B.b3a = await blk(prep(measureBlocks[0], envHttp, PROBE, probeSha), 'ok'); B.b3b = await blk(prep(measureBlocks[0], envPath, PROBE, probeSha), 'ok');
        B.b4 = await blk(prep(measureBlocks[0], envOk, tampered, probeSha), 'ok');
        B.b5 = await blk(prep(measureBlocks[0], envQuoted, PROBE, probeSha), 'broken');
        B.bt = await blk(prep(phoneBlocks[0], envOk, PROBE, probeSha), 'ok'); B.bt2 = await blk(prep(phoneBlocks[0], envOk, tampered, probeSha), 'ok');
      }
      const skipOr = (fn) => () => (!blocksOk ? { ok: false, obs: 'belgeden blok çıkarılamadı (B-0)' } : (!avail ? { skip: true, obs: why } : fn()));
      /** Olağan akışın ölçümü: blok çıktısındaki çıkış kodu, kanıt dizini, özet SHA'sı (bağımsız hesapla), takma ad, konum etiketi. */
      const flow = (b, expectCode) => {
        const one = b.dirs.length === 1 && /^extacc-d8-AD-1-\d{8}-\d{6}Z$/.test(b.dirs[0]); const d = one ? path.join(b.root, b.dirs[0]) : null;
        const ev = d ? readJson(path.join(d, 'd8-probe.json')) : null; const sb = d ? readBytes(path.join(d, 'd8-probe.ozet.json')) : null; const shown = (/D8 AD-1 adsiz ozet SHA256=([0-9A-F]{64})/.exec(b.log) || [])[1]; const probeLine = (/^D8-OZET-SHA256=([0-9A-F]{64})/m.exec(b.log) || [])[1];
        const vantage = (/--vantage ([a-z0-9-]+) /.exec(measureBlocks[0]) || [])[1];
        const ok = b.code === 0 && new RegExp('D8 AD-1 cikis=' + expectCode + '(\\r?\\n|$)').test(b.log) && b.seen === VEC.all.length && one && ev && sb && shown === sha(sb) && probeLine === shown && ev.nameAlias === 'AD-1' && ev.vantage === vantage && ev.exitCode === expectCode && !/TELEFON/.test(b.log) && fs.readdirSync(d).sort().join() === 'd8-probe.json,d8-probe.ozet.json';
        return { ok, obs: `kabuk çıkış=${b.code} · blok "cikis=${(/D8 AD-1 cikis=(\d+)/.exec(b.log) || [])[1]}" · istek=${b.seen} · kanıt dizini=${b.dirs.length} · özet SHA blok=bağımsız: ${!!sb && shown === sha(sb)} · takma ad=${ev && ev.nameAlias} · konum=${ev && ev.vantage}` };
      };
      item(`B-1/${sh.id}`, `${sh.label} · ölçüm bloğu olağan akış (sahte .env tek satır https origin, sağlıklı sahte kenar): blok sondayı AD-1 ve konum etiketiyle koşturur; "D8 AD-1 cikis=0"; kullanıcı kökü altında tek kanıt dizini (ham kanıt + adsız özet); blokta gösterilen özet SHA-256'sı = dosyanın bağımsız hesaplanan SHA-256'sı = sondanın yazdırdığı; telefon listesi YAZDIRILMAZ`, skipOr(() => flow(B.b1, 0)));
      item(`B-2/${sh.id}`, `${sh.label} · kapı: .env'de PUBLIC_PORTAL_BASE_URL satırı 0 ya da 2 → blok DURUR; sonda HİÇ koşmaz (kenara istek yok, kanıt dizini oluşmaz, "cikis=" satırı yok)`, skipOr(() => ({ ok: notRun(B.b2a) && notRun(B.b2b) && /satiri 1 degil/.test(B.b2a.log) && /satiri 1 degil/.test(B.b2b.log), obs: `0 satır: kabuk=${B.b2a.code} istek=${B.b2a.seen} · 2 satır: kabuk=${B.b2b.code} istek=${B.b2b.seen}` })));
      item(`B-3/${sh.id}`, `${sh.label} · kapı: değer https değil (http://…) ya da yol içeriyor (https://…/portal) → blok DURUR; sonda HİÇ koşmaz`, skipOr(() => ({ ok: notRun(B.b3a) && notRun(B.b3b) && /https\/yolsuz origin degil/.test(B.b3a.log) && /https\/yolsuz origin degil/.test(B.b3b.log), obs: `http: kabuk=${B.b3a.code} istek=${B.b3a.seen} · yollu: kabuk=${B.b3b.code} istek=${B.b3b.seen}` })));
      item(`B-4/${sh.id}`, `${sh.label} · kapı: sonda dosyası pinle uyuşmuyor (bir baytı değişmiş kopya) → blok DURUR; sonda HİÇ koşmaz`, skipOr(() => ({ ok: notRun(B.b4) && /SHA UYUSMUYOR/.test(B.b4.log), obs: `kabuk=${B.b4.code} istek=${B.b4.seen} · kanıt dizini=${B.b4.docs}` })));
      item(`B-5/${sh.id}`, `${sh.label} · blok sondanın çıkış kodunu AKTARIR (sabit yazmaz): tırnaklı ve boşluklu .env değeri + bozuk sahte kenar → "D8 AD-1 cikis=2"; özet yine yazılır ve SHA'sı gösterilir`, skipOr(() => flow(B.b5, 2)));
      item(`B-T/${sh.id}`, `${sh.label} · telefon listesi bloğu (AYRI çağrı): 5 adres yazdırır; kenara İSTEK ATMAZ; kanıt dizini oluşturmaz`, skipOr(() => ({ ok: B.bt.code === 0 && (B.bt.log.match(/^\s+\d\. https:\/\//gm) || []).length === 5 && /D8 AD-1 telefon listesi cikis=0/.test(B.bt.log) && B.bt.seen === 0 && !B.bt.docs, obs: `kabuk=${B.bt.code} · adres=${(B.bt.log.match(/^\s+\d\. https:\/\//gm) || []).length} · istek=${B.bt.seen} · kanıt dizini=${B.bt.docs}` })));
      item(`B-T2/${sh.id}`, `${sh.label} · telefon listesi bloğunda pin uyuşmazlığı → blok DURUR; liste yazdırılmaz`, skipOr(() => ({ ok: B.bt2.code !== 0 && /SHA UYUSMUYOR/.test(B.bt2.log) && !/^\s+\d\. https:\/\//m.test(B.bt2.log) && B.bt2.seen === 0, obs: `kabuk=${B.bt2.code} · istek=${B.bt2.seen}` })));
    }

    // ── Taşıma hataları (son: sunucu kapatılır) ──
    const noCa = Object.assign({}, baseEnv); const S4b = await scenario('ok', { tag: 's4b', env: noCa });
    item('S4-b', 'doğrulanamayan sertifika (sonda sahte kenarın sertifikasına güvenmiyor): 68/68 SONUC-YOK, hata sınıfı TLS; çıkış 3, RET OLCULEMEDI; kenar hiçbir isteği işlemedi; hata İLETİSİ kanıta / özete yazılmaz', () => {
      const r = S4b.ev.rows; const txt = S4b.evBytes.toString('utf8').replace(/"originHost":\s*"[^"]*"/, '') + S4b.sumBytes.toString('utf8');
      const ok = S4b.code === 3 && r.length === VEC.all.length && r.every((x) => x.status === 0 && x.outcome === 'SONUC-YOK' && x.errorClass === 'TLS' && x.layerId === 'SONUC-YOK' && !('error' in x)) && S4b.gt.length === 0 && V(S4b).ret.value === 'OLCULEMEDI' && reasonCount(S4b, 'SONUC-YOK') === r.length && S4b.sum.errorClassCounts.TLS === r.length && !/self.signed|certificate|SELF_SIGNED|localhost/i.test(txt);
      return { ok, obs: brief(S4b) + ` · hata sınıfı=${JSON.stringify(S4b.sum && S4b.sum.errorClassCounts)}` };
    });
    if (srv.closeAllConnections) srv.closeAllConnections(); await new Promise((x) => srv.close(x)); srv = null;
    const S4 = await scenario('ok', { tag: 's4', env: Object.assign({ D8_HTTP_TIMEOUT_MS: '1500' }, env) });
    item('S4', 'kenar kapalı: 68/68 SONUC-YOK, hata sınıfı BAGLANTI (S4-b ile ayrı sınıf); çıkış 3, RET OLCULEMEDI, bulgu yok; kanıt ve özet yine yazılır; katman hükmü OLCULEMEDI; hata iletisi yok', () => {
      const r = S4.ev.rows; const txt = S4.evBytes.toString('utf8').replace(/"originHost":\s*"[^"]*"/, '') + S4.sumBytes.toString('utf8');
      const ok = S4.code === 3 && S4.ev.unmeasured === S4.ev.deny + S4.ev.allow && r.every((x) => x.status === 0 && x.errorClass === 'BAGLANTI' && x.echo === 'SONUC-YOK') && S4.ev.findings.length === 0 && V(S4).ret.value === 'OLCULEMEDI' && V(S4).layer.value === 'OLCULEMEDI' && S4.sum.errorClassCounts.BAGLANTI === r.length && S4.sum.errorClassCounts.TLS === 0 && !/ECONNREFUSED|connect |127\.0\.0\.1|localhost/i.test(txt);
      return { ok, obs: brief(S4) + ` · sonuç yok=${S4.ev.unmeasured} · hata sınıfı=${JSON.stringify(S4.sum && S4.sum.errorClassCounts)}` };
    });
  } catch (e) { console.log('OLCULEMEDI: ' + String((e && e.stack) || e).slice(0, 600)); if (srv) { try { srv.close(); } catch (x) { /* yok */ } } process.exit(2); }
  for (const x of results) console.log(`${x.state.padEnd(10)} ${x.id.padEnd(13)} ${x.d}\n        ${x.obs}`);
  const fail = results.filter((x) => x.state === 'FAIL'); const skip = results.filter((x) => x.state === 'OLCULEMEDI'); const pass = results.filter((x) => x.state === 'PASS');
  console.log(`\nsonda: ${process.env.D8_SELFTEST_PROBE ? 'ALTERNATİF (D8_SELFTEST_PROBE)' : 'paket'} · sonda SHA-256 ${sha(fs.readFileSync(PROBE))} · port ${PORT} · node ${process.version}`);
  if (fail.length) console.log('FAIL: ' + fail.map((x) => x.id).join(', '));
  if (skip.length) console.log('ÖLÇÜLEMEDİ (geçti SAYILMAZ): ' + skip.map((x) => x.id).join(', '));
  console.log(`D-8 SONDA ÖZ-TESTİ: PASS ${pass.length} / ${results.length} · FAIL ${fail.length} · ÖLÇÜLEMEDİ ${skip.length}  (kanıt: ${dir})`);
  process.exit(fail.length ? 1 : (skip.length ? 2 : 0));
})();
