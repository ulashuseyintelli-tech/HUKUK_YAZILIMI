/*
 * F04 CANLI KABUL — ADIM 5 (ISTEGE BAGLI): KABUL-5 CANLI KARSILIGI
 *
 * NE DOGRULANIR: bir tenant'in aktoru, BASKA bir tenant'in dagitim kararini post EDEMEZ ve
 * bu deneme hicbir finansal iz BIRAKMAZ. Testteki KABUL-5'in canli karsiligidir ve bariyer
 * GEREKTIRMEZ — bu yuzden gercek HTTP ile calistirilabilir.
 *
 * ON KOSUL: iki AYRI sentetik tenant. Ikisi de 01-setup ile uretilir:
 *   F04_STATE_FILE=./f04-state-a.json  node f04-01-setup.js
 *   F04_STATE_FILE=./f04-state-b.json  node f04-01-setup.js
 * Sonra:
 *   F04_STATE_FILE=./f04-state-a.json F04_STATE_FILE_B=./f04-state-b.json node f04-05-tenant-boundary.js
 *
 * YAZMA KAPSAMI: bu adim KENDI BASINA hicbir satir yazmaz. Yalniz reddedilmesi beklenen bir
 * HTTP cagrisi yapar ve sonrasinda B tenant'inin degismedigini dogrular.
 */
'use strict';
const fs = require('fs');
const L = require('./f04-lib');

const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(6)} ${desc}\n         ${observed}`);
}

(async () => {
  const base = L.requireEnv('F04_API_BASE_URL').replace(/\/+$/, '');
  const a = L.loadState();
  const bPath = L.requireEnv('F04_STATE_FILE_B');
  if (!fs.existsSync(bPath)) throw new Error(`ikinci tenant durum dosyasi yok: ${bPath}`);
  const b = JSON.parse(fs.readFileSync(bPath, 'utf8'));

  L.assertOwnSlug(a.slug); // G-1
  L.assertOwnSlug(b.slug); // G-1
  if (a.tenantId === b.tenantId) throw new Error('iki durum dosyasi AYNI tenant — sinir testi anlamsiz');

  const prisma = L.loadPrisma();
  try {
    await L.assertOwnTenant(prisma, a.tenantId);
    await L.assertOwnTenant(prisma, b.tenantId);

    L.step('B-0', `sinir testi: aktor=${a.slug} · hedef=${b.slug}`);
    const before = await prisma.collectionDisposition.findUniqueOrThrow({
      where: { id: b.dispositionId },
      select: { status: true, postedAt: true, tenantId: true },
    });
    const beforeJournal = await prisma.accountingJournalEntry.count({ where: { tenantId: b.tenantId } });
    const beforeApps = await prisma.collectionDispositionExpenseApplication.count({ where: { tenantId: b.tenantId } });
    chk('B-0', 'hedef disposition post EDILMEMIS durumda', before.status === 'DISTRIBUTION_APPROVED' && !before.postedAt,
      `status=${before.status} postedAt=${before.postedAt ? 'VAR' : 'YOK'} journal=${beforeJournal} apps=${beforeApps}`);

    L.step('B-1', 'A tenant aktoru ile oturum');
    const login = await L.httpJson('POST', `${base}/auth/login`, {
      body: { email: a.userEmail, password: a.loginPassword, tenantSlug: a.slug },
    });
    const lb = login.body || {};
    const token = lb.token || lb.access_token || lb.accessToken
      || (lb.data && (lb.data.token || lb.data.access_token || lb.data.accessToken));
    chk('B-1', 'A tenant login', !!token, `HTTP ${login.status} · token=${token ? 'ALINDI' : 'YOK'}`);
    if (!token) throw new Error(`login basarisiz: HTTP ${login.status}`);

    L.step('B-2', 'A tenant token\'i ile B tenant\'inin dagitim kararini post DENEMESI');
    const res = await L.httpJson('POST', `${base}/collection-dispositions/${b.dispositionId}/post`, { token });
    chk('B-2', 'capraz tenant post REDDEDILDI (2xx DEGIL)', res.status >= 400,
      `HTTP ${res.status} · govde=${JSON.stringify(res.body).slice(0, 200)}`);

    L.step('B-3', 'B tenant\'inda hicbir finansal iz olusmadi');
    const after = await prisma.collectionDisposition.findUniqueOrThrow({
      where: { id: b.dispositionId }, select: { status: true, postedAt: true },
    });
    const afterJournal = await prisma.accountingJournalEntry.count({ where: { tenantId: b.tenantId } });
    const afterApps = await prisma.collectionDispositionExpenseApplication.count({ where: { tenantId: b.tenantId } });
    chk('B-3', 'hedef disposition DEGISMEDI',
      after.status === before.status && !after.postedAt && afterJournal === beforeJournal && afterApps === beforeApps,
      `status=${after.status} postedAt=${after.postedAt ? 'VAR' : 'YOK'} journal=${beforeJournal}→${afterJournal} apps=${beforeApps}→${afterApps}`);

    const okN = results.filter((r) => r.ok).length;
    console.log(`\nKABUL-5 (CANLI KARSILIGI — TENANT SINIRI): ${okN}/${results.length} ${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'F04-LIVE-TENANT-BOUNDARY', actorTenant: a.slug, targetTenant: b.slug,
      httpStatus: res.status, result: `${okN}/${results.length}`,
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nSINIR TESTI HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
