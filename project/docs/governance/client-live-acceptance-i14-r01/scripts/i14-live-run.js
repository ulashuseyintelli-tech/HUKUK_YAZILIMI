'use strict';
/*
 * İ14 — H4 TALİMAT/BEYAN/ONAY CANLI KABULÜ (tek koşum). MEVCUT tek canlı API'ye bağlanır; API BOOT ETMEZ, env/restart YOK.
 * Ölçüm İ3 düzeneğidir (İ2 ölçütleri H4-01…H4-08): `i3-h4-declarations` (H4-01…05) + `i3-h4-disclosure` (H4-06…08).
 *
 * GÖNDERİM SINIRI (kaynaktan):
 *   - H4-04/H4-05 onay maili Yol A'dır (tenant Office satırı). H4-05, SENTETİK tenant'ın Office SMTP'sini BİLEREK kapalı
 *     porta (127.0.0.1:65535) kurar → best-effort başarısızlığı ölçülür; gerçek alıcıya gönderim İMKÂNSIZ (.invalid + ölü port).
 *   - H4-08 (yayın allowlist'i) canlıda KOŞULMAZ: onaylı canlı sağlayıcıyla yayın env-SMTP'den GERÇEK sunucuya çıkar.
 *     Runner çalışma-zamanı bağı (runtimeBinding) verilmediğinde yayın çağrısı YAPMAZ, H4-08'i ÖLÇÜLEMEYEN yazar.
 *     Bu satır, İ12 canlı kabulünün (runId 92d04ef3) G3 (onaylı sağlayıcı → PUBLISHED) + G5 (allowlist-dışı → 403,
 *     SEND_PENDING, smtpConn+0) kanıtına BAĞLANIR; kanıt dosyaları manifest sha256'ı ve runId ile DOĞRULANIR.
 *   - H4-07b/H4-07c sentetik sürüme DB enjeksiyonu yapar ve `finally`de GERİ ALIR (runner'ın kendi kuralı).
 * Sıra: kapılar → izolasyon ÖNCE → kurulum (setupI3 + setupDisclosureChain = İLK YAZMA) → 5 oturum → H4 → finally: nihai
 *       erişim kapanışı (kimlik bağı → kullanıcı pasif + tokenVersion++ · Case CLOSED) → login/me 401 → izolasyon SONRA.
 * Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 5 kapanış doğrulanmadı.
 */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { L, I3, isolationFingerprint, closeAccess } = I13;

const I12_EVIDENCE = {
  runId: '92d04ef3',
  files: { 'evidence-phase-smtp.json': '0A2172C3D0324AEEDCDCD9D90F05C94BA139066456120CD25F1E8F7DAAD363A7',
           'evidence-phase-mock.json': 'F23205647B02FA2F85532E27DD1060458AA4843C0C839F21746F5C2112BEFEA6' },
};

function gates(env) {
  if (env.I14_LIVE_CONFIRM !== '1') return { code: 3, why: 'I14_LIVE_CONFIRM=1 gerekli' };
  if (!(env.I14_LIVE_GO_REF && /^OWNER-GO-CLIENT-I14-\d{8}-R\d{2}$/.test(env.I14_LIVE_GO_REF.trim()))) return { code: 3, why: 'I14_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-I14-YYYYMMDD-RNN) gerekli' };
  const runId = String(env.I14_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'I14_RUNID 8 hex olmalı' };
  const bound = I13.dbName(env.AH_DATABASE_URL || '');
  if (!env.I14_EXPECT_DB || env.I14_EXPECT_DB !== bound) return { code: 4, why: `beklenen DB '${env.I14_EXPECT_DB || ''}' != bağlı '${bound || ''}'` };
  if (env.I14_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId\'den türetilen ile eşleşmiyor' };
  if (!env.I14_API_BASE || env.I14_API_BASE !== env.I14_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  return { code: 0, runId };
}

/** İ12 canlı kanıtı: dosya sha256 = manifest pini · runId eşit · G3 ve G5 PASS. Okunamazsa null (PASS sayılmaz). */
function checkI12Evidence(dir) {
  try {
    const got = {};
    for (const [f, pin] of Object.entries(I12_EVIDENCE.files)) {
      const buf = fs.readFileSync(path.join(dir, f));
      const sha = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
      const j = JSON.parse(buf.toString('utf8'));
      got[f] = { shaOk: sha === pin, runIdOk: j.runId === I12_EVIDENCE.runId, rows: j.results || [] };
    }
    const g3 = got['evidence-phase-smtp.json'].rows.find((r) => r.id === 'G3');
    const g5 = got['evidence-phase-mock.json'].rows.find((r) => r.id === 'G5');
    const ok = Object.values(got).every((x) => x.shaOk && x.runIdOk) && g3 && g3.verdict === 'PASS' && g5 && g5.verdict === 'PASS';
    return { ok, detail: `İ12 runId ${I12_EVIDENCE.runId} · sha-pin=${Object.values(got).every((x) => x.shaOk)} · G3=${g3 ? g3.verdict : '?'} (${g3 ? String(g3.observed).slice(0, 90) : ''}) · G5=${g5 ? g5.verdict : '?'} (${g5 ? String(g5.observed).slice(0, 90) : ''})` };
  } catch (e) { return null; }
}

(async () => {
  const g = gates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const runId = g.runId; const base = process.env.I14_API_BASE; const pw = process.env.I14_LIVE_LOGIN_PW;
  const receiptPath = process.env.I14_RECEIPT; const evid = process.env.I14_EVID_FILE; const i12Dir = process.env.I14_I12_EVIDENCE_DIR;
  if (!pw || !receiptPath || !evid || !i12Dir) { console.error('REDDEDİLDİ: I14_LIVE_LOGIN_PW + I14_RECEIPT + I14_EVID_FILE + I14_I12_EVIDENCE_DIR gerekli.'); process.exit(2); }

  const R = new L.Results();
  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'I14-LIVE-RUN', runId, apiBase: base };
  let receipt = null; const tokens = {}; let fatal = null;
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10)); st.runId = runId;
    receipt = { record: 'I14-SETUP-RECEIPT', runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId,
      clientId: st.clientId, caseId: st.caseId, createdAt: new Date().toISOString() };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 1), 'utf8');
    let chain = null; let chainError = null;
    try { chain = await L.setupDisclosureChain(prisma, st, runId); } catch (e) { chainError = e && e.message ? e.message : String(e); }
    for (const tag of ['user', 'elev1', 'elev2', 'elev3', 'accountant']) {
      const r = await L.AH.login(base, st.actors[tag].email, pw, st.slug);
      if (!r.ok) throw new Error(`${tag} oturum açamadı (HTTP ${r.status ?? 'belirsiz'})`);
      tokens[tag] = r.token;
    }
    const sameRole = st.actors.user.role === st.actors.elev1.role && st.actors.user.role !== 'ADMIN';
    R.check('I14-00', 'ÖLÇÜM GEÇERLİ: user ile elev* AYNI rolde, fark YALNIZ PARTNER bağı (ADMIN yolu kapalı)', sameRole,
      `user:${st.actors.user.role} elev1:${st.actors.elev1.role} accountant:${st.actors.accountant.role}`);
    const ctx = { base, prisma, tokens, st, R, chain, chainError, apiConfig: null, runtimeBinding: null };
    await require(path.join(I3, 'i3-h4-declarations'))(ctx);
    await require(path.join(I3, 'i3-h4-disclosure'))(ctx);
    // H4-08 → İ12 canlı kanıtına bağlanır (runner canlıda yayın çağrısı YAPMADI; satır ÖLÇÜLEMEYEN olmalı)
    const idx = R.rows.findIndex((r) => r.id === 'H4-08');
    const row = idx >= 0 ? R.rows[idx] : null;
    const skippedAsDesigned = !!row && row.verdict === 'UNMEASURED' && /CALISMA ZAMANI BAGI/.test(String(row.observed));
    const ev = checkI12Evidence(i12Dir);
    const mapped = { id: 'H4-08', desc: 'yayın allowlist kapısı — İ12 canlı G3+G5 kanıtına BAĞLI (canlıda yeniden koşulmadı)',
      verdict: !skippedAsDesigned ? 'UNMEASURED' : ev === null ? 'UNMEASURED' : ev.ok ? 'PASS' : 'FAIL',
      observed: !skippedAsDesigned ? `runner satırı beklenen biçimde değil: ${row ? `${row.verdict} ${String(row.observed).slice(0, 80)}` : 'yok'}`
        : ev === null ? 'İ12 kanıt dosyaları OKUNAMADI — PASS sayılmaz' : `${ev.detail} · runner: yayın çağrısı YAPILMADI (bağ yok)` };
    if (idx >= 0) R.rows[idx] = mapped; else R.rows.push(mapped);
  } catch (e) { fatal = e && e.message ? e.message : String(e); console.error(`\nÖLÇÜM DURDU: ${fatal}`); }
  finally {
    try {
      if (!receipt) {
        const t = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}` }, select: { id: true } });
        const f = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}-x` }, select: { id: true } });
        if (t) receipt = { record: 'I14-SETUP-RECEIPT', runId, tenantId: t.id, tenantSlug: `${L.AH.TENANT_PREFIX}${runId}`, foreignTenantId: f ? f.id : null };
      }
      out.closure = receipt ? await closeAccess(prisma, receipt) : { ok: true, nothingToClose: true, wroteNothing: true };
    } catch (e) { out.closure = { ok: false, error: e && e.message ? e.message : String(e) }; }
    if (receipt && receipt.tenantSlug) {
      try {
        const lg = await L.AH.login(base, `elev1-${runId}@ah-harness.invalid`, pw, receipt.tenantSlug);
        out.closureLogin = lg.status; out.closureMe = null;
        if (tokens.elev1) { const r = await L.AH.httpJson('GET', `${base}/auth/me`, { token: tokens.elev1 }); out.closureMe = r.status; }
      } catch (e) { out.closureProbeError = String(e && e.message || e).slice(0, 160); }
      const closeObs = `closure.ok=${out.closure && out.closure.ok} login=${out.closureLogin} me=${out.closureMe}`;
      if (!(out.closure && out.closure.ok)) R.check('I14-CLOSE', 'nihai kapanış (DB)', false, closeObs);
      else if (typeof out.closureLogin !== 'number' || (tokens.elev1 && typeof out.closureMe !== 'number')) R.unmeasured('I14-CLOSE', 'nihai kapanış HTTP kanıtı', `yoklama belirsiz · ${closeObs}`);
      else R.check('I14-CLOSE', 'nihai kapanış: kullanıcılar pasif + Case CLOSED · login 401 · eski token 401', out.closureLogin === 401 && (out.closureMe === 401 || !tokens.elev1), closeObs);
      try {
        out.isolationAfter = await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]);
        const b = out.isolationBefore;
        R.check('I14-ISO', 'izolasyon: sentetik OLMAYAN tenant\'ların client/user dağılımı DEĞİŞMEDİ', !!b && b.digest === out.isolationAfter.digest,
          `önce=${b ? b.digest : '?'}/${b ? b.tenants : '?'} sonra=${out.isolationAfter.digest}/${out.isolationAfter.tenants}`);
      } catch (e) { R.unmeasured('I14-ISO', 'izolasyon', `okunamadı: ${String(e.message || e).slice(0, 120)}`); }
    }
    const s = R.summary(`İ14 CANLI H4 (runId=${runId})`);
    out.fatal = fatal; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
    fs.writeFileSync(evid, JSON.stringify(out, null, 1), 'utf8');
    await prisma.$disconnect().catch(() => {});
    process.exitCode = !(out.closure && out.closure.ok) ? 5 : fatal ? 1 : s.fail > 0 ? 2 : s.unmeasured > 0 ? 3 : 0;
  }
})();
