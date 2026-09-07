/*
 * F04 CANLI KABUL — ADIM 4: KOSUM SONRASI DISPOZISYON
 *
 * SILME VARSAYILAN DEGILDIR. Finansal ve audit kayitlarini silmek varsayilan temizlik olarak
 * KABUL EDILMEZ.
 *
 * ORTAM KAPISI (fail-safe): `F04_ENVIRONMENT` verilmezse ortam **live** kabul edilir.
 *   live       → yalniz `preserve` ve `revoke-access` calisir. `purge` ve `reverse` REDDEDILIR.
 *   disposable → dort mod da calisabilir (prova/negatif kontrol icin).
 *
 * MODLAR:
 *   preserve       (VARSAYILAN) — hicbir sey silinmez/degistirilmez; yazma 0. Envanter raporlanir.
 *   revoke-access  — **canlida onerilen kapanis.** Sentetik hesabin ERISIMI sonlandirilir:
 *                    `User.isActive = false` + `tokenVersion` artirilir (mevcut JWT'ler gecersizlesir).
 *                    Finansal ve audit kayitlarina DOKUNULMAZ — kanit tam olarak KORUNUR.
 *                    Tek satirda iki alan; tenant/dagitim/journal/audit DEGISMEZ.
 *   reverse        — urunun kendi tersleme yolu (iptal → PAYMENT_REVERSED → POSTED tersleme).
 *                    **CANLI KAPSAM DISI**; ek yazma kapsami ve ayri onay ister (A2-EXT).
 *                    Bu script onu YURUTMEZ.
 *   purge          — sentetik tenant ve tum satirlari silinir. **CANLI KAPSAM DISI.**
 *                    Yalniz `F04_ENVIRONMENT=disposable` + `F04_CONFIRM_PURGE=<token>` ile.
 */
'use strict';
const L = require('./f04-lib');

const MODE = (process.env.F04_TEARDOWN_MODE || 'preserve').toLowerCase();
const ENVIRONMENT = (process.env.F04_ENVIRONMENT || 'live').toLowerCase();
const PURGE_TOKEN = 'YES-DELETE-SYNTHETIC-F04-TENANT';
const DESTRUCTIVE = new Set(['purge', 'reverse']);

(async () => {
  const st = L.loadState();
  L.assertOwnSlug(st.slug); // G-1
  const prisma = L.loadPrisma();

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    const T = { tenantId: st.tenantId };

    if (!['live', 'disposable'].includes(ENVIRONMENT)) {
      throw new Error(`gecersiz F04_ENVIRONMENT='${ENVIRONMENT}' (live|disposable)`);
    }
    if (DESTRUCTIVE.has(MODE) && ENVIRONMENT === 'live') {
      throw new Error(
        `'${MODE}' modu CANLI KAPSAM DISIDIR ve ortam '${ENVIRONMENT}' olarak degerlendirildi. `
        + 'Canlida yalniz preserve ve revoke-access calisir.',
      );
    }

    const inv = {
      collection: await prisma.collection.count({ where: T }),
      disposition: await prisma.collectionDisposition.count({ where: T }),
      journal: await prisma.accountingJournalEntry.count({ where: T }),
      expenseApplication: await prisma.collectionDispositionExpenseApplication.count({ where: T }),
      audit: await prisma.auditLog.count({ where: T }),
      client: await prisma.client.count({ where: T }),
      case: await prisma.case.count({ where: T }),
      user: await prisma.user.count({ where: T }),
    };

    L.step('T', `dispozisyon modu: ${MODE.toUpperCase()} · ortam: ${ENVIRONMENT.toUpperCase()} · tenant ${st.slug}`);
    L.log(`      envanter: ${JSON.stringify(inv)}`);

    if (MODE === 'preserve') {
      L.log('\n  PRESERVE — hicbir kayit silinmedi veya degistirilmedi. Yazma islemi: 0');
      L.log('  Sentetik tenant kalici kabul kaniti olarak durur; `f04-acc-` prefix\'i onu gercek');
      L.log('  ofis ve diger programlarin tenant\'larindan ayirir.');
      L.log('  NOT: sentetik hesabin ERISIMI hala aciktir — kapatmak icin `revoke-access`.');
      console.log(JSON.stringify({ record: 'F04-LIVE-TEARDOWN', mode: 'preserve', environment: ENVIRONMENT, writeOperations: 0, inventory: inv }, null, 1));
      return;
    }

    if (MODE === 'revoke-access') {
      L.step('T-1', 'sentetik hesabin ERISIMI sonlandiriliyor (finansal/audit kanit KORUNUR)');
      const before = await prisma.user.findMany({
        where: T, select: { id: true, isActive: true, tokenVersion: true },
      });
      // Yalniz bu tenant'in kullanicilari; tenant kapsamli updateMany.
      const res = await prisma.$transaction(async (tx) => {
        const r = await tx.user.updateMany({
          where: { tenantId: st.tenantId, isActive: true },
          data: { isActive: false, tokenVersion: { increment: 1 } },
        });
        return r.count;
      });
      const after = await prisma.user.findMany({
        where: T, select: { id: true, isActive: true, tokenVersion: true },
      });
      const stillActive = after.filter((u) => u.isActive).length;
      const bumped = after.filter((u) => {
        const b = before.find((x) => x.id === u.id);
        return b && u.tokenVersion > b.tokenVersion;
      }).length;

      // Kanit korunmus mu? (finansal/audit sayimlari DEGISMEMELI)
      const post = {
        collection: await prisma.collection.count({ where: T }),
        disposition: await prisma.collectionDisposition.count({ where: T }),
        journal: await prisma.accountingJournalEntry.count({ where: T }),
        expenseApplication: await prisma.collectionDispositionExpenseApplication.count({ where: T }),
        audit: await prisma.auditLog.count({ where: T }),
      };
      const preserved = ['collection', 'disposition', 'journal', 'expenseApplication', 'audit']
        .every((k) => post[k] === inv[k]);

      L.log(`      devre disi birakilan kullanici: ${res} · hala aktif: ${stillActive} · tokenVersion artan: ${bumped}`);
      L.log(`      finansal/audit kanit korundu: ${preserved}`);
      console.log(JSON.stringify({
        record: 'F04-LIVE-TEARDOWN', mode: 'revoke-access', environment: ENVIRONMENT,
        usersDeactivated: res, stillActive, tokenVersionBumped: bumped,
        evidencePreserved: preserved, financialAuditCounts: post,
        verdict: (stillActive === 0 && preserved)
          ? 'ERISIM SONLANDIRILDI — finansal/audit kanit KORUNDU'
          : 'EKSIK — erisim tam kapanmadi veya kanit degisti',
      }, null, 1));
      if (!(stillActive === 0 && preserved)) process.exitCode = 2;
      return;
    }

    if (MODE === 'reverse') {
      L.log('\n  REVERSE — bu script tersleme YURUTMEZ (CANLI KAPSAM DISI).');
      L.log('  Tersleme urunun iptal + PAYMENT_REVERSED + POSTED-tersleme yolunu calistirir; bu EK');
      L.log('  yazma kapsamidir (Collection CANCELLED, timeline event, reimbursement REVERSAL,');
      L.log('  manualReversalRequiredAt) ve AYRI owner onayi ister — A2-EXT kalemi.');
      console.log(JSON.stringify({ record: 'F04-LIVE-TEARDOWN', mode: 'reverse', environment: ENVIRONMENT, writeOperations: 0, requires: 'A2-EXT owner onayi', inventory: inv }, null, 1));
      process.exitCode = 3;
      return;
    }

    if (MODE === 'purge') {
      if (process.env.F04_CONFIRM_PURGE !== PURGE_TOKEN) {
        throw new Error(`PURGE reddedildi: F04_CONFIRM_PURGE=${PURGE_TOKEN} gerekir (owner acik talimati)`);
      }
      L.log('\n  PURGE — yalniz bu paketin sentetik tenant\'i siliniyor (disposable ortam)...');
      const del = {};
      const safeDel = async (model, where, label) => {
        if (!prisma[model]) { del[label || model] = 'MODEL_YOK'; return; }
        try { del[label || model] = (await prisma[model].deleteMany({ where })).count; }
        catch (e) {
          const raw = (e && (e.message || String(e))) || '';
          const msg = raw.replace(/[\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim()
            || (e && e.constructor && e.constructor.name) || 'bilinmeyen hata';
          del[label || model] = 'HATA: ' + msg.slice(0, 500);
        }
      };
      await safeDel('collectionDispositionExpenseApplication', T);
      await safeDel('collectionDispositionLine', { disposition: { tenantId: st.tenantId } });
      await safeDel('collectionDisposition', T);
      await safeDel('accountingJournalLine', T);
      await safeDel('accountingJournalEntry', T);
      await safeDel('icrabotTimelineEntry', T);
      await safeDel('collection', T);
      await safeDel('expenseRequest', T);
      await safeDel('officeApprovalRequest', T);
      await safeDel('caseClient', { case: { tenantId: st.tenantId } });
      await safeDel('case', T);
      await safeDel('client', T);
      await safeDel('lawyer', T);
      await safeDel('auditLog', T);
      await safeDel('user', T);
      let tenantDeleted = 0;
      try { await prisma.tenant.delete({ where: { id: st.tenantId } }); tenantDeleted = 1; }
      catch (e) { del.tenant = 'HATA: ' + String((e && e.message) || e).replace(/[\r\n]+/g, ' ').slice(0, 300); }

      const residual = {};
      for (const m of ['collection', 'collectionDisposition', 'accountingJournalEntry',
        'icrabotTimelineEntry', 'expenseRequest', 'client', 'case', 'user', 'auditLog']) {
        if (!prisma[m]) continue;
        try { residual[m] = await prisma[m].count({ where: T }); } catch (e) { residual[m] = 'SAYILAMADI'; }
      }
      const tenantStill = await prisma.tenant.findUnique({ where: { id: st.tenantId }, select: { id: true } });
      const clean = tenantDeleted === 1 && !tenantStill
        && Object.values(residual).every((v) => v === 0);

      console.log(JSON.stringify({
        record: 'F04-LIVE-TEARDOWN', mode: 'purge', environment: ENVIRONMENT, deleted: del,
        tenantDeleted, residualAfterPurge: residual, tenantRowStillPresent: !!tenantStill,
        verdict: clean ? 'TEMIZ — sentetik tenant ve satirlari KALMADI' : 'EKSIK TEMIZLIK — kalinti VAR',
        inventoryBefore: inv,
      }, null, 1));
      if (!clean) process.exitCode = 2;
      return;
    }

    throw new Error(`bilinmeyen F04_TEARDOWN_MODE='${MODE}' (preserve|revoke-access|reverse|purge)`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nDISPOZISYON HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
