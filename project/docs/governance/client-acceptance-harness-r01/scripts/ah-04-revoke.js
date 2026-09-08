/*
 * CLIENT KABUL ALTYAPISI (İ1a) — ADIM 4: ERİŞİM SONLANDIRMA
 *
 * KURAL: test hesaplarının erişimi **başarı ve hata sonunda** sonlandırılır. Sonlandırma
 * doğrulanamıyorsa AÇIKÇA BAŞARISIZ raporlanır — "denedim" yeterli sayılmaz.
 *
 * Sonlandırma ürünün KENDİ iki mekanizmasıyla yapılır (defense-in-depth):
 *   1) `User.isActive = false`      → login reddi (auth.service.ts:124) **ve** mevcut isteklerde
 *                                     `validateUser` reddi (auth.service.ts:171)
 *   2) `User.tokenVersion` artışı   → önceden alınmış JWT bir sonraki istekte reddedilir
 *                                     (auth.service.ts:185)
 *
 * ÖLÇÜM — üç ayrı kanıt, aktör başına:
 *   V-1  sonlandırmadan ÖNCE alınmış token artık REDDEDİLİYOR   (asıl kanıt)
 *   V-2  yeni oturum açma REDDEDİLİYOR
 *   V-3  kalıcı durum: isActive=false ve tokenVersion arttı
 *
 * HTTP 429 KANIT SAYILMAZ. `login-rate-limit.guard.ts` IP başına 10 deneme/dakika uygular ve
 * aşıldığında 5 dakika bloklar; bu durumda login isteği kimlik doğrulamaya HİÇ ULAŞMAZ.
 * "Reddedildi" görüntüsü sonlandırmadan değil hız sınırından gelir — bu yüzden 429 alan V-2
 * ÖLÇÜLEMEDİ işaretlenir. Aktör kararı o hâlde V-1 + V-3 üzerinden verilir (V-1 zaten erişimin
 * kesildiğinin doğrudan HTTP kanıtıdır); rapor 429'u AÇIKÇA gösterir.
 *
 * V-1 veya V-3 ölçülemezse aktör DOĞRULANAMADI sayılır ve betik FAIL çıkar.
 *
 * `ah-run.js` bunu `finally` içinde çağırır: kurulum veya ölçüm çökse de erişim kapatılır.
 * Durum dosyası yoksa `AH_RUN_ID` ile kurtarılıp yine çalışır (bkz. ah-00-recover.js).
 */
'use strict';
const L = require('./ah-lib');

const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(9)} ${desc}\n            ${observed}`);
}

/** Token'ın hâlâ geçerli olup olmadığını korumalı bir uçtan ölçer. */
async function tokenStillWorks(base, token) {
  const r = await L.httpJson('GET', `${base}/auth/me`, { token, timeoutMs: 10000 });
  if (r.indeterminate) return { known: false, reason: r.indeterminateReason };
  return { known: true, works: r.status >= 200 && r.status < 300, status: r.status };
}

(async () => {
  L.assertDisposableEnvironment(); // G-0
  const base = L.requireEnv('AH_API_BASE_URL').replace(/\/+$/, '');
  const password = L.requireLoginPassword();

  const prisma = L.loadPrisma();
  try {
    // Durum dosyası yoksa runId ile kurtar — hata yolunda da çalışabilmesi ŞART.
    let st;
    try {
      st = L.loadState();
    } catch (e) {
      const runId = process.env.AH_RUN_ID;
      if (!runId) throw new Error('durum dosyasi YOK ve AH_RUN_ID verilmedi — sonlandirma YAPILAMADI');
      console.log(`  (durum dosyasi yok — AH_RUN_ID=${runId} ile kurtariliyor)`);
      st = await L.recoverState(prisma, runId);
    }
    L.assertOwnSlug(st.slug); // G-1
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    L.step('V', `erisim sonlandirma — tenant ${st.slug}`);

    const tags = ['viewer', 'user', 'elevated'];
    let rateLimited = 0;

    // ── Sonlandırmadan ÖNCE token al (V-1'in kanıt olabilmesi için şart) ──
    const preTokens = {};
    for (const tag of tags) {
      const a = st.actors[tag];
      if (!a) continue;
      const r = await L.login(base, a.email, password, st.slug);
      preTokens[tag] = r.ok ? r.token : null; // token BELLEKTE kalır, yazılmaz (G-4)
    }

    // ── SONLANDIRMA ──
    const before = await prisma.user.findMany({
      where: { tenantId: st.tenantId },
      select: { id: true, email: true, isActive: true, tokenVersion: true },
    });
    await prisma.user.updateMany({
      where: { tenantId: st.tenantId },
      data: { isActive: false, tokenVersion: { increment: 1 } },
    });
    const after = await prisma.user.findMany({
      where: { tenantId: st.tenantId },
      select: { id: true, email: true, isActive: true, tokenVersion: true },
    });

    // ── AKTÖR BAŞINA ÜÇ KANIT ──
    for (const tag of tags) {
      const a = st.actors[tag];
      if (!a) { chk(`V-${tag}`, `${tag} aktoru`, false, 'aktor durumda YOK — sonlandirma DOGRULANAMADI'); continue; }

      // V-1: önceden alınmış token artık reddediliyor mu?
      let v1ok = false; let v1note;
      if (!preTokens[tag]) {
        v1note = 'sonlandirma ONCESI token alinamadi — bu kanit OLCULEMEDI';
      } else {
        const probe = await tokenStillWorks(base, preTokens[tag]);
        if (!probe.known) { v1note = `BELIRSIZ: ${probe.reason}`; }
        else { v1ok = !probe.works; v1note = `eski token HTTP ${probe.status} → ${probe.works ? 'HALA GECERLI(!)' : 'REDDEDILDI'}`; }
      }

      // V-2: yeni oturum açma reddediliyor mu? (429 KANIT DEĞİL — bkz. dosya başlığı)
      const re = await L.login(base, a.email, password, st.slug);
      let v2ok; let v2note;
      if (re.indeterminate) { v2ok = false; v2note = `BELIRSIZ: ${re.reason}`; }
      else if (re.status === 429) {
        v2ok = null; // ölçülemedi — ret sebebi sonlandirma DEGIL, hiz siniri
        rateLimited += 1;
        v2note = 'OLCULEMEDI: HTTP 429 hiz siniri — istek kimlik dogrulamaya ULASMADI,'
          + ' bu bir sonlandirma kaniti DEGILDIR';
      } else if (re.ok) { v2ok = false; v2note = `yeni login HTTP ${re.status} → ACILDI(!)`; }
      else { v2ok = true; v2note = `yeni login HTTP ${re.status} → REDDEDILDI`; }

      // V-3: kalıcı durum
      const b = before.find((u) => u.id === a.id);
      const f = after.find((u) => u.id === a.id);
      const v3ok = !!f && f.isActive === false && !!b && f.tokenVersion > b.tokenVersion;
      const v3note = f
        ? `isActive=${f.isActive} · tokenVersion ${b ? b.tokenVersion : '?'}→${f.tokenVersion}`
        : 'kullanici satiri BULUNAMADI';

      // Karar: V-1 ve V-3 ZORUNLU; V-2 yalnız ölçülebildiyse bağlayıcıdır.
      const decided = v1ok && v3ok && (v2ok === null ? true : v2ok);
      chk(`V-${tag}`, `${tag}: erisim SONLANDIRILDI`
        + (v2ok === null ? ' (V-1+V-3; V-2 olculemedi)' : ' (uc kanit)'), decided,
        `[V-1] ${v1note} · [V-2] ${v2note} · [V-3] ${v3note}`);
    }

    // ── Tenant genelinde artakalan aktif hesap YOK ──
    const stillActive = after.filter((u) => u.isActive);
    chk('V-tenant', 'tenant\'ta AKTIF test hesabi KALMADI', stillActive.length === 0,
      `${after.length} hesap · aktif kalan ${stillActive.length}`
      + (stillActive.length ? ` (${stillActive.map((u) => u.email).join(', ')})` : ''));

    const okN = results.filter((r) => r.ok).length;
    const allOk = okN === results.length;
    console.log(`\nERISIM SONLANDIRMA: ${okN}/${results.length} ${allOk ? 'PASS' : 'FAIL'}`);
    if (!allOk) {
      console.error('!!! SONLANDIRMA DOGRULANAMADI — hesaplar acik KALMIS OLABILIR.');
      console.error(`    Elle kontrol: tenant ${st.slug} (runId ${st.runId})`);
    }
    if (rateLimited) {
      console.log(`  NOT: ${rateLimited} aktorde V-2 hiz siniri (429) nedeniyle OLCULEMEDI.`);
      console.log('       Karar V-1 (eski token reddi) + V-3 (kalici durum) uzerinden verildi.');
      console.log('       429 kanit sayilmadi; pencereyi bosaltmak icin AH_PRE_REVOKE_PAUSE_MS kullanin.');
    }
    console.log(JSON.stringify({
      record: 'AH-ACCESS-REVOCATION', tenant: st.slug, runId: st.runId,
      result: `${okN}/${results.length}`, verified: allOk,
      v2RateLimitedActors: rateLimited, secretsPrinted: false,
    }, null, 1));
    process.exitCode = allOk ? 0 : 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => {
  console.error('\nSONLANDIRMA HATASI:', e && e.message ? e.message : e);
  console.error('  → Erisim sonlandirma DOGRULANAMADI. Bu bir BASARISIZLIKTIR.');
  process.exitCode = 1;
});
