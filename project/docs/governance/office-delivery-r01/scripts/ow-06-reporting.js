/*
 * OFFICE YAZMA KABUL — A-06: RAPORLAMA HATTI (S-11)
 *
 * A-02 §4 olcutu:
 *   ADMIN 200 (`list` / `eligible` / `reconciliation`) · ADMIN-disi 403 · anonim 401 ·
 *   `assign`/`end`/`top-level` YALNIZ `off-acc` icinde · FOUNDER kimligi ReportingLine'dan
 *   BAGIMSIZ (D-WR-6).  Uretilen: 1 `ReportingLine` (assign -> end, KAYIT KORUNUR).
 *
 * SEMA OLCUMU (A-02 §3 ile fark — raporlandi): `ReportingLine` `actorUserId`/`managerUserId`
 * ile KULLANICI baglar, avukat DEGIL. Bu yuzden hat, kurulumun IKI kullanicisiyla kurulur
 * (ast = personel User, amir = ADMIN User); A-02 §3'un "7. satir: ikinci avukat" tarifi
 * A-06 icin GECERSIZDIR (o satir A-04'un order/update yolunda kullanilir).
 */
'use strict';
const L = require('./ow-lib');

(async () => {
  L.assertRunEnvironment();
  const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
  const st = L.loadState();
  L.assertOwnSlug(st.slug);
  const prisma = L.loadPrisma();
  const R = L.makeRecorder('A-06 (raporlama hatti kabulu)');

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    const { admin: token, staff: staffToken } = await L.resolveTokens(base, st);

    // ── OKUMA UCLARI ──
    L.step('A-06-R', 'ADMIN 200 · ADMIN-disi 403 · anonim 401');
    for (const p of ['', '/eligible', '/reconciliation']) {
      const okr = await L.httpJson('GET', `${base}/reporting-lines${p}`, { token });
      R.ok(`A-06.get${p || '/list'}.200`, `ADMIN GET ${p || '(list)'} 200`, okr.status === 200, `HTTP ${okr.status}`);
      const den = await L.httpJson('GET', `${base}/reporting-lines${p}`, { token: staffToken });
      R.ok(`A-06.get${p || '/list'}.403`, `ADMIN-disi GET ${p || '(list)'} 403`, den.status === 403, `HTTP ${den.status}`);
      const anon = await L.httpJson('GET', `${base}/reporting-lines${p}`);
      R.ok(`A-06.get${p || '/list'}.401`, `anonim GET ${p || '(list)'} 401`, anon.status === 401, `HTTP ${anon.status}`);
    }

    // ── ASSIGN (ast = personel User, amir = ADMIN User) ──
    L.step('A-06-A', 'POST /reporting-lines/assign');
    const assign = await L.httpJson('POST', `${base}/reporting-lines/assign`, {
      token, body: { actorUserId: st.staffUserId, managerUserId: st.adminUserId },
    });
    R.ok('A-06.assign.2xx', 'ADMIN assign 2xx', assign.status >= 200 && assign.status < 300, `HTTP ${assign.status}`);

    const line = await prisma.reportingLine.findFirst({
      where: { tenantId: st.tenantId, actorUserId: st.staffUserId },
      select: { id: true, managerUserId: true, disposition: true, validUntil: true },
    }).catch(() => null);
    if (!line) {
      R.unmeasured('A-06.assign.row', 'ReportingLine satiri', 'satir DB\'den okunamadi');
    } else {
      R.ok('A-06.assign.row', 'ReportingLine satiri KENDI tenant\'imizda ve dogru',
        line.managerUserId === st.adminUserId && line.disposition === 'MANAGED',
        `manager=${line.managerUserId === st.adminUserId} · disposition=${line.disposition}`);
    }

    // ── ADMIN-disi assign REDDEDILIR ──
    const denyAssign = await L.httpJson('POST', `${base}/reporting-lines/assign`, {
      token: staffToken, body: { actorUserId: st.staffUserId, managerUserId: st.adminUserId },
    });
    R.ok('A-06.assign.403', 'ADMIN-disi assign 403', denyAssign.status === 403, `HTTP ${denyAssign.status}`);

    // ── self-manager yasagi (mevcut urun kurali) ──
    const self = await L.httpJson('POST', `${base}/reporting-lines/assign`, {
      token, body: { actorUserId: st.adminUserId, managerUserId: st.adminUserId },
    });
    R.ok('A-06.assign.self', 'self-manager 4xx ile REDDEDILIR', self.status >= 400 && self.status < 500, `HTTP ${self.status}`);

    // ── TENANT SINIRI: baska tenant'in kullanicisi hedeflenemez ──
    L.step('A-06-T', 'tenant siniri — yabanci actorUserId');
    const foreignUser = await prisma.user.findFirst({
      where: { tenantId: { not: st.tenantId } }, select: { id: true },
    }).catch(() => null);
    if (!foreignUser) {
      // Bos gozlem kumesi PASS SAYILMAZ (A-02 §7).
      R.unmeasured('A-06.tenant', 'yabanci tenant kullanicisiyla assign', 'baska tenant\'ta kullanici YOK — olcum yapilamadi');
    } else {
      const cross = await L.httpJson('POST', `${base}/reporting-lines/assign`, {
        token, body: { actorUserId: foreignUser.id, managerUserId: st.adminUserId },
      });
      const wrote = await prisma.reportingLine.count({ where: { actorUserId: foreignUser.id } }).catch(() => 'SAYILAMADI');
      R.ok('A-06.tenant', 'yabanci tenant kullanicisi REDDEDILIR ve satir YAZILMAZ',
        cross.status >= 400 && cross.status < 500 && wrote === 0,
        `HTTP ${cross.status} · yazilan satir: ${wrote}`);
    }

    // ── END: hat kapatilir ama KAYIT KORUNUR ──
    L.step('A-06-E', 'POST /reporting-lines/end — kayit KORUNUR');
    const end = await L.httpJson('POST', `${base}/reporting-lines/end`, {
      token, body: { actorUserId: st.staffUserId },
    });
    R.ok('A-06.end.2xx', 'ADMIN end 2xx', end.status >= 200 && end.status < 300, `HTTP ${end.status}`);
    const afterEnd = await prisma.reportingLine.count({ where: { tenantId: st.tenantId, actorUserId: st.staffUserId } }).catch(() => 'SAYILAMADI');
    if (afterEnd === 'SAYILAMADI') R.unmeasured('A-06.end.preserve', 'kayit korunmasi', 'sayim yapilamadi');
    else R.ok('A-06.end.preserve', 'end sonrasi ReportingLine kaydi KORUNUR (silinmez)', afterEnd >= 1, `kalan satir: ${afterEnd}`);

    // ── D-WR-6: FOUNDER kimligi ReportingLine'dan BAGIMSIZ ──
    L.step('A-06-F', 'D-WR-6 — FOUNDER kimligi ReportingLine\'dan bagimsiz');
    const founderCols = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ReportingLine' AND lower(column_name) LIKE '%founder%'`,
    ).catch(() => null);
    if (founderCols === null) {
      R.unmeasured('A-06.dwr6', 'FOUNDER bagimsizligi', 'sema sorgusu yapilamadi');
    } else {
      R.ok('A-06.dwr6', 'ReportingLine semasinda FOUNDER alani YOK (kimlik bagimsiz)',
        founderCols.length === 0, `eslesen kolon: ${founderCols.length}`);
    }

    const sum = R.summary();
    console.log(JSON.stringify({ record: 'OFFICE-A-06', runId: st.runId, tenant: st.slug, ...sum, results: undefined }, null, 1));
    process.exitCode = (sum.fail === 0 && sum.unmeasured === 0) ? 0 : 3;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nA-06 HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
