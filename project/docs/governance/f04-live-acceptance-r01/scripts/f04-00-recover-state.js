/*
 * F04 CANLI KABUL — ADIM 0: DURUM DOSYASI KURTARMA (SALT-OKUMA)
 *
 * 01-setup COMMIT edildikten sonra durum dosyasi yazilamadiysa kullanilir. Yalniz SELECT yapar;
 * hicbir kayit olusturmaz/degistirmez/silmez.
 *
 * Kosum kimligi SIR ICERMEZ: tenant slug'i `f04-acc-<runId>` seklindedir, runId 8 hex'tir.
 *   F04_RUN_ID=<runId> F04_STATE_FILE=<yol> node f04-00-recover-state.js
 *
 * Parola kurtarilamaz ve kurtarilmamalidir — durum dosyasinda hicbir zaman saklanmaz.
 * Kurulum ciktisindaki `F04_LOGIN_PASSWORD` degeri kaybedildiyse tenant purge edilip
 * (owner onayiyla) kosum bastan yapilir.
 */
'use strict';
const L = require('./f04-lib');

(async () => {
  const runId = L.requireEnv('F04_RUN_ID').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) throw new Error(`gecersiz F04_RUN_ID='${runId}' (8 hex bekleniyor)`);

  const prisma = L.loadPrisma();
  try {
    const state = await L.recoverState(prisma, runId);
    await L.assertOwnTenant(prisma, state.tenantId); // G-2

    const missing = ['userId', 'clientId', 'caseId', 'caseClientId', 'collectionId',
      'expenseRequestId', 'approvalRequestId', 'dispositionId', 'lineId']
      .filter((k) => !state[k]);
    if (missing.length) {
      throw new Error(`kurtarma EKSIK — bulunamayan kimlikler: ${missing.join(', ')}`
        + ' (kurulum yarida kesilmis olabilir; 04-teardown ile durum incelenmelidir)');
    }

    // Izolasyon baseline kurtarilamaz (kosum ONCESI degerlerdi). Bunu gizlemek yerine
    // acikca isaretle: 03-verify V-5a bu durumda FAIL verir.
    state.isolationBaseline = null;
    state.isolationBaselineLost = true;

    L.saveState(state);
    L.step('R', `durum dosyasi kurtarildi — runId=${runId} · tenant=${state.slug}`);
    L.log('      NOT: izolasyon baseline KURTARILAMAZ (kosum oncesi degerlerdi).');
    L.log('           03-verify V-5a bu kosumda FAIL verecektir — bu DOGRU davranistir.');
    L.log('      NOT: parola kurtarilmaz; F04_LOGIN_PASSWORD ortam degiskeni gereklidir.');
    console.log(JSON.stringify({
      record: 'F04-STATE-RECOVERED', runId, slug: state.slug,
      writeOperations: 0, passwordStored: false, isolationBaselineLost: true,
    }, null, 1));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nKURTARMA HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
