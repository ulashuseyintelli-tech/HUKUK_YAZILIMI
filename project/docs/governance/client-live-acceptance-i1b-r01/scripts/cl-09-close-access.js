/*
 * CLIENT İ1b — ADIM 9: ERİŞİM SONLANDIRMA (YALNIZ `runId` İLE)
 *
 * Durum dosyasına ve parolaya BAĞLI DEĞİLDİR. Kurulum commit edilip süreç zorla sonlansa
 * bile aynı alanı bulur. TEKRARI GÜVENLİDİR (ikinci çağrı `deactivated:0`, exit 0).
 * Kapatma mantığı İ5b'de doğrulanan `f04-lib.revokeTenantAccess`'tir (kopya DEĞİL).
 *
 * İKİ ADIM (ikisi de bu tenant'la sınırlı, kanıt satırı SİLİNMEZ):
 *   1) ERİŞİM: User.isActive=false + tokenVersion++  → login 401, mevcut JWT 401
 *   2) KALICI CRON MARUZİYETİ: Case.status ACTIVE→CLOSED — updateRiskScores (her gün) yalnız
 *      tenant ACTIVE + Case ACTIVE seçer ve kullanıcı isActive'ine BAKMAZ; bu adım olmadan
 *      sentetik Case her gün Case.update{riskScore} + RiskReport yazmaya DEVAM EDERDİ.
 * Başarı = accessClosed && evidencePreserved && caseCronExposureClosed; aksi exit 2.
 *
 *   CL_ENVIRONMENT=live|disposable CL_DATABASE_URL=... CL_RUN_ID=<8hex> node cl-09-close-access.js
 *   (live: CL_OWNER_GO_REF de gerekir — kapatma da yazmadır)
 */
'use strict';
const L = require('./cl-lib');

(async () => {
  const env = L.assertEnvironment(); // G-0 — kapatma da bir YAZMADIR
  const runId = L.requireEnv('CL_RUN_ID').toLowerCase();
  const prisma = L.loadPrisma();
  try {
    const field = await L.findAcceptanceField(prisma, runId); // G-1 içeride
    if (!field.exists) {
      console.log(JSON.stringify({ record: 'CL-I1B-ACCESS-CLOSE', runId, slug: field.slug, environment: env.environment,
        fieldExists: false, writeOperations: 0, verdict: 'ALAN YOK - kurulum commit edilmemis (olculdu, varsayilmadi)' }, null, 1));
      return;
    }
    const r = await L.revokeTenantAccess(prisma, field.tenantId); // G-2 içeride
    // 2) Kalıcı cron maruziyeti — erişim kapansa da devam edecek günlük yazmayı bitirir.
    const c = await L.closeCaseCronExposure(prisma, field.tenantId); // G-2 içeride
    const ok = r.accessClosed && r.evidencePreserved && c.caseCronExposureClosed;
    console.log(JSON.stringify({ record: 'CL-I1B-ACCESS-CLOSE', runId, slug: field.slug, environment: env.environment, fieldExists: true,
      usersTotal: r.userCount, usersDeactivated: r.deactivated, stillActive: r.stillActive, tokenVersionBumped: r.tokenVersionBumped,
      alreadyClosed: r.alreadyClosed, accessClosed: r.accessClosed, evidencePreserved: r.evidencePreserved,
      evidenceChanged: r.evidenceChanged, evidenceNotMeasurable: r.evidenceNotMeasurable,
      caseRowsUpdated: c.caseRowsUpdated, cronPredicateBefore: c.cronPredicateBefore, cronPredicateAfter: c.cronPredicateAfter,
      caseCronExposureClosed: c.caseCronExposureClosed, caseStatuses: c.caseStatuses,
      verdict: ok ? 'ERISIM SONLANDIRILDI + CRON MARUZIYETI KAPANDI - kanit KORUNDU'
        : (!r.accessClosed ? 'EKSIK - erisim TAM KAPANMADI' : !r.evidencePreserved ? r.verdict : 'EKSIK - cron maruziyeti KAPANMADI (Case hala ACTIVE)') }, null, 1));
    if (!ok) process.exitCode = 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nERISIM SONLANDIRMA HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
