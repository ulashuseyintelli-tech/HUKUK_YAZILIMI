/*
 * OFFICE YAZMA KABUL — A-05: PERSONEL OKUMA (S-10 kendi roluyle liste/detay)
 *
 * A-02 §4 olcutu:
 *   Yetkili 200 + LISTE MASKELEME KURALI uygulaniyor · `staffMember` bagli aktor yazma
 *   uclarinda 403 · anonim 401.  Yazma: YOK.
 *
 * MASKELEME OLCUMU IDDIA DEGIL KANITTIR: kurulumda personelin `tckn` alani BILINEN bir
 * sentetik degerle yazilir; HTTP yanitinda o HAM degerin BULUNMADIGI ve maskeli bicimin
 * bulundugu ayri ayri olculur. (Yalniz "maskeli gorunuyor" demek yeterli degildir.)
 */
'use strict';
const L = require('./ow-lib');

const RAW_TCKN = '11111111110'; // ow-01-setup.js'te yazilan sentetik deger

(async () => {
  L.assertDisposableEnvironment();
  const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
  const st = L.loadState();
  L.assertOwnSlug(st.slug);
  const prisma = L.loadPrisma();
  const R = L.makeRecorder('A-05 (personel okuma kabulu)');

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    const { admin: token, staff: staffToken } = await L.resolveTokens(base, st);

    // DB'deki ham degeri once DOGRULA — maskeleme iddiasi ancak ham deger VARSA anlamlidir.
    const dbRow = await prisma.staffMember.findUnique({
      where: { id: st.staffMemberId }, select: { tckn: true },
    }).catch(() => null);
    if (!dbRow) {
      R.unmeasured('A-05.pre', 'maskeleme on kosulu', 'personel satiri DB\'den okunamadi');
    } else {
      R.ok('A-05.pre', 'DB\'de HAM tckn mevcut (maskeleme olcumu anlamli)', dbRow.tckn === RAW_TCKN,
        `db.tckn=${dbRow.tckn}`);
    }

    // ── LISTE ──
    L.step('A-05-L', 'GET /staff (yetkili)');
    const list = await L.httpJson('GET', `${base}/staff`, { token });
    R.ok('A-05.list.200', 'yetkili liste 200', list.status === 200, `HTTP ${list.status}`);
    const listRaw = JSON.stringify(list.body || {});
    R.ok('A-05.list.mask', 'listede HAM tckn YOK', !listRaw.includes(RAW_TCKN),
      listRaw.includes(RAW_TCKN) ? 'HAM DEGER SIZDI' : 'ham deger yok');
    const maskedSeen = /\d{3}\*{4}\d{2}/.test(listRaw);
    R.ok('A-05.list.maskform', 'listede MASKELI bicim var (alan dusurulmemis)', maskedSeen,
      maskedSeen ? 'maskeli bicim gorundu' : 'maskeli bicim BULUNAMADI');

    // ── DETAY ──
    L.step('A-05-D', 'GET /staff/:id (yetkili)');
    const detail = await L.httpJson('GET', `${base}/staff/${st.staffMemberId}`, { token });
    R.ok('A-05.detail.200', 'yetkili detay 200', detail.status === 200, `HTTP ${detail.status}`);
    const detailRaw = JSON.stringify(detail.body || {});
    R.ok('A-05.detail.mask', 'detayda HAM tckn YOK (F-B03-02 siniri)', !detailRaw.includes(RAW_TCKN),
      detailRaw.includes(RAW_TCKN) ? 'HAM DEGER SIZDI' : 'ham deger yok');

    // ── PERSONEL AKTOR kendi rolüyle okuma ──
    L.step('A-05-S', 'personel aktor okuma + yazma sinirlari');
    const staffList = await L.httpJson('GET', `${base}/staff`, { token: staffToken });
    R.ok('A-05.staff.read', 'personel aktor liste okuyabilir (200) — okuma yasak DEGIL',
      staffList.status === 200, `HTTP ${staffList.status}`);
    const staffListRaw = JSON.stringify(staffList.body || {});
    R.ok('A-05.staff.mask', 'personel aktorun okumasinda da HAM tckn YOK',
      !staffListRaw.includes(RAW_TCKN), staffListRaw.includes(RAW_TCKN) ? 'HAM DEGER SIZDI' : 'ham deger yok');

    const staffWrite = await L.httpJson('PUT', `${base}/staff/${st.staffMemberId}`, {
      token: staffToken, body: { firstName: 'Degistirilmis' },
    });
    R.ok('A-05.staff.write403', 'personel aktor yazma ucunda 403', staffWrite.status === 403, `HTTP ${staffWrite.status}`);

    // ── ANONIM ──
    const anonList = await L.httpJson('GET', `${base}/staff`);
    R.ok('A-05.anon.list', 'anonim liste 401', anonList.status === 401, `HTTP ${anonList.status}`);
    const anonDetail = await L.httpJson('GET', `${base}/staff/${st.staffMemberId}`);
    R.ok('A-05.anon.detail', 'anonim detay 401', anonDetail.status === 401, `HTTP ${anonDetail.status}`);

    // ── YAZMA YOK: adim boyunca personel satiri DEGISMEDI ──
    const after = await prisma.staffMember.findUnique({
      where: { id: st.staffMemberId }, select: { firstName: true, tckn: true },
    }).catch(() => null);
    if (!after) R.unmeasured('A-05.nowrite', 'yazma yoklugu', 'personel satiri okunamadi');
    else R.ok('A-05.nowrite', 'A-05 boyunca personel satiri DEGISMEDI',
      after.firstName === 'Kabul' && after.tckn === RAW_TCKN,
      `firstName=${after.firstName} · tckn=${after.tckn}`);

    const sum = R.summary();
    console.log(JSON.stringify({ record: 'OFFICE-A-05', runId: st.runId, tenant: st.slug, ...sum, results: undefined }, null, 1));
    process.exitCode = (sum.fail === 0 && sum.unmeasured === 0) ? 0 : 3;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nA-05 HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
