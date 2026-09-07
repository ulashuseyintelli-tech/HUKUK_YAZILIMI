/*
 * F04 CANLI KABUL — ADIM 2: KABUL-A2 CANLI KARSILIGI
 *
 * KABUL KAPSAMI: **posting'in kilit beklemesi ve finansal sonucu.** Bu adim butun F04 yaris
 * kabulunu KAPATMAZ (bkz. paket belgesi §5 — on senaryodan yedisi canlida kurulamaz).
 *
 * YONTEM (canli API'ye HICBIR enjeksiyon yapilmadan):
 *   1. Sentetik hedef Collection satiri AYRI baglantida `FOR NO KEY UPDATE` ile kilitlenir.
 *   2. GERCEK HTTP `POST /collection-dispositions/:id/post` gonderilir.
 *   3. PostgreSQL'in kendi gorusu (`pg_blocking_pids`) ile posting'in BEKLEDIGI kanitlanir.
 *   4. Kilit birakilir; istek tamamlanir; posting/bakiye/audit sonucu dogrulanir.
 *
 * ORTAK SURE BUTCESI (F04_LOCK_BUDGET_MS, varsayilan 3500, tavan 4000):
 *   Butce kilidin ALINDIGI anda baslar ve GOZLEM ile TUTMA suresini BIRLIKTE kapsar. Gozlem
 *   ne kadar gecikirse kilit o kadar az tutulur; toplam hicbir kosulda butceyi asmaz. Butce
 *   dolarsa transaction kapatilir (kilit BIRAKILIR) ve adim FAIL verir.
 *   Tavan neden 4000: posting Prisma interactive transaction `timeout`unu override ETMEZ →
 *   varsayilan 5000 ms gecerlidir; asilirsa posting P2028 ile 500 doner (F04 kusuru DEGIL).
 *
 * FAIL-CLOSED OLCUM: gozlem sorgusunun kendisi hata verirse bu "kilit yok" SAYILMAZ; zorunlu
 * bir olcum yapilamadigi icin adim OLCULEMEDI olarak FAIL eder ve sifirdan farkli cikar.
 *
 * BELIRSIZ HTTP SONUCU: istemci timeout'u sunucu islemini IPTAL ETMEZ. Boyle bir durumda istek
 * TEKRAR GONDERILMEZ; kalici durum salt-okuma ile uzlastirilir ve sonuc acikca isaretlenir.
 */
'use strict';
const L = require('./f04-lib');

const LOCK_BUDGET_MS = Math.min(Number(process.env.F04_LOCK_BUDGET_MS || 3500), 4000);
const MIN_HOLD_AFTER_OBSERVE_MS = Number(process.env.F04_MIN_HOLD_AFTER_OBSERVE_MS || 600);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(6)} ${desc}\n         ${observed}`);
}
/** Zorunlu bir olcum yapilamadi: "yok" DEGIL, "bilinmiyor". */
function unmeasured(id, desc, why) {
  results.push({ id, desc, ok: false, unmeasured: true, observed: `OLCULEMEDI — ${why}` });
  console.log(`  ????? ${id.padEnd(6)} ${desc}\n         OLCULEMEDI — ${why}`);
}

(async () => {
  const base = L.requireEnv('F04_API_BASE_URL').replace(/\/+$/, '');
  const password = L.requireLoginPassword(); // durum dosyasinda SAKLANMAZ
  const st = L.loadState();
  L.assertOwnSlug(st.slug); // G-1

  const prisma = L.loadPrisma();     // kilidi TUTACAK baglanti
  const observer = L.loadPrisma('observer');   // kilidi GOZLEYECEK ayri baglanti

  let lockHolderPid = null;
  let postingSettled = false;
  let postingOut = null;
  let postingPromise = Promise.resolve();
  let lockAcquiredAt = null;
  let lockReleasedAt = null;

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2

    // ── ON KOSUL: FAIL ise posting BASLATILMAZ ──
    L.step('A2-0', 'on kosul dogrulamasi (FAIL ise posting BASLATILMAZ)');
    const pre = await prisma.collectionDisposition.findUniqueOrThrow({
      where: { id: st.dispositionId },
      select: { status: true, postedAt: true, tenantId: true },
    });
    const preCol = await prisma.collection.findUniqueOrThrow({
      where: { id: st.collectionId }, select: { status: true, tenantId: true },
    });
    if (pre.tenantId !== st.tenantId || preCol.tenantId !== st.tenantId) {
      throw new Error('G-2 IHLALI: hedef satirlar bu paketin tenant\'inda degil');
    }
    const preOk = pre.status === 'DISTRIBUTION_APPROVED' && preCol.status === 'CONFIRMED' && !pre.postedAt;
    chk('A2-0', 'baslangic durumu', preOk,
      `disposition=${pre.status} collection=${preCol.status} postedAt=${pre.postedAt ? 'VAR' : 'YOK'}`);
    if (!preOk) {
      console.log('\n  ON KOSUL SAGLANMADI — posting BASLATILMADI (yazma denemesi YOK).');
      throw new Error('A2-0 on kosulu saglanmadi');
    }

    L.step('A2-1', 'GERCEK HTTP oturumu (canli login yolu)');
    const login = await L.httpJson('POST', `${base}/auth/login`, {
      body: { email: st.userEmail, password, tenantSlug: st.slug }, // AUTH-01: tenantSlug ZORUNLU
    });
    if (login.indeterminate) {
      unmeasured('A2-1', 'login', login.indeterminateReason);
      throw new L.ObservationError('login sonucu BELIRSIZ — posting baslatilmadi');
    }
    const lb = login.body || {};
    const token = lb.token || lb.access_token || lb.accessToken
      || (lb.data && (lb.data.token || lb.data.access_token || lb.data.accessToken));
    chk('A2-1', 'login', !!token && (login.status === 200 || login.status === 201),
      `HTTP ${login.status} · token=${token ? 'ALINDI' : 'YOK'}`);
    if (!token) throw new Error(`login basarisiz: HTTP ${login.status}`);

    // ── KILIT + ORTAK BUTCE ──
    L.step('A2-2', `hedef Collection satiri kilitleniyor · ORTAK BUTCE ${LOCK_BUDGET_MS} ms`);
    let observeFailure = null;
    let budgetExceeded = null;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe(`SET LOCAL idle_in_transaction_session_timeout = '${LOCK_BUDGET_MS + 15000}ms'`);

      const locked = await tx.$queryRawUnsafe(
        'SELECT id FROM "Collection" WHERE id = $1 AND "tenantId" = $2 FOR NO KEY UPDATE',
        st.collectionId, st.tenantId,
      ); // G-4: TEK satir, tenant kapsamli
      if (locked.length !== 1) throw new Error(`G-4 IHLALI: kilitlenen satir sayisi ${locked.length}`);

      lockAcquiredAt = Date.now();
      const budgetDeadline = lockAcquiredAt + LOCK_BUDGET_MS;
      lockHolderPid = await L.backendPid(tx);
      L.log(`      kilit alindi · holderPid=${lockHolderPid} · satir=1 · butce bitisi +${LOCK_BUDGET_MS} ms`);

      L.step('A2-3', 'GERCEK HTTP posting istegi (kilit TUTULUYORKEN) — tekrar gonderim YOK');
      postingPromise = L.httpJson('POST', `${base}/collection-dispositions/${st.dispositionId}/post`, {
        token, timeoutMs: LOCK_BUDGET_MS + 60000,
      }).then((r) => { postingOut = r; postingSettled = true; });

      L.step('A2-4', 'PostgreSQL gorusu: kilidimiz posting transaction\'ini bloke ediyor mu?');
      let blocked = null;
      try {
        blocked = await L.waitUntilSomeoneBlockedBy(observer, lockHolderPid, budgetDeadline);
      } catch (e) {
        if (e && e.observationFailed) { observeFailure = e; return; }   // kilit birakilir
        if (e && e.budgetExceeded) { budgetExceeded = e; return; }      // kilit birakilir
        throw e;
      }

      const target = blocked.find((b) => /FOR NO KEY UPDATE/i.test(b.querySnippet || '')) || blocked[0];
      chk('A2-4', 'pg_blocking_pids ile kilit beklemesi', blocked.length >= 1,
        `bloke edilen pid=${blocked.map((b) => b.pid).join(',')} · waitEvent=${target.waitEventType}/${target.waitEvent}`
        + ` · gozlem suresi=${Date.now() - lockAcquiredAt} ms`);
      chk('A2-5', 'bekleyen sorgu posting\'in satir kilidi cumlesi',
        /FOR NO KEY UPDATE/i.test(target.querySnippet || ''),
        `query="${(target.querySnippet || '').replace(/\s+/g, ' ').trim()}"`);
      chk('A2-6', 'HTTP istegi kilitte BEKLIYOR (henuz tamamlanmadi)', postingSettled === false,
        `postingSettled=${postingSettled} · kilit tutuldu=${Date.now() - lockAcquiredAt} ms`);

      // Kalan butce icinde kisa bir sure daha tut (sure farkini olculebilir kilmak icin).
      const remaining = budgetDeadline - Date.now();
      if (remaining > 0) await sleep(Math.min(MIN_HOLD_AFTER_OBSERVE_MS, remaining));
    }, { timeout: LOCK_BUDGET_MS + 45000, maxWait: 10000 });

    lockReleasedAt = Date.now();
    const heldMs = lockReleasedAt - lockAcquiredAt;
    L.step('A2-7', `kilit BIRAKILDI (${heldMs} ms tutuldu; butce ${LOCK_BUDGET_MS} ms)`);

    if (observeFailure) {
      unmeasured('A2-4', 'pg_blocking_pids ile kilit beklemesi', observeFailure.message);
      throw observeFailure;
    }
    if (budgetExceeded) {
      chk('A2-4', 'pg_blocking_pids ile kilit beklemesi', false,
        `${budgetExceeded.message} (kilit ${heldMs} ms sonra BIRAKILDI)`);
      throw budgetExceeded;
    }

    // ── BELIRSIZ SONUCU SALT-OKUMA ILE UZLASTIR (TEKRAR GONDERIM YOK) ──
    await postingPromise;
    let reconciled = null;
    if (postingOut.indeterminate) {
      L.step('A2-8', 'HTTP sonucu BELIRSIZ — kalici durum salt-okuma ile uzlastiriliyor');
      L.log(`      neden: ${postingOut.indeterminateReason}`);
      L.log('      ISTEK TEKRAR GONDERILMEDI (mukerrer finansal etki riski).');
      const now = await observer.collectionDisposition.findUniqueOrThrow({
        where: { id: st.dispositionId }, select: { status: true, postedAt: true },
      });
      reconciled = now.status === 'POSTED' && !!now.postedAt ? 'SUNUCUDA TAMAMLANDI' : 'GERCEKLESMEDI';
      chk('A2-7', 'belirsiz HTTP sonucu uzlastirildi', reconciled === 'SUNUCUDA TAMAMLANDI',
        `uzlasma=${reconciled} · kalici status=${now.status} · tekrar gonderim=YOK`);
    } else {
      const postOk = postingOut.status === 200 || postingOut.status === 201;
      chk('A2-7', 'posting istegi kilit birakildiktan sonra BASARIYLA tamamlandi', postOk,
        `HTTP ${postingOut.status} · toplam sure=${postingOut.elapsedMs} ms`
        + (postOk ? '' : ` · govde=${JSON.stringify(postingOut.body).slice(0, 300)}`
          + ` · IPUCU: kilit ${heldMs} ms tutuldu; posting tx timeout'u ~5000 ms`));
      chk('A2-8', 'istek suresi kilit tutma suresinden UZUN (gercekten bekledi)',
        postingOut.elapsedMs >= heldMs * 0.6, `istek=${postingOut.elapsedMs} ms · kilit=${heldMs} ms`);
    }

    L.step('A2-9', 'nihai posting sonucu');
    const post = await observer.collectionDisposition.findUniqueOrThrow({
      where: { id: st.dispositionId },
      select: { status: true, postedAt: true, manualReversalRequiredAt: true },
    });
    chk('A2-9', 'disposition POSTED ve postedAt yazildi',
      post.status === 'POSTED' && !!post.postedAt && !post.manualReversalRequiredAt,
      `status=${post.status} postedAt=${post.postedAt ? 'VAR' : 'YOK'} manualReversal=${post.manualReversalRequiredAt ? 'VAR' : 'YOK'}`);

    // ── KILIT SIZINTISI: olculemezse "sizinti yok" DEMEK DEGILDIR ──
    try {
      const still = await L.pidsBlockedBy(observer, lockHolderPid);
      chk('A2-10', 'kilit SIZINTISI yok (holder artik kimseyi bloke etmiyor)', still.length === 0,
        `hala bloke edilen=${still.length}`);
    } catch (e) {
      unmeasured('A2-10', 'kilit sizintisi kontrolu', `pg_stat_activity okunamadi: ${e && e.message}`);
    }

    const okN = results.filter((r) => r.ok).length;
    const unmeasuredN = results.filter((r) => r.unmeasured).length;
    console.log(`\nKABUL-A2 (posting kilit beklemesi + finansal sonuc): ${okN}/${results.length}`
      + `${unmeasuredN ? ` · OLCULEMEYEN ${unmeasuredN}` : ''} `
      + `${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'F04-LIVE-A2', tenant: st.slug, runId: st.runId,
      lockHolderPid, lockBudgetMs: LOCK_BUDGET_MS, lockHeldMs: heldMs,
      postingHttpStatus: postingOut.indeterminate ? 'BELIRSIZ' : postingOut.status,
      reconciledFromPersistedState: reconciled,
      postingElapsedMs: postingOut.elapsedMs,
      result: `${okN}/${results.length}`, unmeasured: unmeasuredN,
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } catch (e) {
    console.error('\nA2 HATASI:', e && e.message ? e.message : e);
    if (e && (e.observationFailed || e.budgetExceeded)) {
      console.error('  → ZORUNLU OLCUM YAPILAMADI veya BUTCE DOLDU. Bu sonuc "kilit yok" DEGILDIR.');
    }
    process.exitCode = 3;
  } finally {
    // Posting istegi kilit birakildiktan sonra tamamlanabilir; asla iptal/tekrar EDILMEZ.
    await postingPromise.catch((e) => console.error('  posting istegi hatasi:', e && e.message));
    if (lockAcquiredAt && !lockReleasedAt) {
      console.error('  UYARI: kilit birakilma zamani kaydedilemedi — transaction ROLLBACK ile kapanmis olmalidir.');
    }
    await prisma.$disconnect().catch(() => {});
    await observer.$disconnect().catch(() => {});
  }
})();
