'use strict';
/*
 * C4 — EKSİK TEK ÖLÇÜT: `POST /api/client-statements/monthly-delivery/run-now`, kimliği DOĞRULANMIŞ ama elevated
 * OLMAYAN aktör için HTTP 403 + reasonCode `SCHEDULER_MANUAL_RUN_DENIED_NOT_ELEVATED`.
 * Anonim 401 bu ölçütü KARŞILAMAZ (yalnız bilgi olarak kaydedilir). İ12 hedef-teslim/dedupe kanıtı YENİDEN KOŞULMAZ.
 * Kalıp: İ16 / R26 B2 — mevcut tek canlı API; boot/env/restart YOK.
 *
 * AKTÖR: setupI3 `user` → rol USER (VIEWER değil) + StaffMember kaydı + PARTNER bağı YOK → `isApproverEligible` false.
 *        Koşum öncesi DB'den salt-okuma ile doğrulanır; tutmazsa ÖLÇÜM YAPILMAZ.
 * YAN ETKİ DÜZENİ (beklenmedik başarıya karşı):
 *   - Uç kapsamı HER ZAMAN aktörün tenant'ı (`scope={tenantId: req.user.tenantId}`; controller satır 48-54) → yalnız sentetik tenant.
 *   - Sentetik tenant'ta ClientStatement 0 ve Office SMTP host YOK (ön kapı) → teslim edilecek ekstre de kanal da yoktur.
 *   - Tüm e-postalar `*.invalid`; gerçek müvekkil verisi yok.
 *   - Sayım kapısı: sentetik tenant ledger/ClientNotification/ClientStatement +0 ve GLOBAL ledger +0 (çağrı öncesi/sonrası).
 *     Global ClientNotification farkı yalnız bilgi (gerçek kullanım eşzamanlı olabilir).
 * finally: personel erişim kapanışı + Case CLOSED (closeAccess) + kapanış yoklaması (giriş 401) + izolasyon parmak izi.
 * Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 5 KAPANIŞ DOĞRULANMADI · 2/3/4 kapı reddi.
 * PROVA (yalnız disposable): C4_PROVA_ELEVATED=1 → aynı uç elev1 ile de çağrılır; başarıda da sayımlar +0 olmalı.
 */
const fs = require('fs');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { L, isolationFingerprint, closeAccess } = I13;
const REASON = 'SCHEDULER_MANUAL_RUN_DENIED_NOT_ELEVATED';

function gates(env) {
  if (env.C4_LIVE_CONFIRM !== '1') return { code: 3, why: 'C4_LIVE_CONFIRM=1 gerekli' };
  if (!(env.C4_LIVE_GO_REF && /^OWNER-GO-CLIENT-C4-\d{8}-R\d{2}$/.test(env.C4_LIVE_GO_REF.trim()))) return { code: 3, why: 'C4_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-C4-YYYYMMDD-RNN) gerekli' };
  const runId = String(env.C4_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'C4_RUNID 8 hex olmalı' };
  if (!env.C4_EXPECT_DB || env.C4_EXPECT_DB !== I13.dbName(env.AH_DATABASE_URL || '')) return { code: 4, why: 'beklenen DB bağlı DB ile eşleşmiyor' };
  if (env.C4_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId\'den türetilen ile eşleşmiyor' };
  if (!env.C4_API_BASE || env.C4_API_BASE !== env.C4_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  return { code: 0, runId };
}
const H = (m, u, o) => L.AH.httpJson(m, u, o || {});
const reasonOf = (r) => { const b = r && r.body; return b ? String(b.reasonCode || (b.message && b.message.reasonCode) || (b.error && b.error.reasonCode) || JSON.stringify(b).slice(0, 160)) : ''; };

(async () => {
  const g = gates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const runId = g.runId; const base = process.env.C4_API_BASE; const pw = process.env.C4_LIVE_LOGIN_PW;
  const receiptPath = process.env.C4_RECEIPT; const evid = process.env.C4_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: C4_LIVE_LOGIN_PW + C4_RECEIPT + C4_EVID_FILE gerekli.'); process.exit(2); }
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'C4-LIVE-403', runId, apiBase: base };
  let receipt = null; let fatal = null; let tok = null;
  const counts = async (tid) => ({
    ledger: await prisma.clientStatementDeliveryLedger.count({ where: { tenantId: tid } }),
    notification: await prisma.clientNotification.count({ where: { tenantId: tid } }),
    statement: await prisma.clientStatement.count({ where: { tenantId: tid } }),
    globalLedger: await prisma.clientStatementDeliveryLedger.count(),
    globalNotification: await prisma.clientNotification.count(),
  });
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10)); st.runId = runId;
    receipt = { record: 'C4-SETUP-RECEIPT', runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId,
      clientId: st.clientId, caseId: st.caseId, createdAt: new Date().toISOString() };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 1), 'utf8');

    // ── ÖN KAPILAR (salt okuma): aktör elevated DEĞİL + teslim kanalı/ekstre YOK ──
    const actor = await prisma.user.findUnique({ where: { id: st.actors.user.id },
      select: { role: true, isActive: true, tenantId: true, staffMember: { select: { id: true } }, lawyer: { select: { lawyerRank: true, canApproveOfficeActions: true } } } });
    const office = await prisma.office.findUnique({ where: { tenantId: st.tenantId }, select: { smtpHost: true } });
    const c0 = await counts(st.tenantId);
    const lawyerElevated = !!(actor && actor.lawyer && (actor.lawyer.lawyerRank === 'PARTNER' || actor.lawyer.canApproveOfficeActions === true));
    const preOk = actor && actor.role === 'USER' && actor.isActive && actor.tenantId === st.tenantId && !lawyerElevated
      && !(office && office.smtpHost) && c0.statement === 0;
    R.check('C4-PRE', 'ön kapı: aktör USER (VIEWER değil) + elevated DEĞİL (PARTNER/canApprove yok) · sentetik tenantta SMTP host YOK ve ekstre 0',
      !!preOk, `rol=${actor && actor.role} aktif=${actor && actor.isActive} staff=${!!(actor && actor.staffMember)} lawyer=${actor && actor.lawyer ? actor.lawyer.lawyerRank : 'yok'} · smtpHost=${office && office.smtpHost ? 'VAR' : 'yok'} · ekstre=${c0.statement}`);
    if (!preOk) throw new Error('ön kapı tutmadı — ölçüm YAPILMADI');

    const lg = await L.AH.login(base, st.actors.user.email, pw, st.slug);
    if (!lg.ok) throw new Error(`user oturum açamadı (HTTP ${lg.status ?? '?'})`);
    tok = lg.token;
    const url = `${base}/client-statements/monthly-delivery/run-now`;
    const anon = await H('POST', url, { body: {}, timeoutMs: 30000 });
    const r = await H('POST', url, { token: tok, body: {}, timeoutMs: 30000 });
    await new Promise((res) => setTimeout(res, 2000));
    let rElev = null;
    if (process.env.C4_PROVA_ELEVATED === '1') {
      const le = await L.AH.login(base, st.actors.elev1.email, pw, st.slug);
      rElev = le.ok ? await H('POST', url, { token: le.token, body: {}, timeoutMs: 60000 }) : { status: `login ${le.status}` };
      await new Promise((res) => setTimeout(res, 2000));
    }
    const c1 = await counts(st.tenantId);
    const reason = reasonOf(r);
    R.check('C4-403', `kimliği doğrulanmış, elevated OLMAYAN aktör → HTTP 403 + reasonCode ${REASON} (anonim 401 bu ölçütü KARŞILAMAZ)`,
      r.status === 403 && reason.includes(REASON), `HTTP ${r.status} · reasonCode=${reason} · (bilgi: anonim HTTP ${anon.status})`);
    const zero = c1.ledger === c0.ledger && c1.notification === c0.notification && c1.statement === c0.statement && c1.globalLedger === c0.globalLedger;
    R.check('C4-ZERO', 'sıfır yan etki: sentetik tenant ledger/bildirim/ekstre +0 · GLOBAL teslim ledger +0',
      zero, `tenant ledger ${c0.ledger}→${c1.ledger} · bildirim ${c0.notification}→${c1.notification} · ekstre ${c0.statement}→${c1.statement} · global ledger ${c0.globalLedger}→${c1.globalLedger} · (bilgi: global bildirim ${c0.globalNotification}→${c1.globalNotification})`
      + (rElev ? ` · PROVA elevated çağrı HTTP ${rElev.status}` : ''));
    out.counts = { before: c0, after: c1 }; out.anonStatus = anon.status; out.status = r.status; out.reasonCode = reason; out.provaElevatedStatus = rElev ? rElev.status : null;
  } catch (e) { fatal = e && e.message ? e.message : String(e); console.error(`\nÖLÇÜM DURDU: ${fatal}`); }
  finally {
    try {
      if (!receipt) {
        const t = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}` }, select: { id: true } });
        const f = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}-x` }, select: { id: true } });
        if (t) receipt = { record: 'C4-SETUP-RECEIPT', runId, tenantId: t.id, tenantSlug: `${L.AH.TENANT_PREFIX}${runId}`, foreignTenantId: f ? f.id : null };
      }
      out.closure = receipt ? await closeAccess(prisma, receipt) : { ok: true, nothingToClose: true, wroteNothing: true };
    } catch (e) { out.closure = { ok: false, error: e && e.message ? e.message : String(e) }; }
    if (receipt && receipt.tenantSlug) {
      try {
        const lg = await L.AH.login(base, `user-${runId}@ah-harness.invalid`, pw, receipt.tenantSlug);
        const me = tok ? await H('GET', `${base}/auth/me`, { token: tok }) : { status: null };
        out.closureLogin = lg.status; out.closureMe = me.status;
      } catch (e) { out.closureProbeError = String(e && e.message || e).slice(0, 160); }
      const obs = `closure.ok=${out.closure && out.closure.ok} login=${out.closureLogin} me=${out.closureMe}`;
      if (!(out.closure && out.closure.ok)) R.check('C4-CLOSE', 'nihai kapanış (DB)', false, obs);
      else if (typeof out.closureLogin !== 'number' || (tok && typeof out.closureMe !== 'number')) R.unmeasured('C4-CLOSE', 'nihai kapanış HTTP kanıtı', `yoklama belirsiz · ${obs}`);
      else R.check('C4-CLOSE', 'nihai kapanış: sentetik kullanıcılar pasif · Case CLOSED · giriş 401 · eski token 401',
        out.closureLogin === 401 && (!tok || out.closureMe === 401), obs);
      try {
        out.isolationAfter = await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]);
        R.check('C4-ISO', 'izolasyon: sentetik OLMAYAN tenant\'ların client/user dağılımı DEĞİŞMEDİ', out.isolationBefore.digest === out.isolationAfter.digest,
          `önce=${out.isolationBefore.digest}/${out.isolationBefore.tenants} sonra=${out.isolationAfter.digest}/${out.isolationAfter.tenants}`);
      } catch (e) { R.unmeasured('C4-ISO', 'izolasyon', String(e.message || e).slice(0, 120)); }
    }
    const s = R.summary(`C4 CANLI 403 (runId=${runId})`);
    out.fatal = fatal; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((x) => ({ id: x.id, verdict: x.verdict, observed: x.observed }));
    fs.writeFileSync(evid, JSON.stringify(out, null, 1), 'utf8');
    await prisma.$disconnect().catch(() => {});
    process.exitCode = !(out.closure && out.closure.ok) ? 5 : fatal ? 1 : s.fail > 0 ? 2 : s.unmeasured > 0 ? 3 : 0;
  }
})();
