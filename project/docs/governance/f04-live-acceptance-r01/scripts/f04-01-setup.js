/*
 * F04 CANLI KABUL — ADIM 1: SENTETIK ALAN KURULUMU (ATOMIK)
 *
 * AZAMI YAZMA KAPSAMI — VARSAYILAN (TAM OLARAK 11 satir, baskasi DEGIL):
 *   1 Tenant · 1 User · 1 Lawyer(PARTNER) · 1 Client · 1 Case · 1 CaseClient
 *   1 Collection(CONFIRMED, 100.00 TRY) · 1 ExpenseRequest(SENT/APPROVED, 100.00)
 *   1 OfficeApprovalRequest(APPROVED) · 1 CollectionDisposition(DISTRIBUTION_APPROVED, 100.00)
 *   1 CollectionDispositionLine(CLIENT_EXPENSE_REIMBURSEMENT, 100.00)
 *
 * ISTEGE BAGLI (yalniz `F04_WITH_REVERSAL_PRECONDITIONS=1`, A2-EXT icin) +2 satir:
 *   1 IcrabotTimelineEntry(PAYMENT_RECEIVED) · 1 AccountingJournalEntry(COLLECTION_CASH_RECEIPT_RECORDED)
 *
 * ATOMIKLIK: butun satirlar TEK transaction'da yazilir. Yarida kesilme yetim kayit BIRAKMAZ —
 * ya hepsi ya hicbiri.
 *
 * KURTARILABILIRLIK: kosum kimligi (`runId`) SIR ICERMEZ ve tenant slug'ina gomulidur
 * (`f04-acc-<runId>`). Commit basarili olup durum dosyasi YAZILAMAZSA, betik kurtarma
 * talimatini basar ve SIFIRDAN FARKLI cikis kodu dondurur — sessizce basarili SAYILMAZ.
 *
 * SIR YONETIMI: parola durum dosyasina ASLA yazilmaz. `F04_LOGIN_PASSWORD` verilmisse o
 * kullanilir; verilmemisse uretilir ve YALNIZ BIR KEZ stdout'a basilir.
 *
 * GERI ALINABILIRLIK: varsayilan 11 satirin hepsi silinebilir. `IcrabotTimelineEntry` ise
 * veritabani seviyesinde SILINEMEZ ("immutable_violation: DELETE ... is forbidden. Legal facts
 * are immutable." — dogrudan SQL ile dogrulandi), bu yuzden varsayilan kurulum onu YAZMAZ.
 *
 * DIS BILDIRIM: bu adim bildirim/e-posta/SMS ureten hicbir servis cagirmaz. Uretilen
 * kullanicinin e-posta domaini `f04-acceptance.invalid`tir (RFC 2606) — teslim EDILEMEZ.
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const L = require('./f04-lib');

const PRISMA_ROOT = process.env.F04_PRISMA_ROOT
  || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE20/project/apps/api/node_modules/@prisma/client';
const BCRYPT = process.env.F04_BCRYPT_PATH || path.join(PRISMA_ROOT, '../../bcrypt');

// A2 icin GEREKSIZ; yalniz A2-EXT (tersleme) icin. Varsayilan KAPALI: silinemeyen kayit uretir.
const WITH_REVERSAL_PRECONDITIONS = process.env.F04_WITH_REVERSAL_PRECONDITIONS === '1';
// YALNIZ NEGATIF KONTROL ICIN: transaction'i belirtilen adimdan SONRA bilerek dusurur.
// Canli kosumda TANIMLANMAZ; amaci atomikligin gercekten calistigini kanitlamaktir.
const ABORT_AFTER = process.env.F04_ABORT_AFTER || null;

(async () => {
  const prisma = L.loadPrisma();
  const bcrypt = require(BCRYPT);

  // Kosum kimligi: SIR ICERMEZ, slug'a gomulür, kurtarmanin tek girdisidir.
  const runId = (process.env.F04_RUN_ID || crypto.randomBytes(4).toString('hex')).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(runId)) throw new Error(`gecersiz F04_RUN_ID='${runId}' (8 hex bekleniyor)`);
  const slug = `${L.TENANT_PREFIX}${runId}`;
  L.assertOwnSlug(slug); // G-1

  const generatedPassword = !process.env.F04_LOGIN_PASSWORD;
  const loginPassword = process.env.F04_LOGIN_PASSWORD
    || `F04-${crypto.randomBytes(12).toString('base64url')}!aB9`;

  try {
    // ── G-3 + izolasyon baseline (transaction DISINDA, yazmadan ONCE) ──
    const existing = await prisma.tenant.findMany({ select: { id: true, slug: true } });
    if (existing.some((t) => t.slug === slug)) throw new Error(`G-3 IHLALI: '${slug}' zaten var`);

    const globalTotals = {
      tenant: existing.length,
      collection: await prisma.collection.count(),
      disposition: await prisma.collectionDisposition.count(),
      journal: await prisma.accountingJournalEntry.count(),
      audit: await prisma.auditLog.count(),
    };
    // Izlenen kume = bilinen korunan tenant'lar + en fazla 20 komsu ornegi. Ornek olmadan,
    // korunan tenant bulunmayan bir ortamda izolasyon kapisi bos kumeyle PASS verirdi.
    const SAMPLE_LIMIT = Number(process.env.F04_ISOLATION_SAMPLE || 20);
    const sample = existing.filter((t) => !L.FORBIDDEN_SLUGS.has(t.slug)).slice(0, SAMPLE_LIMIT);
    const watched = [...existing.filter((t) => L.FORBIDDEN_SLUGS.has(t.slug)), ...sample];
    const protectedTenants = [];
    for (const t of watched) {
      protectedTenants.push({
        slug: t.slug,
        collection: await prisma.collection.count({ where: { tenantId: t.id } }),
        disposition: await prisma.collectionDisposition.count({ where: { tenantId: t.id } }),
        journal: await prisma.accountingJournalEntry.count({ where: { tenantId: t.id } }),
        audit: await prisma.auditLog.count({ where: { tenantId: t.id } }),
        client: await prisma.client.count({ where: { tenantId: t.id } }),
      });
    }
    const isolationBaseline = {
      globalTotals,
      protectedTenants,
      knownProtected: watched.filter((t) => L.FORBIDDEN_SLUGS.has(t.slug)).map((t) => t.slug),
    };

    L.step('S0', `hedef DB'de ${existing.length} tenant · yeni slug '${slug}' cakismiyor`);
    L.log(`      izlenen tenant: ${protectedTenants.length} · bilinen korunan: `
      + (isolationBaseline.knownProtected.join(', ') || 'YOK (bu ortamda gercek/program tenanti yok)'));

    // bcrypt transaction DISINDA (uzun surer, kilit tutmamali)
    const passwordHash = await bcrypt.hash(loginPassword, 10);

    // ── ATOMIK YAZMA ──
    L.step('S1', `atomik kurulum (tek transaction) — ${WITH_REVERSAL_PRECONDITIONS ? 13 : 11} satir`);
    const written = [];
    const out = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: `F04 Acceptance ${runId}`, slug }, select: { id: true } });
      written.push('Tenant');

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: `f04-${runId}@f04-acceptance.invalid`, // RFC 2606: teslim EDILEMEZ
          name: 'F04', surname: 'Approver', passwordHash, role: 'ADMIN',
        },
        select: { id: true, email: true },
      });
      written.push('User');

      await tx.lawyer.create({
        data: { tenantId: tenant.id, name: 'F04', surname: 'Partner', lawyerRank: 'PARTNER', userId: user.id },
        select: { id: true },
      });
      written.push('Lawyer');

      const client = await tx.client.create({
        data: { tenantId: tenant.id, type: 'PERSON', name: `F04 Client ${runId}` }, select: { id: true },
      });
      written.push('Client');

      const kase = await tx.case.create({
        data: { tenantId: tenant.id, fileNumber: `F04-${runId}`, type: 'GENERAL_EXECUTION', clientId: client.id },
        select: { id: true },
      });
      written.push('Case');

      const caseClient = await tx.caseClient.create({
        data: { caseId: kase.id, clientId: client.id, role: 'ALACAKLI' }, select: { id: true },
      });
      written.push('CaseClient');
      if (ABORT_AFTER === 'CaseClient') throw new Error('F04_ABORT_AFTER=CaseClient — negatif kontrol');

      const collection = await tx.collection.create({
        data: {
          tenantId: tenant.id, caseId: kase.id, amount: '100.00', type: 'TAHSILAT',
          date: new Date(), idempotencyKey: `f04-col-${runId}`, status: 'CONFIRMED',
        },
        select: { id: true },
      });
      written.push('Collection');

      const expenseRequest = await tx.expenseRequest.create({
        data: {
          tenantId: tenant.id, caseId: kase.id, clientId: client.id,
          totalAmount: '100.00', paidTotal: '0.00', currency: 'TRY',
          status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: user.id,
        },
        select: { id: true },
      });
      written.push('ExpenseRequest');

      const approval = await tx.officeApprovalRequest.create({
        data: {
          tenantId: tenant.id, actionCode: 'COLLECTION_DISPOSITION_POST',
          targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending',
          requesterUserId: user.id, approverUserId: user.id,
          status: 'APPROVED', decidedAt: new Date(), savedIntent: {}, payloadHash: `f04-${runId}`,
        },
        select: { id: true },
      });
      written.push('OfficeApprovalRequest');

      const disposition = await tx.collectionDisposition.create({
        data: {
          tenantId: tenant.id, caseId: kase.id, collectionId: collection.id,
          beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: caseClient.id,
          status: 'DISTRIBUTION_APPROVED', totalAmount: '100.00', currency: 'TRY',
          approvalRequestId: approval.id, approvedById: user.id,
          lines: {
            create: [{
              type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '100.00',
              expenseRequestId: expenseRequest.id, caseClientId: caseClient.id,
            }],
          },
        },
        select: { id: true, lines: { select: { id: true, type: true } } },
      });
      written.push('CollectionDisposition', 'CollectionDispositionLine');

      if (WITH_REVERSAL_PRECONDITIONS) {
        await tx.icrabotTimelineEntry.create({
          data: {
            tenantId: tenant.id, caseId: kase.id, type: 'PAYMENT_RECEIVED',
            title: 'F04 payment received', aggregateVersion: BigInt(1),
            body: {
              header: { eventId: crypto.randomUUID(), eventType: 'PAYMENT_RECEIVED' },
              payload: { collectionId: collection.id, tenantId: tenant.id, caseId: kase.id },
            },
          },
          select: { id: true },
        });
        written.push('IcrabotTimelineEntry');

        await tx.accountingJournalEntry.create({
          data: {
            tenantId: tenant.id, entryType: 'COLLECTION_CASH_RECEIPT_RECORDED',
            sourceType: 'COLLECTION', sourceId: collection.id, sourceAction: 'recorded',
            idempotencyKey: `f04-journal-${runId}`, metadata: { sourceVersion: `f04-source-version-${runId}` },
          },
          select: { id: true },
        });
        written.push('AccountingJournalEntry');
      }

      return {
        tenantId: tenant.id, userId: user.id, userEmail: user.email, clientId: client.id,
        caseId: kase.id, caseClientId: caseClient.id, collectionId: collection.id,
        expenseRequestId: expenseRequest.id, approvalRequestId: approval.id,
        dispositionId: disposition.id, lineId: disposition.lines[0].id,
      };
    }, { timeout: Number(process.env.F04_SETUP_TX_TIMEOUT_MS || 30000), maxWait: 10000 });

    const EXPECTED = WITH_REVERSAL_PRECONDITIONS ? 13 : 11;
    if (written.length !== EXPECTED) throw new Error(`beklenen ${EXPECTED} satir, yazilan ${written.length}`);

    // ── COMMIT EDILDI. Buradan sonrasi kurtarilabilir olmalidir. ──
    L.step('S2', `KURULUM COMMIT EDILDI — ${written.length}/${EXPECTED} satir · runId=${runId} · tenant=${slug}`);

    const state = {
      package: 'F04-LIVE-ACCEPTANCE-R01',
      createdAt: new Date().toISOString(),
      runId, slug, ...out,
      // Parola BILEREK yok — `F04_LOGIN_PASSWORD` ile verilir.
      passwordStored: false,
      reversalPreconditions: WITH_REVERSAL_PRECONDITIONS,
      irreversibleRowsWritten: WITH_REVERSAL_PRECONDITIONS ? ['IcrabotTimelineEntry'] : [],
      isolationBaseline,
      writtenRows: written,
      writtenRowCount: written.length,
    };

    if (generatedPassword) {
      L.log('');
      L.log('  ============================================================');
      L.log('  PAROLA (BIR KEZ gosterilir; durum dosyasina YAZILMAZ):');
      L.log(`    export F04_LOGIN_PASSWORD='${loginPassword}'`);
      L.log('  ============================================================');
    }

    try {
      L.saveState(state);
    } catch (e) {
      console.error('');
      console.error('!!! KURULUM COMMIT EDILDI ama DURUM DOSYASI YAZILAMADI:', e && e.message);
      console.error('    Kayitlar CANLIDA MEVCUTTUR. Kurtarma:');
      console.error(`      F04_RUN_ID=${runId} node f04-00-recover-state.js`);
      process.exitCode = 4; // sessizce basarili SAYILMAZ
      return;
    }

    L.log(`      durum dosyasi: ${process.env.F04_STATE_FILE || 'f04-state.json'} (parola ICERMEZ)`);
    L.log(`      kurtarma: F04_RUN_ID=${runId} node f04-00-recover-state.js`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nKURULUM HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
