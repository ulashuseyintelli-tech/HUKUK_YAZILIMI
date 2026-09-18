'use strict';
/*
 * İ13 — BAĞIMSIZ KURTARMA (koşum yarıda kaldıysa). Hedef makbuzdan ya da I13_RECOVER_RUNID'den TÜRETİLEN slug ile
 * bulunur — tahmin YOK. Kimlik bağı doğrulanmadan HİÇBİR YAZMA yapılmaz. Tekrarı güvenlidir.
 * Env: I13_LIVE_CONFIRM=1 · I13_LIVE_GO_REF · [I13_RECEIPT] · [I13_RECOVER_RUNID] · AH_DATABASE_URL · AH_PRISMA_ROOT
 * Çıkış: 0 kapandı/kapatılacak şey yok · 1 kapanış doğrulanmadı · 2 hedef belirsiz · 3 onay yok · 4 kimlik bağı yok
 */
const fs = require('fs');
const { L, closeAccess } = require('./i13-lib');
(async () => {
  if (process.env.I13_LIVE_CONFIRM !== '1' || !(process.env.I13_LIVE_GO_REF || '').trim()) { console.error('REDDEDİLDİ: I13_LIVE_CONFIRM=1 + I13_LIVE_GO_REF gerekli.'); process.exit(3); }
  let receipt = null;
  try { if (process.env.I13_RECEIPT && fs.existsSync(process.env.I13_RECEIPT)) receipt = JSON.parse(fs.readFileSync(process.env.I13_RECEIPT, 'utf8')); } catch (e) { receipt = null; }
  const prisma = L.AH.loadPrisma();
  try {
    if (!receipt && process.env.I13_RECOVER_RUNID) {
      const rid = String(process.env.I13_RECOVER_RUNID).toLowerCase();
      if (!/^[0-9a-f]{8}$/.test(rid)) { console.error('REDDEDİLDİ: runId 8 hex değil'); process.exitCode = 2; return; }
      const slug = `${L.AH.TENANT_PREFIX}${rid}`;
      const t = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
      const f = await prisma.tenant.findFirst({ where: { slug: `${slug}-x` }, select: { id: true } });
      if (!t) { console.log(JSON.stringify({ record: 'I13-LIVE-RECOVER', runId: rid, nothingToRecover: true, wroteNothing: true })); return; }
      receipt = { runId: rid, tenantId: t.id, tenantSlug: slug, foreignTenantId: f ? f.id : null };
    }
    if (!receipt) { console.error('REDDEDİLDİ: makbuz ya da I13_RECOVER_RUNID gerekli.'); process.exitCode = 2; return; }
    const c = await closeAccess(prisma, receipt);
    console.log(JSON.stringify({ record: 'I13-LIVE-RECOVER', runId: receipt.runId, closure: c }, null, 1));
    process.exitCode = c.ok ? 0 : c.wroteNothing ? 4 : 1;
  } catch (e) { console.error(`KURTARMA HATASI: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally { await prisma.$disconnect().catch(() => {}); }
})();
