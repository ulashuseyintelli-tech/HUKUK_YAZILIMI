'use strict';
/*
 * R27 DAR KABUL (B2) — YALNIZ HTTP, tarayıcı yok, CANLI DB'YE YAZMAZ. Yerel API (127.0.0.1:8080) + yerel WEB (127.0.0.1:3002).
 *
 * R27 = R26 + D5-SEC (parola politikası API'de, token tüketilmeden; pasif hesaba sıfırlama yok; kapatmada token iptali;
 * portal/personel hız sınırı deposu ayrı; portal profil sayfası 8 karakter). Buradaki ayırt edici ölçüt DK-7'dir:
 *   POST /api/portal/reset-password {token:'r27-dar-kabul', password:'1234567'}  (7 karakter)
 *   R26 canlı : token aranır, bulunmaz → 400 "Geçersiz veya süresi dolmuş token"   (politika yok)
 *   R27       : politika ÖNCE → 400 "Şifre en az 8 karakter olmalıdır"            (token'a hiç bakılmaz; DB yazımı yok)
 * Her iki durumda da yazma yoktur (uydurma token hiçbir satırla eşleşmez). Hız sınırı sayacı (süreç içi) +1 olur.
 *
 * Kullanım: node r27-dar-kabul.js <before|after> <cikti.json>
 *   before = yayından ÖNCE (R26 davranışı beklenir: DK-7 "token" iletisi) · after = yayından SONRA (R27: "8 karakter")
 * Ölçütler (hepsi salt okuma):
 *   DK-1 API /api/auth/me → 401 (API ayakta, personel guard'ı)            DK-2 WEB /portal/login → 200
 *   DK-3 WEB /api/auth/me → 401 (R26 aynı-origin rewrite korunmuş)         DK-4 WEB /_next/static/<BUILD_ID>/_buildManifest.js → 200 (beklenen BUILD_ID)
 *   DK-5 API /api/portal/cases (token yok) → 401                            DK-6 API POST /api/portal/change-password (token yok) → 401
 *   DK-7 sıfırlama politikası ayrımı (yukarıda)                             DK-8 WEB /portal/profile → 200 ya da 3xx (sayfa mevcut; giriş yönlendirmesi olabilir)
 * Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN (yanıt yok) · 7 kanıt yazılamadı
 */
const fs = require('fs'); const http = require('http');
const PHASE = process.argv[2]; const OUT = process.argv[3];
if (!['before', 'after'].includes(PHASE) || !OUT) { console.error('kullanim: node r27-dar-kabul.js <before|after> <cikti.json>'); process.exit(2); }
const API = process.env.R27_API_BASE || 'http://127.0.0.1:8080'; const WEB = process.env.R27_WEB_BASE || 'http://127.0.0.1:3002';
const BUILD_ID = { before: process.env.R27_BUILD_ID_BEFORE || '5waeMoFGGMTLAYmn9oJvW', after: process.env.R27_BUILD_ID_AFTER || 'W2UQpBPD_fp8pq4y7aFIe' }[PHASE];
const TMO = Number(process.env.R27_HTTP_TIMEOUT_MS || 15000);
function req(method, url, body) {
  return new Promise((resolve) => {
    const r = http.request(url, { method, headers: { 'content-type': 'application/json', 'user-agent': 'r27-dar-kabul' }, timeout: TMO }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { if (b.length < 8192) b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { j = null; } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('timeout', () => r.destroy(new Error('zaman aşımı'))); r.on('error', (e) => resolve({ status: 0, error: String(e.message || e).slice(0, 80) }));
    if (body !== undefined) r.write(JSON.stringify(body)); r.end();
  });
}
const msgOf = (r) => (r.json && (Array.isArray(r.json.message) ? r.json.message.join(' | ') : String(r.json.message || ''))) || '';
(async () => {
  const rows = []; const add = (id, desc, r, ok, obs) => rows.push({ id, desc, verdict: r.status === 0 ? 'UNMEASURED' : (ok ? 'PASS' : 'FAIL'), observed: r.status === 0 ? `yanıt yok (${r.error})` : obs });
  let r = await req('GET', `${API}/api/auth/me`); add('DK-1', 'API /api/auth/me 401', r, r.status === 401, `HTTP ${r.status}`);
  r = await req('GET', `${WEB}/portal/login`); add('DK-2', 'WEB /portal/login 200', r, r.status === 200, `HTTP ${r.status}`);
  r = await req('GET', `${WEB}/api/auth/me`); add('DK-3', 'WEB /api/auth/me 401 (aynı-origin rewrite)', r, r.status === 401, `HTTP ${r.status}`);
  r = await req('GET', `${WEB}/_next/static/${BUILD_ID}/_buildManifest.js`); add('DK-4', `WEB buildManifest 200 (BUILD_ID ${BUILD_ID})`, r, r.status === 200, `HTTP ${r.status}`);
  r = await req('GET', `${API}/api/portal/cases`); add('DK-5', 'API /api/portal/cases (token yok) 401', r, r.status === 401, `HTTP ${r.status}`);
  r = await req('POST', `${API}/api/portal/change-password`, { currentPassword: 'x', newPassword: 'yyyyyyyy' }); add('DK-6', 'API change-password (token yok) 401', r, r.status === 401, `HTTP ${r.status}`);
  r = await req('POST', `${API}/api/portal/reset-password`, { token: 'r27-dar-kabul', password: '1234567' }); const m = msgOf(r);
  const isPolicy = /en az 8 karakter/i.test(m); const isToken = /Geçersiz veya süresi dolmuş token/i.test(m);
  add('DK-7', PHASE === 'after' ? 'R27: 7 karakterlik parola token tüketilmeden POLİTİKA ile 400 ("en az 8 karakter")' : 'R26 tabanı: politika YOK → 400 "Geçersiz veya süresi dolmuş token"', r,
    r.status === 400 && (PHASE === 'after' ? isPolicy : isToken), `HTTP ${r.status} · ileti=${m.slice(0, 60)}`);
  r = await req('GET', `${WEB}/portal/profile`); add('DK-8', 'WEB /portal/profile sayfası mevcut (200/3xx)', r, r.status === 200 || (r.status >= 300 && r.status < 400), `HTTP ${r.status}`);
  const s = { pass: rows.filter((x) => x.verdict === 'PASS').length, fail: rows.filter((x) => x.verdict === 'FAIL').length, unmeasured: rows.filter((x) => x.verdict === 'UNMEASURED').length };
  const out = { record: 'R27-DAR-KABUL', revision: 'R01', phase: PHASE, api: API, web: WEB, expectedBuildId: BUILD_ID, at: new Date().toISOString(), rows, summary: s, exitCode: s.fail ? 2 : (s.unmeasured ? 3 : 0) };
  try { fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); } catch (e) { console.error('KANIT YAZILAMADI'); process.exit(7); }
  for (const x of rows) console.log(`${x.verdict === 'PASS' ? 'OK  ' : x.verdict === 'FAIL' ? 'FAIL' : '????'} ${x.id.padEnd(5)} ${x.desc}\n        ${x.observed}`);
  console.log(`\nR27 DAR KABUL (${PHASE}): PASS ${s.pass} · FAIL ${s.fail} · ÖLÇÜLEMEYEN ${s.unmeasured} · çıkış ${out.exitCode}`);
  process.exit(out.exitCode);
})();
