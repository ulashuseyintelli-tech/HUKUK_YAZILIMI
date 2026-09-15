/*
 * İ12 — PROVA (disposable) Office SMTP penceresi · SIR-KORUYUCU · rollback + kurtarma
 *
 * Bu betik DISPOSABLE prova içindir: `assertDisposableEnvironment` (G-0) KALDIRILMAZ → yalnız disposable
 * DB'de koşar. **CANLI DEĞİLDİR**; canlı için AYRI giriş noktası `i12-live-window.js` kullanılır (G-0 owner
 * yetkisiyle "aşılmaz" — canlı yol ayrı betiktir). Bu betik, pencere mantığının izole ortamda doğrulanan
 * referans uygulamasıdır ve `i12-live-window.js` ile AYNI sır-koruyucu davranışı taşır.
 *
 * SIR-KORUYUCU: statement teslim yolu (getFullSmtpSettings) SMTP'yi tenant Office satırından okur. Pencere
 * YALNIZCA sırsız alanları — `smtpHost`, `smtpPort`, `smtpSecure` — sink'e çevirir; **`smtpUser`/`smtpPass`
 * (SIR) OKUNMAZ, YAZILMAZ, ROLLBACK DOSYASINA KONMAZ**. Sink (i3-sink) EHLO'da AUTH ilan ETMEZ → nodemailer
 * AUTH göndermez → gerçek kimlik bilgileri sink'e HİÇ iletilmez. Rollback yalnız {smtpHost,smtpPort,smtpSecure}.
 *
 * KULLANIM:  node i12-window.js <open|close|status> <tenantId>
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const SMTP_PORT = Number(process.env.I3_SMTP_PORT || 2529);
const ROLLBACK = process.env.I12_WINDOW_ROLLBACK || path.join(process.env.I12_WORK_DIR || process.cwd(), 'i12-window-rollback.json');
// YALNIZ sırsız alanlar pencere kapsamındadır. smtpUser/smtpPass BİLEREK DIŞARIDA.
const WINDOW_FIELDS = ['smtpHost', 'smtpPort', 'smtpSecure'];
const pickWin = (o) => o ? WINDOW_FIELDS.reduce((a, k) => (a[k] = o[k] ?? null, a), {}) : null;
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16).toUpperCase();

// Hedef DIŞINDAKİ Office satırlarının TÜM SMTP alanlarının (sırlar dahil) parmak izi — pencerenin başka
// tenant'a dokunmadığını kanıtlar. Parmak izi sha256'dır (sır DEĞERİ ifşa olmaz), yalnız değişmezlik kanıtı.
async function othersFingerprint(prisma, tenantId) {
  const rows = await prisma.office.findMany({ where: { NOT: { tenantId } }, select: { tenantId: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpSecure: true, smtpFromName: true, smtpFromEmail: true }, orderBy: { tenantId: 'asc' } });
  return sha(JSON.stringify(rows));
}

async function runWindow(prisma, cmd, tenantId, { assertDisposable = true } = {}) {
  const current = await prisma.office.findUnique({ where: { tenantId } });
  if (cmd === 'status') {
    return { record: 'I12-WINDOW-STATUS', tenantId, windowFields: pickWin(current), hasRow: !!current };
  }
  if (cmd === 'open') {
    const othersBefore = await othersFingerprint(prisma, tenantId);
    // Rollback YALNIZ sırsız alanları taşır (var mıydı + host/port/secure). SIR yazılmaz.
    fs.writeFileSync(ROLLBACK, JSON.stringify({ record: 'I12-WINDOW-ROLLBACK', tenantId, existed: !!current, original: pickWin(current), othersBefore, openedAt: new Date().toISOString(), secretsPreserved: true }, null, 1), 'utf8');
    if (current) {
      // Mevcut satır: YALNIZ host/port/secure güncellenir; user/pass/from DOKUNULMAZ.
      await prisma.office.update({ where: { tenantId }, data: { smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpSecure: false } });
    } else {
      // Satır yok: sırsız minimal satır oluşturulur (name zorunlu; user/pass NULL bırakılır).
      await prisma.office.create({ data: { tenantId, name: 'İ12 Pencere Bürosu', smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpSecure: false } });
    }
    const after = await prisma.office.findUnique({ where: { tenantId } });
    const othersAfter = await othersFingerprint(prisma, tenantId);
    // Sır-koruma doğrulaması: mevcut satırda user/pass DEĞİŞMEDİ.
    const secretsUntouched = !current || (after.smtpUser === current.smtpUser && after.smtpPass === current.smtpPass);
    const ok = after.smtpHost === '127.0.0.1' && after.smtpPort === SMTP_PORT && othersAfter === othersBefore && secretsUntouched;
    return { record: 'I12-WINDOW-OPEN', tenantId, windowFields: pickWin(after), othersUnchanged: othersAfter === othersBefore, secretsUntouched, ok, rollback: ROLLBACK };
  }
  if (cmd === 'close') {
    const rb = JSON.parse(fs.readFileSync(ROLLBACK, 'utf8'));
    if (rb.tenantId !== tenantId) throw new Error(`rollback tenantId uyuşmuyor: ${rb.tenantId} != ${tenantId}`);
    const before = await prisma.office.findUnique({ where: { tenantId } });
    const othersBefore = await othersFingerprint(prisma, tenantId);
    if (rb.existed) {
      // YALNIZ sırsız alanlar geri yüklenir; user/pass zaten hiç değişmedi (dokunulmuyor).
      await prisma.office.update({ where: { tenantId }, data: { smtpHost: rb.original.smtpHost, smtpPort: rb.original.smtpPort, smtpSecure: rb.original.smtpSecure } });
    } else {
      await prisma.office.delete({ where: { tenantId } });
    }
    const after = await prisma.office.findUnique({ where: { tenantId } });
    const othersAfter = await othersFingerprint(prisma, tenantId);
    const restored = rb.existed ? (after && after.smtpHost === (rb.original.smtpHost ?? null) && after.smtpPort === (rb.original.smtpPort ?? null)) : (after === null);
    // Kurtarmada da sır korunur: user/pass close'dan önce/sonra AYNI (varsa).
    const secretsUntouched = !rb.existed || !before || (after.smtpUser === before.smtpUser && after.smtpPass === before.smtpPass);
    const ok = restored && othersAfter === othersBefore && secretsUntouched;
    return { record: 'I12-WINDOW-CLOSE', tenantId, restoredWindowFields: rb.existed ? rb.original : null, deletedCreatedRow: !rb.existed, othersUnchanged: othersAfter === othersBefore, secretsUntouched, ok };
  }
  throw new Error(`bilinmeyen komut: ${cmd}`);
}

if (require.main === module) {
  (async () => {
    const cmd = (process.argv[2] || '').toLowerCase();
    const tenantId = process.argv[3];
    if (!['open', 'close', 'status'].includes(cmd) || !tenantId) { console.error('KULLANIM: node i12-window.js <open|close|status> <tenantId>'); process.exit(2); }
    L.AH.assertDisposableEnvironment(); // G-0 — KALDIRILMAZ (bu betik yalnız disposable prova içindir)
    const prisma = L.AH.loadPrisma();
    try { const r = await runWindow(prisma, cmd, tenantId); console.log(JSON.stringify(r, null, 1)); if (r.ok === false) process.exitCode = 1; }
    catch (e) { console.error(`DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
    finally { await prisma.$disconnect().catch(() => {}); }
  })();
}
module.exports = { runWindow, WINDOW_FIELDS, othersFingerprint };
