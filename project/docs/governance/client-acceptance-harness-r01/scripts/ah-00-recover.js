/*
 * CLIENT KABUL ALTYAPISI (İ1a) — KURTARMA
 *
 * Kurulum COMMIT edilip durum dosyası yazılamazsa (disk hatası, süreç öldürülmesi) kayıtlar
 * veritabanında KALIR. `runId` sır içermez ve tenant slug'ına gömülüdür (`ah-<runId>`), bu yüzden
 * durum tek başına o kimlikten yeniden kurulabilir.
 *
 *   AH_RUN_ID=<8 hex> node ah-00-recover.js            → durumu yeniden yazar
 *   AH_RUN_ID=<8 hex> node ah-00-recover.js --list     → yalnız raporlar, dosya yazmaz
 *   node ah-00-recover.js --scan                       → bu pakete ait TÜM koşumları listeler
 *
 * Sır yeniden üretilemez: parola durum dosyasında saklanmadığı için kurtarılan koşumda
 * `AH_LOGIN_PASSWORD` yeniden verilmelidir. Verilemiyorsa erişim sonlandırma yine mümkündür —
 * `ah-04-revoke.js` sonlandırmayı veritabanı üzerinden yapar (login gerektirmez), yalnız
 * V-1/V-2 HTTP kanıtları OLÇÜLEMEZ ve bu açıkça FAIL raporlanır.
 */
'use strict';
const L = require('./ah-lib');

(async () => {
  L.assertDisposableEnvironment(); // G-0
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const scan = args.includes('--scan');

  const prisma = L.loadPrisma();
  try {
    if (scan) {
      const tenants = await prisma.tenant.findMany({
        where: { slug: { startsWith: L.TENANT_PREFIX } },
        select: { id: true, slug: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      L.step('K', `bu pakete ait ${tenants.length} kosum bulundu (prefix '${L.TENANT_PREFIX}')`);
      const openRuns = [];
      for (const t of tenants) {
        const users = await prisma.user.findMany({
          where: { tenantId: t.id }, select: { isActive: true },
        });
        const active = users.filter((u) => u.isActive).length;
        if (active > 0) openRuns.push(t.slug);
        console.log(`  ${t.slug}  olusturma=${t.createdAt.toISOString()}  hesap=${users.length}`
          + `  AKTIF=${active}${active ? '  ← erisim ACIK, ah-04-revoke.js calistirin' : ''}`);
      }
      console.log(JSON.stringify({
        record: 'AH-RECOVER-SCAN', runs: tenants.length,
        runsWithOpenAccess: openRuns.length, openRuns,
      }, null, 1));
      process.exitCode = openRuns.length ? 2 : 0;
      return;
    }

    const runId = L.requireEnv('AH_RUN_ID');
    const st = await L.recoverState(prisma, runId);
    L.step('K', `kurtarildi: ${st.slug}`);
    const missing = ['viewer', 'user', 'elevated'].filter((t) => !st.actors[t]);
    console.log(`      tenant   : ${st.tenantId}`);
    console.log(`      client   : ${st.clientId || 'YOK'}`);
    for (const t of ['viewer', 'user', 'elevated']) {
      console.log(`      ${t.padEnd(9)}: ${st.actors[t] ? `${st.actors[t].email} (${st.actors[t].role})` : 'BULUNAMADI'}`);
    }
    if (missing.length) {
      console.error(`  UYARI: ${missing.join(', ')} bulunamadi — kurulum YARIDA kesilmis olabilir.`);
    }

    if (!listOnly) {
      L.saveState({ ...st, recoveredAt: new Date().toISOString() });
      console.log(`      durum dosyasi YENIDEN yazildi (SIR ICERMEZ)`);
    }
    console.log(JSON.stringify({
      record: 'AH-RECOVER', runId, tenant: st.slug,
      actorsFound: 3 - missing.length, stateRewritten: !listOnly, secretsPrinted: false,
    }, null, 1));
    process.exitCode = missing.length ? 2 : 0;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nKURTARMA HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
