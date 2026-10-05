'use strict';
/*
 * EXTACC D-8 R05 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI: AD BAŞINA makine ölçümü (owner PC'sinden, gerçek alan adı, gerçek TLS).
 *
 * BİR SÜREÇ = BİR AD = BİR KANIT. Sonda tek `--origin` ve zorunlu bir takma ad (`--alias AD-<n>`) alır; çok adlı döngü ya da
 *            ikinci origin YOKTUR; başka bir adın kanıtını OKUMAZ (okuduğu tek dosya kendi kaynağıdır: SHA-256 için) ve var olan
 *            bir kanıt dosyasının ÜZERİNE YAZMAZ. Bir adın sonucu başka bir ada taşınmaz: her ad ayrı süreç, ayrı dosya.
 * NE ÖLÇER : izin listesi DIŞINDAKİ (yöntem, yol) çiftlerine verilen yanıt (59 ret vektörü: personel sayfaları, personel API'si,
 *            /api/portal/admin/*, izinli yollarda yanlış yöntem, HEAD/OPTIONS [D8-E1], 18 kodlama/normalizasyon varyantı [D8-E2];
 *            HAM yol korunur) ve 9 pozitif kontrol (3 sayfa 200, 6 API 401).
 * İKİ AYRI DEĞERLENDİRME (R05) — birleşik tek "PASS" ÜRETİLMEZ:
 *   (1) RET SONUCU  — satırda `outcome`: RET-403 · DORTYUZ-403-DISI · HIZ-SINIRI-429 · REDDEDILMEDI-2XX · YONLENDIRME-3XX ·
 *       SUNUCU-HATASI-5XX · SONUC-YOK (taşıma hatası; yalnız `errorClass`: AD-COZULMEDI / BAGLANTI / TLS / ZAMAN-ASIMI / DIGER —
 *       hata İLETİSİ ve yönlendirme HEDEFİ kanıta yazılmaz) · SINIFLANAMADI.
 *   (2) KATMAN KİMLİĞİ — satırda `layerId`, YALNIZ KANITLA. Dışarıdan gösterilebilen tek imza API'nin istek kimliği yankısıdır:
 *       sonda her isteğe API'nin kabul ettiği biçimde TEK KULLANIMLIK bir `x-request-id` gönderir; yanıtta AYNI değer dönerse
 *       (`echo` = ESLESTI) o yanıtı API üretmiştir. Başlığın yalnız VAR olması (FARKLI-DEGER) yankı DEĞİLDİR. Server başlığı,
 *       gövde imzası, boş gövde İPUCUDUR (`hints`, `layerHint`); katman kimliğine GİRMEZ. Kenar / tünel / sağlayıcı bu sondayla
 *       HİÇBİR koşulda adlandırılamaz.
 *       KALİBRASYON (aynı ad, aynı koşum): API pozitiflerinin TAMAMINDA yankı eşleşmeli VE API öneki DIŞINDAKİ hiçbir yanıtta
 *       (web pozitifleri dahil) kimlik başlığı bulunmamalı (ters kalibrasyon). Önek dışı bir yanıtta başlık görülürse başlık
 *       API'ye özgü değildir → GECERSIZ → o koşumda BÜTÜN katman kimlikleri OLCULEMEDI. Kalibrasyon VAR değilse hiçbir satır
 *       adlandırılmaz ve "API değil" çıkarımı yapılmaz.
 *       `layerId` değerleri: UYGULAMA-API (kalibrasyon VAR + yankı ESLESTI) · API-DEGIL-CIKARIM (yalnız ÇIKARIM: kalibrasyon VAR +
 *       başlık YOK + OPTIONS değil + yol API-KESIN; hangi üst katmanın yanıtladığı her durumda ölçülemez) · UYGULANAMAZ (yol API
 *       öneki dışında: web'in imzası yok) · OLCULEMEDI (diğer her durum) · SONUC-YOK.
 *       YOL SINIFI (`pathClass`; kaynak okuması — Nest 10.4.20 + Express 4: `setGlobalPrefix("api")` + `forRoutes('*')` ara katmanı
 *       `/api` ve `/api/*` için kaydeder; `enableCors` ön uçuşu ara katmandan ÖNCE yanıtlar; yüzde dizisi çözülemezse ara katman
 *       çalışmaz): API-KESIN = ham yol tam `/api` önekli ve normalleştirilecek bir yanı yok (yüzde dizisi, nokta segmenti, çift
 *       eğik çizgi, noktalı virgül, büyük harfli önek yok) — API bu isteği işleseydi ara katman kesin çalışırdı · API-BELIRSIZ =
 *       ham ya da çözülmüş / sadeleştirilmiş biçimi API önekine düşen diğer her yol (çıkarım YAPILMAZ) · ONEK-DISI = web yolu.
 *       Bu kural KAYNAK OKUMASIDIR; gerçek API ile izole provası YAPILMADI (paket belgesi §1).
 * AD DÜZEYİ İKİ HÜKÜM (kanıtta `nameVerdict { ret, layer }`):
 *   RET HÜKMÜ (öncelik sırasıyla; çıkış kodu yalnız bundan türer):
 *     KAPALI-DEGIL (2)          en az bir ret vektörü reddedilmedi (2xx) YA DA 403 dışı bir yanıtın API'den geldiği yankıyla kanıtlı
 *     POZITIF-BULGU (2)         pozitif vektörde beklenmeyen ve 403 olmayan yanıt (ör. token'sız 200)
 *     OLCULEMEDI (3)            taşıma hatası · API'den geldiği kanıtlanmamış 5xx / 429 · pozitif reddedildi (403) · tekdüze 403
 *                               (bütün istekler 403: "personel kapalı, portal açık" gözlemi DEĞİLDİR)
 *     DEGERLENDIRME-GEREKIR (5) kanıtlı bulgu yok ama: 403 dışı ve API'den geldiği kanıtlanmamış 3xx / 4xx · API'nin ürettiği
 *                               yankıyla kanıtlı 403 (**KARAR BEKLİYOR** — aşağıda tek satır) · kalibrasyon VAR değil (API
 *                               kaynaklı 403 denetimi yapılamadı) · farklı değerli kimlik başlığı görüldü
 *     KAPALI (0)                bütün ret vektörleri 403, hiçbirinin API'den geldiği kanıtlı değil, pozitifler beklendiği gibi,
 *                               kalibrasyon VAR. Kayıt eki zorunludur: "bu istek profili, bu konum, bu vektör kümesi".
 *     Sınıflanamayan her durum OLCULEMEDI'ye düşer; hiçbir belirsiz durum KAPALI sayılmaz.
 *   KATMAN HÜKMÜ: ADLANDIRILDI-API · ADLANDIRILAMADI · OLCULEMEDI — PASS / FAIL değeri ALMAZ; çıkış kodunu etkilemez.
 * ADSIZ ÖZET: ham kanıtın yanına (`<out>.json` → `<out>.ozet.json`) ad İÇERMEYEN ayrı bir özet yazılır (takma ad, revizyon, sondanın
 *            SHA-256'sı, vektör kümesi kimliği, yöntem kapsamı, ret sonucu / hata sınıfı / katman sayıları, kalibrasyon, iki hüküm,
 *            zaman, çıkış kodu, beyan edilen konum etiketi, gönderilen başlık ADLARI). İçermez: ad, hata metni, yönlendirme hedefi,
 *            yol / yöntem düzeyinde bulgu. Sonda özeti yazmadan önce içinde ana makine adının geçmediğini denetler; geçiyorsa
 *            yazmaz (kapalı biçimde durur). Public belgeye YALNIZ bu özetin içeriği ve SHA-256'sı girer; ham kanıtın özeti girmez.
 * HAM YOL  : istek `https.request({host, port, path, method, servername})` ile atılır; `path` vektördeki HAM dizedir
 *            ('/api/portal/./admin/...', '%2F', '?x=1' normalize EDİLMEZ). Öz-test kenarın gördüğü yolu birebir doğrular.
 * İSTEK LİSTESİ VE YAN ETKİ (KİMLİK BİLGİSİ GÖNDERİLMEZ):
 *   · Ret listesinde POST/PUT/PATCH/DELETE vardır — POST/PUT/PATCH gövdesi BOŞ JSON `{}`; DELETE GÖVDESİZ (yalnız
 *     `content-type: application/json` başlığı). Hiçbir istekte authorization/cookie/x-api-key başlığı yoktur.
 *   · Her istekte tek kullanımlık `x-request-id` vardır (kimlik bilgisi DEĞİLDİR). İstek uygulamaya ulaşırsa bu değer isteğin
 *     kimliği olur; uygulama o istekte 5xx üretirse değer uygulamanın hata kaydına yazılır. Sondanın vektör listesindeki uçlarda
 *     başka bir etkisi kaynakta görülmedi (başlığı yinelenme anahtarı olarak okuyan iç yönetim denetleyicisi listede YOKTUR).
 *   · Beklenen: her ret vektörü 403. KENAR GEÇİRİRSE olası uygulama sonucu, her vektörde `ifPassed` alanındadır. Öne çıkanlar:
 *       - POST /api/auth/login (boş gövde): LoginRateLimitGuard DTO doğrulamasından ÖNCE çalışır → personel giriş hız sınırı
 *         sayacı (IP bazlı, 10/dk) +1, sonra DTO 400. Kimlik bilgisi gönderilmez; uygulama bu isteği YİNE DE giriş sayacına
 *         +1 yazar (uygulamanın kendi semantiğinde başarısız giriş denemesi sayılır). Tek istek blok üretmez.
 *       - POST /api/auth/register (boş gövde): guard yok; ValidationPipe (whitelist) `{}` → 400; yazma yok.
 *       - GET /api/auth/capabilities: guard yok → 200 (statik bayrak); yazma yok; personel API dışarıya açık = bulgu.
 *       - POST /api/auth/account-recovery/find-tenants SONDADA YOK (login ile AYNI sayacı paylaşır; yan etkiyi artırmamak için).
 *       - /api/portal/admin/* : JwtAuthGuard → 401 (token yok; yazma yok).
 *       - GET /api/auth/me · /api/cases · /api/users : 401 (token yok). GET /api/health : R27'de kök ucu yok → 404.
 *       - izinli yolda yanlış yöntem (POST /api/portal/cases, PUT/DELETE messages, …): rota yok → 404 (yazma yok).
 *       - personel sayfaları (/, /auth/login, /dashboard, …): Next sayfa 200/302 (yazma yok) — yüzey dışarıya AÇIK = bulgu.
 *       - HEAD (D8-E1): personel sayfası → Next 200/3xx gövdesiz; personel API/admin → Express HEAD'i GET işleyicisine
 *         yönlendirir → JwtAuthGuard 401 (token yok); DB/yazma/audit/giriş sayacı yok.
 *       - OPTIONS (D8-E1): personel API/admin → Nest enableCors ön uçuşu guard/rota'dan ÖNCE 204 (Content-Length 0; Origin
 *         başlığı yok → ACAO yansıtılmaz; giriş sayacı/yazma/audit YOK); personel sayfası → Next 405/404 (çalışma zamanıyla doğrulanmadı).
 *       - 18 kodlama/normalizasyon varyantı (D8-E2): kenar ham yolu normalize etmeden reddederse 403; geçer ve uygulama
 *         çözerse hedefe göre sayfa 200 / admin 401 / rota yok 404; yazma yok; varyant izin listesini aştı = bulgu.
 *   · "Kimliksiz istekte uygulama 403 üretmez" bir GENELLEME DEĞİLDİR: yalnız bu sondanın vektör listesindeki uçlar için kaynak
 *     okumasıdır (çalışma zamanında ölçülmedi). Uygulamanın ürettiği 403 bu yüzden ayrı sınıflanır (yankıyla kanıtlı 403).
 * YAPMAZ   : kimlik bilgisi göndermez; forgot-password/reset-password çağırmaz (e-posta); intake POST, belge yükleme, mesaj yazma yok;
 *            DB erişimi yok; yönlendirme izlemez; tekrar denemez. Pozitif listedeki POST/DELETE'ler token olmadan guard 401'de durur.
 * KANIT    : `design` alanı (credentialsSent / writesAttempted = false) betik TASARIM BEYANIDIR (ölçüm değil).
 *            `measured { requestCount, credentialHeaderRequests, nonEmptyBodyRequests, bodies }` istek döngüsünden TÜRETİLİR:
 *            gönderilen başlık adları, gövde ve gönderilen istek kimliği her satırda `sent` alanındadır (kimlik başlığı yok;
 *            gövde ∈ {'', '{}'}). Yanıt başlığı DEĞERLERİ kanıta yazılmaz (yalnız ad / varlık / eşleşme sınıfı).
 *            `vantage` owner'ın BEYAN ettiği konum etiketidir (ölçüm değil). `vectorSetId` vektör listesinden türetilir
 *            (sırayla "grup yöntem hamYol beklenenKodlar" satırlarının SHA-256'sı): adlar arasında aynı listenin koşulduğunu gösterir.
 * KULLANIM : node d8-staff-surface-probe.js --alias AD-<n> --vantage <etiket> --origin https://<public-host> --out <kanit.json>
 *            node d8-staff-surface-probe.js --alias AD-<n> --origin https://<public-host> --phone-list
 *            --phone-list AYRI çağrıdır: owner'ın telefonda (mobil veri) açacağı 5 adresi yazar, İSTEK ATMAZ, kanıt yazmaz
 *            (beyan ayrı dosyadadır; makine ölçümü değildir).
 * ÇIKIŞ    : 0 ret hükmü KAPALI · 2 KAPALI-DEGIL / POZITIF-BULGU · 3 OLCULEMEDI · 4 kapı (origin https değil, TLS doğrulaması
 *            kapalı, takma ad / konum etiketi yok ya da geçersiz, parametre yinelenmiş, kanıt dosyası zaten var, etiket ana
 *            makine adını içeriyor) · 5 DEGERLENDIRME-GEREKIR · 7 kanıt / özet yazılamadı. Çıkış 0 tek başına "D-8 kapandı"
 *            demek DEĞİLDİR: katman hükmü ayrı satırdır ve kabulü owner kararıdır (paket belgesi §3).
 */
const https = require('https'); const fs = require('fs'); const crypto = require('crypto');

const REVISION = 'R05';
/** API'nin istek kimliği başlığı (apps/api/src/common/request-id.middleware.ts REQUEST_ID_HEADER). */
const RID_HEADER = 'x-request-id';
const ALIAS_RX = /^AD-[1-9][0-9]{0,2}$/;
const VANTAGE_RX = /^[a-z0-9][a-z0-9-]{1,39}$/;

// ─── HÜKÜM EŞLEMESİ — TEK YER ─────────────────────────────────────────────────────────────────────────────────────────────
const RET_CIKIS = { 'KAPALI': 0, 'KAPALI-DEGIL': 2, 'POZITIF-BULGU': 2, 'OLCULEMEDI': 3, 'DEGERLENDIRME-GEREKIR': 5 };
const RET_ONCELIK = ['KAPALI-DEGIL', 'POZITIF-BULGU', 'OLCULEMEDI', 'DEGERLENDIRME-GEREKIR'];
// KARAR BEKLİYOR (owner): API'nin ürettiği, yankıyla kanıtlı 403 bulgu mu sayılsın, kabul mü edilsin? Karar VERİLMEDİ; bu yüzden
// ne KAPALI ne otomatik bulgu. Karar gelince YALNIZ aşağıdaki satır değişir: bulgu → 'KAPALI-DEGIL' · kabul → null (hükmü etkilemez).
const API_KAYNAKLI_403_HUKMU = 'DEGERLENDIRME-GEREKIR'; // KARAR BEKLİYOR — owner kararı gelene kadar değiştirilmez
const KAYIT_EKI = 'YALNIZ bu istek profili (requestProfile), bu konum (vantage; beyan) ve bu vektör kümesi (vectorSetId) için';

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
function argCount(name) { return process.argv.filter((a) => a === name).length; }
function reject(msg) { console.error('REDDEDİLDİ: ' + msg); process.exit(4); }
const ORIGIN = arg('--origin'); const OUT = arg('--out'); const PHONE = process.argv.includes('--phone-list');
const ALIAS = arg('--alias'); const VANTAGE = arg('--vantage');
if (!ORIGIN || !/^https:\/\/[^/]+$/.test(ORIGIN)) reject('--origin https://<host> (yolsuz) gerekli');
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') reject('TLS doğrulaması kapalı');
if (['--origin', '--alias', '--out', '--vantage'].some((n) => argCount(n) > 1)) reject('BİR SÜREÇ = BİR AD = BİR KANIT: --origin / --alias / --out / --vantage birer kez verilir (çok adlı koşum yok)');
if (!ALIAS || !ALIAS_RX.test(ALIAS)) reject('--alias AD-<n> gerekli (takma ad; ana makine adı DEĞİL)');
let ORIGIN_URL = null; try { ORIGIN_URL = new URL(ORIGIN); } catch (e) { ORIGIN_URL = null; }
if (!ORIGIN_URL || ORIGIN_URL.username || ORIGIN_URL.password || ORIGIN_URL.search || ORIGIN_URL.hash) reject('--origin yalnız https://<host>[:port] olabilir (kimlik / sorgu / parça yok)');
if (PHONE && OUT) reject('--phone-list AYRI çağrıdır; --out ile birlikte verilmez');
if (!PHONE && !OUT) reject('--out <kanit.json> gerekli');
if (!PHONE && (!VANTAGE || !VANTAGE_RX.test(VANTAGE))) reject('--vantage <etiket> gerekli (beyan edilen koşum konumu; küçük harf / rakam / tire, 2–40 karakter)');
const TIMEOUT_MS = Number(process.env.D8_HTTP_TIMEOUT_MS || 15000);
const HOST = ORIGIN_URL.hostname; const PORT = Number(ORIGIN_URL.port || 443);
const SUMMARY_OUT = OUT ? (/\.json$/i.test(OUT) ? OUT.replace(/\.json$/i, '.ozet.json') : OUT + '.ozet.json') : null;
/** Sondanın kendi SHA-256'sı (okuduğu TEK dosya kendi kaynağıdır). */
const SELF_SHA = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex').toUpperCase();

// Kenar geçirirse olası uygulama sonucu (R27 kaynağından): kısa etiketler.
const FX = {
  page: 'Next sayfa 200/302; yazma yok; personel yüzeyi dışarıya açık = bulgu',
  jwt401: 'personel JwtAuthGuard → 401 (token yok); yazma yok; personel API dışarıya açık = bulgu',
  login: 'LoginRateLimitGuard sayacı +1 (IP bazlı, 10/dk; DTO doğrulamasından ÖNCE; uygulama semantiğinde başarısız giriş denemesi sayılır) → sonra DTO 400; kimlik bilgisi gönderilmez; sayaç +1 = yan etki + bulgu',
  register: 'POST /api/auth/register guard yok; ValidationPipe (whitelist) boş gövdeyi 400 ile keser; yazma yok; personel API dışarıya açık = bulgu',
  capabilities: 'GET /api/auth/capabilities guard yok → 200 (statik bayrak); yazma yok; personel API dışarıya açık = bulgu',
  health: 'R27 kök /api/health ucu yok → 404; yazma yok; izin listesi dışı = bulgu',
  admin: '/api/portal/admin/* JwtAuthGuard → 401 (token yok); yazma yok; admin yüzeyi dışarıya açık = bulgu',
  adminVar: 'normalizasyona göre admin rotası (→ 401) veya 404; yazma yok; varyant geçti = bulgu',
  noRoute: 'uygulamada bu (yöntem, yol) için rota yok → 404; yazma yok; yanlış yöntem geçti = bulgu',
  nextMethod: 'Next sayfa rotasına yazma yöntemi → 404/405; yazma yok; geçti = bulgu',
  notFound: 'Next/Nest 404; yazma yok; izin listesi dışı = bulgu',
  // D8-E1 — HEAD/OPTIONS. Kenar izin matcher'ları yöntem duyarlıdır (method GET/POST/DELETE); HEAD ve OPTIONS hiçbir izin
  // kuralına uymaz → varsayılan `respond 403`. "Kenar geçirirse" sonucu kaynak 1b758d29'den türetilir.
  headPage: 'HEAD personel sayfası: Next App Router HEAD = GET başlıkları (gövde yok) → 200/3xx; personel yüzeyi dışarıya açık = bulgu; yazma yok',
  headApi: 'HEAD personel API: Express HEAD isteğini GET işleyicisine yönlendirir → global SmokeAuthorizationGuard (Bearer yok → geçer) → JwtAuthGuard 401; gövde yok; DB/yazma/audit/giriş sayacı yok',
  headAdmin: 'HEAD admin: Express HEAD→GET işleyici → JwtAuthGuard 401 (token yok); gövde yok; yazma/audit yok',
  optionsPage: 'OPTIONS personel sayfası: Next App Router sayfası yalnız GET/HEAD → 405 (Allow: GET, HEAD) ya da 404 (çalışma zamanıyla doğrulanmadı); yazma yok',
  optionsApi: 'OPTIONS personel API: Nest enableCors ön uçuşu yönlendirme/guard öncesinde 204 (Content-Length 0); istek Origin başlığı yok → ACAO yansıtılmaz; guard/rota/DTO/giriş sayacı çalışmaz; yazma/audit/hata kaydı yok',
  optionsAdmin: 'OPTIONS admin: Nest CORS ön uçuşu @deny ve JwtAuthGuard öncesinde 204; admin işleyici çalışmaz; yazma yok',
  // D8-E2 — izole provadan taşınan 18 kodlama/normalizasyon varyantı (edge-allowlist-probe.js EVASION). Amaç: kenar ham yolu
  // normalize edip izin listesini aşmaya izin vermiyor mu. Kenar reddederse 403; geçer ve uygulama ham yolu çözerse hedefe göre.
  evasion: 'kodlama/normalizasyon varyantı: kenar ham yolu normalize etmeden reddederse 403; geçer ve uygulama çözerse hedefe göre personel sayfası 200 / admin JwtAuthGuard 401 / rota yok 404; yazma yok; varyant izin listesini aştı = bulgu',
};
// Kenar izin listesi (client-external-access-r01/templates/Caddyfile.template) DIŞI vektörler — hepsi 403 beklenir.
// [ad, yöntem, HAM yol, kenar geçirirse olası sonuç]
const DENY = [
  ['personel kök',                'GET',    '/',                                          FX.page],
  ['personel giriş sayfası',      'GET',    '/auth/login',                                FX.page],
  ['personel panel',              'GET',    '/dashboard',                                 FX.page],
  ['personel sıfırlama sayfası',  'GET',    '/auth/reset-password',                       FX.page],
  ['personel oturum',             'GET',    '/api/auth/me',                               FX.jwt401],
  ['personel giriş API (boş gövde, kimlik bilgisi yok)', 'POST', '/api/auth/login',       FX.login],
  ['personel kayıt API (boş gövde, kimlik bilgisi yok)', 'POST', '/api/auth/register',    FX.register],
  ['personel yetenek bayrağı',    'GET',    '/api/auth/capabilities',                     FX.capabilities],
  ['personel dosya listesi',      'GET',    '/api/cases',                                 FX.jwt401],
  ['personel kullanıcılar',       'GET',    '/api/users',                                 FX.jwt401],
  ['sağlık ucu',                  'GET',    '/api/health',                                FX.health],
  ['portal admin create (boş gövde)',  'POST', '/api/portal/admin/create-user',           FX.admin],
  ['portal admin disable (boş gövde)', 'POST', '/api/portal/admin/disable-user',          FX.admin],
  ['portal admin belgeler',       'GET',    '/api/portal/admin/documents/pending',        FX.admin],
  ['portal admin mesajlar',       'GET',    '/api/portal/admin/messages/clients',         FX.admin],
  ['portal admin kök',            'GET',    '/api/portal/admin',                          FX.adminVar],
  ['portal admin kodlanmış /',    'GET',    '/api/portal%2Fadmin/documents/pending',      FX.adminVar],
  ['portal admin sorgu ile',      'GET',    '/api/portal/admin/documents/pending?x=1',    FX.admin],
  // (portal admin büyük harf '/ADMIN/' ve nokta-segment '/./admin/' artık D8-E2 kodlama bloğundadır; tekrar istek yok)
  ['intake DELETE',               'DELETE', '/intake/d8probe',                            FX.nextMethod],
  ['intake API DELETE',           'DELETE', '/api/public/intake/d8probe',                 FX.noRoute],
  ['intake API PUT (boş gövde)',  'PUT',    '/api/public/intake/d8probe',                 FX.noRoute],
  ['intake API PATCH (boş gövde)', 'PATCH', '/api/public/intake/d8probe',                 FX.noRoute],
  ['portal login GET (yöntem)',   'GET',    '/api/portal/login',                          FX.noRoute],
  ['portal cases POST (boş gövde)', 'POST', '/api/portal/cases',                          FX.noRoute],
  ['portal cases DELETE',         'DELETE', '/api/portal/cases/d8probe',                  FX.noRoute],
  ['portal messages DELETE',      'DELETE', '/api/portal/messages',                       FX.noRoute],
  ['portal messages PUT (boş gövde)', 'PUT', '/api/portal/messages',                      FX.noRoute],
  ['portal documents PUT (boş gövde)', 'PUT', '/api/portal/documents/d8probe',            FX.noRoute],
  ['portal documents POST id (boş gövde)', 'POST', '/api/portal/documents/d8probe',       FX.noRoute],
  ['portal profile POST (web, boş gövde)', 'POST', '/portal/profile',                     FX.nextMethod],
  ['portal change-password GET',  'GET',    '/api/portal/change-password',                FX.noRoute],
  ['portal login sayfası POST (web, boş gövde)', 'POST', '/portal/login',                 FX.nextMethod],
  ['bilinmeyen kök yol',          'GET',    '/robots.txt',                                FX.notFound],
  ['api kök',                     'GET',    '/api',                                       FX.notFound],
  ['api kök slash',               'GET',    '/api/',                                      FX.notFound],
  // D8-E1 — HEAD / OPTIONS ret vektörleri (üç yüzey: personel sayfası · personel API · admin portal yolu). Gövdesiz.
  ['HEAD personel sayfası',       'HEAD',   '/',                                          FX.headPage],
  ['HEAD personel API',           'HEAD',   '/api/auth/me',                               FX.headApi],
  ['HEAD admin portal yolu',      'HEAD',   '/api/portal/admin/documents/pending',        FX.headAdmin],
  ['OPTIONS personel sayfası',    'OPTIONS','/',                                          FX.optionsPage],
  ['OPTIONS personel API',        'OPTIONS','/api/auth/me',                               FX.optionsApi],
  ['OPTIONS admin portal yolu',   'OPTIONS','/api/portal/admin/documents/pending',        FX.optionsAdmin],
  // D8-E2 — izole provadan (edge-allowlist-probe.js EVASION) taşınan 18 kodlama/normalizasyon varyantı. HAM yol korunur.
  ['varyant %61dmin',             'GET',    '/api/portal/%61dmin/documents/pending',      FX.evasion],
  ['varyant %61dmin POST (boş gövde)', 'POST', '/api/portal/%61dmin/create-user',         FX.evasion],
  ['varyant admin%2Fdocuments',   'GET',    '/api/portal/admin%2Fdocuments%2Fpending',    FX.evasion],
  ['varyant DELETE kodlu traversal', 'DELETE', '/api/portal/documents/x%2F..%2Fadmin%2Fdocuments%2Fpending', FX.evasion],
  ['varyant düz traversal',       'GET',    '/api/portal/cases/../admin/documents/pending', FX.evasion],
  ['varyant kodlu traversal ..%2Fadmin', 'GET', '/api/portal/documents/..%2Fadmin/documents/pending', FX.evasion],
  ['varyant çift slash',          'GET',    '//api/portal/admin/documents/pending',       FX.evasion],
  ['varyant nokta segment',       'GET',    '/api/portal/./admin/documents/pending',      FX.evasion],
  ['varyant büyük harf /API/',    'GET',    '/API/portal/cases',                          FX.evasion],
  ['varyant büyük harf /ADMIN/',  'GET',    '/api/portal/ADMIN/documents/pending',        FX.evasion],
  ['varyant sondaki slash',       'GET',    '/api/portal/cases/',                         FX.evasion],
  ['varyant noktalı virgül',      'GET',    '/api/portal/cases;x=1',                      FX.evasion],
  ['varyant web traversal intake', 'GET',   '/intake/abc/../../auth/login',               FX.evasion],
  ['varyant web traversal _next', 'GET',    '/_next/../auth/login',                       FX.evasion],
  ['varyant web kodlu traversal', 'GET',    '/_next/%2e%2e/auth/login',                   FX.evasion],
  ['varyant boş bayt kodlu',      'GET',    '/api/portal/cases%00/admin',                 FX.evasion],
  ['varyant çift kodlama',        'GET',    '/api/portal/documents/%252e%252e/admin',     FX.evasion],
  ['varyant unicode slash',       'GET',    '/api/portal/admin%c0%afdocuments/pending',   FX.evasion],
];
// Pozitifler — izinli çiftler uygulamaya ULAŞIR; hiçbiri yazma yapmaz (token yok → guard 401; sayfa GET → 200).
const ALLOW = [
  ['portal giriş sayfası',              'GET',  '/portal/login',                       [200]],
  ['şifremi unuttum sayfası',           'GET',  '/portal/forgot-password',             [200]],
  ['sıfırlama sayfası',                 'GET',  '/portal/reset-password',              [200]],
  ['portal dosyalar (token yok)',       'GET',  '/api/portal/cases',                   [401]],
  ['portal belgeler (token yok)',       'GET',  '/api/portal/documents',               [401]],
  ['portal mesajlar (token yok)',       'GET',  '/api/portal/messages',                [401]],
  ['portal mesaj gönder (token yok)',   'POST', '/api/portal/messages',                [401]],
  ['portal belge sil (token yok)',      'DELETE', '/api/portal/documents/d8probe',     [401]],
  ['portal parola değiştir (token yok)', 'POST', '/api/portal/change-password',        [401]],
];
/** Vektör kümesi kimliği: sırayla "grup yöntem hamYol beklenenKodlar" satırlarının SHA-256'sı (adlar arasında aynı liste mi?). */
const VECTOR_SET_ID = crypto.createHash('sha256').update(
  DENY.map((v) => `deny ${v[1]} ${v[2]} 403`).concat(ALLOW.map((v) => `allow ${v[1]} ${v[2]} ${v[3].join(',')}`)).join('\n'), 'utf8').digest('hex').toUpperCase();

// ─── SINIFLAR ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const OUTCOMES = ['RET-403', 'DORTYUZ-403-DISI', 'HIZ-SINIRI-429', 'REDDEDILMEDI-2XX', 'YONLENDIRME-3XX', 'SUNUCU-HATASI-5XX', 'SONUC-YOK', 'SINIFLANAMADI'];
const LAYER_IDS = ['UYGULAMA-API', 'API-DEGIL-CIKARIM', 'OLCULEMEDI', 'UYGULANAMAZ', 'SONUC-YOK'];
const ERROR_CLASSES = ['AD-COZULMEDI', 'BAGLANTI', 'TLS', 'ZAMAN-ASIMI', 'DIGER'];
const VECTOR_CLASSES = ['BES-YONTEM', 'HEAD', 'OPTIONS', 'VARYANT'];
/** Ret sonucu sınıfı: yalnız durum kodundan (katman bu alana GİRMEZ). */
function outcomeOf(status) {
  if (status === 0) return 'SONUC-YOK';
  if (status === 403) return 'RET-403';
  if (status === 429) return 'HIZ-SINIRI-429';
  if (status >= 200 && status < 300) return 'REDDEDILMEDI-2XX';
  if (status >= 300 && status < 400) return 'YONLENDIRME-3XX';
  if (status >= 400 && status < 500) return 'DORTYUZ-403-DISI';
  if (status >= 500 && status < 600) return 'SUNUCU-HATASI-5XX';
  return 'SINIFLANAMADI';
}
/** Taşıma hatası SINIFI — yalnız hata kodundan; ileti metni (ana makine adı içerebilir) hiçbir yere yazılmaz. */
function errorClassOf(e) {
  const c = String((e && e.code) || '');
  if (c === 'D8_TIMEOUT' || c === 'ETIMEDOUT' || c === 'ESOCKETTIMEDOUT') return 'ZAMAN-ASIMI';
  if (/^(ENOTFOUND|EAI_[A-Z]+)$/.test(c)) return 'AD-COZULMEDI';
  if (/^(ERR_TLS_|ERR_SSL_|ERR_OSSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|HOSTNAME_MISMATCH)/.test(c) || c === 'EPROTO') return 'TLS';
  if (/^(ECONNREFUSED|ECONNRESET|ECONNABORTED|EHOSTUNREACH|EHOSTDOWN|ENETUNREACH|ENETDOWN|EADDRNOTAVAIL|EPIPE)$/.test(c)) return 'BAGLANTI';
  return 'DIGER';
}
function looseForms(pathname) {
  const forms = [pathname]; let p = pathname;
  for (let i = 0; i < 3; i++) { let d; try { d = decodeURIComponent(p); } catch (e) { break; } if (d === p) break; p = d; forms.push(p); }
  for (const f of forms.slice()) {
    const out = []; for (const s of f.split('/')) { if (s === '' || s === '.') continue; if (s === '..') { out.pop(); continue; } out.push(s); }
    forms.push('/' + out.join('/'));
  }
  return forms;
}
/** Yol sınıfı (kaynak okuması; başlıktaki "YOL SINIFI"). API-KESIN yalnız normalleştirilecek bir yanı olmayan `/api` önekli ham yoldur. */
function pathClassOf(rawPath) {
  const pathname = String(rawPath).split('?')[0];
  if (/^\/api(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)*\/?$/.test(pathname)) return 'API-KESIN';
  return looseForms(pathname).some((f) => /^\/+api(?:$|[^a-z0-9_.~-])/i.test(f)) ? 'API-BELIRSIZ' : 'ONEK-DISI';
}
function vectorClassOf(grp, method, pathClass, ifPassed) {
  if (grp === 'allow') return pathClass === 'ONEK-DISI' ? 'POZITIF-WEB' : 'POZITIF-API';
  if (method === 'HEAD') return 'HEAD';
  if (method === 'OPTIONS') return 'OPTIONS';
  return ifPassed === FX.evasion ? 'VARYANT' : 'BES-YONTEM';
}
/** Kalibrasyon (aynı ad, aynı koşum): API pozitiflerinin TAMAMINDA yankı + önek DIŞI hiçbir yanıtta kimlik başlığı yok. */
function calibrationOf(rows) {
  const api = rows.filter((x) => x.vectorClass === 'POZITIF-API'); const web = rows.filter((x) => x.vectorClass === 'POZITIF-WEB');
  const outside = rows.filter((x) => x.pathClass === 'ONEK-DISI' && x.status !== 0 && x.echo !== 'YOK').length;
  const c = { apiPositives: api.length, apiEcho: api.filter((x) => x.echo === 'ESLESTI').length, webPositives: web.length,
    webMeasured: web.filter((x) => x.status !== 0).length, webEcho: web.filter((x) => x.echo === 'ESLESTI').length, outsidePrefixHeaderRows: outside };
  c.result = outside > 0 ? 'GECERSIZ' : ((c.apiPositives > 0 && c.apiEcho === c.apiPositives && c.webPositives > 0 && c.webMeasured === c.webPositives) ? 'VAR' : 'YOK');
  return c;
}
/** Katman kimliği — YALNIZ yankı kanıtından (durum kodu, kalibrasyon, yöntem, yol sınıfı, yankı sınıfı); ipuçları buraya GİRMEZ. */
function layerIdOf(x, calibrationResult) {
  if (x.status === 0) return 'SONUC-YOK';
  if (calibrationResult !== 'VAR') return 'OLCULEMEDI';
  if (x.echo === 'ESLESTI') return 'UYGULAMA-API';
  if (x.echo !== 'YOK') return 'OLCULEMEDI';
  if (x.pathClass === 'ONEK-DISI') return 'UYGULANAMAZ';
  if (x.method === 'OPTIONS') return 'OLCULEMEDI';
  return x.pathClass === 'API-KESIN' ? 'API-DEGIL-CIKARIM' : 'OLCULEMEDI';
}
/** Ad düzeyi RET HÜKMÜ. Nedenler ayrı ayrı toplanır; hüküm RET_ONCELIK sırasındaki ilk sınıftır. Hiçbir neden yoksa ve
 *  KAPALI koşulları birebir sağlanıyorsa KAPALI; aksi her durum OLCULEMEDI (kapalı biçimde). */
function retVerdictOf(rows, cal) {
  const deny = rows.filter((x) => x.group === 'deny'); const allow = rows.filter((x) => x.group === 'allow'); const R = [];
  const add = (verdict, reason, list, pending) => { if (list.length) R.push({ verdict, reason, count: list.length, pending: !!pending, rows: list.map((x) => rows.indexOf(x)) }); };
  const proven = (x) => x.layerId === 'UYGULAMA-API';
  const noDecision = (x) => x.outcome === 'SUNUCU-HATASI-5XX' || x.outcome === 'HIZ-SINIRI-429' || x.outcome === 'SINIFLANAMADI';
  add('KAPALI-DEGIL', 'RET-VEKTORU-REDDEDILMEDI-2XX', deny.filter((x) => x.outcome === 'REDDEDILMEDI-2XX'));
  add('KAPALI-DEGIL', 'API-KANITLI-403-DISI', deny.filter((x) => x.status !== 0 && x.outcome !== 'RET-403' && x.outcome !== 'REDDEDILMEDI-2XX' && proven(x)));
  add('POZITIF-BULGU', 'POZITIF-BEKLENMEYEN-YANIT', allow.filter((x) => x.status !== 0 && !x.statusExpected && x.status !== 403 && !(noDecision(x) && !proven(x))));
  add('OLCULEMEDI', 'SONUC-YOK', rows.filter((x) => x.status === 0));
  add('OLCULEMEDI', 'API-KANITSIZ-5XX', deny.filter((x) => x.outcome === 'SUNUCU-HATASI-5XX' && !proven(x)));
  add('OLCULEMEDI', 'API-KANITSIZ-429', deny.filter((x) => x.outcome === 'HIZ-SINIRI-429' && !proven(x)));
  add('OLCULEMEDI', 'SINIFLANAMAYAN-DURUM-KODU', deny.filter((x) => x.outcome === 'SINIFLANAMADI' && !proven(x)));
  add('OLCULEMEDI', 'POZITIF-REDDEDILDI-403', allow.filter((x) => x.status === 403));
  add('OLCULEMEDI', 'POZITIF-API-KANITSIZ-5XX-429', allow.filter((x) => x.status !== 0 && !x.statusExpected && noDecision(x) && !proven(x)));
  if (rows.length > 0 && rows.every((x) => x.status === 403)) R.push({ verdict: 'OLCULEMEDI', reason: 'TEKDUZE-403', count: 1, pending: false, rows: [] });
  add('DEGERLENDIRME-GEREKIR', 'API-KANITSIZ-403-DISI', deny.filter((x) => (x.outcome === 'YONLENDIRME-3XX' || x.outcome === 'DORTYUZ-403-DISI') && !proven(x)));
  if (API_KAYNAKLI_403_HUKMU) add(API_KAYNAKLI_403_HUKMU, 'API-KANITLI-403', deny.filter((x) => x.outcome === 'RET-403' && proven(x)), true);
  if (cal.result !== 'VAR') R.push({ verdict: 'DEGERLENDIRME-GEREKIR', reason: 'KALIBRASYON-' + cal.result, count: 1, pending: false, rows: [] });
  add('DEGERLENDIRME-GEREKIR', 'FARKLI-DEGERLI-KIMLIK-BASLIGI', rows.filter((x) => x.echo === 'FARKLI-DEGER'));
  let value = RET_ONCELIK.find((v) => R.some((r) => r.verdict === v)) || null;
  if (!value) {
    const closed = rows.length === DENY.length + ALLOW.length && deny.every((x) => x.outcome === 'RET-403') && allow.every((x) => x.statusExpected) && cal.result === 'VAR';
    if (closed) value = 'KAPALI'; else { value = 'OLCULEMEDI'; R.push({ verdict: 'OLCULEMEDI', reason: 'SINIFLANAMAYAN-DURUM', count: 1, pending: false, rows: [] }); }
  }
  return { value, exitCode: RET_CIKIS[value], reasons: R, pendingOwnerDecision: R.some((r) => r.pending), scope: KAYIT_EKI };
}
/** Ad düzeyi KATMAN HÜKMÜ — yalnız ret vektörlerinden; PASS / FAIL değeri almaz; çıkış kodunu ETKİLEMEZ. */
function layerVerdictOf(rows, cal) {
  const d = rows.filter((x) => x.group === 'deny' && x.status !== 0);
  if (cal.result !== 'VAR' || d.length === 0) return { value: 'OLCULEMEDI' };
  if (d.some((x) => x.layerId === 'UYGULAMA-API')) return { value: 'ADLANDIRILDI-API' };
  if (d.some((x) => x.echo === 'FARKLI-DEGER')) return { value: 'OLCULEMEDI' };
  return { value: 'ADLANDIRILAMADI' };
}
const countBy = (list, keys, f) => { const m = {}; for (const k of keys) m[k] = 0; for (const x of list) { const k = f(x); if (k !== null && k !== undefined) m[k] = (m[k] || 0) + 1; } return m; };
/** Metinde ana makine adı geçiyor mu (özet ve etiket denetimi; büyük/küçük harf duyarsız). */
function containsName(text) { const t = String(text).toLowerCase(); return [HOST, ORIGIN_URL.host].some((n) => n && t.includes(String(n).toLowerCase())); }
// Ön denetim (istek atılmadan): özetin sabit sözlüğü ya da owner etiketleri adı içeriyorsa sonda koşmaz.
if (containsName([REVISION, ALIAS, VANTAGE || '', KAYIT_EKI, RID_HEADER, 'EXTACC-D8-STAFF-SURFACE-SUMMARY'].concat(OUTCOMES, LAYER_IDS, ERROR_CLASSES, VECTOR_CLASSES, RET_ONCELIK, Object.keys(RET_CIKIS)).join(' '))) reject('etiket ya da özet sözlüğü ana makine adını içeriyor — adsız özet yazılamaz');
if (!PHONE && (fs.existsSync(OUT) || fs.existsSync(SUMMARY_OUT))) reject('kanıt ya da özet dosyası zaten var — başka bir koşumun / adın kanıtının üzerine yazılmaz');

/** Kimlik taşıyabilecek istek başlıkları (ölçüm: gönderilen başlık adları bunlarla karşılaştırılır). */
const CREDENTIAL_HEADERS = /^(authorization|cookie|x-api-key|proxy-authorization)$/i;
/** Tek kullanımlık istek kimliği: API'nin kabul ettiği biçimde ([A-Za-z0-9][A-Za-z0-9._:-]{0,127}); her istekte yenisi. */
function newRequestId() { return 'd8r' + crypto.randomBytes(16).toString('hex'); }
/** Ham request-target korunur: URL string DEĞİL, seçenek nesnesi (path olduğu gibi gider).
 *  Dönüşte `sent` = gerçekten gönderilen başlık adları + gövde (POST/PUT/PATCH '{}', diğerleri '') + gönderilen istek kimliği. */
function req(method, path) {
  const requestId = newRequestId();
  const headers = { host: ORIGIN_URL.host, 'user-agent': 'extacc-d8-probe', 'content-type': 'application/json', accept: '*/*', [RID_HEADER]: requestId };
  const body = (method === 'POST' || method === 'PUT' || method === 'PATCH') ? '{}' : '';
  const sent = { headerNames: Object.keys(headers), body, requestId };
  return new Promise((resolve) => {
    const r = https.request({ host: HOST, port: PORT, path, method, servername: HOST, headers, timeout: TIMEOUT_MS }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { if (b.length < 4096) b += c; });
      const done = () => resolve({ status: res.statusCode, body: b, headers: res.headers, sent });
      res.on('end', done); res.on('close', done); res.on('error', done);
    });
    r.on('timeout', () => r.destroy(Object.assign(new Error('zaman aşımı'), { code: 'D8_TIMEOUT' })));
    r.on('error', (e) => resolve({ status: 0, errorClass: errorClassOf(e), sent }));
    if (body) r.write(body);
    r.end();
  });
}
/** Server başlığından yalnız ürün ADI (sürüm/ek bilgi atılır): 'Caddy', 'cloudflare', 'nginx', ''. */
function serverName(h) { const v = String((h && h.server) || '').trim(); return v.split(/[\s/;,]/)[0].slice(0, 20); }
/** Katman ipuçları AYRI alanlarda; hiçbiri katman kimliği DEĞİLDİR (yalnız kısıtlı ham kanıtta; adsız özete girmez). */
function hintsOf(r) {
  const h = r.headers || {}; const body = String(r.body || '');
  return { bodyEmpty: body.trim() === '', providerSignature: /cloudflare|error code:\s*10\d\d|cf-error/i.test(body),
    edgeHeaderPresent: !!h['cf-ray'], serverHeaderValue: serverName(h), cfMitigatedPresent: !!h['cf-mitigated'] };
}
/** Katman İPUCU (kanıt değil): Server 'Caddy' → 'caddy' · sağlayıcı gövde imzası + sağlayıcı Server → 'edge-provider' · aksi null. */
function layerHintOf(r, hints) {
  if (r.status !== 403) return null;
  const s = hints.serverHeaderValue.toLowerCase();
  if (s === 'caddy') return 'caddy';
  if (hints.providerSignature && s === 'cloudflare') return 'edge-provider';
  return null;
}
const row = (grp, name, method, path, r, expect, ifPassed) => {
  const measuredRow = r.status !== 0; const hints = measuredRow ? hintsOf(r) : null; const pathClass = pathClassOf(path);
  const got = measuredRow ? (r.headers || {})[RID_HEADER] : undefined;
  const echo = !measuredRow ? 'SONUC-YOK' : (got === undefined ? 'YOK' : (got === r.sent.requestId ? 'ESLESTI' : 'FARKLI-DEGER'));
  return { group: grp, vectorClass: vectorClassOf(grp, method, pathClass, ifPassed), name, method, path, pathClass, status: r.status, expected: expect,
    statusExpected: measuredRow && expect.includes(r.status), outcome: outcomeOf(r.status), errorClass: r.errorClass || null, echo, layerId: null,
    layerHint: hints ? layerHintOf(r, hints) : null, hints, ifPassed: grp === 'deny' ? ifPassed : null, sent: r.sent };
};

(async () => {
  if (PHONE) {
    const list = ['/auth/login', '/', '/api/auth/me', '/api/portal/admin/documents/pending', '/api/cases'];
    console.log(`TELEFON — ${ALIAS} (Wi-Fi KAPALI, mobil veri, gizli sekme) — her adres için ne gördüğünüzü not edin (E = hata/erişim engellendi · S = sayfa/veri açıldı · ?):`);
    list.forEach((p, i) => console.log(`  ${i + 1}. ${ORIGIN}${p}`));
    console.log('Beyan makine ölçümü DEĞİLDİR ve yalnız bu ad içindir; koşucu kanıtı ayrı dosyadadır. Bu çağrı istek atmaz.');
    return;
  }
  const t0 = new Date().toISOString(); const rows = [];
  for (const [name, method, path, fx] of DENY) rows.push(row('deny', name, method, path, await req(method, path), [403], fx));
  for (const [name, method, path, exp] of ALLOW) rows.push(row('allow', name, method, path, await req(method, path), exp, null));
  const calibration = calibrationOf(rows);
  for (const x of rows) x.layerId = layerIdOf(x, calibration.result);
  const ret = retVerdictOf(rows, calibration); const layer = layerVerdictOf(rows, calibration);
  const deny = rows.filter((x) => x.group === 'deny'); const allow = rows.filter((x) => x.group === 'allow');
  const coverage = {}; for (const k of VECTOR_CLASSES) { const v = deny.filter((x) => x.vectorClass === k); coverage[k] = { of: v.length, measured: v.filter((x) => x.status !== 0).length, rejected403: v.filter((x) => x.status === 403).length }; }
  const outcomeCounts = { deny: countBy(deny, OUTCOMES, (x) => x.outcome), allow: countBy(allow, OUTCOMES, (x) => x.outcome) };
  const layerCounts = { deny: countBy(deny, LAYER_IDS, (x) => x.layerId), allow: countBy(allow, LAYER_IDS, (x) => x.layerId) };
  const errorClassCounts = countBy(rows.filter((x) => x.status === 0), ERROR_CLASSES, (x) => x.errorClass);
  // İPUCU dağılımları (kanıt değil; yalnız ham kanıtta): 403 ret satırlarında Server / gövde imzası ipucu + dolu gövdeli, sağlayıcı imzasız 403 sayısı.
  const denyLayerHints = deny.filter((x) => x.status === 403).reduce((m, x) => { const k = x.layerHint || 'none'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const hintFullBody403 = rows.filter((x) => x.status === 403 && x.hints && !x.hints.bodyEmpty && !x.hints.providerSignature).length;
  // ÖLÇÜM (istek döngüsünden türetilir): kimlik başlığı gönderilen istek sayısı; '' veya '{}' dışı gövdeli istek sayısı; gövde dağılımı.
  const bodies = rows.reduce((m, x) => { const k = x.sent.body === '' ? 'empty' : (x.sent.body === '{}' ? 'emptyJson' : 'other'); m[k] = (m[k] || 0) + 1; return m; }, {});
  const measured = { requestCount: rows.length, credentialHeaderRequests: rows.filter((x) => x.sent.headerNames.some((h) => CREDENTIAL_HEADERS.test(h))).length,
    nonEmptyBodyRequests: bodies.other || 0, bodies };
  const requestProfile = { headerNames: Array.from(new Set(rows.reduce((a, x) => a.concat(x.sent.headerNames), []))), userAgentClass: 'extacc-d8-probe',
    requestCount: measured.requestCount, credentialHeaderRequests: measured.credentialHeaderRequests, nonEmptyBodyRequests: measured.nonEmptyBodyRequests,
    distinctRequestIds: new Set(rows.map((x) => x.sent.requestId)).size };
  const finishedAt = new Date().toISOString();
  // ADSIZ ÖZET — public tablo YALNIZ bundan dolar. Ad, hata metni, yönlendirme hedefi, yol / yöntem düzeyinde bulgu İÇERMEZ.
  const summary = { record: 'EXTACC-D8-STAFF-SURFACE-SUMMARY', revision: REVISION, nameAlias: ALIAS, vantage: VANTAGE, probeSha256: SELF_SHA, vectorSetId: VECTOR_SET_ID,
    vectorCounts: { deny: DENY.length, allow: ALLOW.length, total: DENY.length + ALLOW.length }, requestProfile, coverage, outcomeCounts, errorClassCounts, layerCounts, calibration,
    nameVerdict: { ret: { value: ret.value, exitCode: ret.exitCode, reasons: ret.reasons.map((r) => ({ verdict: r.verdict, reason: r.reason, count: r.count, pending: r.pending })), pendingOwnerDecision: ret.pendingOwnerDecision, scope: ret.scope }, layer },
    startedAt: t0, finishedAt, exitCode: ret.exitCode };
  const summaryText = JSON.stringify(summary, null, 1);
  const summaryRefused = containsName(summaryText);
  const summarySha256 = summaryRefused ? null : crypto.createHash('sha256').update(Buffer.from(summaryText, 'utf8')).digest('hex').toUpperCase();
  const findings = rows.filter((x, i) => ret.reasons.some((r) => (r.verdict === 'KAPALI-DEGIL' || r.verdict === 'POZITIF-BULGU') && r.rows.includes(i)));
  const out = { record: 'EXTACC-D8-STAFF-SURFACE-PROBE', revision: REVISION, nameAlias: ALIAS, originHost: ORIGIN_URL.host, vantage: VANTAGE, probeSha256: SELF_SHA, vectorSetId: VECTOR_SET_ID,
    startedAt: t0, finishedAt, deny: DENY.length, allow: ALLOW.length, requestProfile, calibration, coverage, outcomeCounts, errorClassCounts, layerCounts,
    nameVerdict: { ret, layer }, exitCode: ret.exitCode, summary: { written: !summaryRefused, sha256: summarySha256 },
    findings: findings.map((x) => `${x.group} ${x.method} ${x.path} → HTTP ${x.status} [${x.outcome} · ${x.layerId}]`), unmeasured: rows.filter((x) => x.status === 0).length,
    hintsOnly: { denyLayerHints, fullBody403WithoutProviderSignature: hintFullBody403 }, rows,
    design: { credentialsSent: false, writesAttempted: false, note: 'betik TASARIM BEYANI (ölçüm değil): vektör listesinde kimlik bilgisi ve yazma verisi yoktur; ölçüm `measured` alanındadır' },
    measured,
    note: 'İKİ AYRI HÜKÜM: nameVerdict.ret (ret sonucu; çıkış kodu yalnız bundan) ve nameVerdict.layer (katman kimliği; PASS / FAIL değeri almaz). Birleşik tek PASS yoktur; çıkış 0 tek başına kapanış değildir. Katman kimliği (rows[].layerId) YALNIZ istek kimliği yankısından ve aynı koşumun kalibrasyonundan türer; kenar / tünel / sağlayıcı adlandırılmaz. hintsOnly, rows[].hints ve rows[].layerHint İPUCUDUR (Server başlığı, gövde imzası, boş gövde) — kanıt değildir, hükme ve adsız özete girmez. vantage beyandır (ölçüm değil). Yanıt başlığı değerleri, hata iletileri ve yönlendirme hedefleri kanıta yazılmaz. Bu dosya ana makine adını içerir (KISITLI); public tabloya yalnız adsız özet ve onun SHA-256\'sı girer. Ret listesindeki POST/PUT/PATCH gövdesi boş JSON, DELETE gövdesizdir; hiçbirinde kimlik bilgisi yoktur (measured.credentialHeaderRequests). Kenar geçirirse olası sonuç rows[].ifPassed alanındadır. Owner telefon beyanı ayrı dosyadadır.' };
  if (summaryRefused) { out.exitCode = 7; out.summary.reason = 'ÖZET ANA MAKİNE ADINI İÇERİYOR — yazılmadı'; }
  try { fs.writeFileSync(OUT, JSON.stringify(out, null, 1), { flag: 'wx' }); } catch (e) { console.error('KANIT YAZILAMADI'); process.exit(7); }
  if (summaryRefused) { console.error('ADSIZ ÖZET YAZILMADI: özet içinde ana makine adı geçiyor'); process.exit(7); }
  try { fs.writeFileSync(SUMMARY_OUT, summaryText, { flag: 'wx' }); } catch (e) { console.error('ADSIZ ÖZET YAZILAMADI'); process.exit(7); }
  for (const x of rows) console.log(`${x.group.padEnd(5)} ${x.method.padEnd(7)} ${x.path.padEnd(45)} ${String(x.status).padEnd(3)} ret=${x.outcome}${x.errorClass ? '(' + x.errorClass + ')' : ''} yanki=${x.echo} katman=${x.layerId}${x.layerHint ? ' (ipucu: ' + x.layerHint + ')' : ''}`);
  console.log(`\nD-8 SONDA ${REVISION} · ${ALIAS} · konum (beyan) ${VANTAGE} · vektör kümesi ${VECTOR_SET_ID.slice(0, 16)}… · ret ${DENY.length} + pozitif ${ALLOW.length}`);
  console.log(`  ret sonucu (ret vektörleri): ${JSON.stringify(outcomeCounts.deny)}`);
  console.log(`  kalibrasyon: API yankı ${calibration.apiEcho}/${calibration.apiPositives} · web yankı ${calibration.webEcho}/${calibration.webPositives} · önek dışı başlıklı yanıt ${calibration.outsidePrefixHeaderRows} → ${calibration.result}`);
  console.log(`  katman kimliği (ret vektörleri): ${JSON.stringify(layerCounts.deny)} · ipucu (kanıt değil) ${JSON.stringify(denyLayerHints)}`);
  console.log(`  kimlik başlığı ${measured.credentialHeaderRequests}/${measured.requestCount} · dolu gövde ${measured.nonEmptyBodyRequests} · sonuç yok ${out.unmeasured}`);
  console.log(`RET HÜKMÜ    : ${ret.value} (çıkış ${ret.exitCode})${ret.reasons.length ? ' — ' + ret.reasons.map((r) => `${r.reason}×${r.count}${r.pending ? ' [OWNER KARARI BEKLİYOR]' : ''}`).join(' · ') : ''}${ret.value === 'KAPALI' ? ' — ' + KAYIT_EKI : ''}`);
  console.log(`KATMAN HÜKMÜ : ${layer.value} (PASS / FAIL değeri almaz; kabulü owner kararıdır)`);
  console.log(`D8-AD=${ALIAS}\nD8-RET-HUKMU=${ret.value}\nD8-KATMAN-HUKMU=${layer.value}\nD8-KARAR-BEKLIYOR=${ret.pendingOwnerDecision ? 'EVET' : 'HAYIR'}\nD8-OZET-SHA256=${summarySha256}\nD8-CIKIS=${ret.exitCode}`);
  // Çıkış kodu olay döngüsü boşalınca verilir (son satırlar kesilmesin); boşta bağlantılar kapatılır, takılırsa 3 sn sonra zorla çıkılır.
  process.exitCode = ret.exitCode; https.globalAgent.destroy(); setTimeout(() => process.exit(ret.exitCode), 3000).unref();
})();
