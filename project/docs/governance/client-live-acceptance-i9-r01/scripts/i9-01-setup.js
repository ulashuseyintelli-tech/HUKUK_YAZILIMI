/*
 * CLIENT İ9 — ADIM 1: H1 KİMLİK KABULÜ İÇİN KENDİ SENTETİK ALANI (ATOMİK, 8 SATIR)
 *
 * NEDEN YENİ ALAN: R02 §3.5 — her koşum kendi tenant'ını üretir. İ1b (`cl-acc-afce215b`) ve
 * İ8 (`cl-acc-2ed1d6d0`) alanları KAPALIDIR; onları yeniden açmak kapanış kanıtlarını bozar.
 *
 * YAZMA KAPSAMI (TAM OLARAK 8 satır):
 *   1 Tenant(cl-acc-<runId>, lifecycle ACTIVE — login için zorunlu)
 *   3 User: viewer(VIEWER) · user(USER) · elevated(USER)
 *   1 Lawyer(PARTNER, userId=elevated)   ← lifecycle/elevated eşiği ROL ADIYLA değil BAĞLA
 *   3 Client:
 *      A  aktif, kimlik YOK        → A-8 (aynı değerle isActive:true) + #2552-b hedefi
 *      B  PASİF, tckn 10000000140  → A-7 (geçersiz kimlikle reaktivasyon) + #2552-d dedup hedefi
 *      D  PASİF, tckn 10000000146  → A-7 POZİTİF kontrol (geçerli kimlikle reaktivasyon)
 *
 * KİMLİK DEĞERLERİ ÖLÇÜLEREK SEÇİLDİ (uydurma YOK) — ürünün kendi `isValidTckn` algoritması
 * (`common/identity-validation.util.ts`) yerel olarak koşuldu:
 *   10000000146 → GEÇERLİ · 10000000140 → GEÇERSİZ · 10000000147 → GEÇERSİZ
 * Üçü de 11 hane ve ilk hanesi 0 DEĞİL → uzunluk/format kapısına takılmaz, YALNIZ checksum düşer.
 *
 * NEDEN GEÇERSİZ KİMLİK PRISMA İLE YAZILIYOR: ürünün create yolu checksum kapısından geçer,
 * yani geçersiz kimlikli kayıt API üzerinden ÜRETİLEMEZ. Canlıdaki 7 pasif geçersiz-checksum
 * kaydı da legacy veridir. Bu kurulum o durumu BİREBİR yansıtır; ürün kodu DEĞİŞTİRİLMEZ.
 *
 * ATOMİKLİK: tek transaction; EXPECTED sayımı TRANSACTION İÇİNDE. Yarıda kesilme yetim bırakmaz.
 * SIR: parola `CL_LOGIN_PASSWORD`ten alınır; çıktıya/durum dosyasına/repoya YAZILMAZ.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');
const AH = require('../../client-acceptance-harness-r01/scripts/ah-lib');

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i9-state.json');
const BCRYPT = process.env.CL_BCRYPT_PATH
  || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE21/project/apps/api/node_modules/bcrypt';
const ABORT_AFTER = process.env.I9_ABORT_AFTER || null; // YALNIZ negatif kontrol

// Ürün algoritmasıyla ölçülmüş sabitler (bkz. başlık).
const TCKN_VALID = '10000000146';
const TCKN_INVALID = '10000000140';

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

    const isolationBaseline = await AH.isolationFingerprint(prisma, null);
    console.log(`[S0] izolasyon tabani: ${isolationBaseline.tenantsObserved} komsu tenant`
      + ` · client ${isolationBaseline.clientTotal} · user ${isolationBaseline.userTotal}`
      + ` · digest ${isolationBaseline.digest}`);

    const passwordHash = await bcrypt.hash(password, 10); // transaction DIŞINDA
    const EXPECTED = 8;
    const written = [];
    const out = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `CL I9 ${runId}`, slug }, select: { id: true } });
      written.push('Tenant');

      const mk = async (tag, role) => {
        const u = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: `${tag}-${runId}@cl-acceptance.invalid`, // RFC 2606 — teslim EDİLEMEZ
            name: tag.toUpperCase(), surname: 'I9', passwordHash, role,
          },
          select: { id: true, email: true, role: true },
        });
        written.push(`User:${tag}`);
        return u;
      };
      const viewer = await mk('viewer', 'VIEWER');
      const user = await mk('user', 'USER');
      if (ABORT_AFTER === 'user') throw new Error('I9_ABORT_AFTER=user — negatif kontrol');
      const elevated = await mk('elevated', 'USER');

      await tx.lawyer.create({
        data: { tenantId: tenant.id, name: 'CL', surname: 'Partner', lawyerRank: 'PARTNER', userId: elevated.id },
        select: { id: true },
      });
      written.push('Lawyer:PARTNER');

      // A: aktif, kimliksiz — email BİLEREK yok (gönderim yolu açılmaz).
      const clientA = await tx.client.create({
        data: { tenantId: tenant.id, type: 'PERSON', name: `CL I9 A ${runId}`, isActive: true },
        select: { id: true, isActive: true },
      });
      written.push('Client:A-aktif-kimliksiz');

      // B: PASİF + GEÇERSİZ kimlik (legacy durumu yansıtır; API ile üretilemez).
      const clientB = await tx.client.create({
        data: { tenantId: tenant.id, type: 'PERSON', name: `CL I9 B ${runId}`, isActive: false, tckn: TCKN_INVALID },
        select: { id: true, isActive: true, tckn: true },
      });
      written.push('Client:B-pasif-gecersiz');

      // D: PASİF + GEÇERLİ kimlik → reaktivasyonun POZİTİF kontrolü.
      const clientD = await tx.client.create({
        data: { tenantId: tenant.id, type: 'PERSON', name: `CL I9 D ${runId}`, isActive: false, tckn: TCKN_VALID },
        select: { id: true, isActive: true, tckn: true },
      });
      written.push('Client:D-pasif-gecerli');

      if (written.length !== EXPECTED) throw new Error(`beklenen ${EXPECTED} satir, yazilan ${written.length} — ROLLBACK`);
      return {
        tenantId: tenant.id,
        clients: { a: clientA.id, b: clientB.id, d: clientD.id },
        actors: {
          viewer: { id: viewer.id, email: viewer.email, role: viewer.role },
          user: { id: user.id, email: user.email, role: user.role },
          elevated: { id: elevated.id, email: elevated.email, role: elevated.role },
        },
      };
    }, { timeout: 30000, maxWait: 10000 });

    const state = {
      package: 'CLIENT-LIVE-ACCEPTANCE-I9-R01', createdAt: new Date().toISOString(),
      environment: env.environment, ownerGoRef: env.ownerGoRef, runId, slug, ...out,
      identity: { valid: TCKN_VALID, invalid: TCKN_INVALID, invalidUnmatched: '10000000147' },
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
      record: 'CL-I9-SETUP', runId, slug, environment: env.environment, ownerGoRef: env.ownerGoRef,
      writtenRows: written,
      actorRoles: Object.fromEntries(Object.entries(out.actors).map(([k, v]) => [k, v.role])),
      clientShape: { a: 'aktif/kimliksiz', b: `pasif/tckn=${TCKN_INVALID}(GECERSIZ)`, d: `pasif/tckn=${TCKN_VALID}(GECERLI)` },
      caseRowsWritten: 0, officeRowsWritten: 0,
      isolationBaselineDigest: isolationBaseline.digest,
    }, null, 1));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nKURULUM HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
