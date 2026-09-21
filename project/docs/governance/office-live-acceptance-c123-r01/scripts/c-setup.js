/*
 * OFFICE C123 KABUL — SENTETIK ALAN KURULUMU (ATOMIK, TEK TRANSACTION)
 *
 * Yarida kesilirse ROLLBACK, hicbir satir kalmaz. Mevcut hicbir satir guncellenmez/silinmez.
 *
 * AKTORLER (her biri ayri kisi; parola sureç belleginde, hash'lenir; G-4)
 *   admin  ADMIN                                   C1 dava acilisi aktoru; G-0b login kaniti
 *   viewer VIEWER + bagli PARTNER avukat           C2 ret matrisi (rutbe esik ustu, rol VIEWER)
 *   elev1  USER + bagli PARTNER avukat   (A)       C3 FD talep eden + dispozisyon kaydi; C2 genel kutu pozitif
 *   elev2  USER + bagli MANAGER avukat   (B)       C3 FD ofis onaylayicisi (C2 F1 pozitif kontrol)
 *   elev3  USER + bagli delege avukat    (C)       C3 FD icerik onaylayicisi (LAWYER + canApproveOfficeActions)
 *
 * KAYITLAR
 *   Office (autoGreetingEnabled=false: dakikalik tebrik cron'u bu alani DAMGALAMAZ)
 *   Client (e-posta `.invalid`; RFC 2606) + Case + CaseClient      FD zinciri girdisi
 *   G1..G4 + GP : CHANGE_STATUS genel kutu talepleri (PENDING_APPROVAL, talep eden elev1)
 *   D1 zinciri  : Collection(CONFIRMED) + ExpenseRequest(APPROVED) + COLLECTION_DISPOSITION_POST
 *                 talebi (PENDING, talep eden elev3) + CollectionDisposition(DISTRIBUTION_RECOMMENDED)
 *   FD zinciri  : Collection(CONFIRMED) + ExpenseRequest(APPROVED) + COLLECTION_DISPOSITION_POST
 *                 talebi (APPROVED) + CollectionDisposition(DISTRIBUTION_APPROVED)
 *                 (surum URUNUN kendi yolundan uretilir: post -> financial-disclosure; bkz. c-cases)
 * Kaynak sekli: client-acceptance-runners-i3-r01/scripts/i3-lib.js `setupDisclosureChain` ve
 *   office-approval-viewer-decision-boundary.http.spec.ts `pendingRequest` (kod DEVRALINMAZ, sekil okunur).
 */
'use strict';
const crypto = require('crypto');
const L = require('./c-lib');
const { closeByRunId } = require('./c-99-close');

const EMAIL = (runId, tag) => `off-c123-${runId}-${tag}@office-acceptance.invalid`; // RFC 2606

/** permission-diagnostics/guided-edge/canonical-json.ts stableJsonHash ile ayni (anahtar sirasi bagimsiz sha256). */
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === 'object') return Object.keys(v).sort().reduce((a, k) => { a[k] = sortDeep(v[k]); return a; }, {});
  return v;
}
const stableJsonHash = (v) => crypto.createHash('sha256').update(JSON.stringify(sortDeep(v)), 'utf8').digest('hex');

async function setup({ prisma, bcrypt, runId, password, env, abortAfter }) {
  const slug = L.slugFor(runId);
  L.assertOwnSlug(slug); // G-1
  const clash = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
  if (clash) throw new Error(`G-3 IHLALI: '${slug}' zaten var`);

  // Taze (bos) disposable DB'de SEYIRCI tenant (olcum altyapisi; kabul kapsami DISI): yoksa I-3 KOR kalir.
  let bystander = null;
  if ((await prisma.tenant.count()) === 0) {
    if (env.environment !== 'disposable') throw new Error('bos DB yalniz disposable ortamda beklenir');
    const bSlug = `${L.TENANT_PREFIX}bystander-${runId}`;
    L.assertOwnSlug(bSlug);
    const b = await prisma.tenant.create({ data: { name: `OFFICE C123 Seyirci ${runId}`, slug: bSlug }, select: { id: true } });
    await prisma.office.create({ data: { tenantId: b.id, name: 'C123 Seyirci Buro', autoGreetingEnabled: false } });
    await prisma.user.create({ data: { tenantId: b.id, email: EMAIL(runId, 'bystander'), name: 'Seyirci', surname: 'Kullanici', passwordHash: 'x', role: 'USER', isActive: false } });
    bystander = { slug: bSlug, tenantId: b.id };
    L.log(`      seyirci tenant kuruldu (${bSlug}) — olcum altyapisi, kabul kapsami DISI`);
  }

  const hash = await bcrypt.hash(password, 10);
  const written = [];
  const mark = (k) => { written.push(k); if (abortAfter === k) throw new Error(`C123_ABORT_AFTER=${k} — negatif kontrol`); };

  const out = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: `OFFICE C123 Kabul ${runId}`, slug }, select: { id: true } }); mark('Tenant');
    const T = tenant.id;
    const office = await tx.office.create({ data: { tenantId: T, name: `C123 Kabul Burosu ${runId}`, autoGreetingEnabled: false }, select: { id: true } }); mark('Office');
    const mkUser = (role, tag, surname) => tx.user.create({
      data: { tenantId: T, email: EMAIL(runId, tag), name: 'C123', surname, passwordHash: hash, role },
      select: { id: true, email: true },
    });
    const mkLawyer = (userId, rank, extra = {}) => tx.lawyer.create({
      data: { tenantId: T, officeId: office.id, userId, name: 'C123', surname: `${rank}-${runId}`, lawyerRank: rank, ...extra },
      select: { id: true },
    });
    const admin = await mkUser('ADMIN', 'admin', 'Yonetici'); mark('User(ADMIN)');
    const viewer = await mkUser('VIEWER', 'viewer', 'Goruntuleyici'); mark('User(VIEWER)');
    await mkLawyer(viewer.id, 'PARTNER'); mark('Lawyer(PARTNER,VIEWER-bagli)');
    const elev1 = await mkUser('USER', 'elev1', 'Ortak-A'); mark('User(elev1)');
    await mkLawyer(elev1.id, 'PARTNER'); mark('Lawyer(PARTNER,elev1)');
    const elev2 = await mkUser('USER', 'elev2', 'Yonetici-B'); mark('User(elev2)');
    await mkLawyer(elev2.id, 'MANAGER'); mark('Lawyer(MANAGER,elev2)');
    const elev3 = await mkUser('USER', 'elev3', 'Delege-C'); mark('User(elev3)');
    await mkLawyer(elev3.id, 'LAWYER', { canApproveOfficeActions: true }); mark('Lawyer(delege,elev3)');

    const client = await tx.client.create({
      data: { tenantId: T, type: 'PERSON', name: `C123 Muvekkil ${runId}`, email: EMAIL(runId, 'client') },
      select: { id: true, email: true },
    }); mark('Client');
    const kase = await tx.case.create({ data: { tenantId: T, fileNumber: `C123-${runId}`, type: 'GENERAL_EXECUTION' }, select: { id: true } }); mark('Case');
    const caseClient = await tx.caseClient.create({ data: { caseId: kase.id, clientId: client.id }, select: { id: true } }); mark('CaseClient');

    // ── genel kutu CHANGE_STATUS talepleri (C2 G1..G4 ret + GP pozitif) ──
    const generic = {};
    for (const k of ['G1', 'G2', 'G3', 'G4', 'GP']) {
      const savedIntent = { kind: 'CHANGE_STATUS', ref: `${k}-${runId}` };
      const r = await tx.officeApprovalRequest.create({
        data: {
          tenantId: T, actionCode: 'CHANGE_STATUS', targetType: 'LegalCase', targetRef: `c123-${k}-${runId}`,
          requesterUserId: elev1.id, status: 'PENDING_APPROVAL', executionStatus: 'NOT_RUN',
          savedIntent, payloadHash: stableJsonHash(savedIntent),
        },
        select: { id: true },
      });
      generic[k] = r.id; mark(`OfficeApprovalRequest(${k})`);
    }

    // ── dispozisyon zinciri kurucusu ──
    const chain = async (tag, { dispositionStatus, approvalStatus, requester, approver }) => {
      const collection = await tx.collection.create({
        data: { tenantId: T, caseId: kase.id, amount: '100.00', type: 'TAHSILAT', date: new Date(), idempotencyKey: `c123-${tag}-col-${runId}`, status: 'CONFIRMED' },
        select: { id: true },
      }); mark(`Collection(${tag})`);
      const expense = await tx.expenseRequest.create({
        data: { tenantId: T, caseId: kase.id, clientId: client.id, totalAmount: '40.00', paidTotal: '0.00', currency: 'TRY', status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: elev1.id },
        select: { id: true },
      }); mark(`ExpenseRequest(${tag})`);
      const savedIntent = { kind: 'COLLECTION_DISPOSITION_POST', ref: `${tag}-${runId}` };
      const approval = await tx.officeApprovalRequest.create({
        data: {
          tenantId: T, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending',
          requesterUserId: requester, status: approvalStatus, executionStatus: 'NOT_RUN',
          savedIntent, payloadHash: stableJsonHash(savedIntent),
          ...(approvalStatus === 'APPROVED' ? { approverUserId: approver, decidedAt: new Date() } : {}),
        },
        select: { id: true },
      }); mark(`OfficeApprovalRequest(${tag})`);
      const disposition = await tx.collectionDisposition.create({
        data: {
          tenantId: T, caseId: kase.id, collectionId: collection.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: caseClient.id,
          status: dispositionStatus, totalAmount: '100.00', currency: 'TRY', approvalRequestId: approval.id,
          ...(dispositionStatus === 'DISTRIBUTION_APPROVED' ? { approvedById: approver } : {}),
          lines: { create: [
            { type: 'CLIENT_PAYABLE', amount: '60.00', caseClientId: caseClient.id },
            { type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '40.00', expenseRequestId: expense.id, caseClientId: caseClient.id },
          ] },
        },
        select: { id: true },
      }); mark(`CollectionDisposition(${tag})`);
      await tx.officeApprovalRequest.update({ where: { id: approval.id }, data: { targetRef: disposition.id } });
      return { collectionId: collection.id, dispositionId: disposition.id, approvalRequestId: approval.id };
    };
    const d1 = await chain('D1', { dispositionStatus: 'DISTRIBUTION_RECOMMENDED', approvalStatus: 'PENDING_APPROVAL', requester: elev3.id });
    const fd = await chain('FD', { dispositionStatus: 'DISTRIBUTION_APPROVED', approvalStatus: 'APPROVED', requester: elev1.id, approver: elev2.id });

    return {
      tenantId: T, officeId: office.id, caseId: kase.id, clientId: client.id, caseClientId: caseClient.id, clientEmail: client.email,
      actors: {
        admin: { id: admin.id, email: admin.email }, viewer: { id: viewer.id, email: viewer.email },
        elev1: { id: elev1.id, email: elev1.email }, elev2: { id: elev2.id, email: elev2.email }, elev3: { id: elev3.id, email: elev3.email },
      },
      generic, d1, fd,
    };
  }, { timeout: 60000, maxWait: 10000 });

  // G-0b: API gercekten AYNI DB'ye mi bagli? Yeni ADMIN ile login 2xx olmali. Olmazsa satirlar
  // SILINMEZ; erisim runId ile KAPATILIR ve kosum durur.
  let adminToken;
  try {
    adminToken = await L.login(L.apiBase(), out.actors.admin.email, password, slug);
  } catch (e) {
    const closed = await closeByRunId(prisma, runId).catch((x) => ({ verified: false, error: x.message }));
    throw new Error(`G-0b: API bu DB'ye bagli DOGRULANAMADI (${e.message}) — erisim kapatildi: ${JSON.stringify(closed)}`);
  }
  return { state: { runId, slug, ...out, writtenRows: written, bystander }, adminToken };
}

module.exports = { setup, stableJsonHash };
