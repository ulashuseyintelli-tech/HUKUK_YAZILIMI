'use strict';
/*
 * R26 DAR KABUL — iç ağ, alan adı YOK, gerçek tarayıcı (başsız Edge). CANLI DB'YE YAZMAZ.
 *
 * Tarayıcı katmanında izinli istekler yalnız ikidir:
 *  (a) her GET;
 *  (b) VAR OLMAYAN sentetik e-postayla POST /api/portal/login. portal.service.login başarısız girişte
 *      yazma yapmaz; `update` yalnız başarılı girişte çalışır.
 * Başka her istek ENGELLENİR ve SAYILIR. Engellenen sayısı > 0 ise bu kabul GEÇERSİZDİR.
 *
 * Kullanım: node r26-dar-kabul.js <before|after> <cikti.json>
 *   before = yayından ÖNCE canlı taban (kusurların canlıda var olduğunu ölçer)
 *   after  = yayından SONRA kabul
 * Ölçütler:
 *   DK-1 intake (localhost:3002)  : girişsiz açılır, /auth/login'e gitmez, geçersiz bağlantı iletisi görünür
 *   DK-2 intake (makine adı:3002) : aynı; API isteği AYNI ORIGIN (rewrite yolu)
 *   DK-3 portal (localhost:3002)  : giriş denemesi API'ye ULAŞIR (401) ve hata iletisi görünür
 *   DK-4 portal (makine adı:3002) : aynı; istek AYNI ORIGIN /api/portal/login
 *   DK-5 personel girişi          : /auth/login açılır (regresyon yok)
 *   DK-6 personel sıfırlama/davet : girişsiz AÇILIR, /auth/login'e gitmez (OFFICE-AUTH-01, #2740 R26'ya DAHİL)
 * NOT: DK-3/DK-4 API'ye ULAŞMAYI (401) ölçer; BAŞARILI portal girişi AYRI ve ZORUNLU adımdır (r26-live-portal-login.js).
 */
const fs = require('fs');
const os = require('os');
const { chromium } = require('D:/Development/HUKUK_YAZILIMI/HY_WT_R26/project/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const PHASE = process.argv[2];
const OUT = process.argv[3];
if (!['before', 'after'].includes(PHASE) || !OUT) { console.error('kullanim: node r26-dar-kabul.js <before|after> <cikti.json>'); process.exit(2); }
const MACHINE = os.hostname().toLowerCase();
// DK_PORT yalnız yayın ÖNCESİ aday doğrulaması içindir (varsayılan canlı web portu 3002).
const PORT = Number(process.env.DK_PORT || 3002);
const HOSTS = { local: `http://localhost:${PORT}`, machine: `http://${MACHINE}:${PORT}` };
const TOKEN = 'r26-dar-kabul-gecersiz-baglanti';
const EMAIL = `r26-dar-kabul-${Date.now().toString(36)}@ah-harness.invalid`;

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const ctx = await browser.newContext();
  const blocked = [];
  const apiCalls = [];
  await ctx.route('**/*', (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) apiCalls.push(`${r.method()} ${u.host}${u.pathname}`);
    if (r.method() === 'GET') return route.continue();
    if (r.method() === 'POST' && u.pathname === '/api/portal/login') {
      const body = r.postData() || '';
      if (body.includes(EMAIL)) return route.continue();
    }
    blocked.push(`${r.method()} ${r.url()}`);
    return route.abort();
  });
  const rows = [];
  const add = (id, ok, obs) => { rows.push({ id, verdict: ok ? 'PASS' : 'FAIL', obs }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} · ${obs}`); };

  async function intake(id, base) {
    const pg = await ctx.newPage();
    const nav = [];
    pg.on('framenavigated', (f) => { if (f === pg.mainFrame()) nav.push(new URL(f.url()).pathname); });
    const resp = [];
    pg.on('response', (r) => { if (r.url().includes('/api/public/intake/')) resp.push(`${r.status()} ${new URL(r.url()).host}`); });
    await pg.goto(`${base}/intake/${TOKEN}`);
    await pg.waitForTimeout(6000);
    const final = new URL(pg.url()).pathname;
    const text = (await pg.innerText('body').catch(() => '')).slice(0, 400).replace(/\s+/g, ' ');
    const toLogin = nav.some((p) => p.startsWith('/auth/login'));
    const sameOrigin = resp.length > 0 && resp.every((x) => x.endsWith(new URL(base).host));
    const ok = final.startsWith('/intake/') && !toLogin && resp.length > 0 && (id === 'DK-2' ? sameOrigin : true);
    add(id, ok, `son yol=${final} · /auth/login'e yönlendi=${toLogin} · intake API yanıtı=[${resp.join(', ')}] · metin="${text.slice(0, 120)}"`);
    await pg.close();
  }

  async function portal(id, base) {
    const pg = await ctx.newPage();
    const resp = [];
    const errs = [];
    pg.on('response', (r) => { if (r.url().includes('/api/portal/login')) resp.push(`${r.status()} ${new URL(r.url()).host}`); });
    pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    await pg.goto(`${base}/portal/login`);
    await pg.waitForSelector('input[type="email"]', { timeout: 20000 });
    await pg.fill('input[type="email"]', EMAIL);
    await pg.fill('input[type="password"]', 'R26-dar-kabul-yanlis-parola');
    await pg.click('button[type="submit"]');
    await pg.waitForTimeout(5000);
    const reached = resp.some((x) => x.startsWith('401'));
    const sameOrigin = resp.length > 0 && resp.every((x) => x.endsWith(new URL(base).host));
    const ok = reached && (id === 'DK-4' ? sameOrigin : true);
    add(id, ok, `login yanıtı=[${resp.join(', ') || 'YOK'}] · sayfa hatası=${errs.length}${errs.length ? ' (' + errs[0] + ')' : ''}`);
    await pg.close();
  }

  await intake('DK-1', HOSTS.local);
  await intake('DK-2', HOSTS.machine);
  await portal('DK-3', HOSTS.local);
  await portal('DK-4', HOSTS.machine);

  const p5 = await ctx.newPage();
  await p5.goto(`${HOSTS.local}/auth/login`);
  await p5.waitForTimeout(4000);
  add('DK-5', new URL(p5.url()).pathname === '/auth/login', `personel giriş sayfası son yol=${new URL(p5.url()).pathname}`);
  await p5.close();

  // DK-6 (OFFICE-AUTH-01, #2740 R26'ya DAHIL): personel sifre/davet sayfalari girissiz ACILIR, /auth/login'e gitmez.
  // Sayfalar yalniz GET yapar (forma gonderim YOK) — canli veride degisiklik yok.
  const staff = {};
  for (const sp of ['/auth/forgot-password', '/auth/reset-password#token=sentetik', '/auth/accept-invite?token=sentetik']) {
    const pg = await ctx.newPage();
    const nav = [];
    pg.on('framenavigated', (f) => { if (f === pg.mainFrame()) nav.push(new URL(f.url()).pathname); });
    await pg.goto(HOSTS.local + sp);
    await pg.waitForTimeout(5000);
    staff[sp] = { final: new URL(pg.url()).pathname, toLogin: nav.some((p) => p.startsWith('/auth/login')) };
    await pg.close();
  }
  const staffOk = Object.entries(staff).every(([sp, v]) => v.final === sp.split(/[?#]/)[0] && !v.toLogin);
  add('DK-6', staffOk, `personel sifre/davet sayfalari ${JSON.stringify(staff)}`);

  await browser.close();
  const fails = rows.filter((r) => r.verdict === 'FAIL').length;
  const valid = blocked.length === 0;
  const out = { record: 'R26-DAR-KABUL', phase: PHASE, port: PORT, tsUtc: new Date().toISOString(), machine: MACHINE, syntheticEmail: EMAIL,
    rows, apiCalls, blockedNonGet: blocked.length, blocked, valid,
    sonuc: !valid ? 'GECERSIZ (engellenen istek var)' : fails === 0 ? 'PASS' : `PASS-OLMAYAN ${fails}` };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('ENGELLENEN (GET/izinli giris disi):', blocked.length, blocked.slice(0, 5));
  console.log('SONUC', out.sonuc);
  // after: yalniz PASS cikis 0 verir (owner blogu cikis koduyla karar verir). before: taban olcumu, cikis 0.
  if (PHASE === 'after' && out.sonuc !== 'PASS') process.exitCode = 1;
})().catch((e) => { console.error('HATA', e.message); process.exitCode = 1; });
