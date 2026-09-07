/*
 * F04 CANLI KABUL — ADIM 4: KOSUM SONRASI DISPOZISYON
 *
 * VARSAYILAN SILME DEGILDIR. Finansal ve audit kayitlarini silmek varsayilan temizlik olarak
 * KABUL EDILMEZ; asagidaki uc secenek owner karariyla secilir.
 *
 *   F04_TEARDOWN_MODE=preserve   (VARSAYILAN) — hicbir sey silinmez/degistirilmez.
 *       Sentetik tenant kalici kanit olarak DURUR. Adim yalniz envanter raporu yazar.
 *       Gerekce: F04 kabulunun kaniti kalici kayittir; POSTED bir dagitimi silmek muhasebe
 *       defterinden satir kaldirmak demektir ve mevcut politika bunu tanimaz.
 *
 *   F04_TEARDOWN_MODE=reverse    — urunun KENDI tersleme yolu (iptal → PAYMENT_REVERSED →
 *       POSTED tersleme: `manualReversalRequiredAt` isareti + reimbursement REVERSAL).
 *       Bu, veri SILMEZ; muhasebe politikasina uygun TERS KAYIT uretir. Ancak ek yazma kapsami
 *       ve ayri onay ister; bu script onu KENDILIGINDEN CALISTIRMAZ (A2-EXT paketi).
 *
 *   F04_TEARDOWN_MODE=purge      — sentetik tenant ve TUM satirlari silinir. YALNIZ owner'in
 *       acik talimatiyla ve `F04_CONFIRM_PURGE=YES-DELETE-SYNTHETIC-F04-TENANT` ile calisir.
 *       Silme, bu paketin urettigi tenant ile SINIRLIDIR (G-1/G-2 kapilari).
 */
'use strict';
const L = require('./f04-lib');

const MODE = (process.env.F04_TEARDOWN_MODE || 'preserve').toLowerCase();
const PURGE_TOKEN = 'YES-DELETE-SYNTHETIC-F04-TENANT';

(async () => {
  const st = L.loadState();
  L.assertOwnSlug(st.slug); // G-1
  const prisma = L.loadPrisma();

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    const T = { tenantId: st.tenantId };

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

    L.step('T', `dispozisyon modu: ${MODE.toUpperCase()} · tenant ${st.slug}`);
    L.log(`      envanter: ${JSON.stringify(inv)}`);

    if (MODE === 'preserve') {
      L.log('\n  PRESERVE — hicbir kayit silinmedi veya degistirilmedi.');
      L.log('  Sentetik tenant kalici kabul kaniti olarak durur; slug prefix\'i (f04-acc-) onu');
      L.log('  gercek ofis ve diger programlarin tenant\'larindan ayirir.');
      L.log('  Yazma islemi: 0');
      console.log(JSON.stringify({ record: 'F04-LIVE-TEARDOWN', mode: 'preserve', writeOperations: 0, inventory: inv }, null, 1));
      return;
    }

    if (MODE === 'reverse') {
      L.log('\n  REVERSE — bu script tersleme YURUTMEZ.');
      L.log('  Gerekce: tersleme, urunun iptal + PAYMENT_REVERSED + POSTED-tersleme yolunu calistirir;');
      L.log('  bu EK yazma kapsamidir (Collection CANCELLED, timeline event, reimbursement REVERSAL,');
      L.log('  manualReversalRequiredAt isareti) ve AYRI owner onayi ister — paketteki A2-EXT kalemi.');
      L.log('  Yazma islemi: 0');
      console.log(JSON.stringify({ record: 'F04-LIVE-TEARDOWN', mode: 'reverse', writeOperations: 0, requires: 'A2-EXT owner onayi', inventory: inv }, null, 1));
      process.exitCode = 3; // "uygulanmadi — ayri onay gerekli"
      return;
    }

    if (MODE === 'purge') {
      if (process.env.F04_CONFIRM_PURGE !== PURGE_TOKEN) {
        throw new Error(`PURGE reddedildi: F04_CONFIRM_PURGE=${PURGE_TOKEN} gerekir (owner acik talimati)`);
      }
      L.log('\n  PURGE — yalniz bu paketin sentetik tenant\'i siliniyor...');
      // Bagimlilik sirasi: once yaprak kayitlar.
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
      catch (e) { del.tenant = 'HATA: ' + String(e && e.message || e).replace(/[\r\n]+/g, ' ').slice(0, 300); }

      // SONUC DOGRULAMASI: tek tek silmelerden biri hata verse bile (provada
      // `icrabotTimelineEntry` bir PostgreSQL sorgu hatasi dondurdu) temizligin
      // tenant cascade'i ile TAMAMLANDIGI kanitlanmalidir.
      const residual = {};
      for (const m of ['collection', 'collectionDisposition', 'accountingJournalEntry',
        'icrabotTimelineEntry', 'expenseRequest', 'client', 'case', 'user', 'auditLog']) {
        if (!prisma[m]) continue;
        try { residual[m] = await prisma[m].count({ where: T }); } catch (e) { residual[m] = 'SAYILAMADI'; }
      }
      const tenantStill = await prisma.tenant.findUnique({ where: { id: st.tenantId }, select: { id: true } });
      const clean = tenantDeleted === 1 && !tenantStill
        && Object.values(residual).every((v) => v === 0 || v === 'SAYILAMADI');

      console.log(JSON.stringify({
        record: 'F04-LIVE-TEARDOWN', mode: 'purge', deleted: del, tenantDeleted,
        residualAfterPurge: residual, tenantRowStillPresent: !!tenantStill,
        verdict: clean ? 'TEMIZ — sentetik tenant ve satirlari KALMADI' : 'EKSIK TEMIZLIK — kalinti VAR',
        inventoryBefore: inv,
      }, null, 1));
      if (!clean) process.exitCode = 2;
      return;
    }

    throw new Error(`bilinmeyen F04_TEARDOWN_MODE='${MODE}' (preserve|reverse|purge)`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nDISPOZISYON HATASI:', e && e.stack ? e.stack : e); process.exit(1); });
