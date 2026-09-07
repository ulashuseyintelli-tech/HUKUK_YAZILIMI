/*
 * F04 CANLI KABUL — ADIM 2: KABUL-A2 CANLI KARSILIGI
 *
 * KABUL KAPSAMI: **posting'in kilit beklemesi ve finansal sonucu.** Bu adim butun F04 yaris
 * kabulunu KAPATMAZ (paket belgesi §5 — on senaryodan yedisi canlida kurulamaz).
 *
 * YONTEM (canli API'ye HICBIR enjeksiyon yapilmadan):
 *   1. Sentetik hedef Collection satiri AYRI baglantida `FOR NO KEY UPDATE` ile kilitlenir.
 *   2. GERCEK HTTP `POST /collection-dispositions/:id/post` gonderilir.
 *   3. PostgreSQL'in kendi gorusu (`pg_blocking_pids`) ile posting'in BEKLEDIGI kanitlanir.
 *   4. Kilit birakilir; kilidin sonlandigi DOGRUDAN dogrulanir; sonuc kontrol edilir.
 *
 * ORTAK SURE BUTCESI (F04_LOCK_BUDGET_MS, varsayilan 3500, tavan 4000):
 *   Butce kilidin ALINDIGI anda baslar ve kilit alindiktan SONRAKI BUTUN islemleri kapsar —
 *   gozlem, kontroller, bekleme, hepsi. Her adimda `assertWithinBudget` cagrilir; asilirsa
 *   transaction hemen sonlandirilir (kilit birakilir) ve **sonuc PASS SAYILMAZ**.
 *
 *   VERITABANI KORUMALARI BUTCEYLE UYUMLUDUR (R03):
 *     lock_timeout                        = butce           (kilidi almak butceyi asamaz)
 *     statement_timeout                   = butce + tolerans (tek sorgu butceyi asamaz)
 *     idle_in_transaction_session_timeout = butce + tolerans (bosta bekleyen tx kapanir)
 *   R02'de bunlar sabit 5 s ve butce+15 s idi; yani DB korumalari butceden GEVSEKTI.
 *
 * FAIL-CLOSED OLCUM: gozlem/dogrulama sorgusunun kendisi hata verirse bu "kilit yok" veya
 * "kilit birakildi" SAYILMAZ; adim OLCULEMEDI olarak FAIL eder ve sifirdan farkli cikar.
 *
 * BELIRSIZ HTTP SONUCU: istemci timeout'u sunucu islemini IPTAL ETMEZ. Istek TEKRAR
 * GONDERILMEZ. Kalici durum salt-okuma ile okunur: POSTED ise "sunucuda tamamlandi" kanitidir;
 * POSTED DEGILSE sonuc **BELIRSIZ kalir** ("gerceklesmedi" DENMEZ — sunucu hala isliyor olabilir).
 */
'use strict';
const L = require('./f04-lib');

const LOCK_BUDGET_MS = Math.min(Number(process.env.F04_LOCK_BUDGET_MS || 3500), 4000);
const MIN_HOLD_AFTER_OBSERVE_MS = Number(process.env.F04_MIN_HOLD_AFTER_OBSERVE_MS || 600);
// DB korumalarina verilen tolerans: butce bittikten sonra transaction'in kapanmasi icin
// gereken kisa pay. Butceden BAGIMSIZ bir sabit DEGILDIR.
const DB_GUARD_SLACK_MS = Number(process.env.F04_DB_GUARD_SLACK_MS || 1500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(6)} ${desc}\n         ${observed}`);
}
function unmeasured(id, desc, why) {
  results.push({ id, desc, ok: false, unmeasured: true, observed: `OLCULEMEDI — ${why}` });
  console.log(`  ????? ${id.padEnd(6)} ${desc}\n         OLCULEMEDI — ${why}`);
}

(async () => {
  const base = L.requireEnv('F04_API_BASE_URL').replace(/\/+$/, '');
  const password = L.requireLoginPassword(); // yalniz bellekte/ortamda; CIKTIYA BASILMAZ
  const st = L.loadState();
  L.assertOwnSlug(st.slug); // G-1

  const prisma = L.loadPrisma();
  const observer = L.loadPrisma('observer');

  let lockHolderPid = null;
  let postingSettled = false;
  let postingOut = null;
  let postingPromise = Promise.resolve();
  let lockAcquiredAt = null;
  let lockReleasedAt = null;
  let budgetExceeded = null;
  let observeFailure = null;

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2

    // ── ON KOSUL: FAIL ise posting BASLATILMAZ ──
    L.step('A2-0', 'on kosul dogrulamasi (FAIL ise posting BASLATILMAZ)');
    const pre = await prisma.collectionDisposition.findUniqueOrThrow({
      where: { id: st.dispositionId }, select: { status: true, postedAt: true, tenantId: true },
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
    L.step('A2-2', `kilit · ORTAK BUTCE ${LOCK_BUDGET_MS} ms (DB korumalari butceye gore ayarlanir)`);

    await prisma.$transaction(async (tx) => {
      // DB korumalari BUTCEYLE UYUMLU: hicbiri butceden gevsek degildir.
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_BUDGET_MS}ms'`);
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${LOCK_BUDGET_MS + DB_GUARD_SLACK_MS}ms'`);
      await tx.$executeRawUnsafe(
        `SET LOCAL idle_in_transaction_session_timeout = '${LOCK_BUDGET_MS + DB_GUARD_SLACK_MS}ms'`);

      const locked = await tx.$queryRawUnsafe(
        'SELECT id FROM "Collection" WHERE id = $1 AND "tenantId" = $2 FOR NO KEY UPDATE',
        st.collectionId, st.tenantId,
      ); // G-4: TEK satir, tenant kapsamli
      if (locked.length !== 1) throw new Error(`G-4 IHLALI: kilitlenen satir sayisi ${locked.length}`);

      // ↓↓↓ BURADAN SONRAKI HER SEY BUTCE ICINDEDIR ↓↓↓
      lockAcquiredAt = Date.now();
      const deadline = lockAcquiredAt + LOCK_BUDGET_MS;

      lockHolderPid = await L.backendPid(tx);
      L.assertWithinBudget(deadline, 'backend pid okundu');
      L.log(`      kilit alindi · holderPid=${lockHolderPid} · butce bitisi +${LOCK_BUDGET_MS} ms`
        + ` · lock_timeout=${LOCK_BUDGET_MS}ms · statement_timeout=${LOCK_BUDGET_MS + DB_GUARD_SLACK_MS}ms`);

      L.step('A2-3', 'GERCEK HTTP posting istegi (kilit TUTULUYORKEN) — tekrar gonderim YOK');
      postingPromise = L.httpJson('POST', `${base}/collection-dispositions/${st.dispositionId}/post`, {
        // Istemci timeout'u: SUNUCU ISLEMINI IPTAL ETMEZ. Negatif kontrol bunu bilerek
        // kisaltarak "belirsiz sonuc" yolunu dogrular.
        token, timeoutMs: Number(process.env.F04_POSTING_TIMEOUT_MS || (LOCK_BUDGET_MS + 60000)),
      }).then((r) => { postingOut = r; postingSettled = true; });
      L.assertWithinBudget(deadline, 'posting istegi baslatildi');

      L.step('A2-4', 'PostgreSQL gorusu: kilidimiz posting transaction\'ini bloke ediyor mu?');
      let blocked = null;
      try {
        blocked = await L.waitUntilSomeoneBlockedBy(observer, lockHolderPid, deadline);
      } catch (e) {
        if (e && e.observationFailed) { observeFailure = e; return; } // kilit birakilir
        if (e && e.budgetExceeded) { budgetExceeded = e; return; }    // kilit birakilir
        throw e;
      }
      L.assertWithinBudget(deadline, 'gozlem tamamlandi');

      const target = blocked.find((b) => /FOR NO KEY UPDATE/i.test(b.querySnippet || '')) || blocked[0];
      chk('A2-4', 'pg_blocking_pids ile kilit beklemesi', blocked.length >= 1,
        `bloke edilen pid=${blocked.map((b) => b.pid).join(',')} · waitEvent=${target.waitEventType}/${target.waitEvent}`
        + ` · gozlem suresi=${Date.now() - lockAcquiredAt} ms`);
      chk('A2-5', 'bekleyen sorgu posting\'in satir kilidi cumlesi',
        /FOR NO KEY UPDATE/i.test(target.querySnippet || ''),
        `query="${(target.querySnippet || '').replace(/\s+/g, ' ').trim()}"`);
      chk('A2-6', 'HTTP istegi kilitte BEKLIYOR (henuz tamamlanmadi)', postingSettled === false,
        `postingSettled=${postingSettled} · kilit tutuldu=${Date.now() - lockAcquiredAt} ms`);
      L.assertWithinBudget(deadline, 'kontroller tamamlandi');

      // Kalan butce icinde kisa bir sure daha tut — butceyi ASLA asmaz.
      const remaining = deadline - Date.now();
      if (remaining > 0) await sleep(Math.min(MIN_HOLD_AFTER_OBSERVE_MS, remaining));
    }, { timeout: LOCK_BUDGET_MS + DB_GUARD_SLACK_MS + 5000, maxWait: 10000 });

    lockReleasedAt = Date.now();
    const heldMs = lockReleasedAt - lockAcquiredAt;
    L.step('A2-7', `kilit birakildi (${heldMs} ms tutuldu; butce ${LOCK_BUDGET_MS} ms) — DOGRUDAN dogrulaniyor`);

    // ── KILIT/TRANSACTION SONLANMASI: DOGRUDAN DOGRULAMA (basari yolu) ──
    try {
      const rel = await L.assertLockReleased(observer, lockHolderPid);
      chk('A2-7', 'kilit ve transaction SONLANDI (dogrudan dogrulama)', rel.released,
        `oturum=${rel.session.present ? rel.session.state : 'KAPANDI'} `
        + `· acikTransaction=${rel.session.inTransaction} · hala bloke edilen=${rel.stillBlocking}`);
    } catch (e) {
      unmeasured('A2-7', 'kilit ve transaction sonlanmasi', e && e.message);
    }

    if (observeFailure) { unmeasured('A2-4', 'kilit beklemesi gozlemi', observeFailure.message); throw observeFailure; }
    if (budgetExceeded) {
      chk('A2-4', 'kilit beklemesi gozlemi', false, `${budgetExceeded.message} · kilit ${heldMs} ms sonra BIRAKILDI`);
      throw budgetExceeded;
    }
    if (heldMs > LOCK_BUDGET_MS + DB_GUARD_SLACK_MS) {
      chk('A2-BUDGET', 'kilit butce icinde birakildi', false,
        `tutuldu=${heldMs} ms · butce=${LOCK_BUDGET_MS} ms — SURE ASIMI PASS SAYILMAZ`);
    }

    // ── BELIRSIZ SONUC: TAMAMLANMA KANITI YOKSA BELIRSIZ KALIR ──
    await postingPromise;
    let reconciled = null;
    if (postingOut.indeterminate) {
      L.step('A2-8', 'HTTP sonucu BELIRSIZ — kalici durum salt-okuma ile okunuyor');
      L.log(`      neden: ${postingOut.indeterminateReason}`);
      L.log('      ISTEK TEKRAR GONDERILMEDI (mukerrer finansal etki riski).');
      const now = await observer.collectionDisposition.findUniqueOrThrow({
        where: { id: st.dispositionId }, select: { status: true, postedAt: true },
      });
      const completed = now.status === 'POSTED' && !!now.postedAt;
      reconciled = completed ? 'SUNUCUDA TAMAMLANDI' : 'BELIRSIZ';
      // POSTED degilse "gerceklesmedi" DENMEZ: sunucu hala isliyor olabilir.
      chk('A2-8', 'belirsiz sonuc icin TAMAMLANMA KANITI', completed,
        completed
          ? `kalici durum POSTED — tamamlanma KANITLANDI · tekrar gonderim=YOK`
          : `kalici durum=${now.status} — tamamlanma KANITI YOK, sonuc BELIRSIZ BIRAKILDI `
            + `("gerceklesmedi" DENMEZ; sunucu hala isliyor olabilir) · tekrar gonderim=YOK`);
    } else {
      const postOk = postingOut.status === 200 || postingOut.status === 201;
      chk('A2-8', 'posting istegi basariyla tamamlandi', postOk,
        `HTTP ${postingOut.status} · toplam sure=${postingOut.elapsedMs} ms`
        + (postOk ? '' : ` · govde=${JSON.stringify(postingOut.body).slice(0, 300)}`));
      chk('A2-9', 'istek suresi kilit tutma suresinden UZUN (gercekten bekledi)',
        postingOut.elapsedMs >= heldMs * 0.6, `istek=${postingOut.elapsedMs} ms · kilit=${heldMs} ms`);
    }

    L.step('A2-10', 'nihai posting sonucu');
    const post = await observer.collectionDisposition.findUniqueOrThrow({
      where: { id: st.dispositionId },
      select: { status: true, postedAt: true, manualReversalRequiredAt: true },
    });
    chk('A2-10', 'disposition POSTED ve postedAt yazildi',
      post.status === 'POSTED' && !!post.postedAt && !post.manualReversalRequiredAt,
      `status=${post.status} postedAt=${post.postedAt ? 'VAR' : 'YOK'} manualReversal=${post.manualReversalRequiredAt ? 'VAR' : 'YOK'}`);

    const okN = results.filter((r) => r.ok).length;
    const unm = results.filter((r) => r.unmeasured).length;
    console.log(`\nKABUL-A2 (posting kilit beklemesi + finansal sonuc): ${okN}/${results.length}`
      + `${unm ? ` · OLCULEMEYEN ${unm}` : ''} ${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'F04-LIVE-A2', tenant: st.slug, runId: st.runId,
      lockHolderPid, lockBudgetMs: LOCK_BUDGET_MS, lockHeldMs: heldMs,
      dbGuards: {
        lockTimeoutMs: LOCK_BUDGET_MS,
        statementTimeoutMs: LOCK_BUDGET_MS + DB_GUARD_SLACK_MS,
        idleInTxTimeoutMs: LOCK_BUDGET_MS + DB_GUARD_SLACK_MS,
      },
      postingHttpStatus: postingOut.indeterminate ? 'BELIRSIZ' : postingOut.status,
      reconciledFromPersistedState: reconciled,
      result: `${okN}/${results.length}`, unmeasured: unm,
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } catch (e) {
    console.error('\nA2 HATASI:', e && e.message ? e.message : e);
    if (e && (e.observationFailed || e.budgetExceeded)) {
      console.error('  → ZORUNLU OLCUM YAPILAMADI veya BUTCE DOLDU. Bu sonuc "kilit yok" DEGILDIR.');
    }
    // ── HATA YOLUNDA DA kilit/transaction sonlanmasini DOGRUDAN dogrula ──
    if (lockHolderPid) {
      try {
        const rel = await L.assertLockReleased(observer, lockHolderPid);
        console.error(`  kilit sonlanma dogrulamasi (hata yolu): birakildi=${rel.released}`
          + ` · oturum=${rel.session.present ? rel.session.state : 'KAPANDI'}`
          + ` · acikTransaction=${rel.session.inTransaction} · hala bloke edilen=${rel.stillBlocking}`);
        if (!rel.released) console.error('  !!! KILIT SIZINTISI — transaction hala acik.');
      } catch (e2) {
        console.error(`  kilit sonlanmasi DOGRULANAMADI: ${e2 && e2.message}`);
      }
    }
    process.exitCode = 3;
  } finally {
    // Posting istegi kilit birakildiktan sonra tamamlanabilir; ASLA iptal/tekrar EDILMEZ.
    await postingPromise.catch((e) => console.error('  posting istegi hatasi:', e && e.message));
    await prisma.$disconnect().catch(() => {});
    await observer.$disconnect().catch(() => {});
  }
})();
