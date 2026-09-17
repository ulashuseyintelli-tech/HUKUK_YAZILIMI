/*
 * İ12 — CANLI KURTARMA + NİHAİ KAPANIŞ (BAĞIMSIZ GİRİŞ NOKTASI) · her koşulda · fail-closed · idempotent
 *
 * §7.9 canlı zincirinde bu betik PowerShell try/finally(trap) içinde, İLK YAZMADAN itibaren HER SONUÇTA
 * çağrılır (kurulum yarıda kalsa bile). Kurtarmayı "throw mesajına" bırakmaz.
 *
 * ★ HER YAZMADAN ÖNCE KİMLİK BAĞI: `i12-live-identity.assertReceiptIdentity` ile hedef VE yabancı
 *   tenant'ın ID↔slug↔runId bağı DB'den doğrulanır (slug `ah-<runId>` / `ah-<runId>-x`, `ah-` öneki).
 *   Bağ doğrulanmazsa **HİÇBİR kullanıcıya ve HİÇBİR Office kaydına YAZILMAZ** — sıfır yazma, exit != 0.
 *
 * ★ ADIMLAR BİRBİRİNİN HATASIYLA ATLANMAZ: (1) Office SMTP rollback ve (2) erişim kapanışı AYRI
 *   try/catch içinde çalışır; biri patlarsa diğeri YİNE DE koşar. Sonuçlar toplanır; herhangi biri
 *   doğrulanmadıysa çıkış 1 (HATA) — PowerShell trap escalate eder.
 *
 * ★ NİHAİ ERİŞİM KAPANIŞI burada yapılır (ölçüm fazlarının İÇİNDE değil): smtp/mock/g7 fazları aynı
 *   makbuzla koştuğundan erken kapanış sonraki fazların login'ini kırardı.
 *
 * `.env` restore + görev yeniden başlatma bu betiğin İŞİ DEĞİL (dosya/task op) — PowerShell zincirinin
 * sorumluluğudur; burada 'DELEGATED_TO_POWERSHELL' olarak RAPORLANIR (sessizce tamam SAYILMAZ).
 *
 * ÇIKIŞ: 0 yalnız kimlik doğrulandı + Office rollback ok + erişim kapandı. Aksi: 1 (kurtarma eksik) ·
 *   2 (hedef bilgisi yok) · 3 (canlı onay/GO yok) · 4 (kimlik bağı DOĞRULANMADI → sıfır yazma).
 * KULLANIM: I12_LIVE_CONFIRM=1 I12_LIVE_GO_REF=<ref> I12_SETUP_RECEIPT=<yol> I12_WINDOW_ROLLBACK=<yol>
 *           AH_DATABASE_URL=<canlı DB> AH_PRISMA_ROOT=<...> node i12-live-recover.js
 *   (makbuz yoksa: I12_RECOVER_RUNID + I12_RECOVER_TENANT_ID [+ I12_RECOVER_FOREIGN_TENANT_ID])
 */
'use strict';
const fs = require('fs'); const path = require('path');
const I3 = path.resolve(__dirname, '../../client-acceptance-runners-i3-r01/scripts');
const L = require(path.join(I3, 'i3-lib'));
const { runWindow } = require('./i12-window');
const { assertReceiptIdentity } = require('./i12-live-identity');

async function closeAccess(prisma, tenantId, label) {
  await prisma.user.updateMany({ where: { tenantId }, data: { isActive: false, tokenVersion: { increment: 1 } } });
  const active = (await prisma.user.findMany({ where: { tenantId, isActive: true }, select: { id: true } })).length;
  return { tenant: label, tenantId, active, ok: active === 0 };
}

(async () => {
  if (process.env.I12_LIVE_CONFIRM !== '1') { console.error('REDDEDİLDİ: I12_LIVE_CONFIRM=1 gerekli.'); process.exit(3); }
  if (!(process.env.I12_LIVE_GO_REF && process.env.I12_LIVE_GO_REF.trim())) { console.error('REDDEDİLDİ: I12_LIVE_GO_REF DOLU olmalı.'); process.exit(3); }

  // Hedef kimliği: makbuzdan ya da açık env'den — TAHMİN YOK. Slug runId'den TÜRETİLİR.
  let receipt = null;
  const receiptPath = process.env.I12_SETUP_RECEIPT;
  if (receiptPath && fs.existsSync(receiptPath)) {
    try { const r = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); if (r && r.record === 'I12-SETUP-RECEIPT') receipt = r; } catch (e) { /* bozuk makbuz → env yoluna düş */ }
  }
  const prisma = L.AH.loadPrisma();
  // MAKBUZ YOKSA (kurulum İLK YAZMADAN sonra, makbuz yazılmadan çöktüyse): hedef, yazmadan ÖNCE
  // üretilen runId'den TÜRETİLEN slug ile ARANIR (İ5b dersi: kurtarma durum dosyasına bağlı olamaz).
  // Slug araması salt-okumadır ve yalnız `ah-` sentetik önekiyle yapılır; bulunamazsa YAZMA YOK.
  if (!receipt && process.env.I12_RECOVER_RUNID) {
    const rid = String(process.env.I12_RECOVER_RUNID).toLowerCase();
    const slug = `${L.AH.TENANT_PREFIX}${rid}`;
    let tid = process.env.I12_RECOVER_TENANT_ID || null;
    let fid = process.env.I12_RECOVER_FOREIGN_TENANT_ID || null;
    try {
      if (!tid) { const t = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } }); tid = t ? t.id : null; }
      if (!fid) { const f = await prisma.tenant.findFirst({ where: { slug: `${slug}-x` }, select: { id: true } }); fid = f ? f.id : null; }
    } catch (e) { /* DB okunamadı → aşağıda hedef yok sayılır, YAZMA YOK */ }
    if (tid) receipt = { record: 'I12-SETUP-RECEIPT', runId: rid, tenantId: tid, tenantSlug: slug, foreignTenantId: fid };
    else {
      console.log(JSON.stringify({ record: 'I12-LIVE-RECOVER', runId: rid, targetSlug: slug, ok: true, wroteNothing: true, nothingToRecover: true, note: `'${slug}' DB'de YOK — kurulum hiç yazmamış; kurtarılacak Office/erişim kaydı yok.`, envRestore: 'DELEGATED_TO_POWERSHELL' }, null, 1));
      await prisma.$disconnect().catch(() => {}); process.exit(0);
    }
  }
  if (!receipt) { console.error('REDDEDİLDİ: makbuz ya da I12_RECOVER_RUNID gerekli — kurtarma tenant TAHMİN ETMEZ.'); await prisma.$disconnect().catch(() => {}); process.exit(2); }

  const out = { record: 'I12-LIVE-RECOVER', runId: receipt.runId, tenantId: receipt.tenantId, tenantSlug: receipt.tenantSlug, foreignTenantId: receipt.foreignTenantId || null, envRestore: 'DELEGATED_TO_POWERSHELL' };
  try {
    // ── KİMLİK BAĞI — HER YAZMADAN ÖNCE. Doğrulanmazsa SIFIR YAZMA. ──
    const ident = await assertReceiptIdentity(prisma, receipt);
    out.identity = ident;
    if (!ident.ok) {
      out.ok = false; out.wroteNothing = true;
      out.note = `KİMLİK BAĞI DOĞRULANMADI (${ident.reason}) — hiçbir kullanıcıya/Office kaydına YAZILMADI. ESCALATE.`;
      console.error(JSON.stringify(out, null, 1));
      process.exitCode = 4; return;
    }

    // ── (1) OFFICE rollback — KENDİ try/catch'i; hatası erişim kapanışını ATLATMAZ ──
    try { out.officeRollback = await runWindow(prisma, 'close', ident.target.id); }
    catch (e) { out.officeRollback = { ok: false, reason: 'RUNWINDOW_THREW', error: e && e.message ? e.message : String(e) }; }

    // ── (2) NİHAİ ERİŞİM KAPANIŞI — KENDİ try/catch'i; Office hatasından BAĞIMSIZ koşar ──
    out.access = [];
    for (const t of [{ id: ident.target.id, label: 'target' }, ...(ident.foreign ? [{ id: ident.foreign.id, label: 'foreign' }] : [])]) {
      try { out.access.push(await closeAccess(prisma, t.id, t.label)); }
      catch (e) { out.access.push({ tenant: t.label, tenantId: t.id, ok: false, error: e && e.message ? e.message : String(e) }); }
    }

    const officeOk = !!(out.officeRollback && out.officeRollback.ok);
    const accessOk = out.access.length > 0 && out.access.every((a) => a.ok);
    out.ok = officeOk && accessOk;
    out.note = out.ok
      ? 'Kimlik doğrulandı; Office rollback + nihai erişim kapanışı TAMAM. .env restore + task restart PowerShell zincirinde.'
      : `KURTARMA EKSİK (office=${officeOk} erişim=${accessOk}) — PowerShell trap ESCALATE etmeli; İ12 KAPANMAZ.`;
    console.log(JSON.stringify(out, null, 1));
    process.exitCode = out.ok ? 0 : 1;
  } catch (e) {
    out.ok = false; out.fatal = e && e.message ? e.message : String(e);
    console.error(JSON.stringify(out, null, 1)); process.exitCode = 1;
  } finally { await prisma.$disconnect().catch(() => {}); }
})();
