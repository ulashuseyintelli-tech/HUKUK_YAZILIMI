/*
 * CLIENT İ10 — ADIM 1: H3 VEKÂLET KABULÜ İÇİN KENDİ SENTETİK ALANI (ATOMİK, 7 SATIR)
 *
 * NEDEN YENİ ALAN: R02 §3.5 — her koşum kendi tenant'ını üretir. Önceki alanlarda (İ1b
 * `cl-acc-afce215b`, İ8 `cl-acc-2ed1d6d0`, İ9 `cl-acc-d19ce2c7`) kullanıcı erişimleri kapalıdır;
 * o alanlarda erişim YENİDEN AÇILMAZ.
 *
 * YAZMA KAPSAMI (TAM OLARAK 7 satır):
 *   1 Tenant(cl-acc-<runId>, lifecycle ACTIVE — login için zorunlu)
 *   3 User: viewer(VIEWER) · user(USER, PARTNER bağı YOK) · elevated(USER)
 *   1 Lawyer(PARTNER, userId=elevated)   ← POA eşiği "ADMIN VEYA canonical elevated"; elevated = bu bağ
 *   2 Client:
 *      P  aktif, düz canCollect=true            → A-1 / A-3 / A-2 / A-4 hedefi (A-3 ile POA alır)
 *      N  aktif, dört düz bayrak da true, POA YOK → K9 (POA'sız müvekkilde dört capability etkisiz)
 *
 * NEDEN DÜZ BAYRAKLAR PRISMA İLE YAZILIYOR: ürünün create yolu POA'sız kayıtta ahzu kabzayı FALSE'a
 * çeker (C3-B05 §13/9 K9.4); "düz bayrak true olsa bile etkisiz" durumu API ile ÜRETİLEMEZ. Canlıdaki
 * legacy durum bunu içerir (WAVE4 K9.5: 15 müvekkil · 15 düz canCollect · 13'ü geçerli POA'sız).
 * Ürün kodu DEĞİŞTİRİLMEZ.
 *
 * ATOMİKLİK: tek transaction; EXPECTED sayımı TRANSACTION İÇİNDE. Yarıda kesilme yetim bırakmaz.
 * SIR: parola `CL_LOGIN_PASSWORD`ten alınır; çıktıya/durum dosyasına/repoya YAZILMAZ.
 * KÜTÜPHANE: `CL_BCRYPT_PATH` ZORUNLU — varsayılana SESSİZCE düşülmez.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');
const AH = require('../../client-acceptance-harness-r01/scripts/ah-lib');
const { assertI10GoRef } = require('./i10-02-poa'); // yan etkisiz kapı fonksiyonu

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i10-state.json');
const ABORT_AFTER = process.env.I10_ABORT_AFTER || null; // YALNIZ negatif kontrol

(async () => {
  assertI10GoRef(); // canlıda YALNIZ İ10 GO ref'i — G-0'dan ÖNCE
  const env = L.assertEnvironment(); // G-0 — YAZMADAN ÖNCE
  const BCRYPT = L.requireEnv('CL_BCRYPT_PATH');
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

    const isolationBaseline = await AH.isolationFingerprint(prisma, null);
    console.log(`[S0] izolasyon tabani: ${isolationBaseline.tenantsObserved} komsu tenant`
      + ` · client ${isolationBaseline.clientTotal} · user ${isolationBaseline.userTotal}`
      + ` · digest ${isolationBaseline.digest}`);

    const passwordHash = await bcrypt.hash(password, 10); // transaction DIŞINDA
    const EXPECTED = 7;
    const written = [];
    const out = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `CL I10 ${runId}`, slug }, select: { id: true } });
      written.push('Tenant');

      const mk = async (tag, role) => {
        const u = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: `${tag}-${runId}@cl-acceptance.invalid`, // RFC 2606 — teslim EDİLEMEZ
            name: tag.toUpperCase(), surname: 'I10', passwordHash, role,
          },
          select: { id: true, email: true, role: true },
        });
        written.push(`User:${tag}`);
        return u;
      };
      const viewer = await mk('viewer', 'VIEWER');
      const user = await mk('user', 'USER');
      if (ABORT_AFTER === 'user') throw new Error('I10_ABORT_AFTER=user — negatif kontrol');
      const elevated = await mk('elevated', 'USER');

      await tx.lawyer.create({
        data: { tenantId: tenant.id, name: 'CL', surname: 'Partner', lawyerRank: 'PARTNER', userId: elevated.id },
        select: { id: true },
      });
      written.push('Lawyer:PARTNER');

      // P: vekâlet hedefi. Düz canCollect=true → A-3 sonrası ölçüm geçerliliği (P-K9) ayırt edebilsin.
      const clientP = await tx.client.create({
        data: { tenantId: tenant.id, type: 'PERSON', name: `CL I10 P ${runId}`, isActive: true, canCollect: true },
        select: { id: true },
      });
      written.push('Client:P-vekalet-hedefi');

      // N: POA'SIZ; dört düz bayrak da true (legacy durum) → K9.4 "flat true olsa bile etkisiz".
      const clientN = await tx.client.create({
        data: {
          tenantId: tenant.id, type: 'PERSON', name: `CL I10 N ${runId}`, isActive: true,
          canCollect: true, canWaive: true, canSettle: true, canRelease: true,
        },
        select: { id: true },
      });
      written.push('Client:N-poasiz-duz-bayraklar-true');

      if (written.length !== EXPECTED) throw new Error(`beklenen ${EXPECTED} satir, yazilan ${written.length} — ROLLBACK`);
      return {
        tenantId: tenant.id,
        clients: { p: clientP.id, n: clientN.id },
        actors: {
          viewer: { id: viewer.id, email: viewer.email, role: viewer.role },
          user: { id: user.id, email: user.email, role: user.role },
          elevated: { id: elevated.id, email: elevated.email, role: elevated.role },
        },
      };
    }, { timeout: 30000, maxWait: 10000 });

    const state = {
      package: 'CLIENT-LIVE-ACCEPTANCE-I10-R01', createdAt: new Date().toISOString(),
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
      record: 'CL-I10-SETUP', runId, slug, environment: env.environment, ownerGoRef: env.ownerGoRef,
      writtenRows: written,
      actorRoles: Object.fromEntries(Object.entries(out.actors).map(([k, v]) => [k, v.role])),
      clientShape: { p: 'aktif / duz canCollect=true / POA YOK (A-3 ile alir)', n: 'aktif / dort duz bayrak true / POA YOK' },
      poaRowsWritten: 0, caseRowsWritten: 0, officeRowsWritten: 0,
      isolationBaselineDigest: isolationBaseline.digest,
    }, null, 1));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nKURULUM HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
