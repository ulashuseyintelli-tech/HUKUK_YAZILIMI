/*
 * OFFICE PERSONEL DAVETI — UCTAN UCA KABUL KOSUMU
 *
 * ZINCIR (her adim OLCULUR; HTTP 200 tek basina teslim SAYILMAZ):
 *   D-1 ADMIN davet olusturur                      -> 201/200 + inviteId
 *   D-2 yerel yakalayicida TESLIM                  -> yakalama dosyasi VAR, alici sentetik, kabul baglantisi VAR
 *   D-3 gercek kabul ucu                           -> { ok: true }; DB: isActive true, passwordHash VAR, consumedAt VAR
 *   D-4 yeni parolayla giris                       -> token alinir
 *   D-5 AYNI token tekrar                          -> 400 (tuketilmis) ve DB degismez
 *   D-6 kullanilmamis davetler iptal (ADMIN)       -> bekleyen davet 0
 *   D-7 erisim kapanisi                            -> kullanicilar pasif, giris 401, eski token 401
 *   D-8 izolasyon                                  -> sentetik olmayan taraf DEGISMEDI
 *
 * HATA/KURTARMA YOLU: INV_FAULT_AFTER_ACCEPT=1 verilirse kosum D-3'ten HEMEN SONRA kasitli olarak
 * durur (cokme taklidi; kapanis CALISMAZ). Ardindan `INV_RUN_ID=<runId> node inv-99-close.js`
 * kapanisi runId'ye bagli olarak tamamlar. Bu yol disposable'da SINANIR.
 *
 * SIR: ham davet token'i ve parolalar yalniz bellekte; kanitlara yalniz sha256 yazilir (G-4 fail-closed).
 */
'use strict';
const crypto = require('crypto');
const L = require('./inv-lib');

const RESULTS = [];
function check(id, desc, ok, observed) {
  RESULTS.push({ id, desc, verdict: ok ? 'PASS' : 'FAIL', observed });
  L.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id}  ${desc}\n          ${observed}`);
  return ok;
}

async function main() {
  const env = L.assertRunEnvironment();
  const runId = process.env.INV_RUN_ID || L.newRunId();
  const slug = `${L.TENANT_PREFIX}${runId}`;
  L.assertOwnSlug(slug);

  const apiBase = process.env.INV_API_BASE_URL.replace(/\/+$/, '');
  const sinkDir = L.requireEnv('INV_SINK_DIR');
  const prisma = L.loadPrisma();
  const bcrypt = L.loadBcrypt();

  // Sirlar: sureste uretilir, hicbir dosyaya yazilmaz.
  const adminPassword = 'InvA!' + crypto.randomBytes(15).toString('base64url');
  const invitedPassword = 'InvB!' + crypto.randomBytes(15).toString('base64url');
  let rawToken = null;

  const inviteEmail = `${slug}-staff@office-acceptance.invalid`;
  const adminEmail = `${slug}-admin@office-acceptance.invalid`;
  let tenantId = null;
  let fatal = null;
  let closure = null;
  let isoBefore = null;
  let isoAfter = null;
  let invitedUserId = null;
  let inviteId = null;
  let faultInjected = false;

  try {
    const clash = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
    if (clash) throw new L.GateError(`G-3: '${slug}' zaten var`, 'G-3');
    isoBefore = await L.isolationFingerprint(prisma, []);

    // Kurulum: tenant + ADMIN (tek transaction).
    const hash = await bcrypt.hash(adminPassword, 10);
    const setup = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `INVITE ${runId}`, slug }, select: { id: true } });
      const admin = await tx.user.create({
        data: { tenantId: tenant.id, email: adminEmail, name: 'INV', surname: 'ADMIN', passwordHash: hash, role: 'ADMIN' },
        select: { id: true },
      });
      return { tenantId: tenant.id, adminId: admin.id };
    });
    tenantId = setup.tenantId;
    await L.assertOwnTenant(prisma, tenantId);
    L.log(`KOSUM KIMLIGI: runId=${runId} tenant=${slug} ortam=${env.environment}`);
    L.log(`KURTARMA (her kosulda): INV_RUN_ID=${runId} node inv-99-close.js`);

    const adminLogin = await L.login(apiBase, adminEmail, adminPassword, slug);
    if (!adminLogin.token) throw new Error(`kurulum: ADMIN girisi basarisiz (${adminLogin.status})`);
    await L.verifyApiBoundToSameDatabase(prisma, apiBase, adminLogin.token, tenantId);

    // D-1 davet olustur
    const since = Date.now() - 1000;
    const created = await L.httpJson('POST', `${apiBase}/auth/invites`, { email: inviteEmail, name: 'INV', surname: 'STAFF', role: 'USER' }, adminLogin.token);
    inviteId = created.body && created.body.inviteId;
    const inviteRow = inviteId ? await prisma.userInvite.findUnique({ where: { id: inviteId }, select: { id: true, userId: true, tokenHash: true, consumedAt: true, revokedAt: true, tenantId: true } }) : null;
    invitedUserId = inviteRow && inviteRow.userId;
    check('D-1', 'ADMIN davet olusturur (tenant kapsamli, token DB\'de yalniz hash)',
      (created.status === 200 || created.status === 201) && !!inviteRow && inviteRow.tenantId === tenantId && !inviteRow.consumedAt,
      `HTTP ${created.status} · inviteId=${inviteId ? 'VAR' : 'YOK'} · tokenHash=${inviteRow && inviteRow.tokenHash ? 'VAR' : 'YOK'} · consumedAt=${inviteRow && inviteRow.consumedAt ? 'VAR' : 'yok'}`);

    // D-2 yakalayicida TESLIM (HTTP 200 yeterli DEGIL)
    let cap = { delivered: false };
    for (let i = 0; i < 20 && !cap.delivered; i++) {
      cap = L.readCapturedInvite(sinkDir, inviteEmail, since);
      if (!cap.delivered) await new Promise((r) => setTimeout(r, 250));
    }
    rawToken = cap.rawToken;
    const tokenMatchesDb = !!(rawToken && inviteRow && L.sha256(rawToken) === (inviteRow.tokenHash || '').toUpperCase());
    check('D-2', 'yerel yakalayicida TESLIM: mesaj dosyasi VAR, alici sentetik, kabul baglantisi VAR, token DB hash\'i ile eslesiyor',
      cap.delivered && cap.acceptPathSeen && tokenMatchesDb,
      `yakalanan=${cap.delivered ? cap.file : 'YOK'} · kabul-baglantisi=${cap.acceptPathSeen ? 'VAR' : 'YOK'} · token->DB hash eslesme=${tokenMatchesDb}`);
    if (!rawToken) throw new Error('D-2: ham token yakalanamadi — sonraki adimlar OLCULEMEZ');

    // D-3 gercek kabul ucu
    const accepted = await L.httpJson('POST', `${apiBase}/auth/accept-invite`, { token: rawToken, password: invitedPassword });
    const afterAccept = await prisma.user.findUnique({ where: { id: invitedUserId }, select: { isActive: true, passwordHash: true } });
    const inviteAfter = await prisma.userInvite.findUnique({ where: { id: inviteId }, select: { consumedAt: true } });
    check('D-3', 'gercek kabul ucu: hesap aktiflesir, parola yazilir, davet tuketilir',
      (accepted.status === 200 || accepted.status === 201) && !!afterAccept && afterAccept.isActive === true && !!afterAccept.passwordHash && !!inviteAfter.consumedAt,
      `HTTP ${accepted.status} · isActive=${afterAccept && afterAccept.isActive} · passwordHash=${afterAccept && afterAccept.passwordHash ? 'VAR' : 'YOK'} · consumedAt=${inviteAfter && inviteAfter.consumedAt ? 'VAR' : 'YOK'}`);

    if (process.env.INV_FAULT_AFTER_ACCEPT === '1') {
      faultInjected = true;
      throw new Error('HATA ENJEKSIYONU: kabul sonrasi kasitli durus — kapanis CALISMADI (kurtarma yolu sinaniyor)');
    }

    // D-4 yeni parolayla giris
    const invitedLogin = await L.login(apiBase, inviteEmail, invitedPassword, slug);
    check('D-4', 'davet edilen kullanici yeni parolasiyla giris yapar',
      !!invitedLogin.token, `HTTP ${invitedLogin.status} · token=${invitedLogin.token ? 'alindi' : 'YOK'}`);

    // D-5 ayni token tekrar
    const replay = await L.httpJson('POST', `${apiBase}/auth/accept-invite`, { token: rawToken, password: invitedPassword + 'x' });
    const stillOk = await prisma.user.findUnique({ where: { id: invitedUserId }, select: { passwordHash: true } });
    const unchanged = !!stillOk && stillOk.passwordHash === (afterAccept && afterAccept.passwordHash);
    check('D-5', 'AYNI davet token\'i tekrar kullanilamaz (tuketilmis) ve parola DEGISMEZ',
      replay.status === 400 && unchanged, `HTTP ${replay.status} · parola hash degismedi=${unchanged}`);

    // D-6 kullanilmamis davetleri iptal et
    const list = await L.httpJson('GET', `${apiBase}/auth/invites?status=pending`, null, adminLogin.token);
    const pending = Array.isArray(list.body) ? list.body : (list.body && list.body.items) || [];
    for (const p of pending) {
      if (p && p.id) await L.httpJson('POST', `${apiBase}/auth/invites/${p.id}/revoke`, {}, adminLogin.token);
    }
    const pendingLeft = await prisma.userInvite.count({ where: { tenantId, consumedAt: null, revokedAt: null } });
    check('D-6', 'kullanilmamis davetler iptal edildi (bekleyen 0)', pendingLeft === 0,
      `API bekleyen=${pending.length} · DB kalan bekleyen=${pendingLeft}`);

    closure = await closeAccess(prisma, runId, { apiBase, inviteEmail, invitedPassword, invitedToken: invitedLogin.token });
    check('D-7', 'erisim kapanisi: kullanicilar pasif, giris 401, eski token 401',
      closure.ok && closure.login === 401 && closure.me === 401,
      `pasif=${closure.deactivated} · aktif kalan=${closure.stillActive} · giris=${closure.login} · eski token=${closure.me}`);

    isoAfter = await L.isolationFingerprint(prisma, [tenantId]);
    check('D-8', 'izolasyon: sentetik olmayan taraf DEGISMEDI',
      isoBefore.digest === isoAfter.digest,
      `once=${isoBefore.digest}/${isoBefore.tenants} sonra=${isoAfter.digest}/${isoAfter.tenants}`);
  } catch (e) {
    fatal = e && e.message ? e.message : String(e);
    L.log(`DURDU: ${fatal}`);
  } finally {
    // Hata enjeksiyonu YOLU disinda kapanis her kosulda denenir.
    if (!faultInjected && tenantId && !closure) {
      try { closure = await closeAccess(prisma, runId, null); L.log(`kapanis (finally): ok=${closure.ok}`); }
      catch (e) { L.log(`kapanis DENENDI ve BASARISIZ: ${e.message} — kurtarma: INV_RUN_ID=${runId} node inv-99-close.js`); }
    }
    const pass = RESULTS.filter((r) => r.verdict === 'PASS').length;
    const fail = RESULTS.filter((r) => r.verdict === 'FAIL').length;
    const out = {
      record: 'OFFICE-INVITE-ACCEPTANCE-R01', environment: env, runId, slug, tenantId,
      inviteId, invitedUserId,
      tokenSha256: rawToken ? L.sha256(rawToken) : null,
      faultInjected, closure, isolationBefore: isoBefore, isolationAfter: isoAfter,
      results: RESULTS, pass, fail, fatal,
      recovery: `INV_RUN_ID=${runId} node inv-99-close.js`,
      finishedAt: new Date().toISOString(),
    };
    const file = process.env.INV_RESULT_FILE;
    if (file) L.writeJsonNoSecrets(file, out, [rawToken, adminPassword, invitedPassword]);
    rawToken = null;
    await prisma.$disconnect();
    L.log(`\nDAVET KABUL (runId=${runId}): PASS ${pass} · FAIL ${fail}${fatal ? ` · DURDU: ${fatal}` : ''}`);
    process.exitCode = fatal ? (faultInjected ? 5 : 2) : (fail ? 1 : 0);
  }
}

/** Kapanis: yalniz bu kosumun tenant'inda. Silme YAPMAZ; erisimi kapatir. */
async function closeAccess(prisma, runId, probe) {
  const slug = `${L.TENANT_PREFIX}${runId}`;
  L.assertOwnSlug(slug);
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!t) return { ok: true, found: false, note: 'alan YOK (slug ile ARANDI)' };
  await L.assertOwnTenant(prisma, t.id);
  const before = await prisma.user.count({ where: { tenantId: t.id, isActive: true } });
  const deact = await prisma.user.updateMany({ where: { tenantId: t.id, isActive: true }, data: { isActive: false, tokenVersion: { increment: 1 } } });
  const revoked = await prisma.userInvite.updateMany({ where: { tenantId: t.id, consumedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  const stillActive = await prisma.user.count({ where: { tenantId: t.id, isActive: true } });
  const pendingLeft = await prisma.userInvite.count({ where: { tenantId: t.id, consumedAt: null, revokedAt: null } });
  let login = null; let me = null;
  if (probe) {
    const l = await L.login(probe.apiBase, probe.inviteEmail, probe.invitedPassword, slug);
    login = l.status;
    if (probe.invitedToken) {
      const r = await L.httpJson('GET', `${probe.apiBase}/auth/me`, null, probe.invitedToken);
      me = r.status;
    }
  }
  return { ok: stillActive === 0 && pendingLeft === 0, found: true, activeBefore: before, deactivated: deact.count, revokedInvites: revoked.count, stillActive, pendingLeft, login, me };
}

module.exports = { main, closeAccess };
if (require.main === module) main();
