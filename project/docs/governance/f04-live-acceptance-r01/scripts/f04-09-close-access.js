/*
 * F04 CANLI KABUL — ADIM 9: ERISIM SONLANDIRMA (YALNIZ `runId` ILE)
 *
 * NEDEN AYRI BIR ADIM: `f04-04-teardown.js` DURUM DOSYASINA baglidir. Kurulum COMMIT edilip
 * surec hemen sonrasinda dusrse (EXPECTED hatasi → exit 1) veya ZORLA SONLANDIRILIRSA
 * (spawnSync timeout → exit 124, SIGKILL) durum dosyasi hic yazilmamis olabilir ve o yol
 * hesabi ACIK BIRAKIR (paket §11 Kusur B).
 *
 * Bu adim TEK GIRDI olarak `runId` ister. `runId` YAZMADAN ONCE belirlenir (f04-run.js) ve
 * tenant slug'ina GOMULUDUR (`f04-acc-<runId>`), bu yuzden hangi hata yolundan gecilirse
 * gecilsin alan bulunabilir. SIR ICERMEZ; parola GEREKMEZ.
 *
 * DAVRANIS:
 *   alan YOK   → yazma 0, `fieldExists:false`, exit 0. Bu bir OLCUMDUR, varsayim degildir.
 *   alan VAR   → yalniz BU tenant'in kullanicilari: `isActive=false` + `tokenVersion++`.
 *                Finansal/audit kayitlarina DOKUNULMAZ.
 *   TEKRAR     → ikinci cagri `deactivated:0` doner, kapali durum bozulmaz, exit 0.
 *   EKSIK      → kapanmadiysa VEYA kanit korunmasi OLCULEMEDIYSE exit 2 (basari SAYILMAZ).
 *
 * KULLANIM
 *   F04_RUN_ID=<8hex> F04_DATABASE_URL=... node f04-09-close-access.js
 */
'use strict';
const L = require('./f04-lib');

(async () => {
  const runId = L.requireEnv('F04_RUN_ID').toLowerCase();
  const prisma = L.loadPrisma();
  try {
    const field = await L.findAcceptanceField(prisma, runId); // G-1 iceride

    if (!field.exists) {
      // Kurulum hic COMMIT edilmemis (atomik transaction) → kapatilacak hesap YOK.
      // Bu sonuc ARANARAK bulundu; cikis kodundan CIKARILMADI.
      L.step('C', `alan YOK — '${field.slug}' tenant'i bulunamadi; kapatilacak hesap yok`);
      console.log(JSON.stringify({
        record: 'F04-ACCESS-CLOSE', runId, slug: field.slug,
        fieldExists: false, writeOperations: 0,
        verdict: 'ALAN YOK - kurulum commit edilmemis (olculdu, varsayilmadi)',
      }, null, 1));
      return;
    }

    L.step('C', `alan VAR — tenant '${field.slug}' · kullanici ${field.users.length}`
      + ` (aktif ${field.activeUsers}) · erisim sonlandiriliyor`);

    const r = await L.revokeTenantAccess(prisma, field.tenantId);

    L.log(`      devre disi birakilan: ${r.deactivated} · hala aktif: ${r.stillActive}`
      + ` · tokenVersion artan: ${r.tokenVersionBumped}`
      + (r.alreadyClosed ? ' · (ZATEN KAPALIYDI — tekrar guvenli)' : ''));
    L.log(`      kanit korundu: ${r.evidencePreserved}`
      + (r.evidenceNotMeasurable.length ? ` (olculemeyen: ${r.evidenceNotMeasurable.join(', ')})` : ''));

    console.log(JSON.stringify({
      record: 'F04-ACCESS-CLOSE', runId, slug: field.slug, fieldExists: true,
      usersTotal: r.userCount, usersDeactivated: r.deactivated, stillActive: r.stillActive,
      tokenVersionBumped: r.tokenVersionBumped, alreadyClosed: r.alreadyClosed,
      accessClosed: r.accessClosed, evidencePreserved: r.evidencePreserved,
      evidenceChanged: r.evidenceChanged, evidenceNotMeasurable: r.evidenceNotMeasurable,
      financialAuditCounts: r.financialAuditCounts, verdict: r.verdict,
    }, null, 1));

    if (!(r.accessClosed && r.evidencePreserved)) process.exitCode = 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => {
  console.error('\nERISIM SONLANDIRMA HATASI:', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
