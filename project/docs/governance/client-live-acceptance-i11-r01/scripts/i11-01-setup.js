/*
 * CLIENT İ11 — ADIM 1: H5 INTAKE KABULÜ İÇİN KENDİ SENTETİK ALANI (ATOMİK, 18 SATIR)
 *
 * NEDEN YENİ ALAN: R02 §3.5 — her koşum kendi tenant'ını üretir. Önceki alanlarda (`cl-acc-afce215b`,
 * `cl-acc-2ed1d6d0`, `cl-acc-d19ce2c7`, `cl-acc-c9b07bcb`) kullanıcı erişimleri kapalıdır; o alanlar
 * YENİDEN AÇILMAZ ve bu koşum onlara DOKUNMAZ.
 *
 * YAZMA KAPSAMI (TAM OLARAK 18 satır):
 *   1 Tenant(cl-acc-<runId>, lifecycle ACTIVE — login için zorunlu)
 *   3 User: reviewer(USER) · elevated(USER) · plain(USER)   (e-postalar `@cl-acceptance.invalid`)
 *   2 StaffMember: reviewer + plain (inceleme kapısı avukat/personel profilinden TAM BİRİNİ ister)
 *   1 Lawyer(PARTNER, userId=elevated)      ← promote eşiği "PARTNER veya yetkilendirilmiş avukat"
 *   1 Client(aktif, e-postası `.invalid`)   ← bilgi talebinin alıcısı (A-5/A-6, yalnız onaylıysa)
 *   1 Case(ACTIVE, fileNumber CL-I11-<runId>) + 1 CaseLawyer(isResponsible) + 1 CaseClient(ALACAKLI)
 *   1 Debtor + 1 CaseDebtor
 *   1 ClientIntakeLink(tokenHash; HAM TOKEN DB'ye YAZILMAZ ve BASILMAZ)
 *   1 ClientIntakeSubmission(CLIENT_SUBMITTED — claim'i R-1 yapar)
 *   2 ClientIntakeField(ADDRESS + CONTACT, reviewStatus PENDING, promotedAt NULL)
 *   1 PermissionGrant(reviewer → `client.intake.review`, scope GLOBAL, effect ALLOW)
 *
 * NEDEN GRANT VE SUBMISSION PRISMA İLE YAZILIYOR: inceleme yetkisi ürün akışında ayrı bir yönetim
 * ekranından verilir; submission ise müvekkilin PUBLIC intake formundan gelir. İkisini de canlı kabul
 * için ürün üzerinden üretmek, kapsam dışı yazma (public form + yetki yönetimi) gerektirir. Ölçülen
 * kapı review→promote'tur; ön koşul satırları sentetik alanda doğrudan kurulur. Ürün kodu DEĞİŞMEZ.
 *
 * ATOMİKLİK: tek transaction; EXPECTED sayımı TRANSACTION İÇİNDE. Yarıda kesilme yetim bırakmaz.
 * SIR: parola `CL_LOGIN_PASSWORD`ten alınır; intake ham token'ı bellekte üretilir; ikisi de çıktıya,
 * durum dosyasına ve repoya YAZILMAZ (DB'de yalnız token'ın sha256 HASH'i durur).
 * KÜTÜPHANE: `CL_BCRYPT_PATH` ZORUNLU — varsayılana SESSİZCE düşülmez.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');
const AH = require('../../client-acceptance-harness-r01/scripts/ah-lib');
const { assertI11GoRef } = require('./i11-02-intake'); // yan etkisiz kapı fonksiyonu

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i11-state.json');
const ABORT_AFTER = process.env.I11_ABORT_AFTER || null; // YALNIZ negatif kontrol

(async () => {
  assertI11GoRef(); // canlıda YALNIZ İ11 GO ref'i — G-0'dan ÖNCE
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
    // Intake ham token'i YALNIZ bellekte; DB'ye yalniz sha256 HASH'i yazilir (urunun kendi kurali).
    const rawIntakeToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawIntakeToken).digest('hex');

    const EXPECTED = 18;
    const written = [];
    const out = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `CL I11 ${runId}`, slug }, select: { id: true } });
      written.push('Tenant');

      const mk = async (tag) => {
        const u = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: `${tag}-${runId}@cl-acceptance.invalid`, // RFC 2606 — teslim EDİLEMEZ
            name: tag.toUpperCase(), surname: 'I11', passwordHash, role: 'USER',
          },
          select: { id: true, email: true, role: true },
        });
        written.push(`User:${tag}`);
        return u;
      };
      const reviewer = await mk('reviewer');
      const elevated = await mk('elevated');
      if (ABORT_AFTER === 'user') throw new Error('I11_ABORT_AFTER=user — negatif kontrol');
      const plain = await mk('plain');

      const lawyer = await tx.lawyer.create({
        data: { tenantId: tenant.id, name: 'CL', surname: 'Partner', lawyerRank: 'PARTNER', userId: elevated.id },
        select: { id: true },
      });
      written.push('Lawyer:PARTNER');

      // Inceleme yetkisi aktorun avukat VEYA personel profilinden TAM BIRINE sahip olmasini ister
      // (`assertActiveTenantActor`: XOR + aktif + ayni tenant). reviewer ve plain PERSONEL olur;
      // boylece ikisi arasindaki TEK fark `client.intake.review` izni kalir (olcum gecerliligi).
      for (const [tag, u] of [['reviewer', reviewer], ['plain', plain]]) {
        await tx.staffMember.create({
          data: {
            tenantId: tenant.id, userId: u.id, firstName: tag.toUpperCase(), lastName: 'I11',
            staffType: 'OFIS_KATIBI', isActive: true,
          },
          select: { id: true },
        });
        written.push(`StaffMember:${tag}`);
      }

      const client = await tx.client.create({
        data: {
          tenantId: tenant.id, type: 'PERSON', name: `CL I11 ${runId}`, displayName: `CL I11 ${runId}`,
          email: `client-${runId}@cl-acceptance.invalid`, isActive: true,
        },
        select: { id: true },
      });
      written.push('Client');

      const kase = await tx.case.create({
        data: { tenantId: tenant.id, fileNumber: `CL-I11-${runId}`, type: 'GENERAL_EXECUTION', clientId: client.id },
        select: { id: true, status: true },
      });
      written.push('Case');

      await tx.caseLawyer.create({ data: { caseId: kase.id, lawyerId: lawyer.id, isResponsible: true }, select: { caseId: true } });
      written.push('CaseLawyer:responsible');

      // Intake baglantisi olusturma siniri (`assertClientWorkspaceCreateBoundary`) Case.clientId ile
      // YETINMEZ: ayrica CaseClient bagi arar. A-6 bu bag olmadan 404 alir (yanlis kapi).
      await tx.caseClient.create({ data: { caseId: kase.id, clientId: client.id, role: 'ALACAKLI' }, select: { id: true } });
      written.push('CaseClient');

      const debtor = await tx.debtor.create({
        data: { tenantId: tenant.id, type: 'INDIVIDUAL', name: `CL I11 Borclu ${runId}` },
        select: { id: true },
      });
      written.push('Debtor');
      await tx.caseDebtor.create({ data: { caseId: kase.id, debtorId: debtor.id }, select: { caseId: true } });
      written.push('CaseDebtor');

      const link = await tx.clientIntakeLink.create({
        data: {
          tenantId: tenant.id, caseId: kase.id, clientId: client.id, tokenHash,
          status: 'ACTIVE', scope: ['ADDRESS', 'CONTACT'], maxUses: 1, createdById: elevated.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
        select: { id: true },
      });
      written.push('ClientIntakeLink');

      const submission = await tx.clientIntakeSubmission.create({
        data: {
          tenantId: tenant.id, intakeLinkId: link.id, caseId: kase.id, clientId: client.id,
          status: 'CLIENT_SUBMITTED',
        },
        select: { id: true, status: true },
      });
      written.push('ClientIntakeSubmission:CLIENT_SUBMITTED');

      const fieldAddress = await tx.clientIntakeField.create({
        data: {
          submissionId: submission.id, category: 'ADDRESS', label: 'Adres beyani',
          value: `CL I11 Mah. ${runId} Sok. No:1 (sentetik)`, reviewStatus: 'PENDING',
        },
        select: { id: true },
      });
      written.push('ClientIntakeField:ADDRESS');
      const fieldContact = await tx.clientIntakeField.create({
        data: {
          submissionId: submission.id, category: 'CONTACT', label: 'Iletisim beyani',
          value: `+90 500 000 ${runId.slice(0, 4)} (sentetik)`, reviewStatus: 'PENDING',
        },
        select: { id: true },
      });
      written.push('ClientIntakeField:CONTACT');

      await tx.permissionGrant.create({
        data: {
          tenantId: tenant.id, subjectUserId: reviewer.id, permissionKey: 'client.intake.review',
          effect: 'ALLOW', scope: 'GLOBAL', grantedByUserId: elevated.id,
          reason: `CLIENT I11 kabul alani ${runId}`,
        },
        select: { id: true },
      });
      written.push('PermissionGrant:client.intake.review');

      if (written.length !== EXPECTED) throw new Error(`beklenen ${EXPECTED} satir, yazilan ${written.length} — ROLLBACK`);
      return {
        tenantId: tenant.id,
        caseId: kase.id,
        clientId: client.id,
        debtorId: debtor.id,
        lawyerId: lawyer.id,
        intakeLinkId: link.id,
        submissionId: submission.id,
        fields: { address: fieldAddress.id, contact: fieldContact.id },
        actors: {
          reviewer: { id: reviewer.id, email: reviewer.email, role: reviewer.role },
          elevated: { id: elevated.id, email: elevated.email, role: elevated.role },
          plain: { id: plain.id, email: plain.email, role: plain.role },
        },
      };
    }, { timeout: 30000, maxWait: 10000 });

    const state = {
      package: 'CLIENT-LIVE-ACCEPTANCE-I11-R01', createdAt: new Date().toISOString(),
      environment: env.environment, ownerGoRef: env.ownerGoRef, runId, slug, ...out,
      isolationBaseline, passwordStored: false, intakeTokenStored: false,
      writtenRows: written, writtenRowCount: written.length,
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
      record: 'CL-I11-SETUP', runId, slug, environment: env.environment, ownerGoRef: env.ownerGoRef,
      writtenRows: written,
      actorRoles: Object.fromEntries(Object.entries(out.actors).map(([k, v]) => [k, v.role])),
      shape: {
        reviewer: 'USER + PermissionGrant(client.intake.review, GLOBAL, ALLOW) · PARTNER bagi YOK',
        elevated: 'USER + PARTNER Lawyer bagi (promote esigi)',
        plain: 'USER · grant YOK · PARTNER bagi YOK',
        submission: 'CLIENT_SUBMITTED (claim R-1 ile)', fields: 'ADDRESS + CONTACT, PENDING, promotedAt NULL',
      },
      infoRequestRowsWritten: 0, notificationRowsWritten: 0, promotionRowsWritten: 0,
      isolationBaselineDigest: isolationBaseline.digest,
    }, null, 1));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nKURULUM HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
