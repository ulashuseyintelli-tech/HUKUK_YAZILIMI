/*
 * OFFICE PERSONEL DAVETI — ERISIM KAPATMA / KURTARMA (YALNIZ runId ILE; durum dosyasi GEREKMEZ)
 *
 * NE YAPAR (yalniz `inv-<runId>` tenant'inda):
 *   1) aktif User satirlari: isActive=false + tokenVersion++   -> giris 401, dagitilmis JWT'ler gecersiz
 *   2) kullanilmamis UserInvite satirlari: revokedAt=now        -> bekleyen davet KALMAZ
 * NE YAPMAZ: silme yok; audit ve gecmis satirlar DEGISTIRILMEZ. Gercek hesaplara DOKUNMAZ (G-1/G-2).
 * TEKRAR GUVENLIDIR: ikinci kosum 0 satir gunceller ve yine ok:true doner.
 *
 * KULLANIM: INV_RUN_ID=<8 hex> node inv-99-close.js   (G-0 ortam degiskenleri gerekir)
 */
'use strict';
const L = require('./inv-lib');
const { closeAccess } = require('./inv-run');

(async () => {
  const env = L.assertRunEnvironment();
  const runId = L.requireEnv('INV_RUN_ID');
  if (!/^[0-9a-f]{8}$/.test(runId)) throw new L.GateError('INV_RUN_ID bicimi gecersiz (8 hex)');
  const prisma = L.loadPrisma();
  try {
    const r = await closeAccess(prisma, runId, null);
    const out = { record: 'OFFICE-INVITE-CLOSE', environment: env, runId, slug: `${L.TENANT_PREFIX}${runId}`, ...r, atUtc: new Date().toISOString() };
    const file = process.env.INV_RESULT_FILE;
    if (file) L.writeJsonNoSecrets(file, out, []);
    L.log(JSON.stringify(out, null, 1));
    process.exitCode = r.ok ? 0 : 3;
  } finally {
    await prisma.$disconnect();
  }
})();
