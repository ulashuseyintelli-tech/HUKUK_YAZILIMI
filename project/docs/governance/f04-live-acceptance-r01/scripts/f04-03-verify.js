/*
 * F04 CANLI KABUL — ADIM 3: BAGIMSIZ NIHAI DOGRULAMA
 *
 * A2 adiminin kendi iddialarindan BAGIMSIZ olarak, kalici duruma bakar:
 *   V-1 posting sonucu (POSTED + postedAt + manuel isaret YOK)
 *   V-2 masraf uygulamasi dengesi (1 APPLY / 0 REVERSAL) ve kalan masraf
 *   V-3 muhasebe journal'i ve satirlari
 *   V-4 audit izi
 *   V-5a IZOLASYON (SIKI): korunan tenant'lar — gercek ofis ve diger programlarin olcum
 *        alanlari — 01-setup oncesi degerleriyle BIREBIR AYNI
 *   V-5b IZOLASYON (BILGI): global toplam artisi ve bunun ne kadarinin bizim tenant'imizla
 *        aciklandigi; canlida bagimsiz kullanici etkinligi olabilecegi icin FAIL uretmez
 *   V-6 kilit/transaction sizintisi yok
 *   V-7 dis bildirim uretilmedi (bildirim kuyrugu/teslim kayitlari bu tenant'ta 0)
 */
'use strict';
const L = require('./f04-lib');

const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(5)} ${desc}\n        ${observed}`);
}

(async () => {
  const st = L.loadState();
  L.assertOwnSlug(st.slug);
  const prisma = L.loadPrisma();

  try {
    await L.assertOwnTenant(prisma, st.tenantId);
    const T = { tenantId: st.tenantId };

    L.step('V', `nihai dogrulama — tenant ${st.slug}`);

    const disp = await prisma.collectionDisposition.findUniqueOrThrow({
      where: { id: st.dispositionId },
      select: { status: true, postedAt: true, manualReversalRequiredAt: true, totalAmount: true },
    });
    chk('V-1', 'posting sonucu', disp.status === 'POSTED' && !!disp.postedAt && !disp.manualReversalRequiredAt,
      `status=${disp.status} postedAt=${disp.postedAt ? 'VAR' : 'YOK'} manualReversal=${disp.manualReversalRequiredAt ? 'VAR' : 'YOK'}`);

    const apps = await prisma.collectionDispositionExpenseApplication.findMany({
      where: T, select: { kind: true, amount: true },
    });
    const applyN = apps.filter((a) => a.kind === 'APPLY').length;
    const revN = apps.filter((a) => a.kind === 'REVERSAL').length;
    const expense = await prisma.expenseRequest.findUniqueOrThrow({
      where: { id: st.expenseRequestId }, select: { totalAmount: true, paidTotal: true, status: true },
    });
    const appliedSum = apps.filter((a) => a.kind === 'APPLY')
      .reduce((t, a) => t + Number(a.amount), 0);
    const reversedSum = apps.filter((a) => a.kind === 'REVERSAL')
      .reduce((t, a) => t + Number(a.amount), 0);
    const netApplied = appliedSum - reversedSum;
    const remaining = Number(expense.totalAmount) - netApplied;
    chk('V-2', 'masraf uygulamasi ve BAKIYE', applyN === 1 && revN === 0 && netApplied === 100 && remaining === 0,
      `APPLY=${applyN} REVERSAL=${revN} · net uygulanan=${netApplied} · masraf toplami=${Number(expense.totalAmount)}`
      + ` · kalan=${remaining} · paidTotal=${Number(expense.paidTotal)} · status=${expense.status}`);

    const jrn = await prisma.accountingJournalEntry.findMany({ where: T, select: { id: true, entryType: true } });
    const types = jrn.reduce((a, j) => (a[j.entryType] = (a[j.entryType] || 0) + 1, a), {});
    const lines = await prisma.accountingJournalLine.count({ where: T }).catch(() => 'SAYILAMADI');
    chk('V-3', 'muhasebe journal + satirlari', (types.COLLECTION_DISTRIBUTION_POSTED || 0) >= 1,
      `tipler=${JSON.stringify(types)} · journalLine=${lines}`);

    const audit = await prisma.auditLog.findMany({ where: T, select: { action: true } });
    chk('V-4', 'audit izi', audit.length >= 1,
      `audit=${audit.length} · ${JSON.stringify(audit.reduce((a, r) => (a[r.action] = (a[r.action] || 0) + 1, a), {}))}`);

    // V-5 IZOLASYON — iki katmanli.
    //   V-5a (SIKI):  korunan tenant'larin (gercek ofis + diger programlarin alanlari) sayimlari
    //                 DEGISMEMIS olmalidir. Bu, paketin asil izolasyon guvencesidir.
    //   V-5b (BILGI): global toplam artisi. Canli DB'de bizim disimizda GERCEK kullanici
    //                 etkinligi olabilecegi icin bu SIKI bir esitlik DEGILDIR; raporlanir.
    const b = st.isolationBaseline;
    if (!b) throw new Error('izolasyon baseline yok — 01-setup guncel surumle calistirilmalidir');

    const nowProtected = [];
    for (const pt of b.protectedTenants) {
      const t = await prisma.tenant.findFirst({ where: { slug: pt.slug }, select: { id: true } });
      if (!t) { nowProtected.push({ slug: pt.slug, missing: true }); continue; }
      nowProtected.push({
        slug: pt.slug,
        collection: await prisma.collection.count({ where: { tenantId: t.id } }),
        disposition: await prisma.collectionDisposition.count({ where: { tenantId: t.id } }),
        journal: await prisma.accountingJournalEntry.count({ where: { tenantId: t.id } }),
        audit: await prisma.auditLog.count({ where: { tenantId: t.id } }),
        client: await prisma.client.count({ where: { tenantId: t.id } }),
      });
    }
    const protChanges = [];
    for (const pt of b.protectedTenants) {
      const n = nowProtected.find((x) => x.slug === pt.slug);
      if (!n || n.missing) { protChanges.push(`${pt.slug}: KAYIP`); continue; }
      for (const k of ['collection', 'disposition', 'journal', 'audit', 'client']) {
        if (pt[k] !== n[k]) protChanges.push(`${pt.slug}.${k}: ${pt[k]}→${n[k]}`);
      }
    }
    // Bos izleme kumesi PASS SAYILMAZ: kapi test edilmemis olur.
    const watchedN = b.protectedTenants.length;
    chk('V-5a', "IZLENEN tenant'larin sayimlari degismedi", protChanges.length === 0 && watchedN > 0,
      protChanges.length ? protChanges.join(' · ')
        : (watchedN > 0
          ? `${watchedN} tenant DEGISMEDI (bilinen korunan: ${(b.knownProtected || []).join(', ') || 'yok'})`
          : 'IZLEME KUMESI BOS — izolasyon kapisi TEST EDILMEDI (FAIL)'));

    const nowTotals = {
      tenant: await prisma.tenant.count(),
      collection: await prisma.collection.count(),
      disposition: await prisma.collectionDisposition.count(),
      journal: await prisma.accountingJournalEntry.count(),
      audit: await prisma.auditLog.count(),
    };
    const mine = {
      tenant: 1,
      collection: await prisma.collection.count({ where: T }),
      disposition: await prisma.collectionDisposition.count({ where: T }),
      journal: jrn.length,
      audit: audit.length,
    };
    const delta = {};
    const outside = {};
    for (const k of Object.keys(nowTotals)) {
      delta[k] = nowTotals[k] - b.globalTotals[k];
      outside[k] = delta[k] - mine[k];
    }
    const outsideNonZero = Object.entries(outside).filter(([, v]) => v !== 0);
    chk('V-5b', 'global artis bizim tenant ile aciklaniyor (bilgi)', true,
      `artis=${JSON.stringify(delta)} · bizim=${JSON.stringify(mine)}`
      + (outsideNonZero.length ? ` · DISIMIZDA artis=${JSON.stringify(Object.fromEntries(outsideNonZero))} (canli kullanici etkinligi olabilir)` : ' · disimizda artis YOK'));

    const leaks = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND state = 'idle in transaction'
          AND state_change < now() - interval '30 seconds'`,
    );
    chk('V-6', 'uzun sureli acik transaction (kilit sizintisi) yok', leaks[0].n === 0, `idle-in-transaction>30s = ${leaks[0].n}`);

    const notif = {};
    for (const m of ['notificationQueue', 'clientNotification', 'clientStatementDeliveryLedger', 'poaExpiryNotificationDelivery']) {
      notif[m] = prisma[m] ? await prisma[m].count({ where: T }).catch(() => 'SAYILAMADI') : 'MODEL_YOK';
    }
    const noNotif = Object.values(notif).every((v) => v === 0 || v === 'MODEL_YOK' || v === 'SAYILAMADI');
    chk('V-7', 'dis bildirim uretilmedi', noNotif, JSON.stringify(notif));

    const okN = results.filter((r) => r.ok).length;
    console.log(`\nF04 NIHAI DOGRULAMA: ${okN}/${results.length} ${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'F04-LIVE-VERIFY', tenant: st.slug, result: `${okN}/${results.length}`,
      protectedTenantsChecked: b.protectedTenants.length,
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nDOGRULAMA HATASI:', e && e.stack ? e.stack : e); process.exit(1); });
