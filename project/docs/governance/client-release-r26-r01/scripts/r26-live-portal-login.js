'use strict';
/*
 * R26 — BAŞARILI PORTAL GİRİŞİ (yayın sonrası dar canlı kabulün ZORUNLU adımı). API'nin 401 vermesi bunun yerine GEÇMEZ.
 * Kalıp: İ16 (i16-live-run.js) — mevcut tek canlı API; boot/env/restart YOK.
 *
 * YAPAR: sentetik tenant/müvekkil/personel (setupI3 = İLK YAZMA) → elev1 ile sentetik müvekkile portal hesabı → GERÇEK
 *        TARAYICIDA portal girişi iki adresten (localhost:3002 ve makine adı:3002; aynı origin /api) → dosya listesi 200 →
 *        finally: personel + PORTAL erişim kapanışı + Case CLOSED + kapanış yoklaması (giriş 401) + izolasyon parmak izi.
 * YAPMAZ: belge yükleme · forgot-password · e-posta · gerçek müvekkil verisi · .env/görev/firewall · ikinci API.
 * Tarayıcı katmanı: her GET serbest; POST yalnız `/api/portal/login` ve yalnız BU sentetik e-postayla. Diğer her istek
 *        ENGELLENİR ve SAYILIR; engellenen > 0 ise ölçüm GEÇERSİZ (ÖLÇÜLEMEYEN).
 * Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 5 KAPANIŞ DOĞRULANMADI · 2/3/4 kapı reddi (koşum başlamadan).
 */
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { L, isolationFingerprint, closeAccess } = I13;
const { chromium } = require('D:/Development/HUKUK_YAZILIMI/HY_WT_R26/project/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

function gates(env) {
  if (env.R26_LIVE_CONFIRM !== '1') return { code: 3, why: 'R26_LIVE_CONFIRM=1 gerekli' };
  if (!(env.R26_LIVE_GO_REF && /^OWNER-GO-CLIENT-R26-\d{8}-R\d{2}$/.test(env.R26_LIVE_GO_REF.trim()))) return { code: 3, why: 'R26_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-R26-YYYYMMDD-RNN) gerekli' };
  const runId = String(env.R26_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'R26_RUNID 8 hex olmalı' };
  if (!env.R26_EXPECT_DB || env.R26_EXPECT_DB !== I13.dbName(env.AH_DATABASE_URL || '')) return { code: 4, why: 'beklenen DB bağlı DB ile eşleşmiyor' };
  if (env.R26_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId\'den türetilen ile eşleşmiyor' };
  if (!env.R26_API_BASE || env.R26_API_BASE !== env.R26_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  return { code: 0, runId };
}
const H = (m, u, o) => L.AH.httpJson(m, u, o || {});

(async () => {
  const g = gates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const runId = g.runId; const base = process.env.R26_API_BASE; const pw = process.env.R26_LIVE_LOGIN_PW;
  const receiptPath = process.env.R26_RECEIPT; const evid = process.env.R26_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: R26_LIVE_LOGIN_PW + R26_RECEIPT + R26_EVID_FILE gerekli.'); process.exit(2); }
  const webBases = (process.env.R26_WEB_BASES || `http://localhost:3002,http://${os.hostname().toLowerCase()}:3002`).split(',').map((s) => s.trim()).filter(Boolean);
  // Yalnız yayın ÖNCESİ disposable provada: bu porta giden tarayıcı istekleri kesilir (canlı API'ye sızma önlenir).
  const provaBlockPort = process.env.R26_PROVA_BLOCK_PORT || '';
  const portalPw = 'P26!' + crypto.randomBytes(15).toString('base64url');
  const portalEmail = `portal-r26-${runId}@ah-harness.invalid`;
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'R26-LIVE-PORTAL-LOGIN', runId, apiBase: base, webBases };
  let receipt = null; let fatal = null; let elevTok = null;
  const blocked = []; const provaCut = [];
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10)); st.runId = runId;
    receipt = { record: 'R26-SETUP-RECEIPT', runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId,
      clientId: st.clientId, caseId: st.caseId, createdAt: new Date().toISOString() };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 1), 'utf8');
    const lg = await L.AH.login(base, st.actors.elev1.email, pw, st.slug);
    if (!lg.ok) throw new Error(`elev1 oturum açamadı (HTTP ${lg.status ?? '?'})`);
    elevTok = lg.token;
    const cu = await H('POST', `${base}/portal/admin/create-user`, { token: elevTok, body: { clientId: st.clientId, email: portalEmail, password: portalPw } });
    R.check('PL-0', 'sentetik müvekkile portal hesabı açıldı (yetkili personel, mevcut uç)', cu.status >= 200 && cu.status < 300, `create-user → ${cu.status}`);

    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    try {
      let n = 0;
      for (const wb of webBases) {
        n++;
        const ctx = await browser.newContext();
        await ctx.route('**/*', (route) => {
          const r = route.request(); const u = new URL(r.url());
          if (provaBlockPort && u.port === provaBlockPort) { provaCut.push(`${r.method()} ${u.host}${u.pathname}`); return route.abort(); }
          if (r.method() === 'GET') return route.continue();
          if (r.method() === 'POST' && u.pathname === '/api/portal/login' && (r.postData() || '').includes(portalEmail)) return route.continue();
          blocked.push(`${r.method()} ${r.url()}`); return route.abort();
        });
        const pg = await ctx.newPage();
        const seen = [];
        pg.on('response', (r) => { const u = new URL(r.url()); if (u.pathname === '/api/portal/login' || u.pathname === '/api/portal/cases') seen.push({ p: u.pathname, s: r.status(), h: u.host }); });
        await pg.goto(`${wb}/portal/login`);
        await pg.waitForSelector('input[type="email"]', { timeout: 30000 });
        await pg.fill('input[type="email"]', portalEmail);
        await pg.fill('input[type="password"]', portalPw);
        await pg.click('button[type="submit"]');
        await pg.waitForURL((u) => !String(u).includes('/portal/login'), { timeout: 30000 }).catch(() => {});
        const tokenSet = !!(await pg.evaluate(() => localStorage.getItem('portal_token')));
        const afterLogin = new URL(pg.url()).pathname;
        await pg.goto(`${wb}/portal/cases`);
        await pg.waitForTimeout(4000);
        const host = new URL(wb).host;
        const login = seen.filter((x) => x.p === '/api/portal/login').pop();
        const cases = seen.filter((x) => x.p === '/api/portal/cases').pop();
        const ok = login && login.s >= 200 && login.s < 300 && login.h === host && tokenSet && afterLogin !== '/portal/login'
          && cases && cases.s === 200 && cases.h === host && new URL(pg.url()).pathname === '/portal/cases';
        R.check(`PL-${n}`, `BAŞARILI portal girişi gerçek tarayıcıda (${wb}); istekler AYNI ORIGIN; dosya listesi 200`, !!ok,
          `giriş ${login ? login.s + ' @' + login.h : 'YOK'} · token=${tokenSet} · giriş sonrası=${afterLogin} · /api/portal/cases ${cases ? cases.s + ' @' + cases.h : 'YOK'} · son sayfa=${new URL(pg.url()).pathname}`);
        await ctx.close();
      }
    } finally { await browser.close(); }
    if (blocked.length) R.unmeasured('PL-GUARD', 'tarayıcı yalnız izinli istekleri yaptı', `engellenen ${blocked.length}: ${blocked.slice(0, 3).join(' | ')}`);
    else R.check('PL-GUARD', 'tarayıcı yalnız izinli istekleri yaptı (GET + bu hesabın girişi)', true, 'engellenen 0');
  } catch (e) { fatal = e && e.message ? e.message : String(e); console.error(`\nÖLÇÜM DURDU: ${fatal}`); }
  finally {
    // NİHAİ KAPANIŞ (İ16 ile aynı): personel (closeAccess: kullanıcı pasif + tokenVersion++ + Case CLOSED) + PORTAL (bu
    // tenant'ların portal kullanıcıları pasif + tokenVersion++ + hasPortalAccess=false). Kimlik bağı yoksa SIFIR yazma.
    try {
      if (!receipt) {
        const t = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}` }, select: { id: true } });
        const f = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}-x` }, select: { id: true } });
        if (t) receipt = { record: 'R26-SETUP-RECEIPT', runId, tenantId: t.id, tenantSlug: `${L.AH.TENANT_PREFIX}${runId}`, foreignTenantId: f ? f.id : null };
      }
      out.closure = receipt ? await closeAccess(prisma, receipt) : { ok: true, nothingToClose: true, wroteNothing: true };
      if (receipt && out.closure.ok) {
        const tids = [receipt.tenantId, receipt.foreignTenantId].filter(Boolean);
        const clients = (await prisma.client.findMany({ where: { tenantId: { in: tids } }, select: { id: true } })).map((c) => c.id);
        await prisma.clientPortalUser.updateMany({ where: { clientId: { in: clients } }, data: { isActive: false, tokenVersion: { increment: 1 } } });
        await prisma.client.updateMany({ where: { id: { in: clients } }, data: { hasPortalAccess: false } });
        out.closure.portalActive = await prisma.clientPortalUser.count({ where: { clientId: { in: clients }, isActive: true } });
        out.closure.ok = out.closure.portalActive === 0;
      }
    } catch (e) { out.closure = { ok: false, error: e && e.message ? e.message : String(e) }; }
    if (receipt && receipt.tenantSlug) {
      try {
        const lg = await L.AH.login(base, `elev1-${runId}@ah-harness.invalid`, pw, receipt.tenantSlug);
        const me = elevTok ? await H('GET', `${base}/auth/me`, { token: elevTok }) : { status: null };
        const pl = await H('POST', `${base}/portal/login`, { body: { email: portalEmail, password: portalPw } });
        out.closureLogin = lg.status; out.closureMe = me.status; out.closurePortalLogin = pl.status;
      } catch (e) { out.closureProbeError = String(e && e.message || e).slice(0, 160); }
      const obs = `closure.ok=${out.closure && out.closure.ok} staffLogin=${out.closureLogin} me=${out.closureMe} portalLogin=${out.closurePortalLogin}`;
      if (!(out.closure && out.closure.ok)) R.check('PL-CLOSE', 'nihai kapanış (DB)', false, obs);
      else if ([out.closureLogin, out.closurePortalLogin].some((s) => typeof s !== 'number') || (elevTok && typeof out.closureMe !== 'number')) R.unmeasured('PL-CLOSE', 'nihai kapanış HTTP kanıtı', `yoklama belirsiz · ${obs}`);
      else R.check('PL-CLOSE', 'nihai kapanış: personel + portal kullanıcıları pasif · Case CLOSED · personel login 401 · eski token 401 · portal login 401',
        out.closureLogin === 401 && (!elevTok || out.closureMe === 401) && out.closurePortalLogin === 401, obs);
      try {
        out.isolationAfter = await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]);
        R.check('PL-ISO', 'izolasyon: sentetik OLMAYAN tenant\'ların client/user dağılımı DEĞİŞMEDİ', out.isolationBefore.digest === out.isolationAfter.digest,
          `önce=${out.isolationBefore.digest}/${out.isolationBefore.tenants} sonra=${out.isolationAfter.digest}/${out.isolationAfter.tenants}`);
      } catch (e) { R.unmeasured('PL-ISO', 'izolasyon', String(e.message || e).slice(0, 120)); }
    }
    const s = R.summary(`R26 CANLI PORTAL GİRİŞİ (runId=${runId})`);
    out.fatal = fatal; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.blocked = blocked; out.provaCut = provaCut;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
    fs.writeFileSync(evid, JSON.stringify(out, null, 1), 'utf8');
    await prisma.$disconnect().catch(() => {});
    process.exitCode = !(out.closure && out.closure.ok) ? 5 : fatal ? 1 : s.fail > 0 ? 2 : s.unmeasured > 0 ? 3 : 0;
  }
})();
