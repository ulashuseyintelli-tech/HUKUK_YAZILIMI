'use strict';
/*
 * İ16 — BAĞIMSIZ KURTARMA (koşum yarıda kaldıysa). Hedef makbuzdan ya da I16_RECOVER_RUNID'den TÜRETİLEN slug ile bulunur.
 * Kimlik bağı (i13-lib closeAccess → i12-live-identity) doğrulanmadan HİÇBİR YAZMA yok. Kapatılanlar: personel kullanıcıları
 * (isActive=false + tokenVersion++) · ACTIVE Case → CLOSED · bu iki tenant'ın PORTAL kullanıcıları (isActive=false +
 * tokenVersion++) + Client.hasPortalAccess=false. Tekrarı güvenlidir. Silme YOK.
 * Env: I16_LIVE_CONFIRM=1 · I16_LIVE_GO_REF · [I16_RECEIPT] · [I16_RECOVER_RUNID] · AH_DATABASE_URL · AH_PRISMA_ROOT
 * Çıkış: 0 kapandı/kapatılacak şey yok · 1 doğrulanmadı · 2 hedef belirsiz · 3 onay yok · 4 kimlik bağı yok
 */
const fs = require('fs');
const { L, closeAccess } = require('../../client-live-acceptance-i13-r01/scripts/i13-lib');
(async () => {
  if (process.env.I16_LIVE_CONFIRM !== '1' || !(process.env.I16_LIVE_GO_REF || '').trim()) { console.error('REDDEDİLDİ: I16_LIVE_CONFIRM=1 + I16_LIVE_GO_REF gerekli.'); process.exit(3); }
  let receipt = null;
  try { if (process.env.I16_RECEIPT && fs.existsSync(process.env.I16_RECEIPT)) receipt = JSON.parse(fs.readFileSync(process.env.I16_RECEIPT, 'utf8')); } catch (e) { receipt = null; }
  const prisma = L.AH.loadPrisma();
  try {
    if (!receipt && process.env.I16_RECOVER_RUNID) {
      const rid = String(process.env.I16_RECOVER_RUNID).toLowerCase();
      if (!/^[0-9a-f]{8}$/.test(rid)) { console.error('REDDEDİLDİ: runId 8 hex değil'); process.exitCode = 2; return; }
      const slug = `${L.AH.TENANT_PREFIX}${rid}`;
      const t = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
      const f = await prisma.tenant.findFirst({ where: { slug: `${slug}-x` }, select: { id: true } });
      if (!t) { console.log(JSON.stringify({ record: 'I16-LIVE-RECOVER', runId: rid, nothingToRecover: true, wroteNothing: true })); return; }
      receipt = { runId: rid, tenantId: t.id, tenantSlug: slug, foreignTenantId: f ? f.id : null };
    }
    if (!receipt) { console.error('REDDEDİLDİ: makbuz ya da I16_RECOVER_RUNID gerekli.'); process.exitCode = 2; return; }
    const c = await closeAccess(prisma, receipt);   // kimlik bağı yoksa wroteNothing
    if (c.ok) {
      const tids = [receipt.tenantId, receipt.foreignTenantId].filter(Boolean);
      const clients = (await prisma.client.findMany({ where: { tenantId: { in: tids } }, select: { id: true } })).map((x) => x.id);
      await prisma.clientPortalUser.updateMany({ where: { clientId: { in: clients } }, data: { isActive: false, tokenVersion: { increment: 1 } } });
      await prisma.client.updateMany({ where: { id: { in: clients } }, data: { hasPortalAccess: false } });
      c.portalActive = await prisma.clientPortalUser.count({ where: { clientId: { in: clients }, isActive: true } });
      c.ok = c.portalActive === 0;
    }
    console.log(JSON.stringify({ record: 'I16-LIVE-RECOVER', runId: receipt.runId, closure: c }, null, 1));
    process.exitCode = c.ok ? 0 : c.wroteNothing ? 4 : 1;
  } catch (e) { console.error(`KURTARMA HATASI: ${e && e.message ? e.message : e}`); process.exitCode = 1; }
  finally { await prisma.$disconnect().catch(() => {}); }
})();
