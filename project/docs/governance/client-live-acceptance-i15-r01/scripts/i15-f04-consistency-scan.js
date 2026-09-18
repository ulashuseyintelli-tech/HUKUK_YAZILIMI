'use strict';
/*
 * İ15 / İ5(b) — F04 CANLI SALT-OKUMA TUTARLILIK TARAMASI. `SET TRANSACTION READ ONLY` içinde yalnız SAYIM döner.
 * PII, tutar ve kimlik yazdırmaz. Kaynak: canlı R24 (kaynak 006c4dd2). Kullanılan sabitler:
 * `disposition-posting.service.ts` sourceType 'COLLECTION_DISPOSITION_LINE'/'posted' (:521-524),
 * 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION' (:437) ve BalanceLedger source `disposition_line:<lineId>` (:284).
 *
 * SINIR (kayıtta korunur): "ihlal izi bulunmadı" CANLI EŞZAMANLILIK İSPATI DEĞİLDİR. Tarama yalnız KALICI sonuç
 * durumunun tutarlı olduğunu gösterir; yarışın canlıda hiç yaşanmamış olmasından ayırt edilemez.
 * Çıktı: her denetim için ihlal sayısı. Herhangi bir sorgu hatası → ÖLÇÜLEMEYEN (0 sayılmaz).
 * Env: AH_DATABASE_URL · AH_PRISMA_ROOT · [I15_EVID_FILE]
 */
const fs = require('fs');
const LINE_POSTED = `je."sourceType"='COLLECTION_DISPOSITION_LINE' AND je."sourceAction"='posted'`;
const Q = [
  { id: 'SCAN-A', kabul: 'KABUL-A', desc: 'İptal edilmiş tahsilatta, manuel tersleme işaretsiz dağıtımın satırında TERSLENMEMİŞ posted journal',
    sql: `SELECT count(*)::int n FROM "AccountingJournalEntry" je
      JOIN "CollectionDispositionLine" l ON l.id = je."sourceId" JOIN "CollectionDisposition" d ON d.id = l."dispositionId"
      JOIN "Collection" c ON c.id = d."collectionId"
      WHERE ${LINE_POSTED} AND c.status='CANCELLED' AND d."manualReversalRequiredAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "AccountingJournalEntry" r WHERE r."reversalOfEntryId" = je.id)` },
  { id: 'SCAN-1', kabul: 'KABUL-1', desc: 'POSTED dağıtım, tahsilat iptalinden SONRA post edilmiş (postedAt > cancelledAt)',
    sql: `SELECT count(*)::int n FROM "CollectionDisposition" d JOIN "Collection" c ON c.id = d."collectionId"
      WHERE d.status='POSTED' AND c."cancelledAt" IS NOT NULL AND d."postedAt" > c."cancelledAt"` },
  { id: 'SCAN-2/4', kabul: 'KABUL-2 · KABUL-4', desc: 'REVERSED/CANCELLED dağıtım satırında TERSLENMEMİŞ posted journal (manuel tersleme işaretsiz)',
    sql: `SELECT count(*)::int n FROM "AccountingJournalEntry" je
      JOIN "CollectionDispositionLine" l ON l.id = je."sourceId" JOIN "CollectionDisposition" d ON d.id = l."dispositionId"
      WHERE ${LINE_POSTED} AND d.status IN ('REVERSED','CANCELLED') AND d."manualReversalRequiredAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "AccountingJournalEntry" r WHERE r."reversalOfEntryId" = je.id)` },
  { id: 'SCAN-3a', kabul: 'KABUL-3', desc: 'masraf talebi başına REVERSAL toplamı APPLY toplamını AŞIYOR',
    sql: `SELECT count(*)::int n FROM (SELECT "tenantId","expenseRequestId",
        sum(CASE WHEN kind::text='REVERSAL' THEN amount ELSE 0 END) rv, sum(CASE WHEN kind::text='APPLY' THEN amount ELSE 0 END) ap
      FROM "CollectionDispositionExpenseApplication" GROUP BY 1,2) x WHERE x.rv > x.ap` },
  { id: 'SCAN-3b', kabul: 'KABUL-3', desc: 'aynı APPLY için birden fazla REVERSAL (şema kısıtı teyidi)',
    sql: `SELECT count(*)::int n FROM (SELECT "tenantId","reversesApplicationId" FROM "CollectionDispositionExpenseApplication"
      WHERE "reversesApplicationId" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) x` },
  { id: 'SCAN-B1', kabul: 'KABUL-B', desc: 'posted journal girişinde BORÇ ≠ ALACAK (dengesiz giriş)',
    sql: `SELECT count(*)::int n FROM (SELECT jl."journalEntryId",
        sum(CASE WHEN jl.direction::text='DEBIT' THEN jl.amount ELSE 0 END) dr, sum(CASE WHEN jl.direction::text='CREDIT' THEN jl.amount ELSE 0 END) cr
      FROM "AccountingJournalLine" jl JOIN "AccountingJournalEntry" je ON je.id = jl."journalEntryId"
      WHERE je."sourceType" IN ('COLLECTION_DISPOSITION_LINE','COLLECTION_DISPOSITION_EXPENSE_APPLICATION') GROUP BY 1) x WHERE x.dr <> x.cr` },
  { id: 'SCAN-B2', kabul: 'KABUL-B', desc: 'hiç post edilmemiş dağıtıma (HELD/DISTRIBUTION_*) bağlı öksüz finansal iz (posted journal · APPLY · disposition_line ledger)',
    sql: `SELECT (SELECT count(*) FROM "AccountingJournalEntry" je JOIN "CollectionDispositionLine" l ON l.id = je."sourceId"
               JOIN "CollectionDisposition" d ON d.id = l."dispositionId"
               WHERE ${LINE_POSTED} AND d.status IN ('HELD_PENDING_DISTRIBUTION','DISTRIBUTION_RECOMMENDED','DISTRIBUTION_APPROVED'))
         + (SELECT count(*) FROM "CollectionDispositionExpenseApplication" a JOIN "CollectionDisposition" d ON d.id = a."collectionDispositionId"
               WHERE a.kind::text='APPLY' AND d.status IN ('HELD_PENDING_DISTRIBUTION','DISTRIBUTION_RECOMMENDED','DISTRIBUTION_APPROVED'))
         + (SELECT count(*) FROM "BalanceLedger" b JOIN "CollectionDispositionLine" l ON b.source = 'disposition_line:' || l.id
               JOIN "CollectionDisposition" d ON d.id = l."dispositionId"
               WHERE d.status IN ('HELD_PENDING_DISTRIBUTION','DISTRIBUTION_RECOMMENDED','DISTRIBUTION_APPROVED')) AS n` },
  { id: 'SCAN-B3', kabul: 'KABUL-B', desc: 'POSTED dağıtımda posted journal\'ı OLMAYAN satır (yarım posting)',
    sql: `SELECT count(*)::int n FROM "CollectionDispositionLine" l JOIN "CollectionDisposition" d ON d.id = l."dispositionId"
      WHERE d.status='POSTED' AND NOT EXISTS (SELECT 1 FROM "AccountingJournalEntry" je WHERE ${LINE_POSTED} AND je."sourceId" = l.id)` },
  { id: 'SCAN-D1', kabul: 'KABUL-D', desc: 'aynı dağıtım satırı için birden fazla disposition_line ledger kaydı (çift etki)',
    sql: `SELECT count(*)::int n FROM (SELECT "tenantId", source FROM "BalanceLedger" WHERE source LIKE 'disposition\\_line:%' GROUP BY 1,2 HAVING count(*) > 1) x` },
  { id: 'SCAN-D2', kabul: 'KABUL-D', desc: 'aynı satır için birden fazla posted journal (şema kısıtı teyidi)',
    sql: `SELECT count(*)::int n FROM (SELECT je."tenantId", je."sourceId" FROM "AccountingJournalEntry" je WHERE ${LINE_POSTED} GROUP BY 1,2 HAVING count(*) > 1) x` },
];
(async () => {
  const out = { record: 'I15-F04-CONSISTENCY-SCAN', atUtc: new Date().toISOString(), checks: [], limit: 'ihlal izi yokluğu CANLI EŞZAMANLILIK İSPATI DEĞİLDİR' };
  const { PrismaClient } = require(process.env.AH_PRISMA_ROOT);
  const p = new PrismaClient({ datasources: { db: { url: process.env.AH_DATABASE_URL } }, log: [] });
  try {
    await p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const base = await tx.$queryRawUnsafe(`SELECT (SELECT count(*)::int FROM "CollectionDisposition") disp, (SELECT count(*)::int FROM "CollectionDisposition" WHERE status='POSTED') posted,
        (SELECT count(*)::int FROM "CollectionDisposition" WHERE status IN ('REVERSED','CANCELLED')) revcan, (SELECT count(*)::int FROM "Collection" WHERE status='CANCELLED') colcan,
        (SELECT count(*)::int FROM "CollectionDispositionExpenseApplication") apps`);
      out.population = base[0];
      for (const q of Q) {
        try { const r = await tx.$queryRawUnsafe(q.sql); out.checks.push({ id: q.id, kabul: q.kabul, desc: q.desc, violations: Number(r[0].n) }); }
        catch (e) { out.checks.push({ id: q.id, kabul: q.kabul, desc: q.desc, violations: null, error: String(e.message || e).split('\n')[0].slice(0, 160) }); }
      }
      const dl = await tx.$queryRawUnsafe(`SELECT deadlocks::int d FROM pg_stat_database WHERE datname = current_database()`);
      out.info = { pgStatDeadlocksCumulative: dl[0] ? dl[0].d : null, note: 'kümülatif sayaç; kaynağa atfedilemez — yalnız bilgi' };
    }, { timeout: 120000 });
  } catch (e) { out.fatal = String(e.message || e).split('\n')[0].slice(0, 200); }
  finally { await p.$disconnect().catch(() => {}); }
  const unm = out.checks.filter((c) => c.violations === null).length + (out.fatal ? 1 : 0);
  const viol = out.checks.reduce((a, c) => a + (c.violations || 0), 0);
  out.verdict = unm ? 'UNMEASURED' : viol ? 'VIOLATIONS_FOUND' : 'NO_VIOLATION_TRACE';
  const s = JSON.stringify(out, null, 1); if (process.env.I15_EVID_FILE) fs.writeFileSync(process.env.I15_EVID_FILE, s, 'utf8'); console.log(s);
  process.exitCode = unm ? 3 : viol ? 2 : 0;
})();
