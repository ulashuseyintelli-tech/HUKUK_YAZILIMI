/*
 * OFFICE AK KABUL — ERISIM KAPATMA (YALNIZ runId ILE; durum dosyasi GEREKMEZ)
 *
 * NE YAPAR (yalniz `off-ak-<runId>` tenant'inda):
 *   1) aktif sentetik User satirlari: isActive=false + tokenVersion++  -> login 401, dagitilmis JWT'ler gecersiz
 *   2) (varsa) ACTIVE Case -> CLOSED  — kabul Case YAZMAZ; bu dal yalniz urun gerilemesine karsi
 *      emniyettir (gunluk case cron'lari yalniz ACTIVE secer; CLIENT I1b R02 dersi)
 * NE YAPMAZ: AuditLog / Lawyer / Office satirlarini silmez veya degistirmez (audit KALICI kanittir ve
 *   korunur; bu DOGRULANIR). Canlida silme YOKTUR.
 * TEKRAR GUVENLIDIR: ikinci kosum `alreadyClosed=true`, yazma 0. Alan yoksa "alan YOK" ARANARAK olculur.
 *
 * KULLANIM (kurtarma):  AK_RUN_ID=<8 hex> node ak-99-close.js   (G-0 ortam degiskenleri gerekir)
 */
'use strict';
const L = require('./ak-lib');

async function closeByRunId(prisma, runId) {
  const slug = L.slugFor(runId);
  L.assertOwnSlug(slug); // G-1
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!t) {
    return { record: 'OFFICE-AK-CLOSE', runId, slug, found: false, verified: true,
      note: 'alan YOK (slug ile ARANDI) — kapatilacak erisim yok' };
  }
  await L.assertOwnTenant(prisma, t.id); // G-2
  const T = { tenantId: t.id };
  const auditBefore = await prisma.auditLog.count({ where: T });
  const activeUsersBefore = await prisma.user.count({ where: { ...T, isActive: true } });
  const users = await prisma.user.updateMany({
    where: { ...T, isActive: true },
    data: { isActive: false, tokenVersion: { increment: 1 } },
  });
  const cases = await prisma.case.updateMany({ where: { ...T, status: 'ACTIVE' }, data: { status: 'CLOSED' } });
  const stillActiveUsers = await prisma.user.count({ where: { ...T, isActive: true } });
  const activeCasesAfter = await prisma.case.count({ where: { ...T, status: 'ACTIVE' } });
  const auditAfter = await prisma.auditLog.count({ where: T });
  const office = await prisma.office.findUnique({ where: T, select: { autoGreetingEnabled: true } });
  const verified = stillActiveUsers === 0 && activeCasesAfter === 0 && auditBefore === auditAfter;
  return {
    record: 'OFFICE-AK-CLOSE', runId, slug, found: true, tenantId: t.id,
    activeUsersBefore, usersDeactivated: users.count, stillActiveUsers,
    casesClosed: cases.count, activeCasesAfter,
    auditBefore, auditAfter, auditPreserved: auditBefore === auditAfter,
    alreadyClosed: activeUsersBefore === 0,
    greetingDisabled: office ? office.autoGreetingEnabled === false : null,
    verified,
  };
}

module.exports = { closeByRunId };

if (require.main === module) {
  (async () => {
    L.assertRunEnvironment(); // G-0
    const runId = String(process.env.AK_RUN_ID || '').toLowerCase();
    const prisma = L.loadPrisma();
    try {
      const rec = await closeByRunId(prisma, runId);
      console.log(JSON.stringify(rec, null, 1));
      process.exitCode = rec.verified ? 0 : 3;
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  })().catch((e) => { console.error('KAPATMA HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
}
