/*
 * F04 CANLI KABUL — ADIM 3: BAGIMSIZ NIHAI DOGRULAMA
 *
 * A2'nin kendi iddialarindan BAGIMSIZ olarak kalici duruma bakar ve TEK sentetik islemin
 * finansal ayak izini SAYI/TUR/TUTAR/DENGE/BAG duzeyinde dogrular.
 *
 * Beklentiler bu paketin sentetik senaryosuna gore SABITTIR (tek dagitim satiri,
 * CLIENT_EXPENSE_REIMBURSEMENT, 100,00 TRY):
 *   V-2  TAM 2 journal: COLLECTION_DISTRIBUTION_POSTED ×1 + ..._EXPENSE_APPLICATION_APPLIED ×1
 *        (fazlasi = MUKERRER/yanlis journal → FAIL)
 *   V-3  TAM 4 satir; her journal DEBIT == CREDIT == 100,00 TRY; hesap kodlari beklenen kume
 *   V-4  kaynak/idempotency bagi: her journal'in idempotencyKey'i tenant ve kaynak kimligini
 *        tasir, anahtarlar BENZERSIZDIR, satirlar dogru collection/dispositionLine'a baglidir
 *   V-5  TAM 1 APPLY (100,00) / 0 REVERSAL, dogru expenseRequest bagi
 *   V-6  audit olayi: OFFICE_APPROVAL_EXECUTION_SUCCEEDED, dogru aktor
 *
 * FAIL-CLOSED: bir olcum YAPILAMAZSA sonuc "yok/temiz" SAYILMAZ; OLCULEMEDI olarak FAIL eder.
 */
'use strict';
const L = require('./f04-lib');

const AMOUNT = '100';               // tek satirlik senaryo tutari
const CURRENCY = 'TRY';
const EXPECTED_ENTRIES = {
  COLLECTION_DISTRIBUTION_POSTED: 1,
  COLLECTION_DISPOSITION_EXPENSE_APPLICATION_APPLIED: 1,
};
const EXPECTED_ACCOUNTS = {
  COLLECTION_DISTRIBUTION_POSTED: { DEBIT: 'CASH_CLEARING', CREDIT: 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE' },
  COLLECTION_DISPOSITION_EXPENSE_APPLICATION_APPLIED: { DEBIT: 'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE', CREDIT: 'CLIENT_EXPENSE_RECEIVABLE' },
};

const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(5)} ${desc}\n        ${observed}`);
}
function unmeasured(id, desc, why) {
  results.push({ id, desc, ok: false, unmeasured: true, observed: `OLCULEMEDI — ${why}` });
  console.log(`  ????? ${id.padEnd(5)} ${desc}\n        OLCULEMEDI — ${why}`);
}
const num = (v) => Number(v).toString();

(async () => {
  const st = L.loadState();
  L.assertOwnSlug(st.slug);
  const prisma = L.loadPrisma();

  try {
    await L.assertOwnTenant(prisma, st.tenantId);
    const T = { tenantId: st.tenantId };
    L.step('V', `nihai dogrulama — tenant ${st.slug} (runId ${st.runId || 'bilinmiyor'})`);

    // ── V-1 posting sonucu ──
    const disp = await prisma.collectionDisposition.findUniqueOrThrow({
      where: { id: st.dispositionId },
      select: { status: true, postedAt: true, manualReversalRequiredAt: true, totalAmount: true },
    });
    chk('V-1', 'posting sonucu', disp.status === 'POSTED' && !!disp.postedAt && !disp.manualReversalRequiredAt
      && num(disp.totalAmount) === AMOUNT,
      `status=${disp.status} postedAt=${disp.postedAt ? 'VAR' : 'YOK'} `
      + `manualReversal=${disp.manualReversalRequiredAt ? 'VAR' : 'YOK'} tutar=${num(disp.totalAmount)}`);

    // ── V-2 journal TURU ve SAYISI (mukerrer/yanlis journal yakalanir) ──
    const entries = await prisma.accountingJournalEntry.findMany({ where: T });
    const byType = entries.reduce((a, e) => (a[e.entryType] = (a[e.entryType] || 0) + 1, a), {});
    const expectedTotal = Object.values(EXPECTED_ENTRIES).reduce((a, b) => a + b, 0);
    // Kurulum A2-EXT modunda ek bir kasa journal'i yazmis olabilir — o BEKLENEN kabul edilir.
    const allowExtra = st.reversalPreconditions ? { COLLECTION_CASH_RECEIPT_RECORDED: 1 } : {};
    const expectedAll = { ...EXPECTED_ENTRIES, ...allowExtra };
    const typeDiffs = [];
    for (const k of new Set([...Object.keys(expectedAll), ...Object.keys(byType)])) {
      if ((expectedAll[k] || 0) !== (byType[k] || 0)) typeDiffs.push(`${k}: beklenen ${expectedAll[k] || 0}, bulunan ${byType[k] || 0}`);
    }
    chk('V-2', 'journal turu ve sayisi (mukerrer/yanlis journal yok)', typeDiffs.length === 0,
      typeDiffs.length ? typeDiffs.join(' · ') : `${entries.length} journal, tipler=${JSON.stringify(byType)}`);

    // ── V-3 satir tutarlari ve DENGESI ──
    const lines = await prisma.accountingJournalLine.findMany({ where: T });
    const postingEntries = entries.filter((e) => EXPECTED_ENTRIES[e.entryType]);
    const lineIssues = [];
    let checkedLines = 0;
    for (const e of postingEntries) {
      const ls = lines.filter((l) => l.journalEntryId === e.id);
      checkedLines += ls.length;
      if (ls.length !== 2) { lineIssues.push(`${e.entryType}: ${ls.length} satir (2 bekleniyor)`); continue; }
      const deb = ls.filter((l) => l.direction === 'DEBIT');
      const cre = ls.filter((l) => l.direction === 'CREDIT');
      if (deb.length !== 1 || cre.length !== 1) { lineIssues.push(`${e.entryType}: DEBIT/CREDIT dengesiz (${deb.length}/${cre.length})`); continue; }
      const d = num(deb[0].amount); const c = num(cre[0].amount);
      if (d !== AMOUNT || c !== AMOUNT) lineIssues.push(`${e.entryType}: tutar ${d}/${c} (${AMOUNT} bekleniyor)`);
      if (d !== c) lineIssues.push(`${e.entryType}: DEBIT != CREDIT`);
      if (deb[0].currency !== CURRENCY || cre[0].currency !== CURRENCY) lineIssues.push(`${e.entryType}: para birimi`);
      const exp = EXPECTED_ACCOUNTS[e.entryType];
      if (deb[0].accountCode !== exp.DEBIT) lineIssues.push(`${e.entryType}: DEBIT hesabi ${deb[0].accountCode} (${exp.DEBIT} bekleniyor)`);
      if (cre[0].accountCode !== exp.CREDIT) lineIssues.push(`${e.entryType}: CREDIT hesabi ${cre[0].accountCode} (${exp.CREDIT} bekleniyor)`);
    }
    chk('V-3', 'satir tutarlari, para birimi, hesap kodlari ve DENGE', lineIssues.length === 0 && checkedLines === 4,
      lineIssues.length ? lineIssues.join(' · ') : `${checkedLines} satir · her journal DEBIT=CREDIT=${AMOUNT} ${CURRENCY}`);

    // ── V-4 kaynak / idempotency bagi ──
    const bagIssues = [];
    const keys = new Set();
    for (const e of postingEntries) {
      if (!e.idempotencyKey) { bagIssues.push(`${e.entryType}: idempotencyKey YOK`); continue; }
      if (keys.has(e.idempotencyKey)) bagIssues.push(`${e.entryType}: idempotencyKey MUKERRER`);
      keys.add(e.idempotencyKey);
      if (!e.idempotencyKey.includes(st.tenantId)) bagIssues.push(`${e.entryType}: idempotencyKey tenant bagi YOK`);
      if (!e.sourceId || !e.idempotencyKey.includes(e.sourceId)) bagIssues.push(`${e.entryType}: idempotencyKey kaynak bagi YOK`);
      if (!e.sourceType) bagIssues.push(`${e.entryType}: sourceType YOK`);
      const ls = lines.filter((l) => l.journalEntryId === e.id);
      if (!ls.every((l) => l.collectionId === st.collectionId)) bagIssues.push(`${e.entryType}: satir collection bagi YANLIS`);
      if (!ls.every((l) => l.dispositionLineId === st.lineId)) bagIssues.push(`${e.entryType}: satir dagitim satiri bagi YANLIS`);
    }
    chk('V-4', 'kaynak ve idempotency bagi', bagIssues.length === 0,
      bagIssues.length ? bagIssues.join(' · ')
        : `${keys.size} benzersiz idempotencyKey · tenant + kaynak kimligi gomulu · satirlar dogru collection/dagitim satirina bagli`);

    // ── V-5 APPLY tutari ──
    const apps = await prisma.collectionDispositionExpenseApplication.findMany({ where: T });
    const applies = apps.filter((a) => a.kind === 'APPLY');
    const reversals = apps.filter((a) => a.kind === 'REVERSAL');
    const expense = await prisma.expenseRequest.findUniqueOrThrow({
      where: { id: st.expenseRequestId }, select: { totalAmount: true, paidTotal: true, status: true },
    });
    const netApplied = applies.reduce((t, a) => t + Number(a.amount), 0)
      - reversals.reduce((t, a) => t + Number(a.amount), 0);
    const applyOk = applies.length === 1 && reversals.length === 0
      && num(applies[0].amount) === AMOUNT
      && applies[0].expenseRequestId === st.expenseRequestId
      && netApplied === Number(AMOUNT);
    chk('V-5', 'masraf uygulamasi: tam 1 APPLY, dogru tutar ve bag', applyOk,
      `APPLY=${applies.length} REVERSAL=${reversals.length} tutar=${applies[0] ? num(applies[0].amount) : '-'} `
      + `net=${netApplied} masrafToplami=${num(expense.totalAmount)} kalan=${Number(expense.totalAmount) - netApplied} `
      + `expenseRequest bagi=${applies[0] ? applies[0].expenseRequestId === st.expenseRequestId : false}`);

    // ── V-6 audit olayi ──
    const audit = await prisma.auditLog.findMany({ where: T, select: { action: true, userId: true, entityType: true } });
    const succeeded = audit.filter((a) => a.action === 'OFFICE_APPROVAL_EXECUTION_SUCCEEDED');
    const auditOk = succeeded.length === 1 && succeeded[0].userId === st.userId
      && !audit.some((a) => /FAIL|DENIED|ERROR/i.test(a.action));
    chk('V-6', 'audit: dogru olay ve aktor', auditOk,
      `toplam=${audit.length} · ${JSON.stringify(audit.reduce((a, r) => (a[r.action] = (a[r.action] || 0) + 1, a), {}))} `
      + `· aktor dogru=${succeeded[0] ? succeeded[0].userId === st.userId : false}`);

    // ── V-7 IZOLASYON ──
    const b = st.isolationBaseline;
    if (!b) {
      unmeasured('V-7a', 'korunan tenant izolasyonu',
        st.isolationBaselineLost
          ? 'baseline KURTARILAMADI (durum dosyasi yeniden insa edildi) — izolasyon bu kosumda kanitlanamaz'
          : 'izolasyon baseline yok — 01-setup guncel surumle calistirilmalidir');
    } else {
      const nowP = [];
      for (const pt of b.protectedTenants) {
        const t = await prisma.tenant.findFirst({ where: { slug: pt.slug }, select: { id: true } });
        if (!t) { nowP.push({ slug: pt.slug, missing: true }); continue; }
        nowP.push({
          slug: pt.slug,
          collection: await prisma.collection.count({ where: { tenantId: t.id } }),
          disposition: await prisma.collectionDisposition.count({ where: { tenantId: t.id } }),
          journal: await prisma.accountingJournalEntry.count({ where: { tenantId: t.id } }),
          audit: await prisma.auditLog.count({ where: { tenantId: t.id } }),
          client: await prisma.client.count({ where: { tenantId: t.id } }),
        });
      }
      const changes = [];
      for (const pt of b.protectedTenants) {
        const n = nowP.find((x) => x.slug === pt.slug);
        if (!n || n.missing) { changes.push(`${pt.slug}: KAYIP`); continue; }
        for (const k of ['collection', 'disposition', 'journal', 'audit', 'client']) {
          if (pt[k] !== n[k]) changes.push(`${pt.slug}.${k}: ${pt[k]}→${n[k]}`);
        }
      }
      const watchedN = b.protectedTenants.length;
      chk('V-7a', 'IZLENEN tenant\'larin sayimlari degismedi', changes.length === 0 && watchedN > 0,
        changes.length ? changes.join(' · ')
          : (watchedN > 0
            ? `${watchedN} tenant DEGISMEDI (bilinen korunan: ${(b.knownProtected || []).join(', ') || 'yok'})`
            : 'IZLEME KUMESI BOS — izolasyon kapisi TEST EDILMEDI (FAIL)'));

      const nowTotals = {
        tenant: await prisma.tenant.count(),
        collection: await prisma.collection.count(),
        disposition: await prisma.collectionDisposition.count(),
        journal: await prisma.accountingJournalEntry.count(),
        audit: await prisma.auditLog.count(),
      };
      const mine = {
        tenant: 1,
        collection: await prisma.collection.count({ where: T }),
        disposition: await prisma.collectionDisposition.count({ where: T }),
        journal: entries.length,
        audit: audit.length,
      };
      const delta = {}; const outside = {};
      for (const k of Object.keys(nowTotals)) { delta[k] = nowTotals[k] - b.globalTotals[k]; outside[k] = delta[k] - mine[k]; }
      const nz = Object.entries(outside).filter(([, v]) => v !== 0);
      chk('V-7b', 'global artis bizim tenant ile aciklaniyor (bilgi)', true,
        `artis=${JSON.stringify(delta)} · bizim=${JSON.stringify(mine)}`
        + (nz.length ? ` · DISIMIZDA=${JSON.stringify(Object.fromEntries(nz))} (canli kullanici etkinligi olabilir)` : ' · disimizda artis YOK'));
    }

    // ── V-8 kilit/transaction sizintisi (olculemezse FAIL) ──
    try {
      const leaks = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND state = 'idle in transaction'
            AND state_change < now() - interval '30 seconds'`,
      );
      chk('V-8', 'uzun sureli acik transaction (kilit sizintisi) yok', leaks[0].n === 0,
        `idle-in-transaction>30s = ${leaks[0].n}`);
    } catch (e) {
      unmeasured('V-8', 'kilit sizintisi kontrolu', `pg_stat_activity okunamadi: ${e && e.message}`);
    }

    // ── V-9 dis bildirim (SAYILAMAYAN = FAIL) ──
    const notif = {}; const notifUnmeasured = [];
    for (const m of ['notificationQueue', 'clientNotification', 'clientStatementDeliveryLedger', 'poaExpiryNotificationDelivery']) {
      if (!prisma[m]) { notif[m] = 'MODEL_YOK'; continue; }
      try { notif[m] = await prisma[m].count({ where: T }); }
      catch (e) { notif[m] = 'SAYILAMADI'; notifUnmeasured.push(m); }
    }
    if (notifUnmeasured.length) {
      unmeasured('V-9', 'dis bildirim uretilmedi', `sayilamayan model(ler): ${notifUnmeasured.join(', ')} — "bildirim yok" SAYILMAZ`);
    } else {
      const none = Object.values(notif).every((v) => v === 0 || v === 'MODEL_YOK');
      chk('V-9', 'dis bildirim uretilmedi', none, JSON.stringify(notif));
    }

    const okN = results.filter((r) => r.ok).length;
    const unm = results.filter((r) => r.unmeasured).length;
    console.log(`\nF04 NIHAI DOGRULAMA: ${okN}/${results.length}${unm ? ` · OLCULEMEYEN ${unm}` : ''} `
      + `${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'F04-LIVE-VERIFY', tenant: st.slug, runId: st.runId,
      acceptanceScope: 'posting kilit beklemesi ve finansal sonuc (butun F04 yaris kabulu DEGIL)',
      result: `${okN}/${results.length}`, unmeasured: unm,
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nDOGRULAMA HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
