'use strict';
/*
 * İ13 — H2 ADRES/İLETİŞİM CANLI KABULÜ (tek koşum). MEVCUT tek canlı API'ye bağlanır; API BOOT ETMEZ, env/restart YOK,
 * gönderim YOK (H2 gönderim yolu içermez).
 *
 * Sıra:
 *   0) kapılar (I13_LIVE_CONFIRM + GO ref biçimi + runId + beklenen DB/slug/API) — ihlalde YAZMA YOK
 *   1) izolasyon parmak izi ÖNCE (sentetik tenant'lar hariç)          — salt-okuma
 *   2) KURULUM = İLK YAZMA: İ3 `setupI3` (ah-<runId> + ah-<runId>-x) → makbuz (sırsız)
 *   3) oturumlar (viewer · user · elev1 — 3 login; hız sınırı 10/dk) + ölçüm geçerliliği I13-00
 *   4) runH2 (İ3 düzeneği, İ2 ölçütleri H2-01…H2-10) — ürün yolundan HTTP + salt-okuma DB
 *   5) finally: NİHAİ ERİŞİM KAPANIŞI (kimlik bağı → kullanıcı pasif + tokenVersion++ · Case CLOSED)
 *   6) kapanış kanıtı: login 401 · eski token /auth/me 401 · izolasyon parmak izi SONRA = ÖNCE
 * Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN var · 1 DURDU · 5 kapanış doğrulanmadı.
 * Env: I13_LIVE_CONFIRM · I13_LIVE_GO_REF · I13_RUNID · I13_EXPECT_DB · I13_EXPECT_TENANT_SLUG · I13_API_BASE ·
 *      I13_EXPECT_API · I13_LIVE_LOGIN_PW · I13_RECEIPT · I13_EVID_FILE · AH_DATABASE_URL · AH_PRISMA_ROOT · AH_BCRYPT_PATH
 */
const fs = require('fs');
const { L, liveGates, isolationFingerprint, closeAccess } = require('./i13-lib');

(async () => {
  const g = liveGates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const runId = g.runId; const base = process.env.I13_API_BASE; const pw = process.env.I13_LIVE_LOGIN_PW;
  const receiptPath = process.env.I13_RECEIPT; const evid = process.env.I13_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: I13_LIVE_LOGIN_PW + I13_RECEIPT + I13_EVID_FILE gerekli.'); process.exit(2); }

  const R = new L.Results();
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'I13-LIVE-RUN', runId, apiBase: base };
  let receipt = null; let tokens = {}; let fatal = null;
  try {
    // 1) izolasyon ÖNCE
    out.isolationBefore = await isolationFingerprint(prisma, []);
    // 2) KURULUM (ilk yazma)
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10)); st.runId = runId;
    receipt = { record: 'I13-SETUP-RECEIPT', runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId,
      clientId: st.clientId, foreignClientId: st.foreignClientId, caseId: st.caseId, createdAt: new Date().toISOString() };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 1), 'utf8');
    out.setup = { tenantSlug: st.slug, foreignSlug: st.foreignSlug };
    // 3) oturumlar — yalnız H2'nin kullandığı üç aktör
    for (const tag of ['viewer', 'user', 'elev1']) {
      const r = await L.AH.login(base, st.actors[tag].email, pw, st.slug);
      if (!r.ok) throw new Error(`${tag} oturum açamadı (HTTP ${r.status ?? 'belirsiz'})`);
      tokens[tag] = r.token;
    }
    const sameRole = st.actors.user.role === st.actors.elev1.role && st.actors.user.role !== 'ADMIN';
    R.check('I13-00', 'ÖLÇÜM GEÇERLİ: user ile elev1 AYNI rolde, fark YALNIZ PARTNER bağı (ADMIN yolu kapalı)', sameRole,
      `viewer:${st.actors.viewer.role} user:${st.actors.user.role} elev1:${st.actors.elev1.role}`);
    // 4) H2-01…H2-10
    await require(require('path').join(require('./i13-lib').I3, 'i3-h2-address'))({ base, prisma, tokens, st, R });
  } catch (e) { fatal = e && e.message ? e.message : String(e); console.error(`\nÖLÇÜM DURDU: ${fatal}`); }
  finally {
    // 5) NİHAİ ERİŞİM KAPANIŞI — makbuz yoksa runId'den türetilen slug ile aranır (tahmin YOK)
    try {
      if (!receipt) {
        const t = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}` }, select: { id: true } });
        const f = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}-x` }, select: { id: true } });
        if (t) receipt = { record: 'I13-SETUP-RECEIPT', runId, tenantId: t.id, tenantSlug: `${L.AH.TENANT_PREFIX}${runId}`, foreignTenantId: f ? f.id : null };
      }
      out.closure = receipt ? await closeAccess(prisma, receipt) : { ok: true, nothingToClose: true, wroteNothing: true };
    } catch (e) { out.closure = { ok: false, error: e && e.message ? e.message : String(e) }; }
    // 6) kapanış kanıtı (yalnız kurulum olduysa)
    if (receipt && receipt.tenantSlug) {
      try {
        const em = `elev1-${runId}@ah-harness.invalid`;             // setupI3 aktör e-postası (tag-runId@ah-harness.invalid)
        const lg = em ? await L.AH.login(base, em, pw, receipt.tenantSlug) : { status: null };
        out.closureLogin = lg.status; out.closureMe = null;
        if (tokens.elev1) { const r = await L.AH.httpJson('GET', `${base}/auth/me`, { token: tokens.elev1 }); out.closureMe = r.status; }
      } catch (e) { out.closureProbeError = String(e && e.message || e).slice(0, 160); }
      const closeObs = `closure.ok=${out.closure && out.closure.ok} login=${out.closureLogin} me=${out.closureMe}`;
      if (!(out.closure && out.closure.ok)) R.check('I13-CLOSE', 'nihai kapanış (DB)', false, closeObs);
      // HTTP yoklaması belirsizse (API'ye ulaşılamadı) kapanış DB'de doğrulanmış olsa bile PASS SAYILMAZ → ÖLÇÜLEMEYEN
      else if (typeof out.closureLogin !== 'number' || (tokens.elev1 && typeof out.closureMe !== 'number')) R.unmeasured('I13-CLOSE', 'nihai kapanış HTTP kanıtı', `yoklama belirsiz · ${closeObs}`);
      else R.check('I13-CLOSE', 'nihai kapanış: kullanıcılar pasif + Case CLOSED · login 401 · eski token 401',
        out.closureLogin === 401 && (out.closureMe === 401 || !tokens.elev1), closeObs);
      try {
        out.isolationAfter = await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]);
        const b = out.isolationBefore;
        R.check('I13-ISO', 'izolasyon: sentetik OLMAYAN tenant\'ların client/user dağılımı DEĞİŞMEDİ', !!b && b.digest === out.isolationAfter.digest,
          `önce=${b ? b.digest : '?'}/${b ? b.tenants : '?'} sonra=${out.isolationAfter.digest}/${out.isolationAfter.tenants}`);
      } catch (e) { R.unmeasured('I13-ISO', 'izolasyon', `okunamadı: ${String(e.message || e).slice(0, 120)}`); }
    }
    const s = R.summary(`İ13 CANLI H2 (runId=${runId})`);
    out.fatal = fatal; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
    fs.writeFileSync(evid, JSON.stringify(out, null, 1), 'utf8');
    await prisma.$disconnect().catch(() => {});
    process.exitCode = !(out.closure && out.closure.ok) ? 5 : fatal ? 1 : s.fail > 0 ? 2 : s.unmeasured > 0 ? 3 : 0;
  }
})();
