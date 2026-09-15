/*
 * İ12 — CANLI KABUL PENCERESİ: Office SMTP yönlendirme + rollback + kurtarma (İ11 T-PENCERE deseni)
 *
 * Statement (G7) teslim yolu SMTP'yi ENV'den DEĞİL, tenant'ın Office satırından okur
 * (getFullSmtpSettings / Büro Ayarları > E-posta). Bu betik YALNIZ verilen (sentetik hedef) tenant'ın
 * Office SMTP alanlarını loopback sink'e yönlendirir; başka HİÇBİR tenant'a dokunmaz; özgün değerleri
 * rollback dosyasına yazar (kurtarma ayrı giriş noktası — süreç yarıda ölürse `close` yeniden koşulur).
 *
 * Env-tabanlı yollar (G1/G2 + FD: email-provider.service) pencerede AYRI ele alınır: SMTP_HOST/PORT +
 * EMAIL_PROVIDER + i3-spy sayacı API'nin AÇILIŞ komutuyla verilir (bu betik ENV'e dokunmaz). Restart
 * bütçesi/komut sırası §7'de.
 *
 * KULLANIM:  node i12-window.js <open|close|status> <tenantId>
 * ENV: AH_DATABASE_URL (G-0 disposable zorunlu) · I3_SMTP_PORT (sink) · I12_WINDOW_ROLLBACK (rollback yolu)
 *
 * GÜVENLİK: `assertDisposableEnvironment` (G-0) KALDIRILMAZ — betik yalnız disposable DB'de koşar.
 *   Canlı kullanımda owner'ın yükseltilmiş T-PENCERE komutuyla, canlı hedef sentetik tenant'a karşı,
 *   G-0 owner otoritesiyle çalıştırılır (bu repо kopyası canlıya UYARLANMAZ; sha GO'da pinlenir).
 */
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const SMTP_PORT = Number(process.env.I3_SMTP_PORT || 2529);
const ROLLBACK = process.env.I12_WINDOW_ROLLBACK || path.join(process.env.I12_WORK_DIR || process.cwd(), 'i12-window-rollback.json');
const SMTP_FIELDS = ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPass', 'smtpSecure', 'smtpFromName', 'smtpFromEmail'];
const pick = (o) => o ? SMTP_FIELDS.reduce((a, k) => (a[k] = o[k] ?? null, a), {}) : null;
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16).toUpperCase();

// Hedef DIŞINDAKİ tüm Office satırlarının SMTP alanlarının parmak izi — pencere işleminin
// yalnız hedefi değiştirdiğini kanıtlar (hedef-dışı ayar değişimi = güvenlik ihlali).
async function othersFingerprint(prisma, tenantId) {
  const rows = await prisma.office.findMany({ where: { NOT: { tenantId } }, select: { tenantId: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpSecure: true, smtpFromName: true, smtpFromEmail: true }, orderBy: { tenantId: 'asc' } });
  return sha(JSON.stringify(rows));
}

(async () => {
  const cmd = (process.argv[2] || '').toLowerCase();
  const tenantId = process.argv[3];
  if (!['open', 'close', 'status'].includes(cmd) || !tenantId) {
    console.error('KULLANIM: node i12-window.js <open|close|status> <tenantId>'); process.exit(2);
  }
  L.AH.assertDisposableEnvironment(); // G-0 — KALDIRILMAZ
  const prisma = L.AH.loadPrisma();
  try {
    const current = await prisma.office.findUnique({ where: { tenantId } });
    if (cmd === 'status') {
      console.log(JSON.stringify({ record: 'I12-WINDOW-STATUS', tenantId, office: pick(current) }, null, 1));
    } else if (cmd === 'open') {
      const othersBefore = await othersFingerprint(prisma, tenantId);
      // Özgün değeri (satır yoksa null) rollback'e yaz — kurtarma bundan yapılır.
      fs.writeFileSync(ROLLBACK, JSON.stringify({ record: 'I12-WINDOW-ROLLBACK', tenantId, existed: !!current, original: pick(current), othersBefore, openedAt: new Date().toISOString() }, null, 1), 'utf8');
      const sink = { name: current ? current.name : 'İ12 Pencere Bürosu', smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, smtpUser: 'i12-window@ah.invalid', smtpPass: 'x', smtpSecure: false, smtpFromName: 'İ12 Window', smtpFromEmail: 'noreply@ah-harness.invalid' };
      await prisma.office.upsert({ where: { tenantId }, update: sink, create: { tenantId, ...sink } });
      const after = await prisma.office.findUnique({ where: { tenantId } });
      const othersAfter = await othersFingerprint(prisma, tenantId);
      const ok = after.smtpHost === '127.0.0.1' && after.smtpPort === SMTP_PORT && othersAfter === othersBefore;
      console.log(JSON.stringify({ record: 'I12-WINDOW-OPEN', tenantId, target: pick(after), othersUnchanged: othersAfter === othersBefore, ok, rollback: ROLLBACK }, null, 1));
      if (!ok) process.exit(1);
    } else if (cmd === 'close') {
      const rb = JSON.parse(fs.readFileSync(ROLLBACK, 'utf8'));
      if (rb.tenantId !== tenantId) throw new Error(`rollback tenantId uyuşmuyor: ${rb.tenantId} != ${tenantId}`);
      const othersBefore = await othersFingerprint(prisma, tenantId);
      if (rb.existed) {
        await prisma.office.update({ where: { tenantId }, data: rb.original });
      } else {
        // Pencere öncesi Office satırı YOKTU → oluşturulan satır silinir (özgün duruma dön).
        await prisma.office.delete({ where: { tenantId } });
      }
      const after = await prisma.office.findUnique({ where: { tenantId } });
      const othersAfter = await othersFingerprint(prisma, tenantId);
      const restored = rb.existed ? (after && after.smtpHost === (rb.original.smtpHost ?? null)) : (after === null);
      const ok = restored && othersAfter === othersBefore;
      console.log(JSON.stringify({ record: 'I12-WINDOW-CLOSE', tenantId, restoredTo: rb.existed ? rb.original : null, deletedCreatedRow: !rb.existed, othersUnchanged: othersAfter === othersBefore, ok }, null, 1));
      if (!ok) process.exit(1);
    }
  } catch (e) { console.error(`DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally { await prisma.$disconnect().catch(() => {}); }
})();
