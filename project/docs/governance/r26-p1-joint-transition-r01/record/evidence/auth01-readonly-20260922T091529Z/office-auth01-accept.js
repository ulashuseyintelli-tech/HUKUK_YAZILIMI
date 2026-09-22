'use strict';
/*
 * OFFICE-AUTH-01 DAR SALT-OKUMA CANLI KABUL (owner GO 2026-09-22). CANLI DB'YE YAZMAZ, FORM GONDERMEZ.
 *
 * Temiz (kalici profil YOK, cerez/depolama BOS) basiz Edge baglami. Tarayici katmaninda YALNIZ GET gecer;
 * GET disi her istek ENGELLENIR ve SAYILIR (engellenen > 0 => kabul GECERSIZ).
 * Gercek token KULLANILMAZ: sentetik isaretleyici. Parola alani doldurulmaz, gonder dugmesine basilmaz.
 *
 * Olcutler (DK-6'nin olcmediklerini tamamlar; DK-6'daki "sayfa girissiz acilir" yeniden kabul DEGIL):
 *  A1 /dashboard girissiz -> /auth/login; korumali icerik (sidebar/header/main) ve veri API'si 2xx YOK
 *  A2 reset-password#token=<isaretleyici>: token form durumuna ALINIR (React hook durumu == isaretleyici),
 *     "token bulunamadi" iletisi YOK, gonder dugmesi ETKIN; hash'in URL'den silinmesi bilincli (kayip degil)
 *  A2c kontrol: token'siz reset-password -> "token bulunamadi" iletisi VAR, dugme DEVRE DISI
 *  A3 accept-invite?token=<isaretleyici>: token URL'de korunur, gonder dugmesi ETKIN, hata iletisi YOK
 *  A3c kontrol: token'siz accept-invite -> dugme DEVRE DISI
 *  B  sunulan BUILD_ID (tarayicinin yukledigi /_next/static/<id>/ yolu) = beklenen canli BUILD_ID
 *
 * Kullanim: node office-auth01-accept.js <cikti.json>
 */
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('D:/Development/HUKUK_YAZILIMI/project/project/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const OUT = process.argv[2];
if (!OUT) { console.error('kullanim: node office-auth01-accept.js <cikti.json>'); process.exit(2); }
const BASE = 'http://localhost:3002';
const EXP_BUILD_ID = '5waeMoFGGMTLAYmn9oJvW';
const RUN = crypto.randomBytes(4).toString('hex');
const MARK = `OFFICE-AUTH01-SENTETIK-${RUN}`; // gercek token DEGIL

// Sayfa acilmadan once enjekte edilir: /dashboard yolundayken korumali kabuk ogeleri HIC olustu mu?
const OBSERVER = `(() => {
  const s = { seenMain: false, seenAside: false, seenHeader: false, seenNav: false, maxTextLen: 0, samples: [] };
  window.__authObs = s;
  const tick = () => {
    if (!location.pathname.startsWith('/dashboard')) return;
    if (document.querySelector('main')) s.seenMain = true;
    if (document.querySelector('aside')) s.seenAside = true;
    if (document.querySelector('header')) s.seenHeader = true;
    if (document.querySelector('nav')) s.seenNav = true;
    const t = (document.body && document.body.innerText || '').trim();
    if (t.length > s.maxTextLen) { s.maxTextLen = t.length; s.samples.push(t.slice(0, 120)); }
  };
  new MutationObserver(tick).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', tick);
})();`;

// React fiber'inda isaretleyiciyi tasiyan hook durumu var mi (salt okuma inceleme; durum DEGISTIRILMEZ).
async function fiberHasMarker(pg, mark) {
  return pg.evaluate((m) => {
    const form = document.querySelector('form');
    if (!form) return { form: false, found: false, where: null };
    const key = Object.keys(form).find((k) => k.startsWith('__reactFiber$'));
    if (!key) return { form: true, found: false, where: 'fiber-anahtari-yok' };
    let f = form[key]; let depth = 0;
    while (f && depth < 80) {
      let h = f.memoizedState; let i = 0;
      while (h && typeof h === 'object' && i < 60) {
        const v = h.memoizedState;
        if (v === m) return { form: true, found: true, where: `useState depth=${depth} hook=${i}` };
        try { if (v && typeof v.get === 'function' && v.get('token') === m) return { form: true, found: true, where: `searchParams depth=${depth} hook=${i}` }; } catch (e) { /* yok say */ }
        h = h.next; i++;
      }
      f = f.return; depth++;
    }
    return { form: true, found: false, where: null };
  }, mark);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const ctx = await browser.newContext();
  const startCookies = (await ctx.cookies()).length;
  await ctx.addInitScript(OBSERVER);
  const blocked = []; const apiCalls = []; const buildIds = new Set();
  await ctx.route('**/*', (route) => {
    const r = route.request(); const u = new URL(r.url());
    const bm = u.pathname.match(/^\/_next\/static\/([^/]+)\/_(buildManifest|ssgManifest)\.js$/);
    if (bm) buildIds.add(bm[1]);
    if (r.method() === 'GET') return route.continue();
    blocked.push(`${r.method()} ${u.host}${u.pathname}`);
    return route.abort();
  });
  ctx.on('response', (res) => { const u = new URL(res.url()); if (u.pathname.startsWith('/api/')) apiCalls.push(`${res.request().method()} ${res.status()} ${u.host}${u.pathname}`); });

  const rows = [];
  const add = (id, ok, obs) => { rows.push({ id, verdict: ok ? 'PASS' : 'FAIL', obs }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} · ${JSON.stringify(obs)}`); };

  // ---- A1 /dashboard girissiz
  {
    const pg = await ctx.newPage();
    const nav = []; const apiHere = [];
    pg.on('framenavigated', (fr) => { if (fr === pg.mainFrame()) nav.push(new URL(fr.url()).pathname); });
    pg.on('response', (res) => { const u = new URL(res.url()); if (u.pathname.startsWith('/api/')) apiHere.push({ m: res.request().method(), s: res.status(), p: u.pathname }); });
    const doc = await pg.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    const docStatus = doc ? doc.status() : null;
    const html = doc ? await doc.text().catch(() => '') : '';
    await pg.waitForURL((u) => new URL(u).pathname.startsWith('/auth/login'), { timeout: 20000 }).catch(() => {});
    await pg.waitForTimeout(2500);
    const final = new URL(pg.url()).pathname;
    const obs = await pg.evaluate(() => window.__authObs || null);
    const storage = await pg.evaluate(() => ({ lsKeys: Object.keys(localStorage), ssKeys: Object.keys(sessionStorage),
      authToken: (sessionStorage.getItem('token') ?? localStorage.getItem('token')) !== null }));
    const loginForm = await pg.evaluate(() => !!document.querySelector('input[type="email"]') && !!document.querySelector('input[type="password"]'));
    const data2xx = apiHere.filter((a) => a.s >= 200 && a.s < 300 && !a.p.startsWith('/api/auth/'));
    const htmlShell = /<main[\s>]|<aside[\s>]/i.test(html);
    const ok = final === '/auth/login' && nav.includes('/dashboard') && obs && !obs.seenMain && !obs.seenAside && !obs.seenHeader
      && data2xx.length === 0 && loginForm && !htmlShell && startCookies === 0 && storage.authToken === false;
    add('A1', ok, { baslangicCerez: startCookies, depolama: storage, belgeDurumu: docStatus, sunucuHtmlKabukMainAside: htmlShell,
      gezinme: nav, sonYol: final, loginFormu: loginForm, dashboardYolundaGozlem: obs, apiIstekleri: apiHere, veriApi2xx: data2xx.length });
    await pg.close();
  }

  // ---- A2 / A2c reset-password
  async function reset(id, url, expectToken) {
    const pg = await ctx.newPage();
    const nav = [];
    pg.on('framenavigated', (fr) => { if (fr === pg.mainFrame()) nav.push(new URL(fr.url()).pathname); });
    await pg.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await pg.waitForSelector('form button[type="submit"]', { timeout: 20000 });
    await pg.waitForTimeout(2500);
    const st = await pg.evaluate(() => {
      const b = document.querySelector('form button[type="submit"]');
      const t = document.body.innerText;
      return { path: location.pathname, hash: location.hash, search: location.search, buttonDisabled: b ? b.disabled : null,
        noTokenMsg: t.includes('token bulunamad'), invalidMsg: t.includes('geçersiz veya süresi dolmuş'), pwInputs: document.querySelectorAll('input[type="password"]').length };
    });
    const fib = expectToken ? await fiberHasMarker(pg, MARK) : null;
    const toLogin = nav.some((p) => p.startsWith('/auth/login'));
    const ok = expectToken
      ? (st.path === '/auth/reset-password' && !toLogin && st.buttonDisabled === false && !st.noTokenMsg && !st.invalidMsg && fib && fib.found && st.hash === '')
      : (st.path === '/auth/reset-password' && !toLogin && st.buttonDisabled === true && st.noTokenMsg);
    add(id, ok, { url: url.replace(MARK, '<ISARETLEYICI>'), gezinme: nav, loginYonlendi: toLogin, durum: st, formDurumundaToken: fib,
      not: expectToken ? 'hash URL\'den bilincli silinir (history.replaceState); token form durumunda tutulur' : 'kontrol: token yok' });
    await pg.close();
  }
  await reset('A2', `/auth/reset-password#token=${MARK}`, true);
  await reset('A2c', '/auth/reset-password', false);

  // ---- A3 / A3c accept-invite
  async function invite(id, url, expectToken) {
    const pg = await ctx.newPage();
    const nav = [];
    pg.on('framenavigated', (fr) => { if (fr === pg.mainFrame()) nav.push(new URL(fr.url()).pathname); });
    await pg.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await pg.waitForSelector('form button[type="submit"]', { timeout: 20000 });
    await pg.waitForTimeout(2500);
    const st = await pg.evaluate(() => {
      const b = document.querySelector('form button[type="submit"]');
      const t = document.body.innerText;
      return { path: location.pathname, tokenInUrl: new URLSearchParams(location.search).get('token'), buttonDisabled: b ? b.disabled : null,
        errorShown: !!document.querySelector('p.text-red-600'), pwInputs: document.querySelectorAll('input[type="password"]').length, textHead: t.slice(0, 80) };
    });
    const fib = expectToken ? await fiberHasMarker(pg, MARK) : null;
    const toLogin = nav.some((p) => p.startsWith('/auth/login'));
    const ok = expectToken
      ? (st.path === '/auth/accept-invite' && !toLogin && st.tokenInUrl === MARK && st.buttonDisabled === false && !st.errorShown)
      : (st.path === '/auth/accept-invite' && !toLogin && st.buttonDisabled === true);
    st.tokenInUrl = st.tokenInUrl === MARK ? '<ISARETLEYICI>' : st.tokenInUrl;
    add(id, ok, { url: url.replace(MARK, '<ISARETLEYICI>'), gezinme: nav, loginYonlendi: toLogin, durum: st, formDurumundaToken: fib,
      not: expectToken ? 'token useSearchParams ile okunur; dugme yalniz token varken etkin (kaynak: disabled={isLoading || !token})' : 'kontrol: token yok' });
    await pg.close();
  }
  await invite('A3', `/auth/accept-invite?token=${MARK}`, true);
  await invite('A3c', '/auth/accept-invite', false);

  const ids = [...buildIds];
  add('B', ids.length === 1 && ids[0] === EXP_BUILD_ID, { sunulanBuildId: ids, beklenen: EXP_BUILD_ID });

  await browser.close();
  const fails = rows.filter((r) => r.verdict === 'FAIL').length;
  const valid = blocked.length === 0;
  const out = { record: 'OFFICE-AUTH01-READONLY-LIVE-ACCEPT', runId: RUN, tsUtc: new Date().toISOString(), base: BASE,
    browser: 'msedge headless, kalici profil yok', markerNote: 'sentetik isaretleyici; gercek token degil; ciktida maskeli',
    rows, apiCalls, blockedNonGet: blocked.length, blocked, valid,
    sonuc: !valid ? 'GECERSIZ (engellenen istek var)' : fails === 0 ? 'PASS' : `PASS-OLMAYAN ${fails}` };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('ENGELLENEN (GET disi):', blocked.length, blocked.slice(0, 5));
  console.log('SONUC', out.sonuc);
  if (out.sonuc !== 'PASS') process.exitCode = 1;
})().catch((e) => { console.error('HATA', e.message); process.exitCode = 1; });
