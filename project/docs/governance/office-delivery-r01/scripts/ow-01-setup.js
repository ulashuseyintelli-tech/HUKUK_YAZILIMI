/*
 * OFFICE YAZMA KABUL — ADIM 1: SENTETIK ALAN KURULUMU (ATOMIK)
 *
 * A-02 §3 envanteri — TAM 7 SATIR, tek transaction:
 *   1 Tenant(off-acc-<runId>) · 2 Office · 3 User ADMIN(F01 pozitif) ·
 *   4 Lawyer PARTNER(User#3'e bagli, Office#2) · 5 User personel(F01 negatif) ·
 *   6 StaffMember(User#5'e bagli) · 7 Lawyer ikinci (ast)
 *
 * Mevcut hicbir satir GUNCELLENMEZ veya SILINMEZ. Yarida kesilirse ROLLBACK — hicbir satir kalmaz.
 *
 * SIR YONETIMI: parolalar YALNIZ bellekte uretilir (ow-run.js), env ile gecirilir; durum
 * dosyasina yazilmaz (G-4 assertNoSecrets ile ZORLANIR) ve stdout'a BASILMAZ.
 *
 * OLCULEN SOZLESME NOTU (A-06): `ReportingLine` semasi `actorUserId`/`managerUserId` ile
 * KULLANICI baglar, avukat DEGIL (`reporting-line.service.ts assignManager`). A-02 §3'te
 * 7. satir "Lawyer ikinci (ast) — A-06 raporlama hatti atamasi" olarak tarif edilmis; bu
 * tarif SEMA ILE ORTUSMUYOR. Satir sayisi DEGISTIRILMEDI (7/7 korunur): A-06 raporlama
 * hatti iki KULLANICI ile kurulur (ast = personel User#5, amir = ADMIN User#3), ikinci
 * avukat ise A-04'un `order/update` cok-satirli yolunda kullanilir. Fark rapora gecer.
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const L = require('./ow-lib');

const ABORT_AFTER = process.env.OW_ABORT_AFTER || null; // yalniz negatif kontrol

(async () => {
  // ── G-0: HERHANGI BIR YAZMADAN ONCE ──
  const env = L.assertRunEnvironment();
  L.step('S0', `ortam kapisi GECILDI — db=${env.dbName}@${env.dbHost}:${env.dbPort} · api=${env.apiHost}:${env.apiPort}`);

  const prisma = L.loadPrisma();
  const bcrypt = require(path.join(
    process.env.OW_PRISMA_ROOT || path.join(__dirname, '../../../../apps/api/node_modules/@prisma/client'),
    '../../bcrypt',
  ));

  const runId = (process.env.OW_RUN_ID || L.newRunId()).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) throw new Error(`gecersiz OW_RUN_ID='${runId}' (8 hex bekleniyor)`);
  const slug = `${L.TENANT_PREFIX}${runId}`;
  L.assertOwnSlug(slug); // G-1

  const adminPassword = L.requireLoginPassword();
  const staffPassword = process.env.OW_STAFF_PASSWORD || adminPassword;

  try {
    // ── G-3 + izolasyon baseline (transaction DISINDA, yazmadan ONCE) ──
    const existing = await prisma.tenant.findMany({ select: { id: true, slug: true } });
    if (existing.some((t) => t.slug === slug)) throw new Error(`G-3 IHLALI: '${slug}' zaten var`);

    const globalTotals = {
      tenant: existing.length,
      office: await prisma.office.count(),
      lawyer: await prisma.lawyer.count(),
      staff: await prisma.staffMember.count(),
      user: await prisma.user.count(),
      audit: await prisma.auditLog.count(),
    };
    // Izlenen kume: bilinen korunan tenant'lar + en fazla 20 komsu.
    //
    // A-02 §7 ZORLAMASI: "izlenen tenant'larda fark olculemezse (bos kume) -> FAIL".
    // Bu, F04 provasinin yakaladigi kusurun ayni sinifidir ("izolasyon kapisi bos izleme
    // kumesiyle PASS veriyordu"). TAZE bir disposable veritabaninda komsu tenant YOKTUR,
    // dolayisiyla kapi olcum yapamaz. Sessizce PASS vermek YERINE:
    //   - canli/dolu ortamda: gercek komsular izlenir,
    //   - taze disposable ortamda: olcumun ANLAMLI olmasi icin bir SEYIRCI tenant kurulur.
    // Seyirci tenant kabul kapsamina girmez; yalnizca "bizim disimizda degisiklik olmadi"
    // iddiasinin olculebilir olmasini saglar. Kurulamiyorsa kapi FAIL eder.
    let existingForWatch = existing;
    if (existing.length === 0) {
      const bystanderSlug = `${L.TENANT_PREFIX}bystander-${runId}`;
      L.assertOwnSlug(bystanderSlug);
      const b = await prisma.tenant.create({
        data: { name: `OFFICE Bystander ${runId}`, slug: bystanderSlug },
        select: { id: true, slug: true },
      });
      await prisma.office.create({ data: { tenantId: b.id, name: 'Seyirci Buro' } });
      // Seyirciye TEK kullanici: cross-tenant olcutlerinin (or. A-06 yabanci actorUserId)
      // BOS GOZLEM KUMESI yuzunden OLCULEMEDI dusmemesi icin. Bu kullanici KABUL AKTORU
      // DEGILDIR, hicbir kabul adimi onunla oturum acmaz; yalniz "reddedilmesi gereken
      // yabanci hedef" olarak OKUNUR. Kapanis onu DEGISTIRMEZ (revoke-access yalniz
      // kendi tenant'imizi hedefler) ve T-3 bunu dogrular.
      await prisma.user.create({
        data: {
          tenantId: b.id,
          email: `off-${runId}-bystander@office-acceptance.invalid`,
          name: 'Seyirci', surname: 'Kullanici', passwordHash: 'x', role: 'USER',
        },
      });
      existingForWatch = [b];
      L.log(`      IZOLASYON KAPISI: komsu tenant yoktu -> SEYIRCI tenant kuruldu (${b.slug})`);
      L.log('      (kabul kapsami DISI; yalniz "disimizda degisiklik yok" iddiasini olculebilir kilar)');
    }

    const sample = existingForWatch.filter((t) => !L.FORBIDDEN_SLUGS.has(t.slug)).slice(0, 20);
    const watched = [...existingForWatch.filter((t) => L.FORBIDDEN_SLUGS.has(t.slug)), ...sample];
    if (watched.length === 0) {
      throw new Error('A-02 §7 IHLALI: izlenen tenant kumesi BOS — izolasyon olculemez, kurulum DURDU');
    }
    const protectedTenants = [];
    for (const t of watched) {
      protectedTenants.push({
        slug: t.slug,
        office: await prisma.office.count({ where: { tenantId: t.id } }),
        lawyer: await prisma.lawyer.count({ where: { tenantId: t.id } }),
        staff: await prisma.staffMember.count({ where: { tenantId: t.id } }),
        user: await prisma.user.count({ where: { tenantId: t.id } }),
        audit: await prisma.auditLog.count({ where: { tenantId: t.id } }),
      });
    }
    L.log(`      hedef DB'de ${existing.length} tenant · izlenen ${protectedTenants.length}`
      + ` · bilinen korunan: ${watched.filter((t) => L.FORBIDDEN_SLUGS.has(t.slug)).map((t) => t.slug).join(', ') || 'YOK'}`);

    const adminHash = await bcrypt.hash(adminPassword, 10);
    const staffHash = await bcrypt.hash(staffPassword, 10);

    L.step('S1', 'atomik kurulum (tek transaction) — 7 satir');
    const written = [];
    const out = await prisma.$transaction(async (tx) => {
      // 1
      const tenant = await tx.tenant.create({ data: { name: `OFFICE Acceptance ${runId}`, slug }, select: { id: true } });
      written.push('Tenant');

      // 2
      const office = await tx.office.create({
        data: { tenantId: tenant.id, name: `Kabul Burosu ${runId}` },
        select: { id: true },
      });
      written.push('Office');

      // 3 — F01 POZITIF aktor (ADMIN kanonik esleme)
      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: `off-${runId}-admin@office-acceptance.invalid`, // RFC 2606
          name: 'Kabul', surname: 'Yonetici', passwordHash: adminHash, role: 'ADMIN',
        },
        select: { id: true, email: true },
      });
      written.push('User(ADMIN)');
      if (ABORT_AFTER === 'User(ADMIN)') throw new Error('OW_ABORT_AFTER — negatif kontrol');

      // 4 — PARTNER avukat, ADMIN kullaniciya ve Office'e bagli
      const partner = await tx.lawyer.create({
        data: {
          tenantId: tenant.id, officeId: office.id, userId: adminUser.id,
          name: 'Kabul', surname: 'Ortak', lawyerRank: 'PARTNER',
        },
        select: { id: true },
      });
      written.push('Lawyer(PARTNER)');

      // 5 — F01 NEGATIF aktor (personel kimligi)
      const staffUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: `off-${runId}-staff@office-acceptance.invalid`,
          name: 'Kabul', surname: 'Personel', passwordHash: staffHash, role: 'USER',
        },
        select: { id: true, email: true },
      });
      written.push('User(personel)');

      // 6 — StaffMember, User#5'e bagli: F01'de HER KOSULDA false
      const staff = await tx.staffMember.create({
        data: {
          tenantId: tenant.id, officeId: office.id, userId: staffUser.id,
          firstName: 'Kabul', lastName: 'Personel', staffType: 'SEKRETER',
          tckn: '11111111110',
        },
        select: { id: true },
      });
      written.push('StaffMember');

      // 7 — ikinci avukat (ast): A-04 order/update cok-satirli yolu
      const second = await tx.lawyer.create({
        data: {
          tenantId: tenant.id, officeId: office.id,
          name: 'Kabul', surname: 'Ast', lawyerRank: 'LAWYER',
        },
        select: { id: true },
      });
      written.push('Lawyer(ast)');

      return {
        tenantId: tenant.id, officeId: office.id,
        adminUserId: adminUser.id, adminEmail: adminUser.email,
        partnerLawyerId: partner.id,
        staffUserId: staffUser.id, staffEmail: staffUser.email,
        staffMemberId: staff.id, secondLawyerId: second.id,
      };
    }, { timeout: Number(process.env.OW_SETUP_TX_TIMEOUT_MS || 30000), maxWait: 10000 });

    if (written.length !== 7) throw new Error(`beklenen 7 satir, yazilan ${written.length}`);
    L.step('S2', `KURULUM COMMIT EDILDI — ${written.length}/7 satir · runId=${runId} · tenant=${slug}`);

    // ── G-0b: API GERCEKTEN ayni disposable DB'ye mi bagli? ──
    // Dogrulanamazsa yazilan satirlar GERI ALINIR (sessizce devam EDILMEZ).
    // OLCULEN KISIT: probe'un kendisi bir LOGIN'dir ve `LoginRateLimitGuard` (WINDOW_MS =
    // 60_000, IP bazli) tekrarli girisleri 429 ile reddeder. **429, "API baska DB'ye bagli"
    // ANLAMINA GELMEZ** — ilk surumde oyle raporlaniyordu ve kurulumu YANLIS gerekceyle geri
    // aliyordu. Artik: 429 ayirt edilir, pencere kadar sinirli yeniden deneme yapilir ve
    // yine de dogrulanamazsa gerekce DURUSTCE "dogrulanamadi (rate limit)" olarak raporlanir.
    // Fail-closed davranis DEGISMEZ: dogrulanamazsa satirlar GERI ALINIR.
    let apiBound = null;
    let probeReason = null;
    try {
      const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
      // OLCULEN: guard'da WINDOW_MS = 60_000 ve MAX_ATTEMPTS = 10; limit ASILDIGINDA
      // `resetAt` **BLOCK_DURATION_MS = 300_000 (5 dk)** olarak uzatilir. Yani gercek
      // kilit 1 dakika DEGIL, 5 DAKIKADIR. (Ilk olcumumde WINDOW_MS'i kilit sanmistim.)
      // Bloke istek erken THROW ettigi icin yeniden deneme kilidi UZATMAZ — guvenle
      // beklenebilir. Sunucu 429 govdesinde `retryAfter` (saniye) doner; ONU esas aliyoruz.
      const deadline = Date.now() + 360000; // 5 dk blok + pay
      let probe = null;
      for (;;) {
        probe = await L.httpJson('POST', `${base}/auth/login`, {
          body: { email: out.adminEmail, password: adminPassword, tenantSlug: slug },
          timeoutMs: 20000,
        });
        if (probe.status !== 429 || Date.now() >= deadline) break;
        const ra = Number((probe.body && probe.body.retryAfter) || 15);
        const waitMs = Math.min(Math.max(ra, 5) * 1000 + 2000, Math.max(deadline - Date.now(), 0));
        if (waitMs <= 0) break;
        L.log(`      G-0b: login rate-limit (429) — sunucu retryAfter=${ra}s; ${Math.round(waitMs / 1000)}s beklenecek`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
      apiBound = probe.status === 201 || probe.status === 200;
      if (!apiBound) {
        probeReason = probe.status === 429
          ? 'login rate-limit blogu (5 dk) icinde acilmadi — BAGLANTI DOGRULANAMADI (yanlis DB IDDIASI DEGIL)'
          : `API login probe HTTP ${probe.status}`;
        throw new Error(probeReason);
      }
    } catch (e) {
      L.log(`\n!!! G-0b DOGRULANAMADI: ${e && e.message} — yazilan satirlar GERI ALINIYOR`);
      await prisma.tenant.delete({ where: { id: out.tenantId } }).catch(() => {});
      throw new Error(
        `G-0b: API baglantisi DOGRULANAMADI — kurulum geri alindi. Gerekce: ${probeReason || (e && e.message)}`,
      );
    }
    L.log(`      G-0b: API ayni disposable DB'ye bagli (login probe 2xx)`);

    const state = {
      package: 'OFFICE-YAZMA-KABUL-R01',
      createdAt: new Date().toISOString(),
      runId, slug, ...out,
      environment: env,
      writtenRows: written,
      writtenRowCount: written.length,
      isolationBaseline: { globalTotals, protectedTenants },
      // Parolalar BILEREK yok — env ile verilir (G-4 zaten yazmayi reddeder).
      passwordStored: false,
    };
    L.saveState(state);
    L.log(`      durum dosyasi: ${process.env.OW_STATE_FILE || 'ow-state.json'} (SIR ICERMEZ)`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => {
  console.error('\nKURULUM HATASI:', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
