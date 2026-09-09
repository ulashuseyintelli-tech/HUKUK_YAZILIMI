/*
 * OFFICE YAZMA KABUL — A-04: AVUKAT + PERSONEL YAZMA (S-09/S-10)
 *
 * A-02 §4 olcutu:
 *   create 2xx · **DTO disi alan reddi**: uyapToken / eSignatureSerial / tenantId / officeId
 *   gonderimi 4xx (F-B01-05 siniri) · update'te kimlik/iliski/nested reddi 4xx (#2511) ·
 *   **ayni-boolean `isActive` KABUL EDILIR ama YAZILMAZ**; gercek gecis ve gecersiz tip
 *   REDDEDILIR · delete sonrasi eski form ile yeniden etkinlestirme IMKANSIZ.
 *
 * NOT (olcum tabani): bu prova GUNCEL main'den derlenmis uygulamaya kosar; F-B01-05 siniri
 * (#2555 `fa1e3bb2`) BU AGACTA MEVCUTTUR. Canli A-04 ise A-01 cutover'ina baglidir —
 * RELEASE20'de bu sinir YOKTUR. Prova bu ayrimi DEGISTIRMEZ, yalniz sinirin kodda
 * gercekten calistigini kanitlar.
 *
 * Net etki: olusturulan avukat ve personel AYNI adimda silinir (net 0).
 */
'use strict';
const L = require('./ow-lib');

const CREDENTIAL_FIELDS = ['uyapToken', 'eSignatureSerial', 'uyapUsername'];
const SERVER_OWNED_FIELDS = ['tenantId', 'officeId', 'id', 'userId', 'createdAt', 'updatedAt'];

(async () => {
  L.assertRunEnvironment();
  const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
  const st = L.loadState();
  L.assertOwnSlug(st.slug);
  const prisma = L.loadPrisma();
  const R = L.makeRecorder('A-04 (avukat + personel yazma kabulu)');

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    const { admin: token, staff: staffToken } = await L.resolveTokens(base, st);

    // ───────────────────────── S-09 AVUKAT ─────────────────────────
    L.step('S-09', 'POST /lawyers — mesru create');
    const okCreate = await L.httpJson('POST', `${base}/lawyers`, {
      token, body: { name: 'Kabul', surname: `Yeni-${st.runId.slice(0, 4)}`, title: 'Av.' },
    });
    R.ok('S-09.create', 'yetkili create 2xx', okCreate.status >= 200 && okCreate.status < 300, `HTTP ${okCreate.status}`);
    let newLawyerId = okCreate.body && (okCreate.body.id || (okCreate.body.data && okCreate.body.data.id));
    if (!newLawyerId) {
      const row = await prisma.lawyer.findFirst({
        where: { tenantId: st.tenantId, surname: `Yeni-${st.runId.slice(0, 4)}` }, select: { id: true },
      }).catch(() => null);
      newLawyerId = row && row.id;
    }

    // ── DTO DISI ALAN REDDI (F-B01-05 siniri) ──
    L.step('S-09-DTO', 'DTO disi alan reddi — credential + sunucu denetimli alanlar');
    for (const f of CREDENTIAL_FIELDS) {
      const r = await L.httpJson('POST', `${base}/lawyers`, {
        token, body: { name: 'Kabul', surname: `Red-${f}`, [f]: 'ENJEKTE-EDILEN-DEGER' },
      });
      const rejected = r.status >= 400 && r.status < 500;
      R.ok(`S-09.dto.${f}`, `credential alani ${f} 4xx ile REDDEDILIR`, rejected, `HTTP ${r.status}`);
      if (!rejected) {
        // Kabul edildiyse: gercekten yazildi mi? (fail-closed kanit)
        const leaked = await prisma.lawyer.count({ where: { tenantId: st.tenantId, [f]: 'ENJEKTE-EDILEN-DEGER' } }).catch(() => 'SAYILAMADI');
        R.ok(`S-09.dto.${f}.persist`, `${f} DB'ye yazilmadi`, leaked === 0, `eslesen satir: ${leaked}`);
      }
    }
    for (const f of ['tenantId', 'officeId']) {
      const r = await L.httpJson('POST', `${base}/lawyers`, {
        token, body: { name: 'Kabul', surname: `Red-${f}`, [f]: 'enjekte-edilen-id' },
      });
      R.ok(`S-09.dto.${f}`, `sunucu denetimli alan ${f} 4xx ile REDDEDILIR`,
        r.status >= 400 && r.status < 500, `HTTP ${r.status}`);
    }

    // ── UPDATE: kimlik/iliski/nested reddi (#2511) ──
    if (!newLawyerId) {
      R.unmeasured('S-09.update', 'avukat update olcumu', 'olusturulan avukatin id\'si bulunamadi');
    } else {
      L.step('S-09-UPD', 'PUT /lawyers/:id — kimlik/iliski/nested reddi');
      for (const f of SERVER_OWNED_FIELDS) {
        const r = await L.httpJson('PUT', `${base}/lawyers/${newLawyerId}`, {
          token, body: { name: 'Kabul', surname: 'Yeni', [f]: 'enjekte' },
        });
        R.ok(`S-09.upd.${f}`, `update'te ${f} 4xx ile REDDEDILIR`,
          r.status >= 400 && r.status < 500, `HTTP ${r.status}`);
      }
      // nested Prisma write input
      const nested = await L.httpJson('PUT', `${base}/lawyers/${newLawyerId}`, {
        token, body: { name: 'Kabul', surname: 'Yeni', office: { connect: { id: st.officeId } } },
      });
      R.ok('S-09.upd.nested', 'nested Prisma write input 4xx ile REDDEDILIR',
        nested.status >= 400 && nested.status < 500, `HTTP ${nested.status}`);

      // ── AYNI-BOOLEAN isActive: KABUL EDILIR ama YAZILMAZ ──
      L.step('S-09-ACT', 'isActive semantigi');
      const beforeAct = await prisma.lawyer.findUniqueOrThrow({ where: { id: newLawyerId }, select: { isActive: true } });
      const same = await L.httpJson('PUT', `${base}/lawyers/${newLawyerId}`, {
        token, body: { name: 'Kabul', surname: 'Yeni', isActive: beforeAct.isActive },
      });
      const afterSame = await prisma.lawyer.findUniqueOrThrow({ where: { id: newLawyerId }, select: { isActive: true } });
      R.ok('S-09.act.same', 'ayni-boolean isActive KABUL EDILIR (2xx) ve deger DEGISMEZ',
        same.status >= 200 && same.status < 300 && afterSame.isActive === beforeAct.isActive,
        `HTTP ${same.status} · isActive ${beforeAct.isActive} -> ${afterSame.isActive}`);

      const flip = await L.httpJson('PUT', `${base}/lawyers/${newLawyerId}`, {
        token, body: { name: 'Kabul', surname: 'Yeni', isActive: !beforeAct.isActive },
      });
      const afterFlip = await prisma.lawyer.findUniqueOrThrow({ where: { id: newLawyerId }, select: { isActive: true } });
      R.ok('S-09.act.flip', 'GERCEK gecis REDDEDILIR (4xx) ve deger DEGISMEZ',
        flip.status >= 400 && flip.status < 500 && afterFlip.isActive === beforeAct.isActive,
        `HTTP ${flip.status} · isActive ${beforeAct.isActive} -> ${afterFlip.isActive}`);

      const badType = await L.httpJson('PUT', `${base}/lawyers/${newLawyerId}`, {
        token, body: { name: 'Kabul', surname: 'Yeni', isActive: 'evet' },
      });
      R.ok('S-09.act.type', 'gecersiz tip REDDEDILIR', badType.status >= 400 && badType.status < 500, `HTTP ${badType.status}`);

      // ── DELETE + eski form ile yeniden etkinlestirme IMKANSIZ ──
      L.step('S-09-DEL', 'DELETE /lawyers/:id ve yeniden etkinlestirme denemesi');
      const del = await L.httpJson('DELETE', `${base}/lawyers/${newLawyerId}`, { token });
      R.ok('S-09.del', 'delete 2xx (pasiflestirme)', del.status >= 200 && del.status < 300, `HTTP ${del.status}`);
      const afterDel = await prisma.lawyer.findUnique({ where: { id: newLawyerId }, select: { isActive: true } });
      R.ok('S-09.del.state', 'silinen avukat PASIF', afterDel && afterDel.isActive === false,
        `isActive=${afterDel && afterDel.isActive}`);
      const reactivate = await L.httpJson('PUT', `${base}/lawyers/${newLawyerId}`, {
        token, body: { name: 'Kabul', surname: 'Yeni', isActive: true },
      });
      const afterRe = await prisma.lawyer.findUnique({ where: { id: newLawyerId }, select: { isActive: true } });
      R.ok('S-09.del.reactivate', 'eski form ile yeniden etkinlestirme IMKANSIZ',
        (reactivate.status >= 400 && reactivate.status < 500) && afterRe && afterRe.isActive === false,
        `HTTP ${reactivate.status} · isActive=${afterRe && afterRe.isActive}`);
    }

    // ───────────────────────── S-10 PERSONEL ─────────────────────────
    L.step('S-10', 'POST /staff — mesru create + DTO disi alan reddi');
    const staffCreate = await L.httpJson('POST', `${base}/staff`, {
      token, body: { firstName: 'Kabul', lastName: `Personel-${st.runId.slice(0, 4)}`, staffType: 'SEKRETER' },
    });
    R.ok('S-10.create', 'yetkili create 2xx', staffCreate.status >= 200 && staffCreate.status < 300, `HTTP ${staffCreate.status}`);
    let newStaffId = staffCreate.body && (staffCreate.body.id || (staffCreate.body.data && staffCreate.body.data.id));
    if (!newStaffId) {
      const row = await prisma.staffMember.findFirst({
        where: { tenantId: st.tenantId, lastName: `Personel-${st.runId.slice(0, 4)}` }, select: { id: true },
      }).catch(() => null);
      newStaffId = row && row.id;
    }
    const hack = await L.httpJson('POST', `${base}/staff`, {
      token, body: { firstName: 'Kabul', lastName: 'Red', staffType: 'SEKRETER', hackField: 1 },
    });
    R.ok('S-10.dto.unknown', 'taninmayan anahtar 4xx ile REDDEDILIR (forbidNonWhitelisted)',
      hack.status >= 400 && hack.status < 500, `HTTP ${hack.status}`);
    const badStaffType = await L.httpJson('POST', `${base}/staff`, {
      token, body: { firstName: 'Kabul', lastName: 'Red', staffType: 'OLMAYAN_TUR' },
    });
    R.ok('S-10.dto.enum', 'gecersiz enum 4xx ile REDDEDILIR',
      badStaffType.status >= 400 && badStaffType.status < 500, `HTTP ${badStaffType.status}`);

    // ── personel kimligi (F01 negatif) yazma uclarinda 403 ──
    L.step('S-10-NEG', 'staffMember bagli aktor yazma uclarinda 403');
    const negLawyer = await L.httpJson('POST', `${base}/lawyers`, {
      token: staffToken, body: { name: 'X', surname: 'Y' },
    });
    R.ok('S-10.neg.lawyer', 'personel aktor POST /lawyers -> 403',
      negLawyer.status === 403, `HTTP ${negLawyer.status}`);
    const negStaff = await L.httpJson('POST', `${base}/staff`, {
      token: staffToken, body: { firstName: 'X', lastName: 'Y', staffType: 'SEKRETER' },
    });
    R.ok('S-10.neg.staff', 'personel aktor POST /staff -> 403', negStaff.status === 403, `HTTP ${negStaff.status}`);

    // ── anonim 401 ──
    const anonL = await L.httpJson('POST', `${base}/lawyers`, { body: { name: 'X', surname: 'Y' } });
    R.ok('S-09.401', 'anonim POST /lawyers -> 401', anonL.status === 401, `HTTP ${anonL.status}`);
    const anonS = await L.httpJson('POST', `${base}/staff`, { body: { firstName: 'X', lastName: 'Y', staffType: 'SEKRETER' } });
    R.ok('S-10.401', 'anonim POST /staff -> 401', anonS.status === 401, `HTTP ${anonS.status}`);

    // ── NET 0: olusturulan personel silinir ──
    if (newStaffId) {
      const delS = await L.httpJson('DELETE', `${base}/staff/${newStaffId}`, { token });
      R.ok('S-10.del', 'personel delete 2xx (net 0)', delS.status >= 200 && delS.status < 300, `HTTP ${delS.status}`);
    } else {
      R.unmeasured('S-10.del', 'personel silme', 'olusturulan personelin id\'si bulunamadi');
    }

    const sum = R.summary();
    console.log(JSON.stringify({ record: 'OFFICE-A-04', runId: st.runId, tenant: st.slug, ...sum, results: undefined }, null, 1));
    process.exitCode = (sum.fail === 0 && sum.unmeasured === 0) ? 0 : 3;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nA-04 HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
