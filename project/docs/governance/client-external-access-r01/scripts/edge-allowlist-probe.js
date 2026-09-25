'use strict';
// IZOLE KENAR PROVASI — Caddy sablonunun 18 izinli cift, yanlis yontemler, yasak yollar ve
// kodlama/normalizasyon varyantlari karsisindaki DAVRANISINI olcer. Canli servislere dokunmaz.
const http = require('http');

const EDGE_PORT = Number(process.argv[2] || 8085);
// Host basligi: ozel ad, yardimci fallback origin adi ya da rastgele bir ad. Kenar karari Host'a
// BAKMAMALI — ayni vektorler her Host'ta ayni sonucu vermelidir (paket §19.4).
const HOST = process.argv[3] || 'form.tellihukuk.com';

function req(method, path, extraHeaders) {
  return new Promise((resolve) => {
    const r = http.request(
      { host: '127.0.0.1', port: EDGE_PORT, method, path, headers: Object.assign({ host: HOST }, extraHeaders || {}) },
      (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => {
          let j = null;
          try { j = JSON.parse(b); } catch { /* 403 govdesi bos */ }
          resolve({ status: res.statusCode, upstream: j && j.service, rawUrlSeen: j && j.rawUrlSeen, xff: j && j.xff });
        });
      },
    );
    r.on('error', (e) => resolve({ status: 0, error: e.message }));
    if (method === 'POST') r.write('{}');
    r.end();
  });
}

// --- 1) IZIN LISTESI: paket §2.1'in HER satiri en az bir vektorle kapsanir ---
const ALLOW = [
  ['§2.1-1 intake sayfasi',            'GET',    '/intake/TKN123',                               'WEB'],
  ['§2.1-2 portal kok',                'GET',    '/portal',                                      'WEB'],
  ['§2.1-2 portal/login',              'GET',    '/portal/login',                                'WEB'],
  ['§2.1-2 portal/forgot-password',    'GET',    '/portal/forgot-password',                      'WEB'],
  ['§2.1-2 portal/reset-password',     'GET',    '/portal/reset-password',                       'WEB'],
  ['§2.1-2 portal/cases',              'GET',    '/portal/cases',                                'WEB'],
  ['§2.1-2 portal/cases/:id',          'GET',    '/portal/cases/abc123',                         'WEB'],
  ['§2.1-2 portal/documents',          'GET',    '/portal/documents',                            'WEB'],
  ['§2.1-2 portal/financial-disc.',    'GET',    '/portal/financial-disclosures',                'WEB'],
  ['§2.1-2 portal/messages',           'GET',    '/portal/messages',                             'WEB'],
  ['§2.1-2 portal/poas',               'GET',    '/portal/poas',                                 'WEB'],
  ['§2.1-2 portal/profile',            'GET',    '/portal/profile',                              'WEB'],
  ['§2.1-3 _next varligi',             'GET',    '/_next/static/chunks/main-abc.js',             'WEB'],
  ['§2.1-3 favicon',                   'GET',    '/favicon.ico',                                 'WEB'],
  ['§2.1-4 public intake GET',         'GET',    '/api/public/intake/TKN123',                    'API'],
  ['§2.1-4 public intake POST',        'POST',   '/api/public/intake/TKN123',                    'API'],
  ['§2.1-5 portal login',              'POST',   '/api/portal/login',                            'API'],
  ['§2.1-5 portal forgot-password',    'POST',   '/api/portal/forgot-password',                  'API'],
  ['§2.1-5 portal reset-password',     'POST',   '/api/portal/reset-password',                   'API'],
  ['§2.1-5 portal change-password',    'POST',   '/api/portal/change-password',                  'API'],
  ['§2.1-6 cases',                     'GET',    '/api/portal/cases',                            'API'],
  ['§2.1-6 cases/:id',                 'GET',    '/api/portal/cases/c1',                         'API'],
  ['§2.1-6 financial-disclosures',     'GET',    '/api/portal/financial-disclosures',            'API'],
  ['§2.1-6 fd/history',                'GET',    '/api/portal/financial-disclosures/history',    'API'],
  ['§2.1-6 fd/:id',                    'GET',    '/api/portal/financial-disclosures/f1',         'API'],
  ['§2.1-6 poas',                      'GET',    '/api/portal/poas',                             'API'],
  ['§2.1-6 notifications',             'GET',    '/api/portal/notifications',                    'API'],
  ['§2.1-6 notif/unread-count',        'GET',    '/api/portal/notifications/unread-count',       'API'],
  ['§2.1-6 documents',                 'GET',    '/api/portal/documents',                        'API'],
  ['§2.1-6 documents/:id/download',    'GET',    '/api/portal/documents/d1/download',            'API'],
  ['§2.1-6 messages',                  'GET',    '/api/portal/messages',                         'API'],
  ['§2.1-6 messages/unread-count',     'GET',    '/api/portal/messages/unread-count',            'API'],
  ['§2.1-7 notif/:id/read',            'POST',   '/api/portal/notifications/n1/read',            'API'],
  ['§2.1-7 notif/read-all',            'POST',   '/api/portal/notifications/read-all',           'API'],
  ['§2.1-7 messages POST',             'POST',   '/api/portal/messages',                         'API'],
  ['§2.1-7 messages/mark-read',        'POST',   '/api/portal/messages/mark-read',               'API'],
  ['§2.1-8 documents/upload',          'POST',   '/api/portal/documents/upload',                 'API'],
  ['§2.1-9 documents/:id DELETE',      'DELETE', '/api/portal/documents/d1',                     'API'],
];

// --- 2) REDDEDILMESI GEREKENLER: personel yuzeyi, admin, yanlis yontem ---
const DENY = [
  ['personel kok',                     'GET',    '/'],
  ['personel giris sayfasi',           'GET',    '/auth/login'],
  ['personel dashboard',               'GET',    '/dashboard'],
  ['personel davet sayfasi',           'GET',    '/auth/accept-invite'],
  ['api auth me',                      'GET',    '/api/auth/me'],
  ['api auth login',                   'POST',   '/api/auth/login'],
  ['api auth invites',                 'POST',   '/api/auth/invites'],
  ['personel cases API',               'GET',    '/api/cases'],
  ['ADMIN belge listesi',              'GET',    '/api/portal/admin/documents/pending'],
  ['ADMIN kullanici acma',             'POST',   '/api/portal/admin/create-user'],
  ['ADMIN kullanici kapatma',          'POST',   '/api/portal/admin/disable-user'],
  ['ADMIN mesaj listesi',              'GET',    '/api/portal/admin/messages/clients'],
  ['ADMIN belge onay',                 'POST',   '/api/portal/admin/documents/x/approve'],
  ['ADMIN kok',                        'GET',    '/api/portal/admin'],
  ['yanlis yontem: intake DELETE',     'DELETE', '/intake/TKN123'],
  ['yanlis yontem: sayfaya POST',      'POST',   '/portal/login'],
  ['yanlis yontem: messages PUT',      'PUT',    '/api/portal/messages'],
  ['yanlis yontem: cases PATCH',       'PATCH',  '/api/portal/cases/c1'],
  ['yanlis yontem: cases DELETE',      'DELETE', '/api/portal/cases/c1'],
  ['yanlis yontem: cases HEAD',        'HEAD',   '/api/portal/cases'],
  ['yanlis yontem: login OPTIONS',     'OPTIONS','/api/portal/login'],
  ['yanlis yontem: upload GET',        'GET',    '/api/portal/documents/upload'],
  ['liste disi: belge indirmesiz',     'GET',    '/api/portal/documents/d1'],
  ['liste disi: cases POST',           'POST',   '/api/portal/cases'],
  ['liste disi: fazla segment',        'GET',    '/api/public/intake/TKN123/extra'],
  ['liste disi: _next ciplak',         'GET',    '/_next'],
  ['liste disi: portal fazla segment', 'GET',    '/portal/cases/a/b'],
  ['liste disi: api portal koku',      'GET',    '/api/portal/'],
  ['liste disi: seed ucu',             'POST',   '/api/seed'],
];

// --- 3) KODLAMA / NORMALIZASYON: izin listesini asma denemeleri ---
const EVASION = [
  ['yuzde-kodlu a: %61dmin',           'GET',    '/api/portal/%61dmin/documents/pending'],
  ['yuzde-kodlu a: %61dmin POST',      'POST',   '/api/portal/%61dmin/create-user'],
  ['kodlu slash: admin%2F...',         'GET',    '/api/portal/admin%2Fdocuments%2Fpending'],
  ['DELETE + kodlu traversal',         'DELETE', '/api/portal/documents/x%2F..%2Fadmin%2Fdocuments%2Fpending'],
  ['duz traversal: cases/../admin',    'GET',    '/api/portal/cases/../admin/documents/pending'],
  ['kodlu traversal: ..%2Fadmin',      'GET',    '/api/portal/documents/..%2Fadmin/documents/pending'],
  ['cift slash: //api/.../admin',      'GET',    '//api/portal/admin/documents/pending'],
  ['nokta segment: /./admin',          'GET',    '/api/portal/./admin/documents/pending'],
  ['buyuk harf: /API/portal/cases',    'GET',    '/API/portal/cases'],
  ['buyuk harf: /ADMIN/',              'GET',    '/api/portal/ADMIN/documents/pending'],
  ['sondaki slash: cases/',            'GET',    '/api/portal/cases/'],
  ['noktali virgul: cases;x=1',        'GET',    '/api/portal/cases;x=1'],
  ['web traversal: intake/../auth',    'GET',    '/intake/abc/../../auth/login'],
  ['web traversal: _next/../auth',     'GET',    '/_next/../auth/login'],
  ['web kodlu traversal',              'GET',    '/_next/%2e%2e/auth/login'],
  ['bos bayt kodlu',                   'GET',    '/api/portal/cases%00/admin'],
  ['cift kodlama: %252e%252e',         'GET',    '/api/portal/documents/%252e%252e/admin'],
  ['unicode slash denemesi',           'GET',    '/api/portal/admin%c0%afdocuments/pending'],
];

// Izin listesine uyan bir YOL kumesi — arka uca ulasan istek bunlardan birine uymali.
const ALLOWED_PATH_RE = [
  /^\/(intake\/[^/]+|portal(\/(login|forgot-password|reset-password|cases|documents|financial-disclosures|messages|poas|profile))?|portal\/cases\/[^/]+|_next\/.+|favicon\.ico)$/,
  /^\/api\/(public\/intake\/[^/]+|portal\/(cases|cases\/[^/]+|financial-disclosures|financial-disclosures\/history|financial-disclosures\/[^/]+|poas|notifications|notifications\/unread-count|documents|documents\/[^/]+\/download|messages|messages\/unread-count))$/,
  /^\/api\/(public\/intake\/[^/]+|portal\/(login|forgot-password|reset-password|change-password|notifications\/[^/]+\/read|notifications\/read-all|messages|messages\/mark-read|documents\/upload))$/,
  /^\/api\/portal\/documents\/[^/]+$/,
];

function pathOf(url) { return String(url || '').split('?')[0]; }

(async () => {
  const rows = [];
  let fail = 0;

  for (const [ad, m, p, beklenenUpstream] of ALLOW) {
    const r = await req(m, p);
    const ok = r.status === 200 && r.upstream === beklenenUpstream;
    if (!ok) fail++;
    rows.push({ grup: 'IZIN', ad, istek: `${m} ${p}`, durum: r.status, hedef: r.upstream || '-', beklenen: beklenenUpstream, sonuc: ok ? 'PASS' : 'FAIL' });
  }

  for (const [ad, m, p] of DENY) {
    const r = await req(m, p);
    const ok = r.status === 403 && !r.upstream;
    if (!ok) fail++;
    rows.push({ grup: 'RET', ad, istek: `${m} ${p}`, durum: r.status, hedef: r.upstream || '-', beklenen: '403 / arka uca gitmez', sonuc: ok ? 'PASS' : 'FAIL' });
  }

  for (const [ad, m, p] of EVASION) {
    const r = await req(m, p);
    // Olcut: ya 403, ya da arka uca ULASAN yol izin listesine UYUYOR olmali.
    const reached = Boolean(r.upstream);
    const seen = pathOf(r.rawUrlSeen);
    const seenAllowed = reached && ALLOWED_PATH_RE.some((re) => re.test(seen));
    const ok = !reached || seenAllowed;
    if (!ok) fail++;
    rows.push({
      grup: 'KODLAMA', ad, istek: `${m} ${p}`, durum: r.status,
      hedef: r.upstream || '-', beklenen: reached ? `arka ucun gordugu: ${seen}` : '403 / arka uca gitmez',
      sonuc: ok ? 'PASS' : 'FAIL',
    });
  }

  // XFF davranisi: istemcinin gonderdigi sahte deger kenarda SILINMELI.
  const x = await req('GET', '/api/portal/cases', { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
  const xffOk = x.status === 200 && x.xff && !String(x.xff).includes('1.2.3.4');
  if (!xffOk) fail++;
  rows.push({ grup: 'XFF', ad: 'sahte X-Forwarded-For silinir', istek: 'GET /api/portal/cases (XFF: 1.2.3.4, 5.6.7.8)', durum: x.status, hedef: x.upstream || '-', beklenen: `arka ucun gordugu XFF: ${x.xff}`, sonuc: xffOk ? 'PASS' : 'FAIL' });

  console.log(JSON.stringify({ toplam: rows.length, pass: rows.length - fail, fail, rows }, null, 1));
  process.exit(fail > 0 ? 1 : 0);
})();
