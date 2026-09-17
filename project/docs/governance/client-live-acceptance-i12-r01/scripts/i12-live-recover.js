/*
 * İ12 — CANLI KURTARMA (BAĞIMSIZ GİRİŞ NOKTASI) · her koşulda çağrılır · fail-closed · idempotent
 *
 * §7.9 canlı dizisinde bu betik PowerShell try/finally(trap) içinde HER SONUÇTA çağrılır — ölçüm başarılı,
 * başarısız veya çökmüş olsun. Kurtarmayı "throw mesajına" bırakmaz. DB tarafı kapanışları GARANTİ eder:
 *   (1) OFFICE SMTP rollback: i12-window.runWindow(close) — fail-closed (NO_ROLLBACK/CORRUPT/UNREADABLE/
 *       MISMATCH → ok:false, wroteNothing; doğrulanmış kapanış kanıtı olmadan PASS VERİLMEZ).
 *   (2) ERİŞİM kapanışı: sentetik tenant(lar)ın kullanıcıları pasifleştirilir (isActive:false + tokenVersion++),
 *       aktif==0 doğrulanır. Hedef + yabancı (ah-<runId>-x) tenant kapsanır.
 *   (3) .env restore + task restart: bu betiğin İŞİ DEĞİL (dosya/task op) — PowerShell zincirinin sorumluluğu;
 *       burada 'DELEGATED_TO_POWERSHELL' olarak RAPORLANIR (sessizce tamam sayılmaz).
 *
 * GÜVENLİK: yalnız `ah-` önekli SENTETİK slug'lara dokunur (assertOwnSlug) — gerçek müvekkil tenant'ına ASLA.
 *   Slug/tenant makbuzdan (I12_SETUP_RECEIPT) veya açık I12_RECOVER_TENANT_ID+SLUG'dan gelir; ikisi de yoksa
 *   REDDEDER (tenant tahmin ETMEZ). Sır (parola/smtpPass) okunmaz/yazılmaz.
 *
 * ÇIKIŞ: 0 yalnız Office rollback ok VE erişim kapandıysa; aksi halde !=0 (fail-closed) → PowerShell trap escalate eder.
 * KULLANIM: I12_LIVE_CONFIRM=1 I12_LIVE_GO_REF=<ref> I12_SETUP_RECEIPT=<yol> I12_WINDOW_ROLLBACK=<yol>
 *           AH_DATABASE_URL=<canlı DB> AH_PRISMA_ROOT=<...> node i12-live-recover.js
 */
'use strict';
const fs = require('fs'); const path = require('path');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const { runWindow } = require('./i12-window');

async function closeAccess(prisma, tenantId, label) {
  try {
    await prisma.user.updateMany({ where: { tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } });
    const active = (await prisma.user.findMany({ where: { tenantId, isActive: true }, select: { id: true } })).length;
    return { tenant: label, tenantId, active, ok: active === 0 };
  } catch (e) { return { tenant: label, tenantId, ok: false, error: e && e.message ? e.message : String(e) }; }
}

(async () => {
  if (process.env.I12_LIVE_CONFIRM !== '1') { console.error('REDDEDİLDİ: I12_LIVE_CONFIRM=1 gerekli.'); process.exit(3); }
  if (!(process.env.I12_LIVE_GO_REF && process.env.I12_LIVE_GO_REF.trim())) { console.error('REDDEDİLDİ: I12_LIVE_GO_REF DOLU olmalı.'); process.exit(3); }

  // Hedef kimliğini makbuzdan ya da açık env'den al — tahmin YOK.
  let tenantId = null, tenantSlug = null, foreignTenantId = null;
  const receiptPath = process.env.I12_SETUP_RECEIPT;
  if (receiptPath && fs.existsSync(receiptPath)) {
    try { const r = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); if (r.record === 'I12-SETUP-RECEIPT') { tenantId = r.tenantId; tenantSlug = r.tenantSlug; foreignTenantId = r.foreignTenantId || null; } } catch (e) {}
  }
  if (!tenantId && process.env.I12_RECOVER_TENANT_ID && process.env.I12_RECOVER_TENANT_SLUG) { tenantId = process.env.I12_RECOVER_TENANT_ID; tenantSlug = process.env.I12_RECOVER_TENANT_SLUG; }
  if (!tenantId || !tenantSlug) { console.error('REDDEDİLDİ: makbuz ya da I12_RECOVER_TENANT_ID+SLUG gerekli — kurtarma tenant TAHMİN ETMEZ.'); process.exit(2); }

  // GÜVENLİK: yalnız sentetik `ah-` slug — gerçek tenant'a dokunmayı fail-closed engelle.
  try { L.AH.assertOwnSlug(tenantSlug); } catch (e) { console.error(`REDDEDİLDİ: '${tenantSlug}' sentetik (ah-) slug DEĞİL — kurtarma reddeder: ${e && e.message ? e.message : e}`); process.exit(4); }

  const prisma = L.AH.loadPrisma();
  const out = { record: 'I12-LIVE-RECOVER', tenantId, tenantSlug, foreignTenantId, envRestore: 'DELEGATED_TO_POWERSHELL' };
  try {
    // (1) OFFICE rollback — fail-closed (window mantığının TEK kaynağı).
    try { out.officeRollback = await runWindow(prisma, 'close', tenantId); }
    catch (e) { out.officeRollback = { ok: false, reason: 'RUNWINDOW_THREW', error: e && e.message ? e.message : String(e) }; }

    // (2) ERİŞİM kapanışı — hedef + yabancı sentetik tenant.
    out.access = [await closeAccess(prisma, tenantId, 'target')];
    if (foreignTenantId) out.access.push(await closeAccess(prisma, foreignTenantId, 'foreign'));

    const officeOk = !!(out.officeRollback && out.officeRollback.ok);
    const accessOk = out.access.every((a) => a.ok);
    out.ok = officeOk && accessOk;
    out.note = out.ok ? 'DB kapanışı doğrulandı; .env restore + task restart PowerShell zincirinde.' : 'KURTARMA EKSİK — PowerShell trap escalate etmeli (Office rollback ve/veya erişim kapanışı doğrulanmadı).';
    console.log(JSON.stringify(out, null, 1));
    process.exitCode = out.ok ? 0 : 1;
  } catch (e) {
    out.ok = false; out.fatal = e && e.message ? e.message : String(e);
    console.error(JSON.stringify(out, null, 1)); process.exitCode = 1;
  } finally { await prisma.$disconnect().catch(() => {}); }
})();
