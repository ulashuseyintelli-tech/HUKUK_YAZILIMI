/*
 * OFFICE YAZMA KABUL — KAPANIS (A-02 §6)
 *
 * MODLAR
 *   revoke-access (VARSAYILAN) — sentetik User satirlarinda isActive=false + tokenVersion++
 *                                → mevcut JWT gecersiz, yeni login 401. Finansal/audit
 *                                kayitlara DOKUNULMAZ ve bu DOGRULANIR.
 *   preserve                    — yazma 0; envanter raporlanir.
 *   purge                       — sentetik tenant + satirlar SILINIR. CANLIDA YASAK.
 *
 * ORTAM KAPISI (fail-safe): `OW_ENVIRONMENT` VERILMEZSE ortam **live** kabul edilir ve
 * `purge` REDDEDILIR. (G-0 zaten disposable allowlist'i uygular; bu ikinci savunmadir.)
 *
 * A-02 §6: kapanis, kurulum/kabul adimlari BASARISIZ OLSA BILE calisir; kapanis
 * DOGRULANAMAZSA sonuc "kapanis DOGRULANAMADI" olarak raporlanir, SESSIZ GECILMEZ.
 * Envanter YALNIZ rapor icindir: sayilamamasi kapanisi ENGELLEMEZ (F04 dersi).
 */
'use strict';
const L = require('./ow-lib');

const MODE = (process.env.OW_TEARDOWN_MODE || 'revoke-access').toLowerCase();
const ENVIRONMENT = (process.env.OW_ENVIRONMENT || 'live').toLowerCase();
const PURGE_TOKEN = 'YES-DELETE-SYNTHETIC-OFFICE-TENANT';

(async () => {
  L.assertRunEnvironment();
  const st = L.loadState();
  L.assertOwnSlug(st.slug); // G-1
  const prisma = L.loadPrisma();
  const R = L.makeRecorder(`KAPANIS (${MODE})`);

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    const T = { tenantId: st.tenantId };

    if (!['live', 'disposable'].includes(ENVIRONMENT)) {
      throw new Error(`gecersiz OW_ENVIRONMENT='${ENVIRONMENT}' (live|disposable)`);
    }
    if (MODE === 'purge' && ENVIRONMENT === 'live') {
      throw new Error("'purge' CANLI KAPSAM DISIDIR ve ortam 'live' degerlendirildi");
    }
    if (MODE === 'purge' && process.env.OW_CONFIRM_PURGE !== PURGE_TOKEN) {
      throw new Error("'purge' icin OW_CONFIRM_PURGE token'i ZORUNLU");
    }

    // ── Envanter: YALNIZ RAPOR. Sayilamamasi kapanisi ENGELLEMEZ. ──
    const inv = {};
    for (const [k, model] of [
      ['office', 'office'], ['lawyer', 'lawyer'], ['staff', 'staffMember'],
      ['user', 'user'], ['audit', 'auditLog'], ['approval', 'officeApprovalRequest'],
      ['reportingLine', 'reportingLine'],
    ]) {
      try { inv[k] = await prisma[model].count({ where: T }); }
      catch (e) { inv[k] = 'SAYILAMADI'; }
    }
    L.log(`      envanter: ${JSON.stringify(inv)}`);

    if (MODE === 'preserve') {
      R.ok('T-preserve', 'yazma 0 — hicbir sey degistirilmedi', true, JSON.stringify(inv));
    } else if (MODE === 'revoke-access') {
      L.step('T-1', 'sentetik hesaplarin ERISIMI sonlandiriliyor (finansal/audit kanit KORUNUR)');
      const before = { audit: inv.audit, approval: inv.approval, reportingLine: inv.reportingLine };

      const res = await prisma.user.updateMany({
        where: { tenantId: st.tenantId, isActive: true },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      });
      const stillActive = await prisma.user.count({ where: { tenantId: st.tenantId, isActive: true } });
      R.ok('T-1', 'sentetik User satirlari devre disi', res.count > 0 && stillActive === 0,
        `devre disi: ${res.count} · hala aktif: ${stillActive}`);

      // Kanit KORUNDU mu — sayilabilenler icin dogrula, sayilamayan OLCULEMEDI'dir.
      const after = {};
      let evidenceMeasurable = true;
      for (const [k, model] of [['audit', 'auditLog'], ['approval', 'officeApprovalRequest'], ['reportingLine', 'reportingLine']]) {
        try { after[k] = await prisma[model].count({ where: T }); }
        catch (e) { after[k] = 'SAYILAMADI'; evidenceMeasurable = false; }
      }
      if (!evidenceMeasurable) {
        R.unmeasured('T-2', 'finansal/audit kanit korunmasi', 'sayim yapilamadi');
      } else {
        const same = Object.keys(after).every((k) => before[k] === after[k]);
        R.ok('T-2', 'audit/onay/raporlama kayitlari KORUNDU', same,
          `once ${JSON.stringify(before)} · sonra ${JSON.stringify(after)}`);
      }

      // SEYIRCI TENANT'A HIC YAZMA YAPILMADI (ana yurutucunun sarti).
      const bySlug = `${L.TENANT_PREFIX}bystander-${st.runId}`;
      try {
        const by = await prisma.tenant.findFirst({ where: { slug: bySlug }, select: { id: true } });
        if (!by) {
          R.ok('T-3', 'seyirci tenant kurulmadi (dolu ortam) — kapsam disi', true, 'seyirci yok');
        } else {
          // Seyirci artik cross-tenant olcutleri icin TEK kullanici tasiyor. Dolayisiyla
          // olcut "sifir satir" DEGIL, **kurulumdan beri DEGISMEDI**tir: kabul adimlari ona
          // yazmamali ve `revoke-access` ona DOKUNMAMALIDIR (yalniz kendi tenant'imizi hedefler).
          const bl = (st.isolationBaseline.protectedTenants || []).find((x) => x.slug === bySlug);
          const now = {
            user: await prisma.user.count({ where: { tenantId: by.id } }),
            lawyer: await prisma.lawyer.count({ where: { tenantId: by.id } }),
            staff: await prisma.staffMember.count({ where: { tenantId: by.id } }),
            office: await prisma.office.count({ where: { tenantId: by.id } }),
            audit: await prisma.auditLog.count({ where: { tenantId: by.id } }),
          };
          const activeUsers = await prisma.user.count({ where: { tenantId: by.id, isActive: true } });
          const reportingLines = await prisma.reportingLine.count({ where: { tenantId: by.id } });
          if (!bl) {
            R.unmeasured('T-3', 'seyirci tenant dokunulmazligi', 'kurulum baseline\'inda seyirci satiri YOK');
          } else {
            const drift = Object.keys(now).filter((k) => now[k] !== bl[k]);
            R.ok('T-3', 'seyirci tenant kurulumdan beri DEGISMEDI (kabul kapsami DISI)',
              drift.length === 0 && activeUsers === now.user && reportingLines === 0,
              drift.length
                ? `DEGISEN: ${drift.map((k) => `${k} ${bl[k]}->${now[k]}`).join(', ')}`
                : `fark yok · aktif kullanici ${activeUsers}/${now.user} (revoke DOKUNMADI) · reportingLine ${reportingLines}`);
          }
        }
      } catch (e) {
        R.unmeasured('T-3', 'seyirci tenant dokunulmazligi', e.message);
      }
    } else if (MODE === 'purge') {
      L.step('T-P', 'sentetik tenant ve satirlari SILINIYOR (yalniz disposable)');
      await prisma.tenant.delete({ where: { id: st.tenantId } });
      const left = await prisma.tenant.count({ where: { id: st.tenantId } });
      R.ok('T-P', 'sentetik tenant silindi', left === 0, `kalan: ${left}`);
    } else {
      throw new Error(`bilinmeyen OW_TEARDOWN_MODE='${MODE}'`);
    }

    const sum = R.summary();
    const verdict = sum.fail === 0 && sum.unmeasured === 0
      ? 'KAPANIS DOGRULANDI'
      : 'KAPANIS DOGRULANAMADI';
    console.log(JSON.stringify({
      record: 'OFFICE-TEARDOWN', mode: MODE, environment: ENVIRONMENT,
      runId: st.runId, tenant: st.slug, inventory: inv, verdict,
      pass: sum.pass, fail: sum.fail, unmeasured: sum.unmeasured,
    }, null, 1));
    process.exitCode = (sum.fail === 0 && sum.unmeasured === 0) ? 0 : 3;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nKAPANIS HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
