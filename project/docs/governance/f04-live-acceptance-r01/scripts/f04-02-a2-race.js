/*
 * F04 CANLI KABUL — ADIM 2: KABUL-A2 CANLI KARSILIGI
 *
 * NE DOGRULANIR: posting akisi Collection satirini GERCEKTEN kilitler ve o satir baska bir
 * transaction tarafindan tutuluyorken ILERLEYEMEZ — yani F04'un serilestirme bacagi canli
 * surumde CALISIYOR. Kanit PostgreSQL'in kendi gorusudur (`pg_blocking_pids`).
 *
 * YONTEM (canli API'ye HICBIR enjeksiyon yapilmadan):
 *   1. Sentetik hedef Collection satiri AYRI bir baglantida `FOR NO KEY UPDATE` ile kilitlenir.
 *   2. GERCEK HTTP `POST /collection-dispositions/:id/post` istegi gonderilir.
 *   3. PostgreSQL'e sorulur: kilidi tutan pid, baska bir pid'i bloke ediyor mu?
 *      Blokedeki sorgu metni posting'in `FOR NO KEY UPDATE` cumlesi olmalidir.
 *   4. Istek HENUZ tamamlanmamis olmalidir (kilitte bekliyor).
 *   5. Kilit BIRAKILIR; istek tamamlanir; posting/bakiye/audit sonucu dogrulanir.
 *
 * BUNUN KANITLAMADIGI: testteki KABUL-A2'nin ikinci yarisi (gercek cancel executor'in ayni
 * kilitte beklemesi ve ardindan POSTED tersleme yolunun islemesi). Onun canli karsiligi ayri
 * bir yazma kapsami ve ayri onay ister — pakette A2-EXT olarak ISTEGE BAGLI tanimlanmistir.
 *
 * KILIT GUVENLIGI:
 *   - `lock_timeout` ve `idle_in_transaction_session_timeout` transaction'a SET LOCAL edilir.
 *   - Kilit azami `F04_LOCK_HOLD_MS` (varsayilan 8000 ms, tavan 30000 ms) tutulur.
 *   - Hata/timeout durumunda Prisma transaction'i ROLLBACK eder → kilit BIRAKILIR.
 *   - Kilit YALNIZ tek bir Collection satirinda ve yalniz bu paketin tenant'inda alinir (G-4).
 */
'use strict';
const L = require('./f04-lib');

// KRITIK PARAMETRE: posting akisi Prisma interactive transaction kullanir ve `timeout`u
// OVERRIDE ETMEZ — yani Prisma varsayilani 5000 ms gecerlidir. Kilidi bundan UZUN tutmak
// posting'i P2028 (Transaction API error) ile HTTP 500'e dusurur; bu bir F04 kusuru DEGIL,
// olcum kurgusunun kusurudur. Provada 8000 ms ile bu bizzat GOZLENDI (bkz. paket belgesi).
// Bu yuzden varsayilan 2000 ms, TAVAN 4000 ms'dir.
const LOCK_HOLD_MS = Math.min(Number(process.env.F04_LOCK_HOLD_MS || 2000), 4000);
const BLOCK_OBSERVE_TIMEOUT_MS = Number(process.env.F04_BLOCK_TIMEOUT_MS || 15000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(6)} ${desc}\n         ${observed}`);
}

(async () => {
  const base = L.requireEnv('F04_API_BASE_URL').replace(/\/+$/, '');
  const st = L.loadState();
  L.assertOwnSlug(st.slug); // G-1

  const prisma = L.loadPrisma();     // kilidi TUTACAK baglanti
  const observer = L.loadPrisma();   // kilidi GOZLEYECEK ayri baglanti

  let lockHolderPid = null;
  let postingSettled = false;
  let postingOut = null;
  let postingErr = null;
  let postingPromise = Promise.resolve();

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2

    L.step('A2-0', 'on kosul: disposition DISTRIBUTION_APPROVED ve collection CONFIRMED mi?');
    const pre = await prisma.collectionDisposition.findUniqueOrThrow({
      where: { id: st.dispositionId },
      select: { status: true, postedAt: true, tenantId: true, collectionId: true },
    });
    const preCol = await prisma.collection.findUniqueOrThrow({
      where: { id: st.collectionId }, select: { status: true, tenantId: true },
    });
    if (pre.tenantId !== st.tenantId || preCol.tenantId !== st.tenantId) {
      throw new Error('G-2 IHLALI: hedef satirlar bu paketin tenant\'inda degil');
    }
    chk('A2-0', 'baslangic durumu', pre.status === 'DISTRIBUTION_APPROVED' && preCol.status === 'CONFIRMED' && !pre.postedAt,
      `disposition=${pre.status} collection=${preCol.status} postedAt=${pre.postedAt ? 'VAR' : 'YOK'}`);

    L.step('A2-1', 'GERCEK HTTP oturumu (canli login yolu)');
    // AUTH-01: login tenant-aware'dir — `tenantSlug` ZORUNLU girdidir.
    const login = await L.httpJson('POST', `${base}/auth/login`, {
      body: { email: st.userEmail, password: st.loginPassword, tenantSlug: st.slug },
    });
    const lb = login.body || {};
    const token = lb.token || lb.access_token || lb.accessToken
      || (lb.data && (lb.data.token || lb.data.access_token || lb.data.accessToken));
    chk('A2-1', 'login', login.status === 200 || login.status === 201, `HTTP ${login.status} · token=${token ? 'ALINDI' : 'YOK'}`);
    if (!token) throw new Error(`login basarisiz: HTTP ${login.status} ${JSON.stringify(login.body).slice(0, 200)}`);

    L.step('A2-2', `hedef Collection satiri kilitleniyor (azami ${LOCK_HOLD_MS} ms)`);
    const lockStarted = Date.now();

    await prisma.$transaction(async (tx) => {
      // G-5: kilidi tutan oturum kendi kendine takilirsa PostgreSQL onu kapatir.
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe(`SET LOCAL idle_in_transaction_session_timeout = '${LOCK_HOLD_MS + 15000}ms'`);

      // G-4: TEK satir, tenant kapsamli.
      const locked = await tx.$queryRawUnsafe(
        'SELECT id FROM "Collection" WHERE id = $1 AND "tenantId" = $2 FOR NO KEY UPDATE',
        st.collectionId, st.tenantId,
      );
      if (locked.length !== 1) throw new Error(`G-4 IHLALI: kilitlenen satir sayisi ${locked.length}`);
      lockHolderPid = await L.backendPid(tx);
      L.log(`      kilit alindi · holderPid=${lockHolderPid} · satir=1 · tenant=${st.slug}`);

      L.step('A2-3', 'GERCEK HTTP posting istegi gonderiliyor (kilit TUTULUYORKEN)');
      postingPromise = L.httpJson('POST', `${base}/collection-dispositions/${st.dispositionId}/post`, {
        token, timeoutMs: LOCK_HOLD_MS + 60000,
      }).then((r) => { postingOut = r; postingSettled = true; })
        .catch((e) => { postingErr = e; postingSettled = true; });

      L.step('A2-4', 'PostgreSQL gorusu: kilidimiz posting transaction\'ini bloke ediyor mu?');
      const blocked = await L.waitUntilSomeoneBlockedBy(observer, lockHolderPid, BLOCK_OBSERVE_TIMEOUT_MS);
      const target = blocked.find((b) => /FOR NO KEY UPDATE/i.test(b.querySnippet || ''))
        || blocked[0];
      chk('A2-4', 'pg_blocking_pids ile kilit beklemesi', blocked.length >= 1,
        `bloke edilen pid=${blocked.map((b) => b.pid).join(',')} · waitEvent=${target.waitEventType}/${target.waitEvent}`);
      chk('A2-5', 'bekleyen sorgu posting\'in satir kilidi cumlesi', /FOR NO KEY UPDATE/i.test(target.querySnippet || ''),
        `query="${(target.querySnippet || '').replace(/\s+/g, ' ').trim()}"`);
      chk('A2-6', 'HTTP istegi kilitte BEKLIYOR (henuz tamamlanmadi)', postingSettled === false,
        `postingSettled=${postingSettled} · kilit tutuldu=${Date.now() - lockStarted} ms`);

      // Kilidi sinirli sure tut, sonra birak.
      const remain = LOCK_HOLD_MS - (Date.now() - lockStarted);
      if (remain > 0) await sleep(remain);
    }, { timeout: LOCK_HOLD_MS + 45000, maxWait: 10000 });

    const heldMs = Date.now() - lockStarted;
    L.step('A2-7', `kilit BIRAKILDI (${heldMs} ms tutuldu) — posting devam ediyor`);

    await postingPromise;
    if (postingErr) throw postingErr;

    const postOk = postingOut.status === 200 || postingOut.status === 201;
    chk('A2-7', 'posting istegi kilit birakildiktan sonra BASARIYLA tamamlandi', postOk,
      `HTTP ${postingOut.status} · toplam sure=${postingOut.elapsedMs} ms`
      + (postOk ? '' : ` · govde=${JSON.stringify(postingOut.body).slice(0, 300)}`
        + ` · IPUCU: kilit ${heldMs} ms tutuldu; posting tx timeout'u ~5000 ms'dir`));
    chk('A2-8', 'istek suresi kilit tutma suresinden UZUN (gercekten bekledi)',
      postingOut.elapsedMs >= heldMs * 0.6,
      `istek=${postingOut.elapsedMs} ms · kilit=${heldMs} ms`);

    L.step('A2-9', 'nihai posting / bakiye / audit kontrolu');
    const post = await observer.collectionDisposition.findUniqueOrThrow({
      where: { id: st.dispositionId },
      select: { status: true, postedAt: true, manualReversalRequiredAt: true },
    });
    chk('A2-9', 'disposition POSTED ve postedAt yazildi',
      post.status === 'POSTED' && !!post.postedAt && !post.manualReversalRequiredAt,
      `status=${post.status} postedAt=${post.postedAt ? 'VAR' : 'YOK'} manualReversalRequiredAt=${post.manualReversalRequiredAt ? 'VAR' : 'YOK'}`);

    const apps = await observer.collectionDispositionExpenseApplication.findMany({
      where: { tenantId: st.tenantId }, select: { kind: true },
    });
    const applyN = apps.filter((a) => a.kind === 'APPLY').length;
    const revN = apps.filter((a) => a.kind === 'REVERSAL').length;
    chk('A2-10', 'masraf uygulamasi: 1 APPLY / 0 REVERSAL', applyN === 1 && revN === 0,
      `APPLY=${applyN} REVERSAL=${revN}`);

    const jrn = await observer.accountingJournalEntry.findMany({
      where: { tenantId: st.tenantId }, select: { entryType: true },
    });
    const distN = jrn.filter((j) => j.entryType === 'COLLECTION_DISTRIBUTION_POSTED').length;
    chk('A2-11', 'muhasebe journal\'i yazildi (COLLECTION_DISTRIBUTION_POSTED)', distN >= 1,
      `journal tipleri=${JSON.stringify(jrn.reduce((a, j) => (a[j.entryType] = (a[j.entryType] || 0) + 1, a), {}))}`);

    const audit = await observer.auditLog.findMany({
      where: { tenantId: st.tenantId }, select: { action: true },
    });
    chk('A2-12', 'audit izi olustu', audit.length >= 1,
      `audit=${audit.length} · aksiyonlar=${JSON.stringify(audit.reduce((a, r) => (a[r.action] = (a[r.action] || 0) + 1, a), {}))}`);

    // Kilit sizintisi kontrolu: bizim pid artik kimseyi bloke etmiyor olmali.
    const stillBlocking = await L.pidsBlockedBy(observer, lockHolderPid).catch(() => []);
    chk('A2-13', 'kilit SIZINTISI yok (holder artik kimseyi bloke etmiyor)', stillBlocking.length === 0,
      `hala bloke edilen=${stillBlocking.length}`);

    const okN = results.filter((r) => r.ok).length;
    console.log(`\nKABUL-A2 (CANLI KARSILIGI): ${okN}/${results.length} ${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'F04-LIVE-A2', tenant: st.slug, lockHolderPid, lockHeldMs: heldMs,
      postingHttpStatus: postingOut.status, postingElapsedMs: postingOut.elapsedMs,
      result: `${okN}/${results.length}`,
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } catch (e) {
    console.error('\nA2 HATASI:', e && e.stack ? e.stack : e);
    // Kilit her durumda birakilmis olmali (Prisma transaction ROLLBACK eder); yine de gozlemle.
    try {
      if (lockHolderPid) {
        const leak = await L.pidsBlockedBy(observer, lockHolderPid);
        console.error(`  kilit sizintisi kontrolu: hala bloke edilen pid=${leak.length}`);
      }
    } catch (e2) { /* gozlem basarisiz — asil hatayi gizleme */ }
    process.exitCode = 1;
  } finally {
    await postingPromise.catch(() => {});
    await prisma.$disconnect().catch(() => {});
    await observer.$disconnect().catch(() => {});
  }
})();
