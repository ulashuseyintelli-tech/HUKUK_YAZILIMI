/*
 * İ12 — CANLI Office SMTP penceresi · AYRI GİRİŞ NOKTASI · SIR-KORUYUCU · kurtarma/kapanış
 *
 * NEDEN AYRI: Prova betikleri (`i12-window.js`, `i12-*` ölçüm) `assertDisposableEnvironment` (G-0) taşır ve
 * YALNIZ disposable DB'de koşar. **G-0, owner yetkisiyle "aşılmaz".** Canlı yürütme bu betikleri canlıya
 * uyarlamaz; bunun yerine bu AYRI giriş noktası kullanılır — kendi CANLI-GÜVENLİK kapısını taşır (G-0 değil),
 * owner'ın yükseltilmiş komutuyla ve GO'da pinlenen sha ile çalıştırılır.
 *
 * CANLI-GÜVENLİK KAPISI (fail-closed):
 *   - `I12_LIVE_CONFIRM=1` açıkça verilmeli (yoksa REDDEDER — kazara koşumu engeller).
 *   - TEK tenantId zorunlu; işlem yalnız o tenant'a; `othersUnchanged` parmak-iziyle diğerleri kanıtlanır.
 *   - SIR-KORUYUCU: yalnız `smtpHost`/`smtpPort`/`smtpSecure` değişir; `smtpUser`/`smtpPass` OKUNMAZ/YAZILMAZ/
 *     ROLLBACK'e KONMAZ (i3-sink AUTH ilan etmez → gerçek kimlik bilgisi iletilmez). Mantık `i12-window.js`
 *     `runWindow` ile AYNI (tek kaynak; kopya davranış yok).
 *   - Kurtarma: `close` rollback dosyasından idempotent geri-alır (süreç yarıda ölse yeniden koşulur).
 *
 * KULLANIM (owner, yükseltilmiş):  I12_LIVE_CONFIRM=1 node i12-live-window.js <open|close|status> <tenantId>
 * ENV: DATABASE_URL/AH_DATABASE_URL (canlı) · I3_SMTP_PORT (sink) · I12_WINDOW_ROLLBACK (rollback yolu)
 *
 * İZOLE DOĞRULAMA: G-0 taşımadığından disposable DB'ye karşı da koşar (bu paketteki doğrulama böyle yapılır);
 * canlıda hedef = sentetik tenant, DB = canlı, komut owner'ındır.
 */
'use strict';
const path = require('path');
const win = require('./i12-window'); // tek kaynak: runWindow (SIR-KORUYUCU) + othersFingerprint
// loadPrisma'yı ah-lib'den G-0 ÇAĞIRMADAN alırız (canlı yol; disposable zorunluluğu YOK).
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));

(async () => {
  const cmd = (process.argv[2] || '').toLowerCase();
  const tenantId = process.argv[3];
  if (!['open', 'close', 'status'].includes(cmd) || !tenantId) {
    console.error('KULLANIM: I12_LIVE_CONFIRM=1 node i12-live-window.js <open|close|status> <tenantId>'); process.exit(2);
  }
  // CANLI-GÜVENLİK KAPISI — durum sorgusu hariç açık onay şart (fail-closed).
  if (cmd !== 'status' && process.env.I12_LIVE_CONFIRM !== '1') {
    console.error('REDDEDİLDİ: canlı pencere için I12_LIVE_CONFIRM=1 gerekli (kazara koşum kapısı; G-0 aşımı DEĞİL).'); process.exit(3);
  }
  const prisma = L.AH.loadPrisma(); // requireEnv('AH_DATABASE_URL'); G-0 ASSERT YOK (ayrı canlı yol)
  try {
    const r = await win.runWindow(prisma, cmd, tenantId);
    r.entryPoint = 'i12-live-window'; r.liveGate = 'I12_LIVE_CONFIRM';
    console.log(JSON.stringify(r, null, 1));
    if (r.ok === false) process.exitCode = 1;
  } catch (e) { console.error(`DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally { await prisma.$disconnect().catch(() => {}); }
})();
