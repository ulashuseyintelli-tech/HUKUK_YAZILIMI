'use strict';
/*
 * İ16 — H7-05 DÖRT RET NEDENİ (YALNIZ DISPOSABLE). Canlıda kurulamayan iki neden burada ölçülür:
 *   (1) devre dışı  (2) eski tokenVersion  (3) bulunamayan kullanıcı (ClientPortalUser satırı SİLİNİR)
 *   (4) DB hatası (postgres konteyneri kısa süre DURDURULUR, sonra yeniden başlatılır)
 * Beklenen: dördünde de AYNI durum kodu + AYNI mesaj (portal-auth.guard.ts: tüm nedenler tek genel mesaja düşer).
 * CANLI KORUMASI: I16_DISPOSABLE=1 ZORUNLU · bağlı DB adı test|gate|spec|ci|jest içermeli · konteyner adı hy-* olmalı.
 * Env: AH_DATABASE_URL · AH_PRISMA_ROOT · AH_BCRYPT_PATH · I16_API_BASE · I16_PG_CONTAINER · I16_EVID_FILE
 */
const fs = require('fs'); const crypto = require('crypto'); const { execFileSync } = require('child_process');
const I13 = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
const { L } = I13;
(async () => {
  const E = process.env; const db = I13.dbName(E.AH_DATABASE_URL || '') || '';
  if (E.I16_DISPOSABLE !== '1' || !/(test|gate|spec|ci|jest)/.test(db) || !/^hy-/.test(E.I16_PG_CONTAINER || '')) { console.error('REDDEDİLDİ: yalnız disposable (I16_DISPOSABLE=1 + test DB adı + hy-* konteyner).'); process.exit(3); }
  const base = E.I16_API_BASE; const prisma = L.AH.loadPrisma(); const bcrypt = require(E.AH_BCRYPT_PATH);
  const runId = crypto.randomBytes(4).toString('hex'); const pw = 'I16H!' + runId + runId; const ppw = 'P16!' + crypto.randomBytes(12).toString('base64url');
  const out = { record: 'I16-PROVA-H7-05', runId, reasons: {} };
  const probe = async (tok) => { const r = await L.AH.httpJson('GET', `${base}/portal/cases`, { token: tok, timeoutMs: 45000 }); const b = r.body || {}; return { status: r.status, message: String(b.message || '') }; };
  try {
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10));
    const elev = await L.AH.login(base, st.actors.elev1.email, pw, st.slug); if (!elev.ok) throw new Error('elev1 login');
    const mk = async (clientId, tag) => {
      const email = `p705-${tag}-${runId}@ah-harness.invalid`;
      const c = await L.AH.httpJson('POST', `${base}/portal/admin/create-user`, { token: elev.token, body: { clientId, email, password: ppw } });
      if (c.status >= 300) throw new Error(`create-user ${tag} HTTP ${c.status}`);
      const lg = await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email, password: ppw } });
      const b = lg.body || {}; const tok = b.token || b.accessToken || (b.data && b.data.token); if (!tok) throw new Error(`portal login ${tag}`); return { email, tok };
    };
    const A = await mk(st.clientId, 'a'); const B = await mk(st.otherClientId, 'b');
    out.baseline = await probe(A.tok);   // geçerli token → 200 beklenir
    // (1) devre dışı
    await L.AH.httpJson('POST', `${base}/portal/admin/disable-user`, { token: elev.token, body: { clientId: st.clientId } });
    out.reasons.disabled = await probe(A.tok);
    // (2) eski tokenVersion (yeniden etkinleştir → sürüm artar, hesap aktif)
    await L.AH.httpJson('POST', `${base}/portal/admin/create-user`, { token: elev.token, body: { clientId: st.clientId, email: A.email, password: ppw } });
    out.reasons.staleVersion = await probe(A.tok);
    // (3) bulunamayan kullanıcı — B'nin satırı SİLİNİR (disposable)
    await prisma.client.update({ where: { id: st.otherClientId }, data: { portalUserId: null, hasPortalAccess: false } }).catch(() => {});
    await prisma.clientPortalUser.deleteMany({ where: { clientId: st.otherClientId } });
    out.reasons.notFound = await probe(B.tok);
    // (4) DB hatası — A yeniden etkin: yeni geçerli token alınır, konteyner durdurulur, istek atılır, sonra MUTLAKA başlatılır
    const relog = await L.AH.httpJson('POST', `${base}/portal/login`, { body: { email: A.email, password: ppw } });
    const aTok2 = (relog.body && (relog.body.token || relog.body.accessToken || (relog.body.data && relog.body.data.token))) || null;
    out.preDbCheck = aTok2 ? await probe(aTok2) : null;
    // pause bağlantıyı ASKIDA bırakır (istek zaman aşımına düşer, guard'a hata ulaşmaz) → stop: bağlantı REDDEDİLİR
    execFileSync('docker', ['stop', '-t', '2', E.I16_PG_CONTAINER]);
    try { out.reasons.dbError = aTok2 ? await probe(aTok2) : { status: null, message: 'token yok' }; }
    finally { execFileSync('docker', ['start', E.I16_PG_CONTAINER]); for (let i = 0; i < 30; i += 1) { try { execFileSync('docker', ['exec', E.I16_PG_CONTAINER, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' }); break; } catch (x) { await new Promise((r) => setTimeout(r, 1000)); } } }
    const vals = Object.values(out.reasons);
    out.allSame = vals.every((v) => v.status === vals[0].status && v.message === vals[0].message);
    const indet = vals.some((v) => typeof v.status !== 'number');   // belirsiz yanıt ret kanıtı DEĞİL → ÖLÇÜLEMEYEN
    out.verdict = indet || !(out.baseline.status === 200 && out.preDbCheck && out.preDbCheck.status === 200) ? 'UNMEASURED'
      : vals.length === 4 && vals[0].status === 401 && out.allSame ? 'PASS' : 'FAIL';
  } catch (e) { out.verdict = 'UNMEASURED'; out.fatal = String(e.message || e).slice(0, 200); try { execFileSync('docker', ['start', E.I16_PG_CONTAINER], { stdio: 'ignore' }); } catch (x) { /* zaten çalışıyor */ } }
  finally { await prisma.$disconnect().catch(() => {}); }
  const s = JSON.stringify(out, null, 1); if (E.I16_EVID_FILE) fs.writeFileSync(E.I16_EVID_FILE, s, 'utf8'); console.log(s);
  process.exitCode = out.verdict === 'PASS' ? 0 : out.verdict === 'FAIL' ? 2 : 3;
})();
