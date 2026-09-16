/*
 * İ12 — PROVA (disposable) Office SMTP penceresi · SIR-KORUYUCU · rollback + KURTARMA (sağlamlaştırılmış)
 *
 * DISPOSABLE prova içindir: `assertDisposableEnvironment` (G-0) KALDIRILMAZ → yalnız disposable DB'de koşar.
 * CANLI DEĞİLDİR; canlı için AYRI giriş noktası `i12-live-window.js`. Pencere mantığının TEK KAYNAĞI burasıdır.
 *
 * SIR-KORUYUCU: pencere YALNIZ `smtpHost`/`smtpPort`/`smtpSecure` değiştirir; `smtpUser`/`smtpPass` (SIR)
 * OKUNMAZ/YAZILMAZ/ROLLBACK'e KONMAZ. Rollback yalnız {smtpHost,smtpPort,smtpSecure}.
 *
 * KURTARMA/KAPANIŞ SAĞLAMLIĞI (bu sürüm):
 *   - Rollback durumu AYRI sınıflanır: ABSENT (yok) · UNREADABLE (okunamıyor) · CORRUPT (bozuk içerik/şekil) ·
 *     MISMATCH (tenant/koşum uyuşmuyor) · OK. Hiçbiri diğerine indirgenmez.
 *   - **Doğrulanmış kapanış kanıtı olmadan `alreadyClosed`/`ok:true` VERİLMEZ.** `NO_ROLLBACK`/CORRUPT/UNREADABLE/
 *     MISMATCH → `ok:false` + **wroteNothing** (DB'ye yazılmaz, mevcut yedek KORUNUR — üzerine yazılmaz, silinmez).
 *   - `alreadyClosed` yalnız rollback'te `closedAt` VARSA **ve aynı çağrıda 3-alan yeniden doğrulanırsa** true olur.
 *   - open: YABANCI (farklı tenant) veya CORRUPT/UNREADABLE yedeği **ÜZERİNE YAZMAZ** → reddeder (yedek korunur).
 *   - Aynı koşumun ikinci open (özgün-koruma) ve ikinci close (idempotent doğrulanmış) davranışı korunur.
 *
 * KULLANIM:  node i12-window.js <open|close|status> <tenantId>
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const SMTP_PORT = Number(process.env.I3_SMTP_PORT || 2529);
const ROLLBACK = process.env.I12_WINDOW_ROLLBACK || path.join(process.env.I12_WORK_DIR || process.cwd(), 'i12-window-rollback.json');
const WINDOW_FIELDS = ['smtpHost', 'smtpPort', 'smtpSecure'];
const pickWin = (o) => o ? WINDOW_FIELDS.reduce((a, k) => (a[k] = o[k] ?? null, a), {}) : null;
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16).toUpperCase();

// Rollback dosyasını AYRI durumlara sınıflar — yok/okunamaz/bozuk/geçerli birbirine karışmaz.
function classifyRb() {
  let raw;
  try { raw = fs.readFileSync(ROLLBACK, 'utf8'); }
  catch (e) { return e && e.code === 'ENOENT' ? { status: 'ABSENT' } : { status: 'UNREADABLE', error: (e && e.code) || String(e) }; }
  let rb;
  try { rb = JSON.parse(raw); } catch (e) { return { status: 'CORRUPT', error: 'json-parse' }; }
  const shapeOk = rb && rb.record === 'I12-WINDOW-ROLLBACK' && typeof rb.tenantId === 'string'
    && typeof rb.existed === 'boolean' && (rb.existed ? (rb.original && typeof rb.original.smtpHost !== 'undefined') : true);
  if (!shapeOk) return { status: 'CORRUPT', error: 'shape' };
  return { status: 'OK', rb };
}

async function othersFingerprint(prisma, tenantId) {
  const rows = await prisma.office.findMany({ where: { NOT: { tenantId } }, select: { tenantId: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpSecure: true, smtpFromName: true, smtpFromEmail: true }, orderBy: { tenantId: 'asc' } });
  return sha(JSON.stringify(rows));
}

async function runWindow(prisma, cmd, tenantId) {
  const current = await prisma.office.findUnique({ where: { tenantId } });
  if (cmd === 'status') {
    const cls = classifyRb();
    return { record: 'I12-WINDOW-STATUS', tenantId, windowFields: pickWin(current), hasRow: !!current, rollbackStatus: cls.status, rollbackTenant: cls.rb ? cls.rb.tenantId : null, closedAt: cls.rb ? (cls.rb.closedAt || null) : null };
  }
  if (cmd === 'open') {
    const othersBefore = await othersFingerprint(prisma, tenantId);
    const cls = classifyRb();
    // Mevcut yedeği ÜZERİNE YAZMA riski olan durumlar → reddet (yedek korunur, DB'ye yazılmaz).
    if (cls.status === 'UNREADABLE') return { record: 'I12-WINDOW-OPEN', tenantId, ok: false, reason: 'ROLLBACK_UNREADABLE', wroteNothing: true, error: cls.error };
    if (cls.status === 'CORRUPT') return { record: 'I12-WINDOW-OPEN', tenantId, ok: false, reason: 'ROLLBACK_CORRUPT', wroteNothing: true, error: cls.error };
    if (cls.status === 'OK' && cls.rb.tenantId !== tenantId) return { record: 'I12-WINDOW-OPEN', tenantId, ok: false, reason: 'FOREIGN_ROLLBACK', rollbackTenant: cls.rb.tenantId, wroteNothing: true };
    const reopen = cls.status === 'OK' && cls.rb.tenantId === tenantId;
    if (!reopen) { // ABSENT → taze yedek yaz; reopen → ÖZGÜN yedek KORUNUR (yazılmaz)
      fs.writeFileSync(ROLLBACK, JSON.stringify({ record: 'I12-WINDOW-ROLLBACK', tenantId, existed: !!current, original: pickWin(current), othersBefore, openedAt: new Date().toISOString(), secretsPreserved: true }, null, 1), 'utf8');
    }
    if (current) await prisma.office.update({ where: { tenantId }, data: { smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpSecure: false } });
    else await prisma.office.create({ data: { tenantId, name: 'İ12 Pencere Bürosu', smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpSecure: false } });
    const after = await prisma.office.findUnique({ where: { tenantId } });
    const othersAfter = await othersFingerprint(prisma, tenantId);
    const rbNow = classifyRb().rb;
    const secretsUntouched = !current || (after.smtpUser === current.smtpUser && after.smtpPass === current.smtpPass);
    const originalIsSink = !!(rbNow && rbNow.original && rbNow.original.smtpHost === '127.0.0.1');
    const originalPreserved = !originalIsSink;
    const ok = after.smtpHost === '127.0.0.1' && after.smtpPort === SMTP_PORT && othersAfter === othersBefore && secretsUntouched && originalPreserved;
    return { record: 'I12-WINDOW-OPEN', tenantId, reopen, windowFields: pickWin(after), rollbackOriginal: rbNow ? rbNow.original : null, originalPreserved, othersUnchanged: othersAfter === othersBefore, secretsUntouched, ok, rollback: ROLLBACK };
  }
  if (cmd === 'close') {
    const cls = classifyRb();
    // Her hata durumu AYRI; hiçbiri "doğrulanmış kapanış" SAYILMAZ. DB'ye YAZILMAZ, yedek KORUNUR.
    if (cls.status === 'ABSENT') return { record: 'I12-WINDOW-CLOSE', tenantId, ok: false, reason: 'NO_ROLLBACK', verifiedClosed: false, wroteNothing: true, note: 'yedek yok — doğrulanmış kapanış kanıtı YOK; alreadyClosed/PASS VERİLMEZ' };
    if (cls.status === 'UNREADABLE') return { record: 'I12-WINDOW-CLOSE', tenantId, ok: false, reason: 'ROLLBACK_UNREADABLE', verifiedClosed: false, wroteNothing: true, error: cls.error };
    if (cls.status === 'CORRUPT') return { record: 'I12-WINDOW-CLOSE', tenantId, ok: false, reason: 'ROLLBACK_CORRUPT', verifiedClosed: false, wroteNothing: true, error: cls.error };
    const rb = cls.rb;
    if (rb.tenantId !== tenantId) return { record: 'I12-WINDOW-CLOSE', tenantId, ok: false, reason: 'ROLLBACK_TENANT_MISMATCH', rollbackTenant: rb.tenantId, verifiedClosed: false, wroteNothing: true };
    const before = await prisma.office.findUnique({ where: { tenantId } });
    const othersBefore = await othersFingerprint(prisma, tenantId);
    if (rb.existed) await prisma.office.updateMany({ where: { tenantId }, data: { smtpHost: rb.original.smtpHost, smtpPort: rb.original.smtpPort, smtpSecure: rb.original.smtpSecure } });
    else await prisma.office.deleteMany({ where: { tenantId } });
    const after = await prisma.office.findUnique({ where: { tenantId } });
    const othersAfter = await othersFingerprint(prisma, tenantId);
    const three = rb.existed
      ? { host: !!after && after.smtpHost === (rb.original.smtpHost ?? null), port: !!after && after.smtpPort === (rb.original.smtpPort ?? null), secure: !!after && after.smtpSecure === (rb.original.smtpSecure ?? null) }
      : { host: after === null, port: after === null, secure: after === null };
    const fieldsRestored = three.host && three.port && three.secure;
    const secretsUntouched = !rb.existed || !before || (after && after.smtpUser === before.smtpUser && after.smtpPass === before.smtpPass);
    const ok = fieldsRestored && othersAfter === othersBefore && secretsUntouched; // DOĞRULANMIŞ kapanış
    // alreadyClosed yalnız closedAt VARSA + bu çağrıda 3-alan yeniden doğrulandıysa anlamlı.
    const alreadyClosed = !!rb.closedAt && ok;
    if (ok && !rb.closedAt) { rb.closedAt = new Date().toISOString(); try { fs.writeFileSync(ROLLBACK, JSON.stringify(rb, null, 1), 'utf8'); } catch (e) {} }
    return { record: 'I12-WINDOW-CLOSE', tenantId, restoredWindowFields: rb.existed ? rb.original : null, threeFieldVerify: three, fieldsRestored, deletedCreatedRow: !rb.existed, othersUnchanged: othersAfter === othersBefore, secretsUntouched, verifiedClosed: ok, alreadyClosed, ok };
  }
  throw new Error(`bilinmeyen komut: ${cmd}`);
}

if (require.main === module) {
  (async () => {
    const cmd = (process.argv[2] || '').toLowerCase();
    const tenantId = process.argv[3];
    if (!['open', 'close', 'status'].includes(cmd) || !tenantId) { console.error('KULLANIM: node i12-window.js <open|close|status> <tenantId>'); process.exit(2); }
    L.AH.assertDisposableEnvironment(); // G-0 — KALDIRILMAZ
    const prisma = L.AH.loadPrisma();
    try { const r = await runWindow(prisma, cmd, tenantId); console.log(JSON.stringify(r, null, 1)); if (r.ok === false) process.exitCode = 1; }
    catch (e) { console.error(`DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
    finally { await prisma.$disconnect().catch(() => {}); }
  })();
}
module.exports = { runWindow, WINDOW_FIELDS, othersFingerprint, classifyRb };
