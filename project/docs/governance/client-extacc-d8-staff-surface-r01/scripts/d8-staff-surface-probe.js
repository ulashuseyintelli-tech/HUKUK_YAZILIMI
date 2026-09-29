'use strict';
/*
 * EXTACC D-8 R01 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI: makine ölçümü (owner PC'sinden, gerçek alan adı, gerçek TLS).
 *
 * NE ÖLÇER : izin listesi DIŞINDAKİ (yöntem, yol) çiftleri kenardan REDDEDİLİR (403) — personel sayfaları, personel API'si,
 *            /api/portal/admin/*, izinli yollarda yanlış yöntem (POST/PUT/PATCH/DELETE), kodlama/normalizasyon varyantları.
 *            Her ret için KATMAN ayrıca kaydedilir: 'edge-waf' (sağlayıcı kuralı; gövdede sağlayıcı imzası), 'caddy' (boş 403
 *            gövdesi; Caddyfile `respond 403`), 'unknown'. Pozitif kontroller izinli yolların UYGULAMA katmanına ulaştığını
 *            gösterir (401 = guard'a ulaştı; 200 = sayfa) — yazma yapan hiçbir uç çağrılmaz.
 * YAPMAZ   : giriş denemesi (hız sınırı sayacı), forgot-password (e-posta), intake POST, belge/mesaj yazımı, DB erişimi.
 * KULLANIM : node d8-staff-surface-probe.js --origin https://<public-host> --out <kanit.json> [--phone-list]
 *            --phone-list: owner'ın telefonda (mobil veri) açacağı 5 adresi yazar (beyan ayrı; makine ölçümü değildir).
 * ÇIKIŞ    : 0 tüm retler 403 + pozitifler beklendiği gibi · 2 en az bir ret 403 DEĞİL (BULGU) · 3 ölçülemeyen (ağ/zaman aşımı) ·
 *            4 kapı (origin https değil, TLS doğrulaması kapalı) · 7 kanıt yazılamadı.
 * NOT      : dışarıdan 403 görmek katmanı KANITLAMAZ; katman gövde/başlık imzasından türetilir ve 'unknown' olabilir.
 */
const https = require('https'); const fs = require('fs');

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
const ORIGIN = arg('--origin'); const OUT = arg('--out'); const PHONE = process.argv.includes('--phone-list');
if (!ORIGIN || !/^https:\/\/[^/]+$/.test(ORIGIN)) { console.error('REDDEDİLDİ: --origin https://<host> (yolsuz) gerekli'); process.exit(4); }
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') { console.error('REDDEDİLDİ: TLS doğrulaması kapalı'); process.exit(4); }
if (!OUT && !PHONE) { console.error('REDDEDİLDİ: --out <kanit.json> gerekli'); process.exit(4); }
const TIMEOUT_MS = Number(process.env.D8_HTTP_TIMEOUT_MS || 15000);

// Kenar izin listesi (client-external-access-r01/templates/Caddyfile.template) DIŞI vektörler — hepsi 403 beklenir.
const DENY = [
  ['personel kök',                'GET',    '/'],
  ['personel giriş sayfası',      'GET',    '/auth/login'],
  ['personel panel',              'GET',    '/dashboard'],
  ['personel sıfırlama sayfası',  'GET',    '/auth/reset-password'],
  ['personel oturum',             'GET',    '/api/auth/me'],
  ['personel giriş API',          'POST',   '/api/auth/login'],
  ['personel dosya listesi',      'GET',    '/api/cases'],
  ['personel kullanıcılar',       'GET',    '/api/users'],
  ['sağlık ucu',                  'GET',    '/api/health'],
  ['portal admin create',         'POST',   '/api/portal/admin/create-user'],
  ['portal admin disable',        'POST',   '/api/portal/admin/disable-user'],
  ['portal admin belgeler',       'GET',    '/api/portal/admin/documents/pending'],
  ['portal admin mesajlar',       'GET',    '/api/portal/admin/messages/clients'],
  ['portal admin kök',            'GET',    '/api/portal/admin'],
  ['portal admin büyük harf',     'GET',    '/api/portal/ADMIN/documents/pending'],
  ['portal admin nokta-segment',  'GET',    '/api/portal/./admin/documents/pending'],
  ['portal admin kodlanmış /',    'GET',    '/api/portal%2Fadmin/documents/pending'],
  ['portal admin sorgu ile',      'GET',    '/api/portal/admin/documents/pending?x=1'],
  ['intake DELETE',               'DELETE', '/intake/d8probe'],
  ['intake API DELETE',           'DELETE', '/api/public/intake/d8probe'],
  ['intake API PUT',              'PUT',    '/api/public/intake/d8probe'],
  ['intake API PATCH',            'PATCH',  '/api/public/intake/d8probe'],
  ['portal login GET (yöntem)',   'GET',    '/api/portal/login'],
  ['portal cases POST (yöntem)',  'POST',   '/api/portal/cases'],
  ['portal cases DELETE',         'DELETE', '/api/portal/cases/d8probe'],
  ['portal messages DELETE',      'DELETE', '/api/portal/messages'],
  ['portal messages PUT',         'PUT',    '/api/portal/messages'],
  ['portal documents PUT',        'PUT',    '/api/portal/documents/d8probe'],
  ['portal documents POST id',    'POST',   '/api/portal/documents/d8probe'],
  ['portal profile POST (web)',   'POST',   '/portal/profile'],
  ['portal change-password GET',  'GET',    '/api/portal/change-password'],
  ['portal login sayfası POST',   'POST',   '/portal/login'],
  ['bilinmeyen kök yol',          'GET',    '/robots.txt'],
  ['api kök',                     'GET',    '/api'],
  ['api kök slash',               'GET',    '/api/'],
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

function req(method, path) {
  return new Promise((resolve) => {
    const r = https.request(ORIGIN + path, { method, headers: { 'user-agent': 'extacc-d8-probe', 'content-type': 'application/json', accept: '*/*' }, timeout: TIMEOUT_MS }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { if (b.length < 4096) b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    r.on('timeout', () => r.destroy(new Error('zaman aşımı'))); r.on('error', (e) => resolve({ status: 0, error: String(e.message || e).slice(0, 80) }));
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') r.write('{}');
    r.end();
  });
}
/** Ret katmanı: sağlayıcı imzası → edge-waf; boş gövde → caddy; başka → unknown. Başlık değerleri kanıta yazılmaz (yalnız varlık). */
function layerOf(r) {
  if (r.status !== 403) return null;
  const body = String(r.body || ''); const srv = String((r.headers && r.headers.server) || '').toLowerCase();
  if (/cloudflare|error code:\s*10\d\d|cf-error/i.test(body) || (r.headers && r.headers['cf-mitigated'])) return 'edge-waf';
  if (body.trim() === '') return 'caddy'; // Caddyfile `respond 403` gövdesiz; kenar başlığı varlığı ayrı alanda (edgeHeaderPresent)
  return 'unknown';
}
const row = (grp, name, method, path, r, expect) => ({ group: grp, name, method, path, status: r.status, ok: r.status !== 0 && expect.includes(r.status), layer: layerOf(r),
  edgeHeaderPresent: !!(r.headers && r.headers['cf-ray']), serverHeader: r.headers ? String(r.headers.server || '').slice(0, 20) : null, error: r.error || null });

(async () => {
  if (PHONE) {
    const list = ['/auth/login', '/', '/api/auth/me', '/api/portal/admin/documents/pending', '/api/cases'];
    console.log('TELEFON (Wi-Fi KAPALI, mobil veri, gizli sekme) — her adres için ne gördüğünüzü not edin (E = hata/erişim engellendi · S = sayfa/veri açıldı · ?):');
    list.forEach((p, i) => console.log(`  ${i + 1}. ${ORIGIN}${p}`));
    console.log('Beyan makine ölçümü DEĞİLDİR; koşucu kanıtı ayrı dosyadadır.');
    if (!OUT) return;
  }
  const t0 = new Date().toISOString(); const rows = [];
  for (const [name, method, path] of DENY) rows.push(row('deny', name, method, path, await req(method, path), [403]));
  for (const [name, method, path, exp] of ALLOW) rows.push(row('allow', name, method, path, await req(method, path), exp));
  const unmeasured = rows.filter((x) => x.status === 0); const findings = rows.filter((x) => x.status !== 0 && !x.ok);
  const denyLayers = rows.filter((x) => x.group === 'deny' && x.status === 403).reduce((m, x) => { m[x.layer] = (m[x.layer] || 0) + 1; return m; }, {});
  const out = { record: 'EXTACC-D8-STAFF-SURFACE-PROBE', revision: 'R01', originHost: new URL(ORIGIN).host, startedAt: t0, finishedAt: new Date().toISOString(),
    deny: DENY.length, allow: ALLOW.length, denyLayers, findings: findings.map((x) => `${x.group} ${x.method} ${x.path} → HTTP ${x.status}`), unmeasured: unmeasured.length, rows,
    note: 'Katman gövde/başlık imzasından türetilir; "unknown" ret olmadığı anlamına gelmez, katmanın ölçülemediği anlamına gelir. Owner telefon beyanı ayrı dosyadadır.' };
  out.exitCode = findings.length ? 2 : (unmeasured.length ? 3 : 0);
  try { fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); } catch (e) { console.error('KANIT YAZILAMADI'); process.exit(7); }
  for (const x of rows) console.log(`${x.ok ? 'OK  ' : (x.status === 0 ? '????' : 'FAIL')} ${x.group.padEnd(5)} ${x.method.padEnd(6)} ${x.path.padEnd(45)} ${x.status}${x.layer ? ' ' + x.layer : ''}`);
  console.log(`\nD-8 SONDA: ret ${DENY.length} (403 olmayan ${findings.filter((x) => x.group === 'deny').length}) · pozitif ${ALLOW.length} (beklenmeyen ${findings.filter((x) => x.group === 'allow').length}) · ölçülemeyen ${unmeasured.length} · katmanlar ${JSON.stringify(denyLayers)} · çıkış ${out.exitCode}`);
  process.exit(out.exitCode);
})();
