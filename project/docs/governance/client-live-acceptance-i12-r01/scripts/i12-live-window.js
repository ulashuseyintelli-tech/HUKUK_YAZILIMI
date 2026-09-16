/*
 * İ12 — CANLI Office SMTP penceresi · AYRI GİRİŞ NOKTASI · SIR-KORUYUCU · kurtarma/kapanış
 *
 * NEDEN AYRI: Prova betikleri (`i12-window.js`, `i12-*` ölçüm) `assertDisposableEnvironment` (G-0) taşır ve
 * YALNIZ disposable DB'de koşar. **G-0, owner yetkisiyle "aşılmaz".** Canlı yürütme bu betikleri canlıya
 * uyarlamaz; bunun yerine bu AYRI giriş noktası kullanılır — kendi CANLI-GÜVENLİK kapılarını taşır (G-0 değil),
 * owner'ın yükseltilmiş komutuyla ve GO'da pinlenen sha ile çalıştırılır. Pencere mantığı tek kaynak
 * (`i12-window.js` `runWindow`) — sır-koruyucu, ikinci-open özgün-koruma, ikinci-close güvenli, 3-alan doğrulama.
 *
 * CANLI-GÜVENLİK KAPILARI (fail-closed; open/close için — status salt-okuma):
 *   1. `I12_LIVE_CONFIRM=1` — açık onay (kazara koşum kapısı). Yoksa REDDEDER (exit 3).
 *   2. `I12_LIVE_GO_REF` — owner GO referansı DOLU olmalı (yetkilendirme kanıtı). Yoksa REDDEDER (exit 3).
 *      (Gerçek biçimli ref repoya YAZILMAZ; betik yalnız verildiğini doğrular, kanıtta ham görünmez.)
 *   3. BEKLENEN DB KİMLİĞİ — `I12_EXPECT_DB` bağlantı URL'sindeki DB adıyla eşleşmeli; eşleşmezse REDDEDER (exit 4).
 *      `I12_EXPECT_API` DOLU olmalı (canlı API kimliği beyanı; API↔DB bağı ölçüm adımında verifyApiBoundToSameDatabase).
 *   4. KOŞUMA AİT SENTETİK TENANT SINIRI — hedef tenant'ın `slug`'ı `I12_EXPECT_TENANT_SLUG` ile eşleşmeli;
 *      eşleşmezse (YANLIŞ HEDEF) REDDEDER (exit 4). Gerçek/rastgele tenant'a pencere açılması engellenir.
 *   5. SIR-KORUYUCU + TEK tenant + `othersUnchanged` (runWindow'dan).
 *
 * KULLANIM (owner, yükseltilmiş):
 *   I12_LIVE_CONFIRM=1 I12_LIVE_GO_REF=<owner-GO-ref> I12_EXPECT_DB=<db> I12_EXPECT_API=<url> \
 *   I12_EXPECT_TENANT_SLUG=<sentetik-slug> node i12-live-window.js <open|close|status> <tenantId>
 * ENV ayrıca: DATABASE_URL/AH_DATABASE_URL · I3_SMTP_PORT · I12_WINDOW_ROLLBACK
 *
 * İZOLE DOĞRULAMA: G-0 taşımadığından disposable DB'ye karşı da koşar (bu paketteki doğrulama böyle yapılır;
 * yanlış hedef reddi + ikinci open/close burada ölçülür); canlıda hedef = sentetik tenant, DB = canlı, komut owner'ın.
 */
'use strict';
const path = require('path');
const win = require('./i12-window'); // tek kaynak: runWindow (SIR-KORUYUCU) + othersFingerprint
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));

function dbNameFromUrl(u) { try { return decodeURIComponent(new URL(u).pathname.replace(/^\//, '').split('/')[0]); } catch (e) { return null; } }

(async () => {
  const cmd = (process.argv[2] || '').toLowerCase();
  const tenantId = process.argv[3];
  if (!['open', 'close', 'status'].includes(cmd) || !tenantId) {
    console.error('KULLANIM: I12_LIVE_CONFIRM=1 I12_LIVE_GO_REF=<ref> I12_EXPECT_DB=<db> I12_EXPECT_API=<url> I12_EXPECT_TENANT_SLUG=<slug> node i12-live-window.js <open|close|status> <tenantId>'); process.exit(2);
  }
  const mutating = cmd !== 'status';
  // KAPI-1/2: açık onay + GO referansı (yalnız durum-değiştiren komutlar).
  if (mutating && process.env.I12_LIVE_CONFIRM !== '1') { console.error('REDDEDİLDİ: I12_LIVE_CONFIRM=1 gerekli (G-0 aşımı DEĞİL).'); process.exit(3); }
  if (mutating && !(process.env.I12_LIVE_GO_REF && process.env.I12_LIVE_GO_REF.trim())) { console.error('REDDEDİLDİ: I12_LIVE_GO_REF (owner GO referansı) DOLU olmalı.'); process.exit(3); }

  const dbUrl = process.env.AH_DATABASE_URL || process.env.DATABASE_URL || '';
  const dbName = dbNameFromUrl(dbUrl);
  // KAPI-3: beklenen DB kimliği (mutating). API kimliği beyanı DOLU olmalı.
  if (mutating) {
    if (!process.env.I12_EXPECT_DB || process.env.I12_EXPECT_DB !== dbName) { console.error(`REDDEDİLDİ: beklenen DB kimliği uyuşmuyor (I12_EXPECT_DB='${process.env.I12_EXPECT_DB || ''}' != bağlı DB='${dbName || ''}').`); process.exit(4); }
    if (!(process.env.I12_EXPECT_API && process.env.I12_EXPECT_API.trim())) { console.error('REDDEDİLDİ: I12_EXPECT_API (canlı API kimliği beyanı) DOLU olmalı.'); process.exit(4); }
  }

  const prisma = L.AH.loadPrisma(); // requireEnv('AH_DATABASE_URL'); G-0 ASSERT YOK (ayrı canlı yol)
  try {
    // KAPI-4: koşuma ait sentetik tenant sınırı — hedef slug beklenenle eşleşmeli (YANLIŞ HEDEF reddi).
    if (mutating) {
      const expectSlug = process.env.I12_EXPECT_TENANT_SLUG;
      if (!expectSlug) { console.error('REDDEDİLDİ: I12_EXPECT_TENANT_SLUG (sentetik tenant sınırı) gerekli.'); process.exitCode = 4; return; }
      const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
      if (!t) { console.error(`REDDEDİLDİ: tenant bulunamadı (${tenantId}).`); process.exitCode = 4; return; }
      if (t.slug !== expectSlug) { console.error(`REDDEDİLDİ: YANLIŞ HEDEF — tenant slug '${t.slug}' beklenen '${expectSlug}' ile eşleşmiyor.`); process.exitCode = 4; return; }
    }
    const r = await win.runWindow(prisma, cmd, tenantId);
    r.entryPoint = 'i12-live-window'; r.liveGates = ['I12_LIVE_CONFIRM', 'I12_LIVE_GO_REF', 'I12_EXPECT_DB', 'I12_EXPECT_API', 'I12_EXPECT_TENANT_SLUG'];
    r.goRefProvided = !!(process.env.I12_LIVE_GO_REF && process.env.I12_LIVE_GO_REF.trim()); // ham ref YAZILMAZ
    r.dbIdentityOk = !mutating || process.env.I12_EXPECT_DB === dbName;
    console.log(JSON.stringify(r, null, 1));
    if (r.ok === false) process.exitCode = 1;
  } catch (e) { console.error(`DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally { await prisma.$disconnect().catch(() => {}); }
})();
