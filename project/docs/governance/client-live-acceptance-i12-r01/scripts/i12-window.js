/*
 * İ12 — PROVA (disposable) Office SMTP penceresi · SIR-KORUYUCU · rollback + kurtarma
 *
 * Bu betik DISPOSABLE prova içindir: `assertDisposableEnvironment` (G-0) KALDIRILMAZ → yalnız disposable
 * DB'de koşar. **CANLI DEĞİLDİR**; canlı için AYRI giriş noktası `i12-live-window.js` kullanılır (G-0 owner
 * yetkisiyle "aşılmaz" — canlı yol ayrı betiktir). Pencere mantığının tek kaynağı burasıdır (`runWindow`);
 * `i12-live-window.js` bunu AYNEN kullanır.
 *
 * SIR-KORUYUCU: statement teslim yolu (getFullSmtpSettings) SMTP'yi tenant Office satırından okur. Pencere
 * YALNIZCA sırsız alanları — `smtpHost`, `smtpPort`, `smtpSecure` — sink'e çevirir; **`smtpUser`/`smtpPass`
 * (SIR) OKUNMAZ, YAZILMAZ, ROLLBACK DOSYASINA KONMAZ**. Sink (i3-sink) EHLO'da AUTH ilan ETMEZ → nodemailer
 * AUTH göndermez → gerçek kimlik bilgileri sink'e HİÇ iletilmez. Rollback yalnız {smtpHost,smtpPort,smtpSecure}.
 *
 * SAĞLAMLIK:
 *   - İKİNCİ open: rollback zaten bu tenant için varsa ÖZGÜN yedek KORUNUR (üzerine YAZILMAZ) → tekrar açış
 *     sink değerlerini "özgün" sanmaz.
 *   - close: değiştirilen ÜÇ alanın (host/port/secure) TAMAMININ geri döndüğü doğrulanır.
 *   - İKİNCİ close: `updateMany`/`deleteMany` (0 satırda hata yok) + rollback yoksa idempotent güvenli sonuç.
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
const readRb = () => { try { return JSON.parse(fs.readFileSync(ROLLBACK, 'utf8')); } catch (e) { return null; } };

// Hedef DIŞINDAKİ Office satırlarının TÜM SMTP alanlarının (sırlar dahil) parmak izi — pencerenin başka
// tenant'a dokunmadığını kanıtlar. Parmak izi sha256'dır (sır DEĞERİ ifşa olmaz), yalnız değişmezlik kanıtı.
async function othersFingerprint(prisma, tenantId) {
  const rows = await prisma.office.findMany({ where: { NOT: { tenantId } }, select: { tenantId: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpSecure: true, smtpFromName: true, smtpFromEmail: true }, orderBy: { tenantId: 'asc' } });
  return sha(JSON.stringify(rows));
}

async function runWindow(prisma, cmd, tenantId) {
  const current = await prisma.office.findUnique({ where: { tenantId } });
  if (cmd === 'status') {
    return { record: 'I12-WINDOW-STATUS', tenantId, windowFields: pickWin(current), hasRow: !!current, rollbackPresent: !!readRb() };
  }
  if (cmd === 'open') {
    const othersBefore = await othersFingerprint(prisma, tenantId);
    const existingRb = readRb();
    // İKİNCİ open KORUMASI: bu tenant için rollback zaten varsa ÖZGÜN yedeği KORU (üzerine yazma).
    const reopen = !!(existingRb && existingRb.tenantId === tenantId);
    if (!reopen) {
      fs.writeFileSync(ROLLBACK, JSON.stringify({ record: 'I12-WINDOW-ROLLBACK', tenantId, existed: !!current, original: pickWin(current), othersBefore, openedAt: new Date().toISOString(), secretsPreserved: true }, null, 1), 'utf8');
    }
    if (current) await prisma.office.update({ where: { tenantId }, data: { smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpSecure: false } });
    else await prisma.office.create({ data: { tenantId, name: 'İ12 Pencere Bürosu', smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpSecure: false } });
    const after = await prisma.office.findUnique({ where: { tenantId } });
    const othersAfter = await othersFingerprint(prisma, tenantId);
    const rbNow = readRb();
    const secretsUntouched = !current || (after.smtpUser === current.smtpUser && after.smtpPass === current.smtpPass);
    // ÖZGÜN yedek sink DEĞİL olmalı (aksi halde gerçek özgün kaybolmuş demektir).
    const originalIsSink = !!(rbNow && rbNow.original && rbNow.original.smtpHost === '127.0.0.1');
    const originalPreserved = !originalIsSink;
    const ok = after.smtpHost === '127.0.0.1' && after.smtpPort === SMTP_PORT && othersAfter === othersBefore && secretsUntouched && originalPreserved;
    return { record: 'I12-WINDOW-OPEN', tenantId, reopen, windowFields: pickWin(after), rollbackOriginal: rbNow ? rbNow.original : null, originalPreserved, othersUnchanged: othersAfter === othersBefore, secretsUntouched, ok, rollback: ROLLBACK };
  }
  if (cmd === 'close') {
    const rb = readRb();
    // İKİNCİ close / rollback yok: idempotent GÜVENLİ sonuç (geri alınacak bir şey yok).
    if (!rb) return { record: 'I12-WINDOW-CLOSE', tenantId, ok: true, alreadyClosed: true, note: 'rollback yok — zaten kapalı (idempotent)' };
    if (rb.tenantId !== tenantId) throw new Error(`rollback tenantId uyuşmuyor: ${rb.tenantId} != ${tenantId}`);
    const before = await prisma.office.findUnique({ where: { tenantId } });
    const othersBefore = await othersFingerprint(prisma, tenantId);
    if (rb.existed) {
      // updateMany: satır yoksa 0 etkiler, HATA vermez (ikinci close güvenli). Sır alanlarına DOKUNMAZ.
      await prisma.office.updateMany({ where: { tenantId }, data: { smtpHost: rb.original.smtpHost, smtpPort: rb.original.smtpPort, smtpSecure: rb.original.smtpSecure } });
    } else {
      // deleteMany: satır yoksa 0 etkiler, HATA vermez (ikinci close güvenli).
      await prisma.office.deleteMany({ where: { tenantId } });
    }
    const after = await prisma.office.findUnique({ where: { tenantId } });
    const othersAfter = await othersFingerprint(prisma, tenantId);
    // ÜÇ ALANIN TAMAMININ geri dönüş doğrulaması (host + port + secure).
    const three = rb.existed
      ? { host: !!after && after.smtpHost === (rb.original.smtpHost ?? null), port: !!after && after.smtpPort === (rb.original.smtpPort ?? null), secure: !!after && after.smtpSecure === (rb.original.smtpSecure ?? null) }
      : { host: after === null, port: after === null, secure: after === null };
    const fieldsRestored = three.host && three.port && three.secure;
    const secretsUntouched = !rb.existed || !before || (after && after.smtpUser === before.smtpUser && after.smtpPass === before.smtpPass);
    const ok = fieldsRestored && othersAfter === othersBefore && secretsUntouched;
    if (ok && !rb.closedAt) { rb.closedAt = new Date().toISOString(); try { fs.writeFileSync(ROLLBACK, JSON.stringify(rb, null, 1), 'utf8'); } catch (e) {} }
    return { record: 'I12-WINDOW-CLOSE', tenantId, restoredWindowFields: rb.existed ? rb.original : null, threeFieldVerify: three, fieldsRestored, deletedCreatedRow: !rb.existed, othersUnchanged: othersAfter === othersBefore, secretsUntouched, ok, alreadyClosed: !!rb.closedAt };
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
