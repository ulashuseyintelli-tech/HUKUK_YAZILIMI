/*
 * CLIENT İ8 — ADIM 1: KENDİ SENTETİK ALANI (ATOMİK, 6 SATIR)
 *
 * NEDEN YENİ ALAN: R02 §3.5 — "İ9–İ16 aynı sentetik alanı kullanır. Bağımsızlıkları
 * kanıtlanana kadar SIRALI koşulur: **her koşum kendi tenant'ını üretir** veya bir öncekinin
 * kalıcı durumunu bozmadığı gösterilir." İ1b'nin alanı (`cl-acc-afce215b`) KAPALIDIR
 * (`User.isActive=false`, `Case.status=CLOSED`); onu yeniden açmak İ1b'nin kapanış kanıtını
 * bozardı. Bu yüzden İ8 KENDİ tenant'ını üretir ve İ1b alanına **YAZMAZ**.
 *
 * YAZMA KAPSAMI (TAM OLARAK 6 satır — İ1b'nin 6 satırından FARKLI bileşim):
 *   1 Tenant(cl-acc-<runId>, lifecycle ACTIVE — login için zorunlu)
 *   3 User: viewer(VIEWER) · user(USER) · elevated(USER)   ← üç yetki bandı
 *   1 Lawyer(PARTNER, userId=elevated)                      ← "elevated" ROL ADIYLA değil BAĞLA
 *   1 Client(PERSON, e-posta YOK, iletişim kişisi YOK)      ← gönderim yolu açılmaz
 * **Case/CaseClient YAZILMAZ** → `updateRiskScores` (tenant ACTIVE + Case ACTIVE) hiçbir Case
 * seçemez; kalıcı cron maruziyeti YAPISAL OLARAK 0'dır (İ1b'de Case vardı, CLOSED'a çekilmişti).
 *
 * ÖLÇÜM GEÇERLİLİĞİ: `user` ve `elevated` BİLEREK aynı roldedir (USER). Aradaki tek fark PARTNER
 * `Lawyer` bağıdır. Böylece "hassas alan reddi" rol adından değil YETKİ BAĞINDAN ölçülür
 * (İ1a R-0x deseni; owner "rol adını yetki kanıtı sayma" hükmü).
 *
 * ATOMİKLİK: tek transaction; EXPECTED sayımı TRANSACTION İÇİNDE (İ5b dersi: commit sonrası
 * throw fail-open üretiyordu). Yarıda kesilme yetim kayıt bırakmaz.
 *
 * SIR: parola `CL_LOGIN_PASSWORD`ten alınır; çıktıya/durum dosyasına/repoya YAZILMAZ.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');
// İzolasyon parmak izi İ1a'dan AYNEN kullanılır (kopya mantık yok). `ah-lib` require'ı yalnız
// saf fonksiyon getirir; G-0 kapısı fonksiyon İÇİNDE olduğu için yükleme yan etki üretmez.
const AH = require('../../client-acceptance-harness-r01/scripts/ah-lib');

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i8-state.json');
const BCRYPT = process.env.CL_BCRYPT_PATH
  || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/bcrypt';
// YALNIZ NEGATİF KONTROL: transaction'ı belirtilen adımdan sonra düşürür (atomiklik kanıtı).
const ABORT_AFTER = process.env.I8_ABORT_AFTER || null;

(async () => {
  const env = L.assertEnvironment(); // G-0 — YAZMADAN ÖNCE
  const runId = (process.env.CL_RUN_ID || crypto.randomBytes(4).toString('hex')).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) throw new Error(`gecersiz CL_RUN_ID='${runId}'`);
  const slug = `${L.TENANT_PREFIX}${runId}`;
  L.assertOwnSlug(slug); // G-1
  const password = L.requireEnv('CL_LOGIN_PASSWORD'); // G-4: yalnız bellekte

  const prisma = L.loadPrisma();
  const bcrypt = require(BCRYPT);
  try {
    if (await prisma.tenant.findFirst({ where: { slug }, select: { id: true } })) {
      throw new Error(`G-3 IHLALI: '${slug}' zaten var`);
    }
    console.log(`[S0] ortam=${env.environment} ${env.dbHost}:${env.dbPort}/${env.dbName}`
      + (env.ownerGoRef ? ` · ownerGoRef=${env.ownerGoRef}` : '') + ` · slug=${slug}`);

    // Komşu tenant taban parmak izi — koşum sonunda U-6 ile karşılaştırılır (kendi tenant HARİÇ).
    const isolationBaseline = await AH.isolationFingerprint(prisma, null);
    console.log(`[S0] izolasyon tabani: ${isolationBaseline.tenantsObserved} komsu tenant`
      + ` · client ${isolationBaseline.clientTotal} · user ${isolationBaseline.userTotal}`
      + ` · digest ${isolationBaseline.digest}`);

    const passwordHash = await bcrypt.hash(password, 10); // transaction DIŞINDA
    const EXPECTED = 6;
    const written = [];
    const out = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `CL I8 ${runId}`, slug }, select: { id: true } });
      written.push('Tenant');

      const mk = async (tag, role) => {
        const u = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: `${tag}-${runId}@cl-acceptance.invalid`, // RFC 2606 — teslim EDİLEMEZ
            name: tag.toUpperCase(), surname: 'I8', passwordHash, role,
          },
          select: { id: true, email: true, role: true },
        });
        written.push(`User:${tag}`);
        return u;
      };
      const viewer = await mk('viewer', 'VIEWER');
      const user = await mk('user', 'USER');
      if (ABORT_AFTER === 'user') throw new Error('I8_ABORT_AFTER=user — negatif kontrol');
      // `elevated` rolü `user` ile AYNI (USER). Fark YALNIZ aşağıdaki PARTNER bağıdır.
      const elevated = await mk('elevated', 'USER');

      await tx.lawyer.create({
        data: { tenantId: tenant.id, name: 'CL', surname: 'Partner', lawyerRank: 'PARTNER', userId: elevated.id },
        select: { id: true },
      });
      written.push('Lawyer:PARTNER');

      const client = await tx.client.create({
        // email BİLEREK yok → aylık teslim `resolveRecipientEmail` null → SKIPPED_NO_RECIPIENT
        data: { tenantId: tenant.id, type: 'PERSON', name: `CL I8 Client ${runId}` },
        select: { id: true },
      });
      written.push('Client');

      // EXPECTED kontrolü TRANSACTION İÇİNDE → uyuşmazlık = ROLLBACK, yetim kayıt YOK.
      if (written.length !== EXPECTED) throw new Error(`beklenen ${EXPECTED} satir, yazilan ${written.length} — ROLLBACK`);
      return {
        tenantId: tenant.id, clientId: client.id,
        actors: {
          viewer: { id: viewer.id, email: viewer.email, role: viewer.role },
          user: { id: user.id, email: user.email, role: user.role },
          elevated: { id: elevated.id, email: elevated.email, role: elevated.role },
        },
      };
    }, { timeout: 30000, maxWait: 10000 });

    const state = {
      package: 'CLIENT-LIVE-ACCEPTANCE-I8-R01', createdAt: new Date().toISOString(),
      environment: env.environment, ownerGoRef: env.ownerGoRef, runId, slug, ...out,
      isolationBaseline, passwordStored: false, writtenRows: written, writtenRowCount: written.length,
    };
    L.assertNoSecrets(state); // G-4
    try { fs.writeFileSync(STATE, JSON.stringify(state, null, 1), 'utf8'); }
    catch (e) {
      console.error(`!!! KURULUM COMMIT EDILDI ama durum dosyasi YAZILAMADI: ${e && e.message}`);
      console.error(`    Kapatma yalniz runId ile: CL_RUN_ID=${runId} node ../../client-live-acceptance-i1b-r01/scripts/cl-09-close-access.js`);
      process.exitCode = 4; return;
    }
    console.log(`[S1] KURULUM COMMIT EDILDI — ${written.length}/${EXPECTED} satir · runId=${runId} · tenant=${slug}`);
    console.log(JSON.stringify({
      record: 'CL-I8-SETUP', runId, slug, environment: env.environment, ownerGoRef: env.ownerGoRef,
      writtenRows: written, actorRoles: Object.fromEntries(Object.entries(out.actors).map(([k, v]) => [k, v.role])),
      caseRowsWritten: 0, isolationBaselineDigest: isolationBaseline.digest,
    }, null, 1));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nKURULUM HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
