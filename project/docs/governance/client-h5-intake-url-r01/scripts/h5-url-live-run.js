'use strict';
/*
 * H5-URL — DAR CANLI KABUL: `PUBLIC_INTAKE_BASE_URL` girildikten sonra intake bağlantısının MUTLAK
 * adres üretmesi ve hedef sayfanın erişilebilir olması.
 *
 * ÖLÇER  : U-00 ölçüm geçerliliği · U-01 mutlak URL biçimi · U-02 URL = <base>/intake/<ham token> ·
 *          U-03 hedef sayfa (web) erişilebilir · U-04 ham token yalnız oluşturma yanıtında (okuma ucunda YOK) ·
 *          U-CLOSE erişim kapanışı · U-ISO gerçek tenant izolasyonu değişmedi.
 * YAPMAZ : gerçek alıcıya gönderim YOK (yalnız BAĞIMSIZ bağlantı üretimi ucu; bildirim akışı çağrılmaz) ·
 *          ürün kodu değişmez · migration yok · ikinci API açılmaz.
 * SIR    : GO ref yalnız biçim olarak doğrulanır, yazdırılmaz. Ham token HİÇBİR çıktıya yazılmaz; yalnız
 *          sha256'sı ve uzunluğu raporlanır. Parola bellekte üretilir.
 * ÇIKIŞ  : 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 5 KAPANIŞ DOĞRULANMADI
 */
const fs = require('fs'); const crypto = require('crypto');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { L, isolationFingerprint, closeAccess, dbName } = I13;

function gates(env) {
  if (env.H5U_LIVE_CONFIRM !== '1') return { code: 3, why: 'H5U_LIVE_CONFIRM=1 gerekli' };
  if (!(env.H5U_LIVE_GO_REF && /^OWNER-GO-CLIENT-H5URL-\d{8}-R\d{2}$/.test(env.H5U_LIVE_GO_REF.trim()))) {
    return { code: 3, why: 'H5U_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-H5URL-YYYYMMDD-RNN) gerekli' };
  }
  const runId = String(env.H5U_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'H5U_RUNID 8 hex olmalı' };
  const bound = dbName(env.AH_DATABASE_URL || '');
  if (!env.H5U_EXPECT_DB || env.H5U_EXPECT_DB !== bound) return { code: 4, why: `beklenen DB '${env.H5U_EXPECT_DB || ''}' != bağlı '${bound || ''}'` };
  if (env.H5U_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId ile eşleşmiyor' };
  if (!env.H5U_API_BASE || env.H5U_API_BASE !== env.H5U_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  if (!env.H5U_EXPECT_BASE_URL) return { code: 4, why: 'H5U_EXPECT_BASE_URL gerekli (owner bloğu .env değerinden verir)' };
  return { code: 0, runId };
}
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').toUpperCase();
async function httpStatus(url) {
  try { const r = await fetch(url, { redirect: 'manual' }); return r.status; } catch (e) { return -1; }
}

(async () => {
  const g = gates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const runId = g.runId; const base = process.env.H5U_API_BASE; const webBase = process.env.H5U_EXPECT_BASE_URL.replace(/\/+$/, '');
  const pw = process.env.H5U_LIVE_LOGIN_PW; const receiptPath = process.env.H5U_RECEIPT; const evid = process.env.H5U_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: H5U_LIVE_LOGIN_PW + H5U_RECEIPT + H5U_EVID_FILE gerekli.'); process.exit(2); }

  const R = new L.Results();
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'H5-URL-LIVE-RUN', runId, apiBase: base, webBase };
  let receipt = null; let fatal = null;
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10)); st.runId = runId;
    receipt = { record: 'H5-URL-SETUP-RECEIPT', runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId,
      clientId: st.clientId, foreignClientId: st.foreignClientId, caseId: st.caseId, createdAt: new Date().toISOString() };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 1), 'utf8');

    const elev = await L.AH.login(base, st.actors.elev1.email, pw, st.slug);
    if (!elev.ok) throw new Error(`elev1 oturum açamadı (HTTP ${elev.status ?? 'belirsiz'})`);
    const sameRole = st.actors.user.role === st.actors.elev1.role && st.actors.user.role !== 'ADMIN';
    R.check('U-00', 'ÖLÇÜM GEÇERLİ: elev1 ADMIN değil, yetki PARTNER bağından gelir', sameRole,
      `user:${st.actors.user.role} elev1:${st.actors.elev1.role}`);

    // BAĞIMSIZ bağlantı üretimi (gönderim YOK)
    const cr = await L.AH.httpJson('POST', `${base}/client-intake-links/case/${st.caseId}`, {
      token: elev.token, body: { clientId: st.clientId, scope: ['ADDRESS'] },
    });
    const d = ((cr && cr.body) && (cr.body.data || cr.body)) || {};
    const url = d.intakeUrl || (d.link && d.link.intakeUrl) || null;
    const raw = d.rawToken || d.token || (d.link && d.link.rawToken) || null;
    const linkId = d.id || (d.link && d.link.id) || null;
    out.create = { status: cr.status, hasUrl: !!url, hasRawToken: !!raw, linkId: linkId ? 'VAR' : 'YOK', rawTokenSha256: raw ? sha(raw) : null, rawTokenLength: raw ? String(raw).length : 0 };
    if (cr.status !== 201 || !url || !raw) {
      R.unmeasured('U-01', 'mutlak URL biçimi', `bağlantı üretilemedi (HTTP ${cr.status})`);
      R.unmeasured('U-02', 'URL = base + /intake/<token>', 'bağlantı yok');
      R.unmeasured('U-03', 'hedef sayfa erişilebilir', 'bağlantı yok');
      R.unmeasured('U-04', 'ham token yalnız oluşturma yanıtında', 'bağlantı yok');
    } else {
      const absolute = /^https?:\/\/[^/]+\//.test(url) && !url.includes('\\');
      R.check('U-01', 'intakeUrl MUTLAK (şema + host) ve ters bölü içermez', absolute,
        `şema+host=${absolute} · host=${absolute ? new URL(url).host : 'YOK'} · uzunluk=${url.length}`);
      const expected = `${webBase}/intake/${raw}`;
      R.check('U-02', 'intakeUrl = <PUBLIC_INTAKE_BASE_URL>/intake/<ham token>', url === expected,
        `eşit=${url === expected} · beklenen ön ek=${webBase}/intake/ · token sha256=${sha(raw).slice(0, 16)}`);
      const pageStatus = await httpStatus(url);
      R.check('U-03a', 'hedef sayfa erişilebilir (web 200)', pageStatus === 200, `web=${pageStatus}`);
      const apiValidate = await httpStatus(`${base}/public/intake/${raw}`);
      if (apiValidate === 503) {
        // Hız sınırı koruyucusu Redis'e ulaşamadığında FAIL-CLOSED 503 döner. Bu, bağlantının geçersiz
        // olduğunu GÖSTERMEZ; ölçüm yapılamamıştır. PASS da FAIL de sayılmaz.
        R.unmeasured('U-03b', 'bağlantı uçta GEÇERLİ (API 200)', 'api/public/intake=503 — hız sınırı fail-closed (Redis ulaşılamıyor); geçerlilik ÖLÇÜLEMEDİ');
      } else {
        R.check('U-03b', 'bağlantı uçta GEÇERLİ (API 200)', apiValidate === 200, `api/public/intake=${apiValidate}`);
      }
      if (!linkId) {
        R.unmeasured('U-04', 'ham token yalnız oluşturma yanıtında', 'link id yanıtta yok');
      } else {
        const rd = await L.AH.httpJson('GET', `${base}/client-intake-links/${linkId}`, { token: elev.token });
        const leaked = JSON.stringify(rd.body || {}).includes(raw);
        R.check('U-04', 'okuma ucunda HAM TOKEN yok', rd.status === 200 && !leaked, `okuma HTTP ${rd.status} · ham token görünüyor=${leaked}`);
      }
    }
  } catch (e) { fatal = String((e && e.message) || e); }
  finally {
    try {
      out.closure = receipt ? await closeAccess(prisma, receipt) : { ok: true, nothingToClose: true, wroteNothing: true };
    } catch (e) { out.closure = { ok: false, reason: String((e && e.message) || e) }; }
    const closeObs = JSON.stringify(out.closure || {});
    if (!(out.closure && out.closure.ok)) R.check('U-CLOSE', 'nihai kapanış (DB)', false, closeObs);
    else R.check('U-CLOSE', 'nihai kapanış: kullanıcılar pasif + Case CLOSED', true, closeObs);
    try {
      const after = receipt ? await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]) : null;
      out.isolationAfter = after;
      const b = out.isolationBefore;
      if (after && b) R.check('U-ISO', 'izolasyon: sentetik OLMAYAN tenant dağılımı DEĞİŞMEDİ', after.digest === b.digest,
        `önce=${b.digest}/${b.tenants} sonra=${after.digest}/${after.tenants}`);
      else R.unmeasured('U-ISO', 'izolasyon', 'ölçülemedi');
    } catch (e) { R.unmeasured('U-ISO', 'izolasyon', `okunamadı: ${String(e.message || e).slice(0, 120)}`); }
    const s = R.summary(`H5-URL DAR CANLI KABUL (runId=${runId})`);
    out.fatal = fatal; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
    fs.writeFileSync(evid, JSON.stringify(out, null, 1), 'utf8');
    await prisma.$disconnect().catch(() => {});
    process.exitCode = !(out.closure && out.closure.ok) ? 5 : fatal ? 1 : s.fail > 0 ? 2 : s.unmeasured > 0 ? 3 : 0;
  }
})();
