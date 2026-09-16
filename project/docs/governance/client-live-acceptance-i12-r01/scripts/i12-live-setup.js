/*
 * İ12 — CANLI KURULUM (sentetik hedef tenant) · AYRI GİRİŞ NOKTASI · makbuz üretir
 *
 * Owner sırası: kurulum ÖNCESİ GO/ref+tüketim+DB/hedef kimliği (preflight --phase pre) → BU KURULUM
 * (yalnız koşuma ait sentetik yazma) → makbuz → (preflight --phase post: makbuz+API↔DB) → pencere/ölçüm.
 * Kurulum MAKBUZU bu betiğin ÇIKTISIDIR; makbuzu isteyen kontrol (post preflight) bu yazmanın ÖN KOŞULU DEĞİLDİR.
 *
 * CANLI-GÜVENLİK KAPISI (fail-closed; G-0 DEĞİL — ayrı canlı yol):
 *   I12_LIVE_CONFIRM=1 · I12_LIVE_GO_REF DOLU · I12_EXPECT_DB = bağlı DB adı · I12_RUNID DOLU ·
 *   I12_EXPECT_TENANT_SLUG = türetilen slug (`${TENANT_PREFIX}${runId}`) — owner'ın beyan ettiği sentetik slug.
 * Yalnızca koşuma ait sentetik tenant(lar) yazılır (setupI3: ah-<runId> + ah-<runId>-x). Sır makbuza KONMAZ
 * (login parolası env: I12_LIVE_LOGIN_PW; makbuz yalnız loginEmail taşır).
 *
 * KULLANIM: I12_LIVE_CONFIRM=1 I12_LIVE_GO_REF=<ref> I12_EXPECT_DB=<db> I12_RUNID=<runId>
 *           I12_EXPECT_TENANT_SLUG=<slug> I12_LIVE_LOGIN_PW=<pw> I12_SETUP_RECEIPT=<yol> node i12-live-setup.js
 */
'use strict';
const fs = require('fs'); const path = require('path');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
function dbName(u) { try { return decodeURIComponent(new URL(u).pathname.replace(/^\//, '').split('/')[0]); } catch (e) { return null; } }

(async () => {
  if (process.env.I12_LIVE_CONFIRM !== '1') { console.error('REDDEDİLDİ: I12_LIVE_CONFIRM=1 gerekli.'); process.exit(3); }
  if (!(process.env.I12_LIVE_GO_REF && process.env.I12_LIVE_GO_REF.trim())) { console.error('REDDEDİLDİ: I12_LIVE_GO_REF DOLU olmalı.'); process.exit(3); }
  const runId = (process.env.I12_RUNID || '').toLowerCase();
  const pw = process.env.I12_LIVE_LOGIN_PW; const receiptPath = process.env.I12_SETUP_RECEIPT;
  if (!runId || !pw || !receiptPath) { console.error('REDDEDİLDİ: I12_RUNID + I12_LIVE_LOGIN_PW + I12_SETUP_RECEIPT gerekli.'); process.exit(2); }
  const boundDb = dbName(process.env.AH_DATABASE_URL || '');
  if (!process.env.I12_EXPECT_DB || process.env.I12_EXPECT_DB !== boundDb) { console.error(`REDDEDİLDİ: beklenen DB '${process.env.I12_EXPECT_DB || ''}' != bağlı '${boundDb || ''}'.`); process.exit(4); }
  const derivedSlug = `${L.AH.TENANT_PREFIX}${runId}`;
  if (process.env.I12_EXPECT_TENANT_SLUG !== derivedSlug) { console.error(`REDDEDİLDİ: hedef slug beyanı '${process.env.I12_EXPECT_TENANT_SLUG || ''}' türetilen '${derivedSlug}' ile eşleşmiyor.`); process.exit(4); }

  const prisma = L.AH.loadPrisma(); const bcrypt = require(process.env.AH_BCRYPT_PATH);
  try {
    const st = await L.setupI3(prisma, bcrypt, runId, await bcrypt.hash(pw, 10)); st.runId = runId;
    // FD zinciri ön koşulu (DISTRIBUTION_APPROVED disposition) — G3/G4/G6/FD-RED/FD-TMO için.
    await L.setupDisclosureChain(prisma, st, runId);
    // G7 statement aktivitesi: caseClient ALACAKLI + önceki-ay POSTED disposition + CLIENT_PAYABLE + şablon + Office.
    const now = new Date(); const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 10, 0, 0));
    await prisma.caseClient.update({ where: { id: st.caseClientId }, data: { role: 'ALACAKLI' } });
    await prisma.client.update({ where: { id: st.clientId }, data: { email: `deliv-${runId}@ah-harness.invalid` } });
    const col = await prisma.collection.create({ data: { tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT', date: prev, idempotencyKey: `i12live-col-${runId}`, status: 'CONFIRMED' }, select: { id: true } });
    const ap = await prisma.officeApprovalRequest.create({ data: { tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST', targetType: 'COLLECTION_DISPOSITION', targetRef: 'x', requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id, status: 'APPROVED', decidedAt: prev, savedIntent: {}, payloadHash: `i12live-${runId}` }, select: { id: true } });
    await prisma.collectionDisposition.create({ data: { tenantId: st.tenantId, caseId: st.caseId, collectionId: col.id, beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: st.caseClientId, status: 'POSTED', postedAt: prev, totalAmount: '100.00', currency: 'TRY', approvalRequestId: ap.id, approvedById: st.actors.elev2.id, lines: { create: [{ type: 'CLIENT_PAYABLE', amount: '100.00', caseClientId: st.caseClientId }] } }, select: { id: true } });
    await prisma.messageTemplate.create({ data: { tenantId: st.tenantId, code: 'STATEMENT_READY', name: 'Ekstre', category: 'STATEMENT_READY', channel: 'EMAIL', subject: 'Aylik ekstre', body: 'Sayin muvekkil', isActive: true } });
    // Office SMTP: gerçek-benzeri (pencere bunu sink'e alacak). Legacy düz-metin pass (canlıda gerçek enc:v1: + KEY olur).
    await prisma.office.upsert({ where: { tenantId: st.tenantId }, update: {}, create: { tenantId: st.tenantId, name: 'İ12 Canlı Sentetik Büro', smtpHost: 'smtp.example.invalid', smtpPort: 587, smtpUser: `office-${runId}@x.invalid`, smtpPass: 'i12-live-legacy-pass', smtpSecure: true, smtpFromName: 'İ12', smtpFromEmail: 'noreply@ah-harness.invalid' } });

    const receipt = { record: 'I12-SETUP-RECEIPT', runId, tenantId: st.tenantId, tenantSlug: st.slug, foreignTenantId: st.foreignTenantId, caseId: st.caseId, caseClientId: st.caseClientId, clientId: st.clientId, loginEmail: st.actors.elev1.email, createdAt: new Date().toISOString() };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 1), 'utf8');
    console.log(JSON.stringify({ record: 'I12-LIVE-SETUP', ok: true, runId, tenantId: st.tenantId, tenantSlug: st.slug, receipt: receiptPath }, null, 1));
  } catch (e) { console.error(`DURDU: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally { await prisma.$disconnect().catch(() => {}); }
})();
