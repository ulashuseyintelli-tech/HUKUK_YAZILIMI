/*
 * CLIENT KABUL ALTYAPISI (İ1a) — ADIM 1: SENTETİK TENANT + ÜÇ ROL (ATOMİK)
 *
 * YAZMA KAPSAMI — TAM OLARAK 6 satır:
 *   1 Tenant(`ah-<runId>`) · 3 User (viewer / user / elevated) · 1 Lawyer(PARTNER, elevated'a bağlı)
 *   1 Client (tenant sınırı ve müvekkil yüzeyi denemeleri için)
 * Mevcut hiçbir satır güncellenmez veya silinmez.
 *
 * ROL ADI YETKİ KANITI DEĞİLDİR. Yetki bağları ürünün KENDİ mekanizmasından kurulur:
 *   - `elevated`  : rol **USER** + `Lawyer.lawyerRank = PARTNER` + `staffMember` YOK
 *                   → `isApproverEligible` true (office-approval.service.ts:452-465)
 *   - `user`      : rol **USER** + Lawyer YOK → `isApproverEligible` false
 *   - `viewer`    : rol VIEWER → mutation kapılarında fail-closed DENY
 *
 * DİKKAT — `elevated` bilerek ADMIN **DEĞİLDİR**. Hassas alan eşiği
 * `role === 'ADMIN' || isApproverEligible` şeklindedir (client.service.ts:528-531); elevated'a
 * ADMIN verilseydi ölçüm ROL ADINI doğrulardı, eligibility bağını değil. `user` ve `elevated`
 * AYNI role sahiptir; aralarındaki TEK fark PARTNER bağıdır — böylece `ah-02-roles.js`'in
 * ölçtüğü ayrım yalnız ürünün eligibility mekanizmasından gelebilir.
 * Bu ayrım İ1a'da **ölçülerek** doğrulanır (`ah-02-roles.js`), varsayılmaz.
 *
 * ATOMİKLİK: altı satır TEK transaction'da yazılır — yarıda kesilme yetim kayıt bırakmaz.
 * KURTARILABİLİRLİK: `runId` sır içermez ve slug'a gömülüdür; commit sonrası durum dosyası
 * yazılamazsa betik kurtarma talimatını basar ve **sıfırdan farklı** çıkar.
 * SIR: parola durum dosyasına yazılmaz ve çıktıya BASILMAZ (G-4).
 */
'use strict';
const path = require('path');
const L = require('./ah-lib');

const PRISMA_ROOT = process.env.AH_PRISMA_ROOT
  || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE20/project/apps/api/node_modules/@prisma/client';
const BCRYPT = process.env.AH_BCRYPT_PATH || path.join(PRISMA_ROOT, '../../bcrypt');

// YALNIZ NEGATİF KONTROL: transaction'ı belirtilen adımdan sonra bilerek düşürür.
const ABORT_AFTER = process.env.AH_ABORT_AFTER || null;

(async () => {
  // ── G-0: HERHANGİ BİR YAZMADAN ÖNCE ortam izolasyonu ──
  const envInfo = L.assertDisposableEnvironment();
  L.step('S0', 'ORTAM KAPISI (G-0) — yazmadan ONCE');
  L.log(`      DB   : ${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName} (disposable allowlist)`);
  L.log(`      API  : ${envInfo.apiHost}:${envInfo.apiPort} (loopback)`);

  const prisma = L.loadPrisma();
  const bcrypt = require(BCRYPT);
  const password = L.requireLoginPassword(); // bellekten; BASILMAZ
  const runId = (process.env.AH_RUN_ID || L.newRunId()).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) throw new Error(`gecersiz AH_RUN_ID='${runId}' (8 hex)`);
  const slug = `${L.TENANT_PREFIX}${runId}`;
  L.assertOwnSlug(slug); // G-1

  try {
    const clash = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
    if (clash) throw new Error(`G-3 IHLALI: '${slug}' zaten var`);

    // Komşu tenant'ların izolasyon taban ölçümü (koşum sonrası karşılaştırılır).
    // Disposable veritabanında binlerce tenant olabilir → tenant başına sorgu YOK, iki groupBy.
    const watched = await L.isolationFingerprint(prisma, null);

    const passwordHash = await bcrypt.hash(password, 10); // transaction DIŞINDA

    L.step('S1', `atomik kurulum — 6 satir · runId=${runId}`);
    const written = [];
    const out = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: `AH ${runId}`, slug }, select: { id: true },
      });
      written.push('Tenant');

      const mk = async (tag, role) => {
        const u = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: `${tag}-${runId}@ah-harness.invalid`, // RFC 2606
            name: tag.toUpperCase(), surname: 'Harness', passwordHash, role,
          },
          select: { id: true, email: true, role: true },
        });
        written.push(`User:${tag}`);
        return u;
      };
      const viewer = await mk('viewer', 'VIEWER');
      const user = await mk('user', 'USER');
      if (ABORT_AFTER === 'user') throw new Error('AH_ABORT_AFTER=user — negatif kontrol');
      const elevated = await mk('elevated', 'USER'); // rol `user` ile AYNI — fark YALNIZ PARTNER bagi

      // Elevated eşiği ürünün kendi mekanizmasından: PARTNER lawyer + staffMember YOK.
      await tx.lawyer.create({
        data: {
          tenantId: tenant.id, name: 'AH', surname: 'Partner',
          lawyerRank: 'PARTNER', userId: elevated.id,
        },
        select: { id: true },
      });
      written.push('Lawyer:PARTNER');

      const client = await tx.client.create({
        data: {
          tenantId: tenant.id, type: 'PERSON', name: `AH Client ${runId}`,
          email: `client-${runId}@ah-harness.invalid`, // yalniz yerel sink'e gider
        },
        select: { id: true },
      });
      written.push('Client');

      return {
        tenantId: tenant.id, clientId: client.id,
        actors: {
          viewer: { id: viewer.id, email: viewer.email, role: viewer.role },
          user: { id: user.id, email: user.email, role: user.role },
          elevated: { id: elevated.id, email: elevated.email, role: elevated.role },
        },
      };
    }, { timeout: Number(process.env.AH_SETUP_TX_TIMEOUT_MS || 30000), maxWait: 10000 });

    if (written.length !== 6) throw new Error(`beklenen 6 satir, yazilan ${written.length}`);
    L.step('S2', `KURULUM COMMIT EDILDI — ${written.length}/6 · tenant=${slug}`);

    // ── G-0 ikinci katman: API GERÇEKTEN aynı disposable DB'ye mi bağlı? ──
    L.step('S3', 'API baglanti dogrulamasi (ayni disposable veritabani mi?)');
    const base = L.requireEnv('AH_API_BASE_URL').replace(/\/+$/, '');
    const bound = await L.verifyApiBoundToSameDatabase(
      prisma, base, out.actors.elevated.email, password, slug);
    L.log(`      ${bound.bound ? 'BAGLI' : 'DOGRULANAMADI'} — ${bound.reason}`);
    if (!bound.bound) {
      // Ortam doğrulanamadıysa KALICI YAZMA BIRAKILMAZ: bu koşumun ürettiği satırlar geri alınır
      // (Tenant → User/Lawyer/Client/Office cascade). Böylece "ortam belirsizse yazma olmaz"
      // kuralı commit sonrası da geçerli kalır ve yetim kayıt kalmaz.
      L.step('S4', 'ORTAM DOGRULANAMADI — bu kosumun yazdiklari GERI ALINIYOR');
      let rolledBack = false;
      try {
        await prisma.tenant.delete({ where: { id: out.tenantId } });
        rolledBack = true;
      } catch (delErr) {
        console.error(`      GERI ALMA BASARISIZ: ${delErr && delErr.message}`);
      }
      const leftover = await prisma.tenant.count({ where: { slug } }).catch(() => -1);
      L.log(`      geri alindi=${rolledBack} · kalan tenant=${leftover === -1 ? 'OLCULEMEDI' : leftover}`);
      if (!rolledBack || leftover !== 0) {
        console.error(`      !!! Kalinti olabilir. Elle: AH_RUN_ID=${runId} node ah-00-recover.js --list`);
      }
      throw new Error(bound.rateLimited
        ? 'API baglantisi hiz siniri nedeniyle DOGRULANAMADI — yazma geri alindi, kosum durdu'
        : 'API disposable veritabanina bagli DEGIL veya dogrulanamadi — ortam BELIRSIZ');
    }

    const state = {
      package: 'CLIENT-ACCEPTANCE-HARNESS-R01',
      createdAt: new Date().toISOString(),
      runId, slug, ...out,
      environment: envInfo,
      apiBoundVerified: true,
      isolationBaseline: watched, // kompakt parmak izi (bkz. L.isolationFingerprint)
      writtenRows: written,
    };
    try {
      L.saveState(state); // G-4: sır alanı reddedilir
    } catch (e) {
      console.error('\n!!! KURULUM COMMIT EDILDI ama DURUM DOSYASI YAZILAMADI:', e && e.message);
      console.error('    Kayitlar disposable DB\'de MEVCUTTUR. Kurtarma:');
      console.error(`      AH_RUN_ID=${runId} node ah-00-recover.js`);
      process.exitCode = 4; // sessizce basarili SAYILMAZ
      return;
    }
    L.log(`      durum dosyasi: ${process.env.AH_STATE_FILE || 'ah-state.json'} (SIR ICERMEZ)`);
    L.log(`      kurtarma: AH_RUN_ID=${runId} node ah-00-recover.js`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => {
  console.error('\nKURULUM HATASI:', e && e.message ? e.message : e);
  if (e && e.gate === 'G-0') console.error('  → ORTAM KAPISI: hicbir yazma YAPILMADI.');
  process.exitCode = 1;
});
