/*
 * F04 CANLI KABUL — ADIM 1: SENTETIK ALAN KURULUMU
 *
 * AZAMI YAZMA KAPSAMI — VARSAYILAN (bu adim TAM OLARAK su 11 satiri yazar, baskasini DEGIL):
 *   1 Tenant · 1 User · 1 Lawyer(PARTNER) · 1 Client · 1 Case · 1 CaseClient
 *   1 Collection(CONFIRMED, 100.00 TRY) · 1 ExpenseRequest(SENT/APPROVED, 100.00)
 *   1 OfficeApprovalRequest(APPROVED) · 1 CollectionDisposition(DISTRIBUTION_APPROVED, 100.00)
 *   1 CollectionDispositionLine(CLIENT_EXPENSE_REIMBURSEMENT, 100.00)
 *
 * ISTEGE BAGLI (yalniz `F04_WITH_REVERSAL_PRECONDITIONS=1`, A2-EXT icin) +2 satir:
 *   1 IcrabotTimelineEntry(PAYMENT_RECEIVED) · 1 AccountingJournalEntry(COLLECTION_CASH_RECEIPT_RECORDED)
 *
 * GERI ALINABILIRLIK: varsayilan 11 satirin hepsi silinebilir. `IcrabotTimelineEntry` ise
 * veritabani seviyesinde SILINEMEZ — provada dogrudan SQL ile dogrulandi:
 * "immutable_violation: DELETE on \"IcrabotTimelineEntry\" is forbidden. Legal facts are immutable."
 * Bu yuzden varsayilan kurulum onu YAZMAZ ve canliya geri alinamaz kayit BIRAKMAZ.
 *
 * Yazilan satirlarin HEPSI yeni uretilen tenant'a aittir. Mevcut hicbir satir GUNCELLENMEZ veya SILINMEZ.
 * Gercek tenant'a, baska programlarin tenant'larina ve ortak yapilandirmaya DOKUNULMAZ.
 *
 * DIS BILDIRIM RISKI: bu adim bildirim/e-posta/SMS ureten hicbir servis cagirmaz; yalniz Prisma
 * yazmasi yapar. Uretilen kullanicinin e-posta domaini `f04-acceptance.invalid`tir (RFC 2606) —
 * yanlislikla bir gonderim tetiklense bile gercek bir aliciya ULASAMAZ.
 */
'use strict';
const path = require('path');
const L = require('./f04-lib');

const PRISMA_ROOT = process.env.F04_PRISMA_ROOT
  || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE20/project/apps/api/node_modules/@prisma/client';
// bcrypt, hedef surumun kendi node_modules'undan alinir (login'in dogrulayacagi ayni kutuphane).
const BCRYPT = process.env.F04_BCRYPT_PATH
  || path.join(PRISMA_ROOT, '../../bcrypt');

const LOGIN_PASSWORD = process.env.F04_LOGIN_PASSWORD || 'F04-Acceptance-' + L.newSuffix() + '!aB9';
// A2 icin GEREKSIZ; yalniz A2-EXT (tersleme) icin. Varsayilan KAPALI cunku silinemeyen kayit uretir.
const WITH_REVERSAL_PRECONDITIONS = process.env.F04_WITH_REVERSAL_PRECONDITIONS === '1';

(async () => {
  const prisma = L.loadPrisma();
  const bcrypt = require(BCRYPT);
  const sfx = L.newSuffix();
  const slug = process.env.F04_TENANT_SLUG || `${L.TENANT_PREFIX}${sfx}`;
  L.assertOwnSlug(slug); // G-1

  try {
    // G-3: slug cakismasi ve komsu tenant envanteri.
    const existing = await prisma.tenant.findMany({ select: { id: true, slug: true } });
    if (existing.some((t) => t.slug === slug)) throw new Error(`G-3 IHLALI: '${slug}' zaten var`);
    // V-5 izolasyon kapisi icin baseline. Tenant basina tek tek saymak olceklenmez
    // (provada hedef DB'de 1173 test tenant'i bulundu) — bu yuzden iki katmanli olculur:
    //   (i)  GLOBAL toplamlar: kosum sonrasi artis YALNIZ bizim yazdigimiz kadar olmalidir
    //   (ii) KORUNAN tenant'lar: gercek ofis + diger programlarin alanlari, tek tek
    const globalTotals = {
      tenant: existing.length,
      collection: await prisma.collection.count(),
      disposition: await prisma.collectionDisposition.count(),
      journal: await prisma.accountingJournalEntry.count(),
      audit: await prisma.auditLog.count(),
    };
    // Korunan kume = (a) bilinen gercek/baska-program tenant'lari + (b) en fazla 20 komsu
    // ornegi. (b) olmadan, bu tenant'larin bulunmadigi bir ortamda V-5a bos listeyle PASS
    // verir ve kapi fiilen TEST EDILMEMIS olur (provada bizzat gozlendi).
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
      globalTotals, protectedTenants,
      knownProtected: watched.filter((t) => L.FORBIDDEN_SLUGS.has(t.slug)).map((t) => t.slug),
    };
    L.step('S0', `hedef DB'de ${existing.length} tenant var; yeni slug '${slug}' cakismiyor`);
    const knownList = isolationBaseline.knownProtected.join(', ')
      || 'YOK (bu ortamda gercek ofis / diger program tenanti bulunmuyor)';
    L.log(`      izlenen tenant sayisi: ${protectedTenants.length} · bilinen korunan: ${knownList}`);
    L.log(`      global toplamlar: ${JSON.stringify(globalTotals)}`);

    const written = [];
    L.step('S1', 'tenant + aktor (PARTNER lawyer = isApproverEligible on-kosulu)');
    const tenant = await prisma.tenant.create({
      data: { name: `F04 Acceptance ${sfx}`, slug }, select: { id: true },
    });
    written.push(['Tenant', tenant.id]);

    const passwordHash = await bcrypt.hash(LOGIN_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `f04-${sfx}@f04-acceptance.invalid`, // RFC 2606: teslim EDILEMEZ
        name: 'F04', surname: 'Approver', passwordHash, role: 'ADMIN',
      },
      select: { id: true, email: true },
    });
    written.push(['User', user.id]);

    const lawyer = await prisma.lawyer.create({
      data: { tenantId: tenant.id, name: 'F04', surname: 'Partner', lawyerRank: 'PARTNER', userId: user.id },
      select: { id: true },
    });
    written.push(['Lawyer', lawyer.id]);

    L.step('S2', 'muvekkil / dosya / dosya-muvekkil bagi');
    const client = await prisma.client.create({
      data: { tenantId: tenant.id, type: 'PERSON', name: `F04 Client ${sfx}` }, select: { id: true },
    });
    written.push(['Client', client.id]);
    const kase = await prisma.case.create({
      data: { tenantId: tenant.id, fileNumber: `F04-${sfx}`, type: 'GENERAL_EXECUTION', clientId: client.id },
      select: { id: true },
    });
    written.push(['Case', kase.id]);
    const caseClient = await prisma.caseClient.create({
      data: { caseId: kase.id, clientId: client.id, role: 'ALACAKLI' }, select: { id: true },
    });
    written.push(['CaseClient', caseClient.id]);

    L.step('S3', 'tahsilat (CONFIRMED, 100.00 TRY) — A2 kilidinin hedef satiri');
    const collection = await prisma.collection.create({
      data: {
        tenantId: tenant.id, caseId: kase.id, amount: '100.00', type: 'TAHSILAT',
        date: new Date(), idempotencyKey: `f04-col-${sfx}`, status: 'CONFIRMED',
      },
      select: { id: true },
    });
    written.push(['Collection', collection.id]);

    L.step('S4', 'masraf talebi (SENT/APPROVED, 100.00) + dagitim onay kaydi');
    const expenseRequest = await prisma.expenseRequest.create({
      data: {
        tenantId: tenant.id, caseId: kase.id, clientId: client.id,
        totalAmount: '100.00', paidTotal: '0.00', currency: 'TRY',
        status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: user.id,
      },
      select: { id: true },
    });
    written.push(['ExpenseRequest', expenseRequest.id]);

    const approval = await prisma.officeApprovalRequest.create({
      data: {
        tenantId: tenant.id, actionCode: 'COLLECTION_DISPOSITION_POST',
        targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending',
        requesterUserId: user.id, approverUserId: user.id,
        status: 'APPROVED', decidedAt: new Date(), savedIntent: {}, payloadHash: `f04-${sfx}`,
      },
      select: { id: true },
    });
    written.push(['OfficeApprovalRequest', approval.id]);

    L.step('S5', 'dagitim karari (DISTRIBUTION_APPROVED, 100.00) + tek satir');
    const disposition = await prisma.collectionDisposition.create({
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
    written.push(['CollectionDisposition', disposition.id]);
    written.push(['CollectionDispositionLine', disposition.lines[0].id]);

    // S6 — YALNIZ A2-EXT (tersleme) icin. A2'nin kendisi (posting serilestirmesi) bunlari
    // GEREKTIRMEZ. `IcrabotTimelineEntry` veritabani seviyesinde SILINEMEZ
    // ("immutable_violation: DELETE ... is forbidden. Legal facts are immutable." — provada
    // dogrudan SQL ile dogrulandi), bu yuzden VARSAYILAN kurulum onu YAZMAZ: boylece paket
    // canliya geri alinamaz hicbir kayit birakmaz.
    let timeline = null;
    let journal = null;
    if (WITH_REVERSAL_PRECONDITIONS) {
      L.step('S6', 'A2-EXT on kosullari (timeline event + kasa journal) — GERI ALINAMAZ KAYIT URETIR');
      timeline = await prisma.icrabotTimelineEntry.create({
        data: {
          tenantId: tenant.id, caseId: kase.id, type: 'PAYMENT_RECEIVED',
          title: 'F04 payment received', aggregateVersion: BigInt(1),
          body: {
            header: { eventId: require('crypto').randomUUID(), eventType: 'PAYMENT_RECEIVED' },
            payload: { collectionId: collection.id, tenantId: tenant.id, caseId: kase.id },
          },
        },
        select: { id: true },
      });
      written.push(['IcrabotTimelineEntry', timeline.id]);

      journal = await prisma.accountingJournalEntry.create({
        data: {
          tenantId: tenant.id, entryType: 'COLLECTION_CASH_RECEIPT_RECORDED',
          sourceType: 'COLLECTION', sourceId: collection.id, sourceAction: 'recorded',
          idempotencyKey: `f04-journal-${sfx}`, metadata: { sourceVersion: `f04-source-version-${sfx}` },
        },
        select: { id: true },
      });
      written.push(['AccountingJournalEntry', journal.id]);
    } else {
      L.step('S6', 'A2-EXT on kosullari ATLANDI (varsayilan) — geri alinamaz kayit URETILMEDI');
    }

    // G-2: yazilan her satirin tenant'i dogrulanir.
    await L.assertOwnTenant(prisma, tenant.id);
    const strayCounts = {
      collection: await prisma.collection.count({ where: { tenantId: tenant.id } }),
      disposition: await prisma.collectionDisposition.count({ where: { tenantId: tenant.id } }),
      journal: await prisma.accountingJournalEntry.count({ where: { tenantId: tenant.id } }),
    };

    const state = {
      package: 'F04-LIVE-ACCEPTANCE-R01',
      createdAt: new Date().toISOString(),
      databaseTarget: 'F04_DATABASE_URL (deger kaydedilmez)',
      slug, tenantId: tenant.id, userId: user.id, userEmail: user.email,
      loginPassword: LOGIN_PASSWORD, // yalniz yerel durum dosyasinda; repoya YAZILMAZ
      clientId: client.id, caseId: kase.id, caseClientId: caseClient.id,
      collectionId: collection.id, expenseRequestId: expenseRequest.id,
      approvalRequestId: approval.id, dispositionId: disposition.id,
      lineId: disposition.lines[0].id,
      isolationBaseline,
      writtenRows: written.map(([m]) => m),
      writtenRowCount: written.length,
      reversalPreconditions: WITH_REVERSAL_PRECONDITIONS,
      irreversibleRowsWritten: WITH_REVERSAL_PRECONDITIONS ? ['IcrabotTimelineEntry'] : [],
    };
    L.saveState(state);

    const EXPECTED = WITH_REVERSAL_PRECONDITIONS ? 13 : 11;
    L.step('S7', `KURULUM TAMAM — yazilan satir: ${written.length}/${EXPECTED}`);
    L.log(`      tenant: ${slug} (${tenant.id})`);
    L.log(`      tenant ici sayimlar: collection=${strayCounts.collection} disposition=${strayCounts.disposition} journal=${strayCounts.journal}`);
    L.log(`      durum dosyasi: ${process.env.F04_STATE_FILE || 'f04-state.json'}`);
    if (written.length !== EXPECTED) throw new Error(`beklenen ${EXPECTED} satir, yazilan ${written.length}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('\nKURULUM HATASI:', e && e.stack ? e.stack : e); process.exit(1); });
