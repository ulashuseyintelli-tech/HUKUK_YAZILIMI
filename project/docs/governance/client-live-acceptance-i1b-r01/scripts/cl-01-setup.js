/*
 * CLIENT İ1b — ADIM 1: CANLI SENTETİK KABUL ALANI KURULUMU (ATOMİK, ASGARİ)
 *
 * YAZMA KAPSAMI (TAM OLARAK 6 satır — R02 İ1b ölçütü, başkası DEĞİL):
 *   1 Tenant(cl-acc-<runId>, lifecycle ACTIVE — login için ZORUNLU)
 *   1 User(role USER, isActive true)  · 1 Lawyer(PARTNER, userId)  ← "elevated" aktör
 *   1 Client(type PERSON, **email YOK**, iletişim kişisi YOK)      ← aylık teslim alıcısı OLMAZ
 *   1 Case(GENERAL_EXECUTION, **isAutomationEnabled=false**)        ← 5-dk otomasyon cron'u dokunmaz
 *   1 CaseClient(ALACAKLI)
 * Mevcut satır güncellemesi YOK. `Office` satırı YAZILMAZ (greeting cron `if(!office) continue`).
 *
 * ATOMİKLİK: tek transaction; EXPECTED sayımı TRANSACTION İÇİNDE yapılır (İ5b dersi: commit
 * sonrası throw fail-open'a yol açıyordu). Yarıda kesilme yetim kayıt BIRAKMAZ.
 *
 * KURTARILABİLİRLİK: runId YAZMADAN ÖNCE belirlenir ve slug'a gömülüdür; süreç zorla
 * sonlanırsa `cl-09-close-access.js` yalnız runId ile alanı bulup kapatır.
 *
 * SIR: parola `CL_LOGIN_PASSWORD` ile alınır; çıktıya/durum dosyasına/repoya YAZILMAZ.
 * DIŞ BİLDİRİM: hiçbir servis çağrılmaz; e-posta alanı boş; domain `.invalid` (RFC 2606).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('./cl-lib');

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'cl-state.json');
const BCRYPT = process.env.CL_BCRYPT_PATH
  || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/bcrypt';
// YALNIZ NEGATİF KONTROL: transaction'i belirtilen adımdan sonra düşürür (atomiklik kanıtı).
const ABORT_AFTER = process.env.CL_ABORT_AFTER || null;

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
      throw new Error(`G-3 IHLALI: '${slug}' zaten var`); // çakışma → DUR
    }
    console.log(`[S0] ortam=${env.environment} ${env.dbHost}:${env.dbPort}/${env.dbName}`
      + (env.ownerGoRef ? ` · ownerGoRef=${env.ownerGoRef}` : '') + ` · slug=${slug}`);

    const passwordHash = await bcrypt.hash(password, 10); // transaction DIŞINDA
    const EXPECTED = 6;
    const written = [];
    const out = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `CL I1b ${runId}`, slug }, select: { id: true } });
      written.push('Tenant');
      const user = await tx.user.create({
        data: { tenantId: tenant.id, email: `elevated-${runId}@cl-acceptance.invalid`,
          name: 'CL', surname: 'Elevated', passwordHash, role: 'USER' },
        select: { id: true, email: true },
      });
      written.push('User');
      await tx.lawyer.create({
        data: { tenantId: tenant.id, name: 'CL', surname: 'Partner', lawyerRank: 'PARTNER', userId: user.id },
        select: { id: true },
      });
      written.push('Lawyer');
      if (ABORT_AFTER === 'Lawyer') throw new Error('CL_ABORT_AFTER=Lawyer — negatif kontrol');
      const client = await tx.client.create({
        // email BİLEREK yok: aylık teslim `resolveRecipientEmail` → null → SKIPPED_NO_RECIPIENT
        data: { tenantId: tenant.id, type: 'PERSON', name: `CL Client ${runId}` }, select: { id: true },
      });
      written.push('Client');
      const kase = await tx.case.create({
        // isAutomationEnabled=false: AutomationService.processPendingCases (5 dk) bu dosyaya dokunmaz.
        data: { tenantId: tenant.id, fileNumber: `CL-${runId}`, type: 'GENERAL_EXECUTION',
          clientId: client.id, isAutomationEnabled: false },
        select: { id: true },
      });
      written.push('Case');
      const caseClient = await tx.caseClient.create({
        data: { caseId: kase.id, clientId: client.id, role: 'ALACAKLI' }, select: { id: true },
      });
      written.push('CaseClient');
      // EXPECTED kontrolü TRANSACTION İÇİNDE → uyuşmazlık = ROLLBACK, yetim kayıt YOK.
      if (written.length !== EXPECTED) throw new Error(`beklenen ${EXPECTED} satir, yazilan ${written.length} — ROLLBACK`);
      return { tenantId: tenant.id, userId: user.id, userEmail: user.email, clientId: client.id, caseId: kase.id, caseClientId: caseClient.id };
    }, { timeout: 30000, maxWait: 10000 });

    const state = {
      package: 'CLIENT-LIVE-ACCEPTANCE-I1B-R01', createdAt: new Date().toISOString(),
      environment: env.environment, ownerGoRef: env.ownerGoRef, runId, slug, ...out,
      passwordStored: false, writtenRows: written, writtenRowCount: written.length,
    };
    L.assertNoSecrets(state); // G-4
    try { fs.writeFileSync(STATE, JSON.stringify(state, null, 1), 'utf8'); }
    catch (e) {
      console.error(`!!! KURULUM COMMIT EDILDI ama durum dosyasi YAZILAMADI: ${e && e.message}`);
      console.error(`    Kapatma yalniz runId ile: CL_RUN_ID=${runId} node cl-09-close-access.js`);
      process.exitCode = 4; return;
    }
    console.log(`[S1] KURULUM COMMIT EDILDI — ${written.length}/${EXPECTED} satir · runId=${runId} · tenant=${slug}`);
    console.log(JSON.stringify({ record: 'CL-I1B-SETUP', runId, slug, environment: env.environment, ownerGoRef: env.ownerGoRef, writtenRows: written }, null, 1));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nKURULUM HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
