/*
 * OFFICE AK KABUL — SENTETIK ALAN KURULUMU (ATOMIK, 12 SATIR)
 *
 * Tek transaction; yarida kesilirse ROLLBACK, hicbir satir kalmaz. Mevcut hicbir satir guncellenmez/silinmez.
 *   1 Tenant off-ak-<runId>
 *   2 Office (autoGreetingEnabled=false: dakikalik tebrik cron'u bu satiri DAMGALAMAZ — kapanistan sonra da)
 *   3 User ADMIN                                   (AK-2 yetkili aktor)
 *   4 User USER  + 5 Lawyer PARTNER (bagli)        (AK-2 yetkili aktor: bagli PARTNER; AK-1a pozitif kontrol)
 *   6 User USER  + 7 Lawyer MANAGER (bagli)        (AK-2 yetkisiz aktor: F01 yazmayi GECER, H2'de reddedilir)
 *   8 User VIEWER + 9 Lawyer PARTNER (bagli)       (AK-1a: bagli avukati PARTNER olan VIEWER)
 *  10 Lawyer PASIF PARTNER      (P1; yeniden etkinlestirme hedefi — rutbe ayricaligi)
 *  11 Lawyer PASIF delege       (P2; yeniden etkinlestirme hedefi — canApproveOfficeActions ayricaligi)
 *  12 Lawyer aktif LAWYER       (T; AK-1a yazma hedefi)
 * Taze (bos) disposable DB'de ek olarak SEYIRCI tenant kurulur (olcum altyapisi; kabul kapsami DISI).
 *
 * SIR: parola cagiran surecin bellegindedir; hash'lenir, durum dosyasina/ciktiya YAZILMAZ (G-4).
 */
'use strict';
const L = require('./ak-lib');
const { closeByRunId } = require('./ak-99-close');

const EMAIL = (runId, role) => `off-ak-${runId}-${role}@office-acceptance.invalid`; // RFC 2606

/** Seyirci icin bos kume izinli goruntu (seyircinin avukati yoktur). */
async function bystanderSnapshot(prisma, tenantId) {
  const q = { where: { tenantId }, orderBy: { id: 'asc' } };
  const rows = {
    lawyer: await prisma.lawyer.findMany(q), user: await prisma.user.findMany(q),
    office: await prisma.office.findMany(q), staffMember: await prisma.staffMember.findMany(q),
    officeBankAccount: await prisma.officeBankAccount.findMany({ where: { office: { tenantId } }, orderBy: { id: 'asc' } }),
    auditLog: await prisma.auditLog.findMany({ ...q, select: { id: true } }),
  };
  if (rows.office.length !== 1 || rows.user.length !== 1) {
    throw new L.ObservationError('seyirci gozlem kumesi beklenen bicimde degil (office 1, user 1)');
  }
  return { digest: L.digest(rows), counts: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])) };
}

async function setup({ prisma, bcrypt, runId, password, env, abortAfter }) {
  const slug = L.slugFor(runId);
  L.assertOwnSlug(slug); // G-1

  // G-3 + seyirci (transaction DISINDA, kabul yazmalarindan ONCE)
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  if (tenants.some((t) => t.slug === slug)) throw new Error(`G-3 IHLALI: '${slug}' zaten var`);
  let bystander = null;
  if (tenants.length === 0) {
    if (env.environment !== 'disposable') throw new Error('bos DB yalniz disposable ortamda beklenir');
    const bSlug = `${L.TENANT_PREFIX}bystander-${runId}`;
    L.assertOwnSlug(bSlug);
    const b = await prisma.tenant.create({ data: { name: `OFFICE AK Seyirci ${runId}`, slug: bSlug }, select: { id: true } });
    await prisma.office.create({ data: { tenantId: b.id, name: 'AK Seyirci Buro', autoGreetingEnabled: false } });
    await prisma.user.create({ data: {
      tenantId: b.id, email: EMAIL(runId, 'bystander'), name: 'Seyirci', surname: 'Kullanici',
      passwordHash: 'x', role: 'USER', isActive: false,
    } });
    bystander = { slug: bSlug, tenantId: b.id, baseline: await bystanderSnapshot(prisma, b.id) };
    L.log(`      seyirci tenant kuruldu (${bSlug}) — olcum altyapisi, kabul kapsami DISI`);
  }

  const hash = await bcrypt.hash(password, 10);
  const written = [];
  const mark = (k) => { written.push(k); if (abortAfter === k) throw new Error(`AK_ABORT_AFTER=${k} — negatif kontrol`); };
  const out = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: `OFFICE AK Kabul ${runId}`, slug }, select: { id: true } }); mark('Tenant');
    const office = await tx.office.create({ data: { tenantId: tenant.id, name: `AK Kabul Burosu ${runId}`, autoGreetingEnabled: false }, select: { id: true } }); mark('Office');
    const mkUser = (role, tag, surname) => tx.user.create({
      data: { tenantId: tenant.id, email: EMAIL(runId, tag), name: 'AK', surname, passwordHash: hash, role },
      select: { id: true, email: true },
    });
    const mkLawyer = (data) => tx.lawyer.create({ data: { tenantId: tenant.id, officeId: office.id, ...data }, select: { id: true } });
    const admin = await mkUser('ADMIN', 'admin', 'Yonetici'); mark('User(ADMIN)');
    const partnerUser = await mkUser('USER', 'partner', 'Ortak'); mark('User(partner)');
    const partnerLawyer = await mkLawyer({ userId: partnerUser.id, name: 'AkOrtak', surname: runId, lawyerRank: 'PARTNER' }); mark('Lawyer(PARTNER,bagli)');
    const managerUser = await mkUser('USER', 'manager', 'Yonetici Avukat'); mark('User(manager)');
    const managerLawyer = await mkLawyer({ userId: managerUser.id, name: 'AkYonetici', surname: runId, lawyerRank: 'MANAGER' }); mark('Lawyer(MANAGER,bagli)');
    const viewerUser = await mkUser('VIEWER', 'viewer', 'Goruntuleyici'); mark('User(VIEWER)');
    const viewerLawyer = await mkLawyer({ userId: viewerUser.id, name: 'AkGoruntuleyici', surname: runId, lawyerRank: 'PARTNER' }); mark('Lawyer(PARTNER,VIEWER-bagli)');
    const p1 = await mkLawyer({ name: 'AkPasifOrtak', surname: runId, barNumber: `AK-P1-${runId}`, lawyerRank: 'PARTNER', isActive: false }); mark('Lawyer(P1 pasif PARTNER)');
    const p2 = await mkLawyer({ name: 'AkPasifDelege', surname: runId, barNumber: `AK-P2-${runId}`, lawyerRank: 'LAWYER', canApproveOfficeActions: true, isActive: false }); mark('Lawyer(P2 pasif delege)');
    const target = await mkLawyer({ name: 'AkHedef', surname: runId, barNumber: `AK-T-${runId}`, lawyerRank: 'LAWYER' }); mark('Lawyer(T hedef)');
    return {
      tenantId: tenant.id, officeId: office.id,
      adminUserId: admin.id, adminEmail: admin.email,
      partnerUserId: partnerUser.id, partnerEmail: partnerUser.email, partnerLawyerId: partnerLawyer.id,
      managerUserId: managerUser.id, managerEmail: managerUser.email, managerLawyerId: managerLawyer.id,
      viewerUserId: viewerUser.id, viewerEmail: viewerUser.email, viewerLawyerId: viewerLawyer.id,
      p1LawyerId: p1.id, p1BarNumber: `AK-P1-${runId}`,
      p2LawyerId: p2.id, p2BarNumber: `AK-P2-${runId}`,
      targetLawyerId: target.id,
    };
  }, { timeout: 30000, maxWait: 10000 });
  if (written.length !== 12) throw new Error(`beklenen 12 satir, yazilan ${written.length}`);

  // G-0b: API gercekten AYNI DB'ye mi bagli? Yeni ADMIN ile login 2xx olmali. Olmazsa satirlar
  // SILINMEZ (canlida silme yok); erisim runId ile KAPATILIR ve kosum durur.
  let adminToken;
  try {
    adminToken = await L.login(L.apiBase(), out.adminEmail, password, slug);
  } catch (e) {
    const closed = await closeByRunId(prisma, runId).catch((x) => ({ verified: false, error: x.message }));
    throw new Error(`G-0b: API bu DB'ye bagli DOGRULANAMADI (${e.message}) — erisim kapatildi: ${JSON.stringify(closed)}`);
  }
  return { state: { runId, slug, ...out, writtenRows: written, bystander }, adminToken };
}

module.exports = { setup, bystanderSnapshot };
