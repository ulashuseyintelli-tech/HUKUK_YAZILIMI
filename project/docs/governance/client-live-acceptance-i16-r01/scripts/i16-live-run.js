'use strict';
/*
 * İ16 — H7 PORTAL CANLI KABULÜ (tek koşum; İ4 = DAHİL, owner 2026-09-18). MEVCUT tek canlı API; boot/env/restart YOK.
 * Ölçütler: İ2 §7 H7-00…H7-05 + owner eki (personel belge inceleme · mesajlaşma — MEVCUT rol/tenant politikası; kendiliğinden
 * onaylayıcı şartı EKLENMEZ): H7-06 (inceleme kapsamı) · H7-07 (personel mesajlaşma kapsamı) · H7-08 (müvekkil mesaj kapsamı).
 *
 * DİSK/GÖNDERİM SINIRI: portal belge YÜKLEME ucu ÇAĞRILMAZ (canlı diske dosya bırakırdı). İnceleme/indirme senaryoları için
 * PortalDocument satırları SENTETİK tenant'larda doğrudan kurulur; `filePath` var olmayan bir yol gösterir (kapsam reddi dosyaya
 * erişmeden 404 döner; inceleme dosyaya dokunmaz). Portal e-postası `.invalid`; gönderim ucu yok (forgot-password ÇAĞRILMAZ).
 *
 * H7-05 canlı KAPSAMI: dört ret nedeninin ikisi canlıda kurulabilir — devre dışı (isActive=false) ve eski tokenVersion
 * (yeniden etkinleştirme tokenVersion'ı artırır). "Bulunamayan kullanıcı" ve "DB hatası" canlıda kurulamaz (sahte JWT /
 * satır silme / DB kesintisi gerekir) → yalnız disposable provada ölçülür; canlı satır H7-05a olarak AYRI raporlanır.
 * Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 5 kapanış doğrulanmadı.
 */
const fs = require('fs'); const crypto = require('crypto');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { L, isolationFingerprint, closeAccess } = I13;

function gates(env) {
  if (env.I16_LIVE_CONFIRM !== '1') return { code: 3, why: 'I16_LIVE_CONFIRM=1 gerekli' };
  if (!(env.I16_LIVE_GO_REF && /^OWNER-GO-CLIENT-I16-\d{8}-R\d{2}$/.test(env.I16_LIVE_GO_REF.trim()))) return { code: 3, why: 'I16_LIVE_GO_REF biçimi (OWNER-GO-CLIENT-I16-YYYYMMDD-RNN) gerekli' };
  const runId = String(env.I16_RUNID || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) return { code: 2, why: 'I16_RUNID 8 hex olmalı' };
  if (!env.I16_EXPECT_DB || env.I16_EXPECT_DB !== I13.dbName(env.AH_DATABASE_URL || '')) return { code: 4, why: 'beklenen DB bağlı DB ile eşleşmiyor' };
  if (env.I16_EXPECT_TENANT_SLUG !== `${L.AH.TENANT_PREFIX}${runId}`) return { code: 4, why: 'hedef slug beyanı runId\'den türetilen ile eşleşmiyor' };
  if (!env.I16_API_BASE || env.I16_API_BASE !== env.I16_EXPECT_API) return { code: 4, why: 'API adresi beyanı eşleşmiyor' };
  return { code: 0, runId };
}
const H = (m, u, o) => L.AH.httpJson(m, u, o || {});
const body = (r) => (r && r.body && (r.body.data !== undefined ? r.body.data : r.body)) || null;
const msgOf = (r) => { const b = r && r.body; return b ? String(b.message || (b.error && b.error.message) || '') : ''; };

(async () => {
  const g = gates(process.env);
  if (g.code !== 0) { console.error(`REDDEDİLDİ: ${g.why}`); process.exit(g.code); }
  const runId = g.runId; const base = process.env.I16_API_BASE; const pw = process.env.I16_LIVE_LOGIN_PW;
  const receiptPath = process.env.I16_RECEIPT; const evid = process.env.I16_EVID_FILE;
  if (!pw || !receiptPath || !evid) { console.error('REDDEDİLDİ: I16_LIVE_LOGIN_PW + I16_RECEIPT + I16_EVID_FILE gerekli.'); process.exit(2); }
  const portalPw = 'P16!' + crypto.randomBytes(15).toString('base64url');
  const portalEmail = `portal-${runId}@ah-harness.invalid`;
  const R = new L.Results(); const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  const out = { record: 'I16-LIVE-RUN', runId, apiBase: base };
  let receipt = null; const tok = {}; let fatal = null; let pTok = null;
  try {
    out.isolationBefore = await isolationFingerprint(prisma, []);
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10)); st.runId = runId;
    receipt = { record: 'I16-SETUP-RECEIPT', runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId,
      clientId: st.clientId, otherClientId: st.otherClientId, foreignClientId: st.foreignClientId, caseId: st.caseId, createdAt: new Date().toISOString() };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 1), 'utf8');
    // Sentetik karşı kayıtlar (yalnız ah-<runId> ve ah-<runId>-x): başka müvekkil + başka tenant dosyası/belgesi, bekleyen belge
    const mkCase = async (tenantId, clientId, tag) => { const c = await prisma.case.create({ data: { tenantId, fileNumber: `I16-${tag}-${runId}`, type: 'GENERAL_EXECUTION' }, select: { id: true } });
      await prisma.caseClient.create({ data: { caseId: c.id, clientId } }); return c.id; };
    const mkDoc = (tenantId, clientId, tag) => prisma.portalDocument.create({ data: { tenantId, clientId, type: 'DIGER', title: `I16 ${tag}`, fileName: `i16-${tag}.pdf`,
      filePath: `__i16_no_file__/${runId}/${tag}.pdf`, fileSize: 1, mimeType: 'application/pdf' }, select: { id: true } }).then((d) => d.id);
    const fx = { otherCase: await mkCase(st.tenantId, st.otherClientId, 'other'), foreignCase: await mkCase(st.foreignTenantId, st.foreignClientId, 'frn'),
      otherDoc: await mkDoc(st.tenantId, st.otherClientId, 'other'), foreignDoc: await mkDoc(st.foreignTenantId, st.foreignClientId, 'frn'),
      ownPending: await mkDoc(st.tenantId, st.clientId, 'own') };
    for (const t of ['viewer', 'user', 'elev1']) { const r = await L.AH.login(base, st.actors[t].email, pw, st.slug); if (!r.ok) throw new Error(`${t} oturum açamadı (HTTP ${r.status ?? '?'})`); tok[t] = r.token; }
    R.check('I16-00', 'ÖLÇÜM GEÇERLİ: user ile elev1 AYNI rolde (fark YALNIZ PARTNER bağı)', st.actors.user.role === st.actors.elev1.role && st.actors.user.role !== 'ADMIN',
      `viewer:${st.actors.viewer.role} user:${st.actors.user.role} elev1:${st.actors.elev1.role}`);

    // ── H7-00 · erişim açmak elevated ister (isApproverEligible); e-posta çakışması 409 ──
    const cpu = () => prisma.clientPortalUser.count({ where: { clientId: st.clientId } });
    const hpa = async () => (await prisma.client.findUnique({ where: { id: st.clientId }, select: { hasPortalAccess: true } })).hasPortalAccess;
    const b0 = { n: await cpu(), h: await hpa() };
    const rDeny = await H('POST', `${base}/portal/admin/create-user`, { token: tok.user, body: { clientId: st.clientId, email: portalEmail, password: portalPw } });
    const a0 = { n: await cpu(), h: await hpa() };
    const rOk = await H('POST', `${base}/portal/admin/create-user`, { token: tok.elev1, body: { clientId: st.clientId, email: portalEmail, password: portalPw } });
    const rDup = await H('POST', `${base}/portal/admin/create-user`, { token: tok.elev1, body: { clientId: st.otherClientId, email: portalEmail, password: portalPw } });
    const otherN = await prisma.clientPortalUser.count({ where: { clientId: st.otherClientId } });
    R.check('H7-00', 'erişim açma: elevated olmayan 403 + yazma YOK · elevated açar · aktif e-posta çakışması 409 (ikinci hesap oluşmaz)',
      rDeny.status === 403 && a0.n === b0.n && a0.h === b0.h && rOk.status >= 200 && rOk.status < 300 && (await cpu()) === 1 && (await hpa()) === true && rDup.status === 409 && otherN === 0,
      `USER→${rDeny.status} (portalUser ${b0.n}→${a0.n}, hasPortalAccess ${b0.h}→${a0.h}) · elev1→${rOk.status} · çakışma→${rDup.status} (başka müvekkilde hesap=${otherN})`);

    // ── H7-03 · personel token'ı portal uçlarında geçmez ──
    const rStaff = await H('GET', `${base}/portal/cases`, { token: tok.elev1 });
    R.check('H7-03', 'personel JWT ile GET /portal/cases → 401, veri dönmez', rStaff.status === 401, `HTTP ${rStaff.status}`);

    // ── Portal oturumu ──
    const lp = await H('POST', `${base}/portal/login`, { body: { email: portalEmail, password: portalPw } });
    pTok = (body(lp) && (body(lp).token || body(lp).accessToken || body(lp).access_token)) || (lp.body && lp.body.token) || null;
    if (!pTok) throw new Error(`portal login HTTP ${lp.status}`);

    // ── H7-01 · K1: liste kendi müvekkilinden; sorgudaki clientId yok sayılır ──
    const rc = await H('GET', `${base}/portal/cases?clientId=${st.otherClientId}`, { token: pTok });
    const ids = (Array.isArray(body(rc)) ? body(rc) : (body(rc) && (body(rc).cases || body(rc).items)) || []).map((c) => c.id);
    const rd = await H('GET', `${base}/portal/documents?clientId=${st.otherClientId}`, { token: pTok });
    const dids = (Array.isArray(body(rd)) ? body(rd) : (body(rd) && (body(rd).documents || body(rd).items)) || []).map((d) => d.id);
    R.check('H7-01', 'K1: liste YALNIZ kendi müvekkili · sorgudaki clientId DİKKATE ALINMAZ',
      rc.status === 200 && ids.includes(st.caseId) && !ids.includes(fx.otherCase) && !ids.includes(fx.foreignCase) && rd.status === 200 && dids.includes(fx.ownPending) && !dids.includes(fx.otherDoc) && !dids.includes(fx.foreignDoc),
      `cases HTTP ${rc.status} [kendi=${ids.includes(st.caseId)} başka=${ids.includes(fx.otherCase)} yabancı=${ids.includes(fx.foreignCase)}] · documents HTTP ${rd.status} [kendi=${dids.includes(fx.ownPending)} başka=${dids.includes(fx.otherDoc)} yabancı=${dids.includes(fx.foreignDoc)}]`);

    // ── H7-02 · K2: başka müvekkil + başka tenant nesnesi 404 (ayrı ayrı; belge yolu dolaylı tenant bağı ayrıca) ──
    const k2 = {
      caseOther: (await H('GET', `${base}/portal/cases/${fx.otherCase}`, { token: pTok })).status,
      caseForeign: (await H('GET', `${base}/portal/cases/${fx.foreignCase}`, { token: pTok })).status,
      docOther: (await H('GET', `${base}/portal/documents/${fx.otherDoc}/download`, { token: pTok })).status,
      docForeign: (await H('GET', `${base}/portal/documents/${fx.foreignDoc}/download`, { token: pTok })).status,
    };
    R.check('H7-02', 'K2: başka müvekkilin ve başka tenant\'ın dosyası/belgesi 404 (var-ama-yetkisiz ≠ yok ayrımı sızmaz)',
      Object.values(k2).every((s) => s === 404), JSON.stringify(k2));

    // ── H7-06 · personel belge inceleme: MEVCUT politika = tenant'ın her aktif personeli; başka tenant belgesi 404 + değişmez ──
    const fBefore = await prisma.portalDocument.findUnique({ where: { id: fx.foreignDoc }, select: { status: true, reviewedAt: true } });
    const rPend = await H('GET', `${base}/portal/admin/documents/pending`, { token: tok.viewer });
    const pids = (Array.isArray(body(rPend)) ? body(rPend) : []).map((d) => d.id);
    const rXt = await H('POST', `${base}/portal/admin/documents/${fx.foreignDoc}/approve`, { token: tok.viewer, body: { note: 'i16' } });
    const fAfter = await prisma.portalDocument.findUnique({ where: { id: fx.foreignDoc }, select: { status: true, reviewedAt: true } });
    const rOwn = await H('POST', `${base}/portal/admin/documents/${fx.ownPending}/reject`, { token: tok.viewer, body: { note: 'i16 sentetik' } });
    const own = await prisma.portalDocument.findUnique({ where: { id: fx.ownPending }, select: { status: true, reviewedBy: true } });
    R.check('H7-06', 'belge inceleme: bekleyen liste YALNIZ kendi tenant\'ı · başka tenant belgesi 404 + DEĞİŞMEZ · kendi tenant belgesi mevcut politikayla (aktif personel, VIEWER dahil) incelenir',
      rPend.status === 200 && pids.includes(fx.ownPending) && pids.includes(fx.otherDoc) && !pids.includes(fx.foreignDoc)
      && rXt.status === 404 && fAfter.status === fBefore.status && !fAfter.reviewedAt && rOwn.status >= 200 && rOwn.status < 300 && own.status === 'REJECTED' && own.reviewedBy === st.actors.viewer.id,
      `pending HTTP ${rPend.status} [kendi=${pids.includes(fx.ownPending)} yabancı=${pids.includes(fx.foreignDoc)}] · yabancı onay→${rXt.status} (durum ${fBefore.status}→${fAfter.status}) · kendi ret→${rOwn.status} (durum=${own.status}, inceleyen=viewer:${own.reviewedBy === st.actors.viewer.id})`);

    // ── H7-07 · personel mesajlaşma: kendi tenant müvekkiline yazılır; başka tenant müvekkili 404 + satır YOK ──
    const fm0 = await prisma.portalMessage.count({ where: { clientId: st.foreignClientId } });
    const rSendOwn = await H('POST', `${base}/portal/admin/messages/${st.clientId}`, { token: tok.user, body: { content: `i16 büro ${runId}` } });
    const rSendOther = await H('POST', `${base}/portal/admin/messages/${st.otherClientId}`, { token: tok.user, body: { content: `i16 başka ${runId}` } });
    const rSendFrn = await H('POST', `${base}/portal/admin/messages/${st.foreignClientId}`, { token: tok.user, body: { content: `i16 yabancı ${runId}` } });
    const rReadFrn = await H('GET', `${base}/portal/admin/messages/${st.foreignClientId}`, { token: tok.user });
    const fm1 = await prisma.portalMessage.count({ where: { clientId: st.foreignClientId } });
    const rCl = await H('GET', `${base}/portal/admin/messages/clients`, { token: tok.user });
    const cl = (Array.isArray(body(rCl)) ? body(rCl) : []).map((c) => c.id || (c.client && c.client.id));
    R.check('H7-07', 'personel mesajlaşma: kendi tenant müvekkiline yazılır · başka tenant müvekkiline gönderme/okuma 404 + satır YOK · müvekkil listesi yalnız kendi tenant',
      rSendOwn.status >= 200 && rSendOwn.status < 300 && rSendOther.status >= 200 && rSendOther.status < 300 && rSendFrn.status === 404 && rReadFrn.status === 404 && fm1 === fm0
      && rCl.status === 200 && cl.includes(st.clientId) && !cl.includes(st.foreignClientId),
      `kendi→${rSendOwn.status} · aynı tenant başka müvekkil→${rSendOther.status} · yabancı gönder→${rSendFrn.status} oku→${rReadFrn.status} (satır ${fm0}→${fm1}) · liste HTTP ${rCl.status} [kendi=${cl.includes(st.clientId)} yabancı=${cl.includes(st.foreignClientId)}]`);

    // ── H7-08 · müvekkil mesaj kapsamı: yalnız kendi müvekkiline ait mesajlar ──
    const rPm = await H('GET', `${base}/portal/messages`, { token: pTok });
    const pm = Array.isArray(body(rPm)) ? body(rPm) : (body(rPm) && body(rPm).messages) || [];
    const contents = pm.map((m) => m.content);
    R.check('H7-08', 'müvekkil mesajları YALNIZ kendi müvekkiline ait (aynı tenant başka müvekkile yazılan mesaj görünmez)',
      rPm.status === 200 && contents.includes(`i16 büro ${runId}`) && !contents.includes(`i16 başka ${runId}`) && pm.every((m) => !m.clientId || m.clientId === st.clientId),
      `HTTP ${rPm.status} · mesaj=${pm.length} · kendi=${contents.includes(`i16 büro ${runId}`)} başka=${contents.includes(`i16 başka ${runId}`)}`);

    // ── H7-04 · erişim sonlandırma: elevated olmayan 403 + yazma YOK; elevated kapatır; eski token + login reddedilir ──
    const snapP = async () => prisma.clientPortalUser.findFirst({ where: { clientId: st.clientId }, select: { isActive: true, tokenVersion: true } });
    const aud = () => prisma.auditLog.count({ where: { tenantId: st.tenantId, action: 'CLIENT_PORTAL_ACCESS_DISABLE' } });
    const p0 = await snapP(); const au0 = await aud();
    const rDisDeny = await H('POST', `${base}/portal/admin/disable-user`, { token: tok.user, body: { clientId: st.clientId } });
    const p1 = await snapP(); const au1 = await aud();
    const rDis = await H('POST', `${base}/portal/admin/disable-user`, { token: tok.elev1, body: { clientId: st.clientId } });
    const p2 = await snapP(); const au2 = await aud();
    const oldTok = await H('GET', `${base}/portal/cases`, { token: pTok });
    const relog = await H('POST', `${base}/portal/login`, { body: { email: portalEmail, password: portalPw } });
    const keep = await prisma.portalDocument.count({ where: { clientId: st.clientId } });
    R.check('H7-04', 'sonlandırma: elevated olmayan 403 + yazma/audit YOK · elevated → isActive=false + tokenVersion+1 + audit · eski token 401 · yeni login 401 · müvekkil verisi SİLİNMEZ',
      rDisDeny.status === 403 && p1.isActive === p0.isActive && p1.tokenVersion === p0.tokenVersion && au1 === au0
      && rDis.status >= 200 && rDis.status < 300 && p2.isActive === false && p2.tokenVersion === p0.tokenVersion + 1 && au2 === au0 + 1
      && oldTok.status === 401 && relog.status === 401 && keep >= 1,
      `USER→${rDisDeny.status} (değişim yok=${p1.tokenVersion === p0.tokenVersion}, audit ${au0}→${au1}) · elev1→${rDis.status} (isActive=${p2.isActive}, tokenVersion ${p0.tokenVersion}→${p2.tokenVersion}, audit→${au2}) · eski token→${oldTok.status} · login→${relog.status} · belge korunur=${keep}`);

    // ── H7-05a · ret nedenleri ayırt edilemez (canlıda kurulabilen iki neden: devre dışı · eski tokenVersion) ──
    const rReact = await H('POST', `${base}/portal/admin/create-user`, { token: tok.elev1, body: { clientId: st.clientId, email: portalEmail, password: portalPw } });
    const p3 = await snapP();
    const stale = await H('GET', `${base}/portal/cases`, { token: pTok });   // hesap AKTİF, token eski tokenVersion'lı
    const same = oldTok.status === stale.status && msgOf(oldTok) === msgOf(stale);
    R.check('H7-05a', 'devre dışı ve eski-tokenVersion retleri AYNI durum kodu + AYNI mesaj (canlıda kurulabilen iki neden)',
      rReact.status >= 200 && rReact.status < 300 && p3.isActive === true && p3.tokenVersion === p2.tokenVersion + 1 && stale.status === 401 && same,
      `devre-dışı: ${oldTok.status} "${msgOf(oldTok).slice(0, 40)}" · eski-sürüm (hesap aktif, v${p3.tokenVersion}): ${stale.status} "${msgOf(stale).slice(0, 40)}" · eşit=${same}`);
  } catch (e) { fatal = e && e.message ? e.message : String(e); console.error(`\nÖLÇÜM DURDU: ${fatal}`); }
  finally {
    // NİHAİ KAPANIŞ: personel (closeAccess: kullanıcı pasif + tokenVersion++ + Case CLOSED) + PORTAL (bu tenant'ların
    // portal kullanıcıları pasif + tokenVersion++ + hasPortalAccess=false). Kimlik bağı closeAccess içinde; yoksa SIFIR yazma.
    try {
      if (!receipt) {
        const t = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}` }, select: { id: true } });
        const f = await prisma.tenant.findFirst({ where: { slug: `${L.AH.TENANT_PREFIX}${runId}-x` }, select: { id: true } });
        if (t) receipt = { record: 'I16-SETUP-RECEIPT', runId, tenantId: t.id, tenantSlug: `${L.AH.TENANT_PREFIX}${runId}`, foreignTenantId: f ? f.id : null };
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
        const me = tok.elev1 ? await H('GET', `${base}/auth/me`, { token: tok.elev1 }) : { status: null };
        const pl = await H('POST', `${base}/portal/login`, { body: { email: portalEmail, password: portalPw } });
        out.closureLogin = lg.status; out.closureMe = me.status; out.closurePortalLogin = pl.status;
      } catch (e) { out.closureProbeError = String(e && e.message || e).slice(0, 160); }
      const obs = `closure.ok=${out.closure && out.closure.ok} staffLogin=${out.closureLogin} me=${out.closureMe} portalLogin=${out.closurePortalLogin}`;
      if (!(out.closure && out.closure.ok)) R.check('I16-CLOSE', 'nihai kapanış (DB)', false, obs);
      else if ([out.closureLogin, out.closurePortalLogin].some((s) => typeof s !== 'number') || (tok.elev1 && typeof out.closureMe !== 'number')) R.unmeasured('I16-CLOSE', 'nihai kapanış HTTP kanıtı', `yoklama belirsiz · ${obs}`);
      else R.check('I16-CLOSE', 'nihai kapanış: personel + portal kullanıcıları pasif · Case CLOSED · personel login 401 · eski token 401 · portal login 401',
        out.closureLogin === 401 && (!tok.elev1 || out.closureMe === 401) && out.closurePortalLogin === 401, obs);
      try {
        out.isolationAfter = await isolationFingerprint(prisma, [receipt.tenantId, receipt.foreignTenantId]);
        R.check('I16-ISO', 'izolasyon: sentetik OLMAYAN tenant\'ların client/user dağılımı DEĞİŞMEDİ', out.isolationBefore.digest === out.isolationAfter.digest,
          `önce=${out.isolationBefore.digest}/${out.isolationBefore.tenants} sonra=${out.isolationAfter.digest}/${out.isolationAfter.tenants}`);
      } catch (e) { R.unmeasured('I16-ISO', 'izolasyon', String(e.message || e).slice(0, 120)); }
    }
    const s = R.summary(`İ16 CANLI H7 (runId=${runId})`);
    out.fatal = fatal; out.pass = s.pass; out.fail = s.fail; out.unmeasured = s.unmeasured;
    out.results = R.rows.map((r) => ({ id: r.id, verdict: r.verdict, observed: r.observed }));
    fs.writeFileSync(evid, JSON.stringify(out, null, 1), 'utf8');
    await prisma.$disconnect().catch(() => {});
    process.exitCode = !(out.closure && out.closure.ok) ? 5 : fatal ? 1 : s.fail > 0 ? 2 : s.unmeasured > 0 ? 3 : 0;
  }
})();
