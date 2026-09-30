'use strict';
/*
 * EXTACC D-8 R01 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI: makine ölçümü (owner PC'sinden, gerçek alan adı, gerçek TLS).
 *
 * NE ÖLÇER : izin listesi DIŞINDAKİ (yöntem, yol) çiftleri kenardan REDDEDİLİR (403) — personel sayfaları, personel API'si,
 *            /api/portal/admin/*, izinli yollarda yanlış yöntem (POST/PUT/PATCH/DELETE), kodlama/normalizasyon varyantları.
 *            Pozitif kontroller izinli yolların UYGULAMA katmanına ulaştığını gösterir (401 = guard'a ulaştı; 200 = sayfa).
 * KATMAN   : her 403 için `hints` AYRI alanlarda kaydedilir: bodyEmpty · providerSignature (gövde imzası, bool) ·
 *            edgeHeaderPresent (kenar başlığı varlığı) · serverHeaderValue (yalnız değer adı: 'Caddy' / 'cloudflare' / '') ·
 *            cfMitigatedPresent. `layer` YALNIZ Server başlığı katmanı DOĞRUDAN adlandırıyorsa set edilir:
 *              'Caddy' → 'caddy' · sağlayıcı imzası + sağlayıcı Server başlığı → 'edge-provider' · aksi 'unknown'.
 *            BOŞ 403 GÖVDESİ TEK BAŞINA 'caddy' DEMEZ (kenar sağlayıcı Server başlığını yeniden yazabilir; boş gövde başka
 *            katmanlardan da gelebilir). 'unknown' = ret VAR, katman ÖLÇÜLEMEDİ. Başlık değerleri kanıta yazılmaz (yalnız ad/varlık).
 * HAM YOL  : istek `https.request({host, port, path, method, servername})` ile atılır; `path` vektördeki HAM dizedir
 *            ('/api/portal/./admin/...', '%2F', '?x=1' normalize EDİLMEZ). Öz-test kenarın gördüğü yolu birebir doğrular.
 * İSTEK LİSTESİ VE YAN ETKİ (KİMLİK BİLGİSİ GÖNDERİLMEZ):
 *   · Ret listesinde POST/PUT/PATCH/DELETE vardır — POST/PUT/PATCH gövdesi BOŞ JSON `{}`; DELETE GÖVDESİZ (yalnız
 *     `content-type: application/json` başlığı). Hiçbir istekte authorization/cookie/x-api-key başlığı yoktur.
 *   · Beklenen: her ret vektörü kenardan 403 (uygulamaya ULAŞMAZ → yan etki yok).
 *   · KENAR GEÇİRİRSE (bulgu = çıkış 2) olası uygulama yan etkisi, her vektörde `ifPassed` alanındadır. Öne çıkanlar:
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
 * YAPMAZ   : kimlik bilgisi göndermez; forgot-password/reset-password çağırmaz (e-posta); intake POST, belge yükleme, mesaj yazma yok;
 *            DB erişimi yok. Pozitif listedeki POST/DELETE'ler token olmadan guard 401'de durur.
 * KANIT    : `design` alanı (credentialsSent / writesAttempted = false) betik TASARIM BEYANIDIR (ölçüm değil).
 *            `measured { requestCount, credentialHeaderRequests, nonEmptyBodyRequests, bodies }` istek döngüsünden TÜRETİLİR:
 *            gönderilen başlık adları ve gövde her satırda `sent` alanındadır (kimlik başlığı yok; gövde ∈ {'', '{}'}).
 *            `suspectAppOrigin403` = 403 + gövde DOLU + sağlayıcı imzası YOK sayısı: kenar reddi ile uygulama-kaynaklı 403 (ForbiddenException)
 *            `ok` alanında ayrılmaz (ikisi de 403); bu sayaç >0 ise PASS düşmez, kayda not düşülür (R27'de token'sız istekte
 *            uygulama 403'ü beklenmez: JwtAuthGuard 401 verir).
 * KULLANIM : node d8-staff-surface-probe.js --origin https://<public-host> --out <kanit.json> [--phone-list]
 *            --phone-list: owner'ın telefonda (mobil veri) açacağı 5 adresi yazar (beyan ayrı; makine ölçümü değildir).
 * ÇIKIŞ    : 0 tüm retler 403 + pozitifler beklendiği gibi · 2 en az bir ret 403 DEĞİL (BULGU) · 3 ölçülemeyen (ağ/zaman aşımı) ·
 *            4 kapı (origin https değil, TLS doğrulaması kapalı) · 7 kanıt yazılamadı.
 */
const https = require('https'); const fs = require('fs');

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
const ORIGIN = arg('--origin'); const OUT = arg('--out'); const PHONE = process.argv.includes('--phone-list');
if (!ORIGIN || !/^https:\/\/[^/]+$/.test(ORIGIN)) { console.error('REDDEDİLDİ: --origin https://<host> (yolsuz) gerekli'); process.exit(4); }
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') { console.error('REDDEDİLDİ: TLS doğrulaması kapalı'); process.exit(4); }
if (!OUT && !PHONE) { console.error('REDDEDİLDİ: --out <kanit.json> gerekli'); process.exit(4); }
const TIMEOUT_MS = Number(process.env.D8_HTTP_TIMEOUT_MS || 15000);
const ORIGIN_URL = new URL(ORIGIN); const HOST = ORIGIN_URL.hostname; const PORT = Number(ORIGIN_URL.port || 443);

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
  ['portal admin büyük harf',     'GET',    '/api/portal/ADMIN/documents/pending',        FX.adminVar],
  ['portal admin nokta-segment',  'GET',    '/api/portal/./admin/documents/pending',      FX.adminVar],
  ['portal admin kodlanmış /',    'GET',    '/api/portal%2Fadmin/documents/pending',      FX.adminVar],
  ['portal admin sorgu ile',      'GET',    '/api/portal/admin/documents/pending?x=1',    FX.admin],
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

/** Kimlik taşıyabilecek istek başlıkları (ölçüm: gönderilen başlık adları bunlarla karşılaştırılır). */
const CREDENTIAL_HEADERS = /^(authorization|cookie|x-api-key|proxy-authorization)$/i;
/** Ham request-target korunur: URL string DEĞİL, seçenek nesnesi (path olduğu gibi gider).
 *  Dönüşte `sent` = gerçekten gönderilen başlık adları + gövde (POST/PUT/PATCH '{}', diğerleri ''). */
function req(method, path) {
  const headers = { host: ORIGIN_URL.host, 'user-agent': 'extacc-d8-probe', 'content-type': 'application/json', accept: '*/*' };
  const body = (method === 'POST' || method === 'PUT' || method === 'PATCH') ? '{}' : '';
  const sent = { headerNames: Object.keys(headers), body };
  return new Promise((resolve) => {
    const r = https.request({ host: HOST, port: PORT, path, method, servername: HOST, headers, timeout: TIMEOUT_MS }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { if (b.length < 4096) b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers, sent }));
    });
    r.on('timeout', () => r.destroy(new Error('zaman aşımı'))); r.on('error', (e) => resolve({ status: 0, error: String(e.message || e).slice(0, 80), sent }));
    if (body) r.write(body);
    r.end();
  });
}
/** Server başlığından yalnız ürün ADI (sürüm/ek bilgi atılır): 'Caddy', 'cloudflare', 'nginx', ''. */
function serverName(h) { const v = String((h && h.server) || '').trim(); return v.split(/[\s/;,]/)[0].slice(0, 20); }
/** Katman ipuçları AYRI alanlarda; hiçbiri tek başına katman demez. */
function hintsOf(r) {
  const h = r.headers || {}; const body = String(r.body || '');
  return { bodyEmpty: body.trim() === '', providerSignature: /cloudflare|error code:\s*10\d\d|cf-error/i.test(body),
    edgeHeaderPresent: !!h['cf-ray'], serverHeaderValue: serverName(h), cfMitigatedPresent: !!h['cf-mitigated'] };
}
/** Katman YALNIZ Server başlığı doğrudan adlandırıyorsa set edilir; aksi 'unknown' (= ölçülemedi, "ret yok" değil). */
function layerOf(r, hints) {
  if (r.status !== 403) return null;
  const s = hints.serverHeaderValue.toLowerCase();
  if (s === 'caddy') return 'caddy';
  if (hints.providerSignature && s === 'cloudflare') return 'edge-provider';
  return 'unknown';
}
const row = (grp, name, method, path, r, expect, ifPassed) => {
  const hints = r.status !== 0 ? hintsOf(r) : null; // ölçülen her yanıt için ipuçları; katman yalnız 403'te türetilir
  return { group: grp, name, method, path, status: r.status, ok: r.status !== 0 && expect.includes(r.status), layer: hints ? layerOf(r, hints) : null,
    hints, ifPassed: grp === 'deny' ? ifPassed : null, sent: r.sent, error: r.error || null };
};

(async () => {
  if (PHONE) {
    const list = ['/auth/login', '/', '/api/auth/me', '/api/portal/admin/documents/pending', '/api/cases'];
    console.log('TELEFON (Wi-Fi KAPALI, mobil veri, gizli sekme) — her adres için ne gördüğünüzü not edin (E = hata/erişim engellendi · S = sayfa/veri açıldı · ?):');
    list.forEach((p, i) => console.log(`  ${i + 1}. ${ORIGIN}${p}`));
    console.log('Beyan makine ölçümü DEĞİLDİR; koşucu kanıtı ayrı dosyadadır.');
    if (!OUT) return;
  }
  const t0 = new Date().toISOString(); const rows = [];
  for (const [name, method, path, fx] of DENY) rows.push(row('deny', name, method, path, await req(method, path), [403], fx));
  for (const [name, method, path, exp] of ALLOW) rows.push(row('allow', name, method, path, await req(method, path), exp, null));
  const unmeasured = rows.filter((x) => x.status === 0); const findings = rows.filter((x) => x.status !== 0 && !x.ok);
  const denyLayers = rows.filter((x) => x.group === 'deny' && x.status === 403).reduce((m, x) => { m[x.layer] = (m[x.layer] || 0) + 1; return m; }, {});
  // Uygulama-kaynaklı 403 şüphesi: 403 + gövde DOLU + sağlayıcı imzası YOK (kenar `respond 403` boş gövdelidir). PASS düşürmez; kayda not.
  const suspectAppOrigin403 = rows.filter((x) => x.status === 403 && x.hints && !x.hints.bodyEmpty && !x.hints.providerSignature).length;
  // ÖLÇÜM (istek döngüsünden türetilir): kimlik başlığı gönderilen istek sayısı; '' veya '{}' dışı gövdeli istek sayısı; gövde dağılımı.
  const bodies = rows.reduce((m, x) => { const k = x.sent.body === '' ? 'empty' : (x.sent.body === '{}' ? 'emptyJson' : 'other'); m[k] = (m[k] || 0) + 1; return m; }, {});
  const measured = { requestCount: rows.length, credentialHeaderRequests: rows.filter((x) => x.sent.headerNames.some((h) => CREDENTIAL_HEADERS.test(h))).length,
    nonEmptyBodyRequests: bodies.other || 0, bodies };
  const out = { record: 'EXTACC-D8-STAFF-SURFACE-PROBE', revision: 'R01', originHost: ORIGIN_URL.host, startedAt: t0, finishedAt: new Date().toISOString(),
    deny: DENY.length, allow: ALLOW.length, denyLayers, suspectAppOrigin403, findings: findings.map((x) => `${x.group} ${x.method} ${x.path} → HTTP ${x.status}`), unmeasured: unmeasured.length, rows,
    design: { credentialsSent: false, writesAttempted: false, note: 'betik TASARIM BEYANI (ölçüm değil): vektör listesinde kimlik bilgisi ve yazma verisi yoktur; ölçüm `measured` alanındadır' },
    measured,
    note: 'layer yalnız Server başlığı katmanı doğrudan adlandırıyorsa set edilir (Caddy→caddy; sağlayıcı imzası+sağlayıcı Server→edge-provider); "unknown" ret olmadığı anlamına gelmez, katmanın ölçülemediği anlamına gelir. Boş 403 gövdesi tek başına katman kanıtı DEĞİLDİR (hints.bodyEmpty ayrı alandadır). suspectAppOrigin403 = 403 + dolu gövde + sağlayıcı imzası yok (uygulama-kaynaklı 403 şüphesi; PASS düşürmez). Ret listesindeki POST/PUT/PATCH gövdesi boş JSON, DELETE gövdesizdir; hiçbirinde kimlik bilgisi yoktur (measured.credentialHeaderRequests). Kenar geçirirse olası sonuç rows[].ifPassed alanındadır. Owner telefon beyanı ayrı dosyadadır.' };
  out.exitCode = findings.length ? 2 : (unmeasured.length ? 3 : 0);
  try { fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); } catch (e) { console.error('KANIT YAZILAMADI'); process.exit(7); }
  for (const x of rows) console.log(`${x.ok ? 'OK  ' : (x.status === 0 ? '????' : 'FAIL')} ${x.group.padEnd(5)} ${x.method.padEnd(6)} ${x.path.padEnd(45)} ${x.status}${x.layer ? ' ' + x.layer : ''}`);
  console.log(`\nD-8 SONDA: ret ${DENY.length} (403 olmayan ${findings.filter((x) => x.group === 'deny').length}) · pozitif ${ALLOW.length} (beklenmeyen ${findings.filter((x) => x.group === 'allow').length}) · ölçülemeyen ${unmeasured.length} · katmanlar ${JSON.stringify(denyLayers)} · uygulama-403 şüphesi ${suspectAppOrigin403} · kimlik başlığı ${measured.credentialHeaderRequests}/${measured.requestCount} · dolu gövde ${measured.nonEmptyBodyRequests} · çıkış ${out.exitCode}`);
  process.exit(out.exitCode);
})();
