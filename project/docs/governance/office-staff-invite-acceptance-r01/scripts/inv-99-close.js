/*
 * OFFICE PERSONEL DAVETI — ERISIM KAPATMA / KURTARMA (MAKBUZA BAGLI)
 *
 * YETKI: yalniz "inv- onekli tenant" kosulu YETMEZ. Kurtarma, korunan kosum makbuzundaki
 *   runId + slug + tenantId + adminUserId + invitedUserId + inviteId
 * degerlerini DB ile BIREBIR karsilastirir. Biri tutmazsa HIC YAZMADAN durur (cikis 4).
 * Boylece baska bir sentetik kosumun (ya da elle olusturulmus bir `inv-` tenant'inin) kayitlarina
 * dokunulmaz.
 *
 * NE YAPAR (yalniz makbuzun isaret ettigi tenant'ta):
 *   1) aktif User satirlari: isActive=false + tokenVersion++   -> giris 401, dagitilmis JWT'ler gecersiz
 *   2) kullanilmamis UserInvite satirlari: revokedAt=now        -> bekleyen davet KALMAZ
 * NE YAPMAZ: silme yok; audit ve gecmis satirlar DEGISTIRILMEZ.
 * TEKRAR GUVENLIDIR: ikinci kosum 0 satir gunceller ve yine ok:true doner.
 *
 * KULLANIM: INV_RECEIPT_FILE=<makbuz> node inv-99-close.js      (G-0 ortam degiskenleri gerekir)
 *   INV_RUN_ID verilirse makbuzdaki runId ile AYNI olmalidir (fazladan kapi).
 *
 * CIKIS: 0 kapanis dogrulandi · 3 kapanis TAMAMLANMADI · 4 MAKBUZ/DB UYUSMAZLIGI (yazma YOK)
 */
'use strict';
const L = require('./inv-lib');
const { closeAccess } = require('./inv-run');

(async () => {
  const env = L.assertRunEnvironment();
  const receiptFile = L.requireEnv('INV_RECEIPT_FILE');
  const receipt = L.readReceipt(receiptFile);
  if (process.env.INV_RUN_ID && process.env.INV_RUN_ID !== receipt.runId) {
    console.error(`REDDEDILDI: INV_RUN_ID makbuzla uyusmuyor (${process.env.INV_RUN_ID} != ${receipt.runId}) — YAZMA YOK`);
    process.exitCode = 4;
    return;
  }
  const prisma = L.loadPrisma();
  try {
    let matched;
    try {
      matched = await L.assertReceiptMatchesDb(prisma, receipt);
    } catch (e) {
      console.error(`REDDEDILDI: ${e.message}`);
      process.exitCode = 4;
      return;
    }
    const r = await closeAccess(prisma, receipt.runId, null);
    const out = {
      record: 'OFFICE-INVITE-CLOSE', environment: env, runId: receipt.runId, slug: matched.slug,
      tenantId: matched.tenantId, receiptChecked: matched.checked, ...r, atUtc: new Date().toISOString(),
    };
    const file = process.env.INV_RESULT_FILE;
    if (file) L.writeJsonNoSecrets(file, out, []);
    L.log(JSON.stringify(out, null, 1));
    process.exitCode = r.ok ? 0 : 3;
  } finally {
    await prisma.$disconnect();
  }
})();
